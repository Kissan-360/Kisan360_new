const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const marketCache = require('../services/marketCache');
const priceHistory = require('../services/priceHistory');
const actionability = require('../services/actionability');
const { runRefreshPipeline, getHealth } = require('../services/scheduler');
const { authenticateUser } = require('../middleware/auth');
const perishability = require('../services/cropPerishability');
const logger = require('../utils/logger');

const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');

const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';

// Shared engine-compose: best-known prices → dedupe → deterministic calculator.
// Used by every economics route so all of them consume the SAME ranked mandis
// (single source of truth for net realization) rather than re-deriving it.
async function composeEngineResult({ crop, district, quantity }) {
  const priceResult = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
  if (priceResult.rows.length === 0) {
    return { error: `No mandi prices available for crop "${crop}" right now (live pull failed and cache has no rows).`, marketSource: priceResult.source, provenance: priceResult.provenance };
  }
  const deduped = priceResult.rows
    .slice()
    .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
    .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);
  const prices = deduped.map(r => ({
    market: r.market,
    variety: r.variety,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
    modalPrice: r.modalPrice,
    arrivalDate: r.arrivalDate,
    district: r.district,
    source: priceResult.provenance.source,
    retrievedAt: priceResult.provenance.retrievedAt,
  }));
  const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
    crop, district, quantity, prices,
  }, { timeout: 15000 });
  const engine = mlRes.data;
  if (!engine || engine.success === false) {
    return { error: engine?.error || 'Calculator rejected the request', marketSource: priceResult.source };
  }
  return { engine, priceResult };
}

// Quantity parsing shared by the economics routes: 400 on non-positive or
// non-numeric input (never silently default an explicitly invalid quantity).
function requireQuantity(raw) {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'quantity must be a positive number' };
  }
  return { ok: true, value: n };
}

// Bounded, coercible query params for every market route: strings capped,
// numbers clamped. Prevents absurd pagination, oversized filters and NaN
// leakage into the calculator without adding a validation framework.
function boundedQuery(req) {
  const cap = (v, n) => (v == null ? undefined : String(v).slice(0, n));
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 10000);
  return {
    crop: cap(req.query.crop, 60),
    state: cap(req.query.state, 60),
    market: cap(req.query.market, 80),
    search: cap(req.query.search, 80),
    limit,
    offset,
  };
}

marketCache.loadSeed();
// Load existing price history from disk on boot so the trend endpoint and
// ingestion-health report are immediately truthful (without waiting for the
// first scheduler refresh).
priceHistory.loadHistory();

// GET /api/market/prices — Live AGMARKNET mandi prices with a cached fallback.
// Provenance metadata on the response tells the client exactly where each
// number came from and how fresh it is.
router.get('/prices', async (req, res) => {
  try {
    const { crop, state, market, search, limit, offset } = boundedQuery(req);
    const result = await marketCache.getBestPrices({ crop, state, market, search, limit, offset });
    res.json({
      success: true,
      count: result.rows.length,
      prices: result.rows,
      source: result.source,
      fallback: result.fallback,
      provenance: result.provenance,
    });
  } catch (error) {
    console.error('Market price error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch market prices' });
  }
});

// GET /api/market/cache-status — visibility into the fallback store (demo tooling)
router.get('/cache-status', (req, res) => {
  res.json({ success: true, ...marketCache.cacheSummary() });
});

// GET /api/market/ingestion-health — operational visibility into the refresh pipeline
router.get('/ingestion-health', (req, res) => {
  const health = getHealth();
  const cache = marketCache.cacheSummary();
  const historySummary = priceHistory.getHistorySummary();
  res.json({
    success: true,
    ingestion: health,
    cache: {
      snapshotRows: cache.snapshotRows,
      snapshotRetrievedAt: cache.snapshotRetrievedAt,
      liveFresh: cache.liveFresh,
      liveRetrievedAt: cache.liveRetrievedAt,
    },
    history: historySummary,
    schedule: {
      expression: '0 9 * * *',
      timezone: 'Asia/Kolkata',
      note: 'Daily refresh at 09:00 IST. Manual refresh via POST /api/market/refresh.',
    },
  });
});

// POST /api/market/refresh — manual refresh for admin/emergency recovery.
// Gated: it burns the AGMARKNET quota and rewrites the shared snapshot, so it
// must not be an open internet endpoint.
router.post('/refresh', authenticateUser, async (req, res) => {
  try {
    if (!['buyer', 'fpo', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only an operator/buyer-side login can trigger a market refresh' });
    }
    const { dryRun, limit } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);
    const result = await runRefreshPipeline({
      dryRun: dryRun === 'true',
      limit: parsedLimit,
    });
    if (result.success) {
      res.json({ success: true, message: 'Refresh completed', ...result });
    } else {
      res.status(502).json({ success: false, error: result.error, ...result });
    }
  } catch (err) {
    logger.error('Manual refresh error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/net-realization — headline P0 feature.
// Node pulls the best-known mandi prices for the crop (live → cached snapshot,
// provenance attached), then asks the deterministic FastAPI calculator
// (ml-service/net_realization.py, :8002) to rank mandis by farmer net.
router.get('/net-realization', async (req, res) => {
  try {
    const { crop, district, quantity } = req.query;
    if (!crop || !district) {
      return res.status(400).json({
        success: false,
        error: 'crop and district query params are required (e.g. crop=Onion&district=Nashik&quantity=10)',
      });
    }
    const rawQty = parseFloat(quantity);
    if (quantity !== undefined && (!Number.isFinite(rawQty) || rawQty <= 0)) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
    }
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;

    const priceResult = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
    if (priceResult.rows.length === 0) {
      return res.status(422).json({
        success: false,
        error: `No mandi prices available for crop "${crop}" right now (live pull failed and cache has no rows).`,
        marketSource: priceResult.source,
        provenance: priceResult.provenance,
      });
    }

    // Dedupe repeated markets (e.g. two 'APMC Nagpur' rows) keeping the best quote.
    const deduped = priceResult.rows
      .slice()
      .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
      .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);

    const prices = deduped.map(r => ({
      market: r.market,
      variety: r.variety,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      modalPrice: r.modalPrice,
      arrivalDate: r.arrivalDate,
      district: r.district,
      source: priceResult.provenance.source,
      retrievedAt: priceResult.provenance.retrievedAt,
    }));

    const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
      crop,
      district,
      quantity: qty,
      prices,
    }, { timeout: 15000 });

    const data = mlRes.data;
    if (data && data.success === false) {
      return res.status(422).json({ success: false, error: data.error || 'Calculator rejected the request', marketSource: priceResult.source });
    }

    res.json({
      success: true,
      marketSource: priceResult.source,
      marketFallback: priceResult.fallback,
      marketProvenance: priceResult.provenance,
      servingMode: priceResult.servingMode || (priceResult.fallback ? 'FALLBACK' : 'LIVE'),
      ...data,
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logger.warn('Net-realization service offline');
      return res.status(503).json({
        success: false,
        error: 'Net-realization service unavailable',
        serviceStatus: 'offline',
        message: 'Start the calculator: cd ml-service && python -m uvicorn net_realization:app --port 8002',
      });
    }
    if (error.response) {
      return res.status(502).json({ success: false, error: 'Net-realization service error', details: error.response.data?.detail || error.response.data?.error || error.message });
    }
    logger.error('Net-realization error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute net realization', details: error.message });
  }
});

// GET /api/market/trend?crop=Onion&market=APMC%20Lasalgaon&window=7|14|30
// Localized observed-price trend (P1). Describes the past only — no
// forecasting ML, per the HLD. History is accumulated by the daily refresher.
router.get('/trend', (req, res) => {
  try {
    const { crop, market, window } = req.query;
    if (!crop || !market) {
      return res.status(400).json({ success: false, error: 'crop and market query params are required (e.g. crop=Onion&market=APMC Lasalgaon&window=7)' });
    }
    const win = [7, 14, 30].includes(parseInt(window, 10)) ? parseInt(window, 10) : 7;
    const history = priceHistory.loadHistory();
    const series = priceHistory.trendSeries(history.days, { crop, market, window: win });

    // Include today's best quote even if the refresher hasn't appended yet,
    // so the freshest observation is always visible.
    const todayRows = marketCache.getPrices({ crop, market, limit: 500 });
    const days = priceHistory.appendRows(history.days, todayRows.rows, { retrievedAt: todayRows.retrievedAt });
    const full = priceHistory.trendSeries(days, { crop, market, window: win });

    res.json({
      success: true,
      crop,
      market,
      windowDays: win,
      observations: full.length,
      series: full,
      description: priceHistory.describeDelta(full),
      forecasting: false,
      note: 'Observed AGMARKNET modal prices only. Kisan360 does not predict prices.',
    });
  } catch (error) {
    console.error('Trend error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to build trend' });
  }
});

// GET /api/market/net-realization/assumptions — documented cost assumptions
router.get('/net-realization/assumptions', async (req, res) => {
  try {
    const mlRes = await axios.get(`${NET_REALIZATION_URL}/assumptions`, { timeout: 5000 });
    res.json(mlRes.data);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    res.status(502).json({ success: false, error: 'Failed to fetch assumptions' });
  }
});

// GET /api/market/net-realization/explain?crop&district&quantity — reuses the
// exact compute path above, then asks the RAG service to RESTATE the engine's
// own output in simple language. The LLM never generates a number (P2).
router.get('/net-realization/explain', async (req, res) => {
  try {
    // Re-run the deterministic computation by calling our own route handler
    // logic via the internal service path (same as /net-realization).
    const { crop, district, quantity } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const rawQty = parseFloat(quantity);
    if (quantity !== undefined && (!Number.isFinite(rawQty) || rawQty <= 0)) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
    }
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;

    const priceResult = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
    if (priceResult.rows.length === 0) {
      return res.status(422).json({ success: false, error: `No mandi prices available for crop "${crop}" right now.` });
    }
    const deduped = priceResult.rows
      .slice()
      .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
      .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);
    const prices = deduped.map(r => ({      market: r.market,
      variety: r.variety,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      modalPrice: r.modalPrice,
      arrivalDate: r.arrivalDate,
      district: r.district,
      source: priceResult.provenance.source,
      retrievedAt: priceResult.provenance.retrievedAt,
    }));




    const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
      crop, district, quantity: qty, prices,
    }, { timeout: 15000 });
    const engine = mlRes.data;
    if (!engine || engine.success === false) {
      return res.status(422).json({ success: false, error: engine?.error || 'Calculator rejected the request' });
    }

    const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';
    const groqKey = process.env.GROQ_API_KEY || '';
    try {
      const exRes = await axios.post(`${RAG_SERVICE_URL}/explain-net-realization`,
        { netRealization: engine },
        { timeout: 20000, headers: groqKey ? { 'X-Groq-Key': groqKey } : {} });
      const ex = exRes.data;
      if (ex && ex.success) {
        return res.json({
          success: true,
          explanation: ex.explanation,
          explainedBy: ex.explainedBy,
          llmUsed: !!ex.llmUsed,
          honestyNote: 'The explanation restates numbers from the deterministic calculator output; the LLM never generates a figure.',
          engineResult: { bestMandi: engine.bestMandi, rankedCount: engine.rankedMandis.length },
        });
      }
    } catch (ragErr) {
      logger.warn('Explain service unavailable:', ragErr.message);
    }

    // RAG service offline — deterministic client-side fallback so the demo
    // never breaks. Same honesty contract.
    const best = engine.rankedMandis[0];
    const fc = best.farmerCosts;
    return res.json({
      success: true,
      explanation:
        `Selling your ${engine.crop} from ${engine.district}, the calculator ranks ${engine.rankedMandis.length} mandis by what you actually keep. ` +
        `Best option: ${best.market} at ₹${best.farmerNetPerQuintal.toLocaleString('en-IN')} per quintal net — ₹${best.farmerNetTotal.toLocaleString('en-IN')} total for your ${engine.quantityQuintals} quintals. ` +
        `Your costs there: ₹${fc.transportPerQuintal} transport for the ${best.distanceKm} km trip, ₹${fc.storagePerQuintal} storage, ₹${fc.otherPerQuintal} bagging and loading. ` +
        `Market fees and commission are charged to the buyer, not you — they are never subtracted from your net. ` +
        `All figures come from the deterministic calculator on AGMARKNET data; nothing here is invented.`,
      explainedBy: 'local_fallback',
      llmUsed: false,
      honestyNote: 'RAG service offline — deterministic fallback text. The LLM never generates a figure.',
      engineResult: { bestMandi: engine.bestMandi, rankedCount: engine.rankedMandis.length },
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    logger.error('Explain error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to explain net realization', details: error.message });
  }
});

// GET /api/market/buyer-coverage?crop=Onion&district=Nashik&quantity=10&grade=A
// Market-linkage layer: which of the costed mandis have a compatible buyer
// path in the current directory? Deterministic rules over the directory's own
// fields (crops, service-area districts, minQuantityQuintals). Economic rank
// is never changed — coverage is reported alongside it. No demand prediction.
router.get('/buyer-coverage', async (req, res) => {
  try {
    const { crop, district, quantity, grade } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const rawQty = parseFloat(quantity);
    if (quantity !== undefined && (!Number.isFinite(rawQty) || rawQty <= 0)) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
    }
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;

    // Reuse the engine path to get ranked mandis with canonicalMandi stamps.
    const priceResult = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
    if (priceResult.rows.length === 0) {
      return res.status(422).json({ success: false, error: `No mandi prices available for crop "${crop}" right now.` });
    }
    const deduped = priceResult.rows
      .slice()
      .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
      .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);
    const prices = deduped.map(r => ({      market: r.market,
      variety: r.variety,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      modalPrice: r.modalPrice,
      arrivalDate: r.arrivalDate,
      district: r.district,
      source: priceResult.provenance.source,
      retrievedAt: priceResult.provenance.retrievedAt,
    }));




    const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
      crop, district, quantity: qty, prices,
    }, { timeout: 15000 });
    const engine = mlRes.data;
    if (!engine || engine.success === false) {
      return res.status(422).json({ success: false, error: engine?.error || 'Calculator rejected the request' });
    }

    const directory = JSON.parse(fs.readFileSync(BUYERS_FILE, 'utf8'));
    const assessment = actionability.assessCoverage(engine.rankedMandis, directory.buyers || [], {
      crop,
      quantityQuintals: qty,
      qualityGrade: grade || null,
    });

    res.json({
      success: true,
      crop,
      district,
      quantityQuintals: qty,
      bestMandi: engine.bestMandi,
      ...assessment,
      dataBasis: 'Buyer coverage is computed from the static demo directory (crops, service-area districts, minimum quantity). It is a statement about the current directory, not a claim about real-world demand.',
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    logger.error('Buyer-coverage error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to assess buyer coverage', details: error.message });
  }
});

// GET /api/market/pathways?crop&district&quantity&grade&size&moisturePct&damagePct
// Complete pathway decision: SELL NOW / STORE / AGGREGATE / ALTERNATE MARKET.
// Uses the same deterministic engine, then layers buyer requirements, storage
// economics, sale-window context, and arrival intelligence on top.
router.get('/pathways', async (req, res) => {
  try {
    const { crop, district, quantity, grade, size, moisturePct, damagePct } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const rawQty = parseFloat(quantity);
    if (quantity !== undefined && (!Number.isFinite(rawQty) || rawQty <= 0)) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive number' });
    }
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;
    const quality = {
      grade: grade || null,
      size: size || null,
      moisturePct: moisturePct != null ? parseFloat(moisturePct) : null,
      damagePct: damagePct != null ? parseFloat(damagePct) : null,
    };

    // 1. Get engine result (same as /net-realization)
    const priceResult = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
    if (priceResult.rows.length === 0) {
      return res.status(422).json({ success: false, error: `No mandi prices available for crop "${crop}" right now.` });
    }
    const deduped = priceResult.rows
      .slice()
      .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
      .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);
    const prices = deduped.map(r => ({
      market: r.market, variety: r.variety, minPrice: r.minPrice, maxPrice: r.maxPrice,
      modalPrice: r.modalPrice, arrivalDate: r.arrivalDate,
      district: r.district, source: priceResult.provenance.source, retrievedAt: priceResult.provenance.retrievedAt,
    }));

    const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
      crop, district, quantity: qty, prices,
    }, { timeout: 15000 });
    const engineResult = mlRes.data;
    if (!engineResult || engineResult.success === false) {
      return res.status(422).json({ success: false, error: engineResult?.error || 'Calculator rejected the request' });
    }

    // 2. Get trend data for sale-window intelligence
    const bestMarket = engineResult.rankedMandis[0]?.market;
    let trendData = null;
    if (bestMarket) {
      try {
        const history = priceHistory.loadHistory();
        // getBestPrices (not getPrices) — same snapshot-fallback semantics as
        // every other serving path, so a partial live pull can't poison the
        // sale-window evidence with a market sliver.
        const todayRows = marketCache.getBestPrices({ crop, market: bestMarket, limit: 500 });
        const days = priceHistory.appendRows(history.days, todayRows.rows, { retrievedAt: todayRows.retrievedAt });
        const series = priceHistory.trendSeries(days, { crop, market: bestMarket, window: 7 });
        const currentQuote = todayRows.rows.find(r => r.market === bestMarket) || todayRows.rows[0];
        trendData = {
          trendSeries: series,
          currentQuote: currentQuote ? { modalPrice: currentQuote.modalPrice, arrivalDate: currentQuote.arrivalDate, source: todayRows.source, retrievedAt: todayRows.retrievedAt } : null,
          market: bestMarket,
          arrivalData: priceResult.rows,
        };
      } catch (e) {
        logger.warn('Pathway: trend data unavailable:', e.message);
      }
    }

    // 3. Compute pathways
    const { computePathways } = require('../services/pathwayDecision');
    const result = computePathways({
      crop, district, quantityQuintals: qty, quality, engineResult, trendData,
    });

    // If the decision engine could not produce a decision, return 422
    if (result.error && (!result.pathways || result.pathways.length === 0)) {
      return res.status(422).json({
        success: false,
        error: result.error,
        decisionBasis: 'INSUFFICIENT_EVIDENCE',
      });
    }

    // ── Perishability enrichment (Phase 7) ───────────────────────────────
    // Compute perishability separately — does NOT modify computePathways.
    // Only enriches STORE_THEN_SELL pathway with a warning when risk is elevated.
    const { harvestDate, storageDays: storageDaysParam } = req.query;
    const perishabilityResult = perishability.assessPerishability({
      crop,
      harvestDate: harvestDate || null,
      plannedStorageDays: storageDaysParam ? Number(storageDaysParam) : null,
    });

    // Enrich the STORE_THEN_SELL pathway if it exists and has perishability data
    if (perishabilityResult.shelfLife && result.pathways) {
      const storePathway = result.pathways.find(p => p.pathway === 'STORE_THEN_SELL' && p.available !== false);
      if (storePathway) {
        // Add perishability context to the pathway
        storePathway.perishability = {
          crop: perishabilityResult.crop,
          shelfLife: perishabilityResult.shelfLife,
          daysSinceHarvest: perishabilityResult.daysSinceHarvest,
          plannedStorageDays: perishabilityResult.plannedStorageDays,
          riskLevel: perishabilityResult.riskLevel,
          riskReason: perishabilityResult.riskReason,
          guidance: perishabilityResult.guidance,
          provenance: perishabilityResult.provenance,
          classification: perishabilityResult.classification,
        };

        // Add warning to the pathway's why[] and evidence[] if risk is elevated
        if (['HIGH', 'CRITICAL'].includes(perishabilityResult.riskLevel)) {
          storePathway.why.push(
            `Perishability warning: ${perishabilityResult.riskReason}`
          );
          storePathway.evidence.push({
            type: 'perishability_risk',
            source: 'crop-specific shelf-life evidence',
            riskLevel: perishabilityResult.riskLevel,
            shelfLife: perishabilityResult.shelfLife,
            classification: 'DERIVED',
          });
          storePathway.assumptions.push(
            'Perishability risk is based on crop-specific shelf-life evidence (demo), not a spoilage prediction'
          );
        }
      }

      // Add perishability summary to the overall result if not already present
      if (!result.perishability) {
        result.perishability = {
          crop: perishabilityResult.crop,
          shelfLife: perishabilityResult.shelfLife,
          riskLevel: perishabilityResult.riskLevel,
          guidance: perishabilityResult.guidance,
          provenance: perishabilityResult.provenance,
          note: 'Perishability is an awareness layer — it does not modify pathway ranking or economic calculations.',
        };
      }
    }

    res.json({
      success: true,
      marketSource: priceResult.source,
      servingMode: priceResult.servingMode || (priceResult.fallback ? 'FALLBACK' : 'LIVE'),
      marketProvenance: priceResult.provenance,
      ...result,
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    logger.error('Pathways error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute pathways', details: error.message });
  }
});

// GET /api/market/coverage — district × crop coverage diagnostic.
// Reports which districts and crops actually have AGMARKNET observations.
// A district existing in the selector does NOT mean market data exists.
router.get('/coverage', (req, res) => {
  try {
    const { getCoverageMatrix } = require('../data/marketCoverage');
    const { getSoilContext } = require('../services/soilContext');
    const { DISTRICTS } = require('../data/maharashtraDistricts');
    const { CROPS, enrichCropWithCoverage } = require('../data/cropCatalog');
    const marketCache = require('../services/marketCache');

    // Load snapshot rows for dynamic crop enrichment
    let snapshotRows = [];
    try {
      const fs = require('fs');
      const path = require('path');
      const snapFile = path.join(__dirname, '..', 'data', 'priceSnapshots.json');
      const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
      snapshotRows = snap.rows || [];
    } catch { /* snapshot unavailable */ }

    const { matrix, summary } = getCoverageMatrix();

    // Enrich with soil context for active districts
    const enriched = {};
    for (const [name, data] of Object.entries(matrix)) {
      enriched[name] = {
        ...data,
        soil: data.hasMarketData ? getSoilContext(name) : null,
      };
    }

    // Enrich crops with dynamic coverage from actual snapshot
    const enrichedCrops = CROPS.map(c => enrichCropWithCoverage(c, snapshotRows));

    res.json({
      success: true,
      summary: {
        ...summary,
        districtsInRegistry: DISTRICTS.length,
        cropsInCatalog: CROPS.length,
      },
      matrix: enriched,
      crops: enrichedCrops,
      districtCount: DISTRICTS.length,
      cropCount: CROPS.length,
    });
  } catch (error) {
    logger.error('Coverage error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute coverage' });
  }
});

// GET /api/market/farm-context?district=Nashik&crop=Onion&quantity=10
// Composed farm context: district + soil + weather + season + crop suitability.
router.get('/farm-context', async (req, res) => {
  try {
    const { createFarmContext } = require('../services/farmContext');
    const { getCoverageMatrix } = require('../data/marketCoverage');
    const { findDistrict } = require('../data/maharashtraDistricts');
    const { normalizeCrop } = require('../data/cropCatalog');
    const axiosHttp = require('axios');

    const { district, crop, quantity, grade, lat, lon } = req.query;
    if (!district || !crop) {
      return res.status(400).json({ success: false, error: 'district and crop query params are required' });
    }

    // Try to fetch weather for the district coordinates
    let weatherData = null;
    const districtData = findDistrict(district);
    const wLat = lat ? parseFloat(lat) : (districtData ? districtData.lat : null);
    const wLon = lon ? parseFloat(lon) : (districtData ? districtData.lon : null);
    if (wLat && wLon && process.env.OPENWEATHER_API_KEY) {
      try {
        const wRes = await axiosHttp.get('https://api.openweathermap.org/data/2.5/weather', {
          params: { lat: wLat, lon: wLon, appid: process.env.OPENWEATHER_API_KEY, units: 'metric' },
          timeout: 5000,
        });
        const c = wRes.data;
        weatherData = {
          current: {
            temperature: Math.round(c.main.temp),
            humidity: c.main.humidity,
            windSpeed: Math.round(c.wind.speed * 3.6),
            precipitation: c.rain?.['1h'] || 0,
            condition: c.weather[0]?.main || '',
            description: c.weather[0]?.description || '',
          },
          location: { name: c.name },
          timestamp: new Date().toISOString(),
        };
      } catch { /* weather is optional */ }
    }

    const context = createFarmContext({
      district, crop,
      quantity: quantity ? parseFloat(quantity) : undefined,
      grade: grade || undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      weatherData,
    });

    // Add market coverage summary (market intelligence, separate from farm context)
    const cropData = normalizeCrop(crop);
    if (cropData) {
      const matrix = getCoverageMatrix();
      const distEntry = matrix.matrix?.[district];
      const cropEntry = distEntry?.crops?.[cropData.name] || distEntry?.crops?.[crop];
      context.marketCoverageSummary = {
        marketsObserved: cropEntry ? (cropEntry.markets || []).length : 0,
        observations: cropEntry ? cropEntry.observations : 0,
        priceRange: cropEntry?.priceRange || null,
        districtHasData: distEntry?.hasMarketData || false,
        classification: 'HISTORICAL',
        source: 'AGMARKNET snapshot',
      };
    }

    res.json({ success: true, ...context });
  } catch (error) {
    logger.error('Farm context error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create farm context' });
  }
});

// GET /api/market/soil-context?district=Nashik
// Regional soil reference for a district. NOT farm-verified data.
router.get('/soil-context', (req, res) => {
  try {
    const { getSoilContext } = require('../services/soilContext');
    const { district } = req.query;
    if (!district) {
      return res.status(400).json({ success: false, error: 'district query param is required' });
    }
    const context = getSoilContext(district);
    res.json({ success: true, ...context });
  } catch (error) {
    logger.error('Soil context error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get soil context' });
  }
});// GET /api/market/crop-suitability?crop=Onion&district=Nashik
// Crop × district suitability using regional soil reference.
router.get('/crop-suitability', (req, res) => {
  try {
    const { checkCropSoilSuitability } = require('../services/soilContext');
    const { crop, district } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const suitability = checkCropSoilSuitability(crop, district);
    res.json({ success: true, ...suitability });
  } catch (error) {
    logger.error('Crop suitability error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to check crop suitability' });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// FARMER ECONOMICS — production cost → break-even → profit → trend → scenario
// Every number is FARMER_ENTERED, observed, or deterministically derived.
// No price prediction. No forecast. No guaranteed returns.
// ═════════════════════════════════════════════════════════════════════════

// POST /api/market/economics
// Body: { crop, district, quantity, costs: { seed, fertilizer, ... } }
// Computes production cost/q, break-even, and per-market estimated profit over
// the SAME ranked mandis the decision engine uses. Profit is DERIVED from
// farmer-entered costs — never presented as verified or predicted.
router.post('/economics', async (req, res) => {
  try {
    const { crop, district, quantity, costs } = req.body || {};
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district are required in the request body' });
    }
    const qty = requireQuantity(quantity);
    if (!qty.ok) return res.status(400).json({ success: false, error: qty.error });

    const farmerEconomics = require('../services/farmerEconomics');
    const parsed = farmerEconomics.parseProductionCosts(costs);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: 'Invalid production costs', details: parsed.errors });
    }
    if (parsed.totalProductionCost <= 0) {
      return res.status(400).json({ success: false, error: 'totalProductionCost must be greater than zero — enter at least one cost category' });
    }

    const composed = await composeEngineResult({ crop, district, quantity: qty.value });
    if (composed.error) {
      return res.status(422).json({ success: false, error: composed.error, marketSource: composed.marketSource, provenance: composed.provenance });
    }

    const result = farmerEconomics.computeEconomics({
      totalProductionCost: parsed.totalProductionCost,
      quantityQuintals: qty.value,
      engineResult: composed.engine,
    });
    if (!result.ok) {
      return res.status(422).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      marketSource: composed.priceResult.source,
      servingMode: composed.priceResult.servingMode || (composed.priceResult.fallback ? 'FALLBACK' : 'LIVE'),
      marketProvenance: composed.priceResult.provenance,
      input: { ...result.input, crop, district, quantityQuintals: qty.value, costBreakdown: parsed.breakdown },
      productionEconomics: result.productionEconomics,
      marketEconomics: result.marketEconomics,
      provenance: result.provenance,
      semantics: {
        netRealizationVsProfit: 'Net realization = what remains after selling costs. Profit = net realization − production cost. They are different numbers.',
        negativeProfit: 'Negative profit means BELOW_BREAK_EVEN — reported honestly, never clamped or called savings.',
      },
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    logger.error('Economics error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute economics', details: error.message });
  }
});

// GET /api/market/trends?crop=Onion&market=APMC Lasalgaon
// Multi-window observed trend (7/14/30-day). Describes the past only.
router.get('/trends', async (req, res) => {
  try {
    const { crop, market } = req.query;
    if (!crop || !market) {
      return res.status(400).json({ success: false, error: 'crop and market query params are required (e.g. crop=Onion&market=APMC Lasalgaon)' });
    }
    const observedTrend = require('../services/observedTrend');
    const result = await observedTrend.computeTrends({ crop, market });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({
      success: true,
      crop,
      market,
      trends: result.trends,
      source: result.source,
      servingMode: result.servingMode,
      forecast: false,
      observationNote: result.observationNote,
    });
  } catch (error) {
    logger.error('Trends error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to build trends' });
  }
});

// POST /api/market/scenario
// Body: { hypotheticalPricePerQuintal, quantity, distanceKm, costs: {...} ,
//         scenarioQuantity?, scenarioCosts? }
// Deterministic what-if. HYPOTHETICAL — never a forecast.
router.post('/scenario', async (req, res) => {
  try {
    const body = req.body || {};
    const { hypotheticalPricePerQuintal, quantity, distanceKm } = body;
    if (hypotheticalPricePerQuintal === undefined) {
      return res.status(400).json({ success: false, error: 'hypotheticalPricePerQuintal is required' });
    }
    const qty = requireQuantity(quantity);
    if (!qty.ok) return res.status(400).json({ success: false, error: qty.error });

    const scenario = require('../services/scenario');
    const farmerEconomics = require('../services/farmerEconomics');

    // Optional production cost: accept either a flat total or a breakdown.
    let totalCost = 0;
    if (body.totalProductionCost !== undefined) {
      const t = scenario.parseScenarioNumber(body.totalProductionCost);
      if (!t.ok || t.value < 0) return res.status(400).json({ success: false, error: 'totalProductionCost must be a non-negative number' });
      totalCost = t.value;
    } else if (body.costs) {
      const parsed = farmerEconomics.parseProductionCosts(body.costs);
      if (!parsed.ok) return res.status(400).json({ success: false, error: 'Invalid production costs', details: parsed.errors });
      totalCost = parsed.totalProductionCost;
    }

    // Optional scenario overrides
    let scenarioQuantity;
    if (body.scenarioQuantity !== undefined) {
      const sq = requireQuantity(body.scenarioQuantity);
      if (!sq.ok) return res.status(400).json({ success: false, error: `scenarioQuantity: ${sq.error}` });
      scenarioQuantity = sq.value;
    }
    let scenarioTotalProductionCost;
    if (body.scenarioTotalProductionCost !== undefined) {
      const sc = scenario.parseScenarioNumber(body.scenarioTotalProductionCost);
      if (!sc.ok || sc.value < 0) return res.status(400).json({ success: false, error: 'scenarioTotalProductionCost must be a non-negative number' });
      scenarioTotalProductionCost = sc.value;
    }

    // Optional reference: latest observed farmer net for a crop/district (the
    // scenario price stays hypothetical; this only feeds the labeled delta).
    let referenceNetPerQuintal;
    if (body.crop && body.district) {
      try {
        const refComposed = await composeEngineResult({ crop: body.crop, district: body.district, quantity: qty.value });
        if (!refComposed.error && Array.isArray(refComposed.engine.rankedMandis) && refComposed.engine.rankedMandis[0]) {
          referenceNetPerQuintal = refComposed.engine.rankedMandis[0].farmerNetPerQuintal;
        }
      } catch (e) {
        logger.warn('Scenario reference market unavailable:', e.message);
      }
    }

    const result = scenario.computeScenario({
      hypotheticalPricePerQuintal,
      quantityQuintals: qty.value,
      distanceKm: distanceKm !== undefined ? distanceKm : 0,
      totalProductionCost: totalCost,
      referenceNetPerQuintal,
      scenarioQuantity,
      scenarioTotalProductionCost,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Scenario error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute scenario' });
  }
});

// GET /api/market/storage-threshold?crop=Onion&district=Nashik&quantity=10
// The future net price (₹/q) above which storing then selling outperforms
// selling now. A deterministic threshold from current assumptions — never a
// claim that the price will reach it.
// Optional: harvestDate (ISO date) and storageDays for perishability awareness.
router.get('/storage-threshold', async (req, res) => {
  try {
    const { crop, district, quantity, harvestDate, storageDays } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const qty = requireQuantity(quantity);
    if (!qty.ok) return res.status(400).json({ success: false, error: qty.error });

    const composed = await composeEngineResult({ crop, district, quantity: qty.value });
    if (composed.error) {
      return res.status(422).json({ success: false, error: composed.error, marketSource: composed.marketSource, provenance: composed.provenance });
    }
    const bestMandi = composed.engine.rankedMandis[0];

    // Storage: demo dataset, cheapest facility mapped to the district or best mandi.
    const storageData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'storageOptions.json'), 'utf8'));
    const options = (storageData.options || []).filter(s => s.district === district || s.district === bestMandi.market);
    if (options.length === 0) {
      return res.status(422).json({ success: false, error: 'No storage option listed for this district in the Kisan360 demo dataset' });
    }
    const cheapest = options.reduce((min, s) => (s.costPerQuintalPerDay < min.costPerQuintalPerDay ? s : min));
    const storageDaysMax = Math.min(cheapest.maxDurationDays, 7);
    const storageCostPerQ = Math.round(cheapest.costPerQuintalPerDay * storageDaysMax * 100) / 100;

    const scenario = require('../services/scenario');
    const threshold = scenario.computeStorageThreshold({
      currentNetPerQuintal: bestMandi.farmerNetPerQuintal,
      storageCostPerQuintal: storageCostPerQ,
      distanceKm: bestMandi.distanceKm || 0,
      quantityQuintals: qty.value,
    });
    if (!threshold.ok) {
      return res.status(400).json({ success: false, error: threshold.error });
    }

    // ── Perishability awareness (optional, backward-compatible) ──────────
    // When harvestDate and/or storageDays are provided, enrich the response
    // with crop-specific perishability assessment. Without these params, the
    // response is identical to before.
    const perishabilityAssessment = perishability.assessPerishability({
      crop,
      harvestDate: harvestDate || null,
      plannedStorageDays: storageDays ? Number(storageDays) : null,
    });

    // Only include perishability when there is a profile for the crop
    const hasProfile = perishabilityAssessment.shelfLife !== null;
    const perishabilitySection = hasProfile ? {
      crop: perishabilityAssessment.crop,
      shelfLife: perishabilityAssessment.shelfLife,
      daysSinceHarvest: perishabilityAssessment.daysSinceHarvest,
      remainingShelfLife: perishabilityAssessment.remainingShelfLife,
      plannedStorageDays: perishabilityAssessment.plannedStorageDays,
      riskLevel: perishabilityAssessment.riskLevel,
      riskReason: perishabilityAssessment.riskReason,
      guidance: perishabilityAssessment.guidance,
      storageConditions: perishabilityAssessment.storageConditions,
      suitableStorageTypes: perishabilityAssessment.suitableStorageTypes,
      provenance: perishabilityAssessment.provenance,
      classification: perishabilityAssessment.classification,
    } : null;

    // Storage decision interpretation: combine economic + perishability
    const storageDecision = hasProfile ? {
      economicAssessment: {
        breakEvenFuturePrice: threshold.breakEvenFuturePriceForStorage,
        currentNet: bestMandi.farmerNetPerQuintal,
        storageCostPerQuintal: storageCostPerQ,
        statement: threshold.semantics?.statement || '',
      },
      perishabilityAssessment: perishabilitySection,
      overallAssessment: perishabilitySection
        ? (perishabilitySection.riskLevel === 'LOW' ? 'FAVORABLE'
          : perishabilitySection.riskLevel === 'MODERATE' ? 'CAUTION'
          : perishabilitySection.riskLevel === 'HIGH' ? 'CAUTION'
          : perishabilitySection.riskLevel === 'CRITICAL' ? 'NOT_SUPPORTED'
          : 'INSUFFICIENT_EVIDENCE')
        : 'INSUFFICIENT_EVIDENCE',
      reasons: [
        perishabilitySection ? `Perishability risk: ${perishabilitySection.riskLevel}` : 'No perishability evidence for this crop',
        `Economic threshold: ₹${threshold.breakEvenFuturePriceForStorage}/q`,
      ],
      note: 'Economic viability and perishability risk are assessed independently. A storage option can be economically attractive but perishability-risky, or vice versa.',
    } : null;

    res.json({
      success: true,
      marketSource: composed.priceResult.source,
      servingMode: composed.priceResult.servingMode || (composed.priceResult.fallback ? 'FALLBACK' : 'LIVE'),
      marketProvenance: composed.priceResult.provenance,
      crop,
      district,
      quantityQuintals: qty.value,
      referenceMarket: bestMandi.market,
      currentNetPerQuintal: bestMandi.farmerNetPerQuintal,
      storageOption: {
        id: cheapest.id,
        name: cheapest.name,
        costPerQuintalPerDay: cheapest.costPerQuintalPerDay,
        days: storageDaysMax,
        availability: cheapest.availability,
        label: cheapest.label,
      },
      storageCostPerQuintal: storageCostPerQ,
      ...threshold,
      perishability: perishabilitySection,
      storageDecision,
      dataBasis: 'Storage options are a static demo dataset (labeled) — not live facility availability. The threshold is derived arithmetic, not a prediction. Perishability assessment is crop-specific shelf-life evidence (demo), not a spoilage prediction.',
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    logger.error('Storage-threshold error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute storage threshold' });
  }
});


module.exports = router;

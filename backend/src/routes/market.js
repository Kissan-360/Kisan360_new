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
const logger = require('../utils/logger');

const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');

const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';

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
    const qty = Math.max(parseFloat(quantity) || 10, 0.1);

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
    const qty = Math.max(parseFloat(quantity) || 10, 0.1);

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
    const qty = Math.max(parseFloat(quantity) || 10, 0.1);

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
    const qty = Math.max(parseFloat(quantity) || 10, 0.1);
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
        const todayRows = marketCache.getPrices({ crop, market: bestMarket, limit: 500 });
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

    res.json({
      success: true,
      marketSource: priceResult.source,
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
});

// GET /api/market/crop-suitability?crop=Onion&district=Nashik
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

module.exports = router;

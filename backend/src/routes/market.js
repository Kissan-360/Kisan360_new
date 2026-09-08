const express = require('express');
const axios = require('axios');
const router = express.Router();
const marketCache = require('../services/marketCache');
const logger = require('../utils/logger');

const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';

marketCache.loadSeed();

// GET /api/market/prices — Live AGMARKNET mandi prices with a cached fallback.
// Provenance metadata on the response tells the client exactly where each
// number came from and how fresh it is.
router.get('/prices', async (req, res) => {
  try {
    const { crop, state, market, search, limit, offset } = req.query;
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

module.exports = router;

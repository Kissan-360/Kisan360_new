const express = require('express');
const router = express.Router();
const marketCache = require('../services/marketCache');

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

module.exports = router;

const express = require('express');
const axios = require('axios');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const router = express.Router();
router.use(authenticateUser, requireDb);
const marketCache = require('../services/marketCache');
const fpoPool = require('../services/fpoPool');
const logger = require('../utils/logger');

const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';

// Same dedupe/sanitize the /market/net-realization route does before handing
// prices to the calculator — kept local so both routes stay independent.
function priceRowsForCalculator(priceResult) {
  return priceResult.rows
    .slice()
    .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
    .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i)
    .map(r => ({
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
}

async function computeNetWithPrices(crop, district, quantity, priceResult) {
  const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
    crop,
    district,
    quantity,
    prices: priceRowsForCalculator(priceResult),
  }, { timeout: 15000 });
  const data = mlRes.data;
  if (!data || data.success === false) {
    const err = new Error(data?.error || 'Calculator rejected the request');
    err.status = 502;
    throw err;
  }
  return data;
}

// One price pull shared by every calculator call in this request. The pool
// route previously ran getBestPrices() once per member (N live pulls and N
// upstream round-trips for one click); all quantities share the same quotes.
async function computeNet(crop, district, quantity, priceResult) {
  const rows = priceResult || await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
  if (rows.rows.length === 0) {
    const err = new Error(`No mandi prices available for crop "${crop}" right now.`);
    err.status = 422;
    throw err;
  }
  return computeNetWithPrices(crop, district, quantity, rows);
}

// GET /api/fpo/members — the mock member roster (demo transparency)
router.get('/members', (req, res) => {
  const seed = fpoPool.loadMembers();
  res.json({ success: true, count: seed.members.length, meta: seed.meta, members: seed.members });
});

// POST /api/fpo/pool — pool members (mock seed or explicit list), compute the
// pooled best-mandi net and the per-member uplift vs selling individually.
// Body: { district, crop?, members?: [...] } — members omitted → use the mock
// seed; crop optionally overrides the seed's crop so the farmer's OWN decision
// crop carries into the pooling comparison (war-room Phase 12).
const VALID_DISTRICTS = ['Pune', 'Nashik', 'Nagpur', 'Solapur', 'Latur', 'Aurangabad', 'Amravati', 'Akola', 'Kolhapur', 'Jalgaon', 'Ahmednagar', 'Satara'];

router.post('/pool', async (req, res) => {
  try {
    const { district, crop: cropOverride, members: rawMembers } = req.body || {};
    if (!district || !VALID_DISTRICTS.includes(district)) {
      return res.status(400).json({ success: false, error: `district is required and must be one of: ${VALID_DISTRICTS.join(', ')}` });
    }
    let members = rawMembers;
    if (!members) {
      const seed = fpoPool.loadMembers();
      members = seed.members;
    }
    const pool = fpoPool.buildPool(members);

    // Crop override — member quantities stay the same, the priced crop changes.
    // Validated against the price cache so we never fabricate a pooled market.
    if (cropOverride && cropOverride !== pool.crop) {
      const available = await marketCache.getBestPrices({ crop: cropOverride, state: 'Maharashtra', limit: 1 });
      if (!available.rows.length) {
        return res.status(422).json({ success: false, error: `No mandi prices available for crop "${cropOverride}" — pooling can only be demonstrated for crops in the current price cache.` });
      }
      pool.crop = cropOverride;
    }

    // ONE price pull shared by the pooled lot and every member's solo lot.
    const sharedPriceResult = await marketCache.getBestPrices({ crop: pool.crop, state: 'Maharashtra', limit: 500 });
    if (!sharedPriceResult.rows.length) {
      return res.status(422).json({ success: false, error: `No mandi prices available for crop "${pool.crop}" right now.` });
    }

    // Pooled realization (bulk transport tier auto-applies ≥40 q in the calculator)
    const pooledResult = await computeNet(pool.crop, district, pool.pooledQuantity, sharedPriceResult);

    // Individual realization per member: same mandi prices, their own quantity
    // Parallelized — all members computed in one batch to avoid N sequential timeouts.
    const soloResults = await Promise.all(
      pool.members.map(m => computeNetWithPrices(pool.crop, district, m.quantityQuintals, sharedPriceResult))
    );
    const individualBests = soloResults.map(solo => {
      const best = solo.rankedMandis[0];
      return {
        bestMandi: best.market,
        bestNetPerQuintal: best.farmerNetPerQuintal,
        transportPerQuintal: best.farmerCosts.transportPerQuintal,
      };
    });

    const result = fpoPool.computeUplift(pool, pooledResult, individualBests);

    // Logistics split — WHY pooling changes economics. Weighted-average
    // transport of each member's own best-mandi trip vs the single pooled trip.
    const pooledTransport = pooledResult.rankedMandis[0].farmerCosts.transportPerQuintal;
    const weightedSoloTransport = Math.round(
      (individualBests.reduce((s, b, i) => s + b.transportPerQuintal * pool.members[i].quantityQuintals, 0) / pool.pooledQuantity) * 100
    ) / 100;

    const cached = marketCache.getPrices({ crop: pool.crop, limit: 1 });

    res.json({
      success: true,
      district,
      marketSource: cached.source,
      ...result,
      logistics: {
        individualAvgTransportPerQuintal: weightedSoloTransport,
        pooledTransportPerQuintal: pooledTransport,
        savedPerQuintal: Math.round((weightedSoloTransport - pooledTransport) * 100) / 100,
        note: 'Each member individually hauls to their own best mandi; the pooled lot makes one trip. Transport figures come from the same deterministic engine (₹/q/km × documented road distance).',
      },
      mocked: true,
      note: 'Members are mock demo households; prices and costs come from the deterministic calculator on real AGMARKNET data.',
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    if (error.message && error.message.startsWith('A pool needs') ) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error.message && (error.message.startsWith('All pooled members') || error.message.startsWith('Pooled quantity'))) {
      return res.status(400).json({ success: false, error: error.message });
    }
    logger.error('FPO pool error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute FPO pool', details: error.message });
  }
});

module.exports = router;

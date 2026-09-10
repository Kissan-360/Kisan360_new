const express = require('express');
const fs = require('fs');
const path = require('path');
const marketCache = require('../services/marketCache');

const router = express.Router();
const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');

let directory = { meta: {}, buyers: [] };
try {
  directory = JSON.parse(fs.readFileSync(BUYERS_FILE, 'utf8'));
} catch (error) {
  console.error('Failed to load buyer directory:', error.message);
  // Graceful fallback: serve an empty, honestly-labelled directory instead of
  // crashing every /api/buyers request.
  directory = {
    meta: {
      note: 'Buyer directory is temporarily unavailable — the static directory file could not be loaded.',
      trustTiers: {},
    },
    buyers: [],
  };
}

const TIER_ORDER = { REAL_VERIFIED: 0, SOURCE_VERIFIED: 1, DEMO_VERIFIED: 2, SELF_DECLARED: 3 };

function decorate(buyer) {
  const tier = directory.meta.trustTiers?.[buyer.trustTier] || {};
  return {
    ...buyer,
    tierLabel: tier.label || buyer.trustTier,
    tierDescription: tier.description || '',
    staticDirectory: true,
    demo: true, // honesty: badges are static for the demo, not real KYC
  };
}

function districtMatch(list, district) {
  if (!district) return true;
  const d = district.trim().toLowerCase();
  return list.some(x => x.trim().toLowerCase() === d);
}

// GET /api/buyers — matched buyers from the static directory.
// Filters: crop (label-tolerant), district, tier. Sorted by trust tier.
router.get('/', (req, res) => {
  const { crop, district, tier } = req.query;
  let buyers = directory.buyers;

  if (crop) {
    buyers = buyers.filter(b => b.crops.some(c => marketCache.cropMatches(c, crop)));
  }
  if (district) {
    buyers = buyers.filter(b => districtMatch(b.districts, district));
  }
  if (tier) {
    buyers = buyers.filter(b => b.trustTier === tier);
  }

  buyers = buyers
    .slice()
    .sort((a, b) => (TIER_ORDER[a.trustTier] ?? 99) - (TIER_ORDER[b.trustTier] ?? 99) || a.name.localeCompare(b.name));

  res.json({
    success: true,
    count: buyers.length,
    buyers: buyers.map(decorate),
    trustTiers: directory.meta.trustTiers,
    note: directory.meta.note,
  });
});

// GET /api/buyers/:id
router.get('/:id', (req, res) => {
  const buyer = directory.buyers.find(b => b.id === req.params.id);
  if (!buyer) return res.status(404).json({ success: false, error: 'Buyer not found in directory' });
  res.json({ success: true, buyer: decorate(buyer), note: directory.meta.note });
});

module.exports = router;

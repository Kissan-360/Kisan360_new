const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const marketCache = require('../services/marketCache');
const { assessDemandCoverage, findCompatibleDemands } = require('../services/demandMatch');
const { evaluateFreshness, filterActionable } = require('../services/demandFreshness');
const { findCompatibleRequirements } = require('../services/qualityMatch');

const router = express.Router();
const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');
const DEMAND_SIGNALS_FILE = path.join(__dirname, '..', 'data', 'demandSignals.json');
const REQUIREMENTS_FILE = path.join(__dirname, '..', 'data', 'buyerRequirements.json');

let directory = { meta: {}, buyers: [] };
try {
  directory = JSON.parse(fs.readFileSync(BUYERS_FILE, 'utf8'));
} catch (error) {
  logger.error('Failed to load buyer directory:', error.message);
  directory = {
    meta: {
      note: 'Buyer directory is temporarily unavailable — the static directory file could not be loaded.',
      trustTiers: {},
    },
    buyers: [],
  };
}

let demandData = { meta: {}, demandSignals: [] };
try {
  demandData = JSON.parse(fs.readFileSync(DEMAND_SIGNALS_FILE, 'utf8'));
} catch (error) {
  logger.error('Failed to load demand signals:', error.message);
  demandData = { meta: { note: 'Demand signals unavailable.' }, demandSignals: [] };
}

let requirementsData = { meta: {}, requirements: [] };
try {
  requirementsData = JSON.parse(fs.readFileSync(REQUIREMENTS_FILE, 'utf8'));
} catch (error) {
  logger.error('Failed to load buyer requirements:', error.message);
  requirementsData = { meta: { note: 'Buyer requirements unavailable.' }, requirements: [] };
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

// Case/space-insensitive comparison key for district-style strings.
function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function districtMatch(list, district) {
  if (!district) return true;
  const d = district.trim().toLowerCase();
  return list.some(x => x.trim().toLowerCase() === d);
}

// GET /api/buyers — matched buyers from the static directory.
// Filters: crop (label-tolerant), district, tier. Sorted by trust tier.
router.get('/', (req, res) => {
  try {
    const { crop, district, tier } = req.query;
    let buyers = directory.buyers;

    if (crop) {
      buyers = buyers.filter(b => (b.crops || []).some(c => marketCache.cropMatches(c, crop)));
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list buyers', details: error.message });
  }
});

// GET /api/buyers/demand — active demand signals from the demo directory.
// Filters: crop, district, status. Returns freshness state and match assessment.
// Demand signals are time-bounded buyer intent — NOT a guarantee of a transaction.
router.get('/demand', (req, res) => {
  try {
    const { crop, district, status, lot } = req.query;
    let signals = demandData.demandSignals || [];

    // Basic filters
    if (crop) {
      signals = signals.filter(s => marketCache.cropMatches(s.crop, crop));
    }
    if (district) {
      signals = signals.filter(s => norm(s.district) === norm(district));
    }
    if (status) {
      signals = signals.filter(s => s.demandStatus === status.toUpperCase());
    }

    // Attach freshness to each signal
    const now = new Date();
    const withFreshness = signals.map(s => ({
      ...s,
      freshness: evaluateFreshness(s, now),
    }));

    // If lot parameters provided, compute match assessment
    let matches = null;
    if (lot) {
      try {
        const lotObj = typeof lot === 'string' ? JSON.parse(lot) : lot;
        matches = findCompatibleDemands(signals, lotObj, now);
      } catch {
        // lot parameter is optional — if malformed, just return signals without matches
      }
    }

    res.json({
      success: true,
      count: withFreshness.length,
      demandSignals: withFreshness,
      matches,
      meta: demandData.meta,
      note: 'Demand signals are demo directory entries with time bounds. A MATCH means the lot satisfies declared demand criteria — it does not guarantee a transaction.',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list demand signals', details: error.message });
  }
});

// GET /api/buyers/demand/coverage — assess demand coverage for a specific lot.
// POST-equivalent via GET for query-param convenience (same pattern as /buyer-coverage).
router.get('/demand/coverage', (req, res) => {
  try {
    const { crop, quantity, grade, size, moisturePct, damagePct, district } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const rawQty = parseFloat(quantity);
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;

    const lot = {
      crop,
      quantityQuintals: qty,
      grade: grade || 'Unassessed',
      size: size || null,
      moisturePct: moisturePct != null ? Number(moisturePct) : null,
      damagePct: damagePct != null ? Number(damagePct) : null,
      district,
    };

    const signals = demandData.demandSignals || [];
    const coverage = assessDemandCoverage(signals, lot, new Date());

    res.json({
      success: true,
      lot,
      ...coverage,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to assess demand coverage', details: error.message });
  }
});

// GET /api/buyers/requirements — compatible buyer requirements for a lot.
// Matches the farmer's lot (crop, quantity, grade, quality, district) against
// the STATIC demo requirements using the qualityMatch service. A match means
// the lot satisfies declared criteria — NOT confirmed demand, and NOT a
// live buyer signal. Classification is labeled DEMO_BUYER_REQUIREMENTS.
router.get('/requirements', (req, res) => {
  try {
    const { crop, quantity, grade, size, moisturePct, damagePct, district } = req.query;
    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district query params are required' });
    }
    const rawQty = parseFloat(quantity);
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;

    const lot = {
      crop,
      quantityQuintals: qty,
      grade: grade || 'Unassessed',
      size: size || null,
      moisturePct: moisturePct != null ? Number(moisturePct) : null,
      damagePct: damagePct != null ? Number(damagePct) : null,
      district,
    };

    const compatible = findCompatibleRequirements(requirementsData.requirements, lot);

    res.json({
      success: true,
      count: compatible.length,
      requirements: compatible,
      meta: requirementsData.meta,
      note: 'Static demo requirements — a match is not confirmed demand. Production would source requirements from live buyer onboarding.',
      classification: 'DEMO_BUYER_REQUIREMENTS',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to match buyer requirements', details: error.message });
  }
});

// GET /api/buyers/:id
router.get('/:id', (req, res) => {
  try {
    const buyer = directory.buyers.find(b => b.id === req.params.id);
    if (!buyer) return res.status(404).json({ success: false, error: 'Buyer not found in directory' });
    res.json({ success: true, buyer: decorate(buyer), note: directory.meta.note });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch buyer', details: error.message });
  }
});

module.exports = router;

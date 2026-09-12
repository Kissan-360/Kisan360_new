// Pure helpers for building the on-disk price snapshot (backend/src/data/priceSnapshots.json)
// from raw Agmarknet records. Kept dependency-light and side-effect-free so the
// refresher CLI and unit tests share exactly the same transform.

const { normalizeRow, validateRow, cropMatches } = require('./marketCache');

// All crops the scheduler attempts to fetch from AGMARKNET.
const TARGET_CROPS = [
  'Soybean', 'Onion', 'Tomato', 'Cotton', 'Jowar', 'Bajra', 'Wheat',
  'Tur', 'Chilli', 'Maize', 'Groundnut', 'Sugarcane', 'Grapes', 'Pomegranate',
  'Ginger', 'Black Gram', 'Green Gram', 'Bengal Gram', 'Green Peas',
];

function isTargetCrop(crop) {
  return TARGET_CROPS.some(t => cropMatches(t, crop));
}

// Raw Agmarknet records → clean rows for a crop, restricted to one state,
// deduplicated (keep the highest modal quote per crop|market|variety).
function recordsToRows(records, { crop, state = 'Maharashtra', fetchedAt } = {}) {
  const now = fetchedAt || new Date().toISOString();
  const normalized = (records || []).map(r => normalizeRow(r, { fetchedAt: now, validatedAt: now }));

  // Validate and separate valid from rejected
  const valid = [];
  const rejected = [];
  for (const r of normalized) {
    const { valid: isValid, reason } = validateRow(r);
    if (isValid) {
      valid.push(r);
    } else {
      rejected.push({ row: r, reason });
    }
  }

  // Filter by state and optional crop
  let scoped = valid;
  if (state) scoped = scoped.filter(r => (r.state || '').toLowerCase() === String(state).toLowerCase());
  if (crop) scoped = scoped.filter(r => cropMatches(r.crop, crop));

  // Deduplicate: keep highest modal price per crop|market|variety
  const byKey = new Map();
  for (const row of scoped) {
    const key = `${row.crop}|${row.market}|${row.variety}`.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || (row.modalPrice || 0) > (existing.modalPrice || 0)) byKey.set(key, row);
  }

  const rows = [...byKey.values()].sort(
    (a, b) => a.crop.localeCompare(b.crop) || a.market.localeCompare(b.market) || a.variety.localeCompare(b.variety)
  );

  // Return reconciliation summary alongside rows
  return {
    rows,
    reconciliation: {
      received: (records || []).length,
      normalized: normalized.length,
      accepted: rows.length,
      rejected: rejected.length,
      rejectedReasons: rejected.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc; }, {}),
    },
  };
}

function stampMeta(extra = {}) {
  return {
    purpose: 'Known-good cached fallback for /api/market/prices and the net-realization calculator.',
    note: 'Machine-generated from a live AGMARKNET pull (see backend/scripts/refresh-prices.js). Real data, not a sample.',
    source: 'agmarknet_snapshot',
    retrievedAt: new Date().toISOString(),
    unit: '₹ per quintal',
    ...extra,
  };
}

module.exports = { TARGET_CROPS, isTargetCrop, recordsToRows, stampMeta };

// Pure helpers for building the on-disk price snapshot (backend/src/data/priceSnapshots.json)
// from raw Agmarknet records. Kept dependency-light and side-effect-free so the
// refresher CLI and unit tests share exactly the same transform.

const { normalizeRow, cropMatches } = require('./marketCache');

// Crops the demo targets (2–3 is enough to prove the concept).
const TARGET_CROPS = ['Soybean', 'Onion', 'Tomato'];

function isTargetCrop(crop) {
  return TARGET_CROPS.some(t => cropMatches(t, crop));
}

// Raw Agmarknet records → clean rows for a crop, restricted to one state,
// deduplicated (keep the highest modal quote per crop|market|variety).
function recordsToRows(records, { crop, state = 'Maharashtra' } = {}) {
  const rows = (records || [])
    .map(normalizeRow)
    .filter(r => (r.market || '').trim() !== '')
    .filter(r => !state || (r.state || '').toLowerCase() === String(state).toLowerCase());

  let scoped = rows;
  if (crop) scoped = scoped.filter(r => cropMatches(r.crop, crop));
  else scoped = scoped.filter(r => isTargetCrop(r.crop));

  const byKey = new Map();
  for (const row of scoped) {
    const key = `${row.crop}|${row.market}|${row.variety}`.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || (row.modalPrice || 0) > (existing.modalPrice || 0)) byKey.set(key, row);
  }

  return [...byKey.values()].sort(
    (a, b) => a.crop.localeCompare(b.crop) || a.market.localeCompare(b.market) || a.variety.localeCompare(b.variety)
  );
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

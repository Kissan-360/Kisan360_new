// Pure price-history helpers for the localized 7/14/30-day trend (P1).
// No forecasting — the HLD forbids it. Every number here is an observed
// AGMARKNET modal price on a real arrival date; deltas are descriptions of
// the past, never predictions.
//
// Storage shape (backend/src/data/priceHistory.json):
//   { "meta": {...}, "days": { "2026-09-08": [row, ...] } }
// where each row is the best (highest) modal quote for one crop|market|variety
// on that arrival date. Deduped per day so repeated pulls never double-count.

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'priceHistory.json');
const DEFAULT_MAX_HISTORY_DAYS = 180;

function getMaxHistoryDays(options = {}) {
  const configured = Number(
    options.maxDays ?? process.env.PRICE_HISTORY_RETENTION_DAYS ?? DEFAULT_MAX_HISTORY_DAYS,
  );
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_HISTORY_DAYS;
}

/**
 * Keep only the newest `maxDays` date buckets (pure — returns a new map).
 * The public trend windows are 7/14/30 days, so the default 180-day retention
 * is deliberately far above the longest user-facing window.
 */
function pruneDays(days, options = {}) {
  const maxDays = getMaxHistoryDays(options);
  const source = days || {};
  const keys = Object.keys(source).sort();
  if (keys.length <= maxDays) {
    return { days: { ...source }, removed: 0, maxDays };
  }

  const keep = new Set(keys.slice(-maxDays));
  const pruned = {};
  for (const key of keys) {
    if (keep.has(key)) pruned[key] = source[key];
  }
  return { days: pruned, removed: keys.length - maxDays, maxDays };
}

function pruneHistory(history, options = {}) {
  const result = pruneDays(history?.days || {}, options);
  return {
    history: { meta: history?.meta || {}, days: result.days },
    removedDays: result.removed,
    maxDays: result.maxDays,
  };
}

// AGMARKNET arrival dates come as DD/MM/YYYY — normalize for sorting/storage.
// Delegates to lib/observedDate.js, which is now the single definition of the
// wire format (this function was the one place that already read it correctly).
const { normalizeObservedDate } = require('../lib/observedDate');
const normalizeDate = normalizeObservedDate;

// Append snapshot rows into the days map (pure — returns a new map).
function appendRows(days, rows, { retrievedAt } = {}) {
  const next = { ...days };
  for (const r of rows) {
    const day = normalizeDate(r.arrivalDate);
    if (!day || !r.market || !r.crop) continue;
    const bucket = next[day] ? [...next[day]] : [];
    const key = `${r.crop}|${r.market}|${r.variety}`.toLowerCase();
    const idx = bucket.findIndex(x => `${x.crop}|${x.market}|${x.variety}`.toLowerCase() === key);
    const entry = { crop: r.crop, market: r.market, variety: r.variety, modalPrice: r.modalPrice, arrivalDate: r.arrivalDate };
    if (idx === -1) bucket.push(entry);
    else if ((r.modalPrice || 0) > (bucket[idx].modalPrice || 0)) bucket[idx] = entry;
    next[day] = bucket;
  }
  return next;
}

function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return { meta: raw.meta || {}, days: raw.days || {} };
  } catch {
    return { meta: {}, days: {} };
  }
}

function saveHistory(history, extraMeta = {}) {
  const payload = {
    meta: { note: 'Machine-appended daily by scripts/refresh-prices.js and scheduler. Observed prices only — no forecasts.', ...history.meta, ...extraMeta },
    days: history.days,
  };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

// Summary stats for operational visibility
function getHistorySummary() {
  const history = loadHistory();
  const days = Object.keys(history.days);
  const dayCount = days.length;
  const sortedDays = days.sort();
  let totalObservations = 0;
  const crops = new Set();
  const markets = new Set();
  for (const day of days) {
    const rows = history.days[day] || [];
    totalObservations += rows.length;
    for (const r of rows) {
      if (r.crop) crops.add(r.crop);
      if (r.market) markets.add(r.market);
    }
  }
  return {
    dayCount,
    earliestDay: sortedDays[0] || null,
    latestDay: sortedDays[sortedDays.length - 1] || null,
    totalObservations,
    distinctCrops: [...crops],
    distinctMarkets: markets.size,
    lastRefresh: history.meta.lastAppendedAt || null,
    retentionDays: history.meta.historyRetentionDays || DEFAULT_MAX_HISTORY_DAYS,
    lastPrunedDays: history.meta.lastPrunedDays || 0,
  };
}

// Crop alias matching — AGMARKNET data spells some crops differently than the
// frontend (e.g. "Soyabean" vs "Soybean"). The trend filter must tolerate these.
const CROP_ALIAS_GROUPS = {
  soybean: ['soybean', 'soyabean', 'soyabeen', 'soyabeans', 'soya bean'],
  onion: ['onion', 'onions'],
  tomato: ['tomato', 'tomatoes'],
};

function aliasGroupKey(crop) {
  const key = normKey(crop);
  if (!key) return null;
  for (const members of Object.values(CROP_ALIAS_GROUPS)) {
    if (members.some(m => normKey(m) === key)) return normKey(members[0]);
  }
  return null;
}

function cropMatches(a, b) {
  const na = normKey(a);
  const nb = normKey(b);
  if (na && na === nb) return true;
  const ga = aliasGroupKey(a);
  const gb = aliasGroupKey(b);
  return !!(ga && gb && ga === gb);
}

// Per-day best modal price for one crop|market (highest variety quote), oldest
// first, sliced to the last `window` days that actually have data.
// Market/crop names are matched on a normalized key (AGMARKNET names carry
// irregular whitespace, e.g. 'APMC  Latur' vs 'APMC Latur').
function normKey(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function trendSeries(days, { crop, market, window = 7 }) {
  const marketKey = normKey(market);
  if (!crop || !marketKey) return [];
  const series = [];
  for (const day of Object.keys(days).sort()) {
    const best = (days[day] || [])
      .filter(r => cropMatches(r.crop, crop) && normKey(r.market) === marketKey)
      .reduce((bestRow, r) => ((r.modalPrice || 0) > (bestRow?.modalPrice || 0) ? r : bestRow), null);
    if (best) series.push({ date: day, modalPrice: best.modalPrice, arrivalDate: best.arrivalDate, market: best.market });
  }
  return series.slice(-Math.max(parseInt(window, 10) || 7, 1));
}

// Plain-language description of the observed change. Explicitly descriptive.
function describeDelta(series) {
  if (series.length < 2) {
    return series.length === 1
      ? 'Only one day of history so far — keep running the daily refresher to build a trend.'
      : 'No history yet for this crop and market.';
  }
  const first = series[0];
  const last = series[series.length - 1];
  const diff = Math.round((last.modalPrice - first.modalPrice) * 100) / 100;
  const pct = first.modalPrice > 0 ? Math.round((diff / first.modalPrice) * 10000) / 100 : 0;
  const dir = diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'unchanged';
  const span = Math.max(series.length - 1, 1);
  return `Modal price on ${last.date} is ₹${Math.abs(diff).toLocaleString('en-IN')}/q ${dir} than on ${first.date} (${pct > 0 ? '+' : ''}${pct}% over ${span} days of observations). This describes the past only — Kisan360 does not forecast prices.`;
}

module.exports = {
  HISTORY_FILE,
  DEFAULT_MAX_HISTORY_DAYS,
  getMaxHistoryDays,
  normalizeDate,
  appendRows,
  pruneDays,
  pruneHistory,
  loadHistory,
  saveHistory,
  getHistorySummary,
  trendSeries,
  describeDelta,
};

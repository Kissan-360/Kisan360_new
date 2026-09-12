// Observed Price Trends — multi-window (7/14/30-day) trend intelligence.
//
// Methodology (explicit, deterministic):
//   first valid observed modal price vs latest valid observed modal price
//   within the requested observation window, over priceHistory's deduped
//   per-day series (repeated fetches NEVER create new observation days).
//
// This DESCRIBES the past. It is not a forecast. forecast: false always.

const priceHistory = require('./priceHistory');

const WINDOWS = [7, 14, 30];
// A percent change smaller than this is FLAT — under ~0.5% the day-to-day
// movement of mandi prices is inside rounding noise, so labeling it UP or
// DOWN would be false precision. Centralized per project convention.
const FLAT_TOLERANCE_PCT = 0.5;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute one window's observed trend for a crop|market series.
 * @param {Array} series - priceHistory.trendSeries() output: [{ date, modalPrice }] oldest first
 * @param {number} periodDays
 */
function trendForWindow(series, periodDays) {
  const base = {
    periodDays,
    direction: 'INSUFFICIENT_EVIDENCE',
    percentChange: null,
    observationCount: series.length,
    firstObservedOn: series[0]?.date || null,
    latestObservedOn: series[series.length - 1]?.date || null,
    method: 'first vs latest observed modal price within window',
    classification: 'DERIVED',
    forecast: false,
  };
  if (series.length === 0) {
    return { ...base, description: 'No history yet for this crop and market.' };
  }
  const first = series[0];
  const last = series[series.length - 1];
  if (series.length < 2) {
    return {
      ...base,
      latestPrice: last.modalPrice,
      description: 'Only one observation in the window — trend direction is indeterminate (not "flat").',
    };
  }
  const firstPrice = first.modalPrice;
  const latestPrice = last.modalPrice;
  const absoluteChange = round2(latestPrice - firstPrice);
  const percentChange = firstPrice > 0 ? round2((absoluteChange / firstPrice) * 100) : null;
  const direction =
    percentChange === null ? 'INSUFFICIENT_EVIDENCE'
    : Math.abs(percentChange) <= FLAT_TOLERANCE_PCT ? 'FLAT'
    : percentChange > 0 ? 'UP' : 'DOWN';
  const prices = series.map(s => s.modalPrice);
  const dirWord = direction === 'UP' ? 'increased' : direction === 'DOWN' ? 'decreased' : 'was flat';
  return {
    ...base,
    firstObservedPrice: firstPrice,
    latestObservedPrice: latestPrice,
    absoluteChange,
    percentChange,
    direction,
    observationCount: series.length,
    minObservedPrice: Math.min(...prices),
    maxObservedPrice: Math.max(...prices),
    source: 'AGMARKNET observed history',
    description:
      `Observed prices ${dirWord} over the available ${periodDays}-day observation window ` +
      `(₹${firstPrice.toLocaleString('en-IN')} → ₹${latestPrice.toLocaleString('en-IN')}, ` +
      `${percentChange === null ? 'n/a' : `${percentChange > 0 ? '+' : ''}${percentChange}%`} across ${series.length} observations). ` +
      'This describes the past only — Kisan360 does not forecast prices.',
  };
}

/**
 * Full multi-window trend for one crop|market. Includes today's best quote so
 * the freshest observation is always represented, without double-counting —
 * appendRows dedupes by crop|market|variety per arrival date.
 *
 * Uses marketCache.getBestPrices (NOT getPrices) so a live pull that returns
 * a poisoned sliver of markets falls back to the snapshot exactly like every
 * other serving path.
 *
 * @param {Object} params - { crop, market }
 * @returns {{ ok, trends, observationNote }} or { ok: false }
 */
async function computeTrends({ crop, market }) {
  if (!crop || !market) return { ok: false, error: 'crop and market are required' };
  const history = priceHistory.loadHistory();
  // Merge today's best quotes (live → snapshot fallback, provenance attached).
  const cache = require('./marketCache');
  const today = await cache.getBestPrices({ crop, state: 'Maharashtra', market, limit: 500 });
  const days = priceHistory.appendRows(history.days, today.rows, { retrievedAt: today.retrievedAt });

  const trends = {};
  for (const w of WINDOWS) {
    const series = priceHistory.trendSeries(days, { crop, market, window: w });
    trends[`${w}d`] = trendForWindow(series, w);
  }
  return {
    ok: true,
    trends,
    source: today.source,
    servingMode: today.servingMode || (today.fallback ? 'FALLBACK' : 'LIVE'),
    observationNote:
      'Trends are computed from distinct observation dates in the stored history plus the current cache. ' +
      'Repeated fetches of the same observation never create new trend points.',
  };
}

module.exports = { WINDOWS, FLAT_TOLERANCE_PCT, trendForWindow, computeTrends };

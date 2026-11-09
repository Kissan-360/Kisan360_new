/**
 * Price-alert subscriptions — observed prices only, no forecasts.
 *
 * A farmer subscribes to (crop, market, direction, targetPrice). The
 * notifications inbox derives an item when the latest observed modal price
 * in priceHistory crosses the target. Items use stable per-day ids, so they
 * never duplicate across polls and need no writes on read.
 */
const priceHistory = require('./priceHistory');

const MAX_STR = 120;
const capStr = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_STR) : '');

function validatePriceAlertInput(body = {}) {
  const errors = [];
  const clean = {
    crop: capStr(body.crop),
    market: capStr(body.market),
    direction: capStr(body.direction).toLowerCase(),
    targetPrice: body.targetPrice,
  };
  if (!clean.crop) errors.push('crop is required');
  if (!clean.market) errors.push('market is required');
  if (!['above', 'below'].includes(clean.direction)) errors.push('direction must be above or below');
  const target = Number(clean.targetPrice);
  if (!Number.isFinite(target) || target < 1 || target > 10000000) {
    errors.push('targetPrice must be a number between 1 and 10000000');
  } else {
    clean.targetPrice = Math.round(target * 100) / 100;
  }
  return { errors, clean };
}

/**
 * Evaluate one alert against the latest observed point.
 * Returns the crossing point or null. Pure — no DB, no clock.
 */
function evaluatePriceAlert(alert, latest) {
  if (!alert || !latest || !Number.isFinite(Number(latest.modalPrice))) return null;
  const modal = Number(latest.modalPrice);
  const target = Number(alert.targetPrice);
  const crossed = alert.direction === 'above' ? modal >= target : modal <= target;
  if (!crossed) return null;
  return {
    date: latest.date,
    modalPrice: modal,
    market: latest.market || alert.market,
    direction: alert.direction,
    targetPrice: target,
  };
}

function priceAlertItems(alerts = [], days = {}) {
  const items = [];
  for (const alert of alerts || []) {
    if (!alert || alert.active === false) continue;
    const series = priceHistory.trendSeries(days, {
      crop: alert.crop,
      market: alert.market,
      window: 7,
    });
    const latest = series[series.length - 1];
    const hit = evaluatePriceAlert(alert, latest);
    if (!hit) continue;
    const day = hit.date;
    const at = `${day}T00:00:00.000Z`;
    const above = hit.direction === 'above';
    items.push({
      id: `price_${alert._id}_${day}`,
      kind: 'price_alert',
      params: {
        crop: alert.crop,
        market: hit.market,
        target: hit.targetPrice,
        price: hit.modalPrice,
        date: day,
      },
      title: above ? 'Price target reached' : 'Price below target',
      message: above
        ? `${alert.crop} at ${hit.market} is ₹${hit.modalPrice.toLocaleString('en-IN')}/q — at or above your ₹${hit.targetPrice.toLocaleString('en-IN')}/q target.`
        : `${alert.crop} at ${hit.market} is ₹${hit.modalPrice.toLocaleString('en-IN')}/q — at or below your ₹${hit.targetPrice.toLocaleString('en-IN')}/q target.`,
      type: above ? 'success' : 'warning',
      category: 'market',
      to: '/market',
      createdAt: at,
    });
  }
  return items;
}

module.exports = { validatePriceAlertInput, evaluatePriceAlert, priceAlertItems };

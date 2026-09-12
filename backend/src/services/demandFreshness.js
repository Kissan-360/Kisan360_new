// Demand freshness — evaluates time-bounded demand signals against current time.
// A demand signal is not "active" just because it exists — it must be within its
// validity window and not paused or fulfilled. This service never forecasts demand
// duration or intensity — it only evaluates the declared validity window.

const FRESH_HOURS = 48;
const EXPIRING_HOURS = 24;

/**
 * Evaluate the freshness state of a demand signal.
 * @param {Object} signal - demand signal with validFrom, validUntil, demandStatus
 * @param {Date} [now] - current time (injectable for testing)
 * @returns {Object} freshness assessment
 */
function evaluateFreshness(signal, now = new Date()) {
  if (!signal) {
    return { state: 'INVALID', label: 'No demand signal', hoursUntilExpiry: null, isFresh: false };
  }

  const validFrom = new Date(signal.validFrom);
  const validUntil = new Date(signal.validUntil);

  if (isNaN(validFrom.getTime()) || isNaN(validUntil.getTime())) {
    return { state: 'INVALID', label: 'Invalid date range', hoursUntilExpiry: null, isFresh: false };
  }

  // If the signal's declared status is not ACTIVE, honour it
  if (signal.demandStatus !== 'ACTIVE') {
    const statusLabels = {
      EXPIRED: 'Demand signal has expired',
      FULFILLED: 'Demand signal was fulfilled by a completed transaction',
      PAUSED: 'Demand signal is temporarily paused by the buyer',
      EXPIRING: 'Demand signal is expiring soon',
    };
    return {
      state: signal.demandStatus,
      label: statusLabels[signal.demandStatus] || `Status: ${signal.demandStatus}`,
      hoursUntilExpiry: null,
      isFresh: false,
    };
  }

  const msUntilExpiry = validUntil.getTime() - now.getTime();
  const msFromStart = now.getTime() - validFrom.getTime();
  const hoursUntilExpiry = Math.round((msUntilExpiry / (1000 * 60 * 60)) * 10) / 10;
  const hoursSinceStart = Math.round((msFromStart / (1000 * 60 * 60)) * 10) / 10;

  // Not yet valid
  if (hoursSinceStart < 0) {
    return { state: 'NOT_YET_VALID', label: `Demand signal becomes valid in ${Math.abs(hoursSinceStart)} hours`, hoursUntilExpiry, isFresh: false };
  }

  // Expired
  if (hoursUntilExpiry <= 0) {
    return { state: 'EXPIRED', label: 'Demand signal validity window has passed', hoursUntilExpiry: 0, isFresh: false };
  }

  // Expiring soon
  if (hoursUntilExpiry <= EXPIRING_HOURS) {
    return { state: 'EXPIRING', label: `Demand signal expires in ${hoursUntilExpiry} hours`, hoursUntilExpiry, isFresh: false };
  }

  // Fresh
  if (hoursUntilExpiry <= FRESH_HOURS * 24) {
    return { state: 'ACTIVE', label: `Demand signal is active — expires in ${Math.round(hoursUntilExpiry / 24)} days`, hoursUntilExpiry, isFresh: true };
  }

  // Very long validity — still active but flag as unusual
  return { state: 'ACTIVE', label: `Demand signal is active — expires in ${Math.round(hoursUntilExpiry / 24)} days (unusually long window)`, hoursUntilExpiry, isFresh: true };
}

/**
 * Filter demand signals to only those that are currently actionable.
 * @param {Array} signals - all demand signals
 * @param {Date} [now] - current time (injectable for testing)
 * @returns {Array} actionable signals with freshness attached
 */
function filterActionable(signals, now = new Date()) {
  if (!Array.isArray(signals)) return [];

  return signals
    .map(signal => ({ ...signal, freshness: evaluateFreshness(signal, now) }))
    .filter(signal => signal.freshness.state === 'ACTIVE');
}

module.exports = { evaluateFreshness, filterActionable, FRESH_HOURS, EXPIRING_HOURS };

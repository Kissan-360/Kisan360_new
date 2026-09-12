// Demand matching — matches farmer lots against active demand signals.
// Unlike qualityMatch (which matches against static buyer requirements),
// demandMatch considers time bounds, freshness, geography, and signal status.
//
// Architecture:
//   buyer requirements = what buyers want (static, in buyerRequirements.json)
//   demand signals = active, time-bounded buyer intent (in demandSignals.json)
//   demand matching = is there an active demand signal compatible with this lot?
//
// Returns: MATCH / PARTIAL_MATCH / NO_MATCH / NO_DEMAND / UNKNOWN
// Each match includes explainable reasons and trust tier preservation.

const { evaluateFreshness } = require('./demandFreshness');
const { GRADE_RANK } = require('./qualityMatch');

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Match a farmer's lot against a single demand signal.
 * @param {Object} lot - { crop, quantityQuintals, grade, size, moisturePct, damagePct, district }
 * @param {Object} signal - demand signal
 * @param {Date} [now] - current time (injectable)
 * @returns {Object} match assessment
 */
function matchLotToSignal(lot, signal, now = new Date()) {
  if (!lot || !signal) {
    return { matchLevel: 'UNKNOWN', reasons: ['Missing lot or signal data'], blockers: [] };
  }

  const reasons = [];
  const blockers = [];
  const freshness = evaluateFreshness(signal, now);

  // Signal must be active
  if (freshness.state !== 'ACTIVE') {
    return { matchLevel: 'NO_MATCH', reasons: [], blockers: [`Demand signal status: ${freshness.state} — ${freshness.label}`], freshness };
  }

  // Crop check
  const cropMatch = norm(signal.crop) === norm(lot.crop);
  if (cropMatch) {
    reasons.push(`Demand signal lists ${signal.crop}`);
  } else {
    blockers.push(`Demand signal is for ${signal.crop}, not ${lot.crop}`);
  }

  // District / geography check
  const signalDistrict = norm(signal.district);
  const lotDistrict = norm(lot.district);
  const districtMatch = signalDistrict === lotDistrict || !signalDistrict;
  if (signalDistrict && districtMatch) {
    reasons.push(`Demand signal covers ${signal.district}`);
  } else if (!signalDistrict) {
    reasons.push('No district restriction on demand signal');
  } else {
    blockers.push(`Demand signal is for ${signal.district}, lot is in ${lot.district}`);
  }

  // Quantity range check
  const qty = Number(lot.quantityQuintals) || 0;
  const minQty = Number(signal.minQuantityQuintals) || 0;
  const maxQty = Number(signal.maxQuantityQuintals) || Infinity;
  const qtyMatch = qty >= minQty && qty <= maxQty;
  if (qtyMatch) {
    reasons.push(`Lot quantity ${qty}q within demand range ${minQty}–${maxQty}q`);
  } else if (qty < minQty) {
    blockers.push(`Lot quantity ${qty}q below demand minimum ${minQty}q`);
  } else {
    blockers.push(`Lot quantity ${qty}q exceeds demand maximum ${maxQty}q`);
  }

  // Grade check
  if (signal.requiredGrade) {
    const lotRank = GRADE_RANK[lot.grade] || 0;
    const reqRank = GRADE_RANK[signal.requiredGrade] || 0;
    if (lotRank >= reqRank) {
      reasons.push(`Lot grade ${lot.grade} meets demand requirement ${signal.requiredGrade}`);
    } else if (lot.grade === 'Unassessed') {
      reasons.push(`Lot grade unassessed — demand requires ${signal.requiredGrade} or better`);
    } else {
      blockers.push(`Lot grade ${lot.grade} below demand requirement ${signal.requiredGrade}`);
    }
  }

  // Quality checks (if demand signal has quality requirements)
  const quality = signal.requiredQuality || {};
  if (quality.maxMoisturePct != null && lot.moisturePct != null) {
    if (lot.moisturePct <= quality.maxMoisturePct) {
      reasons.push(`Moisture ${lot.moisturePct}% within demand limit ${quality.maxMoisturePct}%`);
    } else {
      blockers.push(`Moisture ${lot.moisturePct}% exceeds demand limit ${quality.maxMoisturePct}%`);
    }
  }
  if (quality.maxDamagePct != null && lot.damagePct != null) {
    if (lot.damagePct <= quality.maxDamagePct) {
      reasons.push(`Damage ${lot.damagePct}% within demand limit ${quality.maxDamagePct}%`);
    } else {
      blockers.push(`Damage ${lot.damagePct}% exceeds demand limit ${quality.maxDamagePct}%`);
    }
  }

  // Trust tier
  reasons.push(`Buyer trust tier: ${signal.buyerTrustTier || 'unknown'}`);

  // Overall assessment
  let matchLevel;
  if (blockers.length > 0) {
    matchLevel = 'NO_MATCH';
  } else if (reasons.length >= 4) {
    matchLevel = 'MATCH';
  } else {
    matchLevel = 'PARTIAL_MATCH';
  }

  return { matchLevel, reasons, blockers, freshness };
}

/**
 * Find all active demand signals compatible with a farmer's lot.
 * @param {Array} signals - all demand signals
 * @param {Object} lot - { crop, quantityQuintals, grade, size, moisturePct, damagePct, district }
 * @param {Date} [now] - current time (injectable)
 * @returns {Array} compatible signals with match assessment, sorted by match quality
 */
function findCompatibleDemands(signals, lot, now = new Date()) {
  if (!Array.isArray(signals) || !lot) return [];

  const results = [];
  for (const signal of signals) {
    const match = matchLotToSignal(lot, signal, now);
    results.push({
      signalId: signal.id,
      buyerId: signal.buyerId,
      buyerName: signal.buyerName,
      buyerTrustTier: signal.buyerTrustTier,
      crop: signal.crop,
      district: signal.district,
      quantityRange: { min: signal.minQuantityQuintals, max: signal.maxQuantityQuintals },
      requiredGrade: signal.requiredGrade,
      requiredQuality: signal.requiredQuality,
      preferredMarket: signal.preferredMarket,
      classification: signal.classification,
      demandStatus: signal.demandStatus,
      validFrom: signal.validFrom,
      validUntil: signal.validUntil,
      demandEvidence: signal.demandEvidence,
      matchLevel: match.matchLevel,
      reasons: match.reasons,
      blockers: match.blockers,
      freshness: match.freshness,
    });
  }

  // Sort: MATCH > PARTIAL_MATCH > NO_MATCH > NO_DEMAND > UNKNOWN
  const order = { MATCH: 0, PARTIAL_MATCH: 1, NO_MATCH: 2, NO_DEMAND: 3, UNKNOWN: 4 };
  results.sort((a, b) => (order[a.matchLevel] ?? 9) - (order[b.matchLevel] ?? 9));

  return results;
}

/**
 * Summarize demand coverage for a lot.
 * @param {Array} signals - all demand signals
 * @param {Object} lot - { crop, quantityQuintals, grade, size, moisturePct, damagePct, district }
 * @param {Date} [now] - current time (injectable)
 * @returns {Object} demand coverage summary
 */
function assessDemandCoverage(signals, lot, now = new Date()) {
  const allMatches = findCompatibleDemands(signals, lot, now);
  // Only count signals that are both ACTIVE freshness AND actually compatible
  // (MATCH or PARTIAL_MATCH). A signal that is fresh but NO_MATCH on crop/district
  // is not "active demand" for this lot.
  const activeMatches = allMatches.filter(m => m.freshness?.state === 'ACTIVE' && (m.matchLevel === 'MATCH' || m.matchLevel === 'PARTIAL_MATCH'));
  const strongMatches = activeMatches.filter(m => m.matchLevel === 'MATCH');
  const partialMatches = activeMatches.filter(m => m.matchLevel === 'PARTIAL_MATCH');

  const hasActiveDemand = activeMatches.length > 0;
  const hasStrongDemand = strongMatches.length > 0;

  // Determine actionability
  let actionability;
  if (!hasActiveDemand) {
    const expiredCount = allMatches.filter(m => m.freshness?.state === 'EXPIRED').length;
    const pausedCount = allMatches.filter(m => m.freshness?.state === 'PAUSED').length;
    actionability = {
      status: 'NO_ACTIVE_DEMAND',
      reason: expiredCount > 0
        ? `${expiredCount} demand signal(s) expired — no active demand for this crop/district`
        : pausedCount > 0
        ? `${pausedCount} demand signal(s) paused by buyer — no active demand`
        : 'No demand signals found for this crop and district',
    };
  } else if (hasStrongDemand) {
    actionability = {
      status: 'ACTIVE_DEMAND_EXISTS',
      reason: `${strongMatches.length} active demand signal(s) fully compatible with this lot`,
    };
  } else {
    actionability = {
      status: 'PARTIAL_DEMAND_EXISTS',
      reason: `${partialMatches.length} active demand signal(s) partially compatible — some quality or quantity gaps`,
    };
  }

  return {
    hasActiveDemand,
    hasStrongDemand,
    strongCount: strongMatches.length,
    partialCount: partialMatches.length,
    activeCount: activeMatches.length,
    totalCount: allMatches.length,
    actionability,
    matches: activeMatches,
    allMatches,
    dataBasis: 'Demand signals are time-bounded buyer intent from the demo directory. A MATCH means the lot satisfies the declared demand criteria — it does not guarantee a transaction.',
  };
}

module.exports = { matchLotToSignal, findCompatibleDemands, assessDemandCoverage };

// Quality requirement matching — structured comparison of lot quality fields
// against buyer quality requirements. Returns MATCH / PARTIAL / NO_MATCH / UNKNOWN.
// No AI, no computer vision — farmer-entered data is the source of truth.

const GRADE_RANK = { A: 3, B: 2, C: 1, Unassessed: 0 };

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Match a lot's quality fields against a buyer's quality requirements.
 * @param {Object} lotQuality - { grade, size, moisturePct, damagePct }
 * @param {Object} req - buyer quality requirements
 * @returns {{ matchLevel, reasons, blockers }}
 */
function matchQuality(lotQuality, req) {
  if (!req) return { matchLevel: 'UNKNOWN', reasons: ['No quality requirements specified'], blockers: [] };

  const reasons = [];
  const blockers = [];
  let matchScore = 0;
  let totalChecks = 0;

  // Grade check
  if (req.minGrade && lotQuality.grade) {
    totalChecks++;
    const lotRank = GRADE_RANK[lotQuality.grade] || 0;
    const minRank = GRADE_RANK[req.minGrade] || 0;
    if (lotRank >= minRank) {
      matchScore++;
      reasons.push(`Grade ${lotQuality.grade} meets minimum ${req.minGrade}`);
    } else if (lotQuality.grade === 'Unassessed') {
      reasons.push(`Grade unassessed — buyer requires ${req.minGrade} or better`);
    } else {
      blockers.push(`Grade ${lotQuality.grade} below minimum ${req.minGrade}`);
    }
  }

  // Moisture check
  if (req.maxMoisturePct != null && lotQuality.moisturePct != null) {
    totalChecks++;
    if (lotQuality.moisturePct <= req.maxMoisturePct) {
      matchScore++;
      reasons.push(`Moisture ${lotQuality.moisturePct}% within ${req.maxMoisturePct}% limit`);
    } else {
      blockers.push(`Moisture ${lotQuality.moisturePct}% exceeds ${req.maxMoisturePct}% limit`);
    }
  }

  // Damage check
  if (req.maxDamagePct != null && lotQuality.damagePct != null) {
    totalChecks++;
    if (lotQuality.damagePct <= req.maxDamagePct) {
      matchScore++;
      reasons.push(`Damage ${lotQuality.damagePct}% within ${req.maxDamagePct}% limit`);
    } else {
      blockers.push(`Damage ${lotQuality.damagePct}% exceeds ${req.maxDamagePct}% limit`);
    }
  }

  // Size preference (soft — informational, not a blocker)
  if (req.sizePreference && lotQuality.size) {
    if (norm(lotQuality.size) === norm(req.sizePreference)) {
      reasons.push(`Size ${lotQuality.size} matches preference`);
    } else {
      reasons.push(`Size ${lotQuality.size} differs from preference ${req.sizePreference}`);
    }
  }

  if (totalChecks === 0) {
    return { matchLevel: 'UNKNOWN', reasons: ['No comparable quality fields between lot and requirement'], blockers: [] };
  }

  if (blockers.length > 0) return { matchLevel: 'NO_MATCH', reasons, blockers };
  if (matchScore === totalChecks) return { matchLevel: 'MATCH', reasons, blockers };
  return { matchLevel: 'PARTIAL', reasons, blockers };
}

/**
 * Find all buyer requirements compatible with a given lot.
 * @param {Array} requirements - buyer requirements list
 * @param {Object} lot - { crop, quantityQuintals, grade, size, moisturePct, damagePct, district }
 * @returns {Array} matched requirements with matchLevel and quality assessment
 */
function findCompatibleRequirements(requirements, lot) {
  if (!Array.isArray(requirements) || !lot) return [];

  const results = [];
  for (const req of requirements) {
    // Crop match
    if (norm(req.crop) !== norm(lot.crop)) continue;

    // Quantity range check
    const qty = Number(lot.quantityQuintals) || 0;
    const qMin = req.quantityRange?.min || 0;
    const qMax = req.quantityRange?.max || Infinity;
    if (qty < qMin || qty > qMax) continue;

    // District/proximity check
    const districts = (req.serviceDistricts || []).map(norm);
    const lotDistrict = norm(lot.district);
    const districtMatch = districts.includes(lotDistrict);

    // Quality match
    const quality = matchQuality({
      grade: lot.grade,
      size: lot.size,
      moisturePct: lot.moisturePct,
      damagePct: lot.damagePct,
    }, req.qualityRequirements);

    results.push({
      requirementId: req.id,
      buyerId: req.buyerId,
      buyerName: req.buyerName,
      crop: req.crop,
      quantityRange: req.quantityRange,
      qualityMatch: quality,
      districtMatch,
      serviceDistricts: req.serviceDistricts,
      preferredDeliveryWindow: req.preferredDeliveryWindow,
      paymentTerms: req.paymentTerms,
      label: req.label,
      overallCompatibility: quality.matchLevel === 'NO_MATCH' ? 'INCOMPATIBLE'
        : districtMatch ? (quality.matchLevel === 'MATCH' ? 'STRONG' : 'PARTIAL')
        : 'WEAK',
    });
  }

  // Sort: STRONG > PARTIAL > WEAK > INCOMPATIBLE
  const order = { STRONG: 0, PARTIAL: 1, WEAK: 2, INCOMPATIBLE: 3 };
  results.sort((a, b) => (order[a.overallCompatibility] || 9) - (order[b.overallCompatibility] || 9));

  return results;
}

module.exports = { matchQuality, findCompatibleRequirements, GRADE_RANK };

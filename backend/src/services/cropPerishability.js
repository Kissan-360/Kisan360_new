// Crop Perishability Service — pure functions, no I/O.
//
// Purpose: Deterministic storage-risk awareness based on crop-specific
// shelf-life evidence. This is an AWARENESS layer, not a prediction.
//
// Architecture:
//   cropPerishability.json → SOURCE_REFERENCE (static agricultural knowledge)
//   harvestDate → DERIVED (days since harvest)
//   risk level → DERIVED (from shelf-life range vs planned storage)
//   guidance → DERIVED (from risk level + evidence)
//
// This module NEVER:
//   - Predicts spoilage or loss percentages
//   - Claims storage is safe or unsafe
//   - Modifies pathway decision ranking
//   - Injects temperature or weather data
//   - Replaces the economic storage threshold

const fs = require('fs');
const path = require('path');

const PROFILES_FILE = path.join(__dirname, '..', 'data', 'cropPerishability.json');

let _profiles = null;
function loadProfiles() {
  if (_profiles) return _profiles;
  try {
    _profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch {
    _profiles = { meta: {}, profiles: [] };
  }
  return _profiles;
}

// ── Risk levels ────────────────────────────────────────────────────────────
// Deterministic classification based on planned storage duration relative to
// the crop's evidence-based shelf-life range.
const RISK = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
};

/**
 * Get the perishability profile for a crop.
 * @param {string} crop
 * @returns {Object|null} profile or null if not found
 */
function getPerishabilityProfile(crop) {
  if (!crop || typeof crop !== 'string') return null;
  const data = loadProfiles();
  const normalized = crop.trim().toLowerCase();
  return data.profiles.find(p => p.crop.toLowerCase() === normalized) || null;
}

/**
 * Parse a harvest date string into a Date object (date-only, no time).
 * Accepts ISO date strings (YYYY-MM-DD) and similar formats.
 * Returns { ok, date?, error? }
 */
function parseHarvestDate(harvestDate) {
  if (!harvestDate || typeof harvestDate !== 'string') {
    return { ok: false, error: 'missing' };
  }
  const trimmed = harvestDate.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  // Reject obvious non-dates
  if (trimmed.length < 8) return { ok: false, error: 'too_short' };

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'invalid_date' };

  // Reject future dates (allow today and past)
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) return { ok: false, error: 'future_date' };

  return { ok: true, date };
}

/**
 * Compute days since harvest (derived, integer).
 * @param {Date} harvestDate
 * @param {Date} [referenceDate] - defaults to now
 * @returns {number} whole days since harvest (0 = harvested today)
 */
function daysSinceHarvest(harvestDate, referenceDate) {
  const ref = referenceDate || new Date();
  const diffMs = ref.getTime() - harvestDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Compute remaining shelf life given days since harvest.
 * @param {Object} profile - perishability profile
 * @param {number} daysElapsed
 * @returns {{ remainingDaysMin, remainingDaysMax, expired }}
 */
function computeRemainingShelfLife(profile, daysElapsed) {
  if (!profile || !profile.shelfLifeDays) {
    return { remainingDaysMin: null, remainingDaysMax: null, expired: null };
  }
  const { min, max } = profile.shelfLifeDays;
  const remainingMax = Math.max(0, max - daysElapsed);
  const remainingMin = Math.max(0, min - daysElapsed);
  const expired = daysElapsed > max;
  return { remainingDaysMin: remainingMin, remainingDaysMax: remainingMax, expired };
}

/**
 * Compute storage risk based on planned storage duration against shelf-life evidence.
 *
 * Rules:
 *   plannedDays <= shelfLife.min → LOW
 *   plannedDays <= shelfLife.max → MODERATE
 *   plannedDays > shelfLife.max AND <= shelfLife.max * 1.5 → HIGH
 *   plannedDays > shelfLife.max * 1.5 → CRITICAL
 *   No profile found → INSUFFICIENT_EVIDENCE
 *
 * @param {Object} profile - perishability profile (or null)
 * @param {number} daysSinceHarvest
 * @param {number} plannedStorageDays
 * @returns {{ riskLevel, reason, classification }}
 */
function computeStorageRisk(profile, daysSinceHarvest, plannedStorageDays) {
  if (!profile || !profile.shelfLifeDays) {
    return {
      riskLevel: RISK.INSUFFICIENT_EVIDENCE,
      reason: `No perishability evidence available for this crop. Storage risk cannot be assessed.`,
      classification: 'DERIVED',
    };
  }

  const { min, max } = profile.shelfLifeDays;
  const totalExposure = daysSinceHarvest + plannedStorageDays;

  if (plannedStorageDays <= 0) {
    return {
      riskLevel: RISK.LOW,
      reason: `Planned storage duration is ${plannedStorageDays} day(s) — no extended storage risk.`,
      classification: 'DERIVED',
    };
  }

  if (totalExposure <= min) {
    return {
      riskLevel: RISK.LOW,
      reason: `Planned storage (${plannedStorageDays}d) combined with harvest age (${daysSinceHarvest}d) keeps total exposure (${totalExposure}d) within the lower bound of the shelf-life range (${min}-${max}d).`,
      classification: 'DERIVED',
    };
  }

  if (totalExposure <= max) {
    return {
      riskLevel: RISK.MODERATE,
      reason: `Planned storage (${plannedStorageDays}d) combined with harvest age (${daysSinceHarvest}d) brings total exposure (${totalExposure}d) within the upper range of the shelf-life evidence (${min}-${max}d). Risk increases as the upper bound approaches.`,
      classification: 'DERIVED',
    };
  }

  if (totalExposure <= max * 1.5) {
    return {
      riskLevel: RISK.HIGH,
      reason: `Planned storage (${plannedStorageDays}d) combined with harvest age (${daysSinceHarvest}d) brings total exposure (${totalExposure}d) beyond the shelf-life range (${min}-${max}d). Available storage-life evidence indicates elevated risk.`,
      classification: 'DERIVED',
    };
  }

  return {
    riskLevel: RISK.CRITICAL,
    reason: `Planned storage (${plannedStorageDays}d) combined with harvest age (${daysSinceHarvest}d) brings total exposure (${totalExposure}d) well beyond the shelf-life range (${min}-${max}d). Available evidence strongly suggests this storage duration is not supported for this crop.`,
    classification: 'DERIVED',
  };
}

/**
 * Get urgency guidance based on risk level and remaining shelf life.
 * @param {string} riskLevel
 * @param {Object} remainingShelfLife
 * @returns {string}
 */
function getUrgencyGuidance(riskLevel, remainingShelfLife) {
  switch (riskLevel) {
    case RISK.LOW:
      return 'Storage appears compatible with the crop evidence. Economic viability depends on the price threshold.';
    case RISK.MODERATE:
      return 'Storage is within the evidence range but approaching the upper bound. Prioritize timely sale within the planned window.';
    case RISK.HIGH:
      return 'Available storage-life evidence indicates elevated risk for this duration. Rapid sale or aggregation may be preferable.';
    case RISK.CRITICAL:
      return 'The planned storage duration significantly exceeds the supported shelf-life range for this crop. Consider immediate sale or aggregation.';
    case RISK.INSUFFICIENT_EVIDENCE:
    default:
      return 'Insufficient crop-specific evidence to assess storage risk. The economic threshold remains valid but perishability is unknown.';
  }
}

/**
 * Full perishability assessment for a crop, harvest date, and planned storage.
 * Pure function — no network or DB calls.
 *
 * @param {Object} params
 * @param {string} params.crop
 * @param {string} [params.harvestDate] - ISO date string
 * @param {number} [params.plannedStorageDays] - days to store
 * @param {Date} [params.referenceDate] - "today" for testing
 * @returns {Object} perishability assessment
 */
function assessPerishability({ crop, harvestDate, plannedStorageDays, referenceDate }) {
  const profile = getPerishabilityProfile(crop);

  // Harvest date handling
  const hdResult = harvestDate ? parseHarvestDate(harvestDate) : { ok: false, error: 'missing' };
  const harvestDateValid = hdResult.ok;
  const harvestDateError = hdResult.ok ? null : hdResult.error;

  // Days since harvest
  const daysElapsed = hdResult.ok ? daysSinceHarvest(hdResult.date, referenceDate) : null;

  // Remaining shelf life
  const remainingShelfLife = daysElapsed !== null ? computeRemainingShelfLife(profile, daysElapsed) : {
    remainingDaysMin: null, remainingDaysMax: null, expired: null,
  };

  // Storage risk — clamp negative to 0
  const plannedDays = Math.max(0, Number(plannedStorageDays) || 0);
  const risk = (daysElapsed !== null && plannedDays > 0)
    ? computeStorageRisk(profile, daysElapsed, plannedDays)
    : (profile
      ? { riskLevel: RISK.INSUFFICIENT_EVIDENCE, reason: 'Planned storage duration or harvest date not provided — risk cannot be assessed.', classification: 'DERIVED' }
      : { riskLevel: RISK.INSUFFICIENT_EVIDENCE, reason: `No perishability evidence available for "${crop}".`, classification: 'DERIVED' }
    );

  // Urgency guidance
  const guidance = getUrgencyGuidance(risk.riskLevel, remainingShelfLife);

  // Provenance
  const provenance = {
    cropProfile: profile ? profile.source : 'NOT_AVAILABLE',
    shelfLifeRange: profile ? 'SOURCE_REFERENCE' : 'NOT_AVAILABLE',
    daysSinceHarvest: daysElapsed !== null ? 'DERIVED' : 'NOT_AVAILABLE',
    riskLevel: risk.classification,
    guidance: 'DERIVED',
    forecast: false,
    prediction: false,
  };

  return {
    crop: crop || null,
    harvestDate: harvestDate || null,
    harvestDateValid,
    harvestDateError,
    daysSinceHarvest: daysElapsed,
    plannedStorageDays: Number.isFinite(plannedDays) && plannedDays > 0 ? plannedDays : null,
    shelfLife: profile ? profile.shelfLifeDays : null,
    remainingShelfLife: {
      min: remainingShelfLife.remainingDaysMin,
      max: remainingShelfLife.remainingDaysMax,
      expired: remainingShelfLife.expired,
    },
    riskLevel: risk.riskLevel,
    riskReason: risk.reason,
    guidance,
    storageConditions: profile ? profile.storageConditions : null,
    suitableStorageTypes: profile ? profile.suitableStorageTypes : null,
    riskNotes: profile ? profile.riskNotes : null,
    provenance,
    classification: 'DERIVED',
    note: 'This is an awareness layer based on crop-specific shelf-life evidence. It does not predict spoilage or replace the economic storage threshold.',
  };
}

/**
 * Compute scenario-based post-harvest loss (FARMER_ENTERED/SCENARIO only).
 * Never calls this "observed" — it is always a hypothetical.
 *
 * @param {Object} params
 * @param {number} params.quantityQuintals - original lot quantity
 * @param {number} params.lossPercentage - hypothetical loss % (0-100)
 * @param {string} [params.source] - 'FARMER_ENTERED' or 'SCENARIO'
 * @returns {Object} scenario loss calculation
 */
function computeScenarioLoss({ quantityQuintals, lossPercentage, source }) {
  const qty = Number(quantityQuintals) || 0;
  const lossPct = Number(lossPercentage) || 0;

  if (qty <= 0) return { ok: false, error: 'quantityQuintals must be positive' };
  if (lossPct < 0 || lossPct > 100) return { ok: false, error: 'lossPercentage must be between 0 and 100' };

  const lossAmount = Math.round(qty * (lossPct / 100) * 100) / 100;
  const saleableQuantity = Math.round((qty - lossAmount) * 100) / 100;

  return {
    ok: true,
    originalQuantity: qty,
    lossPercentage: lossPct,
    lossAmount,
    saleableQuantity,
    source: source || 'SCENARIO',
    classification: source === 'FARMER_ENTERED' ? 'FARMER_ENTERED' : 'SCENARIO',
    note: `Hypothetical scenario: if ${lossPct}% loss occurred on ${qty}q, saleable quantity would be ${saleableQuantity}q. This is a what-if calculation, not an observed measurement.`,
  };
}

module.exports = {
  RISK,
  loadProfiles,
  getPerishabilityProfile,
  parseHarvestDate,
  daysSinceHarvest,
  computeRemainingShelfLife,
  computeStorageRisk,
  getUrgencyGuidance,
  assessPerishability,
  computeScenarioLoss,
};

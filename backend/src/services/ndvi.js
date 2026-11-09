/**
 * NDVI (Normalized Difference Vegetation Index) helpers.
 *
 * Satellite imagery is not fetched here: no provider credentials are bundled
 * with the demo. This module does two honest things:
 *   1. Compute NDVI from user-supplied red/NIR reflectance (e.g. exported
 *      from any satellite provider the farmer already uses).
 *   2. Describe the district/crop context + thresholds so a future
 *      provider adapter has a stable contract.
 *
 * NDVI = (NIR − Red) / (NIR + Red). Reflectance inputs must be in [0, 1].
 * Classes use the standard vegetation-cover bands and are descriptive only —
 * they are not a yield prediction or a farm-level health diagnosis.
 */
const { findDistrict, getDistrictCoords } = require('../data/maharashtraDistricts');

const THRESHOLDS = [
  { max: 0, id: 'water_or_bare', label: 'Water / bare ground', guidance: 'Likely no green vegetation in this pixel — check water, rock, or harvested ground.' },
  { max: 0.2, id: 'very_sparse', label: 'Very sparse vegetation', guidance: 'Sparse cover — scout for bare patches and check irrigation/nutrient stress.' },
  { max: 0.4, id: 'sparse', label: 'Sparse vegetation', guidance: 'Low-to-moderate cover — compare with the same field on earlier dates before acting.' },
  { max: 0.6, id: 'moderate', label: 'Moderate vegetation', guidance: 'Moderate green cover — continue routine scouting and moisture checks.' },
  { max: 1, id: 'dense', label: 'Dense vegetation', guidance: 'Dense green cover — maintain current agronomy and watch for pests/disease.' },
];

function parseReflectance(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function validateReflectanceInput(body = {}) {
  const red = parseReflectance(body.red ?? body.redReflectance);
  const nir = parseReflectance(body.nir ?? body.nirReflectance ?? body.nearInfrared);
  const errors = [];
  if (red === null) errors.push('red reflectance must be a number between 0 and 1');
  if (nir === null) errors.push('nir reflectance must be a number between 0 and 1');
  return { errors, clean: { red, nir } };
}

function computeNdvi(red, nir) {
  const denom = Number(nir) + Number(red);
  if (!Number.isFinite(denom) || denom === 0) return null;
  return (Number(nir) - Number(red)) / denom;
}

function classifyNdvi(ndvi) {
  const n = Number(ndvi);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(-1, Math.min(1, n));
  const band = THRESHOLDS.find((t) => clamped <= t.max) || THRESHOLDS[THRESHOLDS.length - 1];
  return { id: band.id, label: band.label, guidance: band.guidance, thresholds: THRESHOLDS };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function buildNdviResult({ red, nir, crop = '', district = '', source = 'user-supplied reflectance' } = {}) {
  const { errors, clean } = validateReflectanceInput({ red, nir });
  if (errors.length > 0) return { ok: false, errors };
  const ndvi = computeNdvi(clean.red, clean.nir);
  if (ndvi === null) {
    return { ok: false, errors: ['red + nir reflectance must be greater than 0'] };
  }
  const classification = classifyNdvi(ndvi);
  return {
    ok: true,
    result: {
      ndvi: round3(ndvi),
      classification: classification.label,
      classificationId: classification.id,
      guidance: classification.guidance,
      inputs: { red: clean.red, nir: clean.nir },
      crop: crop || null,
      district: district || null,
      source,
      provenance: {
        method: 'NDVI = (NIR − Red) / (NIR + Red) from supplied reflectance',
        retrievedAt: new Date().toISOString(),
        note: 'Descriptive vegetation index only — not a yield prediction or farm-level diagnosis.',
      },
    },
  };
}

function buildNdviContext({ district = '', crop = '' } = {}) {
  const districtInfo = district ? findDistrict(district) : null;
  const coords = district ? getDistrictCoords(district) : null;
  return {
    available: false,
    reason: 'Satellite provider not configured — supply red/NIR reflectance to POST /api/market/ndvi, or configure a provider adapter.',
    district: districtInfo ? districtInfo.name : district || null,
    districtKnown: Boolean(districtInfo),
    coords: coords || null,
    crop: crop || null,
    requiredEnv: ['SATELLITE_API_URL', 'SATELLITE_API_KEY'],
    thresholds: THRESHOLDS,
    guidance: 'NDVI thresholds describe vegetation cover, not yield. Compare the same field across dates and confirm with field scouting before acting.',
  };
}

module.exports = {
  THRESHOLDS,
  parseReflectance,
  validateReflectanceInput,
  computeNdvi,
  classifyNdvi,
  buildNdviResult,
  buildNdviContext,
};

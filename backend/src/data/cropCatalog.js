/**
 * cropCatalog.js — Centralized Maharashtra crop reference.
 *
 * Every crop gets:
 *   - stable id
 *   - display name
 *   - aliases (for AGMARKNET normalization)
 *   - season (kharif/rabi/both)
 *   - major producing districts (regional reference)
 *   - soil suitability
 *   - water need
 *   - buyer coverage status
 *   - storage coverage status
 *
 * IMPORTANT: Having a crop here does NOT mean:
 *   - real market observations exist for it
 *   - buyer requirements exist for it
 *   - storage options exist for it
 *
 * Each status field is reported separately.
 */

// Alias-tolerant matching lives in marketCache (single source of truth for
// AGMARKNET spelling variance); the catalog delegates to it so coverage flags
// stay consistent with what the price routes actually serve.
const { cropMatches } = require('../services/marketCache');

const CROPS = [
  // ── Strong AGMARKNET coverage (10+ mandis) ───────────────────────
  {
    id: 'onion',
    name: 'Onion',
    aliases: ['Onion'],
    season: 'rabi',
    majorDistricts: ['Nashik', 'Pune', 'Ahmednagar', 'Solapur', 'Satara'],
    soilSuitability: { suitable: ['Black / Regur'], conditional: ['Red', 'Alluvial'] },
    waterNeed: 'moderate',
    marketCoverage: 'active',
    buyerCoverage: 'demo',
    storageCoverage: 'demo',
    qualityGrades: ['Grade A', 'Grade B', 'Grade C'],
  },
  {
    id: 'soybean',
    name: 'Soybean',
    aliases: ['Soyabean', 'Soybean', 'Soyabeen'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Amravati', 'Buldhana', 'Washim', 'Nagpur'],
    soilSuitability: { suitable: ['Black / Regur', 'Black / Mixed'], conditional: ['Mixed'] },
    waterNeed: 'moderate',
    marketCoverage: 'active',
    buyerCoverage: 'demo',
    storageCoverage: 'demo',
    qualityGrades: ['FAQ', 'Light', 'Heavy'],
  },
  {
    id: 'tomato',
    name: 'Tomato',
    aliases: ['Tomato'],
    season: 'both',
    majorDistricts: ['Pune', 'Nashik', 'Ahmednagar', 'Kolhapur', 'Solapur'],
    soilSuitability: { suitable: ['Black / Regur', 'Red', 'Alluvial'], conditional: ['Lateritic'] },
    waterNeed: 'high',
    marketCoverage: 'active',
    buyerCoverage: 'demo',
    storageCoverage: 'demo',
    qualityGrades: ['Grade A', 'Grade B'],
  },

  // ── Moderate AGMARKNET coverage (1–9 mandis) ────────────────────
  {
    id: 'cotton',
    name: 'Cotton',
    aliases: ['Cotton (Raw)', 'Cotton', 'Kapas'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Amravati', 'Washim', 'Yavatmal', 'Buldhana'],
    soilSuitability: { suitable: ['Black / Regur', 'Black / Mixed'], conditional: ['Red'] },
    waterNeed: 'moderate',
    marketCoverage: 'no_data',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['Fine', 'Medium', 'Bengal'],
  },
  {
    id: 'jowar',
    name: 'Jowar (Sorghum)',
    aliases: ['Jowar(Sorghum)', 'Jowar', 'Sorghum', 'Sorghum (Jowar)'],
    season: 'kharif',
    majorDistricts: ['Solapur', 'Sangli', 'Pune', 'Ahmednagar', 'Satara'],
    soilSuitability: { suitable: ['Black / Regur'], conditional: ['Red', 'Mixed'] },
    waterNeed: 'low',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'bajra',
    name: 'Bajra (Pearl Millet)',
    aliases: ['Bajra(Pearl Millet/Cumbu)', 'Bajra', 'Pearl Millet', 'Bajari'],
    season: 'kharif',
    majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Satara', 'Jalgaon'],
    soilSuitability: { suitable: ['Black / Regur', 'Red', 'Alluvial'], conditional: ['Lateritic'] },
    waterNeed: 'low',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'wheat',
    name: 'Wheat',
    aliases: ['Wheat', 'Gehu'],
    season: 'rabi',
    majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Satara', 'Solapur'],
    soilSuitability: { suitable: ['Black / Regur', 'Alluvial'], conditional: ['Red'] },
    waterNeed: 'moderate',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ', 'Durum'],
  },
  {
    id: 'tur-dal',
    name: 'Tur Dal (Pigeon Pea)',
    aliases: ['Red gram/Arhar/Tur(whole)', 'Tur', 'Arhar', 'Pigeon Pea', 'Tur Dal', 'Toor Dal'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Amravati', 'Washim', 'Nagpur', 'Buldhana'],
    soilSuitability: { suitable: ['Black / Regur', 'Black / Mixed'], conditional: ['Red'] },
    waterNeed: 'low',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'chilli',
    name: 'Chilli',
    aliases: ['Green Chilli', 'Chilli', 'Chili', 'Mirchi', 'Red Chilli'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Washim', 'Yavatmal', 'Amravati', 'Nagpur'],
    soilSuitability: { suitable: ['Black / Regur', 'Red'], conditional: ['Mixed'] },
    waterNeed: 'moderate',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ', 'Bold', 'Medium'],
  },
  {
    id: 'maize',
    name: 'Maize',
    aliases: ['Maize', 'Corn', 'Makka'],
    season: 'kharif',
    majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Jalgaon', 'Solapur'],
    soilSuitability: { suitable: ['Black / Regur', 'Alluvial', 'Red'], conditional: ['Lateritic'] },
    waterNeed: 'moderate',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'groundnut',
    name: 'Groundnut',
    aliases: ['Groundnut', 'Peanut', 'Moongfali'],
    season: 'kharif',
    majorDistricts: ['Jalgaon', 'Ahmednagar', 'Solapur', 'Sangli', 'Nashik'],
    soilSuitability: { suitable: ['Red', 'Sandy Loam'], conditional: ['Black / Regur'] },
    waterNeed: 'moderate',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ', 'Bold', 'Java'],
  },
  {
    id: 'sugarcane',
    name: 'Sugarcane',
    aliases: ['Sugarcane', 'Ganna'],
    season: 'annual',
    majorDistricts: ['Kolhapur', 'Sangli', 'Solapur', 'Pune', 'Ahmednagar'],
    soilSuitability: { suitable: ['Black / Regur', 'Alluvial'], conditional: ['Red'] },
    waterNeed: 'high',
    marketCoverage: 'no_data',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'grapes',
    name: 'Grapes',
    aliases: ['Grapes', 'Draksha'],
    season: 'rabi',
    majorDistricts: ['Nashik', 'Sangli', 'Pune'],
    soilSuitability: { suitable: ['Black / Regur', 'Red'], conditional: ['Alluvial'] },
    waterNeed: 'moderate',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['Export', 'Table', 'FAQ'],
  },
  {
    id: 'pomegranate',
    name: 'Pomegranate',
    aliases: ['Pomegranate', 'Anar', 'Dalimb'],
    season: 'rabi',
    majorDistricts: ['Solapur', 'Sangli', 'Ahmednagar', 'Pune'],
    soilSuitability: { suitable: ['Black / Regur', 'Red'], conditional: ['Mixed'] },
    waterNeed: 'low',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },

  // ── Additional crops with AGMARKNET observations ─────────────────
  {
    id: 'ginger',
    name: 'Ginger',
    aliases: ['Ginger(Green)', 'Ginger', 'Green Ginger'],
    season: 'kharif',
    majorDistricts: ['Pune', 'Nashik', 'Ahmednagar', 'Kolhapur', 'Sangli'],
    soilSuitability: { suitable: ['Red', 'Lateritic'], conditional: ['Black / Regur'] },
    waterNeed: 'high',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'black-gram',
    name: 'Black Gram (Urad)',
    aliases: ['Black Gram(Urd Beans)(Whole)', 'Black Gram', 'Urad', 'Urad Dal'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Amravati', 'Washim', 'Nagpur', 'Buldhana'],
    soilSuitability: { suitable: ['Black / Regur', 'Black / Mixed'], conditional: ['Red'] },
    waterNeed: 'low',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'green-gram',
    name: 'Green Gram (Moong)',
    aliases: ['Green Gram(Moong)(Whole)', 'Green Gram', 'Moong', 'Moong Dal'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Amravati', 'Washim', 'Nagpur', 'Buldhana'],
    soilSuitability: { suitable: ['Black / Regur', 'Black / Mixed'], conditional: ['Red'] },
    waterNeed: 'low',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'bengal-gram',
    name: 'Bengal Gram (Chana)',
    aliases: ['Bengal Gram(Gram)(Whole)', 'Bengal Gram', 'Chana', 'Chana Dal'],
    season: 'rabi',
    majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Satara', 'Solapur'],
    soilSuitability: { suitable: ['Black / Regur', 'Red'], conditional: ['Alluvial'] },
    waterNeed: 'low',
    marketCoverage: 'active',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'green-peas',
    name: 'Green Peas',
    aliases: ['Green Peas', 'Matar'],
    season: 'rabi',
    majorDistricts: ['Pune', 'Nashik', 'Ahmednagar', 'Satara', 'Solapur'],
    soilSuitability: { suitable: ['Black / Regur', 'Red'], conditional: ['Alluvial'] },
    waterNeed: 'moderate',
    marketCoverage: 'limited',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
];

/**
 * Normalize a crop name to the canonical id.
 * Returns null if no match.
 */
function normalizeCrop(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  // Direct id match
  const byId = CROPS.find(c => c.id === lower);
  if (byId) return byId;
  // Name match
  const byName = CROPS.find(c => c.name.toLowerCase() === lower);
  if (byName) return byName;
  // Alias match
  const byAlias = CROPS.find(c => c.aliases.some(a => a.toLowerCase() === lower));
  return byAlias || null;
}

/**
 * Get crop by id.
 */
function getCrop(id) {
  return CROPS.find(c => c.id === id) || null;
}

/**
 * Get all crops with active market coverage.
 */
/**
 * Get all crops with market data (active or limited coverage).
 * NOTE: This returns crops with static flags. For dynamic coverage
 * based on actual snapshot data, use getCoverageMatrix().cropCoverage.
 */
function getActiveMarketCrops() {
  return CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited');
}

/**
 * Enrich a crop object with dynamic market coverage from the snapshot.
 * Returns the crop with hasMarketData, observationCount, and districtsWithData.
 */
function enrichCropWithCoverage(crop, snapshotRows) {
  const candidates = [crop.name, ...(crop.aliases || [])];
  const matchingRows = (snapshotRows || []).filter(r =>
    candidates.some(c => cropMatches(r.crop, c))
  );
  const districts = [...new Set(matchingRows.map(r => (r.district || '').trim()))].filter(Boolean);
  return {
    ...crop,
    hasMarketData: matchingRows.length > 0,
    observationCount: matchingRows.length,
    districtsWithData: districts,
    dynamicMarketCoverage: matchingRows.length > 0 ? 'active' : 'catalog_only',
  };
}

/**
 * Check if a crop name matches any known alias.
 * Used by priceSnapshot.js for TARGET_CROPS filtering.
 */
function cropAliasMatch(inputCrop, targetCrop) {
  const input = normalizeCrop(inputCrop);
  const target = normalizeCrop(targetCrop);
  if (!input || !target) return false;
  return input.id === target.id;
}

module.exports = {
  CROPS,
  normalizeCrop,
  getCrop,
  getActiveMarketCrops,
  enrichCropWithCoverage,
  cropAliasMatch,
};

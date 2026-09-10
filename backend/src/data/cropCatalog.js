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

const CROPS = [
  // ── Currently supported (have AGMARKNET observations) ────────────
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

  // ── Major Maharashtra crops (no current AGMARKNET observations) ──
  {
    id: 'cotton',
    name: 'Cotton',
    aliases: ['Cotton', 'Kapas'],
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
    aliases: ['Jowar', 'Sorghum', 'Sorghum (Jowar)'],
    season: 'kharif',
    majorDistricts: ['Solapur', 'Sangli', 'Pune', 'Ahmednagar', 'Satara'],
    soilSuitability: { suitable: ['Black / Regur'], conditional: ['Red', 'Mixed'] },
    waterNeed: 'low',
    marketCoverage: 'no_data',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'bajra',
    name: 'Bajra (Pearl Millet)',
    aliases: ['Bajra', 'Pearl Millet', 'Bajari'],
    season: 'kharif',
    majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Satara', 'Jalgaon'],
    soilSuitability: { suitable: ['Black / Regur', 'Red', 'Alluvial'], conditional: ['Lateritic'] },
    waterNeed: 'low',
    marketCoverage: 'no_data',
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
    marketCoverage: 'no_data',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ', 'Durum'],
  },
  {
    id: 'tur-dal',
    name: 'Tur Dal (Pigeon Pea)',
    aliases: ['Tur', 'Arhar', 'Pigeon Pea', 'Tur Dal', 'Toor Dal'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Amravati', 'Washim', 'Nagpur', 'Buldhana'],
    soilSuitability: { suitable: ['Black / Regur', 'Black / Mixed'], conditional: ['Red'] },
    waterNeed: 'low',
    marketCoverage: 'no_data',
    buyerCoverage: 'none',
    storageCoverage: 'none',
    qualityGrades: ['FAQ'],
  },
  {
    id: 'chilli',
    name: 'Chilli',
    aliases: ['Chilli', 'Chili', 'Mirchi', 'Red Chilli'],
    season: 'kharif',
    majorDistricts: ['Akola', 'Washim', 'Yavatmal', 'Amravati', 'Nagpur'],
    soilSuitability: { suitable: ['Black / Regur', 'Red'], conditional: ['Mixed'] },
    waterNeed: 'moderate',
    marketCoverage: 'no_data',
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
    marketCoverage: 'no_data',
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
    marketCoverage: 'no_data',
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
    marketCoverage: 'no_data',
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
    marketCoverage: 'no_data',
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
 * Get all crops with active market coverage.
 * NOTE: This returns crops with static 'active' flag. For dynamic coverage
 * based on actual snapshot data, use getCoverageMatrix().cropCoverage.
 */
function getActiveMarketCrops() {
  return CROPS.filter(c => c.marketCoverage === 'active');
}

/**
 * Enrich a crop object with dynamic market coverage from the snapshot.
 * Returns the crop with hasMarketData, observationCount, and districtsWithData.
 */
function enrichCropWithCoverage(crop, snapshotRows) {
  const matchingRows = (snapshotRows || []).filter(r => {
    const rc = (r.crop || '').toLowerCase();
    return rc === crop.name.toLowerCase() || (crop.aliases || []).some(a => a.toLowerCase() === rc);
  });
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

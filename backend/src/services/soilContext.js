/**
 * soilContext.js — Regional soil intelligence layer.
 *
 * Provides REGIONAL REFERENCE soil context for Maharashtra districts.
 *
 * IMPORTANT DISTINCTION:
 *   This is NOT farm-verified soil data.
 *   This is regional agro-climatic reference context.
 *
 *   "Soil context: Medium black soil — regional reference for Nashik district"
 *   NOT:
 *   "Your farm has 42% clay content"
 *
 * Soil types in Maharashtra:
 *   Black / Regur — most of Deccan plateau (cotton, soybean, onion, jowar)
 *   Red — coastal & eastern hills (rice, groundnut, pulses)
 *   Alluvial — river valleys (wheat, sugarcane, vegetables)
 *   Lateritic — Western Ghats coast (coconut, cashew, rice)
 *   Mixed / transitional — border zones
 */

const { findDistrict } = require('../data/maharashtraDistricts');

/**
 * Soil type descriptions for reference.
 */
const SOIL_DESCRIPTIONS = {
  'Black / Regur': {
    description: 'Deep black clay soil (vertisol) — retains moisture well, rich in calcium and magnesium.',
    suitableCrops: ['Cotton', 'Soybean', 'Onion', 'Jowar', 'Wheat', 'Sugarcane', 'Chilli'],
    limitations: ['Poor drainage in heavy rainfall; may crack in dry season.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Black / Mixed': {
    description: 'Black soil with moderate clay content — semi-arid Deccan transitional zone.',
    suitableCrops: ['Cotton', 'Soybean', 'Tur Dal', 'Jowar', 'Maize'],
    limitations: ['Variable depth; may have gravel subsoil in hilly areas.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Red': {
    description: 'Iron-rich red soil (ultisol/alfisol) — well-drained, lower fertility than black soil.',
    suitableCrops: ['Groundnut', 'Maize', 'Rice', 'Pulses', 'Onion'],
    limitations: ['Lower organic matter; needs regular amendment.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Alluvial': {
    description: 'River-deposited sediment — fertile, loose texture, good for intensive cultivation.',
    suitableCrops: ['Wheat', 'Sugarcane', 'Vegetables', 'Maize', 'Rice'],
    limitations: ['Flood-prone in low-lying areas; variable depth.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Lateritic': {
    description: 'Iron/aluminum-rich soil from heavy rainfall weathering — acidic, low fertility.',
    suitableCrops: ['Rice', 'Cashew', 'Coconut', 'Spices', 'Fruits'],
    limitations: ['Highly acidic; needs lime application. Low nutrient retention.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Lateritic / Black': {
    description: 'Mixed lateritic and black soil transition zone.',
    suitableCrops: ['Rice', 'Sugarcane', 'Onion', 'Fruits'],
    limitations: ['Variable fertility depending on exact location.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Lateritic / Red': {
    description: 'Lateritic red soil — coastal Konkan hills.',
    suitableCrops: ['Rice', 'Cashew', 'Coconut', 'Spices'],
    limitations: ['Steep terrain in places; erosion risk.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Lateritic / Mixed': {
    description: 'Mixed lateritic soil with varying clay content.',
    suitableCrops: ['Rice', 'Cashew', 'Fruits'],
    limitations: ['Variable; location-dependent.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Alluvial / Mixed': {
    description: 'River valley alluvium mixed with local soil types.',
    suitableCrops: ['Rice', 'Wheat', 'Vegetables', 'Pulses'],
    limitations: ['Flood risk in monsoon; variable depth.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
  'Sandy Loam': {
    description: 'Sandy-textured soil — good drainage, lower water retention.',
    suitableCrops: ['Groundnut', 'Watermelon', 'Onion', 'Potato'],
    limitations: ['Low water-holding capacity; needs irrigation.'],
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
  },
};

/**
 * Get soil context for a district.
 * Returns structured reference — NOT farm-verified data.
 */
function getSoilContext(districtName) {
  const district = findDistrict(districtName);
  if (!district) {
    return {
      status: 'UNKNOWN',
      soilType: null,
      description: null,
      classification: 'REFERENCE',
      source: null,
      message: `District "${districtName}" not found in Maharashtra registry.`,
    };
  }

  const soilKey = district.soil;
  const soilInfo = SOIL_DESCRIPTIONS[soilKey];

  return {
    status: 'AVAILABLE',
    district: district.name,
    soilType: soilKey,
    description: soilInfo ? soilInfo.description : 'Regional soil type reference.',
    suitableCrops: soilInfo ? soilInfo.suitableCrops : [],
    limitations: soilInfo ? soilInfo.limitations : [],
    agroClimatic: district.agroClimatic,
    region: district.region,
    classification: 'REFERENCE',
    source: 'Maharashtra Soil Survey & Conservation Department — regional reference',
    disclaimer: 'This is a regional soil context reference. It does not represent farm-level soil composition.',
  };
}

/**
 * Check crop suitability with soil context.
 * Returns structured match — NOT a percentage score.
 */
function checkCropSoilSuitability(cropName, districtName) {
  const crop = require('../data/cropCatalog').normalizeCrop(cropName);
  const district = findDistrict(districtName);

  if (!crop) {
    return {
      status: 'UNKNOWN',
      reason: `Crop "${cropName}" not found in catalog.`,
      classification: 'UNKNOWN',
    };
  }

  if (!district) {
    return {
      status: 'UNKNOWN',
      reason: `District "${districtName}" not found in registry.`,
      classification: 'UNKNOWN',
    };
  }

  const soilType = district.soil;
  const suitability = crop.soilSuitability;

  if (!suitability) {
    return {
      status: 'UNKNOWN',
      crop: crop.name,
      district: district.name,
      soilType,
      reason: `No soil suitability data available for ${crop.name}.`,
      classification: 'UNKNOWN',
    };
  }

  // Check if soil type is in the suitable list
  const isSuitable = suitability.suitable.some(s => soilType.includes(s) || soilType === s);
  const isConditional = !isSuitable && suitability.conditional.some(s => soilType.includes(s) || soilType === s);

  if (isSuitable) {
    return {
      status: 'SUITABLE',
      crop: crop.name,
      district: district.name,
      soilType,
      reason: `Regional soil context (${soilType}) is compatible with ${crop.name}.`,
      classification: 'DERIVED',
      source: 'Regional soil reference + crop catalog',
    };
  }

  if (isConditional) {
    return {
      status: 'CONDITIONALLY_SUITABLE',
      crop: crop.name,
      district: district.name,
      soilType,
      reason: `Regional soil context (${soilType}) is conditionally compatible with ${crop.name}. Results may vary with local conditions.`,
      classification: 'DERIVED',
      source: 'Regional soil reference + crop catalog',
    };
  }

  return {
    status: 'NOT_ENOUGH_EVIDENCE',
    crop: crop.name,
    district: district.name,
    soilType,
    reason: `Regional soil context (${soilType}) is not typically associated with ${crop.name} cultivation in Maharashtra.`,
    classification: 'DERIVED',
    source: 'Regional soil reference + crop catalog',
  };
}

module.exports = {
  getSoilContext,
  checkCropSoilSuitability,
  SOIL_DESCRIPTIONS,
};

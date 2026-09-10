/**
 * farmContext.js — Centralized farm context object (v2).
 *
 * Composes:
 *   location + soil + weather + season + crop → FarmContext
 *
 * Does NOT create a fake farm database.
 * Uses farmer-selected district as the minimum valid context.
 *
 * Architecture separation:
 *   FARM CONTEXT → location, soil, weather, season, crop suitability
 *   MARKET CONTEXT → observations, distance, transport, net realization
 *   DECISION → combines only explicitly defensible inputs
 *
 * Soil/weather do NOT modify market prices or transport costs.
 */

const { findDistrict } = require('../data/maharashtraDistricts');
const { normalizeCrop, getCrop } = require('../data/cropCatalog');
const { getSoilContext, checkCropSoilSuitability } = require('./soilContext');

// ── Season model ──────────────────────────────────────────────────────────
// Maharashtra crop seasons (reference, not farmer-specific calendar).
const SEASON_CONTEXT = {
  kharif: {
    label: 'Kharif (monsoon)',
    months: 'June – October',
    description: 'Monsoon-season crops sown at onset of rains.',
    classification: 'REFERENCE',
    source: 'Directorate of Economics & Statistics, Ministry of Agriculture',
  },
  rabi: {
    label: 'Rabi (winter)',
    months: 'October – March',
    description: 'Winter-season crops sown after monsoon withdrawal.',
    classification: 'REFERENCE',
    source: 'Directorate of Economics & Statistics, Ministry of Agriculture',
  },
  zaid: {
    label: 'Zaid (summer)',
    months: 'March – June',
    description: 'Summer-season crops between rabi harvest and kharif sowing.',
    classification: 'REFERENCE',
    source: 'Directorate of Economics & Statistics, Ministry of Agriculture',
  },
  both: {
    label: 'Kharif + Rabi',
    months: 'Year-round (two seasons)',
    description: 'Can be cultivated in both kharif and rabi seasons.',
    classification: 'REFERENCE',
    source: 'Directorate of Economics & Statistics, Ministry of Agriculture',
  },
  annual: {
    label: 'Annual / Perennial',
    months: 'Year-round',
    description: 'Perennial or long-duration crop not tied to a single season.',
    classification: 'REFERENCE',
    source: 'Directorate of Economics & Statistics, Ministry of Agriculture',
  },
};

// ── District × crop relevance (reference) ────────────────────────────────
// Based on Maharashtra agricultural statistics — major producing districts.
// Classification: MAJOR, COMMON, CONDITIONAL, UNKNOWN
const DISTRICT_CROP_RELEVANCE = {
  // Onion — major in Nashik belt
  onion: {
    MAJOR: ['Nashik', 'Pune', 'Ahmednagar'],
    COMMON: ['Solapur', 'Satara', 'Jalgaon'],
    CONDITIONAL: ['Kolhapur', 'Sangli', 'Latur'],
  },
  // Soybean — Vidarbha belt
  soybean: {
    MAJOR: ['Akola', 'Amravati', 'Buldhana', 'Washim', 'Nagpur'],
    COMMON: ['Yavatmal', 'Chandrapur', 'Wardha', 'Jalna', 'Hingoli'],
    CONDITIONAL: ['Nashik', 'Jalgaon', 'Dhule'],
  },
  // Tomato — widespread
  tomato: {
    MAJOR: ['Pune', 'Nashik', 'Ahmednagar'],
    COMMON: ['Kolhapur', 'Solapur', 'Satara', 'Sangli'],
    CONDITIONAL: ['Jalgaon', 'Latur', 'Parbhani'],
  },
  // Cotton — Vidarbha + Marathwada
  cotton: {
    MAJOR: ['Akola', 'Amravati', 'Washim', 'Yavatmal', 'Buldhana'],
    COMMON: ['Nagpur', 'Wardha', 'Chandrapur', 'Jalna', 'Hingoli'],
    CONDITIONAL: ['Nanded', 'Parbhani', 'Beed', 'Osmanabad'],
  },
  // Jowar — Deccan plateau
  jowar: {
    MAJOR: ['Solapur', 'Sangli', 'Pune', 'Ahmednagar'],
    COMMON: ['Satara', 'Kolhapur', 'Jalgaon', 'Nashik'],
    CONDITIONAL: ['Latur', 'Beed', 'Osmanabad'],
  },
  // Wheat — rabi belt
  wheat: {
    MAJOR: ['Ahmednagar', 'Pune', 'Nashik', 'Satara'],
    COMMON: ['Solapur', 'Jalgaon', 'Sangli'],
    CONDITIONAL: ['Kolhapur', 'Latur', 'Dhule'],
  },
  // Maize — widespread
  maize: {
    MAJOR: ['Ahmednagar', 'Pune', 'Nashik'],
    COMMON: ['Jalgaon', 'Solapur', 'Satara', 'Sangli'],
    CONDITIONAL: ['Kolhapur', 'Latur', 'Akola'],
  },
  // Groundnut
  groundnut: {
    MAJOR: ['Jalgaon', 'Ahmednagar'],
    COMMON: ['Solapur', 'Sangli', 'Nashik', 'Pune'],
    CONDITIONAL: ['Satara', 'Kolhapur'],
  },
  // Sugarcane
  sugarcane: {
    MAJOR: ['Kolhapur', 'Sangli', 'Solapur'],
    COMMON: ['Pune', 'Ahmednagar', 'Satara'],
    CONDITIONAL: ['Nashik', 'Jalgaon'],
  },
};

// ── Weather-based agricultural context ────────────────────────────────────
// Only produces explicit operational flags where defensible.
function getWeatherAgriculturalContext(crop, weatherData) {
  if (!weatherData || !weatherData.current) {
    return {
      status: 'INSUFFICIENT_DATA',
      reason: 'No weather data available for agricultural context.',
      flags: [],
      classification: 'UNKNOWN',
    };
  }

  const temp = weatherData.current.temperature;
  const humidity = weatherData.current.humidity;
  const windSpeed = weatherData.current.windSpeed;
  const rain = weatherData.current.precipitation || 0;
  const condition = (weatherData.current.condition || '').toLowerCase();

  const flags = [];

  // Temperature flags
  if (temp > 40) {
    flags.push({ type: 'HIGH_HEAT', severity: 'WARNING', message: `Temperature ${temp}°C — heat stress risk for most crops.` });
  } else if (temp > 35) {
    flags.push({ type: 'HIGH_HEAT', severity: 'CAUTION', message: `Temperature ${temp}°C — warm conditions, monitor irrigation.` });
  } else if (temp < 5) {
    flags.push({ type: 'FROST_RISK', severity: 'WARNING', message: `Temperature ${temp}°C — frost risk for sensitive crops.` });
  } else if (temp < 10) {
    flags.push({ type: 'COLD', severity: 'CAUTION', message: `Temperature ${temp}°C — cold conditions.` });
  }

  // Humidity flags
  if (humidity > 85) {
    flags.push({ type: 'HIGH_HUMIDITY', severity: 'CAUTION', message: `Humidity ${humidity}% — fungal disease risk.` });
  } else if (humidity < 25) {
    flags.push({ type: 'LOW_HUMIDITY', severity: 'CAUTION', message: `Humidity ${humidity}% — increase irrigation frequency.` });
  }

  // Rain/wind flags
  if (rain > 10) {
    flags.push({ type: 'HIGH_RAINFALL', severity: 'CAUTION', message: `Active rainfall ${rain}mm — delay field operations.` });
  }
  if (windSpeed > 40) {
    flags.push({ type: 'HIGH_WIND', severity: 'CAUTION', message: `Wind ${windSpeed} km/h — potential crop damage.` });
  }

  // Storm condition
  if (condition.includes('thunderstorm') || condition.includes('storm')) {
    flags.push({ type: 'STORM', severity: 'WARNING', message: `Active storm conditions — seek shelter, secure crops.` });
  }

  const hasWarning = flags.some(f => f.severity === 'WARNING');
  const hasCaution = flags.some(f => f.severity === 'CAUTION');

  return {
    status: hasWarning ? 'WARNING' : hasCaution ? 'CAUTION' : 'NO_ALERT',
    reason: flags.length > 0
      ? flags.map(f => f.message).join(' ')
      : 'Current weather conditions are within normal agricultural ranges.',
    flags,
    classification: 'FACT',
    source: 'OpenWeatherMap API — live observation',
    disclaimer: 'Weather flags are operational context, not price or yield predictions.',
  };
}

// ── Main FarmContext creation ─────────────────────────────────────────────
/**
 * Create a FarmContext from farmer inputs.
 * @param {Object} params
 * @param {string} params.district - farmer's district name
 * @param {string} params.crop - selected crop name
 * @param {number} [params.quantity] - quantity in quintals
 * @param {string} [params.grade] - quality grade
 * @param {number} [params.lat] - exact farm latitude (optional)
 * @param {number} [params.lon] - exact farm longitude (optional)
 * @param {Object} [params.weatherData] - weather data from /api/weather (optional)
 */
function createFarmContext({ district, crop, quantity, grade, lat, lon, weatherData } = {}) {
  const districtData = findDistrict(district);
  const cropData = normalizeCrop(crop);

  // ── Location ──
  const coords = (lat && lon)
    ? { lat, lon, precision: 'FARM_EXACT', source: 'farmer-provided' }
    : districtData
      ? { lat: districtData.lat, lon: districtData.lon, precision: 'DISTRICT_REFERENCE', source: 'district-centroid' }
      : null;

  // ── Soil (regional reference) ──
  const soil = district ? getSoilContext(district) : null;

  // ── Season ──
  const seasonKey = cropData ? cropData.season : null;
  const seasonCtx = seasonKey ? SEASON_CONTEXT[seasonKey] : null;

  // ── Crop suitability (soil + season + agro-climatic) ──
  const suitability = (crop && district) ? checkCropSoilSuitability(crop, district) : null;

  // ── District × crop relevance ──
  const cropId = cropData ? cropData.id : null;
  const relevanceMap = cropId ? DISTRICT_CROP_RELEVANCE[cropId] : null;
  let districtCropRelevance = null;
  if (relevanceMap && districtData) {
    if (relevanceMap.MAJOR && relevanceMap.MAJOR.includes(districtData.name)) {
      districtCropRelevance = { status: 'MAJOR', reason: `${districtData.name} is a major producing district for ${cropData.name}.` };
    } else if (relevanceMap.COMMON && relevanceMap.COMMON.includes(districtData.name)) {
      districtCropRelevance = { status: 'COMMON', reason: `${districtData.name} commonly grows ${cropData.name}.` };
    } else if (relevanceMap.CONDITIONAL && relevanceMap.CONDITIONAL.includes(districtData.name)) {
      districtCropRelevance = { status: 'CONDITIONAL', reason: `${districtData.name} has conditional relevance for ${cropData.name}.` };
    } else {
      districtCropRelevance = { status: 'UNKNOWN', reason: `No specific regional data for ${cropData.name} in ${districtData.name}.` };
    }
  }

  // ── Weather agricultural context ──
  const weatherAgContext = weatherData ? getWeatherAgriculturalContext(crop, weatherData) : null;

  return {
    // Location
    district: districtData ? districtData.name : district || null,
    districtId: districtData ? districtData.id : null,
    region: districtData ? districtData.region : null,
    agroClimatic: districtData ? districtData.agroClimatic : null,
    coordinates: coords,

    // Crop
    crop: cropData ? cropData.name : crop || null,
    cropId: cropData ? cropData.id : null,
    cropAliases: cropData ? cropData.aliases : [],
    waterNeed: cropData ? cropData.waterNeed : null,

    // Season
    season: seasonKey,
    seasonContext: seasonCtx ? {
      label: seasonCtx.label,
      months: seasonCtx.months,
      description: seasonCtx.description,
      classification: seasonCtx.classification,
      source: seasonCtx.source,
    } : null,

    // Lot
    quantityQuintals: quantity || null,
    grade: grade || 'Unassessed',

    // Soil (regional reference)
    soilContext: soil ? {
      type: soil.soilType,
      description: soil.description,
      suitableCrops: soil.suitableCrops,
      limitations: soil.limitations,
      classification: 'REFERENCE',
      source: soil.source,
      disclaimer: soil.disclaimer,
    } : null,

    // Crop suitability (derived from soil + crop catalog)
    cropSuitability: suitability ? {
      status: suitability.status,
      reason: suitability.reason,
      classification: 'DERIVED',
      source: suitability.source,
    } : null,

    // District × crop relevance (reference)
    districtCropRelevance: districtCropRelevance ? {
      ...districtCropRelevance,
      classification: 'REFERENCE',
      source: 'Maharashtra agricultural statistics — regional reference',
    } : null,

    // Weather context (live fact when available)
    weatherContext: weatherData ? {
      temperature: weatherData.current?.temperature,
      humidity: weatherData.current?.humidity,
      condition: weatherData.current?.condition,
      description: weatherData.current?.description,
      windSpeed: weatherData.current?.windSpeed,
      location: weatherData.location?.name,
      retrievedAt: weatherData.timestamp,
      classification: 'FACT',
      source: 'OpenWeatherMap API',
    } : null,

    // Weather agricultural flags
    weatherAgriculturalContext: weatherAgContext,

    // Provenance
    classification: 'DERIVED',
    source: 'FarmContext composed from district registry + crop catalog + soil reference + weather API',
    disclaimer: 'Soil and crop suitability are regional references, not farm-verified data. Weather is a live observation, not a forecast for prices.',

    // Coverage summary (market intelligence stays separate)
    marketCoverageSummary: null, // to be filled by route handler
  };
}

/**
 * Get weather context for a farm context coordinates.
 * Separate call because weather requires an external API.
 */
function getWeatherContext(farmContext) {
  if (!farmContext || !farmContext.coordinates) {
    return {
      status: 'UNAVAILABLE',
      reason: 'No coordinates available for weather lookup.',
      classification: 'UNKNOWN',
    };
  }

  return {
    status: 'AVAILABLE',
    coordinates: farmContext.coordinates,
    district: farmContext.district,
    note: 'Weather data requires external API call — use /api/weather endpoint.',
    classification: 'FACT',
  };
}

module.exports = {
  createFarmContext,
  getWeatherContext,
  getWeatherAgriculturalContext,
  SEASON_CONTEXT,
  DISTRICT_CROP_RELEVANCE,
};

/**
 * maharashtraDistricts.js — Centralized Maharashtra district reference.
 *
 * Every district gets:
 *   - stable id (lowercase name)
 *   - display name
 *   - region (for grouping)
 *   - lat/lon (documented reference centroid — not farm-level precision)
 *   - soil context (regional reference, NOT farm-verified)
 *   - agro-climatic zone
 *
 * IMPORTANT: A district existing here does NOT mean market data exists.
 * Market coverage depends on AGMARKNET observations and is reported separately.
 */

const DISTRICTS = [
  // ── Western Maharashtra (Desh / Marathwada) ──────────────────────
  { id: 'pune', name: 'Pune', region: 'Western Maharashtra', lat: 18.5204, lon: 73.8567, soil: 'Black / Regur', agroClimatic: 'Balaghat Plateau' },
  { id: 'nashik', name: 'Nashik', region: 'Western Maharashtra', lat: 19.9975, lon: 73.7898, soil: 'Black / Regur', agroClimatic: 'Northern Maharashtra Plateau' },
  { id: 'ahmednagar', name: 'Ahmednagar', region: 'Western Maharashtra', lat: 19.0952, lon: 74.7496, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau', aliases: ['Ahilyanagar'] },
  { id: 'solapur', name: 'Solapur', region: 'Western Maharashtra', lat: 17.6599, lon: 75.9064, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau' },
  { id: 'satara', name: 'Satara', region: 'Western Maharashtra', lat: 17.6805, lon: 73.9906, soil: 'Black / Regur', agroClimatic: 'Western Ghats Slopes' },
  { id: 'sangli', name: 'Sangli', region: 'Western Maharashtra', lat: 16.8524, lon: 74.5647, soil: 'Black / Regur', agroClimatic: 'Krishna Plateau' },
  { id: 'kolhapur', name: 'Kolhapur', region: 'Western Maharashtra', lat: 16.7050, lon: 74.2433, soil: 'Lateritic / Black', agroClimatic: 'Western Ghats Slopes' },
  { id: 'ratnagiri', name: 'Ratnagiri', region: 'Konkan', lat: 16.9902, lon: 73.3120, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },
  { id: 'sindhudurg', name: 'Sindhudurg', region: 'Konkan', lat: 16.0016, lon: 73.6601, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },
  { id: 'raigad', name: 'Raigad', region: 'Konkan', lat: 18.5074, lon: 73.0059, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },
  { id: 'thane', name: 'Thane', region: 'Konkan', lat: 19.2183, lon: 72.9781, soil: 'Lateritic / Mixed', agroClimatic: 'Konkan Coast' },
  { id: 'mumbai-suburban', name: 'Mumbai Suburban', region: 'Konkan', lat: 19.0596, lon: 72.8295, soil: 'Lateritic / Mixed', agroClimatic: 'Konkan Coast', aliases: ['Mumbai'] },
  { id: 'mumbai-city', name: 'Mumbai City', region: 'Konkan', lat: 19.0760, lon: 72.8777, soil: 'Lateritic / Mixed', agroClimatic: 'Konkan Coast' },
  { id: 'palghar', name: 'Palghar', region: 'Konkan', lat: 19.6931, lon: 72.8155, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },

  // ── Marathwada ──────────────────────────────────────────────────
  { id: 'aurangabad', name: 'Aurangabad', region: 'Marathwada', lat: 19.8762, lon: 75.3433, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau', aliases: ['Chattrapati Sambhajinagar', 'Chhatrapati Sambhajinagar'] },
  { id: 'jalna', name: 'Jalna', region: 'Marathwada', lat: 19.8344, lon: 75.8845, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau' },
  { id: 'parbhani', name: 'Parbhani', region: 'Marathwada', lat: 19.2688, lon: 76.7710, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau' },
  { id: 'hingoli', name: 'Hingoli', region: 'Marathwada', lat: 19.7150, lon: 77.7796, soil: 'Black / Regur', agroClimatic: 'Purna Valley' },
  { id: 'nanded', name: 'Nanded', region: 'Marathwada', lat: 19.1383, lon: 77.3210, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau' },
  { id: 'washim', name: 'Washim', region: 'Marathwada', lat: 20.1114, lon: 77.1553, soil: 'Black / Regur', agroClimatic: 'Purna Valley' },
  { id: 'yavatmal', name: 'Yavatmal', region: 'Marathwada', lat: 20.3889, lon: 78.1294, soil: 'Black / Regur', agroClimatic: 'Purna Valley', aliases: ['Yeotmal'] },
  { id: 'beed', name: 'Beed', region: 'Marathwada', lat: 18.9891, lon: 75.7584, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau' },
  { id: 'osmanabad', name: 'Osmanabad', region: 'Marathwada', lat: 18.1719, lon: 76.0389, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau', aliases: ['Dharashiv'] },
  { id: 'latur', name: 'Latur', region: 'Marathwada', lat: 18.4088, lon: 76.5601, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau' },

  // ── Vidarbha ─────────────────────────────────────────────────────
  { id: 'nagpur', name: 'Nagpur', region: 'Vidarbha', lat: 21.1458, lon: 79.0882, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau' },
  { id: 'wardha', name: 'Wardha', region: 'Vidarbha', lat: 20.7453, lon: 78.6023, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau' },
  { id: 'amravati', name: 'Amravati', region: 'Vidarbha', lat: 20.9374, lon: 77.7796, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau', aliases: ['Amarawati'] },
  { id: 'akola', name: 'Akola', region: 'Vidarbha', lat: 20.7070, lon: 76.9981, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau' },
  { id: 'buldhana', name: 'Buldhana', region: 'Vidarbha', lat: 20.5334, lon: 76.1811, soil: 'Black / Mixed', agroClimatic: 'Satpura Plateau' },
  { id: 'chandrapur', name: 'Chandrapur', region: 'Vidarbha', lat: 19.9615, lon: 79.2967, soil: 'Lateritic / Mixed', agroClimatic: 'Wainganga Slopes' },
  { id: 'gondia', name: 'Gondia', region: 'Vidarbha', lat: 21.4600, lon: 80.1941, soil: 'Alluvial / Mixed', agroClimatic: 'Wainganga Valley' },
  { id: 'bhandara', name: 'Bhandara', region: 'Vidarbha', lat: 21.1702, lon: 79.6528, soil: 'Alluvial / Mixed', agroClimatic: 'Wainganga Valley' },

  // ── North Maharashtra ────────────────────────────────────────────
  { id: 'jalgaon', name: 'Jalgaon', region: 'North Maharashtra', lat: 21.0077, lon: 75.9929, soil: 'Black / Regur', agroClimatic: 'Tapti Valley' },
  { id: 'dhule', name: 'Dhule', region: 'North Maharashtra', lat: 20.9031, lon: 74.7774, soil: 'Black / Mixed', agroClimatic: 'Khandesh Plateau' },
  { id: 'nandurbar', name: 'Nandurbar', region: 'North Maharashtra', lat: 21.3703, lon: 74.2031, soil: 'Black / Mixed', agroClimatic: 'Satpura Slopes' },
];

/**
 * Look up a district by name (case-insensitive).
 * Returns the district object or null.
 */
function findDistrict(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  // Exact id match
  const byId = DISTRICTS.find(d => d.id === lower);
  if (byId) return byId;
  // Name match
  const byName = DISTRICTS.find(d => d.name.toLowerCase() === lower);
  if (byName) return byName;
  // Alias match (e.g. AGMARKNET renamed districts)
  return DISTRICTS.find(d => (d.aliases || []).some(a => a.toLowerCase() === lower)) || null;
}

/**
 * Get coordinates for a district name.
 * Returns { lat, lon } or null if district not found.
 */
function getDistrictCoords(name) {
  const d = findDistrict(name);
  return d ? { lat: d.lat, lon: d.lon } : null;
}

/**
 * Get soil context for a district.
 * Returns a descriptive string or null.
 * This is REGIONAL REFERENCE, NOT farm-verified soil data.
 */
function getDistrictSoil(name) {
  const d = findDistrict(name);
  return d ? d.soil : null;
}

/**
 * All unique regions.
 */
const REGIONS = [...new Set(DISTRICTS.map(d => d.region))];

module.exports = {
  DISTRICTS,
  findDistrict,
  getDistrictCoords,
  getDistrictSoil,
  REGIONS,
};

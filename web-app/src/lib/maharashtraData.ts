/**
 * maharashtraData.ts — Centralized Maharashtra district and crop reference.
 *
 * Mirrors backend/src/data/maharashtraDistricts.js and cropCatalog.js.
 * The frontend uses this for selectors, weather coordinates, and coverage display.
 *
 * A district existing here does NOT mean market data exists.
 */

export interface District {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  aliases?: string[];
  soil: string;
  agroClimatic: string;
}

export interface Crop {
  id: string;
  name: string;
  season: string;
  majorDistricts: string[];
  marketCoverage: 'active' | 'no_data';
  buyerCoverage: 'demo' | 'none';
  qualityGrades: string[];
}

export const MAHARASHTRA_DISTRICTS: District[] = [
  // Western Maharashtra
  { id: 'pune', name: 'Pune', region: 'Western Maharashtra', lat: 18.5204, lon: 73.8567, soil: 'Black / Regur', agroClimatic: 'Balaghat Plateau' },
  { id: 'nashik', name: 'Nashik', region: 'Western Maharashtra', lat: 19.9975, lon: 73.7898, soil: 'Black / Regur', agroClimatic: 'Northern Maharashtra Plateau' },
  { id: 'ahmednagar', name: 'Ahmednagar', region: 'Western Maharashtra', lat: 19.0952, lon: 74.7496, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau', aliases: ['Ahilyanagar'] },
  { id: 'solapur', name: 'Solapur', region: 'Western Maharashtra', lat: 17.6599, lon: 75.9064, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau' },
  { id: 'satara', name: 'Satara', region: 'Western Maharashtra', lat: 17.6805, lon: 73.9906, soil: 'Black / Regur', agroClimatic: 'Western Ghats Slopes' },
  { id: 'sangli', name: 'Sangli', region: 'Western Maharashtra', lat: 16.8524, lon: 74.5647, soil: 'Black / Regur', agroClimatic: 'Krishna Plateau' },
  { id: 'kolhapur', name: 'Kolhapur', region: 'Western Maharashtra', lat: 16.7050, lon: 74.2433, soil: 'Lateritic / Black', agroClimatic: 'Western Ghats Slopes' },
  // Konkan
  { id: 'ratnagiri', name: 'Ratnagiri', region: 'Konkan', lat: 16.9902, lon: 73.3120, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },
  { id: 'raigad', name: 'Raigad', region: 'Konkan', lat: 18.5074, lon: 73.0059, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },
  { id: 'thane', name: 'Thane', region: 'Konkan', lat: 19.2183, lon: 72.9781, soil: 'Lateritic / Mixed', agroClimatic: 'Konkan Coast' },
  { id: 'mumbai-suburban', name: 'Mumbai Suburban', region: 'Konkan', lat: 19.0596, lon: 72.8295, soil: 'Lateritic / Mixed', agroClimatic: 'Konkan Coast', aliases: ['Mumbai'] },
  { id: 'palghar', name: 'Palghar', region: 'Konkan', lat: 19.6931, lon: 72.8155, soil: 'Lateritic / Red', agroClimatic: 'Konkan Coast' },
  // Marathwada
  { id: 'aurangabad', name: 'Aurangabad', region: 'Marathwada', lat: 19.8762, lon: 75.3433, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau', aliases: ['Chattrapati Sambhajinagar', 'Chhatrapati Sambhajinagar'] },
  { id: 'jalna', name: 'Jalna', region: 'Marathwada', lat: 19.8344, lon: 75.8845, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau' },
  { id: 'parbhani', name: 'Parbhani', region: 'Marathwada', lat: 19.2688, lon: 76.7710, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau' },
  { id: 'hingoli', name: 'Hingoli', region: 'Marathwada', lat: 19.7150, lon: 77.7796, soil: 'Black / Regur', agroClimatic: 'Purna Valley' },
  { id: 'nanded', name: 'Nanded', region: 'Marathwada', lat: 19.1383, lon: 77.3210, soil: 'Black / Regur', agroClimatic: 'Godavari Plateau' },
  { id: 'washim', name: 'Washim', region: 'Marathwada', lat: 20.1114, lon: 77.1553, soil: 'Black / Regur', agroClimatic: 'Purna Valley' },
  { id: 'yeotmal', name: 'Yeotmal', region: 'Marathwada', lat: 20.3889, lon: 78.1294, soil: 'Black / Regur', agroClimatic: 'Purna Valley', aliases: ['Yavatmal'] },
  { id: 'beed', name: 'Beed', region: 'Marathwada', lat: 18.9891, lon: 75.7584, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau' },
  { id: 'osmanabad', name: 'Osmanabad', region: 'Marathwada', lat: 18.1719, lon: 76.0389, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau', aliases: ['Dharashiv'] },
  { id: 'latur', name: 'Latur', region: 'Marathwada', lat: 18.4088, lon: 76.5601, soil: 'Black / Regur', agroClimatic: 'Shelar Plateau' },
  // Vidarbha
  { id: 'nagpur', name: 'Nagpur', region: 'Vidarbha', lat: 21.1458, lon: 79.0882, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau' },
  { id: 'wardha', name: 'Wardha', region: 'Vidarbha', lat: 20.7453, lon: 78.6023, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau' },
  { id: 'amravati', name: 'Amravati', region: 'Vidarbha', lat: 20.9374, lon: 77.7796, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau', aliases: ['Amarawati'] },
  { id: 'akola', name: 'Akola', region: 'Vidarbha', lat: 20.7070, lon: 76.9981, soil: 'Black / Mixed', agroClimatic: 'Vidarbha Plateau' },
  { id: 'buldhana', name: 'Buldhana', region: 'Vidarbha', lat: 20.5334, lon: 76.1811, soil: 'Black / Mixed', agroClimatic: 'Satpura Plateau' },
  { id: 'chandrapur', name: 'Chandrapur', region: 'Vidarbha', lat: 19.9615, lon: 79.2967, soil: 'Lateritic / Mixed', agroClimatic: 'Wainganga Slopes' },
  { id: 'gondia', name: 'Gondia', region: 'Vidarbha', lat: 21.4600, lon: 80.1941, soil: 'Alluvial / Mixed', agroClimatic: 'Wainganga Valley' },
  { id: 'bhandara', name: 'Bhandara', region: 'Vidarbha', lat: 21.1702, lon: 79.6528, soil: 'Alluvial / Mixed', agroClimatic: 'Wainganga Valley' },
  // North Maharashtra
  { id: 'jalgaon', name: 'Jalgaon', region: 'North Maharashtra', lat: 21.0077, lon: 75.9929, soil: 'Black / Regur', agroClimatic: 'Tapti Valley' },
  { id: 'dhule', name: 'Dhule', region: 'North Maharashtra', lat: 20.9031, lon: 74.7774, soil: 'Black / Mixed', agroClimatic: 'Khandesh Plateau' },
  { id: 'nandurbar', name: 'Nandurbar', region: 'North Maharashtra', lat: 21.3703, lon: 74.2031, soil: 'Black / Mixed', agroClimatic: 'Satpura Slopes' },
];

export const MAHARASHTRA_CROPS: Crop[] = [
  // Active market coverage
  { id: 'onion', name: 'Onion', season: 'rabi', majorDistricts: ['Nashik', 'Pune', 'Ahmednagar', 'Solapur', 'Satara'], marketCoverage: 'active', buyerCoverage: 'demo', qualityGrades: ['Grade A', 'Grade B', 'Grade C'] },
  { id: 'soybean', name: 'Soybean', season: 'kharif', majorDistricts: ['Akola', 'Amravati', 'Buldhana', 'Washim', 'Nagpur'], marketCoverage: 'active', buyerCoverage: 'demo', qualityGrades: ['FAQ', 'Light', 'Heavy'] },
  { id: 'tomato', name: 'Tomato', season: 'both', majorDistricts: ['Pune', 'Nashik', 'Ahmednagar', 'Kolhapur', 'Solapur'], marketCoverage: 'active', buyerCoverage: 'demo', qualityGrades: ['Grade A', 'Grade B'] },
  // No current market data
  { id: 'cotton', name: 'Cotton', season: 'kharif', majorDistricts: ['Akola', 'Amravati', 'Washim', 'Yavatmal', 'Buldhana'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['Fine', 'Medium', 'Bengal'] },
  { id: 'jowar', name: 'Jowar (Sorghum)', season: 'kharif', majorDistricts: ['Solapur', 'Sangli', 'Pune', 'Ahmednagar', 'Satara'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ'] },
  { id: 'bajra', name: 'Bajra (Pearl Millet)', season: 'kharif', majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Satara', 'Jalgaon'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ'] },
  { id: 'wheat', name: 'Wheat', season: 'rabi', majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Satara', 'Solapur'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ', 'Durum'] },
  { id: 'tur-dal', name: 'Tur Dal (Pigeon Pea)', season: 'kharif', majorDistricts: ['Akola', 'Amravati', 'Washim', 'Nagpur', 'Buldhana'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ'] },
  { id: 'chilli', name: 'Chilli', season: 'kharif', majorDistricts: ['Akola', 'Washim', 'Yavatmal', 'Amravati', 'Nagpur'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ', 'Bold', 'Medium'] },
  { id: 'maize', name: 'Maize', season: 'kharif', majorDistricts: ['Ahmednagar', 'Pune', 'Nashik', 'Jalgaon', 'Solapur'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ'] },
  { id: 'groundnut', name: 'Groundnut', season: 'kharif', majorDistricts: ['Jalgaon', 'Ahmednagar', 'Solapur', 'Sangli', 'Nashik'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ', 'Bold', 'Java'] },
  { id: 'sugarcane', name: 'Sugarcane', season: 'annual', majorDistricts: ['Kolhapur', 'Sangli', 'Solapur', 'Pune', 'Ahmednagar'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ'] },
  { id: 'grapes', name: 'Grapes', season: 'rabi', majorDistricts: ['Nashik', 'Sangli', 'Pune'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['Export', 'Table', 'FAQ'] },
  { id: 'pomegranate', name: 'Pomegranate', season: 'rabi', majorDistricts: ['Solapur', 'Sangli', 'Ahmednagar', 'Pune'], marketCoverage: 'no_data', buyerCoverage: 'none', qualityGrades: ['FAQ'] },
];

// Coordinate lookup — used by WeatherPage, DecisionWorkspace, and notifications
export const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {};
for (const d of MAHARASHTRA_DISTRICTS) {
  DISTRICT_COORDS[d.name] = { lat: d.lat, lon: d.lon };
}

// Region groups for selectors
export const REGIONS = [...new Set(MAHARASHTRA_DISTRICTS.map(d => d.region))];

// Helper: find district by name
export function findDistrict(name: string): District | undefined {
  return MAHARASHTRA_DISTRICTS.find(d => d.name.toLowerCase() === name.toLowerCase());
}

// Helper: get crops with active market data
export function getActiveMarketCrops(): Crop[] {
  return MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active');
}

// Helper: get all crops (for full catalog display)
export function getAllCrops(): Crop[] {
  return MAHARASHTRA_CROPS;
}

export const DEFAULT_DISTRICT = 'Nashik';

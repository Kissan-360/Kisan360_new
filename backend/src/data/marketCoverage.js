/**
 * marketCoverage.js — Dynamic market coverage tracker.
 *
 * Reads the actual AGMARKNET snapshot and produces a coverage matrix.
 * This is the SINGLE SOURCE OF TRUTH for which district×crop combinations
 * have real market observations.
 *
 * A district existing in the district registry does NOT mean market data exists.
 * This module reports what actually exists in the snapshot.
 */

const fs = require('fs');
const path = require('path');
const { DISTRICTS, findDistrict } = require('./maharashtraDistricts');
const { CROPS } = require('./cropCatalog');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'data', 'priceSnapshots.json');

/**
 * Load the current snapshot and compute coverage.
 */
function getCoverageMatrix() {
  let rows = [];
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    rows = raw.rows || [];
  } catch {
    return { error: 'Snapshot not available', matrix: {}, summary: {} };
  }

  // Build coverage from actual data
  const coverage = {};

  // Initialize all known districts
  for (const district of DISTRICTS) {
    coverage[district.name] = {
      district: district.name,
      region: district.region,
      hasMarketData: false,
      crops: {},
      totalObservations: 0,
    };
  }

  // Count observations per district × crop
  // Normalize upstream district names via alias resolution
  for (const row of rows) {
    const rawDistrict = (row.district || '').trim();
    const cropName = (row.crop || '').trim();
    const marketName = (row.market || '').trim();

    if (!rawDistrict || !cropName) continue;

    // Resolve renamed districts (e.g. Ahilyanagar → Ahmednagar)
    const resolved = findDistrict(rawDistrict);
    const districtName = resolved ? resolved.name : rawDistrict;
    const districtRegion = resolved ? resolved.region : 'Unknown';

    if (!coverage[districtName]) {
      coverage[districtName] = {
        district: districtName,
        region: districtRegion,
        hasMarketData: false,
        crops: {},
        totalObservations: 0,
      };
    }

    coverage[districtName].hasMarketData = true;
    coverage[districtName].totalObservations++;

    if (!coverage[districtName].crops[cropName]) {
      coverage[districtName].crops[cropName] = {
        crop: cropName,
        markets: [],
        observations: 0,
        priceRange: { min: Infinity, max: -Infinity, avg: 0 },
      };
    }

    const cropData = coverage[districtName].crops[cropName];
    cropData.observations++;

    if (!cropData.markets.includes(marketName)) {
      cropData.markets.push(marketName);
    }

    const price = row.modalPrice || 0;
    if (price > 0) {
      cropData.priceRange.min = Math.min(cropData.priceRange.min, price);
      cropData.priceRange.max = Math.max(cropData.priceRange.max, price);
    }
  }

  // Compute averages
  for (const district of Object.values(coverage)) {
    for (const crop of Object.values(district.crops)) {
      if (crop.priceRange.min === Infinity) {
        crop.priceRange = { min: 0, max: 0, avg: 0 };
      }
    }
  }

  // Summary
  const districtsActive = Object.values(coverage).filter(d => d.hasMarketData).length;
  const cropsInSnapshot = [...new Set(rows.map(r => r.crop).filter(Boolean))];
  const marketsActive = new Set(rows.map(r => r.market).filter(Boolean)).size;
  const totalObservations = rows.length;

  // Track crops found in snapshot that aren't in the catalog
  const catalogCropNames = new Set(CROPS.map(c => c.name.toLowerCase()));
  const catalogAliasNames = new Set(CROPS.flatMap(c => (c.aliases || []).map(a => a.toLowerCase())));
  const uncatalogedCrops = cropsInSnapshot.filter(c => !catalogCropNames.has(c.toLowerCase()) && !catalogAliasNames.has(c.toLowerCase()));

  // NOTE: cropCoverage is built by the route handler using enrichCropWithCoverage()
  // which correctly handles alias matching. Do not duplicate that logic here.

  return {
    matrix: coverage,
    uncatalogedCrops,
    summary: {
      totalDistricts: DISTRICTS.length,
      districtsActive,
      districtsInactive: DISTRICTS.length - districtsActive,
      totalCropsInCatalog: CROPS.length,
      cropsWithRealData: cropsInSnapshot.length,
      cropsCatalogOnly: CROPS.length - cropsInSnapshot.length,
      uncatalogedCrops: uncatalogedCrops.length,
      totalMarkets: marketsActive,
      totalObservations,
      source: 'AGMARKNET snapshot (priceSnapshots.json)',
      disclaimer: 'Coverage reflects current snapshot only. Districts without market data may have data available in future refreshes.',
    },
  };
}

module.exports = {
  getCoverageMatrix,
};

#!/usr/bin/env node
/**
 * refresh-prices.js — pull real AGMARKNET prices and rewrite the stamped
 * snapshot that powers the offline cache and the net-realization calculator.
 *
 * Market-Data lane / DevOps daily job. Runs best where data.gov.in is
 * reachable (this dev box may be blocked — that is exactly why the snapshot
 * exists).
 *
 * Usage (from backend/):
 *   node scripts/refresh-prices.js            # pull + write priceSnapshots.json
 *   node scripts/refresh-prices.js --dry-run  # show what would be written
 *   node scripts/refresh-prices.js --limit 200
 *
 * Env: AGMARKNET_API_KEY (reads backend/.env via dotenv)
 * Exit: 0 written · 1 partial (wrote what we could) · 2 nothing usable fetched
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { TARGET_CROPS, recordsToRows, stampMeta } = require('../src/services/priceSnapshot');
const priceHistory = require('../src/services/priceHistory');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'src', 'data', 'priceSnapshots.json');
const BASE = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
const STATE = 'Maharashtra';

// Agmarknet spellings differ per dataset refresh — try each alias until one works.
const CROP_ALIASES = {
  Soybean: ['Soyabean', 'Soybean', 'Soyabeen'],
  Onion: ['Onion'],
  Tomato: ['Tomato'],
  Cotton: ['Cotton', 'Kapas'],
  'Jowar': ['Jowar', 'Sorghum', 'Sorghum (Jowar)'],
  'Bajra': ['Bajra', 'Pearl Millet', 'Bajari'],
  Wheat: ['Wheat', 'Gehu'],
  'Tur': ['Tur', 'Arhar', 'Pigeon Pea', 'Tur Dal', 'Toor Dal'],
  Chilli: ['Chilli', 'Chili', 'Mirchi', 'Red Chilli'],
  Maize: ['Maize', 'Corn', 'Makka'],
  Groundnut: ['Groundnut', 'Peanut', 'Moongfali'],
  'Sugarcane': ['Sugarcane', 'Ganna'],
  Grapes: ['Grapes', 'Draksha'],
  Pomegranate: ['Pomegranate', 'Anar', 'Dalimb'],
};

async function fetchCrop(apiKey, crop, limit) {
  let lastError = null;
  for (const alias of CROP_ALIASES[crop]) {
    try {
      const res = await axios.get(BASE, {
        params: {
          'api-key': apiKey,
          format: 'json',
          limit,
          'filters[commodity]': alias,
          'filters[state]': STATE,
        },
        timeout: 9000,
      });
      const records = (res.data && res.data.records) || [];
      if (records.length > 0) {
        return { crop, records, aliasUsed: alias };
      }
      lastError = new Error(`no records for commodity "${alias}" in ${STATE}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`could not fetch ${crop}`);
}

function parseArgs(argv) {
  const out = { dryRun: false, limit: 500 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--limit') out.limit = Math.min(parseInt(argv[++i], 10) || 500, 1000);
  }
  return out;
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.AGMARKNET_API_KEY;
  if (!apiKey) {
    console.error('❌ AGMARKNET_API_KEY is not set (backend/.env). Nothing to fetch.');
    process.exit(2);
  }

  const allRecords = [];
  const fetched = [];
  for (const crop of Object.keys(CROP_ALIASES)) {
    try {
      const { records, aliasUsed } = await fetchCrop(apiKey, crop, limit);
      allRecords.push(...records);
      fetched.push(`${crop} (${records.length} raw rows via "${aliasUsed}")`);
      console.log(`✅ ${crop}: fetched ${records.length} raw rows`);
    } catch (err) {
      console.warn(`⚠️ ${crop}: ${err.message}`);
    }
  }

  // Sanity gate: detect upstream filter anomaly (data.gov.in sometimes ignores
  // filters[state] and returns all-India data). Check for non-Maharashtra markets.
  // If all markets are genuinely Maharashtra, accept the data regardless of count.
  const fetchedAt = new Date().toISOString();
  const { rows: validatedRows, reconciliation } = recordsToRows(allRecords, { state: STATE, fetchedAt });
  let rows = validatedRows;
  console.log(`📊 Validation: ${reconciliation.accepted} accepted, ${reconciliation.rejected} rejected`);
  if (reconciliation.rejected > 0) {
    console.log(`   Rejection reasons: ${JSON.stringify(reconciliation.rejectedReasons)}`);
  }
  if (rows.length === 0) {
    console.error('❌ No usable price rows fetched — snapshot left unchanged.');
    process.exit(2);
  }

  const nonMaha = rows.filter(r => (r.state || '').toLowerCase() !== 'maharashtra');
  if (nonMaha.length > 0) {
    const nonMahaMarkets = [...new Set(nonMaha.map(r => r.market))].slice(0, 3);
    console.error(`⚠️ Upstream filter anomaly: ${nonMaha.length} non-Maharashtra row(s) detected (e.g. ${nonMahaMarkets.join(', ')}).`);
    const mahaOnly = rows.filter(r => (r.state || '').toLowerCase() === 'maharashtra');
    if (mahaOnly.length >= 3) {
      console.log(`   Filtering to ${mahaOnly.length} Maharashtra-only rows.`);
      rows = mahaOnly;
    } else {
      console.error(`   Only ${mahaOnly.length} Maharashtra rows remain — refusing to overwrite the known-good snapshot.`);
      process.exit(1);
    }
  }

  const summary = {
    crops: [...new Set(rows.map(r => r.crop))].sort(),
    markets: [...new Set(rows.map(r => r.market))].sort(),
    rowCount: rows.length,
  };
  console.log(`\nTransform → ${summary.rowCount} deduplicated rows | crops: ${summary.crops.join(', ')} | markets: ${summary.markets.length}`);

  if (dryRun) {
    console.log(`\n[dry-run] would write ${SNAPSHOT_FILE} (${rows.length} rows). Run without --dry-run to write.`);
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.crop} | ${r.market} | ₹${r.modalPrice}/q | ${r.arrivalDate}`);
    }
    process.exit(0);
  }

  const payload = { meta: stampMeta({ fetchedAt: new Date().toISOString() }), rows };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\n✅ Wrote ${SNAPSHOT_FILE} — ${rows.length} rows, stamped ${payload.meta.retrievedAt}.`);

  // Append today's observed prices to the trend history (Phase 1b). Observed
  // data only — the trend endpoint describes the past, it never forecasts.
  const history = priceHistory.loadHistory();
  history.days = priceHistory.appendRows(history.days, rows, { retrievedAt: payload.meta.retrievedAt });
  priceHistory.saveHistory(history, { lastAppendedAt: payload.meta.retrievedAt, lastRowCount: rows.length });
  const dayCount = Object.keys(history.days).length;
  console.log(`📈 History updated — ${dayCount} day(s) recorded in priceHistory.json.`);
  console.log('   The running backend serves this snapshot as its offline cache on next boot (or after a restart).');
  process.exit(0);
}

main().catch((err) => {
  console.error('Refresh crashed:', err.message);
  process.exit(2);
});

module.exports = { fetchCrop, recordsToRows, stampMeta };

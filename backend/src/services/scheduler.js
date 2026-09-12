/**
 * scheduler.js — Automated market-data refresh service.
 *
 * Runs the AGMARKNET ingestion pipeline on a daily schedule (default: 09:00 IST).
 * Also exposes a manual refresh function for admin/dev recovery.
 *
 * Design:
 * - Uses the same fetch/transform/write logic as refresh-prices.js
 * - Tracks ingestion health: last attempt, last success, rows received/accepted/flagged
 * - Never destroys the last known good snapshot on failure
 * - Idempotent: same source observation won't create duplicate history entries
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');
const { TARGET_CROPS, recordsToRows, stampMeta } = require('./priceSnapshot');
const priceHistory = require('./priceHistory');
const marketCache = require('./marketCache');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'data', 'priceSnapshots.json');
const BASE = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
const STATE = 'Maharashtra';

const CROP_ALIASES = {
  Soybean: ['Soyabean', 'Soybean', 'Soyabeen'],
  Onion: ['Onion'],
  Tomato: ['Tomato'],
  Cotton: ['Cotton (Raw)', 'Cotton', 'Kapas'],
  'Jowar': ['Jowar(Sorghum)', 'Jowar', 'Sorghum', 'Sorghum (Jowar)'],
  'Bajra': ['Bajra(Pearl Millet/Cumbu)', 'Bajra', 'Pearl Millet', 'Bajari'],
  Wheat: ['Wheat', 'Gehu'],
  'Tur': ['Red gram/Arhar/Tur(whole)', 'Tur', 'Arhar', 'Pigeon Pea', 'Tur Dal', 'Toor Dal'],
  Chilli: ['Green Chilli', 'Chilli', 'Chili', 'Mirchi', 'Red Chilli'],
  Maize: ['Maize', 'Corn', 'Makka'],
  Groundnut: ['Groundnut', 'Peanut', 'Moongfali'],
  'Sugarcane': ['Sugarcane', 'Ganna'],
  Grapes: ['Grapes', 'Draksha'],
  Pomegranate: ['Pomegranate', 'Anar', 'Dalimb'],
  Ginger: ['Ginger(Green)', 'Ginger', 'Green Ginger'],
  'Black Gram': ['Black Gram(Urd Beans)(Whole)', 'Black Gram', 'Urad', 'Urad Dal'],
  'Green Gram': ['Green Gram(Moong)(Whole)', 'Green Gram', 'Moong', 'Moong Dal'],
  'Bengal Gram': ['Bengal Gram(Gram)(Whole)', 'Bengal Gram', 'Chana', 'Chana Dal'],
  'Green Peas': ['Green Peas', 'Matar'],
};

// ── Ingestion health tracking ──────────────────────────────────────────────
const health = {
  lastAttempt: null,
  lastSuccess: null,
  lastError: null,
  lastObservationDate: null,
  lastFetchAt: null,
  rowsReceived: 0,
  rowsAccepted: 0,
  rowsRejected: 0,
  rejectedReasons: {},
  rowsPreserved: 0,
  rowsFlagged: 0,
  consecutiveFailures: 0,
  totalRuns: 0,
  publishedAt: null,
  newObservationAvailable: false,
  distinctCrops: 0,
  distinctMarkets: 0,
  distinctDistricts: 0,
};

function getHealth() {
  return { ...health };
}

// Load the existing on-disk snapshot without triggering the cache load
function loadExistingSnapshot() {
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    return { meta: raw.meta || {}, rows: raw.rows || [] };
  } catch {
    return null;
  }
}

// ── Core fetch logic with bounded retry ──────────────────────────────────
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCrop(apiKey, crop, limit) {
  let lastError = null;
  for (const alias of CROP_ALIASES[crop]) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(RETRY_DELAY_MS * attempt);
          logger.info(`[Scheduler] Retry ${attempt}/${MAX_RETRIES} for ${crop} (alias: ${alias})`);
        }
        const res = await axios.get(BASE, {
          params: {
            'api-key': apiKey,
            format: 'json',
            limit,
            'filters[commodity]': alias,
            'filters[state]': STATE,
          },
          timeout: 15000,
        });
        const records = (res.data && res.data.records) || [];
        if (records.length > 0) {
          return { crop, records, aliasUsed: alias };
        }
        lastError = new Error(`no records for commodity "${alias}" in ${STATE}`);
        // No records for this alias — try next alias without retrying
        break;
      } catch (err) {
        lastError = err;
        if (err.response && err.response.status < 500) {
          // Client errors (4xx) — don't retry
          break;
        }
        // Server errors (5xx) or network errors — retry
      }
    }
  }
  throw lastError || new Error(`could not fetch ${crop}`);
}

// ── Core refresh pipeline ──────────────────────────────────────────────────
// Returns { success, rowsWritten, historyDays, error? }
async function runRefreshPipeline({ limit = 500, dryRun = false } = {}) {
  const startTime = Date.now();
  health.lastAttempt = new Date().toISOString();
  health.totalRuns++;

  const apiKey = process.env.AGMARKNET_API_KEY;
  if (!apiKey) {
    const error = 'AGMARKNET_API_KEY not configured';
    health.lastError = error;
    health.consecutiveFailures++;
    logger.warn(`[Scheduler] Refresh skipped: ${error}`);
    return { success: false, error, rowsWritten: 0 };
  }

  // Fetch all crops defined in CROP_ALIASES — not limited to original demo crops.
  // The source dataset defines what is available, not a hardcoded whitelist.
  const allRecords = [];
  const fetched = [];
  const errors = [];
  for (const crop of Object.keys(CROP_ALIASES)) {
    try {
      const { records, aliasUsed } = await fetchCrop(apiKey, crop, limit);
      allRecords.push(...records);
      fetched.push(`${crop} (${records.length} rows via "${aliasUsed}")`);
    } catch (err) {
      errors.push(`${crop}: ${err.message}`);
    }
  }

  health.rowsReceived = allRecords.length;

  if (allRecords.length === 0) {
    const error = `No records fetched from any crop. Errors: ${errors.join('; ')}`;
    health.lastError = error;
    health.consecutiveFailures++;
    health.rowsRejected = 0;
    logger.warn(`[Scheduler] Refresh failed: ${error}`);
    return { success: false, error, rowsWritten: 0, rowsReceived: 0, rowsRejected: 0 };
  }

  // Transform and validate
  const fetchedAt = new Date().toISOString();
  const { rows: validatedRows, reconciliation } = recordsToRows(allRecords, { state: STATE, fetchedAt });
  let rows = validatedRows;
  health.rowsAccepted = reconciliation.accepted;
  health.rowsRejected = reconciliation.rejected;
  health.rejectedReasons = reconciliation.rejectedReasons;

  if (rows.length === 0) {
    const error = `Transform produced zero usable rows (${reconciliation.rejected} rejected: ${JSON.stringify(reconciliation.rejectedReasons)})`;
    health.lastError = error;
    health.consecutiveFailures++;
    logger.warn(`[Scheduler] Refresh failed: ${error}`);
    return { success: false, error, rowsWritten: 0, reconciliation };
  }

  // Sanity gate: detect upstream filter anomaly (data.gov.in sometimes ignores
  // filters[state] and returns all-India data). Check for non-Maharashtra markets.
  // If all markets are genuinely Maharashtra, accept the data regardless of count
  // — sparse data is better than stale data.
  const nonMaha = rows.filter(r => (r.state || '').toLowerCase() !== 'maharashtra');
  if (nonMaha.length > 0) {
    const nonMahaMarkets = [...new Set(nonMaha.map(r => r.market))].slice(0, 3);
    const error = `Upstream filter anomaly: ${nonMaha.length} non-Maharashtra row(s) detected (e.g. ${nonMahaMarkets.join(', ')}). Refusing to mix all-India data into the Maharashtra snapshot.`;
    health.lastError = error;
    health.rowsFlagged = nonMaha.length;
    health.consecutiveFailures++;
    logger.warn(`[Scheduler] Sanity gate blocked refresh: ${error}`);
    // Filter to Maharashtra-only rows and check if enough remain
    const mahaOnly = rows.filter(r => (r.state || '').toLowerCase() === 'maharashtra');
    if (mahaOnly.length >= 3) {
      logger.info(`[Scheduler] ${mahaOnly.length} Maharashtra rows remain after filtering — using them`);
      rows = mahaOnly;
    } else {
      return { success: false, error, rowsWritten: 0, rowsReceived: allRecords.length };
    }
  }

  // Snapshot protection: per-observation upsert instead of full replacement.
  // The calculator needs multiple markets to rank mandis. If the source returns
  // fewer rows, we UPSERT new observations and preserve existing ones.
  let snapshotUpdated = false;
  const existingSnapshot = loadExistingSnapshot();

  let preservedCount = 0;
  let addedCount = 0;
  let updatedCount = 0;

  if (existingSnapshot && existingSnapshot.rows.length > 0) {
    const oldCount = existingSnapshot.rows.length;
    const newCount = rows.length;
    
    // Per-observation upsert: merge new observations with existing
    const mergedMap = new Map();
    // First, add all existing observations
    for (const row of existingSnapshot.rows) {
      const key = `${(row.crop || '').toLowerCase()}|${(row.market || '').toLowerCase()}|${(row.variety || '').toLowerCase()}`;
      mergedMap.set(key, { ...row, publishedAt: existingSnapshot.meta.retrievedAt || null });
    }
    // Then, upsert new observations (newer data wins)
    for (const row of rows) {
      const key = `${(row.crop || '').toLowerCase()}|${(row.market || '').toLowerCase()}|${(row.variety || '').toLowerCase()}`;
      const existing = mergedMap.get(key);
      if (!existing) {
        addedCount++;
      } else if ((row.modalPrice || 0) > (existing.modalPrice || 0)) {
        updatedCount++;
      } else {
        preservedCount++;
      }
      mergedMap.set(key, { ...row, fetchedAt, publishedAt: fetchedAt });
    }
    
    const mergedRows = [...mergedMap.values()];
    
    // Only update if we have reasonable data (at least 3 markets)
    const distinctMarkets = new Set(mergedRows.map(r => (r.market || '').toLowerCase()));
    if (distinctMarkets.size >= 3) {
      rows = mergedRows;
      logger.info(
        `[Scheduler] Per-observation upsert: ${addedCount} new, ${updatedCount} updated, ` +
        `${mergedRows.length} total (${oldCount} existing + ${newCount} new)`
      );
    } else {
      logger.warn(
        `[Scheduler] Merged result has only ${distinctMarkets.size} markets — keeping existing snapshot`
      );
    }
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      rowsReceived: allRecords.length,
      rowsAccepted: reconciliation.accepted,
      rowsRejected: reconciliation.rejected,
      rejectedReasons: reconciliation.rejectedReasons,
      crops: [...new Set(rows.map(r => r.crop))].sort(),
      markets: [...new Set(rows.map(r => r.market))].sort(),
    };
  }

  // Write snapshot (atomic: write to temp file then rename)
  const payload = { meta: stampMeta({ fetchedAt, publishedAt: fetchedAt }), rows };
  const tmpFile = SNAPSHOT_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmpFile, SNAPSHOT_FILE);

  // Append to history (idempotent: appendRows deduplicates by crop|market|variety per day)
  const history = priceHistory.loadHistory();
  const prevDayCount = Object.keys(history.days).length;
  history.days = priceHistory.appendRows(history.days, rows, { retrievedAt: payload.meta.retrievedAt });
  priceHistory.saveHistory(history, { lastAppendedAt: payload.meta.retrievedAt, lastRowCount: rows.length });
  const newDayCount = Object.keys(history.days).length;

  // Update the in-memory cache so the running server sees fresh data immediately
  marketCache.recordLiveSuccess(rows);

  // Also reload the on-disk seed so subsequent calls to loadSeed() (e.g. after
  // a future server restart) pick up the latest snapshot without staleness.
  marketCache.reloadSeed();

  // Update health
  const elapsed = Date.now() - startTime;
  const distinctMarkets = new Set(rows.map(r => (r.market || '').trim().toLowerCase()));
  const distinctDistricts = new Set(rows.map(r => (r.district || '').trim()));
  const distinctCrops = new Set(rows.map(r => (r.crop || '').trim()));

  // Determine the latest observation date in the published data
  const latestObservedOn = rows
    .map(r => r.observedOn || r.arrivalDate)
    .filter(Boolean)
    .sort()
    .pop() || null;

  health.lastSuccess = fetchedAt;
  health.lastError = null;
  health.lastObservationDate = latestObservedOn;
  health.lastFetchAt = fetchedAt;
  health.rowsAccepted = reconciliation.accepted;
  health.rowsRejected = reconciliation.rejected;
  health.rejectedReasons = reconciliation.rejectedReasons;
  health.rowsPreserved = preservedCount;
  health.rowsFlagged = 0;
  health.consecutiveFailures = 0;
  health.publishedAt = fetchedAt;
  health.newObservationAvailable = latestObservedOn !== (existingSnapshot?.meta?.lastObservationDate || null);
  health.distinctCrops = distinctCrops.size;
  health.distinctMarkets = distinctMarkets.size;
  health.distinctDistricts = distinctDistricts.size;

  logger.info(
    `[Scheduler] Refresh complete in ${elapsed}ms: ${rows.length} rows, ` +
    `${distinctMarkets.size} markets, ${distinctDistricts.size} districts, ` +
    `history: ${prevDayCount} → ${newDayCount} days`
  );

  return {
    success: true,
    rowsReceived: allRecords.length,
    rowsAccepted: reconciliation.accepted,
    rowsRejected: reconciliation.rejected,
    rejectedReasons: reconciliation.rejectedReasons,
    rowsPreserved: preservedCount,
    addedCount,
    updatedCount,
    lastObservationDate: latestObservedOn,
    newObservationAvailable: health.newObservationAvailable,
    historyDays: newDayCount,
    elapsed,
    fetched,
    publishedAt: fetchedAt,
    distinctCrops: distinctCrops.size,
    distinctMarkets: distinctMarkets.size,
    distinctDistricts: distinctDistricts.size,
  };
}

// ── Scheduler setup ────────────────────────────────────────────────────────
let scheduledTask = null;

/**
 * Start the daily refresh scheduler.
 * @param {string} cronExpression - Cron schedule (default: '0 9 * * *' = 09:00 daily)
 * @param {string} timezone - Timezone (default: 'Asia/Kolkata')
 */
function startScheduler(cronExpression = '0 9 * * *', timezone = 'Asia/Kolkata') {
  if (scheduledTask) {
    logger.warn('[Scheduler] Already running — skipping duplicate start');
    return;
  }

  if (!cron.validate(cronExpression)) {
    logger.error(`[Scheduler] Invalid cron expression: ${cronExpression}`);
    return;
  }

  scheduledTask = cron.schedule(cronExpression, async () => {
    logger.info(`[Scheduler] Running scheduled refresh at ${new Date().toISOString()}`);
    try {
      await runRefreshPipeline();
    } catch (err) {
      logger.error(`[Scheduler] Scheduled refresh crashed: ${err.message}`);
      health.lastError = err.message;
      health.consecutiveFailures++;
    }
  }, { timezone });

  logger.info(`[Scheduler] Daily market refresh scheduled: "${cronExpression}" (${timezone})`);
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[Scheduler] Stopped');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runRefreshPipeline,
  getHealth,
  fetchCrop,
};

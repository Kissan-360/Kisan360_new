const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'data', 'priceSnapshots.json');
// Live rows are considered fresh for 6h; beyond that the route re-pulls and,
// failing that, serves the last good snapshot.
const LIVE_TTL_MS = 6 * 60 * 60 * 1000;
const LIVE_TIMEOUT_MS = 8000;

const AGMARKNET_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
const AGMARKNET_BASE = 'https://api.data.gov.in/resource';

let seedMeta = null;
let seedRows = [];
let liveRows = null; // { rows, source, retrievedAt }
let loaded = false;

// ── number + label handling ────────────────────────────────────────────────

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(r, extra = {}) {
  const observedOn = r.arrival_date || r.arrivalDate || null;
  return {
    crop: r.commodity || r.crop || '',
    variety: r.variety || '',
    grade: r.grade || '',
    minPrice: toNumber(r.min_price ?? r.minPrice),
    maxPrice: toNumber(r.max_price ?? r.maxPrice),
    modalPrice: toNumber(r.modal_price ?? r.modalPrice),
    market: r.market || '',
    district: r.district || '',
    state: r.state || '',
    arrivalDate: observedOn || '',
    arrivalQuantity: r.arrival_quantity != null ? toNumber(r.arrival_quantity) : null,
    arrivalUnit: r.arrival_unit || r.unit || null,
    // Provenance: observedOn is when the source observed it,
    // fetchedAt is when we retrieved it, validatedAt is when we accepted it.
    observedOn,
    fetchedAt: extra.fetchedAt || null,
    validatedAt: extra.validatedAt || null,
    publishedAt: extra.publishedAt || null,
    source: extra.source || null,
  };
}

// Validate a normalized observation. Returns { valid, reason }.
// Rejects records that would corrupt the serving state.
function validateRow(r) {
  if (!r.crop || !r.crop.trim()) return { valid: false, reason: 'missing_crop' };
  if (!r.market || !r.market.trim()) return { valid: false, reason: 'missing_market' };
  if (!r.modalPrice || r.modalPrice <= 0) return { valid: false, reason: 'invalid_modal_price' };
  if (r.modalPrice > 500000) return { valid: false, reason: 'impossibly_high_price' };
  if (r.minPrice < 0 || r.maxPrice < 0) return { valid: false, reason: 'negative_price' };
  if (r.minPrice > 0 && r.maxPrice > 0 && r.minPrice > r.maxPrice) return { valid: false, reason: 'min_exceeds_max' };
  // NOTE: state filtering is done separately in recordsToRows, not here.
  // validateRow checks data quality, not scope.
  return { valid: true, reason: null };
}

// Agmarknet and our snapshot disagree on spellings (e.g. Soybean vs Soyabeen), so
// crop matching tolerates alias groups instead of exact equality.
const CROP_ALIAS_GROUPS = {
  soybean: ['soybean', 'soyabean', 'soyabeen', 'soyabeans', 'soya bean'],
  onion: ['onion', 'onions'],
  tomato: ['tomato', 'tomatoes'],
  wheat: ['wheat', 'gehu'],
  maize: ['maize', 'corn', 'makka'],
  groundnut: ['groundnut', 'peanut', 'moongfali'],
  grapes: ['grapes', 'draksha'],
  pomegranate: ['pomegranate', 'anar', 'dalimb'],
  jowar: ['jowar', 'jowarsorghum', 'sorghum', 'sorghumjowar'],
  bajra: ['bajra', 'bajrapearlmilletcumbu', 'pearlmillet', 'bajari'],
  tur: ['tur', 'redgramarharturwhole', 'arhar', 'pigeonpea', 'turdal', 'toordal'],
  chilli: ['chilli', 'greenchilli', 'chili', 'mirchi', 'redchilli'],
  cotton: ['cotton', 'cottonraw', 'kapas'],
  sugarcane: ['sugarcane', 'ganna'],
  ginger: ['ginger', 'gingergreen', 'greenginger'],
  blackgram: ['blackgram', 'blackgramurdbeanswhole', 'urd', 'urdal'],
  greengram: ['greengram', 'greengrammoongwhole', 'moong', 'moongdal'],
  bengalgram: ['bengalgram', 'bengalgramgramwhole', 'chana', 'chanadal'],
  greenpeas: ['greenpeas', 'matar'],
};

function norm(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function aliasGroupKey(crop) {
  const key = norm(crop);
  if (!key) return null;
  for (const members of Object.values(CROP_ALIAS_GROUPS)) {
    if (members.some(m => norm(m) === key)) return norm(members[0]);
  }
  return null;
}

function cropMatches(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (na && na === nb) return true;
  const ga = aliasGroupKey(a);
  const gb = aliasGroupKey(b);
  return !!(ga && gb && ga === gb);
}

function matches(row, { crop, state, market, search }) {
  if (crop && !cropMatches(row.crop, crop)) return false;
  if (state && norm(row.state) !== norm(state)) return false;
  if (market && norm(row.market) !== norm(market)) return false;
  if (search) {
    const q = norm(search);
    const hay = norm([row.crop, row.variety, row.market, row.district, row.state].filter(Boolean).join(' '));
    if (!hay.includes(q)) return false;
  }
  return true;
}

function filterRows(rows, filters) {
  return rows.filter(r => matches(r, filters || {}));
}

// ── seed + live store ───────────────────────────────────────────────────────

function loadSeed() {
  if (loaded) return { meta: seedMeta, rows: seedRows };
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    seedMeta = raw.meta || {};
    seedRows = Array.isArray(raw.rows) ? raw.rows.map(normalizeRow) : [];
    logger.info(`📦 Price cache seed loaded: ${seedRows.length} rows (${seedMeta.note || 'known-good snapshot'})`);
  } catch (error) {
    logger.warn(`⚠️ Could not load price snapshot seed: ${error.message}`);
    seedRows = [];
  }
  return { meta: seedMeta, rows: seedRows };
}

/** Re-read the on-disk snapshot into memory. Called after the scheduler
 *  writes a new snapshot so the running server picks up fresh data
 *  without a full restart. */
function reloadSeed() {
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    seedMeta = raw.meta || {};
    seedRows = Array.isArray(raw.rows) ? raw.rows.map(normalizeRow) : [];
    logger.info(`🔄 Price cache seed reloaded: ${seedRows.length} rows`);
  } catch (error) {
    logger.warn(`⚠️ Could not reload price snapshot seed: ${error.message}`);
  }
  return { meta: seedMeta, rows: seedRows };
}

function recordLiveSuccess(rows, extra = {}) {
  const now = new Date();
  const fetchedAt = extra.fetchedAt || now.toISOString();
  liveRows = {
    rows: rows.map(r => ({
      ...r,
      fetchedAt: r.fetchedAt || fetchedAt,
      publishedAt: r.publishedAt || fetchedAt,
    })),
    source: 'agmarknet_live',
    retrievedAt: now.toISOString(),
    fetchedAt,
  };
}

function isLiveFresh() {
  if (!liveRows) return false;
  return Date.now() - new Date(liveRows.retrievedAt).getTime() < LIVE_TTL_MS;
}

// Best rows currently held: fresh live rows first, else the on-disk snapshot.
// RELIABILITY RULE: if the fresh live store has no rows matching the filter,
// fall through to the snapshot instead of serving an empty page — a successful
// live pull must never shadow the cached data for other crops/markets.
function getPrices(filters) {
  if (isLiveFresh()) {
    const liveFiltered = filterRows(liveRows.rows, filters || {});
    if (liveFiltered.length > 0) {
      // Use observation-based freshness: the age of the data, not the age of the fetch.
      const oldestObservedOn = liveFiltered
        .map(r => r.observedOn || r.arrivalDate)
        .filter(Boolean)
        .sort()[0];
      const obsFresh = observationFreshness(oldestObservedOn, liveRows.fetchedAt);
      return {
        rows: liveFiltered,
        source: liveRows.source,
        retrievedAt: liveRows.retrievedAt,
        fetchedAt: liveRows.fetchedAt || liveRows.retrievedAt,
        fallback: false,
        freshnessMs: obsFresh.freshnessMs,
        freshnessLabel: obsFresh.freshnessLabel,
        observedOn: oldestObservedOn,
        note: undefined,
        servingMode: 'LIVE',
      };
    }
    // Live is fresh but empty for this filter — fall through to the seed.
  }
  const rows = filterRows(seedRows, filters || {});
  // Use observation-based freshness for snapshot rows too.
  const oldestObservedOn = rows
    .map(r => r.observedOn || r.arrivalDate)
    .filter(Boolean)
    .sort()[0];
  const obsFresh = observationFreshness(oldestObservedOn, seedMeta.fetchedAt || seedMeta.retrievedAt);
  return {
    rows,
    source: seedMeta.source || 'agmarknet_snapshot',
    retrievedAt: seedMeta.retrievedAt || null,
    fetchedAt: seedMeta.fetchedAt || seedMeta.retrievedAt || null,
    fallback: true,
    freshnessMs: obsFresh.freshnessMs,
    freshnessLabel: obsFresh.freshnessLabel,
    observedOn: oldestObservedOn,
    note: seedMeta ? seedMeta.note : undefined,
    servingMode: obsFresh.freshnessLabel === 'CURRENT' ? 'CACHED' : obsFresh.freshnessLabel === 'RECENT' ? 'CACHED' : 'STALE',
  };
}

function ageHours(freshnessMs) {
  return freshnessMs != null ? Math.round((freshnessMs / 3.6e6) * 100) / 100 : null;
}

// Calculate freshness from the observation date, not fetch time.
// observedOn is when the source published the data (e.g. Sep 9).
// fetchedAt is when we retrieved it (e.g. Sep 10).
// Freshness should reflect the age of the data, not the age of the fetch.
function observationFreshness(observedOn, fetchedAt) {
  if (!observedOn) return { freshnessMs: null, freshnessLabel: 'UNKNOWN', source: 'observedOn missing' };
  const obsDate = new Date(observedOn);
  if (isNaN(obsDate.getTime())) return { freshnessMs: null, freshnessLabel: 'UNKNOWN', source: 'observedOn unparseable' };
  const now = Date.now();
  const obsMs = obsDate.getTime();
  const freshnessMs = now - obsMs;
  let freshnessLabel = 'UNKNOWN';
  if (freshnessMs < 0) freshnessLabel = 'FUTURE';
  else if (freshnessMs < 24 * 3600 * 1000) freshnessLabel = 'CURRENT';
  else if (freshnessMs < 3 * 24 * 3600 * 1000) freshnessLabel = 'RECENT';
  else freshnessLabel = 'STALE';
  return { freshnessMs, freshnessLabel, observedOn, fetchedAt };
}

// ── primary entry point ────────────────────────────────────────────────────
// Live AGMARKNET pull with an always-safe, label-tolerant cache fallback.
// Returns { rows, source, fallback, provenance }.
async function getBestPrices(filters = {}) {
  const { crop, state, market, search, limit = 100, offset = 0 } = filters;
  let liveError = null;
  let liveFetched = null;

  const apiKey = process.env.AGMARKNET_API_KEY;
  if (apiKey) {
    try {
      const params = {
        'api-key': apiKey,
        format: 'json',
        limit: Math.min(parseInt(limit, 10) || 100, 200),
        offset: parseInt(offset, 10) || 0,
      };
      if (crop) params['filters[commodity]'] = crop;
      if (state) params['filters[state]'] = state;
      if (market) params['filters[market]'] = market;

      const apiRes = await axios.get(`${AGMARKNET_BASE}/${AGMARKNET_RESOURCE}`, { params, timeout: LIVE_TIMEOUT_MS });
      const records = (apiRes.data && apiRes.data.records) || [];
      liveFetched = records.map(normalizeRow);
      if (liveFetched.length === 0) {
        liveError = 'Agmarknet returned no records for the given filters';
      } else {
        recordLiveSuccess(liveFetched);
      }
    } catch (error) {
      liveError = error.response ? `Agmarknet API error (${error.response.status})` : error.message;
      logger.warn('⚠️ Live price pull failed, falling back to cache:', liveError);
    }
  } else {
    liveError = 'AGMARKNET_API_KEY not configured';
  }

  const nowIso = new Date().toISOString();

  if (liveFetched && liveFetched.length > 0) {
    let filtered = filterRows(liveFetched, { crop, state, market, search });
    // Reliability rule (observed live 2026-09-09: upstream ignored filters[state]
    // and returned an arbitrary all-India page, leaving ONE Maharashtra mandi
    // after local filtering): a live pull that yields a sliver of the state's
    // markets must not shadow the snapshot for ranking use-cases. Compare
    // against the on-disk SNAPSHOT directly — NOT getPrices(), whose live store
    // is the poisoned data itself. An explicit market filter is exempt (one row
    // is the correct answer there).
    if (filtered.length > 0 && !market) {
      const distinctLive = new Set(filtered.map(r => norm(r.market))).size;
      if (distinctLive < 2) {
        const snapshot = loadSeed();
        const snapRows = filterRows(snapshot.rows, { crop, state, market, search });
        const distinctSnap = new Set(snapRows.map(r => norm(r.market))).size;
        if (snapRows.length > 0 && distinctSnap > distinctLive) {
          return {
            rows: snapRows,
            source: snapshot.meta.source || 'agmarknet_snapshot',
            fallback: true,
            provenance: {
              source: snapshot.meta.source || 'agmarknet_snapshot',
              retrievedAt: snapshot.meta.retrievedAt,
              freshnessMs: snapshot.meta.retrievedAt ? Date.now() - new Date(snapshot.meta.retrievedAt).getTime() : null,
              ageHours: ageHours(snapshot.meta.retrievedAt ? Date.now() - new Date(snapshot.meta.retrievedAt).getTime() : null),
              note: `Live pull returned only ${distinctLive} matching mandi(s) (upstream filter anomaly) — serving the last good cached snapshot with ${distinctSnap}.`,
              liveError,
            },
          };
        }
      }
    }
    // Label mismatch (e.g. user said Soybean, live says Soyabeen and filterRows
    // still missed) — serve the last good snapshot instead of an empty page.
    if (filtered.length === 0 && (crop || search)) {
      const cached = getPrices({ crop, state, market, search });
      if (cached.rows.length > 0) {
        return {
          rows: cached.rows,
          source: cached.source,
          fallback: true,
          provenance: {
            source: cached.source,
            retrievedAt: cached.retrievedAt,
            freshnessMs: cached.freshnessMs,
            ageHours: ageHours(cached.freshnessMs),
            note: 'Live pull returned no rows matching the requested label; serving the last good cached snapshot.',
            liveError,
          },
        };
      }
    }
    return {
      rows: filtered,
      source: 'agmarknet_live',
      fallback: false,
      provenance: {
        source: 'agmarknet_live',
        retrievedAt: nowIso,
        fetchedAt: nowIso,
        freshnessMs: 0,
        ageHours: 0,
        note: 'Pulled live from the AGMARKNET (data.gov.in) API for this request.',
        liveError: null,
      },
      servingMode: 'LIVE',
    };
  }

  const cached = getPrices({ crop, state, market, search });
  return {
    rows: cached.rows,
    source: cached.source,
    fallback: true,
    provenance: {
      source: cached.source,
      retrievedAt: cached.retrievedAt,
      fetchedAt: cached.fetchedAt || cached.retrievedAt,
      freshnessMs: cached.freshnessMs,
      ageHours: ageHours(cached.freshnessMs),
      note: cached.note || null,
      liveError,
    },
    servingMode: cached.servingMode || 'FALLBACK',
  };
}

function distinctCrops() {
  // Crops with price rows the farmer could actually act on — union of the
  // stamped snapshot and any live pull. Alias-grouped (soyabean→Soybean) so
  // source-spelling variants collapse to one canonical name; the same matcher
  // used for filtering resolves them at query time.
  const rows = [...seedRows, ...(liveRows ? liveRows.rows : [])];
  const byKey = new Map();
  for (const r of rows) {
    const name = (r.crop || '').trim();
    if (!name) continue;
    const key = aliasGroupKey(name) || norm(name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { members: [name], aliased: !!aliasGroupKey(name) });
    else if (!byKey.get(key).members.includes(name)) byKey.get(key).members.push(name);
  }
  return [...byKey.values()]
    .map(({ members, aliased }) => {
      let name;
      if (aliased) {
        // Display the alias group's own canonical spelling (e.g. 'soybean'),
        // not the source row's variant ('Soyabean').
        const key = aliasGroupKey(members[0]);
        const group = Object.values(CROP_ALIAS_GROUPS).find(ms => norm(ms[0]) === key);
        name = group ? group[0] : members[0];
      } else {
        name = members.sort((a, b) => a.length - b.length)[0];
      }
      return name[0].toUpperCase() + name.slice(1).toLowerCase();
    })
    .sort();
}

function cacheSummary() {
  const now = Date.now();
  const snapshotAge = seedMeta.retrievedAt ? now - new Date(seedMeta.retrievedAt).getTime() : null;
  const liveAge = liveRows ? now - new Date(liveRows.retrievedAt).getTime() : null;

  // Count distinct districts and markets
  const allRows = [...seedRows, ...(liveRows ? liveRows.rows : [])];
  const districts = new Set();
  const markets = new Set();
  for (const r of allRows) {
    if (r.district) districts.add(r.district);
    if (r.market) markets.add(r.market);
  }

  return {
    snapshotRows: seedRows.length,
    snapshotRetrievedAt: seedMeta.retrievedAt || null,
    snapshotFetchedAt: seedMeta.fetchedAt || seedMeta.retrievedAt || null,
    snapshotAgeHours: snapshotAge != null ? Math.round(snapshotAge / 3.6e6 * 100) / 100 : null,
    liveFresh: isLiveFresh(),
    liveRetrievedAt: liveRows ? liveRows.retrievedAt : null,
    liveFetchedAt: liveRows ? liveRows.fetchedAt || liveRows.retrievedAt : null,
    liveAgeHours: liveAge != null ? Math.round(liveAge / 3.6e6 * 100) / 100 : null,
    distinctCrops: distinctCrops(),
    distinctDistricts: [...districts].sort(),
    distinctMarketCount: markets.size,
    servingMode: isLiveFresh() ? 'LIVE' : (snapshotAge != null && snapshotAge < 24 * 3600 * 1000 ? 'CACHED' : 'STALE'),
  };
}

module.exports = {
  loadSeed,
  reloadSeed,
  recordLiveSuccess,
  isLiveFresh,
  getPrices,
  getBestPrices,
  filterRows,
  cropMatches,
  normalizeRow,
  validateRow,
  distinctCrops,
  cacheSummary,
};

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

function normalizeRow(r) {
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
    arrivalDate: r.arrival_date || r.arrivalDate || '',
  };
}

// Agmarknet and our snapshot disagree on spellings (e.g. Soybean vs Soyabeen), so
// crop matching tolerates alias groups instead of exact equality.
const CROP_ALIAS_GROUPS = {
  soybean: ['soybean', 'soyabean', 'soyabeen', 'soyabeans', 'soya bean'],
  onion: ['onion', 'onions'],
  tomato: ['tomato', 'tomatoes'],
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

function recordLiveSuccess(rows) {
  const now = new Date();
  liveRows = {
    rows: rows.map(r => ({ ...r, retrievedAt: now.toISOString() })),
    source: 'agmarknet_live',
    retrievedAt: now.toISOString(),
  };
}

function isLiveFresh() {
  if (!liveRows) return false;
  return Date.now() - new Date(liveRows.retrievedAt).getTime() < LIVE_TTL_MS;
}

// Best rows currently held: fresh live rows first, else the on-disk snapshot.
function getPrices(filters) {
  const source = isLiveFresh() ? liveRows : null;
  const rows = source ? source.rows : seedRows;
  return {
    rows: filterRows(rows, filters || {}),
    source: source ? source.source : (seedMeta.source || 'agmarknet_snapshot'),
    retrievedAt: source ? source.retrievedAt : (seedMeta.retrievedAt || null),
    fallback: !source,
    freshnessMs: source ? Date.now() - new Date(source.retrievedAt).getTime() : null,
    note: !source && seedMeta ? seedMeta.note : undefined,
  };
}

function ageHours(freshnessMs) {
  return freshnessMs != null ? Math.round((freshnessMs / 3.6e6) * 100) / 100 : null;
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
        freshnessMs: 0,
        ageHours: 0,
        note: 'Pulled live from the AGMARKNET (data.gov.in) API for this request.',
        liveError: null,
      },
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
      freshnessMs: cached.freshnessMs,
      ageHours: ageHours(cached.freshnessMs),
      note: cached.note || null,
      liveError,
    },
  };
}

function cacheSummary() {
  return {
    snapshotRows: seedRows.length,
    snapshotRetrievedAt: seedMeta.retrievedAt || null,
    liveFresh: isLiveFresh(),
    liveRetrievedAt: liveRows ? liveRows.retrievedAt : null,
  };
}

module.exports = {
  loadSeed,
  recordLiveSuccess,
  isLiveFresh,
  getPrices,
  getBestPrices,
  filterRows,
  cropMatches,
  cacheSummary,
};

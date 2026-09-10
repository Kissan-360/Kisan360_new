const express = require('express');
const mongoose = require('mongoose');
const { getDbMode } = require('../config/mongodb');
const { getHealth: getSchedulerHealth } = require('../services/scheduler');
const marketCache = require('../services/marketCache');
const { admin } = require('../config/firebase');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/diagnostics — one-stop infrastructure status for the Atlas setup
// pass. Read-only against business data: the write probe uses ONLY a dedicated
// `kisan360_diagnostics` collection (single fixed document), never user/lot/
// offer data. Designed so the operator can run it immediately after setting
// MONGODB_URI and see everything worth knowing in one response.
//
// Persistence check (item G): the probe document keeps its original
// `firstSeenAt`. If firstSeenAt is OLDER than this process's uptime, the
// document survived a restart — real persistence. In memory mode it resets
// with every restart and the check reports that honestly.
//
// SECURITY: operational status (db mode, scheduler, ingestion) is open; the
// WRITE probe mutates the database and therefore requires an authenticated
// admin token (demo-login as role=admin). Never exposes credentials or
// connection strings — names and booleans only.
router.get('/', optionalAuth, async (req, res) => {
  const startedAt = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';
  const isAdmin = req.user && req.user.role === 'admin';
  const writeProbeAllowed = isAdmin; // probe always needs an admin token, same rule in every env
  const readyState = mongoose.connection.readyState; // 0=disconnected 1=connected 2=connecting 3=disconnecting
  const dbMode = getDbMode(); // 'connected' | 'memory' | 'offline'

  const result = {
    success: true,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV || '(unset — development behavior)',
    productionRule: {
      isProduction,
      memoryFallbackAllowed: !isProduction && process.env.KISAN_DEMO_MEMORY_DB !== '0',
      note: 'Production (NODE_ENV=production) NEVER falls back to the in-memory database; it either connects to MongoDB or serves 503 from requireDb.',
    },
    database: {
      configured: !!process.env.MONGODB_URI,
      dbMode, // B + D: connected | memory | offline
      readyState,
      readyStateLabel: { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }[readyState] || 'unknown',
      name: mongoose.connection.name || null, // C: database name
      host: mongoose.connection.host || null,
      usingMemoryFallback: dbMode === 'memory',
    },
    firebase: {
      // Item 4: initialization state only — never key values.
      adminInitialized: !!(admin.apps && admin.apps.length > 0),
      serviceAccountConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      note: 'Backend Firebase = Admin SDK for ID-token verification only. Demo auth (demo-login) needs neither Firebase nor MongoDB.',
    },
    scheduler: { ...getSchedulerHealth() }, // H
    marketIngestion: null, // I, filled below
    readTest: { ok: false, detail: 'skipped — not connected' }, // E
    writeTest: { ok: false, detail: 'skipped — not connected' }, // F
    persistence: { ok: false, detail: 'skipped — not connected' }, // G
    checks: {},
  };

  // I. Market ingestion status: the stamped snapshot the pipeline maintains.
  try {
    const summary = marketCache.cacheSummary();
    result.marketIngestion = {
      snapshotRows: summary.snapshotRows,
      snapshotRetrievedAt: summary.snapshotRetrievedAt,
      liveFresh: summary.liveFresh,
      liveRetrievedAt: summary.liveRetrievedAt,
      distinctCrops: summary.distinctCrops,
    };
  } catch (e) {
    result.marketIngestion = { error: e.message };
  }

  if (readyState !== 1) {
    result.checks.backendRunning = true;
    result.checks.mongodbReachable = false;
    result.database.hint = dbMode === 'memory'
      ? 'Running on the DEMO in-memory fallback — MONGODB_URI is set but unreachable (or was at boot). Fix the URI/network and restart the API.'
      : 'Not connected. Set MONGODB_URI in backend/.env and restart the API.';
    return res.json(result);
  }

  // E. Basic read test: ping the admin database.
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    result.readTest = { ok: true, detail: 'admin ping succeeded' };
    result.checks.mongodbReachable = true;
  } catch (e) {
    result.readTest = { ok: false, detail: e.message };
    return res.json(result);
  }

  // F + G. Write test + persistence probe: authenticated admin only — this is
  // a database mutation, however small.
  if (!writeProbeAllowed) {
    result.writeTest = { ok: null, detail: 'skipped — add an admin token (demo-login role=admin) to run the write/persistence probe' };
    result.persistence = { ok: null, detail: 'skipped — admin token required' };
    result.checks = {
      backendRunning: true,
      mongodbReachable: true,
      usingRealMongo: dbMode === 'connected',
      schedulerAlive: getSchedulerHealth().totalRuns >= 0,
    };
    result.elapsedMs = Date.now() - startedAt;
    return res.json(result);
  }
  try {
    const col = mongoose.connection.db.collection('kisan360_diagnostics');
    const now = new Date();
    await col.updateOne(
      { _id: 'probe' },
      { $set: { lastProbeAt: now, autoExpireAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) } },
      { upsert: true }
    );
    // TTL index: MongoDB auto-deletes documents after autoExpireAt.
    // Safe to call repeatedly — no-op if the index already exists.
    try { await col.createIndex({ autoExpireAt: 1 }, { expireAfterSeconds: 0 }); } catch { /* index exists */ }
    const doc = await col.findOne({ _id: 'probe' });
    const firstSeenAt = doc && doc.firstSeenAt ? new Date(doc.firstSeenAt) : null;

    result.writeTest = { ok: true, detail: 'upsert into kisan360_diagnostics succeeded', collection: 'kisan360_diagnostics' };

    if (!firstSeenAt) {
      // First ever probe — stamp firstSeenAt from now on (persists if the DB does).
      await col.updateOne({ _id: 'probe' }, { $set: { firstSeenAt: now } });
      result.persistence = {
        ok: null,
        detail: 'probe document created just now — re-run this endpoint after an API restart: if firstSeenAt survives, persistence is confirmed.',
      };
    } else {
      const uptimeMs = process.uptime() * 1000;
      const survived = now.getTime() - firstSeenAt.getTime() > uptimeMs;
      result.persistence = {
        ok: survived,
        firstSeenAt: firstSeenAt.toISOString(),
        detail: survived
          ? 'probe document is older than this process — data survived a restart (persistence confirmed).'
          : 'probe document was created by this process (or memory mode reset it). Restart the API once with MongoDB configured and re-run to confirm.',
      };
    }
  } catch (e) {
    result.writeTest = { ok: false, detail: e.message };
  }

  result.checks = {
    backendRunning: true,
    mongodbReachable: true,
    usingRealMongo: dbMode === 'connected',
    schedulerAlive: getSchedulerHealth().totalRuns >= 0,
  };

  result.elapsedMs = Date.now() - startedAt;
  return res.json(result);
});

module.exports = router;

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const advisoryRoutes = require('./routes/advisory');
const diseaseRoutes = require('./routes/disease');
const weatherRoutes = require('./routes/weather');
const notificationRoutes = require('./routes/notifications');
const marketRoutes = require('./routes/market');
const farmRoutes = require('./routes/farms');
const detectionRoutes = require('./routes/detections');
const lotRoutes = require('./routes/lots');
const buyerRoutes = require('./routes/buyers');
const offerRoutes = require('./routes/offers');
const paymentRoutes = require('./routes/payments');
const grievanceRoutes = require('./routes/grievances');
const fpoRoutes = require('./routes/fpo');
const logisticsRoutes = require('./routes/logistics');
const transactionCostRoutes = require('./routes/transactionCost');
const diagnosticsRoutes = require('./routes/diagnostics');
const chatRoutes = require('./routes/chat');
const schemeRoutes = require('./routes/schemes');
const communityRoutes = require('./routes/community');
const gradeAssessmentRoutes = require('./routes/gradeAssessment');
const tradingChannelsRoutes = require('./routes/tradingChannels');

// Error handling
const errorHandler = require('./middleware/errorHandler');

// Initialize Firebase Admin SDK
const { initializeFirebase } = require('./config/firebase');
initializeFirebase();

// Connect to MongoDB
const connectDB = require('./config/mongodb');
const { getDbMode } = require('./config/mongodb');
connectDB().catch(err => console.error('❌ MongoDB connection failed:', err.message));

// Start automated market-data refresh scheduler + one-shot boot refresh.
// On Render free-tier the process dies between cron fires, so the snapshot can
// go stale. Running the pipeline once at boot ensures the first request always
// sees fresh (or at least freshest-possible) AGMARKNET data.
const { startScheduler, stopScheduler, runRefreshPipeline } = require('./services/scheduler');
startScheduler(); // daily at 09:00 IST
if (process.env.NODE_ENV !== 'test') {
  runRefreshPipeline({ limit: 500 }).catch(err => {
    console.error(`[Boot] AGMARKNET refresh failed (non-fatal, using cached snapshot): ${err.message}`);
  });
}

const app = express();
// Port contract: an explicitly invalid PORT (0, negative, non-numeric) must
// fail loudly rather than bind an ephemeral port nobody can find. `"0" || 5000`
// is truthy in JS — a bare `||` once started the server on port 0 and the demo
// lost the backend. Parse defensively.
const RAW_PORT = process.env.PORT;
const PORT = Number.parseInt(RAW_PORT, 10);
if (RAW_PORT !== undefined && (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535)) {
  console.error(`❌ Invalid PORT "${RAW_PORT}" — must be an integer between 1 and 65535. Refusing to start on an unpredictable port.`);
  process.exit(1);
}
const EFFECTIVE_PORT = Number.isInteger(PORT) && PORT > 0 ? PORT : 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Behind a reverse proxy (nginx etc.) this makes req.ip the real client IP
// rather than the proxy's, so request logs attribute traffic correctly.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Request logging with a correlation id + duration (no tokens, no bodies).
// Answers: did the request arrive? did it fail? how long did it take?
app.use((req, res, next) => {
  req.requestId = Math.random().toString(36).slice(2, 10);
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    const line = `[${new Date().toISOString()}] [INFO] ${req.requestId} ${req.method} ${req.originalUrl} → ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) console.error(line);
    else console.log(line);
  });
  next();
});

// CORS configuration
// In production the single trusted FRONTEND_URL is enforced (reflecting only
// that origin, never arbitrary origins). In development we keep the reflective
// default so the app works on any localhost port out of the box.
const corsOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: IS_PRODUCTION ? corsOrigin : true,
  credentials: true,
}));

// Body parsing — 1 MB is far above any legitimate JSON payload (image uploads
// go through multipart with their own 10 MB limit in routes/disease.js).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check — distinguishes process alive vs database ready vs scheduler
// state vs calculator availability, without falsely reporting degraded
// systems as healthy.
const { getHealth: getSchedulerHealth } = require('./services/scheduler');

// Calculator (net-realization) readiness: Render free-tier sleeps the calc
// after ~15 min idle and a wake takes 30–60 s, so the old 1.5 s probe could
// never succeed after idle and /health cried DEGRADED forever. The probe now
// allows 10 s, reports ready|waking|offline honestly (timeout = waking,
// refused = offline), and a boot warmup loop starts the wake the moment this
// process boots instead of at the first farmer click.
const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';
const ML_PROBE_TIMEOUT_MS = 10000;
const ML_PROBE_CACHE_MS = 30000;
let mlProbe = { ready: false, status: 'offline', checkedAt: 0 };
async function probeMlService(force = false) {
  if (!force && Date.now() - mlProbe.checkedAt < ML_PROBE_CACHE_MS) return mlProbe;
  try {
    const res = await fetch(`${NET_REALIZATION_URL}/health`, { signal: AbortSignal.timeout(ML_PROBE_TIMEOUT_MS) });
    mlProbe = { ready: res.ok, status: res.ok ? 'ready' : 'offline', checkedAt: Date.now() };
  } catch (e) {
    // AbortSignal.timeout → waking (the proxy holds the connection while the
    // service boots); refused/DNS → the service is down, not waking.
    const waking = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    mlProbe = { ready: false, status: waking ? 'waking' : 'offline', checkedAt: Date.now() };
  }
  return mlProbe;
}
// Boot warmup (skipped in tests): start waking the calculator immediately so
// it is ideally already up when the first farmer request arrives. Bounded:
// 6 attempts × 20 s, then stops touching it.
if (process.env.NODE_ENV !== 'test') {
  let warmAttempts = 0;
  const warmTimer = setInterval(async () => {
    warmAttempts += 1;
    try {
      const ml = await probeMlService(true);
      if (ml.ready || warmAttempts >= 6) clearInterval(warmTimer);
    } catch {
      if (warmAttempts >= 6) clearInterval(warmTimer);
    }
  }, 20000);
  if (typeof warmTimer.unref === 'function') warmTimer.unref();
}
app.get('/health', async (req, res) => {
  const dbMode = getDbMode(); // 'connected' | 'memory' | 'offline'
  const dbReady = dbMode === 'connected' || dbMode === 'memory';
  const scheduler = getSchedulerHealth();
  const ml = await probeMlService();
  const degraded = dbMode === 'offline' || scheduler.consecutiveFailures > 0 || !ml.ready;
  res.status(200).json({
    status: degraded ? 'DEGRADED' : 'OK',
    message: 'Kisan360 Backend is running',
    db: dbMode,
    dbReady,
    mlServiceReady: ml.ready,
    mlServiceStatus: ml.status,
    mlServiceUrl: NET_REALIZATION_URL,
    scheduler,
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/advisory', advisoryRoutes);
app.use('/api/disease', diseaseRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/detections', detectionRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/buyers', buyerRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/grievances', grievanceRoutes);
app.use('/api/fpo', fpoRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/transaction-cost', transactionCostRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/schemes', schemeRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/grade-assessment', gradeAssessmentRoutes);
app.use('/api/trading-channels', tradingChannelsRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be registered after routes)
app.use(errorHandler);

const server = app.listen(EFFECTIVE_PORT, () => {
  console.log(`🚀 Kisan360 Backend server is running on port ${EFFECTIVE_PORT}`);
  console.log(`📊 Health check available at: http://localhost:${EFFECTIVE_PORT}/health`);
  if (getDbMode() === 'memory') {
    console.log('🧪 DEMO FALLBACK active: in-memory database. Production never takes this path.');
  }
});

// Demo-day hardening: in memory mode a restart wipes the demo journey. The DB
// mode settles ASYNCHRONOUSLY (the memory fallback may finish after listen),
// so instead of hooking the listen callback we poll until the connection is
// queryable, then self-seed the canonical scenario ONLY when the demo farmer
// has no lots — a restart always leaves the demo ready and never duplicates.
// Production DB mode ('connected') is skipped entirely.
(async () => {
  if (process.env.NODE_ENV === 'production') return;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const mode = getDbMode();
    if (mode === 'connected') return; // real database — seeding is a demo-only concern
    if (mode !== 'memory') continue;  // still settling (offline / starting memory server)
    try {
      const Lot = require('./models/Lot');
      const existing = await Lot.countDocuments({ farmerUid: 'demo-farmer' });
      if (existing > 0) {
        console.log(`🌱 Demo data present (${existing} lots) — auto-seed skipped.`);
        return;
      }
      const { seedDemoScenario } = require('./lib/demoSeed');
      await seedDemoScenario({
        baseUrl: `http://127.0.0.1:${EFFECTIVE_PORT}/api`,
        log: (m) => console.log(`🌱 ${m}`),
      });
      console.log('🌱 Auto-seed complete — canonical demo scenario ready (Onion · 10 q · Nashik).');
      return;
    } catch (err) {
      if (attempt === 29) {
        console.error('🌱 Auto-seed skipped/failed:', err.message, '— manual seed: node scripts/seed-demo.js');
      }
      // otherwise keep waiting for the ephemeral connection
    }
  }
})();

// Graceful shutdown: stop accepting requests → stop the scheduler → close DB.
// Keeps a background cron from firing into a closing process and lets Atlas
// connection pools drain cleanly on deploy/restart.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down gracefully…`);
  stopScheduler();
  server.close(async () => {
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (err) {
      console.error('MongoDB close error:', err.message);
    }
    process.exit(0);
  });
  // Failsafe: do not hang forever on stubborn keep-alive sockets.
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

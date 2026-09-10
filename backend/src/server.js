const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const diagnosticsRoutes = require('./routes/diagnostics');

// Error handling
const errorHandler = require('./middleware/errorHandler');

// Initialize Firebase Admin SDK
const { initializeFirebase } = require('./config/firebase');
initializeFirebase();

// Connect to MongoDB
const connectDB = require('./config/mongodb');
const { getDbMode } = require('./config/mongodb');
connectDB().catch(err => console.error('❌ MongoDB connection failed:', err.message));

// Start automated market-data refresh scheduler
const { startScheduler, stopScheduler } = require('./services/scheduler');
startScheduler(); // daily at 09:00 IST

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Behind a reverse proxy (nginx etc.) this makes req.ip the real client IP —
// required for the auth rate limiter to count per-caller rather than per-proxy.
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

// Rate limiting — global generous cap (live demos do image uploads and refreshes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Tighter limiter on token minting: /demo-login has no real credentials by
// design, so it must never be an unlimited key-generation service.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts — try again in a few minutes' },
});
app.use('/api/auth/demo-login', authLimiter);

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
// state, without falsely reporting degraded systems as healthy.
const { getHealth: getSchedulerHealth } = require('./services/scheduler');
app.get('/health', (req, res) => {
  const dbMode = getDbMode(); // 'connected' | 'memory' | 'offline'
  const dbReady = dbMode === 'connected' || dbMode === 'memory';
  const scheduler = getSchedulerHealth();
  const degraded = dbMode === 'offline' || scheduler.consecutiveFailures > 0;
  res.status(200).json({
    status: degraded ? 'DEGRADED' : 'OK',
    message: 'Kisan360 Backend is running',
    db: dbMode,
    dbReady,
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
app.use('/api/diagnostics', diagnosticsRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be registered after routes)
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`🚀 Kisan360 Backend server is running on port ${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
  if (getDbMode() === 'memory') {
    console.log('🧪 DEMO FALLBACK active: in-memory database. Production never takes this path.');
  }
});

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

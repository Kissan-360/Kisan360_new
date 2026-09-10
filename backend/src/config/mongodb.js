const mongoose = require('mongoose');

let memoryServer = null;
let dbMode = 'offline'; // boot-time label; getDbMode() reports live truth

// Presenter-facing DB mode: the demo fallback must be visible, never silent.
// Derived from the LIVE connection state, not the boot-time outcome — if the
// database drops mid-session, /health must say so instead of repeating the
// boot label.
const getDbMode = () => {
  if (mongoose.connection.readyState === 1) {
    return memoryServer ? 'memory' : 'connected';
  }
  return memoryServer ? 'memory' : 'offline';
};

const connectDB = async () => {
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kisan360';

    // Fail fast instead of letting mongoose buffer queries for ~30s when the
    // database is unreachable (important for live demos).
    mongoose.set('bufferCommands', false);

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });

    dbMode = 'connected';
    console.log('✅ MongoDB connected successfully to', mongoose.connection.host);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);

    // PRODUCTION: Never fall back to in-memory. Data must persist.
    if (isProduction || process.env.KISAN_DEMO_MEMORY_DB === '0') {
      console.warn('⚠️ Continuing without database in production mode. Persistence features will report 503.');
      return;
    }

    // DEMO FALLBACK: Atlas DNS is intermittently unreachable on venue Wi-Fi.
    // The integration suite already proves the whole app runs on
    // mongodb-memory-server, so for demo reliability we fall back to it —
    // loudly. Data lives only for this process's lifetime; seed-demo.js
    // repopulates the journey state.
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      await mongoose.connect(memoryServer.getUri('kisan360'), {
        serverSelectionTimeoutMS: 5000,
      });
      dbMode = 'memory';
      console.log('🧪 DEMO FALLBACK: MongoDB unreachable — using in-memory database.');
      console.log('   Data resets when the API restarts. Run `node scripts/seed-demo.js` to repopulate the demo journey.');
    } catch (memErr) {
      dbMode = 'offline';
      console.error('❌ In-memory fallback also failed:', memErr.message);
      console.warn('⚠️ Server will continue without database. Some features may not work.');
    }
  }
};

module.exports = connectDB;
module.exports.getDbMode = getDbMode;

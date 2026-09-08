const mongoose = require('mongoose');

// Fail fast (503) instead of letting mongoose buffer queries for 30s when the
// database is unreachable — keeps the demo UI responsive.
const requireDb = (req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    success: false,
    error: 'Database unavailable',
    dbStatus: 'disconnected',
    hint: 'Start MongoDB (see MONGODB_URI in backend/.env) and restart the API.',
  });
};

module.exports = requireDb;

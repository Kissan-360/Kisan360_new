const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { isTelemetryEnabled, ALLOWED_EVENTS } = require('../lib/usageEvents');
const UsageEvent = require('../models/UsageEvent');
const logger = require('../utils/logger');

const router = express.Router();

const isAdmin = (req) => req.user && req.user.role === 'admin';

/**
 * GET /api/ops/metrics — the pilot report, and only that.
 *
 * Admin-gated because it summarises who used the platform where, at district
 * granularity. Returns counts, never records: there is nothing here that could
 * re-identify a participant, which is the point of collecting so little.
 *
 * `?days=30` sets the window. Always reports the window AND the all-time totals,
 * so a quiet week cannot be mistaken for an empty pilot.
 */
router.get('/metrics', authenticateUser, async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin token required (demo-login role=admin).' });
  }
  if (!isTelemetryEnabled()) {
    return res.json({
      success: true,
      telemetryEnabled: false,
      note: 'Telemetry is off. Set KISAN_TELEMETRY=on on the API to record pilot milestones — nothing has been collected so far.',
      allowedEvents: ALLOWED_EVENTS,
    });
  }

  const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  try {
    const [byEvent, byRole, byDistrict, totals, devices, first, last] = await Promise.all([
      UsageEvent.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$event', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      UsageEvent.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$role', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      UsageEvent.aggregate([{ $match: { at: { $gte: since }, district: { $ne: null } } }, { $group: { _id: '$district', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      UsageEvent.countDocuments({}),
      UsageEvent.distinct('installId', { installId: { $ne: null } }),
      UsageEvent.findOne({}).sort({ at: 1 }).select('at').lean(),
      UsageEvent.findOne({}).sort({ at: -1 }).select('at').lean(),
    ]);

    res.json({
      success: true,
      telemetryEnabled: true,
      windowDays: days,
      windowStart: since.toISOString(),
      inWindow: byEvent.reduce((n, r) => n + r.count, 0),
      byEvent: Object.fromEntries(byEvent.map((r) => [r._id, r.count])),
      byRole: Object.fromEntries(byRole.map((r) => [r._id, r.count])),
      topDistricts: byDistrict.map((r) => ({ district: r._id, count: r.count })),
      distinctDevices: devices.length,
      allTimeEvents: totals,
      firstEventAt: first ? first.at : null,
      lastEventAt: last ? last.at : null,
      privacy: 'Counts only. No uid, name, phone or free text is stored — see backend/src/lib/usageEvents.js.',
    });
  } catch (error) {
    logger.error('Usage metrics error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to summarise usage' });
  }
});

module.exports = router;

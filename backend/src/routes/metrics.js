const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const UsageEvent = require('../models/UsageEvent');

/**
 * GET /api/metrics/impact — pilot impact from telemetry only.
 * No vanity numbers: every figure needs real usage (UsageEvent milestones).
 * Auth: any demo login may read counts (no identity or prices included).
 */
router.get('/impact', authenticateUser, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [byEvent, devices] = await Promise.all([
      UsageEvent.aggregate([
        { $match: { at: { $gte: since } } },
        { $group: { _id: '$event', count: { $sum: 1 } } },
      ]),
      UsageEvent.distinct('installId', { at: { $gte: since }, installId: { $ne: null } }),
    ]);
    const counts = Object.fromEntries(byEvent.map((r) => [r._id, r.count]));
    res.json({
      success: true,
      windowDays: 30,
      farmersServedEstimate: devices.length,
      milestones: counts,
      note: 'Counts from UsageEvent milestones only. No prices, no PII. Telemetry is opt-in (KISAN_TELEMETRY=on).',
    });
  } catch (e) {
    // In-memory/offline DB: impact is unavailable, but the route is honest about it
    res.json({ success: true, windowDays: 30, farmersServedEstimate: 0, milestones: {}, note: 'DB offline — no telemetry yet.' });
  }
});

module.exports = router;

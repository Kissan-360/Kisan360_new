const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const Detection = require('../models/Detection');
const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/detections — list user's recent detections
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const detections = await Detection.find({ firebaseUid: req.user.uid })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, detections });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch detections' });
  }
});

// Shape validation for detection payloads. Returns a list of human-readable errors.
function validateDetectionPayload(body = {}) {
  const errors = [];
  const disease = typeof body.disease === 'string' ? body.disease.trim() : '';
  if (!disease || disease.length > 200) errors.push('disease is required and must be 1-200 characters');
  if (body.confidence !== undefined && body.confidence !== null) {
    const n = Number(body.confidence);
    if (!Number.isFinite(n) || n < 0 || n > 1) errors.push('confidence must be a number between 0 and 1');
  }
  if (body.recommendations !== undefined && body.recommendations !== null && !Array.isArray(body.recommendations)) {
    errors.push('recommendations must be an array');
  }
  return errors;
}

// POST /api/detections — save a detection result
router.post('/', async (req, res) => {
  try {
    const errors = validateDetectionPayload(req.body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
    const { cropType, disease, confidence, severity, treatment, recommendations } = req.body;
    const detection = await Detection.create({ cropType, disease: String(disease).trim(), confidence, severity, treatment, recommendations, firebaseUid: req.user.uid });
    res.status(201).json({ success: true, detection });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save detection' });
  }
});

module.exports = router;

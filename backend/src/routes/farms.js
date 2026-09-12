const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const Farm = require('../models/Farm');
const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/farms — list user's farms
router.get('/', async (req, res) => {
  try {
    const farms = await Farm.find({ firebaseUid: req.user.uid }).sort({ createdAt: -1 });
    res.json({ success: true, farms });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch farms' });
  }
});

const VALID_UNITS = new Set(['acres', 'hectares', 'bigha']);

// Shape validation for farm payloads. Returns a list of human-readable errors.
// `requireName` is true for creation; updates validate shape only when present
// so partial PUTs never fail just because a field was omitted.
function validateFarmPayload(body = {}, { requireName = false } = {}) {
  const errors = [];
  if (body.name !== undefined || requireName) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) errors.push('name is required and must be 1-100 characters');
  }
  if (body.unit !== undefined && body.unit !== null && !VALID_UNITS.has(body.unit)) {
    errors.push('unit must be one of: acres, hectares, bigha');
  }
  if (body.area !== undefined && body.area !== null && body.area !== '') {
    const n = Number(body.area);
    if (!Number.isFinite(n) || n <= 0) errors.push('area must be a positive number');
  }
  if (body.crops !== undefined && body.crops !== null) {
    if (!Array.isArray(body.crops) || body.crops.some((c) => typeof c !== 'string')) {
      errors.push('crops must be an array of strings');
    }
  }
  return errors;
}

// POST /api/farms — create a farm
router.post('/', async (req, res) => {
  try {
    const errors = validateFarmPayload(req.body, { requireName: true });
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
    const { name, location, area, unit, soilType, crops, notes } = req.body;
    const farm = await Farm.create({ name: String(name).trim(), location, area, unit, soilType, crops, notes, firebaseUid: req.user.uid });
    res.status(201).json({ success: true, farm });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create farm' });
  }
});

// PUT /api/farms/:id — update a farm
router.put('/:id', async (req, res) => {
  try {
    const errors = validateFarmPayload(req.body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
    const { name, location, area, unit, soilType, crops, notes } = req.body;
    const farm = await Farm.findOneAndUpdate(
      { _id: req.params.id, firebaseUid: req.user.uid },
      { name, location, area, unit, soilType, crops, notes },
      { new: true, runValidators: true }
    );
    if (!farm) return res.status(404).json({ success: false, error: 'Farm not found' });
    res.json({ success: true, farm });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update farm' });
  }
});

// DELETE /api/farms/:id — delete a farm
router.delete('/:id', async (req, res) => {
  try {
    const farm = await Farm.findOneAndDelete({ _id: req.params.id, firebaseUid: req.user.uid });
    if (!farm) return res.status(404).json({ success: false, error: 'Farm not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete farm' });
  }
});

module.exports = router;

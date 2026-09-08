const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const Lot = require('../models/Lot');

const router = express.Router();
router.use(authenticateUser, requireDb);

// GET /api/lots — the farmer's lots, newest first
router.get('/', async (req, res) => {
  try {
    const lots = await Lot.find({ farmerUid: req.user.uid }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: lots.length, lots });
  } catch (error) {
    console.error('List lots error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list lots' });
  }
});

// GET /api/lots/:id
router.get('/:id', async (req, res) => {
  try {
    const lot = await Lot.findOne({ _id: req.params.id, farmerUid: req.user.uid }).lean();
    if (!lot) return res.status(404).json({ success: false, error: 'Lot not found' });
    res.json({ success: true, lot });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Lot not found' });
    console.error('Get lot error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load lot' });
  }
});

// POST /api/lots — create a lot from a crop/quantity/quality snapshot
router.post('/', async (req, res) => {
  try {
    const { crop, variety, quantity, unit, grade, size, moisturePct, damagePct, assayStatus, harvestDate, district, photos, notes, expectedPricePerQuintal } = req.body || {};

    if (!crop || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'crop and a positive quantity are required' });
    }

    const lot = await Lot.create({
      farmerUid: req.user.uid,
      crop,
      variety: variety || '',
      quantity,
      unit: unit || 'quintals',
      grade: grade || 'Unassessed',
      size: size || '',
      moisturePct: moisturePct ?? null,
      damagePct: damagePct ?? null,
      assayStatus: assayStatus || 'pending',
      harvestDate: harvestDate || '',
      district: district || req.user.district || '',
      photos: photos || [],
      notes: notes || '',
      expectedPricePerQuintal: expectedPricePerQuintal ?? null,
      status: 'OPEN',
    });

    res.status(201).json({ success: true, lot });
  } catch (error) {
    console.error('Create lot error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create lot' });
  }
});

// PATCH /api/lots/:id — owner edits a lot while it is still OPEN
router.patch('/:id', async (req, res) => {
  try {
    const lot = await Lot.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!lot) return res.status(404).json({ success: false, error: 'Lot not found' });
    if (lot.status !== 'OPEN') {
      return res.status(409).json({ success: false, error: `Lot cannot be edited after it is ${lot.status}` });
    }
    const editable = ['crop', 'variety', 'quantity', 'unit', 'grade', 'size', 'moisturePct', 'damagePct', 'assayStatus', 'harvestDate', 'district', 'photos', 'notes', 'expectedPricePerQuintal'];
    for (const key of editable) {
      if (key in req.body) lot[key] = req.body[key];
    }
    await lot.save();
    res.json({ success: true, lot });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Lot not found' });
    console.error('Update lot error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update lot' });
  }
});

// POST /api/lots/:id/withdraw — farmer takes the lot off the market
router.post('/:id/withdraw', async (req, res) => {
  try {
    const lot = await Lot.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!lot) return res.status(404).json({ success: false, error: 'Lot not found' });
    if (!['OPEN', 'OFFERED'].includes(lot.status)) {
      return res.status(409).json({ success: false, error: 'Lot cannot be withdrawn in its current state' });
    }
    lot.status = 'WITHDRAWN';
    await lot.save();
    res.json({ success: true, lot });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Lot not found' });
    console.error('Withdraw lot error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to withdraw lot' });
  }
});

module.exports = router;

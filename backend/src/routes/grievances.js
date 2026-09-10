const express = require('express');
const mongoose = require('mongoose');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const { transition, allowedTransitions } = require('../services/stateMachine');
const Grievance = require('../models/Grievance');

const router = express.Router();
router.use(authenticateUser, requireDb);

const isBuyerSide = (role) => ['buyer', 'fpo', 'admin'].includes(role);

// POST /api/grievances — farmer raises a grievance (starts OPEN per the HLD)
router.post('/', async (req, res) => {
  try {
    const { lotId, category, description } = req.body || {};
    const VALID_CATEGORIES = ['PAYMENT_DELAY', 'QUALITY_DISPUTE', 'WEIGHT_DISPUTE', 'BUYER_NO_SHOW', 'OTHER'];
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `category is required and must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0 || description.length > 5000) {
      return res.status(400).json({ success: false, error: 'description is required (max 5000 characters)' });
    }
    if (lotId && !mongoose.Types.ObjectId.isValid(lotId)) {
      return res.status(400).json({ success: false, error: 'lotId is not a valid id' });
    }
    const grievance = await Grievance.create({
      raisedByUid: req.user.uid,
      lotId: lotId || null,
      category,
      description,
      status: 'OPEN',
      history: [{ from: null, to: 'OPEN', status: 'OPEN', at: new Date().toISOString(), by: req.user.uid, note: 'Grievance raised' }],
    });
    res.status(201).json({ success: true, grievance });
  } catch (error) {
    console.error('Create grievance error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to raise grievance' });
  }
});

// GET /api/grievances — farmer sees their own; buyer/fpo/admin see the queue
router.get('/', async (req, res) => {
  try {
    const filter = isBuyerSide(req.user.role) ? {} : { raisedByUid: req.user.uid };
    const grievances = await Grievance.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, count: grievances.length, grievances, view: isBuyerSide(req.user.role) ? 'queue' : 'mine' });
  } catch (error) {
    console.error('List grievances error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list grievances' });
  }
});

// GET /api/grievances/:id
router.get('/:id', async (req, res) => {
  try {
    const g = await Grievance.findById(req.params.id).lean();
    if (!g) return res.status(404).json({ success: false, error: 'Grievance not found' });
    if (g.raisedByUid !== req.user.uid && !isBuyerSide(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Not your grievance' });
    }
    res.json({ success: true, grievance: g, allowedTransitions: allowedTransitions('grievance', g.status) });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Grievance not found' });
    console.error('Get grievance error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load grievance' });
  }
});

// POST /api/grievances/:id/transition — move the state (buyer/fpo/admin only).
// Body: { to: 'UNDER_REVIEW'|'RESOLVED'|'REJECTED', note? }
router.post('/:id/transition', async (req, res) => {
  try {
    if (!isBuyerSide(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only a buyer-side/fpo demo login can move a grievance' });
    }
    const { to, note } = req.body || {};
    if (!to) return res.status(400).json({ success: false, error: 'to is required (UNDER_REVIEW, RESOLVED or REJECTED)' });
    const grievance = await Grievance.findById(req.params.id);
    if (!grievance) return res.status(404).json({ success: false, error: 'Grievance not found' });
    transition('grievance', grievance, to, {
      by: req.user.uid,
      note: note || (to === 'RESOLVED' ? 'Resolved after review (demo)' : ''),
    });
    if (to === 'RESOLVED' || to === 'REJECTED') {
      grievance.resolutionNote = note || grievance.resolutionNote;
    }
    await grievance.save();
    res.json({ success: true, grievance });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Grievance not found' });
    console.error('Transition grievance error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to transition grievance' });
  }
});

module.exports = router;

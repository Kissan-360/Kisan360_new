const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const Lot = require('../models/Lot');
const LogisticsRequest = require('../models/LogisticsRequest');
const logger = require('../utils/logger');
const { transition } = require('../services/stateMachine');
const {
  systemEstimate,
  findProviders,
  generateQuote,
  validateRequest,
  coordinationState,
} = require('../services/logisticsCoordination');

const router = express.Router();
router.use(authenticateUser, requireDb);

// GET /api/logistics/options?origin=&destination=&quantity=&transportType=
// Find compatible transport providers for a route.
router.get('/options', (req, res) => {
  try {
    const { origin, destination, quantity, transportType } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ success: false, error: 'origin and destination query params are required' });
    }
    const rawQty = parseFloat(quantity);
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 10;

    const providers = findProviders({ origin, destination, quantityQuintals: qty, transportType });
    const sysEst = systemEstimate(0, qty); // distance unknown at this point

    res.json({
      success: true,
      origin,
      destination,
      quantityQuintals: qty,
      providers,
      count: providers.length,
      systemEstimateNote: 'System cost estimate requires distance — use POST /api/logistics/requests for full quote comparison',
      dataBasis: 'Transport providers are demo directory entries with documented rates. Trust tiers do not represent real verification.',
    });
  } catch (error) {
    logger.error('Logistics options error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to find transport options', details: error.message });
  }
});

// POST /api/logistics/requests — create a transport request for a lot.
router.post('/requests', async (req, res) => {
  try {
    const { lotId, origin, destination, quantity, unit, requestedDate, requestedWindow, transportType, notes } = req.body || {};
    if (!lotId) {
      return res.status(400).json({ success: false, error: 'lotId is required' });
    }

    // Load lot and validate integrity
    const lot = await Lot.findOne({ _id: lotId, farmerUid: req.user.uid });
    const validation = validateRequest(lot, { origin, destination, quantity });
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: validation.errors.join('; ') });
    }

    // Compute system estimate
    // Distance will be filled in when provider is selected — use 0 for now
    const sysEst = systemEstimate(0, Number(quantity));

    const logisticsRequest = await LogisticsRequest.create({
      lotId: lot._id,
      farmerUid: req.user.uid,
      crop: lot.crop,
      origin: String(origin).trim(),
      destination: String(destination).trim(),
      quantity: Number(quantity),
      unit: unit || lot.unit || 'quintals',
      requestedDate: requestedDate || '',
      requestedWindow: requestedWindow || '',
      transportType: transportType || 'any',
      systemEstimatedCost: 0,
      systemEstimatedCostPerQuintal: 0,
      status: 'REQUESTED',
      notes: notes || '',
      classification: 'DEMO_LOGISTICS',
      demo: true,
    });

    // Add initial history entry
    logisticsRequest.history.push({
      from: null,
      to: 'REQUESTED',
      status: 'REQUESTED',
      at: new Date().toISOString(),
      by: req.user.uid,
      note: 'Transport request created',
    });
    await logisticsRequest.save();

    res.status(201).json({
      success: true,
      request: logisticsRequest,
      coordinationState: coordinationState(logisticsRequest),
      dataBasis: 'Transport request created. System cost estimate requires distance — providers will be matched when distance is known.',
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'Invalid lotId format' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: Object.values(error.errors).map(e => e.message).join('; ') });
    }
    logger.error('Create logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create logistics request', details: error.message });
  }
});

// GET /api/logistics/requests — list the farmer's logistics requests.
router.get('/requests', async (req, res) => {
  try {
    const requests = await LogisticsRequest.find({ farmerUid: req.user.uid }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    logger.error('List logistics requests error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list logistics requests' });
  }
});

// GET /api/logistics/requests/:id — get a specific logistics request.
router.get('/requests/:id', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid }).lean();
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });
    res.json({
      success: true,
      request,
      coordinationState: coordinationState(request),
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Get logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load logistics request' });
  }
});

// POST /api/logistics/requests/:id/quote — provide a carrier quote (simulated).
// In demo mode, this simulates a carrier responding. Production would integrate
// with real carrier APIs via the provider adapter interface.
router.post('/requests/:id/quote', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });

    const { providerId, distanceKm, distanceMethod } = req.body || {};
    if (!providerId) {
      return res.status(400).json({ success: false, error: 'providerId is required' });
    }

    // Load provider
    const { loadProviders } = require('../services/logisticsCoordination');
    const data = loadProviders();
    const provider = (data.providers || []).find(p => p.id === providerId);
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider not found in directory' });
    }

    // Transition to QUOTED
    try {
      transition('logistics', request, 'QUOTED', { by: req.user.uid, note: `Quote from ${provider.name}` });
    } catch (err) {
      return res.status(422).json({ success: false, error: err.message, from: err.from, to: err.to });
    }

    // Generate quote
    const dist = Number(distanceKm) || 0;
    const quote = generateQuote(provider, dist, request.quantity);

    request.providerId = provider.id;
    request.providerName = provider.name;
    request.providerTrustTier = provider.trustTier;
    request.estimatedDistanceKm = dist;
    request.distanceMethod = distanceMethod || null;
    request.quotedCost = quote.quotedCost;
    request.quotedCostPerQuintal = quote.quotedCostPerQuintal;
    request.systemEstimatedCost = quote.systemEstimatedCost;
    request.systemEstimatedCostPerQuintal = quote.systemEstimatedCostPerQuintal;
    request.costDifference = quote.costDifference;
    request.costDifferenceNote = quote.costDifferenceNote;

    await request.save();

    res.json({
      success: true,
      request,
      quote,
      coordinationState: coordinationState(request),
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Quote logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate quote', details: error.message });
  }
});

// POST /api/logistics/requests/:id/accept — accept a quoted transport request.
router.post('/requests/:id/accept', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });

    try {
      transition('logistics', request, 'ACCEPTED', { by: req.user.uid, note: 'Quote accepted by farmer' });
    } catch (err) {
      return res.status(422).json({ success: false, error: err.message, from: err.from, to: err.to });
    }

    await request.save();
    res.json({ success: true, request, coordinationState: coordinationState(request) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Accept logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to accept logistics request' });
  }
});

// POST /api/logistics/requests/:id/schedule — schedule pickup/delivery window.
router.post('/requests/:id/schedule', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });

    const { scheduledDate, scheduledWindow } = req.body || {};
    if (!scheduledDate) {
      return res.status(400).json({ success: false, error: 'scheduledDate is required' });
    }

    try {
      transition('logistics', request, 'SCHEDULED', { by: req.user.uid, note: `Scheduled for ${scheduledDate}` });
    } catch (err) {
      return res.status(422).json({ success: false, error: err.message, from: err.from, to: err.to });
    }

    request.scheduledDate = scheduledDate;
    request.scheduledWindow = scheduledWindow || '';
    await request.save();

    res.json({ success: true, request, coordinationState: coordinationState(request) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Schedule logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to schedule logistics request' });
  }
});

// POST /api/logistics/requests/:id/transit — mark as in transit.
router.post('/requests/:id/transit', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });

    try {
      transition('logistics', request, 'IN_TRANSIT', { by: req.user.uid, note: 'Shipment in transit' });
    } catch (err) {
      return res.status(422).json({ success: false, error: err.message, from: err.from, to: err.to });
    }

    await request.save();
    res.json({ success: true, request, coordinationState: coordinationState(request) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Transit logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to mark logistics request as in transit' });
  }
});

// POST /api/logistics/requests/:id/deliver — mark as delivered.
router.post('/requests/:id/deliver', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });

    try {
      transition('logistics', request, 'DELIVERED', { by: req.user.uid, note: 'Shipment delivered' });
    } catch (err) {
      return res.status(422).json({ success: false, error: err.message, from: err.from, to: err.to });
    }

    await request.save();
    res.json({ success: true, request, coordinationState: coordinationState(request) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Deliver logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to mark logistics request as delivered' });
  }
});

// POST /api/logistics/requests/:id/cancel — cancel a logistics request.
router.post('/requests/:id/cancel', async (req, res) => {
  try {
    const request = await LogisticsRequest.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!request) return res.status(404).json({ success: false, error: 'Logistics request not found' });

    const { reason } = req.body || {};
    try {
      transition('logistics', request, 'CANCELLED', { by: req.user.uid, note: reason || 'Cancelled by farmer' });
    } catch (err) {
      return res.status(422).json({ success: false, error: err.message, from: err.from, to: err.to });
    }

    await request.save();
    res.json({ success: true, request, coordinationState: coordinationState(request) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Logistics request not found' });
    }
    logger.error('Cancel logistics request error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to cancel logistics request' });
  }
});

module.exports = router;

const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const { transition } = require('../services/stateMachine');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticateUser, requireDb);

// Who is buyer-side, and what `?role=` may say, is defined ONCE in
// lib/roleScope.js and shared with the offers book — FPO is producer side there
// so an FPO selling a pooled lot sees its OWN payments, not a 403.
const { isBuyerSideRole: isBuyerSide, listingScope } = require('../lib/roleScope');

// GET /api/payments?role=farmer|buyer — farmers see their own; buyer-side demo
// logins see the simulated escrow book.
router.get('/', async (req, res) => {
  try {
    const side = listingScope(req);
    const filter = side === 'buyer' ? {} : { farmerUid: req.user.uid };
    // Populate the lot's district so buyer-side benchmark/outcome cards use the
    // REAL haul district — without this the UI falls back to a wrong default.
    const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(50)
      .populate('lotId', 'crop quantity unit district grade status')
      .lean();
    res.json({
      success: true,
      count: payments.length,
      payments,
      view: side,
      mocked: true,
      note: 'Simulated payment statuses for the demo — no real money movement.',
    });
  } catch (error) {
    if (error.status === 403) return res.status(403).json({ success: false, error: error.message });
    logger.error('List payments error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list payments' });
  }
});

// GET /api/payments/:id
router.get('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).lean();
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    const owner = payment.farmerUid === req.user.uid;
    if (!owner && !isBuyerSide(req.user.role)) return res.status(403).json({ success: false, error: 'Not your payment' });
    res.json({ success: true, payment, mocked: true });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Payment not found' });
    logger.error('Get payment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load payment' });
  }
});

// POST /api/payments/simulate/accept-latest — FARMER-SIDE DEMO CONTROL:
// simulates a buyer accepting the farmer's most recent SENT offer (single-device
// demo ladder). Mirrors offers.js accept logic — offer ACCEPTED, payment created
// and moved straight to HELD escrow, lot CLOSED. Clearly labeled simulated.
router.post('/simulate/accept-latest', async (req, res) => {
  try {
    const Offer = require('../models/Offer');
    const Lot = require('../models/Lot');
    const { transition } = require('../services/stateMachine');
    const offer = await Offer.findOne({ farmerUid: req.user.uid, status: 'SENT' })
      .sort({ createdAt: -1 });
    if (!offer) {
      return res.status(404).json({ success: false, error: 'No pending offer to simulate acceptance for. Send an offer to a buyer first.' });
    }
    const existingPayment = await Payment.findOne({ offerId: offer._id });
    if (existingPayment) return res.status(409).json({ success: false, error: 'A payment already exists for this offer' });

    const payment = await Payment.create({
      offerId: offer._id,
      lotId: offer.lotId,
      farmerUid: offer.farmerUid,
      buyerId: offer.buyerId,
      buyerName: offer.buyerName,
      crop: offer.crop,
      quantityQuintals: offer.quantityQuintals,
      amount: offer.amount,
      currency: 'INR',
      status: 'PENDING',
      history: [{ from: null, to: 'PENDING', status: 'PENDING', at: new Date().toISOString(), by: 'system', note: 'Payment record created (simulated)' }],
    });
    transition('payment', payment, 'HELD', { by: req.user.uid, note: 'Simulated buyer acceptance — funds held (simulated escrow)' });
    await payment.save();
    transition('offer', offer, 'ACCEPTED', { by: req.user.uid, note: 'Accepted by buyer (simulated for demo)' });
    await offer.save();
    await Lot.updateOne({ _id: offer.lotId }, { status: 'CLOSED' });

    res.json({
      success: true,
      offer,
      payment,
      mocked: true,
      note: 'DEMO SIMULATION — buyer acceptance simulated on the farmer screen. No real money moves. Payment is now HELD in simulated escrow.',
    });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Simulate accept-latest error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to simulate buyer acceptance' });
  }
});

// POST /api/payments/:id/simulate-release — FARMER-SIDE DEMO CONTROL:
// simulates the buyer completing settlement on their own payment (Held → Released).
// The real release endpoint stays buyer-gated; this one exists so the whole
// selling journey can be demoed from a single device.
router.post('/:id/simulate-release', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    if (payment.farmerUid !== req.user.uid) return res.status(403).json({ success: false, error: 'Not your payment' });
    const { transition } = require('../services/stateMachine');
    transition('payment', payment, 'RELEASED', {
      by: req.user.uid,
      note: 'DEMO SIMULATION — settlement simulated from the farmer screen. Funds released to farmer (no real money moves).',
    });
    await payment.save();
    res.json({ success: true, payment, mocked: true, note: 'DEMO SIMULATION — funds released (no real money moves).' });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Simulate release error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to simulate release' });
  }
});

// POST /api/payments/:id/simulate-failure — FARMER-SIDE DEMO CONTROL:
// simulates the buyer NOT paying (Held → Cancelled with an explicit reason),
// so the grievance path (raise → review → resolution) can be demoed.
router.post('/:id/simulate-failure', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    if (payment.farmerUid !== req.user.uid) return res.status(403).json({ success: false, error: 'Not your payment' });
    const { transition } = require('../services/stateMachine');
    transition('payment', payment, 'CANCELLED', {
      by: req.user.uid,
      note: 'DEMO SIMULATION — buyer failed to release funds after delivery. Farmer advised to raise a grievance.',
    });
    await payment.save();
    res.json({
      success: true,
      payment,
      mocked: true,
      note: 'DEMO SIMULATION — payment cancelled (buyer did not pay). Raise an issue to start the resolution workflow.',
    });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Simulate failure error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to simulate payment failure' });
  }
});

// POST /api/payments/:id/release — simulated settlement: Held → Released
router.post('/:id/release', async (req, res) => {
  try {
    if (!isBuyerSide(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only a buyer-side demo login can release funds' });
    }
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    transition('payment', payment, 'RELEASED', {
      by: req.user.uid,
      note: 'Simulated settlement after delivery/quality check — funds released to farmer (no real money moves).',
    });
    await payment.save();
    res.json({ success: true, payment, mocked: true });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Release payment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to release payment' });
  }
});

// POST /api/payments/:id/cancel — abort a PENDING/HELD payment (demo)
router.post('/:id/cancel', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    const owner = payment.farmerUid === req.user.uid;
    if (!owner && !isBuyerSide(req.user.role)) return res.status(403).json({ success: false, error: 'Not your payment' });
    transition('payment', payment, 'CANCELLED', { by: req.user.uid, note: (req.body && req.body.reason) || 'Cancelled (simulated)' });
    await payment.save();
    res.json({ success: true, payment, mocked: true });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Cancel payment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to cancel payment' });
  }
});

module.exports = router;

const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const { transition } = require('../services/stateMachine');
const Payment = require('../models/Payment');

const router = express.Router();
router.use(authenticateUser, requireDb);

function isBuyerSide(role) {
  return ['buyer', 'fpo', 'admin'].includes(role);
}

// Listing scope comes from the VERIFIED token role, not the query string.
// `?role=` is only a view selector that must match the caller's own side — a
// farmer asking for the buyer escrow book (`?role=buyer`) is rejected.
function listingScope(req) {
  const side = isBuyerSide(req.user.role) ? 'buyer' : 'farmer';
  const requested = String(req.query.role || '').toLowerCase();
  if (requested && ['farmer', 'buyer'].includes(requested) && requested !== side) {
    const err = new Error("You cannot view the other side's book with this login");
    err.status = 403;
    throw err;
  }
  return side;
}

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
    console.error('List payments error:', error.message);
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
    console.error('Get payment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load payment' });
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
    console.error('Release payment error:', error.message);
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
    console.error('Cancel payment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to cancel payment' });
  }
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const { transition } = require('../services/stateMachine');
const Lot = require('../models/Lot');
const Offer = require('../models/Offer');
const Payment = require('../models/Payment');

const router = express.Router();
router.use(authenticateUser, requireDb);

const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');
let directoryBuyers = [];
try {
  directoryBuyers = (JSON.parse(fs.readFileSync(BUYERS_FILE, 'utf8')).buyers) || [];
} catch (error) {
  console.error('Failed to load buyer directory:', error.message);
}

function quantityInQuintals(lot) {
  const qty = Number(lot.quantity) || 0;
  if (lot.unit === 'kg') return qty / 100;
  if (lot.unit === 'tonnes') return qty * 10;
  return qty;
}

function buyerFromDirectory(buyerId) {
  return directoryBuyers.find(b => b.id === buyerId) || null;
}

// POST /api/offers — farmer sends an offer for an OPEN lot to a directory buyer
router.post('/', async (req, res) => {
  try {
    const { lotId, buyerId, offeredPricePerQuintal, notes } = req.body || {};
    if (!lotId || !buyerId) {
      return res.status(400).json({ success: false, error: 'lotId and buyerId are required' });
    }
    if (!offeredPricePerQuintal || offeredPricePerQuintal <= 0) {
      return res.status(400).json({ success: false, error: 'offeredPricePerQuintal must be positive (₹/quintal)' });
    }
    if (!mongoose.Types.ObjectId.isValid(lotId)) {
      return res.status(400).json({ success: false, error: 'lotId is not a valid id' });
    }
    const buyer = buyerFromDirectory(buyerId);
    if (!buyer) return res.status(404).json({ success: false, error: 'Buyer not found in directory' });

    const lot = await Lot.findOne({ _id: lotId, farmerUid: req.user.uid });
    if (!lot) return res.status(404).json({ success: false, error: 'Lot not found (must be your own lot)' });
    if (lot.status === 'CLOSED' || lot.status === 'WITHDRAWN') {
      return res.status(409).json({ success: false, error: `Cannot offer a ${lot.status.toLowerCase()} lot` });
    }

    const existing = await Offer.findOne({ lotId: lot._id, buyerId, status: 'SENT' });
    if (existing) return res.status(409).json({ success: false, error: 'An active offer to this buyer already exists' });

    const quantityQtl = quantityInQuintals(lot);
    const amount = Math.round(offeredPricePerQuintal * quantityQtl * 100) / 100;

    const offer = await Offer.create({
      lotId: lot._id,
      farmerUid: req.user.uid,
      buyerId,
      buyerName: buyer.name,
      crop: lot.crop,
      quantityQuintals: quantityQtl,
      offeredPricePerQuintal,
      amount,
      status: 'SENT',
      history: [{ status: 'SENT', at: new Date().toISOString(), by: req.user.uid, note: 'Offer sent to buyer' }],
      notes: notes || '',
    });

    if (lot.status === 'OPEN') {
      lot.status = 'OFFERED';
      await lot.save();
    }

    res.status(201).json({ success: true, offer, note: 'Offer sent. Simulated flow: the buyer accepts from a buyer/fpo demo login.' });
  } catch (error) {
    console.error('Create offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create offer' });
  }
});

// GET /api/offers?role=farmer|buyer — farmer sees their offers; buyer/fpo/admin
// sees inbound offers (demo semantics; a buyer has no user account of its own).
router.get('/', async (req, res) => {
  try {
    const role = (req.query.role || 'farmer').toLowerCase();
    const isBuyerSide = role === 'buyer' || role === 'fpo' || role === 'admin';
    const filter = isBuyerSide ? {} : { farmerUid: req.user.uid };
    if (!isBuyerSide && !['farmer', 'fpo', 'admin'].includes(req.user.role)) {
      // anyone can list their own sent offers; buyers see everything (demo)
    }
    const offers = await Offer.find(filter)
      .populate('lotId', 'crop variety quantity unit status district grade')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, count: offers.length, offers, view: role });
  } catch (error) {
    console.error('List offers error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list offers' });
  }
});

// GET /api/offers/:id
router.get('/:id', async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).populate('lotId').lean();
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    const owner = offer.farmerUid === req.user.uid;
    const buyerSide = ['buyer', 'fpo', 'admin'].includes(req.user.role);
    if (!owner && !buyerSide) return res.status(403).json({ success: false, error: 'Not your offer' });
    res.json({ success: true, offer });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Offer not found' });
    console.error('Get offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load offer' });
  }
});

// POST /api/offers/:id/accept — simulated buyer acceptance → payment moves to HELD
router.post('/:id/accept', async (req, res) => {
  try {
    if (!['buyer', 'fpo', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only a buyer-side demo login can accept an offer' });
    }
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    if (offer.status !== 'SENT') {
      return res.status(409).json({ success: false, error: `Only SENT offers can be accepted (current: ${offer.status})` });
    }
    const buyerId = req.body && req.body.buyerId ? req.body.buyerId : offer.buyerId;
    if (!buyerFromDirectory(buyerId)) {
      return res.status(404).json({ success: false, error: 'Buyer not found in directory' });
    }

    const existingPayment = await Payment.findOne({ offerId: offer._id });
    if (existingPayment) return res.status(409).json({ success: false, error: 'A payment already exists for this offer' });

    // Create the payment in PENDING then move it to HELD via the state machine.
    const payment = await Payment.create({
      offerId: offer._id,
      lotId: offer.lotId,
      farmerUid: offer.farmerUid,
      buyerId,
      buyerName: offer.buyerName,
      crop: offer.crop,
      quantityQuintals: offer.quantityQuintals,
      amount: offer.amount,
      currency: 'INR',
      status: 'PENDING',
      history: [{ from: null, to: 'PENDING', status: 'PENDING', at: new Date().toISOString(), by: 'system', note: 'Payment record created (simulated)' }],
    });
    transition('payment', payment, 'HELD', { by: req.user.uid, note: 'Buyer accepted the offer — funds held (simulated escrow)' });
    await payment.save();

    transition('offer', offer, 'ACCEPTED', { by: req.user.uid, note: 'Accepted by buyer' });
    offer.buyerId = buyerId;
    await offer.save();

    await Lot.updateOne({ _id: offer.lotId }, { status: 'CLOSED' });

    res.json({
      success: true,
      offer,
      payment,
      mocked: true,
      note: 'Simulated acceptance — no real money moves. Payment status: Pending → Held. Release happens at POST /api/payments/:id/release.',
    });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    console.error('Accept offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to accept offer' });
  }
});

// POST /api/offers/:id/reject — buyer declines
router.post('/:id/reject', async (req, res) => {
  try {
    if (!['buyer', 'fpo', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only a buyer-side demo login can reject an offer' });
    }
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    transition('offer', offer, 'REJECTED', { by: req.user.uid, note: (req.body && req.body.reason) || 'Declined by buyer' });
    await offer.save();
    res.json({ success: true, offer });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    console.error('Reject offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to reject offer' });
  }
});

// POST /api/offers/:id/withdraw — farmer pulls a SENT offer back
router.post('/:id/withdraw', async (req, res) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, farmerUid: req.user.uid });
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    transition('offer', offer, 'WITHDRAWN', { by: req.user.uid, note: 'Withdrawn by farmer' });
    await offer.save();
    res.json({ success: true, offer });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    console.error('Withdraw offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to withdraw offer' });
  }
});

module.exports = router;

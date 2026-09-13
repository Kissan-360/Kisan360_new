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
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticateUser, requireDb);

// Listing scope (and who counts as buyer-side) lives in ONE place so the books
// and the frontend cannot drift apart again — see lib/roleScope.js for why FPO
// is producer side here and why that matters.
const { isBuyerSideRole, listingScope } = require('../lib/roleScope');

const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');
let directoryBuyers = [];
try {
  directoryBuyers = (JSON.parse(fs.readFileSync(BUYERS_FILE, 'utf8')).buyers) || [];
} catch (error) {
  logger.error('Failed to load buyer directory:', error.message);
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

    // ── Buyer-initiated purchase offer ─────────────────────────────────────
    // Before this existed a buyer-side login had no way to offer on anything:
    // the only path required OWNING the lot. So a buyer-side caller here is
    // unambiguous — it means "I want to buy this listed lot", and `buyerId`
    // (a directory id) is not required.
    if (isBuyerSideRole(req.user.role)) {
      if (!lotId) return res.status(400).json({ success: false, error: 'lotId is required' });
      const buyPrice = Number(offeredPricePerQuintal);
      if (!Number.isFinite(buyPrice) || buyPrice <= 0 || buyPrice > 10000000) {
        return res.status(400).json({ success: false, error: 'offeredPricePerQuintal must be a number between 0 and 10000000 (₹/quintal)' });
      }
      if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
        return res.status(400).json({ success: false, error: 'notes must be a string of at most 2000 characters' });
      }
      if (!mongoose.Types.ObjectId.isValid(lotId)) {
        return res.status(400).json({ success: false, error: 'lotId is not a valid id' });
      }

      const listedLot = await Lot.findById(lotId);
      if (!listedLot) return res.status(404).json({ success: false, error: 'Lot not found' });
      if (listedLot.farmerUid === req.user.uid) {
        return res.status(409).json({ success: false, error: 'You cannot make an offer on your own lot' });
      }
      if (listedLot.status !== 'OPEN') {
        return res.status(409).json({ success: false, error: `This lot is no longer open (${listedLot.status})` });
      }

      const alreadyOffered = await Offer.findOne({ lotId: listedLot._id, buyerUid: req.user.uid, status: 'SENT' });
      if (alreadyOffered) {
        return res.status(409).json({ success: false, error: 'You already have an active offer on this lot' });
      }

      const buyQtyQtl = quantityInQuintals(listedLot);
      const buyAmount = Math.round(buyPrice * buyQtyQtl * 100) / 100;

      const buyOffer = await Offer.create({
        lotId: listedLot._id,
        farmerUid: listedLot.farmerUid,
        direction: 'BUYER_TO_FARMER',
        buyerUid: req.user.uid,
        buyerId: req.user.uid,
        buyerName: (typeof req.user.name === 'string' && req.user.name ? req.user.name : 'Buyer').slice(0, 80),
        crop: listedLot.crop,
        quantityQuintals: buyQtyQtl,
        offeredPricePerQuintal: buyPrice,
        amount: buyAmount,
        status: 'SENT',
        history: [{ status: 'SENT', at: new Date().toISOString(), by: req.user.uid, note: 'Purchase offer sent by buyer' }],
        notes: notes || '',
      });

      listedLot.status = 'OFFERED';
      await listedLot.save();

      return res.status(201).json({
        success: true,
        offer: buyOffer,
        note: 'Purchase offer sent. Simulated flow: the producer accepts from their My Lots page.',
      });
    }

    // ── Farmer-initiated offer to a directory buyer (unchanged) ────────────
    if (!lotId || !buyerId) {
      return res.status(400).json({ success: false, error: 'lotId and buyerId are required' });
    }
    const price = Number(offeredPricePerQuintal);
    if (!Number.isFinite(price) || price <= 0 || price > 10000000) {
      return res.status(400).json({ success: false, error: 'offeredPricePerQuintal must be a number between 0 and 10000000 (₹/quintal)' });
    }
    if (typeof buyerId !== 'string' || buyerId.length > 80) {
      return res.status(400).json({ success: false, error: 'buyerId must be a short buyer-directory id' });
    }
    if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
      return res.status(400).json({ success: false, error: 'notes must be a string of at most 2000 characters' });
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
      offeredPricePerQuintal: price,
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
    logger.error('Create offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create offer' });
  }
});

// GET /api/offers?role=farmer|buyer — scope is decided by the authenticated
// role: farmers see only their own offers; buyer/fpo/admin (demo escrow role)
// sees inbound offers. A farmer cannot opt into the buyer view.
router.get('/', async (req, res) => {
  try {
    const side = listingScope(req);
    const filter = side === 'buyer' ? {} : { farmerUid: req.user.uid };
    const offers = await Offer.find(filter)
      .populate('lotId', 'crop variety quantity unit status district grade')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, count: offers.length, offers, view: side });
  } catch (error) {
    if (error.status === 403) return res.status(403).json({ success: false, error: error.message });
    logger.error('List offers error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list offers' });
  }
});

// GET /api/offers/:id
router.get('/:id', async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).populate('lotId').lean();
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    const owner = offer.farmerUid === req.user.uid;
    const buyerSide = isBuyerSideRole(req.user.role);
    if (!owner && !buyerSide) return res.status(403).json({ success: false, error: 'Not your offer' });
    res.json({ success: true, offer });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Offer not found' });
    logger.error('Get offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load offer' });
  }
});

// POST /api/offers/:id/accept — simulated buyer acceptance → payment moves to HELD
router.post('/:id/accept', async (req, res) => {
  try {
    // Acceptance belongs to whoever did NOT send the offer. A buyer-side login
    // accepts a farmer's offer (as before); for a buyer-initiated offer the
    // producer who listed the lot accepts it. A farmer still cannot accept
    // their own outgoing offer — the guard below is unchanged for that case.
    const buyerSide = isBuyerSideRole(req.user.role);
    let offer = null;
    if (buyerSide) {
      offer = await Offer.findById(req.params.id).catch(() => null);
      // A purchase offer is the producer's to decide. Without this the buyer
      // could accept their OWN offer and conjure an escrow, with the producer
      // never having agreed to sell.
      if (offer && offer.direction === 'BUYER_TO_FARMER') {
        return res.status(403).json({ success: false, error: 'Only the producer who listed this lot can accept a purchase offer' });
      }
    } else {
      const found = await Offer.findById(req.params.id).catch(() => null);
      const isBuyerInitiated = !!found && found.direction === 'BUYER_TO_FARMER';
      if (!isBuyerInitiated || found.farmerUid !== req.user.uid) {
        return res.status(403).json({ success: false, error: 'Only a buyer-side demo login can accept an offer' });
      }
      offer = found;
    }
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    const buyerInitiated = offer.direction === 'BUYER_TO_FARMER';
    if (offer.status !== 'SENT') {
      return res.status(409).json({ success: false, error: `Only SENT offers can be accepted (current: ${offer.status})` });
    }
    const buyerId = req.body && req.body.buyerId ? req.body.buyerId : offer.buyerId;
    // A buyer-initiated offer's buyer is an authenticated demo account, not an
    // entry in the static buyer directory, so the directory check only applies
    // to the original farmer→directory-buyer flow.
    if (!buyerInitiated && !buyerFromDirectory(buyerId)) {
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
    // The audit trail must say who actually accepted: for a purchase offer the
    // PRODUCER agrees to sell, so a hardcoded "Accepted by buyer" would write a
    // misleading record into a trail a judge may read out loud.
    transition('payment', payment, 'HELD', {
      by: req.user.uid,
      note: buyerInitiated
        ? 'Producer accepted the purchase offer — funds held (simulated escrow)'
        : 'Buyer accepted the offer — funds held (simulated escrow)',
    });
    await payment.save();

    transition('offer', offer, 'ACCEPTED', {
      by: req.user.uid,
      note: buyerInitiated ? 'Accepted by producer — lot sold' : 'Accepted by buyer',
    });
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
    logger.error('Accept offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to accept offer' });
  }
});

// POST /api/offers/:id/reject — buyer declines
router.post('/:id/reject', async (req, res) => {
  try {
    // Mirror of accept: a buyer-side login declines a farmer's offer (as
    // before); the producer who listed the lot declines a buyer's offer.
    const buyerSide = isBuyerSideRole(req.user.role);
    let offer = null;
    if (buyerSide) {
      offer = await Offer.findById(req.params.id).catch(() => null);
      // Same reasoning as accept: a buyer declining their own purchase offer
      // would record it as "the producer said no", which is a lie. Cancelling
      // your own offer is POST /withdraw.
      if (offer && offer.direction === 'BUYER_TO_FARMER') {
        return res.status(403).json({ success: false, error: 'Only the producer who listed this lot can reject a purchase offer' });
      }
    } else {
      const found = await Offer.findById(req.params.id).catch(() => null);
      const isBuyerInitiated = !!found && found.direction === 'BUYER_TO_FARMER';
      if (!isBuyerInitiated || found.farmerUid !== req.user.uid) {
        return res.status(403).json({ success: false, error: 'Only a buyer-side demo login can reject an offer' });
      }
      offer = found;
    }
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    const producerDeclining = !buyerSide && offer.direction === 'BUYER_TO_FARMER';
    transition('offer', offer, 'REJECTED', {
      by: req.user.uid,
      note: (req.body && req.body.reason) || (producerDeclining ? 'Declined by producer' : 'Declined by buyer'),
    });
    await offer.save();
    // Declining a purchase offer must free the lot again — otherwise a single
    // "no" would leave it stuck at OFFERED and invisible to every other buyer.
    if (producerDeclining) {
      await Lot.updateOne({ _id: offer.lotId, status: 'OFFERED' }, { status: 'OPEN' });
    }
    res.json({ success: true, offer });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Reject offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to reject offer' });
  }
});

// POST /api/offers/:id/withdraw — either side pulls a SENT offer back: the
// farmer for an offer they sent, the buyer for a purchase offer they made.
router.post('/:id/withdraw', async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.id,
      $or: [
        { farmerUid: req.user.uid },
        { buyerUid: req.user.uid, direction: 'BUYER_TO_FARMER' },
      ],
    });
    if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
    const byBuyer = offer.direction === 'BUYER_TO_FARMER' && offer.buyerUid === req.user.uid;
    transition('offer', offer, 'WITHDRAWN', { by: req.user.uid, note: byBuyer ? 'Withdrawn by buyer' : 'Withdrawn by farmer' });
    await offer.save();
    // Cancelling a purchase offer frees the lot again.
    if (byBuyer) {
      await Lot.updateOne({ _id: offer.lotId, status: 'OFFERED' }, { status: 'OPEN' });
    }
    res.json({ success: true, offer });
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') return res.status(422).json({ success: false, error: error.message });
    logger.error('Withdraw offer error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to withdraw offer' });
  }
});

module.exports = router;

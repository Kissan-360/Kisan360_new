const express = require('express');
const { ROLES, DEMO_PROFILES, normalizeRole, signDemoToken } = require('../services/demoAuth');
const { authenticateUser } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/demo-login — simulated login for the demo.
// No real credentials: picks a demo identity (farmer/buyer/fpo), returns a
// signed demo JWT. Production would exchange a Firebase ID token instead.
router.post('/demo-login', (req, res) => {
  const { role, name, district } = req.body || {};
  const cleanRole = normalizeRole(role);
  const profile = DEMO_PROFILES[cleanRole];

  try {
    // uid is ALWAYS derived server-side from the role. Accepting a
    // client-provided uid would let anyone mint a token as any identity —
    // lots/offers/payments are keyed by uid, so that is a full takeover.
    const uid = `demo-${cleanRole}`;
    const token = signDemoToken({ uid, role: cleanRole, name, district });
    return res.json({
      success: true,
      token,
      demo: true,
      user: {
        uid,
        role: cleanRole,
        name: name || profile.name,
        district: district || profile.district,
        demo: true,
      },
      note: 'Demo login — simulated for the SIH demo. No real account or credentials; production uses Firebase ID-token verification.',
    });
  } catch (error) {
    console.error('demo-login error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me — current authenticated user
router.get('/me', authenticateUser, (req, res) => {
  res.json({ success: true, user: req.user });
});

// GET /api/auth/roles — discover demo roles (used by the login UI)
router.get('/roles', (req, res) => {
  res.json({
    success: true,
    roles: ROLES.filter(r => r !== 'admin'),
    profiles: Object.fromEntries(ROLES.filter(r => r !== 'admin').map(r => [r, DEMO_PROFILES[r]])),
    note: 'Demo identities — simulated for the SIH demo.',
  });
});

// POST /api/auth/demo/seed — one-click, deterministic demo-state reset
// (war-room Phase 25): seeds the canonical mid-journey state (a farmer lot +
// a SENT offer the buyer can accept live) without manual database edits.
// Mirrors scripts/seed-demo.js; requires auth so it is not an open write.
router.post('/demo/seed', authenticateUser, async (req, res) => {
  try {
    // The Lot route imports its model directly; do the same here.
    const Lot = require('../models/Lot');
    const Offer = require('../models/Offer');

    // Lots and offers are keyed by farmerUid (a demo JWT string). The seed is
    // ALWAYS owned by the authenticated session — never an arbitrary uid from
    // the body (a mismatch here silently hides records from the farmer).
    const farmerUid = req.user.uid;
    const buyer = { id: 'b7', name: 'Dehydrated Onion Exports (Nasik)' }; // matches the canonical scenario: buys Onion, serves Nashik, min 10 q

    // Idempotent: find-or-create so repeated 'Run canonical scenario' clicks
    // do not stack duplicate lots/offers. If a SENT offer already exists on an
    // OPEN lot for this farmer, reuse both.
    let lot = await Lot.findOne({ farmerUid, crop: 'Onion', district: 'Nashik', status: { $in: ['OPEN', 'OFFERED'] } });
    let isNewLot = false;
    if (!lot) {
      lot = await Lot.create({
        farmerUid,
        crop: 'Onion', variety: 'Local', quantity: 10, unit: 'quintals',
        district: 'Nashik', grade: 'Unassessed', status: 'OPEN',
      });
      isNewLot = true;
    }

    let offer = await Offer.findOne({ lotId: lot._id, buyerId: buyer.id, status: 'SENT' });
    let isNewOffer = false;
    if (!offer) {
      offer = await Offer.create({
        lotId: lot._id,
        farmerUid,
        buyerId: buyer.id,
        buyerName: buyer.name,
        crop: lot.crop,
        quantityQuintals: 10,
        offeredPricePerQuintal: 4632,
        amount: 46320,
        status: 'SENT',
        history: [{ status: 'SENT', at: new Date().toISOString(), by: 'demo-seed', note: 'Offer sent to buyer (demo seed)' }],
      });
      isNewOffer = true;
    }

    const reused = !isNewLot && !isNewOffer;
    return res.json({
      success: true,
      note: reused
        ? 'Canonical scenario already seeded for this session — reusing existing lot and offer.'
        : 'Demo state seeded: 1 canonical Onion lot (10 q, Nashik) + 1 SENT offer to Dehydrated Onion Exports (b7).',
      lotId: lot._id,
      offerId: offer._id,
      reused,
    });
  } catch (error) {
    console.error('demo/seed error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

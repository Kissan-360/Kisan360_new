const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const requireDb = require('../middleware/requireDb');
const Lot = require('../models/Lot');

const { CROPS } = require('../data/cropCatalog');

const router = express.Router();
router.use(authenticateUser, requireDb);

// Buy-side helpers. Lots store `crop` as free text, so a category filter has to
// expand to every spelling the catalog knows (display name, id, and aliases) or
// a lot created from an AGMARKNET spelling would silently vanish from results.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function cropCandidatesForCategory(categoryId) {
  const out = new Set();
  for (const c of CROPS) {
    if (c.category !== categoryId) continue;
    out.add(c.name);
    out.add(c.id);
    for (const a of c.aliases || []) out.add(a);
  }
  return [...out].filter(Boolean);
}

// Request-safety helpers: bounded strings and sane numerics. The Lot schema
// validates enums/ranges at save-time, but raw infinite/NaN/huge values and
// megabyte-sized strings should be rejected at the door with an honest 400
// instead of a 500 from the model layer.
const MAX_STR = 300;
const MAX_NOTES = 2000;
const MAX_PHOTOS = 10;
const capStr = (v, n = MAX_STR) => (typeof v === 'string' ? v.slice(0, n) : v);
function boundedNumber(v, { min, max }) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null; // null = invalid
  return n;
}
function validateLotInput(body, { partial = false } = {}) {
  const errors = [];
  const clean = {};
  if (!partial || 'crop' in body) clean.crop = capStr(body.crop);
  if ('quantity' in body || !partial) {
    const q = boundedNumber(body.quantity, { min: 0.01, max: 100000 });
    if (q === null) errors.push('quantity must be a number between 0.01 and 100000');
    else clean.quantity = q;
  }
  if ('moisturePct' in body) {
    const m = boundedNumber(body.moisturePct, { min: 0, max: 100 });
    if (m === null) errors.push('moisturePct must be between 0 and 100');
    else clean.moisturePct = m;
  }
  if ('damagePct' in body) {
    const d = boundedNumber(body.damagePct, { min: 0, max: 100 });
    if (d === null) errors.push('damagePct must be between 0 and 100');
    else clean.damagePct = d;
  }
  if ('expectedPricePerQuintal' in body) {
    const p = boundedNumber(body.expectedPricePerQuintal, { min: 0, max: 10000000 });
    if (p === null) errors.push('expectedPricePerQuintal must be between 0 and 10000000');
    else clean.expectedPricePerQuintal = p;
  }
  if ('unit' in body && body.unit && !['quintals', 'kg', 'tonnes'].includes(body.unit)) {
    errors.push('unit must be quintals, kg or tonnes');
  }
  if ('grade' in body && body.grade && !['A', 'B', 'C', 'Unassessed'].includes(body.grade)) {
    errors.push('grade must be A, B, C or Unassessed');
  }
  if ('photos' in body) {
    if (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS || body.photos.some(p => typeof p !== 'string' || p.length > 500000)) {
      errors.push(`photos must be an array of at most ${MAX_PHOTOS} strings`);
    } else clean.photos = body.photos;
  }
  for (const k of ['variety', 'size', 'harvestDate', 'district', 'notes']) {
    if (k in body) clean[k] = capStr(body[k], k === 'notes' ? MAX_NOTES : MAX_STR);
  }
  return { errors, clean };
}

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

// GET /api/lots/available — the BUY side of the market: OPEN lots listed by
// OTHER producers, so a buyer-side login has something it can actually buy.
// Read-only and additive; the seller flow is untouched.
//
// The producer's uid is never returned — buyers get the name snapshot (or a
// district label for rows created before that field existed) alongside the
// lot's own quality fields, which is what they need to decide.
router.get('/available', async (req, res) => {
  try {
    const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const crop = str(req.query.crop, 120);
    const category = str(req.query.category, 40);
    const district = str(req.query.district, 60);
    const grade = str(req.query.grade, 20);
    const minQty = boundedNumber(req.query.minQty, { min: 0, max: 100000 });
    if (minQty === null) {
      return res.status(400).json({ success: false, error: 'minQty must be a number between 0 and 100000' });
    }

    const filter = { status: 'OPEN', farmerUid: { $ne: req.user.uid } };
    if (district) filter.district = new RegExp(`^${escapeRegex(district)}$`, 'i');
    if (grade) filter.grade = grade;

    // An explicit crop is more specific than a category, so it wins.
    if (crop) {
      filter.crop = new RegExp(`^${escapeRegex(crop)}$`, 'i');
    } else if (category) {
      const candidates = cropCandidatesForCategory(category);
      if (candidates.length === 0) {
        return res.status(400).json({ success: false, error: `Unknown crop category "${category}"` });
      }
      filter.crop = { $in: candidates.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) };
    }

    // Quantities are stored in the lot's own unit, so a quintal minimum has to
    // be converted per-unit rather than compared raw.
    if (minQty !== undefined && minQty > 0) {
      filter.$or = [
        { unit: 'quintals', quantity: { $gte: minQty } },
        { unit: 'kg', quantity: { $gte: minQty * 100 } },
        { unit: 'tonnes', quantity: { $gte: minQty / 10 } },
      ];
    }

    const lots = await Lot.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const listed = lots.map(({ farmerUid, ...rest }) => ({
      ...rest,
      producer: rest.farmerName || (rest.district ? `Producer · ${rest.district}` : 'Producer'),
    }));

    res.json({
      success: true,
      count: listed.length,
      lots: listed,
      view: 'market',
      note: 'Open lots listed by other producers. Producer identity verification is not implemented in this demo.',
    });
  } catch (error) {
    console.error('List available lots error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list available lots' });
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
    const body = req.body || {};
    const { errors, clean } = validateLotInput(body);
    if (!clean.crop || !clean.crop.trim()) errors.push('crop is required');
    if (clean.quantity === undefined) errors.push('a positive quantity is required');
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const lot = await Lot.create({
      farmerUid: req.user.uid,
      farmerName: typeof req.user.name === 'string' ? req.user.name.slice(0, 80) : '',
      crop: clean.crop,
      variety: clean.variety || '',
      quantity: clean.quantity,
      unit: body.unit || 'quintals',
      grade: body.grade || 'Unassessed',
      size: clean.size || '',
      moisturePct: clean.moisturePct ?? null,
      damagePct: clean.damagePct ?? null,
      assayStatus: body.assayStatus || 'pending',
      harvestDate: clean.harvestDate || '',
      district: clean.district || req.user.district || '',
      photos: clean.photos || [],
      notes: clean.notes || '',
      expectedPricePerQuintal: clean.expectedPricePerQuintal ?? null,
      status: 'OPEN',
    });

    res.status(201).json({ success: true, lot });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: Object.values(error.errors).map(e => e.message).join('; ') });
    }
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
    const { errors, clean } = validateLotInput(req.body || {}, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }
    for (const key of editable) {
      if (key in clean) lot[key] = clean[key];
      else if (key in req.body && !['quantity', 'moisturePct', 'damagePct', 'expectedPricePerQuintal', 'photos'].includes(key)) lot[key] = req.body[key];
    }
    await lot.save();
    res.json({ success: true, lot });
  } catch (error) {
    if (error.name === 'CastError') return res.status(404).json({ success: false, error: 'Lot not found' });
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: Object.values(error.errors).map(e => e.message).join('; ') });
    }
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

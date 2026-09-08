const mongoose = require('mongoose');

const lotSchema = new mongoose.Schema({
  farmerUid: { type: String, required: true, index: true },
  crop: { type: String, required: true, trim: true },
  variety: { type: String, default: '', trim: true },
  // Structured quality fields only — no vision model (see scope discipline).
  grade: { type: String, enum: ['A', 'B', 'C', 'Unassessed'], default: 'Unassessed' },
  size: { type: String, default: '', trim: true },
  moisturePct: { type: Number, default: null, min: 0, max: 100 },
  damagePct: { type: Number, default: null, min: 0, max: 100 },
  assayStatus: { type: String, enum: ['pending', 'in_progress', 'passed', 'failed'], default: 'pending' },
  quantity: { type: Number, required: true, min: 0.01 }, // in `unit`
  unit: { type: String, enum: ['quintals', 'kg', 'tonnes'], default: 'quintals' },
  harvestDate: { type: String, default: '', trim: true }, // ISO date, plain string for the demo
  district: { type: String, default: '', trim: true }, // farmer's district (for buyer matching)
  photos: [{ type: String }],
  notes: { type: String, default: '' },
  expectedPricePerQuintal: { type: Number, default: null },
  status: {
    type: String,
    enum: ['OPEN', 'OFFERED', 'CLOSED', 'WITHDRAWN'],
    default: 'OPEN',
  },
}, { timestamps: true });

module.exports = mongoose.model('Lot', lotSchema);

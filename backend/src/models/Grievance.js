const mongoose = require('mongoose');

// Grievance (HLD P1): Raise → Open → Under Review → Resolved, enforced by the
// shared state machine (services/stateMachine.js → 'grievance').
const historyEntry = {
  from: { type: String, default: null },
  to: { type: String, required: true },
  status: { type: String, required: true },
  at: { type: String, required: true },
  by: { type: String, default: 'system' },
  note: { type: String, default: '' },
};

const grievanceSchema = new mongoose.Schema({
  raisedByUid: { type: String, required: true, index: true },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', default: null },
  category: {
    type: String,
    enum: ['PAYMENT_DELAY', 'QUALITY_DISPUTE', 'WEIGHT_DISPUTE', 'BUYER_NO_SHOW', 'OTHER'],
    required: true,
  },
  description: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
    default: 'OPEN',
  },
  history: { type: [historyEntry], default: [] },
  resolutionNote: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Grievance', grievanceSchema);

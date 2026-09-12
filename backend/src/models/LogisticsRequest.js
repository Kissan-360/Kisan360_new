const mongoose = require('mongoose');

const logisticsRequestSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true, index: true },
  farmerUid: { type: String, required: true, index: true },
  crop: { type: String, required: true, trim: true },
  origin: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0.01 },
  unit: { type: String, enum: ['quintals', 'kg', 'tonnes'], default: 'quintals' },
  estimatedDistanceKm: { type: Number, default: null, min: 0 },
  distanceMethod: { type: String, enum: ['documented_road', 'geodesic_market', 'geodesic_district', null], default: null },
  requestedDate: { type: String, default: '' },
  requestedWindow: { type: String, default: '' },
  transportType: { type: String, enum: ['LCV', 'Truck', 'Full-Truck', 'Pickup', 'any'], default: 'any' },
  // Quote details
  providerId: { type: String, default: null },
  providerName: { type: String, default: '' },
  providerTrustTier: { type: String, default: '' },
  quotedCost: { type: Number, default: null },
  quotedCostPerQuintal: { type: Number, default: null },
  // System estimate for cost consistency comparison
  systemEstimatedCost: { type: Number, default: null },
  systemEstimatedCostPerQuintal: { type: Number, default: null },
  costDifference: { type: Number, default: null },
  costDifferenceNote: { type: String, default: '' },
  // Coordination
  status: {
    type: String,
    enum: ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    default: 'REQUESTED',
  },
  scheduledDate: { type: String, default: '' },
  scheduledWindow: { type: String, default: '' },
  notes: { type: String, default: '' },
  history: [{
    from: String,
    to: String,
    status: String,
    at: String,
    by: String,
    note: String,
  }],
  // Demo labeling
  classification: { type: String, default: 'DEMO_LOGISTICS' },
  demo: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('LogisticsRequest', logisticsRequestSchema);

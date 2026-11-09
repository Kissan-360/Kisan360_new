const mongoose = require('mongoose');

const historyEntry = {
  from: { type: String, default: null },
  to: { type: String, required: true },
  status: { type: String, required: true },
  at: { type: String, required: true },
  by: { type: String, default: 'system' },
  note: { type: String, default: '' },
};

const paymentSchema = new mongoose.Schema({
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true, unique: true },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  farmerUid: { type: String, required: true, index: true },
  buyerId: { type: String, required: true, index: true },
  buyerName: { type: String, default: '' },
  crop: { type: String, required: true },
  quantityQuintals: { type: Number, required: true, min: 0.01 },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  status: {
    type: String,
    enum: ['PENDING', 'HELD', 'RELEASED', 'CANCELLED'],
    default: 'PENDING',
  },
  history: { type: [historyEntry], default: [] },
  // Explicit honesty flag — demo escrow is simulated; Razorpay test mode is also not real money.
  mocked: { type: Boolean, default: true },
  gateway: { type: String, default: 'simulated', enum: ['simulated', 'razorpay_test'] },
  razorpayOrderId: { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null },
  razorpaySignature: { type: String, default: null },
  note: {
    type: String,
    default: 'Simulated payment status for the SIH demo — no real money movement. Production would integrate a payment gateway/escrow.',
  },
}, { timestamps: true });

paymentSchema.index(
  { farmerUid: 1, status: 1, createdAt: -1 },
  { name: 'payments_farmer_status_created' },
);
paymentSchema.index({ farmerUid: 1, updatedAt: -1 }, { name: 'payments_farmer_updated' });
paymentSchema.index({ lotId: 1 }, { name: 'payments_lot' });

module.exports = mongoose.model('Payment', paymentSchema);

const mongoose = require('mongoose');

const historyEntry = {
  status: { type: String, required: true },
  at: { type: String, required: true },
  by: { type: String, default: 'system' },
  note: { type: String, default: '' },
};

const offerSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true, index: true },
  farmerUid: { type: String, required: true, index: true },
  buyerId: { type: String, required: true, index: true }, // buyer directory id (static for demo)
  buyerName: { type: String, default: '' }, // snapshot at offer time
  crop: { type: String, required: true },
  quantityQuintals: { type: Number, required: true, min: 0.01 },
  offeredPricePerQuintal: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 }, // offeredPrice * quantity
  status: {
    type: String,
    enum: ['SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
    default: 'SENT',
  },
  history: { type: [historyEntry], default: [] },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Offer', offerSchema);

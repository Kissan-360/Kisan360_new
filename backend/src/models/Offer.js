const mongoose = require('mongoose');

const historyEntry = {
  status: { type: String, required: true },
  at: { type: String, required: true },
  by: { type: String, default: 'system' },
  note: { type: String, default: '' },
};

const offerSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true, index: true },
  // Always the lot owner — whether the farmer offered out or a buyer offered in.
  farmerUid: { type: String, required: true, index: true },
  // Which way the offer travelled. Defaults to the original farmer→buyer flow,
  // so rows written before this field existed keep their meaning.
  direction: {
    type: String,
    enum: ['FARMER_TO_BUYER', 'BUYER_TO_FARMER'],
    default: 'FARMER_TO_BUYER',
  },
  // Set only for BUYER_TO_FARMER offers: the authenticated buyer who offered.
  buyerUid: { type: String, default: '', index: true },
  buyerId: { type: String, required: true, index: true }, // buyer directory id (static for demo) or the buyer's uid
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

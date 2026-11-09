const mongoose = require('mongoose');

const priceAlertSchema = new mongoose.Schema({
  userUid: { type: String, required: true, index: true },
  crop: { type: String, required: true, trim: true },
  market: { type: String, required: true, trim: true },
  direction: { type: String, enum: ['above', 'below'], required: true },
  targetPrice: { type: Number, required: true, min: 1, max: 10000000 },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

priceAlertSchema.index(
  { userUid: 1, active: 1, crop: 1, market: 1, createdAt: -1 },
  { name: 'price_alerts_user_active_crop_market' },
);

module.exports = mongoose.model('PriceAlert', priceAlertSchema);

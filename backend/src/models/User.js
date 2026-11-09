const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  displayName: { type: String, default: '' },
  location: { type: String, default: '' },
  phone: { type: String, default: null }, // E.164 (919...), opt-in for WhatsApp alerts
  preferredCrops: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

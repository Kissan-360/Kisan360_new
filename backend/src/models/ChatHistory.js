const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
  userUid: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true, maxlength: 5000 },
  intent: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
}, { strict: true });

chatHistorySchema.index({ userUid: 1, createdAt: -1 });
chatHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600, name: 'chat_ttl_90d' });

module.exports = mongoose.models.ChatHistory || mongoose.model('ChatHistory', chatHistorySchema);

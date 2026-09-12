const mongoose = require('mongoose');

const VOTER_SCHEMA = new mongoose.Schema(
  { userId: { type: String, required: true, index: true }, value: { type: Number, enum: [1, -1], required: true } },
  { _id: false },
);

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 160 },
    content: { type: String, required: true, minlength: 10, maxlength: 4000 },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, required: true, trim: true, default: 'Anonymous Farmer' },
    authorDistrict: { type: String, default: '', trim: true },
    authorTrustLevel: { type: Number, default: 0, min: 0, max: 1000, index: true },
    category: {
      type: String,
      required: true,
      index: true,
      enum: [
        'crop_advice',
        'market_prices',
        'government_schemes',
        'government_notices',
        'equipment',
        'success_stories',
        'general_farming',
        'discussion',
        'trade',
        'exchange',
      ],
    },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    photoDataUrl: { type: String, default: '' },
    votes: { type: [VOTER_SCHEMA], default: [] },
    voteCount: { type: Number, default: 0, index: true },
    commentCount: { type: Number, default: 0, index: true },
    viewCount: { type: Number, default: 0 },
    hotScore: { type: Number, default: 0, index: true },
    pinned: { type: Boolean, default: false, index: true },
    locked: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0, index: true },
    hidden: { type: Boolean, default: false, index: true },
    hiddenReason: { type: String, default: '' },
    approved: { type: Boolean, default: true, index: true },
    minTrustToReply: { type: Number, default: 0 },
  },
  { timestamps: true },
);

topicSchema.index({ category: 1, createdAt: -1 });
topicSchema.index({ category: 1, hotScore: -1 });
topicSchema.index({ category: 1, voteCount: -1 });

module.exports = mongoose.model('CommunityTopic', topicSchema);

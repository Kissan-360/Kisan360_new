const mongoose = require('mongoose');

const VOTER_SCHEMA = new mongoose.Schema(
  { userId: { type: String, required: true }, value: { type: Number, enum: [1, -1], required: true } },
  { _id: false },
);

const commentSchema = new mongoose.Schema(
  {
    topicId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CommunityTopic', index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityComment', default: null, index: true },
    rootId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityComment', default: null, index: true },
    depth: { type: Number, default: 0, min: 0, max: 4, index: true },
    path: [{ type: mongoose.Schema.Types.ObjectId }],
    content: { type: String, required: true, minlength: 2, maxlength: 2000 },
    photoDataUrl: { type: String, default: '' },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, required: true, default: 'Anonymous Farmer' },
    authorDistrict: { type: String, default: '' },
    authorTrustLevel: { type: Number, default: 0, min: 0 },
    votes: { type: [VOTER_SCHEMA], default: [] },
    voteCount: { type: Number, default: 0, index: true },
    reportCount: { type: Number, default: 0, index: true },
    hidden: { type: Boolean, default: false, index: true },
    hiddenReason: { type: String, default: '' },
    approved: { type: Boolean, default: true, index: true },
    replyCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

commentSchema.index({ topicId: 1, createdAt: 1 });
commentSchema.index({ parentId: 1, createdAt: 1 });

module.exports = mongoose.model('CommunityComment', commentSchema);

const mongoose = require('mongoose');

const schemeSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  shortName: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['central', 'state'],
    required: true,
    index: true,
  },
  state: { type: String, default: 'India' },
  benefitBucket: {
    type: String,
    enum: ['income', 'insurance', 'credit', 'input', 'market', 'soil', 'advisory'],
    default: 'income',
    index: true,
  },
  description: { type: String, default: '' },
  benefitAmount: { type: Number, default: null },
  benefitPct: { type: Number, default: null },
  benefitType: {
    type: String,
    enum: ['amount_per_year', 'subsidy_pct', 'interest_rate', 'msp_guarantee', 'free_service', 'insurance_cover'],
    default: 'amount_per_year',
  },
  benefitLabel: { type: String, default: '' },
  eligibility: [{ type: String }],
  eligibilityRules: {
    minLandAcres: { type: Number, default: null },
    maxLandAcres: { type: Number, default: null },
    farmerCategories: [{ type: String, enum: ['General', 'OBC', 'SC', 'ST', 'All'] }],
    states: [{ type: String }],
    cropFilter: [{ type: String }],
  },
  documents: [{ type: String }],
  applySteps: [{ type: String }],
  officialUrl: { type: String, default: '' },
  deadline: { type: String, default: '' },
  deadlineOpen: { type: Boolean, default: true },
  tags: [{ type: String }],
  priority: { type: Number, default: 50 },
}, { timestamps: true });

module.exports = mongoose.model('Scheme', schemeSchema);

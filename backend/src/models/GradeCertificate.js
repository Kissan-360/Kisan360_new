const mongoose = require('mongoose');

/**
 * GradeCertificate — immutable record of a crop grading assessment.
 *
 * Lifecycle: AI_GRADED → SUBMITTED_TO_FPO → FPO_VERIFIED | FPO_REJECTED
 *
 * Every certificate carries provenance: who graded, when, what parameters,
 * what photo hash. The photo itself is NOT stored (privacy + storage cost).
 */
const gradeCertificateSchema = new mongoose.Schema({
  farmerUid: { type: String, required: true, index: true },
  crop: { type: String, required: true, trim: true, lowercase: true },

  // AI grading result
  grade: { type: String, enum: ['I', 'II', 'III'], required: true },
  gradeLabel: { type: String, required: true },
  parameters: [{
    param: String,
    label: String,
    unit: String,
    value: Number,
    threshold: Number,
    direction: String,
    status: { type: String, enum: ['pass', 'fail', 'unknown'] },
    detail: String,
  }],
  confidence: { type: Number, min: 0, max: 100 },
  priceRange: { min: Number, max: Number },

  // Photo evidence (hash only — photo stored client-side or discarded)
  photoHash: { type: String, default: null },
  photoMimeType: { type: String, default: null },

  // Questionnaire answers (what the farmer declared)
  questionnaire: {
    dryingMethod: { type: String, default: '' },
    storageCondition: { type: String, default: '' },
    visibleMold: { type: Boolean, default: false },
    odor: { type: String, default: '' },
    lastSprayDate: { type: String, default: '' },
  },

  // FPO certification status
  fpoStatus: {
    type: String,
    enum: ['AI_GRADED', 'SUBMITTED_TO_FPO', 'FPO_VERIFIED', 'FPO_REJECTED'],
    default: 'AI_GRADED',
  },
  fpoName: { type: String, default: null },
  fpoVerifiedBy: { type: String, default: null },
  fpoVerifiedAt: { type: Date, default: null },
  fpoNotes: { type: String, default: '' },

  // AGMARK reference
  agmarkRef: {
    act: { type: String, default: 'Agricultural Produce (Grading and Marking) Act, 1937' },
    authority: { type: String, default: 'Directorate of Marketing and Inspection (DMI)' },
    website: { type: String, default: 'https://dmi.gov.in' },
  },

  // Link to lot (if certificate is used for lot creation)
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', default: null },

  // Demo flags
  isDemo: { type: Boolean, default: true },
}, { timestamps: true });

// Index for farmer's certificates
gradeCertificateSchema.index({ farmerUid: 1, crop: 1, createdAt: -1 });

module.exports = mongoose.model('GradeCertificate', gradeCertificateSchema);

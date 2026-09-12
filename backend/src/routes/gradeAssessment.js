const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { calculateGrade, getSupportedCrops, getGradeReference } = require('../lib/gradeRules');

// In-memory fallback when MongoDB is offline (mirrors pattern from lots.js)
let GradeCertificate = null;
try { GradeCertificate = require('../models/GradeCertificate'); } catch { /* model missing — memory mode */ }
let memoryCerts = [];
let memoryIdSeq = 1;

/**
 * POST /api/grade-assessment
 *
 * Run AGMARK grade calculation for a crop.
 *
 * Body:
 *   crop: string (required) — 'soybean', 'wheat', 'paddy', 'cotton', 'onion', 'tomato', 'grape'
 *   params: object — measured parameters (e.g. { moisture: 9, damage: 1.5 })
 *   photoBase64: string (optional) — base64-encoded photo for hash provenance
 *   questionnaire: object (optional) — farmer-declared info
 *
 * Response:
 *   success: true
 *   assessment: { grade, label, parameters, confidence, priceRange, agmarkRef }
 *   certificate: { id, crop, grade, fpoStatus, createdAt }
 */
router.post('/', (req, res) => {
  try {
    const { crop, params = {}, photoBase64, questionnaire = {} } = req.body;

    if (!crop || typeof crop !== 'string') {
      return res.status(400).json({ success: false, error: 'crop is required (string)' });
    }

    // Run grade calculation
    const assessment = calculateGrade(crop, params);

    if (assessment.error) {
      return res.status(400).json({ success: false, error: assessment.error, supportedCrops: assessment.supportedCrops });
    }

    // Compute photo hash if provided (provenance, not storage)
    const photoHash = photoBase64
      ? crypto.createHash('sha256').update(photoBase64).digest('hex').slice(0, 16)
      : null;

    // Create certificate record
    const certData = {
      farmerUid: req.headers['x-demo-uid'] || 'demo-farmer',
      crop: crop.toLowerCase(),
      grade: assessment.grade,
      gradeLabel: assessment.label,
      parameters: assessment.parameters,
      confidence: assessment.confidence,
      priceRange: assessment.priceRange,
      photoHash,
      photoMimeType: photoBase64 ? 'image/jpeg' : null,
      questionnaire: {
        dryingMethod: questionnaire.dryingMethod || '',
        storageCondition: questionnaire.storageCondition || '',
        visibleMold: questionnaire.visibleMold || false,
        odor: questionnaire.odor || '',
        lastSprayDate: questionnaire.lastSprayDate || '',
      },
      agmarkRef: assessment.agmarkRef,
      fpoStatus: 'AI_GRADED',
      isDemo: true,
    };

    // Persist certificate
    let savedCert;
    if (GradeCertificate && GradeCertificate.db && GradeCertificate.db.readyState === 1) {
      // MongoDB connected — save synchronously (demo speed)
      savedCert = new GradeCertificate(certData);
      savedCert.save().catch(() => {}); // fire-and-forget for demo
    } else {
      // Memory fallback
      savedCert = { _id: String(memoryIdSeq++), ...certData, createdAt: new Date().toISOString() };
      memoryCerts.push(savedCert);
    }

    res.json({
      success: true,
      assessment,
      certificate: {
        id: savedCert._id,
        crop: certData.crop,
        grade: certData.grade,
        gradeLabel: certData.gradeLabel,
        fpoStatus: certData.fpoStatus,
        confidence: certData.confidence,
        priceRange: certData.priceRange,
        createdAt: savedCert.createdAt || new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[grade-assessment] Error:', err.message);
    res.status(500).json({ success: false, error: 'Grade assessment failed' });
  }
});

/**
 * GET /api/grade-assessment/crops
 *
 * List all supported crops and their AGMARK grade ranges.
 */
router.get('/crops', (_req, res) => {
  res.json({ success: true, crops: getSupportedCrops() });
});

/**
 * GET /api/grade-assessment/reference/:crop
 *
 * Get detailed AGMARK grade reference for a crop (all grades, thresholds, parameters).
 */
router.get('/reference/:crop', (req, res) => {
  const ref = getGradeReference(req.params.crop);
  if (!ref) {
    return res.status(404).json({ success: false, error: `No grade reference for "${req.params.crop}"` });
  }
  res.json({ success: true, reference: ref });
});

/**
 * POST /api/grade-assessment/:id/fpo-verify
 *
 * Simulate FPO verification of a grade certificate.
 *
 * Body:
 *   status: 'FPO_VERIFIED' | 'FPO_REJECTED'
 *   fpoName: string
 *   notes: string (optional)
 */
router.post('/:id/fpo-verify', (req, res) => {
  try {
    const { status, fpoName, notes = '' } = req.body;

    if (!['FPO_VERIFIED', 'FPO_REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be FPO_VERIFIED or FPO_REJECTED' });
    }

    if (GradeCertificate && GradeCertificate.db && GradeCertificate.db.readyState === 1) {
      // Would update MongoDB — for demo, return mock
    }

    // Memory fallback or demo response
    const cert = memoryCerts.find(c => c._id === req.params.id);
    if (cert) {
      cert.fpoStatus = status;
      cert.fpoName = fpoName || 'Demo FPO';
      cert.fpoVerifiedBy = 'FPO Manager';
      cert.fpoVerifiedAt = new Date().toISOString();
      cert.fpoNotes = notes;
    }

    res.json({
      success: true,
      certificate: {
        id: req.params.id,
        fpoStatus: status,
        fpoName: fpoName || 'Demo FPO',
        fpoVerifiedAt: new Date().toISOString(),
        notes,
      },
    });
  } catch (err) {
    console.error('[grade-assessment:fpo-verify] Error:', err.message);
    res.status(500).json({ success: false, error: 'FPO verification failed' });
  }
});

/**
 * GET /api/grade-assessment/:id
 *
 * Retrieve a grade certificate by ID.
 */
router.get('/:id', (req, res) => {
  const cert = memoryCerts.find(c => c._id === req.params.id);
  if (!cert) {
    return res.status(404).json({ success: false, error: 'Certificate not found' });
  }
  res.json({ success: true, certificate: cert });
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { canVerifyCertificate } = require('../lib/roleScope');
const { calculateGrade, getSupportedCrops, getGradeReference } = require('../lib/gradeRules');

// Certificates carry an identity and can be marked FPO-verified, so every
// route that reads or writes one requires a verified token: previously an
// anonymous caller could mint a certificate with `x-demo-uid` of their choosing
// and then self-verify it via POST /:id/fpo-verify.
//
// Who may act on a certificate (the certificate's own holder, or an FPO/admin)
// is defined once in lib/roleScope.js — canVerifyCertificate. This is NOT a
// blanket role gate: GradeCrop.tsx calls fpo-verify from the farmer's own
// screen as an explicitly-labelled simulation, so locking it to role alone
// would 403 the documented demo flow while achieving nothing beyond the
// ownership half of the shared check.

// In-memory fallback when MongoDB is offline (mirrors pattern from lots.js)
let GradeCertificate = null;
try { GradeCertificate = require('../models/GradeCertificate'); } catch { /* model missing — memory mode */ }
let memoryCerts = [];
let memoryIdSeq = 1;

// Certificates may live in EITHER store: memory when the DB is unreachable,
// Mongo when it is up. Reads must check both — previously POST wrote to Mongo
// while GET/fpo-verify searched only `memoryCerts`, so with a live DB every
// certificate 404'd and the farmer's own FPO-submit 403'd (integration-tested
// by tests/integration/authGuards.test.js).
async function findCert(id) {
  const mem = memoryCerts.find((c) => c._id === id);
  if (mem) return mem;
  const mongoUp = GradeCertificate && GradeCertificate.db && GradeCertificate.db.readyState === 1;
  if (!mongoUp) return null;
  try {
    return (await GradeCertificate.findById(id)) || null;
  } catch {
    return null; // malformed ObjectId (CastError) or transient DB error → 404
  }
}

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
router.post('/', authenticateUser, async (req, res) => {
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
      farmerUid: String(req.user.uid),
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

    // Persist certificate. The save is AWAITED (not fire-and-forget) so the
    // id returned here is guaranteed readable by GET /:id and fpo-verify on
    // the very next request; if the write fails we fall back to memory so the
    // farmer still gets a working certificate for this process's lifetime.
    let savedCert;
    const mongoUp = GradeCertificate && GradeCertificate.db && GradeCertificate.db.readyState === 1;
    if (mongoUp) {
      try {
        savedCert = await new GradeCertificate(certData).save();
      } catch (err) {
        console.error('[grade-assessment] certificate save failed, using memory:', err.message);
        savedCert = null;
      }
    }
    if (!savedCert) {
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
router.post('/:id/fpo-verify', authenticateUser, async (req, res) => {
  try {
    const { status, fpoName, notes = '' } = req.body;

    if (!['FPO_VERIFIED', 'FPO_REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be FPO_VERIFIED or FPO_REJECTED' });
    }

    // Existence is checked BEFORE the verifier guard: a missing certificate
    // must 404 for everyone. Previously an undefined cert fell through
    // requireFpoVerifier's privileged branch, so an FPO could "verify" an id
    // that never existed and get a fabricated success.
    const cert = await findCert(String(req.params.id));
    if (!cert) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }
    if (!canVerifyCertificate(req.user, cert)) {
      return res.status(403).json({
        success: false,
        error: 'Only the certificate holder or an FPO can verify a grade certificate.',
      });
    }

    cert.fpoStatus = status;
    cert.fpoName = fpoName || 'Demo FPO';
    cert.fpoVerifiedBy = String(req.user.uid);
    cert.fpoVerifiedAt = new Date().toISOString();
    cert.fpoNotes = notes;
    if (typeof cert.save === 'function') {
      // Mongo-backed document — persist the verdict (was a no-op before).
      try { await cert.save(); } catch (err) { console.error('[grade-assessment:fpo-verify] save failed:', err.message); }
    }

    res.json({
      success: true,
      certificate: {
        id: req.params.id,
        fpoStatus: status,
        fpoName: fpoName || 'Demo FPO',
        fpoVerifiedBy: String(req.user.uid),
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
router.get('/:id', authenticateUser, async (req, res) => {
  const cert = await findCert(String(req.params.id));
  if (!cert) {
    return res.status(404).json({ success: false, error: 'Certificate not found' });
  }
  // A certificate is a named farmer's record: read access is not public.
  if (!canVerifyCertificate(req.user, cert)) {
    return res.status(403).json({ success: false, error: 'Certificate belongs to another farmer.' });
  }
  res.json({ success: true, certificate: cert });
});

module.exports = router;

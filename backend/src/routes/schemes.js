const express = require('express');
const fs = require('fs');
const path = require('path');
const Scheme = require('../models/Scheme');

const router = express.Router();
const SEED_PATH = path.join(__dirname, '..', 'data', 'schemes.json');

let inMemorySchemes = null;
let seedInitialized = false;

function readSeedData() {
  try {
    const raw = fs.readFileSync(SEED_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[schemes] Seed file not readable, returning empty. Err:', err.message);
    return [];
  }
}

function matchesFilter(scheme, { category, state, bucket, q }) {
  if (category && scheme.category !== category) return false;
  if (state && state !== 'India' && scheme.state !== state && scheme.state !== 'India') return false;
  if (bucket && scheme.benefitBucket !== bucket) return false;
  if (q) {
    const needle = q.toLowerCase();
    const haystack = [
      scheme.name, scheme.shortName, scheme.description,
      scheme.benefitLabel, scheme.tags ? scheme.tags.join(' ') : '',
    ].join(' ').toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

async function listSchemes() {
  if (inMemorySchemes) return inMemorySchemes;
  try {
    const dbDocs = await Scheme.find().sort({ priority: 1, createdAt: -1 }).lean().exec();
    if (dbDocs && dbDocs.length) {
      inMemorySchemes = dbDocs;
      return dbDocs;
    }
  } catch (err) {
    // DB unavailable or not connected — seed fallback is expected
  }
  inMemorySchemes = readSeedData();
  return inMemorySchemes;
}

async function ensureSeed() {
  if (seedInitialized) return;
  const seed = readSeedData();
  if (!seed || !seed.length) { seedInitialized = true; return; }
  try {
    const existing = await Scheme.countDocuments();
    if (existing === 0) {
      await Scheme.insertMany(seed, { ordered: false });
      console.log(`[schemes] Seeded ${seed.length} schemes into DB`);
    }
  } catch (err) {
    if (err.code !== 11000) {
      console.warn('[schemes] DB seed skipped:', err.message);
    }
  }
  seedInitialized = true;
}

function eligibilityVerdict(scheme, profile) {
  const rules = scheme.eligibilityRules || {};
  const reasons = [];
  let matched = 0;
  let checked = 0;

  const farmerCategory = profile?.farmerCategory || 'General';
  if (rules.farmerCategories && rules.farmerCategories.length) {
    checked++;
    const ok = rules.farmerCategories.includes('All') || rules.farmerCategories.includes(farmerCategory);
    if (ok) matched++; else reasons.push(`Category ${farmerCategory} not explicitly listed (supports: ${rules.farmerCategories.join(', ')})`);
  }

  if (profile?.state && rules.states && rules.states.length) {
    checked++;
    const ok = rules.states.includes(profile.state);
    if (ok) matched++; else reasons.push(`This scheme applies to: ${rules.states.join(', ')}; you are from ${profile.state}`);
  }

  if (typeof profile?.landAcres === 'number' && typeof rules.maxLandAcres === 'number') {
    checked++;
    if (profile.landAcres <= rules.maxLandAcres) matched++; else reasons.push(`Max land limit: ${rules.maxLandAcres} acres`);
  }
  if (typeof profile?.landAcres === 'number' && typeof rules.minLandAcres === 'number') {
    checked++;
    if (profile.landAcres >= rules.minLandAcres) matched++; else reasons.push(`Minimum land: ${rules.minLandAcres} acres`);
  }

  if (profile?.crop && rules.cropFilter && rules.cropFilter.length) {
    checked++;
    const normalizedCrop = profile.crop.toLowerCase();
    const ok = rules.cropFilter.some((c) => c.toLowerCase() === normalizedCrop);
    if (ok) matched++; else reasons.push(`Scheme's crop list does not currently include ${profile.crop}`);
  }

  if (checked === 0) return { level: 'partial', reasons: ['Need more information (land, category, state or crop) to confirm eligibility.'] };
  const ratio = matched / checked;
  if (ratio >= 0.9) return { level: 'eligible', reasons };
  if (ratio >= 0.5) return { level: 'partial', reasons };
  return { level: 'not_eligible', reasons };
}

router.get('/', async (req, res) => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined;
    const state = req.query.state ? String(req.query.state) : undefined;
    const bucket = req.query.bucket ? String(req.query.bucket) : undefined;
    const q = req.query.q ? String(req.query.q) : undefined;
    const limit = Math.min(Number.parseInt(req.query.limit || '50', 10), 100);

    const all = await listSchemes();
    const filtered = all.filter((s) => matchesFilter(s, { category, state, bucket, q })).slice(0, limit);
    res.json({ success: true, count: filtered.length, schemes: filtered });
  } catch (err) {
    console.error('[schemes/list]', err.message);
    res.status(500).json({ success: false, error: 'Failed to load schemes' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const all = await listSchemes();
    const scheme = all.find((s) => s.slug === slug) || null;
    if (!scheme) return res.status(404).json({ success: false, error: 'Scheme not found' });
    res.json({ success: true, scheme });
  } catch (err) {
    console.error('[schemes/detail]', err.message);
    res.status(500).json({ success: false, error: 'Failed to load scheme' });
  }
});

router.post('/check-eligibility', async (req, res) => {
  try {
    const profile = req.body && typeof req.body === 'object' ? req.body : {};
    const slugs = Array.isArray(profile.slugs) ? profile.slugs : null;

    const all = await listSchemes();
    const targets = slugs ? all.filter((s) => slugs.includes(s.slug)) : all;
    const results = targets.map((s) => ({
      slug: s.slug,
      shortName: s.shortName,
      name: s.name,
      category: s.category,
      benefitLabel: s.benefitLabel,
      verdict: eligibilityVerdict(s, profile),
    }));

    const eligible = results.filter((r) => r.verdict.level === 'eligible');
    const partial = results.filter((r) => r.verdict.level === 'partial');
    const notEligible = results.filter((r) => r.verdict.level === 'not_eligible');

    res.json({
      success: true,
      profile: {
        state: profile.state || null,
        farmerCategory: profile.farmerCategory || null,
        landAcres: typeof profile.landAcres === 'number' ? profile.landAcres : null,
        crop: profile.crop || null,
      },
      eligible,
      partiallyEligible: partial,
      notEligible,
    });
  } catch (err) {
    console.error('[schemes/eligibility]', err.message);
    res.status(500).json({ success: false, error: 'Eligibility check failed' });
  }
});

ensureSeed().catch(() => {});

module.exports = router;
module.exports.readSeedData = readSeedData;
module.exports.listSchemes = listSchemes;
module.exports.eligibilityVerdict = eligibilityVerdict;

// Buyer requirements regression test.
//
// Guards the GET /api/buyers/requirements contract used by the Decision
// Workspace Connect stage: the qualityMatch service must return, from the
// real static buyerRequirements.json, exactly the fields the frontend reads,
// with honest DEMO classification and no crop/district leakage.

const fs = require('fs');
const path = require('path');
const { findCompatibleRequirements } = require('../../src/services/qualityMatch');

const REQUIREMENTS_FILE = path.join(__dirname, '..', '..', 'src', 'data', 'buyerRequirements.json');
const requirementsData = JSON.parse(fs.readFileSync(REQUIREMENTS_FILE, 'utf8'));
const requirements = requirementsData.requirements;

describe('findCompatibleRequirements (route contract)', () => {
  test('returns Onion/Nashik/10q/unassessed requirements with the frontend field shape', () => {
    const lot = { crop: 'Onion', district: 'Nashik', quantityQuintals: 10, grade: 'Unassessed' };
    const result = findCompatibleRequirements(requirements, lot);

    expect(result.length).toBeGreaterThan(0);
    const first = result[0];
    // Fields consumed by web-app/src/pages/DecisionWorkspace.tsx Connect stage
    expect(first).toHaveProperty('buyerName');
    expect(first).toHaveProperty('overallCompatibility');
    expect(['STRONG', 'PARTIAL', 'WEAK', 'INCOMPATIBLE']).toContain(first.overallCompatibility);
    expect(first).toHaveProperty('crop', 'Onion');
    expect(first.quantityRange).toHaveProperty('min');
    expect(first.quantityRange).toHaveProperty('max');
    expect(Array.isArray(first.serviceDistricts)).toBe(true);
    expect(first.qualityMatch).toHaveProperty('matchLevel');
    expect(Array.isArray(first.qualityMatch.reasons)).toBe(true);
    expect(first).toHaveProperty('paymentTerms');
    // Honest labeling must survive into the response
    expect(first.label).toMatch(/DEMO/);
  });

  test('unassessed grade yields PARTIAL (never a false STRONG)', () => {
    const lot = { crop: 'Onion', district: 'Nashik', quantityQuintals: 10, grade: 'Unassessed' };
    const result = findCompatibleRequirements(requirements, lot);
    expect(result.every(r => r.overallCompatibility !== 'STRONG')).toBe(true);
  });

  test('does not leak other crops into the match (no Onion/Soybean cross-talk)', () => {
    const onion = findCompatibleRequirements(requirements, { crop: 'Onion', district: 'Nashik', quantityQuintals: 10, grade: 'A' });
    const soy = findCompatibleRequirements(requirements, { crop: 'Soybean', district: 'Nagpur', quantityQuintals: 30, grade: 'B' });
    expect(onion.every(r => r.crop === 'Onion')).toBe(true);
    expect(soy.every(r => r.crop === 'Soybean')).toBe(true);
    expect(onion.some(r => r.buyerName === 'Nashik Kisan Producer Co.')).toBe(true);
    expect(soy.some(r => r.buyerName === 'Vidarbha Soy Processors Pvt Ltd')).toBe(true);
  });

  test('district outside service areas yields WEAK or no match, never STRONG', () => {
    const result = findCompatibleRequirements(requirements, { crop: 'Onion', district: 'Ratnagiri', quantityQuintals: 10, grade: 'A' });
    expect(result.every(r => r.overallCompatibility !== 'STRONG')).toBe(true);
  });

  test('invalid lot returns empty without throwing', () => {
    expect(findCompatibleRequirements(requirements, null)).toEqual([]);
    expect(findCompatibleRequirements(null, { crop: 'Onion' })).toEqual([]);
  });
});
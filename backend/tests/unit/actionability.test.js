// Unit tests for the deterministic buyer-coverage / actionability module.
// Every assertion maps to a documented compatibility rule over the buyer
// directory's own fields — no demand prediction anywhere.
const actionability = require('../../src/services/actionability');

const BUYERS = [
  { id: 'b1', name: 'Nashik Onion Co', crops: ['Onion'], districts: ['Nashik'], minQuantityQuintals: 5 },
  { id: 'b2', name: 'Pune Processor', crops: ['Onion', 'Soybean'], districts: ['Pune'], minQuantityQuintals: 10 },
  { id: 'b3', name: 'Bulk Only 25q', crops: ['Onion'], districts: ['Nashik'], minQuantityQuintals: 25 },
];

const ROWS = [
  { market: 'Lasalgaon(Niphad)', canonicalMandi: 'Lasalgaon', farmerNetPerQuintal: 4600, farmerNetTotal: 46000, rank: 1 },
  { market: 'Nashik', canonicalMandi: 'Nashik', farmerNetPerQuintal: 4540, farmerNetTotal: 45400, rank: 2 },
  { market: 'Pune', canonicalMandi: 'Pune', farmerNetPerQuintal: 4400, farmerNetTotal: 44000, rank: 3 },
  { market: 'Chandrapur(Ganjwad)', farmerNetPerQuintal: 9000, farmerNetTotal: 90000, rank: 4 },
];

const LOT = { crop: 'Onion', quantityQuintals: 10, qualityGrade: 'A' };

describe('actionability', () => {
  test('classifies actionable / no-match / unknown statuses', () => {
    const out = actionability.assessCoverage(ROWS, BUYERS, LOT);
    expect(out.coverage['Lasalgaon(Niphad)'].status).toBe('ACTIONABLE'); // Lasalgaon→Nashik districts, b1 accepts 5q+
    expect(out.coverage['Nashik'].status).toBe('ACTIONABLE');
    expect(out.coverage['Pune'].status).toBe('ACTIONABLE'); // Pune districts, 10q meets b2 min exactly
    expect(out.coverage['Chandrapur(Ganjwad)'].status).toBe('UNKNOWN');
    expect(out.coverage['Chandrapur(Ganjwad)'].note).toMatch(/unknown/i);
  });

  test('best economic vs best actionable divergence with cost', () => {
    const rows = [ROWS[3], ROWS[0], ROWS[1], ROWS[2]]; // unknown-coverage mandi ranks #1
    const out = actionability.assessCoverage(rows, BUYERS, LOT);
    expect(out.bestEconomic.market).toBe('Chandrapur(Ganjwad)');
    expect(out.bestActionable.market).toBe('Lasalgaon(Niphad)');
    expect(out.divergence).not.toBeNull();
    expect(out.divergence.perQuintal).toBeCloseTo(4400, 1);
  });

  test('minimum-quantity boundary: exact match counts, one quintal less does not', () => {
    const out = actionability.assessCoverage(ROWS, BUYERS, { crop: 'Onion', quantityQuintals: 9 });
    // b2 (Pune, 10q min) no longer compatible; Pune coverage must drop
    expect(out.coverage['Pune'].status).toBe('NO_MATCH');
    expect(out.coverage['Pune'].nearMisses.some((n) => /needs 10 q minimum/.test(n.blocker))).toBe(true);
  });

  test('divergence is null when economic best is also actionable', () => {
    const out = actionability.assessCoverage(ROWS, BUYERS, LOT);
    expect(out.divergence).toBeNull();
    expect(out.bestActionable.market).toBe(out.bestEconomic.market);
  });

  test('all markets unmatched → honest summary, bestActionable null', () => {
    const out = actionability.assessCoverage(ROWS, [], LOT);
    expect(out.summary.allUnmatched).toBe(true);
    expect(out.summary.actionableCount).toBe(0);
    expect(out.bestActionable).toBeNull();
    expect(out.divergence).toBeNull();
  });

  test('match reasons come only from directory fields', () => {
    const out = actionability.assessCoverage(ROWS, BUYERS, LOT);
    const reasons = out.coverage['Nashik'].buyers[0].matchReasons;
    expect(reasons).toContain('buys Onion');
    expect(reasons).toContain('serves Nashik');
    expect(reasons).toContain('accepts 5 q+');
    expect(reasons.join(' ')).toMatch(/no quality restriction listed/);
  });
});

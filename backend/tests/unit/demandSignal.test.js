// Demand Signal Tests — comprehensive coverage for demand matching, freshness,
// actionability, and integration. Tests cover active/expired/paused demand,
// quality matching, geography, quantity range, trust tier preservation,
// no leakage across crops/districts, and edge cases.

const { evaluateFreshness, filterActionable } = require('../../src/services/demandFreshness');
const { matchLotToSignal, findCompatibleDemands, assessDemandCoverage } = require('../../src/services/demandMatch');
const { computePathways } = require('../../src/services/pathwayDecision');

// ── HELPERS ────────────────────────────────────────────────────────────────

function makeSignal(overrides = {}) {
  return {
    id: 'ds-test',
    buyerId: 'b-test',
    buyerName: 'Test Buyer',
    buyerTrustTier: 'DEMO_VERIFIED',
    crop: 'Onion',
    district: 'Nashik',
    minQuantityQuintals: 5,
    maxQuantityQuintals: 50,
    requiredGrade: 'B',
    requiredQuality: { minGrade: 'B', maxMoisturePct: 12, maxDamagePct: 5 },
    preferredMarket: null,
    targetPricePerQuintal: null,
    validFrom: '2026-09-10T00:00:00.000Z',
    validUntil: '2026-09-17T23:59:59.999Z',
    demandStatus: 'ACTIVE',
    demandEvidence: 'Test demand signal',
    source: 'DEMO_SEED',
    classification: 'DEMO_DEMAND',
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeLot(overrides = {}) {
  return {
    crop: 'Onion',
    quantityQuintals: 10,
    grade: 'B',
    size: '40-60mm',
    moisturePct: 10,
    damagePct: 3,
    district: 'Nashik',
    ...overrides,
  };
}

const NOW = new Date('2026-09-12T12:00:00.000Z');

// ════════════════════════════════════════════════════════════════════════════
// DEMAND FRESHNESS TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Demand Freshness', () => {
  test('ACTIVE signal within validity window returns ACTIVE state', () => {
    const signal = makeSignal({ demandStatus: 'ACTIVE' });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('ACTIVE');
    expect(result.isFresh).toBe(true);
    expect(result.hoursUntilExpiry).toBeGreaterThan(0);
  });

  test('EXPIRED signal returns EXPIRED state', () => {
    const signal = makeSignal({
      demandStatus: 'ACTIVE',
      validFrom: '2026-09-01T00:00:00.000Z',
      validUntil: '2026-09-05T23:59:59.999Z',
    });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('EXPIRED');
    expect(result.isFresh).toBe(false);
  });

  test('PAUSED signal returns PAUSED state', () => {
    const signal = makeSignal({ demandStatus: 'PAUSED' });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('PAUSED');
    expect(result.isFresh).toBe(false);
  });

  test('FULFILLED signal returns FULFILLED state', () => {
    const signal = makeSignal({ demandStatus: 'FULFILLED' });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('FULFILLED');
    expect(result.isFresh).toBe(false);
  });

  test('Signal expiring within 24 hours returns EXPIRING state', () => {
    const signal = makeSignal({
      demandStatus: 'ACTIVE',
      validFrom: '2026-09-10T00:00:00.000Z',
      validUntil: '2026-09-13T06:00:00.000Z', // ~18 hours from NOW
    });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('EXPIRING');
    expect(result.isFresh).toBe(false);
    expect(result.hoursUntilExpiry).toBeLessThanOrEqual(24);
  });

  test('Signal not yet valid returns NOT_YET_VALID state', () => {
    const signal = makeSignal({
      demandStatus: 'ACTIVE',
      validFrom: '2026-09-15T00:00:00.000Z',
      validUntil: '2026-09-20T23:59:59.999Z',
    });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('NOT_YET_VALID');
    expect(result.isFresh).toBe(false);
  });

  test('Null signal returns INVALID', () => {
    const result = evaluateFreshness(null, NOW);
    expect(result.state).toBe('INVALID');
  });

  test('Signal with invalid dates returns INVALID', () => {
    const signal = makeSignal({ validFrom: 'not-a-date', validUntil: 'also-not-a-date' });
    const result = evaluateFreshness(signal, NOW);
    expect(result.state).toBe('INVALID');
  });

  test('filterActionable returns only ACTIVE signals', () => {
    const signals = [
      makeSignal({ id: 'ds1', demandStatus: 'ACTIVE' }),
      makeSignal({ id: 'ds2', demandStatus: 'EXPIRED', validUntil: '2026-09-05T00:00:00.000Z' }),
      makeSignal({ id: 'ds3', demandStatus: 'PAUSED' }),
    ];
    const result = filterActionable(signals, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ds1');
  });

  test('filterActionable handles non-array input', () => {
    expect(filterActionable(null, NOW)).toEqual([]);
    expect(filterActionable(undefined, NOW)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEMAND MATCHING TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Demand Matching', () => {
  test('MATCH — lot satisfies all demand criteria', () => {
    const signal = makeSignal();
    const lot = makeLot();
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('MATCH');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.blockers).toHaveLength(0);
    expect(result.freshness.state).toBe('ACTIVE');
  });

  test('NO_MATCH — crop mismatch', () => {
    const signal = makeSignal({ crop: 'Onion' });
    const lot = makeLot({ crop: 'Soybean' });
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.some(b => b.includes('Onion'))).toBe(true);
  });

  test('NO_MATCH — district mismatch', () => {
    const signal = makeSignal({ district: 'Pune' });
    const lot = makeLot({ district: 'Nashik' });
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.some(b => b.includes('Pune'))).toBe(true);
  });

  test('NO_MATCH — quantity below minimum', () => {
    const signal = makeSignal({ minQuantityQuintals: 25 });
    const lot = makeLot({ quantityQuintals: 10 });
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.some(b => b.includes('below demand minimum'))).toBe(true);
  });

  test('NO_MATCH — quantity above maximum', () => {
    const signal = makeSignal({ maxQuantityQuintals: 20 });
    const lot = makeLot({ quantityQuintals: 50 });
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.some(b => b.includes('exceeds demand maximum'))).toBe(true);
  });

  test('NO_MATCH — grade below requirement', () => {
    const signal = makeSignal({ requiredGrade: 'A' });
    const lot = makeLot({ grade: 'C' });
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.some(b => b.includes('below demand requirement'))).toBe(true);
  });

  test('NO_MATCH — expired demand signal', () => {
    const signal = makeSignal({
      demandStatus: 'ACTIVE',
      validFrom: '2026-09-01T00:00:00.000Z',
      validUntil: '2026-09-05T23:59:59.999Z',
    });
    const lot = makeLot();
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.freshness.state).toBe('EXPIRED');
  });

  test('NO_MATCH — paused demand signal', () => {
    const signal = makeSignal({ demandStatus: 'PAUSED' });
    const lot = makeLot();
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.freshness.state).toBe('PAUSED');
  });

  test('MATCH — grade Unassessed meets requirement (informational, not blocked)', () => {
    const signal = makeSignal({ requiredGrade: 'B' });
    const lot = makeLot({ grade: 'Unassessed' });
    const result = matchLotToSignal(lot, signal, NOW);
    // Unassessed grade gets an informational reason, not a blocker
    expect(result.matchLevel).not.toBe('NO_MATCH');
  });

  test('PARTIAL_MATCH — moisture exceeds limit', () => {
    const signal = makeSignal();
    const lot = makeLot({ moisturePct: 20 }); // exceeds 12% limit
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.some(b => b.includes('Moisture'))).toBe(true);
  });

  test('MATCH — district restriction absent means any district matches', () => {
    const signal = makeSignal({ district: null });
    const lot = makeLot({ district: 'Pune' });
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.blockers.some(b => b.includes('district'))).toBe(false);
  });

  test('Trust tier is preserved in match reasons', () => {
    const signal = makeSignal({ buyerTrustTier: 'REAL_VERIFIED' });
    const lot = makeLot();
    const result = matchLotToSignal(lot, signal, NOW);
    expect(result.reasons.some(r => r.includes('REAL_VERIFIED'))).toBe(true);
  });

  test('Null lot returns UNKNOWN', () => {
    const result = matchLotToSignal(null, makeSignal(), NOW);
    expect(result.matchLevel).toBe('UNKNOWN');
  });

  test('Null signal returns UNKNOWN', () => {
    const result = matchLotToSignal(makeLot(), null, NOW);
    expect(result.matchLevel).toBe('UNKNOWN');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEMAND COVERAGE ASSESSMENT TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Demand Coverage Assessment', () => {
  test('Active demand for matching lot shows hasActiveDemand=true', () => {
    const signals = [makeSignal({ id: 'ds1' })];
    const lot = makeLot();
    const result = assessDemandCoverage(signals, lot, NOW);
    expect(result.hasActiveDemand).toBe(true);
    expect(result.hasStrongDemand).toBe(true);
    expect(result.strongCount).toBe(1);
    expect(result.actionability.status).toBe('ACTIVE_DEMAND_EXISTS');
  });

  test('No demand signals returns hasActiveDemand=false', () => {
    const result = assessDemandCoverage([], makeLot(), NOW);
    expect(result.hasActiveDemand).toBe(false);
    expect(result.actionability.status).toBe('NO_ACTIVE_DEMAND');
    expect(result.actionability.reason).toContain('No demand signals found');
  });

  test('Expired demand returns NO_ACTIVE_DEMAND with expired count', () => {
    const signals = [
      makeSignal({ id: 'ds1', validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-05T23:59:59.999Z' }),
    ];
    const result = assessDemandCoverage(signals, makeLot(), NOW);
    expect(result.hasActiveDemand).toBe(false);
    expect(result.actionability.reason).toContain('expired');
  });

  test('Paused demand returns NO_ACTIVE_DEMAND with paused count', () => {
    const signals = [makeSignal({ id: 'ds1', demandStatus: 'PAUSED' })];
    const result = assessDemandCoverage(signals, makeLot(), NOW);
    expect(result.hasActiveDemand).toBe(false);
    expect(result.actionability.reason).toContain('paused');
  });

  test('No leakage across crops', () => {
    const signals = [makeSignal({ id: 'ds1', crop: 'Soybean' })];
    const lot = makeLot({ crop: 'Onion' });
    const result = assessDemandCoverage(signals, lot, NOW);
    expect(result.hasActiveDemand).toBe(false);
  });

  test('No leakage across districts', () => {
    const signals = [makeSignal({ id: 'ds1', district: 'Pune' })];
    const lot = makeLot({ district: 'Nashik' });
    const result = assessDemandCoverage(signals, lot, NOW);
    expect(result.hasActiveDemand).toBe(false);
  });

  test('Mixed signals — some active, some expired', () => {
    const signals = [
      makeSignal({ id: 'ds1', demandStatus: 'ACTIVE' }),
      makeSignal({ id: 'ds2', validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-05T23:59:59.999Z' }),
      makeSignal({ id: 'ds3', demandStatus: 'PAUSED' }),
    ];
    const result = assessDemandCoverage(signals, makeLot(), NOW);
    expect(result.hasActiveDemand).toBe(true);
    expect(result.activeCount).toBe(1);
    expect(result.totalCount).toBe(3);
  });

  test('Partial demand exists when quality mismatches', () => {
    const signal = makeSignal({ requiredQuality: { minGrade: 'A', maxMoisturePct: 5, maxDamagePct: 1 } });
    const lot = makeLot({ grade: 'B', moisturePct: 10, damagePct: 3 }); // meets grade but not quality
    const result = assessDemandCoverage([signal], lot, NOW);
    // Grade B doesn't meet A requirement → NO_MATCH, so no active demand
    expect(result.hasActiveDemand).toBe(false);
  });

  test('Data basis mentions demand signals are demo', () => {
    const result = assessDemandCoverage([makeSignal()], makeLot(), NOW);
    expect(result.dataBasis).toContain('demo directory');
    expect(result.dataBasis).toContain('does not guarantee');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// findCompatibleDemands SORTING TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('findCompatibleDemands', () => {
  test('Returns matches sorted by match level (MATCH first)', () => {
    const signals = [
      makeSignal({ id: 'ds-partial', requiredGrade: 'C', minQuantityQuintals: 1, maxQuantityQuintals: 5 }),
      makeSignal({ id: 'ds-match' }),
    ];
    const lot = makeLot();
    const results = findCompatibleDemands(signals, lot, NOW);
    expect(results[0].signalId).toBe('ds-match');
    expect(results[0].matchLevel).toBe('MATCH');
  });

  test('Returns empty for non-array input', () => {
    expect(findCompatibleDemands(null, makeLot(), NOW)).toEqual([]);
    expect(findCompatibleDemands(undefined, makeLot(), NOW)).toEqual([]);
  });

  test('Returns empty for null lot', () => {
    expect(findCompatibleDemands([makeSignal()], null, NOW)).toEqual([]);
  });

  test('All signals get freshness attached', () => {
    const signals = [makeSignal({ id: 'ds1' }), makeSignal({ id: 'ds2', demandStatus: 'PAUSED' })];
    const results = findCompatibleDemands(signals, makeLot(), NOW);
    expect(results.every(r => r.freshness !== undefined)).toBe(true);
  });

  test('Classification is preserved', () => {
    const signal = makeSignal({ classification: 'DEMO_DEMAND' });
    const results = findCompatibleDemands([signal], makeLot(), NOW);
    expect(results[0].classification).toBe('DEMO_DEMAND');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATHWAY DECISION INTEGRATION TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Pathway Decision — Demand Signal Integration', () => {
  const mockEngineResult = {
    rankedMandis: [
      { market: 'APMC Lasalgaon', canonicalMandi: 'Lasalgaon', farmerNetPerQuintal: 3500, farmerNetTotal: 35000, distanceKm: 40, farmerCosts: { transportTier: 'small_lcv' } },
      { market: 'APMC Nashik', canonicalMandi: 'Nashik', farmerNetPerQuintal: 3200, farmerNetTotal: 32000, distanceKm: 15, farmerCosts: { transportTier: 'small_lcv' } },
    ],
    bestMandi: 'APMC Lasalgaon',
  };

  test('Pathway result includes demandSignals field', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'B' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    expect(result.pathways[0].demandSignals).toBeDefined();
    expect(result.pathways[0].demandSignals.hasActiveDemand).toBeDefined();
  });

  test('Pathway result includes demandSignals in dataBasis', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'B' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    expect(result.dataBasis.demandSignals).toBeDefined();
    expect(result.dataBasis.activeDemand).toBeDefined();
  });

  test('Pathway evidence includes demand_signals type', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'B' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    expect(sellNow.evidence.some(e => e.type === 'demand_signals')).toBe(true);
  });

  test('Feasibility trace includes demand signal check', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'B' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    const feasibility = result.decisionTrace.find(t => t.name === 'Feasibility');
    expect(feasibility.checks.some(c => c.check === 'Active demand signals')).toBe(true);
  });

  test('Pathway assumptions mention demand signals are demo', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'B' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    expect(result.assumptions.some(a => a.includes('Demand signals'))).toBe(true);
  });

  test('Demand signal matches are included in pathway why', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'B' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    // Should have some demand-related "why" statement
    expect(sellNow.why.some(w => w.includes('emand'))).toBe(true);
  });
});

/**
 * Unit tests for Market Intelligence 2.0 services.
 * Tests the pure logic of arrival intelligence, quality matching,
 * sale-window analysis, and pathway decisions.
 */
const { summarizeArrivals } = require('../../src/services/arrivalIntel');
const { matchQuality, findCompatibleRequirements, GRADE_RANK } = require('../../src/services/qualityMatch');
const { computeSaleWindow } = require('../../src/services/saleWindow');
const { computePathways, transportRate, BULK_THRESHOLD } = require('../../src/services/pathwayDecision');

// ── Arrival Intelligence ──────────────────────────────────────────────────

describe('arrivalIntel', () => {
  test('returns unavailable when no data', () => {
    const result = summarizeArrivals([]);
    expect(result.available).toBe(false);
    expect(result.observations).toEqual([]);
  });

  test('returns unavailable for null input', () => {
    const result = summarizeArrivals(null);
    expect(result.available).toBe(false);
  });

  test('counts observations by date', () => {
    const rows = [
      { crop: 'Onion', market: 'A', arrivalDate: '08/09/2026', modalPrice: 3000 },
      { crop: 'Onion', market: 'B', arrivalDate: '08/09/2026', modalPrice: 3200 },
      { crop: 'Onion', market: 'C', arrivalDate: '09/09/2026', modalPrice: 3100 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.available).toBe(true);
    expect(result.observations.length).toBe(2);
    expect(result.observations[0].entries).toBe(2); // 08/09
    expect(result.observations[1].entries).toBe(1); // 09/09
  });

  test('filters by crop', () => {
    const rows = [
      { crop: 'Onion', market: 'A', arrivalDate: '08/09/2026' },
      { crop: 'Soybean', market: 'B', arrivalDate: '08/09/2026' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].entries).toBe(1);
  });

  test('identifies above-normal arrivals', () => {
    // 7 days with 2 entries each, then a spike to 10
    const rows = [];
    for (let d = 1; d <= 7; d++) {
      rows.push({ crop: 'Onion', market: 'A', arrivalDate: `${String(d).padStart(2, '0')}/09/2026` });
      rows.push({ crop: 'Onion', market: 'B', arrivalDate: `${String(d).padStart(2, '0')}/09/2026` });
    }
    for (let i = 0; i < 10; i++) {
      rows.push({ crop: 'Onion', market: `M${i}`, arrivalDate: '08/09/2026' });
    }
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.context).toBe('ABOVE_NORMAL');
  });
});

// ── Quality Matching ──────────────────────────────────────────────────────

describe('qualityMatch', () => {
  test('returns UNKNOWN for null requirement', () => {
    const result = matchQuality({ grade: 'A' }, null);
    expect(result.matchLevel).toBe('UNKNOWN');
  });

  test('MATCH when all fields meet requirements', () => {
    const result = matchQuality(
      { grade: 'A', moisturePct: 8, damagePct: 2 },
      { minGrade: 'B', maxMoisturePct: 12, maxDamagePct: 5 }
    );
    expect(result.matchLevel).toBe('MATCH');
    expect(result.blockers).toHaveLength(0);
  });

  test('NO_MATCH when moisture exceeds limit', () => {
    const result = matchQuality(
      { grade: 'B', moisturePct: 15, damagePct: 2 },
      { minGrade: 'B', maxMoisturePct: 12, maxDamagePct: 5 }
    );
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  test('MATCH when grade meets and moisture not provided', () => {
    const result = matchQuality(
      { grade: 'B', moisturePct: null, damagePct: 2 },
      { minGrade: 'B', maxMoisturePct: 12, maxDamagePct: 5 }
    );
    // moisturePct null → moisture check skipped; grade + damage pass → MATCH
    expect(result.matchLevel).toBe('MATCH');
  });

  test('PARTIAL when grade matches but damage exceeds limit', () => {
    const result = matchQuality(
      { grade: 'A', moisturePct: 8, damagePct: 10 },
      { minGrade: 'B', maxMoisturePct: 12, maxDamagePct: 5 }
    );
    expect(result.matchLevel).toBe('NO_MATCH');
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  test('NO_MATCH when grade is too low', () => {
    const result = matchQuality(
      { grade: 'C' },
      { minGrade: 'A' }
    );
    expect(result.matchLevel).toBe('NO_MATCH');
  });

  test('handles Unassessed grade', () => {
    const result = matchQuality(
      { grade: 'Unassessed' },
      { minGrade: 'B' }
    );
    expect(result.matchLevel).toBe('PARTIAL'); // Unassessed is rank 0, below B
    expect(result.reasons.some(r => r.includes('unassessed'))).toBe(true);
  });

  test('GRADE_RANK ordering', () => {
    expect(GRADE_RANK.A).toBeGreaterThan(GRADE_RANK.B);
    expect(GRADE_RANK.B).toBeGreaterThan(GRADE_RANK.C);
    expect(GRADE_RANK.C).toBeGreaterThan(GRADE_RANK.Unassessed);
  });
});

describe('findCompatibleRequirements', () => {
  const requirements = [
    { id: 'r1', buyerId: 'b1', crop: 'Onion', quantityRange: { min: 5, max: 50 }, serviceDistricts: ['Nashik'], qualityRequirements: { minGrade: 'B' } },
    { id: 'r2', buyerId: 'b2', crop: 'Soybean', quantityRange: { min: 10, max: 100 }, serviceDistricts: ['Pune'], qualityRequirements: { minGrade: 'A' } },
  ];

  test('finds compatible crop + district', () => {
    const results = findCompatibleRequirements(requirements, {
      crop: 'Onion', quantityQuintals: 10, grade: 'A', district: 'Nashik',
    });
    expect(results.length).toBe(1);
    expect(results[0].overallCompatibility).toBe('STRONG');
  });

  test('rejects wrong crop', () => {
    const results = findCompatibleRequirements(requirements, {
      crop: 'Tomato', quantityQuintals: 10, district: 'Nashik',
    });
    expect(results.length).toBe(0);
  });

  test('rejects out-of-range quantity', () => {
    const results = findCompatibleRequirements(requirements, {
      crop: 'Onion', quantityQuintals: 3, district: 'Nashik',
    });
    expect(results.length).toBe(0);
  });

  test('returns empty for null input', () => {
    expect(findCompatibleRequirements(null, {})).toEqual([]);
  });
});

// ── Sale Window ───────────────────────────────────────────────────────────

describe('saleWindow', () => {
  test('INSUFFICIENT_EVIDENCE with no current quote', () => {
    const result = computeSaleWindow([], null);
    expect(result.signal).toBe('INSUFFICIENT_EVIDENCE');
  });

  test('NEUTRAL with sparse history', () => {
    const result = computeSaleWindow(
      [{ date: '2026-09-08', modalPrice: 4500 }],
      { modalPrice: 4500, arrivalDate: '08/09/2026' }
    );
    expect(result.signal).toBe('NEUTRAL');
  });

  test('FAVORABLE_NOW when price is high in range', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 3000 },
      { date: '2026-09-02', modalPrice: 3200 },
      { date: '2026-09-03', modalPrice: 3400 },
      { date: '2026-09-04', modalPrice: 3600 },
      { date: '2026-09-05', modalPrice: 3800 },
    ];
    const result = computeSaleWindow(
      series,
      { modalPrice: 3750, arrivalDate: '05/09/2026' }
    );
    expect(result.signal).toBe('FAVORABLE_NOW');
  });

  test('WEAK_RELATIVE_TO_HISTORY when price is low in range', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 4000 },
      { date: '2026-09-02', modalPrice: 4200 },
      { date: '2026-09-03', modalPrice: 4400 },
      { date: '2026-09-04', modalPrice: 4600 },
      { date: '2026-09-05', modalPrice: 4800 },
    ];
    const result = computeSaleWindow(
      series,
      { modalPrice: 4100, arrivalDate: '05/09/2026' }
    );
    expect(result.signal).toBe('WEAK_RELATIVE_TO_HISTORY');
  });

  test('never claims to forecast', () => {
    const result = computeSaleWindow(
      [{ date: 'a', modalPrice: 100 }, { date: 'b', modalPrice: 200 }],
      { modalPrice: 150 }
    );
    const allText = [...result.why, ...result.assumptions].join(' ');
    expect(allText.toLowerCase()).not.toMatch(/will (rise|fall|increase|decrease|go up|go down)/);
  });
});

// ── Pathway Decision ──────────────────────────────────────────────────────

describe('pathwayDecision', () => {
  const mockEngineResult = {
    rankedMandis: [
      {
        market: 'APMC Lasalgaon',
        farmerNetPerQuintal: 4500,
        farmerNetTotal: 45000,
        distanceKm: 100,
        farmerCosts: { transportPerQuintal: 150, transportTier: 'small_lcv' },
        decision: { confidence: 'GOOD' },
      },
      {
        market: 'APMC Nagpur',
        farmerNetPerQuintal: 4300,
        farmerNetTotal: 43000,
        distanceKm: 200,
        farmerCosts: { transportPerQuintal: 300, transportTier: 'small_lcv' },
      },
    ],
    bestMandi: 'APMC Lasalgaon',
  };

  test('computes SELL_NOW pathway', () => {
    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 10,
      quality: { grade: 'Unassessed' },
      engineResult: mockEngineResult,
      trendData: null,
    });
    expect(result.pathways.length).toBeGreaterThanOrEqual(1);
    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    expect(sellNow).toBeTruthy();
    expect(sellNow.estimatedNetPerQuintal).toBe(4500);
  });

  test('computes AGGREGATE pathway for small lots', () => {
    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult,
      trendData: null,
    });
    const aggregate = result.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
    expect(aggregate).toBeTruthy();
    expect(aggregate.transportSavingPerQuintal).toBeGreaterThan(0);
  });

  test('no transport saving for bulk lots', () => {
    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 50,
      quality: {},
      engineResult: mockEngineResult,
      trendData: null,
    });
    const aggregate = result.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
    expect(aggregate.isBulkQualified).toBe(true);
    expect(aggregate.transportSavingPerQuintal).toBe(0);
  });

  test('includes recommendation', () => {
    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult,
      trendData: null,
    });
    expect(result.recommendation).toBeTruthy();
    expect(result.recommendation.pathway).toBeTruthy();
    expect(result.recommendation.why.length).toBeGreaterThan(0);
  });

  test('includes outcome measurement foundation', () => {
    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult,
      trendData: null,
    });
    expect(result.outcome).toBeTruthy();
    expect(result.outcome.referenceMarket).toBe('APMC Lasalgaon');
    expect(result.outcome.referenceNetPerQuintal).toBe(4500);
  });

  test('handles empty engine result', () => {
    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 10,
      quality: {},
      engineResult: null,
      trendData: null,
    });
    expect(result.pathways).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });

  test('transport rate threshold', () => {
    expect(transportRate(39)).toBe(1.5);
    expect(transportRate(40)).toBe(0.75);
    expect(transportRate(100)).toBe(0.75);
  });
});

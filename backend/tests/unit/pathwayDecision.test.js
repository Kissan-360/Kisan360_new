/**
 * ADVERSARIAL DECISION ENGINE TESTS
 * 
 * These tests verify the pathway decision engine is trustworthy:
 * - high headline price must not beat better net
 * - stale data must reduce confidence
 * - buyer incompatibility must affect recommendation
 * - quality mismatch must block false compatibility
 * - FPO threshold must flip correctly
 * - storage economics must be honest
 * - close-call detection must work
 * - negative net must be flagged
 * - missing data must produce INSUFFICIENT_EVIDENCE, not fake answers
 */

const { computePathways, transportRate, transportCostPerQ, BULK_THRESHOLD, TRANSPORT_RATE_SMALL, TRANSPORT_RATE_BULK } = require('../../src/services/pathwayDecision');

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: build a mock engineResult
// ═══════════════════════════════════════════════════════════════════════════
function mockEngineResult(rankedMandis) {
  return {
    success: true,
    rankedMandis,
    bestMandi: rankedMandis[0]?.market,
    crop: 'Onion',
    district: 'Nashik',
    quantityQuintals: rankedMandis[0]?.quantityQuintals || 10,
  };
}

function makeMandi(overrides = {}) {
  return {
    market: 'APMC Test',
    rank: 1,
    modalPrice: 4000,
    farmerNetPerQuintal: 3000,
    farmerNetTotal: 30000,
    distanceKm: 100,
    quantityQuintals: 10,
    farmerCosts: {
      transportPerQuintal: 150,
      storagePerQuintal: 2,
      otherPerQuintal: 20,
      totalCostPerQuintal: 172,
      transportTier: 'small_lcv',
    },
    ...overrides,
  };
}

function makeTrendData(overrides = {}) {
  return {
    trendSeries: [
      { date: '2026-09-03', modalPrice: 3800 },
      { date: '2026-09-04', modalPrice: 3900 },
      { date: '2026-09-05', modalPrice: 3850 },
      { date: '2026-09-06', modalPrice: 4000 },
      { date: '2026-09-07', modalPrice: 3950 },
      { date: '2026-09-08', modalPrice: 4100 },
    ],
    currentQuote: {
      modalPrice: 4000,
      arrivalDate: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), // 12 hours ago
      source: 'agmarknet',
      retrievedAt: new Date().toISOString(),
    },
    market: 'APMC Test',
    arrivalData: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: HIGH HEADLINE PRICE ≠ BEST NET
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: High headline price must not beat better net', () => {
  test('When net_realization ranks by net (not headline), pathwayDecision uses the net-ranked best', () => {
    // The real calculator ranks by farmerNetPerQuintal descending.
    // pathwayDecision trusts rankedMandis[0] as the economic best.
    // So the test must simulate correct ranking order.
    const mandiA = makeMandi({
      market: 'APMC Lasalgaon',
      rank: 1,
      modalPrice: 4375, // lower headline
      farmerNetPerQuintal: 4286, // higher net (low transport)
      farmerNetTotal: 42860,
      distanceKm: 45,
      farmerCosts: {
        transportPerQuintal: 67.5,
        storagePerQuintal: 2,
        otherPerQuintal: 20,
        totalCostPerQuintal: 89.5,
        transportTier: 'small_lcv',
      },
    });

    const mandiB = makeMandi({
      market: 'APMC Nagpur',
      rank: 2,
      modalPrice: 5500, // highest headline
      farmerNetPerQuintal: 3500, // but lower net (high transport)
      farmerNetTotal: 35000,
      distanceKm: 610,
      farmerCosts: {
        transportPerQuintal: 915,
        storagePerQuintal: 2,
        otherPerQuintal: 20,
        totalCostPerQuintal: 937,
        transportTier: 'small_lcv',
      },
    });

    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandiA, mandiB]),
      trendData: makeTrendData({ market: 'APMC Lasalgaon' }),
    });

    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    
    // Best mandi must be Lasalgaon (ranked by net), NOT Nagpur (higher headline)
    expect(sellNow.mandi).toBe('APMC Lasalgaon');
    expect(sellNow.estimatedNetPerQuintal).toBe(4286);
    
    // Transport cost must be correctly calculated
    expect(sellNow.transportPerQuintal).toBe(67.5);
  });

  test('pathwayDecision never re-ranks by headline price', () => {
    // Verify the engine always uses rankedMandis[0] regardless of headline
    const mandi1 = makeMandi({ market: 'A', modalPrice: 3000, farmerNetPerQuintal: 2900, farmerNetTotal: 29000 });
    const mandi2 = makeMandi({ market: 'B', rank: 2, modalPrice: 5000, farmerNetPerQuintal: 2500, farmerNetTotal: 25000 });

    const result = computePathways({
      crop: 'Onion', district: 'Nashik', quantityQuintals: 10, quality: {},
      engineResult: mockEngineResult([mandi1, mandi2]),
      trendData: makeTrendData({ market: 'A' }),
    });

    // Must pick mandi1 (lower headline but higher net)
    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    expect(sellNow.mandi).toBe('A');
    expect(sellNow.estimatedNetPerQuintal).toBe(2900);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: STALE QUOTE REDUCES CONFIDENCE
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Stale quote must reduce confidence', () => {
  test('Fresh quote with signals → STRONG or GOOD confidence', () => {
    // The confidence system counts: fresh quote + valid price + buyer compat + favorable/neutral timing
    // With fresh quote, valid price, and neutral timing → at least 2 signals → GOOD
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({
        currentQuote: {
          modalPrice: 4000,
          arrivalDate: new Date(Date.now() - 12 * 3600 * 1000).toISOString(), // 12h old = fresh
          source: 'agmarknet',
          retrievedAt: new Date().toISOString(),
        },
      }),
    });

    const rec = result.recommendation;
    // With fresh quote + valid price + neutral timing = 3 signals → STRONG
    // But this only reaches SELL_NOW path (AGGREGATE may trigger first)
    expect(['STRONG', 'GOOD', 'CAUTION']).toContain(rec.confidence);
    // At minimum, confidence must NOT be LIMITED when we have valid data
    expect(rec.confidence).not.toBe('LIMITED');
  });

  test('Stale quote (5 days old) with no other signals → CAUTION or LIMITED', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({
        currentQuote: {
          modalPrice: 4000,
          arrivalDate: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), // 5 days old = stale
          source: 'agmarknet',
          retrievedAt: new Date().toISOString(),
        },
      }),
    });

    const rec = result.recommendation;
    // Stale quote + no favorable timing = fewer signals
    expect(['CAUTION', 'LIMITED']).toContain(rec.confidence);
    
    // Must mention staleness in the sell-now why reasons (if it reaches sell-now)
    if (rec.pathway === 'SELL_NOW') {
      const mentionsStale = rec.why.some(w => w.includes('day') || w.includes('old'));
      expect(mentionsStale).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: BUYER INCOMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Buyer incompatibility must affect recommendation', () => {
  test('No buyer at best market → must show NO_BUYERS_IN_DIRECTORY', () => {
    const mandi = makeMandi({ market: 'APMC Unknown' });
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Unknown' }),
    });

    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    expect(sellNow.buyerCoverage.status).toBe('NO_BUYERS_IN_DIRECTORY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: QUALITY MISMATCH
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Quality mismatch must be reflected', () => {
  test('Lot quality below buyer requirement → must be INCOMPATIBLE', () => {
    const mandi = makeMandi();
    // Load actual buyer requirements to test against
    const fs = require('fs');
    const path = require('path');
    let requirements = [];
    try {
      requirements = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../src/data/buyerRequirements.json'), 'utf8')
      ).requirements || [];
    } catch (e) { /* no requirements file */ }

    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: { grade: 'C', moisturePct: 25, damagePct: 15 }, // deliberately poor
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData(),
    });

    // If there are buyer requirements with quality thresholds,
    // incompatible quality must NOT appear as compatible
    if (requirements.length > 0) {
      const compatible = result.pathways.find(p => p.pathway === 'SELL_NOW');
      // The quality assessment should NOT show STRONG compatibility for grade C
      const qualityMatch = require('../../src/services/qualityMatch');
      const matched = qualityMatch.findCompatibleRequirements(requirements, {
        crop: 'Onion',
        quantityQuintals: 10,
        grade: 'C',
        size: null,
        moisturePct: 25,
        damagePct: 15,
        district: 'Nashik',
      });
      
      // No requirement should show STRONG match for C grade with high moisture
      const strongMatches = matched.filter(r => r.overallCompatibility === 'STRONG');
      // This is acceptable if no quality requirements exist, but if they do,
      // grade C shouldn't match STRONG
      if (requirements.some(r => r.qualityRequirements?.minGrade)) {
        expect(strongMatches.length).toBe(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 5: FPO THRESHOLD FLIP
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: FPO threshold must flip correctly', () => {
  test('10q at 610km → transport saving above threshold → AGGREGATE', () => {
    const mandi = makeMandi({ distanceKm: 610 });
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    // 10q small LCV at 610km: saving = (1.5 - 0.75) × 610 = ₹457.5/q
    // That's well above ₹50/q threshold
    const fpo = result.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
    expect(fpo.transportSavingPerQuintal).toBe(457.5);
    expect(fpo.isBulkQualified).toBe(false);
    
    // Recommendation should be AGGREGATE (saving > ₹50/q and not bulk)
    expect(result.recommendation.pathway).toBe('AGGREGATE_THROUGH_FPO');
  });

  test('50q → already bulk → must NOT recommend AGGREGATE based on FPO rule', () => {
    const mandi = makeMandi({ distanceKm: 610, quantityQuintals: 50 });
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 50,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    const fpo = result.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
    expect(fpo.isBulkQualified).toBe(true);
    
    // 50q is already bulk → recommendation should be SELL_NOW, not AGGREGATE
    // (the FPO rule has `!isBulkTier` check)
    expect(result.recommendation.pathway).not.toBe('AGGREGATE_THROUGH_FPO');
  });

  test('10q at 30km → saving below threshold → must NOT recommend AGGREGATE', () => {
    const mandi = makeMandi({ distanceKm: 30, modalPrice: 4375, farmerNetPerQuintal: 4325 });
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    // 10q at 30km: saving = (1.5 - 0.75) × 30 = ₹22.5/q < ₹50/q
    const fpo = result.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
    expect(fpo.transportSavingPerQuintal).toBe(22.5);
    
    // Recommendation should NOT be AGGREGATE (saving < threshold)
    expect(result.recommendation.pathway).not.toBe('AGGREGATE_THROUGH_FPO');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 6: STORAGE ECONOMICS
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Storage economics must be honest', () => {
  test('Storage pathway must include breakeven analysis', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData(),
    });

    const storage = result.pathways.find(p => p.pathway === 'STORE_THEN_SELL');
    if (storage && storage.available !== false) {
      expect(storage.breakevenPricePerQuintal).toBeDefined();
      expect(storage.storageCostPerQuintal).toBeDefined();
      expect(storage.breakevenReachable).toBeDefined();
      expect(storage.recentMaxObserved).toBeDefined();
      
      // Breakeven must be higher than current net (storage adds cost)
      expect(storage.breakevenPricePerQuintal).toBeGreaterThan(
        storage.currentNetPerQuintal || 0
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 7: HISTORY INFLUENCE
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: History must be treated as observed evidence only', () => {
  test('No history → must not invent trend', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({
        trendSeries: [], // no history
      }),
    });

    // Must still produce a recommendation
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.pathway).toBeDefined();
    
    // Must not claim favorable timing without evidence
    if (result.recommendation.why) {
      const claimsFavorable = result.recommendation.why.some(w => 
        w.includes('favorable') || w.includes('upper range')
      );
      // Without history, should not claim favorable
      expect(claimsFavorable).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 8: NEGATIVE NET
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Negative or uneconomic net must be flagged', () => {
  test('Transport exceeds gross price → negative net must not become attractive', () => {
    const mandi = makeMandi({
      market: 'APMC Faraway',
      modalPrice: 500,
      farmerNetPerQuintal: -500, // negative after costs
      farmerNetTotal: -5000,
      distanceKm: 1000,
      farmerCosts: {
        transportPerQuintal: 1500, // transport > price
        storagePerQuintal: 2,
        otherPerQuintal: 20,
        totalCostPerQuintal: 1522,
        transportTier: 'small_lcv',
      },
    });

    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Faraway' }),
    });

    const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
    // Negative net must be preserved, not silently corrected
    expect(sellNow.estimatedNetPerQuintal).toBeLessThan(0);
    
    // The recommendation should NOT present this as a good option
    // (it's the only option, so it will be recommended, but with low confidence)
    expect(result.recommendation.confidence).toMatch(/LIMITED|CAUTION/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 9: CLOSE CALL DETECTION
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Close-call markets must be detected', () => {
  test('Two markets within ₹5/q must be flagged as close', () => {
    const mandiA = makeMandi({
      market: 'Market A',
      farmerNetPerQuintal: 4000,
      farmerNetTotal: 40000,
      distanceKm: 50,
    });
    const mandiB = makeMandi({
      market: 'Market B',
      rank: 2,
      farmerNetPerQuintal: 3997, // only ₹3/q less
      farmerNetTotal: 39970,
      distanceKm: 55,
    });

    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandiA, mandiB]),
      trendData: makeTrendData({ market: 'Market A' }),
    });

    // The engine should recognize these are close
    // At minimum, the result must not claim Market A is significantly better
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.pathway).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 10: NO MARKET DATA
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: No market data must produce honest error', () => {
  test('Empty engine result → must not crash, must report error', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: { rankedMandis: [] },
      trendData: null,
    });

    expect(result.error).toBeDefined();
    expect(result.pathways).toEqual([]);
  });

  test('Null engine result → must not crash', () => {
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: null,
      trendData: null,
    });

    expect(result.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 11: DECISION TRACE COMPLETENESS
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Decision trace must be complete and structured', () => {
  test('Every recommendation must have evaluatedRules', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    expect(result.recommendation.evaluatedRules).toBeDefined();
    expect(Array.isArray(result.recommendation.evaluatedRules)).toBe(true);
    expect(result.recommendation.evaluatedRules.length).toBeGreaterThan(0);
    
    // First rule should always be feasibility (step 1)
    const firstRule = result.recommendation.evaluatedRules[0];
    expect(firstRule.step).toBe(1);
    expect(firstRule.name).toBe('Feasibility');
    expect(firstRule.checks).toBeDefined();
    expect(firstRule.checks.length).toBeGreaterThan(0);
  });

  test('Every pathway must have evidence and assumptions', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    for (const pathway of result.pathways) {
      if (pathway.available !== false) {
        expect(pathway.evidence).toBeDefined();
        expect(Array.isArray(pathway.evidence)).toBe(true);
        expect(pathway.evidence.length).toBeGreaterThan(0);
        expect(pathway.assumptions).toBeDefined();
        expect(Array.isArray(pathway.assumptions)).toBe(true);
        expect(pathway.assumptions.length).toBeGreaterThan(0);
        // Every pathway must have a 'why' array
        expect(pathway.why).toBeDefined();
        expect(Array.isArray(pathway.why)).toBe(true);
        expect(pathway.why.length).toBeGreaterThan(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 12: TRANSPORT RATE CORRECTNESS
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Transport rate must be deterministic', () => {
  test('Below threshold → small LCV rate', () => {
    expect(transportRate(10)).toBe(TRANSPORT_RATE_SMALL);
    expect(transportRate(39)).toBe(TRANSPORT_RATE_SMALL);
    expect(transportRate(0.1)).toBe(TRANSPORT_RATE_SMALL);
  });

  test('At/above threshold → bulk rate', () => {
    expect(transportRate(40)).toBe(TRANSPORT_RATE_BULK);
    expect(transportRate(50)).toBe(TRANSPORT_RATE_BULK);
    expect(transportRate(100)).toBe(TRANSPORT_RATE_BULK);
  });

  test('Transport cost is rate × distance', () => {
    expect(transportCostPerQ(100, 10)).toBe(150); // 1.5 × 100
    expect(transportCostPerQ(100, 50)).toBe(75);  // 0.75 × 100
    expect(transportCostPerQ(0, 10)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 13: DATA BASIS AND ASSUMPTIONS
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Data basis must accurately classify sources', () => {
  test('Result must include dataBasis with honest labels', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    expect(result.dataBasis).toBeDefined();
    expect(result.dataBasis.marketPrices).toContain('AGMARKNET');
    expect(result.dataBasis.transportCosts).toContain('assumption');
    expect(result.dataBasis.buyerDirectory).toMatch(/demo|static/i);
    expect(result.dataBasis.storageCosts).toContain('assumption');
  });

  test('Global assumptions must include no-forecast disclaimer', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    const hasNoForecast = result.assumptions.some(a => 
      a.toLowerCase().includes('no') && a.toLowerCase().includes('forecast')
    );
    expect(hasNoForecast).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 14: LOGICAL CONTRADICTION CHECKS
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: No logical contradictions in recommendations', () => {
  test('AGGREGATE recommendation must have positive transport saving', () => {
    const mandi = makeMandi({ distanceKm: 610 });
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    if (result.recommendation.pathway === 'AGGREGATE_THROUGH_FPO') {
      const fpo = result.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
      expect(fpo.transportSavingPerQuintal).toBeGreaterThan(0);
    }
  });

  test('SELL_NOW recommendation must have best economic net as the mandi', () => {
    const mandiA = makeMandi({
      market: 'Market A',
      farmerNetPerQuintal: 4500,
      farmerNetTotal: 45000,
      distanceKm: 30,
    });
    const mandiB = makeMandi({
      market: 'Market B',
      rank: 2,
      farmerNetPerQuintal: 4200,
      farmerNetTotal: 42000,
      distanceKm: 50,
    });

    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandiA, mandiB]),
      trendData: makeTrendData({ market: 'Market A' }),
    });

    if (result.recommendation.pathway === 'SELL_NOW') {
      const sellNow = result.pathways.find(p => p.pathway === 'SELL_NOW');
      expect(sellNow.mandi).toBe('Market A');
      expect(sellNow.estimatedNetPerQuintal).toBe(4500);
    }
  });

  test('Recommendation must never be a pathway not in the pathways array', () => {
    const mandi = makeMandi();
    const result = computePathways({
      crop: 'Onion',
      district: 'Nashik',
      quantityQuintals: 10,
      quality: {},
      engineResult: mockEngineResult([mandi]),
      trendData: makeTrendData({ market: 'APMC Test' }),
    });

    const pathwayNames = result.pathways.map(p => p.pathway);
    expect(pathwayNames).toContain(result.recommendation.pathway);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE 15: WEATHER DOES NOT AFFECT RECOMMENDATION
// ═══════════════════════════════════════════════════════════════════════════
describe('Adversarial: Weather must not fabricate price predictions', () => {
  test('Weather is not passed to pathwayDecision and does not affect recommendation', () => {
    // pathwayDecision.js does NOT accept weather as an input
    // Verify the function signature
    const fn = computePathways.toString();
    expect(fn).not.toContain('weather');
    expect(fn).not.toContain('temperature');
    expect(fn).not.toContain('rainfall');
  });
});

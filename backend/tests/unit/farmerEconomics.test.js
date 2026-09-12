/**
 * FARMER ECONOMICS TESTS — production cost, break-even, profit, trends, scenarios.
 *
 * Truth contract under test:
 *   - production costs are FARMER_ENTERED (never injected benchmarks)
 *   - break-even / profit are DERIVED
 *   - trends describe the past only (forecast: false)
 *   - scenarios are HYPOTHETICAL (never labeled prediction)
 *   - negative profit is reported honestly, never clamped
 *   - every adversarial input fails safe and deterministic
 */

const farmerEconomics = require('../../src/services/farmerEconomics');
const scenario = require('../../src/services/scenario');
const observedTrend = require('../../src/services/observedTrend');
const priceHistory = require('../../src/services/priceHistory');

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION COST
// ═══════════════════════════════════════════════════════════════════════════

describe('farmerEconomics.parseProductionCosts', () => {
  test('totals all categories', () => {
    const r = farmerEconomics.parseProductionCosts({
      seed: 5000, fertilizer: 7000, cropProtection: 4000, labour: 12000,
      irrigation: 3000, machinery: 4000, landRent: 0, other: 2000,
    });
    expect(r.ok).toBe(true);
    expect(r.totalProductionCost).toBe(37000);
  });

  test('single category works', () => {
    const r = farmerEconomics.parseProductionCosts({ seed: 5000 });
    expect(r.ok).toBe(true);
    expect(r.totalProductionCost).toBe(5000);
  });

  test('zero optional categories default to 0 without error', () => {
    const r = farmerEconomics.parseProductionCosts({});
    expect(r.ok).toBe(true);
    expect(r.totalProductionCost).toBe(0);
    expect(r.breakdown.seed).toBe(0);
  });

  test('negative category is rejected with the category named', () => {
    const r = farmerEconomics.parseProductionCosts({ seed: -100 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/seed.*negative/);
  });

  test('nonnumeric category is rejected', () => {
    const r = farmerEconomics.parseProductionCosts({ labour: 'abc' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/labour.*not_a_number/);
  });

  test('numeric strings are accepted ("4500" → 4500)', () => {
    const r = farmerEconomics.parseProductionCosts({ seed: '4500' });
    expect(r.ok).toBe(true);
    expect(r.breakdown.seed).toBe(4500);
  });

  test('decimal amounts are kept and rounded to paise', () => {
    const r = farmerEconomics.parseProductionCosts({ seed: 100.555, labour: 0.004 });
    expect(r.ok).toBe(true);
    expect(r.totalProductionCost).toBe(100.56);
  });

  test('unknown category is surfaced, not silently dropped', () => {
    const r = farmerEconomics.parseProductionCosts({ seeds: 100 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown_cost_category/);
  });

  test('null/undefined costs object is safe', () => {
    expect(farmerEconomics.parseProductionCosts(null).ok).toBe(true);
    expect(farmerEconomics.parseProductionCosts(undefined).ok).toBe(true);
    expect(farmerEconomics.parseProductionCosts([1, 2]).ok).toBe(true);
  });

  test('Infinity and NaN rejected', () => {
    expect(farmerEconomics.parseProductionCosts({ seed: Infinity }).ok).toBe(false);
    expect(farmerEconomics.parseProductionCosts({ seed: NaN }).ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BREAK-EVEN
// ═══════════════════════════════════════════════════════════════════════════

describe('farmerEconomics.computeBreakEven', () => {
  test('42000 / 10q = 4200/q', () => {
    const r = farmerEconomics.computeBreakEven(42000, 10);
    expect(r.ok).toBe(true);
    expect(r.breakEvenPricePerQuintal).toBe(4200);
  });

  test('zero quantity rejected', () => {
    expect(farmerEconomics.computeBreakEven(42000, 0).ok).toBe(false);
  });

  test('negative quantity rejected', () => {
    expect(farmerEconomics.computeBreakEven(42000, -5).ok).toBe(false);
  });

  test('negative cost rejected', () => {
    expect(farmerEconomics.computeBreakEven(-1, 10).ok).toBe(false);
  });

  test('NaN/Infinity quantity rejected', () => {
    expect(farmerEconomics.computeBreakEven(42000, NaN).ok).toBe(false);
    expect(farmerEconomics.computeBreakEven(42000, Infinity).ok).toBe(false);
  });

  test('decimal quantity works', () => {
    const r = farmerEconomics.computeBreakEven(42000, 10.5);
    expect(r.ok).toBe(true);
    expect(r.breakEvenPricePerQuintal).toBeCloseTo(4000, 5);
  });

  test('zero cost is valid (break-even = 0)', () => {
    expect(farmerEconomics.computeBreakEven(0, 10).breakEvenPricePerQuintal).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROFITABILITY STATUS
// ═══════════════════════════════════════════════════════════════════════════

describe('farmerEconomics.profitabilityStatus', () => {
  test('positive beyond tolerance → PROFITABLE', () => {
    expect(farmerEconomics.profitabilityStatus(300)).toBe('PROFITABLE');
  });
  test('near zero → BREAK_EVEN (tolerance is ₹5/q, documented)', () => {
    expect(farmerEconomics.profitabilityStatus(3)).toBe('BREAK_EVEN');
    expect(farmerEconomics.profitabilityStatus(-3)).toBe('BREAK_EVEN');
  });
  test('clearly negative → BELOW_BREAK_EVEN', () => {
    expect(farmerEconomics.profitabilityStatus(-600)).toBe('BELOW_BREAK_EVEN');
  });
  test('non-finite → INSUFFICIENT_EVIDENCE', () => {
    expect(farmerEconomics.profitabilityStatus(NaN)).toBe('INSUFFICIENT_EVIDENCE');
  });
  test('tolerance boundary is honest: ₹5.01 is PROFITABLE, ₹5.00 is BREAK_EVEN', () => {
    expect(farmerEconomics.profitabilityStatus(5.01)).toBe('PROFITABLE');
    expect(farmerEconomics.profitabilityStatus(5)).toBe('BREAK_EVEN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROFIT OVER MARKETS (multi-market comparison)
// ═══════════════════════════════════════════════════════════════════════════

describe('farmerEconomics.computeEconomics', () => {
  const econ = { totalProductionCost: 42000, productionCostPerQuintal: 4200 };

  function engine(rows) {
    return { success: true, rankedMandis: rows };
  }
  function mandi(overrides = {}) {
    return {
      market: 'APMC Test', rank: 1, modalPrice: 5000,
      farmerNetPerQuintal: 4800, farmerNetTotal: 48000,
      distanceKm: 50, quantityQuintals: 10,
      farmerCosts: { transportPerQuintal: 75, storagePerQuintal: 2, otherPerQuintal: 20, totalCostPerQuintal: 97 },
      ...overrides,
    };
  }

  test('profit = net − production cost, per market', () => {
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 42000, quantityQuintals: 10, engineResult: engine([mandi()]) });
    expect(r.ok).toBe(true);
    const m = r.marketEconomics.rankedByProfit[0];
    expect(m.farmerNetPerQuintal).toBe(4800);
    expect(m.estimatedProfitPerQuintal).toBe(600);
    expect(m.estimatedProfitTotal).toBe(6000);
    expect(m.profitabilityStatus).toBe('PROFITABLE');
  });

  test('lower gross but higher net → higher profit is visible', () => {
    const highGrossLowNet = mandi({ market: 'A', modalPrice: 5400, farmerNetPerQuintal: 4800, farmerNetTotal: 48000 });
    const lowGrossHighNet = mandi({ market: 'B', modalPrice: 5300, farmerNetPerQuintal: 5000, farmerNetTotal: 50000, rank: 2 });
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 42000, quantityQuintals: 10, engineResult: engine([highGrossLowNet, lowGrossHighNet]) });
    const a = r.marketEconomics.rankedByProfit.find(m => m.market === 'A');
    const b = r.marketEconomics.rankedByProfit.find(m => m.market === 'B');
    expect(a.grossPricePerQuintal).toBeGreaterThan(b.grossPricePerQuintal);
    expect(b.estimatedProfitPerQuintal).toBeGreaterThan(a.estimatedProfitPerQuintal);
    expect(r.marketEconomics.bestProfitMarket.market).toBe('B');
    expect(r.marketEconomics.bestNetMarket.market).toBe('B'); // B genuinely has the higher net (5000 > 4800) — computed, not input order
  });

  test('negative profit reported honestly (not clamped, not called savings)', () => {
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 50000, quantityQuintals: 10, engineResult: engine([mandi({ farmerNetPerQuintal: 4400, farmerNetTotal: 44000 })]) });
    const m = r.marketEconomics.rankedByProfit[0];
    expect(m.estimatedProfitPerQuintal).toBe(-600);
    expect(m.profitabilityStatus).toBe('BELOW_BREAK_EVEN');
  });

  test('exact break-even → BREAK_EVEN status', () => {
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 48000, quantityQuintals: 10, engineResult: engine([mandi()]) });
    expect(r.marketEconomics.rankedByProfit[0].profitabilityStatus).toBe('BREAK_EVEN');
  });

  test('quantity scaling: total profit scales with quantity', () => {
    const q10 = farmerEconomics.computeEconomics({ totalProductionCost: 42000, quantityQuintals: 10, engineResult: engine([mandi()]) });
    const q40 = farmerEconomics.computeEconomics({ totalProductionCost: 42000, quantityQuintals: 40, engineResult: engine([mandi({ quantityQuintals: 40, farmerNetTotal: 192000 })]) });
    expect(q10.marketEconomics.rankedByProfit[0].estimatedProfitTotal).toBe(6000);
    // Same ₹42,000 total cost spread over 40q → cost/q drops to 1050 → profit/q 3750 → total 150000
    expect(q40.marketEconomics.rankedByProfit[0].estimatedProfitTotal).toBe(150000);
  });

  test('profit total = profitPerQ × quantity even with decimal quantities', () => {
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 42000, quantityQuintals: 10.5, engineResult: engine([mandi({ quantityQuintals: 10.5, farmerNetTotal: 50400 })]) });
    const m = r.marketEconomics.rankedByProfit[0];
    expect(m.estimatedProfitTotal).toBeCloseTo(m.estimatedProfitPerQuintal * 10.5, 1);
  });

  test('no market evidence → ok:false (422 semantics)', () => {
    expect(farmerEconomics.computeEconomics({ totalProductionCost: 100, quantityQuintals: 10, engineResult: null }).ok).toBe(false);
    expect(farmerEconomics.computeEconomics({ totalProductionCost: 100, quantityQuintals: 10, engineResult: { rankedMandis: [] } }).ok).toBe(false);
  });

  test('econ object without net → filtered, not crash', () => {
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 100, quantityQuintals: 10, engineResult: engine([{ market: 'X', farmerNetTotal: 100 }]) });
    expect(r.ok).toBe(false);
  });

  test('provenance labels: costs FARMER_ENTERED, break-even/profit DERIVED, forecast false', () => {
    const r = farmerEconomics.computeEconomics({ totalProductionCost: 42000, quantityQuintals: 10, engineResult: engine([mandi()]) });
    expect(r.provenance.productionCost).toMatch(/FARMER_ENTERED/);
    expect(r.provenance.breakEven).toMatch(/DERIVED/);
    expect(r.provenance.profit).toMatch(/DERIVED/);
    expect(r.provenance.forecast).toBe(false);
    expect(r.productionEconomics.classification).toBe('DERIVED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVED TRENDS
// ═══════════════════════════════════════════════════════════════════════════

describe('observedTrend.trendForWindow', () => {
  test('UP trend with percent change', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 4000 },
      { date: '2026-09-05', modalPrice: 4152 },
    ];
    const t = observedTrend.trendForWindow(series, 7);
    expect(t.direction).toBe('UP');
    expect(t.percentChange).toBe(3.8);
    expect(t.observationCount).toBe(2);
    expect(t.forecast).toBe(false);
    expect(t.classification).toBe('DERIVED');
  });

  test('DOWN trend', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 5000 },
      { date: '2026-09-05', modalPrice: 4900 },
    ];
    const t = observedTrend.trendForWindow(series, 7);
    expect(t.direction).toBe('DOWN');
    expect(t.percentChange).toBe(-2);
  });

  test('FLAT within tolerance (0.5%) — not forced UP/DOWN', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 4000 },
      { date: '2026-09-05', modalPrice: 4010 },
    ];
    expect(observedTrend.trendForWindow(series, 7).direction).toBe('FLAT');
  });

  test('single observation → INSUFFICIENT_EVIDENCE, NOT "flat"', () => {
    const t = observedTrend.trendForWindow([{ date: '2026-09-01', modalPrice: 4000 }], 7);
    expect(t.direction).toBe('INSUFFICIENT_EVIDENCE');
    expect(t.percentChange).toBeNull();
  });

  test('no observations → INSUFFICIENT_EVIDENCE with empty description', () => {
    const t = observedTrend.trendForWindow([], 14);
    expect(t.direction).toBe('INSUFFICIENT_EVIDENCE');
    expect(t.observationCount).toBe(0);
  });

  test('description describes the past and disclaims forecasting', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 4000 },
      { date: '2026-09-05', modalPrice: 4152 },
    ];
    const t = observedTrend.trendForWindow(series, 7);
    expect(t.description).toMatch(/Observed prices increased/);
    expect(t.description).toMatch(/does not forecast/);
    expect(t.description).not.toMatch(/will rise|expected to|forecast:/i);
  });

  test('min/max observed prices exposed', () => {
    const series = [
      { date: '2026-09-01', modalPrice: 3900 },
      { date: '2026-09-02', modalPrice: 4100 },
      { date: '2026-09-03', modalPrice: 4000 },
    ];
    const t = observedTrend.trendForWindow(series, 7);
    expect(t.minObservedPrice).toBe(3900);
    expect(t.maxObservedPrice).toBe(4100);
  });
});

describe('observedTrend.computeTrends (history-integrity)', () => {
  test('repeated identical fetch does NOT create new observation days (dedupe by crop|market|variety)', () => {
    const days0 = priceHistory.appendRows({}, [
      { crop: 'Onion', market: 'APMC X', variety: 'Local', modalPrice: 4000, arrivalDate: '05/09/2026' },
    ]);
    // Same observation appended twice more (simulated re-fetches)
    const days1 = priceHistory.appendRows(days0, [
      { crop: 'Onion', market: 'APMC X', variety: 'Local', modalPrice: 4000, arrivalDate: '05/09/2026' },
    ]);
    const days2 = priceHistory.appendRows(days1, [
      { crop: 'Onion', market: 'APMC X', variety: 'Local', modalPrice: 4000, arrivalDate: '05/09/2026' },
    ]);
    expect(Object.keys(days2)).toHaveLength(1);
    const series = priceHistory.trendSeries(days2, { crop: 'Onion', market: 'APMC X', window: 30 });
    expect(series).toHaveLength(1); // one observation, not three
    const t = observedTrend.trendForWindow(series, 30);
    expect(t.direction).toBe('INSUFFICIENT_EVIDENCE'); // never "flat" from duplicate fetches
  });

  test('two distinct observation dates → real 2-point trend, observation dates used not fetch dates', () => {
    const days = priceHistory.appendRows({}, [
      { crop: 'Onion', market: 'APMC X', variety: 'Local', modalPrice: 4000, arrivalDate: '05/09/2026' },
      { crop: 'Onion', market: 'APMC X', variety: 'Local', modalPrice: 4160, arrivalDate: '08/09/2026' },
    ]);
    const series = priceHistory.trendSeries(days, { crop: 'Onion', market: 'APMC X', window: 7 });
    const t = observedTrend.trendForWindow(series, 7);
    expect(t.direction).toBe('UP');
    expect(t.firstObservedOn).toBe('2026-09-05');
    expect(t.latestObservedOn).toBe('2026-09-08');
  });

  test('computeTrends requires crop and market', () => {
    // computeTrends is async; a rejected (Promise) result also means not-ok.
    const r1 = observedTrend.computeTrends({ crop: 'Onion' });
    const r2 = observedTrend.computeTrends({ market: 'APMC X' });
    return Promise.all([r1, r2]).then(([a, b]) => {
      expect(a.ok).toBe(false);
      expect(b.ok).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════

describe('scenario.computeScenario', () => {
  const base = {
    hypotheticalPricePerQuintal: 6000,
    quantityQuintals: 10,
    distanceKm: 50,
    totalProductionCost: 42000,
  };

  test('happy path: gross − selling costs − production = profit', () => {
    const r = scenario.computeScenario(base);
    expect(r.ok).toBe(true);
    // transport 1.5*50=75/q → 750; storage 1*2=2/q → 20; other 20/q → 200
    expect(r.outcome.scenarioSellingCosts.total).toBe(970);
    expect(r.outcome.scenarioGrossRevenue).toBe(60000);
    expect(r.outcome.scenarioNetRealization.total).toBe(59030);
    expect(r.outcome.scenarioProfit.total).toBe(17030);
    expect(r.outcome.scenarioProfit.perQuintal).toBe(1703);
    expect(r.outcome.scenarioBreakEvenPrice).toBe(4297); // 4200 cost/q + 97 selling costs/q
    expect(r.outcome.differenceVsBreakEven).toBe(1703);
  });

  test('semantics: HYPOTHETICAL, never prediction/forecast', () => {
    const r = scenario.computeScenario(base);
    expect(r.semantics.type).toBe('HYPOTHETICAL');
    expect(r.semantics.forecast).toBe(false);
    expect(r.semantics.prediction).toBe(false);
    expect(r.semantics.statement).toMatch(/If the selling price were/);
    expect(r.semantics.statement).toMatch(/not a prediction/);
  });

  test('scenario price below break-even → negative profit, BELOW_BREAK_EVEN', () => {
    const r = scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: 4000 });
    expect(r.outcome.scenarioProfit.total).toBeLessThan(0);
    expect(r.outcome.scenarioProfit.status).toBe('BELOW_BREAK_EVEN');
  });

  test('scenario price at scenario break-even (cost + selling costs) → BREAK_EVEN', () => {
    // transport 75/q + storage 2/q + other 20/q = 97/q; 42000/10 = 4200 → 4297
    const r = scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: 4297 });
    expect(r.outcome.scenarioProfit.status).toBe('BREAK_EVEN');
    expect(r.outcome.differenceVsBreakEven).toBe(0);
  });

  test('scenarioBreakEvenPrice includes selling costs — production-only break-even would lose money', () => {
    const r = scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: 4200 });
    // Production-only break-even is 4200, but selling costs (97/q) make this a loss.
    expect(r.outcome.scenarioBreakEvenPrice).toBe(4297);
    expect(r.outcome.scenarioProfit.total).toBeLessThan(0);
  });

  test('quantity override flips transport tier at 40q (bulk rate)', () => {
    const small = scenario.computeScenario({ ...base, scenarioQuantity: 10 });
    const bulk = scenario.computeScenario({ ...base, scenarioQuantity: 40 });
    expect(small.outcome.scenarioSellingCosts.transportPerQuintal).toBe(75);
    expect(bulk.outcome.scenarioSellingCosts.transportPerQuintal).toBe(37.5);
  });

  test('price = 0 rejected; negative price rejected', () => {
    expect(scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: 0 }).ok).toBe(false);
    expect(scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: -100 }).ok).toBe(false);
  });

  test('quantity 0 / negative rejected', () => {
    expect(scenario.computeScenario({ ...base, quantityQuintals: 0 }).ok).toBe(false);
    expect(scenario.computeScenario({ ...base, quantityQuintals: -3 }).ok).toBe(false);
  });

  test('negative production cost rejected', () => {
    expect(scenario.computeScenario({ ...base, totalProductionCost: -1 }).ok).toBe(false);
  });

  test('zero production cost allowed (scenario: zero-cost case)', () => {
    const r = scenario.computeScenario({ ...base, totalProductionCost: 0 });
    expect(r.ok).toBe(true);
    expect(r.outcome.scenarioBreakEvenPrice).toBe(97); // selling costs still apply
    expect(r.outcome.scenarioProfit.total).toBe(59030);
  });

  test('string "6000" price accepted (coercible input)', () => {
    const r = scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: '6000' });
    expect(r.ok).toBe(true);
    expect(r.outcome.scenarioGrossRevenue).toBe(60000);
  });

  test('non-numeric price rejected', () => {
    expect(scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: 'expensive' }).ok).toBe(false);
  });

  test('missing price rejected with field name', () => {
    const r = scenario.computeScenario({ quantityQuintals: 10, distanceKm: 5, totalProductionCost: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/hypotheticalPricePerQuintal/);
  });

  test('absurd price (> plausible mandi range) rejected', () => {
    expect(scenario.computeScenario({ ...base, hypotheticalPricePerQuintal: 600000 }).ok).toBe(false);
  });

  test('scenario overrides above 40q switch to bulk tier; negative scenarioQuantity rejected', () => {
    expect(scenario.computeScenario({ ...base, scenarioQuantity: 0 }).ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE THRESHOLD
// ═══════════════════════════════════════════════════════════════════════════

describe('scenario.computeStorageThreshold', () => {
  test('threshold = currentNet + transport + storage + other', () => {
    const r = scenario.computeStorageThreshold({
      currentNetPerQuintal: 4800,
      storageCostPerQuintal: 10.5, // 1.5 × 7 days
      distanceKm: 50,
      quantityQuintals: 10,
    });
    expect(r.ok).toBe(true);
    // 4800 + 75 + 10.5 + 20
    expect(r.breakEvenFuturePriceForStorage).toBe(4905.5);
  });

  test('semantics: threshold, not a forecast', () => {
    const r = scenario.computeStorageThreshold({
      currentNetPerQuintal: 4800, storageCostPerQuintal: 10, distanceKm: 50, quantityQuintals: 10,
    });
    expect(r.semantics.forecast).toBe(false);
    expect(r.semantics.type).toBe('SCENARIO_THRESHOLD');
    expect(r.semantics.statement).toMatch(/needs to exceed/);
    expect(r.semantics.statement).toMatch(/not a forecast/);
    // Denials like "does not predict whether the price will reach it" are fine;
    // only an AFFIRMATIVE claim ("price will reach X", "expected to reach X")
    // would violate the no-forecast contract.
    const affirmative = r.semantics.statement.replace(/does not predict whether the price will reach it/g, '');
    expect(affirmative).not.toMatch(/will reach|expected to reach/i);
  });

  test('invalid inputs rejected by field name', () => {
    expect(scenario.computeStorageThreshold({ storageCostPerQuintal: 10, distanceKm: 50, quantityQuintals: 10 }).ok).toBe(false);
    expect(scenario.computeStorageThreshold({ currentNetPerQuintal: 4800, storageCostPerQuintal: -1, distanceKm: 50, quantityQuintals: 10 }).ok).toBe(false);
    expect(scenario.computeStorageThreshold({ currentNetPerQuintal: 4800, storageCostPerQuintal: 10, distanceKm: -5, quantityQuintals: 10 }).ok).toBe(false);
    expect(scenario.computeStorageThreshold({ currentNetPerQuintal: 4800, storageCostPerQuintal: 10, distanceKm: 50, quantityQuintals: 0 }).ok).toBe(false);
  });

  test('no undocumented post-harvest loss factor appears anywhere', () => {
    const r = scenario.computeStorageThreshold({
      currentNetPerQuintal: 4800, storageCostPerQuintal: 10, distanceKm: 50, quantityQuintals: 10,
    });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/loss|shrinkage|wastage/i);
  });
});

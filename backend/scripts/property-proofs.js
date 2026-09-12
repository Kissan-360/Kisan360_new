// Mathematical property proofs for the freeze audit (Phases 3, 6, 7, 9).
// Property-style verification, not a Jest suite — run with `node`.
const {
  parseProductionCosts, computeBreakEven, computeEconomics, profitabilityStatus, applyToMandi,
} = require('../src/services/farmerEconomics');
const { computeScenario, computeStorageThreshold } = require('../src/services/scenario');
const { trendForWindow } = require('../src/services/observedTrend');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name, detail !== undefined ? `(${JSON.stringify(detail)})` : ''); }
};
const R2 = (n) => Math.round(n * 100) / 100;
const near = (a, b, eps = 0.011) => Math.abs(a - b) <= eps;

// Deterministic PRNG (mulberry32) for reproducible random cases
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260910);

console.log('=== PHASE 3: NET → PROFIT / BREAK-EVEN PROOFS (500 random cases) ===');
for (let i = 0; i < 500; i++) {
  const cost = R2(rand() * 100000);
  const qty = R2(1 + rand() * 60);
  const netQ = R2(rand() * 15000);
  const mandi = { market: 'M' + i, farmerNetPerQuintal: netQ, farmerNetTotal: R2(netQ * qty) };
  const e = computeEconomics({ totalProductionCost: cost, quantityQuintals: qty, engineResult: { quantityQuintals: qty, rankedMandis: [mandi] } });
  const m = e.marketEconomics.rankedByProfit[0];
  const costPerQ = cost / qty;
  // P1: profit = net − cost (within rounding)
  check(`P1 profit=net−cost [i=${i}]`, near(m.estimatedProfitPerQuintal, netQ - costPerQ));
  // P2: profitTotal = netTotal − totalCost
  check(`P2 profitTotal=netTotal−totalCost [i=${i}]`, near(m.estimatedProfitTotal, R2((netQ - costPerQ) * qty)));
  // P3: breakEven = totalCost/qty
  check(`P3 breakEven=totalCost/qty [i=${i}]`, near(e.productionEconomics.breakEvenPricePerQuintal, costPerQ));
  // P4: profit status matches sign convention
  const want = m.estimatedProfitPerQuintal > 5 ? 'PROFITABLE' : m.estimatedProfitPerQuintal < -5 ? 'BELOW_BREAK_EVEN' : 'BREAK_EVEN';
  check(`P4 status matches [i=${i}]`, m.profitabilityStatus === want);
  if (fail > 0) break;
}

console.log('\n=== P5: RANKING NEVER REVERSES FROM COST (Phase 9, 300 random cases) ===');
for (let i = 0; i < 300; i++) {
  const cost = R2(rand() * 80000);
  const qty = R2(1 + rand() * 40);
  const mk = (name, net) => ({ market: name, farmerNetPerQuintal: net, farmerNetTotal: R2(net * qty) });
  const mandis = [mk('HIGH', 4000 + rand() * 6000), mk('MID', 2000 + rand() * 1999), mk('LOW', 100 + rand() * 1899)]
    .sort((a, b) => b.farmerNetPerQuintal - a.farmerNetPerQuintal);
  const e = computeEconomics({ totalProductionCost: cost, quantityQuintals: qty, engineResult: { quantityQuintals: qty, rankedMandis: mandis } });
  const ranked = e.marketEconomics.rankedByProfit.map(m => m.market);
  const expected = mandis.map(m => m.market);
  check(`P5 ranking preserved [i=${i}] cost=${cost}`, JSON.stringify(ranked) === JSON.stringify(expected), { got: ranked, want: expected });
  if (fail > 0) break;
}

console.log('\n=== P6: VITA vs MANGAL WEDHA EXPLANATION (equal-cost property) ===');
// With identical production cost ∀ markets, bestProfit MUST equal bestNet.
const mkM = (name, net) => ({ market: name, farmerNetPerQuintal: net, farmerNetTotal: net * 10 });
const engine = { quantityQuintals: 10, rankedMandis: [mkM('APMC Vita', 4898), mkM('APMC Mangal Wedha', 4974.55)] };
const e6 = computeEconomics({ totalProductionCost: 37000, quantityQuintals: 10, engineResult: engine });
check('P6 bestProfit==bestNet when costs equal', e6.marketEconomics.bestProfitMarket.market === e6.marketEconomics.bestNetMarket.market);
check('P6 Mangal Wedha wins on net (higher net ⇒ higher profit)', e6.marketEconomics.bestNetMarket.market === 'APMC Mangal Wedha');

console.log('\n=== PHASE 6: SCENARIO MATHEMATICS ===');
const dist = 25, qty6 = 10, cost6 = 42000;
// selling cost per q at dist=25, qty=10: transport 8*25=200, storage 1*2=2, other 20 → 222
const sc = computeScenario({ hypotheticalPricePerQuintal: 6000, quantityQuintals: qty6, distanceKm: dist, totalProductionCost: cost6 });
const sellQ = sc.outcome.scenarioSellingCosts.totalPerQuintal;
check('S1 scenario net = gross − selling costs', near(sc.outcome.scenarioNetRealization.perQuintal, 6000 - sellQ));
check('S2 scenario profit = net − production cost', near(sc.outcome.scenarioProfit.perQuintal, 6000 - sellQ - cost6 / qty6));
// Break-even: scenario profit must be ~0 at scenarioBreakEvenPrice (no rounding before check)
const beP = cost6 / qty6 + sellQ;
const scBE = computeScenario({ hypotheticalPricePerQuintal: beP, quantityQuintals: qty6, distanceKm: dist, totalProductionCost: cost6 });
check('S3 exact break-even → profit ≈ 0', Math.abs(scBE.outcome.scenarioProfit.perQuintal) < 0.01, scBE.outcome.scenarioProfit.perQuintal);
const scBEq = computeScenario({ hypotheticalPricePerQuintal: scBE.outcome.scenarioBreakEvenPrice, quantityQuintals: qty6, distanceKm: dist, totalProductionCost: cost6 });
check('S3b reported break-even → profit ≈ 0 (API-rounded price)', Math.abs(scBEq.outcome.scenarioProfit.perQuintal) < 0.5, scBEq.outcome.scenarioProfit.perQuintal);
check('S4 below break-even → negative profit not clamped', sc.outcome.scenarioProfit.total >= 0 || sc.outcome.scenarioProfit.total < 0); // trivially true; real check:
const scLow = computeScenario({ hypotheticalPricePerQuintal: 3000, quantityQuintals: qty6, distanceKm: dist, totalProductionCost: cost6 });
check('S4b price 3000 → below break-even status', scLow.outcome.scenarioProfit.status === 'BELOW_BREAK_EVEN' && scLow.outcome.scenarioProfit.total < 0);
check('S5 scenario labelled HYPOTHETICAL, forecast=false', sc.semantics.type === 'HYPOTHETICAL' && sc.semantics.forecast === false && sc.semantics.prediction === false);

console.log('\n=== PHASE 7: STORAGE THRESHOLD ===');
const th = computeStorageThreshold({ currentNetPerQuintal: 4974.55, storageCostPerQuintal: 7, distanceKm: 25, quantityQuintals: 10 });
// Documented rates: transport ₹1.5/q/km small-lot → 1.5×25 = 37.5/q, other = 20/q
check('T1 threshold = currentNet + transport + storage + other', near(th.breakEvenFuturePriceForStorage, 4974.55 + 37.5 + 7 + 20));
check('T2 forecast:false, SCENARIO_THRESHOLD', th.semantics.forecast === false && th.semantics.type === 'SCENARIO_THRESHOLD');
check('T3 no affirmative prediction (only explicit denial allowed)', !/(will (rise|reach|hit|be)|price will|expect(ed)? (price|to))/i.test(th.semantics.statement.replace(/does not predict whether the price will reach it/gi, '')));
// Price AT the threshold → storing exactly ties selling now
const netAtThreshold = th.breakEvenFuturePriceForStorage - 37.5 - 7 - 20; // future net after eventual-sale costs
check('T4 at threshold, stored net == current net', near(netAtThreshold, 4974.55));

console.log('\n=== PHASE 8: TREND MATHEMATICS ===');
// Synthetic fixture: Day1=5000, Day3=5250, Day7=5100
const series = [
  { date: '2026-09-01', modalPrice: 5000 },
  { date: '2026-09-03', modalPrice: 5250 },
  { date: '2026-09-07', modalPrice: 5100 },
];
const t = trendForWindow(series, 7);
check('TR1 first=5000', t.firstObservedPrice === 5000);
check('TR2 latest=5100', t.latestObservedPrice === 5100);
check('TR3 direction UP', t.direction === 'UP');
check('TR4 pct = (5100−5000)/5000 = +2%', t.percentChange === 2);
check('TR5 observationCount=3 (distinct dates only)', t.observationCount === 3);
check('TR6 forecast:false + DERIVED', t.forecast === false && t.classification === 'DERIVED');
// Single observation → INSUFFICIENT_EVIDENCE, never "flat"
const t1 = trendForWindow([{ date: '2026-09-07', modalPrice: 5100 }], 7);
check('TR7 single observation → INSUFFICIENT_EVIDENCE', t1.direction === 'INSUFFICIENT_EVIDENCE' && t1.percentChange === null);
// Zero observations
const t0 = trendForWindow([], 7);
check('TR8 empty → INSUFFICIENT_EVIDENCE', t0.direction === 'INSUFFICIENT_EVIDENCE');
// Duplicate Day 7 ingestion must not change the trend (dedupe by date upstream;
// here we prove trendForWindow is a pure function of distinct dated points)
const duped = [...series, { date: '2026-09-07', modalPrice: 5100 }];
const tDup = trendForWindow(duped, 7);
check('TR9 trend unchanged under duplicate date rows (pure fn)', tDup.percentChange === 2 && tDup.firstObservedPrice === 5000 && tDup.latestObservedPrice === 5100);
// Flat within ±0.5%
const tFlat = trendForWindow([{ date: '2026-09-01', modalPrice: 5000 }, { date: '2026-09-07', modalPrice: 5010 }], 7);
check('TR10 ±0.5% → FLAT (not UP/DOWN)', tFlat.direction === 'FLAT');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);

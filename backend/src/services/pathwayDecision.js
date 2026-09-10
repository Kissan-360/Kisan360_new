// Pathway Decision Engine 2.0 — Sell / Store / Aggregate / Alternate Market
// For a farmer's actual lot, compares realistic pathways based on actual inputs.
// Every number comes from the deterministic calculator or documented assumptions.
// No price forecasting. No fake recommendations.
//
// Architecture:
//   External source → facts
//   Database → stored facts
//   Deterministic engine → calculations
//   Rules → recommendations
//   LLM → explanations (not here — pure rules layer)
//   Human → decision
//
// Decision Hierarchy:
//   1. Feasibility — can the pathway actually be executed?
//   2. Economic result — what is the estimated farmer net?
//   3. Evidence freshness — how current is the data?
//   4. Market evidence — does recent history support this?
//   5. Buyer actionability — is there a compatible buyer?
//   6. Storage economics — does storing create advantage?
//   7. FPO economics — does aggregation create advantage?
//   8. Best supported option — which feasible option is best?

const fs = require('fs');
const path = require('path');
const actionability = require('./actionability');
const { matchQuality, findCompatibleRequirements } = require('./qualityMatch');
const { computeSaleWindow } = require('./saleWindow');
const { summarizeArrivals } = require('./arrivalIntel');

const BUYERS_FILE = path.join(__dirname, '..', 'data', 'buyers.json');
const REQUIREMENTS_FILE = path.join(__dirname, '..', 'data', 'buyerRequirements.json');
const STORAGE_FILE = path.join(__dirname, '..', 'data', 'storageOptions.json');

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Transport cost per the documented assumptions (same as net_realization.py)
const TRANSPORT_RATE_SMALL = 1.5; // ₹/q/km for lots < 40q
const TRANSPORT_RATE_BULK = 0.75; // ₹/q/km for lots >= 40q
const BULK_THRESHOLD = 40; // quintals
const STORAGE_RATE_DEFAULT = 1.0; // ₹/q/day
const OTHER_COSTS_DEFAULT = 20; // ₹/q (bagging 8 + loading 5 + entry 7)

function transportRate(quantityQuintals) {
  return quantityQuintals >= BULK_THRESHOLD ? TRANSPORT_RATE_BULK : TRANSPORT_RATE_SMALL;
}

function transportCostPerQ(distanceKm, quantityQuintals) {
  return Math.round(transportRate(quantityQuintals) * distanceKm * 100) / 100;
}

/**
 * Compute the full pathway decision for a lot.
 * @param {Object} params
 * @param {string} params.crop
 * @param {string} params.district
 * @param {number} params.quantityQuintals
 * @param {Object} params.quality - { grade, size, moisturePct, damagePct }
 * @param {Object} params.engineResult - from net_realization.py (rankedMandis, bestMandi, etc.)
 * @param {Object} params.trendData - { trendSeries, currentQuote, market, arrivalData }
 * @returns {Object} pathway decision with structured trace
 */
function computePathways({ crop, district, quantityQuintals, quality, engineResult, trendData }) {
  const pathways = [];
  const unknowns = [];
  const assumptions = [];
  const decisionTrace = [];

  if (!engineResult || !engineResult.rankedMandis || engineResult.rankedMandis.length === 0) {
    return { pathways: [], unknowns: ['No engine result available'], assumptions: [], error: 'No market data to compute pathways', decisionTrace: [] };
  }

  const bestMandi = engineResult.rankedMandis[0];
  const bestNet = bestMandi.farmerNetPerQuintal;
  const bestNetTotal = bestMandi.farmerNetTotal;
  const bestDistance = bestMandi.distanceKm || 0;

  // Load buyer data
  const buyerData = loadJson(BUYERS_FILE);
  const reqData = loadJson(REQUIREMENTS_FILE);
  const storageData = loadJson(STORAGE_FILE);

  const buyers = buyerData?.buyers || [];
  const requirements = reqData?.requirements || [];
  const storageOptions = storageData?.options || [];

  // ── STEP 1: FEASIBILITY CHECK ──────────────────────────────────────────
  // Assess buyer coverage and quality compatibility
  const coverage = actionability.assessCoverage(engineResult.rankedMandis, buyers, {
    crop, quantityQuintals, qualityGrade: quality?.grade,
  });

  const compatibleReqs = findCompatibleRequirements(requirements, {
    crop, quantityQuintals, grade: quality?.grade, size: quality?.size,
    moisturePct: quality?.moisturePct, damagePct: quality?.damagePct, district,
  });

  const strongReqs = compatibleReqs.filter(r => r.overallCompatibility === 'STRONG');
  const partialReqs = compatibleReqs.filter(r => r.overallCompatibility === 'PARTIAL');

  // Sale window and arrivals
  const saleWindow = trendData
    ? computeSaleWindow(trendData.trendSeries, trendData.currentQuote, { crop, market: trendData.market })
    : null;

  const arrivals = trendData?.arrivalData
    ? summarizeArrivals(trendData.arrivalData, { crop, market: trendData.market })
    : null;

  // Transport planning for sell-now
  const transportPerQ = transportCostPerQ(bestDistance, quantityQuintals);
  const transportTotal = Math.round(transportPerQ * quantityQuintals * 100) / 100;

  // ── FEASIBILITY TRACE ──────────────────────────────────────────────────
  const hasPrice = bestNet > 0;
  const hasDistance = bestDistance > 0;
  const hasBuyerCompat = strongReqs.length > 0 || partialReqs.length > 0;
  const hasSaleWindow = saleWindow && saleWindow.signal !== 'INSUFFICIENT_EVIDENCE';

  decisionTrace.push({
    step: 1, name: 'Feasibility', result: hasPrice ? 'PASS' : 'FAIL', checks: [
      { check: 'Valid price data', pass: hasPrice, detail: hasPrice ? `₹${bestNet}/q at ${bestMandi.market}` : 'No valid price data' },
      { check: 'Distance available', pass: hasDistance, detail: hasDistance ? `${bestDistance} km` : 'No distance data' },
      { check: 'Buyer compatibility', pass: hasBuyerCompat, detail: hasBuyerCompat ? `${strongReqs.length} strong + ${partialReqs.length} partial` : 'No compatible buyers in directory' },
    ],
  });

  // ── PATHWAY A: SELL NOW ─────────────────────────────────────────────────
  pathways.push({
    pathway: 'SELL_NOW',
    label: 'Sell Now',
    description: `Sell ${quantityQuintals}q of ${crop} at ${bestMandi.market} — the economically best mandi after transport and costs.`,
    estimatedNetPerQuintal: bestNet,
    estimatedNetTotal: bestNetTotal,
    mandi: bestMandi.market,
    distanceKm: bestDistance,
    transportPerQuintal: transportPerQ,
    transportTotal,
    transportTier: bestMandi.farmerCosts?.transportTier || 'small_lcv',
    buyerCoverage: {
      status: coverage.summary.allUnmatched ? 'NO_BUYERS_IN_DIRECTORY' : 'BUYERS_AVAILABLE',
      actionableMandis: coverage.summary.actionableCount,
      compatibleRequirements: strongReqs.length,
      totalCompatible: compatibleReqs.length,
    },
    saleWindow,
    arrivals,
    why: [
      `Best estimated net: ₹${bestNet.toLocaleString('en-IN')}/q at ${bestMandi.market}`,
      `Transport: ₹${transportPerQ}/q for ${bestDistance} km`,
      `Buyer coverage: ${coverage.summary.actionableCount} mandi(s) with compatible buyers in directory`,
    ],
    evidence: [
      { type: 'net_realization', source: 'deterministic calculator', mandi: bestMandi.market, net: bestNet },
      { type: 'transport', source: 'documented assumption', rate: transportRate(quantityQuintals), distanceKm: bestDistance },
      { type: 'buyer_coverage', source: 'static demo directory', actionable: coverage.summary.actionableCount },
    ],
    assumptions: [
      'Transport cost uses documented rate (₹1.5/q/km small, ₹0.75/q/km bulk)',
      'Buyer directory is a static demo — production would verify against live buyer profiles',
    ],
  });

  // ── PATHWAY B: STORE THEN SELL ──────────────────────────────────────────
  const storageOptionsForDistrict = storageOptions.filter(s =>
    s.district === district || s.district === bestMandi.market
  );

  if (storageOptionsForDistrict.length > 0) {
    const cheapestStorage = storageOptionsForDistrict.reduce((min, s) =>
      s.costPerQuintalPerDay < min.costPerQuintalPerDay ? s : min
    );
    const storageDays = Math.min(cheapestStorage.maxDurationDays, 7);
    const storageCostPerQ = cheapestStorage.costPerQuintalPerDay * storageDays;
    const storageCostTotal = Math.round(storageCostPerQ * quantityQuintals * 100) / 100;

    const otherCostsPerQ = OTHER_COSTS_DEFAULT;
    const breakevenPrice = Math.round((bestNet + transportPerQ + storageCostPerQ + otherCostsPerQ) * 100) / 100;

    // Evidence: compare breakeven to recent observed price range
    const recentMax = saleWindow?.evidence?.find(e => e.type === 'historical_range')?.observedMax || 0;
    const breakevenReachable = recentMax > 0 && breakevenPrice <= recentMax;

    pathways.push({
      pathway: 'STORE_THEN_SELL',
      label: 'Store Then Sell',
      description: `Store for up to ${storageDays} days at ${cheapestStorage.name}, then sell. The sale price would need to exceed ₹${breakevenPrice.toLocaleString('en-IN')}/q to beat the current estimated net.`,
      storageOption: {
        id: cheapestStorage.id,
        name: cheapestStorage.name,
        type: cheapestStorage.type,
        district: cheapestStorage.district,
        costPerQuintalPerDay: cheapestStorage.costPerQuintalPerDay,
        maxDurationDays: storageDays,
        availability: cheapestStorage.availability,
        label: cheapestStorage.label,
      },
      storageCostPerQuintal: storageCostPerQ,
      storageCostTotal,
      breakevenPricePerQuintal: breakevenPrice,
      currentNetPerQuintal: bestNet,
      advantageNeeded: Math.round((breakevenPrice - bestNet) * 100) / 100,
      breakevenReachable,
      recentMaxObserved: recentMax,
      why: [
        `Storage cost: ₹${storageCostPerQ}/q for ${storageDays} days at ${cheapestStorage.name}`,
        `To outperform selling now, the future sale price needs to exceed ₹${breakevenPrice.toLocaleString('en-IN')}/q`,
        breakevenReachable
          ? `Recent observed prices reached ₹${recentMax.toLocaleString('en-IN')}/q — breakeven is within observed range`
          : `Recent observed prices peaked at ₹${recentMax.toLocaleString('en-IN')}/q — breakeven is above observed range`,
      ],
      evidence: [
        { type: 'storage_cost', source: 'documented assumption', facility: cheapestStorage.name, ratePerDay: cheapestStorage.costPerQuintalPerDay, days: storageDays },
        { type: 'breakeven', source: 'calculated', breakevenPrice, currentNet: bestNet },
        { type: 'historical_range', source: 'observed history', recentMax, breakevenReachable },
      ],
      assumptions: [
        `Storage cost: ₹${cheapestStorage.costPerQuintalPerDay}/q/day (documented assumption)`,
        'Breakeven calculation uses the same transport and other costs as the sell-now pathway',
        'Storage facility availability is demo-assumed — production would verify real-time availability',
        'No future price prediction — breakeven is the economic threshold only',
      ],
    });

    unknowns.push('Actual storage availability and real-time facility status');
    unknowns.push('Whether storage conditions are suitable for this crop');
  } else {
    pathways.push({
      pathway: 'STORE_THEN_SELL',
      label: 'Store Then Sell',
      description: 'Storage option not available in the current demo directory for this district.',
      available: false,
      why: ['No storage facility mapped to this district in the demo data'],
    });
  }

  // ── PATHWAY C: AGGREGATE THROUGH FPO ────────────────────────────────────
  const isBulkTier = quantityQuintals >= BULK_THRESHOLD;
  const pooledQuantity = Math.max(quantityQuintals, BULK_THRESHOLD);
  const pooledTransportPerQ = transportCostPerQ(bestDistance, pooledQuantity);
  const pooledUpliftPerQ = Math.round((transportPerQ - pooledTransportPerQ) * 100) / 100;
  const pooledNet = Math.round((bestNet + pooledUpliftPerQ) * 100) / 100;

  pathways.push({
    pathway: 'AGGREGATE_THROUGH_FPO',
    label: 'Aggregate Through FPO',
    description: isBulkTier
      ? `Your lot of ${quantityQuintals}q already qualifies for bulk transport rates. Pooling with other FPO members for a larger shipment to ${bestMandi.market} can further reduce per-unit logistics costs.`
      : `Pooling your ${quantityQuintals}q with other FPO members into a ${pooledQuantity}q+ shipment would qualify for the full-truck transport rate (₹0.75/q/km vs ₹1.5/q/km), saving approximately ₹${pooledUpliftPerQ}/q on transport to ${bestMandi.market}.`,
    isBulkQualified: isBulkTier,
    bulkThreshold: BULK_THRESHOLD,
    transportSavingPerQuintal: pooledUpliftPerQ,
    transportSavingTotal: Math.round(pooledUpliftPerQ * quantityQuintals * 100) / 100,
    pooledNetPerQuintal: pooledNet,
    pooledNetTotal: Math.round(pooledNet * quantityQuintals * 100) / 100,
    fpoNote: 'Requires coordination with FPO members — same crop, same mandi destination',
    why: isBulkTier
      ? [`Already at bulk tier (${quantityQuintals}q >= ${BULK_THRESHOLD}q)`, 'Pooling with more members can further optimize logistics']
      : [`Pooling to ${pooledQuantity}q+ unlocks bulk rate: ₹0.75/q/km vs ₹1.5/q/km`, `Estimated transport saving: ₹${pooledUpliftPerQ}/q`, `Pooled estimated net: ₹${pooledNet}/q`],
    evidence: [
      { type: 'transport_rate', source: 'documented assumption', smallRate: TRANSPORT_RATE_SMALL, bulkRate: TRANSPORT_RATE_BULK, threshold: BULK_THRESHOLD },
      { type: 'net_realization', source: 'deterministic calculator', mandi: bestMandi.market, net: pooledNet },
    ],
    assumptions: [
      'FPO members must sell the same crop to the same mandi',
      'Pooled quantity is estimated at the bulk threshold — actual uplift depends on real member quantities',
    ],
  });

  // ── PATHWAY D: ALTERNATIVE MARKET ───────────────────────────────────────
  if (coverage.bestActionable && coverage.bestActionable.market !== bestMandi.market) {
    const altMandi = engineResult.rankedMandis.find(m => m.market === coverage.bestActionable.market);
    if (altMandi) {
      const altDistance = altMandi.distanceKm || 0;
      const altTransportPerQ = transportCostPerQ(altDistance, quantityQuintals);
      const altNet = altMandi.farmerNetPerQuintal;

      pathways.push({
        pathway: 'ALTERNATIVE_MARKET',
        label: 'Alternative Market',
        description: `${coverage.bestActionable.market} has ${coverage.bestActionable.buyerCount} compatible buyer(s) in the directory — this is an immediately actionable path even though the economic rank is #${coverage.bestActionable.rank}.`,
        mandi: coverage.bestActionable.market,
        rank: coverage.bestActionable.rank,
        estimatedNetPerQuintal: altNet,
        estimatedNetTotal: altMandi.farmerNetTotal,
        distanceKm: altDistance,
        transportPerQuintal: altTransportPerQ,
        buyerCount: coverage.bestActionable.buyerCount,
        economicCost: coverage.divergence ? coverage.divergence.perQuintal : 0,
        why: [
          `${coverage.bestActionable.market} has ${coverage.bestActionable.buyerCount} compatible buyer(s)`,
          `Estimated net: ₹${altNet.toLocaleString('en-IN')}/q (${coverage.divergence ? `₹${coverage.divergence.perQuintal}/q less than the economic optimum` : 'rank #' + coverage.bestActionable.rank})`,
        ],
        evidence: [
          { type: 'buyer_coverage', source: 'static demo directory', market: coverage.bestActionable.market, buyers: coverage.bestActionable.buyerCount },
          { type: 'net_realization', source: 'deterministic calculator', mandi: coverage.bestActionable.market, net: altNet },
        ],
        assumptions: [
          'Buyer compatibility is based on crop, district, and quantity from the demo directory',
          'This is a statement about the directory — not a claim about real-world buyer demand',
        ],
      });
    }
  }

  // ── RECOMMENDATION ──────────────────────────────────────────────────────
  // Hierarchical decision process. No ML, no score.
  // Every rule is traceable to a specific signal.
  const bestPathway = pathways.find(p => p.pathway === 'SELL_NOW');
  const hasFPOUpside = pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO' && p.transportSavingPerQuintal > 0);
  const hasAltMarket = pathways.find(p => p.pathway === 'ALTERNATIVE_MARKET');
  const storagePathway = pathways.find(p => p.pathway === 'STORE_THEN_SELL' && p.available !== false);

  // Sale window signal
  const saleWindowSignal = saleWindow?.signal || 'INSUFFICIENT_EVIDENCE';
  const saleWindowFreshness = saleWindow?.evidence?.find(e => e.type === 'freshness');
  const freshnessDays = saleWindowFreshness?.daysOld || null;

  // Evidence freshness assessment
  const isFreshQuote = freshnessDays != null && freshnessDays <= 1;
  const isStaleQuote = freshnessDays != null && freshnessDays > 3;

  // FPO saving threshold
  const fpoSavingThreshold = 50;

  // ── DECISION RULES (evaluated in order) ────────────────────────────────

  // Rule 1: FPO aggregation saves significant transport AND the pooled net is economically better
  // Recommend AGGREGATE when: savings > threshold AND not already bulk AND pooled net > direct net
  if (hasFPOUpside && !isBulkTier && hasFPOUpside.transportSavingPerQuintal >= fpoSavingThreshold) {
    const buyerAtBest = strongReqs.length > 0;
    const pooledNetIsBetter = hasFPOUpside.pooledNetPerQuintal > bestNet;
    decisionTrace.push({
      step: 2, name: 'FPO Aggregation', checks: [
        { check: 'Transport saving', pass: true, detail: `₹${hasFPOUpside.transportSavingPerQuintal}/q` },
        { check: 'Not already bulk', pass: !isBulkTier, detail: `${quantityQuintals}q < ${BULK_THRESHOLD}q` },
        { check: 'Pooled net > direct net', pass: pooledNetIsBetter, detail: `Pooled ₹${hasFPOUpside.pooledNetPerQuintal}/q vs direct ₹${bestNet}/q` },
        { check: 'Strong buyer at best mandi', pass: buyerAtBest, detail: buyerAtBest ? `${strongReqs.length} compatible` : 'No strong buyer match' },
      ],
      result: 'AGGREGATE',
      reason: `Pooling lowers transport cost by ₹${hasFPOUpside.transportSavingPerQuintal}/q, improving net from ₹${bestNet}/q to ₹${hasFPOUpside.pooledNetPerQuintal}/q${!buyerAtBest ? ' — no strong buyer at economic best, aggregation may unlock buyer minimums' : ''}`,
    });

    const recommendation = {
      pathway: 'AGGREGATE_THROUGH_FPO',
      why: [
        `Pooling with FPO members could save ₹${hasFPOUpside.transportSavingPerQuintal}/q on transport`,
        `This improves estimated net from ₹${bestNet.toLocaleString('en-IN')}/q to ₹${hasFPOUpside.pooledNetPerQuintal.toLocaleString('en-IN')}/q`,
        `Total lot improvement: approximately ₹${Math.round(hasFPOUpside.transportSavingTotal).toLocaleString('en-IN')}`,
        !buyerAtBest ? 'No strong buyer match at the economic best mandi — aggregation may unlock buyer minimums' : 'Pooling improves logistics economics',
      ],
      confidence: buyerAtBest ? 'GOOD' : 'CAUTION',
      note: 'This is an estimate based on documented transport rates — actual savings depend on real member participation',
    };

    return buildResult(crop, district, quantityQuintals, quality, pathways, recommendation, decisionTrace, unknowns, assumptions, coverage, compatibleReqs, saleWindow, arrivals);
  }

  // Rule 2: Economic best has no buyer, but an alternative does with acceptable cost
  if (hasAltMarket && coverage.divergence && coverage.divergence.perQuintal < 150 && bestPathway?.buyerCoverage?.status === 'NO_BUYERS_IN_DIRECTORY') {
    decisionTrace.push({
      step: 3, name: 'Buyer Actionability', checks: [
        { check: 'No buyer at economic best', pass: true, detail: `${bestMandi.market} has no directory buyer` },
        { check: 'Alternative has buyer', pass: true, detail: `${coverage.bestActionable.market} has ${coverage.bestActionable.buyerCount} buyer(s)` },
        { check: 'Economic cost acceptable', pass: coverage.divergence.perQuintal < 150, detail: `₹${coverage.divergence.perQuintal}/q cost` },
      ],
      result: 'ALTERNATE',
      reason: `A reachable buyer at ₹${coverage.divergence.perQuintal}/q less is more useful than higher net with no buyer`,
    });

    const recommendation = {
      pathway: 'ALTERNATIVE_MARKET',
      why: [
        `${coverage.bestActionable.market} has ${coverage.bestActionable.buyerCount} compatible buyer(s) — the economic best (${bestMandi.market}) has no directory buyer`,
        `Economic cost of choosing the actionable path: only ₹${coverage.divergence.perQuintal}/q`,
        'A reachable buyer at a slightly lower net is more useful than a higher net with no buyer',
      ],
      confidence: 'GOOD',
      note: 'Buyer directory is static demo data — production would verify real buyer availability',
    };

    return buildResult(crop, district, quantityQuintals, quality, pathways, recommendation, decisionTrace, unknowns, assumptions, coverage, compatibleReqs, saleWindow, arrivals);
  }

  // Rule 3: Storage is economically justified when sale window is weak AND breakeven is reachable
  if (saleWindowSignal === 'WEAK_RELATIVE_TO_HISTORY' && storagePathway && storagePathway.breakevenPricePerQuintal) {
    const priceIncreaseNeeded = Math.round((storagePathway.breakevenPricePerQuintal - bestNet) * 100) / 100;
    const breakevenReachable = storagePathway.breakevenReachable;

    // Recommend storage only if: breakeven is reachable AND required increase is reasonable (< 15% of current net)
    if (priceIncreaseNeeded > 0 && priceIncreaseNeeded < bestNet * 0.15 && breakevenReachable) {
      decisionTrace.push({
        step: 4, name: 'Storage Economics', checks: [
          { check: 'Sale window signal', pass: saleWindowSignal === 'WEAK_RELATIVE_TO_HISTORY', detail: saleWindowSignal },
          { check: 'Breakeven reachable from history', pass: breakevenReachable, detail: `Breakeven ₹${storagePathway.breakevenPricePerQuintal}/q ≤ recent max ₹${storagePathway.recentMaxObserved}/q` },
          { check: 'Increase < 15% of net', pass: priceIncreaseNeeded < bestNet * 0.15, detail: `₹${priceIncreaseNeeded}/q needed` },
        ],
        result: 'STORE',
        reason: `Current price is weak relative to recent observations and storage breakeven is within observed range`,
      });

      const recommendation = {
        pathway: 'STORE_THEN_SELL',
        why: [
          `Current price is in the lower range of recent observations — market timing is not favorable`,
          `Storage cost: ₹${storagePathway.storageCostPerQuintal}/q for ${storagePathway.storageOption?.maxDurationDays || 7} days`,
          `Future sale price would need to exceed ₹${storagePathway.breakevenPricePerQuintal.toLocaleString('en-IN')}/q to outperform selling now`,
          `Recent observed prices reached ₹${storagePathway.recentMaxObserved.toLocaleString('en-IN')}/q — breakeven is within observed range`,
        ],
        confidence: 'CAUTION',
        note: 'Sale-window signal is evidence-based (observed history), not a forecast. Storage availability is demo-assumed.',
      };

      return buildResult(crop, district, quantityQuintals, quality, pathways, recommendation, decisionTrace, unknowns, assumptions, coverage, compatibleReqs, saleWindow, arrivals);
    }
  }

  // Rule 4: SELL NOW — baseline when no stronger advantage is established
  const sellReasons = [`Best economic net: ₹${bestNet.toLocaleString('en-IN')}/q at ${bestMandi.market}`];
  if (bestPathway?.buyerCoverage?.status === 'NO_BUYERS_IN_DIRECTORY') {
    sellReasons.push(`No directory buyer at this mandi — check the alternative market pathway`);
  }
  if (saleWindowSignal === 'FAVORABLE_NOW') {
    sellReasons.push('Sale-window signal is favorable — current price is in the upper range of recent observations');
  }
  if (isFreshQuote) {
    sellReasons.push('Quote is fresh (≤1 day old) — evidence is current');
  }
  if (isStaleQuote) {
    sellReasons.push(`Quote is ${freshnessDays} days old — evidence strength is reduced`);
  }

  decisionTrace.push({
    step: 5, name: 'Default: Sell Now', checks: [
      { check: 'Best economic net', pass: true, detail: `₹${bestNet}/q at ${bestMandi.market}` },
      { check: 'Sale window', pass: true, detail: saleWindowSignal },
      { check: 'Freshness', pass: true, detail: freshnessDays != null ? `${freshnessDays} days old` : 'unknown' },
    ],
    result: 'SELL_NOW',
    reason: 'No stronger advantage from storage, aggregation, or alternative market',
  });

  // Confidence assessment
  let confidence = 'LIMITED';
  const confidenceSignals = [];
  if (isFreshQuote) confidenceSignals.push('fresh quote');
  if (hasPrice) confidenceSignals.push('valid price');
  if (hasBuyerCompat) confidenceSignals.push('buyer compatibility');
  if (saleWindowSignal === 'FAVORABLE_NOW') confidenceSignals.push('favorable timing');
  if (saleWindowSignal === 'NEUTRAL') confidenceSignals.push('neutral timing');

  if (confidenceSignals.length >= 3 && !isStaleQuote) confidence = 'STRONG';
  else if (confidenceSignals.length >= 2) confidence = 'GOOD';
  else if (confidenceSignals.length >= 1) confidence = 'CAUTION';

  const recommendation = {
    pathway: 'SELL_NOW',
    why: sellReasons,
    confidence,
  };

  return buildResult(crop, district, quantityQuintals, quality, pathways, recommendation, decisionTrace, unknowns, assumptions, coverage, compatibleReqs, saleWindow, arrivals);
}

/**
 * Build the final result object with all decision intelligence.
 */
function buildResult(crop, district, quantityQuintals, quality, pathways, recommendation, decisionTrace, unknowns, assumptions, coverage, compatibleReqs, saleWindow, arrivals) {
  const bestMandi = pathways.find(p => p.pathway === 'SELL_NOW');
  const hasFPOUpside = pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
  const storagePathway = pathways.find(p => p.pathway === 'STORE_THEN_SELL' && p.available !== false);

  // Add recommendation trace
  recommendation.evaluatedRules = decisionTrace.map(t => ({
    step: t.step,
    name: t.name,
    result: t.result || 'ASSESS',
    reason: t.reason,
    checks: t.checks,
  }));

  // ── ECONOMIC BEST vs RECOMMENDED ACTION ──────────────────────────────
  // Make the distinction explicit so callers can see when the recommended
  // action differs from the raw economic winner.
  const economicBestMarket = bestMandi?.mandi;
  const economicBestNetPerQ = bestMandi?.estimatedNetPerQuintal;
  const economicBestNetTotal = bestMandi?.estimatedNetTotal;

  let recommendedMarket = bestMandi?.mandi;
  let reasonForDifference = null;

  if (recommendation.pathway === 'AGGREGATE_THROUGH_FPO' && hasFPOUpside) {
    recommendedMarket = bestMandi?.mandi; // same mandi, but pooled economics
    reasonForDifference = `Pooling with FPO to bulk rate improves net by ₹${hasFPOUpside.transportSavingPerQuintal}/q — same destination, better logistics economics`;
  } else if (recommendation.pathway === 'ALTERNATIVE_MARKET' && coverage.bestActionable) {
    recommendedMarket = coverage.bestActionable.market;
    reasonForDifference = `Economic best (${bestMandi?.market}) has no directory buyer — ${coverage.bestActionable.market} has ${coverage.bestActionable.buyerCount} compatible buyer(s) at ₹${coverage.divergence?.perQuintal || 0}/q less net`;
  } else if (recommendation.pathway === 'STORE_THEN_SELL') {
    reasonForDifference = `Current sale-window signal is weak — storage may allow selling when timing improves, if recent observed prices reach the breakeven threshold`;
  }

  const economicSummary = {
    bestMarket: economicBestMarket,
    bestNetPerQuintal: economicBestNetPerQ,
    bestNetTotal: economicBestNetTotal,
    recommendedPathway: recommendation.pathway,
    recommendedMarket,
    reasonForDifference,
  };

  // Outcome measurement foundation
  const outcome = {
    referenceMarket: bestMandi?.mandi,
    referenceNetPerQuintal: bestMandi?.estimatedNetPerQuintal,
    referenceNetTotal: bestMandi?.estimatedNetTotal,
    transportDifference: null,
    pooledVsIndividualDifference: hasFPOUpside?.transportSavingTotal || null,
    compatibleBuyerOptions: compatibleReqs.length,
    pathwaysAvailable: pathways.filter(p => p.available !== false).length,
    note: 'These are estimated advantages of each pathway — not realized outcomes unless the underlying transaction is completed',
  };

  return {
    crop,
    district,
    quantityQuintals,
    quality,
    pathways,
    recommendation,
    economicSummary,
    outcome,
    decisionTrace,
    unknowns,
    assumptions: [
      'All costs use documented assumptions (see /assumptions)',
      'Buyer directory is a static demo dataset',
      'No price forecasting — all signals describe the present or recent past',
      ...assumptions,
    ],
    dataBasis: {
      marketPrices: 'AGMARKNET (live or cached)',
      transportCosts: 'Documented assumption (₹1.5/q/km small, ₹0.75/q/km bulk)',
      storageCosts: 'Documented assumption (₹1/q/day)',
      buyerDirectory: 'Static demo dataset (labeled)',
      buyerRequirements: 'Static demo dataset (labeled)',
      storageOptions: 'Static demo dataset (labeled)',
      saleWindow: saleWindow ? 'Observed historical price range' : 'No history available',
      arrivals: arrivals?.available ? 'Observed arrival counts' : 'No arrival data',
    },
  };
}

module.exports = {
  computePathways,
  transportRate,
  transportCostPerQ,
  BULK_THRESHOLD,
  TRANSPORT_RATE_SMALL,
  TRANSPORT_RATE_BULK,
  STORAGE_RATE_DEFAULT,
  OTHER_COSTS_DEFAULT,
};

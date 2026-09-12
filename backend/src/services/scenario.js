// Scenario Simulator — deterministic "what-if" economics.
//
// SEMANTICS (hard contract):
//   A scenario is a HYPOTHETICAL the farmer chooses. It is never labeled a
//   prediction or forecast, and the system never claims a future price will
//   happen. The engine reuses the SAME selling-cost logic as net realization
//   (transport + storage + other, per the documented rates) so a scenario is
//   an honest arithmetic restatement, not a parallel model.

const {
  transportRate, transportCostPerQ, BULK_THRESHOLD, OTHER_COSTS_DEFAULT,
} = require('./pathwayDecision');

const STORAGE_RATE_PER_DAY = 1.0; // documented assumption, same as calculator
const STORAGE_DAYS_DEFAULT = 2;   // calculator default holding period

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Numeric parsing for scenario overrides: numbers or numeric strings only,
// finite, and subject to per-field positivity rules enforced by callers.
function parseScenarioNumber(value) {
  if (value === null || value === undefined || value === '') return { ok: false, reason: 'missing' };
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return { ok: false, reason: 'not_a_number' };
  return { ok: true, value: n };
}

/**
 * Compute a hypothetical scenario outcome.
 * @param {Object} params
 * @param {number} params.hypotheticalPricePerQuintal - "what if price were ₹X/q" (required, > 0)
 * @param {number} params.quantityQuintals - current quantity (> 0)
 * @param {number} params.distanceKm - distance to the reference market (≥ 0)
 * @param {number} params.totalProductionCost - farmer-entered production cost (≥ 0)
 * @param {number} [params.scenarioQuantity] - optional hypothetical quantity (same transport tier logic applies)
 * @param {number} [params.scenarioTotalProductionCost] - optional cost override
 */
function computeScenario({
  hypotheticalPricePerQuintal,
  quantityQuintals,
  distanceKm,
  totalProductionCost,
  scenarioQuantity,
  scenarioTotalProductionCost,
  referenceNetPerQuintal,
}) {
  // ── validation ──────────────────────────────────────────────────────────
  const price = parseScenarioNumber(hypotheticalPricePerQuintal);
  if (!price.ok) return { ok: false, error: `hypotheticalPricePerQuintal: ${price.reason}` };
  if (price.value <= 0) return { ok: false, error: 'hypotheticalPricePerQuintal must be positive' };
  if (price.value > 500000) return { ok: false, error: 'hypotheticalPricePerQuintal exceeds plausible mandi range' };

  const qty = parseScenarioNumber(quantityQuintals);
  if (!qty.ok || qty.value <= 0) return { ok: false, error: 'quantityQuintals must be a positive number' };

  const dist = parseScenarioNumber(distanceKm);
  if (!dist.ok || dist.value < 0) return { ok: false, error: 'distanceKm must be a non-negative number' };

  const cost = parseScenarioNumber(totalProductionCost);
  if (!cost.ok || cost.value < 0) return { ok: false, error: 'totalProductionCost must be a non-negative number' };

  // Optional overrides
  let effQty = qty.value;
  if (scenarioQuantity !== undefined && scenarioQuantity !== null && scenarioQuantity !== '') {
    const sq = parseScenarioNumber(scenarioQuantity);
    if (!sq.ok || sq.value <= 0) return { ok: false, error: 'scenarioQuantity must be a positive number' };
    effQty = sq.value;
  }
  let effCost = cost.value;
  if (scenarioTotalProductionCost !== undefined && scenarioTotalProductionCost !== null && scenarioTotalProductionCost !== '') {
    const sc = parseScenarioNumber(scenarioTotalProductionCost);
    if (!sc.ok || sc.value < 0) return { ok: false, error: 'scenarioTotalProductionCost must be a non-negative number' };
    effCost = sc.value;
  }

  // ── selling costs: SAME documented assumptions as net realization ───────
  // Transport tier follows the SCENARIO quantity (bulk rate ≥ 40q), matching
  // how the calculator would treat that lot.
  const transportPerQ = transportCostPerQ(dist.value, effQty);
  const transportTotal = round2(transportPerQ * effQty);
  const storagePerQ = round2(STORAGE_RATE_PER_DAY * STORAGE_DAYS_DEFAULT);
  const storageTotal = round2(storagePerQ * effQty);
  const otherPerQ = OTHER_COSTS_DEFAULT;
  const otherTotal = round2(otherPerQ * effQty);
  const sellingCostsPerQ = round2(transportPerQ + storagePerQ + otherPerQ);
  const sellingCostsTotal = round2(transportTotal + storageTotal + otherTotal);

  // ── scenario economics ──────────────────────────────────────────────────
  const scenarioGrossRevenue = round2(price.value * effQty);
  const scenarioNetRealizationTotal = round2(scenarioGrossRevenue - sellingCostsTotal);
  const scenarioNetPerQuintal = round2(scenarioNetRealizationTotal / effQty);
  const scenarioProductionCost = round2(effCost);
  const scenarioProductionCostPerQ = round2(effCost / effQty);
  const scenarioProfit = round2(scenarioNetRealizationTotal - scenarioProductionCost);
  const scenarioProfitPerQuintal = round2(scenarioProfit / effQty);
  // Scenario break-even: the price at which scenario PROFIT = 0. Unlike the
  // production-only break-even (totalProductionCost / quantity), a scenario
  // price must also cover the selling costs (transport/storage/other),
  // otherwise the "break-even" price would still lose money on selling costs.
  const scenarioBreakEvenPrice = round2(effCost / effQty + sellingCostsPerQ);
  const differenceVsBreakEven = round2(price.value - scenarioBreakEvenPrice);

  return {
    ok: true,
    scenario: {
      hypotheticalPricePerQuintal: price.value,
      scenarioQuantity: effQty,
      scenarioTotalProductionCost: scenarioProductionCost,
      distanceKm: dist.value,
    },
    outcome: {
      scenarioGrossRevenue,
      scenarioSellingCosts: {
        transportPerQuintal: transportPerQ,
        transportTotal,
        storagePerQuintal: storagePerQ,
        storageTotal,
        otherPerQuintal: otherPerQ,
        otherTotal,
        totalPerQuintal: sellingCostsPerQ,
        total: sellingCostsTotal,
      },
      scenarioNetRealization: {
        perQuintal: scenarioNetPerQuintal,
        total: scenarioNetRealizationTotal,
      },
      scenarioProductionCost: {
        total: scenarioProductionCost,
        perQuintal: scenarioProductionCostPerQ,
      },
      scenarioProfit: {
        total: scenarioProfit,
        perQuintal: scenarioProfitPerQuintal,
        status: scenarioProfitPerQuintal > 5 ? 'PROFITABLE'
          : scenarioProfitPerQuintal < -5 ? 'BELOW_BREAK_EVEN' : 'BREAK_EVEN',
      },
      scenarioBreakEvenPrice,
      differenceVsBreakEven,
      // Hypothetical-vs-observed delta: how the HYPOTHETICAL net compares with
      // the LATEST OBSERVED net for the reference market, when provided.
      // Both legs are labeled — never presented as an expectation.
      ...(referenceNetPerQuintal !== undefined ? {
        differenceVsCurrentObservedNet: round2(scenarioNetPerQuintal - referenceNetPerQuintal),
        referenceNetPerQuintal,
        referenceNote: 'Compared against the latest observed farmer net for the reference market. The scenario price itself is hypothetical, not an expectation.',
      } : {}),
    },
    semantics: {
      type: 'HYPOTHETICAL',
      classification: 'DERIVED',
      forecast: false,
      prediction: false,
      breakEvenNote:
        'scenarioBreakEvenPrice includes selling costs (production cost/q + transport + storage + other per q) — the price at which scenario profit is exactly zero. The production-only break-even (totalProductionCost / quantity) is reported by the /economics endpoint.',
      statement:
        `If the selling price were ₹${price.value.toLocaleString('en-IN')}/q for ${effQty}q at ${dist.value} km, ` +
        `estimated profit would be ₹${scenarioProfit.toLocaleString('en-IN')} (${scenarioProfitPerQuintal < 0 ? 'a loss' : 'profit'} of ₹${Math.abs(scenarioProfitPerQuintal).toLocaleString('en-IN')}/q). ` +
        'This is a hypothetical calculation, not a prediction of what the price will be.',
      sellingCostBasis:
        `Documented assumptions: transport ₹${transportRate(effQty)}/q/km (tier: ${effQty >= BULK_THRESHOLD ? 'bulk' : 'small lot'}), ` +
        `storage ₹${STORAGE_RATE_PER_DAY}/q/day × ${STORAGE_DAYS_DEFAULT}d, other ₹${OTHER_COSTS_DEFAULT}/q (bagging/loading/entry).`,
    },
  };
}

/**
 * Storage break-even threshold: the future net selling price (₹/q) above which
 * storing then selling outperforms selling now. A threshold, NOT a forecast —
 * the system never claims the price will reach it.
 * @param {Object} params - { currentNetPerQuintal, storageCostPerQuintal, distanceKm, quantityQuintals }
 *   currentNetPerQuintal: what selling now nets (from the calculator).
 *   Storing costs storage + the same selling costs later; the future price must
 *   cover: current net + storage + the costs of the eventual sale.
 */
function computeStorageThreshold({ currentNetPerQuintal, storageCostPerQuintal, distanceKm, quantityQuintals }) {
  const net = parseScenarioNumber(currentNetPerQuintal);
  if (!net.ok) return { ok: false, error: `currentNetPerQuintal: ${net.reason}` };
  const st = parseScenarioNumber(storageCostPerQuintal);
  if (!st.ok || st.value < 0) return { ok: false, error: `storageCostPerQuintal: ${st.reason}` };
  const dist = parseScenarioNumber(distanceKm);
  if (!dist.ok || dist.value < 0) return { ok: false, error: `distanceKm: ${dist.reason}` };
  const qty = parseScenarioNumber(quantityQuintals);
  if (!qty.ok || qty.value <= 0) return { ok: false, error: `quantityQuintals: ${qty.reason}` };

  // Eventual-sale costs (same documented rates as selling now)
  const transportPerQ = transportCostPerQ(dist.value, qty.value);
  const otherPerQ = OTHER_COSTS_DEFAULT;
  // Future price P nets: P − transport − storage − other. Storing beats
  // selling now when that exceeds currentNet:
  //   P − t − s − o > currentNet  →  P > currentNet + t + s + o
  const breakEvenFuturePrice = round2(net.value + transportPerQ + st.value + otherPerQ);
  return {
    ok: true,
    breakEvenFuturePriceForStorage: breakEvenFuturePrice,
    components: {
      currentNetPerQuintal: net.value,
      transportPerQuintal: transportPerQ,
      storageCostPerQuintal: st.value,
      otherPerQuintal: otherPerQ,
    },
    semantics: {
      type: 'SCENARIO_THRESHOLD',
      classification: 'DERIVED',
      forecast: false,
      statement:
        `Future net price needs to exceed approximately ₹${breakEvenFuturePrice.toLocaleString('en-IN')}/q ` +
        `for this storage scenario to outperform selling now, based on current assumptions. ` +
        'This is a threshold, not a forecast — Kisan360 does not predict whether the price will reach it.',
    },
  };
}

module.exports = {
  computeScenario,
  computeStorageThreshold,
  parseScenarioNumber,
  STORAGE_RATE_PER_DAY,
  STORAGE_DAYS_DEFAULT,
};

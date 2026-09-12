// Farmer Economics — deterministic production-cost → break-even → profit layer.
//
// Truth model:
//   FARMER_ENTERED  — cost amounts the farmer reports. A fact about what the
//                     farmer said, NOT an independently verified fact.
//   DERIVED         — everything computed here from those inputs.
//
// This module never predicts prices, never injects benchmark costs, and never
// recalculates transport or net realization — those come from the calculator
// (ml-service/net_realization.py), the single source of truth.

// ── Cost categories ────────────────────────────────────────────────────────
// Keys are canonical; the API accepts these exact fields. Amounts are TOTAL
// rupees for the whole lot (the farmer's own unit of account) — per-quintal
// values are derived, never re-multiplied from an assumed area or yield.
const COST_CATEGORIES = [
  'seed',
  'fertilizer',
  'cropProtection',
  'labour',
  'irrigation',
  'machinery',
  'landRent',
  'other',
];

// Numeric parsing that tolerates string numbers ("4500") but rejects
// non-finite values (NaN/Infinity), negatives, and booleans-as-numbers.
function parseAmount(value) {
  if (value === null || value === undefined || value === '') return { ok: false, reason: 'missing' };
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return { ok: false, reason: 'not_a_number' };
  if (n < 0) return { ok: false, reason: 'negative' };
  return { ok: true, value: n };
}

/**
 * Validate + total a farmer-entered cost breakdown.
 * @param {Object} costs - { seed, fertilizer, ... } TOTAL rupees per category
 * @returns {{ ok, errors: string[], breakdown: Object, totalProductionCost: number }}
 *   On ok=false, errors lists every offending category with the reason.
 */
function parseProductionCosts(costs) {
  const errors = [];
  const breakdown = {};
  let total = 0;
  const input = costs && typeof costs === 'object' && !Array.isArray(costs) ? costs : {};
  for (const cat of COST_CATEGORIES) {
    const v = input[cat];
    if (v === undefined || v === null || v === '') { breakdown[cat] = 0; continue; } // optional
    const parsed = parseAmount(v);
    if (!parsed.ok) {
      errors.push(`${cat}: ${parsed.reason}`);
      continue;
    }
    breakdown[cat] = parsed.value;
    total += parsed.value;
  }
  // Reject unknown keys silently present in input? No — surface them so the
  // caller knows their spelling was ignored, but don't fail the request.
  const unknown = Object.keys(input).filter(k => !COST_CATEGORIES.includes(k));
  for (const k of unknown) errors.push(`${k}: unknown_cost_category`);
  return { ok: errors.length === 0, errors, breakdown, totalProductionCost: Math.round(total * 100) / 100 };
}

/**
 * Per-quintal production cost and break-even price.
 * breakEvenPricePerQuintal === productionCostPerQuintal by definition —
 * the price needed per quintal just to cover what the crop cost to produce.
 * @param {number} totalProductionCost - total rupees
 * @param {number} quantityQuintals - expected sale quantity, > 0
 */
function computeBreakEven(totalProductionCost, quantityQuintals) {
  if (!Number.isFinite(totalProductionCost) || totalProductionCost < 0) {
    return { ok: false, reason: 'invalid_total_cost' };
  }
  if (!Number.isFinite(quantityQuintals) || quantityQuintals <= 0) {
    return { ok: false, reason: 'invalid_quantity' };
  }
  const perQ = totalProductionCost / quantityQuintals; // unrounded internally
  return {
    ok: true,
    productionCostPerQuintal: perQ,
    breakEvenPricePerQuintal: perQ,
  };
}

// Profitability status tolerance: ₹5/q. Below this, a computed profit is
// indistinguishable from zero given mandi price granularity (~₹5 steps), so
// calling it PROFITABLE or BELOW_BREAK_EVEN would be false precision.
// Centralized and documented per project convention.
const BREAK_EVEN_TOLERANCE_PER_Q = 5;

/**
 * Profitability status — deterministic, no confidence percentages.
 * @param {number} estimatedProfitPerQuintal - farmerNetPerQ - productionCostPerQ
 */
function profitabilityStatus(estimatedProfitPerQuintal) {
  if (!Number.isFinite(estimatedProfitPerQuintal)) return 'INSUFFICIENT_EVIDENCE';
  if (estimatedProfitPerQuintal > BREAK_EVEN_TOLERANCE_PER_Q) return 'PROFITABLE';
  if (estimatedProfitPerQuintal < -BREAK_EVEN_TOLERANCE_PER_Q) return 'BELOW_BREAK_EVEN';
  return 'BREAK_EVEN';
}

/**
 * Attach economics to ONE ranked mandi (from the calculator's rankedMandis[]).
 * Does NOT recalculate the mandi's net — consumes it as given.
 *
 * Calculator row contract (net_realization.py):
 *   { market, grossPricePerQuintal, farmerNetPerQuintal, farmerNetTotal, ... }
 * (legacy/mock rows with `modalPrice` are tolerated)
 *
 * @param {Object} mandi - rankedMandis[] row
 * @param {Object} econ - { productionCostPerQuintal }
 * @param {number} quantityQuintals - lot quantity (lives at engine level)
 * @returns Object with net, profit, break-even comparison and status.
 */
function applyToMandi(mandi, econ, quantityQuintals) {
  if (!mandi || !Number.isFinite(mandi.farmerNetPerQuintal)) return null;
  const netPerQ = mandi.farmerNetPerQuintal;
  const grossPerQ = Number.isFinite(mandi.grossPricePerQuintal) ? mandi.grossPricePerQuintal : mandi.modalPrice;
  const qty = Number.isFinite(quantityQuintals) ? quantityQuintals : mandi.quantityQuintals;
  const profitPerQ = Math.round((netPerQ - econ.productionCostPerQuintal) * 100) / 100;
  const netTotal = Number.isFinite(mandi.farmerNetTotal)
    ? mandi.farmerNetTotal
    : Math.round(netPerQ * (qty || 0) * 100) / 100;
  // Identity-preserving: profitTotal is derived from netTotal − totalCost
  // (not profitPerQ × qty) so the audit identity
  //   estimatedProfitTotal === farmerNetTotal − totalProductionCost
  // holds exactly at 2-dp currency precision.
  const totalCost = Math.round(econ.productionCostPerQuintal * (qty || 0) * 100) / 100;
  return {
    market: mandi.market,
    grossPricePerQuintal: grossPerQ,
    farmerNetPerQuintal: netPerQ,
    farmerNetTotal: netTotal,
    estimatedProfitPerQuintal: profitPerQ,
    estimatedProfitTotal: Math.round((netTotal - totalCost) * 100) / 100,
    profitVsBreakEvenPerQuintal: profitPerQ,
    profitabilityStatus: profitabilityStatus(profitPerQ),
    classification: 'DERIVED',
    note: 'Estimated profit = estimated farmer net realization − farmer-entered production cost. Net realization ≠ profit.',
  };
}

/**
 * Build the complete economics layer over a calculator engine result.
 * @param {Object} params
 * @param {number} params.totalProductionCost
 * @param {number} params.quantityQuintals
 * @param {Object} params.engineResult - calculator output with rankedMandis[]
 * @returns {{ ok, error?, input?, productionEconomics?, marketEconomics? }}
 */
function computeEconomics({ totalProductionCost, quantityQuintals, engineResult }) {
  if (!engineResult || !Array.isArray(engineResult.rankedMandis) || engineResult.rankedMandis.length === 0) {
    return { ok: false, error: 'No ranked market data available to compute economics' };
  }
  const be = computeBreakEven(totalProductionCost, quantityQuintals);
  if (!be.ok) return { ok: false, error: `Cannot compute break-even: ${be.reason}` };

  // Quantity lives at the engine-result level (calculator contract).
  const lotQty = Number.isFinite(engineResult.quantityQuintals) ? engineResult.quantityQuintals : quantityQuintals;
  const mandis = engineResult.rankedMandis
    .map(m => applyToMandi(m, { totalProductionCost, productionCostPerQuintal: be.productionCostPerQuintal }, lotQty))
    .filter(Boolean);

  if (mandis.length === 0) {
    return { ok: false, error: 'No valid market rows with computable net realization' };
  }

  // Defensive deterministic ordering: bestNet/bestProfit are COMPUTED, not
  // taken from input order. With a single lot-level production cost (always
  // true here), profit order ≡ net order; ties broken by market name so the
  // output is reproducible regardless of engine row order.
  mandis.sort((a, b) =>
    (b.farmerNetPerQuintal - a.farmerNetPerQuintal) ||
    String(a.market).localeCompare(String(b.market))
  );

  const bestNet = mandis[0];
  const bestProfit = mandis.reduce((b, m) => (m.estimatedProfitPerQuintal > b.estimatedProfitPerQuintal ? m : b), mandis[0]);

  return {
    ok: true,
    input: {
      totalProductionCost: Math.round(totalProductionCost * 100) / 100,
      quantityQuintals,
      costBasis: 'TOTAL_LOT',
      classification: 'FARMER_ENTERED',
    },
    productionEconomics: {
      totalProductionCost: Math.round(totalProductionCost * 100) / 100,
      productionCostPerQuintal: Math.round(be.productionCostPerQuintal * 100) / 100,
      breakEvenPricePerQuintal: Math.round(be.breakEvenPricePerQuintal * 100) / 100,
      classification: 'DERIVED',
      formula: 'productionCostPerQ = totalProductionCost / quantityQuintals; breakEvenPricePerQ = productionCostPerQ',
    },
    marketEconomics: {
      bestNetMarket: {
        market: bestNet.market,
        grossPricePerQuintal: bestNet.grossPricePerQuintal,
        farmerNetPerQuintal: bestNet.farmerNetPerQuintal,
        estimatedProfitPerQuintal: bestNet.estimatedProfitPerQuintal,
        estimatedProfitTotal: bestNet.estimatedProfitTotal,
        profitabilityStatus: bestNet.profitabilityStatus,
      },
      bestProfitMarket: {
        market: bestProfit.market,
        grossPricePerQuintal: bestProfit.grossPricePerQuintal,
        farmerNetPerQuintal: bestProfit.farmerNetPerQuintal,
        estimatedProfitPerQuintal: bestProfit.estimatedProfitPerQuintal,
        estimatedProfitTotal: bestProfit.estimatedProfitTotal,
        profitabilityStatus: bestProfit.profitabilityStatus,
      },
      rankedByProfit: mandis,
    },
    provenance: {
      marketPrices: 'AGMARKNET observed (FACT)',
      netRealization: 'Deterministic calculator (DERIVED)',
      productionCost: 'Farmer-entered (FARMER_ENTERED — reported, not verified)',
      breakEven: 'Derived (DERIVED)',
      profit: 'Derived (DERIVED)',
      forecast: false,
    },
  };
}

module.exports = {
  COST_CATEGORIES,
  BREAK_EVEN_TOLERANCE_PER_Q,
  parseAmount,
  parseProductionCosts,
  computeBreakEven,
  profitabilityStatus,
  applyToMandi,
  computeEconomics,
};

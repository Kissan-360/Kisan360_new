// Actionability (market-linkage layer): which of the engine's costed mandis
// have a compatible buyer path in the current directory? Pure deterministic
// rules over the buyer directory's own fields — crops, districts (service
// area), minQuantityQuintals. No demand prediction, no liquidity scores, no
// probability of sale. Coverage is an honest statement about the CURRENT
// Kisan360 directory, not a claim about real-world demand.

const MARKET_TO_DISTRICT = {
  // Canonical mandi → the district its buyers operate around. One mandi may
  // serve multiple districts (e.g. Lasalgaon sits in Nashik district's orbit).
  'Nashik': ['Nashik'],
  'Lasalgaon': ['Nashik'],
  'Pune': ['Pune'],
  'Mumbai': ['Mumbai', 'Pune'],
  'Nagpur': ['Nagpur'],
  'Amravati': ['Amravati'],
  'Akola': ['Akola'],
  'Aurangabad': ['Aurangabad'],
  'Jalgaon': ['Jalgaon'],
  'Kolhapur': ['Kolhapur'],
  'Latur': ['Latur'],
  'Solapur': ['Solapur'],
  'Ahmednagar': ['Ahmednagar'],
  'Satara': ['Satara'],
};

// Canonical mandi → market-city district(s) used by the calculator's distance
// table. Used only when a mandi has no explicit coverage mapping above.
const MANDI_HOME = {
  'Nashik': 'Nashik', 'Lasalgaon': 'Nashik', 'Pune': 'Pune', 'Mumbai': 'Mumbai',
  'Nagpur': 'Nagpur', 'Amravati': 'Amravati', 'Akola': 'Akola', 'Aurangabad': 'Aurangabad',
  'Jalgaon': 'Jalgaon', 'Kolhapur': 'Kolhapur', 'Latur': 'Latur', 'Solapur': 'Solapur',
  'Ahmednagar': 'Ahmednagar', 'Satara': 'Satara',
};

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

// District(s) whose buyers are considered to cover a mandi.
function districtsForMandi(canonicalMandi) {
  if (canonicalMandi && MARKET_TO_DISTRICT[canonicalMandi]) return MARKET_TO_DISTRICT[canonicalMandi];
  if (canonicalMandi && MANDI_HOME[canonicalMandi]) return [MANDI_HOME[canonicalMandi]];
  return null; // unknown mandi → coverage UNKNOWN, never claimed
}

// Deterministic compatibility. Every rule maps to a buyer-directory field.
function buyerCompatible(buyer, { crop, quantityQuintals, qualityGrade, mandiDistricts }) {
  const reasons = [];
  const blockers = [];

  if (!mandiDistricts) {
    return { compatible: false, reasons, blockers: ['mandi outside mapped buyer service area'] };
  }
  const cropOK = buyer.crops.some(c => norm(c) === norm(crop));
  const districtOK = buyer.districts.some(d => mandiDistricts.map(norm).includes(norm(d)));
  const qtyOK = Number(buyer.minQuantityQuintals) <= Number(quantityQuintals);

  if (cropOK) reasons.push(`buys ${crop}`);
  else blockers.push(`does not list ${crop}`);

  if (districtOK) reasons.push(`serves ${mandiDistricts.join('/')}`);
  else blockers.push(`service area: ${buyer.districts.join(', ')}`);

  if (qtyOK) reasons.push(`accepts ${buyer.minQuantityQuintals} q+`);
  else blockers.push(`needs ${buyer.minQuantityQuintals} q minimum`);

  if (qualityGrade && qualityGrade !== 'Unassessed') {
    // The directory carries no quality requirements yet — an ungraded or
    // graded lot is not blocked by any rule. Stated honestly rather than inferred.
    reasons.push(`no quality restriction listed`);
  }

  return { compatible: cropOK && districtOK && qtyOK, reasons, blockers };
}

/**
 * Attach buyer-coverage to the engine's ranked mandis.
 * @param rankedMandis  engine rankedMandis (needs canonicalMandi; falls back to raw market name)
 * @param buyers        raw directory rows (crops, districts, minQuantityQuintals)
 * @param lot           { crop, quantityQuintals, qualityGrade }
 * @returns { coverage: {market → {status, buyers[]}}, summary, bestEconomic, bestActionable }
 */
function assessCoverage(rankedMandis, buyers, lot) {
  const coverage = {};
  for (const m of rankedMandis || []) {
    const canon = m.canonicalMandi || m.market;
    const districts = districtsForMandi(canon);
    const matched = [];
    const nearMisses = [];
    if (!districts) {
      coverage[m.market] = { status: 'UNKNOWN', districts: null, buyers: [], note: 'Mandi not in the buyer-coverage map — coverage unknown, not claimed.' };
      continue;
    }
    for (const b of buyers || []) {
      const r = buyerCompatible(b, { crop: lot.crop, quantityQuintals: lot.quantityQuintals, qualityGrade: lot.qualityGrade, mandiDistricts: districts });
      if (r.compatible) matched.push({ id: b.id, name: b.name, trustTier: b.trustTier, minQuantityQuintals: b.minQuantityQuintals, matchReasons: r.reasons });
      else if (r.blockers.length === 1) nearMisses.push({ id: b.id, name: b.name, blocker: r.blockers[0] });
    }
    coverage[m.market] = {
      status: matched.length > 0 ? 'ACTIONABLE' : 'NO_MATCH',
      districts,
      buyers: matched,
      nearMisses: nearMisses.slice(0, 3),
    };
  }

  const entries = Object.entries(coverage);
  const withBuyers = entries.filter(([, v]) => v.status === 'ACTIONABLE');
  const summary = {
    actionableCount: withBuyers.length,
    totalRanked: entries.length,
    allUnmatched: entries.length > 0 && withBuyers.length === 0,
  };

  // Economic best = rank 1 (never reordered). Actionable best = highest-ranked
  // mandi with ≥1 compatible buyer. Both are REPORTED; the human chooses.
  const bestEconomic = rankedMandis?.[0] || null;
  const firstActionableRow = (rankedMandis || []).find(m => coverage[m.market]?.status === 'ACTIONABLE');
  const bestActionable = firstActionableRow
    ? {
        market: firstActionableRow.market,
        rank: firstActionableRow.rank,
        netPerQuintal: firstActionableRow.farmerNetPerQuintal,
        netTotal: firstActionableRow.farmerNetTotal,
        buyerCount: coverage[firstActionableRow.market].buyers.length,
      }
    : null;

  const econNet = bestEconomic ? bestEconomic.farmerNetPerQuintal : null;
  const actNet = bestActionable ? bestActionable.netPerQuintal : null;

  return {
    coverage,
    summary,
    bestEconomic: bestEconomic ? { market: bestEconomic.market, netPerQuintal: bestEconomic.farmerNetPerQuintal, netTotal: bestEconomic.farmerNetTotal } : null,
    bestActionable,
    divergence: (bestEconomic && bestActionable && bestActionable.market !== bestEconomic.market)
      ? {
          perQuintal: Math.round((econNet - actNet) * 100) / 100,
          lotTotal: Math.round((econNet - actNet) * lot.quantityQuintals * 100) / 100,
          note: 'Economic rank is never changed by buyer coverage — this is the estimated cost of choosing the immediately actionable path.',
        }
      : null,
  };
}

module.exports = { assessCoverage, buyerCompatible, districtsForMandi, MARKET_TO_DISTRICT, MANDI_HOME };

// Pure FPO bulk-pool math — no I/O, no HTTP, so unit tests and the route share
// exactly the same transform. The uplift computation defers every price/cost
// number to the deterministic calculator (ml-service/net_realization.py);
// nothing here invents prices, distances or rates.

const fs = require('fs');
const path = require('path');

const MEMBERS_FILE = path.join(__dirname, '..', 'data', 'fpoMembers.json');

function loadMembers() {
  try {
    return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
  } catch (error) {
    console.error('Failed to load FPO member seed:', error.message);
    return { meta: {}, members: [] };
  }
}

function quantityInQuintals(quantity, unit) {
  const qty = Number(quantity) || 0;
  if (unit === 'kg') return qty / 100;
  if (unit === 'tonnes') return qty * 10;
  return qty;
}

// members: [{ uid, name, crop, quantity, unit }] (mock seed or real lot rows)
function buildPool(members) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('A pool needs at least one member');
  }
  const missingCrop = members.filter(m => !m.crop || !String(m.crop).trim());
  if (missingCrop.length > 0) {
    throw new Error(`All members must specify a crop (missing for: ${missingCrop.map(m => m.name || m.uid || 'unknown').join(', ')})`);
  }
  const crops = [...new Set(members.map(m => String(m.crop).trim()))];
  if (crops.length > 1) {
    throw new Error(`All pooled members must sell the same crop (got: ${crops.join(', ')})`);
  }
  const normalized = members.map((m, i) => {
    const quantityQuintals = Math.round(quantityInQuintals(m.quantity, m.unit) * 100) / 100;
    return {
      uid: m.uid || `member-${i + 1}`,
      name: m.name || `Member ${i + 1}`,
      village: m.village || '',
      crop: String(m.crop).trim(),
      quantityQuintals,
      _valid: quantityQuintals > 0,
    };
  });
  const validMembers = normalized.filter(m => m._valid);
  if (validMembers.length === 0) {
    throw new Error('Pooled quantity must be positive — no members have a valid quantity');
  }
  const pooledQuantity = Math.round(validMembers.reduce((s, m) => s + m.quantityQuintals, 0) * 100) / 100;
  if (pooledQuantity <= 0) {
    throw new Error('Pooled quantity must be positive');
  }
  return { crop: crops[0], members: validMembers.map(({ _valid, ...m }) => m), pooledQuantity };
}

// Share of the pooled net attributable to each member, proportional to their
// contribution. Deterministic; rounded to the paisa.
function memberShares(pool, pooledBestNetPerQuintal) {
  return pool.members.map(m => ({
    ...m,
    sharePct: Math.round((m.quantityQuintals / pool.pooledQuantity) * 10000) / 100,
    netAmount: Math.round(m.quantityQuintals * pooledBestNetPerQuintal * 100) / 100,
  }));
}

// individualBests: [{ uid, name, bestNetPerQuintal, bestMandi }] — one per
// member, computed by the caller from the same calculator output.
function computeUplift(pool, pooledResult, individualBests) {
  if (individualBests.length !== pool.members.length) {
    throw new Error('Need one individual best-mandi result per member');
  }
  if (!pooledResult || !pooledResult.rankedMandis || pooledResult.rankedMandis.length === 0) {
    throw new Error('Pooled result has no ranked mandis — cannot compute uplift');
  }
  const pooledNetPerQ = pooledResult.rankedMandis[0].farmerNetPerQuintal;
  const pooledMandi = pooledResult.rankedMandis[0].market;

  const perMember = pool.members.map((m, i) => {
    const solo = individualBests[i];
    if (!solo || !solo.bestNetPerQuintal) {
      throw new Error(`Missing individual result for member ${m.uid}`);
    }
    const soloNet = Math.round(solo.bestNetPerQuintal * m.quantityQuintals * 100) / 100;
    const pooledNet = Math.round(pooledNetPerQ * m.quantityQuintals * 100) / 100;
    return {
      uid: m.uid,
      name: m.name,
      village: m.village,
      quantityQuintals: m.quantityQuintals,
      soloBestMandi: solo.bestMandi,
      soloNetPerQuintal: solo.bestNetPerQuintal,
      soloNetTotal: soloNet,
      pooledNetTotal: pooledNet,
      uplift: Math.round((pooledNet - soloNet) * 100) / 100,
    };
  });

  const totalSolo = Math.round(perMember.reduce((s, m) => s + m.soloNetTotal, 0) * 100) / 100;
  const totalPooled = Math.round(perMember.reduce((s, m) => s + m.pooledNetTotal, 0) * 100) / 100;
  const totalUplift = Math.round((totalPooled - totalSolo) * 100) / 100;

  const bulkTier = pooledResult.rankedMandis[0].farmerCosts.transportTier === 'bulk_full_truck';
  const reason = bulkTier
    ? `Pooled ${pool.pooledQuantity} q qualifies for the full-truck transport rate (₹0.75/q/km vs ₹1.5/q/km for small lots), so the same mandi (${pooledMandi}) nets each member more per quintal.`
    : `Pooled ${pool.pooledQuantity} q did not reach the full-truck threshold (40 q) — uplift comes only from any mandi price differences, not the bulk transport rate.`;

  return {
    pool,
    pooledBestMandi: pooledMandi,
    pooledNetPerQuintal: pooledNetPerQ,
    perMember,
    totals: {
      soloNetTotal: totalSolo,
      pooledNetTotal: totalPooled,
      upliftTotal: totalUplift,
      upliftPct: totalSolo > 0 ? Math.round((totalUplift / totalSolo) * 10000) / 100 : 0,
    },
    bulkRateApplied: bulkTier,
    reason,
  };
}

// Creates a Lot-ready object from pooled members. Does NOT persist — the
// route handler owns the DB write. Returns { lotFields, memberShares }.
function createPooledLot({ district, crop, members }) {
  const pool = buildPool(members);
  if (crop && crop !== pool.crop) {
    pool.crop = crop;
  }
  const shares = memberShares(pool, 0); // netPerQ=0 here; actual net computed at offer time
  const lotFields = {
    crop: pool.crop,
    quantity: pool.pooledQuantity,
    unit: 'quintals',
    grade: 'Unassessed',
    district: district || '',
    status: 'OPEN',
    poolMetadata: {
      isPooled: true,
      memberCount: shares.length,
      members: shares.map(({ uid, name, village, quantityQuintals, sharePct, netAmount }) => ({
        uid, name, village, quantityQuintals, sharePct, netAmount,
      })),
      pooledCrop: pool.crop,
      pooledQuantity: pool.pooledQuantity,
    },
  };
  return { lotFields, memberShares: shares, pool };
}

module.exports = { loadMembers, quantityInQuintals, buildPool, memberShares, computeUplift, createPooledLot };

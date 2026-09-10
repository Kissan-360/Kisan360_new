const fpoPool = require('../../src/services/fpoPool');

const MEMBERS = [
  { uid: 'm1', name: 'A', crop: 'Soybean', quantity: 12, unit: 'quintals' },
  { uid: 'm2', name: 'B', crop: 'Soybean', quantity: 8, unit: 'quintals' },
  { uid: 'm3', name: 'C', crop: 'Soybean', quantity: 20, unit: 'quintals' },
];

const POOLED_RESULT = {
  rankedMandis: [
    {
      market: 'APMC Latur',
      farmerNetPerQuintal: 5600,
      farmerCosts: { transportPerQuintal: 285, storagePerQuintal: 2, otherPerQuintal: 20, totalCostsPerQuintal: 307, transportTier: 'bulk_full_truck' },
    },
  ],
};

const SOLO_BESTS = [
  { bestMandi: 'APMC Latur', bestNetPerQuintal: 5150 }, // 12q @ LCV rate
  { bestMandi: 'APMC Akola', bestNetPerQuintal: 5050 },
  { bestMandi: 'APMC Latur', bestNetPerQuintal: 5300 }, // 20q still below bulk threshold
];

describe('fpoPool', () => {
  test('buildPool normalizes units and sums quantities', () => {
    const pool = fpoPool.buildPool([
      ...MEMBERS,
      { uid: 'm4', name: 'D', crop: 'Soybean', quantity: 100, unit: 'kg' },
    ]);
    expect(pool.crop).toBe('Soybean');
    expect(pool.pooledQuantity).toBe(41); // 12 + 8 + 20 + 1
    expect(pool.members).toHaveLength(4);
  });

  test('buildPool converts kg and tonnes to quintals', () => {
    const pool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 100, unit: 'kg' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: 2, unit: 'tonnes' },
    ]);
    expect(pool.pooledQuantity).toBeCloseTo(21, 5);
  });

  test('buildPool rejects mixed crops and empty pools', () => {
    expect(() => fpoPool.buildPool([])).toThrow(/at least one member/);
    expect(() => fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 5, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Soybean', quantity: 5, unit: 'quintals' },
    ])).toThrow(/same crop/);
  });

  test('memberShares are proportional and sum to ~100%', () => {
    const pool = fpoPool.buildPool(MEMBERS);
    const shares = fpoPool.memberShares(pool, 5600);
    expect(shares[0].sharePct).toBeCloseTo(30, 1); // 12/40
    expect(shares[1].sharePct).toBeCloseTo(20, 1); // 8/40
    const total = shares.reduce((s, m) => s + m.sharePct, 0);
    expect(total).toBeCloseTo(100, 1);
    expect(shares[0].netAmount).toBe(12 * 5600);
  });

  test('computeUplift: pooled net beats every individual net, totals add up', () => {
    const pool = fpoPool.buildPool(MEMBERS);
    const r = fpoPool.computeUplift(pool, POOLED_RESULT, SOLO_BESTS);

    expect(r.pooledBestMandi).toBe('APMC Latur');
    expect(r.perMember).toHaveLength(3);
    // Every member strictly better pooled than solo
    for (const m of r.perMember) expect(m.uplift).toBeGreaterThan(0);

    // Math identity: totals = sum of parts
    const soloSum = r.perMember.reduce((s, m) => s + m.soloNetTotal, 0);
    const pooledSum = r.perMember.reduce((s, m) => s + m.pooledNetTotal, 0);
    expect(r.totals.soloNetTotal).toBeCloseTo(soloSum, 2);
    expect(r.totals.pooledNetTotal).toBeCloseTo(pooledSum, 2);
    expect(r.totals.upliftTotal).toBeCloseTo(pooledSum - soloSum, 2);
    expect(r.totals.upliftPct).toBeCloseTo(((pooledSum - soloSum) / soloSum) * 100, 1);
  });

  test('computeUplift flags the bulk transport tier as the uplift reason', () => {
    const pool = fpoPool.buildPool(MEMBERS);
    const r = fpoPool.computeUplift(pool, POOLED_RESULT, SOLO_BESTS);
    expect(r.bulkRateApplied).toBe(true);
    expect(r.reason).toMatch(/full-truck/);
  });

  test('computeUplift without bulk tier explains no threshold reached', () => {
    const pool = fpoPool.buildPool(MEMBERS.slice(0, 1)); // 12q only
    const noBulk = JSON.parse(JSON.stringify(POOLED_RESULT));
    noBulk.rankedMandis[0].farmerCosts.transportTier = 'lcv';
    const r = fpoPool.computeUplift(pool, noBulk, [SOLO_BESTS[0]]);
    expect(r.bulkRateApplied).toBe(false);
    expect(r.reason).toMatch(/did not reach the full-truck threshold/);
  });

  test('computeUplift rejects mismatched individual results', () => {
    const pool = fpoPool.buildPool(MEMBERS);
    expect(() => fpoPool.computeUplift(pool, POOLED_RESULT, SOLO_BESTS.slice(0, 2))).toThrow(/one individual/);
  });

  test('computeUplift rejects empty rankedMandis', () => {
    const pool = fpoPool.buildPool(MEMBERS);
    expect(() => fpoPool.computeUplift(pool, { rankedMandis: [] }, SOLO_BESTS)).toThrow(/no ranked mandis/);
  });

  // ── Edge cases: zero/negative quantities ──────────────────────────────────

  test('buildPool filters out zero-quantity members', () => {
    const pool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 10, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: 0, unit: 'quintals' },
    ]);
    expect(pool.pooledQuantity).toBe(10);
    expect(pool.members).toHaveLength(1);
    expect(pool.members[0].uid).toBe('a');
  });

  test('buildPool filters out negative-quantity members', () => {
    const pool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 10, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: -5, unit: 'quintals' },
    ]);
    expect(pool.pooledQuantity).toBe(10);
    expect(pool.members).toHaveLength(1);
  });

  test('buildPool rejects all-zero quantities', () => {
    expect(() => fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 0, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: 0, unit: 'quintals' },
    ])).toThrow(/Pooled quantity must be positive/);
  });

  test('buildPool rejects missing crop', () => {
    expect(() => fpoPool.buildPool([
      { uid: 'a', name: 'A', quantity: 10, unit: 'quintals' },
    ])).toThrow(/must specify a crop/);
  });

  // ── Edge case: 5 farmers with unequal quantities ─────────────────────────

  test('buildPool handles 5 farmers with unequal quantities', () => {
    const pool = fpoPool.buildPool([
      { uid: 'm1', name: 'Ravi', crop: 'Soybean', quantity: 12, unit: 'quintals' },
      { uid: 'm2', name: 'Sunita', crop: 'Soybean', quantity: 8, unit: 'quintals' },
      { uid: 'm3', name: 'Ganesh', crop: 'Soybean', quantity: 15, unit: 'quintals' },
      { uid: 'm4', name: 'Anita', crop: 'Soybean', quantity: 6, unit: 'quintals' },
      { uid: 'm5', name: 'Vikram', crop: 'Soybean', quantity: 9, unit: 'quintals' },
    ]);
    expect(pool.pooledQuantity).toBe(50);
    expect(pool.members).toHaveLength(5);
  });

  // ── Edge case: threshold-crossing pool (below 40q → above 40q) ───────────

  test('computeUplift explains when threshold is crossed vs not', () => {
    // Below threshold (30q) — LCV rate
    const smallPool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 15, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: 15, unit: 'quintals' },
    ]);
    const noBulk = JSON.parse(JSON.stringify(POOLED_RESULT));
    noBulk.rankedMandis[0].farmerCosts.transportTier = 'lcv';
    const rSmall = fpoPool.computeUplift(smallPool, noBulk, [
      { bestMandi: 'APMC Latur', bestNetPerQuintal: 5100 },
      { bestMandi: 'APMC Latur', bestNetPerQuintal: 5100 },
    ]);
    expect(rSmall.bulkRateApplied).toBe(false);
    expect(rSmall.reason).toMatch(/did not reach/);

    // Above threshold (40q) — bulk rate
    const largePool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 20, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: 25, unit: 'quintals' },
    ]);
    const rLarge = fpoPool.computeUplift(largePool, POOLED_RESULT, [
      { bestMandi: 'APMC Latur', bestNetPerQuintal: 5100 },
      { bestMandi: 'APMC Latur', bestNetPerQuintal: 5100 },
    ]);
    expect(rLarge.bulkRateApplied).toBe(true);
    expect(rLarge.reason).toMatch(/full-truck/);
  });

  // ── Edge case: very small total quantity ──────────────────────────────────

  test('buildPool allows very small total quantity (1q)', () => {
    const pool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Onion', quantity: 0.5, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Onion', quantity: 0.5, unit: 'quintals' },
    ]);
    expect(pool.pooledQuantity).toBe(1);
    expect(pool.members).toHaveLength(2);
  });

  // ── Edge case: large pooled quantity ──────────────────────────────────────

  test('buildPool handles large quantity (200q)', () => {
    const pool = fpoPool.buildPool([
      { uid: 'a', name: 'A', crop: 'Soybean', quantity: 100, unit: 'quintals' },
      { uid: 'b', name: 'B', crop: 'Soybean', quantity: 100, unit: 'quintals' },
    ]);
    expect(pool.pooledQuantity).toBe(200);
  });

  // ── quantityInQuintals conversions ────────────────────────────────────────

  test('quantityInQuintals handles kg and tonnes correctly', () => {
    expect(fpoPool.quantityInQuintals(1000, 'kg')).toBe(10);
    expect(fpoPool.quantityInQuintals(2, 'tonnes')).toBe(20);
    expect(fpoPool.quantityInQuintals(5, 'quintals')).toBe(5);
    expect(fpoPool.quantityInQuintals(undefined, 'quintals')).toBe(0);
  });
});

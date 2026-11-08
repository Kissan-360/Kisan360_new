// AGMARKNET arrival dates are DD/MM/YYYY. `new Date()` reads that as US MM/DD,
// which silently produced two wrong answers and a negative data age:
//
//   new Date('10/09/2026') → 9 Oct 2026 (a FUTURE date)  → ageHours: -378.01
//   new Date('22/09/2026') → Invalid Date                → age: UNKNOWN
//
// The live deployment reported `ageHours: -378.01` / `freshnessLabel: FUTURE`
// for a 13-day-old quote, and the decision screen rendered "-378.01h old".
// Nothing caught it because NO test asserted freshness anywhere — these pin
// the contract at the three sites that consumed the bad parse.

const {
  parseObservedDate,
  normalizeObservedDate,
  ageMs,
  oldestObservedOn,
  compareObservedDate,
} = require('../../src/lib/observedDate');
const marketCache = require('../../src/services/marketCache');
const { computeSaleWindow } = require('../../src/services/saleWindow');
const { getMarketArrivals } = require('../../src/services/arrivalIntel');

describe('observedDate — AGMARKNET DD/MM/YYYY', () => {
  test('reads dates day-first, never as US MM/DD', () => {
    // The regression that produced the negative age: 10 Sept was read as 9 Oct.
    expect(normalizeObservedDate('10/09/2026')).toBe('2026-09-10');
    expect(normalizeObservedDate('08/09/2026')).toBe('2026-09-08');
  });

  test('parses days past the 12th, which US parsing turns into Invalid Date', () => {
    expect(normalizeObservedDate('22/09/2026')).toBe('2026-09-22');
    expect(normalizeObservedDate('31/12/2026')).toBe('2026-12-31');
  });

  test('accepts ISO dates and full timestamps', () => {
    expect(normalizeObservedDate('2026-09-08')).toBe('2026-09-08');
    expect(normalizeObservedDate('2026-09-08T12:34:56Z')).toBe('2026-09-08');
  });

  test('rejects absent, malformed and impossible dates', () => {
    for (const bad of [null, undefined, '', '   ', 'garbage', '41/13/2026', '31/02/2026', '09/2026']) {
      expect(normalizeObservedDate(bad)).toBeNull();
      expect(parseObservedDate(bad)).toBeNull();
    }
  });

  test('age is positive for the past, negative only for a genuinely future date', () => {
    const now = Date.parse('2026-09-23T00:00:00Z');
    expect(ageMs('10/09/2026', now)).toBe(13 * 24 * 3600 * 1000);
    expect(ageMs('23/09/2026', now)).toBe(0);
    expect(ageMs('01/10/2026', now)).toBeLessThan(0);
    expect(ageMs('garbage', now)).toBeNull();
  });

  test('orders chronologically across months, not by day number', () => {
    // As strings '08/09/2026' < '22/08/2026' (8 < 22), so the old sort picked
    // September as the OLDEST observation and August as the newest.
    expect(oldestObservedOn(['08/09/2026', '22/08/2026'])).toBe('22/08/2026');
    expect(oldestObservedOn(['10/09/2026', '22/09/2026'])).toBe('10/09/2026');
    expect(oldestObservedOn(['garbage', '22/09/2026'])).toBe('22/09/2026');
    expect(oldestObservedOn([])).toBeNull();
    expect(compareObservedDate('08/09/2026', '22/08/2026')).toBeGreaterThan(0);
  });
});

describe('freshness reporting can no longer go negative', () => {
  test('the served snapshot reports a real, non-negative age', () => {
    marketCache.loadSeed();
    const res = marketCache.getPrices({ crop: 'Onion' });

    // These hold on any run date, whatever the snapshot happens to contain.
    if (res.freshnessMs != null) expect(res.freshnessMs).toBeGreaterThanOrEqual(0);
    expect(res.freshnessLabel).not.toBe('FUTURE');
    expect(['CURRENT', 'RECENT', 'STALE', 'UNKNOWN']).toContain(res.freshnessLabel);
  });

  test('sale-window freshness is a real age, never a negative one', () => {
    const result = computeSaleWindow(
      [
        { date: '2026-09-16', modalPrice: 3000 },
        { date: '2026-09-17', modalPrice: 3200 },
        { date: '2026-09-18', modalPrice: 3400 },
        { date: '2026-09-19', modalPrice: 3600 },
      ],
      { modalPrice: 3750, arrivalDate: '10/09/2026', source: 'agmarknet_snapshot' },
    );
    const freshness = (result.evidence || []).find(e => e.type === 'freshness');
    expect(freshness).toBeTruthy();
    expect(Number.isInteger(freshness.daysOld)).toBe(true);
    expect(freshness.daysOld).toBeGreaterThanOrEqual(0);
  });

  test('arrival intelligence reports the truly latest observation', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Local', modalPrice: 3000, arrivalDate: '22/08/2026', arrivalQuantity: 400, arrivalUnit: 'Quintals' },
      { crop: 'Onion', market: 'A', variety: 'Local', modalPrice: 4100, arrivalDate: '08/09/2026', arrivalQuantity: 600, arrivalUnit: 'Quintals' },
    ];
    const latest = getMarketArrivals(rows, { crop: 'Onion' });
    expect(latest.available).toBe(true);
    // Was '22/08/2026' under the lexicographic sort, which compares day numbers
    // first — August's record beat September's.
    expect(latest.latestObservationDate).toBe('08/09/2026');
    expect(latest.latestArrivalQuantity).toBe(600);
  });
});

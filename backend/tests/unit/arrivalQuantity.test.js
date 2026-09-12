const { summarizeArrivals, getMarketArrivals, observationKey } = require('../../src/services/arrivalIntel');

describe('arrivalIntel enhanced', () => {
  // ── Basic availability ──────────────────────────────────────────────────

  test('returns unavailable when no data', () => {
    const result = summarizeArrivals([]);
    expect(result.available).toBe(false);
    expect(result.observations).toEqual([]);
  });

  test('returns unavailable for null input', () => {
    const result = summarizeArrivals(null);
    expect(result.available).toBe(false);
  });

  // ── Observation counting (backward compatible) ─────────────────────────

  test('counts observations by date', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', modalPrice: 3000 },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026', modalPrice: 3200 },
      { crop: 'Onion', market: 'C', variety: 'Red', arrivalDate: '09/09/2026', modalPrice: 3100 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.available).toBe(true);
    expect(result.observations.length).toBe(2);
    expect(result.observations[0].entries).toBe(2);
    expect(result.observations[1].entries).toBe(1);
  });

  test('filters by crop', () => {
    const rows = [
      { crop: 'Onion', market: 'A', arrivalDate: '08/09/2026' },
      { crop: 'Soybean', market: 'B', arrivalDate: '08/09/2026' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].entries).toBe(1);
  });

  test('identifies above-normal arrivals', () => {
    const rows = [];
    for (let d = 1; d <= 7; d++) {
      rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: `${String(d).padStart(2, '0')}/09/2026` });
      rows.push({ crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: `${String(d).padStart(2, '0')}/09/2026` });
    }
    for (let i = 0; i < 10; i++) {
      rows.push({ crop: 'Onion', market: `M${i}`, variety: 'Red', arrivalDate: '08/09/2026' });
    }
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.context).toBe('ABOVE_NORMAL');
  });

  // ── Deduplication ──────────────────────────────────────────────────────

  test('deduplicates identical observations', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].entries).toBe(1);
    expect(result.observations[0].totalArrivalQuantity).toBe(100);
  });

  test('does not deduplicate different markets', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 200 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].entries).toBe(2);
    expect(result.observations[0].totalArrivalQuantity).toBe(300);
  });

  // ── Arrival quantity (when source provides data) ───────────────────────

  test('aggregates arrival quantity across observations', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100, arrivalUnit: 'Quintals' },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 200, arrivalUnit: 'Quintals' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].totalArrivalQuantity).toBe(300);
    expect(result.observations[0].averageArrivalQuantity).toBe(150);
    expect(result.observations[0].arrivalQuantityUnit).toBe('Quintals');
    expect(result.observations[0].observationsWithQuantity).toBe(2);
    expect(result.observations[0].quantityCoverage).toBe(100);
  });

  test('handles mixed: some observations with quantity, some without', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100, arrivalUnit: 'Quintals' },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026' }, // no quantity
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].entries).toBe(2);
    expect(result.observations[0].totalArrivalQuantity).toBe(100);
    expect(result.observations[0].observationsWithQuantity).toBe(1);
    expect(result.observations[0].quantityCoverage).toBe(50);
  });

  test('null arrivalQuantity treated as missing (not zero)', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: null },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].totalArrivalQuantity).toBeNull();
    expect(result.observations[0].observationsWithQuantity).toBe(0);
  });

  test('zero arrivalQuantity is valid (not treated as missing)', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 0 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].totalArrivalQuantity).toBe(0);
    expect(result.observations[0].observationsWithQuantity).toBe(1);
  });

  test('negative arrivalQuantity treated as invalid', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: -5 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].totalArrivalQuantity).toBeNull();
    expect(result.observations[0].observationsWithQuantity).toBe(0);
  });

  // ── Quantity summary ───────────────────────────────────────────────────

  test('quantitySummary available when data exists', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100, arrivalUnit: 'Quintals' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.available).toBe(true);
    expect(result.quantitySummary.unit).toBe('Quintals');
    expect(result.quantitySummary.totalArrivalQuantity).toBe(100);
    expect(result.quantitySummary.latestArrivalQuantity).toBe(100);
    expect(result.quantitySummary.latestArrivalDate).toBe('08/09/2026');
    expect(result.quantitySummary.coveragePercentage).toBe(100);
  });

  test('quantitySummary unavailable when no data', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.available).toBe(false);
    expect(result.quantitySummary.totalArrivalQuantity).toBeNull();
  });

  // ── Quantity trend ─────────────────────────────────────────────────────

  test('trend UP when latest quantity significantly exceeds average', () => {
    const rows = [];
    // 5 days with consistent 100q each
    for (let d = 1; d <= 5; d++) {
      rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: `${String(d).padStart(2, '0')}/09/2026`, arrivalQuantity: 100 });
    }
    // Latest day: 200q (double)
    rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '06/09/2026', arrivalQuantity: 200 });
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.trend).toBe('UP');
  });

  test('trend DOWN when latest quantity significantly below average', () => {
    const rows = [];
    for (let d = 1; d <= 5; d++) {
      rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: `${String(d).padStart(2, '0')}/09/2026`, arrivalQuantity: 200 });
    }
    rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '06/09/2026', arrivalQuantity: 50 });
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.trend).toBe('DOWN');
  });

  test('trend FLAT when latest quantity near average', () => {
    const rows = [];
    for (let d = 1; d <= 5; d++) {
      rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: `${String(d).padStart(2, '0')}/09/2026`, arrivalQuantity: 100 });
    }
    rows.push({ crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '06/09/2026', arrivalQuantity: 105 });
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.trend).toBe('FLAT');
  });

  test('trend INSUFFICIENT_EVIDENCE with fewer than 3 quantity observations', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '01/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '02/09/2026', arrivalQuantity: 120 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.trend).toBe('INSUFFICIENT_EVIDENCE');
  });

  test('trend null when no quantity data at all', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '01/09/2026' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.trend).toBeNull();
  });

  // ── Coverage ───────────────────────────────────────────────────────────

  test('coverage percentage computed correctly', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026' },
      { crop: 'Onion', market: 'C', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 200 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.coveragePercentage).toBe(67); // 2 of 3
  });

  // ── getMarketArrivals ──────────────────────────────────────────────────

  describe('getMarketArrivals', () => {
    test('returns latest observation for crop+market', () => {
      const rows = [
        { crop: 'Onion', market: 'Lasalgaon', variety: 'Red', arrivalDate: '07/09/2026', arrivalQuantity: 500, arrivalUnit: 'Quintals', modalPrice: 3800 },
        { crop: 'Onion', market: 'Lasalgaon', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 600, arrivalUnit: 'Quintals', modalPrice: 3900 },
      ];
      const result = getMarketArrivals(rows, { crop: 'Onion', market: 'Lasalgaon' });
      expect(result.available).toBe(true);
      expect(result.latestArrivalQuantity).toBe(600);
      expect(result.latestObservationDate).toBe('08/09/2026');
      expect(result.arrivalQuantityUnit).toBe('Quintals');
      expect(result.quantityAvailable).toBe(true);
    });

    test('returns quantityAvailable=false when no quantity', () => {
      const rows = [
        { crop: 'Onion', market: 'Lasalgaon', arrivalDate: '08/09/2026', modalPrice: 3900 },
      ];
      const result = getMarketArrivals(rows, { crop: 'Onion', market: 'Lasalgaon' });
      expect(result.available).toBe(true);
      expect(result.quantityAvailable).toBe(false);
      expect(result.latestArrivalQuantity).toBeNull();
    });

    test('returns unavailable for no match', () => {
      const rows = [
        { crop: 'Onion', market: 'A', arrivalDate: '08/09/2026' },
      ];
      const result = getMarketArrivals(rows, { crop: 'Soybean' });
      expect(result.available).toBe(false);
    });

    test('returns unavailable for empty input', () => {
      expect(getMarketArrivals([]).available).toBe(false);
      expect(getMarketArrivals(null).available).toBe(false);
    });
  });

  // ── observationKey ─────────────────────────────────────────────────────

  describe('observationKey', () => {
    test('generates consistent key for same observation', () => {
      const row = { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026' };
      expect(observationKey(row)).toBe(observationKey(row));
    });

    test('different markets produce different keys', () => {
      const a = { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026' };
      const b = { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026' };
      expect(observationKey(a)).not.toBe(observationKey(b));
    });

    test('case-insensitive', () => {
      const a = { crop: 'ONION', market: 'A', variety: 'Red', arrivalDate: '08/09/2026' };
      const b = { crop: 'onion', market: 'a', variety: 'red', arrivalDate: '08/09/2026' };
      expect(observationKey(a)).toBe(observationKey(b));
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  test('missing arrivalDate excluded from observations', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.available).toBe(false);
  });

  test('single observation produces one entry', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].entries).toBe(1);
  });

  test('no quantity observations shows quantitySummary.available=false', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026' },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '09/09/2026' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.available).toBe(false);
    expect(result.quantitySummary.totalArrivalQuantity).toBeNull();
  });

  // ── Provenance / no causal interpretation ──────────────────────────────

  test('note explicitly states observation, not supply', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.note).toMatch(/observation/);
    expect(result.note).not.toMatch(/supply|demand|price.*cause/i);
  });

  test('quantity note explicitly states not total market supply', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.quantitySummary.note).toMatch(/not total market supply/i);
  });

  // ── Adversarial ────────────────────────────────────────────────────────

  test('same observation fetched twice produces same aggregate', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
    ];
    const once = summarizeArrivals([rows[0]], { crop: 'Onion' });
    const twice = summarizeArrivals(rows, { crop: 'Onion' });
    expect(twice.observations[0].totalArrivalQuantity).toBe(once.observations[0].totalArrivalQuantity);
    expect(twice.observations[0].entries).toBe(once.observations[0].entries);
  });

  test('same day across two markets counts correctly', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 200 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].entries).toBe(2);
    expect(result.observations[0].totalArrivalQuantity).toBe(300);
    expect(result.observations[0].distinctMarkets).toBe(2);
  });

  test('NaN arrivalQuantity treated as missing', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 'abc' },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].totalArrivalQuantity).toBeNull();
  });

  test('Infinity arrivalQuantity treated as invalid', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: Infinity },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion' });
    expect(result.observations[0].totalArrivalQuantity).toBeNull();
  });

  test('filtering by market works', () => {
    const rows = [
      { crop: 'Onion', market: 'A', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 100 },
      { crop: 'Onion', market: 'B', variety: 'Red', arrivalDate: '08/09/2026', arrivalQuantity: 200 },
    ];
    const result = summarizeArrivals(rows, { crop: 'Onion', market: 'A' });
    expect(result.observations[0].entries).toBe(1);
    expect(result.observations[0].totalArrivalQuantity).toBe(100);
  });
});

const priceHistory = require('../../src/services/priceHistory');

const DAYS = {
  '2026-09-06': [
    { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 3800, arrivalDate: '06/09/2026' },
    { crop: 'Soybean', market: 'APMC Latur', variety: 'Yellow', modalPrice: 6100, arrivalDate: '06/09/2026' },
  ],
  '2026-09-07': [
    { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 3900, arrivalDate: '07/09/2026' },
  ],
  '2026-09-08': [
    { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 4100, arrivalDate: '08/09/2026' },
    { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Other', modalPrice: 4000, arrivalDate: '08/09/2026' },
    { crop: 'Soybean', market: 'APMC Latur', variety: 'Yellow', modalPrice: 6150, arrivalDate: '08/09/2026' },
  ],
};

describe('priceHistory', () => {
  test('normalizeDate handles DD/MM/YYYY and ISO', () => {
    expect(priceHistory.normalizeDate('08/09/2026')).toBe('2026-09-08');
    expect(priceHistory.normalizeDate('2026-09-08T12:00:00Z')).toBe('2026-09-08');
    expect(priceHistory.normalizeDate('garbage')).toBeNull();
  });

  test('appendRows dedupes per crop|market|variety keeping the best quote', () => {
    const next = priceHistory.appendRows({}, [
      { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 3900, arrivalDate: '08/09/2026' },
      { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 4100, arrivalDate: '08/09/2026' },
    ]);
    expect(next['2026-09-08']).toHaveLength(1);
    expect(next['2026-09-08'][0].modalPrice).toBe(4100);
  });

  test('appendRows skips rows without a parseable date', () => {
    const next = priceHistory.appendRows({}, [
      { crop: 'Onion', market: 'X', variety: 'L', modalPrice: 100, arrivalDate: 'soon' },
    ]);
    expect(Object.keys(next)).toHaveLength(0);
  });

  test('trendSeries picks the best variety per day, oldest first, window-sliced', () => {
    const series = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: 'APMC Lasalgaon', window: 2 });
    expect(series).toHaveLength(2);
    expect(series.map(s => s.date)).toEqual(['2026-09-07', '2026-09-08']);
    expect(series[1].modalPrice).toBe(4100); // best variety that day, not 4000
  });

  test('trendSeries returns only days with data for the requested market', () => {
    const series = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: 'APMC Lasalgaon', window: 30 });
    expect(series).toHaveLength(3);
    expect(series[0].modalPrice).toBe(3800);
  });

  test('describeDelta describes the past and explicitly disclaims forecasting', () => {
    const series = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: 'APMC Lasalgaon', window: 30 });
    const d = priceHistory.describeDelta(series);
    expect(d).toMatch(/₹300\/q higher/);
    expect(d).toMatch(/does not forecast/);
  });

  test('describeDelta handles empty and single-day history', () => {
    expect(priceHistory.describeDelta([])).toMatch(/No history yet/);
    expect(priceHistory.describeDelta([{ date: '2026-09-08', modalPrice: 4100 }])).toMatch(/Only one day/);
  });

  // ── Crop alias matching (Soyabean vs Soybean) ─────────────────────────────

  test('trendSeries matches Soyabean data when querying Soybean', () => {
    const soyDays = {
      '2026-09-08': [
        { crop: 'Soyabean', market: 'APMC Latur', variety: 'Yellow', modalPrice: 6100, arrivalDate: '08/09/2026' },
      ],
    };
    const series = priceHistory.trendSeries(soyDays, { crop: 'Soybean', market: 'APMC Latur', window: 7 });
    expect(series).toHaveLength(1);
    expect(series[0].modalPrice).toBe(6100);
  });

  test('trendSeries matches Soybean data when querying Soyabean', () => {
    const soyDays = {
      '2026-09-08': [
        { crop: 'Soybean', market: 'APMC Latur', variety: 'Yellow', modalPrice: 6100, arrivalDate: '08/09/2026' },
      ],
    };
    const series = priceHistory.trendSeries(soyDays, { crop: 'Soyabean', market: 'APMC Latur', window: 7 });
    expect(series).toHaveLength(1);
    expect(series[0].modalPrice).toBe(6100);
  });

  test('trendSeries matches Onion/Onions variants', () => {
    const days = {
      '2026-09-08': [
        { crop: 'Onions', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 3800, arrivalDate: '08/09/2026' },
      ],
    };
    const series = priceHistory.trendSeries(days, { crop: 'Onion', market: 'APMC Lasalgaon', window: 7 });
    expect(series).toHaveLength(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  test('trendSeries returns empty for no matching market', () => {
    const series = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: 'Nonexistent Mandi', window: 7 });
    expect(series).toHaveLength(0);
  });

  test('trendSeries returns empty for no matching crop', () => {
    const series = priceHistory.trendSeries(DAYS, { crop: 'Potato', market: 'APMC Lasalgaon', window: 7 });
    expect(series).toHaveLength(0);
  });

  test('trendSeries handles sparse history (only 1 of 7 days has data)', () => {
    const sparse = { '2026-09-08': DAYS['2026-09-08'] };
    const series = priceHistory.trendSeries(sparse, { crop: 'Onion', market: 'APMC Lasalgaon', window: 7 });
    expect(series).toHaveLength(1);
    expect(series[0].modalPrice).toBe(4100);
  });

  test('trendSeries handles malformed dates gracefully', () => {
    const bad = {
      '2026-09-08': [
        { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 4100, arrivalDate: 'bad-date' },
      ],
    };
    const series = priceHistory.trendSeries(bad, { crop: 'Onion', market: 'APMC Lasalgaon', window: 7 });
    // The row is still in the bucket; trend series doesn't filter by date validity
    expect(series).toHaveLength(1);
  });

  test('trendSeries handles missing crop/market in query', () => {
    const series1 = priceHistory.trendSeries(DAYS, { crop: '', market: 'APMC Lasalgaon', window: 7 });
    expect(series1).toHaveLength(0);
    const series2 = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: '', window: 7 });
    expect(series2).toHaveLength(0);
  });

  test('trendSeries window=14 and window=30 work correctly', () => {
    const series14 = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: 'APMC Lasalgaon', window: 14 });
    expect(series14).toHaveLength(3); // only 3 days of data
    const series30 = priceHistory.trendSeries(DAYS, { crop: 'Onion', market: 'APMC Lasalgaon', window: 30 });
    expect(series30).toHaveLength(3);
  });

  test('appendRows handles null/undefined arrivalDate', () => {
    const next = priceHistory.appendRows({}, [
      { crop: 'Onion', market: 'X', variety: 'L', modalPrice: 100, arrivalDate: null },
      { crop: 'Onion', market: 'X', variety: 'L', modalPrice: 200, arrivalDate: undefined },
    ]);
    expect(Object.keys(next)).toHaveLength(0);
  });

  test('getHistorySummary returns correct structure', () => {
    const summary = priceHistory.getHistorySummary();
    expect(summary).toHaveProperty('dayCount');
    expect(summary).toHaveProperty('totalObservations');
    expect(summary).toHaveProperty('distinctCrops');
    expect(summary).toHaveProperty('distinctMarkets');
    expect(summary).toHaveProperty('lastRefresh');
  });
});

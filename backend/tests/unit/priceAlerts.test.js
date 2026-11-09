const {
  validatePriceAlertInput,
  evaluatePriceAlert,
  priceAlertItems,
} = require('../../src/services/priceAlerts');

const DAYS = {
  '2026-11-07': [
    { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 3900, arrivalDate: '07/11/2026' },
  ],
  '2026-11-08': [
    { crop: 'Onion', market: 'APMC Lasalgaon', variety: 'Local', modalPrice: 4100, arrivalDate: '08/11/2026' },
  ],
};

describe('priceAlerts', () => {
  test('validation requires crop, market, direction, and a sane target', () => {
    const bad = validatePriceAlertInput({ crop: '', market: '', direction: 'sideways', targetPrice: 0 });
    expect(bad.errors.length).toBeGreaterThanOrEqual(4);

    const good = validatePriceAlertInput({
      crop: ' Onion ', market: ' APMC Lasalgaon ', direction: 'ABOVE', targetPrice: '4000',
    });
    expect(good.errors).toEqual([]);
    expect(good.clean).toEqual({
      crop: 'Onion', market: 'APMC Lasalgaon', direction: 'above', targetPrice: 4000,
    });
  });

  test('evaluates crossings in both directions', () => {
    const latest = { date: '2026-11-08', modalPrice: 4100, market: 'APMC Lasalgaon' };
    expect(evaluatePriceAlert({ direction: 'above', targetPrice: 4000 }, latest)?.modalPrice).toBe(4100);
    expect(evaluatePriceAlert({ direction: 'below', targetPrice: 4200 }, latest)?.modalPrice).toBe(4100);
    expect(evaluatePriceAlert({ direction: 'above', targetPrice: 4200 }, latest)).toBeNull();
    expect(evaluatePriceAlert({ direction: 'below', targetPrice: 4000 }, latest)).toBeNull();
  });

  test('derives stable per-day items only for crossed active alerts', () => {
    const alerts = [
      { _id: 'a1', crop: 'Onion', market: 'APMC Lasalgaon', direction: 'above', targetPrice: 4000, active: true },
      { _id: 'a2', crop: 'Onion', market: 'APMC Lasalgaon', direction: 'below', targetPrice: 3000, active: true },
      { _id: 'a3', crop: 'Onion', market: 'APMC Lasalgaon', direction: 'above', targetPrice: 4000, active: false },
    ];
    const items = priceAlertItems(alerts, DAYS);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'price_a1_2026-11-08',
      kind: 'price_alert',
      category: 'market',
      to: '/market',
      type: 'success',
    });
    expect(items[0].message).toMatch(/₹4,100\/q/);
  });

  test('inactive and unmatched alerts produce no items', () => {
    const items = priceAlertItems([
      { _id: 'a1', crop: 'Onion', market: 'APMC Lasalgaon', direction: 'above', targetPrice: 4000, active: false },
      { _id: 'a2', crop: 'Tomato', market: 'APMC Lasalgaon', direction: 'above', targetPrice: 1, active: true },
    ], DAYS);
    expect(items).toEqual([]);
  });
});

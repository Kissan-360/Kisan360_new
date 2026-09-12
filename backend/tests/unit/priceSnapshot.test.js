const { TARGET_CROPS, isTargetCrop, recordsToRows, stampMeta } = require('../../src/services/priceSnapshot');

// Fixture shaped like AGMARKNET (data.gov.in) records.
const RECORDS = [
  { commodity: 'Onion', variety: 'Onion (Red Nasik)', market: 'Nashik', state: 'Maharashtra', min_price: '1650', max_price: '2050', modal_price: '1850', arrival_date: '2026-09-06' },
  { commodity: 'Onion', variety: 'Onion (Red Nasik)', market: 'Nashik', state: 'Maharashtra', min_price: '1600', max_price: '2100', modal_price: '1920', arrival_date: '2026-09-06' }, // dup, higher modal
  { commodity: 'Soyabeen', variety: 'Soyabeen (Yellow)', market: 'Latur', state: 'Maharashtra', min_price: '4380', max_price: '4980', modal_price: '4700', arrival_date: '2026-09-05' },
  { commodity: 'Tomato', variety: 'Tomato (Deshi)', market: 'Pune', state: 'Maharashtra', min_price: '1320', max_price: '1740', modal_price: '1520', arrival_date: '2026-09-06' },
  { commodity: 'Wheat', variety: 'Wheat (Lokwan)', market: 'Pune', state: 'Maharashtra', modal_price: '2600', arrival_date: '2026-09-06' }, // not a target crop
  { commodity: 'Onion', variety: 'Onion (Red Nasik)', market: 'Nashik', state: 'Gujarat', modal_price: '3000', arrival_date: '2026-09-06' }, // wrong state
];

describe('priceSnapshot', () => {
  test('targets all scheduler crops', () => {
    expect(isTargetCrop('Soyabeen')).toBe(true);
    expect(isTargetCrop('soybean')).toBe(true);
    expect(isTargetCrop('Tomato')).toBe(true);
    expect(isTargetCrop('Wheat')).toBe(true);
    expect(isTargetCrop('Green Chilli')).toBe(true);
    expect(TARGET_CROPS).toContain('Soybean');
    expect(TARGET_CROPS).toContain('Onion');
    expect(TARGET_CROPS).toContain('Tomato');
    expect(TARGET_CROPS).toContain('Wheat');
    expect(TARGET_CROPS.length).toBe(19);
  });

  test('maps, filters, and dedupes records into snapshot rows', () => {
    const { rows, reconciliation } = recordsToRows(RECORDS, { state: 'Maharashtra' });
    const nashik = rows.filter(r => r.market === 'Nashik');
    // duplicate kept the higher quote
    expect(nashik).toHaveLength(1);
    expect(nashik[0].modalPrice).toBe(1920);
    expect(nashik[0].minPrice).toBe(1600);
    // Gujarat rows dropped (state filter), but ALL Maharashtra crops pass through
    expect(rows.some(r => r.crop === 'Wheat')).toBe(true);
    expect(rows.length).toBe(4);
    expect(rows.map(r => r.crop).sort()).toEqual(['Onion', 'Soyabeen', 'Tomato', 'Wheat'].sort());
    // Reconciliation tracks what happened
    expect(reconciliation.received).toBe(6);
    expect(reconciliation.accepted).toBe(4); // Gujarat row filtered by state, not rejected by validation
    // Provenance fields are present
    expect(rows[0].observedOn).toBeTruthy();
    expect(rows[0].fetchedAt).toBeTruthy();
    expect(rows[0].validatedAt).toBeTruthy();
  });

  test('state filter is applied', () => {
    const { rows } = recordsToRows(RECORDS, { crop: 'Onion', state: 'Gujarat' });
    expect(rows).toHaveLength(1);
    expect(rows[0].market).toBe('Nashik');
  });

  test('stamps provenance metadata', () => {
    const meta = stampMeta();
    expect(meta.source).toBe('agmarknet_snapshot');
    expect(meta.retrievedAt).toBeTruthy();
    expect(new Date(meta.retrievedAt).getTime()).not.toBeNaN();
    expect(meta.unit).toBe('₹ per quintal');
  });
});

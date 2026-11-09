const { EXPECTED_INDEXES, indexKeyName } = require('../../src/lib/dbIndexes');

const models = {
  Lot: require('../../src/models/Lot'),
  Offer: require('../../src/models/Offer'),
  Payment: require('../../src/models/Payment'),
  Grievance: require('../../src/models/Grievance'),
  Detection: require('../../src/models/Detection'),
  Farm: require('../../src/models/Farm'),
  GradeCertificate: require('../../src/models/GradeCertificate'),
  UsageEvent: require('../../src/models/UsageEvent'),
};

function sameKeys(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

describe('db index manifest', () => {
  test('entries are complete, named, and unique', () => {
    expect(EXPECTED_INDEXES.length).toBeGreaterThanOrEqual(13);
    const names = EXPECTED_INDEXES.map((entry) => indexKeyName(entry));
    expect(new Set(names).size).toBe(names.length);

    for (const entry of EXPECTED_INDEXES) {
      expect(entry.model).toBeTruthy();
      expect(entry.collection).toBeTruthy();
      expect(entry.keys).toBeTruthy();
      expect(entry.options?.name).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(models[entry.model]).toBeTruthy();
    }
  });

  test('core models define the expected compound indexes', () => {
    for (const entry of EXPECTED_INDEXES) {
      const schemaIndexes = models[entry.model].schema.indexes();
      const found = schemaIndexes.some(([keys, opts]) => (
        sameKeys(keys, entry.keys) && opts?.name === entry.options.name
      ));
      expect({ model: entry.model, index: entry.options.name, found }).toEqual({
        model: entry.model,
        index: entry.options.name,
        found: true,
      });
    }
  });

  test('hot marketplace and payment paths are covered', () => {
    const names = new Set(EXPECTED_INDEXES.map((entry) => entry.options.name));
    for (const name of [
      'lots_available_market',
      'offers_lot_status',
      'payments_farmer_status_created',
      'grievances_raised_status_updated',
    ]) {
      expect(names.has(name)).toBe(true);
    }
  });
});

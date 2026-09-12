// Logistics Coordination Tests — comprehensive coverage for the logistics
// domain model, state machine, cost consistency, provider matching, lot
// integrity, and API contract. Tests the full coordination flow from
// REQUESTED through DELIVERED, plus invalid transitions and edge cases.

const { canTransition, allowedTransitions, transition } = require('../../src/services/stateMachine');
const {
  systemEstimate,
  findProviders,
  generateQuote,
  validateRequest,
  coordinationState,
  loadProviders,
  TRANSPORT_RATE_SMALL,
  TRANSPORT_RATE_BULK,
  BULK_THRESHOLD,
} = require('../../src/services/logisticsCoordination');

// ════════════════════════════════════════════════════════════════════════════
// STATE MACHINE TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Logistics State Machine', () => {
  test('REQUESTED → QUOTED is allowed', () => {
    expect(canTransition('logistics', 'REQUESTED', 'QUOTED')).toBe(true);
  });

  test('REQUESTED → ACCEPTED is NOT allowed (must go through QUOTED)', () => {
    expect(canTransition('logistics', 'REQUESTED', 'ACCEPTED')).toBe(false);
  });

  test('QUOTED → ACCEPTED is allowed', () => {
    expect(canTransition('logistics', 'QUOTED', 'ACCEPTED')).toBe(true);
  });

  test('ACCEPTED → SCHEDULED is allowed', () => {
    expect(canTransition('logistics', 'ACCEPTED', 'SCHEDULED')).toBe(true);
  });

  test('SCHEDULED → IN_TRANSIT is allowed', () => {
    expect(canTransition('logistics', 'SCHEDULED', 'IN_TRANSIT')).toBe(true);
  });

  test('IN_TRANSIT → DELIVERED is allowed', () => {
    expect(canTransition('logistics', 'IN_TRANSIT', 'DELIVERED')).toBe(true);
  });

  test('DELIVERED is terminal — no transitions allowed', () => {
    expect(allowedTransitions('logistics', 'DELIVERED')).toEqual([]);
  });

  test('REQUESTED → CANCELLED is allowed', () => {
    expect(canTransition('logistics', 'REQUESTED', 'CANCELLED')).toBe(true);
  });

  test('QUOTED → CANCELLED is allowed', () => {
    expect(canTransition('logistics', 'QUOTED', 'CANCELLED')).toBe(true);
  });

  test('ACCEPTED → CANCELLED is allowed', () => {
    expect(canTransition('logistics', 'ACCEPTED', 'CANCELLED')).toBe(true);
  });

  test('SCHEDULED → CANCELLED is allowed', () => {
    expect(canTransition('logistics', 'SCHEDULED', 'CANCELLED')).toBe(true);
  });

  test('IN_TRANSIT → CANCELLED is allowed', () => {
    expect(canTransition('logistics', 'IN_TRANSIT', 'CANCELLED')).toBe(true);
  });

  test('CANCELLED is terminal — no transitions allowed', () => {
    expect(allowedTransitions('logistics', 'CANCELLED')).toEqual([]);
  });

  test('DELIVERED → CANCELLED is NOT allowed', () => {
    expect(canTransition('logistics', 'DELIVERED', 'CANCELLED')).toBe(false);
  });

  test('IN_TRANSIT → QUOTED is NOT allowed (cannot re-quote in transit)', () => {
    expect(canTransition('logistics', 'IN_TRANSIT', 'QUOTED')).toBe(false);
  });

  test('SCHEDULED → QUOTED is NOT allowed', () => {
    expect(canTransition('logistics', 'SCHEDULED', 'QUOTED')).toBe(false);
  });

  test('transition() mutates record and appends history', () => {
    const record = { status: 'REQUESTED', history: [] };
    transition('logistics', record, 'QUOTED', { by: 'user1', note: 'Test quote' });
    expect(record.status).toBe('QUOTED');
    expect(record.history).toHaveLength(1);
    expect(record.history[0].from).toBe('REQUESTED');
    expect(record.history[0].to).toBe('QUOTED');
    expect(record.history[0].by).toBe('user1');
  });

  test('transition() throws on illegal transition', () => {
    const record = { status: 'DELIVERED', history: [] };
    expect(() => transition('logistics', record, 'REQUESTED')).toThrow('Illegal transition');
  });

  test('Full happy path: REQUESTED → QUOTED → ACCEPTED → SCHEDULED → IN_TRANSIT → DELIVERED', () => {
    const record = { status: 'REQUESTED', history: [] };
    transition('logistics', record, 'QUOTED');
    transition('logistics', record, 'ACCEPTED');
    transition('logistics', record, 'SCHEDULED');
    transition('logistics', record, 'IN_TRANSIT');
    transition('logistics', record, 'DELIVERED');
    expect(record.status).toBe('DELIVERED');
    expect(record.history).toHaveLength(5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM COST ESTIMATE TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('System Cost Estimate', () => {
  test('Small lot uses base rate (₹1.5/q/km)', () => {
    const result = systemEstimate(100, 10);
    expect(result.rate).toBe(TRANSPORT_RATE_SMALL);
    expect(result.tier).toBe('small_lcv');
    expect(result.costPerQuintal).toBe(150); // 1.5 * 100
    expect(result.costTotal).toBe(1500); // 150 * 10
  });

  test('Bulk lot uses bulk rate (₹0.75/q/km)', () => {
    const result = systemEstimate(100, 50);
    expect(result.rate).toBe(TRANSPORT_RATE_BULK);
    expect(result.tier).toBe('bulk');
    expect(result.costPerQuintal).toBe(75); // 0.75 * 100
    expect(result.costTotal).toBe(3750); // 75 * 50
  });

  test('Boundary: exactly 40q uses bulk rate', () => {
    const result = systemEstimate(100, BULK_THRESHOLD);
    expect(result.rate).toBe(TRANSPORT_RATE_BULK);
  });

  test('Boundary: 39.99q uses small rate', () => {
    const result = systemEstimate(100, 39.99);
    expect(result.rate).toBe(TRANSPORT_RATE_SMALL);
  });

  test('Zero distance returns zero cost', () => {
    const result = systemEstimate(0, 10);
    expect(result.costTotal).toBe(0);
  });

  test('Zero quantity returns zero cost', () => {
    const result = systemEstimate(100, 0);
    expect(result.costTotal).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PROVIDER MATCHING TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Provider Matching', () => {
  test('Finds providers serving origin district', () => {
    const providers = findProviders({ origin: 'Nashik', destination: 'Pune', quantityQuintals: 10 });
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.every(p => p.serviceDistricts.includes('Nashik'))).toBe(true);
  });

  test('Filters by capacity', () => {
    const providers = findProviders({ origin: 'Nashik', destination: 'Pune', quantityQuintals: 500 });
    expect(providers.every(p => p.maxCapacityQuintals >= 500)).toBe(true);
  });

  test('Filters by vehicle type', () => {
    const providers = findProviders({ origin: 'Nashik', destination: 'Pune', quantityQuintals: 10, transportType: 'Pickup' });
    expect(providers.every(p => p.vehicleTypes.includes('Pickup'))).toBe(true);
  });

  test('All providers are marked demo', () => {
    const providers = findProviders({ origin: 'Nashik', destination: 'Pune', quantityQuintals: 10 });
    expect(providers.every(p => p.demo === true)).toBe(true);
  });

  test('Trust tier is preserved', () => {
    const providers = findProviders({ origin: 'Nashik', destination: 'Pune', quantityQuintals: 10 });
    expect(providers.every(p => p.trustTier && p.trustTierLabel)).toBe(true);
  });

  test('Sorted by rate (cheapest first)', () => {
    const providers = findProviders({ origin: 'Nashik', destination: 'Pune', quantityQuintals: 10 });
    for (let i = 1; i < providers.length; i++) {
      expect(providers[i].ratePerQuintalPerKm).toBeGreaterThanOrEqual(providers[i - 1].ratePerQuintalPerKm);
    }
  });

  test('No providers for unknown district', () => {
    const providers = findProviders({ origin: 'Atlantis', destination: 'Pune', quantityQuintals: 10 });
    expect(providers).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// QUOTE GENERATION + COST CONSISTENCY TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Quote Generation & Cost Consistency', () => {
  const mockProvider = {
    id: 'tp1',
    baseRatePerQuintalPerKm: 1.5,
    bulkRatePerQuintalPerKm: 0.75,
    bulkThresholdQuintals: 40,
  };

  test('Quote includes system estimate and difference', () => {
    const quote = generateQuote(mockProvider, 100, 10);
    expect(quote.quotedCost).toBeDefined();
    expect(quote.systemEstimatedCost).toBeDefined();
    expect(quote.costDifference).toBeDefined();
    expect(quote.costDifferenceNote).toBeDefined();
  });

  test('Quote cost = rate × distance × quantity', () => {
    const quote = generateQuote(mockProvider, 100, 10);
    expect(quote.quotedCostPerQuintal).toBe(150); // 1.5 * 100
    expect(quote.quotedCost).toBe(1500); // 150 * 10
  });

  test('Bulk quote uses bulk rate', () => {
    const quote = generateQuote(mockProvider, 100, 50);
    expect(quote.quotedCostPerQuintal).toBe(75); // 0.75 * 100
  });

  test('System estimate matches documented rate', () => {
    const quote = generateQuote(mockProvider, 100, 10);
    expect(quote.systemEstimatedCostPerQuintal).toBe(150);
  });

  test('Difference is calculated correctly', () => {
    const quote = generateQuote(mockProvider, 100, 10);
    const expectedDiff = quote.quotedCostPerQuintal - quote.systemEstimatedCostPerQuintal;
    expect(quote.costDifference).toBe(Math.round(expectedDiff * 100) / 100);
  });

  test('Zero difference has correct note', () => {
    // System estimate and provider rate are the same for tp1 small lot
    const quote = generateQuote(mockProvider, 100, 10);
    // tp1 base rate = 1.5, system rate = 1.5 → difference = 0
    expect(quote.costDifference).toBe(0);
    expect(quote.costDifferenceNote).toContain('matches');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LOT INTEGRITY VALIDATION TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Lot Integrity Validation', () => {
  test('Valid request passes validation', () => {
    const lot = { status: 'OPEN', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 10 });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('Null lot fails', () => {
    const result = validateRequest(null, { origin: 'Nashik', destination: 'Pune', quantity: 10 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Lot not found');
  });

  test('CLOSED lot fails', () => {
    const lot = { status: 'CLOSED', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 10 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('CLOSED');
  });

  test('WITHDRAWN lot fails', () => {
    const lot = { status: 'WITHDRAWN', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 10 });
    expect(result.ok).toBe(false);
  });

  test('OFFERED lot passes', () => {
    const lot = { status: 'OFFERED', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 10 });
    expect(result.ok).toBe(true);
  });

  test('Quantity exceeding lot fails', () => {
    const lot = { status: 'OPEN', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 20 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('exceeds lot quantity');
  });

  test('Missing origin fails', () => {
    const lot = { status: 'OPEN', quantity: 10 };
    const result = validateRequest(lot, { origin: '', destination: 'Pune', quantity: 10 });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('origin'))).toBe(true);
  });

  test('Missing destination fails', () => {
    const lot = { status: 'OPEN', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: '', quantity: 10 });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('destination'))).toBe(true);
  });

  test('Zero quantity fails', () => {
    const lot = { status: 'OPEN', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 0 });
    expect(result.ok).toBe(false);
  });

  test('Non-numeric quantity fails', () => {
    const lot = { status: 'OPEN', quantity: 10 };
    const result = validateRequest(lot, { origin: 'Nashik', destination: 'Pune', quantity: 'abc' });
    expect(result.ok).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// COORDINATION STATE TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Coordination State', () => {
  test('REQUESTED state shows canQuote=true', () => {
    const state = coordinationState({ status: 'REQUESTED' });
    expect(state.canQuote).toBe(true);
    expect(state.canAccept).toBe(false);
    expect(state.isTerminal).toBe(false);
  });

  test('QUOTED state shows canAccept=true', () => {
    const state = coordinationState({ status: 'QUOTED' });
    expect(state.canQuote).toBe(false);
    expect(state.canAccept).toBe(true);
    expect(state.canCancel).toBe(true);
  });

  test('DELIVERED is terminal', () => {
    const state = coordinationState({ status: 'DELIVERED' });
    expect(state.isTerminal).toBe(true);
    expect(state.allowedTransitions).toHaveLength(0);
  });

  test('CANCELLED is terminal', () => {
    const state = coordinationState({ status: 'CANCELLED' });
    expect(state.isTerminal).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PROVIDER DIRECTORY TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('Provider Directory', () => {
  test('Loads 4 demo providers', () => {
    const data = loadProviders();
    expect(data.providers).toHaveLength(4);
  });

  test('All providers have trust tiers', () => {
    const data = loadProviders();
    expect(data.providers.every(p => p.trustTier)).toBe(true);
  });

  test('All providers have service districts', () => {
    const data = loadProviders();
    expect(data.providers.every(p => p.serviceDistricts.length > 0)).toBe(true);
  });

  test('All providers have rates', () => {
    const data = loadProviders();
    expect(data.providers.every(p => p.baseRatePerQuintalPerKm > 0)).toBe(true);
    expect(data.providers.every(p => p.bulkRatePerQuintalPerKm > 0)).toBe(true);
  });

  test('Bulk rate is lower than base rate for all providers', () => {
    const data = loadProviders();
    expect(data.providers.every(p => p.bulkRatePerQuintalPerKm < p.baseRatePerQuintalPerKm)).toBe(true);
  });

  test('Meta includes trust tier definitions', () => {
    const data = loadProviders();
    expect(data.meta.trustTiers).toBeDefined();
    expect(Object.keys(data.meta.trustTiers).length).toBeGreaterThan(0);
  });
});

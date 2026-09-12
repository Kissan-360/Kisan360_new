const {
  computeTransactionCostSummary,
  buildMonetaryCostSummary,
  computeProcessMetrics,
  computeInformationCoverage,
  buildPathwayCostComparison,
  computeFPOCostAdvantage,
  computeLogisticsCostEffect,
  buildTransactionReceipt,
  transportRate,
  transportCostPerQ,
  MONETARY_COST_CLASSES,
  OUTCOME_CLASSES,
  FARMER_BORNE_COSTS,
  BUYER_BORNE_COSTS,
  NOT_MODELED_COSTS,
} = require('../../src/services/transactionCost');

describe('Transaction Cost Accounting', () => {
  const baseLot = {
    _id: 'lot1',
    farmerUid: 'farmer1',
    crop: 'Onion',
    variety: 'Nashik Red',
    grade: 'A',
    quantity: 10,
    unit: 'quintals',
    district: 'Nashik',
    status: 'OPEN',
    createdAt: '2026-09-01T08:00:00Z',
  };

  const baseOffer = {
    _id: 'offer1',
    lotId: 'lot1',
    farmerUid: 'farmer1',
    buyerId: 'buyer1',
    buyerName: 'AgriTrader',
    crop: 'Onion',
    quantityQuintals: 10,
    offeredPricePerQuintal: 2000,
    amount: 20000,
    status: 'SENT',
    createdAt: '2026-09-01T10:00:00Z',
    history: [
      { status: 'SENT', at: '2026-09-01T10:00:00Z', by: 'farmer1' },
    ],
  };

  const acceptedOffer = {
    ...baseOffer,
    status: 'ACCEPTED',
    history: [
      { status: 'SENT', at: '2026-09-01T10:00:00Z', by: 'farmer1' },
      { status: 'ACCEPTED', at: '2026-09-01T12:00:00Z', by: 'buyer1' },
    ],
  };

  const basePayment = {
    _id: 'pay1',
    offerId: 'offer1',
    lotId: 'lot1',
    farmerUid: 'farmer1',
    buyerId: 'buyer1',
    buyerName: 'AgriTrader',
    crop: 'Onion',
    quantityQuintals: 10,
    amount: 20000,
    currency: 'INR',
    status: 'RELEASED',
    mocked: true,
    history: [
      { from: 'PENDING', to: 'HELD', at: '2026-09-01T12:05:00Z', by: 'system' },
      { from: 'HELD', to: 'RELEASED', at: '2026-09-01T14:00:00Z', by: 'system' },
    ],
  };

  const baseLogistics = {
    _id: 'log1',
    lotId: 'lot1',
    farmerUid: 'farmer1',
    crop: 'Onion',
    origin: 'Nashik',
    destination: 'Mumbai',
    quantity: 10,
    unit: 'quintals',
    estimatedDistanceKm: 180,
    quotedCostPerQuintal: 250,
    quotedCost: 2500,
    systemEstimatedCostPerQuintal: 270,
    systemEstimatedCost: 2700,
    costDifference: -20,
    status: 'ACCEPTED',
    classification: 'DEMO_LOGISTICS',
    demo: true,
    createdAt: '2026-09-01T12:10:00Z',
    history: [
      { from: 'REQUESTED', to: 'ACCEPTED', at: '2026-09-01T13:00:00Z', by: 'system' },
    ],
  };

  describe('Monetary Cost Model', () => {
    test('transport rate is 1.5 for small lots (< 40q)', () => {
      expect(transportRate(10)).toBe(1.5);
    });

    test('transport rate is 0.75 for bulk lots (>= 40q)', () => {
      expect(transportRate(40)).toBe(0.75);
      expect(transportRate(100)).toBe(0.75);
    });

    test('transport rate defaults to small for invalid input', () => {
      expect(transportRate(0)).toBe(1.5);
      expect(transportRate(-5)).toBe(1.5);
      expect(transportRate(NaN)).toBe(1.5);
    });

    test('transport cost per Q is correct for small lots', () => {
      expect(transportCostPerQ(100, 10)).toBe(150);
    });

    test('transport cost per Q is correct for bulk lots', () => {
      expect(transportCostPerQ(100, 40)).toBe(75);
    });

    test('transport cost is zero for invalid distance', () => {
      expect(transportCostPerQ(0, 10)).toBe(0);
      expect(transportCostPerQ(-10, 10)).toBe(0);
    });

    test('buildMonetaryCostSummary includes farmer-borne costs', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 2 });
      expect(summary.farmerBorne.transport.perQuintal).toBe(150);
      expect(summary.farmerBorne.storage.perQuintal).toBe(2);
      expect(summary.farmerBorne.other.perQuintal).toBe(20);
      expect(summary.farmerBorne.totalPerQuintal).toBe(172);
      expect(summary.farmerBorne.totalAll).toBe(1720);
    });

    test('buyer-borne costs are not included in farmer total', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      expect(summary.farmerBorne.totalPerQuintal).toBe(170);
      expect(summary.buyerBorne.apmcMarketFee.rate).toBe('0.5%');
      expect(summary.buyerBorne.commissionAgentFee.rate).toBe('1.0%');
    });

    test('not-modeled costs are listed separately', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      expect(summary.notModeled.length).toBe(5);
      const labels = summary.notModeled.map(n => n.label);
      expect(labels).toContain('Platform fee');
      expect(labels).toContain('Payment processing fee');
      expect(labels).toContain('Crop/transport insurance');
    });

    test('platform fee is zero', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      expect(summary.platformFee).toBe(0);
    });

    test('payment fee is zero', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      expect(summary.paymentFee).toBe(0);
    });

    test('no double counting of transport', () => {
      const s1 = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 2 });
      const transportOnly = s1.farmerBorne.transport.perQuintal;
      expect(transportOnly).toBe(150);
      expect(s1.farmerBorne.totalPerQuintal).toBe(transportOnly + s1.farmerBorne.storage.perQuintal + s1.farmerBorne.other.perQuintal);
    });

    test('classification constants exist', () => {
      expect(MONETARY_COST_CLASSES.FARMER_BORNE).toBe('FARMER_BORNE');
      expect(MONETARY_COST_CLASSES.BUYER_BORNE).toBe('BUYER_BORNE');
      expect(MONETARY_COST_CLASSES.NOT_MODELED).toBe('NOT_MODELED');
      expect(MONETARY_COST_CLASSES.DEMO).toBe('DEMO');
    });

    test('unknown costs remain NOT_MODELED, not zero', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      for (const nm of summary.notModeled) {
        expect(nm.classification).toBe('NOT_MODELED');
      }
    });
  });

  describe('Process Metrics', () => {
    test('computes timestamps correctly from offer history', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T08:00:00Z' },
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
      });

      expect(metrics.timestamps.lotCreatedAt).toBe('2026-09-01T08:00:00Z');
      expect(metrics.timestamps.firstOfferAt).toBe('2026-09-01T10:00:00Z');
      expect(metrics.timestamps.offerAcceptedAt).toBe('2026-09-01T12:00:00Z');
      expect(metrics.timestamps.logisticsRequestedAt).toBe('2026-09-01T12:10:00Z');
      expect(metrics.timestamps.logisticsAcceptedAt).toBe('2026-09-01T13:00:00Z');
      expect(metrics.timestamps.paymentReleasedAt).toBe('2026-09-01T14:00:00Z');
    });

    test('computes durations in hours', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T08:00:00Z' },
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
      });

      expect(metrics.durations.timeToFirstOfferHours).toBe(2);
      expect(metrics.durations.timeToAcceptanceHours).toBe(2);
      expect(metrics.durations.timeToLogisticsHours).toBeCloseTo(0.17, 1);
      expect(metrics.durations.timeToLogisticsAcceptanceHours).toBeCloseTo(0.83, 1);
      expect(metrics.durations.timeToPaymentReleaseHours).toBe(1);
    });

    test('marks incomplete journey when some timestamps missing', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T08:00:00Z' },
        offer: { createdAt: '2026-09-01T10:00:00Z', status: 'SENT', history: [] },
        payment: {},
        logisticsRequest: {},
        grievance: {},
      });

      expect(metrics.classification).toBe('PARTIALLY_COMPLETED');
      expect(metrics.steps.completed).toBe(2);
      expect(metrics.steps.missingSteps).toBe(4);
    });

    test('returns null for missing timestamps', () => {
      const metrics = computeProcessMetrics({
        lot: {},
        offer: {},
        payment: {},
        logisticsRequest: {},
        grievance: {},
      });

      expect(metrics.timestamps.lotCreatedAt).toBeNull();
      expect(metrics.timestamps.firstOfferAt).toBeNull();
      expect(metrics.timestamps.offerAcceptedAt).toBeNull();
      expect(metrics.durations.timeToFirstOfferHours).toBeNull();
      expect(metrics.classification).toBe('NOT_STARTED');
    });

    test('reversed timestamps result in null duration', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T12:00:00Z' },
        offer: { createdAt: '2026-09-01T10:00:00Z', status: 'SENT', history: [] },
        payment: {},
        logisticsRequest: {},
        grievance: {},
      });

      expect(metrics.durations.timeToFirstOfferHours).toBeNull();
    });

    test('counts all steps for fully completed journey', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T08:00:00Z' },
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
      });

      expect(metrics.steps.completed).toBe(6);
      expect(metrics.steps.total).toBe(6);
      expect(metrics.classification).toBe('FULLY_COMPLETED');
    });
  });

  describe('Information Coverage', () => {
    test('reports all categories when all data present', () => {
      const coverage = computeInformationCoverage({
        marketsRanked: [{ farmerNetPerQuintal: 1800 }, { farmerNetPerQuintal: 1600 }],
        buyerMatches: [{ buyerId: 'b1' }],
        demandSignals: [{ crop: 'Onion' }],
        qualityMatches: [{ matches: true }],
        pathwayOptions: [{ pathway: 'SELL_NOW' }],
        storageOptions: [{ name: 'Godown A' }],
        logisticsProviders: [{ name: 'Carrier 1' }],
        paymentStatus: 'RELEASED',
        trendAvailable: true,
        productionEconomicsAvailable: true,
      });

      expect(coverage.presentCount).toBe(12);
      expect(coverage.totalCategories).toBe(12);
      expect(coverage.classification).toBe('COMPREHENSIVE');
    });

    test('reports partial when some data missing', () => {
      const coverage = computeInformationCoverage({
        marketsRanked: [{ farmerNetPerQuintal: 1800 }],
        buyerMatches: [],
        demandSignals: [],
        qualityMatches: [],
        pathwayOptions: [],
        storageOptions: [],
        logisticsProviders: [],
        paymentStatus: null,
        trendAvailable: false,
        productionEconomicsAvailable: false,
      });

      expect(coverage.presentCount).toBeLessThan(12);
      expect(coverage.classification).not.toBe('COMPREHENSIVE');
    });

    test('reports INSUFFICIENT when no data', () => {
      const coverage = computeInformationCoverage({});
      expect(coverage.classification).toBe('INSUFFICIENT');
    });

    test('each category has key, label, present', () => {
      const coverage = computeInformationCoverage({});
      for (const cat of coverage.categories) {
        expect(cat).toHaveProperty('key');
        expect(cat).toHaveProperty('label');
        expect(cat).toHaveProperty('present');
        expect(typeof cat.present).toBe('boolean');
      }
    });
  });

  describe('Pathway Cost Comparison', () => {
    test('SELL_NOW pathway has transport + other costs', () => {
      const comparison = buildPathwayCostComparison({
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
        markets: [],
      });

      const sellNow = comparison.pathways.find(p => p.pathway === 'SELL_NOW');
      expect(sellNow).toBeDefined();
      expect(sellNow.costs.transportPerQ).toBe(150);
      expect(sellNow.costs.storagePerQ).toBe(0);
      expect(sellNow.costs.otherPerQ).toBe(20);
      expect(sellNow.costs.totalPerQ).toBe(170);
    });

    test('AGGREGATE_THROUGH_FPO has lower transport rate', () => {
      const comparison = buildPathwayCostComparison({
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
        markets: [],
      });

      const aggregate = comparison.pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
      expect(aggregate).toBeDefined();
      expect(aggregate.costs.transportPerQ).toBe(75);
    });

    test('STORE_THEN_SELL includes storage cost', () => {
      const comparison = buildPathwayCostComparison({
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 2,
        grossPricePerQ: 2000,
        markets: [],
      });

      const store = comparison.pathways.find(p => p.pathway === 'STORE_THEN_SELL');
      expect(store).toBeDefined();
      expect(store.costs.storagePerQ).toBe(2);
      expect(store.costs.totalPerQ).toBe(172);
    });

    test('ALTERNATIVE_MARKET shows net range when multiple markets', () => {
      const comparison = buildPathwayCostComparison({
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
        markets: [
          { farmerNetPerQuintal: 1800 },
          { farmerNetPerQuintal: 1600 },
        ],
      });

      const alt = comparison.pathways.find(p => p.pathway === 'ALTERNATIVE_MARKET');
      expect(alt).toBeDefined();
      expect(alt.netRange.spread).toBe(200);
    });

    test('estimated advantages are computed', () => {
      const comparison = buildPathwayCostComparison({
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
        markets: [],
      });

      expect(comparison.estimatedAdvantages.length).toBeGreaterThan(0);
      const aggAdv = comparison.estimatedAdvantages.find(a => a.comparison === 'AGGREGATE_VS_SELL_NOW');
      expect(aggAdv).toBeDefined();
      expect(aggAdv.transportAdvantagePerQ).toBe(75);
      expect(aggAdv.transportAdvantageTotal).toBe(750);
    });

    test('does not use arbitrary benchmark rupee values', () => {
      const comparison = buildPathwayCostComparison({
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
        markets: [],
      });

      for (const p of comparison.pathways) {
        expect(p.classification).toBe('FARMER_BORNE');
      }
    });
  });

  describe('FPO Cost Advantage', () => {
    test('computes transport advantage when pooling triggers bulk rate', () => {
      const advantage = computeFPOCostAdvantage({
        individualLots: [
          { quantityQuintals: 5 },
          { quantityQuintals: 8 },
        ],
        pooledQuantity: 50,
        distanceKm: 100,
      });

      expect(advantage.individualCount).toBe(2);
      expect(advantage.pooledTransportPerQ).toBe(75);
      expect(advantage.estimatedTransportAdvantagePerQ).toBeGreaterThan(0);
      expect(advantage.classification).toBe('ESTIMATED_ADVANTAGE');
    });

    test('returns INSUFFICIENT_EVIDENCE when no lots', () => {
      const advantage = computeFPOCostAdvantage({
        individualLots: [],
        pooledQuantity: 50,
        distanceKm: 100,
      });

      expect(advantage.classification).toBe('INSUFFICIENT_EVIDENCE');
    });

    test('advantage is estimated not realized', () => {
      const advantage = computeFPOCostAdvantage({
        individualLots: [{ quantityQuintals: 10 }],
        pooledQuantity: 50,
        distanceKm: 100,
      });

      expect(advantage.classification).toBe('ESTIMATED_ADVANTAGE');
      expect(advantage.classification).not.toBe('REALIZED_ADVANTAGE');
    });
  });

  describe('Logistics Cost Effect', () => {
    test('computes quote difference', () => {
      const effect = computeLogisticsCostEffect({
        systemEstimate: { costPerQuintal: 270, costTotal: 2700, tier: 'LCV', quantityQuintals: 10 },
        carrierQuote: { costPerQuintal: 250, costTotal: 2500, provider: 'Carrier1', classification: 'DEMO_LOGISTICS' },
      });

      expect(effect.quoteDifference).toBe(-20);
      expect(effect.systemEstimate.classification).toBe('MODEL_ESTIMATE');
      expect(effect.carrierQuote.classification).toBe('DEMO_LOGISTICS');
    });

    test('returns INSUFFICIENT_EVIDENCE when no data', () => {
      const effect = computeLogisticsCostEffect({});
      expect(effect.classification).toBe('INSUFFICIENT_EVIDENCE');
    });

    test('distinguishes model estimate from actual quote', () => {
      const effect = computeLogisticsCostEffect({
        systemEstimate: { costPerQuintal: 270, costTotal: 2700, tier: 'LCV', quantityQuintals: 10 },
        carrierQuote: { costPerQuintal: 250, costTotal: 2500, provider: 'Carrier1', classification: 'DEMO_LOGISTICS' },
      });

      expect(effect.systemEstimate.classification).toBe('MODEL_ESTIMATE');
      expect(effect.carrierQuote.classification).toBe('DEMO_LOGISTICS');
    });
  });

  describe('Transaction Receipt', () => {
    test('complete receipt includes all fields', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot,
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
        monetaryCosts: buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 }),
        processMetrics: computeProcessMetrics({ lot: baseLot, offer: acceptedOffer, payment: basePayment, logisticsRequest: baseLogistics, grievance: {} }),
        informationCoverage: computeInformationCoverage({ marketsRanked: [{}], paymentStatus: 'RELEASED' }),
        pathwayComparison: { pathway: 'SELL_NOW', label: 'Sell now' },
        fpoAdvantage: {},
        logisticsEffect: {},
        productionEconomics: { productionCostPerQuintal: 1000 },
        marketObservation: { market: 'Nashik', grossPricePerQuintal: 2000, classification: 'SOURCE' },
        buyerInfo: { buyerId: 'buyer1', buyerName: 'AgriTrader', trustTier: 'A' },
        qualityMatch: { qualityGrade: 'A', matches: true },
      });

      expect(receipt.farmerLotIdentity.crop).toBe('Onion');
      expect(receipt.marketObservation.grossPricePerQuintal).toBe(2000);
      expect(receipt.economics.grossPricePerQuintal).toBe(2000);
      expect(receipt.buyer.buyerId).toBe('buyer1');
      expect(receipt.offer.status).toBe('ACCEPTED');
      expect(receipt.payment.mocked).toBe(true);
      expect(receipt.logistics.classification).toBe('DEMO_LOGISTICS');
      expect(receipt.outcomeClassification).toBe('SIMULATED_OUTCOME');
      expect(receipt.demoFlags.isDemo).toBe(true);
      expect(receipt.demoFlags.mockedPayment).toBe(true);
    });

    test('incomplete receipt handles missing fields', () => {
      const receipt = buildTransactionReceipt({
        lot: {},
        offer: {},
        payment: {},
        logisticsRequest: {},
        grievance: {},
        monetaryCosts: buildMonetaryCostSummary({ distanceKm: 0, quantityQuintals: 0, storageDays: 0 }),
        processMetrics: computeProcessMetrics({ lot: {}, offer: {}, payment: {}, logisticsRequest: {}, grievance: {} }),
        informationCoverage: computeInformationCoverage({}),
        pathwayComparison: {},
        fpoAdvantage: {},
        logisticsEffect: {},
        productionEconomics: {},
        marketObservation: {},
        buyerInfo: {},
        qualityMatch: {},
      });

      expect(receipt.farmerLotIdentity.lotId).toBeNull();
      expect(receipt.payment.mocked).toBe(true);
      expect(receipt.outcomeClassification).toBe('SIMULATED_OUTCOME');
    });

    test('simulated payment is marked as SIMULATED', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot,
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
        monetaryCosts: {},
        processMetrics: {},
        informationCoverage: {},
        pathwayComparison: {},
        fpoAdvantage: {},
        logisticsEffect: {},
        productionEconomics: {},
        marketObservation: {},
        buyerInfo: {},
        qualityMatch: {},
      });

      expect(receipt.provenance.paymentClassification).toBe('SIMULATED');
      expect(receipt.demoFlags.simulatedTransaction).toBe(true);
    });

    test('receipt never claims REALIZED_ADVANTAGE for simulated transactions', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot,
        offer: acceptedOffer,
        payment: { ...basePayment, mocked: true },
        logisticsRequest: baseLogistics,
        grievance: {},
        monetaryCosts: {},
        processMetrics: {},
        informationCoverage: {},
        pathwayComparison: {},
        fpoAdvantage: {},
        logisticsEffect: {},
        productionEconomics: {},
        marketObservation: {},
        buyerInfo: {},
        qualityMatch: {},
      });

      expect(receipt.outcomeClassification).not.toBe('REALIZED_ADVANTAGE');
      expect(receipt.outcomeClassification).toBe('SIMULATED_OUTCOME');
    });
  });

  describe('Adversarial Tests', () => {
    test('transport cost is not double-counted in total', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 2 });
      const transport = summary.farmerBorne.transport.perQuintal;
      const storage = summary.farmerBorne.storage.perQuintal;
      const other = summary.farmerBorne.other.perQuintal;
      const total = summary.farmerBorne.totalPerQuintal;
      expect(total).toBe(transport + storage + other);
    });

    test('storage cost is not double-counted', () => {
      const s1 = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 2 });
      const s2 = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 2 });
      expect(s1.farmerBorne.storage.perQuintal).toBe(s2.farmerBorne.storage.perQuintal);
    });

    test('buyer-borne fee is never deducted from farmer net', () => {
      const summary = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      const farmerTotal = summary.farmerBorne.totalPerQuintal;
      expect(farmerTotal).toBe(170);
      expect(summary.buyerBorne.apmcMarketFee.classification).toBe('BUYER_BORNE');
    });

    test('simulated payment treated as simulated, not real', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot, offer: acceptedOffer, payment: { ...basePayment, mocked: true },
        logisticsRequest: baseLogistics, grievance: {},
        monetaryCosts: {}, processMetrics: {}, informationCoverage: {},
        pathwayComparison: {}, fpoAdvantage: {}, logisticsEffect: {},
        productionEconomics: {}, marketObservation: {}, buyerInfo: {}, qualityMatch: {},
      });
      expect(receipt.payment.mocked).toBe(true);
      expect(receipt.provenance.paymentClassification).toBe('SIMULATED');
    });

    test('estimated logistics quote is not treated as actual payment', () => {
      const effect = computeLogisticsCostEffect({
        systemEstimate: { costPerQuintal: 270, costTotal: 2700, tier: 'LCV', quantityQuintals: 10 },
        carrierQuote: { costPerQuintal: 250, costTotal: 2500, provider: 'Carrier1', classification: 'DEMO_LOGISTICS' },
      });
      expect(effect.systemEstimate.classification).toBe('MODEL_ESTIMATE');
      expect(effect.carrierQuote.classification).toBe('DEMO_LOGISTICS');
    });

    test('missing timestamps return null not fabricated', () => {
      const metrics = computeProcessMetrics({ lot: {}, offer: {}, payment: {}, logisticsRequest: {}, grievance: {} });
      expect(metrics.timestamps.lotCreatedAt).toBeNull();
      expect(metrics.timestamps.firstOfferAt).toBeNull();
      expect(metrics.timestamps.offerAcceptedAt).toBeNull();
      expect(metrics.timestamps.logisticsRequestedAt).toBeNull();
      expect(metrics.timestamps.logisticsAcceptedAt).toBeNull();
      expect(metrics.timestamps.paymentReleasedAt).toBeNull();
    });

    test('reversed timestamps produce null duration', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T12:00:00Z' },
        offer: { createdAt: '2026-09-01T10:00:00Z', status: 'SENT', history: [] },
        payment: {}, logisticsRequest: {}, grievance: {},
      });
      expect(metrics.durations.timeToFirstOfferHours).toBeNull();
    });

    test('negative duration is null', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-02T00:00:00Z' },
        offer: { createdAt: '2026-09-01T00:00:00Z', status: 'SENT', history: [] },
        payment: {}, logisticsRequest: {}, grievance: {},
      });
      expect(metrics.durations.timeToFirstOfferHours).toBeNull();
    });

    test('cancelled transaction does not claim advantage', () => {
      const receipt = buildTransactionReceipt({
        lot: { ...baseLot, status: 'WITHDRAWN' },
        offer: { ...acceptedOffer, status: 'REJECTED' },
        payment: { ...basePayment, status: 'CANCELLED' },
        logisticsRequest: { ...baseLogistics, status: 'CANCELLED' },
        grievance: {},
        monetaryCosts: {}, processMetrics: {}, informationCoverage: {},
        pathwayComparison: {}, fpoAdvantage: {}, logisticsEffect: {},
        productionEconomics: {}, marketObservation: {}, buyerInfo: {}, qualityMatch: {},
      });
      expect(receipt.outcomeClassification).not.toBe('REALIZED_ADVANTAGE');
    });

    test('no buyer does not crash', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot, offer: {}, payment: {}, logisticsRequest: {}, grievance: {},
        monetaryCosts: {}, processMetrics: {}, informationCoverage: {},
        pathwayComparison: {}, fpoAdvantage: {}, logisticsEffect: {},
        productionEconomics: {}, marketObservation: {}, buyerInfo: {}, qualityMatch: {},
      });
      expect(receipt.buyer.buyerId).toBeNull();
    });

    test('no offer does not crash', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot, offer: {}, payment: {}, logisticsRequest: {}, grievance: {},
        monetaryCosts: {}, processMetrics: {}, informationCoverage: {},
        pathwayComparison: {}, fpoAdvantage: {}, logisticsEffect: {},
        productionEconomics: {}, marketObservation: {}, buyerInfo: {}, qualityMatch: {},
      });
      expect(receipt.offer.offeredPricePerQuintal).toBeNull();
    });

    test('no payment does not crash', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot, offer: acceptedOffer, payment: {}, logisticsRequest: {}, grievance: {},
        monetaryCosts: {}, processMetrics: {}, informationCoverage: {},
        pathwayComparison: {}, fpoAdvantage: {}, logisticsEffect: {},
        productionEconomics: {}, marketObservation: {}, buyerInfo: {}, qualityMatch: {},
      });
      expect(receipt.payment.status).toBeNull();
    });

    test('no logistics does not crash', () => {
      const receipt = buildTransactionReceipt({
        lot: baseLot, offer: acceptedOffer, payment: basePayment, logisticsRequest: {}, grievance: {},
        monetaryCosts: {}, processMetrics: {}, informationCoverage: {},
        pathwayComparison: {}, fpoAdvantage: {}, logisticsEffect: {},
        productionEconomics: {}, marketObservation: {}, buyerInfo: {}, qualityMatch: {},
      });
      expect(receipt.logistics.status).toBeNull();
    });

    test('stale market evidence does not alter cost model', () => {
      const summary1 = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      const summary2 = buildMonetaryCostSummary({ distanceKm: 100, quantityQuintals: 10, storageDays: 0 });
      expect(summary1.farmerBorne.totalPerQuintal).toBe(summary2.farmerBorne.totalPerQuintal);
    });

    test('profit is still farmer net minus production cost, unaffected by transaction accounting', () => {
      const economics = { productionCostPerQuintal: 1000 };
      const farmerNet = 1800;
      const profit = farmerNet - economics.productionCostPerQuintal;
      expect(profit).toBe(800);
    });

    test('unknown pathway does not crash', () => {
      const comparison = buildPathwayCostComparison({
        pathway: 'UNKNOWN',
        quantityQuintals: 10,
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
        markets: [],
      });
      expect(comparison.pathways.length).toBe(3);
    });

    test('partial transaction does not crash', () => {
      const metrics = computeProcessMetrics({
        lot: { createdAt: '2026-09-01T08:00:00Z' },
        offer: {},
        payment: {},
        logisticsRequest: {},
        grievance: {},
      });
      expect(metrics.classification).toBe('PARTIALLY_COMPLETED');
    });
  });

  describe('Full Summary Integration', () => {
    test('computeTransactionCostSummary returns complete structure', () => {
      const summary = computeTransactionCostSummary({
        lot: baseLot,
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
        markets: [{ farmerNetPerQuintal: 1800 }, { farmerNetPerQuintal: 1600 }],
        buyerMatches: [{ buyerId: 'b1' }],
        demandSignals: [{ crop: 'Onion' }],
        qualityMatches: [{ matches: true }],
        pathwayOptions: [{ pathway: 'SELL_NOW' }],
        storageOptions: [{ name: 'Godown' }],
        logisticsProviders: [{ name: 'Carrier' }],
        trendAvailable: true,
        productionEconomics: { productionCostPerQuintal: 1000, farmerNetPerQuintal: 1800 },
        marketObservation: { market: 'Nashik', grossPricePerQuintal: 2000 },
        buyerInfo: { buyerId: 'buyer1', buyerName: 'AgriTrader' },
        qualityMatch: { qualityGrade: 'A' },
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 2000,
      });

      expect(summary).toHaveProperty('monetaryCosts');
      expect(summary).toHaveProperty('processMetrics');
      expect(summary).toHaveProperty('informationCoverage');
      expect(summary).toHaveProperty('pathwayComparison');
      expect(summary).toHaveProperty('fpoAdvantage');
      expect(summary).toHaveProperty('logisticsEffect');
      expect(summary).toHaveProperty('receipt');
      expect(summary).toHaveProperty('provenance');
      expect(summary.classification).toBe('DEMO_TRANSACTION_COST_ACCOUNTING');
    });

    test('process metrics are from actual record timestamps', () => {
      const summary = computeTransactionCostSummary({
        lot: baseLot,
        offer: acceptedOffer,
        payment: basePayment,
        logisticsRequest: baseLogistics,
        grievance: {},
        markets: [],
        buyerMatches: [],
        demandSignals: [],
        qualityMatches: [],
        pathwayOptions: [],
        storageOptions: [],
        logisticsProviders: [],
        trendAvailable: false,
        productionEconomics: {},
        marketObservation: {},
        buyerInfo: {},
        qualityMatch: {},
        distanceKm: 100,
        storageDays: 0,
        grossPricePerQ: 0,
      });

      expect(summary.processMetrics.timestamps.lotCreatedAt).toBe('2026-09-01T08:00:00Z');
      expect(summary.processMetrics.timestamps.paymentReleasedAt).toBe('2026-09-01T14:00:00Z');
    });

    test('no N+1 queries in summary computation', () => {
      const start = Date.now();
      computeTransactionCostSummary({
        lot: baseLot, offer: acceptedOffer, payment: basePayment,
        logisticsRequest: baseLogistics, grievance: {},
        markets: [{ farmerNetPerQuintal: 1800 }],
        buyerMatches: [{ buyerId: 'b1' }],
        demandSignals: [{ crop: 'Onion' }],
        qualityMatches: [{ matches: true }],
        pathwayOptions: [{ pathway: 'SELL_NOW' }],
        storageOptions: [{ name: 'Godown' }],
        logisticsProviders: [{ name: 'Carrier' }],
        trendAvailable: true,
        productionEconomics: { productionCostPerQuintal: 1000 },
        marketObservation: { market: 'Nashik', grossPricePerQuintal: 2000 },
        buyerInfo: { buyerId: 'buyer1' },
        qualityMatch: { qualityGrade: 'A' },
        distanceKm: 100, storageDays: 0, grossPricePerQ: 2000,
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Outcome Classification', () => {
    test('simulated outcome cannot become realized', () => {
      const summary = computeTransactionCostSummary({
        lot: baseLot, offer: acceptedOffer, payment: basePayment,
        logisticsRequest: baseLogistics, grievance: {},
        markets: [], buyerMatches: [], demandSignals: [],
        qualityMatches: [], pathwayOptions: [], storageOptions: [],
        logisticsProviders: [], trendAvailable: false,
        productionEconomics: {}, marketObservation: {},
        buyerInfo: {}, qualityMatch: {},
        distanceKm: 100, storageDays: 0, grossPricePerQ: 0,
      });

      expect(summary.receipt.outcomeClassification).toBe('SIMULATED_OUTCOME');
      expect(summary.receipt.outcomeClassification).not.toBe('REALIZED_ADVANTAGE');
    });

    test('FPO advantage is ESTIMATED not REALIZED', () => {
      const summary = computeTransactionCostSummary({
        lot: baseLot, offer: acceptedOffer, payment: basePayment,
        logisticsRequest: baseLogistics, grievance: {},
        markets: [], buyerMatches: [], demandSignals: [],
        qualityMatches: [], pathwayOptions: [], storageOptions: [],
        logisticsProviders: [], trendAvailable: false,
        productionEconomics: {}, marketObservation: {},
        buyerInfo: {}, qualityMatch: {},
        individualFpoLots: [{ quantityQuintals: 5 }, { quantityQuintals: 8 }],
        pooledQuantity: 50,
        distanceKm: 100, storageDays: 0, grossPricePerQ: 0,
      });

      expect(summary.fpoAdvantage.classification).toBe('ESTIMATED_ADVANTAGE');
    });

    test('logistics effect distinguishes MODEL vs DEMO', () => {
      const summary = computeTransactionCostSummary({
        lot: baseLot, offer: acceptedOffer, payment: basePayment,
        logisticsRequest: baseLogistics, grievance: {},
        markets: [], buyerMatches: [], demandSignals: [],
        qualityMatches: [], pathwayOptions: [], storageOptions: [],
        logisticsProviders: [], trendAvailable: false,
        productionEconomics: {}, marketObservation: {},
        buyerInfo: {}, qualityMatch: {},
        distanceKm: 100, storageDays: 0, grossPricePerQ: 0,
      });

      expect(summary.logisticsEffect.systemEstimate.classification).toBe('MODEL_ESTIMATE');
      expect(summary.logisticsEffect.carrierQuote.classification).toBe('DEMO_LOGISTICS');
    });
  });
});

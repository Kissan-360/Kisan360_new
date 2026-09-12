const { computePathways, TRANSPORT_RATE_SMALL, TRANSPORT_RATE_BULK, BULK_THRESHOLD, STORAGE_RATE_DEFAULT, OTHER_COSTS_DEFAULT } = require('./pathwayDecision');
const { getPerishabilityProfile, daysSinceHarvest, computeRemainingShelfLife, computeStorageRisk } = require('./cropPerishability');

const MONETARY_COST_CLASSES = {
  FARMER_BORNE: 'FARMER_BORNE',
  BUYER_BORNE: 'BUYER_BORNE',
  NOT_MODELED: 'NOT_MODELED',
  DEMO: 'DEMO',
};

const OUTCOME_CLASSES = {
  ESTIMATED_ADVANTAGE: 'ESTIMATED_ADVANTAGE',
  NO_MEASURABLE_ADVANTAGE: 'NO_MEASURABLE_ADVANTAGE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  SIMULATED_OUTCOME: 'SIMULATED_OUTCOME',
  REALIZED_ADVANTAGE: 'REALIZED_ADVANTAGE',
};

function transportRate(quantityQuintals) {
  if (!Number.isFinite(quantityQuintals) || quantityQuintals <= 0) return TRANSPORT_RATE_SMALL;
  return quantityQuintals >= BULK_THRESHOLD ? TRANSPORT_RATE_BULK : TRANSPORT_RATE_SMALL;
}

function transportCostPerQ(distanceKm, quantityQuintals) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(quantityQuintals) || quantityQuintals <= 0) return 0;
  const rate = transportRate(quantityQuintals);
  return Math.round(rate * distanceKm * 100) / 100;
}

const FARMER_BORNE_COSTS = {
  transport: {
    label: 'Transport',
    classification: MONETARY_COST_CLASSES.FARMER_BORNE,
    description: 'Freight cost borne by farmer for lot delivery to market/buyer',
  },
  storage: {
    label: 'Storage',
    classification: MONETARY_COST_CLASSES.FARMER_BORNE,
    description: 'Temporary godown/storage cost borne by farmer',
  },
  other: {
    label: 'Other selling costs',
    classification: MONETARY_COST_CLASSES.FARMER_BORNE,
    description: 'Bagging (₹8/q), loading (₹5/q), market entry (₹7/q)',
  },
};

const BUYER_BORNE_COSTS = {
  apmcMarketFee: {
    label: 'APMC market fee',
    classification: MONETARY_COST_CLASSES.BUYER_BORNE,
    description: '0.5% of gross — statutory charge borne by buyer, not farmer',
  },
  commissionAgentFee: {
    label: 'Commission agent fee',
    classification: MONETARY_COST_CLASSES.BUYER_BORNE,
    description: '1.0% of gross — statutory charge borne by buyer, not farmer',
  },
};

const NOT_MODELED_COSTS = {
  platformFee: {
    label: 'Platform fee',
    classification: MONETARY_COST_CLASSES.NOT_MODELED,
    description: 'Kisan360 does not charge a platform fee',
  },
  paymentProcessingFee: {
    label: 'Payment processing fee',
    classification: MONETARY_COST_CLASSES.NOT_MODELED,
    description: 'Payment system is simulated — no real gateway fee modeled',
  },
  insurance: {
    label: 'Crop/transport insurance',
    classification: MONETARY_COST_CLASSES.NOT_MODELED,
    description: 'Not modeled in current system',
  },
  interestFinancing: {
    label: 'Interest / financing cost',
    classification: MONETARY_COST_CLASSES.NOT_MODELED,
    description: 'Not modeled in current system',
  },
  qualityGradingCost: {
    label: 'Quality grading / assay cost',
    classification: MONETARY_COST_CLASSES.NOT_MODELED,
    description: 'Assay is tracked but no cost associated',
  },
};

function buildMonetaryCostSummary(context) {
  const { distanceKm, quantityQuintals, storageDays } = context;
  const transportPerQ = transportCostPerQ(distanceKm, quantityQuintals);
  const storagePerQ = (Number.isFinite(storageDays) ? storageDays : 0) * STORAGE_RATE_DEFAULT;
  const otherPerQ = OTHER_COSTS_DEFAULT;
  const totalFarmerBornePerQ = transportPerQ + storagePerQ + otherPerQ;

  return {
    farmerBorne: {
      transport: {
        perQuintal: transportPerQ,
        total: Math.round(transportPerQ * quantityQuintals * 100) / 100,
        classification: MONETARY_COST_CLASSES.FARMER_BORNE,
        basis: `${transportRate(quantityQuintals)} × ${distanceKm} km`,
      },
      storage: {
        perQuintal: storagePerQ,
        total: Math.round(storagePerQ * quantityQuintals * 100) / 100,
        classification: MONETARY_COST_CLASSES.FARMER_BORNE,
        basis: `${STORAGE_RATE_DEFAULT} × ${storageDays || 0} days`,
      },
      other: {
        perQuintal: otherPerQ,
        total: Math.round(otherPerQ * quantityQuintals * 100) / 100,
        classification: MONETARY_COST_CLASSES.FARMER_BORNE,
        breakdown: { bagging: 8, loading: 5, entryUnloading: 7 },
      },
      totalPerQuintal: Math.round(totalFarmerBornePerQ * 100) / 100,
      totalAll: Math.round(totalFarmerBornePerQ * quantityQuintals * 100) / 100,
    },
    buyerBorne: {
      apmcMarketFee: {
        rate: '0.5%',
        classification: MONETARY_COST_CLASSES.BUYER_BORNE,
        note: 'Statutory APMC charge — not deducted from farmer',
      },
      commissionAgentFee: {
        rate: '1.0%',
        classification: MONETARY_COST_CLASSES.BUYER_BORNE,
        note: 'Statutory commission agent charge — not deducted from farmer',
      },
    },
    notModeled: Object.keys(NOT_MODELED_COSTS).map(k => ({
      label: NOT_MODELED_COSTS[k].label,
      classification: NOT_MODELED_COSTS[k].classification,
      note: NOT_MODELED_COSTS[k].description,
    })),
    platformFee: 0,
    paymentFee: 0,
  };
}

function computeProcessMetrics(context) {
  const { lot, offer, payment, logisticsRequest, grievance } = context;

  const lotCreatedAt = lot?.createdAt || null;
  const firstOfferAt = offer?.createdAt || null;
  const offerAcceptedAt = offer?.status === 'ACCEPTED'
    ? (offer.history || []).find(h => h.status === 'ACCEPTED')?.at || null
    : null;

  const logisticsRequestedAt = logisticsRequest?.createdAt || null;
  const logisticsAcceptedAt = logisticsRequest?.status === 'ACCEPTED'
    ? (logisticsRequest.history || []).find(h => h.status === 'ACCEPTED' || h.to === 'ACCEPTED')?.at || null
    : null;

  const paymentReleasedAt = payment?.status === 'RELEASED'
    ? (payment.history || []).find(h => h.status === 'RELEASED' || h.to === 'RELEASED')?.at || null
    : null;

  function durationMs(from, to) {
    if (!from || !to) return null;
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return b >= a ? b - a : null;
  }

  function durationHours(from, to) {
    const ms = durationMs(from, to);
    return ms !== null ? Math.round(ms / 3600000 * 100) / 100 : null;
  }

  const timeToFirstOffer = durationHours(lotCreatedAt, firstOfferAt);
  const timeToAcceptance = durationHours(firstOfferAt, offerAcceptedAt);
  const timeToLogistics = durationHours(offerAcceptedAt, logisticsRequestedAt);
  const timeToLogisticsAcceptance = durationHours(logisticsRequestedAt, logisticsAcceptedAt);
  const timeToPaymentRelease = durationHours(logisticsAcceptedAt, paymentReleasedAt);
  const totalProcessDuration = durationHours(lotCreatedAt, paymentReleasedAt);

  const completedSteps = [
    lotCreatedAt && 'lot_created',
    firstOfferAt && 'offer_sent',
    offerAcceptedAt && 'offer_accepted',
    logisticsRequestedAt && 'logistics_requested',
    logisticsAcceptedAt && 'logistics_accepted',
    paymentReleasedAt && 'payment_released',
  ].filter(Boolean);

  const totalSteps = 6;
  const completedCount = completedSteps.length;

  return {
    timestamps: {
      lotCreatedAt,
      firstOfferAt,
      offerAcceptedAt,
      logisticsRequestedAt,
      logisticsAcceptedAt,
      paymentReleasedAt,
    },
    durations: {
      timeToFirstOfferHours: timeToFirstOffer,
      timeToAcceptanceHours: timeToAcceptance,
      timeToLogisticsHours: timeToLogistics,
      timeToLogisticsAcceptanceHours: timeToLogisticsAcceptance,
      timeToPaymentReleaseHours: timeToPaymentRelease,
      totalProcessDurationHours: totalProcessDuration,
    },
    steps: {
      total: totalSteps,
      completed: completedCount,
      completedSteps,
      missingSteps: totalSteps - completedCount,
    },
    classification: completedCount === totalSteps ? 'FULLY_COMPLETED'
      : completedCount > 0 ? 'PARTIALLY_COMPLETED'
        : 'NOT_STARTED',
  };
}

function computeInformationCoverage(context) {
  const {
    marketsRanked = [],
    buyerMatches = [],
    demandSignals = [],
    qualityMatches = [],
    pathwayOptions = [],
    storageOptions = [],
    logisticsProviders = [],
    paymentStatus = null,
    trendAvailable = false,
    productionEconomicsAvailable = false,
  } = context;

  const categories = [
    { key: 'price', label: 'Market price evidence', present: marketsRanked.length > 0 },
    { key: 'marketAlternatives', label: 'Market alternatives ranked', present: marketsRanked.length > 1 },
    { key: 'netRealization', label: 'Net realization computed', present: marketsRanked.some(m => m.farmerNetPerQuintal != null) },
    { key: 'productionEconomics', label: 'Production economics', present: productionEconomicsAvailable },
    { key: 'trend', label: 'Price trend', present: trendAvailable },
    { key: 'buyerDemand', label: 'Buyer demand signals', present: demandSignals.length > 0 },
    { key: 'qualityRequirement', label: 'Quality requirements matched', present: qualityMatches.length > 0 },
    { key: 'buyerCandidates', label: 'Buyer candidates evaluated', present: buyerMatches.length > 0 },
    { key: 'logisticsProviders', label: 'Logistics providers', present: logisticsProviders.length > 0 },
    { key: 'storageOptions', label: 'Storage options available', present: storageOptions.length > 0 },
    { key: 'pathwayOptions', label: 'Decision pathways presented', present: pathwayOptions.length > 0 },
    { key: 'paymentStatus', label: 'Payment status tracked', present: paymentStatus != null },
  ];

  const presentCount = categories.filter(c => c.present).length;

  return {
    categories,
    informationSourcesPresented: `${presentCount} / ${categories.length}`,
    totalCategories: categories.length,
    presentCount,
    classification: presentCount >= 10 ? 'COMPREHENSIVE'
      : presentCount >= 6 ? 'ADEQUATE'
        : presentCount >= 3 ? 'PARTIAL'
          : 'INSUFFICIENT',
  };
}

function buildPathwayCostComparison(context) {
  const {
    pathway,
    quantityQuintals,
    distanceKm,
    storageDays,
    grossPricePerQ,
    markets = [],
  } = context;

  const transportPerQ = transportCostPerQ(distanceKm, quantityQuintals);
  const storagePerQDefault = STORAGE_RATE_DEFAULT * 2;
  const otherPerQ = OTHER_COSTS_DEFAULT;

  const pathways = [];

  pathways.push({
    pathway: 'SELL_NOW',
    label: 'Sell immediately at best market',
    costs: {
      transportPerQ,
      storagePerQ: 0,
      otherPerQ,
      totalPerQ: transportPerQ + otherPerQ,
    },
    classification: MONETARY_COST_CLASSES.FARMER_BORNE,
  });

  pathways.push({
    pathway: 'AGGREGATE_THROUGH_FPO',
    label: 'Pool through FPO for bulk transport',
    costs: {
      transportPerQ: transportCostPerQ(distanceKm, BULK_THRESHOLD),
      storagePerQ: 0,
      otherPerQ,
      poolingCostPerQ: 0,
      totalPerQ: transportCostPerQ(distanceKm, BULK_THRESHOLD) + otherPerQ,
    },
    classification: MONETARY_COST_CLASSES.FARMER_BORNE,
    note: 'FPO pooling cost is NOT_MODELED; transport rate drops to bulk tier',
  });

  pathways.push({
    pathway: 'STORE_THEN_SELL',
    label: 'Store and sell later at higher price',
    costs: {
      transportPerQ,
      storagePerQ: storagePerQDefault,
      otherPerQ,
      totalPerQ: transportPerQ + storagePerQDefault + otherPerQ,
    },
    classification: MONETARY_COST_CLASSES.FARMER_BORNE,
  });

  if (markets.length > 1) {
    const bestNet = Math.max(...markets.map(m => m.farmerNetPerQuintal || 0));
    const worstNet = Math.min(...markets.map(m => m.farmerNetPerQuintal || 0));
    pathways.push({
      pathway: 'ALTERNATIVE_MARKET',
      label: 'Choose alternative market',
      costs: {
        transportPerQ,
        storagePerQ: 0,
        otherPerQ,
        totalPerQ: transportPerQ + otherPerQ,
      },
      netRange: { best: bestNet, worst: worstNet, spread: Math.round((bestNet - worstNet) * 100) / 100 },
      classification: MONETARY_COST_CLASSES.FARMER_BORNE,
    });
  }

  const sellNow = pathways.find(p => p.pathway === 'SELL_NOW');
  const aggregate = pathways.find(p => p.pathway === 'AGGREGATE_THROUGH_FPO');
  const store = pathways.find(p => p.pathway === 'STORE_THEN_SELL');

  const estimatedAdvantages = [];

  if (sellNow && aggregate) {
    const transportAdvantage = Math.round((sellNow.costs.transportPerQ - aggregate.costs.transportPerQ) * 100) / 100;
    estimatedAdvantages.push({
      comparison: 'AGGREGATE_VS_SELL_NOW',
      transportAdvantagePerQ: transportAdvantage,
      transportAdvantageTotal: Math.round(transportAdvantage * quantityQuintals * 100) / 100,
      classification: OUTCOME_CLASSES.ESTIMATED_ADVANTAGE,
    });
  }

  if (sellNow && store) {
    const costIncrease = Math.round((store.costs.totalPerQ - sellNow.costs.totalPerQ) * 100) / 100;
    estimatedAdvantages.push({
      comparison: 'STORE_VS_SELL_NOW',
      costIncreasePerQ: costIncrease,
      costIncreaseTotal: Math.round(costIncrease * quantityQuintals * 100) / 100,
      classification: OUTCOME_CLASSES.ESTIMATED_ADVANTAGE,
    });
  }

  return {
    pathways,
    estimatedAdvantages,
    transportRateApplied: transportRate(quantityQuintals),
    bulkThreshold: BULK_THRESHOLD,
  };
}

function computeFPOCostAdvantage(context) {
  const {
    individualLots = [],
    pooledQuantity,
    distanceKm,
  } = context;

  if (individualLots.length === 0 || !Number.isFinite(pooledQuantity) || pooledQuantity <= 0) {
    return {
      individualTotalTransportPerQ: 0,
      pooledTransportPerQ: 0,
      estimatedTransportAdvantagePerQ: 0,
      estimatedTransportAdvantageTotal: 0,
      classification: OUTCOME_CLASSES.INSUFFICIENT_EVIDENCE,
    };
  }

  const individualTotalQ = individualLots.reduce((s, l) => s + (l.quantityQuintals || 0), 0);
  const individualAvgTransportPerQ = individualLots.length > 0
    ? individualLots.reduce((s, l) => s + transportCostPerQ(distanceKm, l.quantityQuintals), 0) / individualLots.length
    : 0;

  const pooledTransportPerQ = transportCostPerQ(distanceKm, pooledQuantity);
  const advantagePerQ = Math.round((individualAvgTransportPerQ - pooledTransportPerQ) * 100) / 100;
  const advantageTotal = Math.round(advantagePerQ * individualTotalQ * 100) / 100;

  return {
    individualCount: individualLots.length,
    individualTotalQuintals: individualTotalQ,
    individualAvgTransportPerQ: Math.round(individualAvgTransportPerQ * 100) / 100,
    pooledQuantityQuintals: pooledQuantity,
    pooledTransportPerQ,
    estimatedTransportAdvantagePerQ: advantagePerQ,
    estimatedTransportAdvantageTotal: advantageTotal,
    classification: advantagePerQ > 0 ? OUTCOME_CLASSES.ESTIMATED_ADVANTAGE : OUTCOME_CLASSES.NO_MEASURABLE_ADVANTAGE,
  };
}

function computeLogisticsCostEffect(context) {
  const { systemEstimate, carrierQuote } = context;

  if (!systemEstimate || !carrierQuote) {
    return {
      systemEstimate: null,
      carrierQuote: null,
      quoteDifference: null,
      classification: OUTCOME_CLASSES.INSUFFICIENT_EVIDENCE,
    };
  }

  const sysPerQ = systemEstimate.costPerQuintal || 0;
  const carrierPerQ = carrierQuote.costPerQuintal || 0;
  const difference = Math.round((carrierPerQ - sysPerQ) * 100) / 100;

  return {
    systemEstimate: {
      costPerQuintal: sysPerQ,
      costTotal: systemEstimate.costTotal || 0,
      tier: systemEstimate.tier || 'unknown',
      classification: 'MODEL_ESTIMATE',
    },
    carrierQuote: {
      costPerQuintal: carrierPerQ,
      costTotal: carrierQuote.costTotal || 0,
      provider: carrierQuote.provider || 'unknown',
      classification: carrierQuote.classification || 'DEMO_LOGISTICS',
    },
    quoteDifference: difference,
    quoteDifferenceTotal: Math.round(difference * (systemEstimate.quantityQuintals || 0) * 100) / 100,
    classification: difference < 0 ? OUTCOME_CLASSES.ESTIMATED_ADVANTAGE
      : difference > 0 ? OUTCOME_CLASSES.NO_MEASURABLE_ADVANTAGE
        : OUTCOME_CLASSES.NO_MEASURABLE_ADVANTAGE,
  };
}

function buildTransactionReceipt(context) {
  const {
    lot = {},
    offer = {},
    payment = {},
    logisticsRequest = {},
    grievance = {},
    monetaryCosts = {},
    processMetrics = {},
    informationCoverage = {},
    pathwayComparison = {},
    fpoAdvantage = {},
    logisticsEffect = {},
    productionEconomics = {},
    marketObservation = {},
    buyerInfo = {},
    qualityMatch = {},
  } = context;

  return {
    farmerLotIdentity: {
      lotId: lot._id || lot.id || null,
      farmerUid: lot.farmerUid || null,
      crop: lot.crop || null,
      variety: lot.variety || null,
      grade: lot.grade || null,
      quantityQuintals: lot.quantity || null,
      unit: lot.unit || 'quintals',
      district: lot.district || null,
      status: lot.status || null,
      poolMetadata: lot.poolMetadata || null,
    },
    marketObservation: {
      market: marketObservation.market || null,
      crop: marketObservation.crop || null,
      grossPricePerQuintal: marketObservation.grossPricePerQuintal || null,
      classification: marketObservation.classification || 'NOT_AVAILABLE',
    },
    selectedPathway: {
      pathway: pathwayComparison.pathway || null,
      label: pathwayComparison.label || null,
    },
    economics: {
      grossPricePerQuintal: productionEconomics.grossPricePerQuintal || marketObservation.grossPricePerQuintal || null,
      farmerBorneCostsPerQuintal: monetaryCosts.farmerBorne?.totalPerQuintal || null,
      farmerNetPerQuintal: productionEconomics.farmerNetPerQuintal || null,
      productionCostPerQuintal: productionEconomics.productionCostPerQuintal || null,
      breakEvenPricePerQuintal: productionEconomics.breakEvenPricePerQuintal || null,
      estimatedProfitPerQuintal: productionEconomics.estimatedProfitPerQuintal || null,
    },
    buyer: {
      buyerId: buyerInfo.buyerId || offer.buyerId || null,
      buyerName: buyerInfo.buyerName || offer.buyerName || null,
      trustTier: buyerInfo.trustTier || null,
    },
    qualityMatch: {
      qualityGrade: qualityMatch.qualityGrade || lot.grade || null,
      qualityScore: qualityMatch.qualityScore || null,
      matches: qualityMatch.matches || false,
    },
    logistics: {
      provider: logisticsRequest.providerName || null,
      trustTier: logisticsRequest.providerTrustTier || null,
      quotedCostPerQuintal: logisticsRequest.quotedCostPerQuintal || null,
      systemEstimatedCostPerQuintal: logisticsRequest.systemEstimatedCostPerQuintal || null,
      costDifference: logisticsRequest.costDifference || null,
      status: logisticsRequest.status || null,
      classification: logisticsRequest.classification || null,
    },
    offer: {
      offeredPricePerQuintal: offer.offeredPricePerQuintal || null,
      amount: offer.amount || null,
      status: offer.status || null,
    },
    payment: {
      amount: payment.amount || null,
      currency: payment.currency || 'INR',
      status: payment.status || null,
      mocked: payment.mocked !== undefined ? payment.mocked : true,
    },
    grievance: {
      status: grievance.status || null,
      category: grievance.category || null,
    },
    processMetrics: processMetrics.durations || {},
    informationCoverage: informationCoverage.informationSourcesPresented || null,
    provenance: {
      monetaryCostsClassification: 'DERIVED',
      processMetricsClassification: 'DERIVED',
      informationCoverageClassification: 'DERIVED',
      marketDataClassification: marketObservation.classification || 'NOT_AVAILABLE',
      productionCostsClassification: productionEconomics.classification || 'NOT_AVAILABLE',
      paymentClassification: payment.mocked ? 'SIMULATED' : 'UNKNOWN',
      logisticsClassification: logisticsRequest.classification || 'NOT_AVAILABLE',
    },
    outcomeClassification: OUTCOME_CLASSES.SIMULATED_OUTCOME,
    demoFlags: {
      isDemo: true,
      mockedPayment: payment.mocked !== undefined ? payment.mocked : true,
      demoLogistics: logisticsRequest.classification === 'DEMO_LOGISTICS',
      simulatedTransaction: true,
      note: 'All transaction outcomes in demo are simulated — not actual realized financial results',
    },
  };
}

function computeTransactionCostSummary(context) {
  const {
    lot,
    offer,
    payment,
    logisticsRequest,
    grievance,
    markets,
    buyerMatches,
    demandSignals,
    qualityMatches,
    pathwayOptions,
    storageOptions,
    logisticsProviders,
    trendAvailable,
    productionEconomics,
    marketObservation,
    buyerInfo,
    qualityMatch,
    individualFpoLots,
    pooledQuantity,
    distanceKm,
    storageDays,
    grossPricePerQ,
  } = context || {};

  const quantityQuintals = lot?.quantity || 0;
  const distance = distanceKm || 0;
  const storage = storageDays || 0;

  const monetaryCosts = buildMonetaryCostSummary({
    distanceKm: distance,
    quantityQuintals,
    storageDays: storage,
  });

  const processMetrics = computeProcessMetrics({
    lot: lot || {},
    offer: offer || {},
    payment: payment || {},
    logisticsRequest: logisticsRequest || {},
    grievance: grievance || {},
  });

  const informationCoverage = computeInformationCoverage({
    marketsRanked: markets || [],
    buyerMatches: buyerMatches || [],
    demandSignals: demandSignals || [],
    qualityMatches: qualityMatches || [],
    pathwayOptions: pathwayOptions || [],
    storageOptions: storageOptions || [],
    logisticsProviders: logisticsProviders || [],
    paymentStatus: payment?.status || null,
    trendAvailable: trendAvailable || false,
    productionEconomicsAvailable: productionEconomics?.productionCostPerQuintal != null,
  });

  const pathwayComparison = buildPathwayCostComparison({
    pathway: offer?.pathway || null,
    quantityQuintals,
    distanceKm: distance,
    storageDays: storage,
    grossPricePerQ: grossPricePerQ || marketObservation?.grossPricePerQuintal || 0,
    markets: markets || [],
  });

  const fpoAdvantage = computeFPOCostAdvantage({
    individualLots: individualFpoLots || [],
    pooledQuantity: pooledQuantity || quantityQuintals,
    distanceKm: distance,
  });

  const logisticsEffect = computeLogisticsCostEffect({
    systemEstimate: logisticsRequest ? {
      costPerQuintal: logisticsRequest.systemEstimatedCostPerQuintal,
      costTotal: logisticsRequest.systemEstimatedCost,
      tier: logisticsRequest.transportType,
      quantityQuintals,
    } : null,
    carrierQuote: logisticsRequest?.quotedCostPerQuintal != null ? {
      costPerQuintal: logisticsRequest.quotedCostPerQuintal,
      costTotal: logisticsRequest.quotedCost,
      provider: logisticsRequest.providerName,
      classification: logisticsRequest.classification,
    } : null,
  });

  const receipt = buildTransactionReceipt({
    lot: lot || {},
    offer: offer || {},
    payment: payment || {},
    logisticsRequest: logisticsRequest || {},
    grievance: grievance || {},
    monetaryCosts,
    processMetrics,
    informationCoverage,
    pathwayComparison,
    fpoAdvantage,
    logisticsEffect,
    productionEconomics: productionEconomics || {},
    marketObservation: marketObservation || {},
    buyerInfo: buyerInfo || {},
    qualityMatch: qualityMatch || {},
  });

  return {
    monetaryCosts,
    processMetrics,
    informationCoverage,
    pathwayComparison,
    fpoAdvantage,
    logisticsEffect,
    totalKnownMonetaryCostPerQuintal: monetaryCosts.farmerBorne.totalPerQuintal,
    classification: 'DEMO_TRANSACTION_COST_ACCOUNTING',
    provenance: {
      transportRates: 'ASSUMPTIONS (pathwayDecision.js)',
      storageRates: 'ASSUMPTIONS (scenario.js)',
      otherCosts: 'ASSUMPTIONS (pathwayDecision.js)',
      buyerBorneCharges: 'net_realization.py ASSUMPTIONS (APMC Act)',
      platformFee: 'DOES_NOT_EXIST',
      paymentFee: 'NOT_MODELED',
    },
    receipt,
  };
}

module.exports = {
  MONETARY_COST_CLASSES,
  OUTCOME_CLASSES,
  FARMER_BORNE_COSTS,
  BUYER_BORNE_COSTS,
  NOT_MODELED_COSTS,
  transportRate,
  transportCostPerQ,
  buildMonetaryCostSummary,
  computeProcessMetrics,
  computeInformationCoverage,
  buildPathwayCostComparison,
  computeFPOCostAdvantage,
  computeLogisticsCostEffect,
  buildTransactionReceipt,
  computeTransactionCostSummary,
};

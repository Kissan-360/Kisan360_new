const express = require('express');
const axios = require('axios');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateUser } = require('../middleware/auth');
const marketCache = require('../services/marketCache');
const actionability = require('../services/actionability');
const { computePathways } = require('../services/pathwayDecision');
const { computeEconomics } = require('../services/farmerEconomics');
const { computeStorageThreshold } = require('../services/scenario');
const { getPerishabilityProfile } = require('../services/cropPerishability');
const { systemEstimate, generateQuote } = require('../services/logisticsCoordination');
const { getMarketArrivals } = require('../services/arrivalIntel');
const {
  computeTransactionCostSummary,
  buildMonetaryCostSummary,
  computeProcessMetrics,
  computeInformationCoverage,
  buildPathwayCostComparison,
  computeFPOCostAdvantage,
  computeLogisticsCostEffect,
  buildTransactionReceipt,
} = require('../services/transactionCost');

const Lot = require('../models/Lot');
const Offer = require('../models/Offer');
const Payment = require('../models/Payment');
const LogisticsRequest = require('../models/LogisticsRequest');
const Grievance = require('../models/Grievance');

const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';
const { CALC_TIMEOUT_MS, isColdStart, coldStartMessage } = require('../lib/calculator');

router.get('/transaction-cost', authenticateUser, async (req, res) => {
  try {
    const { crop, district, quantity, distanceKm, storageDays, lotId } = req.query;

    if (!crop || !district) {
      return res.status(400).json({ success: false, error: 'crop and district are required' });
    }

    const quantityQuintals = Number.parseFloat(quantity) || 10;
    const distance = Number.parseFloat(distanceKm) || 0;
    const storage = Number.parseInt(storageDays, 10) || 0;

    let lot = null;
    let offer = null;
    let payment = null;
    let logisticsRequest = null;
    let grievance = null;

    if (lotId) {
      lot = await Lot.findById(lotId).lean();
      if (lot) {
        offer = await Offer.findOne({ lotId: lot._id }).sort({ createdAt: -1 }).lean();
        if (offer) {
          payment = await Payment.findOne({ offerId: offer._id }).lean();
          if (payment?.grievanceId) {
            grievance = await Grievance.findById(payment.grievanceId).lean();
          }
        }
        logisticsRequest = await LogisticsRequest.findOne({ lotId: lot._id }).sort({ createdAt: -1 }).lean();
      }
    }

    if (!lot) {
      lot = {
        crop,
        district,
        quantity: quantityQuintals,
        unit: 'quintals',
        grade: 'Unassessed',
      };
    }

    const priceResult = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 500 });
    const deduped = (priceResult.rows || [])
      .slice()
      .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
      .filter((r, i, arr) => arr.findIndex(x => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);

    const markets = deduped.map(r => ({
      market: r.market,
      crop: r.crop,
      variety: r.variety || null,
      modalPrice: r.modalPrice,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      arrivalDate: r.arrivalDate,
      source: r.source,
    }));

    // Real engine call — POST /net-realization is the only compute endpoint
    // the calculator serves (there is no /api/calculate; the old call could
    // never succeed). A sleeping engine gets an honest 503 here, never
    // hollow success:true numbers downstream.
    let engineResult;
    try {
      const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
        crop,
        district,
        quantity: quantityQuintals,
        prices: deduped.map(r => ({
          market: r.market,
          variety: r.variety,
          minPrice: r.minPrice,
          maxPrice: r.maxPrice,
          modalPrice: r.modalPrice,
          arrivalDate: r.arrivalDate,
          district: r.district,
          source: priceResult.provenance.source,
          retrievedAt: priceResult.provenance.retrievedAt,
        })),
      }, { timeout: CALC_TIMEOUT_MS });
      engineResult = mlRes.data;
      if (!engineResult || engineResult.success === false) {
        return res.status(502).json({ success: false, error: engineResult?.error || 'Calculator rejected the request' });
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
      }
      if (isColdStart(error)) {
        return res.status(503).json({ success: false, error: coldStartMessage(), serviceStatus: 'waking' });
      }
      throw error;
    }

    const rankedMarkets = engineResult.rankedMandis || [];

    // Buyer coverage from the real directory (the old classifyBuyers call
    // never existed — it threw on every request). ACTIONABLE matches,
    // flattened across mandis and deduped by buyer.
    const directoryBuyers = (require('../data/buyers.json').buyers) || [];
    const coverageResult = actionability.assessCoverage(rankedMarkets, directoryBuyers, {
      crop,
      quantityQuintals,
      qualityGrade: lot.grade || null,
    });
    const buyerMatches = Object.values(coverageResult.coverage || {})
      .flatMap((c) => c.buyers || [])
      .filter((b, i, arr) => arr.findIndex(x => x.id === b.id) === i);
    const demandSignals = [];

    const pathwayResult = computePathways({
      crop,
      district,
      quantityQuintals,
      quality: { grade: lot.grade || null, size: null, moisturePct: null, damagePct: null },
      engineResult,
      trendData: null,
    });

    let economics = null;
    if (rankedMarkets.length > 0) {
      economics = computeEconomics({
        totalProductionCost: 0,
        quantityQuintals,
        engineResult,
      });
    }

    let qualityMatches = [];
    const buyerRequirements = require('../data/buyerRequirements.json');
    const reqs = buyerRequirements.filter(r => r.crop === crop);
    for (const req of reqs) {
      const matches = !req.minGrade || (lot.grade && lot.grade !== 'Unassessed' && lot.grade <= req.minGrade);
      qualityMatches.push({ requirement: req, matches });
    }

    const storageOptions = require('../data/storageOptions.json');
    const logisticsProviders = require('../data/transportProviders.json');
    const trendAvailable = deduped.length > 0;

    const marketObservation = rankedMarkets.length > 0 ? {
      market: rankedMarkets[0].market,
      crop,
      grossPricePerQuintal: rankedMarkets[0].modalPrice || rankedMarkets[0].grossPerQuintal || 0,
      classification: priceResult.provenance || 'DERIVED',
    } : {};

    const buyerInfo = buyerMatches.length > 0 ? {
      buyerId: buyerMatches[0].buyerId || buyerMatches[0].id,
      buyerName: buyerMatches[0].buyerName || buyerMatches[0].name,
      trustTier: buyerMatches[0].trustTier,
    } : {};

    const summary = computeTransactionCostSummary({
      lot,
      offer,
      payment,
      logisticsRequest,
      grievance,
      markets,
      buyerMatches,
      demandSignals,
      qualityMatches,
      pathwayOptions: pathwayResult?.pathways || [],
      storageOptions: storageOptions || [],
      logisticsProviders: logisticsProviders || [],
      trendAvailable,
      productionEconomics: economics,
      marketObservation,
      buyerInfo,
      qualityMatch: qualityMatches.length > 0 ? qualityMatches[0] : {},
      distanceKm: distance,
      storageDays: storage,
      grossPricePerQ: marketObservation.grossPricePerQuintal,
    });

    res.json({
      success: true,
      data: summary,
      provenance: {
        crop,
        district,
        quantityQuintals,
        distanceKm: distance,
        storageDays: storage,
        lotId: lotId || null,
        source: 'Kisan360 Transaction Cost Accounting',
        dataBasis: 'Deterministic cost model from ASSUMPTIONS constants. Process metrics from actual record timestamps. Information coverage from system behavior. All outcomes in demo are SIMULATED.',
      },
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ success: false, error: 'Net-realization service unavailable', serviceStatus: 'offline' });
    }
    if (isColdStart(error)) {
      return res.status(503).json({ success: false, error: coldStartMessage(), serviceStatus: 'waking' });
    }
    logger.error('Transaction-cost error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to compute transaction cost summary' });
  }
});

router.get('/decision-receipt/:lotId', authenticateUser, async (req, res) => {
  try {
    const { lotId } = req.params;

    const lot = await Lot.findById(lotId).lean();
    if (!lot) {
      return res.status(404).json({ success: false, error: 'Lot not found' });
    }

    const offer = await Offer.findOne({ lotId: lot._id }).sort({ createdAt: -1 }).lean();
    let payment = null;
    let logisticsRequest = null;
    let grievance = null;

    if (offer) {
      payment = await Payment.findOne({ offerId: offer._id }).lean();
      if (payment?.grievanceId) {
        grievance = await Grievance.findById(payment.grievanceId).lean();
      }
    }
    logisticsRequest = await LogisticsRequest.findOne({ lotId: lot._id }).sort({ createdAt: -1 }).lean();

    const quantityQuintals = lot.quantity || 10;
    const distance = 0;
    const storage = 0;

    const monetaryCosts = buildMonetaryCostSummary({
      distanceKm: distance,
      quantityQuintals,
      storageDays: storage,
    });

    const processMetrics = computeProcessMetrics({
      lot,
      offer: offer || {},
      payment: payment || {},
      logisticsRequest: logisticsRequest || {},
      grievance: grievance || {},
    });

    const informationCoverage = computeInformationCoverage({
      marketsRanked: [],
      buyerMatches: [],
      demandSignals: [],
      qualityMatches: [],
      pathwayOptions: [],
      storageOptions: [],
      logisticsProviders: [],
      paymentStatus: payment?.status || null,
      trendAvailable: false,
      productionEconomicsAvailable: false,
    });

    const receipt = buildTransactionReceipt({
      lot,
      offer: offer || {},
      payment: payment || {},
      logisticsRequest: logisticsRequest || {},
      grievance: grievance || {},
      monetaryCosts,
      processMetrics,
      informationCoverage,
      pathwayComparison: {},
      fpoAdvantage: {},
      logisticsEffect: {},
      productionEconomics: {},
      marketObservation: {},
      buyerInfo: offer ? { buyerId: offer.buyerId, buyerName: offer.buyerName } : {},
      qualityMatch: {},
    });

    res.json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    logger.error('Decision-receipt error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate decision receipt' });
  }
});

module.exports = router;

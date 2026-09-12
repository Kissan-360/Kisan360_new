// Logistics coordination — manages transport requests from creation through delivery.
// Cost consistency: compares system-estimated transport cost against carrier quotes.
// Provider trust: preserves trust tier from the provider directory.
// Demo labeling: all demo providers are explicitly marked.
//
// Architecture boundary: this service defines the coordination interface.
// Future integration with OSRM/truck APIs would implement the provider adapter
// without rewriting the domain model.

const fs = require('fs');
const path = require('path');

const PROVIDERS_FILE = path.join(__dirname, '..', 'data', 'transportProviders.json');

// Transport rates — same documented assumptions as net_realization.py
const TRANSPORT_RATE_SMALL = 1.5; // ₹/q/km for lots < 40q
const TRANSPORT_RATE_BULK = 0.75; // ₹/q/km for lots >= 40q
const BULK_THRESHOLD = 40; // quintals

function loadProviders() {
  try {
    return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  } catch {
    return { meta: { note: 'Transport providers unavailable.' }, providers: [] };
  }
}

/**
 * Compute system-estimated transport cost using documented assumptions.
 * This is the AUTHORITATIVE cost — carrier quotes are compared against it.
 * @param {number} distanceKm
 * @param {number} quantityQuintals
 * @returns {{ costTotal, costPerQuintal, rate, tier }}
 */
function systemEstimate(distanceKm, quantityQuintals) {
  if (!distanceKm || !quantityQuintals || distanceKm <= 0 || quantityQuintals <= 0) {
    return { costTotal: 0, costPerQuintal: 0, rate: 0, tier: 'unknown' };
  }
  const rate = quantityQuintals >= BULK_THRESHOLD ? TRANSPORT_RATE_BULK : TRANSPORT_RATE_SMALL;
  const tier = quantityQuintals >= BULK_THRESHOLD ? 'bulk' : 'small_lcv';
  const costPerQuintal = Math.round(rate * distanceKm * 100) / 100;
  const costTotal = Math.round(costPerQuintal * quantityQuintals * 100) / 100;
  return { costTotal, costPerQuintal, rate, tier };
}

/**
 * Find compatible transport providers for a route.
 * @param {Object} params
 * @param {string} params.origin - origin district
 * @param {string} params.destination - destination district
 * @param {number} params.quantityQuintals
 * @param {string} [params.transportType] - preferred vehicle type
 * @returns {Array} compatible providers with estimated costs
 */
function findProviders({ origin, destination, quantityQuintals, transportType }) {
  const data = loadProviders();
  const providers = data.providers || [];
  const originLower = (origin || '').trim().toLowerCase();
  const destLower = (destination || '').trim().toLowerCase();

  return providers
    .filter(p => {
      // Must serve origin district
      const servesOrigin = p.serviceDistricts.some(d => d.trim().toLowerCase() === originLower);
      if (!servesOrigin) return false;
      // Must have capacity
      if (p.maxCapacityQuintals < quantityQuintals) return false;
      // Vehicle type filter
      if (transportType && transportType !== 'any' && !p.vehicleTypes.includes(transportType)) return false;
      return true;
    })
    .map(p => {
      const rate = quantityQuintals >= (p.bulkThresholdQuintals || BULK_THRESHOLD)
        ? p.bulkRatePerQuintalPerKm
        : p.baseRatePerQuintalPerKm;
      const tierLabel = data.meta.trustTiers?.[p.trustTier]?.label || p.trustTier;

      return {
        providerId: p.id,
        name: p.name,
        category: p.category,
        trustTier: p.trustTier,
        trustTierLabel: tierLabel,
        vehicleTypes: p.vehicleTypes,
        maxCapacityQuintals: p.maxCapacityQuintals,
        serviceDistricts: p.serviceDistricts,
        ratePerQuintalPerKm: rate,
        estimatedResponseHours: p.estimatedResponseHours,
        description: p.description,
        verificationNote: p.verificationNote,
        demo: true, // honesty: all providers are demo
      };
    })
    .sort((a, b) => a.ratePerQuintalPerKm - b.ratePerQuintalPerKm);
}

/**
 * Generate a carrier quote for a transport request.
 * In demo mode, this simulates a carrier responding with a quote.
 * Production would integrate with real carrier APIs.
 * @param {Object} provider - provider from directory
 * @param {number} distanceKm
 * @param {number} quantityQuintals
 * @returns {{ quotedCost, quotedCostPerQuintal, systemEstimate, difference, differenceNote }}
 */
function generateQuote(provider, distanceKm, quantityQuintals) {
  const sysEst = systemEstimate(distanceKm, quantityQuintals);
  const rate = quantityQuintals >= (provider.bulkThresholdQuintals || BULK_THRESHOLD)
    ? provider.bulkRatePerQuintalPerKm
    : provider.baseRatePerQuintalPerKm;
  const quotedCostPerQuintal = Math.round(rate * distanceKm * 100) / 100;
  const quotedCost = Math.round(quotedCostPerQuintal * quantityQuintals * 100) / 100;
  const difference = Math.round((quotedCostPerQuintal - sysEst.costPerQuintal) * 100) / 100;

  let differenceNote;
  if (difference === 0) {
    differenceNote = 'Carrier quote matches system estimate';
  } else if (difference > 0) {
    differenceNote = `Carrier quote is ₹${difference}/q higher than system estimate — this is a comparison, not guaranteed savings`;
  } else {
    differenceNote = `Carrier quote is ₹${Math.abs(difference)}/q lower than system estimate — this is a comparison, not guaranteed savings`;
  }

  return {
    quotedCost,
    quotedCostPerQuintal,
    systemEstimatedCost: sysEst.costTotal,
    systemEstimatedCostPerQuintal: sysEst.costPerQuintal,
    costDifference: difference,
    costDifferenceNote: differenceNote,
  };
}

/**
 * Validate a logistics request against lot integrity rules.
 * @param {Object} lot - the lot document
 * @param {Object} body - request body
 * @returns {{ ok, errors }}
 */
function validateRequest(lot, body) {
  const errors = [];

  if (!lot) {
    errors.push('Lot not found');
    return { ok: false, errors };
  }

  // Lot must be in a requestable state
  if (!['OPEN', 'OFFERED'].includes(lot.status)) {
    errors.push(`Lot is ${lot.status} — transport can only be requested for OPEN or OFFERED lots`);
  }

  // Quantity validation
  const qty = Number(body.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    errors.push('quantity must be a positive number');
  } else if (qty > lot.quantity) {
    errors.push(`quantity ${qty} exceeds lot quantity ${lot.quantity} — partial shipment not supported without split model`);
  }

  // Origin/destination
  if (!body.origin || !String(body.origin).trim()) errors.push('origin is required');
  if (!body.destination || !String(body.destination).trim()) errors.push('destination is required');

  return { ok: errors.length === 0, errors };
}

/**
 * Get the full coordination state for a logistics request.
 * @param {Object} request - logistics request document
 * @returns {Object} coordination state with allowed transitions
 */
function coordinationState(request) {
  const { MACHINES } = require('./stateMachine');
  const machine = MACHINES.logistics;
  const allowed = machine.allowed[request.status] || [];

  return {
    currentStatus: request.status,
    allowedTransitions: allowed,
    canQuote: allowed.includes('QUOTED'),
    canAccept: allowed.includes('ACCEPTED'),
    canSchedule: allowed.includes('SCHEDULED'),
    canTransit: allowed.includes('IN_TRANSIT'),
    canDeliver: allowed.includes('DELIVERED'),
    canCancel: allowed.includes('CANCELLED'),
    isTerminal: request.status === 'DELIVERED' || request.status === 'CANCELLED',
  };
}

module.exports = {
  systemEstimate,
  findProviders,
  generateQuote,
  validateRequest,
  coordinationState,
  loadProviders,
  TRANSPORT_RATE_SMALL,
  TRANSPORT_RATE_BULK,
  BULK_THRESHOLD,
};

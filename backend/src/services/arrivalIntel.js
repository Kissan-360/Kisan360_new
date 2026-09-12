// Arrival volume intelligence — extracts and summarizes arrival observations
// from AGMARKNET data. Arrival volume is CONTEXT, not a demand score.
//
// Uses actual observed data when available; clearly labels demo data.
// When source-reported arrival quantity is available, computes quantity
// aggregates. When it is not (current AGMARKNET Maharashtra data), falls
// back to observation-count-based metrics.
//
// Deduplication: observations are identified by (crop, market, variety,
// arrivalDate). Repeated ingestion of the same record does NOT double-count.

/**
 * Normalize a market row identity key for deduplication.
 */
function observationKey(row) {
  const crop = String(row.crop || '').trim().toLowerCase();
  const market = String(row.market || '').trim().toLowerCase();
  const variety = String(row.variety || '').trim().toLowerCase();
  const date = String(row.arrivalDate || '').trim();
  return `${crop}|${market}|${variety}|${date}`;
}

/**
 * Extract arrival volume observations from price data.
 * @param {Array} priceRows - rows from market cache
 * @param {Object} opts - { crop, market } optional filter
 * @returns {Object} arrival summary
 */
function summarizeArrivals(priceRows, opts = {}) {
  if (!Array.isArray(priceRows) || priceRows.length === 0) {
    return {
      available: false,
      note: 'No arrival data available from current market source',
      observations: [],
    };
  }

  // Deduplicate by observation identity
  const seen = new Set();
  const deduped = [];
  for (const row of priceRows) {
    if (opts.crop && String(row.crop).trim().toLowerCase() !== String(opts.crop).trim().toLowerCase()) continue;
    if (opts.market && String(row.market).trim().toLowerCase() !== String(opts.market).trim().toLowerCase()) continue;

    const key = observationKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  // Group by date, tracking both observation counts and quantity data
  const byDate = {};
  for (const row of deduped) {
    const date = row.arrivalDate;
    if (!date) continue;
    if (!byDate[date]) {
      byDate[date] = {
        date,
        entries: 0,
        markets: new Set(),
        varieties: new Set(),
        quantitySum: 0,
        quantityCount: 0,
        quantityUnit: null,
        marketsWithQuantity: new Set(),
      };
    }
    byDate[date].entries++;
    if (row.market) byDate[date].markets.add(row.market);
    if (row.variety) byDate[date].varieties.add(row.variety);

    // Source-reported arrival quantity (when AGMARKNET provides it)
    const rawQty = row.arrivalQuantity;
    const qty = Number(rawQty);
    if (rawQty != null && Number.isFinite(qty) && qty >= 0) {
      byDate[date].quantitySum += qty;
      byDate[date].quantityCount++;
      if (row.market) byDate[date].marketsWithQuantity.add(row.market);
      if (!byDate[date].quantityUnit && row.arrivalUnit) {
        byDate[date].quantityUnit = row.arrivalUnit;
      }
    }
  }

  const observations = Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => {
      const qtyAvailable = d.quantityCount > 0;
      return {
        date: d.date,
        entries: d.entries,
        distinctMarkets: d.markets.size,
        distinctVarieties: d.varieties.size,
        // Quantity metrics (only meaningful when source provides data)
        totalArrivalQuantity: qtyAvailable ? Math.round(d.quantitySum * 100) / 100 : null,
        averageArrivalQuantity: qtyAvailable ? Math.round((d.quantitySum / d.quantityCount) * 100) / 100 : null,
        arrivalQuantityUnit: d.quantityUnit,
        observationsWithQuantity: d.quantityCount,
        quantityCoverage: d.entries > 0 ? Math.round((d.quantityCount / d.entries) * 100) : 0,
      };
    });

  if (observations.length === 0) {
    return {
      available: false,
      note: 'No dated arrival observations found in current data',
      observations: [],
    };
  }

  // ── Observation-count-based context (always available) ────────────────
  const latest = observations[observations.length - 1];
  const recentObservations = observations.slice(-7);
  const avgEntries = recentObservations.reduce((s, o) => s + o.entries, 0) / recentObservations.length;

  let context = 'NORMAL';
  let contextNote = '';

  if (latest.entries > avgEntries * 1.5) {
    context = 'ABOVE_NORMAL';
    contextNote = `Latest observation day (${latest.entries} observations) is higher than the recent average (${Math.round(avgEntries)}/day), which may indicate broader market activity.`;
  } else if (latest.entries < avgEntries * 0.5 && avgEntries > 0) {
    context = 'BELOW_NORMAL';
    contextNote = `Latest observation day (${latest.entries} observations) is lower than the recent average (${Math.round(avgEntries)}/day), which may indicate limited market activity.`;
  } else {
    context = 'NORMAL';
    contextNote = `Latest observation day (${latest.entries} observations) is within the normal range of recent observations (${Math.round(avgEntries)}/day).`;
  }

  // ── Quantity-based metrics (only when source provides data) ───────────
  const totalObservations = observations.reduce((s, o) => s + o.entries, 0);
  const totalWithQuantity = observations.reduce((s, o) => s + (o.observationsWithQuantity || 0), 0);
  const quantityAvailable = totalWithQuantity > 0;
  const quantityUnit = quantityAvailable
    ? (observations.find(o => o.arrivalQuantityUnit)?.arrivalQuantityUnit || null)
    : null;

  // Aggregate quantity across all dates
  const totalQuantity = quantityAvailable
    ? observations.reduce((s, o) => s + (o.totalArrivalQuantity || 0), 0)
    : null;

  // Latest day with quantity data
  const latestWithQuantity = quantityAvailable
    ? [...observations].reverse().find(o => o.totalArrivalQuantity != null)
    : null;

  // Daily trend (UP/DOWN/FLAT) when sufficient quantity data exists
  let quantityTrend = null;
  if (quantityAvailable) {
    const recentWithQty = recentObservations.filter(o => o.totalArrivalQuantity != null);
    if (recentWithQty.length >= 3) {
      const avgQty = recentWithQty.reduce((s, o) => s + o.totalArrivalQuantity, 0) / recentWithQty.length;
      const latestQty = latestWithQuantity?.totalArrivalQuantity || 0;
      if (avgQty > 0) {
        const ratio = latestQty / avgQty;
        if (ratio > 1.2) quantityTrend = 'UP';
        else if (ratio < 0.8) quantityTrend = 'DOWN';
        else quantityTrend = 'FLAT';
      } else {
        quantityTrend = 'INSUFFICIENT_EVIDENCE';
      }
    } else {
      quantityTrend = 'INSUFFICIENT_EVIDENCE';
    }
  }

  // Market-level view (latest quantity per market)
  const byMarket = {};
  for (const o of observations) {
    // We don't have per-market breakdown in the date-grouped structure,
    // so we track the latest date's observations
  }

  // Coverage percentage
  const coveragePercentage = totalObservations > 0
    ? Math.round((totalWithQuantity / totalObservations) * 100)
    : 0;

  return {
    available: true,
    latestDate: latest.date,
    latestEntries: latest.entries,
    recentDays: recentObservations.length,
    averageEntriesPerDay: Math.round(avgEntries * 10) / 10,
    context,
    contextNote,
    observations,
    // Quantity summary (only meaningful when source provides data)
    quantitySummary: {
      available: quantityAvailable,
      unit: quantityUnit,
      totalObservations,
      observationsWithQuantity: totalWithQuantity,
      coveragePercentage,
      totalArrivalQuantity: totalQuantity != null ? Math.round(totalQuantity * 100) / 100 : null,
      latestArrivalQuantity: latestWithQuantity?.totalArrivalQuantity || null,
      latestArrivalDate: latestWithQuantity?.date || null,
      trend: quantityTrend,
      note: quantityAvailable
        ? `Arrival quantity is source-reported (${quantityUnit || 'unknown unit'}) across ${totalWithQuantity} of ${totalObservations} observations. This is reported arrival quantity across available observations, not total market supply.`
        : 'Source-reported arrival quantity is not available for the current data. Observation counts reflect the number of price-reporting mandis, not physical quantity.',
    },
    note: quantityAvailable
      ? 'Arrival data includes source-reported quantity where available. Observation counts reflect price-reporting breadth. Both are context, not demand signals.'
      : 'Arrival counts are observational — number of price observations per day, not confirmed tonnage. Higher observation counts may indicate broader market activity.',
  };
}

/**
 * Get market-level arrival view: latest quantity for a specific crop+market.
 * @param {Array} priceRows
 * @param {Object} opts - { crop, market }
 * @returns {Object} market arrival detail
 */
function getMarketArrivals(priceRows, opts = {}) {
  if (!Array.isArray(priceRows) || priceRows.length === 0) {
    return { available: false, note: 'No data available' };
  }

  const filtered = priceRows.filter(r => {
    if (opts.crop && String(r.crop).trim().toLowerCase() !== String(opts.crop).trim().toLowerCase()) return false;
    if (opts.market && String(r.market).trim().toLowerCase() !== String(opts.market).trim().toLowerCase()) return false;
    return true;
  });

  if (filtered.length === 0) {
    return { available: false, note: `No observations found for ${opts.crop || 'any crop'} at ${opts.market || 'any market'}` };
  }

  // Latest observation
  const sorted = filtered
    .filter(r => r.arrivalDate)
    .sort((a, b) => String(a.arrivalDate).localeCompare(String(b.arrivalDate)));

  if (sorted.length === 0) {
    return { available: false, note: 'No dated observations found' };
  }

  const latest = sorted[sorted.length - 1];
  const qty = Number(latest.arrivalQuantity);
  const hasQuantity = Number.isFinite(qty) && qty >= 0;

  return {
    available: true,
    crop: latest.crop,
    market: latest.market,
    latestObservationDate: latest.arrivalDate,
    latestArrivalQuantity: hasQuantity ? qty : null,
    arrivalQuantityUnit: hasQuantity ? (latest.arrivalUnit || null) : null,
    modalPrice: latest.modalPrice || null,
    source: latest.source || 'AGMARKNET',
    quantityAvailable: hasQuantity,
    note: hasQuantity
      ? `Latest source-reported arrival: ${qty} ${latest.arrivalUnit || 'units'} on ${latest.arrivalDate}. This is the reported figure from the source, not total market supply.`
      : 'Source does not report arrival quantity for this observation.',
  };
}

module.exports = { summarizeArrivals, getMarketArrivals, observationKey };

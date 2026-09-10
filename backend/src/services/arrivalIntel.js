// Arrival volume intelligence — extracts and summarizes arrival observations
// from AGMARKNET data. Arrival volume is CONTEXT, not a demand score.
// Uses actual observed data when available; clearly labels demo data.

/**
 * Extract arrival volume observations from price data.
 * @param {Array} priceRows - rows from market cache (each has arrivalDate, market, crop, modalPrice)
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

  // Group by date
  const byDate = {};
  for (const row of priceRows) {
    if (opts.crop && String(row.crop).toLowerCase() !== String(opts.crop).toLowerCase()) continue;
    if (opts.market && String(row.market).toLowerCase() !== String(opts.market).toLowerCase()) continue;

    const date = row.arrivalDate;
    if (!date) continue;
    if (!byDate[date]) byDate[date] = { date, entries: 0, markets: new Set(), varieties: new Set() };
    byDate[date].entries++;
    if (row.market) byDate[date].markets.add(row.market);
    if (row.variety) byDate[date].varieties.add(row.variety);
  }

  const observations = Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date: d.date,
      entries: d.entries,
      distinctMarkets: d.markets.size,
      distinctVarieties: d.varieties.size,
    }));

  if (observations.length === 0) {
    return {
      available: false,
      note: 'No dated arrival observations found in current data',
      observations: [],
    };
  }

  // Compare latest to recent average
  const latest = observations[observations.length - 1];
  const recentObservations = observations.slice(-7);
  const avgEntries = recentObservations.reduce((s, o) => s + o.entries, 0) / recentObservations.length;

  let context = 'NORMAL';
  let contextNote = '';

  if (latest.entries > avgEntries * 1.5) {
    context = 'ABOVE_NORMAL';
    contextNote = `Current day's arrivals (${latest.entries} observations) are higher than the recent average (${Math.round(avgEntries)}/day), which may indicate greater market supply. This is an observation, not a prediction.`;
  } else if (latest.entries < avgEntries * 0.5 && avgEntries > 0) {
    context = 'BELOW_NORMAL';
    contextNote = `Current day's arrivals (${latest.entries} observations) are lower than the recent average (${Math.round(avgEntries)}/day), which may indicate limited supply. This is an observation, not a prediction.`;
  } else {
    context = 'NORMAL';
    contextNote = `Current day's arrivals (${latest.entries} observations) are within the normal range of recent observations (${Math.round(avgEntries)}/day).`;
  }

  return {
    available: true,
    latestDate: latest.date,
    latestEntries: latest.entries,
    recentDays: recentObservations.length,
    averageEntriesPerDay: Math.round(avgEntries * 10) / 10,
    context,
    contextNote,
    observations,
    note: 'Arrival counts are observational — number of price observations per day, not confirmed tonnage. Higher observation counts may indicate broader market activity.',
  };
}

module.exports = { summarizeArrivals };

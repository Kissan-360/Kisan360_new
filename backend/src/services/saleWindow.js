// Sale-window intelligence — evidence-based market timing signal.
// Uses observed historical price data, current quote freshness, and arrival
// context to classify market conditions.
// NEVER forecasts prices. NEVER claims future price will change.

/**
 * Compute a sale-window signal from observed price history.
 * @param {Array} trendSeries - [{ date, modalPrice }] sorted oldest first
 * @param {Object} currentQuote - { modalPrice, arrivalDate, source, retrievedAt }
 * @param {Object} opts - { crop, market }
 * @returns {{ signal, why, evidence, assumptions, unknowns }}
 */
function computeSaleWindow(trendSeries, currentQuote, opts = {}) {
  const why = [];
  const evidence = [];
  const assumptions = [];
  const unknowns = [];

  if (!currentQuote || !currentQuote.modalPrice) {
    return {
      signal: 'INSUFFICIENT_EVIDENCE',
      why: ['No current quote available — cannot assess market timing.'],
      evidence: [],
      assumptions: [],
      unknowns: ['Current market price'],
    };
  }

  const currentPrice = currentQuote.modalPrice;

  // Evidence: current quote
  evidence.push({
    type: 'current_quote',
    price: currentPrice,
    source: currentQuote.source || 'unknown',
    arrivalDate: currentQuote.arrivalDate || null,
    retrievedAt: currentQuote.retrievedAt || null,
  });

  // Analyze historical trend if available
  if (!trendSeries || trendSeries.length < 2) {
    unknowns.push('Only one or no historical observations — trend context insufficient');
    assumptions.push('Signal defaults to NEUTRAL when history is sparse');
    return {
      signal: 'NEUTRAL',
      why: [
        `Current modal price: ₹${currentPrice.toLocaleString('en-IN')}/q`,
        'Insufficient historical observations to assess relative position — this describes the present only.',
      ],
      evidence,
      assumptions,
      unknowns,
    };
  }

  const prices = trendSeries.map(s => s.modalPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const range = max - min;
  const days = trendSeries.length;

  // Where does the current price sit in the observed range?
  const rangePct = range > 0 ? ((currentPrice - min) / range) * 100 : 50;

  evidence.push({
    type: 'historical_range',
    windowDays: days,
    observedMin: min,
    observedMax: max,
    observedAvg: avg,
    currentPricePosition: Math.round(rangePct) + '%',
  });

  assumptions.push('Range based on observed AGMARKNET modal prices only');
  assumptions.push('No forecast — this describes where the current price sits in recent history');

  // Freshness check
  const arrivalDate = currentQuote.arrivalDate;
  let freshnessDays = null;
  if (arrivalDate) {
    const arrival = new Date(arrivalDate);
    const now = new Date();
    freshnessDays = Math.floor((now - arrival) / (1000 * 60 * 60 * 24));
    evidence.push({ type: 'freshness', arrivalDate, daysOld: freshnessDays });

    if (freshnessDays > 3) {
      unknowns.push(`Quote is ${freshnessDays} days old — market may have moved`);
    }
  }

  // Signal determination
  let signal;
  if (rangePct >= 70) {
    signal = 'FAVORABLE_NOW';
    why.push(`Current price ₹${currentPrice.toLocaleString('en-IN')}/q is in the upper ${Math.round(100 - rangePct)}% of the observed ${days}-day range (₹${min.toLocaleString('en-IN')}–₹${max.toLocaleString('en-IN')}).`);
    why.push('This describes where the current price sits relative to recent observations — not a prediction.');
  } else if (rangePct <= 30) {
    signal = 'WEAK_RELATIVE_TO_HISTORY';
    why.push(`Current price ₹${currentPrice.toLocaleString('en-IN')}/q is in the lower ${Math.round(rangePct)}% of the observed ${days}-day range (₹${min.toLocaleString('en-IN')}–₹${max.toLocaleString('en-IN')}).`);
    why.push('This describes the present only — Kisan360 does not forecast prices.');
  } else {
    signal = 'NEUTRAL';
    why.push(`Current price ₹${currentPrice.toLocaleString('en-IN')}/q is within the middle range of observed prices over ${days} days (₹${min.toLocaleString('en-IN')}–₹${max.toLocaleString('en-IN')}).`);
  }

  if (freshnessDays != null && freshnessDays > 3) {
    why.push(`The quote is ${freshnessDays} days old — consider that market conditions may differ.`);
  }

  return { signal, why, evidence, assumptions, unknowns };
}

module.exports = { computeSaleWindow };

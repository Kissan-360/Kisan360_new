/**
 * UPI intent builder (TEST MODE ONLY).
 *
 * Builds a `upi://pay` deep link for a *simulated* demo payment. It never
 * settles, releases, or mutates a Payment: the returned intent is a preview
 * the user may open/copy in a UPI app. The payee comes only from server env
 * (`UPI_TEST_PAYEE_VPA` / `UPI_TEST_PAYEE_NAME`) — never from the client —
 * and generation requires `PAYMENTS_TEST_MODE=1`.
 *
 * Important: a UPI deep link addresses a real UPI handle. Configure only a
 * test/sandbox handle for demos; the note on every payload says TEST MODE.
 */

function isTestModeEnabled(env = process.env) {
  return env.PAYMENTS_TEST_MODE === '1';
}

function normalizeVpa(vpa) {
  const clean = String(vpa || '').trim().toLowerCase();
  // localpart@handle — conservative UPI VPA shape.
  return /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9-]{2,15}$/.test(clean) ? clean : null;
}

function cleanName(name) {
  const clean = String(name || 'Kisan360 Test').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || 'Kisan360 Test';
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function shortRef(paymentId) {
  const id = String(paymentId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return id ? id.slice(0, 24) : 'demo';
}

/**
 * Build a test UPI intent. Returns null with a reason when the request is
 * not eligible, so routes can map it to a 503/400 without throwing.
 */
function buildTestUpiIntent(payment, env = process.env) {
  if (!isTestModeEnabled(env)) {
    return { ok: false, status: 503, reason: 'UPI test intent disabled (set PAYMENTS_TEST_MODE=1)' };
  }
  if (!payment) {
    return { ok: false, status: 404, reason: 'Payment not found' };
  }
  if (payment.mocked === false) {
    return { ok: false, status: 400, reason: 'UPI intent is only available for simulated demo payments' };
  }
  const payeeVpa = normalizeVpa(env.UPI_TEST_PAYEE_VPA);
  if (!payeeVpa) {
    return { ok: false, status: 503, reason: 'UPI test payee not configured (set UPI_TEST_PAYEE_VPA)' };
  }
  const amount = formatAmount(payment.amount);
  if (!amount) {
    return { ok: false, status: 400, reason: 'Payment amount must be a positive number' };
  }

  const payeeName = cleanName(env.UPI_TEST_PAYEE_NAME);
  const crop = String(payment.crop || 'crop').replace(/\s+/g, ' ').trim().slice(0, 24) || 'crop';
  const ref = shortRef(payment._id);
  const note = `Kisan360 TEST ${crop} ${ref}`.slice(0, 80);
  const params = {
    pa: payeeVpa,
    pn: payeeName,
    am: amount,
    cu: 'INR',
    tn: note,
    tr: `kisan_${ref}`,
  };
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  return {
    ok: true,
    status: 200,
    testMode: true,
    intent: {
      scheme: 'upi',
      uri: `upi://pay?${query}`,
      params,
      note: 'TEST MODE — intent preview only. No settlement, release, or state change.',
    },
  };
}

module.exports = { isTestModeEnabled, normalizeVpa, formatAmount, buildTestUpiIntent };

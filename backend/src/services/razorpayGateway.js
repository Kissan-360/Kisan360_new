/**
 * Razorpay gateway (TEST mode only).
 * - KEY_ID/SECRET from env; test keys start with rzp_test_
 * - Mocked by default when keys are missing (demo-safe, never crashes).
 * - Real money NEVER moves in test mode; UPI/card test flows are safe.
 */
const crypto = require('crypto');

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  if (!keyId.startsWith('rzp_test_')) {
    // Live keys are never used without an explicit override — demo-safe.
    if (process.env.RAZORPAY_LIVE_ENABLED !== '1') return null;
  }
  const Razorpay = require('razorpay');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function verifySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { return false; }
}

module.exports = { getRazorpay, verifySignature };

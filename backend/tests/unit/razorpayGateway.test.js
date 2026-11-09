// Razorpay gateway — signature primitives (no network, no keys in CI)
const crypto = require('crypto');

describe('razorpayGateway signatures', () => {
  test('verifySignature matches HMAC(order|payment)', () => {
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    const { verifySignature } = require('../../src/services/razorpayGateway');
    const sig = crypto.createHmac('sha256', 'test_secret').update('order_1|pay_1').digest('hex');
    expect(verifySignature('order_1', 'pay_1', sig)).toBe(true);
    expect(verifySignature('order_1', 'pay_1', 'bad')).toBe(false);
  });

  test('verifyWebhook matches HMAC(rawBody)', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'wh_secret';
    const { verifyWebhook } = require('../../src/services/razorpayGateway');
    const body = '{"event":"payment.captured"}';
    const sig = crypto.createHmac('sha256', 'wh_secret').update(body).digest('hex');
    expect(verifyWebhook(body, sig)).toBe(true);
    expect(verifyWebhook(body, 'bad')).toBe(false);
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  test('getRazorpay returns null without keys (demo-safe)', () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const { getRazorpay } = require('../../src/services/razorpayGateway');
    expect(getRazorpay()).toBe(null);
  });
});

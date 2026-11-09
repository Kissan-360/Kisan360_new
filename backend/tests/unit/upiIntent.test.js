const { isTestModeEnabled, normalizeVpa, buildTestUpiIntent } = require('../../src/services/upiIntent');

const ENV = {
  PAYMENTS_TEST_MODE: '1',
  UPI_TEST_PAYEE_VPA: 'kisan360-test@okhdfcbank',
  UPI_TEST_PAYEE_NAME: 'Kisan360 Test',
};

const PAYMENT = { _id: '665f1a2b3c4d5e6f7a8b9c0d', crop: 'Onion', amount: 46320, mocked: true };

describe('upiIntent', () => {
  test('test mode is explicit-only', () => {
    expect(isTestModeEnabled({ PAYMENTS_TEST_MODE: '1' })).toBe(true);
    expect(isTestModeEnabled({})).toBe(false);
    expect(isTestModeEnabled({ PAYMENTS_TEST_MODE: '0' })).toBe(false);
  });

  test('VPA validation rejects malformed handles', () => {
    expect(normalizeVpa('Kisan360-Test@okhdfcbank')).toBe('kisan360-test@okhdfcbank');
    expect(normalizeVpa('not-a-vpa')).toBeNull();
    expect(normalizeVpa('a@b')).toBeNull();
    expect(normalizeVpa('')).toBeNull();
  });

  test('builds an encoded test intent from the stored amount', () => {
    const result = buildTestUpiIntent(PAYMENT, ENV);
    expect(result.ok).toBe(true);
    expect(result.testMode).toBe(true);
    expect(result.intent.params).toEqual({
      pa: 'kisan360-test@okhdfcbank',
      pn: 'Kisan360 Test',
      am: '46320.00',
      cu: 'INR',
      tn: 'Kisan360 TEST Onion 665f1a2b3c4d5e6f7a8b9c0d',
      tr: 'kisan_665f1a2b3c4d5e6f7a8b9c0d',
    });
    expect(result.intent.uri).toMatch(/^upi:\/\/pay\?pa=kisan360-test%40okhdfcbank&/);
    expect(result.intent.uri).toContain('am=46320.00');
    expect(result.intent.note).toMatch(/TEST MODE/);
    expect(result.intent.note).toMatch(/No settlement/);
  });

  test('disabled or unconfigured intents are honest failures, never links', () => {
    expect(buildTestUpiIntent(PAYMENT, {}).ok).toBe(false);
    expect(buildTestUpiIntent(PAYMENT, { PAYMENTS_TEST_MODE: '1' }).status).toBe(503);
    expect(buildTestUpiIntent(PAYMENT, { ...ENV, UPI_TEST_PAYEE_VPA: 'bad' }).reason).toMatch(/payee/);
  });

  test('non-simulated and invalid-amount payments are refused', () => {
    expect(buildTestUpiIntent({ ...PAYMENT, mocked: false }, ENV).status).toBe(400);
    expect(buildTestUpiIntent({ ...PAYMENT, amount: 0 }, ENV).status).toBe(400);
    expect(buildTestUpiIntent(null, ENV).status).toBe(404);
  });
});

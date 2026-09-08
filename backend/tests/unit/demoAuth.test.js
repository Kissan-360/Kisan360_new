const jwt = require('jsonwebtoken');
const { ISSUER, AUDIENCE, signDemoToken, verifyDemoToken, toDemoUser, normalizeRole } = require('../../src/services/demoAuth');

describe('demoAuth', () => {
  test('signs and verifies a demo token round-trip', () => {
    const token = signDemoToken({ uid: 'f1', role: 'farmer', name: 'Ramesh', district: 'Pune' });
    const decoded = verifyDemoToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.sub).toBe('f1');
    expect(decoded.role).toBe('farmer');
    expect(decoded.name).toBe('Ramesh');
    expect(decoded.district).toBe('Pune');
    expect(decoded.demo).toBe(true);
  });

  test('unknown role normalizes to farmer', () => {
    const decoded = verifyDemoToken(signDemoToken({ role: 'spy' }));
    expect(decoded.role).toBe('farmer');
    expect(normalizeRole('buyer')).toBe('buyer');
    expect(normalizeRole('fpo')).toBe('fpo');
    expect(normalizeRole(undefined)).toBe('farmer');
  });

  test('default uid/name/district come from the role profile', () => {
    const decoded = verifyDemoToken(signDemoToken({ role: 'fpo' }));
    expect(decoded.sub).toBe('demo-fpo');
    expect(decoded.name).toBe('Demo FPO');
    expect(decoded.district).toBe('Nashik');
  });

  test('rejects tampered tokens', () => {
    const token = signDemoToken({ role: 'farmer' });
    const tampered = `${token.slice(0, -3)}abc`;
    expect(verifyDemoToken(tampered)).toBeNull();
  });

  test('rejects tokens with a different issuer/audience', () => {
    const secret = process.env.DEMO_JWT_SECRET || 'kisan360-dev-demo-secret';
    const wrong = jwt.sign({ sub: 'x', demo: true }, secret, { issuer: 'other', audience: 'other' });
    expect(verifyDemoToken(wrong)).toBeNull();
  });

  test('toDemoUser maps decoded claims to a request user', () => {
    const decoded = verifyDemoToken(signDemoToken({ uid: 'b1', role: 'buyer' }));
    const user = toDemoUser(decoded);
    expect(user.uid).toBe('b1');
    expect(user.role).toBe('buyer');
    expect(user.auth).toBe('demo');
    expect(user.demo).toBe(true);
    expect(user).not.toHaveProperty('iss');
  });

  test('non-demo JWT signed with the same secret is rejected', () => {
    const secret = process.env.DEMO_JWT_SECRET || 'kisan360-dev-demo-secret';
    const token = jwt.sign({ sub: 'x', role: 'farmer' }, secret, { issuer: ISSUER, audience: AUDIENCE });
    expect(verifyDemoToken(token)).toBeNull();
  });
});

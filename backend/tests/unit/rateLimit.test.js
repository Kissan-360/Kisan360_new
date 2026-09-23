// The limiter's contract, including the bug it was written to fix.
//
// The previous global limiter answered a throttled request with the PLAIN-TEXT
// body "Too many requests", so the frontend called JSON.parse on it and the user
// saw `Unexpected token 'T', "Too many r"... is not valid JSON` instead of a
// readable message. Every response here must therefore be JSON — that assertion
// is the point of this file, not an afterthought.

const { createRateLimiter, isEnabled, DEFAULT_MAX, DEFAULT_AUTH_MAX } = require('../../src/middleware/rateLimit');

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function fakeReq(ip = '203.0.113.7') {
  return { ip, socket: { remoteAddress: ip } };
}

describe('rate limiter', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.KISAN_RATE_LIMIT;
    delete process.env.NODE_ENV;
  });

  test('allows requests up to the limit and reports the budget', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, enabled: true });
    for (let i = 1; i <= 3; i += 1) {
      const res = fakeRes();
      const next = jest.fn();
      limiter(fakeReq(), res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
      expect(res.headers['RateLimit-Remaining']).toBe(String(3 - i));
    }
  });

  test('a throttled request answers with parseable JSON, not plain text', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, enabled: true });
    limiter(fakeReq(), fakeRes(), jest.fn());

    const res = fakeRes();
    const next = jest.fn();
    limiter(fakeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(typeof res.body).toBe('object');
    // The literal failure the user hit: the body must survive JSON.parse.
    expect(() => JSON.parse(JSON.stringify(res.body))).not.toThrow();
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Too many requests/);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('the window resets and the client is allowed again', () => {
    jest.useFakeTimers();
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, enabled: true });
    limiter(fakeReq(), fakeRes(), jest.fn());

    const blocked = fakeRes();
    limiter(fakeReq(), blocked, jest.fn());
    expect(blocked.statusCode).toBe(429);

    jest.advanceTimersByTime(61_000);

    const next = jest.fn();
    limiter(fakeReq(), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('limits per client address, not globally', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, enabled: true });
    limiter(fakeReq('198.51.100.1'), fakeRes(), jest.fn());

    const blocked = fakeRes();
    limiter(fakeReq('198.51.100.1'), blocked, jest.fn());
    expect(blocked.statusCode).toBe(429);

    const otherClient = jest.fn();
    limiter(fakeReq('198.51.100.2'), fakeRes(), otherClient);
    expect(otherClient).toHaveBeenCalledTimes(1);
  });

  test('disabled means never limited (the local demo and harness path)', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, enabled: false });
    for (let i = 0; i < 50; i += 1) {
      expect(limiter(fakeReq(), fakeRes(), jest.fn())).toBeUndefined();
    }
    // No budget headers are advertised when nothing is being enforced.
    expect(limiter.stats().enabled).toBe(false);
  });

  test('enabled by production, off by default, overridable either way', () => {
    delete process.env.KISAN_RATE_LIMIT;
    process.env.NODE_ENV = 'production';
    expect(isEnabled()).toBe(true);

    delete process.env.NODE_ENV;
    expect(isEnabled()).toBe(false);

    process.env.KISAN_RATE_LIMIT = 'off';
    process.env.NODE_ENV = 'production';
    expect(isEnabled()).toBe(false); // an operator can always turn it off

    process.env.KISAN_RATE_LIMIT = 'on';
    delete process.env.NODE_ENV;
    expect(isEnabled()).toBe(true);
  });

  test('documented defaults match docs/DEPLOYMENT_GUIDE.md', () => {
    expect(DEFAULT_MAX).toBe(300);      // 300 req / 15 min per IP
    expect(DEFAULT_AUTH_MAX).toBe(30);  // 30 demo-logins / 15 min
  });
});

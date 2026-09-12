// Trading Channels tests — data integrity for the digital trading channels
// directory (eNAM et al.) plus route smoke tests via mock req/res.
//
// The route is additive (problem-statement leg: "digital trading channels")
// and serves a labeled DEMO directory; these tests pin the honesty contract.

const router = require('../../src/routes/tradingChannels');
const data = require('../../src/data/tradingChannels.json');

// ── HELPERS ─────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function callRoute(path, query = {}) {
  // Find the GET / route registered on the router stack
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/' && l.route.methods.get
  );
  expect(layer).toBeDefined();
  const req = { query, path };
  const res = mockRes();
  layer.route.stack[0].handle(req, res, () => {});
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
// DATA INTEGRITY — every channel must be complete and honestly labeled
// ════════════════════════════════════════════════════════════════════════════

describe('tradingChannels data integrity', () => {
  test('directory exists with at least eNAM present', () => {
    expect(Array.isArray(data.channels)).toBe(true);
    expect(data.channels.length).toBeGreaterThanOrEqual(3);
    const enam = data.channels.find((c) => c.id === 'enam');
    expect(enam).toBeDefined();
    expect(enam.name).toMatch(/eNAM|e-NAM/i);
  });

  test('every channel carries the full consumer contract', () => {
    for (const ch of data.channels) {
      expect(ch.id).toBeTruthy();
      expect(ch.name).toBeTruthy();
      expect(ch.operator).toBeTruthy();
      expect(ch.description.length).toBeGreaterThan(30);
      expect(ch.coverage).toBeTruthy();
      expect(Array.isArray(ch.crops)).toBe(true);
      expect(ch.crops.length).toBeGreaterThan(0);
      expect(ch.fees).toBeTruthy();
      expect(ch.settlement).toBeTruthy();
      expect(ch.howToJoin).toBeTruthy();
      expect(ch.website).toMatch(/^https:\/\//);
      expect(ch.source).toMatch(/DEMO_SEED/);
    }
  });

  test('directory is honestly classified as DEMO, never as live fact', () => {
    expect(data.meta.classification).toBe('DEMO_CHANNEL');
    expect(data.meta.note).toMatch(/DEMO CHANNEL|DEMO directory|verify/i);
    for (const ch of data.channels) {
      expect(ch.source).toMatch(/illustrative|DEMO/i);
    }
  });

  test('eNAM entry mentions farmer settlement to bank account', () => {
    const enam = data.channels.find((c) => c.id === 'enam');
    expect(enam.settlement).toMatch(/bank account/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ROUTE BEHAVIOR
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/trading-channels', () => {
  test('returns all channels with success envelope', () => {
    const res = callRoute('/');
    expect(res.statusCode).toBeNull(); // 200 default
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(data.channels.length);
    expect(res.body.classification).toBe('DEMO_CHANNEL');
    expect(res.body.channels).toHaveLength(data.channels.length);
  });

  test('crop filter keeps universal channels (crops: ["all"])', () => {
    const res = callRoute('/', { crop: 'Wheat' });
    expect(res.body.success).toBe(true);
    const ids = res.body.channels.map((c) => c.id);
    expect(ids).toContain('enam'); // universal platform always included
  });

  test('crop filter is case-insensitive', () => {
    const res = callRoute('/', { crop: 'onion' });
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
  });

  test('crop filter drops channels without any matching crop', () => {
    const res = callRoute('/', { crop: 'Durian' });
    expect(res.body.success).toBe(true);
    for (const ch of res.body.channels) {
      expect(ch.crops.includes('all') || ch.crops.some((c) => c.toLowerCase() === 'durian')).toBe(true);
    }
  });
});

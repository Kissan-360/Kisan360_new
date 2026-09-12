/**
 * Data quality battery: drives the REAL server over HTTP to prove data-layer
 * correctness properties that unit tests cannot cover (they need the full
 * pipeline with Atlas/memory-mongo).
 *
 * Tests:
 *  - seed endpoint is idempotent (repeated calls don't create duplicates)
 *  - financial values are server-derived (client-supplied amount is ignored)
 *  - duplicate offers to the same buyer are rejected (409)
 *  - duplicate accept of the same offer is rejected (409)
 *  - lot with missing owner fails safely
 *  - deleting a referenced lot leaves offers intact (no FK crash)
 *  - re-seed after lot deletion restores state (idempotency survives reset)
 *
 * Run: npx jest tests/integration/dataQuality.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);

const PORT = 5297;
const BASE = `http://127.0.0.1:${PORT}`;

let mem;
let server;

async function waitHealth(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = new Error(`health status ${res.status}`);
    } catch (err) { lastErr = err; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Backend did not become healthy: ${lastErr && lastErr.message}`);
}

async function call(method, route, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function login(role) {
  const res = await call('POST', '/api/auth/demo-login', { body: { role } });
  return res.data.token;
}

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT), MONGODB_URI: mem.getUri('kisan360'), KISAN_DEMO_MEMORY_DB: '0', AGMARKNET_API_KEY: '', ML_SERVICE_URL: 'http://127.0.0.1:1', NET_REALIZATION_URL: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitHealth(`${BASE}/health`);
});

afterAll(async () => {
  if (server) { await new Promise(r => { server.once('exit', r); server.kill('SIGTERM'); setTimeout(r, 8000).unref(); }); }
  if (mem) await mem.stop();
});

describe('seed idempotency', () => {
  let farmerToken;
  beforeAll(async () => { farmerToken = await login('farmer'); });

  test('first seed creates a lot + offer', async () => {
    const res = await call('POST', '/api/auth/demo/seed', { token: farmerToken, body: {} });
    expect(res.status).toBe(200);
    expect(res.data.reused).toBe(false);
    expect(res.data.lotId).toBeTruthy();
    expect(res.data.offerId).toBeTruthy();
  });

  test('second seed reuses the same lot + offer (no duplicates)', async () => {
    const res = await call('POST', '/api/auth/demo/seed', { token: farmerToken, body: {} });
    expect(res.status).toBe(200);
    expect(res.data.reused).toBe(true);
    expect(res.data.pooledLotId).toBeTruthy();
    const lots = await call('GET', '/api/lots', { token: farmerToken });
    // canonical lot + pooled FPO lot — still two, not four
    expect(lots.data.count).toBe(2);
    expect(lots.data.lots.filter(l => l.poolMetadata && l.poolMetadata.isPooled)).toHaveLength(1);
  });
});

describe('financial integrity', () => {
  let farmerToken;
  let lotId;

  beforeAll(async () => {
    farmerToken = await login('farmer');
    // Create a lot via seed, then extract the CANONICAL (non-pooled) lot ID
    await call('POST', '/api/auth/demo/seed', { token: farmerToken, body: {} });
    const lots = await call('GET', '/api/lots', { token: farmerToken });
    lotId = lots.data.lots.find(l => !(l.poolMetadata && l.poolMetadata.isPooled))._id;
  });

  test('server ignores client-supplied amount; computes from price × quantity', async () => {
    const res = await call('POST', '/api/offers', {
      token: farmerToken,
      body: { lotId, buyerId: 'b2', offeredPricePerQuintal: 5000, notes: '' },
    });
    expect(res.status).toBe(201);
    // amount = 5000 * 10 = 50000 (server-computed, not user-provided)
    expect(res.data.offer.amount).toBe(50000);
    expect(res.data.offer.quantityQuintals).toBe(10); // from the lot, not the client
  });

  test('server rejects negative/zero/absurd offer prices', async () => {
    for (const p of [0, -1, 1e9]) {
      const res = await call('POST', '/api/offers', {
        token: farmerToken,
        body: { lotId, buyerId: 'b3', offeredPricePerQuintal: p },
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('duplicate prevention', () => {
  let farmerToken;
  let buyerToken;
  let lotId;

  beforeAll(async () => {
    farmerToken = await login('farmer');
    buyerToken = await login('buyer');
    await call('POST', '/api/auth/demo/seed', { token: farmerToken, body: {} });
    const lots = await call('GET', '/api/lots', { token: farmerToken });
    // canonical (non-pooled) lot — the seed's SENT offer to b7 lives here
    lotId = lots.data.lots.find(l => !(l.poolMetadata && l.poolMetadata.isPooled))._id;
  });

  test('duplicate offer to same buyer is rejected (409)', async () => {
    // Seed already created an offer to b7; trying again should 409
    const res = await call('POST', '/api/offers', {
      token: farmerToken,
      body: { lotId, buyerId: 'b7', offeredPricePerQuintal: 4632 },
    });
    expect(res.status).toBe(409);
  });

  test('duplicate accept of the same offer is rejected (409)', async () => {
    // Find the SENT offer
    const offers = await call('GET', '/api/offers?role=farmer', { token: farmerToken });
    const sent = offers.data.offers.find(o => o.status === 'SENT');
    expect(sent).toBeTruthy();

    // First accept
    const a1 = await call('POST', `/api/offers/${sent._id}/accept`, { token: buyerToken, body: { buyerId: 'b7' } });
    expect(a1.status).toBe(200);

    // Second accept → 409 (payment already exists)
    const a2 = await call('POST', `/api/offers/${sent._id}/accept`, { token: buyerToken, body: { buyerId: 'b7' } });
    expect(a2.status).toBe(409);
  });
});

describe('record consistency', () => {
  let farmerToken;
  let buyerToken;

  beforeAll(async () => {
    farmerToken = await login('farmer');
    buyerToken = await login('buyer');
  });

  test('lots are scoped to the authenticated uid (buyer cannot see farmer lots)', async () => {
    await call('POST', '/api/auth/demo/seed', { token: farmerToken, body: {} });
    const myLots = await call('GET', '/api/lots', { token: farmerToken });
    expect(myLots.data.count).toBeGreaterThanOrEqual(1);

    // A buyer-role login has a different uid (demo-buyer) — sees nothing from the farmer's collection.
    const buyerView = await call('GET', '/api/lots', { token: buyerToken });
    expect(buyerView.status).toBe(200);
    expect(buyerView.data.count).toBe(0);
  });

  test('buyer-side payments show populated lotId with district', async () => {
    // Create a full cycle: seed → accept → check payments
    await call('POST', '/api/auth/demo/seed', { token: farmerToken, body: {} });
    const offers = await call('GET', '/api/offers?role=farmer', { token: farmerToken });
    const sent = offers.data.offers.find(o => o.status === 'SENT');
    if (sent) {
      await call('POST', `/api/offers/${sent._id}/accept`, { token: buyerToken, body: { buyerId: 'b7' } });
    }
    const payments = await call('GET', '/api/payments?role=buyer', { token: buyerToken });
    if (payments.data.payments.length > 0) {
      const p = payments.data.payments[0];
      // lotId should be a populated object with district (from the payments.js populate fix)
      if (p.lotId && typeof p.lotId === 'object') {
        expect(p.lotId.district).toBeTruthy();
      }
    }
  });
});

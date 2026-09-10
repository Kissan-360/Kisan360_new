/**
 * Security drill: drives the REAL server over HTTP to prove the production
 * hardening fixes hold end-to-end (same boot pattern as journey.test.js):
 *
 *  - demo-login ignores a client-forged uid (identity is derived from role)
 *  - a farmer CANNOT opt into the buyer-side book (?role=buyer → 403) on
 *    offers or payments — scope comes from the verified token role
 *  - a buyer-side login CAN read the escrow book (the UI contract still works)
 *  - unauthenticated requests to protected routes are rejected (401)
 *  - market refresh is no longer an open endpoint (401 without a token)
 *  - oversized/garbage numeric inputs get honest 400s, never 500s
 *  - offer price validation rejects zero/negative/absurd values
 *
 * Run: npx jest tests/integration/security.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);

const PORT = 5298;
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
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Backend did not become healthy: ${lastErr && lastErr.message}`);
}

async function call(method, route, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

async function login(role) {
  const res = await call('POST', '/api/auth/demo-login', { body: { role } });
  expect(res.status).toBe(200);
  return res.data.token;
}

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGODB_URI: mem.getUri('kisan360'),
      KISAN_DEMO_MEMORY_DB: '0',
      AGMARKNET_API_KEY: '',
      ML_SERVICE_URL: 'http://127.0.0.1:1',
      NET_REALIZATION_URL: 'http://127.0.0.1:1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.env.VERBOSE && console.error(String(d)));
  await waitHealth(`${BASE}/health`);
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.once('exit', resolve);
      server.kill('SIGTERM');
      setTimeout(resolve, 8000).unref();
    });
  }
  if (mem) await mem.stop();
});

describe('auth identity', () => {
  test('demo-login derives uid server-side; a forged uid is ignored', async () => {
    const res = await call('POST', '/api/auth/demo-login', {
      body: { role: 'farmer', uid: 'victim-farmer-uid' },
    });
    expect(res.status).toBe(200);
    expect(res.data.user.uid).toBe('demo-farmer');
    expect(res.data.user.uid).not.toBe('victim-farmer-uid');
  });

  test('unauthenticated requests are rejected on protected routes', async () => {
    const lots = await call('GET', '/api/lots');
    expect(lots.status).toBe(401);
    const payments = await call('GET', '/api/payments');
    expect(payments.status).toBe(401);
  });
});

describe('authorization scope', () => {
  let farmerToken;
  let buyerToken;

  beforeAll(async () => {
    farmerToken = await login('farmer');
    buyerToken = await login('buyer');
  });

  test('farmer cannot opt into the buyer-side offers book (?role=buyer → 403)', async () => {
    const res = await call('GET', '/api/offers?role=buyer', { token: farmerToken });
    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);
  });

  test('farmer cannot opt into the buyer-side payments book (?role=buyer → 403)', async () => {
    const res = await call('GET', '/api/payments?role=buyer', { token: farmerToken });
    expect(res.status).toBe(403);
  });

  test('farmer sees only their own offers/payments (farmer view still works)', async () => {
    const offers = await call('GET', '/api/offers', { token: farmerToken });
    expect(offers.status).toBe(200);
    expect(offers.data.view).toBe('farmer');
    const payments = await call('GET', '/api/payments', { token: farmerToken });
    expect(payments.status).toBe(200);
    expect(payments.data.view).toBe('farmer');
  });

  test('buyer-side login still reads the escrow book (UI contract preserved)', async () => {
    const offers = await call('GET', '/api/offers?role=buyer', { token: buyerToken });
    expect(offers.status).toBe(200);
    expect(offers.data.view).toBe('buyer');
    const payments = await call('GET', '/api/payments?role=buyer', { token: buyerToken });
    expect(payments.status).toBe(200);
    expect(payments.data.view).toBe('buyer');
  });
});

describe('request safety', () => {
  let farmerToken;

  beforeAll(async () => {
    farmerToken = await login('farmer');
  });

  test('lot creation rejects garbage numerics with 400 (never 500)', async () => {
    const cases = [
      { body: { crop: 'Onion', quantity: 'abc' } },
      { body: { crop: 'Onion', quantity: -5 } },
      { body: { crop: 'Onion', quantity: 1e12 } },
      { body: { crop: 'Onion', quantity: 10, moisturePct: 250 } },
      { body: { crop: 'Onion', quantity: 10, unit: 'bushels' } },
    ];
    for (const { body } of cases) {
      const res = await call('POST', '/api/lots', { token: farmerToken, body });
      expect([400, 201]).toContain(res.status); // 201 only if schema default accepted it
      if (res.status === 201) throw new Error(`garbage input was accepted: ${JSON.stringify(body)}`);
      expect(res.status).toBe(400);
    }
  });

  test('offer price must be a sane positive number', async () => {
    for (const offeredPricePerQuintal of [0, -3, 1e9, 'nan']) {
      const res = await call('POST', '/api/offers', {
        token: farmerToken,
        body: { lotId: '000000000000000000000000', buyerId: 'b7', offeredPricePerQuintal },
      });
      expect(res.status).toBe(400);
    }
  });

  test('malformed JSON gets a clean 400, not a crash', async () => {
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.success).toBe(false);
  });

  test('market refresh is gated (401 without a token)', async () => {
    const res = await call('POST', '/api/market/refresh');
    expect(res.status).toBe(401);
  });

  test('diagnostics reports operational status without a write probe', async () => {
    const res = await call('GET', '/api/diagnostics');
    expect(res.status).toBe(200);
    expect(res.data.checks.backendRunning).toBe(true);
    expect(res.data.writeTest.detail).toMatch(/admin token/i);
    // No secrets in the payload
    const raw = JSON.stringify(res.data);
    expect(raw).not.toMatch(/mongodb(\+srv)?:\/\//);
    expect(raw).not.toMatch(/DEMO_JWT_SECRET|AGMARKNET_API_KEY|GROQ_API_KEY/);
  });
});

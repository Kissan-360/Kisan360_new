/**
 * End-to-end journey test: boots the real Express server against an ephemeral
 * MongoDB (mongodb-memory-server) and drives the complete demo flow over HTTP:
 *
 *   demo-login (farmer) → create lot → matched buyers → send offer
 *   → demo-login (buyer) → accept → payment PENDING→HELD → release → RELEASED
 *   → illegal transition rejected (422) → farmer sees the released payment.
 *
 * Run:  npm test  (jest picks up tests/integration)
 */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(120000);

const BACKEND_DIR = path.join(__dirname, '..', '..');
const PORT = 5299;
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

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), MONGODB_URI: mem.getUri('kisan360'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => process.stdout.write(`[api] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[api-err] ${d}`));
  await waitHealth(`${BASE}/health`);
});

afterAll(async () => {
  if (server) {
    server.kill();
    await new Promise(r => setTimeout(r, 300));
  }
  if (mem) await mem.stop();
});

test('complete transaction journey over HTTP', async () => {
  // 1. Farmer logs in (demo auth) and creates a structured-quality lot.
  const farmerLogin = await call('POST', '/api/auth/demo-login', {
    body: { role: 'farmer', name: 'Ramesh', district: 'Pune' },
  });
  expect(farmerLogin.status).toBe(200);
  expect(farmerLogin.data.token).toBeTruthy();
  const fToken = farmerLogin.data.token;

  const lotRes = await call('POST', '/api/lots', {
    token: fToken,
    body: {
      crop: 'Soybean',
      variety: 'Soyabeen (Yellow)',
      quantity: 10,
      unit: 'quintals',
      grade: 'A',
      moisturePct: 10,
      damagePct: 2,
      assayStatus: 'passed',
      harvestDate: '2026-09-20',
      district: 'Pune',
    },
  });
  expect(lotRes.status).toBe(201);
  expect(lotRes.data.lot.status).toBe('OPEN');
  const lotId = lotRes.data.lot._id;

  // 2. Farmer sees matched buyers (label-tolerant crop matching).
  const buyersRes = await call('GET', '/api/buyers?crop=soybean&district=Pune');
  expect(buyersRes.status).toBe(200);
  expect(buyersRes.data.buyers.length).toBeGreaterThan(0);
  const buyer = buyersRes.data.buyers.find(b => b.minQuantityQuintals <= 10);
  expect(buyer).toBeTruthy();

  // 3. Farmer sends an offer.
  const offerRes = await call('POST', '/api/offers', {
    token: fToken,
    body: { lotId, buyerId: buyer.id, offeredPricePerQuintal: 4600 },
  });
  expect(offerRes.status).toBe(201);
  expect(offerRes.data.offer.status).toBe('SENT');
  const offerId = offerRes.data.offer._id;

  const lotAfterOffer = await call('GET', `/api/lots/${lotId}`, { token: fToken });
  expect(lotAfterOffer.data.lot.status).toBe('OFFERED');

  // 4. Buyer demo-login accepts → payment is created and moves to HELD.
  const buyerLogin = await call('POST', '/api/auth/demo-login', { body: { role: 'buyer' } });
  const bToken = buyerLogin.data.token;

  // A farmer must NOT be able to accept their own offer.
  const farmerAccept = await call('POST', `/api/offers/${offerId}/accept`, { token: fToken });
  expect(farmerAccept.status).toBe(403);

  const acceptRes = await call('POST', `/api/offers/${offerId}/accept`, { token: bToken });
  expect(acceptRes.status).toBe(200);
  expect(acceptRes.data.payment.status).toBe('HELD');
  expect(acceptRes.data.payment.mocked).toBe(true);
  expect(acceptRes.data.payment.history.map(h => h.status)).toEqual(['PENDING', 'HELD']);
  expect(acceptRes.data.offer.status).toBe('ACCEPTED');
  const paymentId = acceptRes.data.payment._id;

  const lotClosed = await call('GET', `/api/lots/${lotId}`, { token: fToken });
  expect(lotClosed.data.lot.status).toBe('CLOSED');

  // 5. Buyer releases → RELEASED.
  const releaseRes = await call('POST', `/api/payments/${paymentId}/release`, { token: bToken });
  expect(releaseRes.status).toBe(200);
  expect(releaseRes.data.payment.status).toBe('RELEASED');

  // 6. Illegal transitions are rejected server-side (422).
  const cancelRes = await call('POST', `/api/payments/${paymentId}/cancel`, { token: bToken });
  expect(cancelRes.status).toBe(422);

  // 7. Farmer sees the payment in their book with the mocked flag.
  const farmerPayments = await call('GET', '/api/payments', { token: fToken });
  expect(farmerPayments.status).toBe(200);
  const mine = farmerPayments.data.payments.find(p => p._id === paymentId);
  expect(mine).toBeTruthy();
  expect(mine.status).toBe('RELEASED');
  expect(mine.mocked).toBe(true);
});

test('price pipeline serves cached snapshot when live API is unreachable', async () => {
  // This box cannot reach data.gov.in, so the route must serve the seed with
  // provenance instead of failing.
  const res = await call('GET', '/api/market/prices?crop=soybean&state=Maharashtra');
  expect(res.status).toBe(200);
  expect(res.data.success).toBe(true);
  expect(res.data.prices.length).toBeGreaterThan(0);
  expect(['agmarknet_live', 'agmarknet_snapshot']).toContain(res.data.source);
  expect(res.data.provenance).toHaveProperty('retrievedAt');
});

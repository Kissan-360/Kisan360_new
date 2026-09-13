/**
 * Escrow-book scope for the FPO demo role.
 *
 * The FPO login previously landed on its selling screen with an EMPTY offers
 * list and NO payment timeline. Nothing crashed: the sell screen asked for
 * `?role=farmer`, the backend classified `fpo` as buyer-side and answered 403,
 * and the page swallowed the failed request into its empty state. No test
 * covered the `fpo` role against these books, so the break was invisible.
 *
 * These tests pin the contract that fixes it:
 *   - FPO is PRODUCER side: `?role=farmer` on offers AND payments is a 200
 *   - FPO's book contains ONLY its own rows (same privacy rule as a farmer)
 *   - FPO still cannot opt into the buyer book (`?role=buyer` → 403)
 *   - the farmer 403 and the buyer-side escrow read are UNCHANGED
 *
 * Run: npx jest tests/integration/roleScope.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const getFreePort = require('../helpers/freePort');

jest.setTimeout(120000);

// Allocated per run — a hardcoded port here once collided with journey.test.js
// and made the whole suite fail unpredictably. See tests/helpers/freePort.js.
let PORT;
let BASE;

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
  PORT = await getFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
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

describe('escrow-book scope for the FPO role', () => {
  let farmerToken;
  let buyerToken;
  let fpoToken;
  // Artifacts the FARMER owns. The FPO owns nothing, so anything of the
  // farmer's appearing in the FPO's book is a scope leak.
  let farmerOfferId;

  beforeAll(async () => {
    farmerToken = await login('farmer');
    buyerToken = await login('buyer');
    fpoToken = await login('fpo');

    // A farmer lot + a stated offer, so both books have at least one row that
    // does NOT belong to the FPO.
    const lotRes = await call('POST', '/api/lots', {
      token: farmerToken,
      body: {
        crop: 'Soybean',
        variety: 'Soyabeen (Yellow)',
        quantity: 10,
        unit: 'quintals',
        grade: 'A',
        district: 'Pune',
      },
    });
    expect(lotRes.status).toBe(201);
    const lotId = lotRes.data.lot._id;

    const buyersRes = await call('GET', '/api/buyers?crop=soybean&district=Pune');
    expect(buyersRes.status).toBe(200);
    const buyer = buyersRes.data.buyers.find(b => b.minQuantityQuintals <= 10);
    expect(buyer).toBeTruthy();

    const offerRes = await call('POST', '/api/offers', {
      token: farmerToken,
      body: { lotId, buyerId: buyer.id, offeredPricePerQuintal: 4600 },
    });
    expect(offerRes.status).toBe(201);
    farmerOfferId = offerRes.data.offer._id;

    // Buyer accepts → a payment row exists in the escrow book, again owned by
    // the farmer and therefore invisible to the FPO.
    const acceptRes = await call('POST', `/api/offers/${farmerOfferId}/accept`, { token: buyerToken });
    expect([200, 201]).toContain(acceptRes.status);
  });

  test('FPO reads its OWN offers book with ?role=farmer (regression: was 403)', async () => {
    const res = await call('GET', '/api/offers?role=farmer', { token: fpoToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.view).toBe('farmer');
  });

  test('FPO reads its OWN payments book with ?role=farmer (regression: was 403)', async () => {
    const res = await call('GET', '/api/payments?role=farmer', { token: fpoToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.view).toBe('farmer');
  });

  test('the FPO offers book contains ONLY its own rows (not the farmer\'s)', async () => {
    const res = await call('GET', '/api/offers?role=farmer', { token: fpoToken });
    expect(res.status).toBe(200);
    const ids = (res.data.offers || []).map(o => String(o._id));
    expect(ids).not.toContain(String(farmerOfferId));
  });

  test('the FPO payments book does not leak another farmer\'s payment', async () => {
    const res = await call('GET', '/api/payments?role=farmer', { token: fpoToken });
    expect(res.status).toBe(200);
    const rows = res.data.payments || [];
    // The FPO owns no lots, so its escrow book is legitimately empty.
    expect(rows.length).toBe(0);
  });

  test('FPO still cannot opt into the buyer-side book (?role=buyer → 403)', async () => {
    const offers = await call('GET', '/api/offers?role=buyer', { token: fpoToken });
    expect(offers.status).toBe(403);
    expect(offers.data.success).toBe(false);
    const payments = await call('GET', '/api/payments?role=buyer', { token: fpoToken });
    expect(payments.status).toBe(403);
  });

  test('a farmer still cannot opt into the buyer-side book (unchanged)', async () => {
    const offers = await call('GET', '/api/offers?role=buyer', { token: farmerToken });
    expect(offers.status).toBe(403);
    const payments = await call('GET', '/api/payments?role=buyer', { token: farmerToken });
    expect(payments.status).toBe(403);
  });

  test('a buyer-side login still reads the whole escrow book (UI contract preserved)', async () => {
    const offers = await call('GET', '/api/offers?role=buyer', { token: buyerToken });
    expect(offers.status).toBe(200);
    expect(offers.data.view).toBe('buyer');
    expect((offers.data.offers || []).map(o => String(o._id))).toContain(String(farmerOfferId));

    const payments = await call('GET', '/api/payments?role=buyer', { token: buyerToken });
    expect(payments.status).toBe(200);
    expect(payments.data.view).toBe('buyer');
    expect((payments.data.payments || []).length).toBeGreaterThan(0);
  });

  test('omitting ?role entirely never leaks scope (token decides)', async () => {
    const fpo = await call('GET', '/api/offers', { token: fpoToken });
    expect(fpo.status).toBe(200);
    expect(fpo.data.view).toBe('farmer');
    const farmer = await call('GET', '/api/offers', { token: farmerToken });
    expect(farmer.status).toBe(200);
    expect(farmer.data.view).toBe('farmer');
  });
});

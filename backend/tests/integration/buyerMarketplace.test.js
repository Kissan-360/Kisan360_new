/**
 * Buyer-side marketplace: the half of the market that used to be missing.
 *
 * Before this existed, a buyer demo-login could not browse any lots and could
 * not offer on anything — `GET /api/lots` returned only your OWN lots and
 * `POST /api/offers` required owning the lot. So a buyer saw an empty page with
 * nothing to buy. This drives the new path over HTTP:
 *
 *   buyer browses /api/lots/available → offers → producer accepts → escrow HELD
 *   → producer declines a different offer → lot returns to OPEN
 *
 * Run:  npm test
 */
const { spawn } = require('child_process');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const getFreePort = require('../helpers/freePort');

jest.setTimeout(120000);

const BACKEND_DIR = path.join(__dirname, '..', '..');
// Allocated per run so no two suites can collide — see tests/helpers/freePort.js.
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
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

let farmerToken;
let buyerToken;

beforeAll(async () => {
  PORT = await getFreePort();
  BASE = `http://127.0.0.1:${PORT}`;
  mem = await MongoMemoryServer.create();
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), MONGODB_URI: mem.getUri('kisan360'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => process.stdout.write(`[api] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[api-err] ${d}`));
  await waitHealth(`${BASE}/health`);

  const f = await call('POST', '/api/auth/demo-login', { body: { role: 'farmer', name: 'Ramesh', district: 'Nashik' } });
  farmerToken = f.data.token;
  const b = await call('POST', '/api/auth/demo-login', { body: { role: 'buyer', name: 'Demo Buyer' } });
  buyerToken = b.data.token;
});

afterAll(async () => {
  if (server) { server.kill(); await new Promise(r => setTimeout(r, 300)); }
  if (mem) await mem.stop();
});

async function createLot(overrides = {}) {
  const res = await call('POST', '/api/lots', {
    token: farmerToken,
    body: {
      crop: 'Onion', quantity: 40, unit: 'quintals', grade: 'B',
      district: 'Nashik', expectedPricePerQuintal: 2200, notes: '',
      ...overrides,
    },
  });
  expect(res.status).toBe(201);
  return res.data.lot;
}

describe('crop categories', () => {
  test('the taxonomy is served publicly with crops grouped by category', async () => {
    const res = await call('GET', '/api/market/crop-categories');
    expect(res.status).toBe(200);
    expect(res.data.count).toBeGreaterThan(0);
    const cereal = res.data.categories.find(c => c.id === 'cereal');
    expect(cereal).toBeTruthy();
    expect(cereal.crops.map(c => c.name)).toEqual(
      expect.arrayContaining(['Wheat', 'Jowar (Sorghum)', 'Bajra (Pearl Millet)', 'Maize'])
    );
  });

  test('every returned category is non-empty (no dead filter chips)', async () => {
    const res = await call('GET', '/api/market/crop-categories');
    for (const cat of res.data.categories) {
      expect(cat.cropCount).toBeGreaterThan(0);
      expect(cat.crops.length).toBe(cat.cropCount);
    }
  });
});

describe('buyer browses available lots', () => {
  test('an OPEN lot from another producer shows up for a buyer', async () => {
    const lot = await createLot();
    const res = await call('GET', '/api/lots/available', { token: buyerToken });
    expect(res.status).toBe(200);
    const found = res.data.lots.find(l => l._id === lot._id);
    expect(found).toBeTruthy();
    expect(found.crop).toBe('Onion');
    // The producer's display name reaches the buyer...
    expect(found.producer).toBe('Ramesh');
    // ...but their uid never does.
    expect(found.farmerUid).toBeUndefined();
  });

  test('a farmer never sees their own lots in the buy-side listing', async () => {
    const lot = await createLot({ crop: 'Soybean' });
    const res = await call('GET', '/api/lots/available', { token: farmerToken });
    expect(res.status).toBe(200);
    expect(res.data.lots.find(l => l._id === lot._id)).toBeUndefined();
  });

  test('category filter narrows and excludes correctly', async () => {
    await createLot({ crop: 'Onion' });          // vegetable
    await createLot({ crop: 'Wheat' });          // cereal

    const cereals = await call('GET', '/api/lots/available?category=cereal', { token: buyerToken });
    expect(cereals.status).toBe(200);
    expect(cereals.data.lots.length).toBeGreaterThan(0);
    expect(cereals.data.lots.every(l => l.crop === 'Wheat')).toBe(true);

    const veg = await call('GET', '/api/lots/available?category=vegetable', { token: buyerToken });
    expect(veg.data.lots.every(l => l.crop === 'Onion')).toBe(true);
  });

  test('an unknown category is an honest 400, not an empty success', async () => {
    const res = await call('GET', '/api/lots/available?category=bananas', { token: buyerToken });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('min quantity filter excludes lots that are too small', async () => {
    await createLot({ crop: 'Grapes', quantity: 5 });
    const res = await call('GET', '/api/lots/available?crop=Grapes&minQty=100', { token: buyerToken });
    expect(res.status).toBe(200);
    expect(res.data.lots.length).toBe(0);
  });
});

describe('buyer-initiated purchase offer', () => {
  test('buyer offers, producer accepts, escrow holds', async () => {
    const lot = await createLot({ crop: 'Tomato', quantity: 20, expectedPricePerQuintal: 1500 });

    const offer = await call('POST', '/api/offers', {
      token: buyerToken,
      body: { lotId: lot._id, offeredPricePerQuintal: 1600 },
    });
    expect(offer.status).toBe(201);
    expect(offer.data.offer.direction).toBe('BUYER_TO_FARMER');
    expect(offer.data.offer.buyerUid).toBe('demo-buyer');
    expect(offer.data.offer.farmerUid).toBe('demo-farmer');
    expect(offer.data.offer.amount).toBe(32000); // 1600 × 20 q

    const afterOffer = await call('GET', `/api/lots/${lot._id}`, { token: farmerToken });
    expect(afterOffer.data.lot.status).toBe('OFFERED');

    // A buyer must not accept (or reject) their own purchase offer.
    const selfAccept = await call('POST', `/api/offers/${offer.data.offer._id}/accept`, { token: buyerToken });
    expect(selfAccept.status).toBe(403);
    const selfReject = await call('POST', `/api/offers/${offer.data.offer._id}/reject`, { token: buyerToken });
    expect(selfReject.status).toBe(403);
    // ...and neither must strand the offer: it is still SENT afterwards.
    const stillSent = await call('GET', `/api/offers/${offer.data.offer._id}`, { token: buyerToken });
    expect(stillSent.data.offer.status).toBe('SENT');

    // The producer accepts it.
    const accept = await call('POST', `/api/offers/${offer.data.offer._id}/accept`, { token: farmerToken });
    expect(accept.status).toBe(200);
    expect(accept.data.offer.status).toBe('ACCEPTED');
    expect(accept.data.payment.status).toBe('HELD');
    expect(accept.data.payment.mocked).toBe(true);

    const closed = await call('GET', `/api/lots/${lot._id}`, { token: farmerToken });
    expect(closed.data.lot.status).toBe('CLOSED');
  });

  test('producer declining reopens the lot so other buyers can still buy', async () => {
    const lot = await createLot({ crop: 'Maize', quantity: 30 });

    const offer = await call('POST', '/api/offers', {
      token: buyerToken,
      body: { lotId: lot._id, offeredPricePerQuintal: 900 },
    });
    expect(offer.status).toBe(201);

    const offered = await call('GET', `/api/lots/${lot._id}`, { token: farmerToken });
    expect(offered.data.lot.status).toBe('OFFERED');

    const reject = await call('POST', `/api/offers/${offer.data.offer._id}/reject`, { token: farmerToken });
    expect(reject.status).toBe(200);
    expect(reject.data.offer.status).toBe('REJECTED');

    const reopened = await call('GET', `/api/lots/${lot._id}`, { token: farmerToken });
    expect(reopened.data.lot.status).toBe('OPEN');

    // And it is browsable again.
    const res = await call('GET', '/api/lots/available?crop=Maize', { token: buyerToken });
    expect(res.data.lots.find(l => l._id === lot._id)).toBeTruthy();
  });

  test('a buyer cannot offer on the same lot twice', async () => {
    const lot = await createLot({ crop: 'Chilli' });
    const first = await call('POST', '/api/offers', {
      token: buyerToken, body: { lotId: lot._id, offeredPricePerQuintal: 5000 },
    });
    expect(first.status).toBe(201);
    const second = await call('POST', '/api/offers', {
      token: buyerToken, body: { lotId: lot._id, offeredPricePerQuintal: 5100 },
    });
    expect(second.status).toBe(409);
  });

  test('a buyer can withdraw their own purchase offer, freeing the lot', async () => {
    const lot = await createLot({ crop: 'Ginger' });
    const offer = await call('POST', '/api/offers', {
      token: buyerToken, body: { lotId: lot._id, offeredPricePerQuintal: 4000 },
    });
    const withdraw = await call('POST', `/api/offers/${offer.data.offer._id}/withdraw`, { token: buyerToken });
    expect(withdraw.status).toBe(200);
    expect(withdraw.data.offer.status).toBe('WITHDRAWN');
    const lot2 = await call('GET', `/api/lots/${lot._id}`, { token: farmerToken });
    expect(lot2.data.lot.status).toBe('OPEN');
  });

  test('bad input is rejected (price, and missing/unknown lot)', async () => {
    const lot = await createLot({ crop: 'Green Peas' });
    expect((await call('POST', '/api/offers', { token: buyerToken, body: { lotId: lot._id } })).status).toBe(400);
    expect((await call('POST', '/api/offers', { token: buyerToken, body: { lotId: lot._id, offeredPricePerQuintal: -5 } })).status).toBe(400);
    expect((await call('POST', '/api/offers', { token: buyerToken, body: { lotId: 'not-an-id', offeredPricePerQuintal: 100 } })).status).toBe(400);
    const missing = await call('POST', '/api/offers', {
      token: buyerToken, body: { lotId: '68a1b2c3d4e5f60718293a4b', offeredPricePerQuintal: 100 },
    });
    expect(missing.status).toBe(404);
  });

  test('the farmer→buyer flow still creates a FARMER_TO_BUYER offer', async () => {
    const lot = await createLot({ crop: 'Pomegranate' });
    const res = await call('POST', '/api/offers', {
      token: farmerToken,
      body: { lotId: lot._id, buyerId: 'b7', offeredPricePerQuintal: 8000 },
    });
    expect(res.status).toBe(201);
    expect(res.data.offer.direction).toBe('FARMER_TO_BUYER');
    expect(res.data.offer.buyerUid).toBe('');
  });
});

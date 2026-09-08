#!/usr/bin/env node
/**
 * Daily smoke test for the Kisan360 demo stack.
 *
 * Assumes the backend (and ideally the ml services) are already running:
 *   backend  : npm run dev            (default http://localhost:5000)
 *   disease  : uvicorn main:app --port 8000            (:8000)
 *   advisory : uvicorn advisory_service:app --port 8001 (:8001)
 *   calc     : uvicorn net_realization:app --port 8002  (:8002)
 *
 * Usage: node scripts/smoke.js        (or bash scripts/smoke.sh)
 * Env:   API_URL overrides the backend base URL.
 */
const BASE = (process.env.API_URL || 'http://localhost:5000').replace(/\/+$/, '');

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
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

async function main() {
  console.log(`Kisan360 smoke test → ${BASE}\n`);

  // 1. Backend health
  try {
    const h = await call('GET', '/health');
    check('Backend /health', h.status === 200);
  } catch (e) {
    check('Backend /health', false, e.message);
  }

  // 2. Demo auth
  let fToken = null;
  try {
    const login = await call('POST', '/api/auth/demo-login', { body: { role: 'farmer', name: 'Smoke Farmer', district: 'Pune' } });
    fToken = login.data.token || null;
    check('Demo auth (farmer login)', login.status === 200 && !!fToken);
  } catch (e) {
    check('Demo auth (farmer login)', false, e.message);
  }

  // 3. P0 — net realization end-to-end (Node → FastAPI → ranked mandis)
  try {
    const nr = await call('GET', '/api/market/net-realization?crop=Onion&district=Nashik&quantity=10');
    if (nr.status === 200 && nr.data.success && nr.data.rankedMandis && nr.data.rankedMandis.length > 0) {
      const best = nr.data.rankedMandis[0];
      check('Net-realization calculator', true,
        `${nr.data.bestMandi} → net ₹${best.farmerNetPerQuintal}/q (market source: ${nr.data.marketSource})`);
    } else if (nr.status === 503) {
      check('Net-realization calculator', false, 'service offline — start: python -m uvicorn net_realization:app --port 8002');
    } else {
      check('Net-realization calculator', false, nr.data.error || `HTTP ${nr.status}`);
    }
  } catch (e) {
    check('Net-realization calculator', false, e.message);
  }

  // 4. Documented assumptions endpoint
  try {
    const a = await call('GET', '/api/market/net-realization/assumptions');
    check('Assumptions endpoint', a.status === 200 && a.data.assumptions && !!a.data.assumptions.transport);
  } catch (e) {
    check('Assumptions endpoint', false, e.message);
  }

  // 5. Buyer directory
  try {
    const b = await call('GET', '/api/buyers?crop=Onion');
    check('Buyer directory', b.status === 200 && b.data.count > 0, `${b.data.count} matched buyers`);
  } catch (e) {
    check('Buyer directory', false, e.message);
  }

  // 6. DB-backed surfaces (lots/payments) — fail fast if Mongo is down
  try {
    const lots = await call('GET', '/api/lots', { token: fToken });
    if (lots.status === 503) {
      check('Database (lots/payments)', false, 'MongoDB unavailable — check MONGODB_URI / mongod');
    } else {
      const pays = await call('GET', '/api/payments', { token: fToken });
      check('Database (lots/payments)', pays.status === 200, `lots:${lots.status} payments:${pays.status}`);
    }
  } catch (e) {
    check('Database (lots/payments)', false, e.message);
  }

  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${failed === 0 ? '✅ SMOKE PASS' : `❌ SMOKE FAIL (${failed} of ${checks.length} checks failed)`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('Smoke script crashed:', e.message);
  process.exit(1);
});

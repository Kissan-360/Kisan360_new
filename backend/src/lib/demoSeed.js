/**
 * demoSeed.js — canonical demo scenario seeder, shared by two callers:
 *
 *   1. scripts/seed-demo.js — manual reset from the CLI (or Dashboard button)
 *   2. server.js startup auto-seed — when the in-memory demo DB is empty,
 *      so a backend restart can never leave the demo journey broken.
 *
 * Canonical scenario (judge opening): Onion · 10 q · Nashik, with a Soybean
 * alt-crop lot and one offer in flight (SENT) the buyer can accept live.
 *
 * Idempotence contract: the auto-seed only runs when the demo farmer has zero
 * lots; the manual script intentionally ADDS a fresh scenario each run without
 * touching existing data (mid-journey resets are allowed to stack).
 */

const DEFAULT_BASE = 'http://127.0.0.1:5000/api';

async function seedDemoScenario({ baseUrl = DEFAULT_BASE, log = () => {} } = {}) {
  const api = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(`${method} ${path} → ${res.status}: ${data.error || 'failed'}`);
    }
    return data;
  };

  // 1. Farmer session (canonical demo identity). The server derives uid from
  //    the role (`demo-farmer`), so this session owns everything the UI shows.
  const login = await api('/auth/demo-login', {
    method: 'POST',
    body: { role: 'farmer', name: 'Ravi Patil', district: 'Nashik' },
  });
  const token = login.token;
  log('farmer session ready (demo-farmer)');

  // 2. Canonical lot — the hero scenario of the whole demo (Onion · 10 q · Nashik)
  const lotA = (await api('/lots', {
    method: 'POST',
    token,
    body: { crop: 'Onion', variety: 'Local', quantity: 10, unit: 'quintals', district: 'Nashik', grade: 'Unassessed' },
  })).lot;
  // Secondary lot for the alt-crop proof (Soybean · Akola · 12)
  const lotB = (await api('/lots', {
    method: 'POST',
    token,
    body: { crop: 'Soybean', variety: 'JS-335', quantity: 12, unit: 'quintals', district: 'Akola', grade: 'A' },
  })).lot;
  log(`lots ready — ${lotA._id} (Onion 10q Nashik, canonical) + ${lotB._id} (Soybean 12q Akola, alt-crop proof)`);

  // 3. An offer in flight on the CANONICAL lot (SENT — buyer can accept it
  //    live during the demo). Price anchors to the calculator decision target.
  const offer = (await api('/offers', {
    method: 'POST',
    token,
    body: { lotId: lotA._id, buyerId: 'b7', offeredPricePerQuintal: 4632 },
  })).offer;
  log(`offer ${offer._id} SENT to ${offer.buyerName} (₹${offer.amount}) — buyer can accept it live`);

  // 4. FPO rehearsal state — pooled compute + pooled lot so /fpo renders without
  //    manual setup. Best-effort: never fail the canonical seed (calculator may
  //    be down; /fpo still computes on demand in that case).
  let pooled = null;
  try {
    pooled = await api('/fpo/pool', {
      method: 'POST',
      token,
      body: { district: 'Nashik' },
    });
    const pooledLot = await api('/fpo/create-pooled-lot', {
      method: 'POST',
      token,
      body: { district: 'Nashik' },
    });
    const econ = pooledLot.pooledEconomics || {};
    log(`fpo pool ready — pooled lot ${pooledLot.lot._id} (${econ.pooledQuantity}q, ${econ.memberCount} members) — /fpo renders on load`);
  } catch (e) {
    log(`fpo pool skipped (${e.message}) — /fpo still computes on demand`);
  }

  return { token, lotA, lotB, offer, pooled };
}

module.exports = { seedDemoScenario, DEFAULT_BASE };

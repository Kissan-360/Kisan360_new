#!/usr/bin/env node
/**
 * seed-demo.js — put the demo into a mid-journey state so the presenter can
 * start anywhere in the run of show. Idempotent: re-running creates a fresh
 * farmer session and lots each time; existing data is left alone.
 *
 * Canonical scenario (judge opening): Onion · 10 q · Nashik.
 *
 * Usage (from backend/):  node scripts/seed-demo.js [baseUrl]
 * Env: none required (demo auth is self-contained).
 */
const BASE = process.argv[2] || 'http://localhost:5000/api';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
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
}

async function main() {
  console.log(`Seeding demo state at ${BASE} …`);

  // 1. Farmer session (canonical demo identity)
  const login = await api('/auth/demo-login', {
    method: 'POST',
    body: { role: 'farmer', name: 'Ravi Patil', district: 'Pune', uid: 'demo-farmer-seed' },
  });
  const token = login.token;
  console.log('✓ farmer session ready (demo-farmer-seed)');

  // 2. Canonical lot — the hero scenario of the whole demo (Onion · 10 q · Nashik)
  const lotA = (await api('/lots', { method: 'POST', token, body: { crop: 'Onion', variety: 'Local', quantity: 10, unit: 'quintals', district: 'Nashik', grade: 'Unassessed' } })).lot;
  // Secondary lot for the alt-crop proof (Soybean · Akola · 12)
  const lotB = (await api('/lots', { method: 'POST', token, body: { crop: 'Soybean', variety: 'JS-335', quantity: 12, unit: 'quintals', district: 'Akola', grade: 'A' } })).lot;
  console.log(`✓ lots ${lotA._id} (Onion 10q Nashik — canonical) + ${lotB._id} (Soybean 12q Akola — alt-crop proof)`);

  // 3. An offer in flight on the CANONICAL lot (SENT — buyer can accept it live
  //    during the demo). Price anchors to the calculator's decision target.
  const offer = (await api('/offers', { method: 'POST', token, body: { lotId: lotA._id, buyerId: 'b7', offeredPricePerQuintal: 4632 } })).offer;
  console.log(`✓ offer ${offer._id} SENT to ${offer.buyerName} (₹${offer.amount}) — buyer can accept it live`);

  console.log('\nDemo ready. Canonical run of show:');
  console.log('  1. /dashboard → Run canonical scenario (Onion · 10 q · Nashik) → calculator');
  console.log('  2. /net-realization → WITHOUT/WITH card → Why? drawer → what-if 50 q flip');
  console.log('  3. "Sell at <best mandi> — create lot →" → /trade pre-filled → matched buyers (Matched because ✓) → offer →');
  console.log('  4. switch to buyer demo login → Accept → release funds → PaymentOutcome + receipt');
  console.log('  5. /fpo → crop follows the decision → individual vs pooled uplift');
  console.log('  Reset any time: node scripts/seed-demo.js  (or the Dashboard demo-controls card)');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

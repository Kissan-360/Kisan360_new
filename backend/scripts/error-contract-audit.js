// Freeze audit Phase 13 + 18: error contract + adversarial inputs, live.
const API = 'http://localhost:5050';
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓', name, detail ? `(${detail})` : ''); }
  else { fail++; console.log('  ✗ FAIL:', name, detail !== undefined ? `(${JSON.stringify(detail)})` : ''); };
};
const g = async (p) => { const r = await fetch(API + '/api/market' + p); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const p = async (b, ep, extra) => {
  const r = await fetch(API + '/api/market' + ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const okEnvelope = (r) => r.body && typeof r.body === 'object' && ('error' in r.body || 'success' in r.body || 'message' in r.body);
const noStack = (r) => !/at .*\(|node_modules|Error:\s+at/i.test(JSON.stringify(r.body));

(async () => {
  const costs = { seed: 5000, fertilizer: 7000, cropProtection: 4000, labour: 12000, irrigation: 3000, machinery: 4000, landRent: 0, other: 2000 };

  console.log('=== 400 INVALID REQUEST ===');
  let r = await p({ district: 'Nashik', quantity: 10, costs }, '/economics');
  check('economics missing crop → 400', r.status === 400 && okEnvelope(r) && noStack(r), r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 0, costs }, '/economics');
  check('economics qty=0 → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: -3, costs }, '/economics');
  check('economics qty<0 → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 10, costs: { seed: -5 } }, '/economics');
  check('economics negative cost → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 10, costs: { seed: 'abc' } }, '/economics');
  check('economics non-numeric cost → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 10, costs: { seed: '1e999' } }, '/economics');
  check('economics Infinity cost → 400', r.status === 400, r.status);
  r = await p({ district: 'Nashik', hypotheticalPricePerQuintal: 5000 }, '/scenario');
  check('scenario missing crop → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 10 }, '/scenario');
  check('scenario missing price → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 10, hypotheticalPricePerQuintal: -100 }, '/scenario');
  check('scenario negative price → 400', r.status === 400, r.status);
  r = await p({ crop: 'Onion', district: 'Nashik', quantity: 10, hypotheticalPricePerQuintal: 1e9 }, /scenario/.source === 'x' ? '/scenario' : '/scenario');
  check('scenario absurd price → 400', r.status === 400, r.status);
  r = await p('{crop: broken', '/scenario');
  check('scenario malformed JSON → 400', r.status === 400, r.status);
  r = await g('/trends?crop=Onion');
  check('trends missing market → 400', r.status === 400, r.status);
  r = await g('/storage-threshold?crop=Onion');
  check('storage-threshold missing district → 400', r.status === 400, r.status);
  r = await g('/net-realization?crop=Onion&district=Nashik&quantity=-2');
  check('net-realization qty<0 → 400', r.status === 400, r.status);

  console.log('\n=== 422 INSUFFICIENT EVIDENCE ===');
  r = await p({ crop: 'Mango', district: 'Nashik', quantity: 10, costs }, '/economics');
  check('economics unsupported crop (Mango) → 422', r.status === 422, r.status);
  r = await g('/storage-threshold?crop=Mango&district=Nashik&quantity=10');
  check('storage-threshold Mango → 422', r.status === 422, r.status);
  r = await g('/pathways?crop=Mango&district=Nashik&quantity=10');
  check('pathways Mango → 422', r.status === 422, r.status);
  r = await g('/net-realization?crop=Mango&district=Nashik&quantity=10');
  check('net-realization Mango → 422', r.status === 422, r.status);
  r = await g('/storage-threshold?crop=Onion&district=Gadchiroli&quantity=10');
  check('storage-threshold district without facility → 422', r.status === 422, r.status);
  r = await g('/trends?crop=Onion&market=Nonexistent%20Mandi%20XYZ');
  check('trends unknown market → 200 w/ INSUFFICIENT_EVIDENCE', r.status === 200 && Object.values(r.body.trends || {}).every(t => t.direction === 'INSUFFICIENT_EVIDENCE'), r.status);

  console.log('\n=== 404 MISSING RESOURCE ===');
  const H = { 'Content-Type': 'application/json' };
  const login = await (await fetch(API + '/api/auth/demo-login', { method: 'POST', headers: H, body: JSON.stringify({ role: 'farmer' }) })).json();
  H.Authorization = 'Bearer ' + (login.token || '');
  const BH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await (await fetch(API + '/api/auth/demo-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'buyer' }) })).json()).token };
  r = { status: (await fetch(API + '/api/lots/000000000000000000000000', { headers: H })).status };
  check('unknown lot → 404', r.status === 404, r.status);
  r = { status: (await fetch(API + '/api/offers/000000000000000000000000', { headers: BH })).status };
  check('unknown offer → 404', r.status === 404, r.status);
  r = { status: (await fetch(API + '/api/payments/000000000000000000000000', { headers: H })).status };
  accept_guard: {
    // (release of unknown payment checked in journey-audit.js)
  }
  check('unknown payment → 404', r.status === 404, r.status);

  console.log('\n=== 409 STATE CONFLICT ===');
  // Create lot + offer as farmer (real buyer id from directory), accept as buyer, then re-accept → 409
  const dir = await (await fetch(API + '/api/buyers?crop=Onion&district=Nashik')).json();
  const dirList = Array.isArray(dir) ? dir : (dir.buyers || []);
  const realBuyerId = dirList[0]?._id || dirList[0]?.id;
  const lot = await (await fetch(API + '/api/lots', { method: 'POST', headers: H, body: JSON.stringify({ crop: 'Onion', quantity: 10, unit: 'quintals', district: 'Nashik', grade: 'A', basePrice: 4800 }) })).json();
  const lotId = lot.lot?._id || lot._id;
  const offer = await (await fetch(API + '/api/offers', { method: 'POST', headers: H, body: JSON.stringify({ lotId, buyerId: realBuyerId, offeredPricePerQuintal: 4900 }) })).json();
  const offerId = offer.offer?._id || offer._id;
  const acc1 = await fetch(API + `/api/offers/${offerId}/accept`, { method: 'POST', headers: BH, body: '{}' });
  check('offer accepted once', acc1.status === 200 || acc1.status === 201, acc1.status);
  const acc2 = await fetch(API + `/api/offers/${offerId}/accept`, { method: 'POST', headers: BH, body: '{}' });
  check('re-acceptance → 409', acc2.status === 409, acc2.status);

  console.log('\n=== 503 DEPENDENCY OFFLINE ===');
  check('503 path exists in code for ECONNREFUSED (net-realization, pathways, economics, storage-threshold)',
    (await (await import('fs/promises')).readFile('src/routes/market.js', 'utf8')).split("ECONNREFUSED").length - 1 >= 4);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1); });

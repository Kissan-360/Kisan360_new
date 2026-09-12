// Freeze audit Phases 10–12: buyer/pathway consistency, trust tiers,
// payment state machine. Live API verification (services on :5050/:8002).
const API = 'http://localhost:5050';
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name, detail !== undefined ? `(${JSON.stringify(detail)})` : ''); }
};

(async () => {
  console.log('=== PHASE 10: PATHWAY → NEXTACTION → MARKET CONSISTENCY ===');
  const pw = await (await fetch(`${API}/api/market/pathways?crop=Onion&district=Nashik&quantity=10`)).json();
  check('pathways success', pw.success === true);
  const rec = pw.recommendation?.pathway || pw.recommendation?.type;
  const nextMarket = pw.nextAction?.market;
  const econBest = pw.economicSummary?.bestMarket || pw.economicBest?.market;
  console.log('    recommendation:', rec, '| nextAction:', pw.nextAction?.type, '→', nextMarket, '| economicBest:', econBest);
  if (pw.nextAction?.type === 'CREATE_LOT' || pw.nextAction?.type === 'CONNECT_BUYER') {
    check('nextAction.market is a real market name (non-empty string)', typeof nextMarket === 'string' && nextMarket.length > 0);
    // The nextAction market must be either the economic best (direct sale) or
    // explicitly explained (aggregation: same destination, better logistics).
    check('nextAction market is economicBest OR explanation provided',
      nextMarket === econBest || !!pw.recommendation?.headline || !!pw.recommendation?.summary || (pw.nextAction?.reason || '').length > 0,
      { nextMarket, econBest });
  }
  if (rec === 'AGGREGATE_THROUGH_FPO') {
    check('aggregation keeps the intended destination market explicit', typeof nextMarket === 'string' && nextMarket === econBest,
      { nextMarket, econBest, reason: pw.nextAction?.reason });
  }

  console.log('\n=== PHASE 11: BUYER TRUST TIERS (no DEMO_VERIFIED → "verified" laundering) ===');
  const buyersRes = await fetch(`${API}/api/buyers?crop=Onion&district=Nashik`);
  const buyers = await buyersRes.json();
  const list = Array.isArray(buyers) ? buyers : (buyers.buyers || buyers.data || []);
  check('buyer list returned', Array.isArray(list) && list.length > 0, typeof list);
  const tiers = new Set();
  for (const b of list) {
    const t = b.trustTier || b.trust_tier;
    tiers.add(t);
    const raw = JSON.stringify(b);
    check(`buyer "${b.name}" has explicit trustTier`, !!t, b);
    check(`buyer "${b.name}" no generic "verified buyer" laundering`,
      !/"verifiedBuyer"\s*:\s*true/i.test(raw) && !/tier\s*:\s*"verified"/i.test(raw));
  }
  console.log('    tiers present:', [...tiers].join(', '));
  check('all tiers from the canonical set', [...tiers].every(t => ['REAL_VERIFIED', 'SOURCE_VERIFIED', 'DEMO_VERIFIED', 'SELF_DECLARED'].includes(t)), [...tiers]);

  console.log('\n=== PHASE 12: PAYMENT STATE MACHINE (in-memory demo DB) ===');
  const H = { 'Content-Type': 'application/json' };
  // Demo auth: the API's documented dev path
  const loginRes = await fetch(`${API}/api/auth/demo-login`, { method: 'POST', headers: H, body: JSON.stringify({ role: 'farmer' }) });
  const login = await loginRes.json();
  const token = login.token || login.accessToken || login.data?.token;
  check('demo-login issued a token', !!token, { status: loginRes.status, body: login });
  H.Authorization = `Bearer ${token}`;
  // Build the minimal happy path: lot → offer → accept → payment → release
  const lotRes = await fetch(`${API}/api/lots`, { method: 'POST', headers: H, body: JSON.stringify({ crop: 'Onion', quantity: 10, unit: 'quintals', district: 'Nashik', grade: 'A', basePrice: 4800 }) });
  const lot = await lotRes.json();
  const lotId = lot.lot?._id || lot._id || lot.id || lot.lotId;
  check('lot created (201/200)', lotRes.status === 200 || lotRes.status === 201, { status: lotRes.status, body: lot });
  check('lot references crop/quantity', (lot.lot || lot).crop === 'Onion' && Number((lot.lot || lot).quantity) === 10, lot);

  const offerRes = await fetch(`${API}/api/offers`, { method: 'POST', headers: H, body: JSON.stringify({ lotId, buyerId: list[0]?._id || list[0]?.id, offeredPricePerQuintal: 4900 }) });
  const offer = await offerRes.json();
  const offerId = offer.offer?._id || offer._id || offer.id;
  check('offer created', offerRes.status === 200 || offerRes.status === 201, { status: offerRes.status, body: offer });

  // Buyer-side role for acceptance + release (state-machine permission model)
  const bLoginRes = await fetch(`${API}/api/auth/demo-login`, { method: 'POST', headers: H, body: JSON.stringify({ role: 'buyer' }) });
  const bLogin = await bLoginRes.json();
  const bToken = bLogin.token || bLogin.accessToken || bLogin.data?.token;
  check('buyer demo-login issued a token', !!bToken, { status: bLoginRes.status, body: bLogin });
  const BH = { 'Content-Type': 'application/json', Authorization: `Bearer ${bToken}` };

  // Invalid transition: accept a bogus offer id must NOT 200 with success
  const badAccept = await fetch(`${API}/api/offers/${'0'.repeat(24)}/accept`, { method: 'POST', headers: BH, body: '{}' });
  check('accepting nonexistent offer fails safely', badAccept.status === 404 || badAccept.status === 400 || badAccept.status === 409, badAccept.status);

  const accRes = await fetch(`${API}/api/offers/${offerId}/accept`, { method: 'POST', headers: BH, body: '{}' });
  const acc = await accRes.json();
  check('offer accepted', accRes.status === 200 || accRes.status === 201, { status: accRes.status, body: acc });
  const payment = acc.payment || acc.transaction || acc;
  const payId = payment._id || payment.id || payment.paymentId;
  check('acceptance yields payment', !!payId, acc);
  check('payment mocked:true preserved', payment.mocked === true || payment.mock === true || JSON.stringify(acc).includes('"mocked":true'), acc);

  // Invalid transition: release before acceptance / on bogus id
  const badRelease = await fetch(`${API}/api/payments/${'0'.repeat(24)}/release`, { method: 'POST', headers: BH, body: '{}' });
  check('releasing nonexistent payment fails safely', badRelease.status === 404 || badRelease.status === 400 || badRelease.status === 409, badRelease.status);

  const relRes = await fetch(`${API}/api/payments/${payId}/release`, { method: 'POST', headers: BH, body: '{}' });
  const rel = await relRes.json();
  check('payment released', relRes.status === 200, { status: relRes.status, body: rel });
  const relPay = rel.payment || rel;
  check('released payment still mocked:true', relPay.mocked === true || JSON.stringify(rel).includes('"mocked":true'), rel);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1); });

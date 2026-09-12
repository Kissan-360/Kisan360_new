// Freeze audit Phase 20: final live verification — both canonical scenarios,
// unsupported crop, invalid quantity, insufficient-trend market. Uses the
// current snapshot; values shown are diagnostics, not fixtures.
const API = 'http://localhost:5050';
const g = async (p) => { const r = await fetch(API + '/api/market' + p); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const post = async (ep, b) => { const r = await fetch(API + '/api/market' + ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const costsA = { seed: 5000, fertilizer: 7000, cropProtection: 4000, labour: 12000, irrigation: 3000, machinery: 4000, landRent: 0, other: 2000 };
const costsB = { seed: 3500, fertilizer: 5000, cropProtection: 2500, labour: 9000, irrigation: 2000, machinery: 3000, landRent: 0, other: 1500 };

(async () => {
  console.log('══ A. NASHIK / ONION / 10q ══');
  let r = await g('/net-realization?crop=Onion&district=Nashik&quantity=10');
  console.log(`net-realization  ${r.status} | best: ${r.body.rankedMandis?.[0]?.market} ₹${r.body.rankedMandis?.[0]?.farmerNetPerQuintal}/q | serving: ${r.body.servingMode} | observedOn: ${r.body.marketProvenance?.observedOn ?? r.body.rankedMandis?.[0]?.observedOn ?? 'n/a'} | retrievedAt: ${r.body.marketProvenance?.retrievedAt}`);
  r = await post('/economics', { crop: 'Onion', district: 'Nashik', quantity: 10, costs: costsA });
  console.log(`economics        ${r.status} | best: ${r.body.marketEconomics?.bestNetMarket?.market} profit ₹${r.body.marketEconomics?.bestNetMarket?.estimatedProfitPerQuintal}/q | ${r.body.marketEconomics?.bestNetMarket?.profitabilityStatus} | breakEven ₹${r.body.productionEconomics?.breakEvenPricePerQuintal}/q | serving: ${r.body.servingMode}`);
  r = await post('/scenario', { crop: 'Onion', district: 'Nashik', quantity: 10, costs: costsA, hypotheticalPricePerQuintal: 6000, distanceKm: 25 });
  console.log(`scenario @6000   ${r.status} | profit ₹${r.body.outcome?.scenarioProfit?.total} | vsCurrentObserved Δ₹${r.body.outcome?.differenceVsCurrentObservedNet ?? 'n/a'} | hypothetical: ${r.body.semantics?.type}`);
  r = await g('/storage-threshold?crop=Onion&district=Nashik&quantity=10');
  console.log(`storage-thresh   ${r.status} | ref: ${r.body.referenceMarket} | threshold ₹${r.body.breakEvenFuturePriceForStorage}/q | forecast: ${r.body.semantics?.forecast}`);

  console.log('\n══ B. AKOLA / SOYBEAN / 10q ══');
  r = await g('/net-realization?crop=Soybean&district=Akola&quantity=10');
  console.log(`net-realization  ${r.status} | best: ${r.body.rankedMandis?.[0]?.market} ₹${r.body.rankedMandis?.[0]?.farmerNetPerQuintal}/q`);
  r = await post('/economics', { crop: 'Soybean', district: 'Akola', quantity: 10, costs: costsB });
  const bBest = r.body.marketEconomics?.bestNetMarket;
  console.log(`economics        ${r.status} | best: ${bBest?.market} profit ₹${bBest?.estimatedProfitPerQuintal}/q | ${bBest?.profitabilityStatus} | breakEven ₹${r.body.productionEconomics?.breakEvenPricePerQuintal}/q`);
  const leak = JSON.stringify(r.body).match(/Mangal Wedha|Lasalgaon|4898|4974/);
  console.log(`cross-scenario leakage check: ${leak ? 'LEAK: ' + leak[0] : 'CLEAN'}`);

  console.log('\n══ C-E. EDGE CASES ══');
  r = await post('/economics', { crop: 'Mango', district: 'Nashik', quantity: 10, costs: costsA });
  console.log(`Mango economics      ${r.status} | ${r.body.error?.slice(0, 70)}`);
  r = await post('/economics', { crop: 'Onion', district: 'Nashik', quantity: 0, costs: costsA });
  console.log(`qty=0 economics      ${r.status} | ${r.body.error}`);
  r = await g('/trends?crop=Onion&market=Unknown%20Mandi%20XYZ');
  console.log(`unknown-mkt trends   ${r.status} | 7d: ${r.body.trends?.['7d']?.direction} | obs: ${r.body.trends?.['7d']?.observationCount}`);
  r = await g('/storage-threshold?crop=Onion&district=Gadchiroli&quantity=10');
  console.log(`no-facility thresh   ${r.status} | ${r.body.error?.slice(0, 70)}`);

  console.log('\n══ PATHWAYS DECISION (both scenarios) ══');
  r = await g('/pathways?crop=Onion&district=Nashik&quantity=10');
  console.log(`A: ${r.status} | ${r.body.recommendation?.pathway} | next: ${r.body.nextAction?.type} → ${r.body.nextAction?.market} | econBest: ${r.body.economicSummary?.bestMarket}`);
  r = await g('/pathways?crop=Soybean&district=Akola&quantity=10');
  console.log(`B: ${r.status} | ${r.body.recommendation?.pathway} | next: ${r.body.nextAction?.type} → ${r.body.nextAction?.market} | econBest: ${r.body.economicSummary?.bestMarket}`);
})().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });

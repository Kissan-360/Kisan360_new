// Cross-endpoint consistency matrix — canonical scenario: Nashik/Onion/10q.
// Freeze-audit diagnostic (run with the API on :5050). Not part of the test suite.
const BASE = 'http://localhost:5050/api/market';

const g = async (p) => (await fetch(BASE + p)).json();
const post = async (b, ep) => (await fetch(BASE + ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();

(async () => {
  const out = {};
  // 1. All endpoints, same scenario, back-to-back
  out.netreal = await g('/net-realization?crop=Onion&district=Nashik&quantity=10');
  out.pathways = await g('/pathways?crop=Onion&district=Nashik&quantity=10');
  const costs = { seed: 5000, fertilizer: 7000, cropProtection: 4000, labour: 12000, irrigation: 3000, machinery: 4000, landRent: 0, other: 2000 };
  out.econ = await post({ crop: 'Onion', district: 'Nashik', quantity: 10, costs }, '/economics');
  out.trend = await g('/trends?crop=Onion&market=' + encodeURIComponent('Lasalgaon(Niphad)'));
  out.thresh = await g('/storage-threshold?crop=Onion&district=Nashik&quantity=10');
  const buyersRes = await fetch('http://localhost:5050/api/buyers?crop=Onion&district=Nashik');
  out.buyers = await buyersRes.json();

  const ep = (x, f) => { try { return f(x); } catch { return 'ERR'; } };

  // 2. Identity + provenance
  console.log('=== IDENTITY ===');
  console.log('netreal   crop/district/qty:', ep(out.netreal, x => `${x.crop}/${x.district}/${x.quantityQuintals}`));
  console.log('pathways  crop/district/qty:', ep(out.pathways, x => `${x.crop}/${x.district}/${x.quantityQuintals}`));
  console.log('econ      crop/district/qty:', ep(out.econ, x => `${x.input?.crop}/${x.input?.district}/${x.input?.quantityQuintals}`));
  console.log('thresh    crop/district/qty:', ep(out.thresh, x => `${x.crop}/${x.district}/${x.quantityQuintals}`));
  console.log('trend     crop/market:', ep(out.trend, x => `${x.crop}/${x.market}`));

  console.log('\n=== PROVENANCE (retrievedAt identifies which snapshot produced the calc) ===');
  console.log('netreal   retrievedAt:', ep(out.netreal, x => x.marketProvenance?.retrievedAt), '| serving:', ep(out.netreal, x => x.servingMode));
  console.log('econ      retrievedAt:', ep(out.econ, x => x.marketProvenance?.retrievedAt), '| serving:', ep(out.econ, x => x.servingMode));
  console.log('thresh    retrievedAt:', ep(out.thresh, x => x.marketProvenance?.retrievedAt), '| serving:', ep(out.thresh, x => x.servingMode));
  console.log('pathways  retrievedAt:', ep(out.pathways, x => x.marketProvenance?.retrievedAt), '| serving:', ep(out.pathways, x => x.servingMode));
  console.log('trend     source/serving:', ep(out.trend, x => `${x.source} / ${x.servingMode}`));
  console.log('buyers    count:', Array.isArray(out.buyers) ? out.buyers.length : (out.buyers.buyers?.length ?? out.buyers.count));

  console.log('\n=== ECONOMIC BEST AGREEMENT ===');
  const nrBest = out.netreal?.rankedMandis?.[0]?.market;
  const nrNet = out.netreal?.rankedMandis?.[0]?.farmerNetPerQuintal;
  const pwBest = out.pathways?.economicSummary?.bestMarket || out.pathways?.economicBest?.market || out.pathways?.economicBest;
  const ecBest = out.econ?.marketEconomics?.bestNetMarket?.market;
  const ecNet = out.econ?.marketEconomics?.bestNetMarket?.farmerNetPerQuintal;
  console.log('netreal best:', nrBest, 'net ₹' + nrNet);
  console.log('pathways economicBest:', pwBest);
  console.log('economics bestNetMarket:', ecBest, 'net ₹' + ecNet);
  console.log('storage-threshold referenceMarket:', out.thresh?.referenceMarket, '(net ₹' + out.thresh?.currentNetPerQuintal + ')');
  console.log('\nnetreal == pathways economicBest:', nrBest === pwBest ? 'MATCH' : 'DIFFER');
  console.log('netreal == economics bestNetMarket:', nrBest === ecBest ? 'MATCH' : 'DIFFER');
  console.log('econ bestProfit == bestNet (fixed-cost property):', out.econ?.marketEconomics?.bestProfitMarket?.market === ecBest ? 'MATCH' : 'DIFFER');
  console.log('threshold ref == netreal best:', out.thresh?.referenceMarket === nrBest ? 'MATCH' : 'DIFFER');
})().catch(e => { console.error('MATRIX FAILED:', e.message); process.exit(1); });

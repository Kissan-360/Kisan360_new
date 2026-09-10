import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL, apiFetch, getDemoUser } from '../lib/api';
import { getDecisionContext, setDecisionContext, DecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';

// Trade page — HLD P0.3/P0.4 screens: create a lot, see matched buyers with
// trust badges, send an offer, and watch the simulated payment move
// Pending → Held → Released. All backend contracts are already tested; this
// is pure UI against them.

interface Lot {
  _id: string;
  crop: string;
  variety?: string;
  quantity: number;
  unit: string;
  grade?: string;
  size?: string;
  moisturePct?: number | null;
  damagePct?: number | null;
  assayStatus?: string;
  district?: string;
  status: string;
  createdAt: string;
}

interface Buyer {
  id: string;
  name: string;
  category: string;
  crops: string[];
  districts: string[];
  trustTier: string;
  tierLabel: string;
  tierDescription: string;
  minQuantityQuintals: number;
  paymentTermsLabel: string;
  verificationNote: string;
  description?: string;
}

interface Offer {
  _id: string;
  lotId: any;
  buyerId: string;
  buyerName: string;
  crop: string;
  quantityQuintals: number;
  offeredPricePerQuintal: number;
  amount: number;
  status: string;
  createdAt: string;
  history?: { status: string; at: string; note?: string }[];
}

interface Grievance {
  _id: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
  resolutionNote?: string;
  history?: { to: string; at: string; note?: string }[];
}

interface Payment {
  _id: string;
  lotId?: any; // backend populates { district, ... } so buyer-side benchmarks use the REAL haul district
  buyerName: string;
  crop: string;
  amount: number;
  status: string;
  createdAt: string;
  history?: { from: string | null; to: string; at: string; note?: string }[];
}

const TIER_STYLES: Record<string, { cls: string; icon: string }> = {
  REAL_VERIFIED: { cls: 'badge-green', icon: '✅' },
  SOURCE_VERIFIED: { cls: 'badge-blue', icon: '🔎' },
  DEMO_VERIFIED: { cls: 'badge-yellow', icon: '🧪' },
  SELF_DECLARED: { cls: 'badge-red', icon: '⚠️' },
};

const OFFER_STEPS = ['SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
const PAYMENT_STEPS = ['PENDING', 'HELD', 'RELEASED'];
const GRIEVANCE_STEPS = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'];
const GRIEVANCE_CATEGORIES = ['PAYMENT_DELAY', 'QUALITY_DISPUTE', 'WEIGHT_DISPUTE', 'BUYER_NO_SHOW', 'OTHER'];

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const isBuyerSide = (role?: string) => ['buyer', 'fpo', 'admin'].includes(role || '');

// Final outcome (WOW #3): after a payment is RELEASED, answer "what did the
// farmer gain?" The deal ₹/q is an identity (amount ÷ quantity); the benchmark
// comes from the deterministic engine for the lot's crop+district. No
// fabricated uplift — if the engine is unreachable we show the deal only.
const PaymentOutcome = ({ payment, lot }: { payment: Payment; lot?: Lot }) => {
  const dealPerQ = payment.quantityQuintals > 0 ? Math.round((payment.amount / payment.quantityQuintals) * 100) / 100 : 0;
  const [bench, setBench] = useState<{ bestNet: number; bestMandi: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const district = lot?.district;
    if (!district || !payment.crop) {
      // Fall back to the backend-populated lot reference before giving up —
      // the district is the difference between a right and a wrong benchmark.
      const refDistrict = payment.lotId && typeof payment.lotId === 'object' ? payment.lotId.district : undefined;
      if (!refDistrict || !payment.crop) { setFailed(true); return; }
      apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(payment.crop)}&district=${encodeURIComponent(refDistrict)}&quantity=${payment.quantityQuintals}`)
        .then(r => r.json())
        .then(j => {
          if (!alive) return;
          if (j.success && j.rankedMandis?.length) setBench({ bestNet: j.rankedMandis[0].farmerNetPerQuintal, bestMandi: j.rankedMandis[0].market });
          else setFailed(true);
        })
        .catch(() => { if (alive) setFailed(true); });
      return () => { alive = false; };
    }
    apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(payment.crop)}&district=${encodeURIComponent(district)}&quantity=${payment.quantityQuintals}`)
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j.success && j.rankedMandis?.length) setBench({ bestNet: j.rankedMandis[0].farmerNetPerQuintal, bestMandi: j.rankedMandis[0].market });
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [payment._id]);

  const delta = bench ? Math.round((dealPerQ - bench.bestNet) * 100) / 100 : null;
  const beat = delta != null && delta >= 0;

  return (      <div className={`mt-3 rounded-xl p-4 border ${beat ? 'border-emerald-300 bg-emerald-50/70' : bench ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-gray-50'}`}>
        {/* Three-tier story: reference (market) vs offer (negotiated) vs deal (locked) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400">Market reference</p>
            {bench ? (
              <>
                <p className="font-semibold text-gray-800 mt-0.5">{inr(bench.bestNet)}/q</p>
                <p className="text-[11px] text-gray-400">engine's estimated best net today ({bench.bestMandi}) — an observation, not a guaranteed price</p>
              </>
            ) : <p className="text-xs text-gray-400 mt-0.5">unavailable</p>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400">Buyer offer (accepted)</p>
            <p className="font-semibold text-gray-800 mt-0.5">{inr(dealPerQ)}/q</p>
            <p className="text-[11px] text-gray-400">negotiated between farmer and buyer</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-emerald-600">Locked deal</p>
            <p className="font-bold text-emerald-800 mt-0.5">{inr(payment.amount)}</p>
            <p className="text-[11px] text-gray-400">for {payment.quantityQuintals} q of {payment.crop} — the transaction record</p>
          </div>
        </div>
        {bench && delta != null && (
          <p className={`text-sm mt-3 ${beat ? 'text-emerald-800' : 'text-amber-800'}`}>
            {beat
              ? <>The accepted offer landed <strong>{inr(delta)}/q above</strong> today's market reference.</>
              : <>The accepted offer is <strong>{inr(Math.abs(delta))}/q below</strong> today's market reference. References are market observations, not guaranteed transaction prices — offers can sit below reference for many honest reasons, and prices move.</>}
          </p>
        )}
      {failed && <p className="text-xs text-gray-400 mt-1">Benchmark context unavailable right now — the deal figures above are the transaction record.</p>}
      <p className="text-[10px] text-gray-400 mt-1.5">Deal figures come from the transaction record; the benchmark comes from the deterministic engine. Payment itself is simulated.</p>
    </div>
  );
};

// Offer benchmark (deal-support): compares the buyer's offer ₹/q against the
// engine's estimated best farmer net today. Documented deterministic bands —
// within 3% below reference = NEAR, more than 3% below = BELOW. Never advice:
// Kisan360 supplies the reference; the farmer makes the decision.
const OFFER_BAND_PCT = 3;
const OfferBenchmark = ({ offer, lot, buyer }: { offer: Offer; lot?: Lot; buyer?: Buyer }) => {
  const [bench, setBench] = useState<{ net: number; mandi: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // Phase 7 — offer context grounded in structured data that actually exists
  // on the lot and buyer records. Nothing speculative.
  const factors: string[] = [];
  if (lot?.grade && lot.grade !== 'Unassessed') factors.push(`Lot grade: ${lot.grade}`);
  if (lot?.moisturePct != null) factors.push(`Lot moisture: ${lot.moisturePct}%`);
  if (lot?.damagePct != null) factors.push(`Visible damage: ${lot.damagePct}%`);
  if (buyer && offer.quantityQuintals < buyer.minQuantityQuintals) factors.push(`Quantity ${offer.quantityQuintals} q is below ${buyer.name}'s usual ${buyer.minQuantityQuintals} q minimum`);
  if (buyer?.paymentTermsLabel) factors.push(`Buyer's terms: ${buyer.paymentTermsLabel}`);

  useEffect(() => {
    let alive = true;
    if (!offer.crop) { setFailed(true); return; }
    // Ground the benchmark in the REAL lot district: the farmer's own lot
    // record, else the backend-populated lot reference on the offer (present
    // in buyer view). No district → no benchmark. Never assume a default —
    // a wrong-district reference is worse than none.
    const district = lot?.district
      || (offer.lotId && typeof offer.lotId === 'object' ? offer.lotId.district : undefined);
    if (!district) { setFailed(true); return; }
    apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(offer.crop)}&district=${encodeURIComponent(district)}&quantity=${offer.quantityQuintals}`)
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j.success && j.rankedMandis?.length) setBench({ net: j.rankedMandis[0].farmerNetPerQuintal, mandi: j.rankedMandis[0].market });
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [offer._id]);

  if (failed) {
    return <p className="text-[11px] text-gray-400 mt-2">Market reference unavailable right now — compare against today's mandi prices before accepting.</p>;
  }
  if (!bench) return null;
  const diff = Math.round((offer.offeredPricePerQuintal - bench.net) * 100) / 100;
  const pct = bench.net > 0 ? Math.round((diff / bench.net) * 1000) / 10 : 0;
  const status = diff >= 0 ? 'ABOVE REFERENCE' : pct >= -OFFER_BAND_PCT ? 'NEAR REFERENCE' : 'BELOW REFERENCE';
  const cls = diff >= 0 ? 'badge-green' : pct >= -OFFER_BAND_PCT ? 'badge-yellow' : 'badge-red';
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${cls} shrink-0`}>{status}</span>
        <span className="text-xs text-gray-600">
          Offer <strong>{inr(offer.offeredPricePerQuintal)}/q</strong> vs market reference <strong>{inr(bench.net)}/q</strong> ({bench.mandi}) → {diff >= 0 ? '+' : '−'}{inr(Math.abs(diff))}/q ({pct >= 0 ? '+' : ''}{pct}%)
        </span>
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">
        Reference = estimated farmer net at the best mandi today, after farmer-borne costs — a market observation, not a guaranteed transaction price.
      </p>
      {status === 'BELOW REFERENCE' && factors.length === 0 && (
        <p className="text-[11px] text-gray-500 mt-1">Not enough structured information on this lot or buyer to explain the difference — ask the buyer directly.</p>
      )}
      <p className="text-[10px] text-gray-400 mt-1">Deterministic comparison (within {OFFER_BAND_PCT}% = near reference). Kisan360 informs — you decide.</p>
      {factors.length > 0 && (
        <div className="mt-1.5">
          <p className="text-[11px] font-medium text-gray-500">Factors on record that may explain the difference:</p>
          <ul className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
            {factors.map((f) => <li key={f}>• {f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

// Lot economics: the farmer's economic stake at a glance — engine benchmark
// for this lot vs the best live offer. Derived numbers only, no profit claims.
const LotEconomics = ({ lot, offers }: { lot: Lot; offers: Offer[] }) => {
  const [bench, setBench] = useState<{ net: number; mandi: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!lot.district || !lot.crop) { setFailed(true); return; }
    apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(lot.crop)}&district=${encodeURIComponent(lot.district)}&quantity=${myQtyQ(lot)}`)
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j.success && j.rankedMandis?.length) setBench({ net: j.rankedMandis[0].farmerNetPerQuintal, mandi: j.rankedMandis[0].market });
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [lot._id]);

  if (failed || !bench) return null;
  const qty = myQtyQ(lot);
  const benchmarkTotal = Math.round(bench.net * qty * 100) / 100;
  const lotOffers = offers.filter(o => String(o.lotId) === String(lot._id) && !['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(o.status));
  const bestOfferQ = lotOffers.length ? Math.max(...lotOffers.map(o => o.offeredPricePerQuintal)) : null;
  const gap = bestOfferQ != null ? Math.round((bestOfferQ - bench.net) * 100) / 100 : null;
  return (
    <p className="text-[11px] text-gray-500 mt-1.5">
      📊 Lot value — engine benchmark: <strong>{inr(benchmarkTotal)}</strong> ({inr(bench.net)}/q at {bench.mandi})
      {bestOfferQ != null && gap != null && (
        <> · best offer: <strong>{inr(bestOfferQ)}/q</strong> ({gap >= 0 ? '+' : '−'}{inr(Math.abs(gap))}/q vs benchmark)</>
      )}
    </p>
  );
};

// Decision receipt (Phase 15): one compact answer to "what exactly did
// Kisan360 recommend, and what actually happened?" Every row is real data —
// the context object, the transaction record, the engine's reference.
const DecisionReceipt = ({ ctx, payments, lots }: { ctx: DecisionContext; payments: Payment[]; lots: Lot[] }) => {
  const p = payments[0];
  const lot = lots.find(l => l._id === String(p.lotId));
  const dealPerQ = p.quantityQuintals > 0 ? Math.round((p.amount / p.quantityQuintals) * 100) / 100 : 0;
  const diff = ctx.net > 0 ? Math.round((dealPerQ - ctx.net) * 100) / 100 : null;
  return (
    <div className="card p-5 border-emerald-300 bg-emerald-50/50">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-900">Kisan360 selling decision — receipt</p>
        <span className="badge badge-yellow">simulated transaction</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
        <div><p className="text-[11px] uppercase tracking-wider text-gray-400">You told us</p><p className="text-gray-800 font-medium">{ctx.crop} · {ctx.quantity} q · {ctx.district}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-gray-400">We recommended</p><p className="text-gray-800 font-medium">{ctx.mandi} · est. {inr(ctx.net)}/q</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-gray-400">Buyer offered / deal</p><p className="text-gray-800 font-medium">{p.buyerName} · {inr(dealPerQ)}/q ({inr(p.amount)})</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-gray-400">Vs recommendation</p><p className={diff != null ? (diff >= 0 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium') : 'text-gray-400'}>{diff != null ? `${diff >= 0 ? '+' : '−'}${inr(Math.abs(diff))}/q` : 'reference unavailable'}</p></div>
      </div>
      <p className="text-[11px] text-gray-500 mt-3">Price source: {ctx.source === 'agmarknet_live' ? 'live AGMARKNET pull' : 'cached AGMARKNET snapshot'} at decision time · lot {lot ? lot._id.slice(-6) : (p.lotId && typeof p.lotId === 'object' ? String(p.lotId._id) : String(p.lotId ?? 'unknown')).slice(-6)} · recorded {new Date(p.createdAt).toLocaleDateString('en-IN')}. The estimate was a market observation — the deal is the outcome.</p>
    </div>
  );
};

// Quintal conversion matching the backend's own rule (Lot stores qty + unit).
function myQtyQ(lot: Lot): number {
  const q = Number(lot.quantity) || 0;
  if (lot.unit === 'kg') return q / 100;
  if (lot.unit === 'tonnes') return q * 10;
  return q;
}

// Decision history (Phase 12): what previous deals landed vs the market
// reference at that time. Turns the one-time calculator into a continuous
// intelligence loop. No invented rows — only actual transaction records.
const DecisionHistory = ({ payments, lots }: { payments: Payment[]; lots: Lot[] }) => {
  const settled = payments.filter((p) => p.status === 'RELEASED');
  const [refs, setRefs] = useState<Record<string, { ref: number; mandi: string } | 'fail'>>({});

  useEffect(() => {
    let alive = true;
    settled.forEach((p) => {
      const lot = lots.find((l) => l._id === String(p.lotId));
      const district = lot?.district
        || (p.lotId && typeof p.lotId === 'object' ? p.lotId.district : undefined);
      if (!district) {
        if (alive) setRefs((prev) => ({ ...prev, [p._id]: 'fail' }));
        return;
      }
      apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(p.crop)}&district=${encodeURIComponent(district)}&quantity=${p.quantityQuintals}`)
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          setRefs((prev) => ({ ...prev, [p._id]: j.success && j.rankedMandis?.length ? { ref: j.rankedMandis[0].farmerNetPerQuintal, mandi: j.rankedMandis[0].market } : 'fail' }));
        })
        .catch(() => { if (alive) setRefs((prev) => ({ ...prev, [p._id]: 'fail' })); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments.length]);

  if (settled.length === 0) return null;
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Your selling record</h2>
      <p className="text-xs text-gray-400 mb-1">Completed deals from this account vs the market reference on record. Demonstrates the outcome loop on demo transactions only.</p>
      <p className="text-[11px] text-gray-400 mb-3">Records like these are how the product learns over time — comparing outcomes against assumptions is what would refine future cost estimates. Kisan360 observes, decides, transacts, records; it does not predict.</p>
      <div className="space-y-2">
        {settled.map((p) => {
          const dealPerQ = p.quantityQuintals > 0 ? Math.round((p.amount / p.quantityQuintals) * 100) / 100 : 0;
          const r = refs[p._id];
          const ref = r && r !== 'fail' ? r.ref : null;
          const diff = ref != null ? Math.round((dealPerQ - ref) * 100) / 100 : null;
          return (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-gray-900">{p.crop} · {p.quantityQuintals} q → {p.buyerName}</p>
                <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString('en-IN')} · accepted at {inr(dealPerQ)}/q</p>
              </div>
              <div className="text-right">
                {ref != null && diff != null ? (
                  <>
                    <p className={`font-semibold ${diff >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {diff >= 0 ? '+' : '−'}{inr(Math.abs(diff))}/q vs reference ({inr(ref)}/q)
                    </p>
                    <p className="text-[10px] text-gray-400">reference = engine's best-mandi estimate{r && r !== 'fail' ? ` (${r.mandi})` : ''}</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">reference unavailable right now</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TradePage = () => {
  const user = getDemoUser();
  const buyerView = isBuyerSide(user?.role);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [lots, setLots] = useState<Lot[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [trustTiers, setTrustTiers] = useState<Record<string, { label: string; description: string }>>({});
  const [offers, setOffers] = useState<Offer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [showGrievanceForm, setShowGrievanceForm] = useState(false);
  const [gCategory, setGCategory] = useState('PAYMENT_DELAY');
  const [gDescription, setGDescription] = useState('');
  const [gLotId, setGLotId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Lot form
  const [showLotForm, setShowLotForm] = useState(false);
  const [crop, setCrop] = useState('Soybean');
  const [variety, setVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('quintals');
  const [grade, setGrade] = useState('Unassessed');
  const [district, setDistrict] = useState('Pune');
  const [harvestDate, setHarvestDate] = useState('');
  const [size, setSize] = useState('');
  const [moisturePct, setMoisturePct] = useState('');
  const [damagePct, setDamagePct] = useState('');
  const [assayStatus, setAssayStatus] = useState('pending');
  const [expectedNet, setExpectedNet] = useState('');
  // Decision→action handoff: /trade?prefill=1&crop=Onion&district=Nashik&quantity=10&mandi=...&net=...
  const [prefillNote, setPrefillNote] = useState('');
  // Decision continuity: the canonical selling context from the calculator.
  const [ctx] = useState(() => getDecisionContext());

  // Offer form
  const [offerLot, setOfferLot] = useState<Lot | null>(null);
  const [offerBuyer, setOfferBuyer] = useState<Buyer | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [cropFilter, setCropFilter] = useState('');

  const loadAll = async () => {
    try {
      // The backend picks the listing scope from the ?role= query param
      // (default 'farmer'). Buyer/fpo logins MUST send role=buyer or they see
      // an empty book and cannot accept/release anything.
      const roleScope = buyerView ? 'buyer' : 'farmer';
      const [lotsRes, buyersRes, offersRes, paymentsRes, grievancesRes] = await Promise.all([
        apiFetch(`${API_URL}/lots`),
        apiFetch(`${API_URL}/buyers${cropFilter ? `?crop=${encodeURIComponent(cropFilter)}` : ''}`),
        apiFetch(`${API_URL}/offers?role=${roleScope}`),
        apiFetch(`${API_URL}/payments?role=${roleScope}`),
        apiFetch(`${API_URL}/grievances`),
      ]);
      const lotsData = await lotsRes.json();
      const buyersData = await buyersRes.json();
      const offersData = await offersRes.json();
      const paymentsData = await paymentsRes.json();
      const grievancesData = await grievancesRes.json();
      if (lotsData.success) setLots(lotsData.lots);
      if (buyersData.success) {
        setBuyers(buyersData.buyers);
        setTrustTiers(buyersData.trustTiers || {});
      }
      if (offersData.success) setOffers(offersData.offers);
      if (paymentsData.success) setPayments(paymentsData.payments);
      if (grievancesData.success) setGrievances(grievancesData.grievances);
    } catch {
      setError('Could not reach the backend — check the API connection and try again.');
    }
  };

  useEffect(() => {
    loadAll();
    // One-time prefill from the net-realization decision.
    if (searchParams.get('prefill') === '1') {
      const pCrop = searchParams.get('crop');
      const pDistrict = searchParams.get('district');
      const pQty = searchParams.get('quantity');
      const pMandi = searchParams.get('mandi');
      const pNet = searchParams.get('net');
      if (pCrop) setCrop(pCrop);
      if (pDistrict) setDistrict(pDistrict);
      if (pQty && parseFloat(pQty) > 0) setQuantity(pQty);
      if (pNet) setExpectedNet(pNet);
      setShowLotForm(true);
      setPrefillNote(`From your decision: sell ${pCrop || 'your crop'} at ${pMandi || 'the best mandi'} — estimated ${pNet ? `₹${Number(pNet).toLocaleString('en-IN')}/q net` : 'best net realization'}. Confirm the details and publish.`);
      // Remember the recommended mandi for the decision header.
      setDecisionContext({
        crop: pCrop || 'Soybean',
        district: pDistrict || 'Pune',
        quantity: Number(pQty) || 10,
        mandi: pMandi || 'the best mandi',
        net: Number(pNet) || 0,
      });
      window.history.replaceState({}, '', '/trade');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myQuantityQuintals = useMemo(() => {
    if (!offerLot) return 0;
    const q = Number(offerLot.quantity) || 0;
    if (offerLot.unit === 'kg') return q / 100;
    if (offerLot.unit === 'tonnes') return q * 10;
    return q;
  }, [offerLot]);

  const createLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(`${API_URL}/lots`, {
        method: 'POST',
        body: JSON.stringify({
          crop, variety, quantity: Number(quantity), unit, grade, district, harvestDate,
          size,
          moisturePct: moisturePct === '' ? null : Number(moisturePct),
          damagePct: damagePct === '' ? null : Number(damagePct),
          assayStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Lot created for ${data.lot.quantity} ${data.lot.unit} of ${data.lot.crop}.`);
        setShowLotForm(false);
        setQuantity('');
        setVariety('');
        setHarvestDate('');
        setSize('');
        setMoisturePct('');
        setDamagePct('');
        setAssayStatus('pending');
        loadAll();
      } else {
        setError(data.error || 'Failed to create lot');
      }
    } catch {
      setError('Failed to create lot');
    }
  };

  const sendOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerLot || !offerBuyer) return;
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(`${API_URL}/offers`, {
        method: 'POST',
        body: JSON.stringify({ lotId: offerLot._id, buyerId: offerBuyer.id, offeredPricePerQuintal: Number(offerPrice) }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Offer sent to ${offerBuyer.name}: ${inr(Number(offerPrice))}/q × ${myQuantityQuintals} q = ${inr(data.offer.amount)}.`);
        setOfferLot(null);
        setOfferBuyer(null);
        setOfferPrice('');
        loadAll();
      } else {
        setError(data.error || 'Failed to send offer');
      }
    } catch {
      setError('Failed to send offer');
    }
  };

  const raiseGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const body: Record<string, string> = { category: gCategory, description: gDescription };
      if (gLotId) body.lotId = gLotId;
      const res = await apiFetch(`${API_URL}/grievances`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setNotice('Grievance raised — status OPEN. You can track it below.');
        setShowGrievanceForm(false);
        setGDescription('');
        setGLotId('');
        loadAll();
      } else {
        setError(data.error || 'Failed to raise grievance');
      }
    } catch {
      setError('Failed to raise grievance');
    }
  };

  // One POST per action path at a time — rapid double-clicks on Accept/
  // Release/Reject must not fire duplicate requests (the backend rejects them
  // with 409/422, but the operator should never see that noise).
  const inFlight = React.useRef<Set<string>>(new Set());
  const act = async (path: string, okMsg: string, body: object = {}) => {
    if (inFlight.current.has(path)) return;
    inFlight.current.add(path);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(`${API_URL}${path}`, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        setNotice(okMsg);
        loadAll();
      } else {
        setError(data.error || 'Action failed');
      }
    } catch {
      setError('Action failed');
    } finally {
      inFlight.current.delete(path);
    }
  };

  const openLots = lots.filter((l) => l.status === 'OPEN' || l.status === 'OFFERED');

  // Decision state strip (continuity): DISCOVERING → … → COMPLETED, derived
  // from existing transaction state — not a workflow engine, just a mirror.
  const decisionPhase = (() => {
    if (payments.some(p => p.status === 'RELEASED')) return 'COMPLETED';
    if (payments.some(p => p.status === 'HELD' || p.status === 'PENDING')) return 'DEAL ACCEPTED';
    if (offers.some(o => o.status === 'SENT')) return 'OFFER RECEIVED';
    if (offers.some(o => o.status === 'ACCEPTED')) return 'DEAL ACCEPTED';
    if (lots.length > 0) return 'READY TO SELL';
    return ctx ? 'READY TO SELL' : 'DISCOVERING';
  })();
  const PHASES = ['DISCOVERING', 'EVALUATING', 'READY TO SELL', 'BUYER FOUND', 'OFFER RECEIVED', 'DEAL ACCEPTED', 'COMPLETED'];
  // BUYER FOUND: an offer lot has a selected buyer, or buyers exist for the context crop.
  const buyerFound = offerBuyer != null || buyers.some(b => !ctx || b.crops.some(c => c.toLowerCase() === ctx.crop.toLowerCase()));
  const phaseIdx = Math.max(PHASES.indexOf(decisionPhase), buyerFound ? 3 : 0);

  const releasedPayments = payments.filter(p => p.status === 'RELEASED');
  const showReceipt = decisionPhase === 'COMPLETED' && ctx && releasedPayments.length > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Decision context header — the SAME selling decision carried across pages */}
      {ctx && (
        <div className="card p-4 border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Your current selling decision</p>
              <p className="text-sm text-gray-800 mt-0.5">
                <strong>{ctx.crop}</strong> · {ctx.quantity} q · {ctx.district} → <strong>{ctx.mandi}</strong>
                {ctx.net > 0 && <> · est. net <strong>{inr(ctx.net)}/q</strong></>}
                {ctx.source && <> · <span className="text-gray-400">{ctx.source === 'agmarknet_live' ? 'live prices' : 'cached prices'}</span></>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="btn-secondary text-xs" onClick={() => navigate('/net-realization')}>Review decision</button>
              <button className="btn-secondary text-xs" onClick={() => navigate('/fpo')}>What if I pool?</button>
            </div>
          </div>
          {/* Phase strip — existing transaction state, mirrored */}
          <div className="mt-3 flex items-center gap-1">
            {PHASES.map((ph, i) => {
              const reached = i <= phaseIdx;
              return (
                <React.Fragment key={ph}>
                  {i > 0 && <div className={`flex-1 h-0.5 ${reached ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full ${reached ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                    <span className={`text-[9px] mt-0.5 ${reached ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{ph}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Trade — Lots, Buyers &amp; Payments</h1>
        <p className="text-gray-500 text-sm mt-1">
          {buyerView
            ? 'Buyer-side demo view: accept or reject inbound offers and release simulated funds.'
            : 'Create a lot, pick a buyer you trust, and track the simulated sale end-to-end.'}
        </p>
      </div>

      {prefillNote && (
        <div className="card p-4 border-emerald-300 bg-emerald-50/70 text-sm text-emerald-900 flex items-start justify-between gap-3">
          <span>🎯 {prefillNote}</span>
          <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setPrefillNote('')}>✕</button>
        </div>
      )}
      {notice && <div className="card p-4 border-emerald-200 bg-emerald-50/60 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="card p-4 border-red-200 bg-red-50/60 text-sm text-red-600">{error}</div>}

      {/* ── Lots ─────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">My lots</h2>
          {!buyerView && (
            <button className="btn-primary text-sm" onClick={() => setShowLotForm((v) => !v)}>
              {showLotForm ? 'Close' : '+ New lot'}
            </button>
          )}
        </div>

        {showLotForm && !buyerView && (
          <form onSubmit={createLot} className="mb-5 p-4 bg-gray-50 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Crop</label>
                <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
                  {MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">District</label>
                <select className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {REGIONS.map(region => {
                    const regionDistricts = MAHARASHTRA_DISTRICTS.filter(d => d.region === region);
                    return (
                      <optgroup key={region} label={region}>
                        {regionDistricts.map(d => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                <input className="input-field" type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required placeholder="e.g. 10" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Variety <span className="text-gray-400">(optional)</span></label>
                <input className="input-field" value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="e.g. JS-335" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                <select className="input-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="quintals">quintals</option>
                  <option value="kg">kg</option>
                  <option value="tonnes">tonnes</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Harvest date <span className="text-gray-400">(optional)</span></label>
                <input className="input-field" type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} />
              </div>
            </div>
            {/* Quality details — collapsible to reduce form clutter */}
            <details className="group">
              <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                Quality details <span className="text-gray-400 font-normal">(optional — helps buyers understand your lot)</span>
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Quality grade</label>
                  <select className="input-field" value={grade} onChange={(e) => setGrade(e.target.value)}>
                    {['Unassessed', 'A', 'B', 'C'].map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Size <span className="text-gray-400">(optional)</span></label>
                  <input className="input-field" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 40–50mm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Moisture % <span className="text-gray-400">(optional)</span></label>
                  <input className="input-field" type="number" min="0" max="100" step="0.1" value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} placeholder="e.g. 8" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Visible damage % <span className="text-gray-400">(optional)</span></label>
                  <input className="input-field" type="number" min="0" max="100" step="0.1" value={damagePct} onChange={(e) => setDamagePct(e.target.value)} placeholder="e.g. 2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Assay status</label>
                  <select className="input-field" value={assayStatus} onChange={(e) => setAssayStatus(e.target.value)}>
                    {['pending', 'in_progress', 'passed', 'failed'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </details>
            <div>
              <p className="text-[11px] text-gray-400 mb-2">Quality fields are structured only — Kisan360 does not grade produce by AI. Fields help buyers understand the lot.</p>
              <button type="submit" className="btn-primary w-full sm:w-auto">Create lot</button>
            </div>
          </form>
        )}

        {expectedNet && (
          <p className="text-xs text-emerald-700 mb-3">Target from your calculator decision: <strong>₹{Number(expectedNet).toLocaleString('en-IN')}/q net</strong> — price your offer at or above this to keep your expected realization.</p>
        )}
        {lots.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No lots yet — create one to start selling.</p>
        ) : (
          <div className="space-y-2">
            {lots.map((lot) => (
              <div key={lot._id} className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm">
                    {lot.crop}{lot.variety ? ` · ${lot.variety}` : ''} — {lot.quantity} {lot.unit}
                  </p>
                  <p className="text-xs text-gray-400">
                    {lot.district || '—'} · grade {lot.grade || 'Unassessed'}
                    {lot.moisturePct != null ? ` · moisture ${lot.moisturePct}%` : ''}
                    {lot.damagePct != null ? ` · damage ${lot.damagePct}%` : ''}
                    · assay {lot.assayStatus || 'pending'}
                    · {new Date(lot.createdAt).toLocaleDateString('en-IN')}
                  </p>
                  <LotEconomics lot={lot} offers={offers} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${lot.status === 'OPEN' ? 'badge-green' : lot.status === 'CLOSED' ? 'badge-blue' : 'badge-yellow'}`}>
                    {lot.status}
                  </span>
                  {!buyerView && (lot.status === 'OPEN' || lot.status === 'OFFERED') && (
                    <>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => { setOfferLot(lot); setOfferBuyer(null); setOfferPrice(''); }}
                      >
                        Send offer
                      </button>
                      <button
                        className="btn-secondary text-xs text-red-600"
                        onClick={() => act(`/lots/${lot._id}/withdraw`, 'Lot withdrawn.')}
                      >
                        Withdraw
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Buyer matching with trust badges ─────────────────── */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Matched buyers</h2>
            <p className="text-xs text-gray-400 mt-0.5">Trust badges are simulated for the demo — production verifies FSSAI/GST registries.</p>
            {!buyerView && !offerLot && lots.some(l => l.status === 'OPEN' || l.status === 'OFFERED') && (
              <p className="text-xs text-emerald-700 mt-1">Pick "Send offer" on one of your lots — matching reasons then appear against that exact lot (crop · service area · quantity).</p>
            )}
          </div>
          <select className="input-field w-auto text-sm" value={cropFilter} onChange={(e) => setCropFilter(e.target.value)}>
            <option value="">All crops</option>
            {MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {buyers.map((b) => {
            const tier = TIER_STYLES[b.trustTier] || TIER_STYLES.SELF_DECLARED;
            const tooSmall = offerLot ? myQuantityQuintals < b.minQuantityQuintals : false;
            // Explainable matching — derived from the buyer record's own fields,
            // never an opaque score.
            const reasons: string[] = [];
            if (offerLot) {
              if (b.crops.some(c => c.toLowerCase() === offerLot.crop.toLowerCase())) reasons.push(`buys ${offerLot.crop}`);
              if (b.districts.some(d => d.toLowerCase() === (offerLot.district || '').toLowerCase())) reasons.push(`serves ${offerLot.district}`);
              reasons.push(`accepts ${b.minQuantityQuintals} q+ lots`);
            }
            return (
              <div key={b.id} className={`border rounded-xl p-4 transition-colors ${offerBuyer?.id === b.id ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{b.name}</p>
                    <p className="text-xs text-gray-400">{b.category} · min {b.minQuantityQuintals} q</p>
                  </div>
                  <span className={`badge ${tier.cls} shrink-0`} title={b.tierDescription}>
                    {tier.icon} {b.tierLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{b.description}</p>
                {reasons.length > 0 && (
                  <div className="text-[11px] text-emerald-700 mt-1.5">
                    <span className="font-medium">Matched because:</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {reasons.map((r, i) => (<li key={i}>✓ {r}</li>))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Serves: {b.districts.join(', ')} · crops: {b.crops.join(', ')} · {b.paymentTermsLabel}
                </p>
                {!buyerView && offerLot && (
                  <button
                    className={`mt-3 text-xs font-medium ${tooSmall ? 'text-gray-300 cursor-not-allowed' : 'text-emerald-600 hover:text-emerald-700'}`}
                    disabled={tooSmall}
                    onClick={() => {
                      setOfferBuyer(b);
                      // Phase 9 — prefill with the decision's engine reference so
                      // the offer composer starts from the calculator, never a
                      // guess. The farmer can still edit it down if they choose.
                      setOfferPrice(ctx && ctx.net > 0 ? String(Math.round(ctx.net)) : '');
                    }}
                  >
                    {tooSmall ? `Below ${b.minQuantityQuintals} q minimum` : `→ Offer to ${b.name}`}
                  </button>
                )}
              </div>
            );
          })}
          {buyers.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center col-span-2">No buyers match this crop.</p>
          )}
        </div>
      </div>

      {/* ── Offer composer ───────────────────────────────────── */}
      {offerLot && (
        <form onSubmit={sendOffer} className="card p-5 border-emerald-200">
          <h2 className="font-semibold text-gray-900 mb-3">
            Offer {offerLot.crop} ({offerLot.quantity} {offerLot.unit})
            {offerBuyer ? ` to ${offerBuyer.name}` : ' — pick a buyer above'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Your price (₹/quintal)</label>
              <input className="input-field" type="number" min="1" step="1" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} required />
            </div>
            <p className="text-sm text-gray-500">
              {offerPrice && Number(offerPrice) > 0
                ? <>Lot total: <span className="font-semibold text-gray-800">{inr(Number(offerPrice) * myQuantityQuintals)}</span> ({myQuantityQuintals} q)</>
                : `${myQuantityQuintals} q in this lot`}
            </p>
            <button type="submit" className="btn-primary" disabled={!offerBuyer}>Send offer</button>
          </div>
        </form>
      )}

      {/* ── Offers ───────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{buyerView ? 'Inbound offers' : 'My offers'}</h2>
        {offers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No offers yet.</p>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <div key={o._id} className="border border-gray-100 rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {o.crop} · {o.quantityQuintals} q → {o.buyerName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {inr(o.offeredPricePerQuintal)}/q · total {inr(o.amount)} · {new Date(o.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${o.status === 'ACCEPTED' ? 'badge-green' : o.status === 'SENT' ? 'badge-yellow' : 'badge-red'}`}>{o.status}</span>
                    {buyerView && o.status === 'SENT' && (
                      <>
                        <button className="btn-primary text-xs" onClick={() => act(`/offers/${o._id}/accept`, 'Offer accepted — payment held (simulated escrow).')}>
                          Accept
                        </button>
                        <button className="btn-secondary text-xs" onClick={() => act(`/offers/${o._id}/reject`, 'Offer rejected.')}>
                          Reject
                        </button>
                      </>
                    )}
                    {!buyerView && o.status === 'SENT' && (
                      <button className="btn-secondary text-xs" onClick={() => act(`/offers/${o._id}/withdraw`, 'Offer withdrawn.')}>
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
                <OfferBenchmark offer={o} lot={lots.find(l => l._id === String(o.lotId))} buyer={buyers.find(b => b.id === o.buyerId)} />
                {/* Offer mini-timeline */}
                {o.history && o.history.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    {o.history.map((h, i) => (
                      <span key={i}>{i > 0 && ' → '}{h.status}{h.at ? ` (${new Date(h.at).toLocaleDateString('en-IN')})` : ''}</span>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Payments with Pending → Held → Released timeline ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Payments</h2>
          <span className="badge badge-yellow">simulated — no real money moves</span>
        </div>
        <p className="text-xs text-gray-400 mb-4">Escrow status timeline per the HLD: Pending → Held → Released.</p>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No payments yet — accept an offer to create one.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => {
              const idx = PAYMENT_STEPS.indexOf(p.status);
              const cancelled = p.status === 'CANCELLED';
              return (
                <div key={p._id} className="border border-gray-100 rounded-xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {p.crop} → {p.buyerName} · <span className="font-semibold text-emerald-700">{inr(p.amount)}</span>
                      </p>
                      <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${p.status === 'RELEASED' ? 'badge-green' : cancelled ? 'badge-red' : 'badge-yellow'}`}>{p.status}</span>
                      {buyerView && p.status === 'HELD' && (
                        <button className="btn-primary text-xs" onClick={() => act(`/payments/${p._id}/release`, 'Funds released to the farmer (simulated).')}>
                          Release funds
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Timeline */}
                  <div className="mt-3 flex items-center gap-1">
                    {PAYMENT_STEPS.map((step, i) => {
                      const reached = !cancelled && idx >= i;
                      return (
                        <React.Fragment key={step}>
                          {i > 0 && <div className={`flex-1 h-0.5 ${reached ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                          <div className="flex flex-col items-center">
                            <div className={`w-3 h-3 rounded-full ${reached ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                            <span className={`text-[10px] mt-1 ${reached ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{step}</span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    {cancelled && <span className="ml-2 text-[11px] text-red-500 font-medium">cancelled</span>}
                  </div>
                  {p.status === 'RELEASED' && <PaymentOutcome payment={p} lot={lots.find(l => l._id === String(p.lotId))} />}
                  {p.history && p.history.length > 0 && (
                    <ul className="mt-3 space-y-0.5">
                      {p.history.map((h, i) => (
                        <li key={i} className="text-[11px] text-gray-400">
                          {h.to} · {new Date(h.at).toLocaleString('en-IN')}{h.note ? ` — ${h.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!buyerView && showReceipt && <DecisionReceipt ctx={ctx!} payments={releasedPayments} lots={lots} />}
      {!buyerView && <DecisionHistory payments={payments} lots={lots} />}

      {/* ── Help & grievances (HLD P1: Raise → Open → Under Review → Resolved) ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Help &amp; Grievances</h2>
          {!buyerView && (
            <button className="btn-secondary text-sm" onClick={() => setShowGrievanceForm((v) => !v)}>
              {showGrievanceForm ? 'Close' : 'Raise an issue'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">Payment delay, quality dispute or a no-show buyer? Raise it and track it here.</p>

        {showGrievanceForm && !buyerView && (
          <form onSubmit={raiseGrievance} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-4 bg-gray-50 rounded-xl">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Issue type</label>
              <select className="input-field" value={gCategory} onChange={(e) => setGCategory(e.target.value)}>
                {GRIEVANCE_CATEGORIES.map((c) => <option key={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Related lot (optional)</label>
              <select className="input-field" value={gLotId} onChange={(e) => setGLotId(e.target.value)}>
                <option value="">None</option>
                {lots.map((l) => <option key={l._id} value={l._id}>{l.crop} · {l.quantity} {l.unit} · {l.status}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">What happened?</label>
              <input className="input-field" value={gDescription} onChange={(e) => setGDescription(e.target.value)} placeholder="Describe the issue in a sentence" required />
            </div>
            <div className="sm:col-span-3">
              <p className="text-[11px] text-gray-400 mb-2">This is a Kisan360 grievance workflow for demo purposes — not a direct government complaint platform.</p>
              <button type="submit" className="btn-primary w-full sm:w-auto">Submit grievance</button>
            </div>
          </form>
        )}

        {grievances.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No grievances — nothing outstanding.</p>
        ) : (
          <div className="space-y-3">
            {grievances.map((g) => {
              const idx = GRIEVANCE_STEPS.indexOf(g.status);
              const done = g.status === 'RESOLVED' || g.status === 'REJECTED';
              return (
                <div key={g._id} className="border border-gray-100 rounded-xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{g.category.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-gray-500 truncate">{g.description}</p>
                    </div>
                    <span className={`badge ${g.status === 'RESOLVED' ? 'badge-green' : g.status === 'REJECTED' ? 'badge-red' : 'badge-yellow'}`}>{g.status.replace(/_/g, ' ')}</span>
                  </div>
                  {!done && (
                    <div className="mt-3 flex items-center gap-1">
                      {GRIEVANCE_STEPS.map((step, i) => {
                        const reached = idx >= i;
                        return (
                          <React.Fragment key={step}>
                            {i > 0 && <div className={`flex-1 h-0.5 ${reached ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full ${reached ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                              <span className={`text-[10px] mt-1 ${reached ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{step.replace(/_/g, ' ')}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                  {buyerView && g.status === 'OPEN' && (
                    <div className="mt-3 flex gap-2">
                      <button className="btn-primary text-xs" onClick={() => act(`/grievances/${g._id}/transition`, 'Moved to under review.', { to: 'UNDER_REVIEW' })}>Take for review</button>
                    </div>
                  )}
                  {buyerView && g.status === 'UNDER_REVIEW' && (
                    <div className="mt-3 flex gap-2">
                      <button className="btn-primary text-xs" onClick={() => act(`/grievances/${g._id}/transition`, 'Grievance resolved.', { to: 'RESOLVED', note: 'Resolved by buyer-side review (demo)' })}>Mark resolved</button>
                      <button className="btn-secondary text-xs" onClick={() => act(`/grievances/${g._id}/transition`, 'Grievance rejected.', { to: 'REJECTED', note: 'Rejected by buyer-side review (demo)' })}>Reject</button>
                    </div>
                  )}
                  {g.history && g.history.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      {g.history.map((h, i) => (<span key={i}>{i > 0 && ' → '}{h.to.replace(/_/g, ' ')}</span>))}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradePage;

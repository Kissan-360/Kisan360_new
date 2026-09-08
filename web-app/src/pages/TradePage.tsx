import React, { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch, getDemoUser } from '../lib/api';

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

interface Payment {
  _id: string;
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

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const isBuyerSide = (role?: string) => ['buyer', 'fpo', 'admin'].includes(role || '');

const TradePage = () => {
  const user = getDemoUser();
  const buyerView = isBuyerSide(user?.role);

  const [lots, setLots] = useState<Lot[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [trustTiers, setTrustTiers] = useState<Record<string, { label: string; description: string }>>({});
  const [offers, setOffers] = useState<Offer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
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

  // Offer form
  const [offerLot, setOfferLot] = useState<Lot | null>(null);
  const [offerBuyer, setOfferBuyer] = useState<Buyer | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [cropFilter, setCropFilter] = useState('');

  const loadAll = async () => {
    try {
      const [lotsRes, buyersRes, offersRes, paymentsRes] = await Promise.all([
        apiFetch(`${API_URL}/lots`),
        apiFetch(`${API_URL}/buyers${cropFilter ? `?crop=${encodeURIComponent(cropFilter)}` : ''}`),
        apiFetch(`${API_URL}/offers`),
        apiFetch(`${API_URL}/payments`),
      ]);
      const lotsData = await lotsRes.json();
      const buyersData = await buyersRes.json();
      const offersData = await offersRes.json();
      const paymentsData = await paymentsRes.json();
      if (lotsData.success) setLots(lotsData.lots);
      if (buyersData.success) {
        setBuyers(buyersData.buyers);
        setTrustTiers(buyersData.trustTiers || {});
      }
      if (offersData.success) setOffers(offersData.offers);
      if (paymentsData.success) setPayments(paymentsData.payments);
    } catch {
      setError('Could not reach the backend — is it running on port 5000?');
    }
  };

  useEffect(() => { loadAll(); }, [cropFilter]);

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
        body: JSON.stringify({ crop, variety, quantity: Number(quantity), unit, grade, district }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Lot created for ${data.lot.quantity} ${data.lot.unit} of ${data.lot.crop}.`);
        setShowLotForm(false);
        setQuantity('');
        setVariety('');
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

  const act = async (path: string, okMsg: string) => {
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(`${API_URL}${path}`, { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) {
        setNotice(okMsg);
        loadAll();
      } else {
        setError(data.error || 'Action failed');
      }
    } catch {
      setError('Action failed');
    }
  };

  const openLots = lots.filter((l) => l.status === 'OPEN' || l.status === 'OFFERED');

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Trade — Lots, Buyers &amp; Payments</h1>
        <p className="text-gray-500 text-sm mt-1">
          {buyerView
            ? 'Buyer-side demo view: accept or reject inbound offers and release simulated funds.'
            : 'Create a lot, pick a buyer you trust, and track the simulated sale end-to-end.'}
        </p>
      </div>

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
          <form onSubmit={createLot} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-4 bg-gray-50 rounded-xl">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Crop</label>
              <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
                {['Soybean', 'Onion', 'Tomato'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Variety (optional)</label>
              <input className="input-field" value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="e.g. JS-335" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">District</label>
              <select className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
                {['Pune', 'Nashik', 'Nagpur', 'Solapur', 'Latur', 'Aurangabad', 'Amravati', 'Akola', 'Kolhapur', 'Jalgaon', 'Ahmednagar', 'Satara'].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
              <input className="input-field" type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Quality grade</label>
              <select className="input-field" value={grade} onChange={(e) => setGrade(e.target.value)}>
                {['Unassessed', 'FAQ', 'A', 'B'].map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-primary w-full sm:w-auto">Create lot</button>
            </div>
          </form>
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
                    {lot.district || '—'} · grade {lot.grade || 'Unassessed'} · {new Date(lot.createdAt).toLocaleDateString('en-IN')}
                  </p>
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
          </div>
          <select className="input-field w-auto text-sm" value={cropFilter} onChange={(e) => setCropFilter(e.target.value)}>
            <option value="">All crops</option>
            {['Soybean', 'Onion', 'Tomato'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {buyers.map((b) => {
            const tier = TIER_STYLES[b.trustTier] || TIER_STYLES.SELF_DECLARED;
            const tooSmall = offerLot ? myQuantityQuintals < b.minQuantityQuintals : false;
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
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Serves: {b.districts.join(', ')} · crops: {b.crops.join(', ')} · {b.paymentTermsLabel}
                </p>
                {!buyerView && offerLot && (
                  <button
                    className={`mt-3 text-xs font-medium ${tooSmall ? 'text-gray-300 cursor-not-allowed' : 'text-emerald-600 hover:text-emerald-700'}`}
                    disabled={tooSmall}
                    onClick={() => { setOfferBuyer(b); setOfferPrice(''); }}
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
    </div>
  );
};

export default TradePage;

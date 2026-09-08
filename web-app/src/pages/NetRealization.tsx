import React, { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from '../lib/api';

// Net-Realization page — the headline P0 feature (HLD §4a).
// The backend (Node → FastAPI :8002) computes everything deterministically;
// this screen renders the ranked mandis with the "Why?" explanation drawer
// and never does arithmetic of its own.

interface RankedMandi {
  rank: number;
  market: string;
  grossPricePerQuintal: number;
  distanceKm: number;
  distanceSource: string;
  distanceNote: string | null;
  farmerCosts: {
    transportPerQuintal: number;
    storagePerQuintal: number;
    otherPerQuintal: number;
    totalCostsPerQuintal: number;
  };
  farmerNetPerQuintal: number;
  farmerNetTotal: number;
  grossTotal: number;
  reason: string;
  evidence: {
    priceSource: string | null;
    arrivalDate: string | null;
    retrievedAt: string | null;
    variety: string | null;
  };
}

interface NetResult {
  success: boolean;
  crop: string;
  district: string;
  quantityQuintals: number;
  bestMandi: string;
  rankedMandis: RankedMandi[];
  skippedMarkets: { market: string; grossPricePerQuintal: number; reason: string }[];
  buyerSideCharges: { items: { label: string; ratePct: number; payer: string; deductedFromFarmerNet: boolean }[]; note: string };
  marketSource: string;
  marketProvenance?: { source: string; retrievedAt: string; asOf?: string; rowCount?: number };
  unit?: string;
}

const CROPS = ['Soybean', 'Onion', 'Tomato'];
const DISTRICTS = ['Pune', 'Nashik', 'Nagpur', 'Solapur', 'Latur', 'Aurangabad', 'Amravati', 'Akola', 'Kolhapur', 'Jalgaon', 'Ahmednagar', 'Satara'];

const inr = (n: number, digits = 0) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const NetRealization = () => {
  const [crop, setCrop] = useState('Soybean');
  const [district, setDistrict] = useState('Pune');
  const [quantity, setQuantity] = useState('10');
  const [result, setResult] = useState<NetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawerFor, setDrawerFor] = useState<string | null>(null);

  const compute = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    setDrawerFor(null);
    try {
      const params = new URLSearchParams({ crop, district, quantity });
      const res = await apiFetch(`${API_URL}/market/net-realization?${params}`);
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || data.message || 'Calculator could not produce a result');
      }
    } catch {
      setError('Could not reach the backend — is it running on port 5000?');
    } finally {
      setLoading(false);
    }
  };

  const best = result?.rankedMandis?.[0];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Net Realization Calculator</h1>
        <p className="text-gray-500 text-sm mt-1">
          What you actually pocket at each mandi — after <em>your</em> transport, storage and loading costs. Deterministic: no AI invents these numbers.
        </p>
      </div>

      {/* Inputs */}
      <form onSubmit={compute} className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Crop</label>
            <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Your district</label>
            <select className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Quantity (quintals)</label>
            <input
              className="input-field"
              type="number"
              min="0.1"
              step="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary h-[38px]" disabled={loading}>
            {loading ? 'Calculating…' : 'Compare mandis'}
          </button>
        </div>
      </form>

      {error && (
        <div className="card p-5 border-red-200 bg-red-50/50">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {result && best && (
        <>
          {/* Best-mandi headline */}
          <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-700 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200/50">
            <p className="text-emerald-100 text-sm">Best mandi for {result.crop} from {result.district} ({result.quantityQuintals} q)</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-4xl font-bold tracking-tight">{best.market}</span>
              <span className="text-2xl font-semibold">{inr(best.farmerNetPerQuintal)}/q net</span>
            </div>
            <p className="text-emerald-100 text-sm mt-2">
              {inr(best.farmerNetTotal)} in your pocket — {inr(best.grossPricePerQuintal)}/q headline price minus {inr(best.farmerCosts.totalCostsPerQuintal)}/q farmer-borne costs ({best.distanceKm} km haul).
            </p>
            {result.marketProvenance && (
              <p className="text-emerald-200/80 text-xs mt-3">
                Prices: AGMARKNET as of {result.marketProvenance.retrievedAt || result.marketProvenance.asOf || 'latest pull'}
              </p>
            )}
          </div>

          {/* Ranked comparison cards */}
          <div className="space-y-3">
            <h2 className="section-title">All mandis, ranked by your net</h2>
            {result.rankedMandis.map((m) => {
              const gap = best.farmerNetPerQuintal - m.farmerNetPerQuintal;
              const open = drawerFor === m.market;
              return (
                <div key={m.market} className={`card p-5 ${m.rank === 1 ? 'border-emerald-300 ring-1 ring-emerald-200' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${m.rank === 1 ? 'badge-green' : 'badge-blue'}`}>#{m.rank}</span>
                        <span className="font-semibold text-gray-900">{m.market}</span>
                        <span className="text-xs text-gray-400">{m.distanceKm} km away</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm">
                        <span className="text-gray-500">Headline: <span className="text-gray-800 font-medium">{inr(m.grossPricePerQuintal)}/q</span></span>
                        <span className="text-gray-500">Your costs: <span className="text-amber-700 font-medium">−{inr(m.farmerCosts.totalCostsPerQuintal)}/q</span></span>
                        <span className="text-gray-500">Net: <span className="text-emerald-700 font-semibold">{inr(m.farmerNetPerQuintal)}/q</span></span>
                        <span className="text-gray-500">Lot total: <span className="text-gray-800 font-medium">{inr(m.farmerNetTotal)}</span></span>
                      </div>
                      {m.rank !== 1 && gap > 0 && (
                        <p className="text-xs text-gray-400 mt-1.5">
                          {inr(gap)}/q less than {best.market}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setDrawerFor(open ? null : m.market)}
                      className="btn-secondary text-xs shrink-0"
                      aria-expanded={open}
                    >
                      Why? {open ? '▴' : '▾'}
                    </button>
                  </div>

                  {/* "Why?" drawer — the deterministic explanation the engine already produced */}
                  {open && (
                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                        <p className="text-sm text-emerald-900 leading-relaxed">{m.reason}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-gray-200 p-3">
                          <p className="section-title mb-2">Farmer-borne cost breakdown (₹/q)</p>
                          <ul className="space-y-1 text-gray-600">
                            <li className="flex justify-between"><span>Transport ({m.distanceKm} km × ₹1.5)</span><span>−{inr(m.farmerCosts.transportPerQuintal, 2)}</span></li>
                            <li className="flex justify-between"><span>Storage (2 days × ₹1)</span><span>−{inr(m.farmerCosts.storagePerQuintal, 2)}</span></li>
                            <li className="flex justify-between"><span>Bagging/loading/entry</span><span>−{inr(m.farmerCosts.otherPerQuintal, 2)}</span></li>
                            <li className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-800"><span>Total</span><span>−{inr(m.farmerCosts.totalCostsPerQuintal, 2)}</span></li>
                          </ul>
                        </div>
                        <div className="rounded-lg border border-gray-200 p-3">
                          <p className="section-title mb-2">Evidence &amp; buyer-side charges</p>
                          <ul className="space-y-1 text-gray-600 text-xs">
                            <li>Price source: {m.evidence.priceSource || 'AGMARKNET'}</li>
                            <li>Quote date: {m.evidence.arrivalDate || '—'} · retrieved {m.evidence.retrievedAt || '—'}</li>
                            <li>Variety: {m.evidence.variety || '—'}</li>
                          </ul>
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed">{result.buyerSideCharges.note}</p>
                          <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
                            {result.buyerSideCharges.items.map((c) => (
                              <li key={c.label}>• {c.label} {c.ratePct}% — paid by {c.payer}, <span className="font-medium">not deducted</span> from your net</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {m.distanceNote && <p className="text-xs text-amber-600">{m.distanceNote}</p>}
                    </div>
                  )}
                </div>
              );
            })}

            {result.skippedMarkets.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Not ranked ({result.skippedMarkets.length})</p>
                {result.skippedMarkets.map((s) => (
                  <p key={s.market} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{s.market}</span> — {s.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NetRealization;

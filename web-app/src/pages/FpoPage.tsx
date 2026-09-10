import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/api';
import { getDecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';

// FPO Bulk Selling — HLD P1. Pools the 5 mock member households into one bulk
// lot and compares individual vs pooled realization. All numbers come from the
// deterministic calculator via POST /api/fpo/pool; this screen does no math.

interface PoolMember {
  uid: string;
  name: string;
  village: string;
  quantityQuintals: number;
  sharePct?: number;
}

interface PoolResponse {
  success: boolean;
  error?: string;
  crop: string;
  district: string;
  pool: { members: PoolMember[]; pooledQuantity: number };
  pooledBestMandi: string;
  pooledNetPerQuintal: number;
  perMember: {
    uid: string;
    name: string;
    village: string;
    quantityQuintals: number;
    soloBestMandi: string;
    soloNetPerQuintal: number;
    soloNetTotal: number;
    pooledNetTotal: number;
    uplift: number;
  }[];
  totals: { soloNetTotal: number; pooledNetTotal: number; upliftTotal: number; upliftPct: number };
  bulkRateApplied: boolean;
  reason: string;
  note?: string;
  logistics?: {
    individualAvgTransportPerQuintal: number;
    pooledTransportPerQuintal: number;
    savedPerQuintal: number;
    note: string;
  };
}

const inr = (n: number, digits = 0) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const ACTIVE_CROPS = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map(c => c.name);

const FpoPage = () => {
  const navigate = useNavigate();
  const ctx = getDecisionContext();
  // Continuity: default to the farmer's OWN crop and district from the
  // calculator — pooling is an alternative for THIS decision, not a module.
  // The crop override is sent to the backend, which validates it against the
  // price cache; quantities stay the mock member roster's (deterministic).
  const [crop, setCrop] = useState(ctx?.crop || 'Soybean');
  const [district, setDistrict] = useState(ctx?.district || 'Pune');
  const [result, setResult] = useState<PoolResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coverage, setCoverage] = useState<any | null>(null);

  const compute = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    setCoverage(null);
    try {
      // Pool first to get the actual pooled quantity, then fetch buyer coverage
      // at the real pooled size (not a hardcoded estimate).
      const res = await apiFetch(`${API_URL}/fpo/pool`, {
        method: 'POST',
        body: JSON.stringify({ district, crop }),
      });
      const data: PoolResponse = await res.json();
      if (data.success) {
        setResult(data);
        const pooledQty = data.pool?.pooledQuantity || 50;
        const covRes = await apiFetch(`${API_URL}/market/buyer-coverage?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&quantity=${pooledQty}`)
          .then(r => r.json())
          .catch(() => null);
        if (covRes?.success) setCoverage(covRes);
      } else {
        setError(data.error || 'Pooling failed');
      }
    } catch {
      setError('Could not reach the backend — check the API connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">FPO Bulk Selling</h1>
        <p className="text-gray-500 text-sm mt-1">Pool produce. Negotiate as one lot. See exactly who gains what.</p>
        <p className="text-xs text-amber-600 mt-1">Demonstration using simulated FPO member data — no real farmer impact is claimed.</p>
      </div>

      <form onSubmit={compute} className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">FPO crop</label>
            <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {ACTIVE_CROPS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">FPO district</label>
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
          <button type="submit" className="btn-primary h-[38px] whitespace-nowrap" disabled={loading}>
            {loading ? 'Pooling…' : 'Compute bulk uplift'}
          </button>
        </div>
      </form>

      {error && <div className="card p-5 border-red-200 bg-red-50/50 text-sm text-red-600">{error}</div>}

      {/* Decision fork (Phase 12): the SAME lot, two ways to sell. Consequences
          only — the human picks the path. Uses the carried decision context. */}
      {ctx && (
        <div className="card p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-400">Your selling decision, two paths</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
            <div className="rounded-xl border border-gray-200 p-4">
              <span className="badge badge-blue">Path A — sell individually</span>
              <p className="text-gray-800 mt-2">{ctx.crop} · {ctx.quantity} q · {ctx.district}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">the decision you just made on the calculator</p>
              <p className="text-gray-600 mt-1">Best mandi: {ctx.mandi} · est. {inr(ctx.net)}/q net</p>
              <p className="text-xs text-gray-400 mt-1">Small-lot transport tier; buyers with minimums above {ctx.quantity} q are out of reach.</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <span className="badge badge-blue">Path B — pool with the FPO</span>
              <p className="text-gray-800 mt-2">Same crop · pooled lot (below) · {district}</p>
              <p className="text-gray-600 mt-1">Full-truck transport tier from 40 q pooled; processor minimums unlocked.</p>
              <p className="text-xs text-gray-400 mt-1">Compute below to see the pooled mandi, uplift and buyer coverage.</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-3">Both paths use the same engine, the same quotes and the same directory. Kisan360 shows consequences — you choose the path.</p>
        </div>
      )}

      {result && (
        <>
          {/* Member roster + pooled total */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Members pooled</h2>
              <span className="badge badge-blue">{result.pool.pooledQuantity} q total</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {result.pool.members.map((m) => (
                <div key={m.uid} className="border border-gray-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  <p className="text-[11px] text-gray-400">{m.village}</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{m.quantityQuintals} q</p>
                </div>
              ))}
            </div>
          </div>

          {/* The killer comparison: individual vs pooled */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="section-title">Individual selling</p>
              <p className="text-3xl font-bold text-gray-800 mt-2">{inr(result.totals.soloNetTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">Sum of each member's best solo mandi net</p>
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                {result.perMember.map((m) => (
                  <div key={m.uid} className="flex justify-between">
                    <span className="truncate">{m.name} · {m.soloBestMandi}</span>
                    <span>{inr(m.soloNetPerQuintal)}/q</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200/50">
              <p className="text-emerald-100 text-xs uppercase tracking-wider">FPO bulk lot</p>
              <p className="text-3xl font-bold mt-2">{inr(result.totals.pooledNetTotal)}</p>
              <p className="text-emerald-100 text-xs mt-1">
                {result.pooledBestMandi} · {inr(result.pooledNetPerQuintal)}/q net pooled
              </p>
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-4xl font-bold">+{inr(result.totals.upliftTotal)}</p>
                <p className="text-emerald-100 text-xs mt-1">+{result.totals.upliftPct}% vs selling separately</p>
              </div>
            </div>

            <div className="card p-5">
              <p className="section-title">Why pooled wins</p>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{result.reason}</p>
              <div className="mt-3 text-xs text-gray-500">
                {result.perMember.map((m) => (
                  <div key={m.uid} className="flex justify-between">
                    <span className="truncate">{m.name}</span>
                    <span className="text-emerald-700 font-medium">+{inr(m.uplift)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The economics behind the uplift: either transport SAVINGS (nearby
              full-truck pooling) or a transport TRADE-OFF to reach a better-paying
              market. Both are honest; never show a negative number as "saved". */}
          {result.logistics && (result.logistics.savedPerQuintal >= 0 ? (
            <div className="card p-5 border-teal-200 bg-teal-50/40">
              <p className="font-semibold text-gray-900">The logistics story — many small trips become one</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400">Selling separately</p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">{inr(result.logistics.individualAvgTransportPerQuintal, 2)}/q</p>
                  <p className="text-[11px] text-gray-400">average transport each member pays alone</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400">Pooled as one lot</p>
                  <p className="text-lg font-bold text-teal-800 mt-0.5">{inr(result.logistics.pooledTransportPerQuintal, 2)}/q</p>
                  <p className="text-[11px] text-gray-400">one bulk trip at the documented rate</p>
                </div>
                <div className="rounded-lg border border-teal-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-teal-600">Transport saved</p>
                  <p className="text-lg font-bold text-teal-700 mt-0.5">{inr(result.logistics.savedPerQuintal, 2)}/q</p>
                  <p className="text-[11px] text-gray-400">× {result.pool.pooledQuantity} q = {inr(result.logistics.savedPerQuintal * result.pool.pooledQuantity)} kept by the group</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3">{result.logistics.note}</p>
            </div>
          ) : (
            <div className="card p-5 border-amber-200 bg-amber-50/40">
              <p className="font-semibold text-gray-900">The logistics trade-off — pooling reaches a better-paying market</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400">Selling separately</p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">{inr(result.logistics.individualAvgTransportPerQuintal, 2)}/q</p>
                  <p className="text-[11px] text-gray-400">average transport each member pays alone</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400">Pooled as one lot</p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">{inr(result.logistics.pooledTransportPerQuintal, 2)}/q</p>
                  <p className="text-[11px] text-gray-400">one bulk trip to {result.pooledBestMandi} — farther, at the bulk rate</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-amber-600">Extra transport spent</p>
                  <p className="text-lg font-bold text-amber-700 mt-0.5">{inr(Math.abs(result.logistics.savedPerQuintal), 2)}/q</p>
                  <p className="text-[11px] text-gray-400">× {result.pool.pooledQuantity} q = {inr(Math.abs(result.logistics.savedPerQuintal) * result.pool.pooledQuantity)} — worth it because the market pays {inr(result.pooledNetPerQuintal)}/q net vs the members' solo {inr(result.totals.soloNetTotal / result.pool.pooledQuantity)}/q</p>
                </div>
              </div>
              <p className="text-sm text-amber-800 mt-3">The uplift (+{inr(result.totals.upliftTotal)}) comes from the better market, not from cheaper transport — pooling changed which sale is possible.</p>
              <p className="text-[11px] text-gray-500 mt-1">{result.logistics.note}</p>
            </div>
          ))}

          {/* Actionability bridge: pooling unlocks buyers whose minimums no
              individual member can meet. Deterministic, from the same directory. */}
          {coverage && (
            <div className="card p-5 border-indigo-200 bg-indigo-50/40">
              <p className="font-semibold text-gray-900">Buyer coverage at pooled size ({coverage.quantityQuintals} q)</p>
              <p className="text-xs text-gray-500 mt-1">
                Individually, most members fall below processor minimums; pooled, the lot meets <strong>{coverage.summary?.actionableCount}</strong> of {coverage.summary?.totalRanked} costed mandis' directory buyers{coverage.bestActionable ? <> — including <strong>{coverage.bestActionable.market}</strong> ({coverage.bestActionable.buyerCount} buyer{coverage.bestActionable.buyerCount === 1 ? '' : 's'}).</> : '.'}
              </p>                {coverage.bestActionable && (
                  <button
                    className="btn-secondary text-xs mt-3"
                    onClick={() => navigate(`/trade?prefill=1&crop=${encodeURIComponent(coverage.crop)}&district=${encodeURIComponent(coverage.district)}&quantity=${coverage.quantityQuintals}&mandi=${encodeURIComponent(coverage.bestActionable.market)}&net=${coverage.bestActionable.netPerQuintal}`)}
                  >
                    Create pooled lot for {coverage.bestActionable.market} →
                  </button>
                )}
              <p className="text-[10px] text-gray-400 mt-2">Coverage = deterministic match on crop, service area and minimum quantity in the current directory. Not a demand estimate.</p>
            </div>
          )}

          <p className="text-xs text-gray-400">{result.note}</p>
          <p className="text-[11px] text-gray-400 -mt-2">Member quantities are the mock FPO roster; the priced crop follows your selection above and comes from the same engine, quotes and directory as the individual path.</p>
        </>
      )}
    </div>
  );
};

export default FpoPage;

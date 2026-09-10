import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/api';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';

// Market Intelligence — Phase 1 of the human product.
// NOT a data table: the farmer enters crop + district and gets the markets
// they can realistically consider, with freshness stated honestly and a
// per-mandi recent-price trend. Every number comes from the backend; this
// screen does no math.

interface MarketPrice {
  crop: string;
  variety: string;
  grade?: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  market: string;
  district: string;
  state: string;
  arrivalDate: string;
}

interface PriceResponse {
  success: boolean;
  count: number;
  prices: MarketPrice[];
  source: string;
  fallback: boolean;
  provenance: { source: string; retrievedAt: string | null; freshnessMs: number | null; ageHours: number | null; note?: string | null; liveError?: string | null };
}

interface TrendResponse {
  success: boolean;
  observations: number;
  series: { date: string; modalPrice: number }[];
  description: string;
}

const ACTIVE_CROPS = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map(c => c.name);

const inr = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

const MarketIntelligence = () => {
  const [crop, setCrop] = useState('Soybean');
  const [district, setDistrict] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trendFor, setTrendFor] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const fetchPrices = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '200', state: 'Maharashtra' });
      if (crop) params.append('crop', crop);
      if (district) params.append('district', district);
      if (search) params.append('search', search);
      const res = await apiFetch(`${API_URL}/market/prices?${params}`);
      const json: PriceResponse = await res.json();
      if (json.success) setData(json);
      else setError(json.provenance?.liveError || 'Failed to load market prices');
    } catch {
      setError('Could not connect to the server — check the API connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPrices(); }, [crop, district]);

  const rows = data?.prices ?? [];
  const byMarket = useMemo(() => {
    const m = new Map<string, MarketPrice>();
    for (const r of rows) {
      const key = r.market.trim();
      const existing = m.get(key);
      if (!existing || (r.modalPrice || 0) > (existing.modalPrice || 0)) m.set(key, r);
    }
    return [...m.values()].sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search) return byMarket;
    const q = search.toLowerCase();
    return byMarket.filter(r => `${r.crop} ${r.variety} ${r.market} ${r.district}`.toLowerCase().includes(q));
  }, [byMarket, search]);

  // Freshness from the backend's own provenance — never inferred client-side.
  const freshness = (() => {
    const p = data?.provenance;
    if (!p) return null;
    const ageH = p.ageHours ?? (p.retrievedAt ? (Date.now() - new Date(p.retrievedAt).getTime()) / 3.6e6 : null);
    if (ageH == null) return { label: 'Unknown freshness', cls: 'badge-yellow', live: false };
    if (ageH < 1) return { label: 'Live · just now', cls: 'badge-green', live: true };
    if (ageH < 24) return { label: `Updated today, ${new Date(p.retrievedAt!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, cls: 'badge-green', live: !data?.fallback };
    if (ageH < 48) return { label: 'Data from yesterday', cls: 'badge-yellow', live: false };
    return { label: `Data from ${Math.floor(ageH / 24)} days ago`, cls: 'badge-yellow', live: false };
  })();

  const loadTrend = async (market: string) => {
    if (trendFor === market) { setTrendFor(null); return; }
    setTrendFor(market);
    setTrend(null);
    setTrendLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/market/trend?crop=${encodeURIComponent(crop)}&market=${encodeURIComponent(market)}&window=7`);
      setTrend(await res.json());
    } catch { setTrend({ success: false, observations: 0, series: [], description: 'Could not load trend.' }); }
    finally { setTrendLoading(false); }
  };

  const maxPrice = Math.max(...filtered.map(r => r.modalPrice || 0), 1);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Market Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">Pick your crop — see the mandis you can realistically sell into, with honest data freshness.</p>
      </div>

      {/* Discovery inputs */}
      <div className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">What are you selling?</label>
            <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {ACTIVE_CROPS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Your district (optional)</label>
            <select className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">All districts</option>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input className="input-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by mandi or variety…" />
          </div>
          <button onClick={fetchPrices} className="btn-secondary h-[38px]" disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* States: error / no data / success */}
      {error ? (
        <div className="card p-8 text-center border-red-200 bg-red-50/40">
          <p className="text-red-600 font-medium">Market data is temporarily unavailable</p>
          <p className="text-gray-500 text-sm mt-1">{error}</p>
          <button onClick={fetchPrices} className="btn-primary mt-4">Try again</button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-8 bg-gray-200 rounded w-1/2 mt-3" />
              <div className="h-3 bg-gray-100 rounded w-full mt-4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No {crop} markets match right now.</p>
          <p className="text-gray-400 text-sm mt-1">Try clearing the district or search filter.</p>
        </div>
      ) : (
        <>
          {/* Provenance banner — cached is never silent */}
          <div className={`card p-4 flex flex-wrap items-center justify-between gap-2 ${data?.fallback ? 'border-amber-200 bg-amber-50/60' : ''}`}>
            <div className="flex items-center gap-2">
              {freshness && <span className={`badge ${freshness.cls}`}>{freshness.live ? '● Live' : '⏱ Cached'} · {freshness.label}</span>}
              <span className="text-xs text-gray-400">Source: AGMARKNET (data.gov.in)</span>
            </div>
            {data?.fallback && (
              <p className="text-xs text-amber-700">
                Showing the last known-good cached snapshot{data.provenance?.liveError ? ` — live pull unavailable (${data.provenance.liveError})` : ''}.
              </p>
            )}
          </div>

          {/* Market cards, best price first */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r) => {
              const isTop = r.modalPrice === maxPrice;
              const open = trendFor === r.market;
              return (
                <div key={r.market} className={`card p-5 ${isTop ? 'border-emerald-300 ring-1 ring-emerald-200' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{r.market}</p>
                      <p className="text-xs text-gray-400">{r.district || r.state} · {r.variety || r.crop}</p>
                    </div>
                    {isTop && <span className="badge badge-green shrink-0">Best quote</span>}
                  </div>
                  <p className="text-3xl font-bold text-emerald-700 mt-3">{inr(r.modalPrice)}<span className="text-sm font-normal text-gray-400">/q</span></p>
                  <p className="text-xs text-gray-400 mt-1">Range {inr(r.minPrice)} – {inr(r.maxPrice)} · {r.arrivalDate || 'date n/a'}</p>

                  <button onClick={() => loadTrend(r.market)} className="mt-3 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                    {open ? 'Hide recent price trend ▴' : 'Recent price trend ▾'}
                  </button>
                  {open && (
                    <div className="mt-2 border-t border-gray-100 pt-2">
                      {trendLoading ? (
                        <p className="text-xs text-gray-400">Loading trend…</p>
                      ) : trend && trend.observations > 0 ? (
                        <>
                          <div className="flex items-end gap-1 h-10 mt-1">
                            {trend.series.map((s) => (
                              <div key={s.date} className="flex-1 bg-emerald-400/70 rounded-t" style={{ height: `${Math.max(15, (s.modalPrice / Math.max(...trend.series.map(x => x.modalPrice))) * 100)}%` }} title={`${s.date}: ${inr(s.modalPrice)}`} />
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1.5">{trend.description}</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-gray-400">{trend?.description || 'No history yet for this market.'}</p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-1">Observed history only — never a price prediction.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Next step in the journey */}
          <div className="card p-5 bg-gradient-to-br from-emerald-50 to-transparent border-emerald-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-gray-900">Headline price isn't what you take home.</p>
              <p className="text-sm text-gray-500">Compare what you'd actually pocket after transport, storage and loading costs.</p>
            </div>
            <Link to="/net-realization" className="btn-primary">Compare net realization →</Link>
          </div>
        </>
      )}
    </div>
  );
};

export default MarketIntelligence;

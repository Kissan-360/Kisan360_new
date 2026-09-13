import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/api';
import { PrimaryButton } from '../components/ui/kit';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';
import { useTranslation } from '../i18n';

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

const ACTIVE_CROPS = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited').map(c => c.name);

const inr = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

interface TradingChannel {
  id: string;
  name: string;
  operator: string;
  type: string;
  description: string;
  coverage: string;
  crops: string[];
  fees: string;
  settlement: string;
  howToJoin: string;
  website: string;
}

const CHANNEL_ACCENTS: Record<string, string> = {
  enam: 'border-t-sky-500',
  'apmc-eauction': 'border-t-amber-500',
  'fpo-digital': 'border-t-emerald-500',
};

/** Digital trading channels (eNAM et al.) — price discovery beyond the local auction lane. */
const TradingChannels = ({ crop }: { crop: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<TradingChannel[] | null>(null);

  useEffect(() => {
    let dead = false;
    apiFetch(`${API_URL}/trading-channels?crop=${encodeURIComponent(crop)}`)
      .then((r) => r.json())
      .then((j) => { if (!dead) setChannels(j.success ? j.channels : []); })
      .catch(() => { if (!dead) setChannels([]); });
    return () => { dead = true; };
  }, [crop]);

  if (!channels || channels.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-stone-900 tracking-tight">{t('market.channelsTitle')}</h2>
          <p className="text-sm text-stone-500">{t('market.channelsSubtitle')}</p>
        </div>
        <span className="badge badge-blue">{t('market.channelsBadge')}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {channels.map((ch) => (
          <div key={ch.id} className={`card p-5 border-t-[3px] ${CHANNEL_ACCENTS[ch.id] || 'border-t-stone-400'} flex flex-col`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-stone-900 leading-snug">{ch.name}</p>
              <span className="badge badge-blue shrink-0">{t('market.channelDigital')}</span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">{ch.operator}</p>
            <p className="text-sm text-stone-600 mt-2 leading-relaxed">{ch.description}</p>
            <p className="text-xs text-stone-500 mt-2"><span className="font-semibold">{t('market.channelCrops')}:</span> {ch.crops.includes('all') ? t('market.channelCropsAll') : ch.crops.join(', ')}</p>
            <div className="mt-3 space-y-1.5 text-xs text-stone-600">
              <p><span className="font-semibold">{t('market.channelFees')}:</span> {ch.fees}</p>
              <p><span className="font-semibold">{t('market.channelPayment')}:</span> {ch.settlement}</p>
              <p><span className="font-semibold">{t('market.channelJoin')}:</span> {ch.howToJoin}</p>
            </div>
            <div className="mt-auto pt-3 flex flex-col gap-2">
              <a href={ch.website} target="_blank" rel="noreferrer" className="inline-flex items-center -my-1 py-1.5 min-h-[36px] text-xs font-medium text-emerald-600 hover:text-emerald-700">{t('market.channelWebsite')} ↗</a>
              {ch.id === 'enam' && (
                <button onClick={() => navigate('/schemes?slug=enam')} className="text-left text-xs font-medium text-sky-600 hover:text-sky-700 -my-1 py-1.5 min-h-[36px]">
                  {t('market.schemeEnam')} →
                  <span className="block text-stone-400">{t('market.schemeEnamHint')}</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-stone-400">{t('market.channelVerify')}</p>
    </div>
  );
};

const MarketIntelligence = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    // live:false when fallback — the badge must never say "Live" over the
    // cached-snapshot notice ("Live · Live" duplication is also avoided by
    // keeping the prefix out of the label itself).
    if (ageH < 1) return { label: 'just now', cls: data?.fallback ? 'badge-yellow' : 'badge-green', live: !data?.fallback };
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
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('market.title')}</h1>
          <p className="text-stone-500 text-sm mt-1">{t('market.subtitle')}</p>
        </div>
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-[11px] font-bold text-stone-600">{t('market.trackedMandis')} <span className="text-emerald-700">{filtered.length} {t('market.active')}</span></span>
            <span className="rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-[11px] font-bold text-stone-600">{data?.fallback ? t('market.cachedQuotes') : t('market.liveQuotes')} <span className="text-emerald-700">{rows.length}</span></span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-stone-600">{t('market.regionalBenchmark')} <span className="text-emerald-700">{inr(maxPrice)}/q</span></span>
          </div>
        )}
      </div>

      {/* Discovery inputs */}
      <div className="card p-5">
        {/* 4-across only from lg: at tablet the 4 columns were ~98px, which
            wrapped "What are you selling?" onto two lines and left the
            "Search" label sitting 16px lower than its row-mates. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">{t('market.whatSelling')}</label>
            <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {ACTIVE_CROPS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">{t('market.yourDistrict')}</label>
            <select className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">{t('market.allDistricts')}</option>
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
            <label className="block text-xs font-medium text-stone-500 mb-1">{t('market.search')}</label>
            <input className="input-field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('market.searchPlaceholder')} />
          </div>
          <button onClick={fetchPrices} className="btn-secondary h-[38px]" disabled={loading}>
            {loading ? t('market.loading') : t('market.refresh')}
          </button>
        </div>
      </div>

      {/* States: error / no data / success */}
      {error ? (
        <div className="card p-8 text-center border-red-200 bg-red-50/40">
          <p className="text-red-600 font-medium">{t('market.unavailable')}</p>
          <p className="text-stone-500 text-sm mt-1">{error}</p>
          <PrimaryButton onClick={fetchPrices} className="!mt-4">{t('market.tryAgain')}</PrimaryButton>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-stone-200 rounded w-2/3" />
              <div className="h-8 bg-stone-200 rounded w-1/2 mt-3" />
              <div className="h-3 bg-stone-100 rounded w-full mt-4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-stone-500">{t('market.noMarkets', { crop })}</p>
          <p className="text-stone-400 text-sm mt-1">{t('market.clearFilters')}</p>
        </div>
      ) : (
        <>
          {/* Provenance banner — cached is never silent */}
          <div className={`card p-4 flex flex-wrap items-center justify-between gap-2 ${data?.fallback ? 'border-amber-200 bg-amber-50/60' : ''}`}>
            <div className="flex items-center gap-2">
              {freshness && <span className={`badge ${freshness.cls}`}>{freshness.live ? '● Live' : '⏱ Cached'} · {freshness.label}</span>}
              <span className="text-xs text-stone-400">{t('market.source')}</span>
            </div>
            {data?.fallback && (
              <p className="text-xs text-amber-700">
                {t('market.cachedSnapshot', { liveError: data.provenance?.liveError ? ` — live pull unavailable (${data.provenance.liveError})` : '' })}
              </p>
            )}
          </div>

          {/* Market cards, best price first */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r) => {
              const isTop = r.modalPrice === maxPrice;
              const open = trendFor === r.market;
              return (
                <div key={r.market} className={`card p-5 border-t-[3px] ${isTop ? 'border-t-amber-500 border-emerald-300 ring-1 ring-emerald-200' : 'border-t-emerald-500'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{r.market}</p>
                      <p className="text-xs text-stone-400">{r.district || r.state} · {r.variety || r.crop}</p>
                    </div>
                    {isTop && <span className="badge badge-green shrink-0">{t('market.bestQuote')}</span>}
                  </div>
                  <p className="text-3xl font-bold text-emerald-700 mt-3">{inr(r.modalPrice)}<span className="text-sm font-normal text-stone-400">/q</span></p>
                  <p className="text-xs text-stone-400 mt-1">Range {inr(r.minPrice)} – {inr(r.maxPrice)} · {r.arrivalDate || 'date n/a'}</p>

                  <button onClick={() => loadTrend(r.market)} className="mt-2 -mb-1 inline-flex items-center -my-1 py-1.5 min-h-[36px] text-xs font-medium text-emerald-600 hover:text-emerald-700">
                    {open ? t('market.hideTrend') : t('market.recentTrend')}
                  </button>
                  {open && (
                    <div className="mt-2 border-t border-stone-100 pt-2">
                      {trendLoading ? (
                        <p className="text-xs text-stone-400">{t('market.loadingTrend')}</p>
                      ) : trend && trend.observations > 0 ? (
                        <>
                          <div className="flex items-end gap-1 h-10 mt-1">
                            {trend.series.map((s) => (
                              <div key={s.date} className="flex-1 bg-emerald-400/70 rounded-t" style={{ height: `${Math.max(15, (s.modalPrice / Math.max(...trend.series.map(x => x.modalPrice))) * 100)}%` }} title={`${s.date}: ${inr(s.modalPrice)}`} />
                            ))}
                          </div>
                          <p className="text-[11px] text-stone-500 mt-1.5">{trend.description}</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-stone-400">{trend?.description || t('market.noHistory')}</p>
                      )}
                      <p className="text-[10px] text-stone-300 mt-1">{t('market.observedOnly')}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Next step in the journey */}
          <div className="card p-5 bg-gradient-to-br from-emerald-50 to-transparent border-emerald-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-stone-900">{t('market.headlineNotTakeHome')}</p>
              <p className="text-sm text-stone-500">{t('market.compareNetDesc')}</p>
            </div>
            <PrimaryButton onClick={() => navigate('/net-realization')}>{t('market.compareNet')}</PrimaryButton>
          </div>

          {/* Digital trading channels — eNAM & beyond (price discovery beyond the local lane) */}
          <TradingChannels crop={crop} />
        </>
      )}
    </div>
  );
};

export default MarketIntelligence;

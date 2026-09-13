import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Calculator, Handshake, TrendingUp,
  Microscope, CloudSun, Home, MapPin, Package, Store, Landmark,
  CheckCircle2, Plus, Play,
} from 'lucide-react';
import { API_URL, apiFetch } from '../lib/api';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';
import { Card, FreshBadge, SkeletonLines, PrimaryButton, GhostButton, PageTransition, CropIcon, Quantity, QuantityHint } from '../components/ui/kit';
import { UNIT_SCALE_NOTE } from '../lib/units';
import { useAuth } from '../hooks/useAuth';
import { loadDecisionContext } from '../lib/decisionContext';
import { useTranslation } from '../i18n';
import { useFlow } from '../components/FlowContext';

interface PulseRow {
  market: string;
  variety: string;
  modalPrice: number;
  minPrice: number;
  maxPrice: number;
  arrivalDate: string;
  district: string;
}

interface PulseFeed {
  rows: PulseRow[] | null;
  meta: { fallback: boolean; source?: string } | null;
  error: string;
  reload: () => void;
}

/* ── Market pulse feed — REAL prices from the backend, fetched once and
   shared by the Active Trading chip, the calculator advisory strip and the
   dark Mandi Pulse ticker. ─────────────────────────────────────────────── */
const useMarketPulse = (crop: string): PulseFeed => {
  const [rows, setRows] = useState<PulseRow[] | null>(null);
  const [meta, setMeta] = useState<{ fallback: boolean; source?: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRows(null);
    try {
      const res = await apiFetch(`${API_URL}/market/prices?crop=${encodeURIComponent(crop)}&state=Maharashtra&limit=6`);
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Market feed unavailable');
      setRows((j.prices || []).slice(0, 6));
      setMeta({ fallback: !!j.fallback, source: j.source || '' });
    } catch (e: any) {
      setError(e?.message || 'Could not reach the market feed. Is the backend running?');
    }
  }, []);

  useEffect(() => { load(); }, [load, crop]);

  return { rows, meta, error, reload: load };
};

const topOfFeed = (rows: PulseRow[] | null): PulseRow | null =>
  rows && rows.length
    ? [...rows].sort((a, b) => (b.modalPrice ?? 0) - (a.modalPrice ?? 0))[0]
    : null;

const inr = (n?: number) => (n != null ? n.toLocaleString('en-IN') : '—');

/* ── Instant net-realization calculator — the farmer states what they're
   selling and lands in the Decision Workspace comparison. ──────────────── */
const SellHero = ({ top, pending, defaultCrop }: { top: PulseRow | null; pending: boolean; defaultCrop?: string }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [crop, setCrop] = useState(defaultCrop || 'Onion');
  // Nagpur is the canonical scenario district: today's cache shows the headline
  // vs net inversion there (runbook §15 P0 — verified live, +₹4,321 on the lot).
  const [district, setDistrict] = useState('Nagpur');
  const [quantity, setQuantity] = useState('10');
  const activeCrops = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited').map(c => c.name);
  const qty = parseFloat(quantity) > 0 ? parseFloat(quantity) : 10;

  const goCompare = () =>
    navigate(`/decision?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&quantity=${qty}`);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50/60 p-5 md:p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            {t('dashboard.calc.eyebrow')}
          </p>
          <h2 className="font-display text-xl md:text-2xl font-bold text-stone-900 mt-0.5">
            {t('dashboard.calc.title')}
          </h2>
        </div>
        <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-medium text-emerald-800">
          <CheckCircle2 size={12} className="text-emerald-700" /> {t('dashboard.calc.prefactored')}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] gap-3">
        <div>
          <label htmlFor="hero-crop" className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">
            {t('dashboard.sellHero.crop')}
          </label>
          <select
            id="hero-crop"
            className="w-full appearance-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-emerald-600/40 min-h-[48px]"
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
          >
            {activeCrops.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="hero-district" className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">
            <MapPin size={11} className="inline text-emerald-600 mr-1" /> {t('dashboard.sellHero.district')}
          </label>
          <select
            id="hero-district"
            className="w-full appearance-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-emerald-600/40 min-h-[48px]"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
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
          <label htmlFor="hero-qty" className="block text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">
            {t('dashboard.sellHero.quantity')}
          </label>
          <div className="flex rounded-xl border border-stone-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-emerald-600/40">
            <input
              id="hero-qty"
              type="number"
              min="0.1"
              step="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3.5 py-3 text-sm font-semibold text-stone-900 outline-none min-h-[48px] tabular"
            />
            <span className="flex items-center bg-stone-100 border-l border-stone-200 px-3 text-[11px] font-bold text-stone-500">QTL</span>
          </div>
          {/* Quintals are what a mandi quotes; tonnes are what a truck carries. */}
          <QuantityHint value={quantity} unit="quintals" note={UNIT_SCALE_NOTE} />
        </div>
        <div className="col-span-2 lg:col-span-1 flex items-stretch">
          <button
            onClick={goCompare}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-900 transition-colors min-h-[48px]"
          >
            <Calculator size={16} /> {t('dashboard.calc.cta')} <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-emerald-50/80 border border-emerald-100 px-4 py-3">
        <Calculator size={15} className="text-emerald-700 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-emerald-950 leading-relaxed">
          {top ? (
            <>
              {t('dashboard.calc.advisory', { qty, market: top.market, price: inr(top.modalPrice) })}
            </>
          ) : (
            t('dashboard.calc.advisoryPending')
          )}
          {pending && <span className="ml-1.5 inline-block h-3 w-3 rounded-full border-2 border-emerald-300 border-t-emerald-700 animate-spin align-middle" />}
        </p>
      </div>
    </section>
  );
};

/* ── Market Pulse ticker — dark strip, honest freshness labeling. ──────── */
const MarketPulse = ({ rows, meta, error, reload }: PulseFeed) => {
  const { t } = useTranslation();

  return (
    <Card className="rounded-2xl bg-stone-800 !border-stone-800 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />
            <p className="text-xs font-extrabold tracking-wide text-emerald-400 uppercase">{t('dashboard.pulse.brand')}</p>
          </div>
          <p className="text-[10px] text-stone-400 mt-0.5">
            {t('dashboard.pulse.sync')} · {t('dashboard.marketPulse.title')}
            {meta && <> · {meta.fallback ? t('dashboard.marketPulse.cachedSnapshot') : meta.source || 'AGMARKNET'}</>}
          </p>
        </div>
        {meta && (
          <FreshBadge live={!meta.fallback} label={meta.fallback ? t('dashboard.marketPulse.fallback') : t('dashboard.marketPulse.feedLive')} />
        )}
      </div>

      {rows === null && !error && (
        <div className="flex flex-wrap gap-2"><SkeletonLines rows={1} className="w-full" /></div>
      )}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-300">{error}</p>
          <GhostButton onClick={reload} className="!border-stone-600 !text-white !bg-white/5 !py-2 !px-3 !min-h-[36px] !text-xs">
            {t('common.retry')}
          </GhostButton>
        </div>
      )}
      {rows && rows.length === 0 && !error && (
        <p className="text-xs text-stone-400">{t('dashboard.marketPulse.noArrivals')}</p>
      )}
      {!meta && !error && (
        <p className="text-[10px] text-stone-500">{t('dashboard.marketPulse.checkingFeed')}</p>
      )}
      {rows && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {rows.map((r) => (
            <div key={`${r.market}-${r.variety}`} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-stone-300 truncate">
                {r.market} <span className="text-stone-500 max-w-full inline-block truncate align-bottom">({r.variety || r.district || ''})</span>
              </p>
              <p className="text-sm font-extrabold text-white tabular mt-0.5">₹{r.modalPrice?.toLocaleString('en-IN') ?? '—'}/q</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { inFlow, startFlow } = useFlow();
  // Presenter controls (§14 of the runbook): one-click demo-state reset and the
  // canonical flagship jump. Rendered only when ?demo=1 is present so judges on
  // the normal flow never see demo machinery.
  const [searchParams] = useSearchParams();
  const isDemoMode = searchParams.get('demo') === '1';
  const [seeding, setSeeding] = useState(false);
  const resetDemoState = async () => {
    setSeeding(true);
    try {
      await apiFetch(`${API_URL}/auth/demo/seed`, { method: 'POST' });
      window.location.reload();
    } catch {
      setSeeding(false);
    }
  };
  const rawName = user?.displayName || '';
  const firstName = rawName && rawName !== 'Demo Farmer' ? rawName.split(' ')[0] : 'Farmer';
  const districtName = user?.district || 'Nashik';

  const saved = loadDecisionContext();
  const navigate = useNavigate();
  // Market pulse follows the farmer's crop from the saved decision context
  // instead of a hardcoded Onion feed.
  const pulseCrop = saved?.crop || 'Onion';
  const pulse = useMarketPulse(pulseCrop);
  const top = topOfFeed(pulse.rows);

  // Real lots + farms — replaces the hardcoded "0 Active" badge and the
  // static crop-portfolio card with the farmer's actual records.
  const [lots, setLots] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/lots`);
        const j = await res.json();
        if (!cancelled && res.ok && j.success) setLots(Array.isArray(j.lots) ? j.lots : []);
      } catch { /* lots list is optional dashboard context */ }
      try {
        const res = await apiFetch(`${API_URL}/farms`);
        const j = await res.json();
        if (!cancelled && res.ok && j.success) setFarms(Array.isArray(j.farms) ? j.farms : []);
      } catch { /* farms may be empty */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const primaryFarm = farms[0] || null;

  const goToDecision = () => {
    const c = saved?.crop || 'Onion';
    const d = saved?.district || 'Nashik';
    const q = saved?.quantityQuintals || 10;
    navigate(`/decision?crop=${encodeURIComponent(c)}&district=${encodeURIComponent(d)}&quantity=${q}`);
  };

  // Canonical flagship jump (runbook §14): Onion · Nagpur · 10 q — the district
  // where today's cache still demonstrates the headline-vs-net inversion.
  const runCanonicalScenario = () => {
    startFlow();
    navigate('/net-realization?crop=Onion&district=Nagpur&quantity=10');
  };

  const handleResumeFlow = () => {
    startFlow();
    navigate('/decision');
  };

  return (
    <PageTransition className="space-y-6 pb-10">
      {/* ── greeting + best-market hero row ─────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {t('dashboard.chip.location', { district: districtName })}
            </span>
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-500">
              {t('dashboard.chip.season')}
            </span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight mt-2.5">
            {t('dashboard.greeting')}, {firstName} <span aria-hidden="true">🌱</span>
          </h1>
          <p className="text-sm text-stone-500 mt-1 max-w-xl">{t('dashboard.subtitle')}</p>
        </div>

        {/* presenter-only demo controls (runbook §14) — ?demo=1 */}
        {isDemoMode && (
          <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 p-3 flex flex-wrap items-center gap-2 lg:min-w-[300px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">{t('dashboard.demoControls.label')}</span>
            <GhostButton className="!py-1.5 !px-3 !text-xs !min-h-0" onClick={resetDemoState}>
              {seeding ? t('dashboard.demoControls.resetting') : t('dashboard.demoControls.reset')}
            </GhostButton>
            <PrimaryButton className="!py-1.5 !px-3 !text-xs !min-h-0" icon={Play} onClick={runCanonicalScenario}>
              {t('dashboard.demoControls.canonical')}
            </PrimaryButton>
          </div>
        )}

        {/* Active trading chip — top mandi from the live feed */}
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm flex items-center gap-3 lg:min-w-[300px]">
          <span className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0">
            <Store size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" /> {t('dashboard.activeTrading.label')}
            </p>
            <p className="text-sm font-bold text-stone-900 mt-0.5 truncate">
              {top ? top.market : '—'} Mandi:{' '}
              <span className="text-amber-700 tabular">₹{inr(top?.modalPrice)}</span>
              <span className="text-[11px] font-medium text-stone-400"> {t('dashboard.activeTrading.modal')}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── resume flow card — shown if farmer has an incomplete selling flow ── */}
      {inFlow && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50/70 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0">
              <ArrowRight size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-amber-700 font-bold">{t('flow.resume')}</p>
              <p className="text-sm font-semibold text-stone-900 truncate">{t('flow.resumeDesc')}</p>
            </div>
          </div>
          <PrimaryButton className="!py-2 !px-4 !text-xs !min-h-0 !bg-amber-800 hover:!bg-amber-900" icon={ArrowRight} onClick={handleResumeFlow}>
            {t('flow.resume')}
          </PrimaryButton>
        </div>
      )}

      {/* ── your lot — persistent farmer context, pre-filled from the journey ── */}
      {saved && saved.crop && (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/70 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-emerald-800 text-white flex items-center justify-center flex-shrink-0">
              <CropIcon cropName={saved.crop} size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-700 font-bold">{t('dashboard.yourLot.title')}</p>
              <p className="text-sm font-semibold text-stone-900 truncate">
                {saved.crop} · {saved.quantityQuintals != null ? <Quantity value={saved.quantityQuintals} unit="quintals" /> : ''} · {saved.district}
              </p>
            </div>
          </div>
          <PrimaryButton className="!py-2 !px-4 !text-xs !min-h-0" icon={ArrowRight} onClick={goToDecision}>
            {t('dashboard.yourLot.continue')}
          </PrimaryButton>
        </div>
      )}

      {/* ── instant net-realization calculator ──────────────────────────── */}
      <SellHero top={top} pending={!pulse.rows && !pulse.error} defaultCrop={pulseCrop} />

      {/* ── quick actions — compact discovery strip ────────────────────── */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400 mb-2">{t('dashboard.miniTools.moreTools')}</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
          {[
            { to: '/market', icon: TrendingUp, label: t('nav.market') },
            { to: '/trade', icon: Handshake, label: t('nav.trade') },
            { to: '/disease-detection', icon: Microscope, label: t('nav.diseasedetection') },
            { to: '/weather', icon: CloudSun, label: t('nav.weather') },
            { to: '/schemes', icon: Landmark, label: t('nav.schemes') },
            { to: '/farms', icon: Home, label: t('nav.farms') },
          ].map((a) => (
            <Link key={a.to} to={a.to} className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl hover:bg-stone-50 group text-center">
              <span className="h-10 w-10 rounded-lg bg-stone-100 flex items-center justify-center group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
                <a.icon size={18} className="text-stone-500 group-hover:text-emerald-700" />
              </span>
              <span className="text-[11px] font-semibold text-stone-700 group-hover:text-stone-900 leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── crop portfolio ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">{t('dashboard.portfolio.title')}</p>
            {primaryFarm && (
              <span className="text-xs font-bold text-emerald-700 tabular">{primaryFarm.area} {primaryFarm.unit}</span>
            )}
          </div>
          {primaryFarm ? (
            <>
              <div className="mt-3.5 flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-800">
                  <CropIcon cropName={primaryFarm.crops?.[0] || primaryFarm.name} size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900 truncate">{primaryFarm.name}</p>
                  <p className="text-[11px] text-stone-500 truncate">
                    {primaryFarm.crops?.length ? primaryFarm.crops.join(', ') : primaryFarm.location}
                  </p>
                  {!!primaryFarm.crops?.length && primaryFarm.location && (
                    <p className="text-[11px] text-stone-400 truncate">{primaryFarm.location}</p>
                  )}
                </div>
              </div>
              <Link to="/farms" className="mt-3.5 inline-flex items-center gap-1 -my-1.5 py-1.5 min-h-[36px] text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
                {t('dashboard.miniTools.myFarms')} <ArrowRight size={11} />
              </Link>
            </>
          ) : (
            <div className="mt-3.5">
              <div className="h-12 w-12 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0 text-stone-300">
                <Home size={20} />
              </div>
              <p className="text-xs text-stone-500 mt-3 leading-relaxed">{t('dashboard.portfolio.noFarms')}</p>
              <Link to="/farms" className="mt-2.5 inline-flex items-center gap-1 -my-1.5 py-1.5 min-h-[36px] text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
                {t('dashboard.miniTools.myFarms')} <ArrowRight size={11} />
              </Link>
            </div>
          )}
      </div>

      {/* ── recent trade lots — empty state ─────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <p className="font-display text-base font-bold text-stone-900">{t('dashboard.lots.title')}</p>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">
              {t('dashboard.lots.activeBadge', { n: lots.length })}
            </span>
          </div>
          <Link to="/trade" className="inline-flex items-center gap-1 -my-2 py-2 min-h-[36px] text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
            {t('dashboard.lots.archival')} <ArrowRight size={11} />
          </Link>
        </div>
        {lots.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="h-16 w-16 rounded-full bg-stone-100 border border-stone-200 mx-auto flex items-center justify-center">
              <Package size={26} className="text-stone-300" />
            </div>
            <h3 className="font-display text-lg font-bold text-stone-900 mt-4">{t('dashboard.lots.emptyTitle')}</h3>
            <p className="text-xs text-stone-500 mt-1.5 max-w-md mx-auto leading-relaxed">{t('dashboard.lots.emptyBody')}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={goToDecision}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 transition-colors min-h-[42px]"
              >
                <Plus size={14} /> {t('dashboard.lots.create')}
              </button>
              <Link
                to="/pathways"
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:border-emerald-300 hover:text-emerald-800 transition-colors min-h-[42px]"
              >
                <Play size={13} /> {t('dashboard.lots.guide')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm divide-y divide-stone-100 overflow-hidden">
            {lots.slice(0, 4).map((l) => (
              <div key={l._id || l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="h-9 w-9 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600 shrink-0">
                  <Package size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-stone-900 truncate">
                    {l.crop || '—'}{l.quantityQuintals != null ? <> · <Quantity value={l.quantityQuintals} unit="quintals" /></> : ''}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    {l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN') : ''}
                  </p>
                </div>
                <span className="rounded-full bg-stone-100 border border-stone-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                  {String(l.status || '—').replace(/_/g, ' ')}
                </span>
              </div>
            ))}
            <Link to="/trade" className="flex items-center justify-center gap-1.5 px-5 py-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50/50 transition-colors">
              {t('dashboard.lots.archival')} <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>

      {/* ── Maharashtra mandi pulse — real feed, honest freshness ───────── */}
      <MarketPulse {...pulse} />
    </PageTransition>
  );
};

export default Dashboard;

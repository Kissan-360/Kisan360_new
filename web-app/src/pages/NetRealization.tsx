import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/api';
import { setDecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';
import {
  PageTransition, PageHeader, Card, SectionLabel, Chip, DataTag,
  SkeletonLines, StaggerList, StaggerItem, PrimaryButton, GhostButton, AnimatedCounter, CropIcon,
  Quantity, QuantityHint,
} from '../components/ui/kit';
import { UNIT_SCALE_NOTE, otherUnits } from '../lib/units';
import { useTranslation } from '../i18n';
import {
  MapPin, Scale, Truck, Warehouse, Info, ArrowRight, AlertTriangle,
  BarChart3, Sparkles, ShieldCheck, BadgeCheck, ChevronDown, ChevronUp, Users,
  CheckCircle2, Package, Calculator,
} from 'lucide-react';

// Net-Realization page — the headline P0 feature (HLD §4a).
// The backend (Node → FastAPI :8002) computes everything deterministically;
// this screen renders the ranked mandis with the "Why?" explanation drawer
// and never does arithmetic of its own.
//
// Milestone 4 — visual migration onto the unified design system. Every API
// call, query param, response field and derivation below is UNCHANGED; only
// the presentation uses the shared kit. The tri-language i18n dictionary is
// extended (never reduced) so every new label works in EN/MR/HI.

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
    transportRatePerQuintalPerKm?: number;
    transportTier?: string;
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
    outlier?: boolean;
    outlierNote?: string;
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
  marketFallback?: boolean;
  servingMode?: string;
  marketProvenance?: { source: string; retrievedAt: string; asOf?: string; rowCount?: number; note?: string };
  unit?: string;
  // Decision layer — produced by the backend's deterministic decision engine.
  decision?: {
    recommended: {
      market: string;
      netPerQuintal: number;
      netTotal: number;
      why: string;
      watch: string[];
      alternative?: { market: string; netPerQuintal: number };
      economicsWarnings?: string[];
    };
    differenceVsNext?: { perQuintal: number; lotTotal: number };
    closeCall?: { isCloseCall: boolean; thresholdPerQuintal: number; message: string | null };
    breakEvenTransport?: { question: string; challenger: string; currentRatePerQuintalPerKm: number; breakEvenRatePerQuintalPerKm: number; headroomPct: number; distanceGapKm: number; priceGapPerQuintal: number; note: string };
    robustness?: { verdict: string; note?: string; scenarios: { scenario: string; bestMandi?: string; bestNetPerQuintal?: number; sameWinner: boolean }[] };
    confidence?: { level: string; note?: string; goodSignals?: string[]; watchSignals?: string[] };
    withoutWith?: {
      naive: { market: string; headlinePerQuintal: number; netTotal: number; basis: string; netPerQuintal?: number };
      recommended: { market: string; headlinePerQuintal?: number; netTotal: number; basis: string; netPerQuintal?: number };
      differencePerQuintal: number;
      differenceLotTotal: number;
      message?: string;
      note?: string;
    };
  };
}

const ACTIVE_CROPS = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited').map(c => c.name);

const inr = (n: number, digits = 0) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const formatRetrieved = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
};

const distanceLabel = (source: string | undefined, t: (k: string) => string) => {
  if (source === 'DOCUMENTED_ROAD') return { label: t('netRealization.documentedRoad'), tone: 'emerald' as const };
  return { label: t('netRealization.distanceEst'), tone: 'amber' as const };
};

const NetRealization = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialCrop = searchParams.get('crop');
  const initialDistrict = searchParams.get('district');
  const initialQuantity = searchParams.get('quantity');

  const { t, language: lang, setLanguage: setLang } = useTranslation();
  const [crop, setCrop] = useState(ACTIVE_CROPS.includes(initialCrop || '') ? initialCrop! : 'Soybean');
  const [district, setDistrict] = useState(MAHARASHTRA_DISTRICTS.some(d => d.name === initialDistrict) ? initialDistrict! : 'Pune');
  const [quantity, setQuantity] = useState(initialQuantity && parseFloat(initialQuantity) > 0 ? initialQuantity : '10');
  const [autoRan, setAutoRan] = useState(false);
  // Ref gate: StrictMode (dev) double-invokes effects, which used to fire the
  // engine compute twice per load — wasted load and a response race. A ref
  // survives the double-mount; state does not.
  const autoRanRef = useRef(false);
  const [result, setResult] = useState<NetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<{ text: string; by: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [whatIf, setWhatIf] = useState<{ qty: string; label: string; loading: boolean; result: NetResult | null; error: string } | null>(null);
  const [coverage, setCoverage] = useState<any | null>(null);
  // Crop choices follow real cache data (alias-merged) with the static list as
  // offline fallback — a farmer is never locked out of a crop we have prices for.
  const [cropOptions, setCropOptions] = useState<string[]>(ACTIVE_CROPS);
  useEffect(() => {
    let alive = true;
    apiFetch(`${API_URL}/market/cache-status`)
      .then(r => r.json())
      .then(j => {
        if (!alive || !j?.success || !Array.isArray(j.distinctCrops)) return;
        const merged = Array.from(new Set([initialCrop || '', ...j.distinctCrops, ...ACTIVE_CROPS])).filter(Boolean);
        setCropOptions(merged.sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => { /* offline: static ACTIVE_CROPS list remains */ });
    return () => { alive = false; };
  }, []);

  // Buyer-coverage (market-linkage layer): which costed mandis have a
  // compatible directory buyer for this exact lot? Fetched after the economic
  // result; never alters the ranking — it is reported alongside it.
  useEffect(() => {
    if (!result?.crop) return;
    let alive = true;
    setCoverage(null);
    apiFetch(`${API_URL}/market/buyer-coverage?crop=${encodeURIComponent(result.crop)}&district=${encodeURIComponent(result.district)}&quantity=${result.quantityQuintals}`)
      .then(r => r.json())
      .then(j => { if (alive) setCoverage(j.success ? j : null); })
      .catch(() => { if (alive) setCoverage(null); });
    return () => { alive = false; };
  }, [result?.crop, result?.district, result?.quantityQuintals]);

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
        // Continuity: persist the canonical selling context so Trade/FPO keep
        // carrying this decision (crop/qty/district/mandi/reference) forward.
        const bestRow = data.rankedMandis?.[0];
        if (bestRow) {
          setDecisionContext({
            crop: data.crop,
            district: data.district,
            quantity: data.quantityQuintals,
            quantityQuintals: data.quantityQuintals,
            mandi: bestRow.market,
            net: bestRow.farmerNetPerQuintal,
            reason: bestRow.reason,
            source: data.marketSource,
          });
        }
      } else {
        setError(data.error || data.message || 'Calculator could not produce a result');
      }
    } catch {
      setError('Could not reach the backend — check the API connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-compute once when deep-linked from the Dashboard hero so the farmer
  // lands on results, not an empty form.
  useEffect(() => {
    if (!autoRanRef.current && searchParams.get('crop') && searchParams.get('district')) {
      autoRanRef.current = true;
      setAutoRan(true);
      compute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRan]);

  const best = result?.rankedMandis?.[0];

  const runWhatIf = async (qty: string, label: string) => {
    if (!result) return;
    if (whatIf && whatIf.qty === qty) { setWhatIf(null); return; }
    setWhatIf({ qty, label, loading: true, result: null, error: '' });
    try {
      const params = new URLSearchParams({ crop, district, quantity: qty });
      const res = await apiFetch(`${API_URL}/market/net-realization?${params}`);
      const data = await res.json();
      setWhatIf({ qty, label, loading: false, result: data.success ? data : null, error: data.success ? '' : (data.error || 'Could not compute scenario') });
    } catch {
      setWhatIf({ qty, label, loading: false, result: null, error: 'Could not reach the calculator' });
    }
  };

  // The Kisan360 aha: a mandi with a LOWER headline price can beat one with a
  // higher headline price because of farmer-borne costs. Detected from the
  // engine's own ranking — no client-side math beyond the comparison.
  const inversion = (() => {
    if (!result?.rankedMandis) return null;
    for (let i = 0; i < result.rankedMandis.length; i++) {
      for (let j = i + 1; j < result.rankedMandis.length; j++) {
        const higher = result.rankedMandis[i];
        const lower = result.rankedMandis[j];
        if (lower.grossPricePerQuintal > higher.grossPricePerQuintal) {
          return {
            winner: higher.market,
            winnerNet: higher.farmerNetPerQuintal,
            loser: lower.market,
            loserHeadline: lower.grossPricePerQuintal,
            loserNet: lower.farmerNetPerQuintal,
            headlineGap: Math.round((lower.grossPricePerQuintal - higher.grossPricePerQuintal) * 100) / 100,
            netGap: Math.round((higher.farmerNetPerQuintal - lower.farmerNetPerQuintal) * 100) / 100,
            costGap: Math.round((lower.farmerCosts.totalCostsPerQuintal - higher.farmerCosts.totalCostsPerQuintal) * 100) / 100,
          };
        }
      }
    }
    return null;
  })();

  // Freshness badge from the backend's own provenance stamp.
  const freshness = (() => {
    const ts = result?.marketProvenance?.retrievedAt || result?.marketProvenance?.asOf;
    if (!ts) return null;
    const ageH = (Date.now() - new Date(ts).getTime()) / 3.6e6;
    const label = ageH < 24 ? `Updated today · ${new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
      : ageH < 48 ? 'Updated yesterday'
      : `Updated ${Math.floor(ageH / 24)} days ago`;
    return { label, live: result?.marketSource === 'agmarknet_live' };
  })();

  const explain = async () => {
    setExplaining(true);
    try {
      const params = new URLSearchParams({ crop, district, quantity });
      const res = await apiFetch(`${API_URL}/market/net-realization/explain?${params}`);
      const data = await res.json();
      if (data.success) setExplanation({ text: data.explanation, by: data.explainedBy });
      else setError(data.error || 'Could not generate explanation');
    } catch {
      setError('Could not reach the explanation service');
    } finally {
      setExplaining(false);
    }
  };

  const explainLabel = explaining ? t('netRealization.explaining') : t('netRealization.explainSimple');

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageTransition>
        {/* ── Header + language selector ── */}
        <PageHeader
          eyebrow={t('netRealization.eyebrow')}
          title={t('netRealization.title')}
          subtitle={t('netRealization.subtitle')}
          actions={(
            <select className="input-field w-auto text-xs" value={lang} onChange={(e) => { const v = e.target.value; if (v === 'en' || v === 'mr' || v === 'hi') setLang(v); }} aria-label="Language">
              <option value="en">English</option>
              <option value="mr">मराठी</option>
              <option value="hi">हिंदी</option>
            </select>
          )}
        />

        {/* ── Inputs ── */}
        <form onSubmit={compute} className="card p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end [&>div]:min-w-0">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('netRealization.crop')}</label>
              <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
                {cropOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('netRealization.district')}</label>
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
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('netRealization.quantity')}</label>
              <input
                className="input-field"
                type="number"
                min="0.1"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <QuantityHint value={quantity} unit="quintals" note={UNIT_SCALE_NOTE} />
            </div>
            <PrimaryButton type="submit" icon={Calculator} disabled={loading} className="!px-4 whitespace-nowrap">
              {loading ? '…' : t('netRealization.compareCta')}
            </PrimaryButton>
          </div>
        </form>

        {error && (
          <Card className="p-5 border-red-200 bg-red-50/50">
            <p className="text-red-600 text-sm flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</p>
          </Card>
        )}

        {/* Adversarial honesty: loss-making / suspicious data — always shown, never buried */}
        {(result?.decision?.recommended?.economicsWarnings || []).length > 0 && result && result.decision && (
          <Card className="p-4 border-red-300 bg-red-50/70">
            <p className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> Before you act on this</p>
            <ul className="text-sm text-red-600 mt-1 space-y-1">
              {(result.decision.recommended.economicsWarnings || []).map((w) => <li key={w}>• {w}</li>)}
            </ul>
          </Card>
        )}

        {loading && !result && <SkeletonLines rows={5} />}

        {result && best && (
          <>
            {/* ── Best-mandi hero ── */}
            <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-700 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-emerald-100 text-sm flex items-center gap-1.5">
                  <CropIcon cropName={result.crop} size={14} className="text-emerald-100" />
                  {t('netRealization.bestMandiFor')} {result.crop} · {result.district} (<Quantity value={result.quantityQuintals} unit="quintals" />)
                </p>
                <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
                  {result?.decision?.robustness && (
                    <Chip color={result.decision.robustness.verdict === 'ROBUST' ? 'emerald' : 'amber'} className="!bg-white/10 !border-white/20 !text-white">
                      {result.decision.robustness.verdict === 'ROBUST' ? <><ShieldCheck size={11} /> Robust decision</> : <><Scale size={11} /> Sensitive decision</>}
                    </Chip>
                  )}
                  {result?.decision?.confidence && (
                    <Chip color="sky" className="!bg-white/10 !border-white/20 !text-white" >
                      <BadgeCheck size={11} /> Trust: {result.decision.confidence.level}
                    </Chip>
                  )}
                  {freshness && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${freshness.live ? 'bg-red-400 pulse-dot' : 'bg-emerald-200'}`} />
                      <span className="text-emerald-50 text-xs font-bold uppercase tracking-wide">{freshness.live ? 'Live' : 'Cached'}</span>
                      <span className="text-emerald-100 text-xs">{freshness.label}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-4xl font-bold tracking-tight">{best.market}</span>
                <span className="text-2xl font-semibold flex items-center gap-2">
                  {inr(best.farmerNetPerQuintal)}{t('netRealization.netQ')}
                  <DataTag label={t('netRealization.heroTag')} tone="emerald" />
                </span>
              </div>
              {/* Phase 4 — the farmer's money is the hero number: this lot's
                  estimated realization, computed by the engine, one line. */}
              <div className="mt-3 rounded-xl bg-white/10 border border-white/20 px-4 py-3 inline-block">
                <p className="text-[11px] uppercase tracking-wider text-emerald-100">{t('netRealization.heroLotValue')}</p>
                <p className="text-3xl font-bold mt-0.5">
                  <Quantity value={result.quantityQuintals} unit="quintals" /> × {inr(best.farmerNetPerQuintal)}/q = {inr(best.farmerNetTotal)}
                </p>
              </div>
              {/* The decision chain — observed headline → farmer-borne costs → estimated net.
                  The three figures are the engine's own returned values, shown in order;
                  no client-side arithmetic. Distance keeps its honest method label. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm bg-white/10 border border-white/20 rounded-xl px-4 py-2.5">
                <span className="flex items-center gap-1.5">{t('netRealization.headlinePrice')}: <strong className="text-white">{inr(best.grossPricePerQuintal)}/q</strong></span>
                <ArrowRight size={14} className="text-emerald-200/70 shrink-0" />
                <span className="flex items-center gap-1.5">{t('netRealization.yourCosts')}: <strong className="text-amber-200">−{inr(best.farmerCosts.totalCostsPerQuintal)}/q</strong></span>
                <ArrowRight size={14} className="text-emerald-200/70 shrink-0" />
                <span className="flex items-center gap-1.5">{t('netRealization.estimatedNet')}: <strong className="text-white">{inr(best.farmerNetPerQuintal)}/q</strong></span>
                <span className="flex items-center gap-1.5 text-emerald-100">
                  <MapPin size={12} /> {best.distanceKm} km · {distanceLabel(best.distanceSource, t).label}
                </span>
              </div>
              {result.marketProvenance && (
                <p className="text-emerald-200/80 text-xs mt-3 flex items-center gap-1.5">
                  <MapPin size={12} /> {t('netRealization.pricesAgmarknet')} {formatRetrieved(result.marketProvenance.retrievedAt || result.marketProvenance.asOf) || 'latest pull'}
                </p>
              )}

              {/* One-screen decision summary — WHAT/WHY/HOW MUCH/WATCH, from the engine only */}
              {result.decision && (
                <div className="mt-4 bg-white/10 border border-white/20 rounded-xl p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm sm:items-stretch">
                    <div className="border-l-4 border-emerald-400 pl-3 py-0.5 h-full">
                      <p className="text-emerald-100 text-[11px] uppercase tracking-wider flex items-center gap-1.5"><CheckCircle2 size={12} /> {t('netRealization.heroWhy')}</p>
                      <p className="mt-1 leading-snug">{result.decision.recommended.why}</p>
                    </div>
                    <div className="border-l-4 border-amber-400 pl-3 py-0.5 h-full">
                      <p className="text-emerald-100 text-[11px] uppercase tracking-wider flex items-center gap-1.5"><Scale size={12} /> {t('netRealization.heroAdvantage')}</p>
                      {result.decision.differenceVsNext && result.decision.recommended.alternative ? (
                        <>
                          <p className="mt-1 text-lg font-bold text-amber-200 leading-tight">+{inr(result.decision.differenceVsNext.lotTotal)}</p>
                          <p className="leading-snug text-xs text-emerald-50/80">+{inr(result.decision.differenceVsNext.perQuintal)}/q over {result.decision.recommended.alternative.market}</p>
                        </>
                      ) : (
                        <p className="mt-1 leading-snug text-emerald-50/80">No alternative mandi costed today — nothing to compare against.</p>
                      )}
                    </div>
                    <div className="border-l-4 border-red-400 pl-3 py-0.5 h-full">
                      <p className="text-emerald-100 text-[11px] uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle size={12} /> {t('netRealization.heroWatch')}</p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {(result.decision.recommended.watch || []).map((w) => <li key={w}>• {w}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* The decision becomes action — hand off to lot creation pre-filled */}
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton
                icon={ArrowRight}
                onClick={() => navigate(`/trade?prefill=1&crop=${encodeURIComponent(result.crop)}&district=${encodeURIComponent(result.district)}&quantity=${result.quantityQuintals}&mandi=${encodeURIComponent(best.market)}&net=${best.farmerNetPerQuintal}`)}
              >
                Sell at {best.market} — create lot
              </PrimaryButton>
              <span className="text-xs text-stone-400">Pre-fills your lot with {result.crop} · <Quantity value={result.quantityQuintals} unit="quintals" /> · {result.district}</span>
            </div>

            {/* WITHOUT vs WITH Kisan360 — the impact of the decision, computed by
                the engine from its own ranking. Never invented. Phase 19: always
                framed as an estimated decision difference on THIS lot — never a
                claimed income increase. */}
            {result.decision?.withoutWith && (
              <Card className={`p-5 ${result.decision.withoutWith.differencePerQuintal > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/40'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-stone-900">What if you just chased the highest price?</p>
                  <Chip color="sky">estimated decision difference — not an income guarantee</Chip>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                  <div className="rounded-xl border border-amber-200 bg-white p-4">
                    <Chip color="amber">Without Kisan360</Chip>
                    <p className="font-semibold text-stone-900 mt-2">{result.decision.withoutWith.naive.market}</p>
                    <ul className="text-sm text-stone-600 mt-2 space-y-1 [&>li]:gap-2 [&>li>span]:min-w-0">
                      <li className="flex justify-between"><span className="shrink-0">{t('netRealization.headlinePrice')}</span><span className="font-medium text-right">{inr(result.decision.withoutWith.naive.headlinePerQuintal)}/q</span></li>
                      <li className="flex justify-between border-t border-amber-100 pt-1"><span className="font-semibold shrink-0">You take home</span><span className="font-bold text-amber-700 text-right">{inr(result.decision.withoutWith.naive.netTotal)}</span></li>
                    </ul>
                    <p className="text-[11px] text-stone-400 mt-1">choice: {result.decision.withoutWith.naive.basis}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-300 bg-white p-4">
                    <Chip color="emerald">With Kisan360</Chip>
                    <p className="font-semibold text-stone-900 mt-2">{result.decision.withoutWith.recommended.market}</p>
                    <ul className="text-sm text-stone-600 mt-2 space-y-1 [&>li]:gap-2 [&>li>span]:min-w-0">
                      <li className="flex justify-between"><span className="shrink-0">{t('netRealization.headlinePrice')}</span><span className="font-medium text-right">{inr(best.grossPricePerQuintal)}/q</span></li>
                      <li className="flex justify-between border-t border-emerald-100 pt-1"><span className="font-semibold shrink-0">You take home</span><span className="font-bold text-emerald-700 text-right">{inr(result.decision.withoutWith.recommended.netTotal)}</span></li>
                    </ul>
                    <p className="text-[11px] text-stone-400 mt-1">choice: {result.decision.withoutWith.recommended.basis}</p>
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-[11px] uppercase tracking-wider text-stone-400">Difference on this lot</p>
                    <p className={`text-3xl font-bold ${result.decision.withoutWith.differencePerQuintal > 0 ? 'text-emerald-700' : 'text-stone-500'}`}>
                      {result.decision.withoutWith.differenceLotTotal >= 0 ? '+' : '−'}{inr(Math.abs(result.decision.withoutWith.differenceLotTotal))}
                    </p>
                    <p className="text-xs text-stone-500">{inr(Math.abs(result.decision.withoutWith.differencePerQuintal))}/q</p>
                  </div>
                </div>
                <p className="text-sm text-stone-700 mt-3 leading-relaxed">{result.decision.withoutWith.message}</p>
                <p className="text-[10px] text-stone-400 mt-1.5">{result.decision.withoutWith.note}</p>
              </Card>
            )}

            {/* Close call — never oversell a tiny difference (documented ₹25/q threshold) */}
            {result.decision?.closeCall?.isCloseCall && result.decision.closeCall.message && (
              <Card className="p-4 border-sky-200 bg-sky-50/60">
                <p className="text-sm text-sky-900 flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><strong>Very close call.</strong> {result.decision.closeCall.message}</p>
              </Card>
            )}

            {/* WOW #1 — the inversion panel with the explicit verdict */}
            {inversion && (
              <Card className="p-5 border-amber-300 bg-amber-50/70">
                <p className="text-base font-bold text-amber-900 flex items-center gap-2">
                  <BarChart3 size={18} className="shrink-0" />
                  Highest headline price is NOT the highest estimated farmer net.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="rounded-xl border border-emerald-300 bg-white p-4">
                    <Chip color="emerald">Ranked #1 by net</Chip>
                    <p className="font-semibold text-stone-900 mt-2">{inversion.winner}</p>
                    <ul className="text-sm text-stone-600 mt-2 space-y-1">
                      <li className="flex justify-between"><span>{t('netRealization.headlinePrice')}</span><span className="font-medium">{inr(result.rankedMandis.find(m => m.market === inversion.winner)?.grossPricePerQuintal || 0)}/q</span></li>
                      <li className="flex justify-between"><span>{t('netRealization.yourCosts')}</span><span className="font-medium">−{inr(result.rankedMandis.find(m => m.market === inversion.winner)?.farmerCosts.totalCostsPerQuintal || 0)}/q</span></li>
                      <li className="flex justify-between border-t border-emerald-100 pt-1"><span className="font-semibold">{t('netRealization.estimatedNet')}</span><span className="font-bold text-emerald-700">{inr(inversion.winnerNet)}/q</span></li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-amber-300 bg-white p-4">
                    <Chip color="amber">Highest headline, ranked lower</Chip>
                    <p className="font-semibold text-stone-900 mt-2">{inversion.loser}</p>
                    <ul className="text-sm text-stone-600 mt-2 space-y-1">
                      <li className="flex justify-between"><span>{t('netRealization.headlinePrice')}</span><span className="font-medium">{inr(inversion.loserHeadline)}/q</span></li>
                      <li className="flex justify-between"><span>{t('netRealization.yourCosts')}</span><span className="font-medium">−{inr(result.rankedMandis.find(m => m.market === inversion.loser)?.farmerCosts.totalCostsPerQuintal || 0)}/q</span></li>
                      <li className="flex justify-between border-t border-amber-100 pt-1"><span className="font-semibold">{t('netRealization.estimatedNet')}</span><span className="font-bold text-amber-700">{inr(inversion.loserNet)}/q</span></li>
                    </ul>
                  </div>
                </div>
                <p className="text-sm text-amber-800 mt-3">
                  Chasing the ₹{inversion.headlineGap.toLocaleString('en-IN')}/q higher headline at {inversion.loser} would cost you
                  <strong> ₹{inversion.netGap.toLocaleString('en-IN')}/q ({inr(inversion.netGap * result.quantityQuintals)} on this lot)</strong> in extra farmer-borne costs.
                  Kisan360 ranks by what you keep — not by the biggest number.
                </p>
              </Card>
            )}

            {/* Honest thin-evidence state (observed in playtest: upstream price
                anomalies can leave one usable mandi). No fake comparison. */}
            {result.rankedMandis.length < 2 && (
              <Card className="p-4 border-amber-300 bg-amber-50/70">
                <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><Info size={16} className="shrink-0" />Only one mandi has usable price evidence right now.</p>
                <p className="text-sm text-amber-800 mt-1">
                  A comparison — and the best-market recommendation — needs at least two costed mandis.
                  The economics above are correct for this market alone; the ranking data may be limited today (live feed anomaly or cache gap).
                </p>
              </Card>
            )}

            {/* ── Ranked mandi list ── */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <SectionLabel>{t('netRealization.ranked')}</SectionLabel>
                  <p className="text-xs text-stone-400 mt-1 flex items-center gap-1.5">
                    <AnimatedCounter value={result.rankedMandis.length} /> {t('netRealization.mandisCosted')}
                  </p>
                </div>
                <GhostButton className="text-xs" onClick={explain} disabled={explaining}>
                  <Sparkles size={14} /> {explainLabel}
                </GhostButton>
              </div>
              {explanation && (
                <Card className="p-4 border-sky-200 bg-sky-50/40">
                  <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{explanation.text}</p>
                  <p className="text-[11px] text-stone-400 mt-2">
                    AI explanation based on Kisan360 market calculations · explained by: {explanation.by} · the AI never generates the numbers.
                  </p>
                </Card>
              )}
              <StaggerList className="space-y-3">
                {result.rankedMandis.map((m) => {
                  const gap = best.farmerNetPerQuintal - m.farmerNetPerQuintal;
                  const open = drawerFor === m.market;
                  const dist = distanceLabel(m.distanceSource, t);
                  const isBest = m.rank === 1;
                  return (
                    <StaggerItem key={m.market}>
                      <div className={`card p-5 ${isBest ? 'border-emerald-300 ring-1 ring-emerald-200 bg-emerald-50/20' : ''}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${isBest ? 'bg-emerald-800 text-white' : 'bg-stone-200 text-stone-700'}`}>{m.rank}</span>
                              {isBest && <DataTag label={t('netRealization.bestEstNet')} tone="emerald" />}
                              <span className="font-semibold text-stone-900">{m.market}</span>
                              <span className="text-xs text-stone-400 flex items-center gap-1">
                                <MapPin size={11} /> {m.distanceKm} km
                              </span>
                              <DataTag label={dist.label} tone={dist.tone} />
                              {coverage?.coverage?.[m.market]?.status === 'ACTIONABLE' && (
                                <Chip color="emerald" className="shrink-0" >
                                  <Users size={11} /> {coverage.coverage[m.market].buyers.length} buyer{coverage.coverage[m.market].buyers.length === 1 ? '' : 's'}
                                </Chip>
                              )}
                              {coverage?.coverage?.[m.market]?.status === 'NO_MATCH' && (
                                <DataTag label="no directory buyer" tone="stone" />
                              )}
                            </div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-sm min-w-0 [&>span]:truncate">
                              <span className="text-stone-500">{t('netRealization.headlinePrice')}: <span className="text-stone-800 font-medium">{inr(m.grossPricePerQuintal)}/q</span></span>
                              <span className="text-stone-500">{t('netRealization.yourCosts')}: <span className="text-amber-700 font-medium">−{inr(m.farmerCosts.totalCostsPerQuintal)}/q</span></span>
                              <span className="text-stone-500">{t('netRealization.estimatedNet')}: <span className="text-emerald-700 font-semibold">{inr(m.farmerNetPerQuintal)}/q</span></span>
                              <span className="text-stone-500">{t('netRealization.lotTotal')}: <span className="text-stone-800 font-medium">{inr(m.farmerNetTotal)}</span></span>
                            </div>
                            {!isBest && gap > 0 && (
                              <p className="text-xs text-stone-400 mt-1.5">
                                {inr(gap)}/q less than {best.market}
                              </p>
                            )}
                          </div>
                          <GhostButton
                            className="text-xs shrink-0"
                            onClick={() => setDrawerFor(open ? null : m.market)}
                            aria-expanded={open}
                          >
                            {t('netRealization.why')} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </GhostButton>
                        </div>

                        {/* "Why?" drawer — the deterministic explanation the engine already produced */}
                        {open && (
                          <div className="mt-4 border-t border-stone-100 pt-4 space-y-3">
                            <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                              <p className="text-sm text-emerald-900 leading-relaxed">{m.reason}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div className="rounded-lg border border-stone-200 p-3">
                                <SectionLabel tone="stone" className="mb-2">{t('netRealization.costBreakdown')}</SectionLabel>
                                <ul className="space-y-1.5 text-stone-600">
                                  <li className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5"><Truck size={12} className="text-stone-400 shrink-0" /> Transport ({m.distanceKm} km × ₹{m.farmerCosts.transportRatePerQuintalPerKm ?? 1.5}{m.farmerCosts.transportTier === 'bulk_full_truck' ? ' bulk' : ''}) <DataTag label={t('netRealization.tagAssumption')} tone="amber" /></span>
                                    <span>−{inr(m.farmerCosts.transportPerQuintal, 2)}</span>
                                  </li>
                                  <li className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5"><Warehouse size={12} className="text-stone-400 shrink-0" /> Storage (2 days × ₹1) <DataTag label={t('netRealization.tagAssumption')} tone="amber" /></span>
                                    <span>−{inr(m.farmerCosts.storagePerQuintal, 2)}</span>
                                  </li>
                                  <li className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5"><Package size={12} className="text-stone-400 shrink-0" /> Bagging/loading/entry <DataTag label={t('netRealization.tagAssumption')} tone="amber" /></span>
                                    <span>−{inr(m.farmerCosts.otherPerQuintal, 2)}</span>
                                  </li>
                                  <li className="flex items-center justify-between gap-2 border-t border-stone-100 pt-1 font-semibold text-stone-800">
                                    <span className="flex items-center gap-1.5">Total <DataTag label={t('netRealization.tagDerived')} tone="emerald" /></span>
                                    <span>−{inr(m.farmerCosts.totalCostsPerQuintal, 2)}</span>
                                  </li>
                                </ul>
                              </div>
                              <div className="rounded-lg border border-stone-200 p-3">
                                <SectionLabel tone="stone" className="mb-2">{t('netRealization.evidenceTitle')}</SectionLabel>
                                <ul className="space-y-1.5 text-stone-600 text-xs">
                                  <li className="flex items-center gap-2">Price source: {m.evidence.priceSource || 'AGMARKNET'} <DataTag label={t('netRealization.tagData')} tone="sky" /></li>
                                  <li className="flex items-center gap-2">Quote date: {m.evidence.arrivalDate || '—'} · retrieved {m.evidence.retrievedAt || '—'} <DataTag label={t('netRealization.tagData')} tone="sky" /></li>
                                  <li className="flex items-center gap-2">Variety: {m.evidence.variety || '—'} <DataTag label={t('netRealization.tagData')} tone="sky" /></li>
                                  <li className="flex items-center gap-2">Your crop, quantity &amp; district <DataTag label={t('netRealization.tagYourInput')} tone="stone" /></li>
                                  {m.evidence.outlier && <li className="text-red-600 font-medium flex items-center gap-1.5"><AlertTriangle size={12} /> {m.evidence.outlierNote}</li>}
                                </ul>
                                <p className="text-xs text-stone-500 mt-2 leading-relaxed">{result.buyerSideCharges.note}</p>
                                <ul className="mt-1 text-xs text-stone-500 space-y-0.5">
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
                    </StaggerItem>
                  );
                })}
              </StaggerList>

              {result.skippedMarkets.length > 0 && (
                <Card className="p-4">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Not ranked ({result.skippedMarkets.length})</p>
                  {result.skippedMarkets.map((s) => (
                    <p key={s.market} className="text-xs text-stone-500">
                      <span className="font-medium text-stone-700">{s.market}</span> — {s.reason}
                    </p>
                  ))}
                </Card>
              )}
            </div>

            {/* Phase 6 — the second WOW lives next to the decision it can change:
                every scenario is a live re-run of the SAME deterministic engine. */}
            <Card className="p-5">
              <SectionLabel>{t('netRealization.whatCouldChange')}</SectionLabel>
              <p className="text-xs text-stone-500 mt-1">Change the quantity — every scenario is recomputed server-side by the deterministic engine. Nothing is pre-scripted or estimated in the browser.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['50', '100'].map((q) => (
                  <GhostButton key={q} className={`text-xs ${whatIf?.qty === q ? '!border-emerald-400 !text-emerald-700' : ''}`} onClick={() => runWhatIf(q, `${result.crop} · ${q} q`)}>
                    What if I sell <Quantity value={q} unit="quintals" /> instead of <Quantity value={result.quantityQuintals} unit="quintals" />?
                  </GhostButton>
                ))}
              </div>
              {whatIf?.loading && <p className="text-sm text-stone-500 mt-3">Recomputing with the engine…</p>}
              {whatIf?.error && <p className="text-sm text-red-600 mt-3">{whatIf.error}</p>}
              {whatIf?.result && whatIf.result.rankedMandis?.length > 0 && (() => {
                const wb = whatIf.result.rankedMandis[0];
                const base = result.rankedMandis[0];
                const delta = Math.round((wb.farmerNetPerQuintal - base.farmerNetPerQuintal) * 100) / 100;
                const tierChanged = wb.farmerCosts.transportTier !== base.farmerCosts.transportTier;
                const flipped = wb.market !== base.market;
                return (
                  <div className="mt-4 border-t border-stone-100 pt-3">
                    {flipped && (
                      <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                        <Chip color="stone">Old recommendation · {result.quantityQuintals} q ({otherUnits(result.quantityQuintals, 'quintals')})</Chip>
                        <span className="font-semibold text-stone-800">{base.market}</span>
                        <ArrowRight size={14} className="text-stone-400" />
                        <Chip color="emerald">New recommendation · {whatIf.qty} q ({otherUnits(whatIf.qty, 'quintals')})</Chip>
                        <span className="font-semibold text-stone-800">{wb.market}</span>
                      </div>
                    )}
                    <p className="text-sm text-stone-700">
                      At <strong><Quantity value={whatIf.qty} unit="quintals" /></strong>, the best mandi is <strong>{wb.market}</strong> at <strong>{inr(wb.farmerNetPerQuintal)}/q net</strong>
                      {' '}({inr(wb.farmerNetTotal)} for the lot).
                      {flipped
                        ? ' The ranking changed with your quantity.'
                        : delta === 0
                          ? ' Net per quintal is unchanged — quantity alone does not move per-quintal costs below the bulk threshold.'
                          : ` Net per quintal changed by ${inr(delta)}/q versus your current ${result.quantityQuintals} q (${otherUnits(result.quantityQuintals, 'quintals')}) plan.`}
                    </p>
                    <p className="text-xs text-stone-500 mt-1.5">
                      {tierChanged
                        ? 'Why: pooled volume crosses the 40 q full-truck threshold — transport drops from ₹1.5 to ₹0.75 per quintal-km, so logistics economics change.'
                        : 'Why: the ranking held because per-quintal transport only drops at the 40 q full-truck threshold.'}
                    </p>
                  </div>
                );
              })()}
            </Card>

            {/* Can I sell here? — buyer coverage from the directory (Phase: actionability) */}
            {coverage && (
              <Card className="p-5">
                <p className="font-semibold text-stone-900 flex items-center gap-2"><Users size={16} className="text-emerald-600" /> Can I sell here?</p>
                <p className="text-xs text-stone-400 mt-0.5">Buyer coverage in the current Kisan360 directory — deterministic matching on crop, service area and minimum quantity. Not a demand estimate.</p>
                {coverage.divergence && (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                    <p className="text-sm font-bold text-amber-900">Economically best vs currently actionable</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
                      <div className="rounded-lg border border-amber-200 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-wider text-stone-400">Economically best</p>
                        <p className="font-semibold text-stone-900">{coverage.bestEconomic.market} — {inr(coverage.bestEconomic.netPerQuintal)}/q</p>
                        <p className="text-[11px] text-red-600 mt-0.5">No current matching buyer in the directory</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white p-3">
                        <p className="text-[11px] uppercase tracking-wider text-stone-400">Next actionable option</p>
                        <p className="font-semibold text-stone-900">{coverage.bestActionable.market} — {inr(coverage.bestActionable.netPerQuintal)}/q</p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">{coverage.bestActionable.buyerCount} compatible buyer{coverage.bestActionable.buyerCount === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    <p className="text-sm text-amber-800 mt-2">Estimated cost of taking the immediately actionable path: <strong>{inr(coverage.divergence.perQuintal)}/q ({inr(coverage.divergence.lotTotal)} on this lot)</strong>. {coverage.divergence.note}</p>
                  </div>
                )}
                {coverage.summary?.actionableCount === 0 && (
                  <div className="mt-3 rounded-xl border border-stone-300 bg-stone-50 p-4">
                    <p className="text-sm font-medium text-stone-800">No compatible buyer found in the current Kisan360 directory for this lot.</p>
                    <p className="text-sm text-stone-600 mt-1">You can still create the lot, retry buyer discovery later, review the alternative mandis below, or consider FPO aggregation to reach buyer minimums.</p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {coverage.bestActionable && (
                    <GhostButton
                      className="text-sm"
                      onClick={() => navigate(`/trade?prefill=1&crop=${encodeURIComponent(result.crop)}&district=${encodeURIComponent(result.district)}&quantity=${result.quantityQuintals}&mandi=${encodeURIComponent(coverage.bestActionable.market)}&net=${coverage.bestActionable.netPerQuintal}`)}
                    >
                      Find buyers for {coverage.bestActionable.market} <ArrowRight size={14} />
                    </GhostButton>
                  )}
                  <span className="text-xs text-stone-400">{coverage.summary?.actionableCount} of {coverage.summary?.totalRanked} costed mandis have directory buyers for this lot.</span>
                </div>
              </Card>
            )}

            {/* Break-even transport — the boundary of this decision (deterministic algebra) */}
            {result.decision?.breakEvenTransport && (
              <Card className="p-5 border-teal-200 bg-teal-50/50">
                <p className="font-semibold text-stone-900 flex items-center gap-2"><Scale size={16} className="text-teal-700" /> When does this decision flip?</p>
                <p className="text-sm text-stone-700 mt-2 leading-relaxed">{result.decision.breakEvenTransport.note}</p>
              </Card>
            )}

            {/* Phase 6 companion: which assumptions actually matter for THIS
                recommendation — read off the stress-test results, no generic filler. */}
            {result && result.decision && result.decision.robustness && result.decision.robustness.scenarios.length > 0 && (
              <Card className="p-5">
                <p className="font-semibold text-stone-900 text-sm">Stress test — which assumptions matter</p>
                <ul className="text-sm text-stone-600 mt-2 space-y-1.5">
                  {result.decision.robustness.scenarios.map((s) => {
                    const label = s.scenario === 'quantity_doubled' ? `Selling double the quantity (${result.quantityQuintals * 2} q)`
                      : s.scenario === 'transport_cost_+50pct' ? 'Transport costing 50% more'
                      : s.scenario === 'mandi_prices_fall_5pct' ? 'Mandi prices slipping 5%'
                      : s.scenario;
                    return (
                      <li key={s.scenario} className="flex items-start gap-2">
                        <Chip color={s.sameWinner ? 'emerald' : 'amber'} className="shrink-0">{s.sameWinner ? 'ranking holds' : 'ranking flips'}</Chip>
                        <span>{label}{s.sameWinner ? ' — same mandi stays best.' : ` — ${s.bestMandi} would become the better sale.`}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[10px] text-stone-400 mt-2">Each row is the same engine re-run with one assumption changed. No prediction — only sensitivity.</p>
              </Card>
            )}

          </>
        )}
      </PageTransition>
    </div>
  );
};

export default NetRealization;
// DecisionWorkspace — the unified farmer decision experience.
// INFORM → COMPARE → DECIDE → CONNECT → SELL
//
// VISUAL/UX MIGRATION (Milestone 2). All business logic is preserved:
//   - same fetch calls, same endpoints, same response fields
//   - same decisionContext persistence, same stage semantics
//   - backend remains the single source of truth — this file only presents
//     the data the API already returns, with provenance made visible.
// No AI invents numbers. Every calculation is deterministic.
// Every claim has provenance.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3, Scale, Target, Handshake, Wallet, MapPin, Warehouse, Users,
  Store, Lightbulb, AlertTriangle, CheckCircle2, ArrowRight, ChevronLeft, Lock, Info, BadgeCheck,
  Check, Star,
} from 'lucide-react';
import { apiFetch, API_URL } from '../lib/api';
import {
  DistrictSelector, CropSelector, QuantityInput,
} from '../components/DistrictSelector';
import {
  saveDecisionContext, loadDecisionContext, DEFAULT_CONTEXT, LotContext,
} from '../lib/decisionContext';
import { DataProvenance } from '../components/DataProvenance';
import {
  PageHeader, Card, SectionLabel, DataTag, Chip, SkeletonLines,
  PrimaryButton, GhostButton, EmptyState, PageTransition, CropIcon, Quantity,
} from '../components/ui/kit';
import { quantityRangeQuintals } from '../lib/units';
import { useTranslation } from '../i18n';
import { useFlow } from '../components/FlowContext';

// ── Provenance tag — maps backend source strings to honest DataTags ──────
const SourceTag: React.FC<{ source: string }> = ({ source }) => {
  const s = source?.toLowerCase() || '';
  if (s.includes('live')) return <DataTag label="LIVE" tone="red" />;
  if (s.includes('cached') || s.includes('snapshot')) return <DataTag label="CACHED" tone="stone" />;
  if (s.includes('history') || s.includes('observed')) return <DataTag label="HISTORICAL" tone="stone" />;
  if (s.includes('derived') || s.includes('modeled')) return <DataTag label="DERIVED" tone="sky" />;
  if (s.includes('assumption') || s.includes('documented')) return <DataTag label="ASSUMPTION" tone="amber" />;
  if (s.includes('demo') || s.includes('static') || s.includes('reference')) return <DataTag label="DEMO" tone="amber" />;
  return <DataTag label={source || 'UNKNOWN'} tone="stone" />;
};

// Confidence is a QUALITATIVE level — never a probability.
const ConfidenceChip: React.FC<{ level: string }> = ({ level }) => {
  const color = level === 'STRONG' ? 'emerald' : level === 'GOOD' ? 'teal' : level === 'CAUTION' ? 'amber' : 'stone';
  return <Chip color={color as 'emerald' | 'teal' | 'amber' | 'stone'}>{level}</Chip>;
};

const inr = (n?: number) => n != null ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—';
const inrExact = (n?: number) => n != null ? `₹${n.toLocaleString('en-IN')}` : '—';

// ── Welcome card (shown before first analysis) ──────────────────────────
const EXAMPLE_SCENARIOS = [
  { crop: 'Onion', district: 'Nashik', quantity: 10, label: 'Onion · Nashik · 10 quintals' },
  { crop: 'Onion', district: 'Nashik', quantity: 50, label: 'Onion · Nashik · 50 quintals (bulk)' },
  { crop: 'Soyabean', district: 'Akola', quantity: 12, label: 'Soybean · Akola · 12 quintals' },
];

const WelcomeCard: React.FC<{ onSelect: (crop: string, district: string, quantity: string) => void }> = ({ onSelect }) => {
  const { t } = useTranslation();
  return (
  <Card className="relative overflow-hidden p-6 !border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white">
    <div className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-800" aria-hidden="true" />
    <div className="text-center max-w-2xl mx-auto py-2">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700">
        <Target size={24} />
      </div>
      <h2 className="font-display text-lg font-bold text-stone-900 mb-1">{t('decision.welcome.title')}</h2>
      <p className="text-sm text-stone-500 mb-5">
        {t('decision.welcome.desc').replace('{strong}', '<strong>').replace('{strongEnd}', '</strong>')}  
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_SCENARIOS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect(s.crop, s.district, String(s.quantity))}
            className="text-xs px-3 py-2 rounded-full border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-medium min-h-[36px]"
          >
            {t('decision.welcome.tryLabel')} {s.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-stone-400 mt-3">
        {t('decision.welcome.priceNote')}
      </p>
    </div>
  </Card>
  );
};

// ── Actionable error banner ──────────────────────────────────────────────
const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
    <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm text-red-700 font-medium">{message}</p>
      <p className="text-xs text-red-500 mt-0.5">
        {message.includes('unavailable') || message.includes('connection')
          ? 'Check that the backend server is running.'
          : 'Try adjusting your crop, district, or quantity and try again.'}
      </p>
    </div>
    {onRetry && (
      <button onClick={onRetry} className="text-xs text-red-600 underline hover:text-red-800 whitespace-nowrap shrink-0 -my-2 py-2 min-h-[36px]">
        Retry
      </button>
    )}
  </div>
);

// ── Stage tabs ───────────────────────────────────────────────────────────
type Stage = 'inform' | 'compare' | 'decide' | 'connect' | 'sell';
const STAGES: { key: Stage; labelKey: string; icon: React.ElementType }[] = [
  { key: 'inform', labelKey: 'decision.stages.inform', icon: BarChart3 },
  { key: 'compare', labelKey: 'decision.stages.compare', icon: Scale },
  { key: 'decide', labelKey: 'decision.stages.decide', icon: Target },
  { key: 'connect', labelKey: 'decision.stages.connect', icon: Handshake },
  { key: 'sell', labelKey: 'decision.stages.sell', icon: Wallet },
];
const STAGE_ORDER: Stage[] = ['inform', 'compare', 'decide', 'connect', 'sell'];

// ── Guided step footer: Back / Continue — the linear spine of the workspace.
// Every stage ends with an explicit next step, so the journey reads
// Inform → Compare → Decide → Connect → Sell instead of five free tabs the
// farmer must figure out. A locked Continue (data not ready yet) shows a
// lock and explains what unlocks it.
const StageNav: React.FC<{
  active: Stage;
  unlocked: Record<Stage, boolean>;
  onGo: (s: Stage) => void;
}> = ({ active, unlocked, onGo }) => {
  const { t } = useTranslation();
  const idx = STAGE_ORDER.indexOf(active);
  const prev = idx > 0 ? STAGE_ORDER[idx - 1] : null;
  const next = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  const nextLocked = next ? !unlocked[next] : false;
  if (!prev && !next) return null;
  const stageName = (s: Stage) => t(STAGES.find(x => x.key === s)!.labelKey);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {prev ? (
        <GhostButton onClick={() => onGo(prev)}>
          <ChevronLeft size={16} /> {t('common.back')}
        </GhostButton>
      ) : <span />}
      {next && (
        nextLocked ? (
          <span title={t('decision.nav.lockedHint')}>
            <PrimaryButton disabled icon={Lock} ariaLabel={t('decision.nav.lockedHint')}>
              {t('decision.nav.continueTo', { stage: stageName(next) })}
            </PrimaryButton>
          </span>
        ) : (
          <PrimaryButton onClick={() => onGo(next)} icon={ArrowRight}>
            {t('decision.nav.continueTo', { stage: stageName(next) })}
          </PrimaryButton>
        )
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
const DecisionWorkspace = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { flowStep, setFlowStep, inFlow } = useFlow();

  // Map flow step (1-5) to stage key
  const FLOW_TO_STAGE: Record<number, Stage> = { 1: 'inform', 2: 'compare', 3: 'decide', 4: 'connect', 5: 'sell' };
  const STAGE_TO_FLOW: Record<Stage, number> = { inform: 1, compare: 2, decide: 3, connect: 4, sell: 5 };

  // Deep-link support: /decision?crop=…&district=…&quantity=… initializes the
  // lot context (URL > saved context > defaults) and auto-runs the analysis.
  const paramCrop = searchParams.get('crop');
  const paramDistrict = searchParams.get('district');
  const paramQty = searchParams.get('quantity');

  // Shared lot context — entered once, used across all stages
  const saved = loadDecisionContext();
  const [crop, setCrop] = useState(paramCrop || saved?.crop || DEFAULT_CONTEXT.crop);
  const [district, setDistrict] = useState(paramDistrict || saved?.district || DEFAULT_CONTEXT.district);
  const [quantity, setQuantity] = useState(paramQty || String(saved?.quantityQuintals || DEFAULT_CONTEXT.quantityQuintals));
  const [grade, setGrade] = useState(saved?.grade || 'Unassessed');

  // Track whether user has run an analysis
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  // Active stage — syncs with flow step when in flow mode
  const [activeStage, setActiveStageRaw] = useState<Stage>(() => {
    if (inFlow && flowStep >= 1 && flowStep <= 5) return FLOW_TO_STAGE[flowStep];
    return 'inform';
  });

  // Sync active stage with flow step changes
  useEffect(() => {
    if (inFlow && flowStep >= 1 && flowStep <= 5) {
      setActiveStageRaw(FLOW_TO_STAGE[flowStep]);
    }
  }, [flowStep, inFlow]);

  // Wrapper that also updates flow step
  const setActiveStage = useCallback((stage: Stage) => {
    setActiveStageRaw(stage);
    if (inFlow) setFlowStep(STAGE_TO_FLOW[stage]);
  }, [inFlow, setFlowStep]);

  // Data states
  const [marketData, setMarketData] = useState<any>(null);
  const [pathwayData, setPathwayData] = useState<any>(null);
  const [farmContext, setFarmContext] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const qty = parseFloat(quantity) > 0 ? parseFloat(quantity) : 10;

  // Save context whenever it changes
  useEffect(() => {
    saveDecisionContext({ crop, district, quantity: qty, quantityQuintals: qty, grade });
  }, [crop, district, qty, grade]);

  // Auto-run once when arriving via a deep link with explicit parameters.
  // Setting hasAnalyzed triggers the stage effect below, which fetches the
  // inform-stage data exactly once — no duplicate requests.
  const didAutoRun = React.useRef(false);
  useEffect(() => {
    if (didAutoRun.current) return;
    if (!paramCrop && !paramDistrict && !paramQty) return;
    didAutoRun.current = true;
    setHasAnalyzed(true);
  }, [paramCrop, paramDistrict, paramQty]);

  // Fetch market data (net-realization)
  const fetchMarketData = useCallback(async (override?: { crop?: string; district?: string; qty?: number }, _retryCount = 0) => {
    const c = override?.crop ?? crop;
    const d = override?.district ?? district;
    const q = override?.qty ?? qty;
    if (_retryCount === 0) { setLoading(true); setError(''); }
    try {
      const res = await apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(c)}&district=${encodeURIComponent(d)}&quantity=${q}`);
      if (res.status === 503 && _retryCount < 2) {
        const delay = 3000 * (_retryCount + 1);
        console.log(`[Kisan360] DecisionWorkspace net-realization 503, retry ${_retryCount + 1}/2 in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return fetchMarketData(override, _retryCount + 1);
      }
      const data = await res.json();
      if (data.success) setMarketData(data);
      else setError(data.error || 'Failed to fetch market data');
    } catch (e: any) {
      if (_retryCount < 1) {
        console.log('[Kisan360] DecisionWorkspace net-realization error, retrying in 3s...');
        await new Promise(r => setTimeout(r, 3000));
        return fetchMarketData(override, _retryCount + 1);
      }
      setError('Market data unavailable — check backend connection');
    } finally { setLoading(false); }
  }, [crop, district, qty]);

  // Fetch pathway data
  const fetchPathwayData = useCallback(async (override?: { crop?: string; district?: string; qty?: number; grade?: string }, _retryCount = 0) => {
    const c = override?.crop ?? crop;
    const d = override?.district ?? district;
    const q = override?.qty ?? qty;
    const g = override?.grade ?? grade;
    if (_retryCount === 0) { setLoading(true); setError(''); }
    try {
      const params = new URLSearchParams({ crop: c, district: d, quantity: String(q), grade: g });
      const res = await apiFetch(`${API_URL}/market/pathways?${params}`);
      if (res.status === 503 && _retryCount < 2) {
        const delay = 3000 * (_retryCount + 1);
        console.log(`[Kisan360] DecisionWorkspace pathways 503, retry ${_retryCount + 1}/2 in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return fetchPathwayData(override, _retryCount + 1);
      }
      const data = await res.json();
      if (data.success) setPathwayData(data);
      else setError(data.error || 'Failed to fetch pathway data');
    } catch (e: any) {
      if (_retryCount < 1) {
        console.log('[Kisan360] DecisionWorkspace pathways error, retrying in 3s...');
        await new Promise(r => setTimeout(r, 3000));
        return fetchPathwayData(override, _retryCount + 1);
      }
      setError('Pathway data unavailable');
    } finally { setLoading(false); }
  }, [crop, district, qty, grade]);

  // Fetch farm context (soil, weather, crop suitability, season)
  const fetchFarmContext = useCallback(async (override?: { crop?: string; district?: string }) => {
    const c = override?.crop ?? crop;
    const d = override?.district ?? district;
    try {
      const params = new URLSearchParams({ crop: c, district: d, quantity: String(qty) });
      const res = await apiFetch(`${API_URL}/market/farm-context?${params}`);
      const data = await res.json();
      if (data.success) setFarmContext(data);
    } catch { /* farm context is optional */ }
  }, [crop, district, qty]);

  // Auto-fetch when stage changes, but ONLY after first analysis
  useEffect(() => {
    if (!hasAnalyzed) return;
    if (activeStage === 'inform') { fetchFarmContext(); fetchMarketData(); }
    if (activeStage === 'compare') fetchMarketData();
    if (activeStage === 'decide') fetchPathwayData();
  }, [activeStage, hasAnalyzed, fetchMarketData, fetchPathwayData, fetchFarmContext]);

  // Dependency-aware: crop/district changes refresh farm context; quantity does not
  useEffect(() => {
    if (hasAnalyzed) fetchFarmContext();
  }, [crop, district]); // intentionally NOT quantity

  const rankedMandis = marketData?.rankedMandis || [];
  const bestMandi = rankedMandis[0];
  const skippedMarkets = marketData?.skippedMarkets || [];
  const decision = marketData?.decision || {};
  const pathways = pathwayData?.pathways || [];
  const recommendation = pathwayData?.recommendation;

  // ── Guided flow: a stage unlocks only when its data exists ─────────────
  // Inform is always open (it IS the analysis); Compare and Sell need the
  // ranked mandis; Decide and Connect need pathways. A locked tab shows a
  // lock instead of opening onto an empty "open problem".
  const stageUnlocked: Record<Stage, boolean> = {
    inform: true,
    compare: rankedMandis.length > 0,
    decide: pathways.length > 0,
    connect: pathways.length > 0,
    sell: rankedMandis.length > 0,
  };
  // Anchor at the tabs: every guided move (tab click, Back, Continue) lands
  // the farmer back at the stage header, never stranded mid-card.
  const stageTopRef = React.useRef<HTMLDivElement>(null);
  const goStage = useCallback((s: Stage) => {
    setActiveStage(s);
    requestAnimationFrame(() => stageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [setActiveStage]);

  const analyzeAll = () => {
    setHasAnalyzed(true);
    fetchFarmContext();
    fetchMarketData();
    fetchPathwayData();
    // Auto-advance flow: crop entered → move to compare step
    if (inFlow && flowStep === 1) {
      setTimeout(() => setFlowStep(2), 1500);
    }
  };

  return (
    <PageTransition className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={t('decision.eyebrow')}
        title={<>What should you do with <span className="gradient-text">your lot</span> today?</>}
        subtitle={t('decision.subtitle')}
      />

      {/* ── LOT INPUT (shared context) ─────────────────────────────────── */}
      <Card className="relative overflow-hidden p-5 !border-emerald-200 bg-emerald-50/40">
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-800" aria-hidden="true" />
        <SectionLabel tone="emerald" className="mb-3">{t('decision.yourLot')}</SectionLabel>
        {/* Escalates 2 → 3 → 5 columns: at lg (1024px) the sidebar leaves ~700px,
            so five 129px columns wrapped "Grade (your assessment)" onto two lines
            and left that one label sitting 16px higher than its row-mates. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-5 items-start">
          <CropSelector value={crop} onChange={setCrop} />
          <DistrictSelector value={district} onChange={setDistrict} />
          <QuantityInput value={quantity} onChange={setQuantity} />
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1" htmlFor="dw-grade" title={t('decision.gradeHint')}>{t('decision.grade')}</label>
            <select id="dw-grade" value={grade} onChange={e => setGrade(e.target.value)}
              className="input-field !min-h-[44px]">
              {['Unassessed', 'A', 'B', 'C'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            {/* Invisible spacer matching the field labels above, so Analyze
                top-aligns with the inputs (not the label row). */}
            <span className="block text-xs font-medium mb-1 invisible select-none" aria-hidden="true">&nbsp;</span>
            <PrimaryButton onClick={analyzeAll} disabled={loading} icon={Target} className="w-full">
              {loading ? t('decision.analyzing') : t('decision.analyze')}
            </PrimaryButton>
          </div>
          <button
            onClick={() => navigate('/grade-crop')}
            className="inline-flex items-center -my-2 py-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
          >
            Or grade with AGMARK standards first →
          </button>
        </div>
        {error && <div className="mt-3"><ErrorBanner message={error} onRetry={analyzeAll} /></div>}
      </Card>

      {/* ── STAGE TABS — guided and gated: a locked step cannot be opened
          onto empty content; Analyze (or a finished fetch) unlocks it ── */}
      <div ref={stageTopRef} className="flex gap-1 border-b border-stone-200 overflow-x-auto scroll-mt-6">
        {STAGES.map(s => {
          const Icon = s.icon;
          const locked = !stageUnlocked[s.key];
          const hasData = (
            (s.key === 'inform' || s.key === 'compare' || s.key === 'decide') && rankedMandis.length > 0
          ) || (
            s.key === 'connect' && (pathwayData?.pathways?.length > 0)
          ) || (
            s.key === 'sell' && (recommendation)
          );
          return (
            <button key={s.key}
              onClick={() => { if (!locked) goStage(s.key); }}
              disabled={locked}
              title={locked ? t('decision.nav.lockedHint') : undefined}
              aria-current={activeStage === s.key ? 'page' : undefined}
              aria-disabled={locked || undefined}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap min-h-[44px] ${
                activeStage === s.key
                  ? 'border-emerald-500 text-emerald-700'
                  : locked
                    ? 'border-transparent text-stone-300 cursor-not-allowed'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}>
              {locked ? <Lock size={15} /> : <Icon size={15} />}
              <span>{t(s.labelKey)}</span>
              {hasData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* ── STAGE CONTENT ──────────────────────────────────────────────── */}
      <div className="min-h-[400px]">
        {!hasAnalyzed && !marketData && (
          <WelcomeCard onSelect={(c, d, q) => {
            setCrop(c); setDistrict(d); setQuantity(q);
            setHasAnalyzed(true);
            // Fetch with explicit overrides since state hasn't updated yet
            fetchFarmContext({ crop: c, district: d });
            fetchMarketData({ crop: c, district: d, qty: parseFloat(q) });
            fetchPathwayData({ crop: c, district: d, qty: parseFloat(q) });
          }} />
        )}
        {(hasAnalyzed || marketData) && loading && !marketData && (
          <Card className="p-6"><SkeletonLines rows={4} /></Card>
        )}
        {(hasAnalyzed || marketData) && (activeStage === 'inform') && (
          <InformStage
            crop={crop} district={district} quantity={qty}
            marketData={marketData} farmContext={farmContext}
            loading={loading}
          />
        )}
        {activeStage === 'compare' && (
          <CompareStage
            crop={crop} district={district} quantity={qty}
            rankedMandis={rankedMandis} skippedMarkets={skippedMarkets}
            decision={decision} loading={loading}
          />
        )}
        {activeStage === 'decide' && (
          <DecideStage
            crop={crop} district={district} quantity={qty} grade={grade}
            pathwayData={pathwayData} loading={loading}
            onFindBuyers={() => goStage('connect')}
          />
        )}
        {activeStage === 'connect' && (
          <ConnectStage
            crop={crop} district={district} quantity={qty} grade={grade}
            marketData={marketData} pathwayData={pathwayData}
          />
        )}
        {activeStage === 'sell' && (
          <SellStage
            crop={crop} district={district} quantity={qty} grade={grade}
            marketData={marketData} pathwayData={pathwayData}
          />
        )}
      </div>

      {/* ── Guided step footer: every analyzed stage ends with its explicit
          next step (Back / Continue), so the journey reads as one line. ── */}
      {(hasAnalyzed || marketData) && (
        <StageNav active={activeStage} unlocked={stageUnlocked} onGo={goStage} />
      )}
    </PageTransition>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 1: INFORM
// ══════════════════════════════════════════════════════════════════════════
const InformStage: React.FC<{
  crop: string; district: string; quantity: number;
  marketData: any; farmContext: any; loading: boolean;
}> = ({ crop, district, quantity, marketData, farmContext, loading }) => {
  const { t } = useTranslation();
  const rankedMandis = marketData?.rankedMandis || [];
  const provenance = marketData?.marketProvenance || marketData?.provenance;
  const weatherData = farmContext?.weatherContext;
  const weatherAg = farmContext?.weatherAgriculturalContext;
  const soil = farmContext?.soilContext;
  const suitability = farmContext?.cropSuitability;
  const season = farmContext?.seasonContext;
  const relevance = farmContext?.districtCropRelevance;
  const coverage = farmContext?.marketCoverageSummary;
  const coordPrecision = farmContext?.coordinates?.precision;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold text-stone-900">{t('decision.inform.title', { crop, district })}</h2>
        {loading && <span className="text-xs text-stone-400">{t('common.loading')}</span>}
      </div>

      {/* ── FARM CONTEXT CARD — truth labels per row ──────────────────── */}
      <Card className="p-5 !border-emerald-200 bg-emerald-50/30">
        <SectionLabel tone="emerald" className="mb-4">{t('decision.inform.farmContext')}</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          {/* Location */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.location')}</p>
            <p className="font-medium text-stone-800 flex flex-wrap items-center gap-1">
              <MapPin size={12} className="text-emerald-600" />
              {farmContext?.district || district}
            </p>
            {coordPrecision === 'FARM_EXACT' && <DataTag label="FARM LOCATION" tone="emerald" />}
            {coordPrecision === 'DISTRICT_REFERENCE' && <DataTag label="DISTRICT REFERENCE" tone="stone" />}
          </div>
          {/* Crop */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.crop')}</p>
            <p className="font-medium text-stone-800">{farmContext?.crop || crop}</p>
          </div>
          {/* Season */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.season')}</p>
            {season ? (
              <p className="font-medium text-stone-800">
                {season.label}
                <span className="ml-1 text-[10px] text-stone-400">{season.months}</span>
              </p>
            ) : (
              <p className="text-stone-400 italic">Unknown</p>
            )}
            <DataTag label="REFERENCE" tone="stone" />
          </div>
          {/* Soil */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.soil')}</p>
            {soil?.type ? (
              <p className="font-medium text-stone-800">{soil.type}</p>
            ) : (
              <p className="text-stone-400 italic">No soil reference available</p>
            )}
            <DataTag label="REFERENCE" tone="stone" />
          </div>
          {/* Crop suitability — derived, never presented as measured truth */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.cropSuitability')}</p>
            {suitability ? (
              <div>
                <p className="font-medium text-stone-800">
                  {suitability.status === 'SUITABLE' && <span className='flex items-center gap-1'><Check size={13} className='text-emerald-600' /> Suitable</span>}
                  {suitability.status === 'CONDITIONALLY_SUITABLE' && <span className='flex items-center gap-1'><AlertTriangle size={13} className='text-amber-600' /> Conditionally suitable</span>}
                  {suitability.status === 'INSUFFICIENT_EVIDENCE' && '? Insufficient evidence'}
                  {suitability.status === 'UNKNOWN' && 'Unknown'}
                </p>
                {suitability.reason && (
                  <p className="text-[10px] text-stone-400 mt-0.5">{suitability.reason}</p>
                )}
              </div>
            ) : (
              <p className="text-stone-400 italic">No crop context available</p>
            )}
            <DataTag label="DERIVED" tone="sky" />
          </div>
          {/* District × crop relevance */}
          {relevance && (
            <div>
              <p className="text-xs text-stone-400 mb-0.5">Regional relevance</p>
              <p className="font-medium text-stone-800">
                {relevance.status === 'MAJOR' && <span className='flex items-center gap-1'><Star size={13} className='text-amber-500' fill='currentColor' /> Major producing region</span>}
                {relevance.status === 'COMMON' && 'Common crop'}
                {relevance.status === 'CONDITIONAL' && 'Conditional'}
                {relevance.status === 'UNKNOWN' && 'No specific data'}
              </p>
              {relevance.reason && (
                <p className="text-[10px] text-stone-400 mt-0.5">{relevance.reason}</p>
              )}
            </div>
          )}
          {/* Weather — live observation */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.weather')}</p>
            {weatherData ? (
              <div>
                <p className="font-medium text-stone-800">
                  {weatherData.temperature}°C
                  {weatherData.condition && <span className="ml-1 text-xs text-stone-500 capitalize">{weatherData.condition}</span>}
                </p>
                <p className="text-[10px] text-stone-400">
                  {weatherData.humidity != null && <>Humidity {weatherData.humidity}%</>}
                  {weatherData.windSpeed != null && <> · Wind {weatherData.windSpeed} km/h</>}
                </p>
                {weatherAg && weatherAg.status !== 'NO_ALERT' && weatherAg.status !== 'INSUFFICIENT_DATA' && (
                  <div className="mt-1">
                    {weatherAg.flags?.map((f: any, i: number) => (
                      <p key={i} className={`text-[10px] ${f.severity === 'WARNING' ? 'text-red-600' : 'text-amber-600'}`}>• {f.message}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-stone-400 italic">Weather unavailable</p>
            )}
            <DataTag label="FACT" tone="emerald" />
          </div>
          {/* Market coverage — historical observations */}
          <div>
            <p className="text-xs text-stone-400 mb-0.5">{t('decision.inform.marketCoverage')}</p>
            {coverage ? (
              <p className="font-medium text-stone-800">
                {coverage.observations} observation{coverage.observations !== 1 ? 's' : ''}
                {coverage.districtHasData ? '' : ' (not in this district)'}
              </p>
            ) : rankedMandis.length > 0 ? (
              <p className="font-medium text-stone-800">{rankedMandis.length} market{rankedMandis.length !== 1 ? 's' : ''} ranked</p>
            ) : (
              <p className="text-stone-400 italic">No current observation</p>
            )}
            <DataTag label="HISTORICAL" tone="stone" />
          </div>
        </div>
        {/* Provenance footer */}
        <div className="mt-4 pt-3 border-t border-emerald-100 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-400 items-center">
          {farmContext?.classification && <span><SourceTag source={farmContext.classification} /> Context classification</span>}
          <span>Sources: district registry + crop catalog + soil reference + AGMARKNET</span>
        </div>
      </Card>

      {/* Data source */}
      {provenance && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <SourceTag source={provenance.source || marketData?.marketSource || ''} />
          <span>Source: {provenance.source || marketData?.marketSource || 'unknown'}</span>
          {provenance.retrievedAt && <span>· Retrieved {new Date(provenance.retrievedAt).toLocaleString('en-IN')}</span>}
          {provenance.ageHours != null && <span>· {provenance.ageHours}h old</span>}
          {provenance.note && <span className="italic">· {provenance.note}</span>}
        </div>
      )}

      {/* Data provenance — what is real, what is catalog */}
      <DataProvenance crop={crop} district={district} quantity={quantity} />

      {/* Market prices */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-700">Current mandi prices ({crop})</h3>
          <DataTag label={marketData?.servingMode === 'FALLBACK' ? 'FALLBACK' : 'SERVED'} tone={marketData?.servingMode === 'FALLBACK' ? 'amber' : 'emerald'} />
        </div>
        {rankedMandis.length === 0 ? (
          <EmptyState
            title={t('decision.inform.noMarketData')}
            description={t('decision.inform.noMarketDataDesc')}
          />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                  <th className="pb-2 pr-4 font-semibold">Market</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Headline</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Est. net/q</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Distance</th>
                  <th className="pb-2 font-semibold">Freshness</th>
                </tr>
              </thead>
              <tbody>
                {rankedMandis.slice(0, 8).map((m: any, i: number) => (
                  <tr key={i} className="border-b border-stone-100 last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-stone-800">{m.market}</span>
                      {m.rank === 1 && <Chip color="emerald" className="ml-2">#1</Chip>}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular">{inr(m.grossPricePerQuintal)}/q</td>
                    <td className="py-2.5 pr-4 text-right font-medium text-emerald-700 tabular">{inr(m.farmerNetPerQuintal)}/q</td>
                    <td className="py-2.5 pr-4 text-right text-stone-500">
                      <span className="tabular">{m.distanceKm} km</span>
                      <span className={`block text-[10px] ${m.distanceSource === 'DOCUMENTED_ROAD' ? 'text-stone-400' : 'text-amber-600'}`}>
                        {m.distanceSource === 'DOCUMENTED_ROAD' ? 'Documented road' : 'Estimated'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {m.evidence?.arrivalDate && <span className="text-xs text-stone-400 tabular">Quote: {m.evidence.arrivalDate}</span>}
                      {m.evidence?.retrievedAt && <span className="text-xs text-stone-400 ml-2 tabular">Retrieved: {new Date(m.evidence.retrievedAt).toLocaleDateString('en-IN')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Key insight */}
      {rankedMandis.length >= 2 && (
        <Card className="p-4 !border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={15} className="text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Key insight</p>
          </div>
          <p className="text-xs text-amber-700">
            {rankedMandis[0]?.market} has the highest estimated net at {inr(rankedMandis[0]?.farmerNetPerQuintal)}/q.
            {rankedMandis[0]?.market !== rankedMandis.find((m: any) => m.grossPricePerQuintal === Math.max(...rankedMandis.map((x: any) => x.grossPricePerQuintal)))?.market
              ? ` The highest headline price is at a different market — transport costs change the economics.`
              : ` It also has the highest headline price in today's data.`
            }
          </p>
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 2: COMPARE
// ══════════════════════════════════════════════════════════════════════════
const CompareStage: React.FC<{
  crop: string; district: string; quantity: number;
  rankedMandis: any[]; skippedMarkets: any[]; decision: any; loading: boolean;
}> = ({ crop, district, quantity, rankedMandis, skippedMarkets, decision, loading }) => {
  const { t } = useTranslation();
  const withoutWith = decision?.withoutWith;
  const closeCall = decision?.closeCall;
  const robustness = decision?.robustness;
  const confidence = decision?.confidence;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold text-stone-900">{t('decision.compare.title', { crop, district, quantity: String(quantity) })}</h2>
        {loading && <span className="text-xs text-stone-400">{t('common.loading')}</span>}
      </div>

      {/* WITHOUT vs WITH Kisan360 */}
      {withoutWith && (
        <Card className="p-5 !border-emerald-200">
          <SectionLabel tone="emerald" className="mb-3">
            {withoutWith.differencePerQuintal === 0 ? 'Confirms the obvious choice with evidence' : 'The highest headline price is NOT the best net'}
          </SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border ${withoutWith.differencePerQuintal === 0 ? 'bg-stone-50 border-stone-200' : 'bg-red-50/60 border-red-200'}`}>
              <p className="text-[10px] uppercase text-stone-500 font-semibold">Without Kisan360</p>
              <p className="text-base font-bold text-stone-800 mt-1">{withoutWith.naive.market}</p>
              <p className="text-xs text-stone-600 mt-1">Headline: <span className="tabular">{inr(withoutWith.naive.headlinePerQuintal)}/q</span></p>
              <p className="text-xs text-stone-600">You take home: <span className="tabular">{inr(withoutWith.naive.netTotal)}</span></p>
              <p className="text-[10px] text-stone-400 mt-1">choice: {withoutWith.naive.basis}</p>
            </div>
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70">
              <p className="text-[10px] uppercase text-emerald-600 font-semibold">With Kisan360</p>
              <p className="text-base font-bold text-emerald-800 mt-1">{withoutWith.recommended.market}</p>
              <p className="text-xs text-stone-600 mt-1">Estimated net: <span className="tabular">{inr(withoutWith.recommended.netPerQuintal)}/q</span></p>
              <p className="text-xs text-stone-600">You take home: <span className="tabular">{inr(withoutWith.recommended.netTotal)}</span></p>
              <p className="text-[10px] text-emerald-600 mt-1">choice: {withoutWith.recommended.basis}</p>
            </div>
          </div>
          {withoutWith.differencePerQuintal !== 0 && (
            <p className="text-base font-bold text-emerald-700 mt-3 tabular">
              Difference: {inr(withoutWith.differenceLotTotal)} on this lot ({inrExact(withoutWith.differencePerQuintal)}/q)
            </p>
          )}
          {withoutWith.message && <p className="text-xs text-stone-500 mt-1">{withoutWith.message}</p>}
        </Card>
      )}

      {/* Confidence + robustness */}
      <div className="grid sm:grid-cols-2 gap-4">
        {confidence && (
          <Card className="p-4">
            <p className="text-[10px] uppercase text-stone-500 font-semibold mb-2">Evidence confidence</p>
            <ConfidenceChip level={confidence.level} />
            {confidence.goodSignals?.map((s: string, i: number) => <p key={i} className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1"><Check size={12} className='text-emerald-600 shrink-0' /> {s}</p>)}
            {confidence.watchSignals?.map((s: string, i: number) => <p key={i} className="text-[11px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={12} className='text-amber-500 shrink-0' /> {s}</p>)}
          </Card>
        )}
        {robustness && (
          <Card className="p-4">
            <p className="text-[10px] uppercase text-stone-500 font-semibold mb-2">Robustness</p>
            <Chip color={robustness.verdict === 'ROBUST' ? 'emerald' : 'amber'}>{robustness.verdict}</Chip>
            {robustness.scenarios?.map((s: any, i: number) => (
              <p key={i} className={`text-[11px] mt-1 ${s.sameWinner ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className='flex items-center gap-1'>{s.sameWinner ? <Check size={12} className='text-emerald-600 shrink-0' /> : <AlertTriangle size={12} className='text-amber-500 shrink-0' />} {s.scenario}: {s.bestMandi || 'N/A'}</span>
              </p>
            ))}
          </Card>
        )}
      </div>

      {/* Full ranked table */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">All markets — ranked by your net</h3>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500 border-b border-stone-200">
                <th className="pb-2 pr-2 font-semibold">#</th>
                <th className="pb-2 pr-4 font-semibold">Market</th>
                <th className="pb-2 pr-4 text-right font-semibold">Headline</th>
                <th className="pb-2 pr-4 text-right font-semibold">Transport</th>
                <th className="pb-2 pr-4 text-right font-semibold">Storage</th>
                <th className="pb-2 pr-4 text-right font-semibold">Other</th>
                <th className="pb-2 pr-4 text-right font-semibold">Net/q</th>
                <th className="pb-2 pr-4 text-right font-semibold">Lot total</th>
                <th className="pb-2 font-semibold">Why?</th>
              </tr>
            </thead>
            <tbody>
              {rankedMandis.map((m: any) => (
                <tr key={m.rank} className={`border-b border-stone-100 last:border-0 ${m.rank === 1 ? 'bg-emerald-50/50' : ''}`}>
                  <td className="py-2.5 pr-2 text-xs text-stone-400 tabular">{m.rank}</td>
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-stone-800">{m.market}</span>
                    <span className="text-[10px] text-stone-400 ml-1 tabular">
                      {m.distanceKm}km {m.distanceSource === 'DOCUMENTED_ROAD' ? '' : '(est.)'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular">{inr(m.grossPricePerQuintal)}</td>
                  <td className="py-2.5 pr-4 text-right text-red-600 tabular">-{inr(m.farmerCosts?.transportPerQuintal)}</td>
                  <td className="py-2.5 pr-4 text-right text-red-600 tabular">-{inr(m.farmerCosts?.storagePerQuintal)}</td>
                  <td className="py-2.5 pr-4 text-right text-red-600 tabular">-{inr(m.farmerCosts?.otherPerQuintal)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-emerald-700 tabular">{inr(m.farmerNetPerQuintal)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium tabular">{inr(m.farmerNetTotal)}</td>
                  <td className="py-2.5 text-[11px] text-stone-500 max-w-[200px] truncate">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Skipped markets */}
      {skippedMarkets.length > 0 && (
        <Card className="p-4">
          <p className="text-xs uppercase text-stone-500 font-semibold mb-2">Excluded markets ({skippedMarkets.length})</p>
          <ul className="text-xs text-stone-500 space-y-0.5">
            {skippedMarkets.map((s: any, i: number) => (
              <li key={i}>• {s.market} ({inr(s.grossPricePerQuintal)}/q) — {s.reason}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Close call */}
      {closeCall?.isCloseCall && (
        <Card className="p-3 !border-amber-200 bg-amber-50/50">
          <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle size={13} className='text-amber-500 shrink-0' /> {closeCall.message}</p>
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 3: DECIDE — the flagship decision surface
// ══════════════════════════════════════════════════════════════════════════
const PATHWAY_META: Record<string, { icon: React.ElementType; color: string }> = {
  SELL_NOW: { icon: Wallet, color: 'emerald' },
  STORE_THEN_SELL: { icon: Warehouse, color: 'amber' },
  AGGREGATE_THROUGH_FPO: { icon: Users, color: 'teal' },
  ALTERNATIVE_MARKET: { icon: Store, color: 'sky' },
};

const DecideStage: React.FC<{
  crop: string; district: string; quantity: number; grade: string;
  pathwayData: any; loading: boolean; onFindBuyers: () => void;
}> = ({ crop, district, quantity, grade, pathwayData, loading, onFindBuyers }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const pathways = pathwayData?.pathways || [];
  const recommendation = pathwayData?.recommendation;
  const economicSummary = pathwayData?.economicSummary;
  const dataBasis = pathwayData?.dataBasis;
  const nextAction = pathwayData?.nextAction;
  const outcome = pathwayData?.outcome;
  const perishability = pathwayData?.perishability;
  const decisionTrace = pathwayData?.decisionTrace;
  const unknowns = pathwayData?.unknowns || [];
  const assumptions = pathwayData?.assumptions || [];

  const recPathway = recommendation && pathways.find((p: any) => p.pathway === recommendation.pathway);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <CropIcon cropName={crop} size={15} />
        </span>
        <h2 className="font-display text-lg font-bold text-stone-900">{t('decision.decide.title')}</h2>
        <span className="text-xs text-stone-500 hidden sm:inline">· {crop} · {district} · {quantity}q</span>
        {loading && <span className="text-xs text-stone-400">{t('common.loading')}</span>}
      </div>

      {pathways.length === 0 && !loading && (
        <Card className="p-6">
          <EmptyState
            title={t('decision.decide.insufficientEvidence')}
            description={t('decision.decide.insufficientEvidenceDesc')}
          />
        </Card>
      )}

      {/* ── ECONOMIC BEST vs RECOMMENDED PATHWAY — the core distinction ── */}
      {economicSummary && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <SectionLabel tone="stone">{t('decision.decide.bestModeledEconomics')}</SectionLabel>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-3xl font-extrabold text-stone-900 tabular">{inr(economicSummary.bestNetPerQuintal)}/q</p>
              <DataTag label="MODELED NET" tone="sky" />
            </div>
            <p className="text-sm font-semibold text-stone-700 mt-1">{economicSummary.bestMarket}</p>
            <p className="text-xs text-stone-500 mt-1">
              {inr(economicSummary.bestNetTotal)} for this {quantity}q lot, after selling costs
            </p>
            <p className="text-[11px] text-stone-400 mt-2 leading-relaxed">
              Highest modeled <em>direct</em> net realization. This is what the calculator ranks — before
              options like pooling change the economics.
            </p>
          </Card>
          <Card className="p-5 !border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-white">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel tone="emerald">{t('decision.decide.recommendedPath')}</SectionLabel>
              {recommendation && <Chip color="emerald">RECOMMENDED</Chip>}
            </div>
            <p className="font-display text-xl font-bold text-emerald-900 mt-2">
              {recPathway?.label || recommendation?.pathway}
            </p>
            {economicSummary.recommendedMarket && (
              <p className="text-sm text-emerald-700 mt-0.5">at {economicSummary.recommendedMarket}</p>
            )}
            {recommendation && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-stone-500">Evidence confidence:</span>
                <ConfidenceChip level={recommendation.confidence} />
              </div>
            )}
            <ul className="text-xs text-emerald-800 mt-3 space-y-1">
              {recommendation?.why?.map((w: string, i: number) => <li key={i} className="flex gap-1.5"><CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />{w}</li>)}
            </ul>
            {recommendation?.note && <p className="text-[11px] text-emerald-600 mt-2 italic">{recommendation.note}</p>}
          </Card>
        </div>
      )}

      {/* Why they may differ — the honest explanation */}
      {economicSummary?.reasonForDifference && (
        <Card className="p-4 !border-sky-200 bg-sky-50/50">
          <div className="flex items-start gap-2.5">
            <Info size={15} className="text-sky-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-sky-800">Why the best economics and the recommended pathway can differ</p>
              <p className="text-xs text-sky-700 mt-0.5">{economicSummary.reasonForDifference}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ── NEXT ACTION — make the recommended action obvious ─────────── */}
      {nextAction && (
        <Card className="p-4 !border-emerald-300 bg-emerald-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <ArrowRight size={18} />
              </div>
              <div className="min-w-0">
                <SectionLabel tone="emerald">{t('decision.decide.nextAction')}</SectionLabel>
                <p className="text-sm font-bold text-emerald-900 mt-0.5">
                  {nextAction.type === 'CREATE_LOT' ? 'Create a lot' : nextAction.type}
                  {nextAction.market && ` — ${nextAction.market}`}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">{nextAction.reason}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <GhostButton onClick={onFindBuyers} className="!py-2 !px-3.5 !text-xs !min-h-0 !border-emerald-300 !text-emerald-800">
                Find buyers <ArrowRight size={13} />
              </GhostButton>
              <PrimaryButton
                onClick={() => {
                  const params = new URLSearchParams({
                    prefill: '1',
                    crop, district,
                    quantity: String(quantity),
                    grade,
                    mandi: economicSummary?.bestMarket || nextAction?.market || '',
                    net: String(economicSummary?.bestNetPerQuintal || ''),
                  });
                  navigate(`/trade?${params}`);
                }}
                className="!py-2 !px-3.5 !text-xs !min-h-0"
              >
                Create lot in Trade <ArrowRight size={13} />
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* ── PATHWAY OPTIONS ───────────────────────────────────────────── */}
      {pathways.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-stone-900">Pathway options</p>
            <span className="text-[11px] text-stone-400">All options are evidence-graded, not guaranteed outcomes</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pathways.map((p: any) => {
              const isRec = recommendation?.pathway === p.pathway;
              const meta = PATHWAY_META[p.pathway] || { icon: Info, color: 'stone' };
              const Icon = meta.icon;
              return (
                <Card key={p.pathway} spotlight className={`p-5 ${isRec ? '!border-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/30' : ''}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-9 w-9 rounded-lg ${isRec ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'} flex items-center justify-center shrink-0`}>
                      <Icon size={16} />
                    </div>
                    <h3 className="text-sm font-bold text-stone-800">{p.label}</h3>
                    {isRec && <Chip color="emerald" className="ml-auto">RECOMMENDED</Chip>}
                    {p.available === false && <Chip color="stone" className="ml-auto">N/A</Chip>}
                  </div>
                  <p className="text-[11px] text-stone-500 mb-3 leading-relaxed">{p.description}</p>

                  {p.pathway === 'SELL_NOW' && p.estimatedNetPerQuintal != null && (
                    <div className="mb-3">
                      <p className="text-[10px] uppercase text-stone-500 font-semibold">Estimated net</p>
                      <p className="text-xl font-extrabold text-stone-900 tabular">{inr(p.estimatedNetPerQuintal)}/q</p>
                      <p className="text-xs text-stone-600 tabular">{inr(p.estimatedNetTotal)} for {quantity}q at {p.mandi}</p>
                    </div>
                  )}
                  {p.pathway === 'AGGREGATE_THROUGH_FPO' && p.pooledNetPerQuintal != null && (
                    <div className="mb-3">
                      <p className="text-[10px] uppercase text-stone-500 font-semibold">Pooled net estimate</p>
                      <p className="text-xl font-extrabold text-emerald-800 tabular">{inr(p.pooledNetPerQuintal)}/q</p>
                      <p className="text-xs text-stone-600 tabular">{inr(p.pooledNetTotal)} for the pooled lot</p>
                      {p.isBulkQualified && <Chip color="teal" className="mt-1">BULK QUALIFIED</Chip>}
                    </div>
                  )}
                  {p.pathway === 'ALTERNATIVE_MARKET' && p.estimatedNetPerQuintal != null && (
                    <div className="mb-3">
                      <p className="text-[10px] uppercase text-stone-500 font-semibold">Estimated net</p>
                      <p className="text-xl font-extrabold text-stone-900 tabular">{inr(p.estimatedNetPerQuintal)}/q</p>
                      <p className="text-xs text-stone-600 tabular">{inr(p.estimatedNetTotal)} for {quantity}q at {p.mandi}</p>
                    </div>
                  )}
                  {p.pathway === 'STORE_THEN_SELL' && (
                    <div className="mb-3 space-y-2">
                      {p.currentNetPerQuintal != null && (
                        <div>
                          <p className="text-[10px] uppercase text-stone-500 font-semibold">Sell now baseline</p>
                          <p className="text-xl font-extrabold text-stone-900 tabular">{inr(p.currentNetPerQuintal)}/q</p>
                        </div>
                      )}
                      {p.breakevenPricePerQuintal && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-800">
                            Future net price needed to outperform selling now: <strong className="tabular">{inr(p.breakevenPricePerQuintal)}/q</strong>
                          </p>
                          {p.advantageNeeded != null && (
                            <p className="text-[11px] text-amber-600 mt-0.5">
                              Price increase needed: {inr(p.advantageNeeded)}/q — a threshold, not a prediction
                            </p>
                          )}
                        </div>
                      )}
                      {p.storageOption && (
                        <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                          <p className="text-[11px] text-stone-600">
                            Storage: <strong>{p.storageOption.label || p.storageOption.name || 'Option available'}</strong>
                            {p.storageOption.district && <span className="text-stone-400"> · {p.storageOption.district}</span>}
                            {p.storageOption.costPerQuintalPerDay != null && (
                              <span className="text-stone-500"> · {inr(p.storageOption.costPerQuintalPerDay)}/q/day</span>
                            )}
                            {p.storageOption.maxDurationDays != null && (
                              <span className="text-stone-500"> · up to {p.storageOption.maxDurationDays} days</span>
                            )}
                          </p>
                          {p.storageOption.availability && p.storageOption.availability !== 'AVAILABLE' && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Availability: {String(p.storageOption.availability)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {p.transportSavingPerQuintal > 0 && (
                    <div className="mb-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                      <p className="text-xs text-emerald-700 font-medium tabular">
                        Transport saving: {inr(p.transportSavingPerQuintal)}/q ({inr(p.transportSavingTotal)} on this lot)
                      </p>
                    </div>
                  )}

                  <ul className="text-[11px] text-stone-600 space-y-0.5 mb-2">
                    {p.why?.map((w: string, i: number) => <li key={i} className="flex gap-1.5"><span className="text-emerald-600">•</span>{w}</li>)}
                  </ul>

                  {p.evidence && p.evidence.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-stone-400 cursor-pointer hover:text-stone-600">
                        Evidence ({p.evidence.length} items)
                      </summary>
                      <ul className="text-[10px] text-stone-400 mt-1 space-y-0.5 ml-1">
                        {p.evidence.map((e: any, i: number) => (
                          <li key={i} className="flex flex-wrap gap-1 items-center">
                            <DataTag label={e.classification || e.type || 'EVIDENCE'} tone={e.classification?.includes('DEMO') ? 'amber' : 'stone'} />
                            <span>{e.source} {e.mandi ? `· ${e.mandi}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {p.assumptions && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-stone-400 cursor-pointer hover:text-stone-600">Assumptions</summary>
                      <ul className="text-[10px] text-stone-400 mt-0.5 space-y-0.5 ml-1">
                        {p.assumptions.map((a: string, i: number) => <li key={i}>• {a}</li>)}
                      </ul>
                    </details>
                  )}

                  {p.pathway === 'SELL_NOW' && (
                    <button onClick={onFindBuyers} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 btn-primary text-xs">
                      Find buyers for {p.mandi || 'this market'} <ArrowRight size={13} />
                    </button>
                  )}
                  {p.pathway === 'AGGREGATE_THROUGH_FPO' && (
                    <button onClick={() => navigate('/fpo')} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 btn-primary text-xs">
                      Pool with FPO <ArrowRight size={13} />
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PERISHABILITY AWARENESS (STORE) — separate from economics ─── */}
      {perishability && perishability.riskLevel && (
        <Card className={`p-4 ${perishability.riskLevel === 'HIGH' || perishability.riskLevel === 'CRITICAL' ? '!border-red-200 bg-red-50/50' : '!border-stone-200 bg-stone-50'}`}>
          <div className="flex items-start gap-2.5">
            <Warehouse size={15} className={`${perishability.riskLevel === 'HIGH' || perishability.riskLevel === 'CRITICAL' ? 'text-red-600' : 'text-stone-500'} mt-0.5 shrink-0`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-stone-800">Perishability awareness</p>
                <DataTag label={perishability.riskLevel} tone={perishability.riskLevel === 'HIGH' || perishability.riskLevel === 'CRITICAL' ? 'red' : 'stone'} />
                {perishability.shelfLife && (
                  <span className="text-[11px] text-stone-500 tabular">
                    Shelf-life reference: {perishability.shelfLife.min}–{perishability.shelfLife.max} days
                  </span>
                )}
              </div>
              {perishability.guidance && <p className="text-[11px] text-stone-600 mt-0.5">{perishability.guidance}</p>}
              <p className="text-[10px] text-stone-400 mt-1">
                Perishability is an awareness layer — it does not modify pathway ranking or economic calculations, and it is not a spoilage forecast.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── OUTCOME STRIP — estimated advantages, honestly labeled ─────── */}
      {outcome && (
        <Card className="p-4 !border-teal-200 bg-teal-50/40">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase text-stone-500 font-semibold">Reference net</p>
              <p className="font-bold text-stone-900 tabular">{inr(outcome.referenceNetPerQuintal)}/q</p>
              <p className="text-[10px] text-stone-400">{outcome.referenceMarket}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-stone-500 font-semibold">Pooling advantage</p>
              <p className="font-bold text-teal-700 tabular">{inr(outcome.pooledVsIndividualDifference)}</p>
              <p className="text-[10px] text-stone-400">vs individual lot</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-stone-500 font-semibold">Compatible buyers</p>
              <p className="font-bold text-stone-900 tabular">{outcome.compatibleBuyerOptions}</p>
              <p className="text-[10px] text-stone-400">in directory</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-stone-500 font-semibold">Pathways available</p>
              <p className="font-bold text-stone-900 tabular">{outcome.pathwaysAvailable}</p>
              <p className="text-[10px] text-stone-400">for this lot</p>
            </div>
          </div>
          {outcome.note && <p className="text-[10px] text-teal-700 mt-2 italic">{outcome.note}</p>}
        </Card>
      )}

      {/* Evidence basis — short and farmer-facing, no rule trace */}
      {dataBasis && Object.keys(dataBasis).length > 0 && (
        <Card className="p-4">
          <SectionLabel tone="stone" className="mb-2">Where these numbers come from</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
            {Object.entries(dataBasis).map(([k, v]) => (
              <p key={k} className="text-[11px] text-stone-500 flex items-center gap-1.5">
                <span className="capitalize text-stone-600 font-medium">{k.replace(/_/g, ' ')}:</span>
                {String(v)}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* Unknowns — stated honestly, not hidden */}
      {unknowns.length > 0 && (
        <Card className="p-4 !border-amber-200 bg-amber-50/40">
          <SectionLabel tone="amber" className="mb-1.5">What is not known</SectionLabel>
          <ul className="text-[11px] text-amber-800 space-y-0.5">
            {unknowns.map((u: string, i: number) => <li key={i}>• {u}</li>)}
          </ul>
        </Card>
      )}

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <Card className="p-4">
          <SectionLabel tone="stone" className="mb-1.5">Assumptions behind these numbers</SectionLabel>
          <ul className="text-[11px] text-stone-500 space-y-0.5">
            {assumptions.map((a: string, i: number) => <li key={i}>• {a}</li>)}
          </ul>
        </Card>
      )}

      {/* Data basis */}
      {dataBasis && (
        <Card className="p-4">
          <SectionLabel tone="stone" className="mb-2">Data basis</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Object.entries(dataBasis).map(([k, v]) => (
              <div key={k} className="text-[11px] flex items-start gap-1.5">
                <span className="text-stone-500 capitalize min-w-0">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <SourceTag source={String(v)} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 4: CONNECT
// ══════════════════════════════════════════════════════════════════════════
const ConnectStage: React.FC<{
  crop: string; district: string; quantity: number; grade: string;
  marketData: any; pathwayData: any;
}> = ({ crop, district, quantity, grade, marketData, pathwayData }) => {
  const navigate = useNavigate();
  const [buyers, setBuyers] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const bestMandi = marketData?.rankedMandis?.[0];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [bRes, rRes] = await Promise.all([
          apiFetch(`${API_URL}/buyers?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}`),
          apiFetch(`${API_URL}/buyers/requirements?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&quantity=${quantity}&grade=${grade}`),
        ]);
        const bData = await bRes.json();
        const rData = await rRes.json();
        if (bData.success) setBuyers(bData.buyers || []);
        if (rData.success) setRequirements(rData.requirements || rData.compatible || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [crop, district, quantity, grade]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold text-stone-900">Connect: find buyers</h2>
        {loading && <span className="text-xs text-stone-400">Loading…</span>}
      </div>

      <p className="text-xs text-stone-500 flex items-center gap-2">
        <DataTag label="DEMO" tone="amber" /> Buyer directory is a static demo dataset — production would verify against live buyer profiles.
      </p>

      {/* Compatible requirements */}
      {requirements.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-3">Compatible buyer requirements ({requirements.length})</h3>
          <div className="space-y-3">
            {requirements.map((r: any, i: number) => (
              <div key={i} className="p-3.5 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-medium text-stone-800">{r.buyerName || r.label}</span>
                  <Chip color={r.overallCompatibility === 'STRONG' ? 'emerald' : r.overallCompatibility === 'PARTIAL' ? 'amber' : 'stone'}>
                    {r.overallCompatibility === 'STRONG' ? 'STRONG (self-declared)' : r.overallCompatibility === 'PARTIAL' ? 'PARTIAL (self-declared)' : r.overallCompatibility}
                  </Chip>
                </div>
                <div className="text-[11px] text-stone-600 space-y-0.5">
                  <p>Crop: {r.crop} · Quantity: {quantityRangeQuintals(r.quantityRange?.min || 0, r.quantityRange?.max ?? null)}</p>
                  <p>Service: {r.serviceDistricts?.join(', ')}</p>
                  {r.qualityMatch && <p>Quality: {r.qualityMatch.matchLevel === 'MATCH' ? 'SELF-DECLARED MATCH' : r.qualityMatch.matchLevel} — {r.qualityMatch.reasons?.join('; ')}{r.qualityMatch.matchLevel === 'MATCH' ? ' (based on your declared values, not independently verified)' : ''}</p>}
                  {r.paymentTerms && <p>Payment: {r.paymentTerms}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Buyers — trust tiers shown exactly as the backend labels them */}
      {buyers.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-3">Buyer directory ({buyers.length})</h3>
          <div className="space-y-2">
            {buyers.map((b: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2.5 border border-stone-100 rounded-lg hover:bg-stone-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800">{b.name}</p>
                  <p className="text-[11px] text-stone-500">{b.crops?.join(', ')} · {b.districts?.join(', ')}</p>
                </div>
                <Chip color={b.trustTier === 'SOURCE_VERIFIED' || b.trustTier === 'REAL_VERIFIED' ? 'emerald' : b.trustTier === 'DEMO_VERIFIED' ? 'amber' : 'stone'}>
                  {b.trustTier}
                </Chip>
              </div>
            ))}
          </div>
        </Card>
      )}

      {requirements.length === 0 && buyers.length === 0 && !loading && (
        <Card className="p-6">
          <EmptyState
            title="No compatible buyer listed"
            description={`The Kisan360 buyer directory does not currently list a compatible buyer for ${crop} in ${district}. Try changing the crop, district, or quantity.`}
          />
        </Card>
      )}

      {/* Next step CTA */}
      <Card className="p-4 !border-emerald-200 bg-emerald-50/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-stone-800">Ready to sell?</p>
          <PrimaryButton
            onClick={() => {
              const params = new URLSearchParams({
                prefill: '1', crop, district,
                quantity: String(quantity), grade,
              });
              // Carry the engine's recommendation so Trade opens on the same
              // decision (mandi + net reference), not a blank context.
              if (bestMandi?.market) params.set('mandi', bestMandi.market);
              if (bestMandi?.farmerNetPerQuintal != null) params.set('net', String(bestMandi.farmerNetPerQuintal));
              navigate(`/trade?${params}`);
            }}
            icon={ArrowRight}
            className="!text-xs !py-2 !px-3.5"
          >
            Go to Trade
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 5: SELL
// ══════════════════════════════════════════════════════════════════════════
const SellStage: React.FC<{
  crop: string; district: string; quantity: number; grade: string;
  marketData: any; pathwayData: any;
}> = ({ crop, district, quantity, grade, marketData, pathwayData }) => {
  const navigate = useNavigate();
  const bestMandi = marketData?.rankedMandis?.[0];
  const recommendation = pathwayData?.recommendation;

  const goToTrade = () => {
    // Pass the decision context to the trade page via URL params
    const params = new URLSearchParams({
      prefill: '1',
      crop,
      district,
      quantity: String(quantity),
      grade,
      mandi: bestMandi?.market || '',
      net: String(bestMandi?.farmerNetPerQuintal || ''),
    });
    navigate(`/trade?${params}`);
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-bold text-stone-900">Sell: execute the decision</h2>

      {/* Decision summary */}
      <Card className="p-5 !border-emerald-200">
        <SectionLabel tone="emerald" className="mb-3">Your decision</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-stone-500 text-xs">Crop</p>
            <p className="font-medium text-stone-800">{crop}</p>
          </div>
          <div>
            <p className="text-stone-500 text-xs">District</p>
            <p className="font-medium text-stone-800">{district}</p>
          </div>
          <div>
            <p className="text-stone-500 text-xs">Quantity</p>
            <p className="font-medium text-stone-800">
              <Quantity value={quantity} unit="quintals" stack />
            </p>
          </div>
          <div>
            <p className="text-stone-500 text-xs">Grade</p>
            <p className="font-medium text-stone-800">{grade}</p>
          </div>
        </div>
        {bestMandi && (
          <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <p className="text-xs text-emerald-700">
              Recommended market: <strong>{bestMandi.market}</strong> — estimated net {inr(bestMandi.farmerNetPerQuintal)}/q = {inr(bestMandi.farmerNetTotal)} for this lot
            </p>
            {recommendation && (
              <p className="text-[11px] text-emerald-600 mt-1">
                Pathway: {pathwayData?.pathways?.find((p: any) => p.pathway === recommendation.pathway)?.label || recommendation.pathway}
                {recommendation.confidence && ` (${recommendation.confidence} confidence)`}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Action */}
      <Card className="p-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700">
          <BadgeCheck size={22} />
        </div>
        <p className="text-sm text-stone-600 mb-4">
          Ready to create a lot and find buyers for your {crop} in {district}?
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <PrimaryButton onClick={goToTrade}>
            Create lot & find buyers <ArrowRight size={16} />
          </PrimaryButton>
          <GhostButton onClick={() => navigate('/trade')}>
            Open trade desk
          </GhostButton>
        </div>
        <p className="text-[10px] text-stone-400 mt-3">
          This will open the Trade page with your decision context pre-filled.
          Payments are simulated for the demo.
        </p>
      </Card>
    </div>
  );
};

export default DecisionWorkspace;
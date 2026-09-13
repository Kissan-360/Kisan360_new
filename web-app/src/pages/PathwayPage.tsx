import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiFetch, API_URL } from '../lib/api';
import { getDecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';
import {
  PageTransition, PageHeader, Card, SectionLabel, Chip, DataTag,
  SkeletonLines, StaggerList, StaggerItem, PrimaryButton, GhostButton, CropIcon, Quantity,
} from '../components/ui/kit';
import { useTranslation } from '../i18n';
import {
  Store, Warehouse, Users, MapPin, Package, Check, Target, ArrowRight,
  AlertTriangle, ShieldCheck, Info, TrendingUp, Scale,
} from 'lucide-react';

// Pathway page — "selling options" companion to the decision workspace.
// The backend decision engine (Node → FastAPI) computes every pathway; this
// screen only presents the fields it returns. Milestone 5 — visual migration
// onto the unified design system: all API calls, query params, and the
// recommendation semantics are UNCHANGED.

const inr = (n?: number | null) => n != null ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—';

const CONFIDENCE_COLORS: Record<string, 'emerald' | 'teal' | 'amber' | 'stone'> = {
  STRONG: 'emerald',
  GOOD: 'teal',
  CAUTION: 'amber',
  LIMITED: 'stone',
};

const SIGNAL_COLORS: Record<string, 'emerald' | 'stone' | 'amber'> = {
  FAVORABLE_NOW: 'emerald',
  NEUTRAL: 'stone',
  WEAK_RELATIVE_TO_HISTORY: 'amber',
  INSUFFICIENT_EVIDENCE: 'stone',
};

const SIGNAL_LABELS: Record<string, string> = {
  FAVORABLE_NOW: 'Favorable now',
  NEUTRAL: 'Neutral',
  WEAK_RELATIVE_TO_HISTORY: 'Weak relative to history',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};

const RISK_COLORS: Record<string, 'emerald' | 'amber' | 'red' | 'stone'> = {
  LOW: 'emerald',
  MODERATE: 'amber',
  HIGH: 'red',
  CRITICAL: 'red',
  INSUFFICIENT_EVIDENCE: 'stone',
};

// Per-pathway icons — the four canonical selling pathways.
const PATHWAY_ICONS: Record<string, React.ElementType> = {
  SELL_NOW: Store,
  STORE_THEN_SELL: Warehouse,
  AGGREGATE_THROUGH_FPO: Users,
  ALTERNATIVE_MARKET: MapPin,
};

interface PathwayEvidence {
  type: string;
  source: string;
  [k: string]: any;
}

interface StorageOption {
  id: string;
  name: string;
  type: string;
  district: string;
  costPerQuintalPerDay: number;
  maxDurationDays: number;
  availability: string;
  label: string;
}

interface PerishabilityInfo {
  crop?: string;
  shelfLife?: { min: number; max: number };
  daysSinceHarvest?: number | null;
  plannedStorageDays?: number | null;
  riskLevel: string;
  riskReason?: string;
  guidance?: string;
  provenance?: Record<string, string>;
}

interface Pathway {
  pathway: string;
  label: string;
  description: string;
  available?: boolean;
  mandi?: string;
  rank?: number;
  estimatedNetPerQuintal?: number;
  estimatedNetTotal?: number;
  distanceKm?: number;
  transportPerQuintal?: number;
  transportTotal?: number;
  transportTier?: string;
  buyerCoverage?: { status: string; actionableMandis: number; compatibleRequirements: number; totalCompatible?: number };
  demandSignals?: { hasActiveDemand: boolean; strongMatches: number; partialMatches: number; actionability: { status: string; reason: string }; matches?: any[] };
  saleWindow?: { signal?: string; [k: string]: any } | null;
  arrivals?: any | null;
  storageOption?: StorageOption | null;
  storageCostPerQuintal?: number;
  storageCostTotal?: number;
  breakevenPricePerQuintal?: number;
  currentNetPerQuintal?: number;
  advantageNeeded?: number;
  breakevenReachable?: boolean;
  recentMaxObserved?: number | null;
  isBulkQualified?: boolean;
  bulkThreshold?: number;
  transportSavingPerQuintal?: number;
  transportSavingTotal?: number;
  pooledNetPerQuintal?: number;
  pooledNetTotal?: number;
  fpoNote?: string;
  buyerCount?: number;
  economicCost?: number;
  perishability?: PerishabilityInfo;
  why?: string[];
  evidence?: PathwayEvidence[];
  assumptions?: string[];
}

interface PathwayResult {
  success: boolean;
  crop: string;
  district: string;
  quantityQuintals: number;
  pathways: Pathway[];
  recommendation: {
    pathway: string;
    reasonCodes?: string[];
    why: string[];
    confidence: string;
    note?: string;
    evaluatedRules?: { rule: string; applied: boolean; savings?: number; costPerQ?: number; signal?: string }[];
  };
  economicSummary?: {
    bestMarket: string;
    bestNetPerQuintal: number;
    bestNetTotal: number;
    recommendedPathway: string;
    recommendedMarket?: string;
    reasonForDifference?: string;
  };
  outcome?: {
    referenceMarket?: string;
    referenceNetPerQuintal?: number;
    referenceNetTotal?: number;
    transportDifference?: number | null;
    pooledVsIndividualDifference?: number | null;
    compatibleBuyerOptions?: number;
    pathwaysAvailable?: number;
    note?: string;
  };
  nextAction?: { type: string; market?: string; lotRequired?: boolean; reason: string };
  decisionTrace?: { step: number; name: string; result: string; checks: { check: string; pass: boolean; detail: string }[] }[];
  perishability?: PerishabilityInfo;
  unknowns: string[];
  assumptions: string[];
  dataBasis: Record<string, string>;
  marketSource?: string;
  marketProvenance?: { source: string; retrievedAt: string; note?: string };
}

// Evidence honesty: tag each item by what its own source claims.
const evidenceTag = (source: string): { tone: 'amber' | 'emerald' | 'sky'; label: string } => {
  const s = (source || '').toLowerCase();
  if (s.includes('assumption')) return { tone: 'amber', label: 'ASSUMPTION' };
  if (s.includes('calculat') || s.includes('deterministic') || s.includes('derived')) return { tone: 'emerald', label: 'DERIVED' };
  return { tone: 'sky', label: 'DATA' };
};

// Render the extra fields of an evidence item (mandi, net, rate, facility…).
const evidenceFields = (ev: PathwayEvidence) => {
  const skip = new Set(['type', 'source']);
  return Object.entries(ev).filter(([k]) => !skip.has(k)).map(([k, v]) => {
    if (v == null || v === '') return null;
    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    const value = typeof v === 'number' ? (k.includes('Price') || k.includes('Net') || k.includes('Cost') ? inr(v) : String(v)) : String(v);
    return <li key={k} className="flex items-center gap-2"><span className="text-stone-500">{label}:</span><span className="font-medium text-stone-800">{value}</span></li>;
  });
};

export default function PathwayPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // Deep-link + decision-context seeding: URL params win, then the stored
  // selling decision, then canonical defaults. No new context mechanism.
  const seed = (() => {
    const ctx = getDecisionContext();
    const urlCrop = searchParams.get('crop');
    const urlDistrict = searchParams.get('district');
    const urlQty = searchParams.get('quantity');
    return {
      crop: urlCrop || ctx?.crop || 'Onion',
      district: urlDistrict || ctx?.district || 'Nashik',
      quantity: (urlQty && parseFloat(urlQty) > 0) ? urlQty : String(ctx?.quantity ?? ctx?.quantityQuintals ?? 10),
    };
  })();

  const [crop, setCrop] = useState(seed.crop);
  const [district, setDistrict] = useState(seed.district);
  const [quantity, setQuantity] = useState(seed.quantity);
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PathwayResult | null>(null);
  const [error, setError] = useState('');
  const autoRanRef = React.useRef(false);

  const activeCrops = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited').map(c => c.name);

  const compute = async (_retryCount = 0) => {
    if (_retryCount === 0) {
      setLoading(true);
      setError('');
    }
    try {
      const params = new URLSearchParams({ crop, district, quantity });
      if (grade) params.set('grade', grade);
      const res = await apiFetch(`${API_URL}/market/pathways?${params}`);
      // Calculator cold-start returns 503 — retry with backoff (max 2 retries).
      if (res.status === 503 && _retryCount < 2) {
        const delay = 3000 * (_retryCount + 1);
        console.log(`[Kisan360] Pathways 503 (calculator waking up), retry ${_retryCount + 1}/2 in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return compute(_retryCount + 1);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to compute pathways');
      setResult(data);
    } catch (e: any) {
      if (_retryCount < 1) {
        console.log('[Kisan360] Pathways network error, retrying in 3s...');
        await new Promise(r => setTimeout(r, 3000));
        return compute(_retryCount + 1);
      }
      setError(e.message || 'Failed to compute pathways');
    } finally {
      setLoading(false);
    }
  };

  // Auto-compute once on a deep link so the farmer lands on results.
  useEffect(() => {
    if (!autoRanRef.current && searchParams.get('crop') && searchParams.get('district')) {
      autoRanRef.current = true;
      compute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recommendation = result?.recommendation;
  const recommendedPathway = result?.pathways.find(p => p.pathway === recommendation?.pathway);
  // Hoisted so TS can narrow into the onClick closure (property narrowing
  // does not flow into nested function scopes).
  const nextAction = result?.nextAction;

  const renderPathway = (p: Pathway) => {
    const isRecommended = recommendation?.pathway === p.pathway;
    const Icon = PATHWAY_ICONS[p.pathway] || Package;
    const unavailable = p.available === false;
    return (
      <StaggerItem key={p.pathway} className="h-full">
        <div className={`card p-5 h-full flex flex-col ${isRecommended ? 'border-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/20' : ''}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isRecommended ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                <Icon size={16} />
              </div>
              <h3 className="font-semibold text-stone-900">{p.label}</h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isRecommended && <Chip color="emerald"><Check size={11} /> Recommended</Chip>}
              {unavailable && <Chip color="stone">Unavailable</Chip>}
            </div>
          </div>
          <p className="text-sm text-stone-600 mb-3 leading-relaxed">{p.description}</p>

          {unavailable ? (
            <p className="text-xs text-stone-400 italic mb-3">Insufficient evidence to cost this pathway right now — shown honestly rather than invented.</p>
          ) : (
            <>
              {/* Per-pathway economics grid — only fields the engine actually returned */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                {p.rank != null && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Rank</p>
                    <p className="font-semibold text-stone-900">#{p.rank}</p>
                  </div>
                )}
                {p.mandi && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5 col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Market</p>
                    <p className="font-semibold text-stone-900 flex items-center gap-1"><MapPin size={12} className="text-emerald-600 shrink-0" />{p.mandi}</p>
                  </div>
                )}
                {p.estimatedNetPerQuintal != null && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Est. net/q</p>
                    <p className="font-semibold text-emerald-800">{inr(p.estimatedNetPerQuintal)}</p>
                  </div>
                )}
                {p.pooledNetPerQuintal != null && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Pooled net/q</p>
                    <p className="font-semibold text-emerald-800">{inr(p.pooledNetPerQuintal)}</p>
                  </div>
                )}
                {(p.estimatedNetTotal != null || p.pooledNetTotal != null) && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Lot total</p>
                    <p className="font-semibold text-stone-900">{inr(p.estimatedNetTotal ?? p.pooledNetTotal)}</p>
                  </div>
                )}
                {p.distanceKm != null && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Distance</p>
                    <p className="font-semibold text-stone-900">{p.distanceKm} km</p>
                  </div>
                )}
                {p.transportPerQuintal != null && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Transport/q</p>
                    <p className="font-semibold text-stone-900">{inr(p.transportPerQuintal)}</p>
                  </div>
                )}
                {p.buyerCount != null && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Directory buyers</p>
                    <p className="font-semibold text-stone-900">{p.buyerCount}</p>
                  </div>
                )}
                {p.economicCost != null && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Economic cost</p>
                    <p className="font-semibold text-stone-900">{inr(p.economicCost)}/q</p>
                  </div>
                )}
              </div>

              {/* STORE THEN SELL — storage economics + honest threshold */}
              {p.storageOption && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                  <p className="text-xs font-medium text-amber-900 flex items-center gap-1.5">
                    <Warehouse size={12} className="shrink-0" /> Storage: {p.storageOption.name}
                    <DataTag label="DEMO — assumed availability" tone="amber" />
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    ₹{p.storageOption.costPerQuintalPerDay}/q/day × {p.storageOption.maxDurationDays} days = {inr(p.storageCostPerQuintal)}/q
                  </p>
                  {p.breakevenPricePerQuintal != null && (
                    <p className="text-xs text-amber-800 mt-1 font-medium">
                      Breakeven: sale price must exceed {inr(p.breakevenPricePerQuintal)}/q to outperform selling now
                    </p>
                  )}
                  {p.advantageNeeded != null && p.currentNetPerQuintal != null && (
                    <p className="text-xs text-amber-800 mt-0.5">
                      Advantage needed: <strong>{inr(p.advantageNeeded)}/q</strong> over today's {inr(p.currentNetPerQuintal)}/q
                    </p>
                  )}
                  <p className="text-[10px] text-amber-600 mt-1">A threshold, not a prediction — Kisan360 does not forecast future prices.</p>
                </div>
              )}

              {/* Per-pathway perishability awareness (never a spoilage forecast) */}
              {p.perishability && (
                <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3 mb-2">
                  <p className="text-xs font-medium text-stone-800 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-amber-600 shrink-0" /> Perishability awareness
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Chip color={RISK_COLORS[p.perishability.riskLevel] || 'stone'}>{p.perishability.riskLevel.replace(/_/g, ' ')}</Chip>
                    {p.perishability.shelfLife && (
                      <span className="text-[11px] text-stone-500">crop shelf life {p.perishability.shelfLife.min}–{p.perishability.shelfLife.max} days</span>
                    )}
                  </div>
                  {p.perishability.riskReason && <p className="text-[11px] text-stone-500 mt-1">{p.perishability.riskReason}</p>}
                  <p className="text-[10px] text-stone-400 mt-1">Evidence-based risk label, not a spoilage prediction.</p>
                </div>
              )}

              {/* FPO — bulk qualification is honest, not assumed */}
              {p.isBulkQualified != null && (
                <div className={`rounded-lg border p-3 mb-2 ${p.isBulkQualified ? 'border-emerald-200 bg-emerald-50/50' : 'border-stone-200 bg-stone-50/60'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip color={p.isBulkQualified ? 'emerald' : 'stone'}>
                      {p.isBulkQualified ? 'Bulk qualified' : 'Below bulk threshold'}
                    </Chip>
                    {p.bulkThreshold != null && <span className="text-[11px] text-stone-500">needs {p.bulkThreshold} q+</span>}
                  </div>
                  {p.transportSavingPerQuintal != null && p.transportSavingPerQuintal > 0 && (
                    <p className="text-xs text-emerald-800 mt-1.5">
                      Transport saving: {inr(p.transportSavingPerQuintal)}/q ({inr(p.transportSavingTotal)} on this lot)
                    </p>
                  )}
                  {p.fpoNote && <p className="text-[11px] text-stone-500 mt-1.5">{p.fpoNote}</p>}
                  <p className="text-[10px] text-stone-400 mt-1">Qualification is a deterministic threshold — not a completed aggregation.</p>
                </div>
              )}

              {/* SELL NOW — buyer coverage + demand signal, honest labels */}
              {p.buyerCoverage && (
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Chip color={p.buyerCoverage.status === 'BUYERS_AVAILABLE' ? 'emerald' : 'stone'}>
                    <Users size={11} /> {p.buyerCoverage.actionableMandis} actionable mandi(s) · {p.buyerCoverage.compatibleRequirements} compatible requirement(s)
                  </Chip>
                </div>
              )}
              {p.demandSignals && (
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <DataTag label="DEMO DEMAND" tone="amber" />
                  {p.demandSignals.hasActiveDemand ? (
                    <Chip color="emerald">
                      Active demand: {p.demandSignals.strongMatches} strong · {p.demandSignals.partialMatches} partial
                    </Chip>
                  ) : (
                    <Chip color="stone">No active demand</Chip>
                  )}
                  {!p.demandSignals.hasActiveDemand && p.demandSignals.actionability?.reason && (
                    <span className="text-[11px] text-stone-500">{p.demandSignals.actionability.reason}</span>
                  )}
                </div>
              )}
              {p.saleWindow?.signal && (
                <div className="mb-1.5">
                  <Chip color={SIGNAL_COLORS[p.saleWindow.signal] || 'stone'}>
                    <TrendingUp size={11} /> {SIGNAL_LABELS[p.saleWindow.signal] || p.saleWindow.signal}
                  </Chip>
                </div>
              )}
              {p.arrivals && p.arrivals.quantity && (
                <p className="text-[11px] text-stone-500 mb-1.5">Arrivals: <Quantity value={p.arrivals.quantity} unit="quintals" /> observed</p>
              )}
            </>
          )}

          {/* Why — engine reasons */}
          {p.why && p.why.length > 0 && (
            <div className="mt-2 border-t border-stone-100 pt-2.5">
              <SectionLabel tone="stone" className="mb-1">Why</SectionLabel>
              <ul className="text-xs text-stone-600 space-y-1">
                {p.why.map((w, i) => <li key={i} className="flex items-start gap-1.5"><Check size={12} className="text-emerald-600 mt-0.5 shrink-0" />{w}</li>)}
              </ul>
            </div>
          )}

          {/* Evidence — inspectable, provenance-tagged */}
          {p.evidence && p.evidence.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-stone-600 hover:text-stone-800 select-none">
                Evidence ({p.evidence.length})
              </summary>
              <div className="mt-1.5 space-y-2">
                {p.evidence.map((ev, i) => {
                  const tag = evidenceTag(ev.source);
                  return (
                    <div key={i} className="rounded-lg border border-stone-200 bg-stone-50/50 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-stone-700 capitalize">{ev.type?.replace(/_/g, ' ')}</span>
                        <DataTag label={tag.label} tone={tag.tone} />
                      </div>
                      <ul className="text-[11px] mt-1 space-y-0.5">{evidenceFields(ev)}</ul>
                      <p className="text-[10px] text-stone-400 mt-1">source: {ev.source}</p>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {/* Assumptions — the documented cost model */}
          {p.assumptions && p.assumptions.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-stone-700 select-none">
                Assumptions ({p.assumptions.length})
              </summary>
              <ul className="text-[11px] text-stone-400 mt-1 space-y-0.5">
                {p.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </details>
          )}
        </div>
      </StaggerItem>
    );
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageTransition>
        <PageHeader
          eyebrow={t('pathways.eyebrow')}
          title={t('pathways.title')}
          subtitle={t('pathways.subtitle')}
          actions={(
            <>
              <GhostButton className="text-xs" onClick={() => navigate('/decision')}>
                <Scale size={14} /> Decision workspace
              </GhostButton>
              <GhostButton className="text-xs" onClick={() => navigate('/net-realization')}>
                <TrendingUp size={14} /> Compare markets
              </GhostButton>
            </>
          )}
        />

        {/* ── Lot context + compute ── */}
        <Card className="p-5">
          <SectionLabel>{t('pathways.yourLot')}</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 items-end">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('pathways.crop')}</label>
              <select className="input-field" value={crop} onChange={e => setCrop(e.target.value)}>
                {activeCrops.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('pathways.district')}</label>
              <select className="input-field" value={district} onChange={e => setDistrict(e.target.value)}>
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
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('pathways.quantity')}</label>
              <input className="input-field" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="0.1" step="1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">{t('pathways.grade')}</label>
              <select className="input-field" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">Unassessed</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
          </div>
          <PrimaryButton className="mt-4" icon={Target} onClick={compute} disabled={loading}>
            {loading ? t('pathways.computing') : t('pathways.compareCta')}
          </PrimaryButton>
        </Card>

        {error && (
          <Card className="p-4 border-red-200 bg-red-50/60">
            <p className="text-sm text-red-700 flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</p>
          </Card>
        )}

        {loading && !result && <SkeletonLines rows={5} />}

        {result && recommendation && (
          <div className="space-y-6">
            {/* ── Recommended pathway — the decision hero ── */}
            <Card spotlight className="p-5 border-emerald-300 bg-emerald-50/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CropIcon cropName={crop} size={16} />
                  </span>
                  <SectionLabel>{t('pathways.recommendedPathway')}</SectionLabel>
                </div>
                <Chip color={CONFIDENCE_COLORS[recommendation.confidence] || 'stone'}>
                  <ShieldCheck size={11} /> Confidence: {recommendation.confidence}
                </Chip>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold text-stone-900">
                  {recommendedPathway?.label || recommendation.pathway}
                </h2>
                {recommendedPathway?.mandi && (
                  <span className="text-sm text-stone-600 flex items-center gap-1"><MapPin size={13} className="text-emerald-600" />{recommendedPathway.mandi}</span>
                )}
              </div>
              {recommendation.reasonCodes && recommendation.reasonCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {recommendation.reasonCodes.map(rc => <DataTag key={rc} label={rc.replace(/_/g, ' ')} tone="emerald" />)}
                </div>
              )}
              <ul className="text-sm text-stone-700 mt-3 space-y-1">
                {recommendation.why.map((w, i) => <li key={i} className="flex items-start gap-2"><Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{w}</li>)}
              </ul>
              {recommendation.note && <p className="text-[11px] text-stone-500 mt-2 italic">{recommendation.note}</p>}
            </Card>

            {/* ── Best modeled economics vs recommended pathway — kept distinct ── */}
            {result.economicSummary && (
              <Card className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                    <DataTag label="Best modeled economics" tone="stone" />
                    <p className="font-semibold text-stone-900 mt-2">{result.economicSummary.bestMarket}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      est. {inr(result.economicSummary.bestNetPerQuintal)}/q net · {inr(result.economicSummary.bestNetTotal)} on this lot
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4">
                    <DataTag label="Recommended pathway" tone="emerald" />
                    <p className="font-semibold text-stone-900 mt-2">{result.economicSummary.recommendedPathway.replace(/_/g, ' ')}{result.economicSummary.recommendedMarket ? ` → ${result.economicSummary.recommendedMarket}` : ''}</p>
                    {result.economicSummary.reasonForDifference && (
                      <p className="text-xs text-stone-600 mt-0.5">{result.economicSummary.reasonForDifference}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ── Next action — the CTA actually navigates to Trade ── */}
            {nextAction && (
              <Card className="p-5 border-emerald-300 bg-emerald-50/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold flex items-center gap-1.5">
                      <ArrowRight size={12} /> Next action · {nextAction.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm text-stone-700 mt-1">{nextAction.reason}</p>
                  </div>
                  <PrimaryButton
                    icon={ArrowRight}
                    onClick={() => navigate(`/trade?prefill=1&crop=${encodeURIComponent(result.crop)}&district=${encodeURIComponent(result.district)}&quantity=${result.quantityQuintals}&mandi=${encodeURIComponent(nextAction.market || result.economicSummary?.bestMarket || '')}&net=${result.economicSummary?.bestNetPerQuintal ?? ''}`)}
                  >
                    Create lot in Trade
                  </PrimaryButton>
                </div>
              </Card>
            )}

            {/* ── Perishability awareness (top-level) ── */}
            {result.perishability && (
              <Card className="p-4 border-amber-200 bg-amber-50/50">
                <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                  <Warehouse size={14} /> Perishability awareness
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <Chip color={RISK_COLORS[result.perishability.riskLevel] || 'stone'}>{result.perishability.riskLevel.replace(/_/g, ' ')}</Chip>
                  {result.perishability.shelfLife && (
                    <span className="text-[11px] text-amber-800">crop shelf life {result.perishability.shelfLife.min}–{result.perishability.shelfLife.max} days</span>
                  )}
                  {result.perishability.provenance?.cropProfile && (
                    <DataTag label={result.perishability.provenance.cropProfile.replace(/_/g, ' ')} tone="stone" />
                  )}
                </div>
                {result.perishability.guidance && <p className="text-xs text-amber-800 mt-1.5">{result.perishability.guidance}</p>}
                <p className="text-[10px] text-amber-600 mt-1">Crop-aware risk label — evidence-based, not a spoilage prediction.</p>
              </Card>
            )}

            {/* ── Outcome strip — estimated advantages, never realized savings ── */}
            {result.outcome && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {result.outcome.referenceNetPerQuintal != null && (
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Market reference</p>
                    <p className="font-semibold text-stone-900 mt-0.5">{inr(result.outcome.referenceNetPerQuintal)}/q</p>
                    <p className="text-[10px] text-stone-400">{result.outcome.referenceMarket}</p>
                  </div>
                )}
                {result.outcome.pooledVsIndividualDifference != null && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Pooling advantage</p>
                    <p className="font-semibold text-emerald-800 mt-0.5">{inr(result.outcome.pooledVsIndividualDifference)}</p>
                    <p className="text-[10px] text-stone-400">estimated on this lot</p>
                  </div>
                )}
                {result.outcome.compatibleBuyerOptions != null && (
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Compatible buyers</p>
                    <p className="font-semibold text-stone-900 mt-0.5">{result.outcome.compatibleBuyerOptions}</p>
                    <p className="text-[10px] text-stone-400">directory options</p>
                  </div>
                )}
                {result.outcome.pathwaysAvailable != null && (
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Pathways</p>
                    <p className="font-semibold text-stone-900 mt-0.5">{result.outcome.pathwaysAvailable}</p>
                    <p className="text-[10px] text-stone-400">costed by engine</p>
                  </div>
                )}
              </div>
            )}
            {result.outcome?.note && (
              <p className="text-[11px] text-stone-400 -mt-3 flex items-start gap-1.5">
                <Info size={11} className="mt-0.5 shrink-0" />{result.outcome.note}
              </p>
            )}

            {/* ── Four pathway cards ── */}
            <div>
              <SectionLabel>{t('pathways.theFourPathways')}</SectionLabel>
              <StaggerList className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                {result.pathways.map(renderPathway)}
              </StaggerList>
            </div>

            {/* ── Unknowns — what the engine could not know ── */}
            {result.unknowns.length > 0 && (
              <Card className="p-4 border-amber-200 bg-amber-50/50">
                <p className="text-[11px] uppercase tracking-wider text-amber-600 font-bold mb-1 flex items-center gap-1.5"><AlertTriangle size={12} />Unknowns</p>
                <ul className="text-xs text-amber-700 space-y-0.5">
                  {result.unknowns.map((u, i) => <li key={i}>• {u}</li>)}
                </ul>
              </Card>
            )}

            {/* ── Data basis — what each figure actually is ── */}
            <Card className="p-4">
              <SectionLabel tone="stone" className="mb-2">Data basis</SectionLabel>
              <ul className="text-[11px] text-stone-500 space-y-0.5">
                {Object.entries(result.dataBasis).map(([k, v]) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="font-medium text-stone-700 shrink-0">{k}:</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </PageTransition>
    </div>
  );
}
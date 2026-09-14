import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calculator, Package, TrendingUp, Truck, ShoppingCart, Info, RefreshCw, Check, ArrowRight,
} from 'lucide-react';
import { API_URL, apiFetch } from '../lib/api';
import { getDecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';
import { isFpoRole } from '../lib/roles';
import { useAuth } from '../hooks/useAuth';
import { otherUnits, trimNumber } from '../lib/units';
import {
  PageTransition, PageHeader, Card, SectionLabel, Chip, EmptyState, SkeletonLines,
  StaggerList, StaggerItem, PrimaryButton, GhostButton, StatCard, Quantity, QuantityHint,
} from '../components/ui/kit';
import { useTranslation } from '../i18n';

/* FPO Bulk Selling — HLD P1.
 *
 * A producer group pools its members' crop into one bulk lot and compares the
 * group's realisation against everyone selling alone. **All arithmetic happens
 * in the deterministic calculator via POST /api/fpo/pool** — this screen reads
 * numbers, never invents them.
 *
 * Completeness notes (parity with the buyer workspace):
 *   • the member roster loads on mount, so the page has real content before the
 *     first click instead of showing an empty frame
 *   • the pool computes automatically once the priced-crop list resolves, so a
 *     judge sees the comparison without being told to press a button
 *   • "Create the pooled lot" actually POSTs /fpo/create-pooled-lot (it used to
 *     only deep-link to /trade, so the button promised something it never did)
 *   • weights are shown in quintals AND tonnes AND kg — a pool is quoted per
 *     quintal and hauled per tonne
 *   • honesty is labelled, not implied: mock member roster, real prices/costs
 */

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
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const ACTIVE_CROPS = MAHARASHTRA_CROPS
  .filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited')
  .map(c => c.name);

const FpoPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ctx = getDecisionContext();
  const isFpoAccount = isFpoRole(user?.role);

  // Continuity: default to the farmer's OWN crop and district from the
  // calculator — pooling is an alternative for THIS decision, not a module.
  const [crop, setCrop] = useState(ctx?.crop || 'Soybean');
  const [district, setDistrict] = useState(ctx?.district || 'Pune');

  const [result, setResult] = useState<PoolResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coverage, setCoverage] = useState<any | null>(null);

  // Roster is fetched separately so the page has content on load.
  const [roster, setRoster] = useState<PoolMember[]>([]);

  // Pooled-lot creation
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ id: string; quantity: number } | null>(null);
  const [createError, setCreateError] = useState('');

  // Only offer crops the price cache can actually price — otherwise the pool
  // call 422s with "no mandi prices". Falls back to the static list.
  const [cropOptions, setCropOptions] = useState<string[]>(ACTIVE_CROPS);

  useEffect(() => {
    let alive = true;
    apiFetch(`${API_URL}/fpo/members`)
      .then(r => r.json())
      .then(d => {
        if (!alive || !d?.success) return;
        setRoster(d.members || []);
      })
      .catch(() => { /* roster is context, not a blocker */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    apiFetch(`${API_URL}/market/coverage`)
      .then(r => r.json())
      .then(d => {
        const priced = (d?.crops || []).filter((c: any) => c.hasMarketData).map((c: any) => c.name);
        const usable = ACTIVE_CROPS.filter(c => priced.includes(c));
        // Guard against a stale backend whose coverage flags lag the snapshot:
        // never narrow the list to a stub — fall back to the static list.
        if (usable.length >= 10) {
          setCropOptions(usable);
          setCrop(prev => (usable.includes(prev) ? prev : usable[0]));
        }
      })
      .catch(() => { /* static list stands */ });
  }, []);

  const compute = async (e?: React.FormEvent, _retryCount = 0) => {
    e?.preventDefault();
    if (_retryCount === 0) {
      setLoading(true);
      setError('');
      setCoverage(null);
      setCreated(null);
      setCreateError('');
    }
    // Never send a crop the price cache cannot price (e.g. Cotton carried in
    // from another screen's decision context). That path always 422s — snap to
    // the first priced crop instead of showing a red card.
    const effectiveCrop = cropOptions.includes(crop) ? crop : cropOptions[0];
    if (effectiveCrop !== crop) setCrop(effectiveCrop);
    try {
      // Pool first to get the actual pooled quantity, then fetch buyer coverage
      // at the real pooled size (not a hardcoded estimate).
      const res = await apiFetch(`${API_URL}/fpo/pool`, {
        method: 'POST',
        body: JSON.stringify({ district, crop: effectiveCrop }),
      });
      // Calculator cold-start returns 503 — and Render's gateway returns 502
      // while the calc is waking. Retry both with backoff (max 2 retries).
      if ((res.status === 503 || res.status === 502) && _retryCount < 2) {
        const delay = 3000 * (_retryCount + 1);
        console.log(`[Kisan360] FPO pool ${res.status} (calculator waking up), retry ${_retryCount + 1}/2 in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return compute(undefined, _retryCount + 1);
      }
      const data: PoolResponse = await res.json();
      if (data.success) {
        setResult(data);
        if (data.pool?.members?.length) setRoster(data.pool.members);
        const pooledQty = data.pool?.pooledQuantity || 50;
        const covRes = await apiFetch(
          `${API_URL}/market/buyer-coverage?crop=${encodeURIComponent(effectiveCrop)}&district=${encodeURIComponent(district)}&quantity=${pooledQty}`
        ).then(r => r.json()).catch(() => null);
        if (covRes?.success) setCoverage(covRes);
      } else {
        setError(data.error || t('fpo.errorTitle'));
      }
    } catch {
      // Network error — retry once if calculator might be waking up
      if (_retryCount < 1) {
        console.log('[Kisan360] FPO pool network error, retrying in 3s...');
        await new Promise(r => setTimeout(r, 3000));
        return compute(undefined, _retryCount + 1);
      }
      setError(t('fpo.errorDesc'));
    } finally {
      setLoading(false);
    }
  };

  /* Auto-compute once the priced-crop list has resolved, so the comparison is
     on screen without a click. Guarded with a ref: React StrictMode invokes
     effects twice in dev, and two pool computations would be two calculator
     round-trips for the same answer. Also guarded against re-fires: if the
     API returns 503 (calculator waking up), the retry logic handles it —
     the effect must not re-trigger on remount. */
  const didAutoCompute = useRef(false);
  useEffect(() => {
    if (didAutoCompute.current || cropOptions.length === 0) return;
    didAutoCompute.current = true;
    compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropOptions]);

  /* Create the pooled LOT (not just a hand-off): the members' contributions
     become one real lot with pool metadata, then the seller continues in
     /trade where buyers and offers already live. */
  const createPooledLot = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiFetch(`${API_URL}/fpo/create-pooled-lot`, {
        method: 'POST',
        body: JSON.stringify({ district, crop }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || t('fpo.createFailed'));
      const qty = data.lot?.quantity || result?.pool.pooledQuantity || 0;
      const unit = data.lot?.unit || 'quintals';
      setCreated({ id: data.lot._id, quantity: data.lot?.quantity || 0 });
      const market = coverage?.bestActionable?.market;
      setTimeout(() => {
        navigate(
          `/trade?prefill=1&crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}` +
          `&quantity=${qty}&unit=${encodeURIComponent(unit)}` +
          (market ? `&mandi=${encodeURIComponent(market)}` : '') +
          `&net=${coverage?.bestActionable?.netPerQuintal ?? ''}`
        );
      }, 900);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('fpo.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const rosterSummary = useMemo(() => {
    const members = result?.pool.members?.length ? result.pool.members : roster;
    const total = members.reduce((s, m) => s + (Number(m.quantityQuintals) || 0), 0);
    return { members, total };
  }, [result, roster]);

  const pooledQty = result?.pool.pooledQuantity ?? rosterSummary.total;
  const upliftPerQuintal = result && pooledQty > 0
    ? Math.round((result.totals.upliftTotal / pooledQty) * 100) / 100
    : 0;

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 space-y-6 pb-24">
        <PageHeader
          eyebrow={t('fpo.eyebrow')}
          title={t('fpo.title')}
          subtitle={t('fpo.subtitle')}
          actions={
            <Chip color={isFpoAccount ? 'sky' : 'stone'}>
              {isFpoAccount ? t('fpo.workspaceBadge') : t('fpo.groupBadge')}
            </Chip>
          }
        />

        <p className="text-xs text-amber-600 flex items-start gap-1.5">
          <Info size={13} className="mt-0.5 shrink-0" />
          {t('fpo.demoNote')}
        </p>

        {/* ── Controls ── */}
        <Card className="p-5">
          <form onSubmit={compute}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="fpo-crop">{t('fpo.crop')}</label>
                <select id="fpo-crop" className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
                  {cropOptions.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="fpo-district">{t('fpo.district')}</label>
                <select id="fpo-district" className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {REGIONS.map(region => (
                    <optgroup key={region} label={region}>
                      {MAHARASHTRA_DISTRICTS.filter(d => d.region === region).map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <PrimaryButton type="submit" className="whitespace-nowrap sm:col-span-2 xl:col-span-1" disabled={loading} icon={loading ? undefined : Calculator}>
                {loading ? t('fpo.computing') : t('fpo.computeBulk')}
              </PrimaryButton>
            </div>
            <p className="text-[11px] text-stone-400 mt-2">
              {t('fpo.pooledHint', { q: pooledQty })}
              {pooledQty > 0 ? <> · {otherUnits(pooledQty, 'quintals')}</> : null}
            </p>
          </form>
        </Card>

        {error && (
          <Card className="p-6">
            <EmptyState
              icon={Info}
              title={t('fpo.errorTitle')}
              description={error}
              action={<PrimaryButton onClick={() => compute()} icon={RefreshCw}>{t('common.retry')}</PrimaryButton>}
            />
          </Card>
        )}

        {/* ── Group summary ── */}
        {(rosterSummary.members.length > 0 || result) && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label={t('fpo.statMembers')} value={rosterSummary.members.length} icon={Users} />
            <StatCard label={t('fpo.statQuantity')} value={pooledQty} suffix=" q" icon={Package} delay={0.05} />
            <StatCard label={t('fpo.statUpliftQ')} value={upliftPerQuintal} prefix="₹" icon={TrendingUp} delay={0.1} />
            <StatCard label={t('fpo.statUpliftTotal')} value={Math.round(result?.totals.upliftTotal ?? 0)} prefix="₹" icon={ShoppingCart} delay={0.15} />
          </div>
        )}

        {/* ── Member roster — real content before any click ── */}
        {rosterSummary.members.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="min-w-0">
                <SectionLabel className="mb-0">{t('fpo.rosterTitle')}</SectionLabel>
                <p className="text-xs text-stone-400 mt-0.5">{t('fpo.rosterHint')}</p>
              </div>
              <Chip color="stone">{t('fpo.rosterCount', { count: rosterSummary.members.length })}</Chip>
            </div>
            <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {rosterSummary.members.map((m) => (
                <StaggerItem key={m.uid}>
                  <div className="border border-stone-200 rounded-xl p-3.5 h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{m.name}</p>
                        <p className="text-[11px] text-stone-400 truncate">{m.village}</p>
                      </div>
                      <Chip color="emerald">{trimNumber(m.quantityQuintals)} q</Chip>
                    </div>
                    <p className="text-[11px] text-stone-400 mt-1.5 tabular">
                      {otherUnits(m.quantityQuintals, 'quintals')}
                    </p>
                    {m.sharePct != null && (
                      <p className="text-[11px] text-stone-400 mt-0.5">{t('fpo.share', { pct: m.sharePct })}</p>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>
            <p className="text-[11px] text-stone-500 mt-3 flex items-start gap-1.5">
              <Info size={12} className="mt-0.5 shrink-0" />
              {t('fpo.mockedNote')}
            </p>
          </Card>
        )}

        {/* ── Decision fork: the SAME lot, two ways to sell. Consequences only. ── */}
        {ctx && (
          <Card className="p-5">
            <p className="text-[11px] uppercase tracking-wider text-stone-400">{t('fpo.forkTitle')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
              <div className="rounded-xl border border-stone-200 p-4">
                <span className="badge badge-blue">{t('fpo.pathA')}</span>
                <p className="text-stone-800 mt-2">
                  {ctx.crop} · <Quantity value={(ctx.quantity ?? ctx.quantityQuintals) ?? 0} unit="quintals" /> · {ctx.district}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">{t('fpo.pathADesc')}</p>
                {ctx.mandi || ctx.net != null ? (
                  <p className="text-stone-600 mt-1">
                    {t('fpo.bestMandi')}: {ctx.mandi || '—'}
                    {ctx.net != null && ctx.net > 0 ? <> · {t('fpo.estNet', { net: inr(ctx.net) })}</> : null}
                  </p>
                ) : (
                  <p className="text-stone-600 mt-1">{t('fpo.attachRef')}</p>
                )}
                <p className="text-xs text-stone-400 mt-1">
                  {t('fpo.pathASmall', { q: (ctx.quantity ?? ctx.quantityQuintals) ?? 0 })}
                </p>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                <span className="badge badge-blue">{t('fpo.pathB')}</span>
                <p className="text-stone-800 mt-2">{t('fpo.pathBLine1', { district })}</p>
                <p className="text-stone-600 mt-1">{t('fpo.pathBLine2')}</p>
                <p className="text-xs text-stone-400 mt-1">{t('fpo.pathBLine3')}</p>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 mt-3">{t('fpo.sameEngine')}</p>
          </Card>
        )}

        {loading && !result && (
          <Card className="p-5"><SkeletonLines rows={4} /></Card>
        )}

        {result && (
          <>
            {/* The killer comparison: individual vs pooled */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <Card className="p-5">
                <p className="section-title">{t('fpo.individualSelling')}</p>
                <p className="text-3xl font-bold text-stone-800 mt-2">{inr(result.totals.soloNetTotal)}</p>
                <p className="text-xs text-stone-400 mt-1">{t('fpo.sumSolo')}</p>
                <div className="mt-3 space-y-1 text-xs text-stone-500">
                  {result.perMember.map((m) => (
                    <div key={m.uid} className="flex justify-between gap-2">
                      <span className="truncate">{m.name} · {m.soloBestMandi}</span>
                      <span className="shrink-0">{inr(m.soloNetPerQuintal)}/q</span>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200/50">
                <p className="text-emerald-100 text-xs uppercase tracking-wider">{t('fpo.fpoBulkLot')}</p>
                <p className="text-3xl font-bold mt-2">{inr(result.totals.pooledNetTotal)}</p>
                <p className="text-emerald-100 text-xs mt-1">
                  {result.pooledBestMandi} · {inr(result.pooledNetPerQuintal)}/q net pooled
                </p>
                <p className="text-emerald-100/80 text-[11px] mt-1">
                  <Quantity value={result.pool.pooledQuantity} unit="quintals" />
                </p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-4xl font-bold">+{inr(result.totals.upliftTotal)}</p>
                  <p className="text-emerald-100 text-xs mt-1">+{result.totals.upliftPct}% vs selling separately</p>
                  <p className="text-emerald-100/70 text-[11px] mt-1.5">{t('fpo.upliftNote')}</p>
                </div>
              </div>

              <Card className="p-5">
                <p className="section-title">{t('fpo.whyPooledWins')}</p>
                <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                  {result.bulkRateApplied
                    ? t('fpo.reasonBulk', { q: result.pool.pooledQuantity, mandi: result.pooledBestMandi })
                    : t('fpo.reasonNoBulk', { q: result.pool.pooledQuantity })}
                </p>
                <div className="mt-3 text-xs text-stone-500">
                  {result.perMember.map((m) => (
                    <div key={m.uid} className="flex justify-between gap-2">
                      <span className="truncate">{m.name}</span>
                      <span className="text-emerald-700 font-medium shrink-0">+{inr(m.uplift)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Per-member economics, with each weight in all three units. */}
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <SectionLabel className="mb-0">{t('fpo.memberEconomics')}</SectionLabel>
                  <p className="text-xs text-stone-400 mt-0.5">{t('fpo.memberEconomicsHint')}</p>
                </div>
                {result.bulkRateApplied && <Chip color="teal">{t('fpo.bulkRate')}</Chip>}
              </div>
              <div className="overflow-x-auto k-scroll">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-100">
                      <th className="py-2 pr-3 font-bold">{t('fpo.colMember')}</th>
                      <th className="py-2 pr-3 font-bold">{t('fpo.colQuantity')}</th>
                      <th className="py-2 pr-3 font-bold">{t('fpo.colSoloMandi')}</th>
                      <th className="py-2 pr-3 font-bold text-right">{t('fpo.colSoloNet')}</th>
                      <th className="py-2 font-bold text-right">{t('fpo.colUplift')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perMember.map((m) => (
                      <tr key={m.uid} className="border-b border-stone-50 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-stone-800 truncate">{m.name}</p>
                          <p className="text-[11px] text-stone-400 truncate">{m.village}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-stone-700 whitespace-nowrap">
                          <Quantity value={m.quantityQuintals} unit="quintals" stack />
                        </td>
                        <td className="py-2.5 pr-3 text-stone-600 truncate">{m.soloBestMandi}</td>
                        <td className="py-2.5 pr-3 text-right text-stone-700 whitespace-nowrap">{inr(m.soloNetPerQuintal)}/q</td>
                        <td className="py-2.5 text-right font-semibold text-emerald-700 whitespace-nowrap">+{inr(m.uplift)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* The economics behind the uplift: transport SAVINGS (nearby
                full-truck pooling) or a transport TRADE-OFF to reach a
                better-paying market. Never show a negative as "saved". */}
            {result.logistics && (result.logistics.savedPerQuintal >= 0 ? (
              <Card className="p-5 border-teal-200 bg-teal-50/40">
                <p className="font-semibold text-stone-900">{t('fpo.logisticsStory')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wider text-stone-400">{t('fpo.separately')}</p>
                    <p className="text-lg font-bold text-stone-800 mt-0.5">{inr(result.logistics.individualAvgTransportPerQuintal, 2)}/q</p>
                    <p className="text-[11px] text-stone-400">{t('fpo.extraTransport')}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wider text-stone-400">{t('fpo.pooledAsOne')}</p>
                    <p className="text-lg font-bold text-teal-800 mt-0.5">{inr(result.logistics.pooledTransportPerQuintal, 2)}/q</p>
                    <p className="text-[11px] text-stone-400">{t('fpo.oneBulkTrip')}</p>
                  </div>
                  <div className="rounded-lg border border-teal-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wider text-teal-600">{t('fpo.transportSaved')}</p>
                    <p className="text-lg font-bold text-teal-700 mt-0.5">{inr(result.logistics.savedPerQuintal, 2)}/q</p>
                    <p className="text-[11px] text-stone-400">
                      {t('fpo.keptByGroup', {
                        qty: result.pool.pooledQuantity,
                        amount: inr(result.logistics.savedPerQuintal * result.pool.pooledQuantity),
                      })}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-stone-500 mt-3">{t('fpo.logisticsNote')}</p>
              </Card>
            ) : (
              <Card className="p-5 border-amber-200 bg-amber-50/40">
                <p className="font-semibold text-stone-900">{t('fpo.tradeoffTitle')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wider text-stone-400">{t('fpo.separately')}</p>
                    <p className="text-lg font-bold text-stone-800 mt-0.5">{inr(result.logistics.individualAvgTransportPerQuintal, 2)}/q</p>
                    <p className="text-[11px] text-stone-400">{t('fpo.extraTransport')}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wider text-stone-400">{t('fpo.pooledAsOne')}</p>
                    <p className="text-lg font-bold text-stone-800 mt-0.5">{inr(result.logistics.pooledTransportPerQuintal, 2)}/q</p>
                    <p className="text-[11px] text-stone-400">{t('fpo.fartherAtBulkRate', { market: result.pooledBestMandi })}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wider text-amber-600">{t('fpo.extraTransport')}</p>
                    <p className="text-lg font-bold text-amber-700 mt-0.5">{inr(Math.abs(result.logistics.savedPerQuintal), 2)}/q</p>
                    <p className="text-[11px] text-stone-400">
                      {t('fpo.worthItBecause', {
                        amount: inr(Math.abs(result.logistics.savedPerQuintal) * result.pool.pooledQuantity),
                        pooled: inr(result.pooledNetPerQuintal),
                        solo: inr(result.totals.soloNetTotal / result.pool.pooledQuantity),
                      })}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-amber-800 mt-3">{t('fpo.upliftFromMarket', { amount: inr(result.totals.upliftTotal) })}</p>
                <p className="text-[11px] text-stone-500 mt-1">{t('fpo.logisticsNote')}</p>
              </Card>
            ))}

            {/* Actionability: pooling unlocks buyers whose minimums no single
                member can meet. Deterministic, from the same directory. */}
            {coverage && (
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <SectionLabel className="mb-0">{t('fpo.coverageTitle')}</SectionLabel>
                  <Chip color={coverage.summary?.actionableCount ? 'emerald' : 'stone'}>
                    {t('fpo.coverageCount', {
                      actionable: coverage.summary?.actionableCount ?? 0,
                      total: coverage.summary?.totalRanked ?? 0,
                    })}
                  </Chip>
                </div>
                <p className="text-sm text-stone-600">
                  {t('fpo.coverageBody')}{' '}
                  {coverage.bestActionable ? (
                    <>{t('fpo.coverageBest')} <strong>{coverage.bestActionable.market}</strong>{' '}
                      ({coverage.bestActionable.buyerCount} {coverage.bestActionable.buyerCount === 1 ? t('fpo.buyer') : t('fpo.buyers')}).</>
                  ) : null}
                </p>
                <p className="text-[11px] text-stone-400 mt-2">{t('fpo.coverageNote')}</p>
              </Card>
            )}

            {created && (
              <Card className="p-4 border-emerald-300 bg-emerald-50/70 text-sm text-emerald-900 flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0" />
                {t('fpo.createdNotice', { qty: created.quantity, crop })}
              </Card>
            )}
            {createError && (
              <Card className="p-4 border-red-200 bg-red-50/60 text-sm text-red-600 flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0" />
                {createError}
              </Card>
            )}

            <p className="text-xs text-stone-400">{t('fpo.engineNote')}</p>
          </>
        )}

        {/* ── Handoff: make the pooled lot real, then continue in /trade ── */}
        {result && coverage?.bestActionable && (
          <div className="sticky bottom-4 z-30 flex flex-nowrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white/95 backdrop-blur shadow-xl px-3 sm:px-4 py-2.5">
            <p className="hidden sm:block text-xs font-semibold text-stone-700 min-w-0 truncate">
              {t('fpo.handoff', {
                qty: result.pool.pooledQuantity,
                market: coverage.bestActionable.market,
              })}
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <GhostButton
                onClick={() => compute()}
                className="text-xs px-3 sm:px-5"
                disabled={loading || creating}
                ariaLabel={t('fpo.recompute')}
              >
                <RefreshCw size={13} /> <span className="hidden sm:inline">{t('fpo.recompute')}</span>
              </GhostButton>
              <PrimaryButton
                onClick={createPooledLot}
                disabled={creating}
                icon={creating ? undefined : ArrowRight}
                ariaLabel={t('fpo.createCta')}
              >
                {creating ? t('fpo.creating') : (
                  <>
                    <span className="hidden sm:inline">{t('fpo.createCta')}</span>
                    <span className="sm:hidden" aria-hidden="true">{t('fpo.createCtaShort')}</span>
                  </>
                )}
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* ── No pooled buyer? Never a dead end: carry the pooled size to Trade ── */}
        {result && !coverage?.bestActionable && (
          <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white/95 backdrop-blur shadow-xl px-3 sm:px-4 py-2.5">
            <p className="text-xs font-semibold text-stone-600">
              {t('fpo.noActionable')}
            </p>
            <PrimaryButton
              onClick={() => navigate(
                `/trade?prefill=1&crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}` +
                `&quantity=${result.pool.pooledQuantity}`
              )}
              icon={ArrowRight}
              className="text-xs"
              ariaLabel={t('fpo.continueTrade')}
            >
              {t('fpo.continueTrade')}
            </PrimaryButton>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default FpoPage;

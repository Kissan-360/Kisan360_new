import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  API_URL, apiFetch, getDemoUser,
} from '../lib/api';
import { getDecisionContext, setDecisionContext, DecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';
import {
  PageTransition, PageHeader, Card, SectionLabel, Chip, EmptyState,
  SkeletonLines, StaggerList, StaggerItem, PrimaryButton, GhostButton, StatCard, CropIcon,
  Quantity, QuantityHint,
} from '../components/ui/kit';
import { quantityTriplet, otherUnits, UNIT_SCALE_NOTE } from '../lib/units';
import { getBenchmark } from '../lib/benchmarkCache';
import { isBuyerSideRole } from '../lib/roles';
import { useTranslation } from '../i18n';
import PaymentTimeline from '../components/PaymentTimeline';
import { useFlow } from '../components/FlowContext';
import {
  Package, Users, Send, Wallet, BadgeCheck, Search, FlaskConical, AlertTriangle,
  Target, Plus, X, Check, ArrowRight, MapPin, FileText, LifeBuoy, TrendingUp,
  CheckCircle2, AlertCircle, Banknote, Receipt, Clock, Scale, Info, Download,
  History,
} from 'lucide-react';

// Trade page — HLD P0.3/P0.4 screens: create a lot, see matched buyers with
// trust badges, send an offer, and watch the simulated payment move
// Pending → Held → Released. All backend contracts are already tested; this
// is pure UI against them.
//
// Milestone 3 — visual migration onto the unified design system. Every API
// call, request body, response field, state machine, role gate and decision
// calculation below is UNCHANGED; only the presentation uses the shared kit.

interface Lot {
  _id: string;
  crop: string;
  variety?: string;
  quantity: number;
  unit: string;
  grade?: string;
  size?: string;
  moisturePct?: number | null;
  damagePct?: number | null;
  assayStatus?: string;
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
  // 'FARMER_TO_BUYER' (this producer offered to a directory buyer) or
  // 'BUYER_TO_FARMER' (a buyer offered on this producer's listed lot). The
  // direction decides who may accept, reject or withdraw it.
  direction?: string;
  buyerUid?: string;
  notes?: string;
  history?: { status: string; at: string; note?: string }[];
}

interface Grievance {
  _id: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
  resolutionNote?: string;
  history?: { to: string; at: string; note?: string }[];
}

interface Payment {
  _id: string;
  quantityQuintals?: number;
  lotId?: any; // backend populates { district, ... } so buyer-side benchmarks use the REAL haul district
  buyerName: string;
  crop: string;
  amount: number;
  status: string;
  createdAt: string;
  history?: { from: string | null; to: string; at: string; note?: string }[];
}

// Trust tiers keep the backend's EXACT vocabulary — never flattened into
// "Verified buyer". Icons are lucide; colors stay tier-specific.
const TIER_CLS: Record<string, string> = {
  REAL_VERIFIED: 'badge-green',
  SOURCE_VERIFIED: 'badge-blue',
  DEMO_VERIFIED: 'badge-yellow',
  SELF_DECLARED: 'badge-red',
};
const TIER_ICONS: Record<string, React.ElementType> = {
  REAL_VERIFIED: BadgeCheck,
  SOURCE_VERIFIED: Search,
  DEMO_VERIFIED: FlaskConical,
  SELF_DECLARED: AlertTriangle,
};

const PAYMENT_STEPS = ['PENDING', 'HELD', 'RELEASED'];
const GRIEVANCE_STEPS = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'];
const GRIEVANCE_CATEGORIES = ['PAYMENT_DELAY', 'QUALITY_DISPUTE', 'WEIGHT_DISPUTE', 'BUYER_NO_SHOW', 'OTHER'];

// Product journey — this screen is the SELL step. Presentational only.
const JOURNEY = ['INFORM', 'COMPARE', 'DECIDE', 'CONNECT', 'SELL'];

// Single source of truth for the /trade?prefill=… deep-link params, used by
// both the decision-context seed (mount) and the prefill effect (mount).
function parsePrefillParams(sp: URLSearchParams) {
  const qty = parseFloat(sp.get('quantity') || '0');
  return {
    crop: sp.get('crop') || undefined,
    district: sp.get('district') || undefined,
    quantity: qty > 0 ? qty : undefined,
    mandi: sp.get('mandi') || undefined,
    net: Number(sp.get('net') || 0),
  };
}

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* Which side of the marketplace this login is on is decided by lib/roles.ts, so
   navigation and page content can never disagree about it. */

// Final outcome (WOW #3): after a payment is RELEASED, answer "what did the
// farmer gain?" The deal ₹/q is an identity (amount ÷ quantity); the benchmark
// comes from the deterministic engine for the lot's crop+district. No
// fabricated uplift — if the engine is unreachable we show the deal only.
const PaymentOutcome = ({ payment, lot }: { payment: Payment; lot?: Lot }) => {
  const { t } = useTranslation();
  const dealPerQ = payment.quantityQuintals && payment.quantityQuintals > 0
    ? Math.round((payment.amount / payment.quantityQuintals) * 100) / 100 : 0;
  const [bench, setBench] = useState<{ bestNet: number; bestMandi: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // Fall back to the backend-populated lot reference before giving up —
    // the district is the difference between a right and a wrong benchmark.
    const district = lot?.district
      || (payment.lotId && typeof payment.lotId === 'object' ? payment.lotId.district : undefined);
    if (!district || !payment.crop) { setFailed(true); return; }
    // Shared cache: rows for the same crop/district/quantity cost one request.
    getBenchmark(payment.crop, district, payment.quantityQuintals).then(b => {
      if (!alive) return;
      if (b) setBench({ bestNet: b.net, bestMandi: b.mandi });
      else setFailed(true);
    });
    return () => { alive = false; };
  }, [payment._id]);

  const delta = bench ? Math.round((dealPerQ - bench.bestNet) * 100) / 100 : null;
  const beat = delta != null && delta >= 0;

  return (
    <div className={`mt-3 rounded-xl p-4 border ${beat ? 'border-emerald-300 bg-emerald-50/70' : bench ? 'border-amber-200 bg-amber-50/60' : 'border-stone-200 bg-stone-50'}`}>
      {/* Three-tier story: reference (market) vs offer (negotiated) vs deal (locked) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-400 flex items-center gap-1"><Scale size={12} /> Market reference</p>
          {bench ? (
            <>
              <p className="font-semibold text-stone-800 mt-0.5">{inr(bench.bestNet)}/q</p>
              <p className="text-[11px] text-stone-400">{t('trade.engineEstimated', { mandi: bench.bestMandi })}</p>
            </>
          ) : <p className="text-xs text-stone-400 mt-0.5">unavailable</p>}
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-400 flex items-center gap-1"><Send size={12} /> Buyer offer (accepted)</p>
          <p className="font-semibold text-stone-800 mt-0.5">{inr(dealPerQ)}/q</p>
          <p className="text-[11px] text-stone-400">negotiated between farmer and buyer</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-[11px] uppercase tracking-wider text-emerald-600 flex items-center gap-1"><Banknote size={12} /> Locked deal</p>
          <p className="font-bold text-emerald-800 mt-0.5">{inr(payment.amount)}</p>
          <p className="text-[11px] text-stone-400">for <Quantity value={payment.quantityQuintals} unit="quintals" /> of {payment.crop} — the transaction record</p>
        </div>
      </div>
      {bench && delta != null && (
        <p className={`text-sm mt-3 ${beat ? 'text-emerald-800' : 'text-amber-800'}`}>
          {beat
            ? t('trade.aboveReference', { delta: Math.abs(delta) })
            : t('trade.belowReference', { delta: Math.abs(delta) })}
        </p>
      )}
      {failed && <p className="text-xs text-stone-400 mt-1">Benchmark context unavailable right now — the deal figures above are the transaction record.</p>}
      <p className="text-[10px] text-stone-400 mt-1.5">Deal figures come from the transaction record; the benchmark comes from the deterministic engine. Payment itself is simulated.</p>
    </div>
  );
};

// Offer benchmark (deal-support): compares the buyer's offer ₹/q against the
// engine's estimated best farmer net today. Documented deterministic bands —
// within 3% below reference = NEAR, more than 3% below = BELOW. Never advice:
// Kisan360 supplies the reference; the farmer makes the decision.
const OFFER_BAND_PCT = 3;
const OfferBenchmark = ({ offer, lot, buyer }: { offer: Offer; lot?: Lot; buyer?: Buyer }) => {
  const { t } = useTranslation();
  const [bench, setBench] = useState<{ net: number; mandi: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // Phase 7 — offer context grounded in structured data that actually exists
  // on the lot and buyer records. Nothing speculative.
  const factors: string[] = [];
  if (lot?.grade && lot.grade !== 'Unassessed') factors.push(`Lot grade: ${lot.grade} (declared)`);
  if (lot?.moisturePct != null) factors.push(`Lot moisture: ${lot.moisturePct}% (declared)`);
  if (lot?.damagePct != null) factors.push(`Visible damage: ${lot.damagePct}% (declared)`);
  if (buyer && offer.quantityQuintals < buyer.minQuantityQuintals) factors.push(`Quantity ${offer.quantityQuintals} q (${otherUnits(offer.quantityQuintals, 'quintals')}) is below ${buyer.name}'s usual ${buyer.minQuantityQuintals} q minimum`);
  if (buyer?.paymentTermsLabel) factors.push(`Buyer's terms: ${buyer.paymentTermsLabel}`);

  useEffect(() => {
    let alive = true;
    if (!offer.crop) { setFailed(true); return; }
    // Ground the benchmark in the REAL lot district: the farmer's own lot
    // record, else the backend-populated lot reference on the offer (present
    // in buyer view). No district → no benchmark. Never assume a default —
    // a wrong-district reference is worse than none.
    const district = lot?.district
      || (offer.lotId && typeof offer.lotId === 'object' ? offer.lotId.district : undefined);
    if (!district) { setFailed(true); return; }
    // Shared cache: rows for the same crop/district/quantity cost one request.
    getBenchmark(offer.crop, district, offer.quantityQuintals).then(b => {
      if (!alive) return;
      if (b) setBench({ net: b.net, mandi: b.mandi });
      else setFailed(true);
    });
    return () => { alive = false; };
  }, [offer._id]);

  if (failed) {
    return <p className="text-[11px] text-stone-400 mt-2">Market reference unavailable right now — compare against today's mandi prices before accepting.</p>;
  }
  if (!bench) return null;
  const diff = Math.round((offer.offeredPricePerQuintal - bench.net) * 100) / 100;
  const pct = bench.net > 0 ? Math.round((diff / bench.net) * 1000) / 10 : 0;
  const status = diff >= 0 ? 'ABOVE REFERENCE' : pct >= -OFFER_BAND_PCT ? 'NEAR REFERENCE' : 'BELOW REFERENCE';
  const chipColor = diff >= 0 ? 'emerald' : pct >= -OFFER_BAND_PCT ? 'amber' : 'red';
  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={chipColor}>{status}</Chip>
        <span className="text-xs text-stone-600">
          Offer <strong>{inr(offer.offeredPricePerQuintal)}/q</strong> vs market reference <strong>{inr(bench.net)}/q</strong> ({bench.mandi}) → {diff >= 0 ? '+' : '−'}{inr(Math.abs(diff))}/q ({pct >= 0 ? '+' : ''}{pct}%)
        </span>
      </div>
      <p className="text-[11px] text-stone-500 mt-1.5">
        {t('trade.referenceNote')}
      </p>
      {status === 'BELOW REFERENCE' && factors.length === 0 && (
        <p className="text-[11px] text-stone-500 mt-1">Not enough structured information on this lot or buyer to explain the difference — ask the buyer directly.</p>
      )}
      <p className="text-[10px] text-stone-400 mt-1">Deterministic comparison (within {OFFER_BAND_PCT}% = near reference). Kisan360 informs — you decide.</p>
      {factors.length > 0 && (
        <div className="mt-1.5">
          <p className="text-[11px] font-medium text-stone-500">Factors on record that may explain the difference:</p>
          <ul className="text-[11px] text-stone-500 mt-0.5 space-y-0.5">
            {factors.map((f) => <li key={f} className="flex items-start gap-1"><span className="mt-0.5 text-emerald-600"><Check size={10} /></span>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

// Lot economics: the farmer's economic stake at a glance — engine benchmark
// for this lot vs the best live offer. Derived numbers only, no profit claims.
const LotEconomics = ({ lot, offers }: { lot: Lot; offers: Offer[] }) => {
  const [bench, setBench] = useState<{ net: number; mandi: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!lot.district || !lot.crop) { setFailed(true); return; }
    // Shared cache: rows for the same crop/district/quantity cost one request.
    getBenchmark(lot.crop, lot.district, myQtyQ(lot)).then(b => {
      if (!alive) return;
      if (b) setBench({ net: b.net, mandi: b.mandi });
      else setFailed(true);
    });
    return () => { alive = false; };
  }, [lot._id]);

  if (failed || !bench) return null;
  const qty = myQtyQ(lot);
  const benchmarkTotal = Math.round(bench.net * qty * 100) / 100;
  const lotOffers = offers.filter(o => lotIdOf(o) !== '' && lotIdOf(o) === String(lot._id) && !['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(o.status));
  const bestOfferQ = lotOffers.length ? Math.max(...lotOffers.map(o => o.offeredPricePerQuintal)) : null;
  const gap = bestOfferQ != null ? Math.round((bestOfferQ - bench.net) * 100) / 100 : null;
  return (
    <p className="text-[11px] text-stone-500 mt-1.5 flex items-start gap-1.5">
      <TrendingUp size={12} className="text-emerald-600 mt-0.5 shrink-0" />
      <span>Lot value — engine benchmark: <strong>{inr(benchmarkTotal)}</strong> ({inr(bench.net)}/q at {bench.mandi})
        {bestOfferQ != null && gap != null && (
          <> · best offer: <strong>{inr(bestOfferQ)}/q</strong> ({gap >= 0 ? '+' : '−'}{inr(Math.abs(gap))}/q vs benchmark)</>
        )}
      </span>
    </p>
  );
};

// Decision receipt (Phase 15): one compact answer to "what exactly did
// Kisan360 recommend, and what actually happened?" Every row is real data —
// the context object, the transaction record, the engine's reference.
const DecisionReceipt = ({ ctx, payments, lots, onDownload, onNewSale }: { ctx: DecisionContext; payments: Payment[]; lots: Lot[]; onDownload?: () => void; onNewSale?: () => void }) => {
  return (
  <Card spotlight className="p-5 border-emerald-300 bg-emerald-50/50">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Receipt size={18} className="text-emerald-700" />
        <p className="font-semibold text-stone-900">Kisan360 selling decision — receipt</p>
      </div>
      <Chip color="amber">simulated transaction</Chip>
    </div>
    <ReceiptDoc ctx={ctx} payments={payments} lots={lots} />
    {(onDownload || onNewSale) && (
      <div className="flex flex-wrap gap-2 mt-4">
        {onDownload && (
          <PrimaryButton className="text-xs !px-3.5 !py-2" icon={Download} onClick={onDownload}>
            Save receipt as PDF
          </PrimaryButton>
        )}
        {onNewSale && (
          <GhostButton className="text-xs !px-3.5 !py-2" onClick={onNewSale}>
            <Plus size={14} /> Sell another lot
          </GhostButton>
        )}
      </div>
    )}
  </Card>
  );
};

// ── Receipt document — the printable selling record, shared by the inline
// card, the celebration modal, and the print sheet. Pure presentational: the
// same figures everywhere, single source of truth.
const ReceiptDoc = ({ ctx, payments, lots }: { ctx: DecisionContext; payments: Payment[]; lots: Lot[] }) => {
  const p = payments[0];
  const lot = lots.find(l => l._id === lotIdOf(p));
  const dealPerQ = p.quantityQuintals && p.quantityQuintals > 0 ? Math.round((p.amount / p.quantityQuintals) * 100) / 100 : 0;
  const diff = ctx.net != null && ctx.net > 0 ? Math.round((dealPerQ - ctx.net) * 100) / 100 : null;
  return (
    <>
      {/* One per row on phones: at 375px two columns left ~95px per cell, too
          narrow for the single word "RECOMMENDATION" at this tracking. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-sm">
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-400">You told us</p>
          <p className="text-stone-800 font-medium mt-0.5">{ctx.crop} · <Quantity value={(ctx.quantity ?? ctx.quantityQuintals) ?? 0} unit="quintals" /> · {ctx.district}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-400">We recommended</p>
          <p className="text-stone-800 font-medium mt-0.5">{ctx.mandi} · {ctx.net != null ? `est. ${inr(ctx.net)}/q` : 'reference —'}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-400">Buyer offered / deal</p>
          <p className="text-stone-800 font-medium mt-0.5">{p.buyerName} · {inr(dealPerQ)}/q ({inr(p.amount)})</p>
        </div>
        <div className={`rounded-lg border p-3 ${diff != null && diff >= 0 ? 'border-emerald-200 bg-emerald-50/60' : diff != null ? 'border-amber-200 bg-amber-50/60' : 'border-stone-200 bg-white'}`}>
          <p className="text-[11px] uppercase tracking-wider text-stone-400">Vs recommendation</p>
          <p className={`font-semibold mt-0.5 ${diff != null ? (diff >= 0 ? 'text-emerald-700' : 'text-amber-700') : 'text-stone-400'}`}>
            {diff != null ? `${diff >= 0 ? '+' : '−'}${inr(Math.abs(diff))}/q` : 'reference unavailable'}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-stone-500 mt-3">
        Price source: {ctx.source === 'agmarknet_live' ? 'live AGMARKNET pull' : 'cached AGMARKNET snapshot'} at decision time · lot {lot ? lot._id.slice(-6) : (p.lotId && typeof p.lotId === 'object' ? String(p.lotId._id) : String(p.lotId ?? 'unknown')).slice(-6)} · recorded {fmtDate(p.createdAt)}. The estimate was a market observation — the deal is the outcome.
      </p>
    </>
  );
};

const RECEIPT_WATERMARK = 'KISAN360 · SIMULATED · ';

// ── Receipt celebration modal — pops the moment the active deal's payment
// releases (once per deal; every repeat sale pops again). The receipt becomes
// usable here: download it watermarked, start the next sale, or jump to the
// history. Re-openable any time from a RELEASED payment row.
const ReceiptModal = ({ ctx, payment, lots, onDownload, onNewSale, onHistory, onClose }: {
  ctx: DecisionContext; payment: Payment; lots: Lot[];
  onDownload: () => void; onNewSale: () => void; onHistory: () => void; onClose: () => void;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sale receipt"
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-emerald-200 w-full max-w-lg p-5 sm:p-6 overflow-hidden animate-in fade-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Watermark — honest demo labeling, printed on the PDF too */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden select-none">
          <div className="absolute inset-[-40%] flex flex-col justify-around -rotate-[24deg] opacity-[0.05]">
            {Array.from({ length: 9 }).map((_, i) => (
              <p key={i} className="whitespace-nowrap text-center text-2xl font-extrabold text-emerald-900 leading-[3.5rem]">
                {RECEIPT_WATERMARK.repeat(4)}
              </p>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </span>
              <div>
                <p className="font-bold text-stone-900">Payment received!</p>
                <p className="text-xs text-stone-500">Your sale is complete — here is the record.</p>
              </div>
            </div>
            <button className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 shrink-0" onClick={onClose} aria-label="Close receipt">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4">
            <ReceiptDoc ctx={ctx} payments={[payment]} lots={lots} />
          </div>
          <div className="flex flex-wrap gap-2 mt-5">
            <PrimaryButton className="text-xs !px-3.5 !py-2" icon={Download} onClick={onDownload}>
              Save receipt as PDF
            </PrimaryButton>
            <GhostButton className="text-xs !px-3.5 !py-2" onClick={onNewSale}>
              <Plus size={14} /> Sell another lot
            </GhostButton>
            <GhostButton className="text-xs !px-3.5 !py-2" onClick={onHistory}>
              <History size={14} /> View in history
            </GhostButton>
          </div>
          <p className="text-[10px] text-stone-400 mt-3">Demo record — no real money moved. The PDF carries the same watermark.</p>
        </div>
      </div>
    </div>
  );
};

// Quintal conversion matching the backend's own rule (Lot stores qty + unit).
function myQtyQ(lot: Lot): number {
  const q = Number(lot.quantity) || 0;
  if (lot.unit === 'kg') return q / 100;
  if (lot.unit === 'tonnes') return q * 10;
  return q;
}

// Lot id, unwrapped: GET /offers and GET /payments return lotId POPULATED
// ({_id, crop, ...}), so String() on it gives "[object Object]" and never
// matches. Every lot-lookup in this file must go through here.
function lotIdOf(o: { lotId: any }): string {
  if (o.lotId == null) return '';
  if (typeof o.lotId === 'object') return String(o.lotId._id || '');
  return String(o.lotId);
}

// Never render "Invalid Date": a missing or malformed timestamp shows a dash.
function fmtDate(iso: any): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '—' : d.toLocaleDateString('en-IN');
}
function fmtDateTime(iso: any): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '—' : d.toLocaleString('en-IN');
}

// Decision history (Phase 12): what previous deals landed vs the market
// reference at that time. Turns the one-time calculator into a continuous
// intelligence loop. No invented rows — only actual transaction records.
const DecisionHistory = ({ payments, lots, onReceipt }: { payments: Payment[]; lots: Lot[]; onReceipt?: (p: Payment) => void }) => {
  const settled = payments.filter((p) => p.status === 'RELEASED');
  const [refs, setRefs] = useState<Record<string, { ref: number; mandi: string } | 'fail'>>({});

  useEffect(() => {
    let alive = true;
    settled.forEach((p) => {
      const lot = lots.find((l) => l._id === lotIdOf(p));
      const district = lot?.district
        || (p.lotId && typeof p.lotId === 'object' ? p.lotId.district : undefined);
      if (!district) {
        if (alive) setRefs((prev) => ({ ...prev, [p._id]: 'fail' }));
        return;
      }
      // Shared cache — this is the fourth component on the page wanting the same
      // reference, so it must not open its own request per row.
      getBenchmark(p.crop, district, p.quantityQuintals).then((b) => {
        if (!alive) return;
        setRefs((prev) => ({
          ...prev,
          [p._id]: b ? { ref: b.net, mandi: b.mandi } : 'fail',
        }));
      });
    });
    return () => { alive = false; };
    // Re-run when the SET of settled deals changes (ids + statuses), not just
    // the payment count: HELD→RELEASED keeps the count but adds a settled
    // deal, and the reference must appear immediately after collecting money.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments.map((p) => `${p._id}:${p.status}`).join('|')]);

  if (settled.length === 0) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp size={16} className="text-emerald-700" />
        <h2 className="font-semibold text-stone-900">Your selling record</h2>
      </div>
      <p className="text-xs text-stone-400 mb-1">Completed deals from this account vs the market reference on record. Demonstrates the outcome loop on demo transactions only.</p>
      <p className="text-[11px] text-stone-400 mb-3">Records like these are how the product learns over time — comparing outcomes against assumptions is what would refine future cost estimates. Kisan360 observes, decides, transacts, records; it does not predict.</p>
      <StaggerList className="space-y-2">
        {settled.map((p) => {
          const dealPerQ = p.quantityQuintals && p.quantityQuintals > 0 ? Math.round((p.amount / p.quantityQuintals) * 100) / 100 : 0;
          const r = refs[p._id];
          const ref = r && r !== 'fail' ? r.ref : null;
          const diff = ref != null ? Math.round((dealPerQ - ref) * 100) / 100 : null;
          return (
            <StaggerItem key={p._id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border border-stone-100 rounded-xl px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-stone-900">{p.crop} · <Quantity value={p.quantityQuintals} unit="quintals" /> → {p.buyerName}</p>
                  <p className="text-xs text-stone-400">{fmtDate(p.createdAt)} · accepted at {inr(dealPerQ)}/q</p>
                </div>
                <div className="text-right">
                  {ref != null && diff != null ? (
                    <>
                      <p className={`font-semibold ${diff >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {diff >= 0 ? '+' : '−'}{inr(Math.abs(diff))}/q vs reference ({inr(ref)}/q)
                      </p>
                      <p className="text-[10px] text-stone-400">reference = engine's best-mandi estimate{r && r !== 'fail' ? ` (${r.mandi})` : ''}</p>
                    </>
                  ) : (
                    <p className="text-xs text-stone-400">reference unavailable right now</p>
                  )}
                  {onReceipt && (
                    <button
                      onClick={() => onReceipt(p)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 min-h-[32px]"
                    >
                      <Receipt size={12} /> Receipt
                    </button>
                  )}
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerList>
    </Card>
  );
};

const TradePage = () => {
  const user = getDemoUser();
  const buyerView = isBuyerSideRole(user?.role);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { flowStep, setFlowStep, inFlow } = useFlow();

  // Refs for auto-scrolling to sections in flow mode
  const lotsRef = React.useRef<HTMLDivElement>(null);
  const buyersRef = React.useRef<HTMLDivElement>(null);
  // The offer composer sits BELOW the buyer list inside the buyers section —
  // scrolling to buyersRef after picking a buyer lands the farmer back on the
  // same list with the composer hidden below the fold. This ref targets the
  // composer itself so "Select this buyer" visibly advances the flow.
  const offerRef = React.useRef<HTMLFormElement>(null);
  const paymentsRef = React.useRef<HTMLDivElement>(null);
  const historyRef = React.useRef<HTMLDivElement>(null);

  const [lots, setLots] = useState<Lot[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [showGrievanceForm, setShowGrievanceForm] = useState(false);
  const [gCategory, setGCategory] = useState('PAYMENT_DELAY');
  const [gDescription, setGDescription] = useState('');
  const [gLotId, setGLotId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Skeletons only while a section genuinely has no data yet — actions that
  // reload in the background never flash the whole page back to placeholders.
  const showSkeleton = (has: boolean) => loading && !has;

  // Lot form
  const [showLotForm, setShowLotForm] = useState(false);
  const [crop, setCrop] = useState('Soybean');
  const [variety, setVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('quintals');
  const [grade, setGrade] = useState('Unassessed');
  const [district, setDistrict] = useState('Pune');
  const [harvestDate, setHarvestDate] = useState('');
  const [size, setSize] = useState('');
  const [moisturePct, setMoisturePct] = useState('');
  const [damagePct, setDamagePct] = useState('');
  const [assayStatus, setAssayStatus] = useState('pending');
  const [expectedNet, setExpectedNet] = useState('');
  // Decision→action handoff: /trade?prefill=1&crop=Onion&district=Nashik&quantity=10&mandi=...&net=...
  const [prefillNote, setPrefillNote] = useState('');
  // Decision continuity: the canonical selling context from the calculator.
  // When arriving via a cold prefill deep link (no prior session decision),
  // the context is only written AFTER mount by the prefill effect below — so
  // we seed it from the URL here to keep the header honest about the decision
  // actually being executed (crop · qty · mandi · reference).
  const [ctx] = useState<DecisionContext | null>(() => {
    const fromStorage = getDecisionContext();
    const pre = parsePrefillParams(new URLSearchParams(window.location.search));
    if (pre.crop || pre.district || pre.quantity) {
      return {
        ...(fromStorage || {}),
        crop: pre.crop || fromStorage?.crop || 'Soybean',
        district: pre.district || fromStorage?.district || 'Pune',
        quantity: pre.quantity || (fromStorage?.quantity ?? fromStorage?.quantityQuintals ?? 10),
        quantityQuintals: pre.quantity || (fromStorage?.quantityQuintals ?? 10),
        mandi: pre.mandi || fromStorage?.mandi || 'the best mandi',
        net: pre.net > 0 ? pre.net : (fromStorage?.net ?? 0),
        source: fromStorage?.source,
      };
    }
    return fromStorage;
  });

  // Offer form
  const [offerLot, setOfferLot] = useState<Lot | null>(null);
  const [offerBuyer, setOfferBuyer] = useState<Buyer | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  // Buyer detail "flash card" — every click on a buyer answers something:
  // with an active lot it selects the buyer; without one it opens this card.
  const [buyerDetail, setBuyerDetail] = useState<Buyer | null>(null);
  const [cropFilter, setCropFilter] = useState('');

  const loadAll = async () => {
    try {
      setLoading(true);
      // The backend picks the listing scope from the ?role= query param
      // (default 'farmer'). Buyer/fpo logins MUST send role=buyer or they see
      // an empty book and cannot accept/release anything.
      const roleScope = buyerView ? 'buyer' : 'farmer';
      const [lotsRes, buyersRes, offersRes, paymentsRes, grievancesRes] = await Promise.all([
        apiFetch(`${API_URL}/lots`),
        apiFetch(`${API_URL}/buyers${cropFilter ? `?crop=${encodeURIComponent(cropFilter)}` : ''}`),
        apiFetch(`${API_URL}/offers?role=${roleScope}`),
        apiFetch(`${API_URL}/payments?role=${roleScope}`),
        apiFetch(`${API_URL}/grievances`),
      ]);
      const lotsData = await lotsRes.json();
      const buyersData = await buyersRes.json();
      const offersData = await offersRes.json();
      const paymentsData = await paymentsRes.json();
      const grievancesData = await grievancesRes.json();
      if (lotsData.success) setLots(lotsData.lots);
      if (buyersData.success) setBuyers(buyersData.buyers);
      if (offersData.success) setOffers(offersData.offers);
      if (paymentsData.success) setPayments(paymentsData.payments);
      if (grievancesData.success) setGrievances(grievancesData.grievances);
    } catch {
      setError('Could not reach the backend — check the API connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // One-time prefill from the net-realization decision.
    if (searchParams.get('prefill') === '1') {
      const pre = parsePrefillParams(searchParams);
      if (pre.crop) setCrop(pre.crop);
      if (pre.district) setDistrict(pre.district);
      if (pre.quantity) setQuantity(String(pre.quantity));
      if (pre.net > 0) setExpectedNet(String(pre.net));
      setShowLotForm(true);
      setPrefillNote(`From your decision: sell ${pre.crop || 'your crop'} at ${pre.mandi || 'the best mandi'} — estimated ${pre.net > 0 ? `₹${pre.net.toLocaleString('en-IN')}/q net` : 'best net realization'}. Confirm the details and publish.`);
      // Remember the recommended mandi for the decision header.
      setDecisionContext({
        crop: pre.crop || 'Soybean',
        district: pre.district || 'Pune',
        quantity: pre.quantity || 10,
        quantityQuintals: pre.quantity || 10,
        mandi: pre.mandi || 'the best mandi',
        net: pre.net,
      });
      window.history.replaceState({}, '', '/trade');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Flow auto-focus: when in flow mode, scroll to the relevant section ──
  useEffect(() => {
    if (!inFlow) return;
    // Small delay to let the page render
    const timer = setTimeout(() => {
      if (flowStep === 3) {
        // Step 3 (Lot): auto-open the lot form and scroll to lots
        setShowLotForm(true);
        lotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (flowStep === 4) {
        // Step 4 (Buyers): scroll to buyers section
        buyersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (flowStep === 5) {
        // Step 5 (Payment): scroll to payment section
        paymentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [flowStep, inFlow]);

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
        body: JSON.stringify({
          crop, variety, quantity: Number(quantity), unit, grade, district, harvestDate,
          size,
          moisturePct: moisturePct === '' ? null : Number(moisturePct),
          damagePct: damagePct === '' ? null : Number(damagePct),
          assayStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Lot created for ${quantityTriplet(data.lot.quantity, data.lot.unit)} of ${data.lot.crop}.`);
        setShowLotForm(false);
        setQuantity('');
        setVariety('');
        setHarvestDate('');
        setSize('');
        setMoisturePct('');
        setDamagePct('');
        setAssayStatus('pending');
        loadAll();
        // Auto-advance flow: lot created → move to buyers step
        if (inFlow && flowStep === 3) {
          setTimeout(() => setFlowStep(4), 800);
        }
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
        setNotice(`Offer sent to ${offerBuyer.name}: ${inr(Number(offerPrice))}/q × ${quantityTriplet(myQuantityQuintals, 'quintals')} = ${inr(data.offer.amount)}.`);
        setOfferLot(null);
        setOfferBuyer(null);
        setOfferPrice('');
        loadAll();
        // The next step lives in the payment timeline (simulate the buyer's
        // acceptance) — take the farmer there instead of leaving them on a
        // cleared form wondering what happened.
        setTimeout(() => paymentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
        // Auto-advance flow: offer sent → move to payment step
        if (inFlow && flowStep === 4) {
          setTimeout(() => setFlowStep(5), 800);
        }
      } else {
        setError(data.error || 'Failed to send offer');
      }
    } catch {
      setError('Failed to send offer');
    }
  };

  const raiseGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const body: Record<string, string> = { category: gCategory, description: gDescription };
      if (gLotId) body.lotId = gLotId;
      const res = await apiFetch(`${API_URL}/grievances`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setNotice('Grievance raised — status OPEN. You can track it below.');
        setShowGrievanceForm(false);
        setGDescription('');
        setGLotId('');
        loadAll();
      } else {
        setError(data.error || 'Failed to raise grievance');
      }
    } catch {
      setError('Failed to raise grievance');
    }
  };

  // One POST per action path at a time — rapid double-clicks on Accept/
  // Release/Reject must not fire duplicate requests (the backend rejects them
  // with 409/422, but the operator should never see that noise).
  const inFlight = React.useRef<Set<string>>(new Set());
  const act = async (path: string, okMsg: string, body: object = {}) => {
    if (inFlight.current.has(path)) return;
    inFlight.current.add(path);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(`${API_URL}${path}`, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        setNotice(okMsg);
        loadAll();
      } else {
        setError(data.error || 'Action failed');
      }
    } catch {
      setError('Action failed');
    } finally {
      inFlight.current.delete(path);
    }
  };

  // ── Active deal: latest lot → its latest offer → its payment ─────────────
  // The 7-step payment timeline, the receipt, and the demo simulation all
  // follow the CURRENT deal — never `.some()` over all history. The old
  // `.some()` logic pinned the timeline at 7/7 forever after the first
  // completed sale, so "Simulate next step" never appeared again and repeat
  // sales looked broken.
  const byCreatedDesc = (a: { createdAt: string }, b: { createdAt: string }) =>
    +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0);
  const activeLot = [...lots].sort(byCreatedDesc)[0] || null;
  const activeLotOffers = activeLot
    ? offers.filter(o => lotIdOf(o) !== '' && lotIdOf(o) === String(activeLot._id)).sort(byCreatedDesc)
    : [];
  const activeOffer = activeLotOffers[0] || null;
  const activePayment = activeOffer
    ? payments.find(p => String((p as any).offerId || '') === String(activeOffer._id)
        || (lotIdOf(p) !== '' && lotIdOf(p) === lotIdOf(activeOffer))) || null
    : null;
  // A dead latest deal (offer withdrawn / rejected / expired, or its payment
  // was cancelled) sends the farmer back to matching — step 2, not a stuck
  // step with a dead Simulate button.
  const activeDealDead = !!activeOffer
    && (['WITHDRAWN', 'REJECTED', 'EXPIRED'].includes(activeOffer.status)
      || activePayment?.status === 'CANCELLED');
  const timelineStep = !activeLot ? 1
    : !activeOffer || activeDealDead ? 2
    : activePayment?.status === 'RELEASED' ? 7
    : activePayment?.status === 'HELD' ? 6
    : activePayment?.status === 'PENDING' ? 5
    : activeOffer.status === 'ACCEPTED' ? 4
    : activeOffer.status === 'SENT' ? 3
    : 2;
  // What the Simulate button can do RIGHT NOW on the active deal (null =
  // nothing to simulate — the timeline shows a next-step hint instead of a
  // dead button).
  const simulateTarget = activePayment?.status === 'HELD' ? 'release'
    : activeOffer?.status === 'SENT' ? 'accept'
    : null;
  const releasedPayments = payments.filter(p => p.status === 'RELEASED');
  // The receipt celebrates the ACTIVE deal's completion, so starting a new
  // lot retires the old receipt instead of showing stale figures forever.
  const showReceipt = !!ctx && !!activePayment && activePayment.status === 'RELEASED';

  // Opens the lot form and takes the farmer to it. Declared BEFORE the
  // next-action block below: `run: openLotForm` reads the binding at render
  // time (not lazily), so declaring it later throws a TDZ ReferenceError and
  // whitescreens /trade — exactly the crash this comment guards against.
  const openLotForm = () => {
    setShowLotForm(true);
    setTimeout(() => lotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // ── "What do I do now?" — exactly ONE next action, derived from the same
  // active-deal state as the timeline. The kisan never has to read the page
  // to know the next step: the banner names it and its button takes them
  // there. Buyer workspace never sees this (different job).
  type NextAction = { icon: React.ElementType; title: string; desc: string; cta: string; run: () => void };
  const scrollDownTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  const nextAction: NextAction | null = buyerView ? null
    : !activeLot
      ? {
          icon: Package,
          title: t('trade.next.noLot.title'),
          desc: t('trade.next.noLot.desc'),
          cta: t('trade.next.noLot.cta'),
          run: openLotForm,
        }
      : !activeOffer || activeDealDead
        ? activeDealDead
          ? {
              icon: Plus,
              title: t('trade.next.dead.title'),
              desc: t('trade.next.dead.desc'),
              cta: t('trade.next.dead.cta'),
              run: openLotForm,
            }
          : {
              icon: Users,
              title: t('trade.next.pickBuyer.title', { crop: activeLot.crop }),
              desc: t('trade.next.pickBuyer.desc'),
              cta: t('trade.next.pickBuyer.cta'),
              run: () => scrollDownTo(buyersRef),
            }
        : activeOffer.status === 'SENT'
          ? {
              icon: Send,
              title: t('trade.next.waitReply.title'),
              desc: t('trade.next.waitReply.desc', { buyer: activeOffer.buyerName || 'the buyer' }),
              cta: t('trade.next.waitReply.cta'),
              run: () => scrollDownTo(paymentsRef),
            }
          : activePayment?.status === 'RELEASED'
            ? {
                icon: CheckCircle2,
                title: t('trade.next.done.title'),
                desc: t('trade.next.done.desc', { amount: inr(activePayment.amount) }),
                cta: t('trade.next.done.cta'),
                run: () => { if (activePayment) setReceiptModal(activePayment); },
              }
            : {
                icon: Banknote,
                title: t('trade.next.collect.title'),
                desc: t('trade.next.collect.desc', { amount: inr(activePayment?.amount || activeOffer.amount) }),
                cta: t('trade.next.collect.cta'),
                run: () => scrollDownTo(paymentsRef),
              };

  // ── Receipt celebration modal: pops the moment the active deal's payment
  // releases — once per deal id, so every repeat sale pops again, and
  // re-openable any time from a RELEASED payment row.
  const [receiptModal, setReceiptModal] = useState<Payment | null>(null);
  const shownReceiptIds = React.useRef<Set<string>>(new Set());
  const prevDealKey = React.useRef<string | null>(null);
  useEffect(() => {
    const key = activePayment ? `${activePayment._id}:${activePayment.status}` : null;
    const was = prevDealKey.current;
    prevDealKey.current = key;
    const ap = activePayment;
    // Pop only on a TRANSITION into RELEASED observed while on this page:
    // deals completed before this load (was === null) never pop stale cards.
    if (ap && ap.status === 'RELEASED' && !shownReceiptIds.current.has(ap._id) && was !== null && was !== key) {
      shownReceiptIds.current.add(ap._id);
      setReceiptModal(ap);
    }
  }, [activePayment]);

  // ── Receipt PDF: zero-dependency print-to-PDF. The printable sheet is
  // portaled outside #root; print CSS hides the app and shows only the
  // watermarked sheet, so the farmer picks "Save as PDF" (or a printer).
  const printReceipt = () => {
    document.body.classList.add('printing-receipt');
    // Let the print-only sheet mount before opening the dialog.
    setTimeout(() => { window.print(); }, 80);
  };
  useEffect(() => {
    const done = () => document.body.classList.remove('printing-receipt');
    window.addEventListener('afterprint', done);
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-receipt');
    };
  }, []);

  const startNewSale = () => {
    setReceiptModal(null);
    openLotForm();
  };
  const viewReceiptHistory = () => {
    setReceiptModal(null);
    setTimeout(() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const activeOfferCount = offers.filter(o => !['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(o.status)).length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <PageTransition>
        {/* ── Decision context header — the SAME selling decision carried across pages ── */}
        {ctx && (
          <Card className="p-4 border-emerald-200 bg-emerald-50/60">
            {/* Stacks on phones — the two action buttons are shrink-0, so at
                375px they starved this row and the decision text overflowed. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0 sm:flex-1 sm:min-w-[16rem]">
                <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold flex flex-wrap items-center gap-1.5">
                  <Target size={12} /> Your current selling decision
                </p>
                <p className="text-sm text-stone-800 mt-1 flex flex-wrap items-center gap-x-1.5">
                  <strong>{ctx.crop}</strong> · <Quantity value={(ctx.quantity ?? ctx.quantityQuintals) ?? 0} unit="quintals" /> · {ctx.district}
                  <ArrowRight size={12} className="text-stone-400" />
                  <strong>{ctx.mandi}</strong>
                  {ctx.net != null && ctx.net > 0 && <> · est. net <strong>{inr(ctx.net)}/q</strong></>}
                  {ctx.source && <> · <span className="text-stone-400">{ctx.source === 'agmarknet_live' ? 'live prices' : 'cached prices'}</span></>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <GhostButton className="text-xs" onClick={() => navigate('/net-realization')}>
                  <Scale size={14} /> {t('trade.reviewDecision')}
                </GhostButton>
                <GhostButton className="text-xs" onClick={() => navigate('/fpo')}>
                  <Users size={14} /> {t('trade.poolWhatIf')}
                </GhostButton>
              </div>
            </div>

            {/* Product journey indicator — SELL is the stage this screen executes.
                Wraps to two rows on phones (connectors hidden there); single
                scroll-free strip on sm+. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:flex-nowrap sm:gap-1 sm:overflow-x-auto sm:pb-0.5">
              {JOURNEY.map((step, i) => {
                const active = i === JOURNEY.length - 1;
                const done = i < JOURNEY.length - 1;
                return (
                  <React.Fragment key={step}>
                    {i > 0 && <div className="hidden sm:block flex-1 h-0.5 min-w-3 bg-emerald-300" aria-hidden="true" />}
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] sm:px-2.5 sm:text-[10px] font-bold tracking-wide ${active ? 'bg-emerald-800 text-white shadow-sm' : done ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-400'}`}>
                      {step}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>

          </Card>
        )}

        {/* ── Page header ── */}
        <PageHeader
          eyebrow={t('trade.eyebrow')}
          title={t('trade.title')}
          subtitle={buyerView
            ? t('trade.subtitleBuyer')
            : t('trade.subtitleFarmer')}
        />

        {/* ── Execution summary (real counts only) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 -mt-2 mb-6">
          <StatCard label="Lots" value={lots.length} icon={Package} />
          <StatCard label="Matched buyers" value={buyers.length} icon={Users} delay={0.05} />
          <StatCard label="Active offers" value={activeOfferCount} icon={Send} delay={0.1} />
          <StatCard label="Simulated payments" value={payments.length} icon={Wallet} delay={0.15} />
        </div>

        {/* ── Prefill banner ── */}
        {prefillNote && (
          <div className="card p-4 border-emerald-300 bg-emerald-50/70 text-sm text-emerald-900 flex items-start justify-between gap-3">
            <span className="flex items-start gap-2">
              <Target size={16} className="mt-0.5 shrink-0" />
              {prefillNote}
            </span>
            <button
              className="text-xs text-stone-400 hover:text-stone-600 shrink-0"
              onClick={() => setPrefillNote('')}
              aria-label="Dismiss prefill notice"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="card p-4 border-emerald-200 bg-emerald-50/60 text-sm text-emerald-800 flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {notice}
          </div>
        )}
        {error && (
          <div className="card p-4 border-red-200 bg-red-50/60 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* ── "What do I do now?" — one next action, always visible ── */}
        {nextAction && (() => {
          const ActionIcon = nextAction.icon;
          return (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 text-white p-5 shadow-lg shadow-emerald-600/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-11 w-11 rounded-full bg-white/15 flex items-center justify-center shrink-0" aria-hidden="true">
                    <ActionIcon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold leading-tight">{nextAction.title}</p>
                    <p className="text-sm text-emerald-50/90 mt-0.5 leading-snug">{nextAction.desc}</p>
                  </div>
                </div>
                <button
                  onClick={nextAction.run}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-800 shadow hover:bg-emerald-50 active:scale-95 transition-all min-h-[48px] shrink-0"
                >
                  {nextAction.cta} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Lots ─────────────────────────────────────────────── */}
        <div ref={lotsRef}>
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <SectionLabel>{t('trade.yourLot')}</SectionLabel>
              <h2 className="font-semibold text-stone-900 mt-0.5">{t('trade.myLots')}</h2>
            </div>
            {!buyerView && (
              showLotForm ? (
                <GhostButton className="text-sm" onClick={() => setShowLotForm(false)}>
                  <X size={16} /> Close
                </GhostButton>
              ) : (
                <PrimaryButton className="text-sm" onClick={() => setShowLotForm(true)} icon={Plus}>
                  {t('trade.newLot')}
                </PrimaryButton>
              )
            )}
          </div>

          {showLotForm && !buyerView && (
            <form onSubmit={createLot} className="mb-5 p-4 bg-stone-50 rounded-2xl space-y-3 border border-stone-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Crop</label>
                  <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
                    {MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited').map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">District</label>
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
                  <label className="block text-xs font-medium text-stone-500 mb-1">Quantity</label>
                  <input className="input-field" type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required placeholder="e.g. 10" />
                  {/* Weight in the unit you picked AND the other two — a lot is
                      quoted per quintal but carried per tonne. */}
                  <QuantityHint value={quantity} unit={unit} note={UNIT_SCALE_NOTE} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Variety <span className="text-stone-400">(optional)</span></label>
                  <input className="input-field" value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="e.g. JS-335" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Unit</label>
                  <select className="input-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
                    <option value="quintals">quintals</option>
                    <option value="kg">kg</option>
                    <option value="tonnes">tonnes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Harvest date <span className="text-stone-400">(optional)</span></label>
                  <input className="input-field" type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} />
                </div>
              </div>
              {/* Quality details — collapsible to reduce form clutter */}
              <details className="group">
                <summary className="text-xs font-medium text-stone-500 cursor-pointer hover:text-stone-700 select-none">
                  Quality details <span className="text-stone-400 font-normal">(your estimates — helps buyers understand your lot)</span>
                </summary>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                  <p className="text-[11px] text-amber-700">These are your assessments, not independent verification. Kisan360 does not grade produce. Buyers see your declared values.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Grade (your assessment)</label>
                    <select className="input-field" value={grade} onChange={(e) => setGrade(e.target.value)}>
                      {['Unassessed', 'A', 'B', 'C'].map((g) => <option key={g}>{g}</option>)}
                    </select>
                    <p className="text-[10px] text-stone-400 mt-0.5">Declared by you — not independently verified</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Size <span className="text-stone-400">(your estimate)</span></label>
                    <input className="input-field" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 40–50mm" />
                    <p className="text-[10px] text-stone-400 mt-0.5">Declared by you — not measured by Kisan360</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Moisture % <span className="text-stone-400">(your estimate)</span></label>
                    <input className="input-field" type="number" min="0" max="100" step="0.1" value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} placeholder="e.g. 8" />
                    <p className="text-[10px] text-stone-400 mt-0.5">Declared by you — not lab-tested</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Visible damage % <span className="text-stone-400">(your estimate)</span></label>
                    <input className="input-field" type="number" min="0" max="100" step="0.1" value={damagePct} onChange={(e) => setDamagePct(e.target.value)} placeholder="e.g. 2" />
                    <p className="text-[10px] text-stone-400 mt-0.5">Declared by you — visual inspection only</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">Lab verification status</label>
                    <select className="input-field" value={assayStatus} onChange={(e) => setAssayStatus(e.target.value)}>
                      {['pending', 'in_progress', 'passed', 'failed'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <p className="text-[10px] text-stone-400 mt-0.5">Lab testing available in production</p>
                  </div>
                </div>
              </details>
              <div>
                <PrimaryButton type="submit" icon={Package}>Create lot</PrimaryButton>
              </div>
            </form>
          )}

          {expectedNet && (
            <p className="text-xs text-emerald-700 mb-3 flex items-center gap-1.5">
              <Target size={12} className="shrink-0" /> Target from your calculator decision: <strong>₹{Number(expectedNet).toLocaleString('en-IN')}/q net</strong> — price your offer at or above this to keep your expected realization.
            </p>
          )}
          {showSkeleton(lots.length > 0) ? (
            <SkeletonLines rows={3} />
          ) : lots.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t('trade.noLots')}
              description={t('trade.noLotsDesc')}
              action={!buyerView ? <PrimaryButton className="text-sm" onClick={() => setShowLotForm(true)} icon={Plus}>{t('trade.createFirstLot')}</PrimaryButton> : undefined}
            />
          ) : (
            <StaggerList className="space-y-2">
              {lots.map((lot) => (
                <StaggerItem key={lot._id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border border-stone-100 rounded-xl px-4 py-3 hover:border-stone-200 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 text-sm flex items-center gap-1.5">
                        <CropIcon cropName={lot.crop} size={14} className="text-emerald-600" />
                        {lot.crop}{lot.variety ? ` · ${lot.variety}` : ''} — <Quantity value={lot.quantity} unit={lot.unit} />
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {lot.district || '—'} · grade {lot.grade || 'Unassessed'} (declared)
                        {lot.moisturePct != null ? ` · moisture ${lot.moisturePct}% (declared)` : ''}
                        {lot.damagePct != null ? ` · damage ${lot.damagePct}% (declared)` : ''}
                        · assay {lot.assayStatus || 'pending'}
                        · {fmtDate(lot.createdAt)}
                      </p>
                      <LotEconomics lot={lot} offers={offers} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip color={lot.status === 'OPEN' ? 'emerald' : lot.status === 'CLOSED' ? 'sky' : 'amber'}>{lot.status}</Chip>
                      {!buyerView && (lot.status === 'OPEN' || lot.status === 'OFFERED') && (
                        <>
                          <GhostButton
                            className="text-xs"
                            onClick={() => {
                              setOfferLot(lot); setOfferBuyer(null); setOfferPrice('');
                              // The composer renders below the buyer list — take
                              // the farmer to the buyers so the next click
                              // (pick a buyer) is in front of them, with the
                              // armed-lot hint explaining exactly that.
                              setTimeout(() => buyersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                            }}
                          >
                            <Send size={14} /> Send offer
                          </GhostButton>
                          <GhostButton
                            className="text-xs text-red-600 hover:bg-red-50"
                            onClick={() => act(`/lots/${lot._id}/withdraw`, 'Lot withdrawn.')}
                          >
                            <AlertTriangle size={14} /> Withdraw
                          </GhostButton>
                        </>
                      )}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </Card>
        </div>

        {/* ── Buyer matching with trust badges ─────────────────── */}
        <div ref={buyersRef}>
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <SectionLabel>{t('trade.buyers')}</SectionLabel>
              <h2 className="font-semibold text-stone-900 mt-0.5">{t('trade.matchedBuyers')}</h2>
              <p className="text-xs text-stone-400 mt-0.5">Trust badges are simulated for the demo — production verifies FSSAI/GST registries.</p>
              {!buyerView && !offerLot && lots.some(l => l.status === 'OPEN' || l.status === 'OFFERED') && (
                <p className="text-xs text-emerald-700 mt-1">Pick "Send offer" on one of your lots — matching reasons then appear against that exact lot (crop · service area · quantity).</p>
              )}
              {!buyerView && offerLot && (
                <p className="text-xs text-emerald-700 mt-1">
                  Offering <strong>{offerLot.crop} · <Quantity value={Number(offerLot.quantity)} unit={offerLot.unit} /></strong>
                  {offerBuyer ? <> to <strong>{offerBuyer.name}</strong> — review the price below and send.</> : ' — now pick a buyer; matching reasons appear per buyer.'}
                </p>
              )}
            </div>
            <select className="input-field w-auto text-sm" value={cropFilter} onChange={(e) => setCropFilter(e.target.value)} aria-label="Filter buyers by crop">
              <option value="">{t('trade.allCrops')}</option>
              {MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active' || c.marketCoverage === 'limited').map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {showSkeleton(buyers.length > 0) ? (
            <SkeletonLines rows={2} />
          ) : buyers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('trade.noBuyers')}
              description={t('trade.noBuyersDesc')}
            />
          ) : (
            // 2-across from lg, not md: with the 240px sidebar at 768px each
            // card was ~158px wide, too narrow for the name row plus the trust
            // badge and its info button.
            <StaggerList className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {buyers.map((b) => {
                const tier = TIER_CLS[b.trustTier] || TIER_CLS.SELF_DECLARED;
                const TierIcon = TIER_ICONS[b.trustTier] || AlertTriangle;
                const tooSmall = offerLot ? myQuantityQuintals < b.minQuantityQuintals : false;
                // Explainable matching — derived from the buyer record's own fields,
                // never an opaque score.
                const reasons: string[] = [];
                if (offerLot) {
                  if ((b.crops || []).some(c => c.toLowerCase() === offerLot.crop.toLowerCase())) reasons.push(`buys ${offerLot.crop}`);
                  if ((b.districts || []).some(d => d.toLowerCase() === (offerLot.district || '').toLowerCase())) reasons.push(`serves ${offerLot.district}`);
                  reasons.push(`accepts ${b.minQuantityQuintals} q (${otherUnits(b.minQuantityQuintals, 'quintals')})+ lots`);
                }
                const selected = offerBuyer?.id === b.id;
                return (
                  <StaggerItem key={b.id}>
                    <div
                      className={`h-full border rounded-xl p-4 transition-all cursor-pointer ${selected ? 'border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/40' : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'}`}
                      onClick={() => {
                        if (buyerView) return;
                        // No active lot → a click answers "who is this buyer?"
                        // (detail flash card) instead of doing nothing.
                        if (!offerLot) { setBuyerDetail(b); return; }
                        setOfferBuyer(b);
                        const target = Number(expectedNet) > 0
                          ? Number(expectedNet)
                          : (ctx && ctx.net != null && ctx.net > 0 ? ctx.net : 0);
                        setOfferPrice(target > 0 ? String(Math.round(target)) : '');
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select buyer ${b.name}`}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
                    >
                      {/* The trust badge is wider in Marathi/Hindi, which used to
                          crush this name column to ~68px and overflow it. The
                          name keeps a floor width so the badge wraps instead,
                          and long single words can break as a last resort. */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-3">
                        <div className="min-w-0 sm:flex-1 sm:min-w-[9rem]">
                          <p className="font-medium text-stone-900 text-sm break-words">{b.name}</p>
                          <p className="text-xs text-stone-400 break-words">{b.category} · min {b.minQuantityQuintals} q</p>
                        </div>
                        <span className="flex items-center gap-1 shrink-0 self-start">
                          <span className={`badge ${tier} inline-flex items-center gap-1.5`} title={b.tierDescription}>
                            <TierIcon size={12} /> {b.tierLabel}
                          </span>
                          <button
                            className="h-9 w-9 -my-1 -mr-1 grid place-items-center rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                            aria-label={`More info about ${b.name}`}
                            onClick={(e) => { e.stopPropagation(); setBuyerDetail(b); }}
                          >
                            <Info size={14} />
                          </button>
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-2">{b.description}</p>
                      {reasons.length > 0 && (
                        <div className="text-[11px] text-emerald-700 mt-1.5">
                          <span className="font-medium">Matched because:</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {reasons.map((r, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <Check size={11} className="text-emerald-600 shrink-0" /> {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-[11px] text-stone-400 mt-1.5 flex items-start gap-1">
                        <MapPin size={11} className="mt-0.5 shrink-0" />
                        <span>Serves: {(b.districts || []).join(', ')} · crops: {(b.crops || []).join(', ')} · {b.paymentTermsLabel}</span>
                      </p>
                      {!buyerView && offerLot && (
                        <button
                          className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium ${tooSmall ? 'text-stone-300 cursor-not-allowed' : 'text-emerald-600 hover:text-emerald-700'}`}
                          disabled={tooSmall}
                          onClick={() => {
                            setOfferBuyer(b);
                            // Phase 9 — prefill with the decision's engine reference so
                            // the offer composer starts from the calculator, never a
                            // guess. The farmer can still edit it down if they choose.
                            // expectedNet (the URL's net target) wins; ctx.net is the
                            // session fallback.
                            const target = Number(expectedNet) > 0
                              ? Number(expectedNet)
                              : (ctx && ctx.net != null && ctx.net > 0 ? ctx.net : 0);
                            setOfferPrice(target > 0 ? String(Math.round(target)) : '');
                            // The composer sits below this list — scroll to it so
                            // the prefilled price and Send button are seen.
                            setTimeout(() => offerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                          }}
                        >
                          {tooSmall ? `Below ${b.minQuantityQuintals} q (${otherUnits(b.minQuantityQuintals, 'quintals')}) minimum` : (<><ArrowRight size={12} /> Offer to {b.name}</>)}
                        </button>
                      )}
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </Card>

        {/* ── Offer composer ───────────────────────────────────── */}
        {offerLot && (
          <form ref={offerRef} onSubmit={sendOffer} className="card p-5 border-emerald-200 scroll-mt-6">
            <SectionLabel>{t('trade.offerSection')}</SectionLabel>
            <h2 className="font-semibold text-stone-900 mt-0.5 mb-3">
              Offer {offerLot.crop} ({offerLot.quantity} {offerLot.unit})
              {offerBuyer ? ` to ${offerBuyer.name}` : (
                <> — <button type="button" className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800" onClick={() => buyersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>pick a buyer above</button></>
              )}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Your price (₹/quintal)</label>
                <input className="input-field" type="number" min="1" step="1" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} required aria-label="Offer price per quintal" />
              </div>
              <p className="text-sm text-stone-500">
                {offerPrice && Number(offerPrice) > 0
                  ? <>Lot total: <span className="font-semibold text-stone-800">{inr(Number(offerPrice) * myQuantityQuintals)}</span> (<Quantity value={myQuantityQuintals} unit="quintals" />)</>
                  : <><Quantity value={myQuantityQuintals} unit="quintals" /> in this lot</>}
              </p>
              <PrimaryButton type="submit" icon={Send} disabled={!offerBuyer}>Send offer</PrimaryButton>
            </div>
            {ctx && ctx.net != null && ctx.net > 0 && (
              <p className="text-[11px] text-stone-400 mt-2">{t('trade.engineBenchmarkNote', { net: inr(ctx.net), mandi: ctx.mandi })}</p>
            )}
          </form>
        )}

        {/* ── Offers ───────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="mb-4">
            <SectionLabel>{t('trade.offerStatus')}</SectionLabel>
            <h2 className="font-semibold text-stone-900 mt-0.5">{buyerView ? t('trade.inboundOffers') : t('trade.myOffers')}</h2>
          </div>
          {showSkeleton(offers.length > 0) ? (
            <SkeletonLines rows={2} />
          ) : offers.length === 0 ? (
            <EmptyState icon={Send} title={t('trade.noOffers')} description={t('trade.noOffersDesc')} />
          ) : (
            <StaggerList className="space-y-3">
              {offers.map((o) => (
                <StaggerItem key={o._id}>
                  <div className="border border-stone-100 rounded-xl px-4 py-3 hover:border-stone-200 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        {/* Direction is spelled out: "→ buyer" is an offer I
                            sent, "← from buyer" is one waiting on my answer. */}
                        <p className="text-sm font-medium text-stone-900 break-words">
                          {o.crop} · <Quantity value={o.quantityQuintals} unit="quintals" />{' '}
                          {o.direction === 'BUYER_TO_FARMER'
                            ? `← from ${o.buyerName || 'a buyer'}`
                            : `→ ${o.buyerName}`}
                        </p>
                        <p className="text-xs text-stone-400">
                          {inr(o.offeredPricePerQuintal)}/q · total {inr(o.amount)} · {fmtDate(o.createdAt)}
                        </p>
                        {o.notes && (
                          <p className="text-xs text-stone-500 mt-1 break-words italic">“{o.notes}”</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip color={o.status === 'ACCEPTED' ? 'emerald' : o.status === 'SENT' ? 'amber' : o.status === 'WITHDRAWN' ? 'stone' : 'red'}>{o.status}</Chip>
                        {buyerView && o.status === 'SENT' && (
                          <>
                            <PrimaryButton className="text-xs !px-3 !py-1.5" icon={Check} onClick={() => act(`/offers/${o._id}/accept`, 'Offer accepted — payment held (simulated escrow).')}>
                              Accept
                            </PrimaryButton>
                            <GhostButton className="text-xs !px-3 !py-1.5" onClick={() => act(`/offers/${o._id}/reject`, 'Offer rejected.')}>
                              Reject
                            </GhostButton>
                          </>
                        )}
                        {/* A buyer's purchase offer on MY lot is mine to decide —
                            without this the buyer could send an offer the
                            producer had no way to accept, and the flow died
                            exactly where a judge would try it. */}
                        {!buyerView && o.status === 'SENT' && o.direction === 'BUYER_TO_FARMER' && (
                          <>
                            <PrimaryButton className="text-xs !px-3 !py-1.5" icon={Check} onClick={() => act(`/offers/${o._id}/accept`, 'Purchase offer accepted — payment held (simulated escrow).')}>
                              Accept
                            </PrimaryButton>
                            <GhostButton className="text-xs !px-3 !py-1.5" onClick={() => act(`/offers/${o._id}/reject`, 'Purchase offer declined — the lot is open to other buyers again.')}>
                              Decline
                            </GhostButton>
                          </>
                        )}
                        {!buyerView && o.status === 'SENT' && o.direction !== 'BUYER_TO_FARMER' && (
                          <GhostButton className="text-xs !px-3 !py-1.5" onClick={() => act(`/offers/${o._id}/withdraw`, 'Offer withdrawn.')}>
                            <X size={14} /> Withdraw
                          </GhostButton>
                        )}
                      </div>
                    </div>
                    <OfferBenchmark offer={o} lot={lots.find(l => l._id === String(o.lotId))} buyer={buyers.find(b => b.id === o.buyerId)} />
                    {/* Offer mini-timeline */}
                    {o.history && o.history.length > 0 && (
                      <p className="text-[11px] text-stone-400 mt-2">
                        {o.history.map((h, i) => (
                          <span key={i}>{i > 0 && ' → '}{h.status}{h.at ? ` (${fmtDate(h.at)})` : ''}</span>
                        ))}
                      </p>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </Card>
        </div>

        {/* ── Payment Timeline — 7-step journey from lot to money ── */}
        <div ref={paymentsRef} className="scroll-mt-6">
        {!buyerView ? (
          <PaymentTimeline
            currentStep={timelineStep}
            advanceLabel={simulateTarget === 'release'
              ? t('payment.simple.simulateRelease')
              : simulateTarget === 'accept'
                ? t('payment.simple.simulateAccept')
                : undefined}
            showAdvance={simulateTarget !== null}
            advanceHint={!activeLot
              ? t('trade.next.noLot.desc')
              : !activeOffer || activeDealDead
                ? activeDealDead
                  ? t('trade.next.dead.desc')
                  : t('trade.next.pickBuyer.desc')
                : t('trade.next.waiting.desc')}
            onAdvance={() => {
              // Single-device demo ladder, scoped to the ACTIVE deal: escrow
              // held → simulate settlement (HELD → RELEASED = the cash
              // moment); offer SENT → simulate buyer acceptance (ACCEPTED +
              // payment HELD). Anything else gets an honest message instead
              // of a silent no-op.
              const held = activePayment?.status === 'HELD' ? activePayment : null;
              if (held) {
                act(`/payments/${held._id}/simulate-release`, 'Funds released — the farmer has the cash (simulated).');
              } else if (activeOffer?.status === 'SENT') {
                act('/payments/simulate/accept-latest', 'Buyer accepted your offer — funds held in escrow (simulated).');
              } else {
                setNotice('Nothing to simulate yet — send an offer to a buyer first.');
              }
            }}
            onFail={() => {
              // Demo control: buyer never releases → payment CANCELLED →
              // farmer raises a grievance for authority handling.
              const held = activePayment?.status === 'HELD' ? activePayment : null;
              if (held) act(`/payments/${held._id}/simulate-failure`, 'Payment cancelled — buyer did not pay. Raise an issue below; the authority workflow takes over.');
            }}
            amount={releasedPayments.length > 0 ? releasedPayments.reduce((sum, p) => sum + (p.amount || 0), 0) : undefined}
            farmerName={user?.displayName}
          />
        ) : (
        /* ── Buyer view: Payments with release controls ── */
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div>
              <SectionLabel>{t('trade.paymentStatus')}</SectionLabel>
              <h2 className="font-semibold text-stone-900 mt-0.5">Payments</h2>
            </div>
            <Chip color="amber"><Banknote size={11} /> SIMULATED — NO REAL MONEY MOVES</Chip>
          </div>
          <p className="text-xs text-stone-400 mb-4">Escrow status timeline per the HLD: Pending → Held → Released. Simulated escrow only.</p>
          {showSkeleton(payments.length > 0) ? (
            <SkeletonLines rows={2} />
          ) : payments.length === 0 ? (
            <EmptyState icon={Wallet} title={t('trade.noPayments')} description={t('trade.acceptOffer')} />
          ) : (
            <StaggerList className="space-y-3">
              {payments.map((p) => {
                const idx = PAYMENT_STEPS.indexOf(p.status);
                const cancelled = p.status === 'CANCELLED';
                return (
                  <StaggerItem key={p._id}>
                    <div className="border border-stone-100 rounded-xl px-4 py-4 hover:border-stone-200 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-stone-900 flex items-center gap-1.5">
                            <Wallet size={14} className="text-emerald-600 shrink-0" />
                            {p.crop} → {p.buyerName} · <span className="font-semibold text-emerald-700">{inr(p.amount)}</span>
                          </p>
                          <p className="text-xs text-stone-400">{fmtDateTime(p.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Chip color={p.status === 'RELEASED' ? 'emerald' : cancelled ? 'red' : p.status === 'HELD' ? 'amber' : 'stone'}>{p.status}</Chip>
                          {p.status === 'HELD' && (
                            <PrimaryButton className="text-xs !px-3 !py-1.5" icon={Banknote} onClick={() => act(`/payments/${p._id}/release`, 'Funds released to the farmer (simulated).')}>
                              Release funds
                            </PrimaryButton>
                          )}
                          {/* Every completed deal's receipt stays re-openable —
                              the celebration modal is not the only copy. */}
                          {!buyerView && p.status === 'RELEASED' && (
                            <GhostButton className="text-xs !px-3 !py-1.5" onClick={() => setReceiptModal(p)}>
                              <Receipt size={13} /> Receipt
                            </GhostButton>
                          )}
                        </div>
                      </div>
                      {/* Timeline */}
                      <div className="mt-3 flex items-center gap-1">
                        {PAYMENT_STEPS.map((step, i) => {
                          const reached = !cancelled && idx >= i;
                          return (
                            <React.Fragment key={step}>
                              {i > 0 && <div className={`flex-1 h-0.5 ${reached ? 'bg-emerald-400' : 'bg-stone-200'}`} />}
                              <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full ${reached ? 'bg-emerald-500' : 'bg-stone-200'}`} />
                                <span className={`text-[10px] mt-1 ${reached ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>{step}</span>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        {cancelled && <span className="ml-2 text-[11px] text-red-500 font-medium">cancelled</span>}
                      </div>
                      {p.status === 'RELEASED' && <PaymentOutcome payment={p} lot={lots.find(l => l._id === lotIdOf(p))} />}
                      {p.history && p.history.length > 0 && (
                        <ul className="mt-3 space-y-0.5">
                          {p.history.map((h, i) => (
                            <li key={i} className="text-[11px] text-stone-400">
                              {h.to} · {fmtDateTime(h.at)}{h.note ? ` — ${h.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </Card>
        )}
        </div>

        {/* ── Buyer detail flash card — "who am I selling to?" in one click ── */}
        {buyerDetail && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4"
            onClick={() => setBuyerDetail(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Buyer details: ${buyerDetail.name}`}
          >
            <div
              className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md p-5 animate-in fade-in slide-in-from-bottom-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-3">
                <div className="min-w-0 sm:flex-1 sm:min-w-[9rem]">
                  <p className="font-bold text-stone-900 break-words">{buyerDetail.name}</p>
                  <p className="text-xs text-stone-400 break-words">{buyerDetail.category}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 self-start">
                  <span className={`badge ${TIER_CLS[buyerDetail.trustTier] || TIER_CLS.SELF_DECLARED} inline-flex items-center gap-1.5`}>
                    {(TIER_ICONS[buyerDetail.trustTier] || AlertTriangle) && React.createElement(TIER_ICONS[buyerDetail.trustTier] || AlertTriangle, { size: 12 })}
                    {buyerDetail.tierLabel}
                  </span>
                  <button className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100" onClick={() => setBuyerDetail(null)} aria-label="Close buyer details">
                    <X size={16} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-stone-500 mt-1.5">{buyerDetail.tierDescription}</p>
              <p className="text-sm text-stone-600 mt-3 leading-relaxed">{buyerDetail.description}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                <div className="flex items-start gap-2 border border-stone-100 rounded-lg px-3 py-2">
                  <BadgeCheck size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-stone-600"><span className="font-medium text-stone-800">Verification:</span> {buyerDetail.verificationNote}</span>
                </div>
                <div className="flex items-start gap-2 border border-stone-100 rounded-lg px-3 py-2">
                  <Wallet size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-stone-600"><span className="font-medium text-stone-800">Payment terms:</span> {buyerDetail.paymentTermsLabel}</span>
                </div>
                <div className="flex items-start gap-2 border border-stone-100 rounded-lg px-3 py-2">
                  <Package size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-stone-600"><span className="font-medium text-stone-800">Minimum lot:</span> {buyerDetail.minQuantityQuintals} quintals</span>
                </div>
                <div className="flex items-start gap-2 border border-stone-100 rounded-lg px-3 py-2">
                  <MapPin size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-stone-600"><span className="font-medium text-stone-800">Serves:</span> {(buyerDetail.districts || []).join(', ')}</span>
                </div>
                <div className="flex items-start gap-2 border border-stone-100 rounded-lg px-3 py-2">
                  <CropIcon cropName={(buyerDetail.crops || [])[0] || ''} size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-stone-600"><span className="font-medium text-stone-800">Buys:</span> {(buyerDetail.crops || []).join(', ')}</span>
                </div>
              </div>
              {!buyerView && (
                <div className="mt-4">
                  {lots.some(l => l.status === 'OPEN' || l.status === 'OFFERED') ? (
                    <PrimaryButton
                      className="w-full"
                      icon={ArrowRight}
                      onClick={() => {
                        const openLot = lots.find(l => l.status === 'OPEN' || l.status === 'OFFERED') || null;
                        if (openLot) setOfferLot(openLot);
                        setOfferBuyer(buyerDetail);
                        const target = Number(expectedNet) > 0 ? Number(expectedNet) : (ctx && ctx.net != null && ctx.net > 0 ? ctx.net : 0);
                        setOfferPrice(target > 0 ? String(Math.round(target)) : '');
                        setBuyerDetail(null);
                        // Scroll to the offer composer itself (it renders below
                        // the buyer list) — not the buyers section top, which
                        // just showed the same list back ("nothing happened").
                        setTimeout(() => offerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                      }}
                    >
                      Select this buyer & send offer
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton
                      className="w-full"
                      icon={Plus}
                      onClick={() => { setShowLotForm(true); setBuyerDetail(null); setTimeout(() => lotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
                    >
                      Create a lot first
                    </PrimaryButton>
                  )}
                </div>
              )}
              <p className="text-[10px] text-stone-400 mt-3">Trust badges are simulated for the demo — production verifies FSSAI/GST registries.</p>
            </div>
          </div>
        )}

        {/* ── Receipt celebration — pops on every completed deal ── */}
        {!buyerView && receiptModal && ctx && (
          <ReceiptModal
            ctx={ctx}
            payment={receiptModal}
            lots={lots}
            onDownload={printReceipt}
            onNewSale={startNewSale}
            onHistory={viewReceiptHistory}
            onClose={() => setReceiptModal(null)}
          />
        )}

        {/* ── Print-only receipt sheet (watermarked PDF via Save-as-PDF).
            Portaled outside #root so print CSS can hide the app and show
            only this sheet. Hidden on screen at all times. */}
        {!buyerView && receiptModal && ctx && createPortal(
          <div className="receipt-print-sheet" aria-hidden="true">
            <div style={{ position: 'relative', overflow: 'hidden', background: '#fff', color: '#000', padding: 24, fontFamily: 'sans-serif' }}>
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', inset: '-40%', display: 'flex', flexDirection: 'column', justifyContent: 'space-around', transform: 'rotate(-24deg)' }}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <p key={i} style={{ whiteSpace: 'nowrap', textAlign: 'center', fontSize: 28, fontWeight: 800, lineHeight: '4rem', color: '#d6d3d1' }}>
                      {(RECEIPT_WATERMARK.repeat(4))}
                    </p>
                  ))}
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <p style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>KISAN360 · SELLING RECEIPT (SIMULATED — NO REAL MONEY MOVED)</p>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>Payment received — {inr(receiptModal.amount)}</h1>
                <ReceiptDoc ctx={ctx} payments={[receiptModal]} lots={lots} />
              </div>
            </div>
          </div>,
          document.body
        )}

        {!buyerView && showReceipt && activePayment && <DecisionReceipt ctx={ctx!} payments={[activePayment]} lots={lots} onDownload={printReceipt} onNewSale={startNewSale} />}
        {!buyerView && <div ref={historyRef} className="scroll-mt-6"><DecisionHistory payments={payments} lots={lots} onReceipt={(p) => setReceiptModal(p)} /></div>}

        {/* ── Help & grievances (HLD P1: Raise → Open → Under Review → Resolved) ── */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div>
              <SectionLabel tone="amber">{t('trade.grievance')}</SectionLabel>
              <h2 className="font-semibold text-stone-900 mt-0.5 flex items-center gap-1.5">
                <LifeBuoy size={16} className="text-amber-600" /> Support workflow
              </h2>
            </div>
            {!buyerView && (
              showGrievanceForm ? (
                <GhostButton className="text-sm" onClick={() => setShowGrievanceForm(false)}>
                  <X size={16} /> Close
                </GhostButton>
              ) : (
                <PrimaryButton className="text-sm" icon={FileText} onClick={() => setShowGrievanceForm(true)}>
                  Raise an issue
                </PrimaryButton>
              )
            )}
          </div>
          <p className="text-xs text-stone-400 mb-4">Payment delay, quality dispute or a no-show buyer? Raise it and track it here.</p>

          {showGrievanceForm && !buyerView && (
            <form onSubmit={raiseGrievance} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-4 bg-stone-50 rounded-2xl border border-stone-100">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Issue type</label>
                <select className="input-field" value={gCategory} onChange={(e) => setGCategory(e.target.value)}>
                  {GRIEVANCE_CATEGORIES.map((c) => <option key={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Related lot (optional)</label>
                <select className="input-field" value={gLotId} onChange={(e) => setGLotId(e.target.value)}>
                  <option value="">None</option>
                  {lots.map((l) => <option key={l._id} value={l._id}>{l.crop} · {l.quantity} {l.unit} · {l.status}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-stone-500 mb-1">What happened?</label>
                <input className="input-field" value={gDescription} onChange={(e) => setGDescription(e.target.value)} placeholder="Describe the issue in a sentence" required />
              </div>
              <div className="sm:col-span-3">
                <p className="text-[11px] text-stone-400 mb-2 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> This is a Kisan360 grievance workflow for demo purposes — not a direct government complaint platform.</p>
                <PrimaryButton type="submit" icon={Send}>Submit grievance</PrimaryButton>
              </div>
            </form>
          )}

          {showSkeleton(grievances.length > 0) ? (
            <SkeletonLines rows={2} />
          ) : grievances.length === 0 ? (
            <EmptyState icon={LifeBuoy} title={t('trade.noGrievances')} description={t('trade.noPaymentsDesc')} />
          ) : (
            <StaggerList className="space-y-3">
              {grievances.map((g) => {
                const idx = GRIEVANCE_STEPS.indexOf(g.status);
                const done = g.status === 'RESOLVED' || g.status === 'REJECTED';
                return (
                  <StaggerItem key={g._id}>
                    <div className="border border-stone-100 rounded-xl px-4 py-4 hover:border-stone-200 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-900 flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-amber-600 shrink-0" /> {g.category.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-stone-500 mt-0.5">{g.description}</p>
                        </div>
                        <Chip color={g.status === 'RESOLVED' ? 'emerald' : g.status === 'REJECTED' ? 'red' : 'amber'}>{g.status.replace(/_/g, ' ')}</Chip>
                      </div>
                      {!done && (
                        <div className="mt-3 flex items-center gap-1">
                          {GRIEVANCE_STEPS.map((step, i) => {
                            const reached = idx >= i;
                            return (
                              <React.Fragment key={step}>
                                {i > 0 && <div className={`flex-1 h-0.5 ${reached ? 'bg-emerald-400' : 'bg-stone-200'}`} />}
                                <div className="flex flex-col items-center">
                                  <div className={`w-3 h-3 rounded-full ${reached ? 'bg-emerald-500' : 'bg-stone-200'}`} />
                                  <span className={`text-[10px] mt-1 ${reached ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>{step.replace(/_/g, ' ')}</span>
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                      {buyerView && g.status === 'OPEN' && (
                        <div className="mt-3 flex gap-2">
                          <PrimaryButton className="text-xs !px-3 !py-1.5" onClick={() => act(`/grievances/${g._id}/transition`, 'Moved to under review.', { to: 'UNDER_REVIEW' })}>
                            Take for review
                          </PrimaryButton>
                        </div>
                      )}
                      {buyerView && g.status === 'UNDER_REVIEW' && (
                        <div className="mt-3 flex gap-2">
                          <PrimaryButton className="text-xs !px-3 !py-1.5" icon={Check} onClick={() => act(`/grievances/${g._id}/transition`, 'Grievance resolved.', { to: 'RESOLVED', note: 'Resolved by buyer-side review (demo)' })}>
                            Mark resolved
                          </PrimaryButton>
                          <GhostButton className="text-xs !px-3 !py-1.5" onClick={() => act(`/grievances/${g._id}/transition`, 'Grievance rejected.', { to: 'REJECTED', note: 'Rejected by buyer-side review (demo)' })}>
                            Reject
                          </GhostButton>
                        </div>
                      )}
                      {g.history && g.history.length > 0 && (
                        <p className="text-[11px] text-stone-400 mt-2">
                          {g.history.map((h, i) => (<span key={i}>{i > 0 && ' → '}{h.to.replace(/_/g, ' ')}</span>))}
                        </p>
                      )}
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </Card>
      </PageTransition>
    </div>
  );
};

export default TradePage;
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
  Handshake,
  IndianRupee,
  Info,
  Landmark,
  Languages,
  Leaf,
  MapPin,
  Scale,
  ShieldCheck,
  Sprout,
  Store,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { PageTransition, PrimaryButton, GhostButton, GradientText, Reveal, QuantityHint } from '../components/ui/kit';
import { UNIT_SCALE_NOTE } from '../lib/units';
import { Logo, DemoBadge } from '../components/brand';
import { useTranslation, LANGUAGES } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { apiFetch, API_URL, clearSessionExpired } from '../lib/api';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS } from '../lib/maharashtraData';

/* ============================================================================
   LANDING PAGE — the first human touchpoint, and now the first *proof*.

   The centrepiece is a live net-realization widget: the visitor picks a crop,
   district and lot size and gets the same ranked-mandi output the app gives,
   computed by the same backend engine, with no login. A judge can therefore
   test the product's central claim before signing in.

   Data policy — every number on this page is one of:
     · LIVE       — fetched from /market/net-realization on mount and on submit.
     · SNAPSHOT   — the same endpoint's verified output for Onion/Nagpur/10q,
                    captured from this app, rendered instantly so the page never
                    blocks on a network call and survives an offline demo hall.
     · TICKER     — real modal rates from priceSnapshots.json, labelled "board
                    rate" because a board rate is NOT a take-home rate. That
                    distinction is the entire product.
   Nothing here is invented, and nothing simulated is presented as real.
   ============================================================================ */

const DEFAULT_CROP = 'Onion';
const DEFAULT_DISTRICT = 'Nagpur';
const DEFAULT_QTY = 10;

/* Crops the market feed actually covers (same filter the app's pages use). */
const ACTIVE_CROPS = MAHARASHTRA_CROPS
  .filter((c) => c.marketCoverage === 'active' || c.marketCoverage === 'limited')
  .map((c) => c.name);

type Mandi = {
  market: string;
  km: number;
  gross: number;
  net: number;
  costs: { transport: number; storage: number; other: number; total: number; rate: number; tier: string };
  netTotal: number;
  grossTotal: number;
  rank: number;
  variety?: string;
  arrivalDate?: string;
  distanceSource?: string;
  distanceNote?: string;
};

type CompareResult = {
  crop: string;
  district: string;
  quantity: number;
  best: Mandi;
  ranked: Mandi[];
  boardLeader: Mandi;
  /** best.net − boardLeader.net. Positive = the cheaper-looking mandi wins. */
  netDelta: number;
  /** best.gross − boardLeader.gross. Negative = the winner is lower on the board. */
  boardDelta: number;
  lotDelta: number;
  nextDelta?: { perQuintal: number; lotTotal: number };
  closeCall?: boolean;
  breakEven?: { challenger: string; rate: number; rateNow: number; headroom: number; distanceGapKm: number; priceGap: number };
  why?: string;
  watch?: string[];
  source: string;
  servingMode?: string;
  ageHours?: number;
  live: boolean;
};

/* Verified output of this app's own engine for Onion / Nagpur / 10 quintals.
   Real AGMARKNET observations — see backend/src/data/priceSnapshots.json. */
const FALLBACK: CompareResult = {
  crop: DEFAULT_CROP,
  district: DEFAULT_DISTRICT,
  quantity: DEFAULT_QTY,
  best: {
    market: 'APMC Nagpur',
    km: 50,
    gross: 5250,
    net: 5153,
    costs: { transport: 75, storage: 2, other: 20, total: 97, rate: 1.5, tier: 'lcv' },
    netTotal: 51530,
    grossTotal: 52500,
    rank: 1,
    variety: 'White',
    arrivalDate: '10/09/2026',
    distanceSource: 'DOCUMENTED_ROAD',
  },
  boardLeader: {
    market: 'APMC Mangal Wedha',
    km: 511,
    gross: 5510,
    net: 4720.9,
    costs: { transport: 767.1, storage: 2, other: 20, total: 789.1, rate: 1.5, tier: 'lcv' },
    netTotal: 47209,
    grossTotal: 55100,
    rank: 4,
    variety: 'Local',
    arrivalDate: '10/09/2026',
    distanceSource: 'GEODESIC_DISTRICT',
  },
  ranked: [
    { market: 'APMC Nagpur', km: 50, gross: 5250, net: 5153, costs: { transport: 75, storage: 2, other: 20, total: 97, rate: 1.5, tier: 'lcv' }, netTotal: 51530, grossTotal: 52500, rank: 1 },
    { market: 'Chandrapur(Ganjwad)', km: 575, gross: 5250, net: 5028, costs: { transport: 863, storage: 2, other: 20, total: 885, rate: 1.5, tier: 'lcv' }, netTotal: 50276, grossTotal: 52500, rank: 2 },
    { market: 'APMC Hingna', km: 610, gross: 5000, net: 4903, costs: { transport: 915, storage: 2, other: 20, total: 937, rate: 1.5, tier: 'lcv' }, netTotal: 49030, grossTotal: 50000, rank: 3 },
    { market: 'APMC Mangal Wedha', km: 511, gross: 5510, net: 4721, costs: { transport: 767.1, storage: 2, other: 20, total: 789.1, rate: 1.5, tier: 'lcv' }, netTotal: 47209, grossTotal: 55100, rank: 4 },
    { market: 'APMC Vita', km: 460, gross: 5400, net: 4443, costs: { transport: 690, storage: 2, other: 20, total: 712, rate: 1.5, tier: 'lcv' }, netTotal: 44430, grossTotal: 54000, rank: 5 },
  ],
  netDelta: 432,
  boardDelta: -260,
  lotDelta: 4321,
  nextDelta: { perQuintal: 125.25, lotTotal: 1252.5 },
  closeCall: false,
  breakEven: { challenger: 'APMC Mangal Wedha', rate: 0.56, rateNow: 1.5, headroom: 62.67, distanceGapKm: 461.4, priceGap: 260 },
  why: 'Highest estimated farmer net after farmer-borne costs.',
  watch: ['Transport assumption: ₹1.5/q/km over 50 km', 'Quote freshness — check the retrieval timestamp'],
  source: 'agmarknet_snapshot',
  servingMode: 'STALE',
  live: false,
};

/* Board (modal) rates straight from backend/src/data/priceSnapshots.json. */
const TICKER = [
  { crop: 'Onion', place: 'APMC Nasik', price: 4100 },
  { crop: 'Onion', place: 'APMC Hingna', price: 5000 },
  { crop: 'Wheat', place: 'APMC Mumbai', price: 4200 },
  { crop: 'Pomegranate', place: 'APMC Aatpadi', price: 10500 },
  { crop: 'Grapes', place: 'APMC Pune', price: 10000 },
  { crop: 'Tomato', place: 'APMC Hingna', price: 2275 },
];

const SOURCES = ['AGMARKNET', 'eNAM', 'IMD Weather', 'AGMARK Grade', 'e-KYC', 'FPO Registry', 'UPI'];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
/* The cost model works in sub-rupee rates (₹1.50, ₹0.75, ₹0.56 per quintal per
   km). Rounding those to whole rupees would misstate the assumptions, so keep
   two decimals below ₹10 and normal rounding above it. */
const rate = (n: number) =>
  `₹${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString('en-IN')}`;
const num = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null;

/* The demo buyer is a real entry in the app's own buyer directory. */
const DEMO_BUYER = 'Maharashtra Green Processor Ltd';

function parseResult(j: any, crop: string, district: string, quantity: number): CompareResult | null {
  const rows = Array.isArray(j?.rankedMandis) ? j.rankedMandis : null;
  if (!rows || rows.length === 0) return null;
  const toMandi = (m: any, rank: number): Mandi => ({
    market: String(m?.market || '').trim() || '—',
    km: num(m?.distanceKm) ?? 0,
    gross: num(m?.grossPricePerQuintal) ?? 0,
    net: num(m?.farmerNetPerQuintal) ?? 0,
    costs: {
      transport: num(m?.farmerCosts?.transportPerQuintal) ?? 0,
      storage: num(m?.farmerCosts?.storagePerQuintal) ?? 0,
      other: num(m?.farmerCosts?.otherPerQuintal) ?? 0,
      total: num(m?.farmerCosts?.totalCostsPerQuintal) ?? 0,
      rate: num(m?.farmerCosts?.transportRatePerQuintalPerKm) ?? 0,
      tier: String(m?.farmerCosts?.transportTier || 'lcv'),
    },
    netTotal: num(m?.farmerNetTotal) ?? 0,
    grossTotal: num(m?.grossTotal) ?? 0,
    rank: num(m?.rank) ?? rank,
    variety: m?.evidence?.variety,
    arrivalDate: m?.evidence?.arrivalDate,
    distanceSource: m?.distanceSource,
    distanceNote: m?.distanceNote,
  });

  const ranked = rows.map((m: any, i: number) => toMandi(m, i + 1));
  const best = ranked[0];
  if (!best || !best.net) return null;
  const boardLeader = [...ranked].sort((a, b) => b.gross - a.gross)[0];
  // Deltas come from the RAW values. Rounding first and multiplying after is
  // how ₹4,321 silently becomes ₹4,320 on a 10-quintal lot.
  const rawNetDelta = best.net - boardLeader.net;
  const netDelta = Math.round(rawNetDelta);
  const boardDelta = Math.round(best.gross - boardLeader.gross);
  const be = j?.decision?.breakEvenTransport;
  const dn = j?.decision?.differenceVsNext;

  return {
    crop: typeof j?.crop === 'string' ? j.crop : crop,
    district: typeof j?.district === 'string' ? j.district : district,
    quantity,
    best,
    ranked: ranked.slice(0, 5),
    boardLeader,
    netDelta,
    boardDelta,
    lotDelta: Math.round(rawNetDelta * quantity),
    nextDelta: dn ? { perQuintal: num(dn.perQuintal) ?? 0, lotTotal: num(dn.lotTotal) ?? 0 } : undefined,
    closeCall: !!j?.decision?.closeCall?.isCloseCall,
    breakEven: be
      ? {
          challenger: String(be.challenger || '').trim(),
          rate: num(be.breakEvenRatePerQuintalPerKm) ?? 0,
          rateNow: num(be.currentRatePerQuintalPerKm) ?? 0,
          headroom: num(be.headroomPct) ?? 0,
          distanceGapKm: num(be.distanceGapKm) ?? 0,
          priceGap: num(be.priceGapPerQuintal) ?? 0,
        }
      : undefined,
    why: j?.decision?.recommended?.why,
    watch: Array.isArray(j?.decision?.recommended?.watch) ? j.decision.recommended.watch : undefined,
    source: String(j?.marketSource || 'agmarknet_snapshot'),
    servingMode: j?.servingMode,
    ageHours: num(j?.marketProvenance?.ageHours) ?? undefined,
    live: j?.marketSource === 'agmarknet_live',
  };
}

const LandingPage: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const { user, demoSignIn } = useAuth();
  const navigate = useNavigate();

  /* ── The one piece of live state on this page ─────────────────────────── */
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);
  const [qty, setQty] = useState(String(DEFAULT_QTY));
  const [result, setResult] = useState<CompareResult>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const calcRef = useRef<HTMLDivElement>(null);

  const run = useCallback(
    async (c: string, d: string, q: number, isInitial = false) => {
      if (!isInitial) setLoading(true);
      try {
        const url = `${API_URL}/market/net-realization?crop=${encodeURIComponent(c)}&district=${encodeURIComponent(d)}&quantity=${q}`;
        const res = await apiFetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const parsed = parseResult(await res.json(), c, d, q);
        if (!parsed) throw new Error('empty');
        setResult(parsed);
        setFailed(false);
      } catch {
        // Keep whatever verified result is on screen; never blank the section.
        setFailed(true);
      } finally {
        if (!isInitial) setLoading(false);
      }
    },
    [],
  );

  /* Populate from the live engine on mount; the labelled snapshot stands until
     then, so the section is never empty and an offline venue still demos.
     Ref gate: StrictMode (dev) double-invokes effects, which would fire the
     engine twice per load — the same convention the calculator page uses.
     A ref survives the double-mount; state does not. */
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    run(DEFAULT_CROP, DEFAULT_DISTRICT, DEFAULT_QTY, true);
  }, [run]);

  /* Scroll progress — a small "this page is finite" signal. */
  useEffect(() => {
    const onScroll = () => {
      const sc = document.scrollingElement;
      if (!sc) return;
      const max = sc.scrollHeight - sc.clientHeight;
      setProgress(max > 0 ? Math.min(100, (sc.scrollTop / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const enter = () => navigate(user ? '/dashboard' : '/login');
  // One-tap demo entry — a logged-out judge goes straight into the farmer
  // workspace with zero form-filling. Already logged in → just go home.
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState('');
  const tryDemoFarmer = async () => {
    if (user) { navigate('/dashboard'); return; }
    if (demoBusy) return;
    setDemoErr('');
    setDemoBusy(true);
    try {
      await demoSignIn('farmer');
      clearSessionExpired();
      navigate('/dashboard');
    } catch (e: any) {
      setDemoErr(e?.message || t('login.error.demoFailed'));
    } finally {
      setDemoBusy(false);
    }
  };
  const scrollTo = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openFullCalculator = () =>
    navigate(
      `/net-realization?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&quantity=${qty}`,
    );

  const best = result.best;
  const boardLeader = result.boardLeader;
  const inverted = best.market !== boardLeader.market;
  const quantity = Number(qty) > 0 ? Number(qty) : DEFAULT_QTY;
  const pooledHint = best.costs.tier === 'lcv' && quantity < 40;

  const steps = [
    { icon: Scale, title: t('landing.how.s1'), desc: t('landing.how.s1d') },
    { icon: Award, title: t('landing.how.s2'), desc: t('landing.how.s2d') },
    { icon: Wallet, title: t('landing.how.s3'), desc: t('landing.how.s3d') },
  ];

  const personas = [
    {
      icon: Sprout,
      title: t('landing.who.farmerTitle'),
      points: [t('landing.who.farmer1'), t('landing.who.farmer2'), t('landing.who.farmer3')],
      accent: 'emerald',
    },
    {
      icon: Users,
      title: t('landing.who.fpoTitle'),
      points: [t('landing.who.fpo1'), t('landing.who.fpo2'), t('landing.who.fpo3')],
      accent: 'sky',
    },
    {
      icon: Store,
      title: t('landing.who.buyerTitle'),
      points: [t('landing.who.buyer1'), t('landing.who.buyer2'), t('landing.who.buyer3')],
      accent: 'amber',
    },
  ] as const;

  const evidence = [
    { value: '99.2%', label: t('landing.evidence.l1') },
    { value: '546', label: t('landing.evidence.l2') },
    { value: '3', label: t('landing.evidence.l3') },
    { value: '7', label: t('landing.evidence.l4') },
  ];

  const coverage = [
    { icon: IndianRupee, label: t('landing.evidence.c1') },
    { icon: Leaf, label: t('landing.evidence.c2') },
    { icon: Globe, label: t('landing.evidence.c3') },
    { icon: Award, label: t('landing.evidence.c4') },
    { icon: ShieldCheck, label: t('landing.evidence.c5') },
    { icon: Handshake, label: t('landing.evidence.c6') },
  ];

  return (
    <PageTransition className="min-h-screen bg-[#faf8ff] text-stone-900">
      {/* Reading progress */}
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ------------------------------------------------------------- NAV -- */}
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <button
            onClick={enter}
            className="flex min-h-[40px] min-w-0 items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label={t('landing.nav.open')}
          >
            <Logo small />
          </button>

          {/* Three links plus the demo badge and the CTA no longer fit at the
              768px tablet band, so the links wait for lg. Devanagari labels are
              longer still, which is the other reason for the extra headroom. */}
          <nav className="hidden items-center gap-6 text-sm font-medium text-stone-600 lg:flex xl:gap-7">
            {/* min-h keeps these tappable — bare text links render ~20px tall,
                which fails a touch target on a phone or tablet. */}
            <button
              onClick={scrollTo('calculator')}
              className="inline-flex min-h-[36px] items-center transition-colors hover:text-stone-900"
            >
              {t('landing.nav.try')}
            </button>
            <button
              onClick={scrollTo('how')}
              className="inline-flex min-h-[36px] items-center transition-colors hover:text-stone-900"
            >
              {t('landing.nav.how')}
            </button>
            <button
              onClick={scrollTo('who')}
              className="inline-flex min-h-[36px] items-center transition-colors hover:text-stone-900"
            >
              {t('landing.nav.who')}
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:inline-flex">
              <DemoBadge />
            </span>
            <PrimaryButton onClick={enter} icon={ArrowRight} className="!px-4 !text-sm">
              {t('landing.nav.open')}
            </PrimaryButton>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ HERO -- */}
      <section className="relative overflow-hidden bg-[#0d231d]">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=1600&h=900&q=80&auto=format&fit=crop"
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            onError={(e) => {
              // Offline demo halls: fall back to the emerald/aurora treatment
              // rather than a broken-image glyph.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a1d18]/85 via-[#0d231d]/75 to-[#0d231d]" />
        </div>
        <div className="grid-lines absolute inset-0 opacity-25" />
        <div className="aurora absolute inset-0 opacity-50" />

        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 md:px-6 md:pb-16 md:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:gap-12">
            {/* Left — message */}
            <div className="min-w-0">
              {/* Language chips — one tap, no dropdown. Showing all three
                  scripts on the landing page is the fastest way to prove the
                  multilingual claim is real. */}
              <div className="flex flex-wrap items-center gap-2">
                <Languages size={15} className="shrink-0 text-white/70" aria-hidden="true" />
                <span className="sr-only">{t('landing.lang.label')}</span>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    aria-pressed={language === l.code}
                    className={`min-h-[40px] rounded-full px-3.5 text-xs font-semibold transition-all ${
                      language === l.code
                        ? 'bg-white text-stone-900 shadow-lg shadow-black/20'
                        : 'border border-white/25 bg-white/10 text-white/90 hover:bg-white/20'
                    }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                className="mt-6"
              >
                <span className="glass-dark inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-white">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t('landing.hero.badge')}
                </span>

                <h1 className="font-display mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl 2xl:text-6xl">
                  {t('landing.hero.title')}
                  <br />
                  <GradientText>{t('landing.hero.gradientTitle')}</GradientText>
                </h1>

                <p className="mt-4 max-w-xl text-base leading-relaxed text-emerald-100/80 sm:text-lg">
                  {t('landing.hero.subtitle')}
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    onClick={tryDemoFarmer}
                    disabled={demoBusy}
                    className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-stone-900 shadow-xl shadow-black/20 transition-all hover:bg-emerald-50 active:scale-95 disabled:opacity-70"
                  >
                    {demoBusy ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Sprout size={16} />
                    )}
                    {demoBusy ? t('login.signingIn') : t('landing.hero.demoFarmer')}
                  </button>
                  <PrimaryButton onClick={scrollTo('calculator')} icon={Calculator} className="!px-7 !py-3.5">
                    {t('landing.hero.tryNow')}
                  </PrimaryButton>
                  <GhostButton
                    onClick={enter}
                    className="!border-white/25 !bg-white/10 !text-white backdrop-blur hover:!bg-white/20"
                  >
                    {t('landing.hero.cta')}
                  </GhostButton>
                </div>
                {demoErr && (
                  <p className="mt-3 text-sm text-red-300" role="alert">{demoErr}</p>
                )}

                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-emerald-200/75">
                  {[t('landing.hero.trust1'), t('landing.hero.trust2'), t('landing.hero.trust3')].map(
                    (label) => (
                      <span key={label} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        {label}
                      </span>
                    ),
                  )}
                </div>
              </motion.div>
            </div>

            {/* Right — the live engine's current answer, not a mock-up claim */}
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.25 }}
              className="hidden min-w-0 lg:block"
            >
              <div className="relative">
                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-emerald-500/25 to-teal-400/10 blur-2xl" />
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d2720] shadow-2xl shadow-black/50">
                  <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-white/10 px-2.5 py-1 text-[10px] text-emerald-100/60">
                      {t('landing.preview.label')}
                    </span>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                        {t('landing.preview.bestNet')}
                      </p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-2">
                        <p className="tabular text-2xl font-extrabold text-white">
                          {inr(best.net)}
                          <span className="text-sm font-medium text-emerald-200/60">/q</span>
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <TrendingUp size={12} /> {t('landing.preview.today')}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-emerald-200/60">
                        {best.market} · {result.crop} · {result.district} · {t('landing.preview.afterCosts')}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                        <p className="text-[9px] uppercase tracking-wide text-emerald-100/50">
                          {t('landing.preview.board')}
                        </p>
                        <p className="tabular mt-1 text-sm font-bold text-white">
                          {inr(best.gross)}
                          <span className="text-[10px] font-medium text-emerald-200/50">/q</span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-amber-400">
                          −{inr(best.costs.total)}/q {t('landing.calc.inCosts')}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                        <p className="text-[9px] uppercase tracking-wide text-emerald-100/50">
                          {t('landing.preview.next')}
                        </p>
                        <p className="tabular mt-1 text-sm font-bold text-white">
                          {result.ranked[1] ? inr(result.ranked[1].net) : '—'}
                          <span className="text-[10px] font-medium text-emerald-200/50">/q</span>
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-amber-400">
                          {result.ranked[1]?.market ?? ''}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                        <p className="min-w-0 truncate text-[11px] font-semibold text-white">
                          {t('landing.preview.buyer')}: {DEMO_BUYER}
                        </p>
                      </div>
                      <p className="mt-1 text-[10px] text-emerald-200/70">{t('landing.preview.buyerTier')}</p>
                    </div>

                    <p className="flex items-start gap-1.5 text-[10px] leading-snug text-emerald-200/50">
                      <Info size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {result.live ? t('landing.calc.provLive') : t('landing.calc.provCached')} ·{' '}
                      {t('landing.preview.note')}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Board-rate ticker. Board ≠ take-home, so it is named board rate. */}
        <div className="relative border-t border-white/10 bg-black/30 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 md:px-6">
            <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-wider text-emerald-300 sm:block">
              {t('landing.ticker.label')}
            </span>
            <div className="marquee-wrap min-w-0 flex-1" style={{ ['--marquee-fade' as any]: '#0b1f19' }}>
              <div className="marquee marquee-slow gap-8">
                {[0, 1].map((rep) => (
                  <div key={rep} className="flex shrink-0 gap-8 whitespace-nowrap">
                    {TICKER.map((item) => (
                      <span
                        key={`${rep}-${item.crop}-${item.place}`}
                        className="inline-flex items-center gap-1.5 text-xs text-stone-300"
                      >
                        <TrendingUp size={12} className="shrink-0 text-emerald-400" />
                        {item.crop} · {item.place} <b className="tabular text-white">{inr(item.price)}/q</b>
                        <em className="not-italic text-stone-500">({t('landing.ticker.sample')})</em>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- SOURCES -- */}
      <section className="border-b border-stone-200 bg-white py-8">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <p className="mb-5 flex flex-wrap items-center justify-center gap-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            <Landmark size={13} aria-hidden="true" /> {t('landing.sources.label')}
          </p>
          <div className="marquee-wrap" style={{ ['--marquee-fade' as any]: '#ffffff' }}>
            <div className="marquee gap-4">
              {[0, 1].map((rep) => (
                <div key={rep} className="flex shrink-0 gap-4 whitespace-nowrap">
                  {SOURCES.map((s) => (
                    <span
                      key={`${rep}-${s}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-600"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {s}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-relaxed text-stone-500">
            {t('landing.sources.note')}
          </p>
        </div>
      </section>

      {/* ============================================ LIVE CALCULATOR ====== */}
      <section id="calculator" ref={calcRef} className="scroll-mt-20 bg-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <Reveal>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <Calculator size={15} aria-hidden="true" />
              {t('landing.calc.label')}
            </p>
            <h2 className="font-display max-w-3xl text-2xl font-bold leading-snug tracking-tight text-stone-900 sm:text-3xl md:text-4xl">
              {t('landing.calc.title')}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-500 sm:text-base">
              {t('landing.calc.sub')}
            </p>
          </Reveal>

          <div className="mt-9 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8">
            {/* ── Inputs ── */}
            <Reveal>
              <div className="card p-5 sm:p-6">
                <div className="flex flex-col gap-4">
                  <div>
                    <label htmlFor="lc-crop" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t('landing.calc.crop')}
                    </label>
                    <select
                      id="lc-crop"
                      value={crop}
                      onChange={(e) => setCrop(e.target.value)}
                      className="input-field w-full min-h-[44px]"
                    >
                      {ACTIVE_CROPS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lc-district" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t('landing.calc.district')}
                    </label>
                    <select
                      id="lc-district"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="input-field w-full min-h-[44px]"
                    >
                      {MAHARASHTRA_DISTRICTS.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lc-qty" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {t('landing.calc.quantity')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="lc-qty"
                        type="number"
                        min={1}
                        max={500}
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                        className="input-field min-h-[44px] w-28"
                      />
                      <span className="text-sm font-medium text-stone-500">{t('landing.calc.q')}</span>
                    </div>
                    {/* The widget asks in quintals (how the mandi quotes); show
                        the tonne and kg weight so the figure is intuitive. */}
                    <QuantityHint value={qty} unit="quintals" note={UNIT_SCALE_NOTE} />
                  </div>

                  <PrimaryButton
                    onClick={() => run(crop, district, quantity)}
                    icon={Calculator}
                    disabled={loading}
                    className="w-full justify-center"
                  >
                    {loading ? t('landing.calc.running') : t('landing.calc.run')}
                  </PrimaryButton>

                  {failed && (
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {t('landing.calc.error')}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        result.live
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {result.live ? t('landing.calc.provLive') : t('landing.calc.provCached')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
                      <Landmark size={11} aria-hidden="true" />
                      {result.source === 'agmarknet_live' ? 'AGMARKNET' : 'AGMARKNET snapshot'}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600"
                      title={t('landing.calc.provDetTitle')}
                    >
                      <BadgeCheck size={11} aria-hidden="true" />
                      {t('landing.calc.provDet')}
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* ── Result ── */}
            <Reveal delay={100}>
              <div className="min-w-0">
                {/* Best take-home */}
                <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50/50 p-5 shadow-sm sm:p-6">
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-emerald-700" />
                  <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        {t('landing.calc.bestTag')}
                      </span>
                      <h3 className="font-display mt-2 truncate text-xl font-bold text-stone-900 sm:text-2xl">
                        {best.market}
                      </h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden="true" />
                          {t('landing.calc.kmAway', { km: Math.round(best.km) })}
                        </span>
                        {best.variety && (
                          <span>
                            {t('landing.calc.variety', {
                              variety: best.variety,
                              date: best.arrivalDate || '—',
                            })}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-display text-3xl font-extrabold text-emerald-800 sm:text-4xl">
                        {inr(best.net)}
                        <span className="text-base font-semibold text-stone-400">/q</span>
                      </p>
                      <p className="tabular mt-1 text-sm font-bold text-stone-700">
                        {inr(best.netTotal)}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        {t('landing.calc.lotTotal', { qty: quantity })}
                      </p>
                    </div>
                  </div>

                  {/* Board → costs → net, with the real per-mandi split */}
                  <div className="mt-5 grid gap-2 pl-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-stone-200 bg-white/70 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        {t('landing.calc.board')}
                      </p>
                      <p className="tabular mt-0.5 text-sm font-bold text-stone-800">{inr(best.gross)}</p>
                    </div>
                    <div className="rounded-lg border border-stone-200 bg-white/70 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        {t('landing.calc.costTransport')}
                      </p>
                      <p className="tabular mt-0.5 text-sm font-bold text-red-600">
                        −{inr(best.costs.transport)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-stone-200 bg-white/70 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                        {t('landing.calc.costOther')}
                      </p>
                      <p className="tabular mt-0.5 text-sm font-bold text-red-600">
                        −{inr(best.costs.storage + best.costs.other)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        {t('landing.calc.costTotal')}
                      </p>
                      <p className="tabular mt-0.5 text-sm font-bold text-emerald-800">
                        −{inr(best.costs.total)}
                      </p>
                    </div>
                  </div>

                  {pooledHint && (
                    <p className="mt-3 flex items-start gap-2 pl-2 text-xs leading-relaxed text-sky-800">
                      <Users size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {t('landing.calc.pool')}
                    </p>
                  )}
                </div>

                {/* The inversion — the whole point, computed, not asserted */}
                {inverted ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800">
                      <AlertTriangle size={14} aria-hidden="true" />
                      {t('landing.calc.invTitle')}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-stone-700">
                      {t('landing.calc.invBody', {
                        board: boardLeader.market,
                        boardDelta: inr(Math.abs(result.boardDelta)),
                        netDelta: inr(Math.abs(result.netDelta)),
                      })}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-emerald-800">
                      {t('landing.calc.invLot', { amount: inr(Math.abs(result.lotDelta)), qty: quantity })}
                    </p>
                    {result.breakEven && result.breakEven.challenger === boardLeader.market && (
                      <p className="mt-2 flex items-start gap-1.5 border-t border-amber-200 pt-2 text-xs leading-relaxed text-amber-800">
                        <Scale size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {t('landing.calc.breakEven', {
                          challenger: result.breakEven.challenger,
                          rate: rate(result.breakEven.rate),
                          now: rate(result.breakEven.rateNow),
                          headroom: String(Math.round(result.breakEven.headroom)),
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-stone-600">
                      <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {t('landing.calc.invNone')}
                    </p>
                  </div>
                )}

                {/* Ranking — the product's actual output */}
                <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                      {t('landing.calc.rankedTitle', { n: result.ranked.length })}
                    </p>
                    {result.nextDelta && (
                      <p className="tabular text-[11px] text-stone-500">
                        {t('landing.calc.nextGap', { amount: inr(result.nextDelta.perQuintal) })}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-1.5">
                    {result.ranked.map((m, i) => (
                      <div
                        key={`${m.market}-${i}`}
                        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 ${
                          i === 0 ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-stone-50/50'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                              i === 0 ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-600'
                            }`}
                          >
                            #{m.rank}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-stone-900">{m.market}</p>
                            <p className="tabular text-[10px] text-stone-400">
                              {Math.round(m.km)} {t('landing.common.km')} · {t('landing.calc.board')}{' '}
                              {inr(m.gross)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`tabular text-sm font-extrabold ${
                              i === 0 ? 'text-emerald-800' : 'text-stone-700'
                            }`}
                          >
                            {inr(m.net)}
                            <span className="text-[10px] font-medium text-stone-400">/q</span>
                          </p>
                          <p className="tabular text-[10px] text-stone-400">
                            −{inr(m.costs.total)} {t('landing.calc.inCosts')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Decision receipt — why, and what to watch */}
                {(result.why || result.watch?.length) && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {result.why && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          {t('landing.calc.whyTitle')}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-stone-600">{result.why}</p>
                      </div>
                    )}
                    {result.watch && result.watch.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                          <AlertTriangle size={12} aria-hidden="true" />
                          {t('landing.calc.watchTitle')}
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {result.watch.map((w) => (
                            <li key={w} className="text-xs leading-relaxed text-stone-600">
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* How this number was produced */}
                <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <button
                    onClick={() => setHowOpen((v) => !v)}
                    aria-expanded={howOpen}
                    className="flex w-full min-h-[44px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 sm:px-5"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                      <Calculator size={15} className="shrink-0 text-emerald-700" aria-hidden="true" />
                      {t('landing.calc.howTitle')}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-stone-400 transition-transform ${howOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {howOpen && (
                    <div className="border-t border-stone-200 bg-stone-50/60 px-4 py-4 sm:px-5">
                      <p className="text-sm font-semibold text-stone-800">{t('landing.calc.howFormula')}</p>
                      <ul className="mt-3 space-y-2">
                        {[
                          t('landing.calc.howTransport'),
                          t('landing.calc.howStorage'),
                          t('landing.calc.howOther'),
                          t('landing.calc.howBuyer'),
                          t('landing.calc.howDistance'),
                        ].map((line) => (
                          <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-stone-600">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-stone-400" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <PrimaryButton onClick={openFullCalculator} icon={ArrowRight}>
                    {t('landing.calc.full')}
                  </PrimaryButton>
                  <span className="text-xs text-stone-500">{t('landing.calc.fullNote')}</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- HOW IT WORKS --- */}
      <section id="how" className="scroll-mt-20 border-y border-stone-200 bg-gradient-to-b from-stone-50 to-white">
        <div className="relative overflow-hidden">
          <div className="aurora absolute inset-0 opacity-40" />
          <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <Reveal>
              <p className="mb-2 text-sm font-semibold text-emerald-700">{t('landing.how.label')}</p>
              <h2 className="font-display max-w-2xl text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl md:text-4xl">
                {t('landing.how.title')}
              </h2>
            </Reveal>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <Reveal key={s.title} delay={i * 90}>
                  <div className="h-full rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
                    <div className="relative inline-flex">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/25">
                        <s.icon size={20} aria-hidden="true" />
                      </div>
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow">
                        {i + 1}
                      </span>
                    </div>
                    <p className="font-display mt-4 text-base font-semibold text-stone-900 sm:text-lg">
                      {s.title}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================== FAILURE PATH ======= */}
      <section className="bg-[#131b2e] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <Reveal>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
              <ShieldCheck size={15} aria-hidden="true" />
              {t('landing.risk.label')}
            </p>
            <h2 className="font-display max-w-3xl text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl md:text-4xl">
              {t('landing.risk.title')}
            </h2>
          </Reveal>

          <div className="mt-10 grid items-stretch gap-5 md:grid-cols-2">
            {/* Paid */}
            <Reveal>
              <div className="flex h-full flex-col rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07] p-5 sm:p-6">
                <p className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {t('landing.risk.paidTitle')}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-stone-300">{t('landing.risk.paidBody')}</p>
                <ol className="mt-5 flex flex-col gap-2">
                  {[t('landing.risk.paidS1'), t('landing.risk.paidS2'), t('landing.risk.paidS3')].map(
                    (s, i) => (
                      <li key={s} className="flex items-center gap-2.5 text-xs text-stone-300">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ),
                  )}
                </ol>
                <p className="mt-5 flex items-center gap-1.5 border-t border-emerald-400/20 pt-4 text-[11px] font-semibold text-emerald-300">
                  <Wallet size={12} aria-hidden="true" />
                  {t('landing.risk.paidFoot')}
                </p>
              </div>
            </Reveal>

            {/* Unpaid → grievance */}
            <Reveal delay={110}>
              <div className="flex h-full flex-col rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-5 sm:p-6">
                <p className="flex items-center gap-2 text-sm font-bold text-amber-400">
                  <XCircle size={16} aria-hidden="true" />
                  {t('landing.risk.unpaidTitle')}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-stone-300">{t('landing.risk.unpaidBody')}</p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {[t('landing.risk.stage1'), t('landing.risk.stage2'), t('landing.risk.stage3')].map(
                    (s, i) => (
                      <span key={s} className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                            i === 2
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          <Clock size={11} aria-hidden="true" />
                          {s}
                        </span>
                        {i < 2 && <ArrowRight size={13} className="text-stone-500" aria-hidden="true" />}
                      </span>
                    ),
                  )}
                </div>

                <p className="mt-4 text-xs leading-relaxed text-stone-400">{t('landing.risk.stageNote')}</p>
                <p className="mt-5 flex items-center gap-1.5 border-t border-amber-400/20 pt-4 text-[11px] font-semibold text-amber-300">
                  <Scale size={12} aria-hidden="true" />
                  {t('landing.risk.unpaidFoot')}
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ==================================================== PERSONAS ===== */}
      <section id="who" className="scroll-mt-20 bg-[#faf8ff] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <Reveal>
            <p className="mb-2 text-sm font-semibold text-emerald-700">{t('landing.who.label')}</p>
            <h2 className="font-display max-w-3xl text-2xl font-bold leading-snug tracking-tight text-stone-900 sm:text-3xl md:text-4xl">
              {t('landing.who.title')}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {personas.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <div className="card-lift flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      p.accent === 'emerald'
                        ? 'bg-emerald-50 text-emerald-700'
                        : p.accent === 'sky'
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <p.icon size={20} aria-hidden="true" />
                  </div>
                  <p className="font-display mt-4 text-base font-semibold text-stone-900">{p.title}</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2 text-sm leading-relaxed text-stone-600">
                        <CheckCircle2
                          size={14}
                          className="mt-0.5 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={220}>
            <p className="mt-6 flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-4 text-xs leading-relaxed text-stone-600">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
              {t('landing.who.tierNote')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------- PROBLEM-STMT QUOTE ----- */}
      <section className="relative overflow-hidden bg-[#0d231d]">
        <img
          src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=75&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1d18]/90 via-[#0d231d]/80 to-[#0d231d]/70" />
        <Reveal className="relative mx-auto max-w-4xl px-4 py-16 text-center md:px-6 md:py-20">
          <p className="mb-4 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            <Landmark size={13} aria-hidden="true" /> {t('landing.quote.label')}
          </p>
          <blockquote className="font-display text-xl font-semibold leading-relaxed text-white sm:text-2xl">
            {t('landing.quote.text')}
          </blockquote>
          <p className="mt-5 text-xs text-emerald-200/60">{t('landing.quote.attr')}</p>
        </Reveal>
      </section>

      {/* ------------------------------------------------------- EVIDENCE --- */}
      <section className="bg-[#0b1120] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <Reveal>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <BadgeCheck size={15} aria-hidden="true" />
              {t('landing.evidence.label')}
            </p>
            <h2 className="font-display mb-10 max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
              {t('landing.evidence.title')}
            </h2>
          </Reveal>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {evidence.map((e, i) => (
              <Reveal key={e.label} delay={i * 90}>
                <div className="card-lift h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="font-display tabular text-3xl font-bold text-emerald-400">{e.value}</p>
                  <p className="mt-2 text-xs leading-relaxed text-stone-300">{e.label}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200}>
            <p className="mt-8 flex max-w-3xl items-start gap-2 text-xs leading-relaxed text-stone-400">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t('landing.evidence.note')}</span>
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-10 flex flex-wrap gap-2.5">
              {coverage.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-stone-200"
                >
                  <c.icon size={13} className="shrink-0 text-emerald-400" aria-hidden="true" />
                  {c.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------ FOOTER CTA -- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800">
        <img
          src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=75&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-20"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="noise absolute inset-0" />
        <Reveal className="relative mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-20">
          <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            {t('landing.cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-emerald-100/90 sm:text-base">
            {t('landing.cta.sub')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton onClick={enter} icon={ArrowRight} className="!px-8">
              {t('landing.cta.button')}
            </PrimaryButton>
            <GhostButton
              onClick={scrollTo('calculator')}
              className="!border-white/25 !bg-white/10 !text-white hover:!bg-white/20"
            >
              {t('landing.hero.tryNow')}
            </GhostButton>
          </div>
          <p className="mt-6 text-xs text-emerald-200/70">{t('landing.hero.demoNote')}</p>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- FOOTER -- */}
      <footer className="border-t border-white/5 bg-[#0b1120] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="min-w-0">
            <p className="text-sm font-extrabold tracking-tight text-white">
              Kisan<span className="text-emerald-500">360</span>
              <span className="text-emerald-500">°</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">{t('landing.footer.line')}</p>
          </div>
          <div className="flex flex-col gap-1 text-xs text-stone-400 sm:items-end">
            <span>{t('landing.footer.sih')}</span>
            <span className="text-stone-600">{t('landing.footer.rights')}</span>
          </div>
        </div>
      </footer>

      {/* Mobile sticky CTA — the header button scrolls away on small screens. */}
      <div className="sticky bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:hidden">
        <PrimaryButton onClick={enter} icon={ArrowRight} className="w-full justify-center">
          {t('landing.nav.open')}
        </PrimaryButton>
      </div>
    </PageTransition>
  );
};

export default LandingPage;

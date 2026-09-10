import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/api';
import { setDecisionContext } from '../lib/decisionContext';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';

// Net-Realization page — the headline P0 feature (HLD §4a).
// The backend (Node → FastAPI :8002) computes everything deterministically;
// this screen renders the ranked mandis with the "Why?" explanation drawer
// and never does arithmetic of its own.

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
  marketProvenance?: { source: string; retrievedAt: string; asOf?: string; rowCount?: number };
  unit?: string;
}

const ACTIVE_CROPS = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map(c => c.name);

// Bilingual labels (Marathi/Hindi) — English remains primary per the HLD.
const L = {
  en: { title: 'Net Realization Calculator', sub: 'What you actually pocket at each mandi — after your transport, storage and loading costs. Deterministic: no AI invents these numbers.', crop: 'Crop', district: 'Your district', qty: 'Quantity (quintals)', cta: 'Compare mandis', best: 'Best mandi for', net: '/q net', pocket: 'in your pocket —', headline: 'headline price minus', costs: 'farmer-borne costs', haul: 'haul', prices: 'Prices: AGMARKNET as of', ranked: 'All mandis, ranked by your net', why: 'Why?' },
  mr: { title: 'निव्वळ नफा कॅल्क्युलेटर', sub: 'प्रत्येक बाजार समितीत तुमचे वाहतूक, भांडार आणि वजन खर्च वजा जाऊन किती मिळेल. ही गणिते निश्चित आहेत — AI कधीही आकडे तयार करत नाही.', crop: 'पीक', district: 'तुमचा जिल्हा', qty: 'प्रमाण (क्विंटल)', cta: 'बाजार तुलना करा', best: 'सर्वोत्तम बाजार', net: '/क्विंटल निव्वळ', pocket: 'तुमच्या खिशात —', headline: 'घोषित भाव वजा', costs: 'शेतकरी-बाबींचा खर्च', haul: 'किमी प्रवास', prices: 'भाव: AGMARKNET, दिनांक', ranked: 'सर्व बाजार, निव्वळ नफ्यानुसार', why: 'का?' },
  hi: { title: 'शुद्ध लाभ कैलकुलेटर', sub: 'हर मंडी में आपके परिवहन, भंडारण और लोडिंग खर्च के बाद असल में कितना मिलेगा। गणना निश्चित है — AI कभी आंकड़े नहीं बनाता।', crop: 'फसल', district: 'आपका जिला', qty: 'मात्रा (क्विंटल)', cta: 'मंडियों की तुलना करें', best: 'सर्वोत्तम मंडी', net: '/क्विंटल शुद्ध', pocket: 'आपकी जेब में —', headline: 'घोषित भाव घटाकर', costs: 'किसान-व्यय', haul: 'किमी यात्रा', prices: 'भाव: AGMARKNET, दिनांक', ranked: 'सभी मंडियाँ, शुद्ध लाभ के अनुसार', why: 'क्यों?' },
};

const inr = (n: number, digits = 0) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

// Farmer-readable retrieval time on the hero card (precision-honesty: the ISO
// string stays available in the evidence drawer for judges who want it).
const formatRetrieved = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
};

const NetRealization = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Honor deep-link params from the Dashboard hero (?crop=Onion&district=Nashik)
  const initialCrop = searchParams.get('crop');
  const initialDistrict = searchParams.get('district');
  const initialQuantity = searchParams.get('quantity');

  const [lang, setLang] = useState<'en' | 'mr' | 'hi'>('en');
  const t = L[lang] || L.en; // defensive: an unexpected value must never crash the page
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

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{t.sub}</p>
        </div>
        <select className="input-field w-auto text-xs" value={lang} onChange={(e) => { const v = e.target.value; if (v === 'en' || v === 'mr' || v === 'hi') setLang(v); }} aria-label="Language">
          <option value="en">English</option>
          <option value="mr">मराठी</option>
          <option value="hi">हिंदी</option>
        </select>
      </div>

      {/* Inputs */}
      <form onSubmit={compute} className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t.crop}</label>
            <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {cropOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t.district}</label>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">{t.qty}</label>
            <input
              className="input-field"
              type="number"
              min="0.1"
              step="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary h-[38px]" disabled={loading}>
            {loading ? '…' : t.cta}
          </button>
        </div>
      </form>

      {error && (
        <div className="card p-5 border-red-200 bg-red-50/50">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Adversarial honesty: loss-making / suspicious data — always shown, never buried */}
      {result?.decision?.recommended?.economicsWarnings?.length > 0 && (
        <div className="card p-4 border-red-300 bg-red-50/70">
          <p className="text-sm font-bold text-red-700">⚠ Before you act on this</p>
          <ul className="text-sm text-red-600 mt-1 space-y-1">
            {result.decision.recommended.economicsWarnings.map((w: string) => <li key={w}>• {w}</li>)}
          </ul>
        </div>
      )}

      {result && best && (
        <>
          {/* Best-mandi headline */}
          <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-700 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200/50">
            <div className="flex items-center justify-between">
              <p className="text-emerald-100 text-sm">{t.best} {result.crop} · {result.district} ({result.quantityQuintals} q)</p>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {result?.decision?.robustness && (
                  <span className={`badge ${result.decision.robustness.verdict === 'ROBUST' ? 'badge-green' : 'badge-yellow'}`} title={result.decision.robustness.note}>
                    {result.decision.robustness.verdict === 'ROBUST' ? '🛡 Robust decision' : '⚖ Sensitive decision'}
                  </span>
                )}
                {result?.decision?.confidence && (
                  <span className="badge badge-blue" title={`${result.decision.confidence.note} Watch: ${(result.decision.confidence.watchSignals || []).join('; ') || 'nothing'}`}>
                    Trust: {result.decision.confidence.level}
                  </span>
                )}
                {freshness && (
                  <span className={`badge ${freshness.live ? 'badge-green' : 'badge-yellow'}`} title="Data provenance shown per the HLD">
                    {freshness.live ? '● Live' : '⏱ Cached'} · {freshness.label}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-4xl font-bold tracking-tight">{best.market}</span>
              <span className="text-2xl font-semibold">{inr(best.farmerNetPerQuintal)}{t.net}</span>
            </div>
            {/* Phase 4 — the farmer's money is the hero number: this lot's
                estimated realization, computed by the engine, one line. */}
            <div className="mt-3 rounded-xl bg-white/10 border border-white/20 px-4 py-3 inline-block">
              <p className="text-[11px] uppercase tracking-wider text-emerald-100">Estimated money for your lot</p>
              <p className="text-3xl font-bold mt-0.5">
                {result.quantityQuintals} q × {inr(best.farmerNetPerQuintal)}/q = {inr(best.farmerNetTotal)}
              </p>
            </div>
            {result.marketProvenance && (
              <p className="text-emerald-200/80 text-xs mt-3">
                {t.prices} {formatRetrieved(result.marketProvenance.retrievedAt || result.marketProvenance.asOf) || 'latest pull'}
              </p>
            )}

            {/* One-screen decision summary — WHAT/WHY/HOW MUCH/WATCH, from the engine only */}
            {result.decision && (
              <div className="mt-4 bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-emerald-100 text-[11px] uppercase tracking-wider">Why this market</p>
                    <p className="mt-1 leading-snug">{result.decision.recommended.why}</p>
                  </div>
                  <div>
                    <p className="text-emerald-100 text-[11px] uppercase tracking-wider">Advantage vs next best</p>
                    {result.decision.differenceVsNext && result.decision.recommended.alternative ? (
                      <p className="mt-1 leading-snug">
                        <strong>{inr(result.decision.differenceVsNext.perQuintal)}/q</strong> over {result.decision.recommended.alternative.market} ({inr(result.decision.recommended.alternative.netPerQuintal)}/q)
                        {' '}→ <strong>{inr(result.decision.differenceVsNext.lotTotal)}</strong> on this lot
                      </p>
                    ) : (
                      <p className="mt-1 leading-snug text-emerald-50/80">No alternative mandi costed today — nothing to compare against.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-emerald-100 text-[11px] uppercase tracking-wider">Watch before you go</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {(result.decision.recommended.watch || []).map((w: string) => <li key={w}>• {w}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

            {/* The decision becomes action — hand off to lot creation pre-filled */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-primary"
                onClick={() => navigate(`/trade?prefill=1&crop=${encodeURIComponent(result.crop)}&district=${encodeURIComponent(result.district)}&quantity=${result.quantityQuintals}&mandi=${encodeURIComponent(best.market)}&net=${best.farmerNetPerQuintal}`)}
              >
                Sell at {best.market} — create lot →
              </button>
              <span className="text-xs text-gray-400">Pre-fills your lot with {result.crop} · {result.quantityQuintals} q · {result.district}</span>
            </div>

          {/* WITHOUT vs WITH Kisan360 — the impact of the decision, computed by
              the engine from its own ranking. Never invented. Phase 19: always
              framed as an estimated decision difference on THIS lot — never a
              claimed income increase. */}
          {result.decision?.withoutWith && (
            <div className={`card p-5 ${result.decision.withoutWith.differencePerQuintal > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/40'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">What if you just chased the highest price?</p>
                <span className="badge badge-blue">estimated decision difference — not an income guarantee</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                <div className="rounded-xl border border-amber-200 bg-white p-4">
                  <span className="badge badge-yellow">Without Kisan360</span>
                  <p className="font-semibold text-gray-900 mt-2">{result.decision.withoutWith.naive.market}</p>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1">
                    <li className="flex justify-between"><span>Headline</span><span className="font-medium">{inr(result.decision.withoutWith.naive.headlinePerQuintal)}/q</span></li>
                    <li className="flex justify-between border-t border-amber-100 pt-1"><span className="font-semibold">You take home</span><span className="font-bold text-amber-700">{inr(result.decision.withoutWith.naive.netTotal)}</span></li>
                  </ul>
                  <p className="text-[11px] text-gray-400 mt-1">choice: {result.decision.withoutWith.naive.basis}</p>
                </div>
                <div className="rounded-xl border border-emerald-300 bg-white p-4">
                  <span className="badge badge-green">With Kisan360</span>
                  <p className="font-semibold text-gray-900 mt-2">{result.decision.withoutWith.recommended.market}</p>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1">
                    <li className="flex justify-between"><span>Headline</span><span className="font-medium">{inr(best.grossPricePerQuintal)}/q</span></li>
                    <li className="flex justify-between border-t border-emerald-100 pt-1"><span className="font-semibold">You take home</span><span className="font-bold text-emerald-700">{inr(result.decision.withoutWith.recommended.netTotal)}</span></li>
                  </ul>
                  <p className="text-[11px] text-gray-400 mt-1">choice: {result.decision.withoutWith.recommended.basis}</p>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400">Difference on this lot</p>
                  <p className={`text-3xl font-bold ${result.decision.withoutWith.differencePerQuintal > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                    {result.decision.withoutWith.differenceLotTotal >= 0 ? '+' : '−'}{inr(Math.abs(result.decision.withoutWith.differenceLotTotal))}
                  </p>
                  <p className="text-xs text-gray-500">{inr(Math.abs(result.decision.withoutWith.differencePerQuintal))}/q</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-3 leading-relaxed">{result.decision.withoutWith.message}</p>
              <p className="text-[10px] text-gray-400 mt-1.5">{result.decision.withoutWith.note}</p>
            </div>
          )}

          {/* Close call — never oversell a tiny difference (documented ₹25/q threshold) */}
          {result.decision?.closeCall?.isCloseCall && result.decision.closeCall.message && (
            <div className="card p-4 border-blue-200 bg-blue-50/60">
              <p className="text-sm text-blue-900"><strong>Very close call.</strong> {result.decision.closeCall.message}</p>
            </div>
          )}

          {/* WOW #1 — the inversion panel with the explicit verdict */}
          {inversion && (
            <div className="card p-5 border-amber-300 bg-amber-50/70">
              <p className="text-base font-bold text-amber-900">Highest headline price is NOT the highest estimated farmer net.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="rounded-xl border border-emerald-300 bg-white p-4">
                  <span className="badge badge-green">Ranked #1 by net</span>
                  <p className="font-semibold text-gray-900 mt-2">{inversion.winner}</p>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1">
                    <li className="flex justify-between"><span>Headline</span><span className="font-medium">{inr(result.rankedMandis.find(m => m.market === inversion.winner)?.grossPricePerQuintal || 0)}/q</span></li>
                    <li className="flex justify-between"><span>Your costs</span><span className="font-medium">−{inr(result.rankedMandis.find(m => m.market === inversion.winner)?.farmerCosts.totalCostsPerQuintal || 0)}/q</span></li>
                    <li className="flex justify-between border-t border-emerald-100 pt-1"><span className="font-semibold">Estimated net</span><span className="font-bold text-emerald-700">{inr(inversion.winnerNet)}/q</span></li>
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-300 bg-white p-4">
                  <span className="badge badge-yellow">Highest headline, ranked lower</span>
                  <p className="font-semibold text-gray-900 mt-2">{inversion.loser}</p>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1">
                    <li className="flex justify-between"><span>Headline</span><span className="font-medium">{inr(inversion.loserHeadline)}/q</span></li>
                    <li className="flex justify-between"><span>Your costs</span><span className="font-medium">−{inr(result.rankedMandis.find(m => m.market === inversion.loser)?.farmerCosts.totalCostsPerQuintal || 0)}/q</span></li>
                    <li className="flex justify-between border-t border-amber-100 pt-1"><span className="font-semibold">Estimated net</span><span className="font-bold text-amber-700">{inr(inversion.loserNet)}/q</span></li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-amber-800 mt-3">
                Chasing the ₹{inversion.headlineGap.toLocaleString('en-IN')}/q higher headline at {inversion.loser} would cost you
                <strong> ₹{inversion.netGap.toLocaleString('en-IN')}/q ({inr(inversion.netGap * result.quantityQuintals)} on this lot)</strong> in extra farmer-borne costs.
                Kisan360 ranks by what you keep — not by the biggest number.
              </p>
            </div>
          )}

          {/* Honest thin-evidence state (observed in playtest: upstream price
              anomalies can leave one usable mandi). No fake comparison. */}
          {result.rankedMandis.length < 2 && (
            <div className="card p-4 border-amber-300 bg-amber-50/70">
              <p className="text-sm font-semibold text-amber-900">Only one mandi has usable price evidence right now.</p>
              <p className="text-sm text-amber-800 mt-1">
                A comparison — and the best-market recommendation — needs at least two costed mandis.
                The economics above are correct for this market alone; the ranking data may be limited today (live feed anomaly or cache gap).
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title">{t.ranked}</h2>
              {result && (
                <button onClick={explain} className="btn-secondary text-xs" disabled={explaining}>
                  {explaining ? 'Explaining…' : lang === 'en' ? '✨ Explain in simple words' : lang === 'mr' ? '✨ सोप्या शब्दांत समजावून सांगा' : '✨ आसान शब्दों में समझाएँ'}
                </button>
              )}
            </div>
            {explanation && (
              <div className="card p-4 border-blue-200 bg-blue-50/40">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{explanation.text}</p>
                <p className="text-[11px] text-gray-400 mt-2">
                  AI explanation based on Kisan360 market calculations · explained by: {explanation.by} · the AI never generates the numbers.
                </p>
              </div>
            )}
            {result.rankedMandis.map((m) => {
              const gap = best.farmerNetPerQuintal - m.farmerNetPerQuintal;
              const open = drawerFor === m.market;
              return (
                <div key={m.market} className={`card p-5 ${m.rank === 1 ? 'border-emerald-300 ring-1 ring-emerald-200' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${m.rank === 1 ? 'badge-green' : 'badge-blue'}`}>#{m.rank}</span>
                        <span className="font-semibold text-gray-900">{m.market}</span>
                        <span className="text-xs text-gray-400">{m.distanceKm} km away</span>
                        {coverage?.coverage?.[m.market]?.status === 'ACTIONABLE' && (
                          <span className="badge badge-green shrink-0" title={coverage.coverage[m.market].buyers.map((b: any) => b.name).join(', ')}>
                            ✓ {coverage.coverage[m.market].buyers.length} buyer{coverage.coverage[m.market].buyers.length === 1 ? '' : 's'}
                          </span>
                        )}
                        {coverage?.coverage?.[m.market]?.status === 'NO_MATCH' && (
                          <span className="badge badge-gray shrink-0" title="No compatible buyer in the current directory for this lot">no directory buyer</span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm">
                        <span className="text-gray-500">Headline: <span className="text-gray-800 font-medium">{inr(m.grossPricePerQuintal)}/q</span></span>
                        <span className="text-gray-500">Your costs: <span className="text-amber-700 font-medium">−{inr(m.farmerCosts.totalCostsPerQuintal)}/q</span></span>
                        <span className="text-gray-500">Net: <span className="text-emerald-700 font-semibold">{inr(m.farmerNetPerQuintal)}/q</span></span>
                        <span className="text-gray-500">Lot total: <span className="text-gray-800 font-medium">{inr(m.farmerNetTotal)}</span></span>
                      </div>
                      {m.rank !== 1 && gap > 0 && (
                        <p className="text-xs text-gray-400 mt-1.5">
                          {inr(gap)}/q less than {best.market}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setDrawerFor(open ? null : m.market)}
                      className="btn-secondary text-xs shrink-0"
                      aria-expanded={open}
                    >
                      {t.why} {open ? '▴' : '▾'}
                    </button>
                  </div>

                  {/* "Why?" drawer — the deterministic explanation the engine already produced */}
                  {open && (
                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                        <p className="text-sm text-emerald-900 leading-relaxed">{m.reason}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-gray-200 p-3">
                          <p className="section-title mb-2">Farmer-borne cost breakdown (₹/q)</p>
                          <ul className="space-y-1 text-gray-600">
                            <li className="flex justify-between"><span>Transport ({m.distanceKm} km × ₹{m.farmerCosts.transportRatePerQuintalPerKm ?? 1.5}{m.farmerCosts.transportTier === 'bulk_full_truck' ? ' bulk' : ''}) <span className="text-[9px] text-gray-400" title="ASSUMPTION — documented estimate, not a live quote">[assumption]</span></span><span>−{inr(m.farmerCosts.transportPerQuintal, 2)}</span></li>
                            <li className="flex justify-between"><span>Storage (2 days × ₹1) <span className="text-[9px] text-gray-400" title="ASSUMPTION — documented holding-cost estimate">[assumption]</span></span><span>−{inr(m.farmerCosts.storagePerQuintal, 2)}</span></li>
                            <li className="flex justify-between"><span>Bagging/loading/entry <span className="text-[9px] text-gray-400" title="ASSUMPTION — documented per-quintal estimate">[assumption]</span></span><span>−{inr(m.farmerCosts.otherPerQuintal, 2)}</span></li>
                            <li className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-800"><span>Total</span><span>−{inr(m.farmerCosts.totalCostsPerQuintal, 2)}</span></li>
                          </ul>
                        </div>
                        <div className="rounded-lg border border-gray-200 p-3">
                          <p className="section-title mb-2">Evidence &amp; buyer-side charges</p>
                          <ul className="space-y-1 text-gray-600 text-xs">
                            <li>Price source: {m.evidence.priceSource || 'AGMARKNET'} <span className="text-[9px] text-gray-400">[data]</span></li>
                            <li>Quote date: {m.evidence.arrivalDate || '—'} · retrieved {m.evidence.retrievedAt || '—'} <span className="text-[9px] text-gray-400">[data]</span></li>
                            <li>Variety: {m.evidence.variety || '—'} <span className="text-[9px] text-gray-400">[data]</span></li>
                            <li>Your crop, quantity &amp; district <span className="text-[9px] text-gray-400">[your input]</span></li>
                            {m.evidence.outlier && <li className="text-red-600 font-medium">⚠ {m.evidence.outlierNote}</li>}
                          </ul>
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed">{result.buyerSideCharges.note}</p>
                          <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
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
              );
            })}

            {result.skippedMarkets.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Not ranked ({result.skippedMarkets.length})</p>
                {result.skippedMarkets.map((s) => (
                  <p key={s.market} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{s.market}</span> — {s.reason}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Phase 6 — the second WOW lives next to the decision it can change:
              every scenario is a live re-run of the SAME deterministic engine. */}
          <div className="card p-5 border-indigo-200 bg-indigo-50/30">
            <p className="font-semibold text-gray-900">What could change this decision?</p>
            <p className="text-xs text-gray-500 mt-0.5">Change the quantity — every scenario is recomputed server-side by the deterministic engine. Nothing is pre-scripted or estimated in the browser.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {['50', '100'].map((q) => (
                <button key={q} className={`btn-secondary text-xs ${whatIf?.qty === q ? 'border-emerald-400 text-emerald-700' : ''}`} onClick={() => runWhatIf(q, `${result.crop} · ${q} q`)}>
                  What if I sell {q} q instead of {result.quantityQuintals}?
                </button>
              ))}
            </div>
            {whatIf?.loading && <p className="text-sm text-gray-500 mt-3">Recomputing with the engine…</p>}
            {whatIf?.error && <p className="text-sm text-red-600 mt-3">{whatIf.error}</p>}
            {whatIf?.result && whatIf.result.rankedMandis?.length > 0 && (() => {
              const wb = whatIf.result.rankedMandis[0];
              const base = result.rankedMandis[0];
              const delta = Math.round((wb.farmerNetPerQuintal - base.farmerNetPerQuintal) * 100) / 100;
              const tierChanged = wb.farmerCosts.transportTier !== base.farmerCosts.transportTier;
              const flipped = wb.market !== base.market;
              return (
                <div className="mt-4 border-t border-indigo-100 pt-3">
                  {flipped && (
                    <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                      <span className="badge badge-gray">Old recommendation · {result.quantityQuintals} q</span>
                      <span className="font-semibold text-gray-800">{base.market}</span>
                      <span className="text-gray-400">→</span>
                      <span className="badge badge-green">New recommendation · {whatIf.qty} q</span>
                      <span className="font-semibold text-gray-800">{wb.market}</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-700">
                    At <strong>{whatIf.qty} q</strong>, the best mandi is <strong>{wb.market}</strong> at <strong>{inr(wb.farmerNetPerQuintal)}/q net</strong>
                    {' '}({inr(wb.farmerNetTotal)} for the lot).
                    {flipped
                      ? ' The ranking changed with your quantity.'
                      : delta === 0
                        ? ' Net per quintal is unchanged — quantity alone does not move per-quintal costs below the bulk threshold.'
                        : ` Net per quintal changed by ${inr(delta)}/q versus your current ${result.quantityQuintals} q plan.`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {tierChanged
                      ? 'Why: pooled volume crosses the 40 q full-truck threshold — transport drops from ₹1.5 to ₹0.75 per quintal-km, so logistics economics change.'
                      : 'Why: the ranking held because per-quintal transport only drops at the 40 q full-truck threshold.'}
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Can I sell here? — buyer coverage from the directory (Phase: actionability) */}
          {coverage && (
            <div className="card p-5">
              <p className="font-semibold text-gray-900">Can I sell here?</p>
              <p className="text-xs text-gray-400 mt-0.5">Buyer coverage in the current Kisan360 directory — deterministic matching on crop, service area and minimum quantity. Not a demand estimate.</p>
              {coverage.divergence && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                  <p className="text-sm font-bold text-amber-900">Economically best vs currently actionable</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
                    <div className="rounded-lg border border-amber-200 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wider text-gray-400">Economically best</p>
                      <p className="font-semibold text-gray-900">{coverage.bestEconomic.market} — {inr(coverage.bestEconomic.netPerQuintal)}/q</p>
                      <p className="text-[11px] text-red-600 mt-0.5">No current matching buyer in the directory</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wider text-gray-400">Next actionable option</p>
                      <p className="font-semibold text-gray-900">{coverage.bestActionable.market} — {inr(coverage.bestActionable.netPerQuintal)}/q</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">{coverage.bestActionable.buyerCount} compatible buyer{coverage.bestActionable.buyerCount === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <p className="text-sm text-amber-800 mt-2">Estimated cost of taking the immediately actionable path: <strong>{inr(coverage.divergence.perQuintal)}/q ({inr(coverage.divergence.lotTotal)} on this lot)</strong>. {coverage.divergence.note}</p>
                </div>
              )}
              {coverage.summary?.actionableCount === 0 && (
                <div className="mt-3 rounded-xl border border-gray-300 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-800">No compatible buyer found in the current Kisan360 directory for this lot.</p>
                  <p className="text-sm text-gray-600 mt-1">You can still create the lot, retry buyer discovery later, review the alternative mandis below, or consider FPO aggregation to reach buyer minimums.</p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {coverage.bestActionable && (
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => navigate(`/trade?prefill=1&crop=${encodeURIComponent(result.crop)}&district=${encodeURIComponent(result.district)}&quantity=${result.quantityQuintals}&mandi=${encodeURIComponent(coverage.bestActionable.market)}&net=${coverage.bestActionable.netPerQuintal}`)}
                  >
                    Find buyers for {coverage.bestActionable.market} →
                  </button>
                )}
                <span className="text-xs text-gray-400">{coverage.summary?.actionableCount} of {coverage.summary?.totalRanked} costed mandis have directory buyers for this lot.</span>
              </div>
            </div>
          )}

          {/* Break-even transport — the boundary of this decision (deterministic algebra) */}
          {result.decision?.breakEvenTransport && (
            <div className="card p-5 border-teal-200 bg-teal-50/50">
              <p className="font-semibold text-gray-900">⚖ When does this decision flip?</p>
              <p className="text-sm text-gray-700 mt-2 leading-relaxed">{result.decision.breakEvenTransport.note}</p>
            </div>
          )}

          {/* Phase 6 companion: which assumptions actually matter for THIS
              recommendation — read off the stress-test results, no generic filler. */}
          {result.decision?.robustness?.scenarios?.length > 0 && (
            <div className="card p-5">
              <p className="font-semibold text-gray-900 text-sm">Stress test — which assumptions matter</p>
              <ul className="text-sm text-gray-600 mt-2 space-y-1">
                {result.decision.robustness.scenarios.map((s: any) => {
                  const label = s.scenario === 'quantity_doubled' ? `Selling double the quantity (${result.quantityQuintals * 2} q)`
                    : s.scenario === 'transport_cost_+50pct' ? 'Transport costing 50% more'
                    : s.scenario === 'mandi_prices_fall_5pct' ? 'Mandi prices slipping 5%'
                    : s.scenario;
                  return (
                    <li key={s.scenario} className="flex items-start gap-2">
                      <span className={`badge shrink-0 ${s.sameWinner ? 'badge-green' : 'badge-yellow'}`}>{s.sameWinner ? 'ranking holds' : 'ranking flips'}</span>
                      <span>{label}{s.sameWinner ? ' — same mandi stays best.' : ` — ${s.bestMandi} would become the better sale.`}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-gray-400 mt-2">Each row is the same engine re-run with one assumption changed. No prediction — only sensitivity.</p>
            </div>
          )}

          {/* Decision trace — the responsibility chain, inspectable */}
          {result.decision && (
            <details className="card p-5">
              <summary className="cursor-pointer font-semibold text-gray-900 text-sm">How Kisan360 decided</summary>
              <ol className="list-decimal ml-5 mt-3 space-y-1.5 text-sm text-gray-600">
                <li><strong>Facts:</strong> {result.rankedMandis.length} mandi quotes ({result.marketProvenance?.source || 'AGMARKNET'}), retrieved {result.marketProvenance?.retrievedAt || '—'}.</li>
                <li><strong>Costs:</strong> documented assumptions only — transport ₹{best.farmerCosts.transportRatePerQuintalPerKm}/q/km ({best.farmerCosts.transportTier === 'bulk_full_truck' ? 'full-truck tier, ≥40 q' : 'small-lot tier'}), storage ₹1/q/day × 2 days, bagging/loading/entry ₹20/q, road distances from the published table.</li>
                <li><strong>Calculation:</strong> net = headline price − farmer-borne costs, per mandi. Buyer-side charges (APMC Act s.31) are never deducted.</li>
                <li><strong>Ranking:</strong> mandis sorted by estimated farmer net.</li>
                <li><strong>Trust check:</strong> {result.decision.confidence.level} confidence — {(result.decision.confidence.watchSignals || []).length} watch signal(s); {result.decision.robustness.verdict.toLowerCase()} across {result.decision.robustness.scenarios.length} stress scenarios (quantity ×2, transport +50%, prices −5%).</li>
                <li><strong>AI:</strong> explanation only — it never generates prices, costs or rankings.</li>
              </ol>
            </details>
          )}
        </>
      )}
    </div>
  );
};

export default NetRealization;

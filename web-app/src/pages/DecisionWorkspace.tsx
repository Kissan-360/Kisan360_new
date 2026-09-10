// DecisionWorkspace — the unified farmer decision experience.
// INFORM → COMPARE → DECIDE → CONNECT → SELL
//
// The farmer enters crop + district + quantity ONCE at the top.
// All five stages read from this shared context.
// No AI invents numbers. Every calculation is deterministic.
// Every claim has provenance.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiFetch, API_URL } from '../lib/api';
import {
  DistrictSelector, CropSelector, QuantityInput,
  DISTRICT_COORDS, DEFAULT_DISTRICT,
} from '../components/DistrictSelector';
import {
  saveDecisionContext, loadDecisionContext, DEFAULT_CONTEXT, LotContext,
} from '../lib/decisionContext';
import { DataProvenance } from '../components/DataProvenance';

// ── Provenance badge ─────────────────────────────────────────────────────
const TrustBadge: React.FC<{ source: string }> = ({ source }) => {
  const s = source?.toLowerCase() || '';
  if (s.includes('live')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">LIVE</span>;
  if (s.includes('cached') || s.includes('snapshot')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">CACHED</span>;
  if (s.includes('history') || s.includes('observed')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">HISTORICAL</span>;
  if (s.includes('derived')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">DERIVED</span>;
  if (s.includes('assumption') || s.includes('documented')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">ASSUMPTION</span>;
  if (s.includes('demo') || s.includes('static')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">DEMO</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{source || 'UNKNOWN'}</span>;
};

const ConfidenceBadge: React.FC<{ level: string }> = ({ level }) => {
  const cls = level === 'STRONG' ? 'bg-green-100 text-green-700'
    : level === 'GOOD' ? 'bg-emerald-100 text-emerald-700'
    : level === 'CAUTION' ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{level}</span>;
};

const inr = (n?: number) => n != null ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—';
const inrExact = (n?: number) => n != null ? `₹${n.toLocaleString('en-IN')}` : '—';

// ── Welcome card (shown before first analysis) ──────────────────────────
const EXAMPLE_SCENARIOS = [
  { crop: 'Onion', district: 'Nashik', quantity: 10, label: 'Onion · Nashik · 10 quintals' },
  { crop: 'Onion', district: 'Nashik', quantity: 50, label: 'Onion · Nashik · 50 quintals (bulk)' },
  { crop: 'Soyabean', district: 'Akola', quantity: 12, label: 'Soybean · Akola · 12 quintals' },
];

const WelcomeCard: React.FC<{ onSelect: (crop: string, district: string, quantity: string) => void }> = ({ onSelect }) => (
  <div className="card p-6 border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white">
    <div className="text-center max-w-2xl mx-auto">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-100 flex items-center justify-center">
        <span className="text-2xl">🌾</span>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">What should you do with your lot today?</h2>
      <p className="text-sm text-gray-500 mb-5">
        Enter your crop, location and quantity above — then click <strong>Analyze</strong> to see
        market evidence, compare options, and get a recommendation backed by real government price data.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_SCENARIOS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect(s.crop, s.district, String(s.quantity))}
            className="text-xs px-3 py-1.5 rounded-full border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-medium"
          >
            Try: {s.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">
        Prices sourced from AGMARKNET (Govt. of India). All calculations deterministic — no AI invents numbers.
      </p>
    </div>
  </div>
);

// ── Loading skeleton ─────────────────────────────────────────────────────
const SkeletonCard: React.FC = () => (
  <div className="card p-4 animate-pulse">
    <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3">
          <div className="h-3 bg-gray-100 rounded flex-1" />
          <div className="h-3 bg-gray-100 rounded w-16" />
          <div className="h-3 bg-gray-100 rounded w-16" />
        </div>
      ))}
    </div>
  </div>
);

// ── Actionable error banner ──────────────────────────────────────────────
const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
    <span className="text-red-500 text-sm mt-0.5">⚠️</span>
    <div className="flex-1">
      <p className="text-sm text-red-700 font-medium">{message}</p>
      <p className="text-xs text-red-500 mt-0.5">
        {message.includes('unavailable') || message.includes('connection')
          ? 'Check that the backend server is running on port 5050.'
          : 'Try adjusting your crop, district, or quantity and try again.'}
      </p>
    </div>
    {onRetry && (
      <button onClick={onRetry} className="text-xs text-red-600 underline hover:text-red-800 whitespace-nowrap">
        Retry
      </button>
    )}
  </div>
);

// ── Stage tabs ───────────────────────────────────────────────────────────
type Stage = 'inform' | 'compare' | 'decide' | 'connect' | 'sell';
const STAGES: { key: Stage; label: string; icon: string }[] = [
  { key: 'inform', label: 'Inform', icon: '📊' },
  { key: 'compare', label: 'Compare', icon: '⚖️' },
  { key: 'decide', label: 'Decide', icon: '🎯' },
  { key: 'connect', label: 'Connect', icon: '🤝' },
  { key: 'sell', label: 'Sell', icon: '💰' },
];

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
const DecisionWorkspace = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Shared lot context — entered once, used across all stages
  const saved = loadDecisionContext();
  const [crop, setCrop] = useState(saved?.crop || DEFAULT_CONTEXT.crop);
  const [district, setDistrict] = useState(saved?.district || DEFAULT_CONTEXT.district);
  const [quantity, setQuantity] = useState(String(saved?.quantityQuintals || DEFAULT_CONTEXT.quantityQuintals));
  const [grade, setGrade] = useState(saved?.grade || 'Unassessed');

  // Track whether user has run an analysis
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  // Active stage
  const [activeStage, setActiveStage] = useState<Stage>('inform');

  // Data states
  const [marketData, setMarketData] = useState<any>(null);
  const [pathwayData, setPathwayData] = useState<any>(null);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const qty = parseFloat(quantity) > 0 ? parseFloat(quantity) : 10;

  // Save context whenever it changes
  useEffect(() => {
    saveDecisionContext({ crop, district, quantityQuintals: qty, grade });
  }, [crop, district, qty, grade]);

  // Fetch market data (net-realization)
  const fetchMarketData = useCallback(async (override?: { crop?: string; district?: string; qty?: number }) => {
    const c = override?.crop ?? crop;
    const d = override?.district ?? district;
    const q = override?.qty ?? qty;
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`${API_URL}/market/net-realization?crop=${encodeURIComponent(c)}&district=${encodeURIComponent(d)}&quantity=${q}`);
      const data = await res.json();
      if (data.success) setMarketData(data);
      else setError(data.error || 'Failed to fetch market data');
    } catch (e: any) {
      setError('Market data unavailable — check backend connection');
    } finally { setLoading(false); }
  }, [crop, district, qty]);

  // Fetch pathway data
  const fetchPathwayData = useCallback(async (override?: { crop?: string; district?: string; qty?: number; grade?: string }) => {
    const c = override?.crop ?? crop;
    const d = override?.district ?? district;
    const q = override?.qty ?? qty;
    const g = override?.grade ?? grade;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ crop: c, district: d, quantity: String(q), grade: g });
      const res = await apiFetch(`${API_URL}/market/pathways?${params}`);
      const data = await res.json();
      if (data.success) setPathwayData(data);
      else setError(data.error || 'Failed to fetch pathway data');
    } catch (e: any) {
      setError('Pathway data unavailable');
    } finally { setLoading(false); }
  }, [crop, district, qty, grade]);

  // Fetch weather for selected district
  const fetchWeather = useCallback(async (overrideDistrict?: string) => {
    const d = overrideDistrict ?? district;
    const coords = DISTRICT_COORDS[d] || DISTRICT_COORDS[DEFAULT_DISTRICT];
    try {
      const res = await apiFetch(`${API_URL}/weather?latitude=${coords.lat}&longitude=${coords.lon}`);
      const data = await res.json();
      if (data.location) setWeatherData(data);
    } catch { /* weather is optional */ }
  }, [district]);

  // Auto-fetch when stage changes, but ONLY after first analysis
  useEffect(() => {
    if (!hasAnalyzed) return;
    if (activeStage === 'inform') { fetchWeather(); fetchMarketData(); }
    if (activeStage === 'compare') fetchMarketData();
    if (activeStage === 'decide') fetchPathwayData();
  }, [activeStage, hasAnalyzed, fetchMarketData, fetchPathwayData, fetchWeather]);

  // No auto-fetch on mount — show welcome card instead
  // Data loads only when user clicks Analyze or selects an example scenario

  const rankedMandis = marketData?.rankedMandis || [];
  const bestMandi = rankedMandis[0];
  const skippedMarkets = marketData?.skippedMarkets || [];
  const decision = marketData?.decision || {};
  const pathways = pathwayData?.pathways || [];
  const recommendation = pathwayData?.recommendation;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Farmer Decision Workspace</h1>
        <p className="text-sm text-gray-500 mt-0.5">Enter your lot once. See market evidence, compare options, decide, find buyers, and sell.</p>
      </div>

      {/* ── LOT INPUT (shared context) ─────────────────────────────────── */}
      <div className="card p-4 border-emerald-200 bg-emerald-50/30">
        <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold mb-2">Your Lot</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <CropSelector value={crop} onChange={setCrop} />
          <DistrictSelector value={district} onChange={setDistrict} />
          <QuantityInput value={quantity} onChange={setQuantity} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grade</label>
            <select value={grade} onChange={e => setGrade(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 w-full">
              {['Unassessed', 'A', 'B', 'C'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <button onClick={() => { setHasAnalyzed(true); fetchMarketData(); fetchPathwayData(); fetchWeather(); }}
            className="btn-primary text-sm h-[38px]" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : 'Analyze →'}
          </button>
        </div>
        {error && <ErrorBanner message={error} onRetry={() => { setHasAnalyzed(true); fetchMarketData(); fetchPathwayData(); fetchWeather(); }} />}
      </div>

      {/* ── STAGE TABS ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {STAGES.map(s => {
          const hasData = (
            (s.key === 'inform' || s.key === 'compare' || s.key === 'decide') && rankedMandis.length > 0
          ) || (
            s.key === 'connect' && (pathwayData?.pathways?.length > 0)
          ) || (
            s.key === 'sell' && (recommendation)
          );
          return (
            <button key={s.key}
              onClick={() => setActiveStage(s.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeStage === s.key
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              <span>{s.icon}</span>
              <span>{s.label}</span>
              {hasData && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── STAGE CONTENT ──────────────────────────────────────────────── */}
      <div className="min-h-[400px]">
        {!hasAnalyzed && !marketData && (
          <WelcomeCard onSelect={(c, d, q) => {
            setCrop(c); setDistrict(d); setQuantity(q);
            // hasAnalyzed triggers the useEffect which fetches with new state
            setHasAnalyzed(true);
          }} />
        )}
        {(hasAnalyzed || marketData) && loading && !marketData && (
          <SkeletonCard />
        )}
        {(hasAnalyzed || marketData) && (activeStage === 'inform') && (
          <InformStage
            crop={crop} district={district} quantity={qty}
            marketData={marketData} weatherData={weatherData}
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
            crop={crop} district={district} quantity={qty}
            pathwayData={pathwayData} loading={loading}
            onFindBuyers={() => setActiveStage('connect')}
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
            user={user}
          />
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 1: INFORM
// ══════════════════════════════════════════════════════════════════════════
const InformStage: React.FC<{
  crop: string; district: string; quantity: number;
  marketData: any; weatherData: any; loading: boolean;
}> = ({ crop, district, quantity, marketData, weatherData, loading }) => {
  const rankedMandis = marketData?.rankedMandis || [];
  const provenance = marketData?.marketProvenance || marketData?.provenance;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">What's happening around {crop} in {district}?</h2>
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>

      {/* Data source */}
      {provenance && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <TrustBadge source={provenance.source || marketData?.marketSource || ''} />
          <span>Source: {provenance.source || marketData?.marketSource || 'unknown'}</span>
          {provenance.retrievedAt && <span>· Retrieved {new Date(provenance.retrievedAt).toLocaleString('en-IN')}</span>}
          {provenance.ageHours != null && <span>· {provenance.ageHours}h old</span>}
          {provenance.note && <span className="italic">· {provenance.note}</span>}
        </div>
      )}

      {/* Data provenance — what is real, what is catalog */}
      <DataProvenance crop={crop} district={district} quantity={quantity} />

      {/* Market prices */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Mandi Prices ({crop})</h3>
        {rankedMandis.length === 0 ? (
          <p className="text-sm text-gray-400">No market data available for this crop and district.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 pr-4">Market</th>
                  <th className="pb-2 pr-4 text-right">Headline</th>
                  <th className="pb-2 pr-4 text-right">Est. Net/q</th>
                  <th className="pb-2 pr-4 text-right">Distance</th>
                  <th className="pb-2">Freshness</th>
                </tr>
              </thead>
              <tbody>
                {rankedMandis.slice(0, 8).map((m: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-gray-800">{m.market}</span>
                      {m.rank === 1 && <span className="ml-1 text-[10px] text-emerald-600 font-medium">#1</span>}
                    </td>
                    <td className="py-2 pr-4 text-right">{inr(m.grossPricePerQuintal)}/q</td>
                    <td className="py-2 pr-4 text-right font-medium text-emerald-700">{inr(m.farmerNetPerQuintal)}/q</td>
                    <td className="py-2 pr-4 text-right text-gray-500">
                      <span>{m.distanceKm} km</span>
                      <span className={`block text-[10px] ${m.distanceSource === 'DOCUMENTED_ROAD' ? 'text-gray-400' : 'text-amber-600'}`}>
                        {m.distanceSource === 'DOCUMENTED_ROAD' ? 'Documented' : 'Estimated'}
                      </span>
                    </td>
                    <td className="py-2">
                      {m.evidence?.arrivalDate && <span className="text-xs text-gray-400">Quote: {m.evidence.arrivalDate}</span>}
                      {m.evidence?.retrievedAt && <span className="text-xs text-gray-400 ml-2">Retrieved: {new Date(m.evidence.retrievedAt).toLocaleDateString('en-IN')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weather */}
      {weatherData && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Weather — {weatherData.location?.name || district}</h3>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-gray-900">{weatherData.current?.temperature}°C</span>
            <span className="text-sm text-gray-600 capitalize">{weatherData.current?.description}</span>
            <span className="text-xs text-gray-400">Humidity: {weatherData.current?.humidity}%</span>
            <span className="text-xs text-gray-400">Wind: {weatherData.current?.windSpeed} km/h</span>
          </div>
          {weatherData.agriculturalAdvice?.length > 0 && (
            <ul className="mt-2 text-xs text-gray-500 space-y-0.5">
              {weatherData.agriculturalAdvice.map((a: string, i: number) => <li key={i}>• {a}</li>)}
            </ul>
          )}
          <p className="text-[10px] text-gray-400 mt-1"><TrustBadge source="live" /> Weather for {district} district</p>
        </div>
      )}

      {/* Key insight */}
      {rankedMandis.length >= 2 && (
        <div className="card p-4 border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">💡</span>
            <p className="text-sm font-semibold text-amber-800">Key Insight</p>
          </div>
          <p className="text-xs text-amber-700">
            {rankedMandis[0]?.market} has the highest estimated net at {inr(rankedMandis[0]?.farmerNetPerQuintal)}/q.
            {rankedMandis[0]?.market !== rankedMandis.find((m: any) => m.grossPricePerQuintal === Math.max(...rankedMandis.map((x: any) => x.grossPricePerQuintal)))?.market
              ? ` The highest headline price is at a different market — transport costs change the economics.`
              : ` It also has the highest headline price in today's data.`
            }
          </p>
        </div>
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
  const withoutWith = decision?.withoutWith;
  const closeCall = decision?.closeCall;
  const robustness = decision?.robustness;
  const confidence = decision?.confidence;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Compare: {crop} from {district} — {quantity}q</h2>
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>

      {/* WITHOUT vs WITH Kisan360 */}
      {withoutWith && (
        <div className="card p-4 border-emerald-200">
          <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-2">
            {withoutWith.differencePerQuintal === 0 ? 'Confirms the obvious choice with evidence' : 'The highest headline price is NOT the best net'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-3 rounded-lg ${withoutWith.differencePerQuintal === 0 ? 'bg-gray-50' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-[10px] uppercase text-gray-500 font-medium">Without Kisan360</p>
              <p className="text-sm font-semibold mt-1">{withoutWith.naive.market}</p>
              <p className="text-xs text-gray-600">Headline: {inr(withoutWith.naive.headlinePerQuintal)}/q</p>
              <p className="text-xs text-gray-600">You take home: {inr(withoutWith.naive.netTotal)}</p>
              <p className="text-[10px] text-gray-400 mt-1">choice: {withoutWith.naive.basis}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <p className="text-[10px] uppercase text-emerald-600 font-medium">With Kisan360</p>
              <p className="text-sm font-semibold mt-1">{withoutWith.recommended.market}</p>
              <p className="text-xs text-gray-600">Estimated net: {inr(withoutWith.recommended.netPerQuintal)}/q</p>
              <p className="text-xs text-gray-600">You take home: {inr(withoutWith.recommended.netTotal)}</p>
              <p className="text-[10px] text-emerald-600 mt-1">choice: {withoutWith.recommended.basis}</p>
            </div>
          </div>
          {withoutWith.differencePerQuintal !== 0 && (
            <p className="text-sm font-semibold text-emerald-700 mt-2">
              Difference: {inr(withoutWith.differenceLotTotal)} on this lot ({inrExact(withoutWith.differencePerQuintal)}/q)
            </p>
          )}
          {withoutWith.message && <p className="text-xs text-gray-500 mt-1">{withoutWith.message}</p>}
        </div>
      )}

      {/* Confidence + robustness */}
      <div className="flex flex-wrap gap-3">
        {confidence && (
          <div className="card p-3 flex-1 min-w-[200px]">
            <p className="text-[10px] uppercase text-gray-500 font-medium mb-1">Evidence Confidence</p>
            <ConfidenceBadge level={confidence.level} />
            {confidence.goodSignals?.map((s: string, i: number) => <p key={i} className="text-[11px] text-green-700 mt-0.5">✓ {s}</p>)}
            {confidence.watchSignals?.map((s: string, i: number) => <p key={i} className="text-[11px] text-amber-600 mt-0.5">⚠ {s}</p>)}
          </div>
        )}
        {robustness && (
          <div className="card p-3 flex-1 min-w-[200px]">
            <p className="text-[10px] uppercase text-gray-500 font-medium mb-1">Robustness</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${robustness.verdict === 'ROBUST' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {robustness.verdict}
            </span>
            {robustness.scenarios?.map((s: any, i: number) => (
              <p key={i} className={`text-[11px] mt-0.5 ${s.sameWinner ? 'text-green-600' : 'text-amber-600'}`}>
                {s.sameWinner ? '✓' : '⚠'} {s.scenario}: {s.bestMandi || 'N/A'}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Full ranked table */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">All Markets — Ranked by Your Net</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2 pr-4">Market</th>
                <th className="pb-2 pr-4 text-right">Headline</th>
                <th className="pb-2 pr-4 text-right">Transport</th>
                <th className="pb-2 pr-4 text-right">Storage</th>
                <th className="pb-2 pr-4 text-right">Other</th>
                <th className="pb-2 pr-4 text-right">Net/q</th>
                <th className="pb-2 pr-4 text-right">Lot Total</th>
                <th className="pb-2">Why?</th>
              </tr>
            </thead>
            <tbody>
              {rankedMandis.map((m: any) => (
                <tr key={m.rank} className={`border-b border-gray-50 last:border-0 ${m.rank === 1 ? 'bg-emerald-50/50' : ''}`}>
                  <td className="py-2 pr-2 text-xs text-gray-400">{m.rank}</td>
                  <td className="py-2 pr-4">
                    <span className="font-medium text-gray-800">{m.market}</span>
                    <span className="text-[10px] text-gray-400 ml-1">{m.distanceKm}km {m.distanceSource === 'DOCUMENTED_ROAD' ? '' : '(est.)'}</span>
                  </td>
                  <td className="py-2 pr-4 text-right">{inr(m.grossPricePerQuintal)}</td>
                  <td className="py-2 pr-4 text-right text-red-600">-{inr(m.farmerCosts?.transportPerQuintal)}</td>
                  <td className="py-2 pr-4 text-right text-red-600">-{inr(m.farmerCosts?.storagePerQuintal)}</td>
                  <td className="py-2 pr-4 text-right text-red-600">-{inr(m.farmerCosts?.otherPerQuintal)}</td>
                  <td className="py-2 pr-4 text-right font-medium text-emerald-700">{inr(m.farmerNetPerQuintal)}</td>
                  <td className="py-2 pr-4 text-right font-medium">{inr(m.farmerNetTotal)}</td>
                  <td className="py-2 text-[11px] text-gray-500 max-w-[200px] truncate">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Skipped markets */}
      {skippedMarkets.length > 0 && (
        <div className="card p-4 border-gray-200">
          <p className="text-xs uppercase text-gray-500 font-semibold mb-2">Excluded Markets ({skippedMarkets.length})</p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {skippedMarkets.map((s: any, i: number) => (
              <li key={i}>• {s.market} ({inr(s.grossPricePerQuintal)}/q) — {s.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Close call */}
      {closeCall?.isCloseCall && (
        <div className="card p-3 border-amber-200 bg-amber-50/50">
          <p className="text-xs text-amber-700">⚠ {closeCall.message}</p>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 3: DECIDE
// ══════════════════════════════════════════════════════════════════════════
const DecideStage: React.FC<{
  crop: string; district: string; quantity: number;
  pathwayData: any; loading: boolean; onFindBuyers: () => void;
}> = ({ crop, district, quantity, pathwayData, loading, onFindBuyers }) => {
  const pathways = pathwayData?.pathways || [];
  const recommendation = pathwayData?.recommendation;
  const economicSummary = pathwayData?.economicSummary;
  const dataBasis = pathwayData?.dataBasis;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Best Option for This Lot</h2>
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>

      {/* Economic Best vs Recommended Action — the core insight */}
      {economicSummary && (
        <div className="card p-4 border-blue-200 bg-blue-50/50">
          <p className="text-[10px] uppercase text-blue-600 font-semibold mb-2">Economic Analysis</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase text-gray-500">Highest Headline Price</p>
              <p className="text-sm font-semibold text-gray-700">{economicSummary.bestMarket || '—'}</p>
              <p className="text-xs text-gray-500">₹{economicSummary.bestNetPerQuintal?.toLocaleString('en-IN')}/q net after costs</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase text-gray-500">Best Net Realization</p>
              <p className="text-sm font-semibold text-blue-800">{economicSummary.bestMarket || '—'}</p>
              <p className="text-xs text-blue-600">₹{economicSummary.bestNetPerQuintal?.toLocaleString('en-IN')}/q × {quantity}q = ₹{economicSummary.bestNetTotal?.toLocaleString('en-IN')}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase text-gray-500">Recommended Action</p>
              <p className="text-sm font-bold text-emerald-800">{pathways.find((p: any) => p.pathway === economicSummary.recommendedPathway)?.label || economicSummary.recommendedPathway}</p>
              <p className="text-xs text-emerald-600">at {economicSummary.recommendedMarket || economicSummary.bestMarket}</p>
            </div>
          </div>
          {economicSummary.reasonForDifference && (
            <div className="mt-2 pt-2 border-t border-blue-100">
              <p className="text-[11px] text-blue-700"><span className="font-semibold">Why they differ:</span> {economicSummary.reasonForDifference}</p>
            </div>
          )}
        </div>
      )}

      {/* Recommendation card */}
      {recommendation && (
        <div className="card p-4 border-emerald-300 bg-emerald-50/50">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-emerald-900">
              Recommended: {pathways.find((p: any) => p.pathway === recommendation.pathway)?.label || recommendation.pathway}
            </p>
            <ConfidenceBadge level={recommendation.confidence} />
          </div>
          <ul className="text-xs text-emerald-700 mt-1 space-y-0.5">
            {recommendation.why?.map((w: string, i: number) => <li key={i}>• {w}</li>)}
          </ul>
          {recommendation.note && <p className="text-[11px] text-emerald-600 mt-1 italic">{recommendation.note}</p>}

          {/* Decision trace */}
          {recommendation.evaluatedRules && recommendation.evaluatedRules.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-emerald-600 cursor-pointer hover:text-emerald-800">
                How this was decided ({recommendation.evaluatedRules.length} steps evaluated)
              </summary>
              <div className="mt-2 space-y-2 ml-2">
                {recommendation.evaluatedRules.map((r: any, i: number) => (
                  <div key={i} className="text-[10px]">
                    <p className="font-medium text-emerald-700">Step {r.step}: {r.name} → {r.result}</p>
                    {r.checks?.map((c: any, j: number) => (
                      <p key={j} className={`ml-3 ${c.pass ? 'text-green-600' : 'text-amber-600'}`}>
                        {c.pass ? '✓' : '✗'} {c.check}: {c.detail}
                      </p>
                    ))}
                    {r.reason && <p className="ml-3 text-emerald-600 italic">{r.reason}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Pathway cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pathways.map((p: any) => {
          const isRec = recommendation?.pathway === p.pathway;
          return (
            <div key={p.pathway} className={`card p-4 ${isRec ? 'border-emerald-400 bg-emerald-50/30 ring-1 ring-emerald-200' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-800">{p.label}</h3>
                {isRec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">RECOMMENDED</span>}
                {p.available === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">N/A</span>}
              </div>

              {p.estimatedNetPerQuintal != null && (
                <div className="mb-2">
                  <p className="text-[10px] uppercase text-gray-500">Estimated Net</p>
                  <p className="text-lg font-bold text-gray-900">{inr(p.estimatedNetPerQuintal)}/q</p>
                  {p.estimatedNetTotal && <p className="text-xs text-gray-600">{inr(p.estimatedNetTotal)} for {quantity}q lot</p>}
                </div>
              )}

              {p.transportSavingPerQuintal > 0 && (
                <div className="mb-2 p-2 bg-emerald-50 rounded">
                  <p className="text-xs text-emerald-700 font-medium">Transport saving: {inr(p.transportSavingPerQuintal)}/q ({inr(p.transportSavingTotal)} on this lot)</p>
                </div>
              )}

              {p.breakevenPricePerQuintal && (
                <div className="mb-2 p-2 bg-amber-50 rounded">
                  <p className="text-xs text-amber-700">Breakeven: sale price must exceed {inr(p.breakevenPricePerQuintal)}/q</p>
                  {p.advantageNeeded && <p className="text-[11px] text-amber-600">Price increase needed: {inr(p.advantageNeeded)}/q — this is a threshold, not a prediction</p>}
                </div>
              )}

              <ul className="text-[11px] text-gray-600 space-y-0.5 mb-2">
                {p.why?.map((w: string, i: number) => <li key={i}>• {w}</li>)}
              </ul>

              {p.assumptions && (
                <details className="mt-1">
                  <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Assumptions</summary>
                  <ul className="text-[10px] text-gray-400 mt-0.5 space-y-0.5 ml-2">
                    {p.assumptions.map((a: string, i: number) => <li key={i}>• {a}</li>)}
                  </ul>
                </details>
              )}

              {p.pathway === 'SELL_NOW' && (
                <button onClick={onFindBuyers} className="mt-2 btn-primary text-xs w-full">
                  Find buyers for {p.mandi || 'this market'} →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Data basis */}
      {dataBasis && (
        <div className="card p-3 border-gray-200">
          <p className="text-[10px] uppercase text-gray-500 font-semibold mb-1">Data Basis</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {Object.entries(dataBasis).map(([k, v]) => (
              <div key={k} className="text-[11px]">
                <span className="text-gray-500">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>{' '}
                <TrustBadge source={String(v)} /> <span className="text-gray-400">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
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
  const [buyers, setBuyers] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Connect: Find Buyers</h2>
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>

      <p className="text-xs text-gray-500">
        <TrustBadge source="demo" /> Buyer directory is static demo data — production would verify against live buyer profiles.
      </p>

      {/* Compatible requirements */}
      {requirements.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Compatible Buyer Requirements ({requirements.length})</h3>
          <div className="space-y-3">
            {requirements.map((r: any, i: number) => (
              <div key={i} className="p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-800">{r.buyerName || r.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    r.overallCompatibility === 'STRONG' ? 'bg-emerald-100 text-emerald-700' :
                    r.overallCompatibility === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{r.overallCompatibility}</span>
                </div>
                <div className="text-[11px] text-gray-600 space-y-0.5">
                  <p>Crop: {r.crop} · Quantity: {r.quantityRange?.min || 0}–{r.quantityRange?.max || '∞'}q</p>
                  <p>Service: {r.serviceDistricts?.join(', ')}</p>
                  {r.qualityMatch && <p>Quality: {r.qualityMatch.matchLevel} — {r.qualityMatch.reasons?.join('; ')}</p>}
                  {r.paymentTerms && <p>Payment: {r.paymentTerms}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buyers */}
      {buyers.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Buyer Directory ({buyers.length})</h3>
          <div className="space-y-2">
            {buyers.map((b: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2 border border-gray-100 rounded">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{b.name}</p>
                  <p className="text-[11px] text-gray-500">{b.crops?.join(', ')} · {b.districts?.join(', ')}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{b.trustTier}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {requirements.length === 0 && buyers.length === 0 && !loading && (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-400">No compatible buyers found in the demo directory for {crop} in {district}.</p>
          <p className="text-xs text-gray-400 mt-1">Try changing the crop, district, or quantity.</p>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// STAGE 5: SELL
// ══════════════════════════════════════════════════════════════════════════
const SellStage: React.FC<{
  crop: string; district: string; quantity: number; grade: string;
  marketData: any; pathwayData: any; user: any;
}> = ({ crop, district, quantity, grade, marketData, pathwayData, user }) => {
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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Sell: Execute the Decision</h2>

      {/* Decision summary */}
      <div className="card p-4 border-emerald-200">
        <p className="text-[10px] uppercase text-emerald-700 font-semibold mb-1">Your Decision</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Crop</p>
            <p className="font-medium">{crop}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">District</p>
            <p className="font-medium">{district}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Quantity</p>
            <p className="font-medium">{quantity}q</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Grade</p>
            <p className="font-medium">{grade}</p>
          </div>
        </div>
        {bestMandi && (
          <div className="mt-3 p-3 bg-emerald-50 rounded-lg">
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
      </div>

      {/* Action */}
      <div className="card p-4 text-center">
        <p className="text-sm text-gray-600 mb-3">
          Ready to create a lot and find buyers for your {crop} in {district}?
        </p>
        <button onClick={goToTrade} className="btn-primary px-6">
          Create Lot & Find Buyers →
        </button>
        <p className="text-[10px] text-gray-400 mt-2">
          This will open the Trade page with your decision context pre-filled.
          Payments are simulated for the demo.
        </p>
      </div>
    </div>
  );
};

export default DecisionWorkspace;

import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch, API_URL, getDemoUser } from '../lib/api';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';

const inr = (n: number) => n != null ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—';

const SIGNAL_COLORS: Record<string, string> = {
  FAVORABLE_NOW: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  NEUTRAL: 'bg-gray-100 text-gray-700 border-gray-300',
  WEAK_RELATIVE_TO_HISTORY: 'bg-amber-100 text-amber-800 border-amber-300',
  INSUFFICIENT_EVIDENCE: 'bg-gray-50 text-gray-500 border-gray-200',
};

const SIGNAL_LABELS: Record<string, string> = {
  FAVORABLE_NOW: 'Favorable now',
  NEUTRAL: 'Neutral',
  WEAK_RELATIVE_TO_HISTORY: 'Weak relative to history',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};

const MATCH_COLORS: Record<string, string> = {
  STRONG: 'bg-emerald-100 text-emerald-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  WEAK: 'bg-gray-100 text-gray-600',
  INCOMPATIBLE: 'bg-red-100 text-red-700',
};

interface Pathway {
  pathway: string;
  label: string;
  description: string;
  estimatedNetPerQuintal?: number;
  estimatedNetTotal?: number;
  mandi?: string;
  distanceKm?: number;
  transportPerQuintal?: number;
  transportTotal?: number;
  transportTier?: string;
  buyerCoverage?: any;
  saleWindow?: any;
  arrivals?: any;
  storageOption?: any;
  storageCostPerQuintal?: number;
  storageCostTotal?: number;
  breakevenPricePerQuintal?: number;
  currentNetPerQuintal?: number;
  advantageNeeded?: number;
  isBulkQualified?: boolean;
  bulkThreshold?: number;
  transportSavingPerQuintal?: number;
  transportSavingTotal?: number;
  buyerCount?: number;
  economicCost?: number;
  why?: string[];
  evidence?: any[];
  assumptions?: string[];
  available?: boolean;
}

interface PathwayResult {
  success: boolean;
  crop: string;
  district: string;
  quantityQuintals: number;
  pathways: Pathway[];
  recommendation: { pathway: string; why: string[]; confidence: string; note?: string };
  outcome: any;
  unknowns: string[];
  assumptions: string[];
  dataBasis: Record<string, string>;
}

export default function PathwayPage() {
  const { user } = useAuth();
  const [crop, setCrop] = useState('Onion');
  const [district, setDistrict] = useState('Nashik');
  const [quantity, setQuantity] = useState('10');
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PathwayResult | null>(null);
  const [error, setError] = useState('');

  const activeCrops = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map(c => c.name);

  const compute = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ crop, district, quantity });
      if (grade) params.set('grade', grade);
      const res = await apiFetch(`${API_URL}/market/pathways?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to compute pathways');
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Failed to compute pathways');
    } finally {
      setLoading(false);
    }
  };

  const renderPathway = (p: Pathway) => {
    const isRecommended = result?.recommendation.pathway === p.pathway;
    return (
      <div key={p.pathway} className={`card p-5 border ${isRecommended ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{p.label}</h3>
          {isRecommended && <span className="badge badge-green text-xs">Recommended</span>}
        </div>
        <p className="text-sm text-gray-700 mb-3">{p.description}</p>

        {p.estimatedNetPerQuintal != null && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400">Net/q</p>
              <p className="font-semibold text-gray-900">{inr(p.estimatedNetPerQuintal)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400">Lot total</p>
              <p className="font-semibold text-gray-900">{inr(p.estimatedNetTotal)}</p>
            </div>
            {p.distanceKm != null && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400">Distance</p>
                <p className="font-semibold text-gray-900">{p.distanceKm} km</p>
              </div>
            )}
            {p.transportPerQuintal != null && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400">Transport/q</p>
                <p className="font-semibold text-gray-900">{inr(p.transportPerQuintal)}</p>
              </div>
            )}
          </div>
        )}

        {p.storageOption && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p className="text-xs font-medium text-amber-900">Storage: {p.storageOption.name}</p>
            <p className="text-xs text-amber-700 mt-1">
              ₹{p.storageOption.costPerQuintalPerDay}/q/day × {p.storageOption.maxDurationDays} days = {inr(p.storageCostPerQuintal)}/q
            </p>
            {p.breakevenPricePerQuintal != null && (
              <p className="text-xs text-amber-800 mt-1 font-medium">
                Breakeven: sale price must exceed {inr(p.breakevenPricePerQuintal)}/q to outperform selling now
              </p>
            )}
          </div>
        )}

        {p.transportSavingPerQuintal != null && p.transportSavingPerQuintal > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <p className="text-xs font-medium text-blue-900">
              Transport saving: {inr(p.transportSavingPerQuintal)}/q ({inr(p.transportSavingTotal)} on this lot)
            </p>
          </div>
        )}

        {p.saleWindow && (
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${SIGNAL_COLORS[p.saleWindow.signal] || 'bg-gray-100 text-gray-600'}`}>
            {SIGNAL_LABELS[p.saleWindow.signal] || p.saleWindow.signal}
          </div>
        )}

        {p.buyerCoverage && (
          <p className="text-xs text-gray-500 mt-2">
            Buyer coverage: {p.buyerCoverage.actionableMandis} actionable mandi(s), {p.buyerCoverage.compatibleRequirements} compatible requirement(s)
          </p>
        )}

        {p.why && p.why.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Why</p>
            <ul className="text-xs text-gray-600 space-y-1">
              {p.why.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          </div>
        )}

        {p.assumptions && p.assumptions.length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Assumptions</p>
            <ul className="text-[11px] text-gray-400 space-y-0.5">
              {p.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Your Selling Options</h1>
        <p className="text-sm text-gray-500 mt-1">
          Compare realistic pathways for your lot — sell now, store, aggregate through FPO, or consider an alternative market.
        </p>
      </div>

      <div className="card p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Crop</label>
            <select value={crop} onChange={e => setCrop(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {activeCrops.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">District</label>
            <select value={district} onChange={e => setDistrict(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
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
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Quantity (q)</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="0.1" step="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Grade</label>
            <select value={grade} onChange={e => setGrade(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Unassessed</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
        </div>
        <button onClick={compute} disabled={loading} className="mt-4 btn-primary disabled:opacity-50">
          {loading ? 'Computing pathways…' : 'Compare pathways →'}
        </button>
      </div>

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.recommendation && (
            <div className="card p-4 border-emerald-300 bg-emerald-50/50">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-emerald-900">
                  Recommended: {result.pathways.find(p => p.pathway === result.recommendation.pathway)?.label || result.recommendation.pathway}
                </p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  result.recommendation.confidence === 'STRONG' ? 'bg-green-100 text-green-700' :
                  result.recommendation.confidence === 'GOOD' ? 'bg-emerald-100 text-emerald-700' :
                  result.recommendation.confidence === 'CAUTION' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{result.recommendation.confidence}</span>
              </div>
              <ul className="text-xs text-emerald-700 mt-1 space-y-0.5">
                {result.recommendation.why.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
              {result.recommendation.note && (
                <p className="text-[11px] text-emerald-600 mt-1 italic">{result.recommendation.note}</p>
              )}
              {result.recommendation.evaluatedRules && (
                <details className="mt-2">
                  <summary className="text-[10px] text-emerald-600 cursor-pointer hover:text-emerald-800">How this was decided (rules trace)</summary>
                  <ul className="text-[10px] text-emerald-600 mt-1 space-y-0.5 ml-2">
                    {result.recommendation.evaluatedRules.map((r, i) => (
                      <li key={i}>• {r.rule}: {r.applied ? '✓ applied' : '✗ not applied'}{r.savings ? ` (savings ₹${r.savings}/q)` : ''}{r.costPerQ ? ` (cost ₹${r.costPerQ}/q)` : ''}{r.signal ? ` [${r.signal}]` : ''}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {result.pathways.map(renderPathway)}

          {result.unknowns.length > 0 && (
            <div className="card p-4 border-amber-200 bg-amber-50/50">
              <p className="text-[11px] uppercase tracking-wider text-amber-600 mb-1">Unknowns</p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {result.unknowns.map((u, i) => <li key={i}>• {u}</li>)}
              </ul>
            </div>
          )}

          <div className="card p-4 border-gray-200 bg-gray-50/50">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Data basis</p>
            <ul className="text-[11px] text-gray-500 space-y-0.5">
              {Object.entries(result.dataBasis).map(([k, v]) => (
                <li key={k}>• <span className="font-medium">{k}:</span> {v}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

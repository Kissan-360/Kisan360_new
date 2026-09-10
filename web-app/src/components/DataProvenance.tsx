/**
 * DataProvenance — shows the farmer exactly what data is real for their
 * selected crop and district. Never overclaims. Every number has a source.
 */
import React, { useEffect, useState } from 'react';
import { API_URL, apiFetch } from '../lib/api';

interface CoverageData {
  summary: {
    totalDistricts: number;
    districtsActive: number;
    cropsInCatalog: number;
    cropsWithRealData: number;
    totalMarkets: number;
    totalObservations: number;
  };
  crops: Array<{
    name: string;
    hasMarketData: boolean;
    observationCount: number;
    districtsWithData: string[];
  }>;
}

interface ProvenanceProps {
  crop: string;
  district: string;
  quantity: number;
}

const Badge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
    {label}
  </span>
);

export const DataProvenance: React.FC<ProvenanceProps> = ({ crop, district, quantity }) => {
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`${API_URL}/market/coverage`)
      .then(r => r.json())
      .then(j => { if (alive && j.success) setCoverage(j); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading || !coverage) return null;

  const cropData = coverage.crops?.find(c => c.name.toLowerCase() === crop.toLowerCase());
  const hasCropData = cropData?.hasMarketData ?? false;
  const cropObsCount = cropData?.observationCount ?? 0;
  const cropDistricts = cropData?.districtsWithData ?? [];
  const hasDistrictData = cropDistricts.some(d => d.toLowerCase() === district.toLowerCase());

  // Determine overall data confidence
  let confidence: { label: string; color: string; detail: string };
  if (hasCropData && hasDistrictData) {
    confidence = { label: 'STRONG', color: 'bg-emerald-100 text-emerald-800', detail: `Real market observations for ${crop} in ${district}` };
  } else if (hasCropData) {
    confidence = { label: 'GOOD', color: 'bg-blue-100 text-blue-800', detail: `Real ${crop} data from ${cropDistricts.length} districts, but not ${district} specifically` };
  } else {
    confidence = { label: 'LIMITED', color: 'bg-amber-100 text-amber-800', detail: `No real ${crop} market observations yet — using catalog reference only` };
  }

  return (
    <div className="card p-4 border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Data Provenance</p>
        <Badge label={confidence.label} color={confidence.color} />
      </div>

      <p className="text-xs text-gray-500 mb-3">{confidence.detail}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-lg font-bold text-gray-900">{coverage.summary.districtsActive}</p>
          <p className="text-[10px] text-gray-400">Districts with data</p>
          <p className="text-[10px] text-gray-300">of {coverage.summary.totalDistricts} total</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-lg font-bold text-gray-900">{coverage.summary.cropsWithRealData}</p>
          <p className="text-[10px] text-gray-400">Crops with data</p>
          <p className="text-[10px] text-gray-300">of {coverage.summary.cropsInCatalog} catalogued</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-lg font-bold text-gray-900">{coverage.summary.totalMarkets}</p>
          <p className="text-[10px] text-gray-400">Source markets</p>
          <p className="text-[10px] text-gray-300">observed by AGMARKNET</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-lg font-bold text-gray-900">{cropObsCount}</p>
          <p className="text-[10px] text-gray-400">{crop} observations</p>
          <p className="text-[10px] text-gray-300">{cropDistricts.length} districts covered</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        <span className="text-gray-400">Source: AGMARKNET (data.gov.in)</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400">{coverage.summary.totalObservations} total observations</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400">Prices are observed, not predicted</span>
      </div>
    </div>
  );
};

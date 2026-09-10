// DistrictSelector — shared component for selecting a Maharashtra district.
// Used by DecisionWorkspace, WeatherPage, and any future page that needs
// location context. Never silently defaults to New Delhi.
//
// Now uses the centralized maharashtraData.ts for all 36 Maharashtra districts.

import React from 'react';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, DISTRICT_COORDS, DEFAULT_DISTRICT, REGIONS } from '../lib/maharashtraData';

// Re-export for backward compatibility
export { MAHARASHTRA_DISTRICTS, DISTRICT_COORDS, DEFAULT_DISTRICT };

interface DistrictSelectorProps {
  value: string;
  onChange: (district: string) => void;
  label?: string;
  className?: string;
}

export const DistrictSelector: React.FC<DistrictSelectorProps> = ({
  value, onChange, label = 'District', className = '',
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${className}`}
    >
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
);

export const CropSelector: React.FC<{
  value: string;
  onChange: (c: string) => void;
  className?: string;
  showAll?: boolean;
}> = ({ value, onChange, className = '', showAll = false }) => {
  const activeCrops = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active');
  const inactiveCrops = MAHARASHTRA_CROPS.filter(c => c.marketCoverage !== 'active');

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Crop</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${className}`}
      >
        <optgroup label="Market data available">
          {activeCrops.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </optgroup>
        {showAll && (
          <optgroup label="Additional crops (no market data yet)">
            {inactiveCrops.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {showAll && value && activeCrops.every(c => c.name !== value) && (
        <p className="text-xs text-amber-600 mt-1">
          ℹ No AGMARKNET observations currently available for {value}. Market intelligence requires live data.
        </p>
      )}
    </div>
  );
};

export const QuantityInput: React.FC<{ value: string; onChange: (q: string) => void; className?: string }> = ({ value, onChange, className = '' }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">Quantity (quintals)</label>
    <input
      type="number"
      min="0.1"
      step="0.1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${className}`}
    />
  </div>
);

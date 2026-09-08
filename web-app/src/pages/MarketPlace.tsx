import React, { useState, useEffect, useMemo } from 'react';
import { API_URL, apiFetch } from '../lib/api';

interface MarketPrice {
  crop: string;
  variety: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  market: string;
  district: string;
  state: string;
  arrivalDate: string;
}

interface ApiResponse {
  success: boolean;
  total: number;
  count: number;
  prices: MarketPrice[];
  source: string;
}

const MarketPlace = () => {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [cropFilter, setCropFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (cropFilter) params.append('crop', cropFilter);
      if (stateFilter) params.append('state', stateFilter);
      if (search) params.append('search', search);

      const res = await apiFetch(`${API_URL}/market/prices?${params}`);
      const data: ApiResponse = await res.json();
      if (data.success) {
        setPrices(data.prices);
        setSource(data.source);
      } else {
        setError('Failed to load market prices');
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const allCrops = useMemo(() => [...new Set(prices.map(p => p.crop))].sort(), [prices]);
  const allStates = useMemo(() => [...new Set(prices.map(p => p.state))].sort(), [prices]);

  const filtered = useMemo(() => {
    return prices.filter(m => {
      if (cropFilter && m.crop !== cropFilter) return false;
      if (stateFilter && m.state !== stateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.crop.toLowerCase().includes(q) || m.variety.toLowerCase().includes(q) || m.market.toLowerCase().includes(q);
      }
      return true;
    });
  }, [prices, search, cropFilter, stateFilter]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Market Prices</h1>
          <p className="text-gray-500 text-sm mt-1">Live mandi prices across India — ₹ per quintal</p>
        </div>
        <button onClick={fetchPrices} className="btn-secondary text-sm flex items-center gap-1.5" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input className="input-field" value={search} onChange={e => setSearch(e.target.value)} placeholder="Crop, variety, market..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Crop</label>
            <select className="input-field" value={cropFilter} onChange={e => setCropFilter(e.target.value)}>
              <option value="">All crops</option>
              {allCrops.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
            <select className="input-field" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
              <option value="">All states</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => { setSearch(''); setCropFilter(''); setStateFilter(''); }} className="btn-secondary text-sm w-full">Clear</button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading market prices...</div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-500 mb-3">{error}</p>
            <p className="text-gray-400 text-sm">Make sure the backend server is running on port 5000</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Crop</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Variety</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Market</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">State</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Min</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Modal</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No prices match your filters</td>
                  </tr>
                ) : (
                  filtered.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{m.crop}</td>
                      <td className="px-5 py-3 text-gray-600">{m.variety}</td>
                      <td className="px-5 py-3 text-gray-700">{m.market}</td>
                      <td className="px-5 py-3 text-gray-500">{m.state}</td>
                      <td className="px-5 py-3 text-right text-gray-600">₹{m.minPrice?.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700">₹{m.modalPrice?.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-gray-600">₹{m.maxPrice?.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Data source: AGMARKNET (Government of India) {source === 'agmarknet_live' ? '• Live data' : ''}
        {prices.length > 0 && ` • ${prices.length} records shown`}
      </p>
    </div>
  );
};

export default MarketPlace;

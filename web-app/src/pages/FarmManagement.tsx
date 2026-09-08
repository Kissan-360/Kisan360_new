import React, { useState, useEffect, useCallback } from 'react';

import { API_URL, apiFetch } from '../lib/api';

interface Farm {
  _id: string;
  name: string;
  location: string;
  area: number;
  unit: string;
  crops: string[];
  soilType: string;
  notes: string;
}

const STORAGE_KEY = 'kisan_farms';

const loadLocalFarms = (): Farm[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const FarmManagement = () => {
  const [farms, setFarms] = useState<Farm[]>(loadLocalFarms);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', location: '', area: 0, unit: 'acres', crops: [] as string[], soilType: 'loam', notes: '' });
  const [cropInput, setCropInput] = useState('');

  useEffect(() => {
    fetchFarms();
  }, []);

  const fetchFarms = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/farms`);
      const data = await res.json();
      if (data.success && data.farms) {
        setFarms(data.farms);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.farms));
      }
    } catch {
      const local = loadLocalFarms();
      if (local.length > 0) setFarms(local);
    } finally {
      setLoading(false);
    }
  };

  const syncFarms = useCallback(async (updatedFarms: Farm[]) => {
    setFarms(updatedFarms);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFarms));
  }, []);

  const save = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        const res = await apiFetch(`${API_URL}/farms/${editing}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (data.success) {
          setFarms(prev => prev.map(f => f._id === editing ? data.farm : f));
        }
      } else {
        const res = await apiFetch(`${API_URL}/farms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (data.success) {
          setFarms(prev => [data.farm, ...prev]);
        }
      }
    } catch {
      // API failed — use localStorage as fallback
      const newFarm: Farm = { _id: editing || Date.now().toString(), ...form } as Farm;
      if (editing) {
        setFarms(prev => prev.map(f => f._id === editing ? { ...f, ...form } : f));
      } else {
        setFarms(prev => [newFarm, ...prev]);
      }
    }
    resetForm();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this farm?')) return;
    try {
      await apiFetch(`${API_URL}/farms/${id}`, { method: 'DELETE' });
    } catch {}
    setFarms(prev => prev.filter(f => f._id !== id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(farms.filter(f => f._id !== id)));
  };

  const edit = (farm: Farm) => {
    setForm({ name: farm.name, location: farm.location, area: farm.area, unit: farm.unit, crops: farm.crops, soilType: farm.soilType, notes: farm.notes });
    setEditing(farm._id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ name: '', location: '', area: 0, unit: 'acres', crops: [], soilType: 'loam', notes: '' });
    setCropInput('');
    setEditing(null);
    setShowForm(false);
  };

  const addCrop = () => {
    const c = cropInput.trim();
    if (c && !form.crops.includes(c)) {
      setForm(prev => ({ ...prev, crops: [...prev.crops, c] }));
      setCropInput('');
    }
  };

  const soilTypes = ['loam', 'clay', 'sandy', 'silty', 'peaty', 'chalky', 'saline'];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Farms</h1>
          <p className="text-gray-500 text-sm mt-1">{farms.length} farm{farms.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', location: '', area: 0, unit: 'acres', crops: [], soilType: 'loam', notes: '' }); }} className="btn-primary text-sm">
          {showForm ? 'Cancel' : '+ Add Farm'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">{editing ? 'Edit Farm' : 'New Farm'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Farm name</label>
              <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. North Field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Sangrur, Punjab" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
              <div className="flex gap-2">
                <input type="number" className="input-field flex-1" value={form.area || ''} onChange={e => setForm({ ...form, area: parseFloat(e.target.value) || 0 })} placeholder="10" />
                <select className="input-field w-24" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option value="acres">acres</option>
                  <option value="hectares">hectares</option>
                  <option value="bigha">bigha</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Soil type</label>
              <select className="input-field" value={form.soilType} onChange={e => setForm({ ...form, soilType: e.target.value })}>
                {soilTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Crops grown</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" value={cropInput} onChange={e => setCropInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCrop())} placeholder="Type crop and press Enter" />
              <button type="button" onClick={addCrop} className="btn-secondary text-sm">Add</button>
            </div>
            {form.crops.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.crops.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs">
                    {c}
                    <button onClick={() => setForm(prev => ({ ...prev, crops: prev.crops.filter(x => x !== c) }))} className="hover:text-red-500">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea className="input-field resize-none" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this farm..." />
          </div>

          <button onClick={save} disabled={!form.name.trim()} className="btn-primary">{editing ? 'Update Farm' : 'Save Farm'}</button>
        </div>
      )}

      {loading && farms.length === 0 && (
        <div className="card p-12 text-center text-gray-400">Loading farms...</div>
      )}

      {!loading && farms.length === 0 && !showForm && (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">🏠</div>
          <p className="text-gray-500 font-medium">No farms registered yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your farm to get started</p>
          <button onClick={() => setShowForm(true)} className="btn-primary mt-4 text-sm">+ Add Your First Farm</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {farms.map(farm => (
          <div key={farm._id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{farm.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{farm.location}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => edit(farm)} className="text-xs text-gray-400 hover:text-emerald-600 px-2 py-1 rounded hover:bg-emerald-50">Edit</button>
                <button onClick={() => remove(farm._id)} className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Delete</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
              <span>📏 {farm.area} {farm.unit}</span>
              <span>🧑‍🌾 {farm.soilType} soil</span>
            </div>
            {farm.crops.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {farm.crops.map(c => <span key={c} className="badge-green text-xs">{c}</span>)}
              </div>
            )}
            {farm.notes && <p className="mt-2 text-xs text-gray-400 italic">{farm.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FarmManagement;

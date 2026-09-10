import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL, apiFetch, getDemoToken, getDemoUser } from '../lib/api';
import { MAHARASHTRA_DISTRICTS, MAHARASHTRA_CROPS, REGIONS } from '../lib/maharashtraData';

// Dashboard hero (Phase 9 → judge-opening phase): the farmer states what
// they're selling and lands straight in the market comparison. The opening
// answers WHO / PROBLEM / SOLUTION in one screen — no architecture talk.
const SellHero = () => {
  const navigate = useNavigate();
  const [crop, setCrop] = useState('Soybean');
  const [district, setDistrict] = useState('Nashik');
  const [quantity, setQuantity] = useState('10');
  const activeCrops = MAHARASHTRA_CROPS.filter(c => c.marketCoverage === 'active').map(c => c.name);
  const qty = parseFloat(quantity) > 0 ? parseFloat(quantity) : 10;
  return (
    <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-green-800 rounded-2xl p-6 lg:p-8 text-white shadow-lg shadow-emerald-200/50">
      {/* The opening concept — product copy, not a paragraph wall. */}
      <p className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight">
        Two mandis can offer different prices. But the mandi paying the most
        may not leave you with the most money.
      </p>
      <p className="text-emerald-100 text-sm mt-3">
        Kisan360 compares markets by what you <strong>actually take home</strong> — price minus the costs
        you bear: transport, storage, loading. Then it connects that decision to a real buyer.
      </p>

      {/* WHO + WHAT: a lot, not a form. Quantity drives the economics, so the
          farmer enters it here and the engine receives the real number. */}
      <div className="mt-5 rounded-xl bg-white/10 border border-white/20 p-4">
        <p className="text-[11px] uppercase tracking-wider text-emerald-100 font-semibold">The lot you're selling</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-emerald-200 mb-1">Crop</label>
            <select className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
              {activeCrops.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-emerald-200 mb-1">Your district</label>
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
            <label className="block text-xs font-medium text-emerald-200 mb-1">Quantity (quintals)</label>
            <input
              className="input-field"
              type="number"
              min="0.1"
              step="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <button
            className="btn-primary bg-white !text-emerald-700 hover:bg-emerald-50 h-[38px]"
            onClick={() => navigate(`/decision?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&quantity=${qty}`)}
          >
            Where should I sell? →
          </button>
        </div>
      </div>
    </div>
  );
};

// Demo-state control (operator panel): canonical scenario + deterministic
// reset — no manual DB edits, no hidden developer steps.
const DemoRouteCard = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(''); setErr('');
    try { await fn(); setMsg(`${label} done.`); }
    catch (e: any) { setErr(e?.message || `${label} failed — could not reach the API. Check the backend connection.`); }
    finally { setBusy(null); }
  };

  // The canonical scenario needs no backend state — it is a deep link that
  // opens the flagship screen pre-loaded with the demo's hero inputs.
  const canonical = () =>
    run('Canonical scenario', async () => {
      navigate('/decision?crop=Onion&district=Nashik&quantity=10');
    });

  const seed = () =>
    run('Seed demo state', async () => {
      const user = getDemoUser();
      if (!user) throw new Error('Sign in first — demo state is seeded for the signed-in farmer session.');
      const token = getDemoToken();
      const res = await apiFetch(`${API_URL}/auth/demo/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Seed failed');
    });

  return (
    <div className="card p-4 border-amber-200 bg-amber-50/50">
      <p className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">Demo controls</p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button className="btn-secondary text-xs" onClick={canonical} disabled={!!busy}>
          {busy === 'Canonical scenario' ? 'Loading…' : '▶ Run canonical scenario (Onion · 10 q · Nashik)'}
        </button>
        <button className="btn-secondary text-xs" onClick={seed} disabled={!!busy}>
          {busy === 'Seed demo state' ? 'Seeding…' : '↺ Reset demo state (seed lots + offer)'}
        </button>
      </div>
      {msg && <p className="text-xs text-emerald-700 mt-2">{msg}</p>}
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      <p className="text-[10px] text-gray-400 mt-2">One-click, deterministic demo state — no database edits.</p>
    </div>
  );
};

const Dashboard = () => {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Make your next selling decision with data, not guesswork</h1>
      </div>
      <SellHero />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <HeroLink to="/net-realization" icon="🧮" title="Net Realization" desc="Ranked mandis by what you pocket after farmer-borne costs" />
          <HeroLink to="/trade" icon="🤝" title="Trade" desc="Lots, buyers with trust badges, offers and payment tracking" />
          <HeroLink to="/fpo" icon="🌾" title="FPO Bulk Selling" desc="Pool with neighbouring farmers and compare the uplift" />
          <HeroLink to="/market" icon="💰" title="Market Intelligence" desc="Live and cached mandi prices with honest freshness labels" />
        </div>
        <div className="space-y-6">
          <DemoRouteCard />
          <div className="card p-5">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-3">More tools</p>
            <div className="space-y-1">
              <MiniLink to="/disease-detection" icon="🔬" title="Crop Health" desc="Detect diseases from a leaf photo" />
              <MiniLink to="/advisory" icon="🌱" title="Advisory" desc="Farming advice for your crop and weather" />
              <MiniLink to="/weather" icon="🌤️" title="Weather" desc="Forecast and agricultural alerts" />
              <MiniLink to="/farms" icon="🏠" title="My Farms" desc="Manage farm records" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function HeroLink({ to, icon, title, desc }: { to: string; icon: string; title: string; desc: string }) {
    return (
      <Link to={to} className="card card-hover p-5 flex items-start gap-4 cursor-pointer group">
        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform duration-200">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <span className="text-sm text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">Open →</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{desc}</p>
        </div>
      </Link>
    );
  }

  function MiniLink({ to, icon, title, desc }: { to: string; icon: string; title: string; desc: string }) {
    return (
      <Link to={to} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 group">
        <span className="text-base w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-700 group-hover:text-gray-900">{title}</span>
          <span className="block text-[11px] text-gray-400 truncate">{desc}</span>
        </span>
      </Link>
    );
  }
};

export default Dashboard;

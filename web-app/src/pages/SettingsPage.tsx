import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const SETTINGS_KEY = 'kisan_settings';

interface Settings {
  tempUnit: 'celsius' | 'fahrenheit';
  notifications: boolean;
  darkMode: boolean;
  language: string;
  forecastDays: number;
}

const defaultSettings: Settings = {
  tempUnit: 'celsius',
  notifications: true,
  darkMode: false,
  language: 'english',
  forecastDays: 5,
};

const loadSettings = (): Settings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch { return defaultSettings; }
};

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [settings]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const rows = [
    {
      label: 'Temperature Unit',
      desc: 'Choose Celsius or Fahrenheit for weather',
      control: (
        <select className="input-field w-32" value={settings.tempUnit} onChange={(e) => update('tempUnit', e.target.value as 'celsius' | 'fahrenheit')}>
          <option value="celsius">Celsius (°C)</option>
          <option value="fahrenheit">Fahrenheit (°F)</option>
        </select>
      ),
    },
    {
      label: 'Notifications',
      desc: 'Receive weather alerts and farm tips',
      control: (
        <button
          onClick={() => update('notifications', !settings.notifications)}
          className={`relative w-11 h-6 rounded-full transition-colors ${settings.notifications ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.notifications ? 'translate-x-5' : ''}`} />
        </button>
      ),
    },
    {
      label: 'Forecast Days',
      desc: 'Number of days shown in weather forecast',
      control: (
        <select className="input-field w-24" value={settings.forecastDays} onChange={(e) => update('forecastDays', parseInt(e.target.value))}>
          {[3, 5, 7].map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>
      ),
    },
    {
      label: 'Language',
      desc: 'Interface language (more coming soon)',
      control: (
        <select className="input-field w-36" value={settings.language} onChange={(e) => update('language', e.target.value)}>
          <option value="english">English</option>
          <option value="hindi">हिन्दी</option>
          <option value="punjabi">ਪੰਜਾਬੀ</option>
        </select>
      ),
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">App preferences and configuration</p>
        </div>
        {saved && <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full">Saved</span>}
      </div>

      <div className="card p-6 lg:p-8 space-y-1 divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{r.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
            </div>
            {r.control}
          </div>
        ))}
      </div>

      {/* Account section */}
      <div className="card p-6 lg:p-8">
        <h2 className="font-semibold text-gray-800 mb-3">Account</h2>
        <p className="text-sm text-gray-600 mb-4">
          {user ? `Signed in as ${user.email}` : 'Not signed in'}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => { try { await logout(); } finally { navigate('/'); } }}
            className="btn-primary text-sm"
          >
            Sign out
          </button>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="btn-secondary text-sm">
            Clear Local Data
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-800 mb-2">About Kisan360</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          AI-powered farming companion. Version 1.0.0. Built with React, Tailwind CSS, Node.js, FastAPI, and OpenWeather API.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;

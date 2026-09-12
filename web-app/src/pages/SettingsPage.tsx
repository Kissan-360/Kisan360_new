import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';

const SETTINGS_KEY = 'kisan_settings';

interface Settings {
  tempUnit: 'celsius' | 'fahrenheit';
  notifications: boolean;
  language: string;
  forecastDays: number;
}

const defaultSettings: Settings = {
  tempUnit: 'celsius',
  notifications: true,
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
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [settings]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const rows = [
    {
      label: t('settings.tempUnit'),
      desc: t('settings.tempUnitDesc'),
      control: (
        <select className="input-field w-32" value={settings.tempUnit} onChange={(e) => update('tempUnit', e.target.value as 'celsius' | 'fahrenheit')}>
          <option value="celsius">{t('settings.celsius')}</option>
          <option value="fahrenheit">{t('settings.fahrenheit')}</option>
        </select>
      ),
    },
    {
      label: t('settings.notifications'),
      desc: t('settings.notificationsDesc'),
      control: (
        <button
          onClick={() => update('notifications', !settings.notifications)}
          className={`relative w-11 h-6 rounded-full transition-colors ${settings.notifications ? 'bg-emerald-500' : 'bg-stone-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.notifications ? 'translate-x-5' : ''}`} />
        </button>
      ),
    },
    {
      label: t('settings.forecastDays'),
      desc: t('settings.forecastDaysDesc'),
      control: (
        <select className="input-field w-24" value={settings.forecastDays} onChange={(e) => update('forecastDays', parseInt(e.target.value))}>
          {[3, 5, 7].map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>
      ),
    },
    {
      label: t('settings.language'),
      desc: t('settings.languageDesc'),
      control: (
        <select className="input-field w-36" value={settings.language} onChange={(e) => update('language', e.target.value)}>
          <option value="english">English</option>
          <option value="hindi">हिन्दी</option>
          <option value="marathi">मराठी</option>
        </select>
      ),
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('settings.title')}</h1>
          <p className="text-stone-500 text-sm mt-1">{t('settings.subtitle')}</p>
        </div>
        {saved && <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full">{t('settings.saved')}</span>}
      </div>

      <div className="card p-6 lg:p-8 space-y-1 divide-y divide-stone-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-stone-800">{r.label}</p>
              <p className="text-xs text-stone-500 mt-0.5">{r.desc}</p>
            </div>
            {r.control}
          </div>
        ))}
      </div>

      {/* Account section */}
      <div className="card p-6 lg:p-8">
        <h2 className="font-semibold text-stone-800 mb-3">{t('settings.account')}</h2>
        <p className="text-sm text-stone-600 mb-4">
          {user ? t('settings.signedInAs', { email: user.email }) : t('settings.notSignedIn')}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => { try { await logout(); } finally { navigate('/'); } }}
            className="btn-primary text-sm"
          >
            {t('settings.signOut')}
          </button>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="btn-secondary text-sm">
            {t('settings.clearLocalData')}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card p-6">
        <h2 className="font-semibold text-stone-800 mb-2">{t('settings.about')}</h2>
        <p className="text-sm text-stone-500 leading-relaxed">
          {t('settings.aboutDesc')}
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;

import React, { useState, useEffect } from 'react';

import { API_URL, apiFetch } from '../lib/api';
import { PrimaryButton } from '../components/ui/kit';
import { useTranslation } from '../i18n';
const COMMON_CROPS = [
  'Rice', 'Wheat', 'Maize', 'Sugarcane', 'Cotton',
  'Groundnut', 'Tomato', 'Onion', 'Mango', 'Banana',
];

const cropEmoji: Record<string, string> = {
  Rice: '🌾', Wheat: '🌾', Maize: '🌽', Sugarcane: '🎋', Cotton: '🌿',
  Groundnut: '🥜', Tomato: '🍅', Onion: '🧅', Mango: '🥭', Banana: '🍌',
};

const CropAdvisory = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'select' | 'result'>('select');
  const [selectedCrop, setSelectedCrop] = useState('');
  const [location, setLocation] = useState('');
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState<any>(null);
  const [advisory, setAdvisory] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const resp = await apiFetch(
            `${API_URL}/weather?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}`
          );
          const data = await resp.json();
          if (data.current) setWeather(data.current);
          if (data.location?.name) setLocation(data.location.name);
        } catch {}
      },
      () => {},
      { timeout: 5000 }
    );
  }, []);

  const getAdvisory = async () => {
    if (!selectedCrop || !location) return;
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ crop: selectedCrop, location });
    if (query) params.append('query', query);
    if (weather?.temperature) params.append('temperature', String(weather.temperature));
    if (weather?.humidity) params.append('humidity', String(weather.humidity));
    if (weather?.condition) params.append('condition', weather.condition);

    try {
      const resp = await apiFetch(`${API_URL}/advisory?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed');
      setAdvisory(data);
      setStep('result');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('select');
    setAdvisory(null);
    setQuery('');
    setError('');
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('advisory.title')}</h1>
          <p className="text-stone-500 text-sm mt-1">{t('advisory.subtitle')}</p>
        </div>

        {step === 'select' && (
          <div className="space-y-6">
            {/* Crop selector */}
            <div className="card p-6 lg:p-8">
              <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">{t('advisory.selectCrop')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {COMMON_CROPS.map((crop) => (
                  <button
                    key={crop}
                    onClick={() => setSelectedCrop(crop)}
                    className={`p-4 rounded-xl border-2 text-center transition-all duration-150 ${
                      selectedCrop === crop
                        ? 'border-emerald-500 bg-emerald-50 shadow-sm ring-1 ring-emerald-500/20'
                        : 'border-stone-200 hover:border-emerald-300 hover:bg-stone-50'
                    }`}
                  >
                    <div className="text-3xl mb-1">{cropEmoji[crop] || '🌱'}</div>
                    <div className="text-sm font-medium text-stone-700">{crop}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="card p-6 lg:p-8 space-y-5">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">{t('advisory.yourLocation')}</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('advisory.locationPlaceholder')}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  {t('advisory.specificQuestion')} <span className="text-stone-400 font-normal">({t('advisory.optional')})</span>
                </label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('advisory.questionPlaceholder')}
                  rows={2}
                  className="input-field resize-none"
                />
              </div>

              {weather && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                  <span>📍</span>
                  <span>{location || t('advisory.currentLocation')}</span>
                  <span className="text-blue-300">|</span>
                  <span>🌡️ {weather.temperature}°C</span>
                  <span className="text-blue-300">|</span>
                  <span>💧 {weather.humidity}%</span>
                  <span className="text-blue-300">|</span>
                  <span>🌤️ {weather.condition}</span>
                </div>
              )}

              <PrimaryButton
                onClick={getAdvisory}
                disabled={!selectedCrop || !location || loading}
                className="w-full justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('advisory.consultingAI')}
                  </>
                ) : (
                  t('advisory.getAdvisory')
                )}
              </PrimaryButton>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                  <span className="text-lg shrink-0">⚠️</span>
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'result' && advisory && (
          <div className="space-y-6">
              <button onClick={reset} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                {t('advisory.backToCrops')}
              </button>

            <div className="card p-6 lg:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-3xl">
                  {cropEmoji[advisory.crop] || '🌱'}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-stone-900">{advisory.crop}</h2>
                  <p className="text-sm text-stone-500">{advisory.location}</p>
                </div>
              </div>

              {weather && (
                <div className="bg-gradient-to-r from-blue-50 to-blue-50/50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800 mb-6">
                  <div className="flex items-center gap-4">
                    <span>🌡️ {weather.temperature}°C</span>
                    <span className="text-blue-200">|</span>
                    <span>💧 {weather.humidity}%</span>
                    <span className="text-blue-200">|</span>
                    <span>🌤️ {weather.condition}</span>
                  </div>
                </div>
              )}

              {advisory.recommendations?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">{t('advisory.recommendations')}</h3>
                  <ul className="space-y-2">
                    {advisory.recommendations.map((r: string, i: number) => (
                      <li key={i} className="text-sm text-stone-700 bg-stone-50 rounded-xl px-4 py-3 border border-stone-100 leading-relaxed">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {advisory.pestAlerts?.length > 0 && (
                  <div className="md:col-span-3">
                    <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>🐛</span> {t('advisory.pestAlerts')}
                    </h3>
                    <div className="space-y-2">
                      {advisory.pestAlerts.map((p: string, i: number) => (
                        <div key={i} className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 leading-relaxed">{p}</div>
                      ))}
                    </div>
                  </div>
                )}

                {advisory.diseaseInfo?.length > 0 && (
                  <div className="md:col-span-3">
                    <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>🩺</span> {t('advisory.diseaseInfo')}
                    </h3>
                    <div className="space-y-2">
                      {advisory.diseaseInfo.map((d: string, i: number) => (
                        <div key={i} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed">{d}</div>
                      ))}
                    </div>
                  </div>
                )}

                {advisory.weatherAdvisories?.length > 0 && (
                  <div className="md:col-span-3">
                    <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>🌤️</span> {t('advisory.weatherAdvisories')}
                    </h3>
                    <div className="space-y-2">
                      {advisory.weatherAdvisories.map((w: string, i: number) => (
                        <div key={i} className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 leading-relaxed">{w}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
                <span className="text-xs text-stone-400">
                  {advisory.source === 'fallback' ? t('advisory.genericAdvisory') : t('advisory.poweredBy')}
                </span>
                <button onClick={() => { setQuery(''); getAdvisory(); }} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                  {t('advisory.refresh')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CropAdvisory;

import React, { useEffect, useState } from 'react';

import { API_URL, apiFetch } from '../lib/api';
import { MAHARASHTRA_DISTRICTS, DISTRICT_COORDS, REGIONS } from '../lib/maharashtraData';
import { useTranslation } from '../i18n';

const DEFAULT_DISTRICT = 'Nashik';

const WeatherPage = () => {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<any>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState(DEFAULT_DISTRICT);

  // Use the selected district's coordinates — never silently use New Delhi.
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // If browser geolocation succeeds, find the nearest district
        const nearest = Object.entries(DISTRICT_COORDS)
          .sort((a, b) => {
            const da = Math.hypot(a[1].lat - pos.coords.latitude, a[1].lon - pos.coords.longitude);
            const db = Math.hypot(b[1].lat - pos.coords.latitude, b[1].lon - pos.coords.longitude);
            return da - db;
          })[0];
        if (nearest) {
          setSelectedDistrict(nearest[0]);
          setCoords({ ...nearest[1], name: nearest[0] });
        } else {
          setCoords({ lat: DISTRICT_COORDS[DEFAULT_DISTRICT].lat, lon: DISTRICT_COORDS[DEFAULT_DISTRICT].lon, name: DEFAULT_DISTRICT });
        }
      },
      () => {
        // Geolocation denied — use selected district, NOT New Delhi
        const d = DISTRICT_COORDS[selectedDistrict] || DISTRICT_COORDS[DEFAULT_DISTRICT];
        setCoords({ lat: d.lat, lon: d.lon, name: selectedDistrict });
      },
      { timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    apiFetch(`${API_URL}/weather?latitude=${coords.lat}&longitude=${coords.lon}`)
      .then((r) => r.json())
      .then(setWeather)
      .catch(() => setError(t('weather.error.loadFailed')));
  }, [coords]);

  const handleDistrictChange = (district: string) => {
    setSelectedDistrict(district);
    const d = DISTRICT_COORDS[district];
    if (d) setCoords({ lat: d.lat, lon: d.lon, name: district });
  };

  const getIcon = (c = '') => {
    const s = c.toLowerCase();
    if (s.includes('rain') || s.includes('drizzle')) return '🌧️';
    if (s.includes('cloud') || s.includes('overcast')) return '☁️';
    if (s.includes('thunder')) return '⛈️';
    if (s.includes('clear') || s.includes('sunny')) return '☀️';
    if (s.includes('fog') || s.includes('mist')) return '🌫️';
    if (s.includes('snow')) return '❄️';
    return '🌤️';
  };

  if (!weather && !error) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center h-64">
        <p className="text-stone-400">{t('weather.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('weather.title')}</h1>
          <p className="text-stone-500 text-sm mt-1">{t('weather.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-stone-600 font-medium">{t('weather.districtLabel')}</label>
          <select
            value={selectedDistrict}
            onChange={(e) => handleDistrictChange(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
      </div>

      {/* Current conditions */}
      <div className="bg-gradient-to-br from-emerald-600 via-emerald-800 to-sky-800 rounded-2xl p-6 lg:p-8 text-white shadow-lg shadow-emerald-200/50">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm text-emerald-100 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
              {weather.location?.name}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-6xl font-bold tracking-tight">{weather.current?.temperature}</span>
              <span className="text-3xl font-light text-emerald-200">°C</span>
            </div>
            <p className="text-lg text-emerald-100 mt-1 capitalize">{weather.current?.description || weather.current?.condition}</p>
          </div>
          <div className="text-center lg:text-right">
            <div className="text-7xl">{getIcon(weather.current?.condition)}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('weather.feelsLike'), value: `${weather.current?.feelsLike}°C`, icon: '🌡️' },
              { label: t('weather.humidity'), value: `${weather.current?.humidity}%`, icon: '💧' },
              { label: t('weather.windSpeed'), value: `${weather.current?.windSpeed} km/h`, icon: '🌬️' },
              { label: t('weather.precipitation'), value: `${weather.current?.precipitation} mm`, icon: '🌧️' },
            ].map((s) => (
            <div key={s.label} className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-lg">{s.icon}</p>
              <p className="text-sm font-medium mt-1">{s.value}</p>
              <p className="text-xs text-emerald-200/70 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5-day forecast */}
      {weather.forecast && weather.forecast.length > 0 && (
        <div className="card p-6">
          <h2 className="section-title mb-4">{t('weather.forecastTitle')}</h2>
          <div className="space-y-3">
            {weather.forecast.slice(0, 5).map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
                <div className="w-20 text-sm font-medium text-stone-700">
                  {i === 0 ? t('weather.today') : new Date(f.date).toLocaleDateString('en-IN', { weekday: 'long' })}
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xl">{getIcon(f.condition)}</span>
                  <span className="text-sm text-stone-600 capitalize">{f.description || f.condition}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-stone-900">{Math.round(f.temperature.max)}°</span>
                  <span className="text-stone-400">/</span>
                  <span className="text-stone-500">{Math.round(f.temperature.min)}°</span>
                  <span className="text-xs text-blue-600 w-10 text-right">{Math.round(f.precipitation)}%</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-3 text-right">{t('weather.precipitationNote')}</p>
        </div>
      )}

      {/* Agricultural insights */}
      {weather.agriculturalAdvice && weather.agriculturalAdvice.length > 0 && (
        <div className="card p-6">
          <h2 className="section-title mb-4">{t('weather.agriculturalInsights')}</h2>
          <ul className="space-y-2">
            {weather.agriculturalAdvice.map((a: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm text-stone-700">
                <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Location info */}
      <div className="card p-6">
        <h2 className="section-title mb-2">{t('weather.location')}</h2>
        <p className="text-sm text-stone-700">
          {weather.location?.name} ({weather.location?.latitude?.toFixed(4)}, {weather.location?.longitude?.toFixed(4)})
        </p>
        <p className="text-xs text-stone-400 mt-1">{t('weather.dataSource')}</p>
      </div>
    </div>
  );
};

export default WeatherPage;

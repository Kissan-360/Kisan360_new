import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { API_URL, apiFetch } from '../lib/api';

const Dashboard = () => {
  const [weather, setWeather] = useState<any>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [recentDetections, setRecentDetections] = useState<any[]>([]);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setCoords({ lat: 28.61, lon: 77.23 }),
      { timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    apiFetch(`${API_URL}/weather?latitude=${coords.lat}&longitude=${coords.lon}`)
      .then((r) => r.json())
      .then(setWeather)
      .catch(() => {});
  }, [coords]);

  useEffect(() => {
    apiFetch(`${API_URL}/detections?limit=3`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.detections) {
          setRecentDetections(data.detections.map((d: any) => ({
            detectedDisease: d.disease,
            confidence: d.confidence,
            severity: d.severity,
          })));
          localStorage.setItem('kisan_detections', JSON.stringify(data.detections));
        }
      })
      .catch(() => {
        // API unavailable — fallback to localStorage
        try {
          const stored = JSON.parse(localStorage.getItem('kisan_detections') || '[]');
          setRecentDetections(stored.slice(0, 3));
        } catch {}
      });
  }, []);

  const getWeatherIcon = (condition = '') => {
    const c = condition.toLowerCase();
    if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
    if (c.includes('cloud') || c.includes('overcast')) return '☁️';
    if (c.includes('thunder') || c.includes('storm')) return '⛈️';
    if (c.includes('clear') || c.includes('sunny')) return '☀️';
    if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return '🌫️';
    if (c.includes('snow')) return '❄️';
    return '🌤️';
  };

  const quickActions = [
    { to: '/disease-detection', label: 'Scan Leaf', icon: '📸', color: 'from-emerald-500 to-green-600' },
    { to: '/advisory', label: 'Get Advice', icon: '💡', color: 'from-blue-500 to-blue-600' },
    { to: '/weather', label: 'Weather', icon: '🌤️', color: 'from-amber-500 to-orange-600' },
    { to: '/farms', label: 'My Farms', icon: '🏠', color: 'from-violet-500 to-purple-600' },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>

      {/* Weather card */}
      {weather && (
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-700 rounded-2xl p-6 lg:p-8 text-white shadow-lg shadow-emerald-200/50">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-emerald-100">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                <span>{weather.location?.name || 'Your Location'}</span>
                <span className="opacity-60">•</span>
                <span>{weather.current?.condition}</span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-6xl font-bold tracking-tight">{weather.current?.temperature}</span>
                <span className="text-3xl font-light text-emerald-200">°C</span>
              </div>

              <div className="mt-2 flex items-center gap-4 text-sm text-emerald-100">
                <span>Feels like {weather.current?.feelsLike}°C</span>
                <span className="opacity-40">|</span>
                <span>💧 {weather.current?.humidity}%</span>
                <span className="opacity-40">|</span>
                <span>🌬️ {weather.current?.windSpeed} km/h</span>
              </div>
            </div>

            <div className="text-center">
              <div className="text-7xl">{getWeatherIcon(weather.current?.condition)}</div>
              {weather.current?.description && (
                <p className="mt-1 text-sm text-emerald-100 capitalize">{weather.current.description}</p>
              )}
            </div>
          </div>

          {/* Forecast strip */}
          {weather.forecast && weather.forecast.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white/15">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weather.forecast.slice(0, 5).map((f: any, i: number) => (
                  <div
                    key={i}
                    className="flex-1 min-w-[60px] bg-white/10 backdrop-blur rounded-xl p-3 text-center"
                  >
                    <p className="text-xs font-medium text-emerald-100">
                      {i === 0 ? 'Today' : new Date(f.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                    </p>
                    <p className="text-xl my-1">{getWeatherIcon(f.condition)}</p>
                    <p className="text-sm font-semibold">{Math.round(f.temperature.max)}°</p>
                    <p className="text-xs text-emerald-200/70">{Math.round(f.temperature.min)}°</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advice */}
          {weather.agriculturalAdvice?.length > 0 && (
            <div className="mt-5 pt-5 border-t border-white/15">
              <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-xl px-4 py-3">
                <span className="text-lg shrink-0">🌱</span>
                <p className="text-sm text-emerald-50 leading-relaxed">{weather.agriculturalAdvice[0]}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feature cards (2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Disease detection card */}
          <Link
            to="/disease-detection"
            className="card card-hover p-5 flex items-start gap-4 cursor-pointer group"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform duration-200">
              🔬
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Disease Detection</h3>
                <span className="text-sm text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                  Open →
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Snap a photo to instantly detect crop diseases</p>
              {recentDetections.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentDetections.map((d: any, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                      <span className={`w-1.5 h-1.5 rounded-full ${d.confidence > 0.7 ? 'bg-red-500' : 'bg-amber-500'}`} />
                      {d.detectedDisease}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>

          {/* Advisory card */}
          <Link
            to="/advisory"
            className="card card-hover p-5 flex items-start gap-4 cursor-pointer group"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform duration-200">
              🌱
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Crop Advisory</h3>
                <span className="text-sm text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                  Open →
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">AI-powered farming recommendations tailored to your crop and location</p>
            </div>
          </Link>

          {/* Secondary cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/market" className="card card-hover p-4 flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl shrink-0">💰</div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm">Market Prices</p>
                <p className="text-xs text-gray-500">Check mandi rates</p>
              </div>
            </Link>

            <Link to="/farms" className="card card-hover p-4 flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-xl shrink-0">🏠</div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm">My Farms</p>
                <p className="text-xs text-gray-500">Manage farm records</p>
              </div>
            </Link>

            <Link to="/profile" className="card card-hover p-4 flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-xl shrink-0">👤</div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm">Profile</p>
                <p className="text-xs text-gray-500">Account settings</p>
              </div>
            </Link>

            <Link to="/settings" className="card card-hover p-4 flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl shrink-0">⚙️</div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm">Settings</p>
                <p className="text-xs text-gray-500">Preferences</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Right sidebar: Quick actions + tips */}
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className={`bg-gradient-to-br ${action.color} rounded-xl p-4 text-white text-center hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
                >
                  <span className="text-2xl">{action.icon}</span>
                  <p className="text-xs font-medium mt-1.5 opacity-90">{action.label}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Farm Tip</h3>
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">💡</span>
              <p className="text-sm text-gray-600 leading-relaxed">
                Walk your fields weekly to catch pest and disease problems early. Early detection saves crops and money.
              </p>
            </div>
          </div>

          {weather?.forecast && weather.forecast[0]?.precipitation > 50 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-lg shrink-0">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Rain expected soon</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {Math.round(weather.forecast[0].precipitation)}% chance — plan your field activities accordingly.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

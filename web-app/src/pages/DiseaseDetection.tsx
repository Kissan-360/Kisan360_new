import React, { useState, useRef } from 'react';
import { API_URL, apiFetch } from '../lib/api';
import { PrimaryButton } from '../components/ui/kit';
import { useTranslation } from '../i18n';

const CROP_OPTIONS = [
  // Maharashtra-major crops first (from the model's 38 supported classes);
  // the rest follow alphabetically.
  'Soybean', 'Tomato', 'Potato', 'Grape', 'Corn (Maize)',
  'Apple', 'Bell Pepper', 'Blueberry', 'Cherry',
  'Orange', 'Peach', 'Raspberry', 'Squash', 'Strawberry',
];

const DiseaseDetection = () => {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  };

  const detect = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    const form = new FormData();
    form.append('image', file);
    if (cropType) form.append('cropType', cropType);

    try {
      const resp = await apiFetch(`${API_URL}/disease/detect`, {
        method: 'POST',
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.error === 'not_a_plant' || data.error === 'crop_mismatch') {
          setError(data.message);
        } else {
          throw new Error(data.error || 'Detection failed');
        }
        return;
      }
      setResult(data);
      // Save to API, fallback to localStorage
      apiFetch(`${API_URL}/detections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropType: data.cropType || cropType,
          disease: data.detectedDisease,
          confidence: data.confidence,
          severity: data.severity,
          treatment: data.treatment,
          recommendations: data.recommendations,
        }),
      }).catch(() => {
        // API unavailable — fallback to localStorage
        try {
          const stored = JSON.parse(localStorage.getItem('kisan_detections') || '[]');
          stored.unshift({ detectedDisease: data.detectedDisease, confidence: data.confidence, date: new Date().toISOString() });
          localStorage.setItem('kisan_detections', JSON.stringify(stored.slice(0, 10)));
        } catch {}
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const severityBadge = (s: string) => {
    switch (s?.toLowerCase()) {
      case 'critical': return 'badge-red';
      case 'high': return 'badge-red';
      case 'medium': return 'badge-yellow';
      default: return 'badge-green';
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('disease.title')}</h1>
          <p className="text-stone-500 text-sm mt-1">{t('disease.subtitle')}</p>
        </div>

        <div className="card p-6 lg:p-8 space-y-5">
          {/* Crop selector — M3 pill grid, same crop re-click clears */}
          <fieldset>
            <legend className="block text-xs font-medium text-stone-500 mb-1.5">{t('disease.whatCrop')} <span className="font-normal">({t('disease.optional')})</span></legend>
            <div className="flex flex-wrap gap-2">
              {CROP_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cropType === c}
                  onClick={() => setCropType(cropType === c ? '' : c)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold border transition-colors min-h-[36px] ${
                    cropType === c
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                      : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-300 hover:text-emerald-800'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Upload area */}
          <div
            className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden ${
              image ? 'border-emerald-300 bg-emerald-50/30' : 'border-stone-300 hover:border-emerald-400 bg-stone-50/50 hover:bg-emerald-50/30'
            }`}
            onClick={() => fileRef.current?.click()}
          >
            {image ? (
              <div className="relative">
                <img src={image} alt="Leaf" className="max-h-80 mx-auto object-contain p-4" />
                <button
                  onClick={(e) => { e.stopPropagation(); setImage(null); setFile(null); setResult(null); }}
                  className="absolute top-3 right-3 w-8 h-8 bg-stone-900/50 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-stone-900/70 transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="py-16 text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
                  <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-stone-700 font-medium">{t('disease.tapUpload')}</p>
                <p className="text-stone-400 text-sm mt-1">{t('disease.jpgPng')}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </div>

          {/* Detect button */}
          {image && (
            <PrimaryButton
              onClick={detect}
              disabled={loading}
              className="w-full justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('disease.analyzing')}
                </>
              ) : (
                t('disease.detectDisease')
              )}
            </PrimaryButton>
          )}

          {/* Error */}
          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
              <span className="text-lg shrink-0 mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <div className="border border-emerald-200 rounded-2xl p-5 bg-emerald-50/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🔬</span>
                    <div>
                      <p className="font-semibold text-stone-900">{result.detectedDisease}</p>
                      <span className={`badge ${severityBadge(result.severity)} mt-1`}>
                        {t('disease.severity', { severity: result.severity })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="relative w-14 h-14">
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e6f4" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#006b2c" strokeWidth="3"
                          strokeDasharray={`${result.confidence * 100} ${100 - result.confidence * 100}`}
                          strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-stone-700">
                        {(result.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {result.recommendations?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-stone-200">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">{t('disease.recommendations')}</p>
                    <ul className="space-y-1.5">
                      {result.recommendations.map((r: string, i: number) => (
                        <li key={i} className="text-sm text-stone-600 flex gap-2">
                          <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.treatment && (
                  <div className="mt-4 pt-4 border-t border-stone-200">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">{t('disease.treatment')}</p>
                    <p className="text-sm text-stone-700 bg-white rounded-xl px-4 py-3 border border-stone-100">{result.treatment}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiseaseDetection;
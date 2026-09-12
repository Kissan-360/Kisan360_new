import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, ArrowLeft, ArrowRight, Loader2, Brain, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { API_URL, apiFetch } from '../lib/api';
import PhotoCapture from '../components/PhotoCapture';
import GradeResult from '../components/GradeResult';
import FpoCertification from '../components/FpoCertification';
import { PageHeader, Card, PrimaryButton, GhostButton, SectionLabel, PageTransition } from '../components/ui/kit';
import { useFlow } from '../components/FlowContext';
import { loadModel, analyzeCrop, isModelLoaded, getModelStatus, type MLResult } from '../lib/cropGrader';

const GRADING_CROPS = [
  { id: 'soybean', label: 'Soybean (सोयाबीन)' },
  { id: 'wheat', label: 'Wheat (गहू)' },
  { id: 'paddy', label: 'Paddy (तांदूल)' },
  { id: 'cotton', label: 'Cotton (कापूस)' },
  { id: 'onion', label: 'Onion (कांदा)' },
  { id: 'tomato', label: 'Tomato (टोमॅटो)' },
  { id: 'grape', label: 'Grape (द्राक्ष)' },
];

interface Assessment {
  grade: string;
  label: string;
  crop: string;
  priceRange: { min: number; max: number };
  description: string;
  parameters: { param: string; label: string; unit: string; value: number | null; threshold: number; direction: string; status: 'pass' | 'fail' | 'unknown'; detail: string; description: string }[];
  confidence: number;
  agmarkRef: { act: string; authority: string; website: string; note: string };
}

interface Certificate {
  id: string;
  crop: string;
  grade: string;
  gradeLabel: string;
  fpoStatus: string;
  confidence: number;
  priceRange: { min: number; max: number };
  createdAt: string;
}

export default function GradeCrop() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { flowStep, setFlowStep, inFlow } = useFlow();

  const [crop, setCrop] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [mlResult, setMlResult] = useState<MLResult | null>(null);
  const [mlStatus, setMlStatus] = useState<string>('loading');
  const [mlAnalyzing, setMlAnalyzing] = useState(false);

  // Questionnaire state
  const [dryingMethod, setDryingMethod] = useState('');
  const [storageCondition, setStorageCondition] = useState('');
  const [visibleMold, setVisibleMold] = useState(false);
  const [odor, setOdor] = useState('');

  const [error, setError] = useState('');

  const photoCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load ML model on mount
  useEffect(() => {
    loadModel().then((ok) => {
      setMlStatus(ok ? 'loaded' : 'failed');
    });
  }, []);

  // Run ML inference when photo changes
  useEffect(() => {
    if (!photo || !isModelLoaded()) {
      setMlResult(null);
      return;
    }
    setMlAnalyzing(true);
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        // Run ML inference (just the ML part — we pass empty params for crop-specific defaults later)
        const result = await analyzeCrop(canvas);
        setMlResult(result);
      }
      setMlAnalyzing(false);
    };
    img.src = photo;
  }, [photo, crop]);

  const runAssessment = async () => {
    if (!crop) return;
    setLoading(true);
    setError('');
    try {
      // Build params — ML-estimated if available, otherwise questionnaire-based
      const params: Record<string, number> = {};

      // Use ML results if available
      if (mlResult) {
        params.damage = mlResult.estimatedDamage;
        params.foreignMatter = mlResult.estimatedForeignMatter;
        // ML-estimated oil content for soybean based on grade
        if (crop === 'soybean') {
          params.oilContent = mlResult.grade === 'I' ? 21 : mlResult.grade === 'II' ? 18.5 : 16;
        }
      }

      // Add crop-specific defaults for parameters ML can't estimate from photos
      if (crop === 'soybean') {
        if (!params.oilContent) params.oilContent = visibleMold ? 16 : dryingMethod === 'sun-dried' ? 19.5 : 18.2;
        params.moisture = dryingMethod === 'sun-dried' ? 8.5 : 11.2;
        if (!params.damage) params.damage = visibleMold ? 4.5 : 1.8;
        if (!params.foreignMatter) params.foreignMatter = 0.3;
        params.immature = 2.5;
        params.splits = 7;
      } else if (crop === 'wheat') {
        params.foreignMatter = mlResult ? mlResult.estimatedForeignMatter : (visibleMold ? 3.2 : 1.2);
        params.damaged = mlResult ? mlResult.estimatedDamage : (visibleMold ? 3.8 : 1.5);
        params.weevilled = 2.0;
        params.moisture = dryingMethod === 'sun-dried' ? 10.5 : 11.8;
        params.immature = 3.0;
      } else if (crop === 'paddy') {
        params.foreignMatter = mlResult ? mlResult.estimatedForeignMatter : 1.5;
        params.admixture = visibleMold ? 12 : 6;
        params.damaged = mlResult ? mlResult.estimatedDamage : (visibleMold ? 4 : 1.5);
        params.moisture = 13.5;
      } else if (crop === 'cotton') {
        params.stapleLength = visibleMold ? 22 : 28;
        params.micronaire = 4.2;
        params.fiberStrength = 28;
        params.trashContent = mlResult ? mlResult.estimatedForeignMatter * 2 : (visibleMold ? 8 : 3.5);
        params.color = 75;
      } else if (crop === 'onion') {
        params.size = visibleMold ? 30 : 52;
        params.damage = mlResult ? mlResult.estimatedDamage : (visibleMold ? 6 : 1.5);
        params.foreignMatter = mlResult ? mlResult.estimatedForeignMatter : 0.4;
        params.moisture = 87;
      } else if (crop === 'tomato') {
        params.size = visibleMold ? 35 : 58;
        params.damage = mlResult ? mlResult.estimatedDamage : (visibleMold ? 5 : 0.8);
        params.foreignMatter = mlResult ? mlResult.estimatedForeignMatter : 0.3;
        params.color = 82;
      } else if (crop === 'grape') {
        params.size = visibleMold ? 11 : 17;
        params.damage = mlResult ? mlResult.estimatedDamage : (visibleMold ? 3.5 : 0.3);
        params.sugarContent = visibleMold ? 13 : 19;
        params.color = 85;
      }

      const res = await apiFetch(`${API_URL}/grade-assessment`, {
        method: 'POST',
        body: JSON.stringify({
          crop,
          params,
          photoBase64: photo,
          questionnaire: { dryingMethod, storageCondition, visibleMold, odor },
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Attach ML metadata to assessment
        if (mlResult) {
          data.assessment.mlVerified = true;
          data.assessment.mlConfidence = mlResult.confidence;
          data.assessment.mlInferenceTimeMs = mlResult.inferenceTimeMs;
          data.assessment.mlModelVersion = mlResult.modelVersion;
        }
        setAssessment(data.assessment);
        setCertificate(data.certificate);
      } else {
        setError(data.error || 'Grading failed');
      }
    } catch {
      setError('Failed to connect to grading service');
    } finally {
      setLoading(false);
    }
  };

  const handleFpoVerify = async () => {
    if (!certificate) return;
    try {
      const res = await apiFetch(`${API_URL}/grade-assessment/${certificate.id}/fpo-verify`, {
        method: 'POST',
        body: JSON.stringify({ status: 'FPO_VERIFIED', fpoName: 'Kisan360 Demo FPO', notes: 'Verified based on AI assessment and farmer declaration.' }),
      });
      const data = await res.json();
      if (data.success) {
        setCertificate(prev => prev ? { ...prev, fpoStatus: 'FPO_VERIFIED' } : null);
      }
    } catch { /* ignore for demo */ }
  };

  const handleCreateLot = () => {
    if (assessment && certificate) {
      navigate(`/trade?prefill=1&crop=${encodeURIComponent(crop)}&grade=${assessment.grade}&certId=${certificate.id}`);
    }
  };

  const reset = () => {
    setCrop('');
    setPhoto(null);
    setAssessment(null);
    setCertificate(null);
    setMlResult(null);
    setDryingMethod('');
    setStorageCondition('');
    setVisibleMold(false);
    setOdor('');
    setError('');
  };

  return (
    <PageTransition className="max-w-4xl mx-auto space-y-6 pb-10">
      <PageHeader
        eyebrow={t('grade.eyebrow')}
        title={<>Grade My Crop — <span className="gradient-text">AGMARK Standards</span></>}
        subtitle={t('grade.subtitle')}
      />

      {/* ML Status Bar */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium ${
        mlStatus === 'loaded' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
        mlStatus === 'loading' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
        'bg-stone-50 text-stone-500 border border-stone-200'
      }`}>
        <Brain size={14} className={mlStatus === 'loading' ? 'animate-pulse' : ''} />
        {mlStatus === 'loaded' && <><CheckCircle2 size={12} /> AI Grading Model loaded — ready for image analysis</>}
        {mlStatus === 'loading' && <>Loading AI model...</>}
        {mlStatus === 'failed' && <><AlertTriangle size={12} /> AI model unavailable — using rule-based grading</>}
      </div>

      {!assessment ? (
        <Card className="p-6 space-y-5">
          {/* Crop selection */}
          <div>
            <SectionLabel>{t('grade.selectCrop')}</SectionLabel>
            <select
              className="input-field"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
            >
              <option value="">Select crop...</option>
              {GRADING_CROPS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-stone-400 mt-1">AGMARK grading standards available for 7 major Maharashtra crops</p>
          </div>

          {/* Photo capture */}
          <div>
            <SectionLabel>{t('grade.takePhoto')}</SectionLabel>
            <PhotoCapture onPhoto={setPhoto} photo={photo} />

            {/* ML analysis indicator */}
            {photo && mlAnalyzing && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                <Loader2 size={12} className="animate-spin" />
                AI analyzing your crop photo...
              </div>
            )}
            {photo && mlResult && !mlAnalyzing && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
                <Brain size={12} />
                AI detected: <span className="font-semibold">{mlResult.estimatedDamage}% damage</span>, <span className="font-semibold">{mlResult.estimatedForeignMatter}% foreign matter</span>
                <span className="ml-auto text-[10px] text-emerald-500">{mlResult.confidence}% confidence</span>
              </div>
            )}
            {photo && !mlAnalyzing && !mlResult && mlStatus === 'loaded' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />
                AI could not analyze this photo — using questionnaire data
              </div>
            )}
          </div>

          {/* Questionnaire */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">Quick Assessment Questions</p>
            <p className="text-[11px] text-stone-400">
              {mlResult
                ? 'AI has analyzed your photo. These questions add context for AGMARK grading.'
                : 'These help refine the grade. Answer honestly — it\'s for your benefit.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">How was the crop dried?</label>
                <select className="input-field" value={dryingMethod} onChange={(e) => setDryingMethod(e.target.value)}>
                  <option value="">Select...</option>
                  <option value="sun-dried">Sun-dried (traditional)</option>
                  <option value="mechanical">Mechanical dryer</option>
                  <option value="natural">Natural (not dried)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Storage condition?</label>
                <select className="input-field" value={storageCondition} onChange={(e) => setStorageCondition(e.target.value)}>
                  <option value="">Select...</option>
                  <option value="open-air">Open air / field</option>
                  <option value="covered">Covered (tarpaulin)</option>
                  <option value="warehouse">Warehouse / godown</option>
                  <option value="cold-storage">Cold storage</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Visible mold or fungus?</label>
                <select className="input-field" value={visibleMold ? 'yes' : 'no'} onChange={(e) => setVisibleMold(e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes — some visible</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Unusual odor?</label>
                <select className="input-field" value={odor} onChange={(e) => setOdor(e.target.value)}>
                  <option value="">No unusual odor</option>
                  <option value="musty">Musty / damp smell</option>
                  <option value="fermented">Fermented / sour</option>
                  <option value="chemical">Chemical smell</option>
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <GhostButton onClick={() => navigate(-1)} icon={ArrowLeft}>
              {t('flow.back')}
            </GhostButton>
            <PrimaryButton
              onClick={runAssessment}
              disabled={!crop || loading}
              icon={loading ? Loader2 : Sprout}
              className={loading ? 'animate-pulse' : ''}
            >
              {loading ? 'Grading...' : mlResult ? 'Grade with AI' : 'Grade My Crop'}
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <GradeResult
              assessment={assessment}
              onCreateLot={handleCreateLot}
              onSubmitFpo={handleFpoVerify}
              fpoStatus={certificate?.fpoStatus}
            />
          </Card>

          {certificate && (
            <Card className="p-5">
              <SectionLabel>FPO Certification Status</SectionLabel>
              <FpoCertification
                fpoStatus={certificate.fpoStatus}
                fpoName="Kisan360 Demo FPO"
                fpoVerifiedAt={certificate.fpoStatus === 'FPO_VERIFIED' ? new Date().toISOString() : undefined}
                fpoNotes={certificate.fpoStatus === 'FPO_VERIFIED' ? 'Verified based on AI assessment and farmer declaration.' : undefined}
              />
            </Card>
          )}

          <div className="flex items-center justify-between">
            <GhostButton onClick={reset} icon={ArrowLeft}>
              Grade Another Crop
            </GhostButton>
            {inFlow && flowStep === 1 && (
              <PrimaryButton onClick={() => { setFlowStep(2); navigate('/net-realization'); }} icon={ArrowRight}>
                Compare Markets
              </PrimaryButton>
            )}
          </div>
        </>
      )}

      {/* Hidden canvas for ML preprocessing */}
      <canvas ref={photoCanvasRef} className="hidden" />
    </PageTransition>
  );
}

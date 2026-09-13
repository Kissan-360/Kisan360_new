import React from 'react';
import {
  CheckCircle2, XCircle, HelpCircle, Award, TrendingUp,
  ArrowRight, ExternalLink, Brain, Zap,
} from 'lucide-react';
import { useTranslation } from '../i18n';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Parameter {
  param: string;
  label: string;
  unit: string;
  value: number | null;
  threshold: number;
  direction: string;
  status: 'pass' | 'fail' | 'unknown';
  detail: string;
  description: string;
}

interface GradeResultProps {
  assessment: {
    grade: string;
    label: string;
    crop: string;
    priceRange: { min: number; max: number };
    description: string;
    parameters: Parameter[];
    confidence: number;
    agmarkRef: { act: string; authority: string; website: string; note: string };
    mlVerified?: boolean;
    mlConfidence?: number;
    mlInferenceTimeMs?: number;
    mlModelVersion?: string;
  };
  onCreateLot?: () => void;
  onSubmitFpo?: () => void;
  fpoStatus?: string;
}

const STATUS_ICONS = {
  pass: CheckCircle2,
  fail: XCircle,
  unknown: HelpCircle,
};

const STATUS_COLORS = {
  pass: 'text-emerald-600 bg-emerald-50',
  fail: 'text-red-500 bg-red-50',
  unknown: 'text-stone-400 bg-stone-50',
};

export default function GradeResult({ assessment, onCreateLot, onSubmitFpo, fpoStatus }: GradeResultProps) {
  const { t } = useTranslation();
  const gradeColors: Record<string, string> = {
    I: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    II: 'bg-amber-100 text-amber-800 border-amber-300',
    III: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <div className="space-y-4">
      {/* Grade badge */}
      <div className="flex items-start gap-4">
        <div className={`h-16 w-16 rounded-2xl border-2 flex items-center justify-center shrink-0 ${gradeColors[assessment.grade] || 'bg-stone-100 text-stone-600'}`}>
          <div className="text-center">
            <Award size={20} className="mx-auto" />
            <p className="text-lg font-black mt-0.5">Grade {assessment.grade}</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-stone-900">{assessment.label}</p>
          <p className="text-sm text-stone-600 mt-0.5">{assessment.description}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-stone-400">
              Confidence: <span className="font-semibold text-stone-600">{assessment.confidence}%</span>
            </span>
            <span className="text-xs text-stone-400">
              Price range: <span className="font-semibold text-stone-600">{inr(assessment.priceRange.min)}–{inr(assessment.priceRange.max)}/q</span>
            </span>
          </div>
          {/* ML freshness check — photo-based, not a lab certificate */}
          {assessment.mlVerified && (
            <div className="flex items-center gap-2 mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 w-fit">
              <Brain size={14} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">AI-assessed · freshness only</span>
              <span className="text-[10px] text-emerald-500">{assessment.mlConfidence}% confidence</span>
              {assessment.mlInferenceTimeMs != null && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                  <Zap size={10} /> {assessment.mlInferenceTimeMs}ms
                </span>
              )}
            </div>
          )}
          {!assessment.mlVerified && (
            <div className="flex items-center gap-2 mt-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 w-fit">
              <HelpCircle size={14} className="text-stone-400" />
              <span className="text-xs text-stone-500">Rule-based grading (no AI model)</span>
            </div>
          )}
        </div>
      </div>

      {/* Parameter breakdown */}
      <div className="bg-stone-50 rounded-xl p-4">
        <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">Parameter Breakdown</p>
        <div className="space-y-2">
          {assessment.parameters.map((p) => {
            const Icon = STATUS_ICONS[p.status];
            const colorClass = STATUS_COLORS[p.status];
            return (
              <div key={p.param} className="flex items-center gap-2">
                <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                  <Icon size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-stone-700">{p.label}</span>
                    <span className="text-xs text-stone-500">
                      {p.value != null ? `${p.value}${p.unit}` : '—'}
                      {p.direction === 'min' ? ` (min ${p.threshold}${p.unit})` : ` (max ${p.threshold}${p.unit})`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AGMARK Reference */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-2">
          <ExternalLink size={14} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-blue-800">AGMARK Grade Reference</p>
            <p className="text-[11px] text-blue-600 mt-0.5">{assessment.agmarkRef.act}</p>
            <p className="text-[11px] text-blue-600">Authority: {assessment.agmarkRef.authority}</p>
            <p className="text-[11px] text-blue-500 mt-1 italic">{assessment.agmarkRef.note}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {onSubmitFpo && fpoStatus === 'AI_GRADED' && (
          <button
            onClick={onSubmitFpo}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1.5"
          >
            <ArrowRight size={14} /> Submit to FPO for Verification
          </button>
        )}
        {fpoStatus === 'SUBMITTED_TO_FPO' && (
          <span className="text-sm font-medium px-4 py-2 rounded-lg bg-amber-100 text-amber-700">
            Awaiting FPO Verification...
          </span>
        )}
        {fpoStatus === 'FPO_VERIFIED' && (
          <span className="text-sm font-medium px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> FPO Verified
          </span>
        )}
        {fpoStatus === 'FPO_REJECTED' && (
          <span className="text-sm font-medium px-4 py-2 rounded-lg bg-red-100 text-red-700 flex items-center gap-1.5">
            <XCircle size={14} /> FPO Rejected — Re-grade recommended
          </span>
        )}
        {onCreateLot && (
          <button
            onClick={onCreateLot}
            className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-colors flex items-center gap-1.5"
          >
            <TrendingUp size={14} /> Create Lot with This Grade
          </button>
        )}
      </div>
    </div>
  );
}

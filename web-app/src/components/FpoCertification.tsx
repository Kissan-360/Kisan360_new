import React from 'react';
import { CheckCircle2, Clock, XCircle, Building2 } from 'lucide-react';
import { useTranslation } from '../i18n';

interface FpoCertificationProps {
  fpoStatus: string;
  fpoName?: string;
  fpoVerifiedAt?: string;
  fpoNotes?: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  AI_GRADED: { icon: Clock, label: 'AI Graded — Ready for FPO', color: 'text-stone-500', bg: 'bg-stone-100' },
  SUBMITTED_TO_FPO: { icon: Clock, label: 'Submitted to FPO — Awaiting Review', color: 'text-amber-600', bg: 'bg-amber-100' },
  FPO_VERIFIED: { icon: CheckCircle2, label: 'FPO Verified — Grade Certified', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  FPO_REJECTED: { icon: XCircle, label: 'FPO Rejected — Re-grade Recommended', color: 'text-red-500', bg: 'bg-red-100' },
};

export default function FpoCertification({ fpoStatus, fpoName, fpoVerifiedAt, fpoNotes }: FpoCertificationProps) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[fpoStatus] || STATUS_CONFIG.AI_GRADED;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl p-4 border ${config.bg} border-stone-200`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center ${config.bg}`}>
          <Icon size={14} className={config.color} />
        </div>
        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
      </div>

      {fpoName && (
        <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
          <Building2 size={12} />
          <span>{fpoName}</span>
          {fpoVerifiedAt && <span>— {new Date(fpoVerifiedAt).toLocaleDateString('en-IN')}</span>}
        </div>
      )}

      {fpoNotes && (
        <p className="text-xs text-stone-500 mt-1.5 italic">"{fpoNotes}"</p>
      )}

      {fpoStatus === 'AI_GRADED' && (
        <p className="text-[11px] text-stone-400 mt-2">
          FPO verification adds a trusted layer — buyers see "Verified by {fpoName || 'FPO'}" on your grade.
        </p>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import {
  Send, CheckCircle2, Clock, Lock, Banknote,
  ArrowRight, Sparkles,
} from 'lucide-react';
import { useTranslation } from '../i18n';

// 3 farmer states, not 7 engine states. PENDING vs HELD is an escrow
// distinction a kisan rightly ignores — both mean "not yet in my hand".
// The backend's 7-step machine is untouched; only the presentation folds.
const TIMELINE_STEPS = [
  { key: 'offer', icon: Send, labelKey: 'payment.simple.offer' },
  { key: 'held', icon: Lock, labelKey: 'payment.simple.held' },
  { key: 'done', icon: Banknote, labelKey: 'payment.simple.done' },
];

interface PaymentTimelineProps {
  /** Current completed step (0-7). Step 7 = payment released. */
  currentStep: number;
  /** Called when farmer clicks "Simulate Next Step" */
  onAdvance: () => void;
  /** Optional demo control: simulate the buyer NOT paying (drives the grievance path) */
  onFail?: () => void;
  /** Total amount being paid (₹) */
  amount?: number;
  /** Farmer name for the release card */
  farmerName?: string;
  /** Label for the simulate button — describes the exact next simulated event.
      Defaults to the generic translation. */
  advanceLabel?: string;
  /** When false the simulate button is replaced by advanceHint. Lets the page
      hide a dead button (e.g. no offer sent yet) instead of a click that does
      nothing. Defaults to true. */
  showAdvance?: boolean;
  /** Guidance shown in place of the simulate button when showAdvance is false. */
  advanceHint?: string;
}

export default function PaymentTimeline({
  currentStep,
  onAdvance,
  onFail,
  amount,
  farmerName,
  advanceLabel,
  showAdvance = true,
  advanceHint,
}: PaymentTimelineProps) {
  const { t } = useTranslation();
  const [showBurst, setShowBurst] = useState(false);

  // Fold the 7 engine states onto the 3 farmer states: an offer out means
  // "waiting" (3), anything accepted-or-held means "safe" (4–6), released
  // means "cash" (7). Below "waiting" the deal hasn't started (0).
  const simpleStep = currentStep >= 7 ? 3 : currentStep >= 4 ? 2 : currentStep >= 3 ? 1 : 0;
  const isDone = simpleStep >= 3;

  const handleAdvance = () => {
    if (!isDone) {
      onAdvance();
      // This click collects the money (held → released), so celebrate now —
      // the parent reloads a beat later and the timeline lands on "cash".
      if (simpleStep === 2) {
        setShowBurst(true);
        setTimeout(() => setShowBurst(false), 3000);
      }
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            {t('payment.title')}
          </p>
          {amount != null && (
            <p className="text-lg font-extrabold text-stone-900 mt-0.5">
              ₹{amount.toLocaleString('en-IN')}
            </p>
          )}
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold text-stone-500">
          {simpleStep}/3
        </span>
      </div>

      {/* Simulated notice */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
        <p className="text-[10px] font-semibold text-amber-800">
          {t('payment.simulated')}
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {TIMELINE_STEPS.map((step, idx) => {
          const num = idx + 1;
          const done = num <= simpleStep;
          const active = num === simpleStep + 1 && !isDone;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-start gap-3 relative">
              {/* Vertical connector line */}
              {idx < TIMELINE_STEPS.length - 1 && (
                <div className={`absolute left-[15px] top-[32px] w-[2px] h-[calc(100%-8px)] ${
                  done ? 'bg-emerald-400' : 'bg-stone-200'
                }`} />
              )}

              {/* Step circle */}
              <div className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                done
                  ? 'bg-emerald-500 text-white'
                  : active
                    ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400 animate-pulse'
                    : 'bg-stone-100 text-stone-400'
              }`}>
                {done ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Icon size={16} />
                )}
              </div>

              {/* Step content */}
              <div className={`pb-6 min-w-0 flex-1 ${
                done ? 'text-stone-900' : active ? 'text-stone-800' : 'text-stone-400'
              }`}>
                <p className={`text-[13px] font-semibold ${done ? 'text-stone-900' : active ? 'text-stone-800' : 'text-stone-400'}`}>
                  {t(step.labelKey)}
                </p>
                {active && (
                  <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('payment.inProgress')}
                  </span>
                )}
                {done && num === 3 && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                    {t('payment.releasedTo', { name: farmerName || t('payment.farmer') })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulate button — hidden when there is nothing to simulate (the page
          passes showAdvance=false with a next-step hint instead of a dead
          button), and gone for good once the deal completes. */}
      {simpleStep < 3 && showAdvance && (
        <div className="mt-4 space-y-2">
          <button
            onClick={handleAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-900 transition-colors"
          >
            <ArrowRight size={16} />
            {advanceLabel || t('payment.simulateNext')}
          </button>
          {onFail && simpleStep === 2 && (
            <button
              onClick={onFail}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <Clock size={14} />
              {t('payment.simple.simulateFail')}
            </button>
          )}
        </div>
      )}
      {simpleStep < 3 && !showAdvance && advanceHint && (
        <p className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500 leading-relaxed">
          {advanceHint}
        </p>
      )}

      {/* Success burst */}
      {showBurst && (
        <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-center animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles size={20} className="text-white" />
            <p className="text-sm font-extrabold text-white">{t('payment.success')}</p>
            <Sparkles size={20} className="text-white" />
          </div>
          <p className="text-xs text-emerald-100">{t('payment.successDesc')}</p>
        </div>
      )}
    </div>
  );
}

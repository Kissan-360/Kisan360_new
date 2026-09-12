import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sprout, BarChart3, Package, Users, Banknote,
  ArrowRight, ArrowLeft, X, CheckCircle2,
} from 'lucide-react';
import { useFlow } from './FlowContext';
import { useTranslation } from '../i18n';

// Each step has a title, instruction, CTA label, and route.
// The CTA action is handled by the page that reads flowStep — this bar
// just tells the farmer what to do and provides a "Next" signal.
const STEPS = [
  {
    key: 'crop',
    route: '/decision',
    icon: Sprout,
    titleKey: 'guidance.step1.title',
    instructionKey: 'guidance.step1.instruction',
    ctaKey: 'guidance.step1.cta',
  },
  {
    key: 'compare',
    route: '/net-realization',
    icon: BarChart3,
    titleKey: 'guidance.step2.title',
    instructionKey: 'guidance.step2.instruction',
    ctaKey: 'guidance.step2.cta',
  },
  {
    key: 'lot',
    route: '/trade',
    icon: Package,
    titleKey: 'guidance.step3.title',
    instructionKey: 'guidance.step3.instruction',
    ctaKey: 'guidance.step3.cta',
  },
  {
    key: 'buyers',
    route: '/trade',
    icon: Users,
    titleKey: 'guidance.step4.title',
    instructionKey: 'guidance.step4.instruction',
    ctaKey: 'guidance.step4.cta',
  },
  {
    key: 'payment',
    route: '/trade',
    icon: Banknote,
    titleKey: 'guidance.step5.title',
    instructionKey: 'guidance.step5.instruction',
    ctaKey: 'guidance.step5.cta',
  },
];

export default function FlowGuidanceBar() {
  const { flowStep, setFlowStep, endFlow } = useFlow();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const step = STEPS[flowStep - 1];
  if (!step) return null;

  const Icon = step.icon;
  const isFirst = flowStep === 1;
  const isLast = flowStep === 5;

  const handlePrev = () => {
    if (flowStep > 1) {
      const prev = STEPS[flowStep - 2];
      setFlowStep(flowStep - 1);
      navigate(prev.route);
    }
  };

  const handleNext = () => {
    if (flowStep < 5) {
      const next = STEPS[flowStep];
      setFlowStep(flowStep + 1);
      navigate(next.route);
    }
  };

  return (
    <div className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-2">
          {STEPS.map((s, idx) => {
            const num = idx + 1;
            const done = num < flowStep;
            const active = num === flowStep;
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (num <= flowStep) {
                    setFlowStep(num);
                    navigate(s.route);
                  }
                }}
                disabled={num > flowStep}
                className={`h-2 rounded-full transition-all ${
                  active ? 'bg-emerald-600 w-8' : done ? 'bg-emerald-400 w-4 cursor-pointer hover:bg-emerald-500' : 'bg-stone-200 w-4'
                }`}
                title={t(s.titleKey)}
                aria-label={`${t(s.titleKey)} — ${num < flowStep ? 'done' : num === flowStep ? 'current' : 'upcoming'}`}
              />
            );
          })}
          <span className="ml-2 text-[10px] font-bold text-stone-400">
            {flowStep}/5
          </span>
        </div>

        {/* Step content */}
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-900">
              {t(step.titleKey)}
            </p>
            <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
              {t(step.instructionKey)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={12} /> {t('flow.back')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNext}
              className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-colors flex items-center gap-1.5"
            >
              {t(step.ctaKey)}
              {!isLast && <ArrowRight size={12} />}
              {isLast && <CheckCircle2 size={12} />}
            </button>

            <button
              onClick={endFlow}
              className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
              title={t('flow.exit')}
              aria-label={t('flow.exit')}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

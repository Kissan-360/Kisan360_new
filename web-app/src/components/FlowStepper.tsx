import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sprout, BarChart3, Package, Users, Banknote, CheckCircle2, X,
} from 'lucide-react';
import { useFlow } from './FlowContext';
import { useTranslation } from '../i18n';

const STEPS = [
  { key: 'crop', route: '/decision', icon: Sprout },
  { key: 'compare', route: '/net-realization', icon: BarChart3 },
  { key: 'lot', route: '/trade', icon: Package },
  { key: 'buyers', route: '/trade', icon: Users },
  { key: 'payment', route: '/trade', icon: Banknote },
];

export default function FlowStepper() {
  const { flowStep, setFlowStep, endFlow } = useFlow();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleStepClick = (idx: number) => {
    const step = idx + 1;
    if (step <= flowStep) {
      setFlowStep(step);
      navigate(STEPS[idx].route);
    }
  };

  const handleNext = () => {
    if (flowStep < 5) {
      setFlowStep(flowStep + 1);
      navigate(STEPS[flowStep].route);
    }
  };

  const handlePrev = () => {
    if (flowStep > 1) {
      setFlowStep(flowStep - 1);
      navigate(STEPS[flowStep - 2].route);
    }
  };

  return (
    <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
      <div className="max-w-4xl mx-auto">
        {/* Stepper bar */}
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => {
            const num = idx + 1;
            const done = num < flowStep;
            const active = num === flowStep;
            const Icon = step.icon;

            return (
              <React.Fragment key={step.key}>
                {/* Step circle + label */}
                <button
                  onClick={() => handleStepClick(idx)}
                  disabled={num > flowStep}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-emerald-800 text-white shadow-sm'
                      : done
                        ? 'bg-emerald-100 text-emerald-800 cursor-pointer hover:bg-emerald-200'
                        : 'bg-stone-100 text-stone-400 cursor-default'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={14} className="text-emerald-700 shrink-0" />
                  ) : (
                    <Icon size={14} className="shrink-0" />
                  )}
                  <span className="hidden sm:inline">
                    {t(`flow.step${num}`)}
                  </span>
                  <span className="sm:hidden">{num}</span>
                </button>

                {/* Connector line */}
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-[2px] mx-1 rounded ${
                    num < flowStep ? 'bg-emerald-400' : 'bg-stone-200'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-2.5">
          <button
            onClick={handlePrev}
            disabled={flowStep <= 1}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              flowStep <= 1
                ? 'text-stone-300 cursor-default'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            ← {t('flow.back')}
          </button>

          <span className="text-[10px] text-stone-400 font-medium">
            {t('flow.step')} {flowStep} {t('flow.of')} 5
          </span>

          <div className="flex items-center gap-2">
            {flowStep < 5 ? (
              <button
                onClick={handleNext}
                className="text-[11px] font-bold px-4 py-1.5 rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-colors"
              >
                {t('flow.next')} →
              </button>
            ) : (
              <button
                onClick={endFlow}
                className="text-[11px] font-bold px-4 py-1.5 rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-colors"
              >
                {t('flow.done')} ✓
              </button>
            )}

            <button
              onClick={endFlow}
              className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100 transition-colors"
              title={t('flow.exit')}
              aria-label={t('flow.exit')}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

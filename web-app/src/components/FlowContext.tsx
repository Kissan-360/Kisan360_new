import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const FLOW_STEP_KEY = 'kisan360-flow-step';

interface FlowContextValue {
  flowStep: number;
  setFlowStep: (step: number) => void;
  inFlow: boolean;
  startFlow: () => void;
  endFlow: () => void;
}

const FlowContext = createContext<FlowContextValue>({
  flowStep: 0,
  setFlowStep: () => {},
  inFlow: false,
  startFlow: () => {},
  endFlow: () => {},
});

export const useFlow = () => useContext(FlowContext);

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [flowStep, setFlowStepRaw] = useState<number>(() => {
    try {
      const v = localStorage.getItem(FLOW_STEP_KEY);
      const n = v != null ? parseInt(v, 10) : 0;
      return n >= 1 && n <= 5 ? n : 0;
    } catch { return 0; }
  });

  const inFlow = flowStep >= 1 && flowStep <= 5;

  const setFlowStep = useCallback((step: number) => {
    setFlowStepRaw(step);
    try {
      if (step >= 1 && step <= 5) {
        localStorage.setItem(FLOW_STEP_KEY, String(step));
      } else {
        localStorage.removeItem(FLOW_STEP_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const startFlow = useCallback(() => setFlowStep(1), [setFlowStep]);
  const endFlow = useCallback(() => setFlowStep(0), [setFlowStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inFlow) endFlow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inFlow, endFlow]);

  return (
    <FlowContext.Provider value={{ flowStep, setFlowStep, inFlow, startFlow, endFlow }}>
      {children}
    </FlowContext.Provider>
  );
}

// Decision Context — shared state for the INFORM → COMPARE → DECIDE → CONNECT → SELL journey.
// The farmer enters crop + district + quantity ONCE; all five stages read from this context.
// No AI, no arbitrary scores — just the shared lot parameters.

export interface LotContext {
  crop: string;
  district: string;
  quantityQuintals: number;
  grade?: string;
  size?: string;
  moisturePct?: number;
  damagePct?: number;
}

const STORAGE_KEY = 'k360_decision_context';

export function saveDecisionContext(ctx: LotContext): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch { /* ignore */ }
}

export function loadDecisionContext(): LotContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearDecisionContext(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// Alias for backward compatibility
export const getDecisionContext = loadDecisionContext;
export const setDecisionContext = saveDecisionContext;
export type DecisionContext = LotContext;

// Default context for the canonical demo scenario
export const DEFAULT_CONTEXT: LotContext = {
  crop: 'Onion',
  district: 'Nashik',
  quantityQuintals: 10,
};

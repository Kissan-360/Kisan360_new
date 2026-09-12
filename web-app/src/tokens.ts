/* ============================================================================
   KISAN360 DESIGN TOKENS — single source of truth
   Kept intentionally small: only tokens with live consumers ship here.
   Colors/radii/typography/gradients live in src/index.css (@theme + component
   classes) so the Tailwind palette and CSS stay in one layer.
   ============================================================================ */

/* Motion tokens — one place for every duration/easing in the app.
   Typed as framer-motion Transitions so tuple easings stay compatible. */
import type { Transition } from 'framer-motion';

export const MOTION: {
  fast: Transition;
  base: Transition;
  slow: Transition;
} = {
  fast: { duration: 0.14, ease: [0.16, 1, 0.3, 1] },
  base: { duration: 0.22, ease: "easeInOut" },
  slow: { duration: 0.36, ease: [0.34, 1.4, 0.44, 1] },
};

/* Data provenance labels — the product's honesty vocabulary. Screens render
   these through <DataTag/>, never as a free-form string. */
export const PROVENANCE_LABELS: Record<string, string> = {
  FACT: "FACT",
  REFERENCE: "REFERENCE",
  DERIVED: "DERIVED",
  HISTORICAL: "HISTORICAL",
  FARMER_ENTERED: "FARMER ENTERED",
  FARMER_DECLARED: "FARMER DECLARED",
  SOURCE_VERIFIED: "SOURCE VERIFIED",
  DEMO_VERIFIED: "DEMO VERIFIED",
  SELF_DECLARED: "SELF DECLARED",
  REAL_VERIFIED: "REAL VERIFIED",
  AI_ASSESSED: "AI ASSESSED",
  DEMO: "DEMO",
  DEMO_DEMAND: "DEMO DEMAND",
  DEMO_LOGISTICS: "DEMO LOGISTICS",
  OBSERVED: "OBSERVED",
  HYPOTHETICAL: "HYPOTHETICAL",
};

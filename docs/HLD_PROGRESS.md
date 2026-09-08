# Kisan360 HLD — Implementation Progress Tracker

Source of truth: `Kisan360_HLD (2).pdf` (High-Level Design v2, SIH26132).
Updated: 2026-09-08 (build day 1). Owner tags: TL=Team Lead/Backend, ML=ML/RAG,
MD=Market Data, FE=Frontend, QA=DevOps/QA, DC=Docs.

Scoring: every task below is scored 0–100% by **platform-readiness** (engine/API +
UI + tests), not just backend. Overall = weighted: P0 ×3, P1 ×2, P2 ×1.
P3 is explicit roadmap (scored 0 by design, excluded from the numerator).

## P0 — the four things that must work (weight ×3)

| # | Task | Status | % | Notes / owner |
|---|---|---|---|---|
| P0.1 | Net-realization engine — deterministic, farmer-borne costs only, ranks mandis | Engine + API + assumptions + tests done; comparison-card UI not built yet | 70 | Engine 100% (TL+ML); UI 0% (FE) |
| P0.2 | Evidence/provenance on every price (source, retrieved_at, freshness) | Done — market route provenance + per-mandi evidence in calculator | 100 | TL |
| P0.3 | Buyer matching + four-tier trust badge (REAL/SOURCE/DEMO/SELF_DECLARED) | Directory + matching + tiers done; badge UI not built yet | 60 | Backend 100% (TL); badges UI 0% (FE) |
| P0.4 | One complete journey: price → net → lot → buyer → offer → accept → simulated payment | Backend journey fully tested over HTTP; journey screens not built yet | 70 | Backend 100% (TL); screens 0% (FE) |
| | **P0 subtotal** | | **75%** | |

## P1 — thin vertical slices (weight ×2)

| Task | Status | % |
|---|---|---|
| FPO aggregation — 5 mock farmers → 1 bulk lot → realization comparison | Not started (MD) | 0 |
| Localized trend — 7/14/30-day, no forecasting ML | Not started (MD) | 0 |
| Quality — structured fields grade/size/moisture/damage/assay, no vision model | Done — Lot model + API + tested (TL) | 100 |
| Logistics — distance × documented ₹/km assumption, no OSRM | Done — assumptions endpoint + calculator (TL) | 100 |
| Grievance — Raise → Open → Under Review → Resolved | Not started | 0 |
| Lot-creation + buyer-list UI with trust badges | Not started (FE) | 0 |
| Payment-status UI (Pending→Held→Released timeline) | Not started (FE) | 0 |
| FPO pooling UI + side-by-side uplift comparison | Not started (FE) | 0 |
| | **P1 subtotal** | **25%** |

## P2 — reuse only (weight ×1)

| Task | Status | % |
|---|---|---|
| RAG explains the calculator's output (never generates numbers) | Advisory pipeline exists (MiniLM+Groq, templates fallback); calculator-aware explanation not wired | 50 |
| Disease detection stays as-is and confirmed running | Service + model code present; needs a re-boot confirmation pass (QA/ML) | 85 |
| | **P2 subtotal** | **68%** |

## P3 — explicit roadmap (not scored)

GST/FSSAI live API verification · real payment gateway/escrow · OSRM/truck
aggregation · quality-grading vision model · immutable audit trail · mobile
rewrite · predictive price ML.

## Totals

| Group | % |
|---|---|
| P0 (×3) | 75 |
| P1 (×2) | 25 |
| P2 (×1) | 68 |
| **Overall (weighted)** | **≈57%** |

Backend/Team-Lead lane (auth, routing Node↔FastAPI, market cache, net-realization
wiring, lots/buyers/offers/payments state machine, demo-auth, integration tests):
**100% of the role's day-1–5 deliverables** are implemented and green on branch
`backend/team-lead-core`. Raising the overall number next requires the Frontend
lane (P0/P1 screens) and Market-Data lane (FPO math, 7/14/30-day trend, real
price refresh).

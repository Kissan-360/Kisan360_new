# Kisan360 HLD — Implementation Progress Tracker

Source of truth: `Kisan360_HLD (2).pdf` (High-Level Design v2, SIH26132).
Updated: 2026-09-08 (build day 1, P1 verticals + P2 RAG wire-up landed).
Owner tags: TL=Team Lead/Backend, ML=ML/RAG, MD=Market Data, FE=Frontend, QA=DevOps/QA, DC=Docs.

Scoring: every task below is scored 0–100% by **platform-readiness** (engine/API +
UI + tests), not just backend. Overall = weighted: P0 ×3, P1 ×2, P2 ×1.
P3 is explicit roadmap (scored 0 by design, excluded from the numerator).

## P0 — the four things that must work (weight ×3)

| # | Task | Status | % | Notes / owner |
|---|---|---|---|---|
| P0.1 | Net-realization engine — deterministic, farmer-borne costs only, ranks mandis | Done — engine + `/net-realization` page: ranked cards, best-mandi banner, "Why?" drawer with cost breakdown + evidence + buyer-side charges. Verified live in browser | 100 | Engine (TL+ML) + UI (TL) |
| P0.2 | Evidence/provenance on every price (source, retrieved_at, freshness) | Done — market route provenance + per-mandi evidence in calculator | 100 | TL |
| P0.3 | Buyer matching + four-tier trust badge (REAL/SOURCE/DEMO/SELF_DECLARED) | Done — Trade page buyer cards with color-coded tier badges, min-qty gating, simulated-for-demo disclaimer. Verified live | 100 | Backend (TL) + UI (TL) |
| P0.4 | One complete journey: price → net → lot → buyer → offer → accept → simulated payment | Done — Trade page: lot creation form, offer composer with lot-total preview, buyer accept/reject, payment Pending→Held→Released timeline. Full journey driven live in browser (farmer → buyer role) | 100 | Backend (TL) + UI (TL) |
| | **P0 subtotal** | | **100%** | |

## P1 — thin vertical slices (weight ×2)

| Task | Status | % |
|---|---|---|
| FPO aggregation — 5 mock farmers → 1 bulk lot → realization comparison | Done — `POST /api/fpo/pool` + `/fpo` screen with side-by-side uplift; bulk transport tier (≥40 q) added to the calculator and documented | 100 |
| Localized trend — 7/14/30-day, no forecasting ML | Done — `GET /api/market/trend` over accumulated observed history (`priceHistory.json`, appended by the daily refresher); explicitly descriptive, never predictive. History depth grows daily | 90 |
| Quality — structured fields grade/size/moisture/damage/assay, no vision model | Done — Lot model + API + tested (TL) | 100 |
| Logistics — distance × documented ₹/km assumption, no OSRM | Done — assumptions endpoint + calculator (TL) | 100 |
| Grievance — Raise → Open → Under Review → Resolved | Done — `Grievance` model + routes on the shared state machine; legal path tested, illegal jumps rejected | 90 |
| Lot-creation + buyer-list UI with trust badges | Done — Trade page (TL) | 100 |
| Payment-status UI (Pending→Held→Released timeline) | Done — Trade page timeline + history log (TL) | 100 |
| FPO pooling UI + side-by-side uplift comparison | Done — `/fpo` screen (TL) | 100 |
| | **P1 subtotal** | **93%** |

## P2 — reuse only (weight ×1)

| Task | Status | % |
|---|---|---|
| RAG explains the calculator's output (never generates numbers) | Done — `POST /explain-net-realization` (Groq + deterministic template fallback) + `/market/net-realization/explain` route + "Explain in simple words" button in the Why? drawer; honesty-tagged `explainedBy` | 100 |
| Disease detection stays as-is and confirmed running | Service + model code present; needs a re-boot confirmation pass (QA/ML) | 85 |
| | **P2 subtotal** | **93%** |

## P3 — explicit roadmap (not scored)

GST/FSSAI live API verification · real payment gateway/escrow · OSRM/truck
aggregation · quality-grading vision model · immutable audit trail · mobile
rewrite · predictive price ML.

## Totals

| Group | % |
|---|---|
| P0 (×3) | 100 |
| P1 (×2) | 93 |
| P2 (×1) | 93 |
| **Overall (weighted)** | **≈97%** |

Backend/Team-Lead lane (auth, routing Node↔FastAPI, market cache, net-realization
wiring, lots/buyers/offers/payments state machine, demo-auth, integration tests):
**100% of the role's day-1–5 deliverables** are implemented and green on branch
`backend/team-lead-core`. **P0 100%, P1 93%, P2 93% — overall ≈97%.** The
remaining gap: trend history depth (grows daily with the refresher), the
disease/advisory re-boot confirmation, and demo-day rehearsal. Everything in
the HLD's scored scope is implemented; P3 remains documented roadmap.

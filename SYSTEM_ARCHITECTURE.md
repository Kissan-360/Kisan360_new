# Kisan360 — System Architecture

Kisan360 is an **explainable market-linkage decision layer** for farmers and FPOs. It does not
replace AGMARKNET, eNAM, APMC systems or FPO software — it sits on top of them and turns their
information into an actionable selling decision.

## The one-sentence thesis

**Data → Economics → Decision → Action → Outcome**, with the LLM confined to explanation and
the human making the final call.

## Layers (and the no-crossed-responsibilities rule)

```
DATA INGESTION          backend/src/services/marketCache.js
  AGMARKNET (data.gov.in) live pull → stamped snapshot cache (provenance: source,
  retrievedAt, freshness). Every price row carries where it came from.

DECISION SERVICE        ml-service/net_realization.py  (FastAPI, :8002) — DETERMINISTIC
  Net realization: gross − farmer-borne transport − storage − other. Buyer-side charges
  reported, never deducted (APMC Act s.31). Ranking, close-call detection, break-even
  transport, robustness scenarios, outlier flagging, confidence ladder, WITHOUT/WITH
  comparison. All constants in one versioned ASSUMPTIONS dict, exposed at /assumptions.
  The LLM never computes or alters any number here.

ACTIONABILITY           backend/src/services/actionability.js — DETERMINISTIC, PURE
  Maps costed mandis → buyer-directory coverage using only real directory fields
  (crops, service-area districts, minQuantityQuintals). Classifies ACTIONABLE / NO_MATCH /
  UNKNOWN. Economic rank is never changed by buyer coverage; the two are reported side
  by side.

APPLICATION             web-app (React) — farmer/FPO/buyer workflows
  Market discovery → net realization → why/evidence → what-if → lot → buyer match →
  offer benchmark → accept → simulated payment → receipt/history. Decision context
  (web-app/src/lib/decisionContext.ts) carries the selling decision across screens.

PERSISTENCE             backend/src/models/* (MongoDB, optional at boot)
  Lots, offers, payments, grievances, decision history. Server runs degraded-but-honest
  if Mongo is unreachable.

AI                      ml-service/advisory_service.py (+ optional Groq)
  EXPLANATION ONLY. Consumes the calculator's output and explains it in words. Fallback
  templates are deterministic. The AI never invents prices, costs, rankings or states.
```

## Invariants worth protecting (do not break these)

1. **The engine owns every number.** The UI never recomputes economics; it renders
   `farmerNetPerQuintal`, `differenceVsNext`, `withoutWith` etc. verbatim from the API.
2. **Provenance or it didn't happen.** Any price surfaced without `source` + `retrievedAt`
   is a bug. Cached data must be labeled cached.
3. **Honest-answer states are features:** YES / NO / TOO CLOSE / LIMITED EVIDENCE /
   NO CURRENT BUYER / SENSITIVE TO ASSUMPTIONS. Never replace them with forced confidence.
4. **Buyer-side ≠ farmer-borne.** Commission/fees stay out of the farmer's net.
5. **Simulated things say so** (payments, demo buyers, demo history rows).
6. **Economic rank is buyer-blind.** Actionability is reported next to economics, never
   blended into it.

## Deployment metrics to instrument (when real users exist)

Farmers served · lots evaluated · mandis compared per decision · buyer matches shown ·
offers received/accepted · transactions completed · estimated realization difference
(recommended vs naive) · FPO pooling events (lots pooled, minimums unlocked) · % of
recommendations with STRONG/GOOD evidence · cached-vs-live session share. No vanity
numbers, no fabricated impact — these need real usage to mean anything.

## Scale-out path (same architecture, no rewrites)

- New crop: nothing to do — the engine is crop-agnostic; the crop dropdown already follows
  cache data. Buyer directory gains crop entries as buyers are onboarded.
- New district/state: extend the distance table (later: routing API) and cache pulls; the
  calculator needs no crop/district hardcoding.
- New buyer/FPO: directory rows are data, not code.
- Government integration: AGMARKNET already plugs in as a source; eNAM/APMC feeds would be
  additional sources behind the same provenance-stamped cache.

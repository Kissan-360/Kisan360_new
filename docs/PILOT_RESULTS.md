# Kisan360 — Pilot Results (fill this in; do not estimate)

This file is the **only** place a pilot number may appear. Every row comes from
the ledger in `docs/PILOT_KIT.md` §5 (what happened in the room) or from an
artifact in `docs/evidence/` (what the machine saw). A number typed from memory
does not belong here.

Status: **no pilot sessions yet.** Until rows exist below, the correct statement
in any pitch is *"pilot kit ready, sessions not yet run"* — never a fabricated N.

---

## 1. Headline (fill after the pilot)

| Metric | Value | Source |
|---|---|---|
| Participants | — | ledger |
| Districts | — | ledger |
| Distinct devices | — | `docs/evidence/pilot-metrics.json` → `distinctDevices` |
| Sessions started | — | same file → `byEvent.session_started` |
| Sell-journey completions (lot + offer + settlement) | — | same file → `byEvent.lot_created`, `offer_accepted`, `payment_released` |
| Median time-to-decision (5 steps) | — | ledger "Steps time" |
| Completed **actual** sales (follow-up answered) | — | ledger "Actually sold?" |
| Predicted vs realised net error (median abs %) | — | §2 |

Snapshot the machine half of that table with:

```bash
ADMIN=$(curl -s -X POST https://kisan360-api.onrender.com/api/auth/demo-login \
  -H 'Content-Type: application/json' -d '{"role":"admin"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
curl -s -H "Authorization: Bearer $ADMIN" \
  "https://kisan360-api.onrender.com/api/ops/metrics?days=30" \
  -o docs/evidence/pilot-metrics.json
```

(Telemetry must have been `on` for the pilot window — see `PILOT_KIT.md` §0.
If it was off, this file will honestly report zero, and there is no pilot
evidence. Fix the flag *before* the sessions, not after.)

---

## 2. The claim worth testing: predicted net vs what was actually paid

Kisan360's decision screen promises a *net* realisation per quintal — mandi
price minus toll, transport, loading and handling. The test is whether that
number resembled reality.

Prediction is captured **at the moment the farmer ran it** (the value on their
screen, photographed, plus the ledger row). Realised price is captured **a week
later by phone**, after they actually sold somewhere — any buyer, not
necessarily one from this app. That asymmetry is the point: the platform does
not get to pick the counterfactual.

| ID | Date | District | Crop · qty | Mandi shown | Predicted net ₹/q | Sold? | Where/who | Realised ₹/q | Error % | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| *EXAMPLE* | *2026-10-04* | *Nashik* | *Onion · 10 q* | *Lasalgaon* | *1,430* | *y* | *local trader* | *1,380* | *−3.5%* | *trader deducted unloading not in the model; sell via mandi matched better* |

`Error % = (realised − predicted) / predicted × 100`. Report the **median
absolute** error, not the mean: one unusual sale should not decide the headline.
Delete the example row before submitting.

Separate the two failure modes when interpreting:

- **Model error** — the cost structure was wrong (rare; the ₹/q split is shown
  on screen and auditable).
- **Market error** — the price moved between the decision and the sale (common;
  this is what a sale-window recommendation is for, and a pilot should report
  how often it helped).

---

## 3. Usability, from the ledger

| Question | Result |
|---|---|
| Found the journey unaided (no pointers) | — / — |
| Median Q1 trust score (1–5) | — |
| Median Q2 unaided score (1–5) | — |
| Would check before selling (Q3 yes) | — / — |
| Language actually used (mr / hi / en) | — |
| Willingness to pay (Q6, median) | ₹ — |
| Recurring complaint (Q4, most common) | — |

---

## 4. What this pilot does **not** establish

Repeat this section verbatim in the pitch; a judge who finds an overclaim of
their own will discount everything else.

- **No causal uplift claim.** There is no control group. A pilot can show the
  tool is usable and that its prediction tracked reality; it cannot show the
  farmer earned *more because of us*.
- **Small n.** Every number is reported with its n beside it.
- **Simulated payments.** The escrow, release and failure paths run on the
  demo rails; nothing moved real money.
- **Self-reported realised prices**, with survivorship bias: a farmer who got a
  bad price is less likely to pick up the follow-up call.
- **One season, one region.** Anything broader needs a longer run, and the
  report should say which crops and months it actually covers.

---

## 5. Follow-up work this pilot feeds

1. Re-tune the transport/cost defaults per district from the realised-price
   deltas (§2) — the model becomes locally calibrated instead of statewide.
2. Promote the most common Q4 complaint into the next sprint, and re-measure
   the same question with the same wording.
3. Hand the ledger to the FPO partner for a second round with pooled lots, where
   the aggregation claim (₹/q uplift) can finally be tested with a comparison
   group of non-pooled sellers.

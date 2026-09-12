# Transaction Cost Accounting — Kisan360

## Definition

**Transaction cost** in Kisan360 means the costs and process burden specifically associated with finding, negotiating, arranging, and completing a sale — separate from production costs and separate from net-realization selling costs.

This module provides a **deterministic, auditable representation** of transaction-cost burden in the Kisan360 workflow.

**It does NOT claim:**
- "Kisan360 saves farmers X%"
- "Transaction costs reduced by Y%"

**It DOES provide:**
- Known monetary costs (with classification)
- Process-time metrics (from actual timestamps)
- Information coverage (system behavior measurement)
- Pathway cost comparisons (modeled estimates)
- Structured receipts (for every journey)

---

## Monetary Cost Model

### Farmer-Borne Costs (subtracted from gross price)

| Cost | Rate | Source |
|------|------|--------|
| Transport (small lot < 40q) | ₹1.5/q/km | pathwayDecision.js, net_realization.py |
| Transport (bulk ≥ 40q) | ₹0.75/q/km | pathwayDecision.js, net_realization.py |
| Storage | ₹1.0/q/day | scenario.js |
| Bagging | ₹8/q | net_realization.py |
| Loading | ₹5/q | net_realization.py |
| Market entry/unloading | ₹7/q | net_realization.py |
| **Total other** | **₹20/q** | pathwayDecision.js |

### Buyer-Borne Costs (not deducted from farmer)

| Cost | Rate | Payer |
|------|------|-------|
| APMC market fee | 0.5% of gross | Buyer |
| Commission agent fee | 1.0% of gross | Buyer |

### Not-Modeled Costs

| Cost | Classification |
|------|---------------|
| Platform fee | DOES_NOT_EXIST — Kisan360 charges no fee |
| Payment processing fee | NOT_MODELED — system is simulated |
| Insurance | NOT_MODELED |
| Interest / financing | NOT_MODELED |
| Quality grading / assay cost | NOT_MODELED |

**Key principle:** Unknown costs are labeled `NOT_MODELED`, not zero. Zero is only valid when the product actually charges zero.

---

## Process-Time Model

Uses actual Mongoose `createdAt` timestamps from:
- Lot
- Offer (createdAt + history[].at for ACCEPTED)
- LogisticsRequest (createdAt + history[].at for ACCEPTED)
- Payment (history[].at for RELEASED)

### Measured Durations

| Metric | Source | Unit |
|--------|--------|------|
| timeToFirstOfferHours | lot.createdAt → offer.createdAt | hours |
| timeToAcceptanceHours | offer.createdAt → offer.history[ACCEPTED].at | hours |
| timeToLogisticsHours | offer.history[ACCEPTED].at → logistics.createdAt | hours |
| timeToLogisticsAcceptanceHours | logistics.createdAt → logistics.history[ACCEPTED].at | hours |
| timeToPaymentReleaseHours | logistics.history[ACCEPTED].at → payment.history[RELEASED].at | hours |
| totalProcessDurationHours | lot.createdAt → payment.history[RELEASED].at | hours |

### Step Completion

| Classification | Steps Completed |
|---------------|----------------|
| FULLY_COMPLETED | 6/6 |
| PARTIALLY_COMPLETED | 1-5/6 |
| NOT_STARTED | 0/6 |

---

## Information Coverage Model

Measures what Kisan360 surfaced during a decision, counted across 12 categories:

1. Market price evidence
2. Market alternatives ranked
3. Net realization computed
4. Production economics
5. Price trend
6. Buyer demand signals
7. Quality requirements matched
8. Buyer candidates evaluated
9. Logistics providers
10. Storage options
11. Decision pathways presented
12. Payment status tracked

**Classification:**
- COMPREHENSIVE: 10-12/12
- ADEQUATE: 6-9/12
- PARTIAL: 3-5/12
- INSUFFICIENT: 0-2/12

**This is a system coverage metric, NOT a claim about information asymmetry reduction.**

---

## Pathway Cost Comparison

Compares known economic burdens across 4 pathways:

### SELL_NOW
- Transport + other costs (no storage)

### AGGREGATE_THROUGH_FPO
- Bulk transport rate (₹0.75 vs ₹1.5)
- No pooling cost modeled

### STORE_THEN_SELL
- Transport + storage + other
- Future price is HYPOTHETICAL ONLY

### ALTERNATIVE_MARKET
- Shows net range across ranked markets

### Estimated Advantages

Returns `estimatedAdvantage` for each comparison, labeled:
- `ESTIMATED_ADVANTAGE` — when difference exists in modeled costs
- `NO_MEASURABLE_ADVANTAGE` — when costs are equal

**Never called "actual savings" unless a completed real transaction baseline exists.**

---

## FPO Cost Advantage

Reuses existing FPO aggregation:
- Individual transport rate per member lot
- Pooled transport rate (bulk tier)
- `estimatedTransportAdvantagePerQ`
- `estimatedTransportAdvantageTotal`

**Classification:** `ESTIMATED_ADVANTAGE` (not REALIZED — no real logistics records exist).

---

## Logistics Cost Effect

Compares:
- `systemEstimate` — Kisan360's deterministic cost model (`MODEL_ESTIMATE`)
- `carrierQuote` — transport provider quote (`DEMO_LOGISTICS` for demo providers)

Returns `quoteDifference` per quintal and total.

---

## Payment / Transaction Cost Semantics

Current system uses `mocked: true` throughout:
- `Payment.amount = Offer.amount` (no deductions)
- `payment.status` transitions: PENDING → HELD → RELEASED
- Payment fee = `NOT_MODELED`

**Never claims actual payment processing fees.**

---

## Transaction Receipt

A completed journey produces a structured receipt containing:

- Farmer/lot identity
- Market observation
- Selected pathway
- Economics (gross, farmer-borne costs, net, production, profit)
- Buyer + trust tier
- Quality match
- Logistics (provider, quoted vs system estimate)
- Offer details
- Payment status
- Grievance status
- Process metrics
- Information coverage
- Provenance
- Demo flags

**Outcome classification:** Always `SIMULATED_OUTCOME` for demo transactions. Never `REALIZED_ADVANTAGE`.

---

## API

### GET /api/transaction-cost/transaction-cost

**Query params:** `crop`, `district`, `quantity`, `distanceKm`, `storageDays`, `lotId`

**Response:**
```json
{
  "success": true,
  "data": {
    "monetaryCosts": {...},
    "processMetrics": {...},
    "informationCoverage": {...},
    "pathwayComparison": {...},
    "fpoAdvantage": {...},
    "logisticsEffect": {...},
    "receipt": {...},
    "provenance": {...}
  }
}
```

### GET /api/transaction-cost/decision-receipt/:lotId

**Response:** Full structured receipt for a specific lot.

---

## Provenance

All costs trace to specific source files:
- Transport rates: `pathwayDecision.js` L42-43
- Storage rates: `scenario.js` L14
- Other costs: `pathwayDecision.js` L46
- Buyer-borne charges: `net_realization.py` ASSUMPTIONS (APMC Act)
- Platform fee: DOES_NOT_EXIST
- Payment fee: NOT_MODELED

---

## Limitations

1. All transactions in demo are simulated — no real money moves
2. All logistics quotes are demo data — not live carrier pricing
3. Production costs are farmer-entered — not independently verified
4. Market prices are from AGMARKNET cache — not live mandi feeds
5. Process metrics require actual record timestamps — null when absent
6. Information coverage measures system behavior, not farmer knowledge
7. Pathway comparisons use modeled estimates, not actual outcomes

# Farmer Economics — Developer Reference

The economics layer answers, in order: *What was the observed price? What might I realize after selling costs? What did production cost me? What price covers those costs? What is left over? What has the market actually done recently? What happens IF the price were X?*

It never predicts. Every layer below is deterministic arithmetic over observed or farmer-entered inputs.

## Layer hierarchy (do not blur these)

| Layer | Question it answers | Provenance |
|---|---|---|
| MARKET PRICE | What was observed at the mandi? | FACT — AGMARKNET observation |
| NET REALIZATION | What remains after farmer-borne selling costs? | DERIVED — calculator (`ml-service/net_realization.py`) |
| PRODUCTION COST | What did the farmer spend growing it? | FARMER_ENTERED — reported, not verified |
| BREAK-EVEN | What price covers production cost? | DERIVED |
| PROFIT | What remains after production + selling economics? | DERIVED |
| OBSERVED TREND | What has actually happened recently? | DERIVED — describes the past only |
| SCENARIO | What would happen IF price/yield/cost were X? | DERIVED / HYPOTHETICAL |
| PREDICTION | — | **NOT PROVIDED. No model exists for it.** |

## Formulas

```
productionCostPerQ    = totalProductionCost / quantityQuintals
breakEvenPricePerQ    = productionCostPerQ                (production-only break-even)

estimatedProfitPerQ   = farmerNetPerQ − productionCostPerQ
estimatedProfitTotal  = estimatedProfitPerQ × quantityQuintals
                        (≡ farmerNetTotal − totalProductionCost)
```

Scenario endpoint (`/scenario`) — a hypothetical price must also cover selling costs, so:

```
sellingCostsPerQ      = transportPerQ + storagePerQ + otherPerQ   (same documented rates as the calculator)
scenarioBreakEvenPrice = totalProductionCost / qty + sellingCostsPerQ
scenarioProfitTotal    = (price − sellingCostsPerQ) × qty − totalProductionCost
```

Note the two break-evens are intentionally different: `/economics` reports the
production-only break-even (what the crop must fetch to repay production);
the scenario reports the full break-even including selling costs (the price at
which scenario profit is exactly zero). Both are labeled in their responses.

## Profitability status (no percentages)

`PROFITABLE` / `BREAK_EVEN` / `BELOW_BREAK_EVEN` / `INSUFFICIENT_EVIDENCE`.

Tolerance: ±₹5/q (`BREAK_EVEN_TOLERANCE_PER_Q` in `farmerEconomics.js`) —
mandi prices move in ~₹5 steps, so calling a ₹3/q gain "PROFITABLE" would be
false precision. Negative profit is reported as a negative number; it is never
clamped and never called "savings".

## Observed trend methodology

- Series = distinct observation dates for one `crop|market` from
  `priceHistory.json` (deduped per `crop|market|variety` per arrival date) plus
  the current best quote via `marketCache.getBestPrices` (snapshot-fallback safe).
- Per window (7/14/30d): **first observed price vs latest observed price**.
  No interpolation, no invented intermediate points.
- `observationCount` = distinct dates present. One date →
  `direction: INSUFFICIENT_EVIDENCE` — never "flat".
- `FLAT` only when |percentChange| ≤ 0.5% (`FLAT_TOLERANCE_PCT`) — mandi noise.
- Repeated fetches of the same observation never create new trend points.
- Every trend response carries `forecast: false` and a description that says
  the past is being described.

## Storage threshold (a threshold, not a forecast)

`/storage-threshold` computes the future net price above which storing then
selling outperforms selling now:

```
breakEvenFuturePrice = currentNetPerQ + transportPerQ + storageCostPerQ + otherPerQ
```

Uses the same documented rates as everywhere else. The response explicitly says
Kisan360 does not predict whether the price will reach the threshold. No
post-harvest loss factor is applied (none is authoritatively sourced).

## Provenance classes used

- `FARMER_ENTERED` — production cost categories (a fact about what the farmer
  reported; not independently verified)
- `FACT` — AGMARKNET observed prices
- `DERIVED` — break-even, profit, trends, scenarios, thresholds
- `ASSUMPTION` — transport/storage/other rates (documented, shared with the calculator)
- No derived economic output is ever labeled FACT.

## What the system does NOT do

- No price prediction or forecasting (no ML, no heuristic "expected price").
- No guaranteed future returns or savings.
- No benchmark cost injection — if a farmer enters nothing, there is no number.
- No weather → price coupling.
- Scenario outcomes never feed back into market ranking or decisions as facts.

## API contract reference

All endpoints return the project envelope `{ success: true, ... }` or
`{ success: false, error }`. Error semantics (project-wide):

| Status | Meaning | Example |
|---|---|---|
| `400` | Invalid request (syntax/validation) | negative cost, zero quantity, unknown cost category, malformed JSON |
| `422` | Valid request, insufficient domain evidence | crop with no market data, district with no storage facility |
| `404` | Resource not found | unknown lot/offer/payment id |
| `409` | Business/state conflict | accepting an already-accepted offer |
| `503` | Dependency unavailable | net-realization calculator offline (`ECONNREFUSED`) |

### POST /api/market/economics

Request body:

```json
{
  "crop": "Onion",              // required
  "district": "Nashik",         // required
  "quantity": 10,               // required, > 0, quintals
  "costs": {                    // required, ≥1 category > 0; TOTAL ₹ per category
    "seed": 5000, "fertilizer": 7000, "cropProtection": 4000,
    "labour": 12000, "irrigation": 3000, "machinery": 4000,
    "landRent": 0, "other": 2000
  }
}
```

Success response (key fields):

```json
{
  "success": true,
  "marketSource": "agmarknet_snapshot",       // which dataset produced the numbers
  "servingMode": "LIVE | CACHED | STALE | FALLBACK",
  "marketProvenance": { "source", "retrievedAt", "..." },
  "input": { "totalProductionCost": 37000, "quantityQuintals": 10,
             "costBasis": "TOTAL_LOT", "classification": "FARMER_ENTERED",
             "costBreakdown": { "seed": 5000, "...": 0 } },
  "productionEconomics": {
    "totalProductionCost": 37000,
    "productionCostPerQuintal": 3700,
    "breakEvenPricePerQuintal": 3700,
    "classification": "DERIVED"
  },
  "marketEconomics": {
    "bestNetMarket":    { "market", "farmerNetPerQuintal", "estimatedProfitPerQuintal",
                          "estimatedProfitTotal", "profitabilityStatus" },
    "bestProfitMarket": { "...same shape..." },   // == bestNetMarket (single lot-level cost)
    "rankedByProfit": [ { "market", "grossPricePerQuintal", "farmerNetPerQuintal",
                           "farmerNetTotal", "estimatedProfitPerQuintal",
                           "estimatedProfitTotal", "profitabilityStatus",
                           "classification": "DERIVED" } ]
  },
  "provenance": { "marketPrices", "netRealization", "productionCost", "breakEven", "profit", "forecast": false },
  "semantics": { "netRealizationVsProfit", "negativeProfit" }
}
```

Does NOT claim: profit is verified, prices are live-now, or future prices.

### GET /api/market/trends?crop=Onion&market=Lasalgaon(Niphad)

Both params required (market = exact observed source market name). Response:

```json
{
  "success": true, "crop": "onion", "market": "Lasalgaon(Niphad)",
  "trends": {
    "7d":  { "periodDays": 7, "direction": "UP|DOWN|FLAT|INSUFFICIENT_EVIDENCE",
             "percentChange", "firstObservedPrice", "latestObservedPrice",
             "absoluteChange", "observationCount", "firstObservedOn", "latestObservedOn",
             "minObservedPrice", "maxObservedPrice", "source",
             "method", "classification": "DERIVED", "forecast": false, "description" },
    "14d": { "..." }, "30d": { "..." }
  },
  "source", "servingMode", "forecast": false, "observationNote"
}
```

Unknown market → `200` with every window `INSUFFICIENT_EVIDENCE` (absence of
history is reported honestly, not an error). Missing params → `400`.
Does NOT claim: trend is a forecast. It describes observed history only.

### POST /api/market/scenario

Request body: `{ hypotheticalPricePerQuintal` (required, > 0, ≤ 500000),
`quantity` (> 0), `distanceKm` (≥ 0), `costs{...}` **or** `totalProductionCost`,
optional `scenarioQuantity`, `scenarioTotalProductionCost` `}`.

Response: `scenario{inputs}` + `outcome{scenarioGrossRevenue,
scenarioSellingCosts{transportPerQuintal, storagePerQuintal, otherPerQuintal,
totalPerQuintal, totals}, scenarioNetRealization{perQuintal, total},
scenarioProductionCost, scenarioProfit{total, perQuintal, status},
scenarioBreakEvenPrice, differenceVsBreakEven}` + `semantics{type:
"HYPOTHETICAL", forecast: false, prediction: false, statement}`.

`scenarioBreakEvenPrice` includes selling costs — the price at which scenario
profit is exactly zero. Does NOT claim: any future price, prediction, or forecast.

### GET /api/market/storage-threshold?crop=Onion&district=Nashik&quantity=10

Response: `{ success, marketSource, servingMode, marketProvenance, crop,
district, quantityQuintals, referenceMarket, currentNetPerQuintal,
storageOption{id, name, costPerQuintalPerDay, days, availability, label},
storageCostPerQuintal, breakEvenFuturePriceForStorage, components{...},
semantics{type: "SCENARIO_THRESHOLD", forecast: false, statement}, dataBasis }`.

`422` when the district has no storage option in the demo dataset.
Does NOT claim: the price will reach the threshold, live facility availability
(demo dataset), or any post-harvest loss factor (none is assumed).

## Canonical demo scenarios (demonstration — not hardcoded data)

The UI team should develop and demo against these two scenarios. **The market
values themselves are NOT fixtures** — they always come from the current
market snapshot via the API. Only the input parameters are canonical:

**Scenario A — Nashik / Onion / 10q** (the flagship journey):

```
GET  /api/market/farm-context?crop=Onion&district=Nashik
GET  /api/market/net-realization?crop=Onion&district=Nashik&quantity=10
GET  /api/market/pathways?crop=Onion&district=Nashik&quantity=10
POST /api/market/economics {crop:"Onion", district:"Nashik", quantity:10,
      costs:{seed:5000, fertilizer:7000, cropProtection:4000, labour:12000,
             irrigation:3000, machinery:4000, landRent:0, other:2000}}   // ₹37,000 total
GET  /api/market/trends?crop=Onion&market=<observed market name>
GET  /api/market/storage-threshold?crop=Onion&district=Nashik&quantity=10
GET  /api/buyers?crop=Onion&district=Nashik
```

**Scenario B — Akola / Soybean / 10q** (proves no cross-scenario leakage):
same sequence with `crop=Soybean&district=Akola` and any distinct cost set.
Verify no Nashik/Onion values appear in the response.

Edge scenarios for error handling: `crop=Mango` (422 — no market data),
`quantity=0` (400), `district=Gadchiroli` on storage-threshold (422 — no
demo facility), unknown market on trends (200, INSUFFICIENT_EVIDENCE).

For repeatable lot→offer→payment demos, seed first:
`node scripts/seed-demo.js`. Demo logins: `POST /api/auth/demo-login`
with `{"role":"farmer"}` or `{"role":"buyer"}` (uid is server-derived from
the role; client-supplied uids are rejected by design).

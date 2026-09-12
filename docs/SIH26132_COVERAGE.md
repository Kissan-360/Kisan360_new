# SIH26132 — Judge-Facing Evidence Matrix

**Problem Statement:** *Strengthening market linkages and price discovery for farmers* (Govt. of Maharashtra · Maharashtra State Innovation Society · Software · Agriculture, FoodTech & Rural Development)

Every element of the problem statement, mapped to the exact endpoint that serves it, the screen a judge can click, and the automated test that pins it. Honest labels throughout: **LIVE** (real data/API), **DEMO** (structured simulation, clearly labeled in-product), **TRAINED** (real trained ML weights shipped).

---

## A. Problem-description elements → evidence

| PS phrase | What Kisan360 does | Backend endpoint | Screen | Test / proof |
|---|---|---|---|---|
| "limited visibility of current … prices" | Live AGMARKNET mandi prices, 21+ Maharashtra mandis, live/cached provenance always shown | `GET /api/market/prices` | Market Intelligence (`/market`), Dashboard pulse | `marketIntelligence.test.js`, `priceSnapshot.test.js` |
| "… and **expected** prices" | Observed multi-window trends + sale-window classification (FAVORABLE/NEUTRAL/WEAK) — explicitly descriptive, never predictive | `GET /api/market/trend?window=7\|14\|30` | Market cards trend bars, Pathway page | `priceHistory.test.js` |
| "nearby markets, **processors**, **institutional buyers** and **digital trading channels**" | Buyer directory spans 6 categories incl. Processor & Institutional buyer; digital channels directory (eNAM, APMC e-auctions, FPO programs) | `GET /api/buyers`, `GET /api/trading-channels?crop=` | Trade page buyer cards + flash card; MarketPlace "Sell Beyond the Local Mandi" | `tradingChannels.test.js` (8), buyer directory data contract |
| "quality specifications" | Structured lot quality fields + buyer requirement matching with MATCH / PARTIAL / NO_MATCH reasons | `GET /api/buyers/requirements`, `POST /api/lots` | Trade page ("Matched because ✓") | `buyersRequirements.test.js`, `demandSignal.test.js` |
| "demand" | Time-bounded buyer demand signals with freshness (ACTIVE/EXPIRING/EXPIRED/PAUSED) and per-lot coverage scoring | `GET /api/buyers/demand`, `GET /api/buyers/demand/coverage` | Decision Workspace demand panel | `demandSignal.test.js` (30+ cases) |
| "logistics" | Provider directory + full 7-state logistics lifecycle + cost comparison | `GET /api/logistics/options`, `POST /api/logistics/requests` … | Trade/logistics workflow | `logisticsCoordination.test.js` |
| "storage" | Storage options with economic breakeven ("what future price makes storage worthwhile?") | `GET /api/transaction-cost`, storage threshold | Net Realization what-if | `transactionCost.test.js`, `stateMachine.test.js` |
| "payment reliability and buyer credentials" | 4-tier trust vocabulary (REAL_VERIFIED → SELF_DECLARED), payment-terms labels, simulated escrow with history | `GET /api/buyers/:id`, payments lifecycle | Buyer flash card, payment timeline | `stateMachine.test.js` |
| "sell immediately … because of liquidity or storage constraints" | Pathway decision engine: SELL_NOW vs STORE_AND_SELL vs FPO_POOL, with feasibility trace and farmer-controlled decision | `computePathways` service (`POST /api/decision` flow) | Pathway page | `pathwayDecision.test.js` |
| "weak bargaining power" | Net-realization ranking across mandis + offer benchmark (ABOVE/NEAR/BELOW reference) so the farmer negotiates from data | `GET /api/market/net-realization` | Offer composer benchmark card | `farmerEconomics.test.js` |
| "buyers … struggle to aggregate consistent volumes and verify quality" | FPO pooling: many farmers → one bulk lot → single offer; graded lots | `POST /api/fpo/pool`, `POST /api/fpo/create-pooled-lot`, `POST /api/fpo/pooled-offer` | FPO Pooling (`/fpo`) | `fpoPool.test.js` |
| "arrival volumes" | Observation counts from the AGMARKNET snapshot, honestly labeled (source omits tonnage for Maharashtra) | market cache / arrival intel service | Dashboard + market context | `arrivalQuantity.test.js` |

## B. Expected-solution elements → evidence

| PS requirement | Status | Backend | Screen | Test |
|---|---|---|---|---|
| Aggregates mandi prices | **LIVE** | `GET /api/market/prices` (+ `/refresh`, `/cache-status`, `/ingestion-health`) | `/market`, Dashboard | marketIntelligence, priceSnapshot |
| Buyer demand | **DEMO** | `GET /api/buyers/demand`, `/demand/coverage` | Decision Workspace | demandSignal |
| Quality requirements | **DEMO** | `GET /api/buyers/requirements` | Trade matching | buyersRequirements |
| Arrival volumes | **DEMO** | arrival intel over live snapshot | Dashboard | arrivalQuantity |
| Transport options | **DEMO** | `GET /api/logistics/options` + provider directory | Logistics workflow | logisticsCoordination |
| Storage options | **FULL** | transaction-cost + storage threshold | Net Realization | transactionCost |
| Localised price trends | **LIVE** | `GET /api/market/trend` | Market cards | priceHistory |
| Sale-window recommendations | **FULL** | observedTrend classification | Pathway page | priceHistory / pathwayDecision |
| Matches farmers/FPOs with verified buyers | **DEMO** | `GET /api/buyers?crop=`, explainable match reasons | Trade page | buyer directory contract |
| Lot creation | **FULL** | `POST/GET/PUT /api/lots`, withdraw | Trade page | stateMachine |
| Quality grading | **TRAINED** | `POST /api/grade-assessment` — AGMARK rule engine (7 crops × 3 grades, DMI thresholds) + **trained MobileNetV2 freshness model shipped in-app** (18-class, 99.0% fine / 99.2% fresh-rotten on official 6,738-image test split) | Grade My Crop (`/grade-crop`) | grade engine + certificate lifecycle tests |
| Digital offers | **FULL** | `POST /api/offers`, accept/reject/withdraw | Trade page | stateMachine |
| Logistics coordination | **DEMO** | 7-state request lifecycle (quote→accept→schedule→transit…) | Logistics workflow | logisticsCoordination |
| Payment tracking | **DEMO** | `GET /api/payments`, HELD→RELEASED escrow, full history; single-device demo ladder (`simulate/accept-latest`, `simulate-release`, `simulate-failure`) | Payment timeline + receipt | stateMachine |
| Dispute / grievance | **FULL** | `POST /api/grievances`, `/:id/transition` (OPEN → UNDER_REVIEW → RESOLVED/REJECTED), role-scoped queue | Trade support section | grievanceState |
| Improved price realisation | **FULL** | `GET /api/market/net-realization` (deterministic, farmer-borne costs only) | Net Realization (`/net-realization`) | farmerEconomics |
| Reduced information asymmetry | **DEMO** | information-coverage metric + provenance/freshness on every figure | Transaction-cost view | transactionCost |
| Lower transaction cost | **DEMO** | `GET /api/transaction-cost` deterministic model + decision receipt | Transaction-cost view | transactionCost |
| Stronger FPO aggregation | **FULL** | pool / pooled-lot / pooled-offer | `/fpo` | fpoPool |
| Reduced post-harvest loss | **FULL** | crop-aware perishability (shelf-life ranges, storage-risk classification, scenario loss) | Storage guidance | cropPerishability |
| More reliable buyer sourcing | **DEMO** | demand compatibility + coverage scoring | Decision Workspace | demandSignal |
| Transparent transaction records | **DEMO** | per-entity history arrays + Decision Receipt ("you told us / we recommended / deal / vs recommendation") | Trade page receipt | stateMachine |
| Digital trading channels (eNAM) | **DEMO** | `GET /api/trading-channels` (DEMO_CHANNEL labeled) | MarketPlace channels section | tradingChannels (8) |

## C. The selling journey a judge can walk (≤2 clicks per step)

1. **INFORM** — Dashboard: live AGMARKNET pulse, contextual calculator.
2. **COMPARE** — Net Realization: ranked mandis by net-in-pocket, Why? drawer with itemized costs; deterministic, no AI-invented numbers.
3. **DECIDE** — Pathway: sell now vs store vs pool, with feasibility + demand evidence; or Decision Workspace analysis.
4. **CONNECT** — Trade: buyer cards (one click = select, or flash card with trust tier, verification, terms), "Matched because ✓" reasons, offer prefilled from the calculator's reference.
5. **EXECUTE/SELL** — Offer → Simulate acceptance (escrow HELD) → Simulate release (**cash**, receipt + benchmark outcome) — **or** Simulate failure → raise grievance → authority resolves (OPEN → UNDER_REVIEW → RESOLVED).

Both payment outcomes are demoable from a single device, and a backend restart self-heals the canonical scenario via auto-seed.

## D. Honesty contract (what we say out loud)

- Simulated pieces are labeled in-product: `mocked: true`, "SIMULATED — NO REAL MONEY MOVES", "Trust badges are simulated", DEMO_CHANNEL/DEMO_DEMAND classifications.
- The AI explains results (`/api/market/net-realization/explain`); it never invents figures.
- Freshness/provenance (live vs cached + age) accompanies every price.
- The ML grader states its domain: produce freshness; grains grade via AGMARK questionnaire rules; fallback is labeled "Rule-based grading" vs "AI-Verified".

## E. Suite status

- **Backend: 546/546 tests, 22/22 suites** (jest) — includes the 8 trading-channel contract tests.
- **Frontend:** `npm run build` clean (TypeScript + Vite).
- **ML model:** trained locally (TF 2.20 CPU), exported to TF.js, browser-verified (`loadGraphModel` → `[1,18]` softmax); reproducible via `backend/scripts/train_freshness.py`.

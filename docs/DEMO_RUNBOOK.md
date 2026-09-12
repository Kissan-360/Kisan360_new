# KISAN360 — DEMO RUNBOOK

> **Sequence authority:** this runbook and `DEMO_WAR_ROOM.md` describe the SAME run of show
> (hero → calculator → quantity flip → trade → payment → receipt, FPO in the extended cut).
> WAR_ROOM is the presenter script with fill-in-the-blank numbers; this file is the
> screen-level action table. On any conflict, WAR_ROOM §3/§4 wins.

## CANONICAL SCENARIO

| Field | Value |
|-------|-------|
| Crop | Onion |
| Location | Nagpur |
| Quantity | 10 quintals |
| Grade | Unassessed → or run **Grade My Crop** (`/grade-crop`) first for an AGMARK certificate that pre-fills quality fields |

**NOTE:** Market prices are live/cached AGMARKNET data. The best mandi and exact net values WILL change. Use the current displayed values — do not hardcode prices.

**Why Nagpur (re-verified live 2026-09-12):** the Onion·Nashik cache has converged (+₹0 inversion — no demo story). Nagpur still demonstrates both WOWs: headline-chasing Mangal Wedha (₹5,510/q) nets ₹47,209 vs Kisan360's pick APMC Nagpur (₹5,250/q) at **₹51,530 → +₹4,321**, and the 50 q flip moves the recommendation to Mangal Wedha via the full-truck threshold. If a future refresh converges Nagpur too, sweep Satara/Sangli/Kolhapur/Amravati and pick the widest gap. Presenter one-click reset + canonical jump: Dashboard with `?demo=1` → Presenter controls.

## STARTUP PROCEDURE

### Option A: One-Command Stack (Recommended)

```bash
bash scripts/dev-up.sh          # all services
bash scripts/dev-up.sh --core   # backend + calculator + web only
```

### Option B: Manual (3 terminals)

```bash
# Terminal 1 — Calculator (required)
cd ml-service && pip install -r requirements.txt && python -m uvicorn net_realization:app --port 8002

# Terminal 2 — Backend (required)
cd backend && npm install && DEMO_JWT_SECRET=kisan360-demo-secret npm start

# Terminal 3 — Frontend (required)
cd web-app && npm install && npm run dev
```

### Verify Health

```bash
curl http://localhost:5000/health    # Backend: should return status "OK" or "DEGRADED"
curl http://localhost:8002/health    # Calculator: should return {"status":"ok"}
curl http://localhost:3000/          # Frontend: should return HTML
```

### Reset Demo State

```bash
# Option 1: Run the reset script
bash scripts/demo-reset.sh

# Option 2: Re-seed via API
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"role":"farmer","name":"Demo","district":"Nashik"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -X POST http://localhost:5000/api/auth/demo/seed \
  -H "Authorization: Bearer $TOKEN"
```

## DEMO ACCOUNTS

| Role | UID | Name | District | How to Login |
|------|-----|------|----------|-------------|
| Farmer | `demo-farmer` | Any name | Any district | UI: Select "Farmer" → Sign In |
| Buyer | `demo-buyer` | Any name | Any district | UI: Select "Buyer" → Sign In |
| FPO | `demo-fpo` | Any name | Any district | UI: Select "FPO" → Sign In |

**Role behavior:**
- Farmer: create lots, send offers, raise grievances
- Buyer: accept/reject offers, release payments
- FPO: pool lots, manage members

## 3-MINUTE DEMO (COMPRESSED)

| Time | Screen | Action | Expected Result | What to Say |
|------|--------|--------|-----------------|-------------|
| 0:00 | Dashboard | Show hero | Crop/district/quantity inputs | "A farmer has produce in Nashik. Where should they sell?" |
| 0:10 | Dashboard | Click "Compare Markets" | Redirects to Net Realization | |
| 0:15 | Net Realization | Show ranked mandis | Mandis ranked by net realization | "Kisan360 ranks mandis by what the farmer actually keeps — after transport, storage, and fees." |
| 0:30 | Net Realization | Show inversion | Highest headline ≠ highest net | "The mandi with the highest price is NOT the best choice. Farmer-borne costs differ." |
| 0:45 | Net Realization | Click "Why?" | Evidence drawer opens | "Every number has a source: transport, storage, loading. The farmer can verify." |
| 1:00 | Net Realization | Show WHAT IF | Change quantity → recommendation changes | "Change the quantity and the recommendation changes. Bulk rates apply at 40q." |
| 1:15 | Net Realization | Show pathways | SELL NOW / STORE / AGGREGATE / ALTERNATE | "Four pathways. Each shows evidence and assumptions." |
| 1:30 | Pathway | Show recommendation | Rule-based recommendation | "The system recommends based on transport savings and buyer availability." |
| 1:45 | Trade | Click "Trade" | Lot creation + buyer matching | "The farmer creates a lot and sees compatible buyers." |
| 2:00 | Trade | Create lot | Lot created | "The lot captures crop, quantity, and quality information." |
| 2:15 | Trade | Show buyer match | Buyers matched by crop/district/quantity | "Buyers are matched by their stated requirements." |
| 2:30 | Trade | Send offer | Offer sent to buyer | "The farmer sends an offer." |
| 2:45 | Trade | Buyer accepts | Login as buyer → accept | "The buyer accepts. Payment moves to HELD." |
| 3:00 | Trade | Show payment | Payment timeline | "Simulated escrow. Every step is recorded." |

## 5-MINUTE DEMO (FULL)

Add to 3-minute demo:

| Time | Screen | Action | Expected Result | What to Say |
|------|--------|--------|-----------------|-------------|
| 3:00 | Trade | Buyer releases | Payment RELEASED | "After delivery, the buyer releases payment." |
| 3:15 | Trade | Show receipt | Decision receipt | "Complete record: what the farmer entered, what Kisan360 recommended, what happened." |
| 3:30 | Trade | Show history | Transaction history | "Every transaction is recorded." |
| 3:45 | FPO | Click "FPO Bulk Selling" | Pooling comparison | "What if the farmer pools with FPO members?" |
| 4:00 | FPO | Show individual vs pooled | Transport savings | "Pooling to 50q+ unlocks bulk transport: ₹0.75/q/km vs ₹1.5/q/km." |
| 4:15 | FPO | Show member roster | 5 members, 50q total | "Five members, same crop, one shipment." |
| 4:30 | Market | Click "Market Prices" | Mandi browser with freshness | "Live AGMARKNET prices with provenance labels." |
| 4:45 | Market | Show freshness badge | "Live" or "Cached" with timestamp | "The farmer knows exactly where data came from." |

## 7-MINUTE DEMO (COMPREHENSIVE)

Add to 5-minute demo:

| Time | Screen | Action | Expected Result | What to Say |
|------|--------|--------|-----------------|-------------|
| 5:00 | Net Realization | Show economics | Production cost → break-even → profit | "The farmer enters their costs. Kisan360 shows break-even and profit per mandi." |
| 5:15 | Net Realization | Show trend | Observed price trend | "Observed prices over 7/14/30 days. No forecasting — just what happened." |
| 5:30 | Net Realization | Show scenario | What-if simulator | "What if prices change? The farmer can test scenarios." |
| 5:45 | Pathway | Show storage breakeven | Store vs sell now | "Storage costs ₹X/q. The sale price needs to exceed ₹Y/q to beat selling now." |
| 6:00 | Pathway | Show sale window | FAVORABLE/NEUTRAL/WEAK | "Where does the current price sit in recent history?" |
| 6:15 | Pathway | Show buyer requirements | Quality matching | "Buyers have quality requirements. The lot is matched against them." |
| 6:30 | Disease | Click "Disease Detection" | Upload leaf photo | "Upload a leaf photo. The ML model identifies diseases." |
| 6:45 | Weather | Click "Weather" | 5-day forecast + ag alerts | "Weather integration helps with timing decisions." |
| 7:00 | Dashboard | Return to dashboard | Complete product view | "From intelligence to execution — one coherent product." |

## BACKUP PLANS

### AGMARKNET Unavailable
- **Symptom:** Market prices show "Cached" instead of "Live"
- **Action:** Continue — cached data is real data, labeled honestly
- **Say:** "We're using verified cached AGMARKNET data. The math works identically."

### MongoDB Unavailable
- **Symptom:** "Database unavailable" on lot/offer creation
- **Action:** Market comparison, net-realization, trends ALL still work (stateless)
- **Say:** "Market intelligence doesn't require the database. Lot creation needs a restart."

### Python Calculator Down
- **Symptom:** "Net-realization service unavailable"
- **Action:** Restart: `cd ml-service && python -m uvicorn net_realization:app --port 8002`
- **Say:** "The calculator is restarting — it takes 2 seconds."

### Weather API Down
- **Symptom:** Weather page fails, Farm Context weather field empty
- **Action:** Farm Context still shows soil/season/market data
- **Say:** "Weather is an optional integration. Core journey unaffected."

### RAG/LLM Down
- **Symptom:** AI explanations unavailable
- **Action:** Template explanations used automatically
- **Say:** "We use deterministic template explanations — same accuracy, no LLM dependency."

## EXPECTED vs VARIABLE RESULTS

### EXPECTED (deterministic)
- Workflow: login → compare → decide → lot → offer → accept → payment
- Role enforcement: farmer cannot accept offers, buyer cannot create lots
- State machine: PENDING → HELD → RELEASED (no skipping)
- Cost formula: net = headline - transport - storage - other
- Bulk threshold: 40 quintals triggers ₹0.75/q/km rate
- Quality matching: grade/moisture/damage checks against buyer requirements

### VARIABLE (data-dependent)
- Best mandi name and rank
- Exact net realization values
- Number of ranked mandis
- Market prices (live vs cached)
- Trend direction (UP/DOWN/FLAT)
- Sale window signal (FAVORABLE/NEUTRAL/WEAK)
- Buyer coverage count
- Pathway recommendation

**Rule: Never promise specific prices. Use "current AGMARKNET observation" language.**

## KEY MESSAGES

1. "Highest price ≠ highest realization"
2. "Every number has a source and assumption"
3. "The farmer decides, not the algorithm"
4. "From decision to execution in one product"
5. "Honest about what's simulated, honest about what's real"

## JUDGE Q&A PREP

1. "Where did this price come from?" → AGMARKNET, shown in provenance
2. "Why isn't the highest price first?" → Farmer-borne costs reduce net
3. "Is this a prediction?" → No, observed history only
4. "Are the buyers real?" → Demo directory, labeled as such
5. "How does this scale?" → Architecture supports it; deployment pending
6. "What if AGMARKNET is down?" → Cached snapshot, labeled honestly
7. "Is the payment real?" → Simulated escrow, clearly labeled
8. "How do you handle disputes?" → Grievance workflow with state machine

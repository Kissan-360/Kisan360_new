# KISAN360 — DEMO RUNBOOK

## CANONICAL SCENARIO

| Field | Value |
|-------|-------|
| Crop | Onion |
| Location | Nashik |
| Quantity | 10 quintals |
| Grade | Unassessed |
| Expected best mandi | APMC Nagpur |
| Expected net | ₹4,313/q |
| Expected lot total | ₹43,130 |
| Inversion story | Headline price ₹5,250/q vs net ₹4,313/q |

## DEMO STARTING POINT

**URL:** `http://localhost:3100/login`

**Action:** Click "Farmer" role → "Sign In"

**Expected:** Redirects to Dashboard

## 3-MINUTE DEMO (COMPRESSED)

| Time | Screen | Action | Expected Result | What to Say |
|------|--------|--------|-----------------|-------------|
| 0:00 | Dashboard | Show hero | "Where should I sell?" with Onion/Nashik/10q pre-filled | "A farmer has 10 quintals of Onion in Nashik. Where should they sell?" |
| 0:10 | Dashboard | Click "Where should I sell?" | Redirects to Net Realization | |
| 0:15 | Net Realization | Show market comparison | Ranked mandis by net realization | "Kisan360 ranks mandis by what the farmer actually keeps, not just the headline price." |
| 0:30 | Net Realization | Show inversion | APMC Nagpur has highest headline but NOT highest net | "The mandi with the highest price is not the best choice. Why? Because farmer-borne costs differ." |
| 0:45 | Net Realization | Click "Why?" | Evidence drawer opens | "Every number has a source: transport cost, storage, loading. The farmer can verify each assumption." |
| 1:00 | Net Realization | Show WHAT IF | Change to 50q → recommendation flips | "Change the quantity to 50 quintals and the recommendation changes. Bulk transport rates apply." |
| 1:15 | Net Realization | Click "Selling Options" | Redirects to Pathway page | "Now let's compare the actual selling pathways for this lot." |
| 1:30 | Pathway | Show 4 pathways | SELL NOW, STORE, AGGREGATE, ALTERNATE | "Four options: sell now, store, aggregate through FPO, or consider an alternative market." |
| 1:45 | Pathway | Show recommendation | "Aggregate Through FPO" recommended | "For 10 quintals, pooling with FPO members saves ₹457/q on transport." |
| 2:00 | Pathway | Show evidence | Transport cost, buyer coverage, sale window | "Each pathway shows the evidence and assumptions. The farmer decides." |
| 2:15 | Trade | Click "Trade" | Shows lots and buyers | "Now the farmer can create a lot and find compatible buyers." |
| 2:30 | Trade | Create lot | Lot created for 10q Onion | "The lot is created with the farmer's quality information." |
| 2:45 | Trade | Show buyer matching | Buyers matched by crop, district, quantity | "Buyers are matched by their requirements. The farmer sees compatibility." |
| 3:00 | Trade | Send offer | Offer sent to buyer | "The farmer sends an offer. The buyer can accept or reject." |

## 5-MINUTE DEMO (FULL)

Add to 3-minute demo:

| Time | Screen | Action | Expected Result | What to Say |
|------|--------|--------|-----------------|-------------|
| 3:00 | Trade | Buyer accepts | Payment moves to HELD | "The buyer accepts. Payment is held in simulated escrow." |
| 3:15 | Trade | Buyer releases | Payment moves to RELEASED | "After delivery, the buyer releases the payment." |
| 3:30 | Trade | Show receipt | Decision receipt with all numbers | "Here's the complete record: what the farmer entered, what Kisan360 recommended, what the buyer offered, what happened." |
| 3:45 | Trade | Show history | Transaction history | "Every transaction is recorded. The farmer can review their selling history." |
| 4:00 | FPO | Click "FPO Bulk Selling" | Shows pooling comparison | "What if the farmer doesn't sell alone? Pooling with FPO members changes the economics." |
| 4:15 | FPO | Show individual vs pooled | Transport savings, buyer coverage | "Individual: ₹4,313/q. Pooled: ₹4,771/q. That's ₹458/q saved on transport." |
| 4:30 | FPO | Show FPO members | Mock member data | "Five members with 50 quintals total. The pooled lot qualifies for bulk transport." |
| 4:45 | Dashboard | Return to dashboard | Shows complete journey | "From decision to transaction to pooling — one coherent product." |

## 7-MINUTE DEMO (COMPREHENSIVE)

Add to 5-minute demo:

| Time | Screen | Action | Expected Result | What to Say |
|------|--------|--------|-----------------|-------------|
| 5:00 | Market | Click "Market Prices" | Shows all mandis with freshness | "Let's look at the market data. Live AGMARKNET prices with provenance." |
| 5:15 | Market | Show freshness badge | "Live" or "Cached" with timestamp | "The farmer knows exactly where the data came from and how fresh it is." |
| 5:30 | Net Realization | Show evidence drawer | Transport, storage, loading assumptions | "Every assumption is documented. The farmer can verify the math." |
| 5:45 | Net Realization | Show WHAT IF with 50q | Recommendation flips | "Change the quantity and the recommendation changes. The engine recomputes live." |
| 6:00 | Pathway | Show storage option | Store Then Sell pathway | "Storage is an option. The breakeven calculation shows what price would need to exceed." |
| 6:15 | Pathway | Show sale window | FAVORABLE/NEUTRAL/WEAK signal | "The sale window shows where the current price sits in recent history." |
| 6:30 | Pathway | Show buyer requirements | Compatible requirements | "Buyers have specific requirements. The farmer sees which ones match." |
| 6:45 | Grievance | Show grievance option | Grievance form | "If something goes wrong, the farmer can raise a grievance." |
| 7:00 | Dashboard | Return to dashboard | Shows complete product | "Kisan360: from market intelligence to executable selling workflow." |

## BACKUP: AGMARKNET UNAVAILABLE

**Symptom:** Market prices show "Cached" instead of "Live"

**Action:** Continue demo — cached data is deterministic and shows the same story

**What to say:** "We fall back to a verified cached snapshot. The math works the same way."

## BACKUP: MONGODB UNAVAILABLE

**Symptom:** "Database unavailable" error on lot/offer creation

**Action:** Use the seed endpoint: `POST /api/auth/demo/seed`

**Command:**
```bash
curl -X POST http://localhost:5050/api/auth/demo/seed \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

**What to say:** "Let me reseed the demo state."

## BACKUP: ML SERVICE UNAVAILABLE

**Symptom:** "Net-realization service unavailable" error

**Action:** The cached snapshot still works for market prices. Pathway page may show limited data.

**What to say:** "The calculator service is restarting. Let me show you the market comparison instead."

## BACKUP: TRANSACTION STEP FAILS

**Symptom:** Offer creation or acceptance fails

**Action:** Use the seed endpoint to reset state, then retry

**What to say:** "Let me reset the demo state and try again."

## TIMING NOTES

- **3-minute demo:** Focus on the inversion story and pathway comparison
- **5-minute demo:** Add transaction flow and FPO aggregation
- **7-minute demo:** Add market data deep-dive and evidence transparency

## KEY MESSAGES TO COMMUNICATE

1. "Highest price ≠ highest realization"
2. "Every number has a source and assumption"
3. "The farmer decides, not the algorithm"
4. "From decision to execution in one product"
5. "Honest about what's simulated, honest about what's real"

## COMMON JUDGE QUESTIONS TO PREPARE FOR

1. "Where did this price come from?" → AGMARKNET, shown in provenance
2. "Why isn't the highest price first?" → Farmer-borne costs reduce net
3. "Is this a prediction?" → No, observed history only
4. "Are the buyers real?" → Demo directory, labeled as such
5. "How does this scale?" → Architecture supports it; deployment pending

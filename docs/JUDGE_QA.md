# KISAN360 — JUDGE Q&A REFERENCE

## 1. Problem Definition

**Q: What problem does Kisan360 solve?**

**A:** Farmers see the mandi price headline but don't know what they'll actually realize after farmer-borne costs (transport, loading, grading). Two mandis with different headline prices can produce different net outcomes — and the highest headline price isn't always the best for the farmer.

**Evidence:** The net-realization engine calculates per-mandi farmer net, and the dashboard shows the inversion: Market X has higher headline price but Market Y yields more to the farmer.

---

## 2. Why Not Just Use eNAM?

**Q: eNAM already shows mandi prices. Why do you need this?**

**A:** eNAM shows prices. Kisan360 shows the *economic decision*. The difference:
- eNAM: "Market X price is ₹2,800/q"
- Kisan360: "For your 10q lot from Nashik, Market Y gives you ₹1,975 more after transport and costs, has 3 compatible buyers, and here's how to execute."

eNAM is a price-discovery platform. Kisan360 is a decision-and-execution platform.

**Limitation:** We don't integrate with eNAM APIs — we use AGMARKNET as our market data source.

---

## 3. What Is Price Discovery Here?

**Q: How is your price discovery different from just reading mandi prices?**

**A:** Price discovery in Kisan360 means:
1. Collecting observed prices from AGMARKNET (source: agmarknet.gov.in)
2. Normalizing across markets (same crop, different mandis)
3. Computing farmer net after applicable costs
4. Ranking by *realized outcome*, not headline price

The "discovery" is the economic evaluation, not the raw price lookup.

---

## 4. How Is Farmer Net Calculated?

**Q: Walk me through the farmer net calculation.**

**A:** For each market:
```
Farmer Net/q = Market Price/q
             - Transport Cost/q (distance × documented rate)
             - Loading/Unloading (if applicable)
             - Market Fees (where farmer-borne)
```

Then:
```
Lot Net = Farmer Net/q × Quantity
```

The system compares lot nets across markets and recommends the one with highest estimated realization.

**Evidence:** `/api/market/assumptions` returns the exact formula and rates used.

---

## 5. Which Costs Belong to the Farmer?

**Q: How do you know which costs the farmer pays?**

**A:** The system uses documented transport rates (₹/q/km) based on published agricultural logistics data. These are *assumptions* clearly labeled in the evidence drawer.

What's included:
- Transport (distance × rate)
- Loading/unloading (where applicable)

What's NOT included (market-side, not farmer-borne):
- Commission agent fees
- Market cess

**Limitation:** Actual farmer-borne costs vary by individual circumstance. The system uses documented averages.

---

## 6. How Is Data Sourced?

**Q: Where does your market data come from?**

**A:** Primary source: AGMARKNET (agmarknet.gov.in) — India's official agricultural market information system.

Every data point carries provenance:
- Source: "AGMARKNET"
- Retrieval timestamp
- Observation/quote date
- Freshness classification (LIVE/CACHED/FALLBACK)

**Limitation:** AGMARKNET data quality varies by market and day. Some markets report regularly, others don't.

---

## 7. How Do You Know the Data Is Fresh?

**Q: How current is this information?**

**A:** Each observation carries:
- Quote date: When the price was observed at the mandi
- Retrieved: When Kisan360 fetched it
- Freshness badge: LIVE (today), CACHED (recent), FALLBACK (last-known-good)

The freshness badge on every screen tells the user exactly how current the data is.

---

## 8. What Is Actually Live?

**Q: What parts of this system use real-time data?**

**A:**
- **Market prices:** AGMARKNET live feed (when available) or cached snapshot
- **Calculations:** Deterministic, server-side, real-time
- **Buyer directory:** Static demo data (labeled "DEMO")
- **Storage options:** Static demo data (labeled "DEMO")
- **Payments:** Simulated (labeled "SIMULATED")

The market data is the only truly live external input.

---

## 9. What Is Demo/Static?

**Q: What parts are simulated for the demo?**

**A:**
- Buyer directory: Demo buyers with requirements (not real demand)
- Storage facilities: Demo options with costs (not real availability)
- FPO members: Demo membership (not real accounts)
- Payment processing: Simulated flow (no real money)
- Trust badges: Demo labels (not real verification)

Every demo/static element is explicitly labeled in the UI.

---

## 10. How Do You Verify Buyers?

**Q: Are these buyers real?**

**A:** The current buyer directory is demo data for SIH demonstration. In production, buyer verification would require:
- Business registration validation
- Trade license verification
- Payment history tracking
- Reference checks

The trust-tier system (REAL_VERIFIED → DEMO_VERIFIED → SELF_DECLARED) is designed for this — but currently only demo data exists.

**Limitation:** Buyer directory is not real-world demand.

---

## 11. Where Does Buyer Demand Come From?

**Q: How do you know buyers want this crop?**

**A:** The system distinguishes:
- **Buyer requirements:** What buyers say they want (demo data)
- **Expressed interest:** Actual offers made (transactional)
- **Accepted offers:** Committed transactions

Currently, "buyer requirements" are demo static data labeled as such. Real demand would come from buyer-side platform usage.

---

## 12. How Does FPO Aggregation Help?

**Q: What does the FPO feature actually do?**

**A:** FPO aggregation changes the economics:
- **Individual:** 10q → smaller transport cost per q, limited buyer coverage
- **Pooled:** 50q → bulk transport threshold kicks in, different buyer minimums become achievable

The system calculates:
- Pooled quantity
- Transport uplift (bulk rate)
- Buyer coverage change
- Net economic difference

**Evidence:** The pathway comparison shows SELL NOW vs AGGREGATE with concrete numbers.

---

## 13. How Is Quality Handled?

**Q: How do you handle crop quality?**

**A:** Farmer enters quality fields (grade, size, moisture, damage). The system matches these against buyer quality requirements.

Result: MATCH / PARTIAL MATCH / NO MATCH / UNKNOWN

**Limitation:** Quality is farmer-entered, not AI-verified. No computer vision grading.

---

## 14. How Is Transport Handled?

**Q: Do you actually book transport?**

**A:** No. The system *estimates* transport cost using:
- Distance (market-to-farmer, calculated)
- Documented rate (₹/q/km)
- Quantity threshold (bulk discount)

This is LOGISTICS PLANNING / ESTIMATION, not transport booking.

**Limitation:** No real transporter integration.

---

## 15. How Does Storage Influence the Decision?

**Q: What role does storage play?**

**A:** The pathway comparison shows:
- **SELL NOW:** Estimated net with current market
- **STORE:** Storage cost + breakeven required price

The calculation: "After ₹X storage cost, the future sale price would need to exceed ₹Y/q to outperform selling now."

**Limitation:** Storage options are demo data. No real availability.

---

## 16. Are You Forecasting Prices?

**Q: Do you predict future prices?**

**A:** No. The sale-window intelligence uses *observed history*:
- 7/14/30-day modal prices
- Current price vs recent observations
- Evidence depth

Classification: FAVORABLE_NOW / NEUTRAL / WEAK / INSUFFICIENT_EVIDENCE

This is evidence-based timing guidance, not price forecasting.

**Limitation:** No predictive ML. No future price claims.

---

## 17. How Does This Reduce Post-Harvest Loss?

**Q: What's your post-harvest loss mechanism?**

**A:** The product demonstrates the *mechanism*:
- "Sell now may avoid additional storage exposure"
- "Aggregation may reduce repeated small-load transport"

We don't claim measured loss reduction percentages. The architecture supports tracking this in production with real data.

---

## 18. How Does This Improve Bargaining Power?

**Q: How does this help farmers negotiate?**

**A:** Evidence + options = bargaining power:
- Farmer knows the market comparison (not just one price)
- Farmer knows the estimated net (not just headline)
- Farmer has buyer alternatives (not just one buyer)
- Farmer has pathway options (sell now vs store vs aggregate)

This is information asymmetry reduction, not price fixing.

---

## 19. What Is Measurable Impact?

**Q: Can you prove farmers earn more?**

**A:** We show *estimated decision difference*, not realized savings:
- "On this 10q scenario, the naive headline-price decision would leave approximately ₹1,975 less"
- This is an estimated advantage based on current data and assumptions

**Limitation:** No controlled trial. No measured income increase. The number is the engine's calculation, not a proven outcome.

---

## 20. How Would This Scale After the Hackathon?

**Q: What would it take to deploy this for real?**

**A:**
- **Market data:** Production AGMARKNET API access (currently demo/cached)
- **Buyers:** Real buyer onboarding + verification pipeline
- **Storage:** Real facility partnerships + availability API
- **Transport:** Real transporter integration + booking
- **Payments:** Real payment gateway (Razorpay/UPI)
- **Quality:** Optional AI grading (computer vision)
- **Deployment:** Cloud hosting (AWS/GCP) + CDN

The architecture is designed for this — the demo uses static data where production would use real integrations.

---

## 21. What Would Be Required for Production?

**Q: What's the production checklist?**

**A:**
1. Production AGMARKNET API key + monitoring
2. MongoDB Atlas (already configured)
3. Real buyer directory with verification
4. Payment gateway integration
5. Transporter API or manual coordination
6. Storage facility partnerships
7. User authentication (Firebase already optional)
8. Deployment infrastructure (cloud hosting)
9. Monitoring + alerting
10. Regulatory compliance (if handling real payments)

---

## 22. What Happens When an External API Fails?

**Q: What if AGMARKNET goes down?**

**A:** Graceful degradation:
- **AGMARKNET fails:** Falls back to cached snapshot (last-known-good)
- **MongoDB fails:** Health endpoint shows status, requests get 503
- **ML service fails:** Deterministic fallback explanation
- **RAG service fails:** Deterministic explanation used

The core journey (market comparison → net realization) works with cached data.

---

## 23. What Happens When AI Fails?

**Q: What if the AI/LLM is unavailable?**

**A:** The core calculation is *deterministic*, not AI:
- Market comparison: Deterministic
- Net realization: Deterministic
- Pathway comparison: Deterministic
- Buyer matching: Rule-based

AI (Groq) is used only for *explanation generation*. When unavailable, a deterministic explanation is used.

**Key point:** AI does not calculate economics. AI explains results.

---

## 24. Why Use AI at All If the Core Calculation Is Deterministic?

**Q: What's the AI actually doing?**

**A:** AI (Groq) generates human-readable explanations:
- "Why this market?" → plain-english explanation
- "What changed?" → scenario explanation

This is EXPLAINABILITY, not DECISION-MAKING.

The architecture:
- External source → Facts
- Deterministic engine → Calculations
- Rules → Recommendations
- LLM → Explanations
- Human → Final decision

---

## 25. What Prevents Manipulation of Offers/Transactions?

**Q: Can someone game the system?**

**A:** Server-side controls:
- Offer amount: Server-computed from lot × price (not client-provided)
- Payment amount: Copied from Offer (not client-provided)
- Transaction state: State machine prevents illegal transitions
- Duplicate prevention: Unique index on Payment.offerId
- Ownership: Farmer can only see/modify their own records
- Role scope: Verified token role, not client-provided

---

## 26. What Differentiates Kisan360 from a Price App?

**Q: Why not just build a mandi price website?**

**A:** A price app says: "Market X pays ₹2,800/q"
Kisan360 says: "For YOUR lot from Nashik, Market Y gives ₹1,975 more after transport, has 3 compatible buyers, and here's how to execute."

The difference is the *decision-and-execution layer*, not the price display.

---

## 27. What Differentiates It from a Marketplace?

**Q: How is this different from an agri-marketplace?**

**A:** A marketplace connects buyers and sellers. Kisan360 does:
1. Market intelligence (which market?)
2. Economic decision (which net realization?)
3. Pathway comparison (sell/store/aggregate?)
4. Buyer matching (who can buy?)
5. Execution (offer → payment → receipt)

Marketplaces start at step 4. Kisan360 starts at step 1.

---

## 28. What Is the Actual Innovation?

**Q: What's genuinely new here?**

**A:** The connected workflow:
- Headline price ≠ farmer realization (the inversion)
- Lot-level economic comparison across markets
- Pathway decision (not just market selection)
- Evidence-based timing guidance
- Execution connected to decision
- FPO aggregation as economic alternative

The innovation is the *decision intelligence* layer, not any single component.

---

## 29. What Assumptions Are Currently Simulated?

**Q: What are you assuming vs. measuring?**

**A:**
- Transport rates: Documented averages (not real-time quotes)
- Market fees: Published schedules (not live verification)
- Buyer directory: Demo data (not real demand)
- Storage availability: Demo data (not real facilities)
- Quality grading: Farmer-entered (not AI-verified)
- Payment processing: Simulated (not real money)

Every assumption is labeled in the evidence drawer.

---

## 30. What Would You Build Next with Government/Market Access?

**Q: What's the roadmap with real access?**

**A:**
1. Production AGMARKNET API integration
2. Real buyer onboarding + verification
3. Transporter API (booking + tracking)
4. Storage facility partnerships
5. Payment gateway (Razorpay/UPI)
6. Optional: AI quality grading (computer vision)
7. Optional: Price trend notifications
8. Optional: Grievance escalation workflows

The architecture supports all of these — the demo uses static data where production would use real integrations.

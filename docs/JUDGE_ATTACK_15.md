# KISAN360 — FINAL JUDGE ATTACK (15 Additional Questions)

## Questions 31–45

---

### 31. "Your transport rates are made up. Why should I trust them?"

**Answer:** The transport rates are documented averages from published agricultural logistics data (₹/q/km). They're assumptions, clearly labeled in the evidence drawer.

**Evidence:** Every screen showing transport cost has an `[assumption]` tag. The `/api/market/assumptions` endpoint returns the exact rates used.

**Limitation:** Actual transport costs vary by road condition, vehicle type, and negotiation. The system uses documented averages as a starting point.

---

### 32. "You're showing demo buyers. This isn't real demand."

**Answer:** Correct. The buyer directory is demo data for SIH demonstration, explicitly labeled "DEMO" everywhere. In production, real buyer onboarding and verification would be required.

**Evidence:** Every buyer card shows "DEMO DATA" badge. The trust tier system is designed for real verification but currently uses demo data.

**Limitation:** Buyer directory is not real-world demand. This is a production scaling challenge, not a missing product logic.

---

### 33. "A farmer can't actually buy anything through this system."

**Answer:** Correct. The transaction flow is simulated — no real money moves. The system demonstrates the *workflow* (decision → buyer → offer → payment → receipt), not real financial processing.

**Evidence:** Every payment shows "SIMULATED" badge. The demo clearly communicates this is a demonstration of the execution flow.

**Limitation:** Real payment processing would require a payment gateway integration (Razorpay/UPI).

---

### 34. "Your 'sale-window' guidance is just looking at past prices. That's not intelligence."

**Answer:** The sale-window intelligence uses observed history (7/14/30-day modal prices) to classify timing as FAVORABLE_NOW / NEUTRAL / WEAK / INSUFFICIENT_EVIDENCE. This is evidence-based guidance, not prediction.

**Evidence:** The classification includes a reason: "Current price is above 30-day modal" or "Insufficient historical data."

**Limitation:** No predictive ML. No future price claims. The system honestly says "I don't know" when evidence is insufficient.

---

### 35. "What if two farmers have the same lot? Do they get the same recommendation?"

**Answer:** Yes, if they have the same crop, quantity, location, and quality. The recommendation is deterministic — same inputs produce same outputs.

**Evidence:** The engine is deterministic, not personalized. This is a feature, not a bug — the recommendation is reproducible and auditable.

**Limitation:** Individual farmer circumstances (actual transport cost, actual market fees) may vary. The system uses documented averages.

---

### 36. "You're not actually reducing information asymmetry. You're just repackaging AGMARKNET."

**Answer:** AGMARKNET shows prices. Kisan360 shows the *economic decision*. The difference:
- AGMARKNET: "Market X price is ₹2,800/q"
- Kisan360: "For your 10q lot from Nashik, Market Y gives ₹1,975 more after transport, has 3 compatible buyers, and here's how to execute."

The information asymmetry reduction is in the *decision layer*, not the price display.

**Evidence:** The net-realization calculation shows the inversion — the highest headline price isn't always the best outcome.

---

### 37. "How do you handle crops you don't have data for?"

**Answer:** The system uses AGMARKNET data. If a crop isn't reported by AGMARKNET, the system would have no market data for it.

**Evidence:** The system gracefully handles empty market data — it shows "No market data available" instead of crashing.

**Limitation:** The system depends on AGMARKNET coverage. Crops not reported by AGMARKNET would not be supported.

---

### 38. "What happens if a farmer enters wrong data?"

**Answer:** Server-side validation catches:
- Invalid crop names
- Invalid districts
- Out-of-range quantities
- Invalid quality values

The system returns honest error messages, not silent failures.

**Evidence:** Lots endpoint validates all inputs. Invalid data gets 400 responses with clear messages.

**Limitation:** If a farmer enters plausible but incorrect data (e.g., wrong quantity), the system will process it. The recommendation will be based on the entered data.

---

### 39. "Your 'pathway comparison' is just three numbers side by side. That's not intelligence."

**Answer:** The pathway comparison shows:
- SELL NOW: Estimated net with current market
- STORE: Storage cost + breakeven required price
- AGGREGATE: Pooled quantity + logistics uplift + buyer coverage

Each option includes evidence, assumptions, and uncertainty. The "intelligence" is in the *comparison framework*, not just the numbers.

**Evidence:** The pathway screen shows evidence tags, assumption labels, and uncertainty indicators for each option.

**Limitation:** The comparison uses documented averages and demo data. Real-world factors may vary.

---

### 40. "Why should a farmer trust a computer over their local mandi agent?"

**Answer:** The system doesn't replace the mandi agent — it provides *additional information*. The farmer still decides.

The system shows:
- Market comparison (not just one price)
- Economic analysis (not just headline)
- Evidence source (not just a number)
- Buyer alternatives (not just one option)

The mandi agent has local knowledge the system doesn't. The system has market-wide comparison the agent doesn't. They're complementary, not competitive.

**Limitation:** Local knowledge (actual transport costs, actual market fees, buyer reputation) is not captured by the system.

---

### 41. "You're showing 'estimated advantage' but farmers don't care about estimates. They care about money in their pocket."

**Answer:** Correct. The "estimated advantage" is the system's calculation, not guaranteed income. The system honestly communicates this: "Estimated decision difference — not an income guarantee."

In production, with real buyer integration and payment processing, the advantage would become *realized* advantage. The demo shows the *architecture* for this.

**Limitation:** No controlled trial. No measured income increase. The number is the engine's calculation, not a proven outcome.

---

### 42. "What if AGMARKNET data is wrong?"

**Answer:** The system falls back to the last-known-good snapshot. It also flags outlier prices for human review.

**Evidence:** The snapshot safety mechanism preserves prior data when new data is suspicious. Outlier detection flags unusual prices.

**Limitation:** The system trusts AGMARKNET as the authoritative source. If AGMARKNET is systematically wrong, the system would be wrong too.

---

### 43. "Your FPO aggregation is just summing quantities. That's not innovation."

**Answer:** FPO aggregation changes the *economics*:
- Bulk transport threshold kicks in (different rate)
- Different buyer minimums become achievable
- Logistics cost per unit changes

The system calculates the *economic difference* between individual and pooled selling. It's not just summing — it's comparing pathways.

**Evidence:** The pathway comparison shows SELL NOW vs AGGREGATE with concrete numbers: transport uplift, buyer coverage change, net economic difference.

---

### 44. "How does this work for a farmer with no smartphone?"

**Answer:** It doesn't — currently. The system is a web application requiring a browser. In production, this could be extended to:
- USSD/SMS interface
- IVR (Interactive Voice Response)
- Kiosk/PC at panchayat office
- Agent-assisted interface

The *decision logic* is backend-only and could power any frontend.

**Limitation:** Current UI requires a smartphone/computer with browser. This is a production scaling challenge.

---

### 45. "What if the government already has this system?"

**Answer:** The government has:
- eNAM: Price discovery platform
- MKIS: Market information system

Kisan360 adds:
- Economic decision layer (net realization)
- Pathway comparison (sell/store/aggregate)
- Execution workflow (buyer → offer → transaction)
- FPO aggregation as economic alternative

The differentiation is the *decision-and-execution layer*, not the price display or marketplace.

**Limitation:** We don't integrate with existing government systems. This is a standalone demonstration of the architecture.

# KISAN360 — SIH 5-MINUTE PITCH STRUCTURE

## Timeline

### 0:00–0:30 — The Problem

**Visual:** Farmer looking at a mandi price board.

**Script:**
"A farmer sees ₹2,800/quintal for onions at Lasalgaon. They assume that's what they'll get. But after transport, loading, and market fees, they might keep only ₹2,100.

Meanwhile, a market with a lower headline price might leave them with ₹2,200.

**The highest price isn't always the best outcome.**"

**Key message:** Price ≠ Realization

---

### 0:30–1:00 — Why Existing Solutions Are Insufficient

**Visual:** Split screen — eNAM vs Kisan360

**Script:**
"eNAM shows mandi prices. That's valuable. But it doesn't answer: 'For *my* lot, from *my* location, with *my* quantity — where should I sell?'

A marketplace connects buyers and sellers. But it doesn't help the farmer decide *which* market gives the best economic outcome.

**Kisan360 combines market intelligence with economic decision-making.**"

**Key message:** Decision + Execution, not just Price or Marketplace

---

### 1:00–1:30 — The Kisan360 Concept

**Visual:** Product logo + core value proposition

**Script:**
"Kisan360 evaluates the farmer's selling options using:
- Market price
- Farmer-borne costs
- Quantity-dependent logistics
- Buyer compatibility
- Available evidence

Then connects the decision to an executable workflow.

**Don't just find the highest price. Find the best selling outcome for your lot.**"

**Key message:** The connected workflow

---

### 1:30–3:30 — Live Product Demonstration

**Script (with live demo):**

**1:30–1:50 — Farmer Input**
"Let's take a real scenario: Onion, 10 quintals, Nashik."

**1:50–2:10 — Market Comparison**
"The system compares 30 mandis. Lasalgaon has the highest headline price at ₹2,800/q. But after transport and costs, the farmer net is lower."

**2:10–2:30 — The Inversion**
"Market B has a lower headline price but higher farmer net. The difference for this lot: ₹1,975.

This is the inversion — and it's the core insight."

**2:30–2:50 — Evidence**
"Every number has provenance: source, timestamp, assumptions. The farmer can see *why* this recommendation was made."

**2:50–3:10 — Pathway Comparison**
"What if the farmer stores? Or aggregates with their FPO? The system compares SELL NOW vs STORE vs AGGREGATE."

**3:10–3:30 — Execution**
"Now let's connect this to action. Compatible buyers are identified. A lot is created. An offer is made. The transaction is tracked."

**Key message:** The complete journey from decision to execution

---

### 3:30–4:15 — Technical Architecture / Trust Model

**Visual:** Architecture diagram

**Script:**
"The architecture is designed for trust:

1. **External Source → Facts:** AGMARKNET provides market data
2. **Deterministic Engine → Calculations:** Net realization, pathway comparison
3. **Rules → Recommendations:** Buyer matching, quality compatibility
4. **LLM → Explanations:** Human-readable 'why' (when available)
5. **Human → Final Decision:** The farmer decides

AI does not calculate economics. AI explains results. The farmer decides.

Every assumption is labeled. Every number has provenance. The system can say 'I don't know' when evidence is insufficient."

**Key message:** Deterministic core, explainable AI, honest about limitations

---

### 4:15–4:45 — Impact + Scalability

**Visual:** Architecture scalability diagram

**Script:**
"The architecture supports:
- New crop → add to engine
- New district → add mandi data
- New buyer → add to directory
- New FPO → add members

In production, this would connect to:
- Real buyer verification
- Real transporter booking
- Real payment processing
- Real storage facilities

The demo uses static data where production would use real integrations. The *decision logic* is production-ready."

**Key message:** Demo-grade logic, production-grade architecture

---

### 4:45–5:00 — Closing

**Visual:** Product value proposition

**Script:**
"Kisan360 doesn't tell farmers where the price is highest. It helps them understand where their actual selling outcome is strongest — and gives them a path to act on it.

**Don't just find the highest price. Find the best selling outcome for your lot.**"

**Key message:** The memorable one-liner

---

## Demo-Day Tips

1. **Start with the problem, not the architecture.** Judges want to understand *why* before *how*.

2. **Use the cached snapshot.** Live data fluctuates. The cached snapshot gives deterministic outcomes.

3. **Show the inversion.** This is the strongest wow moment. The headline-price myth being broken.

4. **Show the evidence.** Every number has provenance. This builds trust.

5. **Show the execution.** Decision → Buyer → Offer → Transaction. This is the differentiation.

6. **Be honest about limitations.** Buyers are demo data. Storage is demo data. Payments are simulated. Judges respect honesty.

7. **End with the one-liner.** "Don't just find the highest price. Find the best selling outcome for your lot."

---

## Backup: If Demo Fails

1. **AGMARKNET unavailable:** Use cached snapshot
2. **MongoDB unavailable:** Restart with fallback
3. **UI crashes:** Fall back to API demonstration
4. **Transaction fails:** Skip to receipt/history

The core value proposition (inversion + decision) works with cached data.

# Kisan360 — SIH Demo War Room (Final Report)

**Freeze rule:** after this phase, NO new features. A change ships only if it is a P0 bug,
a demo-reliability fix, or a judge-comprehension fix. Everything else waits.

**The one memory we want:** *"Kisan360 showed me that the highest market price is not
necessarily what the farmer actually takes home — and then it connected that decision to an
actionable buyer."*

---

## 1. The eight one-sentence answers (memorize)

| # | Question | Answer |
|---|---|---|
| A | **The product** | Kisan360 turns mandi price data into an explainable selling decision — where to sell, what you'd take home, who can buy, and what happened after. |
| B | **The problem** | A farmer can see the highest headline price and still lose money to transport, storage and loading costs — and price portals stop exactly where that problem starts. |
| C | **The differentiator** | Every other tool shows one piece — a price, a buyer list, a chatbot — Kisan360 connects price → net → why → robustness → buyer coverage → offer → transaction → history in one deterministic chain. |
| D | **Market linkage** | Price discovery says where prices exist; market linkage means turning that into an actionable sales path — which we show per mandi, from buyer coverage to accepted deal. |
| E | **FPO** | Pooling isn't a social feature — it changes the economics: individual small lots pay small-lot transport and can't meet processor minimums, a 50 q pooled lot crosses the full-truck threshold and unlocks buyers. |
| F | **Government** | We integrate, don't replace: Kisan360 is a decision layer over AGMARKNET/eNAM/APMC data, deployable without touching existing systems, with honest metrics later. |
| G | **AI** | The LLM only explains what the deterministic engine already computed — it never invents prices, never calculates economics, never decides the sale. |
| H | **Trust** | Every number on screen traces to source + timestamp + documented assumption + reproducible arithmetic; when the data is weak, the product says LIMITED instead of pretending. |

---

## 2. The 20-second opening (before any talking)

The judge opens the product and — without the presenter explaining architecture — the screen
must answer WHO / PROBLEM / SOLUTION.

**Where it lives:**
- `/` (Landing): headline *"Don't just find the highest mandi price. Find where you take home
  the most."* + the concept line beneath: *"Two mandis can offer different prices. But the
  mandi paying the most may not leave the farmer with the most money."*
- `/dashboard`: the hero repeats the concept line and presents **the lot, not a form**:
  Crop · District · Quantity(10) with one button — **"Where should I sell? →"**.
  Preset defaults are the canonical scenario: **Onion · Nashik · 10 q**.

**Presenter script (20 s):**
1. "This is a farmer in Nashik with 10 quintals of onion. The app asks one question: where
   should this farmer sell?" *(point at the inputs — do not explain the stack)*
2. Click **"Where should I sell? →"**. Results load.
3. Point at the top-ranked mandi's headline price and pause: *"This market pays the most per
   quintal. Would you sell here?"* — let the judge form the obvious answer. That pause IS the hook.

---

## 3. The 3-minute demo (compressed run of show)

> Rehearse once on demo morning and write the ACTUAL engine numbers into the blanks —
> the wording must match the live calculations, never a memorized script.

| Time | Beat | What the judge sees / presenter says |
|---|---|---|
| 0:00 | Problem | Landing + dashboard hero. Concept line. "Headline price ≠ take-home." |
| 0:20 | Farmer input | Onion · Nashik · 10 q → "Where should I sell?" Results load. |
| 0:40 | **Inversion (WOW 1)** | WITHOUT/WITH card: naive headline choice = ₹47,209 take-home vs Kisan360 pick = ₹51,530 → **"₹4,321 more on this lot — by not chasing the highest price."** Badge reads *estimated decision difference — not an income guarantee*. *(verified 2026-09-12 — re-read from the live card on demo morning)* |
| 1:10 | Why / evidence | Open the **Why?** drawer once: price `[data]`, transport ₹/q/km `[assumption]`, quantity `[your input]`, quote date + retrieved `[data]`. "We don't ask the farmer to trust a black box." |
| 1:30 | **50 q flip (WOW 2)** | "What could change this decision?" → click **What if I sell 50 q** → server-side recompute renders OLD recommendation → NEW recommendation. "Quantity changed the logistics economics — the 40 q full-truck threshold halves the transport rate." |
| 2:00 | **Can I sell here? (WOW 3)** | Buyer-coverage card: "the economically best mandi isn't enough — can the farmer actually sell there?" Show compatible-buyer counts and the divergence card if it appears. |
| 2:20 | Buyer + offer | "Sell at ___ — create lot →" (pre-filled) → matched buyers show **Matched because ✓ crop ✓ service area ✓ quantity** → offer composer opens pre-filled with the engine reference; show benchmark (ABOVE/NEAR/BELOW REFERENCE) and factors-on-record. |
| 2:40 | Transaction | Buyer demo-login → Accept → payment timeline PENDING → HELD → RELEASED with the *simulated — no real money moves* badge visible. |
| 3:00 | Outcome + final line | PaymentOutcome card (reference vs offer vs locked deal) + decision receipt (entered / recommended / offered / accepted / happened). Close: **"Kisan360 doesn't tell farmers where the price is highest. It shows where their actual selling outcome is strongest — and gives them a path to act on it."** |

## 4. The 5-minute extended demo (adds FPO)

Same as above through 2:40, then:

- **3:00 — FPO fork:** on `/fpo` the page opens on the farmer's OWN decision ("Path A — sell
  individually … the decision you just made"). "What if the farmer doesn't sell alone?"
- **3:20 — pool compute:** crop follows the decision (selector) → members pooled → side-by-side
  INDIVIDUAL vs POOLED totals, per-member uplift, and the logistics card (many small trips →
  one full truck; transport saved/q × pooled quantity = group saving).
- **3:50 — coverage unlock:** pooled 50 q buyer-coverage — minimums that excluded individuals
  now clear; show the pooled-mandi buyer count and the "Create pooled lot" handoff.
- **4:10 — history:** back on `/trade`, the selling record (settled deals vs reference) —
  "the product records what actually happened; that loop is how estimates would improve."
- **4:30 — closing line + Q&A ammo on standby** (FPO numbers, alt-crop run, outlier story,
  cached-mode story, assumptions endpoint).

## 5. Flagship screen (the decision screen)

`/net-realization` — the visually dominant surface. Hierarchy = money → decision → evidence → action:

1. **WHERE SHOULD I SELL?** hero: recommended mandi + estimated net ₹/q + badges
   (robust/sensitive, trust level, live/cached + freshness).
2. **Estimated money for your lot:** `10 q × ₹5,153/q = ₹51,530` — the hero number of the whole product. *(verified 2026-09-12 — re-read from the live card)*
3. **Why this market / advantage vs next best / watch** strip (engine-authored).
4. Primary CTA: **"Sell at ___ — create lot →"** (pre-fills Trade).
5. WITHOUT/WITH card (with the estimated-decision-difference badge).
6. What-could-change-this (live 50 q / 100 q recompute).
7. Ranked mandis with per-row Why? drawers (price / transport / quantity / net / quote date /
   retrieved / decision status) + skipped-markets honesty block.
8. Can-I-sell-here coverage + divergence card.
9. Stress-test rows + decision trace (the Why? drawer's tagged cost breakdown + the assumptions endpoint — presented as "how Kisan360 decided").

Everything below the hero is progressive disclosure: it answers interrupts without crowding the decision.

## 6. The three WOWs (and where they live)

1. **Inversion** — WITHOUT/WITH + the amber inversion card: the highest-headline market ranked
   lower by net, with the exact per-lot cost of chasing it. Engine-computed; when the naive
   choice is right, the card honestly says so.
2. **Live quantity flip** — "What if I sell 50 q instead of 10?" recomputes **server-side** in
   the same engine and renders OLD → NEW recommendation with the transport-threshold why-line.
   Nothing pre-scripted; change the input and the answer genuinely moves.
3. **Actionability** — "Finding the best market isn't enough — can the farmer actually sell
   there?" Buyer-coverage counts per costed mandi, NO_MATCH states with blockers quoted, and
   the divergence card pricing the gap between economic-best and currently-actionable.

## 7. The strongest proofs (one each)

- **Economic:** the WITHOUT/WITH per-lot card — an honest, engine-computed difference on THIS
  lot, with the disclaimer, and a documented ₹25/q close-call threshold that refuses to
  oversell small gaps.
- **Trust:** the Why drawer + `/api/market/net-realization/assumptions` + provenance stamps —
  every figure traceable to source, timestamp, documented assumption, and reproducible
  arithmetic; outliers flagged and downgraded to LIMITED.
- **Market linkage:** buyer coverage → explainable matching → offer benchmark vs reference →
  transaction state machine → decision receipt. The decision becomes a workflow, not advice.
- **FPO:** the logistics split (individual avg transport/q vs pooled transport/q, group saving)
  computed from the same engine plus the coverage unlock at pooled size. Mock members, real math.
- **Deployment:** the engine is crop-generic (verified by tests and by the Soybean·Akola·12 run);
  new crop/district/mandi/buyer = data, not code; the daily `refresh-prices.js` pull + stamped
  cache + memory-DB fallback mean venue Wi-Fi cannot kill the demo.

---

## 8. The ten toughest judge questions (10 s / 30 s / evidence)

| # | Attack | 10-second answer | 30-second answer | Product / technical evidence |
|---|---|---|---|---|
| 1 | **Why not just eNAM?** | eNAM tells you where prices exist; it doesn't tell you what YOU'd take home or who'll buy your lot. | eNAM/AGMARKNET is our price layer — we're a decision layer on top: costs, net ranking, robustness, buyer coverage, offer workflow. We integrate rather than replace. | Market provenance shows AGMARKNET as source; dashboard ecosystem copy. |
| 2 | **Why not a mandi-price website?** | A price website stops at the headline number — the number that can mislead. | We start where the website stops: farmer-borne costs → net per mandi → per-lot totals → what-if → actionable buyer. Price is the input; the decision is the product. | WITHOUT/WITH card; net ranking; lot totals. |
| 3 | **Why not WhatsApp / an advisory chatbot?** | A chatbot answers questions; farmers need a decision they can act on. | And our AI doesn't decide anything — the deterministic engine calculates, rules recommend, the LLM only explains the output. No hallucinated prices possible. | Explain endpoint `explainedBy` tag; honesty note; "AI: explanation only" trace. |
| 4 | **Why not an existing marketplace?** | A marketplace matches buyers and sellers; it doesn't tell a farmer which sale is economically best. | We sit before the marketplace: intelligence → decision → then the transaction with offer context and a receipt. Sellers enter knowing their numbers. | Offer benchmark + decision receipt; §12 distinction below. |
| 5 | **Your transport rate is an assumption — why trust it?** | It's documented, shown on-screen, and stress-tested. | Every cost carries an `[assumption]` tag, the hero shows the exact rate, we run transport +50% / quantity ×2 / price −5% stress tests with a ROBUST/SENSITIVE verdict, and we publish the break-even rate where the decision flips. | Why drawer tags; robustness scenarios; break-even card; assumptions endpoint. |
| 6 | **What happens when data is stale or wrong?** | Then we say so — freshness is on the card, and stale data never pretends to be live. | Live/cached badge + retrieved-at timestamp on every result; cached fallback is a stamped real AGMARKNET snapshot; outliers are flagged and marked "verify before acting"; skipped markets are listed with reasons. | Freshness badges; priceSnapshot unit test; outlier handling; skipped-markets block. |
| 7 | **What if your recommendation is wrong?** | The engine states what would change its mind — and when it can't know. | Sensitivity verdicts, close-call disclosure at ₹25/q, confidence level with watch signals, and negative-net warnings when costs exceed market value. The farmer sees the boundaries of the answer, not just the answer. | CloseCall card; ROBUST/SENSITIVE verdict; economicsWarnings. |
| 8 | **Are the buyers real?** | The tiers say exactly what each record is — no generic "Verified" badge. | REAL_VERIFIED / SOURCE_VERIFIED / DEMO_VERIFIED / SELF_DECLARED with per-tier descriptions, and coverage is explicitly "current directory, not demand." Payments are labeled simulated. | Trust tier badges + tooltips; coverage dataBasis disclaimer. |
| 9 | **Where exactly is AI?** | Explanation only — one sentence. | RAG restates the engine's own output in simple words (tagged with who explained it); offline it falls back to deterministic template text. The LLM never generates a number anywhere in the product. | `/net-realization/explain` honesty note; fallback path in market.js. |
| 10 | **How does government deploy this?** | It's a layer over existing public data — no system replacement needed. | AGMARKNET/eNAM feeds in, decisions out; deployable per-district; the impact plan is pre-declared metrics from real deployments — never fabricated ones. | SYSTEM_ARCHITECTURE.md metrics plan; integration copy on landing. |

## 9. Judge interrupts (every answer is a UI feature, not a speech)

| Judge asks | Where the UI answers |
|---|---|
| "What does this number mean?" | Per-row Why? drawers; every figure labeled headline/costs/net/lot total. |
| "Where did this price come from?" | Provenance: source, quote date, retrieved-at, live/cached badge. |
| "Why did the market change?" | What-if panel: OLD → NEW recommendation + transport-threshold why-line. |
| "Are these buyers real?" | Four-tier trust badges with tooltips + directory disclaimer. |
| "Is this offer guaranteed?" | Reference vs offer separation everywhere; "a market observation, not a guaranteed price." |
| "Why should I trust the recommendation?" | "How Kisan360 decided" trace + assumptions endpoint + robustness verdict. |
| "What if there is no buyer?" | NO_MATCH state with quoted blockers + divergence card (economic best vs next actionable + its cost). |

## 10. Impact & scale — without fake metrics

- **Never** display "farmers earn X% more." The card says what it is:
  *"estimated decision difference — not an income guarantee"*, computed on the judge's own
  scenario: "On this 10 q lot, the naive headline-price decision would leave approximately
  ₹4,321 less according to our current data and assumptions."
- **Scale proof = one more crop, not new code:** run Soybean · Akola · 12 q live in Q&A.
  The crop dropdown follows the price cache; nothing in the engine is onion-specific
  (enforced by tests). New mandi/buyer/FPO = data entry, not a rebuild.

## 11. Red-team defenses (one line each)

- "Just eNAM data" → the data is the input; the decision layer is the product.
- "Just subtracting transport" → provenance, normalization, robustness, actionability, transaction, history — the chain is the product.
- "Not market linkage" → coverage → matched buyers → offer → acceptance → payment → receipt, all in-product.
- "Buyers are fake" → tiers say exactly which are simulated; never claimed otherwise.
- "Prediction isn't real" → correct — we never predict; sensitivity and observed trends only.
- "AI is a chatbot" → the LLM explains computed output; it cannot generate a number.
- "Numbers are assumptions" → yes, documented and tagged, with stress tests and break-evens shown.
- "Only works for onion" → Soybean·Akola·12 run; crop-agnostic engine, test-enforced.
- "FPO isn't necessary" → pooling changes transport tier AND unlocks buyer minimums — shown numerically, farmer's choice.
- "No proven farmer impact" → we show per-lot decision differences and pre-declare deployment metrics instead of inventing them.

## 12. "Why is this not just a calculator / marketplace / AI?"

- **Calculator:** price − cost. Kisan360: market data + provenance + normalization + net
  realization + scenario analysis + buyer coverage + lot + offer + transaction + history + FPO
  pooling. The differentiator is the connected workflow.
- **Marketplace:** buyer ↔ seller. Kisan360: market intelligence → economic decision →
  actionable buyer → offer context → transaction → outcome.
- **AI:** "AI is not deciding the farmer's economics. The deterministic engine calculates.
  Rules recommend. The source provides facts. AI explains where useful. The farmer decides."

---

## 13. Demo failure plan (primary → fallback → backup)

1. **Primary:** live AGMARKNET pull; if it fails/rate-limits, `marketCache.getBestPrices`
   serves the **stamped snapshot** (85 real rows, Onion 30 / Soyabean 29 / Tomato 26) and every
   surface labels CACHED with retrievedAt (unit-tested).
   **Upstream filter anomaly (observed live 2026-09-09):** data.gov.in can ignore
   `filters[state]` and return an arbitrary all-India page that survives local filtering as a
   single Maharashtra mandi. Two guards now handle this automatically: the cache service falls
   back to the snapshot whenever a live pull yields fewer than 2 distinct mandis (provenance
   says so), and `refresh-prices.js` refuses to overwrite the known-good snapshot with fewer
   than 3 distinct markets. Do not remove either guard — they are what keeps the comparison
   story alive on a bad upstream day.
2. **MongoDB unavailable (venue Wi-Fi):** the API falls back automatically to an in-memory DB —
   console banner + `/health` shows `"db": "memory"`. Memory DB is process-lifetime: re-run the
   seeder after any API restart. (`KISAN_DEMO_MEMORY_DB=0` restores hard-fail behavior.)
3. **Groq unavailable:** advisory explanations fall back to deterministic templates.
4. **Calculator (:8002) down:** UI shows a clear error card; restart
   `cd ml-service && python -m uvicorn net_realization:app --port 8002` and re-run the compute.
   **Do not demo without the engine.**
5. **Backup of last resort:** a screen recording of the full 3-minute run, stored locally on
   the demo machine. Primary/fallback are code-supported; the video is insurance only.

Rehearse the cached path once before every session: kill the network → reload → confirm the
CACHED label → continue the journey from snapshot data.

## 14. Operator reset procedure (deterministic — no DB edits, no dev steps)

**Start the stack (three terminals):**
```bash
cd ml-service && python -m uvicorn net_realization:app --port 8002   # the engine (required)
cd backend && PORT=5000 npm start                                    # the API
cd web-app && npm run dev                                            # the UI
```

**Login:** landing → "Try the demo — no signup" → **Farmer**. Buyer act: sign out → demo sign-in → **Buyer**.

**Seed / reset state (either one):**
- In-app (presenter mode): Dashboard with **`?demo=1`** in the URL → *Presenter controls* → **↺ Reset demo state** (calls `POST /api/auth/demo/seed`, seeds the canonical Onion 10 q lot + a SENT offer, then reloads) or **▶ Run canonical scenario** (deep-links `/net-realization?crop=Onion&district=Nagpur&quantity=10`). Hidden from judges on the normal flow.
- CLI: `cd backend && node scripts/seed-demo.js` (same state + a Soybean 12 q Akola alt-crop lot). The server also auto-seeds this scenario on startup whenever the memory DB is empty.

**Canonical scenario:** Dashboard (with `?demo=1`) → **▶ Run canonical scenario** (deep-links
`/net-realization?crop=Onion&district=Nagpur&quantity=10`) or enter it manually. The flagship
auto-computes and lands on results. Alt-crop proof: Soybean · Akola · 12.

**History reset:** on an in-memory DB, restarting the API wipes lots/payments — always re-run
the seeder after an API restart. On Atlas, re-running the seeder simply adds fresh records; the
sold/RELEASED history remains, which is fine (it feeds the receipt/history story).

**Recovery:** wedged screen → hard refresh (decision context survives in sessionStorage);
wrong state → re-run the seeder and re-login; engine down → restart :8002 → re-run compute;
API down → `PORT=5000 npm start`, check `/health` for `"db":"connected"|"memory"`. Auto-seed now repopulates the canonical scenario on restart when the memory DB is empty — only manually re-seed if you want an extra fresh scenario stacked.

**Pre-session machine check (2 min):** 1920×1080, zoom 100% · hero + lot-total card legible at
3 m · Why drawer opens with `[data]`/`[assumption]` tags visible · 50 q flip renders · buyer
cards/offer/transaction/receipt render · DevTools console clean once · one full timed rehearsal.

## 15. Remaining risks

**P0 (fix immediately if seen):**
- Calculator (:8002) not running — the flagship cannot compute. Never demo without it.
- Atlas DNS flakiness → memory-DB mode wipes state on API restart; the server now AUTO-SEEDS the canonical scenario (Onion · 10 q · Nashik + in-flight offer) on startup when the DB is empty — no manual step. `node scripts/seed-demo.js` still works for stacking a fresh scenario mid-journey.- Inversion/flip depends on the snapshot's price geography — verify on demo morning that the canonical scenario still shows a non-zero WITHOUT/WITH difference. **Re-verified live 2026-09-12:** the Onion·Nashik cache has CONVERGED (+₹0 — Mangal Wedha leads on both gross and net, no inversion). Canonical scenario moved to **Onion · Nagpur · 10 q**: naive Mangal Wedha ₹5,510/q gross → ₹47,209 take-home vs APMC Nagpur ₹5,250/q gross → **₹51,530 → +₹4,321 on the lot**; at 50 q the recommendation **flips to APMC Mangal Wedha** (₹5,190.5/q net — full-truck threshold halves transport). Alt-crop: Soybean·Akola·12 → Krushna Krishi Bazar, Washim ₹6,161.7/q net. Fallback districts with live inversions: Satara (+₹2,757), Sangli (+₹2,118), Kolhapur (+₹2,616), Amravati (+₹5,070). If a future refresh converges Nagpur too, sweep these districts and pick the widest gap.

**P1 (acknowledged, defensible):**
- Buyer directory and payments are simulated (labeled everywhere) — offers are directory-driven, not live demand.
- Transport/storage rates are documented assumptions — mitigated by tags, stress tests, break-evens.
- FPO member roster is mock (labeled); pooling math is real, member data is illustrative. When the
  pooled mandi is farther (Onion → APMC Nagpur), the uplift comes from **market access, not
  transport savings** — the FPO card now shows this as an explicit trade-off instead of a negative
  "saved" number.
- Live-pull rate limits during back-to-back judge sessions → the cached path is the designed answer.

## 15b. Playtest verification log (2026-09-09)

Defects found driving the real product end-to-end, and their fixes (all fixed, all verified live):
1. **Live-pull slice anomaly** — upstream ignored `filters[state]`, leaving 1 rankable mandi and a
   fake "robust" trivial answer. Fixed with the snapshot-breadth guard (marketCache.js) and the
   refresher sanity gate (refresh-prices.js); a thin-evidence notice was added to the UI for any
   remaining single-mandi case.
2. **Wrong benchmark district** — buyer-side offer benchmark silently assumed Pune when the lot
   record wasn't in view, showing a wrong reference for a Nashik lot. Fixed: `/api/payments` now
   populates `lotId.district`, and the UI uses the populated district or shows no benchmark at all
   (never a wrong one). Verified: reference now ₹4,510.5/q (Lasalgaon Niphad), not a Pune default.
3. **FPO "transport saved" could be negative** — rendered as "₹-390/q … kept by the group". Fixed
   with the trade-off card (uplift from market access, stated explicitly).
4. **Demo-seed ownership** — `POST /api/auth/demo/seed` accepted an arbitrary `farmerUid`, which
   could seed records invisible to the logged-in farmer. Fixed: always seeds for the authenticated
   session.
5. **Tab title mis-framing** — browser tab said "AI Farming Companion"; now "Find where you take
   home the most".

Also verified live this session: state-machine attack (farmer-accept 403, duplicate accept 409,
farmer-release 403, duplicate release 422), 10-case adversarial API battery (tiny/huge/malformed/
negative quantities, unknown crop/district, 39.9/40/40.1 q threshold), decision continuity across
NetRealization → Trade → FPO, offer pre-fill at the engine reference, receipt + selling-record
rendering. Backend 44/44 tests green, web production build green.

## 15c. Hardening verification log (2026-09-12)

Min-TRL-6 sweep — every claim below was verified live, not inferred:

1. **Test recount:** backend **546/546 (22/22 suites)** + calculator **29/29** = 575 total.
   `DEMO_READINESS.md` (said 538) synced; `SIH26132_COVERAGE.md` (546) was already right.
2. **Snapshot re-stamp:** on-disk pull is **250 rows · 33 crops · 71 markets, retrieved
   2026-09-11**, serving **LIVE** (`/cache-status`). Docs saying "85 rows / 2026-09-08"
   updated; number legend added to READINESS (snapshot total vs per-crop slice vs
   ranked mandis — e.g. Onion ≈ 36 rows / 31 markets).
3. **Disease model boots:** HF MobileNetV2 (38 classes) loads in ~24 s on CPU, first
   predict 0.3 s — hence the `dev-up.sh` warmup step (tomato test image → expect HTTP
   200). Frontend crop list is Maharashtra-first; service-offline shows the
   `disease.offlineNote` line and the selling journey is unaffected.
4. **FPO renders on load:** `seedDemoScenario` + `POST /api/auth/demo/seed` now both
   create a pooled lot — verified live: **50 q / 5 members** (Soybean mock seed).
   `/fpo/pool` returns `mocked: true` with the real-math uplift.
5. **Seed district:** demo farmer session is Nashik (was Pune) — matches the lot.
6. **Judge-visible fixes:** Settings language dropdown now calls `setLanguage` with
   `en/mr/hi` (legacy word-form values normalized on load); NotFoundPage fully
   translated (`notFound.*` keys, already in all 3 locales); `gray-*` → `stone-*`
   in ErrorBoundary/NotificationBell/DataProvenance/App.
7. **Canonical moved to Nagpur:** Onion·Nashik converged (+₹0 inversion, no demo
   story) — RUNBOOK §CANONICAL re-verified Nagpur numbers on 2026-09-12. Rule stands:
   say the live number, never a memorized one.

## 16. What must NOT be built (freeze list)

Price-prediction ML · real payments/KYC · OSRM/live routing · per-crop vision grading beyond freshness (freshness grader shipped) · blockchain ·
new dashboards · a generic chatbot · confidence percentages dressed as probabilities · any
fabricated impact metric · any new feature that does not serve the selling-decision story.
Everything above is roadmap, not demo scope.

---

## 17. Judge memory test (run after every rehearsal)

Ask: *"What does Kisan360 do?"*

- ✅ "It tells farmers where they'll realize the most after selling costs — and connects that
  decision to buyers."
- ❌ "Some agriculture AI app…" → the opening/flagship messaging needs fixing, not the listener.

Success condition: the judge saw the farmer's problem, the economic consequence, why the
recommendation was made, what changed it, that the farmer could act, the buyer, the
transaction, and what happened afterward — **not a feature; the selling decision.**

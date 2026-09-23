# Kisan360 — Pilot Kit (TRL 9 evidence, not roleplay)

TRL 9 means *proven in an operational environment* — real farmers, real phones,
real villages, and a record of what happened. It cannot be earned at an
exhibition desk, and it cannot be earned by a demo script where the team plays
the farmer. This kit is the smallest honest way to get there.

**What it produces:** a session count, a device count, a district spread, a
time-to-decision, and — the number that matters — *predicted net realisation
versus what the farmer actually got paid*. That last one is a falsifiable claim
about this platform, which is exactly why it belongs in a pilot report.

---

## 0. Preconditions (do these once, before the first session)

| What | Where | Why |
|---|---|---|
| `KISAN_TELEMETRY=on` | Render → `kisan360-api` → Environment | Milestones are **off by default** — nothing is collected until you opt in. Redeploy after setting it. |
| `KISAN_RATE_LIMIT=off` for the pilot window (optional) | same place | A pilot day of many logins from one shared phone hotspot can hit the 30-logins/15-min guard. The guard is correct in production; relax it only for the pilot window, and set it back. |
| Fresh prices verified | `node scripts/probe-deploy.cjs` | The pilot is worth nothing if the screen the farmer sees is stale. The probe prints the observation age. |
| Consent script read aloud | §2 | Say it every time, in the participant's language. |
| Ledger open | §5 | Numbers typed after the day are numbers you don't have. |

Start-of-day check, one command:

```bash
node scripts/probe-deploy.cjs --timeout 150     # services live + freshness
curl -s -H "Authorization: Bearer $ADMIN" https://kisan360-api.onrender.com/api/ops/metrics?days=1
```

---

## 1. Who and how many

- **Target: 5–8 participants** across **at least 2 districts**. Below 5 the
  numbers are anecdotes; above 8 in one sitting the sessions get rushed.
- At least one participant should be an **FPO office-bearer** (the pooling
  screen has a different owner than a smallholder).
- No minors. No payment or gift in exchange for participating — the pilot is
  voluntary and it should be visibly so.
- Each participant holds **their own phone** (or uses the demo phone
  themselves); the presenter never drives.

---

## 2. Consent script (read aloud, verbatim, in their language)

### English

> "May I show you Kisan360, and write down what you do with it?
> **What I record:** which screens you finish — a price check, a crop listing, an
> offer — your district, your language, and a random device code. That is all.
> **What I never record:** your name, your phone number, the prices you type, or
> any photo.
> You can say no, or stop in the middle. Nothing changes for you either way, and
> it does not affect any scheme or help you get.
> Nothing here is a real transaction — the payments are simulated.
> If you want what I wrote deleted, tell me at any time and I will delete it."

### मराठी

> "मी तुम्हाला किसान360 दाखवू शकतो आणि तुम्ही काय करता ते लिहून ठेवू शकतो का?
> **मी नोंदवतो:** तुम्ही कोणते पडदे पूर्ण केले — भाव तपासणी, लॉट, ऑफर — तुमचा
> जिल्हा, भाषा आणि एक यंत्र-कोड. एवढेच.
> **मी कधीही नोंदवत नाही:** तुमचे नाव, फोन नंबर, तुम्ही टाकलेले भाव किंवा कोणताही
> फोटो.
> तुम्ही नाही म्हणू शकता किंवा मध्येच थांबू शकता. त्याने तुमच्या मदतीत काहीही बदल
> होत नाही.
> इथले व्यवहार खरे नाहीत — पैसे देणे-घेणे केवळ नक्कल आहे.
> मी लिहिलेले काढायचे असेल तर कधीही सांगा, मी काढून टाकेन."

### हिन्दी

> "मैं आपको किसान360 दिखाऊँ और आप क्या करते हैं यह लिख लूँ?
> **मैं दर्ज करता हूँ:** आपने कौन-सी स्क्रीन पूरी की — भाव देखना, लॉट, ऑफ़र — आपका
> ज़िला, भाषा और एक डिवाइस कोड। बस इतना ही।
> **मैं कभी दर्ज नहीं करता:** आपका नाम, फ़ोन नंबर, आपकी टाइप की हुई कीमतें, या कोई
> फ़ोटो।
> आप मना कर सकते हैं, या बीच में रोक सकते हैं। इससे आपकी मदद में कोई फ़र्क़ नहीं
> पड़ता।
> यहाँ कोई असली लेन-देन नहीं है — भुगतान नक़ली है।
> अपना रिकॉर्ड हटाना हो तो कभी भी बताइए, मैं हटा दूँगा।"

Say it, then ask one question and wait for the answer: **"ठीक है?" / "ठीक है?"** —
silence is not consent.

---

## 3. Session script (~15 minutes per participant)

The order matters: **ask first, teach later.** What a farmer does unaided is the
data; what they do after being shown is a tutorial.

| Min | Step | What you do | What you record |
|---|---|---|---|
| 0–2 | Setup | Brightness up, data on, app open at the login screen. Hand them the phone. | Device, network (4G/Wi-Fi), language chosen |
| 2–4 | Unaided start | *"तुमचा माल विकायचा असेल तर तुम्ही काय कराल?"* — say nothing else. | Did they find **Decision Workspace** alone? Where did they stop first? |
| 4–9 | The five steps | One tap at a time: price → grade → lot → offer → payment. Allow the *successful* path first. | Wall-clock per step; the net ₹/q they saw; whether they read the "why this mandi" line |
| 9–11 | The failure path | Simulate a payment failure, then raise a grievance. | Did they expect the grievance route to exist? Would they trust a resolution? |
| 11–15 | Feedback | Read §4 aloud, write answers **verbatim**. | Scores + free text |

Rules for the presenter: do not touch the phone; do not defend the app when they
criticise it (write it down instead); if they ask "does this really pay me?", the
answer is "not yet — these payments are simulated, this is a pilot".

---

## 4. Feedback form (read aloud, write verbatim)

| # | Question | Type |
|---|---|---|
| Q1 | "The price you saw — was it easy to trust? 1 to 5." / "भाव पर भरोसा करना आसान था? 1 से 5." | 1–5 |
| Q2 | "Could you finish it without my help? 1 to 5." | 1–5 |
| Q3 | "Before selling at the mandi, would you check this first?" / "मंडई में बेचने से पहले यह देखेंगे?" | yes/no/maybe |
| Q4 | "What confused you?" (ask, then stay quiet) | free text |
| Q5 | "What would make you use this every week?" | free text |
| Q6 | "If it were yours, what would you pay for it per month?" | ₹ — a willingness-to-pay datapoint, not a price |
| Q7 | Preferred language actually used on screen (observed, not asked) | mr / hi / en |

**Never quote a farmer's name in the report.** Participants are `P1…P8` in every
document that leaves the room; the name↔id mapping stays in the paper ledger
with the phone and is destroyed at the end of the pilot.

---

## 5. Ledger (fill during the session, not after)

| ID | Date | District | Crop · qty | Net ₹/q shown | Steps time | Actually sold? | Realised ₹/q | Q1–Q2 | Q3 | Consent |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | y / n / later | | | | yes / no |

"Actually sold?" is asked **a week later by phone**, not on the spot — that is
the only way `PILOT_RESULTS.md` gets a realised price to compare against.

---

## 6. Evidence ledger — which artifact proves which claim

| Claim | Artifact | Produced by |
|---|---|---|
| The deployed stack works, and how fresh its data is | `docs/evidence/deploy-probe.json` | `node scripts/probe-deploy.cjs` |
| A farmer can complete a sale on the public URL, both payment outcomes | `docs/evidence/deployed-smoke.json` | `node scripts/smoke-deployed.cjs` |
| Sessions, distinct devices, district spread, step completions | `/api/ops/metrics` output saved as `docs/evidence/pilot-metrics.json` | `curl …/api/ops/metrics` |
| Capacity under concurrent load | `docs/evidence/loadtest-*.json` | `node scripts/loadtest.cjs` |
| Predicted net vs realised price | `docs/PILOT_RESULTS.md` | the ledger above |

---

## 7. What we may and may NOT claim afterwards

**May claim (once the ledger has real rows):** *N* farmers across *D* districts
completed the sell-my-crop journey unaided on *M* devices, with a median
time-to-decision of *T* minutes; the platform predicted a net realisation of
₹*X*/q against a realised ₹*Y*/q in *k* completed sales.

**May NOT claim:**

- Any causal price uplift. There is **no control group**; a pilot measures
  whether the tool is usable and whether its prediction matched reality.
- That payments were real. They are simulated end-to-end and every screen says
  so; a pilot participant was told too.
- Statistical significance. Five to eight participants is a **usability and
  accuracy** pilot, and the report must say "n = *n*" next to every number.
- That the prediction is unbiased. Realised prices are self-reported by phone,
  and a farmer with a good outcome is likelier to answer the follow-up — say so.

Retention: pilot records live in the same MongoDB Atlas cluster as the demo and
are deleted on request (the participant can ask at any time, per the consent
script). Deleting means removing that day's `UsageEvent` rows — they carry no
identity, so the honest instruction is "tell us the date and district and we
remove those rows".

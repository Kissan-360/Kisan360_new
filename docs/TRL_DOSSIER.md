# Kisan360 — Technology Readiness Dossier

How this document works: a level is claimed **only** where an artifact exists
that a stranger can re-run. Every claim names its artifact; every level names its
gap. Numbers are not typed here — they come from `node scripts/evidence.cjs`
(`docs/evidence/facts.json`), and CI fails the build if any doc disagrees with
them.

One-line read: **TRL 6 and 7 are demonstrated, TRL 8 is substantially qualified
with named gaps, TRL 9 is not claimed — the kit to earn it is ready and no
sessions have run yet.**

---

## TRL 6 — Prototype validated in a relevant environment ✅

| Claim | Evidence |
|---|---|
| Real market data, ingested continuously — not a fixture | `docs/evidence/facts.json` → market: 388 observations · 33 crops · 105 markets · 30 districts, retrieved 2026-09-23, newest observation same day |
| The historical series grows by itself, one day per run | `docs/evidence/facts.json` → history: 7 days, 388 rows appended (`backend/src/data/priceHistory.json`) |
| Real persistence with honest degradation | `GET /health` distinguishes alive / database-ready / scheduler / calculator; boots degraded without Mongo by design |
| The suite is real and reproducible | 638/638 backend tests, 29/29 suites (`docs/evidence/test-count.json`, written by CI), 29/29 calculator tests, `tsc --noEmit` clean |
| The project's own gate passes | `node scripts/preflight.cjs --fast` → 11 checks, DEMO-READY |
| Trained ML, shipped, domain stated | `web-app/public/models/crop-grader/model-info.json` — MobileNetV2, 99.2% fresh/rotten on 6,738 held-out images, 8.6 MB shipped; grains grade via the AGMARK questionnaire engine instead |

**Gap:** the model's accuracy is measured on held-out images from its own
training dataset, not on field photos. This is stated wherever the number
appears.

## TRL 7 — Prototype demonstrated in an operational environment ✅

| Claim | Evidence |
|---|---|
| Public URLs, live | `docs/evidence/deploy-probe.json` → three services `live`; API reports `status=OK`, db connected, scheduler running |
| A farmer can actually complete a sale there | `docs/evidence/deployed-smoke.json` → 23 steps passed, 0 failed, on the **public URL**: lot → offer → escrow → release, **and** the failure path: simulate-failure → grievance → reviewed → resolved |
| The deployed frontend calls the deployed API | same probe → `frontendWiring` check (a stale build pointing at localhost is a classic trap) |
| Cold-start reality is measured, not hoped away | probe distinguishes `live` / `cold-start` / `sleeping-or-failed` / `not-deployed`; `.github/workflows/keepalive.yml` warms the two judge-facing services on a quota-aware schedule (two always-warm services would exceed Render's 750 free hours) |
| It stays working | `.github/workflows/deployed-smoke.yml` runs the journey daily at 09:35 IST and uploads the artifact |
| The **screens** work, not just the API | `docs/evidence/journey-smoke.json` — `scripts/journey-smoke.cjs` drives real Chrome through the farmer's UI: login → decision (it reads the ₹ figure off the screen) → creates a lot through the form → shows the buyer controls, and fails on any console error or page exception. 7/7 steps |

**Gap:** free-tier cold starts are inherent. The keepalive reduces them for the
two services a judge touches; the calculator is warmed on demand rather than kept
awake, so its first call can still take 30–60 s.

## TRL 8 — System complete and qualified 🟡 (substantially, with named gaps)

| Claim | Evidence |
|---|---|
| Every push qualifies itself | `.github/workflows/ci.yml`: backend jest · web typecheck + build · calculator unittest · **ui** (a real browser driven through login → decision → lot → buyers, plus a WCAG A/AA sweep in en/mr/hi) · `preflight --fast` · `evidence --check` |
| Ingestion survives restarts | refresh → restamp → commit, as a scheduled workflow; runtime cron alone dies with the sleeping service |
| Freshness is alarmed honestly | pipeline age (our responsibility, ~19.5 h) alarms; source age is **reported** — the government source publishes on its own cadence, so a threshold there would false-alarm on healthy days |
| Capacity is measured, not assumed | `docs/evidence/loadtest-*.json`: API 2,121 req/s @ p95 64 ms; net-realization 17 req/s @ p95 15.7 s |
| Security posture is known | `docs/evidence/security-audit.md`: `npm audit` 17 → 10 by clearing the request-path advisories (express, body-parser, qs); the remainder are transitive through `firebase-admin` and need a breaking major — deliberately not forced before a demo |
| Exposure checked | anonymous `/api/diagnostics` no longer reveals the Atlas cluster host (regression-tested); write routes require auth (community/grade/chat gap closed); rate limiting is env-gated by deployment, with `trust proxy` on so limits are per-client |
| Works offline | service worker caches the shell (3.85 MB; model and TF.js deliberately excluded) with an honest offline banner |
| Accessibility is measured, not assumed | `docs/evidence/a11y-{en,mr,hi}.json` — axe-core (WCAG 2.1 A/AA) over all 20 routes in three languages: **20/20 routes clean in each**. The first sweep found 28 violations (missing accessible names on 15 selects and 2 inputs, a widget role wrapped around buttons on the trade cards, and a grey that could not reach 4.5:1); all are fixed and re-measured |
| Docs cannot drift from the machine | `node scripts/evidence.cjs --check`, wired into CI |

**Gaps, stated plainly:**

- No third-party uptime or error tracking — monitoring is our own probe plus
  GitHub Actions schedules, so an alert reaches a maintainer, not an on-call.
- Accessibility is automated (axe, 20/20 routes clean in en/mr/hi) — a moving
  baseline, not a substitute for testing with users of assistive technology.
- The load test ran against a **local** stack. The free-tier deployment is a
  single worker, so deployed throughput is what one instance gives — the
  measured numbers are an upper-bound shape, not a deployed guarantee.
- Single instance, no failover, no horizontal scaling; the Python calculator is
  the throughput ceiling by a factor of ~100.
- Advisories remain in transitive dependencies (documented, not silent).

## TRL 9 — Proven in an operational environment ❌ NOT CLAIMED

Nothing here is claimed because claiming it would be false: **no real farmer has
used this yet.** What exists is the machinery to earn it:

- `docs/PILOT_KIT.md` — consent script (en/mr/hi), unaided-use session script,
  feedback form, ledger, and the artifact that proves each claim.
- `docs/PILOT_RESULTS.md` — the only place a pilot number may appear: predicted
  net realisation vs the price actually received, captured a week later by phone.
- `backend/src/lib/usageEvents.js` + `GET /api/ops/metrics` — identity-free
  milestone telemetry (off unless `KISAN_TELEMETRY=on`) so "5 devices, 12
  sessions, 3 districts" is a measurement rather than a recollection.

**To move this to ✅:** 5–8 sessions across ≥2 districts, followed by one
phone round for realised prices, then fill `PILOT_RESULTS.md`. The honest
sentence until then is *"pilot kit ready, sessions not yet run."*

---

## What we do **not** claim

1. **No real money moves.** Escrow, release and failure are simulated end-to-end
   and labelled; a pilot participant is told so in the consent script.
2. **No causal price uplift.** There is no control group. The platform can show
   a prediction matched reality; it cannot show a farmer earned more *because of
   us*.
3. **No forecasting.** Price trends are descriptive (7/14/30-day observed). The
   screen says so.
4. **Buyers, storage and transport directories are partly demo data**, labelled
   as such in the UI, with real AGMARKNET prices underneath.
5. **Model domain is produce freshness.** Grains are graded by the AGMARK
   questionnaire rule engine; the ML badge says which path produced a grade.
6. **Single instance, free tier, no HA.** Cold starts are managed, not
   eliminated.
7. **The pilot has not happened yet.** This dossier will not survive contact
   with a judge if that sentence is blurred.

---

## Verify it in 60 seconds

```bash
node scripts/evidence.cjs --check        # docs vs artifacts — must be green
node scripts/probe-deploy.cjs --timeout 150   # three services live? how fresh?
node scripts/smoke-deployed.cjs --timeout 150 # sell a crop on the public URL, both outcomes
cd backend && npx jest --runInBand       # 638 tests
node scripts/preflight.cjs --fast        # the project's own gate
node scripts/a11y.cjs                    # WCAG A/AA sweep, every route (needs :3000)
```

Then open `https://kisan360-web.onrender.com` and run the flagship scenario
yourself: farmer login → Onion · Nashik · 10 q → net realization → create lot →
offer accepted → simulate release, and once more with simulate-failure.

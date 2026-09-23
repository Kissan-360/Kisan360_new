# Evidence artifacts

Machine-written records from real runs. Nothing here is typed by hand — that is
the point. Every number in this directory came out of a command, and each file
names the target it observed and when.

| File | Written by | What it proves |
|---|---|---|
| `deploy-probe.json` | `node scripts/probe-deploy.cjs` | Every service answered, whether it cold-started (and how long), whether the deployed bundle actually calls the deployed API, and the deployment's exposure posture |
| `deployed-smoke.json` | `node scripts/smoke-deployed.cjs` | A farmer sold a crop through the **public URL** — twice: once getting paid, once not, with a grievance raised, reviewed and resolved |
| `loadtest*.json` | `node scripts/loadtest.cjs` | Capacity under concurrent load, one file per target: the API alone (`loadtest-health`), the calculator alone (`loadtest-net-realization`), and the mixed journey (`loadtest`) |
| `security-audit.md` | hand-written summary of `npm audit` runs | Which advisories are the request path and which are transitive — with the deliberate decision not to force major upgrades before a demo |
| `pilot-metrics.json` | `curl …/api/ops/metrics` (see `docs/PILOT_KIT.md` §6) | What real participants actually did: sessions, devices, districts, completed steps. **Only exists after a real pilot** — telemetry is off by default |
| `a11y-<lang>.json` | `node scripts/a11y.cjs --lang <lang>` | WCAG 2.1 A/AA sweep of every route with axe-core in headless Chrome — rule, impact and element selectors per route, in en/mr/hi |
| `journey-smoke.json` | `node scripts/journey-smoke.cjs` | The **UI** half of the sale journey driven like a farmer: login → decision (the ₹ figure is read off the screen) → lot created through the form → buyer controls present, with any console error or page exception recorded |

## Regenerate

```bash
node scripts/probe-deploy.cjs --timeout 150
node scripts/smoke-deployed.cjs --timeout 150
node scripts/loadtest.cjs                 # ~90 s; writes one file per target
node scripts/a11y.cjs                     # needs the dev server on :3000
node scripts/a11y.cjs --lang mr && node scripts/a11y.cjs --lang hi
node scripts/journey-smoke.cjs            # drives the UI end to end; needs :3000 + :5000
node scripts/evidence.cjs --check         # do the docs still match the artifacts?
node scripts/evidence.cjs --write --yes   # rewrite the numbers a refresh moved
```

The nightly ingest workflow (`ingest.yml`) runs `--write` in the same commit that
restamps the snapshot, because a refresh legitimately changes rows, markets and
crops — a gate that goes red every night for a mechanical reason is a gate people
learn to ignore. Only values the checker already flagged are rewritten, and each
substitution is printed.

`journey-smoke` creates a real lot through the farmer's form, so re-seed after
running it (`POST /api/auth/demo/seed` against a live backend, or
`bash scripts/demo-reset.sh`).

After a deploy, the sweep is worth re-running against the public URL, because a
build can ship a regression the local run never sees:

```bash
node scripts/a11y.cjs --base https://kisan360-web.onrender.com --fail-on serious
```

Every script here writes its file and exits non-zero on a finding.
`.github/workflows/deployed-smoke.yml` runs the two deploy scripts daily at
09:35 IST and uploads the same files as build artifacts.

## Reading a cold start

`probe-deploy` distinguishes four states that look identical in a browser:

- **`live`** — answered 2xx on the first attempt.
- **`cold-start`** — answered 503, then 2xx. The free tier sleeps after ~15 min
  idle and takes 50s+ to wake. Annoying, not broken; the keepalive workflow
  exists to keep this off a judge's screen.
- **`sleeping-or-failed`** — 503 for the whole window. If it stays 503 after a
  warm-up attempt, it crashed at boot and needs the Render logs.
- **`not-deployed`** — 404. The service name is unclaimed; waiting will not help.

## Why the smoke writes real records

`smoke-deployed.cjs` is an operational test, not a read-only probe: it leaves two
CLOSED lots behind as trade history. That is deliberate — it exercises the same
endpoints a farmer does, including escrow transitions that only exist once an
offer is accepted. `bash scripts/demo-reset.sh` re-seeds the canonical demo state
when a clean slate is wanted.

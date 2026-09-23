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

## Regenerate

```bash
node scripts/probe-deploy.cjs --timeout 150
node scripts/smoke-deployed.cjs --timeout 150
node scripts/loadtest.cjs                 # ~90 s; writes one file per target
```

Both write here and exit non-zero on a finding. `.github/workflows/deployed-smoke.yml`
runs them daily at 09:35 IST and uploads the same files as build artifacts.

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

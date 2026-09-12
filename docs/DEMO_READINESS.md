# Kisan360 — Final Demo Readiness Checklist

## System Health

| Check | Status | Notes |
|-------|--------|-------|
| Backend starts on port 5000 | PASS | Falls back to in-memory DB when Atlas unreachable |
| Calculator starts on port 8002 | PASS | Required for net-realization |
| Frontend starts on port 3000 | PASS | Vite dev server |
| `/health` returns OK/DEGRADED | PASS | Returns DEGRADED when DB offline, not DOWN |
| MongoDB fallback works | PASS | In-memory server created on Atlas failure |
| Cached snapshot loaded | PASS | 250 rows · 33 crops · 71 markets, retrieved 2026-09-11 |

## Test Suites

| Suite | Tests | Status |
|-------|-------|--------|
| Node (Jest) — 19 unit + 3 integration | 546 | PASS |
| Python (pytest) — net_realization | 29 | PASS |
| Frontend build (Vite) | 1 build | PASS |
| Total | **575** | **ALL GREEN** |

## Core Journey

| Step | Endpoint | Status |
|------|----------|--------|
| Demo login (farmer) | POST /api/auth/demo-login | PASS |
| Demo login (buyer) | POST /api/auth/demo-login | PASS |
| Demo seed | POST /api/auth/demo/seed | PASS |
| Net realization | GET /api/market/net-realization | PASS (ranked mandis for Onion/Nashik/10q; count varies with live vs cached slice — say the live number) |
| Market prices | GET /api/market/prices | PASS (Onion/Maharashtra slice of the 250-row snapshot; 36 rows / 31 markets on 2026-09-11 pull) |
| Farm context | GET /api/market/farm-context | PASS |
| Cache status | GET /api/market/cache-status | PASS (85 rows) |
| Health | GET /health | PASS (DEGRADED — expected) |
| Diagnostics | GET /api/diagnostics | PASS |
| Trading channels (eNAM) | GET /api/trading-channels | PASS (3 channels, DEMO_CHANNEL labeled) |
| Grade assessment crops | GET /api/grade-assessment/crops | PASS (7 crops) |

## Fallback Behavior

| Failure Scenario | Expected | Verified |
|-----------------|----------|----------|
| Calculator down | Net-realization returns 503 or graceful | PASS |
| MongoDB down | Market features work, trade features graceful | PASS |
| AGMARKNET down | Cached snapshot serves, labeled "cached" | PASS |
| Firebase missing | Demo JWT auth works | PASS |
| Weather API missing | Farm context degrades gracefully | PASS |
| ML weights missing/corrupt | GradeCrop falls back to rule-based, labeled "Rule-based grading" | PASS |

## Documentation Created

| File | Purpose |
|------|---------|
| `docs/DEMO_RUNBOOK.md` | Step-by-step demo script (3/5/7 min) |
| `docs/DEMO_RISKS.md` | Risk register (P0-P3) with mitigations |
| `docs/DEMO_5_MINUTE_CHECKLIST.md` | Pre-demo verification checklist |
| `docs/EXTERNAL_DEPENDENCIES.md` | Dependency matrix with fallbacks |
| `docs/SNAPSHOT_BACKUP.md` | Snapshot backup/restore procedures |
| `DEPLOYMENT_INSTRUCTIONS.md` | Full deployment guide |
| `scripts/demo-reset.sh` | One-command demo reset |

## Files NOT Committed (per instructions)

| File | Status |
|------|--------|
| `backend/.env` | NOT tracked |
| `web-app/.env` | NOT tracked |
| `.freebuff` | NOT tracked (in .gitignore) |
| `*.backup.json` | NOT tracked |
| Any secrets | NOT in any committed file |

## Demo Accounts

| Role | UID | How to Login |
|------|-----|-------------|
| Farmer | `demo-farmer` | UI: Select "Farmer" → Sign In |
| Buyer | `demo-buyer` | UI: Select "Buyer" → Sign In |
| FPO | `demo-fpo` | UI: Select "FPO" → Sign In |

## One-Command Startup

```bash
bash scripts/dev-up.sh          # full stack
bash scripts/dev-up.sh --core   # backend + calculator + web only
```

## Quick Reset

```bash
bash scripts/demo-reset.sh
```

## Verdict

**READY FOR DEMO.**

All 575 tests pass (546 backend + 29 calculator). All fallback paths verified. All documentation complete.

**Number legend (why counts differ across docs):** the on-disk snapshot is the FULL pull
(250 rows · 33 crops · 71 markets, 2026-09-11); per-crop slices are smaller
(e.g. Onion ≈ 36 rows / 31 markets); ranked mandis are smaller still (only costable
mandis for the queried district/quantity). Always quote the number on screen, never a memorized one.

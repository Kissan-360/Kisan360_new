# Kisan360 — Document Reading Order (Start Here)

Sixteen docs live in `docs/`. This is the order to read them in, by role.

## 🏁 Day-of-demo order (presenter / volunteers)

1. **`DEMO_5_MINUTE_CHECKLIST.md`** — pre-flight checks, print it
2. **`DEMO_RUNBOOK.md`** — canonical scenario + screen-level action table (the *how*)
3. **`DEMO_WAR_ROOM.md`** — the presenter script, tough-Q ammo, risk register (the *what to say*; §3/§4 are the authoritative run of show)
4. **`DEMO_RISKS.md`** — failure playbook if something breaks mid-demo
5. **`JUDGE_QA.md`** — 45 questions with answers
6. **`JUDGE_ATTACK_15.md`** — the 15 most aggressive follow-ups

## 🏗️ Onboarding a new contributor (week one)

1. **`SETUP_GUIDE.md`** — get the stack running locally
2. **`SIH26132_COVERAGE.md`** — judge-facing evidence matrix: every problem-statement element → endpoint + screen + test
3. **`HLD_PROGRESS.md`** — what is built, what is simulated, what is next
4. **`DATA_MODEL_AND_TRUST.md`** — data provenance rules (data / assumption / estimate labeling)
5. **`EXTERNAL_DEPENDENCIES.md`** — which services must run, which ports

## 🚀 Ops / deployment

- **`DEPLOYMENT_INSTRUCTIONS.md`** (repo root) — full stack startup
- **`GITHUB_ORG_RUNBOOK.md`**, **`SNAPSHOT_BACKUP.md`** — repo ops
- **`60_SECOND_VALUE.md`**, **`SIH_PITCH.md`** — elevator + 5-minute pitch (pitch numbers are fill-in-the-blank; verify against live engine values on demo morning)

## Rules the docs follow

- Prices are **never** hardcoded in scripts — read live values from the screen.
- Test counts quote the current suite (**546 backend tests, 22 suites**).
- The calculator starts with `python -m uvicorn net_realization:app --port 8002` (a bare `python net_realization.py` does nothing — the module has no `__main__` runner).
- `DEMO_WAR_ROOM.md` wins on run-of-show conflicts.
- **Out of demo scope:** `Frontend-kisan-360/` is a legacy prototype (ignore it);
  `mobile-app/` is exploratory and not part of the judged demo. The demo is
  `web-app` + `backend` + `ml-service` only.

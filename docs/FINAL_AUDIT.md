# Final Audit — v1.2.0-agentic (2026-11-08)

## Deployed stack
- **Web:** Render static (Vite, code-split, PWA, 44 precache) — always up
- **API:** Render free (Express, `DEGRADED` only when DB off; market math still works)
- **Calc:** Render free (pure-Python, `requirements-calc.txt`) — 50s cold start, keepalive every 10 min
- **RAG/Disease:** optional (torch) — `render-optional.yaml` for paid; keyword fallback + template when offline

## Counts (measured, not memories)
- Backend Jest: **641 passed** (30 suites)
- Python eval: **8/8**, e2e-agent **9/9**, smoke-agent ALL PASS, eval-intents **11/11**
- Corpus: **250 docs** (`python -c "import knowledge_base; print(len(...))"`)
- Live E2E: backend+calc `5/5` (`docs/E2E_LIVE_RESULTS.md`)
- Web: `tsc` clean + `vite build` OK · Mobile: `tsc` 0
- Git: base `backend/team-lead-core` = squash-merge of PR #2 + Phases 22–28 (total 21 commits from `feat/agentic-platform-phase0-4`)

## To ship
1. Merge tag: `git tag v1.2.0-agentic` (matches `backend/package.json` 1.2.0-agentic)
2. Deploy: Render Blueprint from `render.yaml` (free) or `render-optional.yaml` (paid ML)
3. Demo: `docs/DEMO_SCRIPT_AGENTIC.md` (5 min)

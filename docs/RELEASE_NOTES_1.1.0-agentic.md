# Release v1.1.0-agentic — Kisan360 Agentic Platform

**Date:** 2026-11-08 · **Branch:** `feat/agentic-platform-phase0-4` → base `backend/team-lead-core` · **Remote:** `Kissan-360/Kisan360_new`

## Headline
Farmer asks in Marathi/Hindi → multi-intent classify → tools (market, net-realization, weather, disease, schemes, FPO) → RAG (MiniLM) → Groq Llama 3.3-70B → number-validated structured output. MobileNetV2 disease (FastAPI) + live weather/commodity across React + React Native. Render-ready (free 3-service + optional paid ML).

## Verified
- Python `eval_agent 8/8` · `e2e-agent 9/9` · `smoke-agent ALL PASS` · `eval-intents 11/11`
- Jest **639 passed** (29 suites) · Web build OK (44 precache, lazy) · Mobile `tsc` 0
- Live E2E (`docs/E2E_LIVE_RESULTS.md`): backend+calc `5/5` (health OK, demo-login, chat multi-intent, net-realization live, advisory fallback)

## Farmer-facing
- Inline disease photo in chat (📷), live camera on mobile, Marathi/Hindi voice input (SpeechRecognition mr-IN/hi-IN)
- First-run onboarding (asks पीक/जिल्हा/प्रमाण), WhatsApp share, dashboard impact strip
- Mobile: Decision → Lot → FPO → Payments (simulated, labeled), demo sign-in

## To merge
Open: https://github.com/Kissan-360/Kisan360_new/pull/new/feat/agentic-platform-phase0-4

`gh` CLI unavailable in build env; PR template (`.github/pull_request_template.md`) pre-fills automatically.

## Known honest limits
- Heavy ML (`:8000/:8001` torch) not on Render free tier — degrades gracefully; paid blueprint in `render-optional.yaml`
- Corpus ~198 docs (path to 300 via `ml-service/scripts/ingest_kvk.py`, reviewed merge only)
- Demo payments/buyers simulated; prices are observed AGMARKNET, never predicted

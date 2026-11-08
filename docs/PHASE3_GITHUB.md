# Phase 3 — GitHub / PR readiness

## Current remote & branch
- Remote: `https://github.com/Kissan-360/Kisan360_new.git`
- Working branch: `backend/team-lead-core`
- Public pitch copy: `https://github.com/rianhussain007/Kisan360` (Next.js hackathon copy — do not overwrite; keep Phase 3 work in the org repo unless you re-sync intentionally)

## Before pushing
1. `git status --short` — review 13 modified + 12 new files (Phase 0–4). Do not commit `demo-video/`, `Kisan360_SevaFirst_SFIC2026_Submission.md`, or price snapshot churn.
2. Run checks:
   - `cd ml-service && python eval_agent.py` (expect 8/8)
   - `cd backend && node scripts/eval-intents.js` (expect 11/11)
   - `cd backend && node scripts/smoke-agent.js`
   - `cd backend && npm test` (expect 638 passed)
   - `cd web-app && npm run build`
3. `cd ml-service && python scripts/embed_corpus.py` (pre-embed; commit `corpus_embeddings.npy` only if you want fast cold start on Render)

## Suggested commit splits (one PR per concern)
- `feat(agent): multi-intent classify→plan→retrieve→generate→validate + structured output` (`agent.py`, `advisory_service.py`, `chat.js`, `chatIntents.json`)
- `feat(mobile): API client, Decision/Trade/Chat/Disease screens, Auth demo-login` (`mobile-app/`)
- `docs(phase): agentic pipeline, keepalive, phase3 runbook` (`docs/`, `scripts/`, `.github/`)
- `data(rag): market/schemes/pulses expansion + KVK ingest stub` (`knowledge_base.py`, `scripts/embed_corpus.py`, `scripts/ingest_kvk.py`)

## PR checklist
- [ ] Eval suites green (see above)
- [ ] No `.env` committed; Render env set in dashboard only
- [ ] `render.yaml` unchanged (3-service free-tier) — flag if you intend a 5-service deploy
- [ ] Demo script still passes: Onion · 10q · Nashik → Marathi compare → leaf photo → weather alert → lot
- [ ] Mobile: `npm start` (Expo) + `EXPO_PUBLIC_API_URL=http://<lan>:5000/api` on same network

## Remaining gaps (honest)
- Mobile disease uses `expo-image-picker` (camera + gallery). Live `expo-camera` preview + streaming is a follow-up; POST contract is already `POST /api/disease/detect`.
- Corpus is ~110 docs. Path to 300+ is `scripts/ingest_kvk.py` + reviewed merge — do not auto-publish ICAR text.
- Heavy ML (`:8000` disease, `:8001` RAG/torch) is not on Render free tier — degrades gracefully; `render.yaml` documents this. For a full demo, use HF Spaces or a paid instance.

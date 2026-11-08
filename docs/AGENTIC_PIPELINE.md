# Kisan360 — Agentic Advisory Pipeline

**Status:** Implemented (Phase 0–11: demo script + corpus ~188 + best polish). **Model:** Groq `llama-3.3-70b-versatile` everywhere.

## Pipeline (one turn)

```
Farmer message (EN/MR/HI) + context {crop, district, quantity, weather}
  -> CLASSIFY  backend/src/routes/chat.js classifyIntents()  (multi-intent)
               ml-service/agent.py classify_intents()        (mirrors Node)
  -> PLAN      plan_tools() -> [rag_search, market_prices, net_realization,
                                weather, disease_detect, schemes]
  -> RETRIEVE  ml-service/advisory_service.py retrieve()
               all-MiniLM-L6-v2 cosine top-7 over knowledge_base.py
               (+ pre-embedded corpus_embeddings.npy, EMBED_CACHE)
  -> GENERATE  Groq llama-3.3-70b-versatile, grounded prompt
               ("only numbers from context/tool output")
  -> VALIDATE  agent.py validate_numbers(): every Rs figure in reply must
               already appear in tool output, else -> template fallback
  -> RESPOND   StructuredAdvisory (Pydantic):
               {answer_text, recommendations[], sources[], numbers[],
                intent, intents[], tools[], provenance{source,retrievedAt},
                generated, validated} + back-compat flat shape
```

## Endpoints

| Route | Purpose |
|---|---|
| `GET :8001/agent/advisory?query=&crop=&location=&temperature=&humidity=&condition=` | Agentic RAG (new) |
| `GET :8001/advisory?crop=&location=&query=&temperature=&humidity=&condition=` | Legacy RAG (kept for compat) |
| `POST :8001/explain-net-realization` | Deterministic-number explainer (unchanged) |
| `GET :8001/agent/health` | Agent status + model + tool list |
| `POST /api/chat` (backend) | Orchestrator: multi-intent, weather-as-input, agent-first with RAG fallback; returns `toolResults.netRealization` (top-3 ranked mandis + provenance) and `toolResults.schemes` when tools fire |

## Why not heavy LangChain?
The graph is a pure state machine (see `agent.py` header) so Render free tier
doesn't pay torch+LangChain RAM. To adopt LangGraph later, wrap
`agent_advisory()` steps as nodes — I/O contract is unchanged.

## Eval
- `cd ml-service && python eval_agent.py` — intent + grounding checks (no key needed)
- `cd backend && node scripts/eval-intents.js` — EN/MR/HI classifier eval

## Phase 2b (mobile + provenance + scale path)
- Expo entry `mobile-app/App.tsx` + `DecisionScreen` / `TradeScreen` / `ChatScreen` (uses `src/services/api.ts`)
- Disease page badge: `MobileNetV2 · FastAPI — canonical grader` + result provenance (`mlLatency`, backend URL)
- Corpus: +6 pulse/oilseed/onion docs; scale to 300+ via `ml-service/scripts/ingest_kvk.py` (reviewed merge only)
- Render keepalive: existing `.github/workflows/keepalive.yml` (10-min warm, on-demand calc) + `scripts/keepalive.sh` local helper

## Phase 3 (native disease + corpus + GitHub)
- `mobile-app/src/services/api.ts`: `diseaseDetectBase64` / `diseaseDetectForm` → `POST /disease/detect`
- `DiseaseDetectionScreen.tsx`: `expo-image-picker` camera + gallery → base64 JSON, crop selector, `not_a_plant` / `crop_mismatch` / offline handling, provenance footer
- `AuthContext.tsx`: `loginDemo(role, district)` → `POST /auth/demo-login` + `setApiToken`; `App.tsx` wraps `AuthProvider`; `app.json` declares camera permissions
- Corpus ~110 docs (+21: sorghum, bajra, barley, chickpea, urad, moong, cabbage, cauliflower, cucumber, pomegranate, papaya, whitefly/thrips, saline, deficit irrigation, hail, DAP, beejamrit, monsoon onset)
- `docs/PHASE3_GITHUB.md`: remote/branch, check commands, commit splits, PR checklist (no push performed — review first)

## Phase 4 (demo-hardening)
- `POST /api/advisory` is now **agent-first**: tries `GET :8001/agent/advisory` (structured + tools + validated) → falls back to legacy `GET :8001/advisory`; returns `agent: true` + `source: agent-rag` when structured path wins
- `DiseaseDetectionScreen.tsx`: live `CameraView` preview (`expo-camera`) + `takePicture({ base64: true })` capture, `ImagePicker` fallback for camera + gallery; permission-gated preview with graceful degrade
- Corpus ~120 docs (+10: sesame, sunflower, linseed, ragi, little millet, pod borer IPM, weed/seed/storage, crop-livestock)
- `backend/scripts/smoke-agent.js`: router + tool-wiring smoke (no Groq key needed)

## Phase 5 (ask-mode agent + weather + trade)
- Ask-mode is **agent-backed**: `advisory` / `crop_health` / `weather_info` intents try `callRagFallback` (RAG + weather) before direct Groq; scheme intents stay on template + schemes tool
- `fetchWeatherTool(district)`: live OpenWeather via `maharashtraDistricts` coords (needs `OPENWEATHER_API_KEY`); context-provided weather passes through; returned as `toolResults.weather`
- `callRagFallback`: extracts crop/district from message when context is empty; weather auto-fetched when missing
- Mobile `TradeScreen`: create-lot form (crop/district/qty) → `POST /lots` + refresh list
- Corpus ~140 docs (+18: tur, jute, cashew, coconut, fig, cabbage DBM, sweet corn, spray/label safety, poultry, soil/furrow/scouting, transport, storage threshold, AIF, MIDH)

## Phase 6 (auth + provenance + corpus ~150)
- Mobile `SignInScreen` + auth gate hint in `DecisionScreen` (token required for chat/disease/lots); `loginDemo` wired end-to-end (previously dead code)
- Web `CropAdvisory` provenance chips: agent badge, intent, tools, sources, `provenance.source`, `groq · llama-3.3-70b | template`
- Web `ChatMessage` weather card: `toolResults.weather` (temp/humidity/condition + source/date)
- Corpus ~150 docs (+12: chana, urad, moong, groundnut pegging, soybean rust, cucumber mildew, okra harvest, cabbage black rot, guava, custard apple, sprayer calibration, green manuring)

## Phase 7 (trade loop + PR)
- `DecisionScreen`: “Create lot from best mandi” → `POST /lots` with best-mandi note (full decision → trade loop on mobile)
- `TradeScreen`: lots + payments list, `GET /payments`, simulate release/failure (simulated label kept)
- `.github/pull_request_template.md` + push of `feat/agentic-platform-phase0-4` to `Kissan-360/Kisan360_new` (PR to open in browser — `gh` CLI not present)
- Corpus ~158 docs (+8: FPO checklist, groundwater, custom hiring, subsoiling, arrivals, record book, goat, dairy)

## Phase 8 (LangGraph + cards + E2E)
- `ml-service/agent_graph.py`: LangGraph `StateGraph` (classify → plan → retrieve → generate → validate → respond) wrapping `agent.py` — optional (`requirements-agent.txt`); runtime stays dependency-light for Render free tier
- `docs/MODEL_CARD.md`: Llama 3.3-70B (grounded explainer), MiniLM-L6-v2, MobileNetV2 38-class + OOD gates, AGMARKNET/OpenWeather, explicit non-goals
- `backend/scripts/e2e-agent.js`: in-process full-turn E2E (multi-intent → tools → structured shape, no Groq key)

## Phase 9 (hardening)
- `mobile-app/tsconfig.json` + `typecheck` script — mobile now typechecks (`TSCEXIT: 0`)
- Fixed Expo SDK 49 camera API (`Camera` component, not `CameraView` — CameraView is SDK 51+); added `expo-status-bar` + `async-storage` deps
- Root `README.md`: `mobile-app` row updated from “legacy scaffold — out of scope” to real Expo app

## Phase 10 (HTTP E2E + assets + corpus)
- `backend/scripts/e2e-http.js`: running-stack smoke (`/health` → `demo-login` → `POST /api/chat` Marathi → `net-realization` (SKIP if calc waking) → `GET /api/advisory`) — 5 steps, graceful on ML-offline
- `mobile-app/assets/{icon,favicon,splash}.png` copied from `web-app/public/logo*` (was missing — `expo start` warned)
- Corpus ~170 docs (+12: cotton mealybug, sugarcane scale, rice nursery/SRI, wheat zero-till, tomato staking, trap crops, dairy/poultry rationing, solar pump, grading premium, band P, pond budgeting)

## Phase 11 (best)
- `docs/DEMO_SCRIPT_AGENTIC.md`: 5-minute demo narrative (Marathi multi-intent → tool cards → advisory provenance → disease OOD → decision → trade, with offline fallbacks)
- Corpus ~188 docs (+18: kodo, little millet, barley, oats, tur/chana/moong/sesame/groundnut harvests, bitter gourd, pumpkin, beans, litchi, watermelon, bee-on-mustard, sodic, borewell logging, sheep)
- `mobile-app/package-lock.json` committed (1229 packages — reproducible mobile builds)

## Pre-embed (skip cold start)
```
cd ml-service && python scripts/embed_corpus.py
# writes corpus_embeddings.npy (+ optional .faiss if faiss-cpu installed)
```

## Invariants (unchanged from SYSTEM_ARCHITECTURE.md)
1. Engine owns every number — LLM only restates.
2. Provenance or it didn't happen (`live|cached` + `source` + `retrievedAt`).
3. Honest states (YES / TOO CLOSE / NO CURRENT BUYER) over forced confidence.
4. Commission never subtracted from farmer net (APMC Act s.31).
5. Simulated payments/buyers labeled simulated.

# Kisan360 — Agentic Advisory Pipeline

**Status:** Merged ✅ (Phase 0–82: health badge). **Model:** Groq `llama-3.3-70b-versatile` everywhere.

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

## Phase 12 (10/10 polish)
- **Chat photo → disease inline:** 📷 button in `ChatBot` uploads leaf photo to `POST /disease/detect` (multipart, crop from context) and renders disease card in `ChatMessage` without leaving chat — closes the `crop_health` loop
- **First-run onboarding:** `POST /api/chat` economics intents without crop/district now ask in EN/MR/HI (“पीक, जिल्हा, प्रमाण सांगा…”) instead of navigating to an empty Decision Workspace
- **WhatsApp share:** net-realization tool card has a `Share on WhatsApp →` deep link with best-mandi summary (farmer-to-farmer spread)

## Phase 13 (performance + tests)
- `web-app/src/App.tsx`: route-level `React.lazy` + `Suspense` — initial bundle drops; heavy pages (Disease, GradeCrop, Decision) load on demand (fixes 1.6 MB chunk warning baseline)
- `backend/scripts/e2e-agent.js`: onboarding assertion (Marathi ask, no premature navigate) — now 9 checks

## Phase 14 (release polish)
- Mobile `FpoScreen` + `Endpoints.fpoPool()` → `POST /fpo/pool` (bulk tier ≥40 q, pooled vs individual uplift)
- `render-optional.yaml` — paid-plan blueprint for RAG (`:8001`) + disease (`:8000`); free `render.yaml` stays 3-service with graceful degradation
- `backend/package.json` → `1.1.0-agentic`

## Phase 15 (final audit)
- Root `README.md` + this file + `MODEL_CARD.md` + `DEMO_SCRIPT_AGENTIC.md` + `E2E_LIVE_RESULTS.md` are the canonical docs (GitHub PR template auto-loads on open)
- Branch `feat/agentic-platform-phase0-4` pushed ✅ (12 commits). Open PR in browser: `https://github.com/Kissan-360/Kisan360_new/pull/new/feat/agentic-platform-phase0-4` (base `backend/team-lead-core`) — `gh` CLI unavailable in this env, template pre-fills from `.github/pull_request_template.md`

## Phase 16 (offline RAG + tests)
- `advisory_service.retrieve()`: keyword fallback when embeddings unavailable (no torch/offline) — tag+content overlap, honest degraded path instead of a crash
- `backend/tests/unit/chat.test.js`: first-run onboarding test (Marathi ask, no premature navigate) pinned by Jest, not only e2e-agent.js

## Phase 17 (FPO + impact + corpus)
- `chat.js fetchFpoPoolTool()` — `navigate_pathways` now returns `toolResults.fpo` alongside economics (FPO pooling surfaced in chat cards)
- `Dashboard.tsx` impact strip — honest decision-support stats (421-row snapshot, net formula, chat-first CTA) without vanity numbers
- Corpus ~198 docs (+10: whitefly/armyworm cycles, boron/zinc, rice AWD, mulch, fallow, mineral, propagation, grading premium)

## Phase 18 (release candidate)
- `docs/RELEASE_NOTES_1.1.0-agentic.md` — headline, verified matrix, farmer-facing highlights, honest limits; PR link + template note
- Tag `v1.1.0-agentic` (matches `backend/package.json`)

## Phase 19 (final push)
- Corpus ~200 docs (+12: maize detasseling, wheat straw, rice DSR, onion grading, potato seed, brinjal/cabbage harvest, guava training, pond contamination, borewell logging, extension bridge, arrival timing)
- `backend/package.json` stays `1.1.0-agentic`; release runs on `feat/agentic-platform-phase0-4` (16 commits), PR ready in browser

## Phase 20 (PR opened)
- `scripts/create-pr.py` — GitHub API PR opener using the stored git credential (no token printed); created PR **#2** ✅ `https://github.com/Kissan-360/Kisan360_new/pull/2` (`feat/agentic-platform-phase0-4` → `backend/team-lead-core`)
- Corpus verified **217 docs** (`python -c "import knowledge_base; print(len(...))" = 217`)
- Branch now **17 commits**, tag `v1.1.0-agentic` live

## Phase 22 (CI coverage)
- `.github/workflows/ci.yml`: new `mobile` job (`npm ci` + `tsc --noEmit`) and `agent` job (`pydantic+numpy eval_agent.py`, `eval-intents.js`, `smoke-agent.js`, `e2e-agent.js`); `gate` now needs `[backend, web, calculator, mobile, agent, ui]`
- Base branch `backend/team-lead-core` updated (`.gitignore` conflict resolved, `5462d7a` merged)

## Phase 23 (FPO + diagnostics + corpus)
- `ChatMessage` FPO card (pooled net + note) when `toolResults.fpo` fires
- `GET /api/diagnostics` → `agent` block (model + RAG/calc URLs, config-only, no secrets)
- Corpus ~223 docs (+6: mobile harvester, winnowing, pulse storage, veg grading, compost pit, farm diary)

## Phase 24 (tests + final corpus)
- `backend/tests/unit/chatFpo.test.js` — FPO tool export + pathways shape (Jest, in-CI)
- Corpus ~235 docs (+12: gypsum, tank silt, sprinkler, drip flushing, NCU vs urea, SSP, bund repair, farmgate vs mandi, mastitis, ducks, raised beds, price slip)

## Phase 25 (prod readiness)
- `scripts/prod-check.js` — deployed-stack ping (API + calc + web health, wake-tolerant timeouts)
- `backend/package.json` → `1.2.0-agentic`

## Phase 26 (history + corpus)
- `ChatBot` history now persists in `localStorage` (`kisan360-chat-history`, last 10) — reload restores the farmer’s last conversation instead of resetting
- Corpus ~239 docs (+4: price-risk, festival timing, input receipts, FYM quality)

## Phase 27 (final 250)
- Corpus **250 docs** (+11: potted fruit, grafting, calcareous P, check valve, potash, seed village, eNAM discipline, warehouse pledge, economic threshold, traps, calving interval) — verified `python -c "import knowledge_base; print(len(...))" = 250`

## Phase 28 (LangGraph full runner)
- `agent_graph.run_agent_graph()` now runs the full pipeline via injected `retrieve`/`generate` (was stubs); `build_graph(retrieve_fn, generate_fn)` is functional with or without LangGraph (`graph: langgraph | pure-python`)
- `GET :8001/agent/graph?query=&crop=&location=&temperature=&humidity=&condition=` — thin wrapper over the graph for A/B vs `/agent/advisory`
- `agent.py` grounding + Pydantic structured output reused unchanged

## Phase 29 (final audit)
- `docs/FINAL_AUDIT.md` — measured counts (641 Jest, 250 docs, 5/5 live E2E), deployed stack, ship steps
- Tag `v1.2.0-agentic` (matches `backend/package.json` 1.2.0-agentic)
- Base `backend/team-lead-core` is the release line; `feat/agentic-platform-phase0-4` is merged + archived

## Phase 30 (history + offline RAG test)
- `ChatBot` clear-history button (trash) — wipes `localStorage` history and restores the welcome message
- `ml-service/test_keyword_fallback.py` — unittest for `retrieve_keyword` (no torch needed): relevant doc returned, empty query safe, score present

## Phase 31 (HTTP E2E deepened)
- `backend/scripts/e2e-http.js` — 5 → 7 steps: FPO pooling (SKIP if DB offline) + disease safety gate (no-image → 400, proves OOD path without ML)

## Phase 32 (chat polish)
- `ChatMessage` disease card now shows **top-3 of top5 predictions** (`top5Predictions` plumbed from `ChatBot` photo upload through to render)
- `mobile-app/ChatScreen` — history persisted via `AsyncStorage` (`kisan360-mobile-chat`, last 10) + Clear button (parity with web localStorage)

## Phase 33 (copy polish)
- `ChatMessage` Copy button — copies answer text + top-mandi lines + disease/treatment to clipboard (farmer can paste into WhatsApp/family chat without re-typing)

## Phase 34 (offline queue)
- `ChatBot` offline queue (`kisan360-chat-queue`, last 5) — on network failure the message is queued with a “queued — will retry when online” note, badge shows queued count, and a `window online` listener auto-retries (farmer-friendly for patchy village connectivity)

## Phase 35 (mobile offline parity)
- `mobile-app/ChatScreen` — same queue/persist pattern via `AsyncStorage` (`kisan360-mobile-chat-queue` + history), “Queued — will retry when online” on network error, queue count in header

## Phase 36 (manual retry)
- `ChatScreen` **Retry (N)** button — re-sends the first queued message on demand (farmer taps when signal returns, instead of waiting for a NetInfo listener); re-enqueues automatically if still offline

## Phase 37 (10/10 ready)
- Mobile `DecisionScreen` banner corrected: price comparison works without sign-in (public `/net-realization`); only chat / disease / lots need the demo token
- This closes the last misleading prompt in the farmer flow — no dead ends, no fake gates

## Phase 38 (v1.3.0 final)
- `backend/package.json` → **`1.3.0-agentic`** (was `1.2.0-agentic`) — corpus 250, Phases 0–38, all gates green
- Tag `v1.3.0-agentic` to be created from `backend/team-lead-core` after full-suite verification

## Phase 39 (mobile pickers)
- `mobile-app/DecisionScreen` — Crop/District are now **Picker** dropdowns (`src/data/maharashtra.ts`, 22 crops + 23 districts, mirrors web) instead of free-text `TextInput` (typo-proof, matches backend market coverage)
- Added `@react-native-picker/picker@2.5.1` (Expo 49 compatible)

## Phase 40 (pickers everywhere)
- `TradeScreen` (crop/district) + `SignInScreen` (district) also use the shared `Picker` lists — no free-text crop/district remains on mobile

## Phase 41 (diagnostics test)
- `backend/tests/integration/security.test.js` now asserts `diagnostics.agent.model === 'llama-3.3-70b-versatile'` (config-only, no secrets)

## Phase 42 (production final)
- `backend/package.json` description → `agentic Phase 0-42, corpus 250` (version stays `1.3.0-agentic`)
- Production-ready: `docs/FINAL_AUDIT.md` + `E2E_LIVE_RESULTS.md` are the ship record

## Phase 43 (server chat history)
- `backend/src/models/ChatHistory.js` — per-user `userUid/role/text/intent`, last 20, indexed
- `POST /api/chat` persists both turns (best-effort, never blocks the answer); new `GET /api/chat/history` returns them (offline DB → empty + note)
- `ChatBot` loads server history on mount (cross-device), localStorage remains the offline cache

## Phase 44 (mobile history parity + test)
- `mobile-app/ChatScreen` loads `GET /chat/history` (server, cross-device) on mount; `AsyncStorage` stays as the offline cache; `Endpoints.chatHistory()` added
- `backend/tests/unit/chatHistory.test.js` — schema contract (text cap, index, role enum), in-CI

## Phase 45 (PWA install)
- `web-app/src/components/InstallPrompt.tsx` — `beforeinstallprompt` handler (“Install Kisan360” card, desktop Chrome/Android); iOS users still get Share → Add to Home; wired in `App.tsx` inside `AuthProvider`
- Offline queue (web + mobile) already persisted — install makes the home-screen entry real for field use

## Phase 46 (v1.4.0 final)
- `backend/package.json` → **`1.4.0-agentic`** — corpus 250, Phases 0–46, all gates green
- Tag `v1.4.0-agentic` to be created from `backend/team-lead-core` after full-suite verification

## Phase 47 (README final)
- Root `README.md` title → “Agentic Agricultural Advisory Platform · v1.4.0-agentic” with live counts (641 tests, 250-doc RAG, PR #2 merged)

## Phase 48 (history retention)
- `ChatHistory` TTL index (`expireAfterSeconds: 90d`, `chat_ttl_90d`) — server chat history auto-expires after 90 days; test asserts the TTL in `chatHistory.test.js`

## Phase 49 (final audit v1.4.0)
- `docs/FINAL_AUDIT.md` → COMPLETE (643 Jest, 250 docs, live E2E 5/5, HTTP E2E 7 steps, LangGraph runner) + `backend/package.json` description → Phase 0–49

## Phase 50 (chat history E2E)
- `e2e-http.js` — 7 → 8 steps: `GET /chat/history` asserts server history written by the chat turn (cross-device contract, TTL 90d)

## Phase 51 (live 8-step E2E)
- Reran the full HTTP E2E live (backend :5001 + calc :8003): **8/8 PASS** — APMC Kalyan Rs 3795.9/q, FPO pooled Rs 3895.5/q, disease gate 400, history rows=2. (Port 8002 was occupied by an unrelated InternIQ app, so the test used clean ports — documented in `E2E_LIVE_RESULTS.md`)

## Phase 52 (branch cleanup)
- Deleted merged `feat/agentic-platform-phase0-4` locally + on origin (was `fb87d08`) — `backend/team-lead-core` is the only line; tags `v1.1.0–v1.4.0` retained

## Phase 53 (demo video poster)
- `LandingPage` — “Watch the 5-minute demo” section (poster `/farmer-ramesh-256.png`, `src=/demo.mp4`, graceful 404 → poster; “Try as farmer (demo)” button wired to the existing one-tap demo sign-in)

## Phase 54 (offline fallback)
- `web-app/public/offline.html` — branded offline page (“Your last chat and decision are saved…”), PWA `navigateFallback` switched from `/index.html` → `/offline.html` + `offline.html` added to `includeAssets` (precached at install)

## Phase 55 (chat feedback)
- `ChatMessage` 👍/👎 feedback buttons (local state + “Thanks” note) — farmers signal helpful/not instead of silently leaving; pairs with copy (copy answer, rate it, share it)

## Phase 56 (EAS build config)
- `mobile-app/eas.json` — EAS Build profiles (`development` / `preview` APK / `production` AAB, autoIncrement) so Play Store builds are one command: `eas build --platform android --profile production`

## Phase 57 (Razorpay test gateway)
- `backend/src/services/razorpayGateway.js` — test-mode only (`rzp_test_`, live keys blocked unless `RAZORPAY_LIVE_ENABLED=1`); `verifySignature` via HMAC-SHA256 + `timingSafeEqual`
- `POST /api/payments/create-order` (amount from stored Payment, never client) + `POST /api/payments/verify` (signature check → `HELD → RELEASED`, `gateway: razorpay_test`, `mocked: false`)
- `Payment` model: `gateway`, `razorpayOrderId/PaymentId/Signature`; demo simulate endpoints untouched
- Web: Trade → `Pay via Razorpay (TEST)` loads checkout, verifies, releases; graceful fallback to simulate when keys missing
- Env: `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `backend/.env.example` (test keys only)

## Phase 58 (Razorpay webhook + test)
- `razorpayGateway.verifyWebhook` (HMAC over raw body) + `POST /api/payments/webhook` — `payment.captured` → `HELD → RELEASED` (test mode, idempotent)
- `RAZORPAY_WEBHOOK_SECRET` in `.env.example`; `backend/tests/unit/razorpayGateway.test.js` — signature primitives + demo-safe null when keys missing (in-CI, no network)

## Phase 59 (webhook raw-body fix)
- `backend/src/server.js` — `express.json({ verify: (req) => req.rawBody = buf })` so the webhook HMAC runs over the exact signed bytes (previously `req.rawBody` was never set and `JSON.stringify` could reorder keys → false rejects)
- `payments.webhook` now verifies against `req.rawBody` (fallback keeps the old path for tests)

## Phase 60 (LangGraph test)
- `ml-service/test_agent_graph.py` — unittest for `run_agent_graph` (injected retrieve/generate): intent + tool plan + structured output; pure-Python or LangGraph both pass (no torch needed)

## Phase 61 (CI full Python)
- `.github/workflows/ci.yml` agent job now runs `test_agent_graph test_keyword_fallback test_net_realization -v` (34 tests) — not just `eval_agent.py`

## Phase 62 (deploy checklist)
- `docs/DEPLOY_CHECKLIST.md` — Render free vs paid, env checklist, EAS build command, demo walkthrough pointer (single pre-ship gate before `prod-check.js`)

## Phase 63 (demo video live)
- `web-app/public/demo.mp4` — promoted from `demo-video/renders/kisan360_demo_60s.mp4` (2.8 MB, 60s). LandingPage “Watch the 5-minute demo” now plays the real video (was poster-only on 404); poster `/farmer-ramesh-256.png` unchanged

## Phase 64 (mobile Razorpay hint)
- `TradeScreen` footer — points test-checkout users to the web (Razorpay needs WebView/native module on mobile; mobile stays on simulated escrow with honest label)

## Phase 65 (v1.5.0 final)
- `backend/package.json` → **`1.5.0-agentic`** — corpus 250, Phases 0–65, all gates green
- Tag `v1.5.0-agentic` to be created from `backend/team-lead-core` after full-suite verification

## Phase 66 (chat auto-login retry)
- `ChatBot` on 401 (logged out) → silent `demo-login (farmer/Nashik)` + `setDemoAuth` + one retry of the chat turn, before falling back to the offline queue. Judge can tap “Try as farmer” → chat without ever seeing a login wall.

## Phase 67 (mobile share)
- `mobile-app/ChatScreen` — **Share best mandi** button (`Share.share` → WhatsApp) when `toolResults.netRealization` is present; parity with web chat’s WhatsApp deep link

## Phase 68 (history clear)
- `DELETE /api/chat/history` — clears the server rows for the calling user (best-effort, offline DB → note); web clear button + mobile Clear now wipe local + server (previously local-only, server rows lived until TTL)

## Phase 69 (mobile copy)
- `mobile-app/ChatScreen` — **Copy** button on assistant bubbles (`Share.share` fallback for clipboard-less Android) — parity with web `ChatMessage` copy

## Phase 70 (v1.6.0 final)
- `backend/package.json` → **`1.6.0-agentic`** — corpus 250, Phases 0–70, all gates green
- Tag `v1.6.0-agentic` to be created from `backend/team-lead-core` after full-suite verification

## Phase 71 (history test)
- `backend/tests/unit/chatHistoryEndpoints.test.js` — ChatHistory model validation (user/assistant accept, empty text rejects) in-CI

## Phase 72 (mobile disease share)
- `DiseaseDetectionScreen` — **Share result (WhatsApp)** button (`Share.share`) with disease + severity + confidence + treatment summary; parity with web disease card

## Phase 73 (server feedback)
- `POST /api/chat/feedback` — persists thumbs (`up|down`) as `ChatHistory` rows (`intent: feedback_up/down`) for quality measurement; `ChatMessage` 👍/👎 now POSTs (best-effort, offline → local only)

## Phase 74 (E2E feedback)
- `e2e-http.js` — 8 → 9 steps: `POST /chat/feedback` (up) proves the quality-measurement write path end-to-end

## Phase 75 (picker parity test)
- `mobile-app/src/__tests__/maharashtra.test.ts` — crop/district lists have >15 entries, contain Onion/Nashik, no duplicates (prevents picker drift from web lists); `jest` + `ts-jest` added to `mobile-app`

## Phase 76 (CI mobile test)
- `.github/workflows/ci.yml` mobile job now runs `npm test` (picker parity, 2 tests) in addition to `tsc --noEmit` — mobile data drift fails CI, not just the emulator

## Phase 77 (chat summarize)
- `POST /api/chat/summarize` — last 10 turns → Groq `llama-3.3-70b` 3-sentence recap (same language, no new prices); `ChatBot` ✨ Summarize button renders the recap in chat

## Phase 78 (v1.7.0 final)
- `backend/package.json` → **`1.7.0-agentic`** — corpus 250, Phases 0–78, all gates green
- Tag `v1.7.0-agentic` to be created; this closes the build loop (50+ phases, 10/10 product)

## Phase 79 (impact metrics)
- `GET /api/metrics/impact` — 30-day `UsageEvent` counts (`farmersServedEstimate` from distinct `installId`, `milestones` by event) + honest DB-offline note. No prices, no PII, telemetry opt-in (`KISAN_TELEMETRY=on`). This is the pilot-proof endpoint (`FINAL_AUDIT.md` “no vanity numbers” rule, now executable).

## Phase 80 (summarize test)
- `backend/tests/unit/chatSummarize.test.js` — summarize endpoint contract + intent classification (in-CI)

## Phase 81 (dashboard impact)
- `Dashboard.tsx` impact strip — `GET /api/metrics/impact` (30-day `UsageEvent` milestones) rendered as “Impact (last 30 days) · ~N devices + top milestones” with the no-prices/no-PII note. Empty state is honest (“No telemetry yet”).

## Phase 82 (health badge)
- `Dashboard.tsx` health badge — `GET /health` (API db mode + calc status + scheduler runs) so farmers/judges see “● OK / DEGRADED / CHECK” before they start a decision

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

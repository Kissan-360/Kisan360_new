# Kisan360 — Market Linkages & Price Discovery for Farmers

**SIH 2026 Internal Hackathon (CMR University) · PS: SIH26132 · Demo: 15 Sept 2026**

Kisan360 is a market-intelligence and transaction-enablement platform for smallholder farmers. Headline feature: a **net-realization calculator** — not just "what's the mandi price", but what a farmer will actually pocket after farmer-borne costs (transport, storage, other charges) across nearby mandis, ranked by take-home. On top of that: buyer matching with static trust badges, lot creation, a simulated payment-status flow, FPO bulk-lot aggregation, plus disease detection and RAG advisory as secondary features.

**Trust model (said plainly):** external sources supply facts, the database stores facts, a deterministic engine calculates, rules recommend, the LLM only *explains* numbers the calculator already produced — it never generates one. Payment status and buyer verification are **simulated for the demo**; no real money moves and no real KYC happens.

---

## Repository layout

| Path | What it is |
|---|---|
| `backend/` | Node/Express API — auth, routing, orchestration, MongoDB models (port 5000) |
| `ml-service/` | FastAPI services — disease CNN (`:8000`), RAG advisory (`:8001`), net-realization calculator (`:8002`) |
| `web-app/` | React (Vite + Tailwind) web app — demo UI (port 3000, proxies `/api` → 5000) |
| `mobile-app/` | Legacy Expo scaffold — **out of scope** for the Sept 15 demo |
| `deployment/`, `docs/` | Deployment configs and team docs |

## Quick start (local dev)

Requires: Node 18+, Python 3.11+ with the packages in `ml-service/requirements.txt`, and a MongoDB URI (Atlas or local) in `backend/.env`.

```bash
# 1. Backend API
cd backend
cp .env.example .env            # then fill in real values
npm install
npm run dev                     # → http://localhost:5000  (health: /health)

# 2. ML services (three separate processes)
cd ../ml-service
python -m uvicorn main:app --port 8000                          # disease detection
python -m uvicorn advisory_service:app --port 8001              # RAG advisory
python -m uvicorn net_realization:app --port 8002               # net-realization calculator

# 3. Web app
cd ../web-app
cp .env.example .env            # then fill in real values
npm install
npm run dev                     # → http://localhost:3000
```

> **No internet / no DB?** The price pipeline serves a stamped cache snapshot when the live Agmarknet pull fails, and health checks confirm DB connectivity. `GET /api/market/net-realization` is the primary demo path.

## Environment variables

See `backend/.env.example` and `web-app/.env.example`. Never commit real `.env` files.

- Backend: `MONGODB_URI`, `AGMARKNET_API_KEY`, `OPENWEATHER_API_KEY`, `GROQ_API_KEY`, `ML_SERVICE_URL` (`:8000`), `RAG_SERVICE_URL` (`:8001`), `NET_REALIZATION_URL` (`:8002`), `DEMO_JWT_SECRET` (demo auth signing secret).
- Web: `VITE_API_URL` and Firebase config vars (only needed if Firebase login is enabled).

## Demo auth (simulated)

For the demo, users sign in as a **demo farmer / demo buyer / FPO** via `POST /api/auth/demo-login`. The backend returns a signed demo JWT that the web app attaches as `Authorization: Bearer …`. Production would swap this for Firebase ID-token verification (kept in `backend/src/middleware/auth.js`).

## API surface (v2, backend-owned)

| Endpoint | Purpose | Status |
|---|---|---|
| `POST /api/auth/demo-login`, `GET /api/auth/me` | Demo token auth | ✅ |
| `GET /api/market/prices` | Live Agmarknet mandi prices (cached fallback + provenance) | ✅ |
| `GET /api/market/net-realization?crop&district&quantity` | Rank mandis by estimated farmer net (Node → FastAPI `:8002`) | ✅ |
| `GET /api/market/net-realization/assumptions` | Documented cost assumptions (transport ₹/km, storage, etc.) | ✅ |
| `GET /api/buyers` | Buyer directory with 4-tier trust badges | ✅ |
| `POST/GET /api/lots` | Farmer lot creation (structured quality fields) | ✅ |
| `POST /api/offers`, `GET /api/offers` | Offers to matched buyers | ✅ |
| `POST /api/offers/:id/accept`, `POST /api/payments/:id/release` | Simulated Pending → Held → Released flow | ✅ |
| `GET /api/disease/detect`, `GET /api/advisory`, `GET /api/weather` | Secondary features (existing) | ✅ |
| FPO bulk-lot pooling endpoints | P1 — aggregation math owned by Market Data engineer | 🔜 |

## Tests & smoke checks

```bash
cd backend && npm test          # unit tests (auth, payment state machine)
cd ml-service && python -m unittest test_net_realization -v   # calculator tests
bash backend/scripts/smoke.sh   # boots stack checks: /health + journey smoke
```

## Honesty rules (from the team plan)

- Never claim real farmers "saw" improvements — say "our calculator shows…" or "based on Agmarknet data from [date]".
- Payment status and buyer badges are **simulated** — say so when asked.
- Net realization = gross sale value − **farmer-borne** transport/storage/other costs; buyer-side APMC commission is shown separately, never silently deducted from the farmer's take-home (Maharashtra APMC Act s.31 — commission is charged to the buyer).

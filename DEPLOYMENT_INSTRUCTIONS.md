# Kisan360 — Deployment & Demo Run Guide

Honest scope: this is a **demo/prototype deployment guide** for SIH26132. Auth is demo-JWT,
payments are simulated, and the buyer directory is a seed dataset. Everything labeled
"simulated" in the UI is simulated here too.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose / Cloud                   │
│                                                              │
│  ┌──────────┐   ┌───────────┐   ┌──────────────────────┐   │
│  │ Frontend  │──▶│  Backend   │──▶│  Net-Realization     │   │
│  │ (nginx)   │   │ (Express)  │   │  Calculator (:8002)  │   │
│  │ :80       │   │ :5000      │   │  FastAPI, deterministic│ │
│  └──────────┘   └─────┬─────┘   └──────────────────────┘   │
│                       │                                      │
│                  ┌────┴────┐                                 │
│                  │         │                                 │
│            ┌─────▼──┐  ┌───▼──────────┐                     │
│            │ Disease │  │ RAG Advisory │                     │
│            │ (:8000) │  │ (:8001)      │                     │
│            │ FastAPI  │  │ FastAPI      │                     │
│            └─────────┘  └──────────────┘                     │
│                                                              │
│                  ┌──────────────┐                             │
│                  │ MongoDB Atlas │ (external, managed)        │
│                  └──────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

## Stack & ports

| Service | Path | Port | Required for core journey? |
|---|---|---|---|
| Web app (React/Vite) | `web-app` | 3000 (dev) / 80 (prod) | Yes |
| API server (Node/Express) | `backend` | 5000 | Yes |
| Net-realization calculator (FastAPI) | `ml-service` (`net_realization.py`) | 8002 | Yes — the deterministic engine |
| RAG advisory (FastAPI, explanation-only) | `ml-service` (`advisory_service.py`) | 8001 | No — template explanations are the fallback |
| Disease detection (FastAPI) | `ml-service` (`main.py`) | 8000 | No — separate feature |

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- **MongoDB Atlas** cluster (free tier M0 works)
- **Docker** (optional, for containerized deployment)

## 1. Environment

```bash
cp backend/.env.example backend/.env      # fill what you have; everything has a fallback
cp web-app/.env.example  web-app/.env     # VITE_API_URL can stay empty (vite proxies /api → :5000)
```

### Required Variables

| Variable | Where | Purpose |
|---|---|---|
| `MONGODB_URI` | backend | MongoDB Atlas connection string |
| `NET_REALIZATION_URL` | backend | URL to net-realization calculator |
| `VITE_API_URL` | web-app (build time) | Backend API URL (set to `/api` if using nginx proxy) |

### Optional Variables (with graceful fallbacks)

| Variable | Fallback |
|---|---|
| `AGMARKNET_API_KEY` | Cached snapshot serves real data |
| `OPENWEATHER_API_KEY` | Weather page shows error |
| `GROQ_API_KEY` | Template explanations used |
| `DEMO_JWT_SECRET` | Random per boot (tokens die on restart) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Demo JWT auth works |

## 2. Start the stack (local dev)

```bash
# 1) Calculator (must be up before the web journey)
cd ml-service && pip install -r requirements.txt
python -m uvicorn net_realization:app --port 8002  # :8002

# 2) API
cd backend && npm install
PORT=5000 npm start                           # :5000

# 3) Web
cd web-app && npm install
npm run dev                                   # :3000

# Optional explanation layer
python advisory_service.py                    # :8001
```

## 3. Docker Compose (production-like local run)

```bash
# Create a .env file at the repo root with your secrets:
cat > .env << 'EOF'
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/kisan360?retryWrites=true&w=majority
AGMARKNET_API_KEY=<your-key>
OPENWEATHER_API_KEY=<your-key>
GROQ_API_KEY=<your-key>
DEMO_JWT_SECRET=<your-secret>
EOF

# Build and start all services
cd deployment/docker
docker-compose up --build

# Services will be available at:
#   Frontend:     http://localhost:80
#   Backend:      http://localhost:5000
#   Calculator:   http://localhost:8002
#   RAG:          http://localhost:8001
#   Disease:      http://localhost:8000
```

## 4. Cloud deployment (Railway)

### One-time setup

1. Push to GitHub
2. Connect repo to Railway (railway.app)
3. Create 5 services: backend, net-realization, advisory, disease, frontend
4. Set environment variables in Railway dashboard (never in code)

### Backend service

- **Dockerfile**: `deployment/docker/Dockerfile.backend`
- **Env vars**: Set all backend env vars in Railway dashboard
- **Port**: 5000
- **Health check**: `/health`

### Net-realization service

- **Dockerfile**: `deployment/docker/Dockerfile.ml`
- **Start command override**: `python -m uvicorn net_realization:app --port 8002`
- **Port**: 8002
- **Health check**: `/health`

### Advisory service

- **Dockerfile**: `deployment/docker/Dockerfile.ml`
- **Start command override**: `python advisory_service.py`
- **Port**: 8001
- **Health check**: `/health`

### Disease detection service

- **Dockerfile**: `deployment/docker/Dockerfile.ml`
- **Start command override**: `python main.py`
- **Port**: 8000
- **Health check**: `/health`

### Frontend service

- **Dockerfile**: `deployment/docker/Dockerfile.frontend`
- **Build arg**: `VITE_API_URL=<backend-public-url>/api`
- **Port**: 80

## 5. Health checks

```bash
# Backend liveness
curl http://localhost:5000/health

# Full diagnostics
curl http://localhost:5000/api/diagnostics

# Market cache status
curl http://localhost:5000/api/market/cache-status

# Ingestion health
curl http://localhost:5000/api/market/ingestion-health

# Calculator health
curl http://localhost:8002/health

# Calculator assumptions
curl http://localhost:8002/assumptions

# Canonical scenario test
curl "http://localhost:5000/api/market/net-realization?crop=Onion&district=Nashik&quantity=10"
```

## 6. Canonical demo scenario

Onion · 10 q · Nashik → market comparison → net realization (inversion) → WITHOUT/WITH impact
→ evidence drawer → robustness → buyer coverage → lot → buyer match → offer benchmark →
accept → simulated payment → receipt/history. FPO alternative: 50 q pooling changes transport
tier and can unlock buyers. Repeat with Soybean · 12 q · Akola to prove crop-generality.

## 7. Scheduler behavior

- Runs daily at 09:00 IST via `node-cron`
- Fetches fresh market prices from AGMARKNET
- Writes to `backend/src/data/priceSnapshots.json` (filesystem)
- Appends to `backend/src/data/priceHistory.json` (filesystem)
- Idempotent: same data won't create duplicates
- **Single-instance assumption**: only one backend process should run the scheduler
- Manual refresh: `POST /api/market/refresh`

## 8. Market cache behavior

- Seed snapshot (85 rows) is checked into git
- On boot, backend loads the seed snapshot into memory
- Scheduler refreshes from AGMARKNET daily
- If AGMARKNET is down, the last known snapshot continues serving
- All data is labeled "cached" or "live" in the UI
- On container restart, seed snapshot reloads automatically

## 9. ML cold start

| Service | Cold start | Model size | Behavior |
|---|---|---|---|
| Disease detection | ~5-15s on first request | ~30MB MobileNetV2 | Lazy-loaded, cached after first call |
| RAG advisory | ~10-30s on first request | ~80MB MiniLM-L6 | Lazy-loaded, cached after first call |
| Net-realization | Instant | None (pure Python) | No model loading |

First requests to disease/RAG will be slow. Subsequent requests are fast.

## 10. Filesystem persistence

| File | Writer | Purpose | Persistent? |
|---|---|---|---|
| `priceSnapshots.json` | Scheduler | Market price cache | Seed data re-loaded on restart |
| `priceHistory.json` | Scheduler | Historical trends | Re-accumulates over time |
| `buyers.json` | Seed script | Buyer directory | Static, read-only |
| `fpoMembers.json` | Seed script | FPO roster | Static, read-only |

On container restart: seed data reloads, scheduler re-fetches at next 09:00 IST.

## 11. Failure/recovery

| Failure | Impact | Recovery |
|---|---|---|
| MongoDB down | Lots/offers/payments fail (503) | Market math still works |
| AGMARKNET down | Prices show "cached" label | Automatic fallback |
| RAG down | Template explanations used | No user-visible error |
| Disease ML down | Disease page shows error | Other features unaffected |
| Backend restarts | In-memory cache resets | Seed data reloads |
| Scheduler fails | Next day's refresh still runs | Manual: POST /api/market/refresh |

## 12. Known quirks (do not "fix" live)

- MongoDB Atlas DNS intermittently fails (`querySrv ENOTFOUND`) — the server is designed to
  continue without DB; features needing persistence say so instead of crashing.
- AGMARKNET occasionally 429s — the snapshot fallback exists for exactly this.
- The distance table is documented estimates (`/assumptions` states this); production swaps in
  a routing API. Do not present distances as survey data.

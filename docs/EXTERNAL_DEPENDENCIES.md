# Kisan360 — External Dependency Matrix

## Services

| Service | Port | Required | Offline Behavior |
|---------|------|----------|------------------|
| Backend (Express) | 5000 | Yes | N/A |
| Calculator (net_realization.py) | 8002 | Yes | N/A |
| ML RAG | 8001 | No | Template explanations |
| ML Disease | 8000 | No | Disease detection unavailable |
| Frontend (Vite) | 3000 | Yes | N/A |
| MongoDB Atlas | 27017 | No | In-memory fallback (resets on restart) |

## External APIs

| API | Used By | Required | Fallback | Status Check |
|-----|---------|----------|----------|--------------|
| AGMARKNET | scheduler.js | No | Cached snapshot (85 rows) | `GET /api/market/cache-status` |
| OpenWeather | weather route | No | Weather unavailable | `GET /api/weather?lat=...&lon=...` |
| Groq (LLM) | RAG service | No | Template explanations | `GET :8001/health` |
| Firebase Auth | auth middleware | No | Demo JWT auth works | `GET /api/auth/demo-login` |

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| PORT | No | 5000 | Backend port |
| DEMO_JWT_SECRET | Yes (demo) | none | JWT signing secret |
| MONGODB_URI | No (demo) | in-memory | Atlas connection string |
| OPENWEATHER_API_KEY | No | none | Weather data |
| GROQ_API_KEY | No | none | RAG explanations |
| FIREBASE_SERVICE_ACCOUNT | No | none | Firebase Admin SDK |
| FRONTEND_URL | No | reflective CORS | Production CORS origin |
| NODE_ENV | No | development | Production mode |

## Data Files (no external API needed)

| File | Rows | Source | Purpose |
|------|------|--------|---------|
| priceSnapshots.json | 85 | AGMARKNET cache | Market prices (3 crops, 65 markets) |
| priceHistory.json | varies | Historical | Trend computation |
| buyers.json | 10 | Static | Demo buyer directory |
| buyerRequirements.json | 8 | Static | Quality matching |
| storageOptions.json | 4 | Static | Storage facilities |

## Startup Order

1. Calculator (port 8002) — independent, no deps
2. Backend (port 5000) — needs calculator for net-realization
3. Frontend (port 3000) — needs backend for API calls
4. RAG (port 8001) — optional, backend works without it
5. Disease (port 8000) — optional, standalone

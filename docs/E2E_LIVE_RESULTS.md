# E2E Live Results — feat/agentic-platform-phase0-4

**Date:** 2026-11-08 & 2026-11-09 (local) · **Stack:** backend + calculator live · RAG :8001 not booted (graceful fallback)

## Stack boot (verified)
- Calculator: `uvicorn net_realization:app --port 8003` → `GET /health` 200 (8002 was occupied by an unrelated InternIQ app, so the 8-step run used 8003)
- Backend: `node src/server.js` (`PORT=5001`, `NET_REALIZATION_URL=http://127.0.0.1:8003`)
  - `GET /health` → `status: OK`, `db: connected`, `mlServiceReady: true`, `mlServiceStatus: ready`
  - Price seed: 421 rows (machine-generated AGMARKNET snapshot)
  - MongoDB: connected (Atlas shard)

## HTTP E2E (`backend/scripts/e2e-http.js`) — 8/8 PASS (2026-11-09)
```
PASS  GET /health — OK (db=connected ml=ready)
PASS  POST /api/auth/demo-login — farmer
PASS  POST /api/chat multi-intent — compare_mandis (intents=compare_mandis, crop_health  toolResults=true)
PASS  GET /api/market/net-realization — APMC Kalyan Rs 3795.9/q
PASS  GET /api/advisory — fallback
PASS  POST /api/fpo/pool — pooled Rs 3895.5/q
PASS  POST /api/disease/detect (no image -> 400) — Image is required…
PASS  GET /api/chat/history — rows=2
```

## Notes
- Net-realization number is live from the deterministic engine on the stamped snapshot — not mocked.
- Advisory `fallback` is correct when `:8001` (torch) is not running; call it “RAG offline — template advisory” live.
- Live RAG needs `sentence-transformers + torch` (≈ GBs) — boot with `ml-service/requirements.txt` when you want Groq generation; otherwise the template path is the demo default.

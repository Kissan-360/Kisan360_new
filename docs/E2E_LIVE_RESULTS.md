# E2E Live Results — feat/agentic-platform-phase0-4

**Date:** 2026-11-08 (local) · **Stack:** backend :5000 (Atlas connected) + calculator :8002 (live) · RAG :8001 not booted (graceful fallback)

## Stack boot (verified)
- Calculator: `uvicorn net_realization:app --port 8002` → `GET /health` 200
- Backend: `node src/server.js` (`PORT=5000`, `NET_REALIZATION_URL=http://127.0.0.1:8002`)
  - `GET /health` → `status: OK`, `db: connected`, `mlServiceReady: true`, `mlServiceStatus: ready`
  - Price seed: 421 rows (machine-generated AGMARKNET snapshot)
  - MongoDB: connected (Atlas shard)

## HTTP E2E (`backend/scripts/e2e-http.js`) — 5/5 PASS
```
PASS  GET /health — OK  (db=connected ml=ready)
PASS  POST /api/auth/demo-login — farmer
PASS  POST /api/chat multi-intent — compare_mandis  (intents=compare_mandis, crop_health  toolResults=true)
PASS  GET /api/market/net-realization — APMC Mangal Wedha Rs 3464.55/q
PASS  GET /api/advisory — fallback  (RAG offline -> template, honest label)
```

## Notes
- Net-realization number is live from the deterministic engine on the stamped snapshot — not mocked.
- Advisory `fallback` is correct when `:8001` (torch) is not running; call it “RAG offline — template advisory” live.
- Live RAG needs `sentence-transformers + torch` (≈ GBs) — boot with `ml-service/requirements.txt` when you want Groq generation; otherwise the template path is the demo default.

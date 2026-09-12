# Kisan360 — Demo Risk Register

## Risk Matrix

| Priority | Meaning |
|----------|---------|
| **P0** | Demo can fail completely |
| **P1** | Core demo journey can break |
| **P2** | Visible but recoverable |
| **P3** | Cosmetic / documentation |

---

## P0 — Demo Can Fail Completely

### R1: Python net-realization service down
- **Probability:** Low (stable, no external deps)
- **Impact:** Core journey blocked — cannot compute mandi rankings
- **Mitigation:** Start `--core` includes calculator. Health check verifies at boot.
- **Recovery:** `cd ml-service && python -m uvicorn net_realization:app --port 8002` — takes 2 seconds to start
- **Verification:** `curl http://localhost:8002/health`

### R2: Backend won't start (port conflict)
- **Probability:** Low
- **Impact:** Nothing works
- **Mitigation:** `dev-up.sh` checks ports before binding. `server.js` exits with clear error on invalid PORT.
- **Recovery:** Kill process on port 5000, restart

### R3: MongoDB Atlas completely unreachable + in-memory fallback fails
- **Probability:** Very low (mongodb-memory-server is reliable)
- **Impact:** DB-dependent features (lots, offers, payments) return 503
- **Mitigation:** Market math, net-realization, farm-context, trends all work WITHOUT database
- **Recovery:** Check Atlas whitelist, restart backend

---

## P1 — Core Demo Journey Can Break

### R4: AGMARKNET API down
- **Probability:** Medium (external government API)
- **Impact:** Live prices unavailable — falls back to cached snapshot
- **Mitigation:** Cached snapshot has 85 rows from 2026-09-08. Labeled "cached" in UI.
- **Recovery:** None needed — cached data serves the demo. Manual refresh when API recovers.
- **Verification:** `curl http://localhost:5000/api/market/cache-status`

### R5: Demo seed fails ( MongoDB unreachable)
- **Probability:** Low (in-memory fallback)
- **Impact:** No lots/offers for trade demo
- **Mitigation:** Seed endpoint is idempotent. In-memory DB auto-created on boot.
- **Recovery:** Restart backend, re-run seed

### R6: Buyer role cannot accept offer
- **Probability:** Low (state machine enforced)
- **Impact:** Trade flow stalls
- **Mitigation:** Demo seed creates pre-populated state. Role-based access tested in integration suite.
- **Recovery:** Use correct buyer login (`demo-buyer`)

### R7: Weather API key invalid/missing
- **Probability:** Medium
- **Impact:** Weather page fails, Farm Context weather field empty
- **Mitigation:** Farm Context degrades gracefully — soil/season/market data still shown
- **Recovery:** Set valid `OPENWEATHER_API_KEY` in `.env`

---

## P2 — Visible But Recoverable

### R8: RAG/LLM service down
- **Probability:** Medium (depends on Groq API)
- **Impact:** AI explanations unavailable — template fallback used
- **Mitigation:** Template explanations are accurate and deterministic
- **Recovery:** None needed — templates work fine for demo

### R9: Market snapshot stale (>24h old)
- **Probability:** Low (snapshot from 2026-09-08)
- **Impact:** Prices labeled "STALE" in UI
- **Mitigation:** Snapshot is real data. "STALE" label is honest — not a bug.
- **Recovery:** Run `node scripts/refresh-prices.js` when AGMARKNET is available

### R10: Frontend build fails
- **Probability:** Very low (clean build verified)
- **Impact:** Cannot serve frontend
- **Mitigation:** Production build tested. Vite dev server works without build.
- **Recovery:** `cd web-app && npm run dev`

### R11: CORS mismatch
- **Probability:** Low (dev mode reflective)
- **Impact:** Frontend cannot reach backend
- **Mitigation:** Dev mode uses reflective CORS. Production uses `FRONTEND_URL`.
- **Recovery:** Set `FRONTEND_URL` to match frontend origin

---

## P3 — Cosmetic / Documentation

### R12: Trend data sparse for some markets
- **Probability:** High (history accumulates over time)
- **Impact:** "Insufficient evidence" shown for some trends
- **Mitigation:** This is honest — no data means no trend. Expected behavior.
- **Recovery:** None — this is correct behavior

### R13: Disease detection model cold start (15-30s)
- **Probability:** High (first request)
- **Impact:** Slow first disease detection
- **Mitigation:** Optional feature — not part of core journey
- **Recovery:** Wait for model to load, subsequent requests fast

### R14: Notification bell shows empty
- **Probability:** High (no notifications seeded)
- **Impact:** Cosmetic only
- **Mitigation:** Bell shows "0" — honest
- **Recovery:** None needed

---

## Pre-Demo Checklist Summary

1. ✅ Backend starts on port 5000
2. ✅ Calculator starts on port 8002
3. ✅ Frontend starts on port 3000
4. ✅ `/health` returns `OK` or `DEGRADED` (not `DOWN`)
5. ✅ Net-realization returns ranked mandis
6. ✅ Demo seed creates canonical fixtures
7. ✅ Cached snapshot loaded (85 rows)
8. ✅ Farmer login works
9. ✅ Buyer login works
10. ✅ Offer flow works (create → accept → payment)

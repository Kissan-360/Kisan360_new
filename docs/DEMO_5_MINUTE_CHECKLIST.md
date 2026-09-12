# Kisan360 — 5 Minutes Before Demo Checklist

Print this. Keep it on your phone. Use it under pressure.

---

## ☐ Services Running (30 seconds)

```bash
curl http://localhost:5000/health
curl http://localhost:8002/health
curl http://localhost:3000/
```

Expected: All return 200. If any fail → restart that service.

## ☐ Backend Healthy (15 seconds)

```bash
curl http://localhost:5000/health | grep -o '"db":"[^"]*"'
```

Expected: `"db":"connected"` or `"db":"memory"`. If `"db":"offline"` → restart backend.

## ☐ Calculator Working (15 seconds)

```bash
curl "http://localhost:8002/health"
```

Expected: `{"status":"ok","service":"net-realization-calculator",...}`

## ☐ Market Data Available (15 seconds)

```bash
curl "http://localhost:5000/api/market/prices?crop=Onion&state=Maharashtra" | grep -o '"count":[0-9]*'
```

Expected: `"count":` > 0. If 0 → AGMARKNET down, cached snapshot should still work.

## ☐ Demo Login Works (15 seconds)

```bash
curl -X POST http://localhost:5000/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"role":"farmer","name":"Test","district":"Nashik"}' | grep -o '"token":"[^"]*"'
```

Expected: Token returned. If not → check `DEMO_JWT_SECRET` env var.

## ☐ Net Realization Works (15 seconds)

```bash
curl "http://localhost:5000/api/market/net-realization?crop=Onion&district=Nashik&quantity=10" | grep -o '"bestMandi":"[^"]*"'
```

Expected: A mandi name returned. If error → check calculator is running.

## ☐ Frontend Accessible (10 seconds)

Open **http://localhost:3000** in browser.

Expected: Landing page loads. If blank → check `web-app` console for errors.

## ☐ Quick Reset (if needed)

```bash
# Kill everything, restart clean
pkill -f "node src/server.js"
pkill -f "uvicorn"
cd scripts && bash demo-reset.sh
```

---

## Emergency Contacts

- Backend log: `/tmp/k360-backend.log`
- Calculator log: `/tmp/k360-calc.log`
- Frontend log: `/tmp/k360-web.log`

## If Something Breaks During Demo

1. **AGMARKNET down** → Say "We're using cached AGMARKNET data — labeled in the UI"
2. **MongoDB down** → Market math still works. Trade features show errors honestly.
3. **Calculator down** → Restart: `cd ml-service && python -m uvicorn net_realization:app --port 8002`
4. **Frontend freeze** → Hard refresh (Ctrl+Shift+R)
5. **Weather fails** → Say "Weather is an optional integration — core journey unaffected"

**The demo is designed to degrade honestly. Never hide failures — explain them.**

# Kisan360 — Cloud Deployment Guide (free tier)

**Goal:** a public URL a judge can open on any laptop. Total time: ~2 hours,
all on free tiers (Render web services + MongoDB Atlas M0).

## Topology

| Service | What | Where it runs |
|---|---|---|
| `kisan360-web` | Static Vite build; the trained TF.js grader runs **in the browser** | Render static site |
| `kisan360-api` | Express API (port 5000 locally) | Render Node service |
| `kisan360-calc` | Net-realization FastAPI (pure-Python — the flagship engine) | Render Python service |
| *not deployed* | Heavy ML service (torch/transformers) | Browser TF.js replaces it |

Disease/advisory endpoints degrade gracefully when their optional services are
absent (covered by backend tests), so the demo is fully functional with just
the three services above.

## Step-by-step (first deploy)

1. **MongoDB Atlas (5 min)**
   - Create a free M0 cluster → Database Access: add a user → Network Access:
     allow `0.0.0.0/0` (demo; tighten later) → copy the SRV connection string.

2. **Render Blueprint (10 min)**
   - Push the repo to GitHub → render.com → New → **Blueprint** → select repo.
   - Render reads `render.yaml` and pre-wires all three services.
   - Fill the two `sync:false` prompts:
     - `MONGODB_URI` = the Atlas SRV string
     - `FRONTEND_URL` = `https://kisan360-web.onrender.com` (Render assigns
       this name; adjust if yours differs)
   - Apply → wait for all three services to go Live.

3. **Verify (5 min)**
   - `https://<calc-host>/health` → JSON ok
   - `https://<api-host>/health` → JSON with netRealization status
   - Open `https://<web-host>` → Farmer login → run the flagship scenario
     (Onion · Nagpur · 10 q) → create lot → simulate payment.
   - If the web app shows "same-origin /api" warnings, `VITE_API_URL` didn't
     take: set it in the dashboard and **trigger a manual deploy** (build-time
     variable).

## Demo-day realities of free tier (read before pitching from the cloud)

- **Cold starts:** free services sleep after ~15 min idle; first request takes
  50s+. **Warm all three** (hit each `/health`) before the demo starts, and
  don't let the tab idle out mid-event. A local `dev-up.sh` stack stays the
  zero-risk primary; the cloud URL is for "can I open this now?" questions.
- **Rate limits:** global 300 req/15min per IP, 30 demo-logins/15min. Fine for
  a judge clicking around — don't script-loop logins from stage Wi-Fi.
- **Secrets:** never commit `.env`. Atlas SRV goes only into Render's vault.
  `DEMO_JWT_SECRET` is auto-generated once and persists (sessions survive
  redeploys).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| CORS error in browser console | `FRONTEND_URL` wrong or missing | Set it to the exact web origin (scheme + host, no trailing slash) and redeploy API |
| Deep link 404 on refresh | SPA rewrite missing | Verify the `routes:` rewrite in render.yaml / `_redirects` |
| "same-origin /api" console warning | `VITE_API_URL` unset at build | Set env var → manual deploy (it's baked at build time) |
| Lots/payments vanish on API restart | Mongo unreachable | Check `MONGODB_URI` + Atlas network access; app boots degraded without it by design |
| Calculator `/health` times out | Requirements drift | Must use `requirements-calc.txt` (torch stack will not fit free tier) |

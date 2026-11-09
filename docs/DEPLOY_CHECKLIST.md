# Deploy Checklist — v1.4.0-agentic (Phase 62)

## Render (free tier, 3 services)
- [ ] Blueprint from `render.yaml` (web static + api + calc)
- [ ] `MONGODB_URI` (Atlas M0) + `FRONTEND_URL` set in dashboard
- [ ] `GROQ_API_KEY`, `AGMARKNET_API_KEY`, `OPENWEATHER_API_KEY` set (optional — fallbacks work)
- [ ] `DEMO_JWT_SECRET` generated (stable across restarts)
- [ ] `python scripts/prod-check.js` passes (web 200; api/calc may need 60s wake)
- [ ] `keepalive.yml` active (10-min warm, on-demand calc)

## Render (paid, optional — full ML)
- [ ] Blueprint from `render-optional.yaml` (add RAG `:8001` + disease `:8000`)
- [ ] Pre-embed: `cd ml-service && python scripts/embed_corpus.py` (commit `corpus_embeddings.npy`)
- [ ] Set `RAG_SERVICE_URL`, `ML_SERVICE_URL` on the API

## Mobile (EAS)
- [ ] `cd mobile-app && eas build --platform android --profile production`
- [ ] `EXPO_PUBLIC_API_URL=https://<api>/api` on the same network for dev, embedded for prod

## Demo (5 min)
- [ ] `docs/DEMO_SCRIPT_AGENTIC.md` walkthrough
- [ ] Live check: Onion · 10q · Nashik Marathi → Kalyan Rs 3795.9/q → advisory footer → disease photo → lot → FPO → payment (test)

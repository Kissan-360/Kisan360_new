## Summary
<!-- One line: what does this PR deliver? -->

## Verified
- [ ] `cd ml-service && python eval_agent.py` (expect 8/8)
- [ ] `cd backend && node scripts/eval-intents.js` (expect 11/11)
- [ ] `cd backend && node scripts/smoke-agent.js`
- [ ] `cd backend && npm test` (expect 638 passed)
- [ ] `cd web-app && npm run build`

## Checklist
- [ ] No `.env` committed; Render env set in dashboard only
- [ ] `render.yaml` unchanged or deliberately changed (note why)
- [ ] Demo still works: Onion · 10q · Nashik → Marathi compare → leaf photo → weather → lot
- [ ] Mobile: `EXPO_PUBLIC_API_URL=http://<lan>:5000/api` on same network

## Remaining gaps
<!-- Honest list — what is not in this PR? -->

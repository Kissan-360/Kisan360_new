# Kisan360 — 5-Minute Agentic Demo Script

**One narrative:** farmer asks in Marathi → agent classifies → tools fire → numbers are deterministic → disease + weather complete the visit.

## 0:00 — Health (15s)
- Open `/health` — show `mlServiceStatus`, scheduler health. Say: “API is DEGRADED only if DB is off — market math still works.”

## 0:15 — Agentic chat (90s)
- Chat: `माझ्या कांद्यासाठी कोणती मंडी चांगली? आणि पत्त्यावर रोग आहे का?`
- Point out: intents = `compare_mandis, crop_health` (multi-intent), text says `Best right now: Lasalgaon at Rs …/q net (cached AGMARKNET)`.
- Open the chat card: top-3 mandis + `source: agmarknet_snapshot · cached · date`. Say: “LLM never invents this — the calculator owns every rupee.”
- In **Ask** mode ask: `How to control thrips on onion` → agent-backed answer (RAG + weather tool, not a bare LLM dump).

## 1:45 — Advisory (60s)
- `/advisory?crop=Onion` → provenance chips: `agent · validated`, intent/tools/sources. Say: “Structured output, grounded number check, template fallback if hallucinated.”

## 2:45 — Disease (60s)
- Disease page → upload tomato leaf → `MobileNetV2 · FastAPI — canonical grader`, OOD gates shown. If you upload a non-leaf: `not_a_plant` rejection (that’s the feature).

## 3:45 — Decision → Trade (60s)
- Decision Workspace pre-filled from chat (Onion · Nashik · 10q) → ranked mandis → Create Lot → Trade → simulated payment. Say: “Decision is theirs. We show data + assumptions.”

## 4:45 — Close (15s)
- “Net realization = mandi price − farmer-borne costs. Commission is the buyer’s (APMC s.31). Prices are observed, never predicted. Payments are simulated.”

## Fallbacks to demo if a service is down
- RAG down → template advisory, no error · Calculator down → chat navigates without numbers (honest) · AGMARKNET down → cached snapshot with label.

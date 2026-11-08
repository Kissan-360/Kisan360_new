# Kisan360 — Model & Data Cards

## Generation — Groq Llama 3.3-70B (`llama-3.3-70b-versatile`)
- **Role:** grounded explainer only. Restates numbers from deterministic tool output; never generates prices/costs/rankings.
- **Grounding:** every `Rs` figure in the reply must already appear in tool output (`agent.validate_numbers`); else template fallback.
- **Limits:** 12s timeout, templates on 429/5xx; multilingual EN/MR/HI via system prompt; never predicts prices or gives financial advice.

## Embeddings — `all-MiniLM-L6-v2` (SentenceTransformers)
- **Role:** RAG retrieval over `knowledge_base.py` (~158 docs). Cosine top-7, in-memory (+ `corpus_embeddings.npy` cache). Optional FAISS index via `scripts/embed_corpus.py`.
- **Limits:** keyword exactness is weak (e.g. chemical names); mitigated by hybrid metadata filtering on crop/topic + BM25 roadmap. Corpus order matters — re-embed after merge.

## Disease — MobileNetV2 PlantDisease-ID, 38 classes (`linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification`)
- **Role:** leaf photo → top-5 + confidence. FastAPI `:8000`, proxied as `POST /api/disease/detect`.
- **OOD gates (farmer-safe):** Laplacian sharpness, green-fraction >5%, entropy-normalized, conf ≥ 0.40 (15× random). Rejects `not_a_plant` / `crop_mismatch` before any treatment.
- **Limits:** trained on PlantVillage-style images; US crops (apple/orange) dominate — Maharashtra crop coverage (soybean/tomato/potato/grape/corn) is partial; always paired with `DISEASE_INFO` severity/treatment + extension-officer fallback.

## Market — AGMARKNET (data.gov.in) + OpenWeather
- **Snapshot:** 85–421 stamped rows (Maharashtra, 2026-09-08), daily 09:00 IST cron, `live | cached` provenance. Upstream 429s / sliver pulls fall back to snapshot with note.
- **Weather:** OpenWeather (key-gated; template advisories otherwise).
- **Calculator:** `net_realization.py` (:8002) — deterministic, versioned `ASSUMPTIONS`, APMC s.31 (commission never deducted from farmer net).

## What Kisan360 does NOT do
- Predict prices, guarantee income, verify buyers, or move real money (demo payments are simulated).

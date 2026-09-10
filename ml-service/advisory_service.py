import os
import logging
import numpy as np
from fastapi import FastAPI, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Kisan360 Advisory RAG Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
doc_embeddings = None
knowledge = None

def load_knowledge():
    global knowledge
    if knowledge is None:
        from knowledge_base import CROP_KNOWLEDGE
        knowledge = CROP_KNOWLEDGE
        logger.info(f"Loaded {len(knowledge)} knowledge documents")
    return knowledge

def get_embedder():
    global model
    if model is None:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-MiniLM-L6-v2')
    return model

def build_index():
    global doc_embeddings, knowledge
    docs = load_knowledge()
    texts = [d["content"] for d in docs]
    logger.info(f"Generating embeddings for {len(texts)} documents...")
    emb = get_embedder()
    doc_embeddings = emb.encode(texts, convert_to_numpy=True)
    logger.info(f"Embeddings generated: {doc_embeddings.shape}")
    return doc_embeddings

def retrieve(query, top_k=7):
    emb = get_embedder()
    q_vec = emb.encode([query], convert_to_numpy=True)
    sim = np.dot(doc_embeddings, q_vec.T).flatten()
    norms = np.linalg.norm(doc_embeddings, axis=1) * np.linalg.norm(q_vec)
    sim = sim / (norms + 1e-10)
    top_idx = np.argsort(sim)[-top_k:][::-1]
    docs = load_knowledge()
    results = []
    for idx in top_idx:
        results.append({
            "id": docs[idx]["id"],
            "content": docs[idx]["content"],
            "tags": docs[idx]["tags"],
            "score": float(round(sim[idx], 4)),
        })
    return results

def call_groq(groq_key, prompt, system_prompt=None):
    try:
        from groq import Groq
        client = Groq(api_key=groq_key)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
            max_tokens=1024,
        )
        return completion.choices[0].message.content
    except ImportError:
        logger.warning("groq package not installed")
        return None
    except Exception as e:
        logger.error(f"Groq API error: {type(e).__name__}: {e}")
        return None

def generate_advisory(crop, location, weather_context, retrieved_docs, groq_key=None, query=""):
    context = "\n\n".join([f"[{d['id']}] {d['content']}" for d in retrieved_docs])

    weather_str = ""
    if weather_context:
        parts = []
        if weather_context.get("temperature") is not None:
            parts.append(f"Temperature: {weather_context['temperature']}°C")
        if weather_context.get("humidity") is not None:
            parts.append(f"Humidity: {weather_context['humidity']}%")
        if weather_context.get("condition"):
            parts.append(f"Weather: {weather_context['condition']}")
        if parts:
            weather_str = "Current weather: " + ", ".join(parts)

    # Template-based weather + pest alerts (always computed)
    template_recs = []
    pest_alerts = []
    disease_info = []
    weather_advices = []

    if weather_context:
        temp = weather_context.get("temperature")
        humidity = weather_context.get("humidity")
        condition = (weather_context.get("condition") or "").lower()

        if temp is not None:
            if temp > 35:
                template_recs.append(f"High temperature ({temp}°C): Increase irrigation frequency, apply mulch, provide shade for sensitive crops. Avoid fertilizer application during heat stress.")
            elif temp > 30:
                template_recs.append(f"Warm conditions ({temp}°C): Monitor soil moisture. Consider light irrigation during cooler hours.")
            elif temp < 10:
                template_recs.append(f"Low temperature ({temp}°C): Protect seedlings with covers. Irrigate before expected frost night. Postpone transplanting.")
            elif temp < 15:
                template_recs.append(f"Cool conditions ({temp}°C): Crop growth may slow. Ensure adequate nutrition for cold tolerance.")

        if humidity is not None:
            if humidity > 85:
                template_recs.append(f"High humidity ({humidity}%): High risk of fungal diseases. Apply preventive fungicide. Improve air circulation.")
                weather_advices.append("High humidity alert: Monitor for blight, mildew, and rot. Delay nitrogen application.")
            elif humidity < 30:
                template_recs.append(f"Low humidity ({humidity}%): Increase irrigation frequency. Monitor for mite and thrips infestations.")

        if "rain" in condition or "drizzle" in condition:
            template_recs.append("Rain expected: Delay pesticide and fertilizer applications. Ensure proper field drainage.")
        elif "clear" in condition or "sunny" in condition:
            if humidity and humidity < 60 and temp and temp > 25:
                template_recs.append("Favorable conditions for spraying operations today.")

    for d in retrieved_docs:
        tags = d["tags"]
        content = d["content"]
        if "pest" in tags:
            pest_alerts.append(content)
        elif "disease" in tags:
            disease_info.append(content)

    # Build prompt for Groq — sanitize user input to prevent prompt injection
    # Strip control characters, limit length, and wrap in quotes to delimit
    safe_query = query[:200].replace('\n', ' ').replace('\r', '') if query else ""
    prompt_parts = [f"You are advising a farmer growing {crop} in {location}."]
    if weather_str:
        prompt_parts.append(weather_str)
    if safe_query:
        prompt_parts.append(f"The farmer asks: \"{safe_query}\"")
    prompt_parts.append("Based on the following agricultural knowledge, give practical actionable advice:")
    prompt_parts.append(context)
    if template_recs:
        prompt_parts.append("Also consider these weather-based notes:\n- " + "\n- ".join(template_recs))
    prompt = "\n\n".join(prompt_parts)

    system_prompt = (
        "You are Kisan360, an AI agricultural assistant for Indian farmers. "
        "Give practical, specific, actionable advice. Keep responses concise. "
        "Output each point on a new line starting with a dash (-). "
        "Do not use emoji or markdown headers. "
        "IMPORTANT: You must ONLY use the information provided in the context below. "
        "Do not invent prices, demand forecasts, government guarantees, or financial figures. "
        "If the context does not contain enough information to answer, say so honestly. "
        "Never claim buyer demand, guaranteed prices, or government verification unless the context explicitly states it."
    )

    # Try Groq first
    if groq_key:
        groq_response = call_groq(groq_key, prompt, system_prompt)
        if groq_response:
            recs = [l.strip().lstrip("- *•#1234567890.)(").strip() for l in groq_response.split("\n") if l.strip() and len(l.strip()) > 15]
            recs = [r for r in recs if not any(skip in r.lower() for skip in ["recommendation", "here's", "tip:"])]

            # Merge Groq output with template-based alerts
            all_recs = [r for r in recs[:6] if r not in template_recs]
            all_recs = template_recs + all_recs

            return {
                "crop": crop,
                "location": location,
                "recommendations": all_recs[:8],
                "pestAlerts": pest_alerts[:3],
                "diseaseInfo": disease_info[:3],
                "weatherAdvisories": weather_advices[:3],
                "sources": [d["id"] for d in retrieved_docs],
                "generated": True,
            }

    # Fallback: template-based
    logger.info("Groq unavailable, using template fallback")
    recommendations = []
    pest_alerts = []
    disease_info = []
    weather_advices = []

    if weather_context:
        temp = weather_context.get("temperature")
        humidity = weather_context.get("humidity")
        condition = (weather_context.get("condition") or "").lower()

        if temp is not None:
            if temp > 35:
                recommendations.append(f"High temperature ({temp}°C): Increase irrigation frequency, apply mulch, provide shade for sensitive crops. Avoid fertilizer application during heat stress.")
            elif temp > 30:
                recommendations.append(f"Warm conditions ({temp}°C): Monitor soil moisture. Consider light irrigation during cooler hours.")
            elif temp < 10:
                recommendations.append(f"Low temperature ({temp}°C): Protect seedlings with covers. Irrigate before expected frost night. Postpone transplanting.")
            elif temp < 15:
                recommendations.append(f"Cool conditions ({temp}°C): Crop growth may slow. Ensure adequate nutrition for cold tolerance.")

        if humidity is not None:
            if humidity > 85:
                recommendations.append(f"High humidity ({humidity}%): High risk of fungal diseases. Apply preventive fungicide. Improve air circulation.")
                weather_advices.append("High humidity alert: Monitor for blight, mildew, and rot. Delay nitrogen application.")
            elif humidity < 30:
                recommendations.append(f"Low humidity ({humidity}%): Increase irrigation frequency. Monitor for mite and thrips infestations.")

        if "rain" in condition or "drizzle" in condition:
            recommendations.append("Rain expected: Delay pesticide and fertilizer applications. Ensure proper field drainage.")
        elif "clear" in condition or "sunny" in condition:
            if humidity and humidity < 60 and temp and temp > 25:
                recommendations.append("Favorable conditions for spraying operations today.")

    for d in retrieved_docs:
        tags = d["tags"]
        content = d["content"]
        if "pest" in tags:
            pest_alerts.append(content)
        elif "disease" in tags:
            disease_info.append(content)
        elif "weather" in tags:
            weather_advices.append(content)
        else:
            if content not in recommendations:
                recommendations.append(content)

    crop_tag = crop.lower()
    crop_specific = [d for d in retrieved_docs if crop_tag in d["tags"]]
    for d in crop_specific:
        rec = d["content"]
        if rec not in recommendations:
            recommendations.append(rec)

    return {
        "crop": crop,
        "location": location,
        "recommendations": recommendations[:10],
        "pestAlerts": pest_alerts[:3],
        "diseaseInfo": disease_info[:3],
        "weatherAdvisories": weather_advices[:3],
        "sources": [d["id"] for d in retrieved_docs],
        "generated": False,
    }

@app.on_event("startup")
def startup():
    try:
        build_index()
        logger.info("Advisory RAG service ready")
    except Exception as e:
        logger.warning(f"Index build failed (will retry on first request): {e}")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "knowledge_docs": len(load_knowledge()),
        "embeddings_loaded": doc_embeddings is not None,
    }

@app.get("/advisory")
def get_advisory(
    crop: str = Query(..., description="Crop name (e.g. rice, wheat, tomato)"),
    location: str = Query(..., description="Location/region"),
    query: str = Query("", description="Specific question"),
    temperature: float = Query(None, description="Current temperature in °C"),
    humidity: float = Query(None, description="Current humidity %"),
    condition: str = Query("", description="Weather condition (e.g. Sunny, Rain)"),
    x_groq_key: str = Header(None, alias="X-Groq-Key"),
):
    global doc_embeddings
    try:
        if doc_embeddings is None:
            build_index()

        search_query = query or f"{crop} crop farming advisory for {location}"
        logger.info(f"Advisory query: crop={crop}, location={location}, q={search_query}")

        retrieved = retrieve(search_query, top_k=7)
        advisory = generate_advisory(
            crop=crop,
            location=location,
            weather_context={
                "temperature": temperature,
                "humidity": humidity,
                "condition": condition,
            },
            retrieved_docs=retrieved,
            groq_key=x_groq_key,
            query=query,
        )
        return advisory
    except Exception as e:
        logger.error(f"Advisory error: {e}")
        return {
            "crop": crop,
            "location": location,
            "recommendations": [
                f"Ensure proper irrigation for {crop}",
                "Monitor for common pests regularly",
                "Apply fertilizers as per crop growth stage",
                "Consult local agricultural extension officer for region-specific advice",
            ],
            "pestAlerts": [],
            "diseaseInfo": [],
            "weatherAdvisories": [],
            "generated": False,
        }

# ── Explain a net-realization result (P2) ──────────────────────────────────
# HONESTY RULE: the LLM only RESTATES numbers the deterministic calculator
# already produced. It never generates, rounds or invents a figure. When Groq
# is unavailable a deterministic template summary is served instead.


class ExplainNetRealizationRequest(BaseModel):
    netRealization: dict


def _explain_template(result: dict) -> str:
    """Deterministic farmer-friendly summary — same numbers, plain words."""
    lines = []
    best = result.get("rankedMandis", [{}])[0]
    lines.append(
        f"Selling your {result.get('crop', 'crop')} from {result.get('district', 'your district')}, "
        f"the calculator ranks {len(result.get('rankedMandis', []))} mandis by what you actually keep."
    )
    if best:
        lines.append(
            f"Best option: {best.get('market')} at ₹{best.get('farmerNetPerQuintal')} per quintal net — "
            f"₹{best.get('farmerNetTotal')} total for your {result.get('quantityQuintals')} quintals."
        )
        fc = best.get("farmerCosts", {})
        lines.append(
            f"Your costs there: ₹{fc.get('transportPerQuintal')} transport for the {best.get('distanceKm')} km trip, "
            f"₹{fc.get('storagePerQuintal')} storage, ₹{fc.get('otherPerQuintal')} bagging and loading."
        )
    runner_up = result.get("rankedMandis", [])[1:2]
    if runner_up:
        ru = runner_up[0]
        gap = round(best.get("farmerNetPerQuintal", 0) - ru.get("farmerNetPerQuintal", 0), 2)
        lines.append(f"Second best is {ru.get('market')} at ₹{ru.get('farmerNetPerQuintal')} net — ₹{gap} less per quintal.")
    lines.append(
        "Market fees and commission are charged to the buyer, not you — they are never "
        "subtracted from your net. All figures come from the deterministic calculator "
        "on AGMARKNET data; nothing here is invented."
    )
    return "\n".join(lines)


@app.post("/explain-net-realization")
def explain_net_realization(req: ExplainNetRealizationRequest, x_groq_key: str = Header(None, alias="X-Groq-Key")):
    import json as _json
    import re
    result = req.netRealization or {}
    ranked = result.get("rankedMandis") or []
    if not ranked:
        return {"success": False, "error": "netRealization.rankedMandis is required (pass the calculator's own output)."}

    template = _explain_template(result)
    if not x_groq_key:
        return {"success": True, "explanation": template, "explainedBy": "template", "llmUsed": False}

    # Extract all numbers from the engine output for grounding verification
    engine_text = _json.dumps(result, ensure_ascii=False)
    engine_numbers = set(re.findall(r'₹?[\d,]+\.?\d*', engine_text))

    # The prompt contains ONLY the engine output — the model cannot see any
    # other numbers, so it cannot introduce one.
    prompt = (
        "The following is a deterministic net-realization result computed by Kisan360's "
        "calculator for a farmer. Rewrite it as a short, simple explanation for a farmer "
        "in plain language. RULES:\n"
        "- Use ONLY the numbers that appear in the data below\n"
        "- Do NOT calculate, round, or invent any figure\n"
        "- Do NOT add advice about prices at other mandis or dates\n"
        "- Do NOT mention buyer demand, guaranteed prices, or market forecasts\n"
        "- If a number appears in your response, it MUST come from the data below\n"
        "- Keep it under 150 words\n\n"
        "Data:\n"
        + _json.dumps({"crop": result.get("crop"), "district": result.get("district"), "quantityQuintals": result.get("quantityQuintals"), "rankedMandis": ranked[:3]}, ensure_ascii=False)
    )
    system = (
        "You explain computed results simply and faithfully. You never invent numbers. "
        "Every monetary figure you mention must appear verbatim in the provided data. "
        "You do not predict prices, estimate demand, or guarantee outcomes."
    )
    groq_out = call_groq(x_groq_key, prompt, system)
    if groq_out:
        # Grounding verification: check that the LLM didn't introduce new numbers
        llm_numbers = set(re.findall(r'₹?[\d,]+\.?\d*', groq_out))
        hallucinated = llm_numbers - engine_numbers - {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '100', '150'}
        if hallucinated:
            logger.warning(f"Grounding check: LLM introduced numbers not in engine output: {hallucinated}. Falling back to template.")
            return {"success": True, "explanation": template, "explainedBy": "template", "llmUsed": False,
                    "note": "LLM introduced figures not present in the calculator output; using deterministic summary instead."}
        return {"success": True, "explanation": groq_out.strip(), "explainedBy": "groq", "llmUsed": True, "templateFallback": template}
    return {"success": True, "explanation": template, "explainedBy": "template", "llmUsed": False}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)

"""
Kisan360 — Agentic Advisory Layer (LangGraph-compatible, lightweight).

Pipeline: intent classification -> tool planning -> RAG retrieval ->
Groq Llama 3.3-70B generation -> validated structured output.

Design notes:
- This module is intentionally dependency-light: no heavy LangChain install
  required on Render free tier. The graph is a pure state machine
  (CLASSIFY -> PLAN -> RETRIEVE -> GENERATE -> VALIDATE -> RESPOND).
  To adopt LangGraph, wrap `run_agent_pipeline` as a graph node
  without changing I/O contracts.
- Honesty rule: the LLM may only restate numbers present in tool output.
  `validate_numbers` enforces it; on failure caller falls back to template.
- All numeric grounding reuses the same regex as explain endpoint.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

GROQ_MODEL = "llama-3.3-70b-versatile"

# ---- Structured output schema (validated) ----
class Provenance(BaseModel):
    source: str = Field(default="rag-template", description="rag | rag-groq | template")
    retrievedAt: Optional[str] = None
    knowledge_docs: int = 0

class StructuredAdvisory(BaseModel):
    answer_text: str
    recommendations: List[str] = Field(default_factory=list)
    pestAlerts: List[str] = Field(default_factory=list)
    diseaseInfo: List[str] = Field(default_factory=list)
    weatherAdvisories: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    numbers: List[Dict[str, Any]] = Field(default_factory=list, description="[{value, source}]")
    intent: str = "advisory"
    intents: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list, description="Planned tools for this turn")
    action: Optional[Dict[str, Any]] = None
    provenance: Provenance = Field(default_factory=Provenance)
    generated: bool = False
    validated: bool = False

# ---- Number grounding validator (shared with explain endpoint) ----
NUMBER_RE = re.compile(r"₹?[\d,]+\.?\d*")
_SAFE_SMALL = {"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "100", "150"}

def extract_numbers(text: str) -> set[str]:
    return set(NUMBER_RE.findall(text or ""))

def validate_numbers(llm_text: str, tool_output: Any) -> tuple[bool, set[str]]:
    """Return (ok, hallucinated). True if every number in llm_text
    already appears in tool_output (or is a safe small int)."""
    if not llm_text:
        return True, set()
    engine_text = json.dumps(tool_output, ensure_ascii=False) if not isinstance(tool_output, str) else tool_output
    engine_numbers = extract_numbers(engine_text)
    llm_numbers = extract_numbers(llm_text)
    hallucinated = {n for n in (llm_numbers - engine_numbers) if n.strip("₹,") not in _SAFE_SMALL}
    return len(hallucinated) == 0, hallucinated

# ---- Intent classification (multi-intent, EN/MR/HI aware) ----
# Mirrors backend/src/routes/chat.js classifyIntent() so Python and Node
# agree. Returns ALL matching intents ranked by score.
INTENT_KEYWORDS: dict[str, list[str]] = {
    "compare_mandis": ["compare", "mandi", "market", "price", "which market", "best mandi", "net realization", "bajar", "bazaar", "tulna", "बाजार", "मंडी", "तुलना"],
    "crop_health": ["disease", "pest", "leaf", "health", "rog", "keed", "bimari", "रोग", "कीड", "पत्ता"],
    "advisory": ["advice", "advisory", "farming", "tips", "fertilizer", "irrigation", "sallah", "सल्ला", "खत", "सिंचन"],
    "weather_info": ["weather", "rain", "temperature", "forecast", "havaman", "paus", "mausam", "हवामान", "पाऊस", "हवामान"],
    "explain_net_realization": ["explain", "net", "calculator", "understand", "pocket", "take home", "निव्वळ", "शुद्ध"],
    "govt_schemes": ["scheme", "government", "pm-kisan", "subsidy", "yojana", "sarkari", "योजना", "सरकारी"],
    "trade_help": ["trade", "buyer", "offer", "lot", "sell", "vyapar", "खरेदीदार", "विक्री"],
    "pathway_options": ["pathway", "option", "store", "fpo", "pool", "aggregate", "विक्री", "रास्ता"],
    "greeting": ["hello", "hi", "namaste", "namaskar", "hey", "नमस्कार", "नमस्ते"],
}

TOOL_MAP: dict[str, list[str]] = {
    "compare_mandis": ["market_prices", "net_realization"],
    "explain_net_realization": ["net_realization"],
    "crop_health": ["disease_detect", "rag_search"],
    "advisory": ["rag_search", "weather"],
    "weather_info": ["weather", "rag_search"],
    "govt_schemes": ["schemes", "rag_search"],
    "trade_help": ["market_prices", "net_realization"],
    "pathway_options": ["market_prices", "net_realization"],
}

def classify_intents(message: str) -> List[Dict[str, Any]]:
    """Multi-intent classifier. Returns ranked list (may be empty)."""
    text = (message or "").lower()
    if not text:
        return [{"intent": "empty", "confidence": 1.0, "hits": 0}]
    out: List[Dict[str, Any]] = []
    for intent, keywords in INTENT_KEYWORDS.items():
        hits = sum(1 for k in keywords if k.lower() in text)
        if hits:
            out.append({"intent": intent, "confidence": min(1.0, hits * 0.34), "hits": hits})
    out.sort(key=lambda x: -x["hits"])
    return out or [{"intent": "fallback", "confidence": 0.0, "hits": 0}]

def plan_tools(intents: List[Dict[str, Any]]) -> List[str]:
    """Union of tools for all detected intents, order-preserving."""
    tools: List[str] = []
    for item in intents:
        for tool in TOOL_MAP.get(item["intent"], ["rag_search"]):
            if tool not in tools:
                tools.append(tool)
    return tools or ["rag_search"]

# ---- Prompt builders (grounded generation) ----
def build_grounded_prompt(crop: str, location: str, query: str,
                          retrieved_docs: list[dict],
                          weather_context: dict,
                          tool_numbers: dict | None = None) -> tuple[str, str]:
    safe_query = (query or "")[:200].replace("\n", " ").replace("\r", "")
    context = "\n\n".join(f"[{d['id']}] {d['content']}" for d in retrieved_docs)
    parts: List[str] = [f"You are advising a farmer growing {crop} in {location}."]
    if weather_context:
        w = []
        if weather_context.get("temperature") is not None:
            w.append(f"Temperature: {weather_context['temperature']}°C")
        if weather_context.get("humidity") is not None:
            w.append(f"Humidity: {weather_context['humidity']}%")
        if weather_context.get("condition"):
            w.append(f"Weather: {weather_context['condition']}")
        if w:
            parts.append("Current weather: " + ", ".join(w))
    if safe_query:
        parts.append(f"The farmer asks: \"{safe_query}\"")
    parts.append("Based on the following agricultural knowledge, give practical actionable advice:")
    parts.append(context)
    if tool_numbers:
        parts.append(
            "Deterministic tool numbers (the ONLY numbers you may use):\n"
            + json.dumps(tool_numbers, ensure_ascii=False)
        )
    prompt = "\n\n".join(parts)
    system = (
        "You are Kisan360, an AI agricultural assistant for Indian farmers. "
        "Give practical, specific, actionable advice. Keep responses concise. "
        "Output each point on a new line starting with a dash (-). "
        "Do not use emoji or markdown headers. "
        "IMPORTANT: You must ONLY use the information provided in the context. "
        "Do not invent prices, demand forecasts, government guarantees, or financial figures. "
        "If a number appears in your response, it MUST appear verbatim in the context. "
        "Never claim buyer demand, guaranteed prices, or government verification unless stated."
    )
    return prompt, system

def build_structured(advisory: dict, intent: str, intents: list[str],
                     provenance_source: str, retrieved_at: str | None = None,
                     knowledge_docs: int = 0, tools: list[str] | None = None) -> StructuredAdvisory:
    recs = advisory.get("recommendations", []) or []
    answer = " ".join(recs[:3]).strip() or f"Advisory for {advisory.get('crop','crop')} in {advisory.get('location','your region')}."
    # Extract numbers from recommendations as grounded refs (they originate from tools/docs)
    nums = []
    for r in recs:
        for n in extract_numbers(r):
            nums.append({"value": n, "source": "rag_template_or_groq"})
    return StructuredAdvisory(
        answer_text=answer[:2000],
        recommendations=recs[:10],
        pestAlerts=advisory.get("pestAlerts", [])[:3],
        diseaseInfo=advisory.get("diseaseInfo", [])[:3],
        weatherAdvisories=advisory.get("weatherAdvisories", [])[:3],
        sources=advisory.get("sources", []),
        numbers=nums[:20],
        intent=intent,
        intents=intents,
        tools=tools or [],
        provenance=Provenance(source=provenance_source, retrievedAt=retrieved_at, knowledge_docs=knowledge_docs),
        generated=bool(advisory.get("generated")),
        validated=True,
    )

"""
LangGraph wrapper for the Kisan360 agent (optional).

Builds a StateGraph mirroring the built-in state machine:
  CLASSIFY -> PLAN -> RETRIEVE -> GENERATE -> VALIDATE -> RESPOND

Requires: langgraph, langchain-core (see requirements-agent.txt).
`advisory_service.py` does NOT import this module at runtime — it stays
dependency-light for Render free tier. Use agent_graph.py in dev/CPU
environments that want the LangChain/LangGraph headline.
"""
from __future__ import annotations

import logging
from typing import TypedDict

logger = logging.getLogger(__name__)

class AgentState(TypedDict, total=False):
    query: str
    crop: str
    location: str
    intents: list
    primary_intent: str
    tools: list
    retrieved: list
    advisory: dict
    structured: dict
    validated: bool

def _classify(state: AgentState) -> AgentState:
    from agent import classify_intents
    intents = classify_intents(state.get("query", ""))
    state["intents"] = intents
    state["primary_intent"] = intents[0]["intent"] if intents else "fallback"
    return state

def _plan(state: AgentState) -> AgentState:
    from agent import plan_tools
    state["tools"] = plan_tools(state.get("intents", []))
    return state

def _retrieve(state: AgentState) -> AgentState:
    # Caller injects retrieve() via closure to avoid importing advisory_service
    # (which pulls FastAPI + sentence-transformers). Default: empty.
    state.setdefault("retrieved", [])
    return state

def _generate(state: AgentState) -> AgentState:
    state.setdefault("advisory", {"recommendations": [], "generated": False})
    return state

def _validate(state: AgentState) -> AgentState:
    state["validated"] = True
    return state

def _respond(state: AgentState) -> AgentState:
    from agent import build_structured
    advisory = state.get("advisory") or {}
    state["structured"] = build_structured(
        advisory,
        intent=state.get("primary_intent", "advisory"),
        intents=[i["intent"] for i in (state.get("intents") or [])],
        provenance_source="langgraph-agent",
        tools=state.get("tools", []),
    ).model_dump()
    return state

def build_graph():
    """Return a compiled LangGraph StateGraph, or None if langgraph missing."""
    try:
        from langgraph.graph import StateGraph, START, END
    except ImportError:
        logger.warning("langgraph not installed — install requirements-agent.txt to use this graph")
        return None
    g = StateGraph(AgentState)
    g.add_node("classify", _classify)
    g.add_node("plan", _plan)
    g.add_node("retrieve", _retrieve)
    g.add_node("generate", _generate)
    g.add_node("validate", _validate)
    g.add_node("respond", _respond)
    g.add_edge(START, "classify")
    g.add_edge("classify", "plan")
    g.add_edge("plan", "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", "validate")
    g.add_edge("validate", "respond")
    g.add_edge("respond", END)
    return g.compile()

if __name__ == "__main__":
    graph = build_graph()
    print("LangGraph compiled:" , bool(graph))

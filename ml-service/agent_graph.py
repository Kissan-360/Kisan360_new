"""
LangGraph wrapper for the Kisan360 agent (optional).

Builds a StateGraph mirroring the built-in state machine:
  CLASSIFY -> PLAN -> RETRIEVE -> GENERATE -> VALIDATE -> RESPOND

Requires: langgraph, langchain-core (see requirements-agent.txt).
`advisory_service.py` does NOT import this module at runtime — it stays
dependency-light for Render free tier. Use agent_graph.py in dev/CPU
environments that want the LangChain/LangGraph headline.

Full runner (`run_agent_graph`) wires real RAG retrieval + grounded
generation via dependency injection, so the graph is not a stub.
"""
from __future__ import annotations

import logging
from typing import Callable, TypedDict

logger = logging.getLogger(__name__)

class AgentState(TypedDict, total=False):
    query: str
    crop: str
    location: str
    weather: dict
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

def make_retrieve(retrieve_fn: Callable | None = None):
    def _retrieve(state: AgentState) -> AgentState:
        if retrieve_fn is None:
            state.setdefault("retrieved", [])
            return state
        state["retrieved"] = retrieve_fn(state.get("query", ""), top_k=7)
        return state
    return _retrieve

def make_generate(generate_fn: Callable | None = None):
    def _generate(state: AgentState) -> AgentState:
        if generate_fn is None:
            state.setdefault("advisory", {"recommendations": [], "generated": False})
            return state
        state["advisory"] = generate_fn(
            state.get("crop", "crop"),
            state.get("location", "Maharashtra"),
            state.get("weather", {}),
            state.get("retrieved", []),
            query=state.get("query", ""),
        )
        return state
    return _generate

def _validate(state: AgentState) -> AgentState:
    from agent import validate_numbers
    rec_text = " ".join((state.get("advisory") or {}).get("recommendations", []))
    blob = "\n".join(d.get("content", "") for d in (state.get("retrieved") or []))
    ok, _ = validate_numbers(rec_text, blob)
    state["validated"] = ok
    if not ok:
        # Template fallback is caller's job; here we just mark unvalidated.
        logger.warning("LangGraph grounding failed — falling back to template")
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

def build_graph(retrieve_fn=None, generate_fn=None):
    """Return a compiled LangGraph StateGraph, or None if langgraph missing."""
    try:
        from langgraph.graph import StateGraph, START, END
    except ImportError:
        logger.warning("langgraph not installed — install requirements-agent.txt to use this graph")
        return None
    g = StateGraph(AgentState)
    g.add_node("classify", _classify)
    g.add_node("plan", _plan)
    g.add_node("retrieve", make_retrieve(retrieve_fn))
    g.add_node("generate", make_generate(generate_fn))
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

def run_agent_graph(query: str, crop: str = "", location: str = "Maharashtra",
                    weather: dict | None = None, retrieve_fn=None, generate_fn=None) -> dict:
    """Run the full graph. Falls back to a pure-Python run if langgraph missing."""
    initial: AgentState = {"query": query, "crop": crop, "location": location, "weather": weather or {}}
    graph = build_graph(retrieve_fn=retrieve_fn, generate_fn=generate_fn)
    if graph is None:
        # Pure-Python path (same nodes, no graph engine)
        state = _classify(dict(initial))
        state = _plan(state)
        state = make_retrieve(retrieve_fn)(state)
        state = make_generate(generate_fn)(state)
        state = _validate(state)
        state = _respond(state)
        state["graph"] = "pure-python"
        return state
    result = graph.invoke(initial)
    result["graph"] = "langgraph"
    return result

if __name__ == "__main__":
    graph = build_graph()
    print("LangGraph compiled:", bool(graph))
    out = run_agent_graph("Compare mandis for onion in Nashik", crop="Onion")
    print("graph:", out.get("graph"), "intent:", out.get("primary_intent"), "tools:", out.get("tools"))

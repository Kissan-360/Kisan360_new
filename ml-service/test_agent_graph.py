"""Unit tests for the LangGraph runner (pure-Python fallback, no langgraph needed).

Run: python -m unittest test_agent_graph -v
"""
import unittest

from agent_graph import run_agent_graph

def _retrieve(query, top_k=7):
    return [{"id": "rice_001", "content": "Rice advisory", "tags": ["rice"], "score": 0.9}]

def _generate(crop, location, weather, docs, query=""):
    return {
        "crop": crop,
        "location": location,
        "recommendations": ["Test recommendation for onion"],
        "pestAlerts": [],
        "diseaseInfo": [],
        "weatherAdvisories": [],
        "sources": [d["id"] for d in docs],
        "generated": False,
    }

class AgentGraphTests(unittest.TestCase):
    def test_runs_pure_python_without_langgraph(self):
        out = run_agent_graph("Compare mandis for onion", crop="Onion", retrieve_fn=_retrieve, generate_fn=_generate)
        self.assertIn(out.get("graph"), ("langgraph", "pure-python"))
        self.assertEqual(out.get("primary_intent"), "compare_mandis")
        self.assertIn("market_prices", out.get("tools") or [])
        self.assertTrue(out.get("structured"))

    def test_validates_grounding(self):
        out = run_agent_graph("How to control thrips on onion", crop="Onion", retrieve_fn=_retrieve, generate_fn=_generate)
        self.assertIn("validated", out)
        self.assertTrue(out["validated"])

if __name__ == "__main__":
    unittest.main()

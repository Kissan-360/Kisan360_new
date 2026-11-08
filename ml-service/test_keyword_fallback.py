"""Unit tests for keyword fallback (no embeddings needed).

Run: python -m unittest test_keyword_fallback -v
"""
import unittest
from advisory_service import retrieve_keyword

class KeywordFallbackTests(unittest.TestCase):
    def test_returns_relevant_docs_for_query(self):
        res = retrieve_keyword("tomato early blight", top_k=5)
        self.assertTrue(len(res) > 0)
        ids = [d["id"] for d in res]
        # veg_001 is the tomato disease doc
        self.assertIn("veg_001", ids)

    def test_empty_query_returns_empty_or_no_crash(self):
        res = retrieve_keyword("", top_k=5)
        self.assertIsInstance(res, list)

    def test_score_present(self):
        res = retrieve_keyword("onion thrips", top_k=3)
        for d in res:
            self.assertIn("score", d)

if __name__ == "__main__":
    unittest.main()

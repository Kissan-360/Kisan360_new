"""Unit tests for the KVK PDF ingestion script.

Run: python -m unittest test_ingest_kvk -v
"""
import importlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest


SCRIPT = os.path.join(os.path.dirname(__file__), "scripts", "ingest_kvk.py")


def load_module():
    spec = importlib.util.spec_from_file_location("ingest_kvk", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IngestKvkTests(unittest.TestCase):
    def test_normalize_text_collapses_whitespace(self):
        module = load_module()
        text = module.normalize_text("Onion\u00a0thrips\n\n  cause   silvering.  ")
        self.assertEqual(text, "Onion thrips\ncause silvering.")

    def test_chunk_text_splits_long_paragraphs(self):
        module = load_module()
        text = " ".join([f"Sentence {i}." for i in range(80)])
        chunks = module.chunk_text(text, max_chars=120)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 120 for chunk in chunks))
        self.assertIn("Sentence 0.", chunks[0])

    def test_build_entries_uses_reviewable_metadata(self):
        module = load_module()
        entries = module.build_entries(
            "Onion Thrips Advisory.pdf",
            "Monitor thrips weekly and remove heavily infested leaves.",
            crop="Onion",
            source="ICAR/KVK",
            language="en",
        )
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["id"], "onion_thrips_advisory")
        self.assertEqual(entries[0]["tags"], ["onion"])
        self.assertEqual(entries[0]["source"], "ICAR/KVK")
        self.assertEqual(entries[0]["language"], "en")

    def test_extract_pdf_text_from_generated_pdf(self):
        try:
            fitz = importlib.import_module("fitz")
        except ImportError:
            self.skipTest("PyMuPDF is not installed")
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = os.path.join(tmp, "onion thrips.pdf")
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text(
                (72, 72),
                "Onion thrips cause silvering of leaves. Monitor weekly.",
                fontsize=11,
            )
            doc.save(pdf_path)
            doc.close()

            text = module.extract_pdf_text(pdf_path)
            self.assertIn("Onion thrips", text)
            self.assertIn("Monitor weekly", text)

    def test_cli_writes_review_entries(self):
        try:
            fitz = importlib.import_module("fitz")
        except ImportError:
            self.skipTest("PyMuPDF is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            pdf_dir = os.path.join(tmp, "pdfs")
            os.makedirs(pdf_dir)
            pdf_path = os.path.join(pdf_dir, "onion thrips.pdf")
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text(
                (72, 72),
                "Onion thrips cause silvering of leaves. Monitor weekly.",
                fontsize=11,
            )
            doc.save(pdf_path)
            doc.close()

            out_path = os.path.join(tmp, "knowledge_base_new.json")
            proc = subprocess.run(
                [
                    sys.executable,
                    SCRIPT,
                    "--pdfs",
                    pdf_dir,
                    "--out",
                    out_path,
                    "--crop",
                    "onion",
                    "--source",
                    "ICAR/KVK",
                    "--language",
                    "en",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            with open(out_path, encoding="utf-8") as f:
                entries = json.load(f)
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["id"], "onion_thrips")
            self.assertIn("Onion thrips", entries[0]["content"])
            self.assertEqual(entries[0]["language"], "en")


if __name__ == "__main__":
    unittest.main()

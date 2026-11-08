"""
Ingest ICAR/KVK/MPKV advisory PDFs into knowledge_base.py (scale path to 300+).

Usage:
  1. Download official PDFs (ICAR / KKV / MPKV / state agriculture dept).
  2. python scripts/ingest_kvk.py --pdfs ./pdfs --out knowledge_base.json
  3. Review JSON, merge into knowledge_base.py CROP_KNOWLEDGE with
     {id, content, tags, source, language}, then re-run embed_corpus.py.

Never auto-publish scraped content without source attribution and a
reviewer checking dose tables (pesticide rates must be verified).
"""
import argparse
import json
import glob
import os

def extract_text_stub(pdf_path: str) -> str:
    # TODO: wire pdfplumber/PyMuPDF in the ingestion env.
    return f"[TODO extract text from {pdf_path}]"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pdfs", required=True, help="Directory of official PDFs")
    p.add_argument("--out", default="knowledge_base_new.json")
    p.add_argument("--crop", default="")
    p.add_argument("--source", default="ICAR/KVK")
    args = p.parse_args()
    entries = []
    for pdf in sorted(glob.glob(os.path.join(args.pdfs, "*.pdf"))):
        text = extract_text_stub(pdf)
        entries.append({
            "id": os.path.splitext(os.path.basename(pdf))[0].replace(" ", "_").lower()[:40],
            "content": text,
            "tags": [args.crop.lower()] if args.crop else ["kvk"],
            "source": args.source,
        })
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(entries)} stub entries to {args.out} — review + merge manually.")

if __name__ == "__main__":
    main()

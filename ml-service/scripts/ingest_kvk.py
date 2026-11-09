"""
Ingest ICAR/KVK/MPKV advisory PDFs into JSON entries for knowledge_base.py.

Usage:
  1. Install ingestion-only dependencies:
       pip install -r requirements-ingest.txt
  2. Download official PDFs (ICAR / KVK / MPKV / state agriculture dept).
  3. python scripts/ingest_kvk.py --pdfs ./pdfs --out knowledge_base.json \
       --crop onion --source "ICAR/KVK" --language en
  4. Review JSON, merge into knowledge_base.py CROP_KNOWLEDGE with
     {id, content, tags, source, language}, then re-run embed_corpus.py.

Never auto-publish scraped content without source attribution and a
reviewer checking dose tables (pesticide rates must be verified).
"""
import argparse
import glob
import json
import os
import re
import unicodedata


def normalize_text(text: str) -> str:
    """Normalize extracted PDF text for stable corpus ingestion."""
    cleaned = unicodedata.normalize("NFKC", text or "")
    cleaned = cleaned.replace("\u00a0", " ")
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", cleaned)
    lines = []
    for line in cleaned.splitlines():
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def slugify_id(pdf_path: str) -> str:
    stem = os.path.splitext(os.path.basename(pdf_path))[0]
    slug = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    return (slug or "kvk_doc")[:40].strip("_") or "kvk_doc"


def extract_with_fitz(pdf_path: str, max_pages: int = 0) -> str:
    try:
        import fitz
    except ImportError as exc:
        raise ImportError(
            "PyMuPDF is required for PDF ingestion. Install requirements-ingest.txt."
        ) from exc

    with fitz.open(pdf_path) as doc:
        pages = []
        for index, page in enumerate(doc):
            if max_pages and index >= max_pages:
                break
            pages.append(page.get_text("text") or "")
    return "\n\n".join(pages)


def extract_with_pypdf(pdf_path: str, max_pages: int = 0) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ImportError(
            "pypdf is required for PDF ingestion. Install requirements-ingest.txt."
        ) from exc

    reader = PdfReader(pdf_path)
    pages = []
    for index, page in enumerate(reader.pages):
        if max_pages and index >= max_pages:
            break
        pages.append(page.extract_text() or "")
    return "\n\n".join(pages)


def extract_pdf_text(pdf_path: str, max_pages: int = 0) -> str:
    """Extract text with PyMuPDF, falling back to pypdf."""
    errors = []
    for extractor in (extract_with_fitz, extract_with_pypdf):
        try:
            text = normalize_text(extractor(pdf_path, max_pages=max_pages))
            if text:
                return text
            errors.append(f"{extractor.__name__}: no extractable text")
        except Exception as exc:  # noqa: BLE001 - report both backend failures
            errors.append(f"{extractor.__name__}: {exc}")
    raise RuntimeError(
        f"Could not extract text from {pdf_path}: " + "; ".join(errors)
    )


def chunk_text(text: str, max_chars: int = 1200) -> list[str]:
    """Split long advisory text into paragraph-aware chunks."""
    normalized = normalize_text(text)
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    chunks = []
    current = ""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", normalized) if p.strip()]
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        while len(paragraph) > max_chars:
            cut = paragraph.rfind(" ", 0, max_chars + 1)
            if cut <= 0:
                cut = max_chars
            chunks.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        current = paragraph

    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk]


def build_entries(
    pdf_path: str,
    text: str,
    crop: str = "",
    source: str = "ICAR/KVK",
    language: str = "en",
    max_chars: int = 1200,
) -> list[dict]:
    chunks = chunk_text(text, max_chars=max_chars)
    base_id = slugify_id(pdf_path)
    tags = [crop.lower()] if crop else ["kvk"]
    entries = []
    for index, chunk in enumerate(chunks, start=1):
        entry_id = base_id if len(chunks) == 1 else f"{base_id}_{index:03d}"
        entries.append(
            {
                "id": entry_id,
                "content": chunk,
                "tags": tags,
                "source": source,
                "language": language or "en",
            }
        )
    return entries


def unique_entries(entries: list[dict]) -> list[dict]:
    seen = {}
    unique = []
    for entry in entries:
        base_id = entry["id"]
        count = seen.get(base_id, 0) + 1
        seen[base_id] = count
        if count > 1:
            entry = {**entry, "id": f"{base_id}_{count}"}
        unique.append(entry)
    return unique


def pdf_files(pdf_dir: str, recursive: bool = False) -> list[str]:
    pattern = os.path.join(pdf_dir, "**", "*.pdf") if recursive else os.path.join(pdf_dir, "*.pdf")
    return sorted(glob.glob(pattern, recursive=recursive))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdfs", required=True, help="Directory of official PDFs")
    parser.add_argument("--out", default="knowledge_base_new.json")
    parser.add_argument("--crop", default="")
    parser.add_argument("--source", default="ICAR/KVK")
    parser.add_argument("--language", default="en")
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--max-pages", type=int, default=0, help="0 means all pages")
    parser.add_argument("--max-chars", type=int, default=1200)
    args = parser.parse_args()

    entries = []
    skipped = 0
    for pdf in pdf_files(args.pdfs, recursive=args.recursive):
        try:
            text = extract_pdf_text(pdf, max_pages=args.max_pages)
        except Exception as exc:  # noqa: BLE001 - ingestion should report per-file failures
            print(f"Skipped {pdf}: {exc}")
            skipped += 1
            continue
        entries.extend(
            build_entries(
                pdf,
                text,
                crop=args.crop,
                source=args.source,
                language=args.language,
                max_chars=args.max_chars,
            )
        )

    entries = unique_entries(entries)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
    print(
        f"Wrote {len(entries)} entries to {args.out} "
        f"({skipped} skipped) — review + merge manually."
    )


if __name__ == "__main__":
    main()

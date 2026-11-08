"""Pre-embed the RAG corpus so the advisory service skips cold-start embedding.

Usage:
  python scripts/embed_corpus.py [--out corpus_embeddings.npy]

Requires sentence-transformers + numpy. Writes .npy next to advisory_service.py
where build_index() expects it via EMBED_CACHE env var.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None)
    args = parser.parse_args()
    from knowledge_base import CROP_KNOWLEDGE
    from sentence_transformers import SentenceTransformer
    import numpy as np

    base = os.path.join(os.path.dirname(__file__), "..")
    out = args.out or os.environ.get("EMBED_CACHE") or os.path.join(base, "corpus_embeddings.npy")
    texts = [d["content"] for d in CROP_KNOWLEDGE]
    print(f"Embedding {len(texts)} docs with all-MiniLM-L6-v2 ...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    vecs = model.encode(texts, convert_to_numpy=True)
    np.save(out, vecs)
    print(f"Wrote {out} shape={vecs.shape}")
    # Optional FAISS index (if faiss-cpu installed) — advisory_service
    # still uses numpy cosine, but the .index is shipped for scale-out.
    try:
        import faiss
        idx = faiss.IndexFlatIP(vecs.shape[1])  # inner product == cosine on normalized? vectors are not normalized; numpy path normalizes
        faiss.normalize_L2(vecs)
        idx.add(vecs)
        faiss.write_index(idx, out.replace(".npy", ".faiss"))
        print(f"Wrote {out.replace('.npy', '.faiss')} (FAISS InnerProduct on L2-normalized vectors)")
    except ImportError:
        print("faiss-cpu not installed — skipping FAISS index (numpy path still works)")

if __name__ == "__main__":
    main()

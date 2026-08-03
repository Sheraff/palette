"""Find covers that contain a named thing, by text query over the stored embeddings.

Probe 5 (noun breadth) needs ~20 covers that actually CONTAIN a dog, a guitar, a castle,
a snake ... and the repo has no content labels. Probe 4 solved the same problem with
DINOv3 nearest-neighbour search seeded from a cover already known to contain the target;
that trick needs a seed, and probe 5 needs twenty different targets with no seed for any
of them.

So this uses the OTHER property of the embedding store: two of the six arms are
text-aligned (`siglip2-so400m`, `pe-core-l14`, config.ARMS[...]["text_aligned"]). The
image side of the SigLIP2 arm is already computed and committed for both collections
(16,145 vectors), the vectors are L2-normalized on write, so a text query is one forward
pass through the text tower plus a dot product. The embeddings workstream's own note says
"we never query these embeddings by text" — that is a statement about the three PRODUCTION
uses (near-duplicate detection, stratification, failure retrieval), not a prohibition; this
is a corpus-search instrument for building a probe list, exactly as probe 4 used the DINOv3
index for the same purpose.

  ../embeddings/.venv/bin/python find_noun_covers.py --out ../../data/sam/probe-5-search.json

CPU ONLY (`--device cpu`, the default here). The GPU is single-owner and the orchestrator
owns the queue; nothing in this file may touch it. Reads the embeddings workstream's data
and modules; writes only into data/sam/.

Every candidate this returns is a SUGGESTION. Nothing goes on the probe list until the
image has been opened and its content confirmed by eye.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# The embeddings workstream owns these modules; we import them read-only.
EMBEDDINGS_DIR = Path(__file__).resolve().parent.parent / "embeddings"
sys.path.insert(0, str(EMBEDDINGS_DIR))

import config as emb_config  # noqa: E402
import query as emb_query  # noqa: E402

# [REVIEWED] The text-aligned arm to search with. SigLIP2 so400m is the pipeline's
# DEFAULT_ARM and the only text-aligned arm whose weights hash is pinned in
# embeddings/config.py (PE-Core is also text-aligned and would be a second opinion).
SEARCH_ARM = emb_config.ARM_SIGLIP2

# [INHERITED] Prompt ensembling, the standard CLIP/SigLIP recipe: encode the noun under
# several templates, average the normalized text vectors, renormalize. One template alone
# makes the ranking depend on incidental style words. The album-cover template is included
# because that is the domain being searched.
PROMPT_TEMPLATES = (
    "a photo of a {}.",
    "a {}.",
    "an album cover with a {} on it.",
    "artwork of a {}.",
)


def encode_text(nouns: list[str], device: str):
    """(n, dim) L2-normalized float32 text vectors, one row per noun."""
    import numpy as np
    import open_clip
    import torch

    spec = emb_config.ARMS[SEARCH_ARM]
    model, _, _ = open_clip.create_model_and_transforms(
        spec["model_id"], pretrained=spec["pretrained"]
    )
    model.eval().to(device)
    tokenizer = open_clip.get_tokenizer(spec["model_id"])

    rows = []
    with torch.no_grad():
        for noun in nouns:
            tokens = tokenizer([t.format(noun) for t in PROMPT_TEMPLATES]).to(device)
            vectors = model.encode_text(tokens)
            vectors = vectors / vectors.norm(dim=-1, keepdim=True)
            mean = vectors.mean(dim=0)
            mean = mean / mean.norm()
            rows.append(mean.to("cpu").float().numpy())
    return np.stack(rows).astype("float32")


def main() -> int:
    import numpy as np

    ap = argparse.ArgumentParser()
    ap.add_argument("--nouns", nargs="+", required=True)
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument("--device", default="cpu", help="cpu only; the GPU is the orchestrator's")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if args.device != "cpu":
        raise SystemExit("find_noun_covers.py is CPU-only by policy (CONVENTIONS.md, GPU queue)")

    loaded = {}
    for collection in emb_config.COLLECTIONS:
        loaded[collection] = emb_query.load_collection(
            emb_config.DATA_DIR, collection, SEARCH_ARM
        )
        print(f"[search] {collection}: {loaded[collection][0].shape[0]} vectors", flush=True)

    text = encode_text(args.nouns, args.device)

    out: dict[str, list] = {}
    for i, noun in enumerate(args.nouns):
        hits = []
        for collection, (matrix, rows) in loaded.items():
            sims = matrix @ text[i]
            take = min(args.k, sims.shape[0])
            top = np.argpartition(-sims, take - 1)[:take]
            top = top[np.argsort(-sims[top])]
            for index in top:
                hits.append({
                    "similarity": round(float(sims[index]), 4),
                    "collection": collection,
                    "path": rows[index]["path"],
                    "width": rows[index].get("width"),
                    "height": rows[index].get("height"),
                })
        hits.sort(key=lambda h: -h["similarity"])
        out[noun] = hits[: args.k]
        print(f"\n== {noun}")
        for h in out[noun]:
            print(f"  {h['similarity']:+.4f}  {h['path']}")

    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(
            {"arm": SEARCH_ARM, "templates": list(PROMPT_TEMPLATES), "results": out},
            indent=2,
        ))
        print(f"\nwrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

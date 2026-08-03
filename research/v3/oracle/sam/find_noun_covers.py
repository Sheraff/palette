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
#
# By file path, under their own names, NOT by putting their directory on sys.path. Both
# workstreams have a module called `config`, so `sys.path.insert(...); import config` binds
# whichever one is already in sys.modules — and in any process that touched the SAM config first
# (selftest.py, or any script that imports this one after `import config`) that is the SAM config,
# and the very next line dies with `module 'config' has no attribute 'ARM_SIGLIP2'`. Found
# 2026-08-03 by the new import sweep in selftest.py. Loading by path gives each module a distinct
# name and makes the collision impossible.
EMBEDDINGS_DIR = Path(__file__).resolve().parent.parent / "embeddings"


# The bare module names both workstreams use. While an embeddings module is executing, these must
# resolve to the EMBEDDINGS ones (they import each other by bare name); afterwards sys.modules is
# put back exactly as it was, so nothing this file does can change what `import config` means for
# the rest of the process.
_SHARED_MODULE_NAMES = ("config", "common")


def _load_embeddings_modules(*stems: str) -> dict:
    """Import research/v3/oracle/embeddings/<stem>.py under distinct names. Read-only.

    One call for the whole set, because they import each other and the sys.modules swap has to
    span the lot.
    """
    import importlib.util  # noqa: PLC0415

    loaded = {stem: sys.modules.get(f"embeddings_{stem}") for stem in stems}
    if all(module is not None for module in loaded.values()):
        return loaded

    saved = {name: sys.modules.get(name) for name in _SHARED_MODULE_NAMES}
    sys.path.insert(0, str(EMBEDDINGS_DIR))
    try:
        # Drop our own bindings for the shared names so the embeddings ones load in their place.
        for name in _SHARED_MODULE_NAMES:
            sys.modules.pop(name, None)
        for stem in stems:
            alias = f"embeddings_{stem}"
            spec = importlib.util.spec_from_file_location(alias, EMBEDDINGS_DIR / f"{stem}.py")
            if spec is None or spec.loader is None:
                raise ImportError(f"cannot load {EMBEDDINGS_DIR / f'{stem}.py'}")
            module = importlib.util.module_from_spec(spec)
            sys.modules[alias] = module
            # Also visible under its bare name for the duration, so a sibling that does
            # `import config` inside this block gets the embeddings one.
            if stem in _SHARED_MODULE_NAMES:
                sys.modules[stem] = module
            spec.loader.exec_module(module)
            loaded[stem] = module
    finally:
        for name, module in saved.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
        if sys.path and sys.path[0] == str(EMBEDDINGS_DIR):
            sys.path.pop(0)
    return loaded


_embeddings = _load_embeddings_modules("config", "common", "query")
emb_config = _embeddings["config"]
emb_query = _embeddings["query"]

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

"""Does the embedding stage produce the same vector twice?

Three questions, because they have different answers and different consequences:

1. Same image, twice in one process, batch of 1 both times.
   If this is not bit-identical, nothing downstream is reproducible.
2. Same image, at different positions inside different batch compositions.
   This is the one that matters for a resumable run: resuming re-batches the
   remaining files differently, so if batch composition moves the numbers, the
   same corpus embedded in one pass and in three passes is not the same file.
3. Same image, across two separate processes.
   Catches state that leaks in from load order or an uninitialised buffer.

Usage:
  .venv/bin/python determinism_check.py --image 00/<name> --image music-artworks/...
  .venv/bin/python determinism_check.py --emit /tmp/run-a.npy --image ...
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import config
import common

# [REVIEWED] Batch sizes used for the composition test. 1 isolates the image; 8
# and 32 bracket the production batch size (config.DEFAULT_BATCH_SIZE).
COMPOSITION_BATCH_SIZES = (1, 8, 32)


def main() -> int:
    import numpy as np
    import torch

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", action="append", required=True)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--emit", help="write the batch-of-1 vectors here as .npy")
    parser.add_argument("--compare", help="compare against a previously emitted .npy")
    parser.add_argument(
        "--filler", default=None,
        help="image used to pad composition batches; defaults to the first --image",
    )
    args = parser.parse_args()

    device = common.resolve_device(args.device)
    model, preprocess = common.load_model(device)

    def to_abs(path_str: str) -> Path:
        path = Path(path_str)
        return path if path.is_absolute() else config.REPO_ROOT / path

    images = [common.decode_image(to_abs(p)).rgb for p in args.image]
    filler = common.decode_image(to_abs(args.filler or args.image[0])).rgb

    def encode(pil_images):
        tensors = [preprocess(image) for image in pil_images]
        batch = torch.stack(tensors).to(device)
        with torch.no_grad():
            vectors = model.encode_image(batch)
            vectors = vectors / vectors.norm(dim=-1, keepdim=True)
        return vectors.to("cpu").float().numpy()

    report: dict = {"device": device, "model": config.MODEL_NAME, "images": args.image}

    # 1. Same process, batch of 1, twice.
    first = np.stack([encode([image])[0] for image in images])
    second = np.stack([encode([image])[0] for image in images])
    report["repeat_same_process_batch1"] = {
        "max_abs_diff": float(np.abs(first - second).max()),
        "bit_identical": bool((first == second).all()),
    }

    # 2. Batch composition: put the image at position 0 of batches of several sizes.
    composition = {}
    for size in COMPOSITION_BATCH_SIZES:
        vectors = np.stack(
            [encode([image] + [filler] * (size - 1))[0] for image in images]
        )
        composition[f"batch_{size}"] = {
            "max_abs_diff_vs_batch1": float(np.abs(vectors - first).max()),
            "bit_identical_vs_batch1": bool((vectors == first).all()),
            "min_cosine_vs_batch1": float((vectors * first).sum(axis=1).min()),
        }
    report["batch_composition"] = composition

    # A last-position check: same batch size, different neighbours.
    tail = np.stack([encode([filler] * 7 + [image])[-1] for image in images])
    report["position_in_batch"] = {
        "max_abs_diff_first_vs_last_of_8": float(np.abs(tail - first).max()),
        "min_cosine": float((tail * first).sum(axis=1).min()),
    }

    report["l2_norm"] = {
        "min": float(np.linalg.norm(first, axis=1).min()),
        "max": float(np.linalg.norm(first, axis=1).max()),
    }

    if args.emit:
        np.save(args.emit, first)
        report["emitted"] = args.emit

    if args.compare:
        other = np.load(args.compare)
        report["across_processes"] = {
            "reference": args.compare,
            "max_abs_diff": float(np.abs(first - other).max()),
            "bit_identical": bool((first == other).all()),
            "min_cosine": float((first * other).sum(axis=1).min()),
        }

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

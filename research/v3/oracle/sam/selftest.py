"""Self-test for the SAM stage. No model, no GPU — pure data-shape checks.

    .venv/bin/python selftest.py
"""

from __future__ import annotations

import json
import sys

import numpy as np

import common
import config


def check(name: str, condition: bool, detail: str = "") -> bool:
    print(f"{'PASS' if condition else 'FAIL'}  {name}{(' — ' + detail) if detail else ''}")
    return condition


def test_rle_roundtrip() -> bool:
    rng = np.random.default_rng(20260803)
    ok = True
    cases = [
        np.zeros((7, 5), dtype=np.uint8),
        np.ones((7, 5), dtype=np.uint8),
        (rng.random((64, 64)) > 0.5).astype(np.uint8),
        (rng.random((155, 400)) > 0.9).astype(np.uint8),      # non-square, sparse
        (rng.random((300, 300)) > 0.02).astype(np.uint8),     # non-square-ish, dense
        np.eye(37, 61, dtype=np.uint8),
    ]
    # A run longer than 2**15, to exercise multi-character counts and the delta coding.
    big = np.zeros((400, 400), dtype=np.uint8)
    big[100:300, 100:300] = 1
    cases.append(big)
    for i, mask in enumerate(cases):
        s = common.rle_encode(mask)
        back = common.rle_decode(s, *mask.shape)
        good = np.array_equal(mask, back)
        ok &= check(f"rle roundtrip case {i} {mask.shape}", good,
                    f"{len(s)} chars, {int(mask.sum())} set")
    return ok


def test_rle_known_vector() -> bool:
    """A hand-checked vector. 4x4 mask, top-left 2x2 set. Read column-major the pixels are
    1,1,0,0, 1,1,0,0, then eight zeros, so the runs are 0,2,2,2,10 — the leading 0 being
    COCO's mandatory zero-run."""
    mask = np.zeros((4, 4), dtype=np.uint8)
    mask[0:2, 0:2] = 1
    s = common.rle_encode(mask)
    counts = common.rle_decode_counts(s)
    return (check("rle counts for 4x4 top-left 2x2", counts == [0, 2, 2, 2, 10],
                  str(counts))
            and check("rle first run is the zero-run", counts[0] == 0))


def test_identity() -> bool:
    ok = True
    ref = common.ImageRef.from_rel("03/ab67616d00001e0200034fd1f86970643e18bf98.jpg")
    ok &= check("sharded collection", ref.collection == config.COLLECTION_SHARDED)
    ok &= check("sharded artwork_id is the 24-char suffix",
                ref.artwork_id == "00034fd1f86970643e18bf98", ref.artwork_id)
    ok &= check("sharded image_id is the filename",
                ref.image_id == "ab67616d00001e0200034fd1f86970643e18bf98.jpg")

    ref = common.ImageRef.from_rel("music-artworks/5/a/2/5a2ed3e7b225548114942aeea99b4b55_1082x1082.avif")
    ok &= check("music collection", ref.collection == config.COLLECTION_MUSIC_ARTWORKS)
    ok &= check("music artwork_id drops the rendition suffix",
                ref.artwork_id == "5a2ed3e7b225548114942aeea99b4b55", ref.artwork_id)
    ok &= check("music image_id is the full relative path",
                ref.image_id.startswith("music-artworks/"))
    return ok


def test_row_key_sensitivity() -> bool:
    a = common.row_key("deadbeef")
    original = config.SCORE_THRESHOLD
    try:
        config.SCORE_THRESHOLD = original + 0.1
        b = common.row_key("deadbeef")
    finally:
        config.SCORE_THRESHOLD = original
    return check("row_key changes when the score threshold changes", a != b)


def test_concept_groups() -> bool:
    concepts = {c for c, _ in config.CONCEPT_PROMPTS}
    grouped = [c for g in config.CONCEPT_GROUPS.values() for c in g]
    return (check("every concept is in exactly one group",
                  sorted(grouped) == sorted(concepts) and len(grouped) == len(set(grouped)))
            and check("concept set hash is stable",
                      common.concept_set_hash() == common.concept_set_hash()))


def test_union_and_residual() -> bool:
    h, w = 20, 10
    a = np.zeros((h, w), dtype=np.uint8); a[0:10, :] = 1
    b = np.zeros((h, w), dtype=np.uint8); b[5:15, :] = 1
    instances = [
        common.Instance("text", 0, 0.9, (0, 0, 1, 0.5), float(a.sum()) / (h * w), a),
        common.Instance("person", 0, 0.8, (0, 0.25, 1, 0.5), float(b.sum()) / (h * w), b),
    ]
    union = common.union_mask(instances, h, w)
    frac = float(union.sum()) / (h * w)
    return (check("union covers the OR, not the sum", abs(frac - 0.75) < 1e-9, f"{frac}")
            and check("residual is 1 - masked", abs((1 - frac) - 0.25) < 1e-9))


def test_pycocotools_agreement() -> bool:
    """Optional cross-check against the reference implementation, if it happens to be
    importable. Skipped rather than failed when absent — it is not a pinned dependency."""
    try:
        from pycocotools import mask as coco_mask
    except ImportError:
        print("SKIP  pycocotools cross-check (not installed)")
        return True
    rng = np.random.default_rng(1)
    m = np.asfortranarray((rng.random((51, 83)) > 0.7).astype(np.uint8))
    ref = coco_mask.encode(m)["counts"].decode("ascii")
    return check("counts string matches pycocotools", ref == common.rle_encode(m))


def main() -> int:
    results = [
        test_rle_roundtrip(),
        test_rle_known_vector(),
        test_identity(),
        test_row_key_sensitivity(),
        test_concept_groups(),
        test_union_and_residual(),
        test_pycocotools_agreement(),
    ]
    ok = all(results)
    print(f"\n{'ALL PASS' if ok else 'FAILURES PRESENT'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

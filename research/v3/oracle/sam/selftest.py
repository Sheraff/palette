"""Self-test for the SAM stage. No model, no GPU — pure data-shape checks.

    .venv/bin/python selftest.py
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

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


def test_overlay_colors() -> bool:
    """overlay.CONCEPT_COLORS asserts against config on import — but only if something
    imports it, and the run path never does. Import it here so a concept added to config
    without a colour fails the model-free self-test instead of the first review round."""
    import overlay  # noqa: PLC0415 — imported here on purpose, to exercise its assert

    concepts = {c for c, _ in config.CONCEPT_PROMPTS}
    distinct = len({tuple(v) for v in overlay.CONCEPT_COLORS.values()})
    return (check("every concept has an overlay colour",
                  set(overlay.CONCEPT_COLORS) == concepts)
            and check("no two concepts share a colour",
                      distinct == len(overlay.CONCEPT_COLORS),
                      f"{distinct} colours for {len(overlay.CONCEPT_COLORS)} concepts"))


def test_every_module_imports() -> bool:
    """Import every module in this package, so every step-lock assert anywhere in it is exercised.

    Round-1 lesson, the expensive way. `overlay.CONCEPT_COLORS` had a step-lock assert and
    test_overlay_colors below imported it on purpose so the assert would fire in the model-free
    self-test. `review_round_2.CONCEPT_LABELS` had the same assert and nothing imported it — so
    when `barcode` was added for concept set v2.1 the assert fired on import, review_round_2 and
    build-ratification-fixture.ts were both dead, and this file still printed ALL PASS (phase-0
    adversarial review, finding 5).

    The fix is not "also import review_round_2". It is to stop maintaining a list: import the
    whole directory, so the NEXT module with its own copy of a config table is covered on the day
    it is written. Nothing here loads a model — every module imports mlx lazily, inside a
    function. Files without an `if __name__` guard are scripts, not modules: importing one would
    run it, so they are skipped by that structural test rather than by name.
    """
    here = Path(__file__).resolve().parent
    ok = True
    imported = []
    for path in sorted(here.glob("*.py")):
        if path.name == Path(__file__).name:
            continue
        already_imported = path.stem in sys.modules
        if not already_imported and "if __name__" not in path.read_text(encoding="utf-8"):
            print(f"SKIP  import {path.stem} (no __main__ guard — a script, not a module)")
            continue
        try:
            importlib.import_module(path.stem)
            imported.append(path.stem)
            detail = ""
            good = True
        except Exception as exc:  # noqa: BLE001 — the failure IS the result
            detail = f"{type(exc).__name__}: {exc}"
            good = False
        ok &= check(f"import {path.stem}", good, detail)
    return ok and check("the import sweep covered every module", len(imported) > 0,
                        f"{len(imported)} modules")


def test_concept_label_step_lock() -> bool:
    """Every hand-maintained per-concept table covers exactly the current concept set.

    The import sweep above catches the ones that assert on import. This states the invariant
    directly, so a table that loses its assert is still caught.
    """
    import overlay  # noqa: PLC0415
    import review_round_2  # noqa: PLC0415

    concepts = {c for c, _ in config.CONCEPT_PROMPTS}
    ok = check("overlay.CONCEPT_COLORS covers the concept set",
               set(overlay.CONCEPT_COLORS) == concepts,
               str(sorted(concepts ^ set(overlay.CONCEPT_COLORS))))
    ok &= check("review_round_2.CONCEPT_LABELS covers the concept set",
                set(review_round_2.CONCEPT_LABELS) == concepts,
                str(sorted(concepts ^ set(review_round_2.CONCEPT_LABELS))))
    ok &= check("every review_round_2 label override names a live concept",
                set(review_round_2.CONCEPT_LABEL_OVERRIDES) <= concepts)
    return ok


def test_model_manifest_in_step() -> bool:
    """data/sam/model-manifest.json must pin the concept set the config actually runs.

    Unlocked and rotted until 2026-08-03 (phase-0 adversarial review, finding 11): the manifest
    still pinned the pre-v1 7-concept §8.3 set two concept-set generations after it was replaced,
    because pin_model.py writes those fields and nothing ever compared them back. A pin nothing
    checks is a decoration.
    """
    path = config.MODEL_MANIFEST_PATH
    if not path.exists():
        return check("model-manifest.json exists", False, str(path))
    manifest = json.loads(path.read_text(encoding="utf-8"))
    in_step = manifest.get("concept_set_hash") == common.concept_set_hash()
    ok = check("model-manifest concept_set_hash matches config", in_step,
               "" if in_step else
               f"{manifest.get('concept_set_hash', '')[:12]} vs {common.concept_set_hash()[:12]} "
               "— regenerate with pin_model.py")
    ok &= check("model-manifest concepts match config",
                manifest.get("concepts") == [c for c, _ in config.CONCEPT_PROMPTS])
    ok &= check("model-manifest score_threshold matches config",
                manifest.get("score_threshold") == config.SCORE_THRESHOLD)
    return ok


def test_calibrated_cut() -> bool:
    """The calibrated cut is one predicate — a score threshold AND an area guard — and the
    per-group table only ever names real groups."""
    ok = check("every calibrated group threshold names a real group",
               set(config.CALIBRATED_GROUP_THRESHOLDS) <= set(config.CONCEPT_GROUPS),
               str(sorted(set(config.CALIBRATED_GROUP_THRESHOLDS) - set(config.CONCEPT_GROUPS))))
    ok &= check("a text_like concept gets the text_like threshold",
                config.calibrated_threshold_for("letter")
                == config.CALIBRATED_GROUP_THRESHOLDS["text_like"])
    ok &= check("an ungrouped group falls back to the pooled cut",
                config.calibrated_threshold_for("person") == config.CALIBRATED_SCORE_THRESHOLD)
    ok &= check("an unknown concept falls back to the pooled cut",
                config.calibrated_threshold_for("no-such-concept")
                == config.CALIBRATED_SCORE_THRESHOLD)
    big = config.CALIBRATED_MAX_AREA_FRACTION + 0.01
    # `sticker` is mark_like, which mask round 3 left UNDECIDED — the guard stays on for it, and
    # the guard's one in-sample win (8b4f2aadf3b1:sticker:0) is exactly this shape. `person` used
    # to stand here; it is now exempt, which is the assertion two lines down.
    ok &= check("the area guard rejects a high-scoring whole-image mask of a guarded group",
                not config.passes_calibrated_cut(0.99, big, "sticker"))
    ok &= check("the area guard can be switched off for a pre-guard artifact",
                config.passes_calibrated_cut(0.99, big, "sticker", max_area_fraction=None))
    ok &= check("a small high-scoring mask passes",
                config.passes_calibrated_cut(0.99, 0.01, "person"))
    # Mask round 3 (loose end A6): person_like is exempt from the area guard, everything else is
    # not, and the pre-2026-08-04 uniform rule stays reproducible.
    ok &= check("every guard-exempt group names a real group",
                config.GUARD_EXEMPT_GROUPS <= set(config.CONCEPT_GROUPS),
                str(sorted(config.GUARD_EXEMPT_GROUPS - set(config.CONCEPT_GROUPS))))
    ok &= check("a big-area mask of an exempt group survives the guard",
                config.passes_calibrated_cut(0.99, big, "person"))
    ok &= check("the exemption can be suppressed to reproduce a uniform-guard artifact",
                not config.passes_calibrated_cut(0.99, big, "person",
                                                 apply_group_exemptions=False))
    ok &= check("the exemption does not rescue a mask below its score cut",
                not config.passes_calibrated_cut(0.1, big, "person"))
    ok &= check("the exemption does not reach a group outside GUARD_EXEMPT_GROUPS",
                not config.passes_calibrated_cut(0.99, big, "emblem"))
    ok &= check("the sweep optimum is below the stored rounded cut",
                config.CALIBRATED_SWEEP_OPTIMUM < config.CALIBRATED_SCORE_THRESHOLD,
                f"{config.CALIBRATED_SWEEP_OPTIMUM} < {config.CALIBRATED_SCORE_THRESHOLD}")
    return ok


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
        test_overlay_colors(),
        test_every_module_imports(),
        test_concept_label_step_lock(),
        test_model_manifest_in_step(),
        test_calibrated_cut(),
        test_union_and_residual(),
        test_pycocotools_agreement(),
    ]
    ok = all(results)
    print(f"\n{'ALL PASS' if ok else 'FAILURES PRESENT'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

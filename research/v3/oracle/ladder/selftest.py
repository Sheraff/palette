"""Model-free checks of the ladder machinery.

    ../premise/.venv/bin/python selftest.py

Loads no model and touches no GPU. Everything here is either pure arithmetic or a
manifest/JSONL round-trip whose right answer is known by construction — the same idea as
`../premise/selftest.py`, aimed at the parts of the ladder that would silently produce a
plausible-looking wrong curve: the resume key, the scope filters, the rung logic, the
conditional question, the resolution-floor verdict, and the transfer verdict.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze  # noqa: E402
import common_ladder as cl  # noqa: E402

CHECKS = 0


def check(condition: bool, message: str) -> None:
    global CHECKS
    CHECKS += 1
    if not condition:
        raise AssertionError(message)


# ---------------------------------------------------------------- binning

def test_bins() -> None:
    check(cl.bin_of(147) == "0-160", "147 px belongs in the thumbnail bin")
    check(cl.bin_of(300) == "241-340", "300 px belongs in the sharded low-tier bin")
    check(cl.bin_of(640) == "561-680", "640 px belongs in the sharded high-tier bin")
    check(cl.bin_of(3600) == "1401+", "3600 px belongs in the open top bin")
    edges = [b[0] for b in cl.LONG_EDGE_BINS]
    check(edges == sorted(edges), "bins must be ordered")
    for (_, high), (low, _) in zip(cl.LONG_EDGE_BINS, cl.LONG_EDGE_BINS[1:]):
        check(low == high + 1, "bins must tile the range without gaps or overlap")


# ---------------------------------------------------------------- resume key

class FakeVariant:
    schema_version = "group-a.v1"
    variant = "B"
    prompt_hash = "deadbeef"


def test_row_key() -> None:
    native = cl.ladder_row_key("abc", FakeVariant(), 0)
    capped = cl.ladder_row_key("abc", FakeVariant(), 640)
    check(native.endswith("|native"), "a native row must say so in its key")
    check(capped.endswith("|cap640"), "a capped row must say so in its key")
    check(native != capped, "a capped row must never satisfy a native row on resume")


# ---------------------------------------------------------------- manifest / scopes

def synthetic_manifest() -> dict:
    """Two music-artworks artworks and one sharded pair, with a known rung structure.

    art1: 800 (reference), 400, 400 duplicate re-encode, 300, 147   -> 4 rungs
    art2: 640 (reference), 300                                       -> 2 rungs, matched contrast
    """
    def rendition(path, size, sha, reference=False, rung=0, representative=True, fmt="jpeg"):
        return {"path": path, "bytes": 1, "width": size, "height": size, "format": fmt,
                "extension": "jpg", "longEdgePx": size, "sha256": sha, "isOriginal": reference,
                "isReference": reference, "rungIndex": rung, "isRungRepresentative": representative}

    art1 = {
        "id": "a" * 32, "stratum": "641-1024", "referenceLongEdgePx": 800, "renditionCount": 5,
        "distinctSizeCount": 4, "rungLongEdgesPx": [800, 400, 300, 147], "isMatchedContrast": False,
        "inSample": True,
        "renditions": [
            rendition("m/a800.jpg", 800, "s800", reference=True, rung=0),
            rendition("m/a400.jpg", 400, "s400", rung=1),
            rendition("m/a400b.avif", 400, "s400b", rung=1, representative=False),
            rendition("m/a300.jpg", 300, "s300", rung=2),
            rendition("m/a147.avif", 147, "s147", rung=3),
        ],
    }
    art2 = {
        "id": "b" * 32, "stratum": "401-640", "referenceLongEdgePx": 640, "renditionCount": 2,
        "distinctSizeCount": 2, "rungLongEdgesPx": [640, 300], "isMatchedContrast": True,
        "inSample": False,
        "renditions": [
            rendition("m/b640.jpg", 640, "t640", reference=True, rung=0),
            rendition("m/b300.jpg", 300, "t300", rung=1),
        ],
    }
    pair = {
        "artworkId": "c" * 24, "shards": ["00"],
        "files": [
            {"path": "00/x640", "imageId": "x640", "renditionPrefix": "ab67616d0000b273",
             "declaredTierPx": 640, "bytes": 1, "width": 640, "height": 640, "format": "jpeg",
             "longEdgePx": 640, "sha256": "p640"},
            {"path": "00/x300", "imageId": "x300", "renditionPrefix": "ab67616d00001e02",
             "declaredTierPx": 300, "bytes": 1, "width": 300, "height": 300, "format": "jpeg",
             "longEdgePx": 300, "sha256": "p300"},
        ],
    }
    return {"header": {}, "ladder": [art1, art2], "pairs": [pair]}


def test_scopes() -> None:
    manifest = synthetic_manifest()
    full = cl.items_for_scope(manifest, "full")
    check(len(full) == 6, f"full scope should be 4 + 2 rungs, got {len(full)}")
    check(all(i.collection == "music-artworks" for i in full), "full scope is music-artworks only")
    with_dups = cl.items_for_scope(manifest, "full", include_duplicate_sizes=True)
    check(len(with_dups) == 7, "the duplicate-size re-encode appears only with the flag")
    sample = cl.items_for_scope(manifest, "sample")
    check({i.artwork_id for i in sample} == {"a" * 32}, "sample scope honours inSample")
    pairs = cl.items_for_scope(manifest, "pairs")
    check(len(pairs) == 2 and all(i.collection == "sharded" for i in pairs), "pairs scope is the sharded files")
    check(all(i.reference_sha256 == "s800" for i in full if i.artwork_id == "a" * 32),
          "every rung points at its artwork's largest rendition as the answer key")
    check(sum(1 for i in full if i.is_reference) == 2, "exactly one reference per artwork")

    # Identical bytes must be run once, whichever artwork they belong to.
    duplicated = synthetic_manifest()
    duplicated["ladder"][1]["renditions"][1]["sha256"] = "s300"
    check(len(cl.items_for_scope(duplicated, "full")) == 5, "a repeated sha256 is queued once")


def test_canary_rule() -> None:
    manifest = synthetic_manifest()
    manifest["ladder"][0]["renditions"].append({
        "path": "m/a640.jpg", "bytes": 1, "width": 640, "height": 640, "format": "jpeg",
        "extension": "jpg", "longEdgePx": 640, "sha256": "s640", "isOriginal": False,
        "isReference": False, "rungIndex": 4, "isRungRepresentative": True,
    })
    canary = cl.choose_canary(manifest)
    check(canary.image_sha256 == "s640", "the canary is the 640x640 jpeg of a sampled artwork")
    check(canary.long_edge_px == 640, "the canary is typical, not pathological")


# ---------------------------------------------------------------- analysis

def answer(ground="flat_field", texture="smooth", enclosure="none", fade="not_applicable",
           confidence="high") -> dict:
    return {"ground_type": ground, "field_texture": texture, "enclosure": enclosure,
            "shading_geometry": fade, "confidence": confidence, "ambiguity_note": ""}


def test_wilson() -> None:
    low, high = analyze.wilson(50, 100)
    check(low < 0.5 < high and 0.39 < low < 0.41 and 0.59 < high < 0.61, f"Wilson at 50/100 looks wrong: {low},{high}")
    low, high = analyze.wilson(30, 30)
    check(high == 1.0 and low > 0.85, "Wilson at 30/30 must not run past 1.0")
    check(analyze.wilson(0, 0) == (0.0, 1.0), "an empty bin is maximally uncertain")


def test_conditional_question() -> None:
    shaded = {"answer": answer(ground="shaded_field", fade="linear"),
              "reference_answer": answer(ground="shaded_field", fade="linear")}
    flat = {"answer": answer(), "reference_answer": answer()}
    check(analyze.eligible(shaded, "shading_geometry"), "shading is scored when the reference is a shaded field")
    check(not analyze.eligible(flat, "shading_geometry"), "shading is NOT scored when the reference is flat")
    check(analyze.eligible(flat, "ground_type"), "unconditional questions are always scored")
    scored = analyze.score([shaded, flat, flat, flat], "shading_geometry")
    check(scored["n"] == 1, f"pooled not_applicable must not inflate n, got {scored['n']}")


def test_gradient_collapse() -> None:
    same = {"answer": answer(ground="flat_field"), "reference_answer": answer(ground="multiple_distinct_fields")}
    check(analyze.gradient_of(same["answer"]) == "flat", "flat_field collapses to flat")
    check(analyze.score_gradient([same])["agreement"] == 1.0,
          "flat_field and multiple_distinct_fields are the same gradient decision")
    unmapped = {"answer": answer(ground="full_scene"), "reference_answer": answer()}
    check(analyze.score_gradient([unmapped])["n"] == 0, "unmapped labels leave the gradient comparison")


def test_resolution_floor() -> None:
    def points(**kv):
        return {name: {"n": n, "agree": int(round(a * n)), "agreement": a, "ci95": [0, 1]}
                for name, (n, a) in kv.items()}

    good = points(**{"0-160": (100, 0.60), "241-340": (100, 0.80), "561-680": (100, 0.95),
                     "681-900": (100, 0.96)})
    verdict = analyze.resolution_floor(good, 0.85)
    check(verdict["verdict"] == "unanswerable_below", verdict["verdict"])
    check(verdict["unanswerable_below_px"] == 561, f"floor should be 561 px, got {verdict}")
    check(verdict["first_failing_bin"] == "241-340", "the first failing bin is named")

    everywhere = points(**{"0-160": (100, 0.91), "561-680": (100, 0.95)})
    check(analyze.resolution_floor(everywhere, 0.85)["verdict"] == "answerable_at_every_measured_size",
          "a question that clears the floor everywhere has no resolution floor")

    never = points(**{"0-160": (100, 0.40), "561-680": (100, 0.50)})
    check(analyze.resolution_floor(never, 0.85)["verdict"] == "never_clears_floor",
          "a question that never clears the floor must say so, not report a floor of 0")

    thin = points(**{"0-160": (5, 0.20), "561-680": (5, 0.99)})
    check(analyze.resolution_floor(thin, 0.85)["verdict"] == "insufficient_data",
          "bins under MIN_BIN_N cannot carry a verdict")

    # A dip that recovers must not be papered over: the walk stops at the first failure
    # from the top, so a good bottom bin below a bad middle one does NOT lower the floor.
    dip = points(**{"0-160": (100, 0.99), "241-340": (100, 0.50), "561-680": (100, 0.95)})
    check(analyze.resolution_floor(dip, 0.85)["unanswerable_below_px"] == 561,
          "a lucky low bin under a failing middle bin must not lower the floor")


def test_end_to_end_analysis() -> None:
    """A synthetic run whose right answer is known by construction: every rendition at
    400 px and up repeats the reference exactly; every rendition under 400 px flips
    ground_type. So ground_type must be unanswerable below 341 px and everything else
    answerable everywhere."""
    manifest = synthetic_manifest()
    rows = []
    by_sha_size = {"s800": 800, "s400": 400, "s400b": 400, "s300": 300, "s147": 147,
                   "t640": 640, "t300": 300, "p640": 640, "p300": 300}
    for sha, size in by_sha_size.items():
        parsed = answer(ground="flat_field" if size >= 400 else "multiple_distinct_fields")
        rows.append({
            "row_key": f"{sha}|group-a.v1|B|deadbeef|native", "status": "ok", "is_canary": False,
            "image_sha256": sha, "parsed": parsed, "raw_text": json.dumps(parsed),
            "scope": "full", "collection": "music-artworks", "resolution_cap": 0,
            "prompt_hash": "deadbeef", "model_revision": "rev", "attempts": 1, "parse_failed": False,
            "source_long_edge_px": size,
        })
    # Three canary decodes, all sharing one row key by design, one of them drifted. They
    # must survive deduplication or the stability check becomes a tautology.
    for index, ground in enumerate(("flat_field", "flat_field", "shaded_field")):
        parsed = answer(ground=ground)
        rows.append({
            "row_key": "canarysha|group-a.v1|B|deadbeef|native|canary", "status": "ok",
            "is_canary": True, "image_sha256": "canarysha", "parsed": parsed,
            "raw_text": json.dumps(parsed), "scope": "full", "collection": "music-artworks",
            "resolution_cap": 0, "prompt_hash": "deadbeef", "model_revision": "rev",
            "attempts": 1, "parse_failed": False, "source_long_edge_px": 640,
            "item_index": index,
        })

    with tempfile.TemporaryDirectory() as tmp:
        results = Path(tmp) / "synthetic.jsonl"
        results.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
        answers, health = analyze.load_answers([results])
        check(health["canary_rows"] == 3, f"all three canary decodes must survive, got {health['canary_rows']}")
        check(health["canary"]["distinct_parsed_answers"] == 2, "the drifted canary must be visible")
        check(health["canary"]["stable"] is False, "a drifted canary must not report stable")
        check(health["ok"] == len(by_sha_size), "every synthetic work row is ok")
        check("canarysha" not in answers, "a canary answer must never enter the comparison set")
        comparisons = analyze.comparisons_from_ladder(manifest, answers)
        # art1: 400, 400-dup, 300, 147 vs 800 = 4; art2: 300 vs 640 = 1.
        check(len(comparisons) == 5, f"expected 5 comparisons, got {len(comparisons)}")
        primary = [c for c in comparisons if c["reference_long_edge_px"] >= analyze.REFERENCE_MIN_LONG_EDGE_PX
                   and not c["same_size_as_reference"]]
        check(len(primary) == 5, "both synthetic references clear the reference floor")
        control = analyze.codec_control_comparisons(manifest, answers)
        check(len(control) == 1 and control[0]["long_edge_px"] == 400,
              f"the two 400 px encodings are the noise floor, got {control}")
        check(analyze.score(control, "ground_type")["agreement"] == 1.0,
              "the synthetic re-encode answers identically, so the noise floor is 1.0")
        points = analyze.curve(primary, "ground_type")
        check(points["341-440"]["agreement"] == 1.0, "400 px agrees with the reference by construction")
        check(points["241-340"]["agreement"] == 0.0, "300 px disagrees by construction")
        check(points["0-160"]["agreement"] == 0.0, "147 px disagrees by construction")
        check(analyze.curve(primary, "enclosure")["241-340"]["agreement"] == 1.0,
              "enclosure was never flipped, so it agrees at every size")
        matched = analyze.matched_contrast_comparisons(manifest, answers)
        check(len(matched) == 1 and matched[0]["artwork_id"] == "b" * 32,
              "the matched-contrast pair is the artwork flagged as such")
        pairs = analyze.comparisons_from_pairs(manifest, answers)
        check(len(pairs) == 1 and pairs[0]["long_edge_px"] == 300, "the sharded pair compares 300 against 640")
        transfer = analyze.transfer_check(primary, matched, pairs, "ground_type")
        check(transfer["observed_sharded_pairs"]["agreement"] == 0.0, "the synthetic pair disagrees")
        check(transfer["verdict_vs_curve"] == "underpowered",
              "one comparison can never support a transfer verdict")


def main() -> int:
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ok  {name}")
    print(f"\n{CHECKS} assertions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Build the 12-cover determinism sample manifest. CPU ONLY — never loads a model.

    .venv/bin/python select_determinism_sample.py --out ../../data/sam/determinism-1-sample.json

WHY THIS SAMPLE IS PURPOSIVE AND NOT DRAWN (DETERMINISM_PREREG.md sec 2). Every other round in
this directory draws at random, because it estimates a rate over a population and a targeted
sample would bias the estimate. This round estimates nothing. It asks whether one machine
returns the same bytes twice, and a machine that is non-deterministic on one input is
non-deterministic. So the sample's job is COVERAGE OF THE INPUT SPACE THAT COULD PLAUSIBLY
TRIGGER A DIVERGENCE — decoder path (JPEG/PNG/AVIF), geometry (square/non-square/tiny/large),
and detection load (1 region to 144 regions, which is what exercises NMS tie-breaking and any
order-dependent accumulation) — not representativeness. A random draw of 12 would very likely
have missed the 147px AVIF and the 400x155 banner, which are the two inputs most likely to hit
a resize or clamp edge case.

Every entry's content label is HUMAN-CONFIRMED and carries the list file it came from. No
stratum label in this manifest was inferred from a region count.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import common
import config

# [REVIEWED] The twelve covers, DETERMINISM_PREREG.md sec 2, fixed before any inference.
# (rel_path, stratum, source list file, the human note from that file)
SAMPLE: tuple[tuple[str, str, str, str], ...] = (
    # --- CJK (2). Human-confirmed CJK content; opened by eye for probe 4.
    ("03/ab67616d0000b2730003f2b6590090abe420d104.jpg", "cjk", "cjk-probe-7.txt",
     "probe-4 CJK cover, content confirmed by eye"),
    ("10/ab67616d00001e0200106c3252a4c133c0abde36", "cjk", "cjk-probe-7.txt",
     "probe-4 CJK cover, content confirmed by eye"),
    # --- person (2). One large clean portrait, one tiny multi-person AVIF.
    ("01/ab67616d00001e0200015a7a9909e03141e001e3.jpg", "person", "salience-probe-12.txt",
     "studio portrait, one woman, plain surround"),
    ("music-artworks/b/f/8/bf8c64bda873640a50bc5986ed34ac73_147x147.avif", "person",
     "smoke-10.txt", "five-person band photo at 147x147 AVIF - the extreme small end"),
    # --- text-heavy (3). Includes the non-square banner, the geometry stress case.
    ("00/ab67616d00001e020000269ead63cf2376a6b67d.jpg", "text_heavy", "salience-probe-12.txt",
     "'8 IS ENOUGH', yellow field, red paint drip, dense credit block"),
    ("06/ab67616d00001e0200066a61bbcbeadd632f7f38", "text_heavy", "smoke-10.txt",
     "text-heavy 300px thumbnail, karaoke cover, several logos and a badge"),
    ("music-artworks/c/c/5/cc526851893a18c26dc536dc35643e62.png", "text_heavy", "smoke-10.txt",
     "typography-only wide banner 400x155 PNG - non-square stress case"),
    # --- busy (3). The high-detection-count end, where NMS has the most ties to break.
    ("02/ab67616d0000b2730002dc280ccc28cadb7d4ae4.jpg", "busy", "salience-probe-12.txt",
     "neon city street at night, deep perspective, signage everywhere"),
    ("10/ab67616d0000b27300103a3729bf589e0dc913ab", "busy", "salience-probe-12.txt",
     "surreal collage: a standing figure beside a van, busy background"),
    ("music-artworks/3/9/a/39a033512ffcae11035d32c1d0de9515_483x483.avif", "busy",
     "smoke-10.txt", "dense cartoon collage with big display type, 483x483 AVIF"),
    # --- flat (2). The low end: near-empty fields where a run can come back with one region.
    ("00/ab67616d00001e02000060b6aa68cdd9e02567b1.jpg", "flat", "salience-probe-12.txt",
     "near-white cover, one small pink lotus mark, thin type"),
    ("01/ab67616d00001e0200018a1e2daf68a53f504cb9.jpg", "flat", "salience-probe-12.txt",
     "pastel gradient + thin triangle outline, 300px - almost pure 'stuff'"),
)

# Selection input only, never quoted as evidence: the v2 run is under concept-set hash
# 402de9d8 and this experiment runs under d49a63c4. Region counts are echoed into the
# manifest so a reader can see the detection-load spread the sample was chosen to cover.
SELECTION_RUN = config.DATA_DIR / "sam-eval-142-v2.jsonl"


def v2_counts() -> dict[str, int]:
    out: dict[str, int] = {}
    if not SELECTION_RUN.exists():
        return out
    for rec in common.read_jsonl(SELECTION_RUN):
        if rec.get("record_type") != config.RECORD_TYPE_IMAGE:
            continue
        ibc = rec.get("instances_by_concept") or {}
        out[rec["image_path"]] = sum(int(v) for v in ibc.values())
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    common.register_image_plugins()
    counts = v2_counts()
    entries = []
    missing = []
    for rel, stratum, source, note in SAMPLE:
        ref = common.ImageRef.from_rel(rel)
        if not ref.abs_path.exists():
            missing.append(rel)
            continue
        image, source_long_edge, processed_long_edge = common.decode_image(ref.abs_path)
        entries.append({
            "rel_path": ref.rel_path,
            "absolute_path": str(ref.abs_path),
            "artwork_id": ref.artwork_id,
            "collection": ref.collection,
            "stratum": stratum,
            "label_source": source,
            "human_note": note,
            "image_sha256": common.sha256_file(ref.abs_path),
            "byte_count": ref.abs_path.stat().st_size,
            "format": image.format if hasattr(image, "format") else None,
            "suffix": ref.abs_path.suffix.lower() or "(none)",
            "decoded_width": image.width,
            "decoded_height": image.height,
            "source_long_edge": source_long_edge,
            "processed_long_edge": processed_long_edge,
            "pixels": image.width * image.height,
            "v2_instances_total_selection_only": counts.get(ref.rel_path),
        })

    if missing:
        raise SystemExit(f"MISSING (fix the manifest, do not silently drop): {missing}")

    out = {
        "batch": "sam-determinism-1",
        "built_at": common.utc_now(),
        "sampling": "purposive, fixed in DETERMINISM_PREREG.md sec 2 before any inference",
        "selection_run_note": (
            "v2_instances_total_selection_only comes from sam-eval-142-v2.jsonl under concept-set "
            "hash 402de9d8 and is shown to document detection-load spread. It is never evidence."),
        "concept_set_hash": common.concept_set_hash(),
        "concepts": [c for c, _ in config.CONCEPT_PROMPTS],
        "concept_prompts": [list(p) for p in config.CONCEPT_PROMPTS],
        "model_repo": config.MODEL_REPO,
        "model_revision": config.MODEL_REVISION,
        "score_threshold": config.SCORE_THRESHOLD,
        "resolution_cap_px": config.RESOLUTION_CAP_PX,
        "git_head": common.git_head(),
        "n": len(entries),
        "entries": entries,
    }
    Path(args.out).write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
    print(f"[select] n={len(entries)} concept_set_hash={out['concept_set_hash'][:16]} -> {args.out}")
    for e in entries:
        print(f"  {e['stratum']:11s} {e['suffix']:6s} {e['decoded_width']:5d}x{e['decoded_height']:-5d} "
              f"v2n={str(e['v2_instances_total_selection_only']):>4s}  {e['rel_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Shared machinery for the resolution-ladder experiment (oracle pipeline §7.4.3).

The model, the prompts, the grammar, the JSONL sink, the attempt ledger and the retry
policy are the premise runner's — imported from `research/v3/oracle/premise/common.py`,
never copied and never edited. This module adds only what the ladder needs on top:

  - the item type, read from `data/oracle-ladder/manifest.json` (paths, header dims, sha256)
  - the three scopes: full | sample | pairs
  - NATIVE resolution. Pipeline §7.5: "Ladder experiment — native, deliberately varied;
    resolution IS the independent variable." The premise runner normalizes to 640; here a
    cap would erase the measurement. The cap therefore also enters the resume key, so a
    capped row can never be mistaken for a native one.
  - a ladder-shaped provenance row: reference rendition, rung index, stratum, collection.

Nothing here launches a run. `run_ladder.py` is the worker; `supervise.sh` restarts it.

CONVENTIONS.md: every constant is named and carries a provenance tag plus one line saying
where it comes from. Python is used here only because the model runtime requires it.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

# [INHERITED] Repo layout: this file lives at research/v3/oracle/ladder/.
LADDER_DIR = Path(__file__).resolve().parent
REPO_ROOT = LADDER_DIR.parents[3]
PREMISE_DIR = REPO_ROOT / "research" / "v3" / "oracle" / "premise"
# [INHERITED] Owned output directory (CONVENTIONS.md path ownership).
DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "oracle-ladder"
MANIFEST_PATH = DATA_DIR / "manifest.json"
CANARY_PATH = DATA_DIR / "canary.json"

sys.path.insert(0, str(PREMISE_DIR))
from common import (  # noqa: E402  (import lives below the path fix by necessity)
    MAX_ATTEMPTS, MAX_TOKENS, MODEL_QUANTIZATION, MODEL_REPO, MODEL_REVISION, SCHEMA_VERSION,
    TEMPERATURE, USE_CONSTRAINED_DECODING, VOCABULARIES,
    AttemptLedger, JsonlSink, Oracle, PromptVariant, SchemaViolation,
    GIT_HEAD, _pkg_version, completed_keys, load_model_manifest, load_prompt_variant,
    new_run_id, normalize_image, read_jsonl, sha256_file, utc_now,
)

# ---------------------------------------------------------------- ladder constants

# [REVIEWED] Pipeline §7.4.3 measures agreement of one prompt against itself at different
# sizes. The premise test's second variant exists to expose prompt sensitivity, which is a
# different question and would double the bill for no ladder signal. Variant B, because it
# measured better on the premise run (Cohen's kappa 0.311 vs 0.210 strict, 0.484 vs 0.446
# on mapped labels — data/oracle-premise/premise-run-1.agreement.json).
LADDER_VARIANT = "B"
PROMPT_PATH = PREMISE_DIR / "prompts" / f"group-a.variant-{LADDER_VARIANT.lower()}.json"

# [REVIEWED] Pipeline §7.5, table row "Ladder experiment": native, deliberately varied.
# 0 means "no cap" in premise `normalize_image`. A non-zero value here would silently
# convert the experiment into the thing it exists to measure.
LADDER_LONG_EDGE_CAP_PX = 0

# [REVIEWED] Pipeline §5.3 sizes the canary at N ~= 100 for a 7,000-image run; full scope
# here is 4,306 inferences, so 100 is the right order. (The premise test used 20 because it
# was a 284-inference run.)
CANARY_EVERY = 100

# [REVIEWED] Pinned canary selection rule, so the canary never silently moves and canary
# answers stay comparable across all three scopes. Typical, not pathological (§5.3): a
# 640x640 JPEG — the modal album-artwork rendition in both collections — from an artwork in
# the stratified sample, so scope `sample` and scope `full` share it.
CANARY_SELECTION_RULE = (
    "music-artworks ladder artwork with inSample=true owning a 640x640 jpeg rendition, "
    "then the lexicographically smallest rendition sha256"
)

# [REVIEWED] Bands for the analysis and for run-time reporting. Edges are placed where the
# collection's mass actually sits (measured over the 4,306 full-scope rungs), not on round
# numbers: the 147 px CDN thumbnail, the ~300 px tier, the ~400/~480 derived sizes, the
# 640 px ceiling of the sharded corpus, and the thin tail above it.
LONG_EDGE_BINS = ((0, 160), (161, 240), (241, 340), (341, 440), (441, 560),
                  (561, 680), (681, 900), (901, 1400), (1401, 10_000))


def bin_of(long_edge_px: int) -> str:
    for low, high in LONG_EDGE_BINS:
        if low <= long_edge_px <= high:
            return f"{low}-{high}" if high < 10_000 else f"{low}+"
    raise ValueError(f"no bin for long edge {long_edge_px}")


# ---------------------------------------------------------------- items

@dataclass(frozen=True)
class LadderItem:
    """One rendition to run. `artwork_id` is the join key; this is a rendition of it."""
    collection: str            # 'music-artworks' | 'sharded'
    artwork_id: str
    image_id: str              # filename stem, unique inside its collection
    image_path: str            # repo-relative
    absolute_path: Path
    image_sha256: str
    width: int
    height: int
    long_edge_px: int
    image_format: str
    is_reference: bool         # the artwork's largest rendition — the ladder's answer key
    reference_sha256: str
    reference_long_edge_px: int
    rung_index: int            # 0 = largest distinct size
    stratum: str
    in_sample: bool
    declared_tier_px: int | None   # sharded only: what the rendition prefix claims

    @property
    def size_key(self) -> str:
        return f"{self.width}x{self.height}"


def load_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing. Run: NODE_NO_WARNINGS=1 node --experimental-strip-types "
            f"research/v3/oracle/ladder/build-manifest.ts")
    return json.loads(path.read_text())


def items_for_scope(manifest: dict[str, Any], scope: str,
                    include_duplicate_sizes: bool = False) -> list[LadderItem]:
    """The work list for one scope, in a deterministic order.

    Renditions that merely re-encode a size already covered by the same artwork are
    excluded by default: they add no point to the curve. `include_duplicate_sizes` keeps
    them, which turns them into a same-size codec control.
    """
    assert scope in ("full", "sample", "pairs"), f"unknown scope {scope!r}"
    items: list[LadderItem] = []

    if scope in ("full", "sample"):
        for artwork in manifest["ladder"]:
            if scope == "sample" and not artwork["inSample"]:
                continue
            reference = next(r for r in artwork["renditions"] if r["isReference"])
            for rendition in artwork["renditions"]:
                if not include_duplicate_sizes and not rendition["isRungRepresentative"]:
                    continue
                items.append(LadderItem(
                    collection="music-artworks",
                    artwork_id=artwork["id"],
                    image_id=Path(rendition["path"]).stem,
                    image_path=rendition["path"],
                    absolute_path=REPO_ROOT / rendition["path"],
                    image_sha256=rendition["sha256"],
                    width=rendition["width"],
                    height=rendition["height"],
                    long_edge_px=rendition["longEdgePx"],
                    image_format=rendition["format"],
                    is_reference=rendition["isReference"],
                    reference_sha256=reference["sha256"],
                    reference_long_edge_px=reference["longEdgePx"],
                    rung_index=rendition["rungIndex"],
                    stratum=artwork["stratum"],
                    in_sample=artwork["inSample"],
                    declared_tier_px=None,
                ))
    else:
        for pair in manifest["pairs"]:
            reference = pair["files"][0]        # sorted largest first by build-manifest.ts
            for index, rendition in enumerate(pair["files"]):
                items.append(LadderItem(
                    collection="sharded",
                    artwork_id=pair["artworkId"],
                    image_id=rendition["imageId"],
                    image_path=rendition["path"],
                    absolute_path=REPO_ROOT / rendition["path"],
                    image_sha256=rendition["sha256"],
                    width=rendition["width"],
                    height=rendition["height"],
                    long_edge_px=rendition["longEdgePx"],
                    image_format=rendition["format"],
                    is_reference=index == 0,
                    reference_sha256=reference["sha256"],
                    reference_long_edge_px=reference["longEdgePx"],
                    rung_index=index,
                    stratum="sharded-pair",
                    in_sample=False,
                    declared_tier_px=rendition["declaredTierPx"],
                ))

    # Two manifest entries can be the same bytes (a rendition duplicated across artworks).
    # The oracle's answer depends only on the bytes, so run each distinct sha256 once; the
    # analysis re-joins by sha256 and both artworks get the answer.
    seen: set[str] = set()
    unique: list[LadderItem] = []
    for item in sorted(items, key=lambda i: (i.image_sha256, i.image_path)):
        if item.image_sha256 in seen:
            continue
        seen.add(item.image_sha256)
        unique.append(item)
    return unique


def choose_canary(manifest: dict[str, Any]) -> LadderItem:
    """CANARY_SELECTION_RULE, applied. Deterministic, and identical for every scope."""
    eligible: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
    for artwork in manifest["ladder"]:
        if not artwork["inSample"]:
            continue
        for rendition in artwork["renditions"]:
            if rendition["width"] == 640 and rendition["height"] == 640 and rendition["format"] == "jpeg":
                eligible.append((rendition["sha256"], artwork, rendition))
    assert eligible, "no ladder rendition satisfies the canary selection rule"
    _, artwork, rendition = sorted(eligible, key=lambda e: e[0])[0]
    reference = next(r for r in artwork["renditions"] if r["isReference"])
    return LadderItem(
        collection="music-artworks",
        artwork_id=artwork["id"],
        image_id=Path(rendition["path"]).stem,
        image_path=rendition["path"],
        absolute_path=REPO_ROOT / rendition["path"],
        image_sha256=rendition["sha256"],
        width=rendition["width"],
        height=rendition["height"],
        long_edge_px=rendition["longEdgePx"],
        image_format=rendition["format"],
        is_reference=rendition["isReference"],
        reference_sha256=reference["sha256"],
        reference_long_edge_px=reference["longEdgePx"],
        rung_index=rendition["rungIndex"],
        stratum=artwork["stratum"],
        in_sample=True,
        declared_tier_px=None,
    )


# ---------------------------------------------------------------- output rows

def ladder_row_key(image_sha256: str, variant: PromptVariant, long_edge_cap_px: int) -> str:
    """Resume identity. Same shape as the premise runner's, plus the resolution policy.

    The cap belongs in the key because the ladder's whole subject is what the model saw:
    a row produced at native size and a row produced from the same file capped to 640 are
    different measurements and must never satisfy each other on resume.
    """
    policy = "native" if not long_edge_cap_px else f"cap{long_edge_cap_px}"
    return f"{image_sha256}|{variant.schema_version}|{variant.variant}|{variant.prompt_hash}|{policy}"


def ladder_provenance(run_id: str, variant: PromptVariant, oracle: Oracle, item: LadderItem,
                      source_long_edge: int, processed_long_edge: int,
                      long_edge_cap_px: int) -> dict[str, Any]:
    """The §5.2 provenance table, plus what §7.5 and §7.4.3 need.

    Not the premise runner's `provenance()`: that one stamps every row with the premise
    test's fixed 640 px cap and carries the gradient ground truth, neither of which is true
    here. Everything else is deliberately the same shape so the two runs' JSONL can be read
    side by side.
    """
    import platform
    return {
        # §5.2
        "run_id": run_id,
        "model_id": MODEL_REPO,
        "model_revision": MODEL_REVISION,
        "quantization": MODEL_QUANTIZATION,
        "runtime_version": f"mlx-vlm {oracle.runtime_version}",
        "prompt_variant": variant.variant,
        "prompt_hash": variant.prompt_hash,
        "schema_version": variant.schema_version,
        "image_sha256": item.image_sha256,
        "resolution_cap": long_edge_cap_px,
        "decoded_at": utc_now(),
        # identity (§9.1: artwork_id is the join key; image_id is a rendition of it)
        "collection": item.collection,
        "image_id": item.image_id,
        "artwork_id": item.artwork_id,
        "image_path": item.image_path,
        "image_format": item.image_format,
        "image_width": item.width,
        "image_height": item.height,
        # §7.5: without the second, a reader cannot tell a normalized run from a native one
        "source_long_edge_px": source_long_edge,
        "processed_long_edge_px": processed_long_edge,
        "long_edge_bin": bin_of(processed_long_edge),
        # §7.4.3: the ladder's answer key and this rung's place on it
        "is_reference_rendition": item.is_reference,
        "reference_sha256": item.reference_sha256,
        "reference_long_edge_px": item.reference_long_edge_px,
        "rung_index": item.rung_index,
        "stratum": item.stratum,
        "in_sample": item.in_sample,
        "declared_tier_px": item.declared_tier_px,
        # extra pins, because "could I regenerate this?" needs more than the doc's minimum
        "schema_hash": variant.schema_hash,
        "prompt_file_sha256": variant.file_hash,
        "weights_manifest_sha256": oracle.manifest["weights_manifest_sha256"],
        "mlx_version": _pkg_version("mlx"),
        "python_version": platform.python_version(),
        "constrained_decoding": USE_CONSTRAINED_DECODING,
        "temperature": TEMPERATURE,
        "repo_head": GIT_HEAD,
    }

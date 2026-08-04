"""Shared machinery for the oracle premise test.

Spec: research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md
  §2.3  model and quantization
  §3    two prompt variants, greedy decoding, disagreement signal
  §5.1  resumability, per-image attempt cap, failure is a status not an absence
  §5.2  provenance columns on every row
  §5.3  canary
  §7.5  normalize for comparability, record both sizes
  §9.3  constrained decoding, or validate-and-retry with a cap and a parse_failed marker
  §11   pre-flight checklist

Nothing here launches a run. `run_premise.py` is the worker; `supervise.sh` restarts it.

CONVENTIONS.md: every constant is named and carries a provenance tag plus one line saying
where it comes from. Python is used here only because the model runtime requires it.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------- paths

# [INHERITED] Repo layout: this file lives at research/v3/oracle/premise/.
PREMISE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PREMISE_DIR.parents[3]
# [INHERITED] Owned output directory (CONVENTIONS.md path ownership).
DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "oracle-premise"
PROMPTS_DIR = PREMISE_DIR / "prompts"
EVAL_SET_PATH = DATA_DIR / "eval-set.json"
MODEL_MANIFEST_PATH = DATA_DIR / "model-manifest.json"

# ---------------------------------------------------------------- model

# [REVIEWED] Pipeline doc §2.3: bulk pass is Qwen3-VL-30B-A3B at 6-bit, ~25 GB resident.
# 6-bit not 4-bit because MoE models degrade harder under aggressive quantization.
# Instruct, not Thinking: the run is greedy, terse and JSON-constrained; private reasoning
# tokens would dominate decode, which §10 lever 1 names as the run's cost driver.
MODEL_REPO = "mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit"
# [MEASURED] HF commit hash of MODEL_REPO, read from the hub 2026-08-02 and pinned here.
# §5.2 requires the commit hash, never the tag.
MODEL_REVISION = "f31102655767c89366f63d3eab2a5e2a8fd6d293"
# [MEASURED] From the repo's config.json quantization block; also encoded in the repo name.
MODEL_QUANTIZATION = "6bit"

# ---------------------------------------------------------------- decoding

# [REVIEWED] Pipeline doc §3: greedy decoding, so runs are byte-reproducible and prompt
# variation is the only disagreement signal. temperature == 0 selects argmax in mlx-vlm.
TEMPERATURE = 0.0
# [MEASURED] Longest valid answer under either variant's schema is ~60 tokens (six short
# keys, five enum values, a note capped at 120 characters). 256 leaves headroom without
# letting a runaway decode cost minutes.
MAX_TOKENS = 256
# [REVIEWED] Pipeline doc §5.1: "After N attempts (N = 3 is fine), write a row with
# status = 'failed' and the exception class, and move on."
MAX_ATTEMPTS = 3
# [REVIEWED] Task brief for the premise test: re-run the canary every 20 items. The pipeline
# doc's §5.3 N ≈ 100 is sized for a 7,000-image run; this run is ~280 inferences.
CANARY_EVERY = 20

# [REVIEWED] Pipeline doc §7.5: for label production, normalize every image to a fixed long
# edge so cross-artwork comparison is not confounded by resolution. 640 px because the
# sharded corpus is hard-capped there. Downscale only — PHASE_0_DECISIONS.md §1 forbids
# upscaling, so a 300 px rendition is presented at 300 px and stays flagged as such.
RESOLUTION_CAP_PX = 640

# [REVIEWED] Pipeline doc §9.3: constrained decoding is preferred over "please return JSON".
# mlx-vlm 0.6.8 exposes it natively (mlx_vlm/structured.py, llguidance-backed). The
# validate-and-retry fallback below stays in place regardless, because a schema-valid
# document can still be semantically wrong (a value outside our closed vocabulary cannot
# occur under the grammar, but a truncated decode can).
USE_CONSTRAINED_DECODING = True

# ---------------------------------------------------------------- schema version

# [REVIEWED] Question-set version, frozen for this run (pipeline §11: "Freeze the question
# set and schema_version. Changing it mid-run invalidates the run."). Group A of
# research/v3/ORACLE_QUESTION_SET.md.
SCHEMA_VERSION = "group-a.v1"

# [REVIEWED] The canonical field names the analysis speaks, from ORACLE_QUESTION_SET.md §A.
CANONICAL_FIELDS = ("ground_type", "shading_geometry", "field_texture", "enclosure",
                    "confidence", "ambiguity_note")

# [REVIEWED] ORACLE_QUESTION_SET.md §A vocabularies, verbatim, plus `not_applicable` on
# shading_geometry (see each prompt file's `deviations`).
VOCABULARIES: dict[str, tuple[str, ...]] = {
    "ground_type": ("flat_field", "shaded_field", "multiple_distinct_fields",
                    "full_scene", "pattern_or_texture", "none_discernible"),
    "shading_geometry": ("linear", "radial_or_vignette", "irregular", "not_applicable"),
    "field_texture": ("smooth", "one_textured_material", "distinct_areas"),
    "enclosure": ("none", "thin_border", "thick_frame_or_bars"),
    "confidence": ("high", "medium", "low"),
}

# ---------------------------------------------------------------- prompt sets

# [REVIEWED] PREMISE_NEXT.md §5 and §13.1. One process loads exactly one prompt set: pipeline
# §11 freezes the question set and schema_version per run, and §5 states plainly that v1 and
# v2 "cannot be loaded in one process" — that is the intended behaviour, not a limitation.
#
# The doc proposes editing SCHEMA_VERSION and a PROMPT_GLOB constant in place. A registry is
# used instead for one reason: the criterion arm (C/D) and the probe arm must BOTH stay
# runnable, and an in-place edit makes each new arm break the previous one. The registry keeps
# the same guarantee — a set's schema_version is asserted against every file it globs — while
# leaving `group-a.v1` as the default, so an A/B rerun is byte-identical to run 1 with no flag.
PROMPT_SETS: dict[str, tuple[str, str]] = {
    # name                    (schema_version,          glob)
    "group-a.v1": ("group-a.v1", "group-a.variant-*.json"),
    "group-a.v2": ("group-a.v2", "group-a.v2.variant-*.json"),
    "group-a.probes.bundled": ("group-a.probes.v1.1", "group-a.probes.v1.1.bundled-*.json"),
    "group-a.probes.solo": ("group-a.probes.v1.1", "group-a.probes.v1.1.solo-*.json"),
    # The first non-group-A set: thirteen questions — groups B, C, D and E, plus the new
    # `subject_kind` — in one constrained decode, two orderings (E, F). PREMISE_NEXT.md §15.
    # The schema_version guard below is what keeps its rows out of any file holding group-a rows.
    # Supersedes the nine-question `group-bcd.v1`, which was drafted the same day, never
    # registered against a run and never produced a row; its identities are kept in §15.2.
    "group-bcde.v1": ("group-bcde.v1", "group-bcde.v1.variant-*.json"),
    # The first FREE-TEXT set: one question, one open-vocabulary noun, no enum anywhere.
    # PROBE5_NOTES.md §Granularity recommends a dual SAM prompt — the species noun the VLM would
    # use in a caption PLUS the `subject_kind` class word — and RESIDUAL_EXPERIMENT_NOTES.md §3
    # records that only the class half existed, which is why `object` masked 0 of 24 covers. This
    # set is the missing species half. It does not supersede `group-bcde.v1`: the class word is
    # still read from there, and the two are joined per cover on the SAM side.
    "subject-noun.v1": ("subject-noun.v1", "subject-noun.v1.variant-*.json"),
}
# [REVIEWED] Run 1's set. Default so nothing that worked before needs a flag.
DEFAULT_PROMPT_SET = "group-a.v1"

# [REVIEWED] PREMISE_NEXT.md §13.2. The eight `group-a.probes.v1` prompt files were deleted
# because they presupposed a singular background. "If any of these hashes ever appears in a
# results row, that run is invalid." Prefixes as published (truncated in the doc's table);
# matched by prefix, which is what the doc gives and is unambiguous at 16 hex characters.
SUPERSEDED_PROMPT_HASH_PREFIXES: dict[str, str] = {
    "d50d969cd243fa62": "group-a.probes.v1.bundled-p.json",
    "60dafd0116449d2e": "group-a.probes.v1.bundled-q.json",
    "96183e66e273f5bc": "group-a.probes.v1.solo-bg-visible.json",
    "f1e484604e5c4ff0": "group-a.probes.v1.solo-one-colour.json",
    "5aaae24d83a51e5a": "group-a.probes.v1.solo-continuous-change.json",
    "9c2e464c00a14fcc": "group-a.probes.v1.solo-separate-areas.json",
    "65a3415393bcead7": "group-a.probes.v1.solo-motif-or-material.json",
    "f6d5d9366176ba57": "group-a.probes.v1.solo-depicted-place.json",
}
SUPERSEDED_FILE_HASH_PREFIXES: dict[str, str] = {
    "83fc30567b282acc": "group-a.probes.v1.bundled-p.json",
    "b85828093f94a3ff": "group-a.probes.v1.bundled-q.json",
    "b536427b549387e2": "group-a.probes.v1.solo-bg-visible.json",
    "ce808801d556d2c5": "group-a.probes.v1.solo-one-colour.json",
    "03173f7104791ae4": "group-a.probes.v1.solo-continuous-change.json",
    "935d80c2bcff4546": "group-a.probes.v1.solo-separate-areas.json",
    "d486cf3e78e01e7a": "group-a.probes.v1.solo-motif-or-material.json",
    "bbfb3e4e67a13956": "group-a.probes.v1.solo-depicted-place.json",
}

SUPERSEDED_REASON = (
    "produced by a group-a.probes.v1 prompt, which called the background \"the large area\" — a "
    "SINGULAR referent that makes probes 2, 3, 5 and 6 unanswerable on a plural background. "
    "PREMISE_NEXT.md §13.2: any run carrying one of these hashes is invalid. Re-run under "
    "group-a.probes.v1.1."
)


class SupersededPrompt(Exception):
    pass


def assert_not_superseded(prompt_hash: str | None, file_hash: str | None, where: str) -> None:
    """Refuse anything carrying a deleted v1 probe-prompt identity. Cheap, and the only thing
    standing between a stale row and a silently invalid analysis."""
    for value, table, label in ((prompt_hash, SUPERSEDED_PROMPT_HASH_PREFIXES, "prompt_hash"),
                                (file_hash, SUPERSEDED_FILE_HASH_PREFIXES, "file_hash")):
        if not value:
            continue
        for prefix, origin in table.items():
            if value.startswith(prefix):
                raise SupersededPrompt(
                    f"{where}: {label} {value[:16]}… is {origin}, {SUPERSEDED_REASON}")


def assert_rows_not_superseded(rows: Iterable[dict[str, Any]], where: str) -> int:
    """Scan result rows. Returns the number checked so a caller can report it was done."""
    checked = 0
    for row in rows:
        checked += 1
        assert_not_superseded(row.get("prompt_hash"), row.get("prompt_file_sha256"),
                              f"{where} row {row.get('row_key', '?')}")
    return checked


# ---------------------------------------------------------------- small helpers

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, chunk: int = 1 << 22) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def git_head() -> str:
    """Best-effort repo state stamp. Never fails the run."""
    try:
        out = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip() if out.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


# ---------------------------------------------------------------- prompt variants

@dataclass(frozen=True)
class PromptVariant:
    path: Path
    variant: str
    schema_version: str
    system: str
    prompt: str
    json_schema: dict[str, Any]
    field_map: dict[str, str]
    free_text_fields: tuple[str, ...]
    prompt_hash: str
    schema_hash: str
    file_hash: str
    # [REVIEWED] PREMISE_NEXT.md §13 item 2: per-variant, read from the prompt document.
    # The probe arm is the first schema group that does not ask `ground_type` at all, and a
    # solo file declares exactly one field, so neither can satisfy a module-level constant.
    canonical_fields: tuple[str, ...] = CANONICAL_FIELDS
    vocabularies: dict[str, tuple[str, ...]] = field(default_factory=lambda: dict(VOCABULARIES))
    # [REVIEWED] PREMISE_NEXT.md §15.3. Canonical fields whose answer is a LIST of vocabulary
    # values rather than one value — `text_roles` and `overlays` in group-bcde.v1. Empty on
    # every group-A variant, which is why every assertion and every validation branch that
    # reads it is a no-op for A/B, C/D and the probe arm.
    multi_select_fields: tuple[str, ...] = ()
    # [REVIEWED] Per-variant decode budget, read from the prompt document. None everywhere it is
    # absent, which is every prompt file written before `subject-noun.v1`, and None falls back to
    # the module constant MAX_TOKENS — so no existing variant's decode budget moves. It exists
    # because MAX_TOKENS 256 is sized for a thirteen-key enum document, and a one-or-two-word
    # free-text answer wants a cap tight enough that a runaway decode costs a second rather than
    # a minute. A cap is not a cost: greedy decoding stops at the grammar's closing brace.
    max_tokens: int | None = None
    # Probe-arm metadata. Absent (None / empty) on every non-probe variant.
    presentation_mode: str | None = None      # 'bundled' | 'separate'
    probe_order: tuple[str, ...] = ()
    derivation_schema_version: str | None = None
    referent_preamble: str | None = None
    unsure_framing: str | None = None

    @property
    def id(self) -> str:
        return f"{self.schema_version}/{self.variant}"

    @property
    def is_probe_variant(self) -> bool:
        return self.derivation_schema_version is not None


def load_prompt_variant(path: Path, expected_schema_version: str | None = None) -> PromptVariant:
    raw = path.read_bytes()
    doc = json.loads(raw)
    schema = doc["json_schema"]

    # Per-variant vocabularies, falling back to the group-a.v1 module constants so A/B and C/D
    # load exactly as before (PREMISE_NEXT.md §13 item 2: "fall back to the module constants
    # when absent").
    canonical_fields = tuple(doc.get("canonical_fields", CANONICAL_FIELDS))
    raw_vocabularies = doc.get("vocabularies")
    vocabularies = ({k: tuple(v) for k, v in raw_vocabularies.items()}
                    if raw_vocabularies is not None else dict(VOCABULARIES))

    variant = PromptVariant(
        path=path,
        variant=doc["prompt_variant"],
        schema_version=doc["schema_version"],
        system=doc["system"],
        prompt=doc["prompt"],
        json_schema=schema,
        field_map=doc["field_map"],
        free_text_fields=tuple(doc.get("free_text_fields", ())),
        # §5.2: prompt_hash is the SHA-256 of the exact prompt text. System + user, joined
        # by a NUL so the split point is unambiguous.
        prompt_hash=sha256_bytes(("\0".join([doc["system"], doc["prompt"]])).encode("utf-8")),
        schema_hash=sha256_bytes(json.dumps(schema, sort_keys=True, separators=(",", ":")).encode("utf-8")),
        file_hash=sha256_bytes(raw),
        canonical_fields=canonical_fields,
        vocabularies=vocabularies,
        multi_select_fields=tuple(doc.get("multi_select_fields") or ()),
        max_tokens=doc.get("max_tokens"),
        presentation_mode=doc.get("presentation_mode"),
        probe_order=tuple(doc.get("probe_order") or ()),
        derivation_schema_version=doc.get("derivation_schema_version"),
        referent_preamble=doc.get("referent_preamble"),
        unsure_framing=doc.get("unsure_framing"),
    )
    expected = expected_schema_version if expected_schema_version is not None else SCHEMA_VERSION
    assert variant.schema_version == expected, (
        f"{path.name} declares schema_version {variant.schema_version!r}, "
        f"this prompt set is {expected!r}")
    # §13.2: a deleted v1 probe prompt must never load, however it got back onto disk.
    assert_not_superseded(variant.prompt_hash, variant.file_hash, path.name)
    missing = set(canonical_fields) - set(variant.field_map.values())
    assert not missing, f"{path.name} field_map does not cover {sorted(missing)}"
    # The schema's property order IS the generation order under constrained decoding, so it
    # is part of the variant's identity and must match the keys the field map declares.
    assert set(schema["properties"]) == set(variant.field_map), (
        f"{path.name}: json_schema properties and field_map keys disagree")
    for key, canonical in variant.field_map.items():
        if canonical not in vocabularies:
            continue
        prop = schema["properties"][key]
        if canonical in variant.multi_select_fields:
            # A multi-select is an array of enum items. llguidance 1.7.6 compiles this; it does
            # NOT implement `uniqueItems`, so declaring it would make the grammar fail to build
            # at the first token of the run rather than here (PREMISE_NEXT.md §15.3).
            assert prop.get("type") == "array", (
                f"{path.name}: {key} is declared multi-select but its schema type is "
                f"{prop.get('type')!r}, not 'array'")
            assert tuple(sorted(prop["items"]["enum"])) == tuple(sorted(vocabularies[canonical])), (
                f"{path.name}: {key} item enum does not match the declared vocabulary for {canonical}")
            assert prop.get("minItems") == 1, (
                f"{path.name}: {key} must declare minItems 1 — an empty list is not an answer")
            assert "uniqueItems" not in prop, (
                f"{path.name}: {key} declares uniqueItems, which llguidance does not implement")
        else:
            assert tuple(sorted(prop["enum"])) == tuple(sorted(vocabularies[canonical])), (
                f"{path.name}: {key} enum does not match the declared vocabulary for {canonical}")
    return variant


def prompt_set_paths(prompt_set: str = DEFAULT_PROMPT_SET) -> tuple[str, list[Path]]:
    assert prompt_set in PROMPT_SETS, (
        f"unknown prompt set {prompt_set!r}; known: {sorted(PROMPT_SETS)}")
    schema_version, glob = PROMPT_SETS[prompt_set]
    return schema_version, sorted(PROMPTS_DIR.glob(glob))


def default_variants(prompt_set: str = DEFAULT_PROMPT_SET) -> list[PromptVariant]:
    schema_version, paths = prompt_set_paths(prompt_set)
    assert paths, f"prompt set {prompt_set!r} matched no files under {PROMPTS_DIR}"
    variants = [load_prompt_variant(p, schema_version) for p in paths]
    # One process, one question set (pipeline §11).
    assert len({v.schema_version for v in variants}) == 1, (
        f"prompt set {prompt_set!r} mixes schema versions: "
        f"{sorted({v.schema_version for v in variants})}")
    return variants


# ---------------------------------------------------------------- images

def normalize_image(path: Path, cap_px: int):
    """Open an image and cap its long edge. Returns (PIL image, source_long_edge, processed_long_edge).

    Downscale only (PHASE_0_DECISIONS.md §1: never upscale). AVIF/HEIF is registered because
    one eval-set entry is an AVIF and pipeline §7.4.1 trap 3 makes this a standing dependency.
    """
    from PIL import Image, ImageOps
    try:
        import pillow_avif  # noqa: F401  (registers the AVIF plugin as a side effect)
    except ImportError:
        pass

    image = Image.open(path)
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    source_long_edge = max(image.size)
    if cap_px and source_long_edge > cap_px:
        scale = cap_px / source_long_edge
        target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        # LANCZOS: fixed, named resampling filter so the normalization is reproducible.
        image = image.resize(target, Image.LANCZOS)
    return image, source_long_edge, max(image.size)


# ---------------------------------------------------------------- eval set

@dataclass(frozen=True)
class EvalItem:
    image_id: str
    artwork_id: str
    image_path: str
    absolute_path: Path
    image_sha256: str
    source_long_edge_px: int
    format: str
    gradient_truth: bool | None
    conflicted: bool
    included: bool


def load_eval_set(path: Path = EVAL_SET_PATH) -> tuple[list[EvalItem], dict[str, Any]]:
    doc = json.loads(path.read_text())
    items = [
        EvalItem(
            image_id=e["image"]["imageId"],
            artwork_id=e["image"]["artworkId"],
            image_path=e["image"]["imagePath"],
            absolute_path=Path(e["image"]["absolutePath"]),
            image_sha256=e["image"]["sha256"],
            source_long_edge_px=e["image"]["longEdgePx"],
            format=e["image"]["format"],
            gradient_truth=e["groundTruth"]["gradient"],
            conflicted=e["groundTruth"]["conflicted"],
            included=e["included"],
        )
        for e in doc["entries"]
    ]
    return items, doc["meta"]


# ---------------------------------------------------------------- output rows

def row_key(image_sha256: str, variant: PromptVariant) -> str:
    """Resume identity. Deliberately excludes run_id: a resumed run must skip work an earlier
    run already did with the same weights, prompt and schema (§5.1). Deliberately includes
    prompt_hash: change a single character of a prompt and every row must be redone."""
    return f"{image_sha256}|{variant.schema_version}|{variant.variant}|{variant.prompt_hash}"


class JsonlSink:
    """Append-only JSONL, flushed and fsynced after every record (§5.1).

    Never truncates. A resumed run appends to the same file.
    """

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = open(path, "a", encoding="utf-8")

    def write(self, record: dict[str, Any]) -> None:
        self._handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        self._handle.flush()
        os.fsync(self._handle.fileno())

    def close(self) -> None:
        self._handle.close()


# [REVIEWED] Missing-file policy. Phase-0 adversarial review, findings 1 and 7: the old
# unconditional `return []` on a nonexistent path let `analyze.py` publish a complete, well-formed
# agreement report — including an affirmative `canary_stable: true` — over zero rows, and let
# `derive_probes.py` publish an all-zero derivation report, both with exit 0. A missing input is
# never a legitimate analysis result, so the DEFAULT is now to die loudly. The resume/fresh-run
# call sites that genuinely mean "nothing written yet" pass `require=False` explicitly, so the
# intent is visible at every call site rather than assumed from a shared default.
def read_jsonl(path: Path, *, require: bool = True) -> list[dict[str, Any]]:
    if not path.exists():
        if require:
            raise SystemExit(
                f"read_jsonl: input file does not exist: {path}\n"
                "Refusing to continue: an analysis over zero rows is not an analysis. "
                "Pass require=False only where an absent file legitimately means "
                "'nothing has been written yet' (fresh run / resume)."
            )
        return []
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                # A record truncated by a hard kill mid-write. Drop it; the work redoes.
                continue
    return rows


def completed_keys(path: Path) -> set[str]:
    """Keys already carrying a terminal row. `failed` is terminal and queryable (§5.1) —
    the difference between 'not attempted' and 'attempted and failed' survives."""
    # require=False by design: on a fresh run the output file does not exist yet and "no keys
    # completed" is the correct answer, not an error.
    return {r["row_key"] for r in read_jsonl(path, require=False)
            if r.get("status") in ("ok", "failed") and "row_key" in r}


class AttemptLedger:
    """Per-image attempt counter, persisted BEFORE inference (§5.1).

    Without this, an image that reliably crashes the process leaves no row, the supervisor
    restarts, the queue is unchanged, and the run spins forever producing nothing.
    """

    def __init__(self, path: Path):
        self.path = path
        self.counts: dict[str, int] = {}
        # require=False by design: a fresh run has no attempt ledger yet.
        for row in read_jsonl(path, require=False):
            key = row.get("row_key")
            if key:
                self.counts[key] = max(self.counts.get(key, 0), int(row.get("attempt", 0)))
        path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = open(path, "a", encoding="utf-8")

    def attempts(self, key: str) -> int:
        return self.counts.get(key, 0)

    def record(self, key: str, image_path: str) -> int:
        attempt = self.counts.get(key, 0) + 1
        self.counts[key] = attempt
        self._handle.write(json.dumps(
            {"row_key": key, "attempt": attempt, "image_path": image_path, "started_at": utc_now()}) + "\n")
        self._handle.flush()
        os.fsync(self._handle.fileno())
        return attempt

    def close(self) -> None:
        self._handle.close()


# ---------------------------------------------------------------- validation

class SchemaViolation(Exception):
    pass


def validate_and_canonicalize(payload: Any, variant: PromptVariant) -> dict[str, Any]:
    """Check the model's document against the frozen closed vocabularies and rename its keys
    to the canonical field names. Raises SchemaViolation, which the retry path counts."""
    if not isinstance(payload, dict):
        raise SchemaViolation(f"top level is {type(payload).__name__}, not an object")
    expected = set(variant.field_map)
    if set(payload) != expected:
        raise SchemaViolation(
            f"keys {sorted(payload)} != required {sorted(expected)}")
    out: dict[str, Any] = {}
    for key, canonical in variant.field_map.items():
        value = payload[key]
        if canonical in variant.multi_select_fields:
            # Structural only. Every one of these three conditions is already guaranteed by the
            # array-of-enum grammar, so a violation here means the grammar path regressed — which
            # is exactly what the check is for. Deliberately NOT checked: repeated values, and an
            # exclusive value (`none` / `not_applicable`) appearing alongside others. The grammar
            # cannot forbid either, greedy decoding means a retry reproduces them exactly, and
            # failing the row would discard the other eight answers to punish one. They are kept
            # verbatim and counted by the analysis (PREMISE_NEXT.md §15.4), which is the treatment
            # ORACLE_QUESTION_SET.md §A.6.6 established for self-contradiction.
            vocabulary = variant.vocabularies[canonical]
            if not isinstance(value, list):
                raise SchemaViolation(f"{key} must be a list, got {type(value).__name__}")
            if not value:
                raise SchemaViolation(f"{key} is an empty list; minItems is 1")
            for entry in value:
                if not isinstance(entry, str) or entry not in vocabulary:
                    raise SchemaViolation(
                        f"{key} contains {entry!r}, outside the vocabulary for {canonical}")
            out[canonical] = list(value)
            continue
        if canonical in variant.vocabularies:
            if not isinstance(value, str) or value not in variant.vocabularies[canonical]:
                raise SchemaViolation(f"{key}={value!r} is outside the vocabulary for {canonical}")
        else:
            if not isinstance(value, str):
                raise SchemaViolation(f"{key} must be a string, got {type(value).__name__}")
        out[canonical] = value
    return out


def parse_model_text(text: str) -> Any:
    """Parse the model's answer. Constrained decoding makes the whole reply a JSON document,
    so this is a plain json.loads with one tolerance: a fenced block, in case a future run
    disables the grammar."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[1] if "\n" in stripped else stripped
        if stripped.rstrip().endswith("```"):
            stripped = stripped.rstrip()[:-3]
    return json.loads(stripped)


# ---------------------------------------------------------------- probe derivation

# [REVIEWED] PREMISE_NEXT.md §13 item 3 and §13.1. The 729-row table IS the contract:
# "an implementation that disagrees with any of the 729 entries is wrong, not the table."
# Everything below is therefore a LOOKUP. The rules are never evaluated here — selftest.py
# implements them once, purely to prove the shipped table matches its own stated rules.
DERIVATION_PATH = PROMPTS_DIR / "derivation.group-a.probes.v1.json"
# [REVIEWED] PREMISE_NEXT.md §13.1, published alongside the file.
DERIVATION_SHA256 = "da67d5ebf0aaab0c593f8fb8e040192e0e688f9dccfcc9bb2fe6b2af391a2fc5"
# [MEASURED] 3^6 over {yes,no,unsure}; the file's own self_check asserts totality.
DERIVATION_TABLE_SIZE = 729
# [REVIEWED] The file's `encoding` block: "y=yes, n=no, u=unsure".
PROBE_ANSWER_CODES = {"yes": "y", "no": "n", "unsure": "u"}

# [REVIEWED] PREMISE_NEXT.md §13 item 4: "a row that is missing any of its six probes must
# derive `underdetermined:incomplete` rather than being silently dropped."
INCOMPLETE_TAG = "underdetermined"
INCOMPLETE_DISPOSITION = "incomplete"


class ProbeDerivation:
    """The committed probe→tag table, loaded and verified. Lookup only."""

    def __init__(self, path: Path = DERIVATION_PATH):
        raw = path.read_bytes()
        digest = sha256_bytes(raw)
        if digest != DERIVATION_SHA256:
            raise RuntimeError(
                f"{path.name} sha256 {digest} != pinned {DERIVATION_SHA256}. The derivation "
                f"table is a contract; a changed table is a new schema version, not an edit.")
        doc = json.loads(raw)
        self.path = path
        self.sha256 = digest
        self.schema_version = doc["schema_version"]
        self.probe_order: tuple[str, ...] = tuple(doc["probe_order"])
        self.table: dict[str, dict[str, Any]] = doc["table"]
        self.rules_in_order = doc["rules_in_order"]
        self.self_check = doc["self_check"]
        self.field_texture_derivation = doc["field_texture_derivation"]
        self.shading_geometry_derivation = doc["shading_geometry_derivation"]
        assert len(self.table) == DERIVATION_TABLE_SIZE, (
            f"{path.name} has {len(self.table)} rows, expected {DERIVATION_TABLE_SIZE}")
        assert len(self.probe_order) == 6, f"probe_order is {self.probe_order}"

    # -- vector ---------------------------------------------------------------

    def vector(self, answers: dict[str, Any]) -> tuple[str | None, list[str]]:
        """Six characters in `probe_order`. Returns (vector, missing_probe_names).

        A probe answered outside {yes,no,unsure} is treated as missing rather than guessed —
        constrained decoding makes it impossible, and silently coercing it would be worse.
        """
        chars, missing = [], []
        for probe in self.probe_order:
            code = PROBE_ANSWER_CODES.get(answers.get(probe))
            if code is None:
                missing.append(probe)
            else:
                chars.append(code)
        if missing:
            return None, missing
        return "".join(chars), []

    # -- lookup ---------------------------------------------------------------

    def derive(self, answers: dict[str, Any]) -> dict[str, Any]:
        """Look the answers up. Never computes a tag; the table decides everything."""
        vector, missing = self.vector(answers)
        if vector is None:
            # §13 item 4. Not a drop, not a guess: a named, countable outcome.
            return {
                "probe_vector": None,
                "probe_missing": missing,
                "ground_type": INCOMPLETE_TAG,
                "field_texture": INCOMPLETE_TAG,
                "disposition": INCOMPLETE_DISPOSITION,
                "derived_tag": f"{INCOMPLETE_TAG}:{INCOMPLETE_DISPOSITION}",
                "tensions": [],
                "shading_geometry": None,
                "shading_geometry_raw": answers.get("shading_direction"),
                "shading_geometry_source": "not_derived_incomplete",
                "derivation_sha256": self.sha256,
                "derivation_schema_version": self.schema_version,
            }
        row = self.table[vector]          # KeyError here would mean a non-total table
        ground_type = row["ground_type"]
        # The file's shading_geometry_derivation, applied verbatim: take the answer as given,
        # then force not_applicable when the derived ground_type is not shaded_field. Both
        # values are reported, as that block requires.
        raw_shading = answers.get("shading_direction")
        if raw_shading is None:
            forced, source = None, "not_asked"
        elif ground_type == "shaded_field":
            forced, source = raw_shading, "as_answered"
        else:
            forced, source = "not_applicable", "forced_by_ground_type"
        return {
            "probe_vector": vector,
            "probe_missing": [],
            "ground_type": ground_type,
            "field_texture": row["field_texture"],
            "disposition": row["disposition"],
            "derived_tag": f"{ground_type}:{row['disposition']}",
            "tensions": list(row["tensions"]),
            "shading_geometry": forced,
            "shading_geometry_raw": raw_shading,
            "shading_geometry_source": source,
            "derivation_sha256": self.sha256,
            "derivation_schema_version": self.schema_version,
        }


def join_probe_answers(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Merge the parsed answers of one image's rows into a single answer dict.

    Bundled mode passes one row and this is a no-op. Separate mode passes up to six solo rows
    (§13 item 4: "the six solo rows for one image joined into one vector"). A failed row
    contributes nothing, which is exactly how a probe goes missing and the join lands on
    `underdetermined:incomplete`.
    """
    answers: dict[str, Any] = {}
    for row in rows:
        parsed = row.get("parsed")
        if isinstance(parsed, dict):
            answers.update(parsed)
    return answers


# ---------------------------------------------------------------- model manifest

def load_model_manifest(path: Path = MODEL_MANIFEST_PATH) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing. Run: .venv/bin/python pin-model.py")
    doc = json.loads(path.read_text())
    if doc["model_revision"] != MODEL_REVISION:
        raise RuntimeError(
            f"manifest pins revision {doc['model_revision']}, common.py pins {MODEL_REVISION}")
    return doc


# ---------------------------------------------------------------- the oracle

@dataclass
class Answer:
    status: str                    # 'ok' | 'failed'
    raw_text: str
    parsed: dict[str, Any] | None
    attempts: int
    parse_failed: bool
    error_class: str | None
    error_message: str | None
    prompt_tokens: int | None
    generation_tokens: int | None
    generation_seconds: float
    peak_memory_gb: float | None


class Oracle:
    """One loaded model, reused for the whole process. Loading costs ~30 s and ~26 GB."""

    def __init__(self, manifest: dict[str, Any] | None = None, verbose: bool = False):
        import mlx.core as mx
        import mlx_vlm
        from mlx_vlm import load
        from mlx_vlm.utils import get_model_path, load_config

        self.manifest = manifest if manifest is not None else load_model_manifest()
        self.model_path = Path(get_model_path(MODEL_REPO, revision=MODEL_REVISION))
        assert self.manifest["snapshot_path"] == str(self.model_path), (
            f"manifest snapshot {self.manifest['snapshot_path']} != resolved {self.model_path}")
        started = time.time()
        self.model, self.processor = load(str(self.model_path))
        self.config = load_config(str(self.model_path), trust_remote_code=True)
        self.load_seconds = time.time() - started
        self.mx = mx
        self.runtime_version = mlx_vlm.__version__
        import mlx
        self.mlx_version = mlx.core.__version__ if hasattr(mlx.core, "__version__") else _pkg_version("mlx")
        self._processors_cache: dict[str, Any] = {}
        self.verbose = verbose

    # -- constrained decoding ------------------------------------------------

    def _logits_processor(self, variant: PromptVariant):
        """A fresh llguidance-backed processor per call. The matcher is stateful, so reusing
        one across images would carry the previous answer's parse state into the next."""
        from mlx_vlm.structured import build_json_schema_logits_processor
        tokenizer = getattr(self.processor, "tokenizer", self.processor)
        return build_json_schema_logits_processor(tokenizer, variant.json_schema)

    def constrained_decoding_available(self, variant: PromptVariant | None = None) -> bool:
        try:
            self._logits_processor(variant if variant is not None else default_variants()[0])
            return True
        except Exception:
            return False

    # -- one inference -------------------------------------------------------

    def _generate_once(self, image, variant: PromptVariant, constrained: bool):
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template

        messages = [
            {"role": "system", "content": variant.system},
            {"role": "user", "content": variant.prompt},
        ]
        formatted = apply_chat_template(self.processor, self.config, messages, num_images=1)
        kwargs: dict[str, Any] = dict(
            max_tokens=variant.max_tokens or MAX_TOKENS,
            temperature=TEMPERATURE,
            verbose=False,
        )
        if constrained:
            kwargs["logits_processors"] = [self._logits_processor(variant)]
        return generate(self.model, self.processor, formatted, image=[image], **kwargs)

    def ask(self, image, variant: PromptVariant, max_attempts: int = MAX_ATTEMPTS,
            constrained: bool = USE_CONSTRAINED_DECODING,
            on_attempt=None) -> Answer:
        """Ask one question set about one already-normalized image.

        §9.3: constrained decoding first; validate-against-schema-and-retry underneath it,
        with a cap and a parse_failed marker so failures are counted, never dropped.
        Note that under greedy decoding a retry reproduces the previous answer exactly, so a
        repeated parse failure is an infrastructure fact, not bad luck — which is precisely
        what the parse_failed counter is for.
        """
        last_error: Exception | None = None
        raw_text = ""
        parse_failed = False
        started = time.time()
        result = None
        for attempt in range(1, max_attempts + 1):
            if on_attempt is not None:
                on_attempt(attempt)
            try:
                result = self._generate_once(image, variant, constrained)
                raw_text = result.text
                parsed = validate_and_canonicalize(parse_model_text(raw_text), variant)
                return Answer(
                    status="ok", raw_text=raw_text, parsed=parsed, attempts=attempt,
                    parse_failed=False, error_class=None, error_message=None,
                    prompt_tokens=getattr(result, "prompt_tokens", None),
                    generation_tokens=getattr(result, "generation_tokens", None),
                    generation_seconds=time.time() - started,
                    peak_memory_gb=getattr(result, "peak_memory", None),
                )
            except (json.JSONDecodeError, SchemaViolation) as error:
                parse_failed = True
                last_error = error
            except Exception as error:  # OOM, decoder failure, anything else
                last_error = error
        return Answer(
            status="failed", raw_text=raw_text, parsed=None, attempts=max_attempts,
            parse_failed=parse_failed,
            error_class=type(last_error).__name__ if last_error else "Unknown",
            error_message=str(last_error)[:500] if last_error else None,
            prompt_tokens=getattr(result, "prompt_tokens", None) if result else None,
            generation_tokens=getattr(result, "generation_tokens", None) if result else None,
            generation_seconds=time.time() - started,
            peak_memory_gb=getattr(result, "peak_memory", None) if result else None,
        )


def _pkg_version(name: str) -> str:
    try:
        from importlib.metadata import version
        return version(name)
    except Exception:
        return "unknown"


# ---------------------------------------------------------------- provenance row

def provenance(run_id: str, variant: PromptVariant, oracle: Oracle,
               item: EvalItem, source_long_edge: int, processed_long_edge: int) -> dict[str, Any]:
    """The §5.2 table, plus what §7.5 and §9.1 require. Provenance lives in the rows."""
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
        "resolution_cap": RESOLUTION_CAP_PX,
        "decoded_at": utc_now(),
        # identity (§9.1: artwork_id is the join key, image_id is a rendition of it)
        "image_id": item.image_id,
        "artwork_id": item.artwork_id,
        "image_path": item.image_path,
        # §7.5: without the second, a reader cannot tell a normalized run from a native one
        "source_long_edge_px": source_long_edge,
        "processed_long_edge_px": processed_long_edge,
        # extra pins, because "could I regenerate this?" needs more than the doc's minimum
        "schema_hash": variant.schema_hash,
        "prompt_file_sha256": variant.file_hash,
        "weights_manifest_sha256": oracle.manifest["weights_manifest_sha256"],
        "mlx_version": _pkg_version("mlx"),
        "python_version": platform.python_version(),
        "constrained_decoding": USE_CONSTRAINED_DECODING,
        "temperature": TEMPERATURE,
        # The decode budget actually in force for this variant, resolved rather than implied, so a
        # reader never has to know which prompt file carried an override. Additive: rows written
        # before this key existed simply ran at MAX_TOKENS.
        "max_tokens": variant.max_tokens or MAX_TOKENS,
        "repo_head": GIT_HEAD,
    }


# [MEASURED] Read once at import so every row in a process agrees.
GIT_HEAD = git_head()


def new_run_id() -> str:
    return str(uuid.uuid4())

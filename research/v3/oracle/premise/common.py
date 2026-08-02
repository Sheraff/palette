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

    @property
    def id(self) -> str:
        return f"{self.schema_version}/{self.variant}"


def load_prompt_variant(path: Path) -> PromptVariant:
    raw = path.read_bytes()
    doc = json.loads(raw)
    schema = doc["json_schema"]
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
    )
    assert variant.schema_version == SCHEMA_VERSION, (
        f"{path.name} declares schema_version {variant.schema_version!r}, "
        f"common.py has {SCHEMA_VERSION!r} frozen")
    missing = set(CANONICAL_FIELDS) - set(variant.field_map.values())
    assert not missing, f"{path.name} field_map does not cover {sorted(missing)}"
    # The schema's property order IS the generation order under constrained decoding, so it
    # is part of the variant's identity and must match the keys the field map declares.
    assert set(schema["properties"]) == set(variant.field_map), (
        f"{path.name}: json_schema properties and field_map keys disagree")
    for key, canonical in variant.field_map.items():
        if canonical in VOCABULARIES:
            assert tuple(sorted(schema["properties"][key]["enum"])) == tuple(sorted(VOCABULARIES[canonical])), (
                f"{path.name}: {key} enum does not match the frozen vocabulary for {canonical}")
    return variant


def default_variants() -> list[PromptVariant]:
    return [load_prompt_variant(p) for p in sorted(PROMPTS_DIR.glob("group-a.variant-*.json"))]


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


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
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
    return {r["row_key"] for r in read_jsonl(path)
            if r.get("status") in ("ok", "failed") and "row_key" in r}


class AttemptLedger:
    """Per-image attempt counter, persisted BEFORE inference (§5.1).

    Without this, an image that reliably crashes the process leaves no row, the supervisor
    restarts, the queue is unchanged, and the run spins forever producing nothing.
    """

    def __init__(self, path: Path):
        self.path = path
        self.counts: dict[str, int] = {}
        for row in read_jsonl(path):
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
        if canonical in VOCABULARIES:
            if not isinstance(value, str) or value not in VOCABULARIES[canonical]:
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

    def constrained_decoding_available(self) -> bool:
        try:
            self._logits_processor(default_variants()[0])
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
            max_tokens=MAX_TOKENS,
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
        "repo_head": GIT_HEAD,
    }


# [MEASURED] Read once at import so every row in a process agrees.
GIT_HEAD = git_head()


def new_run_id() -> str:
    return str(uuid.uuid4())

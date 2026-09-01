"""Shared machinery for the oracle VLM bake-off.

Spec: research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md
  §2.3  model and quantization          §3    two prompt variants, greedy decoding
  §5.1  resumability, attempt cap       §5.2  provenance columns on every row
  §5.3  canary                          §7.5  normalize for comparability
  §9.3  constrained decoding, or validate-and-retry with a cap and a parse_failed marker

REUSE, NOT REIMPLEMENTATION. Every piece of run hygiene the premise test already proved —
the JSONL sink, the persisted attempt ledger, resume keys, schema validation against the
frozen closed vocabularies, image normalization, prompt-variant loading and integrity
assertions — is IMPORTED from research/v3/oracle/premise/common.py, not copied. Two reasons:
a copy drifts, and the bake-off's whole claim is that every arm was asked the same question
the same way. The premise workstream owns that file; this workstream only reads it.

What is genuinely new here, and why:
  1. `ArmOracle` — premise's Oracle hard-codes one repo and one revision at import time.
     The bake-off needs the same behaviour parameterized by arm.
  2. `bakeoff_row_key` — the arm joins the resume identity, so two arms' rows can never
     satisfy each other's queue even if they land in one file.
  3. A real validate-and-retry fallback. Premise measured that under greedy decoding a plain
     retry reproduces the failure byte for byte. When an arm cannot bind the grammar, the
     retry appends a repair instruction, which is the only thing that makes the next attempt
     a different computation.
  4. Item sets: gold30 (reviewer-labelled) and eval142 (accepted flags).
"""

from __future__ import annotations

import json
import platform
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import config

# The premise workstream's machinery, imported read-only.
sys.path.insert(0, str(config.PREMISE_DIR))
import common as premise_common  # noqa: E402  (research/v3/oracle/premise/common.py)
from common import (  # noqa: E402
    CANONICAL_FIELDS, MAX_ATTEMPTS, MAX_TOKENS, RESOLUTION_CAP_PX, TEMPERATURE, VOCABULARIES,
    Answer, AttemptLedger, EvalItem, JsonlSink, PromptVariant, SchemaViolation,
    load_prompt_variant, normalize_image, parse_model_text, read_jsonl, sha256_bytes,
    sha256_file, utc_now, validate_and_canonicalize,
)

__all__ = [
    "CANONICAL_FIELDS", "MAX_ATTEMPTS", "MAX_TOKENS", "RESOLUTION_CAP_PX", "TEMPERATURE",
    "VOCABULARIES", "Answer", "AttemptLedger", "EvalItem", "JsonlSink", "PromptVariant",
    "SchemaViolation", "ArmOracle", "GpuFault", "bakeoff_row_key", "completed_keys",
    "default_variants", "is_gpu_fault",
    "gold30_reviewer_labels", "load_items", "load_arm_manifest", "load_canary_item",
    "normalize_image", "parse_model_text", "provenance", "read_jsonl", "sha256_bytes",
    "sha256_file", "utc_now", "validate_and_canonicalize",
]


# ---------------------------------------------------------------- prompt variants

def default_variants() -> list[PromptVariant]:
    """The premise run's two variants, loaded from the premise prompts directory.

    Not a copy: config.PROMPTS_DIR points at research/v3/oracle/premise/prompts/. Every row
    records prompt_hash and prompt_file_sha256, so a later edit there is detectable.
    """
    paths = sorted(config.PROMPTS_DIR.glob("group-a.variant-*.json"))
    assert paths, f"no prompt variants under {config.PROMPTS_DIR}"
    return [load_prompt_variant(p) for p in paths]


# ---------------------------------------------------------------- item sets

def _eval_entries() -> list[dict]:
    return json.loads(config.EVAL_SET_PATH.read_text())["entries"]


def load_items(item_set: str) -> list[EvalItem]:
    """The population for one run.

    eval142 — every `included` entry of the premise eval set.
    gold30  — the 30 artworks the reviewer hand-labelled in the disambiguation round,
              resolved back to their eval-set entries by content hash (never by id prefix:
              CONVENTIONS.md, identify artworks by full path + content hash).
    """
    if item_set not in config.ITEM_SETS:
        raise KeyError(f"unknown item set {item_set!r}; known: {list(config.ITEM_SETS)}")
    items, _meta = premise_common.load_eval_set(config.EVAL_SET_PATH)
    included = [i for i in items if i.included]
    assert len(included) == config.EVAL142_EXPECTED_COUNT, (
        f"eval set holds {len(included)} included entries, config expects "
        f"{config.EVAL142_EXPECTED_COUNT}")
    if item_set == config.ITEMS_EVAL142:
        return included
    wanted = set(gold30_reviewer_labels())
    by_sha = {i.image_sha256: i for i in included}
    missing = sorted(wanted - set(by_sha))
    assert not missing, f"gold-30 hashes absent from the eval set: {missing}"
    return [by_sha[sha] for sha in sorted(wanted)]


def gold30_reviewer_labels() -> dict[str, dict[str, Any]]:
    """sha256 -> the reviewer's own answer for that artwork.

    Source: research/v3/data/oracle-validation/premise-disambiguation-1-analysis.json, whose
    `perArtwork` rows carry `reviewerGroundType` (a word from the frozen ground_type
    vocabulary), `reviewerBinary` (gradient | flat | no-prediction) and `flagGradient` (the
    accepted palette's boolean, the thing the reviewer was tie-breaking against).

    READ THE SLICE'S EPISTEMOLOGY BEFORE THE NUMBERS. Every one of these 30 artworks was
    selected BECAUSE the premise oracle and the accepted flag contradicted each other, and
    the analysis' own summary calls the outcome "a lean, not a verdict" (flag 14/30, oracle
    10/30, neither 6/30). High agreement here is not the bake-off's success criterion; the
    tractable part of the full 142 is.
    """
    doc = json.loads(config.GOLD30_ANALYSIS_PATH.read_text())
    rows = doc["perArtwork"]
    assert len(rows) == config.GOLD30_EXPECTED_COUNT, (
        f"disambiguation analysis holds {len(rows)} artworks, config expects "
        f"{config.GOLD30_EXPECTED_COUNT}")
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        assert row.get("answered"), f"{row['itemId']} was not answered by the reviewer"
        label = row["reviewerGroundType"]
        assert label in VOCABULARIES["ground_type"], (
            f"{row['itemId']} reviewer label {label!r} is outside the frozen vocabulary")
        out[row["sha256"]] = {
            "item_id": row["itemId"],
            "image_path": row["imagePath"],
            "reviewer_ground_type": label,
            "reviewer_binary": row["reviewerBinary"],
            "flag_gradient": row["flagGradient"],
            "stratum": row["stratum"],
        }
    return out


def load_canary_item(items: list[EvalItem]) -> EvalItem:
    """The premise run's canary image, so a canary answer is comparable across arms.

    The canary need not belong to the item set being run — it is excluded from every
    analysis by its `is_canary` flag — so it is resolved against the whole eval set.
    """
    doc = json.loads(config.PREMISE_CANARY_PATH.read_text())
    sha = doc["image_sha256"]
    everything, _ = premise_common.load_eval_set(config.EVAL_SET_PATH)
    by_sha = {i.image_sha256: i for i in everything}
    assert sha in by_sha, f"pinned canary {sha} is not in the eval set"
    return by_sha[sha]


# ---------------------------------------------------------------- resume identity

def bakeoff_row_key(arm: str, image_sha256: str, variant: PromptVariant) -> str:
    """Resume identity, arm first.

    Deliberately excludes run_id (§5.1: a resumed run must skip work already done with the
    same weights, prompt and schema) and deliberately includes prompt_hash and arm (change a
    character of a prompt, or the model, and every row must be redone).
    """
    return f"{arm}|{premise_common.row_key(image_sha256, variant)}"


def completed_keys(path: Path) -> set[str]:
    """Keys already carrying a terminal row. `failed` is terminal and queryable (§5.1)."""
    return premise_common.completed_keys(path)


# ---------------------------------------------------------------- weights manifest

def load_arm_manifest(arm: str) -> dict[str, Any]:
    """The arm's pinned weight provenance, written by pin_arms.py.

    The incumbent's manifest is INHERITED from the premise workstream rather than recomputed
    — same repo, same revision, same 26 GB already hashed there once.
    """
    path = config.manifest_path(arm)
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing. Run: .venv/bin/python pin_arms.py --arm {arm}")
    doc = json.loads(path.read_text())
    expected = config.arm_config(arm)
    if doc["model_revision"] != expected["hf_revision"]:
        raise RuntimeError(
            f"{path.name} pins revision {doc['model_revision']}, config.py pins "
            f"{expected['hf_revision']}")
    if doc["model_id"] != expected["hf_repo"]:
        raise RuntimeError(
            f"{path.name} pins repo {doc['model_id']}, config.py pins {expected['hf_repo']}")
    return doc


def load_arm_verification(arm: str) -> dict[str, Any] | None:
    path = config.verification_path(arm)
    return json.loads(path.read_text()) if path.exists() else None


# ---------------------------------------------------------------- GPU faults

class GpuFault(RuntimeError):
    """The Metal context died. Not this image's fault, and not survivable in this process.

    [MEASURED] 2026-08-03, verifying qwen3-32b-dense while another workstream was using the
    GPU: the first decode raised

        [METAL] Command buffer execution failed: Caused GPU Timeout Error
        (00000002:kIOGPUCommandBufferCallbackErrorTimeout)

    after 111 s, and every attempt afterwards in that same process raised the identical error
    in 0.25 s. The context stays poisoned until the process exits.

    That is why this is a distinct exception rather than one more `except Exception`. Under
    the ordinary retry path a poisoned context would burn through the entire queue in seconds,
    writing a terminal `failed` row for every remaining item — and `failed` is terminal, so a
    resumed run would never retry them. The run would report itself complete and be worthless.
    Instead the worker exits non-zero, the supervisor starts a fresh process, and the attempt
    ledger (which is persisted BEFORE inference) still bounds how often one image may do this.
    """


# [MEASURED] Substrings seen in mlx/Metal command-buffer failures on this machine
# (2026-08-03) plus the two adjacent wordings Metal uses for the same class of fault. Matched
# case-insensitively against the exception text.
GPU_FAULT_SIGNATURES = (
    "command buffer execution failed",
    "kiogpucommandbuffercallbackerror",
    "gpu timeout",
    "insufficient memory",
    "metal::device",
)


def is_gpu_fault(error: BaseException) -> bool:
    text = f"{type(error).__name__}: {error}".lower()
    return any(signature in text for signature in GPU_FAULT_SIGNATURES)


# ---------------------------------------------------------------- the oracle

@dataclass
class GrammarStatus:
    """Whether the llguidance grammar actually bound for this model, and what happened if not.

    §9.3 prefers constrained decoding but does not assume it: llguidance builds its mask from
    the model's own tokenizer, and a family whose tokenizer the bridge cannot read falls back
    to validate-and-retry. Measured per arm, never inherited from another arm's result.
    """
    available: bool
    detail: str


class ArmOracle:
    """One loaded arm, reused for the whole process. Loading costs ~30-90 s and 26-36 GB.

    premise_common.Oracle with the model identity lifted out of module scope into an argument, plus
    the repair-retry path an unconstrained arm needs.
    """

    def __init__(self, arm: str, manifest: dict[str, Any] | None = None, verbose: bool = False):
        import mlx_vlm
        from mlx_vlm import load
        from mlx_vlm.utils import get_model_path, load_config

        self.arm = arm
        self.spec = config.arm_config(arm)
        if not self.spec.get("available", False):
            raise RuntimeError(
                f"arm {arm!r} is registered but not runnable: {self.spec.get('blocked_reason')}")
        self.repo = self.spec["hf_repo"]
        self.revision = self.spec["hf_revision"]
        self.manifest = manifest if manifest is not None else load_arm_manifest(arm)
        self.model_path = Path(get_model_path(self.repo, revision=self.revision))
        assert self.manifest["snapshot_path"] == str(self.model_path), (
            f"manifest snapshot {self.manifest['snapshot_path']} != resolved {self.model_path}")
        started = time.time()
        self.model, self.processor = load(str(self.model_path))
        self.config = load_config(str(self.model_path), trust_remote_code=True)
        self.load_seconds = time.time() - started
        self.runtime_version = mlx_vlm.__version__
        self.verbose = verbose
        self._grammar: GrammarStatus | None = None

    # -- constrained decoding ------------------------------------------------

    def _logits_processor(self, variant: PromptVariant):
        """A fresh llguidance-backed processor per call. The matcher is stateful, so reusing
        one across images would carry the previous answer's parse state into the next."""
        from mlx_vlm.structured import build_json_schema_logits_processor
        tokenizer = getattr(self.processor, "tokenizer", self.processor)
        return build_json_schema_logits_processor(tokenizer, variant.json_schema)

    def grammar_status(self, variant: PromptVariant | None = None) -> GrammarStatus:
        """Can this arm bind the JSON-schema grammar at all? Cached per process."""
        if self._grammar is None:
            probe = variant or default_variants()[0]
            try:
                self._logits_processor(probe)
                self._grammar = GrammarStatus(True, "llguidance json-schema mask built")
            except Exception as error:
                self._grammar = GrammarStatus(
                    False, f"{type(error).__name__}: {str(error)[:300]}")
        return self._grammar

    # -- prompt assembly -----------------------------------------------------

    def _messages(self, variant: PromptVariant, repair: bool) -> list[dict[str, str]]:
        user = variant.prompt
        if repair:
            user = user + config.REPAIR_SUFFIX.format(
                keys=json.dumps(sorted(variant.field_map), separators=(",", " ")))
        return [{"role": "system", "content": variant.system},
                {"role": "user", "content": user}]

    def _format(self, variant: PromptVariant, repair: bool) -> str:
        """Apply the model's own chat template.

        Some families' templates reject a `system` turn. Rather than assume, try it and fall
        back to folding the system text into the user turn — recorded on the instance so the
        row can say which shape produced the answer.
        """
        from mlx_vlm.prompt_utils import apply_chat_template
        messages = self._messages(variant, repair)
        try:
            formatted = apply_chat_template(self.processor, self.config, messages, num_images=1)
            self.system_turn = "separate"
            return formatted
        except Exception:
            merged = [{"role": "user",
                       "content": messages[0]["content"] + "\n\n" + messages[1]["content"]}]
            formatted = apply_chat_template(self.processor, self.config, merged, num_images=1)
            self.system_turn = "folded-into-user"
            return formatted

    system_turn = "separate"

    # -- one inference -------------------------------------------------------

    def _generate_once(self, image, variant: PromptVariant, constrained: bool, repair: bool):
        from mlx_vlm import generate
        formatted = self._format(variant, repair)
        kwargs: dict[str, Any] = dict(max_tokens=MAX_TOKENS, temperature=TEMPERATURE, verbose=False)
        if constrained:
            kwargs["logits_processors"] = [self._logits_processor(variant)]
        return generate(self.model, self.processor, formatted, image=[image], **kwargs)

    def ask(self, image, variant: PromptVariant, max_attempts: int = MAX_ATTEMPTS,
            constrained: bool = True, on_attempt=None) -> Answer:
        """Ask one question set about one already-normalized image.

        §9.3: constrained decoding first; validate-against-schema-and-retry underneath it,
        with a cap and a parse_failed marker so failures are counted, never dropped.

        When the grammar IS bound, a retry is an infrastructure retry: greedy decoding
        reproduces the same tokens, so a repeated parse failure is a fact about the run, not
        bad luck. When the grammar is NOT bound, attempts 2+ append config.REPAIR_SUFFIX, so
        the next attempt is a different computation and the fallback can actually rescue a
        run — this is the only behavioural difference from the premise oracle.
        """
        last_error: Exception | None = None
        raw_text = ""
        parse_failed = False
        started = time.time()
        result = None
        for attempt in range(1, max_attempts + 1):
            if on_attempt is not None:
                on_attempt(attempt)
            repair = (not constrained) and attempt > 1
            try:
                result = self._generate_once(image, variant, constrained, repair)
                raw_text = result.text
                parsed = validate_and_canonicalize(parse_model_text(raw_text), variant)
                return Answer(
                    # parse_failed stays False on an eventual success, exactly as premise's
                    # oracle records it, so the two files' health columns mean the same
                    # thing. A recovered failure is still visible: attempts > 1.
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
                if is_gpu_fault(error):
                    # Not this image's fault and not survivable here — see GpuFault.
                    raise GpuFault(
                        f"{type(error).__name__} on attempt {attempt}: {str(error)[:300]}"
                    ) from error
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


# ---------------------------------------------------------------- provenance row

def provenance(run_id: str, arm: str, item_set: str, variant: PromptVariant, oracle: ArmOracle,
               item: EvalItem, source_long_edge: int, processed_long_edge: int,
               constrained: bool) -> dict[str, Any]:
    """The §5.2 table plus what §7.5 and §9.1 require, plus the arm.

    Column-for-column identical to premise's provenance() so the premise run file can be read
    as the incumbent arm's results without translation; `arm` and `item_set` are additions,
    and score.py fills them in for the premise rows from the registry.
    """
    return {
        # §5.2
        "run_id": run_id,
        "arm": arm,
        "item_set": item_set,
        "model_id": oracle.repo,
        "model_revision": oracle.revision,
        "quantization": oracle.spec["quantization"],
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
        # extra pins
        "schema_hash": variant.schema_hash,
        "prompt_file_sha256": variant.file_hash,
        "weights_manifest_sha256": oracle.manifest["weights_manifest_sha256"],
        "mlx_version": premise_common._pkg_version("mlx"),
        "python_version": platform.python_version(),
        "constrained_decoding": constrained,
        "system_turn": oracle.system_turn,
        "temperature": TEMPERATURE,
        "repo_head": premise_common.GIT_HEAD,
    }


def new_run_id() -> str:
    return premise_common.new_run_id()

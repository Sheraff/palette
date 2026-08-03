"""Pinned arm registry for the v3 oracle VLM bake-off.

Spec: research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §2.3 (model and quantization),
§3 (two prompt variants, greedy decoding), §5.2 (provenance), §9.3 (constrained decoding).
Pattern: research/v3/oracle/embeddings/config.py ARMS — one dict per arm, every field either
read off the model config or computed from the bytes on disk, each with a provenance tag.

CONVENTIONS.md: every constant is named and carries a provenance tag plus one line saying
where the value comes from. Python is used here only because the model runtime requires it.

WHAT THE BAKE-OFF IS FOR. The premise run answered "does one VLM's reading of ground
structure track the human-accepted gradient flag?" with one model. The reviewer then labelled
30 contested artworks by hand (data/oracle-validation/premise-disambiguation-1-analysis.json)
and that slice turned out to be intrinsically ambiguous — a lean, not a verdict. The bake-off's
job is therefore the FULL eval set, especially its tractable part: which model reads ground
structure the way the reviewer does, on the images where there is something to be right about.
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------- paths

# [MEASURED] This file lives at research/v3/oracle/bakeoff/config.py, so the repository root
# is four directories up. Checked against the real tree 2026-08-03.
BAKEOFF_DIR = Path(__file__).resolve().parent
REPO_ROOT = BAKEOFF_DIR.parents[3]

# [INHERITED] Owned output directory (CONVENTIONS.md path ownership: this workstream owns
# research/v3/oracle/bakeoff/ and research/v3/data/oracle-bakeoff/).
DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "oracle-bakeoff"

# [INHERITED] Read-only inputs from neighbouring workstreams. Nothing here is written.
PREMISE_DIR = REPO_ROOT / "research" / "v3" / "oracle" / "premise"
PREMISE_DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "oracle-premise"
VALIDATION_DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "oracle-validation"

EVAL_SET_PATH = PREMISE_DATA_DIR / "eval-set.json"
PREMISE_CANARY_PATH = PREMISE_DATA_DIR / "canary.json"
PREMISE_MODEL_MANIFEST_PATH = PREMISE_DATA_DIR / "model-manifest.json"
PREMISE_RUN_PATH = PREMISE_DATA_DIR / "premise-run-1.jsonl"
GOLD30_ANALYSIS_PATH = VALIDATION_DATA_DIR / "premise-disambiguation-1-analysis.json"

# [REVIEWED] The prompts are NOT copied into this workstream. The bake-off compares models,
# so every arm must see the byte-identical prompt the premise run used; a copy could drift.
# Each output row carries prompt_file_sha256, so a drift would be visible after the fact.
PROMPTS_DIR = PREMISE_DIR / "prompts"

SCORES_JSON_PATH = DATA_DIR / "scores.json"
SCORES_TABLE_PATH = DATA_DIR / "scores.txt"

# ---------------------------------------------------------------- item sets

# [REVIEWED] The two populations named in the task brief.
#   gold30  — the 30 artworks the reviewer labelled by hand in the disambiguation round.
#             Every one of them is an artwork where the premise oracle and the accepted flag
#             CONTRADICTED each other, so the slice is adversarial by construction and the
#             analysis file itself calls the result "a lean, not a verdict". Scored because
#             it is the only elicited human label that exists, never as the headline.
#   eval142 — every included entry of the premise eval set. This is the bake-off's real
#             question: agreement with the accepted gradient flag across the whole set.
ITEMS_GOLD30 = "gold30"
ITEMS_EVAL142 = "eval142"
ITEM_SETS = (ITEMS_GOLD30, ITEMS_EVAL142)

# [MEASURED] Counted from the two source files on 2026-08-03: the analysis holds 30 artworks,
# all 30 of which are among the eval set's 142 included entries (144 total, 2 excluded).
GOLD30_EXPECTED_COUNT = 30
EVAL142_EXPECTED_COUNT = 142

# ---------------------------------------------------------------- arms

# [REVIEWED] Arm identifiers. These become filenames (<arm>.jsonl) and JSON keys, so they are
# short, lowercase and filesystem-safe.
ARM_QWEN3_30B_A3B = "qwen3-30b-a3b"
ARM_QWEN3_32B_DENSE = "qwen3-32b-dense"
ARM_INTERNVL35 = "internvl35"
ARM_GEMMA3_27B = "gemma3-27b"

# [MEASURED] Probed on 2026-08-03 against the Hugging Face hub and against the installed
# mlx-vlm. NO CLEAN MLX BUILD OF InternVL3.5 EXISTS FOR THIS RUNTIME:
#   - the only MLX conversions published are mlx-community/InternVL3_5-1B-4bit,
#     mlx-community/InternVL3_5-30B-A3B-4bit,
#     mlx-community/InternVL3_5-GPT-OSS-20B-A4B-Preview-4bit and the community
#     Dadm-n/InternVL3_5-2B-mlx. Nothing at 8B/14B/38B dense.
#   - every one of those declares config.model_type == "internvl" (the transformers
#     InternVLForConditionalGeneration layout). mlx-vlm 0.6.8 — the newest release on PyPI —
#     ships models/internvl_chat/ only, has no "internvl" entry in MODEL_REMAPPING, and
#     `import mlx_vlm.models.internvl` raises ModuleNotFoundError. The load path in
#     mlx_vlm/utils.py:531 resolves model_type to a module name, so these repos cannot load.
#   - even with a remap, internvl_chat's language.py is a dense Qwen3-style decoder with no
#     expert routing, while both viable 3.5 checkpoints are MoE (qwen3_moe / gpt_oss).
# So the third arm falls back to Gemma 3 27B vision, as the task brief directs.
INTERNVL35_BLOCK_REASON = (
    "mlx-vlm 0.6.8 (latest on PyPI) has no `internvl` model module; every published "
    "InternVL3.5 MLX conversion declares model_type=`internvl`, and mlx-vlm's only InternVL "
    "implementation (`internvl_chat`) is dense-only while the two size-appropriate 3.5 "
    "checkpoints are MoE. Probed 2026-08-03."
)
INTERNVL35_BEST_CANDIDATE = "mlx-community/InternVL3_5-30B-A3B-4bit"

# [REVIEWED] A weights_manifest of None means "registered but its bytes have never been
# hashed here". pin_arms.py fills it in; the runner refuses to start such an arm.
UNPINNED = None

# [MEASURED] Every field below was read off the hub's model_info / config.json on 2026-08-03,
# and every byte count is the sum of the repo's file sizes at that exact revision.
ARMS: dict[str, dict] = {
    ARM_QWEN3_30B_A3B: {
        # [REVIEWED] The incumbent. Pipeline §2.3's bulk model and the model the premise run
        # already used end to end, so its eval142 results EXIST ALREADY and need no GPU time.
        "role": "incumbent (premise run)",
        "loader": "mlx_vlm",
        "hf_repo": "mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit",
        # [INHERITED] Identical to premise/common.py MODEL_REVISION. An HF commit, not a tag.
        "hf_revision": "f31102655767c89366f63d3eab2a5e2a8fd6d293",
        "quantization": "6bit",
        "architecture": "qwen3_vl_moe",
        "params": "30B total / 3B active (MoE)",
        # [MEASURED] Hub file-size sum at that revision: 25.90 GB. Already in the shared HF
        # cache from the premise run — this arm downloads and hashes nothing.
        "approx_bytes": 25_903_000_000,
        # [REVIEWED] Task brief: reference the premise venv/model, do not duplicate 26 GB.
        # The manifest (and therefore weights_manifest_sha256) is INHERITED from the premise
        # workstream rather than recomputed. pin_arms.py copies the value, never the weights.
        "manifest_inherited_from": str(PREMISE_MODEL_MANIFEST_PATH),
        # [REVIEWED] The premise run is this arm's eval142 result file, verbatim. Its rows
        # carry the same model_revision, prompt hashes, schema and resolution cap the
        # bake-off uses, so re-running it would only burn an hour to reproduce bytes we hold.
        # gold30 is a subset of eval142, so both item sets score from this one file.
        "results_override": str(PREMISE_RUN_PATH),
        "available": True,
    },
    ARM_QWEN3_32B_DENSE: {
        # [REVIEWED] The dense challenger, and the pipeline's planned ADJUDICATOR (§3 routes
        # the variant-disagreement subset to a dense model). Testing it here means the
        # adjudicator is measured on the same items as the bulk model before it is trusted.
        "role": "dense challenger; also the pipeline's planned adjudicator",
        "loader": "mlx_vlm",
        "hf_repo": "mlx-community/Qwen3-VL-32B-Instruct-8bit",
        # [MEASURED] refs/main commit read from the hub 2026-08-03.
        "hf_revision": "14fd4c76af6bd02d1f3dbe5ea7b03da5a1ae25cf",
        # [REVIEWED] 8-bit as the task brief specifies. A dense 32B at 8 bits is ~36 GB —
        # comfortable on 96 GB unified memory with nothing else resident, and it removes
        # quantization as an excuse if the dense arm loses to the 6-bit MoE incumbent.
        "quantization": "8bit",
        "architecture": "qwen3_vl",
        "params": "32B dense",
        # [MEASURED] Hub file-size sum at that revision.
        "approx_bytes": 36_020_000_000,
        "manifest_inherited_from": None,
        "results_override": None,
        "available": True,
    },
    ARM_INTERNVL35: {
        # [MEASURED] Registered but NOT RUNNABLE — see INTERNVL35_BLOCK_REASON. Kept in the
        # registry, in the pattern embeddings/config.py used for the gated DINOv3 arm, so the
        # decision is recorded rather than remembered.
        "role": "requested third arm — BLOCKED, unsupported by the runtime",
        "loader": "mlx_vlm",
        "hf_repo": INTERNVL35_BEST_CANDIDATE,
        # [MEASURED] refs/main commit read from the hub 2026-08-03. Pinned even though the
        # arm cannot run, so a later runtime upgrade starts from a known revision.
        "hf_revision": "ed2ce3381528db1c5b70a2aad78a6390997e9250",
        "quantization": "4bit",
        "architecture": "internvl (unsupported by mlx-vlm 0.6.8)",
        "params": "30B total / 3B active (MoE)",
        # [MEASURED] Hub file-size sum at that revision. Never downloaded.
        "approx_bytes": 17_810_000_000,
        "manifest_inherited_from": None,
        "results_override": None,
        "available": False,
        "blocked_reason": INTERNVL35_BLOCK_REASON,
    },
    ARM_GEMMA3_27B: {
        # [REVIEWED] The task brief's named fallback for the InternVL3.5 slot. A different
        # model family entirely (Gemma 3 + SigLIP vision tower), which is the point: two Qwen
        # arms alone cannot tell a family-wide reading habit from a correct one.
        "role": "third arm — fallback for the blocked InternVL3.5 slot",
        "loader": "mlx_vlm",
        "hf_repo": "mlx-community/gemma-3-27b-it-8bit",
        # [MEASURED] refs/main commit read from the hub 2026-08-03.
        "hf_revision": "524cdc4f56a58ef94949ba65dc63a29c48362b1a",
        # [REVIEWED] 8-bit, matching the dense Qwen arm, so the two challengers differ by
        # family and not by bit width.
        "quantization": "8bit",
        "architecture": "gemma3",
        "params": "27B dense",
        # [MEASURED] Hub file-size sum at that revision.
        "approx_bytes": 31_080_000_000,
        "manifest_inherited_from": None,
        "results_override": None,
        "available": True,
    },
}

# [REVIEWED] The arms the bake-off scores by default: everything registered as available.
# This is an ORDERING hint; score.py derives what actually gets scored from files on disk.
BAKEOFF_ARMS = (ARM_QWEN3_30B_A3B, ARM_QWEN3_32B_DENSE, ARM_GEMMA3_27B)

# ---------------------------------------------------------------- decoding

# [INHERITED] All four decoding constants are premise/common.py's, imported rather than
# restated in common.py. They are named here only so this file reads as the whole contract:
#   TEMPERATURE = 0.0, MAX_TOKENS = 256, MAX_ATTEMPTS = 3, RESOLUTION_CAP_PX = 640.
# A bake-off that changed any of them would not be comparable to the premise run.

# [REVIEWED] Task brief: same canary hygiene as premise. Re-run every 20 items.
CANARY_EVERY = 20

# [REVIEWED] The canary IMAGE is pinned to the premise run's choice (data/oracle-premise/
# canary.json) instead of being re-derived per item set. Same image for every arm means a
# canary answer is comparable across arms; re-deriving it per item set would not be.
CANARY_SOURCE = str(PREMISE_CANARY_PATH)

# [UNCALIBRATED] Appended to the user prompt on attempt 2+ when constrained decoding is OFF.
# Without it the §9.3 validate-and-retry fallback is a no-op under greedy decoding: the input
# is unchanged, so the model reproduces the bad answer byte for byte (premise/README.md
# measured exactly this). Changing the input is what makes a retry a retry. Never used while
# the grammar is on, and every row records which path produced it.
REPAIR_SUFFIX = (
    "\n\nYour previous reply was not accepted. Reply with ONE JSON object and nothing else: "
    "no code fence, no prose, no numbering in the keys. The keys must be exactly "
    "{keys}, and every value except `note` must be one of the words offered above."
)

# [REVIEWED] Per-arm verification artifact written by verify_load.py and read by the runner.
# Holds the one-forward-pass proof that the arm loads, plus whether the llguidance grammar
# actually bound for that model family. Grammar support is per-tokenizer, so it is measured
# per arm and never assumed.
VERIFICATION_FILENAME_TEMPLATE = "arm-verification.{arm}.json"
MANIFEST_FILENAME_TEMPLATE = "model-manifest.{arm}.json"


def arm_config(arm: str) -> dict:
    if arm not in ARMS:
        raise KeyError(f"unknown arm {arm!r}; known arms: {sorted(ARMS)}")
    return ARMS[arm]


def manifest_path(arm: str) -> Path:
    return DATA_DIR / MANIFEST_FILENAME_TEMPLATE.format(arm=arm)


def verification_path(arm: str) -> Path:
    return DATA_DIR / VERIFICATION_FILENAME_TEMPLATE.format(arm=arm)


def results_path(arm: str, items: str = "") -> Path:
    """Where an arm's answers live — ONE file per arm, both item sets.

    The item set selects the work queue, not the file. gold30 is a subset of eval142 and the
    resume key does not mention the item set, so running gold30 first (a cheap smoke test of
    the whole path) and eval142 afterwards costs those 60 inferences exactly once: the second
    run reads them back as done. Each row still records its `item_set` for provenance.

    An arm with a results_override (the incumbent) reads from that file instead.
    """
    override = ARMS[arm].get("results_override")
    if override:
        return Path(override)
    return DATA_DIR / f"{arm}.jsonl"

"""Pins and constants for the SAM geometry stage (oracle pipeline §2.2, §8.3, §9.2).

Every constant here carries a provenance tag per CONVENTIONS.md. Nothing in this
module imports a model; it is safe to import from a test or a report script.
"""

from pathlib import Path

# --------------------------------------------------------------------------- paths

SAM_DIR = Path(__file__).resolve().parent
REPO_ROOT = SAM_DIR.parents[3]
DATA_DIR = REPO_ROOT / "research" / "v3" / "data" / "sam"
MODEL_MANIFEST_PATH = DATA_DIR / "model-manifest.json"
EVAL_SET_PATH = REPO_ROOT / "research" / "v3" / "data" / "oracle-premise" / "eval-set.json"

COLLECTION_SHARDED = "sharded"
COLLECTION_MUSIC_ARTWORKS = "music_artworks"

# The 21 hex shard directories at the repo root, from the corpus survey (§7).
# [MEASURED] `find 00 .. 14 -type f | wc -l` = 7,550 files, 2026-08-03.
SHARDED_DIR_NAMES = tuple(f"{i:02x}" for i in range(0x15))
MUSIC_ARTWORKS_DIR_NAME = "music-artworks"

# --------------------------------------------------------------------------- model

# [REVIEWED] Pipeline §2.2 forbids facebookresearch/sam3 (CUDA/Triton-only) and names
# SAM 3.1. This repo is the MLX bf16 conversion of facebook/sam3.1 and is the route that
# actually loads and runs here — verified by running, not by README (see WEIGHT_LOAD_NOTE).
MODEL_REPO = "mlx-community/sam3.1-bf16"

# [MEASURED] HF commit hash resolved 2026-08-03 (§5.2: the commit, never the tag).
MODEL_REVISION = "a992e302ea9b0f03f41dfd93414a4fd0e818f65b"

# [MEASURED] sha256 of the single weights file in that snapshot, 2026-08-03.
MODEL_WEIGHTS_FILE = "model.safetensors"
MODEL_WEIGHTS_SHA256 = "a1b1c19dcc9bdd68438bcd74433fadc90740e73c37a1f386872672d134879c42"
MODEL_WEIGHTS_BYTES = 3_493_016_552
MODEL_CONFIG_SHA256 = "898d892490cdbaefc9a7a6ba2ae5ce5b7f93915a2aa8d6d0d5601417ca0b4b03"

# [MEASURED] The repo stores bf16, unquantized.
MODEL_QUANTIZATION = "bf16"

# [MEASURED] mlx-vlm 0.6.8 / mlx 0.32.0, the only versions on PyPI that carry
# mlx_vlm.models.sam3_1 at the time of writing.
RUNTIME_PACKAGE = "mlx-vlm"
RUNTIME_VERSION_PIN = "0.6.8"

# [MEASURED] mlx_vlm.utils.load_model() cannot load this repo: it calls the model's
# sanitize(), which transposes Conv2d weights from PyTorch (O,H,W,C-from-NCHW) layout —
# but mlx-community already stores MLX layout, so the transpose is applied twice and
# load fails on detector_model.vision_encoder.backbone.embeddings.patch_embeddings.weight
# ("expected (1024,14,14,3), received (1024,14,3,14)"). Building the Model from its
# ModelConfig and calling load_weights(..., strict=True) on the raw safetensors matches
# all 1,961 parameters with zero missing and zero shape mismatches. That is the route
# common.load_sam() takes. Do not "fix" it back to load_model().
WEIGHT_LOAD_NOTE = "manual: Model(ModelConfig) + load_weights(strict=True), sanitize() bypassed"

# --------------------------------------------------------------------------- prompts

# [REVIEWED] Pipeline §8.3: SAM 3's documented weakness is low recall — it often misses
# the target entirely. The mitigation is to run several phrasings of the same idea as
# separate passes and union the masks, which is cheap locally. This is the set §8.3 names.
# Order is fixed because it is part of the run identity (CONCEPT_SET_HASH).
CONCEPT_PROMPTS: tuple[tuple[str, str], ...] = (
    # [MEASURED, n=10] Orchestrator decision 2026-08-03 (reviewer veto stands): the
    # §8.3 phrasings "text"/"typography" fire on 0/10 with this model and are replaced
    # by the probe's measured winners. Original §8.3 set preserved in the block below;
    # full probe data in research/v3/data/sam/probe-1.jsonl.
    ("words", "words"),
    ("letter", "letter"),
    ("lettering", "lettering"),
    ("album-title", "album title"),
    ("logo", "logo"),
    ("sticker", "sticker"),
    ("person", "person"),
    ("face", "face"),
)

# [MEASURED, n=10, HELD] probe_prompts.py over the smoke set, 2026-08-03. Of the five
# text-side phrasings §8.3 names, three fire on ZERO of 10 images with this model:
# "text" 0/10, "typography" 0/10, and the variants "a text"/"written text"/"text overlay"
# 0/10 each; "lettering" 2/10, "logo" 3/10, "sticker" 1/10. Phrasings §8.3 does not name
# do far better: "words" 7/10, "letter" 7/10, "word" 6/10, "letters" 6/10,
# "album title" 5/10, "title" 4/10, "caption" 4/10 — and the masks are pixel-accurate on
# the glyphs. On this evidence the set above was REPLACED with the measured winners by
# orchestrator decision 2026-08-03 (`d-2026-08-03-sam-prompt-set-replacement` in
# research/v3/data/decisions/decisions.json); the §8.3 phrasings it drops are named in this
# block, which is now the only record of the original set. The REVIEWER'S VETO STANDS over
# that replacement — changing the question set is the reviewer's call, not an agent's, and
# no reviewer has yet seen a mask from the new set. Ratifying or reversing it is one edit
# either way (loose end A5). See research/v3/data/sam/probe-1.jsonl.

# [REVIEWED] §8.3's subtractive use needs to know which concepts are "the same idea"
# so the union fractions mean something. Every concept appears in exactly one group.
# The membership tracks CONCEPT_PROMPTS: "text_like" was updated on 2026-08-03 alongside the
# prompt-set replacement above — it listed "text" and "typography", which can no longer
# appear in any row, so the group union was being computed over concepts that never fire.
# selftest.py asserts the two stay in step ("every concept is in exactly one group").
CONCEPT_GROUPS: dict[str, tuple[str, ...]] = {
    "text_like": ("words", "letter", "lettering", "album-title", "logo", "sticker"),
    "person_like": ("person", "face"),
}

# --------------------------------------------------------------------------- thresholds

# [REVIEWED] Calibrated 2026-08-03 by the reviewer's mask-quality round (60 masks,
# sam-mask-quality-1, analysis in data/sam/mask-quality-analysis.json): the cut that best
# separates the reviewer's yes from no is 0.578 (precision 91%, recall 69%, J 0.514; the
# population-weighted alternative is 0.644, J 0.373 — the unweighted optimum is partly an
# artefact of even-quota sampling, both recorded). All 3 hallucination-signature masks fall
# below it, so no area-fraction guard is needed. STORED ROWS keep using the low run-time
# threshold below so raising the cut stays a query, never a re-run; consumers should filter
# at CALIBRATED_SCORE_THRESHOLD.
CALIBRATED_SCORE_THRESHOLD = 0.578

# [UNCALIBRATED] Score below which a detection is dropped. mlx-vlm's own README example
# uses 0.3; the class default is 0.5. Kept low deliberately: §8.3 says recall is the
# problem, and every row carries its score, so a stricter cut can be applied in SQL
# later. Raising this later is free; lowering it means re-running.
SCORE_THRESHOLD = 0.3

# [INHERITED] mlx_vlm.models.sam3.generate.nms default, applied per concept (never
# across concepts — the row key is (image, concept, instance)).
NMS_IOU_THRESHOLD = 0.5

# [REVIEWED] §7.5 rejected capping for speed. 0 means "hand the model the decoded image
# at its native size"; SAM's own processor resizes to its fixed input internally and the
# returned masks are at the native size either way.
RESOLUTION_CAP_PX = 0

# [INHERITED] §5.1: after this many attempts an image gets a status='failed' row and the
# queue moves on, so a deterministically-crashing image cannot spin the supervisor.
MAX_ATTEMPTS = 3

# [INHERITED] §5.3: re-run one typical image every N images inside the same process and
# halt on any difference. SAM inference here is deterministic (no sampling), so any
# divergence is a real fault.
CANARY_EVERY = 100

# [INHERITED] §5.1: continuous restarting means something systemic. supervise.sh stops here.
MAX_RESTARTS = 20

# --------------------------------------------------------------------------- schema

# Bump when the row shape changes. Part of the resume key, so a bump re-runs everything.
SCHEMA_VERSION = "sam-regions.v1"

RECORD_TYPE_REGION = "region"
RECORD_TYPE_IMAGE = "image"

# [REVIEWED] §9.2 stores mask_rle as TEXT. This is COCO's compressed RLE: column-major
# (Fortran) run lengths over the binary mask, delta-coded from the third run, then packed
# 5 bits per character with a continuation bit — byte-identical to pycocotools'
# rleToString. selftest.py round-trips it.
MASK_RLE_FORMAT = "coco_compressed_rle"

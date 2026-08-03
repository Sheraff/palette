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
    #
    # [REVIEWED, n=15] CONCEPT SET v2 — ratified by the reviewer 2026-08-03 ("new SAM
    # wording sounds good") after probe 2, the vocabulary-alignment probe the reviewer
    # asked for at the end of mask-quality round 1. Evidence and the full candidate
    # table: research/v3/data/sam/VOCAB_PROBE_NOTES.md; rows in
    # research/v3/data/sam/probe-2-vocabulary.jsonl. Three changes, and nothing else:
    #
    #   1. ADD ("parental-advisory", "parental advisory"). Fires on 5/5 confirmed
    #      parental-advisory covers at 0.81-0.92, on 0/10 non-PA images and 0/2
    #      negatives; every mask is tight on the badge. Under the old set these marks
    #      arrived as "sticker" (reviewer note 2) — at the calibrated cut "sticker"
    #      keeps 0 of the 5, so the category was effectively invisible.
    #   2. RENAME the tag "album-title" -> "display-text". The PROMPT STRING IS
    #      UNCHANGED: every alternative main-text phrasing ("title text", "main text",
    #      "large text", "wordmark") fires on 0/15, so "album title" is the only
    #      phrasing that works — but it masks the artist name as readily as the title
    #      (reviewer note 5; on `toxicity` the stronger 0.688 mask is the artist and the
    #      0.357 one is the title). The mask says "this is main display text"; which
    #      role that text plays is the VLM's question, not SAM's.
    #   3. RENAME the tag "logo" -> "emblem". The PROMPT STRING IS UNCHANGED: "emblem"
    #      as a prompt is 2/15 against "logo"'s 12/15 and finds nothing "logo" misses.
    #      The rename is reviewer note 1 — the stored word must not claim provenance
    #      (in-artwork branding vs applied mark) that a mask cannot know.
    #
    # "sticker" is kept as-is: once change 1 takes the PA marks, it is no longer being
    # asked to cover a category the reviewer does not recognise. "explicit content",
    # "brand mark", "wordmark", "title text", "main text" and "large text" were all
    # rejected at 0/15; "parental advisory sticker" / "advisory sticker" /
    # "parental advisory label" were rejected for firing on non-PA stickers and crests
    # (up to 0.96 on a literal promo sticker) — higher scores, wrong category.
    #
    # COST: a tag rename changes concept_set_hash(), which is part of row_key, so
    # sam-eval-142 MUST BE RE-RUN IN FULL under this set (~391 s / 6.5 min at the last
    # measured rate) before any round or analysis reads it. The v1 rows in
    # sam-eval-142.jsonl remain valid evidence for concept set v1 and nothing else.
    ("words", "words"),
    ("letter", "letter"),
    ("lettering", "lettering"),
    ("display-text", "album title"),
    ("emblem", "logo"),
    ("sticker", "sticker"),
    ("parental-advisory", "parental advisory"),
    ("person", "person"),
    ("face", "face"),
    # [REVIEWED, n=16] CONCEPT SET v2.1 — one ADD, reviewer-approved 2026-08-03 ("SAM
    # static adds => yes, go"). Evidence: probe 4 (data/sam/PROBE4_NOTES.md), "barcode"
    # precision 1.00 with zero false positives on 14 no-barcode covers; 0.94 on the
    # EAN-carrying promo sticker, clearing the calibrated cut with room. Recall 0.50
    # (n=2): it missed the parcel's shipping-label barcode block. The CJK words from the
    # same probe are NOT added: "chinese characters" recalls 4/4 with perfect precision
    # but its best score anywhere is 0.472 — every recovery dies at the 0.578 calibrated
    # cut. A category-aware threshold plus a CJK mask-quality round must come first
    # (loose end A12). COST: this ADD changes concept_set_hash(), so any stored run under
    # v2 must be re-run before an analysis reads it alongside barcode rows.
    ("barcode", "barcode"),
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
#
# [MEASURED, n=15] Re-partitioned 2026-08-03 with concept set v2. Three groups now, and the
# line between them is drawn by MEASURED CO-FIRING, not by intuition about the words:
#
#   * A group's only job is the union. run_sam.py writes one <group>_union_area_fraction per
#     image, and the union exists so that several words landing on the SAME pixels count once.
#     Membership should therefore follow which concepts demonstrably mask the same regions.
#   * probe 2 measured exactly that. On all 5 confirmed parental-advisory covers, "logo"
#     (stored as `emblem`) masks the PA badge itself at 0.556-0.805, and "sticker" masks it on
#     2 of the 5. The bbox-IoU novelty analysis found every PA region was already covered by
#     an incumbent — and the incumbents covering it are logo and sticker, never the glyph
#     words. The glyph concepts' hits on those same covers are on the title/artist lettering.
#     So `emblem`, `sticker` and `parental-advisory` are one idea by measurement; `words`,
#     `letter`, `lettering` and `display-text` are another.
#   * Consequence of NOT doing this: `parental-advisory` alone in its own group would leave
#     the very same badge counted a second time inside text_like via emblem and sticker —
#     the double count the union is there to prevent.
#   * Consequence of folding `parental-advisory` into text_like instead: that group's fraction
#     is read as "how much of this cover is display typography", a property of the artwork's
#     design. A distributor-applied badge of near-constant size in a corner is not that, and
#     letting it move the number would make the number mean less, not more.
#
# NAMING: not "overlay_like". "Overlay" asserts that the thing was added on top — provenance,
# which reviewer note 1 says a mask cannot know and which is the whole reason `logo` became
# `emblem` above. It is true of a PA mark and unknown for an emblem or a sticker. "mark_like"
# names the shape (a self-contained graphic mark) and claims nothing about where it came from.
# Provenance-exclusion consumers that want the PA area alone still have it: per-concept counts
# live in `instances_by_concept` and every region is its own row. The group governs the union
# fraction and nothing else.
#
# COST: `emblem` and `sticker` leave text_like, so text_like_union_area_fraction is not
# comparable across concept sets v1 and v2. Nothing is lost that the v2 re-run does not
# already invalidate. Round 1's strata (text_like / person_like) are frozen inside
# data/sam/mask-quality-sample.json and are untouched by this; that round's calibration found
# no separation between groups anyway, so no calibrated number rests on the old partition.
CONCEPT_GROUPS: dict[str, tuple[str, ...]] = {
    "text_like": ("words", "letter", "lettering", "display-text"),
    # barcode joined mark_like with concept set v2.1: probe 4's one barcode hit is the strip
    # INSIDE the promo sticker that "sticker" masks at 0.93 (vocab-probe-15) — same pixels,
    # same idea by the co-firing rule that drew these lines.
    "mark_like": ("emblem", "sticker", "parental-advisory", "barcode"),
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

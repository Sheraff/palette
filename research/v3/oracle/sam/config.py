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
    # (n=2): it missed the parcel's shipping-label barcode block. COST: this ADD changes
    # concept_set_hash(), so any stored run under v2 must be re-run before an analysis
    # reads it alongside barcode rows.
    ("barcode", "barcode"),
    # [REVIEWED, n=21] CONCEPT SET v2.2 — the CJK ADD, 2026-08-04. Both preconditions the
    # v2.1 note set are now met: the category-aware threshold machinery exists
    # (CALIBRATED_GROUP_THRESHOLDS below) and the CJK mask-quality round has been run and
    # reviewed (round 3b, data/sam/mask-quality-3b-analysis.json). The round was decided by
    # a rule pre-registered BEFORE the reviewer saw a mask — data/sam/mask-quality-3b-sample.json
    # -> `a12DecisionRule`, which fixed the decision unit (the two words as ONE group), the
    # treatment (`partly` excluded from both sides), the sweep, the gates, and both exits:
    # adopt with a category cut, or close A12 as a category whose evidence never survived
    # being looked at. The rule's ADOPT arm fired. 21 decided answers on the cjk_script
    # group: 20 correct, 1 not — a 95.2% accept rate on masks no human had ever seen. The
    # pooled cut keeps 3 of the 20 correct masks and the text_like cut keeps 0, so the cut
    # IS category-dependent for this category; the group threshold below is what makes the
    # add worth anything.
    #
    # WHAT PROBE 4 CONTRIBUTED, and what it did not. Probe 4 (data/sam/PROBE4_NOTES.md) is
    # the recall finding: "chinese characters" fires on 4/4 CJK covers, and round 3b is the
    # first time a human confirmed those masks are on the glyphs — 20 of 21. Probe 4 also
    # measured the words SILENT on Korean, Thai and Malayalam, which is why this is a SCRIPT
    # concept and not a not-Latin one. But its zero-false-positive half is still SCORES ONLY:
    # no off-target mask has ever been put in front of a reviewer.
    #
    # The tag says what the mask CLAIMS, not what the prompt asks: "chinese characters"
    # fires on Japanese covers as readily as Chinese ones, so the stored tag is `cjk-script`.
    #
    # COST: this ADD changes concept_set_hash(), so sam-eval-142 MUST BE RE-RUN IN FULL
    # (~6.5 min GPU) before any analysis reads CJK rows alongside the existing ones. Runs
    # stored under v2.1 and earlier stay VALID EVIDENCE FOR THEIR OWN HASH and stay
    # reproducible; what is forbidden is a single analysis that reads rows from two hashes
    # at once. row_key carries the hash, so the mixing is detectable, not silent.
    ("cjk-script", "chinese characters"),
    ("kanji", "kanji"),
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
    # cjk_script joined with concept set v2.2 as its OWN group, and is deliberately NOT part
    # of text_like. The co-firing rule that drew every other line here puts it apart: `words`
    # emits no region at all on 3 of the 5 covers where these two fire (round 3b's incumbent
    # check, data/sam/mask-quality-3b-analysis.json -> incumbentCheck). They are not masking
    # the same pixels, because on those covers the incumbent masks nothing. Folding it into
    # text_like would also drag it under text_like's 0.697295 cut, which keeps 0 of the 20
    # masks the reviewer called correct — the add would then buy nothing.
    "cjk_script": ("cjk-script", "kanji"),
}

# --------------------------------------------------------------------------- thresholds

# [REVIEWED] Calibrated 2026-08-03 by the reviewer's mask-quality round (60 masks,
# sam-mask-quality-1, analysis in data/sam/mask-quality-analysis.json). STORED ROWS keep using
# the low run-time threshold below so raising the cut stays a query, never a re-run; consumers
# should filter at CALIBRATED_SCORE_THRESHOLD — via passes_calibrated_cut() below, which also
# applies the area guard.
#
# THE STORED VALUE IS THE ROUNDED DISPLAY VALUE, NOT THE SWEEP OPTIMUM. Corrected 2026-08-03
# after the phase-0 adversarial review (reviews/phase-0-adversarial/sam.md finding 3). The sweep's
# candidates are the observed scores themselves, so the winning candidate is the observed score
# 0.577937 (CALIBRATED_SWEEP_OPTIMUM below); the next observed score above it is 0.580005 and
# there is nothing in between. Rounding up to 0.578 moves the mask that *defines* the boundary to
# the wrong side and turns one true positive into a false negative. Re-derived, both cuts, primary
# treatment (`partly` excluded from both sides):
#
#   cut       tp  fp  fn  tn   precision  recall    specificity  Youden J
#   0.577937  29   3  13  14   0.906250   0.690476  0.823529     0.514006   <- the sweep optimum
#   0.578     28   3  14  14   0.903226   0.666667  0.823529     0.490196   <- this constant
#
# The published "precision 91%, recall 69%, J 0.514" is the first row and does NOT hold at the
# value stored here; the second row is what this constant actually produces.
#
# DELIBERATE CHOICE (adversarial-review fix 4, 2026-08-03): keep 0.578, correct this comment.
# The alternative — storing 0.577937 — was rejected because every artifact already on disk was
# computed at 0.578: PROBE4_NOTES.md, PROBE5_NOTES.md, VOCAB_PROBE_NOTES.md, SAM_DESIGN_NOTES.md,
# data/sam/nesting-in-person.json, data/sam/mask-quality-2-sample.json, the probe .log files, and
# another workstream's committed data/oracle-premise/bcde-pilot-1-analysis.json. Moving the
# constant by 6.3e-5 would leave all of them silently un-reproducible for a difference that
# touches, corpus-wide, one boundary mask. Keeping the value makes every consumer's behaviour
# exactly what is published; the defect was never the behaviour, it was this comment.
# Anyone reproducing the published J must use CALIBRATED_SWEEP_OPTIMUM.
CALIBRATED_SCORE_THRESHOLD = 0.578

# [MEASURED] The sweep's actual winning candidate — an observed score, not a rounded value.
# analyze-mask-quality.ts over sam-mask-quality-1, 2026-08-03. Use this to reproduce the published
# precision 0.9062 / recall 0.6905 / J 0.5140; use CALIBRATED_SCORE_THRESHOLD to reproduce every
# stored artifact. The two differ on exactly one mask in the calibration sample.
CALIBRATED_SWEEP_OPTIMUM = 0.577937

# [MEASURED] The population-weighted alternative, likewise the observed score rather than its
# rounded display (0.644). Inverse-probability weights over `concept|band` cells: weighted J
# 0.373214, precision 0.991293, recall 0.456204. The unweighted optimum is partly an artefact of
# even-quota sampling; both are recorded so neither can be quietly dropped.
CALIBRATED_SCORE_THRESHOLD_WEIGHTED = 0.644
CALIBRATED_SWEEP_OPTIMUM_WEIGHTED = 0.643816

# [MEASURED] Area-fraction guard: a region covering more than this share of the image is rejected
# ALONGSIDE the score cut, not instead of it. Added 2026-08-03 by the phase-0 adversarial review
# (finding 1), which showed the previous claim — "all 3 hallucination-signature masks fall below
# the cut, so no area-fraction guard is needed" — was circular. The "hallucination signature" is
# *defined* as area_fraction > 0.5 AND score < 0.5, so every member of it necessarily scores below
# any cut >= 0.5; the verdict was computed over that force-included subset alone and could not
# have produced a counterexample. The evidence the same round actually holds:
#
#   * 5 of the 60 masks have area_fraction > 0.5. The reviewer rejected 5 of 5 and accepted none.
#   * One of them — `8b4f2aadf3b1:sticker:0`, score 0.678697, area 0.780706 — clears the score cut
#     with room, and is one of only three false positives there. It was never force-included, so
#     the old verdict never looked at it.
#   * Adding the guard costs ZERO true positives in-sample and removes that one false positive:
#       at 0.577937: precision 0.906250 -> 0.935484, specificity 0.823529 -> 0.882353, J 0.514006 -> 0.572829
#       at 0.578   : precision 0.903226 -> 0.933333, specificity 0.823529 -> 0.882353, J 0.490196 -> 0.549020
#     (Recall is unchanged at both cuts. The review's headline "0.9062 -> 0.9333" pairs the
#     precision at 0.577937 with the guarded precision at 0.578; both guarded values are above.)
#
# KNOWN EXPOSURE, stated because the sample cannot settle it. Corpus-wide on sam-eval-142-v2:
# 4,863 regions, 10 with area_fraction > 0.5, of which 3 match the signature and 6 clear the score
# cut — 5 `person` and the same 0.678697 `sticker`. The calibration sample's big-area masks are
# 3 `sticker`, 1 `logo`, 1 `face` and contain NO `person` (the largest sampled `person` mask is
# area 0.302), so the guard's main corpus effect falls on a concept the round never tested at big
# area. A person filling most of a cover is an ordinary artwork, and those 5 masks may well be
# correct. This is recorded as a loose end for a round-3 item rather than hidden in a constant.
CALIBRATED_MAX_AREA_FRACTION = 0.5


# [MEASURED] Concept groups the area guard does NOT apply to. Added 2026-08-04 by mask-quality
# round 3 (loose end A6), a CENSUS — every region in sam-eval-142-v3-dynamic over the guard, plus
# every region just under it as context — which asked each one whether it is "a real thing that
# fills the cover" or "the model outlining most of the picture":
#
#   group            over-guard  covers  real  loose  whole  share  verdict
#   person_like               6       6     6      0      0  1.000  EXEMPT (>= 0.70)
#   mark_like                 4       3     2      0      2  0.500  undecided, guard stays
#   dynamic_subject           2       2     2      0      0  1.000  undecided, 2 decided < 3
#   text_like                 0       0     -      -      -    n/a  no region near the guard
#
# The 5 person masks that clear the score cut and die on area alone — the guard's entire corpus
# effect on this concept — were each answered `yes` (a correct person mask) AND `real-subject`:
#   3b82cee640a2:person:0  score 0.838555  area 0.5712
#   89ab247d72c9:person:0  score 0.817568  area 0.5340
#   7f522b435cdc:person:0  score 0.766371  area 0.6822
#   dca149beb8a5:person:0  score 0.735899  area 0.5133
#   5a45dc54f71a:person:0  score 0.687865  area 0.5836
# The exposure the comment above recorded on 2026-08-03 — "a person filling most of a cover is an
# ordinary artwork, and those 5 masks may well be correct" — is now MEASURED, and resolved in
# favour of the masks. The pre-registered contradiction check (mask=yes AND guard=whole-image, the
# case the guard exists for) found ZERO items in the entire census.
#
# WHY PER-GROUP AND NOT A REPEAL. The guard's one in-sample win in round 1 was
# 8b4f2aadf3b1:sticker:0, a false positive at score 0.678697 / area 0.780706. That region is
# mark_like, which keeps the guard, so the win is preserved unchanged. mark_like's 0.500 share
# also rests on only 3 distinct regions: 8b4f2aadf3b1:emblem:0 and 8b4f2aadf3b1:sticker:0 are the
# same region under two tags (bbox 0.995x0.990 vs 0.997x0.991), called a correct emblem and an
# incorrect sticker.
GUARD_EXEMPT_GROUPS: frozenset[str] = frozenset({"person_like"})


def passes_calibrated_cut(score: float, area_fraction: float,
                          concept: str | None = None,
                          max_area_fraction: float | None = CALIBRATED_MAX_AREA_FRACTION,
                          apply_group_exemptions: bool = True) -> bool:
    """The calibrated cut as one predicate: score threshold AND area guard.

    One place, so a consumer cannot pick up the threshold and miss the guard. Pass
    `max_area_fraction=None` to reproduce a score-only artifact made before the guard existed
    (every probe table and nesting table on disk today is score-only — see the addenda in
    data/sam/*NOTES.md).

    `concept` selects the per-group threshold when one is calibrated; leave it None for the
    pooled cut.

    The area guard does not apply to a concept whose group is in GUARD_EXEMPT_GROUPS (mask round
    3, loose end A6). Pass `apply_group_exemptions=False` to reproduce an artifact computed with
    the guard applied uniformly — i.e. anything guard-on written before 2026-08-04.
    """
    if score < calibrated_threshold_for(concept):
        return False
    if max_area_fraction is None:
        return True
    if apply_group_exemptions and concept is not None and group_of(concept) in GUARD_EXEMPT_GROUPS:
        return True
    return area_fraction <= max_area_fraction


# [MEASURED] Per-group score thresholds, where a group is measurably better off under its own cut
# than under the pooled one. Groups not listed here fall back to CALIBRATED_SCORE_THRESHOLD.
# Added 2026-08-03 by the phase-0 adversarial review (finding 2), which showed the previous
# conclusion — "the concept groups did not separate, so no per-group threshold is justified" — was
# a property of an `every()` quantifier, not a measurement. Re-derived over sam-mask-quality-1,
# primary treatment, candidate set = observed scores, ties to the lowest:
#
#   group        n   own optimum  own J     J at pooled 0.577937  gain
#   text_like    31  0.697295     0.478261  0.358696              +0.119565
#   person_like  29  0.577937     0.678363  0.678363               0.000000
#
# Both of the analysis's own gates pass for text_like: separation |0.697295 - 0.577937| = 0.119358
# >= PER_GROUP_MIN_SEPARATION 0.05, gain 0.119565 >= PER_GROUP_MIN_J_GAIN 0.05, n = 31 >=
# MIN_CELL_ANSWERS 5. `person_like` "fails" only because its own optimum IS the pooled optimum —
# it is the group that drives the pooled cut, so its gain is necessarily zero. A group that is
# indifferent must not veto a group that gains; the gate in analyze-mask-quality.ts was fixed to
# say so.
#
# What the second number buys, in-sample: text_like at the pooled cut runs precision 0.875 /
# recall 0.608696; at its own 0.697295 it runs precision 1.000000 / recall 0.478261 (tp 11, fp 0,
# fn 12, tn 8). Over the whole 60-mask sample, cutting each group at its own threshold gives
# precision 0.962963 / recall 0.619048 / J 0.560224, against 0.906250 / 0.690476 / 0.514006 for
# the single pooled cut. It is a precision-for-recall trade, and it lands on the majority of the
# instrument's output: text_like is 4,165 of 4,863 regions in sam-eval-142-v2 (86%) and 1,968 of
# the 2,366 that clear the pooled cut.
#
# FEEDS LOOSE END A12 (CJK below the cut). A12 is parked because "chinese characters" recalls 4/4
# CJK covers with zero false positives yet tops out at 0.472, below the pooled cut, and the note
# in CONCEPT_PROMPTS above says "a category-aware threshold plus a CJK mask-quality round must
# come first". This table IS that category-aware threshold machinery: the mechanism now exists and
# is calibrated for text_like. It moves text_like's cut UP, not down, so it does not by itself
# revive any CJK mask — A12 still needs its own round, and a CJK entry here would need its own
# evidence. What changes is that A12 no longer waits on machinery that does not exist.
#
# THAT ROUND HAS SINCE RUN (2026-08-04). Round 3b put 25 CJK masks in front of the reviewer and
# its pre-registered rule adopted the `cjk_script` entry below — the "own evidence" this note
# demanded. A12's concept half is resolved by that; what remains open is the entry's PROVISIONAL
# status, spelled out at the entry itself.
CALIBRATED_GROUP_THRESHOLDS: dict[str, float] = {
    # Stored at full precision, unrounded, deliberately: rounding the pooled cut up to 0.578 is
    # exactly the defect finding 3 names, and a new constant must not repeat it. No artifact on
    # disk was computed at this cut, so there is nothing to keep reproducible.
    "text_like": 0.697295,
    # [MEASURED, n=21, PROVISIONAL] Round 3b, 2026-08-04, applying the pre-registered
    # `a12DecisionRule`. Sweep over observed scores, primary treatment (`partly` excluded
    # from both sides), ties to the lowest: own optimum 0.392655 at J 0.500000 against
    # J 0.150000 at the pooled cut — gain 0.350000 >= PER_GROUP_MIN_J_GAIN, separation
    # |0.578 - 0.392655| = 0.185345 >= PER_GROUP_MIN_SEPARATION, n 21 >= MIN_CELL_ANSWERS.
    # Unlike round 3's hard-text section this sample was NOT selected by the cut — it spans
    # score bands and contains keep-side rows (3 kanji masks score >= 0.578) — so the J gain
    # is not the round-3 truncation artefact, and it is provably invariant to the 0.3 run
    # floor: both cuts already run specificity 1.000, so below-floor rows can only add true
    # negatives and specificity cannot rise above 1.0.
    #
    # WHY PROVISIONAL, AND DO NOT QUIETLY DROP THIS WORD. The group holds exactly ONE
    # negative answer, so the specificity term of J is 0.0 or 1.0 and nothing else, and this
    # optimum is mechanically "the smallest observed score above that one rejected mask" — a
    # boundary located by one answer, not estimated from a distribution of negatives. It also
    # DISCARDS 10 of the 20 masks the reviewer called correct in order to exclude that single
    # one; at the run floor the same group runs precision 0.9524 at recall 1.000, and the
    # Youden objective the rule pre-registered is what prices one false positive as heavily as
    # ten false negatives. 25 CJK regions from sam-cjk-probe-7 are still ungraded and all
    # carry mask_rle, so re-fitting this is a CPU render plus reviewer time — NO GPU.
    # RE-FIT CONDITION: more than one negative answer in the group. Until then this number is
    # the rule's output, not a settled boundary, and nothing may cite it as calibrated.
    "cjk_script": 0.392655,
}


def group_of(concept: str) -> str | None:
    """The CONCEPT_GROUPS group a stored concept tag belongs to, or None if it is not in the set."""
    for group, concepts in CONCEPT_GROUPS.items():
        if concept in concepts:
            return group
    return None


def calibrated_threshold_for(concept: str | None) -> float:
    """The score cut for one concept: its group's, if calibrated, else the pooled cut."""
    if concept is None:
        return CALIBRATED_SCORE_THRESHOLD
    group = group_of(concept)
    if group is None:
        return CALIBRATED_SCORE_THRESHOLD
    return CALIBRATED_GROUP_THRESHOLDS.get(group, CALIBRATED_SCORE_THRESHOLD)

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

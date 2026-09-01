"""Per-cover DYNAMIC concept derivation, v3: the CLASS word AND *EVERY* SPECIES NOUN.

CPU, deterministic, no model. Writes only under research/v3/data/sam/.

    .venv/bin/python dynamic_concepts_v3.py --out dynamic-concepts-eval-142-v3.json

WHY THERE IS A v3, AND WHY v1 AND v2 ARE NOT EDITED. `dynamic_concepts.py` produced the table
behind `sam-eval-142-v3-dynamic` and `dynamic_concepts_v2.py` produced the table behind
`sam-eval-142-v4-nouns`; RESIDUAL_EXPERIMENT_NOTES.md §3 and the v4 sections are records of exactly
what those tables contained. Editing either in place would silently invalidate a record and make a
stored run unreproducible. So v3 is a third module with its own rules version, and both predecessors
stay frozen.

WHAT CHANGED, IN ONE LINE. v2 could only ask for THE main thing, because `subject-noun.v1` asks for
one noun. RESIDUAL_PURITY_VERDICT.md measured what that costs, in the reviewer's own findings on the
v4 residuals — a flame and a cello left sitting in a "background":

    "The noun question asks for *the* main thing in the cover. A second depicted object is never
     named, so it is never prompted, so it is never masked. This is a known shape of failure and
     the fix is already proposed: list-ALL-things elicitation rather than one noun."

`subject-nouns-all.v1` variant J is that elicitation, and this module consumes it. Every noun in a
cover's list becomes its own SAM prompt under its own rank-carrying tag.

THE CLASS HALF IS UNCHANGED, DELIBERATELY, FOR THE SECOND TIME. Every rule, mapping and phrasing for
the class word is v1's, imported rather than copied, including the entry for `"object"` that v1
measured dead (asked on 24 covers, nothing returned on 22 even at the 0.3 capture floor). v2 kept it
so that v4's prompt list was a strict superset of v3's; v3 keeps it for the same reason, so any
cover that masks under v5 and did not under v4 is attributable to the NOUN LIST alone, with no
second change to argue about. Retiring `"object"` remains a real follow-up and still belongs to a
later round.
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import common
import config
import dynamic_concepts as v1
import dynamic_concepts_v2 as v2

# --------------------------------------------------------------------------- sources

# [MEASURED] The class half. Unchanged from v1 and v2: the group-BCDE pilot is still the only run on
# disk carrying `subject_kind`, and its E/F agreement is still the rule.
PILOT_PATH = v1.PILOT_PATH

# [MEASURED] The species half. `subject-nouns-all.v1` variant J over the 142 included eval covers,
# 2026-08-04 — the run this module exists to consume.
NOUNS_RUN_PATH = (config.REPO_ROOT / "research" / "v3" / "data" / "oracle-premise"
                  / "subject-nouns-all-1.jsonl")

# [MEASURED] v4's table, read for ONE purpose: to carry each cover's v4 single-noun prompt into the
# v3 table as a stored field, so the v4-vs-v5 comparison is a field lookup rather than a re-derivation
# from two files with different rules versions. It is READ-ONLY here and no rule depends on it.
V2_TABLE_PATH = config.DATA_DIR / "dynamic-concepts-eval-142-v2.json"

# [REVIEWED] The noun run ships ONE variant, so there is no inter-variant agreement signal for the
# noun list and none is faked here. A J list is a single reading; an E==F class word is a corroborated
# one. Both provenances are recorded per cover so no analysis can pool them by accident.
NOUNS_VARIANT = "J"
NOUNS_AGREEMENT_RULE = (
    "single_variant_no_agreement_signal — subject-nouns-all.v1 ships variant J alone (a second "
    "variant is a second full pass and the run's budget bought one). The class word keeps v1's E==F "
    "rule; the noun list has no such check and must not be read as if it did. Inherited unchanged "
    "from v2, where the same was true of the single noun.")

# [REVIEWED] The referent rules of the two halves NO LONGER MATCH, and that is recorded rather than
# smoothed over. `subject-nouns-all.v1` drops ORACLE_QUESTION_SET.md §A.6.0's "take them all
# together" clause (its `deviations` block says why: eight slots cannot suffer the presupposition
# failure one slot could, and keeping the clause would suppress the second object the set exists to
# find). So a J entry and an E==F `subject_kind` are not answers to referent-identical questions.
# CONSEQUENCE, ENFORCED BELOW: the two halves stay in separate tags and are never merged into one
# answer. `duplicate_of_class_word` still fires — that is a prompt-string dedupe to avoid asking SAM
# the same words twice, not a claim that the two answers are the same answer.
REFERENT_RULE_MISMATCH = (
    "class half: ORACLE_QUESTION_SET.md §A.6.0 collective referent ('take them all together'); "
    "species half: per-entry distinct-kind referent ('one entry per kind'). NOT joinable as one "
    "answer; kept in separate tags.")

DERIVATION_RULES_VERSION = "sam-dynamic-concepts.v3"

# --------------------------------------------------------------------------- the noun tags

# [REVIEWED] ONE TAG PER RANK, with the noun itself as the prompt string. v2's note explains why the
# tag space must stay closed while the prompt space is open: `instances_by_concept`, the row key and
# every group lookup have to be well-defined on a per-cover vocabulary. v2 needed one tag because it
# had one noun. This set can return up to eight, so the closed tag space is the eight RANKS, not the
# eight nouns — `dyn-noun-1` is whichever thing the VLM put first.
#
# THE RANK IS DATA AND THIS IS WHERE IT IS STORED. The prompt asks for largest-first order, so
# `dyn-noun-1` is the cover's primary subject as the VLM sees it and `dyn-noun-8` is its smallest
# named thing. Storing rank in the tag means a downstream consumer can ask "the primary subject"
# without re-deriving anything, and means the v4-vs-v5 comparison has an obvious like-for-like
# pairing: v4's single `dyn-noun` against v5's `dyn-noun-1`.
#
# Like every `dyn-*` tag these are in no CONCEPT_GROUPS group, so `config.group_of()` returns None
# and they are cut at the POOLED threshold — never `text_like`'s raised cut and never `cjk_script`'s
# lowered one. No mask-quality round has ever graded one of these prompts; the pooled cut is the
# honest default for a question nobody has calibrated.
MAX_NOUNS = 8
NOUN_TAGS = tuple(f"dyn-noun-{i}" for i in range(1, MAX_NOUNS + 1))

# [REVIEWED] Alphabetical by tag, as in v1 and v2, so a cover's prompt list — and therefore its
# dynamic-set hash and its row key — is a pure function of its answers and never of dict order.
# Plain string sort puts these in exactly the intended order, which is ASSERTED below rather than
# assumed: a two-digit rank (`dyn-noun-10`) would sort between 1 and 2 and silently reorder every
# cover's prompt list, changing every dynamic_set_hash and therefore every row key. The assertion
# is what makes raising MAX_NOUNS past 9 fail loudly at import instead of quietly at analysis.
_TAG_ORDER = tuple(sorted(("dyn-animal", "dyn-building", "dyn-object", "dyn-vehicle",
                           "dyn-watermark") + NOUN_TAGS))
assert MAX_NOUNS <= 9, (
    f"MAX_NOUNS is {MAX_NOUNS}; a two-digit rank tag breaks the lexicographic tag order that "
    f"dynamic_set_hash() and every row key depend on. Zero-pad the ranks before raising it.")
assert list(NOUN_TAGS) == sorted(NOUN_TAGS), "rank tags must sort into rank order"
assert _TAG_ORDER.index("dyn-building") < _TAG_ORDER.index("dyn-noun-1") < \
    _TAG_ORDER.index(f"dyn-noun-{MAX_NOUNS}") < _TAG_ORDER.index("dyn-object"), \
    "tag order is not the intended alphabetical interleave"

# --------------------------------------------------------------------------- the bars

# [REVIEWED] The literal escape the prompt specifies for "there is no thing on this cover", carried
# over from v2 unchanged so the two runs' escapes are directly comparable. Under an array envelope
# with minItems 1 the empty list is not sayable, so the escape is the one-element list ["none"].
NONE_ANSWERS = v2.NONE_ANSWERS

# [REVIEWED] PART NOUNS, BARRED — v2's list, imported rather than retyped, and for v2's reason.
# PROBE5_NOTES.md's one finding against the design: `eye` scores 0.87-0.92 on eyes that are 0.1% of
# a frame and 0.42 on a cover that IS an eye, because a part noun makes a part detector. The bar
# matters MORE under a list prompt than under a single-noun one: the obvious failure mode of "name
# everything" is a model that decomposes one subject into its parts, and the prompt's extra sentence
# forbidding that ("Once you have named a thing, do not add its parts as further entries") is an
# instruction, not a guarantee. EXACTLY THE FOUR PROBE 5 NAMES and not one more — that round says in
# as many words that "the real list is the reviewer's call", and inventing a longer list here would
# be making that call silently. Everything else that looks like a part is FLAGGED and kept.
PART_NOUNS_BARRED = v2.PART_NOUNS_BARRED
PART_NOUN_WATCHLIST = v2.PART_NOUN_WATCHLIST

# [REVIEWED] NON-THINGS, BARRED — NEW IN v3, and every word in it is quoted from the prompt itself.
# The v4 elicitation could not produce these because it asked for one main thing and had a `none`
# escape for covers with none. A list prompt can and does: the very first cover of the J smoke,
# which `subject-noun.v1` answered `none`, came back ["splatter", "stripes", "tassels", "text"].
#
# THE LIST IS NOT INVENTED. `subject-nouns-all.v1`'s prompt says, verbatim: "Lettering is not a
# thing. A pattern is not a thing. A colour, a texture or a plain field is not a thing." These six
# words ARE that sentence. This is the same belt-and-braces discipline v2 applies to part nouns —
# the bar has to hold whether or not the model obeyed the instruction — and it is deliberately
# limited to what the instrument already says out loud, so that widening it stays the reviewer's
# call and not this module's.
NON_THINGS_BARRED = ("lettering", "pattern", "colour", "color", "texture", "field")

# [REVIEWED] BARE CATEGORY WORDS, BARRED — NEW IN v3, and likewise quoted. The prompt names these
# ten by name: "Do not use a bare category word — animal, object, vehicle, building, structure,
# thing, subject, item, shape, figure — when a plainer and more specific name exists."
#
# This bar is also the one place where RESIDUAL_EXPERIMENT_NOTES.md §5.2's measurement bites: the
# closed enum's most common answer, `object`, was asked as a SAM prompt on 24 covers and returned
# nothing at all on 22 of them even at the 0.3 capture floor, because it is a grammatical category
# and not a thing-word. A bare category noun arriving through the species half would reproduce that
# dead prompt at the species half's expense.
#
# IT APPLIES TO THE SPECIES HALF ONLY. The CLASS half still asks `animal`, `object`, `vehicle` and
# `building` exactly as v1 and v2 did, under `dyn-animal`/`dyn-object`/`dyn-vehicle`/`dyn-building`.
# That is what keeps v5's prompt list a strict superset of v4's — see the module docstring. Barring
# the words here removes a DUPLICATE of a class prompt, never the class prompt.
BARE_CATEGORIES_BARRED = ("animal", "object", "vehicle", "building", "structure", "thing",
                          "subject", "item", "shape", "figure")

# [REVIEWED] LETTERING WORDS, BARRED — NEW IN v3. The prompt's "Lettering is not a thing" names the
# category; these are the words a model actually uses for it, and the J smoke produced two of them
# (`text` on two of three covers, `logo` on one) inside lists that were otherwise correct.
#
# `words`, `letter`, `lettering` and `album title` are already static prompt strings and are caught
# one bar later by `already_static`, which is the honest disposition for them — asking SAM the same
# words twice is a cost, not an error. This list is the REMAINDER: lettering words that are NOT in
# the static set and would therefore become genuinely new prompts. `text` and `typography` are the
# §8.3 phrasings probe 1 measured at 0/10 with this model, so barring them costs no measured recall.
#
# WHY THIS MATTERS MORE THAN IT LOOKS. This experiment is SUBTRACTION-oriented: a mask removes pixels
# from the residual. A lettering noun that fired would remove text pixels under a `dyn-noun-N` tag,
# where the residual analysis counts them as SUBJECT removal rather than as `text_like` removal, and
# the text-leak measurement this round exists to re-check would be quietly improved by the bookkeeping.
#
# MATCHED HEAD-FINAL, and this bar ALONE is. The J run emits compounds — `background text`,
# `parental advisory label` — that an exact-match bar sails straight past. English compound nouns
# are head-final, so `background text` IS a kind of text and barring it on its head word is a
# linguistic fact rather than a guess. The same rule is NOT applied to any other bar here, because
# it is only safe where the head word names a category that is never a depicted thing: head-final
# matching on `NON_THINGS_BARRED` would bar `corn field` and `football field`, which are places a
# cover really can depict. Every other bar below is EXACT MATCH on the normalized string.
LETTERING_WORDS_BARRED = ("text", "typography", "title", "writing", "wordmark", "caption",
                          "font", "handwriting", "signature", "script", "subtitle", "label")

# [REVIEWED] GROUND WORDS, BARRED — NEW IN v3, and the reason is CIRCULARITY, not vocabulary.
# The J run emits `background` as a list entry (cover 92 of the run: ["microphone", "text",
# "lightning", "background"]). Handing that word to SAM as a subject prompt would make this
# instrument answer its own question. The residual is DEFINED as what survives after every mask is
# subtracted, and the standing question — R-3, the one `residual-purity-1` returned NOT-ADOPT on —
# is whether that residual is cleanly the background. A prompt literally named "background" would
# subtract the background, drive the residual toward zero, and register in the purity proxy as an
# improvement, with nothing in the numbers to say the improvement was tautological.
#
# This is the same defect the phase-0 adversarial review found in the area-guard verdict, where a
# quantity was "computed over that force-included subset alone and could not have produced a
# counterexample". It is barred here so the v4-vs-v5 comparison cannot be won by a definition.
#
# DELIBERATELY NARROW. `sky`, `wall`, `space` and `void` are NOT barred: a sky and a wall are things
# a cover really depicts and really should mask. They carry the same risk in weaker form and are on
# the watchlist below, kept and flagged, which is the reviewer's call to make and not this module's.
GROUND_WORDS_BARRED = ("background", "backdrop")

# [REVIEWED] Flagged, NOT barred — NEW IN v3, and the same refusal v2 makes about part nouns. These
# read like patterns or surface qualities rather than depicted things, and the J smoke produced two
# of them (`splatter`, `stripes`). No round has measured any of them and barring them would be making
# the reviewer's call silently, so they are kept as prompts and listed in the derivation table and the
# summary, so the reviewer sees the real candidate list rather than a list this module guessed.
NON_THING_WATCHLIST = (
    "stripe", "splatter", "swirl", "spiral", "grid", "checker", "dot", "spot", "line", "curve",
    "blob", "smear", "smudge", "gradient", "glow", "haze", "mist", "fog", "smoke", "light",
    "shadow", "reflection", "blur", "noise", "grain", "static", "border", "frame",
    "surface", "wall", "sky", "space", "void", "abstract", "art", "artwork", "design",
    "graphic", "illustration", "drawing", "painting", "photo", "photograph", "image", "picture",
    "circle", "square", "triangle", "rectangle", "oval", "ring", "band", "stripe", "pattern",
)

# [REVIEWED] Static prompt strings under the concept set IN FORCE AT IMPORT — concept set v2.2 for
# this run, which is 12 concepts including `chinese characters` and `kanji`. A species noun landing
# on one of these would ask SAM the identical question twice under two different tags. Read from
# config rather than hardcoded so the bar tracks the concept set automatically; the resolved list and
# its hash are both stored in the table's meta so a reader never has to guess which set was in force.
STATIC_PROMPT_STRINGS = frozenset(p for _, p in config.CONCEPT_PROMPTS)

# [REVIEWED] Normalization is v2's, imported not copied: lowercase, de-article, de-punctuate,
# trivially singularize, with every step RECORDED per entry. Identical rules on both runs is what
# makes "did the flame/cello class close?" a comparison of ELICITATION rather than of cleanup.
normalize_noun = v2.normalize_noun


# --------------------------------------------------------------------------- noun source

def _noun_lists(path: Path = NOUNS_RUN_PATH) -> dict[str, list[str]]:
    """{image_path: [raw noun, ...]} over the run's non-canary, ok, parsed rows.

    Canary rows are excluded for v1's reason: they are repeats of one cover inserted for drift
    detection, and counting a cover once per canary hit would weight it by how often the drift
    check ran.
    """
    out: dict[str, list[str]] = {}
    for row in common.read_jsonl(path):
        if row.get("is_canary") or row.get("status") != "ok" or row.get("parse_failed"):
            continue
        if row.get("prompt_variant") != NOUNS_VARIANT:
            continue
        parsed = row.get("parsed") or {}
        nouns = parsed.get("subject_nouns_all")
        if nouns is None:
            continue
        image_path = row["image_path"]
        if image_path in out:
            raise RuntimeError(
                f"duplicate non-canary noun row for {image_path}; one row per cover is assumed")
        out[image_path] = list(nouns)
    return out


def classify_entry(raw: str, class_prompt: str | None, kept_so_far: set[str],
                   rank_used: int) -> tuple[str | None, str, list[dict]]:
    """(prompt_or_None, disposition, normalization_steps) for ONE entry of one cover's list.

    The dispositions are the whole audit trail for why an entry did or did not become a prompt, and
    every one of them is countable in the summary. Order matters and is fixed: a word is reported
    under the FIRST reason it was rejected, so the counts partition the entries exactly once.
    """
    value, steps = normalize_noun(raw)
    if not value:
        return None, "empty_after_normalization", steps
    if value in NONE_ANSWERS:
        # `none` sitting inside a longer list is a self-contradiction, not an escape. It is barred
        # per-entry and counted separately from the cover-level escape so the two never pool.
        return None, "none_inside_list", steps
    if value in PART_NOUNS_BARRED:
        return None, "part_noun_barred", steps
    if value in NON_THINGS_BARRED:
        return None, "non_thing_barred", steps
    if value in BARE_CATEGORIES_BARRED:
        return None, "bare_category_barred", steps
    # The one head-final bar; see LETTERING_WORDS_BARRED for why it and nothing else.
    if value.split(" ")[-1] in LETTERING_WORDS_BARRED:
        return None, "lettering_word_barred", steps
    if value in GROUND_WORDS_BARRED:
        return None, "ground_word_barred", steps
    if value in STATIC_PROMPT_STRINGS:
        return None, "already_static", steps
    if class_prompt is not None and value == class_prompt:
        return None, "duplicate_of_class_word", steps
    if value in kept_so_far:
        # The prompt asks for distinct kinds; `uniqueItems` is not implementable in the grammar
        # (llguidance 1.7.6), so distinctness is enforced here. Collapsing rather than failing the
        # row is `common.py`'s own treatment of multi-select repeats, and §A.6.6's for
        # self-contradiction: keep the answer, count the contradiction.
        return None, "duplicate_within_list", steps
    if rank_used >= MAX_NOUNS:
        # Unreachable while the grammar caps the array at 8; kept and counted so a grammar
        # regression shows up as a number rather than as silently dropped nouns.
        return None, "over_rank_cap", steps
    return value, "used", steps


# --------------------------------------------------------------------------- derivation

def derive() -> dict:
    answers_by_path = v1._pilot_answers()
    lists_by_path = _noun_lists()
    v2_by_path = ({c["image_path"]: c for c in json.loads(V2_TABLE_PATH.read_text())["covers"]}
                  if V2_TABLE_PATH.exists() else {})
    refs = common.eval_set_refs()

    covers = []
    for ref in refs:
        answers = answers_by_path.get(ref.rel_path, {})
        have_both = all(v in answers for v in v1.AGREEMENT_VARIANTS)

        # ---- the CLASS half: v1's rules, verbatim, via v1 ----
        subject_raw = {v: answers.get(v, {}).get("subject_kind") for v in v1.AGREEMENT_VARIANTS}
        subject = v1._agreed_single(answers, "subject_kind") if have_both else None
        overlays_raw = {v: sorted(answers.get(v, {}).get("overlays") or [])
                        for v in v1.AGREEMENT_VARIANTS}
        overlays = v1._agreed_multi(answers, "overlays") if have_both else None

        prompts: dict[str, str] = {}
        provenance: list[dict] = []
        class_prompt: str | None = None

        if subject is not None:
            mapped = v1.SUBJECT_KIND_MAPPING.get(subject)
            if mapped is not None:
                class_prompt = mapped[1]
                prompts[mapped[0]] = mapped[1]
                provenance.append({"field": "subject_kind", "value": subject,
                                   "tag": mapped[0], "prompt": mapped[1], "half": "class"})
            else:
                provenance.append({"field": "subject_kind", "value": subject, "tag": None,
                                   "prompt": None, "half": "class",
                                   "reason": v1.SUBJECT_KIND_NULL_REASON.get(subject, "unmapped")})
        else:
            provenance.append({"field": "subject_kind", "value": None, "tag": None, "prompt": None,
                               "half": "class",
                               "reason": "variants_disagree" if have_both else "no_answer"})

        # ---- the SPECIES half: ALL nouns, new in v3 ----
        #
        # NOT GATED ON THE CLASS ANSWER, the same deliberate difference from v1 that v2 records:
        # gating on `subject_kind` would reintroduce the closed enum this line of work exists to
        # escape, and would silence the nouns on precisely the covers v1 could not prompt at all
        # (the 10 where E and F disagree, and the 2 `abstract_shape` covers). The prompt's own
        # `none` escape is the gate, answered by the model that is actually looking at the cover.
        raw_list = lists_by_path.get(ref.rel_path)
        entries: list[dict] = []
        noun_prompts: list[str] = []
        kept: set[str] = set()

        if raw_list is None:
            cover_disposition = "no_answer"
        elif (len(raw_list) == 1
              and normalize_noun(raw_list[0])[0] in NONE_ANSWERS):
            # The cover-level escape: a one-element list holding the literal `none`. Counted apart
            # from `none_inside_list`, which is a contradiction rather than an escape.
            cover_disposition = "none_answered"
            value, steps = normalize_noun(raw_list[0])
            entries.append({"position": 0, "raw": raw_list[0], "normalized": value,
                            "disposition": "none_answered", "tag": None, "prompt": None,
                            "normalizations": steps})
        else:
            cover_disposition = "list_answered"
            for position, raw in enumerate(raw_list):
                prompt, disposition, steps = classify_entry(
                    raw, class_prompt, kept, len(noun_prompts))
                tag = None
                if prompt is not None:
                    tag = NOUN_TAGS[len(noun_prompts)]
                    prompts[tag] = prompt
                    noun_prompts.append(prompt)
                    kept.add(prompt)
                normalized, _ = normalize_noun(raw)
                entries.append({"position": position, "raw": raw, "normalized": normalized,
                                "disposition": disposition, "tag": tag, "prompt": prompt,
                                "normalizations": steps,
                                "on_part_noun_watchlist": bool(
                                    normalized and normalized.split(" ")[-1] in PART_NOUN_WATCHLIST),
                                "on_non_thing_watchlist": bool(
                                    normalized and normalized.split(" ")[-1] in NON_THING_WATCHLIST)})

        provenance.append({"field": "subject_nouns_all", "half": "species",
                           "value": raw_list, "cover_disposition": cover_disposition,
                           "entries": entries,
                           "tags": [e["tag"] for e in entries if e["tag"]],
                           "prompts": noun_prompts})

        # ---- overlays: v1's rules, verbatim ----
        for value in (overlays or []):
            mapped = v1.OVERLAY_MAPPING.get(value)
            if mapped is not None:
                prompts[mapped[0]] = mapped[1]
                provenance.append({"field": "overlays", "value": value, "tag": mapped[0],
                                   "prompt": mapped[1], "half": "overlay"})
            else:
                provenance.append({"field": "overlays", "value": value, "tag": None, "prompt": None,
                                   "half": "overlay",
                                   "reason": v1.OVERLAY_NULL_REASON.get(value, "unmapped")})
        if overlays is None:
            provenance.append({"field": "overlays", "value": None, "tag": None, "prompt": None,
                               "half": "overlay",
                               "reason": "variants_disagree" if have_both else "no_answer"})

        ordered = tuple((tag, prompts[tag]) for tag in _TAG_ORDER if tag in prompts)
        v2_row = v2_by_path.get(ref.rel_path, {})
        covers.append({
            "image_path": ref.rel_path,
            "image_id": ref.image_id,
            "artwork_id": ref.artwork_id,
            "collection": ref.collection,
            "pilot_answer_present": have_both,
            "subject_kind_by_variant": subject_raw,
            "subject_kind_agreed": subject,
            "overlays_by_variant": overlays_raw,
            "overlays_agreed": overlays,
            # the species half, fully auditable, entry by entry
            "subject_nouns_all_raw": raw_list,
            "subject_nouns_cover_disposition": cover_disposition,
            "subject_nouns_entries": entries,
            "subject_noun_prompts": noun_prompts,
            "subject_noun_tags": [NOUN_TAGS[i] for i in range(len(noun_prompts))],
            "subject_nouns_used_count": len(noun_prompts),
            "subject_nouns_barred_count": sum(
                1 for e in entries if e["disposition"] not in ("used", "none_answered")),
            # v4's answer, carried for comparison only — no rule reads it
            "v4_single_noun_raw": v2_row.get("subject_noun_raw"),
            "v4_single_noun_prompt": v2_row.get("subject_noun_prompt"),
            "v4_single_noun_disposition": v2_row.get("subject_noun_disposition"),
            "class_prompt": class_prompt,
            "dynamic_concepts": [t for t, _ in ordered],
            "dynamic_prompts": [list(p) for p in ordered],
            "dynamic_set_hash": v1.dynamic_set_hash(ordered),
            "derivation": provenance,
        })

    return {
        "meta": {
            "rules_version": DERIVATION_RULES_VERSION,
            "generated_at": common.utc_now(),
            "git_head": common.git_head(),
            # run_sam_dynamic.py reads these four; `source_run` stays the pilot because that is
            # what the class half — the half v1 also had — comes from.
            "source_run": str(PILOT_PATH.relative_to(config.REPO_ROOT)),
            "source_run_sha256": common.sha256_file(PILOT_PATH),
            "agreement_variants": list(v1.AGREEMENT_VARIANTS),
            "multi_select_rule": v1.MULTI_SELECT_RULE,
            # the species half's own provenance, named separately so it can never be read as
            # coming from the pilot
            "nouns_source_run": str(NOUNS_RUN_PATH.relative_to(config.REPO_ROOT)),
            "nouns_source_run_sha256": common.sha256_file(NOUNS_RUN_PATH),
            "nouns_variant": NOUNS_VARIANT,
            "nouns_schema_version": "subject-nouns-all.v1",
            "nouns_agreement_rule": NOUNS_AGREEMENT_RULE,
            "referent_rule_mismatch": REFERENT_RULE_MISMATCH,
            "noun_tags": list(NOUN_TAGS),
            "max_nouns_per_cover": MAX_NOUNS,
            "nouns_gated_on_subject_kind": False,
            "part_nouns_barred": list(PART_NOUNS_BARRED),
            "non_things_barred": list(NON_THINGS_BARRED),
            "bare_categories_barred": list(BARE_CATEGORIES_BARRED),
            "lettering_words_barred": list(LETTERING_WORDS_BARRED),
            "lettering_bar_matches_head_word": True,
            "ground_words_barred": list(GROUND_WORDS_BARRED),
            "part_noun_watchlist_flag_only": list(PART_NOUN_WATCHLIST),
            "non_thing_watchlist_flag_only": list(NON_THING_WATCHLIST),
            "eval_set": str(config.EVAL_SET_PATH.relative_to(config.REPO_ROOT)),
            "static_concept_set_hash": common.concept_set_hash(),
            "static_concepts": [c for c, _ in config.CONCEPT_PROMPTS],
            "static_concept_set_version": "v2.2 (cjk-script + kanji)",
            "subject_kind_mapping": {k: (list(v) if v else None)
                                     for k, v in v1.SUBJECT_KIND_MAPPING.items()},
            "overlay_mapping": {k: (list(v) if v else None)
                                for k, v in v1.OVERLAY_MAPPING.items()},
            "class_half_unchanged_from": v1.DERIVATION_RULES_VERSION,
            "species_half_supersedes": v2.DERIVATION_RULES_VERSION,
            "v4_table_read_for_comparison_only": str(V2_TABLE_PATH.relative_to(config.REPO_ROOT)),
        },
        "covers": covers,
    }


def summarize(table: dict) -> str:
    covers = table["covers"]
    L = []
    A = L.append
    A(f"covers: {len(covers)}")
    A(f"noun-list answers present: "
      f"{sum(1 for c in covers if c['subject_nouns_all_raw'] is not None)}")
    A("")
    A("cover-level disposition:")
    for k, n in collections.Counter(
            c["subject_nouns_cover_disposition"] for c in covers).most_common():
        A(f"  {k:28s} {n:4d}")
    A("")
    all_entries = [e for c in covers for e in c["subject_nouns_entries"]]
    A(f"entries elicited: {len(all_entries)} over {len(covers)} covers "
      f"(mean {len(all_entries) / len(covers):.2f} per cover)")
    A("entry disposition:")
    for k, n in collections.Counter(e["disposition"] for e in all_entries).most_common():
        A(f"  {k:28s} {n:4d}")
    for bar in ("part_noun_barred", "non_thing_barred", "bare_category_barred",
                "lettering_word_barred", "ground_word_barred", "already_static",
                "duplicate_of_class_word", "duplicate_within_list", "none_inside_list"):
        words = sorted({e["normalized"] for e in all_entries if e["disposition"] == bar})
        if words:
            A(f"  {bar} words: {words}")
    A("")
    watch_part = sorted({e["normalized"] for e in all_entries
                         if e["disposition"] == "used" and e.get("on_part_noun_watchlist")})
    watch_thing = sorted({e["normalized"] for e in all_entries
                          if e["disposition"] == "used" and e.get("on_non_thing_watchlist")})
    A(f"USED but on the part-noun WATCHLIST (kept, flagged for the reviewer): {len(watch_part)}"
      + (f" -> {watch_part}" if watch_part else ""))
    A(f"USED but on the non-thing WATCHLIST (kept, flagged for the reviewer): {len(watch_thing)}"
      + (f" -> {watch_thing}" if watch_thing else ""))
    A("")
    used = [p for c in covers for p in c["subject_noun_prompts"]]
    distinct = sorted(set(used))
    A(f"distinct noun prompts: {len(distinct)} over {len(used)} (cover, rank) slots")
    top = collections.Counter(used)
    A("  top 15: " + ", ".join(f"{w}x{n}" for w, n in top.most_common(15)))
    A("")
    A("nouns kept per cover:")
    for k, n in sorted(collections.Counter(c["subject_nouns_used_count"] for c in covers).items()):
        A(f"  {k} noun(s): {n:4d} covers")
    A("")
    A("normalizations applied:")
    rules = collections.Counter(s["rule"] for e in all_entries for s in e["normalizations"])
    for k, n in rules.most_common():
        A(f"  {k:28s} {n:4d}")
    if not rules:
        A("  (none)")
    A("")
    A("v4 -> v5, the recovery this run exists to measure:")
    v4_silent = [c for c in covers if not c["v4_single_noun_prompt"]]
    v4_silent_now = [c for c in v4_silent if c["subject_nouns_used_count"] > 0]
    A(f"  covers with NO v4 noun prompt: {len(v4_silent)}")
    A(f"    of those, now carrying >=1 noun prompt: {len(v4_silent_now)}")
    v4_fired = [c for c in covers if c["v4_single_noun_prompt"]]
    extra = [c for c in v4_fired if c["subject_nouns_used_count"] > 1]
    A(f"  covers with a v4 noun prompt: {len(v4_fired)}")
    A(f"    of those, now carrying >=2 noun prompts (the flame/cello class): {len(extra)}")
    same_first = [c for c in v4_fired
                  if c["subject_noun_prompts"] and c["subject_noun_prompts"][0] == c["v4_single_noun_prompt"]]
    A(f"    of those, whose dyn-noun-1 equals the v4 noun: {len(same_first)}")
    A("")
    tags = collections.Counter(t for c in covers for t in c["dynamic_concepts"])
    with_dyn = [c for c in covers if c["dynamic_concepts"]]
    A(f"covers with >=1 dynamic concept: {len(with_dyn)} of {len(covers)}")
    for t in _TAG_ORDER:
        if tags.get(t):
            A(f"  {t:16s} {tags[t]:4d} covers")
    total = sum(len(c["dynamic_concepts"]) for c in covers)
    A(f"extra prompts total: {total} (mean {total / len(covers):.3f} per cover)")
    A(f"static prompts: {len(config.CONCEPT_PROMPTS)} (concept set v2.2)")
    A(f"total prompt-images: {len(covers) * len(config.CONCEPT_PROMPTS) + total}")
    return "\n".join(L)


def load(path: Path) -> dict[str, dict]:
    doc = json.loads(path.read_text())
    return {c["image_path"]: c for c in doc["covers"]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="dynamic-concepts-eval-142-v3.json",
                    help="filename under research/v3/data/sam/")
    args = ap.parse_args()
    table = derive()
    out_path = config.DATA_DIR / args.out
    out_path.write_text(json.dumps(table, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    print(summarize(table))
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

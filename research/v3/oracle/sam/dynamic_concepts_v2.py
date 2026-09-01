"""Per-cover DYNAMIC concept derivation, v2: the CLASS word AND the SPECIES noun.

CPU, deterministic, no model. Writes only under research/v3/data/sam/.

    .venv/bin/python dynamic_concepts_v2.py --out dynamic-concepts-eval-142-v2.json

WHY THERE IS A v2 AND WHY v1 IS NOT EDITED. `dynamic_concepts.py` produced the committed table
behind `sam-eval-142-v3-dynamic`, and RESIDUAL_EXPERIMENT_NOTES.md §3 is a record of exactly what
that table contained. Editing it in place would silently invalidate that record and make the v3
run unreproducible. So v2 is a separate module with its own rules version, and v1 stays frozen.

WHAT CHANGED, IN ONE LINE. v1 could only ask the CLASS word, because `subject_kind` is a closed
six-value enum and no oracle field on disk carried a free-form noun. That is the limit §3 named
and §5.2 measured: `"object"` was asked on 24 covers and returned **nothing at all on 22 of them,
even at the 0.3 capture floor**, because it is a grammatical category and not a thing-word. The
species noun now exists (`subject-noun.v1`, variant G), so v2 asks BOTH — which is what
PROBE5_NOTES.md §Granularity actually recommends:

    "the VLM emit BOTH — the specific noun it would use in a caption, and the `subject_kind`
     class it already emits — and the SAM stage run both as dynamic prompts, taking the species
     mask when it clears the cut and the class mask when it does not."

THE CLASS HALF IS UNCHANGED, DELIBERATELY. Every rule, mapping and phrasing for the class word is
copied from v1 verbatim, including the entry for `"object"` that v1 measured dead. Retiring it
would be the obvious economy and it is NOT taken here, because keeping it makes v4's prompt list a
strict superset of v3's: any cover that masks under v4 and did not under v3 is then attributable
to the noun alone, with no second change to argue about. Retiring `"object"` is a real follow-up
(RESIDUAL_EXPERIMENT_NOTES.md §10 item 2) and belongs to the round after this one.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

import common
import config
import dynamic_concepts as v1

# --------------------------------------------------------------------------- sources

# [MEASURED] The class half. Unchanged from v1: the group-BCDE pilot is still the only run on disk
# carrying `subject_kind`, and its E/F agreement is still the rule.
PILOT_PATH = v1.PILOT_PATH

# [MEASURED] The species half. `subject-noun.v1` variant G over the 142 included eval covers,
# 2026-08-03 — the run this module exists to consume.
NOUN_RUN_PATH = (config.REPO_ROOT / "research" / "v3" / "data" / "oracle-premise"
                 / "subject-noun-1.jsonl")

# [REVIEWED] The noun run ships ONE variant, so there is no inter-variant agreement signal for the
# noun and none is faked here. A G noun is a single reading; an E==F class word is a corroborated
# one. Both provenances are recorded per cover so no analysis can pool them by accident.
NOUN_VARIANT = "G"
NOUN_AGREEMENT_RULE = (
    "single_variant_no_agreement_signal — subject-noun.v1 ships variant G alone (a second variant "
    "is a second ~25-minute pass and the run's budget bought one). The class word keeps v1's "
    "E==F rule; the noun has no such check and must not be read as if it did.")

DERIVATION_RULES_VERSION = "sam-dynamic-concepts.v2"

# --------------------------------------------------------------------------- the noun tag

# [REVIEWED] ONE tag for the species noun, per cover, with the noun itself as the PROMPT STRING.
# The tag space stays closed (six `dyn-*` tags across v1 and v2) while the prompt space is open,
# which is what keeps `instances_by_concept`, the row key and every group lookup well-defined on a
# per-cover vocabulary. Like every `dyn-*` tag it is in no CONCEPT_GROUPS group, so
# `config.group_of()` returns None and it is cut at the POOLED threshold — never `text_like`'s
# raised cut. No mask-quality round has ever graded one of these prompts; the pooled cut is the
# honest default for a question nobody has calibrated.
NOUN_TAG = "dyn-noun"

# [REVIEWED] Alphabetical by tag, as in v1, so a cover's prompt list — and therefore its
# dynamic-set hash and its row key — is a pure function of its answers and never of dict order.
_TAG_ORDER = ("dyn-animal", "dyn-building", NOUN_TAG, "dyn-object", "dyn-vehicle", "dyn-watermark")

# --------------------------------------------------------------------------- normalization

# [REVIEWED] The literal escape the prompt specifies for "there is no thing on this cover". Free
# text has no `not_applicable`, so the prompt names one word and this is it. Anything matching it
# yields no noun and is counted, never guessed at.
NONE_ANSWERS = frozenset({"none", "nothing", "no subject", "n/a", "na", "not applicable", ""})

# [REVIEWED] PART NOUNS, BARRED. PROBE5_NOTES.md's one finding against the design: `eye` scores
# 0.87-0.92 on eyes that are 0.1% of a frame and **0.42 on a cover that IS an eye**, because a part
# noun makes a part detector — "the VLM must be instructed to name the whole depicted thing and
# never a part of it", and "the pipeline should treat part nouns as out of vocabulary rather than
# as a subject". The prompt forbids them; this is the belt to that braces, because the bar has to
# hold whether or not the model obeyed.
#
# EXACTLY THE FOUR PROBE 5 NAMES, and not one more. That round names `eye`, `hand` and "by
# inference `face`, `wing`", and then says in as many words: "the real list is the reviewer's
# call." Inventing a longer list here would be making that call silently. Everything else that
# looks like a part is FLAGGED and kept — see PART_NOUN_WATCHLIST.
PART_NOUNS_BARRED = ("eye", "hand", "face", "wing")

# [REVIEWED] Flagged, NOT barred. These read like parts of something larger, but no round has
# measured them and barring them would be exactly the reviewer's call this module refuses to make
# above. They are kept as prompts and listed in the derivation table so the reviewer can see the
# real candidate list rather than a list this module guessed. `skull` is deliberately ABSENT:
# probe 5 measured it as an object noun at 1.00/1.00, so it is a whole thing here.
PART_NOUN_WATCHLIST = (
    "hair", "head", "leg", "arm", "foot", "finger", "thumb", "mouth", "lip", "ear", "nose",
    "tooth", "beak", "feather", "tail", "horn", "paw", "claw", "fur", "skin", "torso",
    "shoulder", "neck", "chest", "back", "knee", "eyebrow", "eyelash", "fist", "palm",
    "roof", "door", "window", "wheel", "wall", "chimney", "branch", "leaf", "petal", "root",
)

# [REVIEWED] Static prompt strings under concept set v2.1. A species noun landing on one of these
# would ask SAM the identical question twice under two different tags — v1 records the same
# reasoning for why `person` maps to nothing ("a dynamic copy is the same question asked twice").
STATIC_PROMPT_STRINGS = frozenset(p for _, p in config.CONCEPT_PROMPTS)

# [REVIEWED] Articles and determiners the prompt forbids but a model may emit anyway.
_LEADING_ARTICLES = ("a ", "an ", "the ")

# [REVIEWED] Trivial singularization only, applied to the LAST word. "Where trivial" is the whole
# instruction: `-ies -> -y`, the `-es` families whose stem is unambiguous, and a bare trailing `-s`
# on a word that is not already an `-ss/-us/-is/-as/-os` ending. Anything else is left alone rather
# than mangled — turning "glass" into "glas" would be worse than leaving a plural in place, and SAM
# is not noticeably plural-sensitive (probe 5 masked eleven lotus petals from the noun "flower").
def _singularize(word: str) -> tuple[str, str | None]:
    """Returns (word, rule_applied_or_None)."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y", "plural_ies_to_y"
    for suffix in ("ses", "xes", "zes", "ches", "shes"):
        if len(word) > len(suffix) + 1 and word.endswith(suffix):
            return word[:-2], "plural_es_stripped"
    if (len(word) > 3 and word.endswith("s")
            and not word.endswith(("ss", "us", "is", "as", "os", "ys"))):
        return word[:-1], "plural_s_stripped"
    return word, None


def normalize_noun(raw: str) -> tuple[str, list[dict]]:
    """Lowercase, de-article, de-punctuate, trivially singularize. Every step is RECORDED.

    The table carries one entry per rule that actually fired, with the before and after value, so
    a reader can reconstruct the raw answer from the stored prompt without going back to the
    oracle run. Nothing here is lossy in secret.
    """
    steps: list[dict] = []
    value = raw

    stripped = value.strip()
    if stripped != value:
        steps.append({"rule": "strip_whitespace", "from": value, "to": stripped})
    value = stripped

    lowered = value.lower()
    if lowered != value:
        steps.append({"rule": "lowercase", "from": value, "to": lowered})
    value = lowered

    depunct = value.strip("\"'`.,;:!?()[]{}").strip()
    if depunct != value:
        steps.append({"rule": "strip_punctuation", "from": value, "to": depunct})
    value = depunct

    for article in _LEADING_ARTICLES:
        if value.startswith(article):
            after = value[len(article):].strip()
            steps.append({"rule": "drop_leading_article", "from": value, "to": after})
            value = after
            break

    collapsed = re.sub(r"\s+", " ", value)
    if collapsed != value:
        steps.append({"rule": "collapse_whitespace", "from": value, "to": collapsed})
    value = collapsed

    if value:
        words = value.split(" ")
        singular, rule = _singularize(words[-1])
        if rule is not None:
            after = " ".join(words[:-1] + [singular])
            steps.append({"rule": rule, "from": value, "to": after})
            value = after

    return value, steps


# --------------------------------------------------------------------------- noun source

def _noun_answers(path: Path = NOUN_RUN_PATH) -> dict[str, str]:
    """{image_path: raw noun} over the noun run's non-canary, ok, parsed rows.

    Canary rows are excluded for v1's reason: they are repeats of one cover inserted for drift
    detection, and counting a cover once per canary hit would weight it by how often the drift
    check ran.
    """
    out: dict[str, str] = {}
    for row in common.read_jsonl(path):
        if row.get("is_canary") or row.get("status") != "ok" or row.get("parse_failed"):
            continue
        if row.get("prompt_variant") != NOUN_VARIANT:
            continue
        parsed = row.get("parsed") or {}
        noun = parsed.get("subject_noun")
        if noun is None:
            continue
        image_path = row["image_path"]
        if image_path in out:
            raise RuntimeError(
                f"duplicate non-canary noun row for {image_path}; one row per cover is assumed")
        out[image_path] = noun
    return out


def classify_noun(raw: str | None, class_prompt: str | None) -> tuple[str | None, str, list[dict]]:
    """(prompt_or_None, disposition, normalization_steps).

    The dispositions are the whole audit trail for why a cover did or did not get a noun prompt,
    and every one of them is countable in the summary.
    """
    if raw is None:
        return None, "no_answer", []
    value, steps = normalize_noun(raw)
    if value in NONE_ANSWERS:
        return None, "none_answered", steps
    if not value:
        return None, "empty_after_normalization", steps
    if value in PART_NOUNS_BARRED:
        return None, "part_noun_barred", steps
    if value in STATIC_PROMPT_STRINGS:
        return None, "already_static", steps
    if class_prompt is not None and value == class_prompt:
        return None, "duplicate_of_class_word", steps
    return value, "used", steps


# --------------------------------------------------------------------------- derivation

def derive() -> dict:
    answers_by_path = v1._pilot_answers()
    nouns_by_path = _noun_answers()
    refs = common.eval_set_refs()

    covers = []
    for ref in refs:
        answers = answers_by_path.get(ref.rel_path, {})
        have_both = all(v in answers for v in v1.AGREEMENT_VARIANTS)

        # ---- the CLASS half: v1's rules, verbatim ----
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

        # ---- the SPECIES half: new in v2 ----
        #
        # NOT GATED ON THE CLASS ANSWER, and that is a deliberate difference from v1. Gating the
        # noun on `subject_kind` would reintroduce the closed enum this run exists to escape, and
        # would silence the noun on precisely the covers v1 could not prompt at all: the 10 where E
        # and F disagree, and the 2 `abstract_shape` covers. The prompt's own `none` escape is the
        # gate, answered by the model that is actually looking at the cover. The cost is that a
        # noun can be emitted on a cover the pilot calls `not_applicable`; the pilot's answer is
        # stored beside it on every row so that split is one field lookup away, and the guard-off
        # residual will say if it manufactured a mask.
        noun_raw = nouns_by_path.get(ref.rel_path)
        noun_prompt, noun_disposition, noun_steps = classify_noun(noun_raw, class_prompt)
        if noun_prompt is not None:
            prompts[NOUN_TAG] = noun_prompt
            provenance.append({"field": "subject_noun", "value": noun_raw, "tag": NOUN_TAG,
                               "prompt": noun_prompt, "half": "species",
                               "normalizations": noun_steps})
        else:
            provenance.append({"field": "subject_noun", "value": noun_raw, "tag": None,
                               "prompt": None, "half": "species", "reason": noun_disposition,
                               "normalizations": noun_steps})

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
        normalized_noun, _ = normalize_noun(noun_raw) if noun_raw is not None else (None, [])
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
            # the species half, fully auditable
            "subject_noun_raw": noun_raw,
            "subject_noun_normalized": normalized_noun,
            "subject_noun_prompt": noun_prompt,
            "subject_noun_disposition": noun_disposition,
            "subject_noun_normalizations": noun_steps,
            "subject_noun_on_watchlist": bool(
                normalized_noun is not None
                and normalized_noun.split(" ")[-1] in PART_NOUN_WATCHLIST),
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
            "noun_source_run": str(NOUN_RUN_PATH.relative_to(config.REPO_ROOT)),
            "noun_source_run_sha256": common.sha256_file(NOUN_RUN_PATH),
            "noun_variant": NOUN_VARIANT,
            "noun_agreement_rule": NOUN_AGREEMENT_RULE,
            "noun_tag": NOUN_TAG,
            "noun_gated_on_subject_kind": False,
            "part_nouns_barred": list(PART_NOUNS_BARRED),
            "part_noun_watchlist_flag_only": list(PART_NOUN_WATCHLIST),
            "eval_set": str(config.EVAL_SET_PATH.relative_to(config.REPO_ROOT)),
            "static_concept_set_hash": common.concept_set_hash(),
            "static_concepts": [c for c, _ in config.CONCEPT_PROMPTS],
            "subject_kind_mapping": {k: (list(v) if v else None)
                                     for k, v in v1.SUBJECT_KIND_MAPPING.items()},
            "overlay_mapping": {k: (list(v) if v else None)
                                for k, v in v1.OVERLAY_MAPPING.items()},
            "class_half_unchanged_from": v1.DERIVATION_RULES_VERSION,
        },
        "covers": covers,
    }


def summarize(table: dict) -> str:
    covers = table["covers"]
    L = []
    A = L.append
    A(f"covers: {len(covers)}")
    A(f"noun answers present: {sum(1 for c in covers if c['subject_noun_raw'] is not None)}")
    A("")
    A("species noun disposition:")
    disp = collections.Counter(c["subject_noun_disposition"] for c in covers)
    for k, n in disp.most_common():
        A(f"  {k:28s} {n:4d}")
    barred = [c for c in covers if c["subject_noun_disposition"] == "part_noun_barred"]
    if barred:
        A(f"  barred part nouns: {sorted(c['subject_noun_normalized'] for c in barred)}")
    watch = [c for c in covers if c["subject_noun_on_watchlist"]]
    A(f"  on the part-noun WATCHLIST (kept, flagged for the reviewer): {len(watch)}"
      + (f" -> {sorted({c['subject_noun_normalized'] for c in watch})}" if watch else ""))
    A("")
    used = [c for c in covers if c["subject_noun_prompt"]]
    distinct = sorted({c["subject_noun_prompt"] for c in used})
    A(f"distinct noun prompts: {len(distinct)} over {len(used)} covers")
    top = collections.Counter(c["subject_noun_prompt"] for c in used)
    A("  top 10: " + ", ".join(f"{w}x{n}" for w, n in top.most_common(10)))
    A("")
    A("normalizations applied:")
    rules = collections.Counter(s["rule"] for c in covers for s in c["subject_noun_normalizations"])
    for k, n in rules.most_common():
        A(f"  {k:28s} {n:4d}")
    if not rules:
        A("  (none)")
    A("")
    A("noun vs the pilot's agreed subject_kind (the gate v2 deliberately does NOT apply):")
    grid = collections.Counter(
        (str(c["subject_kind_agreed"]), c["subject_noun_disposition"] == "used") for c in covers)
    for (kind, used_flag), n in sorted(grid.items(), key=lambda kv: (-kv[1], kv[0])):
        A(f"  subject_kind {kind:24s} noun_used={str(used_flag):5s} {n:4d}")
    A("")
    tags = collections.Counter(t for c in covers for t in c["dynamic_concepts"])
    with_dyn = [c for c in covers if c["dynamic_concepts"]]
    A(f"covers with >=1 dynamic concept: {len(with_dyn)} of {len(covers)}")
    for t, n in sorted(tags.items()):
        A(f"  {t:16s} {n:4d} covers")
    total = sum(len(c["dynamic_concepts"]) for c in covers)
    A(f"extra prompts total: {total} (mean {total / len(covers):.3f} per cover)")
    return "\n".join(L)


def load(path: Path) -> dict[str, dict]:
    doc = json.loads(path.read_text())
    return {c["image_path"]: c for c in doc["covers"]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="dynamic-concepts-eval-142-v2.json",
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

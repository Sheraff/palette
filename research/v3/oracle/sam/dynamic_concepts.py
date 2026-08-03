"""Per-cover DYNAMIC concept derivation: the VLM's own answers -> SAM prompt phrasings.

The residual-isolation experiment (reviewer decision R-3) asks whether subtracting every mask
leaves a residual that is cleanly the background. The static concept set v2.1 knows about text,
marks, people and faces; it knows nothing about a car, a dog or a cathedral. §D.1 of
ORACLE_QUESTION_SET.md is the answer to that:

    SAM masks nouns it is given. The VLM is the thing that knows which noun to give it.

This module turns the pilot's stored answers into that noun list, deterministically, on CPU.
It imports no model and writes only under research/v3/data/sam/.

    .venv/bin/python dynamic_concepts.py --out dynamic-concepts-eval-142.json

WHAT THIS DERIVATION CANNOT DO, stated first because it bounds every number downstream.
PROBE5_NOTES.md §"Granularity" recommends a DUAL prompt per cover: the species/artefact noun the
VLM would use in a caption ("dalmatian", "cognac bottle"), plus the `subject_kind` class word as a
fallback. **Only the class word exists in the data.** `subject_kind` is a six-value closed enum
(§D.1) and no field in `group-bcde.v1` — or in any oracle run on disk — carries a free-form noun.
So this run tests the CLASS half of the dual prompt and nothing else. The species half needs a new
VLM question, and until it exists probe 5's 0.858-median species evidence does not transfer to
these prompts. That is a limit of the available answers, not a finding about SAM.
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import common
import config

# --------------------------------------------------------------------------- source

# [MEASURED] The group-BCDE pilot, 2026-08-03: 299 rows, 142 unique covers x variants E and F,
# plus 15 canary repeats. It is the only run on disk carrying `subject_kind`.
PILOT_PATH = config.REPO_ROOT / "research" / "v3" / "data" / "oracle-premise" / "group-bcde-pilot-1.jsonl"

# [REVIEWED] The agreement rule the task pre-registers: use an answer only where prompt variants
# E and F agree. Two independent phrasings of the same question landing on the same value is the
# cheapest available proxy for "this answer is not an artefact of how it was asked". A cover where
# they disagree gets NO dynamic concept — it is not guessed, and it is counted.
AGREEMENT_VARIANTS = ("E", "F")

# [REVIEWED] Multi-select fields (`overlays`, `text_roles`) cannot use equality: two variants can
# agree about a watermark and disagree about a barcode. The rule is set INTERSECTION — a value
# counts as agreed when both variants emitted it. Strictly weaker than equality, and it is the
# same "both said so" test applied per value.
MULTI_SELECT_RULE = "intersection"

# Bump when any rule in this file changes. Stored in the table and in every run row, so a reader
# can tell which derivation produced a prompt list without diffing this file.
DERIVATION_RULES_VERSION = "sam-dynamic-concepts.v1"

# --------------------------------------------------------------------------- the mapping

# [REVIEWED] `subject_kind` value -> (stored tag, prompt string), or None for deliberately unmapped.
# Every entry carries its own evidence; the tags are prefixed `dyn-` so they can never collide with
# a static concept tag and so `config.group_of()` returns None for them — a dynamic concept belongs
# to no calibrated group and is cut at the pooled threshold, which is the honest default for a
# prompt no mask-quality round has ever seen.
#
#   person                -> ALREADY STATIC. "person" is CONCEPT_PROMPTS' own prompt string, so a
#                            dynamic copy would be the identical question asked twice, doubling the
#                            cost and changing nothing. Recorded as `already_static`, not as a hit:
#                            on these covers dynamic prompting is a measured no-op.
#   animal                -> "animal". UNTESTED as a prompt. Probe 5 measured six species
#                            (dog/cat/bird/horse/wolf/snake, 0.89 prec / 0.89 rec) and never the
#                            class word. This run is its first measurement.
#   vehicle               -> "vehicle". Probe 4 ran it as a hypernym beside `car` and it worked,
#                            picking up one loose full-width box that `car` did not — so it fires,
#                            with a known looseness.
#   object                -> "object". UNTESTED, and the weakest entry here by design: probe 5's
#                            eight object nouns were all artefact-level (guitar, skull, bottle...)
#                            and "object" is a degree more abstract than any class word measured.
#                            It is included because leaving the corpus's second-largest subject
#                            class unprompted would make the residual comparison meaningless, and
#                            excluded from nothing: if it returns junk, the guard-off residual will
#                            say so.
#   building_or_structure -> "building". The best-evidenced entry: probe 5 measured precision 1.00
#                            over five structures of five kinds (skyscrapers, temple roofs,
#                            apartment blocks, a castle, a church) with zero false positives, and
#                            called it "a genuine hypernym".
#   abstract_shape        -> DELIBERATELY UNMAPPED. There is no noun to give SAM. Probe 3 measured
#                            the whole attributive/abstract family ("colorful accent", "bright
#                            spot", "the most prominent object") dead with this model, and an
#                            abstract shape is exactly what has no thing-word. Prompting it would
#                            manufacture a mask, and this experiment's failure mode is a residual
#                            polluted by masks that should not exist.
#   not_applicable        -> nothing. The cover has no dominant subject.
SUBJECT_KIND_MAPPING: dict[str, tuple[str, str] | None] = {
    "person": None,                                  # already static
    "animal": ("dyn-animal", "animal"),
    "vehicle": ("dyn-vehicle", "vehicle"),
    "object": ("dyn-object", "object"),
    "building_or_structure": ("dyn-building", "building"),
    "abstract_shape": None,                          # deliberately unmapped
    "not_applicable": None,
}

# [REVIEWED] Why `person` and `abstract_shape` both map to None but mean opposite things, kept
# separate in the table so the two are never pooled into one "no dynamic concept" bucket.
SUBJECT_KIND_NULL_REASON: dict[str, str] = {
    "person": "already_static",
    "abstract_shape": "unmapped_no_noun",
    "not_applicable": "no_subject",
}

# [REVIEWED] `overlays` value -> (stored tag, prompt string) or None. Three of the five values are
# already static concepts under concept set v2.1 and are recorded as such rather than re-asked:
# `label_logo` is `emblem`/"logo", `parental_advisory` is `parental-advisory`/"parental advisory",
# `barcode_or_price` is `barcode`/"barcode".
#
#   watermark -> "watermark". THE ONE GENUINELY NEW MARK CONCEPT. It is in the VLM's vocabulary and
#                not in SAM's static set, so today a watermark can only ever land in the residual
#                and be scored as background. 21 of 299 pilot answers name one. Untested as a SAM
#                prompt; this run measures it.
OVERLAY_MAPPING: dict[str, tuple[str, str] | None] = {
    "none": None,
    "label_logo": None,                              # already static: emblem
    "parental_advisory": None,                       # already static: parental-advisory
    "barcode_or_price": None,                        # already static: barcode
    "watermark": ("dyn-watermark", "watermark"),
}

OVERLAY_NULL_REASON: dict[str, str] = {
    "none": "no_overlay",
    "label_logo": "already_static",
    "parental_advisory": "already_static",
    "barcode_or_price": "already_static",
}

# [REVIEWED] Order is fixed and alphabetical-by-tag within source field, subject before overlay, so
# a cover's prompt list — and therefore its dynamic-set hash and its row key — is a pure function of
# its agreed answers and never of dict iteration order.
_TAG_ORDER = ("dyn-animal", "dyn-building", "dyn-object", "dyn-vehicle", "dyn-watermark")


def dynamic_set_hash(prompts: tuple[tuple[str, str], ...]) -> str:
    """Identity of ONE cover's dynamic prompt list.

    Deliberately not folded into `common.concept_set_hash()`. PROBE5_NOTES.md says it plainly:
    a per-cover prompt makes the effective question set per-cover, so the row identity needs a
    separate field rather than a hash whose meaning silently changes per image. The static hash
    keeps meaning exactly what it always meant; this one names the addition.
    """
    payload = json.dumps(list(prompts), separators=(",", ":"))
    return common.sha256_bytes(payload.encode("utf-8"))


# --------------------------------------------------------------------------- derivation

def _pilot_answers(path: Path = PILOT_PATH) -> dict[str, dict[str, dict]]:
    """{image_path: {variant: parsed}} over the pilot's non-canary, parsed, ok rows.

    Canary rows are excluded: they are repeats of one cover inserted for drift detection (§5.3),
    and counting a cover once per canary hit would weight it by how often the drift check ran.
    """
    out: dict[str, dict[str, dict]] = collections.defaultdict(dict)
    for row in common.read_jsonl(path):
        if row.get("is_canary") or row.get("status") != "ok" or row.get("parse_failed"):
            continue
        variant = row.get("prompt_variant")
        if variant not in AGREEMENT_VARIANTS:
            continue
        image_path = row["image_path"]
        if variant in out[image_path]:
            raise RuntimeError(
                f"duplicate non-canary answer for {image_path} variant {variant}; the agreement "
                f"rule assumes exactly one row per (cover, variant)")
        out[image_path][variant] = row["parsed"] or {}
    return dict(out)


def _agreed_single(answers: dict[str, dict], field: str) -> str | None:
    """The value both variants gave, or None if they disagree or one is missing."""
    values = {v: answers[v].get(field) for v in AGREEMENT_VARIANTS if v in answers}
    if len(values) != len(AGREEMENT_VARIANTS):
        return None
    distinct = set(values.values())
    return distinct.pop() if len(distinct) == 1 else None


def _agreed_multi(answers: dict[str, dict], field: str) -> list[str] | None:
    """The values BOTH variants emitted (set intersection), sorted. None if a variant is missing."""
    sets = []
    for v in AGREEMENT_VARIANTS:
        if v not in answers:
            return None
        sets.append(set(answers[v].get(field) or []))
    return sorted(set.intersection(*sets))


def derive() -> dict:
    """The full committed table: cover -> agreed answers -> nouns -> prompt phrasings."""
    answers_by_path = _pilot_answers()
    refs = common.eval_set_refs()

    covers = []
    for ref in refs:
        answers = answers_by_path.get(ref.rel_path, {})
        have_both = all(v in answers for v in AGREEMENT_VARIANTS)

        subject_raw = {v: answers.get(v, {}).get("subject_kind") for v in AGREEMENT_VARIANTS}
        subject = _agreed_single(answers, "subject_kind") if have_both else None
        overlays_raw = {v: sorted(answers.get(v, {}).get("overlays") or [])
                        for v in AGREEMENT_VARIANTS}
        overlays = _agreed_multi(answers, "overlays") if have_both else None

        prompts: dict[str, str] = {}
        provenance: list[dict] = []

        if subject is not None:
            mapped = SUBJECT_KIND_MAPPING.get(subject)
            if mapped is not None:
                prompts[mapped[0]] = mapped[1]
                provenance.append({"field": "subject_kind", "value": subject,
                                   "tag": mapped[0], "prompt": mapped[1]})
            else:
                provenance.append({"field": "subject_kind", "value": subject, "tag": None,
                                   "prompt": None,
                                   "reason": SUBJECT_KIND_NULL_REASON.get(subject, "unmapped")})
        else:
            provenance.append({"field": "subject_kind", "value": None, "tag": None, "prompt": None,
                               "reason": "variants_disagree" if have_both else "no_answer"})

        for value in (overlays or []):
            mapped = OVERLAY_MAPPING.get(value)
            if mapped is not None:
                prompts[mapped[0]] = mapped[1]
                provenance.append({"field": "overlays", "value": value,
                                   "tag": mapped[0], "prompt": mapped[1]})
            else:
                provenance.append({"field": "overlays", "value": value, "tag": None,
                                   "prompt": None,
                                   "reason": OVERLAY_NULL_REASON.get(value, "unmapped")})
        if overlays is None:
            provenance.append({"field": "overlays", "value": None, "tag": None, "prompt": None,
                               "reason": "variants_disagree" if have_both else "no_answer"})

        ordered = tuple((tag, prompts[tag]) for tag in _TAG_ORDER if tag in prompts)
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
            "dynamic_concepts": [t for t, _ in ordered],
            "dynamic_prompts": [list(p) for p in ordered],
            "dynamic_set_hash": dynamic_set_hash(ordered),
            "derivation": provenance,
        })

    return {
        "meta": {
            "rules_version": DERIVATION_RULES_VERSION,
            "generated_at": common.utc_now(),
            "git_head": common.git_head(),
            "source_run": str(PILOT_PATH.relative_to(config.REPO_ROOT)),
            "source_run_sha256": common.sha256_file(PILOT_PATH),
            "eval_set": str(config.EVAL_SET_PATH.relative_to(config.REPO_ROOT)),
            "agreement_variants": list(AGREEMENT_VARIANTS),
            "multi_select_rule": MULTI_SELECT_RULE,
            "static_concept_set_hash": common.concept_set_hash(),
            "static_concepts": [c for c, _ in config.CONCEPT_PROMPTS],
            "subject_kind_mapping": {k: (list(v) if v else None)
                                     for k, v in SUBJECT_KIND_MAPPING.items()},
            "overlay_mapping": {k: (list(v) if v else None)
                                for k, v in OVERLAY_MAPPING.items()},
            "species_half_unavailable": (
                "PROBE5 recommends species noun + class noun. `subject_kind` is a closed six-value "
                "enum and no oracle field on disk carries a free-form noun, so only the class half "
                "is derivable. Every dynamic prompt below is a class word."),
        },
        "covers": covers,
    }


def summarize(table: dict) -> str:
    covers = table["covers"]
    lines = [f"covers: {len(covers)}"]
    lines.append(f"pilot answers present (both variants): "
                 f"{sum(1 for c in covers if c['pilot_answer_present'])}")
    agreed = sum(1 for c in covers if c["subject_kind_agreed"] is not None)
    lines.append(f"subject_kind agreed E==F: {agreed} "
                 f"({len(covers) - agreed} disagree -> no dynamic subject)")
    kinds = collections.Counter(c["subject_kind_agreed"] for c in covers)
    for k, n in sorted(kinds.items(), key=lambda kv: (-kv[1], str(kv[0]))):
        mapped = SUBJECT_KIND_MAPPING.get(k) if k else None
        note = f"-> {mapped[1]!r}" if mapped else f"-> none ({SUBJECT_KIND_NULL_REASON.get(k, 'disagree')})"
        lines.append(f"  subject_kind {str(k):24s} {n:4d}  {note}")
    ovl = collections.Counter(v for c in covers for v in (c["overlays_agreed"] or []))
    for k, n in sorted(ovl.items(), key=lambda kv: (-kv[1], kv[0])):
        mapped = OVERLAY_MAPPING.get(k)
        note = f"-> {mapped[1]!r}" if mapped else f"-> none ({OVERLAY_NULL_REASON.get(k, 'unmapped')})"
        lines.append(f"  overlay      {k:24s} {n:4d}  {note}")
    with_dyn = [c for c in covers if c["dynamic_concepts"]]
    lines.append(f"covers with >=1 dynamic concept: {len(with_dyn)} of {len(covers)}")
    tags = collections.Counter(t for c in covers for t in c["dynamic_concepts"])
    for t, n in sorted(tags.items()):
        lines.append(f"  {t:16s} {n:4d} covers")
    total_prompts = sum(len(c["dynamic_concepts"]) for c in covers)
    lines.append(f"extra prompts total: {total_prompts} "
                 f"(mean {total_prompts / len(covers):.3f} per cover)")
    return "\n".join(lines)


def load(path: Path) -> dict[str, dict]:
    """{image_path: cover record} from a written table, for the runner and the analysis."""
    doc = json.loads(path.read_text())
    return {c["image_path"]: c for c in doc["covers"]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="dynamic-concepts-eval-142.json",
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

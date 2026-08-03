"""Health analysis for the `group-bcde.v1` pilot — the thirteen B/C/D/E questions.

    .venv/bin/python analyze_bcde.py [--results <pilot.jsonl>] [--sam <sam.jsonl>] [--out <report.json>]

WHAT THIS IS, AND WHAT IT IS NOT
There is no ground truth of any kind for these thirteen questions (PREMISE_NEXT.md §15.9).
Nothing here is an accuracy number and nothing here may be quoted as one. Every metric is a
statement about the INSTRUMENT: does it parse, does each question find an answer, does the
schema contradict itself, and do two renderings of the same question agree with each other.

WHY THIS FILE DID NOT EXIST BEFORE THE RUN
§15.5: "Analysis is not yet built, and deliberately so ... to be built against the run's rows
once they exist and never before, so it cannot be shaped by them." The metrics were therefore
pre-registered in §15.6 (parse rate, distribution degeneracy, the gate-contradiction table),
§15.7 (inter-variant agreement per question) and §15.4 (the `not_applicable` /
`illegible_at_this_size` rates by resolution tier). This script implements those and nothing
else. Where §15 is ambiguous the reading taken is recorded in the report's `ambiguities` block
rather than resolved silently.

THE ONE EXTERNAL INPUT
`data/sam/sam-eval-142-v2.jsonl` — the same 142 images, masked by SAM. It supplies the
cross-instrument check in contradiction 11 (typography_only with no readable text) from the
other side: the VLM's text answer against SAM's text masks. Disagreement between two
instruments is reported as a disagreement count, never as either instrument being right.

Pure CPU, standard library only, no model, no GPU, no network.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze import tier_of  # noqa: E402  (the reviewed resolution strata, reused not re-derived)
from common import DATA_DIR, MAX_TOKENS, PROMPTS_DIR, load_prompt_variant, read_jsonl  # noqa: E402

# DATA_DIR is research/v3/data/oracle-premise; the SAM workstream's data sits beside it.
SAM_PATH_DEFAULT = DATA_DIR.parent / "sam" / "sam-eval-142-v2.jsonl"
RESULTS_PATH_DEFAULT = DATA_DIR / "group-bcde-pilot-1.jsonl"
OUT_PATH_DEFAULT = DATA_DIR / "bcde-pilot-1-analysis.json"

# ---------------------------------------------------------------- identity

# [REVIEWED] PREMISE_NEXT.md §15.2 "File identity". A row whose prompt_hash is not one of
# these was produced by a different rendering of the questions and cannot be pooled with them.
EXPECTED_PROMPT_HASHES: dict[str, str] = {
    "E": "1cbd4894e8b2f118ebfe47557afbda309e62a5479b7278b130fa03a7612d7a1f",
    "F": "3a50829af99684eb3b11642ad7df9c1e99d165df9a350033b28113583c3e6891",
}
# [REVIEWED] Same table, schema side.
EXPECTED_SCHEMA_HASHES: dict[str, str] = {
    "E": "b169bc565982ad5b961285cf92e80d643bdc2810f3cbbde49d31d8f11eea130c",
    "F": "9386abfb170b6465339f96ec8dbb48322d8fc8906da7674c2f1c11b58996ee21",
}
# [REVIEWED] §15.5: the full eval set, 142 images x 2 variants.
EXPECTED_IMAGES = 142
EXPECTED_VARIANTS = ("E", "F")

# ---------------------------------------------------------------- §15.6-1 parse rate bars

# [REVIEWED] §15.6 metric 1, verbatim.
BAR_OK_RATE = 0.99
BAR_PARSE_FAILED = 0
BAR_ATTEMPTS_GT_1 = 0
# [UNCALIBRATED] §15.6 asks for "generation_tokens at or near MAX_TOKENS: 0" and gives no
# number for "near". Taken as within 10% of the cap, i.e. >= 230 of 256. The observed maximum
# is reported alongside so the bar's exact placement cannot hide a near miss.
NEAR_MAX_TOKENS_FRACTION = 0.90
NEAR_MAX_TOKENS = int(MAX_TOKENS * NEAR_MAX_TOKENS_FRACTION)
# [REVIEWED] §15.6 metric 1: "Below 95% ok, stop and read raw_text."
BAR_OK_RATE_STOP = 0.95

# ---------------------------------------------------------------- §15.6-2 distribution bars

# [REVIEWED] §15.6 metric 2(a): questions where a skewed corpus is genuinely plausible, so the
# bar is on the minority cells rather than on the modal share.
SKEW_PLAUSIBLE_FIELDS = ("has_text", "physical_media_scan", "overlays", "grain_or_noise")
# [REVIEWED] §15.6 metric 2(b): questions where the corpus should genuinely spread.
SPREAD_EXPECTED_FIELDS = ("text_roles", "text_dominance", "has_dominant_subject", "subject_kind",
                          "subject_area_band", "has_signature_color", "signature_carrier",
                          "medium", "color_character")
# [REVIEWED] §15.6 metric 2(b), the probe arm's non-degeneracy bar: no single value on more
# than 85% of rows.
NON_DEGENERACY_BAR = 0.85
# [UNCALIBRATED] §15.6 metric 2(a) priors, stated in the doc as priors and not measurements.
# Each is "what would be alarming", so each is a flag, not a pass/fail of the schema.
ALARM_HAS_TEXT_YES_FLOOR = 0.60
ALARM_PHYSICAL_MEDIA_SCAN_CEILING = 0.15
ALARM_GRAIN_OR_NOISE_CEILING = 0.60

# ---------------------------------------------------------------- §15.6-3 contradictions

# [REVIEWED] §15.4: the value that is exclusive of every other value in each multi-select.
# `text_roles` -> not_applicable ("no kind of text can be named"); `overlays` -> none
# ("nothing has been added on top"). Either beside another value is contradiction 7.
EXCLUSIVE_MULTI_SELECT_VALUES: dict[str, str] = {
    "text_roles": "not_applicable",
    "overlays": "none",
}
# [REVIEWED] §15.6 metric 3: "Pre-registered ceiling: total contradiction rate <= 10% of ok rows."
CONTRADICTION_CEILING = 0.10
# Reporting aid only, no bar attached: how many example artworks to name per contradiction.
EXAMPLES_PER_CONTRADICTION = 6

# ---------------------------------------------------------------- §15.7 agreement bars

# [REVIEWED] §15.7 "Pre-registered bars", calibrated there against group A's own fields
# (`enclosure` raw 0.87 / kappa 0.60 best, `field_texture` raw 0.66 / kappa 0.45 worst).
KAPPA_BARS: dict[str, float] = {
    "has_text": 0.70,
    "physical_media_scan": 0.70,
    "medium": 0.70,
    "has_dominant_subject": 0.45,
    "has_signature_color": 0.45,
    "text_dominance": 0.45,
    "subject_area_band": 0.45,
    "color_character": 0.45,
    "grain_or_noise": 0.45,
    "subject_kind": 0.60,        # on the has_dominant_subject != none subset, with its n
    "signature_carrier": 0.45,   # on the has_signature_color == yes subset, with its n
}
# [REVIEWED] §15.7, the two multi-selects: three numbers, not one.
BAR_EXACT_SET_AGREEMENT = 0.60
BAR_MEAN_JACCARD = 0.75
BAR_PER_VALUE_KAPPA_FLOOR = 0.40
# [REVIEWED] §15.8 "Order dominating everything": E and F disagreeing on more than ~35% of
# rows on most questions means the answers come from the prompt's shape, not the artwork.
ORDER_DOMINATION_DISAGREEMENT = 0.35

# ---------------------------------------------------------------- gates and conditionals

# [REVIEWED] §15.4: the five fields that carry a `not_applicable` because a fixed JSON schema
# cannot make a field conditional, and the gate each one hangs from.
CONDITIONAL_FIELDS: dict[str, str] = {
    "text_roles": "has_text",
    "text_dominance": "has_text",
    "subject_kind": "has_dominant_subject",
    "subject_area_band": "has_dominant_subject",
    "signature_carrier": "has_signature_color",
}
# [REVIEWED] §15.4: `has_text`'s `illegible_at_this_size` is the only resolution escape hatch
# anywhere in groups B-E, and no resolution floor has ever been measured for these questions.
RESOLUTION_ESCAPE_VALUE = "illegible_at_this_size"
NOT_APPLICABLE = "not_applicable"

# ---------------------------------------------------------------- SAM cross-instrument

# [INHERITED] research/v3/oracle/sam/config.py CONCEPT_GROUPS["text_like"], concept set v2.
# The four concepts whose masks are display typography; `emblem`/`sticker`/`parental-advisory`
# are deliberately NOT here (they are mark_like), so a parental-advisory badge cannot make a
# cover look like it carries readable text.
SAM_TEXT_LIKE_CONCEPTS = ("words", "letter", "lettering", "display-text")
# [REVIEWED] research/v3/oracle/sam/config.py CALIBRATED_SCORE_THRESHOLD — the cut the
# reviewer's 60-mask round calibrated (precision 91%, recall 69%). Stored rows keep the low
# run-time cut of 0.3, and config.py says plainly that consumers should filter at this one.
SAM_CALIBRATED_SCORE_THRESHOLD = 0.578
# [UNCALIBRATED] §15.6 contradiction 11 names no magnitude for "SAM found text". Two readings
# are reported side by side rather than one being chosen: ANY surviving text-like mask, and a
# stricter three-or-more. Text concepts posted 100% reviewer yes-rates at the calibrated cut
# (data/sam/MASK_REVIEW_NOTES.md), which is why ANY is the headline and the stricter count is
# the sensitivity check.
SAM_STRONG_TEXT_MIN_REGIONS = 3
# [REVIEWED] Pipeline §8.3's fixed, hand-written concept union — the reason `subject_kind`
# exists at all (§15.1). A named noun outside this set is a noun the fixed union cannot find,
# which is the SAM workstream's whole question. Mapped from the concept set v2 actually run.
SUBJECT_KINDS_INSIDE_FIXED_UNION = ("person",)
SUBJECT_KINDS_OUTSIDE_FIXED_UNION = ("animal", "vehicle", "object", "building_or_structure",
                                     "abstract_shape")


# ---------------------------------------------------------------- small statistics


def pct(n: int, d: int) -> float | None:
    return None if not d else round(n / d, 4)


def dist(values) -> dict:
    c = Counter(values)
    return {str(k): v for k, v in sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0])))}


def cohens_kappa(pairs: list[tuple[str, str]]) -> tuple[float | None, float | None, str | None]:
    """Multi-class Cohen's kappa for two raters (here: two prompt renderings) over the same
    items. Returned with raw agreement and never quoted without it: §15.7 is explicit that a
    field where one value dominates can post 0.90 raw at kappa 0.0, which is the arithmetic of
    a near-constant rather than a good field."""
    n = len(pairs)
    if n == 0:
        return None, None, "no rows"
    observed = sum(1 for a, b in pairs if a == b) / n
    a_marg = Counter(a for a, _ in pairs)
    b_marg = Counter(b for _, b in pairs)
    expected = sum((a_marg[k] / n) * (b_marg[k] / n) for k in set(a_marg) | set(b_marg))
    if expected >= 1.0:
        # Both raters constant on the same single value: kappa is undefined, and saying so is
        # the honest answer. This is exactly the §15.6-(2) degeneracy signature.
        return round(observed, 4), None, "kappa undefined: both variants constant on one value"
    return round(observed, 4), round((observed - expected) / (1 - expected), 4), None


def jaccard(a: set[str], b: set[str]) -> float:
    """|A n B| / |A u B|, duplicate-insensitive. Two empty sets cannot happen here (both
    multi-selects have minItems 1) but are defined as full agreement rather than a crash."""
    union = a | b
    return (len(a & b) / len(union)) if union else 1.0


# ---------------------------------------------------------------- prompt text (stems)

STEM_RE = re.compile(r"^\s*\d+\.\s+(\w+)\s+-\s+(.*)$")
VALUE_RE = re.compile(r"^\s{2,}(\w+)\s+-\s+(.*)$")


def parse_stems(prompt_text: str, field_map: dict[str, str]) -> dict[str, dict]:
    """Pull each question's stem and each value's gloss out of the prompt itself, keyed by the
    canonical field name. §15.6-(2a) requires a zero-firing value to be reported WITH ITS STEM
    quoted, and the stem that matters is the exact wording the model answered under — so it is
    read from the prompt file rather than restated here."""
    out: dict[str, dict] = {}
    current: str | None = None
    for line in prompt_text.splitlines():
        m = STEM_RE.match(line)
        if m and m.group(1) in field_map:
            current = field_map[m.group(1)]
            out[current] = {"prompt_key": m.group(1), "stem": m.group(2).strip(), "values": {}}
            continue
        m = VALUE_RE.match(line)
        if m and current:
            out[current]["values"][m.group(1)] = m.group(2).strip()
    return out


# ---------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, default=RESULTS_PATH_DEFAULT)
    parser.add_argument("--sam", type=Path, default=SAM_PATH_DEFAULT)
    parser.add_argument("--out", type=Path, default=OUT_PATH_DEFAULT)
    args = parser.parse_args()

    all_rows = read_jsonl(args.results)
    canary_rows = [r for r in all_rows if r.get("is_canary")]
    rows = [r for r in all_rows if not r.get("is_canary")]
    ok = [r for r in rows if r.get("status") == "ok" and r.get("parsed") and not r.get("parse_failed")]

    variants_e = load_prompt_variant(PROMPTS_DIR / "group-bcde.v1.variant-e.json", "group-bcde.v1")
    variants_f = load_prompt_variant(PROMPTS_DIR / "group-bcde.v1.variant-f.json", "group-bcde.v1")
    prompt_variants = {"E": variants_e, "F": variants_f}
    fields = list(variants_e.canonical_fields)
    vocabularies = {f: list(variants_e.vocabularies[f]) for f in fields}
    multi_select = list(variants_e.multi_select_fields)
    single_value = [f for f in fields if f not in multi_select]
    stems = {v: parse_stems(pv.prompt, pv.field_map) for v, pv in prompt_variants.items()}

    verdicts: list[dict] = []

    def verdict(vid: str, section: str, bar: str, observed, passed: bool | None) -> None:
        verdicts.append({"id": vid, "section": section, "bar": bar, "observed": observed,
                         "verdict": "report_only" if passed is None else ("pass" if passed else "FAIL")})

    # ---- index --------------------------------------------------------------------
    by_image: dict[str, dict[str, dict]] = defaultdict(dict)
    meta: dict[str, dict] = {}
    for r in ok:
        by_image[r["image_sha256"]][r["prompt_variant"]] = r["parsed"]
        meta[r["image_sha256"]] = {
            "artwork_id": r["artwork_id"],
            "image_path": r["image_path"],
            "tier": tier_of(r["source_long_edge_px"]),
            "source_long_edge_px": r["source_long_edge_px"],
            "processed_long_edge_px": r["processed_long_edge_px"],
        }
    images = sorted(by_image)
    paired = [s for s in images if all(v in by_image[s] for v in EXPECTED_VARIANTS)]
    tiers = sorted({meta[s]["tier"] for s in images})

    def rows_of(variant: str | None = None) -> list[dict]:
        if variant is None:
            return [by_image[s][v] for s in images for v in sorted(by_image[s])]
        return [by_image[s][variant] for s in images if variant in by_image[s]]

    # ================================================================ §15.6-1 parse rate
    ok_rate = pct(len(ok), len(rows))
    max_tokens_seen = max((r.get("generation_tokens") or 0) for r in all_rows)
    near_cap = [r["row_key"] for r in all_rows if (r.get("generation_tokens") or 0) >= NEAR_MAX_TOKENS]
    parse_failed = sum(1 for r in rows if r.get("parse_failed"))
    attempts_gt_1 = sum(1 for r in rows if (r.get("attempts") or 1) > 1)
    failed_status = sum(1 for r in rows if r.get("status") != "ok")

    prompt_hash_ok = all(
        {r["prompt_hash"] for r in all_rows if r["prompt_variant"] == v} == {EXPECTED_PROMPT_HASHES[v]}
        for v in EXPECTED_VARIANTS)
    schema_hash_ok = all(
        {r["schema_hash"] for r in all_rows if r["prompt_variant"] == v} == {EXPECTED_SCHEMA_HASHES[v]}
        for v in EXPECTED_VARIANTS)
    files_match_rows = all(prompt_variants[v].prompt_hash == EXPECTED_PROMPT_HASHES[v]
                           and prompt_variants[v].schema_hash == EXPECTED_SCHEMA_HASHES[v]
                           for v in EXPECTED_VARIANTS)

    parse_block = {
        "rows_total_including_canaries": len(all_rows),
        "rows": len(rows),
        "ok": len(ok),
        "ok_rate": ok_rate,
        "status_not_ok": failed_status,
        "parse_failed": parse_failed,
        "attempts_gt_1": attempts_gt_1,
        "max_generation_tokens": max_tokens_seen,
        "max_tokens_cap": MAX_TOKENS,
        "rows_at_or_near_cap": len(near_cap),
        "near_cap_threshold_tokens": NEAR_MAX_TOKENS,
        "images": len(images),
        "images_with_both_variants": len(paired),
        "rows_by_variant": dist(r["prompt_variant"] for r in rows),
        "constrained_decoding": sorted({bool(r.get("constrained_decoding")) for r in all_rows}),
        "prompt_hashes_match_section_15_2": prompt_hash_ok,
        "schema_hashes_match_section_15_2": schema_hash_ok,
        "prompt_files_on_disk_match_section_15_2": files_match_rows,
        "model_revisions": sorted({r.get("model_revision", "?") for r in all_rows}),
        "run_ids": sorted({r.get("run_id", "?") for r in all_rows}),
        "canary": {
            "rows": len(canary_rows),
            "variants": dist(r["prompt_variant"] for r in canary_rows),
            "distinct_raw_texts": len({r.get("raw_text", "") for r in canary_rows}),
            "stable": len({r.get("raw_text", "") for r in canary_rows}) <= 1,
        },
        "tiers": {t: sum(1 for s in images if meta[s]["tier"] == t) for t in tiers},
    }
    verdict("15.6-1.ok_rate", "15.6-1", f"status ok >= {BAR_OK_RATE:.0%}", ok_rate,
            ok_rate is not None and ok_rate >= BAR_OK_RATE)
    verdict("15.6-1.parse_failed", "15.6-1", "parse_failed == 0", parse_failed, parse_failed == BAR_PARSE_FAILED)
    verdict("15.6-1.attempts", "15.6-1", "attempts > 1 == 0", attempts_gt_1, attempts_gt_1 == BAR_ATTEMPTS_GT_1)
    verdict("15.6-1.token_cap", "15.6-1", f"generation_tokens at or near {MAX_TOKENS} == 0",
            {"rows_near_cap": len(near_cap), "max_seen": max_tokens_seen}, len(near_cap) == 0)
    verdict("15.6-1.identity", "15.2", "every row carries the §15.2 prompt/schema hashes",
            {"prompt": prompt_hash_ok, "schema": schema_hash_ok, "files": files_match_rows},
            prompt_hash_ok and schema_hash_ok and files_match_rows)
    verdict("15.6-1.coverage", "15.5", f"{EXPECTED_IMAGES} images x 2 variants",
            {"images": len(images), "paired": len(paired)},
            len(images) == EXPECTED_IMAGES and len(paired) == EXPECTED_IMAGES)
    verdict("15.6-1.canary", "5.3", "canary answer identical on every repeat",
            parse_block["canary"]["distinct_raw_texts"], parse_block["canary"]["stable"])

    # ================================================================ §15.6-2 distributions
    def field_distribution(field: str) -> dict:
        block: dict = {"is_multi_select": field in multi_select, "vocabulary": vocabularies[field]}
        if field in multi_select:
            for scope, rs in (("pooled", rows_of()), ("E", rows_of("E")), ("F", rows_of("F"))):
                n = len(rs)
                presence = Counter()
                for p in rs:
                    for v in set(p[field]):
                        presence[v] += 1
                block[scope] = {
                    "n_rows": n,
                    "value_presence_counts": {v: presence.get(v, 0) for v in vocabularies[field]},
                    "value_presence_rates": {v: pct(presence.get(v, 0), n) for v in vocabularies[field]},
                    "exact_set_distribution": dist("+".join(sorted(set(p[field]))) for p in rs),
                    "list_length_distribution": dist(len(p[field]) for p in rs),
                    "singleton_rate": pct(sum(1 for p in rs if len(set(p[field])) == 1), n),
                    "modal_value_by_presence": max(vocabularies[field], key=lambda v: presence.get(v, 0)),
                    "modal_value_presence_rate": pct(max(presence.get(v, 0) for v in vocabularies[field]), n),
                }
        else:
            for scope, rs in (("pooled", rows_of()), ("E", rows_of("E")), ("F", rows_of("F"))):
                n = len(rs)
                c = Counter(p[field] for p in rs)
                modal = max(vocabularies[field], key=lambda v: c.get(v, 0))
                block[scope] = {
                    "n_rows": n,
                    "counts": {v: c.get(v, 0) for v in vocabularies[field]},
                    "rates": {v: pct(c.get(v, 0), n) for v in vocabularies[field]},
                    "modal_value": modal,
                    "modal_share": pct(c.get(modal, 0), n),
                }
        zero_firing = [v for v in vocabularies[field] if block["pooled"].get(
            "counts", block["pooled"].get("value_presence_counts"))[v] == 0]
        block["zero_firing_values"] = [{
            "value": v,
            "stem_E": stems["E"][field]["stem"],
            "gloss_E": stems["E"][field]["values"].get(v),
            "stem_F": stems["F"][field]["stem"],
            "gloss_F": stems["F"][field]["values"].get(v),
        } for v in zero_firing]
        return block

    distributions = {f: field_distribution(f) for f in fields}

    # (a) skew-plausible: the bar is on the minority cells, not on the modal share.
    skew_block: dict = {}
    for f in SKEW_PLAUSIBLE_FIELDS:
        d = distributions[f]
        zeros = [z["value"] for z in d["zero_firing_values"]]
        skew_block[f] = {"zero_firing_values": d["zero_firing_values"],
                         "possibly_unanswerable_values": zeros}
        verdict(f"15.6-2a.{f}.zero_cells", "15.6-2a",
                "every vocabulary value fires at least once across the 142 images",
                zeros or "none", len(zeros) == 0)

    thumb_images = [s for s in images if meta[s]["tier"] == "thumbnail_<=320"]
    illegible_on_thumbs = sum(1 for s in thumb_images for v in sorted(by_image[s])
                             if by_image[s][v]["has_text"] == RESOLUTION_ESCAPE_VALUE)
    has_text_yes_rate = distributions["has_text"]["pooled"]["rates"]["yes"]
    pms_yes_rate = distributions["physical_media_scan"]["pooled"]["rates"]["yes"]
    grain_yes_rate = distributions["grain_or_noise"]["pooled"]["rates"]["yes"]
    overlays_none_rate = distributions["overlays"]["pooled"]["value_presence_rates"]["none"]
    skew_block["named_priors"] = {
        "has_text_yes_rate": has_text_yes_rate,
        "has_text_illegible_rows_on_thumbnail_tier": illegible_on_thumbs,
        "thumbnail_tier_images": len(thumb_images),
        "physical_media_scan_yes_rate": pms_yes_rate,
        "grain_or_noise_yes_rate": grain_yes_rate,
        "overlays_none_presence_rate": overlays_none_rate,
    }
    verdict("15.6-2a.has_text_yes", "15.6-2a", f"has_text yes >= {ALARM_HAS_TEXT_YES_FLOOR}",
            has_text_yes_rate, has_text_yes_rate >= ALARM_HAS_TEXT_YES_FLOOR)
    verdict("15.6-2a.illegible_fires_on_thumbs", "15.6-2a",
            "illegible_at_this_size fires at least once on the thumbnail tier",
            illegible_on_thumbs, illegible_on_thumbs > 0)
    verdict("15.6-2a.physical_media_scan", "15.6-2a",
            f"physical_media_scan yes <= {ALARM_PHYSICAL_MEDIA_SCAN_CEILING}", pms_yes_rate,
            pms_yes_rate <= ALARM_PHYSICAL_MEDIA_SCAN_CEILING)
    verdict("15.6-2a.grain_or_noise", "15.6-2a",
            f"grain_or_noise yes <= {ALARM_GRAIN_OR_NOISE_CEILING}", grain_yes_rate,
            grain_yes_rate <= ALARM_GRAIN_OR_NOISE_CEILING)
    verdict("15.6-2a.overlays_can_say_yes", "15.6-2a", "overlays `none` below 100%",
            overlays_none_rate, overlays_none_rate < 1.0)

    # (b) spread-expected: no single value on more than 85% of rows.
    spread_block: dict = {}
    for f in SPREAD_EXPECTED_FIELDS:
        d = distributions[f]
        if f in multi_select:
            share = d["pooled"]["modal_value_presence_rate"]
            modal = d["pooled"]["modal_value_by_presence"]
            reading = "presence rate of the most-present value (see ambiguities: multi_select_degeneracy)"
            extra = {"modal_exact_set": max(d["pooled"]["exact_set_distribution"],
                                            key=lambda k: d["pooled"]["exact_set_distribution"][k]),
                     "modal_exact_set_share": pct(max(d["pooled"]["exact_set_distribution"].values()),
                                                  d["pooled"]["n_rows"])}
        else:
            share = d["pooled"]["modal_share"]
            modal = d["pooled"]["modal_value"]
            reading = "share of rows holding the modal value"
            extra = {}
        spread_block[f] = {"modal_value": modal, "modal_share": share, "reading": reading,
                           "per_variant_modal_share": {v: (d[v]["modal_share"] if f not in multi_select
                                                           else d[v]["modal_value_presence_rate"])
                                                       for v in EXPECTED_VARIANTS},
                           **extra}
        verdict(f"15.6-2b.{f}", "15.6-2b", f"no single value on more than {NON_DEGENERACY_BAR:.0%} of rows",
                {"value": modal, "share": share}, share <= NON_DEGENERACY_BAR)

    # ---- the three unconditional breakdowns (§15.6-2) -------------------------------
    has_text_by_tier = {}
    for t in tiers:
        subset = [s for s in images if meta[s]["tier"] == t]
        block = {"images": len(subset)}
        for scope, vs in (("pooled", EXPECTED_VARIANTS), ("E", ("E",)), ("F", ("F",))):
            rs = [by_image[s][v] for s in subset for v in vs if v in by_image[s]]
            c = Counter(p["has_text"] for p in rs)
            block[scope] = {"n_rows": len(rs),
                            "counts": {v: c.get(v, 0) for v in vocabularies["has_text"]},
                            "rates": {v: pct(c.get(v, 0), len(rs)) for v in vocabularies["has_text"]}}
        has_text_by_tier[t] = block

    grain_by_medium = {}
    for scope, vs in (("pooled", EXPECTED_VARIANTS), ("E", ("E",)), ("F", ("F",))):
        rs = [by_image[s][v] for s in images for v in vs if v in by_image[s]]
        table = {}
        for m in vocabularies["medium"]:
            sub = [p for p in rs if p["medium"] == m]
            table[m] = {"n_rows": len(sub),
                        "grain_yes": sum(1 for p in sub if p["grain_or_noise"] == "yes"),
                        "grain_yes_rate": pct(sum(1 for p in sub if p["grain_or_noise"] == "yes"), len(sub))}
        photo = table["photograph"]["grain_yes_rate"]
        typo = table["typography_only"]["grain_yes_rate"]
        grain_by_medium[scope] = {
            "by_medium": table,
            "photograph_minus_typography_only": (None if photo is None or typo is None
                                                 else round(photo - typo, 4)),
        }
    verdict("15.6-2.grain_confound", "15.6-2",
            "grain_or_noise yes-rate on photograph exceeds typography_only by a wide margin "
            "(no numeric bar pre-registered; reported)",
            grain_by_medium["pooled"]["photograph_minus_typography_only"], None)

    subject_kind_by_gate = {}
    for scope, vs in (("pooled", EXPECTED_VARIANTS), ("E", ("E",)), ("F", ("F",))):
        rs = [by_image[s][v] for s in images for v in vs if v in by_image[s]]
        table = {}
        for g in vocabularies["has_dominant_subject"]:
            sub = [p for p in rs if p["has_dominant_subject"] == g]
            c = Counter(p["subject_kind"] for p in sub)
            table[g] = {"n_rows": len(sub),
                        "subject_kind_counts": {v: c.get(v, 0) for v in vocabularies["subject_kind"]},
                        "subject_kind_rates": {v: pct(c.get(v, 0), len(sub)) for v in vocabularies["subject_kind"]}}
        subject_kind_by_gate[scope] = table

    # ================================================================ §15.6-3 contradictions
    def contradictions_of(p: dict) -> list[str]:
        out = []
        text_absent = p["has_text"] in ("no", RESOLUTION_ESCAPE_VALUE)
        roles = set(p["text_roles"])
        if text_absent and roles != {NOT_APPLICABLE}:
            out.append("c1_text_absent_but_roles_named")
        if text_absent and p["text_dominance"] != NOT_APPLICABLE:
            out.append("c2_text_absent_but_dominance_given")
        if p["has_text"] == "yes" and roles == {NOT_APPLICABLE}:
            out.append("c3_text_seen_but_no_role_nameable")
        if p["has_dominant_subject"] == "none" and p["subject_area_band"] != NOT_APPLICABLE:
            out.append("c4_no_subject_but_area_given")
        if p["has_signature_color"] == "no" and p["signature_carrier"] != NOT_APPLICABLE:
            out.append("c5_no_signature_colour_but_carrier_given")
        if p["has_signature_color"] == "yes" and p["signature_carrier"] == NOT_APPLICABLE:
            out.append("c6_signature_colour_but_no_carrier")
        for f in multi_select:
            excl = EXCLUSIVE_MULTI_SELECT_VALUES[f]
            if excl in set(p[f]) and len(set(p[f])) > 1:
                out.append(f"c7_exclusive_beside_another__{f}")
        for f in multi_select:
            if len(p[f]) != len(set(p[f])):
                out.append(f"c8_repeated_value__{f}")
        if p["has_dominant_subject"] == "none" and p["subject_kind"] != NOT_APPLICABLE:
            out.append("c9_no_subject_but_noun_named")
        if p["has_dominant_subject"] != "none" and p["subject_kind"] == NOT_APPLICABLE:
            out.append("c10_subject_seen_but_unnameable")
        if p["medium"] == "typography_only" and p["has_text"] in ("no", RESOLUTION_ESCAPE_VALUE):
            out.append("c11_typography_only_without_readable_text")
        if p["medium"] == "typography_only" and p["has_dominant_subject"] != "none":
            out.append("c12_typography_only_with_a_subject")
        return out

    CONTRADICTION_KEYS = [
        "c1_text_absent_but_roles_named", "c2_text_absent_but_dominance_given",
        "c3_text_seen_but_no_role_nameable", "c4_no_subject_but_area_given",
        "c5_no_signature_colour_but_carrier_given", "c6_signature_colour_but_no_carrier",
        "c7_exclusive_beside_another__text_roles", "c7_exclusive_beside_another__overlays",
        "c8_repeated_value__text_roles", "c8_repeated_value__overlays",
        "c9_no_subject_but_noun_named", "c10_subject_seen_but_unnameable",
        "c11_typography_only_without_readable_text", "c12_typography_only_with_a_subject",
    ]
    contra_counts: dict[str, Counter] = {k: Counter() for k in CONTRADICTION_KEYS}
    contra_examples: dict[str, list] = {k: [] for k in CONTRADICTION_KEYS}
    rows_with_any: Counter = Counter()
    events_total: Counter = Counter()
    n_rows_scope = {"pooled": 0, "E": 0, "F": 0}
    for s in images:
        for v in sorted(by_image[s]):
            p = by_image[s][v]
            found = contradictions_of(p)
            n_rows_scope[v] += 1
            n_rows_scope["pooled"] += 1
            for k in found:
                contra_counts[k][v] += 1
                contra_counts[k]["pooled"] += 1
                if len(contra_examples[k]) < EXAMPLES_PER_CONTRADICTION:
                    contra_examples[k].append({
                        "variant": v, "image_path": meta[s]["image_path"],
                        "image_sha256": s, "tier": meta[s]["tier"],
                        "answers": {f: p[f] for f in fields},
                    })
            if found:
                rows_with_any[v] += 1
                rows_with_any["pooled"] += 1
            events_total[v] += len(found)
            events_total["pooled"] += len(found)

    contradiction_block = {
        "per_contradiction": {
            k: {scope: {"n": contra_counts[k][scope], "rate": pct(contra_counts[k][scope], n_rows_scope[scope])}
                for scope in ("pooled", "E", "F")}
            for k in CONTRADICTION_KEYS},
        "rows_with_any_contradiction": {
            scope: {"n": rows_with_any[scope], "rate": pct(rows_with_any[scope], n_rows_scope[scope])}
            for scope in ("pooled", "E", "F")},
        "contradiction_events_per_row": {
            scope: {"events": events_total[scope],
                    "events_per_row": (None if not n_rows_scope[scope]
                                       else round(events_total[scope] / n_rows_scope[scope], 4))}
            for scope in ("pooled", "E", "F")},
        "examples": contra_examples,
        "e_minus_f_rows_with_any": (
            None if rows_with_any["pooled"] == 0 and n_rows_scope["E"] == 0 else
            round((rows_with_any["E"] / n_rows_scope["E"]) - (rows_with_any["F"] / n_rows_scope["F"]), 4)),
    }
    total_rate = contradiction_block["rows_with_any_contradiction"]["pooled"]["rate"]
    verdict("15.6-3.ceiling", "15.6-3", f"total contradiction rate <= {CONTRADICTION_CEILING:.0%} of ok rows "
                                        "(read as: share of rows carrying at least one contradiction)",
            {"rows_with_any_rate": total_rate,
             "events_per_row": contradiction_block["contradiction_events_per_row"]["pooled"]["events_per_row"]},
            total_rate is not None and total_rate <= CONTRADICTION_CEILING)
    verdict("15.6-3.c6_signature_carrier", "15.8",
            "contradiction 6 (signature colour with no carrier) at no material rate — §15.8 names "
            "it as what would make the accent question wrong; no numeric bar pre-registered",
            contradiction_block["per_contradiction"]["c6_signature_colour_but_no_carrier"]["pooled"], None)

    # ================================================================ §15.4 by tier
    tier_block = {}
    for t in tiers:
        subset = [s for s in images if meta[s]["tier"] == t]
        block = {"images": len(subset)}
        for scope, vs in (("pooled", EXPECTED_VARIANTS), ("E", ("E",)), ("F", ("F",))):
            rs = [by_image[s][v] for s in subset for v in vs if v in by_image[s]]
            n = len(rs)
            entry = {
                "n_rows": n,
                "has_text_illegible_at_this_size": {
                    "n": sum(1 for p in rs if p["has_text"] == RESOLUTION_ESCAPE_VALUE),
                    "rate": pct(sum(1 for p in rs if p["has_text"] == RESOLUTION_ESCAPE_VALUE), n)},
                "not_applicable_rates": {},
            }
            for f, gate in CONDITIONAL_FIELDS.items():
                if f in multi_select:
                    na = sum(1 for p in rs if set(p[f]) == {NOT_APPLICABLE})
                    na_any = sum(1 for p in rs if NOT_APPLICABLE in set(p[f]))
                    entry["not_applicable_rates"][f] = {
                        "gate": gate, "n_sole_not_applicable": na, "rate_sole": pct(na, n),
                        "n_not_applicable_present": na_any, "rate_present": pct(na_any, n)}
                else:
                    na = sum(1 for p in rs if p[f] == NOT_APPLICABLE)
                    entry["not_applicable_rates"][f] = {"gate": gate, "n": na, "rate": pct(na, n)}
            # The share that is NOT explained by the gate: a not_applicable while the gate said
            # the field applies is design rule 8 reappearing (§15.8, last bullet).
            entry["not_applicable_while_gate_says_applicable"] = {
                "text_roles": pct(sum(1 for p in rs if p["has_text"] == "yes" and set(p["text_roles"]) == {NOT_APPLICABLE}),
                                  sum(1 for p in rs if p["has_text"] == "yes")),
                "text_dominance": pct(sum(1 for p in rs if p["has_text"] == "yes" and p["text_dominance"] == NOT_APPLICABLE),
                                      sum(1 for p in rs if p["has_text"] == "yes")),
                "subject_kind": pct(sum(1 for p in rs if p["has_dominant_subject"] != "none" and p["subject_kind"] == NOT_APPLICABLE),
                                    sum(1 for p in rs if p["has_dominant_subject"] != "none")),
                "subject_area_band": pct(sum(1 for p in rs if p["has_dominant_subject"] != "none" and p["subject_area_band"] == NOT_APPLICABLE),
                                         sum(1 for p in rs if p["has_dominant_subject"] != "none")),
                "signature_carrier": pct(sum(1 for p in rs if p["has_signature_color"] == "yes" and p["signature_carrier"] == NOT_APPLICABLE),
                                         sum(1 for p in rs if p["has_signature_color"] == "yes")),
            }
            block[scope] = entry
        tier_block[t] = block

    # ================================================================ §15.7 agreement
    single_value_agreement = {}
    for f in single_value:
        pairs = [(by_image[s]["E"][f], by_image[s]["F"][f]) for s in paired]
        raw, kappa, note = cohens_kappa(pairs)
        entry = {"n": len(pairs), "raw_agreement": raw, "cohens_kappa": kappa, "note": note,
                 "disagreement_rate": None if raw is None else round(1 - raw, 4),
                 "bar_kappa": KAPPA_BARS.get(f),
                 "confusion_top": dist(f"E={a}|F={b}" for a, b in pairs if a != b)}
        single_value_agreement[f] = entry

    # Conditional fields, on their gate's subset, with n — §15.7 is explicit that the all-rows
    # number is inflated by agreeing not_applicables and must not be quoted alone.
    def subset_agreement(field: str, gate: str, keep) -> dict:
        both = [s for s in paired if keep(by_image[s]["E"][gate]) and keep(by_image[s]["F"][gate])]
        either = [s for s in paired if keep(by_image[s]["E"][gate]) or keep(by_image[s]["F"][gate])]
        out = {}
        for name, subset in (("both_variants_gate_open", both), ("either_variant_gate_open", either)):
            pairs = [(by_image[s]["E"][field], by_image[s]["F"][field]) for s in subset]
            raw, kappa, note = cohens_kappa(pairs)
            out[name] = {"n": len(pairs), "raw_agreement": raw, "cohens_kappa": kappa, "note": note,
                         "confusion_top": dist(f"E={a}|F={b}" for a, b in pairs if a != b)}
        return out

    conditional_agreement = {
        "subject_kind": subset_agreement("subject_kind", "has_dominant_subject", lambda v: v != "none"),
        "signature_carrier": subset_agreement("signature_carrier", "has_signature_color", lambda v: v == "yes"),
    }

    for f in single_value:
        bar = KAPPA_BARS.get(f)
        if bar is None:
            continue
        if f in CONDITIONAL_FIELDS and f in conditional_agreement:
            obs = conditional_agreement[f]["both_variants_gate_open"]
            scope = "gate-open subset (both variants)"
        else:
            obs = single_value_agreement[f]
            scope = "all 142 paired images"
        k = obs["cohens_kappa"]
        verdict(f"15.7.kappa.{f}", "15.7", f"kappa >= {bar} on the {scope}",
                {"kappa": k, "raw": obs["raw_agreement"], "n": obs["n"]},
                None if k is None else k >= bar)

    multi_select_agreement = {}
    for f in multi_select:
        exact = 0
        jac_sum = 0.0
        for s in paired:
            a, b = set(by_image[s]["E"][f]), set(by_image[s]["F"][f])
            exact += 1 if a == b else 0
            jac_sum += jaccard(a, b)
        n = len(paired)
        per_value = {}
        for value in vocabularies[f]:
            pairs = [(str(value in set(by_image[s]["E"][f])), str(value in set(by_image[s]["F"][f])))
                     for s in paired]
            raw, kappa, note = cohens_kappa(pairs)
            per_value[value] = {
                "e_present": sum(1 for a, _ in pairs if a == "True"),
                "f_present": sum(1 for _, b in pairs if b == "True"),
                "both_present": sum(1 for a, b in pairs if a == b == "True"),
                "raw_agreement": raw, "cohens_kappa": kappa, "note": note,
                "bar": BAR_PER_VALUE_KAPPA_FLOOR,
                "verdict": ("undefined" if kappa is None else
                            ("pass" if kappa >= BAR_PER_VALUE_KAPPA_FLOOR else "FAIL")),
            }
        multi_select_agreement[f] = {
            "n": n,
            "exact_set_agreement": pct(exact, n),
            "mean_jaccard": round(jac_sum / n, 4) if n else None,
            "per_value_kappa": per_value,
            "singleton_rate_pooled": distributions[f]["pooled"]["singleton_rate"],
        }
        verdict(f"15.7.multi.{f}.exact_set", "15.7", f"exact-set agreement >= {BAR_EXACT_SET_AGREEMENT}",
                multi_select_agreement[f]["exact_set_agreement"],
                multi_select_agreement[f]["exact_set_agreement"] >= BAR_EXACT_SET_AGREEMENT)
        verdict(f"15.7.multi.{f}.jaccard", "15.7", f"mean Jaccard >= {BAR_MEAN_JACCARD}",
                multi_select_agreement[f]["mean_jaccard"],
                multi_select_agreement[f]["mean_jaccard"] >= BAR_MEAN_JACCARD)
        below = {v: e["cohens_kappa"] for v, e in per_value.items()
                 if e["cohens_kappa"] is not None and e["cohens_kappa"] < BAR_PER_VALUE_KAPPA_FLOOR}
        undefined = [v for v, e in per_value.items() if e["cohens_kappa"] is None]
        verdict(f"15.7.multi.{f}.per_value_floor", "15.7",
                f"no vocabulary value below kappa {BAR_PER_VALUE_KAPPA_FLOOR}",
                {"below_floor": below, "kappa_undefined": undefined}, len(below) == 0)
        verdict(f"15.8.multi.{f}.singleton", "15.8",
                "the multi-select returns more than one value at some material rate (no numeric "
                "bar pre-registered; a near-1.0 singleton rate means the array bought nothing)",
                distributions[f]["pooled"]["singleton_rate"], None)

    order_domination = {f: single_value_agreement[f]["disagreement_rate"] for f in single_value}
    order_domination.update({f: (None if multi_select_agreement[f]["exact_set_agreement"] is None
                                 else round(1 - multi_select_agreement[f]["exact_set_agreement"], 4))
                             for f in multi_select})
    over = {f: d for f, d in order_domination.items() if d is not None and d > ORDER_DOMINATION_DISAGREEMENT}
    verdict("15.8.order_domination", "15.8",
            f"E and F disagree on more than {ORDER_DOMINATION_DISAGREEMENT:.0%} of rows on MOST questions",
            {"questions_over": over, "n_over": len(over), "n_questions": len(order_domination)},
            len(over) <= len(order_domination) / 2)

    # ================================================================ SAM cross-instrument
    # read_jsonl returns [] for a path that does not exist, which would turn a broken join into
    # a quiet "SAM found no text anywhere" — the exact shape of a false cross-instrument
    # disagreement. Both the file and the join are asserted instead.
    if not args.sam.exists():
        raise SystemExit(f"SAM eval file not found: {args.sam}")
    sam_rows = read_jsonl(args.sam)
    sam_image = {r["image_sha256"]: r for r in sam_rows if r.get("record_type") == "image"}
    if not sam_image:
        raise SystemExit(f"SAM eval file holds no image records: {args.sam}")
    sam_text_regions: dict[str, list] = defaultdict(list)
    for r in sam_rows:
        if r.get("record_type") == "region" and r.get("concept") in SAM_TEXT_LIKE_CONCEPTS:
            sam_text_regions[r["image_sha256"]].append(r)

    def sam_text_of(sha: str) -> dict:
        regs = sam_text_regions.get(sha, [])
        kept = [r for r in regs if r["score"] >= SAM_CALIBRATED_SCORE_THRESHOLD]
        img = sam_image.get(sha)
        return {
            "text_like_regions_at_calibrated_cut": len(kept),
            "text_like_regions_at_run_cut": len(regs),
            "max_text_like_score": round(max((r["score"] for r in regs), default=0.0), 4),
            "text_like_union_area_fraction_at_run_cut": (None if img is None
                                                         else img["text_like_union_area_fraction"]),
            "any_text": len(kept) >= 1,
            "strong_text": len(kept) >= SAM_STRONG_TEXT_MIN_REGIONS,
        }

    sam_join = {s: sam_text_of(s) for s in images}
    sam_missing = [meta[s]["image_path"] for s in images if s not in sam_image]
    verdict("cross_instrument.join", "15.6-3 c11",
            "every pilot image joins to a SAM image record by sha256",
            {"images": len(images), "missing": len(sam_missing)}, len(sam_missing) == 0)

    def cross_examples(pred) -> list[dict]:
        out = []
        for s in images:
            for v in sorted(by_image[s]):
                if pred(by_image[s][v], sam_join[s]):
                    out.append({"variant": v, "image_path": meta[s]["image_path"], "image_sha256": s,
                                "tier": meta[s]["tier"],
                                "vlm": {k: by_image[s][v][k] for k in
                                        ("medium", "has_text", "text_roles", "text_dominance")},
                                "sam": sam_join[s]})
        return out

    typo_no_sam_text = cross_examples(lambda p, sam: p["medium"] == "typography_only" and not sam["any_text"])
    typo_rows = [(s, v) for s in images for v in sorted(by_image[s])
                 if by_image[s][v]["medium"] == "typography_only"]
    no_text_sam_any = cross_examples(lambda p, sam: p["has_text"] == "no" and sam["any_text"])
    no_text_sam_strong = cross_examples(lambda p, sam: p["has_text"] == "no" and sam["strong_text"])
    illegible_sam_any = cross_examples(
        lambda p, sam: p["has_text"] == RESOLUTION_ESCAPE_VALUE and sam["any_text"])
    yes_text_sam_none = cross_examples(lambda p, sam: p["has_text"] == "yes" and not sam["any_text"])

    has_text_x_sam = {}
    for value in vocabularies["has_text"]:
        rs = [(s, v) for s in images for v in sorted(by_image[s]) if by_image[s][v]["has_text"] == value]
        has_text_x_sam[value] = {
            "n_rows": len(rs),
            "sam_text_present": sum(1 for s, _ in rs if sam_join[s]["any_text"]),
            "sam_text_absent": sum(1 for s, _ in rs if not sam_join[s]["any_text"]),
            "sam_text_strong": sum(1 for s, _ in rs if sam_join[s]["strong_text"]),
        }

    sam_block = {
        "instrument_note": ("SAM and the VLM are two instruments with no ground truth between "
                            "them. Every number here is a DISAGREEMENT COUNT. Neither side is "
                            "scored as right, and none of this is accuracy."),
        "text_like_concepts": list(SAM_TEXT_LIKE_CONCEPTS),
        "calibrated_score_threshold": SAM_CALIBRATED_SCORE_THRESHOLD,
        "images_missing_from_sam": sam_missing,
        "images_with_no_text_like_mask_at_calibrated_cut":
            sum(1 for s in images if not sam_join[s]["any_text"]),
        "images_with_strong_text_like_masks": sum(1 for s in images if sam_join[s]["strong_text"]),
        "direction_a_typography_only_without_sam_text": {
            "definition": ("VLM medium == typography_only, SAM found zero text-like masks at the "
                           "calibrated cut — contradiction 11 read from the other instrument"),
            "typography_only_rows": len(typo_rows),
            "n": len(typo_no_sam_text),
            "rate_of_typography_only_rows": pct(len(typo_no_sam_text), len(typo_rows)),
            "by_variant": dist(e["variant"] for e in typo_no_sam_text),
            "examples": typo_no_sam_text[:EXAMPLES_PER_CONTRADICTION],
        },
        "direction_b_has_text_no_but_sam_found_text": {
            "definition": ("VLM has_text == no, SAM kept at least one text-like mask at the "
                           "calibrated cut; the strict reading requires "
                           f"{SAM_STRONG_TEXT_MIN_REGIONS} or more"),
            "n_any": len(no_text_sam_any),
            "n_strong": len(no_text_sam_strong),
            "by_variant_any": dist(e["variant"] for e in no_text_sam_any),
            "examples": no_text_sam_any[:EXAMPLES_PER_CONTRADICTION],
        },
        "reported_alongside": {
            "illegible_at_this_size_rows_where_sam_found_text": len(illegible_sam_any),
            "has_text_yes_rows_where_sam_found_no_text": len(yes_text_sam_none),
            "has_text_x_sam_text_presence": has_text_x_sam,
            # A disagreement whose SAM side sits just under the calibrated cut is a threshold
            # effect, not two instruments seeing different covers. Reported so the counts above
            # cannot be read as more than they are; the round that set the cut measured SAM
            # recall at 69%, so near-miss masks are expected.
            "threshold_proximity_of_disagreements": {
                "note": (f"max text-like mask score on the covers behind each disagreement; the "
                         f"cut is {SAM_CALIBRATED_SCORE_THRESHOLD} and stored rows were kept at 0.3"),
                "typography_only_without_sam_text": sorted(
                    {round(sam_join[e["image_sha256"]]["max_text_like_score"], 3)
                     for e in typo_no_sam_text}),
                "has_text_yes_without_sam_text": sorted(
                    {round(sam_join[e["image_sha256"]]["max_text_like_score"], 3)
                     for e in yes_text_sam_none}),
                "covers_behind_has_text_yes_without_sam_text": len(
                    {e["image_sha256"] for e in yes_text_sam_none}),
                "covers_with_no_text_like_mask_even_at_the_run_cut": len(
                    {e["image_sha256"] for e in yes_text_sam_none
                     if sam_join[e["image_sha256"]]["text_like_regions_at_run_cut"] == 0}),
            },
        },
    }

    # ================================================================ subject_kind for SAM
    noun_rows = []
    for s in paired:
        e, f = by_image[s]["E"], by_image[s]["F"]
        img = sam_image.get(s)
        noun_rows.append({
            "image_path": meta[s]["image_path"],
            "image_sha256": s,
            "artwork_id": meta[s]["artwork_id"],
            "tier": meta[s]["tier"],
            "subject_kind_E": e["subject_kind"],
            "subject_kind_F": f["subject_kind"],
            "variants_agree": e["subject_kind"] == f["subject_kind"],
            "has_dominant_subject_E": e["has_dominant_subject"],
            "has_dominant_subject_F": f["has_dominant_subject"],
            "subject_area_band_E": e["subject_area_band"],
            "subject_area_band_F": f["subject_area_band"],
            "noun_outside_fixed_concept_union": sorted(
                {k for k in (e["subject_kind"], f["subject_kind"])
                 if k in SUBJECT_KINDS_OUTSIDE_FIXED_UNION}),
            "sam_person_like_union_area_fraction": None if img is None else img["person_like_union_area_fraction"],
            "sam_instances_by_concept": None if img is None else img["instances_by_concept"],
        })
    agreed_nouns = [r for r in noun_rows if r["variants_agree"]]
    outside = [r for r in noun_rows if r["noun_outside_fixed_concept_union"]]
    outside_agreed = [r for r in outside if r["variants_agree"]]
    subject_kind_block = {
        "handoff_note": ("§15.7: subject_kind's real verdict is the SAM workstream's — does the "
                         "named mask land, and does it recover a noun the fixed concept union "
                         "missed. Nothing here answers that; this is the label list it needs."),
        "fixed_concept_union_v2": list(sam_image[images[0]]["concepts"]) if images and images[0] in sam_image else [],
        "nouns_inside_fixed_union": list(SUBJECT_KINDS_INSIDE_FIXED_UNION),
        "nouns_outside_fixed_union": list(SUBJECT_KINDS_OUTSIDE_FIXED_UNION),
        "summary": {
            "covers": len(noun_rows),
            "distribution_E": dist(r["subject_kind_E"] for r in noun_rows),
            "distribution_F": dist(r["subject_kind_F"] for r in noun_rows),
            "both_variants_agree": len(agreed_nouns),
            "both_variants_agree_rate": pct(len(agreed_nouns), len(noun_rows)),
            "agreed_noun_distribution": dist(r["subject_kind_E"] for r in agreed_nouns),
            "covers_with_a_noun_outside_the_fixed_union": len(outside),
            "covers_with_an_AGREED_noun_outside_the_fixed_union": len(outside_agreed),
            "agreed_outside_noun_distribution": dist(r["subject_kind_E"] for r in outside_agreed),
        },
        "per_cover": noun_rows,
    }

    # ================================================================ report
    ambiguities = [
        {"where": "§15.6-1", "ambiguity": "\"generation_tokens at or near MAX_TOKENS\" gives no "
         "number for \"near\".", "reading": f"near = >= {NEAR_MAX_TOKENS} of {MAX_TOKENS} (90% of "
         "the cap); the observed maximum is reported so the choice cannot hide a near miss."},
        {"where": "§15.6-2b", "ambiguity": "\"no single value on more than 85% of rows\" is written "
         "for single-value questions; text_roles and overlays are sets.",
         "reading": "the literal reading is used — the PRESENCE rate of the most-present value over "
         "rows. The modal exact-set share is reported beside it, because a value present on most "
         "covers (artist_name) is not the same defect as one answer repeated on most covers."},
        {"where": "§15.6-3", "ambiguity": "\"total contradiction rate <= 10% of ok rows\" could mean "
         "rows carrying at least one contradiction, or contradiction events divided by rows.",
         "reading": "a rate over rows is read as the share of rows carrying at least one "
         "contradiction; events-per-row is reported beside it and both are in the verdict."},
        {"where": "§15.7", "ambiguity": "the gate-open subsets for subject_kind and "
         "signature_carrier are not defined by which variant's gate.",
         "reading": "the bar is applied to the subset where BOTH variants opened the gate (the "
         "only subset where the pair is comparable); the either-variant subset is reported beside "
         "it with its own n."},
        {"where": "§15.6-2 / contradiction 11", "ambiguity": "\"SAM found text\" has no magnitude.",
         "reading": f"any text-like mask surviving the calibrated cut {SAM_CALIBRATED_SCORE_THRESHOLD} "
         f"is the headline; {SAM_STRONG_TEXT_MIN_REGIONS}+ masks is reported as the strict reading. "
         "The stored union area fractions were computed at the low run-time cut of 0.3 and so are "
         "carried as context, never as the test."},
        {"where": "§15.6-2 grain x medium", "ambiguity": "\"should exceed by a wide margin\" has no "
         "number.", "reading": "the difference in yes-rates is reported with no pass/fail attached."},
        {"where": "§15.4 by tier", "ambiguity": "the tier boundaries are given in §15.5 as counts "
         "(43 thumbnail <=320, 88 standard, 11 large >640).",
         "reading": "analyze.py's reviewed tier_of() is imported rather than re-derived, and the "
         "per-tier image counts are reported so the join can be checked against §15.5."},
    ]

    report = {
        "what_this_is": ("Health pilot for group-bcde.v1. NO GROUND TRUTH EXISTS for these thirteen "
                         "questions (PREMISE_NEXT.md §15.9), so no number in this file is an "
                         "accuracy and none may be quoted as one. Every metric was pre-registered "
                         "in §15.4, §15.6 and §15.7 before the run; this analyzer was written after "
                         "the rows existed and implements those metrics only."),
        "generated_by": "research/v3/oracle/premise/analyze_bcde.py",
        "inputs": {
            "results": str(args.results),
            "sam": str(args.sam),
            "prompt_files": {v: str(prompt_variants[v].path.name) for v in EXPECTED_VARIANTS},
        },
        "ambiguities": ambiguities,
        "verdicts": verdicts,
        "verdict_summary": {
            "pass": sum(1 for v in verdicts if v["verdict"] == "pass"),
            "fail": sum(1 for v in verdicts if v["verdict"] == "FAIL"),
            "report_only": sum(1 for v in verdicts if v["verdict"] == "report_only"),
            "failed_ids": [v["id"] for v in verdicts if v["verdict"] == "FAIL"],
        },
        "health_1_parse_rate": parse_block,
        "health_2_distributions": {
            "per_field": distributions,
            "skew_plausible_15_6_2a": skew_block,
            "spread_expected_15_6_2b": spread_block,
            "breakdown_has_text_by_tier": has_text_by_tier,
            "breakdown_grain_or_noise_by_medium": grain_by_medium,
            "breakdown_subject_kind_by_has_dominant_subject": subject_kind_by_gate,
        },
        "health_3_gate_contradictions": contradiction_block,
        "not_applicable_and_illegible_by_tier_15_4": tier_block,
        "inter_variant_agreement_15_7": {
            "n_paired_images": len(paired),
            "single_value": single_value_agreement,
            "conditional_on_gate_open": conditional_agreement,
            "multi_select": multi_select_agreement,
            "disagreement_rate_per_question": order_domination,
        },
        "cross_instrument_sam": sam_block,
        "subject_kind_noun_list_for_sam": subject_kind_block,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    headline = {
        "ok_rate": ok_rate,
        "parse_failed": parse_failed,
        "rows_with_any_contradiction": contradiction_block["rows_with_any_contradiction"],
        "verdicts": report["verdict_summary"],
        "kappa": {f: single_value_agreement[f]["cohens_kappa"] for f in single_value},
        "kappa_gate_open": {f: conditional_agreement[f]["both_variants_gate_open"]["cohens_kappa"]
                            for f in conditional_agreement},
    }
    print(json.dumps(headline, indent="\t"))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

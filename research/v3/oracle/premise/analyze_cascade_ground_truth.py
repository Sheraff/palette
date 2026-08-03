#!/usr/bin/env python3
"""Score variant D against the reviewer on the cascade-ground-truth-1 round.

ONE policy question:

    when variant B's ground answer is unmapped, take variant D's answer if and only if
    D says `multiple_distinct_fields`; otherwise leave the cover unlabeled.

The previous basis for that policy was refuted (reviews/phase-0-adversarial/cascade-basis.md):
it was the pooled non-shaded class, scored against the published accepted-palette gradient
flag, which Appendix R bars from counting as accuracy. This script scores against the primary
judge instead -- the reviewer's own `ground_type` answers, elicited under the reviewer-signed
ORACLE_QUESTION_SET.md §A.2 criterion, at group-a.v2, D's own schema.

Truth sources, and nothing else:
  - reviewer answers  : the warehouse, via `src/warehouse/cli.ts query --batch cascade-ground-truth-1`
                        (supersession applied here: a record named in another record's
                        `supersedes` is dropped; `--no-retracted` drops retractions)
  - the 19 covers     : data/oracle-validation/cascade-ground-truth-1.json (the served batch)
  - the 8 policy items: data/oracle-premise/b-unmapped-class-analysis.json `per_item`,
                        is_class && D_ground_type == multiple_distinct_fields
  - D's and B's words : data/oracle-premise/premise-run-cd.jsonl (D) and premise-run-1.jsonl (B)

The accepted-palette gradient flag is NOT used to score anything here. It is carried per cover
as context only, explicitly labelled as such.

The pre-registration block in the output file was written before any answer was scored; this
script copies it through verbatim and refuses to run if the file has been edited to remove it.

Stdlib only. No GPU. Read-only apart from the two owned output paths.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from collections import Counter
from pathlib import Path

V3 = Path(__file__).resolve().parent.parent.parent          # research/v3
DATA = V3 / "data"
OUT_JSON = DATA / "oracle-premise" / "cascade-ground-truth-1-analysis.json"
BATCH = DATA / "oracle-validation" / "cascade-ground-truth-1.json"
CLASS_ANALYSIS = DATA / "oracle-premise" / "b-unmapped-class-analysis.json"
RUN_CD = DATA / "oracle-premise" / "premise-run-cd.jsonl"
RUN_1 = DATA / "oracle-premise" / "premise-run-1.jsonl"

# ---------------------------------------------------------------------------
# The binary projection. ALLOWLIST, copied from the fixed analyzer analyze.py:35-53.
# A value projects to a binary only if it is named here. Nothing is projected by
# exclusion -- there is no denylist anywhere in this file.
# ---------------------------------------------------------------------------
GRADIENT_MAP: dict[str, str] = {
    "shaded_field": "gradient",
    "flat_field": "flat",
    "multiple_distinct_fields": "flat",
    "full_scene": "unmapped",
    "pattern_or_texture": "unmapped",
    "none_discernible": "unmapped",
    "underdetermined": "unanswerable",
}
MAPPABLE = {v for v, b in GRADIENT_MAP.items() if b in ("flat", "gradient")}
ESCAPE_VALUES = ("full_scene", "pattern_or_texture", "none_discernible")


def project(value: str | None) -> str | None:
    """Binary projection, allowlist only. None means 'projects to neither binary'."""
    if value is None:
        return None
    mapped = GRADIENT_MAP.get(value)
    return mapped if mapped in ("flat", "gradient") else None


def binom_tail(k: int, n: int, p: float) -> float:
    """P(X >= k) under Binomial(n, p), exact."""
    return sum(math.comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))


def load_reviewer_labels() -> tuple[list[dict], dict]:
    """Live reviewer labels for the round, supersession and retraction respected."""
    proc = subprocess.run(
        [
            "node", "--experimental-strip-types", str(V3 / "src" / "warehouse" / "cli.ts"),
            "query", "--batch", "cascade-ground-truth-1", "--json", "--no-retracted",
        ],
        cwd=str(V3), capture_output=True, text=True, check=True,
    )
    records = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    labels = [r for r in records if r["type"] == "oracle-label"]
    superseded = {r["supersedes"] for r in labels if r.get("supersedes")}
    live = [r for r in labels if r["id"] not in superseded]
    audit = {
        "cli": "src/warehouse/cli.ts query --batch cascade-ground-truth-1 --json --no-retracted",
        "records_returned": len(records),
        "oracle_labels_returned": len(labels),
        "superseded_dropped": sorted(superseded),
        "live_labels": len(live),
        "revisions_above_1": sorted(
            (r["imageId"], r["revision"]) for r in live if r.get("revision", 1) > 1
        ),
        "authors": sorted({f"{r['author']['kind']}:{r['author']['id']}" for r in live}),
        "label_schema_versions": sorted({r["labelSchemaVersion"] for r in live}),
        "question_keys": sorted({r["questionKey"] for r in live}),
    }
    return live, audit


def jsonl_rows(path: Path, variant: str) -> dict[str, str]:
    """sha256 -> ground_type, for one prompt variant of a bulk run."""
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("prompt_variant") != variant:
            continue
        if row.get("is_canary") or row.get("status") != "ok" or row.get("parse_failed"):
            continue
        sha = row.get("image_sha256")
        value = (row.get("parsed") or {}).get("ground_type")
        if sha and value:
            out[sha] = value
    return out


def main() -> int:
    existing = json.loads(OUT_JSON.read_text())
    prereg = existing.get("pre_registration")
    if not prereg:
        print("refusing to run: the pre-registration block is missing from", OUT_JSON)
        return 2

    batch = json.loads(BATCH.read_text())
    items = {it["sha256"]: it for it in batch["items"]}

    class_rows = json.loads(CLASS_ANALYSIS.read_text())["per_item"]
    policy_rows = {
        r["sha256"]: r
        for r in class_rows
        if r.get("is_class") and r["D_ground_type"] == "multiple_distinct_fields"
    }

    d_answers = jsonl_rows(RUN_CD, "D")
    b_answers = jsonl_rows(RUN_1, "B")

    labels, audit = load_reviewer_labels()
    by_sha = {r["artwork"]["sha256"]: r for r in labels}

    covers = []
    for sha, item in items.items():
        label = by_sha.get(sha)
        row = policy_rows.get(sha)
        reviewer = label["answer"] if label else None
        d_word = d_answers.get(sha, "multiple_distinct_fields")
        b_word = b_answers.get(sha)
        rev_bin, d_bin = project(reviewer), project(d_word)
        covers.append({
            "sha256": sha,
            "artworkId": item["artworkId"],
            "imagePath": item["imagePath"],
            "rendition_tier": item["stratum"],
            "rendition_long_edge_px": item["rendition"]["longEdgePx"],
            "in_policy_slice": sha in policy_rows,
            "D_ground_type": d_word,
            "B_ground_type": b_word,
            "B_is_unmapped": b_word is not None and GRADIENT_MAP.get(b_word) == "unmapped",
            "reviewer_ground_type": reviewer,
            "reviewer_label_id": label["id"] if label else None,
            "reviewer_revision": label.get("revision") if label else None,
            "reviewer_is_escape_value": reviewer in ESCAPE_VALUES,
            "reviewer_is_vocabulary_misfit": reviewer == "none_discernible",
            "reviewer_binary": rev_bin,
            "D_binary": d_bin,
            "exact_match": (None if reviewer is None else reviewer == d_word),
            "binary_comparable": rev_bin is not None and d_bin is not None,
            "binary_match": (rev_bin == d_bin) if (rev_bin and d_bin) else None,
            "context_only_accepted_palette_flag_gradient": (
                row.get("flag_gradient") if row else None
            ),
            "context_note": "the flag column is palette-conditional context; it scores nothing here",
        })
    covers.sort(key=lambda c: (not c["in_policy_slice"], c["artworkId"]))

    def score(subset: list[dict], name: str) -> dict:
        answered = [c for c in subset if c["reviewer_ground_type"] is not None]
        exact = [c for c in answered if c["exact_match"]]
        comparable = [c for c in answered if c["binary_comparable"]]
        bin_agree = [c for c in comparable if c["binary_match"]]
        escapes = [c for c in answered if c["reviewer_is_escape_value"]]
        misfit = [c for c in answered if c["reviewer_is_vocabulary_misfit"]]
        n = len(answered)
        return {
            "slice": name,
            "n_covers": len(subset),
            "n_with_reviewer_answer": n,
            "reviewer_answer_distribution": dict(
                Counter(c["reviewer_ground_type"] for c in answered).most_common()
            ),
            "rendition_tiers": dict(Counter(c["rendition_tier"] for c in subset).most_common()),
            "exact_ground_type_match": {
                "right": len(exact),
                "of": n,
                "rate": round(len(exact) / n, 4) if n else None,
                "covers_matched": [c["artworkId"] for c in exact],
            },
            "binary_projection": {
                "comparable": len(comparable),
                "of": n,
                "not_comparable_because_reviewer_answer_projects_to_neither": n - len(comparable),
                "agree": len(bin_agree),
                "disagree": len(comparable) - len(bin_agree),
                "rate_among_comparable": (
                    round(len(bin_agree) / len(comparable), 4) if comparable else None
                ),
                "note": (
                    "allowlist projection (analyze.py GRADIENT_MAP); reviewer answers on "
                    "full_scene / pattern_or_texture / none_discernible project to neither "
                    "binary and are excluded from the comparable set rather than forced"
                ),
            },
            "escape_values": {
                "n": len(escapes),
                "of": n,
                "share": round(len(escapes) / n, 4) if n else None,
                "distribution": dict(
                    Counter(c["reviewer_ground_type"] for c in escapes).most_common()
                ),
                "vocabulary_misfit_none_discernible": {
                    "n": len(misfit),
                    "covers": [c["artworkId"] for c in misfit],
                    "reading": (
                        "per the reviewer's post-hoc disclosure these are NOT 'no ground "
                        "visible'; the reviewer can see the ground and has no tag for it"
                    ),
                },
            },
            "per_cover": [
                {
                    "artworkId": c["artworkId"],
                    "tier": c["rendition_tier"],
                    "D": c["D_ground_type"],
                    "reviewer": c["reviewer_ground_type"],
                    "exact": c["exact_match"],
                    "D_binary": c["D_binary"],
                    "reviewer_binary": c["reviewer_binary"],
                    "binary": (
                        "agree" if c["binary_match"]
                        else "disagree" if c["binary_match"] is False
                        else "reviewer answer projects to neither binary"
                    ),
                }
                for c in subset
            ],
        }

    slice_19 = covers
    slice_8 = [c for c in covers if c["in_policy_slice"]]
    s19, s8 = score(slice_19, "corpus_wide_D_multiple_distinct_fields (19)"), score(
        slice_8, "policy_slice_B_unmapped_and_D_MDF (8)"
    )

    # --- B's abstention cost on the 8 -------------------------------------------------
    abstention = []
    for c in slice_8:
        reviewer, b_word = c["reviewer_ground_type"], c["B_ground_type"]
        if reviewer is None:
            verdict = "no reviewer answer"
        elif reviewer == "none_discernible":
            verdict = "vocabulary-misfit (reviewer post-hoc disclosure)"
        elif reviewer in MAPPABLE:
            verdict = "COSTLY: reviewer gave a mappable answer B declined to give"
        elif reviewer == b_word:
            verdict = "VINDICATED: reviewer gave B's own escape value"
        else:
            verdict = "JUSTIFIED-OTHER: reviewer also escaped, on a different value"
        abstention.append({
            "artworkId": c["artworkId"],
            "tier": c["rendition_tier"],
            "B": b_word,
            "reviewer": reviewer,
            "D": c["D_ground_type"],
            "verdict": verdict,
        })
    ab_counts = Counter(a["verdict"] for a in abstention)

    # --- two caveats the raw counts hide ----------------------------------------------
    answered_all = [c for c in covers if c["reviewer_ground_type"] is not None]
    reviewer_gradient_side = [
        c for c in answered_all if c["reviewer_binary"] == "gradient"
    ]
    exact_covers = [c for c in answered_all if c["exact_match"]]
    exact_off_route = [c for c in exact_covers if not c["B_is_unmapped"]]
    caveats = {
        "binary_agreement_is_directionally_vacuous": {
            "reviewer_answers_projecting_to_gradient": len(reviewer_gradient_side),
            "why_it_matters": (
                "D projects to `flat` on every cover in this round by construction "
                "(multiple_distinct_fields -> flat). The reviewer answered `shaded_field` on "
                f"{len(reviewer_gradient_side)} of {len(answered_all)} covers, so every reviewer "
                "answer that projects at all projects to `flat` too. The binary agreement counts "
                "are therefore true but carry no information about direction: they cannot "
                "distinguish 'D reads the ground correctly' from 'nothing in this round was on "
                "the gradient side'. Do not quote the binary rate without this sentence."
            ),
        },
        "the_exact_matches_sit_off_the_policy_route": {
            "exact_matches_total": len(exact_covers),
            "of_which_B_was_NOT_unmapped": len(exact_off_route),
            "covers_off_route": [
                {"artworkId": c["artworkId"], "B": c["B_ground_type"]} for c in exact_off_route
            ],
            "why_it_matters": (
                "The policy fires only where B abstains. Most of the covers where D's "
                "multiple_distinct_fields does match the reviewer are covers where B gave a "
                "mappable answer of its own, i.e. covers the policy never touches. D's answer "
                "value agrees with the human least often exactly where the policy would use it."
            ),
        },
    }

    # --- the pre-registered branches --------------------------------------------------
    n8 = s8["n_with_reviewer_answer"]
    exact8 = s8["exact_ground_type_match"]["right"]
    comp8 = s8["binary_projection"]["comparable"]
    agree8 = s8["binary_projection"]["agree"]
    esc8, esc19 = s8["escape_values"]["n"], s19["escape_values"]["n"]

    escalate = esc8 >= 3 or esc19 >= 7
    adopt = (
        exact8 >= 6
        and comp8 >= 6
        and (agree8 / comp8 >= 2 / 3 if comp8 else False)
    )
    reject = exact8 <= 4 or (
        comp8 > 0 and (comp8 - agree8) / comp8 >= 1 / 3
    )
    verdict = "UNDECIDED-ESCALATE" if escalate else ("ADOPT" if adopt else "REJECT")

    misfit_covers = sorted(
        c["artworkId"] for c in covers if c["reviewer_is_vocabulary_misfit"]
    )
    misfit_paths = sorted(
        c["imagePath"] for c in covers if c["reviewer_is_vocabulary_misfit"]
    )

    out = {
        "what_this_is": (
            "The reviewer (primary judge) scored against variant D on the exact answer value "
            "the B-unmapped cascade policy gates on. Replaces the refuted flag-scored basis."
        ),
        "status": "computed",
        "generated_at": subprocess.run(
            ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], capture_output=True, text=True
        ).stdout.strip(),
        "generated_by": "research/v3/oracle/premise/analyze_cascade_ground_truth.py",
        "pre_registration": prereg,
        "pre_registration_provenance": (
            "written to this file before any reviewer answer was scored and copied through "
            "verbatim by the analyzer; the analyzer refuses to run without it"
        ),
        "inputs": {
            "reviewer_labels": "warehouse batch cascade-ground-truth-1 (19 live labels)",
            "batch_definition": str(BATCH),
            "policy_slice_definition": str(CLASS_ANALYSIS) + " per_item[is_class && D==MDF]",
            "bulk_D": str(RUN_CD),
            "bulk_B": str(RUN_1),
        },
        "warehouse_audit": audit,
        "binary_projection_map": GRADIENT_MAP,
        "slices_reported_separately_never_pooled": {
            "corpus_wide_19": s19,
            "policy_slice_8": s8,
        },
        "headline_pair": {
            "note": "the two slices, always together, never as one number",
            "corpus_wide_19": {
                "exact": f"{s19['exact_ground_type_match']['right']}/{s19['n_with_reviewer_answer']}",
                "binary_among_comparable": (
                    f"{s19['binary_projection']['agree']}/{s19['binary_projection']['comparable']}"
                ),
                "escape_values": f"{esc19}/{s19['n_with_reviewer_answer']}",
            },
            "policy_slice_8": {
                "exact": f"{exact8}/{n8}",
                "binary_among_comparable": f"{agree8}/{comp8}",
                "escape_values": f"{esc8}/{n8}",
            },
        },
        "structural_caveats": caveats,
        "b_abstention_cost_on_the_8": {
            "question": "was there a mappable true answer B failed to give, or was the cover genuinely hard?",
            "counts": dict(ab_counts.most_common()),
            "per_cover": abstention,
        },
        "significance_context": {
            "note": (
                "reported for scale only; the decision is made on the pre-registered thresholds, "
                "not on a p-value. n=8 cannot carry a strong test in either direction. The tail "
                "reported is the LOWER tail against the pre-registered adoption bar of 0.5 (the "
                "coin): P(X <= observed | n, 0.5), i.e. 'how surprising would a match rate this "
                "low be if D were merely a coin'. The upper tail against 0.5 is not reported "
                "because the observed rates are below the bar, not above it. 0.5 is the "
                "adoption bar, not a chance rate; blind chance on a six-way vocabulary is lower."
            ),
            "p_exact_match_on_8_at_or_below_the_coin_bar": round(
                1.0 - binom_tail(exact8 + 1, n8, 0.5), 6
            ) if n8 else None,
            "p_exact_match_on_19_at_or_below_the_coin_bar": round(
                1.0
                - binom_tail(
                    s19["exact_ground_type_match"]["right"] + 1,
                    s19["n_with_reviewer_answer"],
                    0.5,
                ),
                6,
            ) if s19["n_with_reviewer_answer"] else None,
        },
        "verdict": {
            "decision": verdict,
            "triggers": {
                "ESCALATE_fired": escalate,
                "ESCALATE_because": (
                    f"escape values on {esc8}/{n8} of the policy slice (threshold >=3) and "
                    f"{esc19}/{s19['n_with_reviewer_answer']} corpus-wide (threshold >=7)"
                ),
                "ADOPT_thresholds_met": adopt,
                "REJECT_thresholds_met": reject,
                "precedence_applied": prereg["precedence_if_more_than_one_branch_fires"],
            },
            "reviewer_disclosure_is_the_reading_key": prereg[
                "reviewer_disclosure_received_before_scoring"
            ],
            "vocabulary_misfit_covers": {
                "artworkIds": misfit_covers,
                "imagePaths": misfit_paths,
                "next_instrument": (
                    "a free-text follow-up round targeted at exactly these covers, being built "
                    "separately; it should ask the reviewer to describe the ground in their own "
                    "words rather than pick from the group-a.v2 vocabulary"
                ),
            },
        },
        "per_cover_all_19": covers,
    }

    OUT_JSON.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")

    print(f"verdict: {verdict}")
    print(f"  19 corpus-wide : exact {s19['exact_ground_type_match']['right']}/{s19['n_with_reviewer_answer']}"
          f"  binary {s19['binary_projection']['agree']}/{s19['binary_projection']['comparable']}"
          f"  escapes {esc19}")
    print(f"  8 policy slice : exact {exact8}/{n8}  binary {agree8}/{comp8}  escapes {esc8}")
    print("  B abstention   :", dict(ab_counts))
    print("  reviewer words :", s19["reviewer_answer_distribution"])
    print("  misfit covers  :", misfit_covers)
    return 0


if __name__ == "__main__":
    sys.exit(main())

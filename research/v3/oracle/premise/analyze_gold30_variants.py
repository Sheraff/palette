"""Score any prompt variant against the reviewer's own `ground_type` answers on the gold 30.

    .venv/bin/python analyze_gold30_variants.py

Why this exists. PREMISE_NEXT.md §4 states the run's decision gate as TWO numbers together:
"Unmapped share <=15% **and** exact match >=22/30 -> group A's ground question is good enough to
go corpus-wide at group-a.v2". The unmapped share falls out of `analyze.py`; the exact match
against the reviewer does not, because the gold-30 comparison was done once, inside the
disambiguation batch, and only for variants A and B. When the criterion arm (C/D) ran, the second
half of its own gate was therefore uncomputable from anything in the repo — which is how an
adverse result sat unread. This script computes it for every variant in both runs, from the
committed files, offline.

Self-check: it recomputes A and B from the raw run and asserts they match the numbers the
disambiguation analysis already published. If that assert ever fires, this script is wrong, not
the older artifact.

WHAT THE COMPARISON IS. `reviewerGroundType` is an ELICITED human label — the reviewer answering
the oracle's own question on the 30 artworks where oracle and algorithm flag contradicted. It is
the only elicited label in this workstream, and it is not a random sample: PHASE_0_DECISIONS.md
§4 P6's caveats about the accepted-palette flag do not apply here, but a HARD-CASE caveat does.
These 30 are the corpus's contested items, so an exact-match rate here is not a corpus-wide
accuracy and must never be quoted as one.

Writes research/v3/data/oracle-premise/gold30-variant-agreement.json.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze import GRADIENT_MAP  # noqa: E402  (the reviewed binary map, reused not re-derived)
from common import DATA_DIR, REPO_ROOT, read_jsonl  # noqa: E402

GOLD = REPO_ROOT / "research" / "v3" / "data" / "oracle-validation" / \
    "premise-disambiguation-1-analysis.json"
RUNS = {
    "premise-run-1": DATA_DIR / "premise-run-1.jsonl",
    "premise-run-cd": DATA_DIR / "premise-run-cd.jsonl",
}
OUT = DATA_DIR / "gold30-variant-agreement.json"

# [REVIEWED] PREMISE_NEXT.md §4, "The decision this run feeds": the two halves of the gate that
# releases group A's ground question to the whole corpus. Both must hold.
GATE_EXACT_MATCH_MIN = 22          # out of 30
GATE_UNMAPPED_SHARE_MAX = 0.15
# [REVIEWED] PREMISE_NEXT.md §4, "Secondary — wording robustness": two independent wordings of a
# corrected criterion should pin the answer down at least as well as A and B did.
GATE_INTER_VARIANT_BINARY_DISAGREEMENT_MAX = 0.15


def main() -> int:
    gold = json.loads(GOLD.read_text(encoding="utf-8"))
    # `answered` filter: an unanswered gold item carries no reviewer label to score against.
    gold_rows = [g for g in gold["perArtwork"] if g.get("answered")]
    gold_by_sha = {g["sha256"]: g for g in gold_rows}
    assert len(gold_by_sha) == len(gold_rows), "duplicate sha in the gold set"

    out: dict = {
        "what_this_is": (
            "Every prompt variant's ground_type scored against the reviewer's own answers on the "
            "gold 30 — the second half of PREMISE_NEXT.md §4's decision gate. These 30 artworks "
            "are the CONTESTED ones (oracle and algorithm flag disagreed), so no rate here is a "
            "corpus-wide accuracy."),
        "generated_by": "research/v3/oracle/premise/analyze_gold30_variants.py",
        "inputs": {"gold": str(GOLD), "runs": {k: str(v) for k, v in RUNS.items()}},
        "gold_items": len(gold_rows),
        "scope_note": (
            "`corpus_unmapped*` is over ALL ok non-canary rows for the variant (142 images), "
            "which is the population §4's gate speaks about. `analyze.py`'s "
            "`unmapped_label_count` is over its PRIMARY subset (137 — conflicted-truth artworks "
            "excluded), so A reads 63/142 = 0.4437 here and 60/137 = 0.4380 there. Same fact, "
            "two populations; neither is wrong."),
        "gate": {
            "exact_match_min_of_30": GATE_EXACT_MATCH_MIN,
            "unmapped_share_max": GATE_UNMAPPED_SHARE_MAX,
            "inter_variant_binary_disagreement_max": GATE_INTER_VARIANT_BINARY_DISAGREEMENT_MAX,
            "source": "PREMISE_NEXT.md §4",
        },
        "per_variant": {},
    }

    for run_name, path in RUNS.items():
        rows = [r for r in read_jsonl(path)
                if not r.get("is_canary") and r.get("status") == "ok" and r.get("parsed")]
        if not rows:
            raise SystemExit(f"{path} holds no usable rows")
        variants = sorted({r["prompt_variant"] for r in rows})
        for v in variants:
            by_sha = {r["image_sha256"]: r["parsed"] for r in rows if r["prompt_variant"] == v}
            joined = [s for s in gold_by_sha if s in by_sha]
            exact = sum(1 for s in joined
                        if by_sha[s]["ground_type"] == gold_by_sha[s]["reviewerGroundType"])
            # The binary comparison drops an item when EITHER side declined the binary: the
            # reviewer choosing a value the map does not cover, or the variant answering an
            # unmapped label. Same rule the disambiguation analysis used ("unmapped labels
            # dropped"), which is why variant A is scored on 20 items there and B on 24.
            binary_items = [s for s in joined
                            if gold_by_sha[s].get("reviewerBinary")
                            and GRADIENT_MAP[by_sha[s]["ground_type"]] != "unmapped"]
            binary_agree = sum(
                1 for s in binary_items
                if GRADIENT_MAP[by_sha[s]["ground_type"]] == gold_by_sha[s]["reviewerBinary"])
            unmapped = sum(1 for s in joined
                           if GRADIENT_MAP[by_sha[s]["ground_type"]] == "unmapped")
            # Corpus-wide unmapped share, from the same run — the gate's other half.
            corpus = [r["parsed"] for r in rows if r["prompt_variant"] == v]
            corpus_unmapped = sum(1 for p in corpus
                                  if GRADIENT_MAP[p["ground_type"]] == "unmapped")
            out["per_variant"][v] = {
                "run": run_name,
                "gold30_joined": len(joined),
                "exact_match": exact,
                "exact_match_rate": round(exact / len(joined), 4) if joined else None,
                "binary_items": len(binary_items),
                "binary_agree": binary_agree,
                "binary_agree_rate": (round(binary_agree / len(binary_items), 4)
                                      if binary_items else None),
                "unmapped_on_gold30": unmapped,
                "corpus_unmapped": corpus_unmapped,
                "corpus_rows": len(corpus),
                "corpus_unmapped_share": round(corpus_unmapped / len(corpus), 4) if corpus else None,
                "ground_type_distribution_on_gold30": dict(
                    Counter(by_sha[s]["ground_type"] for s in joined)),
                "gate_exact_match_met": exact >= GATE_EXACT_MATCH_MIN,
                "gate_unmapped_met": (len(corpus) > 0
                                      and corpus_unmapped / len(corpus) <= GATE_UNMAPPED_SHARE_MAX),
            }

    # ---- self-check against the already-published A/B figures -------------------------
    totals = gold.get("totals", {})
    checks = []
    for block, pub_n, pub_k, my_n, my_k in (
            ("exactMatchWithOracle", "n", "matched", "gold30_joined", "exact_match"),
            ("binaryAgreementWithOracle", "n", "agreed", "binary_items", "binary_agree")):
        for v, tot in totals.get(block, {}).items():
            if v not in out["per_variant"]:
                continue
            mine = out["per_variant"][v]
            row = {"variant": v, "block": block,
                   "published": f"{tot[pub_k]}/{tot[pub_n]}",
                   "recomputed": f"{mine[my_k]}/{mine[my_n]}"}
            row["match"] = row["published"] == row["recomputed"]
            checks.append(row)
            assert row["match"], (
                f"variant {v} {block}: disambiguation analysis published {row['published']}, "
                f"this script recomputes {row['recomputed']}. This script is wrong, not the "
                "older artifact.")
    out["self_check_against_disambiguation_1"] = checks or [
        {"note": "premise-disambiguation-1-analysis.json holds no per-variant totals block; "
                 "the A/B cross-check could not be run automatically."}]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent="\t") + "\n", encoding="utf-8")
    print(json.dumps({v: {k: e[k] for k in
                          ("run", "exact_match", "binary_agree", "binary_items",
                           "corpus_unmapped_share", "gate_exact_match_met", "gate_unmapped_met")}
                      for v, e in out["per_variant"].items()}, indent="\t"))
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

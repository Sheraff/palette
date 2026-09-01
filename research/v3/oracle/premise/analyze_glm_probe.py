"""Score the GLM out-of-family probe: agreement triangles and, the actual point, DECORRELATION.

    .venv/bin/python analyze_glm_probe.py [--out <analysis.json>]

THE QUESTION THIS ANSWERS, and the one it does not. Agreement between GLM and Qwen is easy to
compute and nearly useless on its own: two models can agree because both are right, or because
both are wrong in the same way. What A10 asks is whether an out-of-family arm's ERRORS ARE
INDEPENDENT of the Qwen arms' — because an adjudicator that is wrong wherever the thing it
adjudicates is wrong adds nothing. So the headline number here is not agreement, it is the 2x2 of
GLM-correct x Qwen-correct against the REVIEWER, and the honest report of how few cells that 2x2
has anything in.

WHY THE REVIEWER VERTEX IS SO SMALL, stated up front rather than buried. `bcde-validation-1` was
drawn from the coverage-set core, which barely intersects eval-142: exactly THREE of these 30
covers carry a direct reviewer answer to `has_dominant_subject` / `subject_kind`. The dense human
signal on eval-142 is the SAM rounds, whose `mask_correct.<noun>` verdicts are a human confirming
that a NAMED NOUN is really on the cover — noun ground truth, which is what the live consumer
(SAM dynamic prompting) actually needs. That is the vertex this script leans on, and it is still
only a few dozen judgements.

THE CIRCULARITY TRAP, and how it is avoided. Some `mask_correct.*` tags are DYNAMIC — `dyn-animal`,
`dyn-building`, `dyn-noun-*` — meaning the noun that was sent to SAM came from QWEN'S OWN ANSWER.
Scoring GLM against a ground truth whose existence was conditioned on Qwen having said that word
would hand Qwen the comparison for free. Those tags are excluded from the scored set and reported
separately. Only STATIC prompts (`person`, `face`), which were sent for every cover regardless of
any model's answer, are used as unconditioned noun ground truth.

WHAT IS EXCLUDED AND WHY. `words`, `letter`, `lettering`, `display-text`, `logo`, `emblem`,
`sticker`, `parental-advisory`, `album-title`, `cjk-script`, `kanji` are text and overlay tags.
Variant J's prompt says in as many words that "Lettering is not a thing", so a model that
correctly omits `words` would be scored WRONG against them. They are not evidence about the noun
question and are dropped.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

DATA = common.DATA_DIR
WAREHOUSE = common.REPO_ROOT / "research" / "v3" / "data" / "warehouse" / "warehouse.jsonl"
ITEMS_PATH = DATA / "glm-probe-items.json"
GLM_RUN = DATA / "glm-probe-1.jsonl"
QWEN_J_RUN = DATA / "subject-nouns-all-1.jsonl"
QWEN_G_RUN = DATA / "subject-noun-1.jsonl"
QWEN_BCDE_RUN = DATA / "group-bcde-pilot-1.jsonl"

# [REVIEWED] SAM mask tags that were prompted for EVERY cover, independent of any model's answer.
# Only these can ground a model-vs-model error comparison without favouring the model whose answer
# generated the prompt. See the module docstring's circularity note.
STATIC_SUBJECT_TAGS = ("person", "face")
# [REVIEWED] Tags whose noun came from the VLM's own answer. Reported, never scored.
DYNAMIC_TAG_PREFIX = "dyn-"
# [REVIEWED] Text and overlay tags. Variant J excludes lettering from the answer space by
# instruction, so these cannot be evidence for or against a J answer.
TEXT_TAGS = ("words", "letter", "lettering", "display-text", "logo", "emblem", "sticker",
             "parental-advisory", "album-title", "cjk-script", "kanji")

# [REVIEWED] Words that name a human being, for matching a noun list against a reviewer-confirmed
# `person` / `face` mask. Deliberately a SHORT, EXPLICIT list rather than a stemmer or an
# embedding: the whole probe turns on error attribution, and a fuzzy matcher that silently counts
# `statue` as a person would manufacture agreement that nobody can audit. A word not in this list
# is not a person, and the misses are printed so the list can be argued with.
PERSON_WORDS = frozenset({
    "person", "people", "man", "men", "woman", "women", "boy", "girl", "child", "children",
    "human", "figure", "portrait", "face", "musician", "singer", "band", "couple", "crowd",
    "baby", "lady", "guy", "dancer", "soldier", "worker", "rapper", "model", "girls", "boys",
})


def norm(word: str) -> str:
    """Lowercase, trim, drop a trailing plural `s`. Nothing cleverer: the run files hold the
    model's verbatim answer, and every normalization applied here is one a reader must be able to
    reverse in their head."""
    w = word.strip().lower()
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        w = w[:-1]
    return w


def is_person(words: list[str]) -> bool:
    return any(norm(w) in PERSON_WORDS or norm(w) in {norm(p) for p in PERSON_WORDS}
               for w in words)


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    return [r for r in rows if not r.get("is_canary") and r.get("status") == "ok"]


def answers(row: dict[str, Any]) -> dict[str, Any]:
    """The GLM runner writes the canonical answer under `answers`; the Qwen runners under
    `parsed`. Same content, and both are read here so neither run file has to be rewritten."""
    return row.get("parsed") if row.get("parsed") is not None else row.get("answers")


def reviewer_labels(artwork_ids: set[str]) -> dict[str, list[dict[str, Any]]]:
    """Human labels for these artworks, superseded revisions resolved away.

    Join on artworkId, never sha256: the SAM rounds record the composited review-overlay PNG's
    hash, not the cover's, so a sha256 join drops most of the usable signal.
    """
    recs = [json.loads(l) for l in WAREHOUSE.read_text().splitlines() if l.strip()]
    labels = [r for r in recs if r.get("type") == "oracle-label"]
    superseded = {r["supersedes"] for r in labels if r.get("supersedes")}
    labels = [r for r in labels if r["id"] not in superseded]
    out: dict[str, list[dict[str, Any]]] = {a: [] for a in artwork_ids}
    for r in labels:
        aid = (r.get("artwork") or {}).get("rendition", {}).get("artworkId")
        if aid in out:
            out[aid].append(r)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DATA / "glm-probe-1-analysis.json")
    args = ap.parse_args()

    items = json.loads(ITEMS_PATH.read_text())
    covers = items["covers"]
    order = [c["artworkId"] for c in covers]
    by_aid = {c["artworkId"]: c for c in covers}

    glm = load_rows(GLM_RUN)
    glm_j = {r["artwork_id"]: answers(r) for r in glm if r["prompt_variant"] == "J"}
    glm_e = {r["artwork_id"]: answers(r) for r in glm if r["prompt_variant"] == "E"}
    qwen_j = {r["artwork_id"]: answers(r) for r in load_rows(QWEN_J_RUN)}
    qwen_g = {r["artwork_id"]: answers(r) for r in load_rows(QWEN_G_RUN)}
    bcde = load_rows(QWEN_BCDE_RUN)
    qwen_e = {r["artwork_id"]: answers(r) for r in bcde if r["prompt_variant"] == "E"}
    qwen_f = {r["artwork_id"]: answers(r) for r in bcde if r["prompt_variant"] == "F"}

    rev = reviewer_labels(set(order))

    report: dict[str, Any] = {
        "purpose": "GLM-4.5V out-of-family probe: agreement triangles and error decorrelation.",
        "generated_by": "research/v3/oracle/premise/analyze_glm_probe.py",
        "generated_at": common.utc_now(),
        "items": str(ITEMS_PATH.relative_to(common.REPO_ROOT)),
        "n_covers": len(order),
        "population_caveat": items["caveat"],
    }

    # ---------------------------------------------------- 1. model-model, n=30
    kinds = {"has_dominant_subject": {}, "subject_kind": {}}
    for field in kinds:
        pair = Counter()
        for aid in order:
            g, e, f = glm_e.get(aid), qwen_e.get(aid), qwen_f.get(aid)
            if not (g and e and f):
                continue
            pair["glm==qwenE"] += g[field] == e[field]
            pair["glm==qwenF"] += g[field] == f[field]
            pair["qwenE==qwenF"] += e[field] == f[field]
            pair["glm==both"] += g[field] == e[field] == f[field]
            pair["n"] += 1
        kinds[field] = dict(pair)
    report["model_model_agreement"] = kinds

    # In-family vs out-of-family agreement, side by side. If GLM agreed with Qwen about as often
    # as Qwen's two wordings agree with each other, "out of family" would be buying nothing.
    report["family_contrast"] = {
        field: {
            "in_family_qwenE_vs_qwenF": f"{k['qwenE==qwenF']}/{k['n']}",
            "out_of_family_glm_vs_qwenE": f"{k['glm==qwenE']}/{k['n']}",
            "out_of_family_glm_vs_qwenF": f"{k['glm==qwenF']}/{k['n']}",
        } for field, k in kinds.items()
    }

    # ---------------------------------------------------- 2. noun lists, n=30
    noun_rows = []
    jac_sum = 0.0
    for aid in order:
        g = (glm_j.get(aid) or {}).get("subject_nouns_all", [])
        q = (qwen_j.get(aid) or {}).get("subject_nouns_all", [])
        gs, qs = {norm(x) for x in g}, {norm(x) for x in q}
        inter, union = gs & qs, gs | qs
        jac = len(inter) / len(union) if union else 1.0
        jac_sum += jac
        noun_rows.append({
            "artworkId": aid,
            "glm_J": g, "qwen_J": q,
            "qwen_G_single_noun": (qwen_g.get(aid) or {}).get("subject_noun"),
            "shared": sorted(inter), "glm_only": sorted(gs - qs), "qwen_only": sorted(qs - gs),
            "jaccard": round(jac, 3),
        })
    report["noun_lists"] = {
        "mean_jaccard": round(jac_sum / len(order), 3),
        "covers_with_zero_overlap": sum(1 for r in noun_rows if r["jaccard"] == 0.0),
        "covers_identical": sum(1 for r in noun_rows if r["jaccard"] == 1.0),
        "mean_len_glm": round(sum(len(r["glm_J"]) for r in noun_rows) / len(noun_rows), 2),
        "mean_len_qwen": round(sum(len(r["qwen_J"]) for r in noun_rows) / len(noun_rows), 2),
        "per_cover": noun_rows,
    }

    # ---------------------------------------------------- 3. the reviewer vertex
    # Every scored item is (cover, question, reviewer answer, glm answer, qwen answer). Item
    # types are kept labelled and never silently pooled into one rate.
    scored: list[dict[str, Any]] = []
    dynamic_seen: list[dict[str, Any]] = []
    unscorable: list[dict[str, Any]] = []
    seen_items: set[tuple[str, str]] = set()

    for aid in order:
        labels = rev.get(aid, [])
        g_e, q_e, q_f = glm_e.get(aid), qwen_e.get(aid), qwen_f.get(aid)
        g_nouns = (glm_j.get(aid) or {}).get("subject_nouns_all", [])
        q_nouns = (qwen_j.get(aid) or {}).get("subject_nouns_all", [])

        # One judgement per (cover, question). The same question is re-asked across rounds — the
        # `face` verdict on 00116380 appears in both sam-mask-quality-1 and -3 — and counting it
        # twice would double-weight one cover inside an already tiny n. Latest timestamp wins,
        # which is the same recency rule the warehouse uses everywhere else.
        latest: dict[str, dict[str, Any]] = {}
        for lab in sorted(labels, key=lambda r: r["ts"]):
            latest[lab["questionKey"]] = lab

        for lab in latest.values():
            qk, ans = lab["questionKey"], lab["answer"]
            if (aid, qk) in seen_items:
                continue
            seen_items.add((aid, qk))

            # (a) direct bcde answers — the only true like-for-like, and there are three.
            if qk in ("has_dominant_subject", "subject_kind") and g_e and q_e:
                scored.append({
                    "artworkId": aid, "item_type": f"bcde:{qk}", "reviewer": ans,
                    "glm": g_e[qk], "qwen_e": q_e[qk], "qwen_f": (q_f or {}).get(qk),
                    "glm_correct": g_e[qk] == ans, "qwen_correct": q_e[qk] == ans,
                    "same_bytes": by_aid[aid].get("reviewerBcde", {}).get("sameBytes"),
                })

            # (b) static SAM noun masks — unconditioned noun ground truth.
            if qk.startswith("mask_correct."):
                tag = qk.split(".", 1)[1]
                if tag.startswith(DYNAMIC_TAG_PREFIX):
                    dynamic_seen.append({"artworkId": aid, "tag": tag, "answer": ans})
                    continue
                if tag in TEXT_TAGS or tag not in STATIC_SUBJECT_TAGS:
                    continue
                # [MEASURED 2026-08-04] The warehouse stores these as the STRINGS 'yes'/'no',
                # not booleans. An `is True` test silently drops every one of them; it did, and
                # the empty item type is what caught it.
                if ans != "yes":
                    # A wrong MASK is not evidence the noun is absent — SAM can miss a person
                    # who is plainly there. Only a confirmed mask grounds "this noun is present".
                    continue
                scored.append({
                    "artworkId": aid, "item_type": f"noun_present:{tag}", "reviewer": "person",
                    "glm": g_nouns, "qwen_e": q_nouns, "qwen_f": None,
                    "glm_correct": is_person(g_nouns), "qwen_correct": is_person(q_nouns),
                    "same_bytes": None,
                })

            # (c) big_area_is_real_subject — a human saying the dominant region really is a
            # subject. Maps onto has_dominant_subject != none. Reported as its own item type
            # because the mapping is an interpretation, not the reviewer's own wording.
            # [MEASURED 2026-08-04] Its vocabulary is 'real-subject' / 'whole-image', NOT a
            # boolean. Only 'real-subject' is evidence here: it says the dominant region really
            # is a subject, so the cover has one. 'whole-image' says that ONE SAM REGION was just
            # the whole frame — it does not say the cover is subjectless, because a different
            # region could still hold the subject. Scoring it as "no subject" is a mapping error,
            # and treating it as informative would invent a correlated-failure cell out of
            # nothing. Those items are counted as unscorable and listed, not scored.
            if qk == "big_area_is_real_subject" and g_e and q_e:
                if ans != "real-subject":
                    unscorable.append({"artworkId": aid, "questionKey": qk, "answer": ans,
                                       "why": "'whole-image' is not evidence about "
                                              "has_dominant_subject; see the note in this file"})
                    continue
                scored.append({
                    "artworkId": aid, "item_type": "derived:has_a_real_subject",
                    "reviewer": "has_subject",
                    "glm": g_e["has_dominant_subject"], "qwen_e": q_e["has_dominant_subject"],
                    "qwen_f": (q_f or {}).get("has_dominant_subject"),
                    "glm_correct": g_e["has_dominant_subject"] != "none",
                    "qwen_correct": q_e["has_dominant_subject"] != "none",
                    "same_bytes": None,
                    "one_sided": True,
                })

    # The 2x2 that is the whole point.
    cells = Counter()
    for s in scored:
        cells[(s["glm_correct"], s["qwen_correct"])] += 1
    both_right = cells[(True, True)]
    glm_only = cells[(True, False)]
    qwen_only = cells[(False, True)]
    both_wrong = cells[(False, False)]
    n = len(scored)
    disagree = glm_only + qwen_only
    report["decorrelation"] = {
        "n_scored_items": n,
        "matrix": {
            "both_correct": both_right,
            "glm_correct_qwen_wrong": glm_only,
            "glm_wrong_qwen_correct": qwen_only,
            "both_wrong": both_wrong,
        },
        "glm_accuracy": f"{both_right + glm_only}/{n}",
        "qwen_accuracy": f"{both_right + qwen_only}/{n}",
        "errors_glm": both_wrong + qwen_only,
        "errors_qwen": both_wrong + glm_only,
        "errors_shared": both_wrong,
        "shared_error_share_of_glm_errors": (
            round(both_wrong / (both_wrong + qwen_only), 3) if (both_wrong + qwen_only) else None),
        "reading": (
            "`both_wrong` is the correlated-failure cell — the items where a second opinion "
            "would have changed nothing. `glm_correct_qwen_wrong` is the cell that pays for the "
            "48.53 GB. Compare `shared_error_share_of_glm_errors` against A10's 97.7% correlated "
            "abstention: that is the in-family number this probe exists to beat."),
        "by_item_type": {
            t: {
                "n": sum(1 for s in scored if s["item_type"] == t),
                "glm_correct": sum(1 for s in scored if s["item_type"] == t and s["glm_correct"]),
                "qwen_correct": sum(1 for s in scored if s["item_type"] == t and s["qwen_correct"]),
                "both_wrong": sum(1 for s in scored
                                  if s["item_type"] == t and not s["glm_correct"]
                                  and not s["qwen_correct"]),
            } for t in sorted({s["item_type"] for s in scored})
        },
        "items": scored,
        "excluded_dynamic_tags": {
            "why": ("The noun sent to SAM came from Qwen's own answer, so a reviewer verdict on "
                    "that mask is conditioned on Qwen having said the word. Scoring GLM against "
                    "it would hand Qwen the comparison."),
            "count": len(dynamic_seen),
            "items": dynamic_seen,
        },
        "unscorable": {
            "why": ("Reviewer answers whose vocabulary does not map onto anything either model "
                    "was asked. Listed rather than forced into a binary, because forcing them "
                    "is how a correlated-failure cell gets invented."),
            "count": len(unscorable),
            "items": unscorable,
        },
        "small_n_caveat": (
            f"n = {n} judgements over at most {len({s['artworkId'] for s in scored})} covers, and "
            "the items are NOT independent — several come from the same cover, and the covers "
            "were drawn to maximize review attention, which was itself partly conditioned on "
            "model disagreement. No confidence interval on a number this small and this "
            "conditioned would mean anything; the per-item list is the evidence, the rate is a "
            "summary of it."),
    }

    args.out.write_text(json.dumps(report, indent="\t") + "\n")

    # ---- terse console summary
    print(f"covers: {len(order)}")
    for field, k in kinds.items():
        print(f"{field:24s} qwenE==qwenF {k['qwenE==qwenF']}/{k['n']}   "
              f"glm==qwenE {k['glm==qwenE']}/{k['n']}   glm==qwenF {k['glm==qwenF']}/{k['n']}")
    nl = report["noun_lists"]
    print(f"noun lists: mean jaccard {nl['mean_jaccard']}  zero-overlap {nl['covers_with_zero_overlap']}"
          f"  identical {nl['covers_identical']}  len glm {nl['mean_len_glm']} qwen {nl['mean_len_qwen']}")
    d = report["decorrelation"]
    print(f"reviewer-scored items: {d['n_scored_items']}")
    print(f"  both correct {both_right}  glm-only {glm_only}  qwen-only {qwen_only}  both wrong {both_wrong}")
    print(f"  glm {d['glm_accuracy']}  qwen {d['qwen_accuracy']}  shared-error share of GLM errors "
          f"{d['shared_error_share_of_glm_errors']}")
    for t, v in d["by_item_type"].items():
        print(f"  {t:38s} n={v['n']:2d} glm={v['glm_correct']:2d} qwen={v['qwen_correct']:2d} both_wrong={v['both_wrong']:2d}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

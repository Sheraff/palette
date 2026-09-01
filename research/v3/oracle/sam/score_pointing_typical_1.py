#!/usr/bin/env python3
"""Score reviewer round `pointing-typical-1` against POINTING_TYPICAL_PREREG.md sec 6.

CPU only. Reads answers from the warehouse CLI JSONL dump and the completed run file.
Writes research/v3/data/sam/pointing-typical-1-analysis.json.

Scoring is exactly as pre-registered (bafcc53, before inference):
  cover dot verdict = majority of the cover's three tile answers,
                      `can't tell` counts as neither, a TIE is scored DOT-WRONG.
  B1  dot-right >= 12/16
  B2  dot-right-and-wash-right >= 8/16, counted PER POLICY over that policy's 16 tiles
  B3  B1 AND (B2 for >= 1 policy)
  B4  challenger clears B2 AND beats `containing` by >= 3/16 AND breaks <= 1 already-passing cover
"""

import hashlib
import json
import pathlib
import subprocess
import sys
from collections import Counter

V3 = pathlib.Path(__file__).resolve().parents[2]
REPO = V3.parents[1]
RUN = V3 / "data" / "sam" / "pointing-typical-1-run.json"
OUT = V3 / "data" / "sam" / "pointing-typical-1-analysis.json"
BATCH = "pointing-typical-1"
POLICIES = ["containing", "ground", "union"]

DOT_RIGHT = {"dot_right_wash_right", "dot_right_wash_wrong"}
BOTH_RIGHT = "dot_right_wash_right"
DOT_WRONG = "dot_wrong"
CANT_TELL = "cant_tell"


def warehouse(latest: bool) -> list[dict]:
    cmd = [
        "node", "--experimental-strip-types",
        str(V3 / "src" / "warehouse" / "cli.ts"),
        "query", "--batch", BATCH, "--json", "--no-retracted", "--limit", "500",
    ]
    if latest:
        cmd.insert(cmd.index("--json") + 1, "--latest")
    res = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"warehouse CLI failed: {res.stderr[:800]}")
    return [json.loads(l) for l in res.stdout.splitlines() if l.strip()]


def main() -> None:
    latest_rows = warehouse(True)
    raw_rows = warehouse(False)
    labels = [r for r in latest_rows if r["type"] == "oracle-label"]
    raw_labels = [r for r in raw_rows if r["type"] == "oracle-label"]

    # --- provenance / supersession ------------------------------------------------
    regraded = [
        {
            "imageId": r["imageId"],
            "revision": r["revision"],
            "supersedes": r["supersedes"],
            "answer": r["answer"],
            "ts": r["ts"],
        }
        for r in raw_labels
        if r.get("supersedes")
    ]
    superseded_ids = {r["supersedes"] for r in regraded}
    prior = {
        r["id"]: r["answer"] for r in raw_labels if r["id"] in superseded_ids
    }
    for g in regraded:
        g["previous_answer"] = prior.get(g["supersedes"])

    run = json.loads(RUN.read_text())
    rows = {r["cover_id"]: r for r in run["rows"]}

    # --- answers keyed by (cover, policy) -----------------------------------------
    ans: dict[tuple[str, str], dict] = {}
    for r in labels:
        cover, policy = r["imageId"].split("|")
        key = (cover, policy)
        if key in ans:
            sys.exit(f"duplicate latest label for {key}")
        ans[key] = r
    covers = sorted({c for c, _ in ans})
    assert len(covers) == 16, len(covers)
    assert len(ans) == 48, len(ans)

    # --- duplicate tiles, recomputed from mask bytes -------------------------------
    dup_info = {}
    for c in covers:
        digests = {
            p: hashlib.sha256(rows[c]["policies"][p]["mask_rle"].encode()).hexdigest()
            for p in POLICIES
        }
        groups: dict[str, list[str]] = {}
        for p, d in digests.items():
            groups.setdefault(d, []).append(p)
        dup_info[c] = {
            "distinct_masks": len(groups),
            "identical_groups": [g for g in groups.values() if len(g) > 1],
            "ground_same_candidate_as_containing": bool(
                rows[c]["policies"]["ground"].get("same_candidate_as_containing")
            ),
        }
    duplicate_tiles = sum(3 - v["distinct_masks"] for v in dup_info.values())
    distinct_images = sum(v["distinct_masks"] for v in dup_info.values())

    # --- per cover ------------------------------------------------------------------
    per_cover = []
    for c in covers:
        tiles = {p: ans[(c, p)]["answer"] for p in POLICIES}
        n_right = sum(1 for a in tiles.values() if a in DOT_RIGHT)
        n_wrong = sum(1 for a in tiles.values() if a == DOT_WRONG)
        n_ct = sum(1 for a in tiles.values() if a == CANT_TELL)
        dot_right = n_right > n_wrong  # tie -> dot-wrong, as pre-registered
        per_cover.append({
            "cover": c,
            "n_distinct_points": rows[c]["n_distinct_points"],
            "points_shortfall": rows[c]["points_shortfall"],
            "answers": tiles,
            "areas": {p: rows[c]["policies"][p]["area_fraction"] for p in POLICIES},
            "dot_tally": {"right": n_right, "wrong": n_wrong, "cant_tell": n_ct},
            "dot_verdict": "dot-right" if dot_right else "dot-wrong",
            "dot_verdict_by_tie": (not dot_right) and n_right == n_wrong and n_right > 0,
            "both_right": {p: tiles[p] == BOTH_RIGHT for p in POLICIES},
            "distinct_masks": dup_info[c]["distinct_masks"],
            "identical_policy_groups": dup_info[c]["identical_groups"],
            "policy_comparison_has_content": not dup_info[c][
                "ground_same_candidate_as_containing"
            ],
        })

    # --- B1 ---------------------------------------------------------------------------
    dot_right_covers = [r["cover"] for r in per_cover if r["dot_verdict"] == "dot-right"]
    b1_n = len(dot_right_covers)
    b1 = b1_n >= 12

    # --- B2 ---------------------------------------------------------------------------
    both = {p: [r["cover"] for r in per_cover if r["both_right"][p]] for p in POLICIES}
    b2 = {p: {"n": len(both[p]), "bar": 8, "pass": len(both[p]) >= 8, "covers": both[p]}
          for p in POLICIES}

    # --- B3 ---------------------------------------------------------------------------
    b2_any = [p for p in POLICIES if b2[p]["pass"]]
    b3 = b1 and bool(b2_any)

    # --- B4 ---------------------------------------------------------------------------
    inc = set(both["containing"])
    b4 = {}
    for p in ("ground", "union"):
        ch = set(both[p])
        broke = sorted(inc - ch)
        b4[p] = {
            "clears_b2": b2[p]["pass"],
            "margin_over_containing": b2[p]["n"] - b2["containing"]["n"],
            "margin_bar": 3,
            "margin_ok": (b2[p]["n"] - b2["containing"]["n"]) >= 3,
            "breaks_already_passing": broke,
            "n_broken": len(broke),
            "breaks_ok": len(broke) <= 1,
            "gains_over_containing": sorted(ch - inc),
            "qualifies": b2[p]["pass"]
            and (b2[p]["n"] - b2["containing"]["n"]) >= 3
            and len(broke) <= 1,
        }
    promoted = [p for p in b4 if b4[p]["qualifies"]]
    default_selection = "containing"
    if promoted:
        promoted.sort(key=lambda p: -b4[p]["margin_over_containing"])
        if len(promoted) == 1 or b4[promoted[0]]["margin_over_containing"] > b4[
            promoted[1]
        ]["margin_over_containing"]:
            default_selection = promoted[0]

    # --- branch of sec 6.4 ------------------------------------------------------------
    if b1 and b2_any:
        branch = "B1 pass, B2 pass for >=1 policy"
    elif b1 and not b2_any:
        branch = "B1 pass, B2 fail for all three"
    elif not b1 and b2_any:
        branch = "B1 fail, B2 pass -- incoherent, instrument fault"
    else:
        branch = "B1 fail"

    tile_answers = Counter(r["answer"] for r in labels)

    analysis = {
        "generated": "2026-08-04",
        "batch": BATCH,
        "scored_against": "research/v3/oracle/sam/POINTING_TYPICAL_PREREG.md sec 6 (committed bafcc53, before inference)",
        "criterion": "STRICT -- 'is this correct', per prereg sec 5 framing text; first strict pointing measurement",
        "answer_key": None,
        "answer_key_note": "Typical covers have no ground-freetext-1 prose. This measures REVIEWER JUDGEMENT ONLY. sec 13.9's caveat is not retired.",
        "provenance": {
            "labels_latest": len(labels),
            "labels_raw": len(raw_labels),
            "regraded": regraded,
            "revisions": dict(Counter(r["revision"] for r in raw_labels)),
            "authors": dict(Counter(r["author"]["id"] for r in labels)),
            "first_answer_ts": min(r["ts"] for r in labels),
            "last_answer_ts": max(r["ts"] for r in labels),
            "run_git_head": run["git_head"],
            "supersession": "respected -- --latest --no-retracted, as in sec 13.4",
        },
        "tile_answer_counts": dict(tile_answers),
        "duplicates": {
            "duplicate_tiles": duplicate_tiles,
            "distinct_images": distinct_images,
            "total_tiles": 48,
            "ground_differs_from_containing_on": sum(
                1 for c in covers if dup_info[c]["ground_same_candidate_as_containing"] is False
            ),
            "covers_with_all_three_identical": [
                c for c in covers if dup_info[c]["distinct_masks"] == 1
            ],
            "consistency_check": None,
        },
        "per_cover": per_cover,
        "B1": {
            "criterion": "dot-right >= 12/16 (cover-level majority, tie=dot-wrong)",
            "n": b1_n,
            "bar": 12,
            "pass": b1,
            "dot_right_covers": dot_right_covers,
            "dot_wrong_covers": [
                r["cover"] for r in per_cover if r["dot_verdict"] == "dot-wrong"
            ],
        },
        "B2": {
            "criterion": "dot-right-and-wash-right >= 8/16 per policy",
            "per_policy": b2,
            "any_pass": b2_any,
            "pass": bool(b2_any),
        },
        "B3": {
            "criterion": "B1 AND at least one policy clears B2",
            "pass": b3,
            "route_verdict": None,
        },
        "B4": {
            "criterion": "clears B2 AND beats containing by >=3/16 AND breaks <=1 already-passing cover",
            "per_challenger": b4,
            "promoted": promoted,
            "DEFAULT_SELECTION": default_selection,
            "moved": default_selection != "containing",
        },
        "prereg_branch_fired": branch,
    }

    # intra-reviewer consistency on the byte-identical tiles (sec 15.3, read not designed)
    consistent, inconsistent = [], []
    for r in per_cover:
        for group in r["identical_policy_groups"]:
            answers = {p: r["answers"][p] for p in group}
            entry = {"cover": r["cover"], "policies": group, "answers": answers}
            (consistent if len(set(answers.values())) == 1 else inconsistent).append(entry)
    analysis["duplicates"]["consistency_check"] = {
        "identical_image_pairs_or_groups": len(consistent) + len(inconsistent),
        "answered_identically": len(consistent),
        "answered_differently": inconsistent,
        "note": "Read as the round's own noise floor, per sec 15.3. Not designed as a consistency check.",
    }

    # --- B2 split: informative covers vs byte-identical duplicates --------------------
    informative = [r for r in per_cover if r["policy_comparison_has_content"]]
    duplicated = [r for r in per_cover if not r["policy_comparison_has_content"]]
    analysis["B2"]["split_by_information_content"] = {
        "note": (
            "sec 15.3: the policy comparison has content only on the 9 covers where `ground` "
            "picked a different candidate than `containing`. On the other 7 the two tiles are "
            "byte-identical images, so any per-policy difference there is answer noise, not policy."
        ),
        "informative_covers": len(informative),
        "duplicate_covers": len(duplicated),
        "both_right_on_informative": {
            p: sum(1 for r in informative if r["both_right"][p]) for p in POLICIES
        },
        "both_right_on_duplicates": {
            p: sum(1 for r in duplicated if r["both_right"][p]) for p in POLICIES
        },
        "policy_changed_the_keypress_on": [
            r["cover"] for r in informative
            if len({r["answers"][p] for p in POLICIES}) > 1
        ],
        "finding": (
            "On 8 of the 9 informative covers all three policies drew the SAME keypress. "
            "The whole containing-1 / ground-2 / union-2 spread rests on one genuine cover "
            "(0005597105ba1e2d38f62cfc) plus two inconsistent answers to byte-identical images. "
            "The between-policy signal is smaller than the round's own noise floor."
        ),
    }

    # --- B1 detail: the tie rule did the work on 2 of 3 failures ----------------------
    all_ct = [r["cover"] for r in per_cover if r["dot_tally"]["cant_tell"] == 3]
    genuine_wrong = [
        r["cover"] for r in per_cover
        if r["dot_verdict"] == "dot-wrong" and r["dot_tally"]["wrong"] > 0
    ]
    analysis["B1"]["detail"] = {
        "tile_level_dot_right": sum(1 for r in labels if r["answer"] in DOT_RIGHT),
        "tile_level_total": len(labels),
        "covers_all_cant_tell_scored_dot_wrong_by_tie_rule": all_ct,
        "covers_with_a_genuine_dot_wrong_answer": genuine_wrong,
        "dot_right_among_covers_with_any_decidable_tile": (
            f"{b1_n}/{16 - len(all_ct)}"
        ),
        "note": (
            "2 of the 3 B1 failures are covers answered `can't tell` on all three tiles and "
            "scored dot-wrong by the pre-registered tie rule, not by a pointer miss. B1 cleared "
            "anyway, so the conservative direction of the tie rule did not manufacture the pass."
        ),
    }

    analysis["shortfall_covers"] = {
        r["cover"]: r["n_distinct_points"] for r in per_cover if r["points_shortfall"]
    }

    # --- the sec 6.3 cross-round report, non-numeric by instruction -------------------
    analysis["cross_round_pointing_ground_1"] = {
        "pointing_ground_1": {
            "criterion": "LENIENT -- 'could this be considered correct' (sec 13.2, disclosed after answering)",
            "stratum": "misfit tail -- exactly the covers already called 'none discernible'",
            "dot_right": "7/8", "both_right": "3/8", "n": 8,
        },
        "pointing_typical_1": {
            "criterion": "STRICT -- 'is this correct' (prereg sec 5 framing text)",
            "stratum": "typical, drawn from eval-142 minus all 15 pointing covers",
            "dot_right": f"{b1_n}/16",
            "both_right_best_policy": f"{max(b2[p]['n'] for p in POLICIES)}/16",
            "n": 16,
        },
        "comparison": "NOT PERFORMED NUMERICALLY -- criterion-confounded",
        "why": (
            "This is the first strict pointing measurement; round 1 was answered leniently, so its "
            "rates are ceilings and no delta between the two rounds separates the criterion change "
            "from the stratum change. Prereg sec 6.3 licenses reading only a GAIN, and only as a "
            "floor. The dot half is level to the eye and the composite direction is down; neither "
            "is interpretable across the criterion change, and NEITHER IS LOAD-BEARING: B2 fails "
            "against its own absolute pre-registered bar of 8/16, by six covers, with no reference "
            "to round 1 at all."
        ),
        "anchor": "sec 13's qualitative anchor stands unmoved: 'it wasn't amazing.'",
    }

    # --- route verdict (sec 13 framework, resolved by this round) --------------------
    analysis["B3"]["route_verdict"] = {
        "status": "route-not-carried-forward",
        "supersedes_status": "route-alive-pending-typical-strata-probe (sec 13.6)",
        "resolved": (
            "sec 13.6 left the route 'alive' ONLY pending this probe. This round IS that probe. "
            "It resolves against the route: pointing->SAM does not carry forward as a ground "
            "route under ANY of the three policies."
        ),
        "per_policy": {
            p: {"both_right": f"{b2[p]['n']}/16", "bar": "8/16", "carries_forward": b2[p]["pass"]}
            for p in POLICIES
        },
        "pointer_half": (
            f"CONFIRMED on ordinary covers: B1 {b1_n}/16 clears 12/16. This is the one thing "
            "sec 13's lenient 7/8 could not establish. The pointer is not the defect."
        ),
        "wash_half": (
            "FAILS on ordinary covers, for all three policies. Per prereg sec 6.4 branch 2, "
            "verbatim: 'the wash is a route-level defect, not a hard-tail artifact.'"
        ),
        "not_route_dead": (
            "sec 6.4's route-dead branch requires B1 to FAIL, and it did not. The pointer half is "
            "sound; the route fails on mask growth, at route level, on typical artwork."
        ),
    }

    OUT.write_text(json.dumps(analysis, indent=2) + "\n")

    # ---- terse console report -------------------------------------------------------
    print(f"labels latest={len(labels)} raw={len(raw_labels)} regraded={len(regraded)}")
    print("tile answers:", dict(tile_answers))
    print(f"duplicates: {duplicate_tiles} duplicate tiles, {distinct_images} distinct images")
    print()
    print(f"{'cover':26} {'pts':>3} {'containing':>22} {'ground':>22} {'union':>22}  dot")
    short = {
        "dot_right_wash_right": "RIGHT/RIGHT",
        "dot_right_wash_wrong": "right/wrong",
        "dot_wrong": "DOT-WRONG",
        "cant_tell": "can't tell",
    }
    for r in per_cover:
        cells = []
        for p in POLICIES:
            dup = "=" if any(p in g and g[0] != p for g in r["identical_policy_groups"]) else " "
            cells.append(f"{short[r['answers'][p]]:>13}{dup} {r['areas'][p]:.3f}")
        print(f"{r['cover']:26} {r['n_distinct_points']:>3} " + " ".join(cells)
              + f"  {r['dot_verdict']}")
    print()
    print(f"B1 dot-right {b1_n}/16 (bar 12)  -> {'PASS' if b1 else 'FAIL'}")
    for p in POLICIES:
        print(f"B2 {p:11} both-right {b2[p]['n']}/16 (bar 8) -> {'PASS' if b2[p]['pass'] else 'FAIL'}")
    print(f"B3 conjunction -> {'PASS' if b3 else 'FAIL'}")
    for p, v in b4.items():
        print(f"B4 {p:11} clearsB2={v['clears_b2']} margin={v['margin_over_containing']:+d} "
              f"broke={v['n_broken']} -> {'QUALIFIES' if v['qualifies'] else 'no'}")
    print(f"DEFAULT_SELECTION stays/moves to: {default_selection}")
    print(f"branch: {branch}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

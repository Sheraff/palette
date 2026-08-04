"""Score the spread-wording mini-pilot and apply SCHEMA_V2_PROPOSAL.md §4's pick rule.

    .venv/bin/python analyze_spread_pilot.py

The pick rule and its two numbers are transcribed VERBATIM from §4 and are not this script's to
choose. §4's own instruction — "Those numbers are proposals; move them before the run, not
after" — is honoured by leaving them exactly as written:

    take the candidate with the largest gap between firing on the multi-carrier group and
    firing on the single-carrier controls, SUBJECT TO an escape-hatch rate <= 0.25 ... If no
    candidate clears that, the value is doing harm and the first half of your ruling comes back
    to you rather than being shipped with the best of three bad options.

Definitions, fixed here so the arithmetic is inspectable:

  fire rate (group)   share of that group's covers whose carrier list CONTAINS the spread value.
  escape-hatch rate   among MULTI covers only: share whose carrier list is EXACTLY [spread] —
                      the value chosen ALONE where two carriers were nameable. This is the
                      failure the reviewer's own decision record names.
  cannibalisation     per-value presence rate in a candidate arm minus the same value's presence
                      rate in arm N (same 19 covers, no spread value in the vocabulary). §4's
                      fourth metric: "the value is eating its neighbours".

Everything here is over 19 hand-picked covers. It is a probe set, not a sample (§4). No rate in
the output is a corpus rate and the output says so in its own first field.

Writes research/v3/data/oracle-premise/spread-wording-pilot-1-analysis.json.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA_DIR, read_jsonl  # noqa: E402

ROWS = DATA_DIR / "spread-wording-pilot-1.jsonl"
OUT = DATA_DIR / "spread-wording-pilot-1-analysis.json"

# [REVIEWED] SCHEMA_V2_PROPOSAL.md §4, "Pick rule, fixed in advance".
ESCAPE_HATCH_MAX = 0.25
SPREAD_TOKEN = {"A": "several_places", "B": "spread_throughout", "C": "all_over"}
CANDIDATES = ("A", "B", "C")
CONTROL_ARM = "N"
BASE_VALUES = ("text", "subject", "background", "small_element", "no_single_colour")


def rate(k: int, n: int) -> float | None:
    return round(k / n, 4) if n else None


def main() -> int:
    rows = read_jsonl(ROWS)
    ok = [r for r in rows if r.get("status") == "ok" and r.get("parsed")]
    by_arm: dict[str, dict[str, dict]] = {}
    for r in ok:
        by_arm.setdefault(r["arm"], {})[r["image_path"]] = r

    groups: dict[str, str] = {r["image_path"]: r["group"] for r in rows}
    images = sorted(groups)
    group_members = {g: [i for i in images if groups[i] == g] for g in ("multi", "single", "none")}

    out: dict = {
        "what_this_is": (
            "SCHEMA_V2_PROPOSAL.md §4's wording mini-pilot: three candidate wordings of "
            "`signature_carrier`'s spread value, plus a no-spread-value control arm, over 19 "
            "hand-picked covers confirmed by eye. THIS IS A PROBE SET, NOT A SAMPLE — it "
            "measures whether the model understands a wording and says nothing about how often "
            "spread colours occur in the corpus. No rate below is a corpus rate."),
        "generated_by": "research/v3/oracle/premise/analyze_spread_pilot.py",
        "inputs": {"rows": str(ROWS), "list": "research/v3/oracle/premise/spread-pilot-19.txt"},
        "pick_rule": {
            "source": "SCHEMA_V2_PROPOSAL.md §4, transcribed verbatim, numbers unmoved",
            "primary": "largest (multi fire rate - single fire rate)",
            "constraint": f"escape-hatch rate on the multi group <= {ESCAPE_HATCH_MAX}",
            "no_winner_consequence": (
                "if no candidate clears the constraint, the value is doing harm and the "
                "multi-select half of the reviewer's ruling comes back to the reviewer rather "
                "than being shipped with the best of three bad options"),
        },
        "health": {
            "rows_total": len(rows),
            "rows_ok": len(ok),
            "parse_failed": sum(1 for r in rows if r.get("parse_failed")),
            "attempts_over_1": sum(1 for r in rows if (r.get("attempts") or 1) > 1),
            "max_generation_tokens": max((r.get("generation_tokens") or 0) for r in rows),
            "arms_present": sorted(by_arm),
            "images": len(images),
            "group_sizes": {g: len(v) for g, v in group_members.items()},
        },
        "per_candidate": {},
        "control_arm_N": {},
        "per_image": [],
    }

    # ---- control arm: the without-the-value baseline (§4's fourth metric) -------------------
    ctrl = by_arm.get(CONTROL_ARM, {})
    ctrl_presence = {}
    for val in BASE_VALUES:
        k = sum(1 for i in images if i in ctrl and val in ctrl[i]["parsed"]["signature_carrier"])
        ctrl_presence[val] = rate(k, len(ctrl))
    out["control_arm_N"] = {
        "n": len(ctrl),
        "presence_rate": ctrl_presence,
        "mean_list_length": round(
            sum(len(ctrl[i]["parsed"]["signature_carrier"]) for i in ctrl) / len(ctrl), 4)
        if ctrl else None,
        "exact_set_counts": dict(Counter(
            "+".join(ctrl[i]["parsed"]["signature_carrier"]) for i in ctrl).most_common()),
    }

    # ---- each candidate --------------------------------------------------------------------
    for arm in CANDIDATES:
        token = SPREAD_TOKEN[arm]
        seen = by_arm.get(arm, {})
        fires: dict[str, int] = {}
        for g, members in group_members.items():
            fires[g] = sum(1 for i in members
                           if i in seen and token in seen[i]["parsed"]["signature_carrier"])
        multi_n, single_n = len(group_members["multi"]), len(group_members["single"])
        multi_rate = rate(fires["multi"], multi_n)
        single_rate = rate(fires["single"], single_n)
        gap = (round(multi_rate - single_rate, 4)
               if multi_rate is not None and single_rate is not None else None)

        alone = [i for i in group_members["multi"]
                 if i in seen and seen[i]["parsed"]["signature_carrier"] == [token]]
        escape = rate(len(alone), multi_n)

        presence = {}
        shift = {}
        for val in BASE_VALUES:
            k = sum(1 for i in images if i in seen and val in seen[i]["parsed"]["signature_carrier"])
            presence[val] = rate(k, len(seen))
            if ctrl_presence.get(val) is not None and presence[val] is not None:
                shift[val] = round(presence[val] - ctrl_presence[val], 4)

        out["per_candidate"][arm] = {
            "value_token": token,
            "gloss": next(
                line.split(" - ", 1)[1].strip()
                for line in json.loads(
                    (Path(__file__).resolve().parent / "prompts" / "spread-wording-pilot"
                     / f"spread-pilot.{arm}.json").read_text(encoding="utf-8")
                )["prompt"].splitlines()
                if line.strip().startswith(f"{token} - ")),
            "n": len(seen),
            "fires_multi": f"{fires['multi']}/{multi_n}",
            "fire_rate_multi": multi_rate,
            "fires_single": f"{fires['single']}/{single_n}",
            "fire_rate_single": single_rate,
            "fires_none": f"{fires['none']}/{len(group_members['none'])}",
            "fire_rate_none": rate(fires["none"], len(group_members["none"])),
            "gap_multi_minus_single": gap,
            "escape_hatch_alone_on_multi": f"{len(alone)}/{multi_n}",
            "escape_hatch_rate": escape,
            "escape_hatch_images": alone,
            "escape_hatch_met": (escape is not None and escape <= ESCAPE_HATCH_MAX),
            "presence_rate": presence,
            "shift_vs_control_N": shift,
            "mean_list_length": round(
                sum(len(seen[i]["parsed"]["signature_carrier"]) for i in seen) / len(seen), 4)
            if seen else None,
        }

    # ---- degeneracy diagnostics on the carrier list itself (arm N, the clean baseline) ------
    # Not part of §4's pick rule. Added because the pick rule turned out to be un-runnable for a
    # reason that lives in the QUESTION rather than in any candidate wording, and that reason has
    # to be visible in the artifact rather than only in the write-up.
    if ctrl:
        sets = ["+".join(sorted(ctrl[i]["parsed"]["signature_carrier"])) for i in ctrl]
        modal = Counter(sets).most_common(1)[0]
        none_group = [i for i in group_members["none"] if i in ctrl]
        out["carrier_question_degeneracy"] = {
            "note": ("§7.4's corrected multi-select instruments, computed on arm N over 19 "
                     "hand-picked covers. A probe set, not a bench — these are flags for the "
                     "real pilot, never verdicts."),
            "modal_exact_set": modal[0],
            "modal_exact_set_share": rate(modal[1], len(ctrl)),
            "singleton_rate": rate(sum(1 for s in sets if "+" not in s), len(ctrl)),
            "presence_rate": ctrl_presence,
            "background_presence_rate": ctrl_presence.get("background"),
            "no_single_colour_fires": (
                f"{sum(1 for i in ctrl if 'no_single_colour' in ctrl[i]['parsed']['signature_carrier'])}"
                f"/{len(ctrl)}"),
            "no_single_colour_fires_on_eye_confirmed_none_group": (
                f"{sum(1 for i in none_group if 'no_single_colour' in ctrl[i]['parsed']['signature_carrier'])}"
                f"/{len(none_group)}"),
        }

    # ---- the pick --------------------------------------------------------------------------
    # §4's measured-metric table opens with "fires on the multi-carrier group | THE VALUE WORKS
    # AT ALL". A pick rule that crowns a value which never fired would be reading that row out of
    # the document, so it is applied here as an eligibility precondition.
    #
    # DISCLOSED: formalising it as a gate is post-hoc — §4 wrote it as a metric to measure, not
    # as a bar, and this script encoded only the escape-hatch bar before the run. It is recorded
    # as post-hoc for the same reason §3e discloses the 0.90 overlays reading. It advantages no
    # candidate and changes no ranking: all three fired 0/9, so the three are tied at zero either
    # way, and the only thing it changes is whether a tie at zero is allowed to produce a winner.
    works_at_all = {a: (e["fires_multi"].split("/")[0] != "0")
                    for a, e in out["per_candidate"].items()}
    for a, e in out["per_candidate"].items():
        e["fires_on_multi_group_at_all"] = works_at_all[a]
    eligible = {a: e for a, e in out["per_candidate"].items()
                if e["escape_hatch_met"] and works_at_all[a]}
    if not any(works_at_all.values()):
        out["verdict"] = {
            "winner": None,
            "why": ("NO CANDIDATE FIRED ON THE MULTI-CARRIER GROUP AT ALL (0/9 for every "
                    "wording). §4's first measured metric is 'fires on the multi-carrier group "
                    "— the value works at all', and it is zero three times over. The "
                    "escape-hatch constraint is satisfied by all three only VACUOUSLY: a value "
                    "that never fires can never be chosen alone. There is no winner to report, "
                    "and the gap metric (0.0 for all three) is a tie at zero, not a ranking."),
            "escape_hatch_satisfied_vacuously": True,
            "precedent": ("§3d: `illegible_at_this_size` fired 0 times in 284 rows and the "
                          "verdict was that it 'cannot fire as worded'. Same shape, three "
                          "wordings deep."),
            "consequence": ("§4's stated consequence covers the escape-hatch failure, not this "
                            "one. This is the other failure and the packet does not pre-register "
                            "a remedy for it, so none is asserted here. See "
                            "SPREAD_WORDING_PILOT.md for what the rows suggest and what it "
                            "would cost to be sure."),
        }
    elif eligible:
        winner = max(eligible, key=lambda a: (eligible[a]["gap_multi_minus_single"] or -1))
        out["verdict"] = {
            "winner": winner,
            "winning_token": SPREAD_TOKEN[winner],
            "why": (f"largest multi-minus-single gap "
                    f"({eligible[winner]['gap_multi_minus_single']}) among the "
                    f"{len(eligible)} candidate(s) meeting the escape-hatch constraint "
                    f"(<= {ESCAPE_HATCH_MAX})"),
            "eligible": sorted(eligible),
            "excluded_for_escape_hatch": sorted(set(CANDIDATES) - set(eligible)),
        }
    else:
        out["verdict"] = {
            "winner": None,
            "why": ("no candidate met the escape-hatch constraint; per §4 the value is doing "
                    "harm and the ruling returns to the reviewer"),
            "excluded_for_escape_hatch": sorted(CANDIDATES),
        }

    for i in images:
        out["per_image"].append({
            "image_path": i,
            "group": groups[i],
            "answers": {a: (by_arm[a][i]["parsed"]["signature_carrier"] if i in by_arm.get(a, {})
                            else None) for a in (*CANDIDATES, CONTROL_ARM)},
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent="\t") + "\n", encoding="utf-8")
    print(json.dumps({"health": out["health"], "verdict": out["verdict"],
                      "per_candidate": {a: {k: e[k] for k in
                                            ("value_token", "fires_multi", "fires_single",
                                             "fires_none", "gap_multi_minus_single",
                                             "escape_hatch_rate", "escape_hatch_met",
                                             "shift_vs_control_N", "mean_list_length")}
                                        for a, e in out["per_candidate"].items()}}, indent="\t"))
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""M4 review-verdict decode + double verification. Read-only inputs; writes decode.json."""
import json, hashlib, subprocess, itertools, os

ROUND = "/Users/Flo/GitHub/palette/.worktrees/p4-portfolio/research/v3/prototypes/p4-portfolio/review-rounds/m4-selector-vs-best"
OUT = "/Users/Flo/GitHub/palette/.worktrees/p4-portfolio/research/v3/prototypes/p4-portfolio/data/m4"
BATCHES = "/Users/Flo/GitHub/palette/research/v3/data/review-server/batches.jsonl"
BATCH_ID = "phase2-pair-023"
BEST = "p3-fields"
ROLES = ["background", "surface", "foreground", "accent"]

mapping = json.load(open(f"{ROUND}/mapping.private.json"))
selection = json.load(open(f"{ROUND}/selection.json"))
salt = mapping["salt"]

served = json.loads(subprocess.run(
    ["curl", "-s", f"http://127.0.0.1:3010/api/batches/{BATCH_ID}"],
    capture_output=True, text=True).stdout)

rec = None
for line in open(BATCHES):
    line = line.strip()
    if not line:
        continue
    r = json.loads(line)
    if r.get("batch", {}).get("batchId") == BATCH_ID:
        rec = r
assert rec is not None
log_items = {i["itemId"]: i for i in rec["items"]}
log_pushed = {i["itemId"]: i for i in rec["batch"]["items"]}
sel_items = {i["itemId"]: i for i in selection["items"]}
served_items = {i["itemId"]: i for i in served["items"]}

sha = lambda s: hashlib.sha256(s.encode()).hexdigest()


def pal_key(p):
    g = p.get("gradient")
    stops = tuple((s["color"], s["position"]) for s in g["stops"]) if g else None
    return (tuple(p[r] for r in ROLES), stops, p.get("surfaceCollapsed"), p.get("accentCollapsed"))


def served_key(side):
    roles = {r["role"]: r["hex"] for r in side["roles"]}
    g = side.get("gradient")
    stops = tuple((s["hex"], s["publishedPosition"]) for s in g["stops"]) if g else None
    return (tuple(roles[r] for r in ROLES), stops, side.get("surfaceCollapsed"), side.get("accentCollapsed"))


out_items = []
for m in mapping["items"]:
    iid = m["itemId"]
    sel = sel_items[iid]
    elected_member = m["selector"]["elected"]
    e_side = next(s for s in m["sides"] if s["member"] == elected_member)
    p_side = next(s for s in m["sides"] if s["member"] == BEST)
    log = log_items[iid]
    blinding = log["blinding"]           # letter -> pushed side index
    pushed = log_pushed[iid]["sides"]     # pushed order == fixture order
    srv = served_items[iid]

    # ---- Method 1: batch-log blinding join (mapping's recorded fixturePosition) ----
    pos_e_m1 = e_side["fixturePosition"]
    letter_m1 = next(L for L, idx in blinding.items() if idx == pos_e_m1)

    # ---- Method 2: salt recomputation (ignore mapping's recorded positions/roles) ----
    flip = int(sha(f"{salt}|{iid}|order")[:8], 16) % 2 == 1
    ordered = [BEST, elected_member] if flip else [elected_member, BEST]
    pos_e_m2 = ordered.index(elected_member)
    vid_e = "v" + sha(f"{salt}|{iid}|{elected_member}")[:15]
    vid_p = "v" + sha(f"{salt}|{iid}|{BEST}")[:15]
    pushed_vids = [s["variantId"] for s in pushed]
    pos_e_vid = pushed_vids.index(vid_e)
    letter_m2 = next(L for L, idx in blinding.items() if idx == pos_e_m2)

    # ---- Method 3 (cross-check): palette-content identity against the served payload ----
    letter_m3 = next(L for L in ("A", "B") if served_key(srv["sides"][L]) == pal_key(e_side["palette"]))

    checks = {
        "m1_letter": letter_m1,
        "m2_letter": letter_m2,
        "m2_variantIds_match_mapping": vid_e == e_side["variantId"] and vid_p == p_side["variantId"],
        "m2_order_parity_matches_mapping": pos_e_m2 == pos_e_m1 and p_side["fixturePosition"] == ordered.index(BEST),
        "m2_variantId_position_in_pushed": pos_e_vid == pos_e_m2,
        "m3_content_letter": letter_m3,
        "agree": letter_m1 == letter_m2 == letter_m3,
    }
    letter = letter_m1
    p3_letter = "B" if letter == "A" else "A"

    v = srv["verdict"]
    pref_letter = v["preference"]
    if pref_letter == "no-preference":
        pref = "none"
    elif pref_letter.upper() == letter:
        pref = "elected"
    else:
        pref = "p3"
    score = {"elected": 1, "p3": -1, "none": 0}[pref]

    names = lambda side: {r["role"]: r["name"] for r in srv["sides"][side]["roles"]}

    # comment side-attribution + served-name mentions
    comment = v["comment"]
    attribution = {}
    for tag, L in (("side A:", "A"), ("side B:", "B")):
        if tag.lower() in comment.lower():
            attribution[tag.rstrip(":")] = "elected" if L == letter else "p3"
    if "both:" in comment.lower():
        attribution["both"] = "both sides"
    all_names = set(names("A").values()) | set(names("B").values())
    for L in ("A", "B"):
        g = srv["sides"][L].get("gradient")
        if g:
            all_names |= {s["name"] for s in g["stops"]}
    mentions = sorted(n for n in all_names if n.lower() in comment.lower())
    # colour-name-looking tokens the comment uses that are NOT served on this item
    foreign = sorted({t for t in ("Lemon Curd",) if t.lower() in comment.lower()} - all_names)

    endorsement_decode = []
    for e in srv.get("endorsements", []):
        base = None
        for L, tag in ((letter, "elected"), (p3_letter, "p3")):
            sk = served_key(srv["sides"][L])
            same = sum(1 for r, hx in zip(ROLES, [e["palette"][r] for r in ROLES]) if hx == sk[0][ROLES.index(r)])
            if base is None or same > base[1]:
                base = (tag, same, L)
        diffs = {r: {"served": {x["role"]: x["hex"] for x in srv["sides"][base[2]]["roles"]}[r], "endorsed": e["palette"][r]}
                 for r in ROLES if {x["role"]: x["hex"] for x in srv["sides"][base[2]]["roles"]}[r] != e["palette"][r]}
        endorsement_decode.append({"nearestSide": base[0], "rolesMatching": base[1], "rolesChanged": diffs})

    out_items.append({
        "coverStem": iid,
        "electedMember": elected_member,
        "electedSideLetter": letter,
        "p3SideLetter": p3_letter,
        "gradeElected": v["gradeA"] if letter == "A" else v["gradeB"],
        "gradeP3": v["gradeA"] if p3_letter == "A" else v["gradeB"],
        "preferenceRaw": pref_letter,
        "preferenceSource": v["preferenceSource"],
        "preferenceDecoded": pref,
        "score": score,
        "veto": srv.get("veto"),
        "endorsements": [{"palette": e["palette"], "comment": e["comment"], "retracted": e["retracted"]} for e in srv.get("endorsements", [])],
        "comment": v["comment"],
        "commentSideAttribution": attribution,
        "commentServedNameMentions": mentions,
        "commentForeignColourNames": foreign,
        "endorsementDecode": endorsement_decode,
        "revision": v["revision"],
        "amendmentCount": v["amendmentCount"],
        "retracted": v["retracted"],
        "confound": v["confound"],
        "confoundNote": v["confoundNote"],
        "margin": {
            "bits": m["selector"]["marginBits"],
            "band": m["selector"]["marginBand"],
            "winFraction": m["selector"]["winFraction"],
            "resamples": m["selector"]["resamples"],
            "electionFlippedByFix": m["selector"]["electionFlippedByFix"],
            "cheapestTotal": m["selector"]["cheapestTotal"],
            "differingRolesVsBest": m["selector"]["differingRolesVsBest"],
            "figureGroundClass": m["selector"]["figureGroundClass"],
        },
        "servedNames": {
            "elected": names(letter),
            "p3": names(p3_letter),
            "electedGradientStops": [s["name"] for s in (srv["sides"][letter].get("gradient") or {}).get("stops", [])] or None,
            "p3GradientStops": [s["name"] for s in (srv["sides"][p3_letter].get("gradient") or {}).get("stops", [])] or None,
        },
        "verification": checks,
        "selectionCrossCheck": {
            "selection_elected_matches_mapping": sel["elected"] == elected_member,
            "selection_marginBits": sel.get("marginBits"),
        },
    })

out_items.sort(key=lambda x: x["margin"]["bits"])

pref_counts = {k: sum(1 for i in out_items if i["preferenceDecoded"] == k) for k in ("elected", "p3", "none")}
grades = ["strong", "acceptable", "weak", "unacceptable"]
dist = {
    "elected": {g: sum(1 for i in out_items if i["gradeElected"] == g) for g in grades},
    "p3": {g: sum(1 for i in out_items if i["gradeP3"] == g) for g in grades},
}
net = sum(i["score"] for i in out_items)
narrow, wide = out_items[:4], out_items[4:]
net_narrow, net_wide = sum(i["score"] for i in narrow), sum(i["score"] for i in wide)

# Kendall tau-b: margin rank (ascending, 1..8, no ties) vs item score (ties present)
ranks = list(range(1, 9))
scores = [i["score"] for i in out_items]
conc = disc = tx = ty = 0
for a, b in itertools.combinations(range(8), 2):
    dr = ranks[a] - ranks[b]
    ds = scores[a] - scores[b]
    if dr == 0 and ds == 0:
        tx += 1; ty += 1
    elif dr == 0:
        tx += 1
    elif ds == 0:
        ty += 1
    elif dr * ds > 0:
        conc += 1
    else:
        disc += 1
n0 = 8 * 7 / 2
tau_b = (conc - disc) / ((n0 - tx) ** 0.5 * (n0 - ty) ** 0.5)

decisive = [i for i in out_items if i["margin"]["winFraction"] == 1]
indecisive = [i for i in out_items if i["margin"]["winFraction"] != 1]

majority_elected = pref_counts["elected"] >= 5
majority_p3 = pref_counts["p3"] >= 5
mixed = not (majority_elected or majority_p3)
margin_dependence = abs(net_wide - net_narrow) >= 4 and net_wide > 0

result = {
    "batchId": BATCH_ID,
    "round": "m4-selector-vs-best",
    "released": served["released"],
    "releasedAt": served["releasedAt"],
    "pushedAt": served["pushedAt"],
    "blindingSalt_serverRecord": rec["blindingSalt"],
    "itemsSortedByMarginAscending": out_items,
    "verificationSummary": {
        "itemsAgreeingAllThreeMethods": sum(1 for i in out_items if i["verification"]["agree"]),
        "itemsTotal": len(out_items),
        "allVariantIdsRecomputed": all(i["verification"]["m2_variantIds_match_mapping"] for i in out_items),
        "allOrderParitiesRecomputed": all(i["verification"]["m2_order_parity_matches_mapping"] for i in out_items),
        "allVariantIdPushedPositionsMatch": all(i["verification"]["m2_variantId_position_in_pushed"] for i in out_items),
        "disagreements": [i["coverStem"] for i in out_items if not i["verification"]["agree"]],
    },
    "aggregates": {
        "preferenceCounts": pref_counts,
        "gradeDistributions": dist,
        "netScore": net,
        "netNarrowHalf": net_narrow,
        "netWideHalf": net_wide,
        "halfDelta_abs": abs(net_wide - net_narrow),
        "kendallTauB_marginRank_vs_score": tau_b,
        "vetoCount": sum(1 for i in out_items if i["veto"]),
        "endorsementCount": sum(len(i["endorsements"]) for i in out_items),
        "preferenceSourceCounts": {s: sum(1 for i in out_items if i["preferenceSource"] == s)
                                    for s in sorted({i["preferenceSource"] for i in out_items})},
        "prefilledPreferencesTrackingHigherGrade": sum(
            1 for i in out_items if i["preferenceSource"] == "prefilled"
            and grades.index(i["gradeElected"] if i["preferenceDecoded"] == "elected" else i["gradeP3"])
            < grades.index(i["gradeP3"] if i["preferenceDecoded"] == "elected" else i["gradeElected"])),
        "gradeTiesWithExplicitPreference": [
            {"cover": i["coverStem"], "grade": i["gradeElected"], "preference": i["preferenceDecoded"]}
            for i in out_items if i["gradeElected"] == i["gradeP3"]],
        "secondary_decisivenessSplit": {
            "winFraction_1.000": {"n": len(decisive), "net": sum(i["score"] for i in decisive)},
            "winFraction_below_1": {"n": len(indecisive), "net": sum(i["score"] for i in indecisive),
                                     "fractions": [i["margin"]["winFraction"] for i in indecisive]},
        },
    },
    "branches": {
        "a": {"criterion": "(a) The selector's sides preferred on a majority -> F3 survives; the selector earns its existence.",
              "numbers": {"electedPreferences": pref_counts["elected"], "strictMajorityOf8": 5},
              "fires": majority_elected},
        "b": {"criterion": "(b) P3's sides preferred on a majority -> F3 FIRES.",
              "numbers": {"p3Preferences": pref_counts["p3"], "strictMajorityOf8": 5},
              "fires": majority_p3},
        "c": {"criterion": "(c) Mixed -> the per-cover read against margin size, and the rule is fixed now.",
              "numbers": {"netNarrow": net_narrow, "netWide": net_wide, "delta": abs(net_wide - net_narrow),
                          "threshold": 4, "wideHalfPositive": net_wide > 0,
                          "marginSizeDependenceDeclared": margin_dependence,
                          "kendallTauB": tau_b},
              "fires": mixed,
              "subOutcome": ("margin-size dependence declared" if (mixed and margin_dependence)
                             else ("no read at n = 8" if mixed else None))},
    },
}

os.makedirs(OUT, exist_ok=True)
json.dump(result, open(f"{OUT}/decode.json", "w"), indent="\t")
print(json.dumps({k: v for k, v in result.items() if k != "itemsSortedByMarginAscending"}, indent=1))
for i in out_items:
    print(i["coverStem"][-10:], i["electedMember"], "elected=", i["electedSideLetter"],
          i["gradeElected"], "| p3", i["gradeP3"], "| pref", i["preferenceRaw"], "->", i["preferenceDecoded"],
          "| bits", round(i["margin"]["bits"]), "| agree", i["verification"]["agree"], "| veto", i["veto"])

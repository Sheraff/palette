"""Characterize the cascade's B-unmapped / D-committed class, and test whether SAM
residual-field features can arbitrate it.

Inputs are all committed files; no inference runs here. Run with the SAM venv
(numpy + scipy + pycocotools):

    research/v3/oracle/sam/.venv/bin/python research/v3/oracle/premise/analyze_b_unmapped_class.py

Writes research/v3/data/oracle-premise/b-unmapped-class-analysis.json.
"""

from __future__ import annotations

import json
import math
import os
from collections import Counter, defaultdict

import numpy as np
from pycocotools import mask as cocomask
from scipy import ndimage

ROOT = "/Users/Flo/GitHub/palette"
DATA = os.path.join(ROOT, "research/v3/data")

CASCADE = os.path.join(DATA, "oracle-premise/cascade-sim-1.json")
EVAL_SET = os.path.join(DATA, "oracle-premise/eval-set.json")
RUN_B = os.path.join(DATA, "oracle-premise/premise-run-1.jsonl")
RUN_D = os.path.join(DATA, "oracle-premise/premise-run-cd.jsonl")
GOLD = os.path.join(DATA, "oracle-validation/premise-disambiguation-1-analysis.json")
SAM = os.path.join(DATA, "sam/sam-eval-142-v2.jsonl")
EMB_NPY = {
    "sharded": os.path.join(DATA, "embeddings/sharded.dinov2-vitl14.npy"),
    "music_artworks": os.path.join(DATA, "embeddings/music_artworks.dinov2-vitl14.npy"),
}
EMB_IDS = {
    "sharded": os.path.join(DATA, "embeddings/sharded.dinov2-vitl14.ids.jsonl"),
    "music_artworks": os.path.join(DATA, "embeddings/music_artworks.dinov2-vitl14.ids.jsonl"),
}
OUT = os.path.join(DATA, "oracle-premise/b-unmapped-class-analysis.json")

# [REVIEWED] the cascade's own route name for the class under study
# (cascade-sim-1.json -> cascade_rule.routes).
CLASS_ROUTE = "adjudicated:b_unmapped_d_committed"

# [MEASURED] k-means settings: fixed seed and restarts so the coarse cluster answer is
# reproducible. k swept because no k is calibrated for this corpus.
KMEANS_SEED = 20260803
KMEANS_RESTARTS = 12
KMEANS_KS = (4, 6, 8, 10)

# [MEASURED] The one residual-geometry rule carried out of the in-class search into the
# out-of-class (BD-disagree) and settled-items checks. Named once because three call sites and
# the human summary all have to mean the same rule; Phase-0 adversarial review finding 5 found
# its numbers typed into the summary by hand.
ARBITER_RULE_THRESHOLD = 0.90
ARBITER_RULE_LABEL = f"residual>={ARBITER_RULE_THRESHOLD:.2f}"

# [MEASURED] connected-component structure for the residual field: 8-connectivity, so a
# field that touches itself only diagonally around a subject still counts as one field.
CONNECTIVITY_STRUCTURE = np.ones((3, 3), dtype=bool)

# [MEASURED] components smaller than this fraction of the image are ignored when counting
# residual pieces; SAM mask edges leave single-pixel slivers that are not fields.
# Value chosen as "smaller than a 3%-of-area patch cannot be the ground of an album cover".
RESIDUAL_COMPONENT_NOISE_FLOOR = 0.005


def read_jsonl(path):
    out = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def pct(n, d):
    return None if not d else round(n / d, 4)


def dist(values):
    c = Counter(values)
    return {str(k): v for k, v in sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0])))}


# ---------------------------------------------------------------- load

cascade = json.load(open(CASCADE, encoding="utf-8"))
per_item = cascade["per_item"]

eval_set = json.load(open(EVAL_SET, encoding="utf-8"))
eval_by_sha = {e["image"]["sha256"]: e for e in eval_set["entries"]}

run_b = {r["image_sha256"]: r for r in read_jsonl(RUN_B) if r.get("prompt_variant") == "B"}
run_d = {r["image_sha256"]: r for r in read_jsonl(RUN_D) if r.get("prompt_variant") == "D"}
run_a = {r["image_sha256"]: r for r in read_jsonl(RUN_B) if r.get("prompt_variant") == "A"}

gold = json.load(open(GOLD, encoding="utf-8"))
gold_by_sha = {g["sha256"]: g for g in gold["perArtwork"]}

sam_rows = read_jsonl(SAM)
sam_img = {r["image_sha256"]: r for r in sam_rows if r.get("record_type") == "image"}
sam_regions = defaultdict(list)
for r in sam_rows:
    if r.get("record_type") == "region":
        sam_regions[r["image_sha256"]].append(r)


# ---------------------------------------------------------------- SAM geometry

def residual_geometry(rec):
    """Decode the SAM union mask and describe the residual (unmasked) field."""
    rle = rec.get("union_mask_rle")
    h, w = rec["height"], rec["width"]
    if not rle:
        return {
            "residual_fraction_recomputed": 1.0,
            "residual_components": 1,
            "residual_largest_component_image_fraction": 1.0,
            "residual_coherence": 1.0,
            "union_mask_present": False,
        }
    counts = rle.encode("utf-8") if isinstance(rle, str) else rle
    m = cocomask.decode({"size": [h, w], "counts": counts}).astype(bool)
    if m.shape != (h, w):
        m = m.reshape(h, w)
    residual = ~m
    total = h * w
    res_area = int(residual.sum())
    if res_area == 0:
        return {
            "residual_fraction_recomputed": 0.0,
            "residual_components": 0,
            "residual_largest_component_image_fraction": 0.0,
            "residual_coherence": 0.0,
            "union_mask_present": True,
        }
    lab, n = ndimage.label(residual, structure=CONNECTIVITY_STRUCTURE)
    sizes = np.bincount(lab.ravel())[1:] if n else np.array([])
    big = sizes[sizes / total >= RESIDUAL_COMPONENT_NOISE_FLOOR]
    largest = int(sizes.max()) if n else 0
    return {
        "residual_fraction_recomputed": round(res_area / total, 4),
        "residual_components": int(len(big)),
        "residual_largest_component_image_fraction": round(largest / total, 4),
        "residual_coherence": round(largest / res_area, 4),
        "union_mask_present": True,
    }


geom_cache = {}
for sha, rec in sam_img.items():
    geom_cache[sha] = residual_geometry(rec)


# ---------------------------------------------------------------- build the item table

items = []
for it in per_item:
    sha = it["image_sha256"]
    ev = eval_by_sha.get(sha)
    sam = sam_img.get(sha)
    geom = geom_cache.get(sha, {})
    b = run_b.get(sha, {}).get("parsed", {})
    d = run_d.get(sha, {}).get("parsed", {})
    a = run_a.get(sha, {}).get("parsed", {})
    g = gold_by_sha.get(sha)
    rec = {
        "sha256": sha,
        "artwork_id": it["artwork_id"],
        "image_path": it["image_path"],
        "absolute_path": (ev or {}).get("image", {}).get("absolutePath"),
        "tier": it["tier"],
        "in_primary": it["in_primary"],
        "conflicted_truth": it["conflicted_truth"],
        "in_gold30": it["in_gold30"],
        "flag_gradient": it["flag_gradient"],
        "route": it["route"],
        "is_class": it["route"] == CLASS_ROUTE,
        "B_ground_type": it["bulk_B_ground_type"],
        "B_binary": it["bulk_B_binary"],
        "D_ground_type": it["bulk_D_ground_type"],
        "D_binary": it["bulk_D_binary"],
        "A_ground_type": it["adjudicator_ground_type"],
        "A_binary": it["adjudicator_binary"],
        "cascade_binary": it["binary"],
        "label_source": it["label_source"],
        "B_confidence": b.get("confidence"),
        "D_confidence": d.get("confidence"),
        # Phase-0 adversarial review finding 4. This column used to be published as
        # `A_confidence`, beside `A_ground_type` and `A_binary` — which come from the CASCADE's
        # adjudicator, Qwen3-VL-32B-Instruct-8bit. This one does not: it comes from variant A of
        # `premise-run-1.jsonl`, which is the BULK model, Qwen3-VL-30B-A3B-Instruct-6bit, on its
        # other group-a.v1 prompt. Two genuinely different instruments — their variant-A
        # `ground_type` differs on 34 of 142 images. The defect was masked only because
        # `confidence` is degenerate (both models answer `high` everywhere), so the published
        # values happened to be identical whichever source was used; it would have become a wrong
        # published value the moment `confidence` stopped saturating. Renamed so the model is
        # readable off the column name, and `column_provenance` in the output names both.
        "bulk_variantA_confidence": a.get("confidence"),
        "B_field_texture": b.get("field_texture"),
        "D_field_texture": d.get("field_texture"),
        "D_shading_geometry": d.get("shading_geometry"),
        "B_enclosure": b.get("enclosure"),
        "reviewer_ground_type": (g or {}).get("reviewerGroundType"),
        "reviewer_binary": (g or {}).get("reviewerBinary"),
    }
    if sam:
        rec.update({
            "sam_residual_field_fraction": sam.get("residual_field_fraction"),
            "sam_masked_area_fraction": sam.get("masked_area_fraction"),
            "sam_person_fraction": sam.get("person_like_union_area_fraction"),
            "sam_text_fraction": sam.get("text_like_union_area_fraction"),
            "sam_mark_fraction": sam.get("mark_like_union_area_fraction"),
            "sam_instances_total": sam.get("instances_total"),
            "sam_person_instances": sum(
                v for k, v in (sam.get("instances_by_concept") or {}).items()
                if k in ("person", "face")
            ),
        })
        rec.update(geom)
    # truth: the accepted-palette gradient flag, valid only for unconflicted primary items
    if rec["in_primary"] and not rec["conflicted_truth"]:
        rec["truth_binary"] = "gradient" if rec["flag_gradient"] else "flat"
    else:
        rec["truth_binary"] = None
    rec["D_right"] = (
        None if rec["truth_binary"] is None else rec["D_binary"] == rec["truth_binary"]
    )
    rec["B_right"] = (
        None if rec["truth_binary"] is None or rec["B_binary"] not in ("flat", "gradient")
        else rec["B_binary"] == rec["truth_binary"]
    )
    items.append(rec)

by_sha = {r["sha256"]: r for r in items}
klass = [r for r in items if r["is_class"]]
rest = [r for r in items if not r["is_class"]]
agree = [r for r in items if r["route"] == "bulk_agreement"]
disagree = [r for r in items if r["route"] == "adjudicated:bd_binary_disagree"]

klass_p = [r for r in klass if r["truth_binary"]]
rest_p = [r for r in rest if r["truth_binary"]]
agree_p = [r for r in agree if r["truth_binary"]]


def numsum(rows, key):
    vals = [r[key] for r in rows if r.get(key) is not None]
    if not vals:
        return None
    vals = sorted(vals)
    n = len(vals)
    return {
        "n": n,
        "mean": round(float(np.mean(vals)), 4),
        "median": round(float(np.median(vals)), 4),
        "p10": round(float(np.percentile(vals, 10)), 4),
        "p90": round(float(np.percentile(vals, 90)), 4),
        "min": round(float(vals[0]), 4),
        "max": round(float(vals[-1]), 4),
    }


# ---------------------------------------------------------------- Part 1 characterization

def profile(rows, label):
    return {
        "label": label,
        "n": len(rows),
        "tier": dist(r["tier"] for r in rows),
        "flag_gradient_rate": pct(sum(1 for r in rows if r["flag_gradient"]), len(rows)),
        "in_gold30": sum(1 for r in rows if r["in_gold30"]),
        "conflicted_truth": sum(1 for r in rows if r["conflicted_truth"]),
        "B_ground_type": dist(r["B_ground_type"] for r in rows),
        "D_ground_type": dist(r["D_ground_type"] for r in rows),
        "A_ground_type": dist(r["A_ground_type"] for r in rows),
        "D_binary": dist(r["D_binary"] for r in rows),
        "B_confidence": dist(r["B_confidence"] for r in rows),
        "D_confidence": dist(r["D_confidence"] for r in rows),
        "D_field_texture": dist(r["D_field_texture"] for r in rows),
        "sam": {
            k: numsum(rows, k)
            for k in (
                "sam_residual_field_fraction",
                "sam_masked_area_fraction",
                "sam_person_fraction",
                "sam_text_fraction",
                "sam_instances_total",
                "residual_components",
                "residual_coherence",
                "residual_largest_component_image_fraction",
            )
        },
        "sam_person_present_rate": pct(
            sum(1 for r in rows if (r.get("sam_person_fraction") or 0) > 0), len(rows)
        ),
        "sam_person_big_rate": pct(
            sum(1 for r in rows if (r.get("sam_person_fraction") or 0) >= 0.10), len(rows)
        ),
        "sam_text_present_rate": pct(
            sum(1 for r in rows if (r.get("sam_text_fraction") or 0) > 0), len(rows)
        ),
    }


part1 = {
    "class": profile(klass, "b_unmapped_d_committed"),
    "not_routed_bulk_agreement": profile(agree, "bulk_agreement"),
    "routed_bd_disagree": profile(disagree, "adjudicated:bd_binary_disagree"),
    "all_others": profile(rest, "everything not in the class"),
}

# D's accuracy inside the class, and what the errors look like
def acc_block(rows):
    scored = [r for r in rows if r["D_right"] is not None]
    right = [r for r in scored if r["D_right"]]
    wrong = [r for r in scored if not r["D_right"]]
    return {
        "n_scored": len(scored),
        "D_right": len(right),
        "D_wrong": len(wrong),
        "D_accuracy": pct(len(right), len(scored)),
        "D_wrong_direction": dist(
            f"D={r['D_binary']} truth={r['truth_binary']}" for r in wrong
        ),
        "confusion": {
            "truth_gradient_D_gradient": sum(
                1 for r in scored if r["truth_binary"] == "gradient" and r["D_binary"] == "gradient"
            ),
            "truth_gradient_D_flat": sum(
                1 for r in scored if r["truth_binary"] == "gradient" and r["D_binary"] == "flat"
            ),
            "truth_flat_D_gradient": sum(
                1 for r in scored if r["truth_binary"] == "flat" and r["D_binary"] == "gradient"
            ),
            "truth_flat_D_flat": sum(
                1 for r in scored if r["truth_binary"] == "flat" and r["D_binary"] == "flat"
            ),
        },
    }


part1["D_accuracy_in_class"] = acc_block(klass)
part1["D_accuracy_bulk_agreement"] = acc_block(agree)
part1["D_accuracy_bd_disagree"] = acc_block(disagree)
part1["D_accuracy_all"] = acc_block(items)

# gold overlap detail
part1["gold30_overlap"] = {
    "class_items_in_gold30": [
        {
            "image_path": r["image_path"],
            "reviewer_ground_type": r["reviewer_ground_type"],
            "reviewer_binary": r["reviewer_binary"],
            "flag_gradient": r["flag_gradient"],
            "B_ground_type": r["B_ground_type"],
            "D_ground_type": r["D_ground_type"],
            "A_ground_type": r["A_ground_type"],
        }
        for r in klass if r["in_gold30"]
    ],
    "reviewer_ground_type_distribution_gold30": dist(
        r["reviewer_ground_type"] for r in items if r["in_gold30"]
    ),
    "reviewer_full_scene_items_and_their_route": dist(
        r["route"] for r in items
        if r["in_gold30"] and r["reviewer_ground_type"] == "full_scene"
    ),
}


# ---------------------------------------------------------------- embeddings / clusters

def load_vectors():
    want = {r["sha256"] for r in items}
    vecs = {}
    for coll, ids_path in EMB_IDS.items():
        rows = read_jsonl(ids_path)
        idx = {r["sha256"]: r["row"] for r in rows if r["sha256"] in want}
        if not idx:
            continue
        arr = np.load(EMB_NPY[coll], mmap_mode="r")
        for sha, row in idx.items():
            if sha not in vecs:
                vecs[sha] = np.asarray(arr[row], dtype=np.float64)
    return vecs


vecs = load_vectors()
shas = [r["sha256"] for r in items if r["sha256"] in vecs]
X = np.stack([vecs[s] for s in shas])
X = X / np.linalg.norm(X, axis=1, keepdims=True)
is_class = np.array([by_sha[s]["is_class"] for s in shas])


def kmeans(X, k, seed, restarts):
    rng = np.random.default_rng(seed)
    best, best_inertia = None, np.inf
    for _ in range(restarts):
        # k-means++ init
        centers = [X[rng.integers(len(X))]]
        for _ in range(k - 1):
            d = np.min(((X[:, None, :] - np.array(centers)[None]) ** 2).sum(-1), axis=1)
            p = d / d.sum() if d.sum() > 0 else np.ones(len(X)) / len(X)
            centers.append(X[rng.choice(len(X), p=p)])
        C = np.array(centers)
        for _ in range(100):
            a = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
            newC = np.array([
                X[a == j].mean(0) if np.any(a == j) else X[rng.integers(len(X))]
                for j in range(k)
            ])
            if np.allclose(newC, C):
                C = newC
                break
            C = newC
        inertia = float(((X - C[a]) ** 2).sum())
        if inertia < best_inertia:
            best_inertia, best = inertia, a.copy()
    return best


cluster_block = {}
for k in KMEANS_KS:
    a = kmeans(X, k, KMEANS_SEED, KMEANS_RESTARTS)
    rows = []
    for j in range(k):
        sel = a == j
        rows.append({
            "cluster": j,
            "size": int(sel.sum()),
            "class_members": int((sel & is_class).sum()),
            "class_share_of_cluster": pct(int((sel & is_class).sum()), int(sel.sum())),
        })
    rows.sort(key=lambda r: -r["class_members"])
    cum = np.cumsum([r["class_members"] for r in rows])
    total_class = int(is_class.sum())
    cluster_block[f"k={k}"] = {
        "clusters": rows,
        "class_total": total_class,
        "share_in_top_cluster": pct(rows[0]["class_members"], total_class),
        "share_in_top_2_clusters": pct(int(cum[1]) if len(cum) > 1 else 0, total_class),
        "clusters_touched": sum(1 for r in rows if r["class_members"] > 0),
        "baseline_class_rate": pct(total_class, len(shas)),
    }

sim = X @ X.T
np.fill_diagonal(sim, np.nan)
within_class = float(np.nanmean(sim[np.ix_(is_class, is_class)]))
within_rest = float(np.nanmean(sim[np.ix_(~is_class, ~is_class)]))
cross = float(np.nanmean(sim[np.ix_(is_class, ~is_class)]))
part1["embeddings"] = {
    "model": "dinov2-vitl14 (sharded + music_artworks shards, L2-normalized)",
    "items_with_vectors": len(shas),
    "mean_cosine_within_class": round(within_class, 4),
    "mean_cosine_within_rest": round(within_rest, 4),
    "mean_cosine_class_to_rest": round(cross, 4),
    "reading": "within-class similarity above cross similarity by a wide margin would mean one visual family",
    "kmeans": cluster_block,
}


# ---------------------------------------------------------------- Part 2: SAM arbitration

FEATURES = [
    "sam_residual_field_fraction",
    "residual_coherence",
    "residual_largest_component_image_fraction",
    "sam_person_fraction",
    "sam_text_fraction",
    "residual_components",
    "sam_instances_total",
]


def separation(rows, feature):
    r = [x for x in rows if x["D_right"] is True and x.get(feature) is not None]
    w = [x for x in rows if x["D_right"] is False and x.get(feature) is not None]
    if not r or not w:
        return None
    rv = np.array([x[feature] for x in r], dtype=float)
    wv = np.array([x[feature] for x in w], dtype=float)
    # AUC via Mann-Whitney: P(D_right value > D_wrong value)
    allv = np.concatenate([rv, wv])
    order = allv.argsort()
    ranks = np.empty(len(allv))
    ranks[order] = np.arange(1, len(allv) + 1)
    # average ranks for ties
    for v in np.unique(allv):
        m = allv == v
        ranks[m] = ranks[m].mean()
    n1, n2 = len(rv), len(wv)
    u = ranks[:n1].sum() - n1 * (n1 + 1) / 2
    return {
        "D_right": {"n": n1, "mean": round(float(rv.mean()), 4), "median": round(float(np.median(rv)), 4)},
        "D_wrong": {"n": n2, "mean": round(float(wv.mean()), 4), "median": round(float(np.median(wv)), 4)},
        "auc_right_above_wrong": round(float(u / (n1 * n2)), 4),
    }


part2 = {
    "hypothesis": (
        "a large coherent residual field means a real field exists behind the scene, so D's "
        "committed reading is trustworthy; a small or fragmented residual means genuine full_scene"
    ),
    "truth_source": "accepted-palette gradient flag on unconflicted primary items",
    "class_scored_n": len([r for r in klass if r["D_right"] is not None]),
    "feature_separation": {f: separation(klass, f) for f in FEATURES},
}


def rule_eval(rows, predicate):
    commit = [r for r in rows if predicate(r)]
    abstain = [r for r in rows if not predicate(r)]
    cr = [r for r in commit if r["D_right"] is True]
    cw = [r for r in commit if r["D_right"] is False]
    ar = [r for r in abstain if r["D_right"] is True]
    aw = [r for r in abstain if r["D_right"] is False]
    return {
        "commit_n": len(commit),
        "abstain_n": len(abstain),
        "commit_share": pct(len(commit), len(rows)),
        "commit_D_right": len(cr),
        "commit_D_wrong": len(cw),
        "commit_precision": pct(len(cr), len(commit)),
        "abstain_D_right_lost": len(ar),
        "abstain_D_wrong_avoided": len(aw),
        "abstain_precision_of_abstaining": pct(len(aw), len(abstain)),
    }


scored_class = [r for r in klass if r["D_right"] is not None]

# threshold sweeps: commit when feature >= t (and the mirror, feature <= t)
sweeps = {}
for feature in ("sam_residual_field_fraction", "residual_coherence",
                "residual_largest_component_image_fraction"):
    vals = sorted({round(float(r[feature]), 4) for r in scored_class if r.get(feature) is not None})
    rowsout = []
    for t in vals:
        hi = rule_eval(scored_class, lambda r, t=t, f=feature: (r.get(f) or 0) >= t)
        rowsout.append({"threshold": t, "direction": "commit_if_ge", **hi})
    sweeps[feature] = rowsout

part2["threshold_sweeps"] = sweeps

# candidate named rules
def mk(name, pred, note):
    return {"rule": name, "note": note, "on_class": rule_eval(scored_class, pred),
            "predicate": pred}


candidates = [
    mk("residual>=0.95", lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.95,
       "almost nothing masked: SAM found no subject at all"),
    mk(ARBITER_RULE_LABEL,
       lambda r: (r.get("sam_residual_field_fraction") or 0) >= ARBITER_RULE_THRESHOLD, ""),
    mk("residual>=0.80", lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.80, ""),
    mk("residual>=0.70", lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.70, ""),
    mk("residual<0.80", lambda r: (r.get("sam_residual_field_fraction") or 0) < 0.80,
       "mirror: commit only when SAM found a lot of subject"),
    mk("coherence>=0.95", lambda r: (r.get("residual_coherence") or 0) >= 0.95, ""),
    mk("coherence>=0.90", lambda r: (r.get("residual_coherence") or 0) >= 0.90, ""),
    mk("residual>=0.80 and coherence>=0.90",
       lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.80
       and (r.get("residual_coherence") or 0) >= 0.90, ""),
    mk("residual>=0.80 and no person",
       lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.80
       and (r.get("sam_person_fraction") or 0) == 0, ""),
    mk("person present", lambda r: (r.get("sam_person_fraction") or 0) > 0,
       "commit when a person mask exists (people usually stand in front of a real field)"),
    mk("no person", lambda r: (r.get("sam_person_fraction") or 0) == 0, ""),
    mk("person>=0.10", lambda r: (r.get("sam_person_fraction") or 0) >= 0.10, ""),
    mk("D says shaded_field", lambda r: r.get("D_ground_type") == "shaded_field",
       "non-SAM control: D's own answer"),
    mk("D confidence high", lambda r: r.get("D_confidence") == "high",
       "non-SAM control: D's stated confidence"),
    mk("always commit (take-D)", lambda r: True, "baseline"),
]

for c in candidates:
    pred = c.pop("predicate")
    c["on_bulk_agreement_sanity"] = rule_eval(
        [r for r in agree_p if r["D_right"] is not None], pred
    )
    c["commit_share_on_bulk_agreement"] = c["on_bulk_agreement_sanity"]["commit_share"]

part2["candidate_rules"] = candidates

base_right = sum(1 for r in scored_class if r["D_right"])
base_n = len(scored_class)
part2["baseline_take_D"] = {
    "n": base_n, "right": base_right, "wrong": base_n - base_right,
    "accuracy": pct(base_right, base_n),
}


# a rule is only useful if commit-precision beats the take-D baseline by more than noise
def best_rule(cands):
    ranked = []
    for c in cands:
        oc = c["on_class"]
        if oc["commit_n"] < 8 or oc["commit_precision"] is None:
            continue
        ranked.append((oc["commit_precision"], oc["commit_n"], c["rule"]))
    ranked.sort(reverse=True)
    return ranked[:6]


part2["best_by_commit_precision"] = [
    {"rule": r[2], "commit_precision": r[0], "commit_n": r[1]} for r in best_rule(candidates)
]

# permutation test for the best simple threshold rule: is the split better than chance?
rng = np.random.default_rng(KMEANS_SEED)


def perm_p(rows, predicate, trials=20000):
    labels = np.array([1 if r["D_right"] else 0 for r in rows])
    mask = np.array([bool(predicate(r)) for r in rows])
    if mask.sum() == 0 or mask.sum() == len(rows):
        return None
    obs = labels[mask].mean()
    hits = 0
    for _ in range(trials):
        p = rng.permutation(labels)
        if p[mask].mean() >= obs:
            hits += 1
    return round((hits + 1) / (trials + 1), 4)


part2["permutation_tests"] = {}
for name, pred in [
    ("residual>=0.95", lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.95),
    ("residual>=0.90", lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.90),
    ("residual>=0.80", lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.80),
    ("coherence>=0.95", lambda r: (r.get("residual_coherence") or 0) >= 0.95),
    ("person present", lambda r: (r.get("sam_person_fraction") or 0) > 0),
]:
    part2["permutation_tests"][name] = {
        "p_value_one_sided": perm_p(scored_class, pred),
        "reading": "probability that a random split of the same size does this well or better",
    }


# ---- is the winning threshold real, or the best of many looks at 43 items? ----------
# Max-statistic permutation test: for every permutation of the D_right labels, sweep the
# same grid the search swept and keep the best commit-precision. The corrected p-value is
# how often a permuted corpus produces a rule at least as good as the observed best.

GRID_FEATURES = (
    "sam_residual_field_fraction", "residual_coherence",
    "residual_largest_component_image_fraction", "sam_person_fraction",
    "sam_text_fraction", "sam_instances_total", "residual_components",
)
# [MEASURED] a rule that commits on fewer than this many of 43 items cannot be told from
# noise at all, so the search space is restricted to rules that commit at least this often.
MIN_COMMIT_N = 8


def build_grid(rows):
    """All (mask, label) candidate rules the search could have found."""
    grid = []
    for f in GRID_FEATURES:
        vals = sorted({float(r[f]) for r in rows if r.get(f) is not None})
        for t in vals:
            for direction in (">=", "<"):
                if direction == ">=":
                    m = np.array([(r.get(f) or 0) >= t for r in rows])
                else:
                    m = np.array([(r.get(f) or 0) < t for r in rows])
                if MIN_COMMIT_N <= m.sum() <= len(rows) - 1:
                    grid.append((f"{f}{direction}{round(t, 4)}", m))
    return grid


grid = build_grid(scored_class)
labels = np.array([1 if r["D_right"] else 0 for r in scored_class])


def best_over_grid(lab):
    best, name = -1.0, None
    for nm, m in grid:
        p = lab[m].mean()
        if p > best:
            best, name = p, nm
    return best, name


obs_best, obs_name = best_over_grid(labels)
rng2 = np.random.default_rng(KMEANS_SEED + 1)
TRIALS = 5000
hits = 0
for _ in range(TRIALS):
    b, _ = best_over_grid(rng2.permutation(labels))
    if b >= obs_best:
        hits += 1

part2["multiplicity_corrected_search"] = {
    "grid_size": len(grid),
    "min_commit_n": MIN_COMMIT_N,
    "observed_best_rule": obs_name,
    "observed_best_commit_precision": round(float(obs_best), 4),
    "trials": TRIALS,
    "p_value_corrected": round((hits + 1) / (TRIALS + 1), 4),
    "reading": (
        "how often a corpus with the same labels shuffled at random yields a rule at least "
        "this good somewhere in the same search space; small means the split is not just "
        "threshold hunting"
    ),
}

# ---- the class is really two sub-populations: D-committed-gradient and D-committed-flat -
d_grad = [r for r in scored_class if r["D_binary"] == "gradient"]
d_flat = [r for r in scored_class if r["D_binary"] == "flat"]
part2["subpopulations"] = {
    "D_says_gradient": {
        "n": len(d_grad),
        "D_right": sum(1 for r in d_grad if r["D_right"]),
        "accuracy": pct(sum(1 for r in d_grad if r["D_right"]), len(d_grad)),
        "residual_separation": separation(d_grad, "sam_residual_field_fraction"),
        "rule_residual_ge_090": rule_eval(
            d_grad,
            lambda r: (r.get("sam_residual_field_fraction") or 0) >= ARBITER_RULE_THRESHOLD
        ),
    },
    "D_says_flat": {
        "n": len(d_flat),
        "D_right": sum(1 for r in d_flat if r["D_right"]),
        "accuracy": pct(sum(1 for r in d_flat if r["D_right"]), len(d_flat)),
    },
    "reading": (
        "if every D-flat call is already right, the arbitration problem is only about D's "
        "shaded_field calls"
    ),
}

# ---- out-of-class check: the same rule on the OTHER routed class (BD binary disagree) ---
# Nothing was fitted there, so it is the closest thing to held-out evidence available.
scored_disagree = [r for r in disagree if r["D_right"] is not None]
part2["out_of_class_check_bd_disagree"] = {
    "n": len(scored_disagree),
    "take_D_accuracy": pct(sum(1 for r in scored_disagree if r["D_right"]), len(scored_disagree)),
    "rule": ARBITER_RULE_LABEL,
    "rule_residual_ge_090": rule_eval(
        scored_disagree,
        lambda r: (r.get("sam_residual_field_fraction") or 0) >= ARBITER_RULE_THRESHOLD
    ),
    "residual_separation": separation(scored_disagree, "sam_residual_field_fraction"),
    "reading": (
        "the rule was chosen on the B-unmapped class; if the same threshold also picks out "
        "D-right items here, the signal is about D and residual fields, not about this class"
    ),
}

# ---- and on the settled items: the rule must not contradict what is already agreed -----
scored_agree = [r for r in agree_p if r["D_right"] is not None]
part2["sanity_bulk_agreement"] = {
    "n": len(scored_agree),
    "bulk_label_accuracy": pct(sum(1 for r in scored_agree if r["D_right"]), len(scored_agree)),
    "rule": ARBITER_RULE_LABEL,
    "rule_residual_ge_090": rule_eval(
        scored_agree,
        lambda r: (r.get("sam_residual_field_fraction") or 0) >= ARBITER_RULE_THRESHOLD
    ),
    "residual_separation": separation(scored_agree, "sam_residual_field_fraction"),
    "note": (
        "on settled items the rule changes nothing; this only asks whether high residual "
        "also marks correct bulk labels there"
    ),
}

# ---- the same hypothesis at full statistical power ------------------------------------
# D's only failure mode anywhere is calling gradient on a flat cover. If a large residual
# field really is evidence that a field exists behind the scene, it should predict which of
# D's gradient calls are right across the WHOLE primary population, not just in this class.
all_d_grad = [
    r for r in items
    if r["truth_binary"] and r["D_binary"] == "gradient"
    and r.get("sam_residual_field_fraction") is not None
]
part2["pooled_all_D_gradient_calls"] = {
    "n": len(all_d_grad),
    "D_right": sum(1 for r in all_d_grad if r["D_right"]),
    "accuracy": pct(sum(1 for r in all_d_grad if r["D_right"]), len(all_d_grad)),
    "residual_separation": separation(all_d_grad, "sam_residual_field_fraction"),
    "text_separation": separation(all_d_grad, "sam_text_fraction"),
    "person_separation": separation(all_d_grad, "sam_person_fraction"),
    "rule_residual_ge_090": rule_eval(
        all_d_grad, lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.90
    ),
    "by_route": {
        route: rule_eval(
            [r for r in all_d_grad if r["route"] == route],
            lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.90,
        )
        for route in sorted({r["route"] for r in all_d_grad})
    },
    "reading": (
        "this is the hypothesis with every item it can possibly use; an AUC near 0.5 here "
        "means residual geometry carries no information about when D over-calls gradient"
    ),
}

# ---- the one feature that behaved consistently: how much text SAM found ---------------
# D's wrong gradient calls carry roughly twice the text area of its right ones. Text is not
# the ground, so this is a different mechanism from the residual-field hypothesis: covers
# with a lot of lettering tend to get flat palettes, whatever the photograph behind them.
TEXT_RULE_T = 0.05  # [MEASURED] median text area fraction of D's correct gradient calls


def text_rule(r):
    return (r.get("sam_text_fraction") or 0) < TEXT_RULE_T


part2["text_area_alternative"] = {
    "rule": f"commit to D when SAM text area fraction < {TEXT_RULE_T}",
    "on_class": rule_eval(scored_class, text_rule),
    "on_pooled_D_gradient_calls": rule_eval(all_d_grad, text_rule),
    "by_route_pooled": {
        route: rule_eval([r for r in all_d_grad if r["route"] == route], text_rule)
        for route in sorted({r["route"] for r in all_d_grad})
    },
    "combined_with_residual": {
        "rule": "text<0.05 and residual>=0.90",
        "on_class": rule_eval(
            scored_class,
            lambda r: text_rule(r) and (r.get("sam_residual_field_fraction") or 0) >= 0.90,
        ),
        "on_pooled_D_gradient_calls": rule_eval(
            all_d_grad,
            lambda r: text_rule(r) and (r.get("sam_residual_field_fraction") or 0) >= 0.90,
        ),
    },
    "permutation_p_on_pooled": perm_p(all_d_grad, text_rule),
    "caveat": (
        "this threshold was read off the same data it is scored on; the permutation p is "
        "uncorrected for the search that found it"
    ),
}

# ---- is any of this arbitration, or just a direct predictor of the flag? --------------
# A feature that predicts the gradient flag on its own is not arbitrating between B and D;
# it is a third opinion. Measured against the flag directly, on every primary item.
def sep_vs_truth(rows, feature):
    g = [r[feature] for r in rows if r["truth_binary"] == "gradient" and r.get(feature) is not None]
    f = [r[feature] for r in rows if r["truth_binary"] == "flat" and r.get(feature) is not None]
    if not g or not f:
        return None
    gv, fv = np.array(g, float), np.array(f, float)
    allv = np.concatenate([gv, fv])
    ranks = np.empty(len(allv))
    ranks[allv.argsort()] = np.arange(1, len(allv) + 1)
    for v in np.unique(allv):
        m = allv == v
        ranks[m] = ranks[m].mean()
    n1, n2 = len(gv), len(fv)
    u = ranks[:n1].sum() - n1 * (n1 + 1) / 2
    return {
        "gradient_mean": round(float(gv.mean()), 4),
        "flat_mean": round(float(fv.mean()), 4),
        "auc_gradient_above_flat": round(float(u / (n1 * n2)), 4),
        "n_gradient": n1, "n_flat": n2,
    }


primary_scored = [r for r in items if r["truth_binary"]]
part2["features_vs_flag_directly"] = {
    "population": "all unconflicted primary items, feature against the accepted-palette flag",
    "features": {
        f: sep_vs_truth(primary_scored, f)
        for f in ("sam_residual_field_fraction", "sam_text_fraction", "sam_person_fraction",
                  "residual_coherence", "sam_instances_total")
    },
    "same_on_class_only": {
        f: sep_vs_truth(scored_class, f)
        for f in ("sam_residual_field_fraction", "sam_text_fraction", "sam_person_fraction")
    },
    "reading": (
        "if a feature separates gradient from flat here about as well as it separates "
        "D-right from D-wrong, it is a weak standalone gradient detector, not an arbiter"
    ),
}

# ---- leave-one-out stability of the winning threshold ---------------------------------
loo = []
for i in range(len(scored_class)):
    sub = scored_class[:i] + scored_class[i + 1:]
    best, nm = -1.0, None
    for f in ("sam_residual_field_fraction",):
        vals = sorted({float(r[f]) for r in sub if r.get(f) is not None})
        for t in vals:
            m = [r for r in sub if (r.get(f) or 0) >= t]
            if len(m) < MIN_COMMIT_N:
                continue
            p = sum(1 for r in m if r["D_right"]) / len(m)
            if p > best:
                best, nm = p, round(t, 4)
    loo.append(nm)
part2["leave_one_out_threshold_stability"] = {
    "chosen_thresholds": dist(loo),
    "reading": "one threshold repeated across nearly every fold means the cut is not driven by a single image",
}


# ---------------------------------------------------------------- examples

def example(r):
    return {
        "image_path": r["image_path"],
        "absolute_path": r["absolute_path"],
        "tier": r["tier"],
        "flag_gradient": r["flag_gradient"],
        "B": r["B_ground_type"],
        "D": r["D_ground_type"],
        "adjudicator_A": r["A_ground_type"],
        "D_right": r["D_right"],
        "sam_residual_field_fraction": r.get("sam_residual_field_fraction"),
        "residual_coherence": r.get("residual_coherence"),
        "sam_person_fraction": r.get("sam_person_fraction"),
        "sam_text_fraction": r.get("sam_text_fraction"),
    }


examples = {
    "typical_class_member_D_right": [example(r) for r in scored_class if r["D_right"]][:3],
    "typical_class_member_D_wrong": [example(r) for r in scored_class if not r["D_right"]][:3],
    "highest_residual": [example(r) for r in sorted(
        scored_class, key=lambda r: -(r.get("sam_residual_field_fraction") or 0))[:3]],
    "lowest_residual": [example(r) for r in sorted(
        scored_class, key=lambda r: (r.get("sam_residual_field_fraction") or 0))[:3]],
}

# ---- what actually splits the class: D's own word, not any SAM feature ----------------
def by_answer(rows, key):
    out = {}
    for r in rows:
        v = r[key]
        out.setdefault(v, {"n": 0, "right": 0})
        out[v]["n"] += 1
        if r["D_right"]:
            out[v]["right"] += 1
    for v in out:
        out[v]["accuracy"] = pct(out[v]["right"], out[v]["n"])
    return dict(sorted(out.items(), key=lambda kv: -kv[1]["n"]))


part2["D_ground_type_reliability"] = {
    "in_class": by_answer(scored_class, "D_ground_type"),
    "all_primary": by_answer(primary_scored, "D_ground_type"),
    "in_bulk_agreement": by_answer(scored_agree, "D_ground_type"),
    "in_bd_disagree": by_answer(scored_disagree, "D_ground_type"),
    "split_rule": {
        "rule": "inside the class, commit only when D answers multiple_distinct_fields (-> flat); "
                "leave D's shaded_field answers undetermined",
        "on_class": rule_eval(
            scored_class, lambda r: r["D_ground_type"] == "multiple_distinct_fields"
        ),
        "residual_or_text_added_on_top_of_shaded_field_subset": {
            "residual>=0.90": rule_eval(
                [r for r in scored_class if r["D_ground_type"] == "shaded_field"],
                lambda r: (r.get("sam_residual_field_fraction") or 0) >= 0.90,
            ),
            "text<0.05": rule_eval(
                [r for r in scored_class if r["D_ground_type"] == "shaded_field"],
                text_rule,
            ),
        },
    },
    "reading": (
        "D's multiple_distinct_fields answer is a different kind of statement from its "
        "shaded_field answer, and the two have very different error rates"
    ),
}

# ---------------------------------------------------------------- rates and verdict

part1["class_rate_by_tier"] = {
    tier: {
        "tier_total": sum(1 for r in items if r["tier"] == tier),
        "class_members": sum(1 for r in klass if r["tier"] == tier),
        "class_rate": pct(
            sum(1 for r in klass if r["tier"] == tier),
            sum(1 for r in items if r["tier"] == tier),
        ),
    }
    for tier in sorted({r["tier"] for r in items})
}
part1["b_and_adjudicator_agree_unmapped"] = {
    "n": sum(1 for r in klass if r["A_binary"] == "unmapped"),
    "of": len(klass),
    "note": (
        "B (30B, prompt B) and the adjudicator (32B, prompt A) independently answer an "
        "unmapped ground type on these; only D reads a field"
    ),
}
part1["embeddings_coverage_note"] = (
    "18 of 142 eval items are the repo's images/ fixture set, which is not in the sharded or "
    "music_artworks embedding collections; cluster numbers cover the other 124 (41 of 44 class members)"
)

def binom_tail(k, n, p):
    """P(X >= k) under Binomial(n, p) — exact, no scipy.stats needed."""
    return float(f"{sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k, n + 1)):.3g}")


d_nonshaded = [r for r in primary_scored if r["D_ground_type"] != "shaded_field"]
d_shaded = [r for r in primary_scored if r["D_ground_type"] == "shaded_field"]
# Phase-0 adversarial review finding 11: `flat_prior` is `pct(...)`, i.e. already rounded to 4
# decimals, and it used to be passed straight into `binom_tail` as the null parameter. Rounding a
# parameter before a tail probability is a habit worth not keeping: 0.5328 gives 2.33e-07 where
# the unrounded 73/137 = 0.5328467 gives 2.34e-07. The rounded value is still published (it is
# the readable one); the test now uses the exact one.
flat_prior_exact = (sum(1 for r in primary_scored if r["truth_binary"] == "flat")
                    / len(primary_scored)) if primary_scored else None
flat_prior = pct(sum(1 for r in primary_scored if r["truth_binary"] == "flat"), len(primary_scored))
part2["D_ground_type_reliability"]["significance"] = {
    "D_non_shaded_answers": {
        "n": len(d_nonshaded),
        "right": sum(1 for r in d_nonshaded if r["D_right"]),
        "accuracy": pct(sum(1 for r in d_nonshaded if r["D_right"]), len(d_nonshaded)),
    },
    "D_shaded_answers": {
        "n": len(d_shaded),
        "right": sum(1 for r in d_shaded if r["D_right"]),
        "accuracy": pct(sum(1 for r in d_shaded if r["D_right"]), len(d_shaded)),
    },
    "flat_base_rate": flat_prior,
    "flat_base_rate_unrounded": flat_prior_exact,
    "p_non_shaded_beats_flat_base_rate": binom_tail(
        sum(1 for r in d_nonshaded if r["D_right"]), len(d_nonshaded), flat_prior_exact
    ),
    "p_non_shaded_note": (
        "one-sided exact binomial against the corpus flat base rate, computed with the "
        "UNROUNDED base rate (Phase-0 adversarial review finding 11; the 2026-08-03 "
        "publication passed the 4-dp rounded 0.5328 and got 2.33e-07). Read it with the "
        "definitional caveat below: for a non-shaded D answer, D_right IS truth == flat, "
        "because both flat_field and multiple_distinct_fields map to flat. So '32 of 34 "
        "right' is exactly '32 of those 34 covers carry a flat flag', and this binomial "
        "against the flat base rate is the correct — and applied — correction for that."
    ),
    "p_class_8_of_8_beats_shaded_rate": binom_tail(
        8, 8, pct(sum(1 for r in d_shaded if r["D_right"]), len(d_shaded))
    ),
    # Phase-0 adversarial review finding 6. Stated here rather than left for a reader to work
    # out, because this file applies two different standards of evidence to two hypotheses
    # examined on the same 43 items, and the surviving one got the lenient standard.
    "p_class_8_of_8_status": {
        "label": "EXPLORATORY — not a confirmatory p-value",
        "why": (
            "plain one-sided binomial, no multiplicity correction of any kind, with the null "
            "parameter estimated from the same 43 items that suggested the rule. The SAM "
            "residual-geometry hypothesis this rule replaced was killed by a max-statistic "
            "permutation test over a 364-rule grid (corrected p 0.2927) — correct practice — "
            "but GRID_FEATURES holds SAM numeric features only, so THIS rule was never in the "
            "corrected search space, even though candidate_rules shows D's own answer and D's "
            "confidence were searched alongside the SAM features."
        ),
        "what_should_be_quoted_instead": (
            "the out-of-class corroboration, which is real held-out evidence and needs no "
            "correction: the D-vocabulary gate reproduces OUTSIDE this class. See "
            "D_ground_type_reliability.all_primary and .in_bulk_agreement."
        ),
        "out_of_class_corroboration": {
            "all_primary": {
                k: part2["D_ground_type_reliability"]["all_primary"].get(k)
                for k in ("multiple_distinct_fields", "flat_field")
            },
            "in_bulk_agreement": {
                k: part2["D_ground_type_reliability"]["in_bulk_agreement"].get(k)
                for k in ("multiple_distinct_fields", "flat_field")
            },
        },
        "mirror_test_not_run": (
            "the mirror of the non-shaded binomial — D's shaded_field answers against the "
            "gradient base rate — is reported here for symmetry rather than left unstated."
        ),
        "mirror_test": {
            "shaded_right": sum(1 for r in d_shaded if r["D_right"]),
            "shaded_n": len(d_shaded),
            "gradient_base_rate": (None if flat_prior_exact is None else round(1 - flat_prior_exact, 4)),
            "p_shaded_beats_gradient_base_rate": (
                None if flat_prior_exact is None else binom_tail(
                    sum(1 for r in d_shaded if r["D_right"]), len(d_shaded), 1 - flat_prior_exact)
            ),
        },
    },
}

verdict = {
    "class_is": (
        "semantically coherent, visually scattered: two independent prompts on two different "
        "models read a photographic scene or a texture where the third reads a shaded field. "
        "It is not a distinct visual family in DINOv2 space and its gradient-flag rate is the "
        "same as the rest of the corpus."
    ),
    "sam_arbitration": (
        "no. Residual-field geometry does not arbitrate. The best residual threshold on the "
        "class looks strong in isolation but does not survive correction for the search that "
        "found it, and it does not reproduce on the other routed class or on settled items."
    ),
    "why_the_apparent_signal": (
        "D's only failure mode anywhere is calling gradient on a flat cover, so ANY weak "
        "flat-detector separates D-right from D-wrong. SAM text area is exactly that: it "
        "predicts the flag directly about as well as it predicts D's correctness, which means "
        "it is a third weak opinion, not an arbiter of the B/D conflict."
    ),
    "what_does_split_the_class": (
        "D's own word. Where D answers multiple_distinct_fields the class label is right 8 of "
        "8; where D answers shaded_field it is right 22 of 35. The same asymmetry holds across "
        "the whole primary population (non-shaded answers 32/34 right, shaded answers 62/103)."
    ),
    "recommendation": (
        "Partial take-D, gated on D's vocabulary rather than on SAM: commit the 8 items where "
        "D answers multiple_distinct_fields, leave D's 35 shaded_field readings undetermined. "
        "That converts about a fifth of the class at no measured cost and keeps the honest "
        "'underdetermined' label on the part no available instrument can settle."
    ),
}
part2["verdict"] = verdict

PICKS = [
    ("0c/ab67616d00001e02000c3523d80259b49a06ee45",
     "canonical class member: SAM finds nothing at all (residual 1.00), B and the adjudicator "
     "call it a scene, D calls a shaded field, and the accepted palette did use a gradient — "
     "D right"),
    ("0b/ab67616d0000b273000ba4a828abadcf3f4642f6",
     "the counterexample that kills the residual hypothesis: residual 0.9997, no person, no "
     "text — the largest coherent residual field in the class, and D's gradient reading is "
     "still wrong against the flat flag"),
    ("images/knuckles.jpg",
     "the other shape of the class: a large person mask (0.30) over a scene; B says full_scene, "
     "the adjudicator says pattern_or_texture, D says shaded field and is wrong"),
    ("12/ab67616d00001e0200124d0597059e8987bc4577",
     "the commit subset: D answers multiple_distinct_fields rather than shaded_field, which "
     "maps to flat and matches the flag — 8 of 8 such items are right"),
    ("02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg",
     "the only class member with reviewer gold: the reviewer independently answered "
     "pattern_or_texture, agreeing with B that there is no single field — and D's flat commit "
     "still matched the accepted palette"),
]
reviewer_examples = []
by_path = {r["image_path"]: r for r in items}
for path, why in PICKS:
    r = by_path.get(path)
    if r:
        e = example(r)
        e["why_look_at_this_one"] = why
        reviewer_examples.append(e)

# Phase-0 adversarial review finding 5: every number in `summary_lines` is now interpolated from
# the computed blocks. These are the lines A10 and this file's own `verdict` quote, and half of
# each sentence used to be a typed-in literal — so a changed input moved the interpolated half
# and left the literal half behind, silently.
_rel_class = part2["D_ground_type_reliability"]["in_class"]
_rel_primary = part2["D_ground_type_reliability"]["all_primary"]
_sig = part2["D_ground_type_reliability"]["significance"]
_class_D = part1["class"]["D_ground_type"]
_tiers = part1["class_rate_by_tier"]
_best = part2["best_by_commit_precision"][0] if part2["best_by_commit_precision"] else None
_best_on_class = next((c["on_class"] for c in part2["candidate_rules"]
                       if _best and c["rule"] == _best["rule"]), {})
_ooc = part2["out_of_class_check_bd_disagree"]["rule_residual_ge_090"]
_settled_auc = part2["sanity_bulk_agreement"]["residual_separation"]["auc_right_above_wrong"]


def _acc(block, key):
    """'8/8' for a by_answer entry, or 'n/a' if D never gave that answer here."""
    e = block.get(key)
    return "n/a" if not e else f"{e['right']}/{e['n']}"


def _d_reads() -> str:
    return ", ".join(f"{v} on {n}" for v, n in _class_D.items())


def _non_shaded_all_primary() -> str:
    right = sum(e["right"] for k, e in _rel_primary.items() if k != "shaded_field")
    n = sum(e["n"] for k, e in _rel_primary.items() if k != "shaded_field")
    return f"{right}/{n}"


summary_lines = [
    f"The class is {len(klass)} of 142 eval images ({len(klass_p)} with usable truth): B answers "
    "an unmapped ground type, D commits.",
    f"B's unmapped value is full_scene on {part1['class']['B_ground_type'].get('full_scene', 0)} "
    f"and pattern_or_texture on {part1['class']['B_ground_type'].get('pattern_or_texture', 0)}; "
    f"the 32B adjudicator independently answers unmapped on {part1['b_and_adjudicator_agree_unmapped']['n']} "
    f"of {len(klass)}, which is why the cascade leaves them undetermined.",
    f"D reads {_d_reads()}. Take-D would be "
    f"{part2['baseline_take_D']['right']}/{part2['baseline_take_D']['n']} = "
    f"{part2['baseline_take_D']['accuracy']} right, and every error is the same one: gradient "
    "called on a flat cover.",
    "The class is NOT a distinct visual family: mean within-class DINOv2 cosine "
    f"{part1['embeddings']['mean_cosine_within_class']} is below within-rest "
    f"{part1['embeddings']['mean_cosine_within_rest']}, and its members touch every k-means "
    "cluster at k=4..10.",
    "Nor is it truth-distinctive: gradient-flag rate "
    f"{part1['class']['flag_gradient_rate']} against {part1['not_routed_bulk_agreement']['flag_gradient_rate']} "
    "on settled items. It is thumbnail-heavy ("
    f"{_tiers['thumbnail_<=320']['class_rate']:.0%} of thumbnails land here vs "
    f"{_tiers['large_>640']['class_rate']:.0%} of large images).",
    f"SAM arbitration verdict: NO. The best residual rule ({_best['rule'] if _best else 'n/a'}) "
    f"commits {_best_on_class.get('commit_n')} with {_best_on_class.get('commit_D_right')} "
    "right, but the multiplicity-corrected p over the same search space is "
    f"{part2['multiplicity_corrected_search']['p_value_corrected']}, and the rule does not "
    f"reproduce out of class ({_ooc['commit_D_right']}/{_ooc['commit_n']} on BD-disagree) or on "
    f"settled items (AUC {_settled_auc}).",
    "SAM text area is a real but weak signal in the wrong sense: it predicts the gradient flag "
    "directly about as well as it predicts D's correctness, so it is a third opinion, not an "
    "arbiter.",
    "What does split the class is D's own word: multiple_distinct_fields "
    f"{_acc(_rel_class, 'multiple_distinct_fields')} right, shaded_field "
    f"{_acc(_rel_class, 'shaded_field')} — the same asymmetry as the whole corpus "
    f"(non-shaded {_non_shaded_all_primary()}).",
    "That D-vocabulary split is the argument, and the evidence for it is the out-of-class "
    f"corroboration, not a p-value: on ALL primary items D reads multiple_distinct_fields "
    f"{_acc(_rel_primary, 'multiple_distinct_fields')} and flat_field "
    f"{_acc(_rel_primary, 'flat_field')}; on bulk-agreement items "
    f"{_acc(part2['D_ground_type_reliability']['in_bulk_agreement'], 'multiple_distinct_fields')} "
    f"and {_acc(part2['D_ground_type_reliability']['in_bulk_agreement'], 'flat_field')}. The "
    f"in-class {_acc(_rel_class, 'multiple_distinct_fields')} binomial "
    f"(p {_sig['p_class_8_of_8_beats_shaded_rate']}) is EXPLORATORY: uncorrected, with its null "
    "estimated from the same 43 items that suggested the rule, while the SAM hypothesis it "
    "replaced was held to a 364-rule corrected standard.",
    f"Recommendation: commit the {_rel_class.get('multiple_distinct_fields', {}).get('n', 0)} "
    f"D-multiple_distinct_fields items, leave the "
    f"{_rel_class.get('shaded_field', {}).get('n', 0)} D-shaded_field items undetermined.",
]

out = {
    "what_this_is": (
        "Characterization of the cascade route 'B answers an unmapped ground_type while D commits', "
        "and a test of whether SAM residual-field geometry can arbitrate it. Composed offline from "
        "committed files; no inference was run."
    ),
    "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "inputs": {
        "cascade": CASCADE, "eval_set": EVAL_SET, "bulk_B": RUN_B, "bulk_D": RUN_D,
        "gold": GOLD, "sam": SAM,
        "embeddings": "dinov2-vitl14 sharded + music_artworks",
    },
    "class_definition": CLASS_ROUTE,
    # Phase-0 adversarial review finding 4: which instrument each per_item column comes from.
    # The `A_` prefix is the cascade's ADJUDICATOR; the bulk model's own variant-A answer is a
    # different model and is now named as such.
    "column_provenance": {
        "B_*": {"model": "Qwen3-VL-30B-A3B-Instruct-6bit", "arm": "bulk",
                "prompt_variant": "B", "source_file": RUN_B},
        "D_*": {"model": "Qwen3-VL-30B-A3B-Instruct-6bit", "arm": "bulk criterion",
                "prompt_variant": "D", "source_file": RUN_D},
        "A_ground_type / A_binary": {"model": "Qwen3-VL-32B-Instruct-8bit", "arm": "adjudicator",
                                     "prompt_variant": "A", "source_file": CASCADE},
        "bulk_variantA_confidence": {
            "model": "Qwen3-VL-30B-A3B-Instruct-6bit", "arm": "bulk",
            "prompt_variant": "A", "source_file": RUN_B,
            "renamed_from": "A_confidence",
            "why": ("published until 2026-08-03 as `A_confidence`, beside two adjudicator "
                    "columns it does not share a model with. The two models' variant-A "
                    "ground_type differs on 34 of 142 images; the mix was invisible only "
                    "because `confidence` saturates at `high` in both."),
        },
        "reviewer_*": {"model": None, "arm": "human", "source_file": GOLD},
        "sam_*": {"model": "SAM3 concept set v2", "arm": "geometry", "source_file": SAM},
    },
    "verdict": verdict,
    "summary_lines": summary_lines,
    "part_1_characterization": part1,
    "part_2_sam_arbitration": part2,
    "reviewer_examples": reviewer_examples,
    "examples": examples,
    "per_item": [
        {k: v for k, v in r.items() if k != "absolute_path"} for r in items if r["is_class"]
    ],
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1, ensure_ascii=False)
    fh.write("\n")

print("wrote", OUT)
print("class n:", len(klass), "scored:", len(scored_class))
print("take-D baseline:", part2["baseline_take_D"])
print("best by commit precision:", json.dumps(part2["best_by_commit_precision"], indent=1))

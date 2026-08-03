"""Visual sanity check for the bake-off finalists.

Two static pages, no build step, no external assets:

  gallery/<arm>.html   k-means clusters, one row per cluster. Half the shown
                       members are the ones nearest the centroid (what the
                       cluster "is"), half are random members (whether the rest
                       of the cluster agrees). Anything that looks like a
                       coherent visual family is the model working; a giant
                       catch-all cluster or a pile of singletons is a finding.
  gallery/neighbors.html  fixed query covers, top-8 neighbours from every
                       finalist side by side, with cosine values.

Everything is deterministic: the k-means seed, the number of clusters, and the
random-member sampling are all pinned constants, so re-running reproduces the
same pages byte for byte.

Chrome is flat black and white on purpose. The artworks supply the colour; if
the page supplied any, you could not trust what you were looking at.

HOLDOUT. These pages show a human real album art, so they can spend held-out
artworks. The pages built on 2026-08-02 did: 117 of the 413 held-out artworks
and 2 quarantined ones were rendered, unrecorded (adversarial review 2026-08-03,
MAJOR-1; disclosure in `data/holdout/HOLDOUT.md`). Since 2026-08-03 the render
step is gated by `holdout_filter` and the policy is stamped into every page and
into summary.json. The default is `--holdout exclude`. The embedding pool,
k-means and neighbour search are NOT filtered -- the holdout bars looking at an
artwork, not computing over it, and a filtered pool would make every cluster
count incomparable with the corpus.

Usage:
  .venv/bin/python gallery.py                     # both pages, all finalists
  .venv/bin/python gallery.py --arms dinov2-vitl14
  .venv/bin/python gallery.py --clusters-only
  .venv/bin/python gallery.py --neighbors-only
  .venv/bin/python gallery.py --holdout mark      # deliberate look; SPENDS them
"""

from __future__ import annotations

import os

# Pin BLAS to one thread BEFORE numpy is imported anywhere. Multithreaded matmul
# does not fix its reduction order, so the same k-means step can produce results
# differing in the last float32 bits between runs; that is enough to flip a point
# sitting between two centroids and silently change the gallery. Determinism is
# the whole contract of this page, so it wins over the few seconds this costs.
for _blas_var in (
    "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS", "NUMEXPR_NUM_THREADS",
):
    os.environ.setdefault(_blas_var, "1")

import argparse
import html
import json
import time
from pathlib import Path

import config
import common
import eval_pairs
import holdout_filter

# [REVIEWED] Cluster count. The reviewer asked for k about 36; 36 also divides
# the corpus into groups averaging ~450 files, which is small enough that a row
# of 20 samples says something about the cluster and large enough that 36 rows
# stay readable on one page.
KMEANS_K = 36

# [REVIEWED] Seeds every random choice on these pages. Pinned so the gallery is
# reproducible and so two reviewers discussing "cluster 17" mean the same thing.
KMEANS_SEED = 20260802

# [MEASURED] Lloyd iteration ceiling. dinov2 converges at 95 and dinov3 at 69,
# but pe-core needed more than 100, so the ceiling was raised on 2026-08-02 until
# every arm converged rather than reporting a truncated run as if it were final.
KMEANS_MAX_ITERS = 300

# [REVIEWED] Members shown per cluster row: half nearest the centroid, half drawn
# at random from the remainder. The split is what makes the row diagnostic --
# nearest-only would flatter every cluster.
MEMBERS_PER_CLUSTER = 20

# [MEASURED] Margin used to decide "as good as the best centroid".
#
# numpy on Apple Silicon uses Accelerate, which ignores the BLAS thread
# environment variables and does not promise a fixed reduction order, so the same
# matmul differs in its last bits between runs. Rounding the scores was tried
# first and was NOT enough: rounding only quantizes the noise, and a point whose
# two best centroids sit near a rounding boundary still flips. Measured on
# 2026-08-02, dinov2 became stable but dinov3 and pe-core did not.
#
# So the assignment does not compare scores for equality at all. Every centroid
# within this margin of the row's best score is treated as tied, and the tie goes
# to the lowest centroid index. Float noise is ~1e-13 over a 1024-length float64
# dot product, ten orders of magnitude below this margin, so it cannot change the
# candidate set; and a margin this small cannot change which cluster a point
# genuinely belongs to. Distances are rounded on the same reasoning before the
# within-cluster ordering.
ASSIGNMENT_TIE_MARGIN = 1e-6
DECISION_ROUND_DECIMALS = 6

# [REVIEWED] Neighbours shown per query per model.
NEIGHBOURS_PER_QUERY = 8

# [MEASURED] Rendered thumbnail edge in CSS pixels. The corpus is 99% square
# (spec section 7), so a square box crops almost nothing.
THUMB_PX = 96

# [REVIEWED] Finalists. SigLIP2 lost the bake-off (R@1 0.6766 vs 0.77-0.79) and
# is excluded from the visual check on the coordinator's instruction.
FINALIST_ARMS = (
    config.ARM_DINOV2,
    config.ARM_PE_CORE,
    config.ARM_DINOV3,
)

GALLERY_DIR_NAME = "gallery"


# --------------------------------------------------------------------------
# Clustering
# --------------------------------------------------------------------------


def kmeans(matrix, k: int, seed: int, max_iters: int):
    """Plain Lloyd k-means with k-means++ init. Deterministic given the seed.

    The vectors are L2-normalized, so squared Euclidean distance is a monotone
    function of cosine distance and this is effectively spherical k-means.
    """
    import numpy as np

    # float64 throughout: with single-threaded BLAS the reduction order is already
    # fixed, and the extra mantissa makes an argmax flip from rounding
    # vanishingly unlikely rather than merely rare.
    matrix = np.ascontiguousarray(matrix, dtype="float64")
    rng = np.random.default_rng(seed)
    n_samples = matrix.shape[0]

    # k-means++ initialization.
    centers = np.empty((k, matrix.shape[1]), dtype="float64")
    first = int(rng.integers(n_samples))
    centers[0] = matrix[first]
    closest_sq = ((matrix - centers[0]) ** 2).sum(axis=1)
    for index in range(1, k):
        total = float(closest_sq.sum())
        if total <= 0:
            centers[index] = matrix[int(rng.integers(n_samples))]
        else:
            pick = int(rng.choice(n_samples, p=closest_sq / total))
            centers[index] = matrix[pick]
        dist = ((matrix - centers[index]) ** 2).sum(axis=1)
        closest_sq = np.minimum(closest_sq, dist)

    assignments = np.full(n_samples, -1, dtype="int32")
    iterations = 0
    for iterations in range(1, max_iters + 1):
        # ||x||^2 is constant across centers, so argmin needs only these terms.
        scores = matrix @ centers.T
        scores *= 2.0
        scores -= (centers ** 2).sum(axis=1)[None, :]
        # Everything within the margin of the best score counts as tied; argmax
        # over the boolean picks the first True, i.e. the lowest centroid index.
        row_best = scores.max(axis=1, keepdims=True)
        tied = scores >= (row_best - ASSIGNMENT_TIE_MARGIN)
        new_assignments = np.argmax(tied, axis=1).astype("int32")

        if np.array_equal(new_assignments, assignments):
            break
        assignments = new_assignments

        for index in range(k):
            members = matrix[assignments == index]
            if members.shape[0]:
                centers[index] = members.mean(axis=0)
            else:
                # Deterministic empty-cluster repair: adopt the point currently
                # worst served by its own center.
                best = scores[np.arange(n_samples), assignments]
                centers[index] = matrix[int(np.argmin(best))]

    distances = np.linalg.norm(matrix - centers[assignments], axis=1)
    np.round(distances, DECISION_ROUND_DECIMALS, out=distances)
    return assignments, centers, distances, iterations


def cluster_arm(out_dir: Path, arm_tag: str, allow_partial: bool = False):
    """Load one arm's full corpus and cluster it.

    The pool is checked for completeness before anything is clustered. Two arms
    clustered at different pool sizes produce side-by-side pages that are not
    comparable, and the header's `pool` line reads as authoritative either way
    (review 2026-08-03, MINOR-12).
    """
    import numpy as np
    import query as query_mod

    provenance = query_mod.require_complete(
        out_dir, config.COLLECTIONS, arm_tag, allow_partial=allow_partial
    )

    blocks, rows = [], []
    for collection in config.COLLECTIONS:
        matrix, index = query_mod.load_collection(out_dir, collection, arm_tag)
        blocks.append(matrix)
        rows.extend(index)
    pool = np.ascontiguousarray(np.concatenate(blocks, axis=0), dtype="float32")

    started = time.perf_counter()
    assignments, centers, distances, iterations = kmeans(
        pool, KMEANS_K, KMEANS_SEED, KMEANS_MAX_ITERS
    )
    elapsed = time.perf_counter() - started

    rng = np.random.default_rng(KMEANS_SEED)
    clusters = []
    for index in range(KMEANS_K):
        member_ids = np.flatnonzero(assignments == index)
        # Stable sort so that equal rounded distances keep corpus order, which is
        # itself fixed by the sorted enumeration.
        order = member_ids[np.argsort(distances[member_ids], kind="stable")]
        n_near = min(MEMBERS_PER_CLUSTER // 2, order.size)
        near = order[:n_near]
        remaining = order[n_near:]
        n_rand = min(MEMBERS_PER_CLUSTER - n_near, remaining.size)
        rand = (
            rng.choice(remaining, size=n_rand, replace=False)
            if remaining.size
            else np.array([], dtype="int64")
        )
        rand = np.sort(rand)
        clusters.append(
            {
                "id": index,
                "size": int(member_ids.size),
                "mean_distance": float(distances[member_ids].mean())
                if member_ids.size
                else 0.0,
                "near": [rows[i] for i in near],
                "random": [rows[i] for i in rand],
                "collections": {
                    collection: int(
                        sum(1 for i in member_ids if rows[i]["collection"] == collection)
                    )
                    for collection in config.COLLECTIONS
                },
            }
        )

    sizes = np.array([c["size"] for c in clusters])
    stats = {
        "arm": arm_tag,
        "k": KMEANS_K,
        "seed": KMEANS_SEED,
        "iterations": iterations,
        "converged": iterations < KMEANS_MAX_ITERS,
        "seconds": round(elapsed, 1),
        "pool": int(pool.shape[0]),
        "pool_complete": all(p["complete"] for p in provenance),
        "pool_provenance": provenance,
        "dim": int(pool.shape[1]),
        "size_min": int(sizes.min()),
        "size_max": int(sizes.max()),
        "size_mean": float(sizes.mean()),
        "size_median": float(np.median(sizes)),
        "largest_share": float(sizes.max() / sizes.sum()),
        "singleton_clusters": int((sizes <= 1).sum()),
        "tiny_clusters_under_10": int((sizes < 10).sum()),
        "giant_clusters_over_4x_mean": int((sizes > 4 * sizes.mean()).sum()),
        "sizes_sorted_desc": sorted((int(s) for s in sizes), reverse=True),
    }
    clusters.sort(key=lambda c: -c["size"])
    return clusters, stats


# --------------------------------------------------------------------------
# Neighbours
# --------------------------------------------------------------------------


def artwork_key(collection: str, path: str) -> str:
    """Artwork identity for collapsing renditions in a neighbour list."""
    stem = eval_pairs.stem_of(path)
    if collection == config.COLLECTION_SHARDED:
        match = eval_pairs.SHARDED_NAME_RE.match(stem)
        return f"{collection}:{match.group(2) if match else stem}"
    match = eval_pairs.MUSIC_NAME_RE.match(stem)
    return f"{collection}:{match.group(1) if match else stem}"


def neighbours_for(out_dir: Path, arm_tag: str, query_paths: list[str], groups: dict,
                   allow_partial: bool = False):
    """Top-N neighbours per query, with same-artwork renditions removed."""
    import numpy as np
    import query as query_mod

    query_mod.require_complete(
        out_dir, config.COLLECTIONS, arm_tag, allow_partial=allow_partial
    )

    blocks, rows = [], []
    for collection in config.COLLECTIONS:
        matrix, index = query_mod.load_collection(out_dir, collection, arm_tag)
        blocks.append(matrix)
        rows.extend(index)
    pool = np.ascontiguousarray(np.concatenate(blocks, axis=0), dtype="float32")
    index_of_path = {record["path"]: i for i, record in enumerate(rows)}

    # path -> every other file that is the same artwork, so they can be excluded.
    same_artwork: dict[str, set[str]] = {}
    for collection, collection_groups in groups.items():
        for members in collection_groups.values():
            for member in members:
                same_artwork[member] = {m for m in members if m != member}

    results = {}
    for path in query_paths:
        if path not in index_of_path:
            results[path] = None
            continue
        q_index = index_of_path[path]
        sims = pool @ pool[q_index]
        banned = {q_index}
        for sibling in same_artwork.get(path, ()):
            if sibling in index_of_path:
                banned.add(index_of_path[sibling])
        order = np.argsort(-sims)
        picked = []
        seen_artworks: dict[str, dict] = {}
        for candidate in order:
            candidate = int(candidate)
            if candidate in banned:
                continue
            record = rows[candidate]
            # Collapse other renditions of the SAME neighbouring artwork: showing
            # one cover four times at four sizes proves near-dup retrieval works,
            # which bakeoff.json already measures properly, and crowds out the
            # thing this panel is for -- what ELSE the model finds similar.
            key = artwork_key(record["collection"], record["path"])
            if key in seen_artworks:
                seen_artworks[key]["renditions"] += 1
                continue
            entry = {
                "path": record["path"],
                "similarity": float(sims[candidate]),
                "collection": record["collection"],
                "width": record.get("width"),
                "height": record.get("height"),
                "renditions": 1,
            }
            seen_artworks[key] = entry
            picked.append(entry)
            if len(picked) >= NEIGHBOURS_PER_QUERY:
                break
        results[path] = {
            "query": rows[q_index],
            "neighbours": picked,
            "excluded_same_artwork": len(banned) - 1,
        }
    return results


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px 20px 64px;
  background: #fff; color: #000;
  font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}
h1 { font-size: 15px; font-weight: 700; margin: 0 0 4px; letter-spacing: .02em; }
h2 { font-size: 13px; font-weight: 700; margin: 0; }
.sub { font-size: 11px; color: #555; margin: 0 0 20px; }
.stats { border: 1px solid #000; padding: 10px 12px; margin: 0 0 24px; font-size: 11px; }
.stats table { border-collapse: collapse; }
.stats td { padding: 1px 14px 1px 0; vertical-align: top; }
.stats .warn { font-weight: 700; }
.row { border-top: 1px solid #000; padding: 12px 0 14px; }
.row:last-child { border-bottom: 1px solid #000; }
.rowhead { display: flex; align-items: baseline; gap: 14px; margin: 0 0 8px; }
.rowhead .meta { font-size: 11px; color: #555; }
.bar { height: 6px; background: #000; margin: 4px 0 10px; }
.strip { display: flex; flex-wrap: wrap; gap: 8px; }
figure { margin: 0; width: THUMBpx; }
figure img {
  display: block; width: THUMBpx; height: THUMBpx; object-fit: cover;
  background: #eee; border: 1px solid #000;
}
figure.rand img { border: 1px dashed #999; }
figcaption {
  font-size: 9px; color: #555; margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tag { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #000; }
.tag.r { color: #888; }
figure.held img, figure.quar img { border: 3px solid #000; outline: 2px solid #fff; }
.tag.h {
  background: #000; color: #fff; padding: 0 3px; letter-spacing: .1em;
}
.holdout {
  border: 2px solid #000; padding: 8px 12px; margin: 0 0 20px; font-size: 11px;
}
.holdout b { text-transform: uppercase; letter-spacing: .06em; }
.legend { font-size: 11px; color: #555; margin: 0 0 18px; }
.legend b { color: #000; }
.q { border-top: 1px solid #000; padding: 16px 0 18px; }
.q:last-of-type { border-bottom: 1px solid #000; }
.qhead { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 10px; }
.qhead img {
  width: 128px; height: 128px; object-fit: cover;
  border: 2px solid #000; background: #eee;
}
.qwhy { font-size: 11px; color: #555; max-width: 60ch; }
.qwhy .name { color: #000; font-weight: 700; font-size: 13px; display: block; }
.model { margin: 0 0 10px; }
.model .mtag {
  font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
  border-bottom: 1px solid #000; display: inline-block; margin-bottom: 5px;
}
.sim { font-size: 9px; color: #000; }
footer {
  margin-top: 36px; border-top: 1px solid #000; padding-top: 10px;
  font-size: 10px; color: #555;
}
footer code { color: #000; }
a { color: #000; }
""".replace("THUMB", str(THUMB_PX))


def rel_to_repo(gallery_dir: Path) -> str:
    """Relative prefix from the gallery directory back to the repository root."""
    return os.path.relpath(config.REPO_ROOT, gallery_dir)


def img_tag(prefix: str, path: str, css_class: str = "") -> str:
    src = html.escape(f"{prefix}/{path}")
    cls = f' class="{css_class}"' if css_class else ""
    return f'<img{cls} loading="lazy" decoding="async" src="{src}" alt="">'


def short_name(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return name if len(name) <= 22 else name[:10] + "…" + name[-10:]


# --------------------------------------------------------------------------
# Holdout gate at the render step
# --------------------------------------------------------------------------


def gate(view, policy: str, records, path_of=lambda r: r["path"]):
    """Split records into (showable, withheld_counts) under the holdout policy.

    `withheld_counts` is {"held": n, "quarantined": n} and is reported on the
    page, so a row that is short of thumbnails says why rather than looking like
    a small cluster. Under `mark` and `ignore` nothing is withheld; the caller
    badges instead.
    """
    counts = {"held": 0, "quarantined": 0}
    showable = []
    for record in records:
        kind = view.classify(path_of(record))
        if kind != "open":
            counts[kind] += 1
            if policy == "exclude":
                continue
        showable.append(record)
    return showable, counts


def badge_for(view, policy: str, path: str) -> tuple[str, str]:
    """(extra figure class, caption badge html) for one thumbnail."""
    if policy == "ignore":
        return "", ""
    kind = view.classify(path)
    if kind == "held":
        return " held", " <span class='tag h'>holdout</span>"
    if kind == "quarantined":
        return " quar", " <span class='tag h'>quarantined</span>"
    return "", ""


def withheld_note(counts: dict) -> str:
    if not counts["held"] and not counts["quarantined"]:
        return ""
    bits = []
    if counts["held"]:
        bits.append(f"{counts['held']} held out")
    if counts["quarantined"]:
        bits.append(f"{counts['quarantined']} quarantined")
    return " &middot; " + html.escape(", ".join(bits)) + " withheld"


def holdout_banner(view, policy: str, totals: dict) -> str:
    """The page's own disclosure. Every page carries one, whatever the policy."""
    source = "research/v3/data/holdout/holdout.json"
    if policy == "exclude":
        body = (
            f"<b>holdout: excluded.</b> {totals['held']} thumbnail slot(s) of "
            f"held-out artworks and {totals['quarantined']} of quarantined "
            "non-candidates were withheld from this page. Cluster sizes, "
            "centroids and neighbour ranks are computed over the FULL pool — "
            "only the rendering is gated. Nothing on this page spends a "
            "held-out artwork."
        )
    elif policy == "mark":
        body = (
            f"<b>holdout: SHOWN AND MARKED.</b> This page renders "
            f"{totals['held']} thumbnail slot(s) of held-out artworks and "
            f"{totals['quarantined']} of quarantined non-candidates, badged "
            "in black. Looking at them SPENDS them: record it in HOLDOUT.md "
            "and remove them from the end-of-campaign claim."
        )
    else:
        body = (
            "<b>holdout: IGNORED.</b> This page was built with "
            "<code>--holdout ignore</code>, so held-out artworks are rendered "
            "with no marking and are indistinguishable from the rest. Anyone "
            "who browsed it must assume the holdout was spent. Use "
            "<code>--holdout exclude</code>."
        )
    return (
        f"<div class='holdout'>{body}<br>"
        f"<span style='color:#555'>list: <code>{source}</code> &middot; "
        f"{html.escape(view.describe())}</span></div>"
    )


def footer_html(extra: str = "") -> str:
    arms = ", ".join(
        f"<code>{html.escape(t)}</code>" for t in FINALIST_ARMS
    )
    return (
        "<footer>"
        f"finalist arms: {arms}. "
        "provenance: <code>research/v3/data/embeddings/manifest.json</code> "
        "(pinned revisions + weights sha256) &middot; retrieval scores: "
        "<code>research/v3/data/embeddings/bakeoff.json</code>. "
        f"k-means k={KMEANS_K}, seed={KMEANS_SEED}, deterministic. "
        "vectors are L2-normalized, so similarity is a dot product. "
        f"{extra}</footer>"
    )


def page(title: str, body: str) -> str:
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
        f"<body>{body}</body></html>\n"
    )


def render_clusters(gallery_dir: Path, arm_tag: str, clusters, stats,
                    view, policy: str) -> str:
    prefix = rel_to_repo(gallery_dir)
    spec = config.ARMS[arm_tag]
    totals = {"held": 0, "quarantined": 0}

    warn = []
    if stats["singleton_clusters"]:
        warn.append(f"{stats['singleton_clusters']} singleton cluster(s)")
    if stats["giant_clusters_over_4x_mean"]:
        warn.append(f"{stats['giant_clusters_over_4x_mean']} cluster(s) over 4x mean size")
    if not stats["converged"]:
        warn.append("did NOT converge")
    warn_html = (
        f"<tr><td class='warn'>flags</td><td class='warn'>{html.escape(', '.join(warn))}</td></tr>"
        if warn
        else "<tr><td>flags</td><td>none — no singletons, no giant cluster</td></tr>"
    )

    others = " &middot; ".join(
        f"<a href='{html.escape(t)}.html'>{html.escape(t)}</a>"
        for t in FINALIST_ARMS
        if t != arm_tag
    )

    parts = [
        f"<h1>cluster gallery — {html.escape(arm_tag)}</h1>",
        f"<p class='sub'>{html.escape(spec['model_id'])} &middot; "
        f"{stats['dim']}d &middot; {stats['pool']} files &middot; "
        f"other finalists: {others} &middot; <a href='neighbors.html'>neighbours panel</a></p>",
        "<div class='stats'><table>",
        f"<tr><td>k / seed</td><td>{stats['k']} / {stats['seed']}</td></tr>",
        # Deliberately no wall-clock time here: it is a property of the run, not
        # of the result, and putting it in the page makes two identical galleries
        # differ. It lives in summary.json instead.
        f"<tr><td>iterations</td><td>{stats['iterations']}"
        f"{' (converged)' if stats['converged'] else ' (HIT CEILING)'}</td></tr>",
        f"<tr><td>cluster size</td><td>min {stats['size_min']} &middot; "
        f"median {stats['size_median']:.0f} &middot; mean {stats['size_mean']:.0f} "
        f"&middot; max {stats['size_max']} "
        f"({stats['largest_share'] * 100:.1f}% of corpus)</td></tr>",
        f"<tr><td>small clusters</td><td>{stats['tiny_clusters_under_10']} under 10 members"
        f"</td></tr>",
        warn_html,
        "</table></div>",
        "<p class='legend'>each row is one cluster, largest first. "
        "<b>solid border = nearest to centroid</b> (what the cluster is about); "
        "<span style='color:#888'>dashed border = random member</span> "
        "(whether the rest of the cluster agrees). "
        "a row where solid and dashed look unrelated is a cluster that is not "
        "really a visual family.</p>",
    ]
    # The banner reports totals that are only known after the rows are built, so
    # its slot is reserved here and filled in once the loop is done.
    head_len = len(parts)

    for cluster in clusters:
        counts = " / ".join(
            f"{collection.split('_')[0]} {n}"
            for collection, n in cluster["collections"].items()
        )
        near, near_withheld = gate(view, policy, cluster["near"])
        rand, rand_withheld = gate(view, policy, cluster["random"])
        row_withheld = {
            key: near_withheld[key] + rand_withheld[key]
            for key in ("held", "quarantined")
        }
        for key in row_withheld:
            totals[key] += row_withheld[key]

        parts.append("<div class='row'>")
        parts.append(
            f"<div class='rowhead'><h2>cluster {cluster['id']:02d}</h2>"
            f"<span class='meta'>{cluster['size']} files &middot; {counts} &middot; "
            f"mean dist {cluster['mean_distance']:.3f}"
            f"{withheld_note(row_withheld) if policy == 'exclude' else ''}"
            "</span></div>"
        )
        width = min(100.0, 100.0 * cluster["size"] / max(1, clusters[0]["size"]))
        parts.append(f"<div class='bar' style='width:{width:.1f}%'></div>")
        parts.append("<div class='strip'>")
        for record in near:
            extra, badge = badge_for(view, policy, record["path"])
            cls = f" class='{extra.strip()}'" if extra else ""
            parts.append(
                f"<figure{cls}>{img_tag(prefix, record['path'])}"
                f"<figcaption><span class='tag'>near</span>{badge}<br>"
                f"{html.escape(short_name(record['path']))}</figcaption></figure>"
            )
        for record in rand:
            extra, badge = badge_for(view, policy, record["path"])
            parts.append(
                f"<figure class='rand{extra}'>{img_tag(prefix, record['path'])}"
                f"<figcaption><span class='tag r'>rand</span>{badge}<br>"
                f"{html.escape(short_name(record['path']))}</figcaption></figure>"
            )
        parts.append("</div></div>")

    parts.insert(head_len, holdout_banner(view, policy, totals))
    parts.append(footer_html())
    return page(f"clusters — {arm_tag}", "".join(parts))


def render_neighbours(gallery_dir: Path, queries: list[dict], per_arm: dict,
                      view, policy: str) -> str:
    prefix = rel_to_repo(gallery_dir)
    totals = {"held": 0, "quarantined": 0}
    links = " &middot; ".join(
        f"<a href='{html.escape(t)}.html'>{html.escape(t)} clusters</a>"
        for t in FINALIST_ARMS
    )
    parts = [
        "<h1>neighbours panel — three finalists side by side</h1>",
        f"<p class='sub'>top-{NEIGHBOURS_PER_QUERY} nearest neighbours by cosine, "
        f"other renditions of the same artwork excluded &middot; {links}</p>",
        "<p class='legend'>each block is one query cover (large, left) followed by "
        "one row per model. the number under each thumbnail is cosine similarity. "
        "<b>disagreement between rows is the interesting part.</b> other renditions "
        "of the query's own artwork are excluded; other renditions of a "
        "<i>neighbouring</i> artwork are collapsed into one thumbnail marked "
        "<span class='tag r'>xN</span>. note that a neighbour at ~0.98+ is often "
        "the same cover stored under a different content hash — a near-duplicate "
        "the filename-based ground truth does not know about.</p>",
    ]
    head_len = len(parts)

    for query in queries:
        path = query["path"]
        # `per_arm` holds only the arms this run computed, which --arms can
        # narrow; FINALIST_ARMS is the full display order. Indexing it directly
        # made `--arms dinov2-vitl14` -- an invocation this module's own docstring
        # advertises -- die with a KeyError.
        first = next(
            (
                per_arm[a][path]
                for a in FINALIST_ARMS
                if a in per_arm and per_arm[a].get(path)
            ),
            None,
        )
        if first is None:
            continue
        # A query cover is looked at directly and at 128 px, which is the most
        # expensive kind of look on this page. queries.json is a pinned list, so
        # a held-out query is an editing mistake, not a sampling accident.
        query_kind = view.classify(path)
        if query_kind != "open":
            totals[query_kind] += 1
            if policy == "exclude":
                print(
                    f"[gallery] SKIPPING query {path}: it is {query_kind}. "
                    "Fix queries.json rather than lowering the policy.",
                    flush=True,
                )
                continue
        record = first["query"]
        dims = f"{record.get('width')}x{record.get('height')}"
        parts.append("<div class='q'>")
        parts.append(
            "<div class='qhead'>"
            f"{img_tag(prefix, path)}"
            f"<div class='qwhy'><span class='name'>{html.escape(query['label'])}</span>"
            f"{html.escape(query['why'])}<br>"
            f"<span style='color:#888'>{html.escape(path)} &middot; {dims} &middot; "
            f"{html.escape(record.get('format', '?'))}</span></div></div>"
        )
        for arm_tag in FINALIST_ARMS:
            if arm_tag not in per_arm:
                parts.append(
                    f"<div class='model'><div class='mtag'>{html.escape(arm_tag)}"
                    "</div><div class='qwhy'>NOT RUN — this page was built with "
                    "--arms and does not include this finalist, so the "
                    "side-by-side comparison this panel exists for is "
                    "incomplete</div></div>"
                )
                continue
            entry = per_arm[arm_tag].get(path)
            parts.append("<div class='model'>")
            parts.append(f"<div class='mtag'>{html.escape(arm_tag)}</div>")
            if not entry:
                parts.append("<div class='qwhy'>not embedded by this arm</div></div>")
                continue
            shown, withheld = gate(view, policy, entry["neighbours"])
            for key in withheld:
                totals[key] += withheld[key]
            parts.append("<div class='strip'>")
            for neighbour in shown:
                extra, badge = badge_for(view, policy, neighbour["path"])
                cls = f" class='{extra.strip()}'" if extra else ""
                parts.append(
                    f"<figure{cls}>{img_tag(prefix, neighbour['path'])}"
                    f"<figcaption><span class='sim'>"
                    f"{neighbour['similarity']:.3f}</span>"
                    + (
                        f" <span class='tag r'>x{neighbour['renditions']}</span>"
                        if neighbour.get("renditions", 1) > 1
                        else ""
                    )
                    + badge
                    + f"<br>{html.escape(short_name(neighbour['path']))}"
                    "</figcaption></figure>"
                )
            if policy == "exclude" and (withheld["held"] or withheld["quarantined"]):
                parts.append(
                    f"<div class='qwhy'>{withheld_note(withheld)[10:]}"
                    " — the rank they held is not shown</div>"
                )
            parts.append("</div></div>")
        parts.append("</div>")

    parts.insert(head_len, holdout_banner(view, policy, totals))
    parts.append(footer_html("queries are a pinned list, not sampled per run."))
    return page("neighbours — finalists", "".join(parts))


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument(
        "--arms", nargs="+", default=list(FINALIST_ARMS), choices=list(config.ARMS)
    )
    parser.add_argument("--clusters-only", action="store_true")
    parser.add_argument("--neighbors-only", action="store_true")
    parser.add_argument(
        "--queries",
        default=None,
        help="JSON file of query covers; defaults to queries.json next to this script",
    )
    parser.add_argument(
        "--holdout",
        choices=list(holdout_filter.POLICIES),
        default=holdout_filter.DEFAULT_POLICY,
        help="what to do with held-out and quarantined artworks at render time. "
        "exclude (default) withholds the thumbnail; mark shows it badged and "
        "SPENDS the artwork; ignore reproduces the pre-2026-08-03 pages",
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="build pages from an incomplete embedding pool (not comparable "
        "between arms; recorded in summary.json either way)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    gallery_dir = out_dir / GALLERY_DIR_NAME
    gallery_dir.mkdir(parents=True, exist_ok=True)

    view = holdout_filter.load_holdout()
    print(f"[gallery] {view.describe()}; policy={args.holdout}", flush=True)
    if args.holdout != "exclude":
        print(
            f"[gallery] WARNING --holdout {args.holdout}: held-out artworks will "
            "be rendered. Anyone who browses these pages spends them — record it "
            "in research/v3/data/holdout/HOLDOUT.md and remove them from the "
            "end-of-campaign claim.",
            flush=True,
        )

    summary = {
        "written_at": common.utc_now_iso(),
        "k": KMEANS_K,
        "seed": KMEANS_SEED,
        "holdout": {
            "policy": args.holdout,
            "list": "research/v3/data/holdout/holdout.json",
            "version": view.version,
            "artworks": len(view.artwork_ids),
            "quarantined_non_candidates": len(view.quarantined_ids),
            "note": "the pool, k-means and neighbour search are NOT filtered — "
            "only the rendering step is. `exclude` means no thumbnail on these "
            "pages spends a held-out artwork.",
        },
    }

    if not args.neighbors_only:
        summary["clusters"] = {}
        for arm_tag in args.arms:
            print(f"[gallery] clustering {arm_tag} ...", flush=True)
            clusters, stats = cluster_arm(out_dir, arm_tag, args.allow_partial)
            (gallery_dir / f"{arm_tag}.html").write_text(
                render_clusters(gallery_dir, arm_tag, clusters, stats,
                                view, args.holdout),
                encoding="utf-8",
            )
            summary["clusters"][arm_tag] = stats
            print(
                f"[gallery] {arm_tag}: {stats['iterations']} iters, sizes "
                f"{stats['size_min']}-{stats['size_max']} "
                f"(median {stats['size_median']:.0f}), "
                f"{stats['singleton_clusters']} singleton, "
                f"{stats['tiny_clusters_under_10']} under 10 -> "
                f"{gallery_dir / (arm_tag + '.html')}",
                flush=True,
            )

    if not args.clusters_only:
        queries_path = Path(args.queries) if args.queries else Path(__file__).with_name(
            "queries.json"
        )
        queries = json.loads(queries_path.read_text(encoding="utf-8"))["queries"]
        truth, _ = eval_pairs.build_ground_truth()
        per_arm = {}
        for arm_tag in args.arms:
            print(f"[gallery] neighbours for {arm_tag} ...", flush=True)
            per_arm[arm_tag] = neighbours_for(
                out_dir, arm_tag, [q["path"] for q in queries], truth,
                args.allow_partial,
            )
        (gallery_dir / "neighbors.html").write_text(
            render_neighbours(gallery_dir, queries, per_arm, view, args.holdout),
            encoding="utf-8",
        )
        held_queries = [
            q["path"] for q in queries if view.classify(q["path"]) != "open"
        ]
        summary["neighbours"] = {
            "queries": len(queries),
            "per_query": NEIGHBOURS_PER_QUERY,
            "source": str(queries_path.name),
            "queries_held_out_or_quarantined": held_queries,
        }
        print(f"[gallery] wrote {gallery_dir / 'neighbors.html'}", flush=True)

    # What the pages on disk actually expose, measured from their own source.
    # This is the disclosure HOLDOUT.md asks for, produced by the build rather
    # than remembered afterwards.
    pages = sorted(gallery_dir.glob("*.html"))
    if pages:
        summary["holdout"]["exposure_audit"] = holdout_filter.audit_pages(pages, view)
        union = summary["holdout"]["exposure_audit"]["union"]
        print(
            f"[gallery] exposure audit: {union['music_artworks_ids_shown']} "
            f"music-artworks ids rendered across {len(pages)} page(s), of which "
            f"{union['held_out_artworks_shown']} held out "
            f"({union['held_out_pct_of_holdout']}% of the holdout) and "
            f"{union['quarantined_artworks_shown']} quarantined",
            flush=True,
        )
        if union["held_out_artworks_shown"]:
            print(
                "[gallery] ^ those artworks are SPENT. Record them in "
                "research/v3/data/holdout/HOLDOUT.md.",
                flush=True,
            )

    (gallery_dir / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(f"[gallery] wrote {gallery_dir / 'summary.json'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

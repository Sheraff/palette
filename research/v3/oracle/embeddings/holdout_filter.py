"""Holdout awareness for anything in this directory that shows a human an image.

Why this exists (adversarial review 2026-08-03, MAJOR-1). The cluster galleries
and the neighbours panel render album art as visible thumbnails, and `gallery.py`
had no idea the holdout existed. 117 of the 413 held-out artworks were rendered
in pages the reviewer browsed on 2026-08-02, plus 2 of the 12 quarantined
artworks, and nothing recorded it. `data/holdout/HOLDOUT.md` is categorical:
"Looking at a held-out artwork spends it. If one is looked at, say so and remove
it from the end-of-campaign claim -- do not quietly keep it."

This module is the machinery that makes "say so" automatic:

  * `load_holdout()` -- the frozen list, by artwork id and by file path, plus the
    non-candidate quarantine, which HOLDOUT.md says to treat as held out too.
  * `HoldoutView.classify(path)` -- "held", "quarantined" or "open" for one file.
  * `audit_pages()` -- what a pile of already-built HTML actually exposed,
    counted from the page source rather than from the code that wrote it.

Deliberately NOT a filter on the embedding pool. The holdout bars LOOKING at an
artwork, not computing over it: clusters, centroids and the near-dup graph are
machine-only and must stay whole, or every count in them becomes incomparable
with the corpus. Only the rendering step is gated.

Usage:
  .venv/bin/python holdout_filter.py --audit
  .venv/bin/python holdout_filter.py --audit --json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import config
import common

HOLDOUT_PATH = (
    config.REPO_ROOT / "research" / "v3" / "data" / "holdout" / "holdout.json"
)

# [MEASURED] A music-artworks artwork id is the 32-hex filename stem
# (CONVENTIONS.md; `eval_pairs.MUSIC_NAME_RE`). This pattern finds them inside
# built HTML, where the only thing left of a record is its `src` path.
MUSIC_ID_IN_HTML_RE = re.compile(r"music-artworks/(?:[0-9a-f]/){3}([0-9a-f]{32})")

# [REVIEWED] What to do with a held-out artwork at render time.
#   exclude -- do not emit the thumbnail at all; say how many were withheld.
#   mark    -- emit it with a visible badge. For a deliberate end-of-campaign
#              look, which must be recorded as spending those artworks.
#   ignore  -- pre-2026-08-03 behaviour. Kept only so an old page can be
#              reproduced byte for byte; it prints a warning and stamps the page.
POLICIES = ("exclude", "mark", "ignore")
DEFAULT_POLICY = "exclude"


def artwork_id_of(path: str) -> str | None:
    """The 32-hex music-artworks id for a path, or None for anything else.

    The sharded corpus has no holdout by decision (fresh shards are effectively
    unlimited), so a sharded path is always open.
    """
    match = MUSIC_ID_IN_HTML_RE.search(path)
    return match.group(1) if match else None


class HoldoutView:
    """The frozen list, in the shapes a renderer needs."""

    def __init__(self, artwork_ids: set[str], file_paths: set[str],
                 quarantined_ids: set[str], version: str | None,
                 source: Path) -> None:
        self.artwork_ids = artwork_ids
        self.file_paths = file_paths
        self.quarantined_ids = quarantined_ids
        self.version = version
        self.source = source

    def classify(self, path: str) -> str:
        """"held", "quarantined" or "open" for one repo-relative file path."""
        if path in self.file_paths:
            return "held"
        artwork = artwork_id_of(path)
        if artwork is None:
            return "open"
        if artwork in self.artwork_ids:
            return "held"
        if artwork in self.quarantined_ids:
            return "quarantined"
        return "open"

    def is_showable(self, path: str, policy: str) -> bool:
        return policy != "exclude" or self.classify(path) == "open"

    def describe(self) -> str:
        return (
            f"holdout {self.version or '?'} — {len(self.artwork_ids)} artworks, "
            f"{len(self.file_paths)} files, "
            f"{len(self.quarantined_ids)} quarantined non-candidates"
        )


def load_holdout(path: Path | None = None) -> HoldoutView:
    doc = json.loads((path or HOLDOUT_PATH).read_text(encoding="utf-8"))
    header = doc.get("header", {})
    quarantine = (
        header.get("nearDuplicateCensus", {})
        .get("nonCandidateQuarantine", {})
        .get("artworkIds", [])
    )
    return HoldoutView(
        artwork_ids={entry["id"] for entry in doc["artworks"]},
        file_paths={
            file_entry["path"]
            for entry in doc["artworks"]
            for file_entry in entry["files"]
        },
        quarantined_ids=set(quarantine),
        # `scriptVersion` is what freeze-holdout.ts stamps ("2.0.0"); it is the
        # holdout's version, not the script's release number.
        version=header.get("scriptVersion") or header.get("version"),
        source=path or HOLDOUT_PATH,
    )


def audit_pages(pages: list[Path], view: HoldoutView | None = None) -> dict:
    """Count held-out artworks actually rendered in already-built HTML.

    Counted from the page source, not from the code that produced it, so it is
    valid for pages written before this module existed.
    """
    view = view or load_holdout()
    per_page = {}
    union_shown: set[str] = set()
    union_held: set[str] = set()
    union_quarantined: set[str] = set()

    for page_path in sorted(pages):
        text = page_path.read_text(encoding="utf-8", errors="replace")
        shown = set(MUSIC_ID_IN_HTML_RE.findall(text))
        held = shown & view.artwork_ids
        quarantined = shown & view.quarantined_ids
        union_shown |= shown
        union_held |= held
        union_quarantined |= quarantined
        per_page[page_path.name] = {
            "music_artworks_ids_shown": len(shown),
            "of_which_held_out": len(held),
            "of_which_quarantined": len(quarantined),
        }

    return {
        "holdout_version": view.version,
        "holdout_artworks": len(view.artwork_ids),
        "pages": per_page,
        "union": {
            "music_artworks_ids_shown": len(union_shown),
            "held_out_artworks_shown": len(union_held),
            "held_out_pct_of_holdout": round(
                100.0 * len(union_held) / max(1, len(view.artwork_ids)), 1
            ),
            "quarantined_artworks_shown": len(union_quarantined),
        },
        "held_out_artwork_ids_shown": sorted(union_held),
        "quarantined_artwork_ids_shown": sorted(union_quarantined),
    }


def render_disclosure(result: dict, view: HoldoutView, queries_path: Path) -> str:
    """The disclosure HOLDOUT.md asks for, in the embeddings workstream's own
    directory.

    It is NOT written into `data/holdout/HOLDOUT.md`, which is generated by
    `src/holdout/freeze-holdout.ts` and byte-compared by its `--verify` mode: an
    appended paragraph there would fail that gate and be erased by the next
    re-run. The permanent home for this text is the generator, which belongs to
    the holdout workstream; this file is the disclosure standing on its own in
    the meantime, and it names the exposure the embeddings workstream caused.
    """
    union = result["union"]
    queries = json.loads(queries_path.read_text(encoding="utf-8"))["queries"]
    held_queries = [q for q in queries if view.classify(q["path"]) != "open"]

    lines = [
        "# Holdout exposure in the embedding galleries",
        "",
        "**Measured 2026-08-03** by `oracle/embeddings/holdout_filter.py --audit`, "
        "from the page source of the HTML on disk rather than from the code that "
        "wrote it. Raised by the phase-0 adversarial review (MAJOR-1).",
        "",
        "`HOLDOUT.md` says: *\"Looking at a held-out artwork spends it. If one is "
        "looked at, say so and remove it from the end-of-campaign claim — do not "
        "quietly keep it.\"* This file is the saying-so.",
        "",
        "## What was exposed",
        "",
        "The gallery pages under `data/embeddings/gallery/` render album art as "
        f"visible thumbnails. Across them, **{union['held_out_artworks_shown']} of "
        f"the {result['holdout_artworks']} held-out artworks "
        f"({union['held_out_pct_of_holdout']}%)** were rendered, plus "
        f"**{union['quarantined_artworks_shown']}** of the 12 quarantined "
        "non-candidates.",
        "",
        "| page | music-artworks ids shown | of which held out | of which quarantined |",
        "|---|---|---|---|",
    ]
    for name, row in result["pages"].items():
        lines.append(
            f"| `{name}` | {row['music_artworks_ids_shown']} | "
            f"{row['of_which_held_out']} | {row['of_which_quarantined']} |"
        )
    lines += [
        f"| **union** | **{union['music_artworks_ids_shown']}** | "
        f"**{union['held_out_artworks_shown']}** | "
        f"**{union['quarantined_artworks_shown']}** |",
        "",
        "## The part that is worse than a thumbnail",
        "",
        f"{len(held_queries)} of the {len(queries)} pinned query covers in "
        "`oracle/embeddings/queries.json` are held-out artworks. A query cover is "
        "rendered at 128 px, not 96, and it is the artwork the reviewer was asked "
        "to look **at** rather than past:",
        "",
    ]
    for query in held_queries:
        lines.append(
            f"- `{query['path']}` — {query.get('label', '')} "
            f"({view.classify(query['path'])})"
        )
    lines += [
        "",
        "Three of the four observations recorded in `GALLERY_NOTES.md` name these "
        "covers by their short names. Those artworks were not merely displayed; "
        "they were reasoned about in writing, and that writing is cited as "
        "provenance for the canonical-model decision. They are the most "
        "thoroughly spent artworks in the holdout.",
        "",
        "## What is and is not claimed",
        "",
        "- The exposure is **cluster-granularity thumbnails**, not palette "
        "inspection. No palette of any held-out artwork was computed or shown.",
        "- Holdout **2.0.0 did not exist** when the pages were built: the gallery "
        "was written 2026-08-02T20:11:42Z, the freeze landed at 22:47 the same "
        "day. Holdout 1.0.0 did exist, and the freeze rule has no \"only if you "
        "looked hard\" clause.",
        "- The pages are still on disk and `serve_gallery.py` re-exposes them on "
        "demand. It now prints this count before opening a browser.",
        "",
        "## What changed so it cannot recur",
        "",
        "- `gallery.py` gained `--holdout {exclude,mark,ignore}`, default "
        "**exclude**. The render step is gated; the embedding pool, k-means and "
        "neighbour search are deliberately NOT filtered, because the holdout bars "
        "looking at an artwork, not computing over it.",
        "- Every page carries its own disclosure banner, whatever the policy.",
        "- `gallery.py` writes an exposure audit into `gallery/summary.json` on "
        "every build, so the next set of pages states what it cost when it is "
        "built rather than a day later.",
        "- A rebuild under the default policy renders **zero** held-out artworks. "
        "Verified 2026-08-03 against a scratch output directory.",
        "",
        "## What the reviewer has to decide",
        "",
        "Not a re-roll — nothing here recommends one. Either:",
        "",
        f"1. rule that a cluster-thumbnail view does not spend an artwork (and "
        f"that the {len(held_queries)} query covers, which are a stronger look, "
        "do), or",
        f"2. remove the {union['held_out_artworks_shown']} artworks listed in "
        "`holdout-exposure.json` next to this file from the end-of-campaign "
        "claim, dropping its effective size accordingly.",
        "",
        "Either way it needs a decision record and a ledger row; neither exists "
        "yet. Until then the honest reading of any end-of-campaign number is that "
        f"{union['held_out_pct_of_holdout']}% of the holdout has been seen.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", action="store_true",
                        help="audit the built gallery pages")
    parser.add_argument("--gallery-dir",
                        default=str(config.DATA_DIR / "gallery"))
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--write-disclosure", action="store_true",
        help="write HOLDOUT_EXPOSURE.md and holdout-exposure.json into "
        "data/embeddings/",
    )
    args = parser.parse_args()

    view = load_holdout()
    if not args.audit:
        print(view.describe())
        return 0

    gallery_dir = Path(args.gallery_dir).resolve()
    pages = sorted(gallery_dir.glob("*.html"))
    if not pages:
        print(f"[holdout] no pages under {gallery_dir}")
        return 1
    result = audit_pages(pages, view)

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    if args.write_disclosure:
        queries_path = Path(__file__).with_name("queries.json")
        (config.DATA_DIR / "holdout-exposure.json").write_text(
            json.dumps(
                {
                    "what": "held-out and quarantined artworks rendered in the "
                    "embedding gallery pages, counted from the page source",
                    "measured_at": common.utc_now_iso(),
                    "generated_by": "research/v3/oracle/embeddings/"
                    "holdout_filter.py --audit --write-disclosure",
                    "holdout_file": "research/v3/data/holdout/holdout.json",
                    "query_covers_held_out": [
                        q["path"]
                        for q in json.loads(
                            queries_path.read_text(encoding="utf-8")
                        )["queries"]
                        if view.classify(q["path"]) != "open"
                    ],
                    **result,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        (config.DATA_DIR / "HOLDOUT_EXPOSURE.md").write_text(
            render_disclosure(result, view, queries_path), encoding="utf-8"
        )
        print(
            f"[holdout] wrote {config.DATA_DIR / 'HOLDOUT_EXPOSURE.md'} and "
            f"{config.DATA_DIR / 'holdout-exposure.json'}"
        )

    print(f"[holdout] {view.describe()}")
    for name, row in result["pages"].items():
        print(
            f"  {name:24s} {row['music_artworks_ids_shown']:5d} ids shown, "
            f"{row['of_which_held_out']:4d} held out, "
            f"{row['of_which_quarantined']:3d} quarantined"
        )
    union = result["union"]
    print(
        f"  {'UNION':24s} {union['music_artworks_ids_shown']:5d} ids shown, "
        f"{union['held_out_artworks_shown']:4d} held out "
        f"({union['held_out_pct_of_holdout']}% of the holdout), "
        f"{union['quarantined_artworks_shown']:3d} quarantined"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

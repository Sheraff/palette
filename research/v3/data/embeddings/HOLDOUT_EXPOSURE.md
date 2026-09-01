# Holdout exposure in the embedding galleries

**Measured 2026-08-03** by `oracle/embeddings/holdout_filter.py --audit`, from the page source of the HTML on disk rather than from the code that wrote it. Raised by the phase-0 adversarial review (MAJOR-1).

`HOLDOUT.md` says: *"Looking at a held-out artwork spends it. If one is looked at, say so and remove it from the end-of-campaign claim — do not quietly keep it."* This file is the saying-so.

## What was exposed

The gallery pages under `data/embeddings/gallery/` render album art as visible thumbnails. Across them, **117 of the 413 held-out artworks (28.3%)** were rendered, plus **2** of the 12 quarantined non-candidates.

| page | music-artworks ids shown | of which held out | of which quarantined |
|---|---|---|---|
| `dinov2-vitl14.html` | 345 | 41 | 0 |
| `dinov3-vitl16.html` | 349 | 44 | 1 |
| `neighbors.html` | 83 | 19 | 0 |
| `pe-core-l14.html` | 330 | 36 | 1 |
| **union** | **964** | **117** | **2** |

## The part that is worse than a thumbnail

3 of the 12 pinned query covers in `oracle/embeddings/queries.json` are held-out artworks. A query cover is rendered at 128 px, not 96, and it is the artwork the reviewer was asked to look **at** rather than past:

- `music-artworks/8/7/e/87e9beeb1ba665f10b446ae57c79b672.jpg` — The Longest Johns — Between Wind and Water  (v2-3 'johns') (held)
- `music-artworks/6/2/7/62730e508630a4192921b87e0530ccd6.jpg` — v2-3 'krafty' (held)
- `music-artworks/d/7/a/d7a06753cf29eeb6ffecd71ed7c56a7a.jpg` — v2-3 'muse' (held)

Three of the four observations recorded in `GALLERY_NOTES.md` name these covers by their short names. Those artworks were not merely displayed; they were reasoned about in writing, and that writing is cited as provenance for the canonical-model decision. They are the most thoroughly spent artworks in the holdout.

## What is and is not claimed

- The exposure is **cluster-granularity thumbnails**, not palette inspection. No palette of any held-out artwork was computed or shown.
- Holdout **2.0.0 did not exist** when the pages were built: the gallery was written 2026-08-02T20:11:42Z, the freeze landed at 22:47 the same day. Holdout 1.0.0 did exist, and the freeze rule has no "only if you looked hard" clause.
- The pages are still on disk and `serve_gallery.py` re-exposes them on demand. It now prints this count before opening a browser.

## What changed so it cannot recur

- `gallery.py` gained `--holdout {exclude,mark,ignore}`, default **exclude**. The render step is gated; the embedding pool, k-means and neighbour search are deliberately NOT filtered, because the holdout bars looking at an artwork, not computing over it.
- Every page carries its own disclosure banner, whatever the policy.
- `gallery.py` writes an exposure audit into `gallery/summary.json` on every build, so the next set of pages states what it cost when it is built rather than a day later.
- A rebuild under the default policy renders **zero** held-out artworks. Verified 2026-08-03 against a scratch output directory.

## What the reviewer has to decide

Not a re-roll — nothing here recommends one. Either:

1. rule that a cluster-thumbnail view does not spend an artwork (and that the 3 query covers, which are a stronger look, do), or
2. remove the 117 artworks listed in `holdout-exposure.json` next to this file from the end-of-campaign claim, dropping its effective size accordingly.

Either way it needs a decision record and a ledger row; neither exists yet. Until then the honest reading of any end-of-campaign number is that 28.3% of the holdout has been seen.

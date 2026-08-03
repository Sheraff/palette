# The coverage set

**File:** `research/v3/data/coverage-set/coverage-set-1.json` — built 2026-08-03 by `research/v3/src/coverage-set/build-coverage-set.ts`, schema v1.

## What this is

A sample of **200 artworks** drawn to cover the shape of the corpus, plus **20 extra artworks** whose contents a human has already confirmed by eye. It is the standard bench for tuning v3’s instruments — VLM prompts, SAM prompts, score thresholds — so that every instrument is tuned and compared on the same images.

The corpus is two collections that have nothing to do with each other: the `00..14/` sharded set (album art, capped at 640 px) and `music-artworks/` (mixed content, resolution up to 3,600 px). The set draws from both, at the level of the **artwork** rather than the file, because many artworks exist as several renditions of the same picture and counting them separately would inflate every number computed over the set.

## What it is for, and what it is not

**For:** picking a prompt, a wording, a threshold, or a cut-off, and seeing what it does across the whole range of covers instead of across whichever covers happened to be lying around. It is a *tuning* bench.

**Not for:** final accuracy claims. The frozen holdout (`research/v3/data/holdout/`) exists for that. Not one held-out artwork is in here, and — checked against the near-duplicate graph, not just against the list of ids — neither is any near-copy of one.

**What you can measure on it today, with no labels at all:** stability (does the instrument return the same thing on two renditions of one artwork), coverage (does it return anything at all, and on what fraction), cost (seconds and tokens per cover), self-consistency (does a reworded prompt agree with itself), and failure shape (which clusters produce empty or degenerate output). None of those need a right answer to be informative, and all of them will catch a badly-set threshold.

**What accumulates over time:** reviewer labels. The set is sized so a reviewer can be asked one question at a time about a subset of it — a by-question round, never one long sitting — and each round’s answers stay attached to these artworks. Those accumulated labels become the stage-4 validation sample. Nothing here is a validated label yet; the enrichment slices are the only artworks in the file whose content is established, and they are established for one named thing each.

## How the core was chosen

1. **Universe.** 6906 sharded artworks (from 7550 files — the corpus holds many artworks at both 300 px and 640 px) plus 2757 music-artworks album-artwork candidates (from 4088 artworks; 991 dropped as non-square, 16 as thumbnail-only, 324 for real transparency). Removing the 413 held-out artworks, then the 18 artworks that are enrichment covers or near-duplicates of one, leaves **9232 artworks** (6888 sharded, 2344 music-artworks).
2. **One vector per artwork.** Each artwork is represented by its largest rendition, measured from the image header, never from the filename. Its dinov2-vitl14 embedding is that rendition’s vector.
3. **36 clusters.** Seeded k-means over the universe (converged in 44 iterations). k=36 is inherited from the cluster gallery the reviewer browsed and found legible; it is a granularity choice, not a claim that the corpus has 36 kinds of cover.
4. **Quotas.** Every cluster gets at least 3; the remaining slots are shared out in proportion to cluster size, capped by how many distinct near-duplicate components the cluster actually holds. The floor deliberately over-weights the small clusters — a cluster holding 0.4% of the corpus still gets 3 artworks, because a bench that skips the rare kinds of cover is exactly the failure this set exists to fix.
5. **Inside a cluster: the middle *and* the edge.** The artwork closest to the cluster centre is taken first (what this cluster typically looks like), then the artwork furthest from it (where the cluster stops looking like itself), and only then random fills. Coverage that only samples modes is not coverage.
6. **Resolution is forced to match the corpus.** Fills are steered so the core’s resolution mix tracks the universe’s within 3 percentage points. Small thumbnails are represented — some questions are physically unanswerable at 300 px and the bench has to contain that case — but they cannot dominate.
7. **No two near-duplicates.** The near-duplicate census (three embedding models, cosine ≥ 0.95) groups near-identical images into components; at most one artwork per component is ever selected. The census is a documented *lower bound* on the real duplicate structure, so this rule removes the duplicates we can see, not all of them.

Everything random comes from one seeded stream (seed `0xc0efface`). Re-running the build reproduces the file byte for byte; it reads no clock.

## Resolution tiers

| tier | universe | universe % | core target | core | core % | deviation |
|---|---|---|---|---|---|---|
| <=400 | 2442 | 26.45% | 53 | 53 | 26.5% | +0.05 pp |
| 401-640 | 5683 | 61.56% | 123 | 123 | 61.5% | -0.06 pp |
| 641-1024 | 951 | 10.3% | 21 | 21 | 10.5% | +0.2 pp |
| >1024 | 156 | 1.69% | 3 | 3 | 1.5% | -0.19 pp |

Collection mix: the universe is 74.61% sharded; the core is 74% sharded (148 sharded, 52 music-artworks). That mix is not forced — it falls out of the clusters.

## The enrichment slices

20 artworks, each tagged with why it is here. **They are not part of the core and never enter a rate, a distribution, or an agreement number** — filter to `role === "core"` for anything of that kind. They exist so that an instrument aimed at a specific thing can be tuned against covers where the right answer is already known, independently of any model.

| slice | artworks | what it is for |
|---|---|---|
| parental-advisory | 6 | every cover in the repo confirmed by eye to carry a PA mark, including one where only the 300 px rendition exists — the mark at the resolution floor |
| cjk-text | 4 | Chinese and Japanese text, including one cover mixing Japanese and Latin |
| nonlatin-text | 3 | Korean, Thai and Malayalam — scripts a Latin-trained text prompt tends to miss |
| vehicle | 5 | cars, photoreal and illustrated: a concrete object noun for object prompts |
| barcode | 2 | applied overlays (promo sticker, shipping label) that are on the cover but not part of the artwork |
| confirmed-negative | 1 | a cover confirmed to carry no mark, no logo, no sticker and no display text: any detection here is a false positive by construction |

2 of them (`images/greenday.jpg`, `images/slim.jpg`) live in the repo’s legacy `images/` directory, which is in neither embedded collection. They are carried anyway, flagged `inEmbeddingUniverse: false` with no cluster, because only five confirmed parental-advisory covers exist here and dropping two would halve the evidence behind any PA instrument.

Enrichment rows point at the **exact file a human opened**, not at the artwork’s largest rendition — the confirmation was made on that file. Each row carries `enrichmentSource`, naming the repo file that establishes its content: `research/v3/oracle/sam/review_round_2.py` (the covers opened by eye during the SAM vocabulary probe) and `research/v3/data/sam/probe-4-scripts-objects.jsonl` (whose `image_kind` / `image_note` fields were filled in by opening each file).

## What the eval-142 comparison found

The inherited bench, eval-142 (`research/v3/data/oracle-premise/eval-set.json`), is 142 entries. Placing it against this corpus:

- **25 of the 142 are not in the embedded corpus at all** (17.61%). They are legacy `images/` covers, hand-picked in the v2 era. They cannot be placed in the corpus’s structure, cannot be checked for near-duplicate leakage against the holdout, and cannot be said to represent anything about the corpus, because they are not drawn from it.
- Of the 117 that *are* locatable: 3 sit in the core, 12 were pulled out as enrichment covers, and 102 are in the universe but were not selected. (The enrichment overlap is not a coincidence — the SAM probes that established those covers’ contents drew their images from the eval set, which is why so much of what is *known* about any cover in this repo is known about an eval-142 cover.)
- **22 of 117** (18.8%) are in the core or within its top-5 neighbourhood. Median cosine from an eval-142 artwork to its nearest core member: 0.377 (range 0.1123–0.6941). This particular number is *not* the interesting one and is reported so nobody has to ask: the core is 2.17% of the universe, so some proximity is arithmetic rather than evidence.
- **4 of the 36 clusters contain no eval-142 artwork at all** — clusters 0, 22, 30, 31, holding 5.36% of the universe between them. On those kinds of cover the inherited bench could say nothing, because it contained nothing from there.
- **The mix is wrong, not just the coverage.** Distance between a sample’s cluster mix and the corpus’s (total variation, 0 = identical, 1 = disjoint): the core sits at **0.0851**, eval-142 at **0.2273** — 2.67× further out. That is the measurement this whole comparison exists to produce. The core’s own distance is not zero and is not meant to be: the per-cluster floor of 3 intentionally over-samples the small clusters, and that accounts for essentially all of it.

Resolution mix, the other axis that has to match:

| tier | universe % | core % | eval-142 % |
|---|---|---|---|
| <=400 | 26.45% | 26.5% | 31.69% |
| 401-640 | 61.56% | 61.5% | 60.56% |
| 641-1024 | 10.3% | 10.5% | 4.93% |
| >1024 | 1.69% | 1.5% | 2.82% |

The verdict this supports: eval-142 was never a sample of this corpus. It is a set of covers that accumulated during v2 development for reasons that had nothing to do with covering the corpus, a sixth of it is not in the corpus at all, and its cluster mix sits several times further from the corpus than the core does. It remains perfectly good evidence about the *artworks in it* — the gradient labels behind it are real reviewer work — and nothing here retracts that. What it cannot support is any sentence of the form "on the corpus, the instrument does X".

| cluster | universe | universe % | core | eval-142 | eval-142 % |
|---|---|---|---|---|---|
| 0 | 256 | 2.77% | 6 | 0 | 0% |
| 1 | 162 | 1.75% | 5 | 2 | 1.71% |
| 2 | 298 | 3.23% | 6 | 5 | 4.27% |
| 3 | 36 | 0.39% | 3 | 1 | 0.85% |
| 4 | 139 | 1.51% | 4 | 3 | 2.56% |
| 5 | 230 | 2.49% | 5 | 2 | 1.71% |
| 6 | 317 | 3.43% | 6 | 8 | 6.84% |
| 7 | 247 | 2.68% | 5 | 4 | 3.42% |
| 8 | 342 | 3.7% | 6 | 4 | 3.42% |
| 9 | 300 | 3.25% | 6 | 4 | 3.42% |
| 10 | 263 | 2.85% | 6 | 1 | 0.85% |
| 11 | 113 | 1.22% | 4 | 3 | 2.56% |
| 12 | 249 | 2.7% | 6 | 1 | 0.85% |
| 13 | 170 | 1.84% | 5 | 3 | 2.56% |
| 14 | 357 | 3.87% | 7 | 3 | 2.56% |
| 15 | 352 | 3.81% | 7 | 8 | 6.84% |
| 16 | 389 | 4.21% | 7 | 2 | 1.71% |
| 17 | 238 | 2.58% | 5 | 2 | 1.71% |
| 18 | 477 | 5.17% | 8 | 7 | 5.98% |
| 19 | 231 | 2.5% | 5 | 6 | 5.13% |
| 20 | 296 | 3.21% | 6 | 3 | 2.56% |
| 21 | 336 | 3.64% | 6 | 3 | 2.56% |
| 22 | 54 | 0.58% | 4 | 0 | 0% |
| 23 | 293 | 3.17% | 6 | 4 | 3.42% |
| 24 | 305 | 3.3% | 6 | 1 | 0.85% |
| 25 | 247 | 2.68% | 5 | 4 | 3.42% |
| 26 | 289 | 3.13% | 6 | 4 | 3.42% |
| 27 | 139 | 1.51% | 4 | 4 | 3.42% |
| 28 | 225 | 2.44% | 5 | 3 | 2.56% |
| 29 | 278 | 3.01% | 6 | 3 | 2.56% |
| 30 | 73 | 0.79% | 4 | 0 | 0% |
| 31 | 112 | 1.21% | 4 | 0 | 0% |
| 32 | 225 | 2.44% | 5 | 5 | 4.27% |
| 33 | 246 | 2.66% | 5 | 1 | 0.85% |
| 34 | 595 | 6.44% | 9 | 6 | 5.13% |
| 35 | 353 | 3.82% | 7 | 7 | 5.98% |

## Checks that ran

| check | result | detail |
|---|---|---|
| core size | pass | 200 artworks, target 200 |
| no holdout artwork in the core | pass | 0 held-out ids found |
| no quarantined artwork in the core | pass | 0 quarantined ids found |
| no selected artwork shares a near-dup component with a held-out or quarantined one | pass | 0 component collisions |
| never two members of one near-duplicate component | pass | 0 components appear twice |
| every cluster is represented in the core | pass | clusters with no core member: [] |
| every cluster has an exemplar and a fringe pick | pass | 36 exemplars, 36 fringes, k=36 |
| resolution-tier spread within tolerance | pass | worst tier 641-1024 deviates 0.2 pp (tolerance 3 pp) |
| core and enrichment are disjoint | pass | 0 artworks in both |

The holdout check is deliberately stronger than "no held-out id appears here". It asserts that no selected artwork shares a near-duplicate component with a held-out or quarantined one — the failure mode that forced the holdout to be redrawn in the first place (`d-2026-08-02-holdout-v2-redraw`): version 1 selected at artwork-id level, and 224 of its 414 artworks turned out to have a near-identical twin on the other side of the line.

## How to use it

```js
const set = JSON.parse(await readFile('research/v3/data/coverage-set/coverage-set-1.json', 'utf8'))

const core = set.artworks.filter((a) => a.role === 'core')            // the representative sample
const pa = set.artworks.filter((a) => a.enrichmentSlices?.includes('parental-advisory'))

// Every path is repo-root-relative; every row carries the sha256 of the exact bytes.
```

Report anything measured on this set **stratified by `tier`**. 26.5% of the core is at or below 400 px, some questions are physically unanswerable at that size, and a single pooled number over a mixed-resolution sample is not interpretable (pipeline §7.1).

## Known limits

- **The near-duplicate census is a lower bound.** It undercounts by 46.3% against the duplicates filename ground truth already knows about. Two artworks in the core may still be near-copies at a similarity below 0.95.
- **k=36 is inherited, not calibrated.** It was chosen because a reviewer browsed a gallery at that granularity and could read it. No clustering-quality criterion was optimised.
- **The core has no labels.** 200 artworks and zero ground truth about them, by design; labels accrue through reviewer rounds. Do not mistake the enrichment slices’ confirmed content for a labelled core.
- **Sharded artworks are not filtered for content.** The sharded collection is treated as album art wholesale, as the pipeline survey does. The music-artworks side *is* filtered, by aspect ratio, and that filter is the only content discriminator either collection has.
- **The holdout only covers `music-artworks/`.** No part of the sharded collection is held out, so a final-accuracy claim on sharded artworks has no clean instrument here at all — that is a gap in the holdout, not in this set, but it bites anyone who assumes "not in the coverage set" means "safe to report on".


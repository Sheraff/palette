# Adversarial review — the corpus map (embeddings, near-dup census, holdout, coverage set)

**Reviewed 2026-08-03.** Scope: `research/v3/oracle/embeddings/`, `research/v3/src/coverage-set/`,
`research/v3/data/embeddings/`, `research/v3/data/coverage-set/`, `research/v3/data/holdout/holdout.json`.

Method: every headline number in scope was re-derived from the raw stored artifacts with
independently written code, never by re-running the script that produced it. No GPU, no model
loading — stored vectors only. Scratch in `/Users/Flo/.claude/jobs/e3ef7e22/tmp`.

**Disclosure first.** One action of mine touched the repo. To test the coverage set's
byte-reproducibility claim I re-ran `build-coverage-set.ts` with an interception wrapper meant to
redirect its writes into scratch. The interception did not take (ESM named-import binding), so the
script wrote to `research/v3/data/coverage-set/` for real. **The output was byte-identical** —
`git diff` and `git status` both report no change to either file — so the only thing that changed
is the mtime on `coverage-set-1.json` and `COVERAGE_SET.md`. This is reported as a defect in my
procedure, not as a finding; it also happens to be the strongest possible confirmation of the
determinism claim.

---

## Findings

### MAJOR-1 — 117 held-out artworks are rendered in the reviewer-browsed cluster gallery, and nobody wrote it down. CONFIRMED

`research/v3/data/embeddings/gallery/*.html` display album art as visible thumbnails. Counting
distinct 32-hex `music-artworks/` stems in the page source and intersecting with the 413 ids in
`holdout.json`:

| page | distinct music-artworks ids shown | of which held out |
|---|---|---|
| `dinov2-vitl14.html` | 345 | 41 |
| `dinov3-vitl16.html` | 349 | 44 |
| `pe-core-l14.html` | 330 | 36 |
| `neighbors.html` | 83 | 19 |
| **union** | **964** | **117 (28.3% of 413)** |

Two of the 12 quarantined artworks (`header.nearDuplicateCensus.nonCandidateQuarantine`) are shown
too.

`data/embeddings/GALLERY_NOTES.md:3` records that the reviewer browsed exactly these pages, and
those notes are the stated provenance for two things that are now load-bearing: the elimination of
PE-Core as the canonical instrument, and the inherited `k=36` that the coverage set is built on
(`coverage-set-1.json` `header.clustering.kProvenance`).

`data/holdout/HOLDOUT.md:22-41` is categorical: held-out artworks are excluded from "review
batches (nobody looks at their palettes), development batches and debugging, outlier mining and
pathology triage, any tuning, threshold fitting, or calibration", and — the operative sentence —
*"Looking at a held-out artwork spends it. If one is looked at, say so and remove it from the
end-of-campaign claim — do not quietly keep it."* Nothing says so, anywhere.

`oracle/embeddings/gallery.py` contains no occurrence of the strings `holdout` or `held`: the
gallery has no holdout awareness by construction, and `oracle/embeddings/serve_gallery.py` will
re-expose the same pages on demand.

**Why this is not simply C1 or C3.** `PHASE_0_LOOSE_ENDS.md` C1 covers the quarantine list, C3
covers a re-roll. Neither covers "held-out artworks were rendered in a reviewer-facing artifact
that is still on disk."

**Mitigating, and it matters.** The gallery was written `2026-08-02T20:11:42Z`; holdout **2.0.0**
was frozen at 22:47 the same day, so the current list did not exist when the pages were built.
The exposure is thumbnails at cluster granularity, not palette inspection, and the reviewer's four
recorded observations name five artworks. But holdout 1.0.0 did exist at build time (the census at
20:17 already carries `holdout`/`working_set` side labels), and the freeze rule does not have a
"only if you looked hard" clause.

**What I would ask for.** Not a re-roll — a ledger row naming the 117, and either a decision that
a cluster-thumbnail view does not count as spending an artwork, or their removal from the
end-of-campaign claim. Plus a holdout filter in `gallery.py` before the next gallery is built.

### MAJOR-2 — `near-dup-census.json`'s holdout block describes the *superseded* holdout, unlabelled. CONFIRMED

`data/embeddings/near-dup-census.json` (`written_at` 2026-08-02T20:17:36Z) carries a
`holdout_crossing` block and a per-endpoint `side` field on all 6,386 pairs. Both were computed
against holdout **1.0.0**. The file carries no version marker, no `holdout_version` key, and no
caveat.

Measured against the current `holdout.json`:

- **2,875 of 12,472** music-artworks pair endpoints (23.0%) carry a `side` label that disagrees
  with holdout 2.0.0.
- Of the 224 ids in `holdout_crossing.at_0.95_any_arm.affected_holdout_artwork_ids`, only **44**
  are held out today. The other 180 are working-set artworks listed under a key named
  "affected_holdout_artwork_ids".
- The block's headline numbers (1,533 leaking pairs, 224 artworks affected, 810 files to
  quarantine) are the *diagnosis of the bug that was already fixed*. Read today at face value they
  say the current holdout leaks catastrophically. It does not (see NEGATIVE-1).

This file is not archived. It is pinned by sha256 as live evidence in
`data/decisions/decisions.json` under `d-2026-08-02-holdout-v2-redraw`, asserted at build time by
`src/coverage-set/build-coverage-set.ts:259-262`, and pinned in `holdout.json`
`header.nearDuplicateCensus.sha256`. The `pairs` array is the correct, version-independent part —
and the part every consumer actually uses. The `holdout_crossing` block and the `side` fields are
the trap.

**Fix is cheap and non-invasive:** the census cannot be regenerated without re-rolling nothing
(the graph is holdout-independent), so a sibling note file, or a `holdout_version: "1.0.0"` line
in a regenerated header, closes it. Regenerating changes the sha256 and therefore requires
touching three pinned references — which is an argument for the note file.

### MAJOR-3 — "dinov2-vitl14 won the retrieval bake-off" is not a win over pe-core-l14. CONFIRMED

I re-derived all six arms' R@1 from the stored `.npy` vectors with my own nearest-neighbour code
(full 16,145-file pool, float32 sgemm, rank = 1 + count of strictly greater similarities). Every
arm reproduces the published number to 16 significant digits (see NEGATIVE-2). Paired McNemar on
the same 24,648 pairs, `dinov2-vitl14` against each other arm:

| comparison | ΔR@1 | b01 | b10 | χ² (cc) | p |
|---|---|---|---|---|---|
| vs `pe-core-l14` | **+0.00057** | 1573 | 1559 | **0.05** | **0.816** |
| vs `dinov3-vitl16` | +0.01814 | 1263 | 816 | 95.68 | 1.35e-22 |
| vs `dinov3-vith16plus` | +0.02495 | 1489 | 874 | 159.54 | 1.43e-36 |
| vs `dinov2-vitl14-392` | +0.03485 | 1468 | 609 | 354.44 | 4.58e-79 |
| vs `siglip2-so400m` | +0.11267 | 3743 | 966 | 1636.48 | ~0 |

**dinov2-vitl14 and pe-core-l14 are indistinguishable at n=24,648** — a 14-pair margin out of
24,648, p = 0.82. Yet the recorded rationale is the R@1 ranking:

- `oracle/embeddings/near_dup_census.py:342` →
  `"primary_arm_rationale": "won the retrieval bake-off (R@1 0.7892); see bakeoff.json"`
- `decisions.json` `d-2026-08-02-embedding-canonical-model` `fundedByArtifacts[0].what`:
  *"dinov2-vitl14 R@1 0.7892 (mean rank 1.497) — first of six arms, ahead of pe-core-l14 0.7887…"*
  — a bare ranking with no significance statement.

The **choice is right and the evidence for it exists** — `GALLERY_NOTES.md:7-14`, the reviewer's
observation that PE-Core matches by artist rather than by image, which is semantic leakage for
every use this instrument has. That is a real, decisive, qualitative finding. The defect is that
the machine-readable rationale cites the number that does *not* separate them, so anyone
re-deriving the decision from the artifacts finds a coin flip.

**And `PHASE_0_LOOSE_ENDS.md` C4 names the wrong pair as unargued.** C4 says the DINOv2-vs-DINOv3
choice "was never fully argued" and that the tail argument was "outvoted by the headline metric".
On R@1, dinov2 beats dinov3-vitl16 at p = 1.35e-22 — that comparison is settled by the headline
metric. The genuinely unseparated pair is dinov2 vs pe-core, and it is separated only by a
reviewer's eye, which C4 does not mention at all.

### MAJOR-4 — `near_dup_census.py` indexes secondary arms with primary-arm row indices, unasserted. CONFIRMED as a defect, LATENT in effect

`oracle/embeddings/near_dup_census.py:164-166`:

```python
    for arm_tag in args.arms:
        matrix = pool if arm_tag == args.primary_arm else load_pool(out_dir, arm_tag)[0]
        crossing, same = scan_pairs(matrix, artwork_ids, NEAR_DUP_THRESHOLD)
```

`load_pool(...)[0]` discards the row list. `artwork_ids`, `paths`, `keys`, `index_of_path`,
`held_rows` and the `left`/`right` index arrays all come from the **primary** arm's row order.
Nothing asserts `matrix.shape[0] == pool.shape[0]`; nothing asserts the two arms' path sequences
agree. A secondary arm with even one fewer `ok` row silently shifts every index, and
`crossing_pairs_union_of_arms`, `crossing_pairs_all_arms_agree`, `cosine_by_arm`, `found_by_arms`
and the whole `any_arm` holdout report become garbage. Asymmetric failure: a *larger* secondary
matrix raises `IndexError` (loud); a *smaller* one is silent.

**Verified latent today.** I hashed the path sequence of all twelve `*.ids.jsonl` files:
all six arms produce byte-identical path order for `sharded` (7,550 rows,
`d76cc4170fecabf4…`) and for `music_artworks` (8,595 rows, `0637b20440e53b14…`), and every row in
both is `status: "ok"`. So the census's cross-arm numbers are correct as computed — which is why
NEGATIVE-1 stands. There is no guard making that a property of the code rather than an accident of
this run's success.

This is the same bug class as the already-found `eval_pairs.py` auto-discovery bug, one layer down:
`eval_pairs.discover_arms` (`eval_pairs.py:189-238`) *does* run a per-collection completeness test;
`near_dup_census.py` reuses `query.load_collection` but not that logic.

---

## Minor findings

### MINOR-5 — 246 bake-off pairs are byte-identical files. CONFIRMED
Grouping the 16,145 embedded files by artwork and comparing the `sha256` already recorded in the
ids files: **246 of the 24,648 ordered pairs (1.00%) are pairs of files with identical bytes**
(81 artworks, 187 files). All 246 are rank 1 by construction — a model cannot fail them.
R@1 without them: **0.78711** vs the published 0.78923, a 0.21 pp inflation. It affects every arm
identically, so no ranking moves and no conclusion changes. `bakeoff.json` `method` describes what
is excluded from the *pool* but says nothing about duplicate bytes among the *targets*, and the
task line calls these "a different rendition".

### MINOR-6 — 8.1% of "cross-rendition" pairs are same-resolution. CONFIRMED
1,986 of 24,648 ordered pairs (8.06%) join two files with identical measured width and height.
R@1 on that slice is **0.8635**; on the genuinely different-size remainder, **0.7827**. Defensible
— a re-encode at the same size is still a different rendition — but the bake-off is read as a
resolution-robustness instrument (it is what settles the 224-vs-392 confound), and that reading is
8% weaker than it looks. Not stratified anywhere in `bakeoff.json`.

### MINOR-7 — two adjacent "eval-142 %" columns use different denominators. CONFIRMED
`COVERAGE_SET.md:73-78` tier-mix percentages are over **142** (45/86/7/4 → 31.69/60.56/4.93/2.82).
`COVERAGE_SET.md:82-119` per-cluster percentages are over **117** locatable
(`build-coverage-set.ts:902`, `pct(row.eval142Artworks, locatable.length)`). Both columns are
headed "eval-142 %", four lines apart, and the surrounding prose (line 66) establishes 117 as the
working denominator. Each number is individually correct.

### MINOR-8 — generated prose contradicts its own generated table. CONFIRMED
`COVERAGE_SET.md:57` (hardcoded at `src/coverage-set/build-coverage-set.ts:1024`, echoed in the
comment at `src/coverage-set/enrichment.ts:38`): *"only five confirmed parental-advisory covers
exist here and dropping two would halve the evidence"*. The table at `COVERAGE_SET.md:50` and the
JSON both say **6**. Dropping two of six leaves four, which is not a halving. The count in the
sentence is a literal; the count in the table is computed.

### MINOR-9 — two different things are both called "named components". CONFIRMED
`near-dup-census.json` `named_components` = **99** components, and its note says they are
"connected components of the near-dup graph at the primary threshold" — they are in fact the
**primary arm's** graph (threshold is 0.95 in both cases; "primary threshold" should read "primary
arm"). `holdout.json` `header.namedComponents` = **251**, built by `freeze-holdout.ts` over the
**union**. Same name, different graph, 2.5× different count, one field apart in files that cite
each other.

### MINOR-10 — `eval_pairs.py` still has no arm-set assertion. CONFIRMED
The fix added a per-arm completeness test (`eval_pairs.py:221-227`) but never compares the
discovered set to `config.BAKEOFF_ARMS` — that constant is used only as a sort key
(`eval_pairs.py:236`). Only an *empty* set is fatal (`:526-528`). Skipped arms and their reasons
are printed to the terminal and **never written into `bakeoff.json`** (`:540-558`), so a bake-off
run over four of six arms is indistinguishable in the artifact from one over six. Separately,
passing `--arms` explicitly (`:518`) bypasses `discover_arms` entirely, so a partially-embedded arm
can be pooled against a complete one with no check at all; and an arm that throws during
`evaluate_arm` is dropped from the payload silently (`:531-536`).

### MINOR-11 — the denominator behind every Python completeness check is itself unasserted. CONFIRMED
`common.py:62-81` `enumerate_collection` is the glob that produces `expected` for
`eval_pairs.py:210`, `embed.py:318` and `embed.py:332-333`. It raises on a *missing* shard
directory but has no expected-count assertion. `config.py:52-58` documents 7,550 files as
`[MEASURED]`, and no code checks it — so a partial sync lowers `expected` and a truncated arm
certifies itself complete. The TypeScript side does assert this
(`src/coverage-set/corpus.ts:58-59`, enforced at `build-coverage-set.ts:228-229`), which is what
makes the omission conspicuous rather than merely absent.

### MINOR-12 — `query.py` and `gallery.py` silently proceed on a partial collection set. CONFIRMED
`query.py:100-106` catches `FileNotFoundError` per collection and searches whatever loaded; the
`--json` output carries no indication of the reduced pool. `gallery.py:182-187` and `:274-279`
cluster over whatever `load_collection` returns — and `load_collection` falls back to the
append-only shard when the `.npy` is absent (`query.py:44-47`), so a half-finished arm clusters
silently while `stats["pool"]` is printed in the page header as authoritative (`gallery.py:466`).
Two arms clustered at different pool sizes produce side-by-side pages that are not comparable and
nothing says so.

---

## Negative results — claims I tried to break and could not

These are the load-bearing ones. Each was re-derived from raw artifacts with independent code.

### NEGATIVE-1 — the holdout is leak-proof at the census threshold. CONFIRMED, independently
I rebuilt the near-duplicate graph from `near-dup-census.json` `pairs` with my own union-find,
without reading `freeze-holdout.ts`'s output components, and classified every edge against the 413
held-out ids:

- 6,236 music-artworks edges; **62 have exactly one endpoint held out**.
- **All 62** land on one of the 12 ids in `nonCandidateQuarantine`. Zero edges reach a working-set
  artwork.
- I then verified each of the 12 genuinely fails a candidate filter, from
  `data/holdout/measurements.jsonl` (header measurements) and
  `data/source-surveys/pixel_results.json` — 8 non-square (aspect 0.068–0.778 against a 0.05 bar),
  1 thumbnail-only (130 px), 3 real-transparency. Not one of them would have been a candidate.
  If any had been, the "zero boundary edges" claim would be false; none is.
- Zero of the 200 coverage-set core artworks are held out or quarantined; **zero share a
  near-duplicate component with a held-out or quarantined artwork**; zero components contribute two
  core members; zero core/enrichment component collisions.

### NEGATIVE-2 — the components really are built over the union of arms, and the census recounts exactly. CONFIRMED
- `pairs` = **6,386** rows, recounted. Zero duplicate rows, zero same-artwork-id rows, zero
  cross-collection pairs (`crossCollectionPairs: 0` holds: 6,236 music/music + 150 sharded/sharded).
- Per-arm counts recounted from `found_by_arms`: dinov2 4,167 / pe-core 4,391 / dinov3 4,177,
  all-three-agree 2,291, union 6,386 — every one matches `counts.*` exactly.
- **Union semantics verified numerically**: the minimum over all 6,386 pairs of the *maximum*
  per-arm cosine is **0.950018** ≥ 0.95, and no pair's max-arm cosine falls below the threshold.
  The minimum *primary-arm* cosine present is 0.4965, i.e. rows are kept on another arm's evidence
  — which is what "union" means and what the primary-only reading would have got wrong.
- `edgesAppliedBothEndpointsCandidates 5938 + 227 + 71 + 150 = 6386` reconciles.
- `scan_pairs` (`near_dup_census.py:91-108`) is an exhaustive blockwise i<j scan — no ANN
  approximation, so the 46.3% undercount is a threshold effect only, as documented (C2).

### NEGATIVE-3 — the bake-off numbers are exactly right. CONFIRMED
Own numpy nearest-neighbour implementation, stored vectors only, no reference to `eval_pairs.py`'s
scoring. All six arms:

| arm | published R@1 | re-derived R@1 |
|---|---|---|
| dinov2-vitl14 | 0.7892323920804933 | **0.7892323920804933** |
| pe-core-l14 | 0.7886643946770530 | **0.7886643946770530** |
| dinov3-vitl16 | 0.7710970464135021 | **0.7710970464135021** |
| dinov3-vith16plus | 0.7642810775722169 | **0.7642810775722169** |
| dinov2-vitl14-392 | 0.7543816942551119 | **0.7543816942551119** |
| siglip2-so400m | 0.6765660499837715 | **0.6765660499837715** |

For dinov2-vitl14 I also reproduce `mean_rank` 1.4972411554690035, `median_rank` 1, `p90_rank` 3,
`worst_rank` 64, R@5 0.9787406686140864 and R@10 0.9976874391431353 exactly. `mean_similarity`
agrees to 10 significant figures (float32 accumulation order).

**Pair construction is sound.** The 24,648 pairs are ordered within-artwork pairs:
Σ n(n−1) over the published group-size histogram = 23,360 (music-artworks) + 1,288 (sharded) =
**24,648**, reproduced independently from the ids files. The pool exclusion (query + same-artwork
renditions except the target) and optimistic tie handling are as documented. `pool_size` 16,145,
`missing_files` 0, `dropped_pairs_for_missing_members` 0 — and the pool genuinely covers
**8,595/8,595** music-artworks files and **7,550/7,550** sharded files, every row `status: "ok"`.

**The 224-vs-392 confound claim reproduces to the digit.** b01=1,468 / b10=609; exact two-sided
binomial p = **2.0298e-81**, matching the documented `p=2e-81`. (Continuity-corrected χ² gives
4.6e-79 — worth knowing which test the number came from, but both are decisive.)

**A hypothesis I raised and then refuted.** With 6,386 known cross-id near-duplicates in the pool,
R@1 could be *deflated* by distractors that are the same image under a different id — which would
make it not a retrieval metric at all. Measured: of the 5,195 R@1 misses, **2** have a top-1 that is
a census near-duplicate of the query artwork. Crediting them lifts R@1 from 0.78923 to 0.78933.
The metric is clean.

### NEGATIVE-4 — the coverage set is byte-deterministic and its arithmetic is exact. CONFIRMED
- Re-ran `build-coverage-set.ts` (see disclosure above): output **byte-identical**, `git diff`
  empty, `git status` clean. Seed `0xc0efface`, k-means converged in 44 iterations, both
  reproduced.
- All **seven** pinned input sha256s in `coverage-set-1.json` `header.inputs` verified against the
  files on disk. The census sha256 in `holdout.json` verified. The `bakeoff.json` sha256 in
  `decisions.json` verified.
- Tier spread recomputed from the 200 core rows: `<=400` +0.0485 pp, `401-640` −0.0576 pp,
  `641-1024` **+0.1989 pp**, `>1024` −0.1898 pp. The **±0.2 pp** claim holds; universe rows sum to
  9,232 and core rows to 200.
- Cluster-mix TVD recomputed from `perCluster` (universe 9,232 / core 200 / eval-142 117):
  core **0.0851**, eval-142 **0.2273**, ratio **2.672** → the published 2.67×. Exact.
- eval-142 off-corpus: 25/142 = **17.61%**; untouched clusters 0/22/30/31 hold 256+54+73+112 = 495
  = **5.36%** of the universe; `inCore 3 + coreInTop5 19 = inCoreOrNear 22`. All exact.
- Universe reconciliation: 6,906 + 2,757 − 413 = 9,250; 9,250 − 18 = **9,232** = 6,888 + 2,344.
- `holdout.json` internal arithmetic: strata sum to 413 held / 254 components / 2,757 candidates /
  1,712 components; component-size histogram sums to 2,757 artworks over 1,712 components. Exact.

---

## What I did not do

- No GPU work, no model loading, no re-embedding. Every vector claim rests on the stored `.npy`
  files as committed.
- I did not re-run `freeze-holdout.ts` or `near_dup_census.py` — deliberately. The holdout claim is
  verified against their *outputs* with independent code, which is the stronger test.
- `nearestCoreCosine` (median 0.377) is not re-derived; the document itself flags it as the
  uninteresting number and nothing depends on it.
- The 46.3% census undercount (C2) is taken as documented. I confirmed the scan is exhaustive, so
  the undercount is a threshold choice and not a search artifact, but I did not attempt to measure
  the true duplicate rate below 0.95.

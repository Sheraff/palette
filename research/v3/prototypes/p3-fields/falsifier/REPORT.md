# P3 falsifier — where endorsed role colours sit in the field orderings

**The pre-registered test of arm-d §7, run before the selection cascade is trusted.** For each of
the 351 endorsed palettes, the pixels bearing each role colour as an exact 8-bit triple were located
in the source image at native resolution, and their positions in this paradigm's field orderings
recorded.

> *If endorsed answers sit roughly uniformly mid-ordering rather than concentrated near the
> designated ends, selection-by-rank-of-a-local-field is refuted — tuning moves where we cut, never
> what the order is.*

## Verdict

| role | ordering | verdict (k = 3, pre-registered) | robust to k? |
| --- | --- | --- | --- |
| background | depth | **CONCENTRATED — at the threshold, by 0.0005** | **no** → MIXED at k=5, UNIFORM-MIDDLE at k=8 |
| surface | depth | **CONCENTRATED — at the threshold, by 0.0005** | **no** → MIXED at k=5, UNIFORM-MIDDLE at k=8 |
| foreground | \|raw APCA\| vs endorsed background | **CONCENTRATED** | yes — strengthens with k |
| accent | distance from the two field ends | **CONCENTRATED** | yes — invariant to k by construction |

**Not MECHANISM-FALSIFIED at the pre-registered configuration.** But the finding that matters is
narrower than that sentence, and it is not the one the paradigm would want:

1. **The depth ordering is the weak one, and it is the one background and surface both depend on.**
   Its pass is a knife-edge — median-of-medians 0.2495 against a `<= 0.250` threshold — and it does
   not survive either sensitivity arm of the *uncalibrated* rank order `k`. Read in substance,
   background and surface are **MIXED**: the depth field carries real signal (the endorsed colours
   are not at 0.5) but nowhere near enough for a rank cut to land on them.
2. **The best-percentile statistic is below its own null for three roles of four.** Taken at face
   value the best percentiles look excellent (median 0.035 for background). Against the null
   baseline computed from each colour's own pixel count they are *worse than chance*: −0.217
   (background), −0.196 (surface), −0.110 (accent). Only foreground clears it, and only barely at
   k = 3 (+0.024). **Anyone quoting a best-percentile from this study without its null is quoting
   the colour's area, not the field's order.**
3. **Foreground is the paradigm's genuine result.** Median position 0.045, ninth decile 0.230,
   90.8% of measured colours at or below 0.25, and it is the only role that improves under every
   sensitivity arm. Endorsed foregrounds really do live at the extreme of |APCA| against the
   endorsed background, inside the shallow-depth band.
4. **Accent is a clean, k-independent CONCENTRATED at a modest margin.** Median position 0.164,
   66.1% at or below 0.25 — real, but the ninth decile is 0.500, so one accent in ten sits at the
   exact middle of its ordering.

## Run

| quantity | value |
| --- | --- |
| endorsement entries processed | **351 / 351** (0 skipped) |
| distinct artworks decoded | **173 / 173** (0 decode errors, 0 transparent-pixel refusals) |
| role colours measured | **1397** (background 349, surface 349, foreground 349, accent 350) |
| role colours absent from their image as an exact triple | **1** |
| palettes subsampled | **none** — no seed, no sampling; the full corpus ran |
| wall time | **29.6 s** per arm (k = 3), 92 s for all three arms, run in parallel |
| arms | k = 3 (pre-registered primary), k = 5, k = 8 (sensitivity on the uncalibrated rank order) |

The one absent triple is `surface #f3ec7c` on `0f/ab67616d00001e02000f0a78a1791248aec707e3`
(entry `8a2a25bed4750e34`, `grade-strong`, `full`). This **exactly reproduces the corpus fact stated
in the brief** — one endorsed role colour absent as an exact triple — from an independent decode,
which is a useful check that the decode path here matches the one the fixtures were built against.

## The orderings, as measured

Position **0 = at the ordering's designated end** (the maximum of the scalar field), **1 = at the
far end**. Ties resolve in the paradigm's favour.

| role | scalar field (designated end = maximum) | population |
| --- | --- | --- |
| background, surface | `depth` | every eligible pixel |
| foreground | `abs(apcaRaw(pixel, endorsed background))` | pixels with depth in the low non-zero band |
| accent | `min(dist(pixel, bg), dist(pixel, surface))` in OKLab | pixels clearing the same-colour bar from **both** |

Background and surface share one ordering because arm-d §2.3 makes them one question with two
answers: both are read off the field set `F`, the high-depth end of the depth field.

## Which statistic the verdict is on, and why not the other one

The brief asks for the **best** percentile per role colour and the **median** position. Both are
reported. The verdict is pre-registered on the **median**, for a reason the numbers make concrete:
the best percentile is dominated by how many pixels a colour occupies. A background covering half a
640×640 image has ~200,000 bearing pixels; under a **uniformly random** ordering its best percentile
would still be ~1/200,000. The median position's null value is 0.5 for every colour whatever its
area.

So every best percentile here is reported beside two null baselines computed per colour from its own
`n`: `1/(n+1)` for the expected best, and `1 − 0.9ⁿ` for the probability of landing in the top decile
by chance.

### The pre-registered criterion

Written into `aggregate.ts` as `VERDICT_CRITERION` **before any aggregate number was computed**,
applied per role to the distribution of median positions:

- **CONCENTRATED** — median-of-median-positions ≤ 0.25 **and** ≥ 50% of measured role colours have a
  median position ≤ 0.25.
- **UNIFORM-MIDDLE** — median-of-median-positions in [0.35, 0.65]. **The refutation.**
- **MIXED** — anything else.

*Honest note on the criterion's shape, visible only after the fact:* the two CONCENTRATED clauses
nearly coincide, because "at least half the colours are ≤ 0.25" is almost the same statement as "the
median is ≤ 0.25". For background and surface the criterion therefore effectively reduced to one
clause, and both passed it by 0.0005. That is a weakness of the criterion, recorded rather than
retro-fitted — the threshold is not moved here.

## Results — k = 3 (pre-registered primary)

`edgeRankK = 3`, `fieldQuantileBeta = 0.75`. Edge fraction across the 173 artworks:
min 0.046 / Q1 0.308 / **median 0.492** / Q3 0.726 / max 1.000. Median interior fraction 0.508,
median band fraction 0.373.

| role | N | absent | out-of-scope | measured | median-pos Q1 | **median-pos MED** | median-pos Q3 | frac med ≤ 0.25 | best Q1 | best MED | best Q3 | frac best ≤ 0.10 | **null** frac best ≤ 0.10 | pess. best MED | verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| background | 349 | 0 | 0 | 349 | 0.169 | **0.250** | 0.407 | 0.501 | 0.0057 | 0.0354 | 0.1563 | 0.670 | 0.887 | 0.052 | **CONCENTRATED** |
| surface | 349 | 1 | 0 | 348 | 0.152 | **0.250** | 0.415 | 0.500 | 0.0088 | 0.0706 | 0.2762 | 0.543 | 0.739 | 0.106 | **CONCENTRATED** |
| foreground | 349 | 0 | 131 | 218 | 0.008 | **0.045** | 0.121 | 0.908 | 0.0079 | 0.0455 | 0.1210 | 0.697 | 0.673 | 0.052 | **CONCENTRATED** |
| accent | 350 | 0 | 2 | 348 | 0.061 | **0.164** | 0.317 | 0.661 | 0.0613 | 0.1642 | 0.3169 | 0.368 | 0.478 | 0.172 | **CONCENTRATED** |

Deciles of the **median position** (D1…D9):

| role | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| background | 0.100 | 0.152 | 0.179 | 0.217 | 0.250 | 0.284 | 0.352 | 0.439 | 0.537 |
| surface | 0.052 | 0.113 | 0.168 | 0.201 | 0.250 | 0.297 | 0.360 | 0.480 | 0.580 |
| foreground | 0.001 | 0.006 | 0.011 | 0.020 | 0.045 | 0.063 | 0.097 | 0.146 | 0.230 |
| accent | 0.022 | 0.047 | 0.079 | 0.112 | 0.164 | 0.211 | 0.272 | 0.351 | 0.500 |

Deciles of the **best position** (D1…D9):

| role | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| background | 0.0000 | 0.0017 | 0.0117 | 0.0221 | 0.0354 | 0.0714 | 0.1148 | 0.1788 | 0.2673 |
| surface | 0.0000 | 0.0044 | 0.0140 | 0.0280 | 0.0706 | 0.1401 | 0.2008 | 0.3460 | 0.5025 |
| foreground | 0.0009 | 0.0056 | 0.0113 | 0.0201 | 0.0455 | 0.0629 | 0.0969 | 0.1458 | 0.2300 |
| accent | 0.0223 | 0.0472 | 0.0793 | 0.1125 | 0.1642 | 0.2108 | 0.2717 | 0.3510 | 0.4997 |

Penalised (every out-of-scope colour charged the worst position, 1.0, instead of being dropped) and
best-vs-null:

| role | penalised median-pos | penalised frac ≤ 0.25 | penalised verdict | best top-decile OBSERVED | NULL | **excess** |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| background | 0.250 | 0.501 | CONCENTRATED | 0.670 | 0.887 | **−0.217** |
| surface | 0.250 | 0.500 | CONCENTRATED | 0.543 | 0.739 | **−0.196** |
| foreground | 0.148 | 0.567 | CONCENTRATED | 0.697 | 0.673 | **+0.024** |
| accent | 0.165 | 0.657 | CONCENTRATED | 0.368 | 0.478 | **−0.110** |

Out-of-scope reasons: foreground — `no-bearing-pixel-in-depth-band` 115, `empty-depth-band` 16;
accent — `no-endorsed-field-ends-reference` 2 (the two single-role `partial` corrections, which
carry an accent but no background or surface to measure it against; A6 in the fixtures README).

## Sensitivity to the uncalibrated rank order k

`k` is `[UNCALIBRATED]` by arm-d's own §4, so a verdict that moves with `k` is not a verdict.

| role | k = 3 | k = 5 | k = 8 |
| --- | --- | --- | --- |
| background | 0.250 CONCENTRATED | 0.286 MIXED | 0.352 **UNIFORM-MIDDLE** |
| surface | 0.250 CONCENTRATED | 0.308 MIXED | 0.383 **UNIFORM-MIDDLE** |
| foreground | 0.045 CONCENTRATED | 0.039 CONCENTRATED | 0.036 CONCENTRATED |
| accent | 0.164 CONCENTRATED | 0.164 CONCENTRATED | 0.164 CONCENTRATED |

(cells are median-of-median-positions and the verdict)

Three things this table says:

- **Background and surface go the wrong way as the edge indicator is made less trigger-happy.** At
  k = 8 the median endorsed background sits at 0.352 of the depth ordering — inside the
  UNIFORM-MIDDLE band, which is the pre-registered refutation for that role. The k = 3 pass is not a
  property of the paradigm; it is a property of a dense edge map producing a huge depth-0 tie block
  that favourable tie-breaking then rewards. The pessimistic-best column (0.052 against a favourable
  0.035 for background, and 1.000 for individual colours on the worst artworks) is the same fact
  seen from the other side.
- **Foreground strengthens monotonically** — median 0.045 → 0.039 → 0.036, out-of-scope 131 → 78 →
  28, best-top-decile excess over null +0.024 → +0.129 → **+0.219**. This is the one place the
  paradigm's ordering is doing real work, and it gets better when the field is computed better.
- **Accent is bit-identical across all three arms**, correctly: the accent ordering never touches
  the depth field. That invariance is a self-check that the arms are wired as documented.

## Corpus diagnostics that the study turned up

**The edge indicator at the pre-registered k is very dense.** At k = 3 it marks a *median of 49.2%*
of pixels as edges; 9 of 173 artworks are over 90% edge and 2 are over 99%
(`images/knuckles.jpg` is 100.0% edge — 12 interior pixels in a 350×350 image). This is arm-d §2.1's
own predicted difficulty ("in near-black regions a single LSB is a genuinely large OKLab step") in
measured form: the contract's same-colour bar is 0.00932 in `dark-neutral`, and JPEG block noise
clears it almost everywhere. It has two consequences the report has to carry:

- the depth field becomes a large block of exact zeros, so the depth *ordering* is mostly ties, and
- 9 artworks have an empty foreground band at k = 3 under arm-d's literal definition.

**Background and surface get the same median position on 161 of 349 palettes** — 52 because the
endorsed palette collapsed surface onto background exactly (`bg.hex === surface.hex`), and 109 more
because both land in the same depth tie block. That is why their medians-of-medians are identical to
17 digits; it is not a bug.

## Simplifications and proxy choices — every one of them, stated

This is a proxy study. The list is the audit surface.

1. **The field threshold is taken over the interior, not over all pixels.** arm-d §2.3 puts the
   field at the β quantile of depth over *every* pixel. Because the edge map is dense (above), that
   quantile is exactly 0 on many artworks and the foreground band would be empty by construction —
   the study would then measure nothing rather than measure a refutation. The β = 0.75 quantile is
   therefore taken over the **interior** (`depth > 0`). This is identical to arm-d's definition
   wherever edges are sparse. The all-pixel threshold is recorded per artwork in `results.json` as
   `fieldThresholdDepthAllPixels` so the choice can be undone by a reader.
2. **The edge threshold uses p's own region bar, not the pair bar.** arm-d §2.1 says "the
   same-colour bar for p's region", so `sameColorBar(p, neighbour)`'s max-of-two-regions rule is
   *not* applied inside the edge indicator. It **is** applied in the accent restriction, where the
   comparison is between two published colours.
3. **`k = 3` and `β = 0.75` are `[UNCALIBRATED]`**, per the brief and arm-d §4. k is swept
   (3/5/8); β is not.
4. **The foreground band is `0 < depth < fieldThreshold`.** "Low non-zero band" is not otherwise
   specified; `depth > 0` means "not an edge pixel" and `depth < fieldThreshold` means "not inside
   F", which is arm-d §2.5's "above zero and below the field".
5. **The foreground ordering uses arm-d's *second* regime only** — `|raw APCA|` against the
   background. The ink-annulus score of §2.5's first regime is not implemented; it needs a cascade
   pixel and an annulus ratio that §4 leaves to a stratified sweep, and the brief specifies the APCA
   ordering. So this study does not test the ink score at all.
6. **The foreground's background reference is the *endorsed* background**, not one the paradigm
   selected. Same for the accent's two field ends. This is deliberate — it isolates the ordering
   question from the cascade — but it means orderings (b) and (c) are measured under a *better*
   reference than the algorithm would have. **This flatters the paradigm**, and the foreground and
   accent verdicts should be read with that in mind.
7. **Accent is scored on distance from the nearer field end only.** arm-d §2.6's lexicographic tier
   structure (lightness-moving before chroma-moving) is not implemented; the brief specifies the
   distance ordering.
8. **Boundary pixels take the `min(k, available)`-th largest neighbour distance.** A corner pixel
   has 3 neighbours, so k = 3 reads its minimum; at k = 8 it reads its minimum too. Affects one
   pixel ring of each image.
9. **Ties resolve in the paradigm's favour** for the reported positions. `bestPositionPessimistic`
   (ties against) is recorded per role colour; the gap between them is large on high-edge artworks
   and is the honest reading there.
10. **`gradient`, `midpoint` and `collapse` are ignored entirely.** Only the four role colours are
    measured, per the fixtures' `gradientAdvisory`.
11. **De-duplication is not applied.** All 1397 role colours are counted, including the same colour
    on the same artwork appearing under two endorsement entries (351 entries over 173 artworks).
    Per-entry data is in `results.json` for anyone who wants the de-duplicated cut.
12. **The best percentile per role colour is the most favourable one**, as the brief specifies.
13. **The absent triple is excluded from the penalised variant**, not charged 1.0 — an absent colour
    is a reachability fact, not a rank-order fact, and charging it would conflate the two.

### Independence, and what was deliberately *not* re-implemented

`fields.ts` implements sRGB→OKLab, APCA raw, the edge indicator and the exact Euclidean distance
transform from scratch; nothing in `falsifier/` imports from `../src/`, which a parallel worker owns
and which was never read. What *is* imported from `research/v3/src/contract/constants.ts` is
calibrated data only — `SAME_COLOR_BAR_BY_REGION`, the region boundaries, `APCA_G4G` — because the
study must measure in the same space the endorsements were judged in. `selftest.ts` proves the two
implementations agree: **4096 triples, max OKLab channel delta 0, max APCA raw delta 0, 0 region
mismatches, 0 bar mismatches.**

### Data-format surprises in `endorsements.json`

Only one worth naming, and the README documents it (A6): **3 entries are `completeness: "partial"`**
and carry fewer than four roles — two carry an accent alone, one carries three roles. Role counts
are therefore 349/349/349/350, not 351×4. The two accent-only entries are the study's only
`no-endorsed-field-ends-reference` skips. Everything else was as documented: 351 entries, 173
distinct artworks, `absolutePath` resolving 351/351 (the images are untracked, so they resolve
against the main checkout, not the worktree), 255 `full` / 93 `roles-only` / 3 `partial`.

## Reproducing

```sh
cd research/v3/prototypes/p3-fields
node --experimental-strip-types falsifier/selftest.ts
node --experimental-strip-types falsifier/probe-edges.ts          # edge density vs k, 10 artworks
for K in 3 5 8; do
  node --experimental-strip-types falsifier/study.ts --k $K --out parts/k$K.json
done
node --experimental-strip-types falsifier/aggregate.ts            # writes results.json, prints the tables
```

Fully deterministic: no sampling, no seed, no randomness anywhere. Artworks are ordered by content
hash and entries within an artwork by `entryId`, so `--offset`/`--limit` chunk boundaries are stable
and the study writes its output file after every artwork.

**Files.** `fields.ts` (the independent field implementation) · `study.ts` (the per-palette study,
chunkable) · `aggregate.ts` (the pre-registered criterion and the tables) · `selftest.ts` ·
`probe-edges.ts` · `results.json` (per-artwork, per-entry, per-role-colour data for all three arms,
plus every summary in this report) · `parts/k{3,5,8}.json` (raw per-arm output) ·
`parts/aggregate.txt` (the console tables verbatim).

# P2 α-tree, cycle 1 — what was built, what was cut, what it costs

**Worker A, 2026-08-04.** Arm-b's walking skeleton (§6) as a dev-loop candidate: decode → α-hierarchy
→ grain fold → field carve → field model → roles → contract. It runs end to end on `demo-20` with
**20 ok / 0 failed** and **0 contract violations**, which is the cycle-1 goal the SPEC states
(validity and measurability, explicitly not quality).

## Files

| file | what |
|---|---|
| `constants.ts` | every tunable, with provenance |
| `decode.ts` | sharp decode, transparency refusal, per-pixel OKLab / region / bar |
| `hierarchy.ts` | edges in bars, α-zones at α = 1, the Kruskal tree above one bar |
| `accumulator.ts` | the bar-scaled accumulator, the SPEC's representative rule, mode peeling |
| `field.ts` | the border carve, flat/linear/none typing, the ramp's `t` |
| `roles.ts` | lexicographic assignment, collapses, the escape |
| `parse.ts` | the pipeline, grain folding and the retained tree |
| `candidate.ts` | `candidateId = "p2-alpha"`, `paletteOf` |
| `dump.ts` | `nodesOf` + the JSONL CLI |
| `tests/` | brute-force α-zone reference; determinism; contract validity; branch coverage |

## Decisions taken

**α is the contract's bar, and every level in the tree is in bars.** Edge weight is OKLab distance
divided by the pair's own regional `sameColorBar`. So α = 1 *is* `sameColor()` applied along a path,
and a node "formed at 14.4 bars" is a statement in the contract's units. There is no second epsilon
anywhere in the pipeline; the tests pin the fast per-pixel bar arithmetic against `colorRegion()` and
`sameColorBar()` on every fixture colour.

**The tree's leaves are α-zones, not pixels.** Below one bar the contract says there is nothing to
see, so a hierarchy refined below that level would be a hierarchy of differences the ruler calls
zero — exactly what a re-encode moves.

**Edges are sorted exactly, not binned.** Arm-b proposes a counting sort into bar-scaled bins for
speed; that needs a bin width, which is a constant the SPEC does not let this pipeline invent. An
exact sort by `(weight in bars, raster edge index)` needs none and makes the tie-break explicit.

**Grain folding had to bring a contraction with it, and this is the one thing the arm-b text does not
say out loud.** Folding small *zones* away is only half the job: single-linkage merging produces long
chains, and on the first demo cover the raw tree had 5,888 zones / 11,769 nodes of which **3,538**
cleared the area floor purely by being their big child plus one speck. Publishing those is a 30×
slowdown and an unreadable dump. A node is now retained when it is the root, a non-grain α-zone, or a
**branching point of the surviving tree** (≥ 2 children still holding a surviving zone) — the induced
topology over surviving leaves. Grain is not deleted: its pixels still belong to every ancestor's
pixel range and therefore to every ancestor's colour, which is what "folded into its parent" means.

**Selection is a scan, never a `sort`.** Bar-indifference makes "better than" non-transitive, and a
non-transitive comparator handed to `Array.prototype.sort` gives an engine-dependent order. Every
role is chosen by one pass over candidates in canonical order (ascending node id, then ascending
packed RGB), keeping the incumbent unless a challenger strictly wins.

**The contract's filters are inside the orders, not after them.** A candidate that would make the
palette invalid is not a candidate: distinctness above the bar against every already-chosen role, the
0.07444 foreground↔accent separation, and the raw pre-clamp APCA floors against background, surface
and — via the contract's own `minRawContrastOverRamp` / `firstInvisibleAccentOnRamp`, not a local
reimplementation — the whole rendered ramp.

**One rescue step before the escape.** When no node representative can serve as text, the pipeline
scans the image's distinct colours for one that clears the floors before reaching for `#000000` /
`#ffffff`. An exact artwork pixel is strictly better evidence than an invented literal and invariant 2
prefers it. On `demo-20` the rescue fires twice and the escape never fires.

## Constants introduced

| name | value | tag | note |
|---|---|---|---|
| `ALPHA_BARS` | 1 | `[INHERITED]` | α = the contract's bar; not tunable — moving it introduces the forbidden second radius |
| `GRAIN_AREA_FLOOR` | 0.001 | `[UNCALIBRATED]` | **invented.** Arm-b §4.2's anchor (smallest region whose colour the reviewer ever endorsed) has not been run. The most consequential invented number here |
| `FIELD_ADEQUACY_BARS` | 1 | `[UNCALIBRATED]` | arm-b §4.3 proposes k = 1; the flat-vs-ramp round at 0.5 / 1 / 2 bars has not been run. This is the number that moves the gradient rate corpus-wide |
| `DEGENERATE_MODE_LIMIT` | 16 | `[UNCALIBRATED]` | a cap, not a threshold: 4× the role count. Raising it can only append to the end of an order |
| `OKLAB_ACCUMULATOR_STEP` | min of the four bars | `[INHERITED]` | derived from `SAME_COLOR_BAR_BY_REGION`; sets accumulator resolution, never a verdict |
| `OKLAB_MAX_BAR` | max of the four bars | `[INHERITED]` | derived; sizes the search window |
| `ALGORITHM_VERSION` | `p2-alpha-0.1.0` | `[UNCALIBRATED]` | a label |
| `PREPROCESSING_VERSION` | `sharp-0.33.5/srgb/no-resample` | `[INHERITED]` | `CONVENTIONS.md` + §1 |

Two genuinely invented numbers (`GRAIN_AREA_FLOOR`, `FIELD_ADEQUACY_BARS`), one cap, everything else
derived from the contract.

## Cuts taken

- **No radial / conic field models** (SPEC cycle-1 cut). A radial field reaches `none` and takes the
  degenerate branch.
- **No text detector** (SPEC cycle-1 cut). "Foreground" is the largest mark *group* the hierarchy
  found, which is a much blunter instrument than arm-b §2.4's stroke-width pipeline.
- **No enclosure re-entry, no giant-type re-carve** (arm-b §2.3's two structural cases) — out of
  scope by instruction.
- **No third gradient stop and no excursion measurement.** Two stops or null.
- **The ramp's sign convention is geometric, and it is a convention.** An eigenvector is defined up to
  sign and something must fix it. `t` runs left→right, top→bottom, so `t = 0` is the end nearer the
  image origin — no constant, no colour bias, but a mirrored artwork swaps `background` and `surface`.
  The principled replacement is arm-b §2.6's "field nodes by area fraction", which a median split
  cannot express because both halves have equal area by construction.
- **The luminance-separation level of the foreground order is effectively dead.** The orchestrator's
  stated order is "area, then luminance separation", area is compared exactly (it has no bar, and
  inventing an indifference band for it would be inventing a constant), so the second level fires only
  on an exact area tie. Recorded rather than fixed, because fixing it means either a new constant or
  changing the stated order — both reviewer calls.
- **The density mode is discretised to occupied-cell centroids.** Step 1 of the representative rule
  asks for an argmax over a continuum; the search is exact (branch and bound, not sampling) over that
  finite candidate set. Steps 2 and 3 are exact as specified.

## What the numbers say, and the one that should worry a reader

`demo-20`, one pass, no cache:

- **field model: 5 `flat`, 0 `linear`, 15 `none`** → 15 of 20 palettes come out of arm-b §2.8's
  degenerate branch (whole-image colour modes), not off the tree.
- **gradients published: 0.** `FIELD_ADEQUACY_BARS = 1` as an RMS over field pixels is not reachable
  for a JPEG-noisy photographic field; the linear residuals on the `none` covers run 1.2 – 22 bars.
- **collapses: 2 surface, 4 accent. Escapes: 0. Contract violations: 0 of 20.**
- **retained nodes: 4 / 46 / 220** (min / median / max), 1,284 total, max depth 34. Median distinct
  representatives per image is 16 of 46 nodes — long chains of branch points still share a colour, and
  a "distinct representative" post-filter is the obvious cycle-2 tightening.

**The 15/20 degenerate rate is the honest headline.** Arm-b §7 predicts exactly this bucket
("photographic and full-scene covers, where no field exists... my largest expected bucket of
mediocre-but-not-wrong results"), so the prediction is confirmed rather than contradicted — but it
means that on this set the *tree* is doing most of its work in the node dump and comparatively little
in the palette. Whether that is the paradigm failing or `FIELD_ADEQUACY_BARS` being wrong is the
reviewer's question, and it is exactly the one arm-b §4.3 asked for its own round. The dump is the
instrument that can separate the two, which is why it ships this cycle. A synthetic linear-ramp
fixture in `tests/determinism.test.ts` proves the gradient path is live code rather than dead code —
without it the entire ramp half of the design would ship unexercised.

## Cost

Per image on the demo set (300×300 JPEG): **min 192 ms, median 609 ms, mean 1,103 ms, max 6,864 ms**
single-threaded; the whole 20-cover run is 7.0 s wall across cores. Arm-b §5 budgets "tens of
milliseconds"; this is one to two orders above that. The gap is concentrated in the degenerate
branch's 16 rounds of mode peeling over 25k–56k distinct colours, and in per-node accumulator
construction — both are engineering, not paradigm. Two optimisations already landed and are worth
recording because the naive versions were 10–30× slower: the retained-tree contraction above, and a
3-D summed-area table for the density mode's branch-and-bound bound (a tight box around the one-bar
ball, over-counting only by 6/π rather than by the 5.4× a whole-cell Chebyshev cube costs).

## Verification run

```
node --experimental-strip-types --test prototypes/p2-tree/alpha/tests/*.test.ts   # 21 pass, 0 fail
node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p2-tree/alpha/candidate.ts --set data/devloop/sets/demo-20.txt
#   20 ok · 0 failed · 6976 ms  (exit 0)
node --experimental-strip-types prototypes/p2-tree/alpha/dump.ts \
  --set data/devloop/sets/demo-20.txt --out prototypes/p2-tree/alpha/out/demo-20.nodes.jsonl
#   20 dumped · 0 failed · 1284 nodes  (exit 0)
```

`tsc --strict --noEmit` over `alpha/**` reports 0 errors. Every import resolves to `research/v3/src/**`,
this directory, `node:*`, or `sharp` — nothing from the repository root or `research/src/`.

**Environment note for the orchestrator:** the corpus shards are not inside the worktree, so
`00 -> /Users/Flo/GitHub/palette/00` was symlinked at the worktree root (gitignored, same as
`.worktrees/p5-fieldfit`). Without it every set-file path fails to resolve.

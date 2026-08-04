# P2 / `tos` — the tree-of-shapes pipeline, cycle 1

**Worker B, 2026-08-04.** Lineage: arm-b′ (primary), arm-f′ §2.2 (the chain / siblings / cliff
reading). Binding spec: `../SPEC.md`. Nothing here is a quality claim — cycle 1 owes validity and
measurability, and this file says exactly which parts are which.

## What is here

| file | what it is |
|---|---|
| `tree.ts` | the tree of shapes: immersion, flood, reverse union-find, canonicalisation, de-immersion, attributes, `reconstruct()` |
| `pipeline.ts` | decode + quantise + stability + representative colours + field verdict + role rankings |
| `constants.ts` | every tunable, with its provenance tag |
| `candidate.ts` | the dev-loop candidate `p2-tos`, and the per-role repair walk |
| `dump.ts` | `nodesOf()` plus the CLI that writes `out/demo-20.nodes.jsonl` |
| `tests/reference.ts` | the brute-force shape definition and the synthetic fixtures (no shared code with `tree.ts`) |
| `tests/reconstruction.test.ts` | rebuild the quantised image from the tree; strict-nesting and id-order structure |
| `tests/brute-force.test.ts` | the fast tree against the naive level-set definition |
| `tests/determinism.test.ts` | double-run agreement, exact-pixel publication, endpoint ruling and collapse flags |

## The tree, and the bug that reconstruction did not catch

The first implementation took the flood's **discovery pointers** as the parent relation. It passed the
reconstruction test. It was completely wrong: two cells of one region are routinely discovered from two
different outer cells, so a 4 x 4 square of one level came out as twelve separate nodes, each with a
plausible area, a plausible centroid and a plausible representative colour. Nothing about the output
looked broken.

The brute-force reference caught it in one run. **This is the whole argument for the reference test
existing**, and it is worth writing down that the mandatory test the brief named first was not the one
that found the defect. The parent relation comes from a reverse-order union-find over the flood order,
per Géraud–Carlinet–Crozet–Najman; the flood only establishes the order.

A second thing the reference forced into the open: **"tree of shapes" is not a tree without an
exterior value.** On a left-to-right ramp the component of `{u ≥ 1}` and the component of `{u ≤ 2}`
overlap with neither containing the other. What makes the collection a tree is embedding the image in a
plane of fixed value; both implementations use the lower median of the image's own border pixels
(Monasse–Guichard's FLST convention). `tests/reference.ts` documents that this one *definition* is
shared while no *implementation* is.

## Deviations from arm-b′

1. **Representative colour — the spec overrides §2.3.** arm-b′ picks the exact triple maximising a
   depth-weighted count (each pixel weighted by its normalised distance to the node's complement), so
   the answer comes from the shape's interior rather than its antialiased boundary. `SPEC.md` fixes
   **bar-density mode** instead for both P2 pipelines: the OKLab location maximising node mass within
   one same-colour bar, then the mean of the node's pixels within one bar of it, then the exact triple
   nearest that mean. Implemented as specified in `representativeColor()`. The reason for the override
   is comparability — the two P2 pipelines must differ in their trees, not in their colour-picking —
   and the cost is that this cycle produces no evidence on arm-b′ free parameter 8, which the proposal
   wanted settled by measurement. arm-b′'s inradius is still computed, but only for thinness.
2. **Monotone centroid migration is a ratio, not a predicate.** §2.5 asks for a centroid that "migrates
   monotonically along a fixed direction". Literally applied to a 20–40 node chain, one antialiased
   edge refuses the whole reading; `MONOTONE_MIGRATION_FRACTION` measures net travel over total travel
   instead. Every laminar verdict in the demo-20 run depends on this.
3. **A node's colour comes from its own pixels**, falling back to its whole shape when it has none.
   §2.3 is silent on which set the histogram is over. Own pixels is the reading that makes a field's
   colour the field *minus the marks on it*, which is what a person names.
4. **Coverage — the `unreadable` test — had to be given a meaning.** §2.5 says "retained nodes explain a
   small fraction of the image area" and does not define "explain". Here a pixel counts as explained
   when its own colour is the same colour, by the contract's bar, as the representative of the deepest
   retained node containing it. It makes a flat cover fully explained and a photographic one poorly
   explained, which is the distinction the verdict is for. It is also why 8 of 20 demo covers read
   `unreadable` (see below) — the definition and the cut are both cycle-1 guesses.
5. **The repair walk is per role, not over the product of both rankings.** §2.7's rule is "the next item
   in the same ranking… and the whole palette is re-validated after it". Taken as a cross-product it
   spends its entire budget re-testing the first foreground against sixteen accents when the foreground
   is what the contract objected to. `candidate.ts` settles the foreground first against a collapsed
   accent, then walks the accent ranking.
6. **The accent's distinctness bar is the contract's, not the same-colour bar.** The first run of this
   prototype collapsed the accent only when it failed `sameColorBar`, and 7 of 20 palettes then failed
   `I3.foreground-accent-not-separated`. `FOREGROUND_ACCENT_SEPARATION_DISTANCE` is consumed rather than
   re-derived. arm-b′ §2.6 says "the distinctness bar", which is this one.

## Cycle-1 cuts (recorded, per `SPEC.md`)

- **L only.** No `a` / `b` trees. arm-b′ §2.1 calls three channels a paradigm commitment and not a
  tunable, precisely because a tree on L alone is **structurally blind to an isoluminant accent** — the
  case the proposal says is real and fragile. Every accent this pipeline finds in cycle 1 is one that
  also moves in lightness. Any reachability number from this cycle is a number about one third of the
  proposed mechanism.
- **No text detector** (cycle 2, grafted regardless of winning tree). Foreground is thinness-ranked
  clusters and nothing more.
- **Two gradient stops or none.** No interior guide stop, so §2.6's excursion rule is untested.
- **No enclosure class** (frames, letterboxing) and no explicit residual node in the parse object; the
  residual exists only as the tail of the two role rankings.
- **Thinness is computed for the largest `MARK_NODE_LIMIT` marks only.** Below that cut a node's
  `thinness` is `null` in the dump. Retained node counts run to ~900 per cover, so most marks carry no
  thinness — this is a cost guard, and the truncation is deterministic (area, then id).

## Constants

| name | value | tag |
|---|---|---|
| `SMALLEST_SAME_COLOR_BAR` | `min(SAME_COLOR_BAR_BY_REGION)` = 0.00932 | `[INHERITED]` |
| `LARGEST_SAME_COLOR_BAR` | `max(SAME_COLOR_BAR_BY_REGION)` = 0.02293 | `[INHERITED]` |
| `L_LEVEL_COUNT` | 256 (step 1/255 = 0.00392, 0.42x the smallest bar) | `[INHERITED]` |
| `STABILITY_WINDOW_LEVELS` | `round(POOLED_SAME_COLOR_BAR / step)` = 4 | `[INHERITED]` |
| `RENDER_AXIS_DEGREES` | 135 | `[INHERITED]` |
| `PREPROCESSING_VERSION` | `sharp-0.33.5/srgb/no-resample` | `[INHERITED]` |
| `MIN_NODE_AREA_FRACTION` | 0.0005 | **`[UNCALIBRATED]`** |
| `FIELD_AREA_FRACTION` | 0.10 | **`[UNCALIBRATED]`** |
| `LAMINARITY_CUT` | 0.15 | **`[UNCALIBRATED]`** |
| `MONOTONE_MIGRATION_FRACTION` | 0.8 | **`[UNCALIBRATED]`** |
| `MIN_LAMINAR_CHAIN_LENGTH` | 3 | **`[UNCALIBRATED]`** |
| `UNREADABLE_COVERAGE_FRACTION` | 0.5 | **`[UNCALIBRATED]`** |
| `MARK_NODE_LIMIT` | 64 | **`[UNCALIBRATED]`** (cost guard) |
| `REPR_CANDIDATE_LIMIT` | 4096 | **`[UNCALIBRATED]`** (cost guard) |
| `RESIDUAL_POOL_SIZE` | 8 | **`[UNCALIBRATED]`** (walk depth) |
| `MAX_ASSEMBLY_ATTEMPTS` | 24 | **`[UNCALIBRATED]`** (cost guard) |
| `ALGORITHM_VERSION` | `p2-tos-0.1.0-cycle-1` | `[UNCALIBRATED]` (a label) |

`STABILITY_WINDOW_LEVELS` uses the **pooled** bar and not `sameColorBar()`: a window is one global
scalar over an image's level axis, not a judgement about a pair of colours, which is the one use
`src/contract/constants.ts` reserves the pooled value for. The alternative derivation from
`SMALLEST_SAME_COLOR_BAR` gives 2 levels, too narrow to separate a real edge from JPEG ringing.

## Determinism

Node ids are the flood order, which is the raster scan. Ties: node id, then lexicographic RGB (which is
ascending packed `r<<16|g<<8|b`), then raster index. The hierarchical queue is FIFO per level and
breaks a level tie **downward**. Every `Map` is sorted before anything reads it. No hash, no filename,
no content hash, no RNG anywhere in the algorithm; `tests/reference.ts`'s seeded LCG draws test images
only. `tests/determinism.test.ts` runs the whole pipeline twice per fixture and compares serialised
output.

## What the demo-20 run says

- 20/20 rows ok, 0 failed; every palette passes `validatePalette` with no violations.
- Verdicts: `unreadable` 8, `partitioned` 6, `laminar` 4, `flat` 1, `textured` 1. Four gradients, one
  collapsed surface, one collapsed accent.
- Coverage runs 0.23 – 0.93, median 0.55, against an `UNCALIBRATED` cut of 0.50 — **the verdict
  distribution is sitting on top of the cut**, so the eight `unreadable` covers are a statement about
  the guess as much as about the covers. This is the first thing a review round should look at.
- 9,756 retained nodes over 20 covers (122–926 per cover), 7,628 distinct representative colours. That
  is the reachability falsifier's input.

## Known weaknesses, stated before anyone measures them

- **Isoluminant accents are invisible** (the L-only cut). Structural, not tunable.
- **Retained node counts are high** — hundreds per cover. The MSER local-minimum rule with `≤` on both
  sides keeps flat runs of the growth curve; only exact-area duplicates are dropped. It costs the
  falsifier nothing (a bigger node set can only help reachability) and costs the parse very little
  (marks are truncated to 64), but it means "retained" is not yet a strong claim about a region.
- **The ground chain is the largest-area child at every step.** A cover whose ramp is not the largest
  thing at some level will read `partitioned`.
- **Timing: 178 ms per 300 x 300 cover** single-threaded and cold (3,567 ms for demo-20 at
  `--workers 1 --no-cache`); 249–755 ms per image when ten workers compete for memory bandwidth.
  arm-b′ §5 priced one tree at 1 MP at 200–450 ms. This is one tree at 0.09 MP, so per pixel the
  constant is roughly four times the proposal's estimate, and its 0.4–1.0 s figure for three channels
  at 1 MP is optimistic by about that factor. Nothing here has been optimised; the point is that the
  proposal's cost argument has not yet been earned.

# Perf pass 2: further speedup, still byte-identical

**Arm**: performance only, second pass. **Base**: `673daf8`. **Branch**: `worktree-agent-a45205a8465f41f46`.

**Result**: **1.20x** on algorithm CPU time against `673daf8` (three interleaved A/B runs: 1.21x,
1.14x, 1.20x, every one with non-overlapping spreads), with all 108 extractions byte-identical to
the base at every step. No algorithm was changed, nothing was downsampled or sampled, and no
computed quantity was approximated — charter §3 holds in full.

Five steps kept, **one reverted for measuring neutral** (§5). On top of `perf-pass`'s 1.55x the
compound figure from `4a5c37d` is ~1.86x, but the two passes were measured against different bases
on a machine whose load changed between them, so that product is an estimate and not a measurement.

`perf-pass`'s harness — the canonicalising dump, the 108-image gate corpus and the interleaved A/B
driver — is reused unchanged. The profiler and the two narrower measurement tools in `harness/` are
new and are the more transferable output of this arm (§6).

---

## 1. The gate

Identical to pass 1's, and run in full before every commit: extract the **complete**
`extractPaletteDetails` return value — all four role colours with their float `scores` and
`contrast` blocks, `support` provenance, `gradient`, `collapse`, `fieldTreatment`,
`gradientEvidence`, midpoint — canonicalise it with `NaN`/`±Inf`/`-0` encoded explicitly and keys
sorted, and diff it line by line against the base.

| Set | Count | Source |
|---|---|---|
| Panel artworks | 37 | `/Users/Flo/GitHub/palette/images/` (the real, gitignored corpus) |
| Scrambled decoys | 34 | same directory, `*-scrambled.*` |
| Off-panel artworks | 37 | `/Users/Flo/GitHub/palette/00…14/` caches, round-robin over all 15 shards |

**Every measurement and every gate run in this document used
`PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images`** — the real artwork, per the charter's
corpus-trap rule. The scrambled files are an extra stratum, never a substitute.

The worktree checked out at `bb979dc` (pre-`research/`) and was reset to `673daf8` before anything
else happened.

---

## 2. The profile at `673daf8` — pass 1's percentages were not reusable

Pass 1 warned that `--cpu-prof` misattributes in this codebase by more than 4x, so everything below
is direct `process.cpuUsage()` bracketing (`harness/instrument.mjs` + `harness/profile.mjs`), which
builds an instrumented *copy* of `research/v2-3` so the real tree stays pristine for the gate.
Instrumentation overhead is measured against the pristine tree's own bench in the same run: **0.8%**
for the table below.

Ten artworks: 340² gradient, 350² flat/busy, 500² degenerate, three 640² (gradient, flat/collapse,
flat/4-colour), two 700² (flat, flat/collapse), 1000² gradient, 1400² gradient.

| Function | incl% | self% | calls |
|---|---|---|---|
| `buildPaletteSeedDomain` | 63.9 | 3.0 | 10 |
| ├ `buildNativePaletteEvidence` | **23.5** | **23.5** | 10 |
| ├ `evaluateGradientFits` | 22.0 | 0.0 | 10 |
| │  ├ `nativeBandEvidence` | 10.6 | 10.6 | 52 |
| │  ├ `endpointBandRepresentatives` | 5.4 | 5.4 | 104 |
| │  ├ `domainPositions` | 3.1 | 3.1 | 52 |
| │  └ `fitGradients` | 3.0 | 3.0 | 10 |
| ├ `buildBackgroundFieldDomains` | 10.6 | 10.6 | 10 |
| └ `fieldMidpointEvidence` | 4.8 | 4.8 | 9 |
| `buildAlbumArtworkPaletteV2Phase3CommonBase` | 16.8 | 9.3 | 10 |
| ├ `discoverNativeFieldTransitions` | 7.5 | 0.3 | 10 |
| └ `computeRegionGraph` | 7.0 | 7.0 | 10 |
| `scorePaletteCandidates` | **13.7** | **11.9** | 30 |
| └ `evaluateTreatment` | 1.9 | 1.9 | 35243 |
| `selectWinner` | 4.0 | 1.2 | 10 |
| `materializeAlbumArtworkPaletteV2Phase3Descriptors` | 1.7 | 1.7 | 10 |
| `buildRoleEvidence` / `buildArtworkGamut` | 1.2 / 1.1 | — | 10 / 10 |

**The profile moved, exactly as pass 1 predicted.** `evaluateGradientFits` was pass 1's declared
leader at 36.6%; at `673daf8` it is 22.0% inclusive and **0.0% self** — it is now a dispatcher, and
attacking "it" means attacking one of its four children. The new leader is
`buildNativePaletteEvidence` at 23.5% self, which pass 1's §8 had at 22.9% and did not name as the
next target.

### Phase splits inside the two monoliths

Two functions are too long to act on as one number, so the profiler also supports flat stage marks
(`PHASES` in `instrument.mjs`, anchored on exact source prefixes — the build throws if an anchor
stops matching, which is how the reverted step 6 was caught before it could produce a wrong
profile). Measured after step 1, before step 2:

| Stage of `buildNativePaletteEvidence` | % of total |
|---|---|
| **component flood** (incl. `insertComponent`) | **14.5** |
| `toLabBuffer` | 3.5 |
| perceptual binning | 2.5 |
| family finalize | 2.2 |
| family accumulate | 1.7 |
| boundary scan | 1.0 |
| family anchors | 0.1 |

Measured after step 2:

| Stage | % of total |
|---|---|
| `nativeBandEvidence` **pixel loop** | **12.5** |
| `buildBackgroundFieldDomains` **domain BFS** | **7.3** |
| `buildBackgroundFieldDomains` corridor pairing | 1.1 |
| `nativeBandEvidence` setup / reduce | 0.3 / 0.0 |

That is the whole map this arm worked from: four blocks — the component flood, the band pixel loop,
the field-domain BFS, and the ranking — accounting for roughly half of runtime.

---

## 3. The steps that were kept

Each was gated over all 108 extractions before the next began; none deviated.

| # | Commit | Change | Gate | Measured |
|---|---|---|---|---|
| 1 | `e8ef38f` | Hoist per-candidate facts out of the `O(n²)` Pareto check | 108/108 | 1.07x pipeline, spreads non-overlapping |
| 2 | `f99f733` | De-allocate the per-component retention | 108/108 | 1.04x and 1.03x pipeline, two runs |
| 3 | `b8e0357` | Typed-array mode histogram in `nativeBandEvidence` | 108/108 | mechanism 808ms → 229ms (~5.4%) |
| 4 | `20e1faf` | Kill two per-pixel hash lookups in the field-domain BFS | 108/108 | frame 1.11–1.72x, pipeline 1.02–1.05x |
| 5 | `07ca5ee` | Memoise the two treatment keys per treatment | 108/108 | frame 1.21x, spreads non-overlapping |

### Step 1 — the Pareto check (`scorePaletteCandidates` 13.7% → 7.6%)

Pass 1 declined this one as "where a subtle ordering change would be most damaging and least
visible". The version that is safe is the one that changes no ordering at all.

`dominates` runs about 1.4M times per ranking pass (≈1175 candidates squared) and 30 passes happen
over ten artworks. Every one of those calls re-derived the same *per-candidate* quantities:
`utilityLevel(identityAuthorizedGain)`, `evidenceLevel(gamutCoverage)`, a four-element role array
allocated inside `sameFamilyAssignment`, and up to eleven string-keyed reads into `evidenceLevels`.
None of them depend on the pair. They are now computed once per candidate into a `DominationFacts`
record whose guarded levels live in a `Float64Array`.

The comparator sequence is untouched: same call order, same short-circuit points, same tie-breaks.
The only structural change is that the two former guard loops — `objectiveGuards` under
`"objective-terms"`, `WINNER_QUALITY_AXES` under `"declared-guards"` — had *identical shape* (walk,
return `false` on `<`, set `strictlyBetter` on `>`, return it), so they collapse into one indexed
loop over whichever vector the vocabulary selects. `OBJECTIVE_TERMS` still declares the vocabulary;
the facts record just reads it once.

Self-exclusion moved from `candidate !== evaluation` to an index compare, which is the same test
because every entry of `rawEvaluations` is a distinct object (one fresh `evaluateTreatment` result
each).

### Step 2 — the component retention (component flood 14.5% → 9.6%)

`insertComponent` is called once per connected component: **324,625 times over the ten-artwork set**,
~100k on one busy artwork. Each call spent roughly a hundred allocations — a concatenated candidate
array, two full copies, two `slice`s, two `map`s, two `Set`s, a `Map`, another concatenation, three
array literals per retained component for the `retainedFor` spread, and a spread into `splice`.

The policy is untouched: still the top 8 by `(population desc, start asc)` and the top 24 by
`(rolePreliminary desc, population desc, start asc)`, unioned, `retainedFor` in
connected-support-then-role-observation order, returned sorted by `(population desc, start asc)`.

The licence for replacing sort-then-slice with bounded selection is that **both rankings end in
`start`, which is unique per component**, so each comparator is a *total* order — with no ties,
`sort(compare).slice(0, k)` has exactly one possible answer, and any correct top-k reproduces it
element for element. `retainedFor` is rewritten only when its contents change, which nothing can
observe because every consumer reads it with `.includes`.

### Step 3 — the band mode histogram (the arm's largest single win)

`nativeBandEvidence`'s pixel loop ran one `Map.get` plus one `Map.set` **per pixel of every field
domain of every fit**. Replaced by linear-probed open addressing on two `Float64Array`s. Only the
argmax is ever read, under `(count desc, key asc)` — a total order over distinct keys — so the
table's slot order cannot show through any more than the `Map`'s insertion order could.

This is where the arm's measurement method had to change, and §6 explains why. The end-to-end A/B
gave 1.04x, 1.01x, 1.01x across three runs — unusable. The step was instead measured by **ablation
decomposition**: each arm is an interleaved 5-round A/B against *its own tree* with the one line
disabled.

```
Map version,   normal vs ablated:  10813 → 10005 ms   mechanism costs 808ms
table version, normal vs ablated:  10528 → 10299 ms   mechanism costs 229ms
control, the two ablated trees:    10637 vs 10304 ms  spreads identical
                                   (10058-10730 / 10059-10805)
```

The control is what makes the subtraction legitimate: the two ablated trees are the same program, and
they measure the same. Net ~579ms of ~10.8s, **~5.4%**.

### Step 4 — the field-domain BFS (`buildBackgroundFieldDomains` 10.6% → 9.4%)

The BFS visits every pixel of every candidate field domain, twice over (lane pass and composite
pass), and each visit did a `Map.get` + `Map.set` on the per-domain family tally plus a `Map.get` on
the artwork-wide component-start index. All three become typed-array indexing, with per-domain state
reset through its own order list so a reset costs what the domain touched rather than what the
artwork contains.

**`familyPopulationOrder` is load-bearing, not incidental.** `weightedFieldScore` reduces over the
tally in `Map` insertion order, so first-encounter order has to be preserved exactly or the low bits
move — the codebase already says so in a comment, and this change keeps it. The other two consumers
(`familyIds`, `componentIds`) sort by a total order over unique ids, so their order cannot show
through. The component lookup's `if (componentId)` truthiness test was a membership test only
because ids are `${familyId}-region-${start}` and so never empty; the `+ 1` offset carries the same
meaning into an `Int32Array`.

### Step 5 — the treatment keys (cleanest measurement in the arm)

`treatmentStructuralKey` sits **inside the comparator** of `orderedTreatments`' sort, so it ran twice
per comparison — `O(n log n)` eleven-element array builds and joins for `n` distinct answers, each
over a `completeTreatmentKey` — and then again once per evaluation for `structuralKey`. On top of
that, `extractPaletteDetails` ranks the same candidate array a second time for the coverage gate's
no-coverage reference pass, and `selectWinner` ranks a subset a third time, so every build was
repeated across passes as well. This is the "reference ranking doubles ranking cost" item from the
brief, fixed at the key rather than by memoising a ranking pass.

Both keys are pure functions of a deeply readonly `CompletePaletteTreatment`, so a `WeakMap` keyed on
the treatment object is invisible to every consumer — no assumption about array identity or
mutation is needed anywhere.

```
per-function A/B, 7 rounds interleaved
scorePaletteCandidates self   652 → 540 ms   1.21x   base 616-705  head 518-567   (non-overlapping)
share of pipeline            6.22 → 5.17 %
whole pipeline                              1.05x   base 10262-11711  head 9939-10564
```

---

## 4. Final benchmark

A/B **interleaved at process granularity** (A,B,A,B,…) so load drift is charged to both arms equally.
All figures are `process.cpuUsage()` (user+system), never wall clock. Arm A is a `git archive` of
`673daf8`; arm B is this branch. Three independent runs, 7 rounds each:

```
run 1                                          run 2          run 3
image             base    head  speedup
orelsan.jpg        738     612    1.21x
knuckles.jpg       845     585    1.44x
pureblack.jpg      207     103    2.01x
doja.jpg          1314    1107    1.19x
meteora.jpg        915     784    1.17x
toxicity.jpg      1062     790    1.34x
johns.jpg         1339     692    1.94x
ybbb.jpg           954     802    1.19x
horsley.jpg       1401    1220    1.15x
placebo.jpg       3970    3557    1.12x
-----------------------------------------
TOTAL            12644   10479    1.21x        1.14x          1.20x

spreads   base 12424-12996   head  9743-10739   (run 1, non-overlapping)
          base 12424-14029   head  9909-11608   (run 2, non-overlapping)
          base 12697-14113   head 10751-12332   (run 3, non-overlapping)
```

**Headline 1.20x; honest range 1.14–1.21x.** Per-image figures inside a single run are *not*
reliable — `pureblack` reads 2.01x in run 1 and 1.35x in run 3 — because the machine swung 10–20%
within runs. Only the totals, which are medians over seven interleaved rounds, are quoted.

Unlike pass 1, the speedup does **not** rise with image size: the largest artwork (`placebo`, 1400²)
is the *worst* case at 1.10–1.12x, and the mid-size candidate-heavy artworks (`knuckles`, `johns`,
`toxicity`) are the best at 1.26–1.94x. That is the expected shape: pass 1 removed per-pixel work,
which pays most on big images, while this pass removed mostly per-*candidate* and per-*component*
work, which pays most where the candidate and component counts are high relative to pixel count.

**Re-running on a quiet machine**, unchanged:

```
PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
  node research/v2-3-experiments/perf-pass/harness/ab.mjs <baseTree> <headTree> 7
```

---

## 5. Reverted: the band accumulator flattening

**Do not retry this.** It is byte-identical, it is arguably tidier, and it buys nothing.

`nativeBandEvidence` kept its twelve bands as an array of `{sum, sumSquares, count, modes}` records,
so the three sums were property stores on a boxed object once per domain pixel. The attempt replaced
them with three `Float64Array`s, rewrote the two downstream reductions as index loops in the same
order with the same operands, and additionally hoisted `evidence.pixelCount` and
`evidence.familyBinStep` out of the hot loop into locals.

Gate: 108/108 byte-identical. Then:

```
per-function A/B, 7 rounds interleaved
nativeBandEvidence self   1139 → 1124 ms   1.01x   base 1105-1171  head 1099-1219
share of pipeline        10.97 → 10.86 %   1.01x
whole pipeline                             1.01x
```

The spreads overlap almost completely, and this was the **most precise measurement in the whole
arm** — the base spread is ±3%, tighter than any other comparison here — so the neutrality is a
result, not an absence of one. V8 was already handling the monomorphic band records and the two
property loads as well as the typed arrays do. Reverted at `20e1faf`+`07ca5ee` state; the tree
carries no trace of it.

### Other things measured and then not built

- **Ablating the mode `Map` entirely** (probe, not a candidate change): 9889ms → 9358ms over three
  runs, i.e. 531ms / 5.4%. This is what sized step 3 before a line of the hash table was written, and
  it is why step 3 was worth building when the end-to-end A/B could not see it.
- **`Math.hypot` → `Math.sqrt(a*a+b*b+c*c)`** in the three per-pixel boundary loops. Not attempted:
  `Math.hypot` uses a different summation to avoid overflow, so this is float reassociation and
  forbidden. It is probably the single largest remaining win available to anyone who is *allowed* to
  move bits, and it should be recorded as such rather than rediscovered.

---

## 6. What this arm learned about measuring

This is the part most likely to matter to the next agent.

**Whole-pipeline A/B stopped being able to resolve the changes this arm makes.** With three sibling
arms on the machine, the base arm's own total swung 12424–14113ms across runs — 14% — while the
steps being tested were worth 1–5% each. Steps 3 and 4 both measured 1.01x end-to-end and are both
real. A neutral end-to-end reading, on this machine, at this effect size, carries almost no
information.

Two narrower instruments were built, and both are in `harness/`:

- **`ab-function.mjs`** — same interleaved A/B, but it instruments both trees and compares only the
  `process.cpuUsage()` bracket around the function that was actually edited, plus that frame's
  **share of its own process's pipeline total**. The share is the number to read when absolute
  spreads overlap: a busy round inflates the frame and the total together, so their ratio is far
  steadier than either. It also prints the whole-pipeline total, so a change that speeds its own
  function up while slowing something else down cannot hide.
- **Ablation decomposition** (§3) — measure the *mechanism* by A/B-ing each tree against itself with
  the mechanism disabled, then compare the two mechanism costs, with a control confirming the two
  ablated trees are indistinguishable. This gives a clean number even when the trees themselves
  cannot be told apart end-to-end.

The corresponding discipline: **a step is kept only if a narrow measurement is clearly separated,
and reverted if the narrowest available measurement is not** — which is exactly how step 5 (frame
spreads non-overlapping, kept) and step 6 (frame spreads overlapping at ±3% precision, reverted)
were decided. Steps 1 and 2 predate the tooling and were carried on repeated whole-pipeline runs with
separated medians; if anything they are the *weakest*-evidenced kept steps in the arm, and step 2 at
1.03–1.04x is the one to re-examine first if the total is ever re-measured and comes up short.

---

## 7. Verification

- **Typecheck** (`tsc -p research/v2-3/tsconfig.json`): clean after every step.
- **Byte-identity gate**: 108/108 at every one of the five kept steps and at the reverted candidate.
  Final head re-checked against the `673daf8` baseline: **108/108, 0 differing**.
- **Determinism across two processes**: the final tree dumped again from a fresh process and diffed
  against the earlier dump — **108/108 identical**.
- **`parity.test.ts`**: **39/39 pass**, including "a real artwork extracts identically twice" and
  "the contrast hard minimum is a live parameter whose default is inert".
- **`architecture.test.ts` + `configuration.test.ts`**: **12/12 pass** — runtime imports still closed
  inside `research/v2-3/`, no fixture identity in runtime code, reviewed ranking/gamut/identity
  constants unchanged, the ten pervasive-cliff constants unchanged, APCA hard minimum still defaults
  to 0 (charter rule 2).

Commits are signed off with `commit.gpgsign=false` for this session only (pass 1 was blocked by a
1Password SSH agent failure at exactly this point; the repo configuration was not modified).

**Residual risk.** The gate is empirical, not a proof. The changes most worth re-examining if a
divergence ever appears, in order:

1. **`selectTopComponents`** (step 2) — its equivalence to `sort().slice()` rests on both comparators
   being total orders, which rests on `start` being unique per component. That is true because the
   flood enters each component at exactly one pixel, but it is an invariant of the *caller*, not of
   the function.
2. **`BandModeTable`** (step 3) — the hash reduces keys modulo 2³² before mixing, so two keys
   differing only above 2³² share a bucket. That costs a probe and nothing else (slot comparison is
   on the full `Float64Array` value), but it is the kind of thing that is only obviously safe once
   stated.
3. **The `retainedFor` skip** (step 2) — leaving an equal array in place is invisible only for as
   long as no consumer mutates it or compares its identity. All current consumers use `.includes`.

---

## 8. Where the remaining time goes

Final profile of this branch, same ten artworks, same method:

| Frame | self% |
|---|---|
| `buildNativePaletteEvidence` | 21.9 |
| ├ component flood | 10.1 |
| ├ `toLabBuffer` | 3.8 |
| ├ perceptual binning | 2.8 |
| └ family finalize | 2.5 |
| `buildAlbumArtworkPaletteV2Phase3CommonBase` | 12.6 |
| `nativeBandEvidence` | 10.8 |
| └ pixel loop | 10.5 |
| `buildBackgroundFieldDomains` | 9.4 |
| └ domain BFS | 8.1 |
| `computeRegionGraph` | 8.3 |
| `endpointBandRepresentatives` | 6.7 |
| `scorePaletteCandidates` | 5.5 |
| `fieldMidpointEvidence` | 5.2 |
| `domainPositions` / `fitGradients` | 3.8 / 3.7 |
| `evaluateTreatment` (35243 calls) | 2.3 |

The pipeline is now dominated by genuine full-resolution per-pixel arithmetic. The remaining
structural candidates, in the order I would take them:

1. **`buildAlbumArtworkPaletteV2Phase3CommonBase`'s own 12.6%** — the largest unexamined block in the
   pipeline. Nothing in this arm looked inside it; it needs a phase split before anyone acts on it.
2. **`endpointBandRepresentatives`' per-family walk** (6.7%, 104 calls) — still the single-pass
   rewrite pass 1 declined. Its per-family `spread` accumulator and `distance < exemplarDistance`
   first-wins exemplar tie-break depend on per-family visit order; a dispatching single pass must
   reproduce that order exactly, which is a real proof obligation, not a refactor.
3. **`computeRegionGraph`** (8.3%) — untouched by both passes.
4. The component flood's remaining 10.1%, which after step 2 is mostly the raw four-neighbour walk
   and `Math.hypot` on boundary edges. Without permission to reassociate floats there is not much
   left in it.

---

## 9. Proposed for human review

**Nothing.** This arm changed no algorithm and produced no output difference on any of 108 artworks,
so there is no palette for a human to adjudicate. It needs an *integration* decision, not a review
batch. The diff touches `palette-core.ts` and `winner-scoring.ts`, both hot files that other arms are
likely editing, so it should land before those arms rebase onto them.

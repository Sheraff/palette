# Perf pass: faster extraction, byte-identical output

**Arm**: performance only. **Base**: `4a5c37d`. **Branch**: `worktree-agent-a3168845499f6798a`.

**Hypothesis**: the v2-3 extraction pipeline spends a large fraction of its time on work that is
either literally repeated (the same pure function called twice on the same input) or on allocation
churn inside per-pixel loops — neither of which is part of the algorithm. Removing both should be a
meaningful speedup at *strictly* identical output.

**Result**: **1.55x** on algorithm CPU time (A/B interleaved, 5 rounds), with every one of 108
extractions byte-identical to the base at every step. No algorithm was changed, nothing was
downsampled or sampled, and no computed quantity was approximated (charter §3).

---

## 1. What "byte-identical" means here, and how it was enforced

The gate is not the four winner hexes. Every step was verified by extracting the **complete
`extractPaletteDetails` return value** — all four role colours with their full float `scores` and
`contrast` blocks, their `support` provenance records, `gradient`, `collapse`, `fieldTreatment`,
`gradientEvidence` and the midpoint descriptor — canonicalising it and comparing the whole thing
byte-for-byte against the base.

Canonicalisation (`harness/dump.ts`) deliberately does **not** use plain `JSON.stringify`: that maps
`NaN`/`±Infinity` to `null`, which would hide exactly the numeric drift the gate exists to catch.
Non-finite values and `-0` are encoded explicitly, and keys are sorted so a refactor that merely
reorders object literals cannot read as a false failure.

**Gate corpus — 108 images, stated per the charter's corpus trap rule:**

| Set | Count | Source |
|---|---|---|
| Panel artworks | 37 | `/Users/Flo/GitHub/palette/images/` (the real, gitignored corpus — **not** the worktree decoys) |
| Scrambled decoys | 34 | same directory, `*-scrambled.*` |
| Off-panel artworks | 37 | `/Users/Flo/GitHub/palette/00…14/` sample caches, round-robin over all 15 shards |

Every measurement and every gate run in this document used `PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images`,
i.e. the **real artwork**. The scrambled files are included as an additional stratum (they stress
different code paths — flat histograms, no spatial structure), not as a substitute.

The base line was captured twice, from two separate processes, once before any edit and once from a
`git stash`-cleaned tree. The two were identical, which simultaneously (a) proved the baseline was
genuinely pre-edit and (b) confirmed cross-process determinism at the base.

---

## 2. Profiling: the sampling profiler was wrong, and it mattered

`node --cpu-prof` over 10 representative artworks reported:

```
51.4%  buildRegionGraph            (self)
32.5%  buildBackgroundFieldDomains (self)
```

Direct `process.cpuUsage()` instrumentation around those exact two functions, on the same 10
artworks, reported **12.3%** and **10.3%**. The two disagree by more than 4x.

Direct instrumentation is ground truth here — it brackets the exact call and reads the OS's own
accounting for the process — so the whole optimisation plan was rebuilt on it. Had I trusted the
sampler I would have spent the arm on two functions worth ~22% combined while the actual leader,
`evaluateGradientFits` at 36.6%, never appeared in the sampler's top list at all.

**Phase breakdown at base (10 artworks, `process.cpuUsage`, % of total extraction CPU):**

| Phase | Base |
|---|---|
| `buildPaletteSeedDomain` | **65.2%** |
| ├ `evaluateGradientFits` | **36.6%** |
| │  ├ `nativeBandEvidence` (52 calls) | 15.6% |
| │  ├ `endpointBandRepresentatives` (104 calls) | 9.5% |
| │  ├ `fieldMidpointEvidence` (52 calls) | 9.2% |
| │  └ `fitGradients` | 2.1% |
| ├ `buildNativePaletteEvidence` | **17.9%** |
| └ `buildBackgroundFieldDomains` | 8.7% |
| `buildCommonBase` | 15.1% |
| `supportedGradientPath` | 5.9% |
| `scorePaletteCandidates` (reference + main) | 7.6% |
| everything else | ~6% |

`buildRegionGraph` accounts for 12.9% and spans both `buildCommonBase` and `supportedGradientPath`.

---

## 3. The steps

Each step was gated over all 108 extractions before the next began. A deviation anywhere would have
reverted the step; none occurred.

| # | Commit | Change | Gate | Cumulative A/B |
|---|---|---|---|---|
| 1 | `26e67b3` | Field-domain BFS: kill the per-neighbour `[a,b].sort().join(":")` adjacency key, the per-pixel `labAt` tuples, and the `Set<string>` lane probe | 108/108 identical | 1.06x |
| 2 | `460ec6d` | Evaluate each fit's pixel geometry **once** into a `Float64Array` instead of once per consumer per band per family | 108/108 identical | 1.18x |
| 3 | `ed83f0c` | Build the region graph once per extraction instead of twice | 108/108 identical | — |
| 4 | `2975043` | Region flood + boundary scan: unroll neighbour probes, drop per-pixel arrays, pack the edge Map key | 108/108 identical | 1.42x |
| 5 | `f32daef` | Defer each fit's field-midpoint evidence to its first reader | 108/108 identical | — |
| 6 | `ba76441` | Native evidence: inline `rgbToOKLab` into `toLabBuffer`, add `quantizedKeyOf`, de-allocate the adjacency scan | 108/108 identical | 1.38x |
| 7 | `45d091e` | Stop the consumer's destructuring from forcing the deferred midpoint; de-allocate `nativeBandEvidence` | 108/108 identical | 1.52x |
| 8 | *(staged, see §7)* | De-allocate the connected-component flood | 108/108 identical | 1.55x |

Cumulative figures are each vs. the `4a5c37d` base. Steps 1–7 were measured at 3 interleaved rounds
and step 8 at 5; on a loaded machine the round-to-round noise is roughly ±0.05x, so **individual
step attributions are not reliable to better than that** — the 1.38x at step 6 sitting below the
1.42x at step 4 is noise, not a regression. Only the final 5-round number is quoted as the result.

### The two findings worth naming

**Redundant recomputation, twice over.** `buildRegionGraph` floods the entire image into connected
regions and was called once by `discoverNativeFieldTransitions` and once by
`discoverSupportedNativeFieldTransitionPaths` — both on `common.evidence.native`, the same object.
Instrumenting both call sites confirmed identical inputs and identical outputs (same pixel count,
same node count) on every artwork probed. Memoising on the evidence object removes the second flood.
Separately, every consumer of a `GradientFit` was rebuilding the same per-pixel `fit.position`
vector from scratch — and `endpointBandRepresentatives` rebuilt it once per pixel *per candidate
family per band*.

**A lazy field that wasn't lazy.** Step 5 made `fieldMidpoint` a memoised getter, because its only
reader discards most fits before looking at it. Step 7's instrumentation showed it still firing 52
times out of 52 — the reader destructured `fieldMidpoint` in the `for...of` header, which reads the
property *before* the guard on the next line runs. Moving the read past the guard took it from 52
calls to 9. **The lesson: a laziness change must be verified by call count, not by inspection** —
step 5 alone bought nothing, and the commit history says so.

---

## 4. Final benchmark

A/B **interleaved at process granularity** (A,B,A,B,…) so machine-load drift is charged to both arms
equally — necessary because the development machine was running a background sweep and three
sibling agents throughout. All figures are `process.cpuUsage()` (user+system), never wall clock.
Arm A is a pristine `git archive` of `research/v2-3` at `4a5c37d`; arm B is this branch.

```
rounds=5   algorithm CPU time only, decode excluded
image             base ms    head ms   speedup
orelsan.jpg          1091        780     1.40x    340x340,  gradient
knuckles.jpg         1217        876     1.39x    350x350,  flat, busy
pureblack.jpg         299        200     1.49x    500x500,  degenerate
doja.jpg             2035       1454     1.40x    640x640,  gradient
meteora.jpg          1524       1004     1.52x    640x640,  flat, collapse
toxicity.jpg         1912       1117     1.71x    640x640,  flat, 4-colour
johns.jpg            1686       1125     1.50x    700x700,  flat
ybbb.jpg             1567        925     1.69x    700x700,  flat, collapse
horsley.jpg          2160       1448     1.49x   1000x1000, gradient
placebo.jpg          7152       4284     1.67x   1400x1400, gradient, largest
-----------------------------------------------
TOTAL               20687      13347     1.55x

base spread: 20398-21273ms      head spread: 13071-13557ms
```

The two spreads do not overlap. Speedup rises with image size (1.39–1.49x on the small end,
1.67–1.71x on the large end), which is what a change that removes per-pixel work should look like.

**Decode is not the bound.** Over the same 10 artworks, sharp decode totals **61.6ms** against
12556ms of algorithm — **0.49%** of current runtime, 0.30% of base runtime. Decode dominating was a
real possibility worth ruling out; it does not. Essentially all extraction time is addressable, and
a hypothetical infinitely-fast algorithm would still pay only those 62ms.

**Re-running on a quiet machine**: `node research/v2-3-experiments/perf-pass/harness/ab.mjs <baseTree> <headTree> 5`
with `PALETTE_IMAGES_ROOT` set. The script takes no load-dependent tuning; the same command
reproduces the table.

---

## 5. Sweep economics

At 1.55x, a corpus-wide sweep of 7,550 artworks that took ~4h drops to ~2h35m on the same hardware.
That is a real improvement but it is **not** the 2x+ that would transform sweep economics, and it
should not be planned around as if it were.

---

## 6. Correctness risks I decided NOT to take

Byte-identity was treated as an absolute constraint, so several visibly profitable optimisations were
left on the table:

- **Any float reassociation.** `weightedFieldScore` reduces over a Map in insertion order;
  `localStepSum`, `boundaryContrastSum` and the region centroid sums accumulate in raster/queue
  order. Vectorising or reordering any of them is an easy double-digit win and *will* move the low
  bits. Every rewritten loop keeps its original operand order, and the family-population Map was
  re-keyed from id to index only after confirming the insertion sequence is unchanged.
- **`Float32Array` for the position cache.** A 32-bit cache would halve its memory and improve
  locality, but `fit.position` returns a double and the consumers compare it against thresholds
  (`<= 0.2`, `>= 0.8`, the midpoint band). Truncation would flip band membership for pixels near a
  boundary. The cache is `Float64Array`.
- **Skipping, rather than deferring, the field midpoint.** The obvious version of step 5 computes
  `fieldMidpoint` only when `rejectionReasons.length === 0 && low && high`, storing `null` otherwise.
  That is observationally identical *today* because the sole reader skips rejected fits — but it
  bakes the reader's guard into the producer, and a future second reader would silently get `null`.
  The memoised getter always answers with the true value; only the timing changed.
- **Down-scoping `endpointBandRepresentatives` to a single pass.** It still walks the domain once
  per candidate family (now ~5.6%). A single dispatching pass would collapse that to one walk, but
  the per-family `spread` accumulator and exemplar tie-break (`distance < exemplarDistance`, first
  wins) depend on per-family visit order, and I was not confident enough of preserving it exactly to
  spend the remaining budget there.
- **Touching `scorePaletteCandidates`' O(n²) Pareto check** (`rawEvaluations.some(dominates)` inside
  a map over `rawEvaluations`). The reference and main rankings share their `orderedTreatments` sort
  and wave-1 selection, so memoisation is available. Combined they are only ~7.6%, and the ranking is
  the part of the pipeline where a subtle ordering change would be most damaging and least visible.
  Left alone deliberately.
- **Anything touching the algorithm.** No downsampling, no sampling, no early-exit on a computed
  quantity, no tolerance changes. Charter §3 is respected in full: every quantity that was computed
  at full resolution before is still computed at full resolution.

**Residual risk.** The gate is empirical, not a proof. It covers 108 artworks across three strata
and every code path they exercise, but a rewritten loop could in principle diverge on an input shape
none of them hits — a 1-pixel-wide image, a single-family artwork, an unusual family count near the
`Uint16` bound. The packed pair keys (`first * stride + second`) are exact for all reachable sizes
(family and node counts stay well inside float53), but they are the change I would re-examine first
if a divergence ever appeared.

---

## 7. State, verification, and one blocker

Typecheck (`tsc -p research/v2-3/tsconfig.json`) clean after every step. `architecture.test.ts` and
`configuration.test.ts`: **10/10 pass** — runtime imports still closed inside `research/v2-3/`, no
fixture identity in runtime code, all reviewed ranking/gamut/identity constants unchanged, APCA hard
minimum still defaults to 0.

Determinism: the same 12 artworks extracted from two separate processes produce identical output.

**Blocker**: step 8 is verified (typecheck, 108/108 byte-identical) and **staged**, but could not be
committed — the repo signs commits via a 1Password SSH agent that began returning
`1Password: failed to fill whole buffer` partway through the session and did not recover across
~10 minutes of retries. Steps 1–7 committed normally before it broke. The step-8 diff is saved at
`/private/tmp/claude-501/-Users-Flo-GitHub-palette/2d8a3e49-2318-473b-9279-101460766337/scratchpad/step8-verified.patch`
and the working tree matches it exactly. **Unlocking 1Password and re-running
`git commit -F <message>` completes it**; I did not disable commit signing, since that is a repo
configuration decision rather than mine to make.

---

## 8. Where the remaining time goes

For whoever picks this up next (10 artworks, post-change, `process.cpuUsage`):

| Phase | Share now |
|---|---|
| `buildNativePaletteEvidence` | 22.9% |
| `evaluateGradientFits` | 21.5% |
| ├ `nativeBandEvidence` | 10.4% |
| ├ `endpointBandRepresentatives` | 5.6% |
| ├ `domainPositions` | 3.0% |
| └ `fitGradients` | 2.5% |
| `buildBackgroundFieldDomains` | 9.8% |
| `fieldMidpointEvidence` (now 9 calls, was 52) | 3.6% |
| `buildCompletePaletteTreatmentDomain` | 1.5% |

The pipeline is now dominated by genuine full-resolution work rather than by allocation or repeated
computation. The next real wins are structural — the single-pass `endpointBandRepresentatives` above,
and `insertComponent`, which re-sorts and re-allocates a family's retained component list on every
one of the ~100k components a busy artwork produces.

## 9. Proposed for human review

**Nothing.** This arm changed no algorithm and produced no output difference on any of 108 artworks,
so there is no palette for a human to adjudicate. It needs an *integration* decision, not a review
batch: the diff touches three hot files (`palette-core.ts`, `field-transition.ts`, `color.ts`) and
should land before other arms rebase onto them, since it rewrites the interiors of loops those arms
may also be editing.

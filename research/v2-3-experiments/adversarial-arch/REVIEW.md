# Adversarial architecture review — `research/v2-3/`

Scope: architecture, footguns, and blockers to future progress. Ranked by **expected impact on
iteration velocity**, not by severity of any single defect. No fix is applied and
`research/v2-3/` is untouched (`git status --porcelain research/v2-3` is empty). Probes live in
this folder and are runnable.

Base: `research/palette-0.9-checkpoint` @ `4b0ffdf` (contains `d5f2003`).

> **Status.** The behaviour-preserving findings were executed as a hygiene wave — see
> [`HYGIENE.md`](./HYGIENE.md) for what changed and the byte-identity evidence.
>
> | finding | status |
> | --- | --- |
> | F1 corpus / results reproducibility | **done** (single `PALETTE_IMAGES_ROOT`, documented setup; `.gitignore` deliberately untouched — the artworks are copyrighted) |
> | F2 recomputation | **done** (a–b–d; the all-lane pass removal was independently re-verified before deleting) |
> | F3 three winner stages | **partly** — the two 0.12 constants are unified and the two-baseline gate is documented; the stage-attribution diagnostic is not built |
> | F4 salience shadowing | **done** (wave-1 path deleted, winner axis renamed `renderedFieldClaim`) |
> | F5 axis vocabularies / weight vectors | **partly** — the unread `qualityGuard.blocks` and the duplicated block list are gone; the two weight vectors are pinned by a test but not renamed |
> | F6 duplicated constants | **done** |
> | F7 flag surface | **done** (six dead flags deleted, `configuration.test.ts` pins the rest; the mutual-exclusion trap is unreachable now that the dead half is gone) |
> | F8 `endpointBandSpread` absent≡zero | **not done** — behaviour-affecting, owned elsewhere |
> | F9 candidate-set-dependent quality | **partly** — `gradientExpected` is documented at `renderedFieldClaimScore`; the argument is not yet required |
> | F10 eval cache never invalidated | **not done** |
> | F11 positional fixture tuples | **not done** |
> | F12 determinism on the emergency path | **done** (`orelsan.jpg` runs twice) |
> | F13 monolithic parity test | **done** (34 named subtests, full-palette diff on failure) |
> | F14 untested behaviour | **partly** — flags and the APCA parameter are covered; decode options and representativity are not |
> | F15 `palette-core.ts` split | **not done** — deliberately, it is a merge-throughput investment that needs a quiet window |
> | F16 naming ceremony | **not done** — same reason |
Inputs read: `research/v2-3-eval/TRACK_CHARTER.md`, the five `EXPERIMENT.md` files from
`worktree-agent-add3a333983c3a97c` (A), `-a8b3119dd1877e6fd` (B), `-a673a81d27c21f415` (C),
`-a88c1728c048702b4` (D), `-a19f4e1145dd214d3` (E), and the `research/v2-3/` + `research/v2-3-eval/`
sources.

## Probes

| probe | what it measures |
| --- | --- |
| `stage-timing.ts` | seed / common-base / rest split of `extractPaletteDetails` |
| `duplicate-work.ts` | the two provably-redundant recomputations, in ms and as a share of total |
| `profile-run.ts` + `cpuprof-summary.ts` | `--cpu-prof` self time and **per-call-site** subtree totals |
| `spread-census.ts` | how many gradient candidates carry a measured `endpointBandSpread` vs a structural zero |

All were run against the 34-artwork corpus copied in from the main checkout (see F1 — they are not
in the worktree).

---

# Tier 1 — blockers that tax every arm

## F1. A fresh worktree cannot run the algorithm, and no reviewed result set is reproducible

**Evidence.**

- `.gitignore:22-27` ignores `*.jpg`, `*.png`, `*.avif` and then re-includes **only**
  `*-scrambled.*`. `git ls-files images` returns 34 files, all scrambled diagnostics; **zero of the
  34 authoritative artworks are tracked**. The numbered off-panel sample directories (`/00/` … `/14/`,
  `/music-artworks/`) are ignored outright.
- `research/v2-3/test/parity.test.ts:91` resolves `reviewCase.source.file` (`images/artofficial.jpg`, …)
  against the package root with no environment override. In any fresh worktree the parity test —
  the single gate the charter names — fails at the first `readFile` with `ENOENT`.
- `node_modules` is gitignored too, so it does not exist in a worktree either. The charter's mandated
  verification command — `node_modules/.bin/tsc -p research/v2-3/tsconfig.json`, a *relative* path —
  therefore fails with "no such file or directory" in every worktree. It only appears to work because
  Node's runtime resolution walks up to the main checkout's `node_modules`, which `tsc`'s explicit
  relative path does not. (This review typechecked via
  `/Users/Flo/github/palette/node_modules/.bin/tsc` — the same undocumented workaround each track had
  to find.)
- `research/v2-3-eval/.gitignore` ignores `data/results/`. The directory does not exist at `4b0ffdf`.
  Every one of the 17 label pairs recorded in `research/v2-3-eval/data/verdicts.jsonl`
  (`v2-2`/`trunk-a5`, `trunk-d-c3`/`c-alt-r4`, `trunk-dca4`/`trunk-c4b`, …) refers to a result set that
  exists nowhere in the repository. `diff-report.ts` and `make-batch.ts` both read from
  `data/results/`, so neither can be re-run for any historical comparison.

**What it already cost.** Four tracks independently worked around the same thing, four different
ways: `PALETTE_IMAGES_ROOT` (A), `TRACK_C_IMAGES_ROOT` with a silent fallback to the main checkout (C),
`PALETTE_IMAGE_ROOT` defaulting to `/Users/Flo/github/palette/images` (D), and a hardcoded
`/Users/Flo/GitHub/palette/` (E — note the differing capitalisation, which is only survivable on a
case-insensitive filesystem). Track B's headline neutrality claim ("94 compared, 0 mismatched against
the cached `trunk-a5` JSONs") is not reproducible by anyone else, because `trunk-a5` is not in the
repository.

**Direction.**
1. One resolution helper shared by `research/v2-3/test/`, `research/v2-3-eval/src/shared.ts`, and
   track probes: `$PALETTE_IMAGES_ROOT` if set, else `images/` relative to the repository root, else
   the main checkout. One name, one precedence, documented in the charter. This is a test/tooling
   change, not a runtime change, so the architecture test's import-closure rule is unaffected. Do the
   same for the typecheck command in the charter (`npx tsc`, or a documented absolute path).
2. Decide explicitly whether `data/results/` is disposable cache or review provenance. The verdict
   warehouse is self-contained by design (README §Warehouse), but the *labels it cites* are not
   resolvable — so today it is provenance with a dangling pointer. Cheapest fix: commit the result
   JSONs for labels referenced by any committed batch or verdict (they are small, deterministic, and
   already byte-stable by design), and keep `data/results/` ignored for scratch labels only.

## F2. ~45 % of every extraction is recomputation; the placebo case is 16 s, not 5 s

The 34-fixture parity run on this trunk takes **210 s** (`3:30`, 4/4 passing, measured on this
machine) — 6.2 s per artwork, against the README's stated "~5 s". Item (a) below is ≈ 23 % of that,
so roughly **48 seconds of every parity run is a pure recomputation of a pure function on an
argument it was already given**.

Measured (`duplicate-work.ts`, `stage-timing.ts`, `cpuprof-summary.ts`):

| image | total ms | redundant re-discovery | share |
| --- | ---: | ---: | ---: |
| placebo.jpg (1.96 MP) | 16 567 | 3 826 | 23 % |
| birdsofprey.jpg (1.00 MP) | 5 814 | 466 | 8 % |
| loups.jpg (0.25 MP) | 2 343 | 536 | 23 % |
| knuckles.jpg (0.12 MP) | 1 371 | 28 | 2 % |
| black.jpg (0.65 MP) | 936 | 269 | 29 % |

**(a) Strictly redundant — same pure function, same argument object.**
`buildPaletteSeedDomain` (`palette-core.ts:3872-3873`) computes
`buildBackgroundFieldDomains(evidence)` then `evaluateGradientFits(evidence, fieldDomains)`, and
returns `evidence` unchanged. `buildAlbumArtworkPaletteV2Phase3CommonBase` then does
`const native = seed.evidence` (`candidate-domain.ts:244`) and calls
`diagnoseGradientFits(native)` (`candidate-domain.ts:247`), whose body is exactly
`gradientFitDiagnostics(evaluateGradientFits(evidence, buildBackgroundFieldDomains(evidence)))`
(`palette-core.ts:2429-2432`). Same object, same pure functions, and only the *diagnostic
projection* of the result survives. The `--cpu-prof` per-call-site split confirms it:

```
evaluateGradientFits: 2 call-tree node(s)
   6383 ms  37.6%  extractPaletteDetails > buildPaletteSeedDomain > evaluateGradientFits
   2630 ms  15.5%  extractPaletteDetails > buildAlbumArtworkPaletteV2Phase3CommonBase >
                     diagnoseGradientFits > evaluateGradientFits
   9013 ms  53.1%  TOTAL
buildBackgroundFieldDomains: 1258 ms + 762 ms = 2020 ms (11.9 %)
```

**(b) A second full discovery pass on widened evidence.** Inside `buildPaletteSeedDomain`,
`evidenceWithAllRankedLanes` (`palette-core.ts:3567`) rebuilds every lane with *all* families instead
of the bounded 12/16, then re-runs `buildBackgroundFieldDomains` and `evaluateGradientFits` over it
(`palette-core.ts:3887-3893`). Its only consumer is `buildSourceRegistry`'s `allProposals` argument,
which populates `registry.fieldHypotheses` and `registry.fieldDirections` for source-lineage
validation. By subtraction on placebo (seed 8 561 ms − control discovery 3 826 ms − 
`buildNativePaletteEvidence` 868 ms − treatment domain 30 ms − seed additions 28 ms) it costs
≈ 3 800 ms, ≈ 23 % of the run. Note the profiler merges both call sites in `buildPaletteSeedDomain`
into one node, which is why the split is by subtraction rather than direct.

**(c) The candidate domain is scored twice.** `extractPaletteDetails` scores the full domain
(`palette.ts:347`), then `selectSourceEligibleWinner` re-scores the eligible subset from scratch
(`winner-selection.ts:35`). Measured 46–296 ms, 2–7 %. Small, but see F3 — the cost is
comprehension, not milliseconds.

**(d) Per-pixel string comparison in the hottest loop.** `endpointBandRepresentatives`
(`palette-core.ts:2179`) filters with
`evidence.families[evidence.familyAt[pixelIndex]].id !== family.id` — a double array indirection and
a string compare, per pixel, per selected family, per fit, when `familyAt` already holds the family's
array index. The enclosing arrow function is 1 183 ms self time (7.0 %) on placebo, the third hottest
frame. `nativeBandEvidence` (2 319 ms, 13.7 %), `position` (940 ms), `okDistance` (934 ms),
`endpointBandRepresentatives` itself (732 ms) and `fieldMidpointEvidence` (590 ms) are all
full-domain pixel walks repeated per fit; roughly 40 % of runtime is in this family of loops.

**Direction, cheapest first.**
1. Thread the `EvaluatedGradientFit[]` (or its diagnostics) that `buildPaletteSeedDomain` already
   computed through `PaletteSeedDomain`, and have `buildAlbumArtworkPaletteV2Phase3CommonBase` read it
   instead of calling `diagnoseGradientFits`. ~20 % of runtime for a plumbing change.
2. Fix `palette-core.ts:2179` to compare the integer family index.
3. Only then consider making the all-lane pass lazy (it is only consulted for hypotheses that
   actually back a candidate treatment) — that one is genuine work, not duplication, and deserves its
   own measurement.

**How review-preservation is verified for all three.** (1) and (2) are behaviour-preserving by
construction — (1) substitutes a value for a recomputation of the same pure function on the same
argument, (2) replaces a string equality with the integer equality that generated the string. Both
must still be proved, not argued: run `research/v2-3-eval/run-corpus.ts --algo v2-3 --label
<before>` then `--label <after> --force` over the full 34-artwork corpus *plus* the off-panel sources,
and require `diff-report.ts` to report `0 differ` — and additionally require the cached
`extraction` JSON blobs to be **byte-identical**, not merely equal on the four hexes, since
`researchRender` and the midpoint carry provenance the diff does not print. Any refactor of (3) needs
the same sweep and should be treated as behaviour-changing until the sweep says otherwise.

## F3. Three winner stages, two comparators, two baselines — and the ranked list is not the answer

The pipeline picks a winner three times:

1. `scorePaletteCandidates` over the full materialized domain (`palette.ts:347`) → `scored.winner`.
2. `selectSourceEligibleWinner` re-scores the **source-eligible subset** from scratch and takes *its*
   frontier head (`winner-selection.ts:35-46`); the full-domain result is used only as the envelope
   reference (`winner-selection.ts:51-53`).
3. `selectWinner` builds transition candidates and, if any survive, replaces the winner with
   `transitionCandidates[0]` ordered by `compareTransitionCandidates` — a **different comparator**
   that ranks `decisiveCoverage` and `totalObligationCoverage` above every quality term
   (`palette.ts:87-100, 137-154`).

Consequences a future agent will hit:

- **A diagnostic that dumps `scorePaletteCandidates`' ranking does not contain the shipped winner**
  whenever stage 3 fires. Track A lost a round to exactly this: *"This also explains why the ranked
  list in `diagnose.ts` does not contain the final output."* Any new arm that builds a ranking probe
  will rediscover it.
- **The promotion envelope is checked twice against different baselines.**
  `evaluateTransitionCandidates` compares `promotionEnvelopeUtility(evaluation)` against the
  *source-eligible* winner (`transition-promotion.ts:85-86`, fed `transitionInput = {...input.scored,
  winner: sourceWinner}` at `palette.ts:126`), while `selectWinner` re-filters against the
  *unrestricted* winner (`palette.ts:151-152`). Nothing states that both must hold. Track A's
  birdsofprey restoration turned on a 0.0016 margin against this budget; a future agent adjusting it
  will very plausibly change one site and not the other.
- The budget itself is defined twice: `MAXIMUM_WINNER_QUALITY_LOSS = 0.12`
  (`transition-promotion.ts:15`) and `WINNER_SCORING_POLICY.maximumQualityLoss = 0.12`
  (`winner-scoring.ts:313`), used at three call sites across two files.

**Direction.** Do not restructure the stages — they encode reviewed behaviour. Do two cheap things:
give `extractPaletteDetails` a debug-only return of the *stage that decided* plus each stage's head,
so probes can report "stage 3 promoted X over stage 2's Y"; and collapse the two 0.12 constants into
one exported symbol with a comment naming both gates. Neither changes output; verify with the
byte-identical sweep of F2.

---

# Tier 2 — footguns that will each cost a round

## F4. The same axis name carries a different value at two stages

`palette-quality.ts:126-134` `renderedGradientSalience` returns **1** for a `not-applicable` flat.
`winner-scoring.ts:516-538` `renderedFieldClaimScore` overrides the same axis key to **0** for
everything that is not `earned-rendered`. Both write the key `renderedGradientSalience`.

This is not hypothetical. Track A's revision note documents the exact failure: *"I verified the
standalone function and not the override … My first fix therefore doubled a pro-gradient bonus while
claiming to remove an anti-gradient bias, and it promoted a reviewed-strong flat (`nada`) to a
gradient."* An entire arm was measured, reviewed and retracted on this one shadowing.

**Direction.** Rename the winner-level axis to what it is (`renderedFieldClaim`), keeping the
wave-1 name for the wave-1 quantity. Pure rename, verified by the byte-identical sweep.

## F5. Four axis vocabularies and two weight vectors for "the same" quality

| where | axes | naming |
| --- | --- | --- |
| `base-scoring.ts:9-19` `QUALITY_AXES` | 9 | `foregroundPathUtility`, `accentPathUtility` |
| `winner-scoring.ts:13-25` `WINNER_QUALITY_AXES` | 11 | `foregroundPath`, `accentPath`, `+ sourceSupport`, `+ renderedGradientSalience` |
| `policy.ts:1-25` `PARETO_BLOCKS` / `RANKING_PRIORITY_BLOCKS` | 9 / 11 | `foregroundUtility`, `accentUtility`, `treatmentFoundation`, `fieldIdentity`, `fieldStructure` |
| `palette-core.ts:361` `CompletePaletteScores` | — | the block names the two above index into |

Two independent weight vectors carry the **same axis concepts at different values**:
`ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.qualityWeights` (`base-scoring.ts:39-49`:
`fieldFidelity` 0.16, `foregroundPathUtility` 0.19, `economy` 0.09) versus `BASE_QUALITY_WEIGHTS`
(`winner-scoring.ts:268-280`: `fieldFidelity` 0.15, `foregroundPath` 0.15, `economy` 0.05). The
wave-1 vector decides the wave-1 ordering and Pareto membership that winner scoring consumes; the
winner vector decides the final. An agent told to "reweight the foreground path" has a coin-flip
chance of editing the stage that does not decide the case they are looking at.

`ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS` (`policy.ts:31-35`) is built from these
lists and used only as `identity.qualityGuard.blocks` — a field with **no reader anywhere in
`research/v2-3/`**. It is documentation shaped like policy.

**Direction.** Do not unify the vectors (they are two real stages). Do rename so the stage is in the
name (`waveOneQualityWeights` / `winnerQualityWeights`), delete the unread `qualityGuard.blocks`, and
add a comment at each declaration naming the other. Renames and dead-code deletion, verified by the
byte-identical sweep.

## F6. Load-bearing constants defined four times over

| value | definitions |
| --- | --- |
| evidence resolution `0.04` | `candidate-materialization.ts:9` `EVIDENCE_RESOLUTION`, `base-scoring.ts:24` `evidenceResolution`, `winner-scoring.ts:308` `evidenceResolution`, `palette-core.ts:662` `RANKING_EVIDENCE_RESOLUTION` |
| utility resolution `0.005` | `base-scoring.ts:25`, `winner-scoring.ts:309` |
| quality-loss budget `0.12` | `transition-promotion.ts:15`, `winner-scoring.ts:313` |
| ranking block order | `ranking-policy.ts:1-13` `MATERIALIZATION_RANKING_BLOCKS` is a **verbatim duplicate** of `policy.ts:13-25` `ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS` — same 11 strings, same order — consumed by two different comparators (`candidate-materialization.ts:65`, `palette-core.ts:3019`) |

Worse, `0.04` is also the value of `FAMILY_BIN_STEP` (`palette-core.ts:652`) and
`REPRESENTATIVE_DENSITY_RADIUS` (`palette-core.ts:656`), which are OKLab *distances*, not score
quantizations. A global "retune the ranking resolution" edit that greps for `0.04` silently changes
the colour quantization.

**Direction.** One exported `RESOLUTIONS` object imported by the four stages; one exported ranking
block list; keep the OKLab distances separately named and commented as *not* the same quantity.
Verified by the byte-identical sweep (all four currently hold the same value, so a correct
de-duplication is a no-op).

## F7. Eleven ranking knobs, mutually-exclusive combinations unenforced, defaults untested

`winner-scoring.ts` alone exposes `WINNER_RANKING_HYPOTHESES` (4 booleans, l.34),
`IDENTITY_AUTHORITY` (l.82), `FIELD_OWNERSHIP` (5 fields, l.92), `GRADIENT_CLAIM` (4 fields, l.145),
`TRANSITION_PROMOTION_ORDER` (l.207), `BAND_TIE_BREAK` (4-way, l.223), `PROMOTION_ENVELOPE` (3-way,
l.242). Several enumerate options the experiments measured and **rejected**
(`decorrelateEconomy`, `weightTransfer`, `legacy-salience`, `earned-only`, `honest-claims-only`,
`raw-utility-first`, `same-family-raw-utility`, `quality-after-decisive`).

Two hazards:

- **`identityAuthority` and `authorizedIdentity` are documented as alternatives** — *"Alternative to
  `identityAuthority`, not a companion: with both enabled the looser rule would re-admit exactly what
  this one excludes"* (`winner-scoring.ts:56-58`) — and nothing enforces it. Both are read
  independently in `dominates` (l.618-627) and `compareEvaluations` (l.657-663), so setting both
  `true` silently produces the union, which is the behaviour review rejected. No assertion, no type,
  no test.
- **No test pins any default.** `research/v2-3/test/` contains exactly two files. `parity.test.ts`
  pins outputs, so a flag flip shows up as 34 opaque assertion failures with no attribution;
  `architecture.test.ts` checks imports and fixture leakage. Nothing asserts
  `collapsedSurfaceFidelity === 0.45` or `BAND_TIE_BREAK === "same-family-band-extent"` — values that
  round 4 and round 5 of Track A were spent deriving, and that a merge can silently revert.

**Direction.** A `configuration.test.ts` that snapshots the whole knob surface as one deep-equal
assertion, with the reviewed justification for each value in the expected object; and a runtime
`throw` (or a union type) for the `identityAuthority && authorizedIdentity` combination. The test is
additive; the throw only fires on a combination no reviewed configuration uses, which the sweep
confirms.

## F8. `endpointBandSpread`: "not measured" is indistinguishable from "measured zero"

`FieldHypothesis.endpointBandSpread` (`palette-core.ts:317-322`) is optional and documented
*"Absent for flat hypotheses, which have no band."* **That comment is false.** It is also absent for
every gradient hypothesis that does not come from `buildFieldHypothesisProposalsFromEvaluatedFits`:
`field-transition.ts:799-816` (native-field-transition) and `candidate-domain.ts:94-144`
(band-local-endpoint) both build `kind: "gradient-field"` hypotheses without it.
`buildFieldVariants`' `bandSpreadOf` then returns `0` (`palette-core.ts:2654-2662`).

`spread-census.ts` over 11 gradient-bearing artworks:

```
band-local-endpoint     0/491 gradient candidates carry a nonzero endpointBandSpread
field-transition        0/94  gradient candidates carry a nonzero endpointBandSpread
seed gradient fit    3653/3653 gradient candidates carry a nonzero endpointBandSpread
```

On `birdsofprey` — the case Track A spent round 4 restoring — 159 of 541 gradient candidates are in
this state. The consequence is asymmetric, because `dominates` reads the value as a real measurement
(`winner-scoring.ts:610-617`): a candidate with spread `0` can never block domination by a
same-family candidate with spread `> 0`, while the reverse always blocks. The same asymmetry applies
to the tie-break at `winner-scoring.ts:676-683`.

Track A's own comment at `palette-core.ts:2650-2653` shows the class was already known and handled
once — *"`preferredRepresentatives` re-sorts by strategy, so the published spread array is matched by
colour identity rather than by index"* — but the index-alignment fix does not help a hypothesis that
publishes nothing at all. The generalisation of the near-miss is: **optional evidence fields whose
absent value is a legal measured value**. `FieldHypothesis` has one today; anything a future arm adds
in the same shape will have the same defect.

**Direction.** Make the field non-optional on gradient hypotheses (every gradient producer supplies
it, or supplies an explicit `null` that the comparators treat as "no evidence" rather than as zero).
The decision is behaviour-affecting where a same-family cross-source pair exists, so this must be
swept, not asserted: run the full corpus plus off-panel before/after, and expect the diff to be
non-empty — any change is a review item, not a regression.

## F9. A candidate's quality depends on which other candidates exist

`scorePaletteCandidates` first computes the set of `renderedFieldClaimKey`s that any treatment earns
a gradient on (`winner-scoring.ts:707-709`), then passes that as `gradientExpected` into
`evaluateTreatment` for every candidate (l.710-713), where it flows into `gradientStatus` and hence
into `fieldFidelity`, `renderedGradientSalience`, `foregroundPath` and `accentPath`
(`palette-quality.ts:116-124`). A flat treatment scores differently depending on whether *some other
candidate* sharing its background/surface families earned a gradient.

Nothing in `evaluateTreatment` or `albumArtworkPaletteV2Phase3SelectorV2Quality` says so, and the
latter's default `gradientExpected = false` (`palette-quality.ts:138`) makes single-candidate probes
look authoritative while being wrong. Every diagnostic written so far — Track A's `diagnose.ts`,
Track C's `probe.ts`, Track E's `inspect-candidates.ts` — is exposed to this.

**Direction.** Document it at the `albumArtworkPaletteV2Phase3SelectorV2Quality` signature and make
`gradientExpected` a required argument so a probe cannot silently take the default. Type-level change
only; verified by typecheck plus the byte-identical sweep.

## F10. The eval cache is keyed on an identity that never changes

`run-corpus.ts:65-66` reuses a cached result when `sourceSha256`, `label` and `algorithmIdentity` all
match. `algorithmIdentity` is the string constant `"v2-3"` (`index.ts:9`) — it does not change when
the algorithm changes. So the default invocation (`--algo v2-3`, label defaults to `v2-3`) reuses
results produced by *any previous version of the code*, printing a reassuring
`[12/34] v2-3 doja.jpg cached`.

The README documents the discipline (*"Use `--label` when the meaning of `v2-3` changes"*) but
nothing enforces it, and the failure is silent and directional: it makes a real change look like a
no-op.

**Direction.** Add a content hash of `research/v2-3/**.ts` to the cache key (or to the record, with a
mismatch warning). Tooling-only; no algorithm change.

## F11. The parity fixture format is a hand-maintained positional tuple with two conventions

`review-fixtures.ts:11-46` stores `roles: [background, surface, foreground, accent]` and
`collapse: [surface, accent]` — two different positional orders in the same record — plus a
*name*-keyed `generated` array. No script generates or updates it (`grep -rl reviewFixtures research/`
returns only the four v2-2/v2-3 test files). Every fixture update after a reviewed change is a manual
transcription of 34 × 4 hexes into a tuple whose second slot means `surface` in one field and the
first slot means `surface` in the next.

**Direction.** A small `update-fixtures.ts` in the eval harness that regenerates the file from a
labelled result set, so a reviewed integration updates fixtures mechanically. Verified by
regenerating at the current trunk and requiring a zero diff against the committed file.

---

# Tier 3 — test and process debt

## F12. Determinism is tested only on an image that never reaches the pipeline

`parity.test.ts:101-104` asserts determinism on `solidImage([31, 79, 143])` — a 24×24 uniform image.
The very next test (l.106-116) proves that such an image takes the **normative generated emergency**
path (`foreground.generated === true`). So the only determinism assertion in the suite exercises
neither quantization, nor family discovery, nor field domains, nor gradient fitting, nor candidate
scoring, nor winner selection — that is, none of the code where determinism could plausibly break.
Charter §6 makes determinism a hard constraint; the suite does not test it.

The runtime says it outright: that test reports **6.16 ms** for *two* extractions, against 1 000–16 000 ms
for one real artwork. It is three orders of magnitude too cheap to have touched the pipeline.

Every track therefore hand-rolled its own determinism check (A: two runs on `meteora`/`greenday`;
D: `loups`/`infected`; E: `determinism.ts`, three runs). Five implementations of a check the suite
should own.

**Direction.** Add a determinism test that runs two real artworks twice and deep-equals the full
`PaletteExtraction` (including `researchRender`). Cost: ~2 real extractions.

## F13. Parity is one monolithic test that aborts at the first mismatch

`parity.test.ts:86-99` loops all 34 fixtures inside a single `test()` with a 1 800 000 ms timeout and
a bare `assert.deepEqual` per case. Measured: **210 s**, reported as one line. A change that moves 6
artworks reports **one** failure — the first — after however many minutes it took to reach it, so the
actual blast radius is invisible until you write your own sweep. All five tracks did
exactly that: `run-subset.ts --base-corpus` (A), `full-corpus-diff.ts` (C), `sweep-corpus.ts` (D),
`run.ts` + `diff.ts` (E), plus B's harness validated against cached trunk JSONs. The charter even
instructs agents to avoid the suite (*"Do not run the full parity suite repeatedly (it is very
slow); run your targeted subset with a small script instead"*) — which is the charter documenting the
tool as unusable rather than fixing it.

**Direction.** `test.each`-style per-fixture subtests (34 named cases, each independently
pass/fail), and promote one of the existing sweeps into `research/v2-3-eval/` as the supported
blast-radius tool so tracks stop rewriting it. Test-harness change only.

## F14. Untested behaviour

Nothing in `research/v2-3/test/` covers: the parametric flag defaults (F7); `extractPaletteFromBytes`
options — EXIF orientation, alpha flattening, the 2 100 000-pixel limit at
`native-resolution-image.ts:9`, all documented in the README and all unasserted; the off-panel
sources (every off-panel finding in tracks C and E is recorded only in prose); the `researchRender`
midpoint shape beyond the 6 fixtures that carry one; and Charter §4's representativity rule (no test
asserts that a synthesized colour is never snapped to a bare pixel).

**Direction.** The cheapest high-value additions are the flag snapshot (F7) and a
`loadNativeImage` unit test with a >2.1 MP synthetic input and an EXIF-rotated fixture — neither
needs the artwork corpus, so both survive F1.

## F15. `palette-core.ts` is the concurrency bottleneck — what a split costs and buys

4 067 lines: ~650 of type declarations, then `buildNativePaletteEvidence` alone at 507 lines
(l.1157-1664), field domains (l.1665-1994), gradient fitting and band evidence (l.1995-2432),
hypothesis proposals and variants (l.2434-2707), identity obligation selection (l.2708-2835),
contrast and keys (l.2836-3010), treatment construction (l.3014-3266), the complete treatment domain
(l.3285-3515), the seed domain and source registry (l.3516-3947), supplemental treatments
(l.3949-4067).

**What it costs today:** four of the five tracks edited this one file — A (band spread), B
(`FieldMidpointEvidence`), D (composite field domains, its *only* change), E (`markSupportOf` and
four substitution sites). Track B recorded the predictable outcome: *"The merge reported a conflict
only because the withdrawn H1 had once edited the same function"* — two independent arms collided
inside `endpointBandRepresentatives`. With tracks running in parallel by design, this file is where
they serialise.

**What a split would buy:** the seams above are real and mostly one-directional (evidence → domains →
fits → hypotheses → treatments → seed). Splitting along them would put D-class work (domains),
B-class work (band/midpoint evidence), and E-class work (family support) in three different files.

**What it would cost:** the ~650 lines of types are shared by every seam and would have to move to a
types module first, and `CompletePaletteTreatment` / `NativePaletteEvidence` are god objects threaded
through every stage, so the split does not reduce coupling — only file-level contention. It is
therefore a *merge-throughput* investment, not a design improvement, and it competes directly with
accuracy arms for reviewer attention.

**Recommendation.** Do it only as a strictly mechanical move (no signature changes, no re-ordering
inside functions), and only in a window when no track is mid-arm. Verify with the byte-identical
sweep of F2 — full 34 artworks plus off-panel, comparing complete cached `extraction` JSON, not the
four hexes — plus `tsc -p research/v2-3/tsconfig.json` and both architecture tests. If the sweep is
not byte-identical, the move was not mechanical.

## F16. The naming ceremony costs more than it looks

`AlbumArtworkPaletteV2Phase3` appears 166 times across 12 files (0 times in `palette-core.ts`'s own
type names, 29 times in `base-scoring.ts`, 28 in `palette.ts`). Longest identifiers are 63 characters
(`AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate`,
`AlbumArtworkPaletteV2Phase3CompleteLineageDescriptorEligibility`). `palette.ts`'s 40-line import
block is almost entirely prefix.

The measurable cost is not typing — it is that the prefix carries **no information** (everything in
the folder is v2 phase 3) while displacing the part that does. `AlbumArtworkPaletteV2Phase3SelectorV2Quality`
and `albumArtworkPaletteV2Phase3SelectorV2Quality` differ from the wave-1 `selector` quality only by
a `V2` buried at character 44 — and F4 is precisely an agent confusing those two. Track B's
`AlbumArtworkPaletteV2Phase3SupportedGradientMidpointProvenance` widening is a good instance: the
diff was a discriminated union, but the identifier makes the change unreadable in a review.

**Direction.** Strip the prefix. It is a pure rename with no semantic content, verified by the
byte-identical sweep and the typechecker. Do it in the same window as F15 if that happens, since both
touch every file and neither should be interleaved with an accuracy arm.

---

# Summary — ranked by expected impact on iteration velocity

| # | finding | cost today | fix size |
| --- | --- | --- | --- |
| F1 | worktrees have no artworks; no result set is reproducible | 4 tracks, 4 workarounds; B's headline claim unverifiable | small (tooling) |
| F2 | ~45 % of runtime is recomputation; placebo is 16 s | every sweep, every parity run | small for 20 %, medium for the rest |
| F3 | three winner stages, two comparators, two baselines | a full Track A round | small (diagnostics + constant) |
| F4 | `renderedGradientSalience` means two things | a full Track A round, retracted | trivial (rename) |
| F5 | four axis vocabularies, two weight vectors | latent; high blast radius | small (rename) |
| F6 | resolution/budget constants defined 2–4× | latent; silent divergence | small |
| F7 | 11 knobs, exclusive pair unenforced, defaults untested | latent; a merge can revert reviewed values | small (one test + one throw) |
| F8 | `endpointBandSpread` absent ≡ zero, 585 candidates affected | latent asymmetry in dominance | medium (behaviour-affecting) |
| F9 | candidate quality depends on the candidate set | every diagnostic written so far | trivial (required arg) |
| F10 | eval cache never invalidated by code changes | silent "no-op" on real changes | small |
| F11 | hand-transcribed positional fixture tuples | every integration | small |
| F12 | determinism tested only on the emergency path | 5 hand-rolled determinism checks | trivial |
| F13 | parity aborts at the first of 34 | 5 hand-rolled sweeps | small |
| F14 | untested: flags, decode options, off-panel, representativity | latent | small |
| F15 | `palette-core.ts` serialises parallel tracks | 1 merge conflict so far, 4/5 tracks exposed | large |
| F16 | naming ceremony | contributes to F4/F5 confusion | medium (mechanical) |

**If only three things are done:** F2(a)+(d) (a ~25 % runtime cut for a plumbing change and a
one-line comparison fix), F1 (stop every track re-solving image resolution), and F4+F7 together (the
two defects that have each already cost a measured, reviewed round).

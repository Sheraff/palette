# v2-3 hygiene wave

The behaviour-preserving portion of [`REVIEW.md`](./REVIEW.md) (architecture) combined with the
adversarial-logic review and its verification pass (`VERDICTS.md`). Every change in this wave is
required to be **byte-identical on the complete extraction JSON** — all four roles' rgb/oklab/hex/
generated, the gradient and collapse flags, the dimensions, and the whole `researchRender` midpoint
block — not just the role hexes.

Base: `research/palette-0.9-checkpoint` @ `4b0ffdf`.

## The corpus this was measured on

**Stated explicitly, because the corpus is a trap.** `.gitignore` excludes `*.jpg`, `*.png` and
`*.avif` and re-includes only `*-scrambled.*`, so a worktree's `images/` contains **only the
scrambled decoys**. A decoy preserves the colour histogram and destroys spatial structure, so a
sweep that silently ran on decoys reports the transition stack, diffuse-composite domains and
endpoint refinement as dead when all three are load-bearing. That is exactly what happened to the
first logic-review pass.

Every sweep and probe below ran with `PALETTE_IMAGES_ROOT=/Users/Flo/github/palette/images`, i.e.
the **real** corpus. The composition of the acceptance set is verified in the manifest itself:

| set | count | contents |
| --- | ---: | --- |
| base | 37 | the real artworks, including all 34 parity fixtures |
| scrambled | 34 | the decoys, kept as a separate stratum rather than mistaken for artwork |
| off-panel | 30 | deterministic stride sample of the `<2-hex>/` caches, plus the 4 sources named in the track reports |
| **total** | **101** | |

`registry-usage.ts` ran over the 71 `images/` files (37 real + 34 decoys).

## Acceptance harness

[`sweep.ts`](./sweep.ts) — extracts every image, hashes the canonical (key-sorted) JSON of the
complete `PaletteExtraction`, and writes a manifest with a per-image hash, a corpus hash, and
per-image timings. `--compare before.json after.json` prints every differing image and the
runtime delta, and exits non-zero if anything differs.

```sh
PALETTE_IMAGES_ROOT=/path/to/checkout/images node --no-warnings --experimental-strip-types \
  research/v2-3-experiments/adversarial-arch/sweep.ts --set full --out after.json
node --no-warnings --experimental-strip-types \
  research/v2-3-experiments/adversarial-arch/sweep.ts --compare sweep-baseline.json after.json
```

## Result

```
101 image(s) compared, 0 differ
corpus hash  before ea7aaa6c4ecf1460f6d46cd6384d699a330c589f3521be3616139ae7bb5095a0
             after  ea7aaa6c4ecf1460f6d46cd6384d699a330c589f3521be3616139ae7bb5095a0
runtime      before 500.3s  after 263.0s  (1.90x, 47.4% faster)
```

| | before | after | |
| --- | ---: | ---: | --- |
| corpus hash (101 images) | `ea7aaa6c4ecf…` | `ea7aaa6c4ecf…` | **identical** |
| images differing | — | **0 / 101** | |
| full sweep runtime | 500.3 s | 263.0 s | **1.90×** |
| parity suite | 210.1 s (4 tests) | 110.9 s (39 tests) | 1.89× |
| quick set, 18 images | 64.0 s | 33.6 s | 1.90× |

Manifests are committed as `sweep-baseline.json` and `sweep-after.json`, so the claim is
re-checkable per image rather than only in aggregate.

Verification run after every group: typecheck (`tsc -p research/v2-3/tsconfig.json`), the
architecture tests, the new configuration tests, and a quick-set sweep. The full 101-image sweep
gates the wave as a whole.

---

## 1. Recomputation elimination

### 1.1 `diagnoseGradientFits` re-fit — the single biggest win

`buildAlbumArtworkPaletteV2Phase3CommonBase` (`candidate-domain.ts:247`) called
`diagnoseGradientFits(seed.evidence)`, whose body is
`gradientFitDiagnostics(evaluateGradientFits(evidence, buildBackgroundFieldDomains(evidence)))` —
the identical computation `buildPaletteSeedDomain` had already performed at
`palette-core.ts:3872-3873` on the identical object. Both are deterministic functions of the
evidence, so the second run could not produce anything different.

`PaletteSeedDomain` now carries `gradientFitDiagnostics`; `diagnoseGradientFits` is deleted (it had
no other caller). Measured share of a run before the change: 23 % (placebo), 29 % (black), 8 %
(birdsofprey) — corpus-wide the logic review measured 37.9 s of a 205 s pass, 19 %.

**Verification:** behaviour-identical by construction (a value substituted for a recomputation of
the same pure function on the same argument), and proven by the byte-identical sweep.

### 1.2 The all-ranked-lane discovery pass — deleted

`evidenceWithAllRankedLanes` widened every lane to all families and re-ran
`buildBackgroundFieldDomains` + `evaluateGradientFits` over the widened evidence, solely to widen
`buildSourceRegistry`'s `allProposals`.

Re-verified before deleting, on the real corpus, with [`registry-usage.ts`](./registry-usage.ts):
across 71 artworks the pass contributed **17,512** non-control registry rows, of which **0** were
referenced by any treatment and **0** changed any lineage resolution. The verification pass
independently confirmed this over 118 artworks (0 of 24,847 rows used). A structural argument backs
the measurement: `proposalById` is first-wins with control proposals first, so a control proposal
shadows any identically-identified all-lane one, and no treatment can name a hypothesis id that no
control proposal produced.

One subtlety the first probe missed and this one reports: 50 field-direction rows share a key with
a used treatment but hold only non-control ids. They are **not** a dependency — field directions
are one row per key, so such a row means no control variant produced that key, and the lineage
lookup additionally requires the treatment's *own* (control) hypothesis id to be in the row, which
such a row can never satisfy. Those lookups fail today and fail identically once the rows are gone.

### 1.3 Per-pixel string comparison

`endpointBandRepresentatives` filtered its innermost loop with
`evidence.families[evidence.familyAt[pixelIndex]].id !== family.id` — a double indirection and a
string compare, per pixel, per selected family, per fit. `familyAt` already holds the family's
index, and ids are unique per index, so the integer comparison is the same test. The enclosing
frame was 1,183 ms of self time on placebo (7.0 %, third hottest).

### 1.4 The duplicate `gradientExpected` scoring pass

`scorePaletteCandidates` ran a second full `albumArtworkPaletteV2Phase3SelectorV2Quality` over
every candidate (up to 1,500) purely to find which field claims are earned. That predicate is
`earnedGradientClaim`, which does not depend on `gradientExpected` at all; it is now exported and
called directly. `gradientExpected` itself is **kept** — it is what distinguishes `missing` from
`not-applicable`, which the `honest-claims-only` claim axis still reads.

### 1.5 The discarded wave-1 Pareto pass and the dominator sort

`selectAlbumArtworkPaletteV2Phase3Treatments` ran an O(n²) `qualityDominates` pass (~2.2 M
comparisons over 9 axes at n = 1,500) plus a sort of each candidate's dominator list, to populate
`paretoMember` and `dominatedByKey`. Neither field was ever read — `winner-scoring.ts` builds its
own frontier from its own 11-axis `dominates` and initialises both afresh. Both fields are removed
from the wave-1 type and the pass is deleted.

The pass also asserted that the wave-1 frontier is non-empty. That assertion is gone; the winner
stage still asserts the same property on the frontier it actually uses. Recorded here because it is
the one safety check this wave removes rather than preserves.

In `winner-scoring.ts` the equivalent scan now uses `some` (short-circuits on the first dominator)
instead of `filter(...).sort(...)`, and `dominatedByKey` — written, never read — is gone.

### Not done, deliberately

- **`buildRegionGraph` memoisation** and the lazy `source-eligibility` re-score are **not** in this
  wave. The verification pass confirmed the transition stack, the diffuse-composite pass, band-local
  endpoint refinement and the source-eligibility filter are all load-bearing. The lazy re-score was
  offered as an optional extra worth ~3 %; it is a behavioural change to a confirmed-live invariant
  and its acceptance criterion was byte-identity across 118 artworks, whereas this harness covers
  101. Left for a wave that can meet its own bar.

---

## 2. Constants, duplication and dead configuration

| change | evidence |
| --- | --- |
| `ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS` is the single source of the `0.04` evidence quantum and the `0.005` utility quantum | the evidence quantum was declared five times (`base-scoring`, `winner-scoring`, `candidate-materialization`, `palette-core`, `role-obligations`), the utility quantum twice. The declaration warns that `FAMILY_BIN_STEP` and `REPRESENTATIVE_DENSITY_RADIUS` share the value `0.04` but are OKLab *distances*, so a retune by grepping the literal silently changes colour quantization |
| `ranking-policy.ts` deleted | `MATERIALIZATION_RANKING_BLOCKS` was a verbatim copy of `ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS`, consumed by two different comparators with nothing tying them together |
| `MAXIMUM_WINNER_QUALITY_LOSS` re-exports `WINNER_SCORING_POLICY.maximumQualityLoss` | the `0.12` budget was declared twice. Its doc-comment now records that it is applied at **two** gates against **two different baselines** (source-eligible winner in `transition-promotion.ts`, unrestricted winner in `palette.ts:selectWinner`) — a candidate must clear both |
| the two ~100-line candidate-generation loops now share `rankForegroundOptions` / `rankAccentOptions` | the foreground ranking was byte-identical in both; the accent ranking differed only in the representative policy, which is now an explicit parameter. **The known live drift is preserved**: the control loop still slices accents to `distinctAccentsPerForeground` and the additions loop still iterates the retained list, because that difference is behaviour, not duplication. Retention policy, treatment sink and bookkeeping stay at each call site |
| dead flags deleted | `identityAuthority` (permanently `false`, and documented as mutually exclusive with `authorizedIdentity` with nothing enforcing it — deleting it makes the trap unreachable rather than merely documented), `weightTransfer` and `fieldFidelityWeightBoost` (both `0`, so `fieldOwnershipWeights()` always returned `BASE_QUALITY_WEIGHTS`, and the `RangeError` was unreachable), `applyToEconomy` and `decorrelateEconomy` (both `false`, so the economy substitution was the identity function), `signAgreementFloor` (`0`, so its `Math.max` could never bind), `gradientClaimConsistency` and `routeUnearnedFieldFidelity` (both permanently `true`; their `false` branches are inlined away and one of them depended on a value this wave deletes) |
| dead scores deleted | `rankingScore`, `balance`, `uiUtility`, `foundation`, `generatorConfidence` — computed for every candidate, read nowhere |
| pre-campaign defects | the duplicate unreachable throw at `palette-core.ts:3085-3086`, and the dead ternary `(role === "typography" ? 1 : 1)` |

Rejected-but-implemented options that remain because they are still reachable by editing one value:
the four surviving `claimAxis` settings, `TRANSITION_PROMOTION_ORDER`, `BAND_TIE_BREAK`,
`PROMOTION_ENVELOPE`.

---

## 3. The `renderedGradientSalience` shadowing

Two different quantities shared one name. `palette-quality.ts` returned **1** for a
not-applicable flat; `winner-scoring.ts` overrode the same key to **0** for everything that is not
an earned gradient — so at winner level the axis is a *pro-gradient bonus*, not an anti-gradient
handicap. Track A's revision note records the cost: an arm was measured, reviewed and retracted
because it verified the standalone function and not the override.

Per the instruction, the winner-scoring semantics are kept and the shadowed path is deleted:

- the wave-1 `renderedGradientSalience` function and axis are removed;
- the winner axis is renamed **`renderedFieldClaim`**, after what it actually scores;
- the `legacy-salience` claim axis — the only consumer of the deleted wave-1 value — is removed,
  and `renderedFieldClaimScore` now documents the whole trap at its definition.

---

## 4. Reproducibility

- **One image-root name.** `PALETTE_IMAGES_ROOT` replaces the four conventions tracks invented
  (`PALETTE_IMAGES_ROOT`, `TRACK_C_IMAGES_ROOT`, `PALETTE_IMAGE_ROOT`, and a hard-coded
  `/Users/Flo/GitHub/palette/`). It is read by `research/v2-3/test/corpus.ts` and
  `research/v2-3-eval/src/shared.ts`; the two folders stay independent, so each states the
  three-line resolution and cross-references the other rather than creating a dependency.
  `selectImages` now resolves corpus-relative paths through it, so `--images 09/ab6761…` works.
- **`.gitignore` untouched** — the artworks are copyrighted and their exclusion is deliberate. The
  required local setup is documented instead, as a new §0 in `research/v2-3-eval/README.md` and in
  the charter's working method, both stating why the decoys are not a substitute.
- **Charter typecheck command fixed** — `node_modules` is absent from a worktree, so the mandated
  relative `node_modules/.bin/tsc` fails there; the charter now gives `npx tsc` or the main
  checkout's path.
- **Parity is 34 named subtests**, each printing both complete palettes on failure, instead of one
  monolithic test that aborted on the first `deepEqual` and hid the blast radius.
- **A real determinism test.** The existing one runs a 24×24 solid image that takes the
  generated-emergency path and completes in ~2 ms — it exercises none of the quantization, family
  discovery, field-domain, gradient-fit, scoring or selection code. `orelsan.jpg` (the smallest
  gradient-stratum fixture) now extracts twice and is deep-equal, at a cost of ~1.5 s.
- **`configuration.test.ts`** pins every surviving flag, threshold and weight, with the review that
  decided each value in the assertion message. A merge that reverts `collapsedSurfaceFidelity` or
  `BAND_TIE_BREAK` now fails one named test instead of 34 opaque palette mismatches.

---

## 5. `contrast.hardMinimum` is now wired (charter rule 2)

`policy.contrast.hardMinimum` existed only as a name: no runtime code read it, and the gate was a
hard-coded `value !== 0` in `hasPeakAPCAObservability`. Raising it to 15 changed nothing.

It is now `PaletteExtractionOptions.contrastHardMinimum`, threaded from the public API through
`extractPaletteDetails` → `buildPaletteSeedDomain` → `buildCompletePaletteTreatmentDomain` /
`generateSeedAdditions` / `constructAlbumArtworkPaletteV2Phase3SupplementalTreatments` →
`createTreatment` / `validateTreatment` / `retainPeakObservableFamilyDirections` → the two
predicates. The parameter is **required** at every internal function, so the compiler — not a
reviewer — enforces that no gate silently ignores it; it caught nine missed call sites.

```ts
extractPalette(image)                                  // default: contrastHardMinimum = 0
extractPalette(image, { contrastHardMinimum: 15 })
await extractPaletteFromBytes(bytes, { contrastHardMinimum: 15 })
```

At the default `0`, `Math.abs(value) > 0` is exactly `value !== 0` for every finite value, so the
default reproduces the previous behaviour bit-for-bit — which the sweep confirms. `parity.test.ts`
asserts both halves of the contract: an explicit `0` is deep-equal to the default, and raising the
floor to 40 changes the output (otherwise the parameter would still be decorative).

The two prose siblings, `requiredForegroundObservability` and `distinctAccentObservability`, are
still unread strings. They describe what the gate does rather than configuring it; flagged, not
changed.

---

## What this wave did not touch

Confirmed load-bearing by the verification pass, and out of scope here: the native-field-transition
stack, the diffuse-composite field-domain pass, band-local endpoint refinement, and the
source-eligibility filter. Also untouched, as assigned elsewhere: the midpoint endpoint-proximity
guard, `fieldSamples` geometry, the obligation chroma selector, and `endpointBandSpread`
completeness (`REVIEW.md` F8).

# Pinning the thirteen pervasive cliffs — disposition

Zero-behaviour-change hygiene arm, 2026-08-01. Base `9063f6e`, branch
`worktree-agent-a9ba31ec28d059cff`.

Track P's tier-A sweep (`LEDGER.md` §7, imported per `IMPORTED.md`) found thirteen sites consulted
on ≥ 100 of 154 artworks and flipping the published palette on ≥ 20 % of them. All thirteen were
undocumented; none was pinned. This arm pins **ten** of them, documents all thirteen at their
definition sites, and reports the three it declined to pin — with the reason, which is not caution.

## Disposition

| # | Track P site | value | pinned as | file | tag | action taken |
|---:|---|---|---|---|---|---|
| 1 | `palette-core:FAMILY_BIN_STEP` | 0.04 | `FAMILY_BIN_STEP` | `palette-core.ts` | `[INHERITED]` | export + comment |
| 2 | `POLICY.bounds.representativesPerRole` | 2 | *(unchanged path)* | `policy.ts` | `[INHERITED]` | pin only — already exported |
| 3 | `palette-core:rankForegroundOptions#1` | 0.68 | `FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT` | `palette-core.ts` | `[INHERITED]` | **lift** (2 occurrences) + export |
| 4 | `palette-core:rankAccentOptions#2` | 0.50 | `ACCENT_RANK_FIDELITY_WEIGHT` | `palette-core.ts` | `[INHERITED]` | **lift** (2 occurrences) + export |
| 5 | `buildFieldVariants.length#1` | 2 | `CONTROL_FIELD_VARIANT_PAIRS` | `palette-core.ts` | `[INHERITED]` | **lift** (1 occurrence) + export |
| 6 | `palette-core:REPRESENTATIVE_DENSITY_RADIUS` | 0.04 | `REPRESENTATIVE_DENSITY_RADIUS` | `palette-core.ts` | `[INHERITED]` | export + comment |
| 7 | `buildRegionObservations.score#1` | 0.45 | `REGION_ROLE_SCORE_SUPPORT_BASE` | `palette-core.ts` | `[INHERITED]` | **lift** (1 occurrence) + export |
| 8 | `buildRegionObservations.score#2` | 0.55 | `REGION_ROLE_SCORE_CUE_SPAN` | `palette-core.ts` | `[INHERITED]` | **lift** (1 occurrence) + export |
| 9 | `fitGradients.texture#1` | 0 → 1 | — | `palette-core.ts` | — | **NOT PINNED — not a constant** |
| 10 | `fitGradients.texture#3` | 2 | — | `palette-core.ts` | — | **NOT PINNED — not a constant** |
| 11 | `buildNativePaletteEvidence.population#2` | 0 → 1 | — | `palette-core.ts` | — | **NOT PINNED — not a constant** |
| 12 | `palette-core:FIELD_MIDPOINT_BAND` | 0.42 | `FIELD_MIDPOINT_BAND` | `palette-core.ts` | `[INHERITED]` | export + comment |
| 13 | `band-representative:binKeyOf#4` | 0.5 | `CHROMA_BIN_ORIGIN_OFFSET` | `band-representative.ts` | `[INHERITED]` | **lift** (2 occurrences) + export |

Measured fragility, carried into every pin comment:

| pinned name | live / 154 | flips | share | direction | fixtures : unseen |
|---|---:|---:|---:|---|---:|
| `FAMILY_BIN_STEP` | 154 | 150 | 97 % | 150 down / 146 up | 63 : 233 |
| `bounds.representativesPerRole` | 154 | 125 | 81 % | 125 down / **0 up** | 26 : 99 |
| `FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT` | 154 | 88 | 57 % | 64 down / 88 up | 34 : 118 |
| `ACCENT_RANK_FIDELITY_WEIGHT` | 151 | 78 | 52 % | 66 down / 78 up | 30 : 114 |
| `CONTROL_FIELD_VARIANT_PAIRS` | 154 | 60 | 39 % | 60 down / **0 up** | 11 : 49 |
| `REPRESENTATIVE_DENSITY_RADIUS` | 154 | 51 | 33 % | 51 down / 7 up | 13 : 45 |
| `REGION_ROLE_SCORE_SUPPORT_BASE` | 154 | 49 | 32 % | 33 down / 49 up | 12 : 70 |
| `REGION_ROLE_SCORE_CUE_SPAN` | 154 | 45 | 29 % | 42 down / 45 up | 16 : 71 |
| `FIELD_MIDPOINT_BAND[0]` | 113 | 28 | 25 % | 28 down / 25 up | 8 : 45 |
| `CHROMA_BIN_ORIGIN_OFFSET` | 113 | 27 | 24 % | 27 down / 27 up | 6 : 48 |

Source: `data/fragility.json` on `worktree-agent-a9652f5642a9e2b25@265ceba`, sites classified
`pervasive-cliff`. Fixture/unseen columns are flip *opportunities* summed over directions, not
artwork counts.

## Provenance of the ten, checked rather than assumed

Eight are verbatim in the frozen v2-2 baseline and therefore predate the v2-3 line entirely:
`FAMILY_BIN_STEP` (`research/v2-2/src/internal/palette-core.ts:574`),
`REPRESENTATIVE_DENSITY_RADIUS` (`:578`), `representativesPerRole` (`v2-2/policy.ts:81`), the
foreground weight (`v2-2/palette-core.ts:2977-2978`, where the whole ranking formula existed twice
before the v2-3 de-duplication), the accent weight (`:3013`), the two region-score literals
(`:763`, alongside a surviving `role === "typography" ? 1 : 1` no-op), and the control pair bound
(`:2329`).

Two are v2-3-native but no better evidenced: `FIELD_MIDPOINT_BAND` and `CHROMA_BIN_ORIGIN_OFFSET`
both arrive in `a864585` (Track B H4 chord-deviation midpoints, 2026-07-31) as bare literals with
no comment. That commit *was* reviewed — on its mechanism and its blast radius (`loups`, `doja`,
one off-panel case) — but no reviewer saw these numbers, and `0.42` appears in no experiment file
anywhere in `research/v2-3-experiments/`. They are tagged `[INHERITED]` under an extension of that
tag stated in the `configuration.test.ts` header: *arrived as an undocumented bare literal in an
integration commit whose review adjudicated the mechanism and never saw the number.*

**No constant among the thirteen received a `[MEASURED]` tag.** What tier A measured is their blast
radius, not their value. Tagging a number `[MEASURED]` because someone measured how much damage
changing it does would be exactly the kind of borrowed provenance the 2026-08-01 hygiene sweep
existed to remove.

## The three not pinned, and why

These are not literals this arm was too cautious to lift. They are not tunable constants at all,
and their appearance in the cliff table is an artifact of Track P's AST classifier — which excludes
1259 "small-integer arithmetic (`/2`, `**2`, arity)" sites (`LEDGER.md:18-28`) but did not exclude
these.

**`fitGradients.texture#3` = `2`** — `palette-core.ts:2716`:

```ts
texture: Math.sqrt(Math.max(0, cell.sumSquares / cell.count - value[0] ** 2 - value[1] ** 2 - value[2] ** 2)),
```

The `2` is the exponent in the variance identity `Var = E[X²] − E[X]²`, applied per OKLab channel.
Perturbing it to 2.4 does not retune a threshold; it computes a quantity that is not a variance.
The sweep's own data shows this directly: the three mathematically identical exponents on that line
were swept as independent sites and returned **39, 7 and 2 flips** (`#3`, `#5`, `#7`). A genuine
parameter perturbed three times in the same expression cannot produce three different answers —
they must move together, and they cannot move at all without breaking the identity. Naming this `2`
would assert it is choosable. It is not. **DERIVED, in Track P's own §3 sense.**

**`fitGradients.texture#1` = `0`** — same line. It is the floor in `Math.max(0, …)` that guards
`Math.sqrt` against a negative variance produced by floating-point cancellation. The sweep's
perturbation was an absolute override to `1` (`abs1`), which raises the variance floor to 1 on every
grid cell of every artwork and makes 41 palettes move. That measures arithmetic corruption, not
sensitivity. It belongs with the `1e-12` / `1e-9` quantization epsilons Track P already classes as
DERIVED (`LEDGER.md:95`).

**`buildNativePaletteEvidence.population#2` = `0`** — `palette-core.ts:1773`. A struct-field
initializer:

```ts
mutableFamilies.push({ id: …, anchor: prototype, binIndexes: [], population: 0, sumL: 0, sumA: 0, … })
```

An accumulator opened at zero and then summed over its bins. The perturbation overrode it to `1`,
seeding every colour family in every artwork with one phantom pixel, which perturbs every population
fraction downstream and moves 35 palettes. Note its sibling `#1` = `1` at `:1742` — the
`population: 1` of a *newly created bin*, which is a genuine count of the pixel that created it —
was swept and returned 0 flips, consistent with it not being a knob either. The nine sibling
zero-initializers on the same object (`sumL`, `sumA`, `sumB`, `sumX`, `sumY`, `sumX2`, `sumY2`,
`borderPixels`, `centerPixels`, …) are the same construct and were not flagged only because the
classifier happened to route this one.

**Consequence for the headline.** Track P's "thirteen pervasive cliffs" is really **ten**, plus
three sites that demonstrate the census cannot distinguish a threshold from an arithmetic
constituent. The finding is not weakened: ten undocumented, unpinned constants — led by one that
moves 97 % of published palettes — is the same conclusion. Track P's classifier should exclude
exponents, `Math.max`/`Math.min` clamp floors and object-literal accumulator initializers before
tier B, or tier B will spend runs on them too.

## Also corrected in this pass

- **`palette-core.ts:3049` still said "Six anchors" while enumerating seven.** The 2026-08-01
  hygiene sweep's pin claims it "Corrected in the same sweep at `policy.ts:101` and
  `palette-core.ts:2856`". `policy.ts` was corrected; `palette-core.ts` was not, and the line number
  was stale on arrival. Both fixed (comment-only).
- Two `palette-core.ts` line citations in `configuration.test.ts` were already stale at `9063f6e`
  (the performance pass had shifted them ~147 lines); re-resolved.
- `provenance-hygiene/REPORT.md` value-level concern #2 said the `BASE_QUALITY_WEIGHTS`
  measurement was "the natural import when the sweep completes". It had already completed. Corrected
  in place, and the `fieldFidelity` pin now carries the escalation.

## Gates

| gate | result |
|---|---|
| non-comment diff under `research/v2-3/src` | exports + identical-value lifts only; no expression reordered, no value changed |
| `tsc -p research/v2-3/tsconfig.json` | clean |
| `architecture.test.ts` + `configuration.test.ts` | 11/11 |
| `parity.test.ts` (`PALETTE_IMAGES_ROOT` = shared checkout, `VIPS_CONCURRENCY=1`) | 39/39 |
| byte-identity spot-check, full extraction JSON | 5/5 identical SHA-256 (`doja`, `black`, `johns`, `birdsofprey`, `orelsan`) |

## What this arm did not do

Nothing here derives a value or proposes one. `AGENDA.md` §0 asks for three follow-ups this arm is
not authorised to make, and pinning is explicitly the cheap first step, not the fix:

1. the four quantization grains (`FAMILY_BIN_STEP`, `REPRESENTATIVE_DENSITY_RADIUS`,
   `CHROMA_BIN_ORIGIN_OFFSET`, `RESOLUTIONS.evidence`) want a **lightness-dependent grain** derived
   from the 22.6× `okDistance` swing the codebase already establishes;
2. the two truncation bounds (`representativesPerRole`, `CONTROL_FIELD_VARIANT_PAIRS`) want a
   convergence measurement — the bound at which output stops changing — recorded as their
   justification;
3. the four ranking cut-offs want re-expressing as a separation in evidence quanta rather than an
   absolute level.

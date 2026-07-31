# Track E arm 2 — lettering under same-colour noise (knuckles class)

Base commit: `d5f2003` (mark-support substitution integrated).
**Outcome: negative. No algorithm change is proposed.** The runtime is
byte-identical to trunk; this arm ships instruments, a corpus survey, and a
diagnosis.

## The question

Let lettering be recognised as such even when its colour family is polluted by
same-colour noise, without weakening `enumerability` globally. Target: knuckles'
foreground moves toward the white lettering *if the evidence genuinely supports
it*.

## What knuckles actually looks like

Enumerating **every** connected component of the white family (the evidence
retains only a bounded subset, so this needed its own instrument):

```
family-10782 #f1fcfe   pop 0.4065%   153 components   markSupport 0.031
size histogram:  1px:94   2-3px:30   4-7px:9   8-15px:14   16-31px:6
```

**94 of 153 components are single pixels.** The 14 components ≥12 px are all in
the bottom-right quadrant, centroids at y≈326 and y≈337 — two baselines, 17 px
apart — sizes 4–6 × 7–9 px. That is exactly "NO BS! BRASS / BRASS KNUCKLES", and
it is beautifully separable from the speckle by eye and by number.

So the premise holds: `enumerability = 14/153 = 0.092` is destroyed by noise the
stroke filter *already rejects*, and the lettering is genuinely there.

## Three attempts, measured

### 1. Count only admissible components in the denominator

`enumerability = qualifying / componentsClearingTheStrokeFloor`. Principled on
its face: a single pixel is not a component evidence may be read off, so
counting it penalises a mark in proportion to how much same-coloured noise the
artwork contains.

**Result: selectivity collapsed.** knuckles reached 0.337, but so did everything
else — artofficial's painterly texture families jumped to 0.837 / 0.711 / 0.473
(from 0.044 / 0.056 / 0.025). A painterly ground has the same shape as knuckles:
hundreds of components of which ~20 are sizeable.

### 2. Spatial group compactness

Measured on four hand-picked families, lettering packed 24–73 % of its own
bounding box while artofficial's textures managed 0.7–3.1 % — a 7× gap. Added
`max(enumerability, groupEnumerability × groupCompactness)`.

**Result: selectivity collapsed again** — 110 families corpus-wide reached
≥ 0.25. I had designed from four data points. Large families have large
component boxes, so the ratio is not scale-free.

### 3. Survey first, then decide

Built a corpus-wide survey (`survey.ts` → `data/family-survey.tsv`, **771 family
rows** across the 34 fixtures, the 4 off-panel cases and the `015083` positive
control; re-derived from `familyAt` in one labelling pass, so it runs against
unmodified `research/v2-3/`) carrying every candidate discriminator, and chose from the distribution
instead of from samples.

| family | mark | enum | groupEnum | groupFill | groupBox % | heightCV |
| --- | --- | --- | --- | --- | --- | --- |
| placebo red text | 0.998 | 1.000 | 1.000 | 0.834 | 0.60 | 0.095 |
| slim red text | 0.993 | 1.000 | 1.000 | 0.610 | 3.16 | 0.443 |
| disney wordmark | 0.925 | 1.000 | 1.000 | 0.414 | 13.38 | 0.407 |
| placebo white | 0.780 | 0.783 | 1.000 | 0.743 | 1.78 | 0.309 |
| **knuckles white text** | **0.031** | **0.092** | **1.000** | **0.278** | **1.44** | **0.134** |

No single statistic separates:

- **groupBox %** — 46 families are at knuckles' spatial tightness *or better*,
  nearly all of them small localised patches of painterly images
  (`birdsofprey #972a47`, 3 admissible of 347; `franz #00000b`, 3 of 1997).
  A spatially tight group of a few sizeable components is the generic signature
  of any local feature, not of lettering. knuckles sits **mid-distribution**.
- **heightCV** — knuckles 0.134, but slim 0.443 and disney 0.407 must be kept
  while artofficial's texture is 0.466. The keep-set and the reject-set overlap.
- **alignment** — placebo's red text is *vertical*, so every glyph is its own
  baseline band: alignment 0.000. Any alignment gate kills the flagship case.

A **four-way conjunction** (`groupEnum ≥ 0.9 ∧ groupBox% ≤ 1.5 ∧ heightCV ≤ 0.20
∧ groupFill ≥ 0.25 ∧ strokes ≥ 6`) does isolate knuckles — it admits exactly 3
families corpus-wide. But its thresholds sit **within 10 % of knuckles on two of
four axes** (heightCV 0.134 vs 0.20; groupBox 1.44 vs 1.5). That is a fit to one
artwork, not a measurement of a property. Compare the original mechanism, whose
`enumerability` separated marks from textures by 7× with no threshold at all.

## The decisive experiment

Rather than argue about the discriminator, I removed it: **force
`markSupport = 1.0`** for every plural, group-coherent family — far beyond
anything any discriminator could justify — and sweep.

**10 of 38 cases change. knuckles is not one of them.**

Changed: black, doja, horsley (foreground `#0f0f0f` → `#f2eec1`), loups, maroon5,
meteora, nada (foreground `#fbfcf7` → `#84b7c8`), nobs (foreground `#a1162d` →
`#b75dfb`), `03/…`, `11/…`. Several are plain regressions.

So mark support has ample leverage in this corpus. It has **none on knuckles**,
at any value. The blocker is not mark recognition.

## What actually gates knuckles

The foreground lane, ranked by `foregroundRoleScore`:

```
family-8598 #bfb2c4  fgRole 0.603   fgScore 0.502  fgObs 0.755
family-9480 #d8cbdd  fgRole 0.510   fgScore 0.474  fgObs 0.564   <- incumbent
family-7673 #60aac5  fgRole 0.496
family-7715 #9c99c4  fgRole 0.493
... five more ...
family-10782 #f1fcfe fgRole 0.316   fgScore 0.250  fgObs 0.416   <- the lettering
```

The white lettering is not the runner-up; it is **ninth or worse**. And the
deficit is concentrated in `foregroundTypographyObservation` — the foreground
evidence itself, which is exactly what the recorded design rule requires a
foreground swap to earn:

| | best region | box | `sourceSupport` | `geometry` | typography score |
| --- | --- | --- | --- | --- | --- |
| incumbent `#d8cbdd` | 101 px blob | 14×22 | 0.696 | 0.907 | **0.633** |
| lettering `#f1fcfe` | 24 px glyph | 5×9 | 0.465 | 0.761 | **0.434** |

**The actual text scores 31 % lower as typography than an anonymous lavender
blob.** Both `sourceSupport` and `geometry` are driven by
`resolved = clamp(log2(population + 1) / 8)` — an *absolute* pixel count. At
350×350 a glyph is 5×9 px, ~20 px of ink. The representativity rule exists
precisely to stop evidence being read off components that small.

And the one term in `foregroundScore` that mark evidence could legitimately
repair — `clamp(populationFraction / 0.025)`, which reads 0.163 for the lettering
and 1.000 for the incumbent — is not enough on its own: substituting it fully
(which the mark principle would *not* license, since that is a foreground claim
made on support evidence) yields `fgRole = 0.487`, still below the incumbent's
0.510 and below three other families.

## Positive control

`01/…015083…` — the fresh-3 cover Flo praised for a snow-white foreground that
"matches the artwork's text" — carries the same claim with resolvable glyphs:
30 px cap height, 69 admissible components. Its white family is *also* not
recognised as a mark (`markSupport = 0.043`), for a different reason: the
lettering spans the cover, so its group box is 73 % of the frame. The mark
mechanism recognises **compact** marks — a caption, a logo — not full-bleed
display type. Worth knowing, and out of scope here.

## Conclusion

Pointillist art does not defeat *separation* — the 14 glyphs are trivially
separable from 94 single pixels once you look. What defeats this arm is that
separation buys nothing:

1. Every discriminator that admits knuckles without admitting dozens of
   non-marks requires a four-parameter conjunction fitted to within 10 % of the
   target — the kind of rule that breaks on the next artwork.
2. Even granting `markSupport = 1.0`, knuckles' foreground does not move,
   because its foreground evidence is genuinely weaker than the incumbent's.
3. That evidence is weak for a sound reason: 20-pixel glyphs sit at the
   representativity floor. This is a **resolution limit, not a scoring defect**,
   and repairing it would mean reading typography off components the charter
   says carry no evidence.

Shipping attempt 3 would add four tuned thresholds and ~40 lines of accumulator
state to the component hot loop for **zero output change** and a real
generalisation risk. I am not proposing it. Flo's own note — "neither fully
captures that" — reads, in the light of these numbers, as an accurate
description of a limit rather than a request for a fix.

Reproduce with `analyze-survey.ts`:

```
families at knuckles' groupBox% (1.44) or better: 46 of 771
families at knuckles' heightCV  (0.134) or better: 25 of 771
families at knuckles' groupFill (0.278) or better: 152 of 771
```

## Guardrails

Runtime is byte-identical to `d5f2003`. Verified: the sweep with the diagnostic
accumulators compiled in differs from the reverted trunk on **0 of 38** cases,
so the instrumentation was side-effect-free; slim, placebo, the `09/…`
foreground and disney's wordmark are all untouched by construction. Typecheck
clean, architecture test passes.

## Proposed review items

**None from this arm** — there is nothing to review; the output is unchanged.

Two findings worth the orchestrator's attention instead:

1. **`resolved = clamp(log2(population + 1) / 8)` is resolution-absolute.** The
   same artwork at 350 px and at 1400 px yields materially different typography
   evidence for the same glyph (knuckles' 24 px glyph scores `sourceSupport`
   0.465; placebo's 800 px glyph scores 0.857). Whether that is correct is a
   real question — the charter's full-resolution rule exists because
   downsampling destroys identity information, and this is the mirror image:
   *upsampling* would manufacture it. Not obviously fixable, but it is the
   single mechanism behind every small-lettering failure in the corpus.
2. **Mark evidence does not recognise full-bleed display type** (`015083`,
   group box 73 % of frame). If the fresh set contains more covers whose
   identity is large lettering, that is a distinct and probably tractable arm —
   and unlike this one it would have real leverage, since those families are
   well resolved.

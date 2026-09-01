# Track B3 — gradient semantics: a negative result, and why

Branch: `worktree-agent-acd6f08c44777f8a7`
Base: `research/palette-0.9-checkpoint` @ `83ee25b`
Corpus: the real artwork via `PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images`.

**Nothing in `research/v2-3/src` changed.** The runtime is byte-identical to `83ee25b`, so every
reviewed outcome is preserved by construction. This track spent its budget on measurement and is
reporting that the mechanism it was sent to build should not be built the way it was scoped.

## The task

Flo's rule (batch 13): *"a gradient represents continuous shading within one physical surface —
never a transition between two distinct areas/objects."* Two live cases:

- **Case 2** `07/…7b461` (weak-fallback): gradient `#5d856b` → `#99bece` is **grass → sky**. Must
  not be a gradient. The campaign's first extraneous gradient.
- **Case 1** `04/…86c02` (strong): flat `#4d8a15` / `#64a821` are shading on **one leaf**. Should
  perhaps become a gradient.

The proposed mechanism was spatial-structural: shading has an irregular interpenetrating boundary,
distinct areas meet at a coherent partition line with a thin transition band.

## What I measured

Seven statistics, spanning three independent families of ideas. Every one is straddled by
reviewed-strong gradients. The seam is **`07/…7b461`**; everything in the control column is a
reviewed-strong gradient that must keep its gradient.

**Colour-ramp structure**

| statistic | seam `07` | reviewed-strong gradients that break it |
| --- | ---: | --- |
| interior chord occupancy (mass at mid-chord) | 25.3% | `once` **13.4%**, `birdsofprey` 25.4% — *lower* than the seam |
| boundary length / √area | 45.4 | `loups` 38.7, `once` 41.4 — lower; `birdsofprey` 68.8 — higher |
| transition concentration (top 1% of steps) | 0.085 | `doja` 0.108, `havana` 0.100, `loups` 0.159 — all *more* concentrated |
| mid-band thinness (minor axis) | 0.242 | `havana` **0.089**, `loups` 0.177 — far thinner than the seam |
| **`edgeContinuity`** (already computed, never gated) | 0.544 | `birdsofprey` **0.184**, `muse` 0.412 — far *worse* than the seam |
| **`seamConcentration`** (new: jump mass in heaviest band) | 0.222 | `once` 0.340, `placebo` 0.359, `havana` 0.289 — all *more* seam-like |

**Region texture** — the "grass is rough, sky is smooth" idea

| statistic | seam `07` | reviewed-strong gradients that break it |
| --- | ---: | --- |
| endpoint-region roughness ratio | 2.66 | `once` **3.77**, `muse` **2.67** — at or above the seam |

I built `seamConcentration` specifically to fix the blind spot in `edgeContinuity` — that statistic
totals the magnitude of abrupt colour jumps but discards *where they are*, so a clean seam and
scattered texture score alike. Localising the jump mass along the fit axis was the natural repair.
It did not separate either, and I reverted it rather than ship an ungated statistic that does not
work.

The texture-asymmetry test was my own leading recommendation for what to try next. I measured it
rather than hand it on as a suggestion, and it is refuted: `muse` sits at 2.67 against the seam's
2.66. Two flat colour blocks with hard edges and a photograph of grass under sky are not separable
this way either.

## Why nothing separates — the actual finding

The normalized interface length between the two families supporting each gradient
(`boundaryEdges / 2√min(population)`, the idiom flat pairs already use) explains it:

| case | direct boundary edges between the two endpoint families | interface |
| --- | ---: | ---: |
| **`07` grass ↔ sky** | **45** | **0.077** |
| `loups` | 30 | 0.089 |
| `birdsofprey` | 0 | 0.000 |
| `muse` | 0 | 0.000 |
| `once` | 1008 | 0.926 |
| `havana` | 15 491 | 16.06 |
| `doja` | 13 651 | 36.45 |
| `placebo` | 68 919 | 57.04 |
| `slim` | 152 670 | 154.52 |

**Grass and sky barely touch.** 45 boundary pixels in a 640×640 image. They are separated by a
band of intermediate colour — the hazy horizon and the distant treeline — and the algorithm's own
midpoint for this case is `#86b1c1`, which *is* that haze.

So at the level of colour populations and their spatial relations, **`07/…7b461` genuinely is a
gradient**: two field colours joined by a real, populated, spatially-coherent intermediate ramp.
It scores like a gradient on every structural statistic because it *is* one, structurally. It is
also sitting exactly where the reviewed-strong gradients sit (`loups` at 0.089 is
indistinguishable from it).

What makes it wrong is that a human knows sky and grass are **different things**. That is
semantic, not structural. No statistic over colour distributions and their adjacencies can recover
it, because the artwork's colour structure is not what is wrong — the atmospheric haze really does
ramp continuously from grass to sky in this photograph.

This also explains the inverse case. **Case 1's leaf did not become a gradient**, and the reason is
visible in the same table: its two greens are one family's shading, broken up by hundreds of water
droplets. It produces no gradient hypothesis at all, and forcing one would require relaxing gates
that currently protect every other case.

## What I did not do, and why

I could have found a threshold that catches `07`. Every statistic above has values that would.
Each one also requires accepting `birdsofprey`, `muse`, `loups`, `once` or `havana` as collateral —
all reviewed strong, several of them the campaign's flagship gradients. Charter rule 5 makes an
incorrectly *prevented* gradient exactly as bad as an incorrectly allowed one, and Track B2 has
just been through what it costs to fit a rule to a verdict whose cause lies elsewhere (the placebo
midpoint, where the human's stated reason — shadow material — was not the property being
thresholded, and the bar took approved collateral).

Shipping a gate here would be that error again, knowingly, and against the campaign's best cases.

## Recommendation

**Do not pursue a colour-structural gradient-semantics gate.** The distinction Flo is drawing is
about *what the regions depict*, and the two cases are structurally indistinguishable in colour
space. Three directions that could actually work, in order of how much I would trust them:

1. **Accept that `07` is out of reach for now.** It was weak-fallback for three independent
   reasons (foreground should be white, accent should be marmalade orange, gradient wrong). The
   other two are ordinary role-selection problems, they are not blocked by any of this, and they
   are worth more than the gradient.
2. **Ask for more verdicts before trying again.** The campaign has exactly **one** confirmed
   extraneous gradient. Every threshold above was fitted against n=1, which is why each one found
   a value that "works" and takes flagship gradients as collateral. A second and third confirmed
   seam would tell us whether the class is even coherent; right now it might be one photograph.
3. **If it is pursued, it needs a different kind of evidence entirely** — orientation/frequency
   structure per region (grass is directional, not merely rough), or scene-level cues. That is a
   materially larger piece of machinery than a statistic over colour populations, and on n=1 I
   would not fund it yet.

Directions I tested and would **not** revisit: colour-ramp geometry (six variants above) and
scalar region roughness. They are exhausted.

## Verification

- `research/v2-3/src` byte-identical to `83ee25b` (`git diff` empty); all 34 fixtures and every
  recorded verdict outcome preserved by construction. No sweep needed or run.
- Probes are reproducible: `probe-structure.ts`, `probe-continuity.ts`, `probe-interface.ts`,
  `probe-texture-asymmetry.ts`.
- The `seamConcentration` implementation is recorded in this commit's history for reuse but is not
  in the runtime.

## Reported, not acted on

- **`04/…86c02` accent.** Flo noted an orange-brown line (the leaf's midrib) as a possible accent.
  It is the small-element class — a thin, low-population feature. The current accent is `#35710f`,
  another green. This is the same class as several earlier "the small colourful thing should be
  the accent" notes and belongs to whichever track owns mark support.
- **`08/…82192`** (gradient correct, surface should be the champagne clouds) is an endpoint-choice
  problem inside a correct gradient, not a gradient-semantics problem. Its interface (0.781) and
  continuity (0.832) are both healthy.

## Proposed review items

None from this track. Nothing changed, so there is nothing to review. If the orchestrator wants
`07/…7b461` pursued, the useful next artefact is the per-band texture-asymmetry measurement in
recommendation 2, and it should be scoped as a measurement first, not a gate.

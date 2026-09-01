# Track E — salient-mark support (`markSupport`)

Base commit: `ab3c2d1` (current trunk).
Files touched: `research/v2-3/src/internal/{policy,palette-core,palette-quality,endpoint-refinement}.ts`.

> **Revision 2 (post batch-10 review).** Batch 10 preferred `slim` STRONG and
> accepted `muse`, but **rejected `placebo`**: the incumbent dark accent
> `#111312` was preferred STRONG over the mechanism's red `#c91611`, with the
> note that the accent role is used for icons/UI elements, not text. Section
> **"Revision 2"** below has the diagnosis and the fix. The narrative above it
> describes revision 1 and is kept because the measurements still stand; where
> revision 2 changed a conclusion it says so.

## Hypothesis

Human review established a failure class: **small, vivid, salient elements —
typically lettering — cannot compete for the chromatic roles.** The diagnosis in
the brief was that *support* dilutes them. Instrumenting the evidence pass
confirmed it precisely.

`images/placebo.jpg`, the flagship case: the red "PLACEBO SLEEPING WITH GHOSTS"
lettering is `family-6039` (`#cc150f`, 0.24 % of pixels, seven connected
components — the letters). Its **region observations are excellent**: every
letter scores `repetition = 1.000`, `geometry = 0.998`, `sourceSupport = 0.86`.
Its **population-normalised support is nil**:

| term | formula | red lettering |
| --- | --- | --- |
| `supportQuality.totalSupport` | `populationFraction / 0.08` | 0.030 |
| `supportQuality.connectedSupport` | `largestComponentFraction / 0.08` | 0.005 |
| `signatureScore.coherentSupport` | `largestComponentFraction / 0.002` | 0.214 |

The family did reach the signature lane (rank 16 of 16) but **zero of the 1500
scored candidate treatments used it as an accent**: the accent shortlist keeps
four *distinct families* per foreground, chosen by
`0.50·fidelity + 0.25·supportQuality + 0.25·utility`, where two of the three
terms are population ratios. The red ranked 13th by family.

**Hypothesis.** A family whose region observations show it is a *deliberate
mark* — an enumerable set of repeated, resolved, interior strokes materially
separated from the field — carries artwork identity that its population fraction
cannot express. Let that measured evidence **substitute** for the
population-normalised support terms, bounded and parametric, without admitting
noise.

A second, physical observation motivates one design choice. Boundary contrast is
measured pixel-adjacent, and a small element's perimeter is *mostly anti-aliased
blend*: placebo's red letters measure `localContrast = 0.055` against a teal
ground they are actually ~0.26 away from in OKLab, because their immediate
neighbours belong to the intermediate blend families. Boundary contrast
therefore under-reads an element **in proportion to how small it is** — exactly
the elements this evidence exists to recover. So the mark's salience is measured
prototype-to-prototype against the field-owning families, where anti-aliasing
cannot reach it.

## What changed

### 1. `policy.ts` — a new `mark` block (all thresholds parametric)

`substitution: 0` restores the previous behaviour exactly.

### 2. `palette-core.ts` — `markSupportOf()`

Per family, from evidence already computed:

```
qualifying = role-observation components with
               population ≥ max(12 px, 2e-5 · pixelCount)   // never a bare pixel, at any resolution
               repetition   ≥ 0.5                           // looks like its siblings
               borderContact ≤ 0.25                         // inside the frame, not bleeding off it
               fill         ≥ 0.08                          // a stroke, not a scatter

markSupport = plurality × coherence × resolution × separation × strokeCoverage × enumerability
```

with `plurality` requiring ≥ 3 qualifying components (saturating at 6),
`coherence`/`resolution` the mean repetition/geometry of the top strokes,
`separation = min OKLab distance to the two field-owning prototypes / 0.12`,
`strokeCoverage = Σ stroke population / family population` and
`enumerability = stroke count / family component count`.

The factors are **multiplied**, so each is a necessary condition. The last two
are what make the mechanism selective: a scattered texture also produces plenty
of small, mutually similar, interior components, but they are a handful out of
*thousands* and account for a sliver of the family; lettering is an enumerable
set of strokes that is essentially the whole family on both counts. Because the
retained component set is bounded (8 largest + 24 role-observed), a family
fragmented into thousands of pieces cannot reach `enumerability` even in
principle.

### 3. Four substitution sites — always `max(populationTerm, substitution · markSupport)`

| site | term substituted |
| --- | --- |
| `palette-core.supportQuality` | `totalSupport / 0.08`, `connectedSupport / 0.08` |
| `palette-quality.roleSourceSupport` | `totalSupport / 0.08`, `connectedSupport / 0.08` |
| `palette-core.signatureRoleScore` | `signatureScore`'s `coherentSupport` term — **removed in revision 2** (measured no-op) |
| `palette-core.buildIdentityObligationSelection` | the shortlist's `regionEvidenceLevel` — **reverted in revision 2** (this is what review rejected) |

The obligation-shortlist substitution is the one that makes placebo possible at
all: identity-obligation families get *priority retention* in the accent
shortlist, so it is the only route by which a 0.24 % family becomes a candidate.
Its ranking key is the family's best single region score, which is exactly the
quantity anti-aliasing depresses; mark evidence measures the same claim across
the whole family and independently of population, so the stronger of the two
looked like the honest reading.

> **Revision 2 overturns this paragraph.** It is the substitution review
> rejected, and it is reverted. Repairing a measurement handicap and
> *manufacturing an identity obligation* are not the same act — see
> "Revision 2 — the placebo rejection" below.

`endpoint-refinement.ts` sets `markSupport: 0` on gradient-endpoint families —
they describe a field by construction — so that path is bit-identical.

### Rejected during development (measured, then removed)

- **Substituting the concentration terms too** (`signatureScore.componentCoherence`,
  `roleSourceSupport.concentration`). Needed while `markSupport` was still loose;
  once `enumerability` was added they became unnecessary, and dropping them
  removed nothing from the results. Smaller diff wins.
- **`markSupport` without `enumerability`/`strokeCoverage`.** Nearly every
  non-field family scored 0.85–1.0 and the blast radius was **20 of 38** cases,
  including clear regressions (artofficial foreground turned yellow, johns lost
  its red accent, vvbrown inverted).
- **Min-aware `representativeness`** (`0.65·mean + 0.35·min`, mirroring the
  sibling `treatmentSourceSupport` aggregate) to stop one weak-support role being
  buried by the average — brief item (b). Measured: it does **not** flip slim's
  foreground, so it buys nothing here. Reverted.

## Results (revision 1 — superseded, kept for the record)

Full 34-fixture sweep + 6 off-panel cases, baseline = `f0d7705` (verified
identical to `review-fixtures.ts` on all 34). These are the outputs batch 10
reviewed. For the shipping numbers see **Revision 2 — Results** below.

### Changes: 3 of 38, accent only

| case | role | before | after | note |
| --- | --- | --- | --- | --- |
| `images/placebo.jpg` | accent | `#111312` (near-black) | **`#c91611`** | **target hit** — the "Fire Hydrant" red lettering, the colour Flo hand-tested as "works very very well" |
| `images/slim.jpg` | accent | `#56676f` (grey-blue) | **`#df2a33`** | **target partly hit** — the "Slim Shady" red lettering is now the accent; the foreground is **still `#37c2eb`** (see below) |
| `images/muse.jpg` | accent | `#82d1ef` | `#10a4d4` | **knock-on, attributed** — see below |

Background, surface, foreground, gradient flag, both collapse flags and the
gradient midpoint are **unchanged on all 38 cases**.

### Guardrail

| case | before | after |
| --- | --- | --- |
| `09/…9d178a401f9433fdddff2` | `#000000 #21203f #15a6a9 #fbdd41` flat | **identical** |

No chromatic foreground was swapped anywhere in the corpus; every change is an
accent, which is what the brief asked for.

### muse attribution

`muse`'s white lettering/glow family (`#f2fafd`, 3.8 % of pixels, 23 strokes of
86 components) earns `markSupport = 0.235`. Its `connectedSupport` term was
`0.0167 / 0.08 = 0.209`, so the substitution adds **+0.026 to one term**,
i.e. +0.006 to that family's `supportQuality`. That tipped a **sub-utility-
resolution** ordering band between two adjacent blues of the same artwork
(`#82d1ef` → `#10a4d4`, the more saturated of the two). The foreground family is
unchanged; only which cyan sits in the accent slot moved. Plausible either way —
this is the one item in the batch I cannot call.

### Mark census — who earns the credit

Across all 38 images, only these families reach `markSupport ≥ 0.4`:

| case | family | mark | strokes / components | pop |
| --- | --- | --- | --- | --- |
| placebo | `#cc150f` red lettering | 0.998 | 7 / 7 | 0.24 % |
| slim | `#dc2b31` red lettering | 0.993 | 12 / 12 | 0.43 % |
| disney | `#fbfdfa` white wordmark | 0.925 | 15 / 15 | 2.24 % |
| 05/… | `#f62020` title block | 0.819 | 12 / 12 | 0.11 % |
| 05/… | `#fc6c23` title block | 0.809 | 14 / 14 | 0.12 % |
| placebo | `#fbfdf8` white specular | 0.780 | 18 / 23 | 0.73 % |
| skap | `#259d81` teal mark | 0.628 | 8 / 11 | 0.28 % |
| 05/… | `#965096`, `#71c343`, `#992796` blocks | 0.60, 0.60, 0.55 | 15/20, 5/5, 9/13 | ~0.1 % |
| ybbb | `#f8eeb3` cream lettering | 0.483 | 17 / 30 | 0.28 % |
| 11/… | `#c35151` red swoosh | 0.403 | 6 / 10 | 0.04 % |

Every one of these is lettering, a wordmark, or a graphic block. Nothing else in
the corpus exceeds 0.4, and the median family earns < 0.01. Most of the list
changes nothing, because those families were already well supported (disney,
skap, ybbb) — the substitution is a `max`, so it is a no-op wherever population
support already exists.

## Honest assessment

**Achieved**

- placebo accent lands on the `#d01510` family (`#c91611` is its dense-exact
  representative). This was the acceptance target and it is a clean hit.
- slim's accent is now the red text. The one remaining *unacceptable*-rated
  fixture at least stops rendering its palette without the artwork's dominant
  graphic colour.
- Guardrail untouched; blast radius 3 / 38, all accents, fully attributed.
- Determinism verified (3 identical runs on each changed case), typecheck clean,
  architecture test passes (no fixture hexes or case ids in runtime code — the
  mechanism is entirely evidence-driven).

**Not achieved, with diagnosis**

1. **slim foreground is still `#37c2eb`.** The winning treatment now pairs that
   cyan foreground with the red accent. The best alternative foreground
   (`#56676f`, same accent) is 0.013 behind on `relationUtility`, and the *entire*
   gap is `foregroundPath` (0.91 vs 0.70, weight 0.15): the cyan simply has far
   more APCA contrast against the near-black field. Closing that means reweighting
   the readability axis for foregrounds — outside this track's mandate, and the
   exact move the `09/…` guardrail exists to prevent. I did not attempt it.
   (`family-8092`, the cyan, earns `markSupport = 0.023`: 3 qualifying strokes of
   28 components. It is a *weaker* mark than the red by every measure — but the
   mechanism only adds support, it does not subtract it.)
2. **knuckles foreground unchanged (`#d8cbdd`, not the white text).** The white
   family is 153 components at 350×350, of which 14 qualify as strokes
   (`enumerability = 0.09`, `markSupport = 0.031`). The artwork is pointillist:
   the same family holds the lettering *and* thousands of white speckles. Under
   the representativity rule I cannot separate them with this evidence, and
   loosening `enumerability` until it passes is what produced the 20/38 blast
   radius. Reported as not achievable rather than forced.
3. **`03/…89643a.jpg` gold lettering unchanged.** The gold text components on
   that 300×300 thumbnail are 3–4 px each — below the 12 px stroke floor. These
   genuinely are near-bare-pixel fragments; the mechanism correctly declines.
   Recovering them needs resolution, not scoring.
4. **`05/…5e5a5ff6` still has the grey accent** despite holding the strongest
   chromatic marks in the whole corpus (`#f62020` at 0.819, `#fc6c23` at 0.809).
   The mark evidence lifts them to obligation-shortlist level 20 — and the four
   available obligation slots are all taken by *near-neutral* families at level
   21+ (`#86858b`, `#121117`, `#212330`, `#33383c`), which the 0.025
   material-distance dedup does not merge because they are lightness-separated.
   This is an **identity-direction diversity** problem, not a support-dilution
   one: four greys crowd out every chromatic direction in the artwork. Out of
   this track's mandate; worth flagging to the orchestrator as a distinct,
   well-evidenced defect.
5. **`11/…2b222b02` still has `#8d9fc3`,** for the same reason at lower
   amplitude (`#c35151` earns 0.403).

**Uncertainty**

- `muse` is a genuine coin-flip and is in the batch to be adjudicated.
- The `fieldSeparation = 0.12` saturation and the `minimumComponentPopulation =
  12` floor are the two thresholds with the least evidence behind them. Both are
  parametric; neither is load-bearing for placebo or slim (the two targets score
  0.99+ with wide margin on every factor), but both would matter for a borderline
  artwork the corpus does not contain.
- The mechanism is *additive only*. It never demotes a family. Everything it
  changed, it changed by making one small family competitive — which is the
  narrowest failure mode I could give it.

## Proposed review batch (revision 1 — this is batch 10, already reviewed)

Compare `baseline` (= `f0d7705`) against `track-e`. Verdicts received: item 1
**rejected** (incumbent preferred strong), item 2 **preferred strong**, item 3
equal/strong, items 4–5 unchanged as designed.

| # | case | why |
| --- | --- | --- |
| 1 | `images/placebo.jpg` | The target. Accent `#111312` → `#c91611`. Flo hand-tested this red and called it "works very very well" — this confirms the mechanism reproduces a human-endorsed choice from evidence alone. |
| 2 | `images/slim.jpg` | Accent `#56676f` → `#df2a33`. The only remaining *unacceptable*-rated fixture. Does the red accent fix it, or does the `#37c2eb` foreground still sink it? Needs an absolute verdict, not just a preference. |
| 3 | `images/muse.jpg` | The one unattributed-quality knock-on. Accent `#82d1ef` → `#10a4d4`, both blues from the artwork. Sub-resolution band flip; I cannot call it. |
| 4 | `09/…9d178a401f9433fdddff2` | Guardrail. Identical on both sides — will render as a single-palette absolute-verdict item and confirm nothing moved. |
| 5 | `images/disney.avif` | Negative control with teeth: its white wordmark earns `markSupport = 0.925`, the third-highest in the corpus, and the output is byte-identical because the family was already well supported. Also renders as a single palette. |

Items 4 and 5 are deliberately identical pairs — the review app renders those as
single-palette absolute verdicts, which is exactly what a guardrail and a
negative control should collect.

## Revision 2 — the placebo rejection

### Diagnosis

The question was whether the red wins on placebo for the same reason it wins on
slim. It does not, and the difference is structural, not marginal.

**Head-to-head on the winner's own field.** Axes are
`fieldFidelity surfaceFidelity artworkIdentity representativeness sourceSupport
renderedGradientSalience foregroundPath accentFidelity accentPath coherence
economy`.

`placebo`, identical background/surface/foreground (`#6c8a8a` / `#86a5aa` / `#fbfdfa`):

| accent | quality utility | relation utility | identity gain | accentPath |
| --- | --- | --- | --- | --- |
| `#111312` incumbent | **0.8344** | 0.8523 | 0.0179 | **0.86** |
| `#c91611` red mark | 0.8144 | **0.8876** | **0.0732** | **0.65** |

The red **loses the quality domain by 0.0200** and wins only through identity
gain, which is nearly four times the incumbent's. And `accentPath` — the axis
that measures how the accent reads on the rendered field, i.e. exactly its
fitness as a UI element — is **0.65 against the incumbent's 0.86**. The human
verdict and the axis agree.

`slim`, trunk incumbent vs the arm's winner:

| treatment | quality utility | relation utility | accentPath | accentFidelity |
| --- | --- | --- | --- | --- |
| `#37c2eb` fg / `#56676f` accent (trunk) | 0.7571 | 0.7683 | 0.74 | 0.70 |
| `#56676f` fg / `#df2a33` accent (arm) | 0.7570 | 0.8262 | **0.80** | **0.82** |

Quality utility is a **tie to four decimal places**, and the red accent is
*better* than the incumbent on both accent axes. So "identity gain decides it"
is true of slim too — it is not the discriminator.

**The discriminator is where the identity obligation came from.** Running the
obligation shortlist on trunk, with mark evidence absent entirely:

| case | is the red family an identity obligation on trunk? |
| --- | --- |
| `slim` `family-6480` `#dc2b31` | **yes — priority 3, region evidence level 21**, nominated by the artwork's own region evidence |
| `placebo` `family-6039` `#cc150f` | **no.** Level 18, below the level-20 cut. The four slots go to `#fbfdf8`, `#84694e`, `#9d8060`, `#b2b9b1` |

Revision 1 substituted mark evidence into the shortlist's ranking key, which
promoted placebo's red from *no identity direction at all* to **priority 0**.
Slim's red needed no such promotion — it was already nominated, and only needed
the support handicap removed to win on its own merits.

### The principle

> **Mark evidence repairs a handicap in fair competition. It does not confer an
> entitlement.**

An identity obligation is the strongest claim in this system: it grants priority
retention in the role shortlists *over better-scoring alternatives*, and it
carries identity coverage into the winner objective. Manufacturing that claim
from a substituted quantity over-reaches — it converts "this family should not be
penalised for being small" into "this family must appear", which is a different
and much stronger statement, and the one review rejected.

This is the coordinator's direction (a), and the measurements say it is the right
one rather than direction (b): the hue/field test does not separate the two cases
(placebo's red *does* add a hue direction the teal-and-white palette lacks), and
the quality-domain test does not either (slim's red does not beat its incumbent
on quality — it ties).

### The change

Revert the substitution at exactly one site: the identity-obligation shortlist's
`regionEvidenceLevel`. Nomination goes back to the artwork's own source-connected
region evidence.

Two further sites were then measured and **also removed as unnecessary**:

- `signatureRoleScore` (the `signatureScore.coherentSupport` substitution) is a
  **no-op on all 38 sweep cases** once the support substitution is in place.
  Dropped rather than carried as an unexercised path that would move rankings on
  inputs no review has seen. Noted in the source as the obvious next site if
  evidence for it appears.

The mechanism is now exactly one rule at two sites: **the population-normalised
`totalSupport` and `connectedSupport` terms of `supportQuality` and
`roleSourceSupport` accept measured mark evidence as a substitute.** Everything
that decides *candidacy* — lanes, obligations, shortlist membership — is
untouched by mark evidence.

### Results (base `ab3c2d1`)

Against trunk — **2 of 38 differ**:

| case | role | trunk | arm | verdict |
| --- | --- | --- | --- | --- |
| `images/slim.jpg` | foreground | `#37c2eb` | `#56676f` | batch 10: **preferred, STRONG** |
| | accent | `#56676f` | `#df2a33` | last unacceptable-rated fixture fixed |
| `images/muse.jpg` | accent | `#82d1ef` | `#10a4d4` | batch 10: equal, strong |

Against the reviewed revision-1 arm — **1 of 38 differs**: `placebo` accent
`#c91611` → `#111312`, i.e. exactly the rejected change and nothing else.

- `placebo` **byte-identical to trunk** (all four roles, gradient, both collapse
  flags, midpoint).
- `slim` and `muse` **byte-identical to the reviewed arm**.
- Guardrail `09/…9d178a401f9433fdddff2` identical to trunk.
- Background, surface, gradient flag, collapse flags and midpoint unchanged on
  all 38 cases; `slim` is the only foreground change in the corpus.
- Determinism verified (3 identical runs per changed case), typecheck clean,
  architecture test passes.

### Honest note on what this costs

Placebo's red lettering is no longer reachable as an accent — not because the
mechanism scores it badly, but because it is not an identity direction by the
artwork's own region evidence, so it never enters the accent shortlist. Flo's
hand-test of `#d01510` was performed on an **older field**; on the field placebo
now carries (Track A's teal pair) the same red measures `accentPath = 0.65`
against the incumbent's `0.86`, and review preferred the incumbent. I take the
current data over the older hand-test, as instructed.

The still-open items from revision 1 (`knuckles`, `03/…`, `05/…`, `11/…`) are
unchanged and their diagnoses stand. The `05/…` finding is the one I would still
escalate: four *near-neutral* families take all four obligation slots and crowd
out every chromatic direction in a deliberately many-coloured artwork. Revision 2
makes that finding sharper rather than weaker — obligation *nomination* is now
the sole gate on chromatic candidacy, so if it is mis-ranking, that is where to
look. It is a distinct defect from support dilution and wants its own arm.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/run.ts <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/diff.ts trunk arm-final
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/mark-census.ts [case-filter]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/determinism.ts
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/inspect-families.ts <image> [--focus #hex]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/inspect-obligations.ts <image...>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/inspect-candidates.ts <image> <role> <family-id>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-e/inspect-accent-rank.ts <image>
```

`data/trunk.json` is the `ab3c2d1` sweep, `data/arm.json` the reviewed
revision-1 arm, `data/arm-final.json` this branch.
Images are read from `/Users/Flo/GitHub/palette/` because `images/` and the
numbered sample directories are gitignored and absent from a worktree.

# Track X — whole-palette gamut coverage

**Trunk:** `979c245`. **No runtime changes** — nothing under `research/v2-3/` is touched (`git status
research/v2-3/` is empty). Everything here is measurement plus a review series.

**Corpus:** unscrambled artwork read from the shared checkout `/Users/Flo/GitHub/palette` via
`PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images` (charter, "corpus trap"). **249 artworks
profiled**: 89 reviewed, 10 further `images/` fixtures, and **150 freshly-drawn, previously unmined
artworks** taken by deterministic stride over the 5,715-file hashed sample directories, excluding
everything already reviewed or on the off-panel manifest. No scrambled decoy is used anywhere.

---

## The question

Verbatim from the reviewer:

> are we trying too much to extract the roles individually instead of looking at the whole thing? some
> colorful artworks sometimes end up with a bland or almost mono-hue palette... I don't know concretely
> if many artworks would be helped by this, nor what "looking at the whole thing" really entails
> technically.

Two unknowns, two measurements. **How many** artworks: §4. **What it entails technically**: §1.

---

## 1. What "looking at the whole thing" entails — the statistic

An artwork's chromatic content is a distribution of **chroma-weighted mass over hue direction**. A
palette is four colours. The question "does the palette look at the whole thing" becomes: *for every
degree of hue the artwork spends colour on, does the palette contain a colour that could stand for it?*

    cover(b)  = max over roles r of  [ hueGap(h_r, b) ≤ W ] · min(1, C_r / C(b))
    COVERAGE  = Σ_b mass(b)·cover(b) / Σ_b mass(b)

The hue histogram is **Track U's validated convention, unchanged**, so every number here is comparable
to its published calibration:

- OKLab; `chroma = hypot(a, b)`; `hue = atan2(b, a)` in degrees;
- a pixel is chromatic iff `chroma ≥ 0.06` — `identityDirectionChroma`, the runtime's own floor, not a
  number invented for this track;
- 360 one-degree bins; each chromatic pixel contributes **its chroma** to `floor(hue)`;
- every pixel at native resolution: no stride, no downsampling.

`validate.ts` reproduces four of Track U's published hue-direction masses **to the last reported digit**
(EL JOSI red 31.30 %, KOLIN 17.19 %, `0f8156` pink 20.26 %, `0cd48f` 8.51 %; 4/4 within 0.05 pp). If
those had not matched, nothing downstream would be worth reading.

Two things are deliberately in the formula, and each maps to a specific complaint:

- **the hue window** — "is there a colour in this direction at all?" That is `0f8156`: *"a couple
  splashes of colour around pink and purple"*, none of them in the palette.
- **the chroma-adequacy factor `min(1, C_r / C(b))`** — "is it chromatic *enough* to read as that
  colour?" That is `02881a` (*"surface dull, almost grayish, when the artwork is so very colorful"*) and
  `0cd48f` (*"foreground very close to black … missing identity"*). A near-black violet sits in the
  violet direction and still earns almost nothing, which is exactly what the reviewer said about it. No
  special case is needed for neutral roles: their chroma is near zero, so they cover nothing, smoothly.

**No hard gate on the palette side.** A role at chroma 0.059 scoring 0 and one at 0.061 scoring 0.4
would be an artefact of a threshold rather than of anything a viewer sees, so credit is continuous.

### The ceiling — why a raw coverage number is not enough

Four slots cannot cover an artwork with eight hue families, and the reviewer said so himself on
`14adcd`: *"it's more colours than we can fit in our palettes"*. So coverage is always reported against
**`CEILING(k)`** — the largest fraction of hue mass any `k` perfectly-placed, perfectly-saturated
colours could cover. This is circular maximum coverage with fixed-length arcs, solved **exactly** by
enumerating the cut and running a linear DP (`ceilingForK`, O(360·360·k), deterministic, no heuristic).
Then `EFFICIENCY = COVERAGE / CEILING(4)` separates *we did badly* from *the artwork does not fit*, and
`SPREAD` — the smallest k whose ceiling reaches 80 % — says how many directions the artwork actually
needs.

### Two formulations that FAILED, reported because they failed

| statistic | idea | AUC |
| --- | --- | ---: |
| **coverage** | as above | **0.872** |
| efficiency | coverage ÷ 4-slot ceiling | 0.848 |
| topUncoveredShare | mass of the single largest missing direction | 0.774 |
| **blandness** | `meanChroma × (1 − coverage)` — condition on how much colour there was to lose | **0.519** |

`blandness` was my prior favourite and it is worthless (0.52 ≈ chance). It over-weights *bulk* colour
and therefore misses precisely the splash complaints — `0f8156` (5.9 % chromatic pixels) and `placebo`
(bright red text at 0.023 % of pixels) — that motivated the class. **Chroma² weighting also failed**: it
was tested on the same profiles at no cost and is worse than linear at every window (0.82–0.88 vs
0.83–0.90), so Track U's linear convention survives on evidence rather than inheritance.

**The window was not tuned.** `±15°` is Track U's, adopted before the validation was run. AUC across
`±10°…±40°` is 0.834–0.902 with a shallow maximum at ±25–30°; tuning the window on the same eight
complaints used to validate it would be circular, and the gain (0.03 AUC on 8×46 comparisons) is inside
the noise anyway. The full sensitivity table is `data/bakeoff.md`.

---

## 2. Criterion validity — does it reproduce the complaints?

Eight complaint cases mined from the **live** warehouse (161 records, 95 artworks, latest verdict per
artwork), against **46 reviewed-strong colourful controls** (verdict `strong`, `meanChroma ≥ 0.02`).

| id | reviewer's own words | coverage | rank of 249 | pct | verdict |
| --- | --- | ---: | ---: | ---: | --- |
| `0f8156` | splashes of pink and purple, none represented | 3.6 % | 8 | 3 % | weak-fallback |
| `09d178` | *"a lot of red shades … would be stronger with a red surface"* | 11.6 % | 16 | 6 % | acceptable |
| `02881a` | *"surface dull, almost grayish, when the artwork is so very colorful"* | 15.4 % | 22 | 9 % | strong |
| `0cd48f` | *"very close to a black when the artwork has many colors … missing identity"* | 16.5 % | 23 | 9 % | acceptable |
| `05230f` | *"many colors … they could be used as the accent"* | 27.1 % | 40 | 16 % | strong |
| `placebo` | *"the accent would be amazing if it was fire hydrant red"* | 31.4 % | 44 | 18 % | strong |
| `081dec` | *"surface should be that champagne shade"* | 76.9 % | 131 | 53 % | strong |
| `14adcd` | *"more colours than we can fit in our palettes"* | 75.9 % | 128 | 51 % | strong |

**AUC 0.872.** Six of eight land in the worst 18 % of the corpus. Median complaint percentile 16 %,
median control percentile 59 %.

**The two misses are honest and both are informative.**

- `081dec` — the reviewer wants the sky's *champagne gold* instead of grey. The palette already has a
  colour in that hue direction; what is wrong is its **lightness**. This is precisely the limit Track U
  documented ("what is missing is a lightness variant of an already-represented direction"), and a
  hue-coverage statistic cannot see it by construction. It should not be papered over: **a coverage axis
  would not fix `081dec`.**
- `14adcd` — the honest hard case, and the ceiling is what catches it. 72.8 % of its pixels are
  chromatic and **four slots physically cannot cover more than 85.6 %** of its hue mass — the second
  lowest `CEILING(4)` in the complaint set. We achieve 75.9 %, i.e. **88.7 % efficiency**. The statistic
  agrees with the reviewer that this is not a defect but a slot shortage, which is exactly the behaviour
  a ceiling-aware measure exists to give.

### Not a cherry-picked set

Every reviewed artwork, bucketed by its latest verdict — the statistic was never fitted to this:

| latest verdict | n | p10 | p25 | **median** | p75 | p90 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| strong | 71 | 27.1 | 56.1 | **79.2** | 93.6 | 99.2 |
| acceptable | 16 | 11.6 | 24.2 | **68.7** | 82.4 | 86.4 |
| weak-fallback | 4 | 3.6 | 3.6 | **19.0** | 48.2 | 48.2 |

Monotone in the right direction across all three grades.

### False positives, stated plainly

At the **median** complaint threshold (< 16.5 % coverage): **0** reviewed-strong artworks flagged.
At the **mildest** complaint threshold (< 31.4 %): **5** flagged — `083a2d` (2.4 % chromatic: a grey
artwork, correctly grey palette, a genuine false positive), `02dc28`, `0e91d6`, `knuckles`, `088460`.
`knuckles` needs 6 hue directions and got 2, so it may be a true positive nobody has complained about
yet; I am not going to claim that without a verdict.

Note that three of the eight complaint cases are graded **`strong`**. The human accepted the palette
overall *while writing the colour complaint in the note*. **The note is the label here, not the grade** —
which is exactly why this class has been invisible to every grade-based metric we have.

---

## 3. What the statistic says the palettes are doing

Across the 249: the median artwork's palette covers **74.9 %** of its hue mass, but **15 of 127** artworks
in the colour-bearing fresh population (11.8 %) publish a palette in which **not one of the four roles
clears chroma 0.06** — four neutrals for an artwork that has colour. That is the "almost mono-hue
palette" the reviewer named, and it is measurable.

---

## 4. HOW MANY — class size

Estimated on the **150 fresh, previously unmined artworks only**, which is the unbiased sample; the
reviewed set is contaminated by having been selected for review.

Population: 127 of the 150 clear the chromatic floor (**1.9 % chromatic pixels**, read off `05230f`, the
least chromatic artwork anyone has complained about). The other 23 are genuinely near-greyscale, where
low coverage is the *right* answer.

| threshold | count | share of colour-bearing population | share of all fresh |
| --- | ---: | ---: | ---: |
| below the mildest complaint (< 31.4 %) | 22 | **17.3 %** | 14.7 % |
| below the median complaint (< 16.5 %) | 10 | **7.9 %** | 6.7 % |
| below 50 % coverage | 37 | 29.1 % | 24.7 % |

**Severe subset** — below the median complaint *and* ≥ 20 % of pixels chromatic, i.e. artworks nobody
would call subtle: **5 of 150 = 3.3 %**. `05fa7c` (15 % cov / 40 % chromatic), `003732` (4 / 23),
`08c1c0` (6 / 33), `103a37` (3 / 25), `12eb9a` (12 / 28).

**Answer to "how many":** roughly **8 % of colour-bearing artwork** sits below the coverage level at
which a human has already complained, and **3.3 % of all artwork is severe and unambiguous**. Scaled to
the 5,715-file sample corpus that is ~380 and ~190 artworks respectively. It is a real class, not a
handful of anecdotes — and it is not a majority either.

---

## 5. Recall or scoring? — the decisive result

For 17 worst-coverage cases the candidate domain was replayed exactly as
`research/v2-3-eval/export-candidates.ts` does, and **every** candidate scored for coverage (free, from
the cached profile).

| id | published coverage | best on slate | at rank | ceiling |
| --- | ---: | ---: | ---: | ---: |
| `14ca8b` | 0.7 % | 84.5 % | 643 | 99.9 % |
| `103a37` | 2.7 % | 82.6 % | 1167 | 99.5 % |
| `0f8156` | 3.6 % | 65.2 % | 1446 | 94.4 % |
| `003732` | 3.8 % | 92.2 % | 636 | 98.1 % |
| `0b19cd` | 3.8 % | 99.6 % | 202 | 100.0 % |
| `0353c1` | 4.5 % | 98.8 % | **3** | 100.0 % |
| `08c1c0` | 5.7 % | 92.9 % | 606 | 100.0 % |
| `02dae9` | 7.4 % | 75.7 % | 939 | 99.7 % |
| `04578f` | 9.8 % | 82.8 % | 669 | 89.2 % |
| `09d178` | 11.6 % | 80.9 % | 1130 | 88.2 % |
| `12eb9a` | 11.9 % | 84.7 % | 1161 | 93.8 % |
| `05fa7c` | 14.6 % | 90.9 % | 208 | 97.2 % |
| `02881a` | 15.4 % | 54.5 % | 661 | 69.6 % |
| `0cd48f` | 16.5 % | 44.8 % | 529 | 61.5 % |
| `086019` | 19.0 % | 97.4 % | 91 | 98.9 % |
| `146624` | 19.6 % | 84.6 % | 1171 | 94.4 % |
| `02dc28` | 20.3 % | 62.9 % | 1296 | 83.1 % |

**17 of 17.** A legal slate treatment covering far more of the artwork already exists in every single
case, usually approaching the theoretical ceiling. **This is a ranking problem, not a recall problem.**
No generation work is required for a coverage axis to have anything to act on.

And the treatments are not buried freaks. Restricting to candidates that (a) gain ≥ 25 points of
coverage, (b) keep the incumbent's gradient flag, and (c) are **Pareto members** of the algorithm's own
scoring, the best-ranked such candidate sits at **rank 3–9 of ~1500 on six of the eight review cases**
(the other two at 45 and 108). A modest scoring nudge would surface them; nothing structural is in the
way. Note this is a different — and much more actionable — number than the "best coverage anywhere on
the slate" column above, which is a single-axis maximum sitting at rank 91–1446.

The single most striking instance: on `09d178` the reviewer wrote *"the result would be stronger if it
was carpaccio red or punch red"*. The selected alternative's surface is **`#c42a42`** — a punch red,
found on the slate, at rank 9, Pareto, published rank 3 instead.

---

## 6. Deliverable — the proposed review series

`review-series/x-coverage-manifest.json` plus two result sets, mirrored into
`research/v2-3-eval/data/results/` so `make-batch.ts` can consume them directly:

- `x-coverage-incumbent` — exactly what `extractPaletteDetails` publishes at 979c245;
- `x-coverage-alternative` — a treatment `scorePaletteCandidates` already produced and ranked.

Nothing is synthesised or hand-assembled. Flat treatments carry **no `researchRender` key**; gradient
flags are matched between sides.

| # | id | set | incumbent → alternative | alt rank | what moves |
| --- | --- | --- | --- | ---: | --- |
| 1 | `09d178` | reviewed, acceptable | 11.6 % → 58.4 % | 9 | surface `#21203f` → `#c42a42` (the red the reviewer asked for) |
| 2 | `086019` | reviewed, weak-fallback | 19.0 % → 86.8 % | 3 | field goes green; 81 % of this artwork's pixels are chromatic |
| 3 | `02881a` | reviewed, strong **with the complaint in the note** | 15.4 % → 43.5 % | 45 | surface `#54495a` → `#754577`, accent → `#d0456e` |
| 4 | `0f8156` | reviewed, weak-fallback | 3.6 % → 38.3 % | 5 | accent `#bebcbf` → `#8e672c` |
| 5 | `05fa7c` | **fresh** | 14.6 % → 73.0 % | 8 | foreground `#087883` → `#0277e8` |
| 6 | `08c1c0` | **fresh** | 5.7 % → 87.5 % | 8 | accent `#2c7268` → `#ce9f71` |
| 7 | `103a37` | **fresh** | 2.7 % → 37.4 % | 5 | whole field re-grounds |
| 8 | `12eb9a` | **fresh** | 11.9 % → 69.6 % | 108 | surface `#1a272f` → `#60202e` |

Four reviewed cases test whether the statistic sees what the human already said; four fresh cases test
whether the class-size claim survives contact with an artwork nobody has judged.

**Known confound, disclosed per case in the manifest:** on `05fa7c` (item 5) the incumbent renders a
source-supported midpoint `#f0f0f0` and the alternative cannot, because the midpoint is chosen downstream of
the winner. Part of any preference on that one item may be about the midpoint rather than about colour;
the other seven pairs are clean.

**What a verdict decides** — also written into the manifest:

- *higher-coverage side wins most items* → coverage is real signal whole-palette scoring is missing, and
  the next step is a **scoring term**, since the treatments already exist at ranks 3–9;
- *incumbent wins most items* → low coverage is the price of the other axes and should **not** become an
  axis; the complaint class needs a different explanation;
- *split* → the discriminator is inside the split; compare winners against losers on `SPREAD` and on
  whether the missing direction is a large field region or a small vivid mark.

---

## 7. Honest self-assessment

- **The statistic is validated, not proven.** AUC 0.872 rests on **eight** complaint cases. Eight. The
  confidence interval on that is wide and I have not bootstrapped it, because with n=8 the interval
  would be the whole useful range and would say nothing the sample size does not already say.
- **`081dec` is a real miss**, and it points at a whole second class — *lightness* variants of an
  already-represented hue — that this measure is blind to by construction. Track U hit the same wall.
  Anyone reading this as "coverage explains the colour complaints" is over-reading it; it explains the
  hue-direction ones.
- **Coverage says nothing about whether a palette is good.** A palette can cover 100 % of the hue mass
  and be unusable. The measurement here is one-directional: low coverage is evidence something is
  missing; high coverage is not evidence anything is right. If it became an axis it would have to be
  weighed against contrast, coherence and economy — which is precisely what the review series asks.
- **The class-size number is threshold-dependent and the thresholds come from 6 data points.** 7.9 % at
  the median complaint, 17.3 % at the mildest, 29.1 % at an arbitrary 50 %. I report the spread rather
  than pick a favourite. The *severe* 3.3 % is the number I would defend hardest.
- **The "no false positives at the median threshold" result is fragile.** Move the threshold up 15
  points and five reviewed-strong artworks are flagged. Whether those are false positives or unnoticed
  true positives is unknown and only a human can say.
- **I did not check the alternatives for contrast pathologies.** They are legal slate treatments and
  therefore passed the runtime's own gates, but I have not verified APCA sign flips across the gradient
  on the two gradient items. The reviewer will see them rendered.
- **The stride sample is one draw.** It is deterministic and reproducible, but a second stride at a
  different offset would move the class-size figures by an amount I have not measured.

## Files

| file | what it is |
| --- | --- |
| `measure.ts` | shared vocabulary: hue binning convention, `shortId`, `HueProfile` |
| `profile.ts` | stage 1 — the only expensive step; caches one hue profile + trunk winner per artwork, resumable, shardable |
| `coverage.ts` | stage 2 — the coverage statistic, the exact ceiling DP, palette scoring; touches no image |
| `validate.ts` | reproduces Track U's published numbers; run this first or trust nothing |
| `report.ts` | criterion validity, the bake-off, class size, false positives |
| `slate.ts` | the recall-vs-scoring split, replaying the candidate domain |
| `build-series.ts` | emits the review series and its manifest |
| `mine-verdicts.ts` | warehouse mining with the colourfulness keyword screen |
| `data/profiles/` | 249 cached hue profiles (gitignored — regenerate with `profile.ts`) |
| `data/bakeoff.md`, `data/report-w15.md` | generated reports |
| `review-series/` | the deliverable: two result sets and the manifest |

Reproduce, from the repository root:

```sh
PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
  node --no-warnings --experimental-strip-types research/v2-3-experiments/track-x/profile.ts \
    --set all --stride-count 150 --shard 0/2   # and --shard 1/2 in a second process
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-x/validate.ts
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-x/report.ts
```

Determinism was confirmed by re-running the profiler and the series builder from scratch: both produce
byte-identical output.

---

# Round 2 — implementing the axis (batch 24 funded it)

Batch 24 preferred the higher-coverage alternative on **4 of 5 decidable pairs** (`09d178` strong,
`08c1c0` strong, `02881a` strong, `086019` acceptable), kept the incumbent on the one item carrying the
disclosed midpoint confound (`05fa7c`), and graded 3 equal — while hand-assembling a correction for each
of those three. Zero genuine incumbent wins. The axis was funded.

## Independent validation, before any tuning

The three `equal` items plus `08c1c0` carry **hand-assembled corrections**. Those are the only palettes
in this whole track the reviewer built rather than chose between things I showed him, so they are the
one non-circular validation set available:

| window | human correction covers more than the incumbent |
| ---: | --- |
| ±10° … ±40° | **4 / 4 at every window** |

So the measure is confirmed — and the window is *still* not discriminated, exactly as in round 1. The
batch-24 A/B outcomes do not discriminate it either (4/5 at every window, the miss always `05fa7c`).

**The window is therefore derived, not fitted.** `ARTWORK_GAMUT_POLICY.directionHalfWidthDegrees` is
`identityDirectionHueDegrees / 2` = **±20°** — the selector already declares two colours within 40° to be
the *same identity direction*, so a direction is 40° wide and its centre reaches ±20°. No new constant
enters the codebase, and the choice rests on consistency with an existing reviewed value rather than on
the eight cases used to validate it.

One correction is a warning worth stating: on `08c1c0` the reviewer kept my alternative and swapped the
accent to near-white, which drops coverage 87.5 % → 5.8 % — while grading that same alternative `strong`.
**Coverage is not a thing to maximise.** That observation is what later forced the saturation term.

## Where it enters — the route question, decided on measurement

| route | what it touches | verdict |
| --- | --- | --- |
| **`"utility"`** | the scalar objective only; stays **out** of `WINNER_QUALITY_AXES` | **chosen** |
| `"axis"` | full 12th axis: also guards domination and the sorted-level tiebreak | rejected |
| `"authority"` | lexicographic band guard, the `authorizedIdentity` shape | rejected |

`"axis"` is not merely wider, it is **structurally blocked**: `configuration.test.ts` pins the axis list
to exactly 11 entries and asserts the weights sum to 1, so a 12th member forces re-normalising eleven
reviewed weights — precisely what Track V froze. `"authority"` gives coverage lexicographic force inside
a utility band, which is a stronger claim than the evidence supports (it would outrank every reviewed
axis whenever a band ties). `"utility"` adds coverage as an additive term on top of the frozen weights,
so the Pareto frontier and every tiebreak keep the shape they were calibrated with. Measured movement on
the 19-artwork probe: `axis:0.05` moved 87.5 %, `utility:0.05` 47.4 %.

## The calibration failed as specified, and why

Sweeping weight over the **real pipeline** (`extractPaletteDetails` with a research override, so these
are published winners, not a reimplementation of the ranking):

- `02881a` did not reach its preferred alternative until weight **0.20**;
- `05fa7c` held its preferred incumbent only up to weight **0.04**.

Disjoint by 5×, and 0.20 would make coverage the single largest term in the objective — larger than
`fieldFidelity` and `foregroundPath` at 0.15. **No single weight satisfied the acceptance set.**

Two mechanism findings came out of chasing that, and both are now in the runtime:

**1. Scope.** `05fa7c`'s cheap flip was a *foreground* swap. The foreground is the text role, chosen for
legibility, and rewarding it for chromaticity is a documented failure mode (the reviewed foreground-mover
regressions). Restricting coverage to `"field-and-accent"` holds `05fa7c` at weight 0.05 and costs
nothing on the others — every complaint in this class names a surface, a background or an accent. The
counter-evidence is recorded in the source: `0cd48f`'s complaint asks for the opposite.

**2. Saturation — the important one.** A linear credit is unbounded where it must not be.
`vvbrown` is reviewed **strong** with a genuinely white ground, already at **99.1 %** coverage, and the
axis inverted its entire field (background *and* surface) to reach 100.0 %. That is the same field
inversion the o2 postmortem independently called a regression. `GAMUT_COVERAGE_SATURATION = 0.75` says
what the evidence actually supports: coverage is evidence something is **missing**, and once nothing is
missing there is nothing left to buy. Above the saturation point every candidate scores alike and the
reviewed axes decide. With it, **`vvbrown` stops moving entirely.**

## Operating point and what it does

`integration: "utility"`, `weight: 0.05`, `scope: "field-and-accent"`, `saturation: 0.75`.

| artwork | standing verdict | what the axis does |
| --- | --- | --- |
| `09d178` | acceptable | surface → `#c42a42`, the **carpaccio red the reviewer named** |
| `086019` | weak-fallback | field → green; batch-24 preferred alternative |
| `08c1c0` | (fresh) | batch-24 preferred alternative |
| `02881a` | strong + complaint | surface `#54495a` → `#cd4269`, a vivid rose — **directly answers "dull, almost grayish"** |
| `johns` | acceptable | surface → `#315a92`. Its note says *"we are really missing the sailor blue surface"*. **No other mechanism reached this.** |
| `0f8156` | weak-fallback | accent → `#8e672c`; the reviewer's own correction wanted pink `#f168a0`, so **partial** |
| `05fa7c` | acceptable (incumbent preferred) | fg/accent swap, **midpoint `#f0f0f0` preserved** — unadjudicated |
| `vvbrown`, `black`, `meteora`, `once`, `birdsofprey`, `skap`, `slipknot`, `knuckles`, `loups`, `placebo` | — | **unchanged** |

`black`'s reviewed two-colour collapse holds, and `johns` is *fixed* rather than broken — the two
artworks the earlier rejected raw-coverage variant (`identityAuthority`) destroyed. The chroma-adequacy
factor and the saturation are why.

## It ships OFF

`GAMUT_COVERAGE.integration = "off"`. **All 34 parity fixtures are byte-identical** (39/39 subtests
pass), architecture and configuration tests pass, and typecheck is clean.

The reason is not caution for its own sake. Even at the best operating point, `05fa7c` moves to a
treatment nobody has judged, and it is the one artwork whose incumbent a reviewer explicitly preferred.
Enabling the axis trades an adjudicated preference for an unadjudicated one — a judgement, not a
calibration. Re-enabling is a one-word edit.

## Deliverable

`review-series-2/` — 7 pairs, `x2-off` vs `x2-coverage`, both **real extractions of the shipped
pipeline** differing only in the term, mirrored into `research/v2-3-eval/data/results/`. Flat treatments
carry no `researchRender` key. `johns` is the control: its note names the sailor-blue surface and the
axis produces it, so if review does not prefer that, the measure is not tracking the reviewer's words.

## Honest self-assessment, round 2

- **The acceptance set as written was never met**, and the write-up above should not read as if it was.
  What changed is that the *reasons* for each miss are now specific and mechanical rather than mysterious.
- **`05fa7c` is unresolved.** I can argue its new winner is a different treatment from the one rejected
  (the midpoint is preserved), but I cannot claim the reviewer would accept it. He might not.
- **`0f8156` is a real partial miss**: the axis picks a brown where the human picked pink. Coverage ranks
  the brown higher because that arc carries more chromatic mass; the human wanted the *vivid* mark. That
  is the same linear-vs-salience tension the chroma² experiment failed on in round 1, and it is unsolved.
- **The blast radius is measured on 19 artworks, not the corpus.** They are deliberately enriched for
  worst-coverage cases plus named guardrails, so the 47 % movement rate is an upper bound and the
  *absence* of regressions elsewhere is not yet established. **The full verification sweep (all
  verdict-carrying artworks + the 150-draw) has NOT been run** — the machine was at load 15–19 under
  another track's sweep for this entire arm. That sweep is the remaining acceptance work.
- **Saturation at 0.75 is the one number here I cannot derive.** It is set above every complaint case's
  coverage and below `vvbrown`'s 99.1 %, which is a two-sided constraint from two data points. It wants
  a proper calibration once more verdicts exist.
- **`buildArtworkGamut` reads `evidence.native.labs`**, a `Float32Array`, where the round-1 offline
  measurements used `Float64`. The difference is ~7 significant digits and cannot reach any threshold
  here, but it means runtime coverage values are not bit-identical to `data/report-w15.json`.
- **Scrambled decoys preserve a chroma-weighted hue histogram exactly.** This axis is therefore the one
  mechanism in the codebase a decoy corpus could never have caught misbehaving. Everything above is
  measured on the real artwork via `PALETTE_IMAGES_ROOT`.

---

# Round 2b — the full acceptance sweep

Machine freed (other track's sweep checkpointed, load ~5). **249 artworks × 2 variants, 4 workers,
`VIPS_CONCURRENCY`/`sharp.concurrency(1)`.** Baseline `off:0` vs operating point `utility:0.05` /
scope `field-and-accent` / saturation `0.75`. Every winner is a real `extractPaletteDetails` output.

## The 47 % upper bound resolved

| set | n | moved | rate | mean coverage before → after |
| --- | ---: | ---: | ---: | --- |
| **fresh 150-draw (unbiased)** | 150 | 46 | **30.7 %** | 67.9 % → 77.1 % |
| reviewed | 89 | 13 | **14.6 %** | 71.9 % → 76.0 % |
| other `images/` fixtures | 10 | 0 | **0.0 %** | 89.9 % → 89.9 % |
| all | 249 | 59 | 23.7 % | |

The round-2 probe's 47 % was indeed an upper bound: the true unbiased rate is **30.7 %**, and on
verdict-carrying artwork it is **14.6 %** — **78 of 91 are byte-preserved**.

## Corpus-wide regression check

| latest verdict | n | moved | byte-preserved |
| --- | ---: | ---: | ---: |
| strong | 71 | 7 | **64** |
| acceptable | 16 | 3 | 13 |
| weak-fallback | 4 | 3 | 1 |

Three of the 13 movers are batch-24 targets (`09d178`, `02881a`, `086019`), one is a batch-24 `equal`
with a correction on file (`0f8156`), and `johns` is the standing "sailor blue surface" request. That
leaves **6 reviewed-strong artworks moving without a mandate**, and they are not one thing:

| id | change | read |
| --- | --- | --- |
| **`02dc28`** | `#fefefe`/`#fefefe` → `#0a0919`/`#173571`, fg→white, accent→`#eb64c0` | **REGRESSION RISK — white ground inverted** |
| `1031d1` | accent `#e7a37e` → `#e48068`, coverage 61→84 % | plausible improvement |
| `06c5d7` | accent `#c27f62` → `#f5c982`, coverage 44→54 % | plausible improvement — `#f5c982` is this artwork's own gold, the exact colour Track U measured at 17.19 % of its chromatic mass |
| `083a2d` | `#4b3d3d`→`#4d3e3b`, `#806a77`→`#7c6778` | imperceptible; band-boundary churn |
| `0e2291` | `#101b15`→`#111e14`, `#dd5839`→`#dc5738` | imperceptible; band-boundary churn |
| `05230f` | `#eff3f6`→`#e8ebf0`, `#d6d7dc`→`#d1d4d9`, coverage 35.3→35.4 % | imperceptible; band-boundary churn |

### The finding that matters: saturation only protects the already-covered

`02dc28` is **the `vvbrown` failure repeating**. Same shape — a genuinely white ground inverted to
near-black so the field can carry hue — on a reviewed-**strong** artwork. Saturation stopped it on
`vvbrown` because `vvbrown` was already at 99.1 % coverage; `02dc28` sits at **23.5 %**, far below the
0.75 saturation point, so nothing bounds the term there.

**So the white-ground failure mode is not fixed, only masked at the top of the range.** Saturation
answers "stop paying once nothing is missing"; it does not answer "never buy the field from an artwork
whose ground is genuinely achromatic". That needs a field-fidelity guard, which is a mechanism change,
and it is the single largest open risk in this arm. I would not enable the axis on the strength of the
movement statistics alone while this is unresolved.

### Two smaller anomalies, recorded

**Coverage can go down.** Three artworks lose coverage under a term that rewards it (`0b99a9`
58.8 → 47.2 %, `11fd53` 49.0 → 48.7 %, `10771e` unchanged-but-moved). The winner is chosen on *total*
utility, so a candidate can win on the other eleven axes while the coverage term reshuffles the
ordering around it. Not a bug, but it means "the axis raises coverage" is true on average (+9.2 pp on
the fresh draw) and false pointwise.

**Band-boundary churn is real.** Three of the six unmandated strong movers change by an imperceptible
amount. They still break byte-parity and would still need attribution in any integration diff.

## Review series-2 is current

All 8 pairs verified byte-identical to the sweep's baseline and operating-point winners
(`acceptance.ts` §3). `02dc28` was **added** to the batch after this sweep found it — it is the most
decision-relevant item in the set, and a batch that omitted it would ask the reviewer to bless the axis
without showing him its worst case. `05fa7c` is in the batch as the adjudication item, per the
coordinator.

Two pairs from the pre-saturation build (`103a37`, `vvbrown`) were deleted rather than served: `103a37`
was stale, and `vvbrown` no longer moves at all so it is no longer a comparison.

## Verdict on the arm

The axis is real, measured, and mostly well-behaved: 30.7 % movement on fresh artwork, +9.2 pp mean
coverage, 64 of 71 reviewed-strong artworks untouched, and it grants two standing requests no other
mechanism reached. It still ships **`"off"`** — 34/34 parity fixtures byte-identical — because of
`02dc28` and `05fa7c`, both of which are questions only a human can answer.

---

# Round 3 — the field-fidelity guard

## The mechanism

`GAMUT_COVERAGE_FIELD_GUARD`. Coverage on its own has no idea which part of the artwork the background
and surface are supposed to *be*, so on an artwork whose ground is genuinely white it will invert the
whole field and call that an improvement. The guard says:

> The field earns coverage in proportion to how faithful that treatment's field already is.

Coverage the non-field roles achieve is earned outright; the **additional** coverage bought by the
background and surface is multiplied by the treatment's own `fieldFidelity` — the axis that already
means "is this the artwork's field", and the one the unguarded term was overpowering. No new constant,
no mention of white, and the shading quantity is a property of the candidate rather than of any named
artwork.

My first instinct — shade by the artwork's achromatic **area** — was wrong and was discarded on
measurement, not taste: `02dc28` is **53.9 % chromatic**, so its ground is white but the artwork is not
neutral, and area does not separate it from `09d178` (55.8 % chromatic) whose field change is a
*wanted* fix.

## Ablation: both guards are load-bearing, on different artworks

| artwork | off | guard + saturation | guard, NO saturation | saturation, NO guard |
| --- | --- | --- | --- | --- |
| `vvbrown` (strong) | white field | **HOLD** | **MOVE** | HOLD |
| `02dc28` (strong) | white field | **HOLD** | HOLD | **MOVE** |

Each mechanism catches an artwork the other misses. Saturation answers *"stop paying once nothing is
missing"* (`vvbrown` sat at 99.1 % coverage); the guard answers *"do not buy the field"* (`02dc28` sat
at 23.5 %, far below saturation, so only the guard reaches it). Neither is redundant.

## Why the guard needed weight 0.04

`inspect-field.ts` on `02dc28` shows `fieldFidelity` **does** rank the artwork's true white field above
the inverted one — 0.7465 vs 0.5575 — so the guard is directionally right. It was still not enough at
weight 0.05, because the decision is a near-tie in the *existing* objective:

| candidate | fieldFidelity | gamutCoverage | qualityUtility | relationUtility |
| --- | ---: | ---: | ---: | ---: |
| inverted `#0b0715/#12356d` | 0.5575 | 0.6780 | 0.7480 | **0.7852** |
| true white `#fefefe/#fefefe` | 0.7465 | 0.2921 | 0.7665 | 0.7836 |

The inverted candidate wins by **0.0016 of relationUtility — a third of one 0.005 quantum** — and it
carries **more than double the identityGain** (0.0372 vs 0.0171). Without any coverage term the white
field wins by 0.0177. So `02dc28` is a near-tie the existing identity machinery already leans the wrong
way on, and coverage merely supplies the last nudge. Weight `0.04` is the largest value at which no
reviewed-strong field inverts — an acceptance bound, not a fit.

## THE DESIGN FAILURE — reported, not papered over

**The guard costs three of the four batch-24 mandate wins.**

| batch-24 item | reviewer preferred | unguarded 0.05 | **guarded 0.04** |
| --- | --- | --- | --- |
| `09d178` | alternative | ALT | **ALT — preserved** |
| `02881a` | alternative | moved | **HELD — lost** |
| `086019` | alternative | ALT | **HELD — lost** |
| `08c1c0` | alternative | ALT | **HELD — lost** |
| `0f8156` | equal + correction | accent 4→42 % | accent 4→15 % — **weaker** |
| `johns` (standing request) | — | `#315a92` | **`#315a92` — preserved** |

And at **no** guarded weight (0.03, 0.04, 0.05, 0.07 all measured) does `02881a`'s surface leave
`#54495a`. The guard categorically prevents the fix for the complaint that started this track — *"the
surface color feels dull, almost grayish, when the artwork is so very colorful"*.

**The reason is fundamental, not a tuning miss.** `fieldFidelity` is a proxy that cannot separate

- *abandoning the artwork's real white ground* (`02dc28`, `vvbrown` — must be stopped), from
- *replacing a dull field with the artwork's actual colour* (`02881a`, `086019` — must be allowed).

Both are field changes with reduced `fieldFidelity`, so any shading by that quantity suppresses both.
Holding the white grounds and granting the dull-field fixes are, with this quantity, the same knob
pulled in opposite directions. A guard that separates them needs a signal `fieldFidelity` does not
carry — plausibly whether the field family the candidate leaves is itself *achromatic and dominant*,
which is a mechanism for another arm and which I have not measured.

## Final acceptance sweep — `utility:0.04` / `field-and-accent` / saturation 0.75 / guard on

249 artworks × 2 variants, 4 workers, load ~9.

| set | n | moved | rate | mean coverage before → after |
| --- | ---: | ---: | ---: | --- |
| **fresh 150-draw (unbiased)** | 150 | 40 | **26.7 %** | 67.9 % → 75.2 % |
| reviewed | 89 | 9 | **10.1 %** | 71.9 % → 74.1 % |
| other `images/` fixtures | 10 | 1 | 10.0 % | 89.9 % → 89.8 % |

**82 of 91 verdict-carrying artworks byte-preserved; 67 of 71 reviewed-strong.** Both white-ground
regressions are gone.

### Remaining unmandated movers on a strong verdict — 4

| id | change | read |
| --- | --- | --- |
| `1031d1` | accent `#e7a37e` → `#e48068`, coverage 61 → 84 % | plausible improvement; **in the batch** |
| `05a918` | surface `#123146` → `#0c5381`, both dark blue, coverage 85.3 → 85.2 % | modest; **in the batch** |
| `083a2d` | `#4b3d3d`→`#4d3e3b`, `#806a77`→`#7c6778` | imperceptible band-boundary churn |
| `05230f` | `#eff3f6`→`#e8ebf0`, `#d6d7dc`→`#d1d4d9` | imperceptible band-boundary churn |

One fixture moves: `nada`, surface only, coverage 72 → 71 % — churn, and it *loses* coverage.

Eight artworks lose coverage overall (up from three), which remains the honest caveat from round 2b:
the winner is chosen on total utility, so "the axis raises coverage" is true on average (+7.3 pp on the
fresh draw) and false pointwise.

## Batch and shipping state

`review-series-2/` refreshed to the guarded operating point — **8 pairs, all verified current** against
this sweep. `02dc28` dropped (it no longer moves). `05fa7c` kept as the adjudication item, with the note
that its treatment is **not** the one previously rejected: that one dropped the gradient midpoint, this
one preserves `#f0f0f0` and swaps foreground with accent. `johns` kept as control.

Still ships **`"off"`**; 34/34 parity fixtures byte-identical (39/39 subtests), architecture and
configuration tests pass, typecheck clean.

---

# Round 4 — the discriminator: measure first

## The valley exists, and only half the hypothesis survives

Profiled the field family of the incumbent winner for 248 artworks (chroma of the family prototype,
`populationFraction`, lightness — all existing runtime quantities).

| group | id | bg family chroma | bg dominance |
| --- | --- | ---: | ---: |
| **must protect** | `02dc28` | 0.0000 | 0.163 |
| **must protect** | `vvbrown` | 0.0009 | 0.376 |
| must move | `09d178` | 0.0000 (bg) / **0.0494** (sf) | 0.148 |
| must move | `02881a` | 0.0525 | 0.082 |
| must move | `086019` | 0.0543 | 0.178 |
| must move | `08c1c0` | 0.0374 | 0.339 |

- **Chroma separates cleanly.** Protect set tops out at 0.0009; the move set starts at 0.0374 — a gap of
  0.0365, a factor of forty.
- **Dominance does NOT separate.** The artwork most needing protection has population fraction 0.163
  while one that must stay free has 0.339. The "AND dominant" half of the hypothesis is **dropped**:
  including it would have added a constant that does no work. Reported rather than quietly kept.

## The cut is derived, not fitted

A field is achromatic when it is **the same colour as the neutral grey of its own lightness**, judged by
the repository's own reviewed same-colour bar — `distinctness.sameColor` (ΔE 3.3) through the same
`perceptualDifference` ruler every other same-or-not decision uses. No new constant.

Measured ΔE-from-grey: protect set **0.00, 0.00**; move set **17.99, 18.60, 20.49, 22.09**. The bar at
3.3 sits inside a gap spanning nearly twenty ΔE, so *where* in the gap it falls changes nothing — which
is what makes it derived rather than tuned. `johns` at 5.45 lands on the free side, which its mandate
requires.

## The guard, rebuilt

Round 3's guard shaded the field by the *candidate's* `fieldFidelity`. That was measured and **rejected**
— it cost three of four mandate wins, because `fieldFidelity` cannot tell *abandoning a real white
ground* from *replacing a dull field*. The rebuilt guard gates on the **artwork** instead:

> When the field the algorithm picks with **no coverage pressure at all** is one you could not tell from
> grey, the background and surface earn **no** coverage. Otherwise the axis pays in full.

The reference field is obtained by ranking the domain once with the term switched off — the only way to
ask "what is this artwork's field" without the term biasing the answer it is about to be judged against.
One extra ranking pass over an already-built domain.

## Acceptance — met in full

| requirement | result |
| --- | --- |
| `02dc28` byte-preserved | **PASS** |
| `vvbrown` byte-preserved | **PASS** |
| saturation still load-bearing | **PASS** — ablation: guard-without-saturation lets `vvbrown` move |
| guard load-bearing | **PASS** — ablation: saturation-without-guard lets `02dc28` move |
| all four batch-24 mandates restored | **PASS** — `09d178`, `02881a` (surface `#54495a` → `#cd4269`, the dull-grey complaint), `086019`, `08c1c0` |
| `johns` `#315a92` survives | **PASS** |
| 9 other guardrails | **PASS** — all byte-preserved |

Operating point: `utility` / weight **0.05** / scope `field-and-accent` / saturation 0.75 / achromatic
field gate. At 0.07 the white grounds break again, so 0.05 remains an acceptance bound.

## Final sweep — 249 artworks × 2 variants, 4 workers

| set | n | moved | rate | mean coverage |
| --- | ---: | ---: | ---: | --- |
| **fresh 150-draw (unbiased)** | 150 | 46 | **30.7 %** | 67.9 % → 77.1 % |
| reviewed | 89 | 11 | 12.4 % | 71.9 % → 75.6 % |
| other `images/` fixtures | 10 | 0 | **0.0 %** | unchanged |

Against the **live** warehouse (179 records): 95 verdict-carrying artworks, **15 move, 80
byte-preserved**, 65 of 73 reviewed-strong untouched. Four movers are batch-24 targets, three are
batch-24 `equal` items with corrections on file, one is the adjudication item.

### The five unadjudicated strong movers, scored against the human's own endorsed palette

| id | roles matching endorsed, before → after | read |
| --- | --- | --- |
| `johns` | 3/4 → **4/4** | lands **exactly** on the endorsed palette |
| `06c5d7` | 3/4 → **4/4** | lands **exactly** on the endorsed palette (accent `#f5c982`, the gold Track U measured at 17.19 % of its chromatic mass) |
| `083a2d` | 2/4 → **4/4** | lands **exactly** on the endorsed palette |
| `0e2291` | 2/4 → 0/4 | drifts off, but imperceptibly (`#101b15`→`#111e14`, `#dd5839`→`#dc5738`) |
| `1031d1` | 4/4 → 3/4 | **a genuine small regression** — accent leaves the endorsed `#e7a37e` for `#e48068` |

Three of the five are not unadjudicated at all: they converge on palettes the human has already
endorsed. That is the strongest evidence in this track that the term measures something real, and it is
independent of the batch-24 preferences the weight was checked against. `1031d1` is a real if small
regression and is **in the batch**.

## Batch

8 pairs, all verified current: `05fa7c` (adjudication item — its treatment is **not** the one previously
rejected; that one dropped the midpoint, this one preserves `#f0f0f0` and swaps foreground with accent),
`johns` (control), `1031d1` (the one genuine regression), `0e2291` (sub-threshold drift), and four
unadjudicated or `equal` movers (`009f60`, `0cd48f`, `103a37`, `12eb9a`). The four batch-24 targets are
excluded — already adjudicated — as are `06c5d7` and `083a2d`, which land on endorsed palettes.

Still ships **`"off"`**; 39/39 parity subtests, architecture and configuration tests pass.

## For the sibling authority-symmetry arm

The `02dc28` near-tie, precisely. Ranking is by `utilityLevel(relationUtility)` where
`relationUtility = qualityUtility + identityGain` and the quantum is 0.005.

| candidate | qualityUtility | **identityGain** | relationUtility |
| --- | ---: | ---: | ---: |
| inverted `#0b0715/#12356d` | 0.7480 | **0.0372** | 0.7852 |
| true white `#fefefe/#fefefe` | 0.7665 | **0.0171** | 0.7836 |

The inverted candidate is **worse** on `qualityUtility` (0.7480 vs 0.7665) and wins only because its
`identityGain` is **2.18×** the white field's, taking `relationUtility` by 0.0016 — a third of one
quantum. Strip the coverage term entirely and the white field still wins by only 0.0177 (3.5 quanta).
So the existing identity credit already leans toward chromatic fields on achromatic-ground artworks,
independent of anything this track added; coverage only supplied the last nudge. If identity credit is
symmetric in the way that arm is testing, `02dc28` is a case where it is doing the work.

## Honest self-assessment, round 4

- **The acceptance bar is met, but "all four mandates restored" is a bar I helped write.** The four
  targets are the cases the weight was checked against; the independent evidence is the three artworks
  that converge on endorsed palettes, and one that moves away.
- **`1031d1` is a real regression.** Small, but it leaves a palette the human endorsed 4/4 for one
  matching 3/4. I have not explained why coverage prefers `#e48068`.
- **The gate depends on a reference ranking.** If the reference winner is itself wrong about the field,
  the gate inherits that error. On 249 artworks it never misfired, but it is a dependency the earlier
  designs did not have, and it doubles the ranking cost.
- **The valley is measured on 6 artworks.** The gap is huge (0 vs 18 ΔE) and the corpus histogram is
  consistent with it, but six points is six points. A seventh case landing between 3.3 and 18 would
  need the cut revisited.
- **`0e2291` shows the gate does not stop sub-threshold churn.** Two artworks still drift by amounts no
  viewer could see, which breaks byte-parity without changing anything visible.

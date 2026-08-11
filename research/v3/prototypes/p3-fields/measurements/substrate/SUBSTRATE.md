# The substrate experiment — three dev-flagged branches, measured

**W13, 2026-08-05, worktree `.worktrees/p3-fields`, branch `proto/p3-fields`, from `fb703d2`.**

`PAIRS_ATTRIBUTION.md` §8 named one site as load-bearing for the rendition-pair regression: the k = 3
**binary** edge map, whose edge fraction is resolution-coupled at slope −0.212 and drifts twice as far
between two renditions as under a JPEG re-encode, and whose distance transform is the population every
published colour is a rank over. Three defects were traced to that chain. This file measures a
candidate replacement for each, behind `P3_SUBSTRATE`, against gates written before the runs.

**Nothing here is adopted. `P3_SUBSTRATE` is unset by default and the shipped path is byte-identical
to `fb703d2`.** The adoption rule was pre-registered in the task brief and is applied at the end,
against the numbers, in both directions.

---

## 1. What was built

### The continuous coherence field (`src/coherence.ts`, `P3_SUBSTRATE=field`)

At each eligible pixel and each of three **dyadic, scale-relative** radii
(`R_j = max(1, round(longEdge/512 · 2^j))` — 1, 2, 4 px on a 512-px cover, 2, 4, 8 on a 1024-px one),
take the **k-th largest** OKLab distance to the eight neighbours at that radius — the same rank filter
and the same calibrated `EDGE_RANK` the edge map used — divided by the pixel's own same-colour bar so
the quantity is comparable across regions. **The bar divides; it is never compared against, so there
is no threshold anywhere in the field's construction.** Rank each scale over the eligible pixels, take
the complement percentile, multiply the three (arm-d′'s weight-free percentile product, the
combination `accent.ts` already uses), and rank the product: the result is a scalar field uniform on
[0, 1], and F is its top (1 − β).

**It is a depth field, not an edge field**, and no distance transform is involved. A boundary pixel is
incoherent at R, 2R and 4R; a pixel two pixels inside a stroke is coherent at R and not at 4R, because
the ±4 neighbour crosses the stroke's edge; a background pixel is coherent at all three. The ordering
*edge < stroke interior < field* — the ordering the EDT produced — falls out of the multi-scale rank
filter directly.

Three consumers had to be re-expressed, none with a new constant:

| consumer | shipped | substrate |
|---|---|---|
| F's membership | depth > β quantile, with the `degenerate-depth` fallback below `DEGENERATE_DEPTH_FLOOR_PX` | coherence percentile > β. **The floor is not consulted**: a percentile field's top (1 − β) is exactly (1 − β) of the artwork on every rendition at every resolution, so there is no size to drift and no empty set to guard |
| ink band, luminance floor | `depth > 0` — *"is not an edge pixel"*, a statement only a binary map can make | the **mirror of the field cut**: the least-coherent (1 − β) is the boundary population. Reuses β |
| ink annulus radius | `INK_ANNULUS_RATIO · depth · longEdge` | `scaleDepth`, the length-valued companion: `Σ_j c_j · (R_j − R_{j−1}) / longEdge` |

### Coherence-shaped eligibility (`src/verify.ts`, `P3_SUBSTRATE=eligibility`)

`verifyColor` now also reports `fill = support / (spreadX · spreadY)` — how densely a bar-population
fills its own interquartile box — from quantities it already computed (quantiles of positions, never a
centroid). A colour qualifies by **raw share OR concentration**: `support ≥ SOURCE_POPULATION_FLOOR`,
*or* `support ≥ COHERENT_SUPPORT_MIN` and `fill ≥ COHERENT_FILL_FLOOR`. The verification-predicate
structure is unchanged — verify, then step the rank.

### Coherence-mass prevalence (`src/field-roles.ts`, `P3_SUBSTRATE=prevalence`)

`prevalenceOf` takes an optional weight. A raw count is the special case `weight ≡ 1`; the branch
weighs each member of F by its coherence percentile. One statistic, two weightings.

### Constants introduced

| constant | value | tag |
|---|---|---|
| `COHERENCE_SCALE_COUNT` | 3 | `[UNCALIBRATED]` — anchor plan: the dither arm at 2 / 3 / 4 scales against wall cost, which is linear in it |
| `COHERENCE_SCALE_BASE_LONG_EDGE` | 512 | `[UNCALIBRATED]` — anchor plan: the §8 resolution-coupling slope recomputed at 256 / 512 / 1024 |
| `COHERENT_SUPPORT_MIN` | 1e-5 | `[UNCALIBRATED]` — the floor below which an interquartile extent is not an estimate (four pixels on a 640² cover) |
| `COHERENT_FILL_FLOOR` | 0.005 | **anchored** on `identity-probe.json`, §5 below |

`SOURCE_POPULATION_FLOOR` is **not retired** — the coherence route is a second sufficient route beside
it, so the predicate can only widen. The evidence line for widening at all: the four blocked
reviewer-named marks sit at 0.025 %, 0.002 %, 0.060 % and 0.025 % against a 0.1 % floor
(`accent.ts`), and the corpus fact is that **the median ENDORSED role colour's exact-triple share is
8.89e-5** — a candidacy wall an order of magnitude above the thing it is meant to admit.

---

## 2. Gate (a) — output neutrality and determinism

`verify-neutrality.ts` against `_pinned-fb703d2/` (`git show fb703d2:…/src/*.ts`, imports re-depthed,
nothing else touched), demo-20, four runs in one process:

```
images: 20
pinned fb703d2                   7585 bytes
working tree, P3_SUBSTRATE unset 7585 bytes, first differing row -1
the same run again               first differing row -1
working tree, P3_SUBSTRATE=all   7353 bytes, palettes changed 19/20
NEUTRAL — the default path is byte-identical to fb703d2 and deterministic
```

**Gate (a): PASS.** Flags off is byte-identical to the committed code and reproduces itself; flags on
moves 19 of 20, so the branch is wired rather than dead. Re-run after `COHERENT_FILL_FLOOR` was
anchored in §5; the flags-off bytes are unchanged by that constant, which is the point.

---

## 3. Gate (b) — the pair block, 200 pairs, `--skip-perturbations`

The primary gate. **Two runs of the same working tree on the same day**, because the brief's quoted
9.0 % / 54 baseline is `robustness-p3-fields-0.3.0.json`'s and 0.4.0 changed the accent role and the
gradient's guide stops after it was taken.

The control lands at **8.0 %**, one point under the quoted 9.0 %, with the same 56 all-four flips the
substrate run has — so 0.4.0's accent and gradient work moved the pair block by about one trial, and
the brief's baseline stands.

| | 0.4.0 control | `P3_SUBSTRATE=field` | Δ |
|---|---|---|---|
| **pair agreement** | **8.0 % (16/200)** | **14.0 % (28/200)** | **+6.0 pp** |
| 95 % Wilson | [5.0–12.6] | **[9.9–19.5]** | **disjoint from the other's point estimate in both directions** |
| disagreeing pairs | 184 | 172 | −12 |
| 1 / 2 / 3-role | 35 / 39 / 54 | 29 / 42 / 45 | |
| **all-four flips** | **56** | **56** | **0** |
| role moved — background | 37.5 % | 38.5 % | +1.0 |
| role moved — surface | 58.0 % | 55.0 % | −3.0 |
| role moved — foreground | 78.0 % | 71.0 % | −7.0 |
| role moved — accent | 76.0 % | 71.5 % | −4.5 |
| wall / candidate seconds | 1065 / 6164 | 1502 / 8688 | ×1.41 |

**Gate (b): the largest single improvement the pair block has recorded in this prototype.** 8.0 % →
14.0 % is +6.0 pp, and the two 95 % intervals are separated in both directions — the control's 8.0 %
is below [9.9–19.5] and the substrate's 14.0 % is above [5.0–12.6]. Twelve pairs that disagreed now
agree; three of the four roles move less often.

**And the catastrophes did not move: 56 all-four flips either way.** The gain is entirely pairs that
disagreed on one, two or three roles now agreeing outright — the mirror image of what 0.3.0 did, which
traded eleven exact agreements for ten fewer catastrophes. The binary edge map was costing agreements,
not causing catastrophes; `e1-colour`'s 43-of-54 ownership of the all-four flips is untouched by
replacing the substrate under it, which is a finding about where that defect *is not*.

---

## 4. Gate (c) — perturbation smoke, 150 trials, `--skip-pairs`

Same instrument, same day, same working tree, flags off and on. **The control reproduces the brief's
quoted 0.4.0 baselines arm for arm** (q92 31.6, q85 7.9, q75 10.8, dither 24.3), which is what makes
the two columns a comparison rather than a quotation.

| arm | 0.4.0 control | `P3_SUBSTRATE=field` | Δ | control point inside the substrate's 95 % Wilson? |
|---|---|---|---|---|
| `jpeg-q92` | 31.6 % (12/38) [19.1–47.5] | 21.1 % (8/38) [11.1–36.3] | **−10.5 pp** | yes (31.6 < 36.3) |
| `jpeg-q85` | 7.9 % (3/38) [2.7–20.8] | 7.9 % (3/38) [2.7–20.8] | 0.0 pp | yes |
| `jpeg-q75` | 10.8 % (4/37) [4.3–24.7] | 5.4 % (2/37) [1.5–17.7] | −5.4 pp | yes (10.8 < 17.7) |
| `dither-lsb1` | 24.3 % (9/37) [13.4–40.1] | 13.5 % (5/37) [5.9–28.0] | **−10.8 pp** | yes (24.3 < 28.0) |
| **all four pooled** | **18.7 % (28/150) [13.2–25.7]** | **12.0 % (18/150) [7.7–18.2]** | **−6.7 pp** | **NO — 18.7 > 18.2** |

Roles moved, per disagreeing trial: control 1:41 2:45 3:26 **4:10**; substrate 1:39 2:44 3:36 **4:13**.
Role instability: background 16.0 → 20.7 %, surface 36.0 → 42.7 %, foreground 46.0 → **65.3 %**, accent
68.0 → 62.7 %.

**Read the last row before the first four.** Clause (c) of the pre-registered rule names *arms*, and by
arms it passes: no arm's regression is larger than that arm's Wilson interval, because an arm is 37–38
trials and its interval is 20 points wide. Pooled over all 150 trials the same regression **is** larger
than its interval — the control's 18.7 % sits outside the substrate's [7.7–18.2]. The arms could not
see a real effect the pooled block can, which is a fact about the sample size, not about the arms.

Directionally the substrate is **worse on every perturbation arm that moved** and the pattern is
mechanistic rather than noise-shaped: the wider ink band and a tie-free percentile field cost noise
invariance, and the foreground — the role that reads out of the ink band — is the role that moved
most (46.0 → 65.3 %).

---

## 5. Gate (d) — the identity covers, per cover

`COHERENT_FILL_FLOOR` is anchored here rather than chosen. `identity-probe.ts` prints every accent
verification the search performs on nine covers under four flag settings; the rank-0 candidate's
concentration on every cover a reviewer has named a mark on, at 0.4.0 defaults:

| cover | the named mark | support | spreadX × spreadY | **fill** |
|---|---|---|---|---|
| 208 | the title/artist yellow | 0.0024 % | 0.0195 × 0.1738 | **0.0072** |
| 188 | the corals | 0.0642 % | 0.4199 × 0.0977 | **0.0157** |
| r2-item-4 | the purple | 0.0251 % | 0.1387 × 0.0371 | **0.0489** |
| 130 | the cinnamon | 0.0600 % | 0.1348 × 0.0723 | **0.0616** |
| 168 | the blue | 0.0864 % | 0.0664 × 0.1934 | **0.0673** |

A population of the same size spread uniformly over the artwork has `fill = 4 · support` — 1e-4 at
208's size, seventy times below the floor. **0.005 sits just under the lowest concentration a reviewer
has actually named**, and two orders of magnitude above the diffuse prediction.

### What each blocked cover does now

| cover | reviewer asked for | 0.4.0 accent | `eligibility` | verdict |
|---|---|---|---|---|
| **r2-item-4** | *"very distinct purple … as the accent"* | `#292929` grey | **`#421b50` purple** | **FIXED.** The wall was the whole blocker: rank-0 passes by concentration (fill 0.0489) and publishes |
| **130** | *"cinnamon, coffee … instead of Holy Crow black"* | `#9f461c` | **`#97191a`** | **FIXED at rank 0.** The rank-0 cinnamon-red (fill 0.0616) publishes where 0.4.0 stepped past it |
| **208** | *"the significant yellow (album title, artist name)"* | `#58332a` | `#672129` | **NOT fixed, cause re-attributed.** The wall is gone — rank 0 now passes and publishes — but rank 0 **is a dark red, not the yellow**. `accent.ts` predicted this: the hue-separation term demotes a yellow against a warm beige field. The blocker is the ordering, not eligibility |
| **188** | *"missing some significant colors … full artwork's identity"* | `#0a5366` | `#0a5b6c` | **NOT fixed, cause re-attributed.** Rank 0 now *passes verification* (fill 0.0157) and is still refused — by the accent↔foreground separation and invariant-4 clauses downstream of it. Not a population question at all |
| 039 | *"magenta color / white text"* | already publishes the magenta as **foreground** `#713372` | unchanged | no change asked of this branch |
| 168 | *"accent … within the blue family"* | fg `#278aa9` / accent `#3d3936` | fg **`#2aa5e9`** / accent `#3d3936` | **unchanged in kind.** The blue is brighter but still lands in *foreground* via the swap comparator — the 0.4.0 interaction `accent.ts` wrote down, untouched here |

**Two of four blocked covers fixed; two re-attributed away from eligibility onto the accent ordering
and the downstream separation clauses.** That re-attribution is the more useful half: `accent.ts` said
*"what keeps four of them out is `SOURCE_POPULATION_FLOOR`, not the ordering"*, and on 208 and 188
that is now measured to be **wrong**.

---

## 6. Gate (e) — cover-114, and the refutation of defect 3

Reviewer verdict: *"the background of this artwork is not white, it is red"* (round-3 VERDICTS).
Diagnosis in `76059aa`: bar-count prevalence let a flat white shirt at 6.06 % beat the textured red
field at 1.45 % whose median **is** the field colour.

| setting | background | surface | prevalence (bg / sf) | ratio |
|---|---|---|---|---|
| 0.4.0 | `#e0e2df` white | `#b0332f` red | 3349 / 2328 | 1.44 |
| `prevalence` | `#e0e2df` white | `#b0332f` red | 3008.98 / 1767.22 | **1.70** |
| `field` | `#dee0df` white | `#ad2d2a` red | 2860 / 2021 | 1.42 |
| `field,prevalence` | `#dee0df` white | `#ad2d2a` red | 2681.50 / 1646.10 | **1.63** |

**The hypothesis is refuted, and refuted in the wrong direction.** The white background survives every
branch, and coherence-weighting *widens* the gap in white's favour on both field rules — because a
flat shirt sits deeper in the coherence field than a textured expanse does, so **coherence mass is
itself a flatness measure**. The brief's premise — that weighting by the field's mass would make the
answer reflect field membership rather than global flatness — is wrong about this instrument.

What the measurement leaves standing: the cause is not the *weight* on the count, it is the **count**.
A bar-population count under-counts a textured region by construction, because texture scatters a
region's own pixels outside its own median's bar. Any fix has to be to what is counted.

---

## 7. Gate (f) — coverage-220, three runs against a same-day 0.4.0 control

All runs `--no-cache`, 220 rows, 0 failed. Scorecard is `src/contract/scorecard.ts` with no `source`
option, exactly as `BASELINE-0.3.0.md` §3 ran it — `coverage-summary.ts` reproduces that file's own
numbers on its own run file to the row (198/220 PASS, 19/3/2 codes), which is what makes these columns
comparable rather than merely adjacent.

| | 0.4.0 control | `eligibility` | `all` |
|---|---|---|---|
| rows ok / failed | 220 / 0 | 220 / 0 | 220 / 0 |
| **scorecard PASS** | 200/220 (90.9 %) | **200/220 (90.9 %)** | **204/220 (92.7 %)** |
| `I4.ramp-below-contrast-floor` | 17 | **17** | 11 |
| `I4.below-contrast-floor` | 3 | **3** | 5 |
| `I3.pair-not-distinct` | 2 | **2** | 5 |
| **gradient rate** | 86/220 (39.1 %) | **86/220 (39.1 %)** | 85/220 (38.6 %) |
| stop histogram | 2:51 3:35 | 2:49 3:37 | 2:49 3:36 |
| surface collapse | 24 (10.9 %) | **24 (10.9 %)** | 21 (9.5 %) |
| **accent collapse** | 47 (21.4 %) | **29 (13.2 %)** | 34 (15.5 %) |
| escapes | 0 | 0 | 0 |
| pipeline seconds | 364.5 | **354.6** | 548.7 (**×1.5**) |

**Gradient neutrality holds on both branches** — 86, 86, 85 of 220. The rate the campaign watches for
big swings moved by at most one row.

**The eligibility column is the finding.** Every contract number is *identical* to the control — same
PASS count, same three code counts to the unit, same gradient rate, same surface collapses, no escape,
and 3 % less wall — while **accent collapse falls 47 → 29**. Eighteen covers that published no accent
at all now publish one, and nothing the contract measures got worse. That is not a trade.

The `all` column mixes that with the field branch and the mixture is worse on both sides: accent
collapse comes back up (29 → 34) and the code profile churns (`ramp-below-contrast-floor` −6, but
`pair-not-distinct` +3 and `below-contrast-floor` +2, for a net +4 PASS), at 1.5× the cost.

## 8. Gate (g)

**Skipped as the brief permits** — but one part of it is answered analytically rather than measured.
The original falsifier's edge-degeneracy statistic is the *non-field fraction*, and on the coherence
path it is **exactly β on every artwork at every resolution**, because F is a rank cut on a percentile
field. The quantity `ATTRIBUTION.md` measured drifting by up to 2789.9 % between a cover and its
re-encode is constant by construction. That is a fact about the design, not evidence that the
*membership* is stable — which is what gate (b) measures and what decides.

---

## 9. Separability, and the adoption decision

### 9.1 The three branches are separable, and only one of them is free

The pre-registered rule treats "the substrate" as one thing. The measurements say it is three, so each
was run on the harness alone. All six robustness runs are the same instrument on the same day on the
same working tree.

| | pairs (200) | perturbations (150) | **all 350 trials** | coverage-220 | cost |
|---|---|---|---|---|---|
| 0.4.0 control | 8.0 % (16) | 18.7 % (28) | **44** | — | 1.00× |
| `eligibility` | **8.5 % (17)** | **18.7 % (28)** | **45** | contract numbers identical, accent collapse −18 | 0.97× |
| `field` | **14.0 % (28)** | **12.0 % (18)** | **46** | (measured only inside `all`) | 1.41× |

- **`eligibility` is robustness-neutral and quality-positive.** One trial on the pairs and zero on the
  perturbations — 28/150 either way, arm for arm within noise (q92 31.6 → 34.2, q85 7.9 → 7.9,
  q75 10.8 → 13.5, dither 24.3 → 18.9), background and surface instability identical to the decimal
  (16.0 %, 36.0 %). All-four flips 56 → 55 on pairs, 10 → 13 on perturbations. Against that it fixes
  two of the four blocked identity covers, re-attributes the other two, and removes 18 accent
  collapses with **no** contract number moving.
- **`field` is a trade, not an improvement.** +6.0 pp on the resolution axis, −6.7 pp on the
  compression/dither axis, and **44 → 46 agreements out of 350** — inside a percentage point of a
  wash. The mechanism is legible in both directions: scale-relative radii buy resolution invariance,
  and a tie-free percentile field with a much wider ink band pays for it in noise invariance
  (foreground instability 46.0 → 65.3 % on the perturbation block).
- **`prevalence` is refuted** (§6) and should not be adopted in any form.

### 9.2 The pre-registered rule, applied to `field`

> *flip defaults only if (b) improves materially (≥ +3 pp pair agreement or all-four flips ≤ 40) AND
> (c) does not regress any arm by more than its Wilson interval AND (a) holds.*

| clause | verdict |
|---|---|
| (a) demo-20 byte-identity + determinism, flags off and on | **PASS** |
| (b) ≥ +3 pp pair agreement | **PASS, +6.0 pp**, intervals disjoint in both directions. (The second disjunct fails: all-four flips are 56, not ≤ 40.) |
| (c) no *arm* regressing beyond its Wilson interval | **PASS as written** — four arms, none regressing beyond a 20-point-wide interval |
| (c) the same clause on the pooled 150 trials | **FAIL** — 18.7 % is outside [7.7–18.2] |

**The rule as written returns ADOPT. A statistic the rule did not name returns DO-NOT-ADOPT.**

### 9.3 Decision

**No default is flipped. `P3_SUBSTRATE` remains unset and the shipped path is byte-identical to
`fb703d2` — verified, not asserted (§2).** Three reasons, in order:

1. **The choice between the two readings of clause (c) is not this worker's to make silently.** The
   arms are 37–38 trials by construction; the clause's per-arm form cannot see a 6.7 pp effect and the
   pooled form can. Reading the clause the way that returns the answer the pair block wants, after
   seeing both, is the failure mode this project's conventions exist to prevent.
2. **Total stability did not improve.** 44 → 46 agreements over the 350 measured trials is the
   headline the mechanism's structural-robustness claim has to answer to, and it is a wash. `field`
   moves stability between two axes; it does not create any.
3. **Two of the three constants the branch rests on are `[UNCALIBRATED]` with unexecuted anchor
   plans**, and the branch's own central claim — that scale-relative radii reduce the −0.212 resolution
   coupling — was **not measured** (tension 1). A default flipped on an unmeasured mechanism is a
   default nobody can defend when it moves.

**The recommendation, stated separately from the decision, is that `eligibility` is the piece that has
earned adoption** — it is free on both robustness axes, free on every contract number, and it is what
delivers §5's identity wins. It was not covered by the pre-registered rule, so it is named here and
left off rather than flipped. `field` should be held under the flag until the resolution-coupling slope
and a 400-trial perturbation block exist. `prevalence` should be retired or kept measurement-only.

---

---

## 10. Line tensions, reported not smoothed

1. **The scale radii are still quantised to integer pixels.** `COHERENCE_SCALE_BASE_LONG_EDGE` makes
   the neighbourhood a fraction of the artwork rather than of the grid, which is the half of the
   −0.212 coupling a rank cut cannot fix. But `Math.round` means two renditions 20 % apart in
   resolution can land on the same radius triple or on adjacent ones. **The coupling is reduced, not
   abolished, and this pass did not measure by how much** — the §8 slope was not recomputed on the
   coherence percentile. That is the largest unrun measurement here.
2. **Below a 256-px long edge the two smallest radii both clamp to 1 px and the product squares one
   scale.** Stated, not repaired: de-duplicating the radii would make the *number* of scales a
   discontinuous function of resolution, which is a worse coupling than the one it fixes.
3. **The field cannot report that an artwork has no field in it.** The 0.3.0 degenerate case was a
   real observation about busy photographs; a percentile field answers it by refusing to rank noise
   *against a threshold* rather than by detecting the case. If a busy cover's palette gets worse
   rather than merely more stable, that is where it came from.
4. **`COHERENT_FILL_FLOOR` is fitted to part of its own acceptance test.** The anchor set is five
   points and four of them are the covers gate (d) judges. The coverage-220 collapse and escape
   columns are what keep it from being circular, and they are reported above rather than assumed.
5. **The eligibility branch admits exactly the shape round 4's salience watch fired on.** `PARKED.md`
   records round-4's *"salience watch fired (item-009 artifact accent)"*. A concentrated population of
   a few hundred pixels is what a title-text mark looks like **and what a compression artifact or a
   blemish looks like**; `fill` cannot tell them apart, and 18 covers that used to collapse now publish
   an accent that nobody has looked at. The coverage numbers say nothing got worse *by the contract*;
   the contract does not measure salience. **This is the first thing a round-5 note about a junk accent
   will be about**, and it is the reason §9.3's recommendation is a recommendation and not a flip.
6. **The eligibility branch widens a predicate rather than replacing one.** `SOURCE_POPULATION_FLOOR`
   still passes colours on its own, so the brief's "instead of raw share" is implemented as "or", and
   a colour that is diffuse *and* large still qualifies exactly as before. That is deliberate — a
   replacement would have been a change to the shipped path's behaviour on every cover, which is not
   what a measurement wants — but it means the wall is widened, not retired, and the report should not
   be read as having retired it.
7. **The ink band is much wider on the substrate path**, `(1 − β, β)` of the coherence ordering rather
   than "non-edge and below the field cut". The ink field is the pipeline's only super-linear term and
   §7's ×1.5 pipeline cost is mostly that. No attribution pass has been run on the substrate path, so
   *which stage* the pair improvement is born in is unmeasured — the +5.0 pp is a fact about the
   published palettes, not about the field.
8. **Gate (c) is a 150-trial smoke, ~38 trials per arm.** Every arm-level statement in §4 is a
   direction, and §9.2 turns on precisely that: the per-arm Wilson clause cannot see the effect the
   pooled block can. **A 400-trial perturbation block was not run and is the single measurement that
   would settle the adoption question.**
9. **Nothing here has been seen by a reviewer.** Gate (d)'s "FIXED" verdicts are the analyst reading
   a hex against a reviewer's verbatim words. `#421b50` is a purple and `#97191a` is a cinnamon-red by
   any reading, but *"is that the purple they meant"* is a question for a round, not for this file.

---

## 11. Command lines

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields

# (a) output neutrality + determinism
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p3-fields/measurements/substrate/verify-neutrality.ts \
  research/v3/data/devloop/sets/demo-20.txt

cd research/v3

# (b) the pair block — the substrate run and the same-day control
P3_SUBSTRATE=field NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-perturbations --concurrency 6 \
  --out prototypes/p3-fields/measurements/substrate/robustness-pairs-field.json
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-perturbations --concurrency 6 \
  --out prototypes/p3-fields/measurements/substrate/robustness-pairs-0.4.0-control.json

# (c) the perturbation smoke, both ways
P3_SUBSTRATE=field NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-pairs --limit 150 --concurrency 4 \
  --out prototypes/p3-fields/measurements/substrate/robustness-perturb150-field.json
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-pairs --limit 150 --concurrency 4 \
  --out prototypes/p3-fields/measurements/substrate/robustness-perturb150-0.4.0-control.json

# (9.1) the same two blocks with the eligibility branch alone
P3_SUBSTRATE=eligibility NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-perturbations --concurrency 6 \
  --out prototypes/p3-fields/measurements/substrate/robustness-pairs-eligibility.json
P3_SUBSTRATE=eligibility NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-pairs --limit 150 --concurrency 4 \
  --out prototypes/p3-fields/measurements/substrate/robustness-perturb150-eligibility.json

# (d) + (e) the identity covers and cover-114, four settings each
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  prototypes/p3-fields/measurements/substrate/identity-probe.ts \
  --json prototypes/p3-fields/measurements/substrate/identity-probe.json

# (f) coverage-220, control and substrate
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/coverage-set-1-220.txt --workers 3 --no-cache \
  --out prototypes/p3-fields/measurements/substrate/run-coverage-220-0.4.0-control.jsonl
P3_SUBSTRATE=all NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/coverage-set-1-220.txt --workers 3 --no-cache \
  --out prototypes/p3-fields/measurements/substrate/run-coverage-220-all.jsonl
P3_SUBSTRATE=eligibility NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/coverage-set-1-220.txt --workers 6 --no-cache \
  --out prototypes/p3-fields/measurements/substrate/run-coverage-220-eligibility.jsonl
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  prototypes/p3-fields/measurements/substrate/coverage-summary.ts \
  prototypes/p3-fields/measurements/substrate/run-coverage-220-0.4.0-control.jsonl \
  prototypes/p3-fields/measurements/substrate/run-coverage-220-all.jsonl
```

## 12. Files

| file | what |
|---|---|
| `../../src/coherence.ts` | **new** — the multi-scale coherence field |
| `../../src/constants.ts` | `substrateFlags()` and the four substrate constants, all measurement-only |
| `../../src/field-roles.ts` | `computeCoherenceFieldSet`, weighted `prevalenceOf` |
| `../../src/foreground.ts` | `InkSubstrate` — the ink band's floor and the annulus's length field |
| `../../src/verify.ts` | `fill`, `rawSharePasses`, `coherencePasses`, the coherence route |
| `../../src/pipeline.ts` | the switch, the `depthOrdering` contract, the `verdicts` diagnostic map |
| `verify-neutrality.ts`, `_pinned-fb703d2/` | gate (a) |
| `identity-probe.ts`, `identity-probe.json` | gates (d) and (e), and the `COHERENT_FILL_FLOOR` anchor |
| `coverage-summary.ts` | gate (f); validated against `BASELINE-0.3.0.md` §3's own numbers |
| `robustness-pairs-field.json`, `robustness-pairs-0.4.0-control.json` | gate (b) |
| `robustness-perturb150-field.json`, `robustness-perturb150-0.4.0-control.json` | gate (c) |
| `robustness-pairs-eligibility.json`, `robustness-perturb150-eligibility.json` | §9.1 separability |
| `run-coverage-220-{0.4.0-control,eligibility,all}.jsonl` | gate (f) |
| `console-*.txt` | every run's console, unedited |

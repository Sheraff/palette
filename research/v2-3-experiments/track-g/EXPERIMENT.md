# Track G — white-text foreground

Base commit: `c3ac156` (current trunk, Track E's mark evidence integrated).

**Outcome: no algorithm change is proposed. The runtime is byte-identical to
trunk.** This arm ships instruments, three decisive measurements, and a
diagnosis that relocates the class from where the brief expected it.

The headline: **this is not a mark-evidence class and not a resolution class. It
is an identity-obligation class.** In all four cases the near-white lettering is
either kept out of the identity-obligation set entirely (case 3) or given half
the obligation weight of a near-black rival (case 4), and the winner objective —
which is decided on identity, not quality — follows the obligations.

## Corpus statement

Every measurement in this document was taken on the **unscrambled** corpus read
from the shared checkout `/Users/Flo/GitHub/palette/` (`PALETTE_IMAGES_ROOT`).
The worktree's own `images/` holds only `-scrambled` decoys and was never read.
The sweep set is the **union of the three current-trunk eval labels**
(`trunk-h`, `trunk-f`, `trunk-a5`) under `research/v2-3-eval/data/results/` —
**102 cases**: the 34 review fixtures, their scrambled decoys, and the cached
off-panel artworks from `00/`–`11/`. `data/trunk.json` is the baseline; it
reproduces the cached labels on **232 of 244** label/case comparisons, the 12
differences all being cases where `trunk-a5`/`trunk-f` predate Track E and later
trunk work (`slim`, `muse`, `05/…`, `placebo-scrambled`, …).

## Baselines for the four cases

| case | trunk (`c3ac156`) | reviewed target |
| --- | --- | --- |
| 1 `images/knuckles.jpg` | `#beb2c6 #7b80a8 #d8cbdd #60aac5` | parked (resolution limit) |
| 2 `09/…9d178a` **do-not-break** | `#000000 #21203f #f5f7f4 #15a6a9` | unchanged |
| 3 `01/…015083` | `#927f92 #fcfef9 #23232d #824892` | `#927f92 #615362 #fcfef9 #824892` (review-10, **strong**) |
| 4 `07/…07cc8b` | `#5d856b #99bece #242426 #fbfbfb` grad | fg white, accent marmalade-orange |

Case 3's target is not a guess: review-10 recorded `c-alt2` =
`#927f92 #615362 #fcfef9 #824892` as **strong**, and review-9's note on the same
artwork reads "the foreground of option A is good, the snow white matches the
artworks text". So the desired outcome is an already-reviewed palette.

## Measurement 1 — mark evidence has zero leverage (decisive negative)

The brief's mechanism (a) was to extend Track E's mark evidence so that
full-bleed display type still qualifies (their `015083` note: group box 73 % of
the frame, `markSupport = 0.043`).

Rather than design a discriminator, I removed the question: **force
`markSupport = 1.0` for every family that clears the stroke floor** — far beyond
anything any full-bleed-display-type rule could justify — and measure.

```
                              trunk                          markSupport := 1.0
knuckles      #beb2c6 #7b80a8 #d8cbdd #60aac5   #beb2c6 #b47f9b #d8cbdd #60aac5
09/…9d178a    #000000 #21203f #f5f7f4 #15a6a9   #000000 #662948 #f5f7f4 #15a6a9  <- GUARDRAIL BROKEN
01/…015083    #927f92 #fcfef9 #23232d #824892   #927f92 #fcfef9 #23232d #824892  <- UNCHANGED
07/…07cc8b    #5d856b #99bece #242426 #fbfbfb   #5d856b #99bece #242426 #fbfbfb  <- UNCHANGED
slim          …#56676f #df2a33                  …#56676f #df2a33
placebo       …#fbfdfa #111312                  …#fbfdfa #111312
disney        …#fbfdfc #c72690                  …#fbfdfc #a91f6c
```

**Neither target case moves at any value of mark evidence, and the case-2
guardrail breaks.** This reproduces Track E's knuckles result on two *well
resolved* artworks: mark recognition is not the blocker for this class. Any work
on full-bleed display-type recognition would be measuring something real and
changing nothing — I am not proposing it.

Why it cannot work is visible in the numbers: `markSupport` substitutes only into
the population-normalised `totalSupport`/`connectedSupport` terms, and both
white families are **already well supported** — `015083`'s white is 5.81 % of
pixels and `07cc8b`'s is 6.79 %, against a `/0.08` normaliser. The substitution
is a `max`, so it is a no-op exactly where this class lives. Track E's mechanism
is for 0.2 %-of-frame lettering; these are 6 % display graphics.

## Measurement 2 — the resolution-relative term is irrelevant here

Mechanism (b), the `resolved = clamp(log2(population + 1) / 8)` absolute-pixel
term. Both target artworks are **640×640 with 30–45 px glyph heights**. Measured
on the white families' components, the `resolution`/`geometry` factors read
**0.99** and their `sourceSupport` is saturated — the term is at its ceiling.
Making it resolution-relative would *lower* these values, not raise them.

So the blast-radius question the brief asked me to weigh does not arise: the term
is not what is holding this class back, and I did not perturb it. It remains a
live question for the small-lettering class (knuckles, `03/…`), which is Track
E's finding and stands unchanged.

## Measurement 3 — where the class actually lives

### Case 4 (`07/…07cc8b`) — the foreground lane already ranks white first

`inspect-families.ts` on the winning field:

| family | pop | comps | qual | markSupport | fgScore | fgTypo | **fgRoleScore** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `family-10804` `#fafbfb` white | 6.79 % | **32** | 19 | 0.234 | 0.694 | 0.862 | **0.761 (rank 1)** |
| `family-3706` `#1f3a29` | 3.89 % | 632 | 24 | 0.009 | 0.590 | 0.815 | 0.680 |
| `family-2865` `#252527` near-black | 4.41 % | 702 | 24 | 0.027 | 0.526 | 0.908 | 0.679 (rank 3) |
| `family-7783` `#ef7226` orange | 0.17 % | 11 | 9 | **0.716** | 0.328 | 0.652 | 0.458 |

And the **field-conditional role classifier** (`role-obligations.ts`), the
purpose-built instrument for "which family is the artwork's text", agrees
decisively:

```
p0 family-10804  requiredRole=foreground  fg=0.954 ac=0.703  decisive-foreground
p1 family-2865   requiredRole=foreground  fg=0.924 ac=0.699  decisive-foreground
p2 family-5070   requiredRole=foreground  fg=0.909 ac=0.671  decisive-foreground
```

White is the artwork's text by every foreground instrument the system owns — it
is also a *clean* graphic (32 connected components total, against near-black's
702), which is why its `markSupport` is 9× higher. **And it still lands in the
accent.**

The decision is made in `base-scoring.identityEvaluation`, and it is arithmetic,
not judgement. Identity obligations are `family-2865@p0, family-10804@p1,
family-7783@p2`, so `priorityWeight` is `1` vs `0.5`. Because `#242426` and
`#fbfbfb` are both near-neutral, `identityBearingAccent` is **false** either way
— the accent earns no identity credit in either arrangement — so coverage
reduces to *whose obligation weight sits in the foreground*:

| treatment (same field) | numerator | coverage | quality |
| --- | --- | --- | --- |
| fg `#242426` / ac `#fbfbfb` (trunk) | `1 × 1.0` | **0.714** | 0.8385 |
| fg `#fbfbfb` / ac `#242426` | `0.5 × 1.0` | 0.357 | 0.8342 |

(denominator `1 + 0.5 × 0.8 = 1.4`; the model reproduces the observed 0.714 /
0.357 exactly.) The quality gap is **0.0043**; the relation gap is **0.0221**.
The foreground is chosen by obligation priority, and white loses 2:1.

I checked whether the obligation ordering key is at fault — it is
`evidenceLevel(bestRegion.signatureAccent.score)`, an *accent*-flavoured score
used to rank families that will fill the *foreground*. It is not the culprit:
the foreground-flavoured counterpart agrees.

| family | best `signatureAccent` | lvl | best `foregroundTypography` | lvl |
| --- | --- | --- | --- | --- |
| `family-2865` near-black | 0.9243 | **23** | 0.9377 | **23** |
| `family-10804` white | 0.9012 | 22 | 0.8784 | 21 |

So the *best single region* of the near-black beats the white's, while the
*family as a whole* is decisively worse text. The obligation system ranks by best
region; the role classifier ranks by the family. They disagree, and the
obligation system wins.

### Case 3 (`01/…015083`) — the snow-white is not an identity obligation at all

The white-foreground arrangement is **already better on quality** and loses only
on identity:

| treatment | quality utility | relation utility | identity coverage |
| --- | --- | --- | --- |
| `#927f92 #fcfef9 #23232d #824892` (trunk winner) | 0.7117 | **0.7731** | high |
| `#927f92 #615362 #fcfef9 #23232d` | **0.7260** | 0.7486 | 0.451 |
| `#927f92 #824892 #fcfef9 #23232d` | 0.7079 | 0.7497 | 0.666 |

`foregroundPath` for the white arrangements is **0.949–0.952** against the
winner's 0.811 — as a reading surface the snow-white is far better, and the
objective knows it. It loses purely on identity coverage.

The reason is sharper than "white was spent as the surface". I verified
`family-10783` is **not** field-owned (`fieldScore` level 7 vs `signatureRoleScore`
level 18) and **is** in the signature lane. It is excluded by the
**neutral-obligation quota**:

```
identity.neutralObligationChroma = 0.06     identity.maximumNeutralObligations = 2
obligations: family-2865@p0 (near-black, neutral), family-5551@p1 (plum),
             family-3769@p2, family-4651@p3
```

`family-10783` (snow white, chroma ≈ 0.008) is neutral, ranks below the
near-black on region evidence level, and the neutral slots are taken. **It
therefore earns zero identity credit in any role**, which is why the arrangement
review called strong cannot win.

The quota's own comment explains its purpose — "two greys separated only by
lightness clear [material distance] easily, so a neutral-heavy artwork can spend
every slot restating one direction". That reasoning is sound for two mid-greys.
But **a snow-white and a near-black are not one direction for the foreground
role**: the foreground claim is about lightness polarity against the field, not
hue, and these two sit at opposite ends of it. The quota was designed to protect
chromatic directions from neutral crowding, and its side effect is to make the
artwork's white text unrepresentable.

### The unifying statement

In **both** cases the artwork's near-white lettering competes with a near-black
family for *neutral identity standing*, loses on best-single-region evidence
level, and is thereafter unable to claim the text role — in case 4 at half
weight, in case 3 at zero. Cases 1 and 2 are consistent: knuckles' white never
reaches the lane at all (Track E's resolution limit), and case 2's near-white
`family-7212` **is** obligation `p0`, which is exactly why it holds its
foreground correctly and why it stayed byte-identical under every variant I ran.

## What I tried, and why I am not shipping it

Mechanism (c): let the field-conditional foreground evidence, rather than generic
obligation priority, weight a **foreground** placement. The quantity is already
computed and carried for every family — `role-evidence.ts` says so in its own
doc comment ("because the identity objective has to compare a proposed
foreground against the incumbent"). It is a re-weighting with **no new
thresholds**.

Patch: `foreground-rank-weight.patch` (env-gated, against `base-scoring.ts`).

| variant | rule | cases changed / 102 |
| --- | --- | --- |
| v1 | always weight foreground placements by foreground-evidence rank | **21** |
| v2 | only when the accent is not identity-bearing | **5** |
| v3 | v2, excluding collapsed accents | 5 (identical to v2) |

v1 is unusable: it lets *chromatic* families claim the top foreground weight and
swaps near-white foregrounds **out** on `00/…9f60`, `11/…117a` and `johns` —
the exact opposite of this track's purpose, and against the recorded principle
that the text stays near-neutral while identity lives in the field and accent.

v2 narrows correctly — when both foreground and accent are near-neutral the
accent carries no direction, so identity has no directional basis for preferring
either family in the text role, and foreground evidence should decide. Full
102-case sweep, v2 against trunk:

| case | change | status |
| --- | --- | --- |
| `07/…07cc8b` | fg `#242426` → **`#fbfbfb`**, ac `#fbfbfb` → `#242426`, field `#5d856b #99bece` → `#4e745b #8daab8`, midpoint → null | **target hit** |
| `05/…5e5a5ff6` | accent `#ee231f` → `#86858b` | **regression — reviewed strong (review-11, `trunk-c5`)**, reverses Track E's red mark accent |
| `images/once.jpg` | fg `#3b303e` → `#070004`, ac `#6c5f71` → `#3b303e` | **regression — reviewed strong (review-12, `trunk-f`/`trunk-b6`)** |
| `images/black.jpg` | fg `#575757` → `#424242`, accent collapse released | unreviewed |
| `images/horrorwood-scrambled.jpg` | fg/accent shuffle | decoy only (`horrorwood.jpg` unchanged) |

Case 2 (`09/…9d178a`), `slim`, `placebo`, `disney`, `muse`, `knuckles` and case 3
are all **unchanged** under v2.

**Two frozen reviewed outcomes break, so under the charter this cannot ship.**
The regressions are structural rather than incidental: boosting a neutral-accent
treatment's coverage lets it overtake chromatic-accent treatments that review
preferred (`05/…`). I tried to keep the penalty without the promotion
(`min(generic, rank)`); that makes case 4 an exact **tie** on coverage, which
quality then breaks back in the incumbent's favour — so the flip genuinely
requires promoting white's weight, and the promotion is what leaks.

I did not lower `identityForegroundClaimMargin` (0.04) to catch case 4's 0.030
foreground-evidence gap. That would be a threshold fitted to one artwork — Track
E's rejected pattern — and I decline it.

## The accent-should-be-orange half of case 4

Reported, not forced, per the brief. `family-7783` `#ef7226` is the marmalade
title: **`markSupport = 0.716`, the highest in the artwork**, 11 components of
which 9 qualify, and the role classifier calls it `decisive-accent`. It **is**
identity obligation `p2`. It still never reaches the accent slot, in trunk or in
any variant. This is the same defect Track E escalated on `05/…` and `11/…`:
strong chromatic marks that are correctly classified and correctly obligated
still lose the accent to neutrals. It wants its own arm and is not fixable from
the foreground side.

## Honest assessment

**Achieved**

- Two decisive negatives that close off the brief's mechanisms (a) and (b) for
  this class, each measured rather than argued — (a) at the mark ceiling, on the
  unscrambled corpus, with the guardrail failing as a bonus signal.
- A precise, arithmetic diagnosis of both well-resolved cases, reproducing the
  observed identity-coverage numbers exactly from the policy constants.
- Case 3 relocated from "field selection" (where I first placed it, wrongly) to
  the neutral-obligation quota, with the field-ownership hypothesis explicitly
  falsified by measurement.
- Determinism verified (3 identical runs on cases 2, 3, 4), typecheck clean,
  architecture test passes, runtime byte-identical to `c3ac156`.

**Not achieved**

- Case 3's foreground does not move. No variant I ran touched it, because the
  white is outside the obligation set entirely — a coverage re-weighting cannot
  reach a family with zero coverage.
- Case 4 moves only at the cost of two frozen reviewed outcomes.
- Case 1 unchanged, as Track E parked it; nothing I measured suggests a
  resolution-relative fix would help, since the class's real blocker is upstream
  of resolution.

**Uncertainty**

- v2's two regressions might be *arguable* rather than plainly bad — `once.jpg`
  moves between near-neutral dark purples, and I did not view them. I have
  recorded them as regressions because they are frozen reviewed outcomes, which
  is the guardrail I was given, not because I judged the colours worse.
- The claim "the neutral quota is the case-3 blocker" is inferred from the
  selection code plus the confirmed facts that `family-10783` is neutral, is in
  the signature lane, and is not field-owned. I did not instrument
  `neutralQuotaOmittedFamilyIds` directly.

## Proposed review items

None from this arm — the output is byte-identical to trunk, so there is nothing
to compare. Three findings for the orchestrator instead, in priority order:

1. **Polarity-aware neutral-obligation quota** (case 3, highest leverage). A
   snow-white and a near-black are one *hue* direction but opposite *foreground*
   claims. Letting the quota count them separately — or exempting the
   lightness-extreme pair — would put `015083`'s white text into the obligation
   set, and the arrangement review already called **strong** is sitting there
   with **higher quality utility** than the incumbent, needing only identity
   credit to win. This is the single change most likely to fix the class.
2. **Obligation ordering reads the best single region, the role classifier reads
   the family** (case 4). On `07cc8b` these disagree (near-black wins on best
   region 23 vs 21; white wins decisively as a family 0.954 vs 0.924), and the
   best-region ranking decides the text role. Whether a family-level foreground
   measure should order obligations is a real design question; my v2 patch is
   one answer and it costs two reviewed outcomes, so it needs a better one.
3. **Strong chromatic marks still cannot reach the accent** (`07cc8b`'s orange at
   `markSupport = 0.716`, plus Track E's `05/…` and `11/…`). Now three artworks
   with the same signature.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-g/run.ts <label> [caseFilter]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-g/diff.ts trunk <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-g/inspect-families.ts <image> [--focus #hex]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-g/inspect-roles.ts <image>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-g/inspect-treatments.ts <image> [--fg #hex]
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-g/inspect-obligations.ts <image...>
```

`data/trunk.json` is the `c3ac156` sweep; `data/fg-rank.json` is v1,
`data/fg-rank-neutral.json` v2, `data/fg-rank-v3.json` v3. To reproduce a
variant: `git apply research/v2-3-experiments/track-g/foreground-rank-weight.patch`
then run with `TRACK_G_FOREGROUND_RANK=1|2|3`. Images are read from
`PALETTE_IMAGES_ROOT` (default `/Users/Flo/GitHub/palette`) because `images/`
and the numbered directories are gitignored and absent from a worktree.

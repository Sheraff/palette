# Track M — accent vividness in the quality objective

Base commit: `3cb2ecd` (trunk after Track K's frame handling), merged as `fe305b5`.

The brief: human review answered Track L's re-ask on `08/…087b13` by **preferring
the vivid red `#ff4e2a` strongly** over the well-evidenced caramel — paying the
0.0085 quality margin for vividness knowingly. That was to convert the
quality-weight question into an implementable arm: a bounded vividness term in
accent quality, or a reduced weight on population-flavoured support for the
accent role, calibrated so three anchors flip/hold and every guardrail survives.

**Outcome: no algorithm change is proposed; the runtime is byte-identical to
trunk.** The mechanism was built, made parametric in *both* of its constants, and
swept. There is no setting at which the anchor flips and the guardrails hold —
the two regions are disjoint and far apart — and the reason is arithmetic that
also corrects a premise in the brief and in my own Track L report.

## Corpus statement

Unscrambled corpus via `PALETTE_IMAGES_ROOT`. Sweep set **109 cases**: the 34
fixtures + scrambled decoys ∪ the canonical
`research/v2-3-eval/data/offpanel-manifest.txt` ∪ one off-panel case the manifest
omits. Baseline verified **80/80 identical to cached `trunk-j`**. Verdicts mined
from the committed `verdicts.jsonl` (104 records, through batch 15).

Per the brief, `09/…0955ccfc` is excluded from every claim here (Track K round 2
is moving it in parallel).

## Measurement 1 — the brief's premise about where the margin lives is wrong

Track L reported, and the brief repeats, that "`sourceSupport`,
`representativeness`, `economy` collectively prefer well-evidenced muted
colours". Decomposing `08/…087b13` on the winner's own field and foreground
(`inspect-accent-margin.ts`), the raw axis deltas are:

```
winner ac=#e7a680  C=0.0927  pop 3.80%    qual 0.8598  idCov 0.929  rel 0.9291
wanted ac=#f94a2f  C=0.2155  pop 0.57%    qual 0.8513  idCov 0.500  rel 0.8820

sourceSupport +0.0426   representativeness +0.0358   accentFidelity -0.0192
economy       +0.0173   artworkIdentity    +0.0094
```

But **`sourceSupport` is not in `QUALITY_AXES` and carries weight zero in
`qualityUtility`** (it is carried in the evaluation record for the Pareto blocks
and the quality guard, not in the scalar). The weighted decomposition of the
0.0086 quality margin is therefore:

| axis | delta | weight | contribution |
| --- | --- | --- | --- |
| representativeness | +0.0358 | 0.12 | **+0.0043** |
| economy | +0.0173 | 0.09 | +0.0016 |
| artworkIdentity | +0.0094 | 0.12 | +0.0011 |
| accentFidelity | −0.0192 | 0.07 | **−0.0013** (the red is already ahead here) |
| sourceSupport | +0.0426 | **0** | **0** |

The largest raw deficit contributes nothing, and the accent-owned fidelity axis
already favours the red — Track J's evidence-site repair is doing its job. My
Track L sentence named `sourceSupport` first; it should not have been in the list
at all.

## Measurement 2 — and the margin that matters is not the quality margin

`relationUtility = qualityUtility + identityGain`, exactly (0.8598 + 0.0693 =
0.9291; 0.8513 + 0.0307 = 0.8820). The winner comparator bands
`relationUtility` at 0.005, so the two sit **nine bands apart**.

```
total gap  0.0472
  quality      0.0086   (18 %)
  identityGain 0.0386   (82 %)
```

**Eighty-two per cent of the gap is identity gain**, which is
`coverage × 0.05 + authorizedGain`, and coverage here is set by obligation
priority — the red at `p3` (weight 0.25) against the caramel at `p1` (0.5).
**Track L proved that unreachable**: the caramel leads the red on both ordering
keys, and re-ordering breaks eight reviewed outcomes without fixing this case.

So a quality-side mechanism is being asked to close a gap that is 82 % not
quality. The accent-owned quality weights total `accentFidelity 0.07 + half of
economy 0.045 + accentIdentity's share of artworkIdentity 0.032 ≈ 0.15`; to move
0.047 through them requires driving the accent terms apart by ~0.31 — a swing
larger than most of these axes' whole dynamic range between two real candidates.

## Measurement 3 — the mechanism, built and calibrated in both constants

Implemented as a bounded multiplicative preference at the three accent-quality
sites (`accentIdentity`, `accentFidelity`, `accentEconomy`), leaving candidacy
untouched exactly as Track J's repair does:

```
accentVividness = 1 - s + s * clamp(chroma(accent) / full)      s = 0 restores trunk exactly
```

The first calibration pass used `full = identityDirectionFullChroma = 0.09`, the
objective's own "fully saturated identity direction" yardstick. **It moved the
anchor by nothing at any strength up to 1.0** — because the caramel `#e7a680` has
OKLab chroma **0.0927 and therefore already clears that bar**. Measured at
`s = 1.0`, the `08` margin is *bit-identical* to trunk: qual 0.0086, rel 0.0472.

**The caramel is not a muted colour by the objective's own definition of muted.**
The palette is not choosing grey over red; it is choosing one fully-saturated
direction over another, more saturated one. That is the finding that reframes the
arm.

So the yardstick was made parametric too and widened to `full = 0.22` (the red's
own chroma — the most generous yardstick the case admits).

### Calibration curve

| `full` | `s` | `08` anchor | guardrails broken |
| --- | --- | --- | --- |
| 0.09 | 0.3 | no change | **`07/…07cc8b` `#242426` → `#1f3a29`** |
| 0.09 | 0.6 | no change | `07cc8b` → `#ee7326`; `horrorwood` field+accent |
| 0.09 | 1.0 | no change | + `orelsan` field, `horsley` inverted, `once` accent collapses |
| 0.22 | 0.4 | no change | `07cc8b` → `#ee7326`; **`doja` surface+accent** |
| 0.22 | 0.7 | no change | + `horsley` inverted, `once` collapses, `horrorwood` collapses |
| **0.22** | **1.0** | **FLIPS to `#f94a2f`** | **`07cc8b`, `doja`, `orelsan`, `horsley`, `once`, `meteora`, `horrorwood`** |

The anchors that must *hold* — `placebo #c91611`, `05/…5e5a5ff6 #ee231f` — hold
at every setting, as do `krafty`, `johns` and `skap`. That is the one piece of
good news and it is not enough.

**The damage begins at `s = 0.3` and the fix arrives only at `s = 1.0` with a
yardstick 2.4× the objective's own.** The guardrail-safe region and the
target-flipping region are disjoint, and the first guardrail to fall is
`07/…07cc8b`'s `#242426` — a **batch-15 strong verdict on the palette my own
Track H produced**.

There is a bitter detail in the middle of the table: at `full = 0.09, s = 0.6`,
`07/…07cc8b`'s accent becomes `#ee7326` — the marmalade orange review asked for
in batch 15. Track J measured that accent's APCA pairs across this artwork's
gradient as `−12.7, 0.0, +7.7, +11.2, +15.0`: a sign flip through exact zero,
invisible on one of five samples. **The vividness term delivers a
human-requested accent that is measurably broken**, which is a compact
demonstration of why chroma alone is the wrong lever.

## Measurement 4 — the full sweep at the only setting that works

At `full = 0.22, s = 1.0`, the one setting that flips the anchor, over all 109
cases (`09/…0955ccfc` excluded from the accounting per the brief):

**52 of 109 cases change. 27 land on artworks carrying verdicts. Thirty
reviewed-and-applied palettes are destroyed; one is gained — the anchor.**

The casualty list is the reviewed corpus itself: `doja` (three separate strong
verdicts), `once` (four), `orelsan`, `horsley`, `meteora`, `elephunk`, `nobs`,
`knuckles`, `vvbrown`, `horrorwood`, `07/…07cc8b` (batch-15 strong),
`09/…fdddff2` (the standing guardrail, twice), `11/…2b222b02` (twice),
`11/…110226` (twice), `08/…087b13`'s own batch-15 *acceptable* palette, and
seven more off-panel artworks.

**Thirty reviewed palettes for one.** That is the arm's final number, and it is
not a calibration problem — it is what a 100 % vividness gate at a 0.22 yardstick
does, and nothing weaker moves the anchor at all.

## What would actually be required

`08/…087b13` needs 0.0472 of relation utility. The honest accounting:

| lever | reachable | status |
| --- | --- | --- |
| accent quality axes (this arm) | ≤ ~0.015 before guardrails fall | **closed here** |
| removing the accent from `representativeness` entirely | 0.0043 (9 %) | 9 % of the gap; `sourceSupport` is weightless |
| obligation priority (identity gain, 82 %) | 0 without breaking 8 reviewed outcomes | **closed by Track L** |
| identity credit for near-neutral accents | — | **closed by Track L** (12 reviewed near-neutral accents) |

Every named lever is now measured and closed. What is left is not a mechanism but
a **policy question**: the reviewer has said, on this artwork, that a 0.57 %-of-
frame vivid family should beat a 3.80 % family that is *also* fully chromatic.
The objective currently encodes the opposite preference through obligation
priority, and priority is set by region evidence, which population dominates.

That is a coherent thing to want and a coherent thing to change — but it is a
change to *what identity priority means*, not to accent quality weights, and on
Track L's evidence it costs eight reviewed outcomes as currently keyed. It needs
its own arm with a mechanism nobody has proposed yet, and probably more than one
artwork of evidence.

## Honest assessment

**Achieved**

- Two premise corrections, both load-bearing and both mine to make: `sourceSupport`
  carries **zero weight** in `qualityUtility` (it was first in my Track L list and
  first in this brief), and the caramel at chroma **0.0927 already clears the
  objective's own full-chroma bar**, so "vivid versus muted" is not the contrast
  this case presents.
- The gap decomposed exactly: **82 % identity gain, 18 % quality** — so a
  quality-weights arm was aimed at a fifth of the problem before it started.
- The mechanism built, made parametric in both constants, and calibrated over six
  settings against three anchors and ten guardrails. The result is not "it did not
  work" but a **located boundary**: damage from `s = 0.3`, fix at `s = 1.0` with
  `full = 0.22`, regions disjoint.
- The anchors that had to hold (`placebo`, `05/…`) held everywhere, confirming
  they were never at risk from this direction.

**Not achieved**

- `08/…087b13` is not fixed and, on this evidence, is not fixable from accent
  quality.
- I did not implement the brief's second option (reduced population-flavoured
  support weight *for the accent role*) as running code. Its ceiling is
  arithmetic: `representativeness` is the only weighted population-flavoured axis
  the accent touches, its delta is 0.0358, its weight 0.12, so removing the
  accent's contribution entirely yields **0.0043 of the 0.0472 needed — 9 %** —
  and `sourceSupport`, the larger deficit, is weightless. I judged that not worth
  a sweep. That is a judgement call and it leaves the option formally unmeasured
  on winners.

**Uncertainty**

- The vividness term is multiplicative on three sites at once. A term applied to
  only one site, or an additive one, would have a different guardrail profile —
  though it cannot have a different *ceiling*, which is set by the axis weights
  and is what closes the arm.
- `full = 0.22` is the red's own chroma, chosen as the most generous yardstick
  the case admits. A still wider yardstick would flip `08` at lower strength but
  would penalise every accent in the corpus more steeply, so it moves the
  guardrail boundary the wrong way.
- The calibration subset is 13 artworks. The full sweep (measurement 4) is the
  corpus-wide check, but only at the one setting that flips the anchor.

## Proposed review items

**None from this arm** — the runtime is byte-identical to trunk, so there is
nothing to compare. Three findings instead:

1. **`08/…087b13` cannot be delivered by any mechanism now on the table.** The
   verdict is recorded and I could not honour it. Before another arm is spent
   here, it is worth deciding whether the reviewer's preference generalises: is a
   0.57 %-of-frame vivid family *generally* to be preferred over a 3.80 %
   fully-chromatic one, or is this artwork-specific? The answer determines whether
   the target is obligation priority (a policy change, 8 reviewed outcomes at
   risk) or nothing.
2. **`07/…07cc8b` is the most fragile palette in the corpus.** It is the first
   guardrail to fall under this mechanism, at the mildest setting tried, and the
   accent it falls to is the one review asked for and the one Track J measured as
   invisible on part of its own gradient. Its gradient remains the open question
   Track J named.
3. **`sourceSupport` and `renderedFieldClaim` are computed and reported but
   carry no weight in `qualityUtility`.** That is presumably deliberate (they feed
   the Pareto blocks and the quality guard), but it is not documented at the
   weights table, and it has now misled two experiment reports and one brief.
   Worth a comment in `base-scoring.ts` at minimum.

## Reproducing

The mechanism is not in the runtime. Restore it from `vividness.patch` and run
with `TRACK_M_VIVIDNESS` and `TRACK_M_FULL_CHROMA`.

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-m/inspect-accent-margin.ts <image> [--top N]
sh research/v2-3-experiments/track-m/calibrate.sh 0 0.3 0.6 1.0
sh research/v2-3-experiments/track-m/calibrate2.sh "0.22 0.4" "0.22 0.7" "0.22 1.0"
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-m/run.ts <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-m/diff.ts trunk-3cb2ecd <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-m/verdict-check.ts trunk-3cb2ecd <label>
```

`data/trunk-3cb2ecd.json` is the baseline, `data/m1-vividness-max.json` the sweep
at `full = 0.22, s = 1.0`, `data/calibration.txt` the full calibration log.

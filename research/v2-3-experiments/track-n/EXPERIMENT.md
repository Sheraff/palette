# Track N — the small-vivid-versus-larger-chromatic series

Probes only. **No runtime change**; trunk `3cb2ecd` is untouched.

Flo's question was whether the `08/…087b13` preference generalises: *should a
small, highly saturated family beat a larger family that is already fully
chromatic, for the accent role?* This builds the series to answer it.

## 1. The detector

`detect-vivid-contest.ts`. A case is a **live contest** when, on the winner's own
field and foreground:

| condition | value | why |
| --- | --- | --- |
| winning accent chroma ≥ `winnerFullChroma` | 0.09 | the incumbent is *already* a full chromatic direction — deliberately **not** grey-versus-colour, which is a different and settled question |
| winning accent family population ≥ `winnerPopulationFloor` | 1.5 % | the incumbent is the "well-evidenced" side |
| challenger family population ≤ `smallPopulation` | 1.5 % | the challenger is the small mark |
| challenger chroma − incumbent chroma ≥ `chromaLead` | 0.06 | meaningfully more saturated, not a shade |
| population ratio ≥ `populationRatio` | 2× | the trade is real |
| challenger forms a **legal accent-only variant** of the winner | — | same background, surface, foreground and gradient flag, taken from the actual scored slate — nothing invented |

Tuned so `08/…087b13` is the prototype match. Verified on controls: `placebo`,
`05/…5e5a5ff6`, `krafty` and `doja` are all **correctly rejected** — in each the
vivid family already holds the accent, so there is no contest to review.

The accent-only constraint matters for the batch: **the two sides of every pair
differ in exactly one colour**, so a verdict is a judgement about the accent and
nothing else.

## 2. The mine

**1,767 images sampled, 22 live contests → a 1.25 % base rate.** Deterministic
stride sampling (sorted listing, fixed offset — no randomness), biased toward the
never-sampled roots.

| draw | images | of which `0a`–`0f` |
| --- | --- | --- |
| first | 507 | 252 |
| expansion | 1,260 | 660 |
| **total** | **1,767** | **912 (52 %)** |

Hits by root: `0b` 5, `0e` 3, `0f` 3, `00` 2, `02` 2, `0a` 2, `06` 1, `08` 1,
`0d` 1, `11` 1, `13` 1.

**The base rate is itself part of the answer.** At 1.25 % this class is roughly
**95 artworks in the 7,550-image corpus** — small, but not negligible, and spread
across every root rather than concentrated in one style.

**Zero errors in 1,767 extractions**, including 912 images from roots that had
never been run.

## 3. The series — 10 cases

Written as pseudo-result files in the standard schema:

- `research/v2-3-eval/data/results/vivid-series-incumbent/<name>.json` — the current winner
- `research/v2-3-eval/data/results/vivid-series-vivid/<name>.json` — the same palette with only the accent swapped
- `research/v2-3-eval/data/results/vivid-series-manifest.json` — per-case statistics

(Committed copies of all three under `research/v2-3-experiments/track-n/review-series/`,
because `results/` is gitignored.)

Every vivid side is a **real treatment from the actual slate** — source-supported
colour, an arrangement the objective already scored and ranked. The
`researchRender` block is identical on both sides, so a gradient case renders the
same ramp and only the accent swatch differs.

Ordered by how much of the losing margin is **identity** rather than quality —
the axis the answer probably turns on:

| # | case | incumbent accent | vivid accent | mark | margin | identity share |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `06/…06eb2197` | `#8a7c33` olive 5.66 % | `#fcdd44` yellow 1.15 % | 0.092 | 0.0378 | **102 %** |
| 2 | `0e/…0e229142` | `#d5c675` khaki 3.30 % | `#f5f652` yellow 0.69 % | **0.383** | 0.0834 | 92 % |
| 3 | `08/…087b1314` **prototype** | `#e7a680` caramel 3.80 % | `#f94a2f` red 0.57 % | 0.103 | 0.0472 | 82 % |
| 4 | `11/…113e357f` | `#e7e38c` pale yellow 5.92 % | `#da2723` red 0.45 % | **0.617** | 0.0447 | 77 % |
| 5 | `0f/…0f723f36` | `#8b65b0` mauve 1.59 % | `#8827c4` violet 0.48 % | 0.030 | 0.0398 | 72 % |
| 6 | `0a/…0a8aa1da` | `#8f3908` brown 5.25 % | `#fbf809` yellow 0.44 % | **0.526** | 0.0346 | 65 % |
| 7 | `0b/…0b87c434` | `#b68646` tan 7.64 % | `#9e0d2e` crimson 0.46 % | 0.027 | 0.0454 | 63 % |
| 8 | `0b/…0b096f0b` | `#54995a` sage 3.14 % | `#17d21f` green 1.28 % | 0.089 | 0.0289 | 50 % |
| 9 | `0d/…0d457f4b` | `#fb8257` coral 9.61 % | `#df241d` red 1.40 % | 0.010 | 0.0313 | 47 % |
| 10 | `02/…02dc280c` | `#12356d` navy 3.73 % | `#ea64bb` pink 0.85 % | 0.020 | 0.0292 | **15 %** |

One line each:

1. **`06/…06eb2197`** — olive-drab field; the vivid yellow **wins on quality**
   (margin −0.0008) and loses *purely* on identity priority. The cleanest possible
   test: if vividness is wanted at all, this one should be uncontroversial.
2. **`0e/…0e229142`** — orange-on-dark-green; the yellow is a strong mark (0.383)
   and the incumbent khaki is a washed version of the same hue. Tests whether "a
   more saturated version of the same hue" counts.
3. **`08/…087b1314`** — **the prototype, already reviewed**: caramel skin tone
   versus the red. Included so the series is anchored to a known verdict.
4. **`11/…113e357f`** — the **strongest mark in the series** (0.617): a red
   graphic at 0.45 % of frame against a pale-yellow field colour at 5.92 %. The
   most extreme size trade in the set (13×).
5. **`0f/…0f723f36`** — purple gradient; both accents are the same hue, the vivid
   one simply more saturated. Nearly a pure "intensity" question.
6. **`0a/…0a8aa1da`** — dark/orange artwork with a bright yellow mark (0.526).
   The incumbent brown is a shadow of the orange foreground; tests whether the
   accent should differ from the field family at all.
7. **`0b/…0b87c434`** — cream-and-tan flat palette against a deep crimson. The
   largest incumbent in the set (7.64 %) and a hue jump, not an intensification.
8. **`0b/…0b096f0b`** — dark green field, sage versus vivid green. The vivid
   family is an obligation at **p1** — the only case where the challenger is
   already high-priority, so the margin is the most balanced (50/50).
9. **`0d/…0d457f4b`** — an all-warm coral palette; the vivid red is a deeper
   member of the same family. Tests the `skap` hue-diversity principle directly:
   does a second red add identity, or restate it?
10. **`02/…02dc280c`** — white field, navy versus hot pink. **Quality-dominated**
    (identity only 15 %), so if the answer is "yes to vividness" this is the case
    where it costs the most quality — the counterweight to case 1.

## 4. Fresh-rotation harvest (`0a`–`0f`, 252 images)

First run of these roots. **No crashes, no generated colours, no invalid
outputs.** 45 of 252 flagged:

| flag | count | reading |
| --- | --- | --- |
| `all-neutral` (every role chroma < 0.03) | **33 (13 %)** | worth a look — see below |
| `extreme-field` (both field colours above 0.95 or below 0.06 lightness) | 16 | mostly legitimate black/white artwork |
| `double-collapse` (surface *and* accent collapsed — a two-colour palette) | 5 | e.g. `0e/…0eae9e88` → `#000000 #000000 #fbfbfb #fbfbfb` |

**The 13 % all-neutral rate is the one thing I would look at.** Examples:
`0b/…0bcdc722` → `#d1d1d1 #666666 #2e2e2e #6e6e6e`, `0c/…0c18fc28` →
`#373830 #242621 #bbbea9 #828479`. Many album covers genuinely are monochrome, so
this may be correct; but one in eight is high enough that a handful should be
eyeballed against their artwork before it is assumed correct. I did not
investigate — it is a different class from this arm's question and I am reporting
it rather than diagnosing it.

Full records in `data/anomalies*.jsonl`.

## 5. What the series can settle

The manifest carries, per case, both accents' chroma, family population, mark
evidence, obligation priority, and the decomposition of the losing margin into
quality and identity. So the verdicts can answer more than yes/no:

- **Cases 1 and 10 bracket the price.** Case 1 costs no quality at all; case 10
  costs the most. If both come back preferred-vivid, the preference is strong and
  general. If only case 1 does, the answer is "yes, but not at a quality cost",
  which points at obligation priority rather than the quality objective.
- **Cases 5 and 9 isolate hue.** Both are same-hue intensifications. If those are
  rejected while 3, 4 and 7 (hue jumps) are preferred, the wanted property is a
  *new direction*, not saturation — the `skap` principle, and a very different
  mechanism.
- **Cases 2, 4 and 6 carry real mark evidence** (0.383–0.617). If those are
  preferred and the low-mark cases (5, 7, 9, 10) are not, the discriminator is
  *deliberate graphic* rather than *vivid*, and Track E's `markSupport` is already
  the right measure — it would just need to reach obligation priority, which is
  the entitlement question Track E's revision 2 settled once.

## Honest notes

- The 1.25 % base rate is measured on 1,767 of 7,550 images (23 %). It is a
  sample, not a census; the extrapolation to ~95 artworks carries the usual
  sampling error and the draw was deliberately biased toward `0a`–`0f`.
- The wanted-colour side is always *the strongest accent-only rival by my
  scoring heuristic* (chroma lead over relation deficit). On artworks with
  several vivid alternatives a different one might read better; the manifest
  records which family was chosen so a reviewer can ask for another.
- The detector requires the vivid alternative to be an **accent-only** variant of
  the winner. That keeps every comparison clean but it will miss cases where the
  vivid accent is only reachable alongside a different field — those exist and are
  not in this series.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-n/detect-vivid-contest.ts <out.jsonl> --list <paths>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-n/harvest-anomalies.ts <out.jsonl> --list <paths>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-n/build-review-series.ts data/all-hits.jsonl selection.txt
```

`data/sample.txt` and `data/sample2.txt` are the two draws (deterministic stride,
reproducible), `data/all-hits.jsonl` the 22 contests, `selection.txt` the 10
chosen, `data/anomalies*.jsonl` the harvest.

---

# Track N, part 2 — accent vividness with an evidence-quality floor

Base: trunk `c2366d2` (+ the Track P probes at `cadaec4`).

**Outcome: the floor is found and calibrated; the mechanism is built, correctly
shaped, and rejected. The runtime is byte-identical to trunk** (25 added lines,
all comments).

The brief was to implement the mechanism batch 18 made calibratable. I did. It
does exactly what it is specified to do on the axes it owns — and it still cannot
deliver a single anchor, for a reason that is now arithmetic rather than
speculation.

## 1. The floor, read off the verdicts

`calibration-set.ts` replays the **12 decisive verdicts** (batches 17–18; cases
where neither side was preferred constrain nothing and are excluded) and dumps
every evidence measure the runtime carries for the rival accent's family.

| want | case | pop % | chroma | mark | obs/tot | **markComps** | concentration | spread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FLIP | `08/…087b1314` | 0.572 | 0.216 | 0.103 | 24/50 | **8** | 0.221 | 0.364 |
| FLIP | `06/…06eb2197` | 1.148 | 0.165 | 0.092 | 24/110 | **15** | 0.181 | 0.499 |
| FLIP | `0e/…0e229142` | 0.686 | 0.178 | 0.383 | 24/44 | **24** | 0.055 | 0.641 |
| FLIP | `0a/…0a8aa1da` | 0.444 | 0.205 | 0.526 | 16/16 | **11** | 0.105 | 0.220 |
| FLIP | `0b/…0b87c434` | 0.464 | 0.173 | 0.027 | 24/93 | **8** | 0.089 | 0.485 |
| FLIP | `0d/…0d457f4b` | 1.400 | 0.220 | 0.010 | 24/388 | **16** | 0.122 | 0.762 |
| FLIP | `02/…02dc280c` | 0.854 | 0.191 | 0.020 | 24/653 | **24** | 0.151 | 0.616 |
| HOLD | `05/…05318308` badge | 0.462 | 0.245 | 0.004 | 24/67 | **6** | **0.647** | 0.688 |
| HOLD | `0a/…0a392cb5` | 0.125 | 0.291 | 0.000 | 24/43 | **2** | **0.673** | **0.053** |
| HOLD | `08/…08601958` fragment | 0.149 | 0.207 | 0.000 | **2/2** | **0** | **0.998** | **0.040** |
| HOLD | `05/…05a54a9e` same-hue | 0.261 | 0.188 | 0.001 | 24/155 | **3** | 0.051 | 0.530 |
| HOLD | `01/…014fb430` | 0.818 | 0.224 | 0.195 | 24/111 | 23 | 0.116 | 0.219 |

**`markComponentCount` separates 11 of 12.** Every vivid-preferred rival carries
≥ 8 qualifying mark components (8, 8, 11, 15, 16, 24, 24); four of the five
incumbent-preferred carry 0, 2, 3, 6. Neither `markSupport` nor population does
this — `markSupport` is 0.010 and 0.020 on two FLIP cases and 0.195 on a HOLD
one; populations overlap (FLIP 0.444 %, HOLD 0.462 %).

The bar sits above `mark.minimumComponentCount` (3) on purpose: three strokes
make a family a mark *candidate*, eight make it substantial enough to outrank a
larger family. That is the reviewer's own distinction — "substantial element"
against "fragment" — in a measure the system already computes.

**The one exception is instructive rather than damaging.** `01/…014fb430` has 23
mark components and was still incumbent-preferred — but the note reads *"there is
a big gold text, half the image is red, so really these proposed palettes don't
really fit the vibe"* and the correction accent is `#fd332f`, **a red**. The
reviewer rejected the *particular* vivid family I offered (a green), not
vividness. A wrong-candidate case, not a counterexample.

### Provenance is flag-able, as asked

The badge case has `familyConcentration = 0.647`; the two fragments have
`spatialSpread = 0.053` and `0.040`, against a FLIP-set minimum spread of 0.220
and maximum concentration of 0.221. **A compact, highly concentrated cluster is
exactly the badge/fragment signature.** I did not build on it: the separation is
thin at one end (HOLD `014fb430` spreads 0.219 against FLIP `0a8aa1da` at 0.220 —
a 0.001 margin, the fragile kind Track H taught me to refuse).
`markComponentCount` does the same work with a real gap.

## 2. The mechanism, and a shape bug worth recording

Gated bonus at the accent-quality sites; candidacy untouched:

```
accentVividness(family) = 0                                            if markComponentCount < 8
                        = strength · clamp((chroma − 0.06) / (0.18 − 0.06))   otherwise
accentRoleScore         = base + accentVividness · (1 − base)
```

**The first implementation multiplied and clamped, and that is wrong.** A
multiplicative bonus saturates: measured, strengths 1.0 and 4.0 produced
*identical* winners everywhere, because rival and incumbent were both driven past
1 and clamped to the same value — the mechanism erased the ordering it existed to
create. Interpolating each score a share of its own remaining headroom is
monotone, cannot exceed 1, and keeps a more vivid accent strictly ahead at every
strength. Recorded because the failure is silent: the sweep looks stable and
means nothing.

## 3. Which axis carries it — verified, per Track M's lesson

`signatureAccentRoleScore` feeds exactly three axes: `accentFidelity` (0.07),
`economy` (0.09, half of which is `accentEconomy`) and `artworkIdentity` (0.12,
of which the accent is 0.27 — an effective 0.032).

On the prototype `08/…087b1314`, accent-only rival on the winner's own field:

| | trunk | strength 1.0 |
| --- | --- | --- |
| incumbent `#e7a680` | rel 0.9291, qual 0.8598 | rel 0.9340, qual 0.8647 |
| rival `#f94a2f` | rel 0.8820, qual 0.8513 | rel 0.9045, qual **0.8738** |
| **quality margin** | **+0.0086** | **−0.0091** |
| relation margin | 0.0472 | **0.0295** |

**The quality margin flips sign.** The mechanism does precisely what it was
specified to do, on precisely the axes it owns, and the weighted decomposition
confirms it. The incumbent also passes the floor and gains (+0.0049), which is
correct — the rule is vividness *given substance*, not a penalty on the
incumbent.

**And the winner does not change**, because winners are decided on
`relationUtility = qualityUtility + identityGain`, and **0.0386 of the 0.0472 gap
(82 %) is identity gain** — obligation priority, the rival at `p3` (weight 0.25)
against the incumbent at `p1` (0.5). Track L proved that unreachable: the
incumbent leads on both ordering keys, and re-ordering breaks eight reviewed
outcomes.

The bonus **maxes out at strength 1.0** (the qualifying score reaches 1.0; higher
strengths are inert) having closed **0.0177 of 0.0472 — 37 %**.

## 4. The sweep, at the mechanism's ceiling

Sweep set 108: the 34 fixtures + scrambled decoys + the canonical off-panel
manifest. At strength 1.0:

**17 of 108 change. 10 reviewed-and-applied palettes destroyed, 2 gained, and
ZERO of the seven anchors flipped.**

Casualties include `doja` (three separate strong verdicts), `horsley`, `vvbrown`,
`07/…07cc8b` (batch-15 strong), `11/…2b222b02` (twice), `04/…04ccf0`,
`00/…009f60`. Neither gain is an anchor.

So every strength is inert or harmful: below 1.0 nothing useful moves, at 1.0 it
is net −8 reviewed palettes for no anchor. **Rejected.**

Determinism verified, typecheck clean, architecture test 2/2, runtime
byte-identical to trunk.

## 5. Honest assessment

**Achieved**

- **The floor, calibrated on the verdict set and expressed in a measure the
  system already computes**: `markComponentCount ≥ 8`, separating 11 of 12
  decisive cases with a real gap (6 against 8), where `markSupport` and
  population both fail. This is the arm's durable output; any future mechanism
  can use it.
- Provenance shown to be weakly measurable, with an honest reason for not
  building on it yet.
- A silent shape bug found and recorded: multiplicative bonuses on clamped scores
  saturate and erase the ordering they exist to create.
- Track M's discipline satisfied: the axis is named and the weighted
  decomposition verified to move — the quality margin flips sign.

**Not achieved**

- No anchor flips. This is the correct *half* of a two-part fix; the other half is
  obligation priority, closed by Track L and out of bounds by this brief.
- I did not sweep an identity-authority variant separately. Arithmetic: the
  rival's `authorizedCoverage` is 0.143 and `authorizedIdentityGain` is 0.08, so
  its authority term cannot exceed 0.0114 against a current 0.0057 — a further
  0.0057, 12 % of the gap. It cannot close 0.0295 either. That is a judgement
  call and leaves the variant formally unmeasured on winners.

**Uncertainty**

- The floor is fitted to 12 cases. The 6-versus-8 gap is real but the sample is
  small; a thirteenth verdict at 7 mark components would be worth more than
  another at 24.
- `0.18` for the vividness saturation chroma came from the preferred rivals' range
  (0.165–0.220) and was never exercised, since nothing ships.
- The two policy constants were removed rather than left dead in `policy.ts`;
  their calibrated values are recorded here and in the source comment.

## 6. Proposed review items

**None from this arm** — the runtime is byte-identical to trunk.

1. **The class needs a decision, not another mechanism.** Support (E), accent
   quality (J, M, N), ordering (L) and credit (L) are all measured and closed.
   Every remaining path runs through **obligation priority**, where the vivid
   rival sits at `p3` against the incumbent's `p1`. With 21 verdicts behind it the
   question is no longer "does the reviewer want this" but "is the project willing
   to change what identity priority means, knowing Track L measured that as eight
   reviewed outcomes at risk on the current key".
2. **If that is taken up, the floor is ready.** `markComponentCount ≥ 8` is
   calibrated, is not fitted to one artwork, and would gate a priority change the
   same way it gates this one — which is what keeps the fragments and the badge
   from riding along.
3. **`01/…014fb430` deserves a re-ask** with the red the reviewer named
   (`#fd332f`) rather than the green I offered. If the red is preferred, the
   calibration becomes 12 of 12 on the floor.

## Reproducing part 2

The mechanism is not in the runtime; restore it from `vividness-gated.patch`.

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-n/calibration-set.ts
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-n/ceiling.ts <image> <accentHex> [strength]
sh research/v2-3-experiments/track-n/calibrate.sh 0 0.5 1.0
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-n/diff.ts trunk-c2366d2 n1-vividness-gated
```

`data/trunk-c2366d2.json` is the baseline, `data/n1-vividness-gated.json` the
strength-1.0 sweep, `data/calibration.txt` and `data/calibration2.txt` the
multiplicative and interpolating calibration logs.

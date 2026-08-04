# k = 5 vs k = 3 — the edge-rank decision

**Question.** `EDGE_RANK` (k, the rank taken within the 8-neighbourhood when the edge field is
built) is `[UNCALIBRATED]` at 3. A larger k is a more aggressive rank filter and should, on the
paradigm's own reasoning, be *less* sensitive to single-pixel noise. Does k = 5 buy stability?

**Answer up front: no. Keep k = 3.** k = 5 moves overall agreement by 0.7 points in the wrong
direction (18.7 % → 18.0 %), leaves the all-four-role flip count at exactly 19, and *replaces* the
population of flipping trials rather than shrinking it — only 4 of the 19 all-four flips are the
same trials. See [Recommendation](#recommendation).

## What produced these numbers

| | |
|---|---|
| k = 3 baseline | `../robustness-p3-fields-0.2.0-smoke150.json`, written 2026-08-04T18:08:06Z |
| k = 5 arm | `robustness-p3-fields-0.2.0-smoke150-k5.json`, written 2026-08-04T18:27:50Z |
| identical between the two | candidate `p3-fields-0.2.0`; `compare.barMode: regional`; `sets.perturbationSet` sha256 `31c58f03…`; `sets.warehouse` sha256 `dbe648cc…`; `reviewedness` live-warehouse, 0 relabelled since the draw; **150 trials, 0 errored** in both |
| the k override | `P3_EDGE_RANK`, dev-only, `src/constants.ts` — parsed at module load, integer 1..8, throws otherwise |
| demo-20 runs | `src/devloop/run.ts --set data/devloop/sets/demo-20.txt --no-cache`, 20/20 ok in every run below |

### Provenance caveat, and how it was closed

**The robustness report does not record environment variables.** Nothing inside
`robustness-p3-fields-0.2.0-smoke150-k5.json` says k = 5; its `candidate.version` string is
`p3-fields-0.2.0` in both files. The filename is a claim, not evidence. Closed by re-derivation:

- Five left-side images were taken from that report's own `disagreements[]` and re-run. **5 / 5
  reproduce the report's published hexes at `P3_EDGE_RANK=5` and 0 / 5 reproduce them at k = 3.**
- A demo-20 run under `P3_DIAG` with `P3_EDGE_RANK=5` writes `edges.k = 5` in all 20 chains
  (`k = 3` in all 20 without it), so the override reaches the field builder.
- That same k = 5 demo-20 run reproduces the earlier k = 5 run's 20 palettes exactly.

The k = 5 report is a statement about k = 5. **Recommendation for any future arm: the robustness
runner should record the candidate's environment overrides in the report header** — this check
should not have had to be done by re-running images.

## Overall and per-arm agreement, 150 trials each

Agreement = both sides of the pair publish the same four roles under the regional same-colour bar.
Intervals are the report's own.

| group | trials | k = 3 agreed | k = 3 rate | k = 5 agreed | k = 5 rate | Δ |
|---|---|---|---|---|---|---|
| **overall** | 150 | 28 | **18.7 %** [13.2–25.7] | 27 | **18.0 %** [12.7–24.9] | **−0.7 pt** |
| jpeg-q92 | 38 | 9 | 23.7 % [13.0–39.2] | 10 | 26.3 % [15.0–42.0] | +2.6 pt |
| jpeg-q85 | 38 | 3 | 7.9 % [2.7–20.8] | 4 | 10.5 % [4.2–24.1] | +2.6 pt |
| jpeg-q75 | 37 | 6 | 16.2 % [7.7–31.1] | 5 | 13.5 % [5.9–28.0] | −2.7 pt |
| dither-lsb1 | 37 | 10 | 27.0 % [15.4–43.0] | 8 | 21.6 % [11.4–37.2] | −5.4 pt |
| rendition-pair | 0 | — | — | — | — | not sampled in this smoke |

Every interval overlaps every other. **No arm separates the two settings.** The two directions
cancel: k = 5 gains one trial on each JPEG-q92/q85 and loses one on q75 and two on dither-lsb1.

## Trial-level churn — the number the aggregates hide

The two reports run the *same 150 trials*, so the sets of disagreeing trial ids can be intersected:

| | count |
|---|---|
| disagreeing under k = 3 | 122 |
| disagreeing under k = 5 | 123 |
| disagreeing under **both** | 108 |
| **fixed by k = 5** (disagreed at k = 3, agreed at k = 5) | **14** — jpeg-q92 5, dither-lsb1 4, jpeg-q85 3, jpeg-q75 2 |
| **broken by k = 5** (agreed at k = 3, disagreed at k = 5) | **15** — dither-lsb1 6, jpeg-q92 4, jpeg-q75 3, jpeg-q85 2 |

k = 5 does not stabilise 14 trials and leave the rest alone; it trades 14 for 15. **The instability
is not a function of k — it is relocated by k.** That is the same shape as the 0.2.0 tie-band
result (three cliff sites patched, flip count unmoved) and it points the same way: the break is
upstream of anything k reaches.

## All-four-role flips

| | k = 3 | k = 5 |
|---|---|---|
| trials where all four roles moved | **19** | **19** |
| of which are the *same trials* | **4** | |
| mean roles moved per disagreeing trial | 2.29 | 2.33 |
| worst-role move, median / p90 / max (OKLab) | 0.150 / 0.649 / **1.000** | 0.121 / 0.630 / **0.913** |

Identical count, 79 % different membership. The one thing k = 5 measurably improves is the *tail*:
the maximum worst-role move drops from 1.000 (a full black↔white swap) to 0.913, and the median
disagreement is slightly smaller. That is a real but small effect and it comes attached to a worse
overall agreement rate.

## Per-role instability (share of the 150 comparisons where the role moved)

| role | k = 3 | k = 5 | Δ |
|---|---|---|---|
| background | 28.0 % (42/150) | **24.0 %** (36/150) | **−4.0 pt** |
| surface | 51.3 % (77/150) | 54.0 % (81/150) | +2.7 pt |
| foreground | 51.3 % (77/150) | 51.3 % (77/150) | 0.0 pt |
| accent | 55.3 % (83/150) | **61.3 %** (92/150) | **+6.0 pt** |

The only role k = 5 helps is background (−4 pt); it costs 6 points on accent, which is already the
worst role in both settings. Foreground is untouched to the trial.

## demo-20 spot check

`P3_EDGE_RANK=5` on the 20-cover dev-loop set, against the k = 3 run of the same code, both
`--no-cache`:

| | k = 3 | k = 5 |
|---|---|---|
| ran | **20 / 20 ok**, 0 failed | **20 / 20 ok**, 0 failed |
| contract-valid (`scorePalette`) | **19 / 20** | **20 / 20** |
| violations | `ab67616d00001e02000000d8bc25fbca2eff2a4a` — I3 `pair-not-distinct` (bg+fg, surface+fg), I4 `below-contrast-floor` (fg+bg, fg+surface) | none |
| gradients published | 8 / 20 | 9 / 20 (1 flip) |
| palettes with any role hex changed vs k = 3 | — | **20 / 20** |
| per-role hex changes vs k = 3 | — | background 8, surface 13, **foreground 20**, accent 16 |

Two readings, and they pull against each other:

- **For k = 5:** it clears the one contract failure in demo-20 and publishes a valid palette for
  every cover.
- **Against k = 5:** changing k changes *every single palette in the set* — foreground in 20 of 20.
  k is not a tuning knob with a local effect; it re-derives the whole edge field and therefore the
  depth field, the field set, and every rank taken in them. One recovered contract failure out of
  20 is a sample of size one, and the 150-trial robustness numbers say the aggregate effect is
  neutral-to-negative.

## Recommendation

> **Keep k = 3. The k = 5 arm is not adopted.**

Judged on the two criteria that were named in advance:

| criterion | result |
|---|---|
| **all-four-role flip count** | **19 → 19.** No movement. Membership churns (only 4 of 19 shared), which is evidence that k relocates instability rather than removing it. |
| **agreement** | **18.7 % → 18.0 %**, intervals fully overlapping; per-arm changes ±2.6 pt with two signs; 14 trials fixed against 15 broken. |

Neither criterion is met, so the burden of proof for changing an `[UNCALIBRATED]` constant is not
discharged. The honest summary is **inconclusive at the aggregate level and negative on the
tie-breaker**: the trial-level churn (14 fixed / 15 broken) is the finding, and it is a stronger
statement than the flat rates, because it shows the two settings are not ordered by stability at
all — they are two draws from the same unstable process.

**What this does not say.** k = 5 is not *worse* in any way that survives an interval; the tail
improvement (max worst-role move 1.000 → 0.913) and the background improvement (−4 pt) are real and
point the same direction as the paradigm's reasoning about rank filters. If the ends are ever
stabilised — which is where `ATTRIBUTION.md` says 71.3 % of the disagreements are actually born —
this sweep should be re-run, because on a stable anchor a larger k may separate from k = 3 where it
currently cannot. **k is not the next thing to tune; the field ends are.**

## Line tensions, reported not smoothed

1. **The k = 5 report carries no record of the override that produced it.** Closed by
   re-derivation on 5 sampled images (above), not by anything in the file. Until the runner records
   the environment, any `*-k5.json` in this tree is a filename claim.
2. **One smoke sample, 150 trials, no rendition pairs.** `byPairType.rendition-pair` is `compared: 0`
   in both reports, so this decision is made entirely on synthetic perturbations. The 0.1.0 sweep
   had 200 rendition pairs and a *lower* disagreement rate on them (14.5 %) than on q92 (28.0 %) —
   the arm most likely to distinguish two k values is the one this sample does not contain.
3. **demo-20 and the robustness set disagree in sign.** demo-20 favours k = 5 (19/20 → 20/20
   contract-valid); the robustness set does not. demo-20 is 20 covers with no perturbation axis and
   the contract-validity count is not a stability measurement; it is reported because it was asked
   for, and it is not weighted against 150 paired trials.
4. **`EDGE_RANK` remains `[UNCALIBRATED]`.** This document rejects one alternative; it does not
   anchor 3. The anchoring plan (arm-d §4: k measured against the robustness harness) is now
   *partly* executed — one competitor tested, no evidence found to move — and that is all it is.

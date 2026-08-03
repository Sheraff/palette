# Bracketing round 3 — the straddle rule, pre-registered

**Batch id:** `bracketing-round-3`
**Written:** 2026-08-03, **before** the fixture generator was written and before any answer existed.
**Fixture:** `research/v3/data/calibration/bracketing-round-3.json`
**Generator:** `research/v3/src/review-server/bracketing.ts --round 3 --write`

---

## 1. The question

`sameColorBar()` (`src/contract/color.ts:249`) decides which same-colour bar applies when a pair's two
colours fall in **different** `COLOR_REGIONS`. It uses `Math.max` of the two regional bars. The
alternative on the table is their **average**.

The reviewer's ruling is that this be **tested, not chosen by argument**. It has never been measured:
`reviews/phase-0-adversarial/contract.md` finding 1 established that the "measurably most stable"
tie-break cited in the docstring is unreproducible (no script, no seed, no output anywhere in the
repository) and that an independent replication **reverses** it — the midpoint rule was the most
stable in the modal outcome, reproducing the recorded ordering in 1 of 16 configurations for bar
changes and 0 of 16 for verdict flips. The safety argument (ground 1) survives; the measurement
(ground 2) has been withdrawn. And **0 of the 140 calibration pairs in rounds 1–2 straddle a region
boundary**, so nothing in the existing data speaks to it.

## 2. What discriminates, and what does not

For a straddling pair with regional bars `barA`, `barB` (`barA ≠ barB`), write
`avg = (barA + barB) / 2` and `max = Math.max(barA, barB)`. Since `avg < max` always, a pair's OKLab
distance `d` falls in one of three zones:

| zone | `max` rule says | `avg` rule says | discriminating? |
|---|---|---|---|
| `d ≤ avg` | same | same | no |
| `avg < d < max` | **same** | **distinct** | **yes** |
| `d ≥ max` | distinct | distinct | no |

**Only the middle zone tests anything.** Every discriminating item is placed strictly inside it, and
exactly one of the two rules is right on each such item. This makes the two rules' accuracies
complementary — `accuracy(max) = k/n` and `accuracy(avg) = 1 − k/n`, where `k` is the number of
in-band items answered "same colour". The whole test therefore reduces to whether `k/n` is above or
below one half, which is what §6 scores.

### The four frozen bars and the six bands

`SAME_COLOR_BAR_BY_REGION` (`src/contract/constants.ts`), `[REVIEWED]`, rounds 1+2 pooled:

| region | bar |
|---|---|
| dark-neutral | 0.00932 |
| dark-saturated | 0.01502 |
| light-neutral | 0.01627 |
| light-saturated | 0.02293 |

| region pair | avg (band low) | max (band high) | band width |
|---|---|---|---|
| dark-neutral × dark-saturated | 0.012170 | 0.015020 | 0.002850 |
| dark-neutral × light-neutral | 0.012795 | 0.016270 | 0.003475 |
| dark-neutral × light-saturated | 0.016125 | 0.022930 | 0.006805 |
| dark-saturated × light-neutral | 0.015645 | 0.016270 | **0.000625** |
| dark-saturated × light-saturated | 0.018975 | 0.022930 | 0.003955 |
| light-neutral × light-saturated | 0.019600 | 0.022930 | 0.003330 |

`dark-saturated × light-neutral` is a special case and is declared one **now**, not after the fact:
its band is 0.000625 wide, narrower than the 8-bit expressibility floor in some regions and far
narrower than any reviewer's resolution. Its six items are therefore **six near-replicates at
≈0.0160**, not a gradient. They still discriminate (`max` says same, `avg` says distinct), so they
are kept and scored; but no within-band trend will be read from them, and the two bars that define
that band are known to be statistically indistinguishable from each other (their 95% intervals,
0.01137–0.01986 and 0.01308–0.02023, overlap across almost their whole length).

## 3. Which cross-region pairs actually occur — measured, not assumed

Measured over the distilled v2-3 corpus (`data/legacy/endorsements.json` 351 entries,
`acceptable.json` 166, `known-bad.json` 37 = **554 real palettes**, all six role pairs each,
3,309 role pairs total; regions assigned with the contract's own `colorRegion()`):

- **2,582 of 3,309 role pairs (78.0%) are cross-region.** Straddling is the normal case for role
  pairs, not an exotic one — the four roles are deliberately spread apart.
- All six combinations occur with meaningful frequency, and none dominates:

  | region pair | count | share of cross-region pairs |
  |---|---|---|
  | dark-neutral × light-neutral | 567 | 22.0% |
  | dark-neutral × light-saturated | 501 | 19.4% |
  | light-neutral × light-saturated | 487 | 18.9% |
  | dark-saturated × light-saturated | 413 | 16.0% |
  | dark-saturated × light-neutral | 344 | 13.3% |
  | dark-neutral × dark-saturated | 270 | 10.5% |

- **Zero of those 2,582 cross-region pairs land in any disagreement band.** The closest cross-region
  role pair in the whole corpus is at OKLab distance **0.04664** — about twice the largest bar.
  Gradient stops could in principle sit closer, but the distilled legacy files carry no stops
  (`gradientAdvisory`: v2-3 gradients reuse the roles), so they cannot be measured here.

**What this licenses, and what it does not.** It licenses near-balanced coverage of all six
combinations, lightly weighted toward the three most frequent (§4). It does **not** let anyone claim
this round changes a verdict on today's corpus: on this evidence the straddle rule is **dormant** for
role-pair distinctness, exactly as `color.ts` already says ("Nothing downstream depends on the choice
today"). Two caveats keep it worth measuring anyway. The corpus is v2-3 output that was reviewed and
largely endorsed, so it is selected *against* the degenerate near-collisions the invariant exists to
catch; and the invariant is a guard on futures, not a description of the present. This round settles
a **rule**, not a current corpus behaviour, and the write-up must say so.

## 4. Composition — 58 items

Round size follows the reviewer's previous bracketing rounds (60 and 80 items).

| kind | `role` | `straddle.zone` | n |
|---|---|---|---|
| **in-band, discriminating** | `ladder` | `in-band` | **42** |
| below-band control | `ladder` | `below-avg` | 2 |
| above-band control | `ladder` | `above-max` | 2 |
| identical-pair attention check | `control-identical` | — | 3 |
| clearly-distinct attention check | `control-obvious` | `above-max` | 3 |
| silent repeat of an in-band item | `repeat` | `in-band` | 6 |
| | | **total** | **58** |

### The 42 in-band items

Stratified on three axes simultaneously:

- **Region pair (6).** The three most frequent pairs of §3 get 8 items each; the three least frequent
  get 6 each. `8·3 + 6·3 = 42`.
- **Band position (4 or 3).** Band fractions `(d − avg) / (max − avg)` of `0.2, 0.4, 0.6, 0.8` for the
  8-item pairs and `0.2, 0.5, 0.8` for the 6-item pairs. Every achieved distance is verified strictly
  inside `(avg, max)`.
- **Direction (2).** Each (region pair, band position) cell appears twice: once **lightness-dominant**
  and once **chroma-dominant**, where "dominant" means that component holds ≥ 0.70 of the achieved
  squared difference. This is deliberate and is the round's main confound control — see §7.

Items whose pair involves `light-saturated` are additionally balanced across the **three hue thirds**
(0–120°, 120–240°, 240–360°), because the light-saturated bar is known not to be one population
(0.01516 / 0.02074 / 0.03805 across those thirds — a 2.5× spread that `constants.ts` records as a
deliberate placeholder). `hueThird` is recorded on every item that has a saturated member.

### Controls and anchors

- **3 identical-pair checks** (byte-identical colours, one per region except light-saturated which is
  covered by the obvious checks) — must be answered "same". Precedent: 8 such controls across rounds
  1–2, all passed.
- **3 clearly-distinct checks** at ≈4× the pair's `max` bar, in the distance range where real
  cross-region role pairs actually live (§3's 0.04664 floor) — must be answered "distinct".
- **2 below-band** items at band fraction −0.6 (i.e. `d < avg`) and **2 above-band** items at band
  fraction +1.6 (`d > max`). Both rules agree on these, so they score nothing; they exist to check
  that the *bands themselves* sit where rounds 1–2 put them.
- **6 repeats** carrying byte-identical colours to an in-band item, served far from their original.

## 5. Presentation

Unchanged from rounds 1 and 2 — the existing bracketing UI (`review-ui/bracketing.js`,
`/bracketing`), reused, not rebuilt. Two flat fields with a thin divider, one question at a time,
keyboard only (`y` same / `n` different / `u` undo / `r` release), auto-advance, resumable.

**The batch id is deliberately neutral** — `bracketing-round-3`, not `bracketing-round-3-straddle`.
The batch id is one of the few fixture fields that *is* served to the page and appears in the URL,
and naming the hypothesis there would prime a reviewer who has read the contract. Round 3's identity
lives in this document and in the fixture's unserved `straddleDesign` block. (Caught by the payload
hygiene test, not by foresight: the first fixture carried the descriptive id.)

**The criterion is byte-identical to rounds 1 and 2**, which is a hard requirement rather than a
preference: pooling and, more importantly, the *meaning* of the bands are gated on it. The bands in
§2 are built from bars measured under this criterion; asking a different question would make the
band arithmetic meaningless.

> `register-as-same, clarified 2026-08-02 after a false start under a detection criterion`

with the reviewer-facing wording, also verbatim from `PART_PROMPTS`:

> **Same color?** — Answer whether they register as the same color — not whether you can detect any
> difference at the seam. If you have to hunt along the boundary to find it, they're the same color.
> If they'd read as two different colors in a UI, they're different.

**Recorded discrepancy in the commissioning brief.** The brief for this round asked for the criterion
"can I see the difference", *not* "can I easily register them as different colors" — the reverse of
the above. That instruction was **not** followed, deliberately. `bracketing.ts:84-95` records that a
*detection* criterion ("can I see any difference at the seam") was the **abandoned false start** of
2026-08-02, that the intended criterion is the identity one, and that "those are different
thresholds — detection is far more sensitive — so the two passes must never be pooled". 72 answers
were discarded over exactly this. Running round 3 under detection would have repeated that mistake,
severed comparability with the frozen bars, and made the disagreement bands uninterpretable. Flagged
here rather than silently resolved; if the reviewer does want a detection round, it is a different
round with different bands and this one should be discarded rather than reinterpreted.

## 6. Scoring — pre-registered, verbatim

The following is fixed before any answer is seen. It is not to be renegotiated once results are in.

> **Population.** The primary analysis uses exactly the **42 items with `role: "ladder"` and
> `straddle.zone: "in-band"`**, each counted **once**, at its **first** showing. Repeats are *not*
> counted as independent trials — this deliberately departs from rounds 1–2, whose fits counted 24
> duplicate stimuli as 24 independent points (`reviews/phase-0-adversarial/contract.md` finding 8).
> Controls and attention checks are never scored. Let `n` be the number of these 42 that were
> answered and `k` the number answered **"same colour"** (`y`).
>
> **Prediction.** On every in-band item the two rules disagree by construction: `Math.max` predicts
> "same colour", the average predicts "distinct". Therefore `accuracy(max) = k/n` and
> `accuracy(avg) = 1 − k/n` exactly, and the winner is whichever exceeds one half.
>
> **Decision.** The result is **decisive** if and only if the **two-sided exact binomial test of `k`
> against `p = 0.5` yields `p < 0.05`**. At the designed `n = 42` this means **`k ≥ 28` (66.7%)
> favours `Math.max`, or `k ≤ 14` (33.3%) favours the average**. The 95% Wilson interval agrees at
> that boundary (`k = 28` → 0.516–0.790, excluding 0.5; `k = 27` → 0.492–0.770, not excluding it), so
> both criteria must be satisfied and at the design `n` they coincide. If `n < 42` because items went
> unanswered, the threshold is recomputed at the realized `n` by the same test and stated before the
> count is looked at.
>
> **Unresolved.** Any `15 ≤ k ≤ 27` is reported as **unresolved** — not as a tie, not as weak support
> for either rule, and not as a licence to keep `Math.max` on the strength of this round. On an
> unresolved result the rule stays `Math.max` purely because it is already there and ground 1 (the
> asymmetric-failure safety argument) still stands, and the loose end stays open.
>
> **Anisotropy veto.** `k` is also computed separately over the 21 lightness-dominant and the 21
> chroma-dominant in-band items. If those two subgroups' rates fall on **opposite sides of 0.5** and
> at least one subgroup is individually decisive at α = 0.05, the round reports
> **anisotropy-confounded**: no global winner is declared, and the finding becomes that the straddle
> bar depends on the *direction* of the difference, which neither candidate rule can express.
>
> **Validity gates, checked before any of the above is computed.** (i) All 3 identical-pair checks
> must be answered "same" and all 3 clearly-distinct checks "distinct"; any failure **voids** the
> round. (ii) The band controls are diagnostic rather than gating: if both below-band items come back
> "distinct", or both above-band items come back "same", the bands are not where rounds 1–2 put them
> and the straddle verdict is reported as **not interpretable**, because the bands are defined by
> those bars.
>
> **Reported regardless.** Repeat consistency over the 6 repeat pairs; per-region-pair and
> per-band-fraction breakdowns; per-hue-third breakdown for the light-saturated pairs; and a
> sensitivity re-run in which each repeated item's **later** answer is substituted for its first. If
> the verdict differs between the primary and the sensitivity run, the round is **unresolved**
> whatever the primary count said.
>
> **Exploratory only, never the headline.** A logistic fit of `P(same)` on `log d` over all 46
> `ladder` items (in-band plus the four band controls), using the repository's existing fitter. If
> its `p = 0.5` crossing lands strictly inside the pooled band with a 95% interval excluding both the
> pooled `avg` and the pooled `max`, that is reported as *"neither rule — the straddling bar is
> intermediate"*. With 46 points spread over six different bands this fit is badly under-powered and
> is labelled exploratory in any write-up.

### Honest statement of what `n = 42` buys

Power of the pre-registered test against a true "same" rate of:

| true rate | 0.60 | 0.65 | 0.70 | 0.75 | 0.80 |
|---|---|---|---|---|---|
| power | 24% | 48% | **74%** | 92% | 99% |

So the round reliably detects a **strong** preference and is **underpowered for a mild one**. Worse,
the reviewer's own measured repeat consistency across rounds 1–2 is **62.5%**, which caps how extreme
any observed rate can be: a threshold can never be sharper than the reviewer's repeatability, and the
decisive cut of 66.7% sits *above* that ceiling. **"Unresolved" is a genuinely likely outcome of this
round, and it is a real result** — it would mean the reviewer does not see these bands as one-sided,
which is itself evidence that `Math.max` and the average are not meaningfully different in practice.
That possibility is stated here, before the data, so that a null result cannot later be spun as
support for the incumbent.

## 7. Known confounds, declared in advance

1. **Straddling pairs always hug a boundary.** This is structural, not a sampling defect: if two
   colours are `d` apart and a region boundary separates them, both are within `d` of that boundary.
   Every cross-lightness item therefore has both colours within ~0.023 of L = 0.55, and every
   cross-chroma item both within ~0.023 of C = 0.05. The straddle rule *only ever fires* on
   boundary-hugging pairs, so this is the honest population — but it means the round says nothing
   about regions' interiors. Where an axis is *not* crossed the generator roams the full region
   window, so e.g. dark-neutral × dark-saturated items span L ≈ 0.24–0.51 rather than clustering
   at 0.55.
2. **Direction is partly forced by the region pair.** Crossing the lightness boundary requires
   `ΔL ≠ 0`; crossing the chroma boundary requires `ΔC ≠ 0`. Round 2's direction probe found OKLab
   distance to be anisotropic under this criterion — at a fixed 0.01500, lightness-only differences
   were called "same" 4/4, chroma-only 2/4, hue-only 1/4. If that holds, cross-lightness pairs will
   lean "same" (favouring `Math.max`) and cross-chroma pairs will lean "distinct" (favouring the
   average) **for reasons that have nothing to do with the straddle rule**. This is why every cell is
   built twice, once in each direction, and why §6 carries an anisotropy veto rather than letting a
   direction effect masquerade as a rule verdict.
3. **The light-saturated bar is a known placeholder.** It is too loose for warm hues and too tight for
   violets (§2). Three of the six region pairs involve it, so their bands are correspondingly
   uncertain. Mitigated by hue-third balancing and a pre-registered per-third breakdown; not
   eliminated.
4. **The bars carry about one significant figure.** Refitting rounds 1–2 on distinct stimuli only
   moves dark-neutral by +13.8% and light-neutral by −10.8%. Band edges inherit that. A band whose
   width is a few percent of its value — `dark-saturated × light-neutral` above all — is therefore
   inside the noise of its own definition, which is the second reason that pair is discounted.
5. **`n = 42` against a 62.5% consistency ceiling**, as spelled out in §6.

## 8. Proposed decision-record shape, for when the answers are in

Not written now — proposed, per the instruction that no shared-doc or decisions edit happens in this
change. When the round is released and analyzed, the record should be a new entry taking this shape:

- **Where.** A new `research/v3/data/calibration/bracketing-round-3-analysis.json` (machine,
  produced by the analyzer), plus one section appended to `PHASE_0_DECISIONS.md` §3 and the
  corresponding closure or restatement of `PHASE_0_LOOSE_ENDS.md` **B13** ("the straddle rule is a
  default with a reason, not a finding").
- **What it must state**, in this order: the pre-registered rule quoted from §6 above; the realized
  `n` and `k`; the exact binomial `p`; the validity-gate results; the anisotropy subgroup rates; the
  repeat-consistency figure; the sensitivity re-run; and only then the verdict as one of
  **`max` / `average` / unresolved / anisotropy-confounded / not interpretable / void**.
- **What changes in code, per outcome.** `max` → `sameColorBar()` is unchanged but its docstring's
  `[HELD]` becomes `[REVIEWED]` and the withdrawn ground 2 is replaced by this round.
  `average` → `sameColorBar()` changes to the mean, `CONTRACT_VERSION` bumps, and every affected
  palette is re-validated. Any other outcome → no code change, and B13 stays open with this round
  cited as the attempt.
- **What must not happen.** The verdict must not be softened into "leans toward" language, and an
  unresolved result must not be recorded as confirmation of the incumbent. That is the specific
  failure mode finding 1 documents.

---

## 9. Result — 2026-08-04

Round 3 was released 2026-08-03T22:30Z and answered in full: 58 of 58 items, no item unanswered, no
answer superseded or retracted. The scoring rule of §6 was applied exactly as written by
`research/v3/data/calibration/analyze-bracketing-round-3.ts`; the machine record is
`research/v3/data/calibration/bracketing-round-3-analysis.json`.

### The verdict: **anisotropy-confounded**

Not `max`, not `average`, and not "unresolved" in the plain sense — the pre-registered veto fired.

**Validity gates first, as required.** All 3 identical-pair checks came back "same" and all 3
clearly-distinct checks came back "distinct": **6/6, the round is not void**. The band controls did
not fire either failure mode, so the bands stand and the round is interpretable.

**The primary count.** `n = 42`, `k = 17` answered "same colour" — a rate of 0.405. Two-sided exact
binomial against `p = 0.5`: **`p = 0.280`**; 95% Wilson interval **0.270–0.555**, which contains 0.5.
The realized `n` is the design `n`, so the pre-registered cuts stand unchanged at `k ≥ 28` / `k ≤ 14`
(the analyzer recomputes them from scratch and lands on 28 and 14, reproducing §6). `k = 17` sits
inside the unresolved interval [15, 27]. On the global count alone this round is **unresolved**.

**Why the verdict is not simply "unresolved".** The two direction subgroups fall on opposite sides of
one half, and one of them is decisive:

| subgroup | k / n | "same" rate | exact binomial p | decisive at α = 0.05 |
|---|---|---|---|---|
| lightness-dominant | 15 / 21 | 0.714 | 0.078 | no |
| chroma-dominant | **2 / 21** | **0.095** | **0.00022** | **yes** |

That is the §6 anisotropy veto, exactly: opposite sides of 0.5, at least one subgroup individually
decisive. So **no global winner is declared**, and the finding is the one the veto was written to
catch — *the straddle bar depends on the direction of the difference, which neither candidate rule
can express.* The global 17/42 is not a mild lean toward the average; it is the average of two nearly
opposite populations, and reporting it as a rule preference would be exactly the error confound 2 was
declared in advance to prevent. Round 2's direction probe predicted this (lightness "same" 4/4,
chroma 2/4, hue 1/4 at a fixed 0.01500); round 3 confirms it at 21 items per direction.

The controls say the same thing without being scored: the one band control answered on the wrong side
was the chroma-dominant below-band item (purity 0.91) at 0.01660, called **distinct** even though it
sits *below* the smaller of the two regional bars. At the chroma end of this criterion, both
candidate rules are too loose — not just `Math.max`.

**Reported regardless.**

- **Attention checks:** 6/6 (3/3 identical answered "same", 3/3 obvious answered "distinct").
- **Silent-repeat consistency: 5/6 = 83.3%**, comfortably above the 62.5% measured across rounds 1–2.
  The one disagreement is `r3-ds-ls-f80-lightness` (distinct first, same on the repeat). The
  reviewer was more self-consistent here than the round's own power table assumed.
- **Sensitivity re-run** (each repeated item's later answer substituted for its first): `k = 18` of
  `n = 42`, still inside [15, 27], verdict unchanged. Primary and sensitivity **agree**.
- **Per region pair** (in-band only): dark-neutral × light-neutral 6/8 (0.75); dark-neutral ×
  dark-saturated 3/6 (0.50); dark-neutral × light-saturated 3/8 (0.375); dark-saturated ×
  light-saturated 2/6 (0.333); light-neutral × light-saturated 2/8 (0.25); dark-saturated ×
  light-neutral 1/6 (0.167). Per §2 no within-band trend is read from that last pair.
- **Per band position:** 0.2 → 5/12, 0.4 → 4/6, 0.5 → 3/6, 0.6 → 2/6, 0.8 → 3/12. The monotone fall
  is much cleaner once split by direction: lightness runs 4/6, 3/3, 3/3, 2/3, 3/6 (high throughout)
  while chroma runs 1/6, 1/3, 0/3, 0/3, 0/6 (floor almost everywhere).
- **Per hue third**, light-saturated pairs only: 0–120° 3/8, 120–240° 1/8, 240–360° 3/6. Consistent
  with the known placeholder bar, too thin to conclude anything.
- **Exploratory only, not the headline.** The logistic fit over all 46 ladder items converged, with a
  50% crossing at **0.01534** (95% CI 0.01257–0.01873). That crossing sits *below* the pooled `avg`
  of 0.01593 and its interval contains it, so the pre-registered "neither rule — the straddling bar is
  intermediate" reading is **not** supported. With six different bands pooled into one curve this fit
  is under-powered by construction and is recorded only because §6 said it would be.

### What this means for the straddle rule in `src/contract/color.ts`

**Nothing changes in code, and that is not a win for the incumbent.** `sameColorBar()` keeps
`Math.max` for the reason it already had — it is what is there, and ground 1 (asymmetric failure: a
bar that is too tight wrongly rejects a fine palette, a bar that is too loose lets a real collision
through) still stands. Ground 2, the withdrawn "measurably most stable" claim, is **not** replaced by
this round. The docstring's `[HELD]` therefore stays `[HELD]`; it must **not** become `[REVIEWED]`,
and this round must not be cited as confirmation of `Math.max`. `PHASE_0_LOOSE_ENDS.md` **B13**
("the straddle rule is a default with a reason, not a finding") **stays open**, with round 3 recorded
as a completed, valid attempt that returned a real answer to a different question than the one asked.

What the round did settle is that the question was mis-posed. `Math.max` versus the average is a
choice between two numbers on an axis where the reviewer's actual bar is not one number: at the same
OKLab distance inside the same band, a lightness difference reads as the same colour about 71% of the
time and a chroma difference about 10% of the time. No scalar combination of two regional bars can
represent that, so no amount of further data on this design would resolve it.

**The dormancy finding is part of the verdict, not a footnote.** Measured over the 554-palette
distilled corpus, 2,582 of 3,309 role pairs are cross-region, and **zero of them land in any
disagreement band** — the closest cross-region role pair sits at OKLab 0.04664, roughly twice the
largest bar. So no current palette verdict changes either way, under either rule, and nothing in this
round licenses re-validating anything. The straddle rule is dormant for role-pair distinctness today;
this round settles a *rule*, and it settled it as "neither, on this axis".

### What happens next

1. **No contract edit from this workstream.** Any change to `sameColorBar()` is its own decision and
   belongs to the contract workstream; this round's output is evidence, not a patch.
2. **B13 stays open**, restated: the open question is no longer "max or average" but "is the
   same-colour bar direction-dependent, and if so does the contract want to express that?" — a
   strictly larger question than the one round 3 was built for.
3. **The natural round 4** is a direction-crossed bar measurement, not another straddle round:
   separate ladders for lightness-dominant, chroma-dominant and hue-dominant differences within a
   single region, sized against the 83.3% consistency measured here rather than the 62.5% assumed.
   That would establish whether a direction-aware bar is worth its complexity before anyone proposes
   one. It is a proposal, not a commitment.
4. **Because the rule is dormant**, none of this is urgent, and that should be said plainly rather
   than letting an open loose end imply a live risk.

### Method note

Answers were read from the warehouse through the repository's existing collector
(`analyze-bracketing.ts` `collectAnswers`), so retraction and supersession follow the same rule every
other round uses: per (batch, item, question) the latest non-retracted record is the reviewer's
position. 58 oracle labels, 58 distinct items, zero superseded, zero retracted; 228 same-schema labels
from rounds 1–2 were excluded on batch id, as rounds are never pooled. The exploratory curve reuses
the same `fitLogistic` the earlier rounds used. The primary count was independently recomputed from
the CLI's dense output and agrees (n = 42, k = 17; 15/21 and 2/21 by direction), and the analyzer's
binomial reproduces §6's stated `k ≥ 28` / `k ≤ 14` cuts from scratch.

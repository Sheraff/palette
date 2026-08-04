<!-- Phase 1 author packet — provenance
     source: research/v3/src/contract/PERCEPTION_VERDICT.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim copy of the source above, assembled for a Phase 1 author packet.
     
     Included because PHASE_1_AUTHOR_BRIEF.md §3.1 names this file as the "Canonical text" for
     open question 3, and §3.1 is normative for every arm.
-->

# What `perception-4` decided — and what it refused

> ## ✅ SIGNED OFF — 2026-08-04
>
> The reviewer signed off on the recommended package below, verbatim:
> **"yes i sign off on your decision about the color thing"**
>
> | what | disposition |
> |---|---|
> | the colour space | **keep OKLab.** The space change is refused; `colorDistance()`, `okLabFromColor()` and the region partition are untouched. |
> | the direction-aware identity bar | **adopted PROVISIONALLY** — `√(ΔL² + 8.29·ΔC² + 7.39·ΔH²) < 0.02063`, `dark-neutral`-derived. Provisional means **encoded and not enforced**: it landed as a *report-only challenger*, never as a verdict. |
> | the confirming round | **DEFERRED.** Not cancelled, not scheduled. The report-only challengers decide whether it ever runs. |
> | `ACCENT_FUNCTIONAL_DISTANCE` | **stays 0.14591**, audit status `[UNCALIBRATED]` unchanged. Second refusal stands. |
> | every refusal in the table below | **stands**, as written. |
>
> **What actually changed in the code**, and it is less than the diff sketch below proposes:
> `src/contract/challengers.ts` computes the direction-aware bar **and** ICtCp-global beside the
> frozen OKLab bars on every pair invariant 3 judges, counts how often they disagree, and surfaces
> the counter in the scorecard and in `data/contract/challenger-disagreements.json`. Three constants
> entered `constants.ts` (`SAME_COLOR_DIRECTION_WEIGHTS`, `SAME_COLOR_BAR_LIGHTNESS_AXIS`,
> `ICTCP_GLOBAL_SAME_COLOR_BAR`), each with an audit row. **No enforced bar moved, no verdict
> changed, and invariant 3 still consumes a scalar** — the §"Invariants affected" cost below has
> *not* been paid, because the shape was not adopted, only counted.
>
> ICtCp is carried as the **second** challenger despite losing: it is counted against, not adopted,
> which is the only status its own multiplicity correction leaves available to it.
>
> Records: `d-2026-08-04-perception-4-package-signed-off`, plus the three proposed records below,
> all appended unamended to `data/decisions/decisions.json`.
> Provenance tag on everything the sign-off added:
> `[PROVISIONAL — perception-4, reviewer-signed 2026-08-04, adoption gated on the disagreement counter]`

**Written for the reviewer, before any of it was applied.** The body below is preserved in its
pre-sign-off tense: at the time of writing no constant had moved, no decisions file had been edited
and no invariant had been touched. Read the diff sketch near the end as **the proposal that was
signed**, not as a description of the tree — the header above says what landed, and the difference
between the two is deliberate and is the whole meaning of "provisional".

- Round: `perception-4`, 148 items, one sitting, one reviewer, scored 2026-08-04
- Pre-registered at `4c7c891` — every threshold, critical value and refusal condition below was
  fixed **before** the round was shown to anyone
- Numbers: `data/calibration/perception-round-4-analysis.json`
- Full scoring narrative: `data/calibration/perception-round-4-preregistration.md` §9
- Proposals to accept, amend or refuse: `data/decisions/proposed-perception-4.json`

---

## The one-paragraph version

The round asked which of two *colour spaces* should carry the same-colour bar. **The answer that
came back is that the question was aimed one dimension away from the problem.** The space question
came out 28–12 in ICtCp's favour and then failed its own pre-registered multiplicity correction. The
*direction* question — asked in a corner of the round that was declared under-powered and barred from
funding any adoption — came back clean, at about **2.9×**, and was independently confirmed by the
re-run model comparison, which now puts a **direction-aware** rule on top in a space nobody
nominated. Meanwhile the accent-function threshold **refused adoption for the second time**, on fresh
covers, for the same reason as the first; and the lightness axis that was previously unmeasurable
produced its first reading, which is large. **Recommendation: do not change the ruler's space.
Change its shape — provisionally, behind one more round.**

---

## Was the round valid?

Yes, on every pre-registered gate, with no discretion exercised.

| gate | result |
|---|---|
| All 6 attention checks correct, or the round is void | **6/6** |
| Repeat consistency vs round 3's 83.3% | identity **4/4**, accent **1/2**, all six **5/6** |
| Escape share ≤ 25% per arm | **0.0% everywhere** — every arm is interpretable at full n |
| No degenerate ladder | **none** |
| Re-run with each repeat's later answer substituted | **no verdict changed** |

Two honest notes. **Four identity repeats is thin** — the prereg said so in advance, 4/4 cannot
confirm 83.3%, and nothing downstream re-derives the lapse rate from it. And **the reviewer used the
escape zero times in 148 items**, which is worth knowing on its own: the "I can't tell" option was
available on every item and was never the answer.

**One disclosure that is not a gate.** The prereg (§8) asked for the analyzer to be committed before
scoring and run as committed. **It was not** — the round was answered first and the analyzer written
afterwards. No claim of blindness is available for it. What stands in place: every rule it implements
is quoted from the frozen prereg, and the six places the prereg left something open are listed in the
analysis JSON under `ambiguityResolutions` instead of being settled quietly. Three of them mattered
and each is flagged where it bites.

---

## Quantity 1 — the identity quantity (the same-colour bar)

### What was asked

Which rule better predicts "do these read as the same colour?" — the contract's incumbent
`OKLab × four regional bars + Math.max`, or `ICtCp × one global constant`. Forty items on which the
two make *opposite* predictions, so exactly one is right about each and accuracy is complementary.

### What came back

**ICtCp-with-one-constant won the arm, 28 of 40 (70.0%).** Two-sided exact binomial p = 0.0166. The
pre-registered bar for "decisive" was k ≥ 27, so **the arm is decisive on its own rule**.

**And it fails the round's own multiplicity correction: Holm-adjusted p = 0.0995.**

Both of those sentences are pre-registered and neither has been softened. §5.1 fixed decisiveness at
the uncorrected binomial; §5.6 put that binomial in a 13-test family. They disagree. The round did
exactly what it was commissioned to do — the study's version of this finding was adjusted p = 1.000
against a family of 144, and cutting the family to 13 moved it to **0.0995** — and that is still not
below 0.05. **One arm of 40 items is not enough to move a colour space, and the round said in advance
that it would not be.**

The anisotropy veto did **not** fire: both subgroups sit on the same side of 0.5. But they are not
alike, and the difference is the finding:

| where the two rules disagreed | ICtCp right | rate | p |
|---|---|---|---|
| on a **lightness**-dominant difference | 16/20 | 0.800 | 0.0118 |
| on a **chroma**-dominant difference | 12/20 | 0.600 | 0.5034 |

**ICtCp's whole margin comes from lightness-dominant pairs.** Where the two rulers disagreed about a
chroma step, this reviewer sided with neither.

### The result the round did not expect

Arm B — three pure-direction ladders inside `dark-neutral`, declared under-powered and **barred from
funding any adoption** before it ran — produced the only Holm-clean identity numbers in the round.

| pure step, in `dark-neutral` | threshold | 95% CI |
|---|---|---|
| lightness | **0.02063** | [0.01606, 0.02666] |
| chroma | **0.00717** | [0.00530, 0.00970] |
| hue | **0.00759** | [0.00460, 0.01253] |

| ratio | estimate | 95% CI | Holm |
|---|---|---|---|
| lightness / chroma | **2.88** | [1.91, 4.39] | **survives** |
| lightness / hue | **2.72** | [1.65, 5.90] | **survives** |

Both intervals exclude 1. **A lightness difference has to be roughly three times larger than a chroma
or hue difference before this reviewer calls the two colours different.** `constants.ts` already
suspected this from a four-pair probe (lightness 4/4 "same", chroma 2/4, hue 1/4) and wrote it down
as something "no scalar bar can express". It is now measured on twelve-rung ladders and it survives
correction.

Put the contract's own number beside them: the `dark-neutral` bar is **0.00932**. That sits between
the measured chroma threshold (0.00717) and the measured lightness threshold (0.02063) — **too loose
for chroma and less than half of what lightness needs.** That is what a scalar does to a quantity
with a direction.

Two things must be said about arm B or the ratios will be over-read:

- **It cannot pin the ratio.** §3.4 priced this before the round: at 12 rungs a ladder confirms a ~4×
  ratio and cannot distinguish it from 2×. The intervals contain 2, 2.88 and the study's predicted
  4.2 alike. **Confirmed, not pinned.**
- **It is `dark-neutral` only.** Nothing here says the ratio is the same in the other three regions.

### The independent confirmation

Re-running the study's held-out (space × shape) comparison with round 4 folded in — identity grows
184 → 260 observations:

| identity cell (held-out log-loss, lower is better) | before | after |
|---|---|---|
| `ICtCp × global-constant` | 0.4913 | 0.4784 |
| `Jzazbz × linear-in-position` | 0.4505 | 0.4427 |
| `OKLab × per-region-constants` (the incumbent) | 0.5743 | 0.5829 |
| **leader** | Jzazbz × linear-in-position, 0.4505 | **ICtCp × direction-and-position, 0.4208** |

**Does the plateau break? Yes — and you must not spend it.** The leader is now separable from **33 of
47** rivals against **16 of 47** before. But **arm A is 40 of the 76 new identity items and it is a
sample selected on exactly the disagreement this comparison measures.** Drop arm A, keep only arm B's
36 unselected ladder items, and the leader is separable from **17 of 47** — one better than before.
`ICtCp × global-constant` likewise goes Holm-clean **only** with arm A in, and sits at adjusted
p = 1.000 without it.

**The identity of the leader survives dropping the enriched arm. The confidence does not.**

And the leader is not one of the three candidates the round was framed around. `ICtCp-global`,
`Jzazbz-linear` and `OKLab-4-bar` are all beaten by a **direction-aware** shape. **That is arm B's
answer arriving from the opposite direction, on different data, by a different method.**

### Recommended package — quantity 1

> **Metric:** keep **OKLab**. Do not adopt ICtCp.
> **Shape:** move from a per-region scalar to a **direction-aware (ellipsoidal) bar**.
> **Provisional digits:** `same` iff `√(ΔL² + 8.3·ΔC² + 7.4·ΔH²) < 0.0206` in `dark-neutral`.
> **Status: provisional. Do not apply on this round alone.**

The weights are the measured ratios squared (2.88² = 8.29, 2.72² = 7.39) under
`Δ² = ΔL² + ΔC² + ΔH²` with ΔH residual — the decomposition the study and this round both use. The
study's pooled shape-(d) fit gives 17.4 and 14.8 on the same parametrisation; round 4 says about half
that. **Both say the same thing qualitatively and they do not agree on the number, which is the
honest reason this is provisional.**

Why keep OKLab when ICtCp won the arm: the space question failed its own correction, and its
apparent win in the model comparison rests on the arm built out of the comparison. The *shape*
finding is the one that is clean, replicated across two independent analyses, and consistent with a
suspicion the contract had already written down. **Changing the space and the shape at once, on this
evidence, would be changing the thing that is uncertain in order to fix the thing that is not.**

---

## Quantity 2 — the accent-function quantity (`ACCENT_FUNCTIONAL_DISTANCE`, 0.14591)

### What came back: the same refusal as last time, on fresh covers

Pooled over the 36 isoluminant items: threshold **0.18401**, 95% CI [0.12978, 0.26091] — against
`accent-real-1`'s **0.18630** [0.14052, 0.24700]. *Required note, in the same sentence as the number:
the two rounds' served strings are **not** byte-identical — round 4 puts `accent-real-1`'s mid-round
chat clarification on screen instead of in conversation — so these are comparable under the
clarification that governed both, not as identical instruments.*

Per hue third:

| hue third | threshold |
|---|---|
| 0 | 0.16026 |
| 1 | 0.15336 |
| 2 | **no threshold anywhere in [0.06, 0.30]** |

Hue third 2 answered "works" 3 times in 12, non-monotonically, with **no relation at all between
distance and the answer** (rank-sum p = 1.000). Its unconstrained fit returns 1536 with an interval
spanning ~180 orders of magnitude; that is a fit reporting nothing, not a large threshold, and it is
recorded as unidentified rather than printed as a number.

**The pre-registered refusal condition fires. Verdict: `stratum-dependent` — for the second time.**
`accent-real-1` refused for the same reason. **This is a replication of a refusal, which is a
result:** tier 2 is a function of the pair, not a scalar, and the shape of `escapeDenied` is
implicated.

**Does hue-dependent now beat a single constant?** No — and this is the useful negative. With arm C
added to the model comparison, the hue/position-dependent shapes do not separate from the incumbent:
`linear-in-position` +0.0156 (p 0.681), `direction-and-position` +0.0104 (p 0.834), neither excluding
zero. What rose to the top of the functional table is the **`direction-aware`** column
(`cam16-ucs × direction-aware` 0.4995, p 0.058, still not excluding zero). **The per-hue-third spread
is real enough to refuse a single constant twice, and not the shape that predicts best.**

### The lightness axis — first reading ever, and it is large

The study said the lightness axis of the functional threshold was "not merely unmeasured, it is
unmeasurable from the existing data", because every accent in `accent-real-1` was isoluminant with
its field. The 24 non-isoluminant items were built to fix that.

| | n | works | rate |
|---|---|---|---|
| isoluminant | 36 | 13 | **0.361** |
| non-isoluminant | 24 | 18 | **0.750** |
| at distance ≈ 0.09 | 6 / 12 | 2 / 7 | 0.333 vs **0.583** |
| at distance ≈ 0.20 | 5 / 12 | 3 / 11 | 0.600 vs **0.917** |

**At matched OKLab distance, an accent that also moves in lightness does its job about twice as
often.** The joint fit: `w_C` = **0.0658**, p = 0.00149, **survives Holm** — a chromatic step is worth
roughly **0.26** of a lightness step of the same size.

**Read that as a direction, not as a coefficient.** `w_C` is identified here almost entirely by the
*between-strata* contrast: ΔL is ~0 by construction for all 36 isoluminant items and large for all 24
non-isoluminant ones, so "`w_C` is small" and "stratum predicts the answer" are nearly the same
statement in this design. The prereg declared this half exploratory and under-identified in advance.
It means **"lightness contrast helps an accent, substantially"**. It does not mean the functional
bar's chroma weight is 0.066.

### The two criteria point opposite ways, and that is the strongest argument in the round

- **Identity:** a lightness step must be ~**2.9× larger** than a chroma step before it registers as a
  different colour. Lightness is the *least* salient direction.
- **Function:** a lightness step is worth ~**3.9× more** than a chromatic one for making an accent
  findable. Lightness is the *most* effective direction.

Same colour space, same decomposition, opposite anisotropy. **§5.5's ban on cross-criterion pooling
was written as a precaution; it is now a measurement.** Any future proposal to share one ruler
between "is this the same colour?" and "does this work as an accent?" has to answer this table first.

### Recommended package — quantity 2

> **Metric:** OKLab, unchanged.
> **Shape:** **none adoptable.** The single constant is refused for the second time.
> **Provisional digits:** none. **Keep `ACCENT_FUNCTIONAL_DISTANCE = 0.14591` frozen and keep its
> audit status as it stands.**

Adopting the pooled 0.18401 would be wrong three times over: the refusal condition fired against it;
the prereg records that any functional value ≥ ≈0.15362 **breaks
`tests/contract-invariants.test.ts:701` outright**, and both 0.18401 and `accent-real-1`'s 0.18630
are above that line; and the quantity is now known to depend on a direction the constant cannot
express. **What this round funds for quantity 2 is a better-specified next round, not a number.**

---

## What refused, and why — the short list

| what | why |
|---|---|
| **Adopting ICtCp as the contract's space** | Arm A decisive on its own rule (28/40, p 0.0166) but Holm-adjusted p 0.0995. The model comparison's support for it exists only in the configuration that includes the arm selected on that very disagreement. |
| **Adopting any anisotropy ratio as a number** | Arm B was declared under-powered for adoption before it ran, and it is. Intervals [1.91, 4.39] and [1.65, 5.90] contain 2, 2.9 and 4.2 alike. |
| **Adopting a functional threshold** | §5.4's refusal condition fired: hue third 2 identifies no threshold in the claim domain. Second refusal, same reason as `accent-real-1`. |
| **Reading `w_C` = 0.066 as a coefficient** | Under-identified by design — confounded with stratum. Directional read only. |
| **Anything about the region boundaries' locations** | Arm A tests whether a partition is needed, never where it sits. A boundary in the wrong place and a boundary that should not exist look identical here. |
| **Anything about the P1 excursion multiplier (2.5×)** | No item varied excursion magnitude. If the metric moves, the multiplier becomes **more** open, not less — it is a multiple of a redefined quantity. |
| **Anything about the foreground↔accent bar (B31)** | Not asked. Every accent was held ≥ 0.07444 from its foreground precisely so it could not be. |

---

## The concrete contract-change proposal — **diff sketch only, PARTIALLY APPLIED**

For sign-off. Nothing below had been written to any file when it was written; the sign-off of
2026-08-04 applied **part** of it, and the part it did not apply is the important one.

- **Applied**: the two constants below (plus a third the sketch does not name,
  `ICTCP_GLOBAL_SAME_COLOR_BAR`, needed to run the ICtCp challenger), each with an audit row.
- **Applied in a different form**: `sameColorDirectionAware()` exists, but as one of two challengers
  in `src/contract/challengers.ts` rather than as a loose function in `color.ts`, and it is wired
  into invariant 3's observation sink so that it is *counted* on every judged pair.
- **NOT applied**: anything that changes a verdict. The "Invariants affected" section below prices
  the adoption, and that price has not been paid — invariant 3 still consumes `sameColorBar()` as a
  scalar, `POOLED_SAME_COLOR_BAR` is untouched, the P1 excursion bar has inherited nothing, and
  `tests/contract-invariants.test.ts`'s distinctness cases are unchanged because they did not need
  to change.

### Spaces

**No change.** `OKLab` stays the contract's space. `colorDistance()`, `okLabFromColor()` and the
region partition are untouched by this proposal.

### Constants — `src/contract/constants.ts`

```diff
 export const SAME_COLOR_BAR_BY_REGION = {
   "dark-neutral": 0.00932,
   "dark-saturated": 0.01502,
   "light-neutral": 0.01627,
   "light-saturated": 0.02293,
 } as const
+
+/**
+ * Direction weights for the same-colour bar. [PROVISIONAL - NOT ADOPTED]
+ *
+ * perception-4 arm B, three 12-rung pure-direction ladders in dark-neutral: a pure lightness step
+ * crosses at 0.02063, chroma at 0.00717, hue at 0.00759. Ratios 2.88 [1.91, 4.39] and
+ * 2.72 [1.65, 5.90], both Holm-clean over the round's declared family of 13. Weights are the
+ * ratios squared, under the decomposition d^2 = dL^2 + dC^2 + dH^2 with dH residual.
+ *
+ * MEASURED IN dark-neutral ONLY. Nothing says the ratio holds in the other three regions.
+ */
+export const SAME_COLOR_DIRECTION_WEIGHTS = { chroma: 8.29, hue: 7.39 } as const
+
+/** The direction-aware bar's scale, in dark-neutral. [PROVISIONAL - NOT ADOPTED] */
+export const SAME_COLOR_BAR_LIGHTNESS_AXIS = { "dark-neutral": 0.02063 } as const
```

`ACCENT_FUNCTIONAL_DISTANCE = 0.14591` — **no change proposed.**
`REGION_LIGHTNESS_BOUNDARY` / `REGION_CHROMA_BOUNDARY` — **no change proposed**; this round did not
test their locations.

### Rule shape — `src/contract/color.ts`

```diff
 export function sameColorBar(first: PaletteColor, second: PaletteColor): number {
   return Math.max(
     SAME_COLOR_BAR_BY_REGION[colorRegion(first)],
     SAME_COLOR_BAR_BY_REGION[colorRegion(second)],
   )
 }
+
+/**
+ * Are these the same colour, by a direction-aware bar? [PROVISIONAL - NOT ADOPTED]
+ *
+ * The scalar bar cannot express what perception-4 measured: in dark-neutral the same-colour
+ * threshold is 0.00717 for a pure chroma step and 0.02063 for a pure lightness one. The committed
+ * 0.00932 is too loose for the first and less than half the second.
+ */
+export function sameColorDirectionAware(first: PaletteColor, second: PaletteColor): boolean {
+  const { deltaLightness, deltaChroma, deltaHue } = decompose(okLabFromColor(first), okLabFromColor(second))
+  const scaled = Math.hypot(
+    deltaLightness,
+    Math.sqrt(SAME_COLOR_DIRECTION_WEIGHTS.chroma) * deltaChroma,
+    Math.sqrt(SAME_COLOR_DIRECTION_WEIGHTS.hue) * deltaHue,
+  )
+  return scaled < SAME_COLOR_BAR_LIGHTNESS_AXIS["dark-neutral"]
+}
```

`sameColor()` and `sameColorBar()` **keep their current behaviour**. The proposal adds a second
function; it does not redirect the first. Nothing in the pipeline calls the new one until the
reviewer says so.

### Invariants affected — and this is the part that costs

Adopting the shape (not just landing the constant) touches more than two lines:

1. **Invariant 3 (distinctness)** consumes `sameColorBar()` as a **scalar**. A direction-aware rule
   has no single bar to return, so either invariant 3 changes shape or `sameColorBar()` keeps
   existing as a conservative scalar alongside it. **This is the real cost and it should be decided
   before any constant lands.**
2. **`POOLED_SAME_COLOR_BAR = 0.01535`** is documented as being for corpus metrics and dashboards
   only. It stays scalar and stays valid for that use — but its relationship to the per-pair rule
   would no longer be "the same quantity, pooled".
3. **The P1 excursion bar (2.5 × the same-colour bar)** silently inherits every dependence the bar
   has. Making the bar direction-aware makes the excursion bar direction-aware **by accident**, with
   a 2.5× lever nobody decided. §7.1 named this in advance. **It needs its own round with ramp
   stimuli and must not be allowed to change as a side effect.**
4. **`tests/contract-invariants.test.ts`** — the distinctness cases are written against the scalar.
   They would need to be re-expressed, not merely re-numbered.

### What would have to happen before any of this lands

1. **A second region.** Arm B is `dark-neutral` only. The weights need at least one more region
   before a global claim is made.
2. **More rungs.** 12 per ladder confirms; it does not pin. §3.4 prices 30 per ladder to tell 2× from
   4×, and the two independent estimates currently sit at 2.9× and 4.2×.
3. **A decision on invariant 3's shape**, above.

---

## Proposed decision records

Three, in `data/decisions/proposed-perception-4.json`, all funded by the round's 148 label ids plus
its `batch-complete` record. ~~**None is placed.**~~ **All three were placed unamended on
2026-08-04**, on the sign-off in the header, alongside
`d-2026-08-04-perception-4-package-signed-off` (which records the disposition and carries an empty
`fundedBy`, the sign-off being one conversational sentence) and `d-2026-08-04-phase-0-closed`.
`recheck` reports `total decisions=102 flagged=2` — the two long-standing flags, none added.

| id | what it records |
|---|---|
| `d-2026-08-04-identity-metric-shape-not-space` | Arm A decisive-but-not-family-wise; the direction finding is the clean one; **OKLab retained, no space change**; the ellipsoidal shape is the provisional recommendation. |
| `d-2026-08-04-identity-anisotropy-measured` | Ledger **B9** from "unmeasured" to **"measured, unencoded"**: 2.88 [1.91, 4.39] and 2.72 [1.65, 5.90], dark-neutral, Holm-clean, under-powered for adoption by prior declaration. |
| `d-2026-08-04-accent-functional-refused-again` | Second `stratum-dependent` refusal; `ACCENT_FUNCTIONAL_DISTANCE` stays 0.14591; the lightness axis has its first reading and it is large but confounded with stratum. |

---

## The three sentences to take away

1. **The space question lost to the shape question.** ICtCp won its arm and failed its correction;
   direction won on two independent analyses and survived one.
2. **The accent threshold refused adoption for the second time**, and the reason it refuses is now
   visible: it depends on a lightness axis that no isoluminant round could ever have shown.
3. **The two criteria are anisotropic in opposite directions.** Never pool them.

*Written 2026-08-04 against `perception-round-4-analysis.json`. Applies nothing.*

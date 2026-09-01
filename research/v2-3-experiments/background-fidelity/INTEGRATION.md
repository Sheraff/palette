# Background fidelity — integration package

Arm: `research/v2-3-experiments/background-fidelity/`
Trunk: `5279f87`
Review: `batch-bf-1`, adjudicated — **4 for `bf-on`, 4 equal, 1 against**.

This is the pre-integration package the coordinator asked for: the full-corpus census, every
mover destination-adjudicated against the live warehouse, the attribution of the single loss, and
the recommendation with its fixture and test changes.

---

## 1. What review decided

| artwork | verdict | applies to | note |
|---|---|---|---|
| `000390c0` | **strong** | `bf-on` | the arm's primary target — the peach background delivered verbatim |
| `00034b1c` | **strong** | `bf-on` | gradient ramp reversal endorsed |
| `000ec4aa` | acceptable | `bf-on` | white-frame complaint resolved |
| `00039a97` | weak-fallback | `bf-on` | both sides weak, `bf-on` preferred; correction asks for a collapsed Leaf Bud field neither side offers |
| `disney` | **strong** | both | the parity fixture — both arrangements endorsed |
| `0000cb59` | **strong** | both | |
| `0013095d` | acceptable | both | the deliberate disconfirming item — direction-neutrality did **not** cost anything |
| `000c4fb7` | acceptable | both | |
| `00034b60` | acceptable | `bf-off` | **the one loss** — see §4 |

The disconfirming item is the one I most wanted a verdict on, because a bad result there would have
meant F1 was the wrong shape. It came back equal, with the reviewer's note about Snow-vs-Linen
distinguishability and a gradient doubt — both orthogonal to this mechanism.

---

## 2. Full-corpus census

**7,587 artworks extracted twice** — the whole corpus (7,550 hex-root artworks plus the 37
non-scrambled `images/` fixtures), once with the switch off and once with it on. Unscrambled corpus
at `/Users/Flo/GitHub/palette`. 4 workers, `VIPS_CONCURRENCY=1`, resumable. **0 extraction errors on
either side**, ~21 minutes per half.

| measure | value |
|---|---|
| movers | **451 / 7,587 = 5.94 %** |
| clean background↔surface swap | 198 (43.9 % of movers) |
| background replaced | 176 (39.0 %) |
| surface only / foreground / accent | 30 (6.7 %) |
| surface collapses (4→3 colours) | 26 (5.8 %) |
| surface un-collapses (3→4 colours) | 21 (4.7 %) |
| **gradient flips** | **2 in 7,587 — 1 gained, 1 lost** |

Two things worth stating plainly.

**Charter rule 5 is satisfied about as well as it can be.** An incorrectly allowed gradient is as
bad as an incorrectly prevented one, and this mechanism flips the gradient flag on 2 artworks in
7,587 — one each way. It is not a gradient change.

**Cardinality is not biased.** On the 479-artwork sample I reported the single collapse as "the only
cardinality change anywhere". That was a small-sample artifact and I am correcting it: corpus-wide
there are 26 collapses against 21 un-collapses, and the corpus collapse rate moves from 21.0 % to
21.0 %. The mechanism does not systematically destroy second field colours. Of the 26 collapses only
one is adjudicated — `00034b60`, the known loss; the other 25 are on unreviewed artwork.

Cross-validation: the census runner (one extraction pass) and the probe runner (evidence pass plus
extraction, different process, earlier) agree on **479 / 479** artworks on both sides. Determinism
across three independent processes was already clean.

---

## 3. Destination adjudication

Every mover is classified against the **full** warehouse (376 records, 168 artworks, 422 distinct
judged palettes), not just the latest verdict per artwork — a destination judged inferior in an old
batch is still a known-bad destination today.

The classifier implements the charter's bar literally. A record that contains **both** the `bf-off`
palette and the `bf-on` palette and expressed a preference is decisive and outranks any absolute
judgement. That matters: on `00039a97` the reviewer called the artwork weak-fallback while
preferring `bf-on`, which is a move **up**, not a regression. An earlier version of the classifier
got this wrong and flagged it as a regression; the corrected version reproduces the batch outcome
exactly.

Result over all 451 census movers:

| status | count |
|---|---|
| **regression — destination compared inferior** | **1** |
| win — destination preferred over the incumbent | 4 |
| neutral — destination compared equal | 4 |
| destination unadjudicated (artwork has a verdict, this palette never seen) | 7 |
| artwork never reviewed | 435 |

**The census surfaced no new known-bad destination.** The only regression is `00034b60`, which
`batch-bf-1` already found. The full table is `MOVERS.md`; the adjudicated 16 are reproduced below.

### The 16 movers on artwork that carries a verdict

| artwork | status | artwork's latest verdict | OFF | ON |
|---|---|---|---|---|
| `00034b60` | **REGRESSION** | acceptable (batch-bf-1) | `#4b3027 #8a5438 #e6dbc9 #b39a72` | `#4a3027 #4a3027 #e6dbc9 #b39a72` |
| `000390c0` | win | strong (batch-bf-1) | `#fcfaed #f0b691 #364d55 #f8e541` | `#f0b691 #fcfaed #364d55 #f8e541` |
| `00034b1c` | win | strong (batch-bf-1) | `#281832 #273d77 #9ae5fc #c3b0c6 grad` | `#273d77 #281832 #9ae5fc #c3b0c6 grad` |
| `000ec4aa` | win | acceptable (batch-bf-1) | `#f1f0ec #483469 #ddd1c3 #d44b91` | `#b1998d #4a3472 #f1f0ec #d44b91` |
| `00039a97` | win | weak-fallback (batch-bf-1) | `#f8fdf7 #7cd459 #060702 #e30629` | `#060702 #7bd45c #f8fdf7 #e30629` |
| `disney` | equal | strong (batch-bf-1) | `#74c044 #2199d6 #fbfdfc #c72690` | `#74c044 #c72690 #fbfdfc #2199d6` |
| `0000cb59` | equal | strong (batch-bf-1) | `#505962 #0d111c #dedfd9 #5a2513` | `#505962 #9a9fa3 #dedfd9 #5a2513` |
| `0013095d` | equal | acceptable (batch-bf-1) | `#1f3835 #f2f3ee #fffef9 #a15852 grad` | `#f2f3ee #1f3835 #fffef9 #a15852 grad` |
| `000c4fb7` | equal | acceptable (batch-bf-1) | `#1e4ece #9953d8 #f9f7fc #c0966e grad` | `#9953d8 #1e4ece #f9f7fc #c0966e grad` |
| `000b096f` | unadjudicated | **strong** (rw-batch-vividness) | `#083808 #001802 #f8fdf7 #54995a grad` | `#001802 #083808 #f8fdf7 #54995a grad` |
| `000f0a78` | unadjudicated | **strong** (ae-batch) | `#f3eb7c #fbfef7 #010101 #7c1608` | `#fbfef7 #f3eb7c #010101 #7c1608` |
| `0001c081` | unadjudicated | acceptable (review-23-fg-movers) | `#62564a #2d2113 #f7f7f5 #dcb246` | `#16110d #2d2113 #f7f7f5 #dcb246` |
| `00086019` | unadjudicated | acceptable (review-24-coverage) | `#89be90 #4eab8e #623c39 #faba50` | `#4daa8d #8abe8e #623c39 #faba50` |
| `000db903` | unadjudicated | acceptable (batch-34) | `#8ad1cd #e1d1c1 #20150f #5da1a2` | `#e1d1c1 #8ad1cd #20150f #5da1a2` |
| `0012eb9a` | unadjudicated | acceptable (batch-26) | `#040205 #20365f #e9e9eb #96d1a5` | `#070206 #000000 #e9e9eb #96d1a5` |
| `000f9f4b` | unadjudicated | weak-fallback (calib-batch-1a) | `#21356a #4d4b59 #f1faf9 #eed32e` | `#21356a #040f2b #f1faf9 #eed32e` |

**Residual risk, named.** Two movers come off an artwork whose latest verdict is *strong* to a
destination nobody has judged: `000b096f` (`#083808`↔`#001802`, two near-identical dark greens
exchanging roles inside a gradient) and `000f0a78` (`#f3eb7c`↔`#fbfef7`, pale yellow and near-white
exchanging roles — the more visible of the two). Under the charter's guardrail semantics these are
reviewable movement, not regressions, and neither is blocking. They are the natural first two items
for any follow-up batch.

---

## 4. The one loss, attributed — `00034b60`

**It is accepted cost, and the mechanism is precisely identified.** F1 is not misfiring; it is
correctly refusing a one-level decision, and the damage is done by the criterion it hands over to.

The published field pair is the `#4b3027` family (34.9% of pixels) against the `#8a5438` family
(8.4%). Their evidence-level deltas, background family minus surface family:

| criterion | delta | who it favours |
|---|---|---|
| 1 `frameCoverage` | **+1** | big family — but one level, which F1 correctly refuses |
| 2 `peripheralCoverage` | **−3** | **small family** |
| 3 `connectedCoverage` | +13 | big family |
| 4 `fieldScore` | +8 | big family |
| 5 `populationCoverage` | +17 | big family |

Under OFF, criterion 1 decides and the big family is the background. Under ON, criterion 1 ties and
criterion 2 decides — **flipping the pair** so an 8.4% family would hold the background, while
criteria 3, 4 and 5 contradict that by 13, 8 and 17 levels and are never consulted. The winner
objective then declines to publish the inversion and falls back to a collapsed one-field treatment,
which is why the visible symptom is a lost surface colour rather than an absurd background.

The term doing the damage is `(1 - centerCoverage)` inside `peripheralCoverage`. Border and corner
ownership are nearly equal between the two families (0.258 vs 0.236); what separates them is that
the small family sits off-centre (`centerCoverage` 0.059 against 0.453), scoring 0.941 on the
anti-centre term against 0.547.

**Why this is not being fixed here.** The obvious move is to distrust criterion 2 — but the corpus
refuses that conclusion:

- The same configuration (criterion 2 deciding against a unanimous, decisive criteria 3–5) occurs on
  **15 of 374** published field pairs, including reviewed-**strong** `loups` and `orelsan`.
- `loups` is already decided by criterion 2 today; F1 changes nothing about it.
- `orelsan` has F1 move the decider from criterion 1 to criterion 2, and the orientation is
  **preserved** because both point the same way. Reviewed-strong, unmoved.

So criterion 2 is not defective in general. The precise failure signature is narrower than "criterion
2 decided": it is **F1's fall-through flipping the pair orientation**, which across the measured
corpus happens on `00034b60` and produces the only palette-cardinality change anywhere in the census.

**Named follow-up** (a separate arm, not this one): does criterion 2 deserve its position ahead of
every mass and coherence signal, and should `(1 - centerCoverage)` be a positive ground signal at
all? This arm's F2 already answers "no" for the mount case on exactly this reasoning — absence from
the centre is evidence of not being the *subject*, not evidence of being the *ground*. Generalising
that is a real change with an unmeasured blast radius and one adjudicated data point, and it belongs
to whoever owns field-role ownership.

---

## 5. Recommendation: **INTEGRATE**

Both of the coordinator's conditions hold.

1. *No known-bad destinations in the census* — the 7,587-artwork census produced **zero** new
   known-bad destinations. Every one of the 451 movers is either endorsed, equal, unadjudicated, or
   on artwork nobody has reviewed.
2. *The loss stays singular* — exactly **one** regression corpus-wide, `00034b60`, already known
   from the batch and attributed in §4.

Scoreboard on adjudicated movers: **4 wins, 4 equal, 1 loss.** The one strong verdict in the batch
that the arm most wanted — `000390c0`, the artwork whose complaint started this work — came back
strong for `bf-on` with the target colour delivered verbatim.

### What is in the integrated state

| file | change |
|---|---|
| `research/v2-3/src/internal/palette-core.ts` | `BACKGROUND_FIDELITY = "on"`; `isMount` carried on `ColorFamilyEvidence`; F1 in `assignFieldRoles`; F2 in `fieldRoleOwnershipProfile`; F3 wired into `mountFamilyIds` |
| `research/v2-3/src/internal/policy.ts` | the `backgroundFidelity` block; corrected `mount.minimumEnclosedPopulationRatio` provenance note |
| `research/v2-3/src/internal/field-transition.ts` | verbatim duplicate of `roleOwnershipProfile`/`assignFieldRoles` deleted, export imported |
| `research/v2-3/test/review-fixtures.ts` | `disney.avif` surface/accent exchange — the **only** parity fixture change |
| `research/v2-3/test/configuration.test.ts` | ship-OFF pin becomes an enabled pin carrying the verdicts, the census, and the known cost |

### Tests at the integrated configuration

| check | result |
|---|---|
| `tsc -p research/v2-3/tsconfig.json` | clean |
| `architecture.test.ts` | 2 / 2 |
| `configuration.test.ts` | 11 / 11 — ten cliff pins unchanged |
| **`parity.test.ts` (34 fixtures + determinism + parameter tests)** | **39 / 39** |
| census cross-validation (two independent runners) | 479 / 479 agree, both configs |
| determinism (three independent processes) | 0 disagreements |

Reverting is one character: `BACKGROUND_FIDELITY = "off"` restores the previous behaviour exactly,
verified byte-identical on all 34 parity fixtures and 320 fresh artworks. The `disney` fixture would
have to revert with it.

### Follow-ups this arm is handing on

1. **Criterion-2 authority** (from §4). Does `peripheralCoverage` deserve its position ahead of every
   mass and coherence signal, and should `(1 - centerCoverage)` be a positive ground signal at all?
   The configuration occurs on 15 of 374 published pairs. One adjudicated data point says it can be
   wrong; `loups` and `orelsan` say it is often right. Needs its own arm.
2. **Partial mounts.** `000bd117` — a near-white holding 10 % of the pixels and **75 %** of the
   border against a yellow holding 45 % — is the failure pattern's largest instance and is untouched,
   because the mount test needs 90 % border coverage. Named in EXPERIMENT.md §7 as the next lead.
3. **The three sub-classes this arm deliberately did not address**: surface-representative provenance
   (`00079f9a`, `000f9f4b`), resolution-dependent surface family (`000e2291`), and treatment
   selection (`000b5fe0`). None is a background-selection defect.
4. **Two strong-artwork movers to unadjudicated destinations**, `000b096f` and `000f0a78`, for the
   next batch.

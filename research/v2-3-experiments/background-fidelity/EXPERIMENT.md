# Background fidelity — who wins the background role

Arm: `research/v2-3-experiments/background-fidelity/`
Trunk: `5279f87` (originally written at `c77fabc`)
Ships: **ON** — `batch-bf-1` adjudicated **4 for / 4 equal / 1 against**, and a 7,587-artwork census
at this exact configuration surfaced no new known-bad destination. See **`INTEGRATION.md`** for the
census, the full destination adjudication, the attribution of the one loss, and the test results.

> This document is the arm's original investigation, kept as written except where a later
> measurement corrected it. Where it says "ships OFF", that was true when the batch was proposed;
> the switch was flipped only after review returned. Two claims below were corrected by the
> full-corpus census and are marked in place.

Every measurement below used the **unscrambled** corpus at `/Users/Flo/GitHub/palette` (charter,
"Corpus trap"). No number in this file was produced from a worktree `images/` decoy.

---

## 1. The charge, and what the evidence actually says

The brief describes a cluster of six verdict-backed artworks as "background selection fails on
near-neutral-ground artwork" and asks for the extent of the class, a per-case diagnosis, the
narrowest principled fix, and verification.

**The first finding is that the cluster is not one class, and only two of its six members are
background-selection failures at all.** Reading the six verdicts against the family evidence
separates them into five distinct mechanisms. Three of the six never touch background selection:
their complaint is about the *surface*, and on two of them the reviewer explicitly keeps the
published background. The arm therefore targets the two real background failures and reports the
other three honestly as out of scope rather than fitting a background rule to them.

---

## 2. The mechanism, stated exactly

`assignFieldRoles` (`palette-core.ts:1438`) decides which of two families is the background. It is
a **strict lexicographic scan** over five criteria from `fieldRoleOwnershipProfile`, each quantized
by `evidenceLevel(v) = floor(v / RESOLUTIONS.evidence)`:

| # | criterion | what it is |
|---|---|---|
| 1 | `frameCoverage` | `(borderCoverage + cornerCoverage) / 2` |
| 2 | `peripheralCoverage` | `(borderCoverage + cornerCoverage + (1 - centerCoverage)) / 3` |
| 3 | `connectedCoverage` | `sqrt(clamp(largestComponentFraction / 0.24) * familyConcentration)` |
| 4 | `fieldScore` | the composite ground score |
| 5 | `populationCoverage` | `clamp(populationFraction / 0.24)` |

The first criterion at which the two families' levels differ decides, and the scan stops. **Field
mass is last.** Edge ownership pre-empts it outright.

Measured on 320 fresh artworks: `frameCoverage` alone decides **225 of 320 (70.3%)** of all role
assignments. Among the 240 that are genuine two-family pairs it decides **94%**.

Two defects follow from this shape.

### Defect A — a one-level difference is not evidence, but it decides

`evidenceLevel` is a **floor** and the comparison was `difference !== 0`. Two scores differing by an
arbitrarily small amount land in different levels whenever they straddle a bin boundary, and that
decides the background role. This directly contradicts what `policy.ts:1-13` says quantization is
for — "two scores inside one band are treated as indistinguishable evidence".

**9.4% of fresh artworks (30 of 320) have their background decided by exactly one level of
`frameCoverage`** — 13.3% of all `frameCoverage` decisions.

### Defect B — the mount mechanism corrects a term the decision never reaches

`ALBUM_ARTWORK_PALETTE_V2_POLICY.mount` exists for precisely the frame case in this cluster. It
identifies a frame/matte by enclosure ("a mount owns the whole border while a *larger* field family
owns none of it") and withdraws its border credit, `borderCreditRetained: 0`.

It withdraws that credit **from `fieldScore` only** (`palette-core.ts:2218`) — criterion **four**.
The scan decides at criterion **one**, computed from the raw `borderCoverage`/`cornerCoverage` the
mount test just explained away. A family that the policy has positively identified as a frame
therefore still wins the background role, every time, on the one signal a frame is definitionally
guaranteed to dominate. **The mount mechanism cannot do the job it was written for.**

It is also nearly inert as shipped: on 320 fresh artworks the mount test fires on **1** artwork and
on **0** published backgrounds.

---

## 3. Sizing the class

Detector: the gradient arm's round-8 scan filter (`gradient-fit-generation/probe-groundcase.ts`,
branch `worktree-agent-af2ba8fda27920c6c`), reused verbatim inside `probe-bgfidelity.ts`. Its
predicate is `chroma(bg) < 0.06 && chroma(surface) >= 0.06 && frameCoverage(bg) > frameCoverage(surface)`
— which, note, *is* the failure mechanism written as a filter.

Sample: **320 fresh artworks**, drawn deterministically (sorted by sha256 of basename, no RNG) from
the 7,315 corpus artworks carrying neither a verdict nor a round-8 probe. 4 workers,
`VIPS_CONCURRENCY=1`, resumable, 0 errors.

| measure | count | rate |
|---|---|---|
| round-8 detector as written (requires `!gradient`) | 29 / 320 | 9.1% |
| the configuration, gradient-agnostic | **51 / 320** | **15.9%** |
| configuration **and** `massRatio >= 1.5` | 5 / 320 | 1.6% of corpus, 9.8% of the configuration |
| configuration **and** `massRatio >= 2.0` | 3 / 320 | 0.9% of corpus, 5.9% of the configuration |

`massRatio` is this arm's failure proxy: the largest chromatic family's population fraction over
the published background family's, i.e. "a chromatic family holds clearly more field mass than the
near-neutral thing we called the background". It was chosen to match the batch-38 wording.

The 9.1% reproduces round 8's 10.5% on an independent draw. Dropping the gradient requirement — the
failure class does not care about the flag, two of the six cases publish `gradient: true` — raises
the configuration to 15.9%.

**Read this carefully: the configuration is common (1 artwork in 6) and the failure pattern inside
it is rare (1 in 10 of those, 1 in 60 of the corpus).** Batches 37–38 were a filter-enriched sample
and their 3-in-12 complaint rate is not the corpus rate. The reviewer's worry is real but the class
is roughly 1.6% of artwork, not 16%.

A second sizing pass (`probe-mountratio.ts`, 479 artworks, evidence-only) measured how often the
*frame* geometry specifically occurs: **85 of 479 (17.7%)** have a family owning ≥90% of the border,
but only **4** clear the incumbent enclosure bar and become mounts. The frame shape is common; the
frame shape *with a materially larger enclosed field behind it* is not.

---

## 4. Per-case diagnosis — five sub-classes, not one

All figures from `probe-bgfidelity.ts` on the real artwork. `L`n = evidence level.

| case | verdict | published bg | diagnosis | sub-class |
|---|---|---|---|---|
| `000390c0` | batch-38 weak-fallback | `#fcfaed` near-white | frameCoverage L4 vs L3 — **one level**; `populationCoverage` favours the peach L12 vs L14. Also the chromatic ground is **fragmented**: the published peach holds 0.139 and a second peach family holds 0.260. | **S2 knife-edge** |
| `000ec4aa` | batch-37 weak-fallback | `#f1f0ec` white frame | white: border **0.999**, centre **0.000**, 10.7% of pixels. Purple: border 0.000, 25.5%. Textbook mount — but ratio **2.399** vs the 2.5 bar, so unrecognised; and recognition alone would change nothing (Defect B). | **S1 mount** |
| `00079f9a` | batch-38 weak-fallback | `#242328` | Background is **correct** and the reviewer keeps it (correction changes only the surface). frameCoverage margin is 19 levels. The complaint is the surface *representative* — `#6b3e45` where `#953c5c` was asked for. | **S3 surface representative** |
| `000f9f4b` | calib-1 weak-fallback | `#21356a` | Background **correct**, decided on `connectedCoverage`. The complaint is a near-neutral surface (`#4d4b59`, chroma 0.026, connectedCoverage 0.097) with no visible provenance. | **S3 surface representative** |
| `000e2291` 640px | batch-38 weak-fallback | `#0c1416` | Background is the same dark at both resolutions and matches the batch-26-endorsed 300px palette. What differs is the **surface**: orange `#dd5839` (chroma 0.173) at 300px, dark green `#264010` (chroma 0.069) at 640px, because the green family's mass grows with resolution. | **S4 resolution-dependent surface** |
| `000b5fe0` | batch-32 unacceptable | `#f3f3f3` | Published as a **collapsed one-field** treatment, so `assignFieldRoles` never runs (the white has frameCoverage 0.000 — it is the white *drawing*, not a ground). A two-family hypothesis lost to a one-field one. | **S5 treatment selection** |

**S3, S4 and S5 are not background-selection defects.** Three of the six cases are surface or
treatment problems wearing a background-shaped complaint. They are not addressed here and should not
be, by this arm.

---

## 5. The fix

Three changes, all gated by one switch, all shipping OFF. The policy block is
`ALBUM_ARTWORK_PALETTE_V2_POLICY.backgroundFidelity`.

**F1 — `minimumRoleOwnershipEvidenceLevels: 2`.** A criterion may decide only on a separation of two
quantization levels, which is the smallest gap guaranteeing the underlying difference exceeds one
full `RESOLUTIONS.evidence` step. **This is derived from `Math.floor`, not tuned** — no other value
is defensible, and `1` restores the previous behaviour exactly. Addresses S2.

**F2 — `mountRoleOwnershipBorderCredit: 0`.** The mount's border credit is withdrawn from criteria
1 and 2 as well, so the existing mount finding reaches the decision it was written to change. All
three peripheral terms are withdrawn including `1 - centerCoverage`, because a mount's absence from
the centre is not independent evidence of ground — it *is* the enclosure signature that identified
it. `ColorFamilyEvidence` gains an optional `isMount` flag, set where mounts are already recognised.
Addresses S1.

**F3 — `minimumEnclosedPopulationRatio: 2.09`.** `mount.minimumEnclosedPopulationRatio` re-derived.
Needed before F2 can bite on `000ec4aa` at all.

This one was derived twice, because the first derivation was wrong and the corpus said so. The
incumbent's comment describes a gap of [0.76, 4.47] with the threshold at its centre; the obvious
move was to re-centre on [0.76, 2.399] once `000ec4aa` narrowed it, giving 1.58. **Measuring the
distribution instead of trusting the comment showed there is no such gap.** Across 479 artworks, 85
have a border-owning family and their ratios run continuously through the supposedly empty region:
1.073, 1.088, 1.265, 1.266, 1.420, 1.550, 1.775, 1.781, then 2.399, 2.938, 4.336, 4.473, 7.913.

There *is* a real gap, and it is narrow. The highest ratio whose frame-as-background review
**accepted** is `000844ca` at 1.781 (calib-batch-1a, acceptable); the lowest review wants
**flipped** is `000ec4aa` at 2.399. The incumbent's own placement rule applied to the measured gap
[1.781, 2.399] gives **2.09** — which is also the minimal-blast-radius choice: 4 artworks of 479 are
mounts at 2.5, and 5 at 2.09, the one artwork review asked for and nothing else. The rejected 1.58
would have admitted three more, one of them the artwork whose frame review accepted.

**No cliff pin is touched.** All ten still assert their incumbent values. `FAMILY_BIN_STEP` is
adjacent — `000390c0`'s fragmented peach ground is a binning artifact and merging those two families
would fix that case a second way — but it moves 97% of palettes at ±20% and is not touched here.
That interaction is a finding, not a proposal.

### One structural repair that is not gated

`field-transition.ts` carried a **verbatim second copy** of `roleOwnershipProfile` and
`assignFieldRoles`, differing only in writing the resolution as a bare `0.04`. Two copies of the
rule that decides the background is a latent divergence, and this arm made it live: a repair applied
to one copy would leave the transition path deciding the old way. The duplicate is deleted and the
export imported. `clamp` and the literal were identical, so this is behaviour-preserving — and it
was **verified**, not asserted (see §6).

---

## 6. Verification

| check | result |
|---|---|
| Typecheck (`tsc -p research/v2-3/tsconfig.json`) | clean |
| `architecture.test.ts` | 2/2 pass |
| `configuration.test.ts` | 11/11 pass, incl. the new ship-OFF pin; ten cliff pins unchanged |
| **Full 34-fixture parity, OFF** | **34/34 pass** — the whole change set is byte-identical to trunk |
| OFF before vs after the change set, 320 fresh artworks | **320/320 identical** (this is the de-duplication's neutrality evidence) |
| Full 34-fixture parity, ON | 33/34 — only `disney.avif` moves |
| Determinism, OFF, two independent sweeps | 320 compared, **0 disagree** |
| Determinism, ON, three independent processes | 7 and 9 compared, **0 disagree** |

### Blast radius with the switch ON

479 artworks: 159 verdict-carrying (latest verdict per artwork, mined live per charter "Verdict
recency") + 320 fresh off-panel.

| panel | movers |
|---|---|
| total | **24 / 479 = 5.0%** |
| verdict-carrying | 11 / 159 = 6.9% |
| off-panel fresh | 13 / 320 = 4.1% |
| **movers to a known-bad destination (auto-fail)** | **0** |
| movers off a reviewed-strong palette | 4 of 112 strong |

Among movers, 21 change the background and 7 are clean background↔surface swaps. The four
strong-palette movers are `disney`, `00034b60`, `00034b1c` and `000b096f` — every destination
unadjudicated, so under the new guardrail semantics these are **reviewable movement, not
regressions**. They are the batch's most important items.

(These are the figures at the corrected `F3 = 2.09`. The rejected `F3 = 1.58` measured 25 / 479;
the one extra mover was `000d8003`, whose background and surface are `#000000` and `#010101` —
two indistinguishable blacks exchanging roles.)

### Did the six cases get fixed?

| case | outcome |
|---|---|
| `000390c0` | **FIXED, exactly as the reviewer asked.** `bg #fcfaed → #f0b691`, a clean swap; the peach the note names as "the dominating field color" becomes the background. Decisive criterion moves from `frameCoverage`(1 level) to `populationCoverage`(2 levels). |
| `000ec4aa` | **PARTIALLY reached.** The white frame is no longer the background — the stated complaint is resolved — and the surface `#4a3472` is essentially the correction's requested background `#483469`. But the roles are not arranged as the correction asks and the new background `#b1998d` was not requested. Destination unadjudicated. |
| `000f9f4b` | Moved incidentally (surface `#4d4b59 → #040f2b`), background correctly preserved. Not targeted; the bar it needed is a surface-representative rule this arm did not build. |
| `00079f9a` | **Unreached.** Bar: its frameCoverage margin is 19 levels and the background is correct anyway. Needs a surface-representative fix (S3). |
| `000e2291` 640px | **Unreached.** Bar: frameCoverage margin 3 levels, background correct. Needs a resolution-stable surface-family rule (S4). The 300px batch-26-strong palette is **unchanged**, as required. |
| `000b5fe0` | **Unreached.** Bar: published as a one-field treatment, so role assignment never executes. Needs a treatment-selection fix (S5). |

**Two of six materially improved, one of those exactly as asked; four honestly unreached with the
bar named for each.**

---

## 7. Honest self-assessment

- **This is not a fix for the class.** Of the 5 off-panel artworks showing the failure pattern
  (configuration and `massRatio >= 1.5`), the fix moves **1**. It repairs two named mechanisms
  inside the class, not the class.
- **The largest-mass-ratio artwork in the sample is untouched.** `000bd117` (`massRatio` 4.38) has a
  near-white holding 10% of pixels and **75% of the border** against a yellow holding 45% and no
  border at all. It is a *partial mount* — 0.749 border coverage against the mount test's 0.9 bar —
  and its frameCoverage margin is 8 levels, so neither F1 nor F2 reaches it. **Partial mounts are
  the named next lead.**
- **F1 is direction-neutral, and one batch item is chosen to expose that.** It refuses knife-edge
  frame decisions; it does not prefer chromatic grounds. On `0013095d` it moves the background
  *toward* a near-white — the opposite of the class this arm was chartered to fix. If review likes
  `000390c0`'s swap and dislikes `0013095d`'s, F1 is the wrong shape and needs a mass-aware form.
  **Resolved by review:** `0013095d` came back *acceptable on both sides* while `000390c0` came back
  *strong for `bf-on`*. Direction-neutrality cost nothing, and F1's shape stands.
- **F3 is n=1 on each side.** Exactly one measured artwork sits below the value with an accepted
  frame (`000844ca`, 1.781) and one above it wanting a flip (`000ec4aa`, 2.399). It is the
  weakest-evidenced of the three changes, and the only reason to have any confidence in it is that
  it moves 1 artwork in 479.
- **The incumbent's own comment was wrong about its own evidence**, and this arm only found that by
  measuring rather than quoting. Anyone re-tuning `minimumEnclosedPopulationRatio` from the prose in
  `policy.ts` would place it in the middle of an occupied region. The corrected distribution is now
  recorded in that comment.
- **The `massRatio` proxy is this arm's own construction**, chosen to match the batch-38 wording. It
  has not been validated against review.
- **The blast radius is almost entirely F1.** At the shipped `F3 = 2.09` the mount test admits one
  artwork beyond the incumbent's four across 479, so F2+F3 are nearly free; F1 carries the 5.0%.
  They can be enabled independently and the policy block is written so either can be neutralised
  without touching the other.
- **No full-corpus census was run** *at proposal time*. The charter asks for one only if the
  mechanism is an enabled-recommendation; it was not — the recommendation was review-then-decide,
  shipping OFF. **It has since been run**: 7,587 artworks twice, 451 movers (5.94 %), 0 extraction
  errors, no new known-bad destination, 2 gradient flips (1 each way). See `INTEGRATION.md` §2.

---

## 8. Proposed review batch — `batch-bf-1`, 9 items

Built, blinded and mirrored. Both sides are **real extractions of the real artwork**;
`mirror-batch.ts` refuses to write a label whose name disagrees with the compiled switch, which was
verified by attempting it.

- Batch: `research/v2-3-eval/data/batches/batch-bf-1.json` (+ `.key.json`)
- Extractions: `research/v2-3-eval/data/results/bf-off/`, `.../bf-on/`
- **Manifest with per-item destination-adjudication status and the full revert rules:**
  `research/v2-3-eval/data/results/bf-manifest.json`

| item | role | destination |
|---|---|---|
| `000390c0` | TARGET — the primary case, fixed as asked | unadjudicated |
| `000ec4aa` | TARGET — the frame case, partially reached | unadjudicated |
| `disney` | GUARDRAIL — reviewed-strong, the only parity fixture that moves | unadjudicated |
| `00034b60` | GUARDRAIL — reviewed-strong; **surface collapses** (the only cardinality change in 479 — *corrected by the census: 26 collapses against 21 un-collapses corpus-wide, see INTEGRATION.md §2*) | unadjudicated |
| `00034b1c` | GUARDRAIL — reviewed-strong; gradient ramp reverses | unadjudicated |
| `00039a97` | FRESH — the one off-panel failure-pattern artwork that moves | unreviewed |
| `0013095d` | FRESH — **disconfirming**: moves toward a near-white background | unreviewed |
| `000c4fb7` | FRESH — gradient swap without a strong verdict at stake | unreviewed |
| `0000cb59` | FRESH — surface replaced outright rather than swapped | unreviewed |

Four of nine are fresh, never-reviewed artwork. Zero items have a known-bad destination, so nothing
auto-fails on arrival.

### Revert rules (full text in the manifest)

- **Auto-kill**: two or more of the three reviewed-strong movers judged worse → revert F1, keep
  F2+F3. `00034b60`'s collapse judged worse → F1 must be re-derived as frameCoverage-only.
  `0013095d` worse while `000390c0` better → F1 is the wrong shape; replace with an explicitly
  mass-aware rule, do not retune the level count.
- **Keep**: `000390c0` better and at most one strong-mover worse → propose enabling F1 and run the
  full-corpus census before integration. `000ec4aa` better → F2+F3 can be proposed alone.
- **Do not conclude**: F1 and F2+F3 fire on disjoint artworks here and must be judged separately.

---

## 9. Files

Runtime (all gated; OFF is byte-identical to trunk):
- `research/v2-3/src/internal/policy.ts` — the `backgroundFidelity` block
- `research/v2-3/src/internal/palette-core.ts` — the switch, `isMount`, the two repairs
- `research/v2-3/src/internal/field-transition.ts` — duplicate deleted, import added
- `research/v2-3/test/configuration.test.ts` — the ship-OFF pin

Arm: `probe-bgfidelity.ts` (detector + proxy + diagnosis), `probe-mountratio.ts`,
`run-*.ts`, `sweep.sh`, `mirror-batch.ts`, and the Python analyses
(`analyze.py`, `analyze-offpanel.py`, `determinism.py`, `list-movers.py`, `inspect.py`,
`compare-cases.py`, `build-verdict-set.py`, `build-batch-list.py`). Sweep outputs under `data/`.

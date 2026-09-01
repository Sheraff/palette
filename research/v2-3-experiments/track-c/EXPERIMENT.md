# Track C — role and identity evidence wiring

Branch: `worktree-agent-a673a81d27c21f415`, now merged with trunk
`research/palette-0.9-checkpoint` at `c496827` (Track D's composite field domains + the eval
harness). All algorithm changes are in `research/v2-3/`; all tooling is in
`research/v2-3-experiments/track-c/`.

**Current state (round 4c, measured on trunk `f0d7705` = v2-2 + D + C + A):** 4 of 34 differ, and
every one of them carries a review verdict — `vvbrown` (preferred, strong), `disney` blue surface
(equal, strong), `skap` (preferred, acceptable), `nobs` (equal, strong). `krafty` is byte-identical
to trunk after round 4c. Off-panel `09/…fdddff2` remains fixed. See the round-4c section.

**Previous state (round 4b, measured on trunk `f0d7705` = v2-2 + D + C + A):** 5 of 34 differ —
`vvbrown`, `skap`, `nobs` (the mandate outcomes), `krafty` (attributed collateral), and `disney`
(the expected A-versus-C surface arbitration). All of A's other integrated outcomes are
byte-preserved, and the off-panel `09/…fdddff2` guardrail fix survives the composition. See the
round-4b section.

**Previous state (round 4, measured on trunk `b8cffce` = v2-2 + D + integrated C):** 5 of 34 differ —
`vvbrown` and `disney` reproduce the treatments human review called **preferred, strong**; `skap` and
`nobs` answer their reviewers' recorded requests unprompted; `krafty` is collateral on a
reviewed-strong case and is the round-5 review item. Off-panel, the arm **fixes** the guardrail case
`09/…fdddff2` (chromatic foreground reverts to near-white) and does not reach the other three.
See the round-4 section.

**Previous state (round 3):** 4 of 34 reviewed cases differ from trunk —
`knuckles` (reviewed **preferred, strong**), `artofficial` (reviewed **equal, strong**),
`disney` (reviewed **equal, acceptable**) and `vvbrown` (a 1/255 white representative shift).
Nothing else moves: `placebo`, `meteora`, `johns`, `orelsan`, `black`, `doja`, `havana`,
`horrorwood`, `loups` and the remaining 21 cases are byte-identical to trunk.
Sections 1–4 below record how the arm got there; the round-3 section records the refinement
that followed human review.

## What this track attacks

The postmortem tagged 11 of 34 cases `incomplete artwork identity` and attributed `johns` to
role-obligation capacity. Two identity systems existed side by side:

- `role-obligations.ts` builds `requiredRole`-carrying obligations, but its output only reached
  gradient transition-promotion tie-breaking.
- The winner's identity credit came from `buildIdentityObligationSelection` (signature-lane,
  role-less) feeding `base-scoring.ts` `identityEvaluation`, whose input type `{familyId, priority}`
  structurally could not express a required role.

Confirmed at code level before designing. Two further confirmations from instrumentation
(`diagnose.ts`, `probe.ts`, both in this folder):

- `candidate-materialization.ts:44-48` sorts obligations by descending priority number
  (least-important first). It feeds a dedupe set only, so it is inert; left untouched.
- The obligation shortlist is ranked by the strongest *single region's* signature-accent evidence.
  It contains no breadth term, which is exactly why `johns`' 13.0 %-population blue ranked fifth
  and was cut by the bound of four.

## Targets and regression subset

Targets (`johns` plus five of the eleven `incomplete artwork identity` cases whose per-case
diagnosis names the family that should have been carried, plus one role-polarity case):

| case | review | what the postmortem says should have been carried |
| --- | --- | --- |
| `johns` | weak fallback, incomplete identity | a major blue family, probably as accent |
| `elephunk` | weak fallback, incomplete identity | the main medium blue, probably as background |
| `meteora` | weak fallback, incomplete identity | black field, white foreground, khaki as accent |
| `skap` | weak fallback, incomplete identity | more than one chromatic family beside black/white |
| `vvbrown` | weak fallback, incomplete identity | the characteristic bright yellow |
| `slim` | unacceptable, incomplete identity | anything but the tiny cyan as global foreground |
| `greenday` | weak fallback | black field with white foreground, not the inverse |

Regression subset (all reviewed `strong`, spanning strata): `artofficial` (four-color flat),
`slipknot` (true two-color collapse), `muse` (gradient, four colors), `ybbb` (three-color,
surface collapsed), `toxicity` (four-color flat with saturated accent), `snarky` (saturated field).

The 34-case corpus was also run end-to-end (`full-corpus-diff.ts`) because subset-only evaluation
proved misleading: changes that were invisible on 13 cases moved 11 of 34.

## Hypotheses

### H1 — identity credit must be role-aware (`845e95e`, refined in `b1f4467`)

*Hypothesis.* A family only carries artwork identity when it is placed in a role its own evidence
supports. Wiring the field-conditional classifier into the selector's identity input should stop
treatments from claiming identity for a family they use in the wrong role.

*Changes.* `role-evidence.ts` now runs one classification pass serving both consumers and exports
`FamilyRoleRequirement` (family × field → required role + confidence). `base-scoring.ts` accepts
optional `roleRequirements` and grades credit: `roleMatchedIdentityCredit` (1) / `roleMismatchedIdentityCredit`
(0.35), reached from the role-agnostic baseline (1 foreground, 0.8 accent) *in proportion to the
classifier's confidence*. `winner-selection.ts` and `palette.ts` carry the requirements; the second
classification pass that `palette.ts` used to trigger is gone.

*Result.* Zero output change on all 13 subset cases. H1 alone is a structural prerequisite, not a
behavioural change: the identity term is capped at 0.05 utility and the credit differences it
creates are below the 0.005 ranking resolution.

*Note on the confidence scaling.* The first version applied the mismatch credit unconditionally.
That version *blocked* the `meteora` fix, because the classifier calls `meteora`'s khaki
`decisive-foreground` on the black field (confidence 0.34). Measured feature values explain why:
`typographyLikeGeometry`, `repetition`, `localContrast` and `compactness` all saturate at ≈ 1.0 for
every candidate family (the `aggregate` helper keeps the top four components), so the classifier
effectively reduces to *polarity agreement vs chroma*. It is not reliable enough to punish a
placement outright — hence confidence scaling.

### H2 — omission must cost, and capacity must not silently truncate (`b1f4467`)

*Hypothesis.* Coverage was `covered / sum over every obligation`, so every added obligation diluted
every treatment's coverage, and the rank-linear weight `max − p + 1` flattened as the list grew
(with seven obligations, covering p1+p2 scored 0.85 where covering p0+p1 scored 0.98). Capacity 4
then erased major families outright. Normalize by what a treatment could achieve, weight priority
so ratios do not flatten, and stop truncating majors.

*Changes.*
- `base-scoring.ts`: denominator is `achievableIdentityCredit` — the credit the best possible
  treatment could carry (one foreground plus one distinct accent), not the sum over all obligations.
- `base-scoring.ts`: priority weight is `1 / (priority + 1)`, the same weight the role-specific
  obligation system already used (the two systems previously disagreed).
- `policy.ts` / `palette-core.ts`: `bounds.identityObligations` 4 → 6, plus one reserved place for
  the broadest otherwise-unrepresented family (`identity.reservedMajorFamilyPopulationFraction` 0.06),
  recorded in the selection trace as `reservedMajorFamilyIds`.

*Result.* `meteora` flips to exactly the counterexample the postmortem named
(`#000000 #151108 #fafafa #a59073`): black background, white foreground, khaki as accent — the
reviewer's stated reading of the artwork. `johns`' blue does enter the obligation set through the
reserve (verified with `probe.ts`), but at priority 4 its weight is too small to overturn the red
accent's path advantage. Collateral on the full corpus is large (see below).

Intermediate arms, all recorded in `runs/`:
- `h2a-achievable-coverage` (normalization only, rank-linear weight): flipped `artofficial`'s accent,
  nothing else.
- `h1b-h2b-confidence-capacity`: fixed `meteora`, but **broke `toxicity`** (strong): the vivid red
  accent became near-black, because with seven rank-linear obligations two mid-priority families
  scored nearly as much as the top one. The harmonic weight restored `toxicity` exactly.

### H3 — identity coverage must reward distinct directions (`runs/h3-identity-role-separation`)

*Hypothesis.* Coverage counts covered obligations without asking whether the covered roles look
different. Two roles rendering nearly the same color do not carry two identity directions.

*Evidence that motivated it.* Raising `maximumIdentityGain` 0.05 → 0.06 (arm `h3-gain-006`) made
`johns` **worse**: the winner became `#0d181c #0d181c #cfd4d8 #f8fcfd`, a light-gray foreground with
a near-white accent, because covering two whitish obligations outscored keeping the red accent.
The same mechanism broke `black.jpg`'s reviewed two-color collapse under H2 alone
(`#575757/#575757 S+A+` → `#6e6e6e/#565656 S+A-`).

*Change.* `base-scoring.ts`: an accent earns identity credit only when it is at least
`identityRoleSeparation` (0.12 OKLab) away from the foreground.

An earlier variant that separated the *obligation set* instead (`identity.obligationSeparation`,
arm `h3-obligation-separation`) was output-neutral on the subset and did not prevent the pathology
(`johns`' two whites are 0.113 apart); it was reverted in favour of the rendered-color rule.

*Result.* The reviewed `black` collapse is restored, and the corpus-wide blast radius drops from
11 changed cases to 7. `doja`, `havana`, `horrorwood` and `orelsan` return to their reviewed
outputs. `knuckles` changes more than it did under H1+H2, which is the arm's worst side effect.

### Not pursued: rebalancing the fg/accent classifier

The brief suggested rebalancing the classifier so saturated typography is not auto-accented. The
measurements say the premise does not hold on this corpus: because `compactness`, `geometry`,
`repetition` and `localContrast` all saturate, the classifier over-calls **foreground**, not accent
(`meteora` khaki `fg=0.949 / ac=0.756`; `johns` blue `fg=0.765 / ac=0.786` ambiguous). Reducing the
accent chroma weight would push khaki further toward foreground and undo the `meteora` fix. The
useful finding is upstream: the aggregate over the top four components discards the family's overall
structure, so a 26 %-population illustration and a 1.4 %-population caption look identical to the
classifier. That deserves its own arm (feature de-saturation), not a weight tweak.

## Before / after

Subset (baseline = `c9395ac` = the reviewed checkpoint; final = H1 + H2 + H3). Gradient/midpoint
columns are constant except where noted; no midpoint was produced in either state for these cases.

| case | group | baseline | final | changed |
| --- | --- | --- | --- | --- |
| `johns` | target | `#0d181c #0d181c #f7f8fa #ff5a62` flat S+A- | identical | no |
| `elephunk` | target | `#022833 #022833 #f5fbd7 #a5c7c8` flat S+A- | identical | no |
| `meteora` | target | `#a48f72 #a48f72 #000000 #161109` flat S+A- | `#000000 #151108 #fafafa #a59073` flat S-A- | **yes** |
| `skap` | target | `#ffffff #ffffff #000103 #5d763c` flat S+A- | identical | no |
| `vvbrown` | target | `#fffffe #fffffe #080808 #584c1c` flat S+A- | `#ffffff #ffffff #080808 #584c1c` flat S+A- | representative only |
| `slim` | target | `#01040b #140e18 #37c2eb #56676f` gradient S-A- | identical | no |
| `greenday` | target | `#fefefe #fefefe #000211 #c13033` flat S+A- | identical | no |
| `artofficial` | regression | `#31305c #040325 #bdc1ca #fded9f` flat S-A- | `#31305c #040325 #bdc1ca #f5e20c` flat S-A- | **yes** |
| `slipknot` | regression | `#000000 #000000 #fbfbfd #fbfbfd` flat S+A+ | identical | no |
| `muse` | regression | `#000000 #026faa #edf6fb #82d1ef` gradient S-A- | identical | no |
| `ybbb` | regression | `#83080a #83080a #f8eeb3 #0d0b0e` flat S+A- | identical | no |
| `toxicity` | regression | `#b59e8e #805a33 #edebd2 #dd1434` flat S-A- | identical | no |
| `snarky` | regression | `#c7bf36 #c7bf36 #020c03 #fcfdf5` flat S+A- | identical | no |

Full 34-case corpus, H1 + H2 only (`runs/full-corpus-h1-h2.txt`): **11 of 34 changed** —
`artofficial`, `black`, `disney`, `doja`, `havana`, `horrorwood`, `knuckles`, `loups`, `meteora`,
`orelsan`, `placebo`. Notably `black` (strong, reviewed two-color collapse)
`#000000 #000000 #575757 #575757` S+A+ → `#000000 #000000 #6e6e6e #565656` S+A-.

Full 34-case corpus, final H1 + H2 + H3 (`runs/full-corpus-h1-h2-h3.txt`): **7 of 34 changed**.

| case | review | reviewed output | final output | reading |
| --- | --- | --- | --- | --- |
| `meteora` | weak fallback, incomplete identity | `#a48f72 #a48f72 #000000 #161109` flat S+A- | `#000000 #151108 #fafafa #a59073` flat S-A- | the intended fix |
| `artofficial` | strong | `#31305c #040325 #bdc1ca #fded9f` flat S-A- | `#31305c #040325 #bdc1ca #f5e20c` flat S-A- | same hue, denser yellow |
| `disney` | strong (tagged incomplete identity) | `#c72690 #c72690 #fbfdfc #f68121` flat S+A- | `#c72690 #c72690 #fbfdfc #2199d6` flat S+A- | orange accent → blue accent |
| `knuckles` | strong | `#bfb2c4 #9c99c4 #6c678f #d8cbdd` flat S-A- | `#beb2c6 #7b80a8 #d8cbdd #60aac5` flat S-A- | worst collateral: role structure changed |
| `placebo` | weak fallback, incomplete identity | `#607b76 #a0a39a #fbfdfa #111312` gradient S-A- | `#607b76 #a0a39a #fbfdfa #503d2c` gradient S-A- | accent near-black → brown |
| `loups` | weak fallback | `#fdd98d #fdd98d …` | `#fcd884 #fcd884 …` | representative shift only |
| `vvbrown` | weak fallback, incomplete identity | `#fffffe #fffffe …` | `#ffffff #ffffff …` | representative shift only |

`black`, `doja`, `havana`, `horrorwood`, `orelsan` and the remaining 22 cases are byte-identical to
the reviewed checkpoint.

## Honest assessment

- **H1: no measurable effect on its own.** It is correct plumbing (the two systems are now one pass,
  and `requiredRole` is enforceable), but the identity term is too small for role grading alone to
  move a winner. It should be judged as an enabler, not as a fix.
- **H2: one clean target fix, real collateral.** `meteora` becomes exactly the palette the reviewer
  described. But H1+H2 changed 11 of 34 cases, several reviewed `strong`; with H3 it is 7 of 34, of
  which 3 are strong (`artofficial`, `disney`, `knuckles`) and 2 are cosmetic representative shifts.
  Those changes are unreviewed: I did not judge them by taste, and the postmortem gives no per-case
  target for most of them. This is the main risk in the arm and the reason the review batch below is
  weighted toward changed strong cases.
- **H3: mitigation, not a fix.** It exists because measurement showed the strengthened objective
  rewarding redundant palettes, and it demonstrably repairs `black`, `doja`, `havana`, `horrorwood`
  and `orelsan`. It is the least-tested change here. Its `knuckles` output was the round-2 risk I
  flagged — human review then called that output the **preferred, strong** one, so the flag was
  wrong in the reviewer's direction. Round 3 replaced its threshold with a chromatic one.
- **`johns` was not fixed.** The capacity finding is real and is fixed (blue is now an obligation),
  but the winner does not change: the red accent leads by ≈ 0.029 utility, mostly accent-path, and
  identity can contribute at most 0.05 × coverage. Even blue at priority 0 leaves it short. Making
  identity strong enough to overturn it (`maximumIdentityGain` 0.06) produced a *worse* `johns`.
  Either the accent-path axis is overvalued for a tiny-but-high-contrast advantage (Track-adjacent),
  or the review must confirm that blue is genuinely preferred over red.
- **`elephunk`, `greenday`, `skap`, `slim` are untouched, as expected.** Their first failure is not
  identity credit: `elephunk` and `greenday` are collapse/field-ownership decisions, `slim` is
  foreground-path suitability, `skap` needs the omitted family to be carried by a *surface*, which
  the identity objective does not credit at all. Crediting field roles is the obvious next arm.
- **Determinism** verified on every arm (one image run twice, identical). Typecheck clean; the
  architecture test passes. Parity is expected to break on the changed cases and was not "fixed".
- **Overfitting risk.** `identityRoleSeparation = 0.12`, `identityChromaticSeparation = 0.01` and
  `reservedMajorFamilyPopulationFraction = 0.06` are values chosen from measured distances on this
  corpus, and the corpus is the development set. They are all parameters in `policy.ts` / the
  selector policy. The chromatic threshold is the one with an independent anchor (the family anchor
  radius); the other two are corpus-fitted and should be re-checked on unseen sources.
- **Round-3 caveat.** The `orelsan` swap appeared only in the full 34-case sweep, not in the 16-case
  working subset. Subset-only evaluation would have shipped it. Every future change on this arm must
  be swept over all 34.

## Round 3 — refinement after human review (`fcd7fa5`)

Verdicts received on batch `review-3-identity` (v2-2 versus the round-2 config):

| case | verdict |
| --- | --- |
| `knuckles` | Track C **preferred, strong** — the blue accent `#60aac5` praised for hue diversity; the collateral risk I flagged did not materialize |
| `artofficial` | equal, strong |
| `disney` | equal, only acceptable; Flo wants a surface **not** collapsed with the background |
| `meteora` | Track C preferred but only acceptable; the `#151108` surface "doesn't really feel like it belongs" — Flo named two acceptable arrangements, and Track A already produces the first |
| `placebo` | Track C **loses**: the baseline dark accent `#111312` is stronger than `#503d2c` |

Both refinements narrow what may claim identity credit; neither adds a new mechanism.

**R1 — the obligation bound returns to 4 (`policy.ts`).** Diagnosis (`diagnose.ts placebo`):
`placebo`'s brown accent is `family-4189`, admitted at priority 4 *only* because H2 raised the
bound from 4 to 6, with a mid-tier signature score (0.66) and 3.5 % population. Its credit
(coverage 0.83 versus 0.71) was worth ≈ 1 utility level — exactly the margin by which it beat the
dark accent. The capacity raise was never the mechanism that mattered: the *reserved* place for the
broadest otherwise-unrepresented family is what fixed the `johns` capacity finding, and that stays.
Restoring the bound returns `placebo` to `#111312` and returns `meteora` to its baseline treatment,
which cedes that case to Track A instead of competing with it — the required outcome, since my
mechanisms cannot reach either arrangement Flo named (both differ from the current winner only in
non-identity axes: surface fidelity and economy, where coverage is identical).

**R2 — identity directions are chromatic (`base-scoring.ts`).** With a four-obligation set, `johns`
flipped to `#0d181c #0d181c #cfd4d8 #f8fcfd`: a light-gray foreground plus a near-white accent,
covering two obligations that are the same color direction. The H3 total-distance rule missed it by
0.001 (0.121 versus the 0.12 threshold). Measured chroma-plane separations
(`chromatic-distances.ts`) show why a total distance cannot express this:

| pair | chromatic | total |
| --- | ---: | ---: |
| `johns` pathological `#cfd4d8`/`#f8fcfd` | 0.0043 | 0.1212 |
| `black` reviewed collapse `#6e6e6e`/`#565656` | 0.0000 | 0.0851 |
| `placebo` reviewed `#fbfdfa`/`#111312` | 0.0022 | 0.8076 |
| `orelsan` reviewed `#e9dec8`/`#6c5f57` | 0.0174 | 0.4084 |
| `knuckles` preferred `#d8cbdd`/`#60aac5` | 0.0896 | 0.1815 |
| `artofficial` preferred `#bdc1ca`/`#f5e20c` | 0.2009 | 0.2199 |

An accent must now clear `identityChromaticSeparation` in the OKLab chroma plane as well as the
existing total-distance rule. The first value tried, 0.05, blocked `orelsan`'s reviewed pairing and
swapped its foreground and accent — a fresh regression on a `strong` case, caught by the full sweep.
0.01 is the value that separates the pathologies (≤ 0.0043) from real pairings (≥ 0.0174); it is an
order of magnitude below the family anchor radius (0.058), so colors closer than that cannot be
distinct chromatic families at all. `orelsan` is byte-identical to trunk again.

**Round-3 sweep (trunk + refined config, `runs/full-corpus-round3-refined.txt`): 4 of 34 changed.**

| case | trunk | refined | status |
| --- | --- | --- | --- |
| `knuckles` | `#bfb2c4 #9c99c4 #6c678f #d8cbdd` | `#beb2c6 #7b80a8 #d8cbdd #60aac5` | reviewed **preferred, strong** |
| `artofficial` | `#31305c #040325 #bdc1ca #fded9f` | `#31305c #040325 #bdc1ca #f5e20c` | reviewed equal, strong |
| `disney` | `#c72690 #c72690 #fbfdfc #f68121` | `#c72690 #c72690 #fbfdfc #2199d6` | reviewed equal, acceptable |
| `vvbrown` | `#fffffe #fffffe …` | `#ffffff #ffffff …` | 1/255 representative shift |

Intermediate arms: `runs/r1-bound4-reserve.json` (bound 4, chromatic rule absent — `johns` breaks),
`runs/r2-chromatic-separation.json` (0.05 — `orelsan` breaks),
`runs/r3-chromatic-001.json` (final), `runs/full-corpus-round3-chromatic-005.txt` (the 5-case sweep
that caught `orelsan`).

### Can this mechanism give `disney` a distinct surface? No — not without force.

Identity coverage credits only foreground and accent, so nothing in this track pushes toward a
distinct surface; crediting surface placement would be the forcing move, and it is also the wrong
move (it would have rewarded `meteora`'s `#151108` surface, the arrangement Flo rejected).

What the probe does show, for the ranking/collapse track: non-collapsed candidates are close behind
the current `disney` winner (`relationUtility` 0.8015). The nearest are
`#74c044 #f68121 #fbfdfc #c72690` (0.7902) and `#74c044 #2199d6 #fbfdfc #c72690` (0.7859) — both
keep the white foreground and use green/blue field colors with a magenta accent, which is close to
what Flo described. Both lose on quality utility, not on identity: a collapse counterfactual
(postmortem item 4) would decide them, not this arm.

## Round 4 — the identity-overturn arm

Mandate after batch 5: make identity evidence able to overturn quality-utility margins of the
measured magnitude, evidence-gated, with every reviewed outcome preserved. Verdicts driving it:
`vvbrown` yellow accent **preferred, strong**; `disney` four-color non-collapsed **preferred,
strong**; `skap` four-color acceptable with the principle *"I'm not sure we should be spending both
surface and accent on the green hue"*; `johns` current output preferred (its blue is a candidate
availability problem, out of this arm).

### The blocker was not the size of the identity term

Instrumentation (`probe.ts`, now reporting source eligibility and Pareto membership) found the
reviewed `vvbrown` yellow treatment ranked **first** in the full domain on relation utility and was
still not selected: it is **Pareto-dominated on the quality axes**, and `winner-scoring.ts` builds
the frontier from those axes alone. A dominated candidate can never win, so no identity weight —
however large — could ever have selected it. `base-scoring.ts` already treats identity coverage as
a dominance dimension; the winner stage did not. That asymmetry was the whole blocker.

### What the arm changes

1. **Identity is a dominance dimension** (`winner-scoring.ts`). A candidate carrying strictly more
   *authorized* identity is not dominated by one carrying less. Quality axes and weights are
   untouched, so this composes with quality-axis work rather than competing with it.
2. **Authorized identity** (`base-scoring.ts`). Authority is earned only by carrying distinct,
   genuinely chromatic identity directions, and only the coverage those directions themselves carry
   is authorized. Neutral coverage, or two roles on one hue, earns the ordinary gain and no
   authority. Directions are counted against the **whole palette**, so an accent that repeats the
   field's hue adds nothing — the reviewer's `skap` principle, which also protects `ybbb`.
3. **The surface can carry identity** (`surfaceIdentityCredit`), gated by the same distinctness rule
   against the background — required for the reviewed `disney` and `skap` treatments, and blocked on
   `meteora`'s rejected `#151108` surface by the total-distance rule.
4. **Authorized identity breaks relation-utility ties** before quality utility. Ranking is quantized
   at 0.005, and `disney`'s reviewed treatment led by 0.0024 — inside one level, where quality
   utility silently decided it.
5. **Guardrails.** The foreground never contributes authority (every human-preferred treatment
   carries its chromatic identity in field and accent while text stays near-neutral), and a
   chromatic family placed as foreground earns only accent-level credit unless its own role evidence
   says foreground.

New parameters, all in the selector policy: `surfaceIdentityCredit` 0.6, `identityDirectionChroma`
0.06, `identityDirectionFullChroma` 0.09, `identityDirectionHueDegrees` 40,
`identityDirectionAuthorityTarget` 2, `authorizedIdentityGain` 0.08.

### Round-4 sweep (trunk `b8cffce` + arm): 5 of 34 changed

| case | trunk | arm | status |
| --- | --- | --- | --- |
| `vvbrown` | `#ffffff #ffffff #080808 #584c1c` | `#fffffe #fffffe #080808 #e6e622` | **reviewed preferred, strong** |
| `disney` | `#c72690 #c72690 #fbfdfc #2199d6` | `#74c044 #2199d6 #fbfdfc #c72690` | **reviewed preferred, strong** (exact) |
| `skap` | `#ffffff #ffffff #000103 #5d763c` | `#ffffff #5d763c #000103 #be814b` | new: two hues across surface and accent, which is what the `skap` note asked for |
| `nobs` | `#f6ffff #f6ffff #a1162d #0695fd` | `#f6ffff #f2f626 #a1162d #0695fd` | new: a vivid surface, which is what the `nobs` review asked for |
| `krafty` | `#050306 #680b3a #f7a223 #eb0a8a` | `#050306 #680b3a #eb0a8a #f7a223` | **collateral on a reviewed-strong case** — foreground and accent swap |

The other 29 — including `johns`, `meteora`, `placebo`, `orelsan`, `knuckles`, `artofficial`,
`greenday`, `elephunk`, `doja`, `loups`, `black`, `muse`, `toxicity`, `ybbb` — are byte-identical to
trunk.

`krafty` is honest collateral and I could not remove it principledly. Both treatments use the same
four colors; the arm prefers the orange accent because orange is a hue the palette does not
otherwise show, while the trunk accent repeats the surface's magenta. That is exactly the reviewer's
`skap` principle applied to a case the reviewer already called strong. The foreground guardrail does
not bite because the role classifier calls the pink family *decisively* foreground — the saturation
defect documented in round 1. Lowering `authorizedIdentityGain` to 0.06 does not recover `krafty`
and loses `nobs`, so the parameter is not the lever.

### Off-panel generalization checks (tuned on nothing)

| source | review of trunk | arm output | reading |
| --- | --- | --- | --- |
| `09/…fdddff2` | trunk regressed: teal **foreground** `#15a6a9` + yellow accent; Flo preferred the baseline near-white foreground + teal accent | `#000000 #21203f #f5f7f4 #15a6a9` | **fixed** — near-white foreground `#f5f7f4` with the teal accent, the arrangement Flo preferred. The guardrail against chromatic foregrounds generalizes off-panel. |
| `03/…89643a.jpg` | strong; gold-orange writing suggested as accent | `#050a06 #121e10 #cfd4c0 #51613a` | unchanged direction: olive accent, no gold. Not fixed. |
| `11/…2b222b02` | acceptable; accent would be better as a red hue | `#0e1317 #2d4a84 #f5f9fa #8d9fc3` | not fixed: the accent stays blue-grey. |
| `05/…5e5a5ff6` | weak fallback; gray `#86858b` accent on a many-colored artwork | `#eff3f6 #d6d7dc #121117 #86858b` | not fixed: the gray accent survives. |

One of four off-panel cases improves, and it is the one the coordinator flagged as the guardrail —
the case where the mechanism could have made things worse. The three unfixed ones all want a
*small vivid* family as accent that is not currently reaching the obligation set at all; that is the
same candidate-availability class as `johns` (`representativesPerRole = 2`), not a scoring problem
this arm can reach. Off-panel sources were used only as checks: no parameter was chosen from them.

## Round 4b — ported onto Track A's winner ranking (trunk `f0d7705`)

Track A's winner-ranking refinements landed while round 4 was measured, and they rewrote
`winner-scoring.ts`: hue-aware gradient sign guard, field-axis-neutral promotion envelope,
`collapsedSurfaceFidelity` 0.45, an evidence-strength claim axis, and — independently — a parked
`identityAuthority` hypothesis that makes **raw coverage** guard domination and decide the utility
band. Everything below is measured on the composed code.

### The port is semantic, and it keeps A's hypothesis intact

A's `identityAuthority` and my arm attack the same two defects; they differ in what earns the
authority. Raw coverage is equally available to a treatment that covers two near-neutral obligations
or spends two roles on one hue — the measured cause of the light-grey-on-near-white `johns` and of
`black`'s broken two-colour collapse. So the port does not repurpose A's flag: it adds
`authorizedIdentity` beside it, documented as the alternative, with A's flag left exactly as
integrated (`false`).

| place | A's `identityAuthority` (parked) | this arm's `authorizedIdentity` (on) |
| --- | --- | --- |
| gain | `0.10 × coverage`, replacing the wave-1 gain | wave-1 gain, which already carries the authorized bonus |
| domination | raw `identityCoverage` guards it | `utilityLevel(identityAuthorizedGain)` guards it |
| utility band | raw `identityCoverage` decides it | `utilityLevel(identityAuthorizedGain)` decides it |

`compareEvaluations` was restructured from A's ternary into sequential guarded steps so either flag
composes without changing the other's semantics, and `evaluateTreatment` keeps A's gain switch while
carrying `identityAuthorizedGain` through.

### One real conflict found and fixed: `placebo`

The first composed sweep broke A's integrated `placebo` field (`#6c8a8a #86a5aa` → `#607b76
#a0a39a`). Cause: surface identity credit was gated only on *distinctness* from the background, and
`placebo`'s near-neutral surfaces sit either side of that gate, so my credit decided a field-ranking
question that belongs to A's axes. Fix, in the arm's own terms: **a surface carries identity only
when it is a chromatic direction in its own right** (`chroma ≥ identityDirectionChroma`), not when it
is merely a lighter or darker shade of the field. `placebo` is byte-identical to trunk again, and the
gate additionally protects `meteora`'s rejected `#151108` surface by a second independent rule.

### Composed sweep (trunk `f0d7705` + arm): 5 of 34 changed

| case | trunk (A+D+C) | arm | status |
| --- | --- | --- | --- |
| `vvbrown` | `#fffffe #fffffe #080808 #584c1c` | `#ffffff #ffffff #080808 #e6e622` | mandate: reviewed **preferred, strong** |
| `skap` | `#ffffff #ffffff #000103 #5d763c` | `#ffffff #5d763c #000103 #be814b` | mandate: two hues across surface and accent |
| `nobs` | `#f6ffff #f6ffff #a1162d #0695fd` | `#f6ffff #f2f626 #a1162d #0695fd` | mandate: a vivid surface, as the review asked |
| `krafty` | `#050306 #680b3a #f7a223 #eb0a8a` | `#050306 #680b3a #eb0a8a #f7a223` | attributed collateral → review |
| `disney` | `#74c044 #f68121 #fbfdfc #c72690` | `#74c044 #2199d6 #fbfdfc #c72690` | **expected arbitration delta**: A's batch-4 strong (orange surface) versus this arm's batch-5 strong (blue surface); the two strongs were never compared directly |

All of A's other integrated outcomes are byte-preserved: `greenday`, `elephunk`, `doja`
(`#fd3d86` surface), `placebo` (`#6c8a8a #86a5aa`), `meteora`, `infected`, `horsley`, `orelsan`,
`birdsofprey` (pink accent and midpoint), `loups`, `johns`, plus the C-integrated `knuckles` and
`artofficial`. 29 of 34 identical.

### Off-panel re-verification on the composed code

| source | arm output | reading |
| --- | --- | --- |
| `09/…fdddff2` | `#000000 #21203f #f5f7f4 #15a6a9` | **still fixed** — near-white foreground with the teal accent, the arrangement Flo preferred |
| `03/…89643a.jpg` | `#050a06 #121e10 #cfd4c0 #51613a` | unreached |
| `11/…2b222b02` | `#0e1317 #2d4a84 #f5f9fa #8d9fc3` | unreached |
| `05/…5e5a5ff6` | `#e8ebf0 #d1d4d9 #121117 #86858b` | unreached (field representatives moved with A's refinements; the gray accent survives) |

The three unreached cases all want a small vivid family that never enters the obligation set — the
`johns` candidate-availability class (`representativesPerRole = 2`), which no scoring change reaches.

Determinism verified on the composed code (one image twice, identical); typecheck clean; both
architecture tests pass.

## Round 4c — a swap out of the foreground is a foreground claim

Batch-7 closed every open item except one: `disney` orange-versus-blue **equal, strong** (arbitration
closed, the arm's blue integrates), `skap` two-hue **preferred, acceptable**, `nobs` vivid surface
**equal, strong** — and `krafty` **rejected**, incumbent strong, with a principle: *"The text of the
artwork is Golden Mango, so the foreground of the palette should also be golden mango; using
Self-Love as the foreground does not work."*

### Why the classifier fix (direction b) could not have worked

Measured on `krafty` (`diagnose.ts krafty`): both families are labelled **`ambiguous`
/ simultaneous-role-support** — golden `family-8623` and pink `family-6960`. The classifier is not
miscalling the pink *decisively* foreground here, so no chroma rebalance of the label rule reaches
this case, and rebalancing would move `requiredRole` labels for every family on every field and
perturb reviewed outcomes broadly. The discriminating signal is already present and unused: the
field-conditional **foreground score**, golden `0.947` versus pink `0.783` — a 0.164 gap where the
family-level typography observation separates them by only 0.02.

### What actually bought the swap

Coverage is symmetric between the two arrangements (both carry the same two obligations, `p0` and
`p1`, at the same credits: 0.857 either way). The swap was bought entirely by **authority
asymmetry**: since round 4 the foreground contributes no authority, so a hue-novel family is worth
more as an accent than as the foreground — a standing incentive to demote the artwork's own text out
of the text role. `krafty` is that incentive firing on a case where the text family is also the
hue-novel one.

### The rule (direction a)

`base-scoring.ts`: authority is withheld from a non-foreground placement whose family has materially
stronger foreground evidence (`identityForegroundClaimMargin`, 0.04 — one evidence level) than the
family the treatment actually made its foreground. Coverage is untouched; only the authority that
lets identity overturn a quality margin is denied. Moving a family out of the foreground is a
foreground claim by whatever replaces it, and it must be justified as one.

`role-evidence.ts` now carries `foregroundEvidence` for **every** family, not only obligation
families, because the comparison is against whichever family the treatment made its foreground —
often not an obligation at all (`vvbrown`'s black text, for instance, which is why `vvbrown` keeps
its authority).

### Final sweep (trunk `f0d7705` + arm): 4 of 34, all reviewed

| case | trunk | arm | verdict |
| --- | --- | --- | --- |
| `vvbrown` | `#fffffe #fffffe #080808 #584c1c` | `#ffffff #ffffff #080808 #e6e622` | **preferred, strong** |
| `disney` | `#74c044 #f68121 #fbfdfc #c72690` | `#74c044 #2199d6 #fbfdfc #c72690` | **equal, strong** (arbitration closed) |
| `skap` | `#ffffff #ffffff #000103 #5d763c` | `#ffffff #5d763c #000103 #be814b` | **preferred, acceptable** |
| `nobs` | `#f6ffff #f6ffff #a1162d #0695fd` | `#f6ffff #f2f626 #a1162d #0695fd` | **equal, strong** |

`krafty` is byte-identical to trunk. So are all of A's integrated outcomes (`greenday`, `elephunk`,
`doja`, `placebo`, `meteora`, `infected`, `horsley`, `orelsan`, `birdsofprey`, `loups`, `johns`) and
the C-integrated `knuckles`/`artofficial` — 30 of 34 identical, and every one of the 4 changes
carries a review verdict.

Off-panel on this code: `09/…fdddff2` still lands on `#000000 #21203f #f5f7f4 #15a6a9`, the
near-white-foreground arrangement Flo preferred. `03/`, `11/`, `05/` unchanged and still unreached
(the `johns` candidate-availability class). Determinism verified; typecheck clean; architecture
tests pass.

## Round 5 — identity-direction diversity in obligation *nomination*

Track C's earlier rounds established that identity directions must be chromatic and hue-distinct in
the winner objective. This round applies the same principle one stage earlier, where the directions
are *nominated*, on trunk `d5f2003` (v2-2 + D + C + A + B + E).

### The defect, confirmed on `05/…5e5a5ff6`

Track E measured it; `diagnose.ts offpanel-05` reproduces it exactly. All four obligation slots go to
near-neutral families — chroma `0.008`, `0.014`, `0.023`, `0.006` at lightness `0.62`, `0.18`, `0.27`,
`0.34` — which the `0.025` material-distance dedup keeps apart because they are separated by
*lightness*, not by direction. The artwork's vivid families (`family-6942` chroma `0.234`,
`family-7783` `0.188`, `family-5993` `0.142`) are never nominated, so no chromatic accent can be
carried and the reviewed gray `#86858b` accent is the only thing available.

### What this arm does — and deliberately does not do

`policy.ts` gains `identity.maximumNeutralObligations` (2) and `identity.neutralObligationChroma`
(0.06, the same threshold the winner objective already uses to decide whether a color is a
direction). `buildIdentityObligationSelection` skips a near-neutral candidate once the quota is full,
recording it in the trace as `neutralQuotaOmittedFamilyIds`.

Slots freed this way are filled by **the next candidates in the artwork's own evidence order**.
Nothing is promoted by fiat and no evidence measure is substituted: this is Track E's revision-2 line
(*mark evidence repairs a handicap, it must not confer an entitlement*) respected from the other
side — the rule only declines to spend a fourth slot restating a direction the shortlist already
carries twice. `placebo`, whose four slots are two neutrals plus two browns, is untouched by
construction, which is what the guardrail required.

### Results

**Reviewed corpus: 0 of 34 changed.** Every reviewed outcome is byte-identical, including `placebo`'s
dark accent, `krafty`, `slim`, `disney`, `vvbrown`, `skap`, `nobs`, `meteora` and `johns`. The arm's
entire effect is off-panel.

**Off-panel, attributed by ablation** (`maximumNeutralObligations: 4` restores trunk exactly):

| source | trunk | arm | attribution |
| --- | --- | --- | --- |
| `05/…5e5a5ff6` | `#eff3f6 #d6d7dc #121117 #86858b` | `#eff3f6 #d6d7dc #121117 #ee231f` | **target reached** — the gray accent becomes one of the artwork's vivid reds; caused by the quota |
| `03/…89643a.jpg` | `#050a06 #121e10 #cfd4c0 #51613a` | `#050a06 #21331b #cfd4c0 #51613a` | surface moves to a lighter green of the same family direction; caused by the quota — the one collateral, and the review item |
| `11/…2b222b02` | `#0e1317 #2d4a84 #f5f9fa #8d9fc3` | identical | unreached |
| `09/…fdddff2` | `#000000 #21203f #f5f7f4 #15a6a9` | identical | unchanged; the near-white foreground guardrail holds |

### `11` and `09`: why this arm cannot reach them, with evidence

`11`'s nomination is **already correct**: its obligations are `p0` neutral `0.018`, `p1` `0.054`,
`p2` `0.074`, `p3` red-hue `0.089` — only two near-neutrals, so the quota does not bite (the ablation
confirms: byte-identical). Two red-hue families are already nominated; the blue-grey `#8d9fc3` wins
the accent on priority-weighted coverage and quality. Reaching the red is a **ranking** question.

Two ranking-side mechanisms were measured and **rejected**:

- *Within-evidence-level diversity tie-break* (prefer a chromatic family over a neutral at equal
  evidence level — never crossing levels). It did not produce a red accent on `11`, and it perturbed
  `11` further (background, foreground and the midpoint all moved). Reverted.
- *Reducing identity credit for a near-neutral accent.* Not implemented: by inspection it removes
  credit from exactly `placebo`'s reviewed-strong `#111312`, the outcome the brief names as the
  guardrail. This is the same trap as Track E's revision 1, approached from the credit side.

`09` wants a red **surface**. Its obligation set contains no red family at all (`p0` teal `0.107`,
`p1` yellow `0.165`, `p2` orange `0.157`, `p3` near-neutral, `p4` black) — the reds are not in the
signature lane, so this is candidate availability plus field selection, not nomination diversity.
Reported, not forced.

### Proposed review items

1. `05/…5e5a5ff6` — trunk gray `#86858b` accent versus the arm's `#ee231f`. The case was reviewed
   weak-fallback precisely for the gray accent on a many-colored artwork.
2. `03/…89643a.jpg` — trunk `#121e10` surface versus the arm's `#21331b`. Same direction, lighter;
   the only collateral, on an off-panel case reviewed strong.

## Human review

### Batch `review-3-identity` (round 2 config) — complete

Proposed and reviewed: `meteora`, `knuckles`, `artofficial`, `disney`, `placebo`. Verdicts and the
resulting refinement are in the round-3 section above.

### Batch 7 (round-4b outputs) — complete

`disney` orange-versus-blue **equal, strong** (arbitration closed in favour of integrating the arm's
blue), `skap` **preferred, acceptable**, `nobs` **equal, strong**, `krafty` **rejected** — resolved
by round 4c, which restores the incumbent through the foreground-claim rule rather than a special
case. No item in the arm is now unreviewed.

### Superseded: round-5 proposal

0. `disney` **arbitration** — A's integrated `#74c044 #f68121 #fbfdfc #c72690` (batch-4 strong)
   versus this arm's `#74c044 #2199d6 #fbfdfc #c72690` (batch-5 strong). Same field green, same white
   foreground, same magenta accent; orange surface versus blue surface. Two strong verdicts that were
   never compared directly.

### Round-5 items from the arm itself — 3 items

1. `krafty` — trunk `#050306 #680b3a #f7a223 #eb0a8a` versus arm `#050306 #680b3a #eb0a8a #f7a223`.
   Same four colors, foreground and accent swapped. This is the arm's only collateral on a
   reviewed-strong case, and the verdict decides a real principle conflict: the reviewer's own
   "don't spend two roles on one hue" (which prefers the arm's orange accent, since the trunk accent
   repeats the surface's magenta) against the existing strong verdict.
2. `skap` — trunk `#ffffff #ffffff #000103 #5d763c` versus arm `#ffffff #5d763c #000103 #be814b`.
   The reviewer asked for more than one hue and specifically not two roles on the green; the arm puts
   moss on the surface and a tan accent beside it.
3. `nobs` — trunk `#f6ffff #f6ffff #a1162d #0695fd` versus arm `#f6ffff #f2f626 #a1162d #0695fd`.
   The `nobs` review asked for one of the vivid colors as a surface; this is that, unprompted.

`disney` and `vvbrown` need no further review: the arm reproduces the treatments already reviewed
**preferred, strong**, `disney` exactly.

### Superseded: round-4 batch (all four answered in batch 5)

This arm now produces **no unreviewed output changes**: all three substantive differences from trunk
(`knuckles`, `artofficial`, `disney`) already have verdicts, and no case regressed. The open
questions are therefore alternative comparisons that decide whether this track should be pushed
further, and they are cheap to answer:

1. `johns` — current `#0d181c #0d181c #f7f8fa #ff5a62` versus the available blue-accent candidate
   `#0d181c #0d181c #f7f8fa #365b90`. The postmortem says a major blue should be carried; the blue is
   now an obligation (via the reserve) but loses by ≈ 0.029 utility, mostly accent path. A verdict
   for blue justifies letting identity overturn a path advantage; a verdict for red closes the case.
2. `disney` — current collapsed `#c72690 #c72690 #fbfdfc #2199d6` versus the distinct-surface
   candidate `#74c044 #2199d6 #fbfdfc #c72690`. Flo asked for a non-collapsed surface; this is the
   nearest one in the domain. It is a collapse-counterfactual question for the ranking track, not
   for this arm.
3. `vvbrown` — current `#ffffff #ffffff #080808 #584c1c` versus `#ffffff #ffffff #080808 #e6e622`.
   The reviewer's `incomplete artwork identity` complaint names the bright yellow; the yellow
   candidate trails by only ≈ 0.002 relation utility. A verdict here tells us whether the identity
   term is still too weak, which is the single most useful number for this track.
4. `skap` — current `#ffffff #ffffff #000103 #5d763c` versus `#ffffff #bacd36 #000103 #5e753d` (the
   postmortem's four-color alternative). It tests whether a *surface* can carry identity, which is
   the mechanism this arm deliberately does not have.

## Reproducing

```sh
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/run-eval.ts <label>
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/full-corpus-diff.ts
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/diagnose.ts meteora johns
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/probe.ts meteora \
  --background=family-220 --foreground=family-10804 --accent=family-7277
node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/chromatic-distances.ts
node_modules/.bin/tsc -p research/v2-3/tsconfig.json
node --no-warnings --experimental-strip-types --test research/v2-3/test/architecture.test.ts
```

The artwork files are not committed; set `TRACK_C_IMAGES_ROOT` if `images/` in the working tree does
not hold them (the scripts fall back to the main checkout automatically).

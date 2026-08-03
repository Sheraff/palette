# V3 Phase 0 — Working Decisions

**Status:** working decisions, discussed 2026-08-02, **updated 2026-08-03 at the close of Phase 0.**
Updated as discussions settle.
**Scope:** input policy · output contract · metrics · corpus/legacy data · oracle label semantics ·
measured resolution floors. Referenced from `V3_PLAN.md` §6.
**Companions:** `data/decisions/decisions.json` (standing decision records, recheckable against the
warehouse) · `PHASE_0_LOOSE_ENDS.md` (every deliberately-open item, with owner and revival
condition). Where a decision here has a record, the record carries the evidence and the caveats;
this document carries the rule.

---

## 1. Input policy

**The palette attaches to the file, not the artwork.** A rendition genuinely lacking
information (a small accent blended away at low resolution) cannot owe us that information.
What attaches to the *artwork* is an expectation: renditions should mostly agree, and
disagreements should be **explainable by genuine information loss, not chaos**. The
cross-rendition metric classifies each disagreement: *informed* (the differing role's support
falls below resolvability at the smaller size — fine and expected) vs *chaotic* (both
renditions had the same information; the pipeline diverged — the robustness failure). Target:
chaotic → ~0.

- **No resampling, ever.** The algorithm processes native resolution. Never upscale.
  Downscale-above-W is at most a *future performance optimization*, admissible only with
  measured proof of palette-equivalence above W. (Not to be confused with the oracle's 640 px
  normalization, which is label-production policy, not algorithm policy.)
- **Pinned decoder**, versioned input-preprocessing, version stamped on every verdict.
- **Resolution agnosticism as a design constraint.** All *content* statistics scale-free
  (area fractions, normalized coordinates — never raw pixel counts). Absolute pixel constants
  permitted only for genuinely pixel-scale phenomena (sensor/compression noise floors), each
  individually justified and tested under the resolution ladder. The
  informed-vs-chaotic metric is the empirical detector for violations.
- **Transparency: resolved by measurement (2026-08-02).** The sharded corpus is 100% JPEG
  (checked exhaustively by magic bytes) — no transparency. `music-artworks/` has 797 PNGs with
  real transparent pixels; visual inspection shows they are **not album artwork** — disc scans
  (circular cutouts, ~26–31% transparent) and artist press-photo cutouts (59–89% transparent).
  *Those two ranges are **cluster descriptors from visual inspection, not measured bounds***
  (noted 2026-08-03): the survey's actual transparent-fraction range is 0.40%–100%, with 184 files
  in 26–31% and 282 in 59–89%. The policy does not depend on them — it excludes all
  real-transparency files regardless — but they should not be read as bounds.
  Policy: exclude all real-transparency files from the album-artwork candidate set (both
  corpora then fully opaque); an input with genuinely transparent pixels is flagged loudly,
  never silently flattened. Disc scans also exist as opaque JPEGs — the oracle's
  `physical_media_scan` question covers those. Per-file data:
  `research/v3/data/source-surveys/pixel_results.json` (committed copy).

## 2. Output contract

- Roles `{background, surface, foreground, accent}` (flat colors, exact source pixels) +
  `gradient: null | {stops: [2..4]}` (source pixels) — stops decoupled from role colors.
- **Guide-stop semantics for stops 3–4.** A 3rd stop is allowed when the artwork genuinely has
  a 3-color linear gradient. Stops 3–4 are otherwise *guides*: they exist only to pull the
  rendered OKLab interpolation onto the artwork when the 2-stop straight line demonstrably
  passes through off-artwork colors. Never to expand colorspace coverage or fit a metric.
  Curvature carries a banding cost when rendered, so the winning gradient is the **flattest
  path that stays on-artwork** — excursion reduction justifies a stop; meandering is forbidden.
- **Geometry is opportunistic.** Detection is geometry-agnostic (linear, radial, conic — all
  publish a t-parameterized color path; the consumer renders it as a 135° linear gradient). An
  optional `geometry` field is populated only when fitting computed it anyway; never computed
  for the sake of the output.
- **Explicit collapse flags** (`surfaceCollapsed`, `accentCollapsed`) — makes collapse
  countable instead of implicit hex equality.
- **Metadata block:** algorithm version, preprocessing version, input content hash, source
  rendition + processed size. This is what keeps every verdict permanently scopable.
- **The review-UI preview renderer is part of the contract** — gradient verdicts are verdicts
  about a rendered ramp; pin the renderer alongside the schema.
- **Minimum-contrast user parameters — always set, never "none":** `minTextContrast`
  (foreground vs background, surface, and every published stop) and `minAccentContrast`
  (accent vs same — accent is not text; its stakes are lower and it gets its own knob). Each
  parameter's **default value = its minimum value = an experimentally determined ε** near
  zero, expressed in raw pre-clamp APCA units, inside the range that Lc clamps to 0
  (|raw| < ~10). Callers can raise the floor, never lower it below ε. API surface: the public
  unit is Lc, evaluated internally as `max(requested_raw, ε_raw)` — necessary because the
  default/minimum lives below Lc's expressible range (its dead band in (0, 7.3)).
  **The stop scope is enforced as of 2026-08-03** (`I4.stop-below-contrast-floor` in
  `src/contract/invariants.ts`): until then the invariant checked only background and surface,
  so a foreground that vanished against a published stop published clean, and the "and every
  published stop" above was documentation with no enforcement path. `minAccentContrast` does
  **not** extend to stops today and is pinned by test as such — whether it should is on the
  reviewer queue, not decided here. Recorded as
  `d-2026-08-03-min-text-contrast-covers-published-stops`.
  Along a gradient: the **indistinct fraction** (length of ramp below
  the bar, computed on raw values to avoid the zero-clamp phantom-flip artifact) — floor +
  max-fraction parameter shape; exact defaults open, pathology-census discussion. With stops
  now enforced, the ramp **interior** is the only part the contract does not police.
- **Where parameters act is deliberately NOT decided** — "winner-stage repair" presumes
  v2-3's shape. The paradigm-neutral requirement, which becomes a bake-off criterion:
  (a) parameters at defaults → byte-identical to the unparameterized algorithm;
  (b) enabling a floor may change only artworks that actually violate it — zero collateral.

## 3. Metrics

- **One ruler.** A single same-color *rule* used everywhere (agreement, movement,
  distinctness), in Euclidean OKLab distance. **Calibrated over two rounds (2026-08-02/03,
  criterion "register-as-same", **152 unique answers** funding the freeze record, of which
  **140 same-colour items were answered** and **130 are fitted points** — 120 same-colour + 10
  accent; controls clean, repeat consistency 63%)
  and FROZEN** (`d-2026-08-03-same-color-bar-freeze`, on the calibration-consequence
  analysis): **a single threshold was REFUTED** — the frozen pooled rounds-1+2 values are
  dark-neutral **0.00932** (CI 0.00764–0.01137), dark-saturated **0.01502**, light-neutral
  **0.01627**, light-saturated **0.02293**; both ends exclude the pooled 0.01535
  (metrics-only reference, never the gate's bar). The ruler is **region-dependent**
  (quadrant boundaries L 0.55 / C 0.05), `[REVIEWED]`, implemented as `sameColorBar(pair)`
  in the contract module — `src/contract/constants.ts` is the authority for the digits. The reviewer's
  eyes discriminate dark neutrals ~2× finer than OKLab distance predicts — v2-3's dark-toe
  complaint, quantified. Full data: `research/v3/data/calibration/`.
- **Accent visibility is two-dimensional** (same round, part 2): at equal luminance a
  chromatic accent becomes functional at OKLab distance ≈0.0744 — the **middle of the
  0.06300–0.08796 separation band**, which is the honest bracket to quote. (The logistic
  fit's 95% CI of 0.052–0.106 is a **ridge artifact**: the data are completely separated, so
  the curve cannot pin the crossing and its interval describes the ridge rather than the
  uncertainty. Same fit object, different statistic — do not cite the CI as the bracket.
  0.0744 is the geometric mean of the band, exact to five digits.) The threshold itself
  stands — hue
  rescues, at ~5× the same-color bar. Invariant 4's accent clause is accordingly: violation
  requires BOTH |raw APCA| < ε_accent AND color distance < 0.0744 `[REVIEWED]`. The
  foreground clause is unchanged — text is luminance-driven, no color rescue (v2-3 reviewer
  verdict).
- **Gates** (binary, block integration): determinism (same buffer → byte-identical);
  invariance (relabeling, iteration order → zero changes); degenerate sweep (zero crashes);
  known-worse (zero outputs matching reviewed-bad palettes); contract-invariant validation
  (every published palette passes the contract's own invariants, corpus-wide);
  byte-identity for OFF mechanisms. Exhaustive for what is currently known; every new failure
  class gets asked "should this be a gate?".
- **Tracked metrics** (dashboards, drive iteration between review batches): cross-rendition
  agreement with informed/chaotic split (644 pairs + ladders); perturbation stability
  (±1-LSB dither, re-encode; v2-3 baseline 0/114 unmoved); warehouse concordance (parity
  tracker, never a fitting target); pathology census (list TBD); semantic concordance vs
  oracle (both directions); parameter honesty (tunable-site count, provenance fraction,
  reviewed-vs-unseen stability ratio, healthy ≈ 1.0).
- All corpus metrics per artwork (dedup on artwork id), stratified by resolution tier.

## 4. Contract invariants and pathology census (discussed 2026-08-02)

**Framework — one list, three confidence tiers, movement by evidence:**

- **Invariant** — never legitimate on any artwork. A violating palette is invalid; publication
  is refused or repaired; a violation reaching the corpus is stop-the-line. Enforced by the
  contract-validation gate.
- **Pathology** — almost always wrong, but rare legitimate instances exist or verdicts are
  lacking. Counted corpus-wide per run; instances generate review batches.
- **Distribution shift** — a property of the corpus, not of one palette: collapse rates,
  gradient rates, role-permutation churn, mover-set composition. Catches asymmetric mechanisms
  that per-palette checks structurally cannot see.

Promotion/demotion is evidence-driven both ways: unanimously-bad reviewed instances promote a
pathology to invariant; an invariant that ever blocks an endorsed palette is demoted — the
reviewer outranks the rule. Meta-rules: **validation runs on the final published object only**;
**any repair re-validates the entire palette** (v2-3's first repair relocated the defect in
13/15 cases); **invariant thresholds reuse the one ruler** or carry measured provenance.

### Invariants

1. **Schema validity.** Four roles present, valid sRGB, stops 2–4 with strictly increasing
   positions spanning exactly [0,1] (first = 0, last = 1 — positions are normalized over the
   ramp's own span; hard stops/plateaus are not expressible, consistent with
   flattest-path-on-artwork), collapse flags consistent, metadata block complete.
2. **Source support.** Every published color (roles and stops) is an exact pixel of the input,
   meeting the population floor and spatial-spread test (thresholds need provenance; shape
   settled).
3. **Palette-wide distinctness.** Every pair of published colors distinct above the same-color
   bar, with exactly two exception classes:
   - *Sanctioned collapses:* surface→background and accent→foreground — **exact** equality with
     the collapse flag set; near-identical-but-unequal, or equal-without-flag, are violations.
   - *Field roles vs stops:* background/surface may coincide with stop colors (with decoupled
     stops this is the natural case).
   Subsumes: stop distinctness, invisible accent (invariant per reviewer 2026-08-02: an
   invisible accent is never valid), foreground-matches-a-stop ("white on white"),
   black-on-black fg/bg, and non-degenerate-gradient (distinct stops ⇒ distinct endpoints).
4. **No flat pair at exact-zero luminance contrast.** Foreground vs background and vs surface —
   invalid regardless of hue. Accent vs background and vs surface likewise, with its **own
   threshold**. "Exact zero" is operationally a small interval `|raw APCA| < ε` on the **raw
   pre-clamp scale** — necessarily raw, because the public Lc scale clamps everything below
   ~7.3 to 0 and cannot distinguish "truly invisible" from "very low but real". Each ε is
   **measured, not chosen** (from the distribution of raw values over corpus pairs).
   *Implementation note (2026-08-02):* this invariant is realized as the contrast parameters'
   **floor** — each parameter's default = minimum = its ε (§2), so the invariant is simply the
   parameter at its lowest setting; there is no separate enforcement path.
   *Measured constraint (2026-08-02, **corrected 2026-08-03**):* identical colors do NOT produce
   raw APCA 0 — the formula's reverse branch leaves a luminance-dependent residue peaking at
   **|raw| = 1.98152** (`APCA_RAW_IDENTICAL_CEILING` in `src/contract/constants.ts`, which is
   the authority for the digits). The earlier value **1.9815 was refuted**: `#df11de` against
   itself produces 1.981519246, which *exceeds* it — a rounded-down bound is not a bound. The
   provenance changed with the value: the ceiling is now **analytic**
   (`Y* = (0.62/0.65)^(1/0.03)`), **not** an exhaustive Y scan. Both ε values must exceed that
   ceiling or a literally identical fg/bg pair passes; the corpus ε distribution starts there,
   not at 0. Quoting 1.9815 re-opens exactly the invisible-pair hole this invariant exists to
   close, so the refuted digits must not survive anywhere.
   *Scope note:* when `accentCollapsed` is set, the accent pairs are skipped — a collapsed
   accent is the foreground and is validated as such; it has no independent existence. Open measurement question for the accent: text readability at equal luminance is
   luminance-driven, but chromatic icons at equal luminance can be visible — the accent floor
   may properly live in color distance (already enforced by distinctness) or at a lower
   luminance epsilon; the bracketing round shows flat equal-luminance chromatic accent pairs
   and the reviewer's eyes decide.
5. **Transparent input refused loudly** (§1), never silently flattened.

### Pathology census (counted per run; instances feed review batches)

**The census is a development instrument, not runtime behavior.** It never modifies any
published palette, for any caller, with or without parameters — it counts suspicious
conditions over lab corpus runs and queues instances for review. When reviewing proves a
condition genuinely always-bad, the fix lands in the algorithm itself or the condition is
promoted to an invariant; that is how pathologies stop happening. A statistic may appear in
both worlds (e.g. the indistinct fraction: runtime enforcement only under a caller's
`minTextContrast`; census metric always, at a fixed internal reference bar).

- **P1 — Off-artwork ramp:** rendered gradient's worst excursion from populated artwork colors
  above the excursion bar, after guide stops. Bar inherited (2.5× same-color) — recalibrate in
  the bracketing round.
- **P2 — Indistinct ramp exposure:** foreground's indistinct fraction over the ramp above a
  reference fraction, tracked at a fixed internal bar even when user parameters are off.
- **P3 — Collapse on a chromatically rich artwork** and **P4 — near-neutral palette on a vivid
  artwork:** expected mostly legitimate; primary job is outlier mining for review batches
  (v2-3's accidental trial of this flag class hit a 25% defect rate).
- **P5 — Identity coverage shortfall:** a major artwork hue direction (large mass, visual
  weight) with no published color near it — v2-3's most frequent complaint class (27 notes).
  Not an invariant: the all-one-hue rule means neutrals-only can be correct, and minor hues
  must never be force-included. Acute special case: a signature color that reached **no**
  published role.
- **P6 — Oracle cross-checks** (once the oracle lands). The VLM labels what the artwork *is*
  ("flat background" / "one shaded surface" / "several distinct areas"); the algorithm decides
  what to *publish*. Comparing them corpus-wide finds likely mistakes without human review —
  but never as an exact-match test, because several palettes can be valid for one artwork.
  Each (label, decision) combination goes into one of three buckets:
  1. *Contradiction* — VLM says flat background, we published a gradient (or: one shaded
     surface, we published flat — softer). Almost certainly our mistake → flagged for review.
  2. *Agreement* — nothing to do.
  3. *Can't tell* — VLM says several distinct areas, we published a gradient. Could be good
     (sky+sea as one blue gradient) or bad (sky+grass merged). The label can't distinguish, so
     no per-artwork flags: just occasional small review samples, plus watching the bucket's
     *count* — if a code change suddenly moves hundreds of artworks into this bucket,
     something is probably wrong even if no single one is provably bad.
  Accent check: flag only "the VLM says this artwork has a signature color, and that color
  appears in no published role." Signature on the foreground with a collapsed accent = no
  flag, correct behavior. Oracle checks are review flags, never gates.

### Distribution-level census (per integration / version)

Gradient rate moved in either direction (neutrality census); collapse rates per role
(asymmetric-lever detector); role-permutation rate (same colors, reshuffled roles — 16% of
v2-3 corrections); mover-set composition (any mover without the targeted defect = cascade
canary).

## 5. Corpus, holdout, and legacy data (discussed 2026-08-02)

- **No holdout in the sharded corpus.** Upstream supply of fresh same-source folders is
  effectively unlimited (per the reviewer) — never-seen evaluation comes from importing fresh
  shards on demand; fresh-artwork rounds stay the idle-time default.
- **Holdout in `music-artworks/`: yes.** It is complete (the reviewer's personal library — the
  closest set to the deployment distribution, and no more where it came from). Reserve a
  random ~15% of the album-artwork candidates, stratified by resolution band,
  multi-rendition artworks kept whole on one side of the line; freeze the list in a committed
  file. Excluded from review, dev batches, outlier mining, and tuning — touched only for
  end-of-campaign claims. The resolution ladder draws from the non-holdout remainder.
  *Frozen 2026-08-02, version **2.0.0**:* the candidate set narrows from 3,097 square artworks to
  **2,757** in **two** steps, not one — **16 thumbnail-only** artworks (best long edge ≤ 150 px)
  and **324 square real-transparency files** (disc scans/cutouts, all single-rendition).
  3,097 − 16 − 324 = 2,757; the earlier text attributed the whole drop to transparency and its
  arithmetic did not close. `data/coverage-set/COVERAGE_SET.md` carries the full chain
  (4,088 artworks − 991 non-square = 3,097). Both endpoints were always right, and every
  downstream number keyed to 2,757 is unaffected.
  **413 artworks / 1,073 files held out (14.98%)**, seed pinned `[HELD]`,
  byte-reproducible. See `research/v3/data/holdout/HOLDOUT.md`.

  **Version 1.0.0 leaked and was voided.** It drew on artwork ids; the embedding near-duplicate
  census then found that **224 of its 414 held-out artworks had a near-identical twin — the same
  image under a different artwork id — on the working-set side of the line.** Nothing had consumed
  the holdout, so the reviewer authorised a clean redraw (2026-08-02). 2.0.0 selects **whole
  near-duplicate components**: an edge wherever any of three embedding arms puts a pair at cosine
  ≥ 0.95, connected components via union-find, whole components drawn. Zero near-duplicate edges
  cross the boundary, asserted on every run across all three arms.
  - **Use the effective size, not the nominal one.** 2,757 candidate artworks are only **1,712
    distinct images**. The holdout is 413 artworks but **254 independent components** (14.84% of
    components) — that is the number to reason about statistical power with. The nominal count
    double-counts duplicates.
  - **The census is a lower bound.** Measured against duplicates the filename ground truth already
    knows about, it undercounts by **46.3%** at cosine 0.95. Component isolation removes the
    duplicates we can see, not all of them; end-of-campaign numbers still carry residual optimism.
  - **One residual path:** 12 artworks that *failed* the candidate filters (non-square,
    thumbnail-only, real-transparency) are near-duplicates of a held-out artwork. They are in
    nobody's working set today, so nothing leaks — but pulling any of them into a transparency or
    banner-shaped edge-case batch would create one. Their ids are in `holdout.json` under
    `header.nearDuplicateCensus.nonCandidateQuarantine`. **Treat that list as held out too.**
  - Changing the seed, the census or the component rule re-rolls the holdout and **voids every
    claim made against the old list.** That has now happened once, deliberately, with reviewer
    authorisation. It must not happen again without the same authorisation.
- **v2-3 verdicts are NOT imported into the v3 warehouse.** Their value is distilled into
  purpose-built fixture files consumed only by mechanical checks: **known-bad palettes** (feeds
  the known-worse gate), **endorsements** (feeds the concordance dashboard and reachability
  diagnostics), and **acceptable** (a "not-rejected" baseline tier for the dashboard, never an
  endorsement), each entry carrying scoping metadata (rendition, old contract version).
  *Consumption semantics (2026-08-02):* the known-worse gate keys on the **role signature**
  (four role colors, matched within the same-color bar), never the full palette signature —
  v3's decoupled-stop gradients make full-signature matches structurally impossible, and
  gradient fields on legacy entries are advisory only.

  *Conflicting grades — settled by **recency** (reviewer 2026-08-03, superseding the earlier
  warn-never-block answer given by the orchestrator the same day).* 36 (artwork, exact palette)
  pairs carry more than one grade across different comparisons — the censored/relative
  epistemology showing through, since the same palette can win one blinded pairing and lose
  another. Six of those involve a bad grade. **The latest-timestamped grade is the pair's standing
  verdict**; earlier grades are history, not live contradictions. Consequences, all applied in the
  data:
  - Latest grade bad → **hard-gate** known-bad entry, marked `resolvedByRecency` with the full
    `gradeHistory`. Latest grade good → **dropped from `known-bad.json` entirely**.
  - **`contested` now means exactly one thing: conflicting grades sharing an identical timestamp,
    which recency cannot break. There are none** — checked, not assumed. So all **37 known-bad
    entries are hard-gate entries**; there is no warn-only tier.
  - **Membership is the signal.** A palette whose standing grade is bad lives in `known-bad.json`
    and nowhere else — removed from the good-tier files rather than kept there flagged as
    superseded history, so a mechanical consumer never has to remember to filter. Good-tier
    overlap with known-bad is **0**.
  - Recency is a **policy, not a measurement**: it asserts that a later blinded comparison reflects
    the reviewer's settled view better than an earlier one, and the warehouse epistemology gives no
    evidence either way. It moves 3 palettes into the gate and 3 out of it, on a gate set of 37 —
    roughly an 8% swing decided by a tie-break rule. Recorded in
    `data/decisions/decisions.json` → `d-2026-08-02-legacy-contested-pairs-recency`.
  Rationale: the data's value flows through exactly the two sanctioned channels; nothing can
  mistake them for current verdicts because they are not verdicts anywhere — and the v3
  warehouse schema (dual grades, code fingerprints) structurally rejects old-format records.
  Free-text lessons are already distilled in the field guide (adversarial checklist).
- **Languages:** TypeScript for almost everything; Python/MLX only where local models require
  it. **Long runs:** the orchestrator asks before starting or resuming any long run; the
  reviewer gives the go-ahead and calls cool-downs.

## 6. The semantic oracle — what its labels are, and are not (decided 2026-08-03)

**The step-back.** Group A was piloted (`premise-run-1`, 142 artworks decoded, **137** of them the
analysis population, × 2 prompt variants),
the reviewer hand-answered the 30 artworks where oracle and flag contradicted
(`disambiguation-1`), a decomposed-probe arm was drafted and its human half run
(`oracle-probe-gold-1`, 180 answers), and a criterion arm was drafted. At that point the
instrument had been rewritten three times in two days and none of the rewrites had been measured
against a model. The reviewer called a step-back on 2026-08-03. What it settled:

**Oracle labels are known-noisy instruments for census, flagging and stratification. They are
never per-item truth.** Concretely, and binding on every consumer:

- **Never a gate**, never a fitting target, never an adjudicator of an individual artwork.
- **Legitimate uses:** corpus-scale *counts* (the gradient-boolean neutrality census — "panel
  neutrality is not corpus neutrality"), *flags* that queue artworks for human review, and
  *strata* for sampling. All three tolerate per-item noise; none of them survives being read as
  a verdict.
- **P6's three-bucket structure (§4) is the shape all oracle cross-checks take** — contradiction,
  agreement, can't-tell — precisely because several palettes can be valid for one artwork.
- **Flag agreement is not accuracy.** Reviewer ruling, 2026-08-03: the published gradient flag is
  **palette-conditional, not an artwork label** — an artwork can support a valid flat palette
  *and* a valid gradient palette, and the flag only records which choice won. So (a) elicited
  human labels are the primary judge for any oracle or model comparison; (b) flag agreement is a
  secondary, palette-conditional signal; (c) the disambiguation tiebreak (flag 14 / oracle 10 /
  neither 6) **overstates oracle error** by an unknown share of legitimate other-choice cases.

**The instrument is frozen** at the **v2 single-question group-A form carrying variant B's
ordering** — context questions (`enclosure`, `field_texture`) asked *before* the critical ground
question, because under constrained decoding the property order is the generation order, so the
model commits to two cheap facts before answering the hard one. Variant B beat A on every readout:
exact match with the reviewer 16/30 vs 7/30, binary agreement 17/24 vs 8/20, κ vs the flag 0.31 vs
0.21, answers landing on a value that predicts nothing 31% vs 44%.
*Honest caveat:* A and B differ in **order and in wording**, so ordering is not cleanly isolated.
The criterion arm (variants C, D) was drafted to deconfound it.

***The criterion arm has since RUN, and its result is adverse (2026-08-03).*** `premise-run-cd.jsonl`
— 299 rows, variants C and D, 142 images, all ok. The pre-registered §4 gate splits:

| readout | A-vs-B (the frozen instrument) | C-vs-D (the deconfounder) |
|---|---|---|
| `ground_type` raw inter-variant agreement | 0.708 | **0.4599** |
| κ vs the accepted flag | A 0.21 / B 0.311 | **C 0.126 / D 0.392** |
| unmapped share of 137 | 60 (44%) / 43 (31%) | **0 / 0** |

Two independent readings, and both belong here. **The unmapped criterion passed outright** — 0%
under both C and D, a large favourable result that bears on B5 and on design rule 8. **The
exact-match criterion failed** by every variant (best 16/30 against a required 22/30), and C and D
agree *with each other* on only 46% of artworks — **worse than A agrees with B**. Two wordings that
share B's ordering do not reproduce B, so **ordering is not sufficient**, and the A→B difference
cannot be attributed to order on the available evidence. That is evidence *against* the hypothesis
C/D were pre-registered to confirm.

**The freeze itself stands.** Variant B remains the frozen rendering and still beat A on every
readout; what changed is that one design rule cited in its support (rule 6) now carries a failed
replication. Write-up: `oracle/premise/CD_RESULT.md`. Records:
`d-2026-08-03-group-a-corpus-gate-outcome` (both successors — the gate's own escalation branch and
the reviewer's chosen residual-isolation direction) and
`d-2026-08-03-reviewer-background-via-residual-isolation`.

**The probe arm is parked, with its findings banked.** Its human half is the reason: the reviewer
answered all six probes on the same 30 artworks they had already answered directly, and the
729-row derivation reproduced their own direct tag on **13/30 (43.3%)** — below the reviewer's own
63% self-consistency noise floor. Two instruments disagreeing with each other more than one
reviewer disagrees with themselves is the finding. The `unsure` channel built to carry ambiguity
was used **once in 180 answers** while the reviewer reported the questions as ambiguous. The VLM
half was never run, so the arm's own questions — are the probes easy, does the inconsistency rate
earn its place, does bundling contaminate — remain unanswered; that is what "parked" means rather
than "rejected". The arm is revived only by an explicit orchestrator opt-in.

*Correction 2026-08-03 — the guarantee is weaker than it was stated.* This document, `B3` in the
ledger and `PREMISE_NEXT.md` all said "all nine probe prompt files are inert — **no glob matches
them**". That is no longer true: `common.py`'s `PROMPT_SETS` registry now registers
`group-a.probes.bundled` and `group-a.probes.solo` with matching globs. The **operational** claim
survives — the default prompt set is still `group-a.v1`, no A/B rerun is affected, and the arm is
still gated on an explicit opt-in — but the mechanism is now "**nobody selects them**", not
"nothing can reach them", and that is a strictly weaker property. It should be stated as the
weaker one.

**What is still open: which model runs the bulk pass.** See §8.

Recorded as `data/decisions/decisions.json` → `d-2026-08-03-oracle-question-set-freeze`, funded by
212 reviewer answers and rechecked against the warehouse.

## 7. Measured resolution floors (ladder-sample-1, 2026-08-03)

The resolution ladder answers a question the whole corpus depends on: **below what size does a
question stop being answerable at all?** Measured by running the frozen instrument down a ladder
of renditions of the same artwork and comparing each rendition's answer to the largest rendition's
(**3,088 work rows** — 3,136 rows less 48 canary; **1,431 ladder comparisons** in total, of which
**1,190** are the primary scope; **400 artworks** with an answered reference; native resolution,
canary stable, zero failed or reparsed rows). *Corrected 2026-08-03:* the earlier "2,913 work rows"
was the **planned image count** from `cost-scoping.json`, a plan quoted as an execution, and the
earlier "1,225 ladder comparisons" was `ground_type.pooled_unrestricted.n` — **one question's**
count quoted as a population. Both were near-right before the codec-control rerun regenerated the
analysis; the sentence was not updated when the codec-control bullet below it was. The floors
themselves are exact and unaffected — `ladder-sample-1.analysis.json` is the authority.

| question | agreement floor | lowest passing bin | **unanswerable below** | pooled agreement |
|---|---|---|---|---|
| `ground_type` (feeds the **gradient boolean**) | 0.85 | 241–340 px | **~241 px** | 0.830 |
| `gradient_boolean` (derived) | 0.85 | 241–340 px | **~241 px** | 0.863 |
| `field_texture` | 0.85 | 241–340 px | **~241 px** | 0.856 |
| `shading_geometry` | 0.85 | 441–560 px | **~441 px** | 0.671 |
| `enclosure` | 0.85 | — | answerable at every measured size | 0.922 |

**The action these floors compel:** record `below_resolution` for a question on any rendition
under its floor. **Never a confident negative.** A small rendition that cannot support the question
must not be counted as evidence that the answer is "no".

Provenance and caveats, all load-bearing:

- **The 0.85 agreement floor is `[UNCALIBRATED]`.** It is a CLI flag with no measured basis — the
  analysis prints the whole curve at every bin precisely so a reviewer can move it. Every floor in
  the table above moves with it. Owner: reviewer.
- ~~The codec-control noise floor was never populated~~ **Populated 2026-08-03**
  (`ladder-codec-control-1.jsonl`, the `--include-duplicate-sizes` rerun): same-size,
  different-bytes agreement is **ground_type 0.903 · field_texture 0.922 · enclosure 0.961 ·
  shading_geometry 0.857** (n=206/206/206/63). Every failing resolution bin sits far below
  its question's codec ceiling, so the drops are genuine resolution effects, not codec noise.
  **The `unanswerable_below_px` verdicts are no longer provisional** — settled, scoped as
  ever to the 0.85 `[UNCALIBRATED]` floor.
- **`shading_geometry` is weak everywhere**, not merely below 441 px — its pooled agreement is
  0.671, far under the floor. Treat its floor as "the size below which it is hopeless", not as a
  size above which it is reliable.
- **Three bins are thin**, not two. Against the analysis's own `min_bin_n = 30` rule its
  `thin_bins` list names 161–240 px (n=4), 681–900 px (n=4) **and 901–1400 px (n=15)** — plus
  341–440 px for `shading_geometry` specifically. The 561–680 px bin is empty under every scope.
  The earlier "two bins" understated thinness in the direction of confidence, in the section whose
  whole job is to say how far the ladder can be trusted; and 901–1400 px is the bin nearest the
  "is 640 px enough?" question. The ladder is consequently **silent on whether 640 px is enough**,
  which needs a different collection rather than a bigger scope.
- **The transfer check holds**, which is what lets the curve be used corpus-wide: the ladder curve
  predicts 0.834 and the matched-contrast control 0.814 against the 644 real sharded pairs'
  observed 0.818.
- **The answer key may be wrong at the very top.** At 3,000 px the model called an artwork
  `pattern_or_texture` where every smaller rendition said `flat_field` — seeing paper grain
  invisible at any size a user will ever view. If that turns out to be common, the reference
  rendition should be capped at a viewing-plausible size and the ladder **re-scored**; the run
  does not need repeating, only the analysis.

## 8. Open items

**The full ledger, with owners and revival conditions, is `PHASE_0_LOOSE_ENDS.md`.** This section
keeps only the items that change a decision in this document.

- ~~Same-color-bar bracketing round~~ **Settled and FROZEN (2026-08-03).** Two rounds ran; the bar
  is region-dependent (§3) and is frozen at its per-region **point estimates**. **No round 3.**
  The freeze was priced, not assumed: over 554 real palettes and 3,221 role pairs, the remaining
  95%-interval uncertainty produces 0 decision flips at the low end, 2 at the high end, 0 under
  the hue split — and both high-end flips would newly condemn a palette the reviewer *endorsed*,
  which §4 says demotes a rule rather than tightening it. Recorded as
  `d-2026-08-03-same-color-bar-freeze`.
  - **The light-saturated hue split is NOT adopted.** It flips only toward more violations, all on
    endorsed or accepted palettes, and its 0.03805 third is the middle of a separation gap rather
    than a fitted crossing.
  - **The anisotropy finding is not priced by any of this.** OKLab distance looks anisotropic under
    the reviewer's criterion (at a fixed distance: lightness-only pairs read "same" 4/4,
    chroma-only 2/4, hue-only 1/4) — that is a **missing dimension, not a width in the bar**, and
    no scalar bar can express it. If a round 3 is ever justified, this is the better question to
    spend it on. Both findings are held by a deliberate tripwire test that fails if either is ever
    quietly encoded.
- **Still open from that round:** the excursion bar recalibration (P1, still inherited at 2.5×
  same-color) and flat equal-luminance chromatic accent pairs. The accent *visibility* distance
  was measured (0.0744) but under **complete separation** — the reported value is the middle of a
  0.06300–0.08796 band, bracketed rather than pinned.
- Foreground exact-zero epsilon: **still measurement-only, still not measured.** `EPSILON_TEXT_RAW`
  and `EPSILON_ACCENT_RAW` both sit `[UNCALIBRATED]` at 2.5 — a placeholder chosen only to clear
  the **1.98152** identical-colors ceiling (§4; the refuted 1.9815 is not the bound). §4 requires
  them derived from the raw-APCA distribution over corpus pairs; that run has not happened.
  *When it does:* `HAND_WRITTEN_EPSILON_CONTRAST` and the six bracket fixtures must be
  **re-derived**, not adjusted — they are pinned to 2.5 by test and will fail loudly first, by
  design. Loose end A3 carries the trigger.
- **Bulk-model decision — PENDING, and the blocker is now reviewer bandwidth, not GPU.** Which VLM
  runs the corpus-wide oracle pass is undecided. *Corrected 2026-08-03:* **two of the three arms
  now have full eval-142 runs** — the incumbent `qwen3-30b-a3b` (6-bit MoE, 284 rows / 142 images /
  137 scored / 0 failed) **and** the dense challenger `qwen3-32b-dense` (8-bit, the pipeline's
  planned adjudicator; 236 eval142-tagged rows / 137 scored / 0 failed / 0 parse_failed). Only
  `gemma3-27b` (8-bit) is still gold-30-only. InternVL3.5 is **blocked** — no runtime supports it.
  On the hard-case gold-30 the arms disagree in opposite directions (the dense challenger wins
  under variant A and loses under variant B; cross-arm agreement **0.533**, i.e. **these are
  meaningfully different instruments**), so the gold-30 cannot settle it — but the same pair on
  **eval-142 agrees 0.761 (n=142)**, a materially different picture of how far apart they are, and
  exactly the number the ledger said was needed. What remains outstanding is the **reviewer visual
  evaluations alone.** That is a much smaller ask than "challenger runs in progress" implied, and
  it is reviewer-bandwidth-shaped rather than GPU-shaped — which matters, because reviewer
  bandwidth is this campaign's stated binding constraint. No bulk run starts before it lands, and
  the GPU queue is the orchestrator's, one job at a time.
- ~~Contrast-parameter defaults~~ **Settled (2026-08-02, after two rounds of relitigation):**
  the contrast parameters are **always set** — default = minimum = the experimentally
  determined ε of §4 invariant 4, in raw APCA units near zero. Callers can only raise the
  floor. Runtime enforcement is therefore: (1) the algorithm's reviewer-calibrated judgment +
  (2) the invariants (which include the parameters at their ε floors); anything above ε is
  caller opt-in. The pathology census remains a lab-only instrument (see §4), always active
  during development, never part of the shipped algorithm's runtime for any caller.

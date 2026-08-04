<!-- Phase 1 author packet — provenance
     source: research/v3/PHASE_0_DECISIONS.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim copy of the source above, assembled for a Phase 1 author packet.
     
     Pointed at by PHASE_1_AUTHOR_BRIEF.md §3, whose table makes §§1-5 of this file
     normative for the output contract (§1 input policy, §2 output contract, §3 metrics,
     §4 contract invariants and pathology census, §5 corpus/holdout/legacy policy).
     §6 states what the semantic oracle's labels are and are not; §6.1 carries the SAM
     conditions. Copied whole rather than extracted, so that nothing is silently dropped.
-->

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
  `gradient: null | {stops: [2..4]}` (source pixels) — stops decoupled from role colors,
  **except the two ends**.
  *Amended 2026-08-04 by reviewer ruling*, verbatim: *"when the field is a gradient, the first
  stop is the `background` and the last stop is the `surface`. A gradient can have 2 or 3 stops
  (4 is negociable if proven utility)."* So `stops[0].color == background` and
  `stops[last].color == surface`, as **exact** hex equality; the decoupling survives for the
  *interior* of a ramp only. Enforced as invariant 1's `I1.first-stop-not-background` and
  `I1.last-stop-not-surface`. Two consequences: the invariant-3 exemption of field roles against
  stop colors becomes **mandatory rather than permissive**, and a palette with `surfaceCollapsed`
  set **cannot publish a gradient** (both ends would be one color — a degenerate ramp).
- **Guide-stop semantics for stops 3–4.** A 3rd stop is allowed when the artwork genuinely has
  a 3-color linear gradient. Stops 3–4 are otherwise *guides*: they exist only to pull the
  rendered OKLab interpolation onto the artwork when the 2-stop straight line demonstrably
  passes through off-artwork colors. Never to expand colorspace coverage or fit a metric.
  Curvature carries a banding cost when rendered, so the winning gradient is the **flattest
  path that stays on-artwork** — excursion reduction justifies a stop; meandering is forbidden.
  *Re-affirmed 2026-08-04* by the endpoint ruling above, which the reviewer asked to be read
  alongside this bullet: the 4th stop is **negotiable on proven utility** rather than granted,
  so reaching for it owes evidence that three could not do the job. `MAX_GRADIENT_STOPS`
  is unchanged at 4.
- **Geometry is opportunistic.** Detection is geometry-agnostic (linear, radial, conic — all
  publish a t-parameterized color path; the consumer renders it as a 135° linear gradient). An
  optional `geometry` field is populated only when fitting computed it anyway; never computed
  for the sake of the output.
- **Explicit collapse flags** (`surfaceCollapsed`, `accentCollapsed`) — makes collapse
  countable instead of implicit hex equality. *Confirmed unchanged 2026-08-04:* the reviewer
  restated both sanctioned collapses in the same terms — the accent may collapse to exactly the
  foreground when genuinely no valid accent exists, the surface to exactly the background when
  genuinely no valid surface exists — and the machinery already matched.
- **The one sanctioned non-source color** (`escape`). *Added 2026-08-04 by reviewer ruling*: a
  palette may introduce **exactly one** color not present in the artwork — pure white
  (`#ffffff`) or pure black (`#000000`) **only**, used as **background or foreground only**
  (with surface or accent collapsed correspondingly), **only when there is genuinely no other
  way to produce a 2-color palette.** This is the sole exception to invariant 2's existence
  clause and it is **declared, not inferred**: an undeclared invented color fails invariant 2
  exactly as before, so forgetting to declare is fail-safe. Four conditions are checked — the
  color is exactly one of the two literals, the role is one of the two permitted, the partner is
  genuinely collapsed (invariant 1), and the color is **genuinely absent from the artwork**
  (invariant 2, `I2.escape-not-needed`). The unquantifiable condition — "no other way" — is
  deliberately not faked; the last two are its checkable shadow.
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
  **Both floors hold over the WHOLE RENDERED RAMP as of 2026-08-03**, and this replaced a per-stop
  clause added earlier the same day. Sequence, because both steps are on the record: until that
  morning the invariant checked only background and surface, so a foreground that vanished against a
  published stop published clean (`d-2026-08-03-min-text-contrast-covers-published-stops`,
  `I4.stop-below-contrast-floor`); then the **reviewer ruled**, verbatim — *"the accent's minimum
  contrast must be checked against gradient backgrounds like the foreground's is"* and *"it's not
  'each stop' by the way, because the contrast issue could happen somewhere in the middle of 2 points
  too"* — so the per-stop check was checking the corners of a picture and calling it the picture, and
  it left the accent out entirely. **"And every published stop" names the gradient, not four
  colours.** Now: `minTextContrast` **and** `minAccentContrast` are each enforced as a **minimum over
  the entire interpolated ramp**, the accent's as the pointwise conjunction of its two dimensions
  (luminance *and* colour distance must both undershoot **at the same ramp point** — minimising them
  separately would condemn a ramp that is isoluminant at one end and same-hued at the other while
  being visible throughout). A minimum landing on a published stop still reports
  `I4.stop-below-contrast-floor` and names the stop, so the existing census stays countable; an
  interior minimum reports `I4.ramp-below-contrast-floor` and names the position. One violation per
  role, because a minimum has one location.
  **Reworded 2026-08-04, and only one clause moved.** The accent's second dimension is still a
  pointwise conjunction and the sentence above still describes its shape — but **which distance**
  it uses changed, by a later reviewer ruling: *"the contrast limit between foreground and
  background/surface/gradient, and between accent and background/surface/gradient should be about
  APCA contrast, not APCA **and** color distance. Color distance is used between background and
  surface, or between foreground and accent."* So the **foreground gets no escape of any kind, at
  any distance, at any floor level** — stated explicitly here for the first time, though it is
  unchanged in behaviour — and the accent keeps exactly one escape, running on
  **`ACCENT_FUNCTIONAL_DISTANCE` (0.14591, `[UNCALIBRATED]`)** rather than on the retired
  `ACCENT_VISIBILITY_COLOR_DISTANCE` (0.07444) it used from 2026-08-02 to 2026-08-04. The reason is
  the reviewer's own refinement: the old threshold came from a **detection** criterion ("can you
  see the difference"), and *"if APCA says 0 … those accents will still be hardly perceptible"* —
  so a contrast escape needs a **functional** criterion, which no round has run. The retired number
  relocates to foreground↔accent (§3, loose end **B31**). **The whole-ramp scope above is untouched
  by this**, and `d-2026-08-03-reviewer-whole-ramp-contrast-floors` is **not superseded** — only the
  identity of the distance in its consequence (3) changed. Records:
  `d-2026-08-04-reviewer-metric-follows-the-pair`,
  `d-2026-08-04-accent-functional-distance-is-a-bracketed-placeholder`,
  `d-2026-08-04-whole-ramp-record-stands-only-the-accent-distance-changed`; the calibration this
  places on the critical path is loose end **A16**.
  **The interpolation space is OKLab** — reviewer ruling,
  *"sampled in the interpolation space the player actually renders"* — declared once as
  `RAMP_INTERPOLATION_SPACE` and read by the CSS emitter so the two cannot drift; the pinned emitter
  already produced `linear-gradient(135deg in oklab, …)`, and a missing hint would have mattered
  (sRGB interpolation renders a ramp **up to 0.153 OKLab / 20.5 raw APCA units** away mid-segment,
  measured). Recorded as `d-2026-08-03-reviewer-whole-ramp-contrast-floors`; loose end **B21** closes
  on it.
  Along a gradient: the **indistinct fraction** (length of ramp below
  the bar, computed on raw values to avoid the zero-clamp phantom-flip artifact) — floor +
  max-fraction parameter shape; exact defaults open, pathology-census discussion. **No region of a
  published gradient is now unpoliced; what the contract does not measure is a *length*** — the
  invariant is an extremum, and a ramp can clear the floor everywhere and still sit close to it over
  most of its span (loose end **B15**, pathology **P2**).
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
  chromatic accent becomes **detectable** at OKLab distance ≈0.0744 — the **middle of the
  0.06300–0.08796 separation band**, which is the honest bracket to quote. (**"Functional" was the
  wrong word and is corrected here, 2026-08-04.** The round asked *"are the icons clearly visible on
  this background?"*, which is a detection question; the reviewer has since ruled that detection is
  the wrong criterion for a contrast escape and retracted the lowest rung they had called visible as
  *"hardly perceptible"*. The distance at which an accent becomes **functional** is a different and
  **unmeasured** quantity — `ACCENT_FUNCTIONAL_DISTANCE`, placeholder 0.14591, `[UNCALIBRATED]`,
  loose end **A16**.) (The logistic
  fit's 95% CI of 0.052–0.106 is a **ridge artifact**: the data are completely separated, so
  the curve cannot pin the crossing and its interval describes the ridge rather than the
  uncertainty. Same fit object, different statistic — do not cite the CI as the bracket.
  0.0744 is the geometric mean of the band, exact to five digits.) **The measurement stands; what
  it gates does not.** Hue still rescues, and invariant 4's accent clause is still a conjunction —
  violation requires BOTH |raw APCA| < ε_accent AND a colour distance below a threshold — but as of
  2026-08-04 that threshold is `ACCENT_FUNCTIONAL_DISTANCE` (0.14591, `[UNCALIBRATED]`, 1.96× the
  old one, so the escape is **narrower** and the floor **stricter**), and 0.0744 `[REVIEWED]` has
  moved to the **foreground↔accent** pair as `FOREGROUND_ACCENT_SEPARATION_DISTANCE`
  `[INHERITED]` — a pair it was never measured on, though a detection-class pair, which is the
  class it *was* measured on (loose end **B31**). The
  foreground clause is unchanged and is now stated positively — text is luminance-driven, **no
  colour rescue at any distance** (v2-3 reviewer verdict, restated by the 2026-08-04 ruling).
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
   *Added 2026-08-04:* **gradient ends are the field roles** — first stop exactly the
   `background`, last stop exactly the `surface` — and, when an `escape` is declared, its
   structural legality (permitted color, permitted role, the role actually publishes it, partner
   collapsed).
2. **Source support.** Every published color (roles and stops) is an exact pixel of the input,
   meeting the population floor and spatial-spread test (thresholds need provenance; shape
   settled). *Amended 2026-08-04:* **one exception**, the declared non-source escape — pure white
   or pure black, at background or foreground, partner collapsed — and an escape declared over a
   color the artwork *does* contain is itself a violation (`I2.escape-not-needed`). A malformed
   declaration buys no exemption.
3. **Palette-wide distinctness.** Every pair of published colors distinct above the same-color
   bar, with exactly two exception classes:
   - *Sanctioned collapses:* surface→background and accent→foreground — **exact** equality with
     the collapse flag set; near-identical-but-unequal, or equal-without-flag, are violations.
   - *Field roles vs stops:* background/surface may coincide with stop colors. *Amended
     2026-08-04:* under the endpoint ruling this exemption is **mandatory rather than
     permissive** — the two ends of a ramp *are* the background and the surface, so those
     coincidences are required, and this clause is what keeps them legal.
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

### 6.1 Models at runtime — banned, with one conditional exception (reviewer ruling, 2026-08-04)

Everything above is about **dev-time** labels. This is about the shipped algorithm, and it is a
constraint on proposals, **not** a licence to build anything: nothing here has been built, tested or
approved for use.

**No model runs in the shipped pipeline.** The single exception the reviewer has left open is
**SAM**, and it is admissible only if **all** of the following hold:

1. **No upstream model feeds it.** No VLM nouns, no model-derived prompts, nothing that would make
   the pipeline transitively depend on a second model.

2. **Provably deterministic — MEASURED AND SATISFIED for a pinned stack** (`sam-determinism-1`,
   2026-08-04). The same file yields **byte-identical masks across runs**. This was tested before
   anything relied on it, as this condition required: 12 covers × 12 passes = 144 inferences and
   5,148 regions, comparing every region's mask RLE, score, bbox and area on exact IEEE-754 bit
   patterns, with **zero differing bytes** across repeated inference in one process (24/24 image
   comparisons), fresh process restarts with a cold Metal context (36/36), and permuted image
   processing order (36/36). Image decoding was checked the same way and is byte-identical too.
   Evidence: `oracle/sam/DETERMINISM_TEST.md`, `oracle/sam/DETERMINISM_PREREG.md`,
   `data/sam/determinism-1-analysis.json`.

   **One boundary is documented, and it is cosmetic.** Permuting **concept** order changes the
   order in which regions are emitted and nothing else: over 36 comparisons the row-keyed digest
   (`concept`, `instance_idx`) and the order-free content digest are identical **36/36**, with
   zero regions differing in any field. Since stored rows are keyed on (image, concept, instance),
   the **row set** is byte-identical under concept permutation while the **file's line order** is
   not. A proposal must pin the concept order to get file-level byte-identity — which `config.py`
   already requires by making concept order part of `CONCEPT_SET_HASH`.

   **Scope, which is part of the finding.** This holds for one model revision (`a992e302…`), one
   concept set (v2.2, `d49a63c4…`), one runtime (mlx 0.32.0 / mlx-vlm 0.6.8) and one machine
   (Apple M3 Max, macOS 15.7.7). Determinism across machines, GPU families, MLX versions or model
   revisions was **not** tested and is **not** claimed. The condition is satisfied **for a pinned
   deployment**, and any proposal that changes a pin owes this measurement again.

   **This satisfies condition 2 only.** The four conditions are conjunctive and SAM at runtime
   remains inadmissible until 1, 3 and 4 are argued.

3. **Fast enough** — and as of 2026-08-04 the reviewer has ruled on the measurement. See below.
   **~6.2 s per cold call** is the row to quote.

4. **Plain-code methods are exhausted, or SAM is demonstrably more reliable than them.** "We reached
   for it first" does not satisfy this.

The conditions are conjunctive and the burden is on the proposal. A design that wants SAM at runtime
should say which conditions it can already argue and which it would have to establish. The oracle's
**dev-time** use of SAM is a separate matter and is untouched by this.

#### Condition 3 has been ruled on: SAM's measured cost counts as slow (reviewer, 2026-08-04)

SAM was measured at roughly **2.7–4.3 s per image**. The reviewer's ruling on that number, verbatim:

> ok this counts as slow then. Not slow enough to fully disqualify it as a runtime tool, but slow
> enough that there will have to be very good reasons to include runtime masking.

So condition 3 is **not** satisfied, and it is not failed outright either. SAM stays admissible in
principle, but the measured cost is now a **standing debt against any proposal that wants runtime
masking**: it must carry *"very good reasons"*, and that phrase is the reviewer's bar, not a
paraphrase. A proposal that reaches for runtime masking without arguing the cost has not met the
condition — silence on speed now reads as a failure to answer, because the number is known.

**Amended 2026-08-04 (`sam-determinism-1`) — the number a proposal must quote is the COLD one, and
it is ~6.2 s.** The 2.7–4.3 s band the ruling was given on is the **warm** inference cost, and this
round reproduced it independently on a different sample, a different script and six fresh processes
(min **2.68 s**, cold-machine median **2.75 s**, 144-inference mean **4.11 s**), so the ruling's
premise stands on its own feet rather than being inherited. But that band is not the runtime figure.
Under the cold frame stated below there is no resident process to hide behind, so **the model load is
paid on every call**: **≈ 6.2 s per cold call** — 4.3 s inference plus ~1.9 s model load, or
**6.8 s** with weight verification — against ≈ 4.3 s warm, which stays as **context** and is not the
row to quote (`oracle/sam/DETERMINISM_TEST.md` §5.1). **A proposal that wants runtime masking quotes
6.2 s.** The correction moves the cost the reviewer called slow *upward*, so the ruling and its
*"very good reasons"* bar are strengthened by it, not disturbed.

**The frame this ruling corrects — runtime is cold.** The reviewer's second sentence is the
architectural half, and it is broader than SAM:

> At runtime we *will not* have anything pre-computed. Pre-computed is only while we develop on a
> known corpus.

This overturns a projection made by the orchestrator, which had costed SAM-at-runtime through a
**precompute-then-serve** frame — masks computed once over the corpus and amortised across later
serves, which makes a seconds-scale per-image tool look nearly free. That frame does not describe
the shipped system and never did. The correct frame:

- **Runtime is cold and per-file.** A single input file arrives with no companions, no warm cache,
  no index, no prior pass over it, and no artifact anyone computed earlier. Whatever the algorithm
  needs at runtime, it computes **from that one file, then and there**.
- **Precompute is a development affordance only.** It exists because we work on a *known corpus* —
  a fixed, enumerable set of images we can sweep offline. Every cached mask, every embedding table,
  every warm artifact on disk is a **dev-time** convenience for that corpus, and none of it is
  available to the shipped pipeline.
- **So per-image cost is the whole cost.** There is nothing to amortise it against. A tool that
  takes seconds per image takes those seconds on **every** call, for **every** user, on a file
  nobody has ever seen — **model load included**, which is why the quotable figure is **~6.2 s cold**
  and not the 4.3 s warm inference. That is why it reads as slow here and would have read as nearly
  free under the frame this ruling corrects.

This binds every paradigm, not only ones that want SAM: **no proposal may depend on a precomputed
artifact at runtime.** If a design's cost story requires a prior pass over the corpus, it does not
have a runtime cost story.

Recorded as `data/decisions/decisions.json` →
`d-2026-08-04-runtime-is-cold-and-sam-counts-as-slow`. Condition 2's measurement is recorded in the
same file as `d-2026-08-04-sam-determinism-measured-and-satisfied-for-a-pinned-stack` and
`d-2026-08-04-sam-cross-run-identity-priors-agree-with-the-dedicated-test`.

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

### 7.1 Re-scored against a capped answer key (2026-08-03) — what survives and what does not

The table above grades every small rendition against each artwork's **largest** rendition. For
**223 of the 400 sampled artworks that largest rendition is bigger than 640 px** — up to 3,000 px —
while the instrument is hard-capped at 640 (`RESOLUTION_CAP_PX`, downscale-only) and the sharded
corpus tops out there too. So the published key was allowed to see paper grain, canvas weave and
faint gradients that **no consumer of the label and no viewer ever sees**, and renditions were
marked wrong for failing to report them. The last bullet of the original §7 called for the reference
to be capped at a viewing-plausible size and the ladder re-scored, "the run does not need repeating,
only the analysis". **That analysis has now run** — no GPU, no model, zero new inferences —
and this subsection is its result. Record: `d-2026-08-03-ladder-capped-reference-key`. Write-up:
`oracle/ladder/CAPPED_REFERENCE_NOTES.md`. Data:
`data/oracle-ladder/ladder-sample-1.capped-reference.analysis.json`.

**`ladder-sample-1.analysis.json` remains the authority for the published floors.** Both keys are
reported side by side, always; the capped column is a second reading of the same rows, not a
replacement.

| question | published floor | **capped floor** | moved? |
|---|---|---|---|
| `ground_type` | ~241 px | **~241 px** | no |
| `gradient_boolean` | ~241 px | **~241 px** | no |
| `field_texture` | ~241 px | **~341 px** | yes — one bin worse, and *unresolved* (see below) |
| `enclosure` | answerable at every size | **~241 px** | yes — gains a floor, also unresolved |
| `shading_geometry` | ~441 px | **never clears the floor** | yes — the published floor was an artifact |

**The two floors anything downstream leans on did not move.** `ground_type` and the
`gradient_boolean` derived from it — the input to the palette's gradient decision — hold at ~241 px
under the honest key, and the gradient boolean's pooled agreement gets *better*, not worse
(0.863 → **0.877**), which is what you would expect once the key stops seeing gradients that are not
there. The corpus-inclusion decision does not flip either: at 300 px the gradient boolean clears the
floor under **both** keys (0.872 published / 0.878 capped), so keeping the **2,270 300 px-only
artworks** stays correct.

**The over-sized key was biased, and the direction is now known.** Of the 40 `ground_type`
disagreements between the two keys, **23** are "the big file sees structure (`shaded_field` /
`pattern_or_texture`) where every viewable file sees `flat_field`" against **2** the other way —
**11.5 to 1** — and 20 of the 23 are exactly `shaded_field → flat_field`. The bias runs toward
**hallucinated structure**: the published key was calling gradients invisible at any size the
pipeline can be given.

**`shading_geometry`'s floor was never a resolution result.** Its same-size codec control **under
the cap is 0.796** — two byte-different encodings of *identical pixels* agree 80% of the time — so
the 0.85 floor sits **above this question's own noise ceiling** and no resolution could ever clear
it. §7's warning to "treat its floor as the size below which it is hopeless" was too generous: the
~441 px figure must not be cited as a size at which the question becomes reliable. A1's conclusion —
failing bins sit below their codec ceilings, so the drops are genuine resolution effects — **survives
for four of five questions and does not survive for this one**:

| question | published control | capped control (≤640 px) | vs the 0.85 floor |
|---|---|---|---|
| `ground_type` | 0.903 (n=206) | **0.885** (n=156) | ceiling above the floor — floor reachable |
| `field_texture` | 0.922 | **0.949** | reachable |
| `enclosure` | 0.961 | **0.955** | reachable |
| `gradient_boolean` | 0.907 | **0.887** | reachable |
| `shading_geometry` | 0.857 (n=63) | **0.796** (n=44) | **floor is ABOVE the ceiling — unreachable** |

**The one action that changes:** the per-question blind-spot list that travels with a 300 px
rendition. Under the honest key such a rendition supports `ground_type`, `gradient_boolean` and
`enclosure`, and must be tagged `below_resolution` for **`field_texture`** (newly) as well as
`shading_geometry` (already). The corpus was never the problem; the tagging was one question too
generous.

**Four limits, stated because two of them are load-bearing:**

- **The capped key is a proxy, not a downscale.** The pipeline would take the 3,000 px file and
  resample it to 640; that image was never inferred. The key used is the CDN's *own* ~483 px or
  ~333 px rendition — a different resampler and codec arriving near the same size. The size of that
  proxy error is the codec control above (0.80–0.95 by question). Carried as loose end **B26**.
- **`REFERENCE_MIN_LONG_EDGE_PX = 500` cannot survive the cap, and the deviation is stamped rather
  than hidden.** **Zero** of the 223 affected artworks own a rendition between 500 and 640 px — the
  CDN derives ~147 / ~333 / ~483 and then jumps to the original, which is also why the 561–680 bin is
  structurally empty. The headline capped column therefore uses **441 px**, a published bin edge, and
  the JSON reports 500 / 441 / 300 / 0 side by side.
- **Most verdicts are not settled at 0.85 under either key.** Most decisive bins have a 95% interval
  that *contains* 0.85 — including both bins behind the `field_texture` and `enclosure` moves. Read
  those two as "no longer supported by this data", never as "proven bad". The floor is still
  `[UNCALIBRATED]` (**A2**), and `floor_fragility` in the JSON flags every bin as settled or not.
- **Power is lower, honestly.** 1,190 → 669 primary comparisons; 373 → 193 artworks. **49 artworks
  leave the analysis entirely** because their only rendition at or below the cap is their smallest
  (~147 px), so they own a key with no rung beneath it.

**And the reassuring result: the transfer check is untouched.** Its rows were already all ≤ 640 px
(a ~300 rung against a ~640 key), so capping changes nothing — predicted 0.834 against observed
0.818, n=145 identical. The argument that lets the ladder curve be used corpus-wide never rested on
the contaminated key.

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
  size above which it is reliable. **Superseded by §7.1 (2026-08-03), which is stronger:** under a
  capped key its own codec ceiling (0.796) falls *beneath* the 0.85 floor, so the ~441 px figure is
  an artifact of an over-sized answer key and is not a resolution result at all.
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
- ~~**The answer key may be wrong at the very top.** At 3,000 px the model called an artwork
  `pattern_or_texture` where every smaller rendition said `flat_field` — seeing paper grain
  invisible at any size a user will ever view. If that turns out to be common, the reference
  rendition should be capped at a viewing-plausible size and the ladder **re-scored**; the run
  does not need repeating, only the analysis.~~ **MEASURED 2026-08-03 — it is common, it runs in one
  direction, and the analysis has been done: see §7.1.** It affects 223 of 400 sampled artworks;
  the bias is 11.5 to 1 toward hallucinated structure; the two floors anything downstream leans on
  do not move; `shading_geometry`'s floor does not survive.

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

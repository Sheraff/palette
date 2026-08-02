# V3 Phase 0 — Working Decisions

**Status:** working decisions, discussed 2026-08-02. Updated as discussions settle.
**Scope:** input policy · output contract · metrics. Referenced from `V3_PLAN.md` §6.

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
  default/minimum lives below Lc's expressible range (its dead band in (0, 7.3)). Along a gradient: the **indistinct fraction** (length of ramp below
  the bar, computed on raw values to avoid the zero-clamp phantom-flip artifact) — floor +
  max-fraction parameter shape; exact defaults open, pathology-census discussion.
- **Where parameters act is deliberately NOT decided** — "winner-stage repair" presumes
  v2-3's shape. The paradigm-neutral requirement, which becomes a bake-off criterion:
  (a) parameters at defaults → byte-identical to the unparameterized algorithm;
  (b) enabling a floor may change only artworks that actually violate it — zero collateral.

## 3. Metrics

- **One ruler.** A single same-color *rule* used everywhere (agreement, movement,
  distinctness), in Euclidean OKLab distance. **Calibrated 2026-08-02**
  (bracketing-round-1-clarified, criterion "register-as-same", 72 items, controls clean,
  repeat consistency 63%): **a single threshold was REFUTED** — dark-neutral pairs measure
  0.00876 (CI 0.00575–0.01335), roughly half of dark-saturated 0.01764, light-neutral
  0.01629, light-saturated 0.02687 (wide CI); dark-neutral's interval excludes the pooled
  0.01582. The ruler is therefore **region-dependent** (quadrant boundaries L 0.55 / C 0.05),
  `[REVIEWED]`, implemented as `sameColorBar(pair)` in the contract module. The reviewer's
  eyes discriminate dark neutrals ~2× finer than OKLab distance predicts — v2-3's dark-toe
  complaint, quantified. Full data: `research/v3/data/calibration/`.
- **Accent visibility is two-dimensional** (same round, part 2): at equal luminance a
  chromatic accent becomes functional at OKLab distance ≈0.0744 (CI 0.052–0.106) — hue
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
   *Measured constraint (2026-08-02):* identical colors do NOT produce raw APCA 0 — the
   formula's reverse branch leaves a luminance-dependent residue peaking at **|raw| = 1.9815**
   (`[MEASURED]`, exhaustive Y scan). Both ε values must exceed that ceiling or a literally
   identical fg/bg pair passes; the corpus ε distribution starts there, not at 0.
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
  *Frozen 2026-08-02:* the transparency exclusion reduced candidates from 3,097 square
  artworks to **2,757** (324 square real-transparency files were disc scans/cutouts, all
  single-rendition); **414 artworks / 1,098 files held out (15.02%)**, seed pinned `[HELD]`,
  byte-reproducible. See `research/v3/data/holdout/HOLDOUT.md`.
- **v2-3 verdicts are NOT imported into the v3 warehouse.** Their value is distilled into
  purpose-built fixture files consumed only by mechanical checks: **known-bad palettes** (feeds
  the known-worse gate), **endorsements** (feeds the concordance dashboard and reachability
  diagnostics), and **acceptable** (a "not-rejected" baseline tier for the dashboard, never an
  endorsement), each entry carrying scoping metadata (rendition, old contract version).
  *Consumption semantics (2026-08-02):* the known-worse gate keys on the **role signature**
  (four role colors, matched within the same-color bar), never the full palette signature —
  v3's decoupled-stop gradients make full-signature matches structurally impossible, and
  gradient fields on legacy entries are advisory only. Contested entries (same palette graded
  both good and bad in the source data — 2 exist) **warn, never block**; the hard gate set is
  the uncontested entries.
  Rationale: the data's value flows through exactly the two sanctioned channels; nothing can
  mistake them for current verdicts because they are not verdicts anywhere — and the v3
  warehouse schema (dual grades, code fingerprints) structurally rejects old-format records.
  Free-text lessons are already distilled in the field guide (adversarial checklist).
- **Languages:** TypeScript for almost everything; Python/MLX only where local models require
  it. **Long runs:** the orchestrator asks before starting or resuming any long run; the
  reviewer gives the go-ahead and calls cool-downs.

## 6. Open items

- Same-color-bar bracketing round (ruler unit + threshold; §3) — now also carries: the accent
  flat-zero unit/epsilon question (§4 invariant 4), the excursion bar recalibration (P1), and
  flat equal-luminance chromatic accent pairs.
- Foreground exact-zero epsilon: measurement-only (raw APCA distribution over corpus pairs).
- ~~Contrast-parameter defaults~~ **Settled (2026-08-02, after two rounds of relitigation):**
  the contrast parameters are **always set** — default = minimum = the experimentally
  determined ε of §4 invariant 4, in raw APCA units near zero. Callers can only raise the
  floor. Runtime enforcement is therefore: (1) the algorithm's reviewer-calibrated judgment +
  (2) the invariants (which include the parameters at their ε floors); anything above ε is
  caller opt-in. The pathology census remains a lab-only instrument (see §4), always active
  during development, never part of the shipped algorithm's runtime for any caller.

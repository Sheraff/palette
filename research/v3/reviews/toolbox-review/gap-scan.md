# Toolbox gap scan — what Phase 0 did not build

**Date:** 2026-08-04 · **Scope:** missing tools and unexplored tooling areas for the v3 Phase 0
toolbox · **Brief:** *"are we providing the right tools? What tools are we not providing that would
be helpful / necessary? … We have leaned hard into machine learning models… but what other areas of
tooling have we not explored that could unlock better results from the following phases?"*

**Method.** Derive the working day of the phases that consume the toolbox from `V3_PLAN.md` §6, then
walk v2-3's documented iteration pain (`ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md`, the 0.5.1 / 0.7.6 /
0.7.7 / Phase-4 postmortems, `v2-3-eval/README.md`) and the Phase-0 adversarial review, asking of each
recurring activity: what tool does this need, and does it exist? Existence claims below were checked
against the tree, not against the docs. Where an instrument half-covers a proposal, that is said
plainly — six of the nine items in the starting list turned out to be partly built, mis-scoped, or
refuted by measurement.

Cost classes are agent-hours: **XS** < 2 · **S** 2–6 · **M** 6–16 · **L** 16–40.

---

## 1. Framing correction: "before Phase 1" is a much smaller set than it looks

The brief describes Phase 1's working day as "paradigm bake-off, divergent candidate architectures,
reviewer rounds". Per `V3_PLAN.md`:229–232 those are **two different phases**:

- **Phase 1 — divergence.** Subagents each write an *architecture proposal* "from the problem spec and
  raw verdict data only — not the field guide". No palette code is written. The orchestrator then
  stress-tests each proposal against the field guide as an adversarial checklist.
- **Phase 2 — bake-off.** Prototype the 2–3 most distinct paradigms "just far enough to emit real
  palettes", auto-adjudicate against the warehouse, then blinded samples to Flo.

This distinction does real work in the tiering, in three ways.

**(a) Most of the starting list is a Phase 2 blocker, not a Phase 1 blocker.** A dev harness, a
robustness harness and a metamorphic harness all take a palette pipeline as input. `V3_PLAN.md`:198–199
already says so for rows 4 and 5 and moves them to the *Phase 2 entry condition*.

**(b) That is not a reason to defer them — Phase 1 is the window to build them.** Phase 1 is
proposal-*authoring* time; its long pole is human and reviewer bandwidth, not agent capacity. The
harnesses have no dependency on Phase 1's output and every dependency on Phase 2 starting smoothly.
If they are not built during Phase 1, Phase 2 stalls at its own declared entry gate, and each arm
hand-rolls its own harness — which is exactly how v2-3 accumulated 64 `analyze-*.ts`, ~30
`prepare-*-review.ts` and ~25 `serve-*-review.ts` scripts, a defect its own plan named
(`ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`:306, *"stop creating experiment-specific review UIs"*).
So: **schedule ≠ tier.** Items below carry a `⟨blocks Phase 2 entry⟩` marker where that applies.

**(c) A genuinely-before-Phase-1 tool is one that changes what the proposals *are*.** Three
qualify: the interface the proposals are written against, the constraint set they must satisfy, and
the statistics that will compare them. Everything else can be built alongside.

**Corollary that constrains the whole toolbox — do not ship paradigm *ingredients* before
divergence.** Phase 1's anti-anchoring rule makes what the toolbox hands the authors a load-bearing
choice. Tools that **measure** are safe. Tools that **suggest an architecture** anchor. Superpixels
handed to divergence authors nudge them toward a segmentation-shaped answer; the shipped tagging
vocabulary (103 tags / 12 axes) is v2-3's ontology in machine-readable form and re-anchors as
effectively as the field guide the rule excludes. Give them: the contract as a constraint set, the
distilled verdict corpus, the corpus census, the metric definitions. Withhold: the field guide, the
evidence-lane vocabulary, the v2-3 tag axes, and any segmentation primitive.

---

## 2. Measurements taken for this review

Two of the starting list's items are priced by facts nobody had measured. Both were measured here.

**Sharded corpus format census** (`00/`–`14/`, 7,550 files; 397 sampled at stride 19, JPEG markers
parsed directly):

| property | result |
|---|---|
| container | **397/397 baseline JPEG.** 0 PNG, 0 GIF, 0 indexed-colour, 0 progressive |
| chroma subsampling | **397/397 4:4:4** (all components Hi=Vi=1). 3 files are 1-component greyscale |
| quantization tables | **one single luma table across all 397** (identical coefficient sum) |
| APP markers | **APP0/JFIF only** — 0 ICC, 0 Exif, 0 Adobe |

The CDN normalizes every cover to one encoder recipe. Consequences: **there are no indexed palettes
to mine, no subsampling variety, no ICC, and no encoder diversity on the corpus that matters.** And
the more useful negative result — **v2-3's 72.8% re-encode collapse cannot be attributed to
input-format diversity.** The inputs are uniform; the sensitivity is entirely algorithmic. That
closes off a tempting wrong explanation before Phase 2 can chase it.

**Second collection** (`music-artworks/`, 8,595 files): 4,507 AVIF · 3,108 JPEG · 980 PNG. Probed via
the pinned `sharp` 0.33.5: AVIF is uniformly 8-bit sRGB with no ICC and ~4% alpha (clean); **PNG is
100% alpha-channelled and ~12% carries an embedded ICC profile** (6/49 sampled → ~120 files).
`CONVENTIONS.md`:58 separately records **719 AVIFs whose headers disagree with their filenames**.

**Existence sweep** (whole tree, `.ts`/`.py`/`.md`, excluding `node_modules`):

- **Genuinely absent, nothing to reuse:** colour-vision-deficiency simulation (0 hits for
  cvd/colorblind/deuteran/protan/tritan/daltonize/brettel/machado/viénot, in code *or* prose) ·
  metamorphic testing (0) · banding / dither / posterization **detector** (0 — the four hits are one
  prose mention, one docstring referring to a *removed* study, one comment, and a synthetic fixture
  named `alternating-banding`) · ICC-profile or indexed-PNG `PLTE` reading (0 — profiles are
  *normalized away* by `.toColourspace("srgb")` in 7 loaders, never read) · perceptual hashing
  (0; near-dup is embedding-cosine only) · multiple-comparison correction as code (the single hit is
  a comment `# Bonferroni/15` beside a hardcoded `0.0033`) · power / sample-size / MDE calculation
  (the phrase appears in 4 prose comments and **zero code**) · CIEDE2000 / CAM16.
- **Corrections to this review's own first pass** — three things I initially recorded as missing are
  not, and the tiering below reflects the corrected picture. My first grep was scoped to `v3/src`,
  `v3/oracle`, `v2-3-eval`, `kmeans`, `spaces`, `saliency`, `tests` and so missed `research/src/`
  and `research/v2-3-experiments/`, where all three live:
  **(i) SLIC exists** — a full implementation at `research/src/regions.ts`:109 (OKLab + edge-map
  seeding, adaptive region count, compactness 9), wrapped by `analyzeRegions()` and imported by 10+
  modules. **(ii) Perturbation primitives exist** — `research/src/image.ts` exports `cropOnePixel()`
  and `addDeterministicNoise()` (deterministic ±1 LSB), and `research/benchmark.ts` (77 LOC) already
  extracts on original/cropped/noisy and reports OKLab role drift at median/p90/max into
  `robustness.json`. **(iii) A CPU-time benchmark harness exists and uses the *correct* method** —
  `research/v2-3-experiments/perf-pass{,-2}/harness/` measures `process.cpuUsage()` user+system
  (explicitly not wall clock), times sharp decode separately, pins `sharp.concurrency(1)`, does A/B
  interleaved rounds, and ships `gate.mjs`, a byte-identity gate over the canonicalized *complete*
  return value with `NaN`/`±Infinity`/`-0` encoded explicitly.
- **Half-covered:** statistics — bootstrap, logistic+CI, Cohen's κ, McNemar and Wilson intervals all
  exist, hand-rolled and scattered across ≥5 files in two languages, with no shared module.

**A constraint the statistics item must respect:** there is no stats library on either side. Node has
no stats package; Python has `scipy` imported by **exactly one file** and no scikit-learn, statsmodels
or pandas anywhere. Every estimator in the project is hand-written twice. Whatever module gets built
has to serve both languages or the Python analyses will keep re-rolling their own — which is how the
ten findings in §3(5) happened.

---

## 3. Verdict on the nine proposals in the starting list

### (1) Paradigm dev harness — **not missing; unported.** Split verdict.

`research/v2-3-eval/` is 1,580 LOC of precisely this, already reusable: `run-corpus.ts` (94 LOC,
content-hash-keyed cache, byte-stable reruns), `diff-report.ts` (123 LOC), `make-batch.ts`,
`serve-review.ts`, `export-candidates.ts`, `eval-metrics.ts`, `bradley-terry.ts`. Framing this as a
build would waste most of the budget. Three real gaps live inside it:

**(1a) The adapter interface has no slot for intermediate artifacts. — MUST, S.**
`loadAlgorithm()` yields `{algorithmIdentity, extractPaletteFromBytes}` and everything downstream
reads `extraction.winner`. But `V3_PLAN.md`:93–96 requires scene-parse-first be scored on
*intermediate representations, not just final palettes*, and the portfolio paradigm needs per-strategy
outputs. Widen it to `{palette, intermediates, candidateDomain, winnerRationale}` **before the
proposals are written**, because proposals written against a winner-only interface will not expose
what the bake-off needs, and retrofitting five arms is five times the cost. Fold in
`export-candidates.ts`'s hard-won lesson while widening: it exists because *"a missing candidate and a
mis-ranked candidate are different bugs and were previously debugged as the same one"*
(`v2-3-eval/README.md`:213) — that is paradigm-independent, so **candidate domain and winner rationale
belong in the interface contract, not in each arm's discretion.**

**(1b) The diff has no magnitude ordering. — HIGH, XS.** `diff-report.ts` emits a boolean
"this field changed" per image, sorted alphabetically. v2-3's signature pain is blast radius, not
existence: *148 artworks moved to fix 14* (FG:153); *repairs relocated defects 13 of 15, and 290 of
298* (FG:498); *composition destroyed 7 adjudicated wins to buy 2* (FG:225). Add per-role OKLab ΔE, a
scalar move size, descending sort, and a moved-a-lot / moved-a-little bucketing. Roughly 30 lines
against the highest-frequency failure in the record.

**(1c) `run-corpus.ts` is sequential. — HIGH ⟨blocks Phase 2 throughput⟩, S.** One `for` loop at
*"~5 s per full-resolution image"* (`v2-3-eval/README.md`:44) ⇒ ~17 min per arm per change over the
200-artwork coverage set. Multiply by 5 paradigms and reviewer round-trips and this is the iteration
tax. A worker pool over the cache it already has.

### (2) Robustness harness over rendition pairs + perturbations — **the acknowledged hole, but half-stocked. HIGH ⟨blocks Phase 2 entry⟩, M.**

The most-acknowledged hole in the plan: `V3_PLAN.md`:198–199 marks both rows **"specified, NOT
built"**. But it is closer to done than that phrasing suggests, and scoping it as a fresh build would
overspend. Already in place: the doctrine (`PHASE_0_DECISIONS.md`:139–150 enumerates every gate); the
inputs (644 matched cross-rendition pairs sitting unused in the shard tree — current code uses the
rendition prefix only to *dedupe*, never to compare — plus the resolution ladder in
`data/oracle-ladder/`); resize and re-encode machinery in the oracle ladder's Python
(`common_ladder.py`, `analyze.py`); and **a working prototype of the exact shape wanted** —
`research/src/image.ts`'s `cropOnePixel()` and `addDeterministicNoise()` (deterministic ±1 LSB) driving
`research/benchmark.ts`, which already extracts over original/cropped/noisy and reports OKLab role
drift at median/p90/max into `robustness.json`.

What is genuinely missing is the *coverage*: no JPEG-quality sweep, no rescale axis, no rendition-pair
comparison, and no relabel or repeated-extraction gate. So this is generalizing a 77-line prototype
along three more axes, not new science. Baselines exist to score against from day one:
**72.8%** re-encode agreement, **0 of 114** palettes surviving a ±1-LSB dither, **~67%**
cross-rendition ceiling, **2 of 114** dual-resolution pairs identical.

The piece most likely to be dropped, and the one that must not be: **the reviewed-vs-unseen
perturbation-stability ratio.** It is success criterion 2's third number and v2-3's quantified
overfitting alarm (**1.61×**, 2.50× on core weights; healthy ≈ 1.0). `V3_PLAN.md`:199 says it is
*"tracked nowhere… measured by no instrument, which is how it stayed invisible through all of Phase
0."* It needs no new machinery — the same perturbation ops plus a reviewed/unseen split.

### (3) Synthetic ground-truth generator with exact expected palettes — **reject as posed; reframe.**

**Attack.** There is no exact expected palette for this problem. Ground truth is Flo's judgment
(`V3_PLAN.md`:46–48); the contract deliberately underdetermines the answer (ramp interior is specified
as a fraction, not a pair contrast — `contract.md`:239–241); the reviewer's own regrade agreement is
**88%**. A generator emitting "the" expected palette manufactures a target the real objective does not
possess, and scoring against it selects the paradigm that best matches *the generator author's*
aesthetic. This is v2-3's "panel neutrality is not corpus neutrality" failure moved upstream and made
worse — a synthetic panel is less representative than the 63-artwork real one that already misled
(FG:88: zero gradient flips on the panel, **24 gradients destroyed vs 1 allowed** at corpus scale).

**Reframe → synthetic *invariant* fixtures. HIGH, S — and most of it already exists.** Generate images
where a *property* is forced and assert the property, never a palette: a two-tone poster has exactly
two field colours; a pure-black frame has no accent; a linear vertical ramp is a gradient; **a ramp
plus JPEG banding is still one gradient**. That last one is not hypothetical — it is already written.
`research/src/album-artwork-palette-v2-0.7.6-fixtures.ts` holds a per-pixel `image(w, h, (x,y) => RGB)`
generator plus ~20 labelled gradient positives and negatives (`broad-radial`, `broad-weak-curve`,
`broad-compressed-noisy`, **`alternating-banding`**, `typography-bars`, `object-local-ramp`,
`skin-clothing-ramps`), and `v3/src/contract/fixtures.ts` adds synthetic `PixelSource` builders
(`bandedSource`, `iterableSource`, `sparseSource`) with ~45 palettes each engineered to trip exactly
one invariant.

So the work is **promotion, not creation**: these are fixture arrays consumed by one version's tests,
not an instrument any paradigm can run. Lift the generator out, add the degenerate cases row 4 names
(pure black, single colour, extreme aspect, greyscale), and expose it as a bench. This is what makes
the metamorphic harness testable, and it carries none of the target-manufacturing risk.

### (4) Metamorphic test harness — **genuinely missing (`metamorphic`: 0 hits anywhere). HIGH ⟨blocks Phase 2 entry⟩, S on top of (2).**

The right generalization of (2): v2-3's gates *are* metamorphic relations that nobody named as such —
relabel invariance, iteration-order invariance, dither, re-encode, resolution. Naming them unlocks the
ones nobody thought to write, chiefly **hue-rotation equivariance**: rotate input hue by θ and every
role hue should rotate by θ with lightness and chroma fixed. That is a strong oracle requiring no
human, and it targets v2-3's root pathology directly — a quantization grid whose *"origin sits on the
neutral axis"* with *"dark bins so fine each holds ≤1 representable grey"* (FG:50–63) cannot be
hue-equivariant, and the test would have said so on day one. Add global lightness scaling and
horizontal-flip invariance.

**Honest caveat to record with it:** hue equivariance is not unconditional. A paradigm using learned
semantic priors (sky is blue, skin tones) will violate it *legitimately*. Ship it as a diagnostic with
a declared exemption, never as a gate — otherwise it silently penalizes the scene-parse paradigm.

### (5) Shared statistics module — **genuinely missing, and the best-evidenced item on the list. MUST, M.**

Statistics are re-implemented per analysis across ≥8 unrelated files (`analyze-bracketing.ts`,
`bars.ts`, `bradley-terry.ts`, `near_dup_census.py`, `bakeoff_census_aware.py`, `config.py`,
`constants.ts`) with no shared module. The adversarial review found **ten distinct classes** of error,
and each is a re-implementation error that **changed or would change a published conclusion**:

| finding | where | consequence |
|---|---|---|
| multiplicity applied asymmetrically — corrected for the rejected hypothesis, raw binomial for the recommended one | `premise-analyses.md`:192–208 | *"the asymmetry of rigour is the finding, not the p-value"* (`cascade-basis.md`:260) |
| in-sample base rate + wrong test | `cascade-basis.md`:246–258 | Fisher 2×2 gives 6.21e-09 vs the quoted binomial |
| wrong-slice p-value | `cascade-basis.md`:265–273 | quoted 2.3e-7 is ~2,000× smaller than the correctly-scoped 1.13e-04 |
| no paired test where one was needed | `embeddings-corpus.md`:100–113 | McNemar on the same 24,648 pairs collapses a published ranking to p=0.816 |
| CI emitted from a perfectly-separated logistic | `contract.md`:288–318 | width moves **2.4× non-monotonically** with the ridge penalty; unbounded at zero |
| pseudo-replication | `contract.md`:358–378 | 24/120 "points" are byte-identical repeats; dropping them moves **two frozen constants by >10%** |
| denominator/registration inflation | `premise-analyses.md`:123–150 | 42/45 is 35/36 as registered; later 34 pass / 2 **FAIL** |
| post-hoc threshold | `PROPOSED_LEDGER_UPDATES.md`:105 | `SINGLETON_NEAR_ONE = 0.90` set after seeing data |
| truth-source noise uncorrected | `cascade-basis.md`:281–283 | at flag-vs-reviewer κ=0.0625, no p-value against the flag transfers to the binding judge |
| vacuous guards over empty input | `premise-analyses.md`:77–93 | `canary_stable: true` reported over zero rows |
| **no power analysis appears anywhere** | — | round sizes are chosen by feel |

Design principle that matters more than the function list: **make the errors unrepresentable, not
merely avoidable.** Pairing structure and the multiplicity family are *required arguments*, not
options. `n` must be declared as `units` or `trials` (kills pseudo-replication at the type level). CIs
are suppressed on separated fits. Empty input throws rather than returning `stable: true`. Add
`preregister()` writing threshold, n and test *before* data is read.

**Why MUST rather than HIGH:** it is pure-function work with zero dependency on a pipeline, so there is
no reason to wait; and the first comparison between two things happens the moment two proposals exist.

### (6) File-format forensics — **refuted by measurement for the main corpus; one XS residue is real.**

Per §2: 0 indexed-colour files, 0 ICC, uniform 4:4:4, one quantization table across the entire sharded
corpus. **Indexed-palette mining and subsampling forensics are worth nothing here.** Reject as a
standing tool.

**(6a) TS↔Python decoder agreement check. — HIGH, XS.** The one real residue, and nobody has checked
it. The palette side is TypeScript/`sharp` 0.33.5; the oracle, SAM and embeddings sides are
Python/PIL + `pillow_avif`. If they disagree on AVIF (52% of the second collection), on ICC handling
(~120 PNGs carry profiles) or on alpha flattening (100% of sampled PNGs are alpha-channelled), then
**every oracle label is attached to different pixels than the palette ever saw** — a silent
decorrelation no other instrument in the toolbox can detect, and one that would invalidate the
scene-parse paradigm's entire evaluation while looking like a modelling failure.

Three specific reasons to expect drift rather than to assume none. **(i)** Neither side reads ICC —
the TS loaders call `.toColourspace("srgb")`, which *normalizes profiles away* rather than applying
them, and no code anywhere reads a profile; whether the two libraries make the same assumption for a
tagged non-sRGB PNG is unknown. **(ii)** EXIF orientation is implemented **twice independently** —
`sharp .rotate()` on the TS side, explicit EXIF-transpose in `embed.py` and `sam/overlay.py` on the
Python side. **(iii)** Two sharp versions are installed side by side, `sharp` 0.33.5 and `sharp-modern`
0.35.3, and `CONVENTIONS.md`:6–12 already warns the modern alias must never be selected by resolution —
an existing acknowledgement that decode is version-sensitive. `CONVENTIONS.md`:58's 719
header-disagreeing AVIFs are the second hint that decoder trust is not free.

Decode the same 200 files both ways, diff the arrays, report max channel delta. Two hours to
permanently close a landmine.

**(6b) Alpha-flatten calibration harness. — NICE, S.** Unrealized idea §12, made concrete by the
100%-alpha PNG finding: flattening to white vs black vs premultiplied changes the palette. Low
priority because those PNGs are largely excluded from the candidate set already.

### (7) Contract-as-constraint-set enumerator/scorer — **half-exists; the built half was thrown away. MUST, M (+XS).**

The contract already *is* a constraint set — I1–I5 plus `CONTRACT_FLOOR_PAIRS`, the epsilons,
`sameColorBar` by region and accent visibility distance (`contract.md`:39–156) — machine-checked by
`src/contract/invariants.ts` and exercised over 554 real palettes. And an enumerator was **built and
discarded**: the auditor's ten self-certification attacks and a **3-million-random-palette search** for
a validating escape lived in `/tmp/contract-audit` and were never committed (`contract.md`:120–135),
alongside a mutation-tested copy of the suite in `/tmp/mutaudit`.

**Recommit the adversarial search as a standing contract fuzzer — XS**, it already exists in history.

**Build the piece that does not exist: a feasible-palette sampler/projector — M.** Given an artwork's
colour evidence, sample from or project onto the set of palettes satisfying the contract. Every
paradigm needs it and for different reasons: the global-objective paradigm needs it as the feasible set
to optimize over; the portfolio paradigm needs it to repair each extractor's output; scene-parse needs
it to convert a parse into a legal palette. Without it each arm implements contract satisfaction
differently and **the bake-off silently compares repair strategies rather than paradigms.**

**Blocking prerequisite — fix F2 first (XS).** `minTextContrast` against *gradient stops* is specified
in §2 and **enforced nowhere**, so a palette whose text is invisible against half its own gradient
validates clean (`contract.md`:217–248). Shipping a sampler on a contract with a known hole
mass-produces that hole across every paradigm. Related: a constant *"refuted and replaced"* is still
quoted at its refuted value in six places, reopening the invisible-pair hole (`SUMMARY.md`:443–447).

### (8) CVD simulation — **absent; but attack the stated purpose. NICE, XS.**

Genuinely absent: **0 hits** for deuteranopia/protanopia/tritanopia/colour-blindness across all source
and all nine adversarial reports. But the brief's justification — *"grounding the functional-visibility
threshold"* — does not hold. Contrast here is *deliberately* low with the hard minimum a user parameter
defaulting ≈0; the product is explicitly not chasing an accessibility floor, and the thresholds are
already frozen and mutation-tested (`EPSILON_TEXT_RAW`/`EPSILON_ACCENT_RAW` = 2.5 raw APCA,
`ACCENT_VISIBILITY_COLOR_DISTANCE` = 0.07444, all surviving wide mutation, `contract.md`:250–270).
CVD simulation cannot ground a product decision that has already been made on other grounds.

**What it is actually good for:** a *failure-mode axis* in the diff and the review sheets.
`ACCENT_VISIBILITY_COLOR_DISTANCE` is a colour-distance guard, so a red-accent-on-green-background pair
can clear it comfortably in sRGB while sitting at near-zero distance for a deuteranope. That is a real,
cheap, paradigm-independent failure class nobody has looked at. Three 3×3 matrices (Viénot/Brettel).
**Never a gate** — promote to HIGH only if the first sheets actually show accent collapse.

### (9) Classical CV — **split three ways; they are not one item.**

**(9a) Banding / dither / quantization-artifact detector. — HIGH, S.** Motivated by the worst
robustness enemy on record: a ±1-LSB dither moved **all 114** test palettes, losers by a *median 8
utility bands* — not tie-breakable (FG:50–63). But build it as an **input descriptor, not a fix**:
label every cover with its banding, noise and quantization character so robustness failures can be
*stratified* — "we fail on banded gradients" — instead of collapsing into one undifferentiated 72.8%.
This converts the robustness harness from a scalar into a diagnosis, which is what Phase 2's
"how does it fail?" question actually requires.

**(9b) Flat-region / field detection. — HIGH, S–M.** Already needed twice elsewhere, which is the
argument for building it once and sharing it: **invariant I2's spatial-spread half is unimplemented and
the seam does not exist** (`grep -c spatialSpreadValidator` = 0, `PHASE_0_LOOSE_ENDS.md`:126–140 / A4),
and the gradient module's indistinct-fraction is unbuilt (B15). Role semantics already define fields as
large areas, so this is contract-adjacent rather than merely CV.

**(9c) Superpixels. — already built; do not *ship* it. XS to withhold.** Correcting the premise:
SLIC exists and is mature — `research/src/regions.ts`:109, OKLab with edge-map seeding, adaptive
region count, compactness 9, wrapped by `analyzeRegions()` and imported by 10+ modules. Connected
components and flood fill exist in five more places. Nothing needs building.

The recommendation is therefore not "build it" but "**do not put it in the divergence authors'
hands**". It is a paradigm *ingredient*, not an instrument; SAM masks already serve region proposal
better; and offering a ready-made segmentation to authors who are supposed to reason from the problem
spec anchors them toward a segmentation-shaped answer, which is precisely what Phase 1's rule forbids.
That it already exists makes withholding free: whichever paradigm concludes it wants superpixels will
find them waiting.

---

## 4. Areas nobody named

### (A) The auto-adjudication consumer — missing **and untracked**. HIGH ⟨blocks Phase 2 entry⟩, S. ★

`V3_PLAN.md`:52–56 makes this the engine of early v3 velocity: *"destination adjudication runs against
the old warehouse before any human review — a large fraction of early v3 iteration can be
auto-adjudicated."* It is the plan's answer to its own stated binding constraint.

**The hard half is built.** `data/legacy/` holds the distillation, and it is substantial — verified
here: **351 endorsements + 166 acceptable + 37 known-bad = 554 entries**, each keyed by `artwork` and
carrying `paletteSignature`, `roleSignature`, `standingGrade`, `contested`, `supersededByLaterGrade`,
`epistemology` and `evidence`. That is a real verdict index, and it means Phase 1's authors *do* have
the "raw verdict data" the anti-anchoring rule promises them.

**The easy half is missing, and worse, invisible.** Nothing takes a *new* candidate palette and
adjudicates it against those files into the four tiers. The adversarial review found the concordance
dashboard has *"fixtures… consumer doesn't [exist]"* and — the part that matters — that it is
**"untracked rather than deferred"** (`unrealized-ideas.md`:446–466). It is not in the loose-ends
ledger and not in the Phase 2 entry condition, so **no status check will ever surface it.** Rows 4 and
5 at least announce their own absence; this one does not.

Build it, and encode the warehouse's epistemology *as code* rather than as prose: verdicts are
censored, relative and rendition-scoped, so the tool must emit **guardrails** ("never move TO
known-worse") and never a fitted score. `V3_PLAN.md`:54–56 states this and no instrument enforces it.
A second reason it must exist before human review starts: every iteration it absorbs is reviewer time
saved, and reviewer bandwidth is the binding constraint (`V3_PLAN.md`:257).

### (B) Output-continuity / cliff profiler. HIGH, S–M. ★

**v3's success criterion 1 is that decisions be "few, global, and made over smooth quantities" — and
no instrument measures smoothness.** The perturbation gates measure stability *at a point* (does the
palette survive ±1 LSB); they say nothing about the *shape* of the response.

Sweep a continuous input path — brightness ramp, hue rotation, JPEG quality ladder, alpha blend
between two covers, progressive crop — and plot output-palette distance against input distance. Report
a discontinuity count and an empirical Lipschitz constant per paradigm.

Why this matters more than the gates: it is the only instrument that can distinguish a paradigm that is
*architecturally* smoother from one that got lucky on this corpus — and it works on an **immature**
prototype. That is precisely what `V3_PLAN.md`:230–232 demands and provides no way to see: *"judge
trajectory and ceiling, not first-round scores… otherwise the incumbent wins by default and the
rewrite converges back to v2-3."* A prototype can lose every head-to-head while showing a Lipschitz
constant an order of magnitude better than v2-3's, and under the current toolbox that fact is
unobservable. Composes with (2)'s perturbation ops and (4)'s paths.

### (C) Reviewer-budget and information-yield planner. MUST, S. ★

Reviewer bandwidth is named the binding constraint (`V3_PLAN.md`:257, `PHASE_0_LOOSE_ENDS.md`:1542) and
**nothing measures it.** `REVIEW_UI.md`:122 states outright there is *"no timing of the reviewer."*

The evidence that this is already past a limit, not a hypothetical: a round of 20 artworks × 8
questions = **160 answers in one sitting at ~2.9 s median**, producing a **45% contradiction rate
against a pre-registered 10% ceiling** (`review-server.md`:64–88, corrected at `SUMMARY.md`:679–686).
The named causes are gate wording, ambiguity and fatigue — *explicitly not reviewer competence*. That
round's data now sits under standing prohibition **L-b**: nothing may be graded against it until the
rate has a reading. An entire round, wasted, for want of a round-size instrument. Separately,
intra-round self-consistency is **structurally unmeasurable** because a collision guard refuses
repeats, while a "63% repeat-consistency floor" from a *different task* is quoted as a live standard
(`review-server.md` minor 20).

What it does: record per-item latency, position-in-round and revisit; report contradiction rate against
round length and position; and — the half that changes decisions — **cost a round before running it**:
"detecting effect d at the reviewer's measured 88% self-agreement needs n items ≈ m minutes." That is a
power analysis denominated in reviewer-minutes, and no power analysis exists anywhere in Phase 0. It
composes with (5) and is the highest-leverage process instrument in this document, because it decides
whether a round is worth running at all.

### (D) Blinding-integrity checker. MUST, S. ★

**Blinding is currently 100% defeatable from served content** — 24/24 arm assignments recovered by "the
side with a gradient is arm-beta"; stop count, collapse flags, CSS geometry and raw float stop
positions all leak (`SUMMARY.md`:104–116, `review-server.md`:20–62). The review notes it is
*"unmeasurable from anything in the repo"* and that it *"first applies on the round that matters
most."*

The round that matters most is the Phase 2 bake-off — and **divergent paradigms will carry far more
conspicuous signatures than two v2-3 arms did.** A scene-parse arm and a global-objective arm will be
distinguishable at a glance. Build the adversary: given a batch, attempt to recover arm identity from
the served payload alone (a trivial classifier over served features), report accuracy against 50%, and
block release above chance. This converts blinding from an assumption into a measurement. MUST because
it is cheap and must exist *before* the batch design it constrains — and because the alternative is
discovering after the bake-off that its verdicts are void.

### (E) Content-addressed feature/artifact cache. HIGH ⟨blocks Phase 2 throughput⟩, S.

Decoded pixels, SAM masks, embeddings and oracle labels for ~7.5k covers, keyed on (content hash,
operation, params). `run-corpus.ts` already implements exactly this pattern for palettes — cache key is
image sha256 + algorithm identity + label, nothing time-dependent written — so this is generalizing a
proven local design. Without it, five paradigm arms each re-decode and re-segment; **scene-parse-first
is simply not runnable at corpus scale without cached masks**, which would quietly eliminate a paradigm
on logistics rather than merit.

It also repairs a documented failure class: the 0.7.7 audit was **voided as provisional because the
implementation hash omitted runtime dependencies** and the analyzer trusted recorded values
(`…0_7_7_COMBINED…POSTMORTEM.md`:50–61). A cache key covering the full dependency closure makes that
kind of voiding structurally impossible.

### (F) Run provenance / re-run-and-diff headers. HIGH, S.

*"No analysis file carries a warehouse input-count/hash header, so 're-run and diff' is unavailable"*
(`contract.md`:434–443). The matching v2-3 wounds: labels go stale the moment trunk moves (FG:534); a
four-arm thread was funded by a stale label cache with no code fingerprint (FG:540); `records rot` —
four recorded facts wrong on re-check (FG:240); `fundedByArtifacts.sha256` drifts with no re-hash pass
(B23); *"no tool recomputes it"* (`data/decisions/README.md`:136,179); the fact-check found 34
corrected / 12 unverifiable / 4 contradicted claims, with *"three of the guide's most quotable numbers
living only on unmerged worktree branches"*.

Every analysis output gets a header — input set hash and count, code fingerprint including
dependencies, decision-record ids consumed, seed — plus one `verify` command that re-derives and diffs.
This is the cheapest available fix for the largest documented category of wasted work in the entire
project record.

**One concrete prerequisite found while inventorying: the Python half has no dependency manifest at
all.** No `requirements.txt`, `pyproject.toml`, `Pipfile`, `uv.lock`, `setup.py` or `environment.yml`
exists anywhere in the tree; four git-ignored Python 3.14 venvs back the oracle workstreams, and
package versions are recorded **only in README prose and `config.py` hashes**. Model weights are pinned
immaculately — HF commit plus safetensors sha256 plus byte count — while the interpreter and library
stack under them are pinned nowhere. A "code fingerprint including dependencies" is not computable on
the Python side until that is fixed, and it is an hour's work to freeze four venvs.

### (G) Warehouse fsck / evidence-integrity pass. HIGH, S — and fix the red suite first (XS).

Named gaps: no fsck for the warehouse; the amendment allowlist is checked at one door only; nothing
recomputes evidence hashes; no gate-consistency section is computed at all; `verify-live` never crawls
the JSON the pages load and has no timeout; the calibration artifact `mask-quality-analysis.json` does
not exist on disk. And **the committed test suite is RED (297/1)** (`SUMMARY.md`:275–280). The
warehouse is the asset `V3_PLAN.md` §2 says carries over — it is the foundation the rewrite stands on.
A phase declared complete with a red suite should not be the state Phase 1 inherits.

**A test-coverage inversion worth fixing in the same pass.** `v3/src` carries 43 test files and ~17k
lines of test code, and the four modules with **zero tests** are exactly the four whose outputs are the
most consequential and the hardest to reverse: the **holdout freeze**, the **coverage set build**, the
**legacy verdict distillation**, and the **calibration-consequence run**. Those four produce, in order:
the thing that makes every generalization claim meaningful (and whose v1 already leaked, voiding it),
the canonical tuning bench, the 554-entry corpus that item (A) depends on, and the ruler's
consequence analysis. A redraw of any of them is a new file rather than an edit, which is good
discipline — but it also means a silent defect is inherited forever rather than corrected. XS–S each,
and they gate the credibility of everything downstream.

### (H) Cost as a bake-off axis — the harness exists, the *budget* does not. HIGH, XS–S + one decision.

**Zero occurrences of latency, milliseconds, memory budget or throughput in any Phase 0 document. No
production runtime target exists anywhere.** v2-3 landed at ~0.7 s median / 1.29 s mean and reasonably
treated cost as a non-issue. But the paradigms differ by orders of magnitude — a global search over a
feasible set, or a scene parse, is not a 0.7 s operation. **If cost is not a bake-off axis, Phase 2 can
select an unshippable paradigm and discover it in Phase 3**, after commitment. One shelved v2-3
mechanism cost **+74% runtime**; that is the kind of fact that must surface during a bake-off, not
after it.

**The instrument is already built and it already uses the right method** —
`research/v2-3-experiments/perf-pass{,-2}/harness/`: `process.cpuUsage()` user+system rather than wall
clock (documented reason: the dev machine was loaded, so wall clock measures contention), sharp decode
timed separately, `sharp.concurrency(1)`, A/B interleaved rounds, a fixed 10-image profile set
annotated by size and character, V8 `.cpuprofile` readers, and `gate.mjs` — a byte-identity gate over
the canonicalized complete return value with `NaN`/`±Infinity`/`-0` encoded explicitly so
`JSON.stringify` cannot hide numeric drift. It is pinned to `v2-3/src/internal/`; the work is
repointing it at the widened adapter interface of (1a). That also preserves the hard-won methodology
FG:653 prescribes — worth stating because profilers misattributed by **4×** after a single pass
(FG:574), so an arm that rolls its own timing will get it wrong.

**The blocking sub-item is not an agent's to decide: somebody must state the budget.** A profiler
without a target measures without deciding, and this is the one gap here that no amount of agent-hours
closes.

### (I) Failure-class tracker — named, counted, tracked across versions. HIGH, M.

`V3_PLAN.md`:120 promises embeddings turn *"one-off anomalies into named, counted classes."* The
embeddings exist; the longitudinal half does not. The missing question is not "what failed" but **"did
class X shrink, or did it move?"** — because relocation-not-repair is v2-3's defining pathology:
repairs relocated defects **13 of 15**, and **290 of 298** (FG:498); composition destroyed 7 adjudicated
wins to buy 2 (FG:225). A per-class before/after table with an explicit *moved vs fixed* column is the
direct instrument for the failure mode that cost v2-3 the most rounds. Composes with the embeddings,
the shipped tagging vocabulary and (1b)'s magnitude-sorted diff.

### (J) Corpus-drift / panel-representativeness monitor. HIGH, S–M.

No corpus-drift instrument exists; drift is handled only for the *reviewer* (calibration repeats). And
"not in the coverage set" does not mean clean, because the coverage set touches all 36 clusters. The
question it must answer is v2-3's sharpest lesson in tool form: **is the slice I just reviewed
representative of the corpus on the axis I just changed?** The canonical failure is FG:88 — a
63-artwork panel showed *zero* gradient flips while the corpus showed **24 gradients destroyed against
1 allowed**. Reweight panel → corpus through the embedding strata and report the extrapolated corpus
effect with its uncertainty. This is the tool that would have caught the single most expensive v2-3
error, and the strata it needs are already built.

### (K) Provenance-enforcing constant API. MUST, XS–S.

`src/honesty/` measures tunable sites and provenance fraction — but it is a **census, run after the
fact**. B29 records that per-workstream tagging plus `--check` in CI was **not adopted**, and the
reviewer ruled the untagged backlog a *Phase 1 obligation*. A census cannot prevent an anonymous
literal from being written; a typed `param(value, tag, provenance)` helper plus a lint rule can.
Criterion 2 asks for constants *"each carrying provenance from birth"* — **"from birth" is an
authoring-time property and the only instrument is a reporting-time one.** MUST because Phase 1 is
precisely when the new constants get written, and v2-3 proved retrofitting provenance across 908 sites
is not something anyone does twice.

### (L) A browsable verdict corpus for Phase 1 authors. NICE, XS.

Minor, but it serves the anti-anchoring rule directly. The 554 distilled entries are artwork-keyed
JSON; pairing them with their images in a static page lets divergence authors actually *look* at what
was endorsed and rejected, which is the one input the rule permits them. Cheap, and it makes the
"raw verdict data only" instruction real rather than nominal.

---

## 5. Tiered summary

**MUST — before Phase 1 starts** (these change what the proposals are, or exist to be cheap insurance
on rounds that begin immediately):

| item | cost |
|---|---|
| (1a) Widen the paradigm adapter interface — intermediates, candidate domain, winner rationale | S |
| (5) Shared statistics module, errors unrepresentable by construction | M |
| (7) Feasible-palette sampler/projector + recommit the contract fuzzer — **fix F2 first** | M + XS |
| (C) Reviewer-budget / information-yield planner | S |
| (D) Blinding-integrity checker | S |
| (K) Provenance-enforcing constant API + `honesty --check` in CI | XS–S |

**HIGH** (build during Phase 1; `⟨P2⟩` marks a Phase 2 entry or throughput blocker):

| item | cost |
|---|---|
| (2) Robustness harness incl. the reviewed-vs-unseen ratio ⟨P2⟩ | M |
| (4) Metamorphic harness — hue equivariance, with a stated exemption ⟨P2⟩ | S |
| (A) Auto-adjudication consumer — **missing and untracked** ⟨P2⟩ | S |
| (B) Output-continuity / cliff profiler — the measurement of goal 1 | S–M |
| (E) Content-addressed feature cache ⟨P2⟩ | S |
| (I) Failure-class tracker, moved-vs-fixed | M |
| (J) Corpus-drift / panel-representativeness monitor | S–M |
| (3a) Synthetic *invariant* fixtures + degenerate sweep | S |
| (9a) Banding/dither descriptor for stratifying robustness failures | S |
| (9b) Flat-region detection — also discharges A4 and B15 | S–M |
| (F) Run provenance / re-run-and-diff headers + freeze the 4 Python venvs | S |
| (G) Warehouse fsck — **and fix the red suite, and test the 4 untested irreversible modules** | S (+XS) |
| (H) Repoint the existing CPU-time perf harness at the new interface — needs a stated budget | XS–S |
| (1b) Magnitude-sorted diff | XS |
| (1c) Parallel `run-corpus` ⟨P2⟩ | S |
| (6a) TS↔Python decoder agreement check | XS |

**NICE:** (8) CVD simulation as a diagnostic axis, XS · (6b) alpha-flatten harness, S · (L) browsable
verdict corpus, XS.

**Rejected / reframed / already built:**

- **(3) exact-expected-palette generator — rejected.** No such ground truth exists; reframed to (3a),
  which is mostly promotion of fixtures that already exist.
- **(6) file-format forensics — refuted by measurement.** The corpus is 100% uniform JPEG: no indexed
  palettes, no ICC, no subsampling variety, one quantization table. Reduced to (6a).
- **(8) as a threshold-grounding tool — rejected.** The threshold is a frozen product decision, not an
  accessibility question. Kept only as a diagnostic axis, never a gate.
- **(9c) superpixels — already built** (`research/src/regions.ts`), so the action is to *withhold*
  it from divergence authors, not to build it.
- **(1) dev harness, (2) perturbation primitives, (H) CPU-time profiler — already built in part.**
  Between `v2-3-eval/` (1,580 LOC), `research/src/image.ts` + `benchmark.ts`, and
  `v2-3-experiments/perf-pass*/harness/`, the majority of the starting list's items 1, 2 and the
  unnamed profiler exist and need porting and generalizing rather than authoring. Scoping them as
  builds would be the largest single misallocation available here.

---

## 6. The one-line answer to the brief's question

The starting list is well-aimed but over-weighted toward things that turn out to be **already built,
partly built, or refuted by measurement** — five of its nine items (1, 2, 3, 6, 9) came back that way,
and the honest saving is that most of the "build a harness" budget is really a porting budget.

What it under-weights is the two categories the record says actually cost v2-3 the most:

1. **Process instruments** — reviewer budget (C), blinding integrity (D), provenance headers (F),
   corpus drift (J). Every one of these has a documented incident behind it: a 160-answer round voided
   at a 45% contradiction rate, blinding recovered 24/24, whole audits voided for a missing dependency
   hash, and a 63-artwork panel that showed zero gradient flips while the corpus lost 24. These are not
   hygiene; they are the failure modes that consumed rounds.
2. **Instruments that measure the property v3 actually claims to improve** — the cliff profiler (B) for
   "few, global, smooth decisions", and the reviewed-vs-unseen ratio inside (2) for overfitting. v3 has
   three success criteria and currently has an instrument for one of them.

The single most consequential omission is **(A)**: the auto-adjudication consumer that `V3_PLAN.md`
names as the engine of early velocity is unbuilt on top of a 554-entry corpus that *is* built — and
because the review found it **"untracked rather than deferred"**, it is the one gap in this document
that the project's own status machinery cannot see. Rows 4 and 5 at least announce their own absence.

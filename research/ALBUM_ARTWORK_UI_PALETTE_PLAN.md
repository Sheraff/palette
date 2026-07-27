# First-Principles Album Artwork UI Palette Plan

Status: current product-research direction as of 2026-07-26. This plan replaces the candidate
architecture and phase ordering in `PALETTE_EXTRACTION_QUALITY_RESET_HANDOFF.md` where they conflict.
It does not alter historical artifact custody, reserve-data restrictions, or the requirement for a
separate explicit `GO` before the one remaining multi-hour full run.

## Mission

Build a palette extractor designed specifically for album artwork and rendered UI treatments. Given
one artwork image, it must return two to four colors that feel representative of the artwork and work
together in their assigned UI roles.

The product is not a generic dominant-color extractor and is not required to preserve the logic or
architecture of `region-graph-0.19.0`. Version 0.19 remains useful as historical evidence, an external
comparison baseline, and a source of implementation lessons.

The first-principles question is:

> Which field treatment, foreground, and optional accent best carry this artwork's identity into the
> consuming UI?

The next milestone is a fast native-resolution prototype that repeatedly generates several
ship-worthy complete treatments on a diverse development panel. It is not a cache, a learned model,
or a full-roster run.

## Product Contract

The output has two required roles, two optional roles, and one field-treatment flag:

```ts
interface AlbumArtworkPalette {
  background: RGB
  foreground: RGB
  surface?: RGB
  accent?: RGB
  gradient: boolean
}
```

Supported cardinalities are:

| Colors | Treatment |
| ---: | --- |
| 2 | background, foreground |
| 3 | background, foreground, accent |
| 3 | background, surface, foreground |
| 4 | background, surface, foreground, accent |

Contract invariants:

- `background` and `foreground` are always present.
- `gradient: true` requires a distinct `surface` color.
- A `surface` with `gradient: false` represents a separate flat field or UI layer.
- A `surface` with `gradient: true` is the second artwork-supported field color used to construct the
  UI gradient.
- An accent is optional. The extractor must not spend a color on an accent when a second field color
  carries more of the artwork's identity.
- The selected roles are inferred jointly. Foreground and accent choices must be evaluated against
  the complete field treatment.

The public contract may remain this small even when inference retains richer internal evidence such
as gradient direction, confidence, endpoint bands, spatial masks, and provenance.

## Core Principles

### Native resolution is the discovery source

Do not resize the image before discovering color families, connected regions, or signature-color
candidates. Downsampling may erase small typography, symbols, objects, highlights, and other colors
that are important to an album's identity.

Derived lower-resolution or blurred observations are still permitted as supplemental evidence for
field stability, low-frequency structure, and robustness. They must never be the only path by which a
candidate color can enter the domain or the sole reason a native-resolution signature candidate is
removed.

Large images may be processed in tiles or streaming passes. Performance optimizations must preserve
native pixels and region connectivity rather than silently replacing the source with a resized
raster.

### Spatial meaning matters more than global population

The most common color is not automatically the best background, and a small color is not
automatically irrelevant. The extractor must distinguish at least three evidence lanes:

- field evidence from broad, coherent, background-like regions;
- signature evidence from distinctive objects, typography, symbols, and repeated or salient small
  regions;
- foreground evidence from artwork-supported or explicitly generated colors that remain usable over
  the selected fields.

Candidate generation may share lower-level color families across lanes, but role-specific evidence
must remain explicit.

### Field treatment is inferred before or with its colors

`gradient` is not an after-the-fact question about whether two selected colors look pleasant when
interpolated. A gradient field hypothesis starts with evidence that the artwork contains a spatially
coherent background gradient. Its two selected field colors are representative endpoints or endpoint
bands of that observed structure.

Likewise, a non-gradient two-field hypothesis must identify distinct artwork fields or a defensible
background/surface relationship. The generator must not manufacture a surface solely to reach four
colors.

### Representativeness is evidence, not a universal color rule

Neither exact source pixels nor generated centroids are universally correct:

- an exact pixel can be JPEG noise, a transient highlight, or a tiny irrelevant outlier;
- a centroid can create a color that is not visibly present in the artwork;
- a global medoid can have poor spatial support, especially in a broad gradient;
- a small but coherent exact-color region can be an essential signature color.

Each emitted artwork-derived color must therefore carry source-support evidence. Exactness is one
feature of that evidence, not the entire legality policy.

### UI requirements are configurable

Contrast requirements depend on the consuming UI and may be much more lenient than ordinary web
accessibility thresholds. The extractor must accept explicit pairwise contrast policy rather than
embedding one universal floor.

### Candidate quality comes before infrastructure and learning

First prove that the domain contains good complete treatments. Do not begin by building a full-roster
cache, a certificate system, or a learned hard veto. Persistence and learning are justified only
after native-resolution candidate generation is visibly useful.

## First-Principles Architecture

```text
native encoded image
  -> native raster and perceptual pixel evidence
  -> tolerant color families and connected region hierarchy
  -> field-treatment hypotheses
       solid field
       separate flat fields
       spatially validated gradient field
  -> signature and foreground candidate pools
  -> source-supported representative selection
  -> bounded joint search over 2-4 role colors
  -> configurable pairwise contrast policy
  -> deterministic multi-objective ranking
  -> diverse complete-palette slate
  -> rendered human evaluation
  -> optional learned ranking only if later justified
```

## Native-Resolution Evidence

### Pixel evidence

Decode and inspect the native raster. Preserve enough information to answer:

- which perceptual colors are present;
- how densely each color neighborhood is occupied;
- where those colors occur;
- whether their support is connected, repeated, scattered, or noise-like;
- which colors participate in broad fields, gradients, edges, typography-like structures, or salient
  local regions.

Use a perceptual color space for distance and density calculations while retaining original RGB
values and pixel provenance.

### Tolerant color families

JPEG noise and natural-image variation make exact RGB connected components insufficient. Build color
families from perceptually nearby pixels while preserving multimodality and spatial structure.

A family should retain at least:

- a color distribution rather than only one representative;
- population and local color-density summaries;
- connected regions or compact region evidence;
- border, center, quadrant, and broad spatial coverage;
- local contrast and neighboring-family relations;
- chroma and tone distributions;
- edge and detail statistics;
- evidence under small quantization or compression perturbations;
- exact source exemplars near important modes.

Do not merge two visibly distinct modes merely because their arithmetic centroid is nearby.

### Region hierarchy

Build a region representation that can retain both broad fields and small signatures. A fixed-size
superpixel or a minimum-population filter must not be allowed to erase a coherent small region before
its saliency and role evidence are measured.

Useful region evidence includes:

- connected area and bounding geometry;
- local contrast to neighboring regions;
- repetition of similar regions;
- border connectivity and corner support;
- interior coverage;
- texture and edge density;
- typography-like or stripe-like geometry;
- persistence across nearby family tolerances;
- membership in larger parent regions.

The implementation may reuse lower-level native graph code where it is genuinely
candidate-independent. Existing selector thresholds, canonical bindings, and incumbent-relative
logic are not inherited.

## Field-Treatment Inference

Field inference produces structured hypotheses rather than independent background and surface color
lists.

### Solid field

A solid-field hypothesis identifies one broad artwork-supported family suitable for the UI field. It
records spatial support, stability, texture, border/interior evidence, and representative options.

### Separate flat fields

A flat two-field hypothesis identifies a background/surface relationship supported by distinct
artwork regions. Evidence may include containment, adjacency, border-versus-interior structure,
coverage, and repeated layering.

It must not be inferred solely from color distance.

### Gradient field

A gradient hypothesis must be based on a spatial color transition in a background-like region.
Internally retain enough evidence to distinguish a true field gradient from photography, lighting on
an object, several discrete regions, or a small overlay.

Candidate evidence should include, where applicable:

- the supporting region and its coverage;
- fitted direction or topology;
- monotonicity or coherent progression along that topology;
- residual error and unexplained structure;
- endpoint spatial bands;
- color-density support within each endpoint band;
- evidence that both endpoints belong to the same field treatment;
- whether the gradient remains meaningful at native and supplemental scales.

The emitted `background` and `surface` colors come from robust, supported portions of the fitted
gradient path. Do not use absolute extreme pixels by default. Do not use a whole-gradient medoid as
an endpoint merely because it is globally central.

Potential endpoint strategies to compare during development include:

- dense observed exemplars from robust low and high spatial bands;
- local modes within those bands;
- source exemplars nearest robust band prototypes;
- density-constrained synthesized representatives when no exact exemplar adequately represents the
  occupied band.

## Representative-Color Policy

### Source-support record

Every artwork-derived candidate color should expose a compact support record containing:

- exact-source status and exemplar coordinates when exact;
- anchor family and region identities;
- perceptual density around the emitted color;
- total and connected support near the emitted color;
- spatial coverage and concentration;
- distance from robust family or endpoint prototypes;
- outlier and noise evidence;
- any synthesis operation and its bounded distance from occupied source colors.

### Selection hierarchy

Use this initial preference order:

1. Prefer an observed color near a dense family or region mode with meaningful connected support.
2. Use robust means, medoids, or fitted prototypes to locate representative neighborhoods, not
   automatically as emitted colors.
3. Allow a synthesized representative only when it remains inside a densely occupied portion of the
   relevant source distribution and improves stability or fidelity.
4. Penalize exact colors supported by isolated or scattered pixels.
5. Reject colors that introduce an unrelated hue or bridge visibly separate modes through an empty
   part of color space.

Role-specific behavior is expected:

- field colors favor broad spatial support and faithful field structure;
- gradient endpoints favor support in their corresponding spatial endpoint bands;
- accents favor coherent signature regions and local modes, even when globally small;
- foregrounds favor field compatibility and may use an explicitly declared generated fallback.

Do not freeze exact-source versus density-constrained synthesis as a global binary choice before the
representative-strategy review in Phase 3.

## Contrast Policy

Contrast is supplied as consumer policy and kept separate from candidate-independent image evidence.
A starting interface is:

```ts
interface PaletteContrastPolicy {
  foregroundBackgroundMinimum: number
  foregroundSurfaceMinimum: number
  accentBackgroundMinimum: number
  accentSurfaceMinimum: number
}
```

The concrete metric and numeric defaults must be declared by the candidate protocol. Minimums may be
low or disabled. A configured minimum is a hard consumer requirement; contrast above the minimum is
continuous ranking evidence rather than an additional hidden threshold.

Only applicable pairs are evaluated:

- foreground against background;
- foreground against surface when present;
- accent against background when present;
- accent against surface when both are present.

Foreground and accent policies need not use identical defaults or identical utility weighting.

For a gradient treatment, evaluate foreground and accent against the actual rendered interpolation,
including interior samples, using the consuming UI's interpolation behavior. Endpoint-only checks are
insufficient if the weakest contrast can occur inside the rendered path.

## Bounded Complete-Palette Generation

Generation begins from field-treatment hypotheses and constructs complete role assignments.

For each retained field treatment:

1. select representative field-color variants;
2. construct feasible foreground candidates;
3. decide whether an accent adds artwork identity and UI value;
4. evaluate all applicable contrast pairs;
5. score the complete treatment;
6. retain materially distinct alternatives.

Use bounded beam search, Pareto retention, or another explicitly capped search. Do not restore the
old exhaustive tuple domain merely because it already exists.

The generator should normally emit up to eight materially distinct complete alternatives. It may
emit fewer when the artwork does not support that many defensible treatments. Never synthesize weak
variations solely to satisfy a quota.

Material diversity should consider:

- field-treatment kind;
- background and surface family identities;
- gradient versus non-gradient treatment;
- signature family used as accent;
- light/dark field character;
- complete rendered appearance, not only RGB distance.

Hard rules include:

- valid two-to-four-color product cardinality;
- required background and foreground;
- surface required for `gradient: true`;
- satisfaction of configured hard contrast minimums;
- bounded and declared representative synthesis;
- deterministic source-independent tie ordering;
- no filename, path, source-ID, review-case, comment, or target-color branches.

Preferences rather than universal hard rules include:

- exact source status;
- density and connected support;
- family coverage;
- signature coverage;
- contrast above configured minimums;
- robustness under benign source perturbations;
- whether an optional role earns its place.

## Deterministic Ranking

Start with an interpretable multi-objective ranker. It should operate on complete treatments and expose
its component scores.

Initial score families are:

- **field fidelity:** support for the solid, layered, or gradient interpretation;
- **artwork identity:** coverage of distinctive and salient source regions;
- **representativeness:** density, connected support, provenance, and synthesis distance;
- **UI utility:** configured contrast evidence and field-role compatibility;
- **coherence:** relationships among all selected role colors;
- **stability:** behavior under benign encoding, quantization, and supplemental-scale checks;
- **economy:** whether each optional color contributes distinct value;
- **generator confidence:** margins and evidence quality that exist at production inference time.

Avoid a single compensatory sum until score scales are understood. A small number of interpretable
quality blocks or Pareto stages is acceptable, but they must not recreate incumbent componentwise
domination against 0.19.

The ranker should return both its winner and the diverse retained slate during development. This
separates candidate-availability failures from ranking failures.

## Optional Learned Ranking

Machine learning is not required for the first candidate. Add it only if human review shows that good
alternatives are commonly available but the deterministic ranker selects the wrong one.

Before fitting any model:

- build a treatment registry that recovers the exact rendered palettes behind historical labels;
- report recoverable examples and source groups rather than citing inventory eligibility counts;
- resolve source-custody constraints for every feature-materialization input;
- freeze feature formulas and missingness rules before reading labels into training code;
- group duplicates, artwork families, source identities, and review studies appropriately;
- reserve a fresh evaluation sample that is not reused for iteration.

Prefer a small regularized pair-difference or ordinal model. Use nested grouped validation and
leave-study-out sensitivity checks. Evaluate the complete generator-to-top-one pipeline, not merely
pairwise accuracy on historical treatments.

Do not introduce a learned hard veto from the current evidence. If later evidence supports risk
prediction, define threshold selection, abstention behavior, out-of-distribution behavior, and the
all-candidates-rejected outcome before using it as a hard gate.

## Evaluation Design

### Artwork coverage

Development and validation samples should cover album-artwork structures rather than named failure
cases:

- minimalist and near-uniform artwork;
- broad linear, radial, and irregular gradients;
- photography and portraits;
- monochrome and low-chroma work;
- highly chromatic and multi-hue work;
- typography-led covers;
- small but important signature colors;
- frames, borders, and strong corner fields;
- collage and high-detail artwork;
- low-resolution, compressed, and noisy sources;
- flat layered fields;
- artwork with no useful accent.

These categories select diagnostics and balance samples. They must not become source-specific
inference branches.

### Rendered treatment is the quality unit

Human quality judgments use the actual consuming UI or a faithful fixed rendering of it. Review the
complete field treatment, foreground, accent, and gradient behavior together.

Useful structured absolute labels are:

- `strong`;
- `acceptable`;
- `weak-fallback`;
- `unacceptable`;
- `uncertain`.

Useful pairwise labels are:

- candidate stronger;
- baseline stronger;
- similarly valid;
- neither acceptable;
- uncertain.

Diagnostic failure classes may include:

- wrong field interpretation;
- wrong gradient decision;
- unsupported gradient endpoints;
- missing signature family;
- unrepresentative or invented color;
- noisy exact exemplar;
- weak foreground;
- weak accent separation;
- unnecessary accent;
- acceptable alternative under-ranked;
- no acceptable alternative available.

Free-text comments remain qualitative context and never become target colors or inference branches.

### Development review versus validation

Development galleries are engineering tools. They may be reviewed repeatedly and used to improve the
algorithm, but their outcomes are not independent evidence of generalization.

The final candidate-direction review must use a preselected fresh sample that was not chosen according
to whether the candidate changed its output. Randomize presentation sides and report complete
win/tie/loss and absolute-quality outcomes with uncertainty intervals.

A 12-to-20-case review is a directional smoke test, not proof of a population-wide zero-regression
rate. Do not use an observed zero as a claim of zero risk. Agree on practical advancement criteria
before opening the fresh review.

### Role of 0.19

Run `region-graph-0.19.0` only as an external comparison after the new candidate has produced its own
output. It may be included in blinded review and migration reporting. It must not enter new candidate
generation, ranking, fallback, or feature computation unless a later product decision explicitly
chooses an incumbent-aware migration mode.

## Execution Plan

### Phase 0: Freeze the product experiment

Write a short candidate protocol that binds:

- the `AlbumArtworkPalette` contract;
- gradient and surface invariants;
- contrast metric and configurable policy interface;
- native-resolution discovery requirement;
- development-panel selection policy;
- fresh-review selection and sealing policy;
- runtime budgets;
- structured review schema;
- exposed and reserve source custody;
- confirmation that the remaining full run is unused.

Select a diverse exposed development panel of approximately 20 to 30 exact-source groups. Also
preselect and seal a fresh evaluation sample before candidate outputs are known. Group duplicates and
known artwork variants.

Gate:

- the output semantics and review rendering are unambiguous;
- the development panel covers the listed artwork structures;
- the fresh sample cannot be inspected through candidate outputs during development;
- no reserve source is accessed.

### Phase 1: Native evidence and simple baseline

Implement the smallest native-resolution evidence path that can preserve broad fields and coherent
small signatures. Keep it in memory; do not design the production cache yet.

Build a simple full-resolution baseline using tolerant color families, spatial support, and weighted
medoid or mode representatives. This baseline is intentionally simpler than the complete region
hierarchy and provides a useful comparator for later complexity.

Use synthetic fixtures to exercise:

- a one-pixel noise color;
- a small coherent signature region;
- repeated small signature regions;
- JPEG-like variation around a flat color;
- two distinct color modes with a misleading centroid;
- a broad smooth gradient;
- discrete stripes that must not be called a gradient;
- a photographic transition that must not become the background field.

Gate:

- native signature regions survive candidate discovery;
- isolated noise does not outrank coherent support;
- output is deterministic;
- no pre-discovery resize occurs;
- a single-source development command completes in seconds, not minutes.

### Phase 2: Field-treatment hypotheses

Implement solid, separate-flat-field, and gradient hypotheses from native spatial evidence. Retain
internal topology and support even though the public result exposes only `gradient`.

Produce a diagnostic gallery showing, for each development source:

- retained field hypotheses;
- supporting regions;
- gradient evidence and endpoint bands where applicable;
- representative options;
- reasons for pruning alternatives.

This gallery diagnoses inference but does not replace complete-palette review.

Gate:

- gradient hypotheses arise from observed spatial transitions rather than arbitrary color pairs;
- broad gradient classes have plausible endpoint bands;
- flat layers and photographs are not routinely mislabeled as gradients;
- at least one defensible field hypothesis is available for the large majority of the development
  panel;
- failures are attributable to evidence or hypothesis construction rather than opaque scoring.

### Phase 3: Representative strategies and complete alternatives

For the same retained families and field hypotheses, compare:

- dense exact source exemplars;
- source medoids or source exemplars nearest robust prototypes;
- density-constrained synthesized representatives.

Add foreground and optional accent candidates, configurable contrast, bounded complete-palette
generation, and the initial deterministic score blocks.

Emit up to eight diverse complete alternatives per development source and render them in the actual
UI. Include three-color examples of both valid forms:

- background, foreground, accent;
- background, surface, foreground.

Human checkpoint:

- label complete alternatives for absolute quality;
- identify which representative strategy best preserves artwork identity;
- record whether each failure is availability, representativeness, field inference, contrast, or
  ranking;
- do not compare only isolated swatches.

Gate:

- good complete treatments are commonly present in the retained slate;
- gradient-heavy artwork yields artwork-supported background/surface endpoints;
- small signature colors are available when visually important;
- synthesized representatives do not routinely look invented;
- exact representatives do not routinely encode noise;
- the feedback loop remains within minutes.

If acceptable treatments are rarely available, continue evidence and generation work. Do not train a
ranker to hide a deficient domain.

### Phase 4: Deterministic candidate and fresh review

Use development evidence to freeze one deterministic selector and one representative-color policy.
Run it on the preselected fresh sample without changing code, policy, weights, or source membership.

Review the new candidate against external 0.19 in a blinded randomized presentation. Also collect
absolute candidate quality so that a relative win over a weak baseline is not mistaken for a strong
result.

Report:

- candidate-stronger, baseline-stronger, tie, neither, and uncertain counts;
- absolute quality transitions;
- results by field-treatment and artwork category;
- gradient-decision and representative-color failures;
- repeat consistency if repeats are included;
- exact uncertainty intervals appropriate to the sample size;
- runtime and resource use.

Do not iterate on the fresh sample after opening it. If the result is only directional because the
sample is small, say so explicitly and select a new future validation sample after further
development.

Advancement requires visible complete-palette improvement and no systemic failure class. It does not
require pretending that a small sample proves zero regression risk.

### Phase 5: Persistence and performance

Only after a useful candidate exists, define a candidate-independent evidence schema and persistent
shard format. The schema should preserve the native evidence required by field inference,
representative selection, and complete generation without reopening the image.

Resolve the exact topology boundary explicitly. Either persist a candidate-independent topology
domain, persist enough compact spatial evidence to answer bounded topology questions, or identify a
separate policy-bound derived stage. Do not silently call the old prepared-evidence object a complete
cache.

Add:

- strict schema parsing;
- payload and source hashes;
- wrong-source and wrong-policy rejection;
- truncation and corruption tests;
- atomic per-source writes;
- verified restart and skip behavior;
- image-free cache-consumer closure;
- parity between image-bound and cached candidate output.

Gate:

- cached and image-bound output agree on the frozen sample;
- cached single-source generation is comfortably subsecond or has a measured redesign plan;
- a development-panel cold run completes in minutes;
- persistence does not change scientific results;
- completed valid work survives interruption.

### Phase 6: Optional learned ranker

Skip this phase if deterministic ranking is adequate.

If complete-palette reviews show repeated under-ranking of available good alternatives, first build
the semantic treatment registry and perform a trainability audit. Fit only small interpretable models
that can be evaluated with grouped out-of-source and out-of-study validation.

Gate:

- effective recoverable sample size and class balance support the chosen model;
- the model improves end-to-end top-one selection over the deterministic ranker;
- improvement survives grouped and study-held-out tests;
- no forbidden metadata or unavailable production feature is used;
- model inference stays within the cached runtime budget.

Otherwise retain the deterministic ranker.

### Phase 7: Full-run preflight and explicit decision

Only after the candidate has visible fresh-review support:

- freeze code, policy, representative rules, contrast configuration, evidence schema, source roster,
  diagnostics, runtime, and implementation closure;
- test resumability, corruption handling, and parity on bounded samples;
- measure a ten-worker resource envelope on the bound host;
- define per-source atomic evidence, result, and receipt stages;
- prove that valid completed stages are skipped after restart;
- freeze the full-run namespace and predicted wall time;
- present actual improvements, regressions, unresolved failures, and validation limits.

The one remaining multi-hour run requires a separate literal `GO`. It must use exactly ten source
workers, and a crash must not cause successful completed source stages to rerun.

The full run is complete-roster evaluation and cache population, not an iteration loop. Review novel
full-roster outputs from stored results after completion; do not call mechanical completion alone a
human-quality validation.

## Runtime Budgets

Until measurements justify a revision:

- ordinary single-source iteration should complete in seconds;
- a development-panel generation or gallery command should complete in a few minutes;
- no ordinary development command may exceed 15 minutes;
- no full-roster or multi-hour command may run before the final explicit `GO`;
- performance work must not reintroduce pre-discovery downsampling;
- cached evaluation targets are frozen only after the shard contents and topology boundary are known.

## Data And Custody Rules

- Use only currently exposed source roots during development and fresh review.
- Do not list, read, decode, render, or derive candidate evidence from reserve roots without explicit
  human authorization.
- Group exact duplicates and known artwork variants in evaluation and model validation.
- Paths, filenames, source IDs, review IDs, comments, and target hex values are forbidden inference
  features.
- Historical human evidence may be used only through a recoverable semantic treatment registry and
  features available at production inference.
- Development comments may explain failures but may not become named-case patches.
- Existing dirty and untracked research work must not be reset, cleaned, reformatted, or overwritten.

## Stop And Redesign Conditions

Stop the current approach before a full run if:

- native-resolution discovery still loses coherent signature colors;
- field gradients are effectively inferred from already-selected color pairs;
- the domain rarely contains an acceptable complete treatment;
- representative synthesis routinely produces colors that do not feel present in the artwork;
- exact exemplars routinely select noise or spatially irrelevant pixels;
- gradients cannot supply robust artwork-supported endpoints;
- foreground or accent contrast cannot satisfy the configured consumer policy;
- candidate quality depends on filenames, comments, named artworks, or target colors;
- a learned model only improves in leaky or ungrouped validation;
- the feedback loop becomes slow enough that human-guided development is impractical;
- proceeding requires opening reserve data or weakening a failed scientific gate.

## Definition Of Progress

Progress means:

- native-resolution evidence preserves small but meaningful signature colors;
- field treatments reflect the artwork's spatial structure;
- gradient colors are supported endpoints of an observed artwork gradient;
- representative colors feel present in the artwork without encoding isolated noise;
- both valid three-color configurations emerge when appropriate;
- complete rendered treatments are commonly strong or acceptable;
- the deterministic selector chooses good available alternatives consistently;
- configured contrast requirements are met without dominating artwork identity;
- fresh review shows visible improvement over 0.19 with honestly reported uncertainty;
- ordinary iteration remains fast;
- the final full run remains unused until quality is already demonstrated.

The primary research deliverable is a gallery of convincing complete UI treatments backed by clear
native-resolution evidence. Caches, models, certificates, and full-roster execution are supporting
engineering, not substitutes for that outcome.

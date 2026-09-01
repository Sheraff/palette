# Palette Research v4: Mechanism Census

**Status:** mutable source-backed working census as of 2026-08-30. This document records mechanisms
that can be tested independently. It does not choose an algorithm, inherit a historical architecture,
define a runtime pipeline, assign component boundaries, draw dependency edges, prescribe a capability
ladder, set priorities, or establish build order.

**Sibling navigation:** `research/v4/PROJECT.md` defines inherited product constraints, evidence, and
custody; `research/v4/STRATEGY.md` defines research and authorization policy. Their distinct working-
draft roles are stated in `research/v4/PROJECT.md:1-17` and `research/v4/STRATEGY.md:8-18`. Paths and
line ranges here are navigation evidence only. This mutable census makes no revision-binding claim;
binding becomes mandatory only when evidence is frozen or used authoritatively
(`research/v4/STRATEGY.md:437-461`).

## 1. Purpose, Scope, And Reading Rules

This census decomposes repository history and selected external literature into falsifiable
transformations, measurements, generators, filters, searches, selectors, validators, and
consequential arbitration rules. The unit is a causal claim, not a file, historical system, or named
prototype. Closely coupled helpers and parameter families are grouped when separating them would
manufacture false atomicity.

**The inventory is deliberately nonlinear.** Section order is taxonomy, not execution order. An
artifact may have several producers, several consumers, no consumer, or a bypass. Several hypotheses
may remain live. Caps, deduplication, ordering, normalization, arbitration, and tie-breaking are
mechanisms whenever they can change an outcome. Nothing in this file licenses composing two entries,
and support for two entries does not support their composition.

The inherited product boundary is one cold supplied file: no corpus lookup, companion artifact,
warm model, index, or per-item precomputation. The normative image is the once-decoded native raster,
without resampling. Ordinary published colors are literal source pixels. Human judgment of a complete
rendered treatment remains the only product-quality endpoint. These constraints come from
`research/v4/PROJECT.md:21-26`, `:61-108`, and `:373-384`. Runtime admissibility is evaluated against
that boundary; diagnostic use and permission to act are recorded separately as authorization.

### Orthogonal Status Dimensions

Every record keeps five questions separate. A semicolon inside one dimension separates atomic claims
or evidence conditions; it does not synthesize them into one experiment disposition.

| dimension | compact values used here |
| --- | --- |
| **Scientific interpretation** | `supported`, `falsified`, `unsupported`, `inconclusive`, or `unmeasured`, always bounded by the accompanying claim and source. These are census interpretations of historical evidence, not newly assigned funded-study dispositions. |
| **Implementation state** | `live`, `historical`, `prototype`, `instrument`, or `unbuilt`; `tested` is stated only where a cited check exists. Normative policy is not a mechanism state. |
| **Evidence scope** | one or more scopes from `research/v4/STRATEGY.md`: `mechanical`, `isolated-semantic`, `conditional-known-good`, `natural-handoff`, `perturbation`, `downstream-utility`, `composition`, or `complete-treatment`; `none-local` means no repository result. |
| **Runtime admissibility** | `permitted`, `prohibited`, or `unresolved` under the current cold, native, no-resampling boundary. This says whether the transformation could run there, not whether it may be used. |
| **Authorization** | `inventory-only` for every current record; `diagnostic-only` or a narrower prohibition is added where prior evidence expressly withholds use. Authorization requires a separate Flo ruling or standing policy. |

For example, mechanical support does not imply semantic support; an implementation does not imply
scientific support; and runtime admissibility does not authorize selection, composition, or funding.
The cold-model, reviewed-artifact, and corpus-lookup boundaries are scope policy, not census
mechanisms (`research/v4/PROJECT.md:21-26`; `research/v4/STRATEGY.md:75-79`, `:390-422`).

### Compact Record Schema

Every entry states:

- **Status:** scientific interpretation, implementation state, evidence scope, and runtime
  admissibility as four named clauses.
- **Authorization:** the fifth orthogonal compact field. Every entry remains `inventory-only` unless
  an external frozen record contains Flo's narrower ruling; this census grants no action.
- **Claim:** the intended causal effect and what would make that interpretation fail.
- **Inputs -> outputs:** semantic input, output cardinality, uncertainty, and provenance.
- **Losses and risks:** assumptions, discarded information, caps, ties, resource limits, and known
  harmful destinations.
- **Evidence:** repository sources or a stable primary literature reference.

Artifact nouns such as `NativeRaster`, `FieldHypothesis`, `CandidateSet`, `CompleteTreatment`, and
`ReviewRecord` are descriptive contracts only. They are not selected APIs or components.

### Literature-Overlap Audit

Section 10 is `literature-derived`, not universally repository-absent. Each entry names its precise
overlap: some mechanisms extend repository proposals or diagnostics, while others have no local
implementation or result. ELECTRE extends existing noncompensatory/outranking ideas. DPP diversity,
texture morphology, Felzenszwalb-Huttenlocher merging, and Lin-Hanrahan representativeness were
already proposed or cited locally. Literature inclusion does not imply novelty, suitability,
authorization, priority, or preference over repository mechanisms.

## 2. Raster, Color, And Publication Custody

### `raster.native-opaque-decode` - Native opaque raster custody

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `live` policy
  and tested decode path; evidence scope `mechanical`; runtime admissibility `permitted`.
- **Claim:** EXIF orientation, pinned decode behavior, three-channel 8-bit sRGB, native dimensions,
  and no resampling preserve the supplied file as the source of truth.
- **Inputs -> outputs:** one encoded opaque file -> one bounded `NativeRaster` plus dimensions,
  decoder/preprocessing identity, content hash, and byte-count provenance.
- **Losses and risks:** decoding still chooses a color-management interpretation; decoder upgrades
  can alter bytes. V2-3 flattened alpha onto white, while the normative v3 policy refuses genuine
  transparency. The default v2-3 pixel bound is 2,100,000.
- **Evidence:** `research/v3/PHASE_0_DECISIONS.md:14-47`,
  `research/v2-3/src/internal/native-resolution-image.ts`, and
  `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:13-19`.

### `raster.fixed-working-copy` - Bounded discovery raster

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded cost utility and `inconclusive` for
  discovery fidelity; implementation state `live` in the historical region-graph loader; evidence
  scope `mechanical` and `perturbation`; runtime admissibility `prohibited` by the unsuperseded
  native/no-resampling policy.
- **Claim:** the region-graph loader's max-edge-224 Lanczos3 resize bounds discovery work, but its
  output is not current source truth and cannot preserve evidence it erased or avoid evidence invented
  by interpolation. The top-level root extractor does not perform this resize.
- **Inputs -> outputs:** one encoded source plus orientation, flattening, sRGB, max-edge-224, and
  Lanczos3 settings -> one three-channel resampled region-graph working raster; the root extractor
  instead receives already decoded bytes and metadata.
- **Losses and risks:** interpolation invents colors, removes small marks, changes components and
  evidence, and confounds scale with kernel. Native snapping can make a selected output color literal,
  but cannot restore missing topology, typography, candidates, or ownership. In the portable
  392-source audit, max-edge-224 Lanczos3 changed 23 semantic outputs and 153 role values; other
  224 kernels changed 389 sources. None of these observations supersedes the no-resampling policy.
- **Evidence:** live region-graph decode/resize in `research/src/image.ts:4-32`; decoded root input in
  `extractColors.ts:53-67`; commented-out diagnostic resize in `visual.ts:258-267`; policy and audit in
  `research/v4/PROJECT.md:19-24`, `:399-400` and
  `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:60-75`.

### `raster.transparency-policy` - Transparency refusal or matte flattening

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive` for domain policy; implementation state
  `historical` flattening and `live` refusal policy; evidence scope `mechanical`; runtime admissibility
  `prohibited` for silent flattening and `permitted` for declared refusal.
- **Claim:** transparency must be handled as an explicit content-policy decision because the matte
  becomes image evidence and can become the selected field.
- **Inputs -> outputs:** one raster with alpha plus a declared policy -> refusal, or one opaque raster
  bound to a matte color and policy identity.
- **Losses and risks:** flattening destroys alpha semantics and can manufacture the dominant field.
  Refusal excludes disc scans and press-photo cutouts, which v3 measured as another content class.
- **Evidence:** `research/v3/PHASE_0_DECISIONS.md:35-47` and the historical flattening warning in
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:515-522`.

### `color.oklab-working-space` - sRGB to OKLab evidence conversion

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for deterministic conversion and `inconclusive` as
  a complete perceptual model; implementation state `live` and tested; evidence scope `mechanical`;
  runtime admissibility `permitted`.
- **Claim:** converting every source pixel to OKLab provides a common space for distances,
  interpolation, grouping, covariance, and gradient evidence while leaving source RGB intact.
- **Inputs -> outputs:** one 8-bit sRGB raster -> one float OKLab triple per native pixel, in the same
  cardinality and pixel order.
- **Losses and risks:** scalar Euclidean OKLab distance is not uniformly perceptual near the dark toe
  and does not model spatial adaptation. Conversion precision and gamut clipping must be versioned.
- **Evidence:** `research/ALGORITHM.md:18-20`, `research/v2-3/src/internal/color.ts:21-57`, and the
  direction-dependent same-color result in `research/v3/PHASE_0_DECISIONS.md:159-174`.

### `color.same-color-ruler` - Region-dependent identity tolerance

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for the regional ruler and `falsified` for the
  pooled scalar formulation; implementation state `instrument` and tested; evidence scope
  `isolated-semantic`; runtime admissibility `permitted` as a declared measurement.
- **Claim:** identity equivalence needs a calibrated threshold whose value depends on dark/light and
  neutral/saturated region; it is not interchangeable with accent functionality.
- **Inputs -> outputs:** two colors plus region classification -> one same/different judgment and the
  applied threshold identity.
- **Losses and risks:** hard region boundaries introduce cliffs. The v3 thresholds are reviewed but
  criterion-specific; reusing them for role functionality or source support is invalid.
- **Evidence:** `research/v3/PHASE_0_DECISIONS.md:159-196` and
  `research/v3/src/contract/PERCEPTION_MODEL_STUDY.md`.

### `publication.exact-native-pixel` - Exact-pixel publication

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `live` policy
  and validator; evidence scope `mechanical`; runtime admissibility `permitted`.
- **Claim:** each ordinary role and stop can carry an exact native pixel witness, preventing centroids,
  interpolation, or generated averages from being presented as artwork colors.
- **Inputs -> outputs:** a source-supported color hypothesis -> one RGB triple, native pixel index and
  coordinates, source hash, and lineage; aliases may retain distinct masks or provenance.
- **Losses and risks:** one exact pixel can be noise; exact existence alone does not prove that the
  color belongs, is representative, or occupies the correct role. V3 therefore reports population
  but does not gate validity on it.
- **Evidence:** `research/v4/PROJECT.md:56-89`, the P3 publication result in
  `research/v3/phase-2/GRAFT_INVENTORY.md:45-56`, and
  `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:133-147`.

### `publication.source-connected-lineage` - Historical source-connected custody

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for historical lineage checks; implementation
  state `historical`; evidence scope `mechanical`; runtime admissibility `permitted` only as weaker
  historical custody, not as the current publication contract.
- **Claim:** a treatment is source-connected when every field, role direction, family, representative,
  and published color has a registered path to observed evidence.
- **Inputs -> outputs:** a treatment plus source registry -> per-descriptor connection booleans and an
  eligible/ineligible lineage record.
- **Losses and risks:** v2-3 source-connectedness allowed abstractions and a generated emergency path;
  it is weaker than v3's ordinary exact-pixel requirement. Passing lineage does not prove quality.
- **Evidence:** `research/v2-3/src/internal/source-eligibility.ts:64-215` and
  `research/v2-3/src/internal/candidate-domain.ts:178-218`.

### `publication.black-white-escape` - Declared one-color emergency escape

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for structural legality and `inconclusive` for
  semantic necessity; implementation state `live` policy and validator; evidence scope `mechanical`;
  runtime admissibility `permitted` only for the declared emergency form.
- **Claim:** when no source-supported two-color treatment is possible, exactly one absent pure black
  or white color may appear in background or foreground with its partner collapsed.
- **Inputs -> outputs:** a complete infeasible source domain plus exact emergency diagnosis -> one
  declared escape treatment or abstention, including supported-pair counts and contrast evidence.
- **Losses and risks:** a validator can check the structural shadow and absence of the generated color,
  but cannot prove the semantic phrase "genuinely no other way." Early or eager escape can suppress a
  legal alternative field.
- **Evidence:** `research/v4/PROJECT.md:63-73`, `research/v3/PHASE_0_DECISIONS.md:81-91`, and
  `research/v2-3/src/internal/source-eligibility.ts:119-171`.

### `publication.explicit-collapse` - Exact role collapse

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for contract representation and `inconclusive` for
  semantic election; implementation state `live`; evidence scope `mechanical`; runtime admissibility
  `permitted`.
- **Claim:** surface-to-background and accent-to-foreground equality are deliberate forms represented
  by explicit flags, not accidental duplicate colors.
- **Inputs -> outputs:** a complete role tuple -> exact collapse flags, resulting cardinality, and a
  legality result; collapsed surface forbids a non-degenerate gradient.
- **Losses and risks:** economy terms can over-reward collapse and erase artwork identity. A hex match
  without the corresponding flag is invalid.
- **Evidence:** `research/v4/PROJECT.md:56-66` and `research/v3/PHASE_0_DECISIONS.md:76-80`.

## 3. Image Evidence, Fields, Frames, Texture, And Topology

### `evidence.legacy-weighted-kmeans` - Population-weighted root clustering

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically and `inconclusive` semantically;
  implementation state `live`; evidence scope `mechanical`; runtime admissibility `permitted`.
- **Claim:** assign distinct observed colors to the nearest of `K` centers, recompute each center as a
  population-weighted packed-RGB mean, and stop at convergence or 100 iterations to compress the
  global color distribution.
- **Inputs -> outputs:** flattened `(color,count)` observations, color-space distance, and requested
  `K` -> a representative-color-to-count map, population-normalized WCSS, and effective `k`.
  Memberships and mean centroids remain internal and are not returned.
- **Losses and risks:** the update averages RGB channels even when assignment uses another color
  space; first-distinct-color initialization depends on input order; an empty cluster divides by zero
  while recomputing its centroid; and two clusters selecting the same representative overwrite in the
  returned `Map`. Global clusters have no region or role semantics, and internal means synthesize
  colors until the separate observed-color publication step. No direct k-means test is cited.
- **Evidence:** `kmeans/kmeans.worker.ts:5-23`, `:44-76`, `:88-155`, and
  `research/v4/PROJECT.md:216-226`.

### `evidence.legacy-elbow-k-election` - Slope-intersection cluster count

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` for palette utility; implementation state `live`;
  evidence scope `mechanical`; runtime admissibility `permitted`.
- **Claim:** estimate an elbow by fitting early- and late-`K` WCSS slopes and taking their intersection,
  rather than fixing the number of global color clusters.
- **Inputs -> outputs:** color observations plus early and late `K` sets -> only the selected
  representative-color-to-count map; selected `K`, WCSS points, and slopes are logged or internal.
- **Losses and risks:** defaults `[1,2,3,4]` and `[50,100]`, outlier removal, ceiling, and the synthetic
  zero-WCSS endpoint are consequential. The implementation computes regression with the original
  point count after removing outliers, so the estimated slopes can be malformed. It also filters and
  appends to `start` and `end` captured by the returned async closure, making later calls depend on
  earlier input cardinalities. No direct elbow test is cited.
- **Evidence:** `kmeans/elbow.ts:4-15`, `:16-69`, `:73-110`.

### `evidence.legacy-gap-k-election` - Uniform-reference gap statistic

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unsupported` for the implemented gap-statistic claim and
  `unmeasured` for a corrected formulation; implementation state `live`; evidence scope `mechanical`;
  runtime admissibility `permitted`.
- **Claim:** choose the `K` maximizing the log-WCSS gap between the image colors and a declared
  reference distribution.
- **Inputs -> outputs:** image color observations, `minK`, `maxK`, and the built-in reference generator
  -> only the selected representative-color-to-count map; selected `K` and gap values are internal.
- **Losses and risks:** the current flattened `(color,count)` reference writer stores at indices `i`
  and `i+1` instead of `2*i` and `2*i+1`, overwriting adjacent entries and leaving most of the typed
  array zero. It also samples integer RGB code order, not a color-space bounding box, and uses only one
  reference draw; current outputs therefore do not implement the standard gap-statistic claim. This
  mechanically invalid implementation does not falsify a valid gap statistic. No direct gap test is
  cited.
- **Evidence:** `kmeans/gapStatistic.ts:4-18`, `:19-44`, and the flattened pair contract in
  `kmeans/kmeans.worker.ts:79-94`.

### `publication.legacy-nearest-observed-cluster-color` - Observed representative for a mean cluster

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `live`;
  evidence scope `mechanical`; runtime admissibility `permitted` under exact-pixel publication only
  when native witness custody is added.
- **Claim:** replace each synthesized cluster center at publication with the assigned observed color
  nearest to that center, so the returned cluster key is present in the input observations.
- **Inputs -> outputs:** one mean center and its assigned observed colors -> one nearest observed color
  and the cluster's full weighted population.
- **Losses and risks:** nearest-to-mean is not necessarily modal, spatially coherent, or semantically
  representative; ties follow observation order. Root output carries a color value but not the native
  pixel index and full custody required by the v3 contract.
- **Evidence:** `kmeans/kmeans.worker.ts:25-42`, `:126-155`, and
  `research/v4/PROJECT.md:61-85`.

### `evidence.family-quantization` - Fixed-grid OKLab color families

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `mechanical` and `perturbation`; runtime admissibility `permitted` as evidence formation but
  not as selected v4 policy.
- **Claim:** assigning pixels to a stable fine OKLab grid makes populations, connected components,
  role observations, and exact representatives tractable while preserving native witnesses.
- **Inputs -> outputs:** all native OKLab pixels -> a finite family set, one family label per pixel,
  occupancy, prototype, components, and exact representative options.
- **Losses and risks:** the inherited 0.04 step is not independently derived; +/-20% moved about 97%
  of v2-3 palettes. The neutral-axis origin and dark-bin fragmentation caused severe dither
  sensitivity. Mean-emitting quantizers are a separate, source-inventing mechanism.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:123-157` and
  `research/v2-3/src/internal/palette-core.ts`.

### `evidence.connected-components` - Native family-component observations

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `historical`;
  evidence scope `mechanical`; runtime admissibility `permitted`.
- **Claim:** four-connected components of family labels expose spatial support that global color mass
  cannot: bounds, border ownership, repetition, compactness, local contrast, polarity, and region
  provenance.
- **Inputs -> outputs:** a native family label plane -> zero or more deterministic components per
  family, with pixel membership and geometry; scan/neighbor order is consequential provenance.
- **Losses and risks:** connectivity is brittle near thresholds and under re-encoding; one-pixel
  channels can change topology. Components of one quantized family need not be one semantic object.
- **Evidence:** `research/v2-3/src/internal/palette-core.ts:61-208`,
  `research/v2-3/src/internal/field-transition.ts:240-380`, and the instability warnings in
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:49-63`.

### `evidence.slic-region-graph` - SLIC-style perceptual-spatial regions

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded aggregation and `falsified` as the
  tested texture-versus-structure mask; implementation state `historical`; evidence scope `mechanical`
  and `isolated-semantic`; runtime admissibility `unresolved` for a native formulation.
- **Claim:** compact perceptually coherent superpixels reduce pixels to regions with adjacency,
  boundary, border, variance, saliency, and text evidence.
- **Inputs -> outputs:** one working raster plus region-count/compactness controls -> roughly 48-320
  regions, one label per working pixel, a region adjacency graph, and exact source representatives.
- **Losses and risks:** SLIC cuts grain rather than deciding whether grain is material; 0.19 did not
  connectivity-clean labels, so they are unsuitable as a segmentation-mask API. Canonical 0.19 also
  inherited the 224-pixel raster loss.
- **Evidence:** `research/ALGORITHM.md:22-44`, `research/README.md:92-143`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:453-470`.

### `evidence.border-frame-ownership` - Border, side, corner, and interior evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `isolated-semantic`; runtime admissibility `permitted` as evidence, not field authority.
- **Claim:** broad perimeter contact, multiple-side coverage, corner ownership, and border-versus-
  interior excess provide evidence that a color is a field or frame rather than a floating mark.
- **Inputs -> outputs:** component or soft mask plus normalized coordinates -> border coverage,
  per-side coverage, corner count, interior ownership, and frame-excess diagnostics.
- **Losses and risks:** a bar or decorative frame can dominate the perimeter and steal background;
  border evidence is not field authority. Arm A did not obtain a reliable no-field answer from reach,
  thickness, enclosure, remainder pieces, family partitioning, or Arm B's canvas node.
- **Evidence:** `research/ALGORITHM.md:36-44`,
  `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:285-320`, and
  `research/v4/PROJECT.md:347-359`.

### `evidence.legacy-local-contrast-saliency` - Fixed-radius local color-contrast map

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically and `inconclusive` semantically;
  implementation state `live`; evidence scope `mechanical`; runtime admissibility `permitted` as a
  diagnostic, not selection authority.
- **Claim:** a pixel with a large maximum color distance within radius 3 is locally distinctive; a
  3-tap separable blur and scale-relative max dilation spread that evidence before max normalization.
- **Inputs -> outputs:** one raster and color-space distance implementation -> one 8-bit map at input
  cardinality.
- **Losses and risks:** despite historical prose calling the live worker Itti-Koch-style, the code is
  not center-surround saliency and does not compute variance despite its variable name. Max
  normalization erases absolute magnitude and large salient objects can become mostly edges.
- **Evidence:** `saliency/saliency.worker.ts:5-110`; compare the stronger Itti-Koch claim in
  `README.md:27-36` and the revised audit in `research/v4/PROJECT.md:216-226`.

### `evidence.unused-otsu-threshold` - Otsu threshold helper

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for the formula and `unmeasured` in the live path;
  implementation state `live` but unused; evidence scope `mechanical`; runtime admissibility
  `permitted` as a diagnostic.
- **Claim:** maximizing between-class variance can turn an 8-bit saliency histogram into one binary
  threshold.
- **Inputs -> outputs:** one 8-bit map -> one integer threshold in `[0,255]`.
- **Losses and risks:** bimodality is assumed; thresholding discards magnitude and can create topology
  cliffs. There is no live call site, so it must not be attributed to current saliency behavior.
- **Evidence:** `saliency/saliency.worker.ts:114-149` and repository call-site search.

### `evidence.population-connectivity-spread` - Support measurements

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as measurement and `falsified` as a validity gate;
  implementation state `live` reporting and historical gates; evidence scope `mechanical` and
  `isolated-semantic`; runtime admissibility `permitted` for reporting and `prohibited` as a validity
  floor.
- **Claim:** exact population, same-color-neighborhood mass, largest connected share, family
  concentration, spatial spread, and observation breadth describe how a color occupies the image and
  can inform role hypotheses.
- **Inputs -> outputs:** a color/family mask and native raster -> a vector of mass and geometry
  measurements with exact denominators and null behavior.
- **Losses and risks:** small coherent title text is often endorsed while similarly small label logos
  and shadows are refused. Median endorsed exact-pixel share was 8.9e-5. No tested population floor
  separated belonging from non-belonging; population remains report-only under v3.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:45-57`,
  `research/v4/PROJECT.md:85-89`, and `research/v2-3/src/internal/role-obligations.ts:168-200`.

### `evidence.structural-text-shape` - Typography and mark-shape evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded shape evidence and `inconclusive` for
  full text recognition; implementation state `historical`; evidence scope `isolated-semantic`;
  runtime admissibility `permitted` as evidence, not role authority.
- **Claim:** edge density, local contrast, low variance, geometry, repetition, polarity, compactness,
  and consistent stroke width can distinguish title-like marks from fields and grain without OCR.
- **Inputs -> outputs:** components and local raster measurements -> per-component typography and
  signature evidence, optional text chains, and uncertainty rather than a text label.
- **Losses and risks:** decorative details, cursive word blobs, pointillist letters, and giant type
  violate naive per-letter or small-component assumptions. The shipped v2-3 cue penalized large type.
  Stroke Width Transform was measured historically but not integrated as positive authority.
- **Evidence:** `research/ALGORITHM.md:42-44`,
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:599-631`,
  `research/v3/phase-1/PRIOR_ART_CHECK.md:100-109`, and
  `research/v2-3-experiments/literature-review/REPORT.md:11-18`.

### `evidence.legacy-structural-text-heuristics` - Root salient-component text cues

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `live`; evidence scope
  `mechanical`; runtime admissibility `permitted`.
- **Claim:** threshold the root local-contrast saliency map, group four-connected salient pixels, and
  use within-component color consistency, geometry, repetition, chroma, and contrast as separate
  text/mark hypotheses.
- **Inputs -> outputs:** source raster, saliency map, root clusters, field color, and contrast floor ->
  several independently scored foreground hypotheses with fallback states.
- **Losses and risks:** the saliency threshold and all heuristic blends are uncalibrated; decorations,
  photo edges, and logos can look text-like; the root caller runs several methods for comparison but
  historically elects roles through separate downstream policy rather than a reviewed joint model.
- **Evidence:** `foregroundDetection.ts:293-340`, `:989-1048`, `extractColors.ts:277-319`, and
  `research/v4/PROJECT.md:216-226`.

### `evidence.legacy-fixed-threshold-text-regions` - Fixed-threshold scanline text grouping

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` for semantic text detection; implementation state
  `historical`; evidence scope `mechanical`; runtime admissibility `unresolved`.
- **Claim:** grayscale thresholding at 127, majority inversion, horizontal black-run grouping, and
  scale-relative scanline merging can isolate rectangular visual regions that resemble text lines.
- **Inputs -> outputs:** RGB pixel buffer plus width, height, and channel count -> a full-size buffer
  retaining pixels in grouped rectangles and a packed buffer containing those rectangle pixels.
- **Losses and risks:** fixed polarity and width/whitespace thresholds confuse illustration, rules,
  texture, and photography with text. Grouping is order-dependent and rectangle filling includes
  non-text pixels. `textRegions.ts` has no active import; no test or semantic review grants text
  authority.
- **Evidence:** implementation in `textRegions.ts:9-142`; the live visual file comments out this import
  at `visual.ts:13-15`.

### `evidence.legacy-adaptive-edge-text-regions` - Adaptive morphology and contour text diagnostic

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` for semantic text detection; implementation state
  `live` as a visual diagnostic; evidence scope `mechanical`; runtime admissibility `unresolved`.
- **Claim:** local-mean thresholding followed by 5x5 opening/closing, Sobel magnitude thresholding, and
  eight-connected contour grouping can expose edge pixels that resemble text regions.
- **Inputs -> outputs:** RGB pixel buffer plus width, height, and channel count -> a full-size buffer
  retaining contour pixels and a packed contour-pixel buffer.
- **Losses and risks:** block size 15, offset 10, fixed morphology, Sobel threshold 128, border handling,
  and contour order are uncalibrated. The output retains contour pixels rather than filled text masks,
  and `textRegionsSize` multiplies channels twice. It has no semantic text authority or direct tests.
- **Evidence:** `edgeDetection.ts:9-34`, `:52-182`, `:185-248`; active visual import in
  `visual.ts:10-15`.

### `evidence.native-mask-scale-space` - Frozen-mask Q0.24 scale-space

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`
  and tested; evidence scope `mechanical`; runtime admissibility `unresolved`.
- **Claim:** exact centered box low-pass fields over frozen native masks can separate changes due to
  observation scale from changes due to candidate availability, interpolation, and role policy.
- **Inputs -> outputs:** one native binary candidate/family mask and target attribution -> one native
  Q0.24 low-pass plane and one exact target-lattice subset, with SAT/BigInt filter identity, mass
  residual, typed hashes, and no palette output.
- **Losses and risks:** thresholds and scales are predeclared diagnostics, not quality settings.
  Low-pass planes are derived evidence, never source truth or candidate colors. Corpus vectors cannot
  be averaged into an arm winner.
- **Evidence:** `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:133-237`, `:249-324`, and `:449-493`.

### `evidence.topology-descriptors` - Components, holes, reach, thickness, and enclosure

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `instrument` and
  prototype; evidence scope `mechanical`; runtime admissibility `permitted` as diagnostics, not
  semantic authority.
- **Claim:** topology and normalized geometry can distinguish broad fields, frames, thin typography,
  local islands, and continuous transitions that have similar color mass.
- **Inputs -> outputs:** binary or soft support at a declared threshold -> component counts and
  signatures, largest mass, boundary density, side ownership, distance-transform thickness,
  enclosure/reach, and explicit undefined states.
- **Losses and risks:** threshold topology changes discontinuously; a one-pixel channel can swing a
  flood fill or max distance transform globally. Native scale-space deliberately deferred holes,
  Euler characteristic, compactness, and perimeter normalization rather than emitting placeholders.
- **Evidence:** `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:249-320` and the failed Phase 3 ground
  tests summarized by the unresolved ownership boundary in `research/v4/PROJECT.md:347-359`.

### `evidence.robust-field-fit` - Redescending smooth-color surface fit

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in bounded field cases and `inconclusive` on
  no-field scenes; implementation state `prototype`; evidence scope `isolated-semantic` and
  `natural-handoff`; runtime admissibility `unresolved` under the cold resource envelope.
- **Claim:** fitting a low-order spatial color surface with outlier-resistant residual weighting can
  identify a broad smooth ground without requiring an initial segmentation.
- **Inputs -> outputs:** native or declared discovery-raster OKLab samples -> one or more fitted flat,
  block, linear, or radial surfaces, inlier weights, explained fraction, residuals, and abstention or
  recursion records.
- **Losses and risks:** on faces, photographs, collage, or texture, the largest smooth-ish patch can
  become an arbitrary field. P5's background/surface were its stable half, not bit-identical: about
  19.5-21.0% per-trial instability. Current 3000-pixel cost was roughly 1.6-2.9 s for fit plus about
  6 s for marks.
- **Evidence:** `research/v3/phase-1/PRIOR_ART_CHECK.md:70-82`,
  `research/v3/phase-2/GRAFT_INVENTORY.md:53-82`, and
  `research/v3/phase-2/PROTOTYPE_RANKING.md:55-66`.

### `evidence.residual-marks` - Figure evidence from robust-fit rejection

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as enrichment and `inconclusive` for natural
  semantic purity; implementation state `prototype`; evidence scope `isolated-semantic` and
  `natural-handoff`; runtime admissibility `unresolved`.
- **Claim:** pixels not explained by a robust field fit are enriched for text, logos, objects, and
  identity marks and can be grouped into figure hypotheses.
- **Inputs -> outputs:** fitted surface plus per-pixel residual/weight -> zero or more mark groups with
  span, mass, neighborhood, exact-color support, and residual provenance.
- **Losses and risks:** residual is not pure figure and unexplained figure is not necessarily a UI
  role. P5's face-as-field class remained inexpressible; mark reading dominated high-resolution cost.
- **Evidence:** `research/v3/phase-1/PRIOR_ART_CHECK.md:70-82`,
  `research/v3/phase-2/PROTOTYPE_RANKING.md:55-66`, and the separate SAM residual result in Section 9.

### `evidence.tree-of-shapes` - Hierarchical region-tree candidates

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a candidate generator and `inconclusive` for
  complete treatment behavior; implementation state `prototype`; evidence scope `mechanical`,
  `perturbation`, and `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** nested level-set shapes and chromatic lanes expose candidates hidden from flat regions,
  including isoluminant marks, and permit attributes to be read at several containment scales.
- **Inputs -> outputs:** one image or channel family -> one rooted shape hierarchy with parent/child
  relations, node area, depth, shape attributes, exact-pixel representatives, and candidate lanes.
- **Losses and risks:** assignment-set stability remained the hardest P2 problem; dither move rate was
  15.0% against a 10% bar. Runtime above 300 pixels was not measured in P2 and later estimates were
  expensive. Reachability does not establish ranking or role correctness.
- **Evidence:** 91.9% endorsed-color reachability and 1.7% falsifier rate in
  `research/v3/phase-2/GRAFT_INVENTORY.md:45-57` and P2 closeout in
  `research/v3/phase-2/PROTOTYPE_RANKING.md:36-53`.

### `evidence.per-pixel-rank-fields` - Pixel fields with rank publication

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive` for role fields and `supported` for exact-pixel
  publication; implementation state `prototype`; evidence scope `perturbation` and
  `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** defining evidence at every pixel and publishing designated rank pixels avoids a bounded
  candidate shortlist and makes color reachability complete by construction.
- **Inputs -> outputs:** native raster -> several scalar fields/rank orderings and exactly one native
  pixel per requested role or hypothesis, with rank and field provenance.
- **Losses and risks:** 100% availability makes candidate-recall evaluation vacuous; field design and
  role assignment still decide quality. P3 finished unfalsified at a local optimum, but v3 selected no
  base and robustness plateaued near 84% pooled agreement. White type on photographs remained deferred.
- **Evidence:** `research/v3/phase-1/PRIOR_ART_CHECK.md:48-54` and
  `research/v3/phase-2/PROTOTYPE_RANKING.md:19-34`.

### `evidence.multiscale-surround` - Blur-ladder surround and habitual-ground fields

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for measurements and `falsified` for the P6 joint
  objective; implementation state `prototype`; evidence scope `mechanical`, `perturbation`, and
  `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** continuous multiscale surround, positional fields, and delayed quantization preserve
  evidence that fixed-radius and early-binning systems discard.
- **Inputs -> outputs:** native continuous color/position samples -> surround-at-scale fields,
  habitual-ground evidence, excursion profiles, and a continuous substrate before final exact-pixel
  redemption.
- **Losses and risks:** continuous substrate does not solve free exchange rates or role vocabulary.
  P6's weighted joint objective failed both exchange-rate and robustness falsifiers at every tested
  anisotropy.
- **Evidence:** `research/v3/phase-1/PRIOR_ART_CHECK.md:84-96` and
  `research/v3/phase-2/PROTOTYPE_RANKING.md:94-102`.

### `evidence.area-integral-extent-substrate` - Phase 3 Arm C octave-ladder extent

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unsupported` as inherited repository evidence and
  `unmeasured` in portable custody; implementation state `prototype` in an excluded worktree; evidence
  scope `none-local` for portable evidence; runtime admissibility `unresolved`.
- **Claim:** the proposed octave-ladder area integral over eligible pixels would make the e1-relevant
  field ordering at least twice as stable as P3's binary edge-to-distance-transform substrate under
  both rendition and same-resolution perturbation comparisons.
- **Inputs -> outputs:** native raster, octave windows, eligibility and top-quarter extent rule -> extent
  field, field set, ordering summaries, and drift ratios against the frozen P3 rows.
- **Losses and risks:** only an excluded-worktree snapshot reports the exact 2x-bar outcome, 1.75x and
  1.56x ratios, top-quarter field fraction, and 13.5 s cost at 3039 pixels. Those figures are nonportable
  archaeology and do not establish inherited falsification, closure, or runtime cost. The current
  untracked `state-of-the-project.md` is also not durable authority.
- **Evidence:** portable-custody boundary in `research/v4/PROJECT.md:161-163`, `:397-408`; archaeology
  only in `.worktrees/c-ranks-substrate/research/v3/prototypes/c-ranks-substrate/STATE.md:7-78`.

### `evidence.global-noise-estimation` - Immerkaer global noise scale

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** a fixed 3x3 high-pass estimator supplies one global additive-noise scale while
  annihilating locally linear intensity, allowing grain magnitude to remain separate from smooth
  shading evidence.
- **Inputs -> outputs:** scalar image plane -> one global noise standard-deviation estimate and filter
  identity.
- **Losses and risks:** the estimate is global, assumes an additive-noise model, and is contaminated by
  edges and texture; it is not a local texture mask or a semantic field gate. The repository proposed
  the estimator but did not implement or validate it.
- **Evidence:** `research/v2-3-experiments/literature-review/REPORT.md:15-18` and [L22].

### `evidence.attribute-morphology-granulometry` - Area openings and area granulometry

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** connected grayscale area openings remove components below declared area without deforming
  surviving components; differences across ordered area scales form an area-granulometric response.
- **Inputs -> outputs:** grayscale plane or max-tree plus ordered area scales -> area-opened planes,
  removed-component provenance, and an area-scale response distribution.
- **Losses and risks:** area scale defines what counts as texture and can erase fine typography;
  normalization across resolution and null behavior are unresolved. Vincent does not support an
  h-maxima or generic prominence claim here. A descriptor has no automatic field/figure authority.
- **Evidence:** `research/v2-3-experiments/literature-review/REPORT.md:15-18`, `:86-90`, and [L23].

### `evidence.texture-descriptors` - Local statistical texture evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** declared local co-occurrence or binary-pattern statistics can describe repeated
  microstructure independently from component area and global noise magnitude.
- **Inputs -> outputs:** scalar/color neighborhoods plus quantization, offsets, radii, and boundary
  policy -> local or region-level contrast, homogeneity, entropy, and pattern histograms.
- **Losses and risks:** quantization, orientation, scale, and neighborhood choices are parameters;
  typography and halftone artwork are intentional texture, and descriptor similarity does not decide
  whether material belongs to a field.
- **Evidence:** no local implementation or result; primary descriptor examples are [L24] and [L25].

### `evidence.fh-size-adaptive-merge` - Felzenszwalb-Huttenlocher graph merging

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** process nondecreasing graph edges and merge components `C1,C2` when
  `Diff(C1,C2) <= min(Int(C1)+k/|C1|, Int(C2)+k/|C2|)`, allowing internal variation and component
  size to set both sides of the comparison without one fixed boundary threshold.
- **Inputs -> outputs:** pixel or region graph, edge dissimilarities, `k`, and minimum-size policy ->
  partition, merge trace, internal differences, and rejected edges.
- **Losses and risks:** `k`, graph construction, minimum-size cleanup, and equal-edge ordering are
  consequential; merging supplies no field/figure label. The repository proposed applying the rule to
  existing components, but no implementation or human utility result exists.
- **Evidence:** `research/v2-3-experiments/literature-review/REPORT.md:23-25` and [L26].

## 4. Candidate, Hypothesis, And Role Mechanisms

### `candidate.role-aware-shortlist` - Role-aware exact-color shortlist

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `natural-handoff` and `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** stable color bins seeded by dominance, field evidence, salience, chroma, and typography can
  produce a small role-aware set while resolving every center back to an observed pixel.
- **Inputs -> outputs:** histogram bins with role evidence -> about 12 candidate records, each with
  cluster/evidence provenance and an exact source representative.
- **Losses and risks:** a shortlist is a candidacy wall. Candidate presence does not imply role
  reachability, and weighted centers can absorb sparse identity colors even when output snaps to a
  source pixel.
- **Evidence:** `research/ALGORITHM.md:46-60` and the reachability correction in
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:307-323`.

### `candidate.hue-family-supplement` - Missing chromatic-family supplementation

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in the bounded reviewed configuration;
  implementation state `historical`; evidence scope `composition` and `complete-treatment`; runtime
  admissibility `unresolved` outside that configuration.
- **Claim:** fixed hue-direction families can append a small number of supported chromatic candidates
  absent from the canonical shortlist without authorizing their role or final selection.
- **Inputs -> outputs:** native histogram, canonical shortlist, support/chroma/salience/connectivity
  evidence -> at most two exact-source supplements plus availability diagnostics.
- **Losses and risks:** widening under a cap can evict existing candidates. Availability alone did not
  make generic one-accent treatments preferable; role and tuple mechanisms must re-earn utility.
- **Evidence:** `research/ALGORITHM.md:58-68`,
  `research/v3/phase-1/PRIOR_ART_CHECK.md:100-109`, and
  `research/PALETTE_EXTRACTION_IMPROVEMENT_PLAN.md:70-78`.

### `candidate.representative-strategies` - Family representative alternatives

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `mechanical` and `natural-handoff`; runtime admissibility `unresolved`.
- **Claim:** dense-exact, nearest-prototype, band-local endpoint, and historically density-synthesized
  representatives expose different fidelity/support tradeoffs for one family.
- **Inputs -> outputs:** one family or endpoint band -> a finite representative set with strategy,
  support regions, source connection, exact witness where applicable, and deterministic tie key.
- **Losses and risks:** density synthesis violates v3 ordinary publication; nearest-to-mean can narrow
  a gradient and select an unrepresentative real pixel; strategy alternatives multiply the tuple
  domain and interact with caps.
- **Evidence:** `research/v2-3/src/internal/palette-core.ts:15-16`, `:75-118`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:347-370`.

### `candidate.field-hypotheses` - Flat, separate-field, and gradient hypotheses

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for retaining explicit alternatives and
  `inconclusive` for field ownership; implementation state `historical`; evidence scope
  `isolated-semantic` and `natural-handoff`; runtime admissibility `permitted` as hypotheses, not
  selection authority.
- **Claim:** retain explicit competing claims for one field, two flat fields, or one shaded field,
  with domain reconstruction and role-assignment evidence, rather than infer gradient from two colors.
- **Inputs -> outputs:** families, components, field domains, and fits -> a set of field hypotheses
  carrying kind, endpoint families/representatives, geometry, fidelity, support, and rejection notes.
- **Losses and risks:** the hypothesis ontology can omit no-field scenes, frames, or collages. Similar
  colors do not prove one field, and different colors do not prove separate areas.
- **Evidence:** `research/v2-3/src/internal/palette-core.ts:233-373` and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:93-96`.

### `candidate.native-transition-path` - Native field-transition discovery

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded path generation; implementation state
  `historical`; evidence scope `mechanical` and `isolated-semantic`; runtime admissibility `permitted`
  only under declared configuration.
- **Claim:** a path through adjacent family components with spatial/color progression, directness,
  local continuity, low branching, broad domain support, and eligible endpoints represents one
  continuous field transition.
- **Inputs -> outputs:** native family/component graph plus supported geometry -> zero or more ordered
  traces and hypotheses with up to 16 stages, exact stage colors, endpoint identities, and explicit
  rejection reasons.
- **Losses and risks:** graph construction inherits quantization/connectivity cliffs; many constants
  gate endpoints and bridges. A path can still join two semantic areas rather than one surface.
- **Evidence:** `research/v2-3/src/internal/field-transition.ts:11-110`, `:170-204`, and
  `research/v2-3/src/internal/candidate-domain.ts:248-300`.

### `candidate.band-local-endpoints` - Endpoint-band refinement

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `natural-handoff`; runtime admissibility `unresolved`.
- **Claim:** recomputing supported representatives from occupied local endpoint bands can recover the
  true extent of a field better than global family representatives.
- **Inputs -> outputs:** accepted fit/domain and low/high bands -> zero or one refined field hypothesis
  per fit with exact endpoint representatives, band spread, fit quality, support, and lineage.
- **Losses and risks:** historical 0.1/0.9 or 0.2/0.8 band positions narrowed ramps; changing aim points
  did little when the candidate pool bound the result. Bands can pick unrelated objects sharing a
  color direction.
- **Evidence:** `research/v2-3/src/internal/candidate-domain.ts:66-152` and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:347-364`.

### `candidate.multi-source-fan-in` - Seed, transition, and endpoint hypothesis union

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for explicit provenance and `inconclusive` for
  arbitration; implementation state `historical`; evidence scope `mechanical` and `composition`;
  runtime admissibility `permitted` for union, not downstream authority.
- **Claim:** native seeds, native field transitions, and band-local endpoint refinements can coexist
  as separately identified hypothesis producers before canonical-treatment deduplication.
- **Inputs -> outputs:** three hypothesis sets -> one union whose records retain source type
  (`native-seed`, `native-field-transition`, `band-local-endpoint`) and lineage.
- **Losses and risks:** union is not neutral under downstream capacity limits; extra sources can evict
  old candidates or alter normalization. Equal treatments with distinct evidence must retain all
  descriptors rather than erase provenance.
- **Evidence:** `research/v2-3/src/internal/candidate-domain.ts:13-46`, `:240-300`.

### `candidate.canonical-deduplication` - Treatment-key deduplication with descriptor retention

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `historical`
  and tested; evidence scope `mechanical`; runtime admissibility `permitted` when the key preserves all
  consequential semantics.
- **Claim:** byte-equivalent complete treatments can share one candidate while preserving every
  distinct source descriptor and stratum that made them reachable.
- **Inputs -> outputs:** logical treatment descriptors -> one canonical treatment per complete key,
  ordered descriptors, unioned strata, and stable key.
- **Losses and risks:** a key that ignores consequential provenance would merge non-equivalent claims;
  ASCII identifiers are not a safe semantic tie-break. Deduplication must not collapse uncertainty.
- **Evidence:** `research/v2-3/src/internal/candidate-materialization.ts:74-123`, `:175-226`.

### `candidate.stratified-cap` - Capacity-bounded materialization

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `mechanical`, `perturbation`, and `composition`; runtime admissibility `unresolved`.
- **Claim:** under a hard 1,500-treatment budget, retaining the top treatment, best representatives of
  field-direction/obligation/legal-form/source strata, then fair-ranked candidates preserves more
  hypothesis diversity than truncating one global order.
- **Inputs -> outputs:** canonical treatment set, obligations, and capacity in `[1,1500]` -> an ordered
  materialized subset with stratum coverage provenance.
- **Losses and risks:** any cap creates displacement; adding candidates can silently remove existing
  treatments. The chosen strata and quality order are policy, and role quotas created known
  reachability walls.
- **Evidence:** `research/v2-3/src/internal/candidate-materialization.ts:7-38`, `:125-270`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:140-163`.

### `candidate.recall-versus-ranking` - Endorsed-sample reachability diagnostic

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded recall/ranking diagnosis;
  implementation state `instrument`; evidence scope `downstream-utility`; runtime admissibility
  `prohibited` because reviewed samples are effective inputs.
- **Claim:** role-blind minimum-cost matching can distinguish an endorsed color set absent from a
  bounded candidate domain from one present but outranked.
- **Inputs -> outputs:** candidate treatments and one or more endorsed samples -> minimum mean OKLab
  matching cost, epsilon reachability, best candidate rank, and separate recall/ranking failure.
- **Losses and risks:** role-blind matching cannot measure seat correctness, complete-treatment
  quality, uniqueness, or product accuracy. On 40 v2-3 images, samples were reachable on all and the
  winner missed epsilon on 7; `33/40` is not accuracy.
- **Evidence:** `research/v4/PROJECT.md:163-181` and
  `research/v2-3-eval/README.md:177-250`.

### `role.field-conditional-classifier` - Foreground/accent evidence conditioned on a field

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in bounded reviewed cases; implementation state
  `historical`; evidence scope `isolated-semantic` and `natural-handoff`; runtime admissibility
  `unresolved` outside the cited configuration.
- **Claim:** the same family may read as foreground, accent, ambiguous, or field-owned depending on
  the chosen field, because typography polarity and contrast depend on that field while accent-shape
  evidence largely does not.
- **Inputs -> outputs:** every family crossed with every field hypothesis -> one role-evidence record
  per pair containing foreground and accent scores, preference, reason, confidence, coherent support,
  and polarity evidence.
- **Losses and risks:** fixed blends contain pervasive parameter cliffs; geometric text cues penalized
  giant type. Confidence is a score margin, not calibrated probability. Ambiguity must remain explicit.
- **Evidence:** `research/v2-3/src/internal/role-obligations.ts:5-92`, `:203-380`, and
  `research/v2-3/src/internal/role-evidence.ts:38-84`.

### `role.identity-obligations` - Role-specific identity obligations

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `isolated-semantic`, `natural-handoff`, and `composition`; runtime admissibility `unresolved`.
- **Claim:** source-connected, materially distinct, non-field-owned signature families can receive
  ordered identity obligations. The base shortlist is capped at four, spends at most two seats on
  neutrals unless a candidate has decisive polarity opposite every selected neutral, reorders decisive
  opposite-polarity neutrals by banded polarity strength, then may append one omitted major family and
  one omitted chromatic family after the cap.
- **Inputs -> outputs:** field-owned families, source-connected component evidence, family prototypes,
  population, chroma, polarity observations, and policy constants -> zero to six ordered obligations
  plus omitted, polarity-exempt, polarity-reordered, and major-reserved traces; the chromatic append is
  reflected in the obligation output but lacks its own returned trace field.
- **Losses and risks:** the base four-seat cap, two-neutral quota, polarity exception/order, material-
  distance deduplication, and both post-cap reservations are all causally consequential. Appends can
  produce six obligations and alter downstream retention; nearby hues can still crowd one direction,
  and obligations remain evidence hypotheses rather than human semantic truth.
- **Evidence:** base cap in `research/v2-3/src/internal/policy.ts:500-516`; neutral quota and polarity
  policy in `research/v2-3/src/internal/policy.ts:455-491`; selection, post-cap reservations, and trace
  in `research/v2-3/src/internal/palette-core.ts:4299-4519`; capacity diagnosis in
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:146-157`.

### `role.text-led-foreground` - Typography-led foreground election

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in a bounded reviewed scope; implementation state
  `prototype`; evidence scope `isolated-semantic`; runtime admissibility `unresolved`.
- **Claim:** when structural text evidence identifies likely ink/type colors, foreground should be
  elected from those candidates subject to legibility rather than defaulting to population or a
  generic black/white prior.
- **Inputs -> outputs:** field, text-like candidates, polarity, source support, and contrast -> one
  foreground hypothesis plus evidence and fallback state.
- **Losses and risks:** text detection can confuse decoration, omit cursive/pointillist text, or choose
  label logos. P2 was text-led on 16/20; this is local evidence, not a complete role solution.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:45-57` and reviewer principles at `:129-141`.

### `role.maximin-ramp-foreground` - Maximize minimum raw APCA over the field

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a bounded legibility filter/election;
  implementation state `prototype`; evidence scope `mechanical` and `isolated-semantic`; runtime
  admissibility `permitted` as a floor, not final identity authority.
- **Claim:** among foreground candidates, maximizing the minimum absolute raw APCA over the complete
  rendered field avoids a candidate that is strong at endpoints but disappears inside the ramp.
- **Inputs -> outputs:** candidate colors and exact rendered field path -> per-candidate minimum,
  argmax candidate, minimizing ramp position, and deterministic tie record.
- **Losses and risks:** contrast is a floor, not identity authority. The reviewer preferred the
  artwork's true ink among floor-clearing colors; using contrast as final selector can produce the
  wrong foreground.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:53-59`, `:137-144`.

### `role.accent-shape-evidence` - Compact, repeated, chromatic mark evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded cues and `inconclusive` as universal
  accent scoring; implementation state `historical`; evidence scope `isolated-semantic`; runtime
  admissibility `unresolved` as role authority.
- **Claim:** compactness, repetition, chroma, local contrast, signature observation, and coherent
  support describe identity marks better than mass alone.
- **Inputs -> outputs:** family components/observations -> accent evidence with all five cue values,
  support gate, raw score, and exact family provenance.
- **Losses and risks:** the local-contrast coefficient is a pervasive cliff; neutral accents and giant
  title text violate simple compact/chromatic assumptions. Contextual accent-ness was refuted: endorsed
  accents were not farther in hue from other roles.
- **Evidence:** `research/v2-3/src/internal/role-obligations.ts:203-278` and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:307-328`.

### `role.per-mass-mark-reading` - Mark evidence normalized by mark mass

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in the cited salvage; implementation state
  `prototype`; evidence scope `natural-handoff`; runtime admissibility `unresolved`.
- **Claim:** reading a mark's internal evidence per mark mass, rather than per image area, prevents
  small coherent text or stickers from being numerically erased by the canvas.
- **Inputs -> outputs:** mark support and cue totals -> normalized mark scores/ranks with original mass
  retained as a separate measurement.
- **Losses and risks:** normalization can amplify tiny noise unless semantic/spatial eligibility is
  separate. In P6 salvage it moved readable ink from rank 39 to rank 1.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:56-59`.

### `role.text-mark-swap` - Decisive foreground/accent role exchange

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` within the reviewed v2-3 rule; implementation
  state `historical`; evidence scope `composition` and `complete-treatment`; runtime admissibility
  `unresolved` outside that rule.
- **Claim:** if field-conditional evidence decisively says the selected accent is text and the
  foreground is the stronger mark, exchanging foreground and accent can repair a pure role
  permutation without changing the color set or field.
- **Inputs -> outputs:** one treatment plus role claims and legality checks -> unchanged treatment or
  one swapped treatment with repair identity.
- **Losses and risks:** swapping can relocate a contrast defect; a role claim based on bad text
  evidence can invert a correct palette. Every resulting pair and stop must be revalidated.
- **Evidence:** `research/v2-3/src/internal/text-role-restriction.ts` and
  `research/v2-3/src/internal/zero-contrast-repair.ts:270-289`.

### `role.family-relationship-mirroring` - Palette relationships mirror artwork relationships

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `unbuilt` as a general
  rule; evidence scope `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** family sharing and separation among the four roles should reflect the artwork's actual
  family structure rather than one universal two-family or four-independent-role pattern.
- **Inputs -> outputs:** artwork family relation hypotheses and complete treatments -> relational
  compatibility evidence, not a mandatory family count.
- **Losses and risks:** examples support mutually incompatible forms: two-family sharing on one cover,
  four families on another. Turning this observation into a universal template repeats the corrected
  Phase 2 overgeneralization.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:103-118`.

### `role.population-eligibility` - Population or exact-mass role gate

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `falsified` as a population eligibility gate and `supported`
  as reportable measurement; implementation state `historical` gate and `live` reporting; evidence
  scope `isolated-semantic`; runtime admissibility `prohibited` as a gate.
- **Claim:** the tested rule rejects colors below a population/exact-mass floor as not belonging or not role
  eligible.
- **Inputs -> outputs:** color population and threshold -> eligible/ineligible bit.
- **Losses and risks:** the gate removes rare endorsed title, ink, and identity colors. No tested
  threshold separated endorsed from rejected colors; population is still useful evidence about role
  and is still reportable.
- **Evidence:** `research/v4/PROJECT.md:93-97`, `:294-310`, and
  `research/v3/phase-2/GRAFT_INVENTORY.md:45-57`, `:97-102`.

### `role.salience-led-candidacy` - Candidate nomination led by coherent salience

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured`; implementation state `unbuilt`; evidence scope
  `none-local`; runtime admissibility `unresolved`.
- **Claim:** nominate role candidates from coherent high-salience marks before mass ordering so small
  identity-bearing regions are available without making rarity itself an eligibility rule.
- **Inputs -> outputs:** mark groups, salience/coherence, and exact-source support -> candidate
  nominations with null/ambiguous states and retained mass diagnostics.
- **Losses and risks:** no repository implementation established the deferred P5 v0.10 design cycle;
  semantic limits still distinguish title text from incidental labels and shadows.
- **Evidence:** `research/v3/phase-2/PROTOTYPE_RANKING.md:55-66`, `:118-119`.

### `role.hue-direction-diversity` - Smoothed hue directions and determinant diversity

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured`; implementation state `unbuilt`; evidence scope
  `none-local`; runtime admissibility `unresolved`.
- **Claim:** a chroma-weighted circular hue histogram with neighborhood support can nominate supported
  directions; determinant diversity is valid only with a declared positive-semidefinite kernel whose
  rank can support the requested cardinality.
- **Inputs -> outputs:** source-supported chromatic families -> a smoothed direction support field and
  a finite diverse direction set with marginal-gain trace.
- **Losses and risks:** for the repository proposal `L_ij = q_i q_j v_i^T v_j` with 2D unit hue
  directions, `rank(L) <= 2`, so every determinant for a set larger than two is zero. That exact kernel
  must either cap cardinality at two or be replaced by a valid higher-rank kernel; general greedy DPP
  MAP literature does not repair the rank defect. Near-neutral handling and support gates remain
  load-bearing, and any determinant objective can favor vivid noise.
- **Evidence:** repository proposal in `research/v2-3-experiments/literature-review/REPORT.md:20-27`;
  general greedy MAP only in [L27].

### `role.legacy-independent-election` - Root role-by-role heuristic election

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `live`; evidence scope
  `mechanical`; runtime admissibility `permitted`.
- **Claim:** elect the largest connected root cluster as background, compare multiple foreground
  heuristics independently, then choose alternate field and accent colors through separate
  population/saliency/chroma/contrast policies before testing a field pair for gradient form.
- **Inputs -> outputs:** root clusters, local saliency, source raster, contrast floor, and heuristic
  policy -> background, surface, foreground, accent, and gradient boolean plus method diagnostics.
- **Losses and risks:** independently elected roles need not form a faithful complete treatment;
  fallback to maximum contrast or generated black/white can override identity. The caller computes and
  logs many rival role methods but its returned policy does not make those methods jointly reviewed.
- **Evidence:** `extractColors.ts:207-319`, `:459-556`, `:632-690`, and
  `foregroundDetection.ts:989-1048`, `:1241-1408`, `:2230-2356`.

## 5. Gradient And Rendered-Field Mechanisms

### `gradient.semantic-boolean` - Gradient existence independent of endpoint difference

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for separating the question and `inconclusive` for
  the semantic decision; implementation state `historical`; evidence scope `isolated-semantic`;
  runtime admissibility `unresolved`.
- **Claim:** a gradient means continuous shading of one field, not merely two different colors or two
  adjacent areas; decide that claim independently from endpoint refinement and guide stops.
- **Inputs -> outputs:** field/domain evidence -> flat, gradient, ambiguous, no-field, or out-of-domain
  claim with supporting geometry and explicit abstention.
- **Losses and risks:** statistical proxies cannot fully identify physical-surface continuity. Both
  false and missed gradients are live errors, and review instruments historically under-recorded
  objections.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:82-104`, `:336-346`, and
  `research/v4/PROJECT.md:294-310`.

### `gradient.low-frequency-and-path-detectors` - Smoothness and endpoint-path tests

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `live` root path and
  `historical` successors; evidence scope `mechanical` and `isolated-semantic`; runtime admissibility
  `unresolved` as gradient authority.
- **Claim:** low local change with larger long-range change, plus populated continuous projection onto
  an endpoint color path and spatial coherence, provides mechanical evidence for a gradient field.
- **Inputs -> outputs:** full raster/regions and an ordered endpoint pair -> smoothness, path coverage,
  occupied positions, continuity, coherence, and an eligible/rejected claim.
- **Losses and risks:** global smoothness can support the wrong pair; threshold sequences did not
  converge, and old branches could only validate an already selected pair, not repair ownership.
- **Evidence:** the live root path-histogram implementation is `gradientDetection.ts:4-59`, `:62-140`;
  later region and fit forms are in `research/ALGORITHM.md:105-120` and
  `research/v3/phase-1/PRIOR_ART_CHECK.md:74-82`.

### `gradient.owned-continuity-evidence` - Frozen candidate-independent topology evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for the cited exact-pair development/validation
  evidence and `inconclusive` beyond it; implementation state `historical` and `tested`; evidence scope
  `mechanical` and `isolated-semantic`; runtime admissibility `prohibited` for the max-edge-224
  formulation under current native/no-resampling policy.
- **Claim:** for one already selected directed background-to-surface pair, candidate-independent
  distribution continuity, spatial/surface ownership, progression, and rooted connectivity describe
  whether intermediate colors form one owned field rather than an object-local or unrelated ramp.
- **Inputs -> outputs:** exact directed background and surface `Candidate` endpoints plus a pinned
  `RegionAnalysis` carrying OKLab pixels, labels, regions and their saliency/text evidence, edge plane,
  source RGB, and dimensions, under frozen canonical/evidence identities -> frozen evidence record
  with `unifiedOwnedContinuity`, `ownedProgression`, `ownedConnectivity`, diagnostics, and identities.
- **Losses and risks:** this evidence does not find endpoints, choose roles, validate candidate
  availability, or establish complete-treatment quality. Thresholds and topology remain pair-,
  rendition-, and implementation-bound; direction is material.
- **Evidence:** input types and transformation in `research/src/candidates.ts:37-53`,
  `research/src/regions.ts:4-33`, `research/src/gradient-field-topology.ts:448-494`; formulas and actual
  outcomes in `research/GRADIENT_DETECTION_CHECKPOINT.md:122-151`, `:201-269`; frozen upstream and
  exact-pair identities in `research/GRADIENT_FIELD_TOPOLOGY_VALIDATION_3.md:3-29`, `:56-78`.

### `gradient.frozen-exact-pair-scorer` - Frozen owned-continuity discrimination rule

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` only for its selected exact-pair scope;
  implementation state `historical` and `tested`; evidence scope `isolated-semantic`; runtime
  admissibility `prohibited` because the frozen evidence identity uses max-edge-224 preprocessing.
- **Claim:** standardize the three frozen topology features, apply the frozen logistic coefficients and
  threshold, and classify the supplied directed endpoint pair as gradient-eligible or flat.
- **Inputs -> outputs:** one matching-version topology evidence record -> balanced-prior discrimination
  score, threshold margin, boolean, and full model identity.
- **Losses and risks:** the score is not a calibrated prevalence probability. The coefficient on
  `ownedConnectivity` is exactly zero, so that named feature has no effect in this scorer even though
  it remains in the frozen vector. The scorer has no endpoint-selection, role, product, or composition
  authority.
- **Evidence:** `research/src/gradient-field-topology-model.ts:3-28`, `:69-130` and frozen identities
  in `research/GRADIENT_FIELD_TOPOLOGY_VALIDATION_3.md:3-16`.

### `gradient.native-exact-pair-transfer` - Native graph transfer diagnostic

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for checked working-copy summary assertions and
  `unsupported` for clean-checkout evidence custody; implementation state `instrument` and `tested`;
  evidence scope `mechanical` for mapping/agreement and `isolated-semantic` for accuracy against human
  labels; runtime admissibility `prohibited` because frozen labeled rows are effective inputs.
- **Claim:** map the same frozen directed endpoint pairs into the native primary-family graph and test
  whether the frozen topology decision retains useful accuracy and agrees with its 224-profile
  decision without refitting.
- **Inputs -> outputs:** 274 decisive frozen rows, exact source/native graph identities, and frozen
  scorer -> terminal mapping inventory, native metrics, transfer deltas, and historical development
  disposition.
- **Losses and risks:** 250/274 rows mapped; mapped native accuracy was 0.848 and native-versus-224
  decision agreement 0.996. The tracked test preserves hashes and summary assertions, but both bound
  row-bearing JSON artifacts are untracked and therefore absent from clean repository custody. The
  recorded historical decision permitted only a future structured-field-state plan; complete tuples,
  palette output, human review, and reserve roots were expressly withheld.
- **Evidence:** `research/tests/native-exact-pair-topology-transfer-development.test.ts:11-45` and
  `research/evaluate-native-exact-pair-topology-transfer.ts:520-603`.

### `gradient.fit-based-structure-choice` - Flat, two-block, or ramp from fit evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded structure evidence and `inconclusive`
  for selection constants; implementation state `prototype`; evidence scope `isolated-semantic`;
  runtime admissibility `unresolved`.
- **Claim:** compare absolute explained fraction and fit residuals before color election to distinguish
  broad smooth ramp, two-block field, and retreat on photographs.
- **Inputs -> outputs:** robust field fits -> one structure hypothesis or abstention, with absolute
  explained fraction, fit identity, and alternate hypotheses.
- **Losses and risks:** a relative detector was provably inert and replaced. Structure choice can be
  locally sensible while the fitted field is semantically wrong.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:53-59`.

### `gradient.endpoint-snap` - Continuous target redeemed by source pixel

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `natural-handoff` and `perturbation`; runtime admissibility `permitted` only with exact native
  publication and declared support.
- **Claim:** fit a continuous endpoint target for stability, then publish the supported exact pixel in
  its endpoint band nearest that target.
- **Inputs -> outputs:** fit target, endpoint band, native pixels, support criteria -> one exact endpoint
  witness and target-to-witness distance.
- **Losses and risks:** nearest-to-target reads systematically narrowed endpoints; continuous fitting
  does not remove the discrete snap cliff. P3 explicitly avoided this mechanism.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:347-364` and
  `research/v3/phase-1/PRIOR_ART_CHECK.md:48-54`, `:80-82`.

### `gradient.endpoint-outward-walk` - Source-supported endpoint extension

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `natural-handoff` and `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** walk each endpoint outward along the field-domain color-covariance principal axis while
  local source support continues, protecting all other published colors and original pair
  distinctness.
- **Inputs -> outputs:** field pixels, starting endpoint, principal color axis, support bands, current
  palette -> zero or more accepted exact-source steps and a final endpoint with stop reasons.
- **Losses and risks:** adjudicated evidence was roughly even (ultimately 4 wins, 3 losses, 7 ties).
  Support can come from an unrelated object; a spatial-progression guard explained only one loss and
  contradicted the strongest loss.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:347-370`.

### `gradient.transition-support-and-flat-fallback` - Earned transition publication

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded fallback behavior; implementation state
  `historical`; evidence scope `mechanical`; runtime admissibility `permitted` under explicit path
  acceptance and rejection provenance.
- **Claim:** publish a gradient only when its exact transition path is accepted; otherwise retain a
  legal flat treatment rather than forcing a ramp from endpoint difference.
- **Inputs -> outputs:** transition paths and treatment -> accepted hypothesis IDs, gradient eligibility,
  ordinary two-stop/three-stop descriptor, or explicit no-midpoint/flat fallback.
- **Losses and risks:** fallback under the same label can hide a different algorithm; rejection reasons
  must remain visible. Eligibility still inherits transition topology thresholds.
- **Evidence:** `research/v2-3/src/internal/gradient-support.ts:19-108`, `:197-233`, and fallback
  warnings in `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:515-519`.

### `gradient.spatial-midpoint-band` - Midpoint from the field's spatial middle

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in the bounded route and `inconclusive` on need;
  implementation state `historical`; evidence scope `isolated-semantic`; runtime admissibility
  `permitted` only after accepted field evidence.
- **Claim:** a populated source color in the spatial midpoint band that deviates from the endpoint
  chord can represent a genuine three-color progression.
- **Inputs -> outputs:** accepted field domain/fit and midpoint band -> zero or one exact-source stop at
  position 0.5 with band population, occupancy, spread, chord deviation, and native witness.
- **Losses and risks:** one modal band offers few alternatives and can miss a color-space excursion.
  The Phase 2 "zero owed on 60" claim was corrected to zero owed among only 7 ramp-producing covers.
- **Evidence:** `research/v2-3/src/internal/gradient-support.ts:19-75` and
  `research/v3/phase-2/GRAFT_INVENTORY.md:51-54`, `:142-150`.

### `gradient.transition-stage-midpoint` - Midpoint from an intermediate path stage

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in bounded cross-hue cases; implementation state
  `historical`; evidence scope `isolated-semantic`; runtime admissibility `permitted` only after an
  accepted transition path.
- **Claim:** on cross-hue transitions, an exact intermediate stage near halfway in both spatial and
  color progression is required when the direct endpoint chord omits that supported color.
- **Inputs -> outputs:** accepted ordered transition stages -> zero or one source-supported stop at 0.5
  with stage index, spatial/color positions, population, family, region, and native witness.
- **Losses and risks:** fixed halfway windows and hue thresholds are configuration-specific; an ordered
  path can still encode the wrong semantic field.
- **Evidence:** `research/v2-3/src/internal/gradient-support.ts:146-223`.

### `gradient.midpoint-endpoint-distinctness` - Independent rendered-midpoint color gate

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in the bounded reviewed population; implementation
  state `live` and tested; evidence scope `mechanical` and `isolated-semantic`; runtime admissibility
  `permitted` after a midpoint has otherwise been earned.
- **Claim:** a rendered midpoint must both deviate enough from the endpoint chord to move the render and
  remain at least CIE76 3.3 from each endpoint to represent a distinct third color. Endpoint
  distinctness is an independent gate, not a substitute for spatial-band support or chord deviation.
- **Inputs -> outputs:** candidate background, surface, and supported midpoint -> the midpoint or null,
  with minimum endpoint difference and the independently evaluated chord-deviation decision.
- **Losses and risks:** CIE76 shadow inflation and a fixed same-color bar are perceptual assumptions;
  the gate can reject a semantically useful near-endpoint hold. In the cited corpus it alone removed
  4,508 of 18,680 chord-passers, so merging it into another midpoint record would hide substantial
  causal blast radius.
- **Evidence:** independent gate and threshold in
  `research/v2-3/src/internal/palette-core.ts:3517-3575`; replacement and bounded review in
  `research/v2-3-experiments/midpoint-fidelity/EXPERIMENT.md:39-126`.

### `gradient.excursion-probe` - Distance from rendered ramp to artwork colors

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a diagnostic and `inconclusive` for threshold
  calibration; implementation state `historical`; evidence scope `mechanical`; runtime admissibility
  `permitted` as a measurement.
- **Claim:** sample a rendered OKLab path and measure distance to the nearest sufficiently populated
  artwork color; the worst distance localizes off-artwork interpolation.
- **Inputs -> outputs:** endpoints, optional midpoint, source-supported color set, and sample positions
  -> per-position distances, worst excursion, and worst position.
- **Losses and risks:** a finite sample can miss narrow excursions; source support is quantized and
  population-gated. P1 and P6 produced the only working Phase 2 probes, but an excursion value is not
  itself a human quality score.
- **Evidence:** `research/v2-3/src/internal/ramp-midpoint.ts:174-221` and
  `research/v3/phase-2/GRAFT_INVENTORY.md:56-60`.

### `gradient.excursion-midpoint-insertion` - Add a source stop to return on-artwork

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in a tiny reviewed scope and `inconclusive` for
  the bar; implementation state `historical`; evidence scope `composition` and `complete-treatment`;
  runtime admissibility `unresolved`.
- **Claim:** only after a two-stop gradient is already selected, add one sufficiently populated,
  endpoint-distinct source color when it brings worst excursion below the firing bar.
- **Inputs -> outputs:** two-stop gradient, occupied color bins, 0.001 support floor, sample grid, and
  excursion bar -> unchanged ramp or one 0.5 stop with before/after excursion and native provenance.
- **Losses and risks:** the 2.5-times-same-color bar was fitted to one positive anchor and is not stable
  at +/-20%; the mechanism only adds and never replaces a midpoint. Its corpus blast radius was two.
- **Evidence:** `research/v2-3/src/internal/ramp-midpoint.ts:11-86`, `:224-340`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:371-381`.

### `gradient.whole-ramp-contrast` - Contrast minima over interpolation

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `live` and
  tested; evidence scope `mechanical`; runtime admissibility `permitted` as contract validation.
- **Claim:** text and accent visibility must be evaluated over the actual OKLab-interpolated field,
  not only at endpoints or published stops; report the minimizing position and violation kind.
- **Inputs -> outputs:** role color, ordered stops, interpolation/render identity, and resolved floors ->
  deterministic dense per-segment samples plus a local refinement around the coarse minimum,
  minimizing locations, sign-crossing/chromatic-carry evidence, and pass/fail records.
- **Losses and risks:** this is not exact inspection of the mathematical continuum. For documented
  8-bit cases whose true minimum is at least 1 raw APCA unit, the refinement residual is at most 0.05
  raw units. The implementation clips out-of-gamut OKLab interpolants while browsers gamut-map them,
  so excursions are an explicit render approximation. APCA blind spots, uncalibrated accent functional
  distance, and the difference between contract validity and quality remain.
- **Evidence:** full contract caveat in `research/v4/PROJECT.md:79-93`, implementation rationale and
  bounds in `research/v3/src/contract/ramp.ts:1-87`, `:150-225`, direct tests in
  `research/v3/tests/contract-ramp.test.ts:195-294`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:382-441`.

### `gradient.indistinct-fraction` - Low-contrast ramp-length measurement

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a measurement; implementation state
  `historical` and unshipped; evidence scope `mechanical`; runtime admissibility `unresolved`.
- **Claim:** the fraction of ramp length below a raw contrast adequacy bar measures exposure that a
  single minimum cannot distinguish.
- **Inputs -> outputs:** role color, rendered ramp, and raw contrast bar -> one fraction in `[0,1]`,
  intervals, and renderer identity.
- **Losses and risks:** the adequacy bar is not calibrated as a universal floor; linear parameter
  length equals screen-area exposure only for the declared render mapping. The measure reproduced one
  reviewer complaint but was built and not shipped.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:382-393` and
  `research/v3/PHASE_0_DECISIONS.md:148-153`.

### `gradient.mdl-path-simplification` - Spatial-t regression, Douglas-Peucker, and stop price

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured`; implementation state `unbuilt`; evidence scope
  `none-local`; runtime admissibility `unresolved`.
- **Claim:** fit linear/radial spatial parameter `t`, sort the field's supported OKLab path, retain
  observed vertices with Douglas-Peucker, and choose model order by high-tail residual plus one stop
  price so false and missed structure are treated symmetrically.
- **Inputs -> outputs:** reviewed or natural field mask and native pixels -> flat/linear/radial
  hypotheses with 2-4 source-supported stops, p95 residual, geometry, stop count, and alternatives.
- **Losses and risks:** field-mask errors contaminate the path; the stop price and JND tolerance are
  uncalibrated. Isotonic assumptions fail on non-monotone paths. No local implementation exists.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:394-413` and
  `research/v2-3-experiments/literature-review/REPORT.md:22-24`.

### `gradient.lambda-structure-price` - Priced collapse/flat/ramp structure

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for local structure pricing and `falsified` for
  the containing global role currency; implementation state `prototype`; evidence scope
  `isolated-semantic` and `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** one measured structure price can decide how much field complexity an artwork deserves
  without using that scalar to assign all roles.
- **Inputs -> outputs:** alternative field structures and explanation costs -> selected structure,
  lambda sensitivity trace, and tied alternatives.
- **Losses and risks:** the result is valid only as a structure sub-decision. P1's complete global
  objective could not express judged role assignment and was closed; splitting lambda after results
  would change the mechanism.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:56-60` and
  `research/v3/phase-2/PROTOTYPE_RANKING.md:68-77`.

### `gradient.render-geometry-custody` - Detection geometry versus delivered render

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for custody and `inconclusive` for product geometry;
  implementation state `instrument`; evidence scope `mechanical` and `complete-treatment`; runtime
  admissibility `unresolved`.
- **Claim:** preserve the geometry a fit actually computed and bind the review renderer, even when the
  consumer currently renders every path as a fixed 135-degree linear gradient.
- **Inputs -> outputs:** fitted linear/radial/conic geometry plus stop path -> optional geometry metadata,
  concrete rendered ramp, and renderer/version provenance.
- **Losses and risks:** discarding a radial fit changes the visual claim. A verdict applies to the
  renderer shown, not an abstract path; geometry metadata does not authorize a new consumer render.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:394-408` and
  `research/v3/PHASE_0_DECISIONS.md:72-75`, `:92-95`.

## 6. Complete Treatments, Search, Arbitration, And Repair

### `search.complete-tuple-enumeration` - Joint legal treatment construction

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically for finite domains; implementation
  state `historical` and tested; evidence scope `mechanical`; runtime admissibility `permitted`.
- **Claim:** enumerate complete `(background,surface,foreground,accent,field-state)` tuples so legality,
  collapse, gradient endpoints, and contrast are evaluated jointly rather than repaired across greedy
  role choices.
- **Inputs -> outputs:** finite role/field alternatives and contract settings -> every feasible complete
  treatment in the declared domain, with cardinality, full lineage, scores, and rejection reasons.
- **Losses and risks:** completeness is relative to candidate and field domains; a candidacy wall makes
  exhaustive tuple search incomplete in image space. Enumeration does not supply a valid aesthetic
  objective.
- **Evidence:** `research/ALGORITHM.md:62-68`,
  `research/v3/phase-1/PRIOR_ART_CHECK.md:24-36`, and
  `research/v2-3/src/internal/palette-core.ts`.

### `search.exact-branch-and-bound` - Certified complete-tuple search

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `prototype`
  and tested; evidence scope `mechanical`; runtime admissibility `permitted` for a valid frozen
  objective and bounds.
- **Claim:** admissible bounds can return the same optimum as exhaustive enumeration while visiting a
  tiny fraction of a very large tuple domain.
- **Inputs -> outputs:** finite tuple factors, exact objective, deterministic branch order, and valid
  bounds -> optimal tuple, objective, visited/pruned counts, and optimality certificate.
- **Losses and risks:** exactness transfers only to the exact objective and bounds supplied. It cannot
  rescue a falsified objective. P6 salvage matched brute force while costing 280 million tuples and
  visiting 5-249.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:55-57` and
  `research/v3/phase-2/PROTOTYPE_RANKING.md:94-102`.

### `selection.pareto-retention` - Non-dominated treatment frontier

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for observed loss from quantized dominance pruning and
  `inconclusive` as a sufficient retention rule; implementation state `historical`; evidence scope
  `complete-treatment`; runtime admissibility `permitted` only as a retention rule.
- **Claim:** remove a candidate only when another is no worse on every declared retained quality
  dimension and strictly better on at least one. In the cited carrier audit, three strong endorsed
  objective maximizers had `paretoMember: false` and were removed by quantized dominance/Pareto
  pruning; they were not nondominated, and scalar pruning was not the cause.
- **Inputs -> outputs:** complete treatments and a fixed vector of quality dimensions/resolutions ->
  one `paretoMember` flag per evaluation, the retained frontier, and audited pruned-treatment rows.
- **Losses and risks:** omitted dimensions permit harmful pruning; noisy or redundant dimensions make
  the frontier large, and a frontier does not select its winner. Dominance also preserved ten endorsed
  winners, so removing the stage is not supported. No monotone separator over the measured coverage
  features protected all three harmful prunes without also protecting known-worse maximizers.
- **Evidence:** implementation in `research/v2-3/src/internal/winner-scoring.ts:1120-1146`; three
  pruned strong objective maximizers and countervailing saves in
  `research/v2-3-experiments/carrier-ranking/ROUND-3.md:83-107`; failed monotone separation in
  `research/v2-3-experiments/carrier-ranking/ROUND-4.md:58-134`.

### `selection.banded-comparator` - Quantized evidence ordering

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `mechanical` and `complete-treatment`; runtime admissibility `unresolved` as authority.
- **Claim:** compare quality blocks only at declared evidence resolution, then use relational and
  deterministic tie stages, so irrelevant floating differences do not decide a treatment.
- **Inputs -> outputs:** scored candidates -> a total order, evidence levels, deciding stage, and tie
  trace.
- **Losses and risks:** stacked utilitarian, leximin, lexicographic, and ASCII stages represented
  conflicting philosophies; a sub-resolution boundary can still flip. The exact comparator was a
  major top-one failure site.
- **Evidence:** `research/v2-3/src/internal/winner-scoring.ts:179-303`,
  `research/v2-3/src/internal/candidate-materialization.ts:50-71`, and
  `research/v3/phase-1/PRIOR_ART_CHECK.md:24-36`.

### `selection.weighted-quality-currency` - Hand-weighted scalar quality

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `falsified` as the tested aesthetic authority and `supported`
  for constituent measurements; implementation state `historical`; evidence scope
  `complete-treatment` and `perturbation`; runtime admissibility `permitted` as a cold computation.
- **Claim:** the tested weighted sum of field, role, identity, support, coherence, and economy terms can
  order complete treatments the reviewer prefers.
- **Inputs -> outputs:** quality axes and exchange rates -> one scalar and total order.
- **Losses and risks:** exchange rates are load-bearing and combine incompatible theories. Fitting 11
  axes reduced held-out agreement from 66.7% to 51.9%; P6 independently fired its exchange-rate and
  robustness falsifiers. This does not prove every scalar formulation impossible.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:84-96`,
  `research/v3/phase-1/PRIOR_ART_CHECK.md:84-96`, and
  `research/v4/PROJECT.md:330-337`.

### `selection.global-description-length` - One MDL objective over all roles

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `falsified` for the Phase 2 global authority; implementation
  state `prototype`; evidence scope `complete-treatment`; runtime admissibility `unresolved`; local
  structure pricing is recorded separately.
- **Claim:** the tested description-length currency over roles, collapse, and gradients can jointly
  choose a complete treatment without staged policy.
- **Inputs -> outputs:** complete configurations and coding model -> one cost, global optimum, and
  explanation/coding breakdown.
- **Losses and risks:** role assignment was structurally inexpressible in the tested scalar-indifferent
  family, and currency mispricing was live. The lambda repair and score-any-palette measurement layer
  remain useful; the global authority does not.
- **Evidence:** `research/v3/phase-2/PROTOTYPE_RANKING.md:68-77` and
  `research/v3/phase-1/PRIOR_ART_CHECK.md:24-36`.

### `selection.portfolio-selector` - Elect among rival complete extractors

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `falsified` for the tested selector forms; implementation state
  `prototype`; evidence scope `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** the tested member-independent description-length/coverage currency can choose among rival
  complete-palette systems better than hardcoding or human election.
- **Inputs -> outputs:** several complete treatments and member-independent evidence -> one selected
  member, margin, bits/coverage trace, and disagreement set.
- **Losses and risks:** P4 passed its mechanical currency bars and still selected the reviewer-inferior
  answer; P3 won 5/8 with no favorable margin relationship (`tau-b = -0.342`). Prior selectors also
  failed or were withheld. This closes tested elections, not every possible selector.
- **Evidence:** `research/v3/phase-2/PROTOTYPE_RANKING.md:79-92`,
  `research/v3/phase-1/PRIOR_ART_CHECK.md:56-68`, and
  `research/v4/PROJECT.md:330-337`.

### `selection.noncompensatory-blocks` - Incumbent-relative quality blocks

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for incompleteness of the historical six-block
  incumbent guard and `inconclusive` for its unchallenged 12-block successor; implementation state
  `historical`; evidence scope `mechanical` and `complete-treatment`; runtime admissibility
  `unresolved`.
- **Claim:** independently binding incumbent-relative quality blocks prevent surplus in one measured
  domain from compensating for a declared fatal regression in another. The six-block formulation
  omitted quality domains and rejected oracle winners; the 12-block formulation repaired mechanical
  coverage but received no generated challengers.
- **Inputs -> outputs:** candidates and fixed block order/bars -> survivors, pairwise block verdicts,
  first deciding block, and incomparable states.
- **Losses and risks:** block definitions and thresholds can encode taste, create cliff effects, and
  reject recoverable candidates. Omitted blocks recreate compensation; redundant blocks double-count
  one concern. These postmortems establish guard behavior and an evidence gap, not future block values
  or selection authority.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_0_7_1_QUALITY_GUARD_POSTMORTEM.md:117-166` and
  `research/ALBUM_ARTWORK_UI_PALETTE_0_7_2_COMPLETE_QUALITY_DOMAIN_POSTMORTEM.md:80-102`.

### `selection.source-lineage-filter` - Winner eligibility from complete lineage

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `historical`
  and tested; evidence scope `mechanical`; runtime admissibility `permitted` as custody filtering, not
  quality authority.
- **Claim:** a candidate can win only if one descriptor proves complete field, role, representative,
  and canonical-key consistency, or exactly satisfies the declared emergency form.
- **Inputs -> outputs:** materialized candidates and optional emergency diagnosis -> eligible subset,
  descriptor-level booleans, basis, counts, and ineligible diagnostics.
- **Losses and risks:** filtering can leave no candidate or impose a quality envelope against an
  unrestricted winner. It proves custody, not semantic belonging.
- **Evidence:** `research/v2-3/src/internal/source-eligibility.ts:190-262` and
  `research/v2-3/src/internal/winner-selection.ts:23-66`.

### `selection.transition-promotion` - Earned gradient and obligation promotion

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `historical`; evidence
  scope `composition` and `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** a source-connected candidate with an accepted native transition and more decisive
  foreground/accent obligation coverage may displace a source-eligible baseline within a fixed
  role-quality loss envelope.
- **Inputs -> outputs:** ranked materialized candidates, accepted transitions, role obligations, and
  objective revision -> per-candidate promotion eligibility and one promoted or baseline winner.
- **Losses and risks:** ordering coverage before quality produced a reviewed failure, but quality-first
  picked a third wrong accent because the preferred one was absent. Two quality envelopes use
  different baselines and must not drift.
- **Evidence:** `research/v2-3/src/internal/transition-promotion.ts:15-107` and
  `research/v2-3/src/internal/winner-scoring.ts:152-177`.

### `selection.gamut-identity-coverage` - Whole-treatment chromatic extent

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a diagnostic and `inconclusive` as selection
  authority; implementation state `historical`; evidence scope `downstream-utility` and
  `complete-treatment`; runtime admissibility `permitted` as a measurement.
- **Claim:** measure whether the complete palette spans the artwork's major chromatic extent so roles
  do not independently omit a major identity direction.
- **Inputs -> outputs:** artwork gamut and treatment colors in a declared scope -> normalized coverage,
  saturation/field guards, and objective or diagnostic contribution.
- **Losses and risks:** coverage can reward the wrong roles or duplicate one direction. It achieved AUC
  0.872 against independently recorded identity complaints and affected about 8%, but interactions
  with Pareto and quality envelopes were inconsistent.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:290-305` and
  `research/v2-3/src/internal/gamut-coverage.ts`.

### `selection.incumbent-anchored-replacement` - Preserve unless challenger dominates

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `falsified` as the tested product-improvement direction and
  `supported` as a mechanical non-regression oracle; implementation state `historical` and tested;
  evidence scope `mechanical` and `complete-treatment`; runtime admissibility `permitted` as a cold
  comparison over available treatments.
- **Claim:** keep the canonical incumbent unless a complete challenger passes every hard constraint,
  passes every absolute component bar, weakly exceeds canonical on all 27 flattened components within
  epsilon, and strictly exceeds it on at least one component by more than epsilon.
- **Inputs -> outputs:** reconstructable canonical 27-vector, complete challenger stream, hard
  constraints, and absolute bars -> incumbent or admitted challenger plus componentwise domination
  certificate; candidate-to-candidate Pareto applies only after admission and only within the minimum
  changed-block class.
- **Losses and risks:** anchoring freezes incumbent defects and made native-complete-palette a slow
  wrapper: 6/391 groups changed, only 2 materially, with one preferred. It remains useful for legality
  and counterfactual diagnostics. Incomparability, exact vector equality, any weaker component, or an
  unreconstructable canonical vector preserves canonical; no weighted compensation is licensed.
- **Evidence:** exact admission and post-admission selection in
  `research/NATIVE_COMPLETE_PALETTE_PROTOCOL.md:169-241`, `:310-335`; product-direction result in
  `research/v4/PROJECT.md:233-244`.

### `selection.fixed-relaxation` - Ordered infeasibility relaxation

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` as a general rule; implementation state
  `prototype` for some forms; evidence scope `mechanical`; runtime admissibility `unresolved`.
- **Claim:** if no complete tuple is feasible, relax declared field structure or collapse choices in a
  fixed order, using black/white escape only after legal source alternatives are exhausted.
- **Inputs -> outputs:** infeasible treatment domain and fixed relaxation order -> first nonempty domain,
  selected legality form, steps taken, and proof that earlier domains were empty.
- **Losses and risks:** relaxation order encodes preference and can discard the true field. Two Phase 3
  proposals incorrectly fired escape while legal field pairs remained.
- **Evidence:** `research/v3/phase-3/PROPOSAL_COMPARISON.md:7-21`, `:46-52`, `:94-119`.

### `selection.content-tie-break` - Deterministic semantic tie resolution

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for content-first deterministic ordering and
  `unmeasured` for semantic relabel invariance or perceptual utility; implementation state `historical`;
  evidence scope `mechanical`; runtime admissibility `permitted` only as a final tie rule.
- **Claim:** candidate materialization compares quantized generated-penalty-adjusted quality blocks,
  then ASCII `completeTreatmentKey`, then treatment ID. Final winner comparison ends with ASCII
  treatment and structural keys after its quantized and configured quality stages.
- **Inputs -> outputs:** scored complete treatments, quality-block order/resolution, role hexes,
  gradient state, treatment IDs, and structural keys -> deterministic materialization and winner
  orders with the first deciding stage.
- **Losses and risks:** treatment IDs and structural/family labels can decide exact content ties, so
  arbitrary semantic relabeling may change an output; that invariance is unmeasured. Quantization and
  deterministic ASCII fallbacks do not imply perceptual utility.
- **Evidence:** materialization comparator in
  `research/v2-3/src/internal/candidate-materialization.ts:40-71`; treatment key in
  `research/v2-3/src/internal/palette-core.ts:4696-4706`; final comparator in
  `research/v2-3/src/internal/winner-scoring.ts:1028-1087`.

### `repair.winner-gated-zero-contrast` - Post-publication defect repair

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in bounded repair cases and `inconclusive` for
  coverage; implementation state `historical` and currently disabled in the cited module; evidence
  scope `composition` and `complete-treatment`; runtime admissibility `unresolved`.
- **Claim:** inspect only a published winner carrying a declared unreadable role/field pair, then try
  role swap, same-field slate, or whole-slate re-pick, while introducing no new protected defect.
- **Inputs -> outputs:** published treatment including midpoint, ranked source-eligible slate, enforced
  and protected pair sets -> unchanged, swapped, same-field, re-picked, or explicit unrepairable result.
- **Losses and risks:** a repair can relocate zero contrast to accent, foreground, or midpoint; measured
  early forms did so in 13/15 and 290/298 cases. Publishing unchanged when no ranked option works is
  deliberate honesty. Running the filter before the bounded slate caused about 10 collateral moves per
  fix; winner gating moved only defective artworks.
- **Evidence:** `research/v2-3/src/internal/zero-contrast-repair.ts:15-33`, `:49-181`, `:247-300`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:146-163`.

### `repair.user-floor-repick` - User parameters as late feasibility

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as containment and `inconclusive` for exact policy;
  implementation state `historical`; evidence scope `mechanical` and `composition`; runtime
  admissibility `permitted` only as late feasibility over an already evaluated domain.
- **Claim:** a raised user contrast floor may change only a winner that violates it; re-pick from an
  already evaluated domain rather than perturbing generation, caps, or ranking for clean artworks.
- **Inputs -> outputs:** unparameterized ranked treatments and requested floors -> byte-identical winner
  if valid, otherwise highest-ranked valid alternative or declared failure.
- **Losses and risks:** presumes the retained domain contains a valid alternative. Applying parameters
  earlier creates capacity cascades; making contrast the selector rather than a filter violates
  reviewer evidence.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:146-169` and
  `research/v3/phase-3/PROPOSAL_COMPARISON.md:90-119`.

## 7. Validators, Robustness, Review, And Provenance

### `validation.contract-invariants` - Complete-treatment structural validation

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `live` and
  tested; evidence scope `mechanical`; runtime admissibility `permitted` as a gate, not quality
  authority.
- **Claim:** independently reject malformed roles, undeclared collapse/escape, non-source colors,
  invalid gradient endpoints/counts, and contrast-floor violations before any quality interpretation.
- **Inputs -> outputs:** one complete treatment, native occupancy, resolved contract constants, and
  renderer identity -> pass/fail scorecard with named invariant violations and witnesses.
- **Losses and risks:** validators cannot prove aesthetic quality, semantic belonging, or "no other
  way" for escape. Population eligibility is not a current validity gate; spatial spread remains
  deferred.
- **Evidence:** `research/v4/PROJECT.md:56-89`, `research/v3/src/contract/invariants.ts`.

### `validation.deterministic-replay` - Same-byte repeat and order invariance

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for cited deterministic fixtures; implementation
  state `instrument` with configuration-scoped tests; evidence scope `mechanical`; runtime
  admissibility `permitted` as a gate.
- **Claim:** identical input bytes and fixed code/configuration/preprocessing produce byte-identical
  output under the exact frozen controls actually exercised.
- **Inputs -> outputs:** repeated executions of the same bytes, code, configuration, decoder, and
  environment -> exact output equality, first divergence, or stop-the-line failure.
- **Losses and risks:** deterministic wrong output remains wrong. The direct tests cover one dev-loop
  fixture and a 28-panel topology run, not every decoder, thread schedule, float environment, relabel,
  iteration order, re-encode, resolution, or rendition. V3 relabel, resize, and crop instruments were
  withdrawn because they do not exist; v2-3 also had a roughly one-in-hundreds same-file flake.
- **Evidence:** direct same-candidate/same-set assertions in
  `research/v3/tests/devloop-runner.test.ts:199-223`; exact 28-panel rerun in
  `research/GRADIENT_FIELD_TOPOLOGY_VALIDATION_3.md:64-70`; same-byte expectation in
  `research/v4/PROJECT.md:99-106`; historical flake in
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:49-63`.

### `validation.perturbation-harness` - Re-encode, dither, and rendition robustness

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as measurement and `inconclusive` for product
  robustness; implementation state `instrument`; evidence scope `perturbation`; runtime admissibility
  `prohibited` because it creates non-native perturbations for development comparison.
- **Claim:** compare outputs under visually irrelevant or information-accounted changes and classify
  exact agreement, same-color agreement, role permutation, informed change, and chaotic change.
- **Inputs -> outputs:** one source plus controlled re-encodes, +/-1-LSB dithers, or rendition pairs ->
  per-role/treatment movement, changed-destination classes, and stratified agreement.
- **Losses and risks:** robustness is not aesthetics and percentages must state agreement versus
  disagreement versus move rate. V2-3 recorded 72.8% re-encode agreement and movement on 114/114
  dither tests.
- **Evidence:** `research/v4/PROJECT.md:99-106`, `:259-261`, `:317-328`, and
  `research/v3/src/robustness/README.md`.

### `validation.parameter-and-cap-sensitivity` - Mechanism perturbation census

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a diagnostic; implementation state `instrument`;
  evidence scope `perturbation`; runtime admissibility `prohibited` because frozen runs and parameter
  sweeps are development inputs.
- **Claim:** perturb each tunable parameter, cap, ordering, and tie rule with type-aware valid values to
  identify inert sites, load-bearing cliffs, correlated changes, and displacement.
- **Inputs -> outputs:** frozen corpus/run, parameter registry, and perturbation policy -> mover counts,
  role destinations, sensitivity curves, and provenance gaps.
- **Losses and risks:** one-at-a-time changes can be invalid when units covary; duplicated code and
  type-invalid sweeps produced false findings. Sensitivity does not say which destination is better.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:491-528`, `:642-667`.

### `validation.parameter-provenance-census` - Independent behavior-site reconciliation

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` for complete cross-surface coverage;
  implementation state `unbuilt`; evidence scope `none-local`; runtime admissibility `prohibited` as a
  build/review transformation rather than product computation.
- **Claim:** independently reconcile a code scan with exported configuration and declared policy
  surfaces so every behavior-affecting choice is reported as declared-only, code-only, anonymous,
  duplicated, or provenance-mismatched before implementation evidence is interpreted.
- **Inputs -> outputs:** numeric-literal report, exported constants/configuration, branches, enums,
  prompts, ties, order, seeds, conversions, decoders, corpus rules, caps, deduplication, fallbacks, and
  author declarations -> one deterministic reconciliation report with owners, units, provenance,
  mismatches, and explicitly uncovered surfaces.
- **Losses and risks:** no current implementation performs this full cross-surface reconciliation. A
  numeric scan is only one input and misses generated configuration, dependency defaults, computed
  values, native behavior, and structural choices. Reconciliation does not establish good values or
  authorize a choice.
- **Evidence:** required independent census and reconciliation in `research/v4/STRATEGY.md:495-522`;
  rich-record parameter fields in `research/v4/STRATEGY.md:641-646`; implemented numeric input report
  is separately bounded in
  `research/v3/src/honesty/report.ts:170-207`, `:350-403`.

### `validation.numeric-literal-provenance-scanner` - TypeScript AST and Python lexer scan

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for scanner behavior and `unmeasured` as a quality
  intervention; implementation state `instrument` and tested; evidence scope `mechanical`; runtime
  admissibility `prohibited` as a build/test instrument rather than product computation.
- **Claim:** scan TypeScript with the compiler AST and Python with a purpose-built lexer, classify each
  candidate through named exclusions and nearby provenance, and publish a deterministic lower-bound
  report that includes the instrument's own source tree.
- **Inputs -> outputs:** configured TypeScript/Python source roots, exclusions, provenance tags, and
  decision index -> stable source findings, named exclusion or tunable status, provenance class,
  language fidelity, lower-bound counts, untagged backlog, skipped-file list, limitations, and
  timestamp-independent body hash.
- **Losses and risks:** the Python side is lexical and classification is intentionally conservative.
  Excluded trees, strings used as parameters, booleans, algorithm choices, generated code, dependency
  defaults, computed constants, and semantic parameter flow remain outside scanner authority. Nearby
  comments can be misattributed, and self-scan does not make those blind spots complete.
- **Evidence:** TypeScript AST walk in `research/v3/src/honesty/scan-ts.ts:1-104`; Python lexer and entry
  point in `research/v3/src/honesty/scan-py.ts:1-90`, `:596-675`, `:957-988`; named classification and
  provenance in `research/v3/src/honesty/classify.ts:1-81`, `:221-321`, `:404-410`; deterministic
  lower-bound/self-scan contract in `research/v3/src/honesty/README.md:34-93`; direct tests in
  `research/v3/tests/honesty-scan-ts.test.ts:1-281`,
  `research/v3/tests/honesty-scan-py.test.ts:1-503`, and
  `research/v3/tests/honesty-report.test.ts:80-188`.

### `validation.typed-statistical-refusal` - Provenance-carrying inference and unrepresentable misuse

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`
  and `tested`; evidence scope `mechanical`; runtime admissibility `permitted` for applicable cold
  calculations.
- **Claim:** return typed statistical results carrying method, sample size, corrections, and caveats,
  while returning a distinct no-number refusal type when assumptions or minimum sample conditions fail.
- **Inputs -> outputs:** typed observations and required design declarations -> statistic with
  provenance, or explicit refusal without a numeric field.
- **Losses and risks:** types cannot prove the declared units, pairing, population, or preregistration
  are true; callers outside the shared surface can still reimplement statistics. Correct inference
  does not turn a local proxy into product evidence.
- **Evidence:** `research/v3/src/stats/README.md:27-55`, `:57-101`, `:116-139`.

### `validation.standing-evidence-adjudication` - Non-gating prior-verdict destination report

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`
  and `tested`; evidence scope `downstream-utility`; runtime admissibility `prohibited` because prior
  reviewed verdicts are effective inputs.
- **Claim:** compare a candidate run with dated standing endorsements, acceptable baselines, and
  known-bad treatments to report exact destinations, contradictions, and candidate reachability
  without penalizing difference from one of many valid answers or producing a score.
- **Inputs -> outputs:** candidate run with source identities, append-only prior tiers, same-color rule,
  and optional baseline -> per-item win/loss/no-signal, conflicts, era strata, reachability, and mover
  lists with `gating: none`.
- **Losses and risks:** prior verdicts are censored, rendition-bound, and regime-bound; current v3
  standing evidence can be empty. Matching an old endorsement is weak development evidence, not
  current quality, and reviewed records may never enter cold inference.
- **Evidence:** `research/v3/src/adjudication/README.md:1-14`, `:18-72`, `:108-125`, `:196-202`.

### `validation.content-addressed-development-loop` - Dependency-closed cache and run diff

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`;
  evidence scope `mechanical`; runtime admissibility `prohibited` as development cache/diff tooling.
- **Claim:** key development results by input bytes, computation identity, and measured recursive code
  closure, then compare complete runs by source identity and surface every changed, missing, newly
  failing, or newly working item.
- **Inputs -> outputs:** candidate entry point, recursively resolved repository-local TypeScript import
  closure, input bytes, cached values, and two run manifests -> source-closure hash, stale-safe cache
  hits/misses, and deterministic per-role/gradient/collapse movement records.
- **Losses and risks:** cache correctness depends on complete dependency measurement; diffs order
  attention but do not decide improvement. The current diff joins by image path and separately flags a
  byte change, so path custody still matters.
- **Evidence:** recursive closure hashing in `research/v3/src/devloop/code-version.ts:70-110`; cache in
  `research/v3/src/devloop/cache.ts:1-42`, `:85-150`, `:152-213`; run-diff semantics in
  `research/v3/src/devloop/diff.ts:1-40`, `:49-104`, `:227-256`.

### `validation.blast-radius-adjudication` - Changed-destination accounting

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for evaluation custody; implementation state
  `instrument`; evidence scope `downstream-utility`; runtime admissibility `prohibited` because review
  records and paired runs are effective inputs.
- **Claim:** every changed output should be classified as endorsement match, known-worse match, or
  unknown before a mechanism is summarized; large or asymmetric changes require a census.
- **Inputs -> outputs:** baseline/candidate outputs and append-only review records -> mover set,
  destination classes, unresolved review sample, and no aggregate winner.
- **Losses and risks:** historical review is censored, relative, rendition-bound evidence. Moving away
  from an accepted palette is not automatically harm; only a reviewed worse destination establishes
  that direction.
- **Evidence:** `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:185-240`.

### `validation.warehouse-latest-verdict` - Append-only review deduplication

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`;
  evidence scope `mechanical`; runtime admissibility `prohibited` because warehouse review data are an
  effective input.
- **Claim:** append-only autosaves become judgment records only after keeping the last verdict for
  each `(batch id,item id)` key; item ID alone is insufficient.
- **Inputs -> outputs:** warehouse JSONL in file order -> distinct latest verdicts, comments,
  endorsements, vetoes, and palette exposure counts with supersession retained.
- **Losses and risks:** rows are not independent judgments. Phase 2's 206 verdict rows reduce to 61
  distinct verdicts over 82 displayed palettes; counting rows inflated volume about 3.4x.
- **Evidence:** `research/v3/phase-2/GRAFT_INVENTORY.md:33-43` and
  `research/v4/PROJECT.md:135-157`.

### `validation.scoped-semantic-review` - Purpose-built mechanism review

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a research method; implementation state
  `instrument`; evidence scope `isolated-semantic`; runtime admissibility
  `prohibited` because human review artifacts are effective inputs; semantic outcomes remain per
  mechanism.
- **Claim:** show a mechanism's output in its native semantic form with source witnesses, alternatives,
  ambiguity, and escape answers, under a frozen question and renderer, rather than infer its behavior
  from a final grade.
- **Inputs -> outputs:** immutable source/mechanism artifacts and question contract -> append-only
  acceptance, rejection, ambiguity, no-answer, free text, presentation identity, and exposure record.
- **Losses and risks:** semantic acceptance is not complete-treatment quality. Prompt order, wording,
  color names, and missing answer choices have changed results.
- **Evidence:** `research/v4/STRATEGY.md:190-231`.

### `validation.complete-treatment-review` - Human product endpoint

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as the product-quality instrument; implementation
  state `instrument`; evidence scope `complete-treatment`; runtime admissibility `prohibited` because
  human judgments cannot enter cold inference.
- **Claim:** absolute grades detect two bad alternatives; blinded pairwise review measures preference;
  comments diagnose why. All apply to the complete rendered treatment and exact rendition.
- **Inputs -> outputs:** one or two rendered complete treatments, pinned renderer, side randomization,
  and source identity -> grades/preferences, comments, ambiguity, and optional endorsed samples.
- **Losses and risks:** one artwork supports several valid answers; an endorsed sample is not unique
  ground truth. Grade-only rounds support quality but not invented causal explanations. Regrade
  agreement is instrument-specific, not universal reviewer accuracy.
- **Evidence:** `research/v4/PROJECT.md:99-125`; finite-review design in
  `research/v4/STRATEGY.md:272-279`; eventual complete-treatment endpoint in
  `research/v4/STRATEGY.md:922-941`.

### `validation.known-good-substitution` - Reviewed artifact as conditional input

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` generally; implementation state `unbuilt` as a
  generic transformation; evidence scope `conditional-known-good`; runtime admissibility `prohibited`.
- **Claim:** independently derive the smallest leak-audited projection satisfying a consumer's declared
  semantic input contract, seal consumer output before joining it to review custody, and compare
  accepted projections with natural, perturbed, and null conditions to localize conditional failures.
- **Inputs -> outputs:** reviewed artifact and full custody envelope held outside the consumer, declared
  input contract, projection schema, and accepted-alternative sampling rule -> content-hashed minimal
  projection, sealed consumer result, target-sufficiency/metadata-channel audit, alternative spread,
  and natural-known-good gap.
- **Losses and risks:** the consumer never receives the reviewed artifact, verdicts, corrections,
  identifiers, chronology, sibling cardinality, custody mapping, or answer-equivalent fields. If a
  trivial decoder can recover the downstream answer, the study fails; it cannot be rescued by
  relabeling the input as known-good. Human projections remain development-only and cannot establish
  natural handoff, generalization, runtime competence, or complete-treatment quality.
- **Evidence:** custody and minimal projection firewall in `research/v4/STRATEGY.md:280-350`;
  accepted-alternative condition matrix and non-implications in `research/v4/STRATEGY.md:352-388`.

### `validation.artifact-hash-custody` - Content-addressed provenance and independent replay

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`
  and tested; evidence scope `mechanical`; runtime admissibility `unresolved` for a cold subset without
  external parent artifacts.
- **Claim:** bind source bytes, dimensions, decoder, code/configuration, parent artifacts, coordinate
  system, typed-array encoding, and renderer into hashes/Merkle roots so stale or mixed evidence fails
  visibly.
- **Inputs -> outputs:** source and artifact graph -> canonical identities, manifests, certificates,
  independent reconstruction result, and failed-attempt preservation.
- **Losses and risks:** hashes prove identity, not truth. Prefix IDs and filenames are unsafe; two
  renditions can have near-identical names and different bytes/content.
- **Evidence:** `research/v4/STRATEGY.md:156-184`, `:396-414`,
  `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:326-343`, and
  `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md:541-551`.

### `validation.synthetic-controls` - Exact fixtures and metamorphic transforms

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically; implementation state `instrument`
  and tested; evidence scope `mechanical`; runtime admissibility `prohibited` as synthetic test tooling.
- **Claim:** uniform, split, checker, frame, thin-line, broad/local/subtle-ramp, speck, and seeded-noise
  fixtures can mechanically falsify implementations and verify transform/coordinate/hash behavior.
- **Inputs -> outputs:** generated exact fixtures and identity/scale/reflection/rotation transforms ->
  exact bytes, expected structural predicates, recomputed fields, and deterministic hashes.
- **Losses and risks:** passing fixtures supports only declared synthetic behavior. It cannot select a
  scale, segmentation, role, or palette.
- **Evidence:** `research/NATIVE_SCALE_SPACE_EVIDENCE_PLAN.md:345-483`.

### `validation.answer-bearing-upper-bound` - Privileged answer-bearing diagnostic

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` as a general ceiling instrument; implementation
  state `unbuilt`; evidence scope `none-local`; runtime admissibility `prohibited`.
- **Claim:** a separately identified diagnostic consumer may receive the minimum declared
  answer-equivalent semantics needed to measure a privileged upper bound. This is the distinct
  `answer-bearing-upper-bound` input class, not a known-good projection or leakage waiver.
- **Inputs -> outputs:** minimum answer-equivalent semantic value, dedicated consumer and experiment
  identity, and declaration of supplied semantics -> separately labeled privileged diagnostic result
  and exact comparison record.
- **Losses and risks:** even this class excludes verdicts, grades, comments, preferences, corrections,
  exposure history, source identity, and custody metadata. Results cannot be mixed with ordinary
  consumer results, fit natural mechanisms, or support natural-handoff, generalization, runtime,
  product-quality, or advancement claims.
- **Evidence:** distinct input class and restrictions in `research/v4/STRATEGY.md:335-350`; firewall
  boundary in `research/v4/STRATEGY.md:390-405`.

## 8. Closure Index

This is navigation to canonical records, not a second set of mechanism records. Closure remains scoped
to the cited formulation; surviving measurements do not restore the closed authority.

| historical closure | canonical record(s) carrying status | surviving bounded records | source |
| --- | --- | --- | --- |
| Phase 2 P1 global MDL authority | `selection.global-description-length` | `gradient.lambda-structure-price`, `gradient.excursion-probe` | `research/v3/phase-2/PROTOTYPE_RANKING.md:68-77` |
| Phase 2 P4 portfolio election | `selection.portfolio-selector` | member byte-identity and disagreement diagnostics represented by Section 7 custody records | `research/v3/phase-2/PROTOTYPE_RANKING.md:79-92` |
| Phase 2 P6 weighted continuous authority | `selection.weighted-quality-currency` | `search.exact-branch-and-bound`, `evidence.multiscale-surround`, `gradient.excursion-probe` | `research/v3/phase-2/PROTOTYPE_RANKING.md:94-102` |
| Tested scalar/whole-selector boundary | `selection.weighted-quality-currency`, `selection.global-description-length`, `selection.portfolio-selector` | scoped measurements only; no theorem about untested classes | `research/v4/PROJECT.md:330-337` |

## 9. Restricted Models, Semantic Oracles, And Learned Artifacts

### `model.vlm-closed-question-set` - VLM structural labels

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive` for semantic labels; implementation state
  `instrument`; evidence scope `isolated-semantic`; runtime admissibility `prohibited`.
- **Claim:** a pinned VLM under constrained decoding can answer frozen structural questions about
  ground, texture, enclosure, geometry, subjects, and marks for development stratification.
- **Inputs -> outputs:** image normalized under oracle policy, model/revision, ordered prompt/schema,
  seed/decoding policy -> one closed-vocabulary label record per question plus note and full provenance.
- **Losses and risks:** labels are not truth; prompt wording and order dominate hard conclusions. The
  cold runtime forbids a warm 26-37 GB model, and v3 used oracle labels only as census/strata/priors.
- **Evidence:** `research/v3/PHASE_1_HANDOFF.md:85-90`,
  `research/v3/oracle/premise/CD_RESULT.md`, and
  `research/v3/oracle/bakeoff/README.md`.

### `model.grammar-constrained-decoding` - Structured VLM output enforcement

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` mechanically for oracle instrumentation;
  implementation state `instrument` and tested; evidence scope `mechanical`; runtime admissibility
  `prohibited` for palette inference.
- **Claim:** tokenizer-specific JSON-schema logits constraints prevent a greedy VLM from emitting
  malformed or rubric-key JSON; changed-input validate-and-retry is a fallback when grammar is absent.
- **Inputs -> outputs:** model tokenizer, schema, prompt, and image -> valid typed JSON or bounded failed
  attempt ledger.
- **Losses and risks:** grammatical validity does not make semantics correct. Grammar support must be
  measured per model/tokenizer; retrying unchanged greedy input is a no-op.
- **Evidence:** `research/v3/oracle/bakeoff/README.md:97-153`.

### `model.wording-disagreement` - Inter-prompt uncertainty

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` as a disagreement diagnostic and `falsified` for
  the tested ground-question corpus authority; implementation state `instrument`; evidence scope
  `isolated-semantic`; runtime admissibility `prohibited`.
- **Claim:** independent wording variants holding construct/order fixed expose prompt uncertainty more
  honestly than the model's near-constant self-reported confidence.
- **Inputs -> outputs:** same images/model under two frozen prompt variants -> per-question agreement,
  kappa, binary disagreement, concordant subset, and no forced aggregate.
- **Losses and risks:** variants C and D agreed on ground type only 46% and binary only 47%; holding
  order fixed was insufficient. Self-confidence was high on 98.6% and should not substitute for
  disagreement. Concordance can still reflect one shared model habit.
- **Evidence:** `research/v3/oracle/premise/CD_RESULT.md:9-23`, `:48-73`, `:133-146`.

### `model.sam-mask-generation` - Prompted Segment Anything masks

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `inconclusive`; implementation state `instrument`; evidence
  scope `isolated-semantic`; runtime admissibility `prohibited` under current accuracy and cold-cost
  evidence.
- **Claim:** pinned point/box/text/object prompts can generate candidate masks useful for visualizing
  subject, text, and mark hypotheses without granting those masks role authority.
- **Inputs -> outputs:** source, pinned SAM stack, prompts, cut/selection policy -> candidate masks,
  scores, prompt provenance, and explicit no-mask state.
- **Losses and risks:** model confidence was not semantic purity; masks can contain the point while
  washing over the wrong region. Cold cost around 6.2 s was ruled slow. Determinism is stack-specific.
- **Evidence:** `research/v3/PHASE_1_HANDOFF.md:45-50`, `:85-90`, and
  `research/v3/oracle/sam/DETERMINISM_TEST.md`.

### `model.sam-residual-subtraction` - Figure subtraction to field residual

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `falsified` as the tested background isolator and `supported`
  only as a field-enriched prior; implementation state `instrument`; evidence scope
  `isolated-semantic`; runtime admissibility `prohibited`.
- **Claim:** the tested rule unions selected subject/text/mark masks and treats the unmasked residual as
  pure field.
- **Inputs -> outputs:** SAM masks and subtraction cuts -> residual image/mask, contamination causes,
  and purity review.
- **Losses and risks:** reweighted pure-field rate was 0.24 against 0.75, with every stratum below
  0.50; even the charitable pure-plus-mostly ceiling missed the bar. Unnamed secondary objects,
  residual text, and ornaments survive. Forced-choice ambiguity qualified rates but not the verdict.
- **Evidence:** `research/v3/oracle/sam/RESIDUAL_PURITY_VERDICT.md:9-50`, `:99-112`.

### `model.point-to-sam-ground` - Point localization followed by mask growth

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for point localization and `falsified` for the
  tested ground-mask route; implementation state `instrument`; evidence scope `isolated-semantic`;
  runtime admissibility `prohibited`.
- **Claim:** the tested pointing model locates the ground and SAM grows the containing, ground-ranked, or
  union mask into the field.
- **Inputs -> outputs:** image, point hypotheses, SAM masks, and one of three policies -> point verdict,
  selected wash, and route verdict.
- **Losses and risks:** dot-right passed 13/16, but both-right was only 1/16, 2/16, and 2/16 against an
  8/16 bar. The pointer was not the failure; mask growth was. Duplicate-image response noise exceeded
  the between-policy signal.
- **Evidence:** `research/v3/oracle/sam/POINTING_TYPICAL_VERDICT.md:18-51`, `:88-184`.

### `model.global-embeddings` - DINO/CLIP-family corpus descriptors

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` for bounded offline diagnostics; implementation
  state `instrument`; evidence scope `mechanical`; runtime admissibility `prohibited` for per-file
  inference.
- **Claim:** pinned global image embeddings can identify likely rendition/duplicate components and
  organize development coverage without entering per-file palette inference.
- **Inputs -> outputs:** offline corpus files and model arm -> one L2-normalized vector per file,
  nearest-neighbor graph, clusters, coverage strata, and model/version/hash provenance.
- **Losses and risks:** embeddings mix subject, layout, and palette; a 0.95 near-duplicate graph was
  measured incomplete. The holdout and coverage set depend on the selected arm, and reviewer gallery
  exposure limits later claims. Runtime corpus lookup is prohibited.
- **Evidence:** `research/v4/PROJECT.md:189-212` and
  `research/v3/oracle/embeddings/POOLING_FEASIBILITY_NOTES.md`.

### `model.dino-cls-mean-patch` - DINO CLS plus mean-patch pooling

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured`; implementation state `unbuilt`; evidence scope
  `none-local`; runtime admissibility `prohibited` for per-file inference.
- **Claim:** concatenating the CLS token with the mean of all patch tokens may retain distributed
  layout evidence lost by CLS-only global descriptors and improve the offline embedding instrument.
- **Inputs -> outputs:** DINO forward pass with all patch tokens -> one 2048-dimensional pooled vector
  per image and a new separately tagged bake-off arm.
- **Losses and risks:** stored artifacts contain only one pooled vector; patch tokens were discarded,
  so inference must rerun. Measuring costs about 10-14 GPU minutes for 16,145 images, but adopting
  would disturb near-duplicate census, holdout pins, coverage clustering, and gallery evidence.
- **Evidence:** `research/v3/oracle/embeddings/POOLING_FEASIBILITY_NOTES.md:1-10`, `:36-133`,
  `:137-231`.

### `model.monocular-depth-ground` - Depth as ground/figure evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally and externally disfavored for the claim;
  implementation state `unbuilt`; evidence scope `none-local`; runtime admissibility `prohibited`.
- **Claim:** a proposed monocular depth map might separate ground from subject, or map flat graphics to
  a nearly uniform field useful as a photo-versus-flat signal.
- **Inputs -> outputs:** image and pretrained depth model -> dense relative depth, optional confidence,
  uniformity/edge diagnostics, and explicit out-of-domain test.
- **Losses and risks:** only 4/30 reviewed hard covers depicted a place with depth. External evidence
  reports confident structured wrong depth on printed pictures and flat graphics; relative depth does
  not encode compositional ground. No depth model has been run in this repository.
- **Evidence:** `research/v3/oracle/sam/GROUND_ROUTES.md:20-96` and
  `research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:761-775`.

## 10. Literature-Derived Extensions

These entries are sourced from primary literature and state exact repository overlap. None has local
quality evidence unless the entry says otherwise. A funded implementation or evaluation would require
the richer record, independent source/revision anchors, applicable artifact contract, resource check,
and scoped protocol in `research/v4/STRATEGY.md`; this compact census does not provide them.

### `literature.constrained-connectivity` - Hierarchical constrained connectivity

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** local dissimilarity constraints plus a global range constraint can form a hierarchy that
  prevents chaining across a slowly varying bridge while retaining connected regions.
- **Inputs -> outputs:** pixel/region adjacency graph, dissimilarity, and local/global constraints ->
  nested partitions or component tree with threshold provenance.
- **Losses and risks:** global range thresholds can still be scale-sensitive and do not supply semantic
  field/figure labels. Connectivity cliffs and stable edge ordering remain.
- **Evidence:** [L1].

### `literature.mutex-watershed` - Attractive and repulsive graph partitioning

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` for the learned-affinity form and `unresolved`
  for a classical-cue formulation.
- **Claim:** greedily process attractive and repulsive edges under mutex constraints to infer an
  unspecified number of segments without seeds or a partition threshold.
- **Inputs -> outputs:** stable ordered graph edges with signed affinities -> one partition, mutex
  constraints, and edge-decision trace.
- **Losses and risks:** published strength relies on learned affinities; classical cues would require a
  new local claim. Edge ordering and equal weights are consequential, and segments have no role meaning.
- **Evidence:** [L2].

### `literature.lifted-multicut` - Nonlocal must-join and must-cut partitioning

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** lifted edges add long-range attraction/repulsion to a local region graph, allowing
  partitions to encode nonlocal identity or separation evidence under explicit consistency.
- **Inputs -> outputs:** base graph, lifted edges, and costs/constraints -> one or more graph
  decompositions, objective/bound certificate, and cut-edge provenance.
- **Losses and risks:** cost design reintroduces an objective-currency problem; exact optimization can
  be expensive. Nonlocal constraints can confidently propagate one wrong semantic relation.
- **Evidence:** [L3].

### `literature.tokencut` - Normalized cuts over self-supervised tokens

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited`.
- **Claim:** normalized cuts on DINO token-similarity graphs can expose a salient foreground object
  without labels, producing a competing figure mask rather than assigning UI roles.
- **Inputs -> outputs:** resized/model-normalized image and pretrained transformer patch tokens ->
  eigenvector, bipartition/mask, object score, and token-grid provenance.
- **Losses and risks:** model and resampling conflict with cold/native constraints; one salient-object
  prior is poor for collage, typography, and no-object art. Stored DINO artifacts lack patch tokens.
- **Evidence:** [L4].

### `literature.relative-total-variation` - Structure/texture separation by RTV

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** relative total variation suppresses oscillatory texture while retaining major structural
  edges, potentially producing alternate field evidence without SLIC grain fragments.
- **Inputs -> outputs:** image and spatial/regularization scales -> smoothed structure image and texture
  residual.
- **Losses and risks:** parameters define what scale counts as texture; thin typography may be removed,
  and output colors are synthesized evidence rather than publishable pixels.
- **Evidence:** [L5].

### `literature.double-dip` - Single-image coupled-prior layer decomposition

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `prohibited` under the current cold envelope.
- **Claim:** optimize coupled untrained deep image priors on one image to decompose field and figure
  layers without an external training corpus; the output layers and masks are unlabeled until a
  separate task interpretation assigns meaning.
- **Inputs -> outputs:** one image, random network initialization, number of layers, task hints, task-
  specific reconstruction/exclusion/regularization losses, and stopping policy -> several unlabeled
  reconstructed layers and masks with optimization trace. Hints and regularizers are effective inputs,
  not incidental implementation details.
- **Losses and risks:** examples commonly require task-specific hints, exclusion losses, or other
  regularization to resolve non-identifiability. Reported optimization takes minutes on a V100, while
  random initialization, synthesized layers, and stopping sensitivity conflict with cold determinism
  and exact-source publication. It is a research-only decomposition hypothesis, not an unsupervised
  source of semantic field/figure labels.
- **Evidence:** [L6].

### `literature.total-generalized-variation` - Piecewise-smooth field regularization

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** second-order total generalized variation can model piecewise-affine shading without the
  staircasing of first-order total variation, yielding field and residual hypotheses.
- **Inputs -> outputs:** image/field observations and first/second-order weights -> regularized field,
  derivative fields, residual, and convergence diagnostics.
- **Losses and risks:** weights set structural scale; the reconstructed field is not source truth and
  can blur boundaries or absorb figures. Solver cost and null/no-field behavior are unresolved.
- **Evidence:** [L7].

### `literature.graph-trend-filtering` - Adaptive piecewise-polynomial graph fields

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** L1 penalties on higher-order graph differences can fit locally adaptive piecewise-smooth
  scalar evidence fields over an image graph while retaining abrupt structural changes.
- **Inputs -> outputs:** graph signal, incidence/higher-order operator, and regularization -> fitted graph
  signal, sparse knots/edges, residual, and optimization status.
- **Losses and risks:** the cited formulation is scalar. Applying it independently to color channels
  permits different knot sets per channel; asserting shared vector knots requires a separately declared
  joint/group-norm penalty and evidence not supplied by this citation. Graph and regularization choices
  are load-bearing, output is synthetic evidence, and knots have no semantic field/figure meaning.
- **Evidence:** [L8].

### `literature.topology-loss` - Persistent-homology segmentation constraint

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` because target topology is research-only and
  the cited producer is learned.
- **Claim:** compare predicted and target topology through persistent homology so a mask producer is
  penalized for broken components/holes rather than only per-pixel error.
- **Inputs -> outputs:** soft predicted mask and target topology/mask -> differentiable topological loss,
  persistence pairs, and error attribution.
- **Losses and risks:** requires reviewed target masks/topology and therefore cannot be an unsupervised
  runtime mechanism by itself. Correct Betti numbers do not imply correct semantics or geometry.
- **Evidence:** [L9].

### `literature.archetypoids` - Observed exemplars instead of synthetic archetypes

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** constrain archetypal representatives to observed data points. A BUILD initialization selects
  a starting set and SWAP exchanges selected and unselected observations while residual sum of squares
  improves, producing observed exemplars rather than synthetic means.
- **Inputs -> outputs:** finite observations in the paper's standard normed feature setting,
  cardinality, and BUILD initialization choice -> locally optimized archetypoids, mixture coefficients,
  residual sum of squares, and witness indices.
- **Losses and risks:** BUILD/SWAP is initialization-dependent and reaches a local optimum; extremes
  attract noise, while feature scaling and cardinality determine the answer. The citation does not
  establish a population-weighted extension for repeated source colors. Source observation does not
  establish role, support, or semantic belonging.
- **Evidence:** [L10].

### `literature.unbalanced-optimal-transport` - Partial mass correspondence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** unbalanced optimal transport can compare artwork and palette/field distributions while
  allowing mass creation/destruction, avoiding forced matching of every texture or tiny mark.
- **Inputs -> outputs:** two weighted color/spatial distributions, ground cost, and mass-relaxation
  parameters -> transport plan, unmatched mass, cost decomposition, and correspondence provenance.
- **Losses and risks:** ground cost and mass penalty are exchange rates and can become another scalar
  judge. Distribution agreement ignores role and can favor reconstruction over treatment quality.
- **Evidence:** [L11].

### `literature.fused-gromov-wasserstein` - Joint feature and relation matching

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** fused Gromov-Wasserstein can compare both color features and pairwise structural relations,
  providing a diagnostic for whether palette-family relationships mirror artwork relationships.
- **Inputs -> outputs:** two weighted attributed metric spaces and feature/structure tradeoff -> coupling,
  fused discrepancy, and relation mismatch decomposition.
- **Losses and risks:** expensive nonconvex optimization and a feature/structure exchange rate; relation
  fit is not role correctness or human preference. It is diagnostic only, not a selector.
- **Evidence:** [L12].

### `literature.deepgaze-iii` - Human fixation-density and scanpath prior

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited`.
- **Claim:** DeepGaze III predicts a conditional probability density for the next fixation from the
  image and fixation history; a scanpath is obtained only by autoregressively sampling those successive
  densities, not as one direct model output.
- **Inputs -> outputs:** model-normalized image, pretrained image and scanpath networks, previous
  fixations, and an explicit center-bias log-density artifact -> normalized conditional next-fixation
  log-density with model, center-bias, preprocessing, and calibration provenance.
- **Losses and risks:** the center-bias artifact is an effective additive log-density input and must not
  be hidden as a harmless default. Natural-image free-viewing data may not transfer to stylized album
  art or UI-role attention; autoregressive sampling adds policy and randomness. The mechanism requires
  a warm model and resampling and does not assign semantic identity or treatment roles.
- **Evidence:** [L13].

### `literature.diverse-m-best` - Retain diverse near-optimal hypotheses

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** generate several high-quality but structurally diverse solutions instead of forcing one
  near-tie winner, preserving alternatives for conditional review or downstream evidence.
- **Inputs -> outputs:** finite structured objective, diversity measure/constraints, and requested `M` ->
  ordered hypothesis set, base/diversity costs, and duplicate/tie trace.
- **Losses and risks:** diversity metric and `M` are policy; a wrong base objective yields diverse wrong
  answers. The mechanism does not solve final selection and must not become a portfolio election by
  implication.
- **Evidence:** [L14].

### `literature.submodular-target-cover` - Minimum-cost target coverage

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** greedily minimize selection cost until a declared monotone submodular coverage target is
  reached, with the target-cover approximation interpreted under Wolsey's assumptions.
- **Inputs -> outputs:** item costs, monotone submodular coverage function, target, and deterministic
  tie rule -> selected subset, achieved coverage, marginal gains, and uncovered target.
- **Losses and risks:** feature definition encodes authority; submodularity must be proved or measured.
  Target cover is not the fixed-budget maximization problem and does not establish treatment quality.
- **Evidence:** [L15].

### `literature.submodular-budget-maximization` - Fixed-budget marginal-gain retention

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** under a fixed cardinality budget, greedy marginal gain approximately maximizes a
  nonnegative monotone submodular objective under the Nemhauser-Wolsey-Fisher conditions.
- **Inputs -> outputs:** hypothesis set, monotone submodular value function, cardinality budget, and tie
  rule -> bounded selected subset, marginal trace, and approximation context.
- **Losses and risks:** this formalizes capacity but does not remove displacement. Objective features
  encode policy, and guarantees do not transfer to nonmonotone, non-submodular, or additional-constraint
  variants without new analysis.
- **Evidence:** [L28].

### `literature.electre-outranking` - Veto-aware multicriteria comparison

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` for ELECTRE locally; implementation state
  `unbuilt`; evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** an ELECTRE III-style relation aggregates criterion-level pseudo-criteria into global
  concordance, attenuates it with criterion-specific discordance/veto into a credibility index, then
  applies descending and ascending distillation to produce preorders while preserving incomparability.
- **Inputs -> outputs:** alternatives, oriented criterion performances, criterion weights,
  indifference/preference/veto thresholds, and distillation discrimination settings -> pairwise partial
  and global concordance, discordance/vetoes, credibility matrix, descending/ascending preorders, and
  their intersection.
- **Losses and risks:** weights, pseudo-criterion thresholds, vetoes, and distillation cuts all need
  provenance and sensitivity analysis; changing them can reverse or incomparably separate alternatives.
  Distillation does not guarantee the preferred treatment. Repository selector failures require a
  scoped arbitration test, not assumed authority. This is distinct from an ELECTRE I kernel.
- **Evidence:** repository overlap in `research/v3/phase-3/PROPOSAL_COMPARISON.md:7-21` and
  `research/v4/STRATEGY.md:416-446`; ELECTRE source [L16].

### `literature.learned-theme-representativeness` - Human-fitted image-theme model

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `supported` in the cited paper and `unmeasured` for this
  repository's treatment task; implementation state `unbuilt`; evidence scope `none-local`; runtime
  admissibility `unresolved`.
- **Claim:** learn image-theme representativeness from human-selected swatch sets using segment,
  salience, reconstruction, diversity, and coverage features rather than hand-declaring exchange rates.
- **Inputs -> outputs:** candidate observed-color theme, segmented image features, and fitted model ->
  representativeness prediction and feature contributions.
- **Losses and risks:** this predicts color-theme representativeness, not role assignment, contrast,
  gradients, or complete UI quality. Its learned coefficients and population do not validate the
  repository's hand-weighted product currency; transferring them requires a new population, feature
  implementation, data split, and runtime decision.
- **Evidence:** repository citations/synthesis in `research/RESEARCH.md:14-18` and
  `research/v2-3-experiments/literature-review/REPORT.md:17-20`, `:50-53`; primary paper [L29].

### `literature.conformal-risk-control` - Calibrated monotone-loss bounds

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` until calibration custody is separated from
  cold inference and the loss assumptions hold.
- **Claim:** use an exchangeable calibration set to choose a threshold controlling expected monotone
  loss, such as false removals or contract-risk, with finite-sample guarantees.
- **Inputs -> outputs:** frozen calibration scores/losses, risk level, and monotone threshold family ->
  calibrated threshold and risk guarantee with sample/custody identity.
- **Losses and risks:** exchangeability, loss design, and calibration independence are load-bearing;
  reviewer preference is multi-valid and may not be a monotone loss. Per-item review data cannot enter
  runtime lookup.
- **Evidence:** [L17].

### `literature.center-smoothing` - Certified structured-output stability

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved` and research-only until resource conditions
  exist.
- **Claim:** randomized smoothing in an output metric space can certify that a structured output such
  as a mask or treatment remains within a radius under bounded input perturbation.
- **Inputs -> outputs:** base mechanism, perturbation distribution, output distance, sample count, and
  confidence -> center output, certified radius/bound, abstention, and sampling record.
- **Losses and risks:** repeated randomized inference conflicts with byte determinism unless seeds and
  guarantees are carefully separated; the output metric may ignore role or aesthetic damage. It can
  certify a consistently wrong result.
- **Evidence:** [L18].

### `literature.interval-bound-propagation` - Deterministic neural bounds

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` unless a compatible neural runtime is
  independently admitted.
- **Claim:** propagate input intervals through a compatible neural network to bound outputs and certify
  that selected decisions cannot cross declared margins under bounded perturbations.
- **Inputs -> outputs:** neural model, input bounds, and decision function -> output intervals, certified
  decisions, and vacuous/non-vacuous status.
- **Losses and risks:** bounds can be loose, most repository mechanisms are non-neural/discrete, and
  training for tight bounds changes the model. A certificate says nothing about semantics.
- **Evidence:** [L19].

### `literature.s-cielab` - Spatially filtered color-difference measurement

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** spatial filtering before CIELAB difference can measure visibility of encoding, dither, and
  rendition changes better than independent pixel color distance.
- **Inputs -> outputs:** two registered rendered images, viewing/display parameters, and spatial filters
  -> spatial difference map and summary distribution.
- **Losses and risks:** requires alignment and viewing assumptions; a low perceptual image difference
  does not imply unchanged palette semantics. It is diagnostic only, not a selector.
- **Evidence:** [L20].

### `literature.cambi` - Contrast-aware multiscale banding index

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`;
  evidence scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** a no-reference multiscale contrast-sensitive measure can quantify visible contour banding
  introduced by a rendered gradient and help test stop misuse.
- **Inputs -> outputs:** rendered field image and declared display/scale assumptions -> banding map/index
  across scales.
- **Losses and risks:** designed for video compression banding, not OKLab UI gradients or semantic stop
  need; render size and dithering matter. Transfer from compressed-video quality to UI-rendered
  gradient diagnostics is unvalidated. It cannot decide whether a gradient belongs or authorize a
  stop.
- **Evidence:** [L21].

### `literature.decolor-contiguous-outliers` - Low-rank background and contiguous outliers

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` for the canonical multi-frame mechanism under
  the one-supplied-file boundary.
- **Claim:** DECOLOR jointly estimates a low-rank background representation and a spatially contiguous
  outlier support, coupling decomposition with foreground segmentation rather than thresholding an
  independently fitted residual.
- **Inputs -> outputs:** registered video frames, neighborhood graph, rank/regularization choices, and
  optimization policy -> low-rank background frames, contiguous binary outlier masks, and convergence
  trace.
- **Losses and risks:** the temporal low-rank premise is absent for one album-art file; manufacturing
  pseudo-frames from renditions or transforms would introduce non-native evidence. Moving background,
  camera motion, static foreground, and regularization can break the decomposition, while outliers do
  not acquire field/figure or role semantics.
- **Evidence:** [L30].

### `literature.differentiable-soft-morphology` - Smooth erosion and dilation operators

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `permitted` for fixed operators with pinned kernels and
  temperatures, and `prohibited` for learned-parameter variants under the current no-model boundary.
- **Claim:** smooth approximations to morphological min/max can turn a scalar field into soft erosion,
  dilation, opening, closing, or morphology-derived losses while retaining gradients. A fixed operator
  is a deterministic image computation; learning structuring elements or morphology-layer parameters
  is a distinct model mechanism.
- **Inputs -> outputs:** scalar image or soft mask, fixed or learned structuring element, operator
  sequence, and softness/temperature -> soft morphological field and, when training, parameter
  gradients.
- **Losses and risks:** softness changes topology and can leak weak distant responses across a hard
  boundary; kernel shape, scale, and temperature are load-bearing. Medical-segmentation transfer does
  not validate album typography or field evidence, and learned variants inherit training-population,
  artifact, and runtime restrictions not carried by a fixed operator.
- **Evidence:** fixed soft-filter formulation [L31]; learned morphological-network variant [L32].

### `literature.rgbxy-palette-layers` - Spatial palette decomposition in RGBXY space

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** embedding pixels in joint RGBXY geometry and simplifying that color-spatial hull can derive
  a compact palette with per-pixel mixing weights, enabling image reconstruction and palette-based
  recoloring with spatially coherent layers.
- **Inputs -> outputs:** raster, normalized pixel coordinates, palette-size/simplification settings, and
  geometric solver policy -> palette vertices, per-pixel additive mixing-weight layers,
  reconstruction, and recoloring controls.
- **Losses and risks:** coordinate normalization and palette cardinality define the decomposition;
  geometry can split one color by location or merge semantic roles. Reconstructed/recolored pixels are
  synthesized, and decomposition layers are neither source-connected role evidence nor a complete UI
  treatment. Full-resolution cost and cold-envelope fit are unmeasured locally.
- **Evidence:** [L33].

### `literature.dbnet-text-maps` - Learned differentiable-binarization text evidence

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` under the current pretrained-model and
  native-no-resampling boundary.
- **Claim:** DBNet++ combines learned multi-scale image features, adaptive scale fusion, and
  differentiable binarization to produce text-region evidence before polygon extraction, offering a
  learned alternative to the repository's classical text heuristics.
- **Inputs -> outputs:** resized/model-normalized raster, pretrained detector revision, threshold and
  postprocessing settings -> text probability map, adaptive threshold map, approximate binary map,
  polygons, and model/preprocessing provenance.
- **Losses and risks:** scene-text training, model weights, resizing, thresholds, and polygon
  postprocessing are effective inputs. Album typography, logos, pointillism, and decoration may differ
  materially from scene text; a text map supplies no foreground polarity, role, identity, or product-
  quality authority.
- **Evidence:** [L34].

### `literature.frequency-tuned-saliency` - Global color-deviation saliency map

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `permitted` as a fixed bounded image computation.
- **Claim:** compare each smoothed CIELAB pixel with the image's global mean color to produce a full-
  resolution frequency-tuned saliency map that suppresses high-frequency texture while retaining
  broad color contrast.
- **Inputs -> outputs:** raster, color conversion, smoothing kernel, and global mean -> one scalar
  saliency value per pixel plus summary distribution.
- **Losses and risks:** the global mean is a poor reference for split fields, frames, gradients, and
  several large subjects; smoothing can erase typography and small marks. Distinctiveness is not
  field ownership, attention, role, identity, or treatment quality, and the cited natural-image result
  has no local transfer evidence.
- **Evidence:** [L35].

### `literature.spectral-residual-saliency` - Fourier log-spectrum residual

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `prohibited` for the cited normalized-scale form and
  `unresolved` for a native-resolution reformulation.
- **Claim:** subtract a local average from an image's Fourier log-amplitude spectrum, retain phase, and
  invert the residual to obtain a saliency map from spectral novelty rather than direct color
  deviation.
- **Inputs -> outputs:** normalized scalar image, FFT conventions, log-spectrum averaging filter, and
  output smoothing -> spectral residual, reconstructed response, and scalar saliency map.
- **Losses and risks:** normalization/resizing changes the source and the selected spatial frequency
  bands; padding, FFT normalization, and smoothing alter the answer. Repeated texture can dominate,
  broad subjects may disappear, and spectral surprise carries no field, role, or identity semantics.
- **Evidence:** [L36].

### `literature.boundary-connectivity-saliency` - Boundary-prior background propagation

- **Authorization:** `inventory-only`; this census entry grants no selection, composition, funding, or product authority.
- **Status:** scientific interpretation `unmeasured` locally; implementation state `unbuilt`; evidence
  scope `none-local`; runtime admissibility `unresolved`.
- **Claim:** boundary connectivity estimates whether a region belongs to background from how strongly
  its area connects to the image boundary, then propagates that prior over a region graph to optimize
  a salient-object map.
- **Inputs -> outputs:** image regions/superpixels, region adjacency and color distances, boundary
  contacts, and optimization constants -> boundary-connectivity/background probabilities and optimized
  saliency map.
- **Losses and risks:** border-touching subjects, frames, edge typography, and nonuniform grounds violate
  the background prior; superpixel scale and graph weights create cliffs. Foreground saliency is not
  compositional ground, UI role, or identity evidence, and local solver/runtime behavior is unmeasured.
- **Evidence:** [L37].

## 11. Coverage Map And Explicit Grouping

This map is navigational, not a dependency graph.

| required concern | records |
| --- | --- |
| Raster and color custody | Section 2, including bounded-resize inadmissibility and legacy observed-color publication |
| Segmentation and discovery | `evidence.connected-components`, `evidence.slic-region-graph`, `evidence.tree-of-shapes`, `candidate.field-hypotheses`, `candidate.native-transition-path`, and Section 10 graph extensions |
| Fields, frames, texture, topology, gradients | Sections 3 and 5, including split texture records and the frozen evidence/scorer/transfer boundaries |
| Candidate generation, provenance, caps, and role mechanisms | Section 4 |
| Complete-tuple construction and search | `search.complete-tuple-enumeration`, `search.exact-branch-and-bound` |
| Collapse, escape, contrast, and repair | Section 2 publication forms, Section 5 contrast, Section 6 repair records |
| Selectors, noncompensation, tie-breaking, and certificates | Sections 6-8 |
| Robustness, review, provenance, parameter honesty, statistics, adjudication, and development custody | Section 7 |
| SAM, VLM, embeddings, and depth | Section 9 |
| Literature-derived extensions with precise repository overlap | Section 10 |

Deliberate grouping decisions:

- Low-level formula helpers are grouped with the causal mechanism they implement. For example,
  SAT/BigInt/Q0.24 arithmetic is part of `evidence.native-mask-scale-space`, and APCA interpolation
  helpers are part of `gradient.whole-ramp-contrast`.
- Thresholds are named where they define a known behavior, cliff, or evidence scope. This is not a
  complete constant dump; configuration tests remain the authority for every historical value.
- Historical systems are not inventory entries. P1/P4/P6 appear only in the closure index after their
  reusable transformations and measurements are separated.
- Evaluation machinery is included only where it causally changes evidence interpretation: verdict
  deduplication, semantic question/renderer scope, complete-treatment review, robustness, custody,
  known-good substitution, and destination adjudication.

## 12. Primary Literature References

- **[L1]** Soille, "Constrained Connectivity for Hierarchical Image Partitioning and Simplification,"
  IEEE TPAMI 30(7), 2008. https://doi.org/10.1109/TPAMI.2007.70817
- **[L2]** Wolf et al., "The Mutex Watershed and its Objective: Efficient, Parameter-Free Graph
  Partitioning," IEEE TPAMI 43(10), 2021. https://doi.org/10.1109/TPAMI.2020.2980827
- **[L3]** Hornakova, Lange, and Andres, "Analysis and Optimization of Graph Decompositions by Lifted
  Multicuts," ICML 2017. https://proceedings.mlr.press/v70/hornakova17a.html
- **[L4]** Wang et al., "Self-Supervised Transformers for Unsupervised Object Discovery Using
  Normalized Cut," CVPR 2022. https://openaccess.thecvf.com/content/CVPR2022/html/Wang_Self-Supervised_Transformers_for_Unsupervised_Object_Discovery_Using_Normalized_Cut_CVPR_2022_paper.html
- **[L5]** Xu et al., "Structure Extraction from Texture via Relative Total Variation," ACM TOG 31(6),
  2012. https://doi.org/10.1145/2366145.2366158
- **[L6]** Gandelsman, Shocher, and Irani, "Double-DIP: Unsupervised Image Decomposition via Coupled
  Deep-Image-Priors," CVPR 2019, pp. 11026-11035. https://doi.org/10.1109/CVPR.2019.01128
- **[L7]** Bredies, Kunisch, and Pock, "Total Generalized Variation," SIAM Journal on Imaging Sciences
  3(3), 2010. https://doi.org/10.1137/090769521
- **[L8]** Wang et al., "Trend Filtering on Graphs," JMLR 17(105), 2016.
  https://www.jmlr.org/papers/v17/15-147.html
- **[L9]** Hu et al., "Topology-Preserving Deep Image Segmentation," NeurIPS 2019.
  https://proceedings.neurips.cc/paper/2019/hash/2d95666e2649fcfc6e3af75e09f5adb9-Abstract.html
- **[L10]** Vinue, Epifanio, and Alemany, "Archetypoids: A New Approach to Define Representative
  Archetypal Data," Computational Statistics and Data Analysis 87, 2015.
  https://doi.org/10.1016/j.csda.2015.01.018
- **[L11]** Chizat et al., "Scaling Algorithms for Unbalanced Optimal Transport Problems,"
  Mathematics of Computation 87(314), 2018. https://doi.org/10.1090/mcom/3303
- **[L12]** Vayer et al., "Optimal Transport for Structured Data with Application on Graphs," ICML
  2019, PMLR 97:6275-6284. https://proceedings.mlr.press/v97/titouan19a.html
- **[L13]** Kummerer, Bethge, and Wallis, "DeepGaze III: Modeling Free-Viewing Human Scanpaths with
  Deep Learning," Journal of Vision 22(5), 2022. https://doi.org/10.1167/jov.22.5.7
- **[L14]** Batra et al., "Diverse M-Best Solutions in Markov Random Fields," ECCV 2012.
  https://doi.org/10.1007/978-3-642-33715-4_1
- **[L15]** Wolsey, "An Analysis of the Greedy Algorithm for the Submodular Set Covering Problem,"
  Combinatorica 2, 1982. https://doi.org/10.1007/BF02579435
- **[L16]** Figueira, Greco, Roy, and Slowinski, "An Overview of ELECTRE Methods and Their Recent
  Extensions," Journal of Multi-Criteria Decision Analysis 20(1-2), 2013, pp. 61-85.
  https://doi.org/10.1002/mcda.1482
- **[L17]** Angelopoulos, Bates, Fisch, Lei, and Schuster, "Conformal Risk Control," ICLR 2024.
  https://openreview.net/forum?id=33XGfHLtZg
- **[L18]** Kumar and Goldstein, "Center Smoothing: Certified Robustness for Networks with Structured
  Outputs," NeurIPS 2021. https://arxiv.org/abs/2102.09701
- **[L19]** Gowal et al., "Scalable Verified Training for Provably Robust Image Classification," ICCV
  2019. https://doi.org/10.1109/ICCV.2019.00494
- **[L20]** Zhang and Wandell, "A Spatial Extension of CIELAB for Digital Color-Image Reproduction,"
  Journal of the SID 5(1), 1997. https://doi.org/10.1889/1.1985127
- **[L21]** Tandon et al., "CAMBI: Contrast-Aware Multiscale Banding Index," PCS 2021.
  https://doi.org/10.1109/PCS50896.2021.9477464
- **[L22]** Immerkaer, "Fast Noise Variance Estimation," Computer Vision and Image Understanding
  64(2), 1996. https://doi.org/10.1006/cviu.1996.0060
- **[L23]** Vincent, "Grayscale Area Openings and Closings, Their Efficient Implementation and
  Applications," First Workshop on Mathematical Morphology and Its Applications to Signal Processing,
  1993, pp. 22-27.
- **[L24]** Haralick, Shanmugam, and Dinstein, "Textural Features for Image Classification," IEEE
  Transactions on Systems, Man, and Cybernetics SMC-3(6), 1973.
  https://doi.org/10.1109/TSMC.1973.4309314
- **[L25]** Ojala, Pietikainen, and Maenpaa, "Multiresolution Gray-Scale and Rotation Invariant Texture
  Classification with Local Binary Patterns," IEEE TPAMI 24(7), 2002.
  https://doi.org/10.1109/TPAMI.2002.1017623
- **[L26]** Felzenszwalb and Huttenlocher, "Efficient Graph-Based Image Segmentation," International
  Journal of Computer Vision 59, 2004. https://doi.org/10.1023/B:VISI.0000022288.19776.77
- **[L27]** Han, Kambadur, Park, and Shin, "Faster Greedy MAP Inference for Determinantal Point
  Processes," Proceedings of the 34th International Conference on Machine Learning, PMLR 70,
  2017, pp. 1384-1393. https://proceedings.mlr.press/v70/han17a.html
- **[L28]** Nemhauser, Wolsey, and Fisher, "An Analysis of Approximations for Maximizing Submodular Set
  Functions-I," Mathematical Programming 14, 1978. https://doi.org/10.1007/BF01588971
- **[L29]** Lin and Hanrahan, "Modeling How People Extract Color Themes From Images," CHI 2013.
  https://doi.org/10.1145/2470654.2466424
- **[L30]** Zhou, Yang, and Yu, "Moving Object Detection by Detecting Contiguous Outliers in the
  Low-Rank Representation," IEEE TPAMI 35(3), 2013, pp. 597-610.
  https://doi.org/10.1109/TPAMI.2012.132
- **[L31]** Guzzi et al., "Differentiable Soft Morphological Filters for Medical Image Segmentation,"
  MICCAI 2024, LNCS, pp. 177-187. https://doi.org/10.1007/978-3-031-72111-3_17
- **[L32]** Franchi, Fehri, and Yao, "Deep Morphological Networks," Pattern Recognition 102, 2020,
  107246. https://doi.org/10.1016/j.patcog.2020.107246
- **[L33]** Tan, Echevarria, and Gingold, "Efficient Palette-Based Decomposition and Recoloring of
  Images via RGBXY-Space Geometry," ACM TOG 37(6), 2018. https://doi.org/10.1145/3272127.3275054
- **[L34]** Liao et al., "Real-Time Scene Text Detection With Differentiable Binarization and Adaptive
  Scale Fusion," IEEE TPAMI 45(1), 2023, pp. 919-931.
  https://doi.org/10.1109/TPAMI.2022.3155612
- **[L35]** Achanta, Hemami, Estrada, and Susstrunk, "Frequency-Tuned Salient Region Detection," CVPR
  2009, pp. 1597-1604. https://doi.org/10.1109/CVPR.2009.5206596
- **[L36]** Hou and Zhang, "Saliency Detection: A Spectral Residual Approach," CVPR 2007, pp. 1-8.
  https://doi.org/10.1109/CVPR.2007.383267
- **[L37]** Zhu, Liang, Wei, and Sun, "Saliency Optimization from Robust Background Detection," CVPR
  2014, pp. 2814-2821. https://doi.org/10.1109/CVPR.2014.360

Inclusion in this census is not approval, adoption, authorization, prioritization, or evidence that a
mechanism belongs in a future architecture.

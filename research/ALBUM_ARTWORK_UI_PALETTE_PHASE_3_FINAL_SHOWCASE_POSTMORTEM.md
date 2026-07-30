# Album Artwork UI Palette Phase 3 Final Showcase Postmortem

Status: the 34-artwork final-candidate showcase and absolute review are complete. The candidate failed the broad
product-quality checkpoint. `phase-3-final-candidate` remains immutable as a reproducible historical checkpoint, but
it is not a product-ready candidate and does not authorize Phase 4, persistence, promotion, or replacement of the
live extractor. Phase 3 must reopen under a new working identity after widening development coverage.

The mechanical freeze work remains valid evidence about determinism, source custody, bounded execution, legal output,
and non-displacing composition. It did not establish broad winner quality. This postmortem corrects the prior decision
to describe that mechanical closure as a Phase 3 product freeze.

Normative direction remains `research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. Reviewer comments, issue tags, filenames,
case IDs, treatment keys, family IDs, and literal colors in this postmortem are evaluation evidence only. They must not
enter extraction, generation, ranking, collapse, topology, or tie-breaking logic.

## Bound Evidence

- Candidate attempt: `phase-3-final-candidate`.
- Configuration: `integrated-strict-midpoint-component-endpoint-raw-relation-non-displacement-v1`.
- Review manifest:
  `research/data/scratch/album-artwork-palette-v2/phase-3-final-showcase-review/manifest.json`.
- Review feedback:
  `research/data/scratch/album-artwork-palette-v2/phase-3-final-showcase-review/feedback.json`.
- Manifest ID: `03af58e9b9a5b944a14e6b53f86013b1d1c1653b6e17bb3b9ed1b868777ab69a`.
- Review mode: absolute, unblinded, `complete-palette-review-v2-presentation-2`.
- Completion: 34 of 34 exact-source cases, with no unresolved or extra response.
- Review scope: the final winner only; the retained alternatives were not displayed.
- Diagnostic follow-up: fresh full-detail extraction of only the ten below-acceptable exact sources, with every
  extracted source SHA-256 matched to its review binding before comments were joined for evaluation.

The 34 files are the exact unsuffixed supported base artworks under `images/`. This is a hand-picked stress corpus,
not a representative population sample and not a clean holdout. Nineteen exact sources belong to the fixed Phase 3
development panel; many other files have appeared in historical engineering work.

## Review Outcome

| Absolute quality | Count | Share |
| --- | ---: | ---: |
| strong | 20 | 58.82% |
| acceptable | 4 | 11.76% |
| weak fallback | 9 | 26.47% |
| unacceptable | 1 | 2.94% |
| uncertain | 0 | 0% |
| at least acceptable | 24 | 70.59% |
| below acceptable | 10 | 29.41% |

A `29.41%` below-acceptable rate is not compatible with product readiness. Three uniform-color emergency controls and
two other legitimate two-color cases are among the strong results, so the aggregate strong count also overstates
breadth across difficult complete-role decisions.

### Reviewer Issue Tags

| Reviewer-provided issue | Count |
| --- | ---: |
| incomplete artwork identity | 11 |
| missing gradient | 1 |
| extraneous gradient | 0 |

Four untagged cases still carried substantive critical comments. Optional tag counts therefore understate visible
problems.

### Exposure Split

| Exact-source exposure group | Strong | Acceptable | Weak | Unacceptable | At least acceptable |
| --- | ---: | ---: | ---: | ---: | ---: |
| fixed-panel image sources, `n=19` | 13 | 3 | 3 | 0 | 16/19, 84.21% |
| other showcase sources, `n=15` | 7 | 1 | 6 | 1 | 8/15, 53.33% |

The `30.88` percentage-point gap is strong evidence consistent with development-set overfitting. It does not prove
literal memorization: the implementation rejects source identity, paths, filenames, reviews, comments, and literal
target colors as inference inputs. The plausible failure is policy overfitting through generic thresholds, score
priorities, collapse preferences, mechanism selection, and repeated decisions on familiar exact sources.

The other 15 sources are not a clean unseen sample and differ structurally from the fixed panel. The split is therefore
a stop signal, not an unbiased estimate of generalization.

## Treatment-Structure Findings

| Displayed winner structure | Cases | Strong | Acceptable | Weak | Unacceptable | At least acceptable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flat, two colors, surface and accent collapsed | 5 | 5 | 0 | 0 | 0 | 5/5 |
| flat, three colors, surface collapsed | 12 | 4 | 1 | 7 | 0 | 5/12 |
| flat, four distinct colors | 7 | 5 | 2 | 0 | 0 | 7/7 |
| gradient, four distinct colors | 10 | 6 | 1 | 2 | 1 | 7/10 |

The failure is not a monotonic preference for too few colors. True two-color collapse works. Four-color flat treatments
also work broadly in this set. The conspicuous weak stratum is a three-color winner with a collapsed surface, where a
major field or identity family is often omitted while collapse economy remains attractive to ranking.

Flat and gradient winners had almost identical aggregate positive rates: `70.83%` and `70%`. Broadly increasing or
decreasing gradient frequency is not supported. The gradient failures concern omitted topology, wrong endpoints, or a
bad non-field role combined with an otherwise plausible field.

## Product Conclusions

1. Mechanical safety and product quality were conflated. Exact replay, legal output, bounded domains, non-displacement,
   and passing custody checks did not answer whether top-one treatments were good.
2. Broad winner review occurred after the candidate was described as frozen. A broad absolute-quality checkpoint must
   precede any future product-freeze claim.
3. Final endpoint and raw-relation mechanisms did not rerank winners. The final composer receives the integrated winner
   and slate at `research/src/album-artwork-palette-v2-phase-3-final-candidate.ts:599-631`, then publishes the composed
   winner at `:784-829`. In all ten failed cases, neither mechanism admitted a reserve. The showcase therefore exposes
   failures in the integrated availability and winner pipeline, not a final-composition regression.
4. Source support is not semantic correctness. `havana` explicitly demonstrates that a color can exist in the source
   and still be wrong as foreground. `meteora` demonstrates that a well-extracted color can be assigned to the wrong
   field or role.
5. Important identity evidence was usually available. The stage audit found no first-stage native-family discovery
   failure among the ten below-acceptable winners.
6. Top-one ranking is the main failure. Eight cases first failed in ranking or winner custody, one in role-obligation
   capacity followed by ranking, and one in field-topology availability.
7. The current identity objective is too weak or misdirected. It can preserve diverse alternatives while selecting a
   winner that visibly omits a major family, reverses field polarity, or promotes a tiny high-contrast family to global
   foreground.
8. The current process overused a small familiar panel. Generic code can overfit a development set without any named
   branch or literal target lookup.

## Segmentation Finding

The current connected-region segmentation is native-pixel and image-dependent, not a static grid. The separate
`12x12` grid at `research/src/album-artwork-palette-v2.ts:1076-1108` is used later for gradient fitting.

Native evidence construction performs these deterministic stages:

1. convert every native RGB pixel to OKLab;
2. quantize OKLab with fixed bin width `0.04`;
3. sort occupied bins by population;
4. greedily assign bins to fixed color-family anchors within OKLab radius `0.058`;
5. assign every pixel one global family label; and
6. flood-fill every family mask with four-neighbor connectivity.

The quantization and family construction are implemented at
`research/src/album-artwork-palette-v2.ts:1136-1150` and `:1487-1601`. The connected-component flood fill is at
`:1654-1724`. Diagonal contact does not connect regions. There is no minimum region area, denoising, morphology, or
small-component merge, so a single pixel is a valid region.

Two adjacency representations exist:

- persistent family adjacency records touching-family boundary count and mean local contrast at
  `research/src/album-artwork-palette-v2.ts:1603-1652` and `:1947-1972`; and
- a complete component-region graph temporarily rebuilt for transition discovery at
  `research/src/album-artwork-palette-v2-phase-3-field-transition.ts:220-357`.

The complete region graph has one node per raw four-connected component and an edge for every touching region pair.
Each edge stores shared boundary count and mean local color step. The graph is discarded after transition discovery.
Other downstream role and winner stages can inspect aggregate family adjacency, selected path traces, and capped
component statistics, but cannot generally query arbitrary raw-region neighbors.

Across 18 persisted current final-candidate artifacts:

| Quantity | Minimum | Median | Mean | Maximum |
| --- | ---: | ---: | ---: | ---: |
| native color families | 13 | 45 | 51.8 | 147 |
| raw connected components / transition nodes | 2,722 | 20,115 | 46,310 | 292,684 |
| retained component records | 292 | 816.5 | 1,020 | 3,212 |

Only detailed component retention is capped. Per family, the union of the eight largest components and 24 strongest
role-observation components is retained. The bounds are at
`research/src/album-artwork-palette-v2-protocol.ts:86-105`; retention is at
`research/src/album-artwork-palette-v2.ts:1156-1183`. Raw components remain uncapped.

This segmentation is highly fragmented by texture, antialiasing, JPEG ringing, grain, and one-pixel family changes.
That fragmentation is not proven to cause the ten reviewed failures, but it is a plausible evidence bottleneck: rich
adjacency exists temporarily for gradients while role assignment receives a capped statistical projection.

## Ten-Failure Stage Audit

The bounded diagnostic reran exactly:

- `images/doja.jpg`;
- `images/elephunk.jpg`;
- `images/greenday.jpg`;
- `images/johns.jpg`;
- `images/loups.jpg`;
- `images/meteora.jpg`;
- `images/placebo.jpg`;
- `images/skap.jpg`;
- `images/slim.jpg`; and
- `images/vvbrown.jpg`.

Each run used `extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails()` at
`research/src/album-artwork-palette-v2-phase-3-final-candidate.ts:838-846`. The integrated details expose the native
families, lanes, sourced fields, logical descriptors, materialization, recovery evaluations, role evidence, lineage,
transition rescue, custody, and slate at
`research/src/album-artwork-palette-v2-phase-3-integrated-candidate.ts:527-681`.

The diagnostic used comments only to identify what the displayed treatment failed to carry. It then queried source-only
evidence already produced by extraction. Candidate examples below prove availability; they do not declare a uniquely
correct target treatment.

### First Failure Stage

| First failed stage | Count | Cases |
| --- | ---: | --- |
| native family discovery | 0 | none |
| lane retention | 0 | none |
| field / topology availability | 1 | `loups` |
| role-obligation capacity | 1 | `johns` |
| materialization capacity | 0 | none |
| ranking / custody | 8 | `doja`, `elephunk`, `greenday`, `meteora`, `placebo`, `skap`, `slim`, `vvbrown` |

Although several domains reached the 1,500-treatment limit, `truncatedCanonicalTreatmentCount` was zero and the
relevant candidates were present. Materialization capacity was therefore not the first failure in any case.

No endpoint or raw-relation proposal was admitted in any of the ten cases. Integrated and final slates were exact.

## Per-Case Diagnosis

### `doja.jpg`

Review: weak fallback. The surface was judged wrong; the requested direction was two pink field shades.

| Stage | Finding |
| --- | --- |
| discovery | Dominant pink `family-8241` occupied `52.4%`; darker pink `family-7381` occupied `8.6%`; both were discovered and retained in field, signature, and foreground lanes. |
| field generation | Separate flat pink fields and a radial pink-to-pink field were registered. |
| complete generation | Ten role-compatible candidates used the relevant pink field relation. |
| slate | A pink-to-pink gradient survived as a final alternative. |
| winner | Ranking chose a pink-to-orange surface instead. |

Representative available candidate:
`#fd75b5:#fd3d86:#fff6fc:#fda8cf:gradient`. It was Pareto-valid near the top of selector order. Relative to the winner,
it had better representativeness and source support but lower rendered-gradient salience and slightly lower relation
credit.

Diagnosis: winner ranking overvalued fitted endpoint salience and relation credit relative to same-field hue coherence
and occupied endpoint fidelity.

Action: compare gradient endpoints against endpoint-band occupancy and field-family coherence. A major same-hue field
relation should not lose solely because a cross-hue fitted endpoint has greater abstract render salience.

### `elephunk.jpg`

Review: weak fallback with incomplete identity. The main medium blue was missing from the winner and was expected as a
probable background.

| Stage | Finding |
| --- | --- |
| discovery | Medium blue `family-6792` occupied `26.2%`, had field score `0.857`, and was the strongest field family. |
| retention | It survived in all three family lanes. |
| field generation | One-field and multiple two-field hypotheses used it as background. |
| complete generation | Seventy compatible candidates used it as background with a pale foreground. |
| slate | Four such candidates survived; `#579099:#032833:#fcfdd1:#a5c7c8:flat` was the second final treatment. |
| winner | Ranking selected a dark-blue collapsed field instead. |

Diagnosis: pure ranking failure. The scoring preference for perfect collapsed-surface fidelity, foreground path, and
economy overcame materially stronger field ownership and the broadest source family.

Action: make dominant connected field ownership and residual broad-family coverage authoritative in collapse
counterfactuals. Do not add a general cardinality reward; retain successful true two-color collapse.

### `greenday.jpg`

Review: weak fallback. The displayed winner reversed the artwork's black background and white foreground.

| Stage | Finding |
| --- | --- |
| discovery | Black `family-1079` occupied `60.1%` with field score `0.972`; white `family-11245` was also discovered. |
| retention | Black and white survived all lanes. |
| field and roles | Black-field, white-foreground treatments were legal and numerous. |
| complete generation | Fifty black-background / white-foreground candidates existed. |
| slate | Five survived, including `#000211:#000211:#fefefe:#c13131:flat`. |
| winner | The exact light/dark inverse was selected. |

Diagnosis: winner polarity failure. The black-field alternative had much higher field fidelity and greater identity
coverage, but the white-field winner received perfect collapsed-surface and path scores plus much higher economy.

Action: add source-derived field ownership and foreground polarity authority before symmetric utility ranking. Broad
population, perimeter/corner ownership, connected coverage, and typography polarity should distinguish background from
foreground rather than treating a reversible contrast pair as equivalent.

### `johns.jpg`

Review: weak fallback with incomplete identity. A major blue family was omitted and was suggested as a likely accent.

| Stage | Finding |
| --- | --- |
| discovery | Blue `family-5047` occupied `13.0%` and survived all family lanes. |
| role evidence | Accent evidence was `0.786` and foreground evidence `0.765`, so the family was marked ambiguous. |
| obligation capacity | It ranked fifth for the winner's field while policy retains four obligations per field. |
| complete generation | Three exact dark-field / white-foreground / blue-accent candidates nevertheless existed. |
| ranking | The representative candidate ranked 15th and was dominated by the red-accent winner. |
| slate | No role-exact blue-accent treatment survived, although blue appeared as a surface elsewhere. |

Representative candidate: `#0d181c:#0d181c:#f7f8fa:#365b90:flat`.

Diagnosis: the first loss is role-obligation capacity, followed by winner ranking. The four-obligation field-local
shortlist failed to reserve a major otherwise-unrepresented ambiguous family, so downstream identity credit did not
express the reviewed omission. The `maximumObligationsPerField: 4` policy is declared at
`research/src/album-artwork-palette-v2-phase-3-role-aware.ts:12-26` and applied at `:399`.

Action: use role-stratified capacity or reserve the strongest major family not represented by an existing obligation.
Ambiguous evidence should not be crowded out entirely by four slightly stronger same-field obligations.

### `loups.jpg`

Review: weak fallback with missing gradient and incomplete identity. The artwork was judged to be made entirely of
gradients, but the winner was a collapsed flat field.

| Stage | Finding |
| --- | --- |
| discovery | Cream, orange, amber, and orange-pink families were discovered and retained. |
| topology discovery | Zero transition traces and zero fit evaluations were produced. |
| field generation | Zero gradient hypotheses existed. |
| complete generation | No gradient treatment existed among 1,415 candidates. |
| slate and ranking | Ranking could not select a missing topology. |

Diagnosis: field-topology availability failure, not color-family discovery, ranking, or materialization capacity.

Action: add a deterministic diffuse or multiscale continuous-field proposal that can recognize broad smooth progression
without requiring one current hard transition path or fit. It must retain existing stripe, object-lighting, and hard
region negatives and must be tested on a widened source-only selected corpus before integration.

### `meteora.jpg`

Review: weak fallback with incomplete identity. The artwork's black field and white text were lost; khaki was correctly
extracted but assigned incorrectly.

| Stage | Finding |
| --- | --- |
| discovery | Black `family-220`, main khaki `family-7277`, and white `family-10804` were discovered. |
| retention | All survived all three lanes. |
| complete generation | Eight exact black / white / main-khaki candidates existed. |
| ranking | `#000000:#151108:#fafafa:#a59073:flat` was Pareto-valid at selector index 8. |
| slate | It fell just outside the final slate; secondary-khaki black/white alternatives survived. |
| winner | Main khaki became the collapsed field, black became foreground, and white disappeared. |

Diagnosis: role and field ownership ranking failure plus eight-item custody cutoff. The winner's source support,
representativeness, perfect collapsed-surface score, and economy outweighed the counterexample's polarity, foreground
path, role coverage, and coherence.

Action: use field ownership and typography polarity before collapse economy. Identity coverage should credit black
field, white foreground, and khaki accent jointly when those roles have coherent source evidence.

### `placebo.jpg`

Review: weak fallback with incomplete identity. Gradient state was accepted, but both displayed endpoints were judged
unrepresentative of the artwork background.

| Stage | Finding |
| --- | --- |
| discovery | Dominant teal families `family-6813` and `family-7695` survived all lanes. |
| field generation | Four gradient fields used the relevant relation. |
| complete generation | Fifty-five gradients used exact family representatives instead of fitted endpoints. |
| ranking | `#6c8a8a:#86a5aa:#fbfdfa:#111312:gradient` was Pareto-valid near selector order 6. |
| slate | Other gradient alternatives survived, but this representative-endpoint candidate did not. |
| winner | Fitted endpoints won primarily through rendered-gradient salience level `19` versus `14`. |

Diagnosis: endpoint-representative ranking failure. Topology and family availability were present; the objective preferred
abstract fitted endpoint salience over occupied endpoint-band fidelity.

Action: score endpoints against source occupancy, endpoint-band distributions, family representative fidelity, and the
actual rendered path. Keep generated or fitted colors subordinate when exact dense representatives better carry the
field.

### `skap.jpg`

Review: weak fallback with incomplete identity. Many source colors were reduced to white, black, and one moss accent.

| Stage | Finding |
| --- | --- |
| discovery | Red, purple, moss, yellow-green, and orange families were among 86 discovered families. |
| retention | The relevant families survived their field and role lanes. |
| complete generation | Fourteen white-field / black-foreground candidates carried two active chromatic roles. |
| ranking | A four-color candidate was legal but ranked below the collapsed winner. |
| slate | `#ffffff:#bacd36:#000103:#5e753d:flat` survived as an alternative. |
| winner | The winner carried only moss as a chromatic role. |

Diagnosis: winner identity-coverage failure. The algorithm preserved a broader treatment but did not make omitted major
chromatic-family coverage strong enough to influence top one.

Action: score residual coherent identity coverage at complete-treatment level. Credit a major family only when assigned
to a source-supported useful role; do not reward raw color count.

### `slim.jpg`

Review: unacceptable with incomplete identity. The dark gradient partly worked, but the cyan foreground ruined the
treatment.

| Stage | Finding |
| --- | --- |
| discovery | Cyan `family-8092` occupied about `0.1%`; gray `family-4608` occupied `4.7%`. |
| role evidence | Gray survived all lanes and had decisive foreground evidence near `0.918`. |
| complete generation | Thirty dark-field candidates used a non-cyan foreground. |
| slate | Four gray-foreground treatments survived. |
| winner | Tiny cyan was selected as global foreground. |

Representative counterexample: `#01040b:#140e18:#494e51:#df2a33:gradient`. It improved measured artwork identity but
lost seven foreground-path evidence levels to the cyan treatment.

Diagnosis: winner ranking overvalues contrast-path utility from a tiny high-contrast family and underweights spatial
support and global role representativeness. The counterexample proves a downstream choice exists; it does not establish
gray as uniquely correct.

Action: make foreground suitability depend on coherent population, topology, repetition, overlay geometry, and field
relationship in addition to contrast. Tiny source-supported details may be excellent accents but should not become
global foreground solely through path utility.

### `vvbrown.jpg`

Review: weak fallback with incomplete identity. Characteristic bright yellow families were omitted from the winner.

| Stage | Finding |
| --- | --- |
| discovery | Bright yellows `family-9884` and `family-8119` were discovered. |
| retention | Both survived all family lanes; yellow received explicit accent-role credit. |
| complete generation | 199 candidates used an active bright-yellow accent. |
| slate | Seven broader yellow treatments survived; the clean white / black / yellow treatment fell just outside. |
| winner | A dark brown accent won instead. |

Representative candidate: `#fffffe:#fffffe:#080808:#e6e622:flat`. It had greater identity coverage but lost eight
accent-path evidence levels to the brown winner and was marked dominated.

Diagnosis: winner ranking treats local accent path as more authoritative than characteristic major-family coverage.

Action: distinguish broad or repeated identity-bearing chromatic families from incidental locally compatible accents.
Complete-treatment identity coverage should be capable of overturning a path advantage when the winner otherwise omits
the source's strongest chromatic identity evidence.

## Cross-Case Corrective Program

### 1. Preserve The Failed Checkpoint

Do not mutate `phase-3-final-candidate`. Record it as the exact failed broad-review baseline for successor work. Keep
Phase 4 and reserve execution closed.

### 2. Review Existing Alternatives Before Rebuilding Discovery

Eight failures already have materially relevant candidates, and several have strong counterexamples in the final
eight-item slate. Build one bounded review that asks whether any retained alternative is acceptable and preferable to
the failed winner. This separates winner ranking from merely plausible mechanical availability.

### 3. Build Complete-Treatment Residual Identity Coverage

Measure whether broad field families, coherent foreground-like families, and coherent signature families are carried
by an appropriate role. Penalize a treatment that leaves a major coherent source family uncovered while its roles are
redundant. Do not reward arbitrary cardinality.

### 4. Make Collapse Counterfactual

Compare the best collapsed treatment to the strongest source-supported distinct-surface treatment. Collapse should win
only when a separate surface adds no material field identity, spatial ownership, or role separation. Preserve the
demonstrated success of true two-color collapse.

### 5. Establish Field Ownership And Polarity

Use source-derived population, connected coverage, perimeter/corner ownership, containment, typography-like geometry,
and foreground polarity before symmetric utility ranking. This directly addresses `greenday` and `meteora` without
introducing named-case behavior.

### 6. Replace Global Role-Obligation Capacity

Use role-stratified capacity or reserve one place for the strongest otherwise-unrepresented major family. The current
four-obligation field-local cutoff can erase a major ambiguous family before downstream identity evaluation.

### 7. Improve Endpoint Fidelity

Compare fitted endpoints with occupied endpoint-band distributions and exact dense family representatives. Compute
quality for the actual rendered path. Abstract salience should not dominate source fidelity.

### 8. Add A Diffuse Multiscale Field Proposal

Develop a separately ablated source-supported topology mechanism for broad continuous progressions that do not produce
the current hard transition path or fit. Retain strict hard-region, stripe, object-lighting, and unrelated-object
negatives.

### 9. Explore A Hierarchical Region-Adjacency Graph

Compare the current raw family components with deterministic local merging or edge-aware superpixels:

1. preserve raw native family support;
2. merge tiny locally compatible components into denoised regions;
3. retain a protected path for small coherent signature evidence;
4. expose region adjacency, containment, field ownership, repetition, and boundary strength to role assignment; and
5. evaluate whether richer graph evidence improves polarity and role placement before integrating it.

### 10. Widen Development Before Tuning

Reclassify all 34 showcase files as development evidence. Select a source-grouped, structure-stratified corpus several
times larger from authorized development roots using source-only information. Track exact duplicates and artwork
families. Keep a separate output-unseen source-grouped holdout until mechanisms and thresholds are frozen.

Future checkpoints must report quality by exposure group, artwork structure, and treatment structure. Broad absolute
winner quality must precede a product-freeze claim. Custody and safety gates remain necessary but are never substitutes
for product review.

## Recommended Experiment Order

1. Review retained alternatives for the eight ranking failures.
2. Add stage-resolved diagnostics across the widened development corpus before changing scores.
3. Test a residual identity-coverage and collapse-counterfactual arm.
4. Test a field-ownership and polarity arm.
5. Test role-stratified obligation capacity.
6. Test exact endpoint-band fidelity against fitted endpoint salience.
7. Develop the diffuse multiscale topology proposal separately.
8. Compare current segmentation with a hierarchical retained region-adjacency graph.
9. Integrate only mechanisms that improve their intended failure class without regressing matched strong controls.
10. Freeze a new candidate only after broad absolute-quality review, then open a still-unseen holdout exactly once.

## Authorization Boundary

This postmortem authorizes no source-specific patch, comment-derived feature, literal target color, winner-key lookup,
protected-sample access, Phase 4 execution, persistence, learned ranking, production replacement, or promotion. It
records failure, diagnosis, and generic research directions. Any successor candidate requires a new working identity
and must treat this candidate as an immutable failed checkpoint.

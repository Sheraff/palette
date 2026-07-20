# Research Basis

## Problem Framing

Album artwork to UI palette extraction combines four separate tasks:

1. Perceptual color quantization
2. Spatial and semantic image decomposition
3. Assignment of colors to interface roles
4. Accessibility-constrained palette completion

No reviewed paper solves all four. A reconstruction-optimal palette is not necessarily representative, and a representative theme is not necessarily usable as foreground and background tokens.

## Sources That Informed The Baseline

- Gao, Liang, and Yang, [Color Palette Generation From Digital Images: A Review](https://doi.org/10.1002/col.22975), 2024. This supports separating quantization, theme extraction, and learned generation rather than treating them as interchangeable.
- Lin and Hanrahan, [Modeling How People Extract Color Themes From Images](https://doi.org/10.1145/2470654.2466424), CHI 2013. Human themes emphasize both diversity and salient image regions, and several themes can be valid for one image.
- Achanta et al., [SLIC Superpixels Compared to State-of-the-Art Superpixel Methods](https://doi.org/10.1109/TPAMI.2012.120), TPAMI 2012. SLIC provides predictable, perceptually coherent regions with a small implementation footprint.
- Zhu et al., [Saliency Optimization from Robust Background Detection](https://openaccess.thecvf.com/content_cvpr_2014/papers/Zhu_Saliency_Optimization_from_2014_CVPR_paper.pdf), CVPR 2014. Boundary connectivity is a more useful background cue than treating every border pixel as background.
- Tan et al., [Efficient Palette-Based Decomposition and Recoloring via RGBXY-Space Geometry](https://doi.org/10.1145/3272127.3275054), SIGGRAPH Asia 2018. Adding spatial evidence avoids the largest failure mode of histogram-only extraction.
- Ciocca, Napoletano, and Schettini, [Evaluation of Automatic Image Color Theme Extraction Methods](https://doi.org/10.1007/978-3-030-13940-7_13), 2019. Earth-mover-style comparisons to human themes are useful diagnostics but do not replace review.
- Prashnani et al., [PieAPP](https://openaccess.thecvf.com/content_cvpr_2018/html/Prashnani_PieAPP_Perceptual_Image-Error_CVPR_2018_paper.html), CVPR 2018. Pairwise judgments are preferable to uncalibrated absolute aesthetic scores.
- Sharma, Wu, and Dalal, [The CIEDE2000 Color-Difference Formula](https://doi.org/10.1002/col.20070), 2005, and Bjorn Ottosson's [OKLab](https://bottosson.github.io/posts/oklab/). The implementation uses OKLab for optimization and leaves CIEDE2000 as a future reporting metric.
- W3C, [WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Contrast is a non-compensable gate, not an aesthetic reward.
- Chen et al., [Metamorphic Testing](https://doi.org/10.1145/3143561), ACM Computing Surveys 2018. Crop, noise, resize, and re-encoding tests provide expected relationships without pretending to have exact target colors.
- Gao, Schulman, and Hilton, [Scaling Laws for Reward Model Overoptimization](https://proceedings.mlr.press/v202/gao23h.html), ICML 2023. This motivates retaining separate diagnostics and a sealed human endpoint instead of optimizing one learned judge.

## Why No Vision Model In Round One

Modern segmentation can add valuable independent evidence, but available models have material domain and deployment tradeoffs:

- IS-Net/DIS is a practical subject prior with Apache-2.0 code and an ONNX model, but salient-object benchmarks mostly contain natural and product imagery.
- U2-NetP is small enough for optional local inference but gives coarse boundaries.
- BiRefNet and BEN2 are stronger, substantially larger alternatives.
- PaddleOCR text detectors are attractive because PP-OCR small models are compact and Apache-2.0, but artwork typography differs sharply from document text.
- EfficientSAM can refine uncertain masks but does not assign background, subject, or typography roles by itself.
- Large open-vocabulary or multimodal models can rerank candidates, but model size, licensing, typographic attacks, and reward hacking make them poor sources of unconstrained hex values.

The intended next experiment is to add soft `subject` and `text` maps behind a model-neutral interface. Learned maps will modify region evidence only. Candidate generation, accessibility constraints, output diagnostics, and blinded review remain unchanged.

## Evaluation Plan

The first review is exploratory and uses the available corpus for development. It should identify failure classes and calibrate diagnostic thresholds, not establish a publishable winner.

After iteration:

1. Freeze algorithms, image bytes, review rendering, and role definitions.
2. Build a held-out set sampled from the target album-art distribution.
3. Compare systems with randomized, blinded pairwise choices in the actual UI context.
4. Include `A`, `B`, `no preference`, and `neither acceptable`.
5. Record failure tags only after the preference decision.
6. Analyze artwork-level win/tie rates and use a Bradley-Terry model only when the comparison graph and sample size justify it.
7. Report accessibility, source coverage, stability, and human preference separately.

Automated vision-language judgments may later triage cases, but only after demonstrating held-out agreement with humans and surviving decoys such as black/white-only themes, border hijacks, duplicate roles, and unrelated palettes with similar luminance.

The version 0.8.1 gradient delta review exposed a corpus-composition defect: many queued music sources were visually repetitive photographs of physical discs or CD-ROMs. Those cases remain useful algorithm evidence, but a promotion corpus must be sampled independently from the deployment distribution and must not be deliberately enriched with one physical-media source mode. Skipped repetitive cases cannot be converted into per-case labels after the fact.

## Current Holdout

The `00/` folder supplies a separate random-album-art cohort. After deduplicating 30 repeated artwork IDs across 300px and 640px sources, it contains 355 unique artworks.

The 0.9 algorithm was frozen before this cohort's first evaluation. Version 0.10 used aggregate movement and stability diagnostics to reject an overly broad candidate-evidence change; version 0.11 used the same diagnostics to narrow a chromatic-foreground rule until it changed no validation entry. Version 0.12 visually audited the entries affected by a gradient-coherence change, but human development review rejected that experiment. Version 0.13 used the frozen 0.11 review to repair three rejected palettes. Version 0.14's broad surface-support rule was rejected; version 0.15 narrowed it and repaired three more. Version 0.16 added three reviewed guarded corrections. Version 0.17 replaced composable guards with complete joint-role enumeration constrained against the reviewed 0.16 incumbent; all six changed accepted palettes remained shippable and three of four changed rejected palettes became shippable. The corpus now contains 95 shippable and 5 unshippable palettes. It is development-facing validation rather than an untouched final test set, and later generalization claims require new sealed artwork. Entries are generated separately in `research/data/holdout-results.json`, excluded from feedback queues, and shown as a distinct gallery cohort. Aggregate hard gates, role-collapse rates, fallback rates, reconstruction diagnostics, and duplicate-resolution stability are reported in `research/data/holdout-summary.json`.

Validation failures may inform documented exploration, but they cannot establish final quality. A future human evaluation must sample and freeze new sealed artwork before collecting judgments rather than reviewing only conspicuous gallery failures.

## Known Role-Selection Defects

These defects were reported during the sealed gradient reviews and are intentionally separate from gradient eligibility:

1. Surface source identifiability: a selected surface may be an exact observed pixel but still have no visually identifiable relationship to the artwork. Exact-pixel provenance is therefore necessary but not sufficient. Examples `gv-385e29fbf301aa2fc340` and `gv-8b1b5f052c4cf5bb4b81` were explicitly flagged during the `02/` review. A future fix should require a distinct surface to have meaningful support from a coherent artwork region or candidate family, then verify the complete palette in blinded review.
2. Surface perceptual separation: a surface should either equal the background exactly, representing no separate surface color, or be visibly distinct from it. Near-duplicate role colors should collapse to the exact background rather than emitting two technically different but visually indistinguishable tokens. A future fix must define and validate a role-aware perceptual separation gate without weakening foreground-on-surface accessibility.
3. Background semantic representativeness: a technically supported background can work aesthetically without matching the color a reviewer associates with the artwork background. `gc-583a7f4b2375592af971` selected `#da4178`; it was explicitly reported as plausible but not representative. A future experiment should distinguish dominant or framing background identity from a merely feasible role color.
4. Whole-palette color fidelity: individually source-observed roles can still combine into a palette that does not look like the artwork's proper colors. `gc-330aec036a8605e596c0` (`#ecf0ed` background and `#cdd0db` surface) is the recorded example. A future review should evaluate complete role coherence rather than only per-role provenance and constraints.
5. Endpoint-pair identifiability: five reviewed `03/` pairs (`gv-03f1683081f7a3b14b1d`, `gv-4dbbf72d54b1ea0b340b`, `gv-6401054371d7b5f377ac`, `gv-90c9211ca56f498bd183`, and `gv-eba9362e83fe56dee564`), round-4 pair `gv-cd9bb1fdd2e581231484`, and round-5 pairs `gv-73cc99743f1249d956a8` and `gv-9ca68640adce472bf44c` could not be judged because the selected background or surface color was not visually identifiable in the artwork. Review tooling must expose this as a first-class response rather than conflating it with either-way, no-visible-difference, or unanswered. Future role-selection work should treat human-identifiable source support as a gate for both endpoints.
6. Chromatic palette coverage: `gv-d121e2591909215324f1` emits a mostly white, gray, and black palette with a red accent even though the artwork has strong yellow, green, blue, and red identity colors. The roles pass local constraints but collectively miss the artwork's exceptional chromatic range. Add this case to future whole-palette identity review and test explicit multi-hue coverage rather than only per-role quality.
7. Accent-to-surface visibility: `gv-ad255facc9eba8ff001f` emits surface `#000000` and accent `#020104`, only `1.0087:1` apart. The colors pass the current perceptual-distance gate but are functionally indistinguishable and unreadable together. Accent and surface need both non-identity and a validated minimum contrast floor; OKLab distance alone is insufficient near black.

None of these issues changes the interpretation of gradient judgments, which apply only to the displayed background-surface pair.

## Next Research Experiments

1. Enforce visually attributable support for distinct surface colors.
2. Collapse perceptually indistinguishable surfaces exactly to background.
3. Improve background semantic representativeness without rewarding salient subjects.
4. Add complete-palette role-coherence review and diagnostics.
5. Add an accent-to-surface contrast floor, including near-black regression cases.
6. Region connectivity cleanup and side-specific decorative-frame detection.
7. Soft OCR/text maps using PP-OCR small ONNX.
8. Soft subject maps comparing U2-NetP and IS-Net on manually marked failure cases.
9. Weighted k-medoids or RGBXY convex-hull candidates as alternatives to histogram k-means.
10. Explicit uncertainty and Pareto candidate output instead of only a scalar solver rank.
11. CIEDE2000 and optimal-transport reporting without feeding either metric directly into optimization.
12. Resize, JPEG re-encode, and thin-border metamorphic cases in addition to crop and noise.
13. Do not continue narrow gradient-eligibility threshold fitting. Frozen version 0.8.6 has a `31.25%` flat rate in its decisive retained sample and two false removals.
14. Treat the topology-v3 hard contrasts as a fixed redesign suite: six twice-confirmed music flats must separate from the positive `birdsofprey.jpg`, `doja.jpg`, `muse.jpg`, and `nada.jpg` pairs without threshold or batch-specific exceptions.

The retired `region-graph-0.18.0-poc.1` experiment tested source-observed midpoint controls. Across 3,504 deduplicated music-artwork families it selected only four controls, produced no persuasive preference signal, and exposed upstream gradient-eligibility false positives. Midpoint and third-stop selection are therefore closed research directions rather than pending experiments.

Gradient-eligibility development through version 0.8.6 is documented in `GRADIENT_ELIGIBILITY.md`. Across 274 accumulated decisive endpoint-pair labels it has 133 true gradients, 114 true flats, 25 false retentions, and 2 false removals. Round 6 rejects promotion, so canonical 0.17 remains unchanged.

## Gradient Field Topology V3 Outcome

The structural redesign replaced color-distance-difference support with orthogonal projection onto the exact endpoint segment, made distribution and progression evidence depend on absolute field extent, made graph connectivity reciprocal, and separated directed surface-role ownership from normalized spatial-field ownership. The frozen model `gradient-field-topology-model-3.0.0-dev` uses role/spatially owned color continuity plus owned progression. Its final-development balanced accuracy is `0.8627`; pooled leave-temporal-batch-out sensitivity, specificity, balanced accuracy, and AUC are `0.9630`, `0.6978`, `0.8304`, and `0.9239`. These batches mark review time and adaptive selection, not known source-population differences.

The prediction-enriched `07/` review produced 9 decisive and 16 nondecisive judgments. V3 was correct on 8 of 9 decisive pairs, compared with 6 of 9 for version 0.8.6, with three paired improvements and one regression. This is useful change-focused evidence but not a population accuracy estimate. `07/` is now consumed validation evidence; `08/` through `0b/` remain untouched reserves.

The blinded 25-case music repeat review established that reviewer drift does not explain the main conflict. It had 21 exact five-way repeats, agreement on all 17 pairs that were decisive both times, no gradient-to-flat or flat-to-gradient flips, and only three historical decisive labels becoming nondecisive. All six historically flat cases deliberately enriched because V3 retained them were again judged flat. V3 therefore fit only 13 of 20 historical decisive labels and 11 of 17 repeat-decisive labels in this hard sample. The six fixed flat contrasts are `gc-0fe57ca77f27b6cf9b12`, `gc-535b0c12c20aed0d9863`, `gc-b99827ae221843eb0578`, `gc-c79a6d529180b9fdd5c9`, `gc-d67d2a270d9ef853e69b`, and `gc-e518f46ad5348fac5ad9`.

The exposed base-`images/` diagnostic covered all 34 unsuffixed artworks: canonical 0.17 marked 13 as gradients and V3 retained 11. The reviewer reported that the exposed results looked very good overall but intentionally supplied only one exact-pair label; the other 33 remain unlabeled. The one submitted case, `muse.jpg`, was judged gradient while V3 selected flat. This is a confirmed V3 false removal, not evidence that the unlabeled cases are correct.

Frozen variants A-H and their pairwise decision unions/intersections cannot resolve the conflict. Variant H improves the hard music sample but rejects both `muse.jpg` and `nada.jpg`; the only combinations preserving all four targeted positive pairs repair at most one of the six reaffirmed music flats and introduce other false retentions. V3 therefore remains a research baseline and must not replace canonical 0.17. Future work must add ranking evidence that separates broad foreground-owned color structures from sparse true fields, predeclare the feature hypothesis, retain the ten fixed contrasts as development tests, and use fresh `08/` or later evidence only after another candidate is frozen.

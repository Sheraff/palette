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

## Current Holdout

The `00/` folder supplies a separate random-album-art cohort. After deduplicating 30 repeated artwork IDs across 300px and 640px sources, it contains 355 unique artworks.

The 0.9 algorithm was frozen before this cohort's first evaluation. Version 0.10 used aggregate movement and stability diagnostics to reject an overly broad candidate-evidence change; version 0.11 used the same diagnostics to narrow a chromatic-foreground rule until it changed no validation entry. Version 0.12 visually audited the entries affected by a gradient-coherence change, but human development review rejected that experiment. Version 0.13 used the frozen 0.11 review to repair three rejected palettes. Version 0.14's broad surface-support rule was rejected; version 0.15 narrowed it and repaired three more. Version 0.16 added three reviewed guarded corrections. Version 0.17 replaced composable guards with complete joint-role enumeration constrained against the reviewed 0.16 incumbent; all six changed accepted palettes remained shippable and three of four changed rejected palettes became shippable. The corpus now contains 95 shippable and 5 unshippable palettes. It is development-facing validation rather than an untouched final test set, and later generalization claims require new sealed artwork. Entries are generated separately in `research/data/holdout-results.json`, excluded from feedback queues, and shown as a distinct gallery cohort. Aggregate hard gates, role-collapse rates, fallback rates, reconstruction diagnostics, and duplicate-resolution stability are reported in `research/data/holdout-summary.json`.

Validation failures may inform documented exploration, but they cannot establish final quality. A future human evaluation must sample and freeze new sealed artwork before collecting judgments rather than reviewing only conspicuous gallery failures.

## Next Research Experiments

1. Region connectivity cleanup and side-specific decorative-frame detection.
2. Soft OCR/text maps using PP-OCR small ONNX.
3. Soft subject maps comparing U2-NetP and IS-Net on manually marked failure cases.
4. Weighted k-medoids or RGBXY convex-hull candidates as alternatives to histogram k-means.
5. Explicit uncertainty and Pareto candidate output instead of only a scalar solver rank.
6. CIEDE2000 and optimal-transport reporting without feeding either metric directly into optimization.
7. Resize, JPEG re-encode, and thin-border metamorphic cases in addition to crop and noise.
8. Evaluate an optional source-observed midpoint for background-surface gradients without changing the accepted four semantic roles or flat-palette contract.
9. Test an evidence-gated, artwork-supported third gradient control stop when direct background-surface OKLCH interpolation crosses hues absent from the artwork. Treat it as gradient metadata rather than a fifth UI role. Diagnostic case: `ab67616d0000b2730000e5d07b040a02043e7460` (`#8f8182` to `#e6c18a`).

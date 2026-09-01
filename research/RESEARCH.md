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

The 0.9 algorithm was frozen before this cohort's first evaluation. Version 0.10 used aggregate movement and stability diagnostics to reject an overly broad candidate-evidence change; version 0.11 used the same diagnostics to narrow a chromatic-foreground rule until it changed no validation entry. Version 0.12 visually audited the entries affected by a gradient-coherence change, but human development review rejected that experiment. Version 0.13 used the frozen 0.11 review to repair three rejected palettes. Version 0.14's broad surface-support rule was rejected; version 0.15 narrowed it and repaired three more. Version 0.16 added three reviewed guarded corrections. Version 0.17 replaced composable guards with complete joint-role enumeration constrained against the reviewed 0.16 incumbent; all six changed accepted palettes remained shippable and three of four changed rejected palettes became shippable.

Canonical `region-graph-0.19.0` now adds the bounded chromatic-role behavior validated below. It changes 7 of 355 `00/` palettes relative to 0.17: 3 previously accepted palettes and 4 unselected palettes, with no changes among the 5 previously rejected palettes. The frozen 100-source corpus membership and its existing 95 shippable / 5 unshippable labels were migrated unchanged. Those carried labels are transition evidence, not a comprehensive re-review of 0.19 or of the other 255 palettes. The cohort is development data, not an untouched final test set. Aggregate hard gates, role-collapse rates, fallback rates, reconstruction diagnostics, and duplicate-resolution stability are reported in `research/data/holdout-summary.json`.

Validation failures may inform documented exploration, but they cannot establish final quality. A future human evaluation must sample and freeze new sealed artwork before collecting judgments rather than reviewing only conspicuous gallery failures.

## Palette Role Counterexample Review

The five-case `palette-role-counterexample-0.2.0-development` review evaluated current 0.17 palettes and complete source-candidate alternatives without asking for a unique target palette. The response scale separated strong, acceptable-but-not-ideal, weak fallback, and unacceptable results. Marked alternatives were explicitly non-exclusive counterexamples rather than ground truth.

All five sources were eligible artwork. The current palettes received one strong, three acceptable-but-not-ideal, and one weak-fallback judgment. Two alternatives were marked as improvements. The weak surface case `pr-1e5f744cc90666d9893c` preferred a one-role change from Mole `#36292a` to Torch Red `#f90a0a`; the red was already a substantial exact-source candidate with stronger coherent support and strict pair-specific gradient evidence. The strong accent case `pr-9b33eed452db43df275c` preferred reusing foreground Jet Black `#030303` as accent, but the incumbent remained strong and the change worsened reconstruction, so this is retained as preference evidence rather than generalized into an accent-collapse rule.

Three cases reported a better direction not shown. One identified an unrepresentative background, one said the shown blue alternatives still omitted important yellow/gold, and `pr-76df2043c7789d165586` said the black/white palette omitted contrasting pastel colors. The last case is a direct candidate-availability failure: the 12-candidate pool contains only neutrals and a weak warm candidate even though the artwork visibly contains cyan, pink, and purple families. No downstream ranker can select colors absent from its pool.

The opt-in `region-joint-spatial-0.2.0-poc.1` tests one narrow role hypothesis. It freezes canonical 0.17 background, foreground, accent, and gradient decision, then permits a surface replacement only for a substantial vivid exact-source candidate with strict pair-only field evidence, 3:1 or better foreground contrast, improved surface and identity objectives, and a bounded accent-objective tradeoff. It exactly reproduces the reviewed Torch Red counterexample. Across 35 reviewable development palettes and 95 previously accepted curated holdout palettes it changes nothing. It changes exactly the reviewed rejected target among the five rejected palettes and one unselected holdout source already vetoed as out-of-distribution. Candidate validation reports zero hard-gate violations. This is development evidence, not fresh validation; canonical `region-graph-0.17.0` remains unchanged.

The complete bound analysis is `research/data/experiments/palette-role-counterexample-0.2.0-development/analysis.json`.

## Chromatic Candidate Availability

The opt-in `region-candidate-availability-0.1.0-poc.1` experiment tests whether supported chromatic hue families are absent from the canonical 12-candidate pool. It evaluates twelve fixed OKLab hue anchors, rejects low-population isolated noise, retains exact normalized source pixels only, and exposes at most two supplements without passing them to any role solver. Canonical roles, gradients, candidate diagnostics, and family assignments remain unchanged.

Across 37 development entries it triggers on 3 (`8.11%`); across 355 deduplicated `00/` entries it triggers on 76 (`21.41%`). The reviewed missing-pastel source exposes Mink `#9c6b55` and Mamba `#6d6d8a`, and both hue anchors survive a one-pixel crop and deterministic noise. The availability finding is retained: those source families were genuinely unavailable downstream. It does not establish that either color should occupy a final role.

The first role integration, `region-chromatic-role-0.1.0-poc.1`, appended all supplements and replayed the complete guarded-plus-joint spatial pipeline. It changed 14 holdout palettes and passed all hard gates. A four-case blinded review covered its three changed accepted palettes and the rejected missing-pastel target. The candidate won two accepted cases and tied the third, but the canonical baseline was preferred on the target. Unbounded role admission was therefore rejected even though its accepted-case changes were favorable.

POC.2 admitted only minor omitted families with population at most `0.02`. This preserved the failed broad-family target and changed 12 holdout palettes. A nine-case blinded review of its unselected-holdout changes produced three candidate preferences, four similarly valid judgments, and two baseline preferences. Both losses selected supplements with text evidence below `0.5`; all preferred or tied selected supplements had text evidence at or above `0.584`.

The frozen development checkpoint `region-chromatic-role-0.1.0-poc.3` therefore required both population at most `0.02` and text evidence at least `0.5` before a supplement could enter the role solver. It changed no reviewable development palette, three of 95 accepted palettes, none of five rejected palettes, and seven of 255 unselected holdouts. All ten emitted palettes exactly matched an earlier blinded presentation: five were preferred to canonical and five were similarly valid; candidate quality was five strong and five acceptable-but-not-ideal, with no weak, unacceptable, or uncertain result.

POC.4 through POC.9 were adaptive safety refinements. Each version was frozen before opening the next temporal reserve (`09/` through `0e/`), and each observed reserve became development evidence after a baseline preference, weak result, or neither-acceptable result exposed an over-broad emission. The refinements added minimum accent visibility, incumbent-relative accent identity, bounded chroma and saliency loss, positive selected-role evidence, a chromatic collapsed-background veto, a minimum emitted accent chroma, and a maximum collateral role-chroma loss. They preserved all prior strong or acceptable candidate-preferred and tied treatments.

Exact POC.10 was frozen before opening `0f/`. Across all 324 deduplicated sources it emitted five material changes and had zero hard violations. The blinded review preferred POC.10 four times and found one treatment similarly valid; no baseline preference, weak-or-worse candidate, neither-acceptable result, or uncertain result occurred. Every predeclared gate passed. POC.10's scientific payload was then promoted unchanged as canonical `region-graph-0.19.0`. This proves a bounded improvement for the emitted changes. It does not prove that unchanged palettes are valid, that all four roles are generally correct, or that the original broad missing-pastel failure is solved.

The development reviews are under `research/data/experiments/chromatic-role-*`; the final independent decision is `research/data/experiments/chromatic-role-reserve-validation-0.8.0-0f/analysis.json`; the accepted transition is archived in `research/data/rounds/region-graph-0.19.0.json`.

## `00/` Whole-Palette Triage

The abandoned empty `palette-role-00-audit-0.1.0-development` workflow attempted to require separate judgments for every role across all 355 palettes. That burden was disproportionate, and independent role verdicts were methodologically misleading because whether one role is appropriate can depend on the other selected colors.

`palette-role-00-audit-0.2.0-development` instead draws 10 diversity-ranked, 10 diagnostic-risk-ranked, and 10 deterministic-random cases from the frozen `00/` selection queues. Each case requires exactly one whole-palette quality rating (`strong`, `acceptable`, `weak`, `unacceptable`, or `uncertain`) or one source skip reason (`dud`, `not artwork`, or `uncertain`), plus an optional free-form comment. Comments preserve conditional and relational judgments without forcing them into isolated role scores; they are read qualitatively before choosing a follow-up hypothesis.

This triage addresses the changed-case review blind spot at manageable cost, but its stratified sample is development failure discovery rather than prevalence or independent promotion evidence. Its feedback is stored separately and does not rewrite selection, curation, absolute-feedback, or accepted-round archives.

The completed review covered all 30 cases: 15 strong, 7 acceptable, 4 weak, 1 unacceptable, and 3 skipped duds. A positive judgment applies only to the displayed palette and does not imply that another palette could not also work for the artwork. The 12 nonempty comments were therefore interpreted as relational, non-exclusive evidence rather than unique target labels. Relevant colors were available but unassigned in eight commented cases; three cases had at least one requested family absent from the candidate list; two comments implicated gradient endpoint handling; one strong palette exposed a bounded near-black under-collapse. These categories overlap and are not prevalence estimates. The provenance-bound interpretation is `research/data/experiments/palette-role-00-audit-0.2.0-development/interpretation.json`.

## Read-Only One-Role Counterfactual Trace

`palette-role-counterfactual-trace-0.1.0-development` evaluates the 12 commented audit cases without changing extraction. For each production role-solver candidate and each target role, it freezes the other three displayed canonical roles, recomputes the exact joint hard gates and five objectives, and records pair-specific gradient evidence. Complete hidden candidate and family-spatial evidence is stored once per case. Availability-only chromatic supplements remain listed with their failed admission gates but are not treated as production-selectable.

The generated trace contains 152 candidate records and 608 listed role alternatives. Of those, 596 are production-selectable evaluations: 361 are hard-infeasible, 191 are feasible rank/admission losses, 44 reproduce an incumbent semantic selection, and none passes the production Pareto admission rule. The absence of a Pareto-admitted one-role replacement is a diagnostic of the current fixed objective and gate system, not evidence that the displayed palette is uniquely correct or that a feasible alternative is aesthetically invalid.

All 12 normally enumerated `accent := foreground` collapses are hard-feasible but lose rank/admission. The normally enumerated `surface := background` collapse is already incumbent in five cases, hard-feasible but not admitted in six, and hard-infeasible in one. Four chromatic supplements appear across three cases: one is role-admitted and three remain availability-only. These observations identify follow-up mechanisms; they do not infer requested hex values from comments or authorize an algorithm change.

The exclusive artifact is `research/data/experiments/palette-role-counterfactual-trace-0.1.0-development/trace.json`, with generated-time-independent trace ID `8c62abbf992867b8dd151163bec45f0cb97908769ce2b2feaf137ca87bf9c2a1`.

The bound trace analysis rejected global gate or objective relaxation and initially selected strict gradient-surface recovery as a possible bounded experiment. That next step is superseded rather than run: gradient detection remains paused because its evidence depends on which role colors are selected and is not reliable enough to drive role recovery. The original decision remains frozen in `research/data/experiments/palette-role-counterfactual-trace-0.1.0-development/analysis.json`; the superseding contrast experiments are documented below.

## Configurable Foreground Contrast

Foreground contrast is now represented by an explicit opt-in profile. The requested development values are `3.5:1` against background and `3.0:1` against surface for ordinary source foregrounds, with evidence-gated strong-typography floors of `3.0:1` and `2.5:1`; generated black/white remains at `4.5:1`. Omitting the profile preserves canonical 0.19 exactly. `research/src/configured-extract.ts` exposes the noncanonical setting through `extractConfiguredPalette()` and `extractConfiguredPaletteWithContext()`. Configured results use a profile-hashed version string and return the normalized frozen profile in context, so they cannot be mistaken for canonical 0.19; the frozen canonical `extract.ts` entry point remains unchanged.

POC.1 also lowered source preference and scoring targets. It changed 150/355 `00/` palettes, including 44/95 accepted palettes and 151 foreground roles, so it was rejected without review. POC.2 retained `4.5:1` source preference and scoring targets while lowering only hard floors. It still changed 36/355 palettes, including 13/95 accepted palettes, 32 surfaces, and 10 gradient decisions. It exceeded both predeclared breadth limits and was also rejected without review. Neither candidate changed the reviewed red-surface case. The profile remains useful as an explicit consumer policy, but the canonical default and all ordinary gradient logic remain unchanged. The bound interpretation is `research/data/experiments/foreground-contrast-0.2.0-poc.2-development/interpretation.json`.

## Source-Inventoried Reserves

Directories `10/` through `14/` are now custody-sealed as source-inventoried/output-unseen reserves. Only paths, raw bytes, sizes, SHA-256 identities, artwork-family grouping, and JPEG start/end signatures were recorded; no image was decoded, extracted, rendered, or reviewed. The inventory contains 1,835 files and 1,680 artwork families, of which 1,676 remain future-validation eligible after excluding four families with prior-byte overlap. The deterministic artifact is `research/data/source-provenance-inventory-00-14.json`, inventory ID `3907c57f94cd7dfea992c5d1ce98da6de2165c720b75259b32f0250da1881c7f`.

## Candidate-Generation Follow-Up

The read-only `chromatic-candidate-generation-trace-0.1.0-development` diagnostic separates the three audit-confirmed availability failures. The white/red case has no normalized achromatic bin at the existing light-typography threshold; its red-family evidence instead fails generic saliency and is near a canonical brown. The green case has source-observed 120-degree and 150-degree families, but both are below the `0.005` population floor and only the latter passes spatial support. The salmon case is different: a `0.009247` population family has `0.751535` text evidence and eleven supporting regions, but misses generic saliency by `0.002541` and is then distance-collapsed into achromatic gray.

`region-typography-candidate-availability-0.2.0-poc.1` tests only that salmon mechanism. It admits strong typography evidence independently and requires chromatic representation while preserving all population, spatial, and exact-source requirements. It adds one diagnostic candidate on 7/355 `00/` sources, including 1/95 accepted sources and no rejected sources, with no development, synthetic, invariant, or gate failures. The target exposes exact-source `#e3bbbb`; the broad family survives crop and deterministic noise. This validates bounded availability only, not role correctness.

The subsequent read-only `region-typography-chromatic-role-0.1.0-poc.1` stopped without review. The unchanged solver selected added accents in two unrelated unselected cases but did not select the salmon target. As foreground, the target has only `1.3659:1` contrast and is hard-infeasible. As accent it is hard-feasible under the joint solver's `1.2` floor but below the promoted POC.10 `1.5` emission floor and loses accent and identity objectives. The candidate-availability diagnostic is retained; the role candidate is rejected, no review UI is prepared, and canonical 0.19 remains unchanged. See `research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development/analysis.json`.

The product contract permits at most four colors, so no fifth identity role is proposed. A final read-only constrained trace kept the readable foreground, forced salmon into accent, and enumerated all 144 background/surface pairs from the production role pool. Only the original gray field pair was hard-feasible, and it still had `1.3659:1` accent/background contrast; zero combinations passed unchanged POC.10 safety. The result is `stop-no-safe-four-color-reallocation`. Any future recovery must explicitly redefine one of the four existing role semantics or its visibility contract rather than add a color or tune candidate thresholds. The bound conclusion is `research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development/four-color-analysis.json`.

## Clarified UI Role Contract

The four product roles are now explicit: background is the application field; foreground is main text on background and sometimes surface; surface is a noncritical alternate field or thin separator; accent is used for meaningful UI elements on background and sometimes surface. Accent therefore cannot be treated as a decorative identity-only slot. The current consumer contract requires absolute APCA `Lc 10` against both fields while retaining the four-color maximum. APCA receives the overlaid accent as foreground and the application field as background; eligibility uses absolute magnitude while diagnostics preserve signed polarity. The floor preserves Birdsofprey's Thimbleberry accent (`+12.5173 Lc` on background, `+27.4326 Lc` on surface) and YBBB's Obsidian accent (`+11.8310 Lc` on both fields). This supersedes the initial WCAG 2 `3:1` development threshold without changing canonical 0.19.

Under the current APCA contract, the typography-salmon target `#e3bbbb` measures `+15.5785 Lc` against the retained `#e4e4e4` background/surface field. `region-typography-chromatic-apca-0.1.0-poc.1` evaluates the explicit `typographyChromaticAccent` configuration across all 37 development and 355 `00/` entries. The frozen availability set remains seven sources. Complete required-accent search selects all seven candidates; six are accent-only and emit, while one unselected case would change every role and is preserved as a non-emitting counterfactual. One emitted source is in the accepted corpus. All emitted colors are exact source pixels, every treatment passes APCA against both fields, no palette exceeds four colors, and foreground, gradient, expressive, and quantized output remain unchanged. The target emits `#e3bbbb` while preserving its other three roles. Partial complete-palette review then found two treatments worse than baseline, including the accepted-corpus change; one additional treatment is unjudgeable because its baseline palette does not fit the artwork, and three remain pending. Global configured promotion is stopped. No file-specific exclusions are authorized. See `research/data/experiments/typography-chromatic-apca-0.1.0-poc.1-development/analysis.json`.

The historical read-only `ui-accent-contrast-trace-0.1.0-development` audit freezes background, foreground, surface, gradient, and canonical output under its original WCAG 2 `3:1` contract. Canonical 0.19 passes on 208/355 `00/` palettes and fails on 147/355. Failures include 47/95 accepted, 1/5 rejected, and 99/255 unselected palettes. A source-safe frozen-role alternative exists for 140 failures, but seven have none; five of those seven are in the accepted corpus. Development has 20/37 failures and one with no frozen-role source alternative. These counts are retained as historical evidence and must not be attributed to the current APCA profile.

The predeclared breadth and availability stops all fired. No accent-only correction or review UI is authorized. Canonical no-option 0.19 remains unchanged. The next implementation, if pursued, must be a separately identified safety-first joint solver allowed to reallocate the existing four roles; it cannot add a fifth color or silently present the historical `1.2`/`1.5` accent heuristics as UI safety. See `research/data/experiments/ui-accent-contrast-contract-0.1.0-development/analysis.json`.

`region-ui-accent-joint-0.1.0-poc.1` implemented that redesign under the historical WCAG 2 profile. Safe incumbents were preserved exactly. Unsafe incumbents used complete hard-feasible tuple enumeration and safety-first minimax objective regret while retaining canonical foreground rules, source provenance, the four-color maximum, and frozen expressive/quantized methods. It corrected all 20/37 development and 147/355 `00/` failures, including every case with no frozen-role source alternative. All 392 entries succeeded with zero contract violations and zero changes to already-safe incumbents.

The historical POC was technically complete but aesthetically broad: 47/95 accepted palettes changed, along with 1/5 rejected and 99/255 unselected palettes. Across `00/`, changes affected 138 accents, 56 surfaces, 20 backgrounds, 10 foregrounds, and 15 gradient decisions. Four treatments had a maximum objective regression above `0.1`. The result remains bound at `research/data/experiments/ui-accent-joint-0.1.0-poc.1-development/analysis.json`. The current `extractConfiguredPalette()` profile instead binds `apca-w3-0.1.9` and absolute `Lc 10`; canonical promotion remains unauthorized pending fresh evaluation.

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

1. Preserve the four-color maximum and evaluate the APCA absolute `Lc 10` safety-first joint assignment as opt-in configured behavior. Before any default migration, rerun the complete contract audit and design a manageable stratified review covering multi-role corrections, objective-regression extremes, accepted entries, and gradient changes.
2. Complete the three pending typography-accent judgments. Global promotion is already stopped by two worse-than-baseline treatments; keep the rejected four-role counterfactual non-emitting and do not add file-specific exceptions, a fifth identity role, or weaker foreground requirements.
3. Keep the white/red and green traces as separate development mechanisms. The former lacks robust normalized white evidence and combines low-saliency red with multi-role coverage; the latter comes from an acceptable non-exclusive palette and remains below the population floor. Neither currently authorizes a threshold change.
4. Keep the `3.5:1` background / `3.0:1` surface foreground contrast profile available only as an explicit consumer policy; do not continue threshold variants or change canonical defaults from the rejected broad POCs.
5. Keep gradient-specific role recovery paused until improved role selection provides stable endpoint pairs.
6. Use present-but-unassigned cases to distinguish hard role infeasibility from support/ranking loss. Do not infer a unique desired hex or treat a positive displayed palette as rejecting alternatives.
7. Investigate explicit multi-hue coverage only after the bounded typography-accent review; the white/red and green failures remain unresolved by this one-accent mechanism.
8. Enforce visually attributable support for distinct surface colors.
9. Collapse perceptually indistinguishable role colors exactly, including the reviewed near-black foreground/accent case.
10. Improve background semantic representativeness without rewarding salient subjects.
11. Region connectivity cleanup and side-specific decorative-frame detection.
12. Soft OCR/text maps using PP-OCR small ONNX.
13. Soft subject maps comparing U2-NetP and IS-Net on manually marked failure cases.
14. Weighted k-medoids or RGBXY convex-hull candidates as alternatives to histogram k-means.
15. Explicit uncertainty and Pareto candidate output instead of only a scalar solver rank.
16. CIEDE2000 and optimal-transport reporting without feeding either metric directly into optimization.
17. Resize, JPEG re-encode, and thin-border metamorphic cases in addition to crop and noise.
18. Do not continue narrow gradient-eligibility threshold fitting. Frozen version 0.8.6 has a `31.25%` flat rate in its decisive retained sample and two false removals.
19. Treat the topology-v3 hard contrasts as a fixed redesign suite: six twice-confirmed music flats must separate from the positive `birdsofprey.jpg`, `doja.jpg`, `muse.jpg`, and `nada.jpg` pairs without threshold or batch-specific exceptions.

The retired `region-graph-0.18.0-poc.1` experiment tested source-observed midpoint controls. Across 3,504 deduplicated music-artwork families it selected only four controls, produced no persuasive preference signal, and exposed upstream gradient-eligibility false positives. Midpoint and third-stop selection are therefore closed research directions rather than pending experiments.

Gradient-eligibility development through version 0.8.6 is documented in `GRADIENT_ELIGIBILITY.md`. Across 274 accumulated decisive endpoint-pair labels it has 133 true gradients, 114 true flats, 25 false retentions, and 2 false removals. Round 6 rejects promotion, so canonical 0.17 remains unchanged.

## Gradient Field Topology V3 Outcome

The structural redesign replaced color-distance-difference support with orthogonal projection onto the exact endpoint segment, made distribution and progression evidence depend on absolute field extent, made graph connectivity reciprocal, and separated directed surface-role ownership from normalized spatial-field ownership. The frozen model `gradient-field-topology-model-3.0.0-dev` uses role/spatially owned color continuity plus owned progression. Its final-development balanced accuracy is `0.8627`; pooled leave-temporal-batch-out sensitivity, specificity, balanced accuracy, and AUC are `0.9630`, `0.6978`, `0.8304`, and `0.9239`. These batches mark review time and adaptive selection, not known source-population differences.

The prediction-enriched `07/` review produced 9 decisive and 16 nondecisive judgments. V3 was correct on 8 of 9 decisive pairs, compared with 6 of 9 for version 0.8.6, with three paired improvements and one regression. This is useful change-focused evidence but not a population accuracy estimate. At that checkpoint, `07/` was consumed and `08/` through `0b/` remained untouched; subsequent chromatic-role work consumed `08/` through `0f/`.

The blinded 25-case music repeat review established that reviewer drift does not explain the main conflict. It had 21 exact five-way repeats, agreement on all 17 pairs that were decisive both times, no gradient-to-flat or flat-to-gradient flips, and only three historical decisive labels becoming nondecisive. All six historically flat cases deliberately enriched because V3 retained them were again judged flat. V3 therefore fit only 13 of 20 historical decisive labels and 11 of 17 repeat-decisive labels in this hard sample. The six fixed flat contrasts are `gc-0fe57ca77f27b6cf9b12`, `gc-535b0c12c20aed0d9863`, `gc-b99827ae221843eb0578`, `gc-c79a6d529180b9fdd5c9`, `gc-d67d2a270d9ef853e69b`, and `gc-e518f46ad5348fac5ad9`.

The exposed base-`images/` diagnostic covered all 34 unsuffixed artworks: canonical 0.17 marked 13 as gradients and V3 retained 11. The reviewer reported that the exposed results looked very good overall but intentionally supplied only one exact-pair label; the other 33 remain unlabeled. The one submitted case, `muse.jpg`, was judged gradient while V3 selected flat. This is a confirmed V3 false removal, not evidence that the unlabeled cases are correct.

Frozen variants A-H and their pairwise decision unions/intersections cannot resolve the conflict. Variant H improves the hard music sample but rejects both `muse.jpg` and `nada.jpg`; the only combinations preserving all four targeted positive pairs repair at most one of the six reaffirmed music flats and introduce other false retentions. V3 therefore remains a research baseline and must not replace canonical 0.17. Future work must add ranking evidence that separates broad foreground-owned color structures from sparse true fields, predeclare the feature hypothesis, retain the ten fixed contrasts as development tests, and use fresh `08/` or later evidence only after another candidate is frozen.

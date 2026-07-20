# Palette Research Restart

This directory is an independent research implementation. It does not import the legacy extractor, clustering, saliency, gradient, foreground, or packed color-space code.

The current version is an inspectable classical research implementation intended to collect trustworthy preference data before introducing pretrained vision models. It is not a production API.

## Review

Generate results, write the corpus selection, and start the reviewer:

```sh
pnpm research:generate
pnpm research:holdout
pnpm research:select
pnpm research:review
```

Open <http://127.0.0.1:3100>.

Open <http://127.0.0.1:3100/gallery> to inspect generated corpus entries beside their current spatial palette previews. Holdout output remains omitted until source eligibility is complete.

The default queue compares the current spatial method against the archived previous iteration. The comparison button cycles through iteration, quantization-baseline, and balanced-versus-expressive queues. Pairs are omitted unless a role moves by more than `0.025` OKLab or the gradient decision changes. A previously reviewed baseline or expressive pair is also omitted in later rounds when both candidates remain perceptually unchanged from its latest judgment.

Review controls:

- `1`, `2`, `0`: prefer A, prefer B, or no preference
- `Q`, `W`, `E`, `R`: ship A only, B only, both, or neither
- `Enter`: submit and advance
- Left/right arrows: previous/skip

Candidate identities and left/right order are hidden. The side assignment is deterministic per artwork, so a resumed review does not silently reverse candidates. Feedback is validated by the server and atomically appended to `research/data/feedback.json`.

The interface chrome uses only black and white. Color appears only in the source artwork, candidate theme previews, and role swatches. Gradient previews interpolate in OKLCH, weight the background color through the first half, and delay the surface endpoint until 90%. The preview presentation is versioned so judgments made before a material rendering change are preserved but re-queued.

Current generated round:

- 37 non-scrambled cases analyzed
- 35 cases eligible for review
- 1 perceptually changed current-versus-previous comparison
- 32 perceptually changed spatial-versus-quantized comparisons
- 23 perceptually changed balanced-versus-expressive comparisons
- Crop/noise role movement: median `0.000`, p90 `0.081`, maximum `0.780` OKLab
- 355 deduplicated holdout artworks analyzed separately
- Validation generated foreground: 11/355; relaxed background: 15/355; relaxed surface: 7/355; collapsed surface: 105/355; gradients: 166/355
- Duplicate-resolution role movement: median `0.003`, p90 `0.158`, maximum `0.995` OKLab; 2 gradient disagreements

The robustness tail is retained in `research/data/robustness.json`; it is not role-rematched or excluded from reporting.

## Deterministic Corpus Review

`pnpm research:select` reads `research/data/holdout-results.json` and deterministically assigns all 355 representative `00/` sources to disjoint, fixed queues. The accepted-corpus target is 50 diversity cases, 30 diagnostic-risk cases, and 20 deterministic random controls. The current queues contain 205, 90, and 60 candidates respectively; candidates beyond each quota are fixed reserves for that same track, so a veto cannot change the target mix.

`research/data/selection.json` records the SHA-256 of the exact raw `holdout-results.json` artifact, which the server verifies byte-for-byte. Manifest and review identity instead use a semantic digest that excludes `generatedAt` and extraction `processingMs`, so equivalent reruns retain identity. The selector strategy, algorithm version, dimensions, and exact source image hashes remain bound to the manifest, and the server verifies the on-disk source bytes. Once palette review begins, later algorithms migrate the frozen queues rather than reassigning sources from output-dependent risk and diversity features; the migrated strategy records its parent manifest ID.

1. Stage 1 at <http://127.0.0.1:3100/curate> is source-only eligibility review. It shows the source, dimensions, and source hash, but no palette, selection-track label, or other output-derived stratum. A veto requires a recorded reason, with a note for `other`; its slot is deterministically replaced from the same track's reserve queue. Decisions remain undoable only until palette output is first disclosed.
2. All three quotas must be filled, for 100 eligible sources total, before holdout output appears in the gallery or <http://127.0.0.1:3100/absolute> unseals. After completion, opening `/absolute` or revealing holdout output in `/gallery` persistently freezes membership before output is served. Deleting absolute feedback does not unfreeze curation. Stage 2 began as an absolute shippability review of each accepted 0.11 spatial palette on its own; later accepted rounds carry unchanged judgments and directly review changed palettes.

Selection is stored in `research/data/selection.json`, source decisions in `research/data/curation.json`, and absolute decisions in `research/data/absolute-feedback.json`. `research/data/holdout-results.json` remains the extraction and provenance input for both selection and the accepted spatial palettes.

The initial 0.11 review screened 112 sources to fill the 100-source quotas, then marked 83 palettes shippable and 17 unshippable under a deliberately severe release-quality threshold. Versions 0.13 and 0.15 each repaired three rejected palettes. Version 0.16 added three reviewed guarded corrections, reaching 92/8. Version 0.17 replaced composable guards with complete incumbent-constrained joint-role search. Its 11-item blinded review kept all six changed accepted palettes shippable and repaired three of four changed rejected palettes, producing the current 95 shippable and 5 unshippable palettes. See `research/data/corpus-review-summary.md` for the frozen 0.11 review and the archives under `research/data/rounds/` for subsequent transitions.

A round transition with changed semantic results requires preserving or archiving the existing selection, curation, and absolute stores, then explicitly initializing a new review state. `pnpm research:archive` archives only generated results and pairwise feedback; it does not perform this corpus-review transition.

## Commands

```sh
pnpm research:generate   # Analyze every non-scrambled corpus image
pnpm research:holdout    # Analyze one representative for each artwork in 00/
pnpm research:select     # Create provenance-locked selection queues for 100 accepted sources
pnpm research:holdout:summary # Compare cohort diagnostics and duplicate resolutions
pnpm research:archive    # Archive results and pairwise feedback before a new iteration
pnpm research:benchmark  # Crop/noise metamorphic diagnostics
pnpm research:test       # Deterministic unit and corpus checks
pnpm research:review     # Feedback server on port 3100
pnpm exec tsc -p research/tsconfig.json
```

## Current Pipeline

1. Normalize orientation, color profile, dimensions, and channels with Sharp.
2. Convert sRGB bytes to floating-point OKLab without packed intermediate values.
3. Segment the working image into SLIC-style perceptual/spatial regions.
4. Blend region-graph background propagation with stable continuous border-band evidence.
5. Estimate region distinctiveness, local contrast, saliency, and text-like structure.
6. Independently quantize a stable OKLab histogram so minor region-boundary changes do not replace the candidate colors.
7. Aggregate spatial evidence onto each color candidate.
8. Jointly enumerate background, foreground, secondary surface, and accent assignments.
9. Apply source foreground contrast tiers: normally 4.0:1 on background and 4.5:1 on surface, with evidence-gated floors of 3.0:1 and 2.5:1. Prefer an accessible chromatic foreground only when several substantial text-like colors support that identity. Generated black/white fallback retains 4.5:1.
10. Require evidence for a distinct surface, allow role collapse when that evidence is weak, and reserve auxiliary typography candidates for foreground/accent use.
11. Detect gradients using endpoint paths plus broad smooth low-frequency color variation.

Every extracted role color is an exact observed image pixel. Pure black or white is added only when no extracted candidate reaches its applicable foreground contrast tier against the selected background; once added, that fallback may also fill an otherwise absent accent role. Accent contrast remains below text and control requirements because the accent is treated as an identity/decorative color, but it now has a 1.2:1 visibility floor against background.

Accent is always perceptually distinct from both background and surface, with a hard minimum separation of `0.025` OKLab and at least 1.2:1 contrast against background.

## Corpus Policy

All 37 files in `images/` that do not contain `-scrambled` form the difficult development corpus. `maroon5-masked.jpg` and `maroon5-saliency.png` remain in diagnostics but are excluded from the default human queue. Pure-color fixtures remain in the queue as useful controls.

The random-artwork `00/` folder is development-facing validation. It contains 385 valid files representing 355 artwork IDs; 30 IDs have both 300px and 640px variants. `pnpm research:holdout` evaluates one representative per ID, preferring the larger source, and writes `research/data/holdout-results.json`. Version 0.12 visually audited the gradient cases changed by its coherence threshold, and the deterministic corpus review now selects from the same results. This workflow prevents output-aware source vetoes, but it is not a sealed generalization test. Future generalization evaluation requires a new untouched corpus, such as `01/`.

`research/data/holdout-summary.json` compares aggregate development/holdout diagnostics and measures role movement across the 30 duplicate-resolution pairs. These objective checks can expose instability but cannot establish visual quality without a sealed human evaluation.

The original artwork files, including `00/`, remain ignored by the repository's root `.gitignore`; this research harness therefore requires the local corpus and will not work from a fresh clone containing only scrambled images.

## Evaluation Policy

There is intentionally no single composite "quality" score.

Hard gates:

- Valid in-gamut RGB output
- Deterministic output for identical bytes
- Source foreground contrast of at least 3.0:1 on background and 2.5:1 on surface, with stronger defaults when role evidence permits
- Generated black/white foreground contrast of at least 4.5:1
- Accent contrast of at least 1.2:1 against background

Separate diagnostics:

- Source-color distance
- Four-color reconstruction error
- Pairwise role distance
- Gradient evidence
- Rolewise movement after a one-pixel crop and deterministic one-level channel noise

Human pairwise preference is the primary endpoint. Objective diagnostics identify failures but do not override a preference result.

## Known Limits

- Text likelihood is structural, not OCR-backed, so decorative edges and typography can be confused.
- The background model supports several edge-connected colors but still has to choose one role color for all-over or quadrant compositions.
- SLIC regions are not connectivity-cleaned after assignment; this is acceptable for feature aggregation but not suitable as a segmentation mask API.
- Accent selection remains less stable than background selection on nearly monochrome and highly textured covers.
- Pair-specific gradient eligibility has multiple labeled rounds; versions 0.8.4 through 0.8.6 failed independent evaluation, and 0.8.6 also produced a `31.25%` retained flat rate. Narrow threshold fitting is closed without changing canonical 0.17.
- A single foreground token still constrains multi-background artwork; 0.10 preserves the evidence-gated contrast tiers that represent Disney's blue field without replacing its white typography.
- The 35 reviewable local cases are a development corpus, not an unbiased benchmark or sufficient basis for statistical superiority claims.
- The 355 round-4 source files broaden development coverage but cannot validate version 0.8.5 after informing its recovery rule.

See `research/RESEARCH.md` for the research basis and planned learned-model experiments.
See `research/ALGORITHM.md` for a complete explanation of the accepted 0.15 algorithm and role constraints.

# Palette Research Restart

This directory is an independent research implementation. It does not import the legacy extractor, clustering, saliency, gradient, foreground, or packed color-space code.

The current version is an inspectable classical review candidate intended to collect trustworthy preference data before introducing pretrained vision models. It is not a production API.

## Review

Generate results and start the reviewer:

```sh
pnpm research:generate
pnpm research:review
```

Open <http://127.0.0.1:3100>.

Open <http://127.0.0.1:3100/gallery> to inspect every generated corpus entry beside its current spatial palette preview.

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
- 9 perceptually changed current-versus-previous comparisons
- 32 perceptually changed spatial-versus-quantized comparisons
- 23 perceptually changed balanced-versus-expressive comparisons
- Crop/noise role movement: median `0.001`, p90 `0.068`, maximum `0.780` OKLab
- 355 deduplicated holdout artworks analyzed separately
- Holdout generated foreground: 11/355; relaxed background: 17/355; relaxed surface: 7/355
- Duplicate-resolution role movement: median `0.003`, p90 `0.090`, maximum `0.720` OKLab; 0 gradient disagreements

The robustness tail is retained in `research/data/robustness.json`; it is not role-rematched or excluded from reporting.

## Commands

```sh
pnpm research:generate   # Analyze every non-scrambled corpus image
pnpm research:holdout    # Analyze one representative for each artwork in 00/
pnpm research:holdout:summary # Compare cohort diagnostics and duplicate resolutions
pnpm research:archive    # Freeze results and feedback before a new iteration
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
9. Apply source foreground contrast tiers: normally 4.0:1 on background and 4.5:1 on surface, with evidence-gated floors of 3.0:1 and 2.5:1. Generated black/white fallback retains 4.5:1.
10. Allow role collapse for simple dominant-color covers and preserve source typography candidates independently of the core quantizer.
11. Detect gradients using endpoint paths plus broad smooth low-frequency color variation.

Every extracted role color is an exact observed image pixel. Pure black or white is added only when no extracted candidate reaches its applicable foreground contrast tier against the selected background; once added, that fallback may also fill an otherwise absent accent role. Accent contrast remains a diagnostic because the accent is currently treated as an identity/decorative color, not guaranteed text or control color.

Accent is always perceptually distinct from both background and surface, with a hard minimum separation of `0.025` OKLab.

## Corpus Policy

All 37 files in `images/` that do not contain `-scrambled` form the difficult development corpus. `maroon5-masked.jpg` and `maroon5-saliency.png` remain in diagnostics but are excluded from the default human queue. Pure-color fixtures remain in the queue as useful controls.

The random-artwork `00/` folder is a separate holdout cohort. It contains 385 valid files representing 355 artwork IDs; 30 IDs have both 300px and 640px variants. `pnpm research:holdout` evaluates one representative per ID, preferring the larger source, and writes `research/data/holdout-results.json`. Holdout entries appear in the gallery but are excluded from review queues, feedback validation, and threshold tuning.

`research/data/holdout-summary.json` compares aggregate development/holdout diagnostics and measures role movement across the 30 duplicate-resolution pairs. These objective checks can expose instability but cannot establish visual quality without a sealed human evaluation.

The original artwork files are ignored by the repository's root `.gitignore`; this research harness therefore requires the local corpus and will not work from a fresh clone containing only scrambled images.

## Evaluation Policy

There is intentionally no single composite "quality" score.

Hard gates:

- Valid in-gamut RGB output
- Deterministic output for identical bytes
- Source foreground contrast of at least 3.0:1 on background and 2.5:1 on surface, with stronger defaults when role evidence permits
- Generated black/white foreground contrast of at least 4.5:1

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
- Gradient detection now has explicit missing/unnecessary feedback tags, but still needs a labeled review round.
- A single foreground token still constrains multi-background artwork; 0.9 tests whether documented relaxed source contrast can represent Disney's blue field without replacing its white typography.
- The 35 reviewable local cases are a development corpus, not an unbiased benchmark or sufficient basis for statistical superiority claims.
- The 355 holdout artworks reduce development-corpus bias, but inspecting or tuning against individual holdout failures would convert them into development data.

See `research/RESEARCH.md` for the research basis and planned learned-model experiments.
See `research/ALGORITHM.md` for a complete explanation of the stable 0.8 pipeline and role constraints.

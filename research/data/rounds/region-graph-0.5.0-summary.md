# Region Graph 0.5.0 Review

The complete immutable round is in `region-graph-0.5.0.json`.

The single perceptually changed 0.5-versus-0.4 pair and all 32 spatial-versus-quantized baseline pairs were reviewed under presentation version 2. The balanced-versus-expressive queue was not reviewed.

## Iteration Comparison

- 0.5 preferred: 1
- 0.4 preferred: 0
- Only 0.5 shippable: 1
- Only 0.4 shippable: 0

Meteora's prominent source-brown accent was preferred and was the only shippable choice.

## Quantization Baseline Comparison

- Spatial preferred: 19
- Quantized preferred: 7
- No preference: 6
- Only spatial shippable: 11
- Only quantized shippable: 5
- Both shippable: 12
- Neither shippable: 4
- Total shippable for spatial: 23
- Total shippable for quantized: 17

The spatial solver is the stronger basis overall, but the quantized baseline remains useful for exposing role-assignment failures.

## Failure Tags

- Surface: 1
- Missing source color: 1

## Findings

- Toxicity omits the small but distinctive saturated-red album title.
- YBBB regressed from the black accent selected in 0.2 to a dark red that does not represent its text and circular artwork details.
- Disney needs more than one of its four large background colors represented; its white artwork typography conflicts with the contrast required on the brighter alternate backgrounds under a single foreground token.
- Birds of Prey needs a gradient surface from its background field, such as light blue, rather than an unrelated subject color or the current orange/pink pairing.
- Elephunk's cream artwork typography cannot serve as foreground on the selected teal background at the 4.5:1 gate.
- Horsley's selected gradient colors still describe the middle rather than the full endpoint range.
- Franz benefits from collapsing its effectively single black background and surface; the quantized baseline's near-duplicate dark roles are unnecessary.
- Nobs may require a separate accessible-vibrant foreground strategy; the current dull blue is accessible but underrepresents the artwork's energy.

## Changes In 0.6.0

- Add symmetric near-neutral typography evidence so salient black details can serve as accent against a light foreground on chromatic artwork.
- Add a constrained saturated-text identity bonus for small source-color regions such as Toxicity's red title.
- Preserve the `0.025` OKLab accent separation invariant.
- Add corpus regressions for Toxicity and YBBB.
- Leave inaccessible role swaps and uncertain gradient endpoint changes for separate experiments instead of weakening WCAG gates or perturbing accepted palettes.

These changes remain hypotheses until direct 0.6-versus-0.5 review.

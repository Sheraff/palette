# Region Graph 0.1.0 Review

The complete immutable round is in `region-graph-0.1.0.json`.

## Outcome

- 32 blinded spatial-versus-quantized comparisons
- Spatial preferred: 8
- Quantized preferred: 10
- No preference: 6
- Neither acceptable: 8

The original schema conflated preference and ship-worthiness, so these values must not be interpreted as ship rates.

## Failure Tags

- Unfaithful: 8
- Accent: 8
- Foreground: 6
- Too flat: 4
- Surface: 3
- Background: 2

## Qualitative Findings

- A fixed four-distinct-color objective is wrong for simple two- and three-color covers.
- Source typography identity can matter more than selecting the maximum-contrast black or white.
- White typography was missed on Disney and Placebo.
- Generated black looked foreign on Doja.
- Near-white substitutes looked wrong where the artwork had a substantial pure-white component.
- Important low-luminance accents were lost on YBBB, while Toxicity lost its red title.
- Broad multicolor and satin transitions were missed as gradients on Birds of Prey and Slim.
- Background and foreground evidence can be individually correct across two candidates even when neither complete palette is acceptable.

## Changes In 0.2.0

- Preference and ship-worthiness are now independent required judgments.
- Candidate previews include artwork and foreground text directly on the background.
- Feedback includes missing and unnecessary gradients, unnecessary surfaces, missing source colors, and a plain-language tiny-detail label.
- Simple dominant-color images can collapse surface/background and accent/foreground roles.
- Foreground scoring favors substantial source extremes before generated black or white.
- Strong near-neutral typography evidence can tone-adjust a source background hue to preserve both identity and WCAG contrast.
- Accent selection no longer uses text contrast as a hard gate.
- Gradient evidence includes smooth low-frequency variation beyond one endpoint pair.

These changes are hypotheses derived from one development corpus and require direct 0.2-versus-0.1 review. They are not accepted labels or proof of general improvement.

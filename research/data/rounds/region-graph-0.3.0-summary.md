# Region Graph 0.3.0 Review

The complete immutable round is in `region-graph-0.3.0.json`.

Twenty-nine artworks were reviewed under corrected presentation version 2. Birds of Prey, Black, and Disney retain judgments from the earlier presentation and are treated as lower-confidence visual evidence.

## Preference

- 0.3 preferred: 12
- 0.2 preferred: 15
- No preference: 5

## Ship-Worthiness

- Only 0.3 shippable: 7
- Only 0.2 shippable: 10
- Both shippable: 7
- Neither shippable: 8
- Total shippable for 0.3: 14
- Total shippable for 0.2: 17

Version 0.3 improved several difficult individual artworks but regressed overall acceptance.

## Failure Tags

- Missing source color: 3
- Accent: 2
- Surface: 2
- Background: 2
- Unnecessary gradient: 2
- Unnecessary surface: 1

## Findings

- Generated tones were correctly removed, but cluster-bin averages could still look like colors not actually present in the artwork.
- Exact source fidelity applies to every role, not only background, surface, and accent.
- Pure black or white is an exceptional fallback only when no extracted color reaches contrast.
- Dark chromatic coverage alone caused false gradients on Krafty and Maroon 5.
- Near-black alternate surfaces should collapse on flat dark artwork such as Green Day.
- Slim and Muse need chromatic gradient surfaces rather than gray or near-black surfaces.
- The pure-color controls preferred reusing a necessary black/white fallback as accent over collapsing accent into the source background.
- Meteora needs a source brown/gray accent rather than a second near-white role.

## Changes In 0.4.0

- Use exact observed pixels as candidate RGB values instead of quantized-bin averages.
- Exclude generated black/white whenever any source candidate reaches foreground contrast.
- Permit only necessary pure black/white fallbacks, optionally reused as accent when no source accent exists.
- Add invariant tests for source membership and fallback necessity.
- Tighten dark-gradient hints with smoothness evidence to remove discrete false positives.
- Collapse redundant dark surfaces on non-gradient covers.
- Require chromatic surfaces when a dark chromatic gradient is supported.
- Use perceptual queue filtering so tiny exact-pixel clamping differences do not require human review.

These changes remain hypotheses until direct 0.4-versus-0.3 review.

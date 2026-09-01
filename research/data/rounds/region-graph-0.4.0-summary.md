# Region Graph 0.4.0 Review

The complete immutable round is in `region-graph-0.4.0.json`.

All 13 perceptually changed 0.4-versus-0.3 iteration pairs were reviewed under presentation version 2.

## Preference

- 0.4 preferred: 12
- 0.3 preferred: 0
- No preference: 1

## Ship-Worthiness

- Only 0.4 shippable: 9
- Only 0.3 shippable: 0
- Both shippable: 3
- Neither shippable: 1
- Total shippable for 0.4: 12
- Total shippable for 0.3: 3

Version 0.4 was never rejected in favor of 0.3. Exact observed-pixel candidates, strict fallback handling, and the refined surface/gradient decisions were strongly supported on the changed subset.

## Failure Tags

- Missing source color: 1

## Findings

- Meteora remained unshippable because neither palette represented the high-coverage brown that occupies much of the artwork.
- The accent role must never be the same color as either background or surface. This is a hard role invariant, not a soft preference.
- Slim's chromatic surface fixed the prior gray surface that did not belong to the artwork.
- Snarky's 0.4 accent was perceived as closer to the artwork's white.

## Changes In 0.5.0

- Enforce at least `0.025` OKLab separation between accent and both background and surface for every method.
- Add invariant tests for accent role separation.
- Give prominent, salient, non-background source colors more accent identity weight so major artwork colors such as Meteora's brown are not displaced by tiny text-like colors.

These changes remain hypotheses until direct 0.5-versus-0.4 review.

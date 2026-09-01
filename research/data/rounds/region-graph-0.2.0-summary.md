# Region Graph 0.2.0 Review

The complete immutable round is in `region-graph-0.2.0.json`.

The duplicate `nobs.jpg` submission had the same decisions in both entries. Analysis keeps the latest entry and uses 32 unique artworks.

## Preference

- 0.2 preferred: 12
- 0.1 preferred: 12
- No preference: 8

## Ship-Worthiness

- Only 0.2 shippable: 8
- Only 0.1 shippable: 2
- Both shippable: 13
- Neither shippable: 9
- Total shippable for 0.2: 21
- Total shippable for 0.1: 15

Version 0.2 did not win more preferences, but it increased accepted outputs by six artworks.

## Failure Tags

- Accent: 5
- Surface: 5
- Foreground: 3
- Missing gradient: 2
- Unnecessary surface: 2
- Background: 2
- Too flat: 2
- Missing source color: 2

## Findings

- Tone-adjusted backgrounds were rejected when the generated tone was not visibly present in the artwork.
- Background identity must be selected before other role compatibility can influence the tuple.
- Accent colors frequently duplicated foreground/background families or selected another broad background color instead of a salient detail.
- White or near-white source typography was still missed as foreground or accent on several covers.
- Simple role collapse was successful for Slipknot and YBBB, but incorrect collapse hid useful gradient surfaces on Muse and Slim.
- Version 0.2 improved source extremes on Green Day, Johns, Maroon 5, and YBBB.
- Disney exposes an irreducible constraint conflict: source white typography is not accessible over every broad source background color.

## Changes In 0.3.0

- Remove generated background and surface tones entirely.
- Restrict each role to candidates near the best score for that role before joint tie-breaking.
- Restrict backgrounds to candidates near the best independent background score.
- Add source-derived near-white candidate preservation without changing the core quantizer geometry.
- Prefer near-white typography as an accent when it cannot serve as accessible foreground.
- Penalize background-like accent candidates and require accent separation from other roles.
- Use source gradient surfaces for dark chromatic artwork and lower the population floor only when gradient evidence exists.
- Prevent smooth gradients from collapsing through the monochrome fast path.

These changes remain hypotheses until direct 0.3-versus-0.2 review.

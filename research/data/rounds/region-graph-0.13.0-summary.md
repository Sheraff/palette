# Region Graph 0.13.0 Round

Version 0.13 is the accepted successor to version 0.11. It uses three narrow rules derived from the frozen 100-artwork review:

- Prefer strong typography as the spatial foreground when complete selections share a score bucket.
- Represent a dominant interior color field as a flat surface without relaxing contrast.
- Require stronger population or text evidence before a tiny near-white detail receives the accent typography bonus.

## Changed Spatial Palettes

Exactly three of 392 corpus entries changed perceptually, all previously unshippable reviewed artworks:

- `00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg`: surface `#70ba25` to `#ffffff`.
- `00/ab67616d0000b2730000b69d0872db47295208b2.jpg`: accent `#fee5d9` to `#a8253e`.
- `00/ab67616d0000b2730000b82d833c330bb6fd6e75.jpg`: foreground `#afbc4c` to `#d2fd4c`; accent `#d2fd4c` to `#f582e5`.

No spatial palette changed among the 83 previously shippable artworks, the 255 unselected holdout artworks, or the 37 legacy research entries. The dominant-field rule also changes the expressive surface for its same target case.

## Automated Validation

- Hard-gate violations: 0 across 37 development and 355 holdout entries.
- Full-corpus semantic generation was deterministic across two independent runs.
- Development crop/noise movement was unchanged: median `0.000`, p90 `0.067`, maximum `0.780`, 24 warnings.
- Duplicate-resolution movement was unchanged: median `0.003`, p90 `0.105`, maximum `0.720`, 15 role warnings, 2 gradient disagreements.
- Candidate-artifact research tests: 40 passed.

## Human Review

All three blinded comparisons preferred 0.13 over 0.11. Two replacements were shippable only under 0.13; the third was shippable under both versions. No comparison preferred 0.11.

The frozen 0.11 corpus review is archived in `region-graph-0.11.0-corpus-review.json`, and the accepted comparison feedback is preserved in `region-graph-0.13.0.json`. Carrying the 97 unchanged judgments and the three accepted replacements produces 86 shippable and 14 unshippable current palettes.

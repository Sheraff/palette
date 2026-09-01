# Region Graph 0.15.0 Round

Version 0.15 is the accepted successor to version 0.13. It narrows the rejected 0.14 flat-surface gate by preserving overwhelming background evidence and adds a spatial-only preference for substantial, vivid, region-supported identity colors in a tightly limited light-background context.

## Changed Spatial Palettes

Exactly three of 392 corpus entries changed perceptually, all previously unshippable reviewed artworks:

- `00/ab67616d00001e020000269ead63cf2376a6b67d.jpg`: surface `#fbe1b6` to `#fcfaf8`; accent `#870004` to `#fa0302`.
- `00/ab67616d0000b2730000158e02a7e22b0c5565ef.jpg`: surface `#eaef87` to `#e7feef`; accent `#902c05` to `#e80704`; gradient disabled to enabled.
- `00/ab67616d0000b27300008f3ed9782ff5e97dc1e7.jpg`: surface `#5c2944` to `#9f1f76`; gradient disabled to enabled.

No spatial palette changed among the 86 previously accepted reviewed artworks, the 255 unselected holdout artworks, or the 37 legacy research entries. The 0.14 regression is restored exactly to accepted 0.13 output.

## Automated Validation

- Hard-gate violations: 0 across 37 development and 355 holdout entries.
- Full-corpus semantic generation was deterministic across two independent runs.
- Development crop/noise movement was unchanged: median `0.000`, p90 `0.067`, maximum `0.780`, 24 warnings.
- Duplicate-resolution movement was unchanged: median `0.003`, p90 `0.105`, maximum `0.720`, 15 role warnings, 2 gradient disagreements.
- Candidate-artifact research tests: 44 passed.

## Human Review

All three blinded comparisons preferred 0.15 over 0.13 and marked only 0.15 shippable. No comparison preferred or shipped only 0.13.

The frozen 0.13 corpus review is archived in `region-graph-0.13.0-corpus-review.json`, and the accepted comparison feedback is preserved in `region-graph-0.15.0.json`. Carrying the 97 unchanged judgments and the three accepted replacements produces 89 shippable and 11 unshippable current palettes.

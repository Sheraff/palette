# Region Graph 0.11.0 Review

The complete immutable development round is in `region-graph-0.11.0.json`.

The only perceptually changed 0.11-versus-0.10 iteration pair was reviewed under presentation version 2.

## Iteration Comparison

- 0.11 preferred: 1
- 0.10 preferred: 0
- No preference: 0
- Only 0.11 shippable: 0
- Only 0.10 shippable: 0
- Both shippable: 1
- Neither shippable: 0
- Total shippable for 0.11: 1
- Total shippable for 0.10: 1

Nobs gained an accessible dark-red source foreground and a yellow accent. The new palette was preferred, while both versions remained shippable.

## Validation

- The 355-entry validation cohort had no perceptual output changes from 0.10.
- Crop/noise movement remained at median `0.000`, p90 `0.067`, maximum `0.780` OKLab, with 24 warnings.
- Duplicate-resolution movement remained at median `0.003`, p90 `0.105`, maximum `0.720` OKLab, with 15 role warnings and 2 gradient disagreements.
- All foreground and surface contrast requirements remained satisfied.

## Decision

Version 0.11 is accepted as the current four-color candidate. It resolves the repeated Nobs foreground concern without changing the validation cohort or weakening accessibility constraints.

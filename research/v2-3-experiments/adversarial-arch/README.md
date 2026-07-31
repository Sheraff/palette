# Adversarial architecture review — probes and hygiene wave

Findings are in [`REVIEW.md`](./REVIEW.md); what was executed from them, and the byte-identity
evidence, is in [`HYGIENE.md`](./HYGIENE.md).

All commands are run from the repository root. The authoritative artworks are copyrighted and
gitignored (finding **F1**), so a worktree holds only the `-scrambled` decoys — and **a decoy is
not a substitute**: scrambling preserves the colour histogram and destroys spatial structure, so
field topology, transition traces and endpoint refinement all behave differently on one. Point the
single supported variable at a checkout that has the real files:

```sh
export PALETTE_IMAGES_ROOT=/path/to/main/checkout/images
```

| probe | command |
| --- | --- |
| **byte-identity acceptance sweep** (101 images: 37 real + 34 decoys + 30 off-panel) | `node --no-warnings --experimental-strip-types research/v2-3-experiments/adversarial-arch/sweep.ts --set full --out after.json` then `… sweep.ts --compare sweep-baseline.json after.json` |
| all-ranked-lane registry usage | `node --no-warnings --experimental-strip-types research/v2-3-experiments/adversarial-arch/registry-usage.ts` |
| stage split of `extractPaletteDetails` | `node --no-warnings --experimental-strip-types research/v2-3-experiments/adversarial-arch/stage-timing.ts [image...]` |
| the two redundant recomputations | `node --no-warnings --experimental-strip-types research/v2-3-experiments/adversarial-arch/duplicate-work.ts [image...]` |
| `endpointBandSpread` census by hypothesis source | `node --no-warnings --experimental-strip-types research/v2-3-experiments/adversarial-arch/spread-census.ts [image...]` |
| CPU profile | `node --no-warnings --experimental-strip-types --cpu-prof --cpu-prof-dir research/v2-3-experiments/adversarial-arch/prof research/v2-3-experiments/adversarial-arch/profile-run.ts placebo.jpg` |
| profile summary, with per-call-site subtree totals | `node --no-warnings --experimental-strip-types research/v2-3-experiments/adversarial-arch/cpuprof-summary.ts <file.cpuprofile> evaluateGradientFits buildBackgroundFieldDomains scorePaletteCandidates` |

Typecheck (note the absolute path — see F1):

```sh
<checkout>/node_modules/.bin/tsc -p research/v2-3-experiments/adversarial-arch/tsconfig.json
```

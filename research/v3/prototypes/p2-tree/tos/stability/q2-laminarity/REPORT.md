# Q2 — is the laminarity cut publishing phantom gradients?

**Worker G, cycle 2, 2026-08-04. Measurement only; no constant was changed.** Pinned to commit
`4d7c9d89`. The sibling rewrite of `pipeline.ts` touches only the role stage: re-running `collect.ts`
against the current working tree reproduces this study's geometry **byte-identically** on its first
six covers, so the finding holds under both readings.

## Yes — 69% of the gradients it publishes contradict the only human labels we have

| point | `LAMINARITY_CUT` | `MONOTONE_MIGRATION_FRACTION` | agreement (n=144) | TP / FP / FN / TN | phantom rate |
|---|---|---|---|---|---|
| **current** `[UNCALIBRATED]` | 0.15 | 0.8 | **45.8% [37.9-54.0]** | 8 / 18 / 60 / 58 | **69.2%** |
| best of the 77-cell grid | 0.10 | 1.0 | 54.9% [46.7-62.8] | 5 / 2 / 63 / 74 | 28.6% |
| majority-class baseline (always "flat") | - | - | 52.8% | - | - |

**The current operating point is worse than always saying "no gradient".** And the best cell of the
family does not survive its own multiplicity correction: raw p=0.339, Holm p=1.000, **0 of 77 cells
survive at alpha=0.05** (`sweepThenTest`, family declared in `constants.ts` before the grid ran).
This grid contains no defensible operating point — it contains a ranking of bad ones.

## The labels

173 endorsed artworks. **137 carry a unanimous gradient boolean**; 7 more are contested and resolved
by recency the way `evidence.ts` resolves grades, giving **144 usable** (68 ramp / 76 flat); 29 carry
no gradient state at all. `palette.gradient: null` in the source means *not recorded* — the entry's
own `paletteSignature` spells it `g?` against `g0`/`g1`. `src/adjudication/evidence.ts` deliberately
drops the field (it compares role colours only), so the boolean is read from
`data/legacy/endorsements.json` joined on `entryId`; `labels.ts` says why at length.

## The reviewer's own phantom names the guilty constant

Round-1 item `…c5ac790164` ("flat, not a gradient"): **laminarity 0.0234** — inside *every*
`LAMINARITY_CUT` on the grid, so no value of that constant refuses it — and **monotonicity 0.8158**,
a hair above the current 0.8. It reads as a gradient in 40 of 77 cells, and **every one of those 40
has `mm ≤ 0.8`; none has `mm ≥ 0.9`.** Across the whole grid `LAMINARITY_CUT` saturates above 0.2
(0.2, 0.25 and 0.3 are identical rows) while `MONOTONE_MIGRATION_FRACTION` moves the phantom rate
from 83% to 29%. **The cut that is mispriced is the monotonicity ratio, not the laminarity residual**
— which puts `NOTES.md` deviation 2, where arm-b′ §2.5's literal "migrates monotonically" was
relaxed into a ratio, directly in the frame.

## The ceiling nobody swept

`UNREADABLE_COVERAGE_FRACTION` (0.5, also `[UNCALIBRATED]`) runs **before** the laminarity test and
gates out 124 of 192 covers — 93 of the 144 labelled ones, including **52 of the 68 legacy ramps**.
No cell of this grid can score better than (144-52)/144 = **63.9%**. Calibrating the laminarity
constants without calibrating the coverage gate is calibrating the wrong screw.

## Three points for a flat-vs-ramp round

Criteria declared before the grid was read. Verdict distribution over demo-20 ∪ first-50-endorsed
(69 covers); flip lists are written as set files under `out/`.

| point | cut | verdicts (flat/laminar/partitioned/textured/unreadable) | gradients | agreement | phantom | flips vs current |
|---|---|---|---|---|---|---|
| **P1 current** | 0.15 / 0.8 | 2 / 11 / 14 / 1 / 41 | 11 | 45.8% | 69.2% | 0 — `out/flips-current.txt` |
| **P2 monotone-only** | 0.15 / **1.0** | 3 / 4 / 21 / 0 / 41 | 4 | 54.2% | 37.5% | 22, all ramp→flat — `out/flips-monotone-only.txt` |
| **P3 best-agreement** | **0.10** / **1.0** | 3 / 4 / 21 / 0 / 41 | 4 | 54.9% | 28.6% | 23, all ramp→flat — `out/flips-best-agreement.txt` |

P2 changes one constant and asks the reviewer the one question worth asking: was relaxing literal
monotone migration the defect? Of its 22 flips, 15 are covers the legacy corpus calls flat (the cut
would be fixing them), 3 are covers it calls a ramp (regressions), 4 are unlabelled. P3 adds a
`LAMINARITY_CUT` move worth 1 further cover and should be shown so the round can see it buys almost
nothing.

## Reproduce

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p2-tree/tos/stability/q2-laminarity/collect.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p2-tree/tos/stability/q2-laminarity/sweep.ts
```

`out/geometry.jsonl` (192 covers), `out/labels.json`, `report.json` (all 77 cells), `out/flips-*.txt`.

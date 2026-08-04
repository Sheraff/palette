# W-INTEG pass 4 — the no-field fork

SPEC decision 9's precedence ruling and retreat-weights ruling, implemented. Run 2026-08-04,
`p5-fieldfit-demo-20-20260804T172958317Z.jsonl`.

## Files modified

- **`src/fieldfit.ts`** — `NO_FIELD_EXPLAINED_FRACTION` exported (was module-private); new
  `explainedFractionByColors(raster, colors)` — same radius constant, same all-pixels rule, distance
  to the *nearest* member so a colour set is judged as one model. No new constants.
- **`src/ramp.ts`** — `twoBlockCandidates(fit, raster, inventory)` split out of `twoBlockTargets`
  and exported; returns the two `TripleStats` (`surface: null` when no second separated colour
  exists). `twoBlockTargets` now takes that result, so `readRamp`'s decision-5 fallback and
  `candidate.ts`'s rescue share one definition of "the two blocks".
- **`candidate.ts`** — the fork: on `noField`, test the two blocks first, publish them when their
  joint explained fraction ≥ `NO_FIELD_EXPLAINED_FRACTION`, retreat otherwise. `twoBlockFallback` is
  set on both routes to a published two-block reading. Header rewritten: the retreat's kept-fit
  weights and overlay's affine `localField` now cite the retreat-weights ruling instead of being
  listed as deviations.
- **`tests/candidate.test.ts`** — two fixtures for the fork (below).

## Results

**Tests** 31/31 pass (was 29). `tsc --strict` clean in the prototype dir; the two errors in
`src/contract/` are pre-existing and untouched.

**Devloop** `20 ok · 0 failed · 0 cache hits · 20 computed · 902 ms`. computeMs min/med/max/mean
300/407/659/425 (down from 545 — the rescue's extra pass costs less than the retreat's ranking on the
six covers that no longer reach it). Determinism re-verified: 0/20 differ across two `--no-cache`
runs.

**Scorecard — no delta.** Identical to pass 3, invariant for invariant:

| | pass | fail | deferred | not-exercised |
|---|---|---|---|---|
| I1 | 0 | 0 | 0 | 20 |
| I2 | 0 | 0 | 20 | 0 |
| I3 | 13 | 7 | 0 | 0 |
| I4 | 20 | 0 | 0 | 0 |
| I5 | 0 | 0 | 20 | 0 |

Still only 7× `I3.foreground-accent-not-separated` (d = 0.027–0.054 < 0.07444), left in place per
decision 7's second ruling. The rescue publishing a *distinct* surface on two covers introduced no
new I3 or I4 rows.

**Counts** noField **8** (rescue **2** · retreat **6**) · gradient **5** · flat **15** (of which the
one decision-5 excursion fallback on a non-noField cover, `d859a69094`). Order-0 5, order-1 15.

## The 8 former-noField covers — outcome changes

Exactly **2 of 20 palettes changed** across the whole set, both of them rescues:

| cover | explF | pass 3 | pass 4 |
|---|---|---|---|
| `fc8d58e0af` | 0.472 | retreat `#545d58` collapsed | **rescue** `#545d58` / `#4b544f`, `surfaceCollapsed: false` |
| `2376a6b67d` | 0.096 | retreat `#fad107` collapsed | **rescue** `#fad107` / `#f81107`, `surfaceCollapsed: false` |

The other six are unchanged retreats: `28279e9184` (0.118, `#cccecd`), `21256ce593` (0.019,
`#292728`), `16a8247378` (0.205, `#010000`), `20cac4b472` (0.199, `#050505`), `908479200b` (0.100,
`#231f20`), `806cb6dd7d` (0.114, `#000000`). Their best two colours cannot reach half the image
either — these are photographs, not block covers, which is the discrimination the ruling wanted.

`2376a6b67d` is the cover the ruling was written from and it now reads as intended: the yellow/red
two-block cover keeps both colours. Its foreground/accent also moved (`#fe0000`/`#000000` →
`#000000`/`#000009`), because the overlay's feasibility filter now excludes clusters matching the
*surface* as well, and `#fe0000` is the surface's block.

`fc8d58e0af` is worth a look at review time: explF 0.472 puts it just under the field floor, and its
two blocks (`#545d58` / `#4b544f`) are separated by their pairwise bar but only barely — the rescue
is doing what it was told, on a cover that may not be a two-block cover at all. It is the closest
thing in the set to a false positive for this path.

## `2376a6b67d` diagnose

```json
{"image":"ab67616d00001e020000269ead63cf2376a6b67d.jpg","size":"300×300","fieldOrder":1,
 "diagnostics":{"noField":true,"inlierFraction":0.8645,"fieldExplainedFraction":0.0964,
  "residualScale":0.16832,"marginBars":0.8484,"orientationMargin":0,"gradient":false,
  "excursionMax":0,"thirdStopAccepted":false,"residualExcursion":0,"twoBlockFallback":true,
  "accentChromaOnly":false,"offArtwork":{"background":false,"surface":false,"foreground":false,
  "accent":false},"escape":false},
 "palette":{"background":"#fad107","surface":"#f81107","foreground":"#000000","accent":"#000009",
  "gradient":null,"geometry":null,
  "collapse":{"surfaceCollapsed":false,"accentCollapsed":false},"escape":null}}
```

## Notes for the orchestrator

- **The fork is readable from the frozen `Diagnostics` with no new field**: `noField &&
  twoBlockFallback` is a rescue, `noField && !twoBlockFallback` is a retreat, and `!noField &&
  twoBlockFallback` is `readRamp`'s own decision-5 excursion fallback. Stated in `candidate.ts`.
- **Still unexercised on demo-20**: the escape path (0/20) and post-snap third-stop retention (0/20).
- **`explainedFractionByColors` is O(pixels × |colors|)** and is called once per noField cover with
  two colours. If a future reading tests more colour sets per image this wants the OKLab hash grid
  `snap.ts` already builds.

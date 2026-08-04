# W-INTEG pass 5 — v0.2.0, the three round-1 rulings

`ALGORITHM_VERSION = "p5-fieldfit-0.2.0"`. Run `p5-fieldfit-demo-20-20260804T181921229Z.jsonl`.

## Files modified

- **`src/overlay.ts`** — `readOverlay`'s fifth argument is now the **published ramp**
  (`readonly GradientStop[]`) instead of an OKLab end pair, because both new rules are statements
  about published colours. Every distinctness/feasibility test runs on the cluster's representative.
  Foreground = argmax `min|raw APCA|` over that ramp via the contract's own `minRawContrastOverRamp`;
  the same number is the filter (below `minTextContrast` ⇒ not a foreground) and the ranking, mass and
  packed int demoted to tie-breaks. Accent winner on the front = argmax of min OKLab distance to
  {foreground, both ends}. Two new `[UNCALIBRATED]` **compute-budget** constants,
  `SELECTION_RAMP_SAMPLES_PER_SEGMENT/REFINEMENT_SAMPLES` = 64/64 — selection density only; invariant 4
  re-measures at the contract's 2048/4096.
- **`candidate.ts`** — the stop list is built before `readOverlay` and passed to it; version bump.
- **`tests/overlay.test.ts`** — `rampOf()` helper, all call sites, the Pareto test's winners
  recomputed, three regressions added. **`tests/candidate.test.ts`** — version assertion.

## Results

**Tests** 33/33 (was 31). `tsc --strict` clean in the prototype dir.

**Devloop** `20 ok · 0 failed · 0 cache hits · 20 computed · 837 ms`; computeMs min/med/max/mean
222/345/576/377. 17 of 20 palettes changed.

**Scorecard** — I3 fails 7 → **2**, I4 0 → **2**.

| | pass | fail | deferred | not-exercised |
|---|---|---|---|---|
| I1 | 0 | 0 | 0 | 20 |
| I2 | 0 | 0 | 20 | 0 |
| I3 | 18 | 2 | 0 | 0 |
| I4 | 19 | 1 | 0 | 0 |
| I5 | 0 | 0 | 20 | 0 |

Remaining: 2× `I3.foreground-accent-not-separated` (`ca2eff2a4a` 0.0269, `20cac4b472` 0.0539 — left
per decision 7's second ruling). **New: 2× `I4.below-contrast-floor` on `16a8247378`** — accent
`#00000b` on background `#010000`, |raw| 0.615. The accent rule maximizes OKLab distance and consults
**no contrast floor**; decision 8 never had one, unlike decision 7. One-line fix available (filter
accent candidates by `minAccentContrast` over the ramp) but it is policy, so it is reported, not taken.

## The four round-1 covers

| cover | v0.1.0 bg / sf / fg / ac | v0.2.0 bg / sf / fg / ac |
|---|---|---|
| `0c4aab8aa7` | `#ececec` `#f5f5f5` **`#e4e4e4`** `#000000` | `#ececec` `#f5f5f5` **`#000000`** `#685e43` |
| `2376a6b67d` | `#fad107` `#f81107` `#000000` **`#000009`** | `#fad107` `#f81107` `#000000` **`#000017`** |
| `908479200b` | `#231f20` `#231f20` **`#febf6f` `#fed078`** | `#231f20` `#231f20` **`#fed078` `#292933`** |
| `28279e9184` | `#cccecd` `#cccecd` `#f8f8f8` **`#000022`** | `#cccecd` `#cccecd` `#070400` **`#ff00a0`** |

Item 1's *"foreground barely registers"* is fixed (`0c4aab8aa7`: `#e4e4e4` on a white field →
`#000000`). Item 7's visually-identical fg/accent pair is fixed (`908479200b`). The predicted vivid
pink appeared on `28279e9184` (`#ff00a0`).

**The predicted white accent on `2376a6b67d` did not appear**, and the reason is not the new
tie-break. The white cluster is there — `#fbfaff`, mass 635, min-distance **0.2181**, easily the
largest in the set — but it never reaches the front: |ΔL| 0.1153 / chroma 0.1014 are both dominated by
the near-black family (|ΔL| ≈ 0.74, chroma ≈ 0.18) that the affine `localField` inflates on this
noField cover. **Front membership, not the ranking, is what excludes the artwork's white here.** Also
worth seeing: 223 clusters, a dozen of them near-black variants (`#000000`, `#000300`, `#010101`,
`#000200`…) that the dark region's small bar keeps apart.

## Robustness (600 trials, 299.9s wall, 0 errors)

| group | previous | v0.2.0 | Δ |
|---|---|---|---|
| overall agreement | 37.7% | **33.7%** | −4.0 |
| rendition-pair | 23.5% | **16.5%** | −7.0 |
| jpeg-q92 | 59% | **60.0%** | +1.0 |
| jpeg-q85 | 43% | 42.0% | −1.0 |
| jpeg-q75 | 44% | **35.0%** | −9.0 |
| dither-lsb1 | 33% | 32.0% | −1.0 |
| **foreground** instability | 30.2% | **26.2%** | **−4.0 (better)** |
| **accent** instability | 50.8% | **52.8%** | +2.0 (worse) |
| background / surface instability | 20.0% / 21.5% | 20.0% / 21.5% | 0 / 0 (identical) |

Measured, not guessed: the foreground rule **improved** foreground stability by 4 points; the accent
rule **cost** 2 points of accent stability. Background and surface are bit-identical (120/600,
129/600), which is the control — nothing in the field path moved. Overall agreement is a conjunction
over four roles, so it fell despite the foreground gain, driven by rendition-pair (−7.0) and q75
(−9.0): min-OKLab-distance is a max over a small margin between many near-equal candidates, and
recompression reshuffles that ordering more readily than mass did.

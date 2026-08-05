# W-E2 pass 1 — v0.5.0, recursive field-like components

`p5-fieldfit-0.5.0`. Runs `…demo-20-20260804T224834392Z.jsonl`, `…p5-round2-fresh-20260804T224836357Z.jsonl`.
**The brief's type sketch fits**; the additions are in `reports/we2-types-proposal.md`, defined in
`src/components.ts`. `types.ts` untouched, nothing paused.

## Evidence covers — predictions recorded before `diagnose` ran

| cover | predicted | v0.4.1 → v0.5.0 | |
|---|---|---|---|
| `908479200b` sunset | sky ramp as background, with gradient | `#231f20` flat → **`#7a545f`→`#fd7b61` gradient**, 3 components | ✔ |
| `28279e9184` polaroid | two-component reading, panel as surface | collapsed → **surface `#004164`**, accent **`#ff00a0`** (item 4's named pink) | ✔ |
| `b948ee7f1b` vivid | vivid field replaces near-white | `#f9fbf8` flat → **`#d34503`→`#e76511` gradient** | ✔ |
| `16a8247378` autumn sky | sky replaces black field | **unchanged**: sky claims .237, core .40 < .50, fails *smooth* | ✘ |

## Robustness (600 trials, 1297 s, 0 errors)

| group | v0.4.1 | v0.5.0 | Δ |
|---|---|---|---|
| overall | 42.2 | **39.3** | −2.9 |
| rendition-pair | 26.0 | **26.5** | +0.5 |
| q92 / q85 / q75 | 66.0 / 51.0 / 43.0 | 60.0 / 41.0 / 42.0 | −6.0 / −10.0 / −1.0 |
| dither-lsb1 | 41.0 | 40.0 | −1.0 |
| foreground / accent | 27.8 / 43.8 | 31.3 / 47.7 | +3.5 / +3.9 |
| **background** | **20.0** | ****19.8**** | ****−0.2**** |
| **surface** | **21.5** | ****23.0**** | ****+1.5**** |

**The frozen pair moved, and barely.** Background/surface instability had been 20.0/21.5 through every
pass because the field path never changed; the first pass that changes it lands at **19.8 / 23.0** —
background marginally *better*, surface 1.5 worse. The cost is elsewhere: overall −2.9, almost all of it
jpeg (q92 −6.0, q85 −10.0), and foreground/accent +3.5/+3.9 because the overlay's weights are now the
pool's on 9 covers. Mechanism, same shape as pass 8's gates: a claim sitting near the .10 extensive floor
or the .50 core gate can change survival under a recompression, and the reading changes with it. Run
began before a diagnostics-only edit to `candidate.ts`; both devloop runs re-executed after it are
byte-identical in palette, which is all this harness compares.

## Results

Tests **46/46** (+9: obligations (a)–(d), termination, determinism, disjoint claims). `tsc --strict`
clean; scorecard **zero violations both sets**; devloop `20 ok`/`2 ok`; cached and `--no-cache` runs
byte-identical. Obligation (d), empirically: all **13** `noField === false` covers publish
byte-identical palettes to v0.4.1 — the recursion sits behind decision 12's trigger. Of the 9 `noField`
covers, 6 changed and 4 gained a gradient.

## Deviations, old → new

1. **Extensive 0.10, not the brief's 0.15** — measured. The named second components claim .144
   (polaroid), .138 (`2376a6b67d`'s red), .131 (`fc8d58e0af`); 0.15 excludes all three and regresses
   `2376a6b67d` to one colour, i.e. obligation (c) fails on the real cover while passing synthetically.
   .131/1.2 ⇒ 0.10, decision 14's margin rule.
2. **Smooth = core fraction.** The brief's `explainedFractionOwn ≥ 0.5` is 1 by construction under a
   claim-defined support — an unfireable gate, decision 9's retired defect. Same two constants: half the
   claim inside the inlier core (w > 0.5).
3. **A ramp component publishes its ramp**; the second component takes the surface only otherwise
   (brief says the reverse). The roles *are* the ramp's ends, so they compete for one slot; (a)–(c)
   pass this way, (a) fails the other.
4. **Component fit = the same IRLS, cut held at `min(4.685σ̂, 4×bar)`**, modal-seeded beside the median
   start — MAD-about-zero σ̂ leaves a bimodal domain unrejectable. Ceiling defaults to +∞, so the global
   fit is bit-identical.
5. **Two-block rescue deleted**: two blocks are two order-0 components, judged more strictly.
6. **Overlay measures against the local component**; `overlay.ts` untouched.

## Open

- `16a8247378`: a smooth gate at .40 admits its painted sky, but that constant is
  `NO_FIELD_EXPLAINED_FRACTION`, shared with decision 9 — a SPEC call, not a knob.
- `2376a6b67d` surface is now white `#f9fbf8` (a larger component than the red); accent `#000300` on
  fg `#000000` is the known near-black twin weak spot.
- Frozen `Diagnostics` cannot separate "one flat component" from "retreat".

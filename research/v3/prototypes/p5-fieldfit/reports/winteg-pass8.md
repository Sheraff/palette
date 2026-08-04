# W-INTEG pass 8 — v0.4.1, both roles mass-led above measured gates

`ALGORITHM_VERSION = "p5-fieldfit-0.4.1"`. Runs `…demo-20-20260804T220357833Z.jsonl`,
`…p5-round2-fresh-20260804T220359294Z.jsonl`.

## The measured multiple (decision 14)

| evidenced twin pair | distance | `sameColorBar` | ratio |
|---|---|---|---|
| `#fed078` / `#febf6f` (`908479200b`) | 0.04050 | 0.02293 | **1.766** |
| `#fffce1` / `#fee2ba` (`16a8247378`) | 0.06851 | 0.02293 | **2.988** |
| `#000000` / `#000100` (fresh cover 2) | 0.06151 | 0.00932 | **6.599** |

Largest 6.599 × 1.2 = 7.919 ⇒ **`ACCENT_FG_EXCLUSION_MULTIPLE = 8`**. The 1.8–6.6 spread is itself
the finding and it is about the *formula*, not this prototype: the bar is far tighter near black than
the reviewer's eye is. Recorded in the provenance comment and reported upward as calibration input.

## Files modified

- **`src/overlay.ts`** — foreground = argmax overlay mass among rep-distinct candidates clearing
  `max(minTextContrast, FOREGROUND_MIN_RAW_APCA = 15)` over the ramp (provenance quotes the bracket
  (10.6, 28.9] and both evidence covers; the caller can raise the floor, never lower it below the
  bracket). Accent gains the twin exclusion. `apca-max`, `ForegroundRule`, `OverlayOptions`,
  `DEFAULT_FOREGROUND_RULE` deleted. **`fg-compare.ts` deleted.**
- **`tests/overlay.test.ts`** — three new regressions (item-7 title at raw 31.3 beating an 81.2
  speck; twin excluded → next colour wins; twin-only → collapse). Three existing fixtures recomputed
  honestly: the Pareto scene now returns `BLUE_MARK` as foreground (mass 40, raw 23.1 ≥ 15) and
  `DOMINATED` as accent; the identity scene's ink was made heaviest so mass-led picks it; the accent
  floor scene's visible candidate moved off the foreground's twin radius. Version bump.

## Results

**Tests** 37/37 (was 34). `tsc --strict` clean. **Devloop** demo-20 `20 ok · 1325 ms`; fresh
`2 ok · 427 ms`.

**Scorecard — zero violations on both sets.** I3 20/20 and 2/2 pass, I4 20/20 and 2/2 pass. **All
five `I3.foreground-accent-not-separated` rows from pass 7 are gone** — twin exclusion at 8 bars
subsumes 0.07444 in every region those pairs sat in, so the side effect the ruling anticipated is
total on this evidence. `accentCollapsed` 0/20; no escapes.

## The seven covers (pass-7 → v0.4.1)

| cover | fg | accent |
|---|---|---|
| `2376a6b67d` | `#000000` → `#000000` | `#fbfaff` → **`#fbfaff`** (white held) |
| `908479200b` | `#fed078` → `#febf6f` | `#febf6f` → **`#885963`** (twin excluded) |
| `16a8247378` | `#fffce1` → `#fee2ba` | `#fee2ba` → **`#493f3e`** (twin excluded) |
| `fc8d58e0af` | `#feffff` → `#e0d0db` | `#e0d0db` → **`#434c47`** (twin excluded) |
| `…f569f953` (fresh) | `#000000` → **`#ffffff`** | `#ffffff` → `#060000` (item 7 satisfied) |
| `…ee7f1b` (fresh) | `#000000` → `#000000` | `#000100` → `#040404` |
| `0c4aab8aa7` | `#e4e4e4`(v0.4 mass-led) → **`#131313`** | `#685e43` → `#e4e4e4` |

**`0c4aab8aa7` is a near-miss on the prediction**: fg is `#131313`, not `#000000`. Mass-led takes the
heaviest cluster above the floor and that is the `#131313` family, not the `#000000` one. Same ink,
one hex off the expectation.

**The near-black weak spot survives.** Fresh cover 2 publishes fg `#000000` / accent `#040404`,
measured ratio **11.4** — above the multiple of 8, so it is not excluded, and above 0.07444, so I3
passes it too. It still looks like a twin. Both instruments now agree it is legal and both are, on
this evidence, wrong; the fix is a recalibrated bar near black, not a larger multiple (raising the
multiple to 12 would also start excluding legitimately distinct pairs elsewhere).

## Robustness (600 trials, 285.3 s, 0 errors)

| group | v0.4.0 | v0.4.1 | Δ |
|---|---|---|---|
| overall agreement | 44.5% | 42.2% | −2.3 |
| rendition-pair | 31.5% | 26.0% | −5.5 |
| jpeg-q92 | 70.0% | 66.0% | −4.0 |
| jpeg-q85 | 51.0% | 51.0% | 0 |
| jpeg-q75 | 47.0% | 43.0% | −4.0 |
| dither-lsb1 | 36.0% | **41.0%** | +5.0 |
| foreground instability | 26.2% | 27.8% | +1.6 |
| accent instability | 35.5% | 43.8% | +8.3 |
| background / surface | 20.0% / 21.5% | 20.0% / 21.5% | 0 / 0 |

The gates cost stability, as gates do: both roles now sit on the *heaviest cluster that survives a
threshold*, and near a threshold a recompression can flip survival. Accent is worst (+8.3) because it
carries two thresholds. Still well above every pre-v0.4 pass (v0.3 accent 52.5%). Dither improved
5 points, which is the one place a gate helps: it stops a 1-LSB neighbour from swapping in.

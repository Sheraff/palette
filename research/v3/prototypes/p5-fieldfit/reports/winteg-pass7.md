# W-INTEG pass 7 — v0.4.0, accent back to mass; foreground measured, not picked

`ALGORITHM_VERSION = "p5-fieldfit-0.4.0"`. Runs `…demo-20-20260804T215206758Z.jsonl`,
`…p5-round2-fresh-20260804T215207761Z.jsonl`.

## Files modified

- **`src/overlay.ts`** — accent = argmax overlay mass among feasible candidates, tie by packed int
  (`feasible` already carries that order, so it is the first survivor); min-distance and its
  `colorDistance` import deleted. Added `ForegroundRule` / `OverlayOptions` /
  `DEFAULT_FOREGROUND_RULE = "apca-max"` for decision 13 — **temporary**, experiment-only, and
  deliberately not reachable from `candidate.ts`.
- **`fg-compare.ts`** — new, temporary.
- **`tests/overlay.test.ts`** — accent tests rewritten for mass-led; the min-distance regression
  replaced by the item-2 identity regression (built from `2376a6b67d`'s measured colours); the
  `16a8247378` floor regression kept and passing. **`candidate.ts`, `tests/candidate.test.ts`** —
  version.

## Results

**Tests** 34/34. `tsc --strict` clean. **Devloop** demo-20 `20 ok · 0 failed · 20 computed · 883 ms`;
p5-round2-fresh `2 ok · 0 failed · 2 computed · 353 ms`.

**Scorecard — zero violations did NOT hold.** I1/I2/I4/I5 unchanged (I4 still 20/20 pass, 0 fail).
I3: demo-20 **4 fails**, fresh **1 fail**, every one `I3.foreground-accent-not-separated` against the
disavowed 0.07444: `d859a69094` 0.0456, `16a8247378` 0.0685, `908479200b` 0.0405, `eaed77a9cb` 0.0323,
`b948ee7f1b` 0.0615. Cause is structural: the heaviest surviving mark is very often the foreground's
own near-twin. Recorded, not chased, per decision 7's second ruling — but see the caution below.

## The six covers

| cover | bg / sf / fg | accent | vs prediction |
|---|---|---|---|
| `2376a6b67d` | `#fad107` `#f81107` `#000000` | **`#fbfaff`** | white-family ✓ |
| `908479200b` | `#231f20` `#231f20` `#fed078` | `#febf6f` | — |
| `16a8247378` | `#010000` `#010000` `#fffce1` | `#fee2ba` | — |
| `fc8d58e0af` | `#545d58` `#4b544f` `#feffff` | `#e0d0db` | brown/green ✗ (pale mauve) |
| `…f569f953` (fresh) | `#b8d8ed` `#a1c7de` `#000000` | `#ffffff` | — |
| `…ee7f1b` (fresh) | `#f9fbf8` `#f9fbf8` `#000000` | `#000100` | — |

**Caution, stated because it is the round-1 complaint returning.** `908479200b` publishes
fg `#fed078` / accent `#febf6f` — the exact visually-identical pair round 1 graded down. `16a8247378`
(`#fffce1`/`#fee2ba`) and `…ee7f1b` (`#000000`/`#000100`) are the same shape. Mass-led accent, gated
only by `sameColor`, reliably reaches for the foreground's twin. This is the cost of retiring
min-distance, and it is exactly what the 0.07444 constant would catch.

## Foreground experiment (decision 13) — full table

Both predictions confirmed: `…f569f953` mass-led → `#ffffff`; `0c4aab8aa7` apca-max → `#000000`.

| cover | apca-max | mass-led | differ |
|---|---|---|---|
| `…f39d397ba3` | `#a20027` raw 74.4 mass 5 | `#f03e00` raw 53.3 mass 3202 | YES |
| `…ca2eff2a4a` | `#ffffff` raw 110.6 mass 306 | `#ffffff` raw 110.6 mass 306 | . |
| `…d859a69094` | `#000000` raw 91.7 mass 785 | `#010000` raw 91.7 mass 1309 | YES |
| `…28279e9184` | `#070400` raw 80.0 mass 1 | `#f8f8f8` raw 28.0 mass 759 | YES |
| `…0c4aab8aa7` | **`#000000` raw 97.5 mass 334** | `#e4e4e4` raw **4.9** mass 1928 | YES |
| `…21256ce593` | `#fffeff` raw 106.7 mass 173 | `#fffeff` raw 106.7 mass 173 | . |
| `…fc8d58e0af` | `#feffff` raw 91.1 mass 153 | `#e0d0db` raw 64.0 mass 468 | YES |
| `…35b967964d` | `#797785` raw 64.8 mass 3 | `#ebebeb` raw **3.7** mass 1405 | YES |
| `…949021f65e` | `#000000` raw 86.8 mass 14 | `#d9c4af` raw **10.6** mass 267 | YES |
| `…5a94002abc` | `#fffbff` raw 63.9 mass 22 | `#6b7c83` raw **7.7** mass 830 | YES |
| `…dd225466f4` | `#190100` raw 104.8 mass 4 | `#3a180c` raw 101.7 mass 7755 | YES |
| `…1a798808bf` | `#f2ffff` raw 107.3 mass 38 | `#cfe2e9` raw 88.3 mass 2109 | YES |
| `…c5ac790164` | `#000000` raw 106.0 mass 497 | `#70ba25` raw 47.0 mass 15627 | YES |
| `…16a8247378` | `#fffce1` raw 107.8 mass 1 | `#fee2ba` raw 94.3 mass 741 | YES |
| `…20cac4b472` | `#ffffff` raw 110.6 mass 1911 | `#ffffff` raw 110.6 mass 1911 | . |
| `…6e739e61bf` | `#fffff6` raw 106.5 mass 230 | `#fffff6` raw 106.5 mass 230 | . |
| `…908479200b` | `#fed078` raw 82.7 mass 520 | `#febf6f` raw 75.6 mass 622 | YES |
| `…eaed77a9cb` | `#ffffff` raw 97.1 mass 1440 | `#ffffff` raw 97.1 mass 1440 | . |
| `…806cb6dd7d` | `#ffffff` raw 110.6 mass 185 | `#be53a1` raw 35.6 mass 1271 | YES |
| `…2376a6b67d` | `#000000` raw 41.0 mass 1424 | `#000000` raw 41.0 mass 1424 | . |
| `…f569f953` (fresh) | `#000000` raw 73.5 mass 71 | **`#ffffff` raw 28.9 mass 4068** | YES |
| `…ee7f1b` (fresh) | `#000000` raw 106.0 mass 337 | `#000000` raw 106.0 mass 337 | . |

**15 of 22 differ.** The trade is visible in one column: mass-led wins item 7 (`#ffffff` at raw 28.9)
and loses item 1 (`#e4e4e4` at raw **4.9** — verbatim the round-1 UNACCEPTABLE "foreground barely
registers"), and it publishes raw < 11 on four demo-20 covers where apca-max publishes 64–106. The
2.5 floor is not a legibility gate at this scale; it only excludes near-identity. A third option the
table suggests but nobody has ruled on: mass-led above a floor that is *raised* rather than default.

## Robustness (600 trials, 271.2 s, 0 errors) — the best result of any pass

| group | v0.3 | v0.4 | Δ |
|---|---|---|---|
| overall agreement | 35.2% | **44.5%** | **+9.3** |
| rendition-pair | 24.0% | **31.5%** | +7.5 |
| jpeg-q92 | 57.0% | **70.0%** | +13.0 |
| jpeg-q85 | 43.0% | **51.0%** | +8.0 |
| jpeg-q75 | 30.0% | **47.0%** | +17.0 |
| dither-lsb1 | 33.0% | **36.0%** | +3.0 |
| foreground instability | 26.2% | 26.2% | 0 (identical — the control) |
| **accent instability** | 52.5% | **35.5%** | **−17.0** |
| background / surface | 20.0% / 21.5% | 20.0% / 21.5% | 0 / 0 |

The 51–53% accent instability that held across three selection rules was the *rule*, not the
agglomeration: overlay mass is a large aggregate, while min-distance was a max over small margins
between near-equal candidates, so recompression reshuffled it. Pass 6's inference is corrected by
this measurement.

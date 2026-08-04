# W-INTEG pass 6 — v0.3.0, the accent rebuilt

`ALGORITHM_VERSION = "p5-fieldfit-0.3.0"`. Run `p5-fieldfit-demo-20-20260804T211335069Z.jsonl`.

## Files modified

- **`src/overlay.ts`** — accent selection replaced wholesale. Feasibility now adds the contract's
  accent floor over the published ramp; selection is `argmax min OKLab distance to {foreground,
  background, surface}`, tie by overlay mass then packed int. **`paretoFront` and `AccentCandidate`
  deleted** (not kept as diagnostics — a function that used to decide the answer should not sit unused
  beside the code that replaced it). `accentChromaOnly` stays, read off the winner's `deltaL`.
- **`candidate.ts`**, **`tests/candidate.test.ts`** — version bump.
- **`tests/overlay.test.ts`** — the Pareto test rewritten for the new criterion (winners recomputed;
  `BLUE_MARK` still wins the accent, but the assertions now check the min-distance ordering rather
  than front membership), plus the new accent-floor regression. The vivid-pick test is unchanged and
  still passes.

**Reading of ruling (a), stated because it is a choice.** "Same machinery as foreground's text floor"
is implemented as `firstInvisibleAccentOnRamp`, not as a plain `|raw|` minimum, because the contract's
*accent* floor is a pointwise **conjunction** (`|raw| < floor` **and** distance < 0.14591 at the same
ramp point). Measured reason: a saturated red `#c81e1e` on a dark→mid grey ramp has min |raw| = 0.901
— the `|raw|`-only reading rejects it — while its distance there is 0.203, so the contract accepts it
and always would have. A filter stricter than the invariant it exists to satisfy would discard exactly
the vivid accents ruling (b) was written to recover. The v0.2 offender fails both halves and is
rejected either way. Both floor calls run at the selection density (64/64), not the contract's
2048/4096: at full density this one call took demo-20 from 0.8 s to 6.8 s.

## Results

**Tests** 34/34 (was 33). `tsc --strict` clean in the prototype dir.

**Devloop** `20 ok · 0 failed · 0 cache hits · 20 computed · 2158 ms`; computeMs min/med/max/mean
557/846/1407/919 (v0.2: 222/345/576/377 — 2.4×, the accent conjunction is now evaluated per feasible
cluster). 14 of 20 palettes changed, all 14 on the accent alone; no foreground moved.

**Scorecard — zero violations.**

| | pass | fail | deferred | not-exercised |
|---|---|---|---|---|
| I1 | 0 | 0 | 0 | 20 |
| I2 | 0 | 0 | 20 | 0 |
| I3 | **20** | **0** | 0 | 0 |
| I4 | **20** | **0** | 0 | 0 |
| I5 | 0 | 0 | 20 | 0 |

The 2 predicted `I4.below-contrast-floor` rows are gone. **The 2 remaining `I3` rows are gone too**,
unpredicted: maximizing distance from the foreground subject to a floor also pushes the accent clear of
`FOREGROUND_ACCENT_SEPARATION_DISTANCE` on both covers. `accentCollapsed` fired on 0 of 20 — the floor
never emptied the candidate set.

## The four round-1 covers, plus `16a8247378`

| cover | bg / sf / fg / accent | note |
|---|---|---|
| `0c4aab8aa7` | `#ececec` `#f5f5f5` `#000000` `#5c5c5c` | accent `#685e43` → `#5c5c5c` |
| `2376a6b67d` | `#fad107` `#f81107` `#000000` **`#453907`** | `#000017` → dark olive |
| `908479200b` | `#231f20` `#231f20` `#fed078` `#9c6167` | `#292933` → a rose |
| `28279e9184` | `#cccecd` `#cccecd` `#070400` **`#ff00a0`** | vivid pink held |
| `16a8247378` | `#010000` `#010000` `#fffce1` **`#594841`** | **`#00000b` → a visible brown; the two I4 rows** |

**`2376a6b67d` still does not pick the white**, and with the front gone the reason is no longer
exclusion — it is the criterion itself. `#fbfaff` has min-distance **0.2181**; the published
`#453907` has **0.3539**. The olive is genuinely further from `{#000000, #fad107, #f81107}` than the
white is. If the reviewer wants the white there, min-distance-to-published is not the rule that
produces it; that is a ruling, not a bug.

## Robustness (600 trials, 285.7 s, 0 errors)

| group | v0.2 | v0.3 | Δ |
|---|---|---|---|
| overall agreement | 33.7% | **35.2%** | +1.5 |
| rendition-pair | 16.5% | **24.0%** | **+7.5** |
| jpeg-q92 | 60.0% | 57.0% | −3.0 |
| jpeg-q85 | 42.0% | 43.0% | +1.0 |
| jpeg-q75 | 35.0% | **30.0%** | −5.0 |
| dither-lsb1 | 32.0% | 33.0% | +1.0 |
| foreground instability | 26.2% | 26.2% | 0 (identical) |
| accent instability | 52.8% | **52.5%** | −0.3 |
| background / surface instability | 20.0% / 21.5% | 20.0% / 21.5% | 0 / 0 |

Rendition-pair recovered its v0.2 loss and then some (16.5 → 24.0, above the 23.5 of v0.1). Foreground
is bit-identical (157/600) — nothing in decision 7's path moved, which is the control. Accent
instability barely moved (52.8 → 52.5): **dropping the front and adding the floor changed *which*
colour is chosen far more than *how stably* it is chosen.** Accent instability has now sat at 51–53%
across three rule sets, which suggests the instability is upstream of the selection rule — in the
agglomeration that produces the candidates — rather than in the ranking.

## Known conservatism, stated

When `gradient` is null the palette publishes two flat colours, but this module still *samples the
interpolation* between them when measuring both floors. The contract does not: invariant 4 checks flat
pairs when there is no gradient. Selection is therefore slightly stricter than the invariant on flat
covers. It changed no outcome on demo-20 (checked on `2376a6b67d`: the white clears both readings),
but it is a difference and it is here rather than buried.

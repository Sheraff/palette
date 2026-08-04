# W-VERIFY — P5 field-fit, independently re-derived

Everything below re-run from code/artifacts. Prior reports used only to suggest cover ids; every
outcome re-confirmed via `diagnose.ts`.

**1. Tests — PASS.** 31 pass, 0 fail, 0 skipped (424 ms).

**2. Determinism — PASS.** Two `--no-cache` demo-20 runs (flag at run.ts:529), each `20 ok · 0
failed · 20 computed`. `diff.ts`: **0 changed, 20 unchanged**, max distance 0.0000.

**3. Scorecard — PASS.** I1 20 not-exercised · I2 20 deferred · I3 13 pass/7 fail · I4 20 pass · I5
20 deferred. All 7 = `I3.foreground-accent-not-separated`, d 0.02685–0.05389 vs 0.07444.
Independent `scorePalette` spot-check (`verify/spotcheck-scorecard.ts`): `f39d397ba3` fail d=0.03996,
`d859a69094` fail d=0.04562, `2376a6b67d` all-pass — statuses and distances match exactly.

**4. Robustness — headline.** 600 trials, 0 errored, 274 s. Report:
`data/robustness/reports/p5-fieldfit.json`.

| arm | agreement | CI | n |
|---|---|---|---|
| overall | 37.7% | 33.9–41.6 | 226/600 |
| rendition-pair (pair set) | 23.5% | 18.2–29.8 | 47/200 |
| jpeg-q92 | 59.0% | 49.2–68.1 | 59/100 |
| jpeg-q85 | 43.0% | 33.7–52.8 | 43/100 |
| jpeg-q75 | 44.0% | 34.7–53.8 | 44/100 |
| dither-lsb1 | 33.0% | 24.6–42.7 | 33/100 |

Overfit ratio: perturbation **0.584×** (reviewed 33.0%, unseen 56.5%); rendition-pair 0.844×
(UNDERPOWERED, n=10). Below 1.0 = less stable on reviewed covers, not overfitting. Roles: bg 20.0%,
surface 21.5%, fg 30.2%, **accent 50.8%**.

**5. Adjudication — 0 W / 20 NO-SIGNAL / 0 L.** `verify/run-to-adjudication.ts`; 20 parsed, 0
refused. v2-3: 1 differed, 19 unseen. v3 era holds 0 entries.

**6. Dither falsifier (arm-f-r3 §7) — 4/5 PASS, 1 FAIL.** Positions re-derived independently,
cross-checked MATCH (0.00e+0) vs `readRamp`. FNV-1a, no `Math.random`, PNG, original raster verified
identical to JPEG.

| cover | outcome | Δendpoint | bars | amplification | |
|---|---|---|---|---|---|
| `0c4aab8aa7` | gradient | 2.42e-4 | 0.016 | 0.070 | PASS |
| `eaed77a9cb` | gradient | 1.01e-4 | 0.007 | 0.026 | PASS |
| `2376a6b67d` | two-block rescue | 1.94e-3 | 0.126 | 0.364 | PASS |
| `908479200b` | retreat | 5.05e-4 | 0.033 | 0.140 | PASS |
| `ca2eff2a4a` | flat, order 0 | 6.72e-2 | **4.38** | 1.061 | **FAIL** |

The FAIL is the criterion, not the fit: that cover is 92.6% exact `#000000`, and one LSB at black is
6.7205e-2 OKLab = **4.38 pooled bars** (`verify/lsb-scale-probe.ts`: 4.38 at level 0, 0.19 at 254).
The endpoint moved exactly one black-LSB — it tracked, amplifying nothing. `Δ < bar` is unreachable
near black for any algorithm. Restate §7 as an amplification ratio. Other σ̂=0 cover `c5ac790164`
passes (0.19 bars), so blackness, not σ̂=0, is the trigger.

**7. Spec conformance (code).** (a) mass-maximizing snap `snap.ts:233–259`; nearest only as empty-ball
fallback `:271–289`. (b) both ends via contract `sameColor`, `overlay.ts:432` + `:439`. (c) descending
mass, packed tie-break, `overlay.ts:223–225`. (d) `imagePath` only opens the file (`decode.ts:88`),
builds errors, echoes to metadata (`candidate.ts:321–323`) — no branch reads it. All PASS.

**8. Honesty.** `--check` stale (5322→5989 sites, 4600→5263 untagged) — **none of it P5**:
`SCAN_ROOTS = ["src","oracle"]` (cli.ts:36) never walks `prototypes/`, and P5's only commit touches 0
scanned files. Its 23 constants (`TUKEY_CUT_SIGMAS`, `NO_FIELD_EXPLAINED_FRACTION`, …) are invisible
to the instrument. Reported, not fixed.

---

**ISSUES-FOUND**

1. Falsifier fails 1/5 (`ca2eff2a4a`, 4.38 bars) — cause is OKLab's cube root near black,
   amplification 1.06; the §7 criterion is ill-posed, the fit is not unstable.
2. Robustness low: 37.7% overall, dither-lsb1 33.0%, pair-set 23.5%, accent unstable 50.8%.
3. Honesty instrument has zero coverage of `prototypes/`.
4. Pre-existing: 7× I3 fg/accent rows (recorded per decision 7); honesty staleness inherited.

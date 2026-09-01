# Phase 0 adversarial review — the output contract

**Scope.** `research/v3/src/contract/` (types, colour maths, invariants, `sameColorBar`, the
calibration script, all contract tests) against `PHASE_0_DECISIONS.md` §2–§3.
**Date:** 2026-08-03. **Method:** re-derive from raw data, never from analysis outputs; cross-check
against installed third-party references; mutation-test the suite; attempt to construct objects that
self-certify past each gate.

Everything below was executed. Nothing in the repository was created or modified except this file.
All scratch work lived in `/tmp/contract-audit` and `/tmp/mutaudit`.

Items already on `PHASE_0_LOOSE_ENDS.md` are not re-reported unless the finding is **worse than the
ledger states** — where that is the case it is said explicitly and the ledger row is named.

---

## Summary

The contract's **numerical core is sound**. The APCA reimplementation is byte-exact against
`apca-w3@0.1.9`, the OKLab conversion matches `colorjs.io@0.5.2` to 3.7e-8, the identical-colour
residue ceiling reproduces analytically and empirically, all four frozen regional bars plus the
pooled bar and the accent distance re-derive to five decimal places from the raw reviewer answers in
the warehouse, and invariant 4's two-layer fix withstood ten separate attempts to certify an
invisible pair past it.

What is weak is **the evidence around the numbers, not the numbers**: one tie-break presented as
measured is unreproducible and reverses on replication; one whole parameter scope named in §2 is
enforced nowhere; and the test suite, while it has genuine negative cases for every invariant,
pins almost none of the thresholds those cases are judged against.

**13 findings: 0 critical, 6 major, 7 minor.**

---

## What survived — audited and clean

These are stated because a review that only lists defects cannot be read as coverage.

### S1. APCA is byte-exact against `apca-w3@0.1.9`

`apcaLc` was compared to `APCAcontrast(sRGBtoY(t), sRGBtoY(b))` over **665,536 pairs**: the
exhaustive 256×256 grayscale grid, 400,000 uniform random pairs, and 200,000 near-identical pairs
(the region that actually matters). **Maximum absolute difference: 0. Sign disagreements: 0.**
`rgbToApcaY` vs the package's `sRGBtoY`: max difference 0 over 200,000 colours.

The two documented properties of `apcaRaw` also hold over the same sample:

- `|raw| < 10` ⟺ `apca-w3` reports `Lc == 0` — **0 violations in either direction**.
- Above the clip, `|raw| − |Lc| == 2.7` — max deviation **1.15e-14**, i.e. float noise. The
  `deltaYmin` early return can never fire above the clip, because at `b ≈ t` the residue is bounded
  by 1.98 (reverse branch) and 0.74 (normal branch).

The constants in `APCA_G4G` were read against the package's `SA98G` table line by line: identical.

### S2. OKLab matches `colorjs.io@0.5.2`

Max per-channel absolute difference **3.727e-8** over 60,000 random colours plus the full grayscale
axis plus the primaries and near-black edge cases — inside the 1e-6 the file claims. Worst case is
`#ffffff` (`L = 0.9999999934735462` against 1.0), which is the known cube-root round-off in
Ottosson's direct formulation, not an error. OKLab **distance** agrees to 1.375e-8. `okLabToRgb ∘
rgbToOkLab` is the identity on all 8-bit inputs: **0 round-trip failures over 100,000 colours**.

### S3. The identical-colour residue ceiling 1.98152 reproduces

- Analytic extremum `Y* = (0.62/0.65)^(1/0.03) = 0.20698764744318554`, giving
  `|raw| = 1.9815192469459217`. The constant 1.98152 is above it, so it is a true bound. ✔
- Empirical maximum over ~2.13M identical 8-bit pairs: **1.9815192469459155**, at `[247, 43, 0]`. ✔
- The verifier's counterexample to the old 1.9815 reproduces: `#df11de` on itself gives
  **1.9815192464730416** at `Y = 0.206980524179306`, which exceeds 1.9815. ✔
- The black soft clamp cannot reach `Y*`: it maps `[0, 0.022]` into `[0.00304, 0.022]`. ✔

Both epsilons (2.5) clear the ceiling, so a literally identical foreground/background pair is
always flagged. ✔

### S4. All six frozen calibration constants re-derive from raw data

Re-derived independently from `data/warehouse/warehouse.jsonl` (own OKLab from Ottosson's matrices,
own supersession resolution, own penalised-Newton logistic — no repository code imported):

| constant | frozen | re-derived | delta |
|---|---|---|---|
| dark-neutral | 0.00932 | 0.0093176 | −2e-6 |
| dark-saturated | 0.01502 | 0.0150241 | +4e-6 |
| light-neutral | 0.01627 | 0.0162701 | 0 |
| light-saturated | 0.02293 | 0.0229261 | −4e-6 |
| pooled (reference) | 0.01535 | 0.0153533 | +3e-6 |
| accent visibility | 0.07444 | 0.0744434 | 0 |

Every delta is five-decimal rounding. The 95% intervals reproduce to 5 dp as well. Supporting
checks that also came back clean:

- **Counts as claimed.** 60 + 80 = 140 same-colour items, 140/140 answered; 120 fitted (140 − 8
  identical controls − 12 direction probes); per region 28/28/28/36 with the stated round splits.
- **Region assignment is consistent.** `colorRegion()` applied to *both* members agrees with the
  fixture stratum for 120/120 pairs, and **zero calibration pairs straddle a boundary** — so the
  "which member decides the region" ambiguity is moot in this dataset, exactly as `color.ts:203`
  claims. Refitting under `colorRegion`-of-both is byte-identical.
- **No double-counting.** Four round-2 items carry superseding records (two of which flipped
  answer); all four collapse correctly to the later record. The 72 abandoned pre-clarification
  round-1 answers are cleanly excluded by batch id — and that exclusion is load-bearing: fitted on
  their own they give a pooled bar of 0.00420, 3.7× tighter.
- **Fits are honest.** All four regional fits and the pooled fit are non-separated and converged.
  Sweeping the ridge penalty 0 → 1e-2 moves every threshold by ≤1 in the fifth decimal; at ridge 0
  they are unchanged. A 2,000-resample nonparametric bootstrap brackets the delta-method intervals
  closely. Adding a 10% lapse rate moves thresholds by ≤3.3%.
- **Stated sub-findings check out.** Hue thirds 0.01516 / 0.02074 / 0.03805; direction probe 4/4,
  2/4, 1/4; the round-1-alone ordering swap (dark-saturated 0.01764 above light-neutral 0.01629) is
  real; repeat consistency 5/8 then 10/16 = 62.5%; all 8 identical controls and both part-2 controls
  passed.

The fitting method, for the record (`src/review-server/analyze-bracketing.ts:334-514`): two-parameter
logistic `P(same) = σ(b0 + b1·log d)`, penalised MLE with a ridge of 1e-3 on centred coefficients,
Newton with cost-halving line search, threshold at the p = 0.5 crossing `exp(−b0/b1)`. Under
separation the reported threshold is not the fit at all but `sqrt(lowEdge · highEdge)` — the
**geometric** midpoint of the gap (`:506`). That is why 0.07444 is `sqrt(0.06300 · 0.08796)` and not
the arithmetic 0.07548 a reader would compute from "the middle of the gap".

### S5. Invariant 4's two-layer fix holds

Ten constructed attacks, all blocked (`/tmp/contract-audit/i4-attack.ts`). Baseline hostile pair is
the verifier's own: `#5a5a5a` on `#002bff`, `|raw| = 0.699`, `Lc = 0`, OKLab distance 0.297.

| attack | result |
|---|---|
| declare `effectiveRawMagnitude: 0.0001` | I1 `contrast-floor-below-epsilon` **and** 2× I4 |
| declare exactly ε | 2× I4 |
| getter returning 2.5 to the schema and 0.0001 to I4 | both layers still fire |
| `roles.foreground` getter returning a legible colour to I1 and an invisible one to I4 | 2× I4 |
| `accentCollapsed: true` with equal hexes over an invisible pair | caught as the foreground |
| `effectiveRawMagnitude: Infinity` | I1 `contrast-effective-invalid` + 2× I4 |
| `contrast` block deleted entirely | I1 `contrast-missing` + 2× I4 (falls back to ε) |
| `validateContrastFloors` run **alone** on a self-certified palette | 2× I4 — sound in isolation, as documented |
| `validateSchema` run **alone** on the same | 2× `contrast-floor-below-epsilon` |
| 3M random palettes searched for a validating escape | none for the foreground clause |

The `max(declared, ε)` at `invariants.ts:684` and the schema rejection at `invariants.ts:410` are
genuinely independent, and each is sufficient on its own. The load-bearing subtlety at
`invariants.ts:665-666` — the accent exemption requires the flag *and* the hex equality it claims —
is correct and tested.

### S6. The accent floor's two conditions are conjunctive, as specified

`invariants.ts:696` (`if (Math.abs(raw) >= floor) continue`) then `:709-711` (`if (rescueAvailable &&
distance >= ACCENT_VISIBILITY_COLOR_DISTANCE) continue`). A violation therefore requires **both**
`|raw| < ε` and `distance < 0.07444`, which is what `PHASE_0_DECISIONS.md:96-97` specifies. The
rescue's direction is right (large distance ⇒ visible ⇒ no violation), it is confined to the accent
(`colorRescue: false` on both foreground rows, `:619-620`), and it is correctly disabled once the
caller raises the floor above ε (`floor <= epsilon`, `:710`) — which is a defensible reading of the
measurement's scope and is argued in the comment rather than assumed. Mutating the `&&` into `||`
is caught by two tests.

The 0.07444 provenance is exactly as `constants.ts:194-203` states: round 1 part 2, batch
`bracketing-round-1-clarified`, `accent-equal-luminance` stratum, 12/12 answered, 10 fitted points,
`separated: true`, separation interval 0.06300–0.08796. Verified against
`data/calibration/bracketing-round-1-analysis.json` `part2.fit`.

---

## Findings

### F1. MAJOR — CONFIRMED — the straddle rule's "measurably most stable" tie-break is unreproducible, and its conclusion reverses on replication

`src/contract/color.ts:216-232`.

The docstring justifies `Math.max` over the two regions' bars on two grounds. Ground 1 is a safety
argument and is sound. Ground 2 is presented as measurement and is what the file says settles it:

> **2. It is also, measurably, the most stable of the three.** Over 40,000 seeded close pairs
> (OKLab distance 0.002–0.035, of which 2.75% straddle a region boundary), perturbed by ±1 LSB on
> each channel […] | larger of two 0.205% / 0.0550% | midpoint colour 0.228% / 0.0619% | smaller of
> two 0.242% / 0.0600% | […] The margins are small, but they point the same way as the safety
> argument rather than against it, **which is what settles it**. Intuition said the midpoint would
> win […]; **it does not**.

**(a) The study exists nowhere in the repository.** `grep` for every digit in that table
(`0.205`, `0.228`, `0.242`, `0.0550`, `0.0619`, `1101`, `866`, `664`, `481`) across all `.ts`,
`.md` and `.json` under `research/v3` returns **only the comment itself**. There is no script, no
seed, no output file, no decision record. The `calibration-consequence` workstream has a related
but different study (`data/calibration-consequence/report.json`: 100,000 pairs from real artwork,
band 0.003–0.05, seed 2654435769) whose numbers do not match and which does not compare the three
straddle rules. `CONVENTIONS.md` requires every value to say where it comes from; this one cannot.

**(b) The ordering does not replicate.** I reimplemented the study across 4 dither protocols × 2
distance-recomputation modes × 2 seeds = 16 configurations (`/tmp/contract-audit/straddle2.ts`,
n = 40,000 each, same band 0.002–0.035, mulberry32 as the repo's own scripts use):

| claim | replicated in |
|---|---|
| bar-change ordering `larger < midpoint < smaller` | **1 of 16** configurations |
| verdict-flip ordering `larger < smaller < midpoint` | **0 of 16** configurations |
| straddle rate 2.75% | measured 4.20–4.40% throughout |

The modal outcome is the opposite of the documented one — **`midpoint` is the most stable rule**
(e.g. both-all-channels dither, bar-change L/M/S = 0.6125% / 0.3875% / 0.6725%; hold-distance-fixed
verdict flips 0.2100% / 0.1250% / 0.2350%). That is precisely the result the docstring says was
expected and did not happen.

**(c) The magnitudes are irreconcilable, which is the tell.** The recorded verdict-flip rate
(0.0550%) is *smaller* than the recorded bar-change rate (0.205%), so in the original protocol a
verdict flip must be a strict subset of bar changes — i.e. the pair distance was held fixed while
only the bar was recomputed. Under that protocol, in my replication, the ordering is
`midpoint < larger < smaller` at both seeds. No protocol I could construct produces the recorded
numbers.

**Why this is worse than the ledger.** `PHASE_0_LOOSE_ENDS.md` B13 says "the straddle rule is a
default with a reason, not a finding" — honest, and it stays true. But `color.ts` does not present
it that way: it presents a measured tie-break as the thing that settles the choice between three
candidate rules. That evidence cannot be re-checked and, on independent replication, points the
other way. **The rule may well be right on the safety argument alone; the sentence claiming
measurement should be struck or the study committed with its seed.** Nothing downstream is wrong
today — 0 of 140 calibration pairs straddle, and the rule only decides ~4% of close pairs — but a
future round would be reasoning from a fabricated-looking premise.

*Recommended owner:* contract workstream. *Cheapest fix:* commit the script + seed, or delete
ground 2 and let ground 1 carry the decision (it can).

### F2. MAJOR — CONFIRMED — `minTextContrast` against gradient stops is specified in §2 and enforced nowhere

`src/contract/invariants.ts:613-623`, `PHASE_0_DECISIONS.md:65-72`.

§2 defines the parameter as "`minTextContrast` (foreground vs background, surface, **and every
published stop**)". `CONTRACT_FLOOR_PAIRS` contains four entries and none involves a stop. A repo-wide
grep finds no other enforcement site.

**Constructed and confirmed passing** (`/tmp/contract-audit/i4-attack.ts`, case A11):

```
background #ffffff, surface #eeeeee, foreground #111111, accent #e0533a
gradient stops: #000000 @ 0.0, #ffffff @ 1.0
foreground vs stop[0]:  |raw APCA| = 1.1656   Lc = 0
validatePalette(...) -> { valid: true, violations: [] }
```

A palette whose text is invisible against half its own gradient publishes clean. Invariant 3 does
not catch it: `#111111` and `#000000` are 0.13 apart in OKLab, an order of magnitude above the
dark-neutral bar of 0.00932, so they are legitimately *distinct colours* — they are simply at zero
*luminance* contrast, which is the one thing invariant 4 exists to forbid.

**Why this is worse than the ledger.** `PHASE_0_LOOSE_ENDS.md` B15 parks the *gradient module's
indistinct-fraction shape* — "along a ramp the quantity is a fraction, not a pair contrast". That
reasoning holds for the ramp's interior. It does not hold at the **stops**, which are discrete
published colours where a pair contrast is exactly as well-defined as it is for `surface`. And
`PHASE_0_DECISIONS.md:148-150` claims invariant 3 subsumes "foreground-matches-a-stop ('white on
white')" — it subsumes it only when the colours are near-equal, which is the easy half. The
dangerous half, same luminance and different hue, falls through both invariants.

*Recommended owner:* contract workstream + reviewer (whether stops get pair contrast now or wait for
the gradient module). *Note:* the fix is two rows in `CONTRACT_FLOOR_PAIRS` if the answer is "now".

### F3. MAJOR — CONFIRMED — both epsilons and the accent distance are unpinned by the test suite over wide windows

`src/contract/constants.ts:172,188,212`; mutation evidence in `/tmp/mutaudit`.
Baseline suite: **98 tests, 98 pass, 0 skipped, 0 todo** — it genuinely passes.

| mutation | suite result |
|---|---|
| `EPSILON_ACCENT_RAW` 2.5 → **6.0** | **survives** |
| `EPSILON_ACCENT_RAW` 2.5 → **9.0** | **survives** |
| `EPSILON_TEXT_RAW` 2.5 → **2.4** | **survives** |
| `EPSILON_TEXT_RAW` 2.5 → **2.9** | **survives** |
| `ACCENT_VISIBILITY_COLOR_DISTANCE` 0.07444 → **0.06** | **survives** |

The only bounds actually asserted on the epsilons are structural: `> APCA_RAW_IDENTICAL_CEILING`
(1.98152) and `< APCA_RAW_LOW_CLIP` (10) — a 5× window inside which the entire zero-contrast floor
is free to move undetected. `EPSILON_TEXT_RAW → 2.0` is caught only because the fixture
`contrastFloorViolation` happens to sit at `|raw| = 2.31` (`fixtures.ts:332`); `→ 5.0` is caught
only by a test about a *different* clause. `ACCENT_VISIBILITY → 0.20` is caught only by an
unrelated text assertion. The accent distance's fixtures bracket it at 0.055 and 0.263 — 4.8× wide
— and nothing tests inside the reviewer's own interval.

Every test that names these constants compares them to themselves
(`contract-invariants.test.ts:430,447,533-534,595,625-626,635-636,645`;
`contract-color.test.ts:439,445-451`), so a change to a constant propagates into the expectation.

**Root cause** is mechanical and worth naming separately: `fixtures.ts:55`,
`DEFAULT_RESOLVED_CONTRAST = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)`. Every normally
built fixture's declared contrast block is manufactured by the code under test, so I1's
`contrast-floor-below-epsilon` and `contrast-floor-inconsistent` clauses can never fire on one, and
any epsilon edit moves all fixtures in lockstep. Partly compensated by two hand-built fixtures
(`fixtures.ts:414,431`) and two hard-coded pins (62.7 and 107.7), which do catch a ×2 mutation of
the resolver. No other fixture is laundered — `makePalette` derives collapse flags from the spec
independently, and the hex/rgb-mismatch fixture had to be hand-built.

This does not make the epsilons wrong. It means `PHASE_0_LOOSE_ENDS.md` **A3**'s planned
measurement will land with **no test able to tell whether it landed correctly**, which is worth
knowing before that work starts.

### F4. MAJOR — CONFIRMED — the accent visibility 95% interval is an artifact of an uncalibrated ridge penalty on a perfectly separated fit

`src/contract/constants.ts:197,203`; `PHASE_0_DECISIONS.md:95`;
`src/review-server/analyze-bracketing.ts:72,492-499`.

The ten accent points are perfectly separated (all six below 0.063 answered "no", all four above
0.08796 answered "yes"). `analyze-bracketing.ts` detects the separation, correctly substitutes the
geometric midpoint for the threshold — **and still emits a `confidenceInterval` computed from the
penalised curve**. Sweeping the penalty:

| ridge | slope | reported 95% CI |
|---|---|---|
| 1e-1 | 3.6 | 0.04096 – 0.12351 |
| 1e-2 | 8.2 | 0.05002 – 0.10845 |
| **1e-3** | **17.0** | **0.05211 – 0.10564** ← the quoted one |
| 1e-4 | 27.9 | 0.04444 – 0.12422 |
| 1e-5 | 39.7 | 0.02856 – 0.19355 |

The interval swings 2.4× in width, **non-monotonically**, and with the penalty removed the slope
diverges and the interval is unbounded. It is a property of `RIDGE_PENALTY`, not of the reviewer.

`constants.ts` quotes it as "95% CI 0.05211–0.10564" one sentence *before* explaining that the fit
cannot pin the threshold at all — so a reader takes the interval as measured. `PHASE_0_LOOSE_ENDS.md`
**B11** says the threshold is "bracketed, not pinned" and names the 0.06300–0.08796 band; it does
**not** say the quoted CI is meaningless, and the CI is the number that appears in
`PHASE_0_DECISIONS.md` §3. That is the part that is worse than documented.

*Fix:* strike the CI for this constant and quote the separation interval, and add a guard in
`analyze-bracketing.ts` so a separated fit does not report a confidence interval at all. (The
regional bars are unaffected — none of those fits is separated, and their intervals survived a
ridge sweep and a bootstrap.)

### F5. MAJOR — CONFIRMED — invariant 5 is silently skipped when no transparency report is supplied, and a test freezes that silence

`src/contract/invariants.ts:950` runs I5 only when `options.transparency !== undefined`. Unlike I2
(`:967-970`), it adds **nothing** to `deferred`. `tests/contract-invariants.test.ts:789-792` then
asserts the deferred list is *exactly* `["I2.source-support", "I2.spatial-spread"]` — actively
asserting that I5's non-execution goes unreported.

For an invariant whose whole statement is "transparent input refused **loudly**, never silently
flattened" (`PHASE_0_DECISIONS.md:170`), a caller that forgets the option gets `valid: true` with no
indication the check did not run. A corpus gate that omits the transparency report would report a
clean sweep.

Sub-point (minor): I5's negative case is a boolean passthrough — `assertOpaqueInput`
(`invariants.ts:894`) reads a caller-supplied flag, and the rejecting test passes a fixture that
literally sets `hasTransparentPixels: true`. The invariant is only as good as the decoder report,
which is outside this scope but worth stating.

### F6. MAJOR — CONFIRMED — the two central threshold comparisons' strictness is untested, and the mutants are reachable

`src/contract/invariants.ts:581` (`distance >= bar`) and `:696` (`Math.abs(raw) >= floor`) both
survive mutation to `>`. These are **not** equivalent mutants: with the `sameColorBar` override hook
(`invariants.ts:546`, which exists exactly so a future round can sweep the threshold),
`validateDistinctness(p, () => distance)` yields 0 violations while `() => distance + 1e-12` yields
1. "Distinct **above** the bar" is a semantic claim in §4, there is a ready-made hook to test it at
the boundary, and no test uses it that way.

### F7. MINOR — CONFIRMED — `PHASE_0_DECISIONS.md` §3's "156 fitted answers" is wrong

`PHASE_0_DECISIONS.md:84`. 156 = 72 + 84, the raw count of `oracle-label` records in the warehouse
for the two batches. It (a) includes the 4 superseded round-2 records the analysis correctly
discards, (b) includes 8 identical controls and 12 direction probes that are never fitted, and
(c) excludes the 12 accent labels. The defensible numbers are **152 unique answers, 130 fitted
points (120 same-colour + 10 accent), 140 same-colour items answered** — none of which is 156.

`constants.ts:78` ("140 of 140 pairs answered") and `constants.ts:139` ("120 fitted points") are
both correct and mutually consistent. Only §3's prose figure is wrong, and no frozen digit depends
on it.

### F8. MINOR — CONFIRMED — 24 of the 120 fitted points are literal duplicate stimuli counted as independent

Every `repeat` item carries byte-identical `first`/`second` RGB to its `repeatOf` (verified 8/8 in
round 1, 16/16 in round 2), 6 per region. So each region's `n = 28` is **22 distinct pairs shown 28
times** (light-saturated: 30 distinct, 36 trials), while the table in `constants.ts:82-85` reads as
28 pairs. Refitting on distinct pairs only:

| region | frozen | repeats dropped | move |
|---|---|---|---|
| dark-neutral | 0.00932 | 0.01061 | **+13.8%** |
| light-neutral | 0.01627 | 0.01451 | **−10.8%** |
| dark-saturated | 0.01502 | 0.01482 | −1.3% |
| light-saturated | 0.02293 | 0.02161 | −5.8% |
| pooled | 0.01535 | 0.01520 | −1.0% |

Both moves stay inside the published intervals, so this is **not a refutation** of the freeze. It is
a statement about resolution: two of the four frozen digits move by more than 10% under a defensible
alternative weighting, so the five-decimal freeze carries roughly one significant figure of real
information. That is consistent with the file's own 62.5% repeat-consistency ceiling and with the
8-bit quantisation floor it already documents — but the `n` column should say "trials", not read as
distinct pairs.

### F9. MINOR — CONFIRMED — `constants.ts`'s floating-point rationale is factually false

`src/contract/constants.ts:280-282` justifies writing `APCA_RAW_LOW_CLIP` as a literal:

> Written as a literal rather than as the product because `0.1 * 100` is 10.000000000000002 in
> binary floating point, and this value is a *threshold*.

In IEEE-754 double arithmetic `0.1 * 100 === 10` **exactly** (verified). The real instance of the
hazard is the *other* constant: `(0.1 - 0.027) * 100 === 7.300000000000001 !== 7.3`, which is
`LC_DEAD_BAND_CEILING` at `:295` — and that comment merely says "for the same floating-point reason",
inheriting a rationale that is wrong for the constant it was written about and right only for the
one that borrows it. `0.027 * 100 === 2.7` exactly, so `APCA_LC_TO_RAW_OFFSET` is in the same
position as the low clip.

Both constants have correct values, so nothing is broken. The test that is supposed to make the
provenance "checked rather than merely claimed" (`contract-color.test.ts:457-458`) compares with a
1e-9 tolerance and therefore cannot distinguish the two cases either.

### F10. MINOR — CONFIRMED — `apcaRaw` does not return `NaN` for out-of-range inputs, contrary to its docstring

`src/contract/color.ts:293-294` states:

> Returns `NaN` for inputs APCA considers out of range, so a caller cannot mistake an error for a
> zero. (`apca-w3` returns 0.0 there, which would read as "invisible" to invariant 4.)

The implementation (`:299`) checks only `Number.isFinite`, not the package's `icp = [0.0, 1.1]`
input clamp that `apcaLc` does replicate at `:321-324`. Measured:

```
apcaRaw([300,300,300], [0,0,0]) = -141.7723229488855   (apcaLc = 0)
apcaRaw([1.5,0,0],     [0,0,0]) = -0.6005965846109822
apcaRaw([-1,0,0],      [0,0,0]) = NaN                  (negative base only)
```

The low end returns `NaN` incidentally, because a negative base with a fractional exponent is `NaN`
in JavaScript — not because of a range check. The high end returns a large finite value.

**Not exploitable today**: every I4 call site is gated by `isRgb8` on both colours
(`invariants.ts:673`), and I1 independently rejects a non-8-bit triple. The failure is that the
docstring's stated safety property is not the one implemented, so a future caller reaching for
`apcaRaw` directly — which is the whole reason it is exported — inherits a guarantee that is not
there. Note the direction is unsafe: an out-of-range pair yields a *large* raw magnitude, which
passes invariant 4, while `apcaLc` reports 0.

### F11. MINOR — CONFIRMED — `colorRegion` boundary inclusivity is untested (equivalent mutants today)

`src/contract/color.ts:188-189`. Both `<` → `<=` mutations survive the whole suite. Verified
exhaustively enough to be safe: no 8-bit sRGB colour lands on either boundary (closest
`|L − 0.55| = 8.7e-8`; zero exact hits on `L == 0.55` or `chroma == 0.05`), so there is no blast
radius today. But the documented rule — "below the lightness boundary is dark, below the chroma
boundary is neutral" (`constants.ts:64-65`) — is asserted nowhere;
`contract-color.test.ts:183-184` pins only the boundary *values*. If the ruler ever gains a
dimension (B9) or the boundaries move, nothing holds the convention.

### F12. MINOR — CONFIRMED — the two `*-analysis.json` files are stale snapshots that can no longer be re-verified field-for-field

`data/calibration/bracketing-round-1-analysis.json`, `bracketing-round-2-analysis.json`. Their
`skipped` counters no longer reproduce against the current warehouse: round 1 records
`otherBatch: 62, otherLabelSchema: 0` where re-running today yields `156 / 475`; round 2 records
`32 / 134` where today yields `475 / 144`. This is warehouse growth after 2026-08-03T10:15, not a
defect — **every fit still reproduces exactly**, so nothing added since touches these rounds. The
gap is that nothing in the repo pins the warehouse state these files were generated against, so
"re-run and diff" is not available as a verification for them. A recorded input record count or
warehouse hash in the analysis header would close it.

### F13. MINOR — the historical calibration script buckets by CIELab, using the same region names as the OKLab contract

`src/contract/calibration/same-color-bar-translation.ts:226` assigns
`` `${lightness < 50 ? "dark" : "light"}/${chroma < 20 ? "neutral" : "saturated"}` `` from **CIELab**
L and chroma — deliberately, since the whole script lives in the ΔE world it is translating from.
But the resulting labels are the same four words as `COLOR_REGIONS`, whose boundaries are OKLab
`L < 0.55` / `C < 0.05`, and the script prints its quadrant table directly above the frozen
`SAME_COLOR_BAR_BY_REGION` values in the same output. The two quadrant systems are not the same
partition. The file is correctly and prominently marked historical/superseded, so this is a
presentation hazard rather than a defect; a one-word prefix on the bucket key (`cielab-dark/...`)
would remove it.

---

## Method notes and reproduction

All scratch code is outside the repository and can be re-run:

- `/tmp/contract-audit/apca-check.ts` — APCA and OKLab cross-checks (S1, S2, S3, F9, F10).
- `/tmp/contract-audit/i4-attack.ts` — the ten I4 self-certification attacks and the corpus search
  (S5, S6, F2).
- `/tmp/contract-audit/straddle.ts`, `straddle2.ts` — the straddle-rule replication (F1).
- `/tmp/mutaudit/` — the mutation-tested copy of `src/contract/` and both test files (F3, F5, F6,
  F11).

Run with `node --experimental-strip-types <file>` from a directory with `node_modules` symlinked to
the repository root's. No GPU work was performed. No Python was needed.

**On the mutation table**, for the record — these defects **were** caught, which is the other half
of the evidence: `sameColorBar` `max`→`min` (2 tests); `dark-neutral` bar 0.00932→0.0200 (4);
`ACCENT_VISIBILITY`→0.5 (3); `EPSILON_ACCENT_RAW`→0.5 (5); the accent clause's `AND`→`OR` (2);
dropping `max(declared, ε)` in I4 (1); dropping I1's below-epsilon rejection (1); both together (2);
`REGION_LIGHTNESS_BOUNDARY` 0.55→0.62 (3); `REGION_CHROMA_BOUNDARY` 0.05→0.10 (2);
`MAX_GRADIENT_STOPS` 4→6 (1); `CONTRAST_FLOOR_TOLERANCE` 1e-9→1e9 (1); `SOURCE_POPULATION_FLOOR`
0.001→0.01 (1); removing `softClampBlack` from `apcaRaw` (1); inflating `apcaRaw` ×1.5 *only inside
the Lc dead band* (13); `APCA_G4G.revTXT` 0.62→0.63 (4); `blkThrs` 0.022→0.030; adding
`roles.foreground` to `STOP_EXEMPT_ROLE_PATHS` (1); doubling `resolveContrastParameters` (1);
disabling the hex/rgb agreement check (1).

Negative-case coverage per invariant is **complete and not strawmanned**: I1 has eight semantic
violators including both directions of collapse-flag inconsistency; I2 distinguishes absent /
one-LSB-away / present-but-below-floor / lying-size; I3 has the hard near-identical-but-unequal
collapse case, the invisible accent, foreground-matches-stop, *and* the negative assertion that the
exempt background is not reported; I4 has the isoluminant self-certification bypass, the lying
collapse flag, and both-dimensions-undershot; I5 has both the throwing and the reporting form. The
suite's weakness is not missing negatives — it is that the thresholds those negatives are judged
against are asserted against themselves (F3).

The external cross-checks are real, not stubbed: `apca-w3@0.1.9` and `colorjs.io@0.5.2` are
version-pinned dependencies imported directly at `contract-color.test.ts:17-18`; `vendor.d.ts`
supplies types only. The grid is 580 colours giving 48,140 APCA pairs at 1e-9. **One caveat worth
recording:** the *raw* pre-clamp value has no external reference (the package does not export it).
Above the clip it is pinned by the raw↔Lc relation; inside the dead band — `|raw| ∈ (1.98, 10)`,
which is exactly where both epsilons live and where invariant 4 does all its work — it is pinned
only by the single analytic identical-colour bound. That bound is real and does bite (a 1.5×
inflation confined to the dead band fails 13 tests), but it is one derivation, not an independent
implementation.

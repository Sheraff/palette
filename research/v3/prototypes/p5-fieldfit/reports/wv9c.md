# W-V9c — the gate check failed on its own anchor. Gate not wired; snap shipped.

`ALGORITHM_VERSION = "p5-fieldfit-0.9.1"`. **0 of 31 covers move vs v0.9.0.** Owned files only; no
`types.ts` change needed (`wv9c-types.md`).

## 1. Fractions, measured before wiring — the stop condition fired

At the family-merge radius the ruling names (1× bar), `v9c-coherence-prewire.json`:

| entry | px | massFrac | 1× | median | asked |
|---|---|---|---|---|---|
| `a8942d6547` mark `#39367d` | 328009 | .801 | **.0009** | .0002 | fail — **does** |
| `9646be9b20` region `#7f7ca7` | 343108 | .783 | **.0012** | .0011 | fail — **does** |
| **NARCOSIS `#8d2639`** | 41179 | .101 | **.0589** | .0203 | survive — **does not** |

Corpus: **64 of 102** contributing entries fall below 0.5. The crimson is a scrub (26056 triples over
41179 px); one bar cannot separate it from a blend median. So I stopped: gate **not wired**, both
regression pins stand, `identityFamiliesV2` is v0.9.0's.

## 2. The separating radius — `[5, 10]` bars, containing 8

`v9c-radius-sweep.json`, 18 rungs, 31 covers:

| × | 1 | 4 | **5** | 8 | **10** | 11 |
|---|---|---|---|---|---|---|
| crimson | .059 | .452 | **.532** | .712 | .787 | .827 |
| `#39367d` | .001 | .014 | .024 | .274 | **.473** | .534 |
| `#7f7ca7` | .001 | .039 | .067 | .250 | **.427** | .508 |

8 is `ACCENT_FG_EXCLUSION_MULTIPLE`, and `IDENTITY_FAMILY_BAR_MULTIPLE`'s documented alternative — but a
gate radius ≠ the family radius becomes a constant with its own bracket (`COMPONENT_CORE_FRACTION`'s
precedent). **Yours to rule**; env-gated, off, measured.

**At 8× (`v9c-gate-8.json`) 3 of 31 move**: `a8942d6547` → `#009cff`, byte-identical to v0.8.2
(restoration 1); `16a8247378` `#746045`→`#736e6a` (R3 *acceptable*, standing accent note); `21256ce593`
(unreviewed). NARCOSIS and all three round-4 silent STRONGs hold. At 5× two more move, one a round-3
**foreground** — 8–10 is the clean part.

**Restoration 2 fails at every radius.** `9646be9b20`'s region *is* withheld (coverage 3→2) but the
accent stays `#7f7ca7`: this is not a *pool* gate (arm-f §2.4), so chroma-first still ranks .0648 over
`#000000`. That needs a pool gate. **R4's identity ask stays open**, said in the test.

## 3. Snap — shipped, exact, 2.8×

One pool per call replaces a grid query per candidate, plus a squared-distance prefilter around the one
`Math.hypot` comparison (ε=1e-9; `hypot` skipped only where it cannot disagree; masses are integer sums,
so reordering is exact). 3000²: snap **5.0→1.8 s** (`4130886c02`), 3.2→1.1 (NARCOSIS); `readMarks`
**9.4→6.2 s** and 7.8→5.9 s, against wv9b's 9.3–13.8 s. **Byte-identical, 0/31, ×4 sets.**

## 4. Tests and runs

**120/120** (112 + 8), nothing relaxed: snap vs a transcribed v0.9.0 loop, off-triple and ulp-boundary
radii; coherence flat-passes / blend-fails / dither-idempotent / not-a-pool-gate; two real-cover
anchors pinning the fractions and the bracket. Scorecard ×4: **0 fail, 0 refused**. `tsc --strict`:
5 pre-existing errors, none owned. Anchors diagnosed: `v9c-diagnose-*.json`.

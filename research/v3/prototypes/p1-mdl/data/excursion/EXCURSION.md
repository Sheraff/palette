# Excursion probe — A′'s three emitted 2-stop ramps (`DESIGN.md` item 13, corrected reading)

`node --experimental-strip-types prototypes/p1-mdl/data/excursion/probe.ts` from `research/v3`.
Rows: `data/emitter/aprime-demo-20-2026-08-05.jsonl`, `kind=p1-emitter-row`, gradient non-null.
Per-sample record in `results.json`; double-run byte-identical (sha256 `d9f2cdd5…`).

**Interpolator.** `src/contract/ramp.ts:rampColorAt` — the contract's *own* rendered-ramp function
(componentwise-linear OKLab, then `okLabToRgb`'s 8-bit quantisation), so this probe and the
whole-ramp APCA floors read one curve. 64 samples at `t = i/63`. **Off-artwork, stated plainly:** a
sample is OFF-ARTWORK when `min_c d_OKLab(sample,c)/h(sample,c) > 1` over the exact image triples
`c`, `h` the pair bar (`src/measure/kernel.ts:pairBandwidth`, the frozen regional same-colour bar; no
digit written here). Density is `src/measure/smoothed-mass.ts` evaluated at the sample point — same
kernel, truncation and pair bandwidth.

## The three ramps

| # | image | stops | max dist | mean dist | max bar-ratio | off /64 | span | min density |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `00007e97…` | `#a4140c → #e0e4e5` | 0.00991 | 0.00466 | **0.598** | 0/64 | — | 1.01e-3 |
| 5 | `ab67616d…0bbc` | `#435df0 → #1016f0` | 0.00463 | 0.00213 | **0.308** | 0/64 | — | 3.34e-3 |
| 12 | `ab67616d…18e9` | `#d9e2e1 → #70ba27` | 0.01894 | 0.00824 | **0.829** | 0/64 | — | 1.13e-3 |

**Verdict, all three: ON-ARTWORK CLEAN.** No sample on any line leaves its own regional same-colour
bar. The corpus's worst point (ramp 12, white→green) sits at 83% of its bar — inside, with margin —
and its smoothed density there is 1.1e-3 of the image, not a void. Item 13's favourable reading of
"all three are 2-stop, the winning shape" therefore stands: the condition the reviewer's
clarification attached to it is satisfied, measured rather than assumed.

## The control: would the energy have bought a repairing stop?

Zero off-artwork samples means step 3 has no trigger, so the same machinery ran as a **control** at
each ramp's worst sample — top-50 triples by smoothed mass within 2 pair bars of the path *at that
position*, each inserted as one interior stop on the 1/256 grid `STOP_POSITION_BITS` prices, each
through `feasibility()` with image facts and `energyOfAPrime(…, {lambda: 1})`. An interior stop costs
32 bits of L(P). All 150 candidates were contract-feasible.

| # | worst t | best feasible 3-stop | ΔE (bits) | negatives | max dist after |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.160 | `#b82f25` | **+64.5** | 0/50 | 0.00813 |
| 5 | 0.523 | `#2832ec` | **+48.2** | 0/50 | 0.00294 |
| 12 | 0.176 | `#cdecc2` | **−212.6** | **50/50** | 0.00825 (from 0.01894) |

Ramps 0 and 5: the energy refuses the stop, as it should on a clean line. **Ramp 12 is a finding.**
All fifty candidate stops are feasible and *cheaper* than what was published — the best by 212.6 bits
at λ=1, 6.6× the 32-bit stop charge — and it more than halves the line's worst distance-to-artwork.
The emitter published the 2-stop anyway. Attribution from the run's own `searchScale`: rows 0 and 5
ran at grammar level `ramp-2`, where a 3-stop is **not in the reachable configuration space at all**;
row 12 ran at `ramp-3` but with 8 coarse representatives at a cell side of ~99 bars, so `#cdecc2` was
never a lattice point. Budget-forced coarsening, `UNCERTIFIED-V0`.

This is **not** the resolution defect item 13 pre-registered — the joints refused no stop an
excursion demanded, because there is no excursion. It is its mirror, and two things follow, recorded
not acted on. **A search-coverage gap, not a pricing gap:** the energy's ranking is fine, the
reachable slice is too small — exactly what `UNCERTIFIED-V0` promises can happen, now with a measured
magnitude on a live emitted palette. **A λ datum pointing against item 13's stop-count evidence:**
the reviewer's pairwise round preferred 2-stop ramps and named banding on every 4-stop one, but at
λ=1 a 32-bit stop is nothing against a 990,968-bit likelihood, so a fully-reaching search would buy
interior stops freely on ramps like 12. Read the λ sweep for stop count, not only for
gradient-vs-flat, against this number.

Deviations: (a) step 3 ran as a labelled control on all three ramps rather than only off-artwork
ones, since none were, and item 13's second half would otherwise go untested; (b) candidates are
drawn within 2 bars of the path *at the repair position*, not of the whole path — the whole-path form
returns the two field colours by mass, every one of which fails `I3.pair-not-distinct` (measured).

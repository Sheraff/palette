# P6 build spec — module boundaries and worker rules

Authored by the P6 orchestrator. Workers implement; this file and `src/types.ts` are the contract
between them. Read `../../phase-1/proposals/arm-e-prime.md` (the mechanism, normative for intent)
and `../../PHASE_1_AUTHOR_BRIEF.md` §3.1 (the constraint sheet, normative for the output) first.

## Module ownership (disjoint; nobody edits another's paths or `src/types.ts`)

| module | owner | delivers |
|---|---|---|
| `src/substrate/` | W1 | decode (sharp, header dimensions), transparency refusal, exact sRGB→linear 256-table →OKLab planes, full-res Gaussian blur ladder (geometric, ~short-edge/2 down to ~/64, no decimation), per-scale displacement (ΔL, ΔC, ΔH), field-likeness weight per pixel |
| `src/lattice/` | W2 | distinct-triple enumeration (2^24 bitset); trilinear splat of accumulator channels onto ~48³ OKLab lattice; one separable Gaussian convolution at bandwidth h; trilinear reads; candidate statistics M, G, E_L, E_C, habitual ground B, spatial spread, border affinity |
| `src/fieldmodel/` | W3 | field mass Φ; 0-D vs 1-D description-length fit with spatial monotonicity regression; orientation (top-left mass = background per 135° ruling); excursion profile along OKLab ramp; interior-stop insertion (excursion reduction only); 4th stop reported-not-published |
| `src/energy/` | W4 | unary terms (belonging, role fitness, representativeness), contract barriers (distinctness at `sameColorBar`, APCA contrast over rendered ramp, fg–accent separation), coverage transport term, collapse-as-move, escape-on-infeasibility, branch-and-bound with admissible bounds, declared tie-break; `src/candidate.ts` (devloop `CandidateModule`, id `p6-figureground-0.1.0`) |

Interfaces between modules are exactly those in `src/types.ts`. If an interface is wrong, report
it; do not change it unilaterally — the orchestrator amends it for everyone.

## Rules binding every worker

1. **Determinism.** No `Date.now`, no `Math.random`, fixed reduction order, declared tie-break
   (total order on 8-bit triple) reachable only on exact ties. Same file ⇒ byte-identical palette.
2. **Reuse the contract.** Colour conversions, `sameColorBar`, APCA, `Palette` types come from
   `../../src/contract/` (read-only). Do not fork a conversion; drift between vocabularies is a bug.
3. **Every published colour is an exact artwork pixel** (invariant 2). The lattice is quadrature —
   any code path that publishes a lattice cell or a mean instead of a source triple is a defect.
4. **Constants carry provenance tags** in doc comments (`[REVIEWED]|[MEASURED]|[FITTED]|[n=1]|
   [INHERITED]|[UNCALIBRATED]|[HELD]` + origin line). Exchange rates live ONLY in
   `src/energy/rates.ts` as one named registry — nowhere else, no inline weights anywhere.
5. **No models, no tables, no precomputed anything at runtime.** One file, cold.
6. **Workers never commit.** Leave the tree dirty; the orchestrator reviews and commits.
7. **Report format:** final message is data — file list, exported symbols, test names + pass/fail
   counts, measured timings on a 1000×1000 image, open items. ≤300 words. State every deviation
   from this spec explicitly; an undisclosed deviation is the campaign's worst failure mode.
8. Own your tests under `tests/<module>.test.ts` (node --test, strip-types, same conventions as
   `../../tests/`). Numeric code gets a naive reference implementation in the test re-deriving a
   few values independently.

## Integration order

Wave 1: W1–W4 in parallel against `types.ts` (W4 may stub upstream modules behind the interfaces).
Wave 2 (separate workers): integration + end-to-end contract-valid palette on `demo-20`;
independent verifier re-deriving W4's bound admissibility by brute force on small synthetic
images; `tools/sensitivity.ts`. Nothing in wave 2 starts until wave 1 reports.

## Performance envelope

Proposal §5 prices 1000×1000 at ≈0.4 s single-threaded. Treat >2 s at that size as a defect to
report (the reviewer's seconds-scale band owes justifications we have not earned). Typed arrays
throughout; no per-pixel allocation in hot loops.

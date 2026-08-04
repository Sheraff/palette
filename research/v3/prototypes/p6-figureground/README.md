# P6 — one continuous joint figure–ground measure

Phase 2 prototype of the mechanism in `research/v3/phase-1/proposals/arm-e-prime.md`: the image
becomes one continuous object — the joint measure over (pixel colour, surround-at-scale, position) —
and all four roles, the gradient boolean and the stops are read out as the single constrained
minimiser of one energy over the artwork's own distinct triples. Quantise exactly once, at the
final argmin. No clustering, no candidate wall, no per-role stage.

**Prior-art standing (`PRIOR_ART_CHECK.md` §P6):** the substrate (blur-ladder surround, habitual
ground, quantise-once) is unprecedented; the objective shape (multi-term energy with free exchange
rates) is this repository's most-relapsed failure. The author's defence: prior failures ranged over
quantised near-tied bins; this is continuous. That defence is falsifiable and the exchange rates
are the designated falsifier for this prototype.

## Pre-registered falsifiers — recorded 2026-08-04, before any harness data existed

These are copied from the proposal (§7) and the Phase 2 handoff *before* the first robustness or
sensitivity run. Bars do not move after seeing data.

1. **Paradigm falsifier (robustness).** On the robustness harness:
   **dither-lsb1 agreement ≥ 0.98** and **jpeg-q92 agreement ≥ 0.95** on the regional bar.
   Below that at rates comparable to the incumbent's, the premise (instability lives in early
   quantisation) is wrong.
2. **Completeness falsifier (reachability).** If adjudication reachability ever reports the pruned
   search excluded a reviewer-endorsed role colour, the admissible-bound argument has a hole.
3. **Exchange-rate falsifier (the designated one).** Every exchange rate is either derived from a
   stated principle (and provenance-tagged so) or measured for output sensitivity by
   `tools/sensitivity.ts`: perturb each free rate by ×½ and ×2, run over the sensitivity set,
   report the fraction of images whose published palette moves beyond the regional same-colour bar.
   *Pre-registered reporting convention (not a gate — the reviewer judges):* a free rate whose ×2
   or ×½ perturbation moves >25% of palettes beyond the bar, while carrying no principled
   derivation, is reported as **load-bearing-without-principle**. If the mechanism's palettes rest
   materially on such rates, that is the mechanism failing its own defence and is reported as
   MECHANISM-FALSIFIED with the curves — not tuned away. The full sensitivity curves are always
   reported alongside the convention, and the anchored quadrature parameters (bandwidth h, lattice
   resolution) are perturbed identically as the comparison class: quadrature choices should be
   flat; if a quadrature knob moves palettes, the design has been violated (proposal §3).

**Standing prohibitions:** no exchange rate is ever tuned against adjudication wins, the demo set,
or reviewer feedback — that is the documented relapse itself. If it starts happening it is flagged
as such in the next report.

## Free parameters (proposal §4) — provenance ledger

| # | parameter | status | anchor |
|---|---|---|---|
| 1 | neighbourhood bandwidth `h` | `[MEASURED]`-checkable | endorsed colours' 1.91e-2 neighbourhood share |
| 2 | scale-ladder extent (2 digits) | `[HELD]` | geometry; checkable vs oracle `ground_type`/`text_dominance` |
| 3 | belonging↔role-fitness rate | `[UNCALIBRATED]` **free rate** | sensitivity-measured; review round candidate |
| 4 | coverage weight | `[UNCALIBRATED]` **free rate** | sensitivity-measured |
| 5 | accent L/C anisotropy magnitude | `[UNCALIBRATED]` | perception-4 gives direction only; ships uncalibrated |
| 6 | field-model DL exchange rate | `[UNCALIBRATED]` **free rate** | sensitivity-measured |
| 7 | collapse cost | `[UNCALIBRATED]` **free rate** | sensitivity-measured |
| 7b | border-annulus width | `[HELD]` | claimed part of #2; charged separately if audited |
| 7c | field hypotheses carried | `[HELD]` | cost/optimality trade; arguable to convergence |

Inherited, not ours: regional same-colour bar, contrast ε floors, `ACCENT_FUNCTIONAL_DISTANCE`,
foreground–accent separation, excursion multiplier, stop maximum — all read from `src/contract`.

## Layout

- `SPEC.md` — module boundaries, worker ownership, determinism rules.
- `src/types.ts` — shared interfaces (orchestrator-authored; workers do not edit).
- `src/substrate/` `src/lattice/` `src/fieldmodel/` `src/energy/` — the four modules.
- `src/candidate.ts` — devloop `CandidateModule` wiring.
- `tools/sensitivity.ts` — the exchange-rate falsification harness.
- `tests/` — per-module tests plus the independent verifier's re-derivations.

# λ recalibration — probe read and v1 operating point (2026-08-05)

Grid: 6 stratified demo-20 covers × λ_A ∈ {0.05, 0.1, 0.25, 0.5, 1} × budget {60 s, 240 s} for
arm A, plus A′ at λ=1 × both budgets. 72/72 cells, `results.json` (probe authored by worker,
executed by orchestrator after the worker died pre-run).

## The two splits

1. **λ-priced degeneracy: CONFIRMED as the dominant cause.** At λ=1 arm A publishes 2 roles on
   11/12 cells (reproducing v0's 20/20 collapse). Structure appears monotonically as λ drops:
   λ=0.25 mixed (2–4 roles), λ=0.1 structure on 4/6 covers, λ=0.05 similar to 0.1.
2. **Budget: real but secondary, and BIDIRECTIONAL.** 4× budget changes the winner on ~1/3 of
   cells — sometimes adding structure (0ee5a621 3→4), sometimes REMOVING it (18e9b0ec 3→2 at
   λ≤0.5; 0bb3dc49 3→2 at λ≤0.1): under-search had been *adding* spurious structure. The truer
   optima at 4× still collapse 2/6 covers at every λ down to 0.05 — recorded as an arm-A data-
   term property (the mixture explains much without extra names), NOT λ-fixable, out of v1 scope.

## Operating point for the v1 re-emission (picked and stated)

- **λ_A = 0.1** `[MEASURED]` — anchor: the round demanded structure on structured artwork
  (item 2: a 4-colour artwork described with 2), and 0.1 is the largest probed λ giving
  structure on 4/6 covers at the honest (4×) budget while the flat-tending covers still
  collapse. λ=0.05 buys nothing further.
- **A′ λ = 1.0 unchanged** — its repair is the chromatic residual (0.2.0); the item-2 fixture
  passes at λ=1. One knob per arm per iteration.
- **Budget 240 s/image for the re-emission, both arms** `[DISCLOSED]` — a compute knob, not a
  mechanism change; chosen because 1× budget demonstrably reports spurious structure in both
  directions. Header records it.

## Watch item carried forward

A′ at 4× bought a 3-stop gradient on 22e7e9d1 (v0 energy) — the excursion probe's stop-buying
propensity materializing. The DESIGN 13 reading rule applies to the re-emission: check stop
counts and spacings before staging.

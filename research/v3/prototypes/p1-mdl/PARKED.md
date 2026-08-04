# PARKED — reviewer-ordered pause, 2026-08-04

## Current state
- Branch `proto/p1-mdl` at `a4b5de6`, all landed work committed and signed (G):
  measurement layer, contract adapter, both energies (arm A nats / arm A′ bits), three
  independent verifier suites (all arithmetic bit-exact), truncation fix, DESIGN decisions 1–9,
  first-round reviewer evidence folded (DESIGN "Reviewer evidence" section).
- Test state: full prototype suite green (measure 34, emit+verify-emit 42, energy-a 9,
  energy-aprime 11).
- Owed-commits ledger: empty. Vault was working at last commit.

## Mid-flight (one worker, unattended)
- **M1 falsifier worker** (scores 458 convertible legacy entries with both energies,
  λ ∈ {¼,½,1,2,4}, paired 22-artwork comparisons via src/stats, degeneracy-stratified;
  writes `data/falsifier/m1-results.json` + `m1-summary.json` + `src/falsifier/` + tests).
  Per pause order: allowed to finish writing to disk; its output will NOT be read or acted on
  until RESUME. Its completion notification, if it arrives during the pause, is noted and
  ignored.

## Exact next actions on RESUME, in order
1. Read the falsifier worker's report + `data/falsifier/m1-summary.json`; commit its files
   (signed, pathspec `src/falsifier tests/falsifier data/falsifier`).
2. Read M1 against the pre-registered DESIGN reading (endorsed < known-bad paired wins, both
   strata, λ-sweep vs the gradient-on-flat anchor). Report M1 data upward (§7 protocol).
3. Dispatch the arm-A ink-support fix worker (DESIGN decision 9: broad ink must pay, in arm A's
   vocabulary; also restate MIXTURE_WEIGHT_FLOOR honestly). Then re-run falsifier for arm A.
4. Proceed to M2 emitter brief (requirements already in DESIGN: contract floors as written,
   min-|APCA|-over-ramp report-only diagnostic, sibling-collapse machinery, both candidateIds).

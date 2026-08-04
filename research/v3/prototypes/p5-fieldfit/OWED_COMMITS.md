# Owed commits — p5-fieldfit (vault locked, signing blocked campaign-wide)

Ruling from main orchestrator 2026-08-04: continue working uncommitted; commit this backlog, in
order, when the vault-unlocked signal arrives. All commits: signed (`-S`), explicit pathspec
`-- research/v3/prototypes/p5-fieldfit`, on branch `proto/p5-fieldfit`.

## 1 — wave-1 checkpoint (attempted twice, signing failed both times)

Pathspec: `research/v3/prototypes/p5-fieldfit` (state as of wave-1 completion; superseded by the
working tree — commit whatever is current at unlock time as a single commit if intermediate states
are no longer separable).

Intended message:

    p5-fieldfit: spec, frozen interfaces, wave-1 modules (decode/inventory/snap, IRLS field fit,
    ramp/excursion/stops, overlay roles) with synthetic self-tests

    Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

## 2 — integration + rulings (pending W-INTEG fix pass completion)

Pathspec: `research/v3/prototypes/p5-fieldfit`

Intended message:

    p5-fieldfit: candidate assembly, diagnose CLI, scorecard runner; rulings — fg feasibility vs
    published ends, 0.07444 not adopted, noField = inlier fraction only

    Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

Note for the unlock pass: if the wave-1 state and the fix-pass state are both present unchanged in
the index history expectation above, collapse to one commit per current-tree reality rather than
reconstructing intermediate states.

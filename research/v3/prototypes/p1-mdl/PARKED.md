# PARKED — reviewer-ordered pause #3, 2026-08-05

## Current state
- Branch `proto/p1-mdl` at `62e4eec` (+ this file uncommitted), all landed work committed signed G.
- V0 arc CLOSED on the record: round phase2-pair-010 analyzed (zero strong; ink-recovery
  falsifier FIRED; coverage-vs-identity corroborated live; arm A degenerate 20/20 two-colour —
  orchestrator misreport corrected). MECHANISM-FALSIFIED filed, scoped to v0.
- **V1 bounded iteration GRANTED and STARTED, now paused** (grant stands; execution waits for
  RESUME). Scope + kill condition in DESIGN §V1. Excursion probe closed favourably (62e4eec).

## Mid-flight (allowed to finish writing; output NOT acted on until RESUME)
1. **λ/budget disentangle probe** — background node process (my ownership after its worker died
   pre-run): writes data/lambda-probe/parts/ + results.json. Log: scratchpad/lambda-probe.log.
   Long-running (hours; budget-exhausted searches).
2. **Chromatic-residual worker (A′ → 0.2.0)** — Opus worker on src/energy/aprime + tests.
   Uncommitted when it lands; leave on disk.

## Exact next actions on RESUME, in order
1. Reconcile both from disk (results.json complete? aprime edits + test counts?).
2. Commit chromatic residual (pathspec src/energy/aprime tests/energy-aprime) after running its
   suite; spawn fresh verifier if it landed unverified (fresh-worker-collected-in-turn rule).
3. Fresh worker: synthesize LAMBDA.md from results.json → λ_A recommendation + budget verdict.
4. Re-emit demo-20 (arm A at recommended λ_A; A′ at 0.2.0) via run-emitter; CHECK BEFORE STAGING:
   stop counts/spacings (DESIGN 13 banding rule), collapse rates, margins, quick robustness
   screen (--limit 8).
5. Stage the ONE 8-item round (pairwise, same 8 covers as v0, id-surface check) → REVIEW-READY
   via SendMessage. Keep-or-kill on its verdicts per DESIGN §V1.

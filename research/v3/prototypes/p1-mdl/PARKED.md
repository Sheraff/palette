# PARKED — reviewer-ordered pause #2, 2026-08-04

## Current state
- Branch `proto/p1-mdl` at `a98273b` (+ this file uncommitted), everything landed is committed
  signed G. Suite green (121+ tests). Honesty --check clean. Owed-commits ledger empty.
- M1 CLOSED and recorded in DESIGN: no legacy-verdict signal for either prior at any λ, before
  or after the DESIGN-9 fix (M1: data/falsifier/, M1b: data/falsifier-m1b/). Attribution: p1a
  spread; p1ap culprit genericBits (coverage-vs-identity). Interpretation: weak evidence, no
  paradigm verdict; sharpens M3.
- M3 approved in principle by the reviewer (pairwise p1a-vs-p1ap where the arms differ,
  coverage-vs-identity probe); staged only after M2 data.

## Mid-flight (one worker, unattended, allowed to finish writing)
- **M2 emitter worker**: v0 joint search (both arms), candidates wiring, run-emitter CLI,
  mechanism-guard tests, demo-20 run with diagnostics (self-falsifier underSearched, both-ink
  min-APCA, F/A-swap delta, runner-ups, UNCERTIFIED-V0 certificate). Its output will NOT be
  read or acted on until RESUME; completion notification during pause is noted and ignored.

## Exact next actions on RESUME, in order
1. Read M2 worker report; run its tests; commit (pathspec: src/search, candidates, tests/search,
   data/emitter). If worker died mid-run, check disk for partial artifacts before respawning
   (recover, don't redo).
2. Read the demo-20 run table (20/20 emitted? escape=0? underSearched count? arm agreement).
   Spot-check 3 palettes visually via devloop viewer if warranted.
3. Run auto-adjudication (both arms' candidates.jsonl) and robustness check.ts (--candidate
   for each arm; budget note: ~10.8 s/palette heavy; use --limit if needed first pass). Record
   W/NS/L + overfit ratio.
4. Independent verification pass on the search (differential vs exhaustive on tiny images is in
   the worker's tests; verifier confirms + probes determinism and feasibility on 3 real covers).
5. Stage M3 per brief §6: pick 4–10 covers where arms differ materially (exact-hex or bar-level
   disagreement), build round fixture + ROUND.md (question: which palette belongs to this
   artwork; kind: pairwise; blinded; escape answer present), REVIEW-READY via SendMessage.
6. Fold in: aprime version-constant hygiene (one-liner, next natural worker).

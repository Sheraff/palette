# PARKED — reviewer-ordered pause #5, 2026-08-05

## Current state
- Branch `proto/p1-mdl` at `0de3b06` (+ this file uncommitted); everything signed G, workers
  named. STATE.md (reviewer triage doc) is committed at HEAD.
- V1 bounded iteration mid-execution: repairs landed + verified (chromatic residual 0.2.0 V5;
  λ_A=0.1 measured; version-stamp provenance fix; v1 candidates pinned; suite 169/169).
- Keep-or-kill round: NOT YET STAGED (waits on emission + screen). Kill condition stands.

## Mid-flight (survives the park; output NOT acted on until RESUME)
- **v1 re-emission, DETACHED** (nohup, pid 68041 at launch — survives session resumes): arm A
  then A′, 240 s/image, --as-of 2026-08-05-v1, true 0.2.0 stamps. Log:
  /Users/Flo/.claude/jobs/ebcf244b/tmp/v1-reemit-4.log. Output lands as
  data/emitter/{a,aprime}-demo-20-2026-08-05-v1.jsonl (~2.5 h from ~launch).
- A background monitor (bxzgo4akp) may fire a completion notification during the park: note,
  ignore, stop.

## Exact next actions on RESUME, in order
1. Verify emission completed: both *-v1.jsonl present, footers ok, headers show lambda 0.1 /
   240000 / algorithm-version 0.2.0. If arm A only: relaunch A′ leg detached, wait.
2. Reads + DESIGN checks on v1 output: collapse rates + structure census (vs v0's 20/20
   collapse), A′ stop counts & spacings (DESIGN 13 banding rule), margins probe (DESIGN 15
   script in scratchpad — re-run), min exact-triple share among published roles (DESIGN 16),
   cross-arm agreement. Commit emission artifacts (workers/scripts named).
3. Robustness screen through the pinned v1 candidates: check.ts --candidate
   prototypes/p1-mdl/candidates/p1a-v1.ts --limit 8 (then p1ap-v1) — detached/nohup, serial;
   trial-bias caveat recorded; ~2 h.
4. Stage the ONE 8-item pairwise round (same 8 covers as v0, neutral 40-hex itemIds, id-surface
   check + negative test, true versions in KEY.json only) — fresh worker, collected in-turn.
5. Commit (worker named); REVIEW-READY via SendMessage with the v1-vs-v0 read tables.
   Keep-or-kill on the round's verdicts per DESIGN §V1; falsification record appends either way.

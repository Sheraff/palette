# Instrument notes for P3 measurement briefs

- **robustness `check.ts --limit N` slices TRIALS, not covers** (cross-arm warning, 2026-08-05):
  smoke samples are trial-biased toward fast covers. All P3 smokes compared same-N slices
  re-scored on identical trial sets, so RELATIVE deltas stand; never quote a smoke % as an
  absolute. Full runs for absolutes.
- **No timeout in the harness:** a non-terminating candidate DEADLOCKS the run. Never point it
  at a candidate that can hang; watch worker liveness via output-file mtimes.
- Prior notes (W4/W9): `--concurrency` gives no real parallelism and inflates
  `timing.candidateMillis` (wall-time overlap); no `--repo-root` flag (symlinks at worktree
  root instead); `--emit-diff-set` emits cache artefacts.

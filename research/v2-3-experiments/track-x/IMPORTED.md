# Imported record — provenance

`EXPERIMENT.md` in this directory was **not produced on trunk**. It is a verbatim copy, imported so
that trunk citations resolve.

| | |
|---|---|
| Source branch | `worktree-agent-aa9b04c8e024a04c7` (local only; never pushed to `origin`) |
| Source commit | `b37cb14` — *"Track X: correct the review manifest to round 4 (it carried rejected-design prose)"* |
| Source path | `research/v2-3-experiments/track-x/EXPERIMENT.md` (792 lines, unchanged) |
| Imported by | provenance-hygiene sweep, 2026-08-01, onto trunk `199796b` |
| Imported because | `research/v2-3/src/internal/winner-scoring.ts:250` and `:278` both say *"See `research/v2-3-experiments/track-x/EXPERIMENT.md`"*, and that path did not resolve at HEAD. `configuration.test.ts` cited "Track X, four rounds" with nothing behind it. |

Only `EXPERIMENT.md` was imported. The arm's code and its ~250-file `data/` tree
(`acceptance.ts`, `calibrate.ts`, `coverage.ts`, `data/field-profiles/`, `data/calibration/`, …)
remain on the source branch; nothing on trunk cites them.

## Read this record with one correction in mind

Track X **ships `integration: "off"`** (`EXPERIMENT.md:759`, and `:443`). Trunk ships
`integration: "utility"`. That is not a contradiction and neither state is stale:

- The arm deliberately held at `"off"`, waiting for adjudication, because one small regression
  (`1031d1`) and one unadjudicated preference case (`05fa7c`) remained.
- **Batch 26** (2026-07-31) supplied the adjudication — zero of eight movement pairs regressed —
  and the orchestrator enabled the term in trunk commit `fb3e3aa`.

So `EXPERIMENT.md`'s "off" is the pre-batch state of the arm, and the operating point it recommends
(`:403`, `:721-722` — `utility` / 0.05 / `field-and-accent` / 0.75 / achromatic field gate) is
exactly what trunk runs.

# Imported records — provenance

The four round documents in this directory were **not produced on trunk**. They are verbatim
copies, imported so that trunk citations resolve.

| | |
|---|---|
| Source branch | `worktree-agent-a02241df33f1b2a0d` (local only; never pushed to `origin`) |
| Source commit | `44dfd74` — *"v2-3 carrier ranking: build the skap-rule batch labels (sk-off / sk-on)"* |
| Imported by | provenance-hygiene sweep, 2026-08-01, onto trunk `199796b` |

| file | lines | what it is |
|---|---:|---|
| `EXPERIMENT.md` | 594 | round 1. There is no `ROUND-1.md`; this is it. |
| `ROUND-2.md` | 200 | the foreground contrast reference, measured |
| `ROUND-3.md` | 447 | the `skap` rule, implemented and measured |
| `ROUND-4.md` | 212 | coverage domination guard — no valley, not built |

Imported because trunk cites this arm in five places that did not resolve at HEAD:
`research/v2-3/src/internal/palette-core.ts:2817`, `research/v2-3/src/internal/base-scoring.ts:129`,
and three pins in `research/v2-3/test/configuration.test.ts`
(`GAMUT_COVERAGE.scope`, `TEXT_DEMOTION_EVIDENCE`, `IDENTITY_COVERAGE_DIRECTIONS`).

The arm's code (`configure.ts`, `replay.ts`, six `probe-*.ts`, `analyse-*.ts`) and its `data/` tree
remain on the source branch; nothing on trunk cites them.

## Read these records with one correction in mind

`ROUND-3.md:155` ships the `skap` rule **OFF**
(`IDENTITY_COVERAGE_DIRECTIONS = "count-every-credit"`), explicitly deferring the call: *"Zero
demonstrated benefit at trunk against four verdict-carrying movers is review's call, not an arm's."*
Trunk ships `"one-hue-one-direction"`.

That is not a contradiction. **Batch 30** (2026-08-01) served the complete four-artwork mover set
and made the call — every rule-side output graded strong, one decisive grade to the rule side alone
(`000a8aa1`) — and the orchestrator enabled it in trunk commit `4a5c37d`. The arm's OFF is the
pre-batch state.

The same applies to `ROUND-2.md`'s `FOREGROUND_CONTRAST_SCALE`, which reached trunk as an inert
naming change carried by `4a5c37d`.

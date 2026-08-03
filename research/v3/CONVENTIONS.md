# V3 code conventions

**Toolchain (match the repo root):** plain Node with `--experimental-strip-types`, ESM
(`"type": "module"`), tests via `node:test` (`node --experimental-strip-types --test`),
TypeScript 5.6 types only (no build step). Use the **root** `package.json` dependencies —
available: `sharp` 0.33.5 (image decode/metadata, AVIF-capable), `apca-w3`, `colornames-oklab`,
`colorjs.io`, `@types/node`. **The root also aliases `sharp-modern` (`npm:sharp@0.35.3`)** — every
v3 import resolves to plain `sharp` 0.33.5, which does register AVIF input, so the AVIF claim holds
for the package actually used. Worth knowing the alias exists: a repo normally carries two sharps
because of a decode difference, and the header-dimensions rule below is a hard rule over exactly
the AVIF files where the two versions could differ. If you ever need `sharp-modern`, say so
explicitly rather than letting resolution pick. **Never install packages; never edit `package.json`** (the
orchestrator reconciles scripts/deps at integration). Python only where local models require
it, in a project-local venv, never system-wide. If the environment itself blocks you (system
interpreter too old, wheel unavailable), stop and escalate with the exact failure — a
user-local interpreter under your owned path is acceptable; any global change (including a
global Python upgrade) is the reviewer's call, never an agent's or the orchestrator's.

**Path ownership (Phase 0)** — work only inside your owned paths:

| workstream | owns |
|---|---|
| contract schema + gates | `research/v3/src/contract/`, `research/v3/tests/contract-*.test.ts` |
| warehouse + query CLI | `research/v3/src/warehouse/`, `research/v3/tests/warehouse-*.test.ts` |
| review server | `research/v3/src/review-server/`, `research/v3/review-ui/`, `research/v3/tests/review-server-*.test.ts` |
| legacy distillation | `research/v3/src/legacy/`, `research/v3/data/legacy/` |
| holdout freeze | `research/v3/src/holdout/`, `research/v3/data/holdout/` |
| embeddings | `research/v3/oracle/embeddings/`, `research/v3/data/embeddings/` |
| calibration consequence | `research/v3/src/calibration-consequence/`, `research/v3/data/calibration-consequence/` |
| tagging | `research/v3/src/tagging/`, `research/v3/data/tagging/`, `research/v3/tests/tagging-*.test.ts` |
| coverage set | `research/v3/src/coverage-set/`, `research/v3/data/coverage-set/` |
| oracle — premise / ladder / bakeoff / SAM | `research/v3/oracle/<name>/`, `research/v3/data/oracle-*`, `research/v3/data/sam/`, `research/v3/tests/sam-*.test.ts` |
| housekeeping + reconciliation | `research/v3/data/decisions/`, `research/v3/PHASE_0_LOOSE_ENDS.md`, and doc edits to `V3_PLAN.md` / `PHASE_0_DECISIONS.md` / `CONVENTIONS.md` / `REVIEW_UI.md` / `ORACLE_QUESTION_SET.md` |

Data directories written by the instrument that owns the code, and owned with it:
`research/v3/data/warehouse/` (warehouse), `research/v3/data/review-server/` (review server),
`research/v3/data/calibration/` (calibration consequence), `research/v3/data/source-surveys/`
(read-mostly; the surveys are inputs, and a regeneration is a reviewer-visible event).

*Added 2026-08-03 (adversarial review, docs-drift §2.18): `src/coverage-set/`,
`data/coverage-set/`, `data/tagging/`, the tagging and SAM test globs, and the four data
directories above previously belonged to **no row**. An unowned path holding the authoritative tag
vocabulary is a write collision waiting to happen, and path ownership is this campaign's only
collision-avoidance mechanism for parallel agents.*

The `.md` files inside a workstream's data directory belong to that workstream — a housekeeping
pass reports contradictions in them, it does not edit them.

**Rules:**

- **No git commands.** The orchestrator commits.
- **Every constant** is named and carries a provenance tag comment:
  `[REVIEWED] | [MEASURED] | [n=1] | [INHERITED] | [UNCALIBRATED] | [HELD]` — plus one line
  saying where the value comes from. No anonymous literals.
- **Scale-free statistics:** area fractions and normalized coordinates, never raw pixel
  counts, except genuinely pixel-scale phenomena (noise floors), individually justified
  (`PHASE_0_DECISIONS.md` §1).
- **Image dimensions come from headers** (`sharp` `.metadata()`), never from filenames
  (`music-artworks/` filenames lie — 719 AVIFs disagree with their own header).
- **Identify artworks by full path + content hash**, never by id prefix.
- **Human-facing color output** is always named via `colornames-oklab` alongside the hex.
- **Plain language** in docs, comments, reports. No cleverness.
- Long-running scripts: JSONL/shard checkpoints flushed per record, resumable from output,
  deliberately killable.
- **The GPU is a single-owner resource — the orchestrator owns the queue.** Agents never
  start GPU work (including "brief" smoke tests or load verifications) while any GPU job may
  be running; ask the orchestrator for a slot instead. Measured consequence of violating
  this: a concurrent Metal job dies with `kIOGPUCommandBufferCallbackErrorTimeout` and the
  process's Metal context stays poisoned — under an ordinary retry path a whole run can
  mark itself failed-and-complete in seconds. Runners should treat GPU faults as
  non-terminal (no `failed` rows; exit distinctly; let the supervisor restart fresh).
- **Known artifact — stray NUL bytes in generated source.** Three separate agent-written
  files have contained literal NUL bytes where a space belonged (typically as separators
  inside template literals). Signature: `grep` treats a text file as binary, or Edit cannot
  match text you can plainly see. Check with `grep -rlP '\x00' <path>`, repair to a space,
  and verify output hashes unchanged.
- **A standing decision gets a record.** Anything later work is entitled to assume without
  re-deriving — an instrument choice, a freeze, a corpus policy, a gate rule — goes into
  `research/v3/data/decisions/decisions.json` (schema and rules in that directory's `README.md`).
  `fundedBy` holds **warehouse record ids and nothing else**, so
  `warehouse recheck --decisions` can flag the decision when the evidence under it is amended or
  retracted; file references go in `fundedByArtifacts`, which no tool checks. A decision the
  reviewer gave conversationally still gets a record — with an **empty `fundedBy`**, which is the
  honest statement that no machine can ever re-check it. Append, never edit: a changed decision is
  a new record carrying `supersedes`.
- **A deliberately-open item gets a ledger entry** in `research/v3/PHASE_0_LOOSE_ENDS.md`, with an
  owner and the condition that revives it. "Known and parked" is a respectable state; "open and
  unrecorded" is not.
- **A quoted count carries the timestamp it was measured at, or is replaced by the query that
  regenerates it** (added 2026-08-03). "434 records" is not honest; "434 records as of
  2026-08-03T10:12Z" is honest and self-invalidating, and `warehouse status` is better than either.
  The same applies in tests: **a diagnostic whose output depends on corpus size is never
  golden-compared** — assert its invariants instead
  (`d-2026-08-03-corpus-size-dependent-diagnostics-never-golden-compared`). Genuinely fixed
  artifacts — frozen fixtures, pinned hashes, seeded draws — *should* be golden-compared.
- **A status claim about code another workstream owns cites that workstream's README** (added
  2026-08-03). Do not assert independently that someone else's code is unbuilt. In every
  built-vs-unbuilt inversion the adversarial review found, the README was right and the summarising
  document was behind it — because the README is maintained by the workstream that owns the code.
- Read `V3_PLAN.md` and `PHASE_0_DECISIONS.md` before writing code; `REVIEW_UI.md` for
  anything reviewer-facing; `PHASE_0_LOOSE_ENDS.md` before assuming any instrument is settled.

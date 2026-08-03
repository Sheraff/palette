# V3 code conventions

**Toolchain (match the repo root):** plain Node with `--experimental-strip-types`, ESM
(`"type": "module"`), tests via `node:test` (`node --experimental-strip-types --test`),
TypeScript 5.6 types only (no build step). Use the **root** `package.json` dependencies —
available: `sharp` (image decode/metadata, AVIF-capable), `apca-w3`, `colornames-oklab`,
`colorjs.io`, `@types/node`. **Never install packages; never edit `package.json`** (the
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
| tagging | `research/v3/src/tagging/` |
| oracle — premise / ladder / bakeoff / SAM | `research/v3/oracle/<name>/`, `research/v3/data/oracle-*`, `research/v3/data/sam/` |
| housekeeping + reconciliation | `research/v3/data/decisions/`, `research/v3/PHASE_0_LOOSE_ENDS.md`, and doc edits to `V3_PLAN.md` / `PHASE_0_DECISIONS.md` / `CONVENTIONS.md` |

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
- Read `V3_PLAN.md` and `PHASE_0_DECISIONS.md` before writing code; `REVIEW_UI.md` for
  anything reviewer-facing; `PHASE_0_LOOSE_ENDS.md` before assuming any instrument is settled.

# V3 code conventions

**Toolchain (match the repo root):** plain Node with `--experimental-strip-types`, ESM
(`"type": "module"`), tests via `node:test` (`node --experimental-strip-types --test`),
TypeScript 5.6 types only (no build step). Use the **root** `package.json` dependencies —
available: `sharp` (image decode/metadata, AVIF-capable), `apca-w3`, `colornames-oklab`,
`colorjs.io`, `@types/node`. **Never install packages; never edit `package.json`** (the
orchestrator reconciles scripts/deps at integration). Python only where local models require
it, in a project-local venv, never system-wide.

**Path ownership (Phase 0)** — work only inside your owned paths:

| workstream | owns |
|---|---|
| contract schema + gates | `research/v3/src/contract/`, `research/v3/tests/contract-*.test.ts` |
| warehouse + query CLI | `research/v3/src/warehouse/`, `research/v3/tests/warehouse-*.test.ts` |
| review server | `research/v3/src/review-server/`, `research/v3/review-ui/`, `research/v3/tests/review-server-*.test.ts` |
| legacy distillation | `research/v3/src/legacy/`, `research/v3/data/legacy/` |
| holdout freeze | `research/v3/src/holdout/`, `research/v3/data/holdout/` |
| embeddings | `research/v3/oracle/embeddings/`, `research/v3/data/embeddings/` |

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
- Read `V3_PLAN.md` and `PHASE_0_DECISIONS.md` before writing code; `REVIEW_UI.md` for
  anything reviewer-facing.

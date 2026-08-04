# Phase 2 — shared operational brief for prototype orchestrators

**Written 2026-08-04 by the Phase 2 orchestrator.** You are one of six Fable middle orchestrators,
one per prototype (P1–P6, defined in `PHASE_2_HANDOFF.md` §2). You inherit the Phase 2
orchestrator's full context: both handoffs, the reviewer's rulings, and the two instrument surveys.
This file is the operational contract; your spawn prompt carries your prototype's specifics.

## 1. Tiering and roles

Three tiers: main orchestrator (Phase 2) → **you** → many Opus workers. Rules:

- **You do not edit implementation files.** Opus workers do all file-editing, in parallel where
  tasks are independent. Your exceptions: genuine one-liners, and specs/briefs only your context
  can author.
- **Workers get written briefs** stating: owned paths, forbidden paths, the no-commit rule
  (workers never commit; you commit), and the requirement that final messages be data — tables,
  hashes, counts, exit codes — not prose. Cap worker reports at ~300 words.
- **Design overlap deliberately.** For every load-bearing component, either two independent
  implementations compared, or one implementer plus one independent verifier who re-derives the
  result from the artifact (not from the implementer's claims). Agent self-reports are evidence,
  not verification.
- **Absorb worker completions.** Report to the main orchestrator once per milestone, never per
  worker.

## 2. Path ownership

- Your worktree: `/Users/Flo/GitHub/palette/.worktrees/<your-slug>/`, branch `proto/<your-slug>`,
  branched from `ec22c27`. **All writes stay inside your worktree.**
- Your code lives under `research/v3/prototypes/<your-slug>/` inside the worktree. Instrument
  outputs (devloop runs/cache, robustness reports, adjudication output) land in your worktree's
  `research/v3/data/` — that is expected and fine.
- Shared instruments (`research/v3/src/`, `oracle/`, existing `data/`) are **read-only**. If an
  instrument has a bug that blocks you, report it upward; do not patch it locally.
- The main checkout `/Users/Flo/GitHub/palette/` is read-only reference (this file lives there).
- Setup: run `pnpm install` at your worktree root once, before anything.

## 3. Commit rules (Phase 1 §6 rule 1, still in force)

Signed commits, explicit pathspec, always — never bare `git commit -a`. Commit only paths under
`research/v3/prototypes/<your-slug>/` plus your worktree-local set files. If signing is blocked
(vault locked), stop and report; never commit unsigned.

## 4. The algorithm's hard constraints (`PHASE_1_AUTHOR_BRIEF.md` §3.1 is canonical)

- Runtime is cold, per-file: **the algorithm never reads a table.** Precomputed data is dev-only.
- **No v2-3 code, ever.** No models at runtime (SAM is a dev tool; GPU use requires requesting the
  single-owner GPU slot from the main orchestrator first).
- Output contract: background / surface / foreground / accent; gradient stops (first stop IS
  background, last IS surface); sanctioned collapses are contract machinery. The minimum
  colour-distance rule and its collapse consequence are **in the specs** — a design constraint,
  not a defect.
- Every tunable constant you introduce carries a provenance tag (`CONVENTIONS.md` §
  provenance); run `node --experimental-strip-types src/honesty/cli.ts --check` after adding one.
- Principles bind, numbers do not. Resolve number-disagreements by measurement, or pick one,
  state it in your prototype's README, and move on. Never escalate them.

## 5. Iteration loop (all commands from your worktree's `research/v3/`)

Your algorithm is a devloop candidate: a module exporting `candidateId: string` and
`paletteOf: (imagePath: string) => Promise<Palette>` (`Palette` from `src/contract`).

- Run: `node --experimental-strip-types src/devloop/run.ts --candidate <path> --set data/devloop/sets/demo-20.txt`
- Diff two runs: `src/devloop/diff.ts <before.jsonl> <after.jsonl>` · viewer: `src/devloop/serve.ts` (pick a unique port via env if needed)
- Contract in **scorecard mode** during dev: `scorePalette` from `src/contract` (hard mode is for the bake-off).
- Robustness: `src/robustness/check.ts --candidate <path>` — run it early and often; report the
  overfit ratio. Arms that exist: jpeg-q92/q85/q75, dither-lsb1, real rendition pairs. Resize /
  1-px crop / id relabeling do not exist; do not build them.
- Auto-adjudication (dev aid, gates nothing): `src/adjudication/cli.ts run <candidates.jsonl>`.
  Verdicts are WIN / NO SIGNAL / LOSS only; legacy verdicts were produced under different priors.
- Sample sets: `demo-20` (inner loop), `coverage-set-1` (220, broader), `eval-142`, `gold-30`
  (hard cases). **The 413-artwork holdout is frozen and off-limits.**
- Stats: any measured number you report goes through `src/stats/` (refusals are types).

## 6. The judge, and the review flow

**The reviewer (Flo) is the only judge. Instruments are iteration aids, none is a gate.** Do not
build evaluation machinery beyond what exists; do not invent robustness arms, metrics, or gates.

You never talk to the reviewer, never push review batches, never start the shared review server.
When you have palettes worth human eyes:

1. Produce a candidate run (JSONL) over the agreed set, plus per-item render data conforming to
   the review-server schemas (palette shape: `{background,surface,foreground,accent, gradient:
   {stops}|null, surfaceCollapsed, accentCollapsed}` + `itemId, imagePath` repo-relative,
   `fingerprint {algorithmVersion, preprocessingVersion, gitCommit, dirty}`).
2. Stage it under `research/v3/prototypes/<your-slug>/review-rounds/<round-name>/` in your
   worktree with a small `ROUND.md`: what question the round answers, proposed round kind
   (default: calibration for solo grading, pairwise for A/B), item count (**4–10 items per
   round, never more**), and what you will do differently for each possible outcome.
3. End your turn with a REVIEW-READY report. The main orchestrator installs and queues rounds
   centrally, owns verify-live, and owns reviewer notifications.
4. When your round releases, the main orchestrator sends you a content-free signal ("batch <id>
   released") and nothing else. YOU then spawn your own Opus analyst to fetch the released
   payload, de-blind it via the server batch log (`data/review-server/batches.jsonl`, readable
   only after release) joined with your private mapping, verify the decode, and act on the
   verdicts. The main orchestrator never reads payloads, batch logs, or verdicts for
   single-prototype rounds (reviewer ruling, 2026-08-04); cross-arm evidence travels upward only
   through your §7 reports. Rounds spanning multiple prototypes are the exception — those are
   analyzed at the main tier.

Round kinds already implemented (ask for one of these before proposing a new one): pairwise
(two blinded sides on the real mock, 4-grade + preference + veto), calibration (single palette,
grade 1–4, veto), bracketing, accent-real, perception-4, freetext, plus oracle-style enum
questions. New kinds are possible via the round kit but cost main-checkout work — propose only
with a question none of the existing kinds can carry, and specify exactly what the reviewer sees,
what they answer, and the escape answer (every forced choice has one).

Blinding: no arm labels, no prototype names, no truth in anything that reaches a review payload
or side-car. Batch logs (`data/review-server/batches.jsonl`) are never read while a batch is open.

## 7. Reporting protocol (you → main orchestrator)

End your turn to report; you will be resumed with the reply. Hard cap 400 words, data before
prose. Fixed status vocabulary, exactly one per report:

- `ON-TRACK` — milestone reached, next one named, no input needed.
- `REVIEW-READY` — a staged round awaits installation (give paths, round kind, item count).
- `BLOCKED` — you cannot proceed; name the blocker and the single decision/resource needed.
- `MECHANISM-FALSIFIED` — honest negative result; give the evidence. This is a valid, valuable
  outcome — the campaign standard is correction-of-record, never smoothing.

Every report includes: robustness overfit ratio if measured this cycle, adjudication W/NS/L
counts if run, contract scorecard pass/fail counts, and open items (no completion narratives —
lead with what is still open).

## 8. Standing cautions

- The reviewer's flag on all six proposals: *"they all seem to understate the difficulty of the
  task at hand."* Treat every cost estimate in your arms' proposals as optimistic.
- Watch for quiet worker stalls (check process liveness and output-file mtimes; recover on-disk
  work before respawning).
- NUL bytes: repo greps are ugrep and silently fail on NULs; sweep with Python when it matters.
- Report your own errors prominently, old vs new. Agents that caught their own mistakes were the
  best moments of Phase 0/1.

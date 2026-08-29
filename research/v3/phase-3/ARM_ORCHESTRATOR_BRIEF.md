# Phase 3 — shared operational brief for arm orchestrators

**Written 2026-08-29 by the Phase 3 orchestrator.** You are one of three Fable middle
orchestrators, one per funded arm (`PROPOSAL_COMPARISON.md` §4). You inherit the main
orchestrator's full context: the plan, both handoffs, the contract, the field guide, the Phase 2
outcome, all six proposals, both adversarial reviews, and the comparison. This file is the
operational contract; your spawn prompt carries your arm's specifics. The Phase 2 brief
(`../phase-2/PROTOTYPE_ORCHESTRATOR_BRIEF.md`) is the ancestor of this one; where this file is
silent, that one applies.

## 1. Tiering and roles

Main orchestrator → **you** → Opus workers.

- **You do not edit implementation files.** Opus workers do all file-editing, in parallel where
  tasks are independent. Your exceptions: genuine one-liners, and specs/briefs only your context
  can author (your arm's `README.md`, `STATE.md`, round docs).
- **Workers get written briefs**: owned paths, forbidden paths, no-commit rule (you commit), final
  message = data (tables, hashes, counts, exit codes), ≤300 words.
- **Overlap deliberately** on load-bearing components: one implementer plus one independent
  verifier who re-derives from the artifact, never from the implementer's claims.
- **One fresh worker per task, collected within your own turn.** Never re-message a long-lived
  worker across passes (they end up routing into main-tier context).
- **Absorb worker completions.** Report upward once per milestone.

## 2. Path ownership

- Worktree `/Users/Flo/GitHub/palette/.worktrees/<slug>/`, branch `proto3/<slug>`, branched from
  `363b7660`. All writes stay inside your worktree.
- Your code: `research/v3/prototypes/<slug>/` inside the worktree. Instrument outputs land in
  the worktree's `research/v3/data/` — expected.
- Shared instruments (`research/v3/src/`, `oracle/`, existing `data/`) are read-only. Bugs go
  upward, never patched locally.
- Phase 2 prototype code is **reusable** (copy into your tree with a provenance comment naming
  the source worktree, path and commit). v2-3 code is not, ever.
- Setup: `pnpm install` at the worktree root once.

## 3. Commit rules

Signed commits, explicit pathspec, always — never bare `git commit`. Commit only paths under
`research/v3/prototypes/<slug>/` plus your worktree-local data. **If signing is blocked (vault
locked), do not stop: keep working on the next milestone, queue the commit, retry later, and
mention it in your next report** (reviewer ruling 2026-08-29). Never commit unsigned. A round
install does need a clean signed fingerprint, so a locked vault delays the install, not the work.
Commit `STATE.md` whenever it changes — uncommitted policy is invisible policy.

## 4. Hard constraints (canonical: `PHASE_1_AUTHOR_BRIEF.md` §3.1, `PHASE_0_DECISIONS.md` §2/§4)

- Runtime is cold, per-file; the algorithm never reads a table; no models at runtime.
- Output contract as specified; **the accent contrast floor is a conjunction** (|raw APCA| below
  ε_accent AND colour distance below `ACCENT_FUNCTIONAL_DISTANCE`, at the same ramp point);
  foreground floor is APCA only, over the whole rendered ramp; per-pair judgements use
  `sameColorBar(pair)`, never the pooled bar; collapses are exact equality with the flag; the
  white/black escape fires only when no legal palette exists after relaxation (a field
  relaxation must be tried before an escape).
- Every constant carries a provenance tag; run the honesty scanner after adding one.
- Principles bind, numbers do not. Number-disagreements: measure, or pick and state in README.

## 5. Corrected facts (from `reviews/*.md` cross-cutting sections — do not repeat the old ones)

- P5's bg/surface are the most stable substrate measured (~19.5/21% instability) but were **not**
  "bit-identical across nine versions" (120/600 and 157/600 trials moved).
- P5 cost at 3000²: fit 1.6–2.9 s; `readMarks` ~6 s. "4.2 s" is a stale v0.6.1 whole-pipeline
  figure.
- Guide-stop census "zero owed stops" is n=7 ramp covers, not 60.
- Robustness conventions: P3 reports **disagreement** (16% ⇒ ~84% agreement; accent 68–70% is
  agreement); P5 reports **agreement** (39% ⇒ ~61% disagreement); P2's 9.0% is agreement, its
  dither 15.0% is a move rate. **Report your own figures as "% of trials where the palette moved
  beyond the bar", per arm (q92/q85/q75/dither/pairs), and say so in every report.**
- The 206 `phase2-*` warehouse rows are autosave snapshots of 61 distinct verdicts (39 noted).

## 6. Iteration loop (from your worktree's `research/v3/`)

Your algorithm is a devloop candidate: a module exporting `candidateId` and
`paletteOf(imagePath) → Promise<Palette>` (`src/contract`).

- Run: `node --experimental-strip-types src/devloop/run.ts --candidate <path> --set data/devloop/sets/demo-20.txt`
- Diff: `src/devloop/diff.ts`; viewer `src/devloop/serve.ts` (unique port).
- Contract scorecard mode during dev (`scorePalette`); hard mode for rounds.
- Robustness: `src/robustness/check.ts --candidate <path>` — early and often.
- Adjudication (dev aid, gates nothing): `src/adjudication/cli.ts run <candidates.jsonl>`.
- Sets: `demo-20`, `coverage-set-1` (220), `eval-142`, `gold-30`. **Holdout is off-limits.**
- Stats through `src/stats/`.
- **Full-corpus crash sweep** (coverage-set-1 at minimum) before your first round.

## 7. Pre-registration discipline

Your arm's proposal names falsifiers. **Before** building past the substrate: write the
falsifier, its bar, and the branch you will take on each outcome into `STATE.md`, then run it.
Bars never move after data. A fired falsifier is a valid, valuable outcome — report it as
`MECHANISM-FALSIFIED` with the evidence and stop spending.

## 8. Rounds — the judge, and the shared-draw protocol

**The reviewer (Flo) is the only judge. Instruments are iteration aids, none is a gate.** Do not
build evaluation machinery beyond what exists. You never talk to the reviewer, never push
batches, never start the review server.

Phase 3 rounds are **shared draws**: the main orchestrator announces a cover list (8 covers:
fresh draws plus named probe covers, e.g. the face-as-field and frame covers) and every arm
stages a **calibration round** (single palette, grade 1–4, veto, free note) on exactly that
list. Trajectory across rounds on identical covers is what selects between arms.

When your palettes on the announced list are ready:

1. Produce the candidate run (JSONL) over the list, with per-item render data conforming to the
   review-server schemas (`{background,surface,foreground,accent, gradient:{stops}|null,
   surfaceCollapsed, accentCollapsed}` + `itemId` = the cover's 40-hex filename stem, repo-relative
   `imagePath`, `fingerprint {algorithmVersion, preprocessingVersion, gitCommit, dirty:false}`).
   Hard-mode contract validation must pass on every item; a failing item is a bug, not a
   palette.
2. Stage under `research/v3/prototypes/<slug>/review-rounds/<round-name>/` with `ROUND.md`: the
   question, what you expect per cover, and what you will do on each outcome. **Blinding:** no
   arm/round/prototype token anywhere in itemIds, media URLs or payload; validate by enumeration.
3. End your turn with `REVIEW-READY`. The main orchestrator installs, verifies live, and notifies.
4. On the content-free "batch <id> released" signal, spawn your own Opus analyst to fetch the
   released payload, decode via `data/review-server/batches.jsonl` joined with your private
   mapping, verify, and act. Cross-arm comparison happens at the main tier from your §9 reports.

Never read `batches.jsonl` while a batch is open. Per-artwork notes are facts about that cover;
extract failure classes, not rules.

## 9. Reporting (you → main orchestrator)

End your turn to report; you will be resumed. ≤400 words, data first. One status per report:
`ON-TRACK` · `REVIEW-READY` · `BLOCKED` (name the single decision/resource needed) ·
`MECHANISM-FALSIFIED`.

Every report: robustness move rates per arm if measured (convention in §5), contract hard-mode
pass/fail counts, cost at 300² and at the largest cover you ran, adjudication W/NS/L if run, and
**open items first**. Report your own errors prominently, old vs new.

## 10. Standing cautions

- Every cost estimate in the proposals is optimistic (reviewer's standing note); measure cost on
  day 1 at 300², 1000² and 3000², and report it.
- The dev-set trap fires within ~3 rounds; never tune on the announced cover list.
- Quiet worker stalls: check liveness and output mtimes; recover on-disk work before respawning.
- NUL bytes: sweep with Python, not grep.
- Plain language in README/STATE/round docs; define terms where used.

## 4. Anomalies and open items (M1)

Appended verbatim from `data/m1/notes.md`; everything above this line is derived.

1. **`p2-tree`'s member exists at no commit.** Four files of its measured closure
   (`tos/gradient/{constants,excursion,guide-stop,occupancy}.ts`) are **untracked** in the p2-tree
   worktree and `tos/candidate.ts` carries **uncommitted edits** (+49/−2 vs `21131282af`). The
   snapshot is therefore of a working tree, and the per-file sha-256 fingerprint — not the commit —
   is the only thing that pins this member. Recorded, not worked around: what to do about it is the
   home prototype's call. (P2's own STATE.md §6 says "Nothing in flight", which this contradicts.)

2. **`p1-mdl` has no 60 s budget module.** SPEC §4 says P1a runs at its 60 s budget as a probe.
   `candidates/p1a-v1.ts` — the λ-repaired arm-a v1 module P1's STATE.md names — hard-codes
   `BUDGET_MS = 240000`; `candidates/p1a.ts` is the pre-repair v0 module at λ = 1.0. Writing a 60 s
   variant would mean editing member code, which SPEC §4 forbids, so the 240 s module was snapshotted
   verbatim and run on **3 covers only**, not demo-20. **Measured: 227.6 s median per cover.** At that
   cost demo-20 is ~76 minutes and coverage-set-1 (220 covers) is ~14 hours serial. Whether a 60 s
   variant is authored (by P1, in its own worktree) or the 240 s cost is accepted is an orchestrator
   decision this milestone cannot make for itself.

3. **P1's first snapshot run failed all three covers.** `ENOENT … v3/data/legacy/endorsements.json`:
   `src/emit/paths.ts` computes `LEGACY_DATA_DIR` from `import.meta.url`, a runtime dependency no
   import walk can see. Fixed by declaring the directory and symlinking it into the mirror after
   verifying its four files byte-identical between the two checkouts — not by editing P1. The re-run
   gate passed 3/3. Two members' worktrees also moved HEAD mid-milestone (`p3-fields` twice), which
   is why `tools/verify-pin.ts` re-hashes rather than trusting a commit.

4. **The four-member disagreement block is three covers wide.** It is not a corpus statement, and the
   per-role rates in it (multiples of 33.3%) should not be read as one. The twenty-cover statement is
   the three-member block. Widening the four-member block costs P1a's runtime, item 2.

5. **What M1 did not do.** No selector, no currency, no bootstrap — those are M2/M3. No member was
   run on coverage-set-1. Nothing here scores a member: the disagreement matrix counts differences and
   is silent about which difference is better.

6. **`p2-tree` re-pinned, 2026-08-11 (M3 prerequisite).** The M1 snapshot at `21131282af` had
   drifted: `tos/constants.ts` no longer matched the home worktree (`UNREADABLE_COVERAGE_FRACTION`
   0.5 → 0.25, P2's DECISIONS.md D15, retagged `[UNCALIBRATED]` → `[MEASURED]`). Re-snapshotted from
   the p2-tree worktree at HEAD `0ae6254260`; byte-identity gate re-run, **PASS 3/3**. The four
   `tos/gradient/*` files that were untracked at M1 have since been committed (`2da8b74b`), so the
   member is closer to a commit than it was — but **not at one**: `tos/constants.ts` still carries an
   uncommitted working-tree edit, so the per-file sha-256 fingerprint remains the only pin. Commit
   chain in `members/p2-tree/PROVENANCE.md`. **Item 1 above is therefore superseded in its details
   and unchanged in its finding.**

7. **What the re-pin does and does not reach.** M3 (`M3.md`, `data/m3/`) runs the **re-pinned**
   `p2-tree`. §2 and §3 of this report, and the M2 bit table (`BITTABLE.md`), are the **M1** demo-20
   runs and therefore price `p2-tree`'s superseded snapshot. They were deliberately not re-run: the
   M2 table's only edit at this milestone is SPEC §3.1's σ floor, and re-pinning a member in the same
   pass would have made the floor's measured effect uninterpretable. The demo-20 numbers are M1's,
   and are labelled as M1's.

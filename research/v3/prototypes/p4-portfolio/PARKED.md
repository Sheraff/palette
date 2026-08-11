# P4 parked — 2026-08-11

**Committed state:** SPEC `89b81b4` · M1 `c010d71e` · STATE.md `a63b118a` (all signed G,
branch `proto/p4-portfolio`). Ledger empty; nothing owed.

**Mid-flight:** worker W2 (M2 selector substrate + currency, brief in the dispatch record) may
complete to disk under `selector/` and `data/m2/` during the park — its output is UNVERIFIED
and treated as nonexistent until resume step 1.

## Resume sequence

1. **Collect W2 from disk**: verify against its brief — substrate determinism test, currency
   sanity tests, the F2 tripwire test present and passing, tsc --strict; check the C stability
   sweep artifact anchors C rather than a hand-pick. Commit signed with worker attribution if
   green; respawn fresh with the same brief plus findings if not (recover partials first).
2. **Read the demo-20 bit table**: winner counts, immaterial count (M1 predicts ~0), margin and
   win-fraction distributions — the F1 preview. If win fractions cluster at ½ already on
   demo-20, bring the F1-early-warning to the main tier before spending M3 corpus compute.
3. **Re-pin P2's member** if its provenance commit has landed (ordered upward; check
   `git -C ../../.worktrees/p2-tree log` for the tos closure commit), re-run the byte-identity
   gate on 3 covers, update PROVENANCE.md.
4. **M3**: F1 measurement on coverage-set-1 (fast three members; P1a excluded per ruling) —
   fresh worker, collected in-turn.
5. **M4**: stage the disagreement-covers pairwise round (selector's choice vs P3) per SPEC §5,
   REVIEW-READY to the main tier.

Standing rules in force: fresh workers collected in-turn; F2 tripwire stays armed; no constants
outside arm-c′'s eight anchored decisions; member code read-only; stems-only ids at staging.

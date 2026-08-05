# Owed commits — p3-fields

Ledger empty. Flush history: 2026-08-04 first unlock — `3f0082e`, `2f72619`, `809e2a5`, `0f1a65a`;
second unlock — `f0b3a4d` (measurements + claim scoping). All signed (G). File retained in case
the vault locks again; entry format: pathspec, staged yes/no, full intended message.

*Correction of record:* `f0b3a4d`'s message says "ledger cleared" but this file still carried the
flushed entry at commit time; cleared here, one commit late.

**Commit convention (delegation-audit hygiene ask, 2026-08-05):** every implementation commit
message names its worker (W-number) in the first line or body; orchestrator-authored commits
say "orchestrator". Applies from 4763acc forward.

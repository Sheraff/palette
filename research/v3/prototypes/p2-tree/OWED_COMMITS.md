# Owed commits — p2-tree

Standing rule: never commit unsigned. When the vault is locked, entries accumulate here with
exact pathspec + message; they are flushed (signed, explicit pathspec) when the main
orchestrator signals unlock, and removed only by being committed.

**Ledger empty.** Backlog of 2026-08-04 (falsifier, tos, alpha) flushed as `bfa2a34`,
`c6dc234`, `17cf6f0` — all signature-verified `G`. `*/out/` run artifacts are deliberately
uncommitted (regenerable; the dumps are multi-MB).

## Pending entries

- Worker D `verify/` harness — when its report lands.

# Worker attribution backfill — reports predating the file channel

The file-channel convention (`reports/winteg-passN.md` etc.) started at pass 4. Earlier worker
reports exist only in the orchestration message history; this note is the on-disk attribution the
delegation audit asked for.

| commit | work | worker(s), reports in message history |
|---|---|---|
| `3df30d9` | wave-1 modules + integration passes 1–3 | W-CORE (decode/inventory/snap, 9 tests), W-FIT (IRLS field fit, 6 tests), W-READ (ramp/excursion/stops, 5 tests), W-MARKS (overlay roles, 7 tests); W-INTEG passes 1–3 (assembly + demo-20 + rulings 1–3 implementation) |
| `3e2d826` | verification + round-1 design | W-VERIFY (independent re-derivation incl. robustness + dither falsifier); round-1 ROUND.md authored by orchestrator |
| `ec2c995` | round-1 staging | W-STAGE (items/render-data/STAGING.md) |

From pass 4 (`reports/winteg-pass4.md`) onward every implementation commit pairs with an on-disk
worker report; staging and later passes each name their worker in the report header. Orchestrator
edits throughout are confined to SPEC.md, ROUND.md/NOTES files, `src/types.ts` (interface
ratification — per the audit, future non-trivial types edits go to workers via the
propose-then-ratify gate), and one measured one-line constant correction (`COMPONENT_CORE_FRACTION`
0.4→0.39 with its test pin, recorded in SPEC decision 12).

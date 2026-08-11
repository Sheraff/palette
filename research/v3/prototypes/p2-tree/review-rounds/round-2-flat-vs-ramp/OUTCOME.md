# field-gradient-labels-1 — verified decode and outcome

Analyst verification: **clean.** 9 raw batch rows = 8 oracle-labels + 1 batch-complete; 8
resolved, 0 supersessions/amendments; fixture ↔ batch-log serveOrder identical; answers
follow serveOrder; sha256 recomputed on 3 files, all match. Zero free text on all 8.

## Decoded (P1 = shipped 0.15/0.8 predicts gradient on all 8; P2/P3 predict not-gradient)

| category | answer |
|---|---|
| anchor …c5ac790164 | **neither** |
| legacy-ramp regression ×3 | **gradient**, **gradient**, cant_tell |
| legacy-flat fix ×2 | **neither**, cant_tell |
| unlabelled flip ×2 | **flat**, cant_tell |

Agreement: P1 2/8; P2/P3 3/8 (inseparable, as pre-declared). Escapes: cant_tell 3/8.

## What the pre-declared mapping yields

1. **No operating point selected** — 3–5 split; `MONOTONE_MIGRATION_FRACTION` stays 0.8
   `[UNCALIBRATED]`. Nothing is written.
2. **The ≥3 cant_tell trigger fires:** `UNREADABLE_COVERAGE_FRACTION` (0.5, unswept) is
   promoted to the next constant to MEASURE before any laminarity constant moves — the same
   gate worker G identified as capping laminarity agreement at 63.9% (52/68 legacy ramps
   gated out).
3. **Legacy-ramp regressions are real:** the reviewer sided with legacy (gradient) on both
   readable items, 0 with the stricter cuts. The monotone-only and best-agreement candidate
   points are REJECTED as-is — they buy phantom reduction by flipping real ramps.
4. **Anchor:** `neither` — round 1's phantom-gradient verdict stands (not reaffirmed as
   "flat"; no contradiction).
5. Vocabulary clause not fired (neither = 2/8, no majority).

## Round-machinery defects (correction-of-record — REPEAT LESSON)

Two ROUND.md clauses fire simultaneously (3–5 split AND ≥3 cant_tell) with no precedence,
and the mapping never states whether cant_tell sits in the split denominator. This is the
SECOND non-MECE outcome table this campaign (see round-3-tradeoffs OUTCOME.md). The
precedence applied here — escape-trigger processed alongside the no-selection outcome, both
actionable without conflict — is recorded as the orchestrator's reading, not the table's.
Item 5's legacy-flat record also went unconfirmed (reviewer: neither). Both MECE and
denominator-statement requirements are binding on every future P2 round (third strike goes
to the round-staging brief template itself).

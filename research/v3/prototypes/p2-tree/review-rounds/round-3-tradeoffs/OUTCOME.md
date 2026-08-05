# phase2-pair-015 — verified decode and outcome

Analyst verification: **clean.** warehouse.jsonl (12 raw rows = 11 verdicts + 1 batch-complete;
grep and CLI agree; `--latest` = 2 verdicts; T1's 9 extra rows are same-grade note drafts);
zero veto/amendment rows; batches.jsonl line-40 blinding; items.json sides byte-identical to
the served fixture; every side confirmed three ways (blinding index, paletteHash, hexes).

## T1 — …35b967964d (D1 accent exchange rate)

| shown | variant | accent | grade |
|---|---|---|---|
| A | APCA-first (W-F order) | `#6a723f` olive | weak |
| B | chroma-first, published (D1) | `#d25068` coral | weak |

Preference **A (olive)**, explicit, no veto. Reviewer note, verbatim:
> side A represents more of the artwork: pale background, green and red subject, but the red
> is not the correct shade on the foreground pink
> side B has the correct shade of red (Strawberry Moon), but doesn't have the green

## T2 — …f39d397ba3 (salience cut)

| shown | variant | accent | grade |
|---|---|---|---|
| A | salience-level-first | `#e7c0c1` | acceptable |
| B | chroma-first, published | `#ccb2a5` | acceptable |

Preference **A (`#e7c0c1`)**, explicit, no veto, no note.

## Defects in this round's own machinery (correction-of-record)

1. **The pre-declared outcome tables are ambiguous** — T1 row 3's "≤2" clause and T2 row 3's
   "both graded the same" fire simultaneously with the preference rows; rows were not
   mutually exclusive. Future ROUND.md outcome tables must be MECE. Because the tables are
   defective, the mechanical row-actions are NOT executed as written; DECISIONS.md D9 rules
   instead, grounded in the reviewer's verbatim notes.
2. **Schema mismatch:** ROUND.md promised four role grades + veto; the pairwise schema
   carries one grade per side and no verdict-level veto. Future pairwise ROUND.md must
   describe what the page actually collects.

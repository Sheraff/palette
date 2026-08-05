# Round 3a analysis — decoded, verified, and what the notes say

**Batch `phase2-cal-014`, kind `calibration` (absolute), pushed 2026-08-05T11:57:55.452Z,
answered 12:02:22–12:04:33Z, `batch-complete` 12:04:38.514Z, author `{human, flo}`.**
Decoded against three independent sources: the warehouse
(`research/v3/data/warehouse/warehouse.jsonl`, via `src/warehouse/cli.ts` and by direct read),
the batch log (`research/v3/data/review-server/batches.jsonl`), and this round's `items.json` +
`mapping.private.json`. No side blinding exists in absolute mode; what was withheld was the
candidate's identity, which `mapping.private.json` supplies: `p2-tree-cycle2-v1` = **p2-tos**,
`p2-tos-0.3.0-cycle-2-merged`.

## Grade vocabulary — what the store actually holds

The warehouse stores a **closed vocabulary token**, not a number: `gradeA ∈
{strong, acceptable, weak, unacceptable}` (`src/warehouse/records.ts:58`, with `GRADE_RANK`
0–3 best-first). ROUND.md:122 declares the reading *"1 unacceptable, 2 weak, 3 acceptable,
4 strong"*. The numerals below are that document's mapping applied to the stored token; they
are **not** a field in any record.

## Decoded per-item table

| # | itemId (suffix) | class (`mapping.private.json`) | grade | numeral | encl. surface | verbatim note |
|---|---|---|---|---|---|---|
| 1 | `…39b7dbc802fd` | `unreadable\|flat\|sc0\|ac0` | **unacceptable** | 1 | **yes** | "maybe the white foreground works. All other colors are incorrect and don't seem to belong to this artwork" |
| 2 | `…7960ad020c7a` | `partitioned\|flat\|sc0\|ac0` | **acceptable** | 3 | **yes** | "The white foreground does not seem to be a color that is part of the artwork, and as a result the identity of this artwork is not well conveyed by this palette" |
| 3 | `…c54a1d85db99` | `unreadable\|flat\|sc1\|ac0` | **weak** | 2 | no | *(empty)* |
| 4 | `…0155369bb7b9` | `laminar\|grad\|sc0\|ac0` | **unacceptable** | 1 | **yes** (3 nodes) | *(empty)* |
| 5 | `…f57bc46a3680` | `flat\|flat\|sc1\|ac0` | **unacceptable** | 1 | no | "unreadable foreground" |
| 6 | `…d5fd547eb7f3` | `laminar\|grad\|sc0\|ac1` | **weak** | 2 | **yes** | "- background should be white\n- foreground is hard to read" |

**Grade distribution: unacceptable ×3, weak ×2, acceptable ×1, strong ×0.**
**Vetoes: none** — zero `veto` records for this batch, and the calibration payload does expose
the veto route (`server.ts:985`, `server.ts:1094`), so "no veto" is an answer, not a missing
instrument. **Notes: 4 of 6 items carry free text; items 3 and 4 carry none.** Zero
`endorsed-sample`, zero `note`, zero `amendment` records. Every verdict `confound: false`.

## Verification statement

1. **Row counts.** Direct read of `warehouse.jsonl` filtered to `batch.id == "phase2-cal-014"`
   returns **13 rows: 12 `verdict` + 1 `batch-complete`** — identical to `cli.ts query --raw`.
   Resolved (`--latest`) returns **exactly 6 verdicts, one per item**. All 13 authored by
   `{kind: human, id: flo}`.
2. **Item identity, end to end.** The id sets of `items.json` (6), the batch log's
   `batch.items` (6), the batch log's `items` (6), `mapping.private.json._items` (6) and the
   `batch-complete` record's `releasedItemIds` (6) are **equal**. For all 6, the published
   `palette` and `fingerprint` in `items.json` are **byte-identical** to the batch log's, and
   `imagePath` matches on all three sources.
3. **Tokens.** This kind mints **no answer token**. `answerTokens` is created only for
   bracketing and free-text rounds (`server.ts:1366`, `server.ts:1509`); the calibration
   payload serves `itemId` directly (`server.ts:971`). The served ref is therefore
   `phase2-cal-014/<itemId>`, exactly what every verdict row carries — there is no token↔id
   map to decode, and none was needed.
4. **Palette custody.** Every one of the 12 verdict rows carries `sideA.paletteHash` equal to
   the batch log's `paletteHash` for its item, and `artwork.sha256` equal to the batch log's.
   All rows: `sideB = null`, `gradeB = null`, `preference = null`, `mode = "absolute"`.
5. **Repeats / supersession.** The calibration kind does not repeat items; it **supersedes on
   re-answer**. The 12 rows resolve to 6 as: item 1 ×3, item 2 ×4, item 3 ×1, item 4 ×2,
   item 5 ×1, item 6 ×1. **Nothing is averaged.** Of the 6 superseded rows, 5 changed only the
   comment (progressive saves of the same sentence at an unchanged grade). **One changed the
   grade: item 4 (`…0155369bb7b9`) `weak` → `unacceptable`, 1.9 s apart (12:03:58.475 →
   12:04:00.358), comment empty both times.** The later row stands; both are reported because
   a grade movement is not a typing artefact.
6. **Result: clean.** No orphan rows, no id mismatch, no unanswered item, no palette-hash
   drift, no confound flag, no amendment.

### One freshness caveat found while scanning (not a join defect)

Scanning the whole warehouse by artwork sha256 rather than by batch: **item 5
(`…f57bc46a3680`, sha `5bc626b7…`) was seen by the same reviewer on 2026-08-03** in
`bcde-validation-1` — 8 `oracle-label` rows (`grain_or_noise=no`, `overlays=[none]`,
`has_dominant_subject=single`, `subject_kind=object`, `subject_area_band=under_25`,
`has_signature_color=yes`, `text_dominance=not_applicable`, `signature_carrier=background`).
Those are artwork-attribute labels, not palette grades, so ROUND.md's claim ("never been
graded, never been tuned against, never in a falsifier run") is intact as written. But the pool
exclusions were `demo-20` and `endorsed-173` only; the oracle corpus was not excluded, and this
cover is not unseen by the reviewer. The other 5 items appear nowhere else in the warehouse.
Recorded because the reviewer's own earlier label — `signature_carrier = background` — sits
beside a published palette whose four roles are near-neighbour pale greens (`#b7f38f` / `=` /
`#b9e0b1` / `#9ead9a`) graded "unreadable foreground".

## What the pre-declared outcome table reads (ROUND.md:125-134)

| pre-declared trigger | fires? | evidence |
|---|---|---|
| ≥ 4 of 6 at 3+ | **no** | 1 of 6 (item 2) |
| **≥ 4 of 6 at ≤ 2** | **YES — 5 of 6** | items 1, 3, 4, 5, 6 |
| foreground failing role on ≥ 3 items | **unreadable as specified** | 2 items name foreground failing on readability (5, 6); a 3rd names it failing on identity (2); item 1 names it favourably |
| accent failing role on ≥ 3 items | **no** | **zero** notes name the accent |
| surface named on items 1, 2, 4, 6 | **no** | **zero** notes name a surface, border, mount or frame |
| item 2 read as background ≈ surface | **no** | item 2 is the round's only `acceptable`; its note is about the foreground |
| any "this should be a ramp" note | **no** | no note asks for a gradient anywhere |
| any veto | **no** | zero veto records |

## Recurring reviewer principles — the tally

**Foreground readability (round-1 OUTCOME.md obligation 1: "the dominant failure class",
7 of 10 unacceptables).** **Recurs, 2 items verbatim on readability grounds:** item 5
"unreadable foreground" (unacceptable), item 6 "foreground is hard to read" (weak). Cycle 2
rebuilt the role stage specifically against this class; on fresh covers it is still the only
role named as failing anywhere in the round.

**Identity coverage / "presence ≠ eligibility" (D3 salience-gates-identity; D4 identity-coverage
is a grading axis).** **Recurs, 2 items verbatim:** item 1 "All other colors are incorrect and
don't seem to belong to this artwork"; item 2 "…not a color that is part of the artwork, and as
a result the identity of this artwork is not well conveyed by this palette". Item 2 is the
round's *highest* grade and its whole complaint is identity — D4's "draws complaints even when
everything published is fine" reproduced on a fresh cover. Weight to note: `validate.ts` asserts
**every published colour is an exact triple of the artwork, decoded by its own `sharp` call**,
so "incorrect / don't belong" is being said about colours that are literally pixels of the
cover. That is D3's presence-vs-eligibility distinction, restated by the reviewer without
prompting, now with a hard guarantee behind the "presence" half.

**Margins, not floors (D7).** Item 2 was staged as the round's deliberate margin probe
(background `#131919` vs surface `#182023`, 0.0304 OKLab, ROUND.md:86-88). **It did not draw a
complaint** — it is the round's only `acceptable`, and its note is about the foreground. One
observation, in the negative direction: 0.0304 was not read as one colour. D7's principle is
not contradicted and is not confirmed; it now has one data point of a margin that survived.

**Phantom gradient (round-1 obligation 3) and the missed-gradient direction (D4).** **Neither
recurs.** Items 4 and 6 published ramps; no note says "this artwork is flat, not a gradient"
(round 1's `…c5ac790164` complaint) and no note on the flat items (2, 5 — the two ROUND.md
named as the structural candidates) asks for a ramp. D4's missed-gradient direction did **not**
fire without a label. Against this, item 4 is a published-gradient item graded **unacceptable
with no note at all** — the round's largest evidence gap, and the one item whose grade moved.

**Enclosure surfaces (D3 "surface may be a depicted object's surface"; integration-NOTES §5).**
4 of 6 items (1, 2, 4, 6) publish an enclosure-shaped surface, per `mapping.private.json`
(`publishedSurfaceIsEnclosureShaped: true`; item 4 publishes three such nodes, all at depth 0,
areaFraction 1). **The reviewer said nothing about any of them.** No note contains "surface",
"border", "frame", "mount", or any equivalent. Grades on those four: unacceptable, acceptable,
unacceptable, weak. ROUND.md:99-104's condition for closing §5's caveat ("if a surface note names
a border, a mount or a frame") is **not met**, and its condition for demoting the enclosure
branch ("a complaint") is **not met either**. The nearest thing to evidence is item 1's blanket
"all other colors are incorrect", which covers the enclosure surface `#a47d7e` without naming it
as a surface. **§5's caveat stands exactly where staging left it — the round spent four of six
items on this question and returned nothing decidable.**

## New shapes

1. **"- background should be white"** (item 6, weak). The published ramp is
   `#646464` → `#fafafa`; white is the ramp's **last stop**, which `validate.ts` requires to be
   the **surface** ("`stops[0]` IS the background, the last stop IS the surface"). The reviewer
   is asking for the white end to be the background. Prior gradient complaints across the
   campaign concerned ramp *presence* (phantom/missed) and *stop count* (D5 banding); an
   **endpoint-assignment** complaint on a ramp whose colours are both accepted is new. The
   alternative reading — that he wants a flat white background and no ramp — is **not supported
   by the words used**: he did not say flat, and did not say gradient. Not resolved here.
2. **"All other colors are incorrect and don't seem to belong to this artwork"** (item 1,
   unacceptable). A blanket three-role rejection in one clause, with the foreground exempted
   ("maybe the white foreground works"). Round 1's notes were per-role ("fg unreadable",
   "surface≈accent", "accent wrongly collapsed"); a whole-palette off-artwork verdict with one
   role carved out is a new shape, and it is the shape that makes the per-role outcome rules
   unreadable on this item.

## Contradictions with standing decisions — flagged, not resolved

**(a) D3, "identity can outrank legibility" — the white-foreground precedent inverts.** D3
records the reviewer demanding a white foreground on a light field *because the artwork's title
is white*, folded into P2 as "the artwork's own text colour is the foreground's first candidate".
This round, the same reviewer names a white foreground as the defect on item 2 ("does not seem to
be a color that is part of the artwork") and only conditionally accepts one on item 1 ("maybe …
works"). The two are reconcilable — D3's rule is *the artwork's own text colour*, not *white* —
but the published `#fcffff` / `#fcfefd` were selected by the rebuilt text-colour-leads foreground
rule and the reviewer says they are not the artwork's. **Flagged: evidence about the text
detector's colour recall (D5's "missing title yellow"), pointed at the exact rule D3 validated.**

**(b) The gradient endpoint-identity invariant vs item 6's note.** See New shape 1. `validate.ts`
and the contract fix background = `stops[0]`, surface = last stop. "Background should be white"
cannot be satisfied without inverting that pairing or re-ordering the ramp. **D6 governs stop
*count* and guide stops and does not cover endpoint assignment — this note lands in a gap
between D6 and the contract.** Flagged.

**(c) ROUND.md's instrument description vs the instrument.** ROUND.md:3-4 declares
"**Answers per item:** the four role grades (1–4), then an optional veto and a free note."
The calibration instrument records **one grade per item** — `gradeA`, a single vocabulary token
(`server.ts:948` "one palette per item, one grade to give"; `server.ts:964-965` `mode:
"absolute"`, `grades: GRADES`) — plus a comment, a veto route and an endorsement route. There
are no per-role grades in the payload, none in the schema, and none in the 12 recorded rows.
**Consequence: the two pre-declared outcome rules keyed to a failing *role* (ROUND.md:129-130)
have no recorded answer to read.** They can only be inferred from free text, on 4 of 6 items,
which is why the foreground row of the outcome table reads 2 or 3 depending on whether an
identity complaint about the foreground counts as "the foreground is the failing role".
**Flagged; not resolved.** The distribution rules (≥4 at ≤2, ≥4 at 3+) are unaffected.

**(d) D1, chroma-first accent ordering — not priced by this round.** Zero notes name an accent.
Item 1's blanket rejection covers a chroma-first accent (`#999fbf`, "London Fog") without naming
it; item 5's `#9ead9a` and item 3's vivid `#106afc` drew no comment at all. D1's exchange-rate
pairwise item (`…35b967964d`, the two accents) is **not in this batch**. **The accent order is
neither challenged nor defended here.** Flagged so it is not read as silent endorsement.

## What is established, strictly

- On six fresh covers of six different published classes, **5 of 6 palettes graded at or below
  "weak"**, one "acceptable", none "strong". ROUND.md's `≥ 4 of 6 at ≤ 2` outcome fires.
- **Foreground is the only role the reviewer named as failing**, on 2 items for readability and
  a 3rd for identity. Accent: named zero times. Surface: named zero times.
- **Identity ("these colours don't belong to this artwork") is doing as much of the grading as
  readability** — against colours proven to be exact pixels of the cover.
- The enclosure/polaroid question, the D7 margin probe, and D4's missed-gradient direction each
  had their item(s) in front of the reviewer and **returned no decidable evidence**; only the
  margin probe returned a usable negative (0.0304 not read as one colour).

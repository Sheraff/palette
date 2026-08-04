# Round 2 — calibration. Nine covers, one palette each.

**For the orchestrator, not the reviewer. Nothing in this file is served.** The reviewer-facing
side-car (`sidecar.data.json`) is blinded: no prototype name, no arm label, no mechanism text, and —
new this round — **no signal of which four covers were graded before**. §"The re-grade table" below
carries the round-1 grades that make this round readable; it exists so the decode is written down
before the verdicts arrive, and it must not travel to the reviewer in any form.

Candidate `p3-fields-0.3.0`, commit `bead404`. Staged from the worktree `.worktrees/p3-fields`.

---

## The question this round answers

> **Did the evidence-driven fixes move the failure classes without breaking what was strong?**

Round 1 bought three things: two ink covers graded *weak* for foreground readability, one luminance
cover graded *weak* for accent readability, and an *acceptable* with a prescription (swap foreground
and accent on `item-19`). 0.3.0 was built from exactly those three notes plus a ρ\* move. This round
asks whether the fixes landed — on the same four covers — and whether they hold on covers the fixes
were **not** derived from.

That second half is the round's real weight. Four re-grades on their own would answer "did we fit
these four covers", which is a question with a known and unflattering failure mode; the P5 arm's
fresh-cover overfitting flag (`../../EVIDENCE_2026-08-04.md` item 9) is now a standing rule for it.
So five of the nine items are drawn from `coverage-set-1`, which is **disjoint from `demo-20`** — no
cover in the fresh five has ever been graded, and none was looked at while 0.3.0 was written.

---

## Proposed kind

**calibration** — absolute grading, one palette per item, no comparison
(`REVIEW_UI.md` §5; `parseCalibrationBatch` in `src/review-server/batch.ts`).

| | |
| --- | --- |
| Mode | absolute (single palette on the mock) |
| Grade scale | 1–4, the four warehouse grades: strong / acceptable / weak / unacceptable |
| Veto | available per item |
| Notes | per-item, free text |
| Items | 9 |
| Purpose field | `calibration` |

Nine is inside the standing 4-to-10 band. It is the smallest number that carries four re-grades and
still leaves five fresh covers, one per fresh criterion.

### Item ids and row order

`itemId` is **round-scoped and carries nothing**: `r2-item-0` … `r2-item-8`, N being the row
position. Round 1's ids were the `demo-20` run index, and four of this round's covers *are* round-1
covers — reusing `item-00` for a different palette of the same cover is the one naming mistake that
would make two batches impossible to read together.

Row order **interleaves the two provenances on purpose**: fresh at 0/2/4/6/8, re-grade at 1/3/5/7. A
reviewer who worked out that four consecutive items were covers they had seen before would be
grading with a memory of their own earlier grade in hand, which is precisely what a re-grade must not
buy.

---

## The item table

| itemId | cover, as it reads | selection class | regime | gradient | contract |
| --- | --- | --- | --- | --- | --- |
| `r2-item-0` | *Waiting for the Party* — magenta neon rectangle on night foliage, white serif title on a wood plank | **busy / salience risk** | luminance | 4 stops (ρ 0.755, radial) | pass |
| `r2-item-1` | *Daniel Marques — The Remixes* — greyscale swoosh, large black type | **re-grade**: ink lump fix | ink | 2 stops | pass |
| `r2-item-2` | *2nd Collection / Hydeout Productions* — abstract orange-and-pink painting, faint pale type bottom-left | **swap fired on a tie-width margin** | ink | — | pass |
| `r2-item-3` | *8 Is Enough (Cypher)* — yellow ground, red paint, black bars | **re-grade**: the prescribed role swap | ink | — | pass |
| `r2-item-4` | *Parody Kings* — greyscale figure on a studio backdrop with a vignette | **published gradient far above ρ\*** | ink | 2 stops (ρ 0.977, radial) | pass |
| `r2-item-5` | *Smoke & Fire (Remixes)* — white card floating on an orange/pink field, red ring mark | **re-grade**: ink foreground contrast | luminance | — | pass |
| `r2-item-6` | *In Love Again* — white brick wall, red brush stroke, white script + dark sans type, red couch | **ink regime, low-contrast true ink** | ink | 4 stops (ρ 0.769, linear) | pass |
| `r2-item-7` | red-tree illustration on cream, no legible type | **re-grade**: accent readability | luminance | — | pass |
| `r2-item-8` | *Emberlight Serenade* — dark cinematic portrait, white dripping title | **swap fired on a wide margin** | ink | — | pass |

Regime is `intermediates.foregroundRegime` read from the `P3_DIAG` chain, never guessed. Cover
appearance — *is there type*, *is it a photograph*, *is it busy* — is the one judgment no number
carries, and it was made by eye from `shortlist-sheet.jpg` (rebuild with `shortlist-sheet.mjs`) and
from full-resolution reads of the five finalists.

---

## Why these five fresh covers

All five are drawn from `run-coverage-220-0.3.0.jsonl` (220 rows, 198 contract-passing). Every
number below is from that run's `P3_DIAG` chain — the same 220 records W9's `BASELINE-0.3.0.md`
reports from. **Ranks are over the 198 contract-passing rows**, not all 220.

### `r2-item-2` and `r2-item-8` — the swap comparator, one plausible and one risky

The comparator fires on **80/220 = 36.4%** of the corpus (73 of the 198 contract-passing rows). W9
recorded that rate with the note that it "is not a rare corrective"; nothing has validated it on a
cover it was not derived from. Round 1 bought the comparator on **one** cover. These two items ask
whether a third of the corpus is being re-labelled correctly, and they are chosen to be the two ends
of the evidence the comparator itself uses — the **min-ramp |APCA| margin** between the accent
candidate and the foreground candidate, which is the whole of its firing condition.

- **`r2-item-8` — margin 95.96 |APCA|** (foreground candidate `#2a1e06` at **2.67**, accent candidate
  `#ffffff` at **98.64**). The pre-swap foreground was a near-black on a dark cover, i.e. invisible;
  the swap published `#ffffff`, and the cover's title *is* white. This is the campaign's
  black-text→black-foreground identity finding arriving in mirror image, and if the comparator is
  ever right it is right here.

  It is the **5th-widest** of the 73. The four wider rows were passed over for stated reasons, so the
  choice is not a quiet preference: `#53` (margin 100.85) and `#19` (96.92) both collapse surface
  onto background, `#46` (100.80) publishes a 4-stop gradient, and `#163` (96.92) has field ends
  `#ffffff` / `#ffeded` — a near-twin pair that would drag the sibling-distinctness watch into an
  item bought to grade the swap. `r2-item-8` collapses nothing, publishes no gradient, and its field
  ends (`#170a02` / `#374d0d`) are plainly different colours.

- **`r2-item-2` — margin 0.012 |APCA|** (foreground candidate `#f0a17a` at **17.559**, accent
  candidate `#96483c` at **17.571**). This is the **narrowest firing margin of all 73**. The
  comparator's strictness is `>`, never `≥`, so a tie does not fire — but 0.012 is not a tie, it is a
  *decision*, and it is the whole reason `#96483c` is the text colour rather than the decoration. The
  two colours are far apart to the eye (a mid brown against a light peach), so a difference well
  inside any measurement noise is producing a fully visible re-labelling. If the reviewer grades this
  down and grades `r2-item-8` up, the comparator needs a margin band, not removal.

### `r2-item-0` — busy cover, salience risk (`EVIDENCE` item 6 watch)

`EVIDENCE` item 6: *presence ≠ eligibility* — colours that exist only as accidental shadows are
ineligible for identity roles, and the named P3 exposure is that "rank orderings could elect a
well-supported shadow lump (**accent tier especially**)". This item is the sharpest instance of that
shape in the pool.

- **Edge fraction 0.9845 — the highest of the 198.** The cover is a night photograph of foliage: it
  is nearly all edge, and nearly all of it is in shadow.
- The published accent is **`#8b7156`**, a muddy wood-brown, from a **tier-2** candidate flagged
  **`fragile: true`** — 17 of the 198 rows carry a fragile accent, and this is the busiest of them.
- Its population is **1449 px**: not a stray pixel but a *well-supported* lump, which is the exact
  case item 6 warns about. Its min-ramp |APCA| is **20.68** against the foreground's 59.18.
- The foreground `#fcffff` is the title's white and is not in question.

The question the item buys: **does a shadow colour get published into an identity role, and does a
human call it one?** Any note reading "that colour is just a shadow / part of the background / an
artifact" is the salience principle firing on P3.

### `r2-item-6` — ink regime, low-contrast true ink (`EVIDENCE` item 8 arbitration)

`EVIDENCE` item 8 recorded a case where **identity outranked legibility**: a white foreground was
demanded on a light field because the title's ink is white. W8 amended 0.3.0 mid-flight on that
basis — min-ramp |APCA| is a *preference within the ink population*, never an eliminator. Round 1's
complaints (items 00 and 02, both "foreground is hard to read") point the other way. The tension is
real and pre-registered; this item is the fresh-cover half of resolving it.

- **Published foreground `#180f0a` at min-ramp |APCA| 6.12** — the lowest published-foreground
  min-ramp among contract-passing **ink-regime** rows that neither swapped roles nor collapsed the
  accent and are not in the ρ\*-borderline pool. The next lowest in that pool is **19.93**, so this
  is not one of a cluster; it is the case.
- The cover genuinely carries near-black ink: "COCOY CLARAVALL / PAUL TAGLE" is dark sans type on a
  white brick wall. Identity says publish it.
- The field runs `#5a0905` (the dark red brush stroke / couch) → `#d4d0cd` (the wall). The ink is
  legible against the wall end and dies against the red end — which is what a min-ramp of 6.12 *is*.
  Source population 14 px, support 0.0016 against the 0.001 floor.
- The ink cascade chose `darker-convention` with `contrastPreferenceApplied: false` — the 0.3.0
  contrast preference did not fire here, so the grade reads on the amendment directly.

A grade of ≥ 3 says identity wins and the amendment was right. A *weak* with a readability note says
the amendment traded a graded-down failure for a different graded-down failure.

### `r2-item-4` — a published gradient far above ρ\* (gradient sanity)

Round 1's `item-11` drew *"i'm not sure i recognize a gradient in that artwork"* — the false-gradient
watch triggered, and 0.3.0 answered by moving ρ\* to **0.62** on a measured distribution that is
explicitly **not** its anchor. The queued flat-vs-gradient pairwise round (QUEUE.md entry 2) will
anchor it from the *borderline* pool. This item deliberately asks the other question: **is the
threshold's confident end sound at all?**

- **ρ = 0.977 — the highest best rank correlation in the whole 220-row run**, 0.357 above ρ\*.
- **Not in `gradient-borderline-0.3.0.json`**, whose 20 members are the draw pool for the pairwise
  round. Nothing here contaminates that round. (This is also why the low-contrast ink item is
  `r2-item-6` and not the otherwise-better-matching `#44`: `#44` is the borderline pool's **closest
  member above ρ\***, and showing it here with a published gradient would anchor a reviewer who later
  has to answer "does this artwork read as shaded or flat?" about the same cover.)
- Published gradient is 2 stops, `#4b4b4b` → `#7a7a7a`, radial — the studio backdrop's vignette.

If the maximum-correlation artwork in the corpus draws a "this is flat" note, the problem is not
where ρ\* sits, it is that the statistic does not measure what the round is asking about. That is a
much larger finding than a threshold move, which is why it is worth one item.

---

## The re-grade table — ORCHESTRATOR CONTEXT, NOT SERVED

The four re-grades and what they are re-grading. **Round-1 grades are here so the comparison is
written down before round 2's verdicts exist**; they are not shown to the reviewer, are not in
`items.jsonl`, and are not in the side-car.

| this round | round 1 | round-1 grade | round-1 note | 0.2.0 palette | 0.3.0 palette |
| --- | --- | --- | --- | --- | --- |
| `r2-item-5` | `item-00` | **weak** | "foreground is hard to read on top of surface" (superseded revisions also flagged accent) | `#e9e6df` / `#f83902` / `#d9004b` / `#9b2116` | `#e9e6df` / `#fb3f00` / **`#a1190d`** / **`#ee9269`** |
| `r2-item-1` | `item-02` | **weak** | "foreground is hard to read on top of surface"; fg `#c8c8c8` where the cover's ink is black | `#ffffff` / `#dedede` / `#c8c8c8` / `#010000` | `#ffffff` / `#dedede` / **`#010000`** / **`#c5c5c5`** |
| `r2-item-7` | `item-07` | **weak** | "accent is hard to read on top of surface or background" | `#f5f5f5` / `#ededed` / `#df525a` / `#e4e8cd` | **`#ededed`** / **`#f6f6f6`** / `#df525a` / **`#dee4c2`** |
| `r2-item-3` | `item-19` | **acceptable** | reviewer prescribed the fg↔accent role swap; bg/surface ratified | `#fdd001` / `#fe0000` / `#f9f9f7` / `#000000` | `#fdd001` / `#fe0000` / **`#010101`** / **`#fbfcff`** |

Order is background / surface / foreground / accent. Round 1's aggregate was 3 strong / 2 acceptable
/ 3 weak; the three *weak*s are all in this table.

### What the diagnostics say about each move — read this before the verdicts

Three of the four moved the way the fix intended. **None of the four moved for quite the reason the
0.3.0 scope named**, and that matters for attribution:

- **`r2-item-1` (`item-02`) — the black ink is published, but the lump clause is not what published
  it.** The ink cascade's own choice moved only `#c8c8c8` → `#c5c5c5` (min-ramp 14.53); it selected
  `extreme-lump` over masses `[4, 1177]` at gap ratio 0.388 with the contrast preference applied. The
  colour that reached the foreground slot is `#010000`, at min-ramp **89.37**, and it got there
  because the **role-swap comparator fired**. So `item-02`'s fix is attributable to 0.3.0 change #2
  (the swap), not change #1 (the lump clause) — the lump clause moved this cover by three grey
  levels. If `r2-item-1` grades up, the swap gets the credit.
- **`r2-item-3` (`item-19`) — the prescribed outcome, reached without the comparator.** Foreground is
  now `#010101` and accent `#fbfcff`, which is exactly the reviewer's prescription, and background /
  surface are unchanged as ratified. But `roleSwapApplied: false`: the foreground candidate already
  had min-ramp **42.40** against the accent candidate's 26.09, so the *ink cascade* now lands on
  black by itself (`darker-convention`, lump masses `[3, 275]`, gap ratio 0.866) and the accent search
  walked to cursor 9 for `#fbfcff` (tier 2, `fragile: true`, 1078 px). The comparator that this cover
  motivated does not fire on this cover.
- **`r2-item-5` (`item-00`) — the cover left the ink regime.** Round 1 recorded `item-00` as
  `foregroundRegime: "ink"`. At 0.3.0 it is **luminance** (polarity `trimmed-contrast`, foreground
  cursor 7). Its foreground darkened `#d9004b` → `#a1190d` (min-ramp 24.32) and its accent lightened
  `#9b2116` → `#ee9269` (tier 2, `fragile: true`, 469 px, min-ramp 18.38). **This is not the ink fix
  applied to `item-00`; it is `item-00` no longer being an ink cover.** Whatever this grades, it is
  not evidence about the ink cascade.
- **`r2-item-7` (`item-07`) — the accent moved least, and may not have moved enough.** The accent
  search walked to cursor 7 under 0.3.0's new min-ramp feasibility and landed on `#dee4c2` at
  min-ramp **7.55** — above the 2.5 floor, but only just, and 0.3.0's floor is the contract's default
  near-zero floor rather than a legibility bar. The field ends also swapped and both moved
  (`#f5f5f5`/`#ededed` → `#ededed`/`#f6f6f6`), so the pair is still a near-twin. The honest
  expectation is that round 1's accent complaint **repeats**.

---

## Exclusions

- **Contract-failing covers are excluded, and the check was re-derived rather than taken on report.**
  `validatePalette` over all nine source run rows: **9 pass / 0 fail** (`verify.ts` check 6). The
  coverage run's own scorecard is 198 pass / 22 fail over 220, and every one of the 22 was outside
  the draw. Round 1's precedent: a palette that already fails the contract is not a question — the
  invariants proved it for free and grading it spends reviewer bandwidth confirming a known result.
- **`demo-20` is excluded as a source of fresh items** (`EVIDENCE` item 9). `coverage-set-1` and
  `demo-20` share no artwork; the four re-grades are the only `demo-20` covers here, and they are
  here by name.
- **The 20 members of `gradient-borderline-0.3.0.json` are excluded**, to keep the queued
  flat-vs-gradient pairwise round's draw pool unseen. Two covers that would otherwise have been
  strong picks (`#44`, `#69`) were dropped for this reason alone. `#44` in particular is the
  borderline pool's **closest member above ρ\***, and it is the best fresh match in the corpus to
  `EVIDENCE` item 8's recorded case — a near-white foreground (`#dff1f5`) demanded on a light field
  end (`#ceecec`) at min-ramp **5.54**, below `r2-item-6`'s 6.12, with the contrast preference
  applied and overruled. It was given up to protect the pairwise round; `r2-item-6` is the
  second-best instance and the round is slightly weaker for it. Recorded so the trade is visible.
  Cross-checked against `../round-3-gradient-pairwise/`, staged concurrently: **none of this round's
  nine covers appears in it.**

## A count the round did not buy, stated so nobody reads it as evidence

**Four of the nine items publish a gradient** (`r2-item-0`, `-1`, `-4`, `-6`), and only **one**
(`r2-item-4`) was selected for it. The other three came with a gradient attached to a cover chosen
for salience, ink-lump and ink-contrast reasons. So if gradient complaints appear across those three,
that is **unpurchased** evidence: real, worth recording, and not a rate — a rate over items selected
on other criteria measures the selection, not the corpus. The corpus rate is W9's: 86/220 = 39.1%.

---

## Outcome branches

What the orchestrator does with each result. **Written before the grades exist.**

### (a) Swap-validation branch — `r2-item-2` and `r2-item-8`

The comparator re-labels 36.4% of the corpus on a scalar comparison with no width requirement. Three
readings, and each has a different action:

- **Both ≥ 3.** The comparator is validated on breadth at both ends of its own evidence, including
  a 0.012-|APCA| firing. It stops being the thing to tune. Note that this is the *stronger* result
  and also the one that should be believed least without the margin split below — check the notes for
  whether `r2-item-2`'s text colour is mentioned at all.
- **`r2-item-8` ≥ 3 and `r2-item-2` ≤ 2** — the pre-registered split. The comparator is right when
  the margin is large and wrong when it is inside noise, which means the defect is the **missing
  margin band**, not the mechanism. → next iteration: a firing threshold on the margin (a tie band in
  the same family as 0.2.0's three), anchored on whatever margin distribution the graded cases
  bracket. This is a scalar comparison against a scalar threshold and stays inside the discipline
  line. Do **not** widen it into a re-ranking.
- **`r2-item-8` ≤ 2.** The comparator is wrong at the end where it should be most right — a near-black
  foreground on a dark cover was replaced by the cover's actual white title and a human still called
  it worse. That contradicts round 1's own prescription and the campaign's black-text→black-foreground
  evidence at once. → the comparator is suspended pending a cross-arm check, and the contradiction is
  reported upward in §7 rather than resolved locally. Two reviewer findings cannot both be honoured
  and this orchestrator does not get to pick.

### (b) Salience branch — `r2-item-0` (`EVIDENCE` item 6)

- **A note naming the accent as a shadow / artifact / "part of the background"** — in any wording —
  is the salience principle firing on P3, on the exact shape item 6 predicted (accent tier, tier-2
  fragile, well-supported lump). → **eligibility, not ordering, is the defect**, and the fix belongs
  in the ink/annulus coherence machinery: a support-*coherence* term that a 1449-px shadow lump fails
  and a 1449-px designed mark passes. Adding a contrast or size term to the accent ordering would be
  the wrong fix and is pre-emptively refused here, because item 6 is about **eligibility**.
- **Graded ≥ 3 with no such note.** The exposure is not firing at the busiest cover in the corpus
  with a fragile tier-2 accent. That is one cover, so it does not close item 6 — but it does mean the
  next iteration spends nothing on it, and the diagnostic (publish-time salience/coherence numbers)
  is deferred rather than built.
- **Graded ≤ 2 for a reason that is *not* the accent.** Read the note before acting; a busy cover has
  many ways to be wrong and this item's purchase is the accent specifically.

### (c) Identity-vs-legibility branch — `r2-item-6`, with `r2-item-1` and `r2-item-5`

The arbitration `EVIDENCE` item 8 opened and W8's amendment answered on a guess.

- **`r2-item-6` ≥ 3.** Identity wins on a fresh cover: publishing the artwork's own near-black ink is
  right even at min-ramp 6.12. The amendment ("preference, never an eliminator") is ratified and
  round 1's readability complaints are re-read as *ordering-within-the-ink-population* complaints,
  not as a demand for a contrast floor. → no contrast eliminator, ever; the ink work continues inside
  the population.
- **`r2-item-6` ≤ 2 with a readability note.** The amendment traded one graded-down failure for
  another. → the arbitration is **unresolved by numbers** and goes upward as a §7 question with both
  covers attached, because it is a cross-arm policy question (the P5/P2 finding and P3's own round-1
  notes disagree) and not a P3 tuning knob.
- **The tie-break, if the two disagree:** `r2-item-1` is the same question with the ink at the *other*
  extreme — `#010000` at min-ramp 89.37, where identity and legibility agree. If `r2-item-1` grades
  up and `r2-item-6` grades down, the boundary is somewhere between 6.12 and 89.37 and the next
  round's job is to bracket it, not to guess it.

### (d) Re-grade branch — what changes if the four regress

Round-1 grades: `r2-item-5` weak, `r2-item-1` weak, `r2-item-7` weak, `r2-item-3` acceptable.

- **The three weaks move to ≥ 3.** The evidence-driven fixes landed. Robustness work resumes as the
  primary thread (it is currently the worse reading: rendition-pair agreement fell 14.5% → 9.0%),
  and quality iteration steps back.
- **Any of the three stays ≤ 2 with the *same* complaint.** The fix did not fix it. Per item:
  `r2-item-1` repeating "hard to read" would mean publishing the true black ink is *still* not enough
  and the defect is the field, not the text role; `r2-item-7` repeating the accent complaint is the
  expected case and means 0.3.0's accent feasibility floor (the contract's near-zero default) is the
  wrong instrument, and the accent needs a **preference** term on min-ramp rather than a floor —
  which is a different change from the one made.
- **`r2-item-3` regresses below acceptable.** The reviewer's own prescription, implemented, made
  their grade worse. That is the most informative single outcome available this round and it
  outranks everything else in the report: it would mean prescriptions cannot be implemented literally
  and every future one needs a confirmation item before it ships. Report upward immediately.
- **Any re-grade regresses that round 1 graded ≥ 3.** None is in this round — deliberately. The three
  strongs (`item-11`, `item-12`, `item-14`) and the second acceptable (`item-05`) were **not**
  re-graded, so *"did the fixes break what was strong"* is answered here only indirectly, through the
  five fresh covers. **This is a stated gap in the round, not an oversight**: nine items would not
  hold four re-grades, five fresh covers and four regression guards. If the fresh five come back
  broadly weak while the re-grades improve, that pattern — improvement on the fitted covers,
  weakness off them — is the overfitting signal the P5 flag was raised about, and it fires branch (e).
- **`r2-item-5` in any direction.** It is a luminance cover now. Its grade is evidence about the
  luminance cascade and about nothing else; do not file it under the ink fixes whatever it says.

### (e) Overfitting branch — the fresh five against the four re-grades

- **Re-grades improve, fresh five come back ≤ 2 in three or more classes.** The fixes were fitted to
  the covers that motivated them. → the next iteration is not more fixes; it is a breadth instrument.
  Report upward as a paradigm-quality question, per round 1's branch (b), which this would be the
  measured version of.
- **Fresh five come back ≥ 3 broadly.** The mechanism produces plausible colour on covers nobody
  tuned it against, which is the strongest thing this round can buy and the thing round 1 could not.

### (f) Standing watches, carried from round 1

- **Twin siblings.** The reviewer forbids indistinguishable sibling pairs; our collapse triggers at
  the same-colour bar, which may be narrower than theirs. Three items here carry a close pair:
  `r2-item-7` (`#ededed` / `#f6f6f6` — the closest), `r2-item-4` (`#4b4b4b` / `#7a7a7a`), and
  `r2-item-1` (`#ffffff` / `#dedede`, which drew no complaint in round 1 at the same values). A
  "these two are the same colour" note on any of them is collapse-width calibration evidence. Count
  it; do not dismiss it as taste.
- **False gradients.** Four items publish one; see the count-the-round-did-not-buy note above.
  `r2-item-4` is the only purchased test, and it tests the confident end.
- **`item-14`'s near-neutral polarity proposal** (round 1 branch (d)) is still carried and still
  deferred behind this round, per QUEUE.md entry 3.

---

## Staging notes the orchestrator needs before pushing

1. **Two source runs, both at `bead404`'s code.** The four re-grade palettes come from
   `run-regrade-4-0.3.0.jsonl`, produced by this round (`regrade-4.txt` is its set file, `--no-cache`,
   `P3_DIAG` on). The five fresh palettes come from W9's `run-coverage-220-0.3.0.jsonl`. Neither was
   recomputed at staging time; `verify.ts` check 6 compares every item field by field against its run
   row.
2. **The re-grade run was checked for determinism three ways** and matched on all three: a second run
   with diagnostics **off** produced byte-identical palettes; `item-19`'s cover also appears in
   `run-adjudicated-197-0.3.0.jsonl` and that independent run's palette is identical; and the
   coverage run's `codeVersion` (`1cc28c1e…`) is the committed tree's. Recorded in `VERIFY.md`.
3. **The fingerprint says `bead404`; the measurements were taken at `2ccb19b`.** `git diff bead404
   2ccb19b -- research/v3/prototypes/p3-fields/src/` is empty, so the palettes are a statement about
   `bead404` and are fingerprinted as one. `dirty: false` is checkable, not asserted: the run's
   `codeVersion` equals the committed tree's.
4. **`items.jsonl` is flat; the push API is nested.** As round 1: `parseCalibrationBatch` wants
   `background` / `surface` / `foreground` / `accent` / `gradient` / `surfaceCollapsed` /
   `accentCollapsed` under an `item.palette` key, and wants `imagePath` **absolute**. One mechanical
   transform at push time. `selectionClass` is this file's bookkeeping and is not part of the push
   shape.
5. **Two collections this round, not one.** Round 1 was all `sharded-corpus`; `r2-item-2` is
   `music-artworks`. `collection` is derived per row with `deriveCollection`'s own rule from
   `src/review-server/batch.ts` and re-checked in `verify.ts` check 7 — round 1's build script
   hardcoded the string, which would have been wrong here.
6. **Round 1's `repoRelative` would have silently broken.** Its rule keeps the last two path segments,
   which turns `music-artworks/4/3/7/<file>` into `7/<file>` — a path that resolves to nothing. This
   round strips the worktree prefix instead and asserts the result resolves under the main checkout.

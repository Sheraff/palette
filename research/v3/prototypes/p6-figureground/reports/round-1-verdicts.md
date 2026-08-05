# p6-round-1 — released verdicts, de-blinded, verified, analysed

Batch `phase2-cal-008`, calibration, 6 items. Released 2026-08-05T06:40:35.452Z. Post-release
analysis per P6 SPEC directive 10. **This file does not act on the verdicts** — the orchestrator
does. The reviewer's words are quoted verbatim throughout and outrank every paraphrase below them.

---

## 1. Decode verification — PASSES, with three recorded observations

| check | result |
|---|---|
| batch is `phase2-cal-008` | yes — `data/review-server/batches.jsonl` line 34, `kind: "calibration"`, `pushedAt` 2026-08-05T06:12:20.182Z |
| batch is recorded released | yes — warehouse row `bc-msfpwxvg-f6564281`, `type: "batch-complete"`, ts 2026-08-05T06:40:35.452Z, `releasedItemIds` = all 6 |
| item count = 6 | yes — batch record 6 items, `itemCount: 6` on every verdict row, 6 released ids |
| every answered itemId joins to exactly one `private-mapping.json` row | yes — 6/6, join key = the 40-hex stem |
| no orphans in either direction | yes — mapping items = answered items = released items = batch items, as sets |
| grades in the calibration vocabulary | yes — all `gradeA ∈ {weak, unacceptable}`, `gradeB: null`, `preference: null`, `mode: "absolute"` (v3 vocabulary is `strong \| acceptable \| weak \| unacceptable`) |
| vetoes | none — `confound: false`, `confoundNote: null` on all 11 rows |
| palette bytes agree | yes — every verdict's `sideA.paletteHash` and `palette` match the batch record and the mapping row; `fingerprint.algorithmVersion = p6-figureground-0.1.0`, `gitCommit fb92dc9`, `dirty: true` throughout |

**Observation 1 — 11 verdict rows for 6 items.** The server records progressive autosaves, not one
answer per item. The answer is the row with the latest `ts` per `itemId`; all earlier rows on the
same item are prefixes of it. Item 1 is the only grade that *moved*: `unacceptable` at 06:36:53.642
→ `weak` at 06:36:55.727 (2.1 s later), then two note-extension saves at the same grade. The three
covers with a single row (items 2, 5, 4) were typed once. Recorded because a naive "count the
verdict rows" read of this batch would report 11 answers and a 5-way grade disagreement that does
not exist.

**Observation 2 — the release flag is not in `batches.jsonl`.** That file carries the push record
only (`kind`, `batch`, `pushedAt`, `items`). Release lives in the warehouse as the `batch-complete`
row. Both were checked; the release evidence quoted above is the warehouse row.

**Observation 3 — no `note` records.** The kit's standing free-text channel (`f`, stored as a
separate `note` record) was not used on this batch. Every reviewer word below came through the
per-item `comment` field on the verdict itself. Nothing is missing; recorded so a future reader does
not go looking for a second channel's rows.

---

## 2. The join table

De-blinded from `review-rounds/p6-round-1/private-mapping.json`. Predicted class is from `ROUND.md`
("two measured-healthy, two fg/accent-swap-arbitration, one pure-red-accent failure, one readability
residual") resolved against `reports/second-palettes.md` — the demo/set index is confirmed by exact
hex match against that report's §5 palette table, not by position.

| # | itemId | cover | bg / surface / fg / accent | predicted class (demo / set #) | grade | note, verbatim |
|---|---|---|---|---|---|---|
| 1 | `00007e976f2fb1819d1ec7e0cc2869f39d397ba3` | `00/00007e97….jpg` | `#e9e6df` / `#ece0e0` / `#f23704` / `#ebece7` | **fg/accent swap arbitration** (demo 0 / set 0) | **weak** | "white accent indistinguishable on top of white background and white surface" |
| 2 | `ab67616d00001e02000001335fe604d859a69094` | `00/…000001335f….jpg` | `#e0e0e0` / `#dcdadb` / `#fffeff` / `#e4e6e5` | **readability residual** (demo 2 / set 2) | **unacceptable** | "everything is white in the proposed palette. This does not reflect the artwork's identity, and it is also very hard to read" |
| 3 | `ab67616d00001e0200000ee5a62175fc8d58e0af` | `00/…00000ee5a6….jpg` | `#4b544f` / `#4c514b` / `#5a605c` / `#454c45` | **measured-healthy** (demo 6 / set 5) | **unacceptable** | "every color in this palette is very close together, not only does this not reflect the full range of the artwork's identity, but it also make it very hard to distinguish anything" |
| 4 | `ab67616d00001e02000018e9b0ec8fc5ac790164` | `00/…000018e9b0….jpg` | `#ffffff` / `#fdfff3` / `#70ba25` / `#f8faf9` | **fg/accent swap arbitration** (demo 12 / set 11) | **unacceptable** | "accent is indistinguishable, and missing the significant red from the artwork to completely reflect its identity" |
| 5 | `ab67616d00001e02000022e7e9d11c908479200b` | `00/…000022e7e9….jpg` | `#a36268` / `#965d66` / `#211f20` / `#8d5b64` | **measured-healthy** (demo 16 / set 14) | **unacceptable** | "accent is indistinguishable on top of surface (and a bit on top of background. And we are missing some of the gorgeous yellow-gold tones of the sunset depicted in this artwork" |
| 6 | `ab67616d00001e020000269ead63cf2376a6b67d` | `00/…0000269ead….jpg` | `#fdd000` / `#f7d909` / `#fd0100` / `#fafafa` | **pure-red-accent failure** (demo 19 / set 17) | **weak** | "- missing the significant black from the artwork\n- the artwork does not have 2 shades of yellow" |

Run provenance for all six: `p6-figureground-0.1.0`, code version `29a778c1…60e7de`, run
`p6-figureground-0.1.0-p6-round-1-6-20260804T224150247Z`, variant `cal-bd66a37d-v-c1b52a24`, no
escapes fired. Predecessor record `bc-msf8yakf-716f40fb` (retired for the blinding defect, 0
answers) contributed nothing to this batch.

**Tally: 0 strong, 0 acceptable, 2 weak, 4 unacceptable. 6/6 in the lower half. No vetoes.**

---

## 3. Per-item analysis against the round's question

The round asked: *did the algorithm put the readable colour in the foreground seat and the vivid
colour in the accent seat, or does the grading show those two seats swapped or washed out?*

Measured alongside each verdict: raw APCA per seat pair, and the OKLab separation of each published
pair against `sameColorBar` (the contract's own regional distinctness floor).

| # | fg/bg | fg/surf | accent/bg | accent/surf | tightest published pair | its bar | margin |
|---|---|---|---|---|---|---|---|
| 1 | 53.05 | 51.01 | **−4.08** | **−6.39** | bg–accent 0.0164 | 0.0163 | **+0.0001** |
| 2 | −20.40 | −23.94 | **−4.33** | −7.87 | bg–accent 0.0166 | 0.0163 | **+0.0003** |
| 3 | **−6.66** | **−7.50** | **3.73** | **2.80** | bg–surface 0.0094 | 0.0093 | **+0.0001** |
| 4 | 49.76 | 49.00 | **3.35** | **2.59** | bg–accent 0.0169 | 0.0163 | **+0.0006** |
| 5 | 31.91 | 28.59 | **5.93** | **2.61** | surf–accent 0.0179 | 0.0150 | **+0.0029** |
| 6 | 42.69 | 45.38 | −24.77 | −21.75 | bg–surface 0.0230 | 0.0229 | **+0.0001** |

**The single loudest datum in the round.** Check 2 of the battery passes — zero sub-bar published
pairs, structurally guaranteed. And the reviewer called a pair indistinguishable on **five of six
items**. On four of those five the pair clears the contract's bar by **1e-4**, i.e. the distinctness
barrier is *binding* and the solver parks exactly on it, because nothing in the energy pays for
exceeding it. "Passes check 2" and "the reviewer sees one colour" are both true simultaneously. This
is not a coverage finding or an ordering finding; it is a finding about a barrier being used as a
target.

**Items 1 and 4 — the two fg/accent-swap-arbitration covers — did not get the arbitration the round
asked for, and the reason is informative.** Both palettes carry the artwork's vivid colour in the
*foreground* seat (`#f23704`, `#70ba25`) with a healthy fg contrast (51–53 and 49–50 raw APCA) —
that half of the reading is not what the reviewer objected to. Neither note asks for a swap. Both
notes object to the *accent*: `#ebece7` and `#f8faf9`, at −4.08 and +3.35 raw APCA against their own
backgrounds and 0.0164 / 0.0169 OKLab away from them. So the reviewer's answer to "which ordering?"
is **neither** — the objection is that once the foreground takes the one vivid colour, the accent
seat is filled with a near-copy of the background. `second-palettes.md` §3.1 framed this as an
ordering question the report could not settle ("this report cannot say which assignment the reviewer
wants"). The verdicts say the framing was too narrow: the reviewer wants **two distinguishable
colours in the two seats**, and swapping one vivid and one pale between them cannot produce that
under any ordering.

**Item 6 — the pure-red-accent failure — is confirmed, and it is the mildest grade in the round
(weak).** Accent `#fafafa` on a `#fdd000` background is the predicted failure and it scores −24.77
raw APCA, so it is *readable*; the reviewer did not complain about it. The two complaints are
elsewhere: a missing black (§4) and `#fdd000` vs `#f7d909` published as two yellows that clear the
bar by 0.0001 and read as one.

**Item 2 — the readability residual — is confirmed by the reviewer in the reviewer's own words**
("it is also very hard to read"). `#fffeff` on `#e0e0e0` is 20.40 raw APCA — above the contract
floor, and the reviewer still calls it hard to read. `second-palettes.md` §3.2 measured that the
readable candidate `#010000` (|APCA| 91) sits at rank 189 on this cover; the verdict is the human
half of that measurement.

**Items 3 and 5 — the two measured-healthy covers — were both graded `unacceptable`, item 3 with the
harshest note in the round.** These are the covers where the check battery had nothing to say: the
highest ground coincidence in the set (9.86e-01, 9.58e-01), the only two whose check-1 foreground
margin clears the floor with room, and item 5 holds the *largest* swap gap in the whole demo-20 set
(3.79e-2). Item 3's foreground is 6.66 raw APCA and its four colours span 0.0094–0.0748 in OKLab —
the reviewer's "every color in this palette is very close together" is exact. Whatever "healthy"
meant in the instrument, it did not mean the reviewer would accept it.

---

## 4. Row 11 — for every item graded down, is there a major artwork mass with no published colour
near it?

Method: P6's own substrate + lattice on each cover (`buildSubstrate` → `buildLattice`, exact
per-triple pixel counts), triples agglomerated greedily at a 0.10 OKLab radius, every resulting mass
≥1% of frame measured against the four published colours. The dominance of the gap is split into the
lightness component (|ΔL|) and the chromatic component (the a/b-plane distance), so row 16 is
answered off the same numbers.

| # | major uncovered mass? | the mass | nearest published | ΔE | ΔL | a/b gap | Δh |
|---|---|---|---|---|---|---|---|
| 1 | **no** | — (largest gap: 2.0% at L 0.756 C 0.102) | fg `#f23704` | 0.180 | 0.130 | 0.125 | 3° |
| 2 | **no chromatic mass exists** — artwork is achromatic (every mass C ≤ 0.011) | 7.2% at **L 0.070** (black) | surf `#dcdadb` | **0.820** | **0.820** | 0.008 | n/a |
| 3 | **no chromatic mass exists** (max C 0.019) | 7.8% at **L 0.846**; 11.0% at L 0.730; 4.1% at L 0.231 | fg `#5a605c` / accent `#454c45` | 0.363 / 0.248 / 0.178 | same | ≤0.019 | n/a |
| 4 | **YES** | 1.9% at L 0.616 **C 0.2415 h 28°** — the cover's highest-chroma mass, the red | fg `#70ba25` | **0.356** | 0.097 | **0.343** | **105°** |
| 5 | **YES** | **26.6%** at L 0.781 **C 0.1395 h 54°** — the gold sunset, second-largest mass on the cover; plus 3.0% at h 82° | bg `#a36268` | 0.230 / 0.326 | 0.211 / 0.305 | 0.092 / 0.117 | **40° / 67°** |
| 6 | **no chromatic gap** — yellow (48.6%) at ΔE 0.002 and red (14.3%) at ΔE 0.004 are both covered | 7.3% at **L 0.056** + 3.6% at L 0.120 (black) | fg `#fd0100` | **0.623** | **0.568** | 0.255* | n/a |

\* item 6's a/b component is 0.255 only because the nearest published colour is a saturated red; the
mass itself is achromatic (C 0.004).

**Answer, stated as the row asks it.** On the row's literal *chromatic* reading: **2 of 6** (items 4
and 5), and on both of those the reviewer named the missing colour unprompted and correctly — "the
significant red", "the gorgeous yellow-gold tones of the sunset". On item 5 the uncovered mass is
26.6% of the frame.

**But the row's chromatic framing misses three more.** Items 2, 3 and 6 each carry a major mass with
no published colour anywhere near it — near-black at 7.2% and 7.3%, a near-white at 7.8%, a
mid-lightness band at 11.0% — with ΔL from 0.18 to 0.82 and essentially no chroma. The reviewer
complained about exactly these, in these words: "everything is white in the proposed palette … does
not reflect the artwork's identity" (item 2), "does not reflect the full range of the artwork's
identity" (item 3), "missing the significant black from the artwork" (item 6). Proposal term 6
transports the artwork's **chromatic** mass; every one of these masses has C ≤ 0.011 and would be
weighted at ~0. So **5 of 6 items carry an identity-coverage complaint, and 3 of the 5 name a mass
the coverage term as specified cannot see.** That is a scope finding about the term, reported here
and not acted on.

Only item 1 has neither an uncovered mass nor a coverage complaint — its single complaint is
distinctness.

---

## 5. Row 16 — lightness gap (family-covered in OKLab only) or hue gap (genuine miss)?

Applied to the five coverage-flavoured complaints (items 2, 3, 4, 5, 6).

| # | complained-about mass | verdict |
|---|---|---|
| 4 | the red, C 0.2415 h 28° | **genuine hue miss.** Δh 105°, and the chromatic component of the gap (0.343) is 96% of ΔE. The nearest published colour is a green. Nothing about this is family-covered. |
| 5 | the gold, C 0.1395 h 54° | **mixed, with a real hue component — not family-covered.** ΔL 0.211 exceeds the a/b gap 0.092, so a naive dominant-component rule would file it under lightness; but Δh is 40° (67° on the second mass) and the nearest published colour is a dusty rose against a gold mass. The lightness dominance is an artefact of OKLab's L axis being the wider of the two, not evidence of a same-family colour. Reported both ways rather than forced. |
| 2 | near-black at L 0.070, C 0.011 | **lightness.** a/b gap 0.008. |
| 3 | near-white at L 0.846 / mid band at L 0.730, C ≤ 0.019 | **lightness.** a/b gap ≤ 0.019 on every mass; the published four span L 0.408–0.482 while the artwork spans L 0.231–0.846. |
| 6 | black at L 0.056, C 0.004 | **lightness.** The mass is achromatic and the nearest achromatic published colour, accent `#fafafa`, sits at L 0.985. |

**The distinction row 16 asked for, sharpened by the numbers.** Row 16's worry was that OKLab
transport can be *cheaply* satisfied by a same-family-different-lightness colour. That is not what
happened here: the lightness gaps on items 2, 3 and 6 are ΔL 0.25–0.82, which any transport metric
over all mass would price as expensive. They went unpriced for a different reason — the masses carry
no chroma, and a term that transports chromatic mass weights them at ~0. So the gap this round
exposes is **not** "OKLab is too permissive about lightness"; it is "the coverage term's domain is
chromatic mass, and 3 of 5 coverage complaints in this round are about achromatic mass". Distinct
question, distinct fix space, and neither is touched here.

---

## 6. The branch that fired

`ROUND.md`'s four pre-registered outcomes, quoted:

> - **Mostly strong (≥4 of 6 graded 3–4):** our check battery is a pessimistic instrument … We
>   proceed to robustness and the coverage set without further term repairs …
> - **Mixed (grades split, with per-item notes pointing at accents on some covers and foregrounds on
>   others):** the battery is directionally right. Repair priority is set by which complaint class
>   dominates the notes …
> - **Mostly weak (≥4 of 6 graded 1–2):** the mechanism's role-fitness vocabulary (ink = lightness
>   displacement, mark = chroma displacement, both per-mass, ground-coincidence-weighted) is reopened
>   as a whole — the question stops being which term to repair and becomes whether figure-role
>   reading off displacement statistics survives contact with the reviewer at all. No constant is
>   nudged in response; the finding goes upward in the §7 report first.
> - **Confounded / unanswerable (vetoes, or notes says the round asked the wrong question):** restage
>   as a pairwise round …

### **MOSTLY WEAK fires.** 4 `unacceptable` + 2 `weak` = **6 of 6** in the lower half; 0 strong, 0
acceptable, 0 vetoes. The threshold is ≥4 of 6; the round delivered 6.

Three things must be said plainly rather than smoothed into that branch.

**(a) The scale digits in `ROUND.md` are inverted relative to the instrument.** `ROUND.md` writes
"graded 3–4" for the good branch and "1–2" for the bad one. The live UI binds
`{1: strong, 2: acceptable, 3: weak, 4: unacceptable}` (`review-ui/calibration.js`), so on the
instrument's own digits this round is 3s and 4s. The branch is unambiguous by *name* — every grade
is in the weak/unacceptable half, which is what "Mostly weak" means and what "Mostly strong" is not
— so nothing about the outcome turns on the discrepancy. It is recorded because a future round that
lands genuinely split would be mis-branched by reading the digits literally, and `ROUND.md`'s digit
convention should be corrected before the next staging.

**(b) The Confounded branch does not fire, but its second trigger is worth weighing.** No vetoes and
no note saying the round asked the wrong question, so by the pre-registered trigger the branch stays
shut. What the notes *do* say is that the round's central question was narrower than the failure:
the round asked which of two seats should hold the artwork's one vivid colour, and the reviewer's
answer on both swap covers was that the problem is the *other* seat holding a background near-copy.
A pairwise restage of the same covers with the seats swapped — the Confounded branch's remedy —
would put two palettes in front of the reviewer that both draw the same complaint, and would not
answer anything. This is a reason **against** that remedy, not a reason to fire the branch; recorded
so the orchestrator does not reach for it as an obvious follow-up.

**(c) The Mixed branch's note taxonomy still has diagnostic value even though its grade condition
failed.** Had it fired, priority would have been set by which complaint class dominates. It is worth
recording that the count is lopsided: accent/distinctness complaints on **5 of 6** items (1, 3, 4,
5, 6), identity-coverage complaints on **5 of 6** (2, 3, 4, 5, 6), foreground-readability complaints
on **2** (2 explicitly, 3 by implication). Under Mixed's own rule that would have pointed at the
fg/accent role-degeneracy first. Mostly weak's instruction supersedes it: no constant is nudged, and
the whole role-fitness vocabulary goes upward in the §7 report first.

**What the round establishes for that report, in one line each.**

1. The mechanism produced no palette the reviewer would accept, on covers selected to include its
   two measured-best cases (items 3 and 5, both `unacceptable`).
2. The check battery is not pessimistic — it was optimistic. Its passing checks (check 2, and the
   healthy coincidence and swap-gap readings on items 3 and 5) mark covers the reviewer rejected.
3. The dominant complaint class, 5 of 6 items, is a pair of published colours clearing the
   contract's same-colour bar by as little as 1e-4 and reading as one colour — a barrier being used
   as a target.
4. The second class, 5 of 6 items, is identity coverage; 3 of those 5 name achromatic mass, outside
   the specified coverage term's domain.
5. The fg/accent ordering question the round was built to arbitrate was not answered, because the
   reviewer rejected the premise that one vivid and one pale colour can fill both seats in either
   order.

---

## 7. Provenance of the analysis

- Verdicts and release: `/Users/Flo/GitHub/palette/research/v3/data/warehouse/warehouse.jsonl`
  (rows `v-msfps6q2-c0c9dc5e` … `v-msfpwnxr-90c7928b`, release `bc-msfpwxvg-f6564281`). Disk is
  authoritative; the server's read APIs were not consulted.
- Push record: `/Users/Flo/GitHub/palette/research/v3/data/review-server/batches.jsonl`, line 34.
- De-blinding join: `review-rounds/p6-round-1/private-mapping.json`.
- Predicted-class resolution: `reports/second-palettes.md` §2 (coincidence census, demo↔set index),
  §3.1 (the two swap covers named explicitly as 0 and 12), §3.2 (the readability residual on
  demo 2), §5 (per-set published palettes — the hex match that fixes the mapping).
- Mass/coverage measurement and APCA/bar measurement: throwaway probes against this prototype's
  `src/substrate`, `src/lattice` and the shared `src/contract/color.ts`, run in the P6 worktree with
  the process-default `sharp` resolution — the same path `tools/first-palettes.ts` takes. Nothing
  was written into `src/` or `tools/`, and no rate, constant or term was touched by this analysis.

# Round 7 — calibration. Seven covers, one palette each. The arbitration applied.

**For the orchestrator, not the reviewer. Nothing in this file is served.** The reviewer-facing
side-car (`sidecar.data.json`) is blinded: no prototype name, no arm label, no mechanism text, no
version string, and no signal of which selection class an item is in. `verify.ts` check 10 greps the
served file for the whole forbidden vocabulary — 40 strings this round, widened with 0.4.4's own words
— rather than trusting this paragraph.

Candidate `p3-fields-0.4.4`, commit `affe3965`. Staged from the worktree `.worktrees/p3-fields`.

**A note on the commit.** The branch tip advanced to `a51b1d29` — an orchestrator commit touching
`STATE.md` and nothing else — while these runs were executing. `git diff affe3965 a51b1d29` over
`research/v3/prototypes/p3-fields/src` and `research/v3/src` is **empty**, so the sources these runs
read are `affe3965`'s sources and the fingerprint names the commit a re-run must check out.
`verify.ts` check 11 (new this round) checks both halves of that rather than asserting them.

---

## The question this round answers

> **The arbitration was applied — are the repaired covers right now, and what does the deferred
> limitation cost?**

Round 6 asked whether identity or legibility wins when the two conflict. The answer came back
unanimous — all four conflict covers unacceptable, three of them prescribing the foreground in words —
and 0.4.3 and 0.4.4 are that answer implemented. Four of the seven items here are covers the reviewer
graded down in round 6 and whose palettes have since changed, in the direction the notes named:

- **the floor clause** (`MIN_RAMP_HOLD_FLOOR = 5.0`, `[UNCALIBRATED]`, bracketed by round 6's own
  complaining range) — the chromatic-mark hold now needs the *displaced* foreground to clear 5.0, and
  below it the swap returns. Published foregrounds below min-ramp 5.0 fall **31 → 12** across the
  coverage set.
- **the ground-lump exclusion** — the ink window no longer elects the ground as the ink, which is what
  had put a near-white foreground on a white ground.
- **the neutral-accent branch** (0.4.4, three clauses, no new constant) — where the ground already
  spans both of the artwork's colour families, the accent may be a *neutral* rather than the least-bad
  shade of the ground. It fires on **3/220**.

So the round is not "did the fix land" — the diffs land, and `select.ts` prints the before/after
palettes side by side so that is shown rather than claimed. The round is **whether the repaired covers
are actually right**, judged by the person whose notes specified them, on covers where a wrong repair
would look exactly like a right one from inside the code.

The second half of the question is the honest half. **One round-6 prescription was not met and is not
going to be met by this candidate.** Row 3's cover drew "the main text is white… we should have a white
foreground"; the ink score cannot see white type on a photograph, that limitation was diagnosed by W23,
and the orchestrator **deferred** it under the round-6 ruling rather than tuning around it. What 0.4.3
delivered on that cover instead is a *swap*: the illegible `#2a1e06` left the foreground slot and became
the **accent**, and a gold `#cdaf19` at min-ramp 50.8 became the foreground. Grading that cover as it
now stands is how the deferral gets **priced** — it converts "we know about it" into a number in the
warehouse. Across the coverage set the same trade shows up as published accents below min-ramp 5.0
rising **39 → 54** while foregrounds fell 31 → 12; the arbitration moved the unreadable colour, it did
not remove it, and this round asks what that is worth.

The two halves are one candidate, not two. A round that came back all-strong on the repairs and silent
on row 3 would be a round that priced the deferral at zero, and this paragraph exists so that reading
has to be argued for rather than assumed.

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
| Items | 7 |
| **Purpose field** | **`calibration`** |

`purpose: calibration` is declared here and the installer honours the enum **verbatim** (main ruling,
2026-08-05). Round 6 went out as declared; this round asks for the same, read off this table rather
than inferred.

`fundedBy` stays **linkage-free**. No batch id, no item id, no prior-round reference goes in it while
this batch is open — citing them is identity information under the blinding standard. The motivating
verdict ids are recorded post-release by main, via the release-note amendment. The decode commits
remain the canonical chain meanwhile.

Seven is inside the standing 4-to-10 band, and is the smallest number carrying four re-grades, the
twin-risk watch, the conflict residual, and one fresh cover.

### Item ids and row order

`itemId` is the **artwork content stem** — `basename(imagePath)` with the extension removed, nothing
else (`../QUEUE.md`, staging convention from the round-4 install). No run ordinal appears anywhere.
`verify.ts` check 8 asserts id == stem on every row.

Row order interleaves the classes: **R T R C R F R**. Four of these seven covers are here *because
somebody fixed them*, and a reviewer who met four "recently repaired" covers consecutively would be
grading a pattern rather than a palette — which would destroy exactly the independent read the round
exists to get. Nothing served says which class an item is in.

### The escape

The calibration UI's **per-item veto plus free-text notes** is the escape, as in rounds 1, 2, 5 and 6.
No item forces a choice: every item is one palette, gradeable on its own, and a reviewer who thinks the
question is wrong can say so in the note or refuse the item outright. In particular, nothing served
asks whether a repair worked — the served surface is seven palettes on seven covers, and every "the fix
validated" reading below is *our* inference from whatever the notes say, fixed in advance by the
branches.

---

## The item table

Row order is the served order. Every number is measured, from `diag-coverage-0.4.4/` and
`diag-demo-20-0.4.4/` (the `P3_DIAG` chains of the `--no-cache` re-runs), read by `select.ts`; the
console is `console-select.txt`.

- **min-ramp** is the *published* foreground's minimum |raw APCA| over the field ramp's stop pixels.
  Where the swap applied, that is the comparator record's `accentMinRamp` (the promoted mark), not its
  `foregroundMinRamp` (the displaced candidate) — the two swap sides are named explicitly below so no
  number here is a mis-read of the field name.
- **accent min-ramp** is the same quantity for the published accent.
- **sep** is the published foreground↔accent OKLab distance as a multiple of the bar the contract's I3
  applies to that pair (the larger of the regional same-colour bar and
  `FOREGROUND_ACCENT_SEPARATION_DISTANCE` = 0.07444). 1.00× is the bar itself; every row here clears it.
- **r6** is the round-6 grade, **orchestrator context only** — it is not served, and no branch below
  reads it as anything but the prior it is.

Cover appearance is the one judgment no number carries and was made by eye at full resolution.

| # | itemId (stem) | cover, as it reads | class | bg / surface / fg / accent | min-ramp | accent min-ramp | sep | r6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `…11a326091e7dd7df58b175` | vivid blue liquid marbling flowing across a near-black lacquered ground | **re-grade — the paired-family shape** | `#0b0800` / `#26211d` / `#259dd1` / `#4db2bc` | 44.81 | 53.48 | **1.09×** | weak |
| 1 | `…0003748f0b2cb5347f9c0779` | *Djeff-Z — Sensuality…* — pink-and-gold sunset over breaking surf; **white** script title and artist name | **twin-risk — neutral-branch firing** | `#a16485` / `#e8d49f` / `#000000` / `#0e0011` | 35.78 | 35.63 | **1.75×** | — |
| 2 | `…0010ac96d501c4170f39c4f0` | anime illustration — white-haired figure on a plain white ground, black-and-blue jacket, violet eyes, black Japanese lettering outlined in blue | **re-grade — black foreground prescribed** | `#ffffff` / `#ffeded` / `#0b0b17` / `#0000e6` | **100.07** | 83.54 | 5.01× | unacceptable |
| 3 | `…0011e7b5c1023c70f7a3d767` | *Emberlight Serenade* — green-gold stage photograph of a singer, **white** dripping graffiti title | **conflict residual — white-fg prescription unmet** | `#170a02` / `#374d0d` / `#cdaf19` / `#2a1e06` | 50.82 | **2.67** | 7.07× | unacceptable |
| 4 | `4e6dee3a672e62f84d6fab9d90a2af26` | *Invaders Must Die* — greyscale photo of an angular prow-like structure, orange logotype over it | **re-grade — swap returned** | `#e2e1e6` / `#493421` / `#ae3e10` / `#dad9de` | **18.01** | 4.93 | 5.42× | unacceptable |
| 5 | `…000146db0ad7d43bebdb3152` | *Blok Bassters* — scratched and gouged steel plate; cracked-paint capitals, an engraved licence-plate panel, a small crimson logo block | **fresh — highest edge fraction (0.9451)** | `#feffff` / `#faede5` / `#050505` / `#970b16` | 99.37 | 81.50 | 4.80× | — |
| 6 | `…0000269ead63cf2376a6b67d` | *8 Is Enough (Cypher)* — yellow ground, black-and-white striped top band, hanging microphones, red paint splash, white title, black artist names | **re-grade — the four named colours** | `#fdd001` / `#fe0000` / `#010101` / `#f8ffff` | 42.40 | 27.10 | 12.46× | unacceptable |

Gradients: **row 0 alone** publishes a 2-stop ramp (ρ 0.622, ρ\* 0.62); rows 1–6 publish none. No row
has more than two stops, so this round's guide-stop banding exposure is nil. Full palettes and collapse
flags are in `items.jsonl`; every hex there is checked against the image's actual pixels by `verify.ts`
check 2 (7/7 rows, 30 hexes including gradient stops).

**Served colour names**, which round 6 established are part of the judged surface (row 7 was graded
partly from them): row 0 `Black Olive / Holy Crow / Swimming Pool / Grauzone`; row 1 `Feminism /
Parchment / Pitch Black / Black Metal`; row 2 `Snow / Milk / Eigengrau / Beyond the Sea`; row 3
`Asphalt / Pickle Brine / Desert / Blackened Bronze`; row 4 `Velvet Scarf / Combat Boot / Terracotta /
Fog`; row 5 `Snow / Eggshell / Blackout / Firebrick`; row 6 `Taxi Yellow / Torch Red / Soot / Snow`.
Two of these are flagged in the honest notes.

---

## Why these four re-grades

### Row 0 — 168, the paired-family shape, delivered

The longest-running ask in P3. Round 3, round 5 and round 6 all drew a foreground complaint on this
cover, and round 6's decode plus the reviewer's own ground truth (2026-08-05, `EVIDENCE` item 13)
resolved what had looked like a contradiction: the target is a **paired-family palette** — *"2 different
dark greys for background and surface (gradient:true) and 2 different blues for foreground and
accent."* We had only ever published one blue, so whichever seat held it, the other seat complained.

0.4.4 publishes the prescribed shape:

```
r6     #0b0800 / #26211d / #3d3936 / #2aa5e9      grey, grey, GREY, blue      gradient:true
0.4.4  #0b0800 / #26211d / #259dd1 / #4db2bc      grey, grey, BLUE, BLUE      gradient:true
```

Two dark greys as the field pair with `gradient: true` (ρ 0.622), two blues as figure. The blue
foreground `#259dd1` arrives via the **ground-lump exclusion** and the second blue `#4db2bc` via the
separation bar — W23's commit message is explicit that this was reached by removing a defect, not by
special-casing the cover, and 0.4.4's lump-guard work then let the shape **survive by honest refusal**
(every widened cut re-entered the ground, so nothing was widened).

**This is the round's single most informative item and it is not a formality.** The prescription is
verbatim and the delivery is verbatim, so a grade below 3 here says the reviewer's stated ideal, built
exactly, is not what the reviewer wants — which is a far more valuable finding than a fourth
confirmation. See also the margins note under row 1 and honest note 1: *these two blues are 1.09× the
separation bar apart, the 7th-thinnest foreground/accent gap of 180 non-collapsed coverage palettes.*
Delivering "two blues" and delivering "two colours a reviewer can tell apart" are not automatically the
same act, and this round is where they get distinguished.

### Row 2 — the black foreground, prescribed in words

Round 6's row 0, unacceptable, with a prescription and a counterfactual: *"we should use black as the
foreground"* — and *"then the palette will be 'strong'"*. The reviewer graded the palette as repairable
by one role change and said which change.

```
r6     #ffffff / #ffeded / #ebebf5 / #0000e6      fg = near-WHITE on a white ground, min-ramp 3.27
0.4.4  #ffffff / #ffeded / #0b0b17 / #0000e6      fg = near-BLACK,                  min-ramp 100.07
```

The accent is unchanged. Exactly one role moved, it moved to the colour named, and the min-ramp went
from the corpus's third-worst to essentially maximal. The cause was the **ground-lump exclusion**: on a
`#ffffff` ground the ground *was* the L-extreme, so the ink window was electing the ground as the ink.

This item is the round's cleanest test of the counterfactual, and it is worth stating what makes it
clean: the reviewer named the colour, named the role, and named the resulting grade, all before the fix
existed. If it comes back below 3, the counterfactual was worth less than it read, and the "one role
change from strong" shape — which the orchestrator has been using as a repairability signal — needs
re-pricing.

### Row 4 — the swap returned at the mildest conflict

Round 6's row 2, unacceptable, min-ramp **4.93** — the mildest of the four conflict covers, and the one
whose note complained about text readability *without* prescribing a replacement. It is the cover that
brackets the floor from above: 4.93 was the highest complaining min-ramp in the corpus, so the floor
clause was set at 5.0 and this cover is the reason the constant has that value.

```
r6     #e2e1e6 / #493421 / #dad9de / #ae3e10      fg = pale grey on a pale grey ground, min-ramp 4.93
0.4.4  #e2e1e6 / #493421 / #ae3e10 / #dad9de      fg = the orange logotype,             min-ramp 18.01
```

The two roles traded places: `chromaticMarkHeld` is now false, `applied` is true, the swap returned
exactly as the branch specified. **The displaced `#dad9de` is now the accent at min-ramp 4.93** — the
same number, in the other slot. That is the round's clearest small instance of the trade row 3 asks
about at full size, on a cover where the foreground half of it is unambiguously better.

A note on the floor: `MIN_RAMP_HOLD_FLOOR = 5.0` is `[UNCALIBRATED]` and bracketed only from below by
this cover. Round 6's pre-registered constraint still stands — a floor above 3.07 removes 039's magenta
from the accent — and 039 is deliberately **not** in this round (see exclusions), so nothing here
re-litigates that trade.

### Row 6 — cover 19, the four named colours

Round 6's row 7, unacceptable, and the sharpest note of the round because the reviewer answered with a
list: *"there aren't 2 shades of yellow on that artwork… Taxi Yellow, Torch Red, black (Soot is ok),
white."* Three of the four served names were accepted; the fourth, `Laser Lemon`, was the defect.

```
r6     #fdd001 / #fe0000 / #010101 / #f3f300      Taxi Yellow / Torch Red / Soot / Laser Lemon
0.4.4  #fdd001 / #fe0000 / #010101 / #f8ffff      Taxi Yellow / Torch Red / Soot / Snow
```

The four served names are now, in order, the four names the reviewer wrote. That is a striking match
and it is worth being precise about why it is not proof: the **neutral-accent branch** fires here
(1/3 of its coverage firings), and its condition is a family-separation test — the branch decided
*"the accent may be a neutral"*, and nothing in it ordered **white** over black specifically.
0.4.4's own docstring says so without being asked: *"that is the prescription, and it is also luck in
the sense that no clause here ordered white."* If this cover grades strong, what is validated is the
branch's **condition**; its **ordering** is validated only by the coincidence holding, and one cover is
not a rate. The branch's condition margins are order-of-magnitude (cover 19: 0.1606 / 0; every other
named cover refuses at clause 1), which is the reassuring half.

---

## Why this twin-risk cover

Row 1, `…0003748f`, is the **smallest-margin firing of the branch 0.4.4 added**, and it is here because
W24 flagged it rather than because the round went looking:

> *"Two of the three coverage firings publish a dark neutral beside a dark foreground. On `…0003748f`
> the palette becomes mauve / cream / `#000000` / `#0e0011`… both clear invariant 3's separation and
> both are the shape `EVIDENCE_2026-08-04.md` item 2 warns about. Three covers is not a rate and none
> of them is a graded item; they are named here so the next round can look at them rather than discover
> them."*

This round makes one of them a graded item. All three firings, ranked by margin over the governing bar
— **`EVIDENCE` item 11's rule applied, *bars qualify, margins rank***, since all three pass
`validatePalette` and a pass/fail read would say nothing:

| firing | fg / accent | distance | ×bar | shape |
| --- | --- | --- | --- | --- |
| `…0003748f` | `#000000` / `#0e0011` | 0.13034 | **1.75×** | dark neutral beside a dark fg |
| `…05687107` | `#e0580a` / `#b3a29b` | 0.18796 | 2.53× | *removes* a twin (orange/orange → orange/warm grey) |
| `…00096440` | `#000002` / `#613c07` | 0.36878 | 4.95× | dark neutral beside a dark fg |

`…0003748f` is the pick: the smallest margin, the starkest shape, and **unseen in rounds 1–6** so no
prior grade contaminates it. `…05687107` was shown in a prior round and goes the other way in any case;
`…00096440` is the same shape at 2.8× the margin.

Two further facts, stated because they make the item harder rather than easier for us:

1. The served **names** are `Pitch Black` and `Black Metal` — two blacks, adjacent, on a cover whose
   type is white. Round 6 established that colour naming is part of the judged surface.
2. The artwork's title and artist name are set in **white script**, and the palette publishes neither
   a white foreground nor a white accent. The same white-type-on-photograph blindness that row 3 is
   about is present on this cover too — the difference is that here it did not draw a prescription
   because the cover has never been graded.

`EVIDENCE` item 2's twin-sibling watch stands at **two counts**. A same-colour note here is its third,
and third counts are where a passive watch becomes a design constraint.

---

## Why this conflict residual — and what the deferral costs

Row 3, `…f7a3d767`, was round 6's worst cover in the corpus (min-ramp **2.67**) and drew the most
specific note available: *"the main text is white… we should have a white foreground."* The artwork's
title is set in large white dripping graffiti letters across the lower half. **White is present, white
was named, and white is still not published.**

```
r6     #170a02 / #374d0d / #2a1e06 / #cdaf19      fg = #2a1e06 at min-ramp 2.67; accent = the gold
0.4.4  #170a02 / #374d0d / #cdaf19 / #2a1e06      fg = the gold at min-ramp 50.82; accent = #2a1e06 at 2.67
```

**The prescription remains unmet, and this is the orchestrator's context for reading the grade.** W23
diagnosed the cause structurally and reported it rather than tuning it: the ink score cannot see white
type on a photograph, because on this cover *luminance rank-0 IS the prescription* and the ink regime
never gets there. The orchestrator **deferred** the ink-score limitation under the round-6 ruling
(recorded in `STATE.md`). It is not a bug awaiting a patch in this candidate; it is a known structural
limit that a decision left standing.

What the swap delivered instead is a **relocation**. The gold `#cdaf19` — the stage lighting on the
singer's face, a real and legible colour, min-ramp 50.82 — is now the foreground, and the illegible
`#2a1e06` is now the accent, still at 2.67. The palette is better and the prescription is unmet, both
at once.

**Grading it prices the deferral.** Across the coverage set the same trade is visible as a ledger:

| | 0.4.2 (round 6) | 0.4.4 (this round) |
| --- | --- | --- |
| published foreground below min-ramp 5.0 | 31 | **12** |
| published accent below min-ramp 5.0 | 39 | **54** |
| chromatic mark held | 50 | 34 |
| swap applied | 7 | 19 |

The arbitration moved the unreadable colour out of the foreground on 19 covers; it did not remove it
from the palette, and 15 more accents dropped below the same line. Whether that is a good trade is a
judgment nobody has made yet — round 6 supplies exactly one data point in the other direction (its
row 3 published an accent at min-ramp 4.45 and graded **strong**), which is why this is a question and
not a complaint.

This item is therefore the round's only deliberately *unrepaired* item, and the branch for it is
pre-registered as an expectation of failure, not of success. A round that only carried repairs would
have priced the deferral at zero by omission.

---

## Why this fresh cover

Row 5 is drawn from `coverage-set-1-220` (disjoint from `demo-20`) and checked against the union of all
six prior rounds' `items.jsonl` — **34 distinct covers**, none of them this one.

**The criterion, stated: the highest edge fraction among fresh contract-passing accent-published covers
— round-5 row 2's rule, re-applied for the third round running.** It is deliberately *not* selected on
anything 0.4.3 or 0.4.4 changed. A fresh cover chosen for "the neutral branch fired and it looks fine"
would be a cover chosen for the mechanism having worked, and would tell the overfitting watch nothing.
Edge fraction is a property of the artwork; holding the rule fixed makes rounds 5, 6 and 7's fresh
grades comparable to each other rather than merely all being "fresh".

**Two covers rank above it and are passed over, both under exclusions already on the record rather than
new preferences**: `#138` (`…000d54cb`, 0.9760) is the flat red graphic whose edge fraction is film
grain rather than content — round 5's exclusion, re-applied by round 6; and `#38` (`d6ff23ac…`, 0.9390)
is the monochrome pen-and-ink drawing on which the accent question is degenerate — round 5's other
named exclusion, which round 6 happened not to need. Row 5 at **0.9451** is the highest remaining, and
by eye the edge fraction is real: brushed and gouged steel across the entire frame, cracked paint in
the lettering, engraved filigree in the plate.

**The standing signal it continues.** Round 2's five fresh covers came back 0 strong / 2 acceptable /
3 weak while all four re-grades went strong; round 5's two fresh covers **both** came back ≤ 2; round
6's one fresh cover came back **strong** — the first fresh ≥ 3 since round 2. This round has one fresh
cover. **One cover is not a rate and the report must say one.** Two consecutive fresh successes would
be the first evidence that the overfit ratio (1.294×, unseen-cover agreement 19.5 → 17.0 while reviewed
froze) is moving; it would not be the measurement of it.

Honest risk on this specific cover, stated before the grade: the artwork is a grey steel plate, and the
palette publishes `#feffff` / `#faede5` as the field pair — the white of the cracked paint, not the
grey of the plate. If a note says the background is wrong, that is the round-5 fresh-failure *class*
(fresh failures name field roles) repeating, and branch (d) below reads it that way.

---

## Exclusions, stated

- **Contract-failing covers are excluded, re-derived rather than taken on report.** `validatePalette`
  runs inside `select.ts` over all 220 rows: **200 pass, 20 fail**. Every item here is from the passing
  set and `verify.ts` check 6 re-runs the validation against the source run row.
- **Accent-collapsed covers are excluded from the fresh pool** (23/220 at 0.4.4). An accent that
  collapsed onto the foreground is not an accent judgment.
- **039 (`d76d845e…`) is excluded** even though it is a round-6 unacceptable whose palette changed. Its
  round-6 prescription was a *white foreground*, so it belongs to the same white-type-on-photograph
  class as row 3, and putting two instances of one deferred limitation in a seven-item round would
  spend two slots on one answer. Row 3 is the sharper of the two (worst min-ramp in the corpus, the
  most explicit note), so it carries the class alone. 039's magenta-in-the-accent trade also interacts
  with the floor constant, and this round is not the place to re-open a bracket the floor clause was
  set inside.
- **The purple cover (`…1ef0786b`) is excluded.** It went acceptable → **strong** in round 6 with no
  note, and 0.4.4 does not change it. A re-grade slot spent re-confirming an unchanged strong cover
  buys nothing this round.
- **The other two neutral-branch firings are excluded**, for the reasons in the twin-risk table: one
  was already shown, and the other is the same shape at 2.8× the margin.
- **Nothing was excluded after seeing a palette we disliked.** Every exclusion above is either a
  contract fact, a class-coverage argument, or an exclusion already on the record from rounds 5 and 6.

---

## Outcome branches

Pre-registered. Written before any grade exists; the decode is checked against this section.

### (a) The repairs — rows 0, 2, 4, 6 read together

- **All four ≥ 3.** The legibility arbitration, the paired-family principle, and the neutral-accent
  branch are **judge-validated**: three independent mechanisms, four independently prescribed covers,
  each repaired in the direction its own note named. On that outcome **P3's active iteration closes at
  the documented optimum** — the complaint classes from rounds 1–6 are discharged, the remaining opens
  (robustness, the substrate, the deferred ink score) are all *measured* rather than *reviewer-raised*,
  and further tuning would be optimisation without a complaint to aim at. The report says which
  mechanism each cover credits, because they are separable: row 2 credits the ground-lump exclusion,
  row 4 the floor clause, row 6 the neutral branch, row 0 the exclusion plus the separation bar.
- **Three of four ≥ 3.** Partial validation; the failing cover names which mechanism did not land, and
  that mechanism alone re-opens. Iteration does not close.
- **Two or fewer ≥ 3.** The arbitration was applied wrongly even though it was decoded correctly —
  i.e. the round-6 decode read the notes right and the implementation read the decode wrong. That is a
  W23/W24-scope failure, not a re-litigation of round 6, and the next cycle is a re-implementation
  rather than a re-ask.
- **Any of the four graded *lower* than in round 6.** A regression on a cover we deliberately touched.
  Highest-priority open; it stops the closure argument outright regardless of the other three.

### (b) The margins watch — row 1, and row 0 as its alternate route

- **Row 1 draws a same-colour / "these are the same colour" note.** `EVIDENCE` item 2's twin-sibling
  watch reaches its **third count** and stops being passive. The neutral-accent branch then needs a
  **separation clause**: the branch may publish a neutral, but not a neutral within some margin of the
  published foreground — margin, not bar, per `EVIDENCE` item 11. The clause is scoped to the branch
  and the constant enters `[UNCALIBRATED]` with this cover as its only anchor, exactly as the floor
  clause did.
- **Row 1 grades ≥ 3 with no same-colour note.** The branch's ordering survives its first graded
  adversarial case. The watch stays at two counts and stays passive. This does **not** clear the other
  two firings, and the report says three covers is not a rate.
- **Row 0 draws a same-colour note instead of (or as well as) row 1.** *Declared in advance because
  the number says it is possible:* row 0's two blues are **1.09× the bar, the 7th-thinnest gap of 180
  non-collapsed coverage palettes**, thinner than row 1's 1.75×. If that is what fires, the reading is
  **not** that the paired-family principle is wrong — the reviewer specified two blues — but that
  *delivering a named family pair does not by itself deliver two distinguishable roles*, and the
  separation clause above is needed in the **exclusion/separation-bar** path rather than the neutral
  branch. This is the one route by which branch (a) can fail on row 0 while `EVIDENCE` item 13 stays
  intact, and it is written here so that reading cannot be improvised after the fact.

### (c) The deferral's price — row 3

- **≤ 2 with a text note.** The expected outcome, and the useful one: **the cost of deferring the ink
  score is priced and stands recorded.** The deferral was a decision, this is its number, and it goes
  into `STATE.md` as such — one graded cover, at the corpus's worst point on the axis, still failing
  after the arbitration landed everywhere else. It does **not** re-open the deferral by itself
  (the ruling deferred a *structural* limitation, not a cover), and it does **not** subtract from
  branch (a) if (a) fires: the two are about different mechanisms.
- **≤ 2 with a note naming the ACCENT** (e.g. that `#2a1e06` is invisible or pointless as an accent).
  Then the relocation itself is the defect, the 39 → 54 accent ledger above is a real cost and not a
  bookkeeping artefact, and the floor clause needs a symmetric question asked of the accent slot. This
  is a distinct finding from the one above and the decode must not merge them.
- **≥ 3.** The swap alone repaired the cover without meeting the prescription — the gold foreground is
  acceptable and the white was a preference rather than a requirement. That would **lower** the priced
  cost of the ink-score deferral, and it is the outcome that would most change the plan, so it is
  named here rather than treated as a surprise.

### (d) The fresh-cover watch — row 5

- **≥ 3.** **Second consecutive fresh cover to grade ≥ 3**, after round 6's. Two in a row on a
  selection rule held fixed across three releases is the first thing resembling evidence that
  improvement is reaching unseen covers — and the report still says two covers, not a rate. The
  overfitting watch **eases**: it stays open, its next measurement moves from every-round to
  every-other-round, and the ratio is re-measured on the next full run rather than inferred from this.
- **≤ 2.** Third fresh failure in four releases against one round-6 success. The watch does not ease.
  **Which role the note names matters and the decode must record it**: round 5's two fresh failures
  both named *field roles* (background correctness, false gradient), and this cover's declared risk is
  exactly that (white cracked paint published as the field of a grey steel plate). A field-role failure
  is the round-5 class repeating and points at `fields.ts`/`ends`; an accent or foreground failure is a
  new class and points at the same machinery this round is validating.

### (e) The honest-decode branch — a complaint class no branch above anticipated

If the notes raise something none of (a)–(d) covers — a role, a rule, or a whole framing this round did
not think to ask about — that is recorded **as the finding**, above the branch outcomes, and the
branches are reported as not having covered it. Round 6 produced two such off-branch findings (the
row-0 counterfactual; grading from served colour names), and both turned out to matter more than parts
of the pre-registered read. No branch above may be stretched to absorb one.

---

## Honest notes

1. **Row 0's two blues are 1.09× the separation bar apart** — 7th-thinnest of 180 non-collapsed
   coverage palettes, and thinner than the item this round selected *for* being a twin risk. The round
   ships it anyway, because the shape is the reviewer's own verbatim prescription and the point is to
   learn whether the prescription as built is what was meant. Branch (b) fixes the reading in advance
   either way. Stating it here rather than after the grades is the whole of the honesty.
2. **Row 0's served accent name is `Grauzone`** — literally "grey zone". The reviewer asked for two
   *blues*; one of them is served under a name that does not read as blue. If a note says the accent is
   grey, the naming is a candidate cause and the palette may be less wrong than the grade. `side.ts`'s
   `colornames-oklab` call is the same one every round has used; nothing was changed for this round.
3. **Row 1's served names are `Pitch Black` and `Black Metal`.** Two blacks adjacent in the served
   surface, on the very item selected for twin risk. This makes a same-colour note *more* likely than
   the hexes alone would, and branch (b) is therefore easier to fire than it looks. Recorded so the
   third twin count, if it comes, is discounted appropriately rather than banked at face value.
4. **The neutral branch's ordering is unvalidated even if row 6 grades strong.** 0.4.4's own docstring
   says no clause ordered white on that cover. Branch (a) credits the branch's *condition*; the report
   must not upgrade that to its ordering.
5. **`MIN_RAMP_HOLD_FLOOR = 5.0` is `[UNCALIBRATED]`** and bracketed from below by exactly one cover
   (row 4, 4.93). This round adds no upper anchor — no cover here complains at a min-ramp between 5.0
   and 18.0 — so the constant leaves this round exactly as under-determined as it entered.
6. **W23's reported tension is unresolved and untested here.** 31 of 82 exclusions elect sub-rankable
   lumps, 6 of them single-pixel — 0.3.0's removed class reintroduced at small scale — and 0.4.4
   established that widening cannot fix it (widened 1, refused 30). No item in this round is selected
   on that tension, so the round says nothing about it in either direction.
7. **Robustness is untouched by everything above.** 0.4.4's slices are identical to 0.4.3's, and P3's
   full-600 agreement sits near 16% against the incumbent's 72.8% anchor. Branch (a)'s "iteration
   closes at the documented optimum" is a claim about *quality complaints being discharged* and must
   never be reported as a claim about robustness.
8. **One cover is not a rate.** It applies to row 5 (fresh), to row 6 (the neutral branch's ordering),
   and to row 1 (the twin-risk shape). Three separate places in this document where the temptation to
   generalise from one graded cover exists, named once here.

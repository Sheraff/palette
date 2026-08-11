# Round 6 — calibration. Eight covers, one palette each. The identity-vs-legibility arbitration.

**For the orchestrator, not the reviewer. Nothing in this file is served.** The reviewer-facing
side-car (`sidecar.data.json`) is blinded: no prototype name, no arm label, no mechanism text, and no
signal of which selection class an item is in. `verify.ts` check 10 greps the served file for the whole
forbidden vocabulary rather than trusting this paragraph.

Candidate `p3-fields-0.4.2`, commit `b9c41a4`. Staged from the worktree `.worktrees/p3-fields`.

---

## The question this round answers

> **With the artwork's chromatic mark now kept as the accent, are these palettes right — and when the
> foreground pays for it, which wins?**

0.4.2 changed one clause. Round 5's decode said the fg↔accent comparator was mis-assigning the
chromatic mark — "the blue IS published but in the foreground slot; the reviewer wants it as accent,
third round running" — and W21 implemented the hold: the comparator **does not swap** when the promoted
colour is saturated (chroma ≥ `REGION_CHROMA_BOUNDARY`, 0.05) **and** the displaced foreground candidate
still clears the text floor (min-ramp |raw APCA| ≥ 2.5). The comparator's fire rate fell from 62/220
(28.2 %) to **7/220 (3.2 %)**; 50 covers now hold a chromatic mark that 0.4.1 would have demoted.

The asks were delivered. 168 publishes the blue `#2aa5e9` **as the accent** — the third-round request,
met. 039 returns its magenta to the accent slot. Both are in this round to be graded rather than
claimed.

**And the hold rule bought them with a floor of 2.5.** Twenty of the 50 held covers sit below min-ramp
5.0; the worst is 2.67. On those covers the mechanism has decided, without ever asking, that the
artwork's chromatic mark in the accent slot is worth a foreground the reviewer may not be able to read.
That decision is a *judgement*, it was made in code, and this round is where it gets made by the judge.
Three of the eight items are that question with the numbers stated in the table below.

The two halves are one question, not two: the same clause produced the delivered asks and the twenty
strained foregrounds, so a grade praising row 1 and a grade condemning row 6 are verdicts on **one
rule**. Written down here before the grades exist so neither reading can later be presented as the
whole result.

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
| Items | 8 |
| **Purpose field** | **`calibration`** |

`purpose: calibration` is declared here and the installer honours the enum **verbatim** (main ruling,
2026-08-05). Rounds 3 and 4 both went out as `purpose: "mechanism"` against their own ROUND.md; round 5
went out as declared. This round asks for the same, read off this table rather than inferred.

`fundedBy` stays **linkage-free**. No batch id, no item id, no prior-round reference goes in it while
this batch is open — citing them is identity information under the blinding standard. The motivating
verdict ids are recorded post-release by main, via the release-note amendment.

Eight is inside the standing 4-to-10 band, and is the smallest number carrying four re-grades, three
points along the conflict cohort's severity range, and one fresh cover.

### Item ids and row order

`itemId` is the **artwork content stem** — `basename(imagePath)` with the extension removed, nothing
else (`../QUEUE.md`, staging convention from the round-4 install). No run ordinal appears anywhere.
`verify.ts` check 8 asserts id == stem on every row.

Row order interleaves the classes: **C R C R F R C R**. Three covers are here *because their foreground
is hard to read*, and a reviewer who met them consecutively would be grading a pattern rather than a
palette. Row 5 belongs to two classes at once and is placed as a re-grade. Nothing served says which
class an item is in.

### The escape

The calibration UI's **per-item veto plus free-text notes** is the escape, as in rounds 1, 2 and 5. No
item forces a choice: every item is one palette, gradeable on its own, and a reviewer who thinks the
question is wrong can say so in the note or refuse the item outright. In particular, nothing on the
served side asks the reviewer to trade identity against legibility — that trade is *our* reading of
whatever the notes say, and the branches below fix the reading in advance.

---

## The item table

Row order is the served order. Every number is measured, from `diag-coverage-0.4.2/` and
`diag-demo-20-0.4.2/` (the `P3_DIAG` chains of the `--no-cache` re-runs), read by `select.ts`; the
console is `console-select.txt`. **min-ramp** is `foregroundMinRamp` — the published foreground's
minimum |raw APCA| over the field ramp's stop pixels, the quantity the hold rule's floor is set on.
**held** is `chromaticMarkHeld`: true means the comparator wanted to swap and the 0.4.2 clause stopped
it. Cover appearance is the one judgment no number carries and was made by eye at full resolution.

| # | itemId (stem) | cover, as it reads | class | bg / surface / fg / accent | **min-ramp** | accent min-ramp | accent chroma | held |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `…0010ac96d501c4170f39c4f0` | anime illustration — white-haired figure on a plain white ground, black-and-blue jacket, violet eyes, black Japanese lettering outlined in blue | **conflict — highest chroma** | `#ffffff` / `#ffeded` / `#ebebf5` / `#0000e6` | **3.27** | 83.54 | **0.2897** | yes |
| 1 | `…11a326091e7dd7df58b175` | vivid blue liquid marbling on near-black | **re-grade — 168, the blue now in the accent slot** | `#0b0800` / `#26211d` / `#3d3936` / `#2aa5e9` | 6.66 | 49.60 | 0.1429 | yes |
| 2 | `4e6dee3a672e62f84d6fab9d90a2af26` | *Invaders Must Die* — greyscale photo of an angular prow-like structure, orange logotype over it | **conflict — mildest, just under the line** | `#e2e1e6` / `#493421` / `#dad9de` / `#ae3e10` | **4.93** | 18.01 | 0.1556 | yes |
| 3 | `…05d8403971249d1ef0786b` | *Parody Kings* — greyscale figure on a studio backdrop; white title, **purple** sub-title | **re-grade — the purple shade** | `#4b4b4b` / `#7a7a7a` / `#f7fef6` / `#5d1988` | 75.89 | 4.45 | 0.1714 | no |
| 4 | `…0000cb591a0d52d8b88692d9` | *[mot]* — scraped and painted canvas: storm-grey sky, pale band, a rust-red band at the foot; cream serif title, black Korean type | **fresh — highest edge fraction (0.9586)** | `#0c101c` / `#eff3fc` / `#9a9da2` / `#871d05` | 48.16 | 13.92 | 0.1446 | no |
| 5 | `d76d845e33b98c986bb8b1297e49487b` | *Infinite* — black starfield over a blue-violet field, a **magenta** horizon band across the middle, white letterforms top and bottom | **re-grade — 039's magenta returned to accent · also conflict** | `#0c0e0d` / `#101c36` / `#16294a` / `#803a82` | **3.07** | 17.80 | 0.1355 | yes |
| 6 | `…0011e7b5c1023c70f7a3d767` | *Emberlight Serenade* — green-gold stage photograph of a singer, white dripping graffiti title | **conflict — the worst in the corpus** | `#170a02` / `#374d0d` / `#2a1e06` / `#cdaf19` | **2.67** | 50.82 | 0.1511 | yes |
| 7 | `…0000269ead63cf2376a6b67d` | *8 Is Enough (Cypher)* — yellow ground, black-and-white striped top band, hanging microphones, red paint splash, white title, black artist names | **re-grade — cover 19, accent regression** | `#fdd001` / `#fe0000` / `#010101` / `#f3f300` | 42.40 | 15.37 | 0.2034 | no |

Gradients: rows 1, 3 and 5 publish 2-stop ramps (ρ 0.622 / 0.977 / 0.637); rows 0, 2, 4, 6, 7 publish
none. No row in this round has more than two stops, so the round-3/round-5 guide-stop banding exposure
is nil. Full palettes and collapse flags are in `items.jsonl`; every hex there is checked against the
image's actual pixels by `verify.ts` check 2 (8/8, 38 hexes including gradient stops).

---

## Why these four re-grades

### Row 1 — 168, the third-round ask, delivered

Reviewer, rounds 3, 4 and 5: *"the accent would be better within the blue family"*, then at round 5
*"would work better with an accent in the blue tones"* — graded **acceptable** each time, with the blue
published in the **foreground** slot. At 0.4.2 the ordering still elects `#2aa5e9` (departure 0.9855),
the comparator still wants to swap it into the foreground (accent min-ramp 49.60 > foreground 6.66),
and the new clause **holds**: chroma 0.1429 ≥ 0.05 and the displaced foreground `#3d3936` sits at 6.66,
clear of the 2.5 floor. The published accent is the artwork's blue.

This is the round's most direct test. The reviewer asked three times for one thing; the mechanism now
does it; the only question left is whether it was the right thing. **Stated so it is not later
confused:** the foreground is `#3d3936`, a dark warm grey in the same family as the background — the
exact condition 168's original complaint named, now sitting in the *other* slot. A note repeating
"background/surface/foreground are the same family" on this cover is a **field-role** finding, not an
accent one, and belongs to the substrate line.

### Row 5 — 039's magenta, and a conflict item at the same time

Round-5's decode named 039 alongside 168 as the covers the swap refinement would be measured against.
At 0.4.2 the magenta `#803a82` is the accent (departure 0.9912, chroma 0.1355, held). **The price is
visible in the same row**: the published foreground is `#16294a`, a dark navy at min-ramp **3.07** on a
near-black field, while the cover's actual type — "EMINEM", "INFINITE" — is plain white. This item is
in both classes on purpose and the branches below read it twice.

### Row 3 — the purple shade re-check

Round-5 verdict: **acceptable**, with *"the accent is darker than the real purple"* — the within-lump
cascade landed in the lump's dark end at `#421b50` (chroma 0.0995) against an artwork maximum of
0.1937. 0.4.2 moved the top-tau chroma band before the cascade *and* before the lightness preference;
the published accent is now `#5d1988`, chroma **0.1714**, chosen by `higher-chroma-lump-convention`
from a band whose median chroma is 0.1753. The shade note is the only thing being re-asked here.

**The confound is written down rather than hidden:** this cover also carries `#4b4b4b` / `#7a7a7a`, the
twin-sibling pair counted at round 2 and re-counted at round 5 (running count 2). It is unchanged. A
"these two greys are the same colour" note is twin evidence, count 3, and must not be filed against the
shade fix.

### Row 7 — cover 19, a candidate regression, ungraded since round 2

**Orchestrator context only — none of this is served.** At round 1 the reviewer graded this cover
*acceptable* and prescribed the fg↔accent role swap by hand: *foreground should be black, accent
white*. At 0.3.0 that exact prescription shipped — foreground `#010101`, accent `#fbfcff` — and round 2
graded it **strong**, the campaign's cleanest "we did what was asked and it worked" result.

At 0.4.2 the foreground is still `#010101` at min-ramp 42.40, unchanged. **The accent is `#f3f300`, a
yellow.** The accent ordering's top five candidates are all yellows (departure 0.9241 at the head, the
prescribed white nowhere in them): the 0.4.0 chromatic-departure redesign prefers the artwork's yellow
to its white, and `#f3f300` sits beside a background of `#fdd001` — a second yellow. The hold clause is
not implicated (`held: false`; the comparator never wanted to swap here).

So the redesign that answered the identity-coverage complaints may have undone a verdict it was never
weighed against, on the one cover where the reviewer's own prescription had been graded strong. It has
never been re-shown. It is here as an honest re-grade, and the reviewer is **not** told what was
prescribed — the round asks whether the palette is right, not whether it matches an old note.

---

## Why these three conflict covers

W21's report: **50 covers hold a chromatic accent; 20 of them publish a foreground below min-ramp 5.0.**
Both numbers reproduce exactly on this round's fresh run (`console-select.txt`): `chromaticMarkHeld` on
50, of which 20 below 5.0, floor 2.5, chroma boundary 0.05. Of the 20, two are contract-failing and
excluded; row 5 above is a third. The three carried here span the survivors' severity range and are
deliberately *anti-correlated* between severity and chroma, so a grade can separate "how illegible is
the text" from "how much mark was bought":

| row | min-ramp | accent chroma | what is being paid for |
| --- | --- | --- | --- |
| 6 | **2.67** — the worst in the corpus | 0.1511 | a gold mark; the foreground `#2a1e06` is a near-black brown on a near-black field, and the cover's real type is white |
| 0 | **3.27** | **0.2897** — the highest in the cohort | an electric blue; the foreground `#ebebf5` is near-white on a `#ffffff` background |
| 2 | **4.93** — just inside the cohort's edge | 0.1556 | the logotype's orange-rust; the foreground `#dad9de` is a pale grey on an `#e2e1e6` background |

**Row 6 carries prior context.** Its cover is r2-item-8's. At round 2 the roles were the other way
round — foreground `#ffffff`, accent `#2a1e06` — and the reviewer's note was that the swap-demoted
ex-foreground was *unreadable as an accent*. Round 2's decode filed that as the second half of the
accent-redesign case. **The colour the reviewer called unreadable in the accent slot is now the
foreground**, at 2.67. That is not a prediction, it is what the run publishes; whichever way the grade
goes it is evidence about the same colour in a second role.

Rows 0 and 2 are unseen in any round. Row 0's `#ffffff` / `#ffeded` background/surface pair is a
near-twin and is a live twin-sibling exposure (running count 2); a "same colour" note there is count 3
and the first that would justify touching collapse width — file it there, not against the conflict
reading.

---

## Why this fresh cover

Row 4 is drawn from `coverage-set-1-220` (disjoint from `demo-20`) and checked against the union of all
five prior rounds' `items.jsonl` — **31 distinct covers**, none of them this one.

**The criterion, stated: the highest edge fraction among fresh contract-passing accent-published covers
— round-5 row 2's rule, re-applied.** It is deliberately *not* a criterion selected on anything 0.4.2
changed. A fresh cover chosen for "held a chromatic mark with plenty of foreground headroom" would be a
cover chosen for the mechanism having worked, and would tell the overfitting watch nothing. Edge
fraction is a property of the artwork, it was the round-5 rule, and using it again makes the two
releases' fresh grades comparable rather than merely both fresh.

**Exactly one cover ranks above it and is passed over, for the reason round 5 already recorded rather
than for a new preference**: `#138` at 0.9760 is a flat red graphic whose edge fraction is film grain
rather than content. (Round 5's other named exclusion, `#38` at 0.9390 — a monochrome pen-and-ink
drawing on which the accent question is degenerate — ranks *below* row 4 and did not have to be
excluded.) Row 4 at 0.9586 is the highest remaining, and by eye the edge fraction is real: scraped
paint, drips and canvas texture across the whole frame.

The standing signal it continues: round 2's five fresh covers came back 0 strong / 2 acceptable /
3 weak while all four re-grades went strong; round 5's two fresh covers **both** came back ≤ 2. That is
two independent measurements of improvement-on-reviewed-covers with weakness off them. This round has
one fresh cover. **One cover is not a rate and the report must say one.**

---

## Exclusions, stated

- **Contract-failing covers are excluded, re-derived rather than taken on report.** `validatePalette`
  over the eight source run rows: **8 pass / 0 fail** (`verify.ts` check 6). The coverage run's own
  scorecard is 200 pass / 20 fail over 220 and every one of the 20 was outside the draw. Two members of
  the 20-cover conflict cohort — `…cc35f7f9…` at 2.71 and `…000b09dc39…` at 4.38 — are contract-failing
  and were excluded on that basis, which is why the mid-band pick is row 0 at 3.27 rather than 2.71.
- **`…000ad40f7a92f3abf74f4683` (min-ramp 4.65) was drawn and dropped.** It publishes
  `surfaceCollapsed: true` with `#c3c3c3` on both field ends and a `#c8c9c4` foreground — a grey-on-grey
  cover with a second gradeable defect in it. Row 2 (4.93) replaces it as the mild end. Recorded because
  a dropped draw is a selection decision.
- **Cover 19 is not a member of `coverage-set-1-220`** — checked against the set file, not assumed. It
  is a `demo-20` cover, so its palette ships from `run-demo-20-0.4.2.jsonl`: same candidate, same commit
  `b9c41a4`, same `codeVersion` `a5f17f31…`, its own `--no-cache` determinism twin. The fresh-cover rule
  (draw beyond demo-20) constrains the **fresh** class and has nothing to say about a re-grade.
- **The cinnamon cover (130) is not in this round.** It graded **strong** at round 5 with no note, its
  accent is unchanged at 0.4.2, and re-showing a settled strong buys nothing at eight items.
- **The four round-5 admitted-shape covers are not re-shown.** Round-5 branch (b) fired in the
  discharging direction (0/4 artifact-family notes); the watch is passive and does not need items.

---

## Outcome branches

What the orchestrator does with each result. **Written before the grades exist.**

### (a) The conflict arbitration — rows 6, 0, 2, read together with row 5

This is the round's purchase and both readings are pre-registered. The trigger is **note language plus
grade**, and the two readings are distinguished by *what the note names*, not by how low the grade is.

- **IDENTITY WINS.** The three conflict rows grade ≥ 3, or grade lower for reasons that name the
  background/surface/gradient rather than the text — **and no note complains that the text is hard to
  read, faint, low-contrast, invisible, or the wrong colour for the lettering**. → The 0.4.2 hold rule
  is **right as written**. The 2.5 floor is enough, the twenty strained covers are not a defect, and
  legibility floors stay what the design constraints say they are: **user parameters, default near
  zero**, not something the mechanism should be raising on its own authority. The swap thread closes and
  the front returns to field roles / substrate, which round 5 already named the top complaint class.
  Row 6 grading ≥ 3 is the strongest single form of this: the corpus's worst foreground, accepted.
- **LEGIBILITY WINS.** Two or more of rows 6, 0, 2, 5 grade ≤ 2 **with a note naming the text** — *hard
  to read*, *can't read*, *too faint*, *no contrast*, *the text should be white/black*, *the title is
  white and this isn't*, in any wording. → The hold rule **needs a floor clause**: holding is correct in
  principle (rows 1 and 5's accents are the asks delivered) but 2.5 is the wrong number, and the
  comparator must be allowed to swap back when the displaced foreground falls below a floor the graded
  cases bracket. The swap **partially returns** — not the 0.4.1 behaviour, which cost the chromatic
  marks, but the hold conditioned on a higher floor. The bracket comes from the grades: the highest
  min-ramp that drew a text complaint and the lowest that did not. **This is the only outcome that
  yields a number rather than a direction, which is why the three rows are spread 2.67 / 3.27 / 4.93.**
- **THE SPLIT — the informative middle.** Row 6 (2.67) draws a text complaint and row 2 (4.93) does
  not. → the floor moves into the bracket between them and nothing else changes. If row 0 (3.27) also
  complains, the bracket narrows to (3.27, 4.93]; if it does not, to (2.67, 3.27]. Either way the next
  iteration re-runs coverage-220 at the new floor and checks that rows 1 and 5's accents — the delivered
  asks at min-ramp 6.66 and 3.07 — **survive** it. Row 5 at 3.07 is the constraint that makes this
  non-trivial: a floor above 3.07 takes 039's magenta back out of the accent slot, and the round would
  then have bought a genuine conflict between two of the reviewer's own verdicts, to be reported upward
  rather than resolved locally.
- **BOTH READINGS FIRE ON THE SAME ROW.** A note that praises the accent *and* complains about the
  text is not ambiguous — it is the arbitration answered directly, and it reads as LEGIBILITY WINS with
  the hold rule's principle confirmed. Record the wording verbatim.

### (b) The delivered asks — rows 1 and 5

- **Both ≥ 3.** The chromatic-mark hold is judge-validated on the two covers it was designed against.
  168's three-round identity-coverage line **closes**; the swap refinement queued after round 5 is done
  and comes off the list.
- **Row 1 ≤ 2.** Read the note before anything. The blue is now in the accent slot; if the complaint
  names the accent anyway, the four rounds of identity-coverage evidence were read wrong and branch (d)
  governs. If it names the foreground or the fields, it is a field-role finding for the substrate line
  and **not** a refutation of the hold.
- **Row 5 ≤ 2 naming the text.** Counts in branch (a) as LEGIBILITY WINS, and additionally means the
  ask and the price arrived on the same cover — the sharpest form the finding can take. Report it as
  one cover.

### (c) The 19-regression check — row 7

- **Strong again.** No regression: the yellow accent is as good as the prescribed white. The
  chromatic-departure ordering is not costing us on this cover and the redesign is clean here.
- **≤ 2, or below round 2's strong, with a note naming the accent** — *the yellow is the same as the
  background*, *the accent should be white*, *the accent doesn't stand out*. → **Confirmed regression**,
  and its shape is 168's original complaint (an accent in the background's own family) produced by the
  *ordering* rather than the comparator. → the chromatic-departure ordering needs a term separating the
  accent from the field ends, designed against this cover and 168's. This would be the first measured
  cost of the 0.4.0 redesign and it must be reported as such, not folded into the conflict finding.
- **≤ 2 naming something else.** Not a regression finding. File where the note points, and record that
  the accent question on this cover is still unanswered since round 2.

### (d) The shade re-check — row 3

- **≥ 3 with no shade note.** `#421b50` → `#5d1988` (chroma 0.0995 → 0.1714) fixed it. The within-lump
  cascade item queued after round 5 closes.
- **A shade note repeats** — *still darker than the real purple*, *not the purple in the artwork*. →
  The chroma band is not the instrument; the cascade's lightness handling is, and the next attempt is
  designed against the measured lump rather than the band. Two counts on one cover across two releases
  is enough to say the first fix was aimed wrong.
- **A "these two greys are the same colour" note.** Twin-sibling count **3** — the first count that
  would justify touching collapse width. It is not shade evidence and must not be filed as such.
- **≤ 2 for the gradient.** This cover publishes ρ 0.977, the round's most confident ramp. A
  false-gradient note here would be the fourth in the series and belongs to the gradient-existence
  class, which round 5 folded into the substrate cycle.

### (e) The fresh-cover watch — row 4

- **≥ 3.** First fresh cover to grade ≥ 3 since round 2. It is **one cover**, and the report says one.
  It does not discharge the overfitting signal; it stops the run of consecutive fresh failures at two.
- **≤ 2.** Third independent fresh-cover failure across three releases, on a selection rule held
  constant between rounds 5 and 6. → the overfitting reading strengthens from "measured twice" to
  "measured three times on a constant instrument", and the next iteration's priority is a breadth
  instrument rather than more fixes — reported upward as a paradigm-quality question. The note's class
  matters: round 5's fresh failures both named **field roles** (background correctness, false gradient),
  which is the substrate convergence. If this one does too, that is the same finding, not a new one.

### (f) The honest-decode branch — a complaint class no branch above anticipated

**No branch above pre-empts this one, and it outranks all of them.** If two or more items grade ≤ 2 and
the notes name something not in the list — not the conflict's text-legibility family, not accent
identity, not field roles, not gradient existence, not twins — then the round has bought a finding, and
the finding is that the evidence line 0.4.2 was derived from was read wrong. Action: decode the notes
verbatim into a new class, report it upward in the §7 report *before* any local fix, and change nothing
in the accent or swap path until the class is named. Round 2's staging lesson is the precedent.

---

## Honest notes

Things that are true, that a later reader could mistake for a discovery, and that are therefore recorded
now rather than found later.

- **Cover 02's foreground drifted `#010000` → `#020001` at some point before 0.4.2, and nobody flagged
  it until W21.** Round 2 graded that cover strong on `#010000`; the current build publishes `#020001`
  (confirmed on this round's `demo-20` run, index 2). It is a one-unit move in two channels, almost
  certainly invisible, and the cover is **not in this round**. It is written here because the class of
  event — a graded cover's published colour changing across releases with no watch on it — is exactly
  what row 7 turns out to be a large instance of, and because "we noticed it late" should be on the
  record next to the round that acts on the large one.
- **Row 7's yellow is a candidate regression, not a confirmed one.** It has not been graded since
  round 2. Branch (c) is what turns it into a finding; until then it is a suspicion with a mechanism
  attached.
- **`chromaticMarkHeld: false` does not mean "no chromatic mark".** On rows 3, 4 and 7 the comparator
  never wanted to swap in the first place (the accent's min-ramp did not exceed the foreground's), so
  the 0.4.2 clause had nothing to hold. Reading those three as "the hold rule declined them" would be
  wrong.
- **The comparator's fire rate fell 28.2 % → 3.2 %.** Anything round 2 credited to the swap on a cover
  outside 168/039 is now credited to the foreground search instead, and no round has graded that
  substitution. It is not a branch here; it is the reason the field-role complaint class may move
  independently of everything above.
- **The full 200-pair robustness block is still owed** (W21's worker environment suspended it). No
  number in this file depends on it; a background run may be producing it while this round is staged,
  and nothing here reads or writes `measurements/`.

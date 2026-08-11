# Round 5 — calibration. Nine covers, one palette each. The accent evidence backbone.

**For the orchestrator, not the reviewer. Nothing in this file is served.** The reviewer-facing
side-car (`sidecar.data.json`) is blinded: no prototype name, no arm label, no mechanism text, and no
signal of which selection class an item is in. `verify.ts` check 10 greps the served file for the
whole forbidden vocabulary rather than trusting this paragraph.

Candidate `p3-fields-0.4.1`, commit `9504846`. Staged from the worktree `.worktrees/p3-fields`.

---

## The question this round answers

> **Are these palettes right for these artworks — and specifically, do the small chromatic accents
> belong?**

Two things shipped at 0.4.0/0.4.1 that only a judge can grade, and they pull in opposite directions.

The **accent redesign** (`../../ACCENT_REDESIGN.md`) deleted the tier wall that made any qualifying
lightness-moving pixel — typically a grey — beat every chromatic mark by construction. Seven
identity-coverage verdicts across rounds 2, 3 and 4 asked for the chromatic mark by name. The
redesign claims to publish it.

The **eligibility adoption** (`../../measurements/substrate/ADOPTION_RULING.md` §2) retired the
raw-share floor — `SOURCE_POPULATION_FLOOR`, 0.1 % of the artwork — and replaced it with
`support ≥ COHERENT_SUPPORT_MIN (1e-5)` **and** `fill ≥ COHERENT_FILL_FLOOR (0.005)`. That is what
lets the named marks through, because *every one of them is a small mark*. It is also what the ruling
names as this release's risk, in its own words:

> RISK, named: eligibility admits small coherent lumps, the shape item-009's artifact accent wore
> (that accent shipped under the OLD floor, so the floor was no protection either) — the 18
> newly-published accents are unreviewed. Disposition: round-5 carries a sample of them; the judge
> decides. That is what rounds are for.

So the round is not "did the fix land". It is **one question asked at both ends of the same
mechanism**: the marks the reviewer asked for, and the marks nobody asked for that came in through
the same door. The reviewer grades palettes; this file is where the two readings are separated
*before* the grades exist.

### The classes are not disjoint, and that is the finding, not a defect in the round

Stated first because it is the thing most likely to be misquoted later: **the two headline named
marks are themselves newly-admitted accents.** `#421b50` publishes on support 2.515e-4 and `#97191a`
on 6.000e-4, both below the retired 1e-3 wall, both admitted by the coherence route alone. The
eligibility rule is not a side-effect that happens to also let some junk in — it *is* the mechanism
that publishes the reviewer's marks. A note that says "this small colour does not belong" and a note
that says "this small colour is exactly what I asked for" are verdicts on the **same rule**.

The three named-mark items and the four admitted-shape items are therefore distinct *covers* chosen
to sit at different places in that rule's range, not two independent mechanisms. Branch (b) is
written to respect that: a complaint about the admitted shape does not refute the redesign, it prices
the fill floor.

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
| **Purpose field** | **`calibration`** |

`purpose: calibration` is declared here and the installer honours the enum **verbatim** (main ruling,
2026-08-05). Rounds 3 and 4 both went out as `purpose: "mechanism"` against their own ROUND.md; that
is twice, it is append-only once pushed, and it is the one installer-side detail this round asks to
be read off this table rather than inferred.

`fundedBy` stays **linkage-free**. No batch id, no item id, no prior-round reference goes in it while
this batch is open — citing them is identity information under the blinding standard. The motivating
verdict ids are recorded post-release by main, via the release-note amendment.

Nine is inside the standing 4-to-10 band, and is the smallest number carrying three named marks, four
points along the admitted-shape range, and two fresh covers.

### Item ids and row order

`itemId` is the **artwork content stem** — `basename(imagePath)` with the extension removed, nothing
else (`../QUEUE.md`, staging convention from the round-4 install). No run ordinal appears anywhere.
`verify.ts` check 8 asserts id == stem on every row.

Row order interleaves the three classes: **A N F A N A F N A**. The classes are the round's whole
design, and a reviewer who noticed that four consecutive covers all turned on a small chromatic mark
would be grading a pattern rather than a palette. Nothing served says which class an item is in.

### The escape

The calibration UI's **per-item veto plus free-text notes** is the escape, as in rounds 1 and 2. No
item here forces a choice between two things: every item is one palette, gradeable on its own, and a
reviewer who thinks the question is wrong can say so in the note or refuse the item outright.

---

## The item table

Row order is the served order. Every number is measured — regime, swap, edge fraction and step counts
from `diag-coverage-0.4.1/` (the `P3_DIAG` chain of the re-run); support, fill, spread and the
eligibility route from `accent-support-0.4.1.json`. Cover appearance is the one judgment no number
carries and was made by eye at full resolution.

| # | itemId (stem) | cover, as it reads | class | regime | accent | support | fill | route |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `…62339a473711468f14643` | *Black Dog in My Path* — desert-dusk photo with an inset landscape print, hand-drawn amber title lettering | **admitted — lowest support** | ink | `#cf6529` | 1.709e-5 | 0.0223 | coherent only |
| 1 | `…5d8403971249d1ef0786b` | *Parody Kings* — greyscale figure on a studio backdrop; white title, **purple** sub-title | **named mark — purple** | ink | `#421b50` | 2.515e-4 | 0.0489 | coherent only |
| 2 | `…15cade5b18898a33dac6a` | photographic collage — two figures in an orange disc over a teal-to-cream ground, red sleeve, thin diagonals | **fresh — busy / photographic** | luminance | `#ee2d42` | 1.240e-3 | 0.2622 | raw **and** coherent |
| 3 | `…0403dcc48ac67e0a1b97f` | *I Had Not My Hat* — figure in a mustard jester hood in a sunlit park, white blackletter type | **admitted — lowest fill** | luminance | `#b8c504` | 6.836e-5 | **0.0051** | coherent only |
| 4 | `…c4ff9e01aba5eae6cbec4` | *Cinnamon Sweet Jazz* — overhead coffee cup on a yellow ground, cinnamon sticks, orange scarf | **named mark — cinnamon** | ink | `#97191a` | 6.000e-4 | 0.0616 | coherent only |
| 5 | `05687107a2a9019ee68c3b7f70ff47b6` | *The Holiday Has Been Cancelled* — vintage swimmers running from a mushroom cloud over an orange sunset | **admitted — W16's low-fill exemplar** | luminance | `#ffa720` | 5.898e-4 | 0.0124 | coherent only |
| 6 | `ddd8a0e7961edcf8e95b771ae0d9b8c5` | *So Long and Thanks for All the Shoes* — three flat bands (brown / cream / pink), black-outlined **teal** logotype and ovals | **fresh — ink regime** | ink | `#64c7c2` | 6.448e-2 | 0.2765 | raw **and** coherent |
| 7 | `…1a326091e7dd7df58b175` | vivid blue liquid marbling on near-black | **named mark — blue family / role assignment** | ink, **swap fired** | `#3d3936` | 3.694e-3 | 0.0146 | raw **and** coherent |
| 8 | `…14778c5ef2a0dea2461a4` | *Sombras Nada Mas* — greyscale band montage with a gold "30 Aniversario" logo | **admitted — highest support, concentrated** | luminance | `#c26b0a` | 8.911e-4 | **2.5391** | coherent only |

Full palettes, gradients and collapse flags are in `items.jsonl`; every hex there is checked against
the image's actual pixels by `verify.ts` check 2 (9/9, 45 hexes including guide stops).

**Twin-sibling watch (round-2 branch (f), running count 2):** row 1 carries `#4b4b4b` / `#7a7a7a`,
the same pair round 2 counted on this cover. Row 2 carries `#cc001e` background against a `#ee2d42`
accent — two reds, and the closest new pair in the round. A "these are the same colour" note on
either is collapse-width calibration evidence; count it, do not dismiss it as taste.

---

## Why these three named-mark covers

The falsifier list in `../../ACCENT_REDESIGN.md` is seven covers. Four of the seven are **not
available as clean evidence about this release** and are excluded by name:

- **208 and 188 are re-attributed** (W16 annotation, ruling §4). 208's rank 0 passes verification and
  is a dark red, not the yellow — the hue-separation term demoting a yellow against a warm beige
  field, which is 168's rule doing what 168 asked for. 188's rank 0 passes and is refused downstream
  by the accent↔foreground separation and the invariant-4 clauses. **Neither is a population
  question, and neither may be quoted as floor evidence anywhere downstream of this file.** W12's
  "what keeps four of them out is the floor, not the ordering" is measured wrong for those two.
  Confirmed on this run: 208 publishes `#672129`, a dark red, exactly as the annotation predicts.
- **039 and r2-item-2** are the remaining two; both are one-cover repeats of the same purple/magenta
  shape the three below already carry, and nine items will not hold them.

The three that remain are the three the annotation *confirms*, plus the one whose rule the redesign
deliberately settled in favour of:

### Row 1 — `#421b50`, the purple (r2-item-4)

Reviewer, round 2: *"very distinct purple … we could use instead (as the accent)"*. The cover's
sub-title line is that purple. At 0.4.0 the wall stepped past it; at 0.4.1 it tops the ordering
(departure 0.9966) **and passes verification**, on support 2.515e-4 — a quarter of the retired wall.
This is the single most direct test the round contains: the reviewer named a colour, the mechanism
now publishes that colour, and the only question left is whether they meant it.

### Row 4 — `#97191a`, the cinnamon (130)

Reviewer, round 3, repeat-confirmed round 4: *"beautiful brown colors (cinnamon, coffee) … would be
great accents instead of Holy Crow black"*. `#97191a` is the cinnamon-red. **The half of the verdict
this does not answer is stated rather than hidden:** the reviewer asked for the browns *instead of*
the black, and the published foreground is still `#1f0302`, a near-black, reached after four ink
verifications (`foreground:ink:0…3`). So the accent moved and the black stayed. If the note repeats
"instead of the black", that is a **foreground** finding, not an accent one, and must not be filed
against the redesign.

### Row 7 — the blue family, and what 0.4.1 actually publishes there (168)

Reviewer, round 3, repeat-confirmed round 4: *"the accent would be better within the blue family
instead of … the same color family as the background and surface"*.

**Measured at 0.4.1: the accent ordering found the blue and the swap comparator took it away.** The
accent search's rank-0 choice is `#2aa5e9` — the artwork's vivid blue, 347 px. The fg↔accent
comparator then fired (`roleSwapApplied: true`) and re-labelled it: the published **foreground** is
`#2aa5e9`, and the published **accent** is `#3d3936`, the ex-foreground — a dark warm grey, in the
same colour family as the background `#0b0800` and the surface `#26211d`. **That is verbatim the
condition 168 complained about, arrived at by a different route.**

The item ships anyway, and the branch it tests is renamed to match: this is now a **role-assignment**
item, not an ordering item. The redesign's requirement 8 kept the swap comparator downstream of the
new ordering; on this cover that composition undoes what the ordering achieved. Round 4's item-132
independently produced role-assignment evidence of the same shape (the published blue "would be more
of a background/surface"). If the reviewer grades this down and names the grey, the finding is that
the comparator must not be allowed to demote the chromatic mark into the field's own family — a
condition on the swap, not on the accent ordering, and not a change any branch here authorises
without the grade.

---

## Why these four admitted-shape covers

### The pool, and the two numbers that describe it

Measured over `run-coverage-220-0.4.1.jsonl` (`accent-support-0.4.1.json`, and reconciled against
`../../measurements/substrate/run-coverage-220-0.4.0-control.jsonl`):

- **47 → 29 accent collapses**, and exactly **18** covers went collapsed-at-0.4.0 → published-at-0.4.1.
  That 18 is the ruling's number and it reproduces exactly.
- **48 published accents at 0.4.1 pass the coherence route and fail the retired raw-share wall** (44
  of them contract-passing, 39 of those never shown in any round). This is the *broader* statistic and
  the one this round samples: the 18 are the covers where the alternative was collapse; the other 30
  are covers where 0.4.0 would have stepped the rank and published something else. 63 of 220 accents
  differ between the two versions.

**The two numbers answer different questions and neither is the other.** 18 = collapses removed. 48 =
published accents the old wall would have refused at their rank. Anything downstream quoting "18" for
the size of the admitted shape is quoting the wrong statistic.

Across the 48: support spans 1.709e-5 to 9.863e-4 (i.e. the whole band between the two floors), fill
spans 0.0051 to 4.20 with median 0.0727, and **15 of the 48 sit below fill 0.02** — that low-fill tail
is where the ruling's risk lives.

### The four, and why each

Chosen to span the admitted range on both axes, lowest support to highest, with the low-fill tail
represented three times because that is the shape the judge most needs to rule on. All four are
unseen in any round, contract-passing, accent-published, and **not** in the named-mark class.

| # | accent | support | ×`COHERENT_SUPPORT_MIN` | fill | ×`COHERENT_FILL_FLOOR` | what it is by eye |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `#cf6529` | 1.709e-5 | **1.7×** | 0.0223 | 4.5× | the hand-drawn amber title lettering — a designed mark, and the smallest published accent in the corpus |
| 3 | `#b8c504` | 6.836e-5 | 6.8× | **0.0051** | **1.02×** | a yellow-green off the sunlit grass, *not* the mustard hood the cover is about |
| 5 | `#ffa720` | 5.898e-4 | 59× | 0.0124 | 2.5× | the orange of the blast cloud; spread 0.7012, i.e. scattered across the frame |
| 8 | `#c26b0a` | 8.911e-4 | 89× | **2.5391** | 508× | the gold "30 Aniversario" logo — a tightly concentrated designed mark at the top of the band |

Row 3 is the sharpest instrument in the round: **fill 0.0051 against a floor of 0.005** is 2 % of
headroom on an `[UNCALIBRATED]` constant that was fitted on five covers, four of which were the covers
it was judged on (`../../src/verify.ts` says so in those words). Row 8 is its control — same band by
support, 500× the concentration, and unmistakably a designed logo. If the judge splits those two, the
fill floor is the number to move and the round has bought a bracket for it. If the judge accepts both
or rejects both, fill is not what the eye is reading and branch (b)'s prescription is wrong.

Row 5 is W16's named low-fill exemplar, carried on that basis so the sample is not re-drawn away from
the case a prior worker flagged. `#498083` (fill 0.039), the other of W16's two, is not in the 0.4.1
committed build's admitted set and is not substituted for.

---

## Why these two fresh covers

Both drawn from `coverage-set-1-220`, which is disjoint from `demo-20`; both checked against the union
of all four prior rounds' `items.jsonl` (25 covers, 17 of them inside coverage-220) and appear in
none. The fresh-cover rule is the standing overfitting guard (`../../EVIDENCE_2026-08-04.md` item 9).
Both are contract-passing, accent-published, and **not** newly-admitted — their accents clear the
retired wall too, which makes them controls for the four above as well as breadth.

### Row 2 — busy / photographic

Rule applied: the highest edge fraction among fresh, contract-passing, non-admitted covers **that is
actually a photograph**. Edge fraction 0.9335. Two busier covers were passed over for stated reasons
rather than quiet preference: `#138` (0.9760) is a flat red graphic whose edge fraction is film
grain, not content, and `#38` (0.9390) is a monochrome pen-and-ink drawing, on which the accent
question is degenerate.

**A prediction, recorded before the grade:** this palette is `#cc001e` / `#ecb491` / `#e96849` /
`#ee2d42` — four reds, corals and peaches on a cover whose second-largest field is plainly **teal**.
It looks to me like an identity-coverage miss of exactly the 168 shape, on a cover nobody tuned
anything against. I am shipping it because the selection rule chose it, and I am writing the
prediction down so that if the note says "the teal is missing" nobody can call it a discovery.

### Row 6 — ink regime

The cleanest ink-regime instance in the fresh pool: flat colour bands, no photography, edge fraction
0.1107, foreground `#000000` — a true black, the identity-vs-legibility question at the far end where
identity and legibility agree. Its accent `#64c7c2` is the artwork's signature teal at support
6.448e-2, three orders of magnitude above anything in the admitted class, so it is also the round's
"large obvious mark" anchor.

**A count the round did not buy:** row 6 publishes a **3-stop** gradient (`#fefcd6` → `#f2b7d3` at
0.3125 → `#764638`), the only multi-stop ramp in the round. Round 3 named banding on all four 4-stop
covers and none of the 2-stop covers, and the guide-stop canon now requires excursion justification
per stop. Stop spacing here is 0.3125 / 0.6875 — nowhere near round 2's 3.1 % adjacency defect. If a
banding or "that pink is a new colour" note appears, it is real evidence and it is **unpurchased**:
one cover selected for its ink regime is not a rate.

---

## Exclusions

- **Contract-failing covers are excluded, re-derived rather than taken on report.** `validatePalette`
  over the nine source run rows: **9 pass / 0 fail** (`verify.ts` check 6). The run's own scorecard is
  200 pass / 20 fail over 220 and every one of the 20 was outside the draw.
- **Every cover shown in rounds 1–4 is excluded from the fresh class** (25 covers; 17 of them are
  inside coverage-220). The three named-mark covers are re-shown deliberately and by name.
- **208 and 188 are excluded on the re-attribution**, not on availability — see above. Their exclusion
  is the ruling being obeyed, and it is the reason this round carries three named marks rather than
  the five that would otherwise have been drawable.
- **item-009's cover is not in this round.** At 0.4.1 its accent **collapses** — the Sandalwood
  artifact accent that produced round 4's salience note is not published by this build at all. That
  is worth knowing and it is not gradeable: there is nothing to show.

---

## Outcome branches

What the orchestrator does with each result. **Written before the grades exist.**

### (a) Named-mark branch — rows 1, 4, 7

- **All three ≥ 3.** The accent redesign and the eligibility adoption are **validated by the judge**.
  The seven identity-coverage counts stop being an open evidence line, the tier-wall deletion is
  bought, and the retired raw-share wall stays retired — including at row 1's 2.5e-4, a quarter of it.
  Accent stops being the quality centrepiece and the thread returns to robustness (accent instability
  69.5 % at baseline is still the worse reading, `../../ACCENT_REDESIGN.md`'s second falsifier).
- **Two of three ≥ 3 with row 7 the exception, and the note names the grey or the role assignment.**
  The ordering is validated and the **swap comparator** is the defect: it is demoting the chromatic
  mark into the field's own family, which is 168's complaint reconstructed downstream. → the next
  iteration prices a condition on the comparator (it may not swap a chromatic accent onto a
  field-family foreground), and that condition is designed against the graded cases, not guessed.
  Row 7 alone does not authorise it; it plus round 4's item-132 makes two counts, which is the
  threshold this file sets.
- **Exactly two of three ≥ 3, exception is row 1 or row 4.** Read the note before acting. Row 4 has a
  known confound written down above — the near-black foreground the reviewer asked to be replaced is
  still published — and a note repeating "instead of the black" is a **foreground** finding that must
  be filed there.

### (b) Admitted-shape branch — rows 0, 3, 5, 8 (the ruling's named risk)

The disposition the adoption ruling deferred to this round. The trigger is **note language**, not
grade: round 4's item-009 gives the exact wording to watch for, and it is quoted here so the decode
is not a judgement call —

> *"the Sandalwood color of the accent does not seem to be part of the artwork, it might be coming
> from some **dithering or texture artifact**."*

Any note in that family — *artifact*, *dithering*, *noise*, *compression*, *shadow*, *not part of the
artwork*, *doesn't belong*, *just a bit of the photo* — counts, in any wording.

- **Two or more of the four draw such a note.** The eligibility shape is admitting marks that are not
  marks, and **the salience guard needs tightening at the fill floor**, which is the term that decides
  concentration. `COHERENT_FILL_FLOOR` is `[UNCALIBRATED]`, fitted on five covers, four of which were
  the covers it was judged on; the graded cases bracket it. → raise the floor to the level that
  separates the complained-about rows from the accepted ones, re-run coverage-220, and check the two
  named marks (2.515e-4 / 6.000e-4 support, 0.0489 / 0.0616 fill) **survive** it. If they cannot, the
  fill floor is the wrong instrument and the guard needs the coherence machinery instead, which is
  round-2 branch (b)'s pre-emptive refusal of a size or contrast term still standing.
- **Row 3 draws such a note and row 8 does not.** The cleanest possible result: 0.0051 refused, 2.5391
  accepted, same support band. → the floor moves into the bracket between them and nothing else
  changes. This is the outcome the pair was chosen to produce and it is the only one that gives a
  *number* rather than a direction.
- **None of the four draws such a note.** The admitted shape is not visibly wrong to the judge at four
  points across the whole range including 1.02× the fill floor. → the ruling's named risk is
  **discharged for this sample**, the constant stays where it is, and the salience diagnostic stays
  deferred. Four covers do not close `EVIDENCE` item 6; they do mean the next iteration spends nothing
  here.
- **A row is graded ≤ 2 for a reason that is not the accent.** Read the note first. Rows 5 and 8 are
  busy covers with many ways to be wrong, and this class's purchase is the accent specifically.

### (c) The honest-decode branch — named marks ≤ 2 with a *new* complaint class

**No branch above pre-empts this one, and it outranks all of them.** If two or more of rows 1, 4 and 7
grade ≤ 2 and the notes name something no branch here anticipated — a complaint class that is not
identity-coverage, not the artifact family of (b), not role assignment, not the row-4 foreground
confound — then the round has bought a finding, and the finding is that **the evidence line this whole
release was built on was read wrong**. The action is: decode the notes verbatim into a new class,
report it upward in the §7 report *before* any local fix, and change nothing in the accent path until
the class is named. Two rounds of quality work were derived from seven verdicts; a new class on the
same covers means the derivation, not the implementation, is what needs re-doing. Round 2's staging
lesson is the precedent — a cover mischaracterised at staging turned that round's only ρ-confident
test into a chroma-absence test, and it was caught only because the decode was written down first.

### (d) Overfitting branch — rows 2 and 6 against round 2's fresh-cover profile

Round 2's five fresh covers came back **0 strong / 2 acceptable / 3 weak** while all four re-grades
went strong. That asymmetry — improvement on the fitted covers, weakness off them — is the standing
overfitting signal, and it has never been re-measured.

- **Both fresh rows ≥ 3.** Better than round 2's fresh profile on a release whose changes were derived
  from *named* covers. The mechanism produces plausible colour where nobody tuned it, which is the
  strongest thing a two-item sample can say.
- **Both fresh rows ≤ 2.** The fresh profile has not improved, or has worsened, while the named marks
  (if branch (a) fires) improved. → **overfitting-to-reviewed-covers**, now measured across two
  releases rather than suspected across one. The next iteration is not more fixes; it is a breadth
  instrument, reported upward as a paradigm-quality question. Note the sample is two, and the report
  must say two.
- **Row 2 ≤ 2 naming the missing teal, row 6 ≥ 3.** The prediction recorded above fires. It is
  identity-coverage on a *fresh* cover — count 8 in the running series — and it says the redesign
  answers identity coverage on the covers that motivated it and not yet in general. → the ordering's
  hue-separation term gets re-examined against a cover where the missed colour is a large field, which
  is a different shape from every one of the seven.
- **Anything here read as a rate.** Two covers is not a rate. Whatever these two say goes in the report
  as two covers, by name.

### (e) Standing watches

- **Twin siblings** — running count 2 (round 2). Rows 1 (`#4b4b4b`/`#7a7a7a`) and 2
  (`#cc001e`/`#ee2d42`) are the exposure; a "same colour" note on either is count 3 and the first
  count that would justify touching collapse width.
- **Guide stops** — row 6's 3-stop ramp, unpurchased; see above.
- **The swap comparator's fire rate** fell 80/220 (36.4 %) at 0.3.0 to **62/220 (28.2 %)** at 0.4.1,
  which is the drop `../../ACCENT_REDESIGN.md` requirement 8 predicted if fg/accent selection
  improved. Recorded here as a measurement, not as a branch: no grade in this round prices it.

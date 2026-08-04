# Residual purity round 1 — verdict

**Round:** `residual-purity-1`, 50 answers, released 2026-08-03T22:41Z. Analysed 2026-08-04.
**Bar:** pre-registered in `RESIDUAL_EXPERIMENT_NOTES.md` §11.11, fixed before any answer was seen.
**Numbers:** `data/sam/residual-purity-1-analysis.json`. **Script:** `oracle/sam/analyze_residual_purity_1.py`.

---

## The one-line answer

**NOT-ADOPT, in both guard variants, by a wide margin.**

The bar asked for a stratum-reweighted "pure field" rate of **0.75**. Both variants came in at
**0.24**. Every single stratum fell below the 0.50 floor, in both variants. R-3's structural claim
is **not adopted on this evidence**: the residual stays what round 2 called it — a **field-enriched
prior**, not a background isolator.

---

## Read this first: the round had no escape answer

After release, you told us:

> "sometimes it's hard to tell what is field and what is subject, so answers for those cases are not
> reliable (even with human feedback) unless we add an escape answer choice."

The round offered **pure field / mostly field / not field** and nothing else. On covers where
figure and ground genuinely aren't separable, you were forced to pick one of the three anyway. So
**every rate in this document is "answers as given"**, and on the ambiguous covers those answers are
not a reliable measurement. This is the same class of disclosure as the earlier forced-choice
rounds: the answers stand as recorded, this note is the key for reading them.

This is not an idle caveat — `GROUND_FREETEXT_SYNTHESIS.md` independently found **3 of 9** covers
ambiguous even when you described them in free prose, with no answer slots constraining you at all.
Figure/ground ambiguity is a real and reasonably common property of these covers, not reviewer
noise.

**But it does not change this verdict, and here is why, precisely.** Suppose we were maximally
charitable and counted *every* "mostly field" answer as "pure field" — the ceiling the round could
possibly reach:

| variant | actual reweighted pure | ceiling (pure + mostly) | bar |
|---|---|---|---|
| guard ON | 0.2424 | **0.7412** | 0.75 |
| guard OFF | 0.2424 | **0.6127** | 0.75 |

Neither variant clears 0.75 **even at the ceiling**. The verdict does not sit near the boundary,
so no reallocation of the soft answers — and no plausible use of an escape option — turns this
round into an ADOPT. The missing escape answer qualifies the exact rates. It does not qualify the
verdict.

---

## What was measured

25 three-panel sheets from the `sam-eval-142-v4-nouns` run, each asked twice — once about the
"area guard ON" residual panel, once about "area guard OFF" — for 50 (sheet, panel) answers. Each
question: *is everything still visible here background — is there nothing left that belongs to a
depicted subject, to display text, or to an applied mark?*

Panels rendered at the **subtraction cut**, not the shipped precision cut. That was deliberate and
pre-registered: 11 of the 26 text gaps sit between the two thresholds, and rendering at the
precision cut would have asked you to judge a threshold choice while believing you were judging an
instrument. **This is not a proposal to change `config.py`.**

The sample is deliberately enriched for hard cases, so the raw rate is not a population estimate.
The bar applies to the **stratum-reweighted** rate, using the pre-registered pool sizes as
inverse-probability weights.

---

## The table

Counts are answers, not sheets — 25 per variant. `pool` is the stratum's size in eval-142 and is
the reweighting weight.

### Guard ON

| stratum | pool | n | pure | mostly | not | **pure rate** | mostly rate | floor ≥0.50? |
|---|---|---|---|---|---|---|---|---|
| noun-fired | 77 | 8 | 2 | 4 | 2 | **0.250** | 0.500 | ✗ |
| noun-silent | 10 | 5 | 2 | 1 | 2 | **0.400** | 0.200 | ✗ |
| contaminated | 25 | 6 | 1 | 2 | 3 | **0.167** | 0.333 | ✗ |
| class-only | 2 | 2 | 0 | 1 | 1 | **0.000** | 0.500 | ✗ |
| static-only-clean | 28 | 4 | 1 | 3 | 0 | **0.250** | 0.750 | ✗ |
| **reweighted** | 142 | 25 | 6 | 11 | 8 | **0.2424** | 0.4988 | — |

### Guard OFF

| stratum | pool | n | pure | mostly | not | **pure rate** | mostly rate | floor ≥0.50? |
|---|---|---|---|---|---|---|---|---|
| noun-fired | 77 | 8 | 2 | 2 | 4 | **0.250** | 0.250 | ✗ |
| noun-silent | 10 | 5 | 2 | 1 | 2 | **0.400** | 0.200 | ✗ |
| contaminated | 25 | 6 | 1 | 2 | 3 | **0.167** | 0.333 | ✗ |
| class-only | 2 | 2 | 0 | 2 | 0 | **0.000** | 1.000 | ✗ |
| static-only-clean | 28 | 4 | 1 | 3 | 0 | **0.250** | 0.750 | ✗ |
| **reweighted** | 142 | 25 | 6 | 10 | 9 | **0.2424** | 0.3703 | — |

**Verdict per the bar, applied exactly:**

| variant | reweighted pure | ≥ 0.75? | strata below 0.50 | verdict |
|---|---|---|---|---|
| guard ON | 0.2424 | **no** | all five | **NOT-ADOPT** |
| guard OFF | 0.2424 | **no** | all five | **NOT-ADOPT** |

Both clauses fail in both variants. There is no variant in which the round adopts.

**The mostly-field share, which the bar ignores.** It is large — about half the guard-ON answers.
Read plainly: the typical residual is *mostly* background with something identifiable still in it.
That is exactly the "field-enriched prior" description, and this round is the first pixel-level
evidence for it rather than a proxy's guess. It is a real and useful property. It is just not the
property R-3 asked for.

---

## What you found in the residuals

Four concrete classes of thing that survived subtraction, in your words: **a flame**, **a cello**,
**some residual text**, and **decorations above/below the main text**. These are not one failure —
they are three different ones:

1. **A flame, and a cello — the single-noun elicitation limit.** The noun question asks for *the*
   main thing in the cover. A second depicted object is never named, so it is never prompted, so it
   is never masked. This is a known shape of failure and the fix is already proposed:
   **list-ALL-things elicitation** rather than one noun.
2. **Residual text — the known `text_below_cut` classes.** Text that scored below the cut and
   survived. This is precisely what the subtraction cut exists to reduce, and it is still leaking
   at that cut.
3. **Text-adjacent decorations.** Ornaments above and below the main text block are not part of any
   `text_like` mask, and they are not a depicted subject either, so nothing removes them. You gave
   the rule that settles this in passing: *decorations above/below the main text count as part of
   the main text.* That is a labelling policy and it is proposed as a decision record below.

---

## Guard ON vs guard OFF — evidence for A6, not a decision

**On the bar's own quantity, it is a dead tie: 6 pure-field answers each, reweighted rate identical
to four decimal places (0.2424 both).** The area guard changed nothing about how often a residual
reads as *purely* background.

It did change the softer margin, and consistently in one direction:

| stratum | pure+mostly ON | pure+mostly OFF | direction |
|---|---|---|---|
| noun-fired | **0.750** | 0.500 | ON better |
| noun-silent | 0.600 | 0.600 | tie |
| contaminated | 0.500 | 0.500 | tie |
| class-only | 0.500 | **1.000** | OFF better |
| static-only-clean | 1.000 | 1.000 | tie |
| **reweighted** | **0.7412** | 0.6127 | **ON better, +0.1285** |

Sheet-paired, the two variants agreed on **22 of 25** sheets. The three disagreements: two
`noun-fired` sheets where guard ON read better (`mostly` vs `not`), one `class-only` sheet where
guard OFF read better.

**Stated as A6 evidence and nothing more:** the guard's benefit here is concentrated in
`noun-fired` — covers where the dynamic noun prompt actually fired — and it shows up as *fewer
outright failures*, not as more clean isolations. The whole reweighted margin comes from that one
stratum. That is at least consistent with extending the `person` exemption to `dyn-noun` (ruling
R-2 anticipates this), but the evidence is thin: two sheets, on the soft margin, with pure-field
tied. A sibling agent is reading mask round 3's guard answers independently; **A6 should be decided
on both readings together, not on this one.**

---

## The proxy said 82% clean. You said 24%.

The proxy (`residual-cuts-analysis.json`, v4 / subtraction cut) flagged 25 of 142 covers with at
least one contamination cause and called the other **117 (82.4%) clean**. Those 25 flagged covers
*are* the `contaminated` stratum. So the proxy's implicit per-stratum claim is stark: **0% clean in
`contaminated`, 100% clean in all four other strata.**

Against that, the human read:

| stratum | proxy says clean | you said pure (ON) | you said pure (OFF) | gap |
|---|---|---|---|---|
| noun-fired | 1.00 | 0.250 | 0.250 | **−0.75** proxy over-claims |
| noun-silent | 1.00 | 0.400 | 0.400 | **−0.60** proxy over-claims |
| contaminated | 0.00 | 0.167 | 0.167 | +0.17 proxy under-claims |
| class-only | 1.00 | 0.000 | 0.000 | **−1.00** proxy over-claims |
| static-only-clean | 1.00 | 0.250 | 0.250 | **−0.75** proxy over-claims |
| **aggregate** | 0.824 | 0.242 | 0.242 | **−0.582** |

The gap is not a calibration offset — it is **structural, and it runs almost entirely one way**. In
the four strata the proxy declared clean, three-quarters of the residuals had something left in
them. The proxy counts *known causes* it can name; it cannot count the flame, the cello or the
ornament, because nothing in the pipeline ever proposed them as objects. Its 82% was never a
measurement of purity — it was the rate at which its own named causes stayed silent.

The one place the proxy was *pessimistic* is `contaminated`: it called those 0% clean, and one of
six read pure. Small, but the right direction — the proxy over-counts there, as §11 already warned.

The bar was deliberately **held at 0.75 rather than raised** when the proxy improved from 63% to
82%. That restraint is now vindicated in the opposite direction from the one anticipated: the proxy
improvement was not evidence about purity at all.

---

## Scope — what these numbers do and do not describe

- **This measures eval-142's distribution, not the corpus.** And eval-142 is a weak stand-in for
  the corpus: it was never sampled. It is a *census with an inclusion filter* — every artwork whose
  v2-3 warehouse held a palette graded `strong` and still standing. No seed, no quota, no
  difficulty strata. Its ground truth is an accepted *algorithm decision*, not an elicited human
  label.
- **The only "tier mix" eval-142 has is a resolution table, computed retroactively to show it was
  unrepresentative:** ≤400px 45 (31.7%, universe 26.5%), 401–640 86 (60.6%, universe 61.6%),
  641–1024 7 (4.9%, universe 10.3%), >1024 4 (2.8%, universe 1.7%). More damning than the tier
  skew: 25 of 142 covers are not in the embedded corpus at all, 4 of 36 clusters have no eval-142
  member, and cluster-mix total-variation distance from the corpus is **0.2273 vs 0.0851** for the
  coverage core — 2.67× worse. `COVERAGE_SET.md`: *"eval-142 was never a sample of this corpus."*
  It was superseded as the tuning bench by `coverage-set-1`
  (`d-2026-08-03-coverage-set-canonical-bench`).
- **Reweighting fixes the round's enrichment, not eval-142's drift.** The inverse-probability
  weights correct for `contaminated` being over-sampled *within* eval-142. Nothing here corrects
  eval-142's own distance from the corpus. A corpus-level purity number would need a
  coverage-set-1 round.
- **`contaminated` is deliberately over-sampled:** 6 of 25 answers (24% of the sample) against
  17.6% of the population. Intentional and pre-registered — hard cases are where the instrument
  breaks — and the reweighting is what makes the aggregate honest despite it.
- **Small cells.** `class-only` is n=2 per variant (the entire pool), `static-only-clean` n=4,
  `noun-silent` n=5. Their rates move in steps of 0.50 / 0.25 / 0.20. The floor clause is decided
  by very few answers — though in this round it hardly matters, since *every* stratum failed the
  floor in both variants, including the two largest.
- **Forced choice.** See the top of this document. Rates are answers as given.

---

## What this means for the vocabulary-vs-pixels ruling

**That ruling is yours to make. This document does not make it.** What it does is close off one of
the two arms.

The standing question was whether ground *vocabulary* — asking a human or a VLM what kind of ground
a cover has — could be retired in favour of pixel computation: subtract every detected subject, and
whatever remains is the background. The two arms of evidence now read:

- **The pixel arm (this round): failed, decisively.** 0.24 against a 0.75 bar, every stratum below
  the floor, and unreachable even at the charitable ceiling. "Everything but the masks" does not
  isolate backgrounds. It produces a residual that is usually *mostly* background with a flame, a
  cello, a caption or an ornament still in it.
- **The vocabulary arm (`GROUND_FREETEXT_SYNTHESIS.md`): 6 of 9 covers palette-decidable in prose.**
  On two-thirds of covers, a free-text description fixed both what kind of ground it is *and* which
  pixels are ground — enough to route a palette determinately. The 3 failures were figure/ground
  ambiguity, which is the same thing that made this round's forced answers unreliable.

Those two arms fail on the *same* covers for the *same* reason. That is worth sitting with: this is
not "pixels lost, vocabulary won" so much as "figure/ground ambiguity is real, and vocabulary at
least lets it be *stated* while subtraction silently gets it wrong."

### If you rule "vocabulary stays"

The ground question stays a human/VLM question and R-3 is closed as not-adopted. Next step: take
the vocabulary arm past n=9. The free-text round was 9 covers; a decidability rate of 6/9 needs a
real sample on `coverage-set-1` before it carries a contract. The residual keeps a job as a
*prior* — it is genuinely field-enriched — feeding whatever the vocabulary answer routes.

### If you rule "pixels, eventually"

R-3 is not adopted *on this evidence*, which is different from refuted. This round names exactly
what would have to be fixed first: list-ALL-things elicitation so a second object is proposed at
all, the `text_below_cut` leak, and the ornament policy below. Next step is those three fixes and
then a re-run of this identical round — same bar, same strata, plus the escape answer — on
`coverage-set-1` rather than eval-142.

### Either way

The escape answer goes into the next purity round regardless of the ruling. So does the decision
about whether a corpus-level number is wanted, since eval-142 cannot give one.

---

## Proposed decision records

Three, for your approval. None is recorded yet.

### 1. R-3 not adopted (the round's own verdict)

- **id:** `d-2026-08-04-r3-residual-not-adopted`
- **kind:** `question-set-ruling`
- **scope:** Ruling R-3 and the ground-vocabulary question. Changes no instrument, no threshold and
  no `config.py` value. Does not refute R-3; declines to adopt it on this evidence.
- **decision:** The pre-registered bar of `RESIDUAL_EXPERIMENT_NOTES.md` §11.11 — stratum-reweighted
  pure-field ≥ 0.75 in at least one guard variant with no stratum below 0.50 — is **not met**.
  Reweighted pure-field is 0.2424 in both guard variants; all five strata fall below the 0.50 floor
  in both. Even counting every `mostly_field` as pure, the ceiling is 0.7412 (ON) / 0.6127 (OFF),
  still short of the bar, so the verdict is not boundary-sensitive. **The residual remains a
  field-enriched prior, not a background isolator, and background structure does not become a pixel
  computation on this evidence.** The vocabulary-vs-pixels ruling remains the reviewer's, informed
  by this and by `GROUND_FREETEXT_SYNTHESIS.md`'s 6-of-9 palette-decidable finding.
- **fundingCaveats:** The round offered no escape answer; the reviewer states that on ambiguous
  figure/ground covers the forced answers are unreliable. Rates are answers as given. The verdict
  is robust to this (see ceiling above); the individual rates are not. Population is eval-142,
  which `COVERAGE_SET.md` establishes was never a sample of the corpus.
- **fundedBy:** the 50 `residual-purity-1` label ids + `bc-msdtcdh0-d97140ce` (listed in full in
  `data/sam/residual-purity-1-analysis.json` → `labelIds`, `batchCompleteIds`).
- **fundedByArtifacts:** `data/sam/residual-purity-1-analysis.json`,
  `oracle/sam/RESIDUAL_PURITY_VERDICT.md`, `oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md` §11.11.

### 2. Ornament policy — decorations count as main text

- **id:** `d-2026-08-04-text-adjacent-ornament-is-text`
- **kind:** `instrument-design`
- **scope:** `text_like` mask judgment, and any future ornament or decoration prompt. A labelling
  rule, not a threshold change.
- **decision:** **Decorations above and below the main text block count as PART of the main text
  for masking purposes.** Reviewer's words, `residual-purity-1` post-release feedback: *"decorations
  above/below the main text (that would be considered part of the main text)"*. Such ornaments are
  neither a depicted subject nor part of any current `text_like` mask, so nothing removes them and
  they contaminate the residual silently. This rule makes them in-scope for text masking and gives
  future review rounds a defined answer where they previously had none.
- **fundedBy:** the `residual-purity-1` labels (the round that surfaced it) + the reviewer feedback
  note record, **once ported to the warehouse** — see caveat.
- **fundingCaveats:** The reviewer's statement arrived as post-release prose, not as a warehouse
  record. It should be ported to a human-authored `note` record before this decision is recorded,
  so `warehouse recheck` can see it — the same gap, and the same fix, as
  `d-2026-08-04-embedding-canonical-model-warehouse-funded`.

### 3. Purity rounds get an escape answer

- **id:** `d-2026-08-04-purity-rounds-need-escape-answer`
- **kind:** `instrument-design`
- **scope:** The answer set for residual-purity questions and any future figure/ground question.
  Does not amend `residual-purity-1`'s released answers, which stand as given.
- **decision:** Future purity rounds add a fourth answer — **"can't tell what is field here"** —
  alongside pure / mostly / not field. Required by the question set's **design rule 8**: a slot must
  be able to record the answer, and on genuinely ambiguous figure/ground covers no existing slot
  could. The reviewer states forced answers on those covers are unreliable *even with human
  feedback*. The **escape share is itself a measurement** — figure/ground ambiguity signal, not
  noise — corroborated by `GROUND_FREETEXT_SYNTHESIS.md` finding 3 of 9 covers ambiguous in
  unconstrained prose. Ambiguity is a property of the covers and the instrument should record it
  rather than force it into a purity rate.
- **fundedBy:** the reviewer feedback note record (once ported), + `residual-purity-1` labels as the
  round that exposed the gap.
- **fundingCaveats:** As above — the feedback is prose until ported.

---

## Follow-ups this round opens

1. **List-ALL-things elicitation (v2 proposal).** The flame and the cello are one failure with one
   fix. This is now the highest-value change to the noun instrument.
2. **`text_below_cut` still leaks at the subtraction cut.** The cut was already the recall-favouring
   choice and text still survived it.
3. **A corpus-level purity number needs `coverage-set-1`.** eval-142 cannot provide one.
4. **A6 waits for both readings.** Mask round 3's guard answers are being read independently;
   decide the `person`/`dyn-noun` exemption on both, not on this round's thin two-sheet margin.
5. **A re-run of this exact round** — same bar, same strata, plus the escape answer, on
   `coverage-set-1` — is the clean test of whether the three fixes above actually move purity.

---

# Residual purity round 2 — verdict (2026-08-04)

**Round:** `residual-purity-2`, 48 answers over 24 sheets × 2 guard passes, released
2026-08-04T06:04Z. Analysed 2026-08-04.
**Bar:** pre-registered in `RESIDUAL_V5_NOTES.md` §12.9, held unchanged from §11.11, fixed before
any answer was seen.
**Numbers:** `data/sam/residual-purity-2-analysis.json`. **Script:** `oracle/sam/analyze_residual_purity_2.py`.
**Label schema:** `residual-purity.v2` — four answers. Round 1's answers are **never pooled with
these** and no combined rate appears anywhere below.

---

## The one-line answer

**NOT-ADOPT again, in both guard variants — but by a much narrower margin, and for a different
reason than last time.**

The bar asked for a stratum-reweighted "pure field" rate of **0.75**. Guard ON came in at **0.40**,
guard OFF at **0.56**. Last round both were 0.24. So the all-nouns subtraction moved the number a
long way — it roughly doubled — and it still is not enough. R-3's structural claim is **not adopted
on this evidence**: the residual is still a **field-enriched prior**, not a background isolator.

The floor clause fails too, in both variants. Under guard ON three strata sit below 0.50
(`noun-silent` 0.20, `contaminated` 0.00, `class-only` 0.00); under guard OFF two do (`noun-silent`
0.20, `class-only` 0.00). Note that `noun-fired` and `static-only-clean` land at exactly 0.50, which
the bar counts as passing — "no stratum **below** 0.50". They pass on the knife edge.

---

## Read this first: you asked for the escape answer, and then you never used it

After round 1 you told us the forced three-way choice was unreliable on covers where figure and
ground do not separate. This round added the fourth answer you asked for — *"can't tell what is
field here"* — on every one of the 48 panels, with its own framing text telling you it counts as a
real answer rather than a skip.

**You chose it zero times. 0 of 48.**

That is the most informative single number in the round, and it is worth being careful about what it
does and does not mean.

**What it does mean.** The rate rise from 0.24 to 0.40/0.56 is **not** an artefact of the new answer.
The pre-registered scoring takes escapes out of both the numerator and the denominator, so if you had
escaped on the hard covers, the rate would have risen mechanically — the hardest cases would simply
have left the sample. That explanation is now unavailable: the denominator never shrank. Every one of
the 48 panels was scored, and the rise is a rise in answers, not in bookkeeping. It also means no
stratum lost its purity rate to the >0.50-escape rule, so every cell in the table below is a real
rate.

**What it does not mean.** It does not mean figure/ground ambiguity was imagined. The free-text arm
found **3 of 9 covers ambiguous in prose** (`GROUND_FREETEXT_SYNTHESIS.md`, covers 5, 7 and 9) — a
prior of 0.33 against an observed 0.00 here. The two are not measuring the same thing. In prose you
were describing a whole artwork's ground from scratch, with no panel in front of you. Here you were
looking at the untouched artwork on the left and a specific subtraction beside it, and the question
named the panel. **The artwork panel appears to resolve the ambiguity**: with the original in view
you could evidently always say what the field was, even on covers that would have been hard to
describe cold. If that reading is right, it is a finding about the *instrument* — showing the source
image next to the residual is what makes the question answerable — and it is cheap to keep doing.

The alternative reading is less comfortable and cannot be ruled out from 48 answers: that the escape
was under-used because it was the fourth option, listed last, on a panel where "mostly field" was
already an easy landing spot. The round cannot separate those. What it can say is that the escape
was available, framed, and declined.

---

## The table

Rates are over the escape-excluded denominator, which here is the whole denominator. "ceiling" is the
charitable reallocation: every *mostly field* counted as pure.

### Guard ON

| stratum | pool | sheets | pure | mostly | not | can't tell | **pure rate** | escape share | ceiling |
|---|---|---|---|---|---|---|---|---|---|
| noun-fired | 102 | 8 | 4 | 3 | 1 | 0 | **0.500** | 0.00 | 0.875 |
| noun-silent | 12 | 5 | 1 | 3 | 1 | 0 | **0.200** | 0.00 | 0.800 |
| contaminated | 20 | 6 | 0 | 3 | 3 | 0 | **0.000** | 0.00 | 0.500 |
| class-only | 1 | 1 | 0 | 1 | 0 | 0 | **0.000** | 0.00 | 1.000 |
| static-only-clean | 7 | 4 | 2 | 1 | 1 | 0 | **0.500** | 0.00 | 0.750 |
| **reweighted** | 142 | 24 | 7 | 11 | 6 | **0** | **0.4007** | **0.0000** | 0.8106 |

### Guard OFF

| stratum | pool | sheets | pure | mostly | not | can't tell | **pure rate** | escape share | ceiling |
|---|---|---|---|---|---|---|---|---|---|
| noun-fired | 102 | 8 | 5 | 3 | 0 | 0 | **0.625** | 0.00 | 1.000 |
| noun-silent | 12 | 5 | 1 | 3 | 1 | 0 | **0.200** | 0.00 | 0.800 |
| contaminated | 20 | 6 | 3 | 2 | 1 | 0 | **0.500** | 0.00 | 0.833 |
| class-only | 1 | 1 | 0 | 1 | 0 | 0 | **0.000** | 0.00 | 1.000 |
| static-only-clean | 7 | 4 | 2 | 1 | 1 | 0 | **0.500** | 0.00 | 0.750 |
| **reweighted** | 142 | 24 | 11 | 10 | 3 | **0** | **0.5609** | **0.0000** | 0.9473 |

Two cells carry almost no weight and should not be read as rates. `class-only` is **one cover** —
the entire v5 pool — so its rate can only be 0.000 or 1.000, and it is a floor-clause failure decided
by a single answer. `static-only-clean` is 4 sheets from a pool that collapsed from 28 to 7 when the
all-nouns elicitation started prompting nearly every cover.

---

## The honest part: the verdict is no longer safe against the pure/mostly line

Round 1's NOT-ADOPT was robust. Its charitable ceiling was 0.7412 and 0.6127 — below the bar in both
variants — so no reallocation of the soft answers could have overturned it.

**That is no longer true.** Round 2's ceiling is **0.8106 (ON) and 0.9473 (OFF)**, and at the ceiling
every stratum also clears the 0.50 floor. In other words: *if every "mostly field" you gave were
counted as pure, this round would clear the entire bar in both variants.*

It is still a NOT-ADOPT. The bar asks for pure field, "mostly field" is not pure field, and the
ceiling is a sensitivity check rather than a result — nobody may quote 0.9473 as the purity of the
residual. But the verdict now rests entirely on where you drew the line between "pure" and "mostly",
and **"mostly field" was the modal answer of the round** (21 of 48). That line has never been
calibrated. If a future round is going to decide this question, calibrating it is probably the next
thing worth spending your attention on — because it, rather than the pixels, is now what the verdict
turns on.

---

## Guard ON vs guard OFF — the clearest signal in the round (A6 evidence)

**Turning the area guard off makes the residual purer, unanimously in direction.**

Of the 24 sheets, the two settings got the same answer on 18. On the 6 where they differed, **guard
OFF was the purer answer all 6 times. Guard ON was purer zero times.** Reweighted: 0.5609 OFF vs
0.4007 ON, a gap of **+0.16**. Four of the six disagreements are in `contaminated`, where guard OFF
scores 0.500 against guard ON's 0.000.

This is a real change from round 1, which saw essentially nothing here — 2 sheets favouring ON, 1
favouring OFF, a tie. The mechanism is straightforward: the guard discards masks above an area
fraction, and **a discarded subject mask leaves its subject sitting in the residual.** With eight
noun prompts per cover instead of one main noun, far more large masks get proposed, so the guard now
bites often enough to see. Round 1 could not see it because a single-noun list rarely produced a mask
big enough to trip the guard.

**This is evidence for A6's person exemption, and it says the same question now applies to
`dyn-noun-N`.** The exposure grew by roughly eight times when the noun list did.

**It is not permission to turn the guard off.** The guard exists to stop a runaway mask eating the
whole image, and this round measured only what *remains* — you were explicitly told "whether too much
was removed is not this question." The over-removal side is unmeasured. A one-sided measurement
cannot change a two-sided setting.

---

## Round 1 vs round 2 — two instrument readings, not one trend

| | round 1 | round 2 |
|---|---|---|
| subtraction | v4, the one main noun | v5, every noun a J list named (cap 8) |
| answers offered | 3 | 4 (escape added) |
| pools (nf/ns/cont/cls/soc) | 77/10/25/2/28 | 102/12/20/1/7 |
| reweighted pure, guard ON | 0.2424 | **0.4007** (+0.158) |
| reweighted pure, guard OFF | 0.2424 | **0.5609** (+0.319) |
| ceiling ON / OFF | 0.7412 / 0.6127 | 0.8106 / 0.9473 |
| verdict | NOT-ADOPT | NOT-ADOPT |

**Three things changed at once, and this round cannot separate them.**

1. **The subtraction got better** (v4 → v5). This is the change expected to raise purity, and it is
   the one that targets exactly what you named in your round-1 feedback: the flame, the cello, the
   second object a single-main-noun question never prompts for. If the movement is real, this is the
   likeliest cause.
2. **The escape was added.** This *could* have raised the rate mechanically by draining the hardest
   covers out of the denominator — but it demonstrably did not, because it was used zero times. **This
   explanation is ruled out**, which is the cleanest thing the escape bought us.
3. **The sample was redrawn**, under a different seed, over pools that moved hard. With 8/5/6/1/4
   sheets per stratum, one cover moves a stratum rate by 0.125 to 1.000. Sampling noise is large
   relative to the movement in every small stratum.

### The five covers both rounds judged — and they point the other way

Only **5 covers** appear in both rounds (the draws were independent, under different seeds, over
pools that changed size). §12.9's "paired question" means paired at the *population* level — both
draws come from eval-142 — not at the cover level. There is no cover-level paired design here.

On those 5 covers, across both guard passes, **9 of 10 judgments are identical to round 1.** One
improved by a single step (`not field` → `mostly field`). **Zero new "pure field" answers.**

That is uncomfortable and it is reported because it points against the headline. On the only covers
where a genuine before/after is visible, almost nothing moved. That is consistent with the aggregate
rise coming from the *redrawn sample* rather than from the *better subtraction* — and it is equally
consistent with 5 covers being far too few to show anything at all. It settles nothing on its own.
But anyone who wants to claim "all-nouns fixed the residual" has to explain why it did not visibly
fix these five.

---

## The proxy said 85% clean. You said 40–56%.

`analyze_residual_cuts_v5.py` calls **0.8521 / 0.8592** of v5 residuals clean at the subtraction cut.
You said 0.4007 / 0.5609.

| | proxy | you | gap |
|---|---|---|---|
| guard ON | 0.852 | 0.401 | **−0.451** |
| guard OFF | 0.859 | 0.561 | **−0.298** |

The proxy still over-claims purity, in the same direction, for the same structural reason: its 85% is
the rate at which *its own named causes stayed silent*, and it cannot count an object nobody proposed.
The measured offset was **−0.582** on v4. It is now −0.451 / −0.298. **The offset shrank but did not
close**, which is about what you would expect if a longer noun list lets the proxy see more of what it
was previously blind to without letting it see all of it. This is the second time this proxy has been
checked against a human, and both times it was wrong in the optimistic direction. It should keep
carrying its calibration block.

---

## What this means for the vocabulary-vs-pixels ruling

**The ruling is yours. This is the pixel arm, and the pixel arm returns a second NOT-ADOPT.**

The honest summary of the two arms is now:

- **Pixels** ("everything but the masks" isolates the field): 0.40–0.56 pure, against a 0.75 bar, on
  a corpus-unrepresentative set, with a charitable ceiling that would clear the bar. Better than
  round 1, not good enough, and no longer robust to a definitional line nobody has calibrated.
- **Vocabulary** (prose descriptions of the ground): 6 of 9 covers palette-decidable, 3 ambiguous.

The escape result adds one genuinely new thing to this comparison. The 3-of-9 prose ambiguity was the
strongest argument that some covers *have no ground fact to compute* — that the vocabulary arm was
hitting a property of the covers rather than a limitation of the description. **This round did not
reproduce that when the artwork was in view.** With the source image beside the residual, you always
had an opinion about what the field was. That weakens "some covers are simply undecidable" as an
argument against the pixel route, and it strengthens the more mundane diagnosis: the residual is not
pure because **the subtraction misses things**, not because there is nothing to subtract toward.

Which is a more tractable problem than the one round 1 suggested. It is still an unsolved one.

### If you rule "vocabulary stays"

Nothing here blocks that, and the pixel arm has now failed the same pre-registered bar twice. The two
guard findings still matter for mask quality regardless, and the A6 question needs deciding either
way.

### If you rule "pixels, eventually"

The route is now specific rather than vague. In rough order of expected value:

1. **Calibrate the pure/mostly boundary.** It is what the verdict turns on. A short round of
   side-by-side panels where you fix what counts as a "trace" would cost little and would tell us
   whether 0.56 is really 0.56.
2. **Decide A6, including `dyn-noun-N`** — and measure the over-removal side before touching the
   guard, so the decision is not made on this round's one-sided evidence.
3. **The other two round-1 fixes are still undone**: the `text_below_cut` leak and the ornament
   policy. This round did one of the three (list-all-things). A third round against a still-leaking
   text arm will keep paying the same tax.
4. **Then, and only then, the corpus re-run on `coverage-set-1`.** eval-142 cannot produce a corpus
   number and never could.

### Either way

**No number in this document is a corpus estimate.** eval-142 was never a sample of this corpus
(cluster-mix total-variation distance 0.2273 against `coverage-set-1`'s 0.0851). The sample is
deliberately enriched for hard cases. Reweighting fixes the enrichment; it cannot fix the population.

---

## Proposed decision records

Both are **proposed, not recorded**. Both are funded by the same evidence: the **48 released
`oracle-label` ids of batch `residual-purity-2` plus its batch-complete record
`bc-mse9775m-9656ec48`** (49 ids, listed in full in `proposedDecisionRecords[].fundedBy` of
`data/sam/residual-purity-2-analysis.json`). None is superseded, amended or retracted.

### 1. `d-2026-08-04-r3-not-adopted-on-v5-allnouns`

**R-3 not adopted: the all-nouns residual is still a field-enriched prior.** Stratum-reweighted
pure-field 0.4007 (guard ON) / 0.5609 (guard OFF) against a pre-registered 0.75; `noun-silent` (0.20)
and `class-only` (0.00) below the 0.50 floor in both variants, `contaminated` (0.00) below it under
guard ON. Succeeds — and confirms — round 1's verdict with a corrected instrument. **The bar was held,
not moved.** Also records that the escape answer was offered on all 48 items and chosen 0 times, so
the rate rise is not denominator shrinkage. Scope: eval-142 only. Known weakness: the charitable
ceiling clears the whole bar in both variants, so this NOT-ADOPT is boundary-sensitive in a way round
1's was not.

### 2. `d-2026-08-04-area-guard-off-wins-on-purity`

**The uniform area guard costs residual purity (A6 evidence).** 6 disagreements in 24 sheets, guard
OFF purer on all 6 and guard ON on none; reweighted +0.1602, concentrated in `contaminated`. Mechanism:
a discarded subject mask leaves its subject in the residual, and eight noun prompts propose far more
large masks than one did. Evidence for A6's person exemption and for extending the question to
`dyn-noun-N`. **Explicitly does not authorise turning the guard off** — the over-removal side was never
measured and this round told the reviewer not to judge it.

---

## Follow-ups this round opens

1. **The pure/mostly boundary is now the deciding variable and is uncalibrated.** New, and top of the
   list.
2. **The escape's zero rate wants one confirmation.** If showing the artwork panel is what makes
   ambiguity answerable, that is a reusable instrument finding worth one deliberate test — e.g. the
   three prose-ambiguous covers (5, 7, 9) put through this panel format.
3. **The five shared covers did not move.** Any claim that all-nouns improved purity should be checked
   against a design that actually pairs covers.
4. **A6 needs the over-removal arm** before the guard can change.
5. **`text_below_cut` and the ornament policy are still open** — two of the three round-1 fixes.
6. **The corpus question is still unanswered** and still needs `coverage-set-1`.

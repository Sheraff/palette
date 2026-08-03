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

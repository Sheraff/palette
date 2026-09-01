# v5 — the same experiment with EVERY noun (2026-08-04)

**This section belongs in `RESIDUAL_EXPERIMENT_NOTES.md` and is not in it.** That file was carrying
STAGED, UNCOMMITTED work from another agent's parked set when this round finished, and this
workstream was instructed not to commit it. Appending a section to a file whose index copy is
someone else's in-progress edit would either commit their work under this round's message or
silently drop it. So the section lives here, in its own file, and should be folded into
`RESIDUAL_EXPERIMENT_NOTES.md` as **§12** when the parked set lands. Nothing in that file has been
changed. §1–§10 remain the v3 record; §11 remains the v4 record.

**What this supersedes:** §11.11's pre-registered spec, which has already been consumed — the round
it specified (`residual-purity-1`) ran, and `RESIDUAL_PURITY_VERDICT.md` returned **NOT-ADOPT**. So
§11.11 is not being replaced mid-flight; it is being succeeded by a §12.9 spec for a round that has
**not** been pushed.

**Reviewer authorisation for this round, verbatim from the task:** *"You hold the GPU slot
(single-owner; pgrep first — a prior agent died, verify nothing is running; yours until done).
Reviewer pre-authorized GPU work."* The slot was verified free before either run started (one stale
pid, no live process) and is released at the end of this document.

---

**Verdict, stated first: the elicitation limit that `residual-purity-1` named is closed, and R-3
still cannot be decided here, because nobody has yet looked at a v5 residual.**

The flame and the cello were one failure with one cause — the noun question asked for *the* main
thing, so a second object was never named, never prompted, never masked. That cause is gone: **98 of
142 covers now fire a mask from a noun ranked below first**, and on those covers the residual closed
by a mean of 0.2207. The proxy's clean rate rose from 0.8239 to 0.8592. **That last number is worth
almost nothing and §12.7 is about why.** The one time this proxy was checked against a human it
over-claimed by 0.582; a proxy improvement is a report that the proxy's *named* causes went quieter,
and the causes it cannot name are exactly the ones that sank the last round.

---

## 12.1 What ran

Two runs, sequential, one GPU slot, 900 s of GPU in total against a ~25-minute stop-and-report bar.

| | run 1 — the nouns | run 2 — SAM |
|---|---|---|
| instrument | `oracle/premise/prompts/subject-nouns-all.v1.variant-J.json` (new) | `oracle/sam/run_sam_dynamic.py` **unchanged**, new table |
| runner | `oracle/premise/run_premise_allnouns.py` (new) | — |
| stem | `data/oracle-premise/subject-nouns-all-1.jsonl` | `data/sam/sam-eval-142-v5-allnouns.jsonl` |
| result | 142/142 ok, **0 failed, 0 parse failures, 0 retries** | 142/142 ok, **0 failed** |
| cost | **291.7 s, 2.05 s/inference** | **608.1 s, 4.28 s/image** |
| canary | 8 rows, **one fingerprint** | 2 rows, matched |
| rows | 142 answer + 8 canary | **7,431 region + 142 image + 2 canary** (v4: 5,115 / 142 / 2) |

Run 1 came in *cheaper per inference* than the single-noun run it replaces (2.05 s against
`subject-noun-1`'s 2.24 s) despite generating a mean of 26.0 tokens against ~9. Decode is not where
the money goes on this model; image encode and prefill are, and they did not change.

## 12.2 The instrument — `subject-nouns-all.v1`, variant J

One question, free text, JSON array envelope: `{"all_things": ["...", ...]}`, `minItems` 1,
`maxItems` 8, `max_tokens` 128. The grammar constrains **only the envelope** and never a noun, for
§11's reason restated: the closed enum's most common answer, `object`, masked nothing at all (0 of
24 covers, 22 returning no region even at the 0.3 capture floor) because it is a grammatical
category and not a thing-word.

Carried over from `subject-noun.v1` in substance: whole-not-part, as-specific-as-a-caption, the
literal `none` escape (as a one-element list, since `minItems` 1 makes the empty list unsayable).
Added: every-distinct-thing, one-entry-per-kind, largest-first, at-most-eight.

**The one deviation, recorded because it was earned the hard way.** `subject-noun.v1` carries
ORACLE_QUESTION_SET.md §A.6.0's referent clause byte-identically — *"When there is more than one,
take them all together — except where a single kind of thing is asked for…"* — which exists so that
one answer slot can survive a cover holding a person AND a car. This set has eight slots, so that
presupposition failure cannot arise, and keeping the clause would have actively suppressed the
second object the whole set exists to find. It is replaced by a distinctness rule. **Consequence,
enforced in the derivation and stated in the table's meta:** a J entry and an E==F `subject_kind`
are no longer answers to referent-identical questions, so the two halves are kept in separate tags
and are never merged into one answer.

**No agreement signal, said as loudly as §11.2 said it.** One variant. A J list is a single reading,
not a corroborated one, and `NOUNS_AGREEMENT_RULE` records that in the table's meta so no analysis
can pool it with an E==F class word by accident.

## 12.3 What the model said

830 entries over 142 covers, **mean 5.85 per cover**, min 1, max 8. **314 distinct raw nouns.** Four
covers answered `none`.

| entries per cover | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| covers | 6 | 15 | 15 | 14 | 10 | 3 | 7 | **72** |

**The cap binds on half the corpus and it is an untested constant.** 72 of 142 covers returned
exactly eight entries — the maximum the grammar allows. Eight is the number the PROBE5 rules
proposed; nothing measured it, and a list truncated at the cap is a list we know is incomplete. This
is a real limit on any claim that the elicitation is now exhaustive: **it is not, on half the
covers.** Raising the cap is cheap in GPU (the cost model is ~2.8 s + 0.037 s per prompt) and is a
follow-up, not something to change quietly here.

## 12.4 The derivation — `dynamic_concepts_v3.py`, rules version `sam-dynamic-concepts.v3`

`dynamic_concepts.py` (v1) and `dynamic_concepts_v2.py` are **not edited**; both stay frozen as the
records of the v3 and v4 runs. Normalization is v2's, imported rather than copied — lowercase,
de-article, de-punctuate, trivially singularize the last word, every step recorded per entry — so
"did the flame/cello class close?" is a comparison of elicitation and not of cleanup.

**Tags: eight ranks, not eight nouns.** `dyn-noun-1` … `dyn-noun-8`, in the order the model gave,
which the prompt asked to be largest-first. The tag space stays closed while the prompt space stays
open, and the rank is stored rather than thrown away, so `dyn-noun-1` is a like-for-like pair with
v4's single `dyn-noun`. Like every `dyn-*` tag they are in no `CONCEPT_GROUPS` group, so
`config.group_of()` returns None and they are cut at the **pooled** threshold — never `text_like`'s
raised cut and never `cjk_script`'s lowered one. No mask-quality round has ever graded one.

**678 of 830 entries used (81.7%), 284 distinct noun prompts, 730 extra prompts over 135 covers.**

| bar | n | the words it caught |
|---|---|---|
| `already_static` | 58 | barcode, logo, parental advisory, person, sticker |
| `lettering_word_barred` | 44 | background text, parental advisory label, signature, text |
| `bare_category_barred` | 17 | building, figure |
| `ground_word_barred` | 16 | background |
| `part_noun_barred` | 12 | eye, face, hand |
| `none_answered` | 4 | (the cover-level escape) |
| `non_thing_barred` | 1 | field |
| `duplicate_within_list` | 0 | — |
| `duplicate_of_class_word` | 0 | — |

**Three of these bars are new in v3 and every word in them is quoted from the prompt itself**, which
is the same belt-and-braces discipline v2 applies to part nouns — the bar has to hold whether or not
the model obeyed. `NON_THINGS_BARRED` is the sentence *"Lettering is not a thing. A pattern is not a
thing. A colour, a texture or a plain field is not a thing."* `BARE_CATEGORIES_BARRED` is the ten
words the prompt names by name. `LETTERING_WORDS_BARRED` is the remainder of the lettering
vocabulary that is not already a static prompt string, and it is **the one bar matched head-final** —
`background text` IS a kind of text, and English compounds are head-final, so barring on the head
word is a linguistic fact rather than a guess. Head-final matching is deliberately *not* applied to
any other bar: it would turn `NON_THINGS_BARRED`'s `field` into a bar on `corn field` and
`football field`, which are places a cover really can depict.

**`GROUND_WORDS_BARRED` is not a vocabulary judgment; it is a circularity fix, and it is the most
important line in this file.** The J run emits `background` as a list entry on 16 covers. Handing
that word to SAM as a subject prompt would make this instrument answer its own question: the
residual is *defined* as what survives after every mask is subtracted, and R-3 asks whether that
residual is cleanly the background. A prompt literally named "background" would subtract the
background, drive the residual toward zero, and register in the purity proxy as an improvement, with
nothing in the numbers to say the improvement was tautological. This is the same defect the phase-0
adversarial review found in the area-guard verdict, where a quantity "was computed over that
force-included subset alone and could not have produced a counterexample". **Without this bar, §12.6
and §12.7 would both be worthless.** `sky`, `wall`, `space` and `void` are deliberately NOT barred —
a sky and a wall are things a cover really depicts — and are flagged on the watchlist instead.

**The watchlists are flag-only, and they are the reviewer's call, not this module's.** 15 used words
sit on the part-noun watchlist (`devil horn, door, ear, finger, hair, head, horn, leaf, lip, mouth,
shoulder, thatched roof, wall, wheel, window`) and 23 on the non-thing watchlist (`band, circle, dot,
fog, frame, grid, light, line, painting, picture, rectangle, reflection, ring, shadow, sky, smoke,
space, splatter, square, stripe, surface, triangle, wall`). Probe 5 said in as many words that "the
real list is the reviewer's call"; inventing a longer bar here would be making that call silently.
These are the real candidate lists, printed rather than guessed at.

**The class half is unchanged for the second time, including the dead `"object"`.** v2 kept it so
v4's prompt list was a strict superset of v3's; v3 keeps it so v5's is a strict superset of v4's, and
any cover that masks under v5 and did not under v4 is attributable to the noun list alone. **This is
the third round in which retiring `"object"` has been declined, and it should be said plainly rather
than left as an omission: it is a twice-measured follow-up and it is being deferred again.**

| tag | covers | | tag | covers |
|---|---|---|---|---|
| `dyn-noun-1` | 134 | | `dyn-noun-5` | 80 |
| `dyn-noun-2` | 120 | | `dyn-noun-6` | 70 |
| `dyn-noun-3` | 107 | | `dyn-noun-7` | 52 |
| `dyn-noun-4` | 90 | | `dyn-noun-8` | 25 |
| `dyn-animal` | 5 | | `dyn-object` | 24 |
| `dyn-building` | 8 | | `dyn-vehicle` | 7 |
| `dyn-watermark` | 8 | | | |

## 12.5 The validity check, and it passed exactly

v5 runs 12 static prompts to v4's 10, plus up to eight dynamic ones per cover. If adding a prompt
perturbed another prompt's answer, v5-vs-v4 would be a comparison of two *instruments* and every
number in §12.6 would be confounded. `common.segment_concepts` runs the vision backbone once and the
text/DETR/mask head per prompt, with NMS applied per prompt and never across prompts, so it should
not — but "should not" is not a measurement.

**Measured, region for region, over the 10 shared static concepts: 4,867 regions in v4, 4,867 in v5,
4,867 matched, 0 present in only one run, 0 differing in score, area or mask RLE.** The static arm is
byte-identical. v5-vs-v4 compares elicitations.

**A second, unplanned check fell out of the same script and is worth recording:** re-deriving v4's
own proxy from scratch reproduces the published numbers exactly — 35 flagged / 107 clean (0.7535) at
the precision cut guard-off, and **25 flagged / 117 clean (0.8239)** at the subtraction cut
guard-off, which is §11's headline 82.4% to four decimals.

**The hash boundary is real and is honoured by disclosure, not by avoidance.** v4 ran under concept
set v2.1 (hash `9c78298f3c993678`); v5 runs under v2.2 (`d49a63c479d4e672`), adding `cjk-script` and
`kanji`. `config.py` forbids "a single analysis that reads rows from two hashes at once".
`analyze_residual_cuts_v5.py` reads two on purpose — saying where they differ *is* the job — and the
static-arm check above is what makes that readable. **This run also discharges the version-bump cost
the v2.2 ADD incurred:** `sam-eval-142-v5-allnouns` is the first full 142-cover run stored under the
v2.2 hash, so CJK rows and the rest now exist in one single-hash dataset.

## 12.6 What the nouns removed

Residual field fraction — what is LEFT after subtracting the kept masks. Subtraction cut.

| run | arm | guard | mean | median | min | max |
|---|---|---|---|---|---|---|
| v4 | dynamic | uniform | 0.8054 | 0.8406 | 0.3822 | 1.0000 |
| v4 | dynamic | person-exempt | 0.7899 | 0.8311 | 0.2469 | 1.0000 |
| v4 | dynamic | off | 0.7558 | 0.8050 | 0.0853 | 1.0000 |
| **v5** | dynamic | uniform | **0.6904** | 0.7004 | 0.0293 | 1.0000 |
| **v5** | dynamic | person-exempt | **0.6818** | 0.6932 | 0.0293 | 1.0000 |
| **v5** | dynamic | off | **0.5963** | 0.6328 | 0.0107 | 1.0000 |

Paired, same cover, same cut — how much more v5 subtracted: **mean +0.1595, median +0.0294, max
+0.9740, 95 of 142 covers moved by more than 0.001** (subtraction, guard off).

**Three guard variants are reported and none is treated as the answer.** `analyze_residual_cuts.py`
applies the area guard uniformly; it predates the `person_like` exemption mask round 3 added to
`config.passes_calibrated_cut()` on 2026-08-04. Both rules are live in the codebase and they
disagree, so both are computed. R-2 anticipates extending the exemption to a dynamic subject noun;
**that half is still not carried out, and `dyn-noun-N` is not exempt.**

**The headline recovery — v4 covers the proxy called `subject_unmasked`, that now carry a subject
mask:**

| cut | guard | v4 unmasked | closed in v5 | still open | newly open |
|---|---|---|---|---|---|
| subtraction | uniform | 12 | **6** | 6 | **0** |
| subtraction | person-exempt | 12 | **6** | 6 | **0** |
| subtraction | off | 9 | **4** | 5 | **0** |

**The flame/cello class, measured directly: 98 of 142 covers fire a mask from a noun ranked below
first.** On those covers the residual closed by a mean of 0.2207 (median 0.0786, max 0.9740). Rank
tags firing beyond rank 1: `dyn-noun-2` ×75, `-3` ×75, `-4` ×57, `-5` ×54, `-6` ×37, `-7` ×24,
`-8` ×10. **The structural cause of the flame and the cello is gone.** Whether the *specific*
residuals the reviewer flagged are now clean is a question only a human round can answer.

**Contamination recount (proxy), subtraction cut, guard off:**

| run | flagged | clean | clean rate | `text_below_cut` | `…below_pooled_too` | `subject_unmasked` | `no_subject_prompt` |
|---|---|---|---|---|---|---|---|
| v4 | 25 | 117 | 0.8239 | 15 | 11 | 9 | 2 |
| **v5** | **20** | **122** | **0.8592** | **15** | **11** | **5** | **0** |

**The text leak did not close, and it was never going to.** `text_below_cut` is 15 in both runs and
`text_below_pooled_cut_too` is 11 in both. This round changed the *subject* elicitation and touched
nothing about text, so those two columns being pinned is a consistency check that passed, not a
disappointment. The entire proxy improvement is the `subject_unmasked` column going 9 → 5 and
`no_subject_prompt_at_all` going 2 → 0. **`text_below_cut` remains follow-up 2 of the verdict's
three fixes and is untouched by this round.** So is follow-up 3, the ornament policy.

## 12.7 The honesty section: every number in §12.6 over-claims by a measured 0.582

`residual-purity-1` is the one time this proxy has been checked against a human. It called 82.4% of
v4's residuals clean. The reviewer, looking at 25 of them, called **24.24%** pure field — in both
guard variants, with every stratum below the 0.50 floor. `RESIDUAL_PURITY_VERDICT.md` states the
reason in one sentence: *"Its 82% was never a measurement of purity — it was the rate at which its
own named causes stayed silent."*

| stratum | proxy said clean | reviewer said pure | gap |
|---|---|---|---|
| noun-fired | 1.00 | 0.250 | **−0.750** |
| noun-silent | 1.00 | 0.400 | **−0.600** |
| contaminated | 0.00 | 0.167 | +0.167 |
| class-only | 1.00 | 0.000 | **−1.000** |
| static-only-clean | 1.00 | 0.250 | **−0.750** |
| **aggregate** | **0.824** | **0.2424** | **−0.582** |

**So read §12.6's 0.8239 → 0.8592 as follows, and no further.** The proxy's *named* causes went
quieter: one named cause (`subject_unmasked`) halved and another (`no_subject_prompt_at_all`) went
to zero. The proxy cannot count a flame, a cello or an ornament, because until this round nothing in
the pipeline proposed them as objects — and it still cannot count the ones a J list did not name, or
the 72 covers where the list hit the cap. **The gap is structural and runs almost entirely one way.
There is no reason to expect the calibration offset to be smaller on v5 than on v4, and no evidence
either way, because no human has seen a v5 residual.**

`analyze_residual_cuts_v5.py` prints this block above every table it emits and carries it in
`meta.calibration` of the JSON, so a consumer cannot pick a number up without it.

**Per-stratum proxy clean rate, v5, subtraction cut** — with the caveat that the strata themselves
moved (§12.8), so these are not paired with the v4 human column above:

| stratum | v4 pool | v5 pool | v5 proxy clean |
|---|---|---|---|
| noun-fired | 77 | **102** | 1.000 |
| noun-silent | 10 | 12 | 1.000 |
| contaminated | 25 | **20** | 0.000 |
| class-only | 2 | **1** | 1.000 |
| static-only-clean | 28 | **7** | 1.000 |

The proxy's implicit claim is unchanged and is exactly as stark as it was: 0% clean in
`contaminated`, 100% clean everywhere else. That claim was measured wrong once already.

## 12.8 What the strata did, which matters for any future round

`static-only-clean` collapsed from 28 covers to **7**, and `class-only` from 2 to **1**, because the
all-nouns elicitation prompts almost every cover. `noun-fired` grew from 77 to **102**. This is a
real property of the new instrument, not a sampling artefact.

**It has a cost for the round design.** `residual-purity-1` drew 4 sheets from `static-only-clean` as
its control — the covers where nothing dynamic was asked. That control stratum is now 7 covers, and
`class-only` cannot supply its quota of 3 at all. The v5 sample below is therefore **24 sheets, not
25**, and the shortfall is entirely `class-only`. **The quotas were held rather than rebalanced:
moving a quota to hit a round number would be tuning the sampling design to a target, which is the
same class of move as moving a bar.** If the reviewer wants 25, raising `static-only-clean` to 5 is
the one-line change, and it is theirs to make.

## 12.9 Proposed round `residual-purity-2` — PRE-REGISTERED, NOT PUSHED

Built by `oracle/sam/build_residual_sheets_v5.py --write`. Sheets in
`data/sam/residual-sheets-v5/` (24 PNGs), manifest `data/sam/residual-sheets-v5-sample.json`.
**No round is pushed and the script has no code path that pushes one.**

- **Seed 20260805**, distinct from the v3 round's 20260803 and the v4 round's 20260804. If two
  rounds shared a seed, an overlapping sample would look like a deliberate paired design when it was
  an accident of the RNG.
- **Panels unchanged:** artwork | what remains, area guard ON | what remains, area guard OFF. The ON
  panel renders the **uniform** guard, identical to the v4 round's panels, so the two rounds' sheets
  are the same instrument. The person-exempt variant is computed and stored per item but is
  deliberately **not** a third panel — adding one would change what the round measures while
  claiming to repeat it.
- **Cut unchanged:** the subtraction cut, for §11's reason — rendering at the precision cut would ask
  the reviewer to judge a threshold choice while believing they were judging an instrument. Note the
  subtraction cut is now `min(pooled, group cut)` per group rather than a flat 0.578, because
  `cjk_script`'s cut (0.392655, **PROVISIONAL** — one negative answer, and `config.py` says
  "nothing may cite it as calibrated") is *below* pooled and a flat rule would make the
  recall-oriented cut stricter than the precision one. On the v4 run the two definitions coincide,
  so no v4 number moves.
- **Strata and quotas unchanged** from §11.11: noun-fired 8, noun-silent 5, contaminated 6,
  class-only 3, static-only-clean 4 — drawing 8/5/6/1/4 = 24 against v5 pools of 102/12/20/1/7.
- **THE INSTRUMENT FIX — a fourth answer.** `pure field / mostly field / not field / **can't tell
  what is field here**`. This is proposed decision record
  `d-2026-08-04-purity-rounds-need-escape-answer`, required by design rule 8: a slot must be able to
  record the answer, and on genuinely ambiguous figure/ground covers no existing slot could. The
  reviewer's words after the last round: *"sometimes it's hard to tell what is field and what is
  subject, so answers for those cases are not reliable (even with human feedback) unless we add an
  escape answer choice."* `GROUND_FREETEXT_SYNTHESIS.md` independently found 3 of 9 covers ambiguous
  in unconstrained prose.
- **How the escape is scored, fixed in advance:** `cant_tell` is **not** counted as pure, **not**
  counted as not-pure, and **not** dropped. It leaves both the numerator and the denominator of the
  pure-field rate, and its **share is reported per stratum as a first-class result** — figure/ground
  ambiguity is a property of the covers, not noise. A stratum whose escape share exceeds 0.50 has no
  reliable purity rate and must be reported as having none, rather than as having a low one.
- **THE BAR IS HELD, NOT MOVED: reweighted pure-field ≥ 0.75 in at least one guard variant, and no
  stratum below 0.50.** Identical to §11.11, which the last round returned 0.2424 against. v5's
  *proxy* improved; the last round is precisely the evidence that a proxy improvement is not
  evidence about purity, so the bar does not move on it. Moving a pre-registered bar because a
  different measurement improved is the exact failure pre-registration exists to prevent.
- **Also pre-registered:** report the charitable ceiling (pure + mostly, escapes excluded) beside
  the rate, as the v4 verdict did, so a reader can see whether the verdict is boundary-sensitive.

**Population caveat, which is not small.** This sample is drawn from eval-142. `COVERAGE_SET.md`
establishes that eval-142 *"was never a sample of this corpus"* — cluster-mix total-variation
distance 0.2273 against `coverage-set-1`'s 0.0851, 2.67× worse — so **no number this round could
produce is a corpus-level purity estimate**. `RESIDUAL_PURITY_VERDICT.md`'s prescribed re-run is on
`coverage-set-1`. Running it here answers the *paired* question — did the all-nouns elicitation move
purity on the same covers the last round judged — which is worth answering and is cheaper. It is not
the corpus question, and the reviewer decides which one is wanted.

## 12.10 Not done here

- **No round was pushed.** Sheets and a spec exist; the decision is the reviewer's.
- **`config.py` is unchanged.** No threshold moved, no concept was added or removed, no group
  membership changed, no guard exemption was extended. `dyn-noun-N` is **not** guard-exempt.
- **No decision record was written**, including the three `RESIDUAL_PURITY_VERDICT.md` proposes.
  None of them is recorded yet and none is recorded by this round.
- **No stored run was modified.** v3, v4, `subject-noun-1` and every earlier artifact are untouched.
  `dynamic_concepts.py`, `dynamic_concepts_v2.py`, `analyze_residual_cuts.py`,
  `build_residual_sheets.py` and `build_residual_sheets_v4.py` are all unedited.
- **`common.py`, `selftest.py` and `RESIDUAL_EXPERIMENT_NOTES.md` were not touched**, because all
  three were carrying another agent's parked staged work. The two additions run 1 needed —
  registering a prompt set and validating a free-text *array* answer — live in
  `run_premise_allnouns.py` instead. Folding `_validate_with_free_text_arrays` into
  `common.validate_and_canonicalize` is the right end state and is a mechanical move once the parked
  set lands.
- **`oracle/premise/selftest.py` HAS ONE KNOWN FAILURE, and it is this round's.** Its inventory
  guard — *"prompts/ holds no file this selftest does not know about"* — is failing on
  `subject-nouns-all.v1.variant-J.json`. The guard is **correct and is doing its job**: a new prompt
  file is additive or it is a regression, and the guard makes the author say which. The fix is one
  line, adding the filename to the known-new literal at `selftest.py:534-536`. It was not written
  because that file is in the parked staged set. **Whoever lands the parked set should add it.**
  Everything the guard would have covered, and the one thing it could not (the free-text *array*
  answer shape), is covered by `oracle/premise/selftest_allnouns.py` — 32 checks, all passing.
  `oracle/sam/selftest.py` is unaffected and passes.
- **`"object"` was not retired** from the class half, for the third round running. Deferred, not
  overlooked.
- **The `text_below_cut` leak was not addressed** (follow-up 2 of the verdict's three), nor was the
  **ornament policy** (follow-up 3). This round did one of the three fixes.
- **No corpus-level number was produced**, and eval-142 cannot produce one.

## 12.11 Follow-ups this round opens

1. **The cap binds on 72 of 142 covers.** Eight is an untested constant and half the lists are
   truncated at it. Raising it is ~0.037 s of GPU per extra prompt. Until then, "every distinct
   thing" is measurably not what was elicited.
2. **A second variant (K) for the agreement signal.** Still the cheapest available upgrade, ~5
   minutes of GPU, and still absent. A J list is one reading.
3. **The watchlists want a reviewer's eye.** 15 part-noun and 23 non-thing words were *used* as SAM
   prompts. `light`, `shadow`, `reflection`, `fog`, `smoke`, `sky` and `surface` are the ones most
   likely to be subtracting field rather than subject — the same circularity `GROUND_WORDS_BARRED`
   catches in its plainest form, in a weaker form nobody has measured.
4. **`dyn-noun-N` and the area guard (A6/R-2).** R-2 anticipates exempting a dynamic subject noun.
   With eight rank tags per cover the exposure is eight times what it was, and it is still undecided.
5. **The three fixes are one-for-three.** The verdict named list-ALL-things, the `text_below_cut`
   leak and the ornament policy as what would have to be fixed before a re-run means anything. This
   round did the first. A purity-2 result would therefore still be read against a known-leaking text
   arm and an unowned ornament class.
6. **A human round is the only thing that can decide this.** Every number here is a proxy that has
   been measured wrong once, by 0.582, in the optimistic direction.

---

**Artifacts.** New: `oracle/premise/prompts/subject-nouns-all.v1.variant-J.json`,
`oracle/premise/run_premise_allnouns.py`, `oracle/sam/dynamic_concepts_v3.py`,
`oracle/sam/analyze_residual_cuts_v5.py`, `oracle/sam/build_residual_sheets_v5.py`,
`data/oracle-premise/subject-nouns-all-1.jsonl` (+ `.attempts.jsonl`, `run.subject-nouns-all-1.log`),
`data/sam/dynamic-concepts-eval-142-v3.json`, `data/sam/sam-eval-142-v5-allnouns.jsonl`
(+ `.attempts.jsonl`, `run.eval142-v5-allnouns.log`),
`data/sam/residual-cuts-v5-analysis.json` / `.txt`, `data/sam/residual-sheets-v5/` (24 PNGs),
`data/sam/residual-sheets-v5-sample.json`.

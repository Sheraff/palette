# Residual isolation — "everything but the masks", retried with dynamic prompting

2026-08-03. Reviewer-authorised retry of the residual route
(`d-2026-08-03-reviewer-background-via-residual-isolation`, ruling R-3): *"we also discussed
retrying the 'everything but the masks' idea now that VLMs help the SAM model with vocabulary of
'things to mask'. We should run that."*

The prize is structural. If subtracting every mask leaves a residual that is cleanly the
background, then background structure is a **pixel computation** and no model is ever asked about
backgrounds again — the corpus-wide group-A question is mooted rather than answered.

**Verdict, stated first: not yet, and the reason is nameable.** Dynamic prompting works where it
was given a real noun and does nothing where it was given an abstraction. The half of probe 5's
recommendation that carries the weight — the *species* noun — **does not exist in any oracle
answer on disk**, and this run measures the consequence of its absence rather than the mechanism
probe 5 endorsed. Everything below is evidence. No decision record was written and no review round
was pushed; the round spec in §8 is a proposal.

## 1. What ran

| | |
|---|---|
| run stem | `data/sam/sam-eval-142-v3-dynamic.jsonl` (new; no stored run was modified) |
| script | `oracle/sam/run_sam_dynamic.py` (a fork of `run_sam.py`, not a flag on it — §2) |
| covers | the 142 included premise eval-set images |
| concepts | static concept set **v2.1** (10) + per-cover dynamic concepts (0–2) |
| extra prompts | **52**, over **47** covers |
| GPU | **543.1 s (9.1 min)**, 3.82 s/image, 142/142 ok, 0 failed, 2 canaries both matching |
| estimate | 605 s predicted from `142 x 4.25 s + 52 x 0.037 s`; the run came in 10% under |
| rows | 4,908 region rows + 142 image rows + 2 canary rows |

The budget bar in the task was 45 minutes. The measured cost of dynamic prompting is
**~0.04 s per extra prompt** — PROBE5's rate reproduces — so the fixed per-image term dominates
and adding nouns is close to free.

## 2. Design decisions, and why each one is the way it is

**A separate runner, not a flag.** `run_sam.py` produced every stored run and its behaviour is
what three review rounds were judged against. A per-cover prompt list changes row identity, the
per-concept count dict and the group unions. Forking costs duplication and risks nothing.

**Row identity carries the dynamic list separately.** PROBE5_NOTES.md says it plainly: a per-cover
prompt makes the effective question set per-cover, so identity needs its own field rather than a
`concept_set_hash` whose meaning silently changes per image. So `row_key` here is the static key
plus `dyn:<hash>`, and `concept_set_hash` keeps meaning exactly what it means everywhere else.
Every row carries `dynamic_concepts`, `dynamic_prompts`, `dynamic_set_hash`,
`dynamic_subject_kind`, `dynamic_overlays`, `dynamic_derivation`, and the run's meta block carries
the derivation rules version and the source run's sha256.

**Dynamic concepts are cut at the pooled threshold.** A `dyn-*` tag is in no `CONCEPT_GROUPS`
group, so `config.group_of()` returns `None` and `passes_calibrated_cut()` uses
`CALIBRATED_SCORE_THRESHOLD = 0.578`. That is deliberate and recorded in the row's
`calibrated_cut` block: no mask-quality round has ever seen one of these prompts, so it gets the
default, never `text_like`'s raised 0.697295.

**Nothing in `config.py` was touched.** `CONCEPT_PROMPTS`, `CONCEPT_GROUPS` and every threshold
are unchanged, so the static concept-set hash is unchanged and every stored artifact stays
reproducible.

### The flaw this run fixes

`MASK_REVIEW_NOTES.md` addendum A5: round 2 selected its mask items at the calibrated cut but
rendered its residual panels from the stored `union_mask_rle`, computed over **all** instances at
the run-time capture floor `SCORE_THRESHOLD = 0.3`. The reviewer's "7 of 15 residuals only partly
field" — the verdict recorded in `d-2026-08-03-sam-concept-set-v2` as "a field-enriched prior, not
a pure field extraction" — is a judgment about the **0.3 union**.

Measured on this run, the gap is large:

| residual, mean over 142 covers | |
|---|---|
| at the 0.3 capture floor (what round 2 showed) | **0.7437** |
| at the calibrated cut, guard on | **0.8362** |

Every number in this document is at a calibrated cut. Nothing here is comparable to round 2's
verdict, and that is the point of re-running.

## 3. The derivation: VLM answers -> prompt phrasings

`oracle/sam/dynamic_concepts.py`, CPU, deterministic. Committed table:
`data/sam/dynamic-concepts-eval-142.json` — every cover, its raw per-variant answers, the agreed
value, the mapped tag and prompt, and a `reason` on every value that mapped to nothing.

Source: `data/oracle-premise/group-bcde-pilot-1.jsonl` (sha256 recorded in the table). All 142
eval covers carry both prompt variants E and F. Canary repeats are excluded.

**Agreement rule.** Single-select: use the value only where **E and F agree**. Multi-select
(`overlays`): set **intersection** — a value counts as agreed when both variants emitted it.

`subject_kind`: **E and F agree on 132 of 142 covers (93.0%)**. The 10 disagreements get no
dynamic subject; they are counted, not guessed.

| agreed `subject_kind` | covers | mapped to | why |
|---|---|---|---|
| `person` | 72 | — (`already_static`) | "person" **is** a static prompt string; a dynamic copy is the same question asked twice |
| `object` | 24 | `"object"` | untested; included so the second-largest subject class is not silently unprompted |
| `not_applicable` | 14 | — | no subject |
| *(E/F disagree)* | 10 | — | recorded as `variants_disagree` |
| `building_or_structure` | 8 | `"building"` | probe 5: precision 1.00 over five structures of five kinds, "a genuine hypernym" |
| `vehicle` | 7 | `"vehicle"` | probe 4 ran it as a hypernym beside `car`; it fires, with a known looseness |
| `animal` | 5 | `"animal"` | untested; probe 5 measured six *species*, never the class word |
| `abstract_shape` | 2 | — (`unmapped_no_noun`) | there is no noun to give SAM, and probe 3 measured the whole abstract/attributive family dead |

`overlays`: `watermark` -> `"watermark"` on 8 covers — **the one genuinely new mark concept**.
`label_logo` (41), `parental_advisory` (10) and `barcode_or_price` (2) are already static concepts
under v2.1 and are recorded as `already_static` rather than re-asked.

**Result: 47 of 142 covers (33%) get at least one dynamic concept; 52 extra prompts; 5 covers get
two.**

### The limit that bounds every number below

PROBE5_NOTES.md §"Granularity" recommends a **dual** prompt: the species/artefact noun the VLM
would use in a caption, **plus** the `subject_kind` class word as a fallback. Its evidence — 25 of
27 targets above the cut at a median 0.858 — is entirely about the **species** half.

**Only the class half exists.** `subject_kind` is a closed six-value enum (§D.1 of
`ORACLE_QUESTION_SET.md`) and no field in `group-bcde.v1`, or in any oracle run on disk, carries a
free-form noun. So this run tests class words, and probe 5's numbers do not transfer to it. That
is a property of the available answers, not a finding about SAM — but it is the single most
important thing to know before reading §5.

## 4. Validity check: adding prompts does not perturb the static answers

`predict_multi` shares one backbone pass and applies NMS per prompt, never across prompts, so the
static concepts should answer identically whether or not a dynamic noun rides along. Verified
rather than assumed, against `sam-eval-142-v2`, comparing concept / instance / score / area:

- **137 of 140 comparable covers byte-identical.**
- **3 differ only by `barcode` regions**, which `sam-eval-142-v2` was never asked for — it ran
  under concept set **v2** (9 concepts) and this run uses **v2.1** (10). `config.py` predicts
  exactly this.
- **0 genuinely perturbed.**

So `static` and `dynamic` below are both computed from **this run's own rows** — the static arm is
simply the regions whose `concept_is_dynamic` is false — and the comparison is not confounded by a
different model load or a different decode.

## 5. Results

### 5.1 Residual, four conditions

`residual_field_fraction`, recomputed from the per-region RLEs at the calibrated cut with
per-group thresholds. Guard on = `CALIBRATED_MAX_AREA_FRACTION = 0.5`; guard off = score cut only.

| condition | mean | median | min | max |
|---|---|---|---|---|
| static / guard on | 0.8445 | 0.8835 | 0.4987 | 1.0000 |
| dynamic / guard on | **0.8362** | 0.8758 | 0.4987 | 1.0000 |
| static / guard off | 0.8210 | 0.8739 | 0.2193 | 1.0000 |
| dynamic / guard off | **0.8128** | 0.8555 | 0.2193 | 1.0000 |

**What dynamic prompting newly captured**, `residual_static - residual_dynamic`:

- corpus-wide: mean **+0.0083**, median **+0.0000**, max **+0.3217**; **14 of 142 covers moved by
  more than 0.001**.
- over the 47 covers that had a dynamic concept at all: mean **+0.0250**, median **+0.0000**.
- **identical guard-on and guard-off**: not one dynamic region was removed by the area guard. The
  guard question and the dynamic question turned out not to interact on this corpus.

The biggest movers are exactly the classes §D.1's motivating case named — an animal at +0.3217,
a vehicle at +0.1984, an animal at +0.1929, a vehicle+watermark cover at +0.1563.

### 5.2 The finding: which class words are maskable nouns

Asked vs fired above the calibrated cut, and the best score each concept reached **anywhere** on
each cover it was asked about — including below every cut, so "returned a weak region" is
distinguishable from "returned nothing at all".

| concept | asked | fired | rate | best score per asked cover |
|---|---|---|---|---|
| `dyn-animal` | 5 | 5 | **1.00** | 0.91, 0.84, 0.80, 0.70, 0.58 |
| `dyn-vehicle` | 7 | 5 | **0.71** | 0.92, 0.91, 0.88, 0.83, 0.72, 0.53, 0.00 |
| `dyn-watermark` | 8 | 5 | **0.62** | 0.80, 0.69, 0.64, 0.61, 0.60, 0.31, 0.00, 0.00 |
| `dyn-building` | 8 | 1 | **0.12** | 0.65, 0.36, 0.34, 0.00 x5 |
| `dyn-object` | 24 | 0 | **0.00** | 0.38, 0.30, 0.00 x22 |

**`"object"` is not a maskable noun for this model.** 24 covers asked; **22 returned nothing at
all**, even at the 0.3 capture floor; the best score anywhere is 0.379. And it is not that the
covers are hard: on `00/ab67616d00001e020000e692a330542f8ed14132.jpg` — a single glossy red 3D
apple filling most of a white field, about as easy as a subject gets — `"object"` returns **zero
regions**, while probe 5's species nouns scored 0.95 on a cognac bottle and 0.86 on a lotus on
comparable renders.

This is the clearest possible confirmation of probe 5's dual-prompt recommendation, arriving from
the other direction: **the species half is the load-bearing half.** A class word is a usable
fallback only where the class is itself a thing-word — `animal`, `vehicle` and `watermark` are;
`object` is a grammatical category, not a thing, and `building` sits in between.

`"building"` deserves care rather than a verdict. Probe 5 measured precision 1.00 for it — but on
covers *confirmed by eye* to contain a building. Here it is fired on the VLM's claim, and 5 of 8
returned nothing. Two causes are consistent with that and this run cannot separate them: the VLM
was wrong, or SAM was silent on a right noun (probe 5: *"silence is not proof of a wrong noun"*).
Opening the eight covers would settle it and was not done.

### 5.3 The area guard

**6 regions removed, on 6 covers: 5 `person`, 1 `sticker`.** Mean residual difference
guard-on minus guard-off: **+0.0234**.

This reproduces the exposure `config.py` and loose end A6 both record — the guard's corpus effect
falls almost entirely on `person`, a concept the calibration sample never tested at big area, and
the reviewer's own words are *"it wouldn't be too surprising to have 90% of the image be 'a face'
or 'a car'"*. Ruling R-2 directs per-group scoping that exempts `person_like` **and any future
dynamic subject noun**. This run cannot price that exemption — its 5 big-area `person` masks are
exactly the case a reviewer has never graded — so both variants are reported and neither is
treated as the answer. §8's round puts both in front of the reviewer.

### 5.4 Contaminated residuals

A **proxy**, not a pixel judgment — only the review round can say what a residual actually
contains. Guard-off (the variant that gives isolation its best shot). 53 of 142 covers carry at
least one cause; **89 covers (63%) are clean by proxy**.

| cause | covers |
|---|---|
| `text_below_cut` — VLM says there is text, no `text_like` mask survives | 26 |
| `subject_unmasked` — a maskable `subject_kind` with no subject mask at all | 23 |
| `subject_kind_variants_disagree` — no dynamic subject could be derived | 10 |
| `abstract_shape_no_noun` — deliberately unprompted | 2 |

`subject_unmasked` by class: **object 14**, building 7, vehicle 1, person 1. Fourteen of the
twenty-three are the `"object"` failure of §5.2 — the residual still contains the subject because
the prompt it was given was not a noun.

**The text gap, split — and it is mostly not CJK.** Of the 26:

- **15 are recoverable at the pooled cut.** Their text masks sit between 0.578 and `text_like`'s
  raised group cut of 0.697295. These are lost to a **threshold choice**, and changing it recovers
  them.
- **11 have nothing above the pooled cut either** — the A12 shape, where no threshold in force
  helps.

**A12 is counted, not hidden — and the count is an upper bound, not a CJK count.** Four of the 11
were opened by eye:

| cover | best text score | what it actually is |
|---|---|---|
| `07/…0007960724fb77c8041c6c13` | 0.000 | **genuinely CJK** — one stylised Chinese character on a synthwave dragon cover |
| `10/…00103a3729bf589e0dc913ab` | 0.000 | tiny incidental scene text on a shirt and a sign — the VLM's `has_text` is right, but this is not display type |
| `images/placebo.jpg` | 0.549 | Latin, **rotated 90°** down the left edge |
| `0a/…000a24cc32b3d8b6e31bc161` | 0.576 | thin small-caps Latin — **misses the pooled cut by 0.002** |

So the 11 are heterogeneous: CJK is one member class among rotated type, hairline type and
incidental scene text. **At most 11 and plausibly far fewer of the eval set's covers are the A12
CJK case**; A12 still needs its own round with CJK covers deliberately pulled in, exactly as the
loose end says.

## 6. Answering the question that was asked

> Does subtracting all SAM masks leave a residual that cleanly isolates the background?

**On this evidence: no, not yet — but the failure is a vocabulary failure, not a method failure.**

For it, at a calibrated cut: 63% of covers are clean by proxy; dynamic prompting removed real
foreground on the covers where it was given a thing-word, up to 32% of a cover; adding prompts
provably does not disturb the static answers; and the residual at a calibrated cut is a
substantially different object from the 0.3 union the reviewer rejected in round 2.

Against it: the single largest contamination cause is that **24 of the 47 dynamically-prompted
covers were handed the word "object"**, which masks nothing, so their subjects are still in the
residual. 37% of covers carry a contamination cause. And the strongest claim this run can make is
about a *proxy* — nobody has looked at these residuals.

The honest reading is that this run **cannot decide R-3**, because the instrument probe 5
recommended was never built: the species noun does not exist to be given. What it can say is that
the mechanism carries weight where the noun is real, and that the missing piece is a **VLM
question**, not a SAM capability.

## 7. Honest limits

1. **The species half of the dual prompt is absent** (§3). This is the big one.
2. **`"object"` and `"animal"` were untested as prompts before this run.** `object` is now
   measured dead; `animal` is 5/5 on n=5, which is encouraging and underpowered.
3. **Every contamination number is a proxy.** `subject_unmasked` and `text_below_cut` are
   computable; "is this residual actually background" is not.
4. **`has_text == yes` is not "has display type".** Two of the four opened text-gap covers are the
   VLM correctly reporting incidental or tiny text. The proxy over-counts.
5. **n is small per dynamic concept** — 5, 7, 8, 8, 24. No per-concept threshold is derivable and
   none was proposed.
6. **The guard was never exercised against dynamic concepts.** Zero dynamic regions were guarded
   out, so this run contributes nothing to A6 beyond confirming the exposure is `person`-shaped.
7. **`building` is unresolved between "VLM wrong" and "SAM silent"** (§5.2) and eight covers would
   settle it.
8. **The eval set is 142 covers**, and the reviewer's own sampling caution applies: these are the
   premise eval set, not a corpus sample.

## 8. PROPOSED round: residual purity — pre-registered, NOT pushed

Sheets are built and ready at `data/sam/residual-sheets/` (24 covers), manifest at
`data/sam/residual-sheets-sample.json`, builder `oracle/sam/build_residual_sheets.py`, seed
20260803. Each sheet is three panels — **artwork | what remains, area guard ON | what remains,
area guard OFF** — with removed pixels filled by round 2's grey checkerboard rather than
overlay.py's black, which is illegible on dark covers. Labels are deliberately information-free.

**The question, one per panel:** *"Is everything still visible here background — is there nothing
left that belongs to a depicted subject, to display text, or to an applied mark?"*
Answers: **pure field / mostly field / not field.**

**Strata and quotas** (pool sizes in the eval set in brackets): `dynamic-fired` 8 [10],
`dynamic-silent` 5 [10], `contaminated` 6 [53], `static-only-clean` 5 [69].

**The bar, fixed before any answer is seen.** The sample is deliberately enriched for hard cases,
so the raw rate is not a corpus estimate: the bar applies to the **stratum-reweighted** rate, using
the bracketed pool sizes as inverse-probability weights.

- **Adopt R-3's structural claim** — background structure becomes a pixel computation — only if
  the reweighted **"pure field" rate is ≥ 0.75** in at least one guard variant, **and** no single
  stratum falls below 0.50.
- **Otherwise the residual stays what round 2 called it**, a field-enriched prior and not a pure
  field extraction, and R-3 is not adopted on this evidence.
- Round 2's comparable rate was 7 "yes" of 15 (0.47) at the 0.3 union, so 0.75 is a real raise and
  is meant to be.
- **Separately, and not gated by the above:** whichever guard variant wins more "pure field"
  answers is evidence for A6's person exemption, which is the only question in this round that the
  current calibration sample structurally cannot answer.

## 9. Not done here

No edit to `config.py`, `data/decisions/decisions.json`, `PHASE_0_LOOSE_ENDS.md` or any shared
doc — §5 and §8 are proposals and the vocabulary and adoption calls are the reviewer's. No stored
run JSONL was modified. No review round was pushed. Nothing was installed; no package file
touched. `sam-eval-142-v2` was read and not rewritten.

## 10. Follow-ups this run opens

1. **Add a free-form subject noun to the VLM question set.** This is the blocker. §D.1 already
   anticipates it ("names the noun so SAM can be asked to mask it") and probe 5 specifies it
   exactly: the caption noun **and** the class word, with parts (`eye`, `hand`, `face`, `wing`)
   explicitly out of vocabulary. Until it exists, `object` covers — 24 of 142 here — cannot be
   masked at all.
2. **Retire `"object"` as a dynamic phrasing** if the fallback stays class-only: it is measured
   dead at 0/24 and every call is wasted GPU.
3. **Open the eight `building` covers** to separate "VLM wrong" from "SAM silent" (§5.2).
4. **The 15 recoverable text-gap covers** are an argument about `text_like`'s raised cut that is
   independent of A12 and cheaper to settle.
5. **A12 needs CJK covers pulled deliberately**; this eval set contains too few to count, and the
   11-cover figure here is an upper bound of a mixed bag.

---

# v4 — the same experiment with REAL NOUNS (2026-08-04)

Appended, not edited. **Everything above is the v3 record and none of it has been changed**, including
the numbers §5 reports and the round spec §8 proposes. This section supersedes §8's spec with a v4
spec in §11; §8 stays on disk because its sheets, sample and bar are what the v3 evidence supported.

Reviewer authorisation: *"you can go ahead with the two short GPU runs for VLM open ended nouns, and
dynamic SAM with real nouns."* Both ran. No decision record was written, no config threshold moved,
and no review round was pushed — §11 is a proposal.

**Verdict, stated first: the vocabulary failure §6 named is fixed, and the residual is now
substantially cleaner — but R-3 still cannot be decided here, because nobody has yet looked at a
residual.** §3's blocker is gone: the species noun exists, and it fires where the class word was
measured dead. What remains between this evidence and R-3 is a review round, not another run.

## 11.1 What ran

Two runs, sequentially, on a GPU slot held for both.

| | run 1 — the noun | run 2 — SAM with the noun |
|---|---|---|
| instrument | `oracle/premise/prompts/subject-noun.v1.variant-g.json` (new prompt set) | `run_sam_dynamic.py` unchanged, new table |
| stem | `data/oracle-premise/subject-noun-1.jsonl` | `data/sam/sam-eval-142-v4-nouns.jsonl` |
| covers | the 142 included premise eval-set images | the same 142 |
| result | **142/142 ok, 0 failed, 0 parse failures, 0 retries** | **142/142 ok, 0 failed** |
| GPU | **318.4 s (5.3 min), 2.24 s/inference** | **541.0 s (9.0 min), 3.81 s/image** |
| canary | 8 rows, **one distinct fingerprint** — no drift | 2 rows, **both matching** |
| rows | 142 work + 8 canary | 5,115 region + 142 image + 2 canary |

**The cost model in §1 and PROBE5 was wrong about run 1, in the cheap direction.** Both documents say
per-image cost is dominated by image encode and prefill (~10.5 s at `premise-run-1`), so a
one-question schema was budgeted at ~25 min. It came in at **5.3 min**. The measured decode is 9-12
tokens against `group-bcde.v1`'s ~200, and the difference shows up as a **4.7x** drop in per-inference
cost — so decode length, not prefill, dominated the pilot. Worth carrying forward: a short-answer
question over this eval set costs about five minutes, not twenty-five.

## 11.2 The instrument: an open vocabulary, not a wider enum

`subject-noun.v1` asks one question — *name the main thing pictured* — and takes a **free-text**
answer. The JSON grammar is still applied and constrains only the envelope (one object, one key, a
string); it never constrains the noun. Widening the enum could not have worked: §5.2's finding is not
that `object` is the wrong category word but that a *category word* is not a thing-word.

Three rules in the prompt, each one a measured failure it exists to prevent:

1. **whole, not part** — PROBE5's only finding against the design (`eye` at 0.42 on a cover that *is*
   an eye, 0.87-0.92 on eyes that are 0.1% of a frame).
2. **as specific as a caption** — the species half is the load-bearing half (25 of 27 above the cut,
   median 0.858; `castle` 0.87 beats `building` 0.78 on the same cover).
3. **plural → name the kind of the largest** — carried over **byte-identical** from
   `group-bcde.v1`'s shared THE MAIN SUBJECT block, so the noun and the class word are gathered under
   the same referent rule and can be joined per cover without a referent mismatch.

Plus a literal `none` escape, because free text has no `not_applicable` and a model asked to name a
thing on a cover with no thing will invent one — which here means a fabricated SAM prompt.

**The instrument's own limit, stated where it cannot be read past: this prompt set ships ONE variant.**
Every other set here ships a pair (A/B, C/D, E/F) because design rule 7 takes uncertainty from
disagreement between phrasings. A second variant is a second full pass, and the run's budget bought
one. So **a G noun is a single reading and an E==F class word is a corroborated one**, and the
derivation table records the two provenances separately so no analysis can pool them by accident.

**63 distinct raw nouns over 142 covers, 50 of them appearing exactly once.** The head is
`person` 19, `man` 18, `woman` 17, `none` 14, then `car` 4, `people` 4, `statue` 3, `hand` 3.

## 11.3 The derivation: `sam-dynamic-concepts.v2`

`oracle/sam/dynamic_concepts_v2.py`, CPU, deterministic. Table:
`data/sam/dynamic-concepts-eval-142-v2.json`. **v1 was not edited** — it is the record of what the v3
run was given, and editing it would make that run unreproducible.

**The class half is unchanged, verbatim, including the entry v3 measured dead.** Retiring `"object"`
would have been the obvious economy and is deliberately not taken, because keeping it makes v4's
prompt list a **strict superset** of v3's: any cover that masks under v4 and did not under v3 is
attributable to the noun alone, with no second change to argue about. Retiring it is still follow-up
§10.2 and belongs to the next round.

Species-noun disposition, all 142 covers:

| disposition | covers | what it means |
|---|---|---|
| `used` | **102** | a noun prompt was added |
| `already_static` | 21 | the noun *is* a static prompt string (19 of them `person`) |
| `none_answered` | 14 | the model took the escape |
| `part_noun_barred` | 4 | `face` x1, `hand` x3 |
| `duplicate_of_class_word` | 1 | the noun equalled the class word; asking twice is free of information |

**56 distinct noun prompts over 102 covers.** Normalization fired **5 times, all of them
`plural_s_stripped`** (e.g. `skulls`→`skull`, `tapes`→`tape`); every step is recorded per cover with
its before and after value, so the raw answer is reconstructable from the table without reopening the
oracle run.

**The part-noun bar is exactly PROBE5's four words** — `eye`, `hand`, `face`, `wing` — **and not one
more**, because that round names those four and then says in as many words that "the real list is the
reviewer's call". Three further covers landed on nouns that read like parts (`leaf`, `lip`,
`thatched roof`); they are **flagged and kept**, not barred, and listed in the table so the reviewer
sees the real candidate list rather than one this module guessed.

**The noun is NOT gated on `subject_kind`, and that is deliberate.** Gating it would reintroduce the
closed enum this run exists to escape, and would silence the noun on exactly the covers v1 could not
prompt at all — the 10 where E and F disagree, and the 2 `abstract_shape` covers. The prompt's own
`none` escape is the gate, answered by the model that is looking at the cover. The cost: a noun can be
emitted on a cover the pilot calls `not_applicable` (2 covers) or `abstract_shape` (2 covers). The
pilot's answer sits beside it on every row so the split is one field lookup away.

**Result: 108 of 142 covers (76%) get at least one dynamic concept, against 47 (33%) under v3.
154 extra prompts, against 52.**

## 11.4 Validity: adding 102 more prompts still does not perturb the static answers

Same check as §4, same method, against the same stored `sam-eval-142-v2`:

- **137 of 140 comparable covers byte-identical.**
- **3 differ only by `barcode` regions**, which `sam-eval-142-v2` was never asked for (it ran under
  concept set v2, this run under v2.1). `config.py` predicts exactly this.
- **0 genuinely perturbed.**

The v3 check reported the same three numbers. Tripling the dynamic prompt count changed nothing about
the static answers, which is what `predict_multi`'s per-prompt NMS predicts and what makes the
static arm a legitimate control.

## 11.5 The headline: a real noun fires where a category word does not

Asked vs fired above the cut, guard off. `dyn-noun` is new; every other row reproduces v3 exactly.

| concept | asked | fired | rate |
|---|---|---|---|
| `dyn-animal` | 5 | 5 | **1.00** |
| **`dyn-noun`** | **102** | **86** | **0.84** |
| `dyn-vehicle` | 7 | 5 | 0.71 |
| `dyn-watermark` | 8 | 5 | 0.62 |
| `dyn-building` | 8 | 1 | 0.12 |
| `dyn-object` | 24 | 0 | **0.00** |

**0.84 against 0.00, on the same instrument, the same covers and the same cut.** §5.2's conclusion —
"the species half is the load-bearing half" — was inferred from the class word's failure; it is now
measured directly from the species word's success.

The 16 silent nouns are worth naming, because PROBE5's "silence is not proof of a wrong noun" applies
to every one of them: `band`, `bus`, `car`, `dog`, `flower`, `graffiti`, `leaf`, `lip`, `map`,
`microphone`, `mouse`, `number`, `record`, `statue`, `temple`, `wolf`. Several are nouns probe 5
measured at 1.00/1.00 in isolation (`dog`, `wolf`, `flower`, `car`), so silence here is more likely a
property of these covers than of those words — and this run cannot separate the two.

## 11.6 The object covers: 19 of 24, up from 10

This is the number §5.2 and §6 were about, and it needs its denominator stated precisely, because two
different quantities are easy to conflate.

- **`dyn-object` still fires on 0 of 24.** That has not changed and was not expected to; the class word
  is the same word.
- **Covers carrying *any* subject mask: 10 under v3 → 19 under v4.** The 10 were covers where a static
  `person`/`face` mask happened to land; the 9 newly masked are the noun's doing.
- **The species noun itself fired on 17 of the 24.**
- **`subject_unmasked` for `object` falls from 14 to 5** — the direct repair of §5.4's largest single
  contamination cell.

The five that still carry no subject mask: three were **barred as part nouns** (`lip`, `leaf`, and one
`hand`) and two are genuine silences (`microphone`, and one cover whose noun was `already_static`).
Individual recoveries are large where they land — `cassette tape` takes a cover's residual from 0.982
to 0.342, `acoustic guitar` from 0.857 to 0.526, `smartphone` from 0.676 to 0.473.

**And the glossy red apple §5.2 opened as its clearest case** —
`00/ab67616d00001e020000e692a330542f8ed14132.jpg`, where `"object"` returned zero regions — was
answered `heart`, not `apple`, and fired. The subject is masked; the noun the model chose is arguably
wrong and it cost nothing, which is exactly PROBE5's "right pixels, wrong word".

## 11.7 Residual purity across four cut variants

`residual_field_fraction`, recomputed from the per-region RLEs. **Lower is more subtracted; it is not
by itself the goal** — only the review round can say whether what remains is field.

| run | arm | cut | guard | mean | median | min |
|---|---|---|---|---|---|---|
| v3 | dynamic | precision | on | 0.8362 | 0.8758 | 0.4987 |
| v3 | dynamic | precision | off | 0.8128 | 0.8555 | 0.2193 |
| v3 | dynamic | subtraction | on | 0.8204 | 0.8646 | 0.3822 |
| v3 | dynamic | subtraction | off | 0.7971 | 0.8386 | 0.2193 |
| **v4** | **dynamic** | **precision** | **on** | **0.8211** | 0.8541 | 0.4731 |
| **v4** | **dynamic** | **precision** | **off** | **0.7714** | 0.8197 | 0.0853 |
| **v4** | **dynamic** | **subtraction** | **on** | **0.8054** | 0.8406 | 0.3822 |
| **v4** | **dynamic** | **subtraction** | **off** | **0.7558** | 0.8050 | 0.0853 |

The static arm is **identical between v3 and v4** at every cut (0.8445 / 0.8210 / 0.8286 / 0.8052),
which is §11.4's check visible a second way.

What the species noun newly captured, `residual_static - residual_dynamic` on v4: mean **+0.0496**,
median +0.0000, max **+0.8943**, **38 of 142 covers moved by more than 0.001** (precision, guard off).
v3's comparable figure was +0.0083 over 14 covers. Cover-for-cover, **v3 → v4 subtracts a further mean
+0.0414 on 33 covers**.

### The two cuts, and why they are named after their consumers

- **PRECISION CUT** — `config`'s shipped default, unchanged: pooled 0.578 with `text_like` raised to
  0.697295. Calibrated by the mask-quality round for a consumer that wants each kept mask to be
  *right*. Every stored artifact uses it. **Nothing here proposes changing it.**
- **SUBTRACTION CUT** — the pooled 0.578 applied to every group, `text_like` included. Residual
  isolation subtracts masks and keeps what is left, so a missed text mask does not cost a wrong
  region — it costs a contaminated background, silently. That asymmetry makes **recall** the quantity
  of interest. **This is a different consumer's cut, not a better calibration**, and `config.py` is
  untouched.

## 11.8 Contamination recount, by cause

Guard off. Proxy, not a pixel judgment — §7.3 still binds.

| run / cut | covers with ≥1 cause | clean by proxy |
|---|---|---|
| v3 / precision | 52 | 90 (63.4%) |
| v3 / subtraction | 43 | 99 (69.7%) |
| **v4 / precision** | **35** | **107 (75.4%)** |
| **v4 / subtraction** | **25** | **117 (82.4%)** |

| cause | v3 precision | v4 precision | v4 subtraction |
|---|---|---|---|
| `text_below_cut` | 26 | 26 | **15** |
| `subject_unmasked` | 23 | **9** | **9** |
| `text_below_pooled_cut_too` (A12) | 11 | 11 | 11 |
| `no_subject_prompt_at_all` | 10 | **2** | **2** |

`subject_unmasked` by kind, v4: `object` 5 (was 14), `building_or_structure` 3 (was 7), `person` 1,
`vehicle` 0 (was 1).

`no_subject_prompt_at_all` replaces v3's `subject_kind_variants_disagree` (10) and
`abstract_shape_no_noun` (2): under v2 almost all of those covers carry a species noun, so "the class
enum was unusable" is no longer the honest cause and "nothing was ever asked" is. It is re-derived
rather than carried over, which is why the v3 column here reads 10 where §5.4 reads 10 + 2 as two
separate rows and 53 rather than 52 covers overall.

### One correction to §5.4, and it is a downgrade

§5.4 says **15** of the 26 text-contaminated residuals are "recoverable at the pooled cut". Measured
by actually applying that cut: **11 are recovered, not 15.** The 15 figure counts covers with *some*
`text_like` region scoring above 0.578; four of those regions are smaller than the 0.2% area floor the
proxy uses for "text is masked", so lowering the threshold surfaces them without meaningfully
subtracting any text. **The subtraction cut removes 11 of the 26 text gaps. The 11 A12 covers are
untouched by it, exactly as §5.4 predicted.**

## 11.9 The area guard

Unchanged in character from §5.3, and now exercised against dynamic concepts for the first time. The
guard costs **0.0497** of mean residual on v4 at the precision cut (0.7714 guard-off → 0.8211
guard-on), against **0.0234** on v3 — the difference is the noun masks, which are large by design.
Both variants remain reported and neither is treated as the answer; A6's `person` exemption is still
the reviewer's, and ruling R-2 already directs that it cover "any future dynamic subject noun", which
`dyn-noun` now is.

## 11.10 Honest limits

1. **Nobody has looked at these residuals.** Every purity number above is a proxy. This is the same
   limit §7.3 recorded and it is now the *only* thing between this evidence and R-3.
2. **One prompt variant, so the noun has no agreement signal** (§11.2). A second variant is the
   cheapest available upgrade and was not bought.
3. **The part-noun bar is four words** and three more candidates were flagged rather than barred. If
   `lip`, `leaf` and `roof` belong on the list, three more object covers are recoverable.
4. **`dyn-noun`'s 0.84 is one number over 56 different prompts**, most appearing once. It is not
   decomposable into per-noun rates at this n and none is claimed.
5. **The noun is ungated**, so 4 covers the pilot calls `not_applicable` or `abstract_shape` carry a
   noun prompt. None produced a visibly manufactured mask in the sheets built, but 4 covers is not a
   measurement.
6. **`building` is still unresolved** between "VLM wrong" and "SAM silent" (§5.2), and `dyn-building`
   is still 1/8. The noun did not rescue it: `temple` was among the 16 silences.
7. **The A12 count is unchanged at 11** and still an upper bound of a mixed bag (§5.4). Nothing in
   this run addressed it.
8. **The eval set is 142 covers**, the premise eval set and not a corpus sample.

## 11.11 PROPOSED round: residual purity v4 — pre-registered, NOT pushed

**This supersedes §8.** §8's sheets and sample are left on disk untouched; §8's bar was set against
v3's evidence and this round replaces it.

Sheets are built and ready at `data/sam/residual-sheets-v4/` (25 covers), manifest at
`data/sam/residual-sheets-v4-sample.json`, builder `oracle/sam/build_residual_sheets_v4.py`, seed
**20260804** (deliberately not §8's 20260803: a shared seed would make an overlapping sample look
like a paired design when it was an accident of the RNG). Three panels — **artwork | what remains,
area guard ON | what remains, area guard OFF** — removed pixels filled with round 2's grey
checkerboard. Labels are information-free.

**One instrument change from §8, and it is deliberate: the panels render at the SUBTRACTION cut**, not
the precision cut. The round asks whether what remains is background, and 11 of the 26 text gaps sit
between the two thresholds — rendering at the precision cut would ask the reviewer to judge a
threshold choice while believing they were judging an instrument. The cut is named in the manifest
and this is not a proposal to change `config.py`.

**The question, one per panel:** *"Is everything still visible here background — is there nothing left
that belongs to a depicted subject, to display text, or to an applied mark?"*
Answers: **pure field / mostly field / not field.**

**Strata and quotas** (pool size in brackets): `noun-fired` 8 [77], `noun-silent` 5 [10],
`contaminated` 6 [25], `class-only` 2 [2], `static-only-clean` 4 [28].

**The bar, fixed before any answer is seen.** The sample is enriched for hard cases, so the raw rate
is not a corpus estimate: the bar applies to the **stratum-reweighted** rate, using the bracketed pool
sizes as inverse-probability weights.

- **Adopt R-3's structural claim** — background structure becomes a pixel computation — only if the
  reweighted **"pure field" rate is ≥ 0.75** in at least one guard variant, **and** no single stratum
  falls below 0.50.
- **Otherwise the residual stays what round 2 called it**, a field-enriched prior, and R-3 is not
  adopted on this evidence.
- The bar is **held at §8's 0.75 rather than raised**, even though the proxy improved from 63% to 82%
  clean. The proxy is not the quantity being tested and moving a pre-registered bar because a
  *different* measurement improved is the exact failure pre-registration exists to prevent.
- **Separately, and not gated by the above:** whichever guard variant wins more "pure field" answers
  is evidence for A6's `person` exemption — and now also for whether that exemption should extend to
  `dyn-noun`, which ruling R-2 anticipates and this run is the first to make concrete.

## 11.12 Not done here

No edit to `config.py`, `data/decisions/decisions.json`, `PHASE_0_LOOSE_ENDS.md`, `ORACLE_QUESTION_SET.md`
or any shared doc. No stored run JSONL was modified; `dynamic_concepts.py`, `run_sam.py`,
`run_sam_dynamic.py`, `analyze_residual_isolation.py` and `build_residual_sheets.py` are unchanged.
No review round was pushed. Nothing was installed and no package file was touched. The v3 sheets,
sample and every number in §1-§10 are as they were.

## 11.13 Follow-ups this round opens

1. **A second noun variant (H)** over the same covers, for the agreement signal §11.2 does not have.
   ~5 minutes of GPU by this run's measured rate.
2. **Retire `"object"` as a class phrasing** — 0/24 twice now, and every call is wasted GPU. Held back
   here only to keep v4 a strict superset of v3.
3. **Settle the part-noun list** (`lip`, `leaf`, `roof`, and the four already barred). Three object
   covers turn on it.
4. **Open the 16 silent-noun covers.** Four of those nouns are ones probe 5 measured at 1.00/1.00, so
   the covers are the likelier explanation and nobody has looked.
5. **`building` is still 1/8** and the noun did not rescue it; §10.3's eight covers would still settle
   it.
6. **A12 still needs CJK covers pulled deliberately** (§10.5). Unchanged.

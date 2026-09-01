# Phase 0 toolbox — bias audit

**Question, verbatim from the reviewer:** *"Are the tools we are providing introducing bias in the
following phases (and if so, how can we reduce the bias)?"*

**Written 2026-08-04.** Adversarial stance by instruction: the working assumption throughout is that
the toolbox *will* bend Phase 1's search, and the job is to find the mechanisms, not to reassure.
Every count below carries the timestamp it was measured at, or the command that regenerates it.

**Scope note.** This is not a correspondence audit. The nine arms of
`reviews/phase-0-adversarial/` asked "does the document describe what is on disk"
(`docs-drift.md`: *"This arm asked only 'does the document describe what is on disk', never 'is what
is on disk right'"*). Grepped across all nine reports: **zero** occurrences of `bias`, `priming`,
`design space`, `hill-climb`, `lock-in`, or `figure/ground`; `anchor` appears twice, both meaning a
file-identity anchor. So this territory is unoccupied *in the review directory* — but large parts of
it are already occupied in `PHASE_0_LOOSE_ENDS.md` and in the source docs, which is the harder
problem. Where a finding is already on the record, it is attributed and used as evidence rather than
re-reported as discovery.

---

## How to read the ranking

Three different things get called "bias", and conflating them wastes the mitigation budget:

- **Generation bias** — what Phase 1 subagents propose at all.
- **Selection bias** — which proposal survives Phase 2.
- **Validity bias** — everything measured wrong in the same direction. This distorts the campaign's
  claims but not the *choice* between paradigms, and is therefore lower stakes for this question.

Ranked by expected distortion on the paradigm choice. **B1–B4 are the ones worth spending on.**

One structural remark that applies to almost every mitigation below: **the cheap ones stop being
credible the moment Phase 1 proposals exist.** Changing a gate, a metric definition, or a brief
*before* anyone has proposed anything is housekeeping. Doing it afterwards looks like moving the
goalposts for or against a specific proposal, and the campaign will not be able to tell the
difference from its own records. Timing is most of the cost.

---

## B1 — The source-support invariant counts exact 8-bit triples, and would refuse 96.9% of the reviewer's own endorsed palettes

**Status: MEASURED (this audit). Hard gate. Highest expected distortion.**

### Mechanism

Invariant 2 (`src/contract/invariants.ts:1051-1064`, `validateSourceSupport`) requires every
published colour to be an exact pixel of the input meeting a population floor:

> `"Exact pixel" is literal: the same three 8-bit channel values, not the nearest quantised bin. This
> is the invariant that makes the whole contract falsifiable against the artwork — a palette colour
> that is not in the image is an invention, whatever it looks like.`

`SOURCE_POPULATION_FLOOR = 0.001` (`src/contract/constants.ts:393`), justified against the JPEG
noise floor: *"a thousandth of the artwork is roughly 400 pixels on a 640×640 master … two orders of
magnitude above the noise floor at either scale, so JPEG ringing in the shadows cannot certify a
colour."*

**The rationale runs backwards.** JPEG ringing does not *inflate* a colour's exact-triple count; it
*shatters* it. A perceptually uniform field occupying 40% of a cover is spread by the codec across
hundreds of near-identical triples, none of which individually occupies 40%. Counting exact triples
therefore measures *how much of a histogram spike a colour sits on*, not *how much of the artwork it
accounts for*. The only colours that reliably clear an exact-triple area floor are histogram modes.

Consequence for Phase 1: every paradigm, whatever its internal reasoning, must publish modal
colours or be refused publication by a hard gate. That is v2-3's quantisation ontology promoted to
an invariant. It hits the "global objective / reconstruction framing" candidate hardest — a
compression/MDL framing naturally produces *representative* colours, and its only route through the
gate is to snap to the nearest modal triple after optimising. That is the naive pixel-snapping the
design constraints rule out, and `PHASE_0_DECISIONS.md` §4's own meta-rule says why it is not a free
fix: *"v2-3's first repair relocated the defect in 13/15 cases"*. So a synthesis paradigm is forced
through a step known to relocate defects and then judged on the result.

### Evidence

Measured 2026-08-04 against `data/legacy/endorsements.json` (351 reviewer-endorsed v2-3 palettes,
1,397 role colours, every artwork decoded at its own native rendition — 189×640 px, 125×300 px,
rest larger):

| set | palettes | ≥1 role colour failing the floor |
|---|---|---|
| `endorsements.json` (351) | 351 | **340 — 96.9%** |
| `acceptable.json` (166) | 166 | 164 — 98.8% |
| `known-bad.json` (37) | 37 | 35 — 94.6% |

- Colours **absent** from the source: **1 of 1,397**. So exact-pixel provenance is not the problem —
  v2-3 already published source pixels. The **area floor** is.
- 1,052 of 1,397 endorsed role colours (75.3%) sit below 0.001. Median endorsed role colour area:
  **8.89e-5** — the floor is **11× above the median colour the reviewer endorsed**.
- Pass rate by floor: 0.001 → 24.6%, 0.0001 → 49.1%, 0.00001 → 84.6%, 0.000001 → 99.5%.
- **The floor does not discriminate quality.** Endorsed 96.9%, acceptable 98.8%, known-bad 94.6% —
  it is uniformly hostile to the whole human-endorsed colour distribution, and slightly *harsher* on
  the endorsements than on the known-bad set.
- Per role: accent 311/350 below floor, foreground 291/349, surface 254/349, background 196/349.
  The gate bites hardest exactly on accent — v2-3's most-complained role, and the one
  `V3_PLAN.md` §1 criterion 3 names: *"v2-3's candidacy walls made the reviewer's corrected accents
  structurally unpublishable"*. The wall has been rebuilt one layer down, in the invariant.

The campaign's own rule already settles this. `PHASE_0_DECISIONS.md` §4: *"an invariant that ever
blocks an endorsed palette is demoted — the reviewer outranks the rule."* Applied to the only
endorsements that exist, it demotes I2's population floor today.

**Honest scoping.** These are v2-3-contract palettes and the floor was never applied to them; the
grades are censored and relative (`data/legacy/README.md`). None of that changes the mechanism — the
codec-shattering argument is about the *measure*, not about which palettes are good.

### Mitigation

**Measure population within the same-colour bar instead of within the exact triple.** Sum the
pixels whose OKLab distance to the published colour is under `sameColorBar` — the campaign's own
frozen, `[REVIEWED]` ruler, already implemented, already used for exactly this kind of merge in
`src/review-server/composer.ts`. No new constant, no new calibration.

Measured effect on the same 351 endorsements (2026-08-04):

| population rule | palettes refused | median measured area | colour pass rate |
|---|---|---|---|
| exact triple (today) | **340 / 351 — 96.9%** | 8.89e-5 | 24.6% |
| same-colour-bar neighbourhood | **62 / 351 — 17.7%** | 1.91e-2 | **94.8%** |

The 215× shift in median measured area is the codec-shattering effect, quantified.

**Cost:** one function in `validateSourceSupport`, plus a per-image OKLab pass over the distinct
colour list (351 images ran in seconds on this machine). The residual 17.7% is not waste — it is the
first honest review batch for this invariant: put those 62 in front of the reviewer and let the
floor be calibrated against endorsements instead of against a noise argument.

**Related, and do not fix by accident:** invariant 2's spatial-spread half is permanently `deferred`
(ledger A4 — *"the job is to create the seam, not to fill it"*). Changing the population measure does
not touch it, and should not be used to claim it.

---

## B2 — Evaluability is region-shaped: the toolbox scores the intermediate state of exactly one of four candidate paradigms

**Status: DOCUMENTED. Generation and selection bias.**

### Mechanism

`V3_PLAN.md` §4 lists four candidate paradigms. Exactly one of them names an instrument:

> "**Scene-parse first.** … **The oracle (and SAM masks specifically) is what makes this paradigm
> evaluable at all.**"

The other three — global objective / reconstruction, portfolio + selector, v2-3 rebuilt clean —
name no instrument. §5 then makes the asymmetry explicit as a benefit: *"**Makes scene-parse-first
evaluable** — intermediate representations scored directly, not just final palettes."* And §5's
emphasis correction asserts the shape of the answer before anyone has proposed one:
*"`artwork_regions` is a co-equal deliverable with `artwork_labels`."*

This is not merely availability bias (the orchestrator's item 1 — "region paradigms are cheap
because the ML stack is there"). It is stronger and more specific: **partial credit is available to
one paradigm and not the others.** Phase 2's instruction is *"judge trajectory and ceiling, not
first-round scores"* — but trajectory is only observable where intermediate state is measurable. A
global-objective proposal has no intermediate representation the toolbox can score; it can only be
judged on final palettes, which is precisely the comparison `V3_PLAN.md` §7 concedes immature
prototypes lose.

Supporting shape evidence:

- The schema is instance-shaped. `artwork_regions (image_id, run_id, concept, instance_idx, bbox_*,
  area_fraction, score, mask_rle)` — regions are instances of named concepts. There is no table for
  a field, a gradient, a colour path, or a residual; `bg_structure_t` is one enum column.
- The coverage set's 20 enrichment covers are SAM-derived (`enrichmentSource` names
  `oracle/sam/review_round_2.py`), and every slice is a region concept: `parental-advisory` 6,
  `cjk-text` 4, `nonlatin-text` 3, `vehicle` 5, `barcode` 2, `confirmed-negative` 1. **No enrichment
  slice exists for a gradient, a field, or a contested figure/ground.**
- Resolution floors were measured for the five group-A ground questions and for nothing else —
  `SCHEMA_V2_PROPOSAL.md:166`: *"No resolution floor has ever been measured for any question in this
  schema"*. A ground/region-shaped proposal therefore arrives with a validated resolution story and
  every other proposal arrives without one.
- Human attention went the same way. Warehouse at 2026-08-04: **1,000 `oracle-label` records against
  8 `verdict` records**, and per `reviews/phase-0-adversarial/warehouse-decisions.md` F6 all 8
  verdicts are demo fixtures. Re-derive with `warehouse status`.

### Counter-evidence, which is real and should not be buried

- **The coverage-set core is label-free by design** — *"200 artworks and zero ground truth about
  them"* (`data/coverage-set/COVERAGE_SET.md`). Its metrics (stability, coverage, cost,
  self-consistency, failure shape) are genuinely paradigm-neutral, and it is the strongest anti-bias
  property in the toolbox.
- The embedding arm bake-off used **filename-derived rendition identity** as ground truth — no
  labels, no oracle, no v2-3 output enters arm selection. Clean design.
- Reviewer ruling R-3 holds masks to *"a location prior, never colour evidence"*.
- The one pixel route from masks to a background was measured and **NOT-ADOPTed on its own
  pre-registered bar**: `oracle/sam/RESIDUAL_PURITY_VERDICT.md` — 0.2424 against a required 0.75,
  every stratum below the 0.50 floor. The team measured its own favourite hypothesis and killed it.

So the toolbox is region-*shaped*, not region-*captured*. The bias is in what can be given partial
credit, not in what is permitted.

### Mitigation

Before Phase 1 opens, write **one page per candidate paradigm** naming (a) its intermediate
observable, (b) the cheapest instrument that would score it, (c) that instrument's cost. Then either
budget one equal-cost instrument per surviving paradigm before the bake-off, or — the cheap floor —
put in the Phase 1 brief and the Phase 2 scoring rules that **"no instrument exists for this" is
instrument debt to be priced, never evidence against a paradigm**, and require the orchestrator to
record instrument debt per proposal alongside its score.

**Cost:** the four pages are half a day. The equal-budget version is 1–2 days per surviving
paradigm and is the honest version. The floor is nearly free and is worth doing even if the budget
version happens.

---

## B3 — The Phase 1 anti-anchoring firewall names only the field guide

**Status: DOCUMENTED. Generation bias. The load-bearing unwritten decision.**

### Mechanism

`V3_PLAN.md` §6:

> "**Phase 1 — divergence (anti-anchoring by construction).** Several subagents each produce an
> architecture proposal **from the problem spec and raw verdict data only — not the field guide** —
> so v2-3's ontology cannot anchor them."

The firewall excludes one artifact. Nothing anywhere says whether `PHASE_0_DECISIONS.md`,
`ORACLE_QUESTION_SET.md`, `REVIEW_UI.md`, the 103-tag vocabulary, the SAM concept set, or the mock
are in or out of a Phase 1 brief. And the gate paragraph two sections earlier assumes they are in:
*"every Phase 1 proposal will be evaluated **through** these instruments."*

What a subagent absorbs by reading them: the semantic primitives **field, figure, text, provenance,
identity** (`ORACLE_QUESTION_SET.md`'s own anti-anchoring caveat concedes *"groups A and D in
particular encode hypotheses about what matters"*); the four-role contract as the target;
P6's three-bucket contradiction/agreement/can't-tell shape as the form a cross-check takes; and a
census that reports the corpus in categorical ground types. That is a complete ontology, and it is
the same ontology whose vocabulary failed under free-text elicitation (see B5).

The pipeline doc's own blocking question, still open per the ledger: *"What decisions does the
palette algorithm actually need these answers for?"* — *"Until a paradigm exists, the question set is
a placeholder shaped by hypotheses about what will matter. Phase 1 is what answers it."* The
question set was built to serve a paradigm that does not exist yet; letting it brief the paradigm's
authors closes that loop the wrong way round.

There is a human-side twin. Phase 0 spent essentially all reviewer attention on the ontology, not on
palettes: 1,000 `oracle-label` records against 0 real palette verdicts (2026-08-04). The reviewer's
own words during the ground round — *"i can see the field, I just don't know how to tag it"* — are
the sound of a person who has been taught to reach for tags.

### Mitigation

**Write the Phase 1 reading list down, as a decision record, before the briefs go out.** Proposed
split: *in* — the problem spec, the output contract, the raw verdict data, the corpus, the
robustness numbers from §1; *out* — `ORACLE_QUESTION_SET.md`, the oracle label schema, the SAM
concept set, the tag vocabulary, the mock. Then **run one arm deliberately toolbox-blind** (problem
spec + raw data only) and compare the ontology its proposal reaches for against the others'. If the
blind arm's vocabulary matches the toolbox arms', the worry is closed with evidence; if it does not,
the divergence is exactly the thing Phase 1 exists to produce.

**Cost:** a paragraph plus one extra subagent arm. This is the highest ratio of distortion-avoided
to effort in the audit.

---

## B4 — Every instrumented success criterion is a level; the one countermeasure against incumbent bias has no instrument

**Status: MEASURED (grep). Selection bias.**

### Mechanism

`V3_PLAN.md` §Phase 2 states the countermeasure against the rewrite collapsing back into v2-3:

> "**Judge trajectory and ceiling, not first-round scores** — immature prototypes lose head-to-head
> against distilled lessons at first contact … **Otherwise the incumbent wins by default and the
> rewrite converges back to v2-3.**"

`grep -ri trajectory` over the entire `research/v3/` tree (2026-08-04) returns **exactly one hit:
that sentence.** Meanwhile every built instrument in the toolbox measures a *level*: agreement rates,
stability ratios, tunable-site counts, warehouse concordance, per-question floors. There is no slope
anywhere.

**This is also the answer to "does the pre-registration culture bias toward measurable-over-
important?"** — and the answer is more specific than the question. Pre-registration itself is working
and is one of Phase 0's genuine strengths: bars were set in advance and the campaign repeatedly
failed its own (residual purity 0.2424 vs 0.75; the C/D arm reported as adverse). The bias is not
that pre-registration favours easy questions. It is that **only quantities with an instrument can be
pre-registered at all**, so the criteria that acquired bars are the ones Phase 0 could already
measure, and "trajectory" — the one criterion explicitly protecting the rewrite from its incumbent —
acquired none. Two prior findings show the same asymmetry operating inside single analyses:
`reviews/phase-0-adversarial/premise-analyses.md` finding 6 — *"Two hypotheses examined on one
43-item sample got opposite standards of evidence, and the surviving one got the lenient standard"* —
and finding 3, where a pre-registered "42 of 45" resolved on re-derivation to 34 pass / 2 FAIL of 36,
adversely. Pre-registration is only as unbiased as the set of things that can be registered.

Two mechanisms actively push the other way:

- **The movement rule is a monotone ratchet.** `REVIEW_UI.md` §2: *"never move to a lower-graded
  palette; a move between two strongs is a sidegrade — allowed, but it costs a preference and needs
  a reason."* A paradigm jump moves many artworks to lower-graded palettes at first contact, by the
  plan's own admission.
- **Known-worse is a hard binary gate** blocking integration (`PHASE_0_DECISIONS.md` §3). A young
  paradigm trips it constantly, and B6 below shows the matching rule is asymmetric in a way that
  makes this worse for some paradigms than others.

The prior review reached the edge of this without naming it: `unrealized-ideas.md` §19 notes a
missing Phase-2 *scheduler* for three paradigms; `warehouse-decisions.md` documents that the
warehouse's only comparative primitive is a per-item pairwise grade plus preference. Nothing
aggregates over time or over paradigm.

**On the orchestrator's item 5** ("pairwise A/B biases toward incremental hill-climbing"): partly
refuted. The dual-grade design genuinely fixes the worst of it — both sides carry an absolute grade,
so "both are bad" is expressible, and the `meta/both-sides-bad` tag exists for it. The residual
problem is not the pairwise unit. It is that **nothing in the toolbox integrates over rounds**, so
"is this paradigm improving faster" has no representation at all.

### Mitigation

1. **Record now, as a decision, that the known-worse gate and the movement rule are report-only for
   bake-off prototypes.** Free to write, and it must be written before proposals exist or it reads
   as goalpost-moving. (It also composes with B1: a prototype tripping a gate that would refuse 97%
   of the reviewer's own endorsements is telling you about the gate.)
2. **Make each proposal pre-register its own ceiling**: the failure classes it expects, the ones it
   claims are fixable inside the paradigm, and the observation that would falsify it. Then score
   Phase 2 on *fraction of observed failures the paradigm predicted and can repair internally* —
   which is a slope measured with level instruments, and the cheapest honest trajectory metric
   available.

**Cost:** (1) is one decision record. (2) is a page per proposal, written before any numbers exist,
and it is worth insisting on precisely because it is cheap only then.

---

## B5 — The enum cannot record its own inapplicability, and the escape hatches are dead

**Status: MEASURED. Extends the orchestrator's item 2; partly refutes item 4.**

### Mechanism

Oracle labels are sanctioned for census, flags, and strata (`PHASE_0_DECISIONS.md` §6) — all three
tolerate per-item noise. None tolerates *systematic* noise in one direction, which is what a closed
vocabulary with an unused escape hatch produces: a forced answer is recorded as a confident answer,
so the census reports categorical structure the covers do not have.

Nine of twenty fields have **no** escape value at all (`field_texture`, `enclosure`,
`physical_media_scan`, `subject_area_band`, `has_signature_color`, `medium`, `color_character`,
`grain_or_noise`, `two_color_faithful`). Where one exists it is not used:

| escape channel | usage | n |
|---|---|---|
| human `unsure` across six probes | **1** | 180 answers |
| `has_text = illegible_at_this_size` | **0** | 284 rows, incl. 0 of 86 thumbnail-tier |
| `confidence ≠ high` (group A) | 1 | 299 |
| `confidence ≠ high` (C/D, with an operational trigger) | 1.4% | pre-registered >10% |
| `subject_kind = not_applicable` | **0** | despite 5 occasions its gate said `none` |

The `probe-gold-1` analysis says it plainly: *"The reviewer reported the questions as ambiguous and
then almost never said so through the answer built for it."*

And the reviewer, on `cascade-ground-truth-1`, said exactly what the recorded label means:

> *"some images are genuinely hard to rank, and **none of the options fit, or maybe several**. So I
> answered 'none discernible' but **this is not true, i can see the field, I just don't know how to
> tag it**."*

`ground-freetext-1` (n=9, free text, no options offered) is the control: **9 of 9 covers describable
in prose**, and *"not one description reaches for a category word. They reach for left / right / top
/ behind / corners / middle / 30% / 15% / less bright than. The descriptions are **geometric and
photometric throughout**."*

**The distortion on Phase 1 is precise.** A proposer consulting the corpus census sees categorical
ground structure. The one round that removed the categories found the reviewer describes covers in
continuous geometric and photometric terms. A paradigm that reasons the way the reviewer actually
talks will be scored against a census that cannot represent it.

Scale of the leak, for reference: unmapped share under the frozen wordings **60/137 (44%) and 43/137
(31%)**; under the deconfounding wordings **0/137 and 0/137** — but those two agree with each other
on only 46% of artworks, *worse than A agrees with B*. Per `CD_RESULT.md`: *"The leak did not close;
it moved from 'no answer' to 'an answer that depends on the wording'."*

### Refutation of the orchestrator's item 4 ("model-error-correlated strata")

**Not supported in the strong form.** `data/coverage-set/COVERAGE_SET.md`: strata are 36 k-means
clusters over **DINOv2-vitl14** embeddings of 9,232 artworks, near-duplicate census unioned over
three independent encoders at cosine ≥ 0.95, resolution forced to match the corpus within 3 pp, nine
named checks passing, seed `0xc0efface`, byte-reproducible. **No oracle label and no v2-3 output
enters the stratification.** The core carries zero labels.

The weaker true version: strata are **encoder-metric-correlated**. `k=36` is *"inherited, not
calibrated … chosen because a reviewer browsed a gallery at that granularity and could read it. No
clustering-quality criterion was optimised."* A paradigm whose failure modes cut across DINOv2's
similarity metric will have its failures spread thin across strata and never surface as a named
cluster. That is real, and much smaller than "the strata are the model's own errors".

### Mitigation

1. **Add `vocabulary_fit: fits | forced | no_word` to every enum question before the bulk run.**
   This is not another `unsure`. `unsure` asks about the *answer*; `vocabulary_fit` asks about the
   *list* — and the list is the thing the reviewer actually objected to (*"none of the options fit"*).
   It is the same distinction `RESIDUAL_PURITY_VERDICT.md` proposed as a record: *"The escape share
   is itself a measurement — figure/ground ambiguity signal, not noise."*
2. **Publish every census table with its forced/unmapped share attached.** Never a bare rate. Design
   rule 8 already says this (*"Count the share of answers landing on unmapped values before reading
   any agreement number"*); make it a property of the output rather than a rule someone remembers.

**Cost:** (1) is one field plus a re-pilot round — real reviewer time, and the reason to spend it is
that the bulk run has not started, so this is the last moment it is cheap. (2) is free.

---

## B6 — The frozen scalar OKLab ruler is known to be the wrong shape, and it deletes colours from the reviewer's own authoring surface

**Status: DOCUMENTED + code. Validity bias with one paradigm-differential edge.**

### Mechanism

The same-colour bar is one scalar in Euclidean OKLab, region-dependent, `[REVIEWED]`, and **frozen**
with *"No round 3"*. Two things are already on the record about its shape:

- **It is the wrong shape, and the team knows it.** `PHASE_0_DECISIONS.md` §8: at a fixed distance,
  lightness-only pairs read "same" 4/4, chroma-only 2/4, hue-only 1/4 — *"a **missing dimension, not
  a width in the bar**, and no scalar bar can express it."* Held by a tripwire test, unencoded.
- **Stimulus size moves the threshold by a large factor, measured inside the same round.** Part 1
  (the same-colour bar) was judged on two half-viewport fields abutting at a 4 px divider
  (`styles.css:654-663`) — the easiest possible discrimination. Part 2 judged accents *"at the size a
  player UI would use them"* and landed at **0.0744**, against per-region bars of 0.00932–0.02293.
  Roughly 3–8×, from stimulus size alone. The foreground never got a size-appropriate round, and text
  strokes are thinner than icons.

Two concrete consequences, both in code:

**(i) The composer's swatch grid merges with this bar, greedily, in descending frequency.**
`src/review-server/composer.ts:191-217`: the most common unabsorbed colour opens a cluster and every
later colour within the bar joins it; *"it makes the grid's order the artwork's own order of
importance."* So (a) area is stipulated to be importance in the reviewer's palette-authoring tool,
and (b) given the measured anisotropy, hue-distinct colours are absorbed into higher-area
representatives and never appear on the grid at all. On a photograph the 24 shown swatches stand for
**35.9%** of the artwork's area (`SWATCH_CLUSTER_LIMIT`, `[MEASURED]`), so ~64% is eyedropper-only —
a deliberate extra action.

The instrument built to diagnose "the algorithm missed the signature colour" — v2-3's most frequent
complaint class, 27 notes, and pathology P5's acute case — has, in its default interaction path, the
same area bias that causes the defect. Endorsements skew toward high-area colours; "destination
adjudication (landing on an endorsement = win)" then rewards area-weighted paradigms.

**(ii) The known-worse gate matches role signatures "within the same-colour bar"**
(`PHASE_0_DECISIONS.md` §5). With a scalar bar over an anisotropic space, the bar is simultaneously
too generous in the hue direction and too strict in the lightness direction. So a candidate that
differs from a known-bad palette **only in hue** — a genuinely different and possibly good choice —
is more likely to be swept into a hard gate than one differing only in lightness. Paradigms that
move hue (portfolio-style extractors picking different source pixels) are penalised relative to
paradigms that move lightness, which is v2-3's own axis — the dark toe.

**Speculative label:** (ii) is a mechanism argument from measured anisotropy, not an observed gate
failure. It cannot be observed yet: the gate has never run against a v3 pipeline.

### Mitigation

1. **Make the known-worse gate report-only when the near-match is hue-dominant** — or simply require
   a reviewer look before it blocks. A decision record plus a query on the match, near-free.
2. **Offer the composer's grid in two orders — frequency and hue-spread** — so a small signature
   colour is one keypress away instead of an eyedropper away. Half a day, and it directly attacks
   the P5 diagnosis loop.
3. **If a round 3 is ever justified, spend it on anisotropy**, which `PHASE_0_DECISIONS.md` §8
   already names as the better question. One reviewer round; not required before Phase 1.

---

## B7 — One mock, tuned across four revisions to make the field win, and it has never rendered a palette anyone graded

**Status: DOCUMENTED + code + measured. Selection bias, currently untested.**

### Mechanism

There is exactly one judging renderer, by design (`review-ui/mock.js`): *"**The mock is part of the
output contract**, so a verdict is about the exact rendering the reviewer judged — which only holds
if there is exactly one renderer."* One layout, one size, one surface arrangement: `min-height:
420px`, artwork `width: 250px`, chrome strictly black and white.

Four successive revisions each raised palette salience against artwork salience — driven by the
reviewer's own live findings, quoted verbatim in the file header:

1. *"the artwork takes too much space, i can barely see the background/gradient i'm supposed to
   review"* → artwork demoted to a thumbnail (full width → 96 → 152 → **250 px**).
2. *"all the content is at the bottom, so in case of a gradient, almost nothing is on top of the
   background color"* → content spread so both ramp ends carry something.
3. *"the accent color is only used on top of a surface colored area"* → accent placed in four
   contexts.

Plus `styles.css:201`: *"Tall enough that a 2-stop ramp is visibly a ramp."*

Every revision is defensible on its own terms — the reviewer needs to *see* what they are grading.
The compound effect is a surface on which **the palette is the subject and the artwork is context**.
Paradigms whose claim is artwork fidelity or harmony — the reconstruction framing is literally *"the
palette is a compressed model of the artwork"* — are judged in the layout that shows the artwork
least. And gradient claims are judged on a 420 px ramp explicitly sized to make ramps read as ramps,
on the axis `V3_PLAN.md` §7 names as the hardest and where v2-3's instrument bias already misdirected
three arms.

`REVIEW_UI.md`'s prime directive is about exactly that failure — *"the UI could not record a gradient
objection; all 14 gradient notes asked for more gradient"* — and the fix applied was the symmetric
tag vocabulary. **That closes the language channel and leaves the salience channel open.**

Finding 3 above is the sharpest evidence that mock geometry decides what is judgeable: for revisions
1–2, an accent failing against the background or against a gradient stop was *structurally
unjudgeable*. The fix enumerates four relationships; anything outside that enumeration is still
unjudgeable, and nobody has enumerated what is outside.

**And the instrument is untested.** Warehouse 2026-08-04: 8 `verdict` records, all demo fixtures per
`warehouse-decisions.md` F6. Only two of eighteen released batches route through the mock, both
demos. So the contract-pinned primary judging surface has been tuned across four revisions **on
fixture data and has never rendered a palette anyone graded for real.** The prior review reached the
governance edge of this (`unrealized-ideas.md`: *"The layout has since moved through four revisions
on verbal instruction … none of the 15 decision records concerns the mock layout"*; live count today
is 53 records, still zero mentioning the mock).

Two smaller things found while reading: `mock.js`'s header still declares "Layout revision 3 … 152
px" while `styles.css:229-238` documents revision 4 at 250 px — the contract-pinned renderer's
docstring disagrees with the contract-pinned renderer. And every mock is viewed embedded in pure
black page chrome; the bracketing round explicitly guarded against surround effects (*"a bright
surround would shift the very perception being measured"*) and the judging surface did not get the
same guard. The black chrome is arguably realistic for a player, so this is **speculative** — but the
asymmetry in how seriously surround was taken across two instruments is on the record.

### Mitigation

**Run one ~40-item calibration round in a second layout** — artwork-dominant, and ideally a compact
row — with the layout id recorded on every verdict, and measure grade disagreement against the ~12%
single-verdict noise band. Inside the band: the worry is closed with a number and the single
renderer stays, which is the outcome the contract argument wants. Outside it: every verdict from
Phase 2 onward is layout-scoped and you know the size of the scope.

**Cost:** ~1 day of UI plus one reviewer round. **Timing is the whole point** — this must happen
before the bake-off, because after it the question becomes unanswerable without re-grading, and the
bake-off is the round where the answer matters. Fix the stale `mock.js` header in the same pass, and
give the layout a decision record so revision 5 is not another verbal instruction.

---

## B8 — The parameter-honesty census scores implementation style, and cannot see `data/`

**Status: MEASURED. Selection bias, easily gamed.**

### Mechanism

Success criterion 2 is parameter honesty, and `src/honesty/` is the instrument that scores it. It
counts **numeric literals** in the source tree, and its roots are `["oracle", "src"]` — `data/` is
not scanned.

So a paradigm holding its degrees of freedom in a loaded JSON, a fitted table, or a learned prior
registers approximately **zero** tunable sites, while a paradigm expressing the *same* degrees of
freedom as named constants registers N. The instrument rewards moving parameters out of source into
data. That is the opposite of what it exists to encourage, and nothing in the census detects it.

Second edge: the provenance tags are `[REVIEWED] [MEASURED] [n=1] [INHERITED] [UNCALIBRATED]
[HELD]`. **None expresses "fitted, with a held-out number."** An honestly fitted component can only
be tagged `[UNCALIBRATED]`, which scores as unanchored (`d-2026-08-03-honesty-census-definitions`).
`V3_PLAN.md` rejected *end-to-end learned palette models* on data grounds — a specific, argued
rejection. The census generalises that into a structural penalty on **any** fitted component,
including a small hybrid one, and does so through an instrument rather than an argument.

Third edge: the criterion is *"an order of magnitude fewer free constants"*, which the "global
objective / few global knobs" candidate satisfies by its own definition and the "portfolio of simple
extractors" candidate cannot. The scorer is paradigm-differential before any paradigm exists.

For calibration: Phase 0's own instruments measure **3,587 tunable sites at 10.2% anchored**
(`data/honesty/honesty-report.json`, generated 2026-08-03T21:41Z; re-derive with
`node --experimental-strip-types src/honesty/cli.ts`). The reviewer has ruled this is a Phase 1
obligation and not Phase 0 debt (`d-2026-08-03-reviewer-tunable-sites-are-a-phase-1-obligation`).
Fair — but it means the scorer is not yet a standard anything has met, and it will be applied to
proposals in a phase where it has never been calibrated.

### Mitigation

**Redefine the unit as declared degrees of freedom, not source literals.** Each proposal declares its
free parameters in a paradigm-neutral form; the literal census becomes one input to that declaration
rather than the measurement itself. Add a `[FITTED n=…]` provenance tag carrying a held-out
generalisation number, so honest fitting is anchored rather than anonymous. Extend the scan roots to
count numeric fields in loaded data artifacts, or state explicitly that data-resident parameters are
out of scope so the exclusion is at least visible (the census's own principle 2 is *"no exclusion is
silent"*, and this one currently is).

**Cost:** an amendment to `d-2026-08-03-honesty-census-definitions` plus changes in `classify.ts`,
about half a day — and cheap **only** before proposals exist.

---

## B9 — The contract is also the evaluation language, and no instrument can record an objection to it

**Status: DOCUMENTED; the corpus-scale count does not exist.**

### Mechanism

That the output contract fixes four roles plus a gradient boolean is legitimate — `V3_PLAN.md` §2
puts it under *"Fixed before design starts (these are about the problem, not any solution)"*, and a
product requirement is allowed to constrain designs. The bias is that **the same ontology is the
only vocabulary in which anything can be said about a palette.**

The 103-tag vocabulary (v2.1.0) is impressively symmetric *within* the contract — `should-be-gradient
↔ should-be-flat`, `missing-color ↔ alien-color`, `roles-too-alike ↔ roles-too-distinct` — and it
does carry `meta/both-sides-bad`, `meta/sides-incomparable`, `criterion/option-set-gap`. Credit where
due: that is a real anti-instrument-bias mechanism and it partly refutes a naive "enum blindness"
attack on the human channel.

But **there is no axis for "the four-role decomposition is wrong for this cover."** The nearest tags
are scoped to the *criterion* or the *comparison*, not to the contract. Free text can say it;
nothing counts it; and the queryable side is what drives iteration. This is v2-3's own failure —
*"the UI could not record a gradient objection"* — repeated one level up.

Worse, the palette-judgment half of the vocabulary has never been exercised. Of 103 tags, warehouse
tag instances at 2026-08-04 sit on five axes only (`criterion` 9, `instrument-behavior` 5,
`instrument-fitness` 5, `concept` 3, `meta` 1). **Zero on `gradient`, `coverage`, `role`, `contrast`,
`collapse`, `identity`, `provenance` — 58 of 103 tags, the entire palette-judgment surface,
unexercised.** The symmetric-vocabulary rule that is supposed to structurally close v2-3's
instrument-bias gap has never been tested against a palette complaint.

Counterexamples to the contract shape exist and are documented, with an honest n:

- **`ground-freetext-1`, n=9:** 9/9 describable in prose, 6/9 palette-decidable, **3/9 genuinely
  ambiguous even in prose**. This is the reviewer's "3 of 9". The synthesis names the reason: *"the
  vocabulary is a second question that assumes a first question was answered, and the first question
  was never asked"* — the figure/ground line is presupposed and is what actually breaks.
- **A cover the contract cannot express at all:** ProSound (`000f0a78`) carries three bands, one of
  which is itself a gradient. `gradient: null | {stops}` is global; that gradient is regional.
  *"The vocabulary already contained the right word and the reviewer still could not use it."*
- **Two of nine covers say a global answer does not exist** (*"almost any description would fit
  somewhere but not everywhere"*).
- The probe form had to be repaired pre-run because "the background" was singular — *"four of the six
  probes become unanswerable"* on a plural background — and the repair **stipulates** a background
  (*"taken AS A WHOLE — even if it has several different parts"*) rather than measuring whether one
  exists. `bg_visible` = yes 30/30 on the hardest 30, which is what a stipulated premise produces.

**The honest limit:** 3/9 is the only figure/ground-contested rate in the toolbox, and those 9 covers
were selected *because* the enum had already broken on them. There is no unbiased estimate, and the
coverage-set core carries zero labels. `PHASE_0_LOOSE_ENDS.md` B24 records the vocabulary-v3 /
pixel-retirement choice as *"reviewer-owned and unmade"*. Also worth noting, since it belongs here:
`reviews/phase-0-adversarial/contract.md` audits the arithmetic of a shape it never questions — APCA
byte-exact over 665,536 pairs, OKLab to 3.7e-8 — and **no document in `research/v3/` asks whether
four roles plus a global gradient boolean can represent album covers**, or names a single alternative
to APCA/OKLab (no WCAG 2.x, CAM16, CIECAM, HCT anywhere).

### Mitigation

**Add one opposed tag pair on a new `contract` axis: `contract/roles-dont-fit` ↔
`contract/roles-fit-cleanly`.** The lint requires an opposite and this has one. Tags are filed
post-hoc by the tagging agent from free text, so the objection becomes countable at **zero reviewer
cost**. Then run the count over the coverage set's 200 during Phase 2 to produce the first unbiased
figure/ground-contested rate — the number B24 needs and nobody has.

Second, cheap: **add an `unrepresentable` class to the pathology census.** P1–P6 all presuppose the
shape, so a cover the contract cannot express currently has nowhere to be counted.

**Cost:** a vocabulary entry plus a census bucket. Under a day, and it converts the campaign's
largest unquantified risk into a rate.

---

## B10 — Reviewer anchoring: the repeat-exposure version is weak; the vocabulary and monoculture versions are not

**Status: MEASURED. Partial refutation of the orchestrator's item 3.**

### What the numbers say

Warehouse at 2026-08-04 (1,078 records; re-derive with `warehouse status`): **479 distinct artworks**
across all record types, out of a 9,232-artwork universe — the reviewer has seen **5.2%** of the
corpus. Exposure distribution: median **1**, p90 7, max **17**; 57 artworks seen ≥5 times, 10 seen
≥10; 121 artworks appear in more than one released batch, maximum 4.

So cover-level familiarity anchoring is currently small and concentrated. **The orchestrator's item 3
is not supported at the scale implied.** The 7–8-exposure cluster has a known cause — by-question
passes serve one artwork many times in a sitting (`REVIEW_UI.md` §6) — and it is already implicated
in ledger **L-b**: 9 gate contradictions across 8 artworks, **45% of rows against a pre-registered
10% ceiling**, at a ~2.9 s median per answer, with nothing permitted to be graded against those rows
until a reading is on the record.

### The versions that are real

1. **Vocabulary anchoring, not familiarity.** 1,000 of 1,078 warehouse records are `oracle-label`
   and 0 are real palette verdicts. Phase 0 spent nearly all reviewer attention teaching the reviewer
   to answer in the enum's terms and almost none exercising palette judgment. See B3 and B5; the
   mitigation lives there.
2. **Single-reviewer monoculture is nowhere treated as a bias source.** Flo is the sole ground truth
   by design and that is not the problem — the problem is that no document examines it. There is no
   fatigue analysis, no order-effect analysis, no session-length or within-reviewer-drift analysis,
   and `REVIEW_UI.md` forecloses the cheapest instrument by policy: *"**No timing of the reviewer.**
   ('Humans are weak.')"* — while `reviews/phase-0-adversarial/review-server.md` nonetheless derives
   2.91 s median gaps from record timestamps and uses them as a fatigue hypothesis. That tension is
   unreconciled. The only self-consistency figure in circulation, 63%, is a bracketing-round
   measurement of a *different task*.

### Mitigation

- **Hold the 57 artworks with ≥5 exposures out of Phase 2 bake-off batches.** Free — it is a query,
  and `stratum` is already recorded on every `oracle-label` row.
- **Reconcile the timing policy explicitly**, one way or the other. Either timestamps are off-limits
  for reviewer inference (and `review-server.md`'s fatigue reading must be withdrawn), or
  order/session effects get a small named analysis on data already collected. Cost: a decision record,
  plus a few hours if the analysis is chosen. The current state — forbidden in the doc, used in the
  review — is the worst of both.
- **Extend the calibration round's repeats to palette grading** once real verdicts start, so drift is
  measured on the task it matters for rather than inherited from the bracketing round.

---

## What the toolbox got right, and should not be traded away in a fix

Listed because an adversarial audit that reports only faults will get its faults discounted:

- **The coverage-set core is label-free by design**, stratified over an encoder chosen on
  filename-derived ground truth with no labels in the loop. It is the only paradigm-neutral
  evaluation surface in Phase 0, and every mitigation above leaves it intact.
- **Blinding is honestly scoped rather than assumed.** The content channel was measured and reported
  as defeated — 24/24 unblinded from the payload — with the note that *"Phase 2's paradigm bake-off is
  exactly the shape that fails this test."* That is the right kind of finding to publish about your
  own instrument.
- **Deferred checks report as deferred, never as passed** (`I2.spatial-spread`, invariant 5 without a
  transparency report). Silence is not allowed to read as a pass.
- **The team measured its own preferred hypotheses and killed them**: residual purity NOT-ADOPTed at
  0.2424 against a pre-registered 0.75; the C/D arm run and reported as adverse; the capped-reference
  re-scoring that caught an 11.5-to-1 hallucinated-structure bias in their own answer key; holdout
  v1.0.0 voided and redrawn on a leak nobody was forced to find.
- **The demotion rule already exists** — *"an invariant that ever blocks an endorsed palette is
  demoted; the reviewer outranks the rule."* B1 is that rule firing, not a new principle.

---

## Summary table

| # | bias | status | one-line mitigation | cost |
|---|---|---|---|---|
| B1 | I2's population floor counts exact 8-bit triples; refuses 96.9% of endorsed palettes; forces modal-colour publication | MEASURED | measure population within the same-colour bar (96.9% → 17.7%) | hours |
| B2 | intermediate-state scoring exists for 1 of 4 candidate paradigms | DOCUMENTED | price instrument debt per proposal; ideally one equal-cost instrument each | 0.5–8 days |
| B3 | Phase 1 firewall excludes only the field guide; the toolbox ontology is on the reading list | DOCUMENTED | write the reading list down; run one toolbox-blind arm | hours + 1 arm |
| B4 | no trajectory instrument; movement ratchet + hard known-worse gate | MEASURED | gates report-only for prototypes; pre-register each paradigm's ceiling | hours + 1 page each |
| B5 | escape hatches present and dead (1/180, 0/284); census overstates categorical structure | MEASURED | add `vocabulary_fit`; publish forced share on every table | 1 re-pilot round |
| B6 | frozen scalar OKLab ruler is anisotropic and size-mismatched; merges hue out of the composer grid; biases known-worse against hue-moving paradigms | DOCUMENTED + code | hue-dominant near-matches report-only; second grid ordering | hours–half day |
| B7 | one mock, four salience-raising revisions, zero real verdicts ever rendered | DOCUMENTED + measured | 40-item calibration round in a second layout, layout id on the verdict | ~1 day + 1 round |
| B8 | honesty census counts source literals, cannot see `data/`, has no `[FITTED]` tag | MEASURED | score declared degrees of freedom; add `[FITTED n=…]` | half day |
| B9 | contract is the evaluation language; no tag can object to it; 58/103 tags unexercised | DOCUMENTED | add `contract/roles-dont-fit ↔ roles-fit-cleanly`; add an `unrepresentable` pathology | <1 day |
| B10 | repeat-exposure anchoring weak (median 1); vocabulary anchoring and single-reviewer monoculture unexamined | MEASURED | hold ≥5-exposure artworks out of the bake-off; reconcile the timing policy | free–hours |

**If only three things get done before Phase 1 opens:** B1 (it is a hard gate that is measurably
wrong), B3 (it is a paragraph, and it is the load-bearing unwritten decision), B4's first half (one
decision record, and it is only credible before proposals exist).

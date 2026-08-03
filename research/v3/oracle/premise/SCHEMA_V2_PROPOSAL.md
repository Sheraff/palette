# Group-BCDE schema v2 — sign-off packet

**Drafted 2026-08-04. Nothing here has been run. Nothing here is adopted.**
This document asks you for a set of decisions. The two prompt files beside it are drafted to the
point of being runnable so that signing has an immediate consequence, but both carry
`[DRAFT - NOT SIGNED OFF]` in their provenance and neither may be executed until you sign.

| | |
|---|---|
| what you are signing | the shape of the next group-BCDE instrument: which questions get asked, in what shape, on which bench |
| what it costs if you sign | ~70 min of GPU for the pilot, ~11 min for one wording mini-pilot, plus one reviewer round of about 25 min |
| what it costs if you don't | nothing is lost; v1's rows stay valid and readable, and the questions stay as they are |
| files | `SCHEMA_V2_PROPOSAL.md` (this), `prompts/group-bcde.v2.variant-e.json`, `prompts/group-bcde.v2.variant-f.json` |

---

## 1. The change list, one line each

Standing is marked on every row, and the three standings are genuinely different. **Signed** means
you already ruled it and this packet is only implementing it. **Proposed** means a record exists but
says "NOT ADOPTED". **New here** means this packet is the first time anyone has argued it.

| # | change | standing |
|---|---|---|
| a | Split every gate/dependent pair into two independent questions. The dependent is asked of every cover as a best-available answer; the gate becomes a separate judgment. | **proposed** — `d-2026-08-03-schema-v2-split-gated-pairs` |
| b | `has_dominant_subject` gains a unit rule: count the groups you would circle, not the things you could name. | **signed** |
| c | `signature_carrier` becomes a multi-select and gains a value for a colour spread across several elements. | **signed** (wording deliberately left to a pilot) |
| d | `illegible_at_this_size` is removed; presence and legibility become two questions. | **new here** |
| e | `overlays` stops being a list and becomes a plain enum with a `several` value. | **new here** |
| f | No `confidence` field, and no `ambiguity_note`. | **signed** |
| g | `has_signature_color` is deleted, its work absorbed by the carrier question. | **new here — this is the biggest ask** |
| h | The pilot moves from eval-142 to the coverage-set core. | **signed** (standing bench decision) |
| i | Three measurement instruments are re-registered because v1's were the wrong shape or were read post-hoc. | **new here** |

Deliberately **not** changed, and each one had a case made for it that the evidence refused: group A
and `ground_type`; `subject_kind` becoming a multi-select; `text_roles`' vocabulary; the
`small_element` value. §7 says why in each case.

---

## 2. Where the evidence comes from

Two measurements, on two sides, and they disagree in a way that turns out to be the whole story.

**The model side** — `group-bcde-pilot-1`, 142 images × 2 renderings = 284 answers, analysed in
`data/oracle-premise/bcde-pilot-1-analysis.json` against 36 bars fixed before the run. The
instrument worked: every row parsed, no retries, no truncation, and 34 of 36 bars passed. Two bars
failed (`15.6-2b.text_roles`, `15.6-2b.has_signature_color`) and one "what would make this schema
wrong" condition was met (`15.8.multi.overlays.singleton`).

**Your side** — `bcde-validation-1`, 20 artworks × 8 questions, analysed in
`data/oracle-validation/bcde-validation-1-analysis.json`. You answered each question on its own,
under an instruction that expressly told you not to make your answers cohere. Your answers broke the
gate rules on 9 occasions across 8 of 20 artworks — 45%, against a ceiling of 10%.

That 45% is not a mistake you made, and the analysis file says so at length. The ceiling was written
for the model, whose constrained decode generates the gate first and the dependent inside the gate's
context, so it *cannot* easily contradict itself — its clean sheet is architecture, not accuracy.
Read the model's own contradiction counts and this is obvious: **every single gate contradiction is
zero except one** (`c12`, typography-only artwork with a subject in it, 13 rows). The model never
once named a subject it had just said was absent. You did, five times out of five opportunities.

Your own account of why, recorded verbatim:

> "on some artworks if you ask me "is there a subject?" i might answer "no", but if you ask me
> *separately* "what is the subject?" i would answer "an animal". So if you ask me to *not make a
> story* then I will give you those 2 answers, but if you ask me *jointly* (or just one after the
> other) then I will change my answers so they are coherent together."

Re-asked jointly, the 9 contradictions became 0. Neither reading is the other's correction. The
independent pair carries *more* information: `none` + `animal` means "nothing dominates, but an
animal is present", and the joint format cannot say that at all. That is the finding this whole
packet is built on, and it is recorded as
`d-2026-08-03-gate-contradictions-are-elicitation-mode-effects`.

---

## 3. The changes, with what funds each

### (a) Split the gated pairs — *proposed, needs your signature*

**What changes.** Five questions that were conditional become unconditional. Instead of asking
"is there a dominant subject?" and only then "what kind is it?", v2 asks every cover both **"name
the kind of the most subject-like thing, if any"** and, separately, **"how many main subjects does
this cover have?"** Same for text and for the signature colour. The `not_applicable` values that
existed only to say "the gate closed" are gone, replaced by values that state a real observation:
`no_writing`, `nothing_pictured`, `no_single_colour`.

**Why.** The two questions in each pair were never asking one thing. The gate asks whether a
dominant X *exists*; the dependent asks what kind the *best-available* X is. Your independent
answers show they come apart on real covers — rule 9 (`has_dominant_subject == none` but a kind
named anyway) fired on **5 of the 5 occasions it could have**, a rate of 1.0. Forcing them into a
gate throws the second variable away.

The precedent for replacing `not_applicable` with a real observation is already in v1: `overlays`
kept `none` rather than gaining a `not_applicable`, on the reasoning that `none` is something a
person looked and saw. The same reasoning now applies to the other five.

**What it costs.** Gate-consistency rules 1, 2, 3, 4, 5, 9 and 10 stop being violations and become
descriptive cross-tabs — reported, never scored. The split record is blunt about the risk: **that
removes an instrument**. Rule 9 in particular was the SAM handoff's tripwire ("the shape of a bad
concept prompt"), and once it is a cross-tab, nothing fails when it fires — someone has to actually
read the table. §8 pre-registers who reads it and when.

**Honest limits.** The evidence that the variables come apart is 9 occasions on 20 artworks, one
reviewer, one round. That they are *distinct* is well argued; how often they come apart at corpus
scale is unmeasured. Also note: the ledger record says the dependent "becomes UNCONDITIONAL" — it
does not use the words "delete the `not_applicable` coupling". Deleting the coupling is this
packet's implementation of "unconditional", and that implementation is part of what you are signing.

### (b) The `has_dominant_subject` unit rule — *already signed*

Your question was "what if the main content is just 2 hands holding an object — does it count as 1,
2, or 3?" The signed rule: **count the groups you would circle, not the things you could name.**
Elements touching or acting together are one subject; two or more means subjects in separate places
on the cover.

It goes into the shared `THE MAIN SUBJECT` block, which both renderings carry byte-identically, and
is restated in the question's own stem — not as a footnote, per design rule 9's order of remedies.

**A bonus the evidence supports.** This rule targets exactly where the model was weakest. The two
renderings agreed on `has_dominant_subject` at κ 0.6618, and **23 of the 28 disagreements were one
rendering saying `multiple` where the other said `single`** — the split the unit rule defines. The
"is there a subject at all" half was already stable (`none` at 0.1197 vs 0.1127). So this is a fix
aimed at the measured failure, and §8 pre-registers the prediction: that confusion should shrink.

### (c) `signature_carrier` → multi-select, plus a value for a spread colour — *already signed*

Your question was "some image has both the text and the main subject be the exact same colour which
is the signature colour — how do you answer with only 1 answer?" You signed two fixes and they are
both adopted, not alternatives: the field becomes a **list**, and it gains a **value** for the case
where the colour is spread across several elements at once.

You also ruled how the wording gets chosen, verbatim: **"what matters is that the model understands
it, not me."** So this packet does *not* pick the wording. It proposes three candidates and a
cheap experiment to choose between them — §6.

**The trap, which is named in your own decision record.** A "spread" value and a multi-select
overlap: two carriers and "spread across several" can describe the same cover. If the model reaches
for the spread value *instead* of naming carriers, the value is doing harm. The drafted wording
tries to design that out rather than gloss it — every candidate restricts the spread value to the
case where the carriers **cannot be picked out**:

> `several_places` — it sits in several places at once and you cannot pick out which ones

**Worth knowing before you sign.** Across the entire warehouse, **no array-valued answer has ever
had two or more elements**. This field would be the first real exercise of multi-select machinery
that only unit tests have touched.

### (d) `illegible_at_this_size` — remove it, split the question — *new here*

**What the pilot showed.** The value fired **0 times in 284 rows** — 0 on all 43 thumbnail-tier
images, 0 on all 88 standard, 0 on all 11 large. It cannot fire as worded.

**Why that matters more than a dead value.** Look at what the model said instead. `has_text = yes`
by tier ran **0.8023 (thumbnail) / 0.9091 (standard) / 1.0 (large)**. The thumbnail shortfall did
not go to "I can't read it" — it went to **`no`**. That is a confident negative on a small
rendition, which is precisely what pipeline §7.1 says must never happen. The dead value is not a
cosmetic problem; the safety property it existed to provide is not being provided.

**What changes.** Presence and legibility become two questions: "is there any lettering, readable or
not?" and "can you read the lettering in this copy?" That is design rule 9 applied — the v1 question
had one slot doing two jobs, and a third enum value competing with `yes`/`no` was never going to win.

**What this does not fix.** A split repairs the *instrument*; it does not restore the *guarantee*.
No resolution floor has ever been measured for any question in this schema — the measured floors
cover group A only. §5, open choice 3, asks you whether the §7.1 guarantee should move to a computed
floor instead of being asked of a model that has now demonstrated it will not volunteer it.

### (e) `overlays` → plain enum — *new here*

**What the evidence says.** The v1 array returned exactly one value on **0.9542** of model rows, and
on **20 of 20** of yours. Pooled list lengths were `{1: 271, 2: 13}` — no row ever carried three.
Only six distinct sets appeared in the whole run, and only two of them had more than one value.
§15.8 named this condition in advance: "multi-selects that only ever return one value — the array
machinery bought nothing and the field should be a plain enum in v2."

**One caveat you should have.** The number that condition was read against (0.90) was **chosen after
the run**, and the analysis discloses it as post-hoc. It is not a close call — 0.9542 against any
plausible reading of "~every row" — and your own 20-of-20 settles it independently. But the bar was
not pre-registered, and §8 fixes that for v2.

**Keeping the shape honest.** A plain enum cannot record a cover with two added-on marks, and 13
covers had exactly that (parental advisory + label logo on 7, barcode + label logo on 6). Design
rule 8 says a value set must be able to record the answer it asks for, so the enum keeps a `several`
value. It costs one token and it stops the change from manufacturing confident wrong answers.

### (f) No `confidence` field — *already signed, and already true*

`d-2026-08-03-drop-confidence-from-next-schema`: the field was pre-registered to earn its place by
showing >10% non-high answers; measured 1.4%, twice in a row. `group-bcde.v1` already carried no
`confidence` and no `ambiguity_note`, so for this schema the decision changes nothing — it records
that the field cannot quietly return. Uncertainty comes from disagreement between the two
renderings, which is what the pilot reads.

### (g) Delete `has_signature_color` — *new here, and the biggest ask*

**Why it is on the table.** It is one of only two questions that failed a pre-registered bar: `yes`
on **0.8592** of 284 rows against a 0.85 spread bar. It also carried **the weakest agreement in the
entire run** — κ 0.4865, with raw agreement of 0.8732 that is almost entirely the majority class
agreeing with itself. The two renderings split badly on it (E said yes on 0.9085 of rows, F on
0.8099).

**Why deleting is coherent rather than drastic.** Under the split (change a), the carrier question is
asked of every cover and carries `no_single_colour`. That value *is* the "no" answer. Keeping both
means asking the same thing twice, and the bare binary is what invites the reflex `yes`: asked "is
there a signature colour?" the model says yes 86% of the time, but asked "where does this cover's
colour sit, or is there none?", "none" has to compete against four concrete alternatives. This is
the same failure group A already paid for, where a value on the wrong axis ate the decision-relevant
answer.

**Why it is an open choice and not a change.** No record signs this. Deleting a question is
irreversible in the sense that matters — you cannot re-read rows for a question nobody asked. §5,
open choice 1.

### (h) Move the pilot to the coverage-set core — *already signed*

`d-2026-08-03-coverage-set-canonical-bench` makes coverage-set-1 (200 core artworks,
embedding-stratified, + 20 enrichment) the canonical tuning bench, and states plainly that "new
instrument tuning runs on the coverage core". `d-2026-08-03-reviewer-rounds-from-coverage-core` puts
reviewer rounds there too, with the cost stated: the core intersects the pilot-decoded eval-142 on
**3 of 200** artworks.

That 3-of-200 join is the reason this move matters now rather than later. Your 20-artwork round and
the model's 142-image pilot overlap on 3 artworks — 2 on identical bytes, one at another rendition.
No agreement rate computed on 3 rows is a rate, and the validation analysis says so. Running v2 on
the core makes the reviewer round and the model run join exactly, for the first time.

**Cost:** 200 × 2 = 400 inferences instead of 284, so roughly 70 minutes instead of 50.
**Cost you should weigh:** v2's numbers will not be directly comparable to v1's, because the bench
changed as well as the schema. That is unavoidable — the bench decision is already signed — but it
should be stated rather than discovered.

### (i) Re-register three measurement instruments — *new here*

v1's own analysis flagged all three. None of these changes a question; they change what counts as a
pass.

1. **Multi-select degeneracy was measured with the wrong instrument.** The bar "no single value on
   more than 85% of rows" was written for single-answer questions and applied to a multi-select's
   *presence* rate. `text_roles` failed it — `title_display` appears in 0.9163 of gate-open sets —
   and the verdict's own note says the field is **not** collapsed: the modal exact set is
   `artist_name+title_display` at only 0.3307. A title appearing on almost every album cover is a
   fact about album covers. v2 separates the two: **set-collapse is barred** (modal exact set ≤ 0.85),
   **presence is reported with a flag and no bar**, because there is no principled number for it and
   inventing one after seeing 0.9163 would be moving a goalpost.
2. **The singleton condition gets a number, in advance.** ≥ 0.90 singleton rate means the array
   bought nothing. Same number as the post-hoc reading, but pre-registered this time so it is a bar
   rather than a reading.
3. **Every figure gets an elicitation-mode label**, and independent and joint readings are never
   blended. That is the operating rule from
   `d-2026-08-03-gate-contradictions-are-elicitation-mode-effects`.

---

## 4. The three candidate wordings, and how to choose between them

You ruled that the model's comprehension decides this, not argument. So: three candidates, one cheap
experiment, pre-registered pick rule. All three keep the anti-escape-hatch clause; they differ in
what "spread" is taken to mean.

| # | value token | gloss (variant E rendering) | what it tests |
|---|---|---|---|
| **A** | `several_places` | it sits in several places at once and you cannot pick out which ones | spread = **several locations**, unnameable. Matches the register of its four siblings, which are all places. |
| **B** | `spread_throughout` | it is spread through the whole cover rather than sitting on any one part | spread = **pervasive**. Risk: overlaps `background`. |
| **C** | `all_over` | it is all over the cover, not on any one part you could point to | same idea as B in plainer words. Tests whether the register or the concept is what the model is reading. |

**Candidate A is what the drafted files carry**, as a placeholder, so the files are complete and
runnable. It is not a recommendation — the experiment decides.

### The mini-pilot (the SAM vocabulary-probe pattern)

Same shape as `oracle/sam/probe_vocabulary.py`: run candidate phrasings as separate prompts over a
small hand-picked image list whose contents were confirmed by eye, and count what fires where.

- **Set:** ~20 covers, hand-picked and confirmed by eye, in three groups — ~8 where the same colour
  is clearly carried by two nameable things (your motivating case), ~6 with one obvious carrier
  (controls), ~4 with no signature colour (controls).
- **Cost:** 3 candidates × 20 covers = 60 inferences, ~11 minutes.
- **This is a probe set, not a sample.** It measures whether the model understands the wording. It
  says nothing about how often spread colours occur in the corpus, and must never be quoted as if it
  did.

**Measured per candidate:**

| metric | what it catches |
|---|---|
| fires on the multi-carrier group | the value works at all |
| fires on single-carrier controls | the value is a dumping ground |
| **escape-hatch rate** — spread chosen *alone* where two carriers were nameable | the failure your decision record names |
| shift in `text`/`subject`/`background` rates vs the same covers without the value | the value is eating its neighbours |

**Pick rule, fixed in advance:** take the candidate with the largest gap between firing on the
multi-carrier group and firing on the single-carrier controls, **subject to** an escape-hatch rate
≤ 0.25 — that is, on at least three of every four covers where two carriers are nameable, the model
must name them rather than only saying "spread". **If no candidate clears that, the value is doing
harm and the first half of your ruling comes back to you** rather than being shipped with the best
of three bad options. Those numbers are proposals; move them before the run, not after.

---

## 5. Open choices — this is what needs you

| # | choice | recommendation |
|---|---|---|
| **1** | Delete `has_signature_color` (change g), or keep it in front of the carrier question? | **Delete.** It failed its spread bar, has the run's weakest agreement, and is redundant once the carrier question is unconditional. If you keep it, the drafted files need one field re-added and `no_single_colour` stays as the carrier's nothing-here value. |
| **2** | Which spread wording? | **Don't choose — run the §4 mini-pilot.** It is 11 minutes and it is what your own ruling asks for. |
| **3** | For `illegible_at_this_size`: split only (drafted), or split *and* move the §7.1 guarantee to a computed resolution floor? | **Both.** The split repairs the instrument; only a computed floor restores the guarantee. Prerequisite, stated honestly: a floor has to be *measured* for `has_text` first, and none exists. A third option — telling the model the rendition's pixel size in a per-tier prompt note — is available but costs real machinery: the prompt stops being one string per rendering and becomes one per rendering-and-tier, which multiplies prompt hashes and touches the row-key identity. |
| **4** | `overlays` as a plain enum: keep the `several` value, or accept losing two-mark covers? | **Keep `several`.** 13 real covers had two marks; design rule 8 says the shape must record them. |
| **5** | Should variant E separate the dominance judgment from the naming question (drafted: 4 positions apart, different blocks) while F keeps them adjacent? | **Yes.** It makes the split measurable: if adjacency forces coherence, F will show fewer "none + a named kind" pairs than E on the same images. That is your independent-vs-joint finding, tested on the model, and it needs no ground truth. |
| **6** | Run the pilot on coverage-core 200 (~70 min) rather than eval-142 (~50 min)? | **Yes** — the bench decision is already signed, and it is what finally makes the reviewer round and the model run join. Accept that v2 and v1 numbers are then not directly comparable. |

---

## 6. What deliberately does NOT change

**Group A and `ground_type` are untouched. Nothing in this packet goes near them.** That question is
on a separate track and the choice there is yours and currently unmade: whether background structure
gets a v3 vocabulary or gets retired to a pixel computation via the residual-isolation route. The
ledger is explicit that it "settles no route" and that the residual route "has no purity measurement
yet, so the option the synthesis argues for cannot currently be evaluated on evidence"
(`d-2026-08-03-ground-freetext-primary-evidence`,
`d-2026-08-03-reviewer-background-via-residual-isolation`). This packet waits for that result and
does not pre-empt it. *(A note on wording: the ledger records the residual route; "pointing" appears
in no decision record — it is scouted in `oracle/sam/POINTING_SCOUT_NOTES.md` and carries no ruling.)*

**`subject_kind` does not become a multi-select — the pre-registered test said no.** v1 committed in
advance to reporting the kind distribution conditioned on `has_dominant_subject == multiple`, to find
out whether mixed-kind covers are common enough to need a list. They are not: under `multiple` the
distribution is person 0.6087 / object 0.1848 / building 0.1087 / vehicle 0.0652, against
person 0.566 / object 0.2453 under `single`. It neither collapses onto one kind nor spreads out. The
single slot is recording what it needs to, so the change is unfunded and is not made — even though
the machinery for it exists and it would have been easy.

**`text_roles` keeps its list and its vocabulary.** It failed a bar, but the wrong one (§3i). On the
metrics that were the right shape it passed everything: exact-set agreement 0.7817, mean Jaccard
0.9123, singleton rate only 0.2324, and every per-value agreement clear of the floor — the weakest,
`badge_or_sticker`, at κ 0.6988. The array is earning its keep here, which is exactly why dropping
it for `overlays` is a judgment about one field and not about multi-selects.

**`small_element` stays in the carrier vocabulary**, despite firing on only 2 of 244 gate-open rows
(0.0082). That is a near-dead value and you should know about it, but no bar covers it and no
evidence licenses removing it. Recorded as an observation, not a change.

**The E/F discipline is unchanged**: thirteen questions in one constrained decode, two independently
written renderings, eight shared blocks byte-identical between them, disjoint JSON key names, enum
option order held constant, `signature_carrier` last in both as the control. Three of the eight
shared blocks changed text (main subject, signature colour, answering); five are byte-identical to
v1.

---

## 7. What the v2 pilot must measure

Fixed before the run, as always, so it cannot be shaped by the rows. Read in this order — a schema
that fails 1 or 2 makes every later number meaningless.

**1. Parse rate.** Carried over unchanged: ok ≥ 99%, `parse_failed` 0, `attempts > 1` 0, zero rows
near the token cap. **Plus one new obligation:** v1's worst legal answer was 169 tokens (E) / 179
(F) against a cap of 256. v2 drops a field but makes the carrier a list of up to six, so the worst
case is *estimated* at roughly 200–215. That is arithmetic, not a measurement — **`selftest.py` must
re-measure it before the pre-flight**, per the standing rule that anything added to this schema
re-measures the worst case.

**2. Spread.** No single value on more than 85% of rows, for the judgment-type questions. For the
four where a skewed corpus is genuinely plausible (`has_text`, `physical_media_scan`, `overlays`,
`grain_or_noise`) the bar is on the minority cells instead: a value that fires zero times across the
bench is reported as possibly unanswerable, with its stem quoted.

**3. The two new questions get their own bars.**
- `text_legibility`: κ ≥ 0.45, **and** the report that actually matters — does
  `present_but_unreadable` fire at all, broken down by resolution tier. **Pre-registered
  consequence: if it fires zero times again across every tier, the split has failed and the remedy
  is the computed floor, not another rewording.**
- `signature_carrier` as a list: exact-set ≥ 0.60, mean Jaccard ≥ 0.75, no per-value κ below 0.40 —
  the same bars v1's multi-selects carried. Plus the escape-hatch rate from §4, now measured on the
  full bench.

**4. Multi-select degeneracy, in its corrected form** (§3i): set-collapse barred at modal exact set
≤ 0.85; presence rate reported with a flag and no bar; singleton rate barred at ≥ 0.90 = the array
bought nothing, pre-registered this time.

**5. Consistency, in its new shape.** Rules 1, 2, 3, 4, 5, 9 and 10 are **descriptive cross-tabs** —
computed, printed, never scored, never counted toward a ceiling. Rules 7 and 8 (multi-select shape)
and 11 and 12 (typography-only cross-checks) remain real contradictions. **Pre-registered ceiling:
total *scored* contradiction rate ≤ 10% of ok rows.** Note that in v1 the entire measured
contradiction rate was rule 12 and nothing else, so this ceiling is effectively a bar on `c11`/`c12`
plus the two shape rules.

**Who reads the cross-tabs, since nothing fails when they fire.** The split's own record warns that
demoting rules 9 and 10 removes the SAM handoff's tripwire. So the pilot report must print, as a
named section and not as an appendix: the (dominance × kind) cross-tab, **separately for E and F**,
with the "none + a named kind" rate called out in each. That rate is the split's whole subject
matter — it is the thing your 5-of-5 measured — and it is the number the SAM workstream needs.

**6. The split's own measurement** (open choice 5). E puts the dominance judgment four positions
away from the naming question, in a different block; F keeps them adjacent. Report the "none + a
named kind" rate under each. No bar is attached, because nobody knows the right number — this is
descriptive, and it is the cleanest thing the run can produce because it needs no ground truth and
no human. If F shows materially fewer such pairs than E, adjacency is forcing coherence in the model
the way joint elicitation did in you.

**7. The unit rule's prediction.** v1's renderings disagreed on `has_dominant_subject` at κ 0.6618,
with 23 of 28 disagreements being `multiple` vs `single`. **Pre-registered: that confusion should
shrink.** If it does not, the unit rule did not reach the model, and the next remedy is splitting the
question rather than rewording it again.

**8. Carried over unchanged:** per-question κ bars (has_text / physical_media_scan / medium ≥ 0.70;
the rest ≥ 0.45; subject_kind ≥ 0.60, now over all rows since there is no gate subset any more);
order domination (E and F disagreeing on more than ~35% of rows on most questions — v1's worst was
0.2606); the `grain_or_noise` × `medium` cross-tab; and the standing consequence that if a cheap
computed statistic reproduces `color_character` or `grain_or_noise`, that question is deleted and the
statistic used instead.

### The bench

**Coverage-set core, 200 artworks × 2 renderings = 400 inferences, ~70 minutes.** Tier mix comes
with the bench and is not chosen: 53 at ≤400 px, 123 at 401–640, 21 at 641–1024, 3 above 1024.
Output to a new file; never append to any v1 run. The full pre-flight is owed because the grammar is
new — `selftest.py`, then `preflight.py --stage smoke`, then `--stage retry`, which is the one that
matters because it is the first time the two-array grammar is built through the real code path.

**No agent starts this run.** The GPU is single-owner.

### The reviewer round

Built **after** the pilot, not before — half its value is choosing which questions are worth your
time, and that is what the pilot's numbers are for.

- **20 artworks from the coverage core**, drawn by a seeded rule that looks at no model answer. Do
  not re-select on E-vs-F disagreement; a second round on disagreement artworks is legitimate
  afterwards and must be labelled as the conditioned sample it is.
- **The join finally works.** Both sides on the same bench means every artwork you answer has model
  answers to compare against — instead of 3 of 200, which is what made the last round's
  reviewer-vs-model claims close to unfounded.
- **Question text byte-identical to variant E's rendering**, with the eight shared blocks on the page
  above every question, and `builtFrom` recording that choice — scoring F then carries a wording
  caveat that scoring E does not.
- **`kind: "multi"` for the two lists.** It already exists and is generic. Both list vocabularies
  carry an explicit nothing-here value, which the UI requires because an empty commit is refused.
- **One elicitation mode, and this is a saving from the split.** Under v2 there are no gates, so
  there is nothing to reconcile — the independent round *is* the round, and no reconciliation pass is
  needed. Every figure still carries its mode label.
- At n=20 the noise is about ±2 items, so only large gaps mean anything. The round's real product is
  **which questions are answerable by a human at all** — a question you find unanswerable is deleted
  regardless of what the model did with it.

---

## 8. Machinery owed before any of this runs

None of it is in this packet's files, and all of it is in files another workstream owns or has
uncommitted changes in, so this draft deliberately did not touch them.

1. **A `group-bcde.v2` registry entry** in `oracle/premise/common.py`. That file currently has
   uncommitted changes from another workstream and was left alone.
2. **`selftest.py`'s prompt inventory.** It asserts that `prompts/` holds no file it does not know
   about — so **these two drafts trip it the moment they land on disk.** That is expected and it is
   the check doing its job; it clears when v2 is registered. (A neighbouring workstream's
   `subject-noun.v1.variant-g.json` is in the same directory and in flight as this was drafted, so
   the inventory check needs updating for both files, not just these two.)
3. **A v2 row in the file-identity table**, with the three hashes, once the wording is final.
4. **The worst-case token re-measurement** (§7.1).
5. **A `text_legibility` resolution floor**, if open choice 3 goes the way §5 recommends. It does not
   exist and nothing in this packet creates it.

---

## 9. Draft file identity

Provisional — the spread wording is a placeholder, so these will change once §4 picks a winner.
Recorded so it is visible whether the files moved between sign-off and running.

| | variant E | variant F |
|---|---|---|
| file | `prompts/group-bcde.v2.variant-e.json` | `prompts/group-bcde.v2.variant-f.json` |
| `prompt_hash` | `be4722015f4cdbf6…` | `77c494042acc1718…` |
| `schema_hash` | `20176c5364fb63d9…` | `bb9b25f5ca7e8755…` |
| `file_hash` | `af1cfa1de058cc69…` | `f053777b8f9be43e…` |
| prompt length | 6 965 chars | 6 564 chars |

Checked on both files: valid JSON; the eight shared blocks byte-identical between them; no prompt
line shared outside those blocks; JSON key names disjoint; schema property order equal to the stated
question order (which under constrained decoding *is* the generation order); every property required;
`additionalProperties` false; both lists array-of-enum with `minItems` 1 and no `uniqueItems`; every
vocabulary within the review UI's 9-option cap; every vocabulary value glossed in the prompt text; no
`not_applicable` value surviving anywhere.

Not checked, because nothing was run: that the grammars compile, that the longest legal answer fits
the token cap, and that the model produces anything sensible under either wording.

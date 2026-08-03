# Premise test — what to run next

**For:** the orchestrator. **Status:** drafted, nothing run, nothing in `common.py` changed.
**Reads with:** `README.md` (this directory), `../../ORACLE_QUESTION_SET.md` v2 §A.

**Two arms are drafted and neither has been run:**

| arm | schema | what it changes | §§ |
|---|---|---|---|
| **criterion arm** — variants C, D | `group-a.v2` | same six-way question, corrected criterion + precedence rule, B's ordering | 1–7 |
| **probe arm** — P, Q, six solo | `group-a.probes.v1` | no `ground_type` question at all: six easy probes, tag derived by a committed table | 8–13 |

**Recommended sequence, ~2.5 h of GPU in total:** criterion arm (~50 min) → probe arm bundled
(~50 min) → probe arm separate on the gold-30 only (~30 min), the last gated on the second. Run
the criterion arm first regardless: it is the baseline the probe arm is scored against, and it is
the cheapest thing that could make the probe arm unnecessary.

**The human probe round (§12) is the other half of the probe arm** and costs the reviewer ~10–15
minutes. Schedule it *before* reading the probe arm's numbers, so the probe arm is scored against a
probe-native gold rather than through the derivation.

---

## 1. Where run 1 left it

`premise-run-1`, 137 artworks × 2 prompt variants, scored against the accepted palettes'
gradient boolean; then `disambiguation-1`, where the reviewer answered `ground_type` themselves
on the 30 artworks where oracle and flag contradicted.

| | variant A | variant B |
|---|---|---|
| exact `ground_type` match with the reviewer (n=30) | 7 (23%) | **16 (53%)** |
| binary gradient agreement with the reviewer | 8/20 (40%) | **17/24 (71%)** |
| the v2-3 algorithm's own flag, same 24 | — | 14/24 (58%) |
| strict κ vs the flag, corpus (n=137) | 0.21 | **0.31** |
| answers landing on a value that predicts nothing | 60/137 (44%) | **43/137 (31%)** |
| `full_scene` answers | 50/137 | 38/137 |

Two things came out of it that C and D exist to act on:

1. **B's rendering beat A's, decisively, and ordering is the mechanism with a story behind it.**
   B asks `enclosure` and `field_texture` *before* the critical ground question; under
   constrained decoding the property order is the generation order, so B has committed to two
   cheap facts about the image before answering the hard one. But A and B differ in order *and*
   wording, so ordering is confounded.
2. **The criterion put to both instruments was incomplete.** It named surface identity ("shading
   within one physical surface") as the test. The reviewer's two in-round rulings corrected it:
   the axis is *one continuous colour progression vs discrete colour areas*, and surface identity
   is a prior, neither necessary nor sufficient. `ORACLE_QUESTION_SET.md` v2 §A.2.

## 2. What a C/D run would test

Three questions, in order of how much they are worth:

**Q1 — does the corrected criterion close the gap?** C and D carry the corrected criterion and
both canonical examples verbatim, plus a precedence rule telling the model when *not* to reach
for `full_scene` / `pattern_or_texture` / `none_discernible`. The vocabulary is byte-identical to
v1, so every number is directly comparable with A and B on the same images.

**Q2 — was it the ordering, or was B just a luckier wording?** C and D are two independently
written renderings that both keep B's question order *and* B's enum option order. If both land
near or above B, ordering carried it and question-set design rule 6 is confirmed. If they scatter,
wording dominates and rule 6 stays confounded — which would itself be worth knowing, because a
result that only survives one phrasing is not a result.

**Q3 — is the `full_scene` leak wording-fixable or structural?** The precedence rule is the cheap
half of the fix proposed in `ORACLE_QUESTION_SET.md` §A.5. If the unmapped share stays high
despite it, that is the argument for spending the reviewer's time on the vocabulary split
(`group-a.v3`) rather than on more prompt wording.

**What C/D deliberately do NOT test.** The §A.5 vocabulary split. Two changes at once cannot be
attributed, and C/D are the baseline any split would have to beat.

## 3. Recommended item set

**The full eval set, unchanged: 142 images × 2 variants = 284 inferences.** Same file, same
`build-eval-set.ts` output, same ground truth as run 1.

Why not just the 30 human-answered artworks:

- The 142 are a superset of the 30, so the human comparison comes free.
- The corpus-scale readouts (unmapped share, `full_scene` count, κ vs the flag) are the ones with
  n=137 behind them; the 30-item comparison alone is too small to settle anything by itself.
- Comparability with run 1 is exact only on the identical population.
- It costs the same as run 1: **~50 min at burst, ~1.5 h if the machine throttles.** The premise
  test is still an afternoon.

**Do not re-select a contested subset for this run.** The contested set is defined *by* the
oracle's answers, so selecting on it before running C/D would condition on the thing being
measured. A fresh human round, if it is needed, comes after — on the artworks C/D contradict.

**Reviewer time is the scarce resource here, not GPU time.** Run C/D first; only ask for a second
30-item human round if §4's numbers land in the ambiguous band.

## 4. What success looks like, numerically

Stated before the run, so it cannot be moved afterwards.

### Primary — against the human, n=30 (the only place a human answered this question)

Binomial noise at p≈0.53, n=30 is ±2.7 items (1σ). So:

| exact `ground_type` match | reading |
|---|---|
| ≥ 22/30 (73%) | **success.** ~2σ above B; the corrected criterion did real work |
| 19–21/30 | encouraging, not decisive. Report with the count, do not fund a decision on it |
| ≤ 18/30 | **no effect.** Within noise of B's 16 |

Binary gradient agreement should clear **80%** *and* the denominator should grow (B answered on
only 24 of 30; the precedence rule should push that toward 28+). A higher rate on a shrinking
denominator is not an improvement.

### Primary — structural, n=137 (the most reliable readout in the run)

| metric | A | B | target |
|---|---|---|---|
| answers on unmapped values | 44% | 31% | **≤ 15%** |
| `full_scene` answers | 50 | 38 | **< 15** |
| strict κ vs the flag | 0.21 | 0.31 | ≥ 0.40 |
| mapped-only κ | 0.45 | 0.48 | ≥ 0.55, **quoted with its n** |

Mapped-only κ is not comparable across variants when the mapped population changes size — if the
unmapped share falls as intended, the mapped population grows and gets harder. Read the strict
column as the headline and the mapped column as context, exactly as `analyze.py`'s own notes say.

### Secondary — wording robustness, needs no ground truth

- **C-vs-D disagreement on the binary.** A-vs-B was 36/137 = 26%. If the corrected criterion
  genuinely pins the answer down, C-vs-D should be **≤ 15%**. This is the cleanest readout in the
  run: no ground truth, no epistemology caveat, just whether two wordings of one rule agree.
- **C and D within ~5 points of each other** on exact match → ordering carried the A→B jump
  (Q2 answered yes). A wide spread → wording dominates.
- **`confidence`.** Under v1 it was degenerate: 298 of 299 rows said `high`, κ = 0.0. C/D give
  the stem an operational trigger ("answer low whenever a second answer is defensible"). Success
  is **>10% of rows non-`high`**. If it stays flat, delete the field in the next schema and rely
  on inter-variant disagreement, which is what pipeline §3 says to do anyway.

### The decision this run feeds

- Unmapped share **≤15%** and exact match **≥22/30** → group A's ground question is good enough to
  go corpus-wide at `group-a.v2`; the §A.5 split is not funded.
- Unmapped share still **>25%** → the leak is structural, not verbal. Escalate the §A.5 split to
  the reviewer as `group-a.v3`, with this run as the evidence.
- Exact match **≤18/30** *and* unmapped improved → the vocabulary is the problem, not the
  criterion. Same escalation.
- Everything flat → the premise is weaker than an afternoon's prompt work can fix; that is
  `V3_PLAN.md` §5's "poor agreement = an afternoon spent, not a week", and the oracle stops being
  the thing group A's decisions rest on.

### One unversioned probe worth knowing about before spending

`../../data/oracle-validation/opus-probe-1.jsonl` holds a much larger model's answers on the same
30 contested artworks: **15/30 exact, 14/22 binary** — i.e. **no better than variant B** (16/30,
17/24). **Caveat: there is no prompt file, no script and no provenance for it in the repo**, so it
is `[n=1, UNCALIBRATED]` and must not be quoted as a measurement. If it survives being redone
properly it says the residual gap is *question ambiguity, not model capacity* — which is the
argument for spending on the vocabulary (§A.5) rather than on a bigger model.

## 5. Machinery the orchestrator must change first (not this workstream's paths)

The two prompt files are inert until `common.py` opts in. Both edits are one line and both are
reversible.

1. `SCHEMA_VERSION = "group-a.v1"` → `"group-a.v2"`. `load_prompt_variant` asserts on it, so
   without this the new files raise at load.
2. `default_variants()` globs `group-a.variant-*.json`. Add a constant next to `SCHEMA_VERSION`
   and use it:
   ```python
   PROMPT_GLOB = "group-a.v2.variant-*.json"   # v1 was "group-a.variant-*.json"
   ```

**Why the new files are named `group-a.v2.variant-{c,d}.json` and not `group-a.variant-{c,d}.json`:**
the v1 glob must keep matching exactly A and B. Naming them `variant-c/d` would make
`default_variants()` load all four, trip the `SCHEMA_VERSION` assertion, and break every A/B rerun
and `selftest.py`'s "two prompt variants load" check — today, before anyone opts in. With the v2
naming, nothing changes until the two lines above change. `--variant C` does not help: filtering
happens *after* all files are loaded.

Note that with the assertion in place **v1 and v2 cannot be loaded in one process.** That is the
intended behaviour (pipeline §11: freeze the question set and `schema_version`; changing it
mid-run invalidates the run), not a limitation to work around.

Also:

- **Write to a new output file** — `../../data/oracle-premise/premise-run-2.jsonl`. Do not append
  to run 1. `row_key` includes `prompt_hash` so appending would be *safe*, but mixing two schema
  versions in one analysis is a reporting trap.
- `analyze.py` derives the variant list from the rows, so it runs unchanged and will report C and
  D wherever it reported A and B.
- **Re-run `preflight.py --stage smoke` and `--stage retry`.** New JSON keys mean a new grammar,
  and `--stage retry` is the check that proved constrained decoding is load-bearing (without it
  the model copies the rubric's numbering into its keys). `--stage decode` does not need redoing;
  the images are unchanged.
- Run `selftest.py` after the two edits — it asserts exactly two variants load and that they all
  match `SCHEMA_VERSION`. Both stay true under the v2 naming.
- The model pin does not change: same snapshot, same `model-manifest.json`.

## 6. Identity of the two new files

Recorded here rather than inside the files, because `file_hash` is the hash of the file itself.
`prompt_hash` = `sha256(system + "\0" + prompt)`, `schema_hash` = `sha256` of the JSON schema with
sorted keys and compact separators — the same formulas `common.py` uses.

| | variant C | variant D |
|---|---|---|
| file | `prompts/group-a.v2.variant-c.json` | `prompts/group-a.v2.variant-d.json` |
| `prompt_hash` | `a9a649316fa5a6783d4866955905d8759324ead80b776ccd9ca10030d1add0aa` | `56cc04d4516d0f27a918e34c01c09235fcbfefaa815909b34ddf58b1d0395ea2` |
| `schema_hash` | `abd49f73bb1e5030d59079b6d3a1f1f3c5a8025dee2d8d2c35ae40da7bc10eed` | `76ee5b92e725aec1268038d1c464b8ff0544593eedd15d9edbec084228791987` |
| `file_hash` | `6e25e75b6081dbd45fce8d2340668a1f29914ccd37ce587fa1568a7048649734` | `6715237d45ff190ec5129d4bb3510d05d4715fe477030bf1efc6302ef28c7314` |
| JSON keys, in generation order | `frame`, `unevenness`, `ground`, `gradient_shape`, `confidence`, `note` | `border`, `grain`, `field`, `falloff`, `certainty`, `note` |
| prompt length | 3286 chars | 3301 chars |

Both shared blocks sit at the top of the prompt, before question 1, rather than inline at the
ground question the way B carried its one-surface rule — they are long and both later questions
lean on them. The order that governs the measured effect is the JSON property order, which is
generation order under constrained decoding, and that is B's exactly.

Held identical between C and D: question order, enum option order (both inherited from B),
vocabulary (inherited from v1), the `THE TEST` block and the `WHICH ANSWERS ARE FOR WHAT` block
(byte-identical, verified). Different between C and D: stem prose and key names only.

**Variants A and B were not touched.** They are the record of what run 1 actually asked, and run 1
cannot be re-read against any other text.

## 7. What still needs reviewer sign-off before this run means anything

From `ORACLE_QUESTION_SET.md` v2's changelog — the run can proceed without these, but the *labels*
it produces are only as authorised as the criterion behind them:

1. The corrected `ground_type` criterion (§A.2). The reviewer authored both source rulings; what
   needs sign-off is the generalisation drawn from them.
2. The precedence rule (§A.1) — new policy, not transcription. It is the one change in C/D that
   the reviewer has not already decided in some form.
3. The `confidence` stem trigger — low stakes, but it is a change to a field the reviewer's own
   form also carries.

Not needed before this run: the §A.5 vocabulary split. It is a proposal, deliberately
unimplemented, superseded by the probe arm below, and this run is part of its evidence.

---

# 8. The gold-30: what instrument it is, and what it can score

The 30 reviewer answers in `oracle-premise-disambiguation-1` are the only place a human has
answered this question. Everything downstream leans on them, so their scope has to be stated
rather than assumed.

**What they are.** Elicited 2026-08-03, one question (`ground_type`), the **v1 six-way vocabulary**,
under the v1 criterion — "a gradient means continuous shading within one physical surface; the sky
and the grass are different areas" — as clarified during the reviewer's own session. The two
canonical cases in `ORACLE_QUESTION_SET.md` §A.2 arose in that session.

**Uniformity.** **The gold-30 is uniform under the corrected criterion — reviewer-confirmed
2026-08-03: the mid-round clarifications did not change any of their answers.** No
pre/post-clarification split is needed and none should be manufactured. The warehouse record is
consistent with this: the batch holds 32 `oracle-label` rows for 30 items, the two extra being
`superseded` rows the analysis already excludes (`skipped.superseded: 2`).

**Selection.** The 30 are the artworks where the oracle and the accepted flag *contradicted* under
either variant. They are the hard tail by construction, not a random sample. Every rate computed on
them is a rate on hard cases, and must be reported as such — an arm can win here and lose on the
corpus.

### 8.1 Scoring validity table

| what is being scored | valid against gold-30? | caveat |
|---|---|---|
| criterion arm (C, D), `group-a.v2` | **yes, as-is** | identical construct, identical vocabulary. Direct comparison with A and B on the same 30 |
| probe arm, `group-a.probes.v1` | **yes, via the derivation table** | **construct-match caveat:** the reviewer answered the six-way question; the arm answers six probes. The derivation maps the arm onto the reviewer's construct, so a disagreement can be the model, the derivation, or the mapping — three causes, one number. §12's human probe round is what removes this |
| any future `group-a.v3`-style split vocabulary | **no — requires re-elicitation** | different value set, so there is nothing to compare token-for-token. **Cheap: ~3 min.** The reviewer answered 30 six-way items in ~3.5 min of actual answering (07:28:06→07:35:45 wall, less two ~2-min deliberation pauses ≈ 7 s/item). By-question mode re-elicits one question over 30 images at that rate |

The third row is worth acting on rather than fearing: **re-elicitation is three minutes.** Nothing
in this plan should be shaped around avoiding it.

---

# 9. The probe arm — what a run would test

`ORACLE_QUESTION_SET.md` §A.6. Six `yes|no|unsure` probes replace the six-way question; the tag is
derived by the committed 729-row table in `prompts/derivation.group-a.probes.v1.json`. Reviewer's
rationale: "might increase reliability, and make the questions easier to answer."

Four questions, in order of what they are worth:

**Q1 — do six easy questions beat one hard one?** Against the reviewer's gold-30, and against the
accepted flag on the 142.

**Q2 — are the probes actually easy?** Per-probe P-vs-Q agreement. This is the arm's own premise and
it is testable independently of any ground truth. A probe that cannot clear 90% is not easy and
should be dropped whatever the aggregate does.

**Q3 — does the inconsistency rate earn its place as an uncertainty metric?** A six-way question
*cannot* contradict itself; six probes can. That is a new instrument, and the test is whether it
predicts the artworks the single-question arm contested.

**Q4 — does bundling contaminate?** Separate mode vs bundled mode on the same images.

**What the probe arm does NOT test:** the §A.5 split. It generalises it — see §A.6.7's outcome
table for what happens to §A.5 under each result.

---

# 10. Probe arm: modes, item sets, cost

Measured basis: run 1 was 284 inferences in ~50 min burst (~1.5 h throttled) — ~10.5 s per
inference wall-clock. Image encode and prefill dominate; decode length is negligible either way, so
a bundled eight-field answer costs essentially what a one-field answer costs.

| step | prompts | images | inferences | estimate |
|---|---|---|---|---|
| criterion arm (C + D) | 2 | 142 | 284 | **~50 min – 1.5 h** |
| probe arm, bundled (P + Q) | 2 | 142 | 284 | **~50 min – 1.5 h** |
| probe arm, separate, gold-30 gate | 6 | 30 | 180 | **~30–50 min** |
| probe arm, separate, full — only if the gate passes | 6 | 142 | 852 | **~2.5–4 h** |

**The separate-mode delta.** Six inferences per image instead of one, on the same image: **~4× the
bundled arm's cost** for the same 142 images (852 vs 284 inferences, since bundled runs two
variants). Against a single bundled variant it is 6×. The delta is almost entirely re-encoding the
same image six times — **if the runner cached the vision encoder output per image, it would largely
collapse.** That is a runner change, outside this workstream's paths, and it is not required: the
gold-30 gate keeps the unoptimised cost at ~40 minutes.

**Item sets.** Bundled: the full eval set, unchanged, same population as run 1 — comparability with
A/B is exact only on the identical population, and the gold-30 comes free as a subset. Separate:
the gold-30 only, as a gate. **Do not re-select a contested subset for the bundled run** — the
contested set is defined by the oracle's own answers, so selecting on it conditions on the thing
being measured.

---

# 11. Probe arm: pre-registered success criteria

Committed before any probe-arm inference exists.

### 11.1 Probes vs the single question, against the reviewer's gold-30

The comparison is **κ on the six-way tag**, plus exact-match counts. Baselines: A 7/30 (23%),
B 16/30 (53%), and C/D once they run.

> **Compute the baseline κ first.** `premise-disambiguation-1-analysis.json` reports exact-match
> *rates*, not κ. Recompute A's and B's multi-class κ against the reviewer's 30 answers **before**
> the probe arm runs, and record it. A baseline computed after the fact is not a baseline.

| derived-tag result vs the best single-question arm | reading |
|---|---|
| κ ≥ baseline + 0.15 **and** exact match ≥ 22/30 | **probes win** |
| κ within ±0.10 of baseline | **no difference** — keep the cheaper instrument, which is the single question |
| κ ≤ baseline − 0.10 | **probes lose** |

Report the same numbers against the **probe-native gold** from §12, which has no construct-match
caveat. Where the two disagree, the probe-native number governs the probe arm and the difference is
itself reportable — it is the size of the mapping's contribution.

### 11.2 Are the probes easy? (cross-variant stability on the 142)

| metric | A-vs-B baseline | probe-arm bar |
|---|---|---|
| identical derived tag, P vs Q | 97/137 = 71% | **≥ 85%** |
| binary gradient disagreement, P vs Q | 36/137 = 26% | **≤ 15%** |
| **per-probe** raw agreement, P vs Q | n/a | **≥ 90%, every probe** |

The per-probe bar is a **hard gate on the probe, not on the arm.** Any probe under 90% has failed
its own "easy question" premise; report it, drop it, and say what the derivation does without it.
An aggregate that scores well while a probe is at 70% is the §A.6.9 failure mode — the table doing
the model's work.

### 11.3 Does the inconsistency rate earn its place?

- **Non-degeneracy** (the bar `confidence` failed): no single disposition value on >90% of records.
  Under v1, `confidence` was `high` on 298/299 = 99.7%.
- **Usability ceiling:** total `underdetermined` ≤ **10%** of records. An arm that abstains on a
  third of the corpus has replaced nothing.
- **Does it predict the contested items?** Build the 2×2 of (flagged inconsistent-or-tense) ×
  (that artwork was `contradiction_hard|soft` in run 1) over the 137. **Success = relative risk
  ≥ 2.0**, reported with the table and its n, not as a bare ratio. Note the honest confound: run 1's
  contested set came from a *different* instrument, so this tests whether the two instruments find
  the same artworks hard — which is the interesting question, but it is not a validity proof.
- Report the **per-probe unsure rate** unconditionally. Localising which probe is hard is something
  a single enum can never do, and it is useful even if every other number here disappoints.

### 11.4 Structural (n=137, vs the accepted flag)

| metric | A | B | probe-arm target |
|---|---|---|---|
| derived `full_scene` | 50 (36%) | 38 (28%) | **< 10%** — rule 6 closes this by construction, so a miss means the probes disagree with the derivation's premise, not that the rule failed |
| derived unmapped total (`full_scene` + `pattern_or_texture` + `none_discernible`) | 44% | 31% | **≤ 15%** |
| strict κ vs the flag | 0.21 | 0.31 | ≥ 0.40 |

### 11.5 Bundled vs separate (gold-30 gate)

| separate mode vs bundled, same 30 | decision |
|---|---|
| ≥ 3 more exact matches **and** per-probe stability improves | bundling contaminates; extend separate mode to the 142 (~2.5–4 h) |
| within ±2 exact matches | bundling is clean; **do not spend the 4×**. Bundled is the arm |
| worse | bundling helps (probes benefit from context). Report it — it is design rule 6 reappearing inside the arm |

---

# 12. The human probe round — batch spec

**Purpose, pre-registered, two uses:**

**(a) Probe-native gold.** The reviewer's own probe answers on the same 30 artworks, run through the
same derivation, give a gold tag with **no construct-match caveat** (§8.1, row 2). The probe arm is
then scored model-probes vs human-probes, like against like.

**(b) The human-side reliability test — the one that is independent of any model.** Derive the tags
from the reviewer's own probe answers and compare them with the reviewer's own *direct* six-way
answers on the same 30 artworks. Both are the same human, same images, days apart at most. So:

- **Reference noise floor: 63%.** The reviewer's measured repeat consistency on a binary question,
  `bracketing-round-1-clarified`, 72 items `[MEASURED, PHASE_0_DECISIONS.md §3]`. Caveat that cuts
  in the right direction: that round was deliberately near-threshold, and the gold-30 is likewise a
  contested set, so the two are comparably hard — which makes 63% an apt floor rather than a
  flattering one.
- **If probe-derived and direct tags agree at or below ~63%**, the disagreement is inside the
  reviewer's own noise and says nothing about which instrument is better.
- **If they agree well above 63%**, the two instruments are measuring the same thing and the
  derivation is faithful to the human's own construct — which licenses (a).
- **If they disagree well beyond 63% in a patterned way** (concentrated on particular tags or
  particular probes), that is **evidence about which instrument is more reliable, with no model
  involved at all** — the most valuable single result available from this round. Report the
  confusion matrix, not a rate.

**Batch spec** — `research/v3/src/review-server/oracle-validation.ts` already supports multi-question
batches keyed (batch, question, image), with by-question passes enforced:

```
batchId              oracle-probe-gold-1
purpose              oracle-validation
fixtureVersion       oracle-validation-1
labelSchemaVersion   group-a.probes.v1
seed                 20260803
items                180  = 30 artworks x 6 questions
serveOrder           six contiguous passes, one per probe, shuffled within each pass
                     (validateFixture rejects interleaved questions)
questions            six, kind: "enum", hotkeys y / n / u
```

- **`kind` must be `enum`, not `boolean`.** `BOOLEAN_HOTKEYS` is fixed to `["y","n"]` and a probe has
  three answers. Hotkeys `y` / `n` / `u` keep the one-keystroke, auto-advance property REVIEW_UI.md
  §6 asks for.
- **The 30 artworks are exactly the gold-30**, same `imagePath` and same `sha256`, so the join back
  to both the direct answers and the model rows is exact. Reuse `premise-disambiguation-1.json`'s
  item rows; only the questions and serveOrder change.
- **Question `question` and `answers[].gloss` text must be byte-identical to the prompt files'
  rendering of the same probe** (`ORACLE_QUESTION_SET.md` §A.6.1), for the reason the bracketing
  round learned the hard way and `OracleQuestion.instruction`'s own comment states: an answer only
  means something against the exact words it was answered under.
- **`instruction`**, same on every pass: *"Answer this one question only. Do not try to make your
  answers across questions tell one story. If you cannot tell, answer unsure — it is a real
  answer."* The anti-coherence instruction matters: the reviewer will have seen these artworks
  before, and the derivation is only meaningful if each probe is answered on its own.
- **Pass order:** run the six passes in `bundled-p`'s probe order. Do not randomise the pass order
  across the reviewer — with one reviewer there is nothing to average over, and a recorded fixed
  order is reproducible where a shuffled one is not.
- **Cost: ~10–15 min.** 180 items at the measured ~7 s/item for a six-way enum with glosses, and a
  three-way probe should not be slower, plus six pass warm-ups.
- **Do not show the reviewer their earlier direct answer**, and do not run this in the same sitting
  as anything that displays it. Use (b) is worthless if the round is anchored.

**Sequencing.** Run this **before** reading the probe arm's model numbers. It costs 15 minutes, it
is the only thing that removes the construct-match caveat, and use (b) is worth having whether or
not the model arm succeeds.

---

# 13. Probe arm: machinery opt-in and file identity

The probe arm needs **more** than the criterion arm's two lines, because it is the first schema
group that does not ask `ground_type` at all.

1. `SCHEMA_VERSION = "group-a.probes.v1"` and `PROMPT_GLOB = "group-a.probes.v1.bundled-*.json"`
   (separate mode: `"group-a.probes.v1.solo-*.json"`).
2. **`CANONICAL_FIELDS` and `VOCABULARIES` must become per-variant, read from the prompt file.**
   Today they are module constants and `load_prompt_variant` asserts every variant covers
   `ground_type`, `shading_geometry`, `field_texture`, `enclosure`, `confidence`, `ambiguity_note`.
   No probe file can satisfy that, and a solo file declares exactly one field.
   **Every probe prompt file already carries `canonical_fields` and `vocabularies` blocks**, so the
   change is mechanical: read them from the document, fall back to the module constants when
   absent. A/B and C/D keep working unchanged.
3. **A derivation step before `analyze.py`.** Load `prompts/derivation.group-a.probes.v1.json`, key
   each row's six probe answers into the six-character `y/n/u` vector in `probe_order`, look up
   `ground_type` / `field_texture` / `disposition` / `tensions`, and write them onto the row. After
   that `analyze.py` runs unchanged — it reads `parsed["ground_type"]`.
   **The derivation must be a lookup, not a reimplementation of the rules.** The 729-row table is
   the contract; a re-implementation that disagrees with any entry is wrong. Unit-test it by
   asserting the shipped table equals the rules, both of which are in the file.
4. Separate mode additionally needs the six solo rows for one image **joined into one vector**
   before derivation, and a row that is missing any of its six probes must derive
   `underdetermined:incomplete` rather than being silently dropped.
5. Re-run `preflight.py --stage smoke` and `--stage retry` — new keys mean a new grammar. `--stage
   decode` is unaffected. `selftest.py`'s "two prompt variants load" assertion holds for the bundled
   pair; the solo set is six and will need its own count.
6. Write to `../../data/oracle-premise/probe-run-1.jsonl`. Never append to run 1 or run 2.

**All eleven new files are inert until step 1 happens** — no existing glob matches
`group-a.probes.v1.*` or `derivation.group-a.probes.v1.json`, so A/B and C/D reruns are untouched
today.

### 13.1 File identity

`prompt_hash` = `sha256(system + "\0" + prompt)`; `schema_hash` = `sha256` of the JSON schema,
sorted keys, compact separators; `file_hash` = `sha256` of the file. Same formulas `common.py` uses.

| file | variant | prompt_hash | schema_hash | file_hash |
|---|---|---|---|---|
| `group-a.probes.v1.bundled-p.json` | P | `d50d969cd243fa62…` | `1b1b764ef30a56b3…` | `83fc30567b282acc…` |
| `group-a.probes.v1.bundled-q.json` | Q | `60dafd0116449d2e…` | `c2b04c3cc8a3ac1d…` | `b85828093f94a3ff…` |
| `group-a.probes.v1.solo-bg-visible.json` | S-bg_visible | `96183e66e273f5bc…` | `7c5832b4331e695c…` | `b536427b549387e2…` |
| `group-a.probes.v1.solo-one-colour.json` | S-one_colour | `f1e484604e5c4ff0…` | `23bcf38542ef777b…` | `ce808801d556d2c5…` |
| `group-a.probes.v1.solo-continuous-change.json` | S-continuous_change | `5aaae24d83a51e5a…` | `8d90894195b2e55c…` | `03173f7104791ae4…` |
| `group-a.probes.v1.solo-separate-areas.json` | S-separate_areas | `9c2e464c00a14fcc…` | `13544d59af4061f4…` | `935d80c2bcff4546…` |
| `group-a.probes.v1.solo-motif-or-material.json` | S-motif_or_material | `65a3415393bcead7…` | `add30cf9e47375b4…` | `d486cf3e78e01e7a…` |
| `group-a.probes.v1.solo-depicted-place.json` | S-depicted_place | `f6d5d9366176ba57…` | `33be8194542ac0c7…` | `bbfb3e4e67a13956…` |

`derivation.group-a.probes.v1.json` — `sha256`
`da67d5ebf0aaab0c593f8fb8e040192e0e688f9dccfcc9bb2fe6b2af391a2fc5`, 729 vectors, 119 379 bytes.
Its `self_check` block carries the tag, disposition and tension counts over the uniform vector
space; a re-implementation that reproduces those counts has almost certainly read the rules right.
Those counts prove totality and reachability — **they are not a prediction about the corpus**, and
the file says so.

`probe_order` for the two bundled variants:

- **P** — `bg_visible`, `one_colour`, `continuous_change`, `separate_areas`, `motif_or_material`,
  `depicted_place`
- **Q** — `one_colour`, `depicted_place`, `continuous_change`, `bg_visible`, `motif_or_material`,
  `separate_areas` (seed 20260803; 4 of 6 probes change position)

The six solo prompts render their probe **byte-identically** to the bundled variants (verified), so
bundled-vs-separate measures bundling and not wording.

---

# 14. Sign-off ledger

| # | change | arm | status |
|---|---|---|---|
| 1 | corrected `ground_type` criterion (§A.2) | criterion | reviewer authored both source rulings; the generalisation needs sign-off |
| 2 | precedence rule (§A.1) | criterion | **new policy** — the one change in C/D the reviewer has not decided in some form |
| 3 | `confidence` stem trigger | criterion | low stakes |
| 4 | the probe set and its wordings (§A.6.1) | probe | **new instrument** — needs sign-off before the human round, since the reviewer will answer these words |
| 5 | the derivation table (§A.6.3, 729 rows) | probe | **needs sign-off** — it is where the criterion's judgement now lives, once, instead of on every image |
| 6 | dropping `confidence` / `ambiguity_note` from the probe arm | probe | measured-driven; reversible in one line |
| 7 | the human probe round (§12) | probe | **needs reviewer time**, ~15 min, and must not be anchored |
| 8 | §A.5 vocabulary split | — | superseded by the probe arm; nothing to sign |

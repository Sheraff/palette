# Premise test — what to run next

**For:** the orchestrator. **Status (2026-08-03):** both **model** arms are still drafted and unrun,
and nothing in `common.py` has changed — but they are now **approved and queued** for a GPU slot, and
the sign-off ledger (§14) is clear. **The human half of the probe arm HAS been run** (§12,
`oracle-probe-gold-1`): 43% exact agreement against the reviewer's own direct answers, below the 63%
floor, concentrated on `flat_field`.
**Reads with:** `README.md` (this directory), `../../ORACLE_QUESTION_SET.md` v2 §A.

**Two model arms are drafted and neither has been run:**

| arm | schema | what it changes | §§ |
|---|---|---|---|
| **criterion arm** — variants C, D | `group-a.v2` | same six-way question, corrected criterion + precedence rule, B's ordering | 1–7 |
| **probe arm** — P, Q, six solo | `group-a.probes.v1.1` | no `ground_type` question at all: six easy probes, tag derived by a committed table | 8–13 |

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

## 7. Reviewer sign-off — settled 2026-08-03

**Nothing here is blocking any more.** This section listed three open sign-offs when it was
written; the reviewer signed two of them on 2026-08-03 and the third was never blocking. The
authoritative row-by-row record is the **§14 sign-off ledger** — this section is its summary and
must not disagree with it.

From `ORACLE_QUESTION_SET.md` v2's changelog — the run can proceed without these, but the *labels*
it produces are only as authorised as the criterion behind them:

1. The corrected `ground_type` criterion (§A.2). **SIGNED OFF 2026-08-03.** The reviewer authored
   both source rulings and signed off the generalisation drawn from them (§14 row 1).
2. The precedence rule (§A.1) — new policy, not transcription, and the one change in C/D the
   reviewer had not already decided in some form. **SIGNED OFF 2026-08-03** (§14 row 2).
3. The `confidence` stem trigger — **not separately signed, and not blocking** (§14 row 3). Low
   stakes, but it is a change to a field the reviewer's own form also carries.

Two further sign-offs landed the same day and belong to the probe arm rather than to this run: the
probe set and its **v1.1** wordings (§14 row 4), and the derivation table — signed **as rules,
skimmed, not read row by row** (§14 row 5). The human probe round itself is **done**, not pending
(§14 row 7).

Not needed before this run: the §A.5 vocabulary split. It is a proposal, deliberately
unimplemented, superseded by the probe arm below, and this run is part of its evidence.

**What the run is actually waiting on is a GPU slot, not a signature** — see the run-approval
paragraph under §14.

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
| probe arm, `group-a.probes.v1.1` | **yes, via the derivation table** | **construct-match caveat:** the reviewer answered the six-way question; the arm answers six probes. The derivation maps the arm onto the reviewer's construct, so a disagreement can be the model, the derivation, or the mapping — three causes, one number. §12's human probe round is what removes this |
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

> **STATUS: RUN, 2026-08-03.** Batch `oracle-probe-gold-1` was built to this spec, released to the
> reviewer, answered in full (180 of 180 answers, 30 artworks, none missing) and analyzed.
> **Headline, from use (b):** probe-derived and direct six-way tags agree **exactly on 13 of 30
> (43%)** — **20 points BELOW the 63% floor**, so the two instruments disagree with each other more
> than the reviewer disagrees with themselves. The disagreement is **patterned, not diffuse: it is
> concentrated on `flat_field`** — where the direct answer was `flat_field` the probes agreed on
> only **2 of 11 (18%)**, against 75% on `shaded_field` and 80% on `multiple_distinct_fields`; the
> probes' most common substitution for a direct `flat_field` is `multiple_distinct_fields` (4).
> Binary-mapped agreement is 16 of 20 (80%), with 10 artworks mapping to no prediction on either
> side. The `unsure` channel went essentially unused (1 of 180), but the ambiguity surfaced through
> the tension flags and `underdetermined` instead: 71% of disagreeing artworks fired one, against
> 46% of agreeing ones.
> **Full numbers, confusion matrix and scoping caveats:**
> `research/v3/data/oracle-validation/probe-gold-1-analysis.json` (batch:
> `probe-gold-1.json`). Two caveats travel with it and are recorded there: the round was **clean on
> the rules** (all 180 probes answered before the derivation table was read, which is the condition
> use (b) needs), but carries a **mild anchoring caveat** — the reviewer had browsed
> `/oracle-review`, which shows their own direct answers for these same 30 artworks, earlier the
> same day, so any agreement measured here is an **upper bound**.
> **No model is involved in this result**, and none of the probe arm's model numbers have been read.
>
> **What is still not done here:** use (a), the probe-native gold, is available but unspent — no VLM
> probe answers exist yet to score against it. See the sequencing note at the end of this section,
> which still holds for the model arm.

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
labelSchemaVersion   group-a.probes.v1.1
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
  means something against the exact words it was answered under. Every prompt file declares
  `referent_preamble` and `unsure_framing` as explicit keys so this can be asserted, not eyeballed.
- **The referent preamble and the unsure framing must be on the page**, once, above the question,
  on every pass — not only in the fixture's `instruction` string. They are what makes the probes
  answerable on a plural background (§A.6.0), and a reviewer who scrolls past them is answering
  v1's question, not v1.1's.
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

1. `SCHEMA_VERSION = "group-a.probes.v1.1"` and `PROMPT_GLOB = "group-a.probes.v1.1.bundled-*.json"`
   (separate mode: `"group-a.probes.v1.1.solo-*.json"`).
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

**All nine new probe-arm files are inert until step 1 happens** — no existing glob matches
`group-a.probes.v1.1.*` or `derivation.group-a.probes.v1.json`, so A/B and C/D reruns are untouched
today.

### 13.1 File identity

`prompt_hash` = `sha256(system + "\0" + prompt)`; `schema_hash` = `sha256` of the JSON schema,
sorted keys, compact separators; `file_hash` = `sha256` of the file. Same formulas `common.py` uses.

| file | variant | prompt_hash | schema_hash | file_hash |
|---|---|---|---|---|
| `group-a.probes.v1.1.bundled-p.json` | P | `7d30fbf945f765ae…` | `1b1b764ef30a56b3…` | `45dc5dddadc550f2…` |
| `group-a.probes.v1.1.bundled-q.json` | Q | `fac31935801d6026…` | `c2b04c3cc8a3ac1d…` | `31b956d9ea721860…` |
| `group-a.probes.v1.1.solo-bg-visible.json` | S-bg_visible | `ed7c82abe3569e90…` | `7c5832b4331e695c…` | `5121c921c4cb7071…` |
| `group-a.probes.v1.1.solo-one-colour.json` | S-one_colour | `34561290aa4639f2…` | `23bcf38542ef777b…` | `15e57f3e751b9bcf…` |
| `group-a.probes.v1.1.solo-continuous-change.json` | S-continuous_change | `2947268257917cb9…` | `8d90894195b2e55c…` | `506e3dc203367263…` |
| `group-a.probes.v1.1.solo-separate-areas.json` | S-separate_areas | `d878c7a7139efa9b…` | `13544d59af4061f4…` | `e204c7f8f95ed22c…` |
| `group-a.probes.v1.1.solo-motif-or-material.json` | S-motif_or_material | `5b44b31541758111…` | `add30cf9e47375b4…` | `bb9130ab98ebed79…` |
| `group-a.probes.v1.1.solo-depicted-place.json` | S-depicted_place | `5f08a567803b7b91…` | `33be8194542ac0c7…` | `12d678b525782565…` |

The `schema_hash` column is **unchanged from the deleted v1 files** — the JSON schemas are
identical, because v1.1 changed wording only. Every `prompt_hash` and `file_hash` changed.

Each prompt file additionally declares `referent_preamble`, `unsure_framing` and
`derivation_schema_version` as explicit keys, so an implementation can assert the shared blocks
match without parsing the prompt text.

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

### 13.2 Superseded: `group-a.probes.v1` prompt files

The eight v1 prompt files were **deleted, not frozen.** Freezing exists to protect collected data,
and v1 produced none — no inference, no human answer, no row anywhere. Leaving a known-defective
variant loadable in `prompts/` is a hazard with no offsetting benefit, and the v1 glob
(`group-a.probes.v1.bundled-*.json`) now matches nothing, which is the correct state.

Their identities, kept so the record survives the files:

| file (deleted) | prompt_hash | file_hash |
|---|---|---|
| `group-a.probes.v1.bundled-p.json` | `d50d969cd243fa62…` | `83fc30567b282acc…` |
| `group-a.probes.v1.bundled-q.json` | `60dafd0116449d2e…` | `b85828093f94a3ff…` |
| `group-a.probes.v1.solo-bg-visible.json` | `96183e66e273f5bc…` | `b536427b549387e2…` |
| `group-a.probes.v1.solo-one-colour.json` | `f1e484604e5c4ff0…` | `ce808801d556d2c5…` |
| `group-a.probes.v1.solo-continuous-change.json` | `5aaae24d83a51e5a…` | `03173f7104791ae4…` |
| `group-a.probes.v1.solo-separate-areas.json` | `9c2e464c00a14fcc…` | `935d80c2bcff4546…` |
| `group-a.probes.v1.solo-motif-or-material.json` | `65a3415393bcead7…` | `d486cf3e78e01e7a…` |
| `group-a.probes.v1.solo-depicted-place.json` | `f6d5d9366176ba57…` | `bbfb3e4e67a13956…` |

**If any of these hashes ever appears in a results row, that run is invalid** — it was produced by
a prompt that presupposed a singular background.

---

# 14. Sign-off ledger

**Updated 2026-08-03.** The reviewer signed off rows 1, 2, 4 and 5 on that date, and row 7 has been
run — see §12 for the result. Nothing on this ledger is now blocking.

| # | change | arm | status |
|---|---|---|---|
| 1 | corrected `ground_type` criterion (§A.2) | criterion | **SIGNED OFF 2026-08-03.** Reviewer authored both source rulings and signed off the generalisation drawn from them |
| 2 | precedence rule (§A.1) | criterion | **SIGNED OFF 2026-08-03.** New policy, and the one change in C/D the reviewer had not decided in some form — now decided |
| 3 | `confidence` stem trigger | criterion | low stakes; not separately signed, and not blocking |
| 4 | the probe set and its wordings, **v1.1** (§A.6.1) | probe | **SIGNED OFF 2026-08-03**, before the human round, which is what the sign-off was needed for. The reviewer then answered these exact words in `oracle-probe-gold-1` |
| 5 | the derivation table (§A.6.3, 729 rows) | probe | **SIGNED OFF 2026-08-03 — with a stated limit: the reviewer signed off the derivation RULES, skimmed, not a row-by-row reading of all 729 rows.** The table is asserted equal to the rules by unit test, so the rules are the thing that was signed |
| 6 | dropping `confidence` / `ambiguity_note` from the probe arm | probe | measured-driven; reversible in one line |
| 7 | the human probe round (§12) | probe | **DONE 2026-08-03** — batch `oracle-probe-gold-1`, released and answered in full (180/180), then analyzed. Result: 43% exact agreement with the reviewer's own direct answers, below the 63% floor, concentrated on `flat_field`. Recorded anchoring caveat, so the rate is an upper bound. Full numbers: `research/v3/data/oracle-validation/probe-gold-1-analysis.json` |
| 8 | §A.5 vocabulary split | — | superseded by the probe arm; nothing to sign |

**Run approvals, as of 2026-08-03.** The **criterion arm (variants C, D)** and the **probe arm's VLM
runs** are **approved and QUEUED** — they are waiting on a GPU slot from the orchestrator, not on a
sign-off. The GPU is single-owner (`CONVENTIONS.md`): no agent starts either run. The sequencing in
the header still governs — criterion arm (~50 min) first, then probe bundled (~50 min), then probe
separate on the gold-30 (~30 min), the last gated on the second. The human half of the probe arm
(row 7) is already banked, so the probe-native gold is in place before any model number is read.

---

# 15. Groups B, C, D and E — the first pilot (`group-bcde.v1`)

**Status (2026-08-03):** drafted, unrun, **not approved** — a new instrument on questions no run has
ever touched, so it needs the sign-offs in §15.10 and then a GPU slot, in that order. Nothing here
competes with the two group-A arms; it is a different question set answering different decisions,
and it should be queued **after** them, because they are already approved and they are the ones that
decide whether the oracle is worth going corpus-wide with at all.

**Scope note.** An earlier draft of this section covered nine questions as `group-bcd.v1`. The
reviewer extended it the same day, before anything ran, to fold in **group E** and a **new
question, `subject_kind`**. The nine-question files were deleted rather than frozen — §13.2's
precedent, and for the same reason: freezing exists to protect collected data, and they produced no
inference, no human answer and no row anywhere. Their identities are kept in §15.2 so the record
survives the files.

## 15.1 What this is, and what it is not

Thirteen questions across four groups, all of them beyond SAM's reach and none of them ever piloted:

| group | fields | the decision each feeds |
|---|---|---|
| B — text | `has_text`, `text_roles`, `text_dominance` | foreground candidacy, and whether text can claim the foreground at all |
| C — provenance | `overlays`, `physical_media_scan` | identity exclusion: what is on the cover but not *of* it |
| D — subject and identity | `has_dominant_subject`, **`subject_kind`**, `subject_area_band`, `has_signature_color`, `signature_carrier` | figure/ground at the coarsest grain, which noun SAM should be asked to mask, and which evidence lane should supply the accent |
| E — medium and character | `medium`, `color_character`, `grain_or_noise` | stratified evaluation and confound control; turns anecdotal failure classes into counted ones |

`ORACLE_QUESTION_SET.md` marks B, C and E "Unchanged from v1. Not piloted", and carries
`[UNCALIBRATED]` reliability guesses for all four groups (B high, C high, D medium, E none stated).
**Nothing below is a measurement.** This section is the plan for producing the first one, and its
main job is to say — before any number exists — what would count as the instrument working and what
would count as it failing.

**`subject_kind` is the one genuinely new question**, added to `ORACLE_QUESTION_SET.md` as §D.1 in
the same revision and flagged there as needing sign-off. Its purpose is different in kind from
everything else in this set: **SAM masks the nouns it is given, and the VLM is what knows which noun
to give it.** Pipeline §8.3's concept-prompt union is fixed and hand-written (`text`, `lettering`,
`logo`, `sticker`, `person`, `face`), so it can only find nouns someone thought of in advance —
which is how the residual round ended up with **a car the masks missed**. One enum, inside a decode
that is already happening, makes the concept prompt conditional on the artwork.

**Why one document rather than four.** Image encode and prefill dominate cost at ~10.5 s per
inference `[MEASURED premise-run-1]`; decode length is negligible. The longest *legal* answer to all
thirteen questions is **169 tokens (E) / 179 tokens (F)** against `MAX_TOKENS` 256 `[MEASURED, the
pinned model's tokenizer, CPU only]`. Four schemas would cost four runs for the same answers, and
would additionally destroy the gate orders §15.2 depends on.

**Headroom warning, since this is the number that moved.** Going from nine questions to thirteen
took the worst case from 129/134 tokens to 169/179 — about **70% of `MAX_TOKENS`**. That is still
safe, and the *typical* answer is far shorter, but a fourteenth question is no longer free:
**anything added to this schema must re-measure the worst case**, and `selftest.py` asserts it
against the cap on every run so the ceiling cannot be crossed silently.

## 15.2 The two orderings, and what is held fixed

Design rule 6 says question order matters and was measured large (23% → 53%). It has been tested
exactly once, in a comparison confounded with wording. E and F apply it to a fresh question set and
put its two readings against each other:

- **E — rule 6 taken globally.** Every question that can be answered by *naming what is on the
  cover* comes before every question that requires a *judgement about what it means*, with group
  E's three medium-and-colour facts at the very front as the cheapest and most global of all.
  Order: `medium`, `color_character`, `grain_or_noise`, `physical_media_scan`, `overlays`,
  `has_text`, `has_dominant_subject`, `subject_kind`, `subject_area_band`, `has_signature_color`,
  `text_roles`, `text_dominance`, `signature_carrier`.
- **F — rule 6 taken locally.** Each judgement sits immediately after its own gating question, and
  the question set's group blocks are kept intact. Order: `has_text`, `text_roles`,
  `text_dominance`, `overlays`, `physical_media_scan`, `medium`, `color_character`,
  `grain_or_noise`, `has_dominant_subject`, `subject_kind`, `subject_area_band`,
  `has_signature_color`, `signature_carrier`.

**Twelve of the thirteen fields change position.** Held fixed on purpose:

1. **`signature_carrier` is last in both.** It is the field §D says the accent role turns on, and
   holding one field's position constant across both renderings makes it a control: if it moves
   between E and F, something other than order moved it. This is the role `enclosure` plays in the
   probe arm's P/Q pair (§A.6.2). It is also **why F puts group E's block between the provenance
   and subject blocks** rather than at the end, where the question set's own group sequence would
   have put it: keeping the control fixed is worth more than following that sequence exactly, and
   the swap is recorded here rather than left to be noticed.
2. **`subject_kind` sits immediately after its gate in both** — position 8 in E (inside the
   describe block, which is where it belongs: it names a noun, it does not judge one), position 10
   in F. Its distance from `has_dominant_subject` is zero in both, so the pilot does *not* test
   ordering for the new question. That is deliberate: a brand-new question should be measured under
   its best-guess placement before its placement is varied.
3. **Five gate orders are forced, not chosen, and identical in both:** `has_text` before
   `text_roles` and `text_dominance`; `has_dominant_subject` before **`subject_kind`** and before
   `subject_area_band`; `has_signature_color` before `signature_carrier`. Under constrained
   decoding the JSON property order **is** the generation order, so a conditional field generated
   before its condition would be answered blind.
4. **Enum option order** inside every question is the question set's own order, byte-identical
   between E and F. No option-order hypothesis is under test here.
5. **Eight shared blocks** — the definitions of text, of an added-on element, of the main subject,
   of one-picture-one-medium, of the signature colour, plus the list rule, the no-measuring rule
   and the anti-coherence line — are byte-identical between E and F and declared as explicit
   `shared_blocks` keys so the identity is asserted by `selftest.py`, not eyeballed. Everything
   else (opening line, every stem, every gloss, every JSON key) is independently written, and
   `selftest.py` asserts the two prompts share **no line at all** outside those blocks. This is
   the C/D pattern.

**Stated with its confound, as A-vs-B was:** E and F differ in **both** order and wording, so a
difference between them is "the E rendering wins", with ordering as the deliberate structural
difference and the only one with a mechanism behind it. A third rendering keeping one variant's
order is what would separate them, and it is not worth drafting before the pilot says whether either
rendering is answerable at all.

**Referents were checked against a plural case before shipping.** `ORACLE_QUESTION_SET.md` §A.6.0
made this a standing rule after v1's probes presupposed a singular background. Two blocks do that
work here:

- `THE MAIN SUBJECT` carries *"when there is more than one, take them all together — except where a
  single kind of thing is asked for, and then name the kind of the largest one."* This is what makes
  `subject_kind` answerable on a cover holding a person **and** a car — which is the motivating case
  itself — instead of a presupposition failure.
- `ONE PICTURE, ONE MEDIUM` does the same job for `medium`, which competes with itself on a
  photographed collage or a photograph with type over it. It is the precedence rule §A.1 had to
  learn the expensive way, applied a priori this time.

### File identity

`prompt_hash` = `sha256(system + "\0" + prompt)`; `schema_hash` = `sha256` of the JSON schema with
sorted keys and compact separators; `file_hash` = `sha256` of the file. Same formulas `common.py`
uses.

| | variant E | variant F |
|---|---|---|
| file | `prompts/group-bcde.v1.variant-e.json` | `prompts/group-bcde.v1.variant-f.json` |
| `prompt_hash` | `1cbd4894e8b2f118ebfe47557afbda309e62a5479b7278b130fa03a7612d7a1f` | `3a50829af99684eb3b11642ad7df9c1e99d165df9a350033b28113583c3e6891` |
| `schema_hash` | `b169bc565982ad5b961285cf92e80d643bdc2810f3cbbde49d31d8f11eea130c` | `9386abfb170b6465339f96ec8dbb48322d8fc8906da7674c2f1c11b58996ee21` |
| `file_hash` | `0e0fe253a0f5b956a3351f6e4a693e05a255063cd4bbf03b927a7423368f9730` | `e0d8597ed1da0424c5c0bc23390cb485391548af396a9d3e3c1935bd5d229010` |
| prompt length | 6 092 chars | 5 749 chars |

JSON keys, in generation order:

- **E** — `picture_kind`, `colour_range`, `texture_noise`, `packaging_shot`, `stickers`,
  `lettering`, `subject_count`, `subject_is`, `subject_size`, `signature_colour`,
  `lettering_kinds`, `lettering_weight`, `signature_source`
- **F** — `words`, `word_kinds`, `word_prominence`, `added_marks`, `packaging_photo`, `made_how`,
  `colour_spread`, `speckle`, `main_thing`, `main_thing_kind`, `main_thing_area`,
  `defining_colour`, `defining_colour_where`

The two variants use **disjoint JSON key names**, so a row cannot be misattributed even if its
`prompt_variant` column were lost.

**Superseded and deleted: the nine-question `group-bcd.v1`.** Drafted 2026-08-03, extended the same
day, never registered against a run, never executed. Identities kept so the record survives the
files:

| file (deleted) | `prompt_hash` | `file_hash` |
|---|---|---|
| `group-bcd.v1.variant-e.json` | `684b3623d4472b02…` | `572570503238309e…` |
| `group-bcd.v1.variant-f.json` | `fa65d8dd73821ae7…` | `baa79cdafd7db472…` |

These are **not** added to `common.py`'s superseded-hash poison table, and the reason matters: that
table exists to invalidate *rows*, and no row carrying these hashes can exist, because the set was
never registered against a run and the schema-version guard has been in place from the first commit
of the registry entry. `selftest.py` asserts instead that no `group-bcd.v1.*` file is on disk.

**No group-A file was touched.** `selftest.py` pins the `sha256` of all thirteen pre-existing prompt
files (A, B, C, D, the eight probe files, the derivation table) and fails if any byte moves.

## 15.3 Machinery: the registry entry, and the multi-select grammar

The criterion arm needed two lines of `common.py` (§5) and the probe arm needed five (§13). This set
needs **one registry entry plus one narrowly-scoped capability**, because it is the first schema
group with a question whose answer is a *list*.

**1. Registry entry** — added, nothing existing modified:

```python
"group-bcde.v1": ("group-bcde.v1", "group-bcde.v1.variant-*.json"),
```

The schema-version guard is unchanged and needs nothing new: `load_prompt_variant` asserts each file
declares `group-bcde.v1`, and `run_premise.py` refuses to write into a file that already holds rows
of another schema version. **Verified:** pointing a run of this set at a file holding one
`group-a.v1` row fails at startup with the "mixing question sets in one file is a reporting trap"
assertion, before the model is loaded.

**2. Multi-select support**, three additive changes, all inert for every group-A variant:

| where | change | effect on A/B, C/D, probes |
|---|---|---|
| `PromptVariant` | new field `multi_select_fields: tuple[str, ...] = ()` | empty; nothing reads it |
| `load_prompt_variant` | reads `multi_select_fields` from the document; for those fields asserts array-of-enum shape, `minItems == 1`, and **no `uniqueItems`** | the pre-existing single-value assertion is unchanged and is the branch every group-A field still takes |
| `validate_and_canonicalize` | one branch, entered only for a declared multi-select | never entered |

`selftest.py` asserts directly that **no group-A variant declares a multi-select**, and that all
thirteen older prompt files are byte-identical, so "additive" is checked rather than claimed.

### Does llguidance support array-of-enum? Yes — verified, CPU only

`mlx-vlm` 0.6.8's constrained path is `llguidance` 1.7.6 via `build_json_schema_logits_processor`.
Grammar construction there is `llguidance.JsonCompiler(...).compile(schema)` — **pure CPU, no
weights, no Metal** — so this was verifiable without a GPU slot, and it is now a permanent
`selftest.py` check:

- both `group-bcde.v1` schemas compile;
- both grammars **validate against the pinned model's own tokenizer** (loaded from the pinned
  snapshot, tokenizer files only);
- walking the **longest legal answer** token by token through an `LLMatcher` is accepted and ends in
  an accepting state — E 169 tokens, F 179 tokens, against `MAX_TOKENS` 256;
- an off-vocabulary value is rejected mid-decode;
- the grammar **enforces property order**, which is the mechanism design rule 6 rests on: feeding
  the same thirteen fields in a different order is rejected.

**One backend limitation, and it shapes the schema.** `uniqueItems` is **not implemented** by
llguidance — declaring it raises `Unimplemented keys: ["uniqueItems"]` at compile time. So the
grammar **cannot** forbid a repeated value in a list, and neither prompt file declares it.
`selftest.py` asserts the limitation still holds, so if a future llguidance implements it, the check
fails loudly and the schema can be tightened deliberately rather than by accident.

**Still owed to the pre-flight, not to this section:** the full `build_json_schema_logits_processor`
path imports `mlx.core` and defines a Metal kernel, so it is not something an agent may exercise
while the GPU is single-owner. `preflight.py --stage retry --prompt-set group-bcde.v1` is the check
that closes it, and it must be run before the pilot (§15.5).

## 15.4 Vocabularies: five added values, and what is deliberately *not* a failure

The thirteen vocabularies are the question set's, verbatim, plus five values and no more:

| field | added | why |
|---|---|---|
| `text_roles` | `not_applicable` | a fixed JSON schema cannot make a field conditional without a union. Covers both "no text" and "text, but no kind can be named" — it does not need to distinguish them, because `has_text` is generated first and already does (`no` vs `illegible_at_this_size`) |
| `text_dominance` | `not_applicable` | same, conditional on `has_text` |
| `subject_kind` | `not_applicable` | same, conditional on `has_dominant_subject == none` |
| `subject_area_band` | `not_applicable` | same, conditional on `has_dominant_subject == none` |
| `signature_carrier` | `not_applicable` | same, conditional on `has_signature_color == no` |

Precedent and shape are group-a.v1's `not_applicable` on `shading_geometry`, which every variant
since has carried. `overlays` keeps the question set's own **`none`** rather than gaining a
`not_applicable`, because there `none` is a real observation ("I looked, there are none"), not an
inapplicability.

**`subject_kind` is single-select, and that is a limitation with a test attached rather than a
settled choice.** A cover holding a person *and* a car has two kinds and one slot; the shared block
resolves it by naming the largest. This is design rule 8's shape — a slot that cannot record the
answer it is asking for — and it is precisely the shape of the motivating case, so the pilot is
**pre-registered to report `subject_kind` conditioned on `has_dominant_subject == multiple`**
(§15.6). If mixed-kind covers are common, the successor is a multi-select, and the machinery for
that already exists in this schema.

**`has_text` keeps `illegible_at_this_size`**, unchanged, and it is the **only** resolution escape
hatch anywhere in groups B–E. Pipeline §7.1 and `PHASE_0_DECISIONS.md` §7: a rendition below a
question's resolution floor must never yield a confident negative. Note what is *not* known — the
measured floors cover **group-A questions only**; no floor has been measured for any question in
this schema. §15.6 therefore reports this value's rate **by resolution tier**, and a zero rate
across all 43 thumbnail-tier images is a finding about the instrument, not a clean bill of health.

**Two questions sit close to the computable line and are flagged for it.** `color_character` and
`grain_or_noise` could plausibly be answered by a pixel statistic, which is the one rule in
`ORACLE_QUESTION_SET.md`'s "deliberately NOT asked" list they graze. They are asked anyway because
§E asks them, because their use is evaluation-side stratification rather than an algorithm input,
and because `grain_or_noise` is explicitly a JPEG-artifact confound control. **Pre-registered
consequence: if a cheap computed measure reproduces either of them, that question is deleted from
the next schema and the statistic is used instead.**

**Two defects are counted, not failed.** The grammar cannot prevent either, greedy decoding means a
retry reproduces them exactly, and failing the row would discard the other twelve answers to punish
one. Both are recorded verbatim and reported as named rates, which is the treatment
`ORACLE_QUESTION_SET.md` §A.6.6 established for self-contradiction:

- **repeated value** in a list (`["label_logo", "label_logo"]`);
- **exclusive value beside another** (`["none", "watermark"]`, `["not_applicable", "artist_name"]`).

What *is* a hard validation failure, and therefore a `parse_failed` row: a multi-select answered
with a bare string, an empty list, or a value outside the vocabulary. All three are impossible under
the grammar, so any of them firing means the grammar path regressed — which is exactly what the
check is for.

## 15.5 The pilot run

**Item set: the full eval set, unchanged. 142 images × 2 variants = 284 inferences.** Same file,
same `build-eval-set.ts` output, same population as run 1 and as both group-A arms, so every
stratification (43 thumbnail ≤320 px, 88 standard, 11 large >640 px) and every future join is exact.
**Do not select a subset**, and in particular do not select on any group-A result — these questions
have nothing to do with the gradient boolean, and a set chosen by another instrument's difficulty is
not a sample of anything.

**Cost: ~50 min at burst, ~1.5 h if the machine throttles.** Adding four questions did **not** move
this. The inference count is unchanged at 284, the images are unchanged, and the extra decode is
~40–45 tokens per answer against a ~10.5 s image encode — under 2% of wall clock. **Thirteen
questions cost what nine cost, and both cost what four cost**, which is the whole argument for
bundling and is why group E was worth folding in rather than scheduling separately.

**Output: `../../data/oracle-premise/group-bcde-pilot-1.jsonl`.** Never append to run 1, run 2 or
the probe run; the schema-version guard enforces this, but the naming should not rely on it.

**Pre-flight first, both stages, because new keys mean a new grammar:**

```
cd research/v3/oracle/premise
.venv/bin/python selftest.py
.venv/bin/python preflight.py --stage smoke --prompt-set group-bcde.v1
.venv/bin/python preflight.py --stage retry --prompt-set group-bcde.v1
```

`--stage decode` does not need redoing; the images are unchanged. `--stage retry` is the one that
matters here — it is the check that `constrained_decoding_available` is true for this schema and
that the retry/`parse_failed` path fires, and it is the first time the array-of-enum grammar is
built through `mlx-vlm`'s own code path rather than through `llguidance` directly.

**Launch (the orchestrator's GPU queue):**

```
cd research/v3/oracle/premise
./supervise.sh --prompt-set group-bcde.v1 --out ../../data/oracle-premise/group-bcde-pilot-1.jsonl
```

Resume is automatic and idempotent: the same command re-run picks up whatever is missing, because
`row_key` carries the prompt hash. Exit 3 from the worker is a canary mismatch — the supervisor will
not restart, and the run is not a usable artifact.

**Dry run, for the queue estimate, loads no model:**

```
.venv/bin/python run_premise.py --prompt-set group-bcde.v1 \
    --out ../../data/oracle-premise/group-bcde-pilot-1.jsonl --dry-run
```

**Analysis is not yet built, and deliberately so.** `analyze.py` is group-A-shaped: it reads
`parsed["ground_type"]`, maps it to the gradient boolean and scores it against the accepted
palettes' flag. Not one of those exists for groups B–E — there is **no ground truth of any kind**
for these thirteen questions, which is why §15.9 exists. The pilot's analysis is therefore a
separate step whose metrics are pre-registered in §15.6 and §15.7 below, to be built against the
run's rows once they exist and never before, so it cannot be shaped by them.

## 15.6 Health metrics, pre-registered

Stated before the run so they cannot be moved afterwards. None of these needs ground truth; all are
computable from the 284 rows alone. **Read them in this order** — a schema that fails 1 or 2 makes
every later number meaningless.

### 1. Parse rate — is the instrument even working?

| metric | bar |
|---|---|
| rows with `status == "ok"` | **≥ 99%** (run 1 achieved essentially 100% across 299 rows) |
| rows with `parse_failed` | **0.** Every hard validation failure is impossible under the grammar, so one is a grammar regression, not a model error |
| `attempts > 1` | **0**, for the same reason |
| `generation_tokens` at or near `MAX_TOKENS` | **0.** At 169/179 worst case this should never bind, and a truncated decode would look like a parse failure with a plausible cause |

Below 95% ok, stop and read `raw_text`: the answer is in the bytes, and under greedy decoding a
repeated failure is an infrastructure fact rather than bad luck.

### 2. Distribution sanity — did each question find its answer, or refuse it?

The failure signature named in advance: **a question whose answers are all one value.** That is what
`confidence` did under group-a.v1 (298 of 299 said `high`), and it is not visible from an agreement
number — an all-one-answer field agrees with itself perfectly.

Two different bars, because two different kinds of question are in this set:

**(a) Questions where a skewed corpus is genuinely plausible** — `has_text`, `physical_media_scan`,
`overlays`, `grain_or_noise`. Here a high share on one value may simply be true, so the bar is on
the *minority cells*: **a value that fires zero times across 142 images is reported as possibly
unanswerable**, with its stem quoted. Priors, stated as priors and not as measurements
`[UNCALIBRATED]`:

| field | expected shape | what would be alarming |
|---|---|---|
| `has_text` | majority `yes` — album covers carry titles and artist names | `yes` under 60%, or `illegible_at_this_size` never firing on any of the 43 thumbnail-tier images |
| `physical_media_scan` | **rare** — the corpus is digital artwork renditions | above ~15%, which would mean the question is reading "photograph" rather than "photograph *of packaging*" |
| `overlays` | `none` common, the four positive values sparse but non-zero | `none` at 100%, i.e. the question can only say no |
| `grain_or_noise` | a real minority, concentrated on photographs and illustrations | above ~60%, which would mean it is reading JPEG artifacts rather than intentional grain — the exact confound §E names it for |

**(b) Questions where the corpus should genuinely spread** — `text_roles`, `text_dominance`,
`has_dominant_subject`, `subject_kind`, `subject_area_band`, `has_signature_color`,
`signature_carrier`, `medium`, `color_character`. Here the probe arm's non-degeneracy bar applies:
**no single value on more than 85% of rows.** A field over that is reported as degenerate and is a
candidate for deletion at the pilot, which is what `ORACLE_QUESTION_SET.md`'s organizing rule
promises ("a question that feeds no decision gets deleted at the pilot").

**Three breakdowns to report unconditionally**, each of which uses only the run's own rows and each
of which can only be produced because the questions were bundled:

1. **`has_text` and `illegible_at_this_size` by resolution tier.** It is the only resolution
   instrument in this schema and no floor has ever been measured for it.
2. **`grain_or_noise` crossed with `medium`.** Grain on `photograph` should exceed grain on
   `typography_only` by a wide margin. If it does not, the question is reading compression, and §E's
   own stated confound has become the measurement.
3. **`subject_kind` conditioned on `has_dominant_subject`.** Two things: the `multiple` slice is
   where the single-select limitation bites (§15.4), and the `none` slice must be
   `not_applicable` — see contradiction 9 below.

### 3. Gate consistency — the instrument this schema has that group A's never did

Five conditional fields sit behind three gates, and the gate is always generated first. That makes a
contradiction *possible*, which — exactly as in §A.6.6 — is a feature, not a defect: a schema that
cannot contradict itself is missing an instrument. Count each, as a rate over ok rows:

| # | contradiction | reading |
|---|---|---|
| 1 | `has_text ∈ {no, illegible_at_this_size}` but `text_roles ≠ [not_applicable]` | the model named a kind of text it had just said it could not read |
| 2 | `has_text ∈ {no, illegible_at_this_size}` but `text_dominance ≠ not_applicable` | same, for weight |
| 3 | `has_text == yes` but `text_roles == [not_applicable]` | text seen, no kind nameable. Legitimate on odd covers; a high rate means the role vocabulary does not cover the corpus |
| 4 | `has_dominant_subject == none` but `subject_area_band ≠ not_applicable` | a size for a subject it said was absent |
| 5 | `has_signature_color == no` but `signature_carrier ≠ not_applicable` | a carrier for a colour it said does not exist |
| 6 | `has_signature_color == yes` but `signature_carrier == not_applicable` | the accent question refusing itself — the single most decision-relevant contradiction in the set |
| 7 | exclusive value beside another, in either multi-select | §15.4 |
| 8 | repeated value in either multi-select | §15.4 |
| 9 | `has_dominant_subject == none` but `subject_kind ≠ not_applicable` | a noun for a subject it said was absent. **The one that matters most for the SAM handoff**: it is the shape of a bad concept prompt |
| 10 | `has_dominant_subject ≠ none` but `subject_kind == not_applicable` | a subject it can see and cannot name — a vocabulary gap, and the argument for a seventh value |
| 11 | `medium == typography_only` but `has_text ∈ {no, illegible_at_this_size}` | type-only artwork with no readable type |
| 12 | `medium == typography_only` but `has_dominant_subject ≠ none` | type-only artwork with a subject in it |

Rows 11 and 12 are free: they cost nothing to compute, they need no ground truth, and they are a
**cross-group** consistency check that no single-group schema could have produced. They are the best
argument in this section for bundling four groups rather than running them apart.

**Pre-registered ceiling: total contradiction rate ≤ 10% of ok rows**, the same ceiling the probe
arm's `underdetermined` carries. Above that, the ordering is not doing the work design rule 6 claims
for it, and the honest conclusion is that the gates need to be separate inferences rather than
earlier properties.

## 15.7 Inter-variant agreement, per question

The uncertainty instrument that actually works (design rule 7): disagreement between renderings, per
question, over the 142 images both answered.

**Eleven single-value questions:** raw agreement **and** Cohen's κ, quoted together and never
separately — a field where one value dominates can post 0.90 raw at κ 0.0, which is the arithmetic
of a near-constant and is precisely the §15.6-(2) failure wearing a good number.

**The two multi-selects need three numbers, not one**, because "agreement" is ambiguous for a set:

| metric | definition |
|---|---|
| exact-set agreement | E's set equals F's set, order-insensitive and duplicate-insensitive |
| mean Jaccard | \|E ∩ F\| / \|E ∪ F\| per row, averaged — the graceful version of the above |
| per-value κ | one presence/absence κ per vocabulary value, e.g. "did both variants see a `label_logo`" |

The per-value column is the one that localises: it is how "the model cannot tell a
`badge_or_sticker` from a `label_logo`" becomes a fact rather than an impression, and a single
set-level number can never show it.

**Pre-registered bars**, calibrated against what group A actually produced (`enclosure` raw 0.87 /
κ 0.60 was its most reliable field; `field_texture` raw 0.66 / κ 0.45 its worst):

| | bar | reading if missed |
|---|---|---|
| `has_text`, `physical_media_scan`, `medium` | κ ≥ 0.70 | the three questions the set expects to be easy. Under 0.70 the premise that "cheap describable facts are reliable" is wrong for this model, and the ordering rationale in §15.2 loses its foundation |
| `has_dominant_subject`, `has_signature_color`, `text_dominance`, `subject_area_band`, `color_character`, `grain_or_noise` | κ ≥ 0.45 | at or below group A's worst field; report and consider deletion |
| `subject_kind` | κ ≥ 0.60, **reported on the `has_dominant_subject != none` subset with its n** | it is a naming question, not a judgement, so it should be nearer the easy group than the hard one. Computed over all rows it is inflated by agreeing `not_applicable`s, and that number must not be quoted alone |
| `signature_carrier` | κ ≥ 0.45, **reported on the `has_signature_color == yes` subset with its n** | the whole point of the field. Same inflation caveat |
| `text_roles`, `overlays` | exact-set ≥ 0.60, mean Jaccard ≥ 0.75, and **no vocabulary value below κ 0.40** | the per-value floor is a gate on the *value*, not on the field, exactly as the probe arm's 90% bar is a gate on the probe |

**Also report, with no bar attached:** the E-vs-F difference in the §15.6-(3) contradiction rate. If
one ordering contradicts itself materially less than the other on the same images, that is design
rule 6 measured on a fresh question set — the cleanest reading available from this run, since it
needs no ground truth and no human.

### `subject_kind` is not finally judged here

Its bar above is a *screen*, not the verdict. `subject_kind` exists to hand SAM a noun, so the
question it actually has to answer is **"does the named mask land?"** — run SAM with the
artwork's own `subject_kind` added to pipeline §8.3's concept union and count how often that
produces a mask the fixed union missed. That is the **SAM workstream's** measurement, not this one's;
this section owes it the labels and a clean statement of what they are. Recorded here so the handoff
is not left implicit: a `subject_kind` at κ 0.55 that recovers the missed car is worth more than one
at κ 0.85 that names nothing SAM did not already have.

## 15.8 What would make this schema wrong

Stated now, so it is not rationalised later.

- **A question with no spread.** §15.6-(2). Delete it; the organizing rule already promises this.
- **`signature_carrier` refusing itself.** Contradiction 6 at any material rate means the accent
  question is being answered by the gate rather than by the image, and the field's premise — that a
  model can name *which lane* carries a cover's colour — is unsupported.
- **`subject_kind` that SAM cannot use.** Contradictions 9 and 10, or a distribution collapsed onto
  `person`, mean the field is not doing the one job it was added for. It is the newest question here
  and it has the least standing; it should be the first deleted, not the last.
- **A computed statistic reproducing `color_character` or `grain_or_noise`.** §15.4. That is not a
  failure of the pilot, it is a success of the cheaper instrument, and the question goes.
- **Multi-selects that only ever return one value.** If `text_roles` is a singleton on ~every row,
  the array machinery bought nothing and the field should be a plain enum in v2.
- **Order dominating everything.** If E and F disagree on more than ~35% of rows on most questions,
  the answers are being produced by the prompt's shape rather than by the artwork, and the right
  response is fewer questions per decode, not better wording. **This is the risk the extension to
  thirteen questions raises**, and it is the reason the contradiction ceiling in §15.6-(3) is worth
  reading before any agreement number.
- **A high `not_applicable` share on `text_roles` while `has_text == yes`.** Design rule 8
  reappearing in group B: a value that maps to no decision is a value that can refuse the question.
  Count it **before** reading any agreement number.

## 15.9 The follow-up reviewer validation round — batch spec, NOT built

**Do not build this until the pilot has run.** Half its value is in choosing which questions are
worth a reviewer's time, and that choice is what the pilot's numbers are for. It is specified now,
in full, so that the pilot cannot be read as if a human round were impossible, and so the spec is on
record before any model answer could shape it.

**Why it is needed at all.** There is **no ground truth of any kind** for these thirteen questions —
no accepted-palette flag to lean on the way group A leans on the gradient boolean, no reviewer
answers, nothing. Inter-variant agreement (§15.7) measures self-consistency, and a model can be
perfectly self-consistent and perfectly wrong. Until a human answers these questions, every number
in this pilot is a statement about the instrument and none is a statement about the artworks.

```
batchId              oracle-group-bcde-gold-1
purpose              oracle-validation
fixtureVersion       oracle-validation-1
labelSchemaVersion   group-bcde.v1
seed                 20260803
items                260  = 20 artworks x 13 questions
serveOrder           thirteen contiguous passes, one per question, shuffled within each pass
                     (validateFixture rejects interleaved questions)
questions            thirteen; every vocabulary is <= 7 values, inside MAX_ENUM_ANSWERS = 9
```

**Selection — 20 artworks, drawn by a seeded rule that does not look at any model answer.**
Stratified over the eval set's resolution tiers in proportion (6 thumbnail, 12 standard, 2 large),
seeded `20260803`, from the 142. Explicitly **not** the gold-30: that set is defined by group-A
oracle-vs-flag contradiction, which has nothing to do with text, provenance, subject or medium, and
reusing it would import another instrument's hard tail for no benefit. **Do not re-select on E-vs-F
disagreement** — §3's rule applies unchanged. A *second*, separately-reported round on disagreement
artworks is legitimate afterwards, and must be labelled as the conditioned sample it is.

**Cost, and the lever to pull if it is too much.** 260 items at the measured ~7 s/item is **~25–30
minutes**, against `oracle-probe-gold-1`'s 180 items and ~10–15 minutes. Two ways down, and the
pilot decides which:

| lever | shape | cost |
|---|---|---|
| **drop questions** — ask only what the pilot showed to be worth validating | e.g. 8 questions × 20 artworks = 160 items | ~15 min. **Preferred**: this is what the pilot is for |
| **drop artworks** — keep all thirteen questions, 14 artworks | 182 items, the probe-gold size | ~15 min, but n=14 makes every per-question rate noise |

Do not decide this before the pilot. Reviewer time is the scarce resource (§3), and spending it on a
question the pilot showed to be degenerate is the one clearly wrong answer.

**The one blocker, and it is real.** `oracle-validation.ts` supports `kind: "enum" | "boolean"` and
nothing else. Eleven of the thirteen questions map onto `kind: "enum"` directly, with hotkeys `1`–`7`
(`MAX_ENUM_ANSWERS` is 9, so even the seven-value `text_roles` and `subject_kind` vocabularies fit an
enum *display*). **But `text_roles` and `overlays` are multi-selects, and a reviewer cannot pick
several answers under a one-keystroke auto-advance UI.** Two ways out, both priced, neither to be
chosen by this workstream:

| option | shape | cost |
|---|---|---|
| **A — add `kind: "multi"`** to the fixture schema and the review UI: multiple keys toggle, one key commits | 260 items, 13 passes, ~25–30 min | a small, self-contained change in the **review-server workstream**, which owns `oracle-validation.ts` and `REVIEW_UI.md`. Preferred: it is the only shape that asks the reviewer the same question the model was asked |
| **B — decompose into per-value yes/no passes**: `text_roles` → 6 passes, `overlays` → 4 passes (its `none` is derived from four `no`s) | 11 + 10 = 21 passes, 420 items, ~45–50 min | no code change, but it is **a different question** from the one the model answered, so it reintroduces exactly the construct-match caveat §8.1 row 2 spent the probe-gold round removing |

Recommendation: **A**, raised with the review-server workstream after the pilot, and only for the
multi-selects that survive §15.6. If A is unavailable, run the eleven single-value questions alone
(220 items, ~25 min) and say plainly that the multi-selects are unvalidated.

**Everything else follows `oracle-probe-gold-1` (§12), which worked:**

- **Question text and every `answers[].gloss` must be byte-identical to a prompt file's rendering of
  that question.** An answer only means something against the exact words it was answered under.
  **Use variant E's wording**, and record that choice in the batch's `builtFrom` — E and F word the
  same questions differently, so scoring F against this gold carries a stated wording caveat that
  scoring E does not. That asymmetry is the price of two independent renderings and it should be
  written down, not discovered later.
- **The shared blocks must be on the page**, once, above the question, on every pass — not only
  inside `instruction`. They are the definitions the whole set rests on, and two of them
  (`THE MAIN SUBJECT`, `ONE PICTURE, ONE MEDIUM`) are what make `subject_kind` and `medium`
  answerable at all. Both prompt files declare all eight as explicit `shared_blocks` keys precisely
  so the fixture builder can assert the match instead of restating them.
- **`instruction`, same on every pass:** *"Answer this one question only. Do not try to make your
  answers across questions tell one story."* The anti-coherence line is the same one the prompt
  files carry as a shared block.
- **Pass order:** variant E's question order. Fixed and recorded, not randomised — with one reviewer
  there is nothing to average over.
- **Do not show the reviewer any model answer**, and do not run this in the same sitting as anything
  that displays one.
- **The 20 artworks join back by `imagePath` and `sha256`**, exactly as `oracle-probe-gold-1` does,
  so the join to the pilot's rows is exact.

**What the round can then measure**, and it is worth being precise about how little a first round
buys: per-question exact agreement between the reviewer and each of E and F, on 20 artworks. At n=20
the 1σ binomial noise is about ±2 items, so only large gaps mean anything, and the round's real
product is **which questions are answerable by a human at all** — a question the reviewer finds
unanswerable is deleted regardless of what the model did with it.

## 15.10 Sign-off ledger additions

| # | change | status |
|---|---|---|
| 9 | the `group-bcde.v1` schema: thirteen group-B/C/D/E questions in one constrained decode, two orderings | **needs sign-off.** A new instrument on never-piloted questions, not a rewording of a measured one |
| 10 | **the new field `subject_kind`** (`ORACLE_QUESTION_SET.md` §D.1) and its VLM→SAM rationale | **needs sign-off.** Reviewer-initiated 2026-08-03; it is a new question, and the §D.1 write-up including the single-select limitation is what needs signing |
| 11 | folding **group E** into the pilot rather than scheduling it separately | **needs sign-off**, though it is close to free: the inference count and wall clock do not move |
| 12 | the five added `not_applicable` values (§15.4) | **needs sign-off**, though it is the same move group-a.v1 already made for `shading_geometry` |
| 13 | multi-selects as array-of-enum, with repeats and exclusive-value conflicts **counted rather than failed** (§15.4) | **needs sign-off.** It is a policy about what counts as a bad answer, and it is much harder to change once rows exist |
| 14 | the pilot run itself: 284 inferences, ~50 min of GPU | **needs approval and a slot**, after the two group-A arms |
| 15 | the reviewer validation round (§15.9) | **not yet requestable.** Gated on the pilot, and on the review-server `kind: "multi"` decision |

**No agent starts this run.** The GPU is single-owner (`CONVENTIONS.md`).

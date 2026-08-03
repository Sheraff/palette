# Premise test — what to run next (variants C and D)

**For:** the orchestrator. **Status:** drafted, nothing run, nothing in `common.py` changed.
**Reads with:** `README.md` (this directory), `../../ORACLE_QUESTION_SET.md` v2 §A.

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
unimplemented, and this run is part of its evidence.

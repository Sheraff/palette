# `flat_field` micro-adjudication and the "essentially" overcorrection hypothesis

**What this is.** Unrealized-ideas item 6
(`research/v3/reviews/phase-0-adversarial/unrealized-ideas.md` §6, lines 206–229) records a
hypothesis that was never tested: that the `flat_field` collapse in the human probe round was
caused by a wording change made during the v1.1 prompt repair, rather than by anything real about
the probe decomposition. The ledger names two test routes, both dormant. This note runs everything
those routes permit **from rows already on disk** — no new inference, no model calls, no new human
answers — and says plainly where the stored rows run out.

**Written 2026-08-04.** Analysis only; nothing in the repo was modified to produce it.

---

## 0. Verdict, first

1. **The hypothesis as literally stated is false, and this is settled by reading the prompt files.**
   The word "essentially" was **not** deleted by the v1.1 repair. It is present, verbatim and in the
   same position, in both the v1.0 and the v1.1 wording of the `one_colour` probe. What v1.1 did was
   *add* a second sentence beside it. (§2, verified against `git show 569572d`.)

2. **The specific mechanism the hypothesis names is refuted by the stored rows.** If the added
   `one_colour` clause were what cost the 9 disputed artworks their `flat_field` tag, then changing
   that one answer back should restore the tag. Recomputed over the committed derivation table, it
   restores it in **0 of 9** cases. In every one of the 9, at least one *other* probe answer
   independently blocks `flat_field` — and for **5 of the 9** that other probe is `separate_areas`,
   whose wording and option glosses v1.1 left **byte-identical**. (§5, §6.)

3. **The broader question — "was it the v1.1 repair, or is it a real finding about the
   decomposition?" — cannot be settled from stored rows, and this is not a close call.** The
   counterfactual arm does not exist in the data: every one of the 180 probe answers in the
   warehouse carries `labelSchemaVersion: "group-a.probes.v1.1"`, and there are **zero**
   `group-a.probes.v1` labels anywhere. No human ever answered these probes under the pre-gloss
   wording; the v1.0 prompt files were deleted (renamed) by the same commit that introduced v1.1.
   There is no arm to compare against. (§7.)

4. **The headline numbers reproduce exactly.** 13/30 = 43.3% exact agreement; 2/11 = 18.2% on
   `flat_field`. Recomputed independently from the per-artwork rows, not read off the stored
   summary. No discrepancy. (§3.)

**So:** the `one_colour`-gloss story is dead. A *reformulated* version of the overcorrection
hypothesis — that the v1.1 **referent preamble**, not the `one_colour` clause, pushed the reviewer
toward seeing "separate areas" — survives untouched and is **not testable from stored rows**. It
needs either pre-gloss re-runs or the 9-item human round. The ready-to-run round is Appendix A.

---

## 1. Terms, each defined once

- **`flat_field`** — one of six values of the `ground_type` question: the artwork's background is
  one area of essentially one colour, with no shading or progression across it. The gloss the
  reviewer saw in the direct arm is *"one area of essentially one colour, no shading"*
  (`research/v3/src/review-server/oracle-validation.ts:479`).
- **The two instruments.** The same reviewer answered the same 30 artworks twice.
  - **direct arm** — one six-way `ground_type` question, batch `oracle-premise-disambiguation-1`,
    schema `group-a.v1`.
  - **probe arm** — six independent yes/no/unsure probes (`bg_visible`, `one_colour`,
    `continuous_change`, `separate_areas`, `motif_or_material`, `depicted_place`), batch
    `oracle-probe-gold-1`, schema `group-a.probes.v1.1`. The six answers are turned into a
    `ground_type` tag by a **committed 729-row lookup table**
    (`research/v3/oracle/premise/prompts/derivation.group-a.probes.v1.json`, sha256
    `da67d5eb…`). No model is involved on either side.
- **The gloss.** A short clarifying sentence appended to a probe's question or to one of its answer
  options. The one at issue is *"If different parts have different colours, answer no."*, added to
  `one_colour` in v1.1.
- **Exact agreement** — the fraction of artworks where the probe-derived tag and the direct six-way
  answer are the same string.
- **Noise floor** — 63%, the reviewer's own measured repeat consistency: asked the same binary
  question twice, they gave the same answer 63% of the time
  (`[MEASURED, PHASE_0_DECISIONS.md §3]`, quoted in
  `research/v3/src/review-server/analyze-probe-gold.ts:76-79`). A disagreement rate at or below this
  is inside the reviewer's own noise.
- **Sign test** — for a set of disagreements that each point in one of two directions, count how
  many point each way and ask how surprising that split is if both directions were equally likely.
  The p-value is the exact binomial tail.
- **Probe vector** — the six answers written as one string in the table's fixed probe order, with
  `y`/`n`/`u` for yes/no/unsure. E.g. `ynnynn` = bg_visible yes, one_colour no, continuous_change
  no, separate_areas yes, motif_or_material no, depicted_place no.

---

## 2. What the gloss actually did — verified, not assumed

The ledger says v1.1 *"overcorrected by deleting the 'essentially' tolerance"*. That is not what
happened. From `git show 569572d` (commit *"research/v3: probe arm v1.1 — referent defect fixed from
reviewer stress test"*, 2026-08-03), diffing
`group-a.probes.v1.solo-one-colour.json` → `group-a.probes.v1.1.solo-one-colour.json`:

| | v1.0 | v1.1 |
|---|---|---|
| stem | `one_colour - Is the background **essentially** one single colour all over?` | `one_colour - Is the background **essentially** one single colour all over? **If different parts have different colours, answer no.**` |
| `yes` gloss | one colour, all over | one colour, all over *(unchanged)* |
| `no` gloss | more than one colour is present | more than one colour is present**, or different parts have different colours** |

"essentially" survives verbatim in both. The change is **additive**, not a deletion.

It is still fair to say the added clause *narrows* what "essentially" would otherwise license — it
supplies a bright-line rule with no tolerance threshold attached. So the hypothesis is worth
restating charitably as: *"the added clause functionally cancelled the tolerance the word
'essentially' was carrying."* That restated version is what §5 and §6 test.

**All six probes, v1.0 → v1.1** (same source):

| probe | changed in v1.1? | what changed |
|---|---|---|
| `bg_visible` | yes | referent reworded ("behind and around the subject, lettering or figures" → "behind the main subject and the text") |
| `one_colour` | yes | added *"If different parts have different colours, answer no."* + extended `no` gloss |
| `continuous_change` | yes | added *"If it changes in one part and not in another, answer no."* — option glosses byte-identical |
| **`separate_areas`** | **no** | **stem and all three option glosses byte-identical between v1.0 and v1.1** |
| `motif_or_material` | yes | added "AS A WHOLE" + *"If only one part of it is, answer no."* |
| `depicted_place` | yes | added "Taken as a whole" |

Plus a **referent preamble** and an **unsure framing** line, both new in v1.1 and both carried
byte-identically by every prompt file *and* by the human review form:

> The background means everything behind the main subject and the text, taken AS A WHOLE — even if
> it has several different parts.

The two facts that matter downstream: **`separate_areas` was never touched**, and
**`continuous_change`'s added clause pushes toward `no`** — i.e. *toward* `flat_field`, the opposite
of what the overcorrection hypothesis needs.

**The human saw exactly these prompt files.** The review server does not transcribe the wordings; it
parses them out of the same JSON the model would be given
(`research/v3/src/review-server/oracle-validation.ts:806-815, 848-895`,
`PROBE_LABEL_SCHEMA_VERSION = "group-a.probes.v1.1"`). So the reviewer's `one_colour` answers were
conditioned on the v1.1 clause. The hypothesis is at least *coherent*.

**The direct arm carries "essentially" with no narrowing clause at all** — gloss *"one area of
essentially one colour, no shading"* (`oracle-validation.ts:479`; the direct batch is schema
`group-a.v1`, confirmed by 32 warehouse records). So the asymmetry the hypothesis posits — tolerant
on one side, bright-line on the other — is genuinely present in the wordings. It just is not what
caused the 9 disagreements (§5).

**The derivation table did not change.** v1.1 is byte-identical on
`derivation.group-a.probes.v1.json`, same sha256, same 729 rows — stated in the commit message and
in `ORACLE_QUESTION_SET.md`, and re-verified here by the analysis script's own digest check.

---

## 3. Recomputing the headline — 43% and 2/11

Recomputed from the 30 per-artwork rows in
`research/v3/data/oracle-validation/probe-gold-1-analysis.json` (`perArtwork` array), independently
of the `agreement` / `pattern` summary blocks in the same file:

| quantity | recomputed | as stored | source |
|---|---|---|---|
| exact six-way agreement | **13 / 30 = 0.4333** | `agreement.exact.rate: 0.4333` | `probe-gold-1-analysis.json` |
| agreement where direct said `flat_field` | **2 / 11 = 0.1818** | `pattern.byDirectTag.flat_field.rate: 0.1818` | same |
| binary-mapped agreement | **16 / 20** | `agreement.binary` = 16/20 | same |
| noise floor | 0.63 | `agreement.noiseFloor: 0.63` | same |

**No discrepancy.** The 43% cited in `PREMISE_NEXT.md` §12 (line 437) and §14 row 7 (line 642), and
the 2-of-11 cited at line 439–440, both reproduce.

Two things the recompute confirms about *how* those numbers are made, which matter for reading them:

- The `underdetermined` tag is a **probe-arm outcome with no direct-arm counterpart**. Four artworks
  land there, and all four are counted as disagreements, because the direct six-way question has no
  `underdetermined` option. Three of those four had a direct answer of `flat_field`. So roughly a
  third of the `flat_field` collapse is the probe arm *refusing to answer*, not answering
  differently.
- The `pattern.byDirectTag` denominators are the direct arm's own tag counts (11 `flat_field`, 8
  `shaded_field`, 5 `multiple_distinct_fields`, 5 `pattern_or_texture`, 1 `none_discernible`), so
  each rate rests on single digits except `flat_field`'s 11.

---

## 4. The exact disagreement structure on `flat_field`

All 11 artworks where the **direct** answer was `flat_field`. Source: `perArtwork` rows in
`probe-gold-1-analysis.json`, matched by sha256.

| # | sha256 (first 8) | path | probe vector | probe-derived tag | verdict |
|---|---|---|---|---|---|
| 1 | `06c5954c` | `images/vvbrown.jpg` | `yynnnn` | `flat_field` | **agree** |
| 2 | `c20e8afc` | `01/ab67616d0000b27300018a0a56bae40350d9fa8e.jpg` | `yynnnn` | `flat_field` | **agree** |
| 3 | `30ae4598` | `0d/ab67616d00001e02000d457f4b8829a59481e78b` | `ynyynn` | `shaded_field` | disagree |
| 4 | `4dc30c99` | `12/ab67616d0000b2730012eb9ade9c1bf4a5411c5d` | `ynuynn` | `multiple_distinct_fields` | disagree |
| 5 | `64b30b7f` | `05/ab67616d0000b2730005230fae1822525e5a5ff6` | `yyynnn` | `underdetermined` | disagree |
| 6 | `8ca89e51` | `0e/ab67616d00001e02000e007955ee2f8b29f5b2b4` | `ynnynn` | `multiple_distinct_fields` | disagree |
| 7 | `8efa4c38` | `0a/ab67616d0000b273000a2927c0f27657e4a2aeaa` | `ynnyyn` | `multiple_distinct_fields` | disagree |
| 8 | `ac7ca456` | `01/ab67616d0000b2730001c404b8a04a8789db8dab.jpg` | `yyynnn` | `underdetermined` | disagree |
| 9 | `c8321c5e` | `0a/ab67616d0000b273000a24cc32b3d8b6e31bc161` | `yyynnn` | `underdetermined` | disagree |
| 10 | `d6487802` | `06/ab67616d0000b2730006a059abb2a6b7dd4ad461` | `ynynnn` | `shaded_field` | disagree |
| 11 | `fc36ed74` | `08/ab67616d0000b2730008c1c08433aa880aad7f30` | `ynnynn` | `multiple_distinct_fields` | disagree |

**Probe marginals over these 11** (recomputed):

| probe | yes | no | unsure |
|---|---|---|---|
| `bg_visible` | 11 | 0 | 0 |
| `one_colour` | 5 | 6 | 0 |
| `continuous_change` | 5 | 5 | 1 |
| `separate_areas` | 5 | 6 | 0 |
| `motif_or_material` | 1 | 10 | 0 |
| `depicted_place` | 0 | 11 | 0 |

Note immediately: **on 5 of the 11 the reviewer answered `one_colour` = yes** — rows 1, 2, 5, 8, 9
above. On those the v1.1 clause did not deter them at all. Two of the five (rows 1 and 2) derived
`flat_field` and agree; the other three (rows 5, 8, 9) still failed to derive it, for reasons that
have nothing to do with `one_colour`.

---

## 5. The directional test

The overcorrection hypothesis makes a directional prediction: errors should be biased toward "no"
on nearly-but-not-perfectly flat artworks — i.e. the probe arm should *under*-produce `flat_field`
relative to the direct arm, not over-produce it.

**The direction is as predicted, and the asymmetry is total.** From the confusion matrix in
`probe-gold-1-analysis.json`:

- direct = `flat_field`, probe-derived ≠ `flat_field`: **9**
- direct ≠ `flat_field`, probe-derived = `flat_field`: **0**

Sign test (equivalently McNemar's exact test on the binary "is it `flat_field`"), n = 9:
**two-sided exact binomial p = 0.003906**, one-sided p = 0.001953.

### Why that p-value is worth almost nothing here

Three reasons, and they compound:

1. **It is the floor.** The smallest two-sided p attainable at n = 9 is exactly 2 / 2⁹ = 0.003906 —
   which is the number obtained. Any perfectly one-sided split of 9 gives this. The test has no
   resolution to distinguish "total asymmetry" from "the strongest thing 9 items can say", and no
   power at all to detect a *partial* bias.

2. **The null is wrong.** The sign test assumes each disagreement is equally likely to point either
   way. That is indefensible here, because the two instruments have structurally different marginal
   rates for `flat_field`. Counting the derivation table's own preimages
   (`derivation.group-a.probes.v1.json`, 729 rows), restricted to the 64 vectors that use no
   `unsure`:

   | derived tag | vectors | share of 64 |
   |---|---|---|
   | `underdetermined` | 44 | 0.688 |
   | `shaded_field` | 8 | 0.125 |
   | `flat_field` | **4** | **0.062** |
   | `multiple_distinct_fields` | 4 | 0.062 |
   | `pattern_or_texture` | 2 | 0.031 |
   | `full_scene` | 1 | 0.016 |
   | `none_discernible` | 1 | 0.016 |

   The probe arm reaches `flat_field` from only 4 of 64 yes/no vectors. Strong under-production of
   `flat_field` is what the table's geometry predicts **under zero gloss effect**. The 9–0 split is
   evidence that the two instruments differ; it is not evidence about *why*.

3. **Both competing explanations predict it.** "The gloss suppressed `flat_field`" and "the
   decomposition genuinely disagrees with the six-way question about what counts as flat" make the
   same directional prediction. A test both hypotheses pass discriminates nothing.

**Conclusion for §5: direction confirmed, cause untouched.** Do not quote the p-value as support for
the gloss hypothesis.

---

## 6. The test that *does* discriminate — and it comes out against the hypothesis

The stored rows permit one genuinely diagnostic computation, because the derivation is a pure
lookup: **hold five probe answers fixed, change the sixth, and look up what tag comes out.** If the
`one_colour` clause is what cost these artworks their `flat_field` tag, undoing that one answer
should restore it.

**It restores it in 0 of 9.** Recomputed against the committed table:

| # | sha256 | vector | `one_colour` as answered | tag if `one_colour` = yes | tag if = no | tag if = unsure |
|---|---|---|---|---|---|---|
| 3 | `30ae4598` | `ynyynn` | no | `underdetermined` | `shaded_field` | `shaded_field` |
| 4 | `4dc30c99` | `ynuynn` | no | `underdetermined` | `multiple_distinct_fields` | `multiple_distinct_fields` |
| 5 | `64b30b7f` | `yyynnn` | **yes** | `underdetermined` | `shaded_field` | `shaded_field` |
| 6 | `8ca89e51` | `ynnynn` | no | `underdetermined` | `multiple_distinct_fields` | `multiple_distinct_fields` |
| 7 | `8efa4c38` | `ynnyyn` | no | `underdetermined` | `multiple_distinct_fields` | `multiple_distinct_fields` |
| 8 | `ac7ca456` | `yyynnn` | **yes** | `underdetermined` | `shaded_field` | `shaded_field` |
| 9 | `c8321c5e` | `yyynnn` | **yes** | `underdetermined` | `shaded_field` | `shaded_field` |
| 10 | `d6487802` | `ynynnn` | no | `underdetermined` | `shaded_field` | `shaded_field` |
| 11 | `fc36ed74` | `ynnynn` | no | `underdetermined` | `multiple_distinct_fields` | `multiple_distinct_fields` |

`flat_field` appears in none of the 27 counterfactual cells.

**Why.** The table reaches `flat_field` only when `one_colour` = yes **and** `continuous_change` ∈
{no, unsure} **and** `separate_areas` ∈ {no, unsure}. It is a three-way conjunction. Flipping
`one_colour` to yes while `continuous_change` or `separate_areas` is yes fires the table's
contradiction rule (rule 3, `ORACLE_QUESTION_SET.md` §A.6.3: *"`one_colour == yes` and
(`continuous_change == yes` or `separate_areas == yes`) → `underdetermined`"*) — so the flip trades
one disagreement for another.

### Which probe is actually load-bearing, per artwork

Nearest `flat_field` vector by Hamming distance, and which probes have to move to reach it:

| # | sha256 | vector | must flip | distance | involves a probe v1.1 never touched? |
|---|---|---|---|---|---|
| 5 | `64b30b7f` | `yyynnn` | `continuous_change` | 1 | — |
| 8 | `ac7ca456` | `yyynnn` | `continuous_change` | 1 | — |
| 9 | `c8321c5e` | `yyynnn` | `continuous_change` | 1 | — |
| 4 | `4dc30c99` | `ynuynn` | `one_colour`, **`separate_areas`** | 2 | **yes** |
| 6 | `8ca89e51` | `ynnynn` | `one_colour`, **`separate_areas`** | 2 | **yes** |
| 7 | `8efa4c38` | `ynnyyn` | `one_colour`, **`separate_areas`** | 2 | **yes** |
| 11 | `fc36ed74` | `ynnynn` | `one_colour`, **`separate_areas`** | 2 | **yes** |
| 10 | `d6487802` | `ynynnn` | `one_colour`, `continuous_change` | 2 | — |
| 3 | `30ae4598` | `ynyynn` | `one_colour`, `continuous_change`, **`separate_areas`** | 3 | **yes** |

Reading this against §2's table of what v1.1 actually changed:

- **Zero of the 9** are one `one_colour` flip away from `flat_field`. The gloss the hypothesis names
  is, on its own, sufficient to explain none of them.
- **5 of the 9** require `separate_areas` to move — and `separate_areas` is the one probe whose stem
  and all three option glosses v1.1 left **byte-identical**. For those five the hypothesis has no
  mechanism to offer.
- **3 of the 9** (`64b30b7f`, `ac7ca456`, `c8321c5e`, all vector `yyynnn`) need only
  `continuous_change` to move from yes to no. `continuous_change` *did* gain a v1.1 clause — but
  that clause (*"If it changes in one part and not in another, answer no"*) pushes toward **no**,
  which is the direction that would have **restored** `flat_field`. The v1.1 change to that probe
  works against the hypothesis, not for it. On all three the reviewer answered `one_colour` = yes,
  so the disputed clause plainly did not deter them.
- **1 of the 9** (`d6487802`) needs `one_colour` *and* `continuous_change` — still not the gloss
  alone.

**This is as close to a decisive negative as stored rows can give**, and it should be read with its
one real limitation stated: the counterfactual holds the other five answers fixed. If the reviewer
had seen v1.0 wording, more than one answer might have moved — see §7 and §8.

---

## 7. What cannot be tested from stored rows, and exactly why

### 7a. There is no pre-gloss arm. Searched; negative.

Every `labelSchemaVersion` present in `research/v3/data/warehouse/warehouse.jsonl`, counted:

```
286  color-bracketing-1        63  ground-freetext.v1        180  group-a.probes.v1.1
 32  group-a.v1                20  group-a.v2                182  group-bcde.v1
 30  pointing-ground.v1        50  residual-purity.v1         48  residual-purity.v2
179  sam-mask-quality.v1
```

**`group-a.probes.v1` — the pre-gloss probe schema — appears zero times.** All 180 probe answers are
`group-a.probes.v1.1`, in the single batch `oracle-probe-gold-1` (181 records; 180 answers plus one
batch record).

Corroborating negatives:

- Only one probe batch id exists in the warehouse: `oracle-probe-gold-1`.
- The v1.0 prompt files are **not on disk**. Commit `569572d` renamed all eight
  `group-a.probes.v1.*` files to `group-a.probes.v1.1.*`; the commit message records the intent
  explicitly (*"Defective v1 prompts deleted (hashes kept; any v1 hash in results = invalid run)"*).
  They are recoverable from git history — which is how §2's diff was produced — but no *answers*
  under them exist.
- `research/v3/data/oracle-validation/opus-probe-1.jsonl` is **not** a probe-arm run despite its
  name: its 30 rows carry a single `answer` field with six-way `ground_type` values
  (`flat_field`, `multiple_distinct_fields`, `full_scene`, …) plus `confidence` and `reason`. It is
  a model's *direct* answers, not probe answers, and it has no schema-version field.
- No VLM probe-arm answers exist at all — `PREMISE_NEXT.md` §12 states it
  ("no VLM probe answers exist yet to score against it"), the arm status table says the probe arm is
  "drafted, **unrun**", and `probe-gold-1-analysis.json`'s scoping note says "NO MODEL IS INVOLVED …
  none exist yet". This is the ledger's route (b), and it is confirmed dormant.

**Consequence, stated precisely:** *the counterfactual test cannot be run from stored rows because
no pre-gloss responses were ever collected. The rows contain only v1.1-conditioned answers, so the
comparison arm does not exist in the data.* Recovering it requires a new human sitting or new
inference — both out of scope here, and one of them (a second human sitting on the same 30
artworks) would in any case be contaminated by the reviewer having now answered them twice.

### 7b. The gloss explanation and the "finding about the decomposition" explanation are not
separable from stored data

They are not separable **as general hypotheses**, for a structural reason: with one sitting under
one wording, every observation is jointly produced by (wording × reviewer × artwork), and there is
no second level of any factor to hold the others against. Specifically:

- One reviewer, so between-rater variance cannot stand in for between-wording variance.
- One wording version answered, so the wording factor has one level.
- The 30 artworks are the same in both arms, so artwork cannot be used as a contrast either.

What §6 *did* manage is narrower and worth being precise about: it refutes **one named mechanism**
(the `one_colour` clause, acting through the `one_colour` answer alone) by exploiting the fact that
the derivation is a deterministic lookup, so single-answer counterfactuals are computable without
new data. That trick does not extend to the general hypothesis, because the general hypothesis
allows *several* answers to have moved together, and the joint counterfactual is unconstrained —
with 5 free answers there is always some combination that yields `flat_field`, and nothing in the
data says which one the reviewer would have given.

### 7c. What §6 leaves alive

A reformulated overcorrection hypothesis is **untouched** by everything above:

> The v1.1 **referent preamble** — *"everything behind the main subject and the text, taken AS A
> WHOLE — even if it has several different parts"* — is what pushed the reviewer toward answering
> `separate_areas` = yes, by explicitly inviting them to notice parts. `separate_areas`' own wording
> did not need to change for its answers to change.

This version is *more* plausible than the ledger's, not less: it names the probe that is actually
load-bearing in 5 of 9 cases, and its mechanism (a preamble that all six probes carry) explains why
a probe with unchanged wording could still shift. It is also **completely untestable from stored
rows**, for exactly the reason in §7a — the preamble is present on all 180 answers and absent from
none.

---

## 8. What the data shows / cannot show / remains hypothesis

**Shows** (each traceable to a file, cited above):

- 43% exact and 2/11 on `flat_field` are correctly computed and correctly quoted in
  `PREMISE_NEXT.md`.
- The `flat_field` disagreement is perfectly one-directional: 9 lost, 0 gained.
- The probe arm can only reach `flat_field` through a three-way conjunction, and only 4 of 64
  yes/no vectors satisfy it. This is a property of the **derivation table**, which v1.1 left
  byte-identical.
- Undoing the `one_colour` answer restores `flat_field` on none of the 9.
- 5 of the 9 hinge on `separate_areas`, whose wording v1.1 never touched.
- On 5 of the 11 `flat_field` artworks the reviewer answered `one_colour` = yes, so the disputed
  clause demonstrably did not deter them there.

**Cannot show:**

- Whether the reviewer's answers would have differed under v1.0 wording. No pre-gloss rows exist.
- Whether the reviewer, shown the 9 disputed artworks now, would endorse the direct tag or the
  derived one. That is a question only they can answer.
- Whether the v1.1 referent preamble shifted `separate_areas`. Every stored answer carries it.
- Whether a VLM would reproduce the pattern. No probe-arm model answers exist.

**Remains hypothesis:**

- That the v1.1 repair *as a whole* (most plausibly the referent preamble) contributed to the
  collapse. Not refuted; not testable here.
- That the collapse is a real finding about the decomposition — that `flat_field` as a six-way
  answer is a *tolerance* judgement ("essentially one colour") which no conjunction of bright-line
  yes/no probes can reproduce. §6 is consistent with this and mildly supportive, since the
  bottleneck turns out to be the table's conjunction rather than any one wording. But "consistent
  with" is not "established", and the two remain confounded.

**A recommendation for the citing text, offered not applied.** `PREMISE_NEXT.md` §12 (line 437–441)
and §14 row 7 (line 642) currently present 43%/2-of-11 as a finding about the decomposition. Nothing
found here contradicts that reading, and §6 removes the strongest stated objection to it. What is
not yet warranted is treating the alternative as *closed* — the referent-preamble version of it has
never been tested. One sentence acknowledging that would be enough; no number needs to change.

---

## Appendix A — the 9-item micro-adjudication round, ready to run

**Do not run this without the reviewer.** It requires a human answer and is written so a reviewer
can execute it in about two minutes.

### What it settles, and what it does not

| answer pattern | settles | does **not** settle |
|---|---|---|
| reviewer endorses **`flat_field`** (their direct answer) on most of the 9 | the probe arm is losing tags the reviewer actually wants; the derivation's three-way conjunction is too strict for a construct the reviewer holds tolerantly | *why* — still cannot separate wording from decomposition |
| reviewer endorses the **probe-derived** tag on most of the 9 | the direct six-way answer was the less reliable instrument; the 43% headline stops being evidence against the decomposition | nothing about the v1.1 gloss either way |
| **split roughly 50/50** | these 9 are genuinely borderline; both instruments are inside the reviewer's own noise (the 63% floor), and the `flat_field` "collapse" is largely a rate artefact of a hard sub-population | everything else |
| reviewer endorses **neither** on several | the six-way vocabulary itself is the problem, not either instrument | which vocabulary would be better |

**In no case does this round test the "essentially" hypothesis.** §6 already answered the version of
it that stored rows can reach, and §7 explains why the rest needs pre-gloss re-runs, not human
adjudication. Scope this round as *"which tag do you endorse"*, nothing more.

**Scope it honestly as answered-after-reading-the-rules.** The reviewer has now seen the derivation
table and this note. Their answers here are informed judgements, not a third blind sitting, and must
not be pooled with either arm or used as gold.

### Exact question text to put to the reviewer

> Below are 9 artworks. When you answered the single six-way question you called each of them
> **flat field** — *"one area of essentially one colour, no shading"*. When you answered the six
> yes/no probes, the committed table turned your answers into a different tag.
>
> Looking at each artwork now, with both tags in front of you: **which tag do you actually
> endorse?** Answer `direct`, `derived`, `neither`, or `cannot tell`. If `neither`, say in a few
> words what you would call it.
>
> There is no right answer and nothing is scored. If both seem defensible, say so — that is
> informative.

### The 9 artworks

Ordered by sha256, matching `probe-gold-1-analysis.json`. Paths are relative to the repo root.

| # | sha256 (first 8) | path | your direct tag | probe-derived tag | your probe answers (`bg`/`1col`/`cont`/`sep`/`motif`/`place`) |
|---|---|---|---|---|---|
| 1 | `30ae4598` | `0d/ab67616d00001e02000d457f4b8829a59481e78b` | `flat_field` | `shaded_field` | y n y y n n |
| 2 | `4dc30c99` | `12/ab67616d0000b2730012eb9ade9c1bf4a5411c5d` | `flat_field` | `multiple_distinct_fields` | y n **u** y n n |
| 3 | `64b30b7f` | `05/ab67616d0000b2730005230fae1822525e5a5ff6` | `flat_field` | `underdetermined` | y y y n n n |
| 4 | `8ca89e51` | `0e/ab67616d00001e02000e007955ee2f8b29f5b2b4` | `flat_field` | `multiple_distinct_fields` | y n n y n n |
| 5 | `8efa4c38` | `0a/ab67616d0000b273000a2927c0f27657e4a2aeaa` | `flat_field` | `multiple_distinct_fields` | y n n y y n |
| 6 | `ac7ca456` | `01/ab67616d0000b2730001c404b8a04a8789db8dab.jpg` | `flat_field` | `underdetermined` | y y y n n n |
| 7 | `c8321c5e` | `0a/ab67616d0000b273000a24cc32b3d8b6e31bc161` | `flat_field` | `underdetermined` | y y y n n n |
| 8 | `d6487802` | `06/ab67616d0000b2730006a059abb2a6b7dd4ad461` | `flat_field` | `shaded_field` | y n y n n n |
| 9 | `fc36ed74` | `08/ab67616d0000b2730008c1c08433aa880aad7f30` | `flat_field` | `multiple_distinct_fields` | y n n y n n |

Full `imageId` values (for the review server), in the same order:

```
ab67616d00001e02000d457f4b8829a59481e78b
ab67616d0000b2730012eb9ade9c1bf4a5411c5d
ab67616d0000b2730005230fae1822525e5a5ff6
ab67616d00001e02000e007955ee2f8b29f5b2b4
ab67616d0000b273000a2927c0f27657e4a2aeaa
ab67616d0000b2730001c404b8a04a8789db8dab.jpg
ab67616d0000b273000a24cc32b3d8b6e31bc161
ab67616d0000b2730006a059abb2a6b7dd4ad461
ab67616d0000b2730008c1c08433aa880aad7f30
```

### Answer table skeleton

| # | sha256 | endorse (`direct` / `derived` / `neither` / `cannot tell`) | if `neither`, what would you call it | note |
|---|---|---|---|---|
| 1 | `30ae4598` | | | |
| 2 | `4dc30c99` | | | |
| 3 | `64b30b7f` | | | |
| 4 | `8ca89e51` | | | |
| 5 | `8efa4c38` | | | |
| 6 | `ac7ca456` | | | |
| 7 | `c8321c5e` | | | |
| 8 | `d6487802` | | | |
| 9 | `fc36ed74` | | | |

### Optional 2-item control (30 seconds more, and worth it)

Add the two artworks where the two instruments **agreed** on `flat_field`, unlabelled and shuffled
in among the nine. If the reviewer endorses `direct` on those too, the round has a baseline; if they
waver on them, the whole `flat_field` construct is unstable and the 9-item result cannot be read.

| sha256 | path | both instruments said |
|---|---|---|
| `06c5954c` | `images/vvbrown.jpg` | `flat_field` |
| `c20e8afc` | `01/ab67616d0000b27300018a0a56bae40350d9fa8e.jpg` | `flat_field` |

### Reading the result — pre-registered, before any answer exists

- **n = 9. State the power honestly: there is essentially none.** A 7–2 split has a two-sided
  binomial p of 0.18; even 8–1 gives 0.039 and 9–0 gives 0.0039, which is the floor at this n. Do
  not report a p-value from this round as evidence for anything. Report the counts and the free-text
  notes.
- The free-text "what would you call it" answers are likely to carry more information than the
  endorsements, because they are the only channel in which the reviewer can say the vocabulary is
  wrong.
- Whatever comes back, it is **answered-after-reading-the-rules** and cannot be pooled with either
  arm or used as gold.

---

## Appendix B — provenance of every number in this note

| number | source file |
|---|---|
| 13/30, 43.3%; 2/11, 18.2%; 16/20 binary; 0.63 floor; all per-artwork vectors, tags, paths, sha256s, strata, tensions | `research/v3/data/oracle-validation/probe-gold-1-analysis.json` |
| 9 vs 0 direction; confusion matrix | same, `confusion` block, cross-checked against `perArtwork` |
| 729 rows; 72 `flat_field` preimages of 729; 4 of 64 yes/no vectors; all counterfactual lookups; Hamming distances | `research/v3/oracle/premise/prompts/derivation.group-a.probes.v1.json` (sha256 `da67d5eb…`, digest verified) |
| v1.0 vs v1.1 wordings for all six probes; the referent preamble; "essentially" present in both | `git show 569572d` and `git show 569572d^:…group-a.probes.v1.solo-*.json` |
| v1.1 prompt text as served to the human; `PROBE_LABEL_SCHEMA_VERSION`; direct-arm `flat_field` gloss | `research/v3/src/review-server/oracle-validation.ts` (lines 479, 780–815, 848–895) |
| 63% floor definition; derivation-is-a-lookup contract; scoping notes | `research/v3/src/review-server/analyze-probe-gold.ts` (lines 59–79, 96–119, 329–342) |
| warehouse schema-version counts (180 v1.1, 0 v1); batch ids; 32 `group-a.v1` direct records | `research/v3/data/warehouse/warehouse.jsonl` |
| `opus-probe-1.jsonl` is direct answers, 30 rows | `research/v3/data/oracle-validation/opus-probe-1.jsonl` |
| rule 3 (`contradiction_uniformity`); the six probes' v1.1 wordings as a table; "derivation table untouched" | `research/v3/ORACLE_QUESTION_SET.md` §A.6, §A.6.1, §A.6.3 |
| the 43% citations under review | `research/v3/oracle/premise/PREMISE_NEXT.md` lines 7–9, 437–441, 642 |
| the hypothesis as originally stated | `research/v3/reviews/phase-0-adversarial/unrealized-ideas.md` lines 206–229 |
| exact binomial p-values (0.003906 two-sided, 0.001953 one-sided at n=9; 0.18 at 7–2; 0.039 at 8–1) | computed from `math.comb`; no external data |

Binomial p-values are arithmetic on the counts in the row above them, not measurements.

# Adversarial check — the evidential basis of the B-unmapped "take D only on `multiple_distinct_fields`" policy

**Scope:** establish what was actually measured behind the claim *"D's `multiple_distinct_fields`
is 32/34 right corpus-wide, p=2.3e-7"*. Facts only. **No decision is recorded here, and none of the
files under audit were modified.** Re-derivation used
`research/v3/oracle/sam/.venv/bin/python` (stdlib + numpy/scipy), static reading only, no GPU.

Date of audit: 2026-08-03.

---

## VERDICT

**No — the measurement does not satisfy the condition.** It fails on both halves of what Flo
required, and each failure is independently disqualifying. **(a) Wrong answer value.** "32/34" is
not a `multiple_distinct_fields` statistic at all: it is D's *pooled non-shaded* class,
`{flat_field, multiple_distinct_fields}`, which is exactly the set of values that map to binary
`flat` (`analyze_b_unmapped_class.py:986`; `analyze.py:35-53`). It decomposes as `flat_field` 14/15
+ `multiple_distinct_fields` 18/19 (`b-unmapped-class-analysis.json` `…/all_primary`). The
answer value the policy actually gates on is 18/19 corpus-wide (p=1.1e-4, not 2.3e-7) and 8/8 on the
policy's own slice — real numbers, but neither is 32/34, and the quoted p-value belongs to neither.
**(b) Wrong truth, and it is the one truth the reviewer has already ruled out.** Every "right" in
32/34, in 18/19, and in 8/8 is scored against `truth_binary = "gradient" if flag_gradient else
"flat"` (`analyze_b_unmapped_class.py:207-213`) — the published accepted-palette gradient flag, the
exact palette-conditional signal Appendix R's third entry rules "never call it accuracy", with
reviewer-elicited labels binding as the primary judge. Reviewer labels are loaded into the row
(`:190-191`) and then never used in the scoring. The primary judge is not merely absent, it is
absent *precisely where the policy operates*: of the 19 corpus-wide `multiple_distinct_fields`
items, **0** carry a usable reviewer binary; of the 8 items the policy would commit, **1** has a
reviewer answer, and that answer (`pattern_or_texture`) **contradicts** D's
`multiple_distinct_fields` while vindicating B's "unmapped" — the single primary-judge datapoint on
the policy slice points against the policy. Two further facts remove any hope of treating the flag
as a stand-in: on the 24 gold-30 items with a reviewer binary the flag agrees with the reviewer only
14/24, **κ=0.0625**, and variant D itself agrees with the reviewer on 10/24, **κ=0.087**, the worst
of every arm measured (`cascade-sim-1.json` `…/reviewer_vs_flag`, `…/bulk_D/binary_vs_reviewer`) —
a proxy at κ≈0.06 transmits essentially no information about the judge it is standing in for. Third,
because *all* 34 non-shaded answers project to `flat` and *all* 103 shaded answers project to
`gradient`, "D is right" on this slice is definitionally "the accepted palette was flat"; 32/34 is
the sentence *"of 34 covers D called flat, 32 have a flat accepted palette"* — a statement about
which covers D's flat vocabulary selects, not about whether `multiple_distinct_fields` is the
correct reading of the ground. **In fairness, three things are genuinely sound and should not be
discarded:** the arithmetic reproduces to the digit (2.3334e-07), the flat/gradient separation
between D's shaded and non-shaded vocabulary is real and survives a properly specified test
(Fisher 2×2 p=6.2e-9), and B-vs-D is a clean wording contrast — same model, same weights, same
temperature, same 142 images, same rendition, identical enum (per provenance check, §1). So the
*phenomenon* is not an artifact. But the claim as put to Flo mislabels which slice and which answer
value carries it, and rests entirely on a truth source the reviewer has already excluded from
counting as accuracy. **If forced to a single caveat-form answer: no — and the one repair that would
change the answer is cheap, since the policy commits only 8 items and eliciting reviewer
`ground_type` on those 8 (plus the 19 corpus-wide `multiple_distinct_fields` items) is a
~3-minute reviewer task by the project's own estimate (`PHASE_0_LOOSE_ENDS.md` B7).**

---

## 1. What exactly is "32/34"?

**It is not a `multiple_distinct_fields` statistic and not a B-unmapped statistic.**

Definition, `oracle/premise/analyze_b_unmapped_class.py:986-987`:

```python
d_nonshaded = [r for r in primary_scored if r["D_ground_type"] != "shaded_field"]
d_shaded    = [r for r in primary_scored if r["D_ground_type"] == "shaded_field"]
```

- **Population** — `primary_scored` (`:846`) = all eval items with a usable truth =
  `in_primary and not conflicted_truth` (`:208`). **n=137** of the 142-item eval set.
  Not "the corpus": eval-142 is a 142-artwork evaluation set (`data/oracle-premise/eval-set.json`,
  144 entries / 142 included; 2 dropped for palettes that disagree on the gradient boolean).
- **Slice** — *neither* candidate in the question. Not the B-unmapped covers (that route is
  n=44, 43 with truth) and not "all covers where D said `multiple_distinct_fields`" (n=19).
  It is **every primary item where D's answer was anything other than `shaded_field`**.
- **Composition of the 34** (`…/D_ground_type_reliability/all_primary`, re-derived independently):

  | D's answer | n | right | accuracy |
  |---|---|---|---|
  | `flat_field` | 15 | 14 | 0.9333 |
  | `multiple_distinct_fields` | 19 | 18 | 0.9474 |
  | **pooled "non-shaded"** | **34** | **32** | **0.9412** |
  | `shaded_field` | 103 | 62 | 0.6019 |

  So **44% of the 34 are a different answer value** (`flat_field`) from the one the policy gates on.
- **Why the pooling is not innocuous:** `flat_field` and `multiple_distinct_fields` are precisely
  the two values that project to binary `flat` (`oracle/premise/analyze.py:35-53` `GRADIENT_MAP`:
  `flat_field`→flat, `multiple_distinct_fields`→flat, `shaded_field`→gradient, and
  `full_scene`/`pattern_or_texture`/`none_discernible`→unmapped). Verified on the rows: all 34
  non-shaded have `bulk_D_binary == "flat"` (34/34) and all 103 shaded have
  `bulk_D_binary == "gradient"` (103/103). The "non-shaded" cut is therefore **identical** to
  "D predicted flat" — it is a binary-side statistic wearing a vocabulary label.
- **Variant** — D, `prompt_variant == "D"` in `data/oracle-premise/premise-run-cd.jsonl`
  (loaded at `analyze_b_unmapped_class.py:89`). 142 D rows, 0 canary; the same file's 157 C rows
  are unused here.
- **Model** — `mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit`, revision
  `f31102655767c89366f63d3eab2a5e2a8fd6d293`, 6-bit, `mlx-vlm 0.6.8`, temperature 0.0,
  constrained decoding, constant across all rows.
- **Rendition — mixed, not one resolution.** `common.py:359-380` `normalize_image` is
  downscale-only to a 640 px long-edge cap (`RESOLUTION_CAP_PX = 640`, `common.py:78`); the input is
  `image.absolutePath`, deliberately "the exact rendition the reviewer saw"
  (`build-eval-set.ts:126-135`). Over D's 142 rows `processed_long_edge_px` is 640×93, 300×43,
  500×3, 483×1, 350×1, 340×1. Tier composition:

  | | thumbnail ≤320 | standard ≤640 | large >640 |
  |---|---|---|---|
  | eval-142 | 43 | 88 | 11 |
  | the 34 non-shaded | 14 | 17 | 3 |
  | **the 8 policy-slice items** | **6** | **2** | **0** |

  The 8 items the policy would actually commit are **75% thumbnails**, against 30% corpus-wide —
  consistent with `PHASE_0_LOOSE_ENDS.md` A10's own note that the class is "thumbnail-heavy
  (37% of thumbnails land here vs 9% of large images)". Any reliability read off the 34 is being
  transferred onto a slice with a materially different rendition mix.

**The three numbers that do exist, kept distinct:**

| statistic | slice | n | right | source |
|---|---|---|---|---|
| pooled non-shaded ("32/34") | all primary | 34 | 32 | `:986`, `…/significance` |
| `multiple_distinct_fields` **corpus-wide** | all primary | 19 | 18 | `…/all_primary` |
| `multiple_distinct_fields` **on the policy slice** | B-unmapped route | 8 | 8 | `:935-937`, `:1028-1030` |

The source file itself states these correctly and never claims 32/34 for
`multiple_distinct_fields`. `analyze_b_unmapped_class.py:1027-1031`:

> "D's own word. Where D answers multiple_distinct_fields the class label is right 8 of 8; where D
> answers shaded_field it is right 22 of 35. The same asymmetry holds across the whole primary
> population (**non-shaded answers 32/34 right**, shaded answers 62/103)."

**The conflation is in the handoff, not in the analysis.** The string "32/34" appears in exactly
two places in the repo — `analyze_b_unmapped_class.py:1030` and `:1096`, plus their JSON echoes at
`b-unmapped-class-analysis.json:18`, `:29`, `:3318` — and in every one it is attached to
*non-shaded*. It appears nowhere in `PREMISE_NEXT.md`, and `PHASE_0_LOOSE_ENDS.md` A10 does not cite
it either (A10 quotes the separate cascade figure "quality 0.698 on that slice").

---

## 2. Against WHAT truth were the 32 judged "right"?

**Uniformly and solely: the published accepted-palette gradient flag. Not mixed.**

`oracle/premise/analyze_b_unmapped_class.py:207-214`:

```python
# truth: the accepted-palette gradient flag, valid only for unconflicted primary items
if rec["in_primary"] and not rec["conflicted_truth"]:
    rec["truth_binary"] = "gradient" if rec["flag_gradient"] else "flat"
else:
    rec["truth_binary"] = None
rec["D_right"] = (
    None if rec["truth_binary"] is None else rec["D_binary"] == rec["truth_binary"]
)
```

`flag_gradient` originates in `simulate_cascade.py:274-276, 301` as `meta[sha]["gradient_truth"]` —
"the accepted gradient boolean", with conflicted artworks excluded.

- **Reviewer labels are loaded and then not used.** `:162` builds `gold_by_sha` from
  `data/oracle-validation/premise-disambiguation-1-analysis.json`; `:190-191` attaches
  `reviewer_ground_type` / `reviewer_binary` to every row. Neither field appears in `D_right`,
  in `d_nonshaded`/`d_shaded`, in `all_primary`, in the `split_rule` evaluation (`:932-948`), or in
  the significance block (`:989-1007`). They are carried for display only (they surface in the
  `PICKS` narration at `:1056-1059`).
- **Not cross-variant agreement either** — B's answers are used to *define* the route
  (`is_class`), never to score it.
- **So the basis is not mixed; it is single-source, and the single source is the excluded one.**
  Appendix R, third entry, `ORACLE_QUESTION_SET.md:805-816` (key lines 806, 810-811): *"the published gradient flag is
  palette-conditional, not an artwork label… Binding on all scoring: (a) reviewer-elicited labels
  (gold-30 and successors) are the PRIMARY judge for any oracle/model comparison; (b)
  flag-agreement is a secondary, palette-conditional signal — **never call it accuracy**."*
  The analysis calls it `accuracy` at `:993` and `:998`.

**Primary-judge coverage of the relevant items (re-derived):**

| set | n | in gold-30 | with a usable `reviewerBinary` |
|---|---|---|---|
| the 34 non-shaded | 34 | 4 | 2 |
| the 19 `multiple_distinct_fields` | 19 | 2 | **0** |
| the 8 policy-slice items | 8 | 1 | **0** |

The two `multiple_distinct_fields` items that *are* in gold-30 have `reviewerBinary = None` because
the reviewer's own `ground_type` answers were `pattern_or_texture` and `none_discernible` — both
`unmapped` under `GRADIENT_MAP`. That is: **on both corpus-wide items where a primary-judge answer
to this question exists, the reviewer did not answer `multiple_distinct_fields`**, while the flag
scored D "right" on both (flag=flat, D=flat).

**The single policy-slice item with a reviewer answer**
(`02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg`): reviewer `ground_type` =
`pattern_or_texture`, `reviewerBinary` = None, flag = flat, D = `multiple_distinct_fields` → flat,
B = `pattern_or_texture` (unmapped). The reviewer **agreed with B** that there is no single readable
field and **did not give D's answer**; the flag nonetheless recorded D as right. The analysis
narrates this item honestly at `:1056-1059` ("the only class member with reviewer gold: the reviewer
independently answered pattern_or_texture, agreeing with B… and D's flat commit still matched the
accepted palette") — the file discloses the contradiction; the summary claim does not carry it.

**Is the flag a usable proxy for the primary judge? Measured: no.** From `cascade-sim-1.json`
`section_3_vs_gold30`, on the 24 gold-30 items carrying a reviewer binary:

| comparison | agreement | Cohen's κ | note |
|---|---|---|---|
| `reviewer_vs_flag` | 0.5833 (14/24) | **0.0625** | the proxy vs the judge |
| `bulk_D` vs reviewer | 0.4167 (10/24) | **0.087** | confusion: human_flat/oracle_gradient = **14** |
| `bulk_B` vs reviewer | 0.7083 | 0.3636 | |
| `adjudicator_dense_A` vs reviewer | 0.75 | 0.4000 | |
| `composed` cascade vs reviewer | 0.7917 | 0.5714 | |

D is the **worst arm against the primary judge** and commits `gradient` on 91.7% of gold-30 against
a human rate of 33.3%. D's exact `ground_type` match to the reviewer is **9/30 = 0.30**
(`…/bulk_D/exact_ground_type`).

**Caveat stated in both directions, per the source's own warning**
(`cascade-sim-1.json` `section_6_caveats/gold30_is_a_hard_slice`): the gold-30 is *not* a random
sample — it is the disambiguation set, items chosen because the oracle and the flag contradicted
each other. So these absolute rates are not comparable to the 137-item numbers and **must not** be
read as "D is 42% accurate". What they do establish is narrower and sufficient: the flag and the
reviewer are close to independent (κ=0.06) on the slice where both exist, so a flag-scored result
cannot be forwarded as a reviewer-scored result. The same caveats file
(`ground_truth_is_an_accepted_decision`) independently records that the 137-item truth "is a v2-3
palette a human accepted, not an elicited label of the artwork".

---

## 3. The p = 2.3e-7 — null, test, and correctness

**Computed at** `analyze_b_unmapped_class.py:1001-1003`, key
`p_non_shaded_beats_flat_base_rate`, emitted as `2.33e-07`
(`b-unmapped-class-analysis.json:3310`).

```python
def binom_tail(k, n, p):
    """P(X >= k) under Binomial(n, p) — exact, no scipy.stats needed."""
    return float(f"{sum(math.comb(n, i) * p**i * (1-p)**(n-i) for i in range(k, n+1)):.3g}")

flat_prior = pct(sum(1 for r in primary_scored if r["truth_binary"] == "flat"), len(primary_scored))
"p_non_shaded_beats_flat_base_rate": binom_tail(32, 34, flat_prior)   # flat_prior = 0.5328
```

- **Null hypothesis:** each of the 34 non-shaded items is an independent Bernoulli draw that is
  "right" with probability 0.5328, the flat base rate of the 137-item primary population
  (73/137 = 0.5328). **Test:** exact one-sided binomial upper tail, P(X ≥ 32 | n=34, p=0.5328).
- **Arithmetic: correct.** Re-derived independently: **2.3333984029686377e-07** → `2.33e-07` at
  the 3-sig-fig formatting. Reproduces exactly. `pct` returns a rounded fraction
  (`:72-73`, `round(n/d, 4)`), so `flat_prior` is a probability, not a percentage — no unit bug.
  No duplicate artworks inflate n (142 rows / 142 distinct `artwork_id`; the 34 are 34 distinct
  artworks), so the independence assumption is not violated by rendition duplication.

**Specification problems (the arithmetic is right; the question it answers is not the claimed one):**

1. **It is not a test of the claimed quantity.** Because every non-shaded answer projects to
   binary `flat`, "right" ≡ "the accepted palette was flat". The test asks *"is the flat rate
   among covers D called flat higher than the corpus flat rate?"* — a test of **selection**, i.e.
   that D's flat vocabulary is non-randomly aimed at flat-flagged covers. It cannot distinguish
   "D correctly reads discrete colour areas" from "D's non-shaded vocabulary happens to land on
   covers whose accepted palette went flat".
2. **In-sample base rate.** `flat_prior` is estimated from the same 137 items that *contain* the
   34 being tested. The correct comparison is the 2×2 contingency of the slice against its
   complement. Fisher exact, one-sided, `[[32 flat, 2 grad], [41 flat, 62 grad]]`:
   **p = 6.21e-09**, OR = 24.2. (Against the out-of-slice base rate 41/103 = 0.398 the binomial
   gives 3.34e-11.) The direction of the error is *anti-conservative in the reported number's
   favour being understated* — the separation is real and if anything stronger. **The statistic
   is not the weak point; the truth source and the slice attribution are.**
3. **No multiplicity correction, inconsistently with the same file.** The shaded/non-shaded split
   was found by an exploratory search over this data — the whole document is a hunt for "what
   splits the class". The file *does* apply a max-statistic permutation correction to the SAM rule
   search (`:631-689`), yielding `p_value_corrected = 0.2927` over a 364-cell grid, and correctly
   concludes SAM does not arbitrate. The vocabulary split received a raw uncorrected binomial.
   The asymmetry of rigour is the finding, not the p-value.
4. **The p-value does not belong to `multiple_distinct_fields`.** Attributing 2.3e-7 to that
   answer value is the §1 conflation propagating into the statistic. On its own:
   - `multiple_distinct_fields` 18/19: binomial vs 0.5328 → **p = 1.13e-04**; Fisher 2×2
     `[[18,1],[55,63]]` → **p = 4.18e-05**, OR = 20.6.
   - `flat_field` 14/15: binomial vs 0.5328 → p = 1.12e-03.
   - The quoted 2.3e-7 is **~2,000× smaller** than the correctly-scoped `multiple_distinct_fields`
     figure. It is a pooled number being read as a per-value number.
5. **The one p-value that *is* correctly scoped to the policy is much weaker and is stated in the
   file.** `p_class_8_of_8_beats_shaded_rate` (`:1004-1006`) = binom_tail(8, 8, 0.6019) =
   **0.0172** — the right slice (B-unmapped) and the right answer value
   (`multiple_distinct_fields`), n=8. Re-derived: 0.017226…, matches. Fisher on the class,
   `[[8 right, 0 wrong], [13, 22]]` → p = 0.0014. Both are still scored against the flag.
6. **Neither p is corrected for the truth source's own noise.** With flag-vs-reviewer at κ=0.0625,
   a p-value against the flag has no calibrated translation into a p-value against the judge that
   binds.

---

## 4. Re-derivation from raw rows

**Reproduced exactly — every figure, from `cascade-sim-1.json` `per_item` +
`premise-disambiguation-1-analysis.json`, with an independent reimplementation of the truth rule
(`flag_gradient` + `in_primary` + `not conflicted_truth`).** No discrepancy found.

```
total per_item                          142
primary_scored (usable truth)           137        ✓ matches
NON-SHADED   n=34  right=32                        ✓ matches "32/34"
SHADED       n=103 right=62                        ✓ matches
  flat_field                 n=15 right=14         ✓ matches all_primary
  multiple_distinct_fields   n=19 right=18         ✓ matches all_primary
flat_base_rate                          0.5328     ✓ matches
p(X>=32 | 34, 0.5328)      2.3333984029686377e-07  ✓ matches 2.33e-07
binary of the 34 non-shaded    Counter({'flat': 34})       (all flat)
binary of the 103 shaded       Counter({'gradient': 103})  (all gradient)
CLASS (b_unmapped_d_committed)  n=44, with truth 43        ✓ matches
  CLASS multiple_distinct_fields  n=8  right=8             ✓ matches "8 of 8"
  CLASS shaded_field              n=35 right=22            ✓ matches "22 of 35"
distinct artwork_id            142 of 142 rows  (no rendition duplication)
--- primary-judge coverage ---
gold-30 rows with a reviewerBinary                24 of 30
of the 34 non-shaded, in gold-30 / with binary     4 / 2
of the 19 MDF,        in gold-30 / with binary     2 / 0
of the 8 policy items,in gold-30 / with binary     1 / 0
reviewer agrees with flag                         14 / 24   (κ = 0.0625)
--- properly specified tests ---
Fisher [[32,2],[41,62]]  one-sided  p = 6.21e-09  OR = 24.2
Fisher [[18,1],[55,63]]  one-sided  p = 4.18e-05  OR = 20.6
Fisher [[8,0],[13,22]]   one-sided  p = 1.40e-03
```

**What could not be reproduced:** nothing — the discrepancy is not arithmetic. **The claim
"D's `multiple_distinct_fields` is 32/34" cannot be reproduced for any reading of
`multiple_distinct_fields`**, because no `multiple_distinct_fields` slice has n=34: corpus-wide it
is n=19 (18 right), on the policy slice n=8 (8 right), and D emitted the value 20 times in total
across all 142 rows (19 in the primary population). The only n=34 in the vicinity is the pooled
non-shaded class. Correspondingly, **no computation in the repository produces 2.3e-7 for a
`multiple_distinct_fields` statistic**; the only occurrence of that value is
`p_non_shaded_beats_flat_base_rate`.

---

## 5. Supplementary provenance (bears on how far the result can travel)

Established by static reading of the prompt and run files:

- **B and D are the same model at the same rendition on the same images.** Identical `model_id`,
  `model_revision`, `quantization`, `weights_manifest_sha256`, `runtime_version`,
  `temperature=0.0`, `constrained_decoding=true` across all rows of `premise-run-1.jsonl` (B) and
  `premise-run-cd.jsonl` (D); byte-identical set of 142 `image_sha256`; per-image
  `processed_long_edge_px` matches pairwise for all 142. **A B/D difference is attributable to
  prompt wording alone** — which is a genuine strength of this comparison.
- **Identical vocabulary, same enum order** — `group-a.v2.variant-d.json:41-51` vs
  `group-a.variant-b.json:27-30`, canonical set at `common.py:100-107`. Both contain
  `multiple_distinct_fields` and `shaded_field`.
- **The wordings differ in criterion, and that is the mechanism behind the whole route.** B's rule
  is area-counting/one-surface and routes depicted places to `full_scene` ("a place with depth");
  D's rule is "one continuous colour progression vs discrete colour areas", explicitly demoting
  surface identity ("neither required nor decisive") and explicitly forbidding `full_scene` for
  photographs whose ground still reads as progression or areas — the Appendix R corrected criterion.
- **Consequence, measured:** D never emitted `full_scene`, `pattern_or_texture`, or
  `none_discernible` on any of the 142 items (D: `shaded_field` 107, `multiple_distinct_fields` 20,
  `flat_field` 15 → 142/142 mapped), whereas B emitted `full_scene` 38 and `pattern_or_texture` 6
  → 98/142 mapped. **D's near-total commitment is a property of its wording, not evidence that it
  sees more.** Combined with D committing `gradient` on 91.7% of gold-30 against a human 33.3%,
  the honest description of D is a near-always-commit instrument with a heavy gradient prior — for
  which "when it *does* say non-shaded, the flag is usually flat" is a plausible and unsurprising
  selection effect.
- **Related, and independently on the record:** the correlated-abstention finding in
  `PHASE_0_LOOSE_ENDS.md` A10 — the dense adjudicator abstains on 97.7% of the items where B
  abstains, both being Qwen3-VL (`cascade-sim-1.json` `section_6_caveats/same_model_family`). The
  B-unmapped route is where no available in-family instrument resolves anything, which is exactly
  why the truth question matters most there.

---

## What would settle it

Not a recommendation — a statement of what the existing artifacts show is missing. The policy
commits **8 items**; the answer value it gates on has **19** instances corpus-wide and **0** of
either set carry a reviewer `ground_type` answer with a usable binary. Eliciting the reviewer's own
`ground_type` on those items would move the measurement onto the primary judge for the exact
wording (D) and the exact answer value (`multiple_distinct_fields`) that Flo's condition names.
`PHASE_0_LOOSE_ENDS.md` B7 puts re-elicitation at "~3 minutes of reviewer time", and notes that this
cost "is the reason nothing should be shaped around avoiding it".

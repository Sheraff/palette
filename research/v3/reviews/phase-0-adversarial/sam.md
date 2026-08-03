# Adversarial review — SAM geometry stage

**Scope.** `research/v3/oracle/sam/` and `research/v3/data/sam/`. Audited 2026-08-03.
**Method.** Every published number in this scope was re-derived from raw data with independently
written code (Python, `oracle/sam/.venv/bin/python`), not by re-running the project's own analysis
scripts. Where a project script was used, it was used as *data* (e.g. reading the `AMENDMENTS`
tuple), never as the arithmetic. **No GPU work; no model load; no file modified outside this one.**

Known items from `PHASE_0_LOOSE_ENDS.md` are not re-reported. A12 (CJK below the cut) is baseline
and reproduces exactly: `chinese characters` recalls 4/4 CJK covers with zero false positives and
its best score anywhere is 0.4720, below the cut.

---

## Summary

| # | sev | claim | status |
|---|---|---|---|
| 1 | critical | "no area-fraction guard is needed" is circular AND falsified by the same round | CONFIRMED |
| 2 | major | "the concept groups did not separate" is refuted by the analysis's own criteria | CONFIRMED |
| 3 | major | `CALIBRATED_SCORE_THRESHOLD = 0.578` is rounded up; the published metrics do not hold at it | CONFIRMED |
| 4 | major | per-image summary aggregates are permanently baked at the 0.3 cut | CONFIRMED |
| 5 | major | `review_round_2.py` does not import under the current config; `selftest.py` says ALL PASS | CONFIRMED |
| 6–18 | minor | step-lock gaps, stale artifacts, undisclosed denominators, latent hazards | CONFIRMED |

Everything else in scope re-derived **exactly**. See "Confirmed clean" at the end — that list is
long and it is the honest other half of this report.

---

## 1. CRITICAL — "All 3 hallucination-signature masks fall below it, so no area-fraction guard is needed" is circular, and the same 60 masks contain a counterexample

**Published.** `data/sam/MASK_REVIEW_NOTES.md:41-42`; `PHASE_0_LOOSE_ENDS.md:107-109` (A6, marked
**CLOSED** on this basis); `oracle/sam/config.py:198-199`.

**The circularity.** The "hallucination signature" is *defined* by the sampler as
`area_fraction > 0.5 AND score < 0.5` (`data/sam/mask-quality-sample.json` → `selection.rule`;
restated at `oracle/sam/analyze-mask-quality.ts:435`). A mask matching that definition necessarily
scores below any threshold ≥ 0.5. The verdict string is computed over `forcedSurviving` only
(`analyze-mask-quality.ts:431, 454-467`), i.e. over the force-included subset alone. **The test can
never produce a counterexample**, so "no area guard is needed" carries no information.

**The falsification.** Re-derived from `mask-quality-sample.json` joined to the 60 warehouse labels:

| maskRowId | concept | score | area_fraction | reviewer | ≥ 0.578? |
|---|---|---|---|---|---|
| `8b4f2aadf3b1:sticker:0` | sticker | **0.6787** | **0.7807** | **no** | **YES — survives** |
| `ecf1191eb98a:sticker:0` | sticker | 0.5116 | 0.9406 | no | no |
| `ff0bc9c4e622:face:0` | face | 0.4262 | 0.5194 | no (forced) | no |
| `cbff25964afd:sticker:0` | sticker | 0.3744 | 0.8885 | no (forced) | no |
| `8b4f2aadf3b1:logo:0` | logo | 0.4334 | 0.7732 | no (forced) | no |

**5 of 5** masks in the sample with `area_fraction > 0.5` were rejected by the reviewer; **zero**
were accepted. One of them clears the calibrated cut with room. It is one of only **three** false
positives at that cut, the other two being `37a9174a754c:logo:0` (0.6270, area 0.073) and
`f0703ac121ea:person:2` (0.7713, area 0.0027).

**An `area_fraction > 0.5` guard costs zero true positives in-sample and removes one of the three
false positives**: precision 0.9062 → 0.9333 at unchanged recall.

**Corpus-wide** (`sam-eval-142.jsonl` and `sam-eval-142-v2.jsonl`, identical here): 10 regions with
`area_fraction > 0.5`; 3 match the signature (score < 0.5); **6 survive the 0.578 cut** — 5 `person`
and the same 0.6787 `sticker`. None of those 6 could ever have been force-included.

**The counterexample was computed and then dropped.** `analyze-mask-quality.ts:433` builds
`bigAreaRows = judged.filter(row => row.areaFraction > 0.5)` and emits it as `wholeSampleBigArea`
(`:468`). It never reaches the verdict string, and the verdict string is what was copied into all
three documents.

**Consequence.** A6 is closed against a tautology. The reviewer-owned question "does this instrument
need an area guard" has not been answered, and the round's own data says the answer is probably yes.

---

## 2. MAJOR — "the concept groups did not separate, so no per-group threshold is justified" is refuted by the analysis's own thresholds

**Published.** `MASK_REVIEW_NOTES.md:38-39`; `PHASE_0_LOOSE_ENDS.md:104-105`.

Re-derived per-group sweeps (partly excluded, candidate set = observed scores, ties → lowest, i.e.
the published treatment):

| group | n | own optimum | own J | J at pooled 0.577937 | gain |
|---|---|---|---|---|---|
| `text_like` | 31 | **0.697295** | 0.4783 | 0.3587 | **+0.1196** |
| `person_like` | 29 | 0.577937 | 0.6784 | 0.6784 | 0.0000 |

Against the analysis's own gates (`analyze-mask-quality.ts:88-89, 95`):

- separation `|0.697295 − 0.577937| = 0.1194` ≥ `PER_GROUP_MIN_SEPARATION` **0.05** → **passes**
- `text_like` gain 0.1196 ≥ `PER_GROUP_MIN_J_GAIN` **0.05**, n=31 ≥ `MIN_CELL_ANSWERS` 5 → **passes**
- `person_like` gain **0.0000** → fails

The only failing condition is structural. `person_like`'s own optimum **is** the pooled optimum —
the pooled cut is driven by `person_like` — so its gain is necessarily zero. Because the rule at
`analyze-mask-quality.ts:388` is `perGroup.every(entry => … gainOverPooled >= PER_GROUP_MIN_J_GAIN)`,
**the per-group test can never pass whenever one group defines the pooled cut**, which is the normal
case with two groups. The reported conclusion is a property of the `every()` quantifier, not a
measurement that the groups behave alike.

**What it costs.** At the pooled cut, `text_like` runs precision 0.875 / recall 0.609. At its own
0.697 it runs precision **1.000** / recall 0.478 (tp=11 fp=0 fn=12 tn=8). `text_like` is 4,165 of
4,863 regions in `sam-eval-142-v2` (86%), and 1,968 of the 2,366 that clear 0.578 — so the group
where a second threshold is warranted is the overwhelming majority of the instrument's output.

---

## 3. MAJOR — the stored constant 0.578 is a rounded-up display value; the published triple does not hold at it

**Published.** `config.py:195-201`; `MASK_REVIEW_NOTES.md:38-40`; `PHASE_0_LOOSE_ENDS.md:105-107`;
repeated at `oracle/premise/analyze_bcde.py:158-159`.

The sweep's candidate thresholds are the observed scores themselves
(`analyze-mask-quality.ts:238-244`, `Number(row.score.toFixed(6))`). The winning candidate is the
**observed score 0.577937**. The next score above it is 0.580005; there is nothing in between.

| threshold | precision | recall | J |
|---|---|---|---|
| **0.577937** (the calibrated cut) | 0.9062 | 0.6905 | **0.5140** |
| **0.578** (`CALIBRATED_SCORE_THRESHOLD`) | 0.9032 | 0.6667 | **0.4902** |

The published "precision 91%, recall 69%, J 0.514" is the first row. The stored constant is the
second: rounding up by 6.3 × 10⁻⁵ pushes the mask that *defines* the boundary to the wrong side,
turning one TP into an FN. The `[REVIEWED]` block at `config.py:193-200` states metrics its own
value does not produce.

Same defect in the alternative: the true weighted optimum is the observed score **0.643816**
(weighted J 0.3732, precision 0.9913, recall 0.4562 — reproduces the published J 0.373 exactly);
0.644 is the rounded display.

**Full replication note.** Both published sweeps reproduce exactly once the treatments are
recovered: `partly` is **excluded from both sides** (not documented in `MASK_REVIEW_NOTES.md`), and
the weighted sweep uses inverse-probability weights over **`concept|band`** cells drawn from
`sam-eval-142.jsonl` (`analyze-mask-quality.ts:150-167, 335`), not the `group|band` cells the sample
was stratified by.

---

## 4. MAJOR — every per-image summary aggregate is permanently baked at the 0.3 run cut, and nothing says so

`run_sam.py:66-74, 99-104` computes `masked_area_fraction`, `residual_field_fraction`,
`union_mask_rle` and every `<group>_union_area_fraction` over **all** instances at
`SCORE_THRESHOLD = 0.3`. `config.py:198-200` tells consumers "STORED ROWS keep using the low
run-time threshold … consumers should filter at `CALIBRATED_SCORE_THRESHOLD`". A consumer that obeys
gets regions at 0.578 and a residual at 0.3. The summary columns are not filterable — they must be
recomputed from the per-instance RLEs, which is possible but is nowhere stated.

Measured on `sam-eval-142-v2`, stored `residual_field_fraction` vs recomputed at 0.578:

- mean difference 0.0416, median 0.0088, **max 0.6668**
- **70 of 142** images differ by more than 0.01; **14** by more than 0.10

`run_sam.py:100-102` calls this field "the number the colorimetry stage runs on".

**It already leaked into a reviewer round.** `review_round_2.py` selects its mask items at
`config.CALIBRATED_SCORE_THRESHOLD` (`:300`) but renders the residual panels from
`image_row["union_mask_rle"]` (`:514`) — the 0.3 union. So round 2 asked the reviewer about a
0.3-cut residual while showing 0.578-cut masks, and the reviewer's "7 of 15 residuals only partly
field" verdict — the entire premise probe 4 was built on (`PROBE4_NOTES.md:15-17`) — is a judgment
about the 0.3 union.

Mitigating: the two covers probe 4 names are barely affected (0.427 → 0.429; 0.969 → 0.974), so
probe 4's conclusions stand. The general trap does not.

---

## 5. MAJOR — `review_round_2.py` cannot be imported under the current config, and `selftest.py` reports ALL PASS

```
$ .venv/bin/python -c "import review_round_2"
AssertionError: CONCEPT_LABELS out of step with config.CONCEPT_PROMPTS
```

`CONCEPT_LABELS` (`review_round_2.py:98-108`) holds 9 entries. `barcode` was added to
`CONCEPT_PROMPTS` for concept set v2.1 (`config.py:114-124`) without it, so the step-lock assert at
`:109` fires on import.

`selftest.py:97-101` imports `overlay` *on purpose*, with a comment explaining that the assert is
worthless unless something exercises it — and then does not do the same for `review_round_2`. The
model-free self-test prints ALL PASS while the round-2 sample builder is dead, and with it
`build-ratification-fixture.ts`, which has no test of its own (the only SAM test,
`tests/sam-mask-quality.test.ts`, covers round 1).

This is the exact failure mode the `overlay` step-lock was added to prevent, one file over.

**Answering the review question directly — pairs that SHOULD be step-locked and are not:**

| pair | site | state |
|---|---|---|
| `overlay.CONCEPT_COLORS` ↔ `CONCEPT_PROMPTS` | `overlay.py:45` | locked, exercised by selftest |
| `review_round_2.CONCEPT_LABELS` ↔ `CONCEPT_PROMPTS` | `review_round_2.py:109` | locked, **not exercised — currently failing** |
| `CONCEPT_GROUPS` membership ↔ a run's `concept_set_hash` | nowhere | **unlocked** (findings 6, 9) |
| group count ↔ analysis's two-group assumption | `analyze-mask-quality.ts:381` | **unlocked** (finding 7) |
| `SAM_TEXT_LIKE_CONCEPTS` ↔ `CONCEPT_GROUPS["text_like"]` | `analyze_bcde.py:157` | **unlocked, hand copy** (finding 10) |
| `model-manifest.json` `concept_set_hash` ↔ `common.concept_set_hash()` | nowhere | **unlocked, rotted** (finding 11) |
| test suite ↔ concept-set identity | `tests/sam-mask-quality.test.ts` | **no assertion at all** (finding 8) |

---

## Minor findings

**6. MINOR — `review_round.py:156`'s concept guard is one-directional.**
`stale = {run concepts} − {config concepts}` catches a run with *extra* concepts, never a config
with extra concepts. A v2 run (9 concepts) passes cleanly under a v2.1 config (10). A rebuild would
then produce **12 strata** (3 groups × 4 bands, `:254`) where the round was built on 8, and zero
`barcode` masks, without a word. `review_round_2.py:672`'s comment "raises if the run predates
concept set v2" is true only in the v1 direction.

**7. MINOR — `analyze-mask-quality.ts:381-388` hardcodes exactly two concept groups.**
`perGroup.length === 2` gates the whole separation test. Config now has three groups. A round-3
manifest carrying 3 groups yields `separation = null` → `perGroupWarranted = false`, and the summary
prints "separation n/a → one pooled threshold" (`:604-607`) **as though the test had run**. Silent
skip, no warning. (This is the same code path as finding 2, from the other direction.)

**8. MINOR — `tests/sam-mask-quality.test.ts` asserts nothing about concept-set identity.**
`:79` `assert.equal(cells.size, 8, "every band x group cell must be represented")` hardcodes
4 bands × 2 groups; `:153` matches the concept segment of `imageId` as `[a-z-]+`, so any tag passes.
Every assertion is against the frozen v1 manifest; nothing reads `config.py`.

**9. MINOR — `analyze_nesting.py` has no stale-run guard, and `mark_like` silently grew.**
Unlike `review_round.py` it performs no concept check (`:76-77` just indexes
`config.CONCEPT_GROUPS`), so pointing it at `sam-eval-142.jsonl` (v1) silently drops every
`logo`/`album-title`/`sticker` row and computes the rate over a smaller population. `mark_like` now
has 4 members (barcode) instead of the 3 the published table was computed under, and the committed
`data/sam/nesting-in-person.json` carries no `concept_set_hash`.
*(The published table itself still reproduces exactly — see "Confirmed clean".)*

**10. MINOR — the only duplicate of `0.578` outside `config.py`, next to a hand copy of a group.**
`oracle/premise/analyze_bcde.py:161` `SAM_CALIBRATED_SCORE_THRESHOLD = 0.578` and `:157`
`SAM_TEXT_LIKE_CONCEPTS = ("words", "letter", "lettering", "display-text")`, tagged `[INHERITED]`
from `config.py` with no import and no assert; `:819` writes the tuple into the analysis output as
provenance. The comment at `:158-159` also repeats "precision 91%, recall 69%", which finding 3
shows does not hold at 0.578. (Outside my owned path — reported, not edited.)

**11. MINOR — `data/sam/model-manifest.json` is two concept-set generations stale.**
It pins `concept_prompts` at the **pre-v1** 7-concept §8.3 set (`text`, `lettering`, `typography`,
`logo`, `sticker`, `person`, `face`) and `concept_set_hash` `5b8f2e69a08a…`. Written by
`pin_model.py:48, 63-64`; **read by nothing** — no code compares it to `common.concept_set_hash()`.
Harmless today, actively misleading to a reader.

**12. MINOR — "all 8 touch an edge" is tolerance-dependent and the tolerance is unstated.**
`SAM_DESIGN_NOTES.md:28-30`. Re-derived edge counts over the 8 PA instances at the calibrated cut:
6/8 at a 2% tolerance, 6/8 at 3%, **8/8 only at ≥5%**. Two badges sit 3.4% and 3.7% clear of the
bottom edge. Everything else in that claim reproduces exactly: 8 instances on 8 covers, area
fraction median **0.89%**, min **0.26%**, max **2.68%**, and the position breakdown 4 bottom-right-
or-left / 2 bottom-centre / 2 top-right under a bbox-centre quadrant rule.

**13. MINOR — per-concept yes-rates quoted on undisclosed denominators.**
`MASK_REVIEW_NOTES.md:43-44`. `face 67%` is 10/**15** — the one `partly` answer dropped — while the
concept holds 16 items; 10/16 = 62.5%. `logo` 3/5, `person` 9/13, `sticker` 2/8 and the four text
concepts are exact. Consistent with the primary treatment, but the treatment is never stated in that
file.

**14. MINOR / LATENT — overlay renders masks against an EXIF-untransposed base.**
`overlay.py:59` opens the base with `Image.open(...).convert("RGB")`; `common.decode_image:180`
applies `ImageOps.exif_transpose` before inference. On any EXIF-rotated image the masks and the base
disagree. `review_round.py:341` guards only on a size mismatch, which catches 90°/270° but not
180°/mirror. **Zero** eval-142 images carry a non-trivial orientation tag today; this is a
corpus-run hazard only.

**15. MINOR / LATENT — content-hash resume silently drops duplicate images in a collection run.**
`run_sam.py:197-200` keys on `row_key(image_sha256)` alone, so the second path of any
content-duplicate pair is skipped with **no row at all** — not even a `status` row recording that it
was deduplicated. Immaterial for the 142-image eval set; material for a `--collection` run.

**16. MINOR — `PROBE4_NOTES.md:123`, determiner effect misstated.**
"`the car` scores 0.01–0.04 higher on four of five". Re-derived: higher on **5 of 5**, by
**0.006–0.027** (0.8459→0.8725, 0.9253→0.9314, 0.9246→0.9330, 0.8893→0.9022, 0.9170→0.9279). The
conclusion (determiner does not matter) is unaffected.

**17. MINOR — the calibration has no decision record.**
`data/decisions/decisions.json` holds 64 records and **0 mention SAM at all**.
`CALIBRATED_SCORE_THRESHOLD` is tagged `[REVIEWED]`, closed loose end A6, and is exactly the kind of
standing decision `CONVENTIONS.md:60-68` requires a record for. The only SAM-adjacent record found
anywhere is the concept-set v2.1 text quoted at `decisions.json:702`, which is not a decision record
about the threshold.

**18. MINOR — the cited calibration artifact does not exist.**
`config.py:194` and `MASK_REVIEW_NOTES.md:36` cite `data/sam/mask-quality-analysis.json` as the
provenance of the calibrated threshold. Neither it nor `mask-quality-analysis.txt`
(`analyze-mask-quality.ts:42-43`) is on disk, and neither is gitignored. The numbers are
regenerable — this review regenerated them — but the named evidence file is absent.

---

## Confirmed clean — re-derived exactly, no finding

Stated because a review that only lists defects misrepresents the instrument.

**`PROBE4_NOTES.md`** — every cell of the 14-phrasing table recounts exactly from
`probe-4-scripts-objects.jsonl` (fired / fired≥0.578 / TP / FP / FN), including
`chinese characters` 4 / 0 / 4 / 0 / 0 (precision 1.00, recall 1.00, n=4),
`car` and `the car` 5 / 5 / 5 / 0 / 0, `vehicle` 6 / 5 / 5 / 1 / 0,
`barcode` 1 / 1 / 1 / 0 / 1 (precision 1.00, recall 0.50, n=2), `text` **0/16**, `words` 12 / 6 / 9 / 3 / 2,
`watermark` 9 fired / 4 above the cut. All max-score listings (`:99-105`) match to the digit,
including `chinese characters` topping out at 0.4720 and `barcode` at 0.9397. `car` and `the car`
return identical instance counts (1,1,1,2,1) on the same five covers.

**`VOCAB_PROBE_NOTES.md`** — all 16 phrasings × 5 columns exact, and all 16 max scores exact.
`parental advisory` 5/5 PA, 0/6 EMB, 0/2 TXT, 0/2 NEG, per-image scores **0.8087–0.9153**
(published 0.81–0.92). **Zero false positives on both negatives across all 16 phrasings** —
confirmed literally: those two covers produce 0 instances under any phrasing. Calibrated-cut line
exact (`sticker` 3/15, `album title` 6/15, `logo` 7/15). The per-image PA-region best-score table
(`:126-132`) reproduces exactly under an independent IoU ≥ 0.5 region match. The bbox-IoU novelty
analysis (`:114-120`) reproduces exactly, all seven rows. **"`sticker` keeps 0 of 5 PA marks at the
calibrated cut" is confirmed** — its two PA-region hits are 0.3558 and 0.3912; the 0.5979 hit on
that cover is the chain pendant, a different region. `config.py:156-158`'s co-firing claim ("`logo`
masks the PA badge at 0.556–0.805, `sticker` on 2 of 5") also reproduces exactly.

**RLE.** `pycocotools` **is** installed in the venv, so `selftest.py:126-137` is a real test, not a
silent skip — and it is weaker than it needs to be (one 51×83 random mask, encode direction only).
Independently cross-checked **both** directions against `pycocotools` over **455 real stored masks**
from `sam-eval-142-v2`: **0 mismatches**. The hand-checked known vector (`:46-56`) is correct, the
delta-coding start index (`i > 2`) and the sign/continuation handling match the reference C, and the
round-trip is not merely self-consistent.

**Aggregation.** Recomputed `masked_area_fraction`, all three `<group>_union_area_fraction` and
`residual_field_fraction` from the per-instance RLEs across all 142 images: **0 mismatches**, and
every stored `union_mask_rle` equals the recomputed union. The group union genuinely **deduplicates**
— `sum(area_fraction)` differs from `masked_area_fraction` on **135 of 142** images. Every stored
`area_fraction` equals its own mask's pixel count over the image area. `residual = 1 − masked`
exactly.

**`concept_set_hash` / `row_key`.** The hash does change across all three sets, as claimed:
v1 `848359e5f158…` (8 concepts), v2 `402de9d8d3a0…` (9), v2.1 / current `9c78298f3c99…` (10). Every
stored run carries exactly **one** hash — `sam-eval-142.jsonl` v1, `sam-eval-142-v2.jsonl` v2, the
three smoke runs the pre-v1 `5b8f2e69a08a…`. `mask-quality-2-sample.json` correctly records
`402de9d8…`. **No analysis mixes rows from different hashes today.** (What is unguarded is the
future: findings 5, 6, 9.)

**Evidence chain, round 1.** All 60 warehouse labels join 1:1 to manifest items with no duplicates
and no orphans. For all 60, the served overlay filename and sha256 match the manifest, the overlay
PNG is still on disk and **still hashes to what the reviewer was served**, and `stratum` and
`questionKey` agree with the manifest. The reviewer saw the masks the analysis thinks they saw.

**Sample composition.** Quotas 57 + 3 forced = 60; **max 2 masks from any one artwork** (49 distinct
artworks) as the rule states; `cellShortfall` 0. `cellPopulations` reproduce from
`sam-eval-142.jsonl` under round 1's frozen group definition, with a 3-row delta fully explained by
the forced rows being removed from the pool before quotas.

**Nesting table** (`SAM_DESIGN_NOTES.md:35-46`) — independently recomputed at containment ≥ 0.80,
exact at both cuts: at 0.578, **77** mark_like instances on **47** images, **12** bbox-nested
(15.6%), **9** mask-nested (11.7%), **0** inside a person covering >50%, **7 of 142** images (4.9%);
at 0.3, **168** / **42** (25.0%) / **30** (17.9%).

**Probe-3 salience table** (`SAM_DESIGN_NOTES.md:80-91`) — all 10 phrasings × 3 columns exact,
including "the background" 5 fired / 5 above the cut / 6 instances and "the eye-catching element"
7 / 6 / 72.

**`PROBE5_NOTES.md`** (outside the enumerated scope, spot-audited) — all **21** per-noun rows and
all **4** per-class rows reproduce exactly once `marginal` is read as *excluded from both sides* and
the `AMENDMENTS` tuple is applied. Not a defect: the table is fully recomputable from
`probe-5-noun-breadth.jsonl` plus `probe_noun_breadth.py:283-322`.

**Other machinery reviewed without finding.** The canary digest and halt path
(`run_sam.py:114-122, 239-261`), the attempt ledger's persist-before-inference ordering
(`common.py:319-347`), per-axis bbox clamping for non-square images (`common.py:471-477`), the
JSONL sink's flush+fsync per record, and `read_jsonl`'s tolerance of a truncated final line.

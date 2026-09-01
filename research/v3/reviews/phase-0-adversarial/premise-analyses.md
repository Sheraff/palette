# Adversarial review — the VLM premise analyses

**Scope.** `research/v3/oracle/premise/` (`common.py`, `analyze.py`, `analyze_bcde.py`,
`analyze_b_unmapped_class.py`, `derive_probes.py`, `simulate_cascade.py`, `PREMISE_NEXT.md` §15
claims) and `research/v3/data/oracle-premise/` (`premise-run-1.jsonl`, `premise-run-cd.jsonl`,
`group-bcde-pilot-1.jsonl`, `cascade-sim-1.json`, `b-unmapped-class-analysis.json`,
`bcde-pilot-1-analysis.json`).

**Method.** Every headline number was re-derived from the raw JSONL with independently written
code (scratch, not committed) and diffed against the published artifact. No file in the repo was
modified. No GPU path was executed. Kappa was hand-verified end to end on one field.

**Bottom line on the arithmetic: every published number in scope reproduces.** Not one
mismatch beyond a 4th-significant-digit rounding artefact (finding 11). The findings below are
about *how the numbers are produced and counted*, not about the numbers themselves.

---

## What was re-derived and confirmed correct

| claim | published | re-derived |
|---|---|---|
| run-1 A/B inter-variant, all 5 fields | raw 0.708 / 0.8102 / 0.6569 / 0.8686 / 0.9927; κ 0.6097 / 0.5786 / 0.4514 / 0.5997 / 0.0 | identical to 4 dp |
| run-1 per-variant vs flags | A strict 0.6131/κ0.210 n137, mapped 0.7143/κ0.446 n77; B strict 0.6642/κ0.311, mapped 0.7447/κ0.4835 n94 | identical |
| run-cd C/D inter-variant, all 5 fields | raw 0.4599 / 0.4307 / 0.8832 / 0.8613 / 0.9854; κ 0.2342 / 0.1781 / 0.7945 / 0.6449 / 0.0 | identical |
| run-cd per-variant vs flags | C 0.5766/κ0.126; D 0.6861/κ0.3924 (both n=137, D never abstains) | identical |
| variants-agree breakdowns | A/B 97 identical, 101 same-binary, 36 disagree; C/D 63 / 64 / 73 | identical |
| BCDE 11 single-value κ | has_text 0.9657, physical_media_scan 1.0, medium 0.8146, has_dominant_subject 0.6618, text_dominance 0.7284, subject_area_band 0.607, has_signature_color 0.4865, color_character 0.7223, grain_or_noise 0.5255, subject_kind 0.9312 (n=123), signature_carrier 0.7091 (n=113) | identical, and gate-open subsets are the ones §15.7 registered |
| BCDE multi-select | text_roles exact 0.7817 / Jaccard 0.9123; overlays 0.8169 / 0.8345; all per-value κ ≥ 0.40 | identical |
| BCDE contradictions | only c12 fires, 13 rows, pooled rate 0.0458, E 4 / F 9 | identical |
| BCDE tiers | 43 thumbnail / 88 standard / 11 large (§15.5) | identical |
| cascade routes (142) | 70 bulk-agree / 28 BD-disagree / 44 B-unmapped / 0 / 0; routed share 0.507 | identical |
| cascade routes (primary 137) | 68 / 26 / 43 | identical |
| correlated abstention | P(dense abstains \| B abstains) = 0.9767 (42/43); P(dense abstains) = 0.5109; P(\| B commits) = 0.2979 | identical |
| vocabulary gate | D non-shaded 32/34, D shaded 62/103, flat base rate 0.5328 | identical |
| B-unmapped class | n=44 (43 with truth), take-D 30/43 = 0.6977, mdf 8/8, shaded 22/35, A unmapped on 43/44 | identical |
| A10's derived figures | take-D policy lifts commitment to 0.9489; B-unmapped is 31.0% of items and 62% of routed traffic | identical |

**Hand-verified kappa (`has_signature_color`, the one that clears its bar by 0.036).**
Contingency over 142 paired images: (no,no)=11, (yes,yes)=113, (yes,no)=16, (no,yes)=2.
E marginals no=13 / yes=129; F marginals no=27 / yes=115.
Po = 124/142 = 0.873239. Pe = (13/142)(27/142) + (129/142)(115/142) = 0.017408 + 0.735716 =
0.753124. κ = 0.120115 / 0.246876 = **0.486541** → published 0.4865. The implementation in
`analyze_bcde.py:188-204` is textbook multi-class Cohen's κ and is correct; so is the
independent second implementation in `analyze.py:290-303`.

**Parse/row accounting (audit item 4).** `group-bcde-pilot-1.jsonl`: 299 physical lines, 0
undecodable, 15 canary, 284 non-canary, all `status: ok`, 0 `parse_failed`, 0 duplicate
`row_key`, 0 duplicate `(sha, variant)`, 142 distinct sha × 2 variants (E/F), one `run_id`, one
`schema_version`. Nothing is dropped between the raw file and the analysis. The same shape holds
for `premise-run-1.jsonl`, `premise-run-cd.jsonl` and the bake-off adjudicator file. Note that
"299 ok" counts the 15 canaries; the analysis's own block is honest about this
(`rows_total_including_canaries: 299`, `rows: 284`, `ok: 284`).

**Gold-30 handling (audit item 5) — clean.** `premise-disambiguation-1-analysis.json` holds 30
`perArtwork` entries, 30 distinct sha256, all `answered: true`, no duplicate sha. All 30 join
into the 142-image universe. `eval-set.json` has 144 entries with **144 distinct `artworkId`** —
no artwork appears at two renditions anywhere in this workstream, so there is nothing to pool and
nothing to double-count. `analyze.py`'s own `population.distinct_artworks` is 137 for 137 primary
images (1:1). `simulate_cascade.py:281` filters on `answered` before keying by sha; the 6 items
with `reviewerBinary: null` are correctly excluded from every binary comparison and reported as
`reviewer_no_prediction_n`. `analyze_b_unmapped_class.py:94` omits the `answered` filter, which
is harmless only because all 30 are answered.

**`simulate_cascade.py` offline honesty (audit item 3) — passes.** `cascade()` (`:108-181`)
consumes only the three arms' `ground_type` values; no truth, flag or reviewer label reaches any
routing decision. `policy_label()` (`:547-566`) is likewise truth-blind, and the two free
baselines (`always_flat`, `always_gradient`) are the right adversarial controls to include. The
strict view's "None counts as flat" rule is disclosed in the caveat block and its beneficiary
(variant D, which never abstains here) is named. Route counts reproduce exactly from the raw
runs. The one structural weakness is finding 2 below.

---

## Findings

### 1. MAJOR — `analyze.py` publishes a complete, well-formed agreement report from a missing input, including an affirmative `canary_stable: true` computed over zero canary rows

`analyze.py:139` and `:156` call `common.read_jsonl` (`common.py:448`), which returns `[]` for a
path that does not exist. Verified empirically against a nonexistent path: the script **exits 0**
and writes a full `*.agreement.json` with `health.rows: 0`, `per_variant: {}`, `per_variant_p6:
{}` — and `canary.stable: true`, because `canary["stable"]` is `len({...}) <= 1` and the empty
set satisfies it (`analyze.py:161`). A safety property that exists precisely to halt a run
(§5.3, exit 3) reports itself satisfied from no evidence at all.

This is the named `read_jsonl` hazard at its worst call site: `analyze.py` produced both published
agreement artifacts in scope, `premise-run-1.agreement.json` and `premise-run-cd.agreement.json`.
Their contents are correct today — I re-derived every number in them — but the guard that would
have told anyone otherwise does not exist. Contrast `analyze_bcde.py:750-758`, which is the only
call site in the workstream that reasons about this hazard explicitly and asserts against it.

**Fix:** one `if not path.exists(): raise SystemExit(...)` before line 139, and make
`canary.stable` `None`/`"no canary rows"` rather than `True` when `canary_rows` is empty.

### 2. MAJOR — `simulate_cascade.py` twice documents an adjudicator-coverage assertion that does not exist; a partial adjudicator file silently manufactures A10's headline finding

`simulate_cascade.py:64`: *"Coverage of all 142 is asserted at load, not assumed."*
`simulate_cascade.py:148-151`: *"No adjudicator row for this item. **Asserted impossible at
load**; kept so a future partial adjudicator file degrades to 'undetermined' rather than to a
crash or, worse, a silent bulk guess."*

There is no such assertion. The only two asserts in `main()` are `:240` (duplicate row within an
arm) and `:261` (`bulk_D_missing_shas`). Adjudicator coverage is *recorded* as a boolean in
`coverage.adjudicator_covers_all_bulk_items` and never checked.

Why it matters more than the usual missing-assert: the adjudicator file is
`data/oracle-bakeoff/qwen3-32b-dense.jsonl` — a **cross-workstream path this workstream does not
own**. If it is renamed, re-sharded, or partially regenerated, every uncovered routed item takes
the `label_source: "none:adjudicator_missing"` branch and lands `binary: None` — i.e. undetermined
— which is *the exact direction of A10's headline*: "when bulk-B abstains the dense adjudicator
abstains too on 97.7%", "that route contributes nothing", "dropping it is ~free". A silently
truncated adjudicator file produces a stronger version of the same conclusion, and the only thing
that would reveal it is a boolean nobody is required to read. A fully-missing file does crash, but
by accident and late — `median([])` at `:612` raises `IndexError` only after the whole report body
has been computed.

Today the input is complete: I independently confirmed 142/142 adjudicator coverage, 0 extra
shas, item sets `eval142: 112` + `gold30: 30`, no duplicate sha.

**Fix:** `assert not coverage["adjudicator_missing_shas"]` beside the existing `:261` assert, or
delete the two comments that claim it is already there.

### 3. MAJOR — the "42 of 45 pre-registered bars" tally counts 9 verdicts that §15.6-2a registers as *reports*, not bars — and the script's own constant comment says so

`bcde-pilot-1-analysis.json` publishes `verdict_summary: {pass: 42, fail: 3, report_only: 4}`.
Checked against the §15 pre-registration bar by bar, 9 of those 45 pass/fail verdicts were not
registered as pass/fail:

- **4× `15.6-2a.{field}.zero_cells`.** PREMISE_NEXT.md:992 registers this as *"a value that fires
  zero times across 142 images **is reported as possibly unanswerable**, with its stem quoted"* —
  a reporting obligation. `analyze_bcde.py:404-406` converts it to a hard `pass`/`FAIL`.
- **5× the §15.6-2a priors** (`has_text_yes`, `illegible_fires_on_thumbs`,
  `physical_media_scan`, `grain_or_noise`, `overlays_can_say_yes`). PREMISE_NEXT.md:993-1001
  labels the whole table *"Priors, stated as priors and not as measurements `[UNCALIBRATED]`"*,
  with a column headed *"what would be alarming"*. `analyze_bcde.py:90-94` agrees in writing —
  *"Each is 'what would be alarming', so each is a flag, **not a pass/fail of the schema**"* — and
  then `:423-435` issues five pass/fail verdicts on exactly those constants. The comment and the
  code four lines apart contradict each other.

Evaluated as registered, the tally is **35 pass / 1 FAIL out of 36 bars**, with 9 additional
report-only observations. Both the numerator and the denominator of "42 of 45" are inflated.

Separately, 2 of the 3 published FAILs are one fact counted twice:
`illegible_at_this_size` fires 0 times anywhere in the run (I re-derived: 0 of 284 rows), which
trips both `15.6-2a.has_text.zero_cells` and `15.6-2a.illegible_fires_on_thumbs`. The only
verdict that fails a bar §15.6 actually registered as a bar is
`15.6-2b.has_signature_color` (modal share 0.8592 > 0.85 — re-derived exactly).

This does not change any measurement. It changes what "42 of 45 pre-registered bars passed" means
to a reader who has not opened §15.6.

### 4. MINOR — `b-unmapped-class-analysis.json` publishes `A_confidence` sourced from a different model than its sibling `A_ground_type`

`analyze_b_unmapped_class.py:91`:

```python
run_a = {r["image_sha256"]: r for r in read_jsonl(RUN_B) if r.get("prompt_variant") == "A"}
```

`RUN_B` is `premise-run-1.jsonl`, whose variant A is **Qwen3-VL-30B-A3B-Instruct-6bit** — the bulk
model's *other* group-a.v1 prompt. But `A_ground_type` / `A_binary` on the same record
(`:179-180`) come from `cascade-sim-1.json`, whose adjudicator is
**Qwen3-VL-32B-Instruct-8bit**. Both fields are emitted side by side into the published `per_item`
block (`:1120-1122`) under the same `A_` prefix, and `A_confidence` is the only one of the three
that is not the adjudicator's.

The two models are genuinely different instruments: their variant-A `ground_type` differs on
**34 of 142** images. The defect is masked today only because `confidence` is degenerate — both
models answer `high` on all 142 images, so the published values are identical on 44/44 class
records whichever source is used. It becomes a wrong published value the moment `confidence` stops
saturating.

### 5. MINOR — the published `summary_lines`, which are A10's source, mix computed interpolation with hardcoded literals

`analyze_b_unmapped_class.py:1070-1099` builds the human-readable summary as f-strings in which
some numbers are interpolated from the computed blocks and others are typed in. Hardcoded:

- `"D reads shaded_field on 36 and multiple_distinct_fields on 8"` (`:1077`)
- `"commits 14 with 13 right"` (`:1088`)
- `"does not reproduce out of class (5/9 on BD-disagree) or on settled items (AUC 0.47)"` (`:1091`)
- `"37% of thumbnails land here vs 9% of large images"` (`:1087`)
- `"multiple_distinct_fields 8/8 right, shaded_field 22/35 … (non-shaded 32/34)"` (`:1096`)

I checked every one against the computed block in the same file and all are correct today
(`class_rate_by_tier` 0.3721 / 0.3068 / 0.0909; `residual>=0.90` commit_n 14 / right 13;
`out_of_class_check_bd_disagree` 5 of 9; `sanity_bulk_agreement` AUC 0.4683; `D_ground_type
_reliability.in_class` mdf 8/8 and shaded 22/35; `all_primary` 18/19 + 14/15 = 32/34). The point
is that they are not *derived* — a changed input moves the interpolated half of a sentence and
leaves the literal half behind. These are precisely the numbers A10 and the file's own `verdict`
quote.

### 6. MINOR — the multiplicity correction is applied only to the hypothesis that was rejected, not to the rule that was recommended

The SAM residual-geometry hypothesis is killed by a max-statistic permutation test over a
364-rule grid (`:635-695`), corrected p = 0.2927. Correct and commendable practice.

The rule that replaces it — *"commit only when D answers `multiple_distinct_fields`"* — is scored
by `binom_tail(8, 8, 0.6019) = 0.0172` (`:1004-1006`), a plain one-sided binomial with the null
parameter estimated from the same data, on the same 43 items that suggested the rule, with no
correction of any kind. `GRID_FEATURES` (`:635-639`) contains SAM numeric features only, so the
recommended rule is not in the search space the correction covers, even though
`candidate_rules` (`:558-561`) shows D's own answer and D's confidence were both searched
alongside the SAM features. Two hypotheses examined on one 43-item sample got opposite standards
of evidence, and the surviving one got the lenient standard.

Mitigating, and not stated in the report: the D-vocabulary gate *does* corroborate outside the
class — `all_primary` mdf 18/19 and flat_field 14/15, `in_bulk_agreement` mdf 10/11 and flat_field
14/15. That is the argument the file should be making instead of the uncorrected p.

Also worth stating plainly: for a non-shaded D answer, `D_right` is definitionally
`truth == flat`, since both `flat_field` and `multiple_distinct_fields` map to flat. "32/34 right"
therefore *is* "32 of those 34 covers carry a flat flag". The binomial against the 53.3% flat base
rate is the right correction for that and it is applied; the mirror test for the shaded answers
(62/103 against the 46.7% gradient base rate) is not run.

### 7. MINOR — `derive_probes.py` writes a valid all-zero derivation report and exits 0 from a missing results file

`derive_probes.py:48` → `read_jsonl` → `[]` → `variants = []` → mode falls through to `"bundled"`
→ zero rows emitted → a fully-formed `*.derivation.json` with `input_rows: 0`, `derived_rows: 0`,
`dispositions: {}`, `unsure_rate: null`, and **exit 0**. Verified empirically. Dormant — the probe
arm has never run (loose end B3) — but it is a live call site of the named hazard, and the §13
item 4 guarantee it exists to enforce ("a row missing any of its six probes must derive
`underdetermined:incomplete` rather than being silently dropped") is vacuous over an empty file.

### 8. MINOR — the §15.6-2b non-degeneracy bar is diluted by gate-driven `not_applicable`s on the five conditional fields

`analyze_bcde.py:372-383` computes the modal share for every field over all pooled rows,
including rows where a gate forced `not_applicable`. For the five conditional fields
(`text_roles`, `text_dominance`, `subject_kind`, `subject_area_band`, `signature_carrier`) the
`not_applicable` rows act as filler that lowers the modal share and makes the 85% bar easier to
clear. §15.7 is explicit about exactly this inflation for kappa — *"Computed over all rows it is
inflated by agreeing `not_applicable`s, and that number must not be quoted alone"* — and the
script correctly restricts kappa to the gate-open subset. The degeneracy bar gets no such
treatment.

No verdict flips today. Re-derived on the gate-open subsets: `subject_kind` person 146/251 =
0.582 (pooled 0.5141), `signature_carrier` background 142/244 = 0.582 (pooled 0.50) — both still
well under 0.85.

### 9. MINOR — `overlays` returns a single value on 95.4% of rows, which meets a §15.8 "what would make this schema wrong" condition, and is filed `report_only` with no flag raised

PREMISE_NEXT.md:1112: *"**Multi-selects that only ever return one value.** If `text_roles` is a
singleton on ~every row, the array machinery bought nothing and the field should be a plain enum
in v2."* `text_roles` is fine (singleton rate 0.2324, re-derived). **`overlays` has a singleton
rate of 0.9542** (re-derived; published 0.9542). `analyze_bcde.py:734-737` emits this as
`report_only` with the honest bar text "no numeric bar pre-registered", which is literally true —
§15.8 names `text_roles` and gives no number. But the condition §15.8 describes is met by
`overlays`, and nothing downstream of `verdict_summary` would surface it, because `report_only`
verdicts are not in `failed_ids`.

### 10. MINOR — cross-run canary continuity lapses silently if the output file is renamed

`run_premise.py:258` reads prior canary rows via `read_jsonl(args.out)`. On a missing/renamed
output the list is empty, `canary_baseline` stays `None`, and the resumed run rebases the canary
on its own first answer instead of comparing against the earlier run's. Within-run stability is
still enforced (exit 3 on mismatch), so this is bounded: it can only lose a cross-run drift
signal, never fabricate a pass. The two other `read_jsonl` call sites in the resume path
(`common.completed_keys` at `:468`, `AttemptLedger.__init__` at `:482`, plus
`run_premise.py:135`) return empty on a missing file *by design* — that is the correct semantics
for a fresh run and is not a defect.

### 11. TRIVIAL — `p_non_shaded_beats_flat_base_rate` published as 2.33e-07, re-derives to 2.34e-07

`analyze_b_unmapped_class.py:1001-1003` passes `flat_prior` — which is `pct(...)`, i.e. already
rounded to 4 decimal places (0.5328) — as the null parameter of `binom_tail`. The unrounded value
is 73/137 = 0.5328467. Published **2.33e-07**, re-derived from the unrounded base rate
**2.34e-07**. Immaterial to the conclusion; recorded because the brief asked for every mismatch,
and because rounding a parameter before a tail probability is a habit worth not keeping.

---

## `common.read_jsonl` — complete call-site enumeration

`common.py:448-462` returns `[]` for a nonexistent path (and silently drops any line that fails
`json.loads`, which is deliberate and documented for kill-truncated records).

| # | call site | behaviour on missing/renamed input | verdict |
|---|---|---|---|
| 1 | `analyze.py:139` (`--results`) | **silent**: exit 0, full report, `canary_stable: true` over 0 rows | **finding 1, major** |
| 2 | `analyze.py:156` (canary re-read) | same call, same file — folds into #1 | finding 1 |
| 3 | `analyze_bcde.py:249` (`--results`) | crashes — but *by accident*, at `max()` over an empty generator (`:292`), three lines after `ok_rate` has already silently become `None` | safe today, not by design |
| 4 | `analyze_bcde.py:755` (SAM) | **guarded**: `:753` `if not args.sam.exists(): raise SystemExit`, plus `:758` empty-join guard. The only call site in the workstream that reasons about the hazard | correct — the model for the others |
| 5 | `simulate_cascade.py:233` via `arm_rows`, bulk B | crashes downstream (`universe` empty → `median([])`) | latent |
| 6 | `simulate_cascade.py:233` via `arm_rows`, bulk D | caught by the `:261` assert | correct |
| 7 | `simulate_cascade.py:233` via `arm_rows`, **adjudicator** | **partial file: silent** — every uncovered item becomes `none:adjudicator_missing`; full file missing: late `IndexError`. Comments at `:64` and `:148` claim an assert that does not exist | **finding 2, major** |
| 8 | `derive_probes.py:48` (`--results`) | **silent**: exit 0, valid all-zero derivation report | **finding 7, minor** |
| 9 | `common.completed_keys:468` ← `run_premise.py` | empty by design — correct fresh-run semantics | correct |
| 10 | `common.AttemptLedger.__init__:482` | empty by design — correct | correct |
| 11 | `run_premise.py:135` (`existing_rows`) | empty by design — correct | correct |
| 12 | `run_premise.py:258` (`prior_canary`) | silently loses cross-run canary continuity | **finding 10, minor** |

`analyze_b_unmapped_class.py:62` defines its **own** `read_jsonl` with no `exists()` check and no
`JSONDecodeError` tolerance, so it raises `FileNotFoundError` on a missing input — safer than
`common`'s, and a divergence worth knowing about since the two share a name.

---

## Not findings — checked and clean

- **Two independent kappa implementations** (`analyze.py:290-303`, `analyze_bcde.py:188-204`)
  agree with each other and with a hand computation. The `expected >= 1.0 → undefined` branch is
  the right treatment for two constant raters, and `confidence` κ = 0.0 in both group-A runs is
  arithmetically exact (one rater constant ⇒ Po = Pe), not a bug — it is the §15.6-2 degeneracy
  signature working as intended.
- **Prompt/schema hash identity.** Every BCDE row carries one of the two §15.2 hashes, the files
  on disk still hash to those values, and the superseded-v1-probe-hash refusal
  (`common.py:140-193`) is wired into both prompt loading and row scanning.
- **No selection on results.** The BCDE pilot is the full 142 with tiers 43/88/11, matching
  §15.5's "do not select a subset" exactly.
- **§15.7 gate-open subsetting** is done as registered for both `subject_kind` (n=123) and
  `signature_carrier` (n=113), with the either-variant subset reported beside it.
- **SAM cross-instrument join**: 142/142 pilot images have a SAM image record; the disagreement
  counts are re-derived exactly (37 `typography_only` rows, 3 with no SAM text; 0 `has_text: no`
  rows where SAM found text; 23 `has_text: yes` rows where SAM found none) and are correctly
  framed as disagreement counts rather than accuracy.
- **A10's documented content** is accurate as written; nothing found here is worse than what A10
  already records. Finding 2 is about the machinery that produced it, not about the number.

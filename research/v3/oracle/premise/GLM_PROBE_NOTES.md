# GLM out-of-family probe — feasibility, and why it stopped at the gate

> **SUPERSEDED IN PART, 2026-08-04 (later the same day).** The gate below was the *feasibility
> scout's* gate, and the reviewer subsequently lifted it in as many words: "if we think it would be
> useful, we can download 48.5 GB. We just need to remember to delete it if it turns out not to be
> useful." The download happened, the probe ran, and the result is in **§ THE PROBE THAT ACTUALLY
> RAN** at the bottom of this file. Everything between here and there is the pre-download record
> and is left unedited, because its size table, its licence findings and its "what the probe would
> run" section were all confirmed correct by the run.
>
> **Bottom line: the weights were deleted.** GLM-4.5V never once corrected Qwen on a
> reviewer-grounded item (0 of 19), while costing 4.8x the GPU time per inference.

**Measured 2026-08-04. Nothing was downloaded. No inference was run. No decision is made here.**

This is the CPU-feasibility half of loose end **A10**'s "out-of-family adjudicator" candidate.
A10 (`PHASE_0_LOOSE_ENDS.md` §A10) records that when bulk-B abstains, the dense adjudicator
abstains too on **97.7%** of those items — *correlated* abstention, both models being Qwen3-VL —
and that "the cascade cannot be fully trusted until an out-of-family adjudicator exists (all
measured local candidates failed: Gemma accuracy, InternVL blocked)". GLM-4.5V was the remaining
untried candidate.

## Verdict: the hard gate fails. GLM-4.5V is not runnable here.

The gate for this task was: **no MLX conversion, or a download over ~15 GB, means stop.** MLX
conversions exist and are healthy — the problem is size, by a factor of three at the very
smallest.

| repo | total download | weights | license | verdict |
|---|---|---|---|---|
| `mlx-community/GLM-4.5V-3bit` | **48.53 GB** | 48.50 GB | MIT | over gate 3.2x |
| `mlx-community/GLM-4.5V-4bit` | **61.88 GB** | 61.86 GB | MIT | over gate 4.1x |
| `mlx-community/GLM-4.5V-5bit` | ~77 GB | — | MIT | over gate |
| `mlx-community/GLM-4.5V-6bit` | ~92 GB | — | MIT | over gate |
| `mlx-community/GLM-4.5V-8bit` | **115.29 GB** | 115.27 GB | MIT | over gate 7.7x |
| `zai-org/GLM-4.5V` (upstream, not MLX) | 215.45 GB | 215.42 GB | MIT | reference only |

Sizes read from the HuggingFace model API (`?blobs=true`, summing `siblings[].size`) on
2026-08-04, not estimated. Licensing is not the obstacle: every one of these is **MIT**, which is
more permissive than the pinned Qwen arm.

**Why it is so large.** `GLM-4.5V` is `model_type: glm4v_moe` — a 106B-parameter mixture of
experts, 46 text layers, hidden size 4096, **128 routed experts**. The experts are what cost the
disk. Even a 3-bit quantisation of 106B parameters cannot approach 15 GB; no quantisation that
would fit is published, and one that did fit would be roughly 1 bit per weight.

**Architecture support is not the blocker either, and would not have been.** The installed
`mlx-vlm` 0.6.8 ships both `glm4v` and `glm4v_moe` model implementations, and `llguidance` 1.7.6
(which supplies the constrained-decode grammar) is model-agnostic — it constrains the tokenizer's
logits, not a particular architecture. Had the weights fit, the run would very likely have worked
through `common.Oracle` with only `MODEL_REPO` / `MODEL_REVISION` overridden. **So this is purely
a disk-and-bandwidth stop, not a capability stop** — worth recording, because if the constraint
ever moves (a machine with room, or a published sub-15 GB conversion), the probe becomes cheap
again and nothing else stands in its way.

Local headroom at the time of measuring: **102 GB free** on `/`, against an existing HF cache
already holding ~120 GB of models (Qwen3-VL-30B 24 GB, Qwen3-VL-32B 34 GB, gemma-3-27b 29 GB,
MolmoPoint-8B 10 GB, and the SAM/DINO/SigLIP families). The 3-bit conversion would physically
fit; it is the **gate**, not the disk, that stops it — and the gate is the reviewer's cost rule,
which an agent holding the GPU slot does not get to relax on its own.

## The one GLM vision model that *would* fit — and why it is not a silent substitute

The feasibility scan was scoped to "GLM-4.5V **or GLM-4V variants**", so this is reported rather
than acted on.

| repo | total | arch | license | under the 15 GB gate? |
|---|---|---|---|---|
| `mlx-community/GLM-4.1V-9B-Thinking-8bit` | **11.79 GB** | `glm4v`, dense, 40 layers | MIT | **yes** |
| `mlx-community/GLM-4.1V-9B-Thinking-4bit` | **7.09 GB** | `glm4v`, dense, 40 layers | MIT | **yes** |

There is no non-"Thinking" GLM-4.1V in `mlx-community`, and no `GLM-4V` (the older generation)
conversion at all — the search returns zero.

**It was not run, and the reason is not timidity about the gate.** Substituting it would quietly
change the question A10 asks:

1. **It is a different weight class.** 9B dense against the pinned 30B-A3B MoE oracle. A10 wants
   to know whether an out-of-family model *decorrelates* — whether it is wrong in different
   places. An arm that is simply weaker is wrong in *more* places, and a low agreement number
   would be unattributable between "different family" and "smaller model". That confound cannot
   be removed after the fact by any analysis, so running it produces a number nobody can use.
2. **It is a reasoning model, and the serve would suppress the reasoning.** GLM-4.1V-9B-Thinking
   is trained to emit a `<think>` block before answering. The §A.2 criterion serve is a
   constrained decode against a JSON grammar, which forces the first token to be `{` — the model
   would be run outside the mode it was trained for, on every one of the 30 items. That is a
   defensible thing to measure *deliberately*; it is not a defensible thing to do by accident
   while claiming to have tested "GLM".
3. **The decorrelation claim survives neither confound.** The *value* of an out-of-family arm is
   precisely that its errors are independent of the Qwen arms'. Two confounds that both push
   accuracy down would inflate apparent independence — errors would look decorrelated because
   they are more numerous, not because they are differently placed.

**What would make it worth running.** If the orchestrator or reviewer wants the 9B arm anyway,
it is genuinely cheap (~12 GB, ~30 inferences, well under 30 minutes end to end) and the
machinery is all present. It should then be labelled a **capability probe**, not an
out-of-family adjudicator probe, and reported with both confounds attached to every figure. That
is a reviewer's call about what question is being asked, not an implementation detail, which is
why it is left here rather than taken.

## What the probe would have run, so the next attempt does not re-derive it

Recorded because this was worked out before the gate closed the task.

- **Question and serve.** The reviewer-signed §A.2 criterion wording, byte-identical — that is
  the C/D arm, `prompts/group-a.v2.variant-c.json` and `…variant-d.json`, loaded through
  `common.load_prompt_variant` so the prompt/schema/file hashes are recomputed rather than
  trusted.
- **Items.** The gold-30, which lives in
  `data/oracle-validation/premise-disambiguation-1.json` (`items[].sha256`), read by
  `run_premise.py`'s `read_item_set`.
- **Ground truth.** `reviewerGroundType` in
  `data/oracle-validation/premise-disambiguation-1-analysis.json`, filtered to `answered` items.
- **Scoring.** `analyze_gold30_variants.py`, reusing `analyze.GRADIENT_MAP` rather than
  re-deriving the binary map, and dropping an item from the binary comparison when either side
  declines it. A new arm needs a sibling script pointed at a new run file — `RUNS` in that script
  is a hardcoded dict of the two Qwen runs.
- **The Qwen baselines it would be scored against** (exact match on the gold 30, and the binary
  agreement on the subset where both sides commit):

  | arm | wording | exact match | binary agreement | corpus unmapped share |
  |---|---|---|---|---|
  | A | v1 | 7/30 (0.2333) | 8/20 (0.4000) | 0.4437 |
  | B | v1 | **16/30 (0.5333)** | **17/24 (0.7083)** | 0.3099 |
  | C | §A.2 criterion | 11/30 (0.3667) | 15/24 (0.6250) | 0.0 |
  | D | §A.2 criterion | 9/30 (0.3000) | 10/24 (0.4167) | 0.0 |

  Note for whoever runs it: the gate in `PREMISE_NEXT.md` §4 is exact match ≥ 22/30 **and**
  unmapped share ≤ 0.15. **No arm has ever met the first half** — the best is B at 16/30. An
  out-of-family arm is not going to be judged against a bar that the in-family arms all fail;
  what it is *for* is the second question, below.
- **The measurement that is the actual point.** Not agreement alone — **error correlation**. For
  each of the 30 items, whether the new arm is right where C/D are right and wrong where they are
  wrong. The decorrelation claim needs the per-item disagreement pattern (a 2x2 of
  new-arm-correct x Qwen-arm-correct, plus the item-level list), not a single accuracy figure.
  A10's 97.7% correlated-abstention number is the thing being tested, and only a per-item join
  can test it.

## Files

New, and the only files this task wrote:

- `research/v3/oracle/premise/GLM_PROBE_NOTES.md` (this file)

Nothing was downloaded, no run file was created, and no existing file was modified.

---

# THE PROBE THAT ACTUALLY RAN — 2026-08-04

**48.53 GB downloaded, 60 inferences run, 30 covers, weights deleted afterwards.** The
recommendation is **delete**, it was acted on, and this section is the record that makes the
decision auditable and cheap to reverse.

## What changed since the section above

Two things. The reviewer lifted the 15 GB gate for this specific probe, and **the consumer moved.**
The original consumer — the ground-question cascade whose 97.7% correlated abstention is A10's
complaint — is retired. The live consumer for an out-of-family second opinion is the **subject/noun
labelling that feeds SAM dynamic prompting** (`RESIDUAL_V5_NOTES.md`,
`prompts/subject-nouns-all.v1.variant-J.json`). So the probe asked the noun question, not the
ground question, and the §A.2 criterion serve described above was not the thing run. The gold-30
baselines in the table above are therefore **not** the comparison used here; they are left in place
because they remain the record for the ground question.

## What was run

| | |
|---|---|
| repo | `mlx-community/GLM-4.5V-3bit` |
| revision (pinned) | `699c0acbcc49988af87e32c902a631aef99547d3` |
| licence | MIT |
| download | **48,525,860,421 bytes (48.53 GB) over 21 files, in 1,020.7 s (17.0 min)**, ~47.5 MB/s, Xet backend |
| weights manifest digest | `0b94c467562d479b2a53bfad6e23fd2b…` (`data/oracle-premise/glm-model-manifest.json`) |
| disk after download | 64 GB free, against the 15 GB abort line — never close |
| peak resident | **50.6 GB** |
| runtime | mlx-vlm 0.6.8, mlx 0.32.0, llguidance 1.7.6, Python 3.14.3 — all unchanged from the Qwen arms |

**The serve was byte-identical, and this was verified rather than assumed.** Both prompt documents
were loaded through `common.load_prompt_variant`, which recomputes the hashes from the files on
disk; they match the hashes already recorded in the Qwen run rows:

| variant | prompt_hash | matches Qwen run |
|---|---|---|
| `subject-nouns-all.v1` / J | `9a4744900ba78d3e…` | `subject-nouns-all-1.jsonl`, 142 covers |
| `group-bcde.v1` / E | `1cbd4894e8b2f118…` | `group-bcde-pilot-1.jsonl`, 142 covers |

Same greedy decode (temperature 0), same llguidance JSON grammar, same validate-and-retry with the
same attempt cap, same `RESOLUTION_CAP_PX` normalization. The one thing that necessarily differs is
the chat template, which comes from GLM's own processor — forcing Qwen's template onto GLM would
have tested a broken serve rather than another family's judgement.

`group-bcde.v1` variant E was served **whole, all thirteen questions**, with only
`has_dominant_subject` and `subject_kind` read off it. Serving a two-question subset would have been
a different prompt with a different hash and its answers would not have been comparable to the Qwen
E rows. The extra decode is the price of a valid comparison; it is not an oversight to optimise away.

**Constrained decoding worked on `glm4v_moe` on the first attempt, for both grammars.** 60 of 60
rows are `status: ok`, `parse_failed: false`, `attempts: 1`. The feasibility scout's prediction that
"this is purely a disk-and-bandwidth stop, not a capability stop" was exactly right.

## Runtime — the taste, and the projection it authorised

Five covers first, as instructed. **11.92 s/inference**, projecting the full 30 covers to ~12 min
GPU, well inside the ~45 min ceiling, so the run continued. The remaining 25 covers came in slower
(16.25 s/inference) because variant E's long decode dominates.

| arm | n | mean s/inference | mean generated tokens |
|---|---|---|---|
| **GLM** J (noun list) | 30 | **9.21** | 15.9 |
| **GLM** E (thirteen questions) | 30 | **21.82** | 109.8 |
| Qwen J | 142 | 1.93 | 26.0 |
| Qwen E | 142 | 6.70 | 113.6 |

**GLM is 4.8x slower than Qwen on the noun question and 3.3x slower on the thirteen-question
bundle**, at nearly twice the resident memory. Whole probe: 60 inferences, 931.6 s, **15.5 s per
inference, 15.5 min of GPU**.

## The item set, and the honest shape of its third vertex

`data/oracle-premise/glm-probe-items.json`, pre-registered before any GLM inference ran. Thirty
covers drawn from eval-142, ranked by how many distinct human review rounds touched them. All 30
carry reviewer labels; 23 of 30 have Qwen E==F agreement on both subject fields.

**The reviewer vertex is much thinner than the brief assumed, and this is the single most important
caveat in this document.** `bcde-validation-1` was drawn from the **coverage-set core**, which
barely intersects eval-142 — `coverage-set-1.json`'s own `eval142Overlap` block records `inCore: 3`.
So direct reviewer answers to `has_dominant_subject` / `subject_kind` exist for exactly **three** of
these 30 covers, and one of those three was labelled on a different rendition (640 px) than the one
decoded (300 px), which is flagged rather than silently joined.

What the 142 *do* carry densely is the SAM rounds, whose `mask_correct.<noun>` verdicts are a human
confirming that a **named noun is really on the cover** — noun ground truth, which is precisely what
the live consumer needs. That is the vertex leaned on, and two exclusions protect it:

- **Dynamic tags are excluded from scoring.** `dyn-building`, `dyn-animal` and friends are SAM
  prompts *derived from Qwen's own answer*. Scoring GLM against a ground truth whose existence was
  conditioned on Qwen having said the word would hand Qwen the comparison for free. 2 such items
  were found and set aside.
- **Text and overlay tags are excluded.** Variant J's prompt says "Lettering is not a thing", so a
  model that correctly omits `words` would be scored *wrong* against a `mask_correct.words` verdict.

Only `person` and `face` — prompted for every cover regardless of any model's answer — survive as
unconditioned noun ground truth.

**Two scoring bugs were found and fixed before the numbers below were believed**, and they are
recorded because both produced *plausible-looking* results. The warehouse stores `mask_correct.*`
as the strings `'yes'`/`'no'`, not booleans, so an `is True` test silently dropped every one of
them. And `big_area_is_real_subject` answers are `'real-subject'`/`'whole-image'`, not booleans —
the same `is True` test read all nine as "no subject" and manufactured a 7-of-9 correlated-failure
cell out of nothing. A `'whole-image'` answer says one SAM region was just the whole frame; it does
**not** say the cover is subjectless, so those 2 items are now counted unscorable and listed rather
than forced into a binary.

## Triangle 1 — model against model, n = 30 (the solid number)

| field | Qwen E == Qwen F (in-family) | GLM == Qwen E | GLM == Qwen F |
|---|---|---|---|
| `has_dominant_subject` | 26/30 (0.867) | 23/30 (0.767) | 25/30 (0.833) |
| `subject_kind` | 25/30 (0.833) | 22/30 (0.733) | 23/30 (0.767) |

**GLM does decorrelate at the answer level.** It agrees with either Qwen wording less often than
Qwen's two wordings agree with each other — which is the signature you would want from a genuinely
independent arm, and it is not an artifact of a weaker model producing noise everywhere (its
disagreements are concentrated, see below).

The noun question diverges far harder:

| | |
|---|---|
| mean Jaccard, GLM J vs Qwen J | **0.291** |
| covers with **zero** noun overlap | **6 of 30** |
| covers with identical lists | 2 of 30 |
| mean list length | **GLM 2.9, Qwen 4.9** |
| covers where GLM's list is shorter | 22 of 30 |

## Triangle 2 — against the reviewer, n = 19 (the number that decides it)

Nineteen scored judgements over 13 covers, one per (cover, question), latest revision winning.

|  | Qwen correct | Qwen wrong |
|---|---|---|
| **GLM correct** | 15 | **0** |
| **GLM wrong** | 2 | 2 |

| item type | n | GLM correct | Qwen correct | both wrong |
|---|---|---|---|---|
| `bcde:has_dominant_subject` | 3 | 2 | 2 | 1 |
| `bcde:subject_kind` | 3 | 2 | 2 | 1 |
| `derived:has_a_real_subject` | 7 | 5 | 7 | 0 |
| `noun_present:person` | 5 | 5 | 5 | 0 |
| `noun_present:face` | 1 | 1 | 1 | 0 |
| **total** | **19** | **15** | **17** | **2** |

## The decorrelation verdict

**GLM disagrees with Qwen a great deal and is never once right where Qwen is wrong.** The cell that
would have paid for 48.53 GB — `GLM correct, Qwen wrong` — is **empty at n = 19**. GLM scores 15/19
against the reviewer where Qwen scores 17/19, and both of GLM's unique errors run in the same
direction: it answered `has_dominant_subject: none` on two covers where the reviewer confirmed a
real subject and Qwen said `single`.

So the answer to A10's question, on this evidence, is **decorrelated but not useful**. Divergence
and usefulness are different properties, and this probe separates them cleanly: a mean noun Jaccard
of 0.291 with six zero-overlap covers is emphatic disagreement, and none of it converts into a
correction. A second opinion that disagrees loudly without being right more often is noise, and
routing on it would import GLM's errors while discarding Qwen's correct answers.

**The two correlated errors are one cover, not two.** Both `both_wrong` items are
`0004ccf0ae91364130886c02`, where the reviewer *reconciled* to `none` / `not_applicable` (revision 2,
`subject_kind` flipped from `abstract_shape`) and both models say `single` / `object`. Reported as
"shared error share of GLM errors = 0.5", but that fraction rests on a single artwork answering two
questions, and should not be compared numerically against A10's 97.7% — different question,
different population, and an n that cannot support the comparison.

### Why it fails the live consumer specifically

The consumer is SAM dynamic prompting, and PROBE5 established the two properties that matter there:
**recall** (an unnamed object survives into the residual — the failure `residual-purity-1` measured)
and **specificity** (the species noun beats the class word: castle 0.87 vs building 0.78). GLM is
worse on both.

- **Recall.** 2.9 nouns per cover against Qwen's 4.9, shorter on 22 of 30 covers. Variant J's cap of
  eight is documented as erring *high* on purpose, because subtraction is the point. GLM errs low.
- **Specificity.** GLM answers `flower` where Qwen answers `rose`; `person` where Qwen answers
  `woman`; `thatch` where Qwen answers `thatched roof`; `abstract painting`, `abstract shape`,
  `abstract shapes`. The prompt forbids bare category words by name and GLM uses them anyway —
  **13 of 87 entries (14.9%) break a stated prompt rule, against Qwen's 14 of 147 (9.5%)**, and GLM
  produces 41% fewer entries to break them in.
- **The cello, the case this prompt set exists for.** On `00014fb430dd1b693e653121`, GLM returned
  `man, cello, dragon` and Qwen returned `man, bass, dragon, woman, jacket, text, logo, background`.
  GLM names the instrument more accurately — this is the one place it visibly wins — and still
  returns the strictly poorer prompt set, because Qwen caught the second person and the jacket too.

## Recommendation, and what was done: DELETE

Per the reviewer's condition. The evidence is that GLM-4.5V is slower (4.8x on the live question),
hungrier (50.6 GB resident), less compliant with the prompt's own rules, lower-recall, less
specific, and — the decisive point — **never once a correction** on the reviewer-grounded items.

```
rm -rf ~/.cache/huggingface/hub/models--mlx-community--GLM-4.5V-3bit
```

**Deletion is cheap to reverse and that is deliberate.** The revision is pinned in
`glm_probe.py` (`GLM_MODEL_REVISION`), the weights manifest with all 21 file hashes is committed at
`data/oracle-premise/glm-model-manifest.json`, and re-acquiring costs 17 minutes:

```
.venv/bin/python -c "from huggingface_hub import snapshot_download; \
  snapshot_download('mlx-community/GLM-4.5V-3bit', \
  revision='699c0acbcc49988af87e32c902a631aef99547d3')"
.venv/bin/python glm_probe.py --pin   # rehash and check against the committed manifest
```

Everything except the weights is kept: the runner, the scorer, the item draw, all 60 rows and the
analysis. A future attempt starts from a pinned revision and a working serve, not from scratch.

### What would change the verdict

Stated so this is a decision and not a dismissal.

1. **A real reviewer vertex.** n = 19 over 13 covers is thin, and 5 of the 19 are `person` items
   that every arm gets right — they confirm the machinery, they do not discriminate. A round of
   `has_dominant_subject` / `subject_kind` labels drawn from **eval-142** rather than the coverage
   core would give the first properly powered test. This is the cheapest and by far the most
   valuable follow-up, and it needs no GPU.
2. **Scoring the noun lists against human noun judgements at scale.** The six zero-overlap covers
   are the interesting population and nobody has adjudicated them. If a reviewer looked at those
   six and GLM's shorter, blunter list were preferred, the recall finding would invert.
3. **A different question.** This probe tested the *noun* question because that is the live
   consumer. GLM was never tested on the ground question that A10 actually complains about. The
   §A.2 criterion serve described earlier in this file remains unrun, and a 0-of-19 result on nouns
   is not evidence about `ground_type`.

### The population caveat, restated because every number above inherits it

The 30 covers were drawn to maximise reviewer overlap, and review attention was itself partly
conditioned on **model disagreement** — `residual-purity-*` strata are `noun-fired`/`noun-silent`,
and `bcde-gate-reconciliation-1` is explicitly a contradiction-conditioned population.
`PREMISE_NEXT.md` §3 and §15.9 both require that such a round be reported as a different
population. Every rate here is an estimate on a review-enriched slice of eval-142 — not on
eval-142, and not on the corpus. No confidence intervals are given because none would mean
anything at this n and this conditioning; the per-item lists in the analysis file are the evidence,
and the rates are a summary of them.

## Files

Written by this run (the weights themselves were deleted):

- `research/v3/oracle/premise/glm_probe.py` — the runner. Rebinds the model pin on the `common`
  module for its own process rather than softening `common.py`'s assertions, which are what makes a
  Qwen row trustworthy.
- `research/v3/oracle/premise/analyze_glm_probe.py` — the scorer, including both exclusion rules and
  the two fixed bugs.
- `research/v3/data/oracle-premise/glm-probe-items.json` — the pre-registered 30-cover draw.
- `research/v3/data/oracle-premise/glm-probe-1.jsonl` — 60 rows, full provenance.
- `research/v3/data/oracle-premise/glm-probe-1-analysis.json` — triangles, per-item lists, exclusions.
- `research/v3/data/oracle-premise/glm-model-manifest.json` — 21 file hashes, so the deleted bytes
  remain identifiable.

No existing file was modified except this one, and `common.py` was not touched.

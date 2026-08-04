# GLM out-of-family probe — feasibility, and why it stopped at the gate

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

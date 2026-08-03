# Oracle VLM bake-off — setup

**Status (2026-08-03):** three arms registered, pinned and load-verified; one arm blocked and
recorded as such; machinery self-tested (43 model-free assertions). **No bulk run has been
started.** The GPU queue is the orchestrator's, one job at a time on this machine
(PHASE_0_DECISIONS.md §5: "the orchestrator asks before starting or resuming any long run").

## What this is for

The premise test asked one model whether its reading of ground structure tracks the
human-accepted gradient flag. It got κ ≈ 0.21 (variant A) / 0.31 (variant B) on 137 artworks.
The reviewer then hand-labelled 30 of the artworks where the oracle and the flag contradicted
each other — and that slice turned out to be intrinsically ambiguous: the reviewer sided with
the flag 14/30, with the oracle 10/30, and with neither 6/30. Its own analysis calls that
"a lean, not a verdict".

So the bake-off's job is **not** the contested 30. It is the **full 142, especially the
tractable part**: given identical prompts, schema, resolution cap and greedy decoding, which
model reads ground structure the way the reviewer does where there is something to be right
about? The gold 30 is kept as a hard-case probe and reported, never as the ranking.

## Layout

| path | what |
|---|---|
| `.venv/` | project-local Python 3.14.3 venv (git-ignored). Nothing installed globally. |
| `config.py` | the arm registry: repo, HF commit, quantization, size, role, per-arm blocks |
| `bakeoff_common.py` | arm-aware oracle + item sets; everything else imported from the premise workstream |
| `pin_arms.py` | resolves each snapshot, hashes every weight file, writes the provenance manifest |
| `verify_load.py` | one load + one constrained forward pass per arm (the only setup-phase GPU work) |
| `run_bakeoff.py` | the worker: `--arm`, `--items {gold30\|eval142}`, `--variant {A\|B}` |
| `supervise.sh` | the restarting supervisor (§5.1) |
| `score.py` | per-arm scoring against both references; writes `scores.json` + `scores.txt` |
| `selftest.py` | model-free checks, including that `score.py` reproduces two published analyses |

Outputs go to `research/v3/data/oracle-bakeoff/`. Nothing else in the repo is written.

**Nothing is copied from the premise workstream — it is imported.** The prompts
(`../premise/prompts/group-a.variant-{a,b}.json`), the JSONL sink, the persisted attempt
ledger, resume keys, schema validation, image normalization and the whole agreement
arithmetic (`GRADIENT_MAP`, `P6_BUCKETS`, `binary_scores`, `tier_of`) come from
`../premise/common.py` and `../premise/analyze.py` at import time. A copy would drift, and the
bake-off's entire claim is that every arm was asked the same question the same way.

## Environment

```
python 3.14.3 (homebrew, user-local; the venv is project-local)
mlx-vlm 0.6.8 · mlx 0.32.0 · mlx-metal 0.32.0 · llguidance 1.7.6 · transformers 5.14.1
pillow 12.3.0 + pillow-avif-plugin 1.6.0 · huggingface-hub 1.26.0 · numpy 2.5.1
```

Byte-for-byte the premise venv's versions, deliberately: a runtime difference between the
incumbent's existing results and a challenger's fresh ones would be a confound.

## The arms

| arm | model | revision | quant | size on disk | role |
|---|---|---|---|---|---|
| `qwen3-30b-a3b` | `mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit` | `f31102655767c89366f63d3eab2a5e2a8fd6d293` | 6-bit | 25.90 GB (already cached) | incumbent — the premise run |
| `qwen3-32b-dense` | `mlx-community/Qwen3-VL-32B-Instruct-8bit` | `14fd4c76af6bd02d1f3dbe5ea7b03da5a1ae25cf` | 8-bit | 36.02 GB | dense challenger, **and the pipeline's planned adjudicator** |
| `gemma3-27b` | `mlx-community/gemma-3-27b-it-8bit` | `524cdc4f56a58ef94949ba65dc63a29c48362b1a` | 8-bit | 31.08 GB | third arm — fallback for the blocked InternVL3.5 slot |
| `internvl35` | `mlx-community/InternVL3_5-30B-A3B-4bit` | `ed2ce3381528db1c5b70a2aad78a6390997e9250` | 4-bit | **not downloaded** | **BLOCKED** — see below |

Every arm is pinned by HF **commit hash** (never a tag) plus a weights manifest: every file in
the snapshot hashed, and one `weights_manifest_sha256` over the sorted `(file, sha256)` list,
which every output row carries. Manifests live at
`data/oracle-bakeoff/model-manifest.<arm>.json`.

The incumbent is a deliberate special case. Same repo, same revision, same bytes the premise
run used, already in the shared `~/.cache/huggingface/hub`; `premise/pin-model.py` hashed all
26 GB of it on 2026-08-02. `pin_arms.py` **inherits** that digest rather than re-hashing, and
`config.py` points the arm's results at `data/oracle-premise/premise-run-1.jsonl`. Nothing is
duplicated: not the weights, not the hash, not the GPU hours.

### Why there is no InternVL3.5 arm

Probed on 2026-08-03. Only four InternVL3.5 MLX conversions exist anywhere on the hub —
`mlx-community/InternVL3_5-1B-4bit`, `InternVL3_5-30B-A3B-4bit`,
`InternVL3_5-GPT-OSS-20B-A4B-Preview-4bit`, and the community `Dadm-n/InternVL3_5-2B-mlx`.
Nothing at 8B / 14B / 38B dense. All of them declare `model_type: "internvl"` (the
transformers `InternVLForConditionalGeneration` layout).

**mlx-vlm 0.6.8 — the newest release on PyPI — cannot load that.** It ships
`models/internvl_chat/` only, has no `"internvl"` entry in `MODEL_REMAPPING`, and
`import mlx_vlm.models.internvl` raises `ModuleNotFoundError`; the loader resolves
`model_type` straight to a module name (`mlx_vlm/utils.py:531`). Even with a remap, that
implementation's `language.py` is a dense Qwen3-style decoder with no expert routing, while
both size-appropriate 3.5 checkpoints are MoE (`qwen3_moe` / `gpt_oss`).

The arm stays in the registry — pinned revision and all, in the pattern
`embeddings/config.py` used for the gated DINOv3 arm — so the decision is recorded rather
than remembered, and a later runtime upgrade starts from a known revision. Per the task
brief, the slot falls back to **Gemma 3 27B**, which is also a better bake-off in one
respect: a third Qwen would not distinguish a family-wide reading habit from a correct one.

## Constrained decoding, measured per arm

Pipeline §9.3 prefers a grammar over "please return JSON", and premise measured that it is
load-bearing: without it the 30B model copies the rubric's numbering into its keys
(`{"1. ground": ...}`) and, being greedy, reproduces that byte for byte on every retry.

Grammar support is **per tokenizer**, so it is measured per arm and never inherited.
`verify_load.py` tries `mlx_vlm.structured.build_json_schema_logits_processor` against each
model's own tokenizer, records the result in
`data/oracle-bakeoff/arm-verification.<arm>.json`, and `run_bakeoff.py` reads that file to
decide the arm's decoding path — it refuses to start an unverified arm rather than assume.

If an arm cannot bind the grammar, the run falls back to §9.3's validate-and-retry, with one
addition premise did not need: attempts 2+ append `config.REPAIR_SUFFIX` to the user turn.
Without a changed input, greedy decoding makes a retry a no-op — the model returns the same
bad bytes — so the repair instruction is what makes the fallback a fallback. Every row records
`constrained_decoding` and `system_turn`, so which path produced an answer is never a guess.

## Load-verification results (2026-08-03)

One model load and one image per arm, on the premise run's pinned canary, both decoding paths.
Artifacts: `data/oracle-bakeoff/arm-verification.<arm>.json`.

| arm | loads | grammar | constrained answer | fallback | peak memory |
|---|---|---|---|---|---|
| `qwen3-30b-a3b` | (premise run, 284 inferences) | yes | yes | yes | ~26 GB |
| `qwen3-32b-dense` | 10.7 s | **yes** — llguidance mask built | valid on attempt 1 | valid on attempt 2 | 37.2 GB |
| `gemma3-27b` | 2.9 s | **yes** — llguidance mask built | valid on attempt 1 | valid on attempt 1 | 31.6 GB |

**Constrained decoding works on all three arms**, so no arm needs the fallback. Both new arms
answered coherently and inside the closed vocabulary on the same picture.

Two things the unconstrained passes showed, worth keeping:

- **Qwen3-VL-32B needed the repair instruction.** Its first unconstrained attempt did not
  validate; attempt 2, with `REPAIR_SUFFIX` appended, did. Under greedy decoding a plain retry
  would have reproduced the first failure exactly — so the fallback works *because* the retry
  changes the input, not because retrying helps.
- **Gemma 3 wraps its JSON in a ``` fence** when unconstrained. `parse_model_text` already
  tolerates that, which is why its fallback passed on attempt 1.

### A GPU fault, observed and handled

A verification run launched while another workstream's job was on the GPU failed with
`[METAL] Command buffer execution failed: Caused GPU Timeout Error
(kIOGPUCommandBufferCallbackErrorTimeout)` after 111 s — and **every subsequent attempt in
that process raised the same error in 0.25 s**. The Metal context stays poisoned until the
process exits.

Left alone, that is a silent catastrophe: the ordinary retry path would have marked every
remaining item `failed`, `failed` is terminal, and the run would have reported itself complete
and empty. So `bakeoff_common.GpuFault` classifies these apart from ordinary failures; the
worker writes no terminal row, exits 5, and the supervisor restarts into a fresh process. The
attempt ledger (persisted *before* inference) still bounds how often one image may do this.

**This is why the one-job-at-a-time rule is not politeness.** The same arm verified cleanly
twice when the GPU was quieter.

## Running it (the orchestrator's GPU queue owns these)

One job at a time, and **check the GPU is idle first** — see above.

```bash
cd research/v3/oracle/bakeoff

# already done on 2026-08-03; repeat only if a pin or a runtime changes
./.venv/bin/python pin_arms.py --all
./.venv/bin/python verify_load.py --arm qwen3-32b-dense
./.venv/bin/python verify_load.py --arm gemma3-27b

# THE RUNS, one at a time, in this order.
# gold30 first: 60 inferences is a cheap smoke test of the whole path — and because the
# resume key does not mention the item set, the eval142 run afterwards reads those 60 rows
# back as done. Both item sets share one file per arm, so nothing is decoded twice.
./supervise.sh --arm qwen3-32b-dense --items gold30      # ~25 min
./supervise.sh --arm gemma3-27b      --items gold30      # ~25 min

./supervise.sh --arm qwen3-32b-dense --items eval142     # ~1.5 h more
./supervise.sh --arm gemma3-27b      --items eval142     # ~1.5 h more

# the answer, any time (it scores whatever is on disk)
./.venv/bin/python score.py
```

### Projected durations

| arm | s / inference | gold30 (60 + 3 canary) | eval142 (284 + 15 canary) |
|---|---|---|---|
| `qwen3-30b-a3b` | **2.9** (measured over 284 real inferences) | done | **done** — no GPU time at all |
| `qwen3-32b-dense` | ~20–25 | ~25 min | ~1 h 50 m total |
| `gemma3-27b` | ~21–23 | ~25 min | ~1 h 50 m total |

The two challengers are **7–8× slower per image than the MoE incumbent**, which is the whole
point of a 3B-active MoE and worth stating plainly in the result: if a dense arm wins, it wins
at roughly eight times the decode cost. Per-inference figures for the new arms come from two
forward passes each under some GPU contention, so treat them as an upper bound; the gold30 run
is what actually calibrates them. Total challenger GPU time to a full result: **~4 hours**.

`run_bakeoff.py --dry-run` prints the work queue without loading a model or writing a file. A
resumed run appends to the same file and re-derives its queue from it. `--variant A`
(repeatable) runs one wording. The incumbent needs **no** run: `run_bakeoff.py --arm
qwen3-30b-a3b` refuses and says why, because its results already exist and are owned by the
premise workstream.

## Reading the result

`score.py` writes `data/oracle-bakeoff/scores.json` and a plain table at `scores.txt`. Per arm,
per prompt variant, against two references that answer different questions:

**(a) the reviewer's gold 30** — exact vocabulary match on `ground_type`, plus binary
agreement after `GRADIENT_MAP`. A pair is scored on the binary only when *both* sides map;
`full_scene`, `pattern_or_texture` and `none_discernible` predict nothing about a gradient
decision in either direction, and the dropped counts are reported so an arm cannot look
accurate by answering `full_scene` at everything. The accepted flag's own agreement with the
reviewer (14/24) is printed on the same axis as a baseline.

**(b) the accepted flags on all 142** — `strict_all_labels`, `mapped_labels_only`, and the P6
buckets. PHASE_0_DECISIONS.md §4 P6: never an exact-match test. `underdetermined` cells are
counted, not scored; the bucket's **size** is the instrument. Conflicted-truth artworks (two
accepted palettes disagreeing on the flag) are excluded by default, as premise does.

Two more numbers that are not scores and matter anyway:

- **inter-variant agreement per arm.** Pipeline §3 routes the variant-disagreement subset to
  the dense adjudicator, so its size is the adjudicator's bill. The incumbent disagrees with
  itself on the binary for 36 of 137 artworks — 26%. An arm that is cheap but unsettled is not
  cheap.
- **cross-arm agreement.** If three arms say the same word 90% of the time, the bake-off is
  measuring one habit wearing three names, and the ranking between them is noise.

### The scorer is checked against work that already exists

`selftest.py` runs `score.py` over the premise run and asserts it lands, cell for cell, on
both published analyses: the reviewer-facing gold-30 file (exact match A 7/30, B 16/30; binary
A 8/20, B 17/24; flag baseline 14/24) and `premise-run-1.agreement.json` (strict agreement and
P6 buckets for both variants). It does. So when a challenger's number differs from the
incumbent's, that is the model differing — not two scripts disagreeing about what "agreement"
means.

```
./.venv/bin/python selftest.py     # 43 model-free assertions
```

## Disk

| what | size |
|---|---|
| `mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit` | 25.9 GB — already cached, shared with premise |
| `mlx-community/Qwen3-VL-32B-Instruct-8bit` | 36.0 GB — downloaded 2026-08-03 |
| `mlx-community/gemma-3-27b-it-8bit` | 31.1 GB — downloaded 2026-08-03 |
| `.venv/` | ~0.5 GB |

**67 GB of new weights**, all in the shared `~/.cache/huggingface/hub` (nothing duplicated
per venv). Free space afterwards: **107 GB of 926 GB (88% used)** — enough, but the next
multi-arm workstream should check before pulling another 30 GB model. No arm is resident
alongside another: one job at a time, peak 37 GB against 96 GB of unified memory.

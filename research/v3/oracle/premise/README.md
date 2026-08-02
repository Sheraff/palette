# Oracle premise test — setup

**Status:** set up, pre-flighted, **not run**. The full run launches only on reviewer go-ahead
(PHASE_0_DECISIONS.md §5: "the orchestrator asks before starting or resuming any long run").

**What it tests.** V3_PLAN.md §5, step 1: run the VLM oracle against the artworks where the
v2-3 warehouse already holds a human-accepted gradient boolean, before building any oracle
machinery. *"Poor agreement there = an afternoon spent, not a week."*

---

## Layout

| path | what |
|---|---|
| `.venv/` | project-local Python 3.14 venv (git-ignored). Nothing installed globally. |
| `prompts/group-a.variant-{a,b}.json` | the two independently-worded renderings of ORACLE_QUESTION_SET.md group A |
| `build-eval-set.ts` | mines `research/v2-3-eval/` for the gradient ground truth |
| `pin-model.py` | resolves the snapshot, hashes every weight file, writes the provenance manifest |
| `common.py` | constants, prompt loading, image normalization, the oracle, JSONL/attempt hygiene |
| `run_premise.py` | the worker |
| `supervise.sh` | the restarting supervisor (§5.1) |
| `preflight.py` | the §11 checklist, one stage at a time |
| `analyze.py` | oracle-vs-human agreement on the gradient boolean |

Outputs go to `research/v3/data/oracle-premise/` — the other half of this workstream's owned
paths. Nothing else in the repo is written.

## Environment

```
python 3.14.3 (homebrew, user-local; the venv is project-local)
mlx-vlm 0.6.8 · mlx 0.32.0 · llguidance 1.7.6 · transformers 5.14.1
pillow 12.3.0 + pillow-avif-plugin 1.6.0   (one eval-set entry is an AVIF)
```

**Constrained decoding is available, used, and load-bearing.** mlx-vlm 0.6.8 ships
`mlx_vlm.structured.build_json_schema_logits_processor` — a real llguidance-backed grammar
mask over the logits, the same path its OpenAI-compatible server uses for `response_format`.
So pipeline §9.3's preferred option is live, not the fallback.

It is not a nicety. `preflight.py --stage retry` runs the same image with and without the
grammar. **With it: valid on attempt 1. Without it: failed after all three attempts**, because
the model copies the rubric's numbering into its keys —
`{"1. ground": "shaded_field", "2. shading": ...}`. Under greedy decoding a retry reproduces
that byte for byte, so the retry fallback alone would not have rescued the run. The retry
path (cap `MAX_ATTEMPTS = 3`, `parse_failed` counted on every row) stays in place for what a
grammar cannot catch — a truncated decode, an OOM, a decoder fault — but the grammar is what
makes the output parseable.

## Model

```
mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit
revision  f31102655767c89366f63d3eab2a5e2a8fd6d293      (HF commit, not a tag — §5.2)
25.90 GB · weights_manifest_sha256 in data/oracle-premise/model-manifest.json
```

Instruct rather than Thinking: the run is greedy, terse and grammar-constrained, so private
reasoning tokens would dominate decode — which pipeline §10 lever 1 names as the run's cost
driver.

## Running it (do not, without go-ahead)

```bash
cd research/v3/oracle/premise

# ground truth (already built; deterministic, re-runnable)
NODE_NO_WARNINGS=1 node --experimental-strip-types build-eval-set.ts

# pre-flight, in order
./.venv/bin/python preflight.py --stage decode
./.venv/bin/python preflight.py --stage smoke
./.venv/bin/python preflight.py --stage determinism1
./.venv/bin/python preflight.py --stage determinism2 --tag proc1
./.venv/bin/python preflight.py --stage determinism2 --tag proc2
./.venv/bin/python preflight.py --stage compare2
./.venv/bin/python preflight.py --stage batchmix
./.venv/bin/python preflight.py --stage retry
./.venv/bin/python preflight.py --stage poison

# THE RUN — supervised, resumable, canary every 20 items
./supervise.sh --out ../../data/oracle-premise/premise-run-1.jsonl

# the answer
./.venv/bin/python analyze.py --results ../../data/oracle-premise/premise-run-1.jsonl
```

`run_premise.py --dry-run` prints the work queue without loading the model. A resumed run
appends to the same file; a changed prompt writes new rows because `prompt_hash` is part of
the resume key.

## Pre-flight results (2026-08-02)

Artifacts under `research/v3/data/oracle-premise/preflight/`.

| §11 item | result |
|---|---|
| every eval-set image decodes | **144/144**, including the one AVIF |
| smoke, 5 images × 2 variants | **10/10 ok**, 0 parse failures, 0 retries |
| same image twice in one process | **byte-identical**, 3 repeats × 2 variants |
| same image across two processes | **byte-identical** |
| same image in 3 different batch compositions | **byte-identical** — no MoE routing sensitivity (§3 caveat clears) |
| constrained decoding works | **yes, and it is load-bearing** (see above) |
| retry cap + `parse_failed` | 3 attempts, terminal `failed` row, `parse_failed: true` |
| poison pill | fails deterministically (`OSError`), capped, terminal row |
| resume | 284 queued → 3 done → 281 queued; canary rows never satisfy the queue |
| canary | 4 canary decodes across 2 processes, one distinct output |

**Throughput:** ~8–10 s per inference at steady state, ~35 s model load. The run is
284 inferences (142 images × 2 variants) plus ~15 canary decodes: **~50 min burst,
~1.5 h if the machine throttles to the 60–70% the pipeline doc expects.** Not an overnight
job — the premise test really is an afternoon.

**Model-free machinery check:** `./.venv/bin/python selftest.py` — 31 assertions covering
resume, the attempt ledger, schema validation, prompt integrity, and the agreement
arithmetic against a synthetic run whose right answer is known by construction.

## How to read the result

Two things must be read together, and the second is easy to skip:

1. **The agreement numbers**, per variant, per resolution tier, and on the variants-agree
   subset. `analyze.py` reports raw agreement, Cohen's κ and MCC — κ rather than accuracy
   because the set is near-balanced and an oracle that answered "flat" every time would
   still score ~53%.

2. **What the ground truth actually is.** The reviewer never answered "does this artwork have
   a gradient?" The reviewer graded *palettes*, and each palette carries a gradient boolean
   the v2-3 algorithm chose. A `strong` grade means a human looked at that palette and
   accepted it. That is an **accepted decision, not an elicited label** — see
   `eval-set.json` → `meta.groundTruthEpistemology`. Five artworks in the set have two
   *different* accepted palettes that disagree on the flag, and two more have that
   disagreement at the same instant (batch-37's `gc-flat` vs `gc-grad` — literally the
   gradient-neutrality experiment). Those are excluded from the primary numbers by default.

PHASE_0_DECISIONS.md §4 P6 governs the comparison: it is **never an exact-match test**,
because several palettes can be valid for one artwork. `analyze.py` sorts every
(label, decision) pair into P6's three buckets — contradiction / agreement / can't-tell — and
reports them separately rather than folding them into one accuracy figure.

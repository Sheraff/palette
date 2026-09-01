# SAM determinism + speed — pre-registration

**Written before any inference was run.** 2026-08-04. **For:** the reviewer and the orchestrator.
**Implements:** `PHASE_0_DECISIONS.md` §6.1 condition 2, which is recorded as unsatisfied-by-default
because no test exists.
**GPU:** single-owner slot held. `pgrep` confirmed no MLX/torch process running before this was
written.

Everything below — the claim, the sample, the run plan, the digest definition, the bar, and the four
pre-registered readings of condition (d) — is fixed here and is not to be changed after a number is
seen. Deviations get recorded in `DETERMINISM_TEST.md`, never by editing this file.

Batch id: **`sam-determinism-1`**.

---

## 1. The claim under test

§6.1 condition 2, verbatim from `PHASE_0_DECISIONS.md`:

> 2. **Provably deterministic** — the same file yields **byte-identical masks across runs**. This is a
>    property to be **tested before anything relies on it**, not assumed. Until that test exists and
>    passes, SAM-at-runtime is not admissible on this criterion.

The decision record behind it (`d-2026-08-04-sam-at-runtime-is-conditionally-admissible`) is blunter
still, and its caveat is the reason this round exists:

> **SAM's determinism is UNKNOWN, not assumed-good. No byte-identity test has been run. Anyone
> reading this record as evidence that SAM is deterministic is reading it backwards: it is the
> requirement that someone prove it.**

**The claim this round tests, stated so it can fail:** for a fixed model revision
(`mlx-community/sam3.1-bf16` @ `a992e302ea9b0f03f41dfd93414a4fd0e818f65b`), a fixed concept set
(v2.2, hash `d49a63c479d4e672…`), and a fixed input file, SAM's **full output** — every region's mask
RLE, score, bbox and area — is byte-identical across:

- **(a)** repeated inference inside one process;
- **(b)** fresh process restarts, each rebuilding its own Metal context from cold;
- **(c)** permuted image processing order;
- **(d)** permuted **concept** order — *within the documented constraint that concept order is part
  of run identity.* `config.py` says so in as many words: "Order is fixed because it is part of the
  run identity (`CONCEPT_SET_HASH`)". So if output legitimately depends on concept order, **that is a
  documented determinism boundary, not a failure.** (d) is therefore measured and reported as its own
  case and is **not** part of the pass/fail bar. It is still worth measuring, because *which* part of
  the output moves decides whether the boundary is cosmetic or substantive — see §5.

**What this round does not do.** It does not make SAM admissible at runtime. Condition 2 is one of
four conjunctive conditions, and conditions 1, 3 and 4 are untouched here. It measures one condition
and proposes the wording that would record the measured verdict.

## 2. The sample — purposive, and why that is right here

**Twelve covers, fixed in `select_determinism_sample.py::SAMPLE` before any inference.** The realised
manifest with hashes and decoded dimensions is `data/sam/determinism-1-sample.json`, built by a
CPU-only script that never loads a model.

Every other round in this directory draws at random, because it estimates a rate over a population
and a targeted sample would bias the estimate. **This round estimates nothing.** It asks whether one
machine returns the same bytes twice, and a machine that is non-deterministic on one input is
non-deterministic. So the sample's job is **coverage of the input space that could plausibly trigger
a divergence**, not representativeness:

| axis | covered |
|---|---|
| decoder path | JPEG ×7, PNG ×1, AVIF ×2, **extensionless ×3** (bytes sniffed, not named) |
| geometry | 147×147, 300×300, 400×155 (**non-square**), 483×483, 640×640 |
| detection load | 1 region to 144 regions on the v2 run — the high end is what gives NMS ties to break |
| content strata | cjk ×2, person ×2, text_heavy ×3, busy ×3, flat ×2 |

**Every content label is human-confirmed**, carried over with its note from `cjk-probe-7.txt` (probe
4's four CJK covers, each opened and confirmed by eye), `salience-probe-12.txt` and `smoke-10.txt`.
**No stratum label was inferred from a region count.** Region counts from `sam-eval-142-v2.jsonl` are
echoed into the manifest to document the detection-load spread and are labelled
`v2_instances_total_selection_only`; that run is under concept-set hash `402de9d8` and nothing
measured from it is quoted as evidence anywhere in this round.

A random draw of 12 would very likely have missed the 147px AVIF and the 400×155 banner, which are
the two inputs most likely to hit a resize or clamp edge case.

**Repetitions: 3 per condition**, per the round's spec.

## 3. The run plan — six processes, twelve passes, fixed here

`ORDER_SEED = 20260804`, written here before any permutation was generated. Permutations are
distinct and non-identity by construction.

| process | condition | invocation | yields |
|---|---|---|---|
| P1 | **(a)** in-process repeat | `--condition a --reps 3` | A0, A1, A2 — and the **cold model-load** number |
| P2 | **(b)** fresh process | `--condition b --reps 1 --verify-weights` | B1 |
| P3 | **(b)** fresh process | `--condition b --reps 1` | B2 |
| P4 | **(b)** fresh process | `--condition b --reps 1` | B3 |
| P5 | **(c)** permuted image order | `--condition c --reps 3 --permute-images` | C0, C1, C2 |
| P6 | **(d)** permuted concept order | `--condition d --reps 3 --permute-concepts` | D0, D1, D2 |

**A0 is the reference pass.** Every other pass is compared against it, per image.

P2 carries `--verify-weights` so that exactly one process in this round re-hashes the 3.5 GB
safetensors against the pin and would fail loudly if the weights on disk had moved. Its load number
is therefore load **plus hash** and is reported separately from the other five.

Every image is decoded **once per process, before the model is loaded**, and the decoded pixel buffer
is SHA-256'd and that hash stored on every pass row. Decode determinism is thereby checked rather
than assumed, and decode cost is never inside a measured inference.

## 4. The digest — what "byte-identical" is taken to mean

For every region a canonical byte string is built:

```
{"area":"<float.hex>","bbox":["<hex>","<hex>","<hex>","<hex>"],"concept":"…",
 "idx":N,"rle":"<COCO compressed-RLE string>","score":"<float.hex>"}
```

`float.hex()` is exact: two doubles print the same hex **iff** they are the same IEEE-754 value.
This matters. The determinism primitive that already exists in this directory,
`run_sam.canary_digest`, rounds score to 5 places and area to 7, **and omits the mask RLE entirely** —
so it cannot see a last-bit difference, and a last-bit difference is exactly the shape a
non-deterministic floating-point reduction produces. This round does not reuse it.

Three digests per (pass, image), SHA-256 over concatenated canonical strings:

- **`emit_digest`** — emission order, unchanged. The strictest reading of the claim.
- **`keyed_digest`** — sorted by `(concept, instance_idx)`. **This is the digest that governs stored
  rows**, because `run_sam` keys every row on `(image, concept, instance)`.
- **`content_digest`** — `idx` deleted, then sorted. The pure multiset of masks, scores and boxes:
  are these the same regions, independent of arrival order or index assignment.

**Byte-identity is established by SHA-256 over those blobs, not by storing the blobs.** Keeping every
mask RLE for every pass would be ~41 MB of duplicated bytes to prove they are duplicates. Per-region
field digests (`score_hex`, `bbox_hex`, `area_hex`, `rle_sha256`, `rle_len`) **are** stored, so any
mismatch is localisable to the region and the field without re-running.

## 5. The bar, fixed before the run

**PASS = zero differing bytes across (a), (b) and (c).** Concretely, for all 12 images:

- (a) `emit_digest(A0) == emit_digest(A1) == emit_digest(A2)`
- (b) `emit_digest(A0) == emit_digest(B1) == emit_digest(B2) == emit_digest(B3)`
- (c) `emit_digest(A0) == emit_digest(C0) == emit_digest(C1) == emit_digest(C2)`

Any single differing digest on (a), (b) or (c) is a **FAIL** of condition 2, and the round reports it
as a fail. There is no "mostly deterministic".

**(d) is reported, not gated.** Its four possible readings and their consequences are fixed here:

- **d1 — all three digests match A0.** Concept order does not affect output at all. The documented
  run-identity constraint is stronger than the model requires. Report as "no boundary found".
- **d2 — `content_digest` and `keyed_digest` match, `emit_digest` differs.** The boundary is
  **emission order only**. Stored rows are keyed by `(image, concept, instance)` and are therefore
  unaffected: determinism holds at the row grain, and the constraint that concept order is part of
  run identity is doing no work beyond bookkeeping. Report as a **cosmetic boundary**.
- **d3 — `content_digest` matches, `keyed_digest` differs.** Same regions, different index
  assignment: the row *keys* move even though the pixels do not. Report as a **row-key boundary** —
  it would break resume/dedup logic that assumes stable `instance_idx`, and that consequence is
  named here before it is observed.
- **d4 — `content_digest` differs.** Concept order changes what the model actually returns. A
  **substantive determinism boundary**: run identity must include concept order, exactly as
  `config.py` already asserts, and any runtime proposal must pin the order. Report as such.

## 6. Speed, measured for the record

Not gated — §6.1 condition 3 ("fast enough") is not this round's question and no threshold is set
here. Reported:

- **Per-image wall time** — the `segment_concepts` call only, with decode and RLE encoding excluded
  and reported separately. Median and p95 over all 144 inferences, and broken out by decoded
  resolution.
- **Model load, cold** — P1's load, the first process after a period with no GPU work. Reported
  alongside the warm-cache caveat below.
- **Derived projections under the precompute architecture** — the architecture in which masks are
  computed once per file and stored, so runtime reads a table rather than a model:
  - **one-time corpus cost** = median per-image × corpus file count, stated for both collections and
    with the dedup caveat named;
  - **per-new-file cost** = median per-image, plus model load if the process is not resident.

**Stated in advance, because it limits the claim:** "cold" here means **fresh process, fresh Metal
context, warm filesystem page cache**. Purging the page cache requires `sudo purge`, which is a
machine-wide action an agent does not take. The load numbers are therefore a floor, and the report
says so rather than calling them cold-cold.

## 7. Outputs

| path | what |
|---|---|
| `research/v3/data/sam/determinism-1-sample.json` | the 12-cover manifest, built before the run |
| `research/v3/data/sam/determinism-1-{a,b1,b2,b3,c,d}.jsonl` | raw pass records, one file per process |
| `research/v3/data/sam/determinism-1-analysis.json` | the comparison, written by `analyze_determinism.py` |
| `research/v3/oracle/sam/DETERMINISM_TEST.md` | the verdict and the proposed §6.1 wording |

The analysis script is written and committed **before** the run, so its comparison rule cannot be
fitted to the numbers it will read.

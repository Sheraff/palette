# SAM determinism + speed — the measurement and the verdict

**Batch `sam-determinism-1`, 2026-08-04.** Pre-registration: `DETERMINISM_PREREG.md`, committed
`4c3c8b9` **before** any inference ran, together with the sample manifest and both scripts.
**GPU:** single-owner slot held for the whole run; `pgrep` clean before and after.

**Verdict in one line: condition 2 of `PHASE_0_DECISIONS.md` §6.1 is MEASURED AND SATISFIED for a
pinned deployment — zero differing bytes across all three gated conditions — with one documented
boundary on concept order that is cosmetic, not substantive.**

---

## 1. What was run

| | |
|---|---|
| model | `mlx-community/sam3.1-bf16` @ `a992e302ea9b0f03f41dfd93414a4fd0e818f65b`, bf16 |
| runtime | mlx-vlm 0.6.8 / mlx 0.32.0, Python 3.14.3, macOS 15.7.7, Apple M3 Max |
| concept set | v2.2, 12 concepts, hash `d49a63c479d4e672…` |
| score threshold | 0.3 (the storage floor), resolution cap 0 (native) |
| sample | 12 covers, `data/sam/determinism-1-sample.json` |
| passes | 12 passes over 6 processes = **144 inferences**, **5,148 regions produced** |
| comparisons | 132 pass-image comparisons against the reference, **4,719 regions compared** |

The reference pass is condition (a) rep 0. Every other pass is compared to it per image.

Sample coverage (purposive, argued in `DETERMINISM_PREREG.md` §2): JPEG ×7, PNG ×1, AVIF ×2,
extensionless ×3; 147×147, 300×300, 400×155 (non-square), 483×483, 640×640; detection load 1 to 144
regions on one image; human-confirmed strata cjk ×2, person ×2, text-heavy ×3, busy ×3, flat ×2.

## 2. Results — the gated conditions

Comparisons are of `emit_digest`: SHA-256 over every region's concatenated canonical form, where
score, bbox and area are serialised as `float.hex()` (exact IEEE-754) and the mask is its full COCO
compressed-RLE string. **Nothing is rounded anywhere in this comparison.**

| condition | comparisons | emit-identical | differing | verdict |
|---|---|---|---|---|
| **(a)** repeated inference in one process | 24 | **24 / 24** | **0** | **PASS** |
| **(b)** fresh process restarts (3 processes, cold Metal context each) | 36 | **36 / 36** | **0** | **PASS** |
| **(c)** permuted image processing order (3 distinct non-identity permutations) | 36 | **36 / 36** | **0** | **PASS** |

**Zero differing bytes. Zero regions present in one run and not the other. Zero region-count
mismatches. No image, no stratum, no resolution, no decoder path produced a single differing bit.**

The pre-registered bar was "PASS = zero differing bytes across (a)–(c)". It is met exactly, with no
qualification and no near-miss to disclose.

**A bonus result that was checked rather than assumed.** Each process decodes every image
independently and stores the SHA-256 of the decoded pixel buffer. Across all 132 comparisons and all
six processes, **0 pixel-hash mismatches** — including the AVIF and the extensionless files. The
input side of the pipeline is byte-deterministic too, so the inference result above is not resting
on a decoder that happened to agree.

## 3. Result — condition (d), the concept-order boundary

Pre-registered as **reported, never gated**, because `config.py` already documents concept order as
part of run identity. Three digests were pre-registered to tell the four possible readings apart.

| digest | identical | differing |
|---|---|---|
| `emit_digest` — emission order | 7 / 36 | 29 |
| `keyed_digest` — sorted by (concept, instance_idx) | **36 / 36** | **0** |
| `content_digest` — index-free multiset of regions | **36 / 36** | **0** |

Across the 29 emit-differing comparisons: **0 regions differing in any field** (score 0, bbox 0,
area 0, mask RLE 0), **0 regions present in only one run**, and **0 blob-length mismatches** — the
canonical byte blobs are the same length to the byte in every case, because they contain the same
bytes in a different order.

**This is pre-registered reading d2: a cosmetic boundary.** Permuting concept order changes the order
regions are emitted in, and changes nothing else. `instance_idx` assignment is stable per concept
regardless of where that concept sits in the prompt list, so even the row keys hold.

The seven emit-identical cases are exactly the low-count images (n = 1, 7, 9) where the concepts that
actually fired happened to keep their relative order under the permutation. That is the expected
shape of a pure-ordering effect and is consistent with the reading rather than an exception to it.

**Stated precisely, because the distinction carries a real consequence:** under concept permutation
the **row set is byte-identical**; the **file is not**. `run_sam` writes region rows in emission
order, so a JSONL written under a permuted concept order contains the same rows in a different
line order. Anything that hashes the file rather than the rows would see a difference. A runtime
proposal must therefore still pin the concept order — which `config.py` already requires by folding
it into `CONCEPT_SET_HASH`.

## 4. Agreement with the existing incidental evidence

**Correction to the framing this round was commissioned under.** The 4,867-region cross-run
byte-identity check is recorded as **v4-vs-v5** (`sam-eval-142-v4-nouns` vs
`sam-eval-142-v5-allnouns`), not v2-vs-v5; the hash boundary it crosses is concept set v2.1 → v2.2.
Source: `RESIDUAL_V5_NOTES.md` §12.5.

| incidental evidence | what it showed | does this round agree? |
|---|---|---|
| **4,867-region v4-vs-v5 static arm** — "4,867 regions in v4, 4,867 in v5, 4,867 matched, 0 present in only one run, 0 differing in score, area or mask RLE" | cross-run identity including `mask_rle`, over 142 covers, two separate GPU runs | **Yes.** This round reproduces that result on exact bit patterns rather than stored decimals, and adds what that check could not isolate: fresh processes and permuted orders. It also explains *why* it held — that check permuted the concept set (10 shared concepts embedded in a 10- vs 12-prompt call), which is condition (d), and (d) is byte-identical at the row grain. |
| **CJK probe score reproduction** — probe 4 vs `sam-cjk-probe-7`, a day apart: 9 overlapping (image, prompt) cells, 50 regions, 50/50 scores equal at probe 4's stored 4 dp | cross-run, cross-day score reproduction | **Yes.** And this round supplies exactly what that one could not: probe 4 stored **no `mask_rle`**, so it was never a mask byte-identity test. The masks are now compared, and they match. |

**Neither prior artifact was designed as a determinism test, and neither is retired by this one.**
They are consistent with it, which is worth recording precisely because a disagreement would have
been the interesting outcome.

## 5. Speed, for the record

Not gated — §6.1 condition 3 ("fast enough") is not this round's question and no threshold is set
here. Numbers are the `segment_concepts` call only; decode and RLE encoding are reported separately.

**Per-image inference, all 144 inferences: median 3.65 s, p95 7.82 s, min 2.68 s, max 8.55 s.**

That p95 is real but it is not a resolution effect, and quoting it without the next two paragraphs
would misinform.

**Resolution barely matters over this range**, because SAM's own processor resizes to its fixed
internal input:

| decoded size | n | median | p95 |
|---|---|---|---|
| 147×147 | 12 | 3.72 s | 6.14 s |
| 300×300 | 72 | 3.61 s | 7.41 s |
| 400×155 | 12 | 3.57 s | 7.05 s |
| 483×483 | 12 | 3.60 s | 7.16 s |
| 640×640 | 36 | 3.66 s | 6.40 s |

A 19× difference in pixel count moves the median by 4%. **Per-image cost is set by the 12-prompt
union, not by the image.**

**What the spread actually is: sustained-load thermal drift on the M3 Max.** Pass-group medians, in
the order the passes ran:

| pass group | median |
|---|---|
| a rep0 (first, coolest) | **2.75 s** |
| a rep1 / a rep2 | 3.03 s / 3.09 s |
| b1 / b2 / b3 | 2.85 s / 3.05 s / 3.93 s |
| c rep0 / c rep1 / c rep2 | 6.42 s / **7.49 s** / 4.91 s |
| d rep0 / d rep1 / d rep2 | 4.11 s / 3.70 s / 3.59 s |

It climbs to a 7.49 s median under twelve minutes of back-to-back GPU work and recovers to 3.59 s.
**The determinism result is unaffected — every one of those passes returned identical bytes, so the
model's output is invariant to the thermal state that changes its speed by 2.7×.** That is itself a
small piece of evidence for the determinism claim.

**Model load, fresh process:** 0.96 s, 1.01 s, 1.89 s, 2.02 s, 2.31 s (median **1.89 s**, no
verification). With `--verify-weights` (re-hashing the 3.5 GB safetensors against the pin): **2.48
s**. **Caveat stated in advance and still binding:** "cold" here means fresh process and fresh Metal
context with a **warm filesystem page cache**. Purging the page cache needs `sudo purge`, a
machine-wide action an agent does not take. These load numbers are a floor.

**Decode:** median 0.4 ms, p95 7.0 ms (CPU, measured separately). **RLE encode:** median 3.2 ms,
p95 53 ms. Both negligible against a ~4 s inference, but non-zero and included below.

### 5.1 Projections under the precompute architecture

The precompute architecture is the one in which masks are computed **once per file** and stored, so
the shipped pipeline reads a table and never loads a model. Two numbers matter.

**Planning figure: 4.3 s/image.** Not the 2.75 s cold-machine best case, which is not achievable
sustained, and not the 7.49 s hot median, which is a transient. 4.3 s is what three independent
sustained runs agree on: this round's 144-inference mean is **4.11 s**, and the two existing full
142-cover production runs measured **4.25 s** (`sam-eval-142-v2`) and **4.28 s**
(`sam-eval-142-v5-allnouns`, the first full run under the v2.2 hash). A 142-image consecutive run is
a better model of corpus work than any pass in this round.

**One-time corpus cost**, single process, one pass over every file:

| collection | files | at 4.3 s/file |
|---|---|---|
| sharded `00`…`14` | 7,550 | 9.0 h |
| `music-artworks/` | 8,595 | 10.3 h |
| `images/` | 71 | 5 min |
| **total** | **16,216** | **≈ 19.4 h** |

*File counts are from the 2026-08-03 corpus survey and carry that timestamp.*

**Two caveats that both cut the real number, and neither is measured here.** `music-artworks/` holds
multiple `_WxH` renditions of the same artwork, so the count of *distinct* files by content hash is
lower than 8,595 — and content hash is the right precompute key, since identical bytes cannot
produce different masks (which is precisely what this round established). And this is single-process;
nothing here measures whether two concurrent MLX processes help or thrash, and the standing
single-owner GPU rule means no agent may find out casually. **Both are proposed as loose-end ledger
entries in `data/decisions/proposed-sam-determinism-1.json` → `proposedLooseEnds`, not written
here:** `PHASE_0_LOOSE_ENDS.md` is the housekeeping workstream's file and this workstream does not
edit it.

**Per-new-file cost** (a file arriving after the corpus pass):

| path | cost |
|---|---|
| resident service, model already loaded | 0.4 ms decode + **4.3 s** inference + 3 ms RLE ≈ **4.3 s** |
| cold CLI invocation | + **1.9 s** model load ≈ **6.2 s** (**6.8 s** with weight verification) |

## 6. What this does and does not establish

**Establishes.** For this model revision, this concept set, this MLX version and this machine, SAM's
full output is byte-identical across repeated inference, across fresh processes, and across image
order — and, at the row grain, across concept order too. Condition 2 has a test, and the test passes.

**Does not establish, and a proposal must not overstate:**

1. **One machine.** M3 Max / macOS 15.7.7. Determinism across machines, across Apple Silicon
   generations, or on a different GPU was not tested. Floating-point reduction order can differ
   between GPU families, and this round says nothing about that.
2. **One version stack.** mlx 0.32.0 / mlx-vlm 0.6.8. An MLX upgrade can change kernel selection.
   This is a property of a **pin**, not of SAM.
3. **One model revision and one concept set.** Both are part of run identity by construction.
4. **Not the other three conditions.** §6.1's conditions are conjunctive. Condition 1 (no upstream
   model) is an architecture question; condition 3 (fast enough) has no threshold set; condition 4
   (plain code exhausted) is untouched. **SAM at runtime remains inadmissible.** This round moves
   exactly one condition from "unsatisfied by default" to "satisfied, with scope".
5. **Determinism is not correctness.** Nothing here says the masks are good. Mask quality is
   `MASK_REVIEW_NOTES.md`'s business.

**The honest one-sentence summary for a proposal author:** SAM is deterministic enough that a
precomputed mask table is reproducible from a pinned stack, and any claim broader than "same pin,
same machine" needs its own measurement.

## 7. Proposed §6.1 condition-2 replacement — NOT APPLIED

`PHASE_0_DECISIONS.md` is owned by the housekeeping workstream (`CONVENTIONS.md` path-ownership
table). The text below is proposed, not applied. It replaces condition 2 only; conditions 1, 3, 4
and the surrounding paragraphs are untouched.

> 2. **Provably deterministic — MEASURED AND SATISFIED for a pinned stack** (`sam-determinism-1`,
>    2026-08-04). The same file yields **byte-identical masks across runs**. This was tested before
>    anything relied on it, as this condition required: 12 covers × 12 passes = 144 inferences and
>    5,148 regions, comparing every region's mask RLE, score, bbox and area on exact IEEE-754 bit
>    patterns, with **zero differing bytes** across repeated inference in one process (24/24 image
>    comparisons), fresh process restarts with a cold Metal context (36/36), and permuted image
>    processing order (36/36). Image decoding was checked the same way and is byte-identical too.
>    Evidence: `oracle/sam/DETERMINISM_TEST.md`, `oracle/sam/DETERMINISM_PREREG.md`,
>    `data/sam/determinism-1-analysis.json`.
>
>    **One boundary is documented, and it is cosmetic.** Permuting **concept** order changes the
>    order in which regions are emitted and nothing else: over 36 comparisons the row-keyed digest
>    (`concept`, `instance_idx`) and the order-free content digest are identical **36/36**, with
>    zero regions differing in any field. Since stored rows are keyed on (image, concept, instance),
>    the **row set** is byte-identical under concept permutation while the **file's line order** is
>    not. A proposal must pin the concept order to get file-level byte-identity — which `config.py`
>    already requires by making concept order part of `CONCEPT_SET_HASH`.
>
>    **Scope, which is part of the finding.** This holds for one model revision
>    (`a992e302…`), one concept set (v2.2, `d49a63c4…`), one runtime (mlx 0.32.0 / mlx-vlm 0.6.8)
>    and one machine (Apple M3 Max, macOS 15.7.7). Determinism across machines, GPU families, MLX
>    versions or model revisions was **not** tested and is **not** claimed. The condition is
>    satisfied **for a pinned deployment**, and any proposal that changes a pin owes this
>    measurement again.
>
>    **This satisfies condition 2 only.** The four conditions are conjunctive and SAM at runtime
>    remains inadmissible until 1, 3 and 4 are argued.

## 8. Reproducing this

```sh
cd research/v3/oracle/sam
.venv/bin/python select_determinism_sample.py --out ../../data/sam/determinism-1-sample.json
.venv/bin/python determinism_probe.py --condition a --reps 3 --out determinism-1-a
.venv/bin/python determinism_probe.py --condition b --reps 1 --verify-weights --out determinism-1-b1
.venv/bin/python determinism_probe.py --condition b --reps 1 --out determinism-1-b2
.venv/bin/python determinism_probe.py --condition b --reps 1 --out determinism-1-b3
.venv/bin/python determinism_probe.py --condition c --reps 3 --permute-images  --out determinism-1-c
.venv/bin/python determinism_probe.py --condition d --reps 3 --permute-concepts --out determinism-1-d
.venv/bin/python analyze_determinism.py --out ../../data/sam/determinism-1-analysis.json
```

Total GPU time for the six inference processes: **≈ 12 minutes**. The probe is a GPU job — hold the
single-owner slot.

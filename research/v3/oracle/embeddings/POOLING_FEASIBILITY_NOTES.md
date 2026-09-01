# DINO CLS + mean-patch pooling — feasibility of a re-score without re-embedding

**Verdict: per-patch token embeddings were NOT stored. Only one pooled vector per image exists
on disk, for every arm.** Therefore unrealized-ideas item 7 cannot be re-scored from stored
artifacts at any price; it requires re-running the DINOv2 forward pass over the corpus. This note
prices that honestly and reports a measurement that kills the obvious cheap shortcut.

**No GPU work was performed for this note.** Everything below was derived on CPU from the
committed `.npy` vectors, the `.ids.jsonl` index files, and the run logs. No model was loaded, no
network call was made, and no tracked file was modified.

---

## Terms, once

- **CLS token** — a Vision Transformer splits an image into a grid of small squares ("patches")
  and turns each into a vector. It also prepends one extra, non-image token, the *classification*
  or **CLS** token, whose job is to accumulate a summary of the whole image. Taking that one
  vector as "the embedding of the image" is the standard DINOv2 global descriptor.
- **Patch token** — the per-square output vectors, one per patch. DINOv2-large at 224 px with
  patch size 14 produces a 16x16 grid, i.e. **256 patch tokens** alongside the 1 CLS token.
- **Mean-patch pooling** — averaging all 256 patch tokens into a single vector. It carries
  spatially-distributed evidence the CLS token may have compressed away. The DINOv2 linear-eval
  recipe concatenates CLS with mean-patch, giving **1024 + 1024 = 2048 dimensions**, which is the
  "dim 2048" quoted in item 7.
- **Arm** — one model configuration in the bake-off (e.g. `dinov2-vitl14`, `pe-core-l14`). Six
  arms were embedded over the same 16,145 files.
- **R@1 (recall-at-1)** — over 24,648 ordered (query, target) pairs of different renditions of the
  same artwork, the fraction where the correct target is the single most cosine-similar file in
  the whole pool. Higher is better.
- **sha-pinned** — an artifact whose sha256 is recorded inside another artifact, so that changing
  the first breaks a load-bearing assertion in the second.

---

## Step 1 — the evidence that patch tokens were never kept

### 1a. The extraction line discards them at source

`research/v3/oracle/embeddings/common.py:282-284`:

```python
def _encode_dino_cls(model, batch):
    # CLS token: the standard DINOv2 global descriptor for instance retrieval.
    return model(pixel_values=batch).last_hidden_state[:, 0]
```

`last_hidden_state` has shape `(batch, tokens, dim)`. The index `[:, 0]` selects token 0 — the
CLS token — and everything after it, i.e. every patch token (and, for DINOv3, the register
tokens), is dropped inside the `torch.no_grad()` block and never leaves the function. This is the
one function all four DINO arms route through: `common.py:346` sets `encode_fn = _encode_dino_cls`
for every arm whose `loader` is `hf_dino`.

Nothing downstream can recover what this line threw away. `ArmRuntime.encode`
(`common.py:241-250`) L2-normalizes and returns exactly what `_encode_dino_cls` handed it.

### 1b. The storage layer structurally cannot hold patch tokens

`common.py:575-581`:

```python
    def append_vectors(self, vectors) -> list[int]:
        """Write vectors to the shard file first, then return their row indices."""
        import numpy as np
        array = np.ascontiguousarray(vectors, dtype="<f4")
        if array.ndim != 2 or array.shape[1] != self.dim:
            raise ValueError(f"expected (n, {self.dim}) vectors, got {array.shape}")
```

Two dimensions, hard-asserted, with `self.dim` taken from `config.ARMS[arm_tag]["dim"]`
(`common.py:474-479`). A 3-D `(batch, patches, dim)` tensor raises. `finalize_npy`
(`common.py:599-611`) reshapes the flat shard to `(rows, self.dim)` and refuses to run unless the
byte count matches `rows * dim * 4` exactly (`common.py:603-608`), so a patch-token file could not
even have been finalized by accident.

### 1c. Every `.npy` on disk is 2-D, at exactly the model's CLS width

Read directly from the `.npy` headers (magic `\x93NUMPY`, v1.0, `descr='<f4'`,
`fortran_order=False`):

| file | shape | dtype |
|---|---|---|
| `sharded.dinov2-vitl14.npy` | (7550, 1024) | float32 |
| `music_artworks.dinov2-vitl14.npy` | (8595, 1024) | float32 |
| `sharded.dinov2-vitl14-392.npy` | (7550, 1024) | float32 |
| `music_artworks.dinov2-vitl14-392.npy` | (8595, 1024) | float32 |
| `sharded.dinov3-vitl16.npy` | (7550, 1024) | float32 |
| `music_artworks.dinov3-vitl16.npy` | (8595, 1024) | float32 |
| `sharded.dinov3-vith16plus.npy` | (7550, 1280) | float32 |
| `music_artworks.dinov3-vith16plus.npy` | (8595, 1280) | float32 |
| `sharded.pe-core-l14.npy` | (7550, 1024) | float32 |
| `music_artworks.pe-core-l14.npy` | (8595, 1024) | float32 |
| `sharded.siglip2-so400m.npy` | (7550, 1152) | float32 |
| `music_artworks.siglip2-so400m.npy` | (8595, 1152) | float32 |

Every width equals the arm's declared `dim` in `config.py` (1024 for the ViT-L arms, 1280 for
`dinov3-vith16plus`, 1152 for SigLIP2). Per-patch storage would have been `(N, 257, 1024)`, or a
flattened width of 262,144. Neither appears.

### 1d. No other on-disk artifact holds them

`research/v3/data/embeddings/` is **848 MB** total: 412 MB of append-only `shards/*.f32` and the
rest the finalized `.npy` files plus JSON. Each `.f32` is exactly its `.npy` minus the 128-byte
header (e.g. `sharded.dinov2-vitl14.f32` = 30,924,800 bytes = 7550 x 1024 x 4; the `.npy` is
30,924,928), so the shard files are the same pooled vectors, not a richer intermediate. A repo-wide
search for `*.pt`, `*.pth`, `*.h5`, `*.safetensors`, `*.bin`, `*.npz` under `research/v3` returns
only files inside `.venv` site-packages (scipy/sentencepiece test data). There is no cache, no
memmap, no sidecar.

For scale: keeping DINOv2-large patch tokens for all 16,145 files would have cost
16,145 x 257 x 1024 x 4 = **~15.8 GiB per arm**, against 66 MB today. Not storing them was a
reasonable default, not an oversight.

### 1e. No pooling flag exists, and the ledger's claim is confirmed

`config.py` has **no pooling switch of any kind**. `pooling` is a descriptive string in each arm's
spec, copied verbatim into `manifest.json` by `embed.py:293`. Verified against the manifest on
disk, all six arms:

| arm | `embedding.pooling` in `manifest.json` |
|---|---|
| `dinov2-vitl14` | `CLS token` |
| `dinov2-vitl14-392` | `CLS token` |
| `dinov3-vitl16` | `CLS token` |
| `dinov3-vith16plus` | `CLS token` |
| `pe-core-l14` | `attention-pool projection head (open_clip encode_image)` |
| `siglip2-so400m` | `attention-pool projection head (open_clip encode_image)` |

The ledger's statement that all four DINO arms are `"pooling": "CLS token"` is **confirmed
exactly**, and the string is not merely a label — it is an accurate description of
`_encode_dino_cls`.

**Step 2A does not apply. What follows is Step 2B.**

---

## Step 2 — pricing the re-run

### 2.1 Which arms must be re-embedded

| arm | re-embed needed? | why |
|---|---|---|
| `dinov2-vitl14` | **Yes — unavoidable** | This is the arm under test. Mean-patch vectors do not exist and cannot be derived. Note the whole corpus is needed, not just the pairs: see 2.4. |
| `pe-core-l14` | **No — zero GPU** | Mean-patch is a change to `_encode_dino_cls` only. PE-Core routes through `_encode_open_clip` (`common.py:278-279`) and its attention-pool projection head is untouched, so its vectors are bit-for-bit the ones already on disk. The bake-off comparison is paired **per pair, not per vector space**: each arm ranks the target within its own pool, and McNemar compares the two arms' per-pair hit/miss outcomes. PE-Core's per-pair ranks can therefore be reused verbatim; they cost a ~40 s CPU re-score, not a re-embed. |
| `dinov3-vitl16`, `dinov3-vith16plus`, `dinov2-vitl14-392` | Not to answer item 7 | These are DINO arms and would also change under mean-patch, but none of them is the comparison item 7 names. They become necessary only if mean-patch *wins* and the canonical-instrument choice has to be re-argued family-wide — DINOv3 could benefit more or less than DINOv2, and the ranking would no longer be established. Budget them as a contingent second phase. |
| `siglip2-so400m` | No | Not a DINO arm, unchanged, and already last by a wide margin. |

### 2.2 Corpus size, counted here

Counted by `wc -l` over the `.ids.jsonl` files, all twelve of which agree:

- `sharded`: **7,550** rows
- `music_artworks`: **8,595** rows
- **Total pool: 16,145 files.** Matches `config.EXPECTED_FILE_COUNTS` and every published
  `pool_size`.

### 2.3 Minutes per arm — from RECORDED throughput, not an estimate

Summed from the `wall_seconds` / `encode_seconds` / `total_rows` fields that `embed.py:589` wrote
into `research/v3/data/embeddings/shards/run.<arm>.log` on 2026-08-02, over both collections.
Device `mps`, batch size 8, torch 2.13.0, float32 (`manifest.json`).

| arm | files | recorded wall | recorded encode | recorded throughput |
|---|---|---|---|---|
| **`dinov2-vitl14`** | 16,145 | **604.8 s = 10.1 min** | 9.4 min | **26.70 img/s** |
| `dinov3-vitl16` | 16,145 | 650.1 s = 10.8 min | 10.1 min | 24.84 img/s |
| `pe-core-l14` | 16,145 | 1,698.4 s = 28.3 min | 27.6 min | 9.51 img/s |
| `dinov3-vith16plus` | 16,145 | 1,947.8 s = 32.5 min | 31.6 min | 8.29 img/s |
| `siglip2-so400m` | 16,145 | 1,998.2 s = 33.3 min | 32.5 min | 8.08 img/s |
| `dinov2-vitl14-392` | 16,145 | 2,269.0 s = 37.8 min | 37.1 min | 7.12 img/s |

**Cost of the item-7 re-embed, with uncertainty:**

| item | value | basis |
|---|---|---|
| arm to re-embed | `dinov2-vitl14`, 16,145 files | 2.1, 2.2 |
| anchor | **10.1 min** | recorded wall time of the original run of this exact arm |
| added compute for mean-patch | negligible | the patch tokens are already materialized in `last_hidden_state`; the change is a `.mean(dim=1)` over 256 tokens and a `cat`, well under 1% of a ViT-L forward pass |
| added I/O | ~2x the writes | the concat is 2048-wide instead of 1024: 132 MB `.npy` + 132 MB `.f32` per collection-pair instead of 66+66. Trivial against 10 min of compute |
| **realistic range** | **10–14 min** | the anchor plus headroom for a cold model load (1.5 s recorded), thermal state, and unrelated machine load. The recorded run-to-run spread on this hardware is documented as large enough that batch sizes 8/16/32 were indistinguishable (`config.py:104-109`), so treat the low end as the floor, not the expectation |
| PE-Core side | **0 GPU min**, ~40 s CPU | 2.1 |
| CPU re-score of both arms | ~1–2 min | measured: my own full re-derivation of both arms' 24,648 per-pair ranks over the 16,145-file pool ran in about a minute on CPU |
| extra disk | ~265 MB | 16,145 x 2048 x 4 x 2 (npy + shard) |
| contingent family re-run if mean-patch wins | +81.1 min | recorded walls of `dinov3-vitl16` + `dinov3-vith16plus` + `dinov2-vitl14-392` |

The GPU minutes are cheap and well-anchored. They are not the cost.

### 2.4 The real cost: what adoption would disturb

Measuring mean-patch disturbs **nothing**, provided the run writes to new filenames (a new arm tag,
e.g. `dinov2-vitl14-clsmeanpatch`) and the score goes to a new sidecar JSON. `embed.py` is
arm-tagged throughout (`<collection>.<arm>.npy`), so a new arm cannot collide with an existing
file. This is the safe path and it should be the default.

**Adopting** mean-patch as the canonical instrument is a different matter, and this is where the
price lives. `dinov2-vitl14` is the `CANONICAL_ARM` and its vectors are load-bearing four ways:

1. **The near-duplicate census.** `near_dup_census.py:190` defaults `--primary-arm` to
   `config.ARM_DINOV2`, and the census graph is the **union** over three arms including it
   (`holdout.json` `header.nearDuplicateCensus.armCriterion`:
   `"any_arm (union of dinov2-vitl14, pe-core-l14, dinov3-vitl16)"`). Changing DINOv2's vectors
   changes which pairs clear 0.95 on that arm, so the union changes, so **`near-dup-census.json`
   changes and its sha256 changes**.
2. **The holdout freeze.** `holdout.json` `header.nearDuplicateCensus.sha256` pins the census at
   `2140f43667beefea6c9fc5e6035f04e07eaa7fd720795da40e9e9eee85a63a8c`. A new census invalidates the
   pin. The holdout's components are built over that graph, so a faithful response is a
   **re-freeze — which re-rolls which artworks are held out**. Per the adversarial review, the
   current list is already consumed by the coverage set, ladder eligibility and boundary
   assertions, and per unrealized-ideas item 9 the window for changing it is described as closed.
3. **The coverage set's build-time assertion.** `src/coverage-set/build-coverage-set.ts:259-262`
   recomputes the census sha256 and calls `fail()` if it differs from the holdout's pin, with the
   message *"Selecting against a different graph would make the holdout leak assertion
   meaningless."* The build **hard-stops**. It also reads the canonical `.npy` directly
   (`build-coverage-set.ts:110-113`) and clusters over it, so the 200 core artworks and the k=36
   cluster assignment would move even if the assertion were satisfied.
4. **Stratification and the galleries.** `data/embeddings/gallery/summary.json` supplied the
   inherited k=36 (`build-coverage-set.ts:804` `kProvenance`), and the reviewer's four gallery
   observations — now warehouse note records `n-msdbbeqw-3e725512` and siblings, cited by
   `d-2026-08-04-embedding-canonical-model-warehouse-funded` — were made looking at **CLS-token**
   clusters. Those observations are the actual decisive evidence for choosing DINOv2 over PE-Core
   (MAJOR-3). They would not transfer to a differently-pooled instrument without a fresh browse,
   and a fresh gallery re-exposes held-out artworks (MAJOR-1).

So: **~10–14 GPU-minutes to measure, and a cascade through the census, the holdout freeze, the
coverage set and a reviewer re-browse to adopt.** Anyone quoting item 7's "one line, a ~12 min full
run, a rescore" should read that as the price of the *measurement* only. The ledger's own sentence
— "the canonical model is load-bearing for stratification, the near-dup census, the holdout
boundary assertion and the coverage set" — is the price of the *decision*, and it is much larger.

The sane sequencing is therefore: measure on a new arm tag first, and only if mean-patch produces a
clearly separating result does the adoption question arise at all.

### 2.5 Could a SUBSET answer the quality question cheaply? — Measured. **No.**

This was the most promising cost saver, so I measured it rather than asserting it.

**How many distinct images the bake-off eval actually touches.** I rebuilt the ground truth
independently from the `.ids.jsonl` paths using the same two filename patterns
(`eval_pairs.py:58` and `:63`) and counted the files that appear in any multi-rendition group:

| collection | files | multi-rendition artworks | member files | ordered pairs |
|---|---|---|---|---|
| `sharded` | 7,550 | 644 | 1,288 | 1,288 |
| `music_artworks` | 8,595 | 1,348 | 5,855 | 23,360 |
| **total** | **16,145** | **1,992** | **7,143** | **24,648** |

Every number reproduces `bakeoff.json` `ground_truth` exactly. So the eval touches **7,143 distinct
images as query or target — 44.2% of the pool.** On its face that halves the re-embed.

**But the other 9,002 files are not spectators.** The metric ranks the target against *every* file
in the pool (`eval_pairs.py:332`, `sims = pool @ pool[q_index]`); the non-member files are the
distractors, and the distractors are what make R@1 hard. Embedding only the 7,143 members would
shrink the pool, and I measured how much that distorts the very comparison item 7 is about.

Method: my own nearest-neighbour code over the stored `.npy` vectors, mirroring `eval_pairs.py`'s
documented metric — `rank = 1 + count of strictly greater similarities`, with the query and all
other same-artwork renditions subtracted from that count (`eval_pairs.py:341-349`), ties scored
optimistically. Significance is **paired McNemar with continuity correction** on the discordant
pairs (`b01` = DINOv2 hits and PE-Core misses; `b10` the reverse), which is the test the adversarial
review used and whose full-pool result I reproduce to the digit. Distractor subsets drawn with a
fixed seed (`0xC0FFEE`).

| pool size | distractors | R@1 dinov2 | R@1 pe-core | ΔR@1 | b01 | b10 | χ² (cc) | p |
|---|---|---|---|---|---|---|---|---|
| 7,143 (members only) | 0 | 0.91521 | 0.89638 | +0.01883 | 867 | 403 | 168.794 | 1.4e-38 |
| 8,143 | 1,000 | 0.88871 | 0.87386 | +0.01485 | 1029 | 663 | 78.738 | 7.1e-19 |
| 9,143 | 2,000 | 0.87350 | 0.86461 | +0.00889 | 1068 | 849 | 24.791 | 6.4e-07 |
| 11,143 | 4,000 | 0.84076 | 0.83711 | +0.00365 | 1302 | 1212 | 3.151 | 0.076 |
| 13,143 | 6,000 | 0.81378 | 0.81216 | +0.00162 | 1420 | 1380 | 0.543 | 0.461 |
| **16,145 (full)** | 9,002 | **0.78923** | **0.78866** | **+0.00057** | **1573** | **1559** | **0.054** | **0.816** |

The bottom row reproduces the published `bakeoff.json` R@1 for both arms to 10 decimal places
(0.7892323921 and 0.7886643947) and the adversarial review's McNemar exactly (b01=1573, b10=1559,
χ²=0.05, p=0.816), which is my check that the harness is right.

**Reading it.** The DINOv2-vs-PE-Core verdict is a smooth, monotone function of pool size. On the
members-only pool the two arms are separated at p = 1.4e-38 and DINOv2 looks 1.9 pp better; on the
full pool they are indistinguishable at p = 0.82 and the gap is 0.06 pp — a **33-fold shrink in the
effect size**. A subset evaluation would not just add noise, it would *manufacture* the separation
that item 7 exists to look for. Any mean-patch result measured on a reduced pool would be
uninterpretable against the published number and actively misleading.

Nor is there a usable middle: p only reaches "indistinguishable" territory near the full pool
(p = 0.46 at 13,143 files, 81% of the corpus, and even there ΔR@1 is still 3x the true value). The
saving at 81% of the corpus is about **2 minutes of GPU time**, against a distorted answer.

**Conclusion on subsetting: there is no cheap subset.** The good news is that the thing subsetting
was meant to save is not expensive anyway — the full honest measurement is one 16,145-file DINOv2
re-run at a recorded 10.1 min, plus a free CPU re-score. Spend the ten minutes; do not spend eight
of them buying a wrong answer.

### 2.6 Recommended shape, if this is ever picked up

1. Add a mean-patch encode path and register a **new arm tag** (`dinov2-vitl14-clsmeanpatch`,
   `dim: 2048`). Do not modify `ARM_DINOV2`. New tag means new filenames means nothing existing is
   touched.
2. Have the new encode path return CLS, mean-patch and the concat from the **same forward pass** —
   they are all free once `last_hidden_state` exists — so one 10-minute run answers all three
   variants rather than three runs answering one each.
3. Free correctness check: the re-run's CLS slice should match `dinov2-vitl14.npy` to within the
   ~1e-6 batching tolerance the manifest already documents (`manifest.json` `determinism`). If it
   does not, the re-run is wrong and nothing downstream should be believed.
4. Score with `eval_pairs.py --arms <new> pe-core-l14 --allow-incomplete-arms --json-out
   <new sidecar>`. **Never let it write `bakeoff.json`** — the default output path is
   `out_dir / config.BAKEOFF_FILENAME` (`eval_pairs.py:675`), so `--json-out` is mandatory.
5. Run McNemar with continuity correction against PE-Core's existing per-pair ranks over the full
   16,145 pool. That is the number item 7 is asking for.
6. Only then, and only if it separates, open the adoption question — with 2.4 in front of whoever
   decides.

---

## Provenance of every number above

| number | where it came from |
|---|---|
| `.npy` shapes and dtypes | `.npy` headers read directly, and `npy_shape` in `shards/run.<arm>.log` |
| 7,550 / 8,595 / 16,145 | `wc -l` over all twelve `.ids.jsonl` files; matches `config.py:77-80` |
| 7,143 member files, 24,648 pairs, 1,992 groups | re-derived here from the ids paths with the patterns at `eval_pairs.py:58,63`; matches `bakeoff.json` `ground_truth` |
| all wall / encode / img-s figures | `wall_seconds`, `encode_seconds`, `total_rows` in `research/v3/data/embeddings/shards/run*.log`, written by `embed.py:589` |
| device `mps`, batch 8, float32 | `manifest.json` `arms.*.embedding`, and `[embed] device=mps` in the run logs |
| pooling strings for all six arms | `manifest.json` `arms.*.embedding.pooling` |
| R@1 / McNemar table | computed here on CPU from the stored `dinov2-vitl14` and `pe-core-l14` `.npy` files; full-pool row reproduces `bakeoff.json` and the 2026-08-03 adversarial review |
| census sha pin | `data/holdout/holdout.json` `header.nearDuplicateCensus.sha256`; assertion at `src/coverage-set/build-coverage-set.ts:259-262` |
| 848 MB / 412 MB directory sizes | `du -sh` on `research/v3/data/embeddings` |
| ~15.8 GiB hypothetical patch-token cost | 16,145 x 257 x 1024 x 4 bytes, arithmetic only |

No throughput figure in this note is invented. Where a number is an estimate rather than a
measurement — only the 10–14 min range and the "negligible" mean-patch overhead — it is labelled as
such with its basis stated.

*Written 2026-08-04. Read-only analysis: no tracked file was modified, no git state was changed, no
GPU was used, no model was loaded, no network call was made.*

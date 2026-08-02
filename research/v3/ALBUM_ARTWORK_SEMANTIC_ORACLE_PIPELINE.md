# Album Artwork Semantic Oracle — Pipeline Design

**Status:** proposal, not yet run
**Date:** 2026-08-02
**Target corpora:** two independent collections (surveyed 2026-08-02 — see §7)
- **Sharded** `{00..14}/` — 7,550 files / 6,906 artworks, 300×300 and 640×640 only
- **`music-artworks/`** — 8,595 files / 4,088 artworks / ~3,097 album-artwork
  candidates, genuine resolution range (median 700, max 3600)
**Target hardware:** MacBook Pro M3 Max, 96 GB unified memory

---

## 0. Goals and non-goals

### Goals

1. **Produce a frozen, queryable semantic label set**, one row per artwork, that the
   palette algorithm and its evaluation harness can consume with **no model in the
   loop at query time**.
2. **Answer questions colorimetric statistics cannot.** "Is this one shaded surface
   or two areas?", "Is this text part of the artwork or a label badge?" — questions
   that v2-3 could not capture statistically but that a human answers instantly.
3. **Provide an evaluation set** against which cheap deterministic proxies can be
   measured. The point is not just to have labels; it is to be able to ask "does
   this proxy actually detect what I think it detects?"
4. **Characterize failure classes.** Given the algorithm's worst outputs, identify
   what kind of artwork breaks it — as a queryable property, not an anecdote.
5. **Be reproducible.** A label file cited by a future experiment must be
   regenerable, or at minimum must carry enough provenance to know it cannot be.

### Non-goals

1. **This is not a runtime component.** No model runs in the palette extraction
   path. The pipeline runs offline, its output is committed, and the algorithm
   reads a table. If this ever changes it is a different project with a different
   design.
2. **This is not a source of colorimetry.** The models are never asked for hex
   values, luminance ordering, contrast ratios, or region areas in pixels. Anything
   numeric that can be computed is computed. Models are asked only for structure
   and semantics.
3. **This is not ground truth.** It is a scalable proxy for human judgment, whose
   agreement with human judgment is *measured per question* and known to be
   uneven. Questions below an agreement floor are recorded as "no opinion", not as
   labels.
4. **This is not a training set.** ~7,500 items with a few dozen categorical fields
   does not train a learned palette model. It calibrates thresholds and evaluates
   proxies.
5. **This does not replace the human panel reviews.** It is calibrated *against*
   them. The existing human-labelled data is the instrument that validates the
   oracle, not the other way round.

### The rule that keeps the LLM out of the downstream

Every field consumed by an algorithm is a boolean, an enum from a closed set, or a
number the *pipeline* computed. Free text exists in exactly one column, is marked
as human-audit-only, and is never read by code. If a downstream step ever needs to
parse prose, the schema is wrong.

---

## 1. Pipeline overview

Four stages. Stages 1 and 2 are cheap and run first because they inform the design
of stage 3.

```
  Stage 0   Corpus prep         normalize, hash, resolution cap
  Stage 1   Embeddings          SigLIP/CLIP → stratification + retrieval
  Stage 2   Geometry            SAM 3.1 → instance masks for things
  Stage 3   Semantics (bulk)    Qwen3-VL 30B-A3B, N prompt variants
  Stage 4   Adjudication        Qwen3-VL 32B dense, disputed subset only
  Stage 5   Human validation    stratified sample, measures the oracle
```

Stages 2 and 3 are **not alternatives**. SAM answers *where*, Qwen answers *what it
means*. SAM 3.1 is 848M parameters (~2–3 GB) and does not meaningfully compete for
memory with the Qwen run — both can be resident simultaneously.

---

## 2. Models: exactly which, and how to run them

All local. All on Apple Silicon via MLX where possible, because the PyTorch/MPS
path has op-fallback gaps and is slower.

> **Verify before committing.** API signatures and package names below reflect the
> state of these projects as of this writing and should be confirmed against the
> installed versions. The architecture of the pipeline does not depend on them.

### 2.1 Embeddings — SigLIP (or CLIP)

**What they are.** An image encoder that maps a picture to a fixed-length vector of
floats (typically 512–1152 dims) such that visually and semantically similar images
land near each other. No labels, no generation, no prompt. Deterministic, tiny,
fast.

**Model:** SigLIP 2 (so400m or base) preferred over original CLIP — better
retrieval quality at the same cost. Either is fine; pin whichever you choose.

**Run:**
```bash
pip install open_clip_torch   # or sentence-transformers, or an MLX port
```
```python
# shape only — confirm against installed version
import open_clip, torch
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-SO400M-14-SigLIP-384", pretrained="webli"
)
model.eval()
with torch.no_grad():
    vec = model.encode_image(preprocess(img).unsqueeze(0))
    vec = vec / vec.norm(dim=-1, keepdim=True)   # L2-normalize, always
```

Runs on MPS or even CPU acceptably. Whole corpus in minutes.

### 2.2 Geometry — SAM 3.1

**Do not use Meta's `facebookresearch/sam3` repo directly.** It hard-depends on
CUDA/Triton and fails on Apple Silicon. Two working routes:

- **`mlx-community/sam3-image`** — native MLX port. Preferred.
- **`MaximeLglr/sam3-apple-silicon`** — PyTorch fork with the Apple fixes. The
  underlying MPS failure is a `pin_memory()` conflict; the fork patches it.

SAM 3 does **promptable concept segmentation**: you give a short noun phrase and it
returns instance masks for every occurrence of that concept.

```python
# one pass per concept
CONCEPTS = ["text", "lettering", "logo", "parental advisory sticker",
            "person", "face"]
```

**Known limitations that shape how we use it** (see §8).

### 2.3 Semantics — Qwen3-VL

Day-0 MLX-VLM support for both dense and MoE variants.

```bash
pip install mlx-vlm
```

| Role | Model | Quant | Approx. resident |
|---|---|---|---|
| Bulk pass | `Qwen3-VL-30B-A3B` | 6-bit | ~25 GB |
| Adjudicator | `Qwen3-VL-32B` (dense) | 8-bit | ~34 GB |

**Why 6-bit and not 4-bit for the MoE:** mixture-of-experts models degrade harder
under aggressive quantization than dense models of comparable total size — each
expert receives less effective precision and routing errors compound. We have the
memory; spend it.

**Why the MoE for bulk and dense for adjudication:** see §3.

Your 96 GB gives roughly 72 GB of GPU-addressable memory by default (macOS wires
~75%). Raise with `sudo sysctl iogpu.wired_limit_mb=<mb>` if needed. Neither
configuration above requires it.

`Qwen3-VL-235B-A22B` does not fit — ~120 GB+ even at 4-bit. Not an option.

---

## 3. The cascade, and why it is a cascade

Running the best model over everything is the wrong shape. Running the cheap model
over everything and stopping is also wrong. The cascade:

**Bulk pass — 30B-A3B, 2 prompt variants over all 7,500.**
Two independently-worded renderings of the same question set. Not paraphrase for
its own sake: reorder the questions and rephrase the stems, so that a label which
survives both is robust to framing.

**Why prompt variants rather than resampling:** we run greedy decoding for
determinism, so there is no temperature to sample across. Prompt variation is the
only lever that produces a disagreement signal while keeping each individual run
reproducible.

**Disagreement routing.**
- Both variants agree → accept the label, mark `agreement = 2/2`.
- Variants disagree → route to adjudication.

**Adjudication — 32B dense, disputed subset only.**
The dense model at 8-bit has substantially more effective precision per forward
pass than the MoE at 6-bit, and is the better instrument exactly where the answer
is genuinely in doubt. Its verdict becomes the label, marked
`adjudicated = true`.

**The number this produces that actually matters:** the rate at which the dense
model *overturns* an agreed-upon MoE label on the validation sample. If the two
bulk variants agree and the dense model concurs 97% of the time, the bulk pass was
fine and you never re-run it. If it overturns 20%, the bulk model is not adequate
for that question and the question needs demoting or the model upgrading.

**MoE determinism caveat — test this before the long run.** Expert routing can, in
some implementations, depend on batch composition, which would make a "frozen"
label file quietly non-reproducible. Single-sequence greedy inference probably does
not have this property on the MLX path, but *verify empirically*: run the same
image twice and diff; then run it inside a batch of 8 and diff again. If routing
turns out to be batch-sensitive, either force batch size 1 or move the bulk pass to
the dense model and accept the slower run.

---

## 4. Human validation — the stage that makes the rest meaningful

Without this, the pipeline produces confident labels of unknown quality.

1. **Draw a stratified sample** using the stage-1 embedding clusters, so the sample
   reflects the corpus rather than its most common mode. 150–250 items.
2. **Label it by hand**, using the same closed vocabularies. This is where the
   "every question answerable in under five seconds" rule earns its keep — a
   question a reviewer has to deliberate over cannot be validated at this volume.
3. **Compute per-question agreement.** Not aggregate. Reliability will be very
   uneven: expect high agreement on `has_text` and low agreement on
   `background_structure`, because the latter is genuinely ambiguous — which is
   precisely why v2-3 could not capture it statistically either.
4. **Set an agreement floor.** Questions below it are stored with a
   `reliability` marker and excluded from the algorithmic feature path. They stay
   in the table; they just are not trusted.
5. **Cross-check against the existing panel data.** The repo already holds human
   judgments. Running the oracle against those first, before any of this, is the
   cheapest possible sanity check on whether the whole idea works.

---

## 5. Resumability, provenance, canary

A multi-hour run on a laptop **will** be interrupted — lid close, thermal event, OS
update. Design for it from the start rather than discovering it at hour four.

### 5.1 Resumability

- **Write JSONL, one line per image, flushed after every record.** Never accumulate
  in memory and write at the end.
- **Resume by reading back the completed `image_id`s** and skipping them. The work
  queue is `all_ids - done_ids`, computed at startup.
- **Never overwrite a run file.** A resumed run appends to the same file; a
  re-run with any changed parameter writes a new file with a new `run_id`.
- **Idempotency key** is `(image_id, schema_version, prompt_variant, run_id)`.

**Resumability is only half of it — the process must also restart itself.** A crash
at 02:00 that nobody notices until 09:00 loses seven hours of wall clock even
though it lost no work. Wrap the worker in a supervisor loop:

- **Auto-restart on non-zero exit**, re-deriving the work queue from the output
  file each time. No state is carried across restarts except the JSONL itself.
- **Per-image attempt counter, persisted.** A deterministically-crashing image —
  an OOM that recurs every time, a corrupt file, a decoder bug — will otherwise
  make the supervisor spin on it forever, turning a resumable run into an infinite
  loop that produces nothing. After N attempts (N = 3 is fine), write a row with
  `status = 'failed'` and the exception class, and move on.
- **Count and surface failures.** A run that silently skipped 200 images is not a
  complete run. `failed` must be a queryable status in the output, never an absence
  of rows — the difference between "not attempted" and "attempted and failed" has
  to survive into the warehouse.
- **Bound total restarts** (say 20). Continuous restarting means something
  systemic — a wedged GPU, a full disk — and should stop and alert rather than
  churn.

With this in place, the cost of any single crash is bounded by one image's work
plus process startup, which is exactly why capping-for-safety is unnecessary.

### 5.2 Provenance

Every record carries enough to answer "could I regenerate this?" Provenance lives
**in the rows**, not in a README, because rows outlive READMEs.

| Field | Why |
|---|---|
| `run_id` | UUID per invocation |
| `model_id` | e.g. `Qwen3-VL-30B-A3B` |
| `model_revision` | HF commit hash — **not** the tag |
| `quantization` | e.g. `6bit` |
| `runtime_version` | `mlx-vlm` version string |
| `prompt_variant` | which of the N wordings |
| `prompt_hash` | SHA-256 of the exact prompt text |
| `schema_version` | question-set version |
| `image_sha256` | content hash of the *source* file |
| `resolution_cap` | the long-edge cap applied (§7) |
| `decoded_at` | UTC timestamp |

Reproducibility means: *fixed weights + fixed runtime + fixed prompt + greedy
decoding*. Change any one and it is a new run. That is why all four are columns.

### 5.3 Canary

Pick one image. Re-run it every N items (N ≈ 100) inside the same process, and
diff its output against the first result of the run.

It catches, cheaply, the failure modes that otherwise silently corrupt a long run:
numerical drift under sustained thermal load, a model that got swapped or reloaded,
memory pressure changing behaviour, or non-determinism you failed to detect in
pre-flight. A canary mismatch should **halt the run**, not warn — a run with an
unexplained mid-flight behaviour change is not a usable artifact.

Log every canary result with its index so the divergence point is recoverable.

Pick a canary that is *typical*, not pathological — a middle-of-the-road cover from
a dense embedding cluster. A weird one produces borderline output that flips for
uninteresting reasons.

---

## 6. Embeddings: use, creation, storage, query

### 6.1 What they are useful for

**Not for labeling.** As corpus infrastructure, and they should run **first**,
before the question set is designed.

- **Stratification.** Cluster and look. You will discover the actual distribution
  of artwork in the corpus, which tells you which questions are worth asking, and
  lets the stage-4 validation sample be drawn to reflect the corpus rather than its
  dominant mode.
- **Failure-case retrieval.** When the palette algorithm breaks on a cover,
  nearest-neighbour lookup returns the other N covers like it — turning a
  one-off anomaly into a characterized failure class you can name and count.
- **Near-duplicate detection.** Reissues, regional variants, and deluxe editions
  are common in album corpora and will otherwise leak between your validation
  sample and the rest, inflating apparent agreement.
- **A stored feature.** A deterministic fixed-dimension vector, usable directly as
  an algorithm input or for constructing splits.

### 6.2 Creation

Deterministic given a pinned model. Run at native-ish resolution — the encoder
resizes internally, so the §7 cap is not needed here.

Always **L2-normalize** on write. It makes cosine similarity a plain dot product
and removes a whole class of downstream bugs.

### 6.3 Storage

Two viable shapes:

- **Small and simple:** a single `.npy` array of shape `(7500, D)` plus a parallel
  `image_id` index file. At 7,500 × 1152 float32 this is ~35 MB. Loads instantly,
  brute-force search over the whole corpus is milliseconds. **For this corpus size,
  this is the right answer** — a vector database is unnecessary machinery.
- **In the warehouse:** a `artwork_embeddings` table with the vector as a
  fixed-length float array (DuckDB, or `sqlite-vec` if you want SQL-side ANN).
  Worth it only if you want joins against labels in the same query.

Store `embed_model_id` and `embed_model_revision` alongside — embeddings from
different models are not comparable and will silently produce garbage neighbours if
mixed.

### 6.4 Query

```python
sims = E @ q                      # E is (N, D) L2-normalized, q is (D,)
top = np.argsort(-sims)[:k]
```

Clustering for stratification: k-means over the normalized vectors, or HDBSCAN if
you want the cluster count discovered rather than chosen. Inspect the clusters
visually before trusting them — this is a step where looking at 20 images tells you
more than any metric.

---

## 7. Corpus survey — measured 2026-08-02

An earlier draft of this document devoted this section to resolution capping and
called it "the dominant throughput lever." **A full survey of the corpus showed
that was wrong for this data.** The measurements:

- **7,550 images**, in `{00..14}/` at the repo root. 21 shards, 325–420 files each,
  evenly filled and drawn from the same distribution (safe to sample by shard).
- **100% JPEG.** No PNG, WebP, or GIF.
- **Long edge is bimodal and small:** 300 px (38.6%) and 640 px (60.6%), plus 56
  files at 600 px and one at 567 px. Only 39 distinct dimension pairs exist across
  the whole corpus.
- **Maximum dimension in the entire corpus is 640×640.**
- **99.2% exactly square.** The 63 non-square files are near-square (a few pixels
  shaved off one edge); only 4 are genuinely off-ratio.
- No zero-byte files, no unreadable files, no truncated headers. 0 read errors
  across all 7,550.

**Therefore: 0.00% of images exceed 768 px, and 0.00% exceed 1024 px.** A
downscale-capping stage would save exactly zero pixels. Total corpus volume is
2.157 gigapixels either way. **Do not build a capping stage.**

Approximate Qwen-VL image-token cost at the sizes that actually occur (roughly one
token per 28×28 patch after merging, scaling with area):

| Long edge | Share of corpus | Approx. image tokens |
|---|---|---|
| 300 | 38.6% | ~115 |
| 640 | 60.6% | ~520 |

Corpus-weighted mean: **~360 image tokens per cover** — about a quarter of what the
earlier 1024 px assumption implied. This makes stage 3 substantially cheaper than
originally estimated, and it **reorders the throughput levers** (see §10): decode
length now dominates prefill roughly 2:1, so output size is the lever that matters,
not input size.

### 7.1 The finding that matters more than resolution

Filenames follow a fixed structure: **40 hex characters, comprising a 16-character
rendition prefix followed by a 24-character artwork ID.** The prefix encodes the
rendition size and predicts it perfectly — one prefix value corresponds to the
300 px rendition (n=2,914), another to the 640 px rendition (n=4,631). Both are
renditions produced upstream from the same source image.

So **~39% of the corpus is a low-detail thumbnail rendition.** Consequences:

- **Some questions are unanswerable at 300 px, by anyone.** Small text, label
  logos, and parental-advisory badges may be physically illegible. An oracle
  returning `has_text = false` there is not making an error — it is reporting the
  limit of the available information. Do not count that against the model, and do
  not let it enter the label set as a confident negative.
- **This is a confound.** Any measured difference in oracle agreement or algorithm
  behaviour between the two tiers could be resolution rather than artwork content.
  **Every reliability and agreement metric in §4 must be computed stratified by
  tier.** A single pooled agreement number over this corpus is not interpretable.
- **Therefore `source_resolution_tier` is a required column** on every table
  (see §9), not an optional annotation.
### 7.2 The tiers overlap — 644 artworks are in the corpus twice

Measured, not assumed. Stripping the 16-character rendition prefix leaves a
24-character artwork ID, and comparing the two tiers on that suffix:

| | value |
|---|---|
| Distinct suffixes, 300 px tier | 2,914 (no within-tier duplicates) |
| Distinct suffixes, 640 px tier | 4,631 (no within-tier duplicates) |
| **Suffixes present in both tiers** | **644** |
| as % of the 300 px tier | 22.1% |
| as % of the 640 px tier | 13.9% |
| Files involved in a cross-tier pair | 1,288 → **17.1% of the corpus** |
| **Distinct artworks** | **6,906** (vs 7,550 files) → 8.5% redundancy |

No artwork was fetched twice at the same size; the only redundancy is cross-tier.
Five files carry off-pattern names and are excluded from this comparison.

**Consequences, in order of severity:**

1. **A sample drawn uniformly over files over-represents those 644 artworks 2×**,
   and because the 300 px rendition is a downscale of the same source image, the
   pair will agree almost perfectly. That is exactly the easy case that
   inflates apparent accuracy. **Agreement metrics must be computed over artworks,
   not files.**
2. **The primary key is the artwork, not the file.** `artwork_id` (the 24-char
   suffix) is the join key everywhere; `image_id` (the filename) identifies a
   *rendition of* an artwork. §9 reflects this.
3. **Shard-based splitting does not de-duplicate.** All 644 pairs land in the same
   shard directory, so shard assignment is derived from the artwork ID, not the
   filename. Good news: a shard-based holdout will not leak a pair across the
   split. Bad news: shards cannot be used *to* de-duplicate. Note also that the
   shard is not simply the first two hex characters of the suffix — the sharding
   function is something else and should be pinned down before shard boundaries are
   relied on for grouping.

### 7.3 Use the 644 pairs before discarding them

The duplicates are not only waste. They are a **free controlled experiment on
resolution sensitivity**: 644 matched pairs of the same artwork at 300 px and
640 px, differing in nothing else.

Run both renditions of all 644 pairs through the oracle **first** — 1,288 images,
a couple of hours — and compute per-question agreement between tiers. That directly
answers the §7.1 confound question with real numbers:

- Questions that agree across tiers are resolution-insensitive and safe to run on
  the whole corpus.
- Questions that disagree are **unanswerable at 300 px**, and the 300 px tier
  should be excluded for those questions specifically — recorded as `null` with a
  `below_resolution` marker, never as a confident negative.

Only after that: **de-duplicate on `artwork_id`, keeping the 640 px rendition**, and
run the main pass over the resulting **6,906 artworks**.

Note that §7.4 supersedes this as the *primary* resolution-sensitivity instrument —
these 644 pairs give a 2-point comparison, and the second collection gives a proper
multi-point curve. The pairs remain valuable for a different job: validating that
the curve measured on the other collection transfers to this one.

---

## 7.4 Second collection: `music-artworks/`

Surveyed because the sharded corpus has effectively no resolution range, which
makes any resolution-dependent result impossible to separate from artwork content.

**Scale and structure.** 8,595 files, **4,088 distinct artworks**. Directories are a
pure hash fan-out (`a/7/c/` = first three characters of the filename), three levels
deep, carrying **no content, source, or date signal**. Filenames are
`<32-hex>[_WxH].<ext>` — a 32-character opaque ID with an optional rendition
suffix. 2,740 artworks have one rendition; the rest have 2–12.

**Formats:** AVIF 4,507, JPEG 3,108, PNG 980. No non-image, zero-byte, or
unreadable files.

**Resolution — genuine diversity.** 358 distinct dimension pairs (vs 39 in the
sharded corpus). Taking the best rendition per artwork (n=4,088):

| p50 | p75 | max | >640 | >768 | >1024 | >1500 |
|---|---|---|---|---|---|---|
| 700 | 1,000 | 3,600 | 55.8% (2,280) | 30.9% (1,265) | 4.9% (201) | 52 |

So ~2,280 artworks exceed the sharded corpus's hard 640 px ceiling. **The high end
is thin** — adequate for a 640-vs-1024 contrast, too sparse to conclude anything
above ~1500.

**It is not a higher-resolution mirror of the sharded corpus.** The two use
different, unrelated ID schemes; substring-matching all 6,901 sharded artwork IDs
against every filename and path here returns **zero hits**. Treat them as two
independent collections. The tempting shortcut — swap the 300 px items for
higher-res versions from here and delete the confound — **is not available** by
filename. It would require content-based matching (see §12).

### 7.4.1 Three operational traps

1. **Filenames lie about resolution.** The `_WxH` suffix is a *requested* size, not
   the stored one. **719 AVIF files** disagree with their own header —
   `..._1082x1082.avif` contains 640×640; `..._3600x3600.avif` contains 700×700.
   The upstream CDN did not upscale beyond source. **Always read dimensions from
   the header.** Any filename-derived resolution filter would badly overstate
   what is available.
2. **The un-suffixed file is not always the largest.** 291 artworks have a
   rendition bigger than their extension-less "original". Select the best rendition
   by measured dimensions, never by name.
3. **AVIF decode is a dependency.** Over half the files are AVIF, which needs
   `pillow-avif-plugin` or a libavif-backed loader. Mostly these are the small
   derived thumbnails (AVIF median 333, only 5.8% above 640), so best-per-artwork
   selection will skew toward JPEG/PNG — but the loader must handle AVIF to make
   that selection at all.

### 7.4.2 Filtering to album artwork

The collection is **not** all album art. Directory names and filenames carry no
signal, so **aspect ratio is the only usable discriminator** — and it works,
because the non-artwork content sits at rigid template dimensions:

| class | files | typical |
|---|---|---|
| wide banner ~2.58:1 | 335 | 400×155, 800×310 |
| 16:9 hero | 309 | 1000×562 |
| ultrawide ≥4:1 | 239 | 1000×185 |
| other landscape / portrait | 144 | mixed |

These are artist header banners, hero images, and site furniture. Four dimension
values alone account for 867 files.

**Rule: keep artworks whose best rendition satisfies `|w/h − 1| ≤ 0.05`.** That
yields **3,097 album-artwork candidates**; 1,119 artworks have no square rendition
at all and are safely discarded. The tolerance matters — a strict `w == h` test
drops ~208 legitimately slightly-cropped covers.

Also filter the small tail: 1,459 files at ≤150 px (dominated by 147×147 AVIF) are
derived thumbnails, not sources.

### 7.4.3 What this collection is actually for

**Not** as the primary oracle corpus — the sharded set is larger and purer album
art. Its value is that **1,348 artworks carry multiple renditions of the same
image at different sizes**, which is a *resolution ladder*: the same controlled
experiment as the 644 sharded pairs, but multi-point instead of two-point.

That supports the question §7.1 actually needs answered — not "do 300 and 640
agree?" but **"at what resolution does each question become unanswerable?"** —
as a curve rather than a single contrast.

The design that follows:

1. **Measure the curve here.** Run the oracle over every rendition of the
   multi-rendition artworks and compute, per question, agreement against the
   largest rendition as a function of size.
2. **Validate the transfer on the 644 sharded pairs** (§7.3). The two collections
   are different distributions, so a curve measured on one is an *estimate* for the
   other. If the curve predicts the observed 300-vs-640 agreement on the sharded
   pairs, the transfer holds and the curve can be trusted corpus-wide. If it does
   not, fall back to the in-distribution 2-point measurement.
3. **Apply the result** to decide, per question, whether the 300 px tier is usable
   or must be recorded `below_resolution`.

This is the honest ordering: the better instrument is out-of-distribution, so it
gets validated against the worse one rather than trusted outright.

## 7.5 Capping vs normalizing — two different decisions

An earlier draft conflated these. They are unrelated and resolve differently.

### Capping for speed: no. Not worth doing.

The tail is too small to matter. In `music-artworks/`, 201 artworks exceed 1024 px
(~52 above 1500, ~20 above 2400). Running them at native size rather than capped
costs roughly **375k extra prefill tokens ≈ 15 minutes** at 300–600 tok/s. The
pathological upper bound — pretending all 201 were 3600×3600 — is ~2 hours, and
they are not. Against a run measured in tens of hours this is noise.

In the sharded corpus it is a strict no-op: nothing exceeds 640 px (§7).

**Do not build a capping stage for performance reasons in either collection.**

A 3600×3600 image is ~16,500 tokens and spikes peak memory during vision encoding.
This should be fine alongside a 25 GB resident model on 96 GB. **If the run is
resumable and supervised as specified in §5, an OOM costs a restart — seconds of
work, not hours** — so it is not by itself an argument for capping.

Still worth a 30-second smoke test on the largest handful before starting, for a
narrower reason: if the biggest images *deterministically* fail to fit, you want to
know that now and cap for **memory** reasons, rather than discover it as 201
`failed` rows at the end. That is the only circumstance under which capping is
justified, and the smoke test is what decides it.

### Normalizing for comparability: yes, but only for label production

Different problem. If the label pass sees some artworks at 640 px and others at
3600 px, **every cross-artwork comparison is confounded by resolution** — which is
the exact defect §7.1–7.4 exist to remove. Fixing it in one collection while
reintroducing it in the other is not progress.

Split by purpose:

| Pass | Resolution policy | Why |
|---|---|---|
| **Ladder experiment** (§7.4.3) | Native, deliberately varied | Resolution *is* the independent variable |
| **Label production** | Fixed, identical for every image | Labels must mean the same thing across artworks |
| **Transfer check** (§7.3) | Native — 300 and 640 as found | Reproduces the in-distribution contrast |

For label production, **normalize to 640 px long edge**. The sharded corpus is
hard-capped there, so 640 is the only value at which labels from the two
collections are comparable. Downscaling `music-artworks/` discards its resolution
advantage — acceptable, because that advantage is spent in the ladder experiment,
not here.

Record both sizes on every row: `source_long_edge_px` (as stored) and
`processed_long_edge_px` (what the model actually saw). Without the second, a
future reader cannot tell a normalized run from a native one.

---

## 8. What to ask

> **These are examples.** The actual question set must be decided once the goal is
> precisely specified — specifically, once we know which decisions the palette
> algorithm needs the answers for. A question that does not change an algorithmic
> decision or an evaluation metric should not be in the set. Treat the list below
> as a demonstration of *shape*, not a specification.

### 8.1 Design rules (these are not examples — these should hold regardless)

1. **Ask what the algorithm must decide, not what the image "is."** "What is the
   subject" has no ground truth. "Is there a region where light text would fail"
   does.
2. **Closed vocabularies only.** Boolean or enum from a fixed set. This is what
   makes the warehouse constraints real and the human validation fast.
3. **Every question answerable by a human in under five seconds.** If a reviewer
   must deliberate, the question cannot be validated at sample scale, and an
   unvalidatable question is not worth asking.
4. **Separate description from judgment.** "Is there text" and "should text drive
   the accent colour" have very different reliability. Mixing them in one field
   hides that.
5. **Never ask for a number the pipeline can compute.** No hex, no ratios, no
   pixel areas.

### 8.2 Example question set

**Medium and character** — expect high reliability
- `medium`: `photograph | illustration | render_3d | typography_only | collage | abstract`
- `color_character`: `monochrome | duotone | limited_palette | full_spectrum`

**Text** — high reliability; SAM supplies location, this supplies meaning
- `has_text`: bool
- `text_roles`: multi-select of `{integrated_artwork, overlay_title, badge_or_sticker, label_logo}`
- `text_is_dominant_element`: bool

**Structure** — expect *low* reliability; these are the genuinely hard cases
- `background_structure`: `single_flat | single_graded | two_or_more_fields | photographic_scene | none_discernible`
- `has_dominant_subject`: bool
- `subject_area_band`: `under_25 | pct_25_60 | over_60`

**Palette decisions** — the actual target variables
- `light_text_safe`: `yes | no | only_some_regions`
- `dark_text_safe`: `yes | no | only_some_regions`
- `has_accent_color`: bool — is there one colour that reads as *this cover's* colour

**Meta** — on every record
- `confidence`: `high | medium | low`
- `ambiguity_note`: short free text, **human audit only, never read by code**

### 8.3 The SAM caveat that shapes the structure questions

SAM 3 segments **things** (objects, instances), not **stuff** (backgrounds,
gradients, colour fields). Much of what a UI palette cares about is stuff. SAM will
handle `text`, `logo`, `person`, `sticker` well and will do nothing useful for
"the background gradient region."

Two ways to work with this rather than around it:

- **Use SAM subtractively.** Everything *not* covered by an instance mask is field.
  Run colorimetry on that residual. You get ground/field separation out of a model
  that never reasoned about it.
- **Union multiple prompt phrasings.** SAM 3's documented weakness is low recall —
  it often misses the target entirely, producing zero-IoU predictions. Running
  `text` / `lettering` / `typography` / `logo` as separate passes and unioning the
  masks costs nothing locally and materially reduces the holes.

Also known: SAM 3 segments *all* instances of a category and ignores instance-level
spatial constraints in the prompt. "The figure on the left" returns all figures.
Do not write prompts that depend on spatial disambiguation.

**Depth models were considered and rejected.** Monocular depth estimation is
trained on photographs of 3-D scenes. Much of this corpus is flat — typography,
vector illustration, abstract pattern — and on those a depth model returns
confident, plausible garbage rather than a null. Trusting it would require knowing
photo-vs-flat first, at which point the VLM answers the structural question
directly and more reliably.

---

## 9. Warehouse

### 9.1 Principles

- **`artwork_id` is the identity; `image_id` is a rendition of it.** The 24-char
  artwork suffix is the join key and the unit of every metric. The filename
  identifies which rendition produced a given row. 644 artworks have two
  renditions (§7.2) — any aggregate that groups by `image_id` is wrong.
- **One row per (image, schema_version, prompt_variant).** Never mutate; append.
- **Enums are enforced**, not merely intended. An out-of-vocabulary value must be a
  load error, not silent corruption.
- **Store the raw model JSON alongside the parsed row.** If the schema changes
  later, re-parse instead of re-running inference. On a multi-hour local run this
  is the difference between a five-minute fix and another overnight session. This
  single decision is the cheapest future-proofing available.
- **Free text is quarantined.** One column, documented as human-only.

DuckDB is the natural fit here: single file, real types and constraints, reads
Parquet and JSONL directly, no server, and it sits next to the repo the way the
existing `research/data/*.json` artifacts do.

### 9.2 Tables

```sql
CREATE TYPE medium_t AS ENUM (
  'photograph','illustration','render_3d','typography_only','collage','abstract');
CREATE TYPE bg_structure_t AS ENUM (
  'single_flat','single_graded','two_or_more_fields','photographic_scene',
  'none_discernible');
CREATE TYPE tri_safe_t AS ENUM ('yes','no','only_some_regions');
CREATE TYPE confidence_t AS ENUM ('high','medium','low');

-- Raw, immutable. Written by the run. Never edited.
CREATE TABLE oracle_raw (
  collection        TEXT    NOT NULL,     -- 'sharded' | 'music_artworks'
  image_id          TEXT    NOT NULL,     -- filename: a rendition
  artwork_id        TEXT    NOT NULL,     -- identity within collection; join on this
  source_long_edge_px    INTEGER NOT NULL, -- from the HEADER, never the filename
  processed_long_edge_px INTEGER NOT NULL, -- what the model actually saw (§7.5)
  run_id            TEXT    NOT NULL,
  schema_version    TEXT    NOT NULL,
  prompt_variant    TEXT    NOT NULL,
  model_id          TEXT    NOT NULL,
  model_revision    TEXT    NOT NULL,
  quantization      TEXT    NOT NULL,
  runtime_version   TEXT    NOT NULL,
  prompt_hash       TEXT    NOT NULL,
  image_sha256      TEXT    NOT NULL,
  resolution_cap    INTEGER NOT NULL,
  decoded_at        TIMESTAMP NOT NULL,
  raw_json          JSON    NOT NULL,        -- verbatim model output
  PRIMARY KEY (image_id, run_id, prompt_variant)
);

-- Parsed and typed. Derived from oracle_raw; regenerable without inference.
CREATE TABLE artwork_labels (
  collection          TEXT NOT NULL,      -- ID schemes differ per collection
  artwork_id          TEXT NOT NULL,      -- identity; PK with collection
  image_id            TEXT NOT NULL,      -- which rendition produced this row
  source_long_edge_px    INTEGER NOT NULL,
  processed_long_edge_px INTEGER NOT NULL,
  schema_version      TEXT NOT NULL,
  medium              medium_t,
  color_character     TEXT,
  has_text            BOOLEAN,
  text_is_dominant    BOOLEAN,
  background_structure bg_structure_t,
  has_dominant_subject BOOLEAN,
  subject_area_band   TEXT,
  light_text_safe     tri_safe_t,
  dark_text_safe      tri_safe_t,
  has_accent_color    BOOLEAN,
  confidence          confidence_t,
  agreement_n         INTEGER NOT NULL,      -- variants that agreed
  agreement_total     INTEGER NOT NULL,
  adjudicated         BOOLEAN NOT NULL,
  reliability         TEXT,                  -- from §4 validation, per question set
  below_resolution    BOOLEAN NOT NULL,      -- §7.4.3: unanswerable at this size
  ambiguity_note      TEXT,                  -- HUMAN AUDIT ONLY — never read by code
  PRIMARY KEY (collection, artwork_id, schema_version)
);

-- Multi-select fields normalized out.
CREATE TABLE artwork_text_roles (
  image_id       TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  role           TEXT NOT NULL,   -- integrated_artwork | overlay_title | badge_or_sticker | label_logo
  PRIMARY KEY (image_id, schema_version, role)
);

-- SAM output.
CREATE TABLE artwork_regions (
  image_id       TEXT NOT NULL,
  run_id         TEXT NOT NULL,
  concept        TEXT NOT NULL,
  instance_idx   INTEGER NOT NULL,
  bbox_x         REAL, bbox_y REAL, bbox_w REAL, bbox_h REAL,  -- normalized 0..1
  area_fraction  REAL NOT NULL,
  score          REAL NOT NULL,
  mask_rle       TEXT,
  PRIMARY KEY (image_id, run_id, concept, instance_idx)
);

CREATE TABLE artwork_embeddings (
  image_id             TEXT NOT NULL,
  embed_model_id       TEXT NOT NULL,
  embed_model_revision TEXT NOT NULL,
  vector               FLOAT[1152] NOT NULL,   -- L2-normalized on write
  PRIMARY KEY (image_id, embed_model_id)
);

-- Human labels from §4. Same vocabularies. The measuring instrument.
CREATE TABLE human_labels (
  image_id       TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  reviewer       TEXT NOT NULL,
  -- same columns as artwork_labels
  labelled_at    TIMESTAMP NOT NULL,
  PRIMARY KEY (image_id, schema_version, reviewer)
);
```

`artwork_labels` is a **derived** table. It can be dropped and rebuilt from
`oracle_raw` at any time. That is the whole point of keeping the raw JSON.

### 9.3 Does this need an LLM downstream?

**No.** That is the design target and it is achievable. The pipeline converts
pixels into typed rows exactly once; everything after is SQL and pandas.

What makes it hold:

- **Constrained decoding**, not "please return JSON". Grammar- or schema-constrained
  generation makes malformed output structurally impossible rather than merely
  unlikely. **Confirm what MLX-VLM exposes here** — if constrained decoding is not
  well supported on that path, the fallback is validate-against-schema-and-retry,
  which is nearly as good but needs a retry cap and a `parse_failed` marker so
  failures are counted rather than silently dropped.
- **Closed enums** → real `CHECK`/enum constraints → load-time errors.
- **Greedy decoding + pinned weights** → byte-identical reruns.

---

## 10. Estimated duration for 7,550 images

**These are estimates from architecture and token arithmetic, not measurements.**
Do not plan around them. Benchmark 50 images first — stratified across both
resolution tiers — and substitute real per-image timings. The numbers below exist
to show which decisions dominate, not to predict a completion time.

Assumptions, now grounded in the §7 survey: **no capping stage** (nothing to cap),
corpus-weighted mean of **~360 image tokens**, ~400 tokens of rubric, ~150–250
output tokens with terse enum keys.

Counts are **6,906 artworks**, not 7,550 files — de-duplicated on `artwork_id` per
§7.2, keeping the 640 px rendition.

| Stage | Per image | × count | Wall clock |
|---|---|---|---|
| 0 — prep, hash, dedupe | ~0.02 s | 7,550 | ~3 min |
| 1 — embeddings | ~0.05–0.1 s | 6,906 | ~10 min |
| 2 — SAM 3.1, 4 concept prompts | ~1–2 s total | 6,906 | ~2–4 h |
| **2.5a — resolution ladder** (§7.4.3), multi-rendition artworks | ~4–9 s | ~3,500 | **~4–9 h** |
| **2.5b — transfer check** on the 644 sharded pairs (§7.3) | ~4–9 s | 1,288 | **~1.5–3 h** |
| 3 — Qwen 30B-A3B, variant A | ~4–9 s | 6,906 | **~8–17 h** |
| 3 — Qwen 30B-A3B, variant B | ~4–9 s | 6,906 | **~8–17 h** |
| 4 — Qwen 32B dense, disputed ~15% | ~15–25 s | ~1,035 | ~4–7 h |
| **Total** | | | **~24–48 h** |

So: **one to two days of wall clock**, spread over overnight sessions. Faster than
the pre-survey estimate because the images are far smaller than assumed, but the
range is wide and only measurement will narrow it. §5 remains non-optional.

Stage 2.5 pays for itself: it costs ~2 hours and either licenses the 300 px tier
for a given question or excludes it, which is otherwise an unquantified confound
running through every downstream number.

**Levers, in order of impact — reordered after the survey:**

1. **Output length.** Now the dominant cost: with ~360 image tokens in and ~200
   out, decode exceeds prefill by roughly 2:1. Terse enum keys, short field names,
   and no per-field justification. Put `ambiguity_note` behind a
   `confidence != high` condition so most records never generate it. This is where
   the run time is.
2. **One bulk variant + targeted second pass.** Run variant A over everything, then
   variant B only where `confidence != high`. Cuts stage 3 substantially at the
   cost of a weaker disagreement signal on high-confidence items — an acceptable
   trade, since those are the items least likely to be wrong.
3. **Qwen3-VL-8B for the bulk pass.** Several times faster. Worth testing on the
   §4 validation sample before committing; if 8B agreement tracks 30B-A3B closely,
   this roughly halves the total.
4. **Prompt prefix caching.** The rubric is byte-identical across all 7,550 calls
   and is now *larger than the average image* (~400 vs ~360 tokens). If MLX-VLM
   exposes KV-cache reuse for a fixed prefix, this removes more than half the
   prefill. Materially more valuable than it was under the old assumptions — check
   this early.
5. ~~Resolution cap.~~ **Deleted as a performance measure** — a strict no-op on the
   sharded corpus, and worth only ~15 minutes on `music-artworks/`. Normalization
   to a fixed 640 px is still required for label production, but for
   *comparability*, not speed. See §7.5.

Thermals: a sustained multi-hour run on a laptop will throttle to roughly 60–70% of
burst throughput. The estimates above are intended to be sustained-rate, but this
is exactly the kind of assumption the 50-image benchmark should be run long enough
to expose — a 5-minute benchmark measures burst, not sustained.

---

## 11. Pre-flight checklist

Before committing to a multi-day run:

- [ ] Run the oracle against the **existing human panel data** first. Cheapest
      possible test of whether the whole premise holds.
- [ ] Verify determinism: same image twice → identical bytes. Then inside a batch
      of 8 → still identical. If not, force batch size 1 or move to the dense model.
- [ ] Verify SAM 3.1 actually runs on this machine via the MLX port, on 10 images.
- [ ] Benchmark 50 stratified images end-to-end, running long enough to reach
      thermal steady state. Replace §10 with measurements.
- [ ] Confirm constrained decoding works, or implement retry-with-cap and a
      `parse_failed` counter.
- [ ] Freeze the question set and `schema_version`. Changing it mid-run invalidates
      the run.
- [ ] Confirm resume works: kill the process at image 100, restart, verify it
      resumes at 101 and the output file is intact.
- [ ] Confirm the supervisor works: `kill -9` the worker mid-image and verify it
      restarts unattended and re-derives its queue.
- [ ] Confirm poison-pill handling: feed a deliberately unprocessable file, verify
      it is retried N times, marked `failed`, and **not** retried forever.
- [ ] Smoke-test the largest few images (§7.5). If they OOM deterministically, cap
      for memory — the only valid reason to cap.
- [ ] Pick and record the canary image.

---

## 12. Open questions

- **What decisions does the palette algorithm actually need these answers for?**
  Until this is specified, the question set in §8 is a placeholder. This is the
  blocking question for the whole design.
- ~~Do the two resolution tiers share trailing artwork IDs?~~ **Resolved
  2026-08-02: yes.** 644 artworks appear in both tiers. See §7.2–7.3.
- **What is the near-duplicate rate beyond the exact-ID pairs?** Reissues, regional
  variants, and deluxe editions are distinct artwork IDs with near-identical
  pixels, and will leak between validation sample and corpus regardless. Stage 1
  embeddings answer this cheaply; do it before sampling.
- **Are the 300 px-only items worth including?** 2,270 artworks exist only at
  300 px (2,914 minus the 644 that also have a 640 px rendition). If stage 2.5
  shows a material share of the question set is unanswerable at that resolution,
  a 4,631-artwork corpus of 640 px renditions may be a better instrument than a
  6,906-artwork corpus carrying a known per-question blind spot. Stage 2.5 makes
  this a decision with numbers behind it rather than a judgment call.
- **What is the sharding function?** All 644 pairs share a shard, so shards are
  keyed on `artwork_id` — but not on its first two hex characters. Worth pinning
  down before shard boundaries are used for grouping or holdout splits.
- **Do the two collections overlap in content?** Filenames say no (§7.4), but the
  ID schemes are unrelated hashes, so filename evidence is uninformative about
  content. If a meaningful share of the sharded corpus also appears in
  `music-artworks/` at higher resolution, the 300 px confound could be *removed*
  rather than measured around. Answering it requires perceptual matching — which
  the stage-1 embeddings make nearly free, since both collections will be embedded
  anyway. **Check this once stage 1 has run over both.** It is the one path to
  eliminating rather than characterizing the largest known corpus defect.
- **Should the oracle run over both collections?** The sharded set is larger and
  purer; `music-artworks/` adds ~3,097 album artworks with real resolution range
  and unknown content overlap. Running both roughly doubles stage 3. Defer until
  the content-overlap question above is answered — if overlap is high, the second
  collection adds resolution range rather than new artworks, and should be used as
  an instrument (§7.4.3) rather than as additional corpus.
- **Does 8B suffice?** If yes, run duration drops by more than half. Testable on
  the validation sample for a few hours of work.

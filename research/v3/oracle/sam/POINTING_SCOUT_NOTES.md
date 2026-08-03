# Pointing models and SAM point prompts — feasibility scout

**For:** the reviewer and the orchestrator. **Date:** 2026-08-03. **Status:** paper only.
**No GPU was used, no model was downloaded, nothing was loaded.** Every claim below is either
read out of source already on this disk, or read out of the HuggingFace metadata API.

**See also `GROUND_ROUTES.md`** (sibling, same date) — scouts the **depth** route the reviewer added
on 2026-08-03, and gives the recommended **try-order across all four** ground-isolation routes.
Short version of the ordering it argues for: the SAM point-prompt gate first (2 min, 0 GB), then
read the already-running noun-elicitation runs, then **Qwen3-VL before MolmoPoint** — because both
feed the same new SAM adapter and Qwen3-VL needs no download — then depth.

**Why this exists.** The reviewer asked:

> "isn't there a model that is particularly good at pointing? I think it was in our list at some
> point but we never tried it, because it was specialised in pointing."

And the motivating move: `GROUND_FREETEXT_SYNTHESIS.md` concludes that the surviving human question
about ground is **not** "what kind of ground is this" but **"which pixels are ground"** — a pointing
question. SAM's native prompt modes include point prompts, which this campaign has never used.
Pointing model → points on the ground → SAM point-prompt segmentation → a background mask directly.

---

## The one-page answer

| | |
|---|---|
| Was a pointing model ever on our written list? | **No** — zero hits in the tree and in all 508 commits. It was never proposed and never rejected. But its absence closed three doors that are still shut (§1). |
| Does a pointing specialist exist on our stack? | **Yes, and better than expected.** `mlx-vlm 0.6.8` — the version already installed and pinned — ships a dedicated `molmo_point` model module. |
| Are there MLX weights? | **Yes.** `mlx-community/MolmoPoint-8B` in 8 quantizations, uploaded 2026-03-21, Apache-2.0. Current Point-Bench SOTA at 70.7 — with caveats (§2.5). |
| Does mlx-vlm's SAM 3.1 support point prompts? | **The weights do; the code path does not.** All 145 interactive tensors are present in the snapshot we already have. Nothing calls them. |
| Is adding them plumbing or missing weights? | **Plumbing.** ~80–150 lines, in our own code, no mlx-vlm patch, no download. |
| Probe cost | **one 9–11 GB download + ~15–20 min of GPU slot.** |
| Biggest single risk | a coordinate-convention ambiguity in untested MLX code — see §3.4. It is cheap to settle and it must be settled first. |

---

## 1. Provenance — was it on our list?

**It was never on the written list.** Not in the working tree, and not in the history.

**[MEASURED]** 2026-08-03, across all file types, excluding `node_modules` and `.claude/worktrees/`:

- `molmo`, `pixmo`, `allenai`, `allen ai`, `ai2` — **zero hits** in the working tree; **zero hits**
  under `git grep HEAD`; **zero commits** matching under `git log --all -i --grep` (508 commits).
- `florence`, `kosmos`, `cogvlm`, `llava`, `paligemma`, `owlv2`, `owl-vit`, `groundingdino`,
  `seem`, `xdecoder`, `clipseg` — zero hits in `research/`.
- `visual grounding`, `referring expression`, `keypoint`, `point prompt`, `point_prompt`,
  `positive point`, `negative point`, `box prompt`, `geometric prompt`, `click prompt`,
  `mask prompt` — **zero hits anywhere.**
- The words "pointing"/"points" occur ~90 times in `research/v3` and are **always** percentage
  points, "points at" (a symlink or reference), or `SweepPoint` in the mask-quality sweep code.
  Not one instance refers to a model capability.

**The candidate lists that do exist, and what is on them.** The repo has a rich model-selection
record; a pointing model is on none of it:

| List | Members | Where |
|---|---|---|
| VLM candidates (the "are we using the best models" answer) | Qwen3-32B-dense, Gemma-3-27B, InternVL3.5, GLM-4.5V — **all four enumerated** | `reviews/phase-0-adversarial/unrealized-ideas.md:289-307` |
| VLM bake-off arms (registered, pinned) | `Qwen3-VL-30B-A3B-6bit`, `Qwen3-VL-32B-8bit`, `gemma-3-27b-it-8bit`, `InternVL3_5-30B-A3B-4bit` (blocked) | `oracle/bakeoff/README.md:60-63` |
| Embedding arms | siglip2-so400m, dinov2-vitl14 (winner), dinov2-vitl14-392, pe-core-l14, dinov3-vitl16, dinov3-vith16plus | `oracle/embeddings/config.py:155-160` |
| Pipeline roster | SigLIP/CLIP, SAM 3.1, Qwen3-VL 30B, Qwen3-VL 32B | `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:66-73` |

The pipeline doc has **no** "candidate models" or "models considered" section in its 996 lines. The
only model *class* it explicitly rejects is monocular depth (lines 717-722). Nothing pointing-shaped
was ever proposed and turned down.

**Three places where the gap is visible in the doc, and this is the part worth the reviewer's
attention.** The absence is not a clerical oversight — it is load-bearing in three separate
decisions, each of which reads differently once you know a pointing model was available:

1. **Spatial disambiguation was declared impossible and designed around.**
   `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:696-716`:

   > "SAM 3 segments *all* instances of a category and ignores instance-level spatial constraints
   > in the prompt. 'The figure on the left' returns all figures. **Do not write prompts that
   > depend on spatial disambiguation.**"

   True of *text* prompts. Not true of the model, which has point prompts (§3.3). The rule that
   came out of this is a rule about one prompt mode, written as though it were a rule about SAM.

2. **The salience question was attacked with ten more text phrasings and then abandoned.**
   `data/sam/SAM_DESIGN_NOTES.md:70-111` — "The attributive-colour family is dead", "The
   salience-noun family is mostly dead too", and on one image "every one of the ten phrasings
   returns nothing." The conclusion drawn was that the capability does not exist. Supplying a
   coordinate from elsewhere is never raised as the alternative.

3. **The VLM→SAM handoff was architected as noun-passing only.**
   `ORACLE_QUESTION_SET.md:645`:

   > "**SAM masks nouns it is given. The VLM is the thing that knows which noun to give it.**"

   Coordinates are never contemplated as the thing passed across that seam.

**The nearest the repo comes to the idea** is `ORACLE_QUESTION_SET.md:370` — and it is an
instruction to a *human*, not a model: *"Can you point to two or more separate areas of the
background, each with its own colour?"* We have been asking the reviewer to point for some time.

**How to read the reviewer's memory.** The recollection "it was in our list at some point" does not
match any list in this repo. It is most likely a memory from outside it — Molmo's entire public
identity when the 0924 family shipped was pointing. **The instinct is right even though the
provenance is not ours, and that is the better outcome:** there is no prior rejection to
re-litigate, no earlier reasoning to recover, and no argument on record against trying it. The
option was never rejected. It was never seen.

---

## 2. Availability on this stack

### 2.1 The decisive fact: mlx-vlm already supports it

`mlx-vlm 0.6.8` — **the version already installed** in `research/v3/oracle/sam/.venv`, and the
version `config.py` pins as `RUNTIME_VERSION_PIN` because it is the only one carrying
`mlx_vlm.models.sam3_1` — also ships three Molmo modules:

```
mlx_vlm/models/molmo/          # Molmo 0924 family
mlx_vlm/models/molmo2/         # Molmo 2
mlx_vlm/models/molmo_point/    # MolmoPoint — the pointing specialist
```

`molmo_point/` is 2,254 lines across 8 files, including a purpose-built
`point_utils.py`. **This is not a generic VLM with a grounding prompt bolted on — it is a
distinct architecture with point prediction in the model config** (`patch_location`,
`no_more_points_class`, `patch_embed_dim`, dedicated `patch_token_id` / `subpatch_token_id` /
`location_token_id` special tokens).

**[MEASURED]** `ls .venv/lib/python3.14/site-packages/mlx_vlm/models/`, 2026-08-03.

An MLX weight conversion without a matching `mlx_vlm.models.*` implementation is useless. Here we
have both. That is the whole reason this route is cheap.

### 2.2 MLX weights on HuggingFace

**[MEASURED]** HF metadata API, 2026-08-03. Sizes are the sum of the actual files in the repo.

| Repo | Revision (sha) | Uploaded | Download |
|---|---|---|---|
| `mlx-community/MolmoPoint-8B-4bit` | `9bab196f867c` | 2026-03-21 | **7.24 GB** |
| `mlx-community/MolmoPoint-8B-6bit` | `52b27064f2f2` | 2026-03-21 | **9.01 GB** |
| `mlx-community/MolmoPoint-8B-8bit` | `e295e68b2ee5` | 2026-03-21 | **10.77 GB** |
| `mlx-community/MolmoPoint-8B-fp16` | `0a60033b4e48` | 2026-03-21 | **17.38 GB** |

Also present and not recommended for this probe: `-5bit`, `-mxfp4`, `-mxfp8`, `-nvfp4`.

Upstream originals: `allenai/MolmoPoint-8B` (the one we want), `allenai/MolmoPoint-GUI-8B` (GUI
screenshots — wrong domain), `allenai/MolmoPoint-Vid-4B` (video). The `Molmo2-8B` family also has
MLX conversions, but `MolmoPoint` is the pointing-specialised sibling and is the right pick.

Note the 4-bit repo is 7.24 GB, not the ~4.5 GB a naive 8B×4bit estimate suggests — the vision
tower and the enlarged embedding table (152k+ vocab, including the point tokens) are not quantized
down as far. Do not budget from the parameter count; budget from the table above.

**Recommendation: `-8bit` (10.77 GB) for the first probe.** Not because 6-bit will not work, but
because the probe's purpose is to decide whether *pointing at album-cover grounds* works at all. If
it fails at 6-bit we cannot tell whether the model or the quantization failed, and we would run it
again at 8-bit anyway. Buy the attributable answer once. If 8-bit points land well, re-test at
4-bit as a **cost** question, separately — that is a different experiment with a different purpose.

Licence: **Apache-2.0** (`allenai/MolmoPoint-8B`). No licensing decision needed.

### 2.3 A version trap, and why it does not bite us

`config.py` pins `RUNTIME_VERSION_PIN = "0.6.8"` for SAM. Three things are true of that version and
they need to be recorded together, because two of them look alarming in isolation:

- **Original Molmo-7B-D (0924) is broken on 0.6.8** — unusable output; the bug mis-indexed the image
  feature scatter (allocating a ~15 GB tensor) and skipped the chat template. Fixed by PR #1783,
  merged **2026-08-03 19:29Z**, released in **0.6.9 five minutes later**.
- **MolmoPoint on 0.6.8 is fine.** Its load-error fix landed in 0.6.0 and its EOS-config fix
  (PR #1500) in 0.6.4. Both are behind us.
- **Molmo2 on 0.6.8 is fine.** Its float16 vision-tower overflow (all-NaN logits, output of nothing
  but `!` characters) was fixed in 0.6.0.

**Consequence: we do not need to touch the pin.** The one Molmo variant broken on our pinned version
is the one we are not proposing to use. If someone later reaches for original Molmo-7B-D and gets
garbage, this is why — and the fix is 0.6.9, which must then be re-checked against `sam3_1` before
the pin moves. Do not upgrade mlx-vlm for Molmo's sake; MolmoPoint does not need it.

### 2.4 Machine headroom

**[MEASURED]** 2026-08-03. 103 GB unified memory; MolmoPoint-8B at 8-bit (~11 GB) and SAM 3.1
bf16 (3.49 GB) can be **co-resident with room to spare** — the pointing pass and the segmentation
pass do not need to be separate processes, which removes a whole class of hand-off plumbing.

Disk: 114 GB free, but the volume is **88% full**. An 11 GB download is fine; it is worth saying
out loud before a habit of pulling fp16 variants forms.

### 2.5 How good is it at pointing? — what we can and cannot claim

**What we can claim, from source on this disk:** MolmoPoint is *architecturally* a pointing model,
not a general VLM with a pointing prompt. The evidence is in the config and the token vocabulary,
not in a benchmark table:

- Dedicated special tokens `patch_token_id`, `subpatch_token_id`, `location_token_id` (151947-9).
- A `3x3` sub-patch localization head (`patch_location`), i.e. spatial resolution finer than the
  ViT patch grid — a design choice that only makes sense if coordinates are the output.
- `no_more_points_class` — a first-class "stop / nothing more to point at" class.
- A separate `point_utils.py` decoding pipeline with no analogue for any other model in mlx-vlm.

Bolting pointing onto a chat VLM does not produce any of that. **This is a stronger warrant than a
published score would be**, because it tells us the capability is in the model's output
representation rather than in its prompt-following.

**Published numbers, with their provenance attached.** Sourced 2026-08-03 from the MolmoPoint paper
(arXiv 2603.28069, Point-Bench Table 1) — **[INHERITED]**, i.e. someone else's measurement on
someone else's data, never ours:

| Model | Point-Bench avg |
|---|---|
| Human | 89.1 |
| **MolmoPoint-8B** | **70.7** |
| Molmo2-8B | 68.7 |
| Gemini-Robotics-ER-1.5 | 67.1 |
| Molmo-72B | 63.8 |
| Gemini-2.5-Pro | 62.8 |
| Qwen2.5-VL-32B/72B | 59.0 |
| **Qwen3-VL** | **58.5** |

PixMo-Points F1: MolmoPoint-8B **89.2**, Molmo2-8B 85.2, Molmo-7B-D 75.7.

**Three caveats that must travel with those numbers, or they should not be quoted at all:**

1. **Point-Bench is not independent of Ai2.** It comes from PointArena (arXiv 2505.09990), authored
   by UW **and Ai2** — Ai2 co-authored the benchmark its own model tops. Treat the 70.7 as a
   vendor-adjacent number.
2. The Qwen2.5-VL-32B and -72B rows are **byte-identical across all six columns** — a
   transcription error on the paper's side. Anything resting on the Qwen comparison is softer than
   it looks.
3. There are **no GPT, Claude, or Moondream rows at all** in that table.

**The one genuinely third-party number** — Poivre (arXiv 2509.23746, Fudan, no Ai2 affiliation),
Point-Bench success rate: Poivre-7B 67.5, **Molmo-72B 63.8**, Gemini-2.5-Pro 62.8, Qwen3-VL-235B
58.4, **GPT-4o 29.5**, **Claude-3.7-Sonnet 22.2**. The gap between the pointing-trained models and
the frontier chat models is the part that replicates outside Ai2, and it is large.

**What none of this measures is our question.** No public benchmark asks "point to the background of
an album cover", and the three covers we most care about are ones a careful human could not resolve.
So the numbers justify *bothering* with §4; they cannot stand in for it. **A direct third-party
Molmo-vs-Qwen-vs-Moondream pointing comparison does not exist in published form** — that was checked,
not assumed.

### 2.6 Alternatives — for the record

The alternatives question is largely moot because the primary route works natively. Recorded so the
next reader does not re-derive it, and because two of these are **corrections to what I first
believed**:

- **PyTorch MPS — ruled out, with a specific reason.** Molmo's `trust_remote_code` modeling file
  calls `torch.autocast(device.type, enabled=False)` when computing the attention bias.
  `autocast` supports CPU and CUDA only, so MPS raises `RuntimeError: unsupported scalarType`.
  This is an eager type check, **not** a missing kernel, so `PYTORCH_ENABLE_MPS_FALLBACK=1` does not
  help. A patch exists in HF discussion #21 on `allenai/Molmo-7B-D-0924` but **nobody in that thread
  confirmed a working end-to-end MPS run**; they fell back to CPU.
- **llama.cpp / GGUF — ruled out.** Molmo is absent from llama.cpp's `docs/multimodal.md` vision
  list. Issue #9645 ("Molmo 72B vision support") was closed **stale, unimplemented**. The only GGUF
  (`reubk/Molmo2-4B-GGUF`) states it needs *"custom modifications to llama.cpp mtmd code"*, that
  the model is *"increasingly lobotomized when mmproj is included"*, and *"I won't be maintaining
  this model."*
- **Qwen3-VL — CORRECTION: it does point, not only box.** I first recorded this as boxes-only; that
  is wrong. Qwen3-VL emits `point_2d` normalized 0–1000 as well as boxes, and Qwen's own blog says
  *"Qwen2.5-VL utilizes bounding boxes and point-based representations for grounding."* It is
  already on our stack (`mlx_vlm/models/qwen3_vl`). The difference from MolmoPoint is not
  *capability* but *mechanism*: Qwen emits coordinates as ordinary text to be regex-parsed, with no
  constrained decoding and no absence class, and it scores **58.5 vs MolmoPoint's 70.7** on
  Point-Bench. **Its real value here is as the cross-check** — where two independently-trained
  pointers disagree about which pixels are ground, that disagreement is evidence about the *cover*,
  which is exactly the `000c4d52`/`000fa9b5`/`krafty` ambiguity. Cheap, since it needs no new
  download of a class we lack.
- **Moondream — CORRECTION: unusable on MLX for this purpose.** Moondream natively has a `point`
  skill returning normalized `{"x":…, "y":…}`, and I first noted it as a fast second opinion. But
  **both mlx-vlm ports strip the region head at load**: `moondream3.py`'s `sanitize` drops every key
  starting with `"region."` and `moondream2.py` drops `"region_model."`. The weights are not merely
  unused — they are never loaded. **Moondream on MLX is caption/VQA only.** There is also no
  published Moondream pointing accuracy of any kind (its ScreenSpot F1@0.5 = 80.4 is an
  IoU-thresholded *region* metric and is not comparable to point-in-mask accuracy).
- **`locateanything`** — NVIDIA LocateAnything-3B, in mlx-vlm since v0.5.0. Emits **points and
  boxes** at 0–1000, MLX weights exist, and at 3B it is small. **Blocked by licence: NVIDIA
  non-commercial.** Worth knowing it exists; not usable without a licensing decision.
- **Florence-2 and PaliGemma** — boxes/polygons and `<locNNNN>` segmentation only. No task returns
  a point. Ruled out.

---

## 3. Interface

### 3.1 What MolmoPoint emits

**Not** the old Molmo `<point x="..." y="...">` XML. MolmoPoint uses **special tokens**, decoded
against per-image metadata. From
`.venv/.../mlx_vlm/models/molmo_point/point_utils.py`:

```python
EXTRACT_POINT_TRIPLE = re.compile(
    r"<POINT_(\d+)> ?<POINT_(\d+)> ?<POINT_(\d+)> ?([0-9]+)"
)
```

Each point is a **triple plus an id**: `(patch_id, subpatch_id, location_id, example_id)`. Those are
indices into the vision tower's patch grid, not coordinates. `extract_points_from_text()` converts
them to pixels using metadata the *image processor* produced:

```
extract_points_from_text(output_text, pointing_metadata, no_more_points_class=True,
                         patch_location="3x3") -> List[(object_id, image_num, x, y)]
```

Three properties that matter for us:

1. **Output is in ORIGINAL image pixel coordinates.** The metadata carries
   `image_sizes = [(w, h) for each input image]` and the final step is
   `(p_x / mapping.shape[1]) * w`. No rescaling on our side. **[MEASURED]** source read,
   `point_utils.py:52-71`, `image_processing.py:336-344`.
2. **Multiple points are native.** The regex is a `finditer` over the whole output, and each point
   carries an `object_id`, so "point to all X" returns a *set* of grouped points in one generation.
   This is the property a taxonomy question cannot have and a pointing question can: it answers
   "which parts" in the plural, which is precisely the reviewer's `krafty` problem ("flowers on the
   four corners").
3. **Absence has a first-class representation.** `no_more_points_class: bool = True` in the model
   config — the model has an explicit *no more points* class rather than being forced to emit a
   coordinate. **This is the single most valuable property for our use.** Our whole ground problem
   started with a reviewer pressing "none discernible" and then saying it was not true. A model that
   can decline to point, structurally, is a model whose silence means something. Whether it
   *actually* declines on hard covers is a probe question, not a documentation question — §4 tests
   it explicitly.

**Point precision** is quantized: one third of a pooled patch cell (`patch_location="3x3"` splits
each patch into a 3×3 sub-grid, `point_utils.py:56-60`). With `base_image_input_size=(378,378)`,
`image_patch_size=14`, `max_crops=24`, that is single-digit pixels on a 640 px cover — far finer
than a SAM point prompt needs. Confirm empirically on the probe rather than trusting this
arithmetic.

### 3.2 The one gap on the Molmo side

`extract_points_from_text` is **defined but never called anywhere else in mlx-vlm**. The standard
`mlx_vlm.generate` will hand back a *string* containing `<POINT_n>` tokens; converting it is the
caller's job. The metadata arrives by side-channel — the processor stashes it on itself as
`self._pointing_metadata` during `__call__` (`processing_molmo_point.py:221-223`).

**Cost: ~10 lines.** Generate, then call `extract_points_from_text(out, processor._pointing_metadata)`.
The only trap is that the side-channel attribute is overwritten per call, so it must be read
immediately after the matching `__call__` — which forbids batching images across one processor
instance without care. Worth a comment in whatever runner uses it.

### 3.3 SAM 3.1 point prompts — weights present, code path absent

This is the substantive finding of the scout, and it is better news than the task framing assumed.

**The weights are already on this disk.** Reading the safetensors header of the pinned snapshot
`mlx-community/sam3.1-bf16` @ `a992e302…` (**[MEASURED]** 2026-08-03, header parse only, no load):

| Key pattern | Tensors present |
|---|---|
| `tracker_model.interactive_sam_prompt_encoder.*` | **14** |
| `tracker_model.interactive_sam_mask_decoder.*` | **131** |
| `…prompt_encoder.point_embed.weight` | 1 |
| `…prompt_encoder.not_a_point_embed.weight` | 1 |
| `detector_model.geometry_encoder.points_{direct,pool,pos_enc}_project.*` | 6 |

That is **145 tensors of interactive point-prompt machinery already downloaded**, and it is
consistent with what `config.py` already records — `WEIGHT_LOAD_NOTE` says the manual load matches
all 1,961 parameters `strict=True` with zero missing. Those 145 are inside that 1,961. **We have
been loading the point-prompt weights into memory on every SAM run this whole campaign and never
calling them.**

**What is missing is only the forward path.** Three specific gaps, all read from source:

1. **The detector ignores its point projections.** `sam3_1.py:29` says so in a comment —
   `# SAM 3.1 adds point prompt projections (unused in detection-only mode)`. `GeometryEncoder`
   constructs `points_direct_project`, `points_pool_project`, `points_pos_enc_project` and never
   uses them.
2. **The interactive FPN is never computed.** `_get_tracker_features()` (`sam3_1.py:162-170`) calls
   the neck with `need_interactive=False, need_propagation=True`. The neck fully supports
   `need_interactive=True` and has its own `interactive_convs` (`vision.py:89-91`) — it is simply
   never asked.
3. **The interactive decoder is constructed, loaded, and never called.** `tracker.py:125` builds
   `self.interactive_sam_mask_decoder` with `num_multimask_outputs=4` specifically for point/box
   prompts (the comment at `tracker.py:111` says
   `# Interactive SAM components (for point/box prompts — single object, 4 mask outputs)`), but
   `track_step` encodes prompts with `interactive_sam_prompt_encoder` and then **decodes with
   `self.sam_mask_decoder`** — the 16-object multiplex *propagation* decoder
   (`tracker.py:197-208`). The interactive decoder has no caller anywhere in the package.

And the public API confirms it: `generate.py` exposes `predict_multi` (text/concept) and
`track_video*`. **There is no single-image point-prompt entry point at all.**

The prompt encoder itself is complete and correct-looking. `SAMPromptEncoder.__call__`
(`models/sam3/sam_components.py:353-393`) takes exactly what we need:

```
points: (coords (B,N,2), labels (B,N))   # labels: 1 = foreground, 0 = background, -1 = padding
boxes:  (B, N_box, 4)
masks:  (B, 1, H, W)
```

`-1` padding is routed to `not_a_point_embed` (`sam_components.py:414-417`), so ragged point sets
across a batch are already handled.

**Cost to add: plumbing, not weights, and it does not require patching mlx-vlm.** `common.load_sam()`
already builds the `Model` directly and returns it (it must, because `mlx_vlm.utils.load_model()`
double-transposes the conv weights for this repo — `WEIGHT_LOAD_NOTE`). So we hold the live module
tree and can call submodules ourselves. The adapter is roughly:

1. `_get_interactive_features(backbone)` — a copy of `_get_tracker_features` with the flags flipped. ~6 lines.
2. `segment_from_points(model, pixel_values, coords, labels)` — backbone → interactive FPN →
   `interactive_sam_prompt_encoder(points=(coords, labels))` →
   **`interactive_sam_mask_decoder`** (not `sam_mask_decoder`) with `multimask_output=True` →
   upscale to image size, pick by IoU score. ~60–100 lines, most of it the mask post-processing
   that `generate.py:_postprocess_mlx` already demonstrates and can be borrowed from.
3. No memory bank, no `track_step`, no video path — a single image with points is the simplest
   possible call into this model.

**Estimate: 80–150 lines in `research/v3/oracle/sam/`, zero downloads, no upstream patch.**

### 3.4 The one real risk, and it must be settled first

`SAMPromptEncoder._embed_points` (`models/sam3/sam_components.py:396-404`) normalizes coordinates by
**`image_embedding_size`** — the *feature grid* (e.g. 72×72) — not by the input image size:

```python
coords = coords + 0.5
coords = coords / mx.array([self.image_embedding_size[1], self.image_embedding_size[0]], ...)
```

Upstream SAM normalizes by **`input_image_size`** (1024) in the equivalent function. So either
(a) this port expects the caller to pass coordinates already in feature-grid units, or (b) it is a
latent bug in code that has never been executed because nothing calls it.

**We cannot tell from reading, and we must not guess.** Both readings produce a running program;
only one produces masks in the right place. Fortunately it is trivially decidable and self-checking:
**prompt a point at a known unambiguous location — the dead centre of a cover with a large flat
ground — and see where the mask lands.** If a centre point in image pixels lands correctly, reading
(a) is wrong and the divide is a bug; if the mask lands in the top-left ~7% of the frame
(72/1024), the caller owes it feature-grid coordinates. Ten seconds of GPU, and it gates everything
else. **This is step 0 of the probe.**

---

## 4. Probe design — pre-registered

Paper only. Nothing here has been run. **The GPU is a single-owner resource; this waits for a slot
from the orchestrator** (`CONVENTIONS.md`).

### 4.1 Step 0 — the coordinate-convention gate (SAM only, no Molmo)

Before any pointing model is downloaded. Load SAM as usual, hand
`segment_from_points` a single foreground point at the image centre of
`000bc98f315aba36374f9f93` (the one cover in the 19 the reviewer called **`flat_field`** — the
easiest possible target). Render the overlay.

- **Mask covers the flat ground →** convention (a) is wrong, coordinates are image pixels, proceed.
- **Mask lands in the extreme top-left →** feed feature-grid coordinates; re-test; proceed.
- **Neither →** the interactive decoder wiring is wrong. Stop and report. Do not download Molmo.

**Cost: ~2 minutes, zero download.** This step alone retires the whole §3.4 risk and is worth
running even if the pointing half is deferred.

### 4.2 The image set — 15 covers, all verified present on disk

**The 9 free-text covers** (`cascade-ground-truth-1-analysis.json` →
`verdict.vocabulary_misfit_covers`) — the ones where the reviewer pressed *none discernible* and
then described the ground in prose anyway:

| # | id | path | reviewer's ground, in their words |
|---|---|---|---|
| 1 | `00014fb4…` | `01/ab67616d0000b27300014fb430dd1b693e653121.jpg` | "green on the left and red on the right" — two fields |
| 2 | `00030075…` | `03/ab67616d00001e02000300752f338b6aedff856c.jpg` | one green wall, "maybe 30% of the entire picture" |
| 3 | `00066a61…` | `06/ab67616d00001e0200066a61bbcbeadd632f7f38` | "many pink squares … one coherent background" |
| 4 | `00075841…` | `07/ab67616d0000b27300075841f68d8cd71db368d8` | white banner "about maybe 15% of the height"; hardwood floor behind the objects |
| 5 | `000c4d52…` | `0c/ab67616d00001e02000c4d52300a016ee65f1622` | **ambiguous** — "none of it really feels like a background" |
| 6 | `000f0a78…` | `0f/ab67616d00001e02000f0a78a1791248aec707e3` | "black bar at the top, then a champagne bar, then a red field" |
| 7 | `000fa9b5…` | `0f/ab67616d0000b273000fa9b53f161dc999ef557d` | **ambiguous** — collage; grey dots on white, a shaded yellow field |
| 8 | `artofficial` | `images/artofficial.jpg` | one face near the middle is the subject, "everything else feels like the background" |
| 9 | `krafty` | `images/krafty.jpg` | **ambiguous** — black flat field behind everything; pink leaves either ground or figure |

**6 controls**, drawn from the same 19 so the comparison is like-for-like. Four of them are the
covers where reviewer and model D **exactly matched** on ground type (from
`slices_reported_separately_never_pooled.corpus_wide_19.exact_ground_type_match.covers_matched`) —
i.e. demonstrably easy, by the campaign's own measurement, not by my guess:

| id | path | reviewer's answer | why this control |
|---|---|---|---|
| `000bc98f…` | `0b/ab67616d0000b273000bc98f315aba36374f9f93` | `flat_field` | easiest possible; also the §4.1 gate image |
| `0002dfdc…` | `02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg` | `multiple_distinct_fields` | exact match |
| `0000269e…` | `00/ab67616d00001e020000269ead63cf2376a6b67d.jpg` | `multiple_distinct_fields` | exact match |
| `disney` | `images/disney.avif` | `multiple_distinct_fields` | exact match; also exercises AVIF decode |
| `elephunk` | `images/elephunk.jpg` | `multiple_distinct_fields` | exact match |
| `skap` | `images/skap.jpg` | `full_scene` | **negative-ish control** — a scene with no separable ground; a well-behaved pointer should decline or scatter |

**[MEASURED]** all 15 paths verified to exist on disk, 2026-08-03.

### 4.3 Prompts — 3 variants, fixed before the run

1. `point to the background` — the plain form.
2. `point to all parts of the background` — tests the plural/`object_id` grouping that §3.2 claims.
3. `point to the background surface behind the subject` — the figure/ground framing, because
   `GROUND_FREETEXT_SYNTHESIS.md` §"decidability test" says test (2), *which pixels are ground*, is
   the one that actually failed, and it is a figure/ground question.

Record the raw output string for every call, not just the parsed points. A parse that silently
yields zero points and a genuine *no more points* decline are different events and the stored row
must distinguish them.

### 4.4 Success criteria — pre-registered, and pinned to the reviewer's own prose

The reviewer's free-text descriptions are unusually spatial ("on the left", "on the right", "at the
top", "in the four corners", "about 15% of the height"), which makes them directly checkable
against a pixel coordinate. That is the whole reason this probe is worth running, and it is why the
criteria can be fixed in advance.

**Primary (the 6 covers the synthesis calls palette-decidable — 1, 2, 3, 4, 6, 8):**

- **PASS** if, on ≥5 of 6, every returned point falls inside a region the reviewer's description
  names as ground. Concretely, per cover:
  - **1** — points fall in the green left region and/or the red right region, **not** on the woman,
    the dragons, or the footballs. Bonus signal: points in *both* → the plural works.
  - **2** — points on the green wall.
  - **3** — points on the pink squares.
  - **4** — points on the white top banner and/or the hardwood floor, **not** on the shoes, hat, or
    guitar.
  - **6** — points in the black bar, the champagne bar, and/or the red field; ideally one per band.
  - **8** — points anywhere in the illustrated field **except** the one central face the reviewer
    named as the subject.
- **FAIL** if points land on the named subjects on ≥2 of the 6.

**Secondary (the 3 the synthesis calls genuinely ambiguous — 5, 7, 9):** there is **no correct
answer**, so these are not scored for correctness. They are scored for **behaviour**, and the
question is whether the model's uncertainty is legible:

- Does it decline (`no more points`)? Does it return few points, or many scattered ones?
- On `krafty` specifically: does it include the pink leaves or not? The reviewer could argue it
  both ways. **Either answer is acceptable; an answer is the point.** If the model commits
  confidently and consistently across the 3 prompt variants where the human could not commit at
  all, that is a finding about the instrument and should be reported as one, not as a win.

**Controls:** on the 5 non-`skap` controls, points must land on the ground the reviewer named. If
they do not, the probe has failed at the easy end and nothing about the 9 can be concluded. On
`skap` (`full_scene`), a decline or a wide scatter is the *expected* good behaviour.

**Stop rule.** If the controls fail, stop; do not interpret the 9.

### 4.5 The SAM hand-off, and what it is actually for

For each cover, take the points that pass and feed them to `segment_from_points` as foreground
(`label=1`). Optionally add the reviewer-named subject as a **background** point (`label=0`) — the
prompt encoder supports mixed labels natively and that is exactly the disambiguation SAM's
interactive mode exists for.

Compare the resulting background mask against the **running residual/mask-subtraction experiment**
(`RESIDUAL_EXPERIMENT_NOTES.md`). These are two independent routes to the same object: residual
derives ground by *subtracting* everything it can name; pointing derives it *directly*. **Where
they agree, the ground is real and we have it two ways. Where they disagree, that is the
interesting evidence** — and given the synthesis's finding that 3 of 9 covers are ambiguous *even
in prose*, we should expect and want disagreement on exactly those three. Agreement everywhere
would be the suspicious result.

### 4.6 Cost

| Item | Estimate | Basis |
|---|---|---|
| Step 0 gate (SAM only) | **~2 min**, 0 GB | one image, no download |
| MolmoPoint-8B-8bit download | **10.77 GB** | [MEASURED] HF API |
| Model load | ~1 min | comparable to SAM's load |
| Pointing: 15 covers × 3 prompts = 45 generations | **~4–15 min** | [ASSUMED] ~5–20 s/generation. 24-crop prefill dominates; MolmoPoint spends only 3 tokens per point, so decode is short. **The least certain number here.** mlx-vlm's own README claims *"~6 tokens/sec on Apple Silicon"* and *"peak memory approximately 39 GB"* — but for the **full bf16** model, with no hardware named. At 8-bit on 103 GB both should be materially better. Treat the range as a bound, not a forecast, and measure it on the probe. |
| SAM point-prompt passes | **~1–2 min** | SAM measured at 4.25 s/image for 10 concept passes (`PHASE_0_LOOSE_ENDS.md` A9: `elapsed=604.1s`, 142 images); a single point prompt is one backbone forward plus a small decoder |
| Overlay rendering | ~1 min | `overlay.py` exists |
| **Total GPU slot** | **~15–25 min** | dominated by the pointing row's uncertainty |
| **Total disk** | **~11 GB** | leaves ~103 GB free on a volume already at 88% |

The download is the only large cost and it is one-time. **The step-0 gate needs no download at
all**, so if the orchestrator wants to de-risk this before spending 11 GB, §4.1 is a standalone
2-minute job that answers the hardest open question in this document.

---

## 5. Proposed loose-end and plan entries

Proposed only — I own this file and nothing else. The orchestrator places these.

**A-class (sharp — something downstream already leans on it):**

> **A-new. SAM point prompts are loaded on every run and never called.**
> **What.** The pinned snapshot carries 145 interactive point-prompt tensors
> (`interactive_sam_prompt_encoder` 14, `interactive_sam_mask_decoder` 131, plus the detector's
> three point projections). `load_weights(strict=True)` matches them; nothing in mlx-vlm calls
> them. `track_step` even encodes prompts with the interactive encoder and then decodes with the
> *propagation* decoder (`tracker.py:197-208`), leaving `interactive_sam_mask_decoder` with no
> caller in the package.
> **Why sharp.** Every "SAM can only do text/concept prompts" statement in this campaign is
> false as stated — it is a property of mlx-vlm's exposed API, not of the model or of our weights.
> Any design note reasoning from that limit should be re-read.
> **Cost to close.** 80–150 lines in `oracle/sam/`, no download, no upstream patch. Gated by §3.4.
> **Owner.** orchestrator, for scheduling. **Revives when:** the ground question needs pixels.

> **A-new+1. The MLX point-prompt coordinate convention is untested and ambiguous.**
> `_embed_points` normalizes by `image_embedding_size`, upstream SAM normalizes by
> `input_image_size`. Never executed, so never caught either way. Decidable in ~2 min of GPU with
> no download (§4.1). **Must be settled before any point-prompt result is believed.**

**B-class (standing — parked with a clear trigger):**

> **B-new. A pointing specialist is available on this stack and has never been tried.**
> `mlx-vlm 0.6.8` ships `molmo_point`; `mlx-community/MolmoPoint-8B-*` exists in 8 quantizations.
> Never named in any repo document (§1) — there is no prior rejection to overturn.
> **Trigger:** the ground question moves to pixels, per `GROUND_FREETEXT_SYNTHESIS.md` option (b).
> **Cost:** 11 GB + ~15 min (§4.6).

**Documentation corrections** — three statements in the design docs are true of *text prompts* but
are written as though true of *SAM*, and each one closed a door:

> **(i)** `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:696-716` — *"Do not write prompts that depend
> on spatial disambiguation."* Correct for concept prompts; **point prompts are exactly the
> spatial-disambiguation mechanism**, and their weights are in the snapshot we already load. The
> rule should be scoped to the prompt mode it describes.
>
> **(ii)** `data/sam/SAM_DESIGN_NOTES.md:70-111` — the salience probe concluded the capability does
> not exist after ten text phrasings failed. It should record that a non-text route (an externally
> supplied coordinate) was not tried, so a future reader does not re-derive the same dead end.
>
> **(iii)** `ORACLE_QUESTION_SET.md:645` — *"SAM masks nouns it is given."* SAM also masks
> **points** it is given. The VLM→SAM seam can carry coordinates, not only nouns.
>
> And `SAM_DESIGN_NOTES.md` / `oracle/sam/config.py` should state plainly that SAM 3.1 has point,
> box and mask prompt modes, that this campaign uses text/concept only, and that the point weights
> are present and loaded. Nothing currently says other prompt modes exist — which is how a
> capability sitting in memory on every run stayed invisible for the whole campaign.

---

## 6. What would change my mind

Written down so this document can be held to it.

- **If the §4.1 gate shows the interactive decoder produces garbage regardless of coordinate
  convention**, then §3.3's "plumbing, not weights" claim is wrong and the cost estimate is worthless.
  Everything downstream of that gate is conditional on it.
- **If MolmoPoint declines to point on most of the 9**, that is not a failed probe — it would be
  strong evidence *for* the synthesis's ambiguity finding, arriving from an independent instrument.
  Report it as such.
- **If MolmoPoint points confidently and consistently on `000c4d52`, `000fa9b5` and `krafty`** —
  the three the reviewer could not resolve even in prose — treat that with suspicion, not
  celebration. A model that is certain where a careful human is not is more likely to be exhibiting
  a prior than a perception.

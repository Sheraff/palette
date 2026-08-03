# Pointing models -> SAM point prompts — the probe

**For:** the reviewer and the orchestrator. **Date:** 2026-08-04. **Status:** ran.
**Follows:** `POINTING_SCOUT_NOTES.md` (paper-only scout, 2026-08-03) and `GROUND_ROUTES.md`.
The scout pre-registered the gate, the image set, the three prompt phrasings and the success
criteria before anything was run. This document reports against that registration and marks
every place where the run deviated from it or found the registration wrong.

**GPU:** single-owner slot held for this work. **Download:** one, 10.77 GB, authorized.

---

## The one-page answer

| | |
|---|---|
| **The gate** (which coordinate frame does SAM's point encoder want?) | **Feature-grid coordinates.** Settled on CPU with zero download, then confirmed end-to-end. Not a bug — but the failure mode is worse than the scout predicted (§1). |
| Is SAM's point path plumbing or missing weights? | **Plumbing, as the scout said.** ~1,770 lines of ours, no mlx-vlm patch, no download (§2). |
| Does mlx-vlm's own point path work? | **No — it is broken three separate ways**, and this was invisible because nothing exercises it (§2.3). |
| Does the point path work once wired? | **Yes. 98/100** synthetic points land inside the mask they generated (§2.4). |
| Does Qwen3-VL point at album-cover grounds? | **Partly, and unreliably.** 18 of 45 calls produced a point at all; its refusals track the *wording*, not the image (§3). |
| Does MolmoPoint? | see §4 |
| Which pointer wins? | see §5 |
| Does pointing->SAM merit a full-width run? | see §7 |

---

## 1. The gate — settled, with evidence

### 1.1 What was in doubt

`SAMPromptEncoder._embed_points` (`mlx_vlm/models/sam3/sam_components.py:397-404`) normalizes
point coordinates by **`image_embedding_size`** — the 72x72 feature grid — where upstream SAM
normalizes by **`input_image_size`** (1008 here). The scout could not settle it from source
because both readings produce a running program, and flagged it as the one thing that had to be
decided before anything else.

### 1.2 The discriminating check, and why it needed no GPU and no image

The scout proposed prompting a centre point on a flat cover and looking at where the mask lands.
That works, but it is not the sharpest instrument available and it needs the GPU. The check that
actually ran is exact, deterministic, costs one CPU second and loads **two tensors**:

The prompt encoder's positional encoding is random-Fourier —
`enc(u) = concat(sin(2*pi*(2u-1) @ B), cos(2*pi*(2u-1) @ B))`. Sparse point tokens carry
`enc(point)`; the dense image tokens carry `enc(cell)` from `get_dense_pe()`; the mask decoder's
two-way transformer attends between them. **The two must share one normalized frame or the
attention is not spatial at all.** So: embed a point that is *meant* to sit at feature cell
`(r, c)`, then ask which of the 5,184 dense cells its encoding is nearest.

**[MEASURED]** 2026-08-04, CPU, `gate_point_coords.py`, 8 target cells spread over centre,
corners and off-diagonal, on a synthetic 640x640 frame (chosen so the original-pixel and
input-pixel readings are distinguishable from each other, which they are not at 1008 px):

| Reading | argmax within 1.5 cells | median cell error | cosine at argmax |
|---|---|---|---|
| **feature-grid coords** | **8/8** | 1.00 | **+0.9931** |
| input-pixel (1008) coords | 0/8 | 30.1 | +0.17 |
| original-pixel coords | 0/8 | 39.2 | +0.17 |

A numpy reimplementation of `forward_with_coords` agrees with the MLX path to 6e-08, so the
check is measuring the model and not our arithmetic.

**Verdict: the caller owes FEATURE-GRID coordinates.** `image_embedding_size` is not a typo for
`input_image_size`.

### 1.3 The part the scout got wrong, and it matters

The scout predicted that a wrong convention would put the mask "in the top-left ~7% of the
frame (72/1024)". **It does not.** The encoding is periodic in the coordinate, so an
out-of-range value does not clip, saturate or crowd into a corner — **it aliases**, landing on
an unrelated cell with a perfectly ordinary-looking embedding. In the table above the wrong
readings scatter 30-39 cells from target with median cosine +0.17, i.e. essentially random
placement, not a corner bias.

**Consequence for anyone who writes a point-prompt caller later:** passing image pixels does not
produce an obviously broken picture you would catch by eye. It produces **a confident mask in
the wrong place**. That is the failure mode to fear, and it is why this had to be measured
rather than reasoned about. It also means the residual half-cell offset noted below is
irrelevant by comparison.

### 1.4 A sub-cell wrinkle, recorded so it is not rediscovered as a bug

`PositionalEmbedding.__call__` builds the dense grid with `arange(H)/H` — cell **corners** —
while upstream SAM uses `(arange(H)+0.5)/H` — cell **centres**. So the dense frame sits half a
feature cell (7 px of 1008, 0.7% of the frame) up-left of where the point frame puts a cell
centre. This is the systematic 1-cell argmax offset visible in the table. It is constant across
every cell, shared by every point, and an order of magnitude below point-prompt precision. Not
worth correcting; worth not re-deriving.

### 1.5 Confirmed end to end

The weight-level gate proves the point token lands where we think. It does not prove the decoder
path works. `point_smoke.py` re-ran the question through the whole pipeline on 4 covers x a 5x5
grid of synthetic points = **100 trials per condition**, scored on whether the returned mask
contains the pixel that was prompted:

| Coordinate frame | point-in-mask |
|---|---|
| **feature-grid** | **98/100** |
| input-pixel | 80/100 |
| original-pixel | 75/100 |

The wrong readings score well above zero because a mask covering a third of the frame contains a
random point a third of the time — which is exactly why the first pass of this smoke, at 10
trials, could not separate them (70% vs 50% vs 70%) and had to be widened. **A 10-trial version
of this check would have produced a confident wrong answer.**

---

## 2. The wiring

### 2.1 What was written, and where

All new files, all under `research/v3/oracle/sam/`. Nothing in the installed package was
patched; `config.py` and every file with uncommitted sibling changes were left alone.

| File | Lines | What |
|---|---|---|
| `point_prompt.py` | 415 | the adapter: coordinate conversion, interactive FPN, `segment_from_points`, candidate selection |
| `gate_point_coords.py` | 211 | §1's gate |
| `point_smoke.py` | 277 | §1.5 + §2.4, the wiring A/B |
| `point_sheets.py` | 96 | contact sheets |
| `pointing_covers.py` | 172 | the 15-cover set + the reviewer's prose as answer key + the 3 phrasings |
| `pointing_parse.py` | 161 | point parsing for both producers, with decline/parse-failure kept distinct |
| `pointing_probe.py` | 437 | the probe runner and scorer |
| **total** | **1,769** | scout estimated 80-150 for the adapter alone; the adapter is 415 |

The scout's 80-150 line estimate was for `segment_from_points` proper and is roughly right for
that function; the rest is the gate, the A/B harness, the probe and the scoring that the estimate
never covered.

### 2.2 The call path

`common.load_sam()` already hands back the live module tree (it must, because
`mlx_vlm.utils.load_model()` double-transposes the conv weights for this repo — see
`config.WEIGHT_LOAD_NOTE`), so submodules can be called directly:

backbone -> neck with `need_interactive=True` -> `interactive_sam_prompt_encoder(points=(coords, labels))`
-> **`interactive_sam_mask_decoder`** with `multimask_output=True` -> resize logits to the
original frame -> threshold at 0 -> pick a candidate.

`encode_image()` caches the backbone+neck pass; a decode is **11 ms** against roughly a second of
encode, which is what makes many point sets per cover affordable.

### 2.3 Three things mlx-vlm gets wrong, all measured

The scout said the interactive decoder has no caller. That is true, and there is more: mlx-vlm
*does* expose a point path — `Sam3VideoPredictor.add_point_prompt` /
`_init_object` (`models/sam3/generate.py:546, 718`) — and **it does not work.** Measured at
n=100, holding coordinates correct:

| Wiring | point-in-mask | degenerate masks |
|---|---|---|
| **interactive decoder + interactive FPN + high-res skips** | **98/100** | 1 |
| interactive decoder, high-res skips off | 68/100 | 21 |
| interactive decoder + propagation FPN | 96/100 | 1 |
| **propagation decoder (what mlx-vlm uses for points)** | **1/100** | 48 |
| propagation decoder + interactive FPN | 0/100 | 97 |

1. **It decodes point prompts with the wrong decoder.** `track_step` encodes with
   `interactive_sam_prompt_encoder` and then decodes with `sam_mask_decoder`, the 16-object
   multiplex *propagation* decoder. `interactive_sam_mask_decoder` — built with
   `multiplex_count=1, num_multimask_outputs=4` specifically for point/box prompts — has no
   caller in the package. Cost: **1/100 versus 98/100**.
2. **It never computes the interactive FPN.** `_get_tracker_features` calls the neck with
   `need_interactive=False`. (This one turns out to cost little on its own: 96 vs 98.)
3. **It passes the high-res skip connections in an order its own shape guards reject.**
   `MultiplexMaskDecoder` consumes `high_res_features[0]` at 144x144 and `[1]` at 288x288; the
   FPN returns `[4x=288, 2x=144, 1x=72]`; `Model.track_step` forwards `[fpn[0], fpn[1]]` =
   (288, 144). Both `if s.shape[1:3] == upscaled.shape[1:3]` guards fail and **both skips are
   silently dropped**. Cost when dropped: 98 -> 68, with 21 degenerate masks.

`interactivity_no_mem_embed` — the learned "this frame has no memory" embedding that upstream SAM
adds and `track_step` never does — made **no difference** (98 vs 98). Kept on as
upstream-faithful and recorded here as inert, so nobody spends time on it again.

### 2.4 Candidate selection had to become an explicit, recorded choice

The interactive decoder returns 4 candidates. mlx-vlm never has to choose because it never calls
it. The predicted-IoU head on this path is **weakly calibrated**: its sign carries information
(where max predicted IoU is positive the top candidate reliably contains the prompted point;
where it is strongly negative often none does) but its ranking among candidates is poor.

| Selection policy | point-in-mask |
|---|---|
| argmax predicted IoU (the naive port) | 91/100 |
| argmax mask logit at the prompted point | 98/100 |
| **argmax IoU among candidates containing the point** (default) | **98/100** |

The last two tie; the tie is broken toward the module default deliberately rather than by dict
iteration order, and every stored row names the policy that produced it.

---

## 3. Qwen3-VL — the cross-check that needed no download

`mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit` @ `f31102655767`, already on disk, 640 px cap
(the campaign's `RESOLUTION_CAP_PX`), temperature 0, 256 max tokens, 15 covers x 3 phrasings =
**45 calls in 43 s**.

### 3.1 What it emits

Not JSON `point_2d` as the scout expected from Qwen's documentation, but **Molmo-style XML**:

```
<points x1="154" y1="104" x2="885" y2="104" alt="parts of the background">parts of the background</points>
```

Coordinates are **0-1000 normalized** ([MEASURED]: x=885 observed on a 640 px image, so not
pixels). The multi-point form is native. The parser handles this, the singular `<point x= y=>`
form, and the JSON `point_2d` form, and keeps an explicit decline distinct from a parse failure.

### 3.2 The headline finding: Qwen's refusals are about the wording, not the image

25 of 45 calls came back "There are none." That looks like the absence signal the scout hoped
for. **It is not.** Broken out by phrasing:

| Phrasing | produced points | declined | unparsed |
|---|---|---|---|
| `point to the background` | **11/15** | 2 | 2 |
| `point to all parts of the background` | 6/15 | 9 | 0 |
| `point to the background surface behind the subject` | **1/15** | **14** | 0 |

The decline rate is a property of the sentence, not of the cover. The figure/ground phrasing —
which `GROUND_FREETEXT_SYNTHESIS.md` argues is the *right* question — is the one that breaks
Qwen's pointing mode almost completely. Per-cover the pattern is flat: nearly every cover
produced 1-2 point-bearing calls and 1-2 declines, regardless of how obvious its ground is.

**This retires, for Qwen, the scout's most-valued property.** §3.1 of the scout notes called a
structurally-meaningful decline "the single most valuable property for our use". Qwen has no
such structure — it emits refusals as ordinary text, and here they are a formatting artifact.
Any design that reads Qwen silence as evidence about an image would be reading noise.

### 3.3 The second finding: an edge prior — and a claim I had to withdraw

Of the 25 points Qwen produced, **19 fall within 15% of a frame edge (chance: 51%) and 13
within 20% of a corner (chance: 16%)**. The corner concentration in particular is well above
what a uniform point would give.

**A correction, recorded because I nearly shipped the opposite conclusion.** My first reading of
this run was that Qwen answers "background" with a stored template. The evidence was `disney`,
where it returned four exactly symmetric inset corners —
`(155,155) (855,155) (855,855) (155,855)` — and answered the plural phrasing with the same
rectangle inset slightly further. That looked conclusive.

**It is wrong.** `disney` is literally a four-quadrant colour block cover — blue, green, orange
and magenta, one per quadrant, which is exactly why the reviewer and model D both labelled it
`multiple_distinct_fields`. Four symmetric points land **one in each field**. Far from being the
run's worst artifact, it is its **best single result**: the only unambiguous demonstration in
either pointer of correctly enumerating a multi-field ground.

Two further checks that the template hypothesis fails: across all 45 calls, Qwen produced **25
points, 25 of them distinct**, and **no coordinate was reused on more than one cover**. Same for
MolmoPoint (50 points, 45 distinct, no cross-cover reuse; its 5 repeats are the same cover
answering two phrasings identically, which is consistency, not a template).

So the honest claim is the weaker one: **an edge/corner prior, above chance, on a corpus where
grounds genuinely do tend to lie at the edges** — which means this statistic cannot separate
"prior" from "correct perception" on its own, and I am not going to pretend it can. Settling it
needs the reviewer round in §8.

### 3.4 Against the pre-registered criteria

- **The FAIL condition — points landing on named subjects — is mostly not triggered.** Using the
  stored v4-noun SAM masks as an objective judge (not an eyeball), only **2 of 18** point-bearing
  calls put a point inside a `person`/`face` mask, and both were on `00014fb4`, where Qwen put
  its "background" point on the ghosted woman in the green left field. One further call landed on
  an applied mark (`words`), which is *not* counted as failure — text sits on a ground.
- **The pre-registered bonus signal fired once.** On `00014fb4` the plural phrasing returned
  points in both the left and the right field, which is the reviewer's own description
  ("green on the left and red on the right"). One of the two was on the woman.
- **The controls did not cleanly pass.** `00030075` — a spa interior whose ground the reviewer
  described concretely as "one green wall, maybe 30% of the entire picture" — was declined on all
  three phrasings. Under the scout's stop rule ("if the controls fail, stop; do not interpret the
  9") this is a caution, not a clean pass. It is reported rather than explained away.
- **The ambiguous three behaved unremarkably**: 9 of their 12 calls declined, but so did calls on
  easy covers, so the declines carry no information (§3.2). The scout's §6 test — "if it points
  confidently and consistently where the reviewer could not commit, suspect a prior" — cannot be
  run on Qwen, because its confidence is not legible.

### 3.5 SAM masks grown from Qwen's points

14 of 18 masks contained the points they were grown from (the other 4 are cases where the
selected candidate was a sibling region). Mean mask area 0.408 of the frame. Agreement between
phrasings on the same cover, as mask IoU, was **mean 0.446, median 0.533 over 5 comparable
pairs** — low, and on so few pairs because the two weaker phrasings usually declined.

Sheet: `data/sam/sheets/pointing-qwen.png` (45 tiles, points + resulting masks).
Rows: `data/sam/pointing-probe-qwen.json`.

---

## 4. MolmoPoint

`mlx-community/MolmoPoint-8B-8bit` @ `e295e68b2ee56c2d9a912453b5130633bd35aa4b`, downloaded for
this probe: **3 shards, 10,747,093,835 bytes** — 10.75 GB, matching the scout's 10.77 GB figure
to within rounding. Config confirms the scout's architectural reading exactly: `patch_location:
3x3`, `no_more_points_class: true`, dedicated `patch/subpatch/location` token ids 151947-9,
8-bit affine quantization, 378 px base with `max_crops: 24`.

It loaded and ran on the pinned mlx-vlm **0.6.8** with no patch and no pin move, confirming §2.3
of the scout notes (the Molmo variant broken on 0.6.8 is the one we are not using).

### 4.1 What it emits

```
<points coords="<POINT_276><POINT_727><POINT_731>1<POINT_725>">background</points>
```

A hybrid: an XML wrapper whose payload is the special-token triple form. `EXTRACT_POINT_TRIPLE`
matches `(patch, subpatch, location, example_id)` and the trailing lone `<POINT_725>` is the
no-more-points marker. `extract_points_from_text` — which, as the scout found, has **no caller
anywhere in mlx-vlm** — decodes it correctly, and the metadata side-channel
(`processor._pointing_metadata`) is present and had to be read immediately after each call, as
predicted. Zero parse failures in 45 calls.

### 4.2 Results

| | MolmoPoint | Qwen3-VL |
|---|---|---|
| produced points | **28/45** | 18/45 |
| explicitly declined | 17/45 | 25/45 |
| **unparsed** (neither) | **0/45** | 2/45 |
| **points on a FIGURE** (pre-registered FAIL) | **0/28** | 2/18 |
| ... on the 11 decidable covers | **0/22** | 2/15 |
| points on an applied mark (not a failure) | 2/28 | 1/18 |
| controls producing points | **10/15** | 7/15 |
| SAM mask contains its own points | 25/28 | 14/18 |
| points per producing call | 1.79 (max 5) | 1.39 (max 4) |
| phrasing agreement, mask IoU | 0.489 mean (n=14) | 0.446 mean (n=5) |
| seconds per call | 3.9 | 1.0 |

**The pre-registered FAIL condition never fired: 0 of 28 MolmoPoint points landed inside a
stored `person` or `face` mask.** Two landed on `words` on `elephunk`, which is not a failure —
applied text sits on a ground.

Sheet: `data/sam/sheets/pointing-molmo.png`. Rows: `data/sam/pointing-probe-molmo.json`.

### 4.3 The behavioural questions the scout pre-registered

- **Does it decline on the ambiguous three?** 6 of their 12 calls declined — but so did calls on
  easy covers, and the split is again phrasing-driven (§5.1). No signal.
- **`krafty`, the pink-leaves question the reviewer could argue both ways.** MolmoPoint committed
  on both working phrasings (masks at 0.554 and 0.447 of the frame). Per the scout's §6 that is
  to be treated with suspicion rather than celebration — but see §5.2: its two phrasings agreed
  with each other here, which is at least self-consistent commitment rather than noise.
- **`skap`, the `full_scene` negative control where a decline or scatter is the good answer.**
  One point, a 0.125 mask, then declines. Neither clearly good nor clearly bad.

### 4.4 The one case where a number matched the reviewer's prose

On `00030075` the reviewer described "one green wall, **maybe 30% of the entire picture**".
Qwen declined on all three phrasings. MolmoPoint pointed, and the SAM mask grown from that point
covers **0.306 of the frame**. That is one cover and one number and it is not a result — a mask
can hit 30% for many reasons — but it is the single most direct prose-to-pixel agreement in
either run, and it is the shape of evidence this route would produce at scale.

---

## 5. Qwen vs MolmoPoint

### 5.1 The finding that replicated across both, and matters most

**The figure/ground phrasing breaks both models identically.**

| Phrasing | Qwen points | MolmoPoint points |
|---|---|---|
| `point to the background` | 11/15 | **15/15** |
| `point to all parts of the background` | 6/15 | 12/15 |
| `point to the background surface behind the subject` | **1/15** | **1/15** |

14 declines out of 15, for both models, on the third phrasing. Two independently-trained
pointers, different architectures, different output mechanisms, same number. That is not a
statement about album covers — it is a statement about the sentence.

**This is the most actionable result in the probe, and it is uncomfortable**, because
`GROUND_FREETEXT_SYNTHESIS.md` argues the figure/ground framing is the *right* question — the
one whose failure started this whole line of work. It turns out to be the one phrasing that
pointing models will not answer. Pointing models appear to be trained on a narrow imperative
form (`point to <noun phrase>`); elaborating the noun phrase into a relative clause takes the
prompt out of distribution and the model answers in prose instead.

**Corollary: neither model's silence is evidence about an image.** The scout's §3.1 called a
structurally-meaningful decline "the single most valuable property for our use" and expected
MolmoPoint's `no_more_points_class` to deliver it. Architecturally it does exist. Empirically,
in this run, the decline rate is dominated by phrasing, so it cannot be read as absence. Any
design that treats "the pointer declined" as "this cover has no ground" would be reading a
prompt-format artifact. **This retires the scout's headline hope for both models**, and it is the
finding I would least want lost.

### 5.2 Where MolmoPoint is genuinely better

- **It always parses.** 0 unparsed vs Qwen's 2. Its output is a token structure, not prose that
  happens to contain numbers, which is the mechanism difference the scout predicted.
- **It never landed on a face or a person** (0/28 vs 2/18), the one pre-registered
  correctness criterion that could be scored automatically.
- **It answers far more often** (28/45 vs 18/45) and on the plain phrasing it answered
  *every single cover* (15/15).
- **It returns more points per answer** (1.79 vs 1.39, max 5 vs 4), which is the plural capability
  the `krafty` and `000f0a78` cases need.
- **Its two working phrasings agree with each other more often**, on nearly three times as many
  comparable pairs (n=14 vs n=5).

### 5.3 Where Qwen is better, and it is not nothing

**Four times faster** (1.0 s vs 3.9 s per call — MolmoPoint's 24-crop prefill dominates, as the
scout predicted), needs **no download**, and produced the single cleanest multi-field result in
either run (`disney`, §3.3). For a full-width run over thousands of covers the 4x is not a
detail.

### 5.4 Verdict on the comparison

**MolmoPoint is the better pointer here, on every quality axis measured, and the architectural
argument the scout made from source held up.** But the margin is narrower than Point-Bench's
70.7-vs-58.5 would suggest, and the decisive limitation — the phrasing collapse in §5.1 — is
**shared**, so switching pointers does not address it.

---

## 6. Cost accounting

| Item | Actual | Scout's estimate |
|---|---|---|
| The coordinate gate | **~10 s, CPU, 0 GB** | ~2 min GPU, 0 GB |
| MolmoPoint download | **10.75 GB, ~4 min wall at 54 MB/s** | 10.77 GB |
| SAM load | 0.2 s (warm) | ~1 min |
| MolmoPoint load | ~15 s | ~1 min |
| Qwen load | 4.4 s | n/a |
| Qwen 45 generations | **43 s** | — |
| MolmoPoint 45 generations | **175 s** (3.9 s/call) | 4-15 min |
| SAM point decode | **11 ms** each | ~1-2 min total |
| Wiring A/B, 1,000 decodes | ~60 s | not budgeted |
| **Total GPU slot** | **~8 min** | 15-25 min |
| Disk after | 107 GB free (14% used) | ~103 GB free |

Under budget on every line. The scout's least-certain number — MolmoPoint generation speed — came
in at the fast end of its range. The gate came in at ~1% of its estimate by being moved off the
GPU entirely.

---

## 7. Honest verdict: does pointing -> SAM merit a full-width run?

**Not yet. One more small round first, and it is a cheap one.**

**What is settled and should be kept regardless:**
- SAM 3.1 point prompts work, at 98/100, in ~11 ms per decode on top of a cached backbone pass.
  That capability is now ours and it is independent of whether any pointer is good enough. The
  three mlx-vlm defects in §2.3 are found, measured and routed around.
- The coordinate convention is settled with evidence and the dangerous failure mode is documented.
- MolmoPoint is the pointer to use if a pointer is used.

**What is not settled, and blocks a full-width run:**
1. **Nobody has looked at these masks.** Every quality number above is a proxy: point-in-mask,
   not-on-a-face, phrasing agreement. The pre-registered PASS criterion — *"every returned point
   falls inside a region the reviewer's description names as ground, on ≥5 of 6"* — **requires a
   human** and was not scorable automatically. I am not going to claim a pass on proxies. This is
   the same limit `RESIDUAL_EXPERIMENT_NOTES.md` §11.10 records for the residual route.
2. **The best phrasing is the one that breaks (§5.1).** Before scaling, the phrasing space needs
   one more pass: plain imperatives with varied noun phrases (`point to the wall`, `point to the
   backdrop`, `point to the empty area`) rather than elaborated clauses. This is ~5 minutes of
   GPU and could plausibly move the answer rate more than switching models did.
3. **The controls did not cleanly pass** for Qwen (`00030075` declined 3/3). MolmoPoint's controls
   are better (10/15 calls, all 5 non-`skap` controls answered on the plain phrasing) but the
   scout's stop rule deserves to be honoured explicitly rather than waved past.
4. **The residual cross-check in the scout's §4.5 has not been run.** Pointing derives ground
   directly; the residual route derives it by subtracting everything nameable. Comparing the two
   on these covers is the highest-value next measurement and needs no new model — and per the
   synthesis we should *expect and want* disagreement on the three ambiguous covers. Agreement
   everywhere would be the suspicious result.

**Recommended order:** phrasing sweep (5 min GPU) -> reviewer round on the sheets (§8) -> residual
cross-check -> only then consider width.

---

## 8. Proposed reviewer round — NOT pushed

Proposed only. The orchestrator places it, and nothing below has been shown to anyone.

**Why a human is needed and a metric is not enough:** the question is *"is this pixel ground?"*,
the answer key is the reviewer's own prose, and three of the nine covers have no correct answer
at all. No proxy in §4.2 touches that.

**Shape.** Small, per the standing preference for frequent 4-10 item reviews over one big one.
**8 tiles**, from the MolmoPoint plain-phrasing run (the only condition that answered every
cover), plus the 4 covers where the two pointers disagree most.

**One question per tile:** *"The pink wash is what the model called background, grown from the
green dot. Is the dot on the background? Is the wash the background?"*
Answers: **dot right + wash right / dot right + wash wrong / dot wrong / can't tell.**

**The bar, fixed before any answer is seen:** carry pointing forward as a ground route only if
**dot right ≥ 6/8** *and* **dot-right-and-wash-right ≥ 4/8**. The dot and the wash are separated
deliberately: a correct point with a bad mask is a SAM problem, a wrong point is a pointer
problem, and the two have different fixes. Pooling them would hide which one we have.

**Explicitly not asked:** anything about the three ambiguous covers' correctness. For those the
only question worth putting is whether the reviewer finds the *committed* answer defensible.

---

## 9. Proposed ledger items — NOT placed

The scout proposed A-new and A-new+1 conditional on this probe. Both now resolve, and there are
three new ones. Proposed only; the orchestrator places them.

**A-new — CLOSE.** *"SAM point prompts are loaded on every run and never called."* Closed:
they are now called, from `oracle/sam/point_prompt.py`, at 98/100. Record that the capability is
ours and that no upstream patch was needed.

**A-new+1 — CLOSE.** *"The MLX point-prompt coordinate convention is untested and ambiguous."*
Settled: feature-grid coordinates, evidence in §1, artifact at
`data/sam/point-gate-coord-convention.json`. **Record the aliasing failure mode**, not just the
verdict — a wrong convention yields a confident mask in the wrong place, not an error.

**A-new+2 (NEW, sharp) — mlx-vlm's own point path is broken three ways.**
`Sam3VideoPredictor.add_point_prompt` / `_init_object` decode with the propagation decoder
(**1/100**), never compute the interactive FPN, and pass high-res skips in an order their own
shape guards reject. Sharp because it is a live, public, callable API that silently returns
garbage, and anyone reaching for "mlx-vlm supports point prompts" will find it. Worth an upstream
issue; the numbers in §2.3 are the report.

**B-new — REVISE, do not close.** The scout's *"a pointing specialist is available and has never
been tried"* is now tried. Replace with: **a pointing specialist works, is better than the
generalist on every quality axis, and is still blocked by a phrasing limitation both models
share.** Trigger for revisiting: the §7 phrasing sweep.

**B-new+1 (NEW, standing) — pointing models will not answer elaborated figure/ground prompts.**
14/15 declines on `point to the background surface behind the subject`, identically for two
independently-trained models. Consequence: **neither model's silence is evidence about an
image.** Trigger: any design that would read a pointer's refusal as an absence claim.

**Documentation corrections** — the scout's three stand and one is now measured rather than
inferred: `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:696-716` ("do not write prompts that depend
on spatial disambiguation") is correct for *concept* prompts and false for the model; point
prompts are the spatial-disambiguation mechanism, their weights were always in the snapshot, and
they now demonstrably work.

---

## 10. What would change my mind

- **If the reviewer round in §8 says the dots are mostly right**, then §7's caution was
  over-conservative and the phrasing sweep plus a residual cross-check is enough to justify width.
- **If the reviewer says the dots are right but the washes are wrong**, the problem is SAM's
  candidate selection, not the pointer, and §2.4's policy is the thing to work on — cheap, no
  pointer involved.
- **If the phrasing sweep in §7 recovers the figure/ground question under a plain imperative**,
  §5.1's finding is a prompt-format artifact with a workaround rather than a limit, and the
  scout's decline-as-signal hope partially revives.
- **If the residual route and the pointing route agree everywhere including the three ambiguous
  covers**, be suspicious of both, not pleased with either.

---

## 11. Deviations from the pre-registration, all deliberate

1. **The gate ran on CPU against the weights**, not on GPU against a rendered mask. Sharper,
   ~1% of the cost, and it settles the question exactly rather than by inspection.
2. **The wiring A/B was widened from 10 trials to 100** after 10 proved unable to separate
   conditions that differ by a few percent. The 10-trial version gave a confident wrong ranking.
3. **Prompts live in `pointing_covers.py`, not as frozen JSON in `premise/prompts/`.** The repo
   convention is frozen prompt documents with hashes; this is a probe, not a run, and
   `premise/prompts/` had uncommitted sibling work tonight that I was not going to touch. If
   pointing goes to width, the phrasings should be moved into the frozen-prompt convention first.
4. **`points on a figure` was scored against stored v4-noun SAM masks** rather than by eye. The
   scout's criterion named the reviewer's prose; this is a strictly narrower, objective proxy for
   the part of it that can be automated, and the rest is deferred to §8 rather than approximated.
5. **`skap` was added to the wiring smoke's cover set** (a non-square 1000x894 image) to make sure
   the coordinate conversion was exercised on a non-square frame. It was; nothing broke.

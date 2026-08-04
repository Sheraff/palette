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

---

# 12. The phrasing sweep — 2026-08-04, later the same day

**Appended, not merged.** Everything above is the probe as it was written and is left untouched,
including the places this sweep shows were too narrow. **Pre-registered in
`POINTING_PHRASING_PREREG.md`** — candidates, scoring, pick rule and the reviewer-round bar were all
fixed in that file before a model was loaded. This section reports against that registration.

**GPU:** single-owner slot, `pgrep` clean before starting. **Total 11.1 min** (§12.7). **No download.**

## 12.1 The one-page answer

| | |
|---|---|
| Does a phrasing recover the figure/ground question? | **No. Not one.** Every phrasing that asks it lands at 0-4 of 15 (§12.3). |
| Then what breaks it — the relative clause, or the noun? | **Both, independently and about equally.** The probe conflated two changes; separated, each one alone is nearly as destructive as the pair (§12.3). This is the sweep's real finding. |
| Did anything clear the pre-registered bar? | **Yes, two — `plain` and `backdrop`** (§12.2). |
| Which was picked? | **`plain`, the incumbent**, on the pre-registered cross-model tie-break. **The sweep searched the phrasing space and found no improvement** (§12.4). |
| Was the round built and pushed? | **Yes** — `pointing-ground-1`, 8 tiles, live on 3010 (§12.6). |
| Did the automatic on-ground proxy separate anything? | **No — and that matters** (§12.5). |

## 12.2 The sweep table

8 phrasings x 15 covers x 2 pointers = 240 calls. `ans` = calls returning >=1 in-frame point;
`dec` = explicit decline; `unp` = unparsed; `onFig` = point inside a stored `person`/`face` mask on
the 11 decidable covers (the pre-registered FAIL condition); `ctrl` = of the 5 non-`skap` controls.

**MolmoPoint-8B-8bit** — the model the pick is decided on:

| phrasing | ans | dec | unp | onFig | ctrl | answer rate | on-ground | score | CLEARS |
|---|---|---|---|---|---|---|---|---|---|
| `plain` — *point to the background* | **15/15** | 0 | 0 | 0 | 5/5 | 1.000 | 1.000 | **1.000** | **YES** |
| `backdrop` — *point to the backdrop* | **15/15** | 0 | 0 | 0 | 5/5 | 1.000 | 1.000 | **1.000** | **YES** |
| `empty_area` — *point to the empty area* | 15/15 | 0 | 0 | 0 | 5/5 | 1.000 | 1.000 | 1.000 | ineligible |
| `wall` — *point to the wall* | 6/15 | 9 | 0 | 0 | 1/5 | 0.400 | 1.000 | 0.400 | ineligible |
| `surface` — *point to the background surface* | 4/15 | 11 | 0 | 0 | 0/5 | 0.267 | 1.000 | 0.267 | - |
| `fg_minimal` — *point to the background behind the subject* | 3/15 | 12 | 0 | 0 | 1/5 | 0.200 | 1.000 | 0.200 | - |
| `fg_full` — *point to the background surface behind the subject* | 1/15 | 14 | 0 | 0 | 0/5 | 0.067 | 1.000 | 0.067 | - |
| `behind` — *point to what is behind the subject* | **0/15** | 15 | 0 | — | 0/5 | 0.000 | — | 0.000 | - |

**Qwen3-VL-30B-A3B-6bit** — run for the cross-model tie-break only:

| phrasing | ans | dec | unp | onFig | ctrl | answer rate |
|---|---|---|---|---|---|---|
| `plain` | **11/15** | 2 | 2 | 1 | 4/5 | 0.733 |
| `backdrop` | 7/15 | 4 | 4 | 0 | 3/5 | 0.467 |
| `surface` | 6/15 | 7 | 2 | 0 | 1/5 | 0.400 |
| `empty_area` | 5/15 | 10 | 0 | 0 | 1/5 | 0.333 |
| `wall` | 3/15 | 12 | 0 | 0 | 0/5 | 0.200 |
| `fg_full` | 1/15 | 14 | 0 | 0 | 0/5 | 0.067 |
| `fg_minimal` | **0/15** | 14 | 1 | — | 0/5 | 0.000 |
| `behind` | **0/15** | 14 | 1 | — | 0/5 | 0.000 |

**The probe replicates exactly, on a different day and a fresh process.** Qwen `plain` came back
11 points / 2 declines / 2 unparsed — the probe's §3.2 row to the digit. Qwen `fg_full` 1/15 and
MolmoPoint `fg_full` 1/15 — the probe's §5.1 row to the digit. MolmoPoint `plain` 15/15 — the probe's
§5.2 claim to the digit. At temperature 0 these models are reproducible across runs, which is worth
knowing before anyone treats a single future run as noise.

## 12.3 The mechanism — what actually breaks the figure/ground sentence

The probe's failing prompt changed **two** things at once against the working one: it added a
prepositional phrase (`behind the subject`) *and* elaborated the head noun (`background` ->
`background surface`). §5.1 attributed the collapse to the figure/ground framing as a whole. The 2x2
separates them, on MolmoPoint:

| | noun **not** elaborated | noun elaborated |
|---|---|---|
| **no** PP | `plain` **15/15** | `surface` **4/15** |
| **+ PP** `behind the subject` | `fg_minimal` **3/15** | `fg_full` **1/15** |

**Neither factor is the culprit; the bare noun phrase is the whole load-bearing thing.** Adding two
words of noun (`surface`) costs 11 of 15 answers on its own, with no figure/ground content
whatsoever. Adding the prepositional phrase costs 12 of 15 on its own. Together, 14. The effects are
roughly equal and close to saturating individually.

**So §5.1's finding was right about the fact and wrong about the cause**, and the correction is the
more general and more useful statement:

> Pointing models answer **bare noun-phrase imperatives** — `point to the <noun>`. *Any* elaboration
> past that collapses the answer rate: a relative clause, an added head noun, or a relation with no
> ground noun at all. It is not about figure/ground. Figure/ground merely cannot be expressed
> without elaboration, which is why it looked like the cause.

The sharpest single number is **`behind` — `point to what is behind the subject` — 0/15 on both
models, the only phrasing in the sweep that never answered once.** That is the figure/ground
relation stated with no ground noun to point at, and it is unanswerable to both pointers. The
capability is noun-directed; it has no relational mode to reach for.

**Consequence for the route.** The question `GROUND_FREETEXT_SYNTHESIS.md` §6 says actually
matters — *which pixels are ground* — is a **relational** question. This sweep is the second
independent measurement that the pointing route cannot be asked it, and it now says so
mechanistically rather than by one failing sentence. Pointing can be asked *"where is the
background?"*; it cannot be asked *"what is behind the subject?"*. Those are not the same question,
and the synthesis is explicit that the second is the one that broke.

## 12.4 The pick, by the pre-registered rule

Two phrasings cleared on MolmoPoint (`plain`, `backdrop`), both at a combined score of exactly
1.000 — a tie, because both answered every cover with zero on-figure points.

Pre-registered tie-break #2 is the **Qwen answer rate**, on the stated reason that a phrasing which
works on two independently-trained models is a fact about the sentence rather than about one
model's training set. `plain` 11/15 vs `backdrop` 7/15.

> **THE PICK: `plain` — `point to the background`. The incumbent.**

**Stated plainly, as the pre-registration required: the sweep found no improvement.** The phrasing
space proposed in §7.2 was searched — four new noun phrases and a factorial — and the sentence the
probe was already using survived it. `backdrop` matched it on MolmoPoint and is **not** cross-model
robust (15/15 vs 7/15), which is exactly the failure mode tie-break #2 exists to catch.

**What was retired:** §7.2's hope that "this is ~5 minutes of GPU and could plausibly move the
answer rate more than switching models did". It did not move the answer rate at all. It bought the
mechanism in §12.3 instead, which is worth more.

### The willingness diagnostic, and an honest mixed reading

`wall` and `empty_area` were pre-registered as ineligible-but-run: nouns that are factually false on
most album covers, where **a high answer rate is evidence against the route**, not for it.

- **`empty_area` answered 15/15 on MolmoPoint** — every cover, including covers with no empty area.
- **`wall` answered only 6/15** (3/15 on Qwen).

These pull in opposite directions and the honest reading is the weaker one. If the model pointed at
any noun it was handed, `wall` would also be 15/15; it is not, so there **is** image conditioning.
But "empty area" is a vaguer noun than "wall" and is arguably locally true of most covers, so its
15/15 is not clean evidence of a prior either. **The diagnostic did not resolve.** It is reported
because it was pre-registered, and it is not being read as support for the route.

## 12.5 The automatic on-ground proxy did not discriminate — and that is the finding

Look down the `on-ground` column of §12.2: it is **1.000 for every phrasing on MolmoPoint** and near
it on Qwen. Across 120 MolmoPoint calls, **zero** points landed inside a stored `person`/`face`
mask. On Qwen, one did.

The combined score was therefore driven **entirely by the answer rate**; the correctness half
contributed nothing to any comparison. That is not a good result dressed as a caveat — it means:

> **The only correctness criterion available without a human cannot tell a good ground point from a
> bad one.** It only catches the crudest failure — landing on a face — and no phrasing in this sweep
> ever committed it.

This is the strongest possible argument for §7.1's position and the reason the reviewer round is
not optional. Every number in §12.2 could be identical whether the dots are on ground or merely off
faces, and nothing in the instrument can tell those apart.

**A second limitation, recorded honestly.** The three prose-derived bonus checks (§PREREG 3 —
points in both halves of `00014fb4`, two of three bands of `000f0a78`, three quadrants of `disney`)
**could not fire on the picked phrasing**: MolmoPoint returned exactly **one point per answer** on
both `plain` and `backdrop`, and all three checks need two or more. They are scored 0/3, and that
zero is **structurally unfirable, not a negative result**. The plural capability the probe measured
(1.79 points/call) came from the probe's *plural* phrasing, which this sweep did not carry. Qwen's
`plain` did fire one (1/2). If the multi-field cases matter, they need a plural prompt, and the
pick is a singular one — an open trade, not a settled one.

## 12.6 The reviewer round — BUILT and PUSHED

`pointing-ground-1`, live on `http://127.0.0.1:3010/`, **8 tiles, 1 question, 4 answers**, open.

**Composition** — exactly the pre-registration, no discretion exercised at build time:
the 6 palette-decidable misfit covers (`00014fb4`, `00030075`, `00066a61`, `00075841`, `000f0a78`,
`artofficial`) plus the 2 covers where the pick and its closest rival produced the most different
masks: **`elephunk` (mask IoU 0.246)** and **`0002dfdc` (0.409)**. The three ambiguous covers are
deliberately absent — they have no correct answer and asking would manufacture one.

**The panel:** two panels, left the bare artwork, right the same artwork with the SAM mask as a pink
wash and the prompted pixel as a green dot. **No caption, no area number, no phrasing, no model name
on the panel** — telling the reviewer what the model thought would measure the label, not the mask.

**The question**, carried from §8 and re-fixed in the pre-registration:
*"The pink wash is what the model called the background. It was grown from the green dot — the
single pixel the model pointed at. Is the dot on the background? Is the wash the background?"*
Answers on digits `1`-`4`: dot right + wash right / dot right + wash wrong / dot wrong / can't tell.
Digits deliberately: `review-ui/oracle.js:322` resolves an answer hotkey **before** falling through
to `u` (undo) and `r` (release), so a letter hotkey can make release unreachable.

> **THE BAR, fixed in `POINTING_PHRASING_PREREG.md` §5 before any answer was seen:** carry pointing
> forward as a ground route only if **dot-right >= 6/8** **and** **dot-right-and-wash-right >= 4/8**.

**Gates, all green:**

| check | result |
|---|---|
| push | `201 {"batchId":"pointing-ground-1","itemCount":8}` |
| `verify-live` | **OK** — 28 pages, 11 modules, 18 batches, 75 requests |
| live-payload key smoke, this batch | **pass** — `token,questionKey,media,width,height,answer,revision`; answers `1..4` |
| answer-key leak scan of the live payload | **none** (10 forbidden manifest fields, string-scanned) |
| media | `200 image/png 774,571 bytes` |
| live-payload key smoke, all batches | **12/12 oracle-validation** (the other 6 are `calibration`/`mechanism`, a different payload shape, out of scope) |
| review-ui modules added or changed | **none** — the round runs on the incumbent `oracle.js`, and `oracle.js:322` uses `normalizeKey(event.key…)`, not the `freetext.js` defect form |

**The one part of the freetext.js convention I could not perform:** L-i's "press one answer hotkey
yourself before handing the URL over" needs a browser. I did not press a key, because the only way
to exercise the live answer path from a shell is to record a real answer into the open round, which
would corrupt it. What is asserted instead: no `review-ui` module was added or changed, so the
keyboard path is the incumbent one that 12 oracle batches have been answered through, and the
specific defect L-i names is statically absent from it. **Flagging it rather than claiming it.**

**Watch command — reported, NOT started, per the task:**

```
NODE_NO_WARNINGS=1 nohup node --experimental-strip-types \
  research/v3/src/review-server/watch-batch.ts --batch pointing-ground-1 \
  >/tmp/watch-pointing-ground-1.log 2>&1 &
```

## 12.7 Cost, and an operational finding worth more than the minutes

| item | actual |
|---|---|
| MolmoPoint, 120 calls | 8.2 min pointer time (8.6 min wall) |
| Qwen, 120 calls | 2.1 min pointer time (2.5 min wall) |
| **total GPU slot** | **11.1 min** — inside the ~20 min stop, above the ~11 min estimate by rounding |

**`common.load_sam()` sha256-hashes the 3.5 GB weights file BEFORE its own timer starts.** Every
note in this file reporting a "0.2 s" or "~1 min" SAM load has been quoting `load_seconds`, which
**excludes that hash**. Measured here: the first load cost **~8 minutes of wall clock** — most of it
the hash plus a one-time MLX Metal kernel compile — against a reported `load_seconds` of 0.2. The
second run, with `--no-verify-weights` and the Metal cache warm, loaded in **0.2 s wall**.

Nothing is wrong with the check; the verification is worth having. What is wrong is the **number
everyone has been quoting**. Anyone budgeting a SAM job from `load_seconds` will under-budget the
first load of a session by an order of magnitude. Recorded here so it is not rediscovered as a hang
— it looks exactly like a wedged process: low CPU, flat RSS, no output for minutes.

## 12.8 Ledger items — proposed, NOT placed

**B-new+1 — REVISE, urgently.** The standing entry reads *"pointing models will not answer
elaborated figure/ground prompts"*. That is true but attributes the failure to the wrong thing.
Replace with: **pointing models answer bare noun-phrase imperatives only; any elaboration — added
head noun, relative clause, or a relation with no ground noun — collapses the answer rate, and the
figure/ground question is unaskable because it cannot be phrased without one.** Evidence: the 2x2 in
§12.3 and `behind` at 0/15 on both models. The consequence already recorded — *neither model's
silence is evidence about an image* — stands unchanged and is now better founded.

**B-new — REVISE.** Its trigger was "the §7 phrasing sweep". The sweep has run: the phrasing space
was searched and the incumbent survived. The pointer question is settled as far as prompting can
settle it; what remains is whether the dots are right, which is `pointing-ground-1`.

**A-new+3 (NEW) — `load_sam`'s reported load time excludes a multi-minute weights hash.** §12.7.
Small, operational, and it has already cost one agent eight minutes of a single-owner GPU slot
spent wondering whether a process was wedged.

**A-new+4 (NEW, and the one that should worry us) — the pointing route has no automatic
correctness signal.** §12.5: the only human-free criterion is "not on a face", it fired zero times
across 120 calls, and it therefore cannot rank phrasings, cannot rank models, and cannot be a gate.
Every comparison in this document and the probe above it is an **answer-rate** comparison wearing a
correctness label. Trigger: any proposal to scale pointing on the strength of a measured number.

## 12.9 What would change my mind

- **If `pointing-ground-1` clears the bar**, §12.5's worry is over-stated — the proxy is blind but
  the dots are right anyway — and the residual cross-check (§7.4) becomes the next measurement.
- **If dots are right and washes are wrong**, it is SAM candidate selection (§2.4), not the pointer,
  and it is cheap to work on. This is the outcome the two disagreement tiles are there to catch.
- **If dots are wrong on the decidable six**, the route is done: the phrasing space is searched, the
  better pointer is already in use, and there is nothing left to turn.

## 12.10 Deviations from the pre-registration

1. **`--no-verify-weights` was added mid-run and used for the Qwen pass**, after the first load cost
   ~8 min (§12.7). The same file was verified against the same pin minutes earlier in the same
   session. Recorded in the Qwen output as `weights_sha256_verified_this_run: false`, so no row
   claims a check it did not get.
2. **The all-batches key smoke is reported as 12/12 over oracle-validation batches**, not 18/18. The
   6 excluded are `calibration`/`mechanism` batches whose payload shape my assertion does not
   describe. Reporting 12/18 would have been a false alarm; silently asserting over 18 would have
   been a false pass. Scope stated instead.
3. **No keypress was performed against the live page** (§12.6), with the reason and the compensating
   argument stated rather than the check quietly dropped.

---

# 13. `pointing-ground-1` scored — 2026-08-04

**The round the whole pointing line was built toward. It did not clear its bar.**
Scored by a different agent from the one that built and pushed it; that agent stalled and died
after committing `8c769ec` and never reported. Nothing of its work was orphaned — see §13.7.

## 13.1 The one-line answer

**Bar NOT cleared.** The dot half passed, the wash half failed by one tile, and the bar was a
conjunction.

| criterion | observed | bar | result |
|---|---|---|---|
| dot-right | **7/8** | >= 6/8 | PASS |
| dot-right-and-wash-right | **3/8** | >= 4/8 | **FAIL** — by one tile |

`dot right + wash right` 3 · `dot right + wash wrong` 4 · `dot wrong` 1 · `can't tell` 0.

## 13.2 Two disclosures that govern every number above, and they pull opposite ways

The reviewer disclosed **after answering**, verbatim:

> "i reviewed the pointing-ground-1 set, since it ran on mostly 'extremely hard background'
> artworks, i answered as 'could this be considered correct' and not 'is this correct', results
> might be way better in other artworks but here it wasn't amazing."

**(1) The criterion was lenient, so every rate is a CEILING, not an estimate.** The reviewer
answered *could this be considered correct*, not *is this correct*. The bar in
`POINTING_PHRASING_PREREG.md` §5 was written for the strict reading. So the true strict rates are
**at most** 7/8 and **at most** 3/8. This cuts asymmetrically and it matters: **a fail under a
lenient criterion is a robust fail** — the strict number can only be lower — while **the 7/8 dot
pass is NOT a robust pass**, because it was bought at the generous reading.

**(2) The sample is the hard stratum, and nothing here generalizes.** The six decidable tiles are
*exactly* the covers where this same reviewer had earlier pressed **none discernible** in
`cascade-ground-truth-1` (`oracle/premise/GROUND_FREETEXT_SYNTHESIS.md`). This round measures the
misfit tail and only the misfit tail. The reviewer says plainly that other artworks may be better,
and this round has no evidence either way, by construction.

**(3) The qualitative anchor is "it wasn't amazing."** No reading of these numbers is to be carried
above that sentence. 3/8 on the composite is not a near-miss to be talked upward.

## 13.3 The bar was genuinely pre-registered — provenance, since it was asked

**The pre-registration is on disk and in git.** `POINTING_PHRASING_PREREG.md` §5, committed in
`8c769ec` at **2026-08-03T23:25:31Z**. The first answer was recorded at **2026-08-03T23:42:23.804Z**
and the batch completed at **23:43:43.168Z**. The bar was in version control **16 min 52 s before
the reviewer's first keypress**. This scoring is pre-registered. It is **not** post-hoc.

> **THE BAR, verbatim:** carry pointing forward as a ground route only if **dot right >= 6/8** and
> **dot-right-and-wash-right >= 4/8**.

## 13.4 Per cover

Answers read through the warehouse CLI with supersession respected:

```
node --experimental-strip-types research/v3/src/warehouse/cli.ts query \
  --batch pointing-ground-1 --json --latest --no-retracted --limit 500
```

then filtered to `type == oracle-label` and `author.kind == human`. **8 labels, all revision 1, no
`supersedes`, raw count equals latest count — nothing was re-graded, retracted or superseded.**

| cover | stratum | answer | dot | wash |
|---|---|---|---|---|
| `00030075` | decidable-six | dot right, wash right | ✓ | ✓ |
| `artofficial` | decidable-six | dot right, wash right | ✓ | ✓ |
| `00014fb4` | decidable-six | dot right, wash wrong | ✓ | ✗ |
| `00066a61` | decidable-six | dot right, wash wrong | ✓ | ✗ |
| `00075841` | decidable-six | dot right, wash wrong | ✓ | ✗ |
| `000f0a78` | decidable-six | dot right, wash wrong | ✓ | ✗ |
| `0002dfdc` | phrasing-disagreement (IoU 0.409) | dot right, wash right | ✓ | ✓ |
| `elephunk` | phrasing-disagreement (IoU 0.246) | **dot wrong** | ✗ | ✗ |

**By stratum, and this is the finding:**

| stratum | n | dot-right | both-right |
|---|---|---|---|
| decidable-six — *the only tiles with an answer key* | 6 | **6/6** | **2/6** |
| phrasing-disagreement | 2 | 1/2 | 1/2 |

**The pointer did not miss once on the six covers that have an answer key.** All four decidable-six
failures are the wash alone. The single `dot wrong` in the entire round is `elephunk` — the
largest-mask-disagreement tile, at IoU 0.246, which is precisely the failure those two tiles were
placed to catch.

## 13.5 Which pre-registered branch fired

§12.9 wrote the readings down in advance. **Branch 2 fired, verbatim:**

> "If dots are right and washes are wrong, it is SAM candidate selection (§2.4), not the pointer,
> and it is cheap to work on. This is the outcome the two disagreement tiles are there to catch."

**Branch 3 did not fire:** "If dots are wrong on the decidable six, the route is done" — dots were
6/6 there. The route is not done on the pointer's account.

That distinction was written before the answers *precisely so it could not be manufactured after
them*. It is the reason this is not scored as `route-dead`.

## 13.6 Verdict — `route-alive-pending-typical-strata-probe`

**Said plainly first: THE BAR FAILED.** "Alive" means only *not killable on this evidence*. It does
**not** mean the route works, and it does **not** license carrying pointing forward as a ground
route — the pre-registration's consequence clause is unmet and it stands.

- **Not `route-dead`**, because the pointer cleared its half and missed zero of six on the stratum
  with an answer key. Every decidable failure is SAM's mask growth. Recording pointing as dead for a
  SAM candidate-selection defect would blame the wrong component.
- **Not `unresolved`**, because the round is fully answered (8/8, no can't-tells, no supersession)
  and scored against a bar that provably predates it. The result is not missing. It is a fail with a
  localized cause.

**Recommendation — do not scale pointing, and do not spend the next GPU slot on it.**

1. **Work the wash on CPU, from masks already on disk.** Four of six decidable covers are
   dot-right/wash-wrong. The point, the candidates and the chosen mask are all already recorded; why
   the grown mask is wrong needs no new inference. Cheapest available move, and the evidence points
   straight at it.
2. **Only then the typical-strata probe** (§13.8). Running it first would measure the same wash
   defect on easier images and return a flattering number that decides nothing.
3. **Do not revisit phrasing.** 240 calls searched the space, the incumbent survived, and §12.3
   explains why there is nothing left to turn.

**Against the obvious spin:** the temptation is to lead with dot-right 7/8. Leading with the half
that passed, when the conjunction failed and the passing half is a lenient ceiling, would misreport
the round.

## 13.7 What the builder agent left — recovered state

The agent that ran the sweep and pushed the round **stalled and died before reporting**. Checked:

- **It committed everything.** `8c769ec`, 9 files, 9,770 insertions — the two sweep result sets, the
  round fixture and sample, both new scripts, the fixture builder, the pre-registration, and its
  §12 notes append.
- **Nothing was orphaned.** No untracked files under `research/v3/`, and `POINTING_PROBE_NOTES.md`
  was byte-identical to HEAD before this section was appended.
- **The staged set in the index is unrelated parked work** (residual cuts, dynamic concepts,
  oracle-premise) and was left untouched. This section and the analysis JSON were committed by
  explicit pathspec.
- Its `--write` claim holds: the round panels are gitignored build artifacts, as with round 3b.

## 13.8 The typical-strata probe — SPECIFIED, NOT RUN

**Not run: the GPU is held by another task.** Nothing in this scoring pass used GPU.

**Question:** does the wash failure rate measured here on the misfit covers hold on ordinary covers,
or is it a property of the hard tail? This round cannot answer it — it contains no typical covers.

- **Sampling:** at random from the general corpus with the misfit set **excluded by id**, so the two
  strata are disjoint. Stratify on nothing else — further stratification would reintroduce exactly
  the selection problem this round suffers from.
- **n = 16 minimum.** n=8 was tolerable for a route already under suspicion; a *generalization*
  claim needs more. 16 keeps one reviewer under ~10 min at the observed ~11 s/tile.
- **Unchanged, deliberately:** phrasing `plain`, MolmoPoint-8B on the same pin, the identical panel
  (no caption, no number, no phrasing, no model name), and the question and four answer keys
  **verbatim**. Any wording change breaks comparability with this round.
- **Answer-key caveat:** typical covers have no `ground-freetext-1` prose behind them, so there is
  no independent key. The probe measures reviewer judgement only and must be labelled that way.
- **REQUIRED, and this is the lesson of §13.2:** the round's own framing text must tell the reviewer
  explicitly to answer **"is this correct"** and *not* "could this be considered correct". This
  round's lenience went undeclared until afterwards and cost it its interpretability. Without that
  instruction the two rounds are not comparable at all.
- **Pre-register before pushing:** the bar as a conjunction in the same dot/wash split; the exact
  comparison against this round's 7/8 and 3/8 — **noting that this round's numbers are lenient
  ceilings and the new round's would not be, so the comparison is biased AGAINST the new round and a
  tie should be read as an improvement**; and the decision that follows each outcome.
- **Cost:** 16 pointer calls + 16 SAM segmentations, well under 2 min pointer time at the measured
  rate. **Budget the SAM load separately and honestly** — §12.7: `common.load_sam()` sha256s 3.5 GB
  before its own timer starts, the first load of a session costs ~8 min wall, and it presents exactly
  like a wedged process.

## 13.9 The caveat this round was supposed to retire, and did not

§12.5 recorded that the only human-free correctness signal (not-on-a-face) fired **zero** times in
120 MolmoPoint calls and therefore separated nothing — every automatic comparison in this document
is an answer-rate comparison wearing a correctness label. **This round is the first actual
correctness measurement of the pointing route, and it did not clear its bar.** The caveat stands,
and it now has a human number behind it rather than a proxy.

**Also standing:** n = 8. Every rate here carries a confidence interval far wider than the one-tile
margin by which the composite failed. The fail is a fail — a lenient ceiling below the bar is not an
artifact of margin — but the 7/8 dot rate is not a precise number either.

# 14. The wash, diagnosed on CPU — 2026-08-04

**§13.6 recommendation 1, executed: work the wash from masks already on disk, no GPU.** It
turned out to be executable only in part, and *why* is the most useful thing this section has
to say.

## 14.1 The one-page answer

**The wash has two distinct failure shapes, not one, and they want opposite repairs.**

| | |
|---|---|
| under-coverage — the mask is one region of a ground the reviewer describes as several | `00014fb4`, `000f0a78`, `00075841` |
| over-coverage — the mask is the whole frame, subject included | `00066a61` |
| under-coverage the recorded points cannot reach at all | `artofficial` |

**And the counterfactual the round most needed cannot be answered from disk.** §13.6 assumed
"the point, the candidates and the chosen mask are all already recorded." The first and third
are. **The candidates are not.** `pointing_phrasing_sweep.py:198` writes
`common.rle_encode(seg.best_mask)` and nothing else; `pointing_probe.py:267-275` writes scalars
and no mask at all. Across every pointing run ever made, on every cover, the three unselected
candidate masks were discarded. So *"was a better candidate available from the shipped point"* —
the question that decides selection-defect versus model-limit — **is not answerable without new
inference**, and this pass ran none.

What replaced it: the recorded set holds 3-10 *different points* per cover, each with its own
selected mask. That bounds what the current pipeline can reach at the **point** level, which is
a weaker claim than candidate-level and is labelled as such everywhere below.

## 14.2 The answer key, and its honest status

The six decidable covers have the reviewer's own prose (`GROUND_FREETEXT_SYNTHESIS.md`). I turned
each description into one machine-checkable predicate — e.g. `00014fb4` "green on the left and red
on the right" becomes *covers >= 25% of the left half AND >= 25% of the right half*. All six are in
`data/sam/pointing-wash-prereg.json`, written before anything was scored.

**These predicates are mine, not the reviewer's.** He never saw them and has not ratified them.
Their one validation is that they reproduce his wash verdict on **5 of 6** covers. The single
disagreement is `artofficial`: he passed a mask covering 0.289 of a frame whose ground he describes
as *everything except one face* (~0.87 by the figure-complement proxy). That is §13.2's lenient
criterion visible in one number, and it is exactly the direction §13.2 predicted — so I report the
mismatch rather than loosening the predicate to absorb it.

## 14.3 Per cover — the diagnosis table

`plain` is the shipped mask; area is the fraction of frame.

| cover | reviewer wash | shipped `plain` | why it fails | best single recorded mask | classification |
|---|---|---|---|---|---|
| `00030075` | ✓ | 0.306 | — (passes) | — | **already-passing** |
| `00014fb4` | ✗ | 0.206 (L 0.17 / R 0.24) | took one patch of the green field; the red field is absent | `fg_minimal` 0.589 (L 0.52 / R 0.66) **passes** | **better-candidate-existed** |
| `000f0a78` | ✗ | 0.630 (top¼ 0.31 / bottom½ 0.97) | took the red band only; the black and champagne bars are absent | `backdrop` 0.683 (top¼ 0.65 / bottom½ 0.71) **passes** | **better-candidate-existed** |
| `00066a61` | ✗ | 0.896, leaves out 2% of the logo | swallowed the subject | none — **all four** recorded masks are >= 0.87 | **over-coverage, no point-level escape** |
| `00075841` | ✗ | 0.406 (top 15% 0.47 / bottom 20% 0.08) | took the banner, missed the floor | none passes, but MolmoPoint finds the banner (0.47) and Qwen finds the floor (0.76) — **different regions, different pointers** | **multi-region, not reachable** |
| `artofficial` | ✓ (lenient) | 0.289 | ground is ~0.87 of the frame; every recorded mask is <= 0.345 | none — union of all seven reaches 0.499 | **no good candidate** |

**Counts:** already-passing 1 · better-candidate-existed 2 · over-coverage-no-escape 1 ·
no-good-candidate 2 (of which `00075841` is multi-region and near). n = 6.

**The two `better-candidate-existed` covers are the load-bearing finding.** On both, a mask that
satisfies the reviewer's own description was produced by this exact pipeline, on this exact cover,
on the same day — from a different point, and thrown away. The ground was reachable and the policy
did not reach it.

## 14.4 What the four candidates look like, from the one file that kept them

`point-smoke-synthetic.json` stored `candidate_areas[4]`, `candidate_ious[4]`,
`candidate_contains[4]` — scalars, no pixels — for 1000 rows over four covers. It is the only
candidate-level evidence in the campaign. **Caveat first: synthetic probe points, and only
`0002dfdc` of the four is in the round. No correctness claim can come out of it.** What it does
show:

- the candidate family spans a **mean 0.204 area range** — the four masks are a nested
  part/field/whole-frame ladder, so *which rung you take is most of the answer*;
- `SELECT_CONTAINING` and the new `SELECT_GROUND` **pick different rungs on 43.5% of rows**;
- median area picked moves **0.147 -> 0.270**.

That is a mechanism argument for the band, not a measurement of it. It is written down as such.

## 14.5 What changed in `point_prompt.py`

1. **`SELECT_GROUND`** — among candidates containing every foreground point *and* inside
   `[GROUND_MIN_AREA 0.05, GROUND_MAX_AREA 0.85]`, take the **largest**; fall back to the largest
   containing candidate under the cap, then to `SELECT_CONTAINING`. §2.4 already measured that
   predicted IoU ranks these candidates badly, so this replaces a known-bad ranker with a prior
   rather than with another ranker.
2. **`segment_ground_union()`** — one mask per point, drop the inadmissible, union the rest; if the
   union breaks the cap, fall back to the largest admissible single mask. Segmenting each point
   separately is deliberate: a multi-point prompt asks SAM for *one object containing all the
   points*, and a black bar plus a champagne bar plus a red field is not one object. The backbone
   runs once, so K points cost K decoder calls.
3. **`PointSegmentation.candidate_records()`** — serialises all K candidates, with pixels when
   handed an encoder. **This is the change that matters most**, and it is pure instrumentation: its
   absence is what made §13.6's own recommendation only half-executable. Three extra RLE strings
   per call would have bought the counterfactual this section had to work around.

**`DEFAULT_SELECTION` is deliberately unchanged, and stays `containing`.** See below for why.

## 14.6 In-sample before/after — and it is in-sample, flatly

The band and the predicates were both written **after** looking at the eight shipped masks'
geometry, on n=6, on the hard stratum, against an answer key I wrote. This is a repair fitted to
the failures it repairs.

| policy | covers passing | |
|---|---|---|
| R0 shipped (`plain`, `SELECT_CONTAINING`) | **1/6** | the incumbent |
| R1 union of all admissible masks *(pre-registered)* | 2/6 | +`00014fb4` +`000f0a78`, **−`00030075`** |
| R2 greedy union under the cap *(post-hoc)* | 2/6 | |
| R3 pixel majority vote *(post-hoc)* | 2/6 | |
| R4 largest admissible single mask *(post-hoc)* | **3/6** | the point-level analogue of `SELECT_GROUND` |

**No rule cleared 4/6, which would have been §13's bar.** And the pre-registered one, R1, **broke a
cover that was already passing**: `00030075` is a single 30% wall, the other phrasings' points landed
on the floor and the ceiling, and their union is the whole room at 0.802. That is not a tuning
detail — *a rule that assembles a multi-region ground and a rule that leaves a single-region ground
alone are in genuine tension*, and nothing in a point or in a candidate ranking says which case you
are in. This is the same gap `GROUND_FREETEXT_SYNTHESIS.md` §6 names as the deepest one, arriving
from the other direction, and it is an argument for the residual route rather than for more
point-prompt engineering.

**An oracle bound, to separate "needs more points" from "unreachable":** allowing the best union of
*any two* recorded masks, chosen with knowledge of the answer, `00014fb4`, `00030075` and `000f0a78`
become reachable and `00066a61`, `00075841`, `artofficial` **do not**. Half the failures are not a
point-count problem.

**Why the default did not move.** Promoting `SELECT_GROUND` on 3/6-vs-1/6, in-sample, n=6, hard
stratum, analyst-authored key, is precisely the error §13 exists to prevent. The default moves when
the typical-strata probe says so.

## 14.7 The probe spec, refined — still SPECIFIED, NOT RUN

§13.8 stands unchanged in sampling, n=16, phrasing `plain`, panel, question and answer keys. Three
additions, all forced by what is above:

1. **Persist every candidate.** `candidate_records(rle_encode=common.rle_encode)` on every call.
   Without it the next round inherits the same blind spot and the candidate-level counterfactual
   stays unanswerable. Non-negotiable, and it is why the helper was written.
2. **>= 3 points per cover** — repeat the `plain` call, or take the pointer's own multiple points
   where it emits them (MolmoPoint returned exactly one point on every answer in the sweep:
   `mean_points_per_answer` 1.0, so repetition is the realistic route). Three of six grounds here
   are several disjoint regions and one point provably cannot cover them.
3. **Score the washes as separate tiles: `SELECT_CONTAINING` vs `SELECT_GROUND` vs
   `segment_ground_union`, on identical points.** The dot is then constant across the three and the
   reviewer's keypress separates *the policies* rather than the pointer — which is the comparison
   §13's dot/wash split was built to make and could not.

**Pre-register before pushing, and carry §13.8's own warning forward:** this round's rates are
lenient ceilings, the new round's must be strict ("is this correct", stated in the framing text),
so the comparison is biased against the new round and a tie reads as an improvement.

## 14.8 What would change my mind

- **A candidate-level counterfactual that comes back empty.** If, with candidates persisted, the
  four masks from the *shipped* point never contain a better ground on the failing covers, then
  `SELECT_GROUND` is treating a model limit as a selection defect and the whole §14 framing is
  wrong. This is the check that has never been run and the one addition 1 exists to enable.
- **`00030075` breaking on the typical strata.** If the union rule costs more single-region covers
  than the multi-region covers it buys, the union is a loss and should be dropped rather than
  tuned.
- **The residual route producing a ground with purity.** If it does, none of this is worth
  continuing: it answers *which pixels are ground* directly, which is the question §14.6 shows the
  point prompt cannot reach.

**The anchor from §13 stands unmoved: "it wasn't amazing."** Nothing here raises it. Two covers of
six had a better mask sitting in the recorded set, and that is a real defect worth fixing; it is
not a working route.

# 15. The typical-strata round, recovered and pushed — 2026-08-04

**The agent that ran `pointing_typical_probe.py` died after its GPU run completed and before it
built or pushed anything.** This section is the recovery: what it left, what was verified, what was
adopted unchanged, and the two disclosures the round goes up carrying. **No inference was re-run.**
Every dot and every mask below comes from the JSON that agent wrote at 00:40:56Z.

## 15.1 What the dead agent left

Unlike §13.7's stall, this one **committed nothing after its pre-registration** and left four files
orphaned:

| file | state |
|---|---|
| `data/sam/pointing-typical-1-run.json` | complete — 16 covers, 3 policies each, 1.1 MB |
| `data/sam/pointing-typical-1-candidates.json` | complete — 4.1 MB, every candidate mask with pixels |
| `oracle/sam/pointing_typical_round.py` | complete and correct — step 2, the panel renderer |
| `oracle/sam/build-pointing-typical-fixture.ts` | complete and correct — step 3, the fixture builder |

`POINTING_PROBE_NOTES.md` was **byte-identical to HEAD** before this section, so nothing it had
written was lost. The pre-registration and the probe were already safe in `bafcc53`.

**Neither builder was half-written.** Both were read end to end before being run and **neither was
edited** — no fix was needed and none was invented. The two `.get()` calls in
`pointing_typical_round.py` that look like they read missing keys (`strategy`,
`same_candidate_as_containing`) are deliberately tolerant: `strategy` exists only on `union` and
`same_candidate_as_containing` only on `ground`, which is exactly the shape the run file has.

## 15.2 The run, verified against the pre-registration

Checked on CPU before a panel was drawn. Every clause of `POINTING_TYPICAL_PREREG.md` that the run
file can evidence:

| clause | prereg | on disk | ✓ |
|---|---|---|---|
| batch id | `pointing-typical-1` | same | ✓ |
| run pinned to the prereg commit | after `bafcc53` | `git_head` = `bafcc53` | ✓ |
| draw seed | `random.Random(20260804)` | `seed` 20260804, method string verbatim | ✓ |
| frame | eval-142 `included` | `frame_size` 142 | ✓ |
| exclusion | all 15 `pointing_covers.COVERS` by id | 15 excluded, **all 15 hit in frame**, `eligible_size` 127 | ✓ |
| n | 16 sampled, 4 reserves | 16 + 4 | ✓ |
| covers | 16 | 16 rows, ids match the candidates file exactly | ✓ |
| draw 1 | temperature 0.0, the shipped point | `is_shipped_point` on draw 1 of all 16, T=0.0 | ✓ |
| draws 2+ | T 0.7, `top_p` 0.95, seed `20260804+k` | `mx_seed` ∈ {20260806…20260809} | ✓ |
| stop rule | stop at 3 distinct, max 5 draws | holds on all 16, recomputed independently | ✓ |
| substitution | only on **zero** in-frame points | every draw returned an in-frame point; `substitutions` `[]` | ✓ |
| candidates persisted | §14.7 addition 1, every decode | 4 multipoint + 4×K per-point on all 16 | ✓ |
| policies renderable | 3 per cover | 48 masks, all RLEs decode, all at native cover size | ✓ |
| budget | stop at ~25 min | 268 s wall, `aborted_on_budget` false | ✓ |

Cross-file: `points_pixels` identical between run and candidates on all 16 covers, per-point
candidate groups equal to `n_distinct_points` on all 16, mask dimensions equal to cover dimensions
on all 48. **No inconsistency found.**

## 15.3 The two disclosures this round carries

Both are properties of the completed run, not of the recovery, and neither is repairable without
re-running inference — which the pre-registration forbids after the fact.

**1. Five of sixteen covers fell short of ≥3 distinct points.** §14.7 addition 2 asks for ≥3;
`points_shortfall` is `true` on `00045150` (2), `000955cc` (2), `0010b864` (2), `0005597105` (2)
and `0000cb59` (**1**). The prereg anticipated this exactly — "a cover proceeds with however many
distinct points it has after at most 5 draws … fewer than 3 is a reported shortfall, not a silent
one" — and it is reported here rather than discovered later. The cause is visible in the draws:
MolmoPoint at T 0.7 kept re-emitting the same pixel, so 5 draws bought fewer than 3 distinct points.

**2. Eight of the forty-eight tiles are byte-identical to another tile in the round.** On the 7
covers where `SELECT_GROUND` picked the same candidate as `SELECT_CONTAINING`, the two panels are
the same image; on `0000cb59` — the single-point cover — **all three policies collapse to one mask**
(area 0.1724) and the reviewer sees the same panel three times. **40 distinct images, 48 tiles.**

This is not a defect and it was not repaired. Where the policies genuinely agree the tile is
legitimately the same, and dropping or merging duplicates would break the pre-registered 16-per-
policy scoring that §6's B2 and B4 are written against. Two consequences, stated before any answer
is seen:

- **The policy comparison has content on 9 covers, not 16** — the 9 where `ground` differs from
  `containing`. `union` differs from `containing` on 15. `0000cb59` contributes nothing to B4.
- **It is an unplanned intra-reviewer consistency check.** Identical images should draw identical
  keypresses; where they do not, that is the round's own noise floor, measured for free. It is
  *read* that way, not designed that way, and it is recorded here so the reading is not invented
  afterwards.

**A third, smaller one.** §5 says the shuffle is "so … a cover's three tiles do not sit adjacent".
A plain seeded shuffle cannot guarantee that, and it did not: positions **27–28** are both
`00060491ade8` (`union` then `containing`, different images). The seed and the method were
pre-registered and **the shuffle was not re-rolled to fix this** — re-rolling after seeing the
result is the exact post-hoc discretion the pre-registration exists to remove. The clause overstated
what its own mechanism delivers; the mechanism stands.

## 15.4 The round — BUILT and PUSHED

`pointing-typical-1`, live on `http://127.0.0.1:3010/`, **48 tiles, 1 question, 4 answers**, open.
16 covers × 3 policies, tile order shuffled with seed 20260805, **no panel names its policy**.

**Gates, all green:**

| check | result |
|---|---|
| render | 48 panels, 4.5 s CPU, no model loaded |
| fixture | 48 tiles · 16 covers · `containing` 16 / `ground` 16 / `union` 16 |
| push | `201 {"batchId":"pointing-typical-1","itemCount":48}` |
| `verify-live` | **OK** — 30 pages, 11 modules, 20 batches, 81 requests |
| live-payload key smoke, this batch | **pass** — `token,questionKey,media,width,height,answer,revision`; answers `1..4` |
| answer-key leak scan of the live payload | **none** — 15 forbidden manifest fields, string-scanned |
| policy identity absent from payload | `containing` / `union` / `policy` / `coverId` all absent | 
| media | `200 image/png 648,068 bytes`, decodes 972×480 RGB |
| live-payload key smoke, all batches | **12/12** enum/by-question oracle rounds (`ground-freetext-1` is `freetext`, `bcde-gate-reconciliation-1` is `by-artwork` — different shapes, out of scope) |
| review-ui modules added or changed | **none** — the incumbent `oracle.js`, as in §12.6 |

**Carried from §12.6 and still true:** the one part of the convention that cannot be performed from
a shell is pressing an answer hotkey, because the only live answer path writes a real answer into
the open round. No `review-ui` module changed, so the keyboard path is the one 12 oracle batches
have been answered through. **Flagged, not claimed.**

**Watch command — reported, NOT started, per the task:**

```
NODE_NO_WARNINGS=1 nohup node --experimental-strip-types \
  research/v3/src/review-server/watch-batch.ts --batch pointing-typical-1 \
  >/tmp/watch-pointing-typical-1.log 2>&1 &
```

## 15.5 One unrelated file, committed with this

`data/sam/point-gate-coord-convention.json` was dirty in the tree. Its diff is **two lines** —
`generated` and `git_head` — with every measured value byte-identical: a re-run of
`gate_point_coords.py` on 2026-08-03 that changed no fact. Committed with the recovery rather than
left dirty, and identified here so it is not later mistaken for evidence of a second run.

## 15.6 What this round still cannot answer

Unchanged by the recovery, and worth restating where the numbers will land next to it:

- **No independent answer key.** Typical covers have no `ground-freetext-1` prose. This measures
  **reviewer judgement only**, and §13.9's caveat — every automatic "correctness" number in this
  document is an answer-rate wearing a correctness label — is not retired by it.
- **The candidate-level counterfactual is now answerable but not answered.** §14.8's first clause
  needs the persisted candidates to be *analysed*; this round only makes them exist. That analysis
  is CPU work and is not done here.
- **The anchor from §13 stands unmoved: "it wasn't amazing."** Nothing in the recovery raises it,
  and the bar in `POINTING_TYPICAL_PREREG.md` §6 was fixed in `bafcc53` before the run produced a
  single point.

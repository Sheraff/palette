# Ground isolation — four routes, and the order to try them

**For:** the reviewer and the orchestrator. **Date:** 2026-08-03. **Status:** paper only.
**No GPU was used, no model was downloaded, nothing was loaded.**

**Sibling to** `POINTING_SCOUT_NOTES.md`, which scouts routes (b) and (c) in depth and establishes
the SAM point-prompt finding all of this rests on. This file adds the **depth** route the reviewer
asked about, and recommends a **try-order across all four**.

**Scope addition (2026-08-03), the reviewer's words:**

> "another way to get 'ground vs subject' could be to use an 'image to depth map' model… it might
> give weird results on artworks"

The second clause is the important one, and §2 takes it seriously rather than treating it as a
hedge.

---

## 0. The thing to know before reading §1 — depth was already rejected, in writing

Unlike the pointing model, which was **never** on any list (`POINTING_SCOUT_NOTES.md` §1), monocular
depth **was considered and rejected**, with a stated argument.
`ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:717-722`, verbatim:

> **"Depth models were considered and rejected.** Monocular depth estimation is trained on
> photographs of 3-D scenes. Much of this corpus is flat — typography, vector illustration,
> abstract pattern — and on those a depth model returns confident, plausible garbage rather than a
> null. Trusting it would require knowing photo-vs-flat first, at which point the VLM answers the
> structural question directly and more reliably."

**This must be put in front of the reviewer, because the reviewer's new suggestion runs against a
decision the campaign already made.** That is not a reason to refuse the probe — it is a reason to
say exactly what has changed and what has not.

**What has NOT changed.** The corpus is still overwhelmingly flat, and we now have a number for it
that the rejection did not have. On the 30-cover gold set the **reviewer personally answered all
180 probes**, and `depicted_place` — *"Taken as a whole, does the background show a place with
depth — a room, a landscape, a street?"* — came back:

| answer | n | share |
|---|---|---|
| **yes** | **4** | **13.3%** |
| no | 26 | 86.7% |
| unsure | 0 | 0% |

**[MEASURED]** `data/oracle-validation/probe-gold-1-analysis.json`, `perProbe.depicted_place`,
30 artworks, human gold, zero unsures.

So by the reviewer's own judgment, **a depth model has a real 3-D scene to work with on about 1
cover in 8.** Any claim that depth solves ground/subject corpus-wide has to get past that number
first. This is the single most important fact in this document and it postdates the rejection —
it *strengthens* the rejection's premise rather than weakening it.

**What HAS changed, and it is not nothing.** Two things:

1. **The rejection's fallback has weakened.** Its closing move was *"the VLM answers the structural
   question directly and more reliably."* Since then, `GROUND_FREETEXT_SYNTHESIS.md` found the VLM
   ground-taxonomy question is the wrong question — the reviewer could not answer it either, and
   the surviving question is *which pixels are ground*, which is not what `depicted_place` asks.
   The fallback still stands for "is this a photo of a place", but it no longer stands for "and
   therefore we do not need pixels".
2. **The rejection contained an untested empirical claim — and it has since been vindicated from
   outside.** *"a depth model returns confident, plausible garbage rather than a null"* was
   **asserted, not measured**; no depth model has ever been run in this repo (§1.1). The reviewer's
   flatness hypothesis is precisely a bet that the claim is wrong in a specific, useful way.
   **§1.3b's literature check found the claim is not only right but almost word-for-word what the
   benchmarks report** — "confident, plausible garbage" is a fair paraphrase of a 61.45% bad-pixel
   rate on printed-picture regions. Whoever wrote that sentence guessed well.

**The crux, stated so it can be settled rather than argued.** The rejection assumes the garbage is
*unstructured*. The flatness hypothesis assumes it is *structured* — that a flat graphic cover
yields a uniformly shallow depth map, and that the uniformity is itself a usable signal. These two
cannot both be right.

**UPDATE, same day: the published literature has largely settled this, and it favours the
rejection.** §1.3b lays out the evidence. In one line: depth models on non-photographic input do not
go flat, they produce confident structured wrong depth (Depth Anything V2 is wrong on **61.45%** of
pixels over printed-picture regions), and a 63,000-painting study found **no significant difference
between realistic and abstract styles** — i.e. abstraction is not detected, which is the signal the
hypothesis needs.

**So the rejection's central claim — asserted when written, and still never measured *by us* — now
has substantial external evidence behind it.** What remains genuinely untested is the exact
whole-frame-is-the-artwork case (§1.3b). The probe is therefore worth ~30 minutes as a
**disconfirmation**, not as a promising lead, and §1.4 says so plainly.

---

## 1. Depth scout

### 1.1 Provenance

**[MEASURED]** 2026-08-03: no depth model has ever been run, named as a candidate, or configured in
this repo. The only mentions of "depth" in `research/v3` are the rejection above and the
`depicted_place` probe wording. There is no prior depth data of any kind.

### 1.2 Candidates on this stack

**[MEASURED]** HF metadata API, 2026-08-03. Sizes are the sum of the actual weight files; licences
are the repo's own tag.

| Model | Size | Licence | Verdict |
|---|---|---|---|
| **`depth-anything/Depth-Anything-V2-Small-hf`** | **0.099 GB** | **apache-2.0** | **the pick** |
| `…-Base-hf` | 0.390 GB | **cc-by-nc-4.0** | blocked — non-commercial |
| `…-Large-hf` | 1.341 GB | **cc-by-nc-4.0** | blocked — non-commercial |
| `onnx-community/depth-anything-v2-small-ONNX` | 0.235 GB (several precisions) | apache-2.0 | viable alternative runtime |
| `Intel/dpt-hybrid-midas` (MiDaS) | 0.490 GB | apache-2.0 | usable; older, superseded by DA-V2 |
| `apple/DepthPro` | 1.904 GB | **apple-amlr** | restrictive research licence; heavy |
| `prs-eth/marigold-depth-v1-1` | **13.75 GB** | openrail++ | diffusion-based — orders of magnitude slower and 138× the size of DA-V2-Small for a probe that may be dropped. **No.** |

**The licence split is easy to get wrong, and there is a quirk that rescues the scale-up path.**
Depth Anything V2 **Small is Apache-2.0, but Base and Large are CC-BY-NC-4.0** — so the plain
"start small, scale up" instinct looks blocked. **But the *Metric* variants are licensed
differently:** `Depth-Anything-V2-Metric-Outdoor-Large-hf` is **1.341 GB, apache-2.0**
(**[MEASURED]**, licence tag confirmed 2026-08-03). So a permissively-licensed Large *does* exist,
via the metric branch.

Two cautions on that: the Indoor-Large repo carries **no licence tag at all** (not Apache —
unasserted), so only the Outdoor one is confirmed; and at 1.34 GB it is over the reporting
threshold, so it is not to be pulled without saying so first. **Probe Small. If and only if Small
shows a signal that plausibly scales, Metric-Outdoor-Large is the permissible next step** — but a
Small-only failure is still a real failure, because §1.3b's evidence says the larger models
hallucinate *more*, not less.

**Two additional routes worth knowing, both Apple-Silicon-native:**

- **`apple/coreml-depth-anything-v2-small`** — Apple's own CoreML export, Apache-2.0, 0.286 GB repo.
  Apple publishes **24.6 ms/image on M3 Max and 32.8 ms on M1 Max** on the Neural Engine. 15 covers
  is under a second.
- **Depth Anything 3** (Nov 2025, arXiv 2511.10647), the current SOTA successor — Small/Base/
  Large-1.1/Metric-Large/Mono-Large are Apache-2.0 (Giant and Large-1.0 are CC-BY-NC).
  `mudler/depth-anything.cpp` is an **MIT ggml port with a Metal backend**, GGUF q4_k ≈ 99 MB, no
  Python — **and it outputs per-pixel confidence natively.** If the confidence channel turns out to
  matter, this is the cheapest way to get one on this hardware.

**Use the `-hf` repo ids.** The bare `depth-anything/Depth-Anything-V2-Small` repo is the original
`.pth` release and has no `config.json`; the `transformers`-loadable checkpoint is the **`-hf`**
suffixed one. Same weights, same size, same licence — but a runner pointed at the bare id will fail
to load. **[MEASURED]** `config.json` fetched for all three `-hf` repos, 2026-08-03.

**Confidence maps: the pick has none, some models do, and none of them are the signal we want.**
**[MEASURED]** the DA-V2 `-hf` repos are `DepthAnythingForDepthEstimation` and MiDaS is
`DPTForDepthEstimation` — both single-channel regression heads with **no** uncertainty output.
Depth Pro and ZoeDepth likewise. **[INHERITED]** Marigold (ensemble variance), UniDepth V2,
Metric3D v2 and **Depth Anything 3** (`prediction.conf`) *do* emit per-pixel confidence.

**But it is the wrong kind of signal, and this is worth stating before someone reaches for it.**
Marigold's own docs say its uncertainty concentrates *"around discontinuities, where object depth
changes abruptly"* — it is effectively an edge detector on the depth map. A graphic cover with hard
edges lights it up **exactly where the model is confidently hallucinating**, indistinguishable from
a real depth edge. And the OOD literature is explicit that this class of uncertainty does not do
the job: *Out-of-Distribution Detection for Monocular Depth Estimation* (ICCV 2023, arXiv
2308.06072) notes existing approaches target *"the data uncertainty introduced by image noise"*
rather than *"the uncertainty due to lack of knowledge, which is relevant for the detection of data
not represented by the training distribution"* — and their working detector uses encoder-feature
reconstruction error instead, research code only.

**So §1.4's variance proxy remains the flatness signal to test** — not because nothing else exists,
but because the alternatives measure something else.

**No MLX conversion of any depth model exists.** Searched `mlx-community` and the wider hub for
depth conversions: nothing. This is the one place the depth route is materially worse off than the
point routes, which run on MLX that is already installed.

**Runtime — CORRECTED TWICE, and the correction matters more than anything else in §1.2.** I first
wrote that depth needed a new runtime and that install would dominate the cost. **That was wrong,
and it was wrong because I checked only the SAM venv.** The record, so the mistake is visible:

- **[MEASURED]** the **SAM** venv (`oracle/sam/.venv`) has `transformers 5.14.1` and `mlx 0.32.0`
  but **no torch** — which is what I first reported.
- **[MEASURED]** the sibling **embeddings** venv (`oracle/embeddings/.venv`) already has
  **`torch 2.13.0` with `torch.backends.mps.is_available() == True`**, plus `torchvision 0.28.0`,
  `timm 1.0.28` and `transformers 5.14.1`. Its transformers registers
  `depth_anything`, `depth_pro`, `dpt`, `zoedepth` and four more under
  `AutoModelForDepthEstimation` — verified by importing the mapping, not by reading docs.

**So there is a zero-install path**: run Depth-Anything-V2-Small through
`AutoModelForDepthEstimation` on MPS **in the existing embeddings venv**. No new environment, no
torch download, no pollution of the pinned SAM env. `diffusers` is absent everywhere, which is one
more reason Marigold is out.

**Do not install anything into the SAM venv.** `config.py` pins `mlx-vlm 0.6.8` deliberately and
that environment is load-bearing for every SAM number this campaign has produced. The embeddings
venv is the right host precisely because it already carries torch for its own reasons.

**The recipe, then, is one line:** `Depth-Anything-V2-Small-hf` via `AutoModelForDepthEstimation`
on `mps`, in `oracle/embeddings/.venv`. **One unverified risk:** some bicubic-interpolation ops
have historically been shaky on the MPS backend, and this was **not** tested (read-only scout). If
it bites, the fallbacks are CPU (still seconds, at this size) or Apple's CoreML export. Not a
blocker either way — but it is the first thing to hit, so expect it rather than debug it cold.

**Speed.** DA-V2-Small is feed-forward at ~25M parameters; Apple's CoreML numbers above are ~25–33
ms/image, and MPS via torch will be the same order. **15 covers is seconds.** The probe's real cost
is now just the plumbing — read 15 images, save 15 depth maps, compute one scalar each. Marigold is
the opposite (diffusion; ~280 ms/image at *one* step on an RTX 3090, and the standard protocol is
~40 UNet passes) and is excluded on speed, size, licence-runtime and accuracy grounds alike.

### 1.3 Known failure modes — stated up front, before any result

These are not risks to be managed; they are the reasons the route may be worthless, and they are
written first so a pretty depth map cannot talk us past them.

1. **Near/far is not subject/ground.** This is the fundamental objection and it is not fixable by a
   better model. A receding floor is *ground* in the compositional sense and *near* in the depth
   sense; a sky is ground and maximally far. Depth gives a continuous distance field; ground/figure
   is a partition by compositional role. **On the reviewer's own `00075841` (Country Karaoke), the
   hardwood floor is ground and runs from the very front of the frame to the back** — any
   near/far threshold cuts it in half. Depth cannot express "the floor is ground".
2. **Painted shadows and rendered shading read as geometry.** An illustrator's drop shadow, an
   airbrushed gradient, a vignette — all are cues a depth model was trained to read as 3-D. On
   `000f0a78` (three bands, one of which "is itself a gradient") the gradient is flat design, and a
   depth model has every reason to read it as a receding surface.
3. **Collage has no consistent depth.** `000fa9b5` (Dahlbäck) is explicitly a collage of layers at
   no coherent scale. There is no true depth map for it, so there is no correct answer to compare
   against — the model will produce *something*, and that something is unfalsifiable.
4. **Typography.** Large display type is flat, but drop-shadowed or extruded type is a 3-D cue.
   `krafty` is dominated by typography.
5. **Scale/absolute-depth meaninglessness.** Relative-depth models output an *ordinal* field with
   arbitrary scale, so "how deep is this cover" is not comparable across covers without
   normalization — and normalizing a flat cover's noise stretches it to full range, manufacturing
   structure out of nothing. **Any flatness metric must be computed on the raw output, not on a
   per-image normalized map.** This is the most likely way to fool ourselves and it is an easy
   mistake to make.

### 1.3b What the literature actually says — and it settles more than expected

**[INHERITED]** Sourced 2026-08-03. This was the open question when §1.4 was first drafted. It is
now largely closed, and **not in the direction the hypothesis needs.**

**The finding: depth models do not return flat on non-photographic input. They return confident,
structured, wrong depth.** Two distinct mechanisms, both documented:

**(a) Depicted scenes are read as real geometry.** *3D Visual Illusion Depth Estimation* (NeurIPS
2025, arXiv 2505.13061) built a ~3k-scene / 200k-image benchmark whose categories explicitly
include *"picture illusion (e.g., picture printed/drawn on a paper)"*. Verbatim: *"the monocular
priors learned from large-scale data is easily fooled by illusion textures, like pictures and
replayed videos."* On printed-picture regions, share of pixels wrong (bad2): **Depth Anything V2
61.45%**, Marigold 65.67%, Depth Pro 87.08%, Metric3D 94.11%. Their fix required fusing in a VLM's
common sense — **geometry alone cannot tell**.

*3D Mirage* (arXiv 2512.15423) corroborates independently: models *"hallucinate illusory 3D
structures from planar/low-curvature but perceptually ambiguous inputs"*. Its deviation score
**inverts with model quality** — DepthFM 2083, Marigold 1427, DAv2-Large 994.6, versus ZoeDepth
467.7 and **DA-Small 459.8**. Bigger, newer and diffusion-based models hallucinate *more*.
(Convenient accident: the only Apache-licensed model we can use is also the one that hallucinates
least.)

**(b) Flat graphics and typography become depth steps via luminance gradients.** *Geometry
Enhancements from Visual Content* (arXiv 2012.08248), Fig. 8: *"the text appears in the predicted
depth as causing depth changes. This is caused by the strong gradients in the RGB image that the
letters create."* And: *"Our network often fails over paintings and writings that cause strong
edges in the RGB images."* Their remedy was a **separate network to segment painting/text out
first**. Confirmed in the comics domain (WACV 2022, arXiv 2110.03575), where the authors had to
translate comics into natural images first and train the model to *"distinguish between text and
images … to reduce text-based artefacts in the depth estimates."* For non-perspectival art the
output is neither flat nor meaningful: *Scene Depth Estimation from Traditional Oriental Landscape
Paintings* (arXiv 2403.03408) — *"direct application of pre-trained SOTA depth estimation methods
… ends up with a meaningless depth map."*

**The single most damaging result for §1.4.** Google PAIR ran a MiDaS-class model over **~63,000
Met and Rijksmuseum paintings** and found **no statistically significant difference in depth
metrics between realistic and abstract / non-realistic styles**. That is a large-n, direct test of
the thing the flatness hypothesis needs to be true — *abstraction is not detected* — and it comes
out flat against it. (Same source, an observation worth keeping: a painted **frame** around an
image *did* flatten the map. Not a measured result, but the one documented case of a graphic cue
producing flat output.)

**What is genuinely NOT settled, and it is the reason the probe is not cancelled outright.** Every
benchmark above measures a flat picture embedded *within* a photograph — a poster on a wall, a
screen in a room. **The case where the entire frame is the artwork, with no surrounding scene, is
not benchmarked by anyone.** There are also **zero** academic sources on album cover art
specifically, and no paper anywhere measures "does the model correctly return a plane for a flat
graphic" — every benchmark scores against the depicted scene. **That absence is itself a finding**,
and it is exactly our setup.

**One paper must NOT be cited in our favour.** *Illustrator's Depth* (arXiv 2511.17454) asserts that
*"illustrations typically appear on flat media … monocular depth estimation models are explicitly
trained to ignore them."* Read carefully, that is a claim about training *intent*, not observed
behaviour — and the same paper's Fig. 4 says conventional models *"predict physical depth"* on
illustrations, with DAv2 failing layer ordering at 0.791. It reads like support for flatness and is
not.

### 1.4 The diagnostic-flatness hypothesis — testable, cheap, and (after §1.3b) probably false

**Hypothesis (the reviewer's, sharpened):** on flat graphic covers a monocular depth model returns a
*uniformly shallow / low-variance* field, and that low variance is itself a reliable signal that the
cover has a flat ground — independent of whether the depth values mean anything.

If true, depth is not a ground-extractor but a **cheap photo-vs-flat classifier**, which is exactly
the input the pipeline's own rejection says is missing (*"would require knowing photo-vs-flat
first"*). **That would make depth useful for the opposite of what it was proposed for**, and it
would close the rejection's own open loop.

**PRIOR, updated after §1.3b: the published evidence runs against this hypothesis, hard.** I drafted
this section before the literature check and framed it as an open bet. It is not one. Depth models
do not go flat on graphic input — they produce structured, confident, wrong depth — and Google
PAIR's 63,000-painting study found **no significant metric difference between realistic and
abstract styles**, which is the closest thing to a direct test of the flatness signal and it comes
out negative.

**Why the probe survives anyway, stated honestly rather than to rescue the idea:** the whole-frame
case is genuinely unbenchmarked (§1.3b), our covers are not museum paintings, and the test is
~30 minutes. **But the prior has moved from "speculative" to "probably false", and this section
should be read as a cheap disconfirmation rather than a promising lead.** If it is going to be run,
it should be run to *close* the question — including for the reviewer, whose idea it is and who
deserves a real test rather than a second-hand "the literature says no".

**Consequence for the criteria in §1.6: they do not change.** They were pre-registered against our
own covers before I saw any of this, and moving them now to match a prior would be exactly the
wrong response. The prior changes what I *expect*, not what counts as a pass.

**Pre-registered test.** Compute one scalar per cover on the **raw, un-normalized** depth output —
robust spread, e.g. the interquartile range, plus the 5th–95th percentile span as a cross-check.
Then ask whether that scalar separates the reviewer's 4 `depicted_place=yes` covers from the 26
`no` covers.

- **Supported** if the two groups separate with **no overlap**, or with an AUC ≥ 0.9 on the 30 gold
  covers.
- **Refuted** if AUC < 0.75, or if the separation is driven by image *content* (a dark cover, a
  busy cover) rather than by flatness — check by eye on the overlays.
- **n is 4 versus 26.** That is a very small positive class, and **no threshold may be fitted on
  it** — this is a look-and-see for separation, not a calibration. If it separates, the calibration
  is a *later, larger* round. Say this out loud in any write-up, because a threshold fitted on 4
  covers would be worthless and would look authoritative.

### 1.5 Probe design — the shared test set

**Same 9 free-text covers** as the pointing probe (`POINTING_SCOUT_NOTES.md` §4.2), with
`GROUND_FREETEXT_SYNTHESIS.md` as the answer key. Using the same 9 is deliberate: it makes the four
routes directly comparable on the covers that actually broke the taxonomy.

**6 strata controls**, all drawn from the 30-cover gold set where the reviewer answered
`depicted_place` themselves, so the stratum label is the reviewer's, not mine:

| # | stratum | id / path | reviewer's evidence |
|---|---|---|---|
| 1 | **photo, real depth** | `images/muse.jpg` | `depicted_place=yes`, `shaded_field` |
| 2 | **photo, real depth** | `03/ab67616d00001e020003e50500c5d762da89643a.jpg` | `depicted_place=yes` |
| 3 | **photo, real depth** | `07/ab67616d0000b2730007cc8b341c11227aa7b461` | `depicted_place=yes` |
| 4 | **flat graphic, purest** | `images/vvbrown.jpg` | probe vector `yynnnn` — single flat colour, `depicted_place=no` |
| 5 | **flat graphic** | `0b/ab67616d0000b273000bc98f315aba36374f9f93` | `flat_field`; also the pointing probe's gate image, so two routes share it |
| 6 | **pattern / texture, no depth** | `03/ab67616d0000b273000390c07f75da30b4e8aba8.jpg` | probe vector `ynnnyn` — motif yes, `depicted_place=no` |

**[MEASURED]** all 15 paths verified present on disk, 2026-08-03.

Controls 1–3 are the whole positive class the gold set contains — there is no fourth. **If depth
fails on those three, the route is dead** regardless of anything the flatness metric shows, because
those are the covers where depth is supposed to be easy.

### 1.6 Criteria — "worth a full run" vs "drop"

Two independent questions; either can pass alone.

**Question A — does depth isolate ground on the 9?** (the reviewer's original proposal)

- **Worth a full run** if, on ≥6 of the 9, a threshold on the depth map produces a ground/figure
  split that matches the reviewer's prose — *and* the thresholds are not wildly different per cover.
- **Drop** if the split fails on the two covers whose prose is most explicitly spatial
  (`00014fb4`, green-left/red-right; `000f0a78`, three horizontal bands). Both are flat designs with
  unambiguous ground, and depth has no excuse. **Expected outcome: drop.** Failure mode 1 (near/far
  ≠ subject/ground) predicts this, and if it fails here the near/far objection is confirmed
  empirically rather than merely argued — which is worth the 10 minutes on its own.

**Question B — is flatness diagnostic?** (§1.4, and the one I would actually bet on)

- **Worth a full run** if the AUC criterion in §1.4 is met on the 30 gold covers.
- **Drop** if AUC < 0.75, or if the metric is an artifact of normalization (§1.3 item 5).

**Drop the route entirely** only if **both** fail. If A fails and B passes, depth survives as a
photo-vs-flat detector and should be re-scoped and handed back to the reviewer under that
description — **not** quietly kept as a ground extractor, which is the failure mode this campaign
has already been bitten by once (the `logo`→`emblem` rename exists because a stored word claimed
more than the measurement supported).

---

## 2. Try-order across the four routes

### 2.1 The recommendation

**This reorders the list as given, and the reason is worth stating plainly: (b) and (c) are not two
routes, they are one route with two heads.** Both feed points into SAM's point-prompt path — the
path that does not currently exist and that `POINTING_SCOUT_NOTES.md` §3.3 shows is ~80–150 lines
of plumbing over weights we already load. Once that adapter exists, **(c) costs nothing extra**,
because Qwen3-VL is already on this disk. So the adapter is shared infrastructure, and the cheapest
head goes first.

| order | route | new download | GPU | why here |
|---|---|---|---|---|
| **0** | **SAM point-prompt gate** (`POINTING_SCOUT_NOTES.md` §4.1) | **0 GB** | **~2 min** | Prerequisite for both (b) and (c). Settles the coordinate-convention ambiguity that would otherwise make every downstream point result uninterpretable. Cheapest decisive act available. |
| **1** | **(a) noun-elicitation VLM→SAM** | 0 GB | **already running** | Two runs are executing now. Read them before spending anything. Costs nothing to wait for. |
| **2** | **(c) Qwen3-VL `point_2d` → SAM** | **0 GB** | ~10 min | Already on the stack. Once step 0 lands, this tests the entire points→SAM→ground-mask thesis for the price of the GPU slot alone. If the thesis is wrong, we learn it without downloading 11 GB. |
| **3** | **(b) MolmoPoint-8B → SAM** | **10.8 GB** | ~20 min | The quality head on a pipeline (c) has already proven. 70.7 vs 58.5 on Point-Bench, plus constrained decoding and an absence class. Buy the accuracy *after* the mechanism is known to work. |
| **4** | **(d) depth** | **0.099 GB, zero install** — the embeddings venv already has torch + MPS (§1.2) | **~15 min**, all plumbing; inference is seconds and barely touches the GPU queue | Cheap, but **lowest expected value by a wide margin**: a written rejection now backed by external evidence (§1.3b), ~13% applicability, and a 63k-painting study against the flatness signal. Run it to *close* the question. |

### 2.2 Why (c) before (b), against the order as given

Three reasons, in order of weight:

1. **It separates two failure causes that (b)-first would confound.** If we start with MolmoPoint
   and get bad masks, we cannot tell whether the *pointing* was bad or the *SAM adapter* was wrong —
   and the adapter is brand-new, untested code with a known coordinate ambiguity (§0 of the
   pointing notes). Running the weaker-but-already-present pointer first tests the adapter against
   a model we are not simultaneously debugging.
2. **Zero download.** If the points→SAM thesis is simply wrong, (c) reveals it for the cost of a
   slot, and the 10.8 GB is never spent.
3. **It gives (b) a baseline.** "MolmoPoint is better" is only meaningful against a measured
   alternative on our own covers. Running (c) first produces that comparison for free, and it is
   the comparison the published benchmarks do **not** give us (§2.5 of the pointing notes: no
   third-party Molmo-vs-Qwen pointing comparison exists).

**The one argument for (b) first**, recorded honestly: if MolmoPoint is *much* better, (c) may fail
where (b) would have succeeded, and we would wrongly conclude the whole points→SAM idea is dead.
**Mitigation, and it is cheap:** treat (c) failing as *inconclusive*, never as a kill, and let (b)
be the decider. Only a (c) *success* is allowed to close the question early. That asymmetry costs
nothing and removes the risk.

### 2.3 Depth's position — and a correction to my own first draft

**I got depth's cost wrong twice, in opposite directions, and the final position is: it is cheap.**
Worth recording because the reasoning is the useful part:

1. First draft: "near-free, run it in spare minutes" — from the model size alone.
2. Second: "~30 min, mostly install" — after finding no torch **in the SAM venv**. Wrong, because I
   looked in one venv and generalized.
3. Final, verified: **zero install.** The embeddings venv already has torch 2.13 + MPS +
   transformers with `depth_anything` registered (§1.2). Model is 99 MB, inference is seconds, and
   the only real work is ~15 minutes of plumbing.

**So depth goes last on expected value alone — not on cost.** And the expected value is now clearly
worse than when the reviewer proposed it: §1.3b's literature confirms the pipeline's rejection, and
a 63,000-painting study finds abstraction is not detectable in depth metrics at all.

**How to schedule it: not by competing for the GPU queue.** It is a self-contained job — 15 images,
seconds of compute, a scalar per cover computed offline, no human round, and the 4-vs-26 comparison
needs no new reviewer time. **Hand it to a fresh agent to run end-to-end in parallel with the point
work.** It should never displace a point route, and at this cost it does not have to. The one thing
it must *not* become is a slow creep of "let's also try Base, and Large, and Marigold" — the
criteria in §1.6 are the stopping rule, and §1.3b says the bigger models are *worse* on exactly our
kind of input.

### 2.4 What each route's failure would still teach

The point of writing this before the runs is that no result is wasted, and it should be possible to
check afterwards whether we actually believed that.

- **(a) fails** → its own notes already say the blocker is *"a VLM question, not a SAM capability"*,
  and that 24 of 47 covers were handed the word `object`, which masks nothing. A further failure
  confirms the deeper point: **the residual route needs a noun, and for some covers no noun
  exists.** That is precisely `artofficial` — *"almost any description would fit somewhere but not
  everywhere."* This is the strongest argument for the point routes, because **a point needs no
  noun**, and (a) failing sharpens it rather than blunting it.
- **(c) fails** → either points→SAM is unsound, or the adapter is wrong, or Qwen3-VL cannot point at
  diffuse regions. Step 0 has already excluded the adapter, so a (c) failure localizes to the
  pointer — which is exactly what (b) then tests. Inconclusive by design, not by accident.
- **(b) fails** → the strongest available pointer cannot find ground on album covers. Combined with
  a (c) failure that is close to decisive for the whole pointing family, and it would send the
  question back to the residual route with a much clearer conscience. Combined with a (c)
  *success*, it would be a surprising result about MolmoPoint specifically and worth reporting
  upstream.
- **(d) fails on question A** → the near/far ≠ subject/ground objection is confirmed by measurement
  rather than by argument, and the pipeline's written rejection gains the evidence it never had.
  **That is a real gain**: right now the rejection rests on an assertion, and a documented rejection
  resting on an assertion is exactly the kind of thing that gets re-proposed every few months —
  as it just was.
- **(d) fails on question B** → the flatness hypothesis is dead and should be struck, so it is not
  re-proposed either. Cheap to settle, and it is the reviewer's own idea, so it deserves a real
  test rather than a shrug.

### 2.5 What would make me change this order

- **If (a)'s two running jobs come back strong**, the pointing routes drop in priority — the
  question would be much closer to answered and the 10.8 GB harder to justify. **Read (a) first;
  that is why it is step 1 and costs nothing.**
- **If step 0 shows the SAM interactive decoder is broken** (not merely mis-normalized), then (b)
  and (c) both become expensive rather than cheap, and depth's position improves by default.
- **If the reviewer wants the flatness question answered for its own sake**, depth moves up. It is
  their hypothesis, it is cheap, and §1.4 is a complete test — the ordering above is about expected
  value for *ground isolation*, which is not the only thing worth knowing.

---

## 3. Proposed loose-end entries

Proposed only; the orchestrator places them.

> **B-new+1. The depth rejection's claim is now externally corroborated; only our own case is
> untested.** `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:717-722` rejects depth because on flat
> covers a model returns *"confident, plausible garbage rather than a null."* That was asserted, and
> §1.3b finds the published benchmarks say almost exactly the same thing (DA-V2 wrong on 61.45% of
> pixels on printed-picture regions; a 63k-painting study detecting no difference between realistic
> and abstract styles). **What remains untested anywhere is the whole-frame-is-the-artwork case**,
> which is ours. **Trigger:** a fresh agent, in parallel, not a GPU slot. **Cost:** zero install,
> ~15 min (§1.2). **Closes either way**, and is now expected to *confirm* the rejection.

> **B-new+2. The depth rejection's fallback argument no longer holds as written.**
> It ends *"the VLM answers the structural question directly and more reliably."*
> `GROUND_FREETEXT_SYNTHESIS.md` has since found the VLM's ground-taxonomy question is the wrong
> question. The rejection's *premise* (the corpus is flat — now measured at 87%, §0) is stronger
> than when written; its *fallback* is weaker. The paragraph should be updated to say which half
> still stands, rather than left to be read as a whole.

> **A-new+2. `depicted_place` = 13.3% is the applicability ceiling for any depth route, and it is
> not recorded anywhere a depth proposal would look.** Reviewer gold, n=30, zero unsures. Any future
> depth or 3-D-structure proposal should meet this number on its first page.

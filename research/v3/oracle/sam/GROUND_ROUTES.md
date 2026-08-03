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
2. **The rejection contains an untested empirical claim.** *"a depth model returns confident,
   plausible garbage rather than a null"* was **asserted, not measured** — no depth model has ever
   been run in this repo (zero hits for depth-model names anywhere; §1.1). And the reviewer's
   flatness hypothesis is precisely a bet that the claim is wrong in a specific, useful way.

**The crux, stated so it can be settled rather than argued.** The rejection assumes the garbage is
*unstructured*. The flatness hypothesis assumes it is *structured* — that a flat graphic cover
yields a uniformly shallow depth map, and that the uniformity is itself a usable signal. **These
two cannot both be right, and one cheap run distinguishes them.** That, and not ground extraction,
is what the depth probe is actually for.

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
| **Depth-Anything-V2-Small** | **0.099 GB** | **apache-2.0** | **the pick** |
| Depth-Anything-V2-Base | 0.390 GB | **cc-by-nc-4.0** | blocked — non-commercial |
| Depth-Anything-V2-Large | 1.341 GB | **cc-by-nc-4.0** | blocked — non-commercial |
| `onnx-community/depth-anything-v2-small-ONNX` | 0.235 GB (several precisions) | apache-2.0 | viable alternative runtime |
| `Intel/dpt-hybrid-midas` (MiDaS) | 0.490 GB | apache-2.0 | usable; older, superseded by DA-V2 |
| `apple/DepthPro` | 1.904 GB | **apple-amlr** | restrictive research licence; heavy |
| `prs-eth/marigold-depth-v1-1` | **13.75 GB** | openrail++ | diffusion-based — orders of magnitude slower and 138× the size of DA-V2-Small for a probe that may be dropped. **No.** |

**The licence split is the headline and it is easy to get wrong.** Depth Anything V2 **Small is
Apache-2.0, but Base and Large are CC-BY-NC-4.0.** The usual instinct — "start small, scale up if
promising" — is *blocked* here: there is no permissively-licensed larger sibling to scale to. Any
result that only works at Base/Large is a result we cannot ship. **Probe Small, and treat a
Small-only failure as a real failure**, not as "we should have used the big one."

**No MLX conversion of any depth model exists.** Searched `mlx-community` and the wider hub for
depth conversions: nothing. This is the one place the depth route is materially worse off than the
point routes, which run on MLX that is already installed.

**Runtime gap — this is a real cost the point routes do not carry.** **[MEASURED]** the SAM venv
has `transformers 5.14.1` and `mlx 0.32.0`, but **no `torch`, no `timm`, no `onnxruntime`, no
`coremltools`.** So depth needs a new runtime, one of:

- **`torch` + `transformers`** (`AutoModelForDepthEstimation`, MPS backend). Least new surface,
  since transformers is already present — but torch is a large install.
- **`onnxruntime`** with the ONNX conversion above and the CoreML execution provider. Lighter than
  torch; more conversion-specific fiddling.

**Do not install either into the SAM venv.** `config.py` pins `mlx-vlm 0.6.8` deliberately, and
that environment is load-bearing for every SAM number this campaign has produced. Depth gets its
**own venv** (`CONVENTIONS.md` is venv-only Python anyway). Cost of getting this wrong is
re-running SAM work to prove nothing shifted.

**Speed.** Depth-Anything-V2-Small is feed-forward and ~25M parameters — on this hardware it is
fractions of a second per 640 px image, so 15 covers is seconds of compute. **The probe's cost is
entirely install + plumbing, not inference.** Marigold is the opposite (diffusion, multi-step) and
is excluded on those grounds alone.

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

**What I could not confirm.** I have **not** verified against sources whether there is published
work on monocular depth applied to non-photographic input (paintings, posters, illustration), nor
whether any candidate model emits a **confidence or uncertainty map** that could flag "this is not a
photo" directly. An uncertainty channel would be a much better flatness signal than the variance
proxy in §1.4, so it is worth one search before building anything — but its absence does not block
the probe, because §1.4 works on the depth map alone.

### 1.4 The diagnostic-flatness hypothesis — speculative, testable, and the actual reason to run this

**Hypothesis (the reviewer's, sharpened):** on flat graphic covers a monocular depth model returns a
*uniformly shallow / low-variance* field, and that low variance is itself a reliable signal that the
cover has a flat ground — independent of whether the depth values mean anything.

If true, depth is not a ground-extractor but a **cheap photo-vs-flat classifier**, which is exactly
the input the pipeline's own rejection says is missing (*"would require knowing photo-vs-flat
first"*). **That would make depth useful for the opposite of what it was proposed for**, and it
would close the rejection's own open loop.

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
| **4** | **(d) depth** | **0.099 GB model + a new runtime** (§1.2) | **~30 min**, nearly all of it install and plumbing — inference itself is seconds | Lowest expected value: a written rejection, and applicable to ~13% of covers by the reviewer's own measurement. Its real target is the flatness hypothesis (§1.4), not ground extraction. |

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

**I drafted this section believing depth was near-free, and the §1.2 runtime finding corrected me.**
The model is tiny (99 MB) and inference is seconds — but there is **no torch, no onnxruntime and no
MLX depth implementation on this machine**, so the route's real cost is standing up a second venv
and writing the loading/plumbing code. That is the bulk of the ~30 minutes, and unlike the point
routes it buys infrastructure we have no other use for.

So depth goes last on **both** counts after all — expected value (§0: a written rejection, 13%
applicability) *and* marginal cost. It is not the "run it while you wait" job I first took it for.

**What it is instead: a self-contained job that needs no human round.** Its flatness metric is
computed offline from saved maps, and the 4-vs-26 comparison needs no new reviewer time. So it can
be handed to a fresh agent to run end-to-end in parallel with the point work, rather than competing
for the same slot — **that** is how it should be scheduled, not by squeezing it into spare minutes.
It should never displace a point route, and it does not need to.

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

> **B-new+1. Monocular depth was rejected on an untested empirical claim.**
> `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md:717-722` rejects depth models because on flat covers
> they return *"confident, plausible garbage rather than a null."* No depth model has ever been run
> in this repo, so the claim is asserted. It is also the exact inverse of the reviewer's
> diagnostic-flatness hypothesis. **Trigger:** any slot with ~10 spare minutes. **Cost:** small
> download, ~10 min. **Closes either way** — the rejection gains evidence, or the hypothesis does.

> **B-new+2. The depth rejection's fallback argument no longer holds as written.**
> It ends *"the VLM answers the structural question directly and more reliably."*
> `GROUND_FREETEXT_SYNTHESIS.md` has since found the VLM's ground-taxonomy question is the wrong
> question. The rejection's *premise* (the corpus is flat — now measured at 87%, §0) is stronger
> than when written; its *fallback* is weaker. The paragraph should be updated to say which half
> still stands, rather than left to be read as a whole.

> **A-new+2. `depicted_place` = 13.3% is the applicability ceiling for any depth route, and it is
> not recorded anywhere a depth proposal would look.** Reviewer gold, n=30, zero unsures. Any future
> depth or 3-D-structure proposal should meet this number on its first page.

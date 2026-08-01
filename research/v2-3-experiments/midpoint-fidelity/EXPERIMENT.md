# Midpoint fidelity — measurement report

**Arm:** `midpoint-fidelity` · **Trunk:** `81c694f` · **Date:** 2026-08-02
**Outcome: NO MECHANISM SHIPS.** Zero bytes of `research/v2-3/` changed (`git diff 81c694f` over tracked
files is empty). This is a measurement report, per the charter's "measurement report otherwise" clause.

**Corpus for every number below:** the unscrambled shared checkout `/Users/Flo/GitHub/palette` — 175
artworks (168 warehouse-reviewed with a recorded batch path, plus the 34 on-panel `images/` originals,
deduplicated), with the four vetoed artworks (`06eb2197…`, `148e0886…`, `000f9f4b…`, `0011c1dc…`)
excluded from every count. The worktree's own `images/` (34 `-scrambled` decoys) was never read.

---

## Headline

All three assigned threads were investigated. Each returned a negative or a redirect, and the three
negatives are more useful than the fix they were meant to justify:

1. **The assigned defect no longer exists.** The chord-deviation endpoint-proximity veto was fixed on
   trunk in `83ee25b` (reviewed), and the fix the brief proposed as a *candidate* — "derive the
   proximity bar from the batch-12 distinctness rule (CIE76 3.3 from endpoints) instead of the
   chord-position heuristic" — **is literally what shipped**. The graveyard audit's "confirmed live
   defects, never fixed" row and the cheap-defects list are stale.
2. **Lightness betweenness is refuted, not merely unproven.** 14 of the 16 published non-monotone
   midpoints are reviewed acceptable-or-strong, including the single largest excursion in the corpus
   (reviewed `strong` twice) and one A/B where the reviewer *preferred* the non-monotone midpoint over
   its monotone rival. Shipping betweenness would break 14 verdict-backed outcomes to fix 2.
3. **Transition-zone fidelity is a recall problem, not a guard problem.** The reviewer's named colour
   for the sunset would pass *every* guard. It is never built: across 72 gradient artworks averaging
   336 midpoint-carrying candidates each, only **2.5 distinct midpoint colours** are ever offered.

**Bonus, and the most durable result:** the seven midpoint anchors that set the ΔE 3.3 bar — provenance
concern #7, "no experiment record" — are now attributed to specific verdict records, re-derived with the
shipped `perceptualDifference`, and **the documented CAVEAT on the bar is refuted by a de-confounded
rerun the caveat's five citation sites never saw.** Two documentation defects follow; see §5.

---

## 1. Thread 1 — the chord-deviation endpoint-proximity veto

### 1.1 The premise is stale

The defect as recorded (`adversarial-logic/REVIEW.md` §2 = F2, confirmed `VERDICTS.md` §5, carried
forward on `graveyard-audit/REPORT.md:93,137`) is this code, quoted in the review at `palette.ts:226-229`:

```ts
// A midpoint that is merely one of the endpoints again carries no information and would
// render as the same two-stop ramp.
if (Math.min(okDistance(evidence.oklab, winner.background.oklab),
             okDistance(evidence.oklab, winner.surface.oklab)) < familyBinStep) return NO_MIDPOINT
```

That code is **not on trunk**. It was removed in `83ee25b` ("v2-3: integrate Track B2 midpoint
distinctness + render-truthful accent scale (reviewed)") and replaced by an explicit CIE76 distinctness
test. `palette.ts:234-247` now carries a tombstone comment saying so, and the replacement lives in
`earnedRenderMidpoint` (`palette-core.ts:3201-3215`) as
`ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE = policy.distinctness.sameColor = 3.3`.

The brief's fix candidate and the shipped fix are the same object. Nothing to do.

### 1.2 What the guards actually kill at trunk

Every gradient candidate carrying `fieldMidpoint` evidence, 175 artworks:

| | count | share |
| --- | --- | --- |
| candidates carrying midpoint evidence | 24,186 | |
| killed by the chord-deviation guard | 5,506 | 22.8% of all |
| pass chord deviation | 18,680 | |
| also pass ΔE ≥ 3.3 distinctness | 14,172 | |
| **killed by distinctness alone** | **4,508** | **24.1% of chord-passers** |

Against the historical record: F2 measured 44% killed by the second guard, `VERDICTS.md` §5 re-measured
53% on-panel and 57% across all three corpora. **Trunk is at 24.1%.**

**Apples-to-apples, on the same on-panel set `VERDICTS.md` §5 used.** The denominators land within 0.3%
of each other, so this is a like-for-like comparison and not a corpus artifact:

| | `VERDICTS.md` §5 (on-panel) | trunk `81c694f` (on-panel) |
| --- | --- | --- |
| candidates carrying midpoint evidence | 3,634 | 3,624 |
| pass chord deviation | 2,406 | 2,344 |
| also pass distinctness | 1,135 | **1,631** |
| **killed by the second guard alone** | **1,271 (53%)** | **713 (30.4%)** |
| artworks losing 100% of chord-passers | 6 (`placebo`, `slim`, `birdsofprey`, `havana`, `horsley`, `infected`) | **2 (`infected`, `slim`)** |

The 100%-kill set has collapsed. Corpus-wide it is 7 of 175 — `00087b13`, `000285d1`, `00094487`,
`000d8049`, `000f8156`, `infected`, `slim`. `placebo`, F2's headline case at 275→0, now has **155
chord-passers → 105 survivors**.

### 1.3 Are the remaining 24% legitimate?

Yes, and the near-bar evidence is unusually clean. 72 of 175 artworks publish a gradient; 38 publish a
midpoint, 34 do not. Of the 34, fourteen are suppressed by the distinctness bar alone. Sorted by how
close they came:

| artwork | ΔE | band midpoint | latest verdict on the no-midpoint form |
| --- | --- | --- | --- |
| `0014adcd` | 3.18 | `#046a54` → `#026958` → `#0a2f7d` | L140 `review-19-fresh` **strong** (equal) |
| `placebo` | 3.01 | `#6c8a8a` → `#718785` → `#86a5aa` | **refused twice** — L80 (preference-level, all four roles identical), L92 (note: "shadows … not the vibe") |
| `00044a28` | 2.74 | `#beb4b5` → `#bdb8bc` → `#dfdde0` | L101 **strong** (equal) |
| `000e91d6` | 2.59 | `#383838` → `#333335` → `#1a1a1c` | L352 `ae-batch` **strong** |
| `000637ff` | 2.58 | `#424436` → `#2d2b16` → `#2f2e1c` | **refused** — L98, de-confounded A/B (see §5) |
| `00100a3e` | 1.78 | | L64 **acceptable** (equal) |
| `001031d1` | 1.65 | | L384 `ae-confirm` **strong** (equal) |
| `000c5e69` | 1.26 | | |
| `00014fb4` | 1.05 | | |
| `000d8049` | 1.04 | | |
| `slim` | 1.00 | | **refused** — L81, batch-12 anchor |
| `000a2927` | 0.85 | | |
| `00106383` | 0.71 | | |
| `muse` | 0.00 | `#000000` → `#000000` → `#026faa` | **refused** — L78, batch-12 anchor |

Blast radius of moving the bar, over the 72 gradient winners:

| bar | winners publishing a route-B midpoint | vs 3.3 |
| --- | --- | --- |
| 2.50 | 39 | +5 (`00044a28`, `0014adcd`, `000637ff`, `000e91d6`, `placebo`) |
| 3.00 | 36 | +2 (`0014adcd`, `placebo`) |
| **3.30** | **34** | **—** |
| 3.65 | 31 | −3 (`0005fa7c`, `00099f42`, `once`) |

**The bar sits in a real gap: no gradient winner's midpoint scores between 3.18 and 3.63.** Every case it
would newly admit is either an explicit refusal (`placebo` 3.01, `000637ff` 2.58, `slim` 1.00, `muse`
0.00) or currently reviewed strong/acceptable in its no-midpoint form. Every case it would newly reject
is a reviewed acceptance. **The bar is correct in both directions. Do not move it.**

### 1.4 The one surviving chord-position heuristic

The brief's phrase "chord-position heuristic" does still describe live code, but not in route B. The
transition-path route (`gradient-support.ts:143-145`) accepts an intermediate stage only when

```ts
spatialHalfwayDelta <= 0.2 && colorHalfwayDelta <= 0.2 && directPathDifference >= familyBinStep
```

where `colorHalfwayDelta = |colorPosition − 0.5|` — i.e. the stage's projection on the endpoint chord
must lie in [0.30, 0.70]. That *is* an endpoint-proximity rule in chord-position currency.

Measured footprint over the same 175 artworks: **17 candidate intermediate stages exist in total**; 5
fail the spatial rule, 4 fail the colour rule, 11 fail the direct-path rule, 2 are accepted, and
**exactly 1 is killed by the colour-position rule alone**. Route A supplies exactly one published
midpoint in the whole corpus (`birdsofprey`).

Per charter rule on deletion claims, one firing in 175 is **not** evidence a mechanism is dead, and I am
making no such claim. What I am reporting is that changing this rule cannot be justified on measured
impact: any intervention here is a 1-artwork change with no verdict pointing at it. Note also that the
rule is not purely cosmetic — it feeds path *eligibility*
(`gradient-support.ts:194-195`: `eligible = … && (!crossHue || midpointSupport !== null)`), so touching
it is a gradient-neutrality change, not a midpoint-only change. It needs its own arm and its own batch.

---

## 2. Thread 2 — should a midpoint be tonally between its endpoints?

**Measured, and refuted.** A lightness-betweenness constraint is not derivable from this corpus; the
corpus actively contradicts it.

Of the 38 published midpoints, **16 sit outside their endpoints' OKLab-L span** (42%). Sorted by
excursion, with the latest verdict on each:

| artwork | excursion | dir | bg → mid → surface | latest verdict |
| --- | --- | --- | --- | --- |
| `00002947` | **0.2126** | brighter | `#2e2e2e` → `#676767` → `#1a1a1a` | **strong ×2** (L209, L367) |
| `00093627` | 0.1371 | darker | `#4c4032` → `#211f22` → `#85684a` | acceptable — **"weird artifact"** |
| `00034b1c` | 0.0985 | darker | `#281832` → `#0a0718` → `#273d77` | **strong ×2** (L325, L372) |
| `0013bebc` | 0.0736 | brighter | `#a5b1c1` → `#c7c7c7` → `#65758e` | strong (L256), acceptable (L266) |
| `000c4fb7` | 0.0635 | darker | `#1e4ece` → `#3433b2` → `#9953d8` | acceptable (L375) |
| `00081dec` | 0.0436 | brighter | `#6c7487` → `#bdcdda` → `#c7b9b6` | **strong** (L94) |
| `doja` | 0.0402 | brighter | `#fd75b5` → `#ff8cc6` → `#fd3d86` | **strong ×2** (L82, L378) |
| `00053183` | 0.0346 | darker | `#7c4a27` → `#6f4221` → `#e7962b` | acceptable — **"a bit of banding"** |
| `00079607` | 0.0321 | brighter | `#ab2266` → `#726198` → `#1f636c` | strong (L232), acceptable (L366) |
| `000913b3` | 0.0305 | darker | `#491734` → `#3f112b` → `#514249` | **strong** (L364) |
| `0010b864` | 0.0246 | darker | `#140210` → `#080309` → `#113b63` | strong (L243), acceptable (L323) |
| `00117a3f` | 0.0187 | darker | `#07395c` → `#023749` → `#095f5c` | **strong** (L56) |
| `0005fa7c` | 0.0112 | brighter | `#e6eef1` → `#f0f0f0` → `#e0cece` | **strong ×2** (L180, L348) |
| `0006bcb4` | 0.0087 | brighter | `#3a2922` → `#ae8c80` → `#ac8b6c` | acceptable (L200) |
| `000f723f` | 0.0079 | brighter | `#2a0c54` → `#2c0b5a` → `#09060d` | **strong ×2** (L335, L382) |
| `000b096f` | 0.0001 | brighter | `#083808` → `#003900` → `#001802` | **strong ×2** (L118, L361) |

**14 of 16 are reviewed acceptable-or-strong with no midpoint complaint.** Only two drew one, and their
stated reasons differ from each other and from betweenness:

- `00093627` (calib-3), the brief's thread-2 case: *"the midpoint is weird, the field now looks like
  beige-brown → black → beige-brown which feels more like a weird artifact and less like a smooth
  gradient."*
- `00053183`: *"It is visually very close to the background, and not very close to the surface … a bit
  of banding."* That is an **asymmetry** complaint (|mid−bg| ≪ |mid−surface|), not a betweenness one.

### 2.1 The three facts that kill the hypothesis

1. **The largest excursion in the corpus is a reviewed success.** `00002947` puts `#676767` (L 0.514)
   between `#2e2e2e` (L 0.301) and `#1a1a1a` (L 0.218) — an excursion of 0.2126, an overshoot of ΔE
   24.66, structurally identical to calib-3's complaint ("grey → *lighter grey* → grey" vs "beige-brown
   → black → beige-brown"). Reviewed **strong** twice, once as an explicit A/B win for trunk.
2. **A head-to-head where the reviewer chose the non-monotone midpoint.** Verdict L325, batch
   `ma-revival`, artwork `00034b1c`:
   - `ma-off`: `#281832` → **`#0a0718`** → `#273d77` (midpoint darker than both, excursion 0.0985)
   - `ma-on`: `#2b0f25` → `#0e3c7a` → `#143471`
   - Preference **`ma-off`**, verdict **strong**. Betweenness would delete the preferred side's midpoint.
3. **Any parameter-free version is brittle at the bottom.** `000b096f`'s excursion is **0.0001** in
   OKLab L — an overshoot of ΔE 0.00, invisible — and its midpoint is reviewed strong twice. A strict
   betweenness predicate (which is what "parameter-free" buys) kills it. Rescuing it requires a
   tolerance, i.e. a new constant, i.e. the property the brief valued is gone.

**Blast radius if shipped anyway:** 16 of 38 published midpoints removed (42%), of which 14 are
verdict-backed acceptable-or-strong and 2 are the complaints it was meant to fix. Under the charter's
mover rule these are not automatically regressions — the no-midpoint destinations are largely
unadjudicated — but "break 14 reviewed-good outcomes to fix 2" is not a trade worth a review batch.

**What actually distinguishes calib-3 remains unmeasured.** Neither betweenness, nor excursion
direction (both approved and complained-about cases exist in each direction), nor "midpoint farther from
both endpoints than they are from each other" (`00002947` satisfies it and was approved) separates the
two complaints from the fourteen approvals. The `palette-core.ts:3185` note — *"Whatever distinguishes
field material from shadow material is not yet measured"* — still stands, and lightness is now
positively excluded as the answer.

---

## 3. Thread 3 — transition-zone fidelity

### 3.1 The sunset, `00048db3`

Reviewer, twice (L302, L303): *"the midpoint could be better if it was more purple/pink: the artwork is
a sunset, and there is clearly a purple-pink zone (maybe Equestrienne?) between the Blue Iris main sky
and the Lox sun."*

Published: `#375593` → `#535997` → `#e89078`. Named target Equestrienne `#ac6b8a`.

**Where Equestrienne falls relative to every guard**, taken as the midpoint of the published endpoints:

| guard | value | bar | result |
| --- | --- | --- | --- |
| route-A colour-halfway (chord position) | **0.572** | must be 0.30–0.70 | **PASS** |
| chord deviation \|M − chordMid\| | **0.0520** | ≥ 0.040 (1 bin step) | **PASS** |
| distinctness ΔE to endpoints | **41.2 / 36.3** | ≥ 3.3 | **PASS** |
| perpendicular offset from the chord | 0.0457 | — | genuinely off-chord |

**No guard rejects the reviewer's colour. Nothing "ranks it out" either — it is never built.** Across all
**506** gradient candidates carrying midpoint evidence on this artwork, only **three distinct midpoint
colours** exist: `#535997`, `#3c5492`, `#251d28` — all blue or near-black. The nearest to Equestrienne is
`#535997` at **ΔE 35.3**.

The transition-path route, which is the machinery that could stage through an intermediate family, is
ineligible here for five recorded reasons: *"no source-connected low-step spatial progression joins the
endpoints; transition stages leave a large spatial discontinuity; transition family sequence reverses
perceptual progression; transition family sequence is perceptually circuitous; transition has no
color-intermediate family inside the endpoint interval."*

### 3.2 The twice-stated `127e4552` ask

Reviewer, twice (L295, L338): *"the gradient could be stronger with a bleu ciel (background) → linen
(midpoint) → amber (surface) gradient."*

Published: `#0278a8` → `#0093bf` → `#eaecdf`. **Partly reachable, but not as a three-stop.**

- An amber-surfaced candidate exists and ranks well: `bg #0278a8` (that *is* Bleu Ciel) / `surface
  #e5bd75` (amber/gold). So the endpoints of the ask are in the domain.
- Its midpoint is `#0093bf` — the blue, not linen.
- A linen-like midpoint `#eee7cb` is offered, but only on a *different* candidate whose surface is
  `#91c1c5` (pale teal).
- Again only **3 distinct midpoint colours** exist across 430 candidates.

**No candidate pairs an amber surface with a linen midpoint, so the three-stop the reviewer asked for is
not reachable.** This is recall, not ranking.

### 3.3 The structural cause, generalised

The route-B midpoint is the **modal** colour of the band `FIELD_MIDPOINT_BAND = [0.42, 0.58]` of the
fit's own geometry (`palette-core.ts:3239-3277`) — one winner-take-all colour per fit. So the number of
midpoint colours an artwork can ever offer is bounded by the number of distinct fits, not by the number
of candidates.

Over the 72 artworks with midpoint-carrying gradient candidates (mean **336** candidates each):

| distinct midpoint colours offered | artworks |
| --- | --- |
| 1 | 17 |
| 2 | 18 |
| 3 | 24 |
| 4 | 13 |

**Mean 2.5, median 3, maximum 4.** The guards are choosing among about three colours, not ranking a rich
set. A transition zone that is real but not *modal* in the band cannot surface at any bar setting.

**Direction for a future arm (not attempted here):** make `fieldMidpointEvidence` return a ranked *set*
of band representatives rather than the single mode, subject to the existing representativity standard
(`densitySupported` + `fieldLike`, so charter rule 4 still holds and nothing snaps to a lone pixel). That
is a candidate-generation change with a real blast radius, and it needs its own arm, its own gradient
neutrality measurement, and its own batch. It is the only route to either of the two standing asks.

---

## 4. Verification bar

| check | result |
| --- | --- |
| trunk base | reset to `81c694f`; worktree was stale at `bb979dc` |
| algorithm bytes changed | **none** — `git diff 81c694f` over tracked files is empty; the arm is additive in `research/v2-3-experiments/midpoint-fidelity/` only |
| typecheck `research/v2-3/tsconfig.json` | pass |
| typecheck `research/v2-3-experiments/midpoint-fidelity/tsconfig.json` | pass |
| `research/v2-3/test/architecture.test.ts` | 2/2 pass |
| `research/v2-3/test/configuration.test.ts` | 10/10 pass |
| determinism | `probe.ts` on `placebo.jpg` run twice → byte-identical output |
| targeted parity | probe's published winner cross-checked against `review-fixtures.ts` (35 fixtures; 31 parsed by the extraction regex): **31 compared, 31 match, 0 mismatch** on all four role hexes + gradient flag + midpoint hex |
| movers | none — no mechanism, no movers to adjudicate |
| gradient neutrality | not applicable — no change to gradient allow/prevent in either direction |

Machine budget honoured: sweep ran 4 worker processes with `VIPS_CONCURRENCY=1`, checkpointed one
result file per artwork and resumable (`sweep.ts`); interactive probes never exceeded 2 concurrent.

---

## 5. Documentation defects found (for the orchestrator — I did not edit trunk)

Both are comment-only. Neither changes behaviour; `assert.equal(distinctness.sameColor, 3.3)` stands.
Per the charter ("tracks do not merge themselves"), I am reporting rather than editing.

### 5.1 The CAVEAT on the ΔE bar is refuted

`palette-core.ts:3179-3185` states:

> CAVEAT. This bar is known to be over-strict by at least one case: a midpoint at 3.30's far side
> (ΔE 2.58) was carried by a *preferred* reviewed output.

The case is `000637ff`, verdict **L96** (`review-14-b2`): preference `trunk-b7`, which carried both the
midpoint `#2d2b16` **and** an accent change `#99a192` → `#a57e57`. The caveat correctly notes the
confound.

**There is a later, de-confounded rerun that the caveat's five citation sites never cite.** Verdict
**L98** (`review-15-white-fg-fresh`), same artwork:

- `trunk-b7`: `#424436` → **`#2d2b16`** → `#2f2e1c`, fg `#f6f5f1`, accent `#a57e57`
- `trunk-h5`: `#424436` → **(none)** → `#2f2e1c`, fg `#f6f5f1`, accent `#a57e57`

All four roles identical; the **only** difference is the midpoint. Preference: **`trunk-h5`, the
no-midpoint side**, verdict **strong**.

Once the accent confound is removed, the reviewer went **against** the ΔE 2.58 midpoint. The bar is not
known over-strict — the case cited against it supports it. Affected sites (all carrying the same claim):
`palette-core.ts:3179-3185`, `research/v2-3/src/internal/policy.ts`,
`research/v2-3/test/configuration.test.ts:562-567`, `track-p/AGENDA.md:230-237`,
`track-p/LEDGER.md:228`, `provenance-hygiene/REPORT.md:96`.

### 5.2 Arithmetic: `62.59` should be `62.58`

Re-derived with the shipped `perceptualDifference` (`color.ts:105`), `birdsofprey`'s midpoint `#1880a7`
against background `#141975` is **62.5847** → 62.58. Every trunk site prints 62.59. This is the second
arithmetic slip in the same comment block (`track-p/LEDGER.md:115` already caught "Six"/seven).

### 5.3 Provenance concern #7 is closed

`provenance-hygiene/REPORT.md:95` — *"The seven midpoint anchors have no experiment record."* They do
now. All seven, plus the caveat case, attributed to verdict records and re-derived with the shipped
`perceptualDifference`:

| ΔE | artwork | verdict record | isolation | outcome |
| --- | --- | --- | --- | --- |
| 0.0000 | `muse` | L78 `review-12-midpoints` | clean (only midpoint differs) | **refused** |
| 1.0007 | `slim` | L81 `review-12-midpoints` | clean | **refused** |
| 2.5766 | `000637ff` | **L98** `review-15-white-fg-fresh` | clean | **refused** |
| 3.0079 | `placebo` | L80 `review-12-midpoints` | clean | **refused** |
| 3.6352 | `once` | L79 `review-12-midpoints` | clean, no preference | accepted (both sides strong) |
| 9.7793 | `doja` | L82 `review-12-midpoints` | preferred | accepted |
| 19.7491 | `loups` | L28 `review-5-midpoints-alternatives` | clean | accepted |
| 62.5847 | `birdsofprey` | L11 `review-2-gradients` | midpoint value A/B'd | accepted |

Four refusals below the bar, four acceptances above, **nothing between 3.01 and 3.64**, and every
refusal now A/B-isolated. That is a stronger footing than the comment claims for itself. Two residual
weaknesses worth carrying: the 3.64 anchor (`once`) rests on an unnoted no-preference tie, and the
62.58 anchor's record has an empty note.

---

## 6. Review batch

**None proposed.** No mechanism ships, so there is nothing to put in front of a human: no `mf-off` /
`mf-on` labels, no mirrored extractions, no manifest. Manufacturing a batch to satisfy the deliverable
shape would spend one of the reviewer's scarce 4–10-item slots on a null result.

The one thing worth a future batch is §3.3's ranked-band-representative idea, and it is not ready — it
needs an arm that builds it and measures gradient neutrality in both directions first.

---

## 7. Honest self-assessment

- **Confidence high** on thread 1 (the code is simply not there; kill rates re-measured on the
  unscrambled corpus) and on the anchor attribution (independently re-derived with the shipped
  function; every record read directly from `verdicts.jsonl`).
- **Confidence high** on thread 2's refutation. The A/B at L325 and the twice-strong `00002947` are not
  ambiguous, and they point the same way.
- **Confidence high** that Equestrienne is not in the sunset's candidate set (ΔE 35.3 to the nearest of
  three colours is not a near miss); **moderate** on the claim that this generalises to "the band mode is
  the binding constraint" — I measured the *count* of distinct midpoints, not a counterfactual where the
  band returns a set. A future arm should verify by building it.
- **Not measured:** whether relaxing route A's `colorHalfwayDelta` would change gradient allow/prevent
  decisions. I measured stage acceptance, not downstream path eligibility outcomes. I therefore make no
  claim about that rule beyond its 17-stage footprint, and explicitly do **not** claim it is dead.
- **Not measured:** what distinguishes calib-3's "weird artifact" from `00002947`'s approved
  equivalent. I tested three hypotheses and all three failed. This remains open.
- **A negative result is the deliverable here.** Three plausible mechanisms were proposed by the brief;
  all three are measurably wrong or already shipped. The corpus said so, not me.

---

## Files

- `probe.ts` — per-artwork instrumentation. Replays the internal candidate construction (same sequence
  as `research/v2-3-eval/export-candidates.ts`, same read-only standing outside `research/v2-3/`) and
  dumps, per gradient candidate carrying midpoint evidence: chord deviation vs its bar, ΔE to each
  endpoint vs 3.3, OKLab-L excursion beyond the endpoints' span, band evidence; plus every transition
  path's intermediate stages with the three route-A guards resolved individually.
- `sweep.ts` — resumable 4-worker driver, `VIPS_CONCURRENCY=1`, one result file per artwork, reads
  artwork from the shared checkout only, excludes the four vetoed artworks.
- `analyze.ts` — corpus aggregation: guard accounting, gradient-winner suppression table, published
  midpoint betweenness table, route-A stage accounting.
- `tsconfig.json` — mirrors `research/v2-3-eval/tsconfig.json`; typechecks clean.

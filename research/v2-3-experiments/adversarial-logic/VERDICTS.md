# Verdicts on the zero-effect claims in `REVIEW.md`

Follow-up to `REVIEW.md` at the coordinator's request. **No deletions were made and no
file under `research/v2-3/` was touched.**

---

## 0. Root cause: `REVIEW.md` measured the wrong corpus

`images/` **as tracked in git contains only the `-scrambled` decoys.** The reviewed corpus
— `birdsofprey.jpg`, `loups.jpg`, … — is gitignored and exists only in the shared checkout
(`/Users/Flo/github/palette/images/`, 71 files: 34 originals + 34 scrambles + 3 maroon5
variants). A fresh worktree therefore checks out the decoys under the same directory name,
and every probe in `REVIEW.md` silently ran on them.

Scrambling permutes pixel blocks. It preserves the colour histogram — so family formation,
lanes, representatives, marks and obligations all still look plausible — and destroys
precisely the *spatial* structure that field domains, region graphs, gradient fits and
transition paths consume. That is why the scrambled run showed near-zero yield for exactly
the four mechanisms in question.

Direct demonstration (`verify-corpus.ts`, public `extractPalette` entry point):

| | background | surface | foreground | accent | gradient | midpoint |
| --- | --- | --- | --- | --- | --- | --- |
| `images/birdsofprey.jpg` (reviewed) | `#141975` | `#3fa72a` | `#030102` | `#d02981` | **true** | **`#1880a7`** |
| `images/birdsofprey-scrambled.jpg` | `#181677` | `#181677` | `#40cbac` | `#bcddb0` | false | none |
| `images/loups.jpg` (reviewed) | `#fa7b34` | `#ebda8a` | `#fde5d9` | `#fab14a` | **true** | **`#fdc568`** |
| `images/loups-scrambled.jpg` | `#fdb151` | `#fdd98d` | `#fc4a0e` | `#f98c37` | true | none |

The coordinator's two counter-examples are exactly right, and `#1880a7` is reproduced
byte-for-byte on the original.

**Everything below was re-measured on three corpora**, all through the same probes:

| corpus | n | source |
| --- | --- | --- |
| **on-panel originals** | 34 | `/Users/Flo/github/palette/images/*.jpg\|avif`, excluding `-scrambled`/`-masked`/`-saliency`/`-original` |
| **off-panel reviewed** | 24 | the `ab67616d…` artworks appearing in `research/v2-3-eval/data/verdicts.jsonl`, resolved out of the `<2-hex>/` artwork cache |
| **off-panel fresh** | 60 | deterministic stride sample of the 4,618 full-size (`ab67616d0000b273…`) cached artworks that were never reviewed |

**118 artworks in total.** The fresh sample earned its keep: it is the only corpus on which
two of the four mechanisms below can be shown to fire at all.

Probes and artifacts (all committed beside this file):

| probe | artifacts |
| --- | --- |
| `probe-pipeline.ts` (now `IMAGES_DIR`-aware, and cross-checks against the real `extractPaletteDetails`) | `probe-results-originals.json` |
| `probe-verdicts.ts` (consolidated: refinements, domains, registry, obligations, eligibility, midpoint guards) | `probe-verdicts-originals.json`, `probe-verdicts-offpanel-reviewed.json`, `probe-verdicts-offpanel-fresh.json` |
| `probe-ablation.ts` (replays selection with and without every band-local-endpoint contribution) | `probe-ablation-originals.json`, `probe-ablation-offpanel-reviewed.json` |
| `verify-corpus.ts` | inline above |

**Blanket correction: every per-image count in `REVIEW.md` is superseded by the numbers
here.** The *static* findings in `REVIEW.md` (dead flags, duplicate code, unread policy
fields, `hardMinimum` being inert, the 135° render, the duplicated block lists) are
corpus-independent and stand unchanged; the *measured* ones are restated below.

---

## Verdict 1 — the native-field-transition stack: **LOAD-BEARING** (retract findings 4, 8; amend 5)

`REVIEW.md` claimed `transitionPromoted` 0/34 and "≈1,400 lines with zero measured effect".
**That is wrong.** On the reviewed corpus the stack fires on `birdsofprey.jpg` and produces
the reviewed `#1880a7` midpoint end to end.

### Which path produces `#1880a7` today

Traced through the real orchestration (`extractPaletteDetails`), with the staged replay
agreeing on the winner key:

| stage | file | measured on `birdsofprey.jpg` |
| --- | --- | --- |
| transition hypothesis built | `field-transition.ts` `discoverNativeFieldTransitions` → `hypothesisForCandidate` | winner's field hypothesis is `field-transition:field-transition-domain:64081:72976:family-3302:family-6753` |
| envelope credits it | `transition-normalization.ts` | `creditedHypothesisIds` = **1** |
| candidates earn the transition | `transition-promotion.ts` `evaluateTransitionCandidates` | `earnedNativeTransition` = **94** |
| promotion gate | same, `promotionEligible` | **8** |
| descriptor/lineage filter | `palette.ts:139-149` + `source-eligibility.ts` | **8** survive |
| quality envelope | `winner-scoring.ts` `promotionEnvelopeUtility`, `PROMOTION_ENVELOPE = "field-axis-neutral"` | **8** admitted, and `envelopeChoiceMatters = true` — the `"quality-utility"` setting admits a **different** set |
| promotion ordering | `palette.ts:87-100` `compareTransitionCandidates`, `TRANSITION_PROMOTION_ORDER = "coverage-first"` | `promotionOrderMatters = true` — `"quality-after-decisive"` picks a **different** winner |
| winner replaced | `palette.ts:154-163` | `transitionPromoted = true` |
| supported path | `gradient-support.ts` `discoverSupportedNativeFieldTransitionPaths` → `evaluatePath` | **1 eligible path**, `crossHue` true |
| midpoint minted | `gradient-support.ts` `midpointDescriptor` | `kind: "source-supported-three-stop"`, **`origin: "transition-path-stage"`**, hex **`#1880a7`** |
| render | `palette.ts:265-272` `applyGradientSupport`, `selectedGradient = true`, `path.eligible = true` | transition midpoint shipped |

**Every component of the stack is exercised, including both flags the campaign added.**
`PROMOTION_ENVELOPE = "field-axis-neutral"` and `TRANSITION_PROMOTION_ORDER` each change the
promoted candidate on this image — they are not dead flags, they are single-case-critical
flags. Track B's report is correct: `#1880a7` comes from the transition route
(`origin: "transition-path-stage"`), which is a different discriminated member from their
H4 field-midpoint route.

### Exact subset that is dead vs load-bearing

| corpus | credited transitions | promoted | eligible supported paths |
| --- | --- | --- | --- |
| on-panel originals (34) | 1 (`birdsofprey`) | 1 | 1 (`birdsofprey`) |
| off-panel reviewed (24) | 0 | 0 | 0 |
| off-panel fresh (60) | 0 | 0 | 0 |
| **total (118)** | **1** | **1** | **1** |

**Verdict: LOAD-BEARING, single-case. Nothing in `field-transition.ts`,
`transition-normalization.ts`, `transition-promotion.ts` or `gradient-support.ts` is safe to
delete.** The firing rate is low (1/118 artworks), which is a *coverage* question, not a
*deletion* question. `REVIEW.md`'s recommendation "(b) delete the stack" is withdrawn; only
"(a) loosen the endpoint gate and re-review" remains on the table — and any such change must
hold `birdsofprey`'s `#1880a7` fixed as a regression case.

### Amendment to finding 5 (guard bypass)

The residual observation survives in weaker form. `applyGradientSupport` consults the
supported-path evidence only when `selection.transitionPromoted` is true
(`palette.ts:261`), so on the originals **10 of the 11 gradient winners never meet that
guard** — only the promoted `birdsofprey` does. That is a real asymmetry (a gradient that
wins without promotion is never checked against supported-path evidence), but it is a
*scoping* defect, not dead code. The eager evaluation at `palette.ts:371` is still wasted on
the 33 images that do not promote (measured cost §5).

---

## Verdict 2 — diffuse-composite field domains: **LOAD-BEARING AND NECESSARY** (retract finding 7; no regression)

Not a regression. The scrambled corpus produced 0 eligible composite domains; the real one
produces them, and where they appear they are the *only* eligible field domain.

| corpus | diffuse-composite built | eligible | winners sourced from one |
| --- | --- | --- | --- |
| on-panel originals (34) | 131 (17 images) | **1** | **1** — `loups.jpg` |
| off-panel reviewed (24) | 102 | **1** | **1** — `ab67616d0000b2730011c0148119c34e2b222b02` |
| off-panel fresh (60) | 190 | **1** | **1** — `ab67616d0000b2730009c2dd5741607573357700` |
| **total (118)** | **423** | **3** | **3** |

Every eligible composite domain in 118 artworks produced the winner. All three appear on
artworks whose *lane* walk found nothing (`connected` eligible = 0).

`loups.jpg`: winner hypothesis
`gradient:diffuse-field-domain-0:linear:vertical:family-7363:family-9924:#fa7b34:#ebda8a`,
and its domain census is `diffuse-composite {total 1, eligible 1}`, `connected {total 47,
**eligible 0**}`. **Without Track D, `loups` has no eligible field domain at all**, so it
could not produce a gradient hypothesis from any fit. The reviewed-strong `#fa7b34 → #ebda8a`
gradient with midpoint `#fdc568` exists only because of the composite pass.

The two off-panel cases are the same shape and are independent evidence:
`ab67616d0000b2730011c0148119c34e2b222b02` (`connected` 39/**0**, `diffuse-composite` 9/1,
winner `gradient:diffuse-field-domain-147:linear:diagonal-down:…`) and
`ab67616d0000b2730009c2dd5741607573357700` (`connected` 46/**0**, `diffuse-composite` 2/1,
winner `gradient:diffuse-field-domain-0:linear:vertical:…`).

Across the 118 artworks, **7 have no eligible `connected` domain at all** and depend entirely
on the composite or paired-corridor passes for any field domain. Two others show the same
rescue by the *paired corridor* pass — `muse.jpg` (`connected` 0 eligible, `paired-corridor`
2 eligible, winner `gradient:paired-field-domain:field-domain-0+field-domain-119434:…`) and
`vvbrown.jpg`. Paired corridors: 21 eligible domains across the three corpora, 1 winner
(`muse`).

Why the 130 other composites fail (on-panel rejection histogram, off-panel identical in
shape): `owns fewer than two native corner fields` 101, `population below 0.08` 93,
`weighted field score below 0.35` 43. The mechanism is deliberately narrow, not broken.

**Verdict: LOAD-BEARING. Do not delete. Track D's "reviewed strong" verdict is reproducible
on the real corpus.** My probe measured the same flag the pipeline consumes
(`BackgroundFieldDomainEvidence.eligible`, the flag `fitGradients` filters on at
`palette-core.ts:2039`); the discrepancy was 100 % corpus, 0 % instrumentation. No bisect is
warranted — I confirmed there is nothing to bisect by reproducing the good output at HEAD.

---

## Verdict 3 — band-local endpoint refinement: **LOAD-BEARING (rare) — the off-panel cross-check overturned my own conclusion**

I was about to file this as "confirmed dead". The coordinator's instruction to cross-check
off-panel is what caught it: **on the fresh 60-image sample, one artwork's winner is an
`endpoint-refinement:` hypothesis.**

`ab67616d0000b2730006fa52a9a3618760b52b19.jpg` →
`endpoint-refinement:band-local-refinement:field-domain-0:linear:diagonal-up:family-8114`
(1 of 6 refinements accepted; `connected` domains 30 built / 1 eligible).

### Firing rate across all three corpora

| corpus | attempted | accepted | images with ≥1 acceptance | **winners** |
| --- | --- | --- | --- | --- |
| on-panel originals (34) | 209 | 9 | 4 (`birdsofprey`, `havana` ×5, `infected` ×2, `nada`) | 0 |
| off-panel reviewed (24) | 160 | 7 | 6 | 0 |
| off-panel fresh (60) | 378 | 18 | 10 | **1** |
| **total (118)** | **747** | **34** | **20 (17 %)** | **1 (0.8 %)** |

`REVIEW.md`'s "2 of 186 acceptances" was a scrambled-corpus artefact; the real acceptance
rate is ~4.5 % of attempts and 17 % of images.

### Ablation on the two reviewed corpora (still valid, and still negative there)

"Never wins" is weaker than "no effect", because an accepted refinement also injects
band-local families into `augmentedNative` (`candidate-domain.ts:147-169`), which feeds
supplemental treatment construction and the role classifier. `probe-ablation.ts` replays the
selection twice — as shipped, and with the `band-local-endpoint` field hypotheses dropped
*and* the un-augmented `evidence.native` substituted — and diffs the winner key.

**Result: `winnerChanged = false` on 34/34 on-panel and 24/24 off-panel-reviewed**, including
every image that accepted a refinement. So on the 58 *reviewed* artworks the mechanism is
genuinely inert — but that is a statement about those 58, not about the mechanism, and the
59th artwork disproves the general claim.

*Ablation caveat, stated honestly:* the harness compares the **source-eligible winner**, i.e.
the state just before transition promotion. It is sound for this question because band-local
descriptors carry `sourceType: "band-local-endpoint"` and promotion admits only
`native-field-transition` descriptors (`transition-promotion.ts:77`), so an unchanged
promotion baseline plus an unchanged transition set implies an unchanged promoted winner.
`birdsofprey` is the only promoted image and its baseline is identical in both arms.

### The cost

Single-pass stage timings, on-panel originals (34 images, `probe-verdicts-originals.json`):

| stage | ms | share of the ~200 s single pass |
| --- | --- | --- |
| `buildPaletteSeedDomain` | 93,173 | 47 % |
| `buildBandLocalEndpointRefinements` | **46,900** | **23 %** |
| `diagnoseGradientFits` | 37,887 | 19 % |
| `scorePaletteCandidates` (full domain) | 9,523 | 5 % |
| `selectSourceEligibleWinner` | 5,601 | 3 % |
| `discoverSupportedNativeFieldTransitionPaths` | 4,780 | 2 % |

**Verdict: LOAD-BEARING but pathologically rare — 1 winner in 118 artworks for 23 % of
runtime. NOT safe to delete.** It is also structurally handicapped, which is the likely
reason for the 0.8 % win rate: `buildFamily` (`endpoint-refinement.ts:713-722`) hard-codes
`signatureScore`, `foregroundScore`, both observation scores, `markSupport` and
`observedComponentCount` to `0`, and `componentEvidence` marks components
`retainedFor: ["connected-support"]` only, so a band-local family can never earn a role or an
obligation. Its hypotheses can only ever win the *field*, never a role — which is exactly
what the one winning case does.

Recommended handling, in order: (i) **make it cheap** — the acceptance path needs ten
independent conditions across two bands, and 713 of 747 attempts fail; a cheap precondition
(e.g. require the upstream fit's `lowEndpointFamilyId === highEndpointFamilyId` *and* a
minimum band separation before reconstructing the domain) should remove most of the 23 %
without touching the 34 acceptances. (ii) Consider unblinding `buildFamily` so its families
can compete for roles, then re-review. (iii) Do **not** delete.

---

## Verdict 4 — source-eligibility filter: **INSURANCE, NOT A SELECTOR — keep, but stop paying selector prices**

Re-measured on the real corpora, the effect claim is **weakened, not confirmed** — the fresh
off-panel sample contains a case where the filter genuinely changes the winner:

| corpus | candidates filtered out | winner changed | max envelope margin (limit 0.12) |
| --- | --- | --- | --- |
| on-panel originals (34) | 10,912 / 43,444 (25 %) | 0 / 34 | 0.00000 |
| off-panel reviewed (24) | 7,920 / 32,707 (24 %) | 0 / 24 | 0.00000 |
| off-panel fresh (60) | 21,244 / 88,426 (24 %) | **1 / 60** | **0.03687** |
| **total (118)** | **40,076 / 164,577 (24 %)** | **1 / 118** | **0.03687** |

`ab67616d0000b273000b2d5eaf68496143681214.jpg` is the case: the unrestricted winner is not
source-eligible, the filter replaces it, and the substitute costs 0.037 of quality utility —
comfortably inside the 0.12 envelope, so no throw. So the filter *is* a live selector, just a
very rare one, and the `maximumQualityLoss` throw still has ~3× headroom at its worst
observed point.

**And the charter framing is right where `REVIEW.md`'s was not.** Rule 4 ("never snap a
synthesized color to a bare single pixel"; every shipped colour must be a real, supported
source pixel) is a *safety property*, and a safety property that rarely triggers is working,
not useless. `filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain` verifies complete
source lineage — canonical treatment identity, field connection, per-role anchor-family
agreement, representative bindings, and the normative one-colour emergency form — for every
candidate. Deleting it would remove the only place that check exists, and we now have a
measured case where it is the difference between shipping a lineage-complete palette and an
unsupported one.

The cost is not the check; it is the *architecture* around the check. Today
`selectSourceEligibleWinner` (a) filters 24 % of candidates and (b) **re-runs
`scorePaletteCandidates` over the survivors** to pick a winner from the filtered set — a
second full scoring pass (5.6 s / 34 images on-panel, 3 % of the pass) whose answer differed
from the unfiltered one on 1 of 118 artworks.

**Verdict: LOAD-BEARING — insurance that has actually paid out once. Keep the invariant;
restructure the cost.** Concretely: score once, take the unrestricted winner, *assert*
complete lineage on that single candidate, and fall back to the filtered re-score only when
the assertion fails. That is behaviour-identical (the fallback reproduces today's answer on
the one artwork that needs it), keeps a real failure path, turns a 43k-candidate scoring pass
into a single-candidate check on 117 of 118 artworks, and makes the guarantee legible as an
assertion instead of hidden inside a selector. Weigh it as ~3 % of a pass — worth doing for
clarity, not urgent for speed.

---

## 5. Re-measured numbers for the rest of `REVIEW.md`

All on the **on-panel originals (34)** unless stated. These supersede the corresponding
tables in `REVIEW.md`.

**Finding 1 (gradient geometry discarded at 135°) — confirmed, stronger.** 11 gradient
winners; detected geometries: `radial-center` 5, `radial-upper-center` 1, `linear/horizontal`
2, `linear/vertical` 2, `linear/diagonal-up` 1, **`linear/diagonal-down` (what 135° is) 0**.
Six of eleven are radial. Three ship a midpoint (`birdsofprey` transition-path-stage,
`doja` and `loups` field-midpoint-band).

**Finding 2 (midpoint endpoint-proximity veto) — confirmed, stronger.** On-panel: 3,634
gradient candidates carry midpoint evidence, 2,406 pass the chord test, 1,135 also pass the
endpoint test — **1,271 (53 %) killed by the second guard alone**. Across all three corpora:
**11,482 chord-passers → 4,948 both-passers, 6,534 (57 %) killed**. Per-image chord-pass →
both-pass for on-panel gradient winners: `doja` 360→360, `loups` 380→380, `muse` 310→150,
`once` 360→195, `orelsan` 300→50, `placebo` 165→**0**, `slim` 105→**0**, `birdsofprey`
137→**0**, `havana` 128→**0**, `horsley` 110→**0**, `infected` 51→**0**.

**Finding 3 (obligation-slot crowding) — confirmed.** Slots held by families with chroma <
`identityDirectionChroma` (0.06): on-panel 77/146 (53 %), off-panel reviewed 66/114 (58 %),
off-panel fresh 168/283 (59 %) — **311/543 (57 %) overall**.

**Finding 4 (ASCII tie-break) — confirmed, smaller.** Deciding comparison between the top two
frontier members: `relationUtility` band 14, **`compareAscii(key)` 9**, `single-frontier-member`
3, `band-extent-tiebreak` 3, `qualityUtility` band 2, raw `identityGain` 2,
`authorizedIdentity` band 1. So hex ordering decides 9/34, not 14/34.

**Finding 13 (ranking regimes) — re-measured.** Materialization cap binds on **24/34**
(so the lexicographic block ranking governs domain composition on 71 % of the corpus).
Quantized Pareto dominance changes the winner on **1/34**. The band-extent domination guard
changes the frontier's top pick on **1/34** (`orelsan`); removing `authorizedIdentity` from
domination changes it on **3/34** (`disney`, `slim`, `vvbrown`). Frontier size medians:
117 with both guards, 113 without band-extent, 108 without authorized identity.

**Finding 15 (redundant recomputation) — confirmed, on a much larger base.** The
all-ranked-lane proposal pass adds **24,847** non-control registry rows across all 118
artworks (8,296 on-panel + 5,359 off-panel-reviewed + 11,192 off-panel-fresh), of which
**0** are referenced by any treatment and **0** field-direction rows depend on one, on every
single artwork. A single pipeline pass is ~200 s / 34 originals; the avoidable
recomputation is `diagnoseGradientFits` (37.9 s, recomputing what `buildPaletteSeedDomain`
already produced) + the all-lane domains/fits pass (~37.9 s) + the duplicate region graph in
`discoverSupportedNativeFieldTransitionPaths` (4.8 s) ≈ **80 s, 40 % of a pass**. Note this
is now *additionally* justified: the duplicate region-graph build is only needed for the 1/58
artworks that promote.

**Mark substitution — confirmed load-bearing.** A winner role's support term is actually
raised by mark evidence on **29/34** on-panel artworks.

**Emergency band — confirmed inert.** `emergency.eligible` on 3/34 (`pureblack`, `purered`,
`purewhite`), always `degenerate-supported-domain`; the `emergencyMaximumAbsoluteLc = 5`
branch never fires.

---

## Summary table

| claim in `REVIEW.md` | verdict | evidence |
| --- | --- | --- |
| **F4** transition promotion never fires (0/34) | **RETRACTED — load-bearing** | 1/34 on-panel; `birdsofprey` `#1880a7` via `origin: transition-path-stage`; `PROMOTION_ENVELOPE` and `TRANSITION_PROMOTION_ORDER` both decisive there |
| **F5** every gradient winner bypasses the supported-path guard | **AMENDED** | 10/11 gradient winners bypass it; the guard is promotion-scoped, not dead |
| **F7** diffuse-composite domains: 0 eligible | **RETRACTED — load-bearing and necessary** | 1 eligible on-panel (`loups`, the only eligible domain it has), 1 off-panel (same pattern); no regression, nothing to bisect |
| **F8** transition stack ≈1,400 lines, zero output | **RETRACTED** | every component exercised by `birdsofprey` |
| **F8** endpoint refinement dead | **RETRACTED — load-bearing, rare** | fires on 20/118 images, **wins 1/118** (`ab67616d0000b2730006fa52a9…`); ablation negative on the 58 reviewed artworks only; 23 % of runtime |
| **F13** source-eligibility changes nothing | **WEAKENED — load-bearing, rare** | **1/118** winner changes (margin 0.037); keep the invariant, restructure the re-score into an assertion + fallback |
| **F1, F2, F3, F6, F14, F15** | **CONFIRMED** on the real corpus (numbers restated above) | |
| all static findings (dead flags, duplicate code, `hardMinimum` inert, 135° render, duplicated block lists) | **CONFIRMED** — corpus-independent | |

### Deletion safety, one line each

- `field-transition.ts`, `transition-normalization.ts`, `transition-promotion.ts`,
  `gradient-support.ts`, `PROMOTION_ENVELOPE`, `TRANSITION_PROMOTION_ORDER` — **DO NOT
  DELETE** (1/118, `birdsofprey` `#1880a7`; both flags decisive there).
- `fieldCompositeFamilyIds` / the diffuse-composite pass / the paired-corridor pass — **DO NOT
  DELETE** (3/118 and 1/118 winners; 7/118 artworks have no other eligible field domain).
- `endpoint-refinement.ts` and the `band-local-endpoint` source type — **DO NOT DELETE**
  (1/118 winner). Make it cheap and/or unblind `buildFamily`; do not remove.
- `selectSourceEligibleWinner`'s **filter** — **DO NOT DELETE** (1/118 winner change). Its
  **re-score** can become an assertion with a fallback to today's path.
- the all-ranked-lane proposal pass inside `buildPaletteSeedDomain` — **safe to delete**
  (0 of 24,847 rows used across 118 artworks; first-wins de-duplication at
  `palette-core.ts:3606-3609` makes it structurally impossible for one to matter). This is
  now the only *net-zero* deletion I can defend.

### Method note for whoever reviews this next

Two of my four zero-effect claims were corpus artefacts and a third was a sample-size
artefact. The pattern: **a mechanism that fires on 1 artwork in 118 is indistinguishable from
a dead one on any corpus smaller than ~100**, and this algorithm is full of such mechanisms.
Any future "safe to delete" claim about v2-3 should require (a) the unscrambled corpus, (b) a
fresh off-panel sample of ≥60, and (c) an ablation that diffs winners rather than a
firing-rate count.

# Track Q — endpoint-refinement internals, historical bisection, degeneracy gates

Base: `research/palette-0.9-checkpoint` at `c2366d2`.
Corpus: the real artwork only — `/Users/Flo/github/palette/images` (34 originals + 3 `maroon5` variants) and
the `<2-hex>/` sample cache under `/Users/Flo/github/palette/`. The corpus used is stated on every
measurement below; nothing here was measured on `-scrambled` decoys except where explicitly labelled
"scrambled", which is a determinism sweep, not evidence.

---

## Task 1 — endpoint refinement: unblind, and make it cheap

Two independent changes to `endpoint-refinement.ts`, in one commit each.

### 1(b) Make it cheap — **byte-identical**

**Finding.** `refineBandLocalGradientEndpointsWithDomain` gathers its rejection reasons in three
tiers, but the early return only fires for two of them:

```
if (!domain || parentFamilyIndex < 0 || lowFamilyId !== highFamilyId) return { … }
```

`upstream fit: …` reasons — the gradient fit already carries a rejection reason other than the
within-band dispersion this pass exists to resolve — are pushed into `rejectionReasons` and then
**ignored**: the function goes on to run `positionedDomain` and `measureBand` twice, each of which
allocates two `Uint8Array(pixelCount)` and flood-fills the band, for an attempt whose `accepted`
is already `false`. The caller pays even earlier: `buildBandLocalEndpointRefinements` reconstructs
the field domain (another whole-image flood fill) *before* asking.

Those reasons are **free** — `diagnostic.rejectionReasons` is already computed upstream — and they
are the *earliest* reliable signal, because they are known before a single pixel is read.

**Change.** `refusedBeforeDomain(diagnostic)` collects exactly the tests that need no pixels
(endpoints diagnosed against one parent family; the fit carries no independent rejection reason).
`buildBandLocalEndpointRefinements` asks it first and returns a refused record without touching the
domain. `refineBandLocalGradientEndpointsWithDomain` additionally returns before measuring either
band whenever any reason has already been gathered.

**Why it cannot suppress an acceptance.** `accepted` is `rejectionReasons.length === 0`, so any
attempt the gate refuses was already going to be refused. And `candidate-domain.ts` — the only
consumer — reads a refinement's endpoints and reasons exclusively behind
`if (!refinement.accepted || !refinement.low || !refinement.high) return/continue`
(lines 71 and 161), so nothing downstream can observe the shortened reason list or the absent
band measurements.

**Measured, 1(b) alone** (before the unblinding was written): 37/37 fixture artworks byte-identical,
whole extraction 281.9 s → 170.0 s (1.66×). See "Sweeps" for the combined figure and the caveat on
what that multiplier does and does not mean.

Funnel evidence, measured against the **pristine** checkpoint via `probe-refinement-funnel.ts` over
the 37 non-scrambled fixture files plus the 37-entry canonical off-panel manifest (73 measured; the
real corpus, no scrambles):

| measured over 73 artworks | |
| --- | --- |
| same-family attempts | **473** |
| refused by the free pre-domain gate | **417 (88.2 %)** |
| whole-image domain reconstructions | **72 → 25** (−65 %) |
| acceptances | **18**, and **18 of 18 survive the gate** |
| artworks with ≥1 acceptance | 12 |

The decisive column is which reason *first* refuses each attempt, because that is the one the
algorithm would actually stop on:

```
  417  upstream fit: *                                        <- free, known before any pixel
   21  band-local robust endpoints are not materially distinct
   18  (accepted)
    6  band-local endpoint distributions overlap too strongly
    4  diagnosed field domain cannot be reconstructed
    4  high parent-family band is unoccupied
    2  low parent-family band is unoccupied
    1  band-local occupied modes are not materially distinct
```

**417 of 455 rejections (91.6 %) are decided by evidence that costs nothing**, and today all 455 pay
for a domain reconstruction and two band measurements first. The free gate is not merely *a*
filter — it is very nearly *the* filter, applied after the expensive work instead of before it.

### 1(a) Unblind — **behaviour change, review-gated**

**Finding (confirms `adversarial-logic/VERDICTS.md` claim 3).** `buildFamily` hard-coded
`signatureScore: 0`, `foregroundScore: 0`, `foregroundTypographyObservation: 0`,
`signatureAccentObservation: 0`, `foregroundPolarityObservation: {0,0,[]}`, `markSupport: 0`,
`observedComponentCount: 0`, and its `componentEvidence` marked every component
`retainedFor: ["connected-support"]` with `RegionRoleFactors.score = 0` and `repetition = 0`. A
band-local family therefore could not earn a role, an identity obligation, or a mark — only a field.
That is the structural explanation for 1 winner in 118 artworks.

**Change — reuse, not fork.** The native measurement was extracted into one shared implementation in
`palette-core.ts` and both producers now call it:

| exported from `palette-core.ts` | previously | now |
| --- | --- | --- |
| `componentRolePreliminary` | inline in the native scan | called by the native scan *and* by band-local components |
| `retainFamilyComponents` | inline in `insertComponent` | `insertComponent` is now a one-line call to it; band-local applies it to its whole component set |
| `measureFamilyRoleEvidence` | inline in the native `preliminary` map (region observations, aggregation, polarity, signature/foreground scores, component evidence) | the single implementation, called by both |
| `markSupportOf`, `markFieldReferencePrototypes` | private | exported so band-local mark evidence is measured against the *same* field references |

`endpoint-refinement.ts` lost `roleFactors` and `componentEvidence` — the two functions that
manufactured the zeroed observation — and gained `roleEvidenceComponent`, a pure shape adapter.
Nothing about the *geometry* a band-local family measures for itself changed; only the role
evidence, which is now measured rather than stubbed.

**Refactor parity.** The palette-core extraction alone (before unblinding) is byte-identical: 4/4
spot-check artworks, then the full sweeps below.

**Blast radius.** See "Sweeps".

### Sweeps

Every artwork extracted twice in one process — once through a pristine copy of `c2366d2`, once
through the working tree — and the **entire `PaletteExtraction` JSON** compared, not just the four
hexes. Both 1(a) and 1(b) are in the working arm, so a difference anywhere is attributable to the
unblinding (1(b) is separately proven inert).

| corpus | n | winner differences | pristine | working |
| --- | --- | --- | --- | --- |
| fixtures (`images/*.jpg|avif`, non-scrambled) | 37 | **0** | 265.5 s | 165.7 s (1.60×) |
| scrambled decoys — robustness only, not evidence | 34 | **0** | 261.4 s | 151.4 s (1.73×) |
| canonical off-panel manifest | 37 | **0** | 129.4 s | 91.0 s (1.42×) |
| **total** | **108** | **0** | 656.3 s | 408.1 s (1.61×) |

**Determinism**: `06/ab67616d0000b2730006c5d727b329e4477f4a81` run twice through the working tree
produced identical output.

**Honest reading of the 0.** Unblinding changes no output on any reviewed artwork. It is a
*correctness and architecture* change, not a measured quality win: it removes the structural reason
a band-local family could never hold a role, an obligation or a mark, so accent- and
foreground-quality work (Tracks N and O) can see those families at all. Whether that ever changes a
winner is a question for a later, wider sweep — not a claim made here.

> **Answered by the addendum's wider sweep.** The follow-on work re-ran a 184-artwork census set and
> then attributed every difference across three arms (`c2366d2` → Task 1 → Task 1 + gates). Task 1's
> arm is byte-identical to trunk on all of them. **Task 1's blast radius is 0 across 292 distinct
> artworks**, which is a materially stronger statement than the 108 measured here.

**Caveats on the timing.** The harness runs pristine-then-working on the same image inside one
process, so the working arm inherits a warm page cache and a warm JIT; 1.60× is an upper bound on
the real speedup. The byte-identity result is order-independent.

---

## Task 2 — the unattributed batch-15 regression

**Case.** `06/ab67616d0000b2730006c5d727b329e4477f4a81` (Kolin, *Dübörög A Láz*). Batch
`review-15-white-fg-fresh`, labels `["v2-2", "trunk-h5"]`, human preferred **A = v2-2**, verdict
**strong**, no tags, no notes, no correction.

The two palettes differ in **one role**:

| | background | surface | foreground | accent |
| --- | --- | --- | --- | --- |
| v2-2 (preferred) | `#0e0e28` | `#2a284d` | `#f3f5f4` | **`#f5c982`** |
| trunk | `#0e0e28` | `#2a284d` | `#f3f5f4` | **`#c27f62`** |

The artwork is a dark navy/purple lightning field with a large **gold chrome "KOLIN" logotype**, a
white jacket, a gold chain, a red rose and small teal lettering. `#f5c982` is the gold logotype.
`#c27f62` is the model's **skin tone**.

**Bisection.** All 18 v2-3-line commits from `c9395ac` (the exact v2-2 duplicate) to `c2366d2`,
replayed on this artwork through the public entry point, 1 s per run:

```
c9395ac … f0d7705   accent #f5c982      (5 commits)
4cd3dee … c2366d2   accent #c27f62      (13 commits)
```

**Attribution: `4cd3dee` — "v2-3: integrate Track C authorized identity (reviewed)".** The commit's
own message lists a blast radius of 4 of 34 on-panel artworks; this off-panel artwork was not in it.

**Sub-mechanism.** Four toggles at HEAD left `#c27f62` in place — `WINNER_RANKING_HYPOTHESES.authorizedIdentity = false`,
the chromatic-foreground `placementCredit` gate, `demotesBetterText`, and `identityBearingSurface`.
Forcing `authorizedGain = 0` in `base-scoring.ts` restored `#f5c982`. So the decisive term is the
`authorizedGain` addend in

```ts
gain: coverage * maximumIdentityGain + authorizedGain    // base-scoring.ts:413
```

Traced evaluations for the two treatments (identical background/surface/foreground families):

| | accent family | qualityUtility | identityCoverage | identityGain | identityAuthorizedGain | **relationUtility** |
| --- | --- | --- | --- | --- | --- | --- |
| gold `#f5c982` | `family-9483` | **0.72152** | 0.71429 | 0.03571 | **0** | 0.75723 |
| skin `#c27f62` | `family-7298` | 0.70857 | 0.90476 | 0.05286 | **0.00762** | **0.76142** |

Quality favours gold by 0.01295. Identity favours skin by 0.01714, of which 0.00762 is the
authorized part. Net margin **0.00419** — remove `authorizedGain` and gold wins.

**Root cause is upstream of `authorizedIdentity`.** The gold treatment earns *no accent identity
credit at all* (`identityRoles` contains only the foreground) because `family-9483` **is not an
identity obligation**. Tracing the shortlist (`ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations = 4`):

```
selected:   family-10804 #f4f5f5 chroma=0.002 pop=5.5%   (white jacket)
            family-1102  #050404 chroma=0.003 pop=0.9%   (near-black)
            family-7298  #c28063 chroma=0.092 pop=1.3%   (skin)
            family-2842  #0e1d53 chroma=0.100 pop=5.9%   (navy field)
boundOmitted: family-3724, family-10343 (#f6ebbc, the logotype highlight), family-6371,
              family-5488, family-4606, family-9062, family-3770, family-9483  ← the gold logotype
reserved:   []   (gold's populationFraction is below reservedMajorFamilyPopulationFraction)
```

Two of four obligation slots are held by near-neutrals (chroma 0.002 and 0.003) — the crowding
pathology `VERDICTS.md` §5 finding 3 measured at 57 % of slots corpus-wide. The artwork's single
most deliberate element cannot hold an identity obligation, so the identity objective is
structurally unable to prefer it, and `authorizedIdentity` faithfully amplifies the only chromatic
identity it *can* see: skin.

**Classification.**

1. **Principled change that happens to lose here** — `authorizedIdentity` is doing what it was
   reviewed to do. It is riding on an **upstream mechanism defect**: the identity-obligation
   shortlist spends slots on near-neutrals and bound-omits the artwork's logotype, and the
   "reserved major family" rescue is population-gated so it does not catch a small, vivid mark.
2. **A separate measurement hazard, worth fixing on its own.**
   `WINNER_RANKING_HYPOTHESES.authorizedIdentity = false` does **not** disable the mechanism.
   The flag lives in `winner-scoring.ts` and — consistently with its own doc comment — gates only
   the dominance dimension and the band tie-break. But `base-scoring.ts:413` folds `authorizedGain`
   into `gain`, and therefore into `relationUtility`, *unconditionally*; `base-scoring.ts` cannot
   see the flag at all. `relationUtility` is the headline ranking quantity, so the largest effect of
   authorized identity is the one part of it that has no switch. Probe A (flag off) changed nothing
   on this artwork; probe E (`authorizedGain = 0`) restored the human-preferred output. **Anyone
   ablating this mechanism through its named switch will measure it as inert**, which is exactly the
   class of error `VERDICTS.md`'s method note warns about.

No fix applied: the obvious candidates (a chromatic quota on obligation slots, or a mark-aware
reservation beside the population-based one) are accent-identity work, which is Track N's lane, and
each needs its own gradient/identity-neutrality measurement.

---

## Task 3 — the two degenerate classes

Both cases reproduce byte-for-byte at `c2366d2` on the real corpus.

| case | output |
| --- | --- |
| `09/ab67616d0000b27300092c140fe03d08e0dc906a` | bg `#efe1ee`, surface `#0041fd`, fg `#eee1ee`, accent `#a9b1f2`, gradient |
| `14/ab67616d0000b27300140a25911e8b901b183072` | bg `#0d1015`, surface `#161b21`, fg `#76a9ba`, accent `#8d2026`, gradient |

### 3(a) fg ≈ bg — a real defect

`#eee1ee` vs `#efe1ee` is **ΔE 0.366** (CIE76), *below one 8-bit code step* — invisible. The
artwork ("THE FALL") is a pale-lilac field carrying a huge vivid-blue glyph; the treatment renders
its foreground in the field colour.

**Why nothing stops it.** Two independent gaps:

1. **Role distinctness is exact-RGB only.** `createTreatment` (`palette-core.ts:3774`) and
   `validateTreatment` (`:3732`) both test `sameColor(background.rgb, foreground.rgb)` — byte
   equality. One code value of difference is a legal, "distinct" pair. `perceptualDifference`
   (CIE76) is used in exactly **one** place in the whole runtime, `earnedRenderMidpoint`.
2. **The APCA guard is a maximum over ramp positions.**
   `hasPeakAPCAObservability(values, hardMinimum)` is `values.some(…)`. This treatment's field is a
   gradient from pale lilac to vivid blue, and the measured foreground contrast is

   ```
   Lc(fg #eee1ee over background #efe1ee) =   0.000
   Lc(fg #eee1ee over surface    #0041fd) = -69.180
   ```

   so the `some` passes on the strength of the blue end while the foreground sits at **exactly zero
   contrast** at the other end. `pathObservability` (the *fraction* of positions that clear the bar)
   exists but is only ever a score, never a gate.

   Worth flagging separately: **the charter already calls this a defect.** Constraint 2 says
   contrast *pathologies* remain fair game and names the example — "APCA sign flips across gradient
   samples imply a zero-contrast crossing inside the gradient". This artwork does not merely imply a
   zero-contrast crossing, it renders one at position 0. So Q-3 can be argued from the existing
   charter without appealing to a new principle at all, and without touching the APCA hard minimum.

**How common.** Measured on **214 distinct non-scrambled artworks**: 95 unique from the cached
result sets under `research/v2-3-eval/data/results/` (which include all 34 reviewed fixtures), plus a
fresh deterministic-stride sample of 120 full-size artworks from the `<2-hex>/` cache, run against a
pristine copy of `c2366d2`. The two sets overlap on exactly 1 artwork.

| fg-vs-bg ΔE | <1 | <2 | <3.3 | <5 | <8 | <12 |
| --- | --- | --- | --- | --- | --- | --- |
| cached (n=95) | 0 | 0 | 0 | 0 | 0 | 1 |
| fresh (n=120) | 1 | 1 | 1 | 1 | 1 | 2 |

The distribution is sharply **bimodal**. The only sub-ΔE-1 case in the fresh sample is
`03/ab67616d0000b273000323957b88112ca49b8ee0.jpg` — bg `#dbd7cc`, fg `#dad6cb`, **ΔE 0.356** — an
independent instance of exactly the reported class. The *next* closest artwork anywhere is
ΔE **9.19** (`knuckles`, a reviewed fixture). **Nothing in 214 artworks sits between ΔE 1 and ΔE 9.**

**Proposed generic rule (not implemented).**

> A treatment whose foreground is perceptually the same colour as the field it is drawn on is not a
> treatment. Measured as `perceptualDifference` (CIE76) — the same ruler and the same constant the
> reviewed midpoint-distinctness rule uses,
> `ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE = 3.3` — between the foreground and
> the *rendered* field colour at every sampled ramp position, not only against `background`. The
> existing `renderedFieldColor(background, surface, midpoint, position)` already produces those
> samples, so the rule is the `pathObservability` shape applied to colour identity instead of
> contrast: `min` over positions, not `some`.

Why 3.3 and not a new number: it is the one bar in this codebase that was **read off human
judgements** rather than tuned, it answers the same question ("would a viewer call these the same
colour?"), and it sits inside the empty band — any threshold in (1, 9) has the identical blast
radius on all 214 measured artworks, which is **zero outside the degenerate cases**.

Why it is not an accessibility floor (charter constraint 2): ΔE 3.3 is a same-colour-or-not test,
roughly one just-noticeable difference. The reviewed low-contrast outputs are nowhere near it —
`knuckles`, the closest reviewed fg/bg pair in the corpus, is ΔE 9.19. It cannot raise the APCA
minimum, which stays a caller parameter.

The obvious objection — that the rule might strand the **emergency one-colour form** — does not
survive measurement. The extreme artworks are the *furthest* from the floor, not the closest:

```
pureblack  #000000/#000000/#ffffff  fg-vs-bg ΔE 100.00
purewhite  #ffffff/#ffffff/#000000  fg-vs-bg ΔE 100.00
purered    #fe0000/#fe0000/#ffffff  fg-vs-bg ΔE 114.33
black      #000000/#000000/#575757  fg-vs-bg ΔE  36.99
knuckles   closest reviewed pair    fg-vs-bg ΔE   9.19
```

What still needs deciding, and why this stays a proposal rather than a commit: the rule has to be
an **eligibility gate on candidates** (so a refused treatment is replaced by the next admissible
one) rather than a `validateTreatment` throw (which would abort the extraction), and the
*replacement* output on the two degenerate artworks is a new answer no human has seen. That is a
review batch, not a unilateral change.

### 3(b) "gradient across endpoints <0.05 OKLab apart" — **a measurement artefact, not a defect**

The reported class does not survive being measured with the right ruler.

| pair | OKLab distance | ΔE (CIE76) |
| --- | --- | --- |
| `14/…140a2591` endpoints `#0d1015 → #161b21` | 0.0476 | **5.214** |
| `slim` endpoints `#01040b → #140e18` (reviewed) | 0.0742 | 6.036 |
| **one 8-bit step at level 0**: `#000000 → #010101` | **0.0672** | **0.274** |

A single code-value step in the deepest shadow is *larger* in OKLab (0.0672) than the "degenerate"
endpoints (0.0476), while being perceptually invisible (ΔE 0.27). This is precisely the failure
`perceptualDifference`'s own documentation warns about: OKLab's cube-root transfer has unbounded
derivative at zero and one 8-bit step spans OKLab 0.0672 at level 0 versus 0.0030 at level 254 — a
22.6× swing. **An OKLab threshold cannot separate degenerate from non-degenerate gradients on dark
artwork**, and every case in this class is dark artwork.

At ΔE 5.2 the `140a2591` gradient carries more than two JNDs across the field — comparable to the
reviewed-strong `slim` (ΔE 6.04) and above the reviewed midpoint bar of 3.3. It is not degenerate.

The two rulers do not merely disagree at the margin, they rank differently. Two gradient winners in
the fresh sample sit at essentially the same OKLab distance and 1.9× apart in ΔE:

| artwork | endpoints | OKLab | ΔE |
| --- | --- | --- | --- |
| `05/…e6455d34` | `#1a1a1a → #0b0b0b` | 0.0682 | 6.24 |
| `08/…c1c08433` | `#99cdc9 → #c4dbd5` | 0.0683 | **11.78** |

And in the fresh sample **0 of 56** gradient winners fall below OKLab 0.05 at all, so the mined
class is not only mis-measured, it is also rarer than the ΔE-degenerate class it was meant to find.

**How common are genuinely degenerate gradients.** Same 214 artworks, gradient winners only:

| surface-vs-bg ΔE, gradient winners | <1 | <2 | <3.3 | <5 | <8 | <12 |
| --- | --- | --- | --- | --- | --- | --- |
| cached (n=40) | 0 | 0 | **1** | 1 | 2 | 7 |
| fresh (n=56) | 0 | 0 | **0** | 1 | 2 | 9 |

**1 in 96 gradient winners (≈1 %)**: `ab67616d0000b273000d8049603d6ab7f5d759bb`, bg `#0d0804` →
surface `#010101`, **ΔE 3.045**, two blacks. The fresh sample's minimum is ΔE 4.01.

**Proposed generic rule (not implemented), the endpoint-level analogue of the midpoint rule:**

> A gradient whose two endpoints are perceptually the same colour renders as flat, so claiming a
> gradient is a false claim about the artwork. Refuse the gradient (fall back to the flat field)
> when `perceptualDifference(background.rgb, surface.rgb) < 3.3` — the endpoint analogue of
> `earnedRenderMidpoint`'s existing test, on the same ruler and the same constant.

Blast radius 1 in 214 artworks. It is deliberately **not** the rule the mined class suggested. An
OKLab endpoint floor at 0.05 gets it wrong in both directions at once: it would refuse
`14/…140a2591`, whose ΔE 5.2 gradient is plainly visible, and it would still admit the one genuinely
degenerate case, `#0d0804 → #010101` at OKLab 0.0738. Charter rule 5 (gradient
neutrality) says an incorrectly prevented gradient is as bad as an incorrectly allowed one, and this
rule has one measured firing with no human verdict on it, so it belongs in a review batch rather
than in the trunk.

---

## Proposed review items

1. **Q-1 (batch-15 regression, diagnosis)** — `06/ab67616d0000b2730006c5d727b329e4477f4a81`:
   v2-2 `#f5c982` (gold logotype) vs trunk `#c27f62` (skin). Already reviewed *strong* for v2-2 in
   batch 15; listed here so the orchestrator can route the *cause* (identity-obligation slot
   crowding — see Task 2) to Track N rather than re-reviewing the case.
2. **Q-2 (`authorizedIdentity` flag scope, no review needed — a code decision)** — make
   `authorizedGain`'s contribution to `gain` follow the same switch as its dominance and tie-break
   use, so ablating the mechanism through `WINNER_RANKING_HYPOTHESES` actually ablates it.
3. **Q-3 (fg/bg perceptual floor)** — implement the ΔE 3.3 foreground/field floor and review the
   new outputs on `09/…092c140f` and `03/…00032395`. Blast radius on every reviewed artwork is
   provably zero (minimum reviewed fg/bg ΔE is 9.19).
4. **Q-4 (gradient endpoint floor)** — implement the ΔE 3.3 endpoint floor and review the one
   artwork it changes, `ab67616d0000b273000d8049603d6ab7f5d759bb` (`#0d0804 → #010101` gradient
   becomes flat).
5. **Q-5 (endpoint-refinement unblinding)** — **no review items**: the unblinding moved no winner on
   any artwork swept. It is integrable on architecture grounds alone. If a later wide sweep finds a
   moved winner, that artwork is the review item.

## Verification

- `node_modules/.bin/tsc -p research/v2-3/tsconfig.json` — clean, including under
  `--noUnusedLocals --noUnusedParameters` for the code this track touched.
- `research/v2-3/test/architecture.test.ts` — 2/2 pass (imports still closed inside `research/v2-3/`;
  no case IDs, fixture paths, source hashes or expected colours in runtime code).
- `research/v2-3/test/configuration.test.ts` — 6/6 pass.
- The 34-fixture `parity.test.ts` freezes the failed checkpoint's outputs; it is not run here because
  the sweeps above compare against `c2366d2` directly on the same corpus and report 0 differences,
  which is the stronger statement.
- Nothing under `research/v2-2/` was touched; no other track's folder was touched; `package.json`
  unchanged.

## Files

- `research/v2-3/src/internal/endpoint-refinement.ts` — cheap gate (1b) and unblinding (1a).
- `research/v2-3/src/internal/palette-core.ts` — role-evidence machinery extracted for reuse.
- `research/v2-3-experiments/track-q/probe-refinement-funnel.ts` — the acceptance-funnel probe.

---

# Addendum — the two distinctness gates, implemented

Follow-on at the coordinator's request: both proposals from Task 3 are now runtime rules. Base
unchanged (`c2366d2`; `origin/research/palette-0.9-checkpoint` re-fetched and still at `c2366d2`).

## Provenance, and why one number appears three times

The gates are not new policy. Human review already stated the rule and already generalised it past
byte equality, in batch 12:

> **`muse`** — "I think we can introduce a new rule that a midpoint cannot be the same color as
> either endpoint. In the case of option A here, the midpoint was pitch black and the background was
> pitch black. We should consider that invalid"

> **`slim`** — "While the midpoint of option B is in fact different from its background. I cannot
> visually distinguish them. They are too close, too black, both of them, and so it is hard to
> distinguish. **So we should consider them as the same color, in which case the same rule as before
> should apply**, which is the midpoint cannot be the same color as either end point"

`slim` is doing two jobs at once. It says *same colour is a perceptual judgement, not a byte
comparison* — the pair it refuses is measurably distinct. And it says so about **near-blacks**,
which is why the ruler has to be CIE76 ΔE: one 8-bit code step spans `okDistance` 0.0672 at level 0
and 0.0030 at level 254, so no single OKLab bar can express sameness across the tone range. Batch 14
(`placebo`) is the shadow-material caveat already recorded on the midpoint constant.

So all three bars are 3.3, and `configuration.test.ts` now pins that they agree:

```
ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness = {
  sameColor:         3.3,   // the bar review set, from six bracketing midpoint judgements
  foregroundField:   3.3,   // new: fg vs bg
  gradientEndpoints: 3.3,   // new: bg vs surface, for a gradient claim
}
ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE = distinctness.sameColor
```

Three fields rather than one constant so a library user can raise one without the others, in the
spirit of charter constraint 2. The midpoint constant now *derives* from the same source instead of
being a fourth literal 3.3.

**None of them is a contrast floor**, and the configuration test asserts the headroom: ΔE 3.3 is
about one JND, while `knuckles` — the closest foreground/background pair in the whole reviewed
corpus — is ΔE 9.19. `contrast.hardMinimum` stays 0 and stays a caller parameter.

## What changed in the runtime

| gate | site | shape |
| --- | --- | --- |
| foreground/field | `createTreatment` | the byte test `sameColor(background.rgb, foreground.rgb)` is replaced by `perceptualDifference(...) >= distinctness.foregroundField`, which subsumes it (an identical pair is ΔE 0). The surface-side byte test is untouched. |
| foreground/field | `validateTreatment` | the same rule as a published invariant, beside the existing role-equality throws. |
| gradient endpoints | `buildFieldVariants` | the **gradient variant** is not emitted when `perceptualDifference(background.rgb, surface.rgb) < distinctness.gradientEndpoints`. The pair's collapsed one-field variant below it is deliberately left standing. |

The third row is the one design decision worth stating. The existing endpoint guard on the line
above is `okDistance(...) < 0.028` and `continue`s — it drops the **pair**. The new gate drops only
the **gradient claim**, because the honest treatment of two colours that are one colour is the
collapsed one, not no treatment at all. It also sits *after* the OKLab guard rather than replacing
it: they refuse different things, and the OKLab one is load-bearing for reasons this track did not
measure.

## Blast radius — exactly the three predicted artworks

| corpus | n | differences |
| --- | --- | --- |
Both arms are the same harness as the Task 1 sweeps: pristine `c2366d2` versus the working tree,
whole `PaletteExtraction` JSON compared, so the working arm carries the two gates *and* Task 1's two
commits.

| corpus | n | differences |
| --- | --- | --- |
| fixtures (`images/*.jpg\|avif`, non-scrambled) | 37 | **0** |
| scrambled decoys | 34 | **0** |
| canonical off-panel manifest | 37 | **0** |
| Track Q census set (120 fresh stride + 66 cached-resolved) | 184 | **3** |
| **total** | **292** | **3** |

**Everything reviewed stays byte-identical**, which is the result the bimodal measurement predicted:
no reviewed artwork has a foreground within ΔE 9 of its background or a gradient within ΔE 3 of
collapse, so neither gate can reach one.

**Attribution of all three census differences.** Because the working arm carries Task 1's two commits
as well, each difference was replayed across three arms — `c2366d2`, then `0e424c7` (Task 1 only),
then the working tree. **All three attribute to the gates**; Task 1's arm is byte-identical to trunk
on every one. Two are the predicted direct refusals. The third is a *cascade*, and it is the honest
surprise of this work — see below.

### Before/after pseudo-labels for the review batch

**Q-3a · `09/ab67616d0000b27300092c140fe03d08e0dc906a`** — "THE FALL": a vivid-blue glyph on a
pale-lilac field. Refused by the foreground/field gate.

| | background | surface | foreground | accent | field | fg/bg ΔE |
| --- | --- | --- | --- | --- | --- | --- |
| before | `#efe1ee` | `#0041fd` | `#eee1ee` | `#a9b1f2` | gradient | **0.366** |
| after | `#0041fd` | `#0041fd` (collapsed) | `#efe1ee` | `#a9b1f2` | flat | **115.365** |

The before renders its text in the background colour — APCA `Lc 0.000` at ramp position 0. The after
is the artwork's actual two colours, with the field and the text the right way round.

**Q-3b · `03/ab67616d0000b273000323957b88112ca49b8ee0.jpg`** — Amélie Daniel, *I Don't Know*: a photo
inset in a wide greige border with near-black serif type. Refused by the foreground/field gate.

| | background | surface | foreground | accent | field | midpoint | fg/bg ΔE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before | `#dbd7cc` | `#733c28` | `#dad6cb` | `#2b2118` | gradient | none | **0.356** |
| after | `#e1ded5` | `#663f30` | `#19100b` | `#2e2017` | gradient | `#d7d3c8` | **83.127** |

The after puts the artwork's own near-black lettering in the foreground role instead of restating
the greige border.

**Q-4 · `0d/ab67616d0000b273000d8049603d6ab7f5d759bb`** — a figure in black on dark steps under warm
gold light. Refused by the gradient-endpoint gate.

| | background | surface | foreground | accent | field | bg/surface ΔE |
| --- | --- | --- | --- | --- | --- | --- |
| before | `#0d0804` | `#010101` | `#fafcf1` | `#774e0c` | gradient | **3.045** |
| after | `#0e0701` | `#301e08` | `#fafcf1` | `#774e0c` | gradient | **17.839** |

Note the outcome is *not* a collapse. Removing the degenerate pair from the variant domain let a
different, genuinely visible gradient win — black falling off into the warm brown the building's
lighting actually casts. The gate refused a false gradient claim and the artwork kept a true one.

**Q-4b (unpredicted, and the finding worth reading) · `09/ab67616d0000b2730009ee6f6835bed9a0e41752`**
— a Peppa Pig cover: a smooth blue sky, cream title lettering, a pink pig, a red dress. The field is
unchanged; only the foreground moved.

| | background | surface | foreground | accent | field | fg/bg ΔE |
| --- | --- | --- | --- | --- | --- | --- |
| before | `#54a0c4` | `#1b70b3` | `#2b1311` | `#f8e0a0` | gradient, midpoint `#2a7ab9` | **67.125** |
| after | `#54a0c4` | `#1b70b3` | `#f8aebf` | `#f8e0a0` | gradient, midpoint `#2a7ab9` | 53.258 |

**This is a cascade, not a refusal, and the distinction matters.** The previous winner's own
foreground/background pair is ΔE 67 — the gate cannot touch it. Toggling each gate independently
attributes the move to the **foreground/field** gate; instrumenting `createTreatment` on this artwork
shows what it actually refused:

```
60 candidates refused, every one of them blue-on-blue:
  bg #2f80b8  fg #3081b8   ΔE 0.761
  bg #52a0c4  fg #54a2c6   ΔE 0.743
  bg #4f9fc4  fg #54a2c6   ΔE 1.320
  bg #18436e  fg #184370   ΔE 1.358
  bg #4d9bc2  fg #54a2c6   ΔE 3.177
  …
```

The sky is a smooth blue ramp, so the family and representative machinery offers dozens of
near-identical blues, and the candidate domain contained **60 treatments whose "text" was the sky**.
Every one is exactly the pathology the gate exists for. None was the winner. Removing them changed
the *composition* of the domain the winner is chosen from — winner selection is a Pareto frontier
plus a banded comparison plus a source-eligibility re-score, not a per-candidate argmax, so which
candidate is on top is a function of the set — and the foreground landed on the pig's pink instead
of a dark detail.

Two honest consequences:

1. **These gates are not purely conservative.** Refusing illegal candidates can move a legal winner
   on an artwork where neither role pair was ever degenerate. The census puts the rate at 1 in 184.
   Anyone reasoning about a future filter's blast radius should assume this coupling exists rather
   than assume filters only subtract.
2. **The new answer here needs review on its own merits, not as a bug report.** Pink is Peppa and
   cream is the title, so both readings are defensible; `#2b1311` is a small dark detail. It goes in
   the batch as a genuine A/B, with no expectation baked in.

**Control · `14/ab67616d0000b27300140a25911e8b901b183072`** — the artwork the OKLab framing had
flagged as degenerate (endpoints `#0d1015 → #161b21`, `okDistance` 0.0476). **Unchanged**, as
predicted: ΔE 5.214 clears the bar. This is the case that distinguishes the two rulers, and the
implemented rule gets it right.

## Verification

- Determinism: `09/…092c140f`, the artwork whose winner moved most, run twice — identical.
- `node_modules/.bin/tsc -p research/v2-3/tsconfig.json` — clean.
- `architecture.test.ts` 2/2; `configuration.test.ts` 7/7, including the new
  "the reviewed same-color bar is one number in three places".
- No artwork-specific hex literal was left in runtime code. The architecture test only checks the 34
  reviewed fixtures' colours, so it would not have caught the off-panel hexes an early draft of the
  policy comment carried; they were removed anyway, because "never special-case a test image" is the
  invariant and the test is only its sampler.
- `research/v2-2/` untouched; no other track's folder touched; `package.json` unchanged.

## Review batch, assembled

Four items, all off-panel, none previously reviewed:

| id | artwork | what changed | why it is in the batch |
| --- | --- | --- | --- |
| Q-3a | `09/…092c140f` | invisible text → the artwork's two real colours | direct fg/bg refusal, Lc 0.000 before |
| Q-3b | `03/…00032395` | greige-on-greige text → the artwork's near-black serif | direct fg/bg refusal |
| Q-4 | `0d/…000d8049` | two-blacks gradient → a visible black→brown gradient | direct endpoint refusal |
| Q-4b | `09/…09ee6f68` | dark-detail foreground → the pig's pink | **cascade** — no pair was degenerate |

Q-4b is the one to put in front of the reviewer first: it is the only item whose outcome the
measurement did not predict, and the reviewer's answer tells us whether domain-composition cascades
from a filter are acceptable in general or need containing.

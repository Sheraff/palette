# Track F — segmentation granularity

Target: `images/meteora.jpg`, which published `#000000` bg / `#151108` surface / `#fafafa` fg /
`#a59073` accent. Human verdict: acceptable, but *"the surface doesn't really feel like it belongs —
either the surface should just collapse to the pitch black background, or the surface should be
khaki and the accent white"*.

Track A established (`track-a/EXPERIMENT.md`, meteora sections) that **no ranking lever reaches
either arrangement**: on support, concentration, coverage, material distance and connected support,
the `#151108` family looks *better* than surfaces human review accepted elsewhere. Their conclusion,
handed to this track: the olive-brown is texture inside the black field, not a structural region.

**Result: meteora now publishes `#000000 / #000000 / #fafafa / #a59073` with the surface collapsed —
Flo's arrangement (a) exactly, the ideal named in the brief. 1 of 34 review fixtures changed;
`loups` byte-identical including its `#fdc568` midpoint.**

---

## 1. Diagnosis (measurements first)

### 1.1 The naive texture reading is wrong

The brief's directions (b) and (c) assume `#151108` is *finer-grained* than a real surface. It is
not. Measured against the surface human review **accepted** on `horrorwood`:

| | pop | components | mean component px | edgeDensity | familyConcentration | self-density r=4 |
| --- | --- | --- | --- | --- | --- | --- |
| meteora `#161109` (**rejected** surface) | 7.88 % | 2 399 | 13.5 | 0.397 | 0.658 | 0.694 |
| horrorwood `#3b4857` (**accepted** surface) | 8.44 % | 13 523 | 9.0 | 0.609 | 0.113 | 0.546 |
| maroon5 `#4d0e15` (**accepted** surface) | 17.45 % | 8 845 | 19.7 | 0.286 | 0.141 | 0.733 |

On **every** texture statistic — component size, edge density, concentration, local solidity — the
rejected surface looks *more* like a solid region than surfaces that were accepted. A texture score
consumed as evidence against surface candidacy would have demoted `horrorwood` first. Directions (b)
and (c) are dead as stated; this reproduces Track A's negative result one level lower in the pipeline.

### 1.2 What it actually is

Painting each family a flat colour (`track-f/map.ts`) settles it. `#151108` is a **horizontal band
around y ≈ 360–410**: the strip where the sepia photograph fades into the black bottom panel. It is
neither the black field nor the khaki photo — it is the *seam between them*.

`horrorwood`'s accepted surface, by contrast, is distributed across the whole frame — clouds, roofs,
street — in many independent sizeable regions. It is a genuine tonal tier of the image.

### 1.3 Why the seam got sliced into families at all

OKLab's lightness is extremely steep at the black point:

```
rgb   0 -> L=0.0000      rgb 128 -> L=0.5999
rgb   1 -> L=0.0672      rgb 149 -> L=0.6698   (same +21 codes: dL=0.070)
rgb   3 -> L=0.0969
rgb  21 -> L=0.1957      #000000 vs #151108 -> okDist 0.1805, essentially all lightness
```

**A single 8-bit code step at the black point spans dL ≈ 0.067 — more than the whole family anchor
radius (0.058), and larger than the same 21-code step anywhere in the mid-tones (≈ 0.070 for 21
steps, not 1).** So a soft fade out of a black field is guaranteed to be sliced into many families,
and the greedy anchor radius can never merge them back: consecutive dark rungs are further apart in
OKLab than the merge threshold. This is the mechanical origin of the "segmentation fragmentation"
the showcase postmortem recorded, and it is why the defect presents on a *black* field.

### 1.4 The measurement that separates

Project every family onto the OKLab chord between the artwork's two dominant field families, and
record where it lands (`position`, in chord fractions) and how far off it sits (`offset`, relative to
chord length):

| case | family | pop | rel. offset | position | chord len | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **meteora** | `#030101` | 5.04 % | 0.0092 | 0.114 | 0.664 | on the chord, interior |
| **meteora** | `#161109` ← the surface | 7.88 % | 0.0067 | 0.275 | 0.664 | on the chord, interior |
| **meteora** | `#28231c` | 1.86 % | 0.0045 | 0.391 | 0.664 | on the chord, interior |
| **meteora** | `#3d362d` | 5.41 % | 0.0077 | 0.509 | 0.664 | on the chord, interior |
| **meteora** | `#554c40` | 1.45 % | 0.0102 | 0.635 | 0.664 | on the chord, interior |
| **meteora** | `#6d6050` | 3.56 % | 0.0092 | 0.751 | 0.664 | on the chord, interior |
| **meteora** | `#8b7b66` | 2.46 % | 0.0083 | 0.895 | 0.664 | on the chord, interior |
| horrorwood | `#3b4857` (accepted SF) | 8.44 % | 0.249 | **1.950** | 0.094 | outside the segment |
| knuckles | `#7b80a8` (accepted SF) | 5.33 % | 0.193 | **2.083** | 0.083 | outside the segment |
| nada | `#929dcd` (accepted SF) | 1.46 % | 0.573 | **−2.820** | 0.074 | outside the segment |
| doja | `#fd4187` (accepted SF) | 8.56 % | 0.347 | **−0.877** | 0.104 | outside the segment |
| skap | `#5e753d` (accepted SF) | 3.26 % | 0.096 | 0.506 | 0.915 | interior but 14× off-chord |
| birdsofprey | `#38a735` (accepted SF) | 5.90 % | 0.678 | 0.749 | 0.459 | interior but far off-chord |

meteora's whole dark ramp is a **near-exact linear mixture** of black and khaki — every rung within
1 % of a 0.664-long chord. No surface human review accepted is anything of the sort. That is not a
coincidence to be thresholded around: soft edges, shadow falloff, vignettes, semi-transparency and
JPEG ringing *all* produce exactly interior linear mixtures, because that is what optical blending
is. A colour that is an independent material essentially never lands that close to a long chord.

### 1.5 The condition that separates a seam from a gradient artwork — and protects `loups`

Colinearity alone is not sufficient, and this is where the `loups` guardrail lives. Ordering the
mixture colours along the chord and bounding them by the two fields:

| case | rungs | max gap | mixture mass | reading |
| --- | --- | --- | --- | --- |
| **meteora** | 7 | **0.161** | 27.65 % | complete continuum — a sliced ramp |
| slipknot | 10 | 0.127 | 3.85 % | complete continuum (logo anti-aliasing) |
| vvbrown | 5 | 0.327 | 0.19 % | gapped |
| **once** | 2 | **0.407** | 10.43 % | gapped — the field genuinely *is* a gradient |
| franz | 4 | 0.548 | 0.86 % | gapped |
| greenday | 3 | 0.742 | 0.95 % | gapped |
| loups, horrorwood, doja, maroon5, … | 0 | — | 0 % | no interior mixture at all |

**Evidence that quantization sliced a continuum is that the entire continuum is present, as
contiguous slices.** Two materials that merely happen to be colinear appear as isolated colours with
a gap, and must be left alone.

`loups` is the case the brief warned about, and it is worth being explicit about *why* it is safe —
it escapes twice over:

- Its two dominant field families (`#fcd884` 41 %, `#fab14b` 17 %) are adjacent stops of one ramp,
  0.094 apart. Every other loups family therefore projects **outside** the segment (positions 1.83,
  2.87, −0.46), not between. Zero rungs.
- Its fragments are *fragments of one field* whose colours are legitimate field colours. They must
  merge into the domain and stay fully eligible — which is exactly what the existing diffuse-composite
  pass does, and that pass is untouched.

`once` is the sharper control: it is a genuine gradient artwork whose intermediate colours *are* the
field. Its mixture is gapped (0.407), so it is not absorbed. Without the continuum test `once`
regressed from `#817486 / #dddde7 / … / gradient` to `#dddde7 / #dddde7 / … / collapsed` — measured,
then fixed (§4).

---

## 2. Mechanism

**Optical-blend absorption.** `research/v2-3/src/internal/palette-core.ts`
(`opticalBlendFamilyIds`, `chordProjection`) + `research/v2-3/src/internal/policy.ts`
(`ALBUM_ARTWORK_PALETTE_V2_POLICY.fieldBlend`).

The field lane is ranked twice. The first pass identifies the two dominant field families (largest
population within the provisional lane, explicit tie-breaks). A family is then treated as an optical
mixture of those two — not a material — only when **all four** hold:

1. the two fields are at least `minimumFieldSeparation` (0.3) apart, so "between them" means something;
2. its prototype projects strictly inside the chord (`interiorMargin` 0.03) and within
   `maximumRelativeOffset` (0.015) of it, as a fraction of chord length;
3. the mixtures form a **continuum**: ordered along the chord and bounded by the two fields, no gap
   exceeds `maximumRungGap` (0.25);
4. spatially it never leaves the mixture: `minimumCorridorClosure` (0.9) of its boundary is shared
   with the two fields or with other mixtures of the same pair.

Absorbed families are withdrawn from the **field lane only**, so a mixture can never be published as
a background or surface colour. Nothing else changes: the family keeps its evidence record, still
competes in the signature and foreground lanes, and whether its pixels join a field domain is still
decided by the existing composite rule, which is untouched. This deliberately does *not* assign the
mixture to either field's domain — a seam belongs to both.

This is the interior counterpart of the diffuse-composite pass, and the two are opposites on purpose:
that pass merges fragments whose colours are **legitimate**, so they must stay eligible; this one
withdraws colours that exist **only because two fields meet**, so they must not be publishable.

When nothing is absorbed the provisional lane object is reused verbatim, so the pass is a provable
no-op on every artwork it does not fire on.

Setting `maximumRelativeOffset` to 0 restores previous behaviour exactly.

---

## 3. Before / after

### Target

| case | before | after |
| --- | --- | --- |
| **meteora.jpg** | `#000000 #151108 #fafafa #a59073` flat | **`#000000 #000000 #fafafa #a59073` surface-collapsed** |

That is Flo's arrangement (a), and the exact hexes named as ideal in the brief.

### Full 34-fixture sweep

**1 of 34 changed (meteora).** The other 33 are byte-identical on all four roles, the gradient flag,
both collapse flags and the midpoint. Notably `loups` → `#fa7b34 #ebda8a #fde5d9 #fab14a`, gradient,
midpoint `#fdc568` — unchanged, as required.

### Off-panel / fresh set (all 71 files in `images/`, including every `-scrambled` variant)

The pass is a provable no-op wherever it absorbs nothing, so an absorption census is a sufficient
regression screen. **4 of 71 images absorb anything:**

| image | absorbed | before | after |
| --- | --- | --- | --- |
| meteora.jpg | 7 families, 27.65 % of pixels | `#000000 #151108 #fafafa #a59073` | `#000000 #000000 #fafafa #a59073` |
| meteora-scrambled.jpg | 7 families, 31.10 % | `#000000 #171008 #f9f9f7 #a59073` | `#000000 #000000 #f9f9f7 #a59073` |
| slipknot.jpg | 10 families, 3.85 % | `#000000 #000000 #fbfbfd #fbfbfd` | **unchanged** |
| slipknot-scrambled.jpg | 11 families, 5.75 % | `#000000 #000000 #fbfbfb #fbfbfb` | **unchanged** |

The remaining **67 images are byte-identical by construction**. `meteora-scrambled` moving the same
way is a useful spatial-invariance control: the diagnosis survives destroying the layout, which is
what one expects if the ramp is a colour-formation artefact rather than a property of one arrangement
of pixels.

### Determinism, typecheck, architecture

- `meteora`, `loups`, `horrorwood` run twice → identical output.
- `tsc -p research/v2-3/tsconfig.json` clean.
- `research/v2-3/test/architecture.test.ts` 2/2.

---

## 4. Honest assessment

**What is solid.**

- The diagnosis is measured, not asserted, and it *refutes* the framing it was handed: meteora's
  rejected surface is less textured than accepted surfaces on every conventional texture statistic.
  Directions (b) and (c) in the brief would have regressed `horrorwood` first.
- The OKLab dark-end finding (§1.3) is an independent, reusable result about why this class of defect
  presents on black fields specifically. It is worth carrying forward regardless of this mechanism.
- The continuum test is robustly centred, not knife-edged: meteora sits at gap 0.161, the nearest
  rejection (`once`) at 0.407, and any threshold in **[0.17, 0.40]** gives identical behaviour across
  the corpus. The threshold is at 0.25.
- The offset threshold is likewise centred in its plateau: meteora's worst rung is 0.0102, the next
  artwork to absorb (`vvbrown`) appears at 0.020, and anything in **[0.011, 0.019]** behaves
  identically. The threshold is at 0.015.
- The loups guardrail is not a near-miss: loups has **zero** interior rungs, failing at the first test.

**What I am less sure of.**

- **Two of the four conditions do nothing on this corpus.** Ablation: setting `minimumFieldSeparation`
  to 0 changes no image; setting `minimumCorridorClosure` to 0 changes no image. The continuum test
  alone reproduces the full result. I kept both deliberately — they only ever *restrict* absorption,
  which is the safe direction, and closure carries the spatial half of the claim that would catch a
  genuine material ladder (a duotone poster, a printed step wedge) that is colinear and gapless. But
  they are unvalidated on this evidence and a reviewer is entitled to call them dead knobs. They can
  be removed without changing any measured outcome.
- **`slipknot` absorbs 10 families and I cannot claim credit for its output being right** — it is a
  fully-collapsed black/white artwork whose palette was already correct and stayed correct. The
  mechanism firing there is semantically defensible (those families are the logo's anti-aliasing
  ramp) but the case provides no evidence either way.
- **The corpus contains exactly one positive.** Every threshold plateau above is measured against
  a single artwork that should absorb and 70 that should not. The plateaus are wide, which is
  reassuring, but "wide plateau on one positive" is not the same as validation.
- **The two-anchor choice is the mechanism's weakest joint.** Anchors are the two largest-population
  families in the provisional field lane. On an artwork with three comparable fields, the "chord"
  would be drawn between an arbitrary two of them and a legitimate third field could, in principle,
  project onto it. Nothing in the corpus exercises this. The continuum test makes it unlikely (a lone
  third field would be a single gapped rung) but does not make it impossible.
- **Arrangement (b) remains unreachable.** Track A showed the khaki-surface / white-accent
  arrangement loses on foreground contrast by ~0.14 of utility, and this change does not address
  that. Landing on (a) satisfies the brief, but if human review later prefers (b), that is still a
  candidate-availability problem in foreground/accent construction, not a segmentation one.

---

## 5. Proposed review items

1. **`meteora.jpg`** — `#000000 #151108 #fafafa #a59073` → **`#000000 #000000 #fafafa #a59073`**
   (surface collapsed). Flo's named arrangement (a). *The* item for this track.
2. **`loups.jpg`** — unchanged (`#fa7b34 #ebda8a #fde5d9 #fab14a`, gradient, midpoint `#fdc568`).
   Included as the explicit guardrail confirmation the brief asked for.
3. **`once.jpg`** — unchanged (`#817486 #dddde7 #3b303e #6c5f71`, gradient). The near-miss: it
   regressed under the mechanism without the continuum test, and is the case that motivated it.
4. **`slipknot.jpg`** — unchanged, but the mechanism *does* fire (10 families absorbed). Worth a look
   confirming the output is still right, since this is the one place absorption happens without a
   visible consequence.
5. **`horrorwood.jpg`** — unchanged (`#141b25 #36444f #ccd3d9 #808b91`). Regression control: its
   accepted surface is the one that every naive texture measure would have demoted.
6. **`meteora-scrambled.jpg`** — `#000000 #171008 #f9f9f7 #a59073` → `#000000 #000000 #f9f9f7
   #a59073`. Off-panel; same correction under a destroyed layout.

## 6. Files

- `research/v2-3/src/internal/policy.ts` — `fieldBlend` policy block (new).
- `research/v2-3/src/internal/palette-core.ts` — `chordProjection`, `opticalBlendFamilyIds`,
  `absorbedFieldFamilyIds` on `NativePaletteEvidence`, two-pass field-lane ranking.
- `research/v2-3-experiments/track-f/` — measurement harnesses, all outside the runtime:
  `sweep.ts` (34-fixture diff), `run.ts` (arbitrary files), `census.ts` (absorption screen),
  `diagnose.ts` / `texture.ts` / `separate.ts` / `corridor.ts` / `ladder.ts` (the §1 measurements),
  `map.ts` (family visualisation).

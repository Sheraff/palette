# Track K — frame / matte handling

Target: `09/ab67616d0000b273000955ccfc1e8da97a09b32d` — a flat two-colour poster (gold field, black
line art) with a thin ~8 px black frame. Trunk published the **frame** as background; v2-2 published
the gold, and the human preferred v2-2 STRONG.

Constraint: `elephunk` (9 px teal frame), `franz` (15 px near-black) and `nobs` (71 px white matte)
all publish frame-as-background under reviewed-STRONG verdicts and are **frozen**. Blanket
border-stripping is therefore wrong; the mechanism has to be evidence-based.

**Result: 0955cc flips to the gold interior. 1 of 107 verdict-carrying cases changed — the target.
All six framed artworks Track I found, including the three frozen ones, are byte-identical.**

| | before | after |
| --- | --- | --- |
| `09/…0955cc…` | `#131313 #131313 #fbbb4d #987734` | **`#fbbb4d #fbbb4d #131313 #997634`** |

Background and foreground swap polarity: the gold becomes the ground and the black becomes the ink,
with the surface collapsed onto the background.

**Corpus statement (charter, 2026-07-31):** every measurement in this document was taken with
`PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images`, i.e. against the real artworks. No
measurement here was taken on the `-scrambled` decoys; the 34 scrambled files appear in the sweep
only as additional regression subjects.

---

## 1. Diagnosis (measurements first)

### 1.1 Why the frame wins

Track I established the hit rate: **6 of 67 artworks have a frame, and in 6 of 6 the winner's
background is the frame colour**. The reason is visible in `fieldScore`:

```
fieldScore = 0.28·broadSupport + 0.22·borderCoverage + 0.22·familyConcentration
           + 0.13·quadrantCoverage + 0.15·textureCalm
```

`borderCoverage` is there because bleeding off every edge is evidence that a family is the artwork's
**ground** — nothing lies behind something that reaches all four edges. That inference has exactly
one systematic exception: a frame or matte is pasted *around* the artwork, so it also touches every
edge, and what lies behind it is the artwork itself. Nothing in the evidence separates the two, so
the mount collects the full 0.22 border credit for as little as 5 % of the pixels.

On 0955cc that credit is decisive and only just: the frame family scores **0.7502** against the gold
field's **0.7334** — a margin of 0.017 on a term worth 0.22.

### 1.2 What separates the target from the frozen cases

For each framed artwork, the family that owns the border versus the largest family that never
reaches it:

| artwork | frame family | pop | borderCov | largest enclosed family | pop | **ratio** |
| --- | --- | --- | --- | --- | --- | --- |
| **0955cc (must flip)** | `#121314` | 17.42 % | 1.000 | `#fbbb4d` gold, conc 0.821 | **77.92 %** | **4.47** |
| `elephunk` (frozen) | `#56909a` | 26.18 % | 1.000 | `#032833`, conc 0.480 | 19.76 % | 0.76 |
| `04/…825ea15` | `#dad9da` | 43.14 % | 0.864 | `#f4f4f4`, conc 0.347 | 8.92 % | 0.21 |
| `franz` (frozen) | `#020612` | 84.03 % | 1.000 | `#f9ecc5`, conc 0.266 | 11.72 % | 0.14 |
| `nobs` (frozen) | `#f6fefe` | 65.58 % | 1.000 | `#f4d105`, conc 0.138 | 6.40 % | 0.10 |
| `05/…5e5a5ff6` | `#e8ebef` | 77.06 % | 1.000 | `#111219`, conc 0.690 | 6.14 % | 0.08 |
| `08/…d2c8e8` | `#e8abb2` | 78.57 % | 1.000 | `#847096`, conc 0.333 | 5.74 % | 0.07 |

**0955cc is the only artwork in the entire verdict-carrying corpus where the enclosed field is larger
than the frame.** Everywhere the human blessed frame-as-background, the frame colour *is* the
artwork's dominant region — 26 %, 43 %, 66 %, 77 %, 78 %, 84 % — and what it encloses is a busy
interior with no comparable field. The decision gap on labelled data runs from **0.76** to **4.47**.

That is the whole diagnosis, and it is a statement about shape rather than about frames: **ground
never has a bigger thing behind it.** If a materially larger region never reaches an edge, the thing
at the edge is framing it, not underlying it.

Thickness does *not* separate — 0955cc's frame is 1.25 % of the short side, `elephunk`'s is 1.80 %,
`04/…`'s is 4.00 %. Neither does interior uniformity on its own (see §4).

---

## 2. Mechanism

`research/v2-3/src/internal/policy.ts` (`ALBUM_ARTWORK_PALETTE_V2_POLICY.mount`) and
`research/v2-3/src/internal/palette-core.ts` (`fieldScoreFrom`, `mountFamilyIds`).

The `fieldScore` formula is extracted into `fieldScoreFrom(terms, borderCreditRetained)` — identical
arithmetic, with the border term scalable. After every family has been measured (enclosure cannot be
read before that), `mountFamilyIds` marks a family as a mount when:

1. it owns essentially the whole border (`minimumBorderCoverage` 0.9), and
2. the largest family that never reaches the border (`maximumEnclosedBorderCoverage` 0.05) is at
   least `minimumEnclosedPopulationRatio` (2.5) times its population.

A mount is rescored with `borderCreditRetained` (0) applied to the border term alone. It keeps every
other piece of field evidence — breadth, coherence, quadrant reach, calm — and loses only the term
its shape does not earn.

This is deliberately **not** border-stripping: nothing is cropped, no family is withdrawn from any
lane, and a mount that is genuinely the artwork's dominant region keeps its credit in full because
nothing larger is enclosed by it. When no family is a mount the preliminary records are returned
unchanged, so the pass is a provable no-op on every artwork it does not fire on.

Set `borderCreditRetained` to 1 to restore previous behaviour exactly.

---

## 3. Before / after

### Verdict-carrying corpus — 107 cases

34 review fixtures + 34 scrambled variants + the **canonical off-panel manifest**
(`research/v2-3-eval/data/offpanel-manifest.txt`, 37 images, which includes the target) + two framed
artworks Track I found that the manifest omits (`04/…825ea15`, `08/…d2c8e8`), kept because they carry
the frozen-frame claim. Baseline regenerated on trunk **`548c2d1`** — i.e. after Track J's
mark-repaired accent scoring — rather than reusing older cached labels, so attribution is exact
across the rebase.

**1 of 107 changed: the target.** In particular:

- All **34 review fixtures** byte-identical on all four roles, gradient, both collapse flags and
  midpoint (verified against `review-fixtures.ts` directly, not against my own earlier run).
- All **34 scrambled** variants byte-identical.
- All **six framed artworks** — `elephunk`, `franz`, `nobs`, `04/…825ea15`, `05/…5e5a5ff6`,
  `08/…d2c8e8` — byte-identical; none of them fires the rule at all.
- **Track J's restored `05/…5e5a5ff6` palette is preserved exactly**: `#eff3f6 #d6d7dc #121117
  #ee231f`.

### Fresh off-panel sample — 150 artworks

Sampled deterministically across roots `00..14`, disjoint from the 107. Because the rule is a no-op
wherever it does not fire, a firing census is a sufficient screen.

**3 of 150 fire; none changes its published palette.** All three are hairline or thin light borders
around a large flat interior (ratios 44.5, 5.5, 2.7). Details in `data/fresh-census.json`.

### Determinism, typecheck, tests

- The 7 frame cases run twice → byte-identical JSON.
- `tsc -p research/v2-3/tsconfig.json` clean.
- `architecture.test.ts` 2/2 and `configuration.test.ts` 6/6 pass.

### Rebase onto Track J

Re-verified after merging trunk `548c2d1` (Track J's `signatureAccentRoleScore` + the canonical
off-panel manifest). The only conflict was textual and in `palette-core.ts`: Track J changed the
`coherentSupport` divisor to `SIGNATURE_COHERENT_SUPPORT_SCALE` on the line immediately after the
`fieldScore` assignment this track rewrote. The two are adjacent, not semantically coupled —
`fieldScoreFrom` computes the field term, `coherentSupport` feeds `signatureScore` — so the
resolution keeps both. All numbers in this document are post-rebase.

---

## 4. Threshold choice — stated plainly

`minimumEnclosedPopulationRatio` is the one load-bearing number, and it is **partly fitted**. Two
things determined it.

**The labelled gap.** Ratios on verdict-carrying artworks are 0.07–0.76 for every accepted
frame-as-background and 4.47 for the one case review wants flipped. Any threshold in (0.76, 4.47)
satisfies the brief. Placing it at an edge would be arbitrary; the arithmetic centre is 2.61.

**The fresh sample.** I measured the firing set at several values before choosing:

| ratio | fresh firings | of which change output |
| --- | --- | --- |
| 1.5 | 6 | **2** |
| 2.0 | 4 | 1 |
| **2.5 (shipped)** | **3** | **0** |
| 3.0 | 2 | 0 |

At 1.5 the two output-changing cases are `05/…9328b489` (grunge-bordered poster) and
`08/…5911c0a8` (cream border around a sky photograph). Both are mattes around a *photographic or
textured* interior — structurally the `elephunk`/`nobs` class the human accepted as
frame-as-background — and neither change looked like an improvement to me:

```
05/…9328b489  #fdfcf8 #fdfcf8 #ac7d25 #54ba33  ->  #fdfcf8 #5bbb35 #752019 #ac7d25
08/…5911c0a8  #fcfbe9 #fcfbe9 #7694b6 #034d96  ->  #fcfbe9 #7694b6 #044c94 #a2b2c1
```

So: 2.5 is justified as the centre of the labelled gap, **and** it is where fresh-sample churn goes
to zero. Those two facts agree here, but I want the second one on the record rather than dressed up
as the first. If the orchestrator prefers a threshold set purely from labelled evidence, 2.61 is the
honest number and behaves identically.

I also built and then **discarded** a second condition — a floor on the enclosed family's
`familyConcentration`, meant to encode "the frame displaced an *obvious* field". It does not do the
work: the two problematic cases at ratio 1.5 have enclosed concentrations of 0.800 and 0.981, above
0955cc's own 0.821. The ratio threshold subsumes it, and shipping an inert second knob would be
worse than shipping one honest one.

---

## 5. The cardinality question — partly resolved

The human also said of 0955cc: *"there are really only two colors in that artwork; the accent should
be collapsed to the foreground."*

- **Surface: resolved.** It now collapses onto the gold background (`collapse: [true, false]`).
- **Accent: not resolved.** It remains `#997634`.

But the measurement is informative. Projecting `#997634` onto the OKLab chord between the two
published colours `#fbbb4d` and `#131313`:

```
chordLength = 0.6609   position = 0.378   offset = 0.0071   relativeOffset = 0.0108
```

That is an **optical mixture of the artwork's two colours** — the anti-aliased edge where gold meets
black — and it sits inside the tolerance Track F's `fieldBlend` already uses
(`maximumRelativeOffset` 0.015). Track F deliberately withdraws such mixtures from the **field lane
only**, leaving them eligible in the signature and foreground lanes, which is exactly why one can
still surface as an accent.

So the human's "only two colours" complaint is a *signature-lane* instance of a phenomenon already
diagnosed and solved for the field lane. Extending the withdrawal to the signature lane is the
obvious next arm — but it must not be done blind: every artwork with anti-aliased lettering
(`slipknot`, `greenday`, `franz`, `vvbrown`) has such families, and Track F's census showed
`slipknot` alone absorbs ten. I did not attempt it here; it needs its own sweep.

---

## 6. Honest assessment

**Solid.**

- The separating statistic is measured on all seven relevant artworks, not asserted, and the gap is
  6× wide (0.76 → 4.47) with the target alone on one side.
- The mechanism is proportionate: one term of one score, no cropping, no lane withdrawal, and a
  provable no-op when it does not fire.
- Verification used a freshly regenerated trunk baseline and the real corpus, and the fixture parity
  check was made against `review-fixtures.ts` itself rather than against my own earlier run.
- The frozen cases are not near misses — none of them fires the rule at any threshold in the labelled
  gap; their ratios are 3–35× below it.

**Weak.**

- **n = 1.** One artwork in the entire verdict corpus is on the firing side. The threshold's position
  inside a wide gap is therefore under-determined, and §4 says exactly how much of it came from
  unlabelled data.
- **The three fresh firings have no verdicts.** They change nothing today, but they show the rule
  fires roughly 2 % of the time on unseen artwork, so a future ranking change could make one of them
  visible without anyone having judged it.
- **`minimumBorderCoverage` (0.9) and `maximumEnclosedBorderCoverage` (0.05) are untested.** No
  artwork in either corpus sits near either value — border coverage is bimodal in practice (0.92–1.0
  or 0.00–0.14). They are well-formedness guards, not calibrated thresholds, and I have no evidence
  about where they should sit.
- **Only the largest enclosed family is considered.** An artwork with two comparable enclosed fields,
  each individually smaller than the mount but jointly much larger, would not fire. Nothing in either
  corpus exercises this.

**What would firm it up.** Framed artworks are rare (6/67 in Track I, 3/150 here at the shipped
threshold), so the fresh-artwork rotation should be filtered *for frames* rather than sampled
uniformly — Track I's ring detector (`track-i/border-frame-audit.ts`) already does this cheaply.
Twenty framed artworks with verdicts, spread across thin-frame/wide-matte and flat/photographic
interiors, would turn the ratio from a fitted number into a measured boundary. Specifically useful:
a framed artwork with a **flat** interior whose frame the human still prefers (which would falsify
the rule), and a second thin frame over a flat field like 0955cc (which would confirm it).

---

## 7. Proposed review items

1. **`09/…0955cc…`** — `#131313 #131313 #fbbb4d #987734` → **`#fbbb4d #fbbb4d #131313 #997634`**.
   The decider. Does the gold-as-ground reading match the v2-2 output the human preferred STRONG?
2. **`09/…0955cc…` accent** — same case, narrower question: `#997634` is a measured gold/black
   optical mixture. Should it collapse onto the foreground, as the human suggested? A yes authorises
   the signature-lane arm in §5.
3. **`images/elephunk.jpg`** — unchanged (`#55919b #022833 #fcfdd1 #a5c7c8`). Identical-pair
   confirmation, thin frame over a busy interior.
4. **`images/franz.jpg`** — unchanged (`#020612 #020612 #f9ebc4 #da9925`). Identical-pair
   confirmation, frame colour *is* the dominant field.
5. **`images/nobs.jpg`** — unchanged (`#f6ffff #f2f626 #a1162d #0695fd`). Identical-pair
   confirmation, wide matte.
6. **`05/…9328b489`** and **`08/…5911c0a8`** — unchanged as shipped, but these are the two artworks
   a looser threshold would move. Worth a verdict on the *current* output specifically: if review
   says the frame is wrong on either, the threshold should come down to 1.5 and §4 reverses.

## 8. Files

- `research/v2-3/src/internal/policy.ts` — `mount` policy block (new).
- `research/v2-3/src/internal/palette-core.ts` — `fieldScoreFrom` (extracted formula),
  `mountFamilyIds`, mount rescoring before mark evidence.
- `research/v2-3-experiments/track-k/` — `labels.ts` (corpus-aware label harness),
  `frame-probe.ts` and `mount-probe.ts` (the §1 measurements), `mount-census.ts` (firing screen),
  `data/` (case list, trunk `548c2d1` baseline, after-labels, fresh-sample census).

---

# Round 2 — signature-lane optical blend (accent cardinality)

Follow-up authorised by batch 16. On the same artwork, the fully-collapsed
two-colour palette `#fbbb4d / #fbbb4d / #131313 / #131313` was **PREFERRED STRONG**
over the round-1 winner's `#997634` accent, and the reviewer's endorsed-sample
correction is exactly that palette.

**Result: the accent collapses to the foreground, cardinality 2 — the endorsed
palette exactly. 2 of 107 cases changed: the target, and one scrambled decoy
(§R2.5).**

| | before (trunk `3cb2ecd`) | after |
| --- | --- | --- |
| `09/…0955cc…` | `#fbbb4d #fbbb4d #131313 #997634`, collapse `[true, false]` | **`#fbbb4d #fbbb4d #131313 #131313`, collapse `[true, true]`** |

Corpus statement: measured with `PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images`
throughout — real artwork, not the `-scrambled` decoys.

## R2.1 — The obvious rule is wrong, measured

Round 1 established that `#997634` projects onto the chord between the two published
colours at relative offset 0.0108, inside `fieldBlend`'s 0.015. The tempting rule is
"withdraw accents that are chord blends". **It strips reviewed accents.** Projecting
every artwork's published accent onto its own background↔foreground chord:

| artwork | accent | relative offset | verdict |
| --- | --- | --- | --- |
| `once` | `#6c5f71` | **0.0074** | reviewed, must keep |
| `horrorwood` | `#808b91` | **0.0082** | reviewed, must keep |
| `placebo-scrambled` | `#465c5a` | 0.0108 | must keep |
| **`09/…0955cc…`** | **`#997634`** | **0.0108** | **must go** |
| `02/…00285d` | `#98908d` | 0.0119 | must keep |
| `01/…001738` | `#61625a` | 0.0123 | must keep |
| `doja` | `#fda8cf` | 0.0285 | reviewed, must keep |

Two reviewed accents sit **closer** to their palette's chord than the one that has to
go. Proximity is not the signal. Mark evidence is not either — the target's accent
family carries *more* `markSupport` (0.0068) than `horrorwood`'s (0.0003) or `once`'s
(0.0003).

I also tested whether the field pass's existing finding already covers it: it does
not. `fieldBlend` does not fire on this artwork at all, because its ladder has a gap
of 0.376 at the 0.015 tolerance. (At 0.06 the ladder is complete — 7 rungs, maximum
gap 0.163 — so the ramp between a *saturated* colour and black bows further off the
straight chord than the black↔khaki ramp `fieldBlend` was calibrated on. Noted as a
finding; I did not touch `fieldBlend`'s reviewed thresholds to chase it.)

## R2.2 — What does separate: cardinality, measured as coverage

The human's words were "there are really only two colors in that artwork". That is a
coverage claim, and it separates cleanly. Population of the family carrying the
background plus the family carrying the foreground:

| artwork | accent relative offset | **two-colour coverage** |
| --- | --- | --- |
| **`09/…0955cc…`** | 0.0108 | **95.34 %** |
| `04/…0044e4` | 0.0016 | 50.64 % |
| `horrorwood` | 0.0082 | 50.04 % |
| `horrorwood-scrambled` | 0.0090 | 49.20 % |
| `01/…001738` | 0.0123 | 35.32 % |
| `placebo-scrambled` | 0.0108 | 34.57 % |
| `once` | 0.0074 | 31.69 % |
| `02/…00285d` | 0.0119 | 2.82 % |

The target's two published materials own **95 %** of the artwork. Every other artwork
whose accent is an interior chord blend tops out at **51 %**. Those artworks have a
third material for an accent to be; this one does not. Decision gap 50.6 % → 95.3 %,
centre 73 %; shipped at **80 %**.

## R2.3 — Mechanism

`policy.ts` (`accentBlend.minimumTwoColourCoverage`) and `palette-core.ts`
(`edgeOfTheOnlyTwoColours`, read at `rankAccentOptions` and `createTreatment`).

An accent is *the edge between the artwork's only two colours* when the background's
family and the foreground's family own at least `minimumTwoColourCoverage` of the
pixels, and the accent projects strictly inside the chord between the two published
colours within `fieldBlend`'s existing offset tolerance. The geometry constants are
`fieldBlend`'s, deliberately: "is this an optical mixture" should mean one thing here.

Such an accent is **not removed from candidacy**. Its *evidence* reads zero in two
places:

1. `rankAccentOptions` — its `fidelity` is 0, so it ranks last and, decisively, it no
   longer inflates `accentOpportunity`. That matters because the collapsed treatment
   is scored as `1 - accentOpportunity`: the artwork was being charged for giving up
   an accent it never had.
2. `createTreatment` — the three sites that read `signatureAccentRoleScore` read 0, so
   the distinct-accent treatment carries no identity, fidelity or economy credit.

The rule deliberately does **not** require the surface to be collapsed. It is a claim
about the two materials the artwork is made of, and it must apply identically to a
treatment that reads the artwork the other way round (ink as background, field as
foreground). Without that symmetry a treatment dodges the rule by spending the same
edge ramp on its *surface* instead — measured, see §R2.4.

Set `minimumTwoColourCoverage` above 1 to restore previous behaviour.

## R2.4 — Four designs measured and rejected

Recorded because each failed in an informative way, and the failures constrain the
final shape more than the success does.

| design | result |
| --- | --- |
| **Filter blend accents out of candidacy** (`rankAccentOptions`) | Target regressed to a black background with an un-collapsed blend surface, **and** it moved a reviewed foreground on an unrelated two-colour fixture. Removing candidates perturbs `accentOpportunity`, which feeds foreground scoring. Rejected. |
| **Zero the accent's identity only** (`createTreatment`), leaving opportunity intact | Target became `#fbbb4d #fbbb4d #4e4023 #131313` — the *foreground* became a blend rung. Lowering the distinct treatment without correcting the opportunity just moves the damage. Rejected. |
| **Zero the opportunity only**, leaving identity intact | Field preserved but the accent stayed `#997634`: raising the collapsed treatment is not enough on its own. Rejected. |
| **Require the surface to be collapsed** (first shape of the rule) | Target regressed to `#131313 #4e4023 #fbbb4d #987734`. A competing treatment used a blend rung as its *surface*, so `surfaceCollapsed` was false and the rule skipped it. Dropping that condition is what makes the rule symmetric. Rejected. |

Both surviving sites are required: neither alone lands the endorsed palette.

## R2.5 — Full sweep

107 cases: 34 review fixtures + 34 scrambled + the canonical off-panel manifest (37,
including the target) + the two framed artworks the manifest omits. Baseline
regenerated on trunk **`3cb2ecd`**.

**2 of 107 changed.**

1. **`09/…0955cc…`** — the target, to the endorsed palette exactly.
2. **`images/black-scrambled.jpg`** — foreground and accent `#575757` → `#6f6f6f`
   (both roles collapsed before and after, so cardinality is unchanged).

On the second: it is a **scrambled decoy, not artwork, and carries no verdict**. The
real fixture it derives from is **unchanged**. The cause is understood and is the
mechanism working as designed rather than a defect: that artwork is genuinely
two-colour (coverage 83.6 %), so the rule applies, `accentOpportunity` drops, and
because different foreground candidates see different accent slates the collapsed
treatments re-rank. Both values are greys in a black artwork. I did not tune it away —
suppressing it would mean raising the coverage threshold above 84 %, which would sit
outside the measured decision gap and be fitted to a decoy.

- All **34 review fixtures** byte-identical, verified against `review-fixtures.ts`.
- All other **33 scrambled** variants byte-identical.
- All **six framed artworks** byte-identical; round 1's mount result intact.
- Track J's restored `05/…5e5a5ff6` palette intact.

Determinism reconfirmed (12 cases twice, identical). `tsc` clean. `architecture`
2/2, `configuration` 6/6.

## R2.6 — Honest assessment

**Solid.**

- The naive rule was tested and *refuted* before the real one was built: two reviewed
  accents are more chord-colinear than the target, so any offset-only rule regresses
  them. That is the strongest result in this round.
- Coverage separates with a 45-point gap and the threshold sits inside it.
- No candidate is removed; only evidence is zeroed. The distinction matters — the
  removal design demonstrably damaged an unrelated reviewed foreground.
- The mechanism reuses `fieldBlend`'s geometry rather than inventing a second
  definition of "optical mixture".

**Weak.**

- **n = 1 again**, and more sharply than round 1: exactly one artwork in the corpus is
  on the firing side of the coverage test *and* has a chord-blend accent. The 80 %
  threshold is bounded below by measurement (51 %) but not above by anything.
- **One decoy moved.** It is not artwork and carries no verdict, but it is evidence
  that the `accentOpportunity` correction propagates into foreground selection on
  two-colour artworks. On a corpus with more two-colour artworks this could surface
  somewhere that does carry a verdict.
- **`fieldBlend`'s tolerance is mis-calibrated for saturated pairs** (§R2.1). The
  ladder here is complete at 0.06 and gapped at 0.015. I left the reviewed constant
  alone, but that is a known, unaddressed inaccuracy — and if it were fixed, this
  artwork's blend ramp would be withdrawn from the field lane too, which is arguably
  the more fundamental repair.
- **Coverage uses only the two role-carrying families.** An artwork whose field is
  split across two near-identical families would under-count and escape the rule.

**What would firm it up.** Two-colour artworks — flat vector posters, single-ink
sleeves — are a recognisable stratum and rare in the current sample. Filtering the
fresh rotation for *high two-colour coverage* (cheap: one evidence build) and getting
verdicts on ten of them would convert the 80 % threshold from bounded-below to
measured. Most valuable: a two-colour artwork with a genuine third accent that the
human keeps, which would falsify the rule as stated.

## R2.7 — Proposed review items

1. **`09/…0955cc…`** — `#fbbb4d #fbbb4d #131313 #997634` → **`#fbbb4d #fbbb4d #131313
   #131313`**, cardinality 2. The decider; matches the endorsed sample exactly.
2. **`images/horrorwood.jpg`** — unchanged (`#141b25 #36444f #ccd3d9 #808b91`). The
   sharpest guardrail: its accent is *more* chord-colinear than the target's and it
   survives on coverage alone.
3. **`images/once.jpg`** — unchanged (`#817486 #dddde7 #3b303e #6c5f71`). Same, at the
   most colinear accent in the corpus (0.0074).
4. **`images/doja.jpg`** — unchanged (`#fd75b5 #fd3d86 #fff6fc #fda8cf`). Reviewed
   accent, near-chord but outside tolerance.
5. **`images/black.jpg`** — unchanged (`#000000 #000000 #575757 #575757`). A genuine
   two-colour artwork where the rule fires and correctly changes nothing.
6. **`images/black-scrambled.jpg`** — `#575757` → `#6f6f6f` on foreground/accent. The
   only unintended movement. Not artwork and unverdicted, but flagged rather than
   hidden; a "this is fine" closes it, a "this is wrong" means the opportunity
   correction needs narrowing.

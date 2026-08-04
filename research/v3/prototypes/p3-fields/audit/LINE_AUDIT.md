# P3 line audit — every site where a colour value is computed, transformed, or compared

**Auditor:** W3 (independent verification worker). **Scope:** `research/v3/prototypes/p3-fields/src/**`,
all eleven files, read in full. **Standard:** README.md's binding discipline line —

> Nothing colour-bearing is ever created. Every object the algorithm builds is either a pixel of the
> artwork or a *number attached to a pixel*. All aggregation happens in the scalar domain.

**Method.** Every file read line by line, then an exhaustive `grep` sweep over `lab[`, `.lab`, and
`rgb[` across all of `src/` to guarantee no channel-touching expression was missed by reading. The
inventory below is that sweep, complete — there is no colour-channel expression in `src/` that is not
in this table or covered by a row's rollup. Comments were not trusted: every classification was made
from the expression, and the two comment-asserted claims that mattered (the guide-stop AUDIT NOTE and
the ink ground-clearance clause) were checked against what the code actually does.

**Classification key.** `PIXEL` = an actual pixel of the artwork. `NUMBER` = a scalar attached to a
pixel. `GEOMETRY` = measurement geometry in the difference space (arm-d §2.3's `u` precedent).
`VIOLATION` = a colour-bearing object created and used as a colour.

---

## 1. Decode and the ruler

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `decode.ts:120–122` | 8-bit sRGB triple copied into the `rgb` plane | PIXEL | Verbatim copy of the decoded buffer; no transform. |
| `decode.ts:142–145` | `rgbToOkLab` per pixel into the `lab` plane | PIXEL | A per-pixel change of coordinates of one pixel. Injective, no neighbour enters. |
| `decode.ts:110, 134–139` | `regionOfColor: Map<packed, regionIndex>` memo, keyed on the packed 8-bit triple | NUMBER | **Ruling (d) below.** Stores a region *index*; no colour is ever read out. |
| `decode.ts:140` | `bar[index] = REGION_BAR_BY_INDEX[region]` | NUMBER | The contract's calibrated bar, one scalar per pixel. |
| `decode.ts:124–130` | `alpha < 255` → ineligible, `lab`/`bar` left at zero | PIXEL | Exclusion, never a matte. No compositing anywhere in the file. |
| `primitives.ts:38–42` | `labDistance` = `hypot` of three channel **differences** | NUMBER | Difference of two pixels → one scalar. The one ruler. |
| `primitives.ts:62–91` | `assertRulerAgrees` — plane ruler proved equal to `okLabDistance` at load | NUMBER | Verified live: it throws on drift and does not. Not a colour site. |
| `primitives.ts:45–54` | `labDistanceToPoint` — distance from a pixel to a **loose OKLab point** | — | **Dead code.** `grep` over `src/` and `falsifier/` finds zero call sites. This is the only affordance in the prototype for measuring a pixel against a created colour, and nothing uses it. Not a violation; flagged as a latent affordance that should be deleted. |

## 2. The two fields

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `fields.ts:89` | `labDistance(lab, index, neighbour)` — distance from p to each of eight neighbours | NUMBER | Distances *to p*, never to a neighbourhood summary. |
| `fields.ts:90–97` | Insertion of the eight distances into a descending run | NUMBER | Sort of scalars. |
| `fields.ts:102–108` | k-th largest vs `bar[index]` → `isEdge` | NUMBER | A rank filter on scalars; output is one boolean per pixel. No linear filter on any channel. |
| `fields.ts:122–210` | Exact EDT (Felzenszwalb–Huttenlocher), two separable passes | NUMBER | Operates on a 0/∞ seed grid — squared distances only. No channel is read anywhere in the transform. |
| `fields.ts:207` | `depth = sqrt(grid)/longEdge` | NUMBER | Scale-free normalisation of a scalar. |

## 3. Field roles (arm-d §2.3)

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `primitives.ts:190–204` | `cascadePixel` — median of L, restrict to attainers; then a; then b | PIXEL | Lower median (`floor((size−1)/2)`), never interpolated, and each pass **restricts to pixels attaining the value** (`lab[…] === median`). Terminates on a member of the input population. Verified by reading, not by comment. |
| `primitives.ts:206–218` | Tie-break on the lexicographically smallest 8-bit triple | PIXEL | A comparison of two pixels; intrinsic to the multiset, not to scan order. |
| `field-roles.ts:112` | `median = cascadePixel(fieldSet, …)` | PIXEL | Per above. |
| `field-roles.ts:115` | Order F by `labDistance(…, median)` | NUMBER | Pixel-to-pixel distances. |
| `field-roles.ts:121–124` | `dl, da, db` and `extent = hypot(…)` — the difference from m to e₁ | GEOMETRY | Difference of **two actual pixels**. |
| `field-roles.ts:142` | `u = [dl,da,db]/extent` — the unit direction | GEOMETRY | arm-d §2.3(3) explicitly: *"a direction is three numbers and is not colour-bearing."* Never published, never compared to a pixel as a proxy. Confirmed: `direction` is returned but the only consumers are the projection dot products below. |
| `field-roles.ts:143–156` | Projection of each pixel of F onto `u` | NUMBER | Dot product of a pixel-minus-pixel difference with a direction → one scalar per pixel. Accumulation is of *products of differences*, not of channel values. |
| `field-roles.ts:161–162` | Collapse test: `labDistance(farEnd, nearEnd) < max(bar)` | NUMBER | Pixel-to-pixel. |
| `field-roles.ts:90–100, 165–166` | Prevalence: count pixels of F within the bar **of an end pixel** | NUMBER | Counts within the same-colour bar of *a pixel* — explicitly allowed. |

## 4. Gradient (arm-d §2.4)

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `gradient.ts:89–111` | t = projection rescaled by its own τ / (1−τ) quantiles, oriented, clamped | NUMBER | Quantiles of a scalar field. |
| `gradient.ts:97–105` | `projectionOf` for the flip decision | NUMBER | Same dot product as §3. |
| `gradient.ts:121–157` | Spatial dictionary: four linear headings + two radial origins, from **positions only** | NUMBER | No channel is read. |
| `gradient.ts:159–170` | Spearman(t, each dictionary entry) → the gradient boolean | NUMBER | Rank correlation on scalars; no fit, no residual. |
| `primitives.ts:117` (via `spatialCascade`, `primitives.ts:228–244`) | Median x, restrict, median y | NUMBER | Positions, never colours. |
| `gradient.ts:190–202` | `bandCascade` — cascade pixel of the F-pixels whose t is within the band | PIXEL | Population → actual pixel. |
| **`gradient.ts:250–256`** | **The chord point:** `l, chromaA, chromaB` = lerp between two published pixels at `local`; `excursion = hypot(pixel − that point)` | **GEOMETRY — see ruling (a)** | The one affine combination of channel values in the prototype. |
| `gradient.ts:258–286` | Guide-stop insertion at the arg-max, with three refusals | PIXEL | `path` holds `{pixel, position}`; `worst.pixel` is a `bandCascade` result. **Verified: no stop is ever a chord point.** |
| `gradient.ts:268–278` | Refuse a stop within the bar of a stop already on the path | NUMBER | Pixel-to-pixel via `sameColorBar` on two `pixelRgb` values. |

## 5. Foreground (arm-d §2.5)

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `foreground.ts:88–99` | Annulus sampled at 24 fixed angles, radius ∝ depth | NUMBER | Positions only. |
| `foreground.ts:102` | `ground = cascadePixel(ring, found, …)` | PIXEL | **An actual pixel of the ring**, by the cascade's restrict-to-attainers property. Not a local mean colour. |
| **`foreground.ts:104–106`** | **W1's added clause:** `labDistance(lab, index, ground) < groundBar` → skip | **NUMBER — see ruling (b)** | Pixel-to-pixel. |
| `foreground.ts:108–113` | Coherence: fraction of ring pixels within the pair bar of `ground` | NUMBER | Counts within the bar of *a pixel*. |
| `foreground.ts:144–149` | Ink ordering; `scoreOf: Map<pixelIndex, score>` | NUMBER | Keyed by **position**, not by colour. |
| `foreground.ts:158–177` | Luminance regime: `|apcaRaw(pixel, backgroundPixel)|`, depth-restricted | NUMBER | Two actual pixels into the contract's APCA. |
| `foreground.ts:180–192` | `cascadePixel` of the top-τ window | PIXEL | Population → actual pixel. |

## 6. Accent (arm-d §2.6)

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `accent.ts:71–77` | Clear the pair bar from **both** field-end pixels | NUMBER | Pixel-to-pixel. |
| `accent.ts:85–86` | `\|ΔL\|` vs `hypot(Δa, Δb)` against the **nearer end pixel** | NUMBER | Differences of two pixels; lexicographic tiering, never a weighted sum. |
| `accent.ts:95–96, 118–125` | Sort by distance-from-field; `cascadePixel` of the top-τ window | PIXEL | Population → actual pixel. |

## 7. Verification, pipeline, publication

| Site | What happens | Class | Justification |
| --- | --- | --- | --- |
| `verify.ts:85–95` | Count pixels within the pair bar of the candidate **pixel**; bin their positions | NUMBER | arm-d §2.7's neighbourhood form. Positions binned, never a centroid. |
| `verify.ts:53–73, 98` | Interquartile extent of the position bins | NUMBER | Quantiles of positions. |
| `pipeline.ts:104–109` | `barBetween` / `distinctPixels` on two `pixelRgb` values | NUMBER | Pixel-to-pixel. |
| `pipeline.ts:112–128` | `containsExactly` (exact-triple scan) and `wholeImageIsOneColor` | NUMBER | Equality and bar comparisons against a pixel. |
| `pipeline.ts:157–160, 170` | Publication: every role and every interior stop is `colorFromRgb(pixelRgb(image, …))` | PIXEL | **The publication boundary is clean.** No path publishes anything but a pixel index redeemed through `pixelRgb` — except the escape. |
| `pipeline.ts:382–385` | Escape: `colorFromHex("#ffffff")` / `"#000000"`, chosen by `\|apcaRaw\|`, gated on `containsExactly` returning false | — **see ruling (e)** | A literal, not an aggregate. |
| `pipeline.ts:304–317` | `FOREGROUND_ACCENT_SEPARATION_DISTANCE` / `ACCENT_FUNCTIONAL_DISTANCE` as verification predicates | NUMBER | Used only to reject, never to choose — confirmed by reading the control flow: both sit inside `continue` guards after the pixel is already chosen. |

---

## Rulings

### (a) The guide-stop chord point — `gradient.ts:250–256`. **ADMISSIBLE.**

The expression materialises an OKLab triple that is not a pixel: an affine combination
`A + local·(B − A)` of two published pixels. Read literally against README's ban list ("any
synthesized, blended, or interpolated colour") this is a blended colour, and the flag in the code is
right to call it out.

Three findings put it inside the line:

1. **The author prescribed it by name.** arm-d §2.4: *"The 2-stop straight line in OKLab from
   background to surface is the flattest possible path; its **excursion** at t₀ is the distance from
   that line at t₀ to c(t₀)."* The chord is not an implementation liberty; it is the specified
   measurement. The `u` carve-out at §2.3(3) is the same author drawing the same line explicitly.
2. **It never functions as a colour.** Verified from the code, not the comment: the triple's sole
   consumer is `hypot` on line 256, producing one scalar. It is never published (`path` holds pixel
   indices; `pipeline.ts:170` redeems interior stops through `pixelRgb`), never rounded to 8 bits,
   never entered into a `sameColorBar` test, and never selected *toward*. It ranks grid samples; the
   winner is `bandCascade`'s actual pixel.
3. **It is removable without changing a bit.** The excursion is identically
   `‖(c − A) − local·(B − A)‖` — a norm of a linear combination of two **pixel-to-pixel difference
   vectors**, which is exactly the object arm-d §2.3 rules non-colour-bearing. The materialised point
   is an arithmetic convenience with no semantic role.

The one honest asymmetry, recorded rather than smoothed: `u` is a *normalised difference* and lives in
the difference space, whereas the chord point is an *affine combination* and lives where colours live.
§2.3's carve-out is worded for a direction. §2.4's prescription is what carries this site, and finding
(3) is why the distinction has no consequence. **Ruling: admissible measurement geometry, on the
author's own §2.4 precedent.** Recommendation (non-blocking): rewrite as the difference form so the
discipline is legible without a footnote.

### (b) W1's added ink ground-clearance clause — `foreground.ts:104–106`. **ADMISSIBLE — pixel-to-pixel.**

`ground` is `cascadePixel(ring, found, lab, rgb)`. The cascade restricts to attainers at each of its
three passes (`primitives.ts:196–203`) and tie-breaks among survivors (`:206–218`), so its return
value is necessarily a member of `ring[0..found)` — an actual pixel of the artwork, not the annulus's
mean. The clause is therefore `labDistance` between two pixel indices against the pair's regional bar:
the same comparison form used everywhere else in the pipeline. It clears the discipline line.

Separately, and outside my remit: the clause is **an addition to arm-d §2.5**, which defines the ink
score from the surround's coherence alone. W1 declares it in the module docstring and states the
reason (without it the score saturates at 1.0 on flat regions and the published "ink" is the
background). The addition is disclosed, not smuggled. It is a design deviation for the reviewer to
rule on, not an audit finding.

### (c) Float accumulation / mean / lerp on L, a, b channel values. **ONE SITE, already ruled.**

The exhaustive sweep resolves this cleanly. Across all of `src/`, every expression combining channel
values takes one of exactly four forms:

- **subtraction** of two pixels' channels (`primitives.ts:41,53`; `field-roles.ts:121–123,145–147,153–155`;
  `accent.ts:85–86`; `gradient.ts:101–103,275–277`) — differences, output scalar;
- **equality / lexicographic comparison** (`primitives.ts:197,213–215`; `pipeline.ts:115`);
- **assignment** during decode (`decode.ts:120–122,142–145`);
- **one affine combination** — `gradient.ts:252–254`.

There is **no mean of a channel anywhere**. Every median in the pipeline is a lower median
(`primitives.ts:194,237,241`; `falsifier/fields.ts:361`), never interpolated. Every Float accumulation
in the prototype (`field-roles.ts:145–147` projection, `primitives.ts:301–307` Spearman,
`verify.ts:93–94` position bins) accumulates **scalars or products of differences**, never channel
values. The only lerp is the chord point, ruled admissible in (a).

### (d) `decode.ts`'s colour-keyed memo — `decode.ts:110, 134–139`. **ADMISSIBLE, with a documentation divergence.**

The `Map<packed, regionIndex>` is indexed by colour, which README's ban list forbids flatly ("any data
structure indexed by colour"). What it holds is a region index — a number attached to a colour — and
no pixel or colour is ever read out of it; it exists so `colorRegion` runs once per distinct triple
instead of once per pixel. The value is admissible.

The divergence worth recording: `candidate.ts:13–14` restates the ban as *"no data structure indexed
by colour **that a colour could be read back out of**"*, which is looser than README's wording and is
precisely the loosening this memo needs. The code is fine; the restatement of the binding line in the
file an auditor opens first is not verbatim. Reported, not smoothed.

### (e) The escape's `#ffffff` / `#000000` — `pipeline.ts:382–385`. **ADMISSIBLE.**

The published foreground in the escape branch is a literal, not a pixel. It is sanctioned by arm-d
§2.7 and by the contract's own `NonSourceColorEscape`, it is gated on `containsExactly` proving the
artwork does not contain it, it is declared in `palette.escape`, and it is not an aggregate of
anything — the discipline line governs what aggregation may create, and no aggregation produced this.
Admissible. (Not exercised on demo-20: zero rows escaped.)

---

## Verdict

# HOLDS-WITH-RULINGS

No violating site. Every published colour on every code path is a pixel index redeemed through
`pixelRgb`, except the contract's own declared escape. There is no colour histogram, no bin, no
centroid, no local mean colour, no linear filter on a colour channel, and no colour-indexed structure
a colour can be read out of. The five rulings above are (a) the chord point, (b) the ink clause,
(c) the single-lerp finding, (d) the region memo, (e) the escape literal — all admissible, three of
them on the author's own written precedent.

Two non-blocking items for W1:

1. **`labDistanceToPoint` (`primitives.ts:45–54`) is dead.** It is the prototype's only affordance for
   measuring a pixel against a created colour, and nothing calls it. Delete it — an unused affordance
   for the one thing the discipline forbids is a hazard with no benefit.
2. **The chord point could be written in difference form** and stop needing an AUDIT NOTE.

One design deviation, disclosed by W1 and outside audit scope: the ink ground-clearance clause is an
addition to arm-d §2.5.

/**
 * P5 — **the mark/region support instrument** (v0.9, `V9_BRIEF.md`; design source arm-f §2.3, the
 * deferred half of the original design).
 *
 * Nothing in this file is wired. `candidate.ts` does not import it, `ALGORITHM_VERSION` does not
 * move, and every published palette is byte-identical to v0.8.2 while it exists. Pass V9a builds the
 * instrument and measures it; pass V9b decides what reads it.
 *
 * ## What this measures, and why it is not a segmentation
 *
 * The paradigm line binds (`V9_BRIEF.md` constraints): **fit first, group the residual**. So the
 * image arrives here already split by the fit into two kinds of material, and this module never
 * looks at the raster to decide which is which:
 *
 *  - **regions** — the field-like components the recursion accepted (`fitFieldComponents`). Each is
 *    a *fit*: a surface plus the pixels it explains. They are taken **whole**, never re-grouped
 *    spatially, because a component is already the answer to "what is one material here"; splitting
 *    a sky that shows through trees into its visible patches would fragment exactly the mass this
 *    instrument exists to accumulate. On a cover the global fit explained (no recursion) there is one
 *    region: the fit's own inlier set.
 *  - **marks** — everything no accepted component claims, grouped into **spatially connected**
 *    components at a scale chosen by scale-space stability. This is the connectivity of the fit's
 *    rejections, and it is the only place a connected-component operator appears.
 *
 * Both carry the same five quantities, so the two halves of the union are comparable: connected
 * support, spatially-accumulated mass, a robust colour, its chroma, an ink verdict measured on the
 * real support, and the local field it sits on.
 *
 * ## The four things it fixes, named
 *
 * 1. **Mass is spatial, not triple-wise.** A mark's mass is the pixel weight its *support* holds —
 *    every pixel counts, and there is no floor inside a mark. `assignment.ts`'s identity set drops
 *    exact triples below `IDENTITY_MASS_FLOOR_FRACTION` before it agglomerates, which is why the
 *    NARCOSIS cover's textured 40%-of-frame crimson contributes literally nothing to it
 *    (`measurements/m1-report.md`: `massRetained` 0.1819, and the crimson appears nowhere in the
 *    full 27-family ranking). Ten thousand sub-floor triples inside one connected mark are one mark
 *    here.
 * 2. **The ink instrument gets a real support.** wp12 §3 measured erosion mortality at **1.0000 on
 *    60 of 60** floor-clearing candidates, because a bar-neighbourhood cluster's "support" is the
 *    scatter of every pixel of a colour — a colour family, not a mark. The same function
 *    (`inkStatistics`, unchanged, imported) on a connected support is the instrument wp12 could not
 *    build, and it is what un-defers SPEC decision 15b.
 * 3. **Identity families are read off material, not off triples** (`identityFamiliesV2`).
 * 4. **The local field is the one the material sits on**, evaluated at the material's own position.
 *
 * ## Determinism
 *
 * No randomness and no map-iteration-order dependence: components are labelled in raster-scan seed
 * order, the robust colour is a weighted median with a packed-integer tie-break followed by
 * `snapToArtwork` (whose own tie-breaks end at the packed integer), and every ordering in this file
 * ends at the packed 24-bit representative, which is unique per triple. The scale sweep is a fixed
 * ladder of integers computed from the raster's dimensions.
 */

import { okLabDistance, rgbToOkLab } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import { decompose } from "../../../src/contract/perception-model-spaces.ts"
import type { OkLab } from "../../../src/contract/types.ts"

import {
	agglomerateBarNeighbourhoods,
	IDENTITY_FAMILY_BAR_MULTIPLE,
	IDENTITY_FAMILY_COUNT,
	sameColorLab,
} from "./assignment.ts"
import type { IdentityFamily, IdentitySet, MassPoint } from "./assignment.ts"
import {
	chessboardDistanceToComplement,
	closeSupport,
	COMPONENT_INK_MORTALITY,
	componentIsInkLike,
	INK_SCALE_FRACTION,
	INK_TEXTURE_CLOSING_FRACTION,
	inkStatistics,
	scaleRadius,
} from "./components.ts"
import type { FieldComponent, FieldReading, InkStatistics } from "./components.ts"
import { normalizedX, normalizedY, unpackRgb } from "./decode.ts"
import { NO_FIELD_EXPLAINED_FRACTION } from "./fieldfit.ts"
import { snapToArtwork } from "./snap.ts"
import type { DecodedRaster, FieldFit, Inventory, TripleStats } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// The scale sweep — arm-f §2.3's scale-space stability
// ---------------------------------------------------------------------------------------------
//
// > *"Group it into components by connectivity at a scale chosen by scale-space stability: sweep a
// > small range of grouping scales and take the scale at which the component count is flattest,
// > which is where the structure is real rather than an artefact of the operator."*
//
// **The criterion is the rule and it is implemented literally; the three numbers below are the
// sweep's envelope, not the decision.** What a grouping scale `r` means here: two unexplained pixels
// belong to the same mark when they are connected in the mask dilated by chessboard radius `r` —
// single-linkage at spatial scale `r`, so `N(r)` is monotone non-increasing and `r = 0` is plain
// 8-connectivity, the operator-artefact end arm-f contrasts the plateau against.
//
// Three implementation choices that are *not* thresholds, stated so they can be argued with:
//
//  - **The ladder is geometric.** Scale space is logarithmic — a plateau is a plateau in `log r` —
//    and a linear sweep would also cost `O(r_max)` full-resolution labellings, which at 3000² is the
//    difference between an instrument and a benchmark. `√2` is the standard octave-halving step.
//  - **"Flattest" is read literally first**: `N` is an integer count, and the flattest a count can be
//    is *unchanged*. So the primary criterion is the **longest run of consecutive rungs carrying the
//    same count** — the plateau, which is also scale space's own notion of a stable structure (a long
//    lifetime). Where a plateau exists this is unambiguous and needs no derivative.
//  - **Where no count repeats there is no plateau**, the criterion has nothing to read and a
//    **stated default scale** is taken instead (`MARK_SCALE_DEFAULT_DIAGONAL_FRACTION`, v0.9.0's
//    ruling — see that constant for the two curves that bracket it). The continuous relaxation
//    v0.9a measured in this slot — the flattest centred log-log slope `|Δln N / Δln(1 + r)|` — is
//    **still computed and still published** on `MarkScaleChoice.flatness`, and it decides nothing:
//    v0.9a measured it picking opposite ends of the ladder on two covers of the same corpus, which
//    is what a criterion does when the curve it reads has no shoulder to find.
//  - The sweep **stops at the first scale where nothing is left to merge** (`N ≤ 1`): the curve
//    carries no information past it.
//
// Ties go to the finer scale on both readings: of two equally flat readings the more conservative one
// keeps more structure apart, and it is the one whose marks are still marks.
//
// **V9a measured arm-f's criterion to be unstable across covers and said so** (`reports/wv9a.md`):
// the fallback was reached on 3 of 6 probed covers, and on a residual that is pure texture the count
// curve is convex with no shoulder, so the flattest slope sits at whichever end the convexity points
// to — `r = 1` and 473 marks on round-3 item 4, `r = 23` and 7 marks on NARCOSIS. That is a finding
// about arm-f's criterion rather than a defect of this implementation of it, and **v0.9.0's ruling is
// to keep the criterion where it can be read and to stop pretending it can be read where it cannot**:
// plateau when a plateau exists, a stated scale otherwise. The whole `N(r)` curve stays published on
// `MarkScaleChoice`, which is the only thing that makes either half arguable.

/**
 * Finest grouping scale in the sweep, as a fraction of the **image diagonal**.
 *
 * `[UNCALIBRATED]`, a sweep endpoint rather than a decision — the plateau criterion chooses inside
 * the envelope and the report publishes the whole `N(r)` curve, so a wrong endpoint shows up as a
 * plateau against the wall rather than as a silently different answer. The diagonal is the brief's
 * own scale reference; 0.002 of it is 1 px on a 300² cover, 2 px on a 640² one, 8 px on a 3000² one
 * — the speckle scale at every size, which is the same regime `INK_TEXTURE_CLOSING_FRACTION` (2 px
 * at 300², measured) calls dither rather than structure.
 */
export const MARK_SCALE_SWEEP_MIN_DIAGONAL_FRACTION = 0.002

/**
 * Coarsest grouping scale in the sweep, as a fraction of the image diagonal.
 *
 * `[UNCALIBRATED]`, the other endpoint. 0.05 of the diagonal is 21 px at 300², 45 px at 640² and
 * 212 px at 3000². The lower bound on a useful value is the one measured quantity in the
 * neighbourhood: wp12's display type on a 640² cover has modal stroke widths 31–37 px, so a sweep
 * that stopped below ~0.04 of the diagonal could not merge display lettering into a word.
 */
export const MARK_SCALE_SWEEP_MAX_DIAGONAL_FRACTION = 0.05

/** Geometric step of the ladder. `√2` — half an octave, the standard scale-space sampling. */
export const MARK_SCALE_SWEEP_RATIO = Math.SQRT2

/**
 * **The grouping scale taken when the plateau criterion has nothing to read** (v0.9.0's ruling on
 * V9a finding 2), as a fraction of the image diagonal.
 *
 * `[UNCALIBRATED]`, and bracketed by the two `N(r)` curves V9a published — the same shape of
 * provenance as `FOREGROUND_MIN_RAW_APCA`'s reviewer bracket, with measurements rather than verdicts
 * at the ends. Both are re-derivable with `measurements/v9b-scale.ts`:
 *
 *  - **Lower end — round-3 item 4, `4130886c02`, 300×300, diagonal 424.26.** Curve
 *    `N(0)=907, N(1)=472, N(2)=182, N(3)=54, N(4)=24, N(5)=2, N(6)=1` over 7 044 unexplained px.
 *    The slope reading took `r = 1`: **472 marks**, 15 px each, and the reviewer's asked-for white
 *    title (6 px of exact `#ffffff`, 91 px of pale material) is spread over ≥ 4 marks of ~30 px
 *    (`reports/wv9a.md` §c). A scale that fragments a word is below the structure it is grouping:
 *    `1 / 424.26 = 0.00236` is falsified from below.
 *  - **Upper end — NARCOSIS, `45baf46c90`, 640×640, diagonal 905.10.** Curve
 *    `N(0)=3041, N(2)=440, N(3)=211, N(4)=118, N(6)=55, N(8)=35, N(11)=19, N(16)=13, N(23)=7,
 *    N(32)=5, N(45)=1` over 44 798 unexplained px. The slope reading took `r = 23`: **7 marks**, and
 *    at that scale one of them holds 41 195 of the 44 798 unexplained pixels — the sky's scrub, the
 *    horizon line and the crimson field are one object. A scale that merges a picture into a blob is
 *    above the structure it is grouping: `23 / 905.10 = 0.02541` is falsified from above.
 *
 * The value is the **geometric centre of that bracket** — `√(0.00236 × 0.02541) = 0.00774`, taken to
 * two figures. Geometric because scale space is logarithmic: the midpoint between two scales is
 * their ratio's square root, which is also why the sweep's own ladder steps by `√2`. It is 3 px on a
 * 300² cover, 7 px on a 640² one and 34 px on a 3000² one.
 *
 * **This is a default, not a criterion.** Where a plateau exists it is what the sweep found and this
 * number is not consulted; `MarkScaleChoice.criterion` says which of the two happened on every cover,
 * and the curve it was read off is published beside it.
 */
export const MARK_SCALE_DEFAULT_DIAGONAL_FRACTION = 0.0077

/**
 * The weight above which the field is said to explain a pixel.
 *
 * **Not a new number**: it is `fieldfit.ts`'s own inlier convention, the one `FieldFit.inlierFraction`
 * and `FieldComponent.coreFraction` are both defined by. It is used here only on the path where no
 * component pool exists and the fit itself is the region.
 */
const FIELD_INLIER_WEIGHT = 0.5

// ---------------------------------------------------------------------------------------------
// The family self-coherence gate (v0.9.2, wired and on) — the explained-fraction principle, third
// application
// ---------------------------------------------------------------------------------------------
//
// **The ruling v0.9.0's loud finding earned** (`reports/wv9b.md` §"Loud finding"; the v0.9.0 commit
// message). A mark's identity contribution is *one colour standing for its whole support*, and that
// standing has to be earned rather than assumed: on an illustrated residual the median of 328 000
// pixels is a colour **no** pixel of the mark is, and on `a8942d6547` — round-3 item 7, graded STRONG
// in silence — that blend median entered the identity set at massFraction .80, took family 1, and
// displaced the reviewer's `#009cff` through coverage. The mechanism's own premise (spatially
// accumulated mass sees material the triple floor discards) is sound; what was missing is the check
// that the accumulated material is *one* material.
//
// So: **a mark/region contributes an identity family only if at least
// `NO_FIELD_EXPLAINED_FRACTION` of its own pixels lie within `COHERENCE_GATE_BAR_MULTIPLE` bars of
// its own published colour.** In v0.9.2 that rule is wired, on, and read on every published palette;
// there is no flag. The two halves have different standing, and the difference is what v0.9.1's
// measurement pass was for:
//
//  - the **fraction** is `NO_FIELD_EXPLAINED_FRACTION` (0.5), inherited rather than re-derived;
//  - the **radius** is *not* the family-merge radius. The ruling first named
//    `IDENTITY_FAMILY_BAR_MULTIPLE` = 1, and measured there the gate failed on its own anchor — the
//    NARCOSIS crimson, the colour the whole mechanism exists to reach, is .0589 self-coherent at one
//    bar and would have been withheld beside the two blend medians the gate exists to withhold. So
//    the radius became `COHERENCE_GATE_BAR_MULTIPLE`, a constant carrying its own measured bracket.
//    That is precedent 2's shape below (`COMPONENT_CORE_FRACTION` decoupling from decision 9's
//    fraction on measured evidence), and it means "coherent" reads as *these pixels sit within one
//    gate radius of the colour offered for them*, not *they would have merged into one family had
//    they been offered as triples*.
//
// ## Why reusing 0.5 is the principle rather than a coincidence
//
// This is the **third application of one idea**: *a fit may speak for a domain only when it explains
// at least half of it.* The two already in the stack are
//
//  1. **field → image** — `NO_FIELD_EXPLAINED_FRACTION` itself (`fieldfit.ts`, SPEC decision 9): one
//     global surface is the picture's field only if it explains half the picture, else `noField`;
//  2. **component → support** — `COMPONENT_CORE_FRACTION` (`fieldfit.ts`, decision 12's smooth-gate
//     ruling): a component is a field-like surface only if enough of its own claim sits inside its
//     inlier core. That one **decoupled** to 0.39 on a single measured cover, which is the standing
//     precedent for *how* this constant may move: with a cover that measures it, under its own name;
//  3. **family → mark** — here. A mark's colour speaks for the mark only if it is the same colour as
//     half the mark.
//
// The value is therefore inherited, not chosen, and it is inherited under an explicit warning: if a
// cover is ever measured that wants a different fraction *here*, the answer is precedent 2's — a new
// constant with that cover as its anchor, never a quiet edit of decision 9's number.
//
// ## What it is not
//
// Not an eligibility gate on the **candidate pool**. A blend median is still a colour the image
// contains and it still enters the accent pool with its spatial mass, exactly as in v0.9.0 — arm-f
// §2.4's "no role has an eligibility gate" is untouched. What the gate withholds is the right to
// define what *the artwork's identity* is, which is a claim about the whole image and is the one
// place a colour nothing is actually made of does measurable damage.
//
// The verdict is measured on the **published** colour (`MarkRegion.lab`, the exact artwork triple the
// entry would contribute), not on the pre-snap median: the published colour is what enters the
// agglomeration as a point and what `familyCovers` tests, so it is the colour whose standing is in
// question. `selfCoherenceMedian` publishes the same fraction against the raw median beside it, so
// the choice is arguable against its own numbers rather than asserted (`measurements/v9c-*`).
//
// The consequence of *not* being a pool gate is published and is not a rounding error: on
// `9646be9b20` (round-3 item 6 / round-4 item 3) the 78%-of-frame region **is** withheld — family 1
// disappears and the chosen coverage falls 3 → 2 — and the accent stays `#7f7ca7` anyway, because the
// region is still an accent candidate and chroma-first still ranks its .0648 above `#000000`'s zero.
// Round 4's identity ask therefore stays open, and closing it would take a *pool* gate, which is a
// different and much larger ruling than the one that was made (`tests/assignment.test.ts`).

/**
 * **The fraction of its own pixels a mark's published colour must account for** before that colour
 * may contribute an identity family.
 *
 * `[INHERITED]` — `NO_FIELD_EXPLAINED_FRACTION`, re-exported under the name of its third application
 * so that a reader of `identityFamiliesV2` sees which question is being asked. See the block above
 * for the principle, the two prior applications, and the rule for how it may move.
 */
export const MARK_IDENTITY_COHERENCE_FRACTION = NO_FIELD_EXPLAINED_FRACTION

/**
 * **The radius, in `sameColorBar` multiples, at which a piece of material's self-coherence is
 * measured** — the gate's own constant, with its own bracket.
 *
 * `[UNCALIBRATED]` — chosen *inside* a measured separating window rather than fitted to a cover, so
 * it carries the window rather than a point estimate.
 *
 * ## Provenance: the three-anchor bracket (W-V9c, `measurements/v9c-radius-sweep.json`, 18 rungs over
 * every entry that contributes a published family on all 31 covers)
 *
 * The gate has three named anchors — one that **must pass** because it is the colour the whole mark
 * mechanism exists to reach, and two that **must fail** because they are the blend medians the gate
 * exists to withhold. Their curves, against the 0.5 fraction:
 *
 * | multiple | 1 | 4 | **5** | 6 | **8** | **10** | 11 | 12 |
 * |---|---|---|---|---|---|---|---|---|
 * | `45baf46c90` `#8d2639`, the NARCOSIS crimson — **must pass** | .059 | .452 | **.532** | .603 | **.712** | .787 | .827 | .861 |
 * | `a8942d6547` `#39367d`, 80% of frame — **must fail** | .001 | .014 | .024 | .049 | **.274** | .473 | .534 | .583 |
 * | `9646be9b20` `#7f7ca7`, 78% of frame — **must fail** | .001 | .039 | .067 | .109 | **.250** | .427 | .508 | .565 |
 *
 * The crimson clears 0.5 at **5×**; the two blend medians do not reach it until **11×**. The clean
 * window is therefore `[5, 10]` — six rungs wide, all three verdicts correct at every rung — and
 * **8 sits in its interior**, with the crimson .712 (must-pass, and clear by .21) against .274 and
 * .250 (must-fail, and clear by .23 and .25). It is the widest-margin rung of the window, which is
 * the whole reason it was taken; the window's lower end is not (at 5× the crimson holds by only .03,
 * and two further covers move, one of them a round-3 *foreground*).
 *
 * At 1× — the family-merge radius the ruling first named — the gate withholds 64 of the 102 entries
 * that contribute a family, and the crimson is one of them. At 8× it withholds 16 of 102. A rule
 * that silences two thirds of the identity evidence is a different family definition, not a
 * coherence gate; that is the second, independent reason 1× was wrong.
 *
 * ## 8 here and 8 in `ACCENT_FG_EXCLUSION_MULTIPLE` are a numeric coincidence, not a reuse
 *
 * `ACCENT_FG_EXCLUSION_MULTIPLE` is also 8, and the resemblance is worth stating precisely so nobody
 * later "unifies" them: that constant answers *when are an accent and a foreground too close for a
 * viewer to tell apart* (decision 14, three reviewer-named pairs near black); this one answers *how
 * far from its own colour may a mark's pixels sit and still be said to be that colour*. Different
 * question, different evidence, different anchors. **They are two constants that happen to hold the
 * same number, and either may move without the other.** Nothing here imports or derives from it.
 *
 * ## How this may move
 *
 * Precedent 2's rule (`COMPONENT_CORE_FRACTION` decoupling from `NO_FIELD_EXPLAINED_FRACTION`): with
 * a cover that measures it, under its own name, and with the three anchors re-swept — the bracket is
 * the artefact to update, not the point value alone.
 */
export const COHERENCE_GATE_BAR_MULTIPLE = 8

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

/** A pixel box, inclusive on both ends. Used to crop the ink measurement; see `inkOnSupport`. */
export type PixelBox = Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>

/**
 * One piece of material: a field-like component taken whole, or a connected group of what no
 * component explains.
 *
 * `mass` is the quantity the brief calls spatially-accumulated, and it is in the same units on both
 * kinds — pixel weight, the complementary halves of one fit, exactly as `overlay.ts`'s
 * `componentPoolEntry` already publishes a component's `Σ w` beside a cluster's `Σ(1 − w)`. `pixels`
 * is published beside it because the identity set's existing mass is a *pixel count*, and the two
 * rankings are not guaranteed to agree; V9a measures both rather than choosing.
 */
export type MarkRegion = Readonly<{
	/** `"region"` — a field-like component. `"mark"` — a connected group of the fit's rejections. */
	kind: "region" | "mark"
	/** Component depth for a region; raster-scan label order (1-based) for a mark. Provenance only. */
	index: number
	/** 1 on the material's own pixels. Row-major, full resolution. A region's is its claim. */
	support: Uint8Array
	/** |support|. */
	pixels: number
	/** Bounding box of the support, inclusive. */
	box: PixelBox
	/** Σ w over a region's claim; Σ(1 − w) over a mark's support. No floor, no triple, every pixel. */
	mass: number
	/** `mass / totalPixels`. */
	massFraction: number
	/** The robust colour before it was made exact: the per-channel weighted median over the support. */
	centre: OkLab
	/** The robust colour as an exact artwork triple, packed — what this material would publish as. */
	representative: number
	/** `representative` in OKLab. Chroma, the deltas and the identity families are measured on this. */
	lab: OkLab
	/** `hypot(a, b)` of `lab` — OKLab chroma, the one quantity m1 found separates the two NARCOSIS
	 * candidates (crimson .0949 against sky .0424). */
	chroma: number
	/** Distinct exact triples inside the support. */
	memberCount: number
	/**
	 * **The self-coherence fraction**: what share of this material's own pixels are the same colour as
	 * the colour it publishes — `|{px : sameColorLab(px, lab, COHERENCE_GATE_BAR_MULTIPLE)}| / pixels`,
	 * at the gate's own radius.
	 *
	 * 1 on a mark that is one flat colour; low on a mark that is a whole illustration, whose median is
	 * a colour none of its pixels is. See the gate block above for the radius and its bracket.
	 */
	selfCoherence: number
	/**
	 * The same fraction measured against the **pre-snap** median (`centre`) instead of the published
	 * triple (`lab`). Reported, never read: it exists so the choice of which colour's standing is being
	 * tested can be argued against a number.
	 */
	selfCoherenceMedian: number
	/**
	 * `selfCoherence >= MARK_IDENTITY_COHERENCE_FRACTION` — whether this material may contribute an
	 * identity family. **Read by `identityFamiliesV2` on every published palette** (v0.9.2).
	 *
	 * Never a pool gate: `readMarks` reports the verdict and never drops an entry for it, and
	 * `overlay.ts` offers every mark to the accent pool with its spatial mass regardless.
	 */
	identityCoherent: boolean
	/** Mass-weighted mean normalized position of the support. */
	meanX: number
	meanY: number
	/** The field at the material's own position — arm-f's *local* field, never the global one. */
	localField: OkLab
	/** Displacement from `localField`, decomposed (contract `decompose`, so ΔL² + ΔC² + ΔH² = Δ²). */
	deltaL: number
	deltaC: number
	deltaH: number
	/**
	 * wp12's shape instrument on **this support**, which for a mark is a real connected support for
	 * the first time. `null` only for a region synthesized from the global fit, which has no pool to
	 * be measured against.
	 */
	ink: InkStatistics | null
	/**
	 * `componentIsInkLike(ink)` — SPEC decision 15a's verdict, unchanged: the same conjunction and
	 * the same two constants.
	 *
	 * **Measured to be inert on a mark, and this field is kept so the report can show it.** 15a's
	 * conjunct is *thin AND floating* — `groundAdjacency < 0.10` — because a component candidate is
	 * competing to *be* a ground and grounds tile (`components.ts`, decision 15a's polarity table).
	 * A mark is the complement of the field by construction, so every one of its outward boundary
	 * pixels is field-claimed and its adjacency is **1.000**: the conjunct can never fire here, and
	 * V9a measures it at 1.000 on every mark of all six probed covers.
	 */
	inkLike: boolean
	/**
	 * The same instrument read at the **mark** site: `erosionMortality ≥ COMPONENT_INK_MORTALITY`.
	 *
	 * **No new constant and no new rule** — it is 15a's conjunction with the conjunct that is
	 * constant-by-construction dropped, which is arm-e-r3's original polarity (*"an ink sits on the
	 * arm's single fitted ground"*, wp12 §3), recovered at the one site where the ink really does sit
	 * on a ground. **Proposed, not adopted**: nothing reads this field, `reports/wv9a.md` carries the
	 * seven-mark table it is bracketed by, and the orchestrator rules.
	 */
	inkShaped: boolean
}>

/** What the sweep did, published whole: the criterion is only arguable against its own curve. */
export type MarkScaleChoice = Readonly<{
	/** The chosen grouping radius, in pixels. */
	radius: number
	/** The ladder actually swept, ascending, deduped, truncated at the first `N ≤ 1`. */
	scales: readonly number[]
	/** `N(r)` at each rung — the count of connected groups of unexplained material. */
	counts: readonly number[]
	/**
	 * Centred `|Δln N / Δln(1 + r)|` at each rung; `null` at the two endpoints, which a centred
	 * derivative cannot reach. **Measured and published, and it decides nothing** since v0.9.0 —
	 * see `MARK_SCALE_DEFAULT_DIAGONAL_FRACTION` for the two curves that retired it.
	 */
	flatness: readonly (number | null)[]
	/** Index into `scales` of the chosen rung. */
	chosenIndex: number
	/**
	 * Which reading chose it: the plateau, v0.9.0's stated default (no count repeated), or a curve
	 * with nothing on it at all (no unexplained material).
	 */
	criterion: "plateau" | "default" | "degenerate"
	/**
	 * The rung the retired slope reading would have taken, for the report — `null` when the curve is
	 * too short for a centred derivative. Reported, never read.
	 */
	slopeIndex: number | null
	/** Length of the chosen plateau in rungs; 1 when no count repeated. */
	plateauLength: number
	/** The image diagonal the ladder was built from, in pixels. */
	diagonal: number
}>

export type MarkReading = Readonly<{
	/** Regions and marks together, descending by `mass`, ties on the packed representative. */
	marks: readonly MarkRegion[]
	scale: MarkScaleChoice
	totalPixels: number
	/** Pixels no accepted component claims — the material the grouping ran on. */
	unexplainedPixels: number
	/** Σ mass over every entry, over `totalPixels`. The v2 answer to `IdentitySet.massRetained`. */
	massRetained: number
}>

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/**
 * Read the image's mark/region set.
 *
 * `fit` is the field the caller measures against — `candidate.ts`'s `overlayFit`, i.e. the composite
 * of the component pool when there is one and the global fit when there is not. `reading` is the
 * pool itself, or `null` on a cover the global fit explained. The two arguments are separate because
 * a `FieldFit` cannot say *which* component claims a pixel and the regions are exactly that.
 */
export function readMarks(
	raster: DecodedRaster,
	fit: FieldFit,
	reading: FieldReading | null,
	/**
	 * Force the grouping radius instead of choosing one. **Measurement only** — it exists so that
	 * `measurements/v9b-scale.ts` can re-derive `MARK_SCALE_DEFAULT_DIAGONAL_FRACTION`'s bracket from
	 * the covers themselves rather than from a remembered number. `candidate.ts` never passes it, and
	 * `MarkScaleChoice` still reports the criterion the sweep *would* have used, so a forced reading
	 * is never mistaken for a chosen one.
	 */
	forcedRadius: number | null = null,
): MarkReading {
	const { width, height } = raster
	const pixelCount = width * height
	if (fit.weights.length < pixelCount) {
		throw new Error(
			`marks: raster ${width}×${height} needs ${pixelCount} weights, got ${fit.weights.length}`,
		)
	}

	const components = reading === null ? [] : reading.components
	// The retreat (`FieldReading.retreat`) has an empty pool, and on that path the kept fit *is* the
	// field — so the claim is the fit's own inlier set on both of the two routes to no components.
	const pooled = reading !== null && components.length > 0

	const claimed = new Uint8Array(pixelCount)
	if (pooled) {
		const labels = reading.labels
		for (let index = 0; index < pixelCount; index += 1) {
			if (labels[index] !== 0) claimed[index] = 1
		}
	} else {
		for (let index = 0; index < pixelCount; index += 1) {
			if (weightAt(fit, index) > FIELD_INLIER_WEIGHT) claimed[index] = 1
		}
	}

	const unexplained = new Uint8Array(pixelCount)
	let unexplainedPixels = 0
	for (let index = 0; index < pixelCount; index += 1) {
		if (claimed[index] === 0) {
			unexplained[index] = 1
			unexplainedPixels += 1
		}
	}

	const chosen = chooseGroupingScale(unexplained, width, height)
	const scale = forcedRadius === null ? chosen : { ...chosen, radius: forcedRadius }
	const groups = groupAtScale(unexplained, width, height, scale.radius)

	const entries: MarkRegion[] = []

	// --- regions -------------------------------------------------------------------------------
	if (pooled) {
		for (const component of components) {
			entries.push(regionEntry(component, raster, fit))
		}
	} else {
		entries.push(globalRegionEntry(claimed, raster, fit))
	}

	// --- marks ---------------------------------------------------------------------------------
	for (let group = 0; group < groups.length; group += 1) {
		entries.push(markEntry(groups[group]!, group + 1, raster, fit, claimed))
	}

	entries.sort((first, second) =>
		second.mass - first.mass || first.representative - second.representative
	)

	let totalMass = 0
	for (const entry of entries) totalMass += entry.mass

	return {
		marks: entries,
		scale,
		totalPixels: pixelCount,
		unexplainedPixels,
		massRetained: pixelCount > 0 ? totalMass / pixelCount : 0,
	}
}

// ---------------------------------------------------------------------------------------------
// Identity families v2 — decision 18's family definition over material instead of over triples
// ---------------------------------------------------------------------------------------------

/**
 * The artwork's identity set, read off the mark/region set.
 *
 * **A pure function of the mark/region set and nothing else** — it does not touch the inventory, the
 * fit or any role, exactly as `readIdentitySet` does not, so it keeps that function's two wanted
 * consequences (computed once, the same set for every assignment being scored).
 *
 * The *grouping* is decision 6's agglomeration, imported unchanged and run at
 * `IDENTITY_FAMILY_BAR_MULTIPLE`, so v2 families partition colour space by the same rule v1 families
 * do and `familyCovers` / `coveredFamilies` read them without knowing which they were handed. The
 * only thing that changes is **what is offered to it**: one point per piece of material carrying its
 * spatial mass, instead of one point per exact triple carrying its pixel count above a floor.
 *
 * That is the whole mechanism, and it is why the NARCOSIS crimson can appear at all: as a triple it
 * is ten thousand sub-floor points, as material it is one point of mass 23 633.
 *
 * ## v0.9.2 and the self-coherence gate: applied
 *
 * The one line below that reads `identityCoherent` is live on every published palette. Material whose
 * own colour explains less than `MARK_IDENTITY_COHERENCE_FRACTION` of it at
 * `COHERENCE_GATE_BAR_MULTIPLE` bars contributes **neither a point nor retained mass** — the blend
 * median of a whole illustration no longer gets to say what the artwork's identity is. Three of the
 * 31 dev covers move against v0.9.0, all on the accent, and one of them (`a8942d6547`) is a round-3
 * silent STRONG whose reviewer-blessed `#009cff` is restored byte-identically. The radius, its
 * bracket and the two must-fail / one must-pass anchors: `COHERENCE_GATE_BAR_MULTIPLE`.
 */
export function identityFamiliesV2(
	marks: readonly MarkRegion[],
	totalPixels: number,
	count: number = IDENTITY_FAMILY_COUNT,
): IdentitySet {
	const points: MassPoint[] = []
	let retained = 0
	for (const entry of marks) {
		if (!(entry.mass > 0)) continue
		// The gate; see the block above. An incoherent entry contributes neither a point nor retained
		// mass — `massRetained` has to fall with the evidence, or it would report a coverage the set no
		// longer claims.
		if (!entry.identityCoherent) continue
		retained += entry.mass
		points.push({
			packed: entry.representative,
			lab: entry.lab,
			mass: entry.mass,
			sumX: entry.mass * entry.meanX,
			sumY: entry.mass * entry.meanY,
		})
	}

	const clusters = agglomerateBarNeighbourhoods(points, IDENTITY_FAMILY_BAR_MULTIPLE)
		.sort((first, second) =>
			second.mass - first.mass || first.representative - second.representative
		)

	const families: IdentityFamily[] = clusters.slice(0, count).map((cluster, index) => ({
		rank: index + 1,
		representative: cluster.representative,
		centre: cluster.centre,
		mass: cluster.mass,
		massFraction: totalPixels > 0 ? cluster.mass / totalPixels : 0,
		memberCount: cluster.memberCount,
	}))

	return {
		families,
		totalFamilies: clusters.length,
		massRetained: totalPixels > 0 ? retained / totalPixels : 0,
	}
}

// ---------------------------------------------------------------------------------------------
// Identity families, unioned — v0.9.0's decision-18 family definition
// ---------------------------------------------------------------------------------------------

/**
 * **The identity set decision 18 reads: v1 ∪ v2.** The whole of V9a's ruling 3, implemented.
 *
 * V9a measured the two readings against each other on four covers and the answer was neither
 * "replace" nor "keep" (`reports/wv9a.md` §b): v2 reaches a colour v1 cannot see *at all* — the
 * NARCOSIS crimson, which is ten thousand sub-floor triples to v1 and one 41 000-pixel mark to v2 —
 * and v1 keeps colours v2 medians away, because a region is *one* colour and a ramped or illustrated
 * field is many (`9646be9b20`'s published cream survives only in v1). Two readings that each see what
 * the other cannot are a union, and taking either alone was measured to cost a real colour.
 *
 * ## What is unioned, and how
 *
 *  - **The whole ranking on both sides, not the top four.** Slicing to `F` first and unioning after
 *    would let a family that is rank 5 on both sides but the artwork's second colour overall fall out
 *    of a set it belongs in. Both sides are read at full depth, the union is ranked once, and the
 *    slice happens last — so the published set is the top `F` of the union rather than a merge of two
 *    top-`F`s.
 *  - **Same-bar centres merge**, by the identical test `familyCovers` applies
 *    (`sameColorLab(…, IDENTITY_FAMILY_BAR_MULTIPLE)`). Both sides were built by
 *    `agglomerateBarNeighbourhoods` at that radius, so a cross-side pair inside one bar is a pair the
 *    agglomeration would itself have merged had the two point sets been offered together.
 *  - **The mass-combination rule is `max`, and there are no weights.** A family present on both sides
 *    is *one* piece of the artwork measured twice — v1 counts its pixels through the triple floor, v2
 *    accumulates its pixel weight spatially — so adding the two would count the same material twice
 *    and publish a mass larger than the image. `max` takes the reading that saw more of it, which is
 *    the only combination of two measurements of one quantity that needs no coefficient to justify.
 *    A weighted blend would need a calibration this cycle has no evidence for, and V9a's own type
 *    note (`reports/wv9a-types.md` §2) is that the two masses are not even in the same units — pixel
 *    count against pixel weight — which is a second reason not to add them.
 *  - **Every other field of a merged family comes from the dominant side** — the heavier of the two,
 *    which because the walk is in descending mass order is simply the one that got there first. The
 *    representative, the centre and the member count are therefore always a real reading's, never a
 *    synthesized average of two.
 *
 * `massRetained` follows the same `max` rule over the same argument: the two are two measurements of
 * how much of the image its identity set accounts for, and the union retains the better-covered one.
 *
 * Determinism: the walk is over both rankings concatenated and sorted by mass descending then packed
 * integer ascending, so the merge order — and therefore every merged family's dominant side — is
 * fixed by the data rather than by which list was passed first.
 */
export function identityFamiliesUnion(
	v1: IdentitySet,
	v2: IdentitySet,
	totalPixels: number,
	count: number = IDENTITY_FAMILY_COUNT,
): IdentitySet {
	const all = [...v1.families, ...v2.families].sort((first, second) =>
		second.mass - first.mass || first.representative - second.representative
	)

	const merged: { family: IdentityFamily; mass: number }[] = []
	for (const family of all) {
		// Same-bar centres merge. The first match wins and the walk is heaviest-first, so the group's
		// every published field is its heaviest member's and the mass is `max` by construction.
		const host = merged.find((entry) => sameColorLab(entry.family.centre, family.centre, IDENTITY_FAMILY_BAR_MULTIPLE))
		if (host === undefined) {
			merged.push({ family, mass: family.mass })
			continue
		}
		if (family.mass > host.mass) host.mass = family.mass
	}

	const families: IdentityFamily[] = merged
		.sort((first, second) =>
			second.mass - first.mass || first.family.representative - second.family.representative
		)
		.slice(0, count)
		.map((entry, index) => ({
			rank: index + 1,
			representative: entry.family.representative,
			centre: entry.family.centre,
			mass: entry.mass,
			massFraction: totalPixels > 0 ? entry.mass / totalPixels : 0,
			memberCount: entry.family.memberCount,
		}))

	return {
		families,
		totalFamilies: merged.length,
		massRetained: Math.max(v1.massRetained, v2.massRetained),
	}
}

// ---------------------------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------------------------

/** The ladder of grouping radii for a raster: `r = 0`, then geometric between the two fractions. */
export function scaleLadder(width: number, height: number): number[] {
	const diagonal = Math.hypot(width, height)
	const finest = Math.max(1, Math.round(MARK_SCALE_SWEEP_MIN_DIAGONAL_FRACTION * diagonal))
	const coarsest = Math.max(finest, Math.round(MARK_SCALE_SWEEP_MAX_DIAGONAL_FRACTION * diagonal))
	const ladder: number[] = [0]
	let radius = finest
	// Rounded rungs can repeat at the fine end (√2 × 1 rounds to 1); step to the next integer so the
	// ladder is strictly increasing and the sweep always terminates.
	for (let step = 0; radius <= coarsest; step += 1) {
		if (ladder[ladder.length - 1]! < radius) ladder.push(radius)
		const next = Math.round(finest * Math.pow(MARK_SCALE_SWEEP_RATIO, step + 1))
		radius = next > radius ? next : radius + 1
	}
	return ladder
}

/**
 * Sweep the ladder and take the flattest rung — arm-f §2.3's criterion, implemented literally.
 *
 * One chessboard distance transform serves the whole sweep: the dilation of a mask by radius `r` is
 * exactly `{distance to the mask ≤ r}`, so the sweep costs one transform plus one labelling per rung
 * rather than one of each. (`closeSupport` builds its dilation from the same identity.)
 */
export function chooseGroupingScale(
	unexplained: Uint8Array,
	width: number,
	height: number,
): MarkScaleChoice {
	const diagonal = Math.hypot(width, height)
	const ladder = scaleLadder(width, height)
	const pixelCount = width * height

	let any = false
	for (let index = 0; index < pixelCount; index += 1) {
		if (unexplained[index] === 1) { any = true; break }
	}
	if (!any) {
		return {
			radius: ladder[0]!,
			scales: [ladder[0]!],
			counts: [0],
			flatness: [null],
			chosenIndex: 0,
			criterion: "degenerate",
			plateauLength: 1,
			slopeIndex: null,
			diagonal,
		}
	}

	const outward = distanceToMask(unexplained, width, height)
	const dilated = new Uint8Array(pixelCount)
	const labels = new Int32Array(pixelCount)
	const stack = new Int32Array(pixelCount)

	const scales: number[] = []
	const counts: number[] = []
	for (const radius of ladder) {
		for (let index = 0; index < pixelCount; index += 1) {
			dilated[index] = unexplained[index] === 1 || outward[index] <= radius ? 1 : 0
		}
		const count = labelComponents(dilated, width, height, labels, stack)
		scales.push(radius)
		counts.push(count)
		// Nothing left to merge: the curve carries no information past here.
		if (count <= 1) break
	}

	// --- the plateau: the longest run of rungs carrying the same count -------------------------
	let plateauStart = 0
	let plateauLength = 1
	let bestStart = 0
	let bestLength = 1
	for (let rung = 1; rung < scales.length; rung += 1) {
		if (counts[rung] === counts[rung - 1]) {
			plateauLength += 1
		} else {
			plateauStart = rung
			plateauLength = 1
		}
		// Strictly longer only: ties keep the finer plateau, which is the earlier one.
		if (plateauLength > bestLength) {
			bestLength = plateauLength
			bestStart = plateauStart
		}
	}

	// --- the retired relaxation, still measured so the report can compare the two ---------------
	const flatness: (number | null)[] = scales.map(() => null)
	let slopeIndex: number | null = null
	let best = Number.POSITIVE_INFINITY
	for (let rung = 1; rung < scales.length - 1; rung += 1) {
		const spanScale = Math.log(1 + scales[rung + 1]!) - Math.log(1 + scales[rung - 1]!)
		if (!(spanScale > 0)) continue
		const spanCount = Math.log(counts[rung - 1]!) - Math.log(counts[rung + 1]!)
		const slope = Math.abs(spanCount / spanScale)
		flatness[rung] = slope
		// Strictly better only: ties keep the finer scale, which is the earlier rung.
		if (slope < best) {
			best = slope
			slopeIndex = rung
		}
	}

	if (bestLength > 1) {
		return {
			radius: scales[bestStart]!,
			scales,
			counts,
			flatness,
			chosenIndex: bestStart,
			criterion: "plateau",
			plateauLength: bestLength,
			slopeIndex,
			diagonal,
		}
	}

	// No count repeated: there is no plateau, so arm-f's criterion has nothing to read and v0.9.0's
	// stated default is taken. It is snapped to the nearest rung of the swept ladder rather than used
	// raw, so that `counts[chosenIndex]` is the count actually measured at the radius actually used —
	// a chosen scale the published curve does not cover would make the curve undiagnosable. Distance
	// is measured in the ladder's own units (log scale, `1 + r` so `r = 0` has a logarithm); ties go
	// to the finer rung, as everywhere else here.
	//
	// **The snap ranges over the ladder's interior, and that is the retired criterion's own domain
	// preserved rather than a second rule.** A centred derivative cannot reach either endpoint, and
	// the comment at the top of this file states the consequence it bought: *"it happens to exclude
	// the two degenerate readings (every speck its own mark; everything merged into one)"*. A default
	// snapped over the whole ladder does not inherit that, and V9b measured the cost on a real cover
	// — `a8942d6547`, round-3 item 7, **graded STRONG in silence**, whose curve is
	// `N(0)=451, N(2)=5, N(3)=4, N(4)=2, N(6)=1`: the target rung was the terminal `N = 1`, so the
	// whole illustration became one mark holding 80% of the image, one median colour, and the
	// identity set it dominated moved that STRONG's accent. Replacing a criterion's *reading* is
	// v0.9.0's ruling; silently widening its *domain* to include the readings it was defined to
	// exclude is not, so the domain is restored here explicitly.
	const target = MARK_SCALE_DEFAULT_DIAGONAL_FRACTION * diagonal
	let defaultIndex = -1
	let bestGap = Number.POSITIVE_INFINITY
	for (let rung = 1; rung < scales.length - 1; rung += 1) {
		const gap = Math.abs(Math.log(1 + scales[rung]!) - Math.log(1 + target))
		if (gap < bestGap) {
			bestGap = gap
			defaultIndex = rung
		}
	}
	// Fewer than three rungs is a ladder with no interior: neither reading exists, and the finest
	// scale — plain 8-connectivity — is what was measured.
	if (defaultIndex < 0) defaultIndex = 0
	return {
		radius: scales[defaultIndex]!,
		scales,
		counts,
		flatness,
		chosenIndex: defaultIndex,
		// A ladder with no interior is not a curve and cannot carry either reading; the finest scale —
		// plain 8-connectivity — is what was measured, and `criterion` says so rather than leaving it
		// to be inferred from a `plateauLength` of 1.
		criterion: scales.length >= 3 ? "default" : "degenerate",
		plateauLength: 1,
		slopeIndex,
		diagonal,
	}
}

/**
 * Chessboard distance from every pixel to the nearest mask pixel; 0 on the mask.
 *
 * The dilation half of `closeSupport`, reusing its transform on the mask's complement rather than
 * repeating the two-pass scan here — the border convention (outside the image is *not* mask) is
 * therefore the same one the closing already uses.
 */
function distanceToMask(mask: Uint8Array, width: number, height: number): Int32Array {
	const complement = new Uint8Array(mask.length)
	for (let index = 0; index < mask.length; index += 1) complement[index] = mask[index] === 1 ? 0 : 1
	return chessboardDistanceToComplement(complement, width, height)
}

/**
 * Label the 8-connected components of a mask in place, returning the count.
 *
 * 8-connectivity because the metric everything else here uses is the chessboard (L∞) one — the same
 * metric `inkStatistics` erodes in — so a diagonal stroke is one mark rather than a dotted line.
 * Seeds are taken in raster-scan order, which makes the labelling canonical.
 */
function labelComponents(
	mask: Uint8Array,
	width: number,
	height: number,
	labels: Int32Array,
	stack: Int32Array,
): number {
	labels.fill(0)
	let next = 0
	for (let seed = 0; seed < mask.length; seed += 1) {
		if (mask[seed] !== 1 || labels[seed] !== 0) continue
		next += 1
		let top = 0
		stack[top] = seed
		top += 1
		labels[seed] = next
		while (top > 0) {
			top -= 1
			const index = stack[top]!
			const row = (index / width) | 0
			const column = index - row * width
			for (let dy = -1; dy <= 1; dy += 1) {
				const ny = row + dy
				if (ny < 0 || ny >= height) continue
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue
					const nx = column + dx
					if (nx < 0 || nx >= width) continue
					const neighbour = ny * width + nx
					if (mask[neighbour] !== 1 || labels[neighbour] !== 0) continue
					labels[neighbour] = next
					stack[top] = neighbour
					top += 1
				}
			}
		}
	}
	return next
}

/** One group of unexplained material: its own pixels (never the dilation's), and its box. */
type MarkGroup = { support: Uint8Array; pixels: number; box: { minX: number; minY: number; maxX: number; maxY: number } }

/**
 * Group the unexplained material at one scale.
 *
 * A group's support is the **undilated** material inside a connected component of the dilation: the
 * scale decides what belongs together, it does not decide what the material is. Groups come back in
 * raster-scan label order.
 */
export function groupAtScale(
	unexplained: Uint8Array,
	width: number,
	height: number,
	radius: number,
): MarkGroup[] {
	const pixelCount = width * height
	const outward = distanceToMask(unexplained, width, height)
	const dilated = new Uint8Array(pixelCount)
	for (let index = 0; index < pixelCount; index += 1) {
		dilated[index] = unexplained[index] === 1 || outward[index] <= radius ? 1 : 0
	}
	const labels = new Int32Array(pixelCount)
	const count = labelComponents(dilated, width, height, labels, new Int32Array(pixelCount))
	if (count === 0) return []

	const groups: MarkGroup[] = []
	for (let group = 0; group < count; group += 1) {
		groups.push({
			support: new Uint8Array(pixelCount),
			pixels: 0,
			box: { minX: width, minY: height, maxX: -1, maxY: -1 },
		})
	}
	for (let row = 0; row < height; row += 1) {
		const rowOffset = row * width
		for (let column = 0; column < width; column += 1) {
			const index = rowOffset + column
			if (unexplained[index] !== 1) continue
			const group = groups[labels[index]! - 1]!
			group.support[index] = 1
			group.pixels += 1
			if (column < group.box.minX) group.box.minX = column
			if (column > group.box.maxX) group.box.maxX = column
			if (row < group.box.minY) group.box.minY = row
			if (row > group.box.maxY) group.box.maxY = row
		}
	}
	// A dilated component always contains at least one mask pixel (it is a dilation of the mask), so
	// no group can be empty; the filter is a statement of that, not a rescue.
	return groups.filter((group) => group.pixels > 0)
}

// ---------------------------------------------------------------------------------------------
// Per-entry measurement
// ---------------------------------------------------------------------------------------------

function weightAt(fit: FieldFit, index: number): number {
	const raw = fit.weights[index]!
	// A non-finite weight reads as a full inlier rather than poisoning every sum downstream — the
	// same rule, for the same reason, as `overlay.ts`'s `accumulateOverlayMass`.
	return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1
}

function regionEntry(
	component: FieldComponent,
	raster: DecodedRaster,
	fit: FieldFit,
): MarkRegion {
	const { width, height } = raster
	const support = component.claim
	let pixels = 0
	const box = { minX: width, minY: height, maxX: -1, maxY: -1 }
	for (let row = 0; row < height; row += 1) {
		const rowOffset = row * width
		for (let column = 0; column < width; column += 1) {
			if (support[rowOffset + column] !== 1) continue
			pixels += 1
			if (column < box.minX) box.minX = column
			if (column > box.maxX) box.maxX = column
			if (row < box.minY) box.minY = row
			if (row > box.maxY) box.maxY = row
		}
	}

	// `supportMass` is Σ w over the claim, already accumulated by the fit that produced it. The ink
	// statistics likewise: `fitFieldComponents` measured them against the rest of the pool, which is
	// the same ground this instrument would use, so recomputing could only disagree.
	return measured({
		kind: "region",
		index: component.depth,
		support,
		pixels,
		box,
		mass: component.supportMass,
		meanX: component.meanX,
		meanY: component.meanY,
		ink: component.ink,
		inkLike: component.inkLike,
		inkShaped: component.ink !== null && component.ink.erosionMortality >= COMPONENT_INK_MORTALITY,
	}, raster, fit)
}

/** The one-region reading for a cover with no component pool: the fit's own inlier set. */
function globalRegionEntry(claimed: Uint8Array, raster: DecodedRaster, fit: FieldFit): MarkRegion {
	const { width, height } = raster
	let mass = 0
	let sumX = 0
	let sumY = 0
	let pixels = 0
	const box = { minX: width, minY: height, maxX: -1, maxY: -1 }
	for (let row = 0; row < height; row += 1) {
		const y = normalizedY(row, height)
		const rowOffset = row * width
		for (let column = 0; column < width; column += 1) {
			const index = rowOffset + column
			if (claimed[index] !== 1) continue
			const weight = weightAt(fit, index)
			mass += weight
			sumX += weight * normalizedX(column, width)
			sumY += weight * y
			pixels += 1
			if (column < box.minX) box.minX = column
			if (column > box.maxX) box.maxX = column
			if (row < box.minY) box.minY = row
			if (row > box.maxY) box.maxY = row
		}
	}
	return measured({
		kind: "region",
		index: 0,
		support: claimed,
		pixels,
		box,
		mass,
		meanX: mass > 0 ? sumX / mass : 0,
		meanY: mass > 0 ? sumY / mass : 0,
		// No pool exists, so there is no ground for the adjacency half to be measured against and the
		// verdict is *unmeasured*, not false. `null` says so; `false` is the conservative read.
		ink: null,
		inkLike: false,
		inkShaped: false,
	}, raster, fit)
}

function markEntry(
	group: MarkGroup,
	index: number,
	raster: DecodedRaster,
	fit: FieldFit,
	claimed: Uint8Array,
): MarkRegion {
	const { width, height } = raster
	let mass = 0
	let sumX = 0
	let sumY = 0
	for (let row = group.box.minY; row <= group.box.maxY; row += 1) {
		const y = normalizedY(row, height)
		const rowOffset = row * width
		for (let column = group.box.minX; column <= group.box.maxX; column += 1) {
			const pixel = rowOffset + column
			if (group.support[pixel] !== 1) continue
			// Every pixel counts, at the weight the fit rejected it with. No triple, no floor.
			const overlay = 1 - weightAt(fit, pixel)
			mass += overlay
			sumX += overlay * normalizedX(column, width)
			sumY += overlay * y
		}
	}
	const ink = inkOnSupport(group.support, claimed, width, height, group.box)
	return measured({
		kind: "mark",
		index,
		support: group.support,
		pixels: group.pixels,
		box: group.box,
		mass,
		meanX: mass > 0 ? sumX / mass : 0,
		meanY: mass > 0 ? sumY / mass : 0,
		ink,
		inkLike: componentIsInkLike(ink),
		inkShaped: ink.erosionMortality >= COMPONENT_INK_MORTALITY,
	}, raster, fit)
}

/** The colour half of an entry: robust colour, its exact triple, chroma, local field, deltas. */
function measured(
	base: {
		kind: "region" | "mark"
		index: number
		support: Uint8Array
		pixels: number
		box: { minX: number; minY: number; maxX: number; maxY: number }
		mass: number
		meanX: number
		meanY: number
		ink: InkStatistics | null
		inkLike: boolean
		inkShaped: boolean
	},
	raster: DecodedRaster,
	fit: FieldFit,
): MarkRegion {
	const inventory = supportInventory(base.support, base.box, raster)
	const centre = robustColour(inventory)
	// Decision 4's snap, over the material's **own** support: the published colour is the exact
	// artwork triple that carries the most same-colour mass inside this piece of material, which is
	// the same rule `overlay.ts` applies to a component and the reason invariant 2 needs no help.
	let packed = 0
	let lab: OkLab = centre
	if (inventory.totalPixels > 0) {
		const snapped = snapToArtwork(centre, reachable(inventory, centre), POOLED_SAME_COLOR_BAR)
		packed = (snapped.rgb[0] << 16) | (snapped.rgb[1] << 8) | snapped.rgb[2]
		lab = [snapped.lab[0], snapped.lab[1], snapped.lab[2]]
	}
	const localField = fit.fieldAt(base.meanX, base.meanY)
	const delta = decompose(localField, lab)
	// The gate's quantity, measured here because this is where both the support's inventory and the colour
	// that will be published exist. Two passes over the support's *distinct triples* (not its pixels),
	// which is the same table the median and the snap already walked.
	const selfCoherence = coherentPixelFraction(inventory, lab)
	return {
		kind: base.kind,
		index: base.index,
		support: base.support,
		pixels: base.pixels,
		box: base.box,
		mass: base.mass,
		massFraction: raster.width * raster.height > 0
			? base.mass / (raster.width * raster.height)
			: 0,
		centre,
		representative: packed,
		lab,
		chroma: Math.hypot(lab[1], lab[2]),
		memberCount: inventory.triples.size,
		selfCoherence,
		selfCoherenceMedian: coherentPixelFraction(inventory, centre),
		identityCoherent: selfCoherence >= MARK_IDENTITY_COHERENCE_FRACTION,
		meanX: base.meanX,
		meanY: base.meanY,
		localField,
		deltaL: delta.deltaLightness,
		deltaC: delta.deltaChroma,
		deltaH: delta.deltaHue,
		ink: base.ink,
		inkLike: base.inkLike,
		inkShaped: base.inkShaped,
	}
}

/**
 * The support's exact triples, as an `Inventory` — for the snap, and for nothing else.
 *
 * Counts are re-accumulated over the support so that `count` means "pixels of this colour inside
 * this material", which is the mass decision 4's snap maximizes. The same object, for the same
 * reason, as `overlay.ts`'s private `supportInventory`; it is rebuilt here rather than exported from
 * there because `overlay.ts` is not this pass's file.
 */
function supportInventory(
	support: Uint8Array,
	box: { minX: number; minY: number; maxX: number; maxY: number },
	raster: DecodedRaster,
): Inventory {
	const { width, height, packed } = raster
	const counts = new Map<number, { count: number; sumX: number; sumY: number }>()
	let totalPixels = 0
	for (let row = Math.max(0, box.minY); row <= Math.min(height - 1, box.maxY); row += 1) {
		const y = normalizedY(row, height)
		const rowOffset = row * width
		for (let column = Math.max(0, box.minX); column <= Math.min(width - 1, box.maxX); column += 1) {
			const index = rowOffset + column
			if (support[index] !== 1) continue
			const key = packed[index]!
			let entry = counts.get(key)
			if (entry === undefined) {
				entry = { count: 0, sumX: 0, sumY: 0 }
				counts.set(key, entry)
			}
			entry.count += 1
			entry.sumX += normalizedX(column, width)
			entry.sumY += y
			totalPixels += 1
		}
	}

	const triples = new Map<number, TripleStats>()
	for (const [key, entry] of counts) {
		const rgb = unpackRgb(key)
		triples.set(key, {
			packed: key,
			rgb,
			lab: rgbToOkLab(rgb),
			count: entry.count,
			sumX: entry.sumX,
			sumY: entry.sumY,
		})
	}
	return { triples, has: (key: number) => triples.has(key), totalPixels }
}

/**
 * The sub-inventory `snapToArtwork(target, …, R)` can possibly read — an **exact** restriction, not a
 * sample, and the one cost fix V9a made after profiling rather than before it.
 *
 * The profile (`reports/wv9a.md`): `barNeighbourhoodMass` was **4 004 ms of a 9 155 ms** 3000² read,
 * because that function is quadratic in the triples of the inventory it is handed and a mark's
 * support can hold a hundred thousand of them. The snap only ever reads two things: the candidates
 * within `R` of the target, and, for each, the mass within `R` of *that candidate*. A triple more
 * than `2R` from the target is neither, so removing it cannot move the answer — the candidate set is
 * identical, every candidate's score is identical, and the tie-breaks are over the same integers.
 *
 * The fallback (empty ball ⇒ nearest triple in the whole table) is the one place a restriction
 * *could* be read, so the restriction is not applied when it comes back empty.
 */
function reachable(inventory: Inventory, target: OkLab): Inventory {
	const reach = 2 * POOLED_SAME_COLOR_BAR
	const triples = new Map<number, TripleStats>()
	let totalPixels = 0
	for (const [key, stats] of inventory.triples) {
		if (okLabDistance(target, stats.lab) > reach) continue
		triples.set(key, stats)
		totalPixels += stats.count
	}
	if (triples.size === 0) return inventory
	return { triples, has: (key: number) => triples.has(key), totalPixels }
}

/**
 * **The self-coherence fraction**: what share of the support's pixels are the same colour as `colour`,
 * at the gate's own radius.
 *
 * The predicate is `sameColorLab(…, COHERENCE_GATE_BAR_MULTIPLE)`, so the quantity reads as *"how much
 * of this material sits within one gate radius of the colour being offered for it"*. Summed over
 * distinct triples weighted by their counts, which is the same number as a walk over the pixels for a
 * fraction of the work; 0 on an empty support, which the gate reads as *not coherent* (a support with
 * no pixels speaks for nothing).
 */
function coherentPixelFraction(inventory: Inventory, colour: OkLab): number {
	if (inventory.totalPixels <= 0) return 0
	let within = 0
	for (const stats of inventory.triples.values()) {
		if (sameColorLab(stats.lab, colour, COHERENCE_GATE_BAR_MULTIPLE)) within += stats.count
	}
	return within / inventory.totalPixels
}

/**
 * The self-coherence fraction of a finished entry at an arbitrary merge multiple — **measurement
 * only**, and the reason it exists is that `COHERENCE_GATE_BAR_MULTIPLE` is a bracket rather than a
 * point.
 *
 * Nothing in the pipeline calls it: `MarkRegion.selfCoherence` is measured once, at the gate's own
 * radius, on the path above. This re-derives the same quantity at other radii so that the separating
 * window `[5, 10]` stays a swept curve (`measurements/v9c-radius-sweep.ts`) that a later pass can
 * re-run rather than a remembered claim. It rebuilds the support's inventory, so it costs one pass
 * over the entry's box per call and is not for the hot path.
 */
export function coherenceSpectrum(
	entry: MarkRegion,
	raster: DecodedRaster,
	multiples: readonly number[],
): number[] {
	const inventory = supportInventory(entry.support, entry.box, raster)
	if (inventory.totalPixels <= 0) return multiples.map(() => 0)
	const within = multiples.map(() => 0)
	for (const stats of inventory.triples.values()) {
		for (let slot = 0; slot < multiples.length; slot += 1) {
			if (sameColorLab(stats.lab, entry.lab, multiples[slot]!)) within[slot]! += stats.count
		}
	}
	return within.map((sum) => sum / inventory.totalPixels)
}

/**
 * The support's robust colour: the count-weighted **median** of each OKLab channel.
 *
 * A median rather than a mean because a mark is measured on JPEG material whose support carries
 * ringing and edge pixels at both extremes, and a mean of a stroke and its halo is a colour neither
 * of them is. It is computed over the distinct triples weighted by their counts rather than over the
 * pixels, which is the same number for a fraction of the work. Ties end at the packed integer.
 */
function robustColour(inventory: Inventory): OkLab {
	if (inventory.totalPixels === 0) return [0, 0, 0]
	const entries = [...inventory.triples.values()]
	const half = inventory.totalPixels / 2
	const channel = (axis: 0 | 1 | 2): number => {
		const sorted = [...entries].sort((first, second) =>
			first.lab[axis] - second.lab[axis] || first.packed - second.packed
		)
		let seen = 0
		for (const entry of sorted) {
			seen += entry.count
			if (seen >= half) return entry.lab[axis]
		}
		return sorted[sorted.length - 1]!.lab[axis]
	}
	return [channel(0), channel(1), channel(2)]
}

// ---------------------------------------------------------------------------------------------
// The ink instrument on a real support
// ---------------------------------------------------------------------------------------------

/**
 * wp12's `inkStatistics`, evaluated over the support's own neighbourhood instead of the whole frame.
 *
 * **Identical arithmetic, not an approximation of it** — `tests/marks.test.ts` asserts equality
 * against `inkStatistics` on the full frame, which is the only reason this exists. Both radii are
 * still taken from the **image's** short side (they are fractions of it; a crop must not shrink
 * them), and the crop is padded by more than the closing plus the erosion can reach, so:
 *
 *  - no pixel the closing's dilation touches lies on a synthetic crop edge, and no closed pixel is
 *    within `inkRadius + 1` of one, so both transforms see the same neighbours they would in frame;
 *  - a crop edge that coincides with the image edge keeps the border replication exactly, which is
 *    the case a full-bleed mark depends on.
 *
 * Cost, which is the point: the instrument is O(Σ box areas) instead of O(marks × pixels).
 *
 * ## The erosion short-circuit (v0.9.0, exact — `reports/wv9a.md` §e names it)
 *
 * Most marks are small, and for a small mark the erosion's answer is a **geometric certainty**: a
 * mask contained in a box of `W × H` has no pixel further than `min(⌈W/2⌉, ⌈H/2⌉)` from the box's
 * outside in the chessboard metric, so if that bound is `≤ inkRadius` the erosion kills every closed
 * pixel and `erosionMortality` is exactly 1. Two conditions make the bound sound and both are
 * checked rather than assumed: the closed mask lies inside the support's box grown by the closing
 * radius, and the whole grown box must be strictly interior to the **image** — a support that
 * touches the frame is eroded against `chessboardDistanceToComplement`'s border replication (*outside
 * the image is support*), where no box bounds anything.
 *
 * When it fires, the crop's padding drops from `closing + ink + 2` to `closing + 2` (113 px → 23 px
 * at 3000²) and the second distance transform is not run at all. `closedPixels` is still counted, on
 * the same closing, so every published number is the one the long path would have produced;
 * `tests/marks.test.ts` pins the equality on a fixture where the short circuit fires.
 */
export function inkOnSupport(
	support: Uint8Array,
	ground: Uint8Array,
	width: number,
	height: number,
	box: PixelBox,
): InkStatistics {
	const closingRadius = scaleRadius(width, height, INK_TEXTURE_CLOSING_FRACTION)
	const inkRadius = scaleRadius(width, height, INK_SCALE_FRACTION)
	const grownWidth = box.maxX - box.minX + 1 + 2 * closingRadius
	const grownHeight = box.maxY - box.minY + 1 + 2 * closingRadius
	const interior = box.minX - closingRadius >= 1 && box.minY - closingRadius >= 1 &&
		box.maxX + closingRadius <= width - 2 && box.maxY + closingRadius <= height - 2
	const allDie = interior &&
		Math.min(Math.ceil(grownWidth / 2), Math.ceil(grownHeight / 2)) <= inkRadius
	const pad = closingRadius + (allDie ? 0 : inkRadius) + 2
	const minX = Math.max(0, box.minX - pad)
	const minY = Math.max(0, box.minY - pad)
	const maxX = Math.min(width - 1, box.maxX + pad)
	const maxY = Math.min(height - 1, box.maxY + pad)
	if (maxX < minX || maxY < minY) return { closedPixels: 0, erosionMortality: 0, groundAdjacency: 0 }

	const cropWidth = maxX - minX + 1
	const cropHeight = maxY - minY + 1
	// The whole frame *is* the crop: the copy would be pure cost, so take wp12's function directly.
	if (cropWidth === width && cropHeight === height) {
		return inkStatistics(support, ground, width, height)
	}

	const cropSupport = new Uint8Array(cropWidth * cropHeight)
	const cropGround = new Uint8Array(cropWidth * cropHeight)
	for (let row = minY; row <= maxY; row += 1) {
		const source = row * width
		const target = (row - minY) * cropWidth - minX
		for (let column = minX; column <= maxX; column += 1) {
			cropSupport[target + column] = support[source + column]!
			cropGround[target + column] = ground[source + column]!
		}
	}

	const closed = closeSupport(cropSupport, cropWidth, cropHeight, closingRadius)

	// The short circuit, and the whole of what it saves: on `allDie` the second distance transform is
	// the expensive half of this function and its answer is already known, so it is not run. The
	// closing still is — `closedPixels` is published and the bound says nothing about it.
	const distance = allDie ? null : chessboardDistanceToComplement(closed, cropWidth, cropHeight)

	let closedPixels = 0
	let survivors = 0
	for (let index = 0; index < closed.length; index += 1) {
		if (closed[index] !== 1) continue
		closedPixels += 1
		if (distance !== null && distance[index]! > inkRadius) survivors += 1
	}

	let outwardBoundary = 0
	let onGround = 0
	for (let row = 0; row < cropHeight; row += 1) {
		for (let column = 0; column < cropWidth; column += 1) {
			const index = row * cropWidth + column
			if (cropSupport[index] !== 1) continue
			if (row > 0) {
				const n = index - cropWidth
				if (cropSupport[n] !== 1) { outwardBoundary += 1; if (cropGround[n] === 1) onGround += 1 }
			}
			if (row < cropHeight - 1) {
				const n = index + cropWidth
				if (cropSupport[n] !== 1) { outwardBoundary += 1; if (cropGround[n] === 1) onGround += 1 }
			}
			if (column > 0) {
				const n = index - 1
				if (cropSupport[n] !== 1) { outwardBoundary += 1; if (cropGround[n] === 1) onGround += 1 }
			}
			if (column < cropWidth - 1) {
				const n = index + 1
				if (cropSupport[n] !== 1) { outwardBoundary += 1; if (cropGround[n] === 1) onGround += 1 }
			}
		}
	}

	return {
		closedPixels,
		erosionMortality: closedPixels > 0 ? 1 - survivors / closedPixels : 0,
		groundAdjacency: outwardBoundary > 0 ? onGround / outwardBoundary : 0,
	}
}

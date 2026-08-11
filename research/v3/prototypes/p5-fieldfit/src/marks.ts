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
//  - **Where no count repeats there is no plateau**, and the criterion relaxes continuously to the
//    **flattest centred log-log slope** `|Δln N / Δln(1 + r)|`. Both quantities are scale-free, which
//    is what makes one criterion apply to a 300² and a 3000² cover; `1 + r` rather than `r` only so
//    that `r = 0` has a logarithm. A centred derivative needs both neighbours, so the ladder's two
//    endpoints cannot win it — a consequence rather than a rule, and it happens to exclude the two
//    degenerate readings (every speck its own mark; everything merged into one).
//  - The sweep **stops at the first scale where nothing is left to merge** (`N ≤ 1`): the curve
//    carries no information past it.
//
// Ties go to the finer scale on both readings: of two equally flat readings the more conservative one
// keeps more structure apart, and it is the one whose marks are still marks.
//
// **V9a measures this criterion to be unstable across covers and says so** (`reports/wv9a.md`): the
// fallback is reached on 3 of 6 probed covers, and on a residual that is pure texture the count curve
// is convex with no shoulder, so the flattest slope sits at whichever end the convexity points to —
// `r = 1` and 473 marks on round-3 item 4, `r = 23` and 7 marks on NARCOSIS. That is a finding about
// arm-f's criterion, not a defect of this implementation of it, and it is reported rather than
// patched: the whole `N(r)` curve is published on `MarkScaleChoice` so the ruling can be made against
// it.

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
 * The weight above which the field is said to explain a pixel.
 *
 * **Not a new number**: it is `fieldfit.ts`'s own inlier convention, the one `FieldFit.inlierFraction`
 * and `FieldComponent.coreFraction` are both defined by. It is used here only on the path where no
 * component pool exists and the fit itself is the region.
 */
const FIELD_INLIER_WEIGHT = 0.5

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
	/** Centred `|Δln N / Δln(1 + r)|` at each rung; `null` at the two endpoints, which cannot win. */
	flatness: readonly (number | null)[]
	/** Index into `scales` of the chosen rung. */
	chosenIndex: number
	/** Which reading chose it: the plateau, its continuous relaxation, or a curve too short for either. */
	criterion: "plateau" | "slope" | "degenerate"
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

	const scale = chooseGroupingScale(unexplained, width, height)
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

	// --- its continuous relaxation, always measured so the report can compare the two ----------
	const flatness: (number | null)[] = scales.map(() => null)
	let slopeIndex = 0
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
			diagonal,
		}
	}
	// No count repeated, so there is no plateau to take: the relaxation decides. With fewer than
	// three rungs not even that exists, and the finest scale — plain connectivity — is what was
	// measured; `criterion` says which of the three happened rather than leaving it to be inferred.
	return {
		radius: scales[slopeIndex]!,
		scales,
		counts,
		flatness,
		chosenIndex: slopeIndex,
		criterion: scales.length >= 3 ? "slope" : "degenerate",
		plateauLength: 1,
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
 */
export function inkOnSupport(
	support: Uint8Array,
	ground: Uint8Array,
	width: number,
	height: number,
	box: PixelBox,
): InkStatistics {
	const pad = scaleRadius(width, height, INK_TEXTURE_CLOSING_FRACTION) +
		scaleRadius(width, height, INK_SCALE_FRACTION) + 2
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

	const closed = closeSupport(
		cropSupport,
		cropWidth,
		cropHeight,
		scaleRadius(width, height, INK_TEXTURE_CLOSING_FRACTION),
	)
	const inkRadius = scaleRadius(width, height, INK_SCALE_FRACTION)
	const distance = chessboardDistanceToComplement(closed, cropWidth, cropHeight)

	let closedPixels = 0
	let survivors = 0
	for (let index = 0; index < closed.length; index += 1) {
		if (closed[index] !== 1) continue
		closedPixels += 1
		if (distance[index]! > inkRadius) survivors += 1
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

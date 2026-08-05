/**
 * The gradient boolean, t, and the stops (arm-d §2.4).
 *
 * ## t
 *
 * For every pixel of F, `t(p)` is its projection onto u, rescaled by the τ and (1 − τ) quantiles of that
 * projection so t runs [0, 1] with the **background at 0 and the surface at 1** — the contract's
 * required span and endpoints, structurally rather than by assertion. Which end is at 0 is decided by
 * §2.3's prevalence rank, so the rescale is oriented and then, if the background turned out to be the
 * high-projection end, flipped.
 *
 * ## The boolean
 *
 * A field whose ends differ is either *one progression* or *two distinct areas*, and the discriminator is
 * whether t is explained by position. So: **Spearman rank correlation** between t and each member of a
 * small fixed dictionary of spatial parameterisations — four linear directions, radial from the image
 * centre, and radial from F's own spatial cascade location. The boolean is true when the best absolute
 * rank correlation exceeds ρ\*.
 *
 * Rank correlation and not a fit: no residual, no created colour, nothing a dither can move. The winning
 * parameterisation *is* the optional `geometry` field, populated because the discriminator computed it
 * anyway and for no other reason — the contract's "opportunistic" clause, honoured literally.
 *
 * ## The stops
 *
 * t is sampled at a fixed grid. At each sample t₀, `c(t₀)` is the **cascade pixel** of the field pixels
 * whose t lies in a narrow band around t₀ — again an actual artwork pixel, never an interpolation. The
 * 2-stop straight line in OKLab from background to surface is the flattest possible path; its
 * **excursion** at t₀ is the distance from that line at t₀ to c(t₀). A guide stop is inserted where that
 * excursion is worst, provided the stop is *admissible* by the canon below.
 *
 * ## 0.4.0 — the guide-stop canon, and the defect it repairs
 *
 * Round 3 (`review-rounds/round-3-gradient-pairwise/VERDICTS.md`) named banding on **exactly the four
 * 4-stop covers and none of the four 2-stop covers**, and the reviewer's clarification is the doctrine:
 * stops beyond the second *"are mostly to help guide the linear interpolation in OKLab space through
 * colors that fit the artwork, not to introduce new colors or meander around the color space"*. What the
 * round measured is therefore the **misuse** the guide-stop ruling already predicts, not a stop-count
 * dis-utility — so 0.4.0 does not cap the count. It makes the ruling checkable at the point of insertion.
 *
 * ### The diagnosis, run before anything was constrained (change 2e)
 *
 * All four covers were replayed under the 0.3.0 machinery with the whole excursion curve printed. The
 * published paths were:
 *
 * | cover | path (position) | spacings | chord-projection sequence |
 * |---|---|---|---|
 * | 048 | `#0b030e` → `#0492a0`@59.4% → `#fe0002`@65.6% → `#85d7d5` | 59.4 / **6.3** / 34.4 | 0 → **0.692 → 0.661** → 1 |
 * | 181 | `#183966` → `#257dbd`@40.6% → `#aa7d78`@53.1% → `#ffc7dd` | 40.6 / **12.5** / 46.9 | 0 → 0.379 → 0.556 → 1 |
 * | 114 | `#eef0ef` → `#7e7e7e`@62.5% → `#d85a4e`@65.6% → `#992525` | 62.5 / **3.1** / 34.4 | 0 → 0.659 → 0.688 → 1 |
 * | 188 | `#e9fef7` → `#d08a70`@37.5% → `#1faabf`@40.6% → `#202928` | 37.5 / **3.1** / 59.4 | 0 → 0.399 → 0.424 → 1 |
 *
 * **The cause is that `c(t)` is not a curve.** t is a projection onto *one* OKLab direction (m → e₁), and
 * the excursion is measured perpendicular to a *different* line (the background → surface chord). On a
 * field whose colours form two or more chromatic lumps sitting off that chord, two lumps can occupy
 * *overlapping ranges of t* — so consecutive grid samples' band-cascade pixels jump between them. Cover
 * 188 is the plainest case: `c(0.375)` is a salmon `#d08a70` and `c(0.406)`, one grid step later, is a
 * cyan `#1faabf`. Those are two different objects in the artwork that happen to project alike, not two
 * neighbouring points of one progression.
 *
 * Excursion insertion on such a `c(t)` does what Ramer–Douglas–Peucker does on a self-intersecting
 * polyline: it plants a vertex per off-chord lobe, and the vertices' order **along t** need not be their
 * order **along the path**. That produces the two symptoms the round named, and it produces them for one
 * reason:
 *
 * - **adjacent stops** when the lumps overlap in t — 114 and 188 both land at exactly **one grid step**,
 *   `1/(EXCURSION_GRID_SAMPLES − 1)` = 3.1%, which is the smallest spacing the machinery can express and
 *   is precisely the 3.1% r2-item-0 called *"very significant banding"*;
 * - **meander** when a lump's chord projection runs backwards against its t — 048's second stop projects
 *   to 0.692 and is inserted *before* a stop projecting to 0.661, which is an out-and-back path and is
 *   the reviewer's *"there is no blue-to-red-to-blue gradient in that artwork"* exactly.
 *
 * **So 0.1.0–0.3.0's docstring claim that "meandering is unreachable, since no stop can be added that
 * does not reduce excursion" was false as stated, and the error was inherited from RDP.** Every insertion
 * does reduce the max-excursion *metric*; that metric is not the path's arc ordering, so out-and-back is
 * perfectly reachable. The guarantee holds for a simplification of a curve, and `c(t)` is not one.
 *
 * ### What replaces it — four clauses, all at insertion
 *
 * 1. **The candidate is the best *admissible* sample, not the arg-max.** The grid is measured, sorted by
 *    excursion descending, and walked until a sample passes every clause below. At 0.3.0 a single
 *    inadmissible arg-max ended insertion outright, so a legitimately justified stop elsewhere on the
 *    ramp was lost to whichever lump happened to be furthest off the chord. **This is the cause-level
 *    repair**: the machinery is looking for the best stop it may take, not merely for the worst sample.
 * 2. **Minimum spacing** (`MIN_GUIDE_STOP_SPACING`): a stop must leave every gap on the path strictly
 *    wider than the constant. This is the clause the two 3.1% covers fail, and it is also what keeps a
 *    lone guide stop off the shoulder of an endpoint.
 * 3. **Monotone progression**: the stop's projection onto the background → surface chord must lie
 *    strictly between those of the two stops it is inserted between. This is the ruling's *"meandering is
 *    forbidden"* made checkable — and it is a **scalar of pixels**, a dot product of two pixel-to-pixel
 *    difference vectors, so it creates nothing. 048's teal fails it.
 * 4. **Recorded excursion-reduction justification**: a stop is admitted only if the maximum excursion
 *    over the segment it splits is *strictly lower after the split than before*, and the two numbers plus
 *    the difference travel into the exposed intermediates per stop. "Excursion reduction justifies a
 *    stop" stops being an argument about the algorithm and becomes a number about each stop.
 *
 * A guide stop whose colour is within the same-colour bar of a stop already published is still refused —
 * invariant 3 judges stop-against-stop pairs, and a ramp with two indistinguishable stops has a stop that
 * is not doing anything — but at 0.4.0 that refusal **skips the candidate** instead of ending insertion.
 *
 * ### The fourth stop
 *
 * `PHASE_0_DECISIONS.md` §2, as `types.ts` restates it: *"The fourth stop is additionally **negotiable on
 * proven utility** rather than granted … so a fitter that reaches for it owes evidence that three could
 * not do the job."* No such evidence exists — the only measurement of 4-stop ramps we have is round 3,
 * where the gradient side was graded unacceptable on all four of them. So the second guide stop is
 * **gated off by default** (`FOURTH_STOP_PROVEN_UTILITY`) with its code path left intact, which is what
 * "negotiable" means: the loop can reach it the day the evidence does.
 */

import { sameColorBar } from "../../../src/contract/color.ts"
import { colorFromRgb } from "../../../src/contract/color.ts"
import type { GradientGeometry } from "../../../src/contract/types.ts"
import {
	EXCURSION_BAND_HALF_WIDTH,
	EXCURSION_BAR_MULTIPLIER,
	EXCURSION_GRID_SAMPLES,
	FOURTH_STOP_PROVEN_UTILITY,
	GRADIENT_RANK_CORRELATION,
	MAX_GUIDE_STOPS,
	MIN_GUIDE_STOP_SPACING,
	SPATIAL_DICTIONARY_ANGLES,
	TRIM_LEVEL,
} from "./constants.ts"
import { pixelRgb, type DecodedImage } from "./decode.ts"
import type { FieldEnds } from "./field-roles.ts"
import { averageRanks, cascadePixel, quantileIndex, spatialCascade, spearmanRanked } from "./primitives.ts"

export type GradientParameterisation = Readonly<{
	/** t per pixel of F, aligned with `fieldSet`'s order. */
	t: Float64Array
	/** Best absolute Spearman correlation against the spatial dictionary. */
	bestCorrelation: number
	isGradient: boolean
	geometry: GradientGeometry | undefined
}>

/**
 * t, the discriminator, and the geometry that falls out of it.
 *
 * Returns `t` even when the boolean is false: the excursion machinery is not run in that case, but the
 * field is still parameterised and a reviewer looking at the exposed intermediates should see the same
 * t-map whatever the boolean said.
 */
export function parameteriseField(
	image: DecodedImage,
	fieldSet: Int32Array,
	ends: FieldEnds,
): GradientParameterisation {
	const n = fieldSet.length
	const t = new Float64Array(n)
	if (ends.direction === null || n === 0) {
		return { t, bestCorrelation: 0, isGradient: false, geometry: undefined }
	}

	const sortedProjection = Float64Array.from(ends.projection).sort()
	const low = sortedProjection[quantileIndex(n, TRIM_LEVEL)]
	const high = sortedProjection[quantileIndex(n, 1 - TRIM_LEVEL)]
	const span = high - low
	if (span <= 0) return { t, bestCorrelation: 0, isGradient: false, geometry: undefined }

	// Orientation: t = 0 at the background. The background is whichever end prevalence chose, so the
	// rescale is flipped when that end sits at the high-projection side.
	const projectionOf = (pixel: number): number => {
		const at = pixel * 3
		const m = ends.median * 3
		const u = ends.direction as readonly [number, number, number]
		return (image.lab[at] - image.lab[m]) * u[0] +
			(image.lab[at + 1] - image.lab[m + 1]) * u[1] +
			(image.lab[at + 2] - image.lab[m + 2]) * u[2]
	}
	const flip = projectionOf(ends.background) > projectionOf(ends.surface)

	for (let i = 0; i < n; i += 1) {
		const raw = (ends.projection[i] - low) / span
		const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw
		t[i] = flip ? 1 - clamped : clamped
	}

	// The fixed spatial dictionary. Rank correlation is sign-symmetric under a direction reversal, so
	// four directions cover eight headings and the sign is read back out for the geometry.
	const width = image.width
	const height = image.height
	const centre = spatialCascade(fieldSet, width, height)
	type Entry = { readonly id: string; readonly values: Float64Array; readonly geometry: (rho: number) => GradientGeometry }
	const entries: Entry[] = []

	for (const angle of SPATIAL_DICTIONARY_ANGLES) {
		// [INHERITED] — 180 is degrees-per-π. A unit conversion, fixed by the choice to write the
		// dictionary in degrees (`SPATIAL_DICTIONARY_ANGLES`), which is where the tunable actually lives.
		const radians = (angle * Math.PI) / 180
		const cos = Math.cos(radians)
		const sin = Math.sin(radians)
		const values = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			const pixel = fieldSet[i]
			const y = Math.floor(pixel / width)
			const x = pixel - y * width
			values[i] = (x / width) * cos + (y / height) * sin
		}
		// [INHERITED] — the `0.5`s below are the *centre of the normalized frame* and the `2`s halve a unit
		// direction so the reported chord is centred on it; `180` is the degree measure of a reversal. The
		// contract's `GradientGeometry` is expressed in [0, 1] image coordinates, so every one of these is
		// fixed by that coordinate system. This block is `opportunistic` output and nothing reads it back.
		entries.push({
			id: `linear-${angle}`,
			values,
			geometry: (rho) => ({
				kind: "linear",
				start: rho >= 0 ? [0.5 - cos / 2, 0.5 - sin / 2] : [0.5 + cos / 2, 0.5 + sin / 2],
				end: rho >= 0 ? [0.5 + cos / 2, 0.5 + sin / 2] : [0.5 - cos / 2, 0.5 - sin / 2],
				angleDegrees: rho >= 0 ? angle : angle + 180,
			}),
		})
	}

	// [INHERITED] — `[0.5, 0.5]` is the centre of the normalized image frame, the same [0, 1] coordinate
	// system the contract's `GradientGeometry` is written in. The dictionary's *members* are the choice
	// (`SPATIAL_DICTIONARY_ANGLES` and these two origins); the number 0.5 is what "centre" means.
	for (const [id, origin] of [["radial-image-centre", [0.5, 0.5]], ["radial-field-cascade", centre]] as const) {
		const values = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			const pixel = fieldSet[i]
			const y = Math.floor(pixel / width)
			const x = pixel - y * width
			values[i] = Math.hypot(x / width - origin[0], y / height - origin[1])
		}
		entries.push({
			id,
			values,
			geometry: () => ({ kind: "radial", center: [origin[0], origin[1]] }),
		})
	}

	const tRanks = averageRanks(t)
	let best: { magnitude: number; rho: number; entry: Entry } | null = null
	for (const entry of entries) {
		const rho = spearmanRanked(tRanks, entry.values)
		const magnitude = Math.abs(rho)
		// Ties keep the earlier dictionary entry, and the dictionary order is fixed — so the winner is a
		// function of the field and not of iteration order.
		if (best === null || magnitude > best.magnitude) best = { magnitude, rho, entry }
	}

	const bestCorrelation = best === null ? 0 : best.magnitude
	const isGradient = bestCorrelation >= GRADIENT_RANK_CORRELATION
	return {
		t,
		bestCorrelation,
		isGradient,
		geometry: isGradient && best !== null ? best.entry.geometry(best.rho) : undefined,
	}
}

export type GuideStop = Readonly<{ pixel: number; position: number }>

/**
 * **Why one stop was admitted** (0.4.0, canon clause 4). Scalars only; nothing here is read back.
 *
 * `segmentMaxBefore` and `segmentMaxAfter` are the maximum excursion over the segment this stop split,
 * measured against the path before the insertion and against the two sub-segments after it. Their
 * difference is the off-artwork excursion this stop removes, which is the *only* admissible reason the
 * guide-stop ruling recognises for a stop beyond the second.
 */
export type GuideStopJustification = Readonly<{
	position: number
	/** The stop's own distance from the chord it was inserted into. */
	excursion: number
	segmentMaxBefore: number
	segmentMaxAfter: number
	/** `segmentMaxBefore − segmentMaxAfter`, required to be strictly positive. */
	reducedBy: number
	/** The stop's projection onto the background → surface chord, and its two neighbours'. */
	chordProjection: number
	neighbourProjections: readonly [number, number]
	/** The narrowest gap the path holds once this stop is on it. */
	narrowestSpacing: number
	/** How many higher-excursion samples were refused before this one, and by which clause. */
	skipped: number
}>

/** Why a round of insertion stopped. Recorded so "no stop" is a statement rather than a silence. */
export type ExcursionHalt =
	| "bar-met"
	| "no-admissible-candidate"
	| "stop-budget"
	| "empty-grid"

export type ExcursionResult = Readonly<{
	/** Interior stops, in ascending position order. Empty when the chord already met the bar. */
	guideStops: readonly GuideStop[]
	/** The excursion curve as measured against the final published path, for the exposed intermediates. */
	maxExcursion: number
	excursionBar: number
	/** One record per admitted stop, in insertion order (0.4.0, canon clause 4). */
	justifications: readonly GuideStopJustification[]
	/** How many candidate samples were refused, by clause, across all rounds. */
	refusals: Readonly<{ spacing: number; monotone: number; indistinct: number; noReduction: number }>
	halt: ExcursionHalt
	/** How many guide stops the proven-utility gate allowed this run to reach. */
	stopBudget: number
}>

/** The cascade pixel of the field pixels whose t lies within the band around `centre`. */
function bandCascade(
	image: DecodedImage,
	fieldSet: Int32Array,
	t: Float64Array,
	centre: number,
): number {
	const members: number[] = []
	for (let i = 0; i < fieldSet.length; i += 1) {
		if (Math.abs(t[i] - centre) <= EXCURSION_BAND_HALF_WIDTH) members.push(fieldSet[i])
	}
	if (members.length === 0) return -1
	return cascadePixel(members, members.length, image.lab, image.rgb)
}

/** One grid sample measured against the path it currently falls on. */
type GridSample = Readonly<{ position: number; pixel: number; excursion: number; segment: number }>

/**
 * Excursion-driven guide-stop insertion, under 0.4.0's canon.
 *
 * The path starts as the two-stop chord background → surface and gains interior stops, each the **best
 * admissible** grid sample rather than the raw arg-max. See the module docstring for the four clauses and
 * for the measured defect they repair.
 */
export function insertGuideStops(
	image: DecodedImage,
	fieldSet: Int32Array,
	t: Float64Array,
	background: number,
	surface: number,
): ExcursionResult {
	const excursionBar = EXCURSION_BAR_MULTIPLIER *
		sameColorBar(colorFromRgb(pixelRgb(image, background)), colorFromRgb(pixelRgb(image, surface)))

	// The proven-utility gate. `MAX_GUIDE_STOPS` is the contract's structural ceiling (4 stops, two of
	// them the field roles); the *reachable* budget is one less until the fourth stop earns its evidence.
	const stopBudget = FOURTH_STOP_PROVEN_UTILITY ? MAX_GUIDE_STOPS : MAX_GUIDE_STOPS - 1

	// The published path, as (position, pixel) pairs. The ends are the field roles and never move.
	const path: GuideStop[] = [
		{ pixel: background, position: 0 },
		{ pixel: surface, position: 1 },
	]

	// The chord's own direction, as the **scalar** each stop is ordered along for the monotone clause.
	// `chordProjection` is a dot product of two pixel-to-pixel difference vectors divided by the squared
	// length of one of them: a number attached to a pixel, materialising nothing. It is normalised so the
	// background reads 0 and the surface 1, which is what makes "between its neighbours" readable.
	const backgroundAt = background * 3
	const surfaceAt = surface * 3
	const chordL = image.lab[surfaceAt] - image.lab[backgroundAt]
	const chordA = image.lab[surfaceAt + 1] - image.lab[backgroundAt + 1]
	const chordB = image.lab[surfaceAt + 2] - image.lab[backgroundAt + 2]
	const chordLengthSquared = chordL * chordL + chordA * chordA + chordB * chordB
	const chordProjection = (pixel: number): number => {
		if (chordLengthSquared === 0) return 0
		const at = pixel * 3
		return ((image.lab[at] - image.lab[backgroundAt]) * chordL +
			(image.lab[at + 1] - image.lab[backgroundAt + 1]) * chordA +
			(image.lab[at + 2] - image.lab[backgroundAt + 2]) * chordB) / chordLengthSquared
	}

	/** Which segment of the current path a position falls in. */
	const segmentOf = (position: number): number => {
		let segment = 0
		while (segment + 2 < path.length && path[segment + 1].position < position) segment += 1
		return segment
	}

	/** The excursion of one band cascade pixel against one segment of the path. */
	const excursionAgainst = (pixel: number, position: number, segment: number): number => {
		const left = path[segment]
		const right = path[segment + 1]
		const local = right.position === left.position
			? 0
			: (position - left.position) / (right.position - left.position)

		// §2.4's excursion, **in explicit difference form** (0.2.0; `LINE_AUDIT.md` ruling (a),
		// finding 3, and its non-blocking recommendation). No chord point is materialised. The
		// identity
		//
		//     ‖c − (A + local·(B − A))‖  ≡  ‖(c − A) − local·(B − A)‖
		//
		// makes this a norm over two **pixel-to-pixel difference vectors** — c − A and B − A, each the
		// difference of two actual pixels — one of them scaled by a scalar. That is precisely the
		// object arm-d §2.3(3) rules non-colour-bearing, so this site no longer needs the AUDIT NOTE
		// it carried at 0.1.0, and the prototype now materialises no OKLab triple anywhere.
		//
		// Stated rather than smoothed: this is the same *measurement* but not the same floating-point
		// *expression*, because addition is not associative. Differences of order 1e-16 in the
		// excursion can in principle move a guide-stop arg-max on a field where two grid samples tie
		// to sixteen digits.
		const a = left.pixel * 3
		const b = right.pixel * 3
		const at = pixel * 3
		return Math.hypot(
			(image.lab[at] - image.lab[a]) - local * (image.lab[b] - image.lab[a]),
			(image.lab[at + 1] - image.lab[a + 1]) - local * (image.lab[b + 1] - image.lab[a + 1]),
			(image.lab[at + 2] - image.lab[a + 2]) - local * (image.lab[b + 2] - image.lab[a + 2]),
		)
	}

	// The band cascade pixel of every grid sample. It depends on t and on the field alone, never on the
	// path, so it is computed once rather than once per insertion round — the same measurement, and the
	// one expensive part of this function.
	const gridPixel: number[] = []
	for (let sample = 0; sample < EXCURSION_GRID_SAMPLES; sample += 1) {
		gridPixel.push(bandCascade(image, fieldSet, t, sample / (EXCURSION_GRID_SAMPLES - 1)))
	}

	/** Measure the whole grid against the current path. */
	const measureGrid = (): GridSample[] => {
		const out: GridSample[] = []
		for (let sample = 0; sample < EXCURSION_GRID_SAMPLES; sample += 1) {
			const pixel = gridPixel[sample]
			if (pixel < 0) continue
			const position = sample / (EXCURSION_GRID_SAMPLES - 1)
			const segment = segmentOf(position)
			out.push({ position, pixel, segment, excursion: excursionAgainst(pixel, position, segment) })
		}
		return out
	}

	const justifications: GuideStopJustification[] = []
	const refusals = { spacing: 0, monotone: 0, indistinct: 0, noReduction: 0 }
	let maxExcursion = 0
	let halt: ExcursionHalt = "stop-budget"

	for (let insertion = 0; insertion <= stopBudget; insertion += 1) {
		const samples = measureGrid()
		if (samples.length === 0) {
			maxExcursion = 0
			halt = "empty-grid"
			break
		}
		// Descending by excursion; ties keep the earlier position, so the walk is a function of the field
		// and not of iteration order.
		const ranked = samples.slice().sort((left, right) =>
			right.excursion - left.excursion !== 0 ? right.excursion - left.excursion : left.position - right.position
		)
		maxExcursion = ranked[0].excursion

		if (insertion === stopBudget) {
			halt = "stop-budget"
			break
		}
		if (maxExcursion <= excursionBar) {
			halt = "bar-met"
			break
		}

		// Clause 1: walk the ranked samples until one is admissible, rather than taking the arg-max and
		// giving up if it is not. See the module docstring — this is the cause-level repair.
		let admitted: GuideStopJustification | null = null
		let admittedSample: GridSample | null = null
		let skipped = 0
		for (const candidate of ranked) {
			if (candidate.excursion <= excursionBar) break
			// Never at an endpoint: a stop at t = 0 or t = 1 would displace a field role, which the
			// endpoint ruling forbids. Two stops at one position would be a hard stop (invariant 1).
			if (candidate.position <= 0 || candidate.position >= 1) continue
			if (path.some((stop) => stop.position === candidate.position)) continue

			// Clause 2 — minimum spacing, against every stop already on the path.
			let narrowest = Number.POSITIVE_INFINITY
			const positions = path.map((stop) => stop.position).concat(candidate.position).sort((l, r) => l - r)
			for (let i = 1; i < positions.length; i += 1) {
				const gap = positions[i] - positions[i - 1]
				if (gap < narrowest) narrowest = gap
			}
			if (narrowest <= MIN_GUIDE_STOP_SPACING) {
				refusals.spacing += 1
				skipped += 1
				continue
			}

			// Clause 3 — monotone progression along the chord. The candidate must advance past the stop on
			// its left and fall short of the stop on its right; equality is a refusal, because a stop that
			// does not advance is not a step of a progression.
			const left = path[candidate.segment]
			const right = path[candidate.segment + 1]
			const projection = chordProjection(candidate.pixel)
			const leftProjection = chordProjection(left.pixel)
			const rightProjection = chordProjection(right.pixel)
			const forward = leftProjection <= rightProjection
			const advances = forward
				? projection > leftProjection && projection < rightProjection
				: projection < leftProjection && projection > rightProjection
			if (!advances) {
				refusals.monotone += 1
				skipped += 1
				continue
			}

			// Refuse a stop indistinguishable from one already on the path. Invariant 3 judges
			// stop-against-stop pairs, and a ramp with two indistinguishable stops has a stop that is not
			// doing anything. At 0.4.0 this skips the candidate rather than ending insertion.
			const candidateColor = colorFromRgb(pixelRgb(image, candidate.pixel))
			const indistinct = path.some((stop) => {
				const other = colorFromRgb(pixelRgb(image, stop.pixel))
				const bar = sameColorBar(candidateColor, other)
				const a = stop.pixel * 3
				const at = candidate.pixel * 3
				return Math.hypot(
					image.lab[at] - image.lab[a],
					image.lab[at + 1] - image.lab[a + 1],
					image.lab[at + 2] - image.lab[a + 2],
				) < bar
			})
			if (indistinct) {
				refusals.indistinct += 1
				skipped += 1
				continue
			}

			// Clause 4 — the excursion-reduction justification, computed rather than assumed. The segment
			// this stop would split is re-measured against the two sub-segments the stop creates; the stop
			// is admitted only if the segment's worst excursion is strictly lower after than before.
			let segmentMaxBefore = 0
			for (const sample of samples) {
				if (sample.segment !== candidate.segment) continue
				if (sample.excursion > segmentMaxBefore) segmentMaxBefore = sample.excursion
			}
			const trial: GuideStop[] = [left, { pixel: candidate.pixel, position: candidate.position }, right]
			let segmentMaxAfter = 0
			for (const sample of samples) {
				if (sample.segment !== candidate.segment) continue
				const half = sample.position <= candidate.position ? 0 : 1
				const a = trial[half].pixel * 3
				const b = trial[half + 1].pixel * 3
				const span = trial[half + 1].position - trial[half].position
				const local = span === 0 ? 0 : (sample.position - trial[half].position) / span
				const at = sample.pixel * 3
				const value = Math.hypot(
					(image.lab[at] - image.lab[a]) - local * (image.lab[b] - image.lab[a]),
					(image.lab[at + 1] - image.lab[a + 1]) - local * (image.lab[b + 1] - image.lab[a + 1]),
					(image.lab[at + 2] - image.lab[a + 2]) - local * (image.lab[b + 2] - image.lab[a + 2]),
				)
				if (value > segmentMaxAfter) segmentMaxAfter = value
			}
			if (!(segmentMaxAfter < segmentMaxBefore)) {
				refusals.noReduction += 1
				skipped += 1
				continue
			}

			admitted = {
				position: candidate.position,
				excursion: candidate.excursion,
				segmentMaxBefore,
				segmentMaxAfter,
				reducedBy: segmentMaxBefore - segmentMaxAfter,
				chordProjection: projection,
				neighbourProjections: [leftProjection, rightProjection],
				narrowestSpacing: narrowest,
				skipped,
			}
			admittedSample = candidate
			break
		}

		if (admitted === null || admittedSample === null) {
			halt = "no-admissible-candidate"
			break
		}

		justifications.push(admitted)
		path.push({ pixel: admittedSample.pixel, position: admittedSample.position })
		path.sort((left, right) => left.position - right.position)
	}

	return {
		guideStops: path.slice(1, -1),
		maxExcursion,
		excursionBar,
		justifications,
		refusals,
		halt,
		stopBudget,
	}
}

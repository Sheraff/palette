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
 * **excursion** at t₀ is the distance from that line at t₀ to c(t₀). If the maximum excursion over the
 * grid exceeds the excursion bar, one guide stop is inserted at the arg-max t, coloured c at that t, and
 * the two sub-segments are re-measured; at most twice in total.
 *
 * This is Ramer–Douglas–Peucker on the artwork's own colour path, and its properties are the ruling's
 * properties: every insertion strictly reduces maximum excursion and insertion halts the moment the bar
 * is met, so the result is the flattest path that stays on-artwork; **meandering is unreachable**, since
 * no stop can be added that does not reduce excursion; and colourspace coverage and metric fitting never
 * enter, because the only quantity consulted is distance-from-the-chord. A fourth stop is reached only
 * when three left the bar unmet.
 *
 * One thing this module refuses that the pure geometry would allow: a guide stop whose colour is within
 * the same-colour bar of a stop already published. Invariant 3 judges stop-against-stop pairs, and a
 * ramp with two indistinguishable stops is a ramp with a stop that is not doing anything. Refusing it
 * removes a stop; it never moves a colour.
 */

import { sameColorBar } from "../../../src/contract/color.ts"
import { colorFromRgb } from "../../../src/contract/color.ts"
import type { GradientGeometry } from "../../../src/contract/types.ts"
import {
	EXCURSION_BAND_HALF_WIDTH,
	EXCURSION_BAR_MULTIPLIER,
	EXCURSION_GRID_SAMPLES,
	GRADIENT_RANK_CORRELATION,
	MAX_GUIDE_STOPS,
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

export type ExcursionResult = Readonly<{
	/** Interior stops, in ascending position order. Empty when the chord already met the bar. */
	guideStops: readonly GuideStop[]
	/** The excursion curve as measured against the final published path, for the exposed intermediates. */
	maxExcursion: number
	excursionBar: number
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

/**
 * Excursion-driven guide-stop insertion.
 *
 * The path starts as the two-stop chord background → surface and gains at most `MAX_GUIDE_STOPS`
 * interior stops, each at the arg-max of excursion over the segment it splits.
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

	// The published path, as (position, pixel) pairs. The ends are the field roles and never move.
	const path: GuideStop[] = [
		{ pixel: background, position: 0 },
		{ pixel: surface, position: 1 },
	]

	let maxExcursion = 0
	for (let insertion = 0; insertion <= MAX_GUIDE_STOPS; insertion += 1) {
		let worst = { excursion: 0, position: 0, pixel: -1 }

		// Measure every grid sample against the segment of the current path it falls in.
		for (let sample = 0; sample < EXCURSION_GRID_SAMPLES; sample += 1) {
			const position = sample / (EXCURSION_GRID_SAMPLES - 1)
			const pixel = bandCascade(image, fieldSet, t, position)
			if (pixel < 0) continue

			let segment = 0
			while (segment + 2 < path.length && path[segment + 1].position < position) segment += 1
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
			const excursion = Math.hypot(
				(image.lab[at] - image.lab[a]) - local * (image.lab[b] - image.lab[a]),
				(image.lab[at + 1] - image.lab[a + 1]) - local * (image.lab[b + 1] - image.lab[a + 1]),
				(image.lab[at + 2] - image.lab[a + 2]) - local * (image.lab[b + 2] - image.lab[a + 2]),
			)

			if (excursion > worst.excursion) worst = { excursion, position, pixel }
		}

		maxExcursion = worst.excursion
		if (insertion === MAX_GUIDE_STOPS) break
		if (worst.excursion <= excursionBar || worst.pixel < 0) break
		// Never at an endpoint: a stop at t = 0 or t = 1 would displace a field role, which the endpoint
		// ruling forbids.
		if (worst.position <= 0 || worst.position >= 1) break
		// Refuse a stop indistinguishable from one already on the path. See the module docstring.
		const candidate = colorFromRgb(pixelRgb(image, worst.pixel))
		const indistinct = path.some((stop) => {
			const other = colorFromRgb(pixelRgb(image, stop.pixel))
			const bar = sameColorBar(candidate, other)
			const a = stop.pixel * 3
			const at = worst.pixel * 3
			return Math.hypot(
				image.lab[at] - image.lab[a],
				image.lab[at + 1] - image.lab[a + 1],
				image.lab[at + 2] - image.lab[a + 2],
			) < bar
		})
		if (indistinct) break
		// Two stops at one position would be a hard stop, which invariant 1 refuses.
		if (path.some((stop) => stop.position === worst.position)) break

		path.push({ pixel: worst.pixel, position: worst.position })
		path.sort((left, right) => left.position - right.position)
	}

	return {
		guideStops: path.slice(1, -1),
		maxExcursion,
		excursionBar,
	}
}

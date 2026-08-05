/**
 * P5 field-fit prototype — **ramp reading** (W-READ). Owner module per `../SPEC.md`'s pipeline
 * table: dominant direction from the affine part, t-parameterisation, orientation, endpoint
 * targets, the excursion test against the inventory, and third-stop insertion.
 *
 * This module reads a *fitted field* into the two (or three) continuous OKLab targets the caller
 * will snap and publish. It never snaps, never touches the ledger's discrete choice, and never
 * segments: everything it knows about the image comes from the fit's per-pixel weights and from
 * the inventory of occupied colours.
 *
 * ## What the spec says and what this implementation does
 *
 * SPEC decisions 2, 3 and 5 are the binding ones. Three places where the letter of the spec needed
 * a reading, all stated here rather than buried:
 *
 * 1. **Endpoints are robust, not extremal.** `arm-f-r3` §2.3 parameterises by `t = d·x` "over the
 *    image extent" and takes `g(t_min)`, `g(t_max)`. Taken literally that reads the field at the
 *    image corners, where the affine model is extrapolating hardest and where a single stray
 *    corner pixel moves the published colour. This module instead evaluates the field at the
 *    **weighted 2nd and 98th percentiles of t** (inlier weight as the weight). Same construction,
 *    same ends, but the endpoint colour is one a non-trivial area of the image actually shows.
 *    This is a refinement of "the extremes", declared, and it is the only place where a numeric
 *    choice was added that the spec did not name. `[UNCALIBRATED]` — 2/98 is a convention.
 *
 * 2. **Orientation sign.** SPEC decision 3 and `arm-f-r3` §2.3 both open with the principle —
 *    *"background is the larger field"* — and then restate it mechanically as *"the weighted median
 *    of t leans away from the background end"*. Those two clauses contradict each other: if the
 *    median leans toward one end, that end is where the inlier mass is, i.e. the **larger** field.
 *    The principle binds and the restatement does not (SPEC preamble: "principles bind, numbers do
 *    not"), so this module puts the background at the end the median leans **toward**, and the
 *    contradiction is reported upward rather than silently resolved. The rule is a single named
 *    constant, `BACKGROUND_IS_MAJORITY_END`, so the orchestrator can invert it in one line if the
 *    literal reading was meant.
 *
 * 3. **The excursion test runs on the endpoint _targets_, not on the snapped ends.** `arm-f-r3`
 *    §2.4 insists the projection comes first, because the rendered ramp interpolates published
 *    colours. That is true and remains the caller's obligation to re-check after snapping; but
 *    `snap.ts` is W-CORE's module and this one is given only the fit, so the test here is the
 *    pre-snap one. Since a snap moves each end by less than the bar, the pre-snap excursion and
 *    the post-snap excursion differ by less than the bar as well.
 *
 * Everything is deterministic: no randomness, no map-iteration-order dependence (every candidate
 * list is sorted on `(value, …, packed int)`), and every accumulation is in a fixed pixel order.
 *
 * ## v0.5: reading **one component's** ramp, with no support-restriction code in this file
 *
 * `E2_BRIEF.md` asks for the gradient of the most extensive field-like component — "its affine term
 * over its own support, by the existing ramp machinery restricted to the component's support". The
 * restriction is applied to the *input*, not here: `components.ts`'s `componentFieldFit` hands this
 * module a `FieldFit` whose weight map is zero off the component's support, and every quantity below
 * that reads weights — the t-histogram, both endpoint quantiles, the orientation median and its
 * standard error, the two-block mass ranking — is thereby computed over that support and nothing
 * else. The coefficients are the component's, so `fieldAt` is the component's surface.
 *
 * That is the whole of the change, and it is deliberate: a support-restricted *reader* would have
 * been a second implementation of the same six statistics, free to drift from this one. The two
 * things worth stating about the substitution:
 *
 *  - the endpoint quantiles are 2/98 **of the component's own weight mass**, so the ends are colours
 *    a non-trivial area *of the component* shows — the same refinement as before, one scale down;
 *  - `excursionMax` still measures against the whole artwork's inventory, not the component's
 *    colours. That is intended: the excursion test asks whether the rendered ramp passes through
 *    colours the *picture* contains, and the picture is the picture whichever field is being read.
 */

import { colorFromRgb, okLabDistance, okLabToRgb, sameColor } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
import { normalizedX, normalizedY } from "./decode.ts"
import type {
	DecodedRaster,
	FieldFit,
	Inventory,
	RampReading,
	StopTarget,
	TripleStats,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Tunables — all `[UNCALIBRATED]` conventions, all stated
// ---------------------------------------------------------------------------------------------

/** Quantiles of t (weighted by inlier weight) used as the ramp's ends. See header note 1. */
const ENDPOINT_QUANTILE_LOW = 0.02
const ENDPOINT_QUANTILE_HIGH = 0.98

/** Bins of the weighted t histogram the quantiles and the median are read from. */
const T_HISTOGRAM_BINS = 4096

/** Samples along the two-stop chord for the excursion test (SPEC decision 5: "~64"). */
const CHORD_SAMPLES = 64

/** Samples per segment of a three-stop polyline (64 in total, matching the chord's budget). */
const POLYLINE_SAMPLES_PER_SEGMENT = 32

/** A third stop must bring the excursion under the bar, or divide it by at least this. */
const THIRD_STOP_REDUCTION_FACTOR = 2

/** Candidate colours are occupied triples within `max(this × excursion, 3 × bar)` of the worst sample. */
const THIRD_STOP_RADIUS_FACTOR = 2

/** Ceiling on evaluated candidates; more than this and the sorted list is strided (see `pickCandidates`). */
const THIRD_STOP_CANDIDATE_LIMIT = 256

/** Cell size of the OKLab hash grid used for nearest-occupied-colour queries. */
const COLOR_GRID_CELL = 0.02

/**
 * **The orientation sign.** `true` = background sits at the end the weighted median of t leans
 * *toward* (the majority-inlier-mass end, i.e. "background is the larger field"). See header note 2:
 * this is the principle clause of SPEC decision 3, not its mechanical restatement.
 */
const BACKGROUND_IS_MAJORITY_END = true

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

function packedOf(rgb: Rgb8): number {
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

function subtract(a: OkLab, b: OkLab): [number, number, number] {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dot(a: readonly number[], b: readonly number[]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function mix(a: OkLab, b: OkLab, u: number): OkLab {
	return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

/** Where `color` falls on the parameterisation of the segment `from`→`to` (0 = from, 1 = to). */
export function projectionFraction(from: OkLab, to: OkLab, color: OkLab): number {
	const axis = subtract(to, from)
	const lengthSquared = dot(axis, axis)
	if (lengthSquared <= 0) return 0
	return dot(subtract(color, from), axis) / lengthSquared
}

/** Turning angle in radians at the middle vertex of `from`→`middle`→`to`. Ties break on this. */
function turningAngle(from: OkLab, middle: OkLab, to: OkLab): number {
	const incoming = subtract(middle, from)
	const outgoing = subtract(to, middle)
	const norms = Math.sqrt(dot(incoming, incoming)) * Math.sqrt(dot(outgoing, outgoing))
	if (norms <= 0) return 0
	return Math.acos(Math.min(1, Math.max(-1, dot(incoming, outgoing) / norms)))
}

// ---------------------------------------------------------------------------------------------
// Dominant direction: largest right singular vector of the 3×2 position-coefficient matrix
// ---------------------------------------------------------------------------------------------

/**
 * The image-plane direction along which the field's colour moves fastest.
 *
 * `B` is 3×2 (one row per OKLab channel, columns x and y). Its largest right singular vector is the
 * top eigenvector of the 2×2 symmetric `BᵀB`, which has a closed form — no iteration, hence exactly
 * reproducible. Returns `null` when the position coefficients are (numerically) zero, i.e. the
 * order-1 fit is a constant in disguise.
 *
 * The sign is canonicalised (first non-zero component positive) so the result does not depend on
 * floating-point luck; orientation flips it afterwards if the background turns out to be the high-t
 * end.
 */
function dominantDirection(coefficients: Float64Array): [number, number] | null {
	let mxx = 0
	let mxy = 0
	let myy = 0
	for (let channel = 0; channel < 3; channel++) {
		const bx = coefficients[channel * 3 + 1]
		const by = coefficients[channel * 3 + 2]
		mxx += bx * bx
		mxy += bx * by
		myy += by * by
	}
	if (!(mxx + myy > 1e-24)) return null

	const mean = (mxx + myy) / 2
	const largest = mean + Math.hypot((mxx - myy) / 2, mxy)

	let vx: number
	let vy: number
	if (mxy !== 0) {
		vx = mxy
		vy = largest - mxx
	} else if (mxx >= myy) {
		vx = 1
		vy = 0
	} else {
		vx = 0
		vy = 1
	}
	const norm = Math.hypot(vx, vy)
	if (!(norm > 0)) return null
	vx /= norm
	vy /= norm
	if (vx < 0 || (vx === 0 && vy < 0)) {
		vx = -vx
		vy = -vy
	}
	return [vx, vy]
}

// ---------------------------------------------------------------------------------------------
// Weighted t statistics
// ---------------------------------------------------------------------------------------------

type TStatistics = Readonly<{
	/** Weighted `ENDPOINT_QUANTILE_LOW`/`HIGH` quantiles of t. */
	tLow: number
	tHigh: number
	/** Weighted median of t. */
	tMedian: number
	/** Standard error of the weighted median (uniform-density approximation, see below). */
	medianStandardError: number
	weightSum: number
}>

/**
 * One pass over the raster accumulating the weighted distribution of `t = d·(x, y)` into a fixed
 * histogram, from which the quantiles and the median are read with linear interpolation inside the
 * containing bin. A histogram rather than a sort because the raster is full-resolution: sorting
 * 10⁷ keys per image to find three order statistics is the wrong shape, and the bin width here
 * (range / 4096) is three orders of magnitude below the colour differences that follow.
 *
 * **Standard error of the median.** `SE ≈ 1 / (2·f(m)·√n_eff)` with the density `f` approximated as
 * uniform over the 2–98 span — i.e. `SE = (tHigh − tLow) / (2·√n_eff)` — and `n_eff = (Σw)² / Σw²`,
 * the effective sample size the weight mass carries. This is the "computable from the weight mass"
 * quantity SPEC decision 3's near-tie clause needs; it is an approximation and is declared as one.
 */
function tStatistics(
	fit: FieldFit,
	raster: DecodedRaster,
	direction: readonly [number, number],
): TStatistics | null {
	const { width, height } = raster
	// The coordinate frame is `decode.ts`'s pixel-centre convention, imported rather than restated
	// so the t-axis is the same frame the fit's coefficients were estimated in.
	const xs = new Float64Array(width)
	for (let px = 0; px < width; px++) xs[px] = normalizedX(px, width) * direction[0]
	const ys = new Float64Array(height)
	for (let py = 0; py < height; py++) ys[py] = normalizedY(py, height) * direction[1]

	// Exact t range over the sampled pixel centres (the convention is exclusive of ±1).
	const extentX = Math.abs(direction[0]) * (1 - 1 / width)
	const extentY = Math.abs(direction[1]) * (1 - 1 / height)
	const tMin = -(extentX + extentY)
	const tMax = extentX + extentY
	if (!(tMax > tMin)) return null

	const binWidth = (tMax - tMin) / T_HISTOGRAM_BINS
	const histogram = new Float64Array(T_HISTOGRAM_BINS)
	let weightSum = 0
	let weightSquareSum = 0

	const weights = fit.weights
	for (let py = 0; py < height; py++) {
		const rowOffset = py * width
		const yPart = ys[py]
		for (let px = 0; px < width; px++) {
			const weight = weights[rowOffset + px]
			if (!(weight > 0)) continue
			const t = xs[px] + yPart
			let bin = Math.floor((t - tMin) / binWidth)
			if (bin < 0) bin = 0
			else if (bin >= T_HISTOGRAM_BINS) bin = T_HISTOGRAM_BINS - 1
			histogram[bin] += weight
			weightSum += weight
			weightSquareSum += weight * weight
		}
	}
	if (!(weightSum > 0) || !(weightSquareSum > 0)) return null

	const quantile = (q: number): number => {
		const target = q * weightSum
		let cumulative = 0
		for (let bin = 0; bin < T_HISTOGRAM_BINS; bin++) {
			const mass = histogram[bin]
			if (mass > 0 && cumulative + mass >= target) {
				return tMin + (bin + (target - cumulative) / mass) * binWidth
			}
			cumulative += mass
		}
		return tMax
	}

	const tLow = quantile(ENDPOINT_QUANTILE_LOW)
	const tHigh = quantile(ENDPOINT_QUANTILE_HIGH)
	const tMedian = quantile(0.5)
	const effectiveSamples = (weightSum * weightSum) / weightSquareSum
	const medianStandardError = effectiveSamples > 0
		? (tHigh - tLow) / (2 * Math.sqrt(effectiveSamples))
		: 0

	return { tLow, tHigh, tMedian, medianStandardError, weightSum }
}

// ---------------------------------------------------------------------------------------------
// Occupied-colour index: coarse OKLab hash grid over the inventory's triples
// ---------------------------------------------------------------------------------------------

type ColorGrid = Readonly<{
	size: number
	/** OKLab distance from `color` to the nearest occupied triple; `Infinity` on an empty grid. */
	nearestDistance(color: OkLab): number
	/** Every occupied triple within `radius` of `color`, sorted by (distance asc, packed asc). */
	within(color: OkLab, radius: number): readonly TripleStats[]
}>

const GRID_KEY_OFFSET = 512
const GRID_KEY_STRIDE = 1024

function gridIndex(value: number): number {
	return Math.floor(value / COLOR_GRID_CELL)
}

function gridKey(i: number, j: number, k: number): number {
	return ((i + GRID_KEY_OFFSET) * GRID_KEY_STRIDE + (j + GRID_KEY_OFFSET)) * GRID_KEY_STRIDE +
		(k + GRID_KEY_OFFSET)
}

function buildColorGrid(inventory: Inventory): ColorGrid {
	const cells = new Map<number, TripleStats[]>()
	let minI = Number.POSITIVE_INFINITY
	let maxI = Number.NEGATIVE_INFINITY
	let minJ = Number.POSITIVE_INFINITY
	let maxJ = Number.NEGATIVE_INFINITY
	let minK = Number.POSITIVE_INFINITY
	let maxK = Number.NEGATIVE_INFINITY

	for (const triple of inventory.triples.values()) {
		const i = gridIndex(triple.lab[0])
		const j = gridIndex(triple.lab[1])
		const k = gridIndex(triple.lab[2])
		const key = gridKey(i, j, k)
		const bucket = cells.get(key)
		if (bucket) bucket.push(triple)
		else cells.set(key, [triple])
		if (i < minI) minI = i
		if (i > maxI) maxI = i
		if (j < minJ) minJ = j
		if (j > maxJ) maxJ = j
		if (k < minK) minK = k
		if (k > maxK) maxK = k
	}

	const size = inventory.triples.size

	function scanCell(key: number, color: OkLab, best: number): number {
		const bucket = cells.get(key)
		if (!bucket) return best
		let current = best
		for (const triple of bucket) {
			const distance = okLabDistance(color, triple.lab)
			if (distance < current) current = distance
		}
		return current
	}

	return {
		size,
		nearestDistance(color: OkLab): number {
			if (size === 0) return Number.POSITIVE_INFINITY
			const ci = gridIndex(color[0])
			const cj = gridIndex(color[1])
			const ck = gridIndex(color[2])
			// Exact ring limit: beyond this every occupied cell has already been scanned.
			const ringLimit = Math.max(
				Math.abs(ci - minI),
				Math.abs(ci - maxI),
				Math.abs(cj - minJ),
				Math.abs(cj - maxJ),
				Math.abs(ck - minK),
				Math.abs(ck - maxK),
			)
			let best = Number.POSITIVE_INFINITY
			for (let ring = 0; ring <= ringLimit; ring++) {
				// Any cell not yet scanned sits at Chebyshev ring ≥ ring + 1, so no point in it can
				// be closer than `ring × cell`. Stop as soon as the incumbent beats that bound.
				if (best <= ring * COLOR_GRID_CELL) break
				for (let di = -ring; di <= ring; di++) {
					const onI = Math.abs(di) === ring
					for (let dj = -ring; dj <= ring; dj++) {
						const onJ = onI || Math.abs(dj) === ring
						for (let dk = -ring; dk <= ring; dk++) {
							if (!onJ && Math.abs(dk) !== ring) continue
							best = scanCell(gridKey(ci + di, cj + dj, ck + dk), color, best)
						}
					}
				}
			}
			return best
		},
		within(color: OkLab, radius: number): readonly TripleStats[] {
			if (size === 0 || !(radius > 0)) return []
			const loI = gridIndex(color[0] - radius)
			const hiI = gridIndex(color[0] + radius)
			const loJ = gridIndex(color[1] - radius)
			const hiJ = gridIndex(color[1] + radius)
			const loK = gridIndex(color[2] - radius)
			const hiK = gridIndex(color[2] + radius)
			const found: { triple: TripleStats; distance: number }[] = []
			for (let i = loI; i <= hiI; i++) {
				for (let j = loJ; j <= hiJ; j++) {
					for (let k = loK; k <= hiK; k++) {
						const bucket = cells.get(gridKey(i, j, k))
						if (!bucket) continue
						for (const triple of bucket) {
							const distance = okLabDistance(color, triple.lab)
							if (distance <= radius) found.push({ triple, distance })
						}
					}
				}
			}
			found.sort((a, b) =>
				a.distance - b.distance || a.triple.packed - b.triple.packed
			)
			return found.map((entry) => entry.triple)
		},
	}
}

// ---------------------------------------------------------------------------------------------
// Excursion
// ---------------------------------------------------------------------------------------------

type Excursion = Readonly<{ max: number; worst: OkLab; worstFraction: number }>

/** Max distance from the straight chord `from`→`to` to the nearest occupied colour. */
function chordExcursion(from: OkLab, to: OkLab, grid: ColorGrid): Excursion {
	let max = -1
	let worst: OkLab = from
	let worstFraction = 0
	for (let sample = 0; sample < CHORD_SAMPLES; sample++) {
		const fraction = sample / (CHORD_SAMPLES - 1)
		const color = mix(from, to, fraction)
		const distance = grid.nearestDistance(color)
		if (distance > max) {
			max = distance
			worst = color
			worstFraction = fraction
		}
	}
	return { max: max < 0 ? 0 : max, worst, worstFraction }
}

/** Max excursion of the two-segment polyline `from`→`middle`→`to`. */
function polylineExcursion(from: OkLab, middle: OkLab, to: OkLab, grid: ColorGrid): number {
	let max = 0
	for (const [start, end] of [[from, middle], [middle, to]] as const) {
		for (let sample = 0; sample < POLYLINE_SAMPLES_PER_SEGMENT; sample++) {
			const fraction = sample / (POLYLINE_SAMPLES_PER_SEGMENT - 1)
			const distance = grid.nearestDistance(mix(start, end, fraction))
			if (distance > max) max = distance
		}
	}
	return max
}

/**
 * Candidate middle stops: occupied triples in a neighbourhood of the worst sample. When the
 * neighbourhood holds more than the evaluation budget, the distance-sorted list is **strided**
 * rather than truncated — truncation would keep only colours hugging the worst sample and would
 * systematically exclude the far vertex of a genuinely bent path, which is exactly the colour the
 * third stop exists to find.
 */
function pickCandidates(grid: ColorGrid, worst: OkLab, radius: number): readonly TripleStats[] {
	const neighbourhood = grid.within(worst, radius)
	if (neighbourhood.length <= THIRD_STOP_CANDIDATE_LIMIT) return neighbourhood
	const stride = neighbourhood.length / THIRD_STOP_CANDIDATE_LIMIT
	const picked: TripleStats[] = []
	for (let index = 0; index < THIRD_STOP_CANDIDATE_LIMIT; index++) {
		picked.push(neighbourhood[Math.min(neighbourhood.length - 1, Math.floor(index * stride))])
	}
	return picked
}

// ---------------------------------------------------------------------------------------------
// Two-block fallback
// ---------------------------------------------------------------------------------------------

type FieldMassEntry = Readonly<{ packed: number; mass: number; triple: TripleStats }>

/** Σw (field-side mass) per distinct triple, descending, ties on packed int ascending. */
function fieldMassRanking(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): readonly FieldMassEntry[] {
	const mass = new Map<number, number>()
	const weights = fit.weights
	const packed = raster.packed
	for (let index = 0; index < packed.length; index++) {
		const weight = weights[index]
		if (!(weight > 0)) continue
		const key = packed[index]
		mass.set(key, (mass.get(key) ?? 0) + weight)
	}
	const entries: FieldMassEntry[] = []
	for (const [key, value] of mass) {
		const triple = inventory.triples.get(key)
		if (triple) entries.push({ packed: key, mass: value, triple })
	}
	entries.sort((a, b) => b.mass - a.mass || a.packed - b.packed)
	return entries
}

/**
 * SPEC decision 5's two blocks: the two highest-field-mass colours **separated by their pairwise
 * `sameColorBar`**. Background is the heavier of the two (the larger field, consistent with
 * decision 3's principle). `surface` is `null` when no second separated colour exists at all, which
 * is a one-colour image and not a two-block one.
 *
 * *v0.5: no longer exported.* It was split out and exported for `candidate.ts`, which used it for
 * decision 9's two-block rescue; that rescue has merged into the component reading (`E2_BRIEF.md`:
 * "the two-block rescue becomes a special case of the two-component reading and should merge into
 * it, not survive beside it"), so the only caller left is this module's own decision-5 fallback —
 * a *different* question (no polyline stayed on-artwork), which is why the function survives at all.
 */
function twoBlockCandidates(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): { background: TripleStats; surface: TripleStats | null } | null {
	const ranking = fieldMassRanking(fit, raster, inventory)
	if (ranking.length === 0) return null
	const first = ranking[0].triple
	const firstColor = colorFromRgb(first.rgb)
	for (let index = 1; index < ranking.length; index++) {
		const candidate = ranking[index].triple
		if (!sameColor(firstColor, colorFromRgb(candidate.rgb))) {
			return { background: first, surface: candidate }
		}
	}
	return { background: first, surface: null }
}

/** The same two blocks as OKLab targets, for `readRamp`'s own decision-5 fallback. */
function twoBlockTargets(
	blocks: { background: TripleStats; surface: TripleStats | null } | null,
	fallbackTarget: OkLab,
): { background: OkLab; surface: OkLab } {
	if (blocks === null) return { background: fallbackTarget, surface: fallbackTarget }
	return {
		background: blocks.background.lab,
		surface: (blocks.surface ?? blocks.background).lab,
	}
}

// ---------------------------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------------------------

function flatReading(
	constant: OkLab,
	direction: readonly [number, number] | null,
	orientationMargin: number,
): RampReading {
	return {
		gradientCandidate: false,
		direction,
		backgroundTarget: constant,
		surfaceTarget: constant,
		orientationMargin,
		stops: [],
		excursionMax: 0,
		thirdStopAccepted: false,
		residualExcursion: 0,
		twoBlockFallback: false,
	}
}

/**
 * Read a fitted field into the continuous ramp targets the caller will snap and publish.
 *
 * Order-0 fits, `noField` verdicts and degenerate order-1 fits (zero position coefficients, zero
 * inlier mass) all return the flat reading: one constant target, no stops, no gradient. Everything
 * else runs the full path — direction, orientation, robust ends, excursion, third stop, and the
 * two-block fallback when no polyline stays on-artwork.
 */
export function readRamp(fit: FieldFit, raster: DecodedRaster, inventory: Inventory): RampReading {
	const expectedPixels = raster.width * raster.height
	if (fit.weights.length !== expectedPixels) {
		throw new RangeError(
			`weight map has ${fit.weights.length} entries, raster has ${expectedPixels} pixels`,
		)
	}

	const constant = fit.fieldAt(0, 0)
	if (fit.noField || fit.order === 0) return flatReading(constant, null, 0)

	const axis = dominantDirection(fit.coefficients)
	if (!axis) return flatReading(constant, null, 0)

	const statistics = tStatistics(fit, raster, axis)
	if (!statistics) return flatReading(constant, axis, 0)

	const { tLow, tHigh, tMedian, medianStandardError } = statistics
	const lowEnd = fit.fieldAt(tLow * axis[0], tLow * axis[1])
	const highEnd = fit.fieldAt(tHigh * axis[0], tHigh * axis[1])

	// --- orientation (SPEC decision 3) ---------------------------------------------------------
	const lean = tMedian - (tLow + tHigh) / 2
	const orientationMargin = medianStandardError > 0 ? lean / medianStandardError : 0
	let backgroundAtHigh: boolean
	if (Math.abs(lean) <= medianStandardError) {
		// Near-tie: the darker end is background; exact tie in L breaks on the packed int.
		if (highEnd[0] !== lowEnd[0]) backgroundAtHigh = highEnd[0] < lowEnd[0]
		else backgroundAtHigh = packedOf(okLabToRgb(highEnd)) < packedOf(okLabToRgb(lowEnd))
	} else if (BACKGROUND_IS_MAJORITY_END) {
		backgroundAtHigh = lean > 0
	} else {
		backgroundAtHigh = lean < 0
	}

	const backgroundTarget = backgroundAtHigh ? highEnd : lowEnd
	const surfaceTarget = backgroundAtHigh ? lowEnd : highEnd
	// The published direction points background → surface, so that t and the stop positions agree.
	const direction: readonly [number, number] = backgroundAtHigh ? [-axis[0], -axis[1]] : axis

	// --- the forced gradient boolean (SPEC decision 2) ------------------------------------------
	// Pre-snap proxy: the 8-bit rounding of each target. The caller re-runs this on the snapped
	// ends, which is where the decision is final; two targets that already fail to separate here
	// cannot separate after a sub-bar snap, so the collapse is safe to make now.
	const backgroundColor = colorFromRgb(okLabToRgb(backgroundTarget))
	const surfaceColor = colorFromRgb(okLabToRgb(surfaceTarget))
	if (sameColor(backgroundColor, surfaceColor)) {
		return {
			gradientCandidate: false,
			direction,
			backgroundTarget,
			surfaceTarget: backgroundTarget, // collapses exactly, per decision 2
			orientationMargin,
			stops: [],
			excursionMax: 0,
			thirdStopAccepted: false,
			residualExcursion: 0,
			twoBlockFallback: false,
		}
	}

	// --- excursion (SPEC decision 5) ------------------------------------------------------------
	const grid = buildColorGrid(inventory)
	// An empty inventory carries no evidence either way; it cannot make a chord "off-artwork".
	const excursion = grid.size === 0
		? { max: 0, worst: backgroundTarget, worstFraction: 0 }
		: chordExcursion(backgroundTarget, surfaceTarget, grid)

	const twoStops: readonly StopTarget[] = [
		{ target: backgroundTarget, position: 0 },
		{ target: surfaceTarget, position: 1 },
	]

	if (excursion.max <= POOLED_SAME_COLOR_BAR) {
		return {
			gradientCandidate: true,
			direction,
			backgroundTarget,
			surfaceTarget,
			orientationMargin,
			stops: twoStops,
			excursionMax: excursion.max,
			thirdStopAccepted: false,
			residualExcursion: excursion.max,
			twoBlockFallback: false,
		}
	}

	// --- third stop ------------------------------------------------------------------------------
	const radius = Math.max(
		THIRD_STOP_RADIUS_FACTOR * excursion.max,
		3 * POOLED_SAME_COLOR_BAR,
	)
	let best: { target: OkLab; position: number; excursion: number; turn: number; packed: number } | null =
		null
	for (const candidate of pickCandidates(grid, excursion.worst, radius)) {
		const position = projectionFraction(backgroundTarget, surfaceTarget, candidate.lab)
		// Monotone in t: the middle stop must project strictly between the two ends.
		if (!(position > 0 && position < 1)) continue
		const candidateExcursion = polylineExcursion(
			backgroundTarget,
			candidate.lab,
			surfaceTarget,
			grid,
		)
		const turn = turningAngle(backgroundTarget, candidate.lab, surfaceTarget)
		if (
			best === null ||
			candidateExcursion < best.excursion ||
			(candidateExcursion === best.excursion &&
				(turn < best.turn || (turn === best.turn && candidate.packed < best.packed)))
		) {
			best = {
				target: candidate.lab,
				position,
				excursion: candidateExcursion,
				turn,
				packed: candidate.packed,
			}
		}
	}

	const accepted = best !== null &&
		(best.excursion < POOLED_SAME_COLOR_BAR ||
			best.excursion * THIRD_STOP_REDUCTION_FACTOR <= excursion.max)

	if (accepted && best) {
		return {
			gradientCandidate: true,
			direction,
			backgroundTarget,
			surfaceTarget,
			orientationMargin,
			stops: [
				{ target: backgroundTarget, position: 0 },
				{ target: best.target, position: best.position },
				{ target: surfaceTarget, position: 1 },
			],
			excursionMax: excursion.max,
			thirdStopAccepted: true,
			residualExcursion: best.excursion,
			twoBlockFallback: false,
		}
	}

	// --- no polyline fixed it: two-block fallback (SPEC decision 5) --------------------------------
	const blocks = twoBlockTargets(twoBlockCandidates(fit, raster, inventory), backgroundTarget)
	return {
		gradientCandidate: false,
		direction,
		backgroundTarget: blocks.background,
		surfaceTarget: blocks.surface,
		orientationMargin,
		stops: [],
		excursionMax: excursion.max,
		thirdStopAccepted: false,
		residualExcursion: excursion.max,
		twoBlockFallback: true,
	}
}

// ---------------------------------------------------------------------------------------------
// Post-snap re-measurement (added for W-INTEG, wave 2)
// ---------------------------------------------------------------------------------------------

/**
 * **Excursion of an already-discrete path**, for the caller to re-run the decision 5 test on the
 * *snapped* ends rather than on the continuous targets.
 *
 * Header note 3 states the obligation this discharges: the excursion this module measures runs on
 * the endpoint targets, because it is handed the fit and not the ledger's discrete choice, and
 * "remains the caller's obligation to re-check after snapping". `candidate.ts` is the caller, and
 * this is the same measurement with the same sample budgets so the two numbers are comparable —
 * a re-implementation there would have been a second definition of the quantity.
 *
 * Two or three points; anything else is a caller bug rather than a shape this prototype publishes.
 */
export function pathExcursion(inventory: Inventory, path: readonly OkLab[]): number {
	if (path.length !== 2 && path.length !== 3) {
		throw new RangeError(`pathExcursion takes 2 or 3 points, got ${path.length}`)
	}
	const grid = buildColorGrid(inventory)
	// An empty inventory carries no evidence either way — same reading as `readRamp`.
	if (grid.size === 0) return 0
	return path.length === 2
		? chordExcursion(path[0], path[1], grid).max
		: polylineExcursion(path[0], path[1], path[2], grid)
}

/**
 * **The highest-field-mass occupied colour**, for SPEC decision 9's declared retreat.
 *
 * `noField` says the fitted surface is not a description of this image, so the retreat may not read
 * an endpoint off it. What it reads instead is the colour the fit still called field most of:
 * `Σw` per exact triple, descending, ties on the packed integer. `null` only when nothing carried
 * positive weight. The caller snaps it, and the snap's bar-neighbourhood mass maximisation is what
 * makes the published colour "agglomerated" in decision 9's sense.
 */
export function highestFieldMassTriple(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): TripleStats | null {
	const ranking = fieldMassRanking(fit, raster, inventory)
	return ranking.length === 0 ? null : ranking[0].triple
}

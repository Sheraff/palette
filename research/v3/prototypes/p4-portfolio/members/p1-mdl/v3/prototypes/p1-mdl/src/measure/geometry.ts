/**
 * The three field geometries, all closed form, no iteration.
 *
 * Arm A′ §2.1: *"a least-squares plane fit of each OKLab channel against position gives the linear
 * direction; the isotropic component of the quadratic form gives a radial centre; the residual
 * against angle around that centre gives a conic. Three geometric parameterisations, no search, no
 * iteration, from statistics that are integrals over every pixel in the image."* Arm A §2.1 says the
 * same thing about the linear family from the other side: *"the ramp axis is not searched"* — it is
 * the leading canonical correlation between normalised position and OKLab colour, a 2×3 problem with
 * a closed form.
 *
 * All three are **fitted, not selected**. Which one the field actually uses is the energy's decision,
 * taken in the same nats as flat and two-flat; this module hands over all three with their explained
 * variances and takes no view.
 *
 * Everything the linear and radial fits need comes from the per-triple table's second-order moments
 * plus the analytic grid moments in `grid-moments.ts`. Only the conic needs a pass over pixels, and
 * it needs one for a real reason: the angle around a centre is not a polynomial in position, so no
 * finite set of moments can supply it.
 */

import { RADIAL_CENTRE_MAX_OUTSET, RADIAL_CURVATURE_EPSILON } from "./constants.ts"
import type { GridMoments } from "./grid-moments.ts"
import { leadingEigenpair2x2, solveLinearSystem } from "./linalg.ts"
import type { TripleTable } from "./triples.ts"

/** One OKLab channel's fit under a geometry's design. */
export type ChannelFit = Readonly<{
	/** Coefficients in the design's own order; see each geometry's doc for what they mean. */
	coefficients: readonly number[]
	/** Fraction of the channel's spatial variance the design explains. 1 for a constant channel. */
	rSquared: number
}>

/** `c ≈ β₀ + β₁·x̂ + β₂·ŷ`, per channel, plus the axis those gradients agree on. */
export type LinearGeometry = Readonly<{
	kind: "linear"
	degenerate: boolean
	/** L, a, b in that order. `null` when degenerate. */
	channels: readonly ChannelFit[] | null
	/** Unit direction in normalised position, sign-fixed (see `fixAxisSign`). `null` when degenerate. */
	axis: readonly [number, number] | null
	/** `atan2(axis.y, axis.x)`, radians. */
	axisAngleRadians: number | null
	/** Eigenvalues of GᵀG: how much colour change the leading axis carries, and the orthogonal one. */
	leadingStrength: number | null
	orthogonalStrength: number | null
	/** The normalised-position origin `t` is measured from — the image's spatial centroid. */
	origin: readonly [number, number]
	/** Range of the raw projection over the image, before normalising `t` to [0,1]. */
	tMin: number
	tMax: number
}>

/** `c ≈ β₀ + β₁·x̂ + β₂·ŷ + β₃·(x̂² + ŷ²)`, per channel; the centre falls out of β₁, β₂, β₃. */
export type RadialGeometry = Readonly<{
	kind: "radial"
	degenerate: boolean
	channels: readonly ChannelFit[] | null
	/** Fitted centre in normalised position. */
	centre: readonly [number, number]
	/** False when no channel had usable isotropic curvature and the centre fell back to the centroid. */
	centreFromCurvature: boolean
	/** Range of `‖p̂ − centre‖` over the image, before normalising `t` to [0,1]. */
	tMin: number
	tMax: number
}>

/** `c ≈ γ₀ + γ₁·cos θ + γ₂·sin θ` around the radial centre. */
export type ConicGeometry = Readonly<{
	kind: "conic"
	degenerate: boolean
	channels: readonly ChannelFit[] | null
	/** The centre angles are measured around — the radial fit's centre, reused. */
	centre: readonly [number, number]
	/** `hypot(γ₁, γ₂)` per channel: how much colour the first harmonic carries. */
	amplitude: readonly number[] | null
	/** `atan2(γ₂, γ₁)` per channel, radians. */
	phase: readonly number[] | null
	/** `t` is the angle mapped to [0,1]; the raw range is the full circle by construction. */
	tMin: number
	tMax: number
}>

export type Geometries = Readonly<{
	linear: LinearGeometry
	radial: RadialGeometry
	conic: ConicGeometry
}>

/** Colour sums against position, assembled once from the per-triple table. */
type ColorSums = Readonly<{
	/** Σ c, Σ c·x̂, Σ c·ŷ, Σ c·(x̂²+ŷ²), Σ c², per channel. */
	sum: Float64Array
	sumX: Float64Array
	sumY: Float64Array
	sumQ: Float64Array
	sumSquared: Float64Array
}>

function colorSums(table: TripleTable, shortEdge: number): ColorSums {
	const sum = new Float64Array(3)
	const sumX = new Float64Array(3)
	const sumY = new Float64Array(3)
	const sumQ = new Float64Array(3)
	const sumSquared = new Float64Array(3)
	for (let row = 0; row < table.colorCount; row += 1) {
		const count = table.counts[row]
		const momentX = table.sumX[row] / shortEdge
		const momentY = table.sumY[row] / shortEdge
		const momentQ = (table.sumXX[row] + table.sumYY[row]) / (shortEdge * shortEdge)
		for (let channel = 0; channel < 3; channel += 1) {
			const value = table.lab[row * 3 + channel]
			sum[channel] += value * count
			sumX[channel] += value * momentX
			sumY[channel] += value * momentY
			sumQ[channel] += value * momentQ
			sumSquared[channel] += value * value * count
		}
	}
	return { sum, sumX, sumY, sumQ, sumSquared }
}

/**
 * Least squares from pre-assembled normal equations, plus the r² that goes with them.
 *
 * `SSres = yᵀy − β̂ᵀ(Xᵀy)` is the standard identity for the normal-equation solution, so no residual
 * pass over pixels is needed. A channel with zero spatial variance is reported as `rSquared = 1`: a
 * constant is exactly explained by the intercept, and calling that 0/0 would put a NaN into the
 * measurement.
 */
function fitChannel(
	normalMatrix: readonly number[][],
	crossProducts: readonly number[],
	sumOfSquares: number,
	sum: number,
	pixelCount: number,
): ChannelFit | null {
	const coefficients = solveLinearSystem(normalMatrix, crossProducts)
	if (coefficients === null) return null
	let explained = 0
	for (let index = 0; index < coefficients.length; index += 1) {
		explained += coefficients[index] * crossProducts[index]
	}
	const residual = sumOfSquares - explained
	const total = sumOfSquares - (sum * sum) / pixelCount
	const rSquared = total <= 0 ? 1 : 1 - residual / total
	return { coefficients, rSquared }
}

/**
 * Fix the axis's sign so the same image always reports the same direction.
 *
 * Convention, named as such: the axis points the way colour *increases*, tested on lightness first,
 * then a, then b, and falling back to the geometric quadrant when the colour gradient is exactly
 * zero. This is a measurement-side convention only; the renderer's 135° orientation rule
 * (`DESIGN.md` decision 5) belongs to the emitter and is applied there.
 */
function fixAxisSign(
	axis: readonly [number, number],
	gradients: readonly (readonly [number, number])[],
): readonly [number, number] {
	for (const gradient of gradients) {
		const projection = gradient[0] * axis[0] + gradient[1] * axis[1]
		if (projection > 0) return axis
		if (projection < 0) return [-axis[0], -axis[1]]
	}
	if (axis[0] > 0) return axis
	if (axis[0] < 0) return [-axis[0], -axis[1]]
	return axis[1] < 0 ? [-axis[0], -axis[1]] : axis
}

function cornerExtremes(
	moments: GridMoments,
	evaluate: (x: number, y: number) => number,
): { min: number; max: number } {
	const shortEdge = moments.shortEdge
	const corners: [number, number][] = [
		[0, 0],
		[(moments.width - 1) / shortEdge, 0],
		[0, (moments.height - 1) / shortEdge],
		[(moments.width - 1) / shortEdge, (moments.height - 1) / shortEdge],
	]
	let min = Number.POSITIVE_INFINITY
	let max = Number.NEGATIVE_INFINITY
	for (const [x, y] of corners) {
		const value = evaluate(x, y)
		if (value < min) min = value
		if (value > max) max = value
	}
	return { min, max }
}

function fitLinear(moments: GridMoments, sums: ColorSums): LinearGeometry {
	const pixelCount = moments.pixelCount
	const normalMatrix = [
		[pixelCount, moments.moment(1, 0), moments.moment(0, 1)],
		[moments.moment(1, 0), moments.moment(2, 0), moments.moment(1, 1)],
		[moments.moment(0, 1), moments.moment(1, 1), moments.moment(0, 2)],
	]
	const origin: readonly [number, number] = [
		moments.moment(1, 0) / pixelCount,
		moments.moment(0, 1) / pixelCount,
	]

	const channels: ChannelFit[] = []
	const gradients: (readonly [number, number])[] = []
	for (let channel = 0; channel < 3; channel += 1) {
		const fit = fitChannel(
			normalMatrix,
			[sums.sum[channel], sums.sumX[channel], sums.sumY[channel]],
			sums.sumSquared[channel],
			sums.sum[channel],
			pixelCount,
		)
		if (fit === null) {
			return {
				kind: "linear",
				degenerate: true,
				channels: null,
				axis: null,
				axisAngleRadians: null,
				leadingStrength: null,
				orthogonalStrength: null,
				origin,
				tMin: 0,
				tMax: 0,
			}
		}
		channels.push(fit)
		gradients.push([fit.coefficients[1], fit.coefficients[2]])
	}

	// GᵀG, with G the 3×2 stack of per-channel position gradients. Its leading eigenvector is the
	// direction in which the image's colour changes fastest — the canonical correlation, in closed form.
	let gxx = 0
	let gxy = 0
	let gyy = 0
	for (const [gx, gy] of gradients) {
		gxx += gx * gx
		gxy += gx * gy
		gyy += gy * gy
	}
	const eigen = leadingEigenpair2x2(gxx, gxy, gyy)
	const axis = fixAxisSign(eigen.eigenvector, gradients)

	const extremes = cornerExtremes(
		moments,
		(x, y) => axis[0] * (x - origin[0]) + axis[1] * (y - origin[1]),
	)

	return {
		kind: "linear",
		degenerate: false,
		channels,
		axis,
		axisAngleRadians: Math.atan2(axis[1], axis[0]),
		leadingStrength: eigen.eigenvalue,
		orthogonalStrength: eigen.secondEigenvalue,
		origin,
		tMin: extremes.min,
		tMax: extremes.max,
	}
}

function fitRadial(moments: GridMoments, sums: ColorSums): RadialGeometry {
	const pixelCount = moments.pixelCount
	const m10 = moments.moment(1, 0)
	const m01 = moments.moment(0, 1)
	const m20 = moments.moment(2, 0)
	const m11 = moments.moment(1, 1)
	const m02 = moments.moment(0, 2)
	const mq = m20 + m02
	const mxq = moments.moment(3, 0) + moments.moment(1, 2)
	const myq = moments.moment(2, 1) + moments.moment(0, 3)
	const mqq = moments.moment(4, 0) + 2 * moments.moment(2, 2) + moments.moment(0, 4)
	const centroid: readonly [number, number] = [m10 / pixelCount, m01 / pixelCount]

	const normalMatrix = [
		[pixelCount, m10, m01, mq],
		[m10, m20, m11, mxq],
		[m01, m11, m02, myq],
		[mq, mxq, myq, mqq],
	]

	const channels: ChannelFit[] = []
	for (let channel = 0; channel < 3; channel += 1) {
		const fit = fitChannel(
			normalMatrix,
			[sums.sum[channel], sums.sumX[channel], sums.sumY[channel], sums.sumQ[channel]],
			sums.sumSquared[channel],
			sums.sum[channel],
			pixelCount,
		)
		if (fit === null) {
			return {
				kind: "radial",
				degenerate: true,
				channels: null,
				centre: centroid,
				centreFromCurvature: false,
				tMin: 0,
				tMax: 0,
			}
		}
		channels.push(fit)
	}

	// A channel modelled as β₀ + β₁x + β₂y + β₃(x²+y²) is β₃‖p − m‖² + constant with
	// m = (−β₁/2β₃, −β₂/2β₃). Each channel names a centre; they are combined weighted by β₃², so a
	// channel with a strong isotropic curvature dominates one with none. Stated as a choice: sharing
	// one centre across channels *inside* the fit would couple the three problems nonlinearly and cost
	// the closed form, which arm A′ §2.1 is explicit about not paying for.
	let weightTotal = 0
	let centreX = 0
	let centreY = 0
	for (const fit of channels) {
		const curvature = fit.coefficients[3]
		if (Math.abs(curvature) < RADIAL_CURVATURE_EPSILON) continue
		const weight = curvature * curvature
		weightTotal += weight
		centreX += weight * (-fit.coefficients[1] / (2 * curvature))
		centreY += weight * (-fit.coefficients[2] / (2 * curvature))
	}
	const shortEdge = moments.shortEdge
	const rightEdge = (moments.width - 1) / shortEdge
	const bottomEdge = (moments.height - 1) / shortEdge
	const fitted: readonly [number, number] =
		weightTotal > 0 ? [centreX / weightTotal, centreY / weightTotal] : centroid
	// A centre that lands far outside the frame is the isotropic term reporting that it found nothing;
	// see `RADIAL_CENTRE_MAX_OUTSET`. Falling back to the centroid keeps the conic — which measures
	// angles around this point — from being built on a runaway.
	const centreIsUsable =
		weightTotal > 0 &&
		fitted[0] >= -RADIAL_CENTRE_MAX_OUTSET &&
		fitted[0] <= rightEdge + RADIAL_CENTRE_MAX_OUTSET &&
		fitted[1] >= -RADIAL_CENTRE_MAX_OUTSET &&
		fitted[1] <= bottomEdge + RADIAL_CENTRE_MAX_OUTSET
	const centreFromCurvature = centreIsUsable
	const centre: readonly [number, number] = centreIsUsable ? fitted : centroid

	const extremes = cornerExtremes(moments, (x, y) => Math.hypot(x - centre[0], y - centre[1]))
	// The nearest point of the image to the centre is the centre clamped into the image rectangle, so
	// the minimum is exact rather than a corner approximation — it is 0 whenever the centre is inside.
	const clampedX = Math.min(Math.max(centre[0], 0), rightEdge)
	const clampedY = Math.min(Math.max(centre[1], 0), bottomEdge)
	const tMin = Math.hypot(clampedX - centre[0], clampedY - centre[1])

	return {
		kind: "radial",
		degenerate: false,
		channels,
		centre,
		centreFromCurvature,
		tMin,
		tMax: extremes.max,
	}
}

/**
 * The conic fit — the one geometry that needs pixels rather than moments.
 *
 * `θ(p) = atan2(ŷ − c_y, x̂ − c_x)` is not a polynomial in position, so it is accumulated directly.
 * The pass is over pixels but the work per pixel is one `atan2` and eleven multiply-adds; the colour
 * comes from the per-triple table through the pixel's row index, so no colour is converted twice.
 */
function fitConic(
	table: TripleTable,
	pixelTripleIndex: Int32Array,
	moments: GridMoments,
	centre: readonly [number, number],
): ConicGeometry {
	const { width, height, shortEdge, pixelCount } = moments

	let sumCos = 0
	let sumSin = 0
	let sumCosCos = 0
	let sumCosSin = 0
	let sumSinSin = 0
	const sumColor = new Float64Array(3)
	const sumColorSquared = new Float64Array(3)
	const sumColorCos = new Float64Array(3)
	const sumColorSin = new Float64Array(3)

	for (let y = 0; y < height; y += 1) {
		const normalisedY = y / shortEdge - centre[1]
		for (let x = 0; x < width; x += 1) {
			const angle = Math.atan2(normalisedY, x / shortEdge - centre[0])
			const cosine = Math.cos(angle)
			const sine = Math.sin(angle)
			sumCos += cosine
			sumSin += sine
			sumCosCos += cosine * cosine
			sumCosSin += cosine * sine
			sumSinSin += sine * sine
			const base = pixelTripleIndex[y * width + x] * 3
			for (let channel = 0; channel < 3; channel += 1) {
				const value = table.lab[base + channel]
				sumColor[channel] += value
				sumColorSquared[channel] += value * value
				sumColorCos[channel] += value * cosine
				sumColorSin[channel] += value * sine
			}
		}
	}

	const normalMatrix = [
		[pixelCount, sumCos, sumSin],
		[sumCos, sumCosCos, sumCosSin],
		[sumSin, sumCosSin, sumSinSin],
	]

	const channels: ChannelFit[] = []
	const amplitude: number[] = []
	const phase: number[] = []
	for (let channel = 0; channel < 3; channel += 1) {
		const fit = fitChannel(
			normalMatrix,
			[sumColor[channel], sumColorCos[channel], sumColorSin[channel]],
			sumColorSquared[channel],
			sumColor[channel],
			pixelCount,
		)
		if (fit === null) {
			return {
				kind: "conic",
				degenerate: true,
				channels: null,
				centre,
				amplitude: null,
				phase: null,
				tMin: 0,
				tMax: 1,
			}
		}
		channels.push(fit)
		amplitude.push(Math.hypot(fit.coefficients[1], fit.coefficients[2]))
		phase.push(Math.atan2(fit.coefficients[2], fit.coefficients[1]))
	}

	return {
		kind: "conic",
		degenerate: false,
		channels,
		centre,
		amplitude,
		phase,
		// The conic parameter is the angle mapped to [0,1] by construction, so its range is fixed.
		tMin: 0,
		tMax: 1,
	}
}

export function fitGeometries(
	table: TripleTable,
	pixelTripleIndex: Int32Array,
	moments: GridMoments,
): Geometries {
	const sums = colorSums(table, moments.shortEdge)
	// Both take only the assembled sums: the linear and radial fits never touch the table again,
	// which is the concrete form of "from statistics that are integrals over every pixel".
	const linear = fitLinear(moments, sums)
	const radial = fitRadial(moments, sums)
	const conic = fitConic(table, pixelTripleIndex, moments, radial.centre)
	return { linear, radial, conic }
}

/**
 * The three position parameters, each mapped to [0,1].
 *
 * `t` is a function of position alone — the geometry's parameterisation of the image plane — and is
 * what the (t, colour) joint is binned against. A degenerate geometry reports `t = 0` everywhere,
 * which puts its whole joint in one bin and says exactly that.
 */
export function makeTFunctions(
	geometries: Geometries,
	shortEdge: number,
): Readonly<Record<"linear" | "radial" | "conic", (x: number, y: number) => number>> {
	const { linear, radial } = geometries

	const linearSpan = linear.tMax - linear.tMin
	const linearT =
		linear.degenerate || linear.axis === null || linearSpan <= 0
			? () => 0
			: (x: number, y: number) => {
					const projection =
						(linear.axis as readonly [number, number])[0] * (x / shortEdge - linear.origin[0]) +
						(linear.axis as readonly [number, number])[1] * (y / shortEdge - linear.origin[1])
					const value = (projection - linear.tMin) / linearSpan
					return value < 0 ? 0 : value > 1 ? 1 : value
				}

	const radialSpan = radial.tMax - radial.tMin
	const radialT =
		radial.degenerate || radialSpan <= 0
			? () => 0
			: (x: number, y: number) => {
					const distance = Math.hypot(x / shortEdge - radial.centre[0], y / shortEdge - radial.centre[1])
					const value = (distance - radial.tMin) / radialSpan
					return value < 0 ? 0 : value > 1 ? 1 : value
				}

	const centre = geometries.conic.centre
	const conicT = (x: number, y: number) => {
		const angle = Math.atan2(y / shortEdge - centre[1], x / shortEdge - centre[0])
		const value = (angle + Math.PI) / (2 * Math.PI)
		return value < 0 ? 0 : value > 1 ? 1 : value
	}

	return { linear: linearT, radial: radialT, conic: conicT }
}

/**
 * The currency — `L(member palette | image)`, in bits (SPEC §2).
 *
 * arm-c′ prices rival *field descriptions*. P4's members are whole pipelines, so the currency is
 * applied one level up: **each member's published palette is read as a compact description of the
 * image, and priced.** Two terms, and neither of them has a coefficient in it.
 *
 * ## 1. `L(palette)` — the schema price
 *
 * Derived from the output contract's own structure, by one rule applied uniformly:
 *
 *  - **every published real-valued colour coordinate costs `½·log₂(N)`**, arm-c′ §2.3a's parameter
 *    charge, with `N` the number of lattice cells (never the pixel count: neighbouring pixels are
 *    not independent evidence, and pricing them as if they were would make the winner depend on
 *    rendition size);
 *  - **every discrete field of the schema costs `log₂` of its own cardinality**, read off the
 *    contract: a boolean is `log₂ 2`, the stop count is `log₂` of the number of stop counts
 *    `MIN_GRADIENT_STOPS…MAX_GRADIENT_STOPS` admits.
 *
 * Everything else follows. A colour is `OKLAB_DIMENSIONS` coordinates. The published colours are
 * the roles that did *not* collapse (a collapse is exact equality, so a collapsed role publishes no
 * second colour) plus the gradient's interior stops (the two ends are the field roles, by the
 * contract's own endpoint ruling, so they are already counted). Hence **a collapse makes a palette
 * cheaper and a stop makes it dearer**, which is SPEC §2's "collapses make palettes cheaper, as they
 * should" arrived at rather than asserted.
 *
 * No number in that derivation was chosen. `ROLE_NAMES.length`, the two `CollapseFlags` fields,
 * `MIN_GRADIENT_STOPS`, `MAX_GRADIENT_STOPS` and `EscapeRole`'s two options are all imported from
 * `src/contract`; `N` comes from the lattice; the `½` is the MDL charge itself.
 *
 * ## 2. Residual bits
 *
 * The palette's *implied field* is reconstructed and the image is priced against it:
 *
 *  - `gradient: null` → the field is **flat at the background colour**.
 *  - a gradient → **OKLab interpolation along its published stops**, with the axis **direction
 *    fitted per image by residual minimisation** — a coarse angle sweep at the lattice's own angular
 *    resolution, then a ternary refine. Derived, not chosen: the sweep's step is the angle at which
 *    the isolines move by half a cell across the frame's diagonal, and the refine's iteration count
 *    is set by machine epsilon.
 *
 *    **The published `GradientGeometry` is deliberately not read**, and this is an F2 decision, not
 *    an oversight. It is not absent: of the twenty-one gradients in the pinned M1 runs, seventeen
 *    carry a `linear` geometry with an `angleDegrees` (all of `p3-fields`' seven and all of
 *    `p5-fieldfit`' ten; none of `p2-tree`'s four or `p1-mdl`'s one). Consuming it would be exactly
 *    the failure SPEC §3's F2 names — *"anything a member brings that the currency consumes"* — and
 *    it would price two members' palettes on a number the other two never supply. Fitting the axis
 *    the same way for every member is what keeps the currency member-independent; a member that
 *    published a good angle simply finds the fit agrees with it.
 *  - pixels **within the contract's same-colour bar of the foreground or accent role colour** are
 *    explained at **zero marginal residual** — their price is already in `L(palette)`, which is what
 *    publishing a role colour buys.
 *  - everything left over is priced as negative log-likelihood at scale σ, **over lattice cells**.
 *
 * ### What "over lattice cells" means exactly, and where the origin is
 *
 * Cell `k` contributes its count-weighted **mean squared residual** `M_k` — explained pixels
 * entering as exact zeros — priced at `M_k / (2σ² ln2)` bits. Two properties are the reason for that
 * shape:
 *
 *  - **It is the Gaussian NLL measured from the perfectly-explained origin.** A cell whose pixels
 *    all sit on the implied field costs nothing; the additive constant that a differential entropy
 *    would carry is the same for every member on the same image and would cancel out of every
 *    comparison, so it is not carried at all. That removes the one place a quantisation width could
 *    have entered as a free number.
 *  - **It is monotone in explanation.** Explaining one more pixel removes a non-negative term and can
 *    only make a palette cheaper, which is what makes "the description that explains more, costs
 *    less" a property of the arithmetic rather than a hope. Averaging *within* a cell (rather than
 *    summing) is what keeps the price free of the rendition's pixel count.
 */

import {
	MAX_GRADIENT_STOPS,
	MIN_GRADIENT_STOPS,
	ROLE_NAMES,
	colorDistance,
	colorFromRgb,
	okLabFromColor,
	sameColorBar,
} from "../../../src/contract/index.ts"
import type { Palette, PaletteColor } from "../../../src/contract/types.ts"

import {
	BOOLEAN_CARDINALITY,
	CELL_CENTRE_FRACTION,
	FULL_TURN_RADIANS,
	GAUSSIAN_EXPONENT_DENOMINATOR,
	GRADIENT_STOP_COUNT_OPTIONS,
	MDL_PARAMETER_CHARGE_DENOMINATOR,
	OKLAB_DIMENSIONS,
	SQUARE_CROSS_TERM_FACTOR,
	TERNARY_PROBES,
	TERNARY_SECTIONS,
	UNIT_SQUARE_DIAGONAL,
} from "./constants.ts"
import { cellIndexOf, packTriple } from "./substrate.ts"
import type { DecodedImage, ImpliedField, MemberPrice, SchemaPrice, Substrate } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// L(palette) — the schema price
// ---------------------------------------------------------------------------------------------

/** The MDL charge for one real-valued parameter against N observations: ½·log₂(N). */
function parameterCharge(cellCount: number): number {
	return Math.log2(cellCount) / MDL_PARAMETER_CHARGE_DENOMINATOR
}

/**
 * `L(palette)` — the schema-derived price, itemised.
 *
 * `cellCount` is `N`, the lattice's cell count. Nothing about the member reaches this function: it
 * sees a `Palette` and an integer.
 */
export function schemaPrice(palette: Palette, cellCount: number): SchemaPrice {
	const charge = parameterCharge(cellCount)
	const items: { field: string; cardinality: number | null; bits: number }[] = []

	const collapseFlags = Object.values(palette.collapse)
	const collapsedCount = collapseFlags.filter((flag) => flag).length
	const interiorStops =
		palette.gradient === null ? 0 : palette.gradient.stops.length - MIN_GRADIENT_STOPS
	const publishedColors = ROLE_NAMES.length - collapsedCount + interiorStops
	const colorBits = publishedColors * OKLAB_DIMENSIONS * charge
	items.push({
		field: `published colours (${ROLE_NAMES.length} roles − ${collapsedCount} collapsed + ${interiorStops} interior stops)`,
		cardinality: null,
		bits: colorBits,
	})

	let discreteBits = 0
	const discrete = (field: string, cardinality: number): void => {
		const bits = Math.log2(cardinality)
		discreteBits += bits
		items.push({ field, cardinality, bits })
	}

	discrete("gradient boolean", BOOLEAN_CARDINALITY)
	for (const [index] of collapseFlags.entries()) {
		discrete(`collapse flag ${index}`, BOOLEAN_CARDINALITY)
	}
	if (palette.gradient !== null) {
		discrete(
			`stop count (${MIN_GRADIENT_STOPS}..${MAX_GRADIENT_STOPS})`,
			GRADIENT_STOP_COUNT_OPTIONS.length,
		)
	}
	const escape = palette.escape ?? null
	discrete("escape present", BOOLEAN_CARDINALITY)
	if (escape !== null) {
		// `EscapeRole` is "background" | "foreground" — two options, from the contract's own type.
		discrete("escape role", BOOLEAN_CARDINALITY)
	}

	return { bits: colorBits + discreteBits, publishedColors, colorBits, discreteBits, items }
}

// ---------------------------------------------------------------------------------------------
// The implied field
// ---------------------------------------------------------------------------------------------

type Stop = { position: number; lab: readonly [number, number, number] }

function stopsOf(palette: Palette): Stop[] {
	if (palette.gradient === null) return []
	return palette.gradient.stops.map((stop) => ({
		position: stop.position,
		lab: okLabFromColor(stop.color),
	}))
}

/** OKLab interpolation along the published stops, at path parameter `t`. */
export function colorAlongStops(stops: readonly Stop[], t: number): [number, number, number] {
	const first = stops[0]!
	const last = stops[stops.length - 1]!
	if (t <= first.position) return [...first.lab]
	if (t >= last.position) return [...last.lab]
	for (let index = 1; index < stops.length; index += 1) {
		const previous = stops[index - 1]!
		const current = stops[index]!
		if (t <= current.position) {
			const span = current.position - previous.position
			const share = span === 0 ? 0 : (t - previous.position) / span
			return [
				previous.lab[0] + share * (current.lab[0] - previous.lab[0]),
				previous.lab[1] + share * (current.lab[1] - previous.lab[1]),
				previous.lab[2] + share * (current.lab[2] - previous.lab[2]),
			]
		}
	}
	return [...last.lab]
}

/**
 * The path parameter at a normalised point, for an axis at `angle`.
 *
 * The projection is normalised over the unit square's own extent along that axis, so `t` runs the
 * full 0..1 across the frame whatever the angle — which is what makes the published stops' positions
 * mean the same thing in every direction.
 */
function pathParameter(u: number, v: number, cosine: number, sine: number): number {
	const low = Math.min(0, cosine) + Math.min(0, sine)
	const high = Math.max(0, cosine) + Math.max(0, sine)
	const span = high - low
	return span === 0 ? 0 : (u * cosine + v * sine - low) / span
}

/**
 * How many angles the coarse sweep evaluates, at lattice resolution C.
 *
 * Derived, not chosen. One cell is `1/C` wide; the frame's longest extent is its diagonal. An
 * angular error `δ` displaces an isoline by at most `(diagonal/2)·δ`, so requiring that displacement
 * to stay under half a cell gives `δ < 1/(√2·C)`, and the sweep covers a full turn at that step.
 * Below this the sweep is resolving structure the lattice cannot represent; above it, it can miss a
 * fit the lattice can see.
 */
export function coarseAngleCount(resolution: number): number {
	return Math.ceil(FULL_TURN_RADIANS * UNIT_SQUARE_DIAGONAL * resolution)
}

/** Ternary-section iterations needed to shrink a bracket to machine precision. */
function ternaryIterations(): number {
	return Math.ceil(Math.log(Number.EPSILON) / Math.log(TERNARY_PROBES / TERNARY_SECTIONS))
}

// ---------------------------------------------------------------------------------------------
// Residual bits
// ---------------------------------------------------------------------------------------------

/**
 * Which pixels the palette explains at zero marginal residual: those within the contract's own
 * same-colour bar of the foreground or the accent role colour.
 *
 * The bar is `sameColorBar()` — the calibrated *per-pair* bar, which is `match.ts`'s stated rule for
 * any per-pair judgement, and SPEC §2's "the contract same-colour bar". Nothing is restated here.
 * The test runs once per *distinct* triple (the exact colour census), not once per pixel.
 */
export function explainedMask(image: DecodedImage, palette: Palette): { mask: Uint8Array; fraction: number } {
	const targets: PaletteColor[] = [palette.roles.foreground]
	if (!palette.collapse.accentCollapsed) targets.push(palette.roles.accent)
	const pixelCount = image.width * image.height
	const mask = new Uint8Array(pixelCount)
	const decided = new Map<number, boolean>()
	let explained = 0
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const base = pixel * OKLAB_DIMENSIONS
		const packed = packTriple(image.rgb[base]!, image.rgb[base + 1]!, image.rgb[base + 2]!)
		let verdict = decided.get(packed)
		if (verdict === undefined) {
			const color = colorFromRgb([image.rgb[base]!, image.rgb[base + 1]!, image.rgb[base + 2]!])
			verdict = targets.some((target) => colorDistance(color, target) < sameColorBar(color, target))
			decided.set(packed, verdict)
		}
		if (verdict) {
			mask[pixel] = 1
			explained += 1
		}
	}
	return { mask, fraction: pixelCount === 0 ? 0 : explained / pixelCount }
}

/**
 * Per-cell statistics restricted to the *unexplained* pixels, normalised by the cell's **total**
 * pixel count.
 *
 * `meanSquare − 2·f·mean + unexplainedShare·‖f‖²` is then the cell's mean squared residual for any
 * field value `f`, computable without revisiting a pixel — which is what lets the angle sweep run
 * over `C²` cells instead of over the frame.
 */
function restrictedCellStats(
	image: DecodedImage,
	substrate: Substrate,
	mask: Uint8Array,
): { meanSquare: Float64Array; mean: Float64Array; unexplainedShare: Float64Array } {
	const { resolution, cellCount, counts } = substrate
	const meanSquare = new Float64Array(cellCount)
	const mean = new Float64Array(cellCount * OKLAB_DIMENSIONS)
	const unexplainedShare = new Float64Array(cellCount)
	const { width, height, lab } = image

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x
			if (mask[pixel] === 1) continue
			const cell = cellIndexOf(x, y, width, height, resolution)
			const source = pixel * OKLAB_DIMENSIONS
			const base = cell * OKLAB_DIMENSIONS
			let squared = 0
			for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
				const value = lab[source + coordinate]!
				mean[base + coordinate] += value
				squared += value * value
			}
			meanSquare[cell] += squared
			unexplainedShare[cell] += 1
		}
	}
	for (let cell = 0; cell < cellCount; cell += 1) {
		const total = counts[cell]!
		if (total === 0) continue
		meanSquare[cell] /= total
		unexplainedShare[cell] /= total
		const base = cell * OKLAB_DIMENSIONS
		for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
			mean[base + coordinate] /= total
		}
	}
	return { meanSquare, mean, unexplainedShare }
}

/** The cell's mean squared residual against a field value. */
function cellResidual(
	stats: { meanSquare: Float64Array; mean: Float64Array; unexplainedShare: Float64Array },
	cell: number,
	field: readonly [number, number, number],
): number {
	const base = cell * OKLAB_DIMENSIONS
	let dot = 0
	let squared = 0
	for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
		dot += field[coordinate]! * stats.mean[base + coordinate]!
		squared += field[coordinate]! * field[coordinate]!
	}
	const residual =
		stats.meanSquare[cell]! -
		SQUARE_CROSS_TERM_FACTOR * dot +
		stats.unexplainedShare[cell]! * squared
	return residual > 0 ? residual : 0
}

/** Total mean-squared residual over the lattice, for a gradient at one axis angle. */
function gradientResidualAt(
	stats: { meanSquare: Float64Array; mean: Float64Array; unexplainedShare: Float64Array },
	stops: readonly Stop[],
	resolution: number,
	angle: number,
): number {
	const cosine = Math.cos(angle)
	const sine = Math.sin(angle)
	let total = 0
	for (let row = 0; row < resolution; row += 1) {
		const v = (row + CELL_CENTRE_FRACTION) / resolution
		for (let column = 0; column < resolution; column += 1) {
			const u = (column + CELL_CENTRE_FRACTION) / resolution
			const t = pathParameter(u, v, cosine, sine)
			total += cellResidual(stats, row * resolution + column, colorAlongStops(stops, t))
		}
	}
	return total
}

/**
 * Fit the gradient's axis direction by residual minimisation: a coarse sweep at the lattice's own
 * angular resolution, then a ternary refine inside the winning bracket.
 */
function fitGradientAngle(
	stats: { meanSquare: Float64Array; mean: Float64Array; unexplainedShare: Float64Array },
	stops: readonly Stop[],
	resolution: number,
): { angle: number; coarseAngles: number } {
	const coarseAngles = coarseAngleCount(resolution)
	const step = FULL_TURN_RADIANS / coarseAngles
	let bestAngle = 0
	let bestResidual = Number.POSITIVE_INFINITY
	for (let index = 0; index < coarseAngles; index += 1) {
		const angle = index * step
		const residual = gradientResidualAt(stats, stops, resolution, angle)
		if (residual < bestResidual) {
			bestResidual = residual
			bestAngle = angle
		}
	}
	let low = bestAngle - step
	let high = bestAngle + step
	const iterations = ternaryIterations()
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		const third = (high - low) / TERNARY_SECTIONS
		const probeLow = low + third
		const probeHigh = high - third
		if (
			gradientResidualAt(stats, stops, resolution, probeLow) <=
			gradientResidualAt(stats, stops, resolution, probeHigh)
		) {
			high = probeHigh
		} else {
			low = probeLow
		}
	}
	const angle = (low + high) / TERNARY_PROBES
	return { angle, coarseAngles }
}

// ---------------------------------------------------------------------------------------------
// L(member palette | image)
// ---------------------------------------------------------------------------------------------

/**
 * Price one member's palette on one image.
 *
 * The member's identity is a label passed through to the result; nothing in the arithmetic below
 * reads it, and no member supplies a weight, a prior or a score. SPEC §2's member-independence is
 * this signature.
 */
export function priceMember(
	slug: string,
	palette: Palette,
	image: DecodedImage,
	substrate: Substrate,
): MemberPrice {
	const schema = schemaPrice(palette, substrate.cellCount)
	const { mask, fraction } = explainedMask(image, palette)
	const stats = restrictedCellStats(image, substrate, mask)
	const stops = stopsOf(palette)

	let field: ImpliedField
	let fieldAt: (cell: number) => readonly [number, number, number]
	if (stops.length === 0) {
		const flat = okLabFromColor(palette.roles.background)
		field = { kind: "flat", angleRadians: null, coarseAngles: null }
		fieldAt = () => flat
	} else {
		const fit = fitGradientAngle(stats, stops, substrate.resolution)
		const cosine = Math.cos(fit.angle)
		const sine = Math.sin(fit.angle)
		field = { kind: "gradient", angleRadians: fit.angle, coarseAngles: fit.coarseAngles }
		fieldAt = (cell: number) => {
			const row = Math.floor(cell / substrate.resolution)
			const column = cell - row * substrate.resolution
			const u = (column + CELL_CENTRE_FRACTION) / substrate.resolution
			const v = (row + CELL_CENTRE_FRACTION) / substrate.resolution
			return colorAlongStops(stops, pathParameter(u, v, cosine, sine))
		}
	}

	const scale =
		GAUSSIAN_EXPONENT_DENOMINATOR * substrate.sigma * substrate.sigma * Math.LN2
	const perCellResidualBits = new Float64Array(substrate.cellCount)
	let residualBits = 0
	for (let cell = 0; cell < substrate.cellCount; cell += 1) {
		const bits = cellResidual(stats, cell, fieldAt(cell)) / scale
		perCellResidualBits[cell] = bits
		residualBits += bits
	}

	return {
		slug,
		schema,
		field,
		explainedPixelFraction: fraction,
		residualBits,
		totalBits: schema.bits + residualBits,
		perCellResidualBits,
	}
}

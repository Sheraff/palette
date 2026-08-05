/**
 * # `energyOfAPrime` — arm A′'s energy, in bits
 *
 * `DESIGN.md`, "The internal experiment":
 *
 * > *"`p1ap` (arm A′): **E(P) = L(pixels|P) + λ·L(P)**, where L(P) is the contract object's own
 * > serialization cost in bits (24 bits per named colour, gradient boolean, stops, flags).
 * > Field/ink separation via the support map's own coding cost (broad/low-frequency cheap under a
 * > coarse code; stroke-like cheap under an edge/run code)."*
 *
 * This module is the whole of that sentence except `L(P)`, which is **not reimplemented here**: it is
 * `serializationCost()` from `src/emit/cost.ts`, called once, unmodified. `DESIGN.md` also fixes what
 * this function is *for*: *"The energy is a function of any contract-legal palette, not only of
 * palettes we produce. This is the falsifier's mechanism and ships in v0 before any emitter."* So
 * `energyOfAPrime` **evaluates** and never chooses: it contains no role-picking, no shortlist, no
 * candidate filter, and no legality check. Hand it a legacy reconstruction with a mid stop at
 * t = 0.5 and it prices that; hand it something `feasibility()` would reject and it prices that too,
 * because a cost function that refused illegal input would be a second, undocumented feasible set.
 *
 * ## The description: field + ink + the unexplained
 *
 * Arm A′ §2.2. Every pixel is coded exactly once, under one of three codes, and each triple's whole
 * mass goes to whichever code is cheapest **for that triple**:
 *
 * | code | who it is | what it costs per pixel |
 * |---|---|---|
 * | **field** | flat: `background` (and `surface` when not collapsed); ramp: the OKLab path through the stops | `−log₂ p_field(c | position)` + the **coarse** support price |
 * | **ink** | `foreground` (and `accent` when not collapsed) | `−log₂ p_ink(c)` + the **chain** support price |
 * | **generic** | nobody — the residual | `−log₂ p_generic(c)`, no support price |
 *
 * **There is no extent statistic and no split scale.** Arm A uses the dyadic ladder's `e(p)` and
 * fits a logistic in it; arm A′ is explicit (§2.5) that *"no separate classifier exists"* — the
 * field/ink split falls out of which code is shorter. Realised here at **triple granularity**: the
 * unit of assignment is one row of the per-triple table, which is the finest unit the `Measurement`
 * carries. See `support.ts` for the two support codes and for the approximation they are, with its
 * named upgrade path.
 *
 * **The generic code is the image's own chromatic density** — `ρ(c)`, the occupancy of its
 * neighbourhood in *colour space*, normalised over the table. See `chromatic.ts`, which is the whole
 * of `DESIGN.md` fold item 11 (*"a residual whose density is chromatic (colour-space) rather than
 * mass-proportional — a change to the prior, not a bolt-on term"*) and carries the rejected
 * alternative. `DESIGN.md` decision 4 still holds in its own terms — *"arm A: uniform density over
 * sRGB gamut (parameter-free); arm A′: the image's own … density. Each arm keeps its own — it is part
 * of the prior under test"* — with A′'s own density read off colour space instead of off mass, which
 * is v0.2.0's single change. This is where the naming gain of §2.3 comes from and it is not put in by
 * hand: a large dull region shares its neighbourhood with many distinct shades, so `ρ` is high, it is
 * already cheap generically, and naming it saves nothing **however much of the frame it covers**; a
 * chromatically isolated cluster sits alone, so `ρ ≈ 1`, every one of its pixels is expensive
 * generically, and it becomes cheap the moment a role names it. `naming-gain.test.ts` exhibits
 * exactly that, with the arithmetic in the comments; `identity-coverage.test.ts` exhibits the round
 * verdict it was repaired for.
 *
 * ## The alphabet, and why the codes are normalised over it
 *
 * All three densities are proper distributions over **the image's own K distinct triples**. A
 * decoder holding the artwork holds that table, and the bits to transmit the table are identical for
 * every configuration of the same image, so they cancel from every comparison this energy is used
 * for and are omitted rather than carried as a constant. Two consequences worth stating:
 *
 * - Every code length is finite. `p_field` and `p_ink` are computed in the log domain — the cost of a
 *   triple is `½·d²/h²·log₂e + log₂Z` with `Z` accumulated by log-sum-exp — so a colour a thousand
 *   bandwidths from the named one costs a large finite number of bits rather than underflowing to
 *   `exp(-huge) = 0` and producing `Infinity`. `total` is finite for every contract-shaped
 *   configuration, including ones naming colours the image does not contain.
 * - On a one-colour image the alphabet has one symbol, so the generic code costs exactly 0 bits and
 *   `L(pixels | P)` is exactly 0 for *every* configuration. `λ·L(P)` then decides alone and the fully
 *   collapsed flat configuration wins at 51 bits. That is the degenerate case behaving correctly, and
 *   it is test (a).
 *
 * ## Mass is read smoothed
 *
 * `DESIGN.md`: *"Mass is read smoothed, never exact-bin. All objective mass flows through a kernel of
 * the identity bar's width (endorsed median exact-triple share 8.89e-5 vs 1.91e-2 at the bar — a
 * 215× gap the objective must live on the right side of)."* Held here in the only way a code length
 * can hold it: the **densities** are all kernel quantities at the identity bar — the field and ink
 * codes are Gaussian kernels of that bandwidth, and the generic code is the same kernel over the
 * image's colour-space occupancy at that bar. The exact integer counts appear only as the *number of
 * pixels being coded*, which is what makes the result a code length at all and is not a modelling
 * quantity. No exact-bin share is ever compared to a threshold, and there is no threshold. Since
 * v0.2.0 the residual reads no mass at all, smoothed or otherwise; `measurement.smoothedMass` is
 * carried into `nuisance` as a provenance fact and is no longer an input to any number here.
 *
 * The bandwidth is `[INHERITED]` from `src/measure/kernel.ts` (`DESIGN.md` decision 1); no bandwidth
 * digit is written in this directory. The escape hatch needs no bandwidth of its own —
 * `serializationCost` already carries the 1024-bit barrier, and it dominates the entire 51..165-bit
 * in-artwork range of L(P) by construction.
 *
 * ## The profile over geometries and orientation
 *
 * A `Configuration` says *that* the field is a ramp and what colours sit at what `t`. It does not say
 * which of the three fitted geometries parameterises `t`, nor which way round the ramp runs — the
 * measurement fits linear, radial and conic and *"takes no view"*, and `DESIGN.md` decision 5's
 * 135°-axis convention is the emitter's, not something a legacy configuration can be assumed to obey.
 * Both are therefore **profiled**: the energy is evaluated under all six (geometry × orientation)
 * combinations and the minimum is returned, with the argmin in `nuisance.rampGeometry` and
 * `nuisance.rampOrientation`. Profiling rather than fixing is what keeps the energy from charging a
 * correct ramp for a sign convention it never agreed to. Flat configurations do none of this work.
 */

import { hex, hexToRgb, rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../../../src/contract/types.ts"
import { serializationCost } from "../../emit/cost.ts"
import type { Configuration } from "../../emit/types.ts"
import type { TColorJoint } from "../../measure/joint.ts"
import { bandwidthOf } from "../../measure/kernel.ts"
import type { Measurement } from "../../measure/types.ts"
import { chromaticResidual } from "./chromatic.ts"
import { DEFAULT_LAMBDA, ENERGY_APRIME_VERSION } from "./constants.ts"
import { computeSupportCodes } from "./support.ts"
import type { EnergyResult, EnergyOptions } from "./types.ts"

export { computeSupportCodes, binaryEntropyBits } from "./support.ts"
export type { SupportCodes } from "./support.ts"
export { chromaticResidual } from "./chromatic.ts"
export type { ChromaticResidual } from "./chromatic.ts"
export type { EnergyResult, EnergyOptions, CodeFamily } from "./types.ts"
export { CODE_FAMILIES } from "./types.ts"
export {
	CHAIN_CODE_DIRECTION_BITS,
	CODE_FAMILY_TIE_BREAK,
	DEFAULT_LAMBDA,
	ENERGY_APRIME_VERSION,
	FOOTPRINT_AREA_FACTOR,
	PIXEL_SECOND_MOMENT,
} from "./constants.ts"

/** The three geometries the measurement fits, in the order this module profiles them. */
const RAMP_GEOMETRIES = ["linear", "radial", "conic"] as const
type RampGeometry = (typeof RAMP_GEOMETRIES)[number]

/** The two directions a ramp can run along a geometry's own `t`. Order fixes the tie-break. */
const RAMP_ORIENTATIONS = ["forward", "reverse"] as const
type RampOrientation = (typeof RAMP_ORIENTATIONS)[number]

// ---------------------------------------------------------------------------------------------
// Reading the configuration
// ---------------------------------------------------------------------------------------------

/**
 * The colour a role actually carries, escape included.
 *
 * When `escape` names a role, that role's colour **is the escape literal** and the configuration's
 * own triple for it is stale by construction (the escape exists precisely because no source triple
 * would do). `serializationCost` makes the same reading — it charges the escaping role zero naming
 * bits — so the two halves of the energy agree about what was published.
 */
function roleColor(config: Configuration, role: "background" | "surface" | "foreground" | "accent"): Rgb8 {
	if (config.escape !== null && config.escape.role === role) {
		return hexToRgb(hex(config.escape.color))
	}
	return config[role]
}

/** The stops as a path, ascending in position. */
type PathPoint = Readonly<{ position: number; lab: OkLab }>

/**
 * Build `γ`, the piecewise-linear OKLab path through the published stops.
 *
 * Sorted by position with the original index as tie-break. Invariant 1 already requires strictly
 * increasing positions, so for every legal configuration the sort is the identity; it is here so that
 * a malformed configuration still gets a well-defined, order-free path rather than a NaN.
 */
function buildPath(config: Configuration): PathPoint[] {
	const points = config.stops.map((stop, index) => ({
		position: stop.position,
		lab: rgbToOkLab(stop.rgb),
		index,
	}))
	points.sort((left, right) =>
		left.position === right.position ? left.index - right.index : left.position - right.position,
	)
	return points.map((point) => ({ position: point.position, lab: point.lab }))
}

/** `γ(t)`, clamped to the path's own ends outside `[p₀, p_last]`. */
function evaluatePath(path: readonly PathPoint[], t: number): OkLab {
	const last = path.length - 1
	if (t <= path[0].position) return path[0].lab
	if (t >= path[last].position) return path[last].lab
	let segment = 0
	while (segment < last && path[segment + 1].position < t) segment += 1
	const from = path[segment]
	const to = path[segment + 1]
	const span = to.position - from.position
	// Coincident positions: take the later stop, which is what "strictly increasing" would have meant.
	if (span <= 0) return to.lab
	const fraction = (t - from.position) / span
	return [
		from.lab[0] + fraction * (to.lab[0] - from.lab[0]),
		from.lab[1] + fraction * (to.lab[1] - from.lab[1]),
		from.lab[2] + fraction * (to.lab[2] - from.lab[2]),
	]
}

// ---------------------------------------------------------------------------------------------
// The colour codes, all in the log domain
// ---------------------------------------------------------------------------------------------

/**
 * `u(c) = d_OKLab(c, target)² / h(c, target)²` for every triple — the kernel's squared ratio.
 *
 * `h` is the **pair** bandwidth, the larger of the two colours' regional bars, exactly the contract's
 * `sameColorBar` rule as `src/measure/kernel.ts` re-exports it. `target` need not be an 8-bit colour:
 * a point on the ramp is not, and `bandwidthOf` reads a bare OKLab triple for that reason.
 */
function squaredRatios(
	lab: Float64Array,
	colorCount: number,
	tripleBandwidth: Float64Array,
	target: OkLab,
	out: Float64Array,
): void {
	const targetBandwidth = bandwidthOf(target)
	for (let row = 0; row < colorCount; row += 1) {
		const base = row * 3
		const deltaL = lab[base] - target[0]
		const deltaA = lab[base + 1] - target[1]
		const deltaB = lab[base + 2] - target[2]
		const bandwidth =
			tripleBandwidth[row] > targetBandwidth ? tripleBandwidth[row] : targetBandwidth
		out[row] = (deltaL * deltaL + deltaA * deltaA + deltaB * deltaB) / (bandwidth * bandwidth)
	}
}

/**
 * `log₂ Z` for a kernel normaliser `Z = Σ_c exp(−½ u(c))`, by log-sum-exp.
 *
 * Written this way and not as a plain sum because `exp(−½u)` underflows to exactly zero for every
 * triple as soon as the named colour is more than about forty bandwidths away — which is ordinary,
 * not pathological, at an identity bar of 0.009 in a space whose diameter is ~1.2. A plain sum would
 * hand back `0/0`; this hands back a large finite number of bits, which is the honest answer.
 */
function log2Normaliser(squared: Float64Array, colorCount: number): number {
	if (colorCount === 0) return 0
	let smallest = squared[0]
	for (let row = 1; row < colorCount; row += 1) {
		if (squared[row] < smallest) smallest = squared[row]
	}
	let sum = 0
	for (let row = 0; row < colorCount; row += 1) {
		sum += Math.exp(-0.5 * (squared[row] - smallest))
	}
	// `Z = exp(−½·smallest) · sum`, so `log₂Z = −½·smallest·log₂e + log₂ sum`.
	return -0.5 * smallest * Math.LOG2E + Math.log2(sum)
}

/**
 * `−log₂ p(c)` for the kernel code centred on one named colour, for every triple.
 *
 * `p(c) = exp(−½u(c)) / Z`, so `−log₂ p(c) = ½·u(c)·log₂e + log₂Z`. Both halves are finite for every
 * finite `u`, which is the whole reason for the log domain.
 */
function namedColorCode(
	lab: Float64Array,
	colorCount: number,
	tripleBandwidth: Float64Array,
	target: OkLab,
	scratch: Float64Array,
	out: Float64Array,
): void {
	squaredRatios(lab, colorCount, tripleBandwidth, target, scratch)
	const log2Z = log2Normaliser(scratch, colorCount)
	for (let row = 0; row < colorCount; row += 1) {
		out[row] = 0.5 * scratch[row] * Math.LOG2E + log2Z
	}
}

/** Elementwise `out = min(out, other)`. */
function minimiseInto(out: Float64Array, other: Float64Array): void {
	for (let row = 0; row < out.length; row += 1) {
		if (other[row] < out[row]) out[row] = other[row]
	}
}

// ---------------------------------------------------------------------------------------------
// The ramp field code
// ---------------------------------------------------------------------------------------------

/**
 * For each lattice cell, where its entries start in the joint's flat arrays.
 *
 * `entryCell` is ascending by construction (`joint.ts` sorts on the packed `(cell, bin)` key), so one
 * scan builds the index and nothing here iterates a `Map`.
 */
function cellEntryOffsets(joint: TColorJoint, cellCount: number): Int32Array {
	const start = new Int32Array(cellCount + 1)
	for (let entry = 0; entry < joint.entryCount; entry += 1) start[joint.entryCell[entry] + 1] += 1
	for (let cell = 0; cell < cellCount; cell += 1) start[cell + 1] += start[cell]
	return start
}

/**
 * `−log₂ p_ramp(c)` per triple, under one geometry and one orientation.
 *
 * The ramp code is **conditional on position**, which is the point of arm A′ §2.1's second pass:
 * *"how a colour's pixels are distributed along the ramp … is what distinguishes a colour that lies
 * on the field from a colour that sits on top of it."* Given a `t` bin `b`, the field predicts
 * `γ(t_b)` and the code over colours is the kernel around it, normalised over the alphabet:
 *
 *     p(c | b) = exp(−½ u(c, γ(t_b))) / Z(b)
 *
 * A triple's cost is the average of `−log₂ p(c | b)` over its own distribution across the bins,
 * `q(b | c)`, read from the (t, colour) joint. The joint resolves colour to lattice cells rather than
 * triples, so `q(b | c) = q(b | cell(c))` — every triple in a cell shares the cell's profile along
 * `t`. That is the resolution the measurement carries and the coarsest of the two lattices
 * (`JOINT_LATTICE_CELLS_PER_BAR = 1`), stated rather than hidden.
 *
 * Why this makes a real ramp cheap: at a bin where the field is right, `Z(b)` sums only the handful
 * of triples within a few bars of `γ(t_b)`, so `−log₂ p` is a couple of bits. Under a flat hypothesis
 * the same triples are dozens of bandwidths from the single named colour and cost hundreds. The
 * comparison is between two codes over the same alphabet, so it is a comparison of bits and nothing
 * else.
 */
function rampColorCode(
	measurement: Measurement,
	path: readonly PathPoint[],
	joint: TColorJoint,
	orientation: RampOrientation,
	tripleBandwidth: Float64Array,
	cellStart: Int32Array,
	scratch: Float64Array,
	out: Float64Array,
): void {
	const { colorCount, lab } = measurement.triples
	const lattice = measurement.joints.lattice
	const bins = joint.binCount

	out.fill(0)
	// Bin representatives and their normalisers. One `log₂Z` per bin; the squared ratios are recomputed
	// in the accumulation pass below rather than stored, which trades `bins × K` doubles for a few
	// arithmetic operations per (triple, bin) pair that is actually populated.
	const log2Z = new Float64Array(bins)
	const binLab = new Float64Array(bins * 3)
	const binBandwidth = new Float64Array(bins)
	for (let bin = 0; bin < bins; bin += 1) {
		const midpoint = 0.5 * (joint.binEdges[bin] + joint.binEdges[bin + 1])
		const t = orientation === "reverse" ? 1 - midpoint : midpoint
		const point = evaluatePath(path, t)
		binLab[bin * 3] = point[0]
		binLab[bin * 3 + 1] = point[1]
		binLab[bin * 3 + 2] = point[2]
		binBandwidth[bin] = bandwidthOf(point)
		squaredRatios(lab, colorCount, tripleBandwidth, point, scratch)
		log2Z[bin] = log2Normaliser(scratch, colorCount)
	}

	for (let row = 0; row < colorCount; row += 1) {
		const cell = lattice.tripleCell[row]
		const from = cellStart[cell]
		const to = cellStart[cell + 1]
		const cellMass = lattice.cellMass[cell]
		if (to <= from || cellMass <= 0) {
			// A cell with no joint entry cannot happen for a triple with pixels; if it ever does, the
			// ramp explains nothing about this triple and the generic code will take it.
			out[row] = Number.POSITIVE_INFINITY
			continue
		}
		const base = row * 3
		let total = 0
		for (let entry = from; entry < to; entry += 1) {
			const bin = joint.entryBin[entry]
			const weight = joint.entryMass[entry] / cellMass
			if (weight <= 0) continue
			const binBase = bin * 3
			const deltaL = lab[base] - binLab[binBase]
			const deltaA = lab[base + 1] - binLab[binBase + 1]
			const deltaB = lab[base + 2] - binLab[binBase + 2]
			const bandwidth =
				tripleBandwidth[row] > binBandwidth[bin] ? tripleBandwidth[row] : binBandwidth[bin]
			const squared =
				(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB) / (bandwidth * bandwidth)
			total += weight * (0.5 * squared * Math.LOG2E + log2Z[bin])
		}
		out[row] = total
	}
}

// ---------------------------------------------------------------------------------------------
// Assembling the likelihood
// ---------------------------------------------------------------------------------------------

type Assembly = Readonly<{
	fieldColorBits: number
	fieldSupportBits: number
	inkColorBits: number
	inkSupportBits: number
	genericBits: number
	likelihoodBits: number
	fieldMass: number
	inkMass: number
	genericMass: number
	fieldTriples: number
	inkTriples: number
	genericTriples: number
}>

/**
 * Give every triple's mass to its cheapest code and add the bits up.
 *
 * This is arm A′ §2.5's *"which coding is cheaper, not an ordering of steps"* at triple granularity,
 * and it is the only place field/ink membership is decided anywhere in this prototype. Ties go
 * field → ink → generic (`CODE_FAMILY_TIE_BREAK`), which matters only on degenerate images where
 * every code is exactly 0 bits.
 */
function assemble(
	counts: Float64Array,
	colorCount: number,
	fieldColorCost: Float64Array,
	inkColorCost: Float64Array,
	genericCost: Float64Array,
	coarseSupport: Float64Array,
	chainSupport: Float64Array,
): Assembly {
	let fieldColorBits = 0
	let fieldSupportBits = 0
	let inkColorBits = 0
	let inkSupportBits = 0
	let genericBits = 0
	let fieldMass = 0
	let inkMass = 0
	let genericMass = 0
	let fieldTriples = 0
	let inkTriples = 0
	let genericTriples = 0

	for (let row = 0; row < colorCount; row += 1) {
		const count = counts[row]
		if (count <= 0) continue
		const field = fieldColorCost[row] + coarseSupport[row]
		const ink = inkColorCost[row] + chainSupport[row]
		const generic = genericCost[row]

		if (field <= ink && field <= generic) {
			fieldColorBits += count * fieldColorCost[row]
			fieldSupportBits += count * coarseSupport[row]
			fieldMass += count
			fieldTriples += 1
		} else if (ink <= generic) {
			inkColorBits += count * inkColorCost[row]
			inkSupportBits += count * chainSupport[row]
			inkMass += count
			inkTriples += 1
		} else {
			genericBits += count * generic
			genericMass += count
			genericTriples += 1
		}
	}

	return {
		fieldColorBits,
		fieldSupportBits,
		inkColorBits,
		inkSupportBits,
		genericBits,
		likelihoodBits: fieldColorBits + fieldSupportBits + inkColorBits + inkSupportBits + genericBits,
		fieldMass,
		inkMass,
		genericMass,
		fieldTriples,
		inkTriples,
		genericTriples,
	}
}

// ---------------------------------------------------------------------------------------------
// The function
// ---------------------------------------------------------------------------------------------

/**
 * **E(P) = L(pixels | P) + λ·L(P), in bits.**
 *
 * Pure, deterministic and finite for every contract-shaped configuration. No RNG, no clock, no file
 * access, no `Map` iteration; every loop runs in the triple table's canonical order, so two calls on
 * the same inputs produce byte-identical output (`tests/energy-aprime/determinism.test.ts`).
 *
 * It **evaluates only**. There is no role-picking here, no candidate generation and no feasibility
 * test — `feasibility()` in `src/emit/` is the feasible set and this is the objective, and
 * `DESIGN.md` requires them to stay apart.
 *
 * @param measurement everything the energy may see about the image (`src/measure/`).
 * @param config the whole answer for one artwork (`src/emit/types.ts`).
 * @param opts `lambda` defaults to `DEFAULT_LAMBDA` = 1.0, `[UNCALIBRATED]`.
 */
export function energyOfAPrime(
	measurement: Measurement,
	config: Configuration,
	opts: EnergyOptions = {},
): EnergyResult {
	const lambda = opts.lambda ?? DEFAULT_LAMBDA
	if (!Number.isFinite(lambda)) {
		throw new RangeError(`energyOfAPrime: lambda must be finite, received ${String(lambda)}`)
	}

	const { colorCount, counts, lab, pixelCount } = measurement.triples
	const support = computeSupportCodes(measurement)
	const cost = serializationCost(config)

	// --- the generic code: the image's own chromatic density, normalised over the table -----------
	// `chromatic.ts` holds the whole of it, including why the density counts colour-space occupancy
	// and not mass, and which alternative was rejected. It is a function of the measurement alone, so
	// it is computed once per image and shared by every configuration scored against that image.
	const residual = chromaticResidual(measurement)
	const genericCost = residual.bitsPerPixel

	// --- per-triple bandwidths, computed once ----------------------------------------------------
	const tripleBandwidth = new Float64Array(colorCount)
	for (let row = 0; row < colorCount; row += 1) {
		tripleBandwidth[row] = bandwidthOf([lab[row * 3], lab[row * 3 + 1], lab[row * 3 + 2]])
	}

	const scratch = new Float64Array(colorCount)

	// --- the ink code: foreground, plus accent when it is genuinely its own colour ---------------
	const inkColorCost = new Float64Array(colorCount)
	namedColorCode(
		lab,
		colorCount,
		tripleBandwidth,
		rgbToOkLab(roleColor(config, "foreground")),
		scratch,
		inkColorCost,
	)
	if (!config.accentCollapsed) {
		const accentCost = new Float64Array(colorCount)
		namedColorCode(
			lab,
			colorCount,
			tripleBandwidth,
			rgbToOkLab(roleColor(config, "accent")),
			scratch,
			accentCost,
		)
		minimiseInto(inkColorCost, accentCost)
	}

	// --- the field code -------------------------------------------------------------------------
	// One field model per configuration, as declared. Under the flat hypothesis the field is the
	// background, plus the surface when the configuration says the surface is genuinely its own
	// colour; under the ramp hypothesis the field *is* the published path and the two field roles are
	// its ends (arm A′ §2.5), so the flat components are not also offered. Collapse flags are read as
	// **declared**, never inferred from the triples (invariant 3).
	const usesRamp = config.gradient && config.stops.length >= 1

	let best: Assembly | null = null
	let bestGeometry: RampGeometry | "none" = "none"
	let bestOrientation: RampOrientation | "none" = "none"
	let fieldModel = config.gradient ? "ramp" : config.surfaceCollapsed ? "flat" : "flat-two"

	if (usesRamp) {
		const path = buildPath(config)
		const rampCost = new Float64Array(colorCount)
		for (const geometry of RAMP_GEOMETRIES) {
			const joint = measurement.joints[geometry]
			const cellStart = cellEntryOffsets(joint, measurement.joints.lattice.cellCount)
			for (const orientation of RAMP_ORIENTATIONS) {
				rampColorCode(
					measurement,
					path,
					joint,
					orientation,
					tripleBandwidth,
					cellStart,
					scratch,
					rampCost,
				)
				const candidate = assemble(
					counts,
					colorCount,
					rampCost,
					inkColorCost,
					genericCost,
					support.coarseBitsPerPixel,
					support.chainBitsPerPixel,
				)
				// Strict `<` keeps the first combination in `RAMP_GEOMETRIES × RAMP_ORIENTATIONS` order
				// on a tie, which is the fixed tie-break the determinism rule asks for.
				if (best === null || candidate.likelihoodBits < best.likelihoodBits) {
					best = candidate
					bestGeometry = geometry
					bestOrientation = orientation
				}
			}
		}
	} else {
		// A `gradient: true` configuration with no stops has no path to evaluate. It is not
		// representable as a contract `Palette` at all (`GradientSpec` needs two stops), so it can only
		// arrive from a malformed caller; it is priced as a flat field and `fieldModel` says so rather
		// than throwing, because the energy's job is to return a number for anything shaped like a
		// configuration and `feasibility()`'s job is to reject it.
		if (config.gradient) fieldModel = "ramp-without-stops"

		const flatFieldCost = new Float64Array(colorCount)
		namedColorCode(
			lab,
			colorCount,
			tripleBandwidth,
			rgbToOkLab(roleColor(config, "background")),
			scratch,
			flatFieldCost,
		)
		if (!config.surfaceCollapsed) {
			const surfaceCost = new Float64Array(colorCount)
			namedColorCode(
				lab,
				colorCount,
				tripleBandwidth,
				rgbToOkLab(roleColor(config, "surface")),
				scratch,
				surfaceCost,
			)
			minimiseInto(flatFieldCost, surfaceCost)
		}

		best = assemble(
			counts,
			colorCount,
			flatFieldCost,
			inkColorCost,
			genericCost,
			support.coarseBitsPerPixel,
			support.chainBitsPerPixel,
		)
	}

	const assembly = best as Assembly
	const paletteBits = lambda * cost.bits
	const total = assembly.likelihoodBits + paletteBits

	return {
		total,
		// Sums to `total`. Six terms, each independently hand-checkable on a synthetic image.
		terms: {
			fieldColorBits: assembly.fieldColorBits,
			fieldSupportBits: assembly.fieldSupportBits,
			inkColorBits: assembly.inkColorBits,
			inkSupportBits: assembly.inkSupportBits,
			genericBits: assembly.genericBits,
			paletteBits,
		},
		nuisance: {
			lambda,
			serializationBits: cost.bits,
			likelihoodBits: assembly.likelihoodBits,
			bitsPerPixel: pixelCount > 0 ? assembly.likelihoodBits / pixelCount : 0,
			fieldModel,
			rampGeometry: bestGeometry,
			rampOrientation: bestOrientation,
			fieldMassFraction: pixelCount > 0 ? assembly.fieldMass / pixelCount : 0,
			inkMassFraction: pixelCount > 0 ? assembly.inkMass / pixelCount : 0,
			genericMassFraction: pixelCount > 0 ? assembly.genericMass / pixelCount : 0,
			fieldTriples: assembly.fieldTriples,
			inkTriples: assembly.inkTriples,
			genericTriples: assembly.genericTriples,
			colorCount,
			pixelCount,
			/** `Ω` — occupied cells of the image's colour-space footprint, one cell per identity bar. */
			chromaticCells: residual.occupiedCells,
			/** `log₂ Σ_c ρ(cell(c))`, so a residual bit count can be read apart from its normaliser. */
			chromaticLog2Normaliser: residual.log2Normaliser,
			energyVersion: ENERGY_APRIME_VERSION,
			smoothedMassMode: measurement.smoothedMass.mode,
		},
	}
}

/**
 * # `energyOfA` — arm A's energy, in nats per unit image mass
 *
 * Arm A §2.3, verbatim:
 *
 * ```
 *   E(x) = (1/N) Σ_c [ n_π(c)·(−log ρ_field(c|x)) + (n(c) − n_π(c))·(−log ρ_ink(c|x)) ] + λ·Ω(x)
 * ```
 *
 * with `n_π(c) = π(c)·n(c)` the field-weighted mass, `π` the logistic in the extent statistic
 * (`split.ts`), and `Ω(x)` counting structural elements: *surface distinct from background* (1),
 * *ramp rather than two flat areas* (1), *each interior stop* (1 each), *accent distinct from
 * foreground* (1).
 *
 * Two arithmetic departures from that line are recorded below and both are load-bearing: the data
 * term is the **log of the mixture** rather than the mixture of logs, and each population is a
 * **joint** density over (colour, extent) rather than a colour density conditioned on a free extent
 * map. The second is `DESIGN.md` decision 9's fix and is the reason a broad band can no longer be
 * bought as ink.
 *
 * ## What this function is, and what it is not
 *
 * **It only evaluates.** `DESIGN.md`, "The mechanism": *"The energy is a function of any
 * contract-legal palette, not only of palettes we produce. This is the falsifier's mechanism and
 * ships in v0 before any emitter."* No stage in here picks a role, shortlists a colour, or rejects a
 * configuration: it is handed a complete `Configuration` — four roles, gradient boolean, stops,
 * collapse flags, escape — and returns what that configuration costs. A legacy reconstruction with a
 * mid stop at `t = 0.5` scores exactly like anything else, which is what makes the falsifier possible.
 *
 * **Legality is not a term.** *"The contract is the feasible set, never a term."* Nothing here calls
 * `feasibility()`, and the objective never rewards contrast, distinctness or legality.
 *
 * **Nothing counts an exact bin.** Every mass in the objective reaches it through a kernel of the
 * identity bar's width: the density at a role colour is `Σ_c n(c)·κ(d(c, B))/Z`, whose numerator *is*
 * the measurement layer's smoothed mass at `B`. The endorsed median role colour occupies 8.89e-5 of
 * its image as an exact triple and 1.91e-2 as a bar neighbourhood; this objective lives on the second
 * number by construction, not by a smoothing step applied afterwards.
 *
 * ## Pure, deterministic, finite
 *
 * - **Pure** — reads only its two arguments and this module's constants. No file, no clock, no id.
 *   `measurement.source.path` is never read (arm A §2.5).
 * - **Deterministic** — every loop runs over typed arrays in the measurement's canonical order. No
 *   `Map` is iterated, no RNG, no hash order. The profile's tie-break is grid order: split scales
 *   ascending, then geometries in the fixed order linear, radial, conic, with a strict `<` so the
 *   first candidate wins a tie.
 * - **Finite** — `−log ρ` is bounded because every density is a mixture whose residual weight is
 *   floored (`MIXTURE_WEIGHT_FLOOR`) and whose residual density is a positive constant (`gamut.ts`).
 *   The worst per-triple surprisal is ≈ 17.8 nats, so `total` is finite for every configuration the
 *   `Configuration` type can express, legal or not.
 *
 * ## The three model orders, in one currency
 *
 * The field order is read off the configuration as it would render — `gradient` makes it a **ramp**,
 * otherwise `surfaceCollapsed` makes it **flat** and a declared-distinct surface makes it
 * **two-flat**. Ω is read off the **declared flags**, because invariant 3 makes collapse a
 * declaration and not an inference: a configuration that declares a distinct surface pays for one
 * whether or not it then names the same triple twice.
 *
 * All three orders are scored as a *conditional* density — `−log ρ(colour | position)` — evaluated on
 * the same quadrature, the (t, colour) joint's t-bins. Flat and two-flat simply have a
 * position-independent density, so "compared against flat and two-flat in the same nats" (arm A §2.3)
 * is literally true rather than approximately so.
 *
 * ## The one deviation that changes the arithmetic: mixture, not mixture-of-logs
 *
 * Arm A §2.3 writes the data term as a **weighted sum of logs** — each triple's mass is split by π
 * and each half is charged against its own population's density:
 *
 * ```
 *   Σ_c [ π·n(c)·(−log ρ_field(c))  +  (1−π)·n(c)·(−log ρ_ink(c)) ]
 * ```
 *
 * This module charges the **log of the mixture** instead:
 *
 * ```
 *   Σ_c n(c)·(−log[ π·ρ_field(c) + (1−π)·ρ_ink(c) ])
 * ```
 *
 * with `ρ_field = (1−ε)ρ_field^model + ε·ρ₀` and `ρ_ink = (1−ε)ρ_ink^model + ε·ρ₀` — the same two
 * densities, the same single residual, the same π, the same units. Three reasons, in the order they
 * mattered:
 *
 * 1. **The mixture form is a code length; the other is an upper bound on one.** Arm A's expression is
 *    the *expected complete-data* log-likelihood of a two-component model — the quantity an EM E-step
 *    produces. By Jensen it is never below the observed-data log-likelihood, and the gap is the
 *    membership entropy. Arm A §1 asks for *"an expected coding cost, in nats per unit of image
 *    mass"*, and only the mixture form is one: the field/ink assignment is not in the message, so a
 *    decoder does not pay for it, so the objective must not charge for it.
 * 2. **The split form has a defect that shows on the corpus's own shapes, and it is not subtle.**
 *    Because each population is priced against its own density alone, mass the *field* explains
 *    perfectly still arrives in the ink term at weight `1−π` and is charged there against the ink
 *    kernels. Every large field colour therefore leaks a slice of its mass into the ink population,
 *    and an ink colour placed near a big field colour **harvests that leak** — it explains mass the
 *    field had already explained, and gets paid for it. On a 96×96 fixture with a large dull field,
 *    a second dull field colour and a small vivid patch, the split form ranks *accent = the second
 *    field colour* above *accent = the vivid patch*, by 2.6e-3 nats, because half an image's `1−π`
 *    tail outweighs a small patch's entire ink mass. That is
 *    `tests/energy-a/orderings.test.ts` case (d), and it fails under arm A's literal formula and
 *    passes under the mixture one. Arm A §2.3 anticipates the sibling of this problem — *"two ink
 *    kernels within an identity bar of one another explain the ink mass no better than one"* — but
 *    the same argument applied to an ink kernel and a *field* kernel is exactly what the split form
 *    cannot make.
 * 3. **It costs nothing the mechanism cares about.** One scalar objective over the whole
 *    configuration; membership never decided; mass read only through the identity-bar kernel; nats
 *    per unit image mass; λ·Ω for structure — every sentence of `DESIGN.md`'s "The mechanism" holds
 *    verbatim. `terms.field` and `terms.ink` are still reported, and still sum to the data cost
 *    exactly: each triple's cost is split by the two populations' shares of its density, which is an
 *    identity rather than an approximation (see `attributeCost`).
 *
 * Recorded as a deviation, not as an improvement, because it is the reviewer's to accept: the
 * quantity being minimised is different, and if the reviewer wants arm A's literal expression the
 * change is confined to the fifteen lines around `attributeCost` and `profileResidualWeight`.
 *
 * ## The second deviation, and the defect it repairs: the populations are joints over (colour, extent)
 *
 * `DESIGN.md` decision 9 records the verifier's finding that arm A's ink term **priced no support**:
 * on a clean diptych the configuration *flat field, second band as foreground* (Ω = 0) undercut the
 * true two-flat description at every λ in the mandatory sweep, because 62% of a solid band's mass
 * could be moved into the ink population by choosing a fine split scale, at no charge. The extent
 * statistic existed to say *"this mass is broad"* and the ink term did not listen.
 *
 * The repair is in `support.ts` and its full derivation lives there. In one line: each population is
 * a **joint** kernel over colour *and* extent, `ρ_field(c, ê) = ρ_field(c)·q_field(ê)` and
 * `ρ_ink(c, ê) = ρ_ink(c)·q_ink(ê)`, with `q_field ∝ exp(−ê/2w)` anchored at the ladder's coarse end
 * and `q_ink ∝ exp(−(S−ê)/2w)` at its fine end — arm A §2.2's *"the ink is small, high-frequency and
 * marks-like"*, written as a density. The joint factorises as `m(ê)·ρ(c | ê)`; `ρ(c | ê)` is exactly
 * the conditional this module already charged, and `m(ê) = π₀q_field + (1−π₀)q_ink` is the term that
 * was missing. Three properties make it a repair rather than a penalty:
 *
 * - the rate `1/2w` is forced, not chosen: it is the only one whose **posterior** `π₀q_field/m(ê)` is
 *   `σ((ŝ* − ê)/w)`, arm A §2.2's own logistic at §4.2's one-octave softness, so `split.ts` is
 *   unchanged and `ŝ*` is still what the profile grid runs over (`π₀ = σ((ŝ* − S/2)/w)`);
 * - no new constant enters — `w` is `[INHERITED]`, `S` comes from the measurement's ladder;
 * - `−log m(ê)` carries no λ and is bounded (≈ 8.7 nats at `S = 8`), so λ-multiplicativity and
 *   totality both survive.
 *
 * What changes behaviourally: a split scale is now paid for. A configuration that wants half an
 * image's broad mass in its ink population must move `π₀` towards ink, and `m(ê)` then charges every
 * broad triple in the image for it. The diptych flips — `tests/energy-a/support.test.ts` is the
 * regression, using the verifier's own fixture and configurations.
 *
 * ## Two further stated deviations
 *
 * 1. **Positional coupling comes from the joint, not from the per-triple moments.** Arm A §2.3 gets
 *    `t(p)` from the per-colour positional Gaussian `(μ(c), Σ(c))`, evaluated in closed form to
 *    second order. This implementation instead reads each triple's positional distribution from its
 *    lattice cell's row of the (t, colour) joint. Three reasons, all of them about being *more*
 *    faithful to what the term is for: the joint is exact at its resolution rather than a second-order
 *    expansion; it is multimodal, so a colour appearing in two separate places is not modelled as
 *    sitting at their midpoint, which is precisely the *frame or bar* case §2.2 wants handled
 *    structurally; and it is defined for the conic geometry, where a moment expansion in an angle has
 *    no meaning across the wrap. The cost is that colours sharing a lattice cell share a positional
 *    distribution — and the joint's lattice cell is one *tightest* identity bar wide, so the pooling
 *    is over colours the contract itself calls the same. The **colour** kernel is still evaluated at
 *    each triple's exact OKLab position; only positions are pooled.
 * 2. **The field and ink mixture weights are the smoothed masses of the population being modelled.**
 *    `DESIGN.md`'s spec says the two-flat mixture is *"weighted by their smoothed masses"*. Those are
 *    taken here restricted to the field-weighted mass (and, for the ink mixture, the ink-weighted
 *    mass), because the mixture is a model of the field population alone and letting ink mass vote on
 *    how the field's two colours share it would price a ramp against a diptych using evidence neither
 *    of them claims. Reverting is a one-line change; the unrestricted variant is what the phrase says
 *    literally.
 *
 * A third, smaller v0 simplification, recorded rather than hidden: arm A §4.4's **anisotropic accent
 * kernel** is not implemented. `DESIGN.md` decision 3 defers it explicitly ("an ordering costs no
 * constant"), so both ink kernels here are isotropic at the identity bar.
 */

import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { bandwidthOf } from "../../measure/kernel.ts"
import type { Measurement } from "../../measure/types.ts"
import type { TColorJoint } from "../../measure/joint.ts"
import type { Configuration, EscapeColorLiteral } from "../../emit/types.ts"
import {
	DEFAULT_LAMBDA,
	DENSITY_TRUNCATION_BANDWIDTHS,
	ENERGY_A_VERSION,
	ESCAPE_COST_NATS,
	GAUSSIAN_NORMALISER_3D,
} from "./constants.ts"
import { residualDensity, sRgbGamutVolumeOkLab } from "./gamut.ts"
import { profileResidualWeight } from "./mixture.ts"
import { buildColorPath, samplePath } from "./path.ts"
import {
	extentLadderOf,
	extentRungsPerTriple,
	fieldMembership,
	rungToExtent,
	splitScaleGrid,
} from "./split.ts"
import { extentFieldPrior, extentSupportNats, weightedSupportCost } from "./support.ts"
import type { EnergyOptions, EnergyResult } from "./types.ts"

export { residualDensity, sRgbGamutVolumeOkLab, computeSRgbGamutVolumeOkLab } from "./gamut.ts"
export { extentRung, rungToExtent, extentLadderOf } from "./split.ts"
export {
	extentDensities,
	extentFieldPrior,
	extentSupportNats,
	weightedSupportCost,
} from "./support.ts"
export { buildColorPath, samplePath } from "./path.ts"
export { profileResidualWeight } from "./mixture.ts"
export * from "./constants.ts"
export type { EnergyOptions, EnergyResult } from "./types.ts"

/** The field's model order, as the configuration would render. */
export type FieldOrder = "flat" | "two-flat" | "ramp"

/**
 * The geometries the ramp's position parameter can be read in.
 *
 * The order is the profile's tie-break order and is fixed here rather than derived from an object's
 * key order, so no `Object.keys` result can reorder a result.
 */
const GEOMETRY_ORDER = ["linear", "radial", "conic"] as const
type GeometryName = (typeof GEOMETRY_ORDER)[number]

/**
 * Each geometry is profiled in both directions — γ(t) and γ(1−t).
 *
 * **Why the direction is a nuisance and not a convention here.** `DESIGN.md` decision 5 fixes the
 * *emitter's* orientation: increasing `t` runs along the renderer's 135° axis. The measurement's
 * fitted axis is a different object — `src/measure/geometry.ts:fixAxisSign` points it *the way colour
 * increases*, tested on lightness then a then b, and its own docstring says so: **"a measurement-side
 * convention only"**. Scoring a configuration against an arbitrary sign convention would let a
 * correct palette be punished for the measurement's bookkeeping, so the sign is minimised out like
 * every other quantity the configuration does not name. For the radial and conic families the two
 * directions are genuinely different models (centre-out against edge-in, clockwise against
 * anticlockwise), which is a second reason both belong in the profile rather than one being assumed.
 */
const RAMP_DIRECTIONS = ["forward", "reversed"] as const
type RampDirection = (typeof RAMP_DIRECTIONS)[number]

/** `(δ/h)²` past which the Gaussian density is dropped. See `DENSITY_TRUNCATION_BANDWIDTHS`. */
const TRUNCATION_SQUARED = DENSITY_TRUNCATION_BANDWIDTHS * DENSITY_TRUNCATION_BANDWIDTHS

/** The escape literals as triples. [INHERITED] — `ESCAPE_COLORS` in `src/contract/constants.ts`. */
function escapeLiteralToRgb(literal: EscapeColorLiteral): Rgb8 {
	return literal === "#ffffff" ? [255, 255, 255] : [0, 0, 0]
}

/** `1 / ((2π)^{3/2} h³)` — the reciprocal normaliser of an isotropic OKLab Gaussian at bandwidth `h`. */
function inverseNormaliser(bandwidth: number): number {
	return 1 / (GAUSSIAN_NORMALISER_3D * bandwidth * bandwidth * bandwidth)
}

/**
 * Kernel and density from every triple to one colour.
 *
 * `kernel` is `κ(d) = exp(−d²/2h²)`, unnormalised — the quantity whose mass-weighted sum *is* the
 * smoothed mass, and what the mixture weights are built from. `density` is the same kernel divided by
 * its normaliser, which is what a cross-entropy needs. Both are written in one pass because the
 * bandwidth (the contract's pair rule: the larger of the two regional bars) is shared.
 */
function pointKernelAndDensity(
	lab: Float64Array,
	colorCount: number,
	tripleBar: Float64Array,
	tripleInverseNormaliser: Float64Array,
	targetLab: readonly [number, number, number],
	kernel: Float64Array,
	density: Float64Array,
): void {
	const targetBar = bandwidthOf(targetLab)
	const targetInverse = inverseNormaliser(targetBar)
	for (let row = 0; row < colorCount; row += 1) {
		const base = row * 3
		const deltaL = lab[base] - targetLab[0]
		const deltaA = lab[base + 1] - targetLab[1]
		const deltaB = lab[base + 2] - targetLab[2]
		const squared = deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
		const larger = tripleBar[row] > targetBar
		const bandwidth = larger ? tripleBar[row] : targetBar
		const ratio = squared / (bandwidth * bandwidth)
		if (ratio >= TRUNCATION_SQUARED) {
			kernel[row] = 0
			density[row] = 0
			continue
		}
		const value = Math.exp(-0.5 * ratio)
		kernel[row] = value
		density[row] = value * (larger ? tripleInverseNormaliser[row] : targetInverse)
	}
}

/**
 * Offsets into a joint's entry arrays, one per lattice cell.
 *
 * The entries are already in ascending `(cell, bin)` order — `joint.ts` sorts them on the packed key
 * — so the offsets are a single counting pass and the per-cell rows are contiguous. Nothing here
 * iterates a `Map`.
 */
function cellEntryOffsets(joint: TColorJoint, cellCount: number): Int32Array {
	const offsets = new Int32Array(cellCount + 1)
	for (let entry = 0; entry < joint.entryCount; entry += 1) offsets[joint.entryCell[entry] + 1] += 1
	for (let cell = 0; cell < cellCount; cell += 1) offsets[cell + 1] += offsets[cell]
	return offsets
}

/**
 * The ramp's field density: the path integral `∫ κ(φ(c), γ(t)) ν_c(t) dt`, evaluated on the joint's
 * t-bins.
 *
 * `ν_c` is the triple's **own** positional distribution — the row of the joint belonging to its
 * lattice cell, normalised to one. A triple whose mass sits at one end of the image weights the path
 * points near that end and nothing else, which is the positional coupling; a triple spread over the
 * whole image weights the whole path, and its density is correspondingly diluted. Where a cell has no
 * entries at all (it cannot, but the function is total) the global bin masses are used, which is the
 * uncoupled path integral arm A §2.3 writes.
 */
function rampFieldDensity(
	measurement: Measurement,
	joint: TColorJoint,
	tripleBar: Float64Array,
	tripleInverseNormaliser: Float64Array,
	pathLab: Float64Array,
	pathBar: Float64Array,
	pathInverse: Float64Array,
	offsets: Int32Array,
	density: Float64Array,
): void {
	const { lab, colorCount, pixelCount } = measurement.triples
	const { tripleCell, cellMass } = measurement.joints.lattice

	for (let row = 0; row < colorCount; row += 1) {
		const cell = tripleCell[row]
		const from = offsets[cell]
		const to = offsets[cell + 1]
		const mass = cellMass[cell]
		const usable = to > from && mass > 0
		const base = row * 3
		const pointL = lab[base]
		const pointA = lab[base + 1]
		const pointB = lab[base + 2]
		const bar = tripleBar[row]
		const inverse = tripleInverseNormaliser[row]

		let accumulated = 0
		if (usable) {
			for (let entry = from; entry < to; entry += 1) {
				const bin = joint.entryBin[entry]
				const weight = joint.entryMass[entry] / mass
				accumulated += weight * pointDensityAtBin(
					pointL, pointA, pointB, bar, inverse, pathLab, pathBar, pathInverse, bin,
				)
			}
		} else {
			for (let bin = 0; bin < joint.binCount; bin += 1) {
				const weight = pixelCount === 0 ? 0 : joint.binMass[bin] / pixelCount
				if (weight === 0) continue
				accumulated += weight * pointDensityAtBin(
					pointL, pointA, pointB, bar, inverse, pathLab, pathBar, pathInverse, bin,
				)
			}
		}
		density[row] = accumulated
	}
}

/** One triple against one path point. Split out only so the two loops above cannot drift apart. */
function pointDensityAtBin(
	pointL: number,
	pointA: number,
	pointB: number,
	bar: number,
	inverse: number,
	pathLab: Float64Array,
	pathBar: Float64Array,
	pathInverse: Float64Array,
	bin: number,
): number {
	const pathBase = bin * 3
	const deltaL = pointL - pathLab[pathBase]
	const deltaA = pointA - pathLab[pathBase + 1]
	const deltaB = pointB - pathLab[pathBase + 2]
	const squared = deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
	const larger = bar > pathBar[bin]
	const bandwidth = larger ? bar : pathBar[bin]
	const ratio = squared / (bandwidth * bandwidth)
	if (ratio >= TRUNCATION_SQUARED) return 0
	return Math.exp(-0.5 * ratio) * (larger ? inverse : pathInverse[bin])
}

/**
 * Split the data cost between the two populations, exactly.
 *
 * The cost of a triple is `−log ρ(c, ê_c)`, the **joint** over colour and extent (`support.ts`),
 * which factorises as `m(ê)·ρ(c | ê)` with
 *
 *     ρ(c | ê) = π·[(1−ε)ρ_field + ε·ρ₀]  +  (1−π)·[(1−ε)ρ_ink + ε·ρ₀]
 *
 * so each population's *contribution to the joint density* is `m(ê)` times its bracket times its
 * prior, and those two contributions sum to `ρ(c, ê)` identically. Splitting the triple's cost in
 * that ratio therefore makes `terms.field + terms.ink` equal the data cost **exactly**, with no
 * residue and no third bucket — the residual is shared between the two populations by the same prior
 * π that governs everything else, rather than being reported as a term nobody can act on.
 *
 * `m(ê)` is a common factor of both contributions, so it does not move the *ratio* — it moves the
 * *size* of each triple's cost, by `−log m(ê_c)` nats per unit mass, and that premium is then split
 * by the same responsibilities. A triple the profile has called ink and whose extent says it is broad
 * therefore pays its support price inside `terms.ink`, which is `DESIGN.md` decision 9's requirement.
 */
function attributeCost(
	massShare: Float64Array,
	membership: Float64Array,
	fieldDensity: Float64Array,
	inkDensity: Float64Array,
	supportNats: Float64Array,
	residualWeight: number,
	residualValue: number,
): { field: number; ink: number } {
	const modelShare = 1 - residualWeight
	const residualPart = residualWeight * residualValue
	let field = 0
	let ink = 0
	for (let row = 0; row < massShare.length; row += 1) {
		const mass = massShare[row]
		if (mass === 0) continue
		const share = membership[row]
		const fieldPart = share * (modelShare * fieldDensity[row] + residualPart)
		const inkPart = (1 - share) * (modelShare * inkDensity[row] + residualPart)
		const total = fieldPart + inkPart
		const cost = mass * (-Math.log(total) + supportNats[row])
		const fieldFraction = fieldPart / total
		field += cost * fieldFraction
		ink += cost * (1 - fieldFraction)
	}
	return { field, ink }
}

/** `Σ_c weight(c)·κ(c, target)` — the population-restricted smoothed mass of a role colour. */
function weightedSmoothedMass(weights: Float64Array, kernel: Float64Array): number {
	let total = 0
	for (let row = 0; row < weights.length; row += 1) total += weights[row] * kernel[row]
	return total
}

/**
 * Ω(x) — the structural element count, from the **declared** configuration.
 *
 * Arm A §2.3's list, exactly: surface distinct from background (1), ramp (1), each interior stop (1),
 * accent distinct from foreground (1). Read from the collapse flags and the gradient boolean rather
 * than from triple equality, because invariant 3 makes collapse a declaration — the published object
 * carries the structure it declares, and that is what λ prices.
 */
export function structuralCount(config: Configuration): number {
	const interiorStops = config.gradient ? Math.max(0, config.stops.length - 2) : 0
	return (
		(config.surfaceCollapsed ? 0 : 1) +
		(config.gradient ? 1 : 0) +
		interiorStops +
		(config.accentCollapsed ? 0 : 1)
	)
}

/** The field's model order, as the configuration would render. */
export function fieldOrderOf(config: Configuration): FieldOrder {
	if (config.gradient) return "ramp"
	return config.surfaceCollapsed ? "flat" : "two-flat"
}

/**
 * The energy of one configuration against one measurement.
 *
 * Cost, for the record: `O(K)` per role colour, `O(K · b̄)` for the ramp path density with `b̄` the
 * mean number of t-bins a lattice cell occupies, and `O((S+1) · G · K)` for the profile over split
 * scales and geometries. Everything is one allocation per array and no allocation inside a loop.
 */
export function energyOfA(
	measurement: Measurement,
	config: Configuration,
	options: EnergyOptions = {},
): EnergyResult {
	const lambda = options.lambda ?? DEFAULT_LAMBDA
	const { colorCount, counts, pixelCount, lab } = measurement.triples

	// --- the residual, and the per-triple constants every density shares ---------------------
	const gamutVolume = sRgbGamutVolumeOkLab()
	const residual = residualDensity()

	const massShare = new Float64Array(colorCount)
	const tripleBar = new Float64Array(colorCount)
	const tripleInverseNormaliser = new Float64Array(colorCount)
	for (let row = 0; row < colorCount; row += 1) {
		massShare[row] = pixelCount === 0 ? 0 : counts[row] / pixelCount
		const bar = bandwidthOf([lab[row * 3], lab[row * 3 + 1], lab[row * 3 + 2]])
		tripleBar[row] = bar
		tripleInverseNormaliser[row] = inverseNormaliser(bar)
	}

	// --- the configuration's colours, with the escape substituted where declared ---------------
	const escapedRole = config.escape === null ? null : config.escape.role
	const escapeRgb = config.escape === null ? null : escapeLiteralToRgb(config.escape.color)
	const backgroundRgb = escapedRole === "background" ? (escapeRgb as Rgb8) : config.background
	const foregroundRgb = escapedRole === "foreground" ? (escapeRgb as Rgb8) : config.foreground
	const surfaceRgb = config.surface
	const accentRgb = config.accent

	const order = fieldOrderOf(config)
	// A declared-distinct accent that names the identical triple is one kernel, not two: two kernels
	// inside the same point explain the ink mass no better than one (arm A §2.3), and collapsing them
	// here is arithmetic, not a decision — Ω still charges for the declaration.
	const accentIsSeparate =
		!config.accentCollapsed &&
		!(accentRgb[0] === foregroundRgb[0] &&
			accentRgb[1] === foregroundRgb[1] &&
			accentRgb[2] === foregroundRgb[2])

	// --- kernels and densities to each named colour --------------------------------------------
	const kernelBackground = new Float64Array(colorCount)
	const densityBackground = new Float64Array(colorCount)
	pointKernelAndDensity(
		lab, colorCount, tripleBar, tripleInverseNormaliser,
		rgbToOkLab(backgroundRgb), kernelBackground, densityBackground,
	)

	const kernelSurface = new Float64Array(colorCount)
	const densitySurface = new Float64Array(colorCount)
	if (order === "two-flat") {
		pointKernelAndDensity(
			lab, colorCount, tripleBar, tripleInverseNormaliser,
			rgbToOkLab(surfaceRgb), kernelSurface, densitySurface,
		)
	}

	const kernelForeground = new Float64Array(colorCount)
	const densityForeground = new Float64Array(colorCount)
	pointKernelAndDensity(
		lab, colorCount, tripleBar, tripleInverseNormaliser,
		rgbToOkLab(foregroundRgb), kernelForeground, densityForeground,
	)

	const kernelAccent = new Float64Array(colorCount)
	const densityAccent = new Float64Array(colorCount)
	if (accentIsSeparate) {
		pointKernelAndDensity(
			lab, colorCount, tripleBar, tripleInverseNormaliser,
			rgbToOkLab(accentRgb), kernelAccent, densityAccent,
		)
	}

	// --- the ramp's path density, one array per (geometry, direction) candidate -----------------
	const rampCandidates: { geometry: GeometryName; direction: RampDirection }[] = []
	const rampDensities: Float64Array[] = []
	if (order === "ramp") {
		const path = buildColorPath(config)
		const cellCount = measurement.joints.lattice.cellCount
		for (const geometry of GEOMETRY_ORDER) {
			const joint = measurement.joints[geometry]
			const offsets = cellEntryOffsets(joint, cellCount)
			for (const direction of RAMP_DIRECTIONS) {
				// γ is evaluated at each t-bin's centre — the bin is a quantile of image mass, so its
				// centre is the position that bin's mass represents. Once per candidate, not per triple.
				const pathLab = new Float64Array(joint.binCount * 3)
				const pathBar = new Float64Array(joint.binCount)
				const pathInverse = new Float64Array(joint.binCount)
				for (let bin = 0; bin < joint.binCount; bin += 1) {
					const centre = (joint.binEdges[bin] + joint.binEdges[bin + 1]) / 2
					samplePath(path, direction === "forward" ? centre : 1 - centre, pathLab, bin * 3)
					const bar = bandwidthOf([pathLab[bin * 3], pathLab[bin * 3 + 1], pathLab[bin * 3 + 2]])
					pathBar[bin] = bar
					pathInverse[bin] = inverseNormaliser(bar)
				}
				const density = new Float64Array(colorCount)
				rampFieldDensity(
					measurement, joint, tripleBar, tripleInverseNormaliser,
					pathLab, pathBar, pathInverse, offsets, density,
				)
				rampCandidates.push({ geometry, direction })
				rampDensities.push(density)
			}
		}
	}

	// --- the profile over split scale and geometry ---------------------------------------------
	const ladder = extentLadderOf(measurement)
	const rungs = extentRungsPerTriple(measurement, ladder)
	const grid = splitScaleGrid(ladder)

	const membership = new Float64Array(colorCount)
	const fieldModel = new Float64Array(colorCount)
	const inkModel = new Float64Array(colorCount)
	const combined = new Float64Array(colorCount)
	const fieldMass = new Float64Array(colorCount)
	const supportNats = new Float64Array(colorCount)

	// The two ink kernels are mixed at equal weight when the accent is declared distinct.
	//
	// This is the one weighting the spec left open. The field's two-flat mixture is weighted by the
	// components' smoothed masses because the configuration *orders* those two colours (`DESIGN.md`
	// decision 5: "the larger field mass is the background"), so a mass-proportional mixture reads a
	// fact the configuration already asserts. Foreground and accent carry no such ordering — the
	// configuration says which mark colour is which role and nothing about how the ink population
	// divides between them — so a uniform prior over the two is the honest reading of "the
	// configuration does not say", and it costs no constant. Its behavioural consequence, stated:
	// declaring a distinct accent dilutes the foreground's kernel by `ln 2` nats per unit of
	// foreground mass, so a second ink colour repays its own declaration before λ is consulted.
	const weightForeground = accentIsSeparate ? 0.5 : 1
	const weightAccent = 1 - weightForeground
	for (let row = 0; row < colorCount; row += 1) {
		inkModel[row] = accentIsSeparate
			? weightForeground * densityForeground[row] + weightAccent * densityAccent[row]
			: densityForeground[row]
	}

	let best = {
		energy: Number.POSITIVE_INFINITY,
		splitScaleRung: 0,
		geometry: "none" as GeometryName | "none",
		direction: "none" as RampDirection | "none",
		fieldCost: 0,
		inkCost: 0,
		residualWeight: 1,
		iterations: 0,
		fieldMassFraction: 0,
		weightBackground: 1,
		weightSurface: 0,
		supportCost: 0,
		fieldPrior: 0,
	}

	for (let gridIndex = 0; gridIndex < grid.length; gridIndex += 1) {
		const splitScaleRung = grid[gridIndex]
		fieldMembership(rungs, splitScaleRung, membership)
		// The extent half of the joint code (`support.ts`). It depends on the split scale and on the
		// image's own extents, and on nothing the configuration names — which is exactly why it can
		// stop a configuration from buying a convenient split scale for free.
		extentSupportNats(rungs, splitScaleRung, ladder, supportNats)
		const supportCost = weightedSupportCost(massShare, supportNats)
		const fieldPrior = extentFieldPrior(splitScaleRung, ladder)
		let fieldMassFraction = 0
		for (let row = 0; row < colorCount; row += 1) {
			const field = membership[row] * massShare[row]
			fieldMass[row] = field
			fieldMassFraction += field
		}

		for (let candidate = 0; candidate < (order === "ramp" ? rampCandidates.length : 1); candidate += 1) {
			let weightBackground = 1
			let weightSurface = 0
			// The ramp's and the flat order's model densities are already exactly the arrays computed
			// above, so they are used in place; only the two-flat mixture has to be assembled per split
			// scale, because its weights are the field-weighted smoothed masses.
			let field = order === "ramp" ? rampDensities[candidate] : densityBackground
			if (order === "two-flat") {
				field = fieldModel
				const fieldMassBackground = weightedSmoothedMass(fieldMass, kernelBackground)
				const fieldMassSurface = weightedSmoothedMass(fieldMass, kernelSurface)
				const fieldTotal = fieldMassBackground + fieldMassSurface
				weightBackground = fieldTotal > 0 ? fieldMassBackground / fieldTotal : 0.5
				weightSurface = 1 - weightBackground
				for (let row = 0; row < colorCount; row += 1) {
					fieldModel[row] =
						weightBackground * densityBackground[row] + weightSurface * densitySurface[row]
				}
			}

			// `π·ρ_field^model + (1−π)·ρ_ink^model`. The single residual mixes in around it — see the
			// module header on why the residual is one population and not two.
			for (let row = 0; row < colorCount; row += 1) {
				const share = membership[row]
				combined[row] = share * field[row] + (1 - share) * inkModel[row]
			}
			// ε is profiled on the *conditional* colour code alone, and legitimately so: `m(ê)` is a
			// factor of the joint that does not contain ε, so it is an additive constant in the
			// log-likelihood being maximised and cannot move the fixed point. The support cost is added
			// afterwards, which is an identity and not an approximation.
			const fit = profileResidualWeight(massShare, combined, residual)
			const jointCost = fit.cost + supportCost

			// Strict `<`: a tie is kept by the earlier grid point, so the profile's answer is a function
			// of the grid order and not of floating-point noise between equal candidates.
			if (jointCost < best.energy) {
				const attributed = attributeCost(
					massShare, membership, field, inkModel, supportNats, fit.residualWeight, residual,
				)
				best = {
					energy: jointCost,
					splitScaleRung,
					geometry: order === "ramp" ? rampCandidates[candidate].geometry : "none",
					direction: order === "ramp" ? rampCandidates[candidate].direction : "none",
					fieldCost: attributed.field,
					inkCost: attributed.ink,
					residualWeight: fit.residualWeight,
					iterations: fit.iterations,
					fieldMassFraction,
					weightBackground,
					weightSurface,
					supportCost,
					fieldPrior,
				}
			}
		}
	}

	// --- the structural and escape charges ------------------------------------------------------
	const omega = structuralCount(config)
	const structural = lambda * omega
	// bits → nats: one bit is `ln 2` nats, so the emit layer's 1024-bit barrier is 1024·ln2 ≈ 709.78
	// nats. See `ESCAPE_COST_NATS`; nothing else from `src/emit/cost.ts` enters arm A's energy, which
	// prices structure with λ·Ω rather than with L(P).
	const escape = config.escape === null ? 0 : ESCAPE_COST_NATS

	const total = best.fieldCost + best.inkCost + structural + escape

	return {
		total,
		terms: {
			field: best.fieldCost,
			ink: best.inkCost,
			structural,
			escape,
		},
		nuisance: {
			version: ENERGY_A_VERSION,
			fieldOrder: order,
			geometry: best.geometry,
			geometryDirection: best.direction,
			splitScaleRung: best.splitScaleRung,
			splitScaleExtent: rungToExtent(best.splitScaleRung, ladder),
			// π₀ — the split scale read as the joint model's population prior (`support.ts`), and the
			// support term it buys. `extentSupportCost` is already *inside* `terms.field + terms.ink`;
			// it is reported so the two halves of the joint code can be read apart.
			fieldPrior: best.fieldPrior,
			extentSupportCost: best.supportCost,
			fieldMassFraction: best.fieldMassFraction,
			inkMassFraction: 1 - best.fieldMassFraction,
			residualWeight: best.residualWeight,
			fieldWeightBackground: best.weightBackground,
			fieldWeightSurface: best.weightSurface,
			inkWeightForeground: weightForeground,
			inkWeightAccent: weightAccent,
			emIterations: best.iterations,
			omega,
			lambda,
			residualDensity: residual,
			gamutVolume,
		},
	}
}

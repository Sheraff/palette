/**
 * **The field model** — `BuildFieldHypotheses` (P6 module W3, `arm-e-prime.md` §2.3).
 *
 * Restrict to field-like mass, fit a 0-dimensional and a 1-dimensional model to the measure Φ it
 * forms on OKLab, compare description lengths, and hand the energy a small ranked set of
 * hypotheses. **This module does not decide whether the field is a gradient.** Proposal §2.5:
 * *"Carry a small number of field hypotheses — the 0-D model, the 1-D model, the best alternative
 * second-field candidates — and evaluate the full energy under each, so the field decision is not
 * taken before the roles that depend on it."*
 *
 * ## The description lengths, and what is free in them
 *
 * Both models code the same object — the residual of Φ about the model — against the same noise
 * scale, which is **inherited, not free**: the contract's regional same-colour bar at the field's
 * own colour. Per unit field mass, in nats:
 *
 * ```
 * DL₀ = ½·ln((V₀ + σ²) / σ²)                       V₀ = trace(Σ)
 * DL₁ = ½·ln((V₁ + σ²) / σ²) + rate × parameters   V₁ = V₀ − λ₁·R²
 * ```
 *
 * **Neither model is charged for projecting its fitted colours onto exact artwork pixels**, and the
 * omission is deliberate rather than an oversight. Charging it would bias the comparison toward the
 * gradient in exactly the case the proposal names as hard: two flat areas of different colour leave
 * Φ's mean in a gap the artwork does not populate, so the flat model's projection is expensive and
 * the ramp's two end projections are free — measured here, that inflated the two-region gain from
 * `ln 2` to 1.04 nats and turned the hard case into a gradient. It would also double-count: how
 * well a published triple represents its own neighbourhood is the energy's **representativeness**
 * term (§2.4), which is W4's and is deliberately the smallest one. The projection distance is
 * reported in `FieldModelReport` so the energy can price it once, in the place that owns it.
 *
 * `λ₁` is Φ's leading eigenvalue and `R²` the share of position-along-segment explained by a
 * regression against image coordinates, so **the 1-D model pays for its parameters out of the
 * variance that regression explains** — the second half of §2.3's requirement, without which two
 * flat areas of different colour read exactly like a ramp. `rate` is free parameter 6 and arrives
 * as an argument: SPEC rule 4 puts every exchange rate in `src/energy/rates.ts` and nowhere else.
 * `FIELD_DL_STEP_REJECTION_FLOOR` in `constants.ts` is the analytic value that rate must clear.
 *
 * ## What is inherited and therefore not decided here
 *
 * The same-colour bar (noise scale, and the degeneracy test on the ends), the excursion multiple,
 * the 135° rendering ruling that fixes which end is the background, and the guide-stop semantics
 * that admit an interior stop only for excursion reduction. Each is cited at its use.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColor, sameColorBar } from "../../../../src/contract/color.ts"
import type { OkLab } from "../../../../src/contract/types.ts"
import type {
	BuildFieldHypotheses,
	DistinctTriple,
	ExchangeRates,
	FieldHypothesis,
	FieldStop,
	Lattice,
	Substrate,
} from "../types.ts"
import {
	FIELD_1D_EXTRA_PARAMETERS,
	FIELD_HYPOTHESIS_COUNT,
	FIELD_MODE_SEPARATION_BANDWIDTHS,
	MAX_PUBLISHED_GRADIENT_STOPS,
	tripleOrderKey,
} from "./constants.ts"
import { insertGuideStop, measureExcursion } from "./excursion.ts"
import { type FieldMeasure, measureFieldMass } from "./measure.ts"

/**
 * The only rate this module reads, and it reads it from its argument. Declared as a `Pick` of the
 * energy's registry so `tools/sensitivity.ts` can perturb the whole registry and pass it straight
 * through.
 */
export type FieldModelRates = Readonly<Pick<ExchangeRates, "fieldDescriptionLength">>

/** Everything the fit saw, for tests, the survivor table and the sensitivity harness. */
export type FieldModelReport = Readonly<{
	measure: FieldMeasure
	/** The noise scale both description lengths are coded against: the inherited same-colour bar. */
	noiseScale: number
	/** Description length of the best 0-D model — the flat hypothesis about Φ's mean. */
	descriptionLength0D: number
	/** Description length of the 1-D model, parameters included. */
	descriptionLength1D: number
	/**
	 * How far the published flat colour sits from Φ's mean. Not charged to any description length —
	 * see the file docstring — and reported so the energy's representativeness term can price it
	 * once, where that decision belongs.
	 */
	projectionDistance: number
	/** Why no gradient hypothesis was offered, when none was. */
	gradientRefusal: "none" | "no-extent" | "ends-within-same-colour-bar"
	hypotheses: readonly FieldHypothesis[]
}>

/**
 * Rank the field hypotheses for one artwork.
 *
 * **Deviation from `src/types.ts`, reported to the orchestrator:** the declared interface is
 * `(substrate, lattice) => FieldHypothesis[]`, with no place for the description-length exchange
 * rate that §2.3 and free parameter 6 both require, and SPEC rule 4 forbids a module-local
 * constant for it. This function therefore takes the rate as a third argument and
 * `fieldModelWithRates` supplies a `BuildFieldHypotheses`-shaped adapter, so nothing downstream has
 * to change if the orchestrator amends the interface to pass rates explicitly.
 */
export function buildFieldHypotheses(
	substrate: Substrate,
	lattice: Lattice,
	rates: FieldModelRates,
): readonly FieldHypothesis[] {
	return buildFieldModel(substrate, lattice, rates).hypotheses
}

/** The `BuildFieldHypotheses` adapter: bind the rate registry, get the declared interface. */
export function fieldModelWithRates(rates: FieldModelRates): BuildFieldHypotheses {
	return (substrate, lattice) => buildFieldHypotheses(substrate, lattice, rates)
}

/** The full fit, diagnostics included. */
export function buildFieldModel(
	substrate: Substrate,
	lattice: Lattice,
	rates: FieldModelRates,
): FieldModelReport {
	const rate = rates.fieldDescriptionLength
	if (!Number.isFinite(rate) || rate < 0) {
		throw new RangeError(`fieldDescriptionLength must be a finite non-negative rate, got ${rate}`)
	}
	if (lattice.triples.length === 0) {
		throw new RangeError("the field model needs a non-empty feasible set of artwork triples")
	}

	const measure = measureFieldMass(substrate)
	const centre = lattice.nearestTriple(measure.mean)

	// The noise scale: the contract's own bar at the field's colour, region-dependent as the
	// contract defines it. Inherited, not free — §2.3's "the colour threshold in this decision is
	// inherited". One scale is used for every hypothesis so the description lengths are comparable.
	const centreColor = colorFromRgb(centre.rgb)
	const noiseScale = sameColorBar(centreColor, centreColor)
	const noiseVariance = noiseScale * noiseScale

	// The 0-D model: one point plus noise. Every flat hypothesis is this same model — they differ
	// only in which exact artwork pixel publishes its point, which is a question for the energy's
	// representativeness term and not for the description length.
	const descriptionLength0D = 0.5 * Math.log((measure.totalVariance + noiseVariance) / noiseVariance)
	const descriptionLength1D = 0.5 * Math.log((measure.residualVariance1D + noiseVariance) / noiseVariance) +
		rate * FIELD_1D_EXTRA_PARAMETERS

	const flat = (triple: DistinctTriple): FieldHypothesis => {
		const stop: FieldStop = { triple, t: 0 }
		return {
			kind: "flat",
			stops: [stop],
			descriptionLength: descriptionLength0D,
			maxExcursion: measureExcursion([stop], lattice).maxDistance,
		}
	}

	const gradient = buildGradientHypothesis(measure, lattice, descriptionLength1D)

	// Flat candidates: Φ's mean projected onto the artwork (invariant 2 — the lattice is quadrature,
	// never a publication route), plus Φ's density modes, which is where the alternative second
	// field comes from. Ranked by field mass, so the energy inherits a reason rather than an
	// accident.
	const flatCandidates = collectFlatCandidates(lattice, centre)
	const bestFlat = flat(flatCandidates[0].triple)
	const separation = FIELD_MODE_SEPARATION_BANDWIDTHS * lattice.bandwidth
	const bestFlatLab = rgbToOkLab(flatCandidates[0].triple.rgb)
	const alternativeTriple = flatCandidates.slice(1).find(
		(candidate) => okLabDistance(rgbToOkLab(candidate.triple.rgb), bestFlatLab) > separation,
	)
	const alternative = alternativeTriple === undefined ? undefined : flat(alternativeTriple.triple)

	// Assembly order is the declared tie-break for equal description lengths (see
	// `compareHypotheses`): best flat, gradient, alternative field.
	const hypotheses = [bestFlat, gradient.hypothesis, alternative]
		.filter((hypothesis): hypothesis is FieldHypothesis => hypothesis !== undefined)
		.sort(compareHypotheses)
		.slice(0, FIELD_HYPOTHESIS_COUNT)

	return {
		measure,
		noiseScale,
		descriptionLength0D,
		descriptionLength1D,
		projectionDistance: okLabDistance(rgbToOkLab(bestFlat.stops[0].triple.rgb), measure.mean),
		gradientRefusal: gradient.refusal,
		hypotheses,
	}
}

/**
 * The 1-D hypothesis: ends, orientation, stops.
 *
 * **The ends are the two field roles.** `PHASE_1_AUTHOR_BRIEF.md` §3.1, the reviewer verbatim:
 * *"when the field is a gradient, the first stop is the `background` and the last stop is the
 * `surface`"* — so the fitter does not choose them independently and there is nothing to decide
 * here beyond which end is which.
 *
 * **Which end is the background follows the artwork's own orientation** (§2.3): the consumer
 * renders a 135° linear gradient, whose first stop sits at the top-left, so the background is the
 * end whose mass sits toward the top-left under the fitted regression. `slopeU + slopeV` is exactly
 * the fitted rate of change of position-along-segment along the top-left → bottom-right diagonal:
 * positive means `t` grows away from the top-left, so the segment's low end is the background.
 *
 * **Degeneracy is inherited, not free** (§2.3): *"if the segment's ends are within the same-colour
 * bar they are the same colour, the ramp is degenerate, and the 0-D model wins by construction."*
 * Tested on the projected exact pixels, not on the fitted points — `CONTRACT_DEFECTS.md` N7: the
 * fitted endpoints must be projected onto exact pixels before anything is measured about them,
 * because the player interpolates between published colours.
 */
function buildGradientHypothesis(
	measure: FieldMeasure,
	lattice: Lattice,
	descriptionLength: number,
): Readonly<{ hypothesis?: FieldHypothesis; refusal: "none" | "no-extent" | "ends-within-same-colour-bar" }> {
	if (!(measure.leadingVariance > 0) || !(measure.tHigh > measure.tLow)) {
		return { refusal: "no-extent" }
	}

	const pointAt = (t: number): OkLab => [
		measure.mean[0] + t * measure.direction[0],
		measure.mean[1] + t * measure.direction[1],
		measure.mean[2] + t * measure.direction[2],
	]
	const lowTriple = lattice.nearestTriple(pointAt(measure.tLow))
	const highTriple = lattice.nearestTriple(pointAt(measure.tHigh))
	const lowColor = colorFromRgb(lowTriple.rgb)
	const highColor = colorFromRgb(highTriple.rgb)
	if (sameColor(lowColor, highColor)) return { refusal: "ends-within-same-colour-bar" }

	const lowIsBackground = measure.towardBottomRight > 0 ||
		// Exactly zero: no 135° component at all. Fall back to the declared total order rather than
		// to whichever end the eigenvector's sign convention happened to produce.
		(measure.towardBottomRight === 0 && tripleOrderKey(lowTriple.rgb) <= tripleOrderKey(highTriple.rgb))
	const background = lowIsBackground ? lowTriple : highTriple
	const surface = lowIsBackground ? highTriple : lowTriple

	let stops: readonly FieldStop[] = [{ triple: background, t: 0 }, { triple: surface, t: 1 }]
	let profile = measureExcursion(stops, lattice)

	// Guide stops: excursion reduction only, at the peak, re-measured until the profile clears the
	// inherited bar or nothing reduces it further.
	while (stops.length < MAX_PUBLISHED_GRADIENT_STOPS && profile.maxInBars > 1) {
		const inserted = insertGuideStop(stops, lattice, profile)
		if (inserted === null) break
		stops = inserted.stops
		profile = inserted.profile
	}

	// A fourth stop is reported with its evidence and never published: the contract makes it
	// negotiable-on-proof rather than granted (§2.3; brief §3.1).
	let reportedFourthStop: FieldHypothesis["reportedFourthStop"]
	if (profile.maxInBars > 1 && stops.length === MAX_PUBLISHED_GRADIENT_STOPS) {
		const fourth = insertGuideStop(stops, lattice, profile)
		if (fourth !== null) {
			// The evidence a negotiation needs is the excursion the published stops leave behind.
			reportedFourthStop = { stop: fourth.stop, excursionEvidence: profile.maxDistance }
		}
	}

	return {
		hypothesis: {
			kind: "gradient",
			stops,
			descriptionLength,
			maxExcursion: profile.maxDistance,
			...(reportedFourthStop === undefined ? {} : { reportedFourthStop }),
		},
		refusal: "none",
	}
}

/** One flat candidate and the field mass that ranks it. */
type FlatCandidate = Readonly<{ triple: DistinctTriple; density: number }>

/**
 * The flat hypotheses' candidate colours, ranked by Φ's own density.
 *
 * Density is the lattice's `presence × fieldLikeness` — the field-weighted neighbourhood mass at a
 * colour, both factors area integrals of bandwidth `h` (§2.2), so this is Φ read through the same
 * quadrature as everything else rather than a second estimator. One `statsAt` read per distinct
 * triple: the linear pass the proposal prices at ≈30 ms.
 *
 * The candidates are Φ's mean projected onto the artwork, Φ's densest colour, and Φ's next densest
 * colour at least `FIELD_MODE_SEPARATION_BANDWIDTHS` bandwidths away — the last being where "the
 * best alternative second field" (§2.5) comes from. Ranked by density descending, ties on the
 * declared total order.
 */
function collectFlatCandidates(lattice: Lattice, centre: DistinctTriple): readonly FlatCandidate[] {
	const triples = lattice.triples
	const scores = new Float64Array(triples.length)
	for (let index = 0; index < triples.length; index++) {
		const stats = lattice.statsAt(triples[index].lab)
		const score = stats.presence * stats.fieldLikeness
		scores[index] = Number.isFinite(score) && score > 0 ? score : 0
	}

	const better = (index: number, incumbent: number): boolean =>
		incumbent < 0 || scores[index] > scores[incumbent] ||
		(scores[index] === scores[incumbent] &&
			tripleOrderKey(triples[index].rgb) < tripleOrderKey(triples[incumbent].rgb))

	let first = -1
	for (let index = 0; index < triples.length; index++) {
		if (better(index, first)) first = index
	}

	const separation = FIELD_MODE_SEPARATION_BANDWIDTHS * lattice.bandwidth
	let second = -1
	if (first >= 0) {
		const firstLab = rgbToOkLab(triples[first].rgb)
		for (let index = 0; index < triples.length; index++) {
			if (index === first) continue
			if (okLabDistance(rgbToOkLab(triples[index].rgb), firstLab) <= separation) continue
			if (better(index, second)) second = index
		}
	}

	const centreKey = tripleOrderKey(centre.rgb)
	let centreDensity = 0
	for (let index = 0; index < triples.length; index++) {
		if (tripleOrderKey(triples[index].rgb) === centreKey) centreDensity = scores[index]
	}

	const candidates: FlatCandidate[] = [{ triple: centre, density: centreDensity }]
	const seen = new Set<number>([centreKey])
	for (const index of [first, second]) {
		if (index < 0) continue
		const key = tripleOrderKey(triples[index].rgb)
		if (seen.has(key)) continue
		seen.add(key)
		candidates.push({ triple: triples[index], density: scores[index] })
	}

	return candidates.sort((left, right) =>
		right.density !== left.density
			? right.density - left.density
			: tripleOrderKey(left.triple.rgb) - tripleOrderKey(right.triple.rgb)
	)
}

/**
 * The declared ranking. Description length ascending; then the model with fewer parameters (flat
 * before gradient — the MDL convention, and the conservative direction for a gradient boolean);
 * then **assembly order**, which `Array.prototype.sort`'s stability preserves. Assembly order is
 * best flat, gradient, alternative field, and each of those is itself deterministic: the flats are
 * ranked by Φ's density with the declared total order on the 8-bit triple as their tie-break. So
 * every tie is resolved by something reachable only on an exact tie and reading nothing outside the
 * pixel values (SPEC rule 1).
 *
 * Two flat hypotheses always tie on description length by construction — they are the same 0-D
 * model published through different exact pixels — so this path is ordinary rather than exotic.
 */
function compareHypotheses(first: FieldHypothesis, second: FieldHypothesis): number {
	if (first.descriptionLength !== second.descriptionLength) {
		return first.descriptionLength - second.descriptionLength
	}
	if (first.kind !== second.kind) return first.kind === "flat" ? -1 : 1
	return 0
}

export { measureFieldMass } from "./measure.ts"
export type { FieldMeasure } from "./measure.ts"
export { measureExcursion } from "./excursion.ts"
export type { ExcursionProfile } from "./excursion.ts"

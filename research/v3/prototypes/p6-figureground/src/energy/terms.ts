/**
 * # The unary terms — belonging, role fitness, representativeness.
 *
 * Proposal §2.4's three unary terms, one cost per (role, candidate triple) pair. Everything here is
 * a pure function of a `CandidateStats` read from the lattice, the chosen field, and the exchange
 * rates; **no number is written in this file** — every constant comes from `./rates.ts`, which is
 * `SPEC.md` rule 4.
 *
 * ## The shape all three share, and why it is worth stating
 *
 * Each term is dimensionless and each has a *declared range*, because a rate between two terms only
 * means something if the terms it trades have comparable scales:
 *
 * - **belonging** is a log-ratio against a measured corpus reference, spanning roughly ±5 over the
 *   presence range the corpus actually exhibits, and unbounded in principle — deliberately, because
 *   proposal §2.4 term 1 forbids a cutoff and a bounded belonging cost is a cutoff with better
 *   manners.
 * - **role misfit** is `1 −` a product of factors each in [0,1], so it lives in [0,1] exactly.
 * - **representativeness** is a distance in units of the contract's same-colour bar, typically 0–3.
 *
 * ## Scale normalisation, and the one thing it costs
 *
 * Ink energy and mark energy are area integrals in no natural unit, so a role-fitness factor built
 * from them has to be normalised. It is normalised **per image, by the maximum over the artwork's
 * own enumerated triples** — never by a constant, which would be an invented scale, and never by a
 * corpus statistic, which would be a table the runtime is forbidden to read
 * (`PHASE_1_AUTHOR_BRIEF.md` §3.1: "the algorithm never reads a table").
 *
 * The honest cost of that choice, stated because it is a real fragility: a single outlier triple
 * sets the scale, so an artwork with one extreme ink pixel compresses every other candidate's ink
 * score. The alternative — a robust quantile — would introduce a quantile *choice*, which is a free
 * parameter this design does not want and `README.md`'s ledger does not carry. Recorded as an open
 * item rather than resolved by taste.
 */

import { okLabDistance } from "../../../../src/contract/color.ts"
import type { OkLab } from "../../../../src/contract/types.ts"
import type { CandidateStats, ExchangeRates } from "../types.ts"
import { ENERGY_ANCHORS } from "./rates.ts"

// ---------------------------------------------------------------------------------------------
// The field a candidate is judged against
// ---------------------------------------------------------------------------------------------

/**
 * The chosen field as the terms see it: the OKLab polyline the hypothesis's stops describe.
 *
 * A flat hypothesis is a one-point polyline; a gradient is the straight segment (or two) between
 * its stops. "Sits on the field" is measured against the whole path rather than against the stops,
 * because the field a mark actually sits on is the rendered continuum — the same reading of "the
 * field" that `src/contract/ramp.ts` takes for contrast.
 */
export type FieldPath = readonly OkLab[]

/** Squared distance from `point` to the segment `[from, to]`, in OKLab. */
function distanceToSegment(point: OkLab, from: OkLab, to: OkLab): number {
	const dx = to[0] - from[0]
	const dy = to[1] - from[1]
	const dz = to[2] - from[2]
	const lengthSquared = dx * dx + dy * dy + dz * dz
	if (lengthSquared === 0) return okLabDistance(point, from)
	const t = ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy + (point[2] - from[2]) * dz) /
		lengthSquared
	const clamped = t < 0 ? 0 : t > 1 ? 1 : t
	return okLabDistance(point, [
		from[0] + dx * clamped,
		from[1] + dy * clamped,
		from[2] + dz * clamped,
	])
}

/** OKLab distance from a point to the field path. */
export function distanceToField(point: OkLab, field: FieldPath): number {
	if (field.length === 0) return Number.POSITIVE_INFINITY
	if (field.length === 1) return okLabDistance(point, field[0])
	let best = Number.POSITIVE_INFINITY
	for (let index = 0; index + 1 < field.length; index++) {
		const distance = distanceToSegment(point, field[index], field[index + 1])
		if (distance < best) best = distance
	}
	return best
}

/**
 * **Sits-on-the-field weight** — how much of a candidate's habitual ground coincides with the
 * chosen field.
 *
 * Proposal §2.4 terms 2 (foreground) and 2 (accent) both ask for this: the artwork's own lettering
 * colour is the natural foreground because the colour it habitually sits on *is* the field, and an
 * accent is an accent only if it marks the field rather than something else. `CandidateStats`
 * carries `habitualGround` — the mass-weighted mean surround of the candidate's pixels — precisely
 * so this is answerable before the roles are assigned.
 *
 * A Gaussian in units of the contract's same-colour bar: coincident grounds score 1, a ground a few
 * bars off the field scores ~0, and nothing is ever excluded.
 */
export function groundCoincidence(stats: CandidateStats, field: FieldPath): number {
	const distance = distanceToField(stats.habitualGround, field)
	if (!Number.isFinite(distance)) return 0
	const bars = distance / ENERGY_ANCHORS.groundCoincidenceScale
	return Math.exp(-0.5 * bars * bars)
}

// ---------------------------------------------------------------------------------------------
// Term 1 — belonging
// ---------------------------------------------------------------------------------------------

/**
 * **Belonging**, a decreasing function of presence mass with **no cutoff** (proposal §2.4 term 1).
 *
 * `ln(reference / M)`. Zero at the corpus's median endorsed neighbourhood share, negative above it,
 * positive below it, finite everywhere a real triple can land, and a *cost* rather than a rule —
 * which is the whole answer to `PHASE_1_AUTHOR_BRIEF.md` §3.1 open question 2. A rare colour is not
 * dropped; it is charged, and it can outweigh the charge by being right about everything else.
 */
export function belongingCost(stats: CandidateStats): number {
	const presence = Math.max(stats.presence, ENERGY_ANCHORS.presenceFloor)
	return Math.log(ENERGY_ANCHORS.endorsedPresenceReference / presence)
}

// ---------------------------------------------------------------------------------------------
// Term 2 — role fitness
// ---------------------------------------------------------------------------------------------

/**
 * The per-image scales the role-fitness integrals are normalised by.
 *
 * Computed once per (image, rates) in a single linear pass over the artwork's triples. It depends
 * on `rates` because the accent's energy is the anisotropic combination `E_C + λ·E_L`, whose scale
 * moves with λ — so a sensitivity perturbation of `accentAnisotropy` re-derives the scale rather
 * than silently rescaling every accent score.
 */
export type FitnessScales = Readonly<{
	maxInkEnergy: number
	maxAccentEnergy: number
	maxAccentDensity: number
}>

/** The anisotropic accent energy `E_C + λ·E_L` — chroma/hue excursion plus λ times lightness. */
export function accentEnergy(stats: CandidateStats, rates: ExchangeRates): number {
	return stats.markEnergy + rates.accentAnisotropy * stats.inkEnergy
}

/** Accent energy per unit presence — the "saliency per unit area" factor of proposal §2.4. */
export function accentDensity(stats: CandidateStats, rates: ExchangeRates): number {
	return accentEnergy(stats, rates) / Math.max(stats.presence, ENERGY_ANCHORS.presenceFloor)
}

export function computeFitnessScales(
	allStats: readonly CandidateStats[],
	rates: ExchangeRates,
): FitnessScales {
	let maxInkEnergy = 0
	let maxAccentEnergy = 0
	let maxAccentDensity = 0
	for (const stats of allStats) {
		if (stats.inkEnergy > maxInkEnergy) maxInkEnergy = stats.inkEnergy
		const energy = accentEnergy(stats, rates)
		if (energy > maxAccentEnergy) maxAccentEnergy = energy
		const density = accentDensity(stats, rates)
		if (density > maxAccentDensity) maxAccentDensity = density
	}
	return { maxInkEnergy, maxAccentEnergy, maxAccentDensity }
}

function ratio(value: number, scale: number): number {
	if (!(scale > 0) || !Number.isFinite(scale)) return 0
	const share = value / scale
	return share <= 0 ? 0 : share >= 1 ? 1 : share
}

/**
 * **Field fitness** — the factor background and surface are scored on.
 *
 * `fieldLikeness × spatialSpread × borderAffinity`, exactly as proposal §2.4 term 2 states it, with
 * the two unbounded factors expressed against their own neutral values (`ENERGY_ANCHORS`): spread
 * against a uniform frame-wide fill, border affinity against no-preference. All three factors are
 * in [0,1], so the product is, and the misfit is `1 −` it.
 *
 * **Both statistics arrive already normalised against those neutral values** — `spatialSpread` is
 * `trace / (1/6)` and `borderAffinity` is `annulus share / annulus area share` — so both anchors are
 * 1.0 and the `ratio` here is a clamp with its neutral value named rather than a rescale. Until
 * 2026-08-04 `uniformSpatialSpread` was `1/6` and this line divided the producer's already-normalised
 * value a second time (SPEC integration directive 8): the spread factor saturated at one sixth of a
 * uniform fill, which is `tests/semantics.test.ts`'s pinned measurement.
 */
export function fieldFitness(stats: CandidateStats): number {
	const spread = ratio(stats.spatialSpread, ENERGY_ANCHORS.uniformSpatialSpread)
	const border = ratio(stats.borderAffinity, ENERGY_ANCHORS.borderNeutralAffinity)
	const likeness = stats.fieldLikeness <= 0 ? 0 : stats.fieldLikeness >= 1 ? 1 : stats.fieldLikeness
	return likeness * spread * border
}

/**
 * **Foreground fitness** — ink energy weighted by how much of that ink's habitual ground coincides
 * with the chosen field (proposal §2.4 term 2).
 *
 * This is the reviewer's "text is luminance-driven, no colour rescue" ruling expressed as an
 * objective rather than as a gate: `E_L` is a lightness-displacement integral and nothing chromatic
 * enters it.
 */
export function foregroundFitness(
	stats: CandidateStats,
	field: FieldPath,
	scales: FitnessScales,
): number {
	return ratio(stats.inkEnergy, scales.maxInkEnergy) * groundCoincidence(stats, field)
}

/**
 * **Accent fitness** — mark energy times saliency-per-unit-area times sits-on-the-field, with the
 * lightness component up-weighted by `rates.accentAnisotropy` (proposal §2.4 term 2).
 *
 * The up-weighting is a *direction* from `perception-4` and a magnitude nobody has measured; it
 * enters through the rate and nowhere else, so `tools/sensitivity.ts` can price it.
 */
export function accentFitness(
	stats: CandidateStats,
	field: FieldPath,
	scales: FitnessScales,
	rates: ExchangeRates,
): number {
	return ratio(accentEnergy(stats, rates), scales.maxAccentEnergy) *
		ratio(accentDensity(stats, rates), scales.maxAccentDensity) *
		groundCoincidence(stats, field)
}

// ---------------------------------------------------------------------------------------------
// Term 3 — representativeness
// ---------------------------------------------------------------------------------------------

/**
 * **Representativeness** — distance from the candidate to the mass-weighted centroid of its own
 * neighbourhood, in bars.
 *
 * Proposal §3: the smallest term and the most dangerous, admissible only because it sits inside the
 * joint energy rather than correcting a colour already chosen. Nothing in this module ever moves a
 * colour toward a centroid; the centroid only ever costs.
 */
export function representativenessCost(stats: CandidateStats): number {
	return stats.centroidDistance / ENERGY_ANCHORS.representativenessScale
}

// ---------------------------------------------------------------------------------------------
// The assembled unary cost
// ---------------------------------------------------------------------------------------------

export type Role = "background" | "surface" | "foreground" | "accent"

/** One candidate's unary cost in one role, broken out for the audit surface. */
export type UnaryBreakdown = Readonly<{
	belonging: number
	roleMisfit: number
	representativeness: number
	total: number
}>

/**
 * The unary cost of putting `stats`' triple in `role`, under `field` and `rates`.
 *
 * `belonging` and `representativeness` are role-independent quantities scaled by their rates;
 * `roleMisfit` is the role's own integral. The three sum — no rate multiplies `roleMisfit`, because
 * a rate between three terms needs only two ratios and role fitness is the one they are quoted
 * against (proposal §4 names *belonging↔role-fitness* and *coverage*, not a role-fitness weight).
 */
export function unaryCost(
	role: Role,
	stats: CandidateStats,
	field: FieldPath,
	scales: FitnessScales,
	rates: ExchangeRates,
): UnaryBreakdown {
	const fitness = role === "background" || role === "surface"
		? fieldFitness(stats)
		: role === "foreground"
		? foregroundFitness(stats, field, scales)
		: accentFitness(stats, field, scales, rates)

	const belonging = rates.belonging * belongingCost(stats)
	const roleMisfit = 1 - fitness
	const representativeness = rates.representativeness * representativenessCost(stats)
	return {
		belonging,
		roleMisfit,
		representativeness,
		total: belonging + roleMisfit + representativeness,
	}
}

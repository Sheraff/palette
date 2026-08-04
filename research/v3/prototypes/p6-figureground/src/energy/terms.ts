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
 * item rather than resolved by taste. Since 2026-08-04 the normalised quantity is a per-mass
 * *density* rather than an integral (see `inkDensity`), which makes that fragility a little sharper:
 * the outlier no longer has to be large to set the scale. Same open item, restated at the term.
 *
 * ## Interpretation correction, 2026-08-04 — the role energies are consumed per unit mass
 *
 * `CandidateStats.inkEnergy`/`markEnergy` are unnormalised area integrals (W2's seam, SPEC
 * integration directive 5). Role fitness used to consume the integrals directly, which is the
 * proposal's literal wording — and W7 measured that it defeats the proposal's stated intent. See
 * `inkDensity` and `accentFitness` for the measurement and the argument; the short form is that an
 * area integral answers "how much of this colour's ink is there", which the **background** wins by
 * being the background, where the role needs "how ink-like is this colour", which is the density.
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
 *
 * **The other half of this factor lives in the substrate.** A same-colour-bar kernel is only
 * commensurable with a habitual ground that is a *neighbourhood* mean; read against the coarsest
 * ladder rung (σ ≈ shortEdge/2, ≈ the global mean) it returned ~1e-24 on every triple of a
 * non-uniform cover and this factor annihilated both role fitnesses at once. That was repaired on
 * the producer side, not by widening the kernel — widening it would have invented a free parameter,
 * which is the relapse the README pre-registers. See `src/substrate/constants.ts:HABITUAL_GROUND_RUNG`.
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
 * The per-image scales the role-fitness **densities** are normalised by.
 *
 * Computed once per (image, rates) in a single linear pass over the artwork's triples. It depends
 * on `rates` because the accent's energy is the anisotropic combination `E_C + λ·E_L`, whose scale
 * moves with λ — so a sensitivity perturbation of `accentAnisotropy` re-derives the scale rather
 * than silently rescaling every accent score.
 */
export type FitnessScales = Readonly<{
	maxInkDensity: number
	maxAccentDensity: number
}>

/**
 * An area integral read **per unit of the mass it was integrated over** — the one operation SPEC
 * integration directive 5 names ("divide by `presence` for a per-mass mean").
 *
 * Deterministic at zero mass by construction rather than by luck. `presence` and every energy
 * integral are reads of the *same* convolved lattice stack, so `energy ≤ (max per-pixel energy) ·
 * mass` holds cell by cell and the quotient is bounded wherever the mass is representable. Where it
 * is not — a query point with no artwork mass anywhere near it, which is what an escape colour is —
 * the numerator is zero too, and `0/0` must be a number rather than a NaN that would propagate
 * silently through a barrier. Both degenerate cases are therefore answered explicitly with **0**,
 * "no evidence of this role", which is the least committal value the [0,1] ratio can take, and the
 * division that remains is floored at `ENERGY_ANCHORS.presenceFloor` exactly as `belongingCost`
 * floors its logarithm — the same anchor, so the two terms cannot disagree about what "no mass"
 * means.
 */
function perMass(energy: number, presence: number): number {
	if (!(energy > 0) || !(presence > 0)) return 0
	return energy / Math.max(presence, ENERGY_ANCHORS.presenceFloor)
}

/**
 * **Ink energy per unit mass** — the lightness-displacement density of a colour.
 *
 * ## Interpretation correction (2026-08-04), with the counterfactual that forced it
 *
 * Proposal §2.4 term 2 gives the foreground "ink energy E_L" with no per-unit-area factor, and §2.2
 * defines E_L as an "M-weighted integral"; `foregroundFitness` implemented exactly that, reading
 * `stats.inkEnergy` — the unnormalised integral — against its maximum over the artwork. Measured,
 * the implementation is faithful to the words and defeats the sentence that states the intent: *"the
 * artwork's own lettering colour is the natural winner"*. Lettering is small-area. An integral is
 * not.
 *
 * W7's measurement (`reports/first-palettes.md` §2.2), on `00007e97…`: `maxInkEnergy = 3.84e-2`, and
 * the triple that **attains** it is the background `#e9e6df` (M = 0.496) — the field itself scores
 * a perfect 1.0 on the "ink" factor. On `…00000133…`, where the ground coincidence was healthy and
 * could not be blamed, the top-20 foreground list had ink/mass between 0.0566 and 0.0580 —
 * indistinguishable per unit mass — while M ran 0.288 → 0.402: the ordering of the *text* role was,
 * arithmetically, a ranking by area.
 *
 * The counterfactual that isolates it, same report, one factor replaced and the list re-ranked:
 *
 * | cover | as implemented (integral) | ink **per unit mass** |
 * |---|---|---|
 * | `…00000133…` | readable `#fefefe`, \|APCA\| 20, **rank 39** | `#010000`, **\|APCA\| 91, rank 1** |
 * | `…000000d8…` | readable at rank 13 | `#fcfcfc`, \|APCA\| 109, rank 2 |
 * | `00007e97…` | readable at rank 2150 | rank 535 with the ground repair |
 *
 * Fixing the ground coincidence alone moved that cover from rank 2150 to 2099 — nothing. Reading the
 * ink per unit mass is the change that moves readable ink to the top of the list.
 *
 * **What actually happened when both corrections landed, stated here so the table above cannot be
 * read as a promise** (`reports/second-palettes.md`): the foreground's min-|APCA| margin improved —
 * median 1.70 → 4.97 over demo-20's 18 terminating covers, floor-clustering 12/18 → 9/18, and three
 * covers moved from a near-invisible foreground to |APCA| 28–51 — but readable ink is *not* at rank 1
 * on the covers W7 probed. On `…00000133…` the leader is still `#fffeff` (rank 3 by unary) and the
 * first candidate with |APCA| ≥ 45 sits at rank 189. Its role *fitness* is now 12× the leader's
 * (0.150 vs 0.0127, which is this correction working); it loses on `belonging`, which pays −0.61 at
 * M = 0.40 against a role-misfit range of exactly 1. The residual is a rate, this file may not move
 * it, and `tools/sensitivity.ts` is the only process that may.
 *
 * **What this costs, stated rather than hidden.** W2's note ("a single high-|ΔL| pixel must not
 * score like a headline") is a real objection and it is now answered by `belonging` instead of by
 * this factor: a one-pixel colour with extreme ink density scores 1.0 here and pays a large
 * belonging cost for its rarity. That is the design's own division of labour — rarity is priced by
 * one term, role evidence measured by another — and folding the area back into the role factor is
 * what made the two terms fight over the same quantity in the first place.
 */
export function inkDensity(stats: CandidateStats): number {
	return perMass(stats.inkEnergy, stats.presence)
}

/** The anisotropic accent energy `E_C + λ·E_L` — chroma/hue excursion plus λ times lightness. */
export function accentEnergy(stats: CandidateStats, rates: ExchangeRates): number {
	return stats.markEnergy + rates.accentAnisotropy * stats.inkEnergy
}

/**
 * Accent energy per unit presence — proposal §2.4's "saliency per unit area", and, since the
 * correction recorded at `accentFitness`, the accent's *whole* energy factor.
 */
export function accentDensity(stats: CandidateStats, rates: ExchangeRates): number {
	return perMass(accentEnergy(stats, rates), stats.presence)
}

export function computeFitnessScales(
	allStats: readonly CandidateStats[],
	rates: ExchangeRates,
): FitnessScales {
	let maxInkDensity = 0
	let maxAccentDensity = 0
	for (const stats of allStats) {
		const ink = inkDensity(stats)
		if (ink > maxInkDensity) maxInkDensity = ink
		const density = accentDensity(stats, rates)
		if (density > maxAccentDensity) maxAccentDensity = density
	}
	return { maxInkDensity, maxAccentDensity }
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
 * **Foreground fitness** — ink **density** weighted by how much of that ink's habitual ground
 * coincides with the chosen field (proposal §2.4 term 2).
 *
 * This is the reviewer's "text is luminance-driven, no colour rescue" ruling expressed as an
 * objective rather than as a gate: `E_L` is a lightness-displacement integral and nothing chromatic
 * enters it.
 *
 * The energy is read per unit mass rather than as the integral the proposal's wording gives —
 * interpretation correction of 2026-08-04, whose measurement and counterfactual are at `inkDensity`.
 */
export function foregroundFitness(
	stats: CandidateStats,
	field: FieldPath,
	scales: FitnessScales,
): number {
	return ratio(inkDensity(stats), scales.maxInkDensity) * groundCoincidence(stats, field)
}

/**
 * **Accent fitness** — mark energy per unit area times sits-on-the-field, with the lightness
 * component up-weighted by `rates.accentAnisotropy` (proposal §2.4 term 2).
 *
 * The up-weighting is a *direction* from `perception-4` and a magnitude nobody has measured; it
 * enters through the rate and nowhere else, so `tools/sensitivity.ts` can price it.
 *
 * ## Interpretation correction (2026-08-04) — the same one `inkDensity` carries, by symmetry
 *
 * This read `ratio(accentEnergy) × ratio(accentDensity) × coincidence`: proposal §2.4's "mark energy
 * E_C **times** saliency-per-unit-area", i.e. the area integral *and* the density. That asymmetry
 * against the foreground (which got only the integral) is what made the two role failures look like
 * different bugs; they are one. The integral factor is a factor that rewards **area**, and an accent
 * is the one role that is definitionally not about area — a small vivid mark must not lose to a
 * large dull one by being small.
 *
 * The measured failure is `REVIEWER_EVIDENCE.md` row 3, and it is not marginal:
 * `reports/first-palettes.md` §3.3 check 3 found **12 of 16 chromatic covers publishing an accent
 * with less than half the chroma of the artwork's most saturated significant mark, 4 of them
 * completely achromatic**. The worst case is a cover carrying pure red `#ff0004` (C = 0.2575) at
 * **M = 0.116** — 11.6% of the frame, the loud thing in the picture, not a small dark mark at all —
 * whose published accent was `#fafafa`, C = 0.0000. Proposal §7 pre-registered "small dark saturated
 * marks lose to brighter blander candidates" as a fragile case; measured, it was the typical
 * outcome, in a stronger form than §7 anticipated.
 *
 * **Why the term is now written with one energy factor rather than two.** Applying the correction to
 * `accentEnergy` makes it `accentDensity` — the same quantity, normalised by the same maximum — so
 * the proposal's two factors collapse into one. Keeping both would square a number in [0,1]:
 * harmless to the ordering *among accents*, but a uniform depression of every accent fitness against
 * every foreground and field fitness, which is a change to what the roles are worth against each
 * other. That is an exchange rate, and moving one is prohibited here (`REVIEWER_EVIDENCE.md`
 * header). One factor is the reading that changes no rate.
 *
 * ## The cost of that reading, measured and reported rather than absorbed
 *
 * With one factor, and with `rates.accentAnisotropy` at 1, this function is **identically
 * `foregroundFitness`** on greyscale artwork: `markEnergy` is exactly 0 at every pixel of a neutral
 * image, so `accentEnergy = λ·inkEnergy`, the per-image maxima scale with it, and the two ratios are
 * the same number. Measured over demo-20 (`reports/second-palettes.md`): the two role fitnesses
 * agree to float precision on the two greyscale covers (relative gap 3e-16), to 2e-4 on a
 * near-greyscale one, and differ by 5–67% only where the artwork carries real chroma. The
 * consequence is visible in `REVIEWER_EVIDENCE.md` check 6: the (fg, accent) swap gaps that used to
 * be 0.3–0.9 on six covers are now 1e-3–4e-2, because the *area* factor was what had been separating
 * the two roles on low-chroma covers — for the wrong reason, but it did separate them.
 *
 * This is a mechanism finding handed upward, not a defect to patch here. The proposal separates the
 * two roles by "lightness-dominant vs chroma-dominant" (§2.1) and then prices the accent's lightness
 * component *up* by λ (§2.4); at λ = 1 those two statements are in tension, and no reading of the
 * ink/mark asymmetry can resolve it inside this file. The lever is λ — a rate — or a term the
 * proposal does not currently have.
 */
export function accentFitness(
	stats: CandidateStats,
	field: FieldPath,
	scales: FitnessScales,
	rates: ExchangeRates,
): number {
	return ratio(accentDensity(stats, rates), scales.maxAccentDensity) *
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

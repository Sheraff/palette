/**
 * # Refinement — exact re-evaluation around the incumbent, with all four roles free
 *
 * `DESIGN.md`: *"v0: coarse exhaustive over a colour lattice with **exact re-evaluation of
 * survivors**"*. The M2 brief spells out what "exact" has to mean here: *"exact local refinement of
 * the incumbent within the winning cells' neighbourhoods, BOTH inks and BOTH field roles free to move
 * during refinement."*
 *
 * Both halves are literal in the code below.
 *
 * - **Exact**: every colour a move can reach is an exact image triple — the elected representative of
 *   a *finer* lattice cell (`lattice.ts` never elects anything else). There is no interpolation, no
 *   centroid, no snapping. The energy each move is scored on is the same `energyOfA` / `energyOfAPrime`
 *   the coarse stage used; nothing is approximated on the way in or out.
 * - **All four free**: a sweep generates moves for the background, the surface, the foreground and
 *   the accent, plus the field-order toggles and the ramp's stops. No role is frozen at any point, and
 *   the sweep repeats, so a role that moved because another role moved gets to move again.
 *
 * ## Why this is a local search and says so
 *
 * It is steepest descent over a neighbourhood, not a bound. It can stop at a configuration that is
 * not the global minimiser, and `SEARCH_CERTIFICATE` = `"UNCERTIFIED-V0"` is exactly that admission.
 * Two instruments make the admission checkable rather than rhetorical: the runner-up list (how close
 * the search's second-best came) and `knownBetterFeasible` (whether a *known* legal configuration
 * scores lower than what we emitted). Arm A §7's separation of objective-wrong from under-searched
 * needs the second one, and it is per image.
 *
 * ## What "steepest descent" means when the evaluator remembers everything
 *
 * A sweep offers every move to the evaluator, which keeps the global best of everything it has ever
 * scored. So after a sweep, `evaluator.incumbent` *is* the best configuration seen anywhere —
 * including the coarse stage — and the sweep's improvement test is simply "did the incumbent change".
 * The consequence is worth stating: refinement can never make the answer worse, and a refinement that
 * improves nothing costs its sweep and leaves the coarse winner in place.
 */

import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration, ConfigurationStop } from "../emit/types.ts"
import type { Measurement } from "../measure/types.ts"
import { rgbToOkLab } from "../../../../src/contract/color.ts"
import {
	FINEST_REFINEMENT_BAR_MULTIPLE,
	INTERIOR_STOP_POSITIONS,
	MAX_SEARCHED_STOPS,
	REFINEMENT_MAX_LEVELS,
	REFINEMENT_MAX_SWEEPS,
	REFINEMENT_NEIGHBOUR_RADIUS,
	coarseCellSide,
} from "./constants.ts"
import { fieldOrderOf, type ConfigurationParts } from "./conventions.ts"
import { fieldMidpointLab, offer } from "./enumerate.ts"
import type { Evaluator } from "./evaluator.ts"
import { isBetter } from "./evaluator.ts"
import { buildLevel, neighbourhood, representativeFor, type LatticeLevel } from "./lattice.ts"
import type { FieldOrder, Representative, Scored } from "./types.ts"

export type RefinementReport = Readonly<{
	levels: number
	sweeps: number
	improvements: number
	/** Runner-up seeds the beam restart descended from after the first local search converged. */
	beamSeeds: number
}>

/**
 * The lattice sides refinement walks, coarse to fine.
 *
 * Each level halves the previous side, stopping at `REFINEMENT_MAX_LEVELS` or when the side would go
 * below `FINEST_REFINEMENT_BAR_MULTIPLE` — the point at which two neighbouring cells hold colours the
 * contract's own ruler calls the same colour several times over, so a finer move cannot change
 * anything a human or an invariant could see.
 */
export function refinementBarMultiples(coarseBarMultiple: number): number[] {
	const multiples: number[] = []
	let multiple = coarseBarMultiple / 2
	while (multiples.length < REFINEMENT_MAX_LEVELS && multiple >= FINEST_REFINEMENT_BAR_MULTIPLE) {
		multiples.push(multiple)
		multiple /= 2
	}
	return multiples
}

/** The interior stops of a configuration — everything between the two fixed endpoints. */
function interiorOf(configuration: Configuration): ConfigurationStop[] {
	return configuration.stops.length <= 2 ? [] : configuration.stops.slice(1, -1)
}

/** Stops sorted by position, which is what invariant 1 requires of a published ramp. */
function sortedInterior(stops: readonly ConfigurationStop[]): ConfigurationStop[] {
	return [...stops].sort((left, right) => left.position - right.position)
}

/**
 * Every move available from one configuration at one lattice level, in canonical order.
 *
 * Generated lazily so that a budget which runs out halfway through a sweep stops at a *stated* point
 * in a *stated* order, on every machine, rather than wherever the clock happened to be.
 *
 * The order is: background, surface, foreground, accent, then the field-order toggles, then the
 * ramp's stops. It is the order `CONFIGURATION_ROLES` names in `src/emit/types.ts`, extended with the
 * structural moves — chosen for reproducibility, not for search quality. Nothing about the search's
 * answer depends on it except which moves survive an exhausted budget, which is why it is fixed.
 */
export function* movesFrom(
	measurement: Measurement,
	configuration: Configuration,
	level: LatticeLevel,
): Generator<ConfigurationParts> {
	const side = level.side
	const background = representativeFor(measurement, configuration.background, side)
	const surface = representativeFor(measurement, configuration.surface, side)
	const foreground = representativeFor(measurement, configuration.foreground, side)
	const accent = representativeFor(measurement, configuration.accent, side)
	const order = fieldOrderOf(configuration)
	const interior = interiorOf(configuration)
	const fieldIsCollapsed = order === "collapsed"

	const near = (rgb: Rgb8): Representative[] =>
		neighbourhood(level, rgbToOkLab(rgb), REFINEMENT_NEIGHBOUR_RADIUS)

	const ink = [foreground, accent] as const

	/**
	 * Every field order a pair admits, yielded together.
	 *
	 * **A collapsed field must be able to separate again**, and a two-flat field must be able to
	 * become a ramp, or the coarse stage's structural choice would be frozen for the rest of the
	 * search — which is the staged elimination `DESIGN.md` forbids, arrived at by omission rather than
	 * by design. So a field *pair* move always offers the whole order menu the pair admits, and the
	 * collapse of the pair onto either of its members is a move like any other.
	 */
	function* fieldVariants(
		first: Representative,
		second: Representative,
		inks: readonly [Representative, Representative],
		carriedInterior: readonly ConfigurationStop[],
	): Generator<ConfigurationParts> {
		if (first.hex === second.hex) {
			yield { field: [first, first], order: "collapsed", ink: inks, interior: [] }
			return
		}
		yield { field: [first, second], order: "two-flat", ink: inks, interior: [] }
		yield { field: [first, second], order: "ramp", ink: inks, interior: carriedInterior }
	}

	// --- 1. the field moves: either member replaced, and the collapse of the pair onto either -----
	for (const candidate of near(configuration.background)) {
		yield* fieldVariants(candidate, surface, ink, interior)
	}
	for (const candidate of near(configuration.surface)) {
		yield* fieldVariants(background, candidate, ink, interior)
	}
	yield* fieldVariants(background, background, ink, interior)
	yield* fieldVariants(surface, surface, ink, interior)

	// --- 2. the ink moves, at the incumbent's own field order -------------------------------------
	// Held at the current order on purpose: the field's own order menu is item 1's business, and
	// crossing the two would multiply a sweep's cost by three for moves that item 1 already reaches.
	const field = [background, surface] as const
	for (const candidate of near(configuration.foreground)) {
		yield { field, order, interior, ink: [candidate, accent] }
	}
	for (const candidate of near(configuration.accent)) {
		yield { field, order, interior, ink: [foreground, candidate] }
	}
	// Ink collapse onto either member — the separation back out is item 2's replacement moves, which
	// can name any neighbour of the surviving colour.
	yield { field, order, interior, ink: [foreground, foreground] }
	yield { field, order, interior, ink: [accent, accent] }

	// --- 3. the incumbent field pair's other orders -----------------------------------------------
	if (!fieldIsCollapsed) {
		const others: FieldOrder[] = order === "ramp" ? ["two-flat"] : ["ramp"]
		for (const other of others) {
			yield { field, order: other, ink, interior: other === "ramp" ? interior : [] }
		}
	}

	// --- 4. the ramp's interior stops ------------------------------------------------------------
	// Reachable from a flat field too: promoting to a ramp *and* placing a knot in one move is what
	// keeps three-stop ramps reachable on images whose coarse grammar never enumerated one.
	if (fieldIsCollapsed) return

	// The interior knot is looked for around the field's OKLab midpoint, which is generally not an
	// image triple at all — hence a direct neighbourhood query on the position rather than a `near`
	// call on a colour.
	const midpointNeighbours = neighbourhood(
		level,
		fieldMidpointLab(configuration.background, configuration.surface),
		REFINEMENT_NEIGHBOUR_RADIUS,
	)

	// Drop every interior stop.
	if (interior.length > 0) {
		yield { field, order: "ramp", ink: [foreground, accent], interior: [] }
	}

	// One interior stop, anywhere on the grid, any neighbouring colour.
	for (const candidate of midpointNeighbours) {
		for (const position of INTERIOR_STOP_POSITIONS) {
			yield {
				field,
				order: "ramp",
				ink: [foreground, accent],
				interior: [{ rgb: candidate.rgb, position }],
			}
		}
	}

	// A second interior stop beside the one already published — the four-stop case `DESIGN.md` calls
	// admissible and expects never to be selected. Reachable, so the expectation is falsifiable.
	if (interior.length === 1 && MAX_SEARCHED_STOPS >= 4) {
		const existing = interior[0]
		for (const candidate of midpointNeighbours) {
			for (const position of INTERIOR_STOP_POSITIONS) {
				if (position === existing.position) continue
				yield {
					field,
					order: "ramp",
					ink: [foreground, accent],
					interior: sortedInterior([existing, { rgb: candidate.rgb, position }]),
				}
			}
		}
	}
}

/**
 * Steepest descent from one seed, down the lattice levels.
 *
 * The descent is tracked against **its own** current configuration, not against the evaluator's
 * global incumbent. That distinction is what makes the beam restart below mean anything: a search
 * seeded from a runner-up must be allowed to walk downhill from *there*, and a local search that
 * compared each move against the global best would teleport to the global best on its first step and
 * explore nothing.
 */
function descend(
	evaluator: Evaluator,
	measurement: Measurement,
	seed: Scored,
	levels: readonly LatticeLevel[],
): { sweeps: number; improvements: number; alive: boolean } {
	let current = seed
	let sweeps = 0
	let improvements = 0

	for (const level of levels) {
		for (let sweep = 0; sweep < REFINEMENT_MAX_SWEEPS; sweep += 1) {
			sweeps += 1
			let best = current
			for (const parts of movesFrom(measurement, current.configuration, level)) {
				const { alive, scored } = offer(evaluator, measurement, parts)
				if (scored !== null && isBetter(scored, best)) best = scored
				if (!alive) return { sweeps, improvements, alive: false }
			}
			if (best.key === current.key) break
			current = best
			improvements += 1
		}
	}
	return { sweeps, improvements, alive: true }
}

/**
 * Refine: one local search from the coarse winner, then, while the budget lasts, one from each of its
 * runners-up.
 *
 * **Why the beam restart is here at all.** Measured on demo-20: the coarse stage's cost is quantised
 * by the lattice ladder and typically lands well under its share, and a single local search converges
 * long before the remaining allowance is spent — on one cover, arm A finished having used 4 s of 60.
 * Unspent budget is under-search that nobody asked for. Descending from the runners-up is the
 * cheapest honest way to spend it: the seeds are configurations the search already scored, they are
 * taken in the incumbent's own canonical order, and the evaluator's global best can only fall.
 *
 * It buys no guarantee whatsoever. The certificate stays `"UNCERTIFIED-V0"`.
 *
 * Returns when the seeds run out, when the levels run out, or when the evaluator's budget refuses the
 * next move. All three are deterministic; none of them reads a clock.
 */
export function refine(
	evaluator: Evaluator,
	measurement: Measurement,
	coarseBarMultiple: number,
): RefinementReport {
	const seedIncumbent = evaluator.incumbent
	if (seedIncumbent === null) return { levels: 0, sweeps: 0, improvements: 0, beamSeeds: 0 }

	const levels = refinementBarMultiples(coarseBarMultiple).map((barMultiple) =>
		buildLevel(measurement, barMultiple, coarseCellSide(barMultiple))
	)

	const first = descend(evaluator, measurement, seedIncumbent, levels)
	let sweeps = first.sweeps
	let improvements = first.improvements
	let beamSeeds = 0

	if (first.alive) {
		// Snapshot the runners-up *now*: the list is live, and descending from a seed changes it.
		for (const seed of [...evaluator.runnerUps()]) {
			beamSeeds += 1
			const run = descend(evaluator, measurement, seed, levels)
			sweeps += run.sweeps
			improvements += run.improvements
			if (!run.alive) break
		}
	}

	return { levels: levels.length, sweeps, improvements, beamSeeds }
}

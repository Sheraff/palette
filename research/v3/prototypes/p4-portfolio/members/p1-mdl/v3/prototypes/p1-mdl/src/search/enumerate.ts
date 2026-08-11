/**
 * # The coarse stage — the joint product, enumerated whole
 *
 * This is the part of v0 that `DESIGN.md`'s mechanism clause is about, so it is worth being blunt
 * about what the loops below do and do not do.
 *
 * **They do**: iterate every unordered field pair against every unordered ink pair against every
 * admissible field order, in one nest, and hand each resulting configuration to the evaluator.
 * Background, surface, foreground and accent are chosen *together*; the winner is the argmin over the
 * whole product. There is no stage in which a background is picked and the rest fitted around it.
 *
 * **They do not**: shortlist. There is no per-role candidate filter anywhere in this file — no "top
 * N by mass", no "colours dark enough to be a background", no "chromatic enough to be an accent".
 * The alphabet is `lattice.ts`'s representatives, which cover every occupied cell of colour space
 * uniformly, and every representative is eligible for every role. `DESIGN.md`: *"If the code ever
 * chooses a background and hands the rest to a later step, it is off-mechanism."*
 *
 * ## Where the under-search actually is
 *
 * Two places, both stated rather than concealed:
 *
 * 1. **Resolution.** The alphabet is a lattice quantisation of the artwork's colours, not the
 *    artwork's colours. `refine.ts` reopens this: every role can move to a finer representative, and
 *    all four move during refinement.
 * 2. **Grammar.** At a coarse budget the product may cover only flat fields and two-stop ramps, with
 *    interior stops reached during refinement rather than enumerated here. `SearchScale.grammarLevel`
 *    says which happened.
 *
 * Neither is *elimination*: nothing this stage skips is unreachable afterwards. That is the
 * distinction the M2 brief draws — *"admissible ONLY as under-search, not as staged elimination"* —
 * and the reason `refine.ts` moves all four roles rather than polishing the two the coarse stage
 * happened to like.
 *
 * ## Decision 3's feasibility half
 *
 * For each ink pair the enumerator builds the ordering `conventions.ts` prefers and asks the
 * contract. If that assignment is illegal it builds the swap and asks again — *"which is which is
 * decided first by feasibility ... and, when both are legal, by an ordering"*. Only one of the two is
 * ever **scored**, so the energy never picks between them; that is decision 3 working as written, and
 * the price it charges is published per palette by the swap probe.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { EscapeRole, Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../emit/types.ts"
import type { Measurement } from "../measure/types.ts"
import { ESCAPE_COLORS } from "../../../../src/contract/constants.ts"
import { INTERIOR_STOP_POSITIONS } from "./constants.ts"
import { makeConfiguration, type ConfigurationParts } from "./conventions.ts"
import type { Evaluator } from "./evaluator.ts"
import type { LatticeLevel } from "./lattice.ts"
import { GRAMMAR_LEVELS, type FieldOrder, type GrammarLevel, type Representative, type Scored } from "./types.ts"

/**
 * Offer one configuration to the evaluator, applying decision 3's feasibility-first rule.
 *
 * `alive` is `false` only when the budget refused the work, which is the caller's signal to stop
 * enumerating — deterministically, because the enumeration order is canonical. `scored` is whichever
 * of the two ink assignments was actually scored, for the local search, which needs to compare moves
 * against each other rather than against the evaluator's global incumbent.
 */
export function offer(
	evaluator: Evaluator,
	measurement: Measurement,
	parts: ConfigurationParts,
): { alive: boolean; scored: Scored | null } {
	const preferred = makeConfiguration(measurement, parts)
	const outcome = evaluator.consider(preferred)
	if (outcome.refusedForBudget) return { alive: false, scored: null }
	if (outcome.feasible) return { alive: true, scored: outcome.scored }

	// A collapsed ink pair has only one assignment; there is nothing to swap to.
	if (preferred.accentCollapsed) return { alive: true, scored: null }

	const swapped = makeConfiguration(measurement, { ...parts, swapInk: parts.swapInk !== true })
	const second = evaluator.consider(swapped)
	return { alive: !second.refusedForBudget, scored: second.scored }
}

/**
 * The interior-stop lists a ramp may carry at a grammar level, in canonical order.
 *
 * Positions come from `INTERIOR_STOP_POSITIONS`; colours from the level's representatives. The
 * two-interior case takes **ordered** position pairs (ascending, which invariant 1 requires) against
 * the full colour square, because two knots at two positions are two different ramps under exchange.
 */
export function interiorStopLists(
	representatives: readonly Representative[],
	grammar: GrammarLevel,
): (readonly { rgb: Rgb8; position: number }[])[] {
	const level = GRAMMAR_LEVELS.indexOf(grammar)
	const lists: (readonly { rgb: Rgb8; position: number }[])[] = [[]]
	if (level >= GRAMMAR_LEVELS.indexOf("ramp-3")) {
		for (const representative of representatives) {
			for (const position of INTERIOR_STOP_POSITIONS) {
				lists.push([{ rgb: representative.rgb, position }])
			}
		}
	}
	if (level >= GRAMMAR_LEVELS.indexOf("ramp-4")) {
		for (const first of representatives) {
			for (const second of representatives) {
				for (let i = 0; i < INTERIOR_STOP_POSITIONS.length; i += 1) {
					for (let j = i + 1; j < INTERIOR_STOP_POSITIONS.length; j += 1) {
						lists.push([
							{ rgb: first.rgb, position: INTERIOR_STOP_POSITIONS[i] },
							{ rgb: second.rgb, position: INTERIOR_STOP_POSITIONS[j] },
						])
					}
				}
			}
		}
	}
	return lists
}

/**
 * Enumerate the coarse joint product. Returns whether it ran to completion.
 *
 * Iteration order is the representatives' canonical order (ascending packed cell key) at every level
 * of the nest, so the sequence of configurations is a function of the image alone — and so a budget
 * that runs out mid-enumeration runs out at the same place on every machine.
 *
 * The return value is what makes iterative deepening honest: a level that was cut off short is a
 * level whose alphabet was only *partly* searched, and `emit()` must not go on to claim it finished
 * one. A completed enumeration at a coarse alphabet is a stronger statement than a truncated one at a
 * fine alphabet, and the diagnostics record which each level was.
 */
export function enumerateCoarse(
	evaluator: Evaluator,
	measurement: Measurement,
	level: LatticeLevel,
	grammar: GrammarLevel,
): boolean {
	const reps = level.representatives
	const wantsRamps = GRAMMAR_LEVELS.indexOf(grammar) >= GRAMMAR_LEVELS.indexOf("ramp-2")
	const interiorLists = interiorStopLists(reps, grammar)

	for (let fieldFirst = 0; fieldFirst < reps.length; fieldFirst += 1) {
		for (let fieldSecond = fieldFirst; fieldSecond < reps.length; fieldSecond += 1) {
			const collapsedField = fieldFirst === fieldSecond
			const orders: FieldOrder[] = collapsedField
				? ["collapsed"]
				: wantsRamps
					? ["two-flat", "ramp"]
					: ["two-flat"]

			for (const order of orders) {
				const interiors = order === "ramp" ? interiorLists : [[]]
				for (const interior of interiors) {
					for (let inkFirst = 0; inkFirst < reps.length; inkFirst += 1) {
						for (let inkSecond = inkFirst; inkSecond < reps.length; inkSecond += 1) {
							const { alive } = offer(evaluator, measurement, {
								field: [reps[fieldFirst], reps[fieldSecond]],
								order,
								ink: [reps[inkFirst], reps[inkSecond]],
								interior,
							})
							if (!alive) return false
						}
					}
				}
			}
		}
	}
	return true
}

// ---------------------------------------------------------------------------------------------
// The escape branch
// ---------------------------------------------------------------------------------------------

/**
 * A stand-in `Representative` for a colour the artwork does not contain.
 *
 * `row: -1` and `smoothedMass: 0` are not defaults, they are assertions: this colour has no row in
 * the triple table and no smoothed mass, because it is not in the image. The two conventions that
 * read those fields — decision 5's mass rule and its 135°-axis rule — are only ever applied to a
 * *field pair of two distinct colours*, and an escape colour is never one of those: an escaped
 * background is collapsed onto its surface, an escaped foreground is an ink. So neither field is ever
 * read for an escape representative, and if that ever stops being true the `-1` row makes it a loud
 * failure rather than a quiet zero.
 */
function escapeRepresentative(color: string): Representative {
	const rgb: Rgb8 = [
		Number.parseInt(color.slice(1, 3), 16),
		Number.parseInt(color.slice(3, 5), 16),
		Number.parseInt(color.slice(5, 7), 16),
	]
	return {
		row: -1,
		rgb,
		hex: color,
		cellKey: -1,
		cell: { l: 0, a: 0, b: 0 },
		smoothedMass: 0,
	}
}

/**
 * The escape branch (`DESIGN.md` decision 6).
 *
 * *"search in-artwork feasible set; only if EMPTY, evaluate the two escape configurations."* The
 * caller is responsible for that condition; this function does the evaluating. Two roles × two
 * colours, with the partner role collapsed onto the escape colour as the reviewer's ruling requires,
 * and the remaining pair enumerated over the alphabet exactly as the main product does.
 *
 * Every escape configuration is checked **with the image facts supplied**, unlike the inner loop:
 * invariant 2's escape clause requires the colour to be genuinely absent (`I2.escape-not-needed`
 * fires when it is not), and that question cannot be answered without the artwork.
 */
export function enumerateEscape(
	evaluator: Evaluator,
	measurement: Measurement,
	level: LatticeLevel,
): number {
	const reps = level.representatives
	let evaluated = 0

	for (const role of ["background", "foreground"] as const satisfies readonly EscapeRole[]) {
		for (const color of ESCAPE_COLORS) {
			const escapeRep = escapeRepresentative(color)
			const escape = { role, color } as Configuration["escape"]

			if (role === "background") {
				for (let inkFirst = 0; inkFirst < reps.length; inkFirst += 1) {
					for (let inkSecond = inkFirst; inkSecond < reps.length; inkSecond += 1) {
						const configuration = makeConfiguration(measurement, {
							field: [escapeRep, escapeRep],
							order: "collapsed",
							ink: [reps[inkFirst], reps[inkSecond]],
							escape,
						})
						evaluated += 1
						if (evaluator.consider(configuration, { withFacts: true }).refusedForBudget) {
							return evaluated
						}
					}
				}
				continue
			}

			for (let fieldFirst = 0; fieldFirst < reps.length; fieldFirst += 1) {
				for (let fieldSecond = fieldFirst; fieldSecond < reps.length; fieldSecond += 1) {
					const collapsedField = fieldFirst === fieldSecond
					const orders: FieldOrder[] = collapsedField ? ["collapsed"] : ["two-flat", "ramp"]
					for (const order of orders) {
						const configuration = makeConfiguration(measurement, {
							field: [reps[fieldFirst], reps[fieldSecond]],
							order,
							ink: [escapeRep, escapeRep],
							escape,
						})
						evaluated += 1
						if (evaluator.consider(configuration, { withFacts: true }).refusedForBudget) {
							return evaluated
						}
					}
				}
			}
		}
	}
	return evaluated
}

/** OKLab midpoint of the field's two published endpoints — where a ramp's interior knot is looked for. */
export function fieldMidpointLab(background: Rgb8, surface: Rgb8): [number, number, number] {
	const first = rgbToOkLab(background)
	const second = rgbToOkLab(surface)
	return [
		(first[0] + second[0]) / 2,
		(first[1] + second[1]) / 2,
		(first[2] + second[2]) / 2,
	]
}

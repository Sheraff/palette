/**
 * # The mechanism guard: `emit()` against a hand-rolled exhaustive search
 *
 * Arm A §6 makes this test mandatory and the M2 brief restates it: *"a test asserting emit() output
 * equals the true argmin on a tiny synthetic image where exhaustive search over ALL configurations is
 * tractable"*. It is the one test that can catch a search which is quietly optimising something other
 * than the objective — a shortlist, a per-role filter, a tie-break that consults contrast — because
 * the reference below shares **only** the configuration constructor and the objective with the thing
 * under test, and nothing at all of the search.
 *
 * ## What "ALL configurations" means here, precisely
 *
 * The configuration space is infinite until three of `DESIGN.md`'s own decisions cut it down, and the
 * reference applies exactly those three and no others:
 *
 * - **Colours** come from the artwork's distinct triples — invariant 2, and there are three of them.
 * - **Interior stop positions** come from `INTERIOR_STOP_POSITIONS`, v0's declared three-point grid.
 * - **Role assignment** follows decisions 3 and 5: unordered pairs ordered by the conventions, with
 *   decision 3's feasibility-first fallback to the swapped ink assignment.
 *
 * Within those, the reference is genuinely exhaustive: every field pair (including the collapsed
 * diagonal) × every field order the pair admits × every interior stop list up to four stops × every
 * ink pair. `emit()` is run at the finest lattice rung, so its alphabet is the same three colours,
 * and at grammar `ramp-4`, so its coarse product covers the same grammar. The two must agree on the
 * argmin, exactly, including the tie-break.
 *
 * **A failure here is not a tuning prompt.** If `emit()` returns something the reference beat, the
 * search is not minimising the energy over the feasible set, and no amount of budget will fix that.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { feasibility } from "../../src/emit/feasibility.ts"
import { toPalette } from "../../src/emit/palette.ts"
import type { Configuration, EmitMeta } from "../../src/emit/types.ts"
import { sourceMetaOf } from "../../src/emit/source-meta.ts"
import { measureImage } from "../../src/measure/index.ts"
import { rgbToHex } from "../../../../src/contract/color.ts"
import { canonicalKey, makeConfiguration } from "../../src/search/conventions.ts"
import { evaluateEnergy } from "../../src/search/evaluator.ts"
import { representativesAt } from "../../src/search/lattice.ts"
import { emit } from "../../src/search/index.ts"
import { INTERIOR_STOP_POSITIONS, coarseCellSide } from "../../src/search/constants.ts"
import { GRAMMAR_LEVELS, type ArmName, type FieldOrder, type Representative } from "../../src/search/types.ts"
import type { Measurement } from "../../src/measure/types.ts"
import { THREE_COLORS, writeBandedImage } from "./support.ts"

/** The finest rung of the coarse ladder: one eighth of the tightest same-colour bar. */
const FINEST_BAR_MULTIPLE = 1 / 8

/**
 * Every interior stop list the four-stop grammar admits over an alphabet.
 *
 * Written out here rather than imported from `enumerate.ts`, on purpose: a reference that borrowed
 * the enumerator's own list generator could not detect a bug in it.
 */
function allInteriorLists(colors: readonly Representative[]): { rgb: [number, number, number]; position: number }[][] {
	const lists: { rgb: [number, number, number]; position: number }[][] = [[]]
	for (const one of colors) {
		for (const position of INTERIOR_STOP_POSITIONS) {
			lists.push([{ rgb: [...one.rgb] as [number, number, number], position }])
		}
	}
	for (const one of colors) {
		for (const two of colors) {
			for (let i = 0; i < INTERIOR_STOP_POSITIONS.length; i += 1) {
				for (let j = i + 1; j < INTERIOR_STOP_POSITIONS.length; j += 1) {
					lists.push([
						{ rgb: [...one.rgb] as [number, number, number], position: INTERIOR_STOP_POSITIONS[i] },
						{ rgb: [...two.rgb] as [number, number, number], position: INTERIOR_STOP_POSITIONS[j] },
					])
				}
			}
		}
	}
	return lists
}

/** The exhaustive argmin, by brute force, with the incumbent ordering `evaluator.ts` documents. */
function exhaustiveArgmin(
	arm: ArmName,
	measurement: Measurement,
	meta: EmitMeta,
	colors: readonly Representative[],
): { configuration: Configuration; energy: number; key: string; feasibleCount: number } {
	const interiorLists = allInteriorLists(colors)
	let best: { configuration: Configuration; energy: number; key: string } | null = null
	let feasibleCount = 0

	const consider = (configuration: Configuration): void => {
		const report = feasibility(toPalette(configuration, meta))
		if (!report.valid) return
		feasibleCount += 1
		const energy = evaluateEnergy(arm, measurement, configuration, undefined).total
		const key = canonicalKey(configuration)
		if (best === null || energy < best.energy || (energy === best.energy && key < best.key)) {
			best = { configuration, energy, key }
		}
	}

	for (let first = 0; first < colors.length; first += 1) {
		for (let second = first; second < colors.length; second += 1) {
			const collapsed = first === second
			const orders: FieldOrder[] = collapsed ? ["collapsed"] : ["two-flat", "ramp"]
			for (const order of orders) {
				for (const interior of order === "ramp" ? interiorLists : [[]]) {
					for (let inkFirst = 0; inkFirst < colors.length; inkFirst += 1) {
						for (let inkSecond = inkFirst; inkSecond < colors.length; inkSecond += 1) {
							const parts = {
								field: [colors[first], colors[second]] as const,
								order,
								ink: [colors[inkFirst], colors[inkSecond]] as const,
								interior,
							}
							// Decision 3's feasibility half, replicated: the preferred assignment, and the
							// swap when the preferred one is illegal.
							const preferred = makeConfiguration(measurement, parts)
							const before = feasibleCount
							consider(preferred)
							if (feasibleCount === before && !preferred.accentCollapsed) {
								consider(makeConfiguration(measurement, { ...parts, swapInk: true }))
							}
						}
					}
				}
			}
		}
	}

	assert.ok(best !== null, "the synthetic artwork has no feasible configuration at all")
	return { ...(best as { configuration: Configuration; energy: number; key: string }), feasibleCount }
}

for (const arm of ["a", "aprime"] as const) {
	test(`arm ${arm}: emit() returns the exhaustive argmin on a three-colour artwork`, async () => {
		const imagePath = await writeBandedImage(THREE_COLORS)
		const measurement = await measureImage(imagePath)
		assert.equal(measurement.triples.colorCount, THREE_COLORS.length, "the fixture should hold exactly its three colours")

		// The alphabet `emit()` will search over, at the rung the test pins it to.
		const colors = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))
		assert.equal(colors.length, THREE_COLORS.length, "at the finest rung each colour is its own representative")
		assert.deepEqual(
			colors.map((color) => color.rgb),
			[...THREE_COLORS].sort((left, right) => {
				const key = (rgb: readonly number[]) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
				return key(left) - key(right)
			}),
			"representatives are exact image triples, in canonical key order",
		)

		const meta = await sourceMetaOf(imagePath, "mechanism-test")
		const reference = exhaustiveArgmin(arm, measurement, meta, colors)
		assert.ok(reference.feasibleCount > 0)

		const { palette, diagnostics } = await emit(imagePath, {
			arm,
			measurement,
			coarseCellBarMultiple: FINEST_BAR_MULTIPLE,
			grammarLevel: GRAMMAR_LEVELS[GRAMMAR_LEVELS.length - 1],
			// Generous: this test is about the argmin, not about what a minute buys.
			budgetMs: 10 * 60 * 1000,
			skipKnownBetterFeasible: true,
		})

		// The whole configuration, as one string, including stops, flags and the escape slot.
		assert.equal(
			diagnostics.incumbent.canonicalKey,
			reference.key,
			"emit() returned a different configuration from the exhaustive argmin",
		)
		assert.equal(
			diagnostics.incumbent.energy,
			reference.energy,
			"emit() returned a different energy from the exhaustive minimum",
		)
		// And the published palette is the same object, not merely the same decision.
		assert.equal(
			palette.roles.background.hex,
			rgbToHex(reference.configuration.background),
			"the published background is the argmin's",
		)
		assert.equal(diagnostics.searchScale.chosenBy, "forced")
		assert.equal(diagnostics.escape.used, false)
	})
}

test("the four-stop grammar is reachable, so 'never selected' is a falsifiable prediction", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)
	const colors = representativesAt(measurement, coarseCellSide(FINEST_BAR_MULTIPLE))
	const lists = allInteriorLists(colors)
	assert.ok(
		lists.some((list) => list.length === 2),
		"the reference grammar contains two-interior-stop (four-stop) ramps",
	)
})

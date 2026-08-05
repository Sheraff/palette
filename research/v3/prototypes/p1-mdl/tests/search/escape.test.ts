/**
 * # The escape branch: it works, and it only fires when there is nothing else
 *
 * `DESIGN.md` decision 6: *"search in-artwork feasible set; only if EMPTY, evaluate the two escape
 * configurations. Expected to essentially never fire."* Two claims, and a corpus run can only ever
 * check the second one. `tests/search/emitted-palettes.test.ts` asserts the escape stayed silent
 * across demo-20 — but a branch that is never taken is also a branch that is never *tested*, and an
 * escape that had quietly stopped working would look exactly the same from there.
 *
 * So this file supplies the artwork that forces it: a single flat colour. Every in-artwork
 * configuration publishes that one triple in all four roles, every contrast pair is a colour against
 * itself, and invariant 4 refuses all of them — the in-artwork feasible set is genuinely, provably
 * empty rather than merely unreached. The reviewer's ruling of 2026-08-04 exists for exactly this
 * artwork: *"only when there is genuinely no other way to produce a 2-color palette"*.
 *
 * The second test is the one that makes the first mean something: on an artwork with a perfectly
 * ordinary feasible set, the escape must not be evaluated **at all** — not evaluated and rejected,
 * not evaluated and outscored. Zero configurations.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { ESCAPE_COLORS } from "../../../../src/contract/constants.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import { measureImage } from "../../src/measure/index.ts"
import { emit } from "../../src/search/index.ts"
import { imageFactsOf } from "../../src/search/image-facts.ts"
import { THREE_COLORS, writeBandedImage } from "./support.ts"

/** A mid-grey with enough luminance distance from both escape colours to clear invariant 4. */
const FLAT_GREY = [128, 128, 128] as const

test("a single-colour artwork takes the escape, legally", async () => {
	const imagePath = await writeBandedImage([[...FLAT_GREY]])
	const measurement = await measureImage(imagePath)
	assert.equal(measurement.triples.colorCount, 1, "the fixture is one flat colour")

	const { palette, diagnostics } = await emit(imagePath, {
		arm: "a",
		measurement,
		skipKnownBetterFeasible: true,
	})

	assert.equal(diagnostics.escape.used, true)
	assert.equal(diagnostics.escape.inArtworkFeasibleReached, 0, "nothing in-artwork was legal")
	assert.ok(diagnostics.escape.escapeConfigurationsEvaluated > 0)

	// The declaration is well-formed and the published palette is legal with the image facts supplied —
	// which is where invariant 2's escape clause runs, including its requirement that the escape colour
	// really is absent from the artwork.
	assert.notEqual(palette.escape, null)
	assert.ok((ESCAPE_COLORS as readonly string[]).includes(palette.escape?.color ?? ""))
	const facts = imageFactsOf(measurement)
	const result = validatePalette(palette, {
		source: facts.source,
		transparency: facts.transparency,
	})
	assert.deepEqual(result.violations.map((violation) => violation.code), [])
	assert.equal(result.valid, true)

	// An escape incumbent is not refined: its colour has no cell in the artwork's lattice.
	assert.equal(diagnostics.effort.refinementLevels, 0)
})

test("an ordinary artwork never evaluates an escape configuration", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const { palette, diagnostics } = await emit(imagePath, {
		arm: "aprime",
		skipKnownBetterFeasible: true,
	})
	assert.equal(diagnostics.escape.used, false)
	assert.equal(diagnostics.escape.escapeConfigurationsEvaluated, 0)
	assert.ok(diagnostics.escape.inArtworkFeasibleReached > 0)
	assert.equal(palette.escape, null)
})

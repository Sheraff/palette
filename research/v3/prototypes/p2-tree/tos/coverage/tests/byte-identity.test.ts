/**
 * **D9's acceptance condition, as an assertion.** *"If all families are represented or only one exists,
 * behaviour must be byte-identical to the current candidate."*
 *
 * Over demo-20: for every cover whose census finds fewer than two families, `candidate-coverage.ts` must
 * return the palette `candidate.ts` publishes — the same object, not an equal one. The identity check is
 * the stronger claim and the one the wrapper's design actually makes: on those covers the module returns
 * the baseline object it was handed, so there is no second construction that could drift.
 *
 * The equality check is kept beside it because `===` would also pass if both sides were the same wrong
 * object, and because the *changed* covers still owe a statement: everything except the accent must be
 * byte-identical there too. The coverage rule re-orders one ranking; it may not move a field role, a
 * foreground, a gradient, a collapse flag or a metadata field, and this is where that is enforced.
 */

import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import { forbiddenTwinPairs } from "../../roles/assemble.ts"
import { paletteWithCoverage } from "../candidate-coverage.ts"

const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..")
const REPO_ROOT = resolve(V3_ROOT, "..", "..")
const DEMO_20 = resolve(V3_ROOT, "data", "devloop", "sets", "demo-20.txt")

test("fewer than two families ⇒ the current candidate's palette, unchanged", async () => {
	await access(DEMO_20)
	const covers = (await readFile(DEMO_20, "utf8"))
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
	assert.ok(covers.length >= 20, `demo-20 must have its twenty covers, found ${covers.length}`)

	let under2 = 0
	let changed = 0
	for (const cover of covers) {
		const path = resolve(REPO_ROOT, cover)
		await access(path)
		const result = await paletteWithCoverage(path)

		if (result.decision.census.families.length < 2) {
			under2 += 1
			assert.equal(
				result.palette,
				result.baseline,
				`${cover}: census found ${result.decision.census.families.length} families and the palette still moved`,
			)
			assert.equal(result.changed, false, `${cover}: reported changed with <2 families`)
		}

		assert.deepEqual(validatePalette(result.palette).violations, [], `${cover}: the published palette must be legal`)
		assert.deepEqual(forbiddenTwinPairs(result.palette), [], `${cover}: no forbidden twin pair may publish`)

		// Whatever the rule did, it may only have moved the accent.
		const { background, surface, foreground } = result.palette.roles
		assert.equal(background.hex, result.baseline.roles.background.hex, `${cover}: background moved`)
		assert.equal(surface.hex, result.baseline.roles.surface.hex, `${cover}: surface moved`)
		assert.equal(foreground.hex, result.baseline.roles.foreground.hex, `${cover}: foreground moved`)
		assert.deepEqual(result.palette.metadata, result.baseline.metadata, `${cover}: metadata moved`)
		assert.deepEqual(result.palette.gradient, result.baseline.gradient, `${cover}: gradient moved`)
		assert.equal(
			result.palette.collapse?.surfaceCollapsed,
			result.baseline.collapse?.surfaceCollapsed,
			`${cover}: the surface collapse flag moved`,
		)
		if (result.changed) changed += 1
	}

	// The measurement this file also serves as: how much of demo-20 the premise even applies to.
	assert.ok(under2 > 0, "no demo-20 cover exercises the byte-identity path — the assertion is vacuous")
	assert.ok(changed < covers.length, "every cover changed — the rule is not a rule, it is a rewrite")
	console.log(`demo-20: ${under2}/${covers.length} covers under two families, ${changed}/${covers.length} changed`)
})

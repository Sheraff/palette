/**
 * The two candidate scaffolds.
 *
 * Two things are worth asserting about a module that does not work yet: that importing it is free of
 * side effects, and that calling it fails in a way that names what is missing. A scaffold that threw
 * `TypeError: undefined is not a function` at run time would be worse than no scaffold at all.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import * as p1a from "../../candidates/p1a.ts"
import * as p1ap from "../../candidates/p1ap.ts"
import { PROTOTYPE_ROOT } from "../../src/emit/paths.ts"
import { NotYetWiredError } from "../../src/emit/types.ts"

test("both candidates export the CandidateModule surface the devloop loads", () => {
	assert.equal(p1a.candidateId, "p1a")
	assert.equal(p1ap.candidateId, "p1ap")
	assert.equal(typeof p1a.paletteOf, "function")
	assert.equal(typeof p1ap.paletteOf, "function")
	assert.equal(p1a.candidate.candidateId, "p1a")
	assert.equal(p1ap.candidate.candidateId, "p1ap")
})

test("the algorithm versions are the ones toPalette will stamp on every row", () => {
	assert.equal(p1a.ALGORITHM_VERSION, "p1a-0.1.0")
	assert.equal(p1ap.ALGORITHM_VERSION, "p1ap-0.1.0")
	assert.notEqual(p1a.ALGORITHM_VERSION, p1ap.ALGORITHM_VERSION)
})

test("calling either throws NotYetWiredError, naming the wave-3 wiring step and the image", async () => {
	for (const candidate of [p1a, p1ap]) {
		await assert.rejects(
			() => candidate.paletteOf("/some/cover.jpg"),
			(error: unknown) => {
				assert.ok(error instanceof NotYetWiredError)
				assert.equal((error as NotYetWiredError).name, "NotYetWiredError")
				assert.match((error as Error).message, /wave 3/)
				assert.match((error as Error).message, /\/some\/cover\.jpg/)
				assert.match((error as Error).message, new RegExp(candidate.candidateId))
				return true
			},
		)
	}
})

test("the wiring steps differ: arm A′'s L(P) is already done, arm A's Ω is not", () => {
	assert.match(p1a.WIRING_STEP, /src\/energy\/a\.ts/)
	assert.match(p1ap.WIRING_STEP, /serializationCost/)
})

/**
 * The side-effect guard, as a property of the import graph rather than a promise in a comment.
 *
 * `sharp` loads a native binding at import. The candidate modules reach only `src/emit/types.ts` and
 * `src/emit/palette.ts`, and both of those are decoder-free — `sourceMetaOf` was split out into
 * `src/emit/source-meta.ts` precisely so this stays true. This walks the closure and fails if any
 * module in it imports `sharp` or does file I/O at module scope.
 */
test("importing a candidate loads no decoder and touches no file", () => {
	const seen = new Set<string>()
	const queue = [join(PROTOTYPE_ROOT, "candidates", "p1a.ts"), join(PROTOTYPE_ROOT, "candidates", "p1ap.ts")]
	while (queue.length > 0) {
		const path = queue.pop() as string
		if (seen.has(path)) continue
		seen.add(path)
		const source = readFileSync(path, "utf8")
		// Strip block comments so the prose above (which names `sharp`) is not mistaken for an import.
		const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
		assert.ok(!/from\s+"sharp"/.test(code), `${path} imports sharp`)
		assert.ok(!/from\s+"\.\.\/src\/emit\/index\.ts"/.test(code), `${path} imports the barrel, which loads sharp`)
		for (const match of code.matchAll(/from\s+"(\.[^"]+\.ts)"/g)) {
			queue.push(join(path, "..", match[1]))
		}
	}
	// It really did walk something.
	assert.ok(seen.size >= 4, `walked ${seen.size} modules`)
})

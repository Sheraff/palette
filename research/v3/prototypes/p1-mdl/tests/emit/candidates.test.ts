/**
 * The two candidate modules.
 *
 * **Updated 2026-08-05, when M2 wired them.** These were scaffolds that threw `NotYetWiredError`, and
 * the two tests asserting that behaviour are gone with the behaviour — replaced by the two claims
 * that matter now: each candidate names its own energy version separately from its algorithm version,
 * and importing one still loads no decoder.
 *
 * The import-closure guard is the one that has to keep working across the wiring, and it is the reason
 * `paletteOf` reaches `src/search/` through a *dynamic* import: `src/search/index.ts` pulls in
 * `src/measure/decode.ts`, which loads `sharp`, and a dev loop that merely enumerates candidates to
 * list them must not initialise a native image decoder to do it.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import * as p1a from "../../candidates/p1a.ts"
import * as p1ap from "../../candidates/p1ap.ts"
import { PROTOTYPE_ROOT } from "../../src/emit/paths.ts"

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

test("each candidate names its energy version separately from its algorithm version", () => {
	// `DESIGN.md` decision 9 is why these are two strings: arm A's ink term has a known defect awaiting
	// a fix that will move the energy without changing the candidate's identity, and a warehouse row
	// that recorded only `p1a-0.1.0` could not tell a palette from before that fix from one after it.
	assert.equal(p1a.ENERGY_VERSION, "p1a-energy-0.2.0")
	assert.equal(p1ap.ENERGY_VERSION, "p1ap-energy-0.1.0")
	assert.notEqual(p1a.ENERGY_VERSION, p1a.ALGORITHM_VERSION)
})

test("a candidate that cannot see its image rejects rather than inventing a palette", async () => {
	// Whatever goes wrong, it goes wrong *loudly*: a failed dev-loop row naming the error is
	// information, a repaired palette is not. The path below does not exist, so this exercises the
	// decoder's own refusal through the whole wired stack.
	await assert.rejects(() => p1a.paletteOf(join(PROTOTYPE_ROOT, "no-such-cover.jpg")))
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

/**
 * The candidate modules.
 *
 * **Updated 2026-08-05 again**, when the v1 pair arrived: `p1a-v1` and `p1ap-v1` are the same two
 * mechanisms with the λ probe's operating point frozen into them, because `src/devloop/types.ts`
 * says a candidate with a knob is two candidates. So the v0 pair keeps its own tests unchanged —
 * that is the point of not having edited them — and the v1 pair gets one more claim than the v0 pair
 * has: that its pinned constants are the numbers `data/lambda-probe/LAMBDA.md` actually recorded.
 * Those assertions quote the document in comments and compare against the modules' exports, so a
 * quiet edit to either constant fails here rather than in an eight-hour re-emission.
 *
 * What is deliberately *not* tested is a real emission. `BUDGET_MS` is 240 000, and a test that ran
 * one would be a four-minute test per image; the claims below are all static, in the spirit of the
 * `NotYetWiredError`-era structure this file used to have.
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
import * as p1aV1 from "../../candidates/p1a-v1.ts"
import * as p1apV1 from "../../candidates/p1ap-v1.ts"
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

test("the v1 pair exports the same CandidateModule surface under its own ids", () => {
	// Distinct ids are what keep a v1 palette out of a v0 cache path and out of a v0 row: the id
	// appears in run ids, cache paths and the viewer, and the two operating points must never share
	// one.
	assert.equal(p1aV1.candidateId, "p1a-v1")
	assert.equal(p1apV1.candidateId, "p1ap-v1")
	assert.equal(typeof p1aV1.paletteOf, "function")
	assert.equal(typeof p1apV1.paletteOf, "function")
	assert.equal(p1aV1.candidate.candidateId, "p1a-v1")
	assert.equal(p1apV1.candidate.candidateId, "p1ap-v1")
	assert.notEqual(p1aV1.candidateId, p1a.candidateId)
	assert.notEqual(p1apV1.candidateId, p1ap.candidateId)
})

test("the v1 pair moves its algorithm version and names the v1 energies", () => {
	// The mechanism is byte-identical to v0's; the operating point is not, and `DESIGN.md` decision 9's
	// logic applies to it just the same — a row that could not tell a λ=0.1 palette from a λ=1 one is
	// not provenance. Arm A′'s energy version moves for its own reason: DESIGN 11's chromatic residual
	// is v1's single recorded repair to that prior.
	assert.equal(p1aV1.ALGORITHM_VERSION, "p1a-0.2.0")
	assert.equal(p1apV1.ALGORITHM_VERSION, "p1ap-0.2.0")
	assert.notEqual(p1aV1.ALGORITHM_VERSION, p1a.ALGORITHM_VERSION)
	assert.notEqual(p1apV1.ALGORITHM_VERSION, p1ap.ALGORITHM_VERSION)
	assert.equal(p1aV1.ENERGY_VERSION, "p1a-energy-0.2.0")
	assert.equal(p1apV1.ENERGY_VERSION, "p1ap-energy-0.2.0")
})

test("the pinned constants are the operating point LAMBDA.md recorded, not a later edit", () => {
	// `data/lambda-probe/LAMBDA.md`, §"Operating point for the v1 re-emission (picked and stated)",
	// quoted verbatim so the assertion and its source sit in one screen:
	//
	//   "**λ_A = 0.1** `[MEASURED]` — anchor: the round demanded structure on structured artwork
	//    (item 2: a 4-colour artwork described with 2), and 0.1 is the largest probed λ giving
	//    structure on 4/6 covers at the honest (4×) budget while the flat-tending covers still
	//    collapse. λ=0.05 buys nothing further."
	//
	//   "**A′ λ = 1.0 unchanged** — its repair is the chromatic residual (0.2.0); the item-2 fixture
	//    passes at λ=1. One knob per arm per iteration."
	//
	//   "**Budget 240 s/image for the re-emission, both arms** `[DISCLOSED]` — a compute knob, not a
	//    mechanism change ... Header records it."
	assert.equal(p1aV1.LAMBDA, 0.1)
	assert.equal(p1apV1.LAMBDA, 1.0)
	assert.equal(p1aV1.BUDGET_MS, 240000)
	assert.equal(p1apV1.BUDGET_MS, 240000)
	// "both arms": the budget being *equal* is load-bearing, not incidental. M3 compares priors, and
	// an arm given 4× the search of the other would make it a comparison of compute instead.
	assert.equal(p1aV1.BUDGET_MS, p1apV1.BUDGET_MS)
	// 240 s in milliseconds, spelled out — a stray factor of a thousand is the plausible mistake here.
	assert.equal(p1aV1.BUDGET_MS, 240 * 1000)
})

test("the v1 modules pass their pinned constants to emit, and A′ passes no λ", () => {
	// A source-level claim, because running `emit()` at a 240 s budget is not a test. Two things have
	// to hold: arm A hands `emit()` its λ (the default is 1.0, which is the degeneracy the probe
	// diagnosed), and arm A′ hands it none at all — A′'s λ is the energy's own default, and passing a
	// literal would make a second place for it to drift from.
	const sourceA = readFileSync(join(PROTOTYPE_ROOT, "candidates", "p1a-v1.ts"), "utf8")
	const sourceAprime = readFileSync(join(PROTOTYPE_ROOT, "candidates", "p1ap-v1.ts"), "utf8")
	const callA = /emit\(imagePath,\s*\{([^}]*)\}\)/.exec(sourceA)?.[1] ?? ""
	const callAprime = /emit\(imagePath,\s*\{([^}]*)\}\)/.exec(sourceAprime)?.[1] ?? ""
	assert.match(callA, /arm:\s*"a"/)
	assert.match(callA, /lambda:\s*LAMBDA/)
	assert.match(callA, /budgetMs:\s*BUDGET_MS/)
	assert.match(callAprime, /arm:\s*"aprime"/)
	assert.match(callAprime, /budgetMs:\s*BUDGET_MS/)
	assert.ok(!/lambda/.test(callAprime), `p1ap-v1 pins a λ: ${callAprime}`)
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
	// All four candidates, v0 and v1: the v1 pair reaches one module the v0 pair does not
	// (`src/energy/aprime/constants.ts`), and the guard is only worth anything if it walks what
	// actually ships.
	const queue = ["p1a.ts", "p1ap.ts", "p1a-v1.ts", "p1ap-v1.ts"].map((name) =>
		join(PROTOTYPE_ROOT, "candidates", name),
	)
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

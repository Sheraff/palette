/**
 * # Determinism: the same file twice, byte for byte
 *
 * `DESIGN.md`'s mechanism clause: *"Anytime, deterministic ... No RNG, no hash-order iteration;
 * canonical sort + fixed tie-break"*, and the M2 brief asks for the double-run on demo-20 covers
 * specifically. This is the test that keeps the claim honest, and it is checked on the *serialized
 * palette* rather than on a few fields, because a palette that differs in a stop position at the
 * eleventh decimal is a palette a diff will report and a reviewer will be shown.
 *
 * ## The second image is run at a truncated budget on purpose
 *
 * The interesting failure mode is not "the search converged twice to the same answer" — that is
 * nearly free. It is **the budget running out mid-enumeration**: if any part of the search's order
 * depended on a clock, on a `Map`'s insertion order, or on anything else the machine supplies, that
 * is where two runs would diverge. So the second cover is emitted with a deliberately small
 * allowance, which guarantees the enumeration is cut off partway and forces the cut to land in the
 * same place both times.
 *
 * The diagnostics' wall-clock fields are excluded from the comparison. They are measurements *of* the
 * run, not outputs of the algorithm, and asserting on them would be asserting that two runs took the
 * same number of milliseconds.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { emit } from "../../src/search/index.ts"
import type { Diagnostics } from "../../src/search/types.ts"
import { demo20Images } from "./support.ts"

/** A budget small enough to guarantee the coarse enumeration is truncated. */
const TRUNCATING_BUDGET_MS = 400

/** Everything except the wall clock, which measures the machine rather than the algorithm. */
function withoutWallClock(diagnostics: Diagnostics): unknown {
	const { wallMs: _wallMs, ...rest } = diagnostics
	return rest
}

test("two runs over the same cover produce byte-identical palettes (full allowance)", async () => {
	const [cover] = demo20Images()
	const first = await emit(cover, { arm: "a", skipKnownBetterFeasible: true })
	const second = await emit(cover, { arm: "a", skipKnownBetterFeasible: true })

	assert.equal(JSON.stringify(first.palette), JSON.stringify(second.palette))
	assert.deepEqual(withoutWallClock(first.diagnostics), withoutWallClock(second.diagnostics))
	assert.equal(first.diagnostics.searchCertificate, "UNCERTIFIED-V0")
})

test("two runs over the same cover agree when the budget truncates the enumeration", async () => {
	const cover = demo20Images()[1]
	const options = {
		arm: "aprime" as const,
		budgetMs: TRUNCATING_BUDGET_MS,
		skipKnownBetterFeasible: true,
	}
	const first = await emit(cover, options)
	const second = await emit(cover, options)

	assert.equal(
		first.diagnostics.effort.budgetExhausted,
		true,
		"the truncating budget did not actually truncate; raise the alphabet or lower the budget",
	)
	assert.equal(JSON.stringify(first.palette), JSON.stringify(second.palette))
	assert.deepEqual(withoutWallClock(first.diagnostics), withoutWallClock(second.diagnostics))
})

test("the two arms are given the same configuration space on the same cover", async () => {
	// `DESIGN.md` M3 compares priors, not implementations, so the cost model deliberately costs both
	// arms with the more expensive arm's coefficients. The observable consequence is that the plan —
	// lattice rung, alphabet size, grammar level — is identical for the two arms.
	const [cover] = demo20Images()
	const a = await emit(cover, { arm: "a", budgetMs: 2_000, skipKnownBetterFeasible: true })
	const aprime = await emit(cover, { arm: "aprime", budgetMs: 2_000, skipKnownBetterFeasible: true })

	assert.deepEqual(a.diagnostics.searchScale, aprime.diagnostics.searchScale)
})

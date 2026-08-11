/**
 * **The excursion bar is inherited, and this test is what makes "inherited" checkable.**
 *
 * The contract states the P1 excursion bar in prose and in its own audit (`AUDIT_ROWS`), but it does
 * **not** export it as a number — so this prototype has to restate it, and a restated constant is a
 * copy that can silently go stale. `DECISIONS.md` D6 and this pass's brief both say the same thing
 * about it: *consume it as-is with its provenance, never a new number*. So the copy is pinned to the
 * source: if the contract ever moves the multiple, reclassifies the row, or drops it, this test fails
 * and the prototype's constant is re-read by a human instead of quietly disagreeing with the campaign.
 *
 * The right long-term home for the number is a named export in `src/contract/constants.ts`. That is a
 * contract change and not a prototype worker's to make, so it is recorded here rather than done.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { AUDIT_ROWS } from "../../../../../src/contract/perception-model-audit.ts"
import { EXCURSION_BAR_MULTIPLE, EXCURSION_SAMPLES_PER_SEGMENT, ONE_BAR_IN_BAR_UNITS } from "../constants.ts"
import { RAMP_SAMPLES_PER_SEGMENT } from "../../../../../src/contract/constants.ts"

test("the excursion bar this module uses is the contract's own P1 quantity", () => {
	const row = AUDIT_ROWS.find((candidate) => candidate.id === "P1 excursion bar")
	assert.ok(row !== undefined, "the contract's audit no longer carries the P1 excursion bar row")
	assert.equal(row.value, `${EXCURSION_BAR_MULTIPLE}x the same-colour bar`)
	assert.equal(row.site, "PHASE_0_DECISIONS.md §4 P1")
	// Carried, not hidden: the row's own classification travels with the number this module ranks on.
	assert.equal(row.classification, "unknown-untested")
})

test("the sampling density is the contract's, and the bar unit is a unit", () => {
	assert.equal(EXCURSION_SAMPLES_PER_SEGMENT, RAMP_SAMPLES_PER_SEGMENT)
	assert.equal(ONE_BAR_IN_BAR_UNITS, 1)
})

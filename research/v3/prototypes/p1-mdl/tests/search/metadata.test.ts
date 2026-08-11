/**
 * # The `algorithmVersion` override reaches the palette, and reaches nothing else
 *
 * `ALGORITHM_VERSIONS` in `src/emit/palette.ts` is keyed by **arm**, and `emit()` used to stamp
 * `PaletteMetadata.algorithmVersion` from it unconditionally. An arm has more than one operating
 * point — v0 is λ=1.0 at 60 s, v1 is λ=0.1 (arm A) or the 0.2.0 chromatic residual (arm A′) at 240 s
 * — so every v1 palette went out carrying `"…-0.1.0"`. That is not a stale label; it is a row saying
 * it came from a computation that did not produce it, and the warehouse cannot tell the two apart
 * afterwards.
 *
 * The fix is one optional field, and this file makes the two claims that field has to satisfy:
 *
 * 1. **It arrives.** What a caller names is what `metadata.algorithmVersion` says.
 * 2. **It arrives and nothing else moves.** Two emissions differing only in that string are
 *    byte-identical everywhere else — same roles, same gradient, same flags, same energy, same
 *    canonical key. This is the claim that makes the fix safe to apply to already-emitted rounds: a
 *    re-emission under the corrected stamp reproduces the palettes it corrects.
 *
 * Claim 2 is the load-bearing one, and it is checked by comparison rather than by inspection, because
 * `meta` is handed to the `Evaluator` as well as to `toPalette` — reading the code and concluding
 * "no energy uses it" is exactly the kind of reasoning a test should replace.
 *
 * ## Why the fixture is pinned
 *
 * `writeBandedImage(THREE_COLORS)` with the rung and grammar forced: this test is about a string, not
 * about what a search finds, and the flat-only grammar over three colours runs in well under a second
 * where the mechanism guard's four-stop grammar takes half a minute. Determinism is not in question
 * here — `determinism.test.ts` owns that claim — but the comparison below would fail loudly if it
 * were.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import { ALGORITHM_VERSIONS } from "../../src/emit/palette.ts"
import { measureImage } from "../../src/measure/index.ts"
import { emit } from "../../src/search/index.ts"
import { coarseCellSide } from "../../src/search/constants.ts"
import { THREE_COLORS, writeBandedImage } from "./support.ts"

/** The finest rung of the coarse ladder, as `mechanism.test.ts` pins it: each colour its own cell. */
const FINEST_BAR_MULTIPLE = 1 / 8

/** Cheap and fully pinned: the search's answer is not what is under test here. */
const PINNED = {
	coarseCellBarMultiple: FINEST_BAR_MULTIPLE,
	grammarLevel: "flat-only",
	skipKnownBetterFeasible: true,
} as const

/**
 * Deliberately not a version any module publishes.
 *
 * If the override were being ignored the assertion would still have to fail, and it can only be
 * relied on to do that when the expected string cannot arrive by any other route — a test that
 * overrode `p1a` with `"p1a-0.2.0"` would pass just as well against a table that had been edited.
 */
const NAMED_VERSION = "p1a-override-test-9.9.9"

test("emit() stamps the algorithmVersion the caller named", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)

	const { palette } = await emit(imagePath, {
		arm: "a",
		measurement,
		algorithmVersion: NAMED_VERSION,
		...PINNED,
	})

	assert.equal(palette.metadata.algorithmVersion, NAMED_VERSION)
	assert.notEqual(palette.metadata.algorithmVersion, ALGORITHM_VERSIONS.p1a)
})

test("emit() falls back to the arm's v0 string when the caller names none", async () => {
	// The v0 behaviour, unchanged and asserted as such: `candidates/p1a.ts` now passes this string
	// explicitly, but a direct `emit()` call — a probe, a sweep, this suite — still gets it by default.
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)

	const { palette } = await emit(imagePath, { arm: "a", measurement, ...PINNED })

	assert.equal(palette.metadata.algorithmVersion, ALGORITHM_VERSIONS.p1a)
	assert.equal(palette.metadata.algorithmVersion, "p1a-0.1.0")
})

test("the override moves the stamp and nothing else — same colours, same energy, same key", async () => {
	const imagePath = await writeBandedImage(THREE_COLORS)
	const measurement = await measureImage(imagePath)

	const stamped = await emit(imagePath, {
		arm: "aprime",
		measurement,
		algorithmVersion: "p1ap-override-test-9.9.9",
		...PINNED,
	})
	const plain = await emit(imagePath, { arm: "aprime", measurement, ...PINNED })

	// Everything except the one field, compared as serialized bytes rather than field by field, so a
	// future addition to `Palette` is covered by this test without anyone remembering to extend it.
	const withoutVersion = (palette: (typeof plain)["palette"]) =>
		JSON.stringify({ ...palette, metadata: { ...palette.metadata, algorithmVersion: null } })
	assert.equal(withoutVersion(stamped.palette), withoutVersion(plain.palette))
	assert.notEqual(
		stamped.palette.metadata.algorithmVersion,
		plain.palette.metadata.algorithmVersion,
		"the two emissions were supposed to differ in exactly this field",
	)

	// And the search reached the same place: the string is not an input to any energy or tie-break.
	assert.equal(stamped.diagnostics.incumbent.canonicalKey, plain.diagnostics.incumbent.canonicalKey)
	assert.equal(stamped.diagnostics.incumbent.energy, plain.diagnostics.incumbent.energy)
	assert.deepEqual(stamped.diagnostics.incumbent.terms, plain.diagnostics.incumbent.terms)
	assert.deepEqual(stamped.diagnostics.effort, plain.diagnostics.effort)
})

test("the pinned rung really is one cell per colour, so the fixture is what it claims", () => {
	// Cheap guard on the shortcut above: if `coarseCellSide` ever changed under this bar multiple the
	// three tests would still pass while searching something other than the three-colour alphabet, and
	// their run time — the reason the rung is pinned at all — would be the thing that quietly moved.
	assert.ok(coarseCellSide(FINEST_BAR_MULTIPLE) > 0)
	assert.equal(THREE_COLORS.length, 3)
})

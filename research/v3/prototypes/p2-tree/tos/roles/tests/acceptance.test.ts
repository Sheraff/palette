/**
 * **The two cases round 1 named, and the outcome it forbade.**
 *
 * `review-rounds/round-1-tree-families/OUTCOME.md` is the requirements list for this cycle, and two of
 * its lines are testable as artefacts rather than as opinions:
 *
 *  1. `…d859a69094`, verbatim: *"black is the artwork's text → fg should be black"*. Asserted as
 *     structure (a text group is found and its representative leads the foreground) **and** as the
 *     exact triple, because "dark enough" is a judgement and an exact triple is a fact. A change that
 *     moves this hex is not necessarily wrong, but it is a change the reviewer has to be shown.
 *  2. *"indistinguishable sibling pairs must collapse — never publish twins"*, on `…21256ce593` and
 *     everywhere else. Asserted over the whole demo set: no role pair inside the same-colour bar that
 *     is not an exact, flagged, sanctioned collapse — and, separately, zero contract violations, since
 *     invariant 3 is the contract's own statement of the same rule and the two must agree.
 *
 * ## This file needs the corpus and does not skip without it
 *
 * The shards are symlinked at the worktree root. If they are absent this test **fails** rather than
 * skipping: an acceptance case that silently does not run is the failure mode
 * `reviews/phase-0-adversarial/contract.md` finding 5 describes, and it is worse than a red test
 * because it looks like evidence. The corpus-free half of the detector's evidence is in
 * `text-detector.test.ts`, which is where a shard-less worktree still gets a signal.
 */

import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { forbiddenTwinPairs } from "../assemble.ts"

/** The repository root: six levels up from `research/v3/prototypes/p2-tree/tos/roles/tests`. */
const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../../../../..")
const SET_FILE = resolve(import.meta.dirname, "../../../../../data/devloop/sets/demo-20.txt")

function demoSet(): string[] {
	const lines = readFileSync(SET_FILE, "utf8").split("\n")
	return lines
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.map((relative) => join(REPOSITORY_ROOT, relative))
}

/** `…d859a69094` — the laminar cover whose title is set in black. */
const ACCEPTANCE_TEXT_COVER = "00/ab67616d00001e02000001335fe604d859a69094.jpg"

/**
 * The exact triple the artwork's title is set in, as this pipeline reads it.
 *
 * Cycle 1 published `#939393` here — mid grey on a white-to-grey ramp — and the reviewer called the
 * foreground unreadable. `#070506` is the deepest node of the title's glyph chains, which is what the
 * eye calls black and what the same-colour bar calls one colour with `#050304`, `#060606`, `#080405`
 * and `#080607`, the other letters of the same line.
 */
const ACCEPTANCE_TEXT_HEX = "#070506"

test("…d859a69094: the artwork's own text colour leads the foreground", async () => {
	const path = join(REPOSITORY_ROOT, ACCEPTANCE_TEXT_COVER)
	assert.ok(existsSync(path), `the corpus shard is missing: ${path}`)
	const { palette, parse } = await paletteWithDiagnostics(path)

	// Structure: the detector found type at all, and it found a line of it.
	assert.ok(parse.textGroups.length >= 1, "no text group was found on a cover whose title is display type")
	const leading = parse.textGroups[0]
	assert.ok(leading.nodeIds.length >= 4, `the leading group has ${leading.nodeIds.length} components`)

	// The reviewer's ruling: the foreground is the text group's representative, and it is black.
	assert.deepEqual(palette.roles.foreground.rgb, leading.repr, "the foreground is not the text group's colour")
	assert.equal(palette.roles.foreground.hex, ACCEPTANCE_TEXT_HEX)

	// The rest of the palette the reviewer already called acceptable, held as the dark exact triple's
	// context so a change to the field is visible in the same failure.
	assert.equal(palette.roles.background.hex, "#ffffff")
	assert.equal(palette.roles.surface.hex, "#e0e0e0")
	assert.equal(palette.roles.accent.hex, "#161415")
	assert.equal(validatePalette(palette).violations.length, 0)
})

test("no forbidden twin pair is published anywhere in demo-20", async () => {
	const paths = demoSet()
	assert.equal(paths.length, 20)
	const offenders: string[] = []
	const invalid: string[] = []
	for (const path of paths) {
		assert.ok(existsSync(path), `the corpus shard is missing: ${path}`)
		const { palette } = await paletteWithDiagnostics(path)
		const twins = forbiddenTwinPairs(palette)
		if (twins.length > 0) offenders.push(`${path}: ${twins.join(", ")}`)
		const violations = validatePalette(palette).violations
		if (violations.length > 0) invalid.push(`${path}: ${violations.map((violation) => violation.code).join(", ")}`)
	}
	assert.deepEqual(offenders, [], "the reviewer's forbidden outcome was published")
	// Invariant 3 is the contract's statement of the same rule; the two must never disagree.
	assert.deepEqual(invalid, [], "a published palette does not satisfy the contract")
})

/**
 * **The role-swap check, measured rather than assumed.**
 *
 * The check exists because reviewer evidence shows foreground↔accent *ordering* errors on colours the
 * extractor had already recovered — an assignment failure, not an extraction one. Whether demo-20
 * contains such a case is an empirical question, and the honest test is the one that records the
 * answer either way rather than the one that asserts the answer the author hoped for.
 *
 * **As measured on 2026-08-04: the check is a no-op on all twenty covers.** That is a real result and
 * it has a reason: the foreground ranking leads with text groups and the accent ranking does not, so
 * for a swap to be strictly better on both, the settled accent would have to sit *ahead* of the
 * settled foreground in the foreground's own ranking — which happens only when the walk skipped that
 * candidate, and a candidate the foreground walk skipped is one the contract refused. The check is
 * therefore cheap insurance against an assignment inversion this pipeline does not currently make, and
 * the day it starts firing is a day something upstream changed.
 */
test("the role-swap check is exercised, and this is what it decided on demo-20", async () => {
	const paths = demoSet()
	const swapped: string[] = []
	for (const path of paths) {
		const diagnostics = await paletteWithDiagnostics(path)
		if (diagnostics.swapped) swapped.push(path)
	}
	assert.deepEqual(swapped, [], "a role swap was published; the recorded measurement says none is")
})

test("…21256ce593: the round-1 twin case publishes four distinguishable roles", async () => {
	const path = join(REPOSITORY_ROOT, "00/ab67616d00001e0200000bbc3367a621256ce593.jpg")
	assert.ok(existsSync(path), `the corpus shard is missing: ${path}`)
	const { palette } = await paletteWithDiagnostics(path)
	assert.deepEqual(forbiddenTwinPairs(palette), [])
	assert.equal(palette.collapse.surfaceCollapsed, false)
	assert.equal(palette.collapse.accentCollapsed, false)
	assert.equal(validatePalette(palette).violations.length, 0)
})

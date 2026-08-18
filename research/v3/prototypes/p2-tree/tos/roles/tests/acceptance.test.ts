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
import { rgbToHex } from "../../../../../src/contract/color.ts"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { forbiddenTwinPairs } from "../assemble.ts"
import { RAW_APCA_INDIFFERENCE } from "../indifference.ts"
import { minFieldContrast, renderedFieldOf } from "../rank.ts"

/** `"#rrggbb"` back to a triple, so a pinned hex can be measured beside a published one. */
function hexToRgb(hex: string): Rgb8 {
	return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)]
}

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
 * foreground unreadable. Cycles 2–4 published `#070506`, the *largest* of the title's glyph
 * components; cycle 5 publishes `#050304`, the most *readable* of them.
 *
 * **The change is the round-5 item-2 trade, and the reviewer graded it.** Both sides came back
 * **strong** with **no preference** (`review-rounds/round-5-pricing/OUTCOME.md`), which is what
 * `DECISIONS.md` D18.1 reads as a release: which member of one title's cluster publishes is a choice the
 * reviewer does not make, so the stage may make it on stability grounds. The two triples differ by 0.03
 * of raw APCA against a band of 1.98 — the same colour, by the only instrument that has an opinion.
 *
 * The hex is still pinned, for the reason it always was: *"dark enough" is a judgement and an exact
 * triple is a fact*, and a change that moves it is a change the reviewer has to be shown. What the
 * assertions below no longer do is treat the *identity of the member* as the acceptance criterion —
 * that is now the structural block, and the hex is its witness.
 */
const ACCEPTANCE_TEXT_HEX = "#050304"

/** The member cycles 2–4 published: the same title, the same cluster, the area-largest component. */
const SUPERSEDED_TEXT_HEX = "#070506"

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

	// ---- D18.1, as structure: which member publishes, and why it may move --------------------------
	//
	// Both triples are components of the *same* group — one line of one title — so the substitution the
	// round priced is a choice **inside the winning cluster** and never a choice between clusters. That
	// is the property the ruling releases; the identity of the member is not.
	const reprById = new Map(parse.nodes.map((node) => [node.id, rgbToHex(node.repr)]))
	const memberHexes = new Set(leading.nodeIds.map((nodeId) => reprById.get(nodeId)))
	assert.ok(memberHexes.has(ACCEPTANCE_TEXT_HEX), `the published member is not in the group: ${[...memberHexes]}`)
	assert.ok(memberHexes.has(SUPERSEDED_TEXT_HEX), `the superseded member is not in the group: ${[...memberHexes]}`)

	// And the substitution is one the instrument cannot resolve: the two members' readability over the
	// rendered field differs by less than the band raw APCA returns for two identical colours. This is
	// what "the reviewer graded both sides strong and preferred neither" looks like as a measurement.
	const field = renderedFieldOf(parse.roles.background, parse.roles.surface, parse.gradient)
	const published = minFieldContrast(palette.roles.foreground.rgb, field)
	const superseded = minFieldContrast(hexToRgb(SUPERSEDED_TEXT_HEX), field)
	assert.ok(
		Math.abs(published - superseded) < RAW_APCA_INDIFFERENCE,
		`the two members differ by ${Math.abs(published - superseded)} of raw APCA, past the ${RAW_APCA_INDIFFERENCE} ` +
			"band — the member rule is choosing between colours the instrument can tell apart, which is not what round 5 priced",
	)
	// The published member is the more readable of the two: that is the rule's direction, stated.
	assert.ok(published >= superseded, "the published member is less readable than the one it replaced")

	// The rest of the palette the reviewer already called acceptable, held as the dark exact triple's
	// context so a change to the field is visible in the same failure.
	assert.equal(palette.roles.background.hex, "#ffffff")
	assert.equal(palette.roles.surface.hex, "#e0e0e0")
	// The accent moved with the same ruling and for the same reason: `#161415` → `#181818` is a
	// cluster-member substitution on the accent's chroma order (D18.1, round-5 item 1's release).
	assert.equal(palette.roles.accent.hex, "#181818")
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

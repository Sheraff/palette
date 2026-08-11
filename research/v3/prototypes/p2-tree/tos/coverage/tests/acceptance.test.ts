/**
 * **D9's acceptance case**, `00/ab67616d00001e0200000f92552b0935b967964d.jpg` — Strawberry Moon.
 *
 * The reviewer graded both accents *weak* and preferred the one that was the worse colour:
 *
 * > side A represents more of the artwork: pale background, green and red subject, but the red is not
 * > the correct shade on the foreground pink
 * > side B has the correct shade of red (Strawberry Moon), but doesn't have the green
 *
 * D9's reading: chroma-first found the right accent *shade*; the palette lost on **identity-coverage
 * across roles**. What this file asserts is the coverage claim and nothing about taste:
 *
 *  1. the census finds two families here — a red and a green;
 *  2. the published foreground `#edbab9` already represents the **red**, so the coral's family is
 *     covered and the accent is free to carry the other one;
 *  3. the published palette therefore carries **both** families among its four roles;
 *  4. the coral `#d25068` is still the head of the accent ranking and still the most chromatic
 *     admissible candidate — D9 re-scoped the old acceptance from "coral wins the accent" to exactly
 *     this structural recall, *"the part the reviewer confirmed correct"*, and moving the accent for
 *     coverage must not quietly undo the mining work that put the coral in the pool;
 *  5. the palette is legal and publishes no forbidden twin pair.
 *
 * (2) is the hinge and it is the reason this rule can fire at all here: `#edbab9` is chroma 0.0591 —
 * chromatic by `colorRegion`, barely — at hue 19.7°, inside the same family as the coral at 12.3°. Had
 * the foreground been one shade paler it would have been neutral, nothing would represent the red, and
 * `allocate.ts`'s second narrowing would have left the coral in place. The rule is that sensitive on
 * this cover, and the test says so rather than hiding it: assertion (2) is written against the measured
 * chroma so a drift in the foreground turns into a failure here instead of a silent no-op.
 */

import assert from "node:assert/strict"
import { access } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { colorFromRgb, rgbToHex, rgbToOkLab } from "../../../../../src/contract/color.ts"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { decodeImage, unpack } from "../../pipeline.ts"
import { forbiddenTwinPairs } from "../../roles/assemble.ts"
import { chromaOf, familyOf, isChromatic } from "../census.ts"
import { paletteWithCoverage } from "../candidate-coverage.ts"

const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..")
const REPO_ROOT = resolve(V3_ROOT, "..", "..")
const ACCEPTANCE_IMAGE = resolve(REPO_ROOT, "00", "ab67616d00001e0200000f92552b0935b967964d.jpg")

test("Strawberry Moon: the four roles carry both the red family and the green family", async () => {
	await access(ACCEPTANCE_IMAGE).catch(() => {
		throw new Error(`the acceptance cover is missing at ${ACCEPTANCE_IMAGE}; the corpus shards must be linked in`)
	})
	const result = await paletteWithCoverage(ACCEPTANCE_IMAGE)
	const { census, target } = result.decision
	const roles = result.palette.roles

	// ---- 1. two families ---------------------------------------------------------------------------
	assert.equal(census.families.length, 2, `families: ${census.families.map((family) => family.representative.hex)}`)
	const hueDegrees = (family: (typeof census.families)[number]) => (family.hueStart * 180) / Math.PI
	const redFamily = census.families.find((family) => hueDegrees(family) < 60)
	const greenFamily = census.families.find((family) => hueDegrees(family) > 90)
	assert.ok(redFamily !== undefined && greenFamily !== undefined, "one red family and one green family")

	// ---- 2. the foreground already represents the red ------------------------------------------------
	assert.ok(isChromatic(roles.foreground.rgb), `the foreground ${roles.foreground.hex} must be chromatic to represent`)
	assert.ok(
		chromaOf(roles.foreground.rgb) < 0.08,
		`the foreground's chroma is ${chromaOf(roles.foreground.rgb)} — this cover's hinge was that it sits just` +
			" inside the chromatic band; a foreground this saturated means the case has changed",
	)
	assert.equal(familyOf(census, roles.foreground.rgb)?.rank, redFamily.rank, "the foreground must sit in the red family")
	assert.equal(target?.rank, greenFamily.rank, "the accent must therefore be steered to the green family")

	// ---- 3. both families are in the published palette ------------------------------------------------
	const covered = new Set(
		[roles.background, roles.surface, roles.foreground, roles.accent]
			.map((color) => familyOf(census, color.rgb)?.rank)
			.filter((rank): rank is number => rank !== undefined),
	)
	assert.ok(covered.has(redFamily.rank), "no role carries the red family")
	assert.ok(covered.has(greenFamily.rank), "no role carries the green family")
	assert.equal(familyOf(census, roles.accent.rgb)?.rank, greenFamily.rank, "the accent is the green")
	assert.notEqual(roles.accent.hex, result.baseline.roles.accent.hex, "the accent must have moved off the baseline's")
	assert.equal(result.changed, true)

	// ---- 4. the coral's recall is intact ---------------------------------------------------------------
	const CORAL: Rgb8 = [0xd2, 0x50, 0x68]
	const image = await decodeImage(ACCEPTANCE_IMAGE)
	const present = new Set<string>()
	for (const packed of image.packed) present.add(colorFromRgb(unpack(packed)).hex)
	assert.ok(present.has(roles.accent.hex), "the published accent must be an exact triple of the artwork")
	assert.ok(present.has(rgbToHex(CORAL)), "the coral must be an exact triple of the artwork")

	const accentPool = result.decision.accentOrder
	assert.ok(
		accentPool.some((color) => rgbToHex(color) === rgbToHex(CORAL)),
		"the coral must still be in the accent pool — the coverage rule re-orders, it never excludes",
	)
	const backgroundLab = rgbToOkLab(roles.background.rgb)
	const chromaFromField = (color: Rgb8): number => {
		const lab = rgbToOkLab(color)
		return Math.hypot(lab[1] - backgroundLab[1], lab[2] - backgroundLab[2])
	}
	assert.equal(
		Math.max(...accentPool.map(chromaFromField)),
		chromaFromField(CORAL),
		"the coral must still be the most chromatic candidate in the pool — D9's re-scoped recall claim",
	)
	assert.equal(rgbToHex(result.baseline.roles.accent.rgb), rgbToHex(CORAL), "chroma-first must still elect the coral")

	// ---- 5. the palette is legal --------------------------------------------------------------------
	assert.deepEqual(validatePalette(result.palette).violations, [], "the published palette must satisfy the contract")
	assert.deepEqual(forbiddenTwinPairs(result.palette), [], "no forbidden twin pair")

	console.log(
		`acceptance (a): ${roles.background.hex} · ${roles.surface.hex} · ${roles.foreground.hex} · ${roles.accent.hex}` +
			`  (baseline accent ${result.baseline.roles.accent.hex})`,
	)
})

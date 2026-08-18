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
 *  2. the published foreground **represents** the red, so the coral's family is already carried and the
 *     accent is free to carry the other one;
 *  3. the published palette therefore carries **both** families among its four roles;
 *  4. the coral `#d25068` is still the head of the accent ranking and still the most chromatic
 *     admissible candidate — D9 re-scoped the old acceptance from "coral wins the accent" to exactly
 *     this structural recall, *"the part the reviewer confirmed correct"*, and moving the accent for
 *     coverage must not quietly undo the mining work that put the coral in the pool;
 *  5. the palette is legal and publishes no forbidden twin pair.
 *
 * ## (2) is the hinge, and **which clause carries it has changed** (worker P, D18.1 + D20)
 *
 * `census.ts`'s `familyRepresentedBy` accepts a role as representing a family two ways, either
 * sufficing: **the bar** (the role is inside the same-colour bar of one of the family's own colours) or
 * **the band** (the role is itself chromatic and lands in that family by hue).
 *
 * Until D18.1 the foreground was `#edbab9` — chroma 0.0591, `light-saturated`, hue 19.7° — and the
 * **band** clause carried it. Bounding cluster-member publication to the incumbent's indifference class
 * moved it to `#e4bdb6`: 0.72 of the pair's bar away, but across the `colorRegion` boundary, chroma
 * 0.0591 → **0.0461**, `light-saturated` → `light-neutral`. So under the census's own definition of
 * chromatic the foreground **is no longer a family member at all**: `isChromatic` is false and
 * `familyOf` returns `null`, even though its hue (29.96°) is 0.01° off a red member and squarely inside
 * the red arc. The band clause is dead on this cover.
 *
 * The **bar** clause carries it instead, and comfortably: 21 of the red family's own colours sit inside
 * the foreground's bar, the nearest (`#eabbb5`) at OKLab 0.0097 against a bar of 0.02293 — 0.42 of it.
 * So the red family is still *represented* by the figure pair, the allocator still computes `R = {red}`,
 * still steers the accent to the green, and the published palette is unchanged in structure: a neutral
 * ground pair, a foreground standing for the red, an olive accent standing for the green — the "green
 * and red subject" the reviewer named. D17 reads this as the figure pair (`fg`, `accent`) carrying both
 * families while the ground pair carries none, which is what the reviewer preferred on *this* cover.
 *
 * This file therefore asserts representation through the allocator's **own** predicate
 * (`familyRepresentedBy`) rather than through family membership, and asserts *which clause fires*
 * separately, so the next drift across the region boundary shows up here as a named failure rather than
 * as a silent no-op. Both directions are load-bearing: had `#e4bdb6` also fallen outside every red bar,
 * `R` would have been empty, narrowing #2 would have fired, and the accent would have stayed the coral.
 */

import assert from "node:assert/strict"
import { access } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import { REGION_CHROMA_BOUNDARY } from "../../../../../src/contract/constants.ts"
import { validatePalette } from "../../../../../src/contract/invariants.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { decodeImage, unpack } from "../../pipeline.ts"
import { forbiddenTwinPairs } from "../../roles/assemble.ts"
import { chromaOf, familyOf, familyRepresentedBy, hueDistance, hueOf, isChromatic, FAMILY_HUE_SEPARATION } from "../census.ts"
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
	// The claim the allocator acts on, stated in the allocator's own words: `R` contains the red.
	assert.ok(
		familyRepresentedBy(census, redFamily, roles.foreground.rgb),
		`the foreground ${roles.foreground.hex} must represent the red family — that is what frees the accent`,
	)
	assert.ok(
		!familyRepresentedBy(census, greenFamily, roles.foreground.rgb),
		"the foreground must not already represent the green, or the rule would have nothing left to carry",
	)

	// ...and *which* clause carries it, because that is the sensitive part of this cover. Since D18.1 it
	// is the bar, not the band: the foreground is neutral by `colorRegion`, so it belongs to no family.
	assert.equal(
		isChromatic(roles.foreground.rgb),
		false,
		`the foreground ${roles.foreground.hex} is chroma ${chromaOf(roles.foreground.rgb)}, expected below the region` +
			` boundary ${REGION_CHROMA_BOUNDARY}: since D18.1's class-bounded member publication this cover's` +
			" foreground sits just *outside* the chromatic band and is carried by the bar clause alone. A chromatic" +
			" foreground here means the case is back to its pre-D18.1 shape — re-read the header, not this line",
	)
	assert.equal(familyOf(census, roles.foreground.rgb), null, "a neutral foreground is a member of no family")
	const nearestRedMember = redFamily.members
		.map((member) => ({
			hex: member.hex,
			distance: okLabDistance(rgbToOkLab(member.rgb), rgbToOkLab(roles.foreground.rgb)),
			bar: sameColorBar(colorFromRgb(member.rgb), colorFromRgb(roles.foreground.rgb)),
		}))
		.sort((first, second) => first.distance / first.bar - second.distance / second.bar)[0]
	assert.ok(
		nearestRedMember.distance < nearestRedMember.bar,
		`the bar clause must carry the red: nearest red member ${nearestRedMember.hex} is ${nearestRedMember.distance}` +
			` from the foreground against a bar of ${nearestRedMember.bar}`,
	)
	// The hue identity is intact even though the membership rule can no longer see it — the foreground is
	// still a desaturated red, not a drift to some other part of the wheel.
	const hueToRed = Math.min(...redFamily.members.map((member) => hueDistance(hueOf(roles.foreground.rgb), member.hue)))
	const hueToGreen = Math.min(...greenFamily.members.map((member) => hueDistance(hueOf(roles.foreground.rgb), member.hue)))
	assert.ok(hueToRed < FAMILY_HUE_SEPARATION, `the foreground's hue is ${hueToRed} rad from the red family — outside its arc`)
	assert.ok(hueToRed < hueToGreen, "the foreground's hue must still be nearer the red family than the green")

	assert.equal(target?.rank, greenFamily.rank, "the accent must therefore be steered to the green family")

	// ---- 3. both families are in the published palette ------------------------------------------------
	// Representation, not membership: the allocator's predicate, applied to all four roles. A membership
	// count would read 1 here (the ground pair is neutral and so is the foreground) and would be counting
	// something the allocator never asked about.
	const published = [roles.background, roles.surface, roles.foreground, roles.accent]
	const carriedBy = (family: (typeof census.families)[number]) =>
		published.filter((color) => familyRepresentedBy(census, family, color.rgb)).map((color) => color.hex)
	const redCarriers = carriedBy(redFamily)
	const greenCarriers = carriedBy(greenFamily)
	assert.deepEqual(redCarriers, [roles.foreground.hex], "the red family must be carried by the foreground and nothing else")
	assert.deepEqual(greenCarriers, [roles.accent.hex], "the green family must be carried by the accent and nothing else")
	const carriedFamilies = census.families.filter((family) => carriedBy(family).length > 0)
	assert.equal(carriedFamilies.length, 2, "both families must be carried across the four roles — D9's whole claim")
	assert.equal(familyOf(census, roles.accent.rgb)?.rank, greenFamily.rank, "the accent is itself a green-family member")
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
			`  (baseline accent ${result.baseline.roles.accent.hex}; red carried by ${redCarriers}, green by ${greenCarriers})`,
	)
})

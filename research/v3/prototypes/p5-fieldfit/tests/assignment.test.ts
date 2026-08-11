/**
 * Self-tests for the joint four-role assignment — SPEC decision 18, round-3 ruling R5.
 *
 * Three kinds of test, in this order:
 *
 *  1. **The identity set**, on constructed inventories with a known right answer, including the two
 *     properties the report leans on: salient mass is the pixel count, and the ranking is by mass.
 *  2. **The solve**, on constructed shortlists — enumeration checked against an independent brute
 *     force over randomized fixtures, then the ordering pinned one level at a time (feasibility beats
 *     coverage, coverage beats the per-role preference, ties end at the packed int).
 *  3. **The anchors**, on real covers, which is where the whole change is either load-bearing or not.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/assignment.test.ts
 * (from `research/v3`).
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import test from "node:test"

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../src/contract/color.ts"
import type { OkLab, PaletteColor, Rgb8 } from "../../../src/contract/types.ts"
import { analyzeImage } from "../candidate.ts"
import {
	ACCENT_TIEBREAK,
	agglomerateBarNeighbourhoods,
	coveredFamilies,
	familyCovers,
	IDENTITY_FAMILY_BAR_MULTIPLE,
	IDENTITY_FAMILY_COUNT,
	IDENTITY_MASS_FLOOR_FRACTION,
	readIdentitySet,
	ROLE_SHORTLIST_SIZE,
	solveAssignment,
} from "../src/assignment.ts"
import type { AssignmentOption, IdentitySet, RoleCandidate } from "../src/assignment.ts"
import { packRgb, unpackRgb } from "../src/decode.ts"
import { decodeAndInventory } from "../src/decode.ts"
import {
	COHERENCE_GATE_BAR_MULTIPLE,
	coherenceSpectrum,
	MARK_IDENTITY_COHERENCE_FRACTION,
} from "../src/marks.ts"
import type { Inventory, OverlayCluster, TripleStats } from "../src/types.ts"

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..")

/** The stated defaults, asserted so a silent env override can never make a green run meaningless. */
test("the solve runs at its stated, unoverridden constants", () => {
	assert.equal(ROLE_SHORTLIST_SIZE, 5, "K")
	assert.equal(IDENTITY_FAMILY_COUNT, 4, "F = the role count")
	assert.equal(IDENTITY_FAMILY_BAR_MULTIPLE, 1, "decision 18 says bar-neighbourhood")
	assert.equal(IDENTITY_MASS_FLOOR_FRACTION, 1e-4)
})

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

function inventoryOf(entries: readonly (readonly [Rgb8, number])[]): Inventory {
	const triples = new Map<number, TripleStats>()
	let totalPixels = 0
	for (const [rgb, count] of entries) {
		const packed = packRgb(rgb)
		triples.set(packed, { packed, rgb, lab: rgbToOkLab(rgb), count, sumX: 0, sumY: 0 })
		totalPixels += count
	}
	return { triples, has: (packed) => triples.has(packed), totalPixels }
}

/** A cluster carrying only what the solve reads: its representative and its mass. */
function clusterOf(rgb: Rgb8, mass: number): OverlayCluster {
	const lab = rgbToOkLab(rgb)
	return {
		representative: packRgb(rgb),
		lab,
		overlayMass: mass,
		meanX: 0,
		meanY: 0,
		localField: [0.5, 0, 0],
		deltaL: 0,
		deltaC: 0,
		deltaH: 0,
		memberCount: 1,
	}
}

function candidateOf(
	rgb: Rgb8,
	mass: number,
	legibility = 50,
	source: RoleCandidate["source"] = "overlay",
	foregroundClass: RoleCandidate["foregroundClass"] = source === "component" ? "B" : "A",
): RoleCandidate {
	const color: PaletteColor = colorFromRgb(rgb)
	const lab = rgbToOkLab(rgb)
	return {
		cluster: clusterOf(rgb, mass),
		color,
		lab,
		mass,
		// v0.9.0's accent term reads this, and it is measured from the colour rather than passed in so
		// a fixture cannot claim a chroma its colour does not have.
		chroma: Math.hypot(lab[1], lab[2]),
		legibility,
		source,
		foregroundClass,
	}
}

/** An identity set built straight from colours, bypassing agglomeration, for ordering tests. */
function identityOf(entries: readonly (readonly [Rgb8, number])[]): IdentitySet {
	return {
		families: entries.map(([rgb, massFraction], index) => ({
			rank: index + 1,
			representative: packRgb(rgb),
			centre: rgbToOkLab(rgb),
			mass: massFraction,
			massFraction,
			memberCount: 1,
		})),
		totalFamilies: entries.length,
		massRetained: 1,
	}
}

const NEVER_TWINS = () => false

/** The shared shape: one accent shortlist for every foreground, minus the foreground itself. */
function sharedShortlist(accents: readonly RoleCandidate[]) {
	return (fg: RoleCandidate) => accents.filter((candidate) => candidate.cluster !== fg.cluster)
}

// ---------------------------------------------------------------------------------------------
// 1. The identity set
// ---------------------------------------------------------------------------------------------

/**
 * Decision 18 defines salient mass as *overlay mass for marks + field mass for field colours*, which
 * for one triple is `Σ(1 − w) + Σ w` = the pixel count. The consequence is the one the report states:
 * the identity set is a property of the **inventory** and of nothing else, so it does not move when
 * the fit's figure/ground split moves. This test is that claim: two inventories with identical counts
 * produce identical families, and the family masses are the counts.
 */
test("identity families rank by pixel mass and read off the inventory alone", () => {
	const identity = readIdentitySet(inventoryOf([
		[[0xfa, 0xd1, 0x07], 3600], // yellow, the ground
		[[0xfe, 0x00, 0x00], 1000], // red
		[[0xf9, 0xfb, 0xf8], 400], //  white
		[[0x00, 0x00, 0x00], 40], //   black, above the 1e-4 floor
	]))

	assert.equal(identity.totalFamilies, 4)
	assert.equal(identity.massRetained, 1)
	assert.deepEqual(
		identity.families.map((family) => colorFromRgb(unpackRgb(family.representative)).hex),
		["#fad107", "#fe0000", "#f9fbf8", "#000000"],
	)
	assert.deepEqual(identity.families.map((family) => family.mass), [3600, 1000, 400, 40])
	assert.equal(identity.families[0]!.massFraction, 3600 / 5040)
})

test("the identity set is the top F families, however many there are", () => {
	const entries: (readonly [Rgb8, number])[] = []
	// Ten colours spread far enough apart in hue that no pair can merge, descending in mass.
	for (let index = 0; index < 10; index++) {
		entries.push([[(index * 25) & 0xff, (255 - index * 25) & 0xff, (index * 60) & 0xff], 1000 - index * 10])
	}
	const identity = readIdentitySet(inventoryOf(entries))
	assert.equal(identity.families.length, IDENTITY_FAMILY_COUNT)
	assert.ok(identity.totalFamilies >= identity.families.length)
	// Descending mass, and the slice is a prefix of that order.
	for (let index = 1; index < identity.families.length; index++) {
		assert.ok(identity.families[index - 1]!.mass >= identity.families[index]!.mass)
		assert.equal(identity.families[index]!.rank, index + 1)
	}
})

/**
 * The mass floor is a cost bound, and this pins the property the doc claims for it: it can thin a
 * family but it cannot promote one over another, because it drops the same tail from every family.
 */
test("the negligible-mass floor drops sub-floor triples and reports the retained mass", () => {
	const entries: (readonly [Rgb8, number])[] = [[[0xfa, 0xd1, 0x07], 999_000]]
	for (let index = 0; index < 50; index++) {
		entries.push([[index * 5, 10, 200], 20]) // 20 / 1_000_000 = 2e-5, under 1e-4
	}
	const identity = readIdentitySet(inventoryOf(entries))
	assert.equal(identity.totalFamilies, 1)
	assert.ok(identity.massRetained < 1 && identity.massRetained > 0.99)
})

test("a role covers a family when it sits inside the family's bar-neighbourhood", () => {
	const identity = readIdentitySet(inventoryOf([
		[[0xfa, 0xd1, 0x07], 1000],
		[[0xfe, 0x00, 0x00], 500],
	]))
	const yellow = identity.families[0]!
	const red = identity.families[1]!

	// Its own representative always covers it.
	assert.ok(familyCovers(yellow, rgbToOkLab(unpackRgb(yellow.representative))))
	// A different family's colour does not.
	assert.ok(!familyCovers(yellow, rgbToOkLab(unpackRgb(red.representative))))
	// Sub-bar off the centre still covers; the predicate is the agglomeration predicate.
	const near: OkLab = [yellow.centre[0] + 1e-4, yellow.centre[1], yellow.centre[2]]
	assert.ok(
		okLabDistance(near, yellow.centre) <
			sameColorBar(colorFromRgb(unpackRgb(yellow.representative)), colorFromRgb([0xfa, 0xd1, 0x07])),
	)
	assert.ok(familyCovers(yellow, near))

	assert.deepEqual(coveredFamilies(identity, [rgbToOkLab([0xfa, 0xd1, 0x07])]), [1])
	assert.deepEqual(
		coveredFamilies(identity, [rgbToOkLab([0xfa, 0xd1, 0x07]), rgbToOkLab([0xfe, 0x00, 0x00])]),
		[1, 2],
	)
	assert.deepEqual(coveredFamilies(identity, [rgbToOkLab([0x00, 0x80, 0x00])]), [])
})

/**
 * **The measurement the report is built on, pinned as a test.** One visual black shatters into many
 * bar-neighbourhood families, because the same-colour bar near black is far tighter than a viewer is
 * (SPEC decision 14's own recorded finding, ratios 1.8–6.6, three reviewer-named pairs). Sixteen
 * near-blacks one LSB apart in lightness do **not** agglomerate into one family at the bar, and do at
 * the twin radius. This is why decision 18's coverage criterion is nearly inert on the 27-cover set.
 */
test("near black the bar under-merges: one visual colour becomes many families", () => {
	const entries: (readonly [Rgb8, number])[] = []
	for (let index = 0; index < 16; index++) entries.push([[index, index, index], 1000])
	const points = [...inventoryOf(entries).triples.values()].map((triple) => ({
		packed: triple.packed,
		lab: triple.lab,
		mass: triple.count,
		sumX: 0,
		sumY: 0,
	}))
	const atBar = agglomerateBarNeighbourhoods(points, 1)
	const atTwinRadius = agglomerateBarNeighbourhoods(points, 8)
	assert.ok(atBar.length > 1, `one visual black split into ${atBar.length} families at the bar`)
	assert.ok(
		atTwinRadius.length < atBar.length,
		`the twin radius merges them: ${atBar.length} -> ${atTwinRadius.length}`,
	)
})

// ---------------------------------------------------------------------------------------------
// 2. The solve
// ---------------------------------------------------------------------------------------------

/** An independent re-implementation, deliberately written as slowly and literally as possible. */
function bruteForce(
	foreground: readonly RoleCandidate[],
	accentFor: (fg: RoleCandidate) => readonly RoleCandidate[],
	identity: IdentitySet,
	fieldLabs: readonly OkLab[],
	twinExcluded: (accent: RoleCandidate, fg: RoleCandidate) => boolean,
): AssignmentOption | null {
	const options: AssignmentOption[] = []
	for (const fg of foreground) {
		for (const accent of [...accentFor(fg), null]) {
			if (accent !== null && accent.cluster === fg.cluster) continue
			if (accent !== null && twinExcluded(accent, fg)) continue
			const labs = [...fieldLabs, fg.lab, ...(accent === null ? [] : [accent.lab])]
			const covered = coveredFamilies(identity, labs)
			options.push({ foreground: fg, accent, coverage: covered.length, covered })
		}
	}
	// Sort by the decision-18 tuple, written out longhand.
	options.sort((first, second) =>
		second.coverage - first.coverage ||
		(first.foreground.foregroundClass === "A" ? 0 : 1) -
			(second.foreground.foregroundClass === "A" ? 0 : 1) ||
		second.foreground.mass - first.foreground.mass ||
		second.foreground.legibility - first.foreground.legibility ||
		// v0.9.0's accent term, written out longhand in the order `ACCENT_TIEBREAK` selects: chroma
		// first, then decision 8's mass beneath it. `null` (the collapse) loses both, as it always did.
		(ACCENT_TIEBREAK === "chroma"
			? (second.accent === null ? -1 : second.accent.chroma) -
				(first.accent === null ? -1 : first.accent.chroma)
			: 0) ||
		(second.accent === null ? -1 : second.accent.mass) -
			(first.accent === null ? -1 : first.accent.mass) ||
		first.foreground.cluster.representative - second.foreground.cluster.representative ||
		(first.accent === null ? Number.MAX_SAFE_INTEGER : first.accent.cluster.representative) -
			(second.accent === null ? Number.MAX_SAFE_INTEGER : second.accent.cluster.representative)
	)
	return options[0] ?? null
}

/** A tiny deterministic PRNG, so a failure is reproducible from the seed printed in the message. */
function lcg(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x1_0000_0000
	}
}

test("enumeration: the solve agrees with brute force on 200 randomized fixtures", () => {
	for (let seed = 1; seed <= 200; seed++) {
		const random = lcg(seed)
		const colorAt = (): Rgb8 => [
			Math.floor(random() * 256),
			Math.floor(random() * 256),
			Math.floor(random() * 256),
		]
		// Classes are randomized too, so the class term is exercised rather than constant: a fixture
		// whose candidates are all class A cannot tell the two comparators apart.
		const foreground = Array.from(
			{ length: 1 + Math.floor(random() * ROLE_SHORTLIST_SIZE) },
			() =>
				random() < 0.5
					? candidateOf(colorAt(), random() * 1000, random() * 100)
					: candidateOf(colorAt(), random() * 10_000, random() * 100, "component"),
		)
		const accents = Array.from(
			{ length: Math.floor(random() * (ROLE_SHORTLIST_SIZE + 1)) },
			() =>
				random() < 0.5
					? candidateOf(colorAt(), random() * 1000, random() * 100)
					: candidateOf(colorAt(), random() * 10_000, random() * 100, "component"),
		)
		const identity = identityOf(
			Array.from({ length: IDENTITY_FAMILY_COUNT }, () => [colorAt(), random()] as const),
		)
		const fieldLabs = [rgbToOkLab(colorAt()), rgbToOkLab(colorAt())]
		// A twin rule with real bite, so the pairwise constraint is exercised rather than trivially true.
		const twinExcluded = (accent: RoleCandidate, fg: RoleCandidate) =>
			okLabDistance(accent.lab, fg.lab) < 0.25

		const accentFor = sharedShortlist(accents)
		const trace = solveAssignment({ foreground, accentFor, identity, fieldLabs, twinExcluded })
		const expected = bruteForce(foreground, accentFor, identity, fieldLabs, twinExcluded)

		assert.ok(trace.chosen !== null, `seed ${seed}: the collapse option is always feasible`)
		assert.equal(
			trace.chosen.foreground.color.hex,
			expected!.foreground.color.hex,
			`seed ${seed}: foreground`,
		)
		assert.equal(
			trace.chosen.accent?.color.hex ?? null,
			expected!.accent?.color.hex ?? null,
			`seed ${seed}: accent`,
		)
		assert.equal(trace.chosen.coverage, expected!.coverage, `seed ${seed}: coverage`)
	}
})

test("the search space is K × (K + 1) and nothing larger", () => {
	const foreground = Array.from(
		{ length: ROLE_SHORTLIST_SIZE },
		(_, index) => candidateOf([10 + index, 200, 30], 100 - index),
	)
	const accents = Array.from(
		{ length: ROLE_SHORTLIST_SIZE },
		(_, index) => candidateOf([200, 10 + index, 30], 100 - index),
	)
	const trace = solveAssignment({
		foreground,
		accentFor: sharedShortlist(accents),
		identity: identityOf([[[0, 0, 0], 1]]),
		fieldLabs: [rgbToOkLab([255, 255, 255])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(trace.enumerated, ROLE_SHORTLIST_SIZE * (ROLE_SHORTLIST_SIZE + 1))
	assert.ok(trace.enumerated <= 10_000, "the cost note's ceiling, asserted rather than assumed")
})

/**
 * **Level 2 beats level 3.** The heavier foreground covers nothing; the lighter one covers a family
 * the field does not. Under v0.7.1's rule the heavy one wins on mass; under decision 18 coverage
 * outranks mass and the light one wins. `perRoleOnly` records what the old rule would have said, which
 * is what makes `coverageDecided` readable on a real cover.
 */
test("lexicographic: coverage beats the per-role preference", () => {
	const heavyOffSet = candidateOf([0x7f, 0x7f, 0x7f], 1000)
	const lightOnSet = candidateOf([0xfe, 0x00, 0x00], 10)
	const identity = identityOf([[[0xfa, 0xd1, 0x07], 0.4], [[0xfe, 0x00, 0x00], 0.1]])

	const trace = solveAssignment({
		foreground: [heavyOffSet, lightOnSet],
		accentFor: () => [],
		identity,
		fieldLabs: [rgbToOkLab([0xfa, 0xd1, 0x07])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(trace.chosen?.foreground.color.hex, "#fe0000")
	assert.equal(trace.chosen?.coverage, 2)
	assert.equal(trace.perRoleOnly?.foreground.color.hex, "#7f7f7f")
	assert.equal(trace.coverageDecided, true)
})

/**
 * **Level 1 beats level 2**, which is the property that must never bend: an infeasible assignment is
 * not ranked, however much coverage it would have bought. Here the only coverage-improving accent is
 * the foreground's twin, so the accent collapses and coverage *falls* rather than the twin being
 * published.
 */
test("lexicographic: feasibility beats coverage", () => {
	const foreground = candidateOf([0x00, 0x00, 0x00], 1000)
	const twin = candidateOf([0x00, 0x03, 0x00], 900)
	const identity = identityOf([
		[[0xfa, 0xd1, 0x07], 0.4],
		[[0x00, 0x03, 0x00], 0.1], // only the twin reaches this family
	])
	const always = () => true

	const feasible = solveAssignment({
		foreground: [foreground],
		accentFor: sharedShortlist([twin]),
		identity,
		fieldLabs: [rgbToOkLab([0xfa, 0xd1, 0x07])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(feasible.chosen?.accent?.color.hex, "#000300", "with no twin rule the twin is taken")
	assert.equal(feasible.chosen?.coverage, 2)

	const excluded = solveAssignment({
		foreground: [foreground],
		accentFor: sharedShortlist([twin]),
		identity,
		fieldLabs: [rgbToOkLab([0xfa, 0xd1, 0x07])],
		twinExcluded: always,
	})
	assert.equal(excluded.chosen?.accent, null, "the twin is infeasible, so the accent collapses")
	assert.equal(excluded.chosen?.coverage, 1, "coverage falls; feasibility is not traded for it")
})

/** The collapse option exists at every foreground, and never wins against a real accent. */
test("the accent collapse is available but never preferred at equal foreground", () => {
	const foreground = candidateOf([0x00, 0x00, 0x00], 1000)
	const accent = candidateOf([0xfe, 0x00, 0x00], 5)
	const trace = solveAssignment({
		foreground: [foreground],
		accentFor: sharedShortlist([accent]),
		// No family either role can reach, so coverage ties at 0 and only the tie-breaks speak.
		identity: identityOf([[[0x00, 0x80, 0x00], 0.4]]),
		fieldLabs: [rgbToOkLab([0x00, 0x80, 0x00])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(trace.chosen?.coverage, 1)
	assert.equal(trace.chosen?.accent?.color.hex, "#fe0000")
})

/**
 * v0.7.1's terminal clause, preserved: a foreground with no admissible partner keeps its slot rather
 * than yielding it to a lighter foreground that happens to have one. Only coverage may move it, and
 * here there is no coverage to be had.
 */
test("a heavier foreground with no accent still beats a lighter one that has one", () => {
	const heavy = candidateOf([0x00, 0x00, 0x00], 1000)
	const light = candidateOf([0x11, 0x11, 0x11], 10)
	const accent = candidateOf([0xfe, 0x00, 0x00], 500)
	const trace = solveAssignment({
		foreground: [heavy, light],
		// The accent is only offered to the lighter foreground.
		accentFor: (fg) => (fg.cluster === light.cluster ? [accent] : []),
		identity: identityOf([[[0x00, 0x80, 0x00], 0.4]]),
		fieldLabs: [rgbToOkLab([0x00, 0x80, 0x00])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(trace.chosen?.foreground.color.hex, "#000000")
	assert.equal(trace.chosen?.accent, null)
})

/**
 * **The scale-mixing ruling, as the one comparison it exists to fix.** A ground-shaped region that
 * outweighs the ink by an order of magnitude still loses the foreground, because the class term sits
 * above mass — and it loses it *without being excluded*: it is enumerated, it is feasible, and it
 * takes the accent, whose ranking the ruling deliberately leaves on mass over the full union.
 *
 * This is `908479200b` in miniature (region 24 591 against ink 2 432) and `2376a6b67d` in miniature
 * (11 694 against 1 424), which are the two covers the ruling names.
 */
test("class ordering: a class-B region outmassing the ink 10× still loses the foreground", () => {
	const ink = candidateOf([0x00, 0x00, 0x00], 1000, 80)
	const region = candidateOf([0xfe, 0x00, 0x00], 10_000, 60, "component")
	assert.equal(region.foregroundClass, "B")
	// No coverage anywhere, so nothing above the per-role tie-breaks can be doing the work.
	const identity = identityOf([[[0x00, 0x80, 0x00], 0.4]])
	const fieldLabs = [rgbToOkLab([0x00, 0x80, 0x00])]

	for (const order of [[ink, region], [region, ink]]) {
		const trace = solveAssignment({
			foreground: order,
			accentFor: sharedShortlist(order),
			identity,
			fieldLabs,
			twinExcluded: NEVER_TWINS,
		})
		assert.equal(trace.chosen?.foreground.color.hex, "#000000", "the ink takes the foreground")
		assert.equal(trace.chosen?.accent?.color.hex, "#fe0000", "the region takes the accent, on mass")
		assert.equal(trace.classOverriddenByCoverage, false)
		// The region was ranked, not filtered: it is in the enumeration and it is feasible.
		assert.equal(trace.enumerated, 2 * 2)
		assert.equal(trace.feasible, 4)
	}
})

/**
 * **The other half of "an ordering, not an exclusion".** With no class-A candidate clearing the
 * floors — the shortlist `overlay.ts` hands over holds only the region — the class-B candidate takes
 * the foreground, which is round-3 item 6's shape and the outcome the deleted `P5_COMPONENT_ROLES`
 * knob could not produce.
 */
test("class ordering: with no class-A survivor the region takes the foreground", () => {
	const region = candidateOf([0xfe, 0x00, 0x00], 10_000, 60, "component")
	const trace = solveAssignment({
		foreground: [region],
		accentFor: () => [],
		identity: identityOf([[[0x00, 0x80, 0x00], 0.4]]),
		fieldLabs: [rgbToOkLab([0x00, 0x80, 0x00])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(trace.chosen?.foreground.color.hex, "#fe0000")
	assert.equal(trace.chosen?.foreground.foregroundClass, "B")
	// Nothing was overridden: there was no class-A assignment to override.
	assert.equal(trace.classOverriddenByCoverage, false)
})

/**
 * **Where the class term sits, pinned as the behaviour it produces.** Coverage is above it (decision
 * 18's lexicography; the ruling redefines the *foreground ordering*, and coverage outranks the
 * per-role orderings), so a class-B foreground that reaches a family no class-A candidate reaches
 * wins — and `classOverriddenByCoverage` is what makes that visible instead of silent. `28279e9184`
 * is the one cover in the 27 where this fires; if the ordering is ever ruled the other way, this test
 * is the one that has to change.
 */
test("class ordering: coverage still outranks the class, and says so in the trace", () => {
	const ink = candidateOf([0x00, 0x00, 0x00], 1000, 80)
	const region = candidateOf([0xfe, 0x00, 0x00], 10, 60, "component")
	const identity = identityOf([[[0xfa, 0xd1, 0x07], 0.4], [[0xfe, 0x00, 0x00], 0.1]])

	const trace = solveAssignment({
		foreground: [ink, region],
		accentFor: () => [],
		identity,
		fieldLabs: [rgbToOkLab([0xfa, 0xd1, 0x07])],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(trace.chosen?.foreground.color.hex, "#fe0000", "the lighter class-B wins on coverage")
	assert.equal(trace.chosen?.coverage, 2)
	assert.equal(trace.perRoleOnly?.foreground.color.hex, "#000000", "the class term's own winner")
	assert.equal(trace.coverageDecided, true)
	assert.equal(trace.classOverriddenByCoverage, true)
})

test("determinism: every tie ends at the packed int", () => {
	// Identical mass, identical legibility, identical (zero) coverage: only the packed int is left.
	const low = candidateOf([0x00, 0x00, 0x10], 100, 40)
	const high = candidateOf([0x10, 0x00, 0x00], 100, 40)
	assert.ok(low.cluster.representative < high.cluster.representative)

	const identity = identityOf([[[0x00, 0x80, 0x00], 0.4]])
	const fieldLabs = [rgbToOkLab([0x00, 0x80, 0x00])]
	for (const order of [[low, high], [high, low]]) {
		const trace = solveAssignment({
			foreground: order,
			accentFor: () => [],
			identity,
			fieldLabs,
			twinExcluded: NEVER_TWINS,
		})
		assert.equal(trace.chosen?.foreground.color.hex, low.color.hex)
	}

	// Same on the accent side, at an equal foreground.
	const foreground = candidateOf([0xff, 0xff, 0xff], 900, 90)
	for (const order of [[low, high], [high, low]]) {
		const trace = solveAssignment({
			foreground: [foreground],
			accentFor: sharedShortlist(order),
			identity,
			fieldLabs,
			twinExcluded: NEVER_TWINS,
		})
		assert.equal(trace.chosen?.accent?.color.hex, low.color.hex)
	}
})

// ---------------------------------------------------------------------------------------------
// 2b. The accent tie-break (v0.9.0)
// ---------------------------------------------------------------------------------------------

/**
 * **`ACCENT_TIEBREAK`, as an ordering rather than as a cover.**
 *
 * The rule ships as `"chroma"` because a 31-cover sweep scored it against every reviewer-graded
 * accent verdict and it won 4–0 (`reports/wv9b.md`); what this test pins is where the term *sits*.
 * Three positions, and all three matter:
 *
 *  - it leads salient mass, which is decision 8's term and is now beneath it;
 *  - it sits below **coverage**, so decision 18's lexicographic order is unchanged;
 *  - it sits below every **foreground** term, so it cannot move a foreground.
 *
 * Run against `solveAssignment` rather than the comparator directly, because the comparator is
 * private and the ordering that ships is the one the solve applies.
 */
test("accent tie-break: chroma leads mass, and sits below both coverage and the foreground", () => {
	assert.equal(ACCENT_TIEBREAK, "chroma", "the measured winner is what ships")

	const fg = candidateOf([0x00, 0x00, 0x00], 1000)
	const dullHeavy = candidateOf([0x5a, 0x5a, 0x5a], 900)
	const vividLight = candidateOf([0xff, 0x00, 0x00], 10)
	assert.ok(dullHeavy.mass > 50 * vividLight.mass, "the fixture must make mass and chroma disagree")
	assert.ok(vividLight.chroma > dullHeavy.chroma)

	// (a) with nothing to cover, chroma decides and the 90×-heavier neutral loses.
	const noFamilies = identityOf([])
	const byChroma = solveAssignment({
		foreground: [fg],
		accentFor: sharedShortlist([dullHeavy, vividLight]),
		identity: noFamilies,
		fieldLabs: [],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(byChroma.chosen?.accent?.color.hex, vividLight.color.hex)

	// (b) coverage is above it: give the neutral a family to reach and it wins despite both readings.
	const greyFamily = identityOf([[[0x5a, 0x5a, 0x5a], 0.5]])
	const byCoverage = solveAssignment({
		foreground: [fg],
		accentFor: sharedShortlist([dullHeavy, vividLight]),
		identity: greyFamily,
		fieldLabs: [],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(byCoverage.chosen?.accent?.color.hex, dullHeavy.color.hex)
	assert.equal(byCoverage.coverageDecided, true)

	// (c) the foreground is decided before the accent term is ever consulted: the heavier foreground
	// wins even though pairing the lighter one would give the more chromatic accent.
	const heavyFg = candidateOf([0x00, 0x00, 0x00], 5000)
	const lightFg = candidateOf([0x01, 0x01, 0x01], 10)
	const dullOnly = candidateOf([0x60, 0x60, 0x60], 5)
	const perForeground = (candidate: RoleCandidate) =>
		candidate.cluster === heavyFg.cluster ? [dullOnly] : [vividLight]
	const fgFirst = solveAssignment({
		foreground: [heavyFg, lightFg],
		accentFor: perForeground,
		identity: noFamilies,
		fieldLabs: [],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(fgFirst.chosen?.foreground.color.hex, heavyFg.color.hex)
	assert.equal(fgFirst.chosen?.accent?.color.hex, dullOnly.color.hex)

	// (d) equal chroma falls through to mass — decision 8, intact underneath.
	const twinA = candidateOf([0xff, 0x00, 0x00], 500)
	const twinB = candidateOf([0xff, 0x00, 0x00], 400)
	assert.equal(twinA.chroma, twinB.chroma)
	const byMass = solveAssignment({
		foreground: [fg],
		accentFor: sharedShortlist([twinB, twinA]),
		identity: noFamilies,
		fieldLabs: [],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(byMass.chosen?.accent?.mass, 500, "the heavier of two equally chromatic accents")

	// (e) the collapse still sorts below every real accent, on both readings.
	const collapsed = solveAssignment({
		foreground: [fg],
		accentFor: () => [],
		identity: noFamilies,
		fieldLabs: [],
		twinExcluded: NEVER_TWINS,
	})
	assert.equal(collapsed.chosen?.accent, null)
})

// ---------------------------------------------------------------------------------------------
// 3. The anchors
// ---------------------------------------------------------------------------------------------

async function cover(shard: string, name: string): Promise<string> {
	const path = resolve(REPO_ROOT, shard, name)
	// The corpus files carry no extension except on the demo shards; both spellings are tried so a
	// rename is a clear failure rather than a silent skip.
	for (const candidate of [path, `${path}.jpg`]) {
		try {
			await readFile(candidate)
			return isAbsolute(candidate) ? candidate : resolve(candidate)
		} catch {
			continue
		}
	}
	throw new Error(`anchor cover missing: ${shard}/${name}`)
}

/**
 * **Anchor (a) — round-3 item 3, `2376a6b67d`.** The reviewer's verbatim ask, reached.
 *
 * v0.8.0 measured that no assignment could reach the artwork's red: it is carried by a field-like
 * **component** (support 0.138), so its rejected mass was ~34 against the black's ~1424 and it was
 * `sameColor` with its own local field — *"infeasible as an ink candidate at any K"* (`wp14.md` §2a).
 * v0.8.1's union puts the component in the pool with its **field** mass (11 694) and judges it against
 * the published colours, and the red carries a role: the palette is yellow / white / red / black, the
 * reviewer's four-colour set, and the near-black fg-twin `#000300` is gone.
 *
 * **Which** role was v0.8.1's open question, and v0.8.2's class ordering answers it. Both
 * `fg = red / accent = black` and `fg = black / accent = red` are feasible and both reach coverage 3,
 * so coverage cannot separate them (`coverageDecided` is false); v0.8.1 broke the tie on mass and the
 * red's field mass (11 694) outweighs the black's rejected mass (1 424) by 8×, which is the scale
 * mixing `reports/wp15.md` reported. The class term now leads the foreground ordering: the black ink
 * is class A, the red region is class B (its component-level ink statistics are mortality 0.671,
 * adjacency 0.159 — it fails the mortality conjunct and is a ground), so the black takes the
 * foreground and the red takes the accent. That is round 3's ask, word for word.
 */
test("anchor: item 3 publishes fg black / accent red — round 3's verbatim ask", async () => {
	const { palette, assignment, componentCandidates } = await analyzeImage(
		await cover("00", "ab67616d00001e020000269ead63cf2376a6b67d"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#fad107", "#f9fbf8", "#000000", "#f81107"],
		"was #fad107/#f9fbf8/#000000/#000300 in v0.8.0 and .../#f81107/#000000 in v0.8.1",
	)
	assert.ok(assignment !== null)
	const families = assignment.identity.families.map((family) =>
		colorFromRgb(unpackRgb(family.representative)).hex
	)
	// **The family definition has now moved twice under this palette and the palette has not moved
	// once**, which is the anchor here — a reviewer-STRONG set (round-4 item 1, silent) surviving a
	// change to the very thing it is scored against.
	//
	// v0.9.0 re-ranked the families: yellow `#fad107` (.437) / a dark-olive mark `#26210b` (.228) /
	// white `#f9fbf8` (.146) / red `#f81107` (.130), because the v2 side saw a 20 556-mass olive mark
	// the triple-wise reading never had and it entered at rank 2. **v0.9.2's gate withholds exactly
	// that olive** — 22.8% of the frame at .0865 self-coherence — so the set is yellow (.437) / white
	// (.146) / red (.130) / `#ffda00` (.016) and white and red move up one rank each. `massRetained`
	// falls to .715 with it, as it must.
	//
	// That the withheld colour is the one round 2 rejected here by name (*"doesn't feel like a part of
	// this artwork"*) is a corroboration and not a mechanism: chroma-first already kept the olive out
	// of the *accent*, and the gate is what now keeps it out of the *identity set* as well. Two
	// independent rules, one colour, same verdict.
	assert.ok(
		families.some((hex) => hex === "#f81107"),
		`the red is still in the identity set: ${families}`,
	)
	assert.ok(!families.some((hex) => hex === "#26210b"), `the olive is withheld: ${families}`)
	assert.deepEqual(assignment.fieldCovered, [1, 2], "yellow and white come from the field roles")
	assert.deepEqual(assignment.chosen?.covered, [1, 2, 3], "an ink role still reaches the red's family")
	// The olive is the heaviest accent candidate on the cover and it does **not** publish: this is the
	// exact colour round 2 rejected here (*"doesn't feel like a part of this artwork"*), and the
	// chroma-first tie-break is what keeps it out — .0367 against the red's .2489, against a 2×
	// advantage in mass. Mass-first publishes `#26210b` on this cover and breaks the STRONG; the sweep
	// that measured it is `measurements/v9b-accent-sweep.ts`.
	assert.equal(assignment.accentShortlist[0]!.color.hex, "#26210b")
	assert.ok(assignment.accentShortlist[0]!.mass > assignment.accentShortlist[1]!.mass)
	assert.ok(assignment.accentShortlist[0]!.chroma < assignment.accentShortlist[1]!.chroma)

	// The route: one unslotted component, admitted, superseding the two rejected-mass crumbs of its own
	// family — which are the entries v0.8.0 had and could not publish.
	assert.equal(componentCandidates.length, 1)
	const red = componentCandidates[0]!
	assert.equal(red.admitted, true)
	assert.equal(red.feasible, true)
	assert.equal(red.published, "#f81107")
	assert.deepEqual(red.supersedes.map((entry) => entry.hex), ["#f20000", "#fe0000"])
	assert.ok(red.supportMass > 10_000, `field mass ${red.supportMass}, was ~34 as rejected mass`)
	// The classification, as the two numbers it is made of: a ground, not an ink (wp12's conjunction).
	assert.equal(red.foregroundClass, "B")
	assert.ok(red.erosionMortality! < 0.85, `mortality ${red.erosionMortality}`)

	// The tie-break, stated as a measurement. The red still outweighs every ink by 8×, and still loses
	// the foreground: the class term is above mass, so the whole shortlist is class A and the red is not
	// in it at all. Coverage did not decide this palette — the class ordering did.
	assert.equal(assignment.foregroundShortlist[0]!.color.hex, "#000000")
	assert.ok(
		assignment.foregroundShortlist.every((candidate) => candidate.foregroundClass === "A"),
		"class A fills the shortlist; the heavier class-B region sorts below all of it",
	)
	// v0.9.0: the mark is heavier still, so the component is the shortlist's **second** entry rather
	// than its first. The scale finding is unchanged and is asserted on the entry it was measured on.
	const redAccent = assignment.accentShortlist.find((candidate) => candidate.source === "component")!
	assert.equal(redAccent.color.hex, "#f81107")
	assert.ok(
		redAccent.mass > 8 * assignment.foregroundShortlist[0]!.mass,
		"11 694 of field mass against 1 424 of rejected mass — the scale finding, still true",
	)
	assert.equal(assignment.coverageDecided, false)
	assert.equal(assignment.classOverriddenByCoverage, false)
	assert.equal(assignment.perRoleOnly?.foreground.color.hex, "#000000")
})

/**
 * **The round-2/3 silent STRONGs, and v0.9.0's one accent regression among them.**
 *
 * `eaed77a9cb` is demo-20 and unreviewed; its accent moves and nothing is owed. **`a8942d6547` is
 * round-3 item 7, graded STRONG in silence**, and its accent moves too — `#009cff` → `#39367d`. It is
 * pinned here as a **regression**, in the same posture `908479200b` is pinned below, rather than
 * quietly re-baselined.
 *
 * The cause is measured and is *not* the accent tie-break: the vivid blue has the higher chroma
 * (.1807 against .1168) and would win that reading outright. **Coverage moved it**, and coverage
 * outranks every per-role term. The cover's residual is one contiguous illustration — its curve is
 * `N(0)=451, N(2)=5, N(3)=4, N(4)=2, N(6)=1`, so at *every* rung of the ladder one mark holds
 * ~328 000 of the 409 600 pixels — and that mark's median colour `#39367d` therefore enters the
 * unioned identity set at massFraction .80, as family 1. The accent that covers family 1 reaches
 * coverage 4; the blue reaches 3. So the union's own premise (spatially-accumulated mass sees
 * material the triple floor discards) is what displaced a reviewer-blessed colour here, on the one
 * class of cover where a region is not a colour but a whole picture — wv9a §b's *"a region is one
 * colour; a ramped or illustrated field is many"*, arriving as a published consequence.
 *
 * Nothing is patched around it: the v0.9 brief's byte-identity gate is over the **round-4** silent
 * STRONGs (all three hold), this is a round-3 one, and the ruling on whether an 80%-of-frame median
 * belongs in an identity set is the orchestrator's with this test as its evidence.
 *
 * **v0.9.1 kept the pin and measured why; v0.9.2 pays it back.** The ruling that followed — withhold
 * an identity family from material whose own colour explains less than half of it — was implemented
 * as a measurement first, and its gate check failed at the family-merge radius the ruling named (the
 * NARCOSIS crimson, the colour the whole mechanism exists to reach, is .0589 self-coherent there and
 * would have been withheld beside this cover's .0009). The radius became the gate's own constant with
 * its own measured window, and at `COHERENCE_GATE_BAR_MULTIPLE` the 328 009-pixel mark reads .274 —
 * withheld — while the crimson reads .712 and survives.
 *
 * **So this is no longer a regression: the expectation below is the reviewer's silent STRONG, back
 * byte-identically** (all four roles equal v0.8.2's). It is left in the regression harness, with its
 * history intact, because the palette is the same object either way and the next change to the family
 * definition has to keep it.
 */
for (
	const [label, shard, name, expected, note] of [
		[
			"a8942d6547 (round-3 item 7, STRONG)",
			"12",
			"ab67616d0000b27300125577fb06a6a8942d6547",
			["#120032", "#0f002a", "#ffffff", "#009cff"],
			"RESTORED in v0.9.2: the reviewer's silent STRONG, byte-identical to v0.8.2",
		],
		[
			"eaed77a9cb (demo-20)",
			"00",
			"ab67616d00001e02000023e98b7381eaed77a9cb",
			["#222335", "#474b56", "#ffffff", "#61646d"],
			"unreviewed; was #0f0b0c in v0.8.2",
		],
	] as const
) {
	test(`anchor: ${label} is pinned under v0.9.0's pool and family union`, async () => {
		const { palette } = await analyzeImage(await cover(shard, name))
		assert.deepEqual(
			[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
			[...expected],
			note,
		)
	})
}

/**
 * The restoration above, as the measurement that explains it rather than as a hex string.
 *
 * **Coverage displaced this accent in v0.9.0 and coverage restores it in v0.9.2 — the ranking rule
 * never changed, what changed is what the identity set contains.** v0.9.0's set had the 328 009-pixel
 * blend median at rank 1 with massFraction .80, so the mark covered a family the blue could not reach
 * and won on coverage 4 against 3. The gate withholds that median (.274 at the gate's radius, against
 * the 0.5 fraction), the set becomes the field's own colours plus `#009cff` at rank 4, and now it is
 * the *blue* that reaches a family the mark misses — coverage 4 against 3, the same margin the other
 * way round.
 *
 * The mark is still the heaviest thing in the accent pool and still ranked first in the shortlist:
 * this is not a pool gate, and the test asserts that directly, because "the gate deleted the
 * candidate" is the wrong reading of the restoration and the easy one to reach for.
 */
test("a8942d6547: coverage displaced the STRONG's accent, and coverage restores it", async () => {
	const { assignment, marks } = await analyzeImage(
		await cover("12", "ab67616d0000b27300125577fb06a6a8942d6547"),
	)
	assert.ok(assignment !== null)
	const blend = assignment.accentShortlist.find((c) => c.color.hex === "#39367d")!
	const blue = assignment.accentShortlist.find((c) => c.color.hex === "#009cff")!
	// Not a pool gate: the withheld colour still leads the shortlist on mass, by 47×.
	assert.equal(assignment.accentShortlist[0]!.color.hex, "#39367d")
	assert.equal(blend.source, "mark")
	assert.ok(blend.mass > 40 * blue.mass, `${blend.mass} against ${blue.mass}`)
	assert.ok(blue.chroma > blend.chroma, `the restored blue is the more chromatic: ${blue.chroma} vs ${blend.chroma}`)
	// And coverage still outranks every per-role term — it is simply now pointing the other way.
	assert.equal(assignment.coverageDecided, true, "so the per-role terms did not decide this either")
	assert.equal(assignment.chosen?.accent?.color.hex, "#009cff")
	assert.equal(assignment.chosen?.coverage, 4)
	assert.equal(assignment.perRoleOnly?.coverage, 3)
	// The cause, at its root: one mark is most of the image at every rung the sweep offers, and it is
	// a colour none of that image is.
	const heaviest = marks.marks[0]!
	assert.equal(heaviest.kind, "mark")
	assert.ok(heaviest.massFraction > 0.75, `heaviest mark holds ${heaviest.massFraction} of the frame`)
	assert.equal(heaviest.identityCoherent, false)
	assert.ok(heaviest.selfCoherence < MARK_IDENTITY_COHERENCE_FRACTION)
	// So the family it used to define is gone: rank 1 is now the field's own background at .112, and
	// the retained mass falls to .32 — the set claims only what it can still stand behind.
	assert.ok(
		assignment.identity.families.every((family) => family.massFraction < 0.75),
		"no family may be four fifths of the frame any more",
	)
	assert.ok(assignment.identity.massRetained < 0.4)
})

/**
 * **Anchor (b) — `908479200b`, the sunset STRONG. The foreground comes back; the accent does not.**
 *
 * v0.8.1 lost both ink roles to components (a near-black region at field mass 24 591 and an orange at
 * 10 223, against the cream ink's rejected mass 2 432). v0.8.2's class ordering restores the
 * foreground exactly — the cream is class A, both regions are class B (mortality 0.281 and 0.612,
 * both under `COMPONENT_INK_MORTALITY`), so the cream leads the shortlist again and `#fed078` is
 * published, the STRONG colour a reviewer already blessed.
 *
 * **The accent still moves**, `#412824` → `#231f20`, and it moves through the rule the scale-mixing
 * ruling deliberately left alone: the accent ranks the full union by mass, and 24 591 beats 224 by
 * two orders of magnitude. So the cover is *not* byte-identical to v0.7.1 and this test says so
 * rather than re-baselining it: the accent half of the scale finding is unaddressed, and the ruling
 * on whether it should be is the orchestrator's (`reports/wp16.md`).
 */
test("anchor: 908479200b — the STRONG's foreground is restored, its accent is not", async () => {
	const { palette, componentCandidates, assignment } = await analyzeImage(
		await cover("00", "ab67616d00001e02000022e7e9d11c908479200b"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#7a545f", "#fd7b61", "#fed078", "#231f20"],
		"REGRESSION (accent only): the reviewer's STRONG was #7a545f/#fd7b61/#fed078/#412824",
	)
	// The field roles are untouched — decision 18 does not reach back into the field reading, and the
	// half of the STRONG palette the reviewer's note was about (the coral ramp) is intact.
	assert.equal(palette.roles.background.hex, "#7a545f")
	assert.equal(palette.roles.surface.hex, "#fd7b61")
	// Both regions are in the pool, both are feasible, both are class B, and neither is excluded — the
	// foreground is an ordering win, not a gate.
	assert.equal(componentCandidates.length, 2)
	assert.ok(componentCandidates.every((row) => row.admitted && row.feasible))
	assert.ok(componentCandidates.every((row) => row.foregroundClass === "B"))
	assert.ok(
		assignment!.foregroundShortlist.every((candidate) => candidate.foregroundClass === "A"),
		"the class-B regions sort below every class-A ink, so they are not in the fg shortlist",
	)
	assert.equal(assignment!.foregroundShortlist[0]!.color.hex, "#fed078")
	assert.equal(assignment!.classOverriddenByCoverage, false)
	// And the accent's own ranking, unchanged, is what moves it: mass over the full union.
	const accent = assignment!.accentShortlist[0]!
	assert.equal(accent.color.hex, "#231f20")
	assert.equal(accent.source, "component")
	assert.ok(
		accent.mass > 10 * assignment!.accentShortlist[1]!.mass,
		"the region outweighs the heaviest ink accent by an order of magnitude",
	)
})

/**
 * **Anchor (c) — `28279e9184`. The foreground does *not* come back, and the cause is not the class
 * ordering.** Pinned as a regression against v0.7.1's `#ffffff`, with the mechanism, because the
 * obvious reading of the delta ("a component took the foreground") is the wrong one.
 *
 * The cover's white *is* a component (support 0.144, field mass 11 795), and decision 18(a)'s dedupe
 * — choice 4, the component supersedes the overlay clusters of its own family — removed `#ffffff`
 * (rejected mass 175) and `#f6f6f6` (62) from the pool when it was admitted. So v0.7.1's foreground
 * is not merely out-ranked here, it is **not in the candidate pool at all**, and no ordering over the
 * pool can publish it. What the pool offers is exactly two admissible candidates: the class-A
 * `#eaeaea` at rejected mass 43, and the class-B component published as `#fafafa`.
 *
 * Between those two, **coverage decides** and it prefers the component (4 families against 2), which
 * is the one cover in the 27 where `classOverriddenByCoverage` fires — decision 18 puts coverage
 * above the per-role orderings, and the class term is a per-role ordering. Both facts are asserted,
 * because they are the two the ruling on this cover needs.
 */
test("anchor: 28279e9184 — the white is deduped out of the pool, and coverage outranks the class", async () => {
	const { palette, assignment, componentCandidates } = await analyzeImage(
		await cover("00", "ab67616d00001e020000099e97d17d28279e9184"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#cccecd", "#004164", "#fafafa", "#ff00a0"],
		"REGRESSION (foreground only): v0.7.1 published #ffffff",
	)
	assert.equal(componentCandidates.length, 1)
	const white = componentCandidates[0]!
	assert.equal(white.foregroundClass, "B")
	assert.deepEqual(
		white.supersedes.map((entry) => entry.hex),
		["#ffffff", "#f6f6f6"],
		"the dedupe, not the ordering: v0.7.1's foreground left the pool here",
	)
	// Two admissible candidates, one per class, and the class-B one is published.
	assert.deepEqual(
		assignment!.foregroundShortlist.map((candidate) => [candidate.color.hex, candidate.foregroundClass]),
		[["#eaeaea", "A"], ["#fafafa", "B"]],
	)
	assert.equal(assignment!.coverageDecided, true)
	assert.equal(assignment!.classOverriddenByCoverage, true, "the only cover in 27 where it fires")
	// v0.9.0: coverage falls 4 → 3 and the palette does not move. A 33 563-mass mark `#975968` enters
	// the unioned set at rank 1 and **no published role covers it**, so the identity set gained a
	// family the palette cannot reach rather than losing one it could. That is the honest reading of
	// this cover under the new definition, and it is the number the class-override ruling is scored
	// against — so it is recomputed here, not relaxed.
	assert.equal(assignment!.chosen?.coverage, 3)
	assert.equal(assignment!.perRoleOnly?.foreground.color.hex, "#eaeaea")
	assert.equal(assignment!.perRoleOnly?.coverage, 2)
})

/**
 * **Anchor (b) — round-3 item 6 / round-4 item 3, `9646be9b20`, the "many colors" complaint.**
 *
 * v0.8.x could not move this cover and the reason was structural: **the component pool is empty**.
 * Its only extensive component is the display type, which decision 15a's veto refuses as a field, so
 * the cover takes the declared retreat and there is no unslotted component to offer.
 *
 * **v0.9.0 moves it, and the mark pool is where the movement comes from** — the retreat leaves the
 * whole illustration unexplained, so it arrives as one region of spatial mass 320 540 and publishes
 * `#7f7ca7`. The accent goes `#000000` → `#7f7ca7`, which is directly responsive to round-4 item 3's
 * note (*"Black accent could work if all other color picks are very chromatic, but right now this is
 * not the case and so we're losing a lot of the artwork's identity"*).
 *
 * **It is not obviously an improvement and this test says so.** `#7f7ca7` is the median of a vivid
 * illustration — wv9a §b called exactly this reading *"the retreat's one region medians a vivid
 * illustration to mud"* — and at chroma .0648 it is barely more chromatic than the black it replaced.
 * The reviewer's complaint on this cover is *the artwork's colours are missing*, and a mud-coloured
 * median of all of them is a different answer from any of them. Round 5 has this cover returning; the
 * numbers it needs are pinned here rather than summarized.
 *
 * **v0.9.2 ships the gate, this region is withheld, and the accent still does not move. Round 4's
 * identity ask therefore stays open.**
 *
 * The region reads **.250** self-coherent at the gate's radius, against the 0.5 fraction, so it is
 * withheld — family 1 (`#7f7ca7`) disappears from the identity set, `massRetained` falls to .221 and
 * the chosen coverage falls 3 → 2. That is the gate doing exactly what it was ruled to do, on the
 * single most incoherent contributing entry of the 31 covers (.0012 at 1×, the lowest measured).
 *
 * **And the published accent is still `#7f7ca7`.** The gate withholds a colour's right to define the
 * artwork's *identity*; it is not an eligibility gate on the candidate pool (arm-f §2.4), so the
 * region remains an accent candidate and the chroma-first tie-break still ranks its .0648 above
 * `#000000`'s zero. Reverting this accent would take a **pool** gate — a different and much larger
 * ruling than the one that was made, and the level the ask is now pending at. Nothing here anticipates
 * that ruling; the numbers it would be made against are pinned below.
 */
test("anchor: item 6 moves on the mark pool, and the mark is a median of the whole illustration", async () => {
	const { palette, assignment, diagnostics, componentCandidates, marks } = await analyzeImage(
		await cover("09", "ab67616d0000b27300094a786a28459646be9b20"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#fae8d0", "#fae8d0", "#01bdfd", "#7f7ca7"],
		"was #fae8d0/#fae8d0/#01bdfd/#000000 through v0.8.2; unchanged by v0.9.2's gate",
	)
	assert.ok(assignment !== null)
	assert.equal(assignment.coverageDecided, false)
	// 2 in v0.8.2, 3 in v0.9.0 (the accent reached the illustration's family), and **2 again** in
	// v0.9.2 — the gate took that family away without taking the accent that covered it. Recomputed,
	// not relaxed: the palette below is the thing that is pinned, and it did not move.
	assert.equal(assignment.chosen?.coverage, 2)
	assert.ok(
		!assignment.identity.families.some((family) =>
			colorFromRgb(unpackRgb(family.representative)).hex === "#7f7ca7"
		),
		"the withheld region defines no family",
	)
	assert.ok(assignment.identity.massRetained < 0.25, `${assignment.identity.massRetained}`)
	assert.equal(diagnostics.retreat, true, "the 15a veto still empties the component pool")
	assert.equal(diagnostics.fieldComponents, 0)
	assert.deepEqual(componentCandidates, [], "so the *component* union is still not this cover's answer")
	// The mark half is, and this is what it offered.
	const accent = assignment.accentShortlist[0]!
	assert.equal(accent.source, "mark")
	assert.equal(accent.color.hex, "#7f7ca7")
	// The caveat, as a measurement: one entry is four fifths of the frame, and it is nearly neutral.
	assert.ok(marks.marks[0]!.massFraction > 0.75)
	assert.ok(accent.chroma < 0.07, `the published accent's chroma is ${accent.chroma} — a median, not a colour`)
})

/**
 * **`91a16672c4` (round-3 item 5) — coverage is the decider again.** In v0.8.0 coverage decided its
 * foreground (`#c39170` → `#d8a685`, coverage 2 → 3); in v0.8.1 the cover's largest unslotted
 * component (field mass 84 141) took the slot on mass and `coverageDecided` fell to false. v0.8.2
 * sorts that component below every ink, the two class-A creams compete alone, and coverage picks the
 * one that reaches a third family — v0.8.0's answer, by v0.8.0's route.
 *
 * The accent stays with the second component (field mass 44 510 against the heaviest ink's 1 758):
 * the accent's ranking is untouched by the class ordering, which is what this cover pins about it.
 */
test("91a16672c4: the class ordering hands the foreground back to the inks, and coverage decides it", async () => {
	const { palette, assignment, componentCandidates } = await analyzeImage(
		await cover("11", "ab67616d0000b27300113f74852a0091a16672c4"),
	)
	// **v0.9.0 hands the foreground back to `#c39170`** — v0.7.1's answer, and v0.8.0's `perRoleOnly`.
	// The families changed under the union and `#d8a685`'s third family went with them: the set is now
	// `#5d666f` .218 / `#d09d7e` .205 / `#15222a` .205 / `#2d3b46` .109, and both creams cover the same
	// one of them, so the coverage tie that lifted `#d8a685` above `#c39170` no longer exists and the
	// mass ordering decides the foreground again. Coverage still decides the *palette*, on the accent.
	assert.equal(palette.roles.foreground.hex, "#c39170", "was #d8a685 in v0.8.2, #d09d7e in v0.8.1")
	assert.equal(palette.roles.accent.hex, "#2c3a45", "was #3b4c56 in v0.7.1")
	assert.ok(assignment !== null)
	assert.equal(assignment.chosen?.coverage, 2, "was 3 under the triple-wise families")
	assert.equal(assignment.coverageDecided, true, "and still by that route: coverage over the per-role terms")
	assert.equal(assignment.perRoleOnly?.foreground.color.hex, "#c39170")
	assert.equal(componentCandidates.length, 2)
	assert.ok(componentCandidates.every((row) => row.admitted && row.feasible))
	assert.ok(componentCandidates.every((row) => row.foregroundClass === "B"))
	// The heaviest candidate on the cover by 14× is class B, and it does not reach the foreground.
	assert.ok(componentCandidates[0]!.supportMass > 80_000)
	assert.ok(assignment.foregroundShortlist.every((candidate) => candidate.foregroundClass === "A"))
	assert.equal(assignment.classOverriddenByCoverage, false)
	assert.equal(assignment.accentShortlist[0]!.source, "component")
})


// ---------------------------------------------------------------------------------------------
// v0.9.2 — **the gate's three anchors, and the window its radius is uncalibrated inside**
// ---------------------------------------------------------------------------------------------
//
// v0.9.0's loud finding was ruled on: a mark/region contributes an identity family only if at least
// `NO_FIELD_EXPLAINED_FRACTION` of its own pixels lie within a bar multiple of its own colour — the
// explained-fraction principle's third application (field→image, component→support, family→mark).
//
// The rule was measured before it was wired, and the measurement moved the radius. At the
// family-merge radius the ruling first named, the colour the gate exists to *protect* failed it, so
// the radius became `COHERENCE_GATE_BAR_MULTIPLE` — its own `[UNCALIBRATED]` constant, sitting inside
// a measured window rather than on a fitted point.
//
// These two tests are that evidence, on real covers, so neither the constant nor the window can drift
// silently: the first pins the three anchors' verdicts **at the shipped radius**, the second pins the
// window they define. `measurements/v9c-radius-sweep.json` is the whole 18-rung curve;
// `measurements/v9d-delta.json` is what the shipped gate publishes on all 31 covers.

test("gate anchors: at the shipped radius the crimson passes and both blend medians fail", async () => {
	assert.equal(COHERENCE_GATE_BAR_MULTIPLE, 8)
	assert.equal(MARK_IDENTITY_COHERENCE_FRACTION, 0.5)

	const anchors = [
		// [label, shard, name, the entry's published hex, must the gate withhold it?]
		["a8942d6547 giant illustration mark", "12", "ab67616d0000b27300125577fb06a6a8942d6547", "#39367d", true],
		["9646be9b20 78%-of-frame region", "09", "ab67616d0000b27300094a786a28459646be9b20", "#7f7ca7", true],
		["45baf46c90 NARCOSIS crimson", "01", "ab67616d0000b27300012525e62c7f45baf46c90", "#8d2639", false],
	] as const

	const measured: { label: string; coherence: number; coherent: boolean }[] = []
	for (const [label, shard, name, wantedHex, mustFail] of anchors) {
		const path = await cover(shard, name)
		const { marks } = await analyzeImage(path)
		const entry = marks.marks.find((mark) =>
			`#${mark.representative.toString(16).padStart(6, "0")}` === wantedHex
		)
		assert.ok(entry !== undefined, `${label}: no entry publishes ${wantedHex}`)
		assert.ok(entry.mass > 0, `${label}: the gate only acts on material with mass`)
		// The verdict itself, on each anchor, in the direction the ruling asked for. This is the
		// assertion the whole pass turns on.
		assert.equal(
			entry.identityCoherent,
			!mustFail,
			`${label}: wanted ${mustFail ? "withheld" : "kept"}, measured ${entry.selfCoherence}`,
		)
		measured.push({ label, coherence: entry.selfCoherence, coherent: entry.identityCoherent })
	}

	const [illustration, retreat, crimson] = measured as [typeof measured[0], typeof measured[0], typeof measured[0]]

	// The fractions, so a later change that keeps the verdicts by a hair is visible as one. The
	// must-fail pair clears the 0.5 fraction downward by .23 and .25; the must-pass anchor clears it
	// upward by .21. That two-sided margin is what "8 sits in the interior of the window" means in
	// published numbers rather than in a swept curve.
	assert.ok(illustration.coherence < 0.30, `a8942d6547 #39367d: ${illustration.coherence}`)
	assert.ok(illustration.coherence > 0.24, `a8942d6547 #39367d: ${illustration.coherence}`)
	assert.ok(retreat.coherence < 0.30, `9646be9b20 #7f7ca7: ${retreat.coherence}`)
	assert.ok(retreat.coherence > 0.20, `9646be9b20 #7f7ca7: ${retreat.coherence}`)
	assert.ok(crimson.coherence > 0.68, `45baf46c90 #8d2639: ${crimson.coherence}`)

	// And the separation is asserted as a gap rather than as three thresholds, because the gap is the
	// property a radius has to have and the thresholds are only where it currently sits.
	assert.ok(crimson.coherence > illustration.coherence + 0.2)
	assert.ok(crimson.coherence > retreat.coherence + 0.2)
})

test("gate anchors: the window is [5, 10] and the shipped radius is in its interior", async () => {
	// The sweep's conclusion, pinned on the same three anchors: the crimson clears the fraction at 5x
	// the bar and the two blend medians do not reach it until past 10x, so every rung in [5, 10] gives
	// all three the verdict the ruling asked for. `measurements/v9c-radius-sweep.json` is the curve.
	const at = async (shard: string, name: string, wantedHex: string) => {
		const path = await cover(shard, name)
		const [{ marks }, { raster }] = await Promise.all([analyzeImage(path), decodeAndInventory(path)])
		const entry = marks.marks.find((mark) =>
			`#${mark.representative.toString(16).padStart(6, "0")}` === wantedHex
		)!
		return coherenceSpectrum(entry, raster, [5, 10, 11])
	}

	const crimson = await at("01", "ab67616d0000b27300012525e62c7f45baf46c90", "#8d2639")
	const illustration = await at("12", "ab67616d0000b27300125577fb06a6a8942d6547", "#39367d")
	const retreat = await at("09", "ab67616d0000b27300094a786a28459646be9b20", "#7f7ca7")

	// The window's lower end: at 5x the crimson survives a gate the other two still fail.
	assert.ok(crimson[0]! >= MARK_IDENTITY_COHERENCE_FRACTION, `crimson at 5x: ${crimson[0]}`)
	assert.ok(illustration[0]! < MARK_IDENTITY_COHERENCE_FRACTION, `#39367d at 5x: ${illustration[0]}`)
	assert.ok(retreat[0]! < MARK_IDENTITY_COHERENCE_FRACTION, `#7f7ca7 at 5x: ${retreat[0]}`)

	// The upper end: at 10x all three verdicts still hold, and by 11x the illustration crosses over.
	assert.ok(crimson[1]! >= MARK_IDENTITY_COHERENCE_FRACTION, `crimson at 10x: ${crimson[1]}`)
	assert.ok(illustration[1]! < MARK_IDENTITY_COHERENCE_FRACTION, `#39367d at 10x: ${illustration[1]}`)
	assert.ok(retreat[1]! < MARK_IDENTITY_COHERENCE_FRACTION, `#7f7ca7 at 10x: ${retreat[1]}`)
	assert.ok(illustration[2]! >= MARK_IDENTITY_COHERENCE_FRACTION, `#39367d at 11x: ${illustration[2]}`)

	// So the shipped radius is strictly inside the window, not at either end — which is the claim the
	// constant's `[UNCALIBRATED]` note makes and the one thing a re-tune has to preserve.
	assert.ok(5 < COHERENCE_GATE_BAR_MULTIPLE && COHERENCE_GATE_BAR_MULTIPLE < 10)
})

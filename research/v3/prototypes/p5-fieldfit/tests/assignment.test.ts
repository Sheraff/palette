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
): RoleCandidate {
	const color: PaletteColor = colorFromRgb(rgb)
	return { cluster: clusterOf(rgb, mass), color, lab: rgbToOkLab(rgb), mass, legibility, source }
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
		second.foreground.mass - first.foreground.mass ||
		second.foreground.legibility - first.foreground.legibility ||
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
		const foreground = Array.from(
			{ length: 1 + Math.floor(random() * ROLE_SHORTLIST_SIZE) },
			() => candidateOf(colorAt(), random() * 1000, random() * 100),
		)
		const accents = Array.from(
			{ length: Math.floor(random() * (ROLE_SHORTLIST_SIZE + 1)) },
			() => candidateOf(colorAt(), random() * 1000, random() * 100),
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
 * **Anchor (a) — round-3 item 3, `2376a6b67d`.** v0.8.0's negative, and what ruling (a) does to it.
 *
 * v0.8.0 measured that no assignment could reach the artwork's red: it is carried by a field-like
 * **component** (support 0.138), so its rejected mass was ~34 against the black's ~1424 and it was
 * `sameColor` with its own local field — *"infeasible as an ink candidate at any K"* (`wp14.md` §2a).
 * v0.8.1's union puts the component in the pool with its **field** mass (11 694) and judges it against
 * the published colours, and the red now carries a role: the palette is yellow / white / **red** /
 * **black**, the reviewer's four-colour set, and the near-black fg-twin `#000300` is gone.
 *
 * **Which** role is the finding this test pins, because it is not the one round 3 asked for.** The
 * reviewer asked for the red as the *accent*; it takes the *foreground*, and the black takes the
 * accent. Both assignments are in the search space, both are feasible and both reach coverage 3; the
 * fg-mass tie-break decides between them, and the red's field mass (11 694) outweighs the black's
 * rejected mass (1 424) by 8×. That is a **scale** consequence of decision 18(a)'s "salient mass =
 * field mass", not a coverage decision (`coverageDecided` is false), and it is `reports/wp15.md`'s
 * open question. `P5_COMPONENT_ROLES=accent` re-runs the alternative, which publishes the reviewer's
 * exact ask here and moves seven covers in total, not four.
 */
test("anchor: item 3's red claims a role, the near-black twin is gone", async () => {
	const { palette, assignment, componentCandidates } = await analyzeImage(
		await cover("00", "ab67616d00001e020000269ead63cf2376a6b67d"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#fad107", "#f9fbf8", "#f81107", "#000000"],
		"was #fad107/#f9fbf8/#000000/#000300 in v0.8.0",
	)
	assert.ok(assignment !== null)
	const families = assignment.identity.families.map((family) =>
		colorFromRgb(unpackRgb(family.representative)).hex
	)
	assert.equal(families[2], "#fe0000", "the red is identity family 3, as it was")
	assert.deepEqual(assignment.fieldCovered, [1, 2], "yellow and white come from the field roles")
	assert.deepEqual(assignment.chosen?.covered, [1, 2, 3], "an ink role now reaches the red's family")

	// The route: one unslotted component, admitted, superseding the two rejected-mass crumbs of its own
	// family — which are the entries v0.8.0 had and could not publish.
	assert.equal(componentCandidates.length, 1)
	const red = componentCandidates[0]!
	assert.equal(red.admitted, true)
	assert.equal(red.feasible, true)
	assert.equal(red.published, "#f81107")
	assert.deepEqual(red.supersedes.map((entry) => entry.hex), ["#f20000", "#fe0000"])
	assert.ok(red.supportMass > 10_000, `field mass ${red.supportMass}, was ~34 as rejected mass`)

	// The tie-break, stated as a measurement: the red leads the foreground shortlist on mass alone, and
	// coverage did not decide it. A change that makes the reviewer's role split happen must move this.
	assert.equal(assignment.foregroundShortlist[0]!.source, "component")
	assert.equal(assignment.coverageDecided, false)
	assert.equal(assignment.perRoleOnly?.foreground.color.hex, "#f81107")
})

/**
 * **Anchor (c) — the round-2/3 silent STRONGs.** Two of three hold byte-identical. **`908479200b`
 * does not**, and it is pinned here as a regression rather than quietly re-baselined, because a
 * reviewer already blessed the palette it used to publish.
 *
 * What happens there is the same scale effect item 3's anchor names, on a cover where it is not
 * wanted: two unslotted components (a near-black at field mass 24 591 and an orange at 10 223)
 * outweigh the cream ink `#fed078` (rejected mass 2 432) by 10× and 4×, so they take both ink roles
 * and the STRONG cream is displaced. Under `P5_COMPONENT_ROLES=accent` the cream keeps the foreground
 * and only the accent moves (`#412824` → `#231f20`) — better, still not byte-identical. Neither column
 * holds this cover; the orchestrator's ruling is owed on which cost is the one to pay.
 */
for (
	const [label, shard, name, expected] of [
		["a8942d6547 (round-3 item 7, STRONG)", "12", "ab67616d0000b27300125577fb06a6a8942d6547", ["#120032", "#0f002a", "#ffffff", "#009cff"]],
		["eaed77a9cb (demo-20)", "00", "ab67616d00001e02000023e98b7381eaed77a9cb", ["#222335", "#474b56", "#ffffff", "#0f0b0c"]],
	] as const
) {
	test(`anchor: ${label} is byte-identical under decision 18(a)`, async () => {
		const { palette } = await analyzeImage(await cover(shard, name))
		assert.deepEqual(
			[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
			[...expected],
		)
	})
}

test("anchor: 908479200b — the STRONG that decision 18(a) moves, and by how much", async () => {
	const { palette, componentCandidates, assignment } = await analyzeImage(
		await cover("00", "ab67616d00001e02000022e7e9d11c908479200b"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#7a545f", "#fd7b61", "#231f20", "#fd9f55"],
		"REGRESSION: the reviewer's STRONG was #7a545f/#fd7b61/#fed078/#412824",
	)
	// The field roles are untouched — decision 18 does not reach back into the field reading, and the
	// half of the STRONG palette the reviewer's note was about (the coral ramp) is intact.
	assert.equal(palette.roles.background.hex, "#7a545f")
	assert.equal(palette.roles.surface.hex, "#fd7b61")
	// The cause, as one number: both ink roles went to components whose field mass dwarfs the ink's.
	assert.equal(componentCandidates.length, 2)
	assert.ok(componentCandidates.every((row) => row.admitted && row.feasible))
	const cream = assignment!.foregroundShortlist.find((c) => c.color.hex === "#fed078")
	assert.ok(cream !== undefined, "the STRONG foreground is still in the shortlist, and still legible")
	assert.ok(
		assignment!.foregroundShortlist[0]!.mass > 10 * cream.mass,
		"it loses on mass alone, by an order of magnitude",
	)
})

/**
 * **Anchor (b) — round-3 item 6, `9646be9b20`, the "many colors" complaint.** Neither coverage
 * (v0.8.0) nor the pool re-union (v0.8.1) improves it: the palette stays cream/cream/blue/black.
 *
 * The union cannot help here, and the reason is structural rather than a near miss — **the component
 * pool is empty**. Item 6's only extensive component is the display type, which decision 15a's veto
 * refuses as a field, so the cover takes the declared retreat and there is no unslotted component to
 * offer. Pinned as an identity, so that a later change which makes this cover move has to explain
 * where a component came from.
 */
test("anchor: item 6 is unchanged, and its component pool is empty by the 15a veto", async () => {
	const { palette, assignment, diagnostics, componentCandidates } = await analyzeImage(
		await cover("09", "ab67616d0000b27300094a786a28459646be9b20"),
	)
	assert.deepEqual(
		[palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex],
		["#fae8d0", "#fae8d0", "#01bdfd", "#000000"],
	)
	assert.ok(assignment !== null)
	assert.equal(assignment.coverageDecided, false)
	assert.equal(assignment.chosen?.coverage, 2)
	assert.equal(diagnostics.retreat, true, "the 15a veto emptied the pool")
	assert.equal(diagnostics.fieldComponents, 0)
	assert.deepEqual(componentCandidates, [], "nothing to union: the union is not this cover's answer")
})

/**
 * **`91a16672c4` (round-3 item 5) — the cover that was v0.8.0's only delta, and what the union does
 * to it.** In v0.8.0 coverage decided its foreground (`#c39170` → `#d8a685`, coverage 2 → 3). In
 * v0.8.1 both ink roles go to the cover's two unslotted components, at coverage 3 again, and
 * `coverageDecided` falls back to false: the per-role mass ranking now reaches the same answer on its
 * own, because a component's field mass leads every shortlist it enters.
 *
 * That is the honest reading of the v0.8.0 delta's disappearance — coverage did not stop mattering,
 * it stopped being the thing that broke the tie — and it is why the coverage re-measurement in
 * `reports/wp15.md` reports `coverageDecided` at 0/27 rather than treating the drop as an improvement.
 */
test("91a16672c4: both ink roles go to components, and coverage stops being the decider", async () => {
	const { palette, assignment, componentCandidates } = await analyzeImage(
		await cover("11", "ab67616d0000b27300113f74852a0091a16672c4"),
	)
	assert.equal(palette.roles.foreground.hex, "#d09d7e", "was #d8a685 in v0.8.0, #c39170 in v0.7.1")
	assert.equal(palette.roles.accent.hex, "#2c3a45", "was #3b4c56")
	assert.ok(assignment !== null)
	assert.equal(assignment.chosen?.coverage, 3, "the same coverage v0.8.0 reached")
	assert.equal(assignment.coverageDecided, false, "reached by the per-role ranking alone now")
	assert.equal(componentCandidates.length, 2)
	assert.ok(componentCandidates.every((row) => row.admitted && row.feasible))
	assert.equal(assignment.foregroundShortlist[0]!.source, "component")
	assert.equal(assignment.accentShortlist[0]!.source, "component")
})

/**
 * W-V9a self-test: the mark/region support instrument (`V9_BRIEF.md`, arm-f §2.3).
 *
 * The brief names three synthetic obligations and this file is them, in order:
 *
 *  (a) **text on a field** — the strokes are found as marks at the stable scale, and the ink
 *      instrument on their real connected support reads them as ink-shaped (the measurement wp12
 *      could not make: on a bar-neighbourhood cluster mortality was 1.0000 on 60 of 60);
 *  (b) **a textured region** — spatially massive, and *not* ink;
 *  (c) **±1-LSB dither idempotence** of the grouping and of the identity family set.
 *
 * Plus the properties that are structural rather than optional, each of which is a claim the module's
 * header makes and would otherwise be unchecked: determinism, the cropped ink measurement's
 * **equality** with wp12's whole-frame one (the only reason the crop is allowed to exist), the
 * no-triple-floor property that is the whole point of spatial mass, and the paradigm line — mark
 * supports are disjoint from the field's claim and from each other.
 *
 * Raster fixtures are built in code with the same deterministic hash `fieldfit.test.ts` and
 * `components.test.ts` use, so these tests test the instrument and nothing else.
 *
 * Run from `research/v3`:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/marks.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { okLabToRgb, rgbToOkLab } from "../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"

import {
	COMPONENT_INK_MORTALITY,
	compositeFieldFit,
	inkStatistics,
} from "../src/components.ts"
import type { FieldReading } from "../src/components.ts"
import { normalizedX, normalizedY, unpackRgb } from "../src/decode.ts"
import { fitField, fitFieldComponents } from "../src/fieldfit.ts"
import type { IdentitySet } from "../src/assignment.ts"
import {
	chooseGroupingScale,
	groupAtScale,
	identityFamiliesUnion,
	identityFamiliesV2,
	inkOnSupport,
	MARK_SCALE_DEFAULT_DIAGONAL_FRACTION,
	MARK_SCALE_SWEEP_MAX_DIAGONAL_FRACTION,
	MARK_SCALE_SWEEP_MIN_DIAGONAL_FRACTION,
	readMarks,
	scaleLadder,
} from "../src/marks.ts"
import type { MarkReading, MarkRegion } from "../src/marks.ts"
import type { DecodedRaster, FieldFit } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// Fixture machinery — `components.test.ts`'s, unchanged
// ---------------------------------------------------------------------------------------------

function hash32(value: number): number {
	let h = value | 0
	h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
	h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
	h ^= h >>> 16
	return h >>> 0
}

/** Deterministic pseudo-noise in [0, 1). */
function noise(seed: number): number {
	return hash32(seed) / 0x1_0000_0000
}

function makeRaster(
	width: number,
	height: number,
	colorAt: (x: number, y: number, index: number) => OkLab,
): DecodedRaster {
	const lab = new Float32Array(width * height * 3)
	const packed = new Uint32Array(width * height)
	for (let row = 0; row < height; row += 1) {
		const y = normalizedY(row, height)
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			const color = colorAt(normalizedX(column, width), y, index)
			const rgb = okLabToRgb(color)
			// The raster's OKLab must be the *quantized* colour's, exactly as `decode.ts` produces it:
			// a fixture whose lab and packed disagree would be testing an image that cannot exist.
			const exact = rgbToOkLab(rgb)
			lab[index * 3] = exact[0]
			lab[index * 3 + 1] = exact[1]
			lab[index * 3 + 2] = exact[2]
			packed[index] = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
		}
	}
	return { width, height, format: "synthetic", lab, packed }
}

/** The whole reading, the way `candidate.ts` assembles the field the overlay measures against. */
function read(raster: DecodedRaster): { reading: MarkReading; fit: FieldFit } {
	const fit = fitField(raster)
	let overlayFit: FieldFit = fit
	let components: FieldReading | null = null
	if (fit.noField) {
		components = fitFieldComponents(raster)
		if (components.components[0] !== undefined) {
			overlayFit = compositeFieldFit(components, raster, fit)
		}
	}
	return { reading: readMarks(raster, overlayFit, components), fit: overlayFit }
}

const SIZE = 128

/** A flat pale field — nothing for the fit to reject anywhere it is not drawn on. */
const PAGE: OkLab = [0.88, 0.004, 0.012]
/** Ink: dark, and far enough from the page that no dither can move a pixel across the fit's cut. */
const INK: OkLab = [0.16, 0.01, -0.02]

/**
 * Text on a field: five vertical strokes two pixels wide, joined by one horizontal bar — a word.
 *
 * Two pixels wide is deliberate: the ink scale is `INK_SCALE_FRACTION` of the short side, which on a
 * 128² fixture is 4 px, so an erosion at that radius kills anything under 9 px across. A stroke that
 * survived would be testing a different claim.
 */
function isTextPixel(column: number, row: number): boolean {
	if (row < 40 || row > 88) return false
	if (row >= 62 && row <= 63 && column >= 24 && column <= 104) return true
	for (let stroke = 0; stroke < 5; stroke += 1) {
		const x = 24 + stroke * 20
		if (column >= x && column <= x + 1) return true
	}
	return false
}

function textOnField(): DecodedRaster {
	return makeRaster(SIZE, SIZE, (_x, _y, index) => {
		const row = Math.floor(index / SIZE)
		const column = index - row * SIZE
		return isTextPixel(column, row) ? INK : PAGE
	})
}

/** Rows/columns of the textured patch — a solid block of structureless colour, 32×32 in the middle. */
function isTexturePixel(column: number, row: number): boolean {
	return row >= 48 && row < 80 && column >= 48 && column < 80
}

function texturedRegionOnField(): DecodedRaster {
	return makeRaster(SIZE, SIZE, (_x, _y, index) => {
		const row = Math.floor(index / SIZE)
		const column = index - row * SIZE
		if (!isTexturePixel(column, row)) return PAGE
		// Structureless, and far from the page in every channel: no low-order surface explains it and
		// no dither moves it. The spread is wide enough that it is a *texture*, not a flat patch.
		return [
			0.20 + 0.45 * noise(index * 3 + 1),
			-0.12 + 0.24 * noise(index * 3 + 2),
			-0.12 + 0.24 * noise(index * 3 + 3),
		]
	})
}

/** ±1 LSB on every channel of every pixel, by the fixture's own hash — no `Math.random`. */
function dither(raster: DecodedRaster): DecodedRaster {
	const { width, height, packed } = raster
	return makeRaster(width, height, (_x, _y, index) => {
		const source = unpackRgb(packed[index]!)
		const shifted: Rgb8 = [
			Math.max(0, Math.min(255, source[0] + (hash32(index * 7 + 1) % 3) - 1)),
			Math.max(0, Math.min(255, source[1] + (hash32(index * 7 + 2) % 3) - 1)),
			Math.max(0, Math.min(255, source[2] + (hash32(index * 7 + 3) % 3) - 1)),
		]
		return rgbToOkLab(shifted)
	})
}

const hexOf = (packed: number) => {
	const rgb = unpackRgb(packed)
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/** The marks (never the regions), descending by mass — what the obligations are stated about. */
function marksOnly(reading: MarkReading): MarkRegion[] {
	return reading.marks.filter((entry) => entry.kind === "mark")
}

// ---------------------------------------------------------------------------------------------
// (a) text on a field ⇒ ink-shaped marks at the stable scale
// ---------------------------------------------------------------------------------------------

test("(a) text on a field is found as marks, and they are ink-shaped on their real support", () => {
	const raster = textOnField()
	const { reading } = read(raster)

	const marks = marksOnly(reading)
	assert.ok(marks.length >= 1, "the text must be rejected by the fit and grouped as mark material")

	// The word is one connected shape (the bar joins the strokes), so at any scale the whole of it is
	// one mark and it is the largest one. That is the grouping's claim, and it is what makes the ink
	// measurement below a measurement *of the word* rather than of a stroke.
	const largest = marks[0]!
	assert.equal(
		largest.pixels,
		countPixels((column, row) => isTextPixel(column, row)),
		"the largest mark must be exactly the drawn text",
	)

	// The colour is the ink's, robustly, and it is an exact source triple.
	assert.equal(hexOf(largest.representative), hexOf(packedOf(INK)))
	assert.ok(raster.packed.includes(largest.representative), "a mark publishes an exact source pixel")

	// **The 15b measurement.** wp12 could not make it: on a bar-neighbourhood cluster mortality was
	// 1.0000 on 60 of 60 candidates, so the number carried nothing. On a real connected support the
	// two-pixel strokes vanish under an erosion at the ink scale, and the instrument says so.
	assert.notEqual(largest.ink, null)
	assert.ok(
		largest.ink!.erosionMortality >= COMPONENT_INK_MORTALITY,
		`text mortality ${largest.ink!.erosionMortality} must reach ${COMPONENT_INK_MORTALITY}`,
	)
	assert.equal(largest.inkShaped, true)

	// And the measured degeneracy of 15a's *other* conjunct at this site, pinned so that a future
	// change to it is visible: a mark is the complement of the field, so its outward boundary is
	// entirely field-claimed and `groundAdjacency` is 1 by construction — never below 0.10.
	assert.equal(largest.ink!.groundAdjacency, 1)
	assert.equal(largest.inkLike, false)
})

// ---------------------------------------------------------------------------------------------
// (b) a textured region ⇒ massive, not ink
// ---------------------------------------------------------------------------------------------

test("(b) a textured region is spatially massive and not ink-shaped", () => {
	const raster = texturedRegionOnField()
	const { reading } = read(raster)

	const marks = marksOnly(reading)
	assert.ok(marks.length >= 1)
	const patch = marks[0]!

	// Massive: the patch is 32×32 of a 128² frame, and **every pixel of it counts**. This is the
	// property the triple-wise identity set cannot have — the patch holds ~1024 distinct triples of
	// about one pixel each, every one of them below `IDENTITY_MASS_FLOOR_FRACTION`.
	const expected = countPixels(isTexturePixel)
	assert.equal(patch.pixels, expected)
	assert.ok(
		patch.massFraction > 0.05,
		`a 1/16-of-frame patch must carry its mass spatially, got ${patch.massFraction}`,
	)
	assert.ok(patch.memberCount > 100, `a texture is many triples, got ${patch.memberCount}`)

	// Not ink: a solid block survives an erosion at the ink scale.
	assert.notEqual(patch.ink, null)
	assert.ok(
		patch.ink!.erosionMortality < COMPONENT_INK_MORTALITY,
		`texture mortality ${patch.ink!.erosionMortality} must stay below ${COMPONENT_INK_MORTALITY}`,
	)
	assert.equal(patch.inkShaped, false)
	assert.equal(patch.inkLike, false)
})

// ---------------------------------------------------------------------------------------------
// (c) ±1-LSB dither idempotence — of the grouping, and of the family set
// ---------------------------------------------------------------------------------------------

for (const [name, build] of [
	["text on a field", textOnField],
	["a textured region", texturedRegionOnField],
] as const) {
	test(`(c) ±1 LSB moves neither the grouping nor the family set — ${name}`, () => {
		const plain = read(build())
		const shifted = read(dither(build()))

		assert.equal(
			shifted.reading.scale.radius,
			plain.reading.scale.radius,
			"the stable scale is a property of the material, not of the last bit",
		)
		assert.deepEqual(shifted.reading.scale.counts, plain.reading.scale.counts)

		const before = marksOnly(plain.reading).map((entry) => entry.pixels)
		const after = marksOnly(shifted.reading).map((entry) => entry.pixels)
		assert.deepEqual(after, before, "the supports themselves must not move")

		// The family **set**: how many families there are, in what order, and what colour each one is.
		//
		// **What is claimed, and what deliberately is not.** The grouping is bit-stable and asserted
		// as such above — the supports are the same pixels. A family's *mass* is not bit-stable and
		// cannot be: it is a sum of Tukey weights, which are a continuous function of the residuals,
		// so a last-bit change to the raster moves the fit's weights and moves the sum with it (~4% on
		// these fixtures). That is a property of the field fit, not of this instrument, and asserting
		// float equality on it would pin the wrong module. What must not move is the reading: same
		// number of families, same ranks, each the same colour, each carrying the same mass to within
		// a few percent.
		const familiesBefore = identityFamiliesV2(plain.reading.marks, plain.reading.totalPixels)
		const familiesAfter = identityFamiliesV2(shifted.reading.marks, shifted.reading.totalPixels)
		assert.equal(familiesAfter.families.length, familiesBefore.families.length)
		assert.equal(familiesAfter.totalFamilies, familiesBefore.totalFamilies)
		for (let rank = 0; rank < familiesBefore.families.length; rank += 1) {
			const first = familiesBefore.families[rank]!
			const second = familiesAfter.families[rank]!
			const drift = Math.abs(second.mass - first.mass) / first.mass
			assert.ok(drift < 0.05, `family ${rank + 1} mass moved ${(drift * 100).toFixed(1)}%`)
			const distance = Math.hypot(
				second.centre[0] - first.centre[0],
				second.centre[1] - first.centre[1],
				second.centre[2] - first.centre[2],
			)
			// One LSB of sRGB is far below a bar; the assertion is that the family is the same colour,
			// not that the representative is the same integer.
			assert.ok(distance < 0.01, `family ${rank + 1} moved ${distance} in OKLab`)
		}
	})
}

// ---------------------------------------------------------------------------------------------
// The cropped ink measurement is wp12's, exactly — the only reason it is allowed to exist
// ---------------------------------------------------------------------------------------------

test("the cropped ink measurement equals wp12's whole-frame one, everywhere", () => {
	const cases: Array<[string, DecodedRaster]> = [
		["text", textOnField()],
		["texture", texturedRegionOnField()],
	]
	let compared = 0
	for (const [label, raster] of cases) {
		const { reading } = read(raster)
		const claimed = new Uint8Array(raster.width * raster.height)
		for (const entry of reading.marks) {
			if (entry.kind !== "mark") continue
			for (let index = 0; index < claimed.length; index += 1) {
				if (entry.support[index] === 1) claimed[index] = 0
			}
		}
		// The ground the instrument is measured against: everything no mark holds.
		const ground = new Uint8Array(raster.width * raster.height).fill(1)
		for (const entry of reading.marks) {
			if (entry.kind !== "mark") continue
			for (let index = 0; index < ground.length; index += 1) {
				if (entry.support[index] === 1) ground[index] = 0
			}
		}
		for (const entry of reading.marks) {
			if (entry.kind !== "mark") continue
			const whole = inkStatistics(entry.support, ground, raster.width, raster.height)
			const cropped = inkOnSupport(entry.support, ground, raster.width, raster.height, entry.box)
			assert.deepEqual(cropped, whole, `${label}: mark at ${JSON.stringify(entry.box)}`)
			compared += 1
		}
	}
	assert.ok(compared > 0, "the equality claim needs at least one mark to be made about")
})

// A mark that runs to the frame is the case border replication exists for, and the crop must keep it.
test("the crop keeps border replication for a full-bleed mark", () => {
	const width = 64
	const height = 64
	const support = new Uint8Array(width * height)
	const ground = new Uint8Array(width * height).fill(1)
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < 6; column += 1) {
			support[row * width + column] = 1
			ground[row * width + column] = 0
		}
	}
	const box = { minX: 0, minY: 0, maxX: 5, maxY: height - 1 }
	assert.deepEqual(
		inkOnSupport(support, ground, width, height, box),
		inkStatistics(support, ground, width, height),
	)
})

// ---------------------------------------------------------------------------------------------
// Structural properties
// ---------------------------------------------------------------------------------------------

test("the sweep is a scale-free ladder tied to the diagonal, and the plateau criterion is on it", () => {
	for (const [width, height] of [[300, 300], [640, 640], [3000, 3000], [640, 300]] as const) {
		const ladder = scaleLadder(width, height)
		const diagonal = Math.hypot(width, height)
		assert.equal(ladder[0], 0, "the finest rung is plain connectivity")
		for (let rung = 1; rung < ladder.length; rung += 1) {
			assert.ok(ladder[rung]! > ladder[rung - 1]!, "the ladder is strictly increasing")
		}
		const coarsest = ladder[ladder.length - 1]!
		assert.ok(
			coarsest <= Math.round(MARK_SCALE_SWEEP_MAX_DIAGONAL_FRACTION * diagonal),
			`ladder for ${width}×${height} overshot its envelope at ${coarsest}`,
		)
		assert.ok(ladder[1]! >= Math.max(1, Math.round(MARK_SCALE_SWEEP_MIN_DIAGONAL_FRACTION * diagonal)))
	}

	// The criterion on a curve with a genuine plateau takes it, at its finest rung.
	const raster = textOnField()
	const { reading } = read(raster)
	const chosen = reading.scale
	assert.equal(chosen.radius, chosen.scales[chosen.chosenIndex])
	if (chosen.criterion === "plateau") {
		assert.ok(chosen.plateauLength > 1)
		assert.equal(chosen.counts[chosen.chosenIndex], chosen.counts[chosen.chosenIndex + 1])
		assert.notEqual(
			chosen.counts[chosen.chosenIndex],
			chosen.counts[chosen.chosenIndex - 1] ?? -1,
			"the plateau is taken at its finest rung",
		)
	}
})

test("mark supports are disjoint from each other and from the field's claim", () => {
	const raster = texturedRegionOnField()
	const { reading, fit } = read(raster)
	const seen = new Uint8Array(raster.width * raster.height)
	for (const entry of reading.marks) {
		if (entry.kind !== "mark") continue
		for (let index = 0; index < seen.length; index += 1) {
			if (entry.support[index] !== 1) continue
			assert.equal(seen[index], 0, "two marks claim the same pixel")
			seen[index] = 1
			// The paradigm line: mark material is what the field did not explain, so a mark pixel is
			// never an inlier of the field it was grouped against.
			assert.ok(!(fit.weights[index]! > 0.5), "a mark pixel is claimed by the field")
		}
	}
})

test("the reading is deterministic — same raster, identical answer", () => {
	const raster = textOnField()
	const first = read(raster).reading
	const second = read(raster).reading
	assert.deepEqual(
		second.marks.map((entry) => [entry.kind, entry.pixels, entry.representative, entry.mass]),
		first.marks.map((entry) => [entry.kind, entry.pixels, entry.representative, entry.mass]),
	)
	assert.deepEqual(second.scale.counts, first.scale.counts)
})

test("grouping at a coarser scale merges and never splits", () => {
	const raster = textOnField()
	const fit = fitField(raster)
	const claimed = new Uint8Array(raster.width * raster.height)
	for (let index = 0; index < claimed.length; index += 1) {
		if (fit.weights[index]! > 0.5) claimed[index] = 1
	}
	const unexplained = new Uint8Array(claimed.length)
	for (let index = 0; index < claimed.length; index += 1) {
		unexplained[index] = claimed[index] === 0 ? 1 : 0
	}
	const sweep = chooseGroupingScale(unexplained, raster.width, raster.height)
	for (let rung = 1; rung < sweep.scales.length; rung += 1) {
		assert.ok(
			sweep.counts[rung]! <= sweep.counts[rung - 1]!,
			`count rose from ${sweep.counts[rung - 1]} to ${sweep.counts[rung]}`,
		)
	}
	// And the material is conserved: grouping partitions the unexplained set at every scale.
	for (const radius of [0, sweep.radius]) {
		const groups = groupAtScale(unexplained, raster.width, raster.height, radius)
		let total = 0
		for (const group of groups) total += group.pixels
		let expected = 0
		for (let index = 0; index < unexplained.length; index += 1) if (unexplained[index] === 1) expected += 1
		assert.equal(total, expected, `radius ${radius} lost or duplicated material`)
	}
})

test("identity families v2 is a pure function of the mark set", () => {
	const raster = texturedRegionOnField()
	const { reading } = read(raster)
	const once = identityFamiliesV2(reading.marks, reading.totalPixels)
	const twice = identityFamiliesV2([...reading.marks], reading.totalPixels)
	assert.deepEqual(twice, once)
	// The masses it ranks on are the entries' own, and the retained mass is their sum — the number
	// whose collapse to 0.1819 on NARCOSIS is why this function exists.
	let total = 0
	for (const entry of reading.marks) total += entry.mass
	assert.equal(once.massRetained, total / reading.totalPixels)
	assert.ok(once.massRetained > 0.5, `v2 must retain the image, got ${once.massRetained}`)
})

// ---------------------------------------------------------------------------------------------
// v0.9.0 — the four wiring decisions, each on its own terms
// ---------------------------------------------------------------------------------------------

/**
 * **The family union's merge and mass rules** (`identityFamiliesUnion`).
 *
 * Three claims, and nothing about any particular cover: same-bar centres merge across the two sides;
 * a merged family's mass is the `max` of the two readings and never their sum (they measure the same
 * material twice, so adding would publish a mass larger than the image); and everything else about a
 * merged family comes from its heavier side rather than from an average of the two.
 */
test("identity families union: same-bar centres merge, and the merged mass is max, never a sum", () => {
	const raster = texturedRegionOnField()
	const { reading } = read(raster)
	const v2 = identityFamiliesV2(reading.marks, reading.totalPixels, 1024)

	// A union of a set with itself is that set, with every mass unchanged: `max(m, m) = m`. A sum rule
	// would double every one of them, which is the failure this asserts against directly.
	const selfUnion = identityFamiliesUnion(v2, v2, reading.totalPixels, 1024)
	assert.deepEqual(
		selfUnion.families.map((family) => family.mass),
		v2.families.map((family) => family.mass),
		"merging a reading with itself must not add its mass to itself",
	)
	assert.equal(selfUnion.totalFamilies, v2.totalFamilies, "and must not create families")

	// A disjoint side is carried through whole: no colour is lost by unioning.
	const far: IdentitySet = {
		families: [{
			rank: 1,
			representative: 0xff00ff,
			centre: rgbToOkLab([0xff, 0x00, 0xff]),
			mass: 1,
			massFraction: 1 / reading.totalPixels,
			memberCount: 1,
		}],
		totalFamilies: 1,
		massRetained: 0.01,
	}
	const widened = identityFamiliesUnion(v2, far, reading.totalPixels, 1024)
	assert.equal(widened.totalFamilies, v2.totalFamilies + 1, "a colour neither side shares is kept")
	assert.ok(widened.families.some((family) => family.representative === 0xff00ff))

	// The dominant side supplies the merged family's identity, and the mass is the larger reading.
	const heavier: IdentitySet = {
		families: v2.families.slice(0, 1).map((family) => ({ ...family, mass: family.mass * 2 })),
		totalFamilies: 1,
		massRetained: 0.99,
	}
	const merged = identityFamiliesUnion(v2, heavier, reading.totalPixels, 1024)
	assert.equal(merged.totalFamilies, v2.totalFamilies, "the doubled copy merged rather than joined")
	const top = merged.families[0]!
	assert.equal(top.mass, v2.families[0]!.mass * 2, "the merged mass is the max of the two")
	assert.equal(top.representative, v2.families[0]!.representative)
	// `massRetained` follows the same rule, over the same argument.
	assert.equal(merged.massRetained, Math.max(v2.massRetained, 0.99))
})

/**
 * **The scale default** (`MARK_SCALE_DEFAULT_DIAGONAL_FRACTION`), and the domain it is chosen in.
 *
 * Three claims: the default is a fraction of the **diagonal**, so it is the same physical scale on a
 * 300² and a 3000² cover; it is snapped onto a swept rung, so `counts[chosenIndex]` is the count
 * actually measured at the radius actually used; and it is snapped inside the ladder's **interior**,
 * because the two endpoints are the degenerate readings (every speck its own mark; everything merged
 * into one) that the criterion it replaced could not reach either.
 */
test("scale default: a diagonal fraction, snapped to an interior rung of the swept ladder", () => {
	assert.ok(
		MARK_SCALE_DEFAULT_DIAGONAL_FRACTION > MARK_SCALE_SWEEP_MIN_DIAGONAL_FRACTION &&
			MARK_SCALE_DEFAULT_DIAGONAL_FRACTION < MARK_SCALE_SWEEP_MAX_DIAGONAL_FRACTION,
		"the default must be reachable inside the sweep's own envelope",
	)
	// The bracket it was ruled from, re-derived rather than remembered: r = 1 on a 300² cover
	// (`4130886c02`, which fragments a word) and r = 23 on a 640² one (NARCOSIS, which merges a
	// picture), and the value is the geometric centre of the two as fractions of their diagonals.
	const low = 1 / Math.hypot(300, 300)
    const high = 23 / Math.hypot(640, 640)
	assert.ok(low < MARK_SCALE_DEFAULT_DIAGONAL_FRACTION && MARK_SCALE_DEFAULT_DIAGONAL_FRACTION < high)
	assert.ok(
		Math.abs(MARK_SCALE_DEFAULT_DIAGONAL_FRACTION - Math.sqrt(low * high)) < 5e-5,
		`the geometric centre of the bracket is ${Math.sqrt(low * high)}`,
	)

	// A curve with no repeated count: strictly decreasing, so no plateau exists and the default fires.
	// The mask is a diagonal line of isolated dots, whose groups merge one pair at a time.
	for (const size of [300, 640] as const) {
		const mask = new Uint8Array(size * size)
		for (let step = 0; step < 24; step += 1) {
			const position = 8 + step * 9
			mask[position * size + position] = 1
		}
		const choice = chooseGroupingScale(mask, size, size)
		assert.equal(choice.radius, choice.scales[choice.chosenIndex], "the radius is a swept rung")
		if (choice.criterion === "default") {
			assert.ok(choice.chosenIndex > 0, "never the finest rung — every speck its own mark")
			assert.ok(
				choice.chosenIndex < choice.scales.length - 1,
				"never the coarsest rung — everything merged into one",
			)
			assert.ok(choice.counts[choice.chosenIndex]! > 1, "and so never a count of one")
			// The snap is to the nearest rung in the ladder's own log units.
			const target = MARK_SCALE_DEFAULT_DIAGONAL_FRACTION * choice.diagonal
			const gap = (rung: number) => Math.abs(Math.log(1 + choice.scales[rung]!) - Math.log(1 + target))
			for (let rung = 1; rung < choice.scales.length - 1; rung += 1) {
				assert.ok(gap(choice.chosenIndex) <= gap(rung), `rung ${rung} was nearer the default`)
			}
		}
	}
})

// ---------------------------------------------------------------------------------------------
// Fixture helpers used by the assertions above
// ---------------------------------------------------------------------------------------------

function countPixels(predicate: (column: number, row: number) => boolean): number {
	let count = 0
	for (let row = 0; row < SIZE; row += 1) {
		for (let column = 0; column < SIZE; column += 1) if (predicate(column, row)) count += 1
	}
	return count
}

function packedOf(lab: OkLab): number {
	const rgb = okLabToRgb(lab)
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

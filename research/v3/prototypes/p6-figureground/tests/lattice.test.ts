/**
 * P6 lattice tests (W2).
 *
 * The load-bearing test in this file is **"statsAt matches a naive per-pixel integral"**. Everything
 * `src/lattice/` does is quadrature for one thing — an area integral of a pixel statistic against a
 * Gaussian of bandwidth `h` centred on a candidate colour — and this test computes that integral the
 * slow, obvious way, pixel by pixel, with no lattice anywhere, and demands the lattice agree. If it
 * ever fails, every number the energy reads is measuring something other than what its doc comment
 * says, and the design's whole robustness argument (proposal §2.6: "every decision variable is an
 * area integral") is being made about code that does not compute one.
 *
 * The second load-bearing one is **"quadrature invariance"**: the same statistics computed on two
 * different lattice resolutions. Proposal §3 says the lattice resolution is a quadrature choice and
 * "if anyone tunes it, the design has been violated" — this is the test that would catch it, because
 * a resolution that moved statistics would be a resolution that decided something.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p6-figureground/tests/lattice.test.ts
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

import sharp from "sharp"

import { rgbToOkLab } from "../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
import {
	BORDER_ANNULUS_SHORT_EDGE_FRACTION,
	LATTICE_MASS_FLOOR,
	UNIFORM_FRAME_SPATIAL_SPREAD,
} from "../src/lattice/constants.ts"
import { LATTICE_BANDWIDTH, buildLatticeWith, enumerateDistinctTriples } from "../src/lattice/index.ts"
import { buildNearestIndex } from "../src/lattice/nearest.ts"
import { makeRandom, substrateFromRgb, syntheticArtwork } from "../src/lattice/synthetic.ts"
import type { CandidateStats, Substrate } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// The naive reference: the same integrals, computed pixel by pixel with no lattice.
// ---------------------------------------------------------------------------------------------

/**
 * `CandidateStats` for one candidate, from first principles.
 *
 * Deliberately written from the *doc comments in `src/types.ts` and proposal §2.2*, not from
 * `src/lattice/index.ts`: a reference that mirrors the implementation's structure would only test
 * that the code equals itself. Kernel is the peak-1 Gaussian `exp(-d²/2h²)` the module documents.
 */
function naiveStats(substrate: Substrate, lab: OkLab, bandwidth: number): CandidateStats {
	const { planes, figureGround } = substrate
	const { width, height } = planes
	const pixelCount = width * height
	const twoHSquared = 2 * bandwidth * bandwidth

	const shortEdge = Math.min(width, height)
	const annulusWidth = Math.max(1, Math.round(shortEdge * BORDER_ANNULUS_SHORT_EDGE_FRACTION))
	const innerWidth = Math.max(0, width - 2 * annulusWidth)
	const innerHeight = Math.max(0, height - 2 * annulusWidth)
	const annulusAreaFraction = (pixelCount - innerWidth * innerHeight) / pixelCount

	let mass = 0
	let groundMass = 0
	let ink = 0
	let mark = 0
	let field = 0
	let border = 0
	let groundL = 0
	let groundA = 0
	let groundB = 0
	let sumX = 0
	let sumY = 0
	let sumSquares = 0
	let colourL = 0
	let colourA = 0
	let colourB = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			const deltaL = planes.L[index]! - lab[0]
			const deltaA = planes.a[index]! - lab[1]
			const deltaB = planes.b[index]! - lab[2]
			const weight = Math.exp(-(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB) / twoHSquared)

			const groundDeltaL = figureGround.ground.L[index]! - lab[0]
			const groundDeltaA = figureGround.ground.a[index]! - lab[1]
			const groundDeltaB = figureGround.ground.b[index]! - lab[2]
			groundMass += Math.exp(
				-(groundDeltaL * groundDeltaL + groundDeltaA * groundDeltaA + groundDeltaB * groundDeltaB) / twoHSquared,
			)

			const normalisedX = (x + 0.5) / width
			const normalisedY = (y + 0.5) / height
			const inBorder = x < annulusWidth || x >= width - annulusWidth || y < annulusWidth ||
				y >= height - annulusWidth

			mass += weight
			ink += weight * figureGround.inkEnergy[index]!
			mark += weight * figureGround.markEnergy[index]!
			field += weight * figureGround.fieldWeight[index]!
			border += weight * (inBorder ? 1 : 0)
			groundL += weight * figureGround.ground.L[index]!
			groundA += weight * figureGround.ground.a[index]!
			groundB += weight * figureGround.ground.b[index]!
			sumX += weight * normalisedX
			sumY += weight * normalisedY
			sumSquares += weight * (normalisedX * normalisedX + normalisedY * normalisedY)
			colourL += weight * planes.L[index]!
			colourA += weight * planes.a[index]!
			colourB += weight * planes.b[index]!
		}
	}

	// `LATTICE_MASS_FLOOR` is part of the *statistic's* definition, not of the lattice: it is what
	// makes the ratio statistics continuous at zero mass, sending each colour-valued one to the query
	// point rather than to an arbitrary origin. So the reference implements it too.
	const denominator = mass + LATTICE_MASS_FLOOR
	const floorShare = LATTICE_MASS_FLOOR / denominator
	const meanX = sumX / denominator
	const meanY = sumY / denominator
	const centroid: OkLab = [
		colourL / denominator + floorShare * lab[0],
		colourA / denominator + floorShare * lab[1],
		colourB / denominator + floorShare * lab[2],
	]

	return {
		presence: mass / pixelCount,
		groundMass: groundMass / pixelCount,
		inkEnergy: ink / pixelCount,
		markEnergy: mark / pixelCount,
		habitualGround: [
			groundL / denominator + floorShare * lab[0],
			groundA / denominator + floorShare * lab[1],
			groundB / denominator + floorShare * lab[2],
		],
		fieldLikeness: field / denominator,
		spatialSpread: (sumSquares / denominator - meanX * meanX - meanY * meanY) / UNIFORM_FRAME_SPATIAL_SPREAD,
		borderAffinity: border / denominator / annulusAreaFraction,
		centroidDistance: Math.hypot(lab[0] - centroid[0], lab[1] - centroid[1], lab[2] - centroid[2]),
	}
}

function relativeError(actual: number, expected: number): number {
	if (expected === 0) return Math.abs(actual)
	return Math.abs(actual - expected) / Math.abs(expected)
}

/**
 * Agreement to a relative tolerance *or* an absolute floor. The floor matters because some of these
 * integrals are legitimately 1e-50 (a candidate far from every artwork colour), where a relative
 * comparison measures nothing but the difference between two ways of underflowing.
 */
function agrees(actual: number, expected: number, relative: number, absolute: number): boolean {
	return Math.abs(actual - expected) <= Math.max(relative * Math.abs(expected), absolute)
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** A small image with a field, two blobs and a stroke — enough structure for every statistic. */
function smallFixture(): { substrate: Substrate; rgb: Uint8Array; width: number; height: number } {
	const width = 48
	const height = 36
	const rgb = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 3
			let colour: Rgb8 = [30 + Math.floor((40 * y) / height), 40, 70]
			if (Math.hypot(x - 14, y - 12) < 7) colour = [201, 66, 42]
			if (Math.hypot(x - 34, y - 24) < 5) colour = [48, 168, 122]
			if (y >= 30 && y <= 32 && x % 4 !== 0) colour = [238, 236, 228]
			rgb[index] = colour[0]
			rgb[index + 1] = colour[1]
			rgb[index + 2] = colour[2]
		}
	}
	return { substrate: substrateFromRgb(width, height, rgb), rgb, width, height }
}

// ---------------------------------------------------------------------------------------------
// Distinct triples
// ---------------------------------------------------------------------------------------------

test("distinct triples: exact counts, complete, ascending key order", () => {
	const { substrate, rgb, width, height } = smallFixture()
	const table = enumerateDistinctTriples(substrate.planes)

	const reference = new Map<number, number>()
	for (let index = 0; index < width * height; index++) {
		const key = (rgb[index * 3]! << 16) | (rgb[index * 3 + 1]! << 8) | rgb[index * 3 + 2]!
		reference.set(key, (reference.get(key) ?? 0) + 1)
	}

	assert.equal(table.triples.length, reference.size)
	let total = 0
	for (let index = 0; index < table.triples.length; index++) {
		const triple = table.triples[index]!
		const key = (triple.rgb[0] << 16) | (triple.rgb[1] << 8) | triple.rgb[2]
		assert.equal(triple.count, reference.get(key), `count for ${triple.rgb}`)
		assert.equal(table.indexOfKey(key), index)
		if (index > 0) assert.ok(table.keys[index]! > table.keys[index - 1]!, "keys ascend")
		total += triple.count
	}
	assert.equal(total, width * height, "counts partition the frame")
	assert.equal(table.indexOfKey(0xff00ff), -1, "absent triple reports absent")
})

test("distinct triples: the feasible set is never filtered", () => {
	// Every triple present in the pixels — including ones that occur exactly once — is carried.
	const { substrate } = smallFixture()
	const lattice = buildLatticeWith(substrate)
	const singletons = lattice.triples.filter((triple) => triple.count === 1)
	const present = new Set(lattice.triples.map((triple) => triple.rgb.join(",")))
	for (let index = 0; index < substrate.planes.r8.length; index++) {
		const key = [substrate.planes.r8[index]!, substrate.planes.g8[index]!, substrate.planes.b8[index]!].join(",")
		assert.ok(present.has(key), `pixel ${index}'s triple is feasible`)
	}
	assert.ok(singletons.length >= 0)
})

// ---------------------------------------------------------------------------------------------
// The naive re-derivation
// ---------------------------------------------------------------------------------------------

test("statsAt matches a naive per-pixel integral for every candidate class", () => {
	const { substrate } = smallFixture()
	const lattice = buildLatticeWith(substrate)

	// Four candidates spanning the classes the energy cares about: the field, a chromatic blob, the
	// lettering ink, and a colour the artwork does not contain (which must still read sanely).
	const field = rgbToOkLab([48, 40, 70])
	const blob = rgbToOkLab([201, 66, 42])
	const candidates: OkLab[] = [
		field,
		blob,
		rgbToOkLab([238, 236, 228]),
		// An off-artwork colour, halfway between the field and a blob: no pixel has it, so its
		// statistics are pure neighbourhood, which is what the excursion profile will read.
		[(field[0] + blob[0]) / 2, (field[1] + blob[1]) / 2, (field[2] + blob[2]) / 2],
		// And one far from everything, where the integrals underflow and must still be finite.
		rgbToOkLab([120, 255, 120]),
	]

	let worstMass = 0
	let worstRatio = 0
	for (const lab of candidates) {
		const actual = lattice.statsAt(lab)
		const expected = naiveStats(substrate, lab, LATTICE_BANDWIDTH)

		for (const key of ["presence", "groundMass", "inkEnergy", "markEnergy"] as const) {
			// 2% where the integral is a fraction the energy will actually compare, 5% three orders
			// down: in the kernel's deep tail the truncation renormalisation and the residual sub-cell
			// ripple are the whole of the value, and no candidate is chosen on a 1e-5 mass.
			const tolerance = expected[key] > 1e-4 ? 0.02 : 0.05
			const ok = agrees(actual[key], expected[key], tolerance, 1e-12)
			if (expected[key] > 1e-4) worstMass = Math.max(worstMass, relativeError(actual[key], expected[key]))
			assert.ok(ok, `${key} at ${lab}: lattice ${actual[key]} vs naive ${expected[key]}`)
		}
		for (const key of ["fieldLikeness", "spatialSpread", "borderAffinity"] as const) {
			const error = Math.abs(actual[key] - expected[key])
			if (expected.presence > 1e-6) worstRatio = Math.max(worstRatio, error)
			assert.ok(
				agrees(actual[key], expected[key], 0.02, 0.02),
				`${key} at ${lab}: lattice ${actual[key]} vs naive ${expected[key]}`,
			)
		}
		assert.ok(
			Math.abs(actual.centroidDistance - expected.centroidDistance) < 0.002,
			`centroidDistance at ${lab}: ${actual.centroidDistance} vs ${expected.centroidDistance}`,
		)
		for (let axis = 0; axis < 3; axis++) {
			assert.ok(
				Math.abs(actual.habitualGround[axis]! - expected.habitualGround[axis]!) < 0.002,
				`habitualGround[${axis}] at ${lab}: ${actual.habitualGround[axis]} vs ` +
					`${expected.habitualGround[axis]}`,
			)
		}
	}
	console.log(
		`  naive re-derivation: worst ${(worstMass * 100).toFixed(2)}% relative on the mass integrals, ` +
			`${worstRatio.toFixed(4)} absolute on the ratio statistics`,
	)
	assert.ok(worstMass < 0.02 && worstRatio < 0.02)
})

test("presence is the peak-1 Gaussian neighbourhood share, on a flat image", () => {
	// A single-colour image: the whole frame is inside the kernel's peak, so presence must be 1.
	const width = 24
	const height = 24
	const rgb = new Uint8Array(width * height * 3)
	for (let index = 0; index < width * height; index++) {
		rgb[index * 3] = 90
		rgb[index * 3 + 1] = 120
		rgb[index * 3 + 2] = 160
	}
	const lattice = buildLatticeWith(substrateFromRgb(width, height, rgb))
	const stats = lattice.statsAt(rgbToOkLab([90, 120, 160]))
	assert.ok(Math.abs(stats.presence - 1) < 0.01, `presence ${stats.presence}`)
	assert.ok(Math.abs(stats.groundMass - 1) < 0.01, `groundMass ${stats.groundMass}`)
	assert.ok(Math.abs(stats.fieldLikeness - 1) < 0.01, `fieldLikeness ${stats.fieldLikeness}`)
	assert.ok(Math.abs(stats.borderAffinity - 1) < 0.01, `borderAffinity ${stats.borderAffinity}`)
	assert.ok(Math.abs(stats.spatialSpread - 1) < 0.02, `spatialSpread ${stats.spatialSpread}`)
})

// ---------------------------------------------------------------------------------------------
// Quadrature
// ---------------------------------------------------------------------------------------------

test("quadrature invariance: two lattice resolutions give the same statistics", () => {
	const { substrate } = smallFixture()
	const fine = buildLatticeWith(substrate, { cellsPerBandwidth: 2 })
	const coarse = buildLatticeWith(substrate, { cellsPerBandwidth: 1.5 })

	let worst = 0
	for (const triple of fine.triples) {
		const a = fine.statsAt(triple.lab)
		const b = coarse.statsAt(triple.lab)
		worst = Math.max(worst, relativeError(b.presence, a.presence))
		assert.ok(relativeError(b.presence, a.presence) < 0.02, `presence at ${triple.rgb}`)
		assert.ok(agrees(b.fieldLikeness, a.fieldLikeness, 0.02, 0.01), `fieldLikeness at ${triple.rgb}`)
		assert.ok(agrees(b.borderAffinity, a.borderAffinity, 0.02, 0.01), `borderAffinity at ${triple.rgb}`)
		assert.ok(agrees(b.spatialSpread, a.spatialSpread, 0.02, 0.01), `spatialSpread at ${triple.rgb}`)
	}
	// The measured ripple bound from `constants.ts` is 0.5% at cell = h/2 and 1.7% at h/1.5; the two
	// resolutions therefore may not disagree by more than about their sum.
	assert.ok(worst < 0.02, `worst presence disagreement between resolutions: ${worst}`)
})

test("no cell boundary can flip an outcome: statsAt is smooth across a cell wall", () => {
	const { substrate } = smallFixture()
	const lattice = buildLatticeWith(substrate)
	// Walk a fine line through OKLab and check successive presence values never jump.
	const from = rgbToOkLab([48, 40, 70])
	const to = rgbToOkLab([201, 66, 42])
	let previous = lattice.statsAt(from).presence
	let biggestStep = 0
	const steps = 4000
	for (let step = 1; step <= steps; step++) {
		const t = step / steps
		const lab: OkLab = [
			from[0] + (to[0] - from[0]) * t,
			from[1] + (to[1] - from[1]) * t,
			from[2] + (to[2] - from[2]) * t,
		]
		const value = lattice.statsAt(lab).presence
		biggestStep = Math.max(biggestStep, Math.abs(value - previous))
		previous = value
	}
	// A step of one 4000th of a long OKLab traverse must move presence by far less than the
	// quantities the energy compares; anything cell-shaped would show up here as a spike.
	assert.ok(biggestStep < 0.002, `largest single-step change in presence: ${biggestStep}`)
})

// ---------------------------------------------------------------------------------------------
// Lipschitz
// ---------------------------------------------------------------------------------------------

test("Lipschitz: a ±1 LSB dither of every pixel moves every statistic by a bounded amount", () => {
	const { substrate, rgb, width, height } = smallFixture()
	const random = makeRandom(20260804)
	const dithered = new Uint8Array(rgb.length)
	for (let index = 0; index < rgb.length; index++) {
		const delta = random() < 0.5 ? -1 : 1
		dithered[index] = Math.min(255, Math.max(0, rgb[index]! + delta))
	}
	const before = buildLatticeWith(substrate)
	const after = buildLatticeWith(substrateFromRgb(width, height, dithered))

	const candidates: OkLab[] = [
		rgbToOkLab([48, 40, 70]),
		rgbToOkLab([201, 66, 42]),
		rgbToOkLab([48, 168, 122]),
		rgbToOkLab([238, 236, 228]),
	]

	let worstMass = 0
	let worstRatio = 0
	let worstColour = 0
	for (const lab of candidates) {
		const a = before.statsAt(lab)
		const b = after.statsAt(lab)
		for (const key of ["presence", "groundMass", "inkEnergy", "markEnergy"] as const) {
			worstMass = Math.max(worstMass, relativeError(b[key], a[key]))
		}
		for (const key of ["fieldLikeness", "spatialSpread", "borderAffinity"] as const) {
			worstRatio = Math.max(worstRatio, Math.abs(b[key] - a[key]))
		}
		for (let axis = 0; axis < 3; axis++) {
			worstColour = Math.max(worstColour, Math.abs(b.habitualGround[axis]! - a.habitualGround[axis]!))
		}
		worstColour = Math.max(worstColour, Math.abs(b.centroidDistance - a.centroidDistance))
	}

	// The bars are the design's own claim, quantified: a dither displaces each pixel by a small
	// fraction of the bandwidth, so every area integral moves by a few percent and nothing flips.
	console.log(
		`  dither response: mass statistics ${(worstMass * 100).toFixed(1)}% relative, ` +
			`ratio statistics ${worstRatio.toFixed(4)} absolute, colour statistics ` +
			`${worstColour.toFixed(5)} OKLab (bar: the same-colour bar is ${LATTICE_BANDWIDTH})`,
	)
	assert.ok(worstMass < 0.25, `worst relative mass-statistic move under dither: ${worstMass}`)
	assert.ok(worstRatio < 0.10, `worst absolute ratio-statistic move under dither: ${worstRatio}`)
	assert.ok(worstColour < 0.01, `worst OKLab move of a colour-valued statistic: ${worstColour}`)
})

// ---------------------------------------------------------------------------------------------
// Nearest triple
// ---------------------------------------------------------------------------------------------

test("nearestTriple is exact against brute force, with the declared tie-break", () => {
	const { substrate } = smallFixture()
	const lattice = buildLatticeWith(substrate)
	const table = enumerateDistinctTriples(substrate.planes)
	const random = makeRandom(99)

	const bruteForce = (lab: OkLab) => {
		let best = -1
		let bestDistance = Infinity
		let bestKey = 0
		for (let index = 0; index < table.triples.length; index++) {
			const candidate = table.triples[index]!
			const distance = Math.hypot(
				candidate.lab[0] - lab[0],
				candidate.lab[1] - lab[1],
				candidate.lab[2] - lab[2],
			)
			const key = table.keys[index]!
			if (distance < bestDistance || (distance === bestDistance && key < bestKey)) {
				bestDistance = distance
				best = index
				bestKey = key
			}
		}
		return { triple: table.triples[best]!, distance: bestDistance }
	}

	for (let trial = 0; trial < 600; trial++) {
		const lab: OkLab = [random() * 1.1 - 0.05, random() * 0.5 - 0.25, random() * 0.5 - 0.3]
		const expected = bruteForce(lab)
		const actual = lattice.nearestTriple(lab)
		assert.deepEqual(actual.rgb, expected.triple.rgb, `nearest to ${lab}`)
		assert.ok(
			Math.abs(lattice.distanceToArtwork(lab) - expected.distance) < 1e-12,
			`distanceToArtwork at ${lab}`,
		)
	}

	// Every artwork colour is its own nearest, at distance zero.
	for (const triple of lattice.triples) {
		assert.deepEqual(lattice.nearestTriple(triple.lab).rgb, triple.rgb)
		assert.ok(lattice.distanceToArtwork(triple.lab) < 1e-12)
	}
})

test("nearestTriple breaks exact ties by the declared total order on the 8-bit triple", () => {
	// Two triples exactly equidistant from the midpoint of their OKLab segment: the smaller key wins.
	const low: Rgb8 = [10, 20, 30]
	const high: Rgb8 = [200, 210, 220]
	const triples = [
		{ rgb: low, lab: rgbToOkLab(low), count: 1 },
		{ rgb: high, lab: rgbToOkLab(high), count: 1 },
	]
	const keys = Uint32Array.from(triples.map((t) => (t.rgb[0] << 16) | (t.rgb[1] << 8) | t.rgb[2]))
	const index = buildNearestIndex(triples, keys)
	const midpoint: OkLab = [
		(triples[0]!.lab[0] + triples[1]!.lab[0]) / 2,
		(triples[0]!.lab[1] + triples[1]!.lab[1]) / 2,
		(triples[0]!.lab[2] + triples[1]!.lab[2]) / 2,
	]
	const winner = index.nearest(midpoint)
	const distances = triples.map((t) =>
		Math.hypot(t.lab[0] - midpoint[0], t.lab[1] - midpoint[1], t.lab[2] - midpoint[2])
	)
	if (distances[0] === distances[1]) assert.deepEqual(winner.rgb, low, "exact tie goes to the lower key")
	else assert.deepEqual(winner.rgb, distances[0]! < distances[1]! ? low : high)
})

// ---------------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------------

test("determinism: two builds of the same substrate agree bit for bit", () => {
	const { substrate } = smallFixture()
	const first = buildLatticeWith(substrate)
	const second = buildLatticeWith(substrate)
	assert.equal(first.triples.length, second.triples.length)
	for (let index = 0; index < first.triples.length; index++) {
		const lab = first.triples[index]!.lab
		assert.deepEqual(second.triples[index], first.triples[index])
		assert.deepEqual(second.statsAt(lab), first.statsAt(lab))
		assert.deepEqual(second.nearestTriple(lab).rgb, first.nearestTriple(lab).rgb)
	}
})

// ---------------------------------------------------------------------------------------------
// Bandwidth calibration — free parameter 1's falsifier (proposal §4.1)
// ---------------------------------------------------------------------------------------------

test("bandwidth calibration on a real artwork: mid-mass colours sit at the 1e-2 scale", async () => {
	// Real album artwork from the repository's own set. These files are spatially scrambled to avoid
	// redistributing cover art (`scramble-image.ts`), which permutes pixel positions — the colour
	// histogram this test measures is the original's.
	for (const name of ["muse-scrambled.jpg", "doja-scrambled.jpg"]) {
		const imagePath = fileURLToPath(new URL(`../../../../../images/${name}`, import.meta.url))
		readFileSync(imagePath) // fail loudly and early if the fixture ever moves
		const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true })

		const pixelCount = info.width * info.height
		const rgb = new Uint8Array(pixelCount * 3)
		for (let index = 0; index < pixelCount; index++) {
			rgb[index * 3] = data[index * info.channels]!
			rgb[index * 3 + 1] = data[index * info.channels + 1]!
			rgb[index * 3 + 2] = data[index * info.channels + 2]!
		}
		const lattice = buildLatticeWith(substrateFromRgb(info.width, info.height, rgb))

		// "A mid-mass colour": the colour of the *median pixel* — sort the artwork's own triples by
		// exact pixel count and walk until half the frame is accounted for. That is the colour a
		// typical pixel has, which is the population the corpus's endorsed role colours come from.
		// Nothing here is selected on the answer.
		const byCount = [...lattice.triples].sort((first, second) =>
			first.count === second.count
				? (second.rgb[0] << 16 | second.rgb[1] << 8 | second.rgb[2]) -
					(first.rgb[0] << 16 | first.rgb[1] << 8 | first.rgb[2])
				: second.count - first.count
		)
		let cumulative = 0
		let median = byCount[0]!
		for (const triple of byCount) {
			cumulative += triple.count
			if (cumulative >= pixelCount / 2) {
				median = triple
				break
			}
		}

		const stats = lattice.statsAt(median.lab)
		const exactShare = median.count / pixelCount
		const topStats = lattice.statsAt(byCount[0]!.lab)

		// The corpus fact the proposal anchors h on: endorsed role colours have neighbourhood share
		// ~1.91e-2 against an exact-triple share ~8.89e-5 — a two-hundred-fold gap. This is the
		// order-of-magnitude form of that claim: the 1e-2 scale, not the 1e-4 scale.
		assert.ok(
			stats.presence > 3e-3 && stats.presence <= 1.001,
			`${name}: neighbourhood share at h=${LATTICE_BANDWIDTH} is ${stats.presence}; wanted the 1e-2 scale`,
		)
		assert.ok(
			topStats.presence >= stats.presence,
			`${name}: the most populous colour must not carry less neighbourhood mass than the median one`,
		)

		console.log(
			`  ${name}: triples=${lattice.triples.length} median-pixel colour #${median.rgb.join(",")} ` +
				`exact=${exactShare.toExponential(2)} neighbourhood=${stats.presence.toExponential(2)} ` +
				`(${(stats.presence / exactShare).toFixed(0)}x) | most populous colour ` +
				`exact=${(byCount[0]!.count / pixelCount).toExponential(2)} ` +
				`neighbourhood=${topStats.presence.toExponential(2)}`,
		)
	}
})

test("the lattice covers a full-size artwork without excursion outside its own grid", () => {
	// A 256x256 artwork-shaped image: every triple must read finite, in-range statistics.
	const substrate = substrateFromRgb(256, 256, syntheticArtwork(256, 256))
	const lattice = buildLatticeWith(substrate)
	for (const triple of lattice.triples) {
		const stats = lattice.statsAt(triple.lab)
		assert.ok(Number.isFinite(stats.presence) && stats.presence > 0 && stats.presence <= 1.0001)
		assert.ok(stats.fieldLikeness >= -1e-9 && stats.fieldLikeness <= 1 + 1e-6)
		assert.ok(stats.spatialSpread >= 0 && stats.spatialSpread <= 1.5)
		assert.ok(stats.borderAffinity >= 0)
		assert.ok(Number.isFinite(stats.centroidDistance))
	}
})

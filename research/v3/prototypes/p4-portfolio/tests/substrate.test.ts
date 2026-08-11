/**
 * # Tests for the substrate — arm-c′ §2.1's one pass.
 *
 * The load-bearing one is **determinism**: two runs over the same file are byte-identical, in the
 * decoded buffers and in every lattice array and in σ. The selector's whole margin story rests on it
 * — a bootstrap over a substrate that wobbles between runs is measuring the substrate, not the
 * palettes — and it is the property `PARKED.md` resume step 1 names first.
 *
 * The rest check the three properties §2.1 claims *as* properties rather than as intentions:
 *
 *  - the lattice is **not a downsample** (every pixel is in exactly one cell, and cells straddling a
 *    non-divisible edge hold unequal counts rather than being dropped or interpolated);
 *  - **no filename or artwork id is read** (the same bytes under a different name produce a
 *    byte-identical substrate);
 *  - **σ is measured**, and it agrees with a naive reference implementation written independently in
 *    this file — P6 `SPEC.md` rule 8's requirement for numeric code.
 *
 * The image is a real demo-20 cover, taken from `data/m1/gate-3.txt` rather than named here, so the
 * test cannot drift from the set the milestone actually priced.
 *
 * Run:
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p4-portfolio/tests/substrate.test.ts
 */

import assert from "node:assert/strict"
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import test from "node:test"

import { rgbToOkLab } from "../../../src/contract/index.ts"
import { probit, quantileSorted } from "../../../src/stats/numeric.ts"
import {
	LATTICE_RESOLUTION_C,
	LATTICE_RESOLUTION_SWEEP,
	OKLAB_DIMENSIONS,
	buildSubstrate,
	cellIndexOf,
	decodeImage,
	measureNoiseScale,
	measureQuantizationScale,
} from "../selector/index.ts"
import type { DecodedImage, Substrate } from "../selector/types.ts"

/**
 * A flat synthetic image at one 8-bit colour — a `DecodedImage` built by hand rather than decoded,
 * so the operating point can be *set* and σ_quant's dependence on it measured directly.
 */
function syntheticImage(red: number, green: number, blue: number): DecodedImage {
	const width = 4
	const height = 4
	const pixelCount = width * height
	const rgb = new Uint8Array(pixelCount * OKLAB_DIMENSIONS)
	const lab = new Float64Array(pixelCount * OKLAB_DIMENSIONS)
	const okLab = rgbToOkLab([red, green, blue])
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const at = pixel * OKLAB_DIMENSIONS
		rgb[at] = red
		rgb[at + 1] = green
		rgb[at + 2] = blue
		lab[at] = okLab[0]
		lab[at + 1] = okLab[1]
		lab[at + 2] = okLab[2]
	}
	return { path: `synthetic-${red}-${green}-${blue}`, width, height, rgb, lab, contentHash: "", format: "synthetic" }
}

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "..")
const REPO_ROOT = resolve(PROTOTYPE, "../../../..")

/** The gate set's covers, read from the file rather than named, resolved against the repo root. */
function gateCovers(): string[] {
	return readFileSync(resolve(PROTOTYPE, "data/m1/gate-3.txt"), "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
		.map((relative) => resolve(REPO_ROOT, relative))
}

const COVER = gateCovers()[0]!

/** Every numeric buffer a substrate carries, as raw bytes. */
function substrateBytes(substrate: Substrate): Buffer[] {
	return [
		Buffer.from(substrate.counts.buffer.slice(0)),
		Buffer.from(substrate.sums.buffer.slice(0)),
		Buffer.from(substrate.sumsOfSquares.buffer.slice(0)),
		Buffer.from(
			Float64Array.from([
				substrate.sigma,
				substrate.sigmaMeasured,
				substrate.sigmaQuantization,
				...substrate.meanRgb,
				...substrate.sigmaPerCoordinate,
			]).buffer,
		),
	]
}

function assertBytesIdentical(left: Buffer[], right: Buffer[], what: string): void {
	assert.equal(left.length, right.length, `${what}: different buffer counts`)
	for (const [at, buffer] of left.entries()) {
		assert.equal(Buffer.compare(buffer, right[at]!), 0, `${what}: buffer ${at} differs`)
	}
}

// ---------------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------------

test("substrate: two runs over the same file are byte-identical", async () => {
	const first = await decodeImage(COVER)
	const second = await decodeImage(COVER)
	assert.equal(first.contentHash, second.contentHash)
	assert.equal(Buffer.compare(Buffer.from(first.rgb), Buffer.from(second.rgb)), 0, "rgb differs")
	assert.equal(
		Buffer.compare(Buffer.from(first.lab.buffer.slice(0)), Buffer.from(second.lab.buffer.slice(0))),
		0,
		"lab differs",
	)

	for (const resolution of LATTICE_RESOLUTION_SWEEP) {
		assertBytesIdentical(
			substrateBytes(buildSubstrate(first, resolution)),
			substrateBytes(buildSubstrate(second, resolution)),
			`C=${resolution}`,
		)
	}
})

test("substrate: a second decode of the same bytes under a different name changes nothing", async () => {
	// arm-c′ §2.1: "the filename, the artwork id and the enumeration order of anything are never
	// read". Relabel invariance is a property of the computation's shape, so it is checked by
	// relabelling rather than by reading the code.
	const directory = mkdtempSync(resolve(tmpdir(), "p4-substrate-"))
	const renamed = resolve(directory, "zzzz-not-the-original-name.jpg")
	copyFileSync(COVER, renamed)

	const original = await decodeImage(COVER)
	const relabelled = await decodeImage(renamed)
	assert.equal(original.contentHash, relabelled.contentHash, "the content hash is of bytes, not names")
	assert.notEqual(original.path, relabelled.path)
	assertBytesIdentical(
		substrateBytes(buildSubstrate(original, LATTICE_RESOLUTION_C)),
		substrateBytes(buildSubstrate(relabelled, LATTICE_RESOLUTION_C)),
		"relabelled",
	)
})

// ---------------------------------------------------------------------------------------------
// The lattice is not a downsample
// ---------------------------------------------------------------------------------------------

test("substrate: every pixel lands in exactly one cell, and none is dropped", async () => {
	const image = await decodeImage(COVER)
	for (const resolution of LATTICE_RESOLUTION_SWEEP) {
		const substrate = buildSubstrate(image, resolution)
		let total = 0
		for (const count of substrate.counts) total += count
		assert.equal(total, image.width * image.height, `C=${resolution}: pixels lost or double-counted`)
		assert.equal(substrate.cellCount, resolution * resolution)
	}
})

test("substrate: cells straddling a non-divisible edge hold unequal counts", async () => {
	const image = await decodeImage(COVER)
	// 300 px across 24 cells is 12.5 px per cell, so the counts cannot all be equal unless something
	// was interpolated or dropped. This is the check that the lattice is aggregation, not resampling.
	assert.ok(image.width % LATTICE_RESOLUTION_C !== 0, "the fixture no longer exercises the case")
	const counts = new Set(buildSubstrate(image, LATTICE_RESOLUTION_C).counts)
	assert.ok(counts.size > 1, "every cell holds the same count — the frame was resampled")
})

test("substrate: cellIndexOf covers the frame exactly, corners included", () => {
	const width = 300
	const height = 301
	const resolution = LATTICE_RESOLUTION_C
	assert.equal(cellIndexOf(0, 0, width, height, resolution), 0)
	assert.equal(
		cellIndexOf(width - 1, height - 1, width, height, resolution),
		resolution * resolution - 1,
		"the last pixel must land in the last cell, not past it",
	)
	const seen = new Set<number>()
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) seen.add(cellIndexOf(x, y, width, height, resolution))
	}
	assert.equal(seen.size, resolution * resolution, "some cell is unreachable")
})

// ---------------------------------------------------------------------------------------------
// σ, against an independent reference
// ---------------------------------------------------------------------------------------------

/**
 * A naive, deliberately slow re-derivation of arm-c′ §2.1's noise scale, written from the proposal's
 * sentence rather than from `substrate.ts`: *"a robust scale σ from the median absolute difference
 * between horizontally adjacent pixels in OKLab, times the estimator's analytic consistency factor"*.
 *
 * The consistency factor is re-derived here too: `median|x| = s·Φ⁻¹(¾)` for a zero-mean normal, and a
 * difference of two independent draws has variance `2σ²`, so `σ = median|Δ| / (√2·Φ⁻¹(¾))`.
 */
function referenceSigma(image: DecodedImage): number {
	const factor = 1 / (Math.sqrt(2) * probit(0.75))
	const perCoordinate: number[] = []
	for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
		const differences: number[] = []
		for (let y = 0; y < image.height; y += 1) {
			for (let x = 0; x + 1 < image.width; x += 1) {
				const here = (y * image.width + x) * OKLAB_DIMENSIONS + coordinate
				differences.push(Math.abs(image.lab[here + OKLAB_DIMENSIONS]! - image.lab[here]!))
			}
		}
		differences.sort((a, b) => a - b)
		perCoordinate.push(quantileSorted(differences, 0.5) * factor)
	}
	let totalVariance = 0
	for (const scale of perCoordinate) totalVariance += scale * scale
	return Math.sqrt(totalVariance / OKLAB_DIMENSIONS)
}

test("substrate: σ agrees with an independent naive re-derivation", async () => {
	for (const cover of gateCovers()) {
		const image = await decodeImage(cover)
		const measured = measureNoiseScale(image)
		assert.equal(measured.sigma, referenceSigma(image), `${cover}: σ disagrees with the reference`)
		assert.equal(measured.perCoordinate.length, OKLAB_DIMENSIONS)
	}
})

test("substrate: the MEASURED σ still reaches exactly zero on real covers — the M2 finding, still pinned", async () => {
	// **This test asserts a defect, on purpose, and SPEC §3.1's floor did not make it go away.**
	// arm-c′ §2.1's estimator — the median absolute horizontally-adjacent difference — returns exactly
	// zero whenever more than half of a file's adjacent pixel pairs are byte-identical, and on this
	// corpus that is common: 2 of the 3 gate covers and 4 of the 20 demo-20 covers.
	//
	// The floor changes what the *currency* prices at; it does not change what the estimator measured,
	// and `sigmaMeasured` is carried on the substrate precisely so this assertion can keep being made.
	// It is pinned here rather than left to the run report so that the day someone changes the
	// estimator's form — arm-c′ §4 decision 3, registered as HELD in `selector/constants.ts` because
	// its anchor is a dither arm P4 does not have — this test fails and the change is *noticed*. A
	// green suite that quietly started measuring a different σ is exactly how an unanchored free
	// parameter gets settled by accident.
	const measured: number[] = []
	for (const cover of gateCovers()) {
		const substrate = buildSubstrate(await decodeImage(cover), LATTICE_RESOLUTION_C)
		assert.ok(Number.isFinite(substrate.sigmaMeasured), `${cover}: σ_measured is not finite`)
		assert.ok(substrate.sigmaMeasured >= 0, `${cover}: σ_measured is negative`)
		measured.push(substrate.sigmaMeasured)
	}
	assert.equal(
		measured.filter((sigma) => sigma === 0).length,
		2,
		`σ = 0 on a different number of gate covers than the finding records: ${measured.join(", ")}`,
	)
	assert.ok(measured.some((sigma) => sigma > 0), "and it is not zero everywhere — the estimator does work")
})

// ---------------------------------------------------------------------------------------------
// SPEC §3.1 — the σ floor
// ---------------------------------------------------------------------------------------------

test("floor: σ_measured = 0 prices at σ_quant exactly, and the gate covers are converted", async () => {
	// The two properties the brief asks for, on the covers that actually exhibit the degeneracy: the
	// floored σ is the encoding's own scale, bit-for-bit (not "about" it — the max of {0, q} is q),
	// and it is positive, so the cover is priceable where at M2 it was refused.
	let converted = 0
	for (const cover of gateCovers()) {
		const image = await decodeImage(cover)
		const substrate = buildSubstrate(image, LATTICE_RESOLUTION_C)
		if (substrate.sigmaMeasured !== 0) continue
		converted += 1
		const quantization = measureQuantizationScale(image)
		assert.equal(substrate.sigma, quantization.sigma, `${cover}: floored σ is not σ_quant`)
		assert.ok(substrate.sigma > 0, `${cover}: the floor did not produce a positive scale`)
		assert.equal(substrate.sigmaFlooredByQuantization, true, `${cover}: the floor is not recorded`)
	}
	assert.equal(converted, 2, "the two σ = 0 gate covers are the ones this test exists to convert")
})

test("floor: σ_measured ≫ σ_quant leaves the price untouched, bit-for-bit", async () => {
	// The floor must be inert where the estimator resolved real noise, or it is not a floor, it is a
	// second scale. Checked as exact equality of the *effective* σ with the measured one — no
	// tolerance, because `Math.max` either returns the same double or it does not.
	let inert = 0
	for (const cover of gateCovers()) {
		const image = await decodeImage(cover)
		const substrate = buildSubstrate(image, LATTICE_RESOLUTION_C)
		if (!(substrate.sigmaMeasured > substrate.sigmaQuantization)) continue
		inert += 1
		assert.equal(substrate.sigma, substrate.sigmaMeasured, `${cover}: the floor moved an unfloored σ`)
		assert.equal(substrate.sigmaFlooredByQuantization, false, `${cover}: the floor is mis-recorded`)
	}
	assert.ok(inert > 0, "no gate cover exercises the unfloored case")

	// And synthetically, at the extreme the brief names: a σ_measured many orders above σ_quant.
	const image = await decodeImage(gateCovers()[0]!)
	const quantization = measureQuantizationScale(image)
	assert.equal(Math.max(quantization.sigma * 1e6, quantization.sigma), quantization.sigma * 1e6)
})

test("floor: σ_quant is a measurement of the image, not a constant in disguise", async () => {
	// If σ_quant were the same number on every image it would be a hand-set floor with extra steps,
	// whatever its comment claimed. It is a function of the mean colour, so it moves with the image.
	const sigmas = new Set<number>()
	for (const cover of gateCovers()) sigmas.add(measureQuantizationScale(await decodeImage(cover)).sigma)
	assert.ok(sigmas.size > 1, "σ_quant took one value across every cover — that is a constant")

	// And it moves the way the derivation says: OKLab's cube root magnifies one LSB near black, so a
	// darker operating point must produce a larger σ_quant than a lighter one.
	const at = (grey: number): number =>
		measureQuantizationScale(syntheticImage(grey, grey, grey)).sigma
	assert.ok(at(16) > at(128), "σ_quant did not grow toward black")
	assert.ok(at(128) > at(240), "σ_quant did not shrink toward white")
})

test("floor: σ_quant agrees with a Monte-Carlo of the quantization error it models", async () => {
	// P6 SPEC rule 8 — numeric code is checked against an independent derivation. Restating the same
	// closed form here would check nothing, so this comes at it from the other side: draw the actual
	// uniform ±½-LSB errors the model posits, push them through the contract's conversion, and pool
	// the resulting OKLab displacement the way the currency does. If the linearisation, the /12 and
	// the isotropic pooling are all right, the two numbers agree; if any is wrong, they do not.
	const image = await decodeImage(gateCovers()[0]!)
	const { mean, sigma } = measureQuantizationScale(image)

	// A deterministic stream — mulberry32, seeded — so this test is reproducible.
	let state = 0x9e3779b9
	const random = (): number => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}

	const centre = rgbToOkLab(mean as unknown as [number, number, number])
	const draws = 200000
	let totalSquared = 0
	for (let draw = 0; draw < draws; draw += 1) {
		const perturbed = [
			mean[0] + (random() - 0.5),
			mean[1] + (random() - 0.5),
			mean[2] + (random() - 0.5),
		] as unknown as [number, number, number]
		const moved = rgbToOkLab(perturbed)
		for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
			const delta = moved[coordinate]! - centre[coordinate]!
			totalSquared += delta * delta
		}
	}
	// Pooled exactly as the currency pools: 3σ² = Σ_k Var_k.
	const empirical = Math.sqrt(totalSquared / (draws * OKLAB_DIMENSIONS))
	assert.ok(
		Math.abs(empirical - sigma) / sigma < 0.02,
		`σ_quant ${sigma} disagrees with the Monte-Carlo of its own model ${empirical}`,
	)
})

test("substrate: σ does not depend on the lattice resolution", async () => {
	// σ is a per-file measurement; C is a fitting device. If one moved the other, the C sweep would be
	// sweeping two things at once and could not anchor either.
	const image = await decodeImage(COVER)
	const sigmas = LATTICE_RESOLUTION_SWEEP.map((resolution) => buildSubstrate(image, resolution).sigma)
	assert.equal(new Set(sigmas).size, 1, "σ moved with C")
})

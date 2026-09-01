/**
 * The perturbations, and the claim that they are deterministic.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/robustness-*.test.ts
 *
 * The dither is reproduced from v2-3's documented definition (commit `56506d0`,
 * `research/v2-3-experiments/resolution-pairs/`): a ±1 LSB checkerboard on the blue channel only.
 * These tests pin that definition, because a dither that quietly became "every channel" or "random
 * noise" would still produce a number — a number nobody could compare to v2-3's 0-of-114.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import sharp from "sharp"

import {
	ADDITIONAL_JPEG_QUALITIES,
	JPEG_CHROMA_SUBSAMPLING,
	PERTURBATION_ARMS,
	V2_3_REENCODE_QUALITY,
	armByName,
	cachePathFor,
	ditherBlueChannelLsb,
	jpegQualityOf,
	materializeArm,
} from "../src/robustness/perturb.ts"

test("the dither is a checkerboard on the blue channel, ±1, and touches nothing else", () => {
	// 2x2 RGB, mid grey everywhere.
	const width = 2
	const data = new Uint8Array([
		128, 128, 128, 128, 128, 128, //
		128, 128, 128, 128, 128, 128,
	])
	ditherBlueChannelLsb(data, width, 3)
	// (x+y) even -> +1, odd -> -1. Pixel order is (0,0) (1,0) (0,1) (1,1).
	assert.deepEqual([...data], [128, 128, 129, 128, 128, 127, 128, 128, 127, 128, 128, 129])
})

test("the dither clamps at the ends of the 8-bit range instead of wrapping", () => {
	// Pixel (0,0) gets +1 and is already 255; pixel (1,0) gets -1 and is already 0.
	const data = new Uint8Array([0, 0, 255, 0, 0, 0])
	ditherBlueChannelLsb(data, 2, 3)
	assert.equal(data[2], 255, "255 + 1 must clamp, not wrap to 0")
	assert.equal(data[5], 0, "0 - 1 must clamp, not wrap to 255")
})

test("the dither leaves alpha alone on RGBA input", () => {
	const data = new Uint8Array([10, 20, 30, 200, 10, 20, 30, 201])
	ditherBlueChannelLsb(data, 2, 4)
	assert.equal(data[0], 10)
	assert.equal(data[1], 20)
	assert.equal(data[2], 31, "blue moved")
	assert.equal(data[3], 200, "alpha untouched")
	assert.equal(data[7], 201, "alpha untouched")
})

test("the dither changes every pixel it is given", () => {
	// v2-3's result depended on the perturbation actually reaching all of the image.
	const width = 8
	const height = 8
	const data = new Uint8Array(width * height * 3).fill(100)
	const before = Uint8Array.from(data)
	ditherBlueChannelLsb(data, width, 3)
	let moved = 0
	for (let pixel = 0; pixel < width * height; pixel++) {
		if (data[pixel * 3 + 2] !== before[pixel * 3 + 2]) moved += 1
	}
	assert.equal(moved, width * height)
})

test("the dither refuses a buffer it cannot interpret", () => {
	assert.throws(() => ditherBlueChannelLsb(new Uint8Array([1, 2]), 1, 2), /at least 3 channels/)
	assert.throws(() => ditherBlueChannelLsb(new Uint8Array([1, 2, 3, 4]), 1, 3), /whole number of pixels/)
})

test("the arm list is the four arms, with the v2-3 anchor at quality 92", () => {
	assert.equal(PERTURBATION_ARMS.length, 4)
	assert.deepEqual(
		PERTURBATION_ARMS.map((arm) => arm.name),
		["jpeg-q92", "jpeg-q85", "jpeg-q75", "dither-lsb1"],
	)
	assert.equal(V2_3_REENCODE_QUALITY, 92)
	assert.equal(JPEG_CHROMA_SUBSAMPLING, "4:4:4")
	assert.deepEqual([...ADDITIONAL_JPEG_QUALITIES], [85, 75])
	assert.equal(jpegQualityOf("jpeg-q92"), 92)
	assert.equal(jpegQualityOf("jpeg-q75"), 75)
	assert.throws(() => jpegQualityOf("dither-lsb1"), /not a JPEG arm/)
	assert.throws(() => armByName("nope" as never), /unknown perturbation arm/)
})

test("each arm names its own baseline, and only the dither arm is lossless", () => {
	for (const arm of PERTURBATION_ARMS) {
		assert.equal(arm.baseline, arm.kind === "dither" ? "lossless" : "original")
	}
})

test("cache paths are stable, per-arm, and per-side", () => {
	const arm = armByName("jpeg-q92")
	const first = cachePathFor("/cache", "a".repeat(64), arm, "perturbed")
	const second = cachePathFor("/cache", "a".repeat(64), arm, "perturbed")
	assert.equal(first, second)
	assert.ok(first.includes("jpeg-q92"))
	assert.notEqual(first, cachePathFor("/cache", "b".repeat(64), arm, "perturbed"))
	assert.notEqual(first, cachePathFor("/cache", "a".repeat(64), armByName("jpeg-q85"), "perturbed"))
})

test("materialising an arm twice produces byte-identical files", async (t) => {
	const dir = await mkdtemp(path.join(tmpdir(), "robustness-perturb-"))
	t.after(async () => await rm(dir, { recursive: true, force: true }))

	// A small deterministic source image with enough structure to survive a re-encode.
	const width = 32
	const height = 32
	const pixels = Buffer.alloc(width * height * 3)
	for (let i = 0; i < width * height; i++) {
		pixels[i * 3] = (i * 7) % 256
		pixels[i * 3 + 1] = (i * 13) % 256
		pixels[i * 3 + 2] = (i * 29) % 256
	}
	const sourcePath = path.join(dir, "source.png")
	await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(sourcePath)
	const cacheDir = path.join(dir, "cache")

	for (const arm of PERTURBATION_ARMS) {
		const first = await materializeArm(sourcePath, "f".repeat(64), arm, cacheDir, true)
		const second = await materializeArm(sourcePath, "f".repeat(64), arm, cacheDir, true)
		assert.equal(first.perturbedSha256, second.perturbedSha256, `${arm.name} perturbed side is not deterministic`)
		assert.equal(first.baselineSha256, second.baselineSha256, `${arm.name} baseline side is not deterministic`)
		assert.equal(first.regenerated, true)

		// And the cached read path returns the same hashes without regenerating.
		const cached = await materializeArm(sourcePath, "f".repeat(64), arm, cacheDir, false)
		assert.equal(cached.regenerated, false)
		assert.equal(cached.perturbedSha256, first.perturbedSha256)
	}
})

test("the dither arm actually changes the file, and the two sides differ only by the dither", async (t) => {
	const dir = await mkdtemp(path.join(tmpdir(), "robustness-dither-"))
	t.after(async () => await rm(dir, { recursive: true, force: true }))

	const width = 16
	const height = 16
	const pixels = Buffer.alloc(width * height * 3, 120)
	const sourcePath = path.join(dir, "flat.png")
	await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(sourcePath)

	const arm = armByName("dither-lsb1")
	const result = await materializeArm(sourcePath, "e".repeat(64), arm, path.join(dir, "cache"), true)
	assert.notEqual(result.baselineSha256, result.perturbedSha256, "the dither must change the bytes")

	const baseline = await sharp(result.baselinePath).raw().toBuffer()
	const perturbed = await sharp(result.perturbedPath).raw().toBuffer()
	assert.equal(baseline.length, perturbed.length)
	for (let pixel = 0; pixel < width * height; pixel++) {
		assert.equal(baseline[pixel * 3], perturbed[pixel * 3], "red must not move")
		assert.equal(baseline[pixel * 3 + 1], perturbed[pixel * 3 + 1], "green must not move")
		assert.equal(Math.abs(perturbed[pixel * 3 + 2]! - baseline[pixel * 3 + 2]!), 1, "blue moves by exactly one")
	}
})

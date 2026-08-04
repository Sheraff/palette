/**
 * **Test and bench fixtures only — not part of the runtime path.**
 *
 * W1 owns `src/substrate/`, and this module deliberately does not anticipate it: the lattice is
 * specified against the `Substrate` *interface*, so its tests construct conforming `Substrate`
 * objects directly rather than depending on W1's builder. When W1 lands, the tests keep working and
 * this file stays a fixture generator; nothing in `src/lattice/` (other than the tests and the
 * bench) imports it.
 *
 * The figure–ground fields produced here are plausible, not authoritative — a small blur ladder with
 * the contract's (ΔL, ΔC, ΔH) decomposition. Every lattice test that asserts a *value* re-derives it
 * from these same arrays with a naive per-pixel integral, so the fixture's realism never enters an
 * assertion.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../../src/contract/constants.ts"
import type { FigureGroundField, ImagePlanes, Substrate, SurroundLadder } from "../types.ts"

/**
 * Repeated box blur by running sums — three passes approximate a Gaussian closely enough for a
 * fixture, at O(pixels) per pass rather than O(pixels × radius), which matters because the coarsest
 * ladder scale is half the short edge.
 */
function blurPlane(source: Float32Array, width: number, height: number, sigma: number): Float32Array {
	const radius = Math.max(1, Math.round(sigma * 0.9))
	const current = Float32Array.from(source)
	const scratch = new Float32Array(source.length)
	const prefix = new Float64Array(Math.max(width, height) + 1)

	for (let pass = 0; pass < 3; pass++) {
		for (let y = 0; y < height; y++) {
			const row = y * width
			prefix[0] = 0
			for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x]! + current[row + x]!
			for (let x = 0; x < width; x++) {
				const low = Math.max(0, x - radius)
				const high = Math.min(width - 1, x + radius)
				scratch[row + x] = (prefix[high + 1]! - prefix[low]!) / (high - low + 1)
			}
		}
		for (let x = 0; x < width; x++) {
			prefix[0] = 0
			for (let y = 0; y < height; y++) prefix[y + 1] = prefix[y]! + scratch[y * width + x]!
			for (let y = 0; y < height; y++) {
				const low = Math.max(0, y - radius)
				const high = Math.min(height - 1, y + radius)
				current[y * width + x] = (prefix[high + 1]! - prefix[low]!) / (high - low + 1)
			}
		}
	}
	return current
}

/** Build a conforming `Substrate` from raw interleaved 8-bit RGB. */
export function substrateFromRgb(width: number, height: number, rgb: Uint8Array): Substrate {
	const pixelCount = width * height
	const L = new Float32Array(pixelCount)
	const a = new Float32Array(pixelCount)
	const b = new Float32Array(pixelCount)
	const r8 = new Uint8Array(pixelCount)
	const g8 = new Uint8Array(pixelCount)
	const b8 = new Uint8Array(pixelCount)
	for (let index = 0; index < pixelCount; index++) {
		const red = rgb[index * 3]!
		const green = rgb[index * 3 + 1]!
		const blue = rgb[index * 3 + 2]!
		r8[index] = red
		g8[index] = green
		b8[index] = blue
		const lab = rgbToOkLab([red, green, blue])
		L[index] = lab[0]
		a[index] = lab[1]
		b[index] = lab[2]
	}
	const planes: ImagePlanes = { width, height, L, a, b, r8, g8, b8 }

	const shortEdge = Math.min(width, height)
	const sigmas: number[] = []
	for (let scale = 2; scale <= 64; scale *= 4) sigmas.push(Math.max(1, shortEdge / scale))
	const levels = sigmas.map((sigma) => ({
		L: blurPlane(L, width, height, sigma),
		a: blurPlane(a, width, height, sigma),
		b: blurPlane(b, width, height, sigma),
	}))
	const ladder: SurroundLadder = { sigmas, levels }

	const inkEnergy = new Float32Array(pixelCount)
	const markEnergy = new Float32Array(pixelCount)
	const fieldWeight = new Float32Array(pixelCount)
	for (let index = 0; index < pixelCount; index++) {
		let ink = 0
		let mark = 0
		let worst = 0
		for (const level of levels) {
			const deltaL = L[index]! - level.L[index]!
			const deltaA = a[index]! - level.a[index]!
			const deltaB = b[index]! - level.b[index]!
			const chroma = Math.hypot(a[index]!, b[index]!)
			const groundChroma = Math.hypot(level.a[index]!, level.b[index]!)
			const deltaC = chroma - groundChroma
			const planar = deltaA * deltaA + deltaB * deltaB
			const deltaH = Math.sqrt(Math.max(0, planar - deltaC * deltaC))
			ink += Math.abs(deltaL)
			mark += Math.hypot(deltaC, deltaH)
			worst = Math.max(worst, Math.hypot(deltaL, deltaA, deltaB))
		}
		inkEnergy[index] = ink / levels.length
		markEnergy[index] = mark / levels.length
		const relative = worst / POOLED_SAME_COLOR_BAR
		fieldWeight[index] = Math.exp(-relative * relative)
	}

	const coarsest = levels[0]!
	const figureGround: FigureGroundField = {
		fieldWeight,
		inkEnergy,
		markEnergy,
		ground: { L: coarsest.L, a: coarsest.a, b: coarsest.b },
	}

	return { planes, ladder, figureGround }
}

/** A deterministic 32-bit LCG — no `Math.random` anywhere in this campaign. */
export function makeRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 4294967296
	}
}

/**
 * An artwork-shaped synthetic: a two-colour vertical field ramp, three chromatic blobs, a band of
 * lettering-like strokes, and a light ±1 LSB dither so the triple count is realistic rather than
 * trivially small.
 */
export function syntheticArtwork(width: number, height: number, seed = 7): Uint8Array {
	const random = makeRandom(seed)
	const rgb = new Uint8Array(width * height * 3)
	const blobs = [
		{ x: 0.28, y: 0.34, r: 0.16, c: [214, 58, 39] },
		{ x: 0.71, y: 0.26, r: 0.11, c: [39, 132, 214] },
		{ x: 0.52, y: 0.72, r: 0.09, c: [244, 196, 48] },
	]
	for (let y = 0; y < height; y++) {
		const v = y / Math.max(1, height - 1)
		for (let x = 0; x < width; x++) {
			const u = x / Math.max(1, width - 1)
			let red = 26 + 54 * v
			let green = 32 + 46 * v
			let blue = 48 + 62 * v
			for (const blob of blobs) {
				const distance = Math.hypot(u - blob.x, v - blob.y)
				if (distance < blob.r) {
					red = blob.c[0]!
					green = blob.c[1]!
					blue = blob.c[2]!
				}
			}
			// Lettering band: bright strokes on the lower third.
			if (v > 0.84 && v < 0.92 && (Math.floor(u * 34) % 3 !== 0)) {
				red = 236
				green = 236
				blue = 230
			}
			const index = (y * width + x) * 3
			rgb[index] = Math.min(255, Math.max(0, Math.round(red + (random() < 0.5 ? 0 : 1))))
			rgb[index + 1] = Math.min(255, Math.max(0, Math.round(green + (random() < 0.5 ? 0 : 1))))
			rgb[index + 2] = Math.min(255, Math.max(0, Math.round(blue + (random() < 0.5 ? 0 : 1))))
		}
	}
	return rgb
}

/** The lattice's worst case: colours spread over the whole sRGB gamut, so the grid is largest. */
export function fullGamutNoise(width: number, height: number, seed = 11): Uint8Array {
	const random = makeRandom(seed)
	const rgb = new Uint8Array(width * height * 3)
	for (let index = 0; index < rgb.length; index++) rgb[index] = Math.floor(random() * 256)
	return rgb
}

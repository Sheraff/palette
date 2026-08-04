/**
 * Decode, refuse transparency, and convert to OKLab planes — proposal §2.0.
 *
 * Three commitments, all of them inherited rather than invented here:
 *
 * 1. **Dimensions come from the header**, never the filename (`CONVENTIONS.md`; 719 AVIFs in
 *    `music-artworks/` disagree with their own names). Full resolution, no resample.
 * 2. **Genuinely transparent input is refused loudly** (`PHASE_0_DECISIONS.md` §4 invariant 5,
 *    proposal §2.0). An alpha channel that is uniformly opaque is not transparency and is accepted.
 *    The proposal's fixed-point matte for the alpha case is deliberately *not* implemented: it needs
 *    a palette to matte with, so it belongs to the solver's outer loop, not to decode. Refusal is
 *    the same policy the toy candidate ships, and it is the safe half of the proposal's rule.
 * 3. **The 8-bit triples survive intact.** `r8/g8/b8` are the only values a published colour may
 *    come from (invariant 2); the OKLab planes are measurement, never publication.
 *
 * ## The exactness claim, stated precisely
 *
 * `SRGB_TO_LINEAR` is a 256-entry **memo of the contract's own gamma decode**, evaluated at the only
 * 256 inputs an 8-bit channel can take, so it is exact rather than approximate. The OKLab arithmetic
 * below is character-for-character the contract's `rgbToOkLab` — same coefficients, same order of
 * operations, same `Math.cbrt` — evaluated in float64 and stored to Float32Array. The result is
 * therefore `Math.fround(rgbToOkLab(triple)[c])` **exactly**, which is what
 * `tests/substrate.test.ts` asserts. The contract is the vocabulary of record (SPEC rule 2) and a
 * second conversion that merely agreed to some tolerance would be a fork.
 */

import sharp from "sharp"
import type { ImagePlanes } from "../types.ts"
import { SRGB_TABLE_SIZE } from "./constants.ts"

/**
 * Thrown when the substrate refuses an input. Named by `types.ts` (`BuildSubstrate` "throws
 * SubstrateRefusal on real transparency"); it also carries the other refusals decode can reach —
 * a missing header, an unusable channel count — because every one of them must surface as a failed
 * row rather than a silent skip.
 */
export class SubstrateRefusal extends Error {
	override readonly name = "SubstrateRefusal"
}

/**
 * sRGB→linear at the 256 inputs an 8-bit channel can take.
 *
 * Float64, because the OKLab arithmetic downstream must reproduce the contract's float64 result
 * before it is rounded to float32 — memoising in float32 would round twice and break the exactness
 * claim above.
 */
export const SRGB_TO_LINEAR: Float64Array = buildSrgbToLinearTable()

function buildSrgbToLinearTable(): Float64Array {
	const table = new Float64Array(SRGB_TABLE_SIZE)
	for (let value = 0; value < SRGB_TABLE_SIZE; value += 1) {
		const channel = value / 255
		// Character-for-character `src/contract/color.ts:srgbChannelToLinear`. Do not "simplify".
		table[value] = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	}
	return table
}

/** OKLab of one linear-light triple. The contract's `rgbToOkLab` minus its gamma decode. */
export function linearToOkLab(red: number, green: number, blue: number): [number, number, number] {
	const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
	const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
	const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	]
}

/**
 * Convert three linear-light planes to three OKLab planes, in place of allocation-per-pixel.
 *
 * Used for every rung of the surround ladder as well as for the source image, so that the ladder's
 * OKLab and the image's OKLab cannot drift apart: one code path, one set of coefficients.
 */
export function linearPlanesToOkLab(
	red: Float32Array,
	green: Float32Array,
	blue: Float32Array,
	outL: Float32Array,
	outA: Float32Array,
	outB: Float32Array,
): void {
	const count = red.length
	for (let index = 0; index < count; index += 1) {
		const r = red[index]
		const g = green[index]
		const b = blue[index]
		const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
		const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
		const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
		outL[index] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
		outA[index] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
		outB[index] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
	}
}

/** What `decodePlanes` hands the ladder: the published-colour planes plus the linear light to blur. */
export type DecodedSubstrate = Readonly<{
	planes: ImagePlanes
	/** Linear-light sRGB planes, row-major. The ladder blurs these (proposal §2.1), never OKLab. */
	linear: Readonly<{ red: Float32Array; green: Float32Array; blue: Float32Array }>
	/** Header format string, for the candidate's `sourceRendition` metadata. */
	format: string
}>

/**
 * Decode one image file into planes.
 *
 * One pass over the raw buffer does all of it: the alpha refusal, the 8-bit copy, the linear-light
 * planes and the OKLab planes. The alternative — a pass per job — is four sweeps of a megapixel
 * array for no gain, and this is the stage the proposal prices at ≈70 ms of its ≈400 ms budget.
 */
export async function decodePlanes(imagePath: string): Promise<DecodedSubstrate> {
	const image = sharp(imagePath)
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new SubstrateRefusal(`no header dimensions for ${imagePath}`)
	}

	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new SubstrateRefusal(`unsupported channel count ${channels} for ${imagePath}`)
	}
	// The header is authoritative for geometry, so a decode that disagrees with it is a refusal and
	// not a silent reinterpretation — the whole reason the rule exists is that something is lying.
	if (info.width !== metadata.width || info.height !== metadata.height) {
		throw new SubstrateRefusal(
			`decode geometry ${info.width}x${info.height} disagrees with header ` +
				`${metadata.width}x${metadata.height} for ${imagePath}`,
		)
	}

	const width = metadata.width
	const height = metadata.height
	const count = width * height

	const r8 = new Uint8Array(count)
	const g8 = new Uint8Array(count)
	const b8 = new Uint8Array(count)
	const linearRed = new Float32Array(count)
	const linearGreen = new Float32Array(count)
	const linearBlue = new Float32Array(count)
	const L = new Float32Array(count)
	const a = new Float32Array(count)
	const b = new Float32Array(count)

	for (let index = 0, offset = 0; index < count; index += 1, offset += channels) {
		// Invariant 5. A genuinely transparent pixel is refused, never flattened onto an invented
		// background — the matte would silently decide what the image is (proposal §2.0).
		if (channels === 4 && data[offset + 3] !== 255) {
			throw new SubstrateRefusal(
				`${imagePath} has at least one transparent pixel; the contract refuses transparent input`,
			)
		}
		const red = data[offset]
		const green = data[offset + 1]
		const blue = data[offset + 2]
		r8[index] = red
		g8[index] = green
		b8[index] = blue

		const rl = SRGB_TO_LINEAR[red]
		const gl = SRGB_TO_LINEAR[green]
		const bl = SRGB_TO_LINEAR[blue]
		linearRed[index] = rl
		linearGreen[index] = gl
		linearBlue[index] = bl

		const lCone = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl)
		const mCone = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl)
		const sCone = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl)
		L[index] = 0.2104542553 * lCone + 0.7936177850 * mCone - 0.0040720468 * sCone
		a[index] = 1.9779984951 * lCone - 2.4285922050 * mCone + 0.4505937099 * sCone
		b[index] = 0.0259040371 * lCone + 0.7827717662 * mCone - 0.8086757660 * sCone
	}

	return {
		planes: { width, height, L, a, b, r8, g8, b8 },
		linear: { red: linearRed, green: linearGreen, blue: linearBlue },
		format: metadata.format ?? "unknown",
	}
}

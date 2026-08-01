import { APCAcontrast, sRGBtoY } from "apca-w3";

import type { OKLab, RGB } from "./types.ts";

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value))

function srgbToLinear(value: number): number {
	const channel = value / 255
	return channel <= 0.04045
		? channel / 12.92
		: ((channel + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
	const channel = value <= 0.0031308
		? 12.92 * value
		: 1.055 * value ** (1 / 2.4) - 0.055
	return Math.round(clamp(channel) * 255)
}

export function rgbToOKLab([red, green, blue]: RGB): OKLab {
	const r = srgbToLinear(red)
	const g = srgbToLinear(green)
	const b = srgbToLinear(blue)

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

export function oklabToRGB([lightness, a, b]: OKLab): RGB {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

	return [
		linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	]
}

export function okDistance(first: OKLab, second: OKLab): number {
	return Math.hypot(
		first[0] - second[0],
		first[1] - second[1],
		first[2] - second[2],
	)
}

export function chroma([, a, b]: OKLab): number {
	return Math.hypot(a, b)
}

const CIELAB_WHITE_POINT = Object.freeze([0.95047, 1, 1.08883] as const)
const CIELAB_TOE_LIMIT = 216 / 24389
const CIELAB_TOE_SLOPE = 841 / 108
const CIELAB_TOE_OFFSET = 4 / 29

function cielabTransfer(ratio: number): number {
	return ratio > CIELAB_TOE_LIMIT ? Math.cbrt(ratio) : CIELAB_TOE_SLOPE * ratio + CIELAB_TOE_OFFSET
}

/**
 * CIELAB (D65), used *only* as a same-colour-or-not ruler. See `perceptualDifference`.
 */
function rgbToCIELab([red, green, blue]: RGB): readonly [number, number, number] {
	const r = srgbToLinear(red)
	const g = srgbToLinear(green)
	const b = srgbToLinear(blue)

	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / CIELAB_WHITE_POINT[0]
	const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / CIELAB_WHITE_POINT[1]
	const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / CIELAB_WHITE_POINT[2]

	const fx = cielabTransfer(x)
	const fy = cielabTransfer(y)
	const fz = cielabTransfer(z)

	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * CIE76 colour difference, in ΔE units, between two rendered sRGB colours.
 *
 * OKLab is this codebase's working space and stays that way: it is the better space for
 * *interpolation* and for the family/neighbourhood geometry everything else is built on. But it
 * is the wrong ruler for the single question "would a viewer call these the same colour?",
 * because its cube-root transfer has unbounded derivative at zero and therefore inflates
 * differences between near-black colours. Measured over neutral greys, one 8-bit code-value
 * step spans `okDistance` 0.0672 at level 0 but only 0.0030 at level 254 — a 22.6x swing — so a
 * single OKLab threshold is simultaneously far too strict in the shadows and too loose in the
 * highlights. CIELAB's piecewise transfer has a linear toe below `CIELAB_TOE_LIMIT` precisely to
 * bound that derivative; the same sweep moves only between ΔE 0.27 and 0.49.
 *
 * ΔE is also the scale the perceptual literature states just-noticeable differences on, which is
 * what lets a threshold here be read off human judgements instead of tuned.
 */
export function perceptualDifference(first: RGB, second: RGB): number {
	const a = rgbToCIELab(first)
	const b = rgbToCIELab(second)
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function apcaContrast(foreground: RGB, background: RGB): number {
	return APCAcontrast(sRGBtoY(foreground), sRGBtoY(background))
}

export function rgbToHex([red, green, blue]: RGB): string {
	return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`
}

export function mixOKLab(first: OKLab, second: OKLab, amount: number): OKLab {
	const t = clamp(amount)
	return [
		first[0] + (second[0] - first[0]) * t,
		first[1] + (second[1] - first[1]) * t,
		first[2] + (second[2] - first[2]) * t,
	]
}

export function rgbAt(data: Uint8Array, pixelIndex: number): RGB {
	const offset = pixelIndex * 3
	return [data[offset], data[offset + 1], data[offset + 2]]
}

export function labAt(labs: Float32Array, pixelIndex: number): OKLab {
	const offset = pixelIndex * 3
	return [labs[offset], labs[offset + 1], labs[offset + 2]]
}

/**
 * `rgbToOKLab` for a whole image, without the two arrays per pixel.
 *
 * The body below is `rgbToOKLab` inlined — same constants, same operations, in the same order —
 * because this runs once per pixel of a full-resolution artwork and the call was allocating both
 * an RGB tuple to pass in and an OKLab tuple to hand back, several million times per extraction.
 * Keep the arithmetic here identical to `rgbToOKLab`: reassociating it would move the low bits.
 */
export function toLabBuffer(data: Uint8Array): Float32Array {
	const labs = new Float32Array(data.length)
	for (let offset = 0; offset < data.length; offset += 3) {
		const r = srgbToLinear(data[offset])
		const g = srgbToLinear(data[offset + 1])
		const b = srgbToLinear(data[offset + 2])

		const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
		const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
		const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

		labs[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
		labs[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
		labs[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	}
	return labs
}

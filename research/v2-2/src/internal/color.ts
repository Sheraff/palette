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

export function toLabBuffer(data: Uint8Array): Float32Array {
	const labs = new Float32Array(data.length)
	for (let offset = 0; offset < data.length; offset += 3) {
		const lab = rgbToOKLab([data[offset], data[offset + 1], data[offset + 2]])
		labs[offset] = lab[0]
		labs[offset + 1] = lab[1]
		labs[offset + 2] = lab[2]
	}
	return labs
}

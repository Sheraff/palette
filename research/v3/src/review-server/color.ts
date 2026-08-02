/// <reference path="../../../src/colornames-oklab.d.ts" />
/**
 * Presentation-only color naming for the review UI.
 *
 * Every color the reviewer sees carries its `colornames-oklab` name alongside the hex
 * (CONVENTIONS.md, REVIEW_UI.md §3). These names are labels for humans and agents; they never
 * feed extraction, scoring, or any recorded judgement.
 */
import { closest } from "colornames-oklab"

export type Rgb = readonly [red: number, green: number, blue: number]
export type OKLab = readonly [lightness: number, a: number, b: number]

const HEX_PATTERN = /^#[0-9a-f]{6}$/u

/** Lowercase `#rrggbb`, or throw. The UI and the warehouse both use this normal form. */
export function normalizeHex(value: unknown): string {
	if (typeof value !== "string") throw new TypeError(`Color must be a string, got ${typeof value}`)
	const hex = value.trim().toLowerCase()
	if (!HEX_PATTERN.test(hex)) throw new TypeError(`Color must be #rrggbb, got ${JSON.stringify(value)}`)
	return hex
}

export function hexToRgb(hex: string): Rgb {
	const normalized = normalizeHex(hex)
	return [
		Number.parseInt(normalized.slice(1, 3), 16),
		Number.parseInt(normalized.slice(3, 5), 16),
		Number.parseInt(normalized.slice(5, 7), 16),
	]
}

function srgbToLinear(channel: number): number {
	const value = channel / 255
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * sRGB to OKLab. Coefficients [INHERITED] — Björn Ottosson's published matrices, same values as
 * `research/src/color.ts` in this repository (kept local so this workstream stands alone).
 */
export function rgbToOKLab([red, green, blue]: Rgb): OKLab {
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

/**
 * Nearest name for every hex, keyed by lowercase hex. Not `unique: true`: two roles that really
 * are near-identical must read as near-identical, not be pushed apart by the naming pass.
 */
export function nameHexes(hexes: Iterable<string>): Record<string, string> {
	const unique = [...new Set([...hexes].map(normalizeHex))].sort()
	if (unique.length === 0) return {}
	const matches = closest(unique.map((hex) => rgbToOKLab(hexToRgb(hex))))
	const names: Record<string, string> = {}
	for (const [index, hex] of unique.entries()) names[hex] = matches[index].name
	return names
}

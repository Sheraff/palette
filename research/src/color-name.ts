/**
 * Presentation-only nearest color labels for visible HTML and terminal output.
 *
 * These subjective names must not feed extraction, scoring, validation,
 * selection, or any other algorithm evidence.
 */
import { closest } from "colornames-oklab"
import type { ClosestColorName } from "colornames-oklab"
import { rgbToHex, rgbToOKLab } from "./color.ts"
import type { OKLab, RGB } from "./types.ts"

export type ColorNameTier = "srgb" | "p3" | "rec2020"

export type ColorNameResult = Readonly<{
	name: string
	tier: ColorNameTier
	referenceHex: string
	referenceOKLab: OKLab
	distance: number
}>

export type ColorPresentationDescriptor = Readonly<{
	sourceHex: string
	nearestName: string
	nearest: ColorNameResult
}>

function assertOKLab(value: OKLab): void {
	if (
		!Array.isArray(value) ||
		value.length !== 3 ||
		!Number.isFinite(value[0]) ||
		!Number.isFinite(value[1]) ||
		!Number.isFinite(value[2])
	) {
		throw new TypeError("OKLab must contain exactly three finite numbers")
	}
}

function assertRGB(value: RGB): void {
	if (
		!Array.isArray(value) ||
		value.length !== 3 ||
		!Number.isInteger(value[0]) ||
		!Number.isInteger(value[1]) ||
		!Number.isInteger(value[2]) ||
		value[0] < 0 || value[0] > 255 ||
		value[1] < 0 || value[1] > 255 ||
		value[2] < 0 || value[2] > 255
	) {
		throw new TypeError("RGB must contain exactly three integers from 0 through 255")
	}
}

function toColorNameResult(result: ClosestColorName): ColorNameResult {
	return {
		name: result.name,
		tier: result.tier,
		referenceHex: result.hex,
		referenceOKLab: [result.oklab[0], result.oklab[1], result.oklab[2]],
		distance: result.distance,
	}
}

function toPresentationDescriptor(rgb: RGB, nearest: ColorNameResult): ColorPresentationDescriptor {
	return {
		sourceHex: rgbToHex(rgb),
		nearestName: nearest.name,
		nearest,
	}
}

export function nameOKLab(value: OKLab): ColorNameResult {
	assertOKLab(value)
	return toColorNameResult(closest(value))
}

export function nameRGB(value: RGB): ColorPresentationDescriptor {
	assertRGB(value)
	return toPresentationDescriptor(value, nameOKLab(rgbToOKLab(value)))
}

export function namePalette(values: readonly RGB[]): ColorPresentationDescriptor[] {
	if (!Array.isArray(values)) throw new TypeError("Palette must be an array of RGB colors")
	for (const value of values) assertRGB(value)
	if (values.length === 0) return []

	const matches = closest(values.map(rgbToOKLab)).map(toColorNameResult)
	return values.map((value, index) => toPresentationDescriptor(value, matches[index]))
}

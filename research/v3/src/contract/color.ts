/**
 * Colour maths for the v3 contract: sRGB ↔ OKLab, the one ruler, and APCA with the raw pre-clamp
 * value exposed.
 *
 * Two things here are deliberate and worth stating up front.
 *
 * 1. **OKLab is the only colour space this contract measures distance in.** `PHASE_0_DECISIONS.md`
 *    §3: one ruler, used for agreement, movement and distinctness alike, and it is the same space
 *    the rest of the maths already lives in. CIE76's known weaknesses sit exactly in our
 *    dark/near-neutral range, which is where album artwork spends most of its time.
 *
 * 2. **APCA is reimplemented rather than imported.** The `apca-w3` package exports only the clamped
 *    Lc, and `PHASE_0_DECISIONS.md` §4 invariant 4 needs the raw pre-clamp number: Lc reports 0 for
 *    everything below ~7.3 and therefore cannot distinguish "truly invisible" from "very low but
 *    real". The constants are copied verbatim from the package's `SA98G` table (see
 *    `constants.ts`), and `contract-color.test.ts` cross-checks our clamped output against the
 *    package over a grid of colour pairs. That test is what makes the copy safe.
 */

import {
	APCA_G4G,
	APCA_LC_TO_RAW_OFFSET,
	HEX_COLOR_PATTERN,
	LC_DEAD_BAND_CEILING,
	SAME_COLOR_BAR,
} from "./constants.ts"
import type { HexColor, OkLab, PaletteColor, Rgb8 } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// sRGB representation
// ---------------------------------------------------------------------------------------------

/** Thrown when a value that claims to be a contract colour is not one. */
export class ColorFormatError extends Error {
	override readonly name = "ColorFormatError"
	constructor(message: string) {
		super(message)
	}
}

/** True when every channel is an integer in 0..255 — what "an exact source pixel" means. */
export function isRgb8(value: unknown): value is Rgb8 {
	if (!Array.isArray(value) || value.length !== 3) return false
	return value.every((channel) =>
		typeof channel === "number" && Number.isInteger(channel) && channel >= 0 && channel <= 255
	)
}

/** True when the string is in this contract's canonical hex form: `#rrggbb`, lowercase. */
export function isHexColor(value: unknown): value is HexColor {
	return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
}

/**
 * Assert a string into the canonical hex form. Accepts only what `isHexColor` accepts — uppercase
 * and shorthand are rejected rather than normalized, because invariant 3's sanctioned collapses are
 * defined as exact string equality and a forgiving parser here would make "exact" negotiable.
 */
export function hex(value: string): HexColor {
	if (!isHexColor(value)) {
		throw new ColorFormatError(`not a canonical #rrggbb lowercase hex color: ${JSON.stringify(value)}`)
	}
	return value
}

export function rgbToHex(rgb: Rgb8): HexColor {
	if (!isRgb8(rgb)) throw new ColorFormatError(`not an 8-bit sRGB triple: ${JSON.stringify(rgb)}`)
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}` as HexColor
}

export function hexToRgb(value: HexColor): Rgb8 {
	const canonical = hex(value)
	return [
		Number.parseInt(canonical.slice(1, 3), 16),
		Number.parseInt(canonical.slice(3, 5), 16),
		Number.parseInt(canonical.slice(5, 7), 16),
	]
}

/**
 * Build a contract colour from an exact source pixel. The hex is derived, never supplied, so a
 * palette cannot carry an rgb triple and a hex that disagree.
 */
export function colorFromRgb(rgb: Rgb8): PaletteColor {
	return { rgb, hex: rgbToHex(rgb) }
}

/** Build a contract colour from a canonical hex string. */
export function colorFromHex(value: string): PaletteColor {
	const canonical = hex(value)
	return { rgb: hexToRgb(canonical), hex: canonical }
}

/** Exact equality, which is the only equality invariant 3's sanctioned collapses accept. */
export function colorsExactlyEqual(first: PaletteColor, second: PaletteColor): boolean {
	return first.hex === second.hex
}

// ---------------------------------------------------------------------------------------------
// OKLab
// ---------------------------------------------------------------------------------------------

/**
 * sRGB gamma decode, per the sRGB specification. Input and output are 0..1.
 *
 * Note this is *not* APCA's transfer function — APCA uses a plain 2.4 exponent as a display
 * emulation, deliberately unlike the sRGB piecewise curve. The two live side by side in this file
 * and must not be merged.
 */
function srgbChannelToLinear(channel: number): number {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function linearChannelToSrgb(channel: number): number {
	return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

/**
 * sRGB → OKLab, Ottosson's direct formulation (linear sRGB → LMS → cube root → Lab).
 * Numerically equivalent to routing through XYZ as `colorjs.io` and the repository's
 * `conversion.ts` do; `contract-color.test.ts` asserts agreement with `colorjs.io` to 1e-6.
 */
export function rgbToOkLab(rgb: Rgb8): OkLab {
	const r = srgbChannelToLinear(rgb[0] / 255)
	const g = srgbChannelToLinear(rgb[1] / 255)
	const b = srgbChannelToLinear(rgb[2] / 255)

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	]
}

/**
 * OKLab → sRGB, rounded to 8-bit and clipped. Present for round-trip tests and for rendering; the
 * contract itself never invents a colour, it only ever republishes exact source pixels.
 */
export function okLabToRgb(lab: OkLab): Rgb8 {
	const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3
	const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3
	const s = (lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2]) ** 3

	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
	]

	return linear.map((channel) => {
		const encoded = linearChannelToSrgb(channel)
		return Math.min(255, Math.max(0, Math.round(encoded * 255)))
	}) as unknown as Rgb8
}

export function okLabFromColor(color: PaletteColor): OkLab {
	return rgbToOkLab(color.rgb)
}

/**
 * **The one ruler.** Euclidean distance in OKLab (`PHASE_0_DECISIONS.md` §3). Every distinctness,
 * agreement and movement question in v3 goes through this function and no other.
 */
export function okLabDistance(first: OkLab, second: OkLab): number {
	return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

/** The ruler, applied to two published colours. */
export function colorDistance(first: PaletteColor, second: PaletteColor): number {
	return okLabDistance(okLabFromColor(first), okLabFromColor(second))
}

/**
 * Are these two colours the same colour, by the one ruler at the same-colour bar?
 * `SAME_COLOR_BAR` is `[UNCALIBRATED]` — see `constants.ts`.
 */
export function sameColor(first: PaletteColor, second: PaletteColor, bar: number = SAME_COLOR_BAR): boolean {
	return colorDistance(first, second) < bar
}

// ---------------------------------------------------------------------------------------------
// APCA
// ---------------------------------------------------------------------------------------------

/**
 * sRGB → APCA luminance Y. APCA's own transfer function: a flat 2.4 exponent, deliberately not the
 * sRGB piecewise curve. Matches `apca-w3`'s `sRGBtoY` exactly.
 */
export function rgbToApcaY(rgb: Rgb8): number {
	const exponent = (channel: number) => (channel / 255) ** APCA_G4G.mainTRC
	return APCA_G4G.sRco * exponent(rgb[0]) +
		APCA_G4G.sGco * exponent(rgb[1]) +
		APCA_G4G.sBco * exponent(rgb[2])
}

/** APCA's black soft clamp and flare compensation. Part of the perceptual model, not an output clamp. */
function softClampBlack(y: number): number {
	return y > APCA_G4G.blkThrs ? y : y + (APCA_G4G.blkThrs - y) ** APCA_G4G.blkClmp
}

/**
 * **Raw pre-clamp APCA contrast**, signed, on the same ×100 scale as Lc.
 *
 * This is `SAPC * 100` in `apca-w3`'s vocabulary: the black soft clamp is applied (it is part of the
 * perceptual model), the polarity branch is chosen exactly as the package chooses it, and then
 * *neither* output clamp is applied — not the `deltaYmin` early return, not the `loClip` cutoff, not
 * the offset subtraction. What comes back is what APCA computed before it decided the number was too
 * small to report.
 *
 * Sign follows APCA's convention: negative means light text on a dark background.
 *
 * Two properties matter for invariant 4 and are asserted in `contract-color.test.ts`:
 *
 * - Two *identical* colours do not return 0. The reverse branch raises the background to 0.65 and
 *   the text to 0.62, so identical inputs leave a luminance-dependent residue peaking at
 *   |raw| = 1.9815 (`APCA_RAW_IDENTICAL_CEILING`). Any zero-contrast epsilon must clear that or the
 *   invariant would not flag a literally identical pair.
 * - `|raw| < 10` is exactly the region where `apca-w3` reports Lc 0.
 *
 * Returns `NaN` for inputs APCA considers out of range, so a caller cannot mistake an error for a
 * zero. (`apca-w3` returns 0.0 there, which would read as "invisible" to invariant 4.)
 */
export function apcaRaw(text: Rgb8, background: Rgb8): number {
	const textY = rgbToApcaY(text)
	const backgroundY = rgbToApcaY(background)
	if (!Number.isFinite(textY) || !Number.isFinite(backgroundY)) return Number.NaN

	const t = softClampBlack(textY)
	const b = softClampBlack(backgroundY)

	const sapc = b > t
		? (b ** APCA_G4G.normBG - t ** APCA_G4G.normTXT) * APCA_G4G.scaleBoW
		: (b ** APCA_G4G.revBG - t ** APCA_G4G.revTXT) * APCA_G4G.scaleWoB

	return sapc * 100
}

/**
 * **Clamped APCA Lc**, the public unit — signed, and byte-for-byte what `apca-w3@0.1.9`'s
 * `APCAcontrast(sRGBtoY(text), sRGBtoY(background))` returns. Reimplemented here so that Lc and raw
 * come from one code path; `contract-color.test.ts` proves the equality on a colour grid.
 */
export function apcaLc(text: Rgb8, background: Rgb8): number {
	const textY = rgbToApcaY(text)
	const backgroundY = rgbToApcaY(background)

	// Input range check, matching the package's `icp` guard.
	if (
		Number.isNaN(textY) || Number.isNaN(backgroundY) ||
		Math.min(textY, backgroundY) < 0 || Math.max(textY, backgroundY) > 1.1
	) return 0

	const t = softClampBlack(textY)
	const b = softClampBlack(backgroundY)

	if (Math.abs(b - t) < APCA_G4G.deltaYmin) return 0

	if (b > t) {
		const sapc = (b ** APCA_G4G.normBG - t ** APCA_G4G.normTXT) * APCA_G4G.scaleBoW
		return (sapc < APCA_G4G.loClip ? 0 : sapc - APCA_G4G.loBoWoffset) * 100
	}
	const sapc = (b ** APCA_G4G.revBG - t ** APCA_G4G.revTXT) * APCA_G4G.scaleWoB
	return (sapc > -APCA_G4G.loClip ? 0 : sapc + APCA_G4G.loWoBoffset) * 100
}

/** The ruler's APCA counterparts, applied to published colours. */
export function apcaRawBetween(text: PaletteColor, background: PaletteColor): number {
	return apcaRaw(text.rgb, background.rgb)
}

export function apcaLcBetween(text: PaletteColor, background: PaletteColor): number {
	return apcaLc(text.rgb, background.rgb)
}

/**
 * Convert a caller's requested contrast floor from the public unit (Lc magnitude) into the internal
 * raw magnitude the invariants actually compare against.
 *
 * `PHASE_0_DECISIONS.md` §2: the public unit is Lc, evaluated internally as
 * `max(requested_raw, ε_raw)`. Above the dead band the conversion is exact and symmetric in
 * polarity — `|raw| = |Lc| + 2.7`. Below it there is nothing to convert: Lc cannot express any
 * magnitude in (0, 7.3), so a request of 0 (the default) carries no information and resolves to the
 * epsilon. Returning 0 here and letting `max` pick the epsilon is the whole mechanism.
 */
export function lcFloorToRawMagnitude(requestedLc: number): number {
	const magnitude = Math.abs(requestedLc)
	if (!Number.isFinite(magnitude)) {
		throw new ColorFormatError(`contrast floor must be a finite Lc value, got ${requestedLc}`)
	}
	if (magnitude < LC_DEAD_BAND_CEILING) return 0
	return magnitude + APCA_LC_TO_RAW_OFFSET
}

/**
 * Resolve a requested Lc floor against an epsilon, in raw units. This is the single place where
 * "always set, default = minimum = ε, callers may only raise the floor" is implemented.
 */
export function resolveContrastFloor(requestedLc: number, epsilonRaw: number): number {
	return Math.max(lcFloorToRawMagnitude(requestedLc), epsilonRaw)
}

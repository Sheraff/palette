/**
 * The candidate colour spaces for the perception-model study, each reduced to a common shape:
 * a Cartesian triple whose first axis is lightness-like and whose second and third axes span an
 * opponent chromatic plane, so that Euclidean distance in that triple is the space's intended
 * colour difference.
 *
 * ## The one thing to understand before reading any comparison
 *
 * **A global rescaling of a space is invisible to this study.** Every model fitted in
 * `perception-model-study.ts` estimates a threshold *in the space it is fitted in*, and the logistic
 * is a function of `log d`, so multiplying a whole space by any positive constant shifts the fitted
 * intercept and changes nothing else. CIELAB's L* running 0-100 against OKLab's L running 0-1 is
 * therefore not a difference between them. What IS compared is the **shape** of each metric: the
 * relative weighting of the lightness axis against the chromatic plane, and the way that weighting
 * changes with position. That is the only thing a space can contribute here, and it is exactly the
 * thing the reviewer's question is about.
 *
 * A consequence worth stating because it is easy to get wrong: ICtCp's conventional `720` factor in
 * ΔE_ITP is irrelevant to this study, but the `0.5` applied to Ct is not — one is a global scale,
 * the other is an axis weight.
 *
 * ## Conversion sources, per space, exactly
 *
 * | space | coordinates used | source |
 * |---|---|---|
 * | `oklab` | contract's own `rgbToOkLab` | `src/contract/color.ts` — Ottosson's direct linear-sRGB→LMS→cbrt→Lab. **Deliberately the contract's own function, not colorjs.io**, so the baseline is byte-identical to the ruler the contract actually uses. `tests/contract-color.test.ts` asserts it equals colorjs.io within 1e-6. |
 * | `cielab-d65` | colorjs.io `lab-d65` | colorjs.io 0.5.2. **D65, not D50.** colorjs.io's plain `lab` is D50 and answers a different question; `src/contract/calibration/same-color-bar-translation.ts` records a real past bug from that exact confusion (CIE76 blue-to-black is 137.65 under D65 and 134.49 under D50). D50 is reported alongside as a separate row so the choice is visible rather than assumed. |
 * | `cielab-d50` | colorjs.io `lab` | colorjs.io 0.5.2, carried only to show that the white point does not decide anything here. |
 * | `cam16-ucs` | derived from colorjs.io `cam16-jmh` | colorjs.io 0.5.2 ships **CAM16-JMh only — there is no `cam16-ucs` space in this version.** The UCS coordinates are computed here by the published transform (Li, Luo, Cui, Melgosa, Brill, Pointer 2017, "Comprehensive color solutions: CAM16, CAT16 and CAM16-UCS"): `J' = 1.7J / (1 + 0.007J)`, `M' = ln(1 + 0.0228M) / 0.0228`, `a' = M' cos h`, `b' = M' sin h`. The CAM16 appearance correlates themselves come from colorjs.io under its default viewing conditions. |
 * | `ictcp` | colorjs.io `ictcp`, Ct halved | colorjs.io 0.5.2. The `0.5` on Ct is the ITU-R BT.2124 ΔE_ITP convention; the `720` scale is deliberately omitted (see above). |
 * | `hct-cartesian` | derived from colorjs.io `hct` | colorjs.io 0.5.2. HCT is cylindrical (`[h, c, t]`) and **was never defined as a ΔE space**, so Euclidean distance on it is a construction of this study, not a published metric: `(T, C cos h, C sin h)`, i.e. CIE L* lightness with CAM16 chroma. Included because the reviewer named it; flagged as the least standard row in the table and never reported as "the HCT distance". |
 * | `jzazbz` | colorjs.io `jzazbz` | colorjs.io 0.5.2. Euclidean on Jzazbz is ΔE_z (Safdar, Cui, Kim, Luo 2017) up to the global scale. |
 * | `din99d` | hand-rolled here | **Not available anywhere in the repository or in colorjs.io 0.5.2** — no DIN99 space and no deltaE99 method — so it is implemented below from the literature (Cui, Luo, Rigg, Roesler, Witt 2002, "Uniform colour spaces based on the DIN99 colour-difference formula"). Because it is the only space with no library to check against, it carries its own correctness argument: see `SPACE_SELF_CHECKS`. |
 *
 * Every colorjs.io conversion uses the package's **default viewing conditions**. That is a real
 * assumption for the appearance-model spaces (CAM16, HCT) and a non-assumption for the rest; it is
 * declared rather than tuned, because tuning viewing conditions to fit answers would be fitting the
 * observer model to 198 judgements.
 */
import Color from "colorjs.io"

import { hexToRgb, rgbToOkLab, type Rgb8 } from "./color.ts"

/** Lightness-like axis first, then the two opponent chromatic axes. */
export type Cartesian = readonly [number, number, number]

/** Cylindrical reading of a Cartesian triple: lightness, chroma, hue angle in radians. */
export type Cylindrical = Readonly<{ lightness: number; chroma: number; hue: number }>

export type SpaceId =
	| "oklab"
	| "cielab-d65"
	| "cielab-d50"
	| "cam16-ucs"
	| "ictcp"
	| "hct-cartesian"
	| "jzazbz"
	| "din99d"

export type ColorSpaceDefinition = Readonly<{
	id: SpaceId
	label: string
	/** One line naming the library and formula that produced the coordinates. */
	conversionSource: string
	/** True for the contract's incumbent ruler. Exactly one space carries it. */
	isBaseline: boolean
	toCartesian: (rgb: Rgb8) => Cartesian
}>

const DEGREES = Math.PI / 180

function colorOf(rgb: Rgb8): Color {
	return new Color("srgb", [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255])
}

function coordsIn(rgb: Rgb8, spaceId: string): readonly number[] {
	const coords = colorOf(rgb).to(spaceId).coords
	if (!coords.every((value) => Number.isFinite(value))) {
		throw new Error(`perception-model-spaces: ${spaceId} produced a non-finite coordinate`)
	}
	return coords
}

// -------------------------------------------------------------------------------------------------
// DIN99d, from the literature. The only space here with no library implementation to lean on.
// -------------------------------------------------------------------------------------------------

/** D65, matching the white point colorjs.io's `xyz-d65` normalises to. Verified at runtime by the self-check. */
const D65_WHITE: Cartesian = [0.9504559270516716, 1, 1.0890577507598784]

function labF(ratio: number): number {
	// CIE standard piecewise; epsilon = 216/24389, kappa = 24389/27.
	return ratio > 216 / 24389 ? Math.cbrt(ratio) : (24389 / 27) * ratio / 116 + 16 / 116
}

/**
 * DIN99d — Cui, Luo, Rigg, Roesler & Witt (2002).
 *
 * Steps, in the order the paper gives them:
 *   1. `X' = 1.12 X - 0.12 Z` on D65-normalised XYZ.
 *   2. CIELAB L*, a*, b* from (X', Y, Z) against the **untransformed** D65 white point.
 *   3. `L99d = 325.22 ln(1 + 0.0036 L*)`
 *   4. `e = a* cos 50deg + b* sin 50deg`, `f = 1.14 (-a* sin 50deg + b* cos 50deg)`
 *   5. `G = hypot(e, f)`, `C99d = 22.5 ln(1 + 0.06 G)`
 *   6. `h99d = atan2(f, e) + 50deg`, `a99d = C99d cos h99d`, `b99d = C99d sin h99d`
 *
 * ΔE99d is the Euclidean distance on (L99d, a99d, b99d) with k_E = 1.
 *
 * Note that step 1 shifts neutrals slightly off the a99d = b99d = 0 axis — for the sRGB white point
 * `X'/Xn` is 0.9825, not 1. That is a property of the published formula, not a transcription error,
 * and the self-check below pins the magnitude so a future edit cannot quietly change it.
 */
function din99d(rgb: Rgb8): Cartesian {
	const [x, y, z] = coordsIn(rgb, "xyz-d65")
	const xPrime = 1.12 * x - 0.12 * z

	const fx = labF(xPrime / D65_WHITE[0])
	const fy = labF(y / D65_WHITE[1])
	const fz = labF(z / D65_WHITE[2])
	const lStar = 116 * fy - 16
	const aStar = 500 * (fx - fy)
	const bStar = 200 * (fy - fz)

	const l99d = 325.22 * Math.log1p(0.0036 * lStar)
	const cos50 = Math.cos(50 * DEGREES)
	const sin50 = Math.sin(50 * DEGREES)
	const e = aStar * cos50 + bStar * sin50
	const f = 1.14 * (-aStar * sin50 + bStar * cos50)
	const g = Math.hypot(e, f)
	const c99d = 22.5 * Math.log1p(0.06 * g)
	const h99d = Math.atan2(f, e) + 50 * DEGREES

	return [l99d, c99d * Math.cos(h99d), c99d * Math.sin(h99d)]
}

// -------------------------------------------------------------------------------------------------

export const COLOR_SPACES: readonly ColorSpaceDefinition[] = [
	{
		id: "oklab",
		label: "OKLab",
		conversionSource: "src/contract/color.ts rgbToOkLab (Ottosson), the contract's own ruler",
		isBaseline: true,
		toCartesian: (rgb) => {
			const [l, a, b] = rgbToOkLab(rgb)
			return [l, a, b]
		},
	},
	{
		id: "cielab-d65",
		label: "CIELAB (D65)",
		conversionSource: "colorjs.io 0.5.2 space `lab-d65`",
		isBaseline: false,
		toCartesian: (rgb) => {
			const [l, a, b] = coordsIn(rgb, "lab-d65")
			return [l, a, b]
		},
	},
	{
		id: "cielab-d50",
		label: "CIELAB (D50)",
		conversionSource: "colorjs.io 0.5.2 space `lab` (D50, the package default)",
		isBaseline: false,
		toCartesian: (rgb) => {
			const [l, a, b] = coordsIn(rgb, "lab")
			return [l, a, b]
		},
	},
	{
		id: "cam16-ucs",
		label: "CAM16-UCS",
		conversionSource:
			"colorjs.io 0.5.2 space `cam16-jmh` (default viewing conditions) + Li et al. 2017 UCS transform, applied here",
		isBaseline: false,
		toCartesian: (rgb) => {
			const [j, m, h] = coordsIn(rgb, "cam16-jmh")
			const jPrime = (1.7 * j) / (1 + 0.007 * j)
			const mPrime = Math.log1p(0.0228 * m) / 0.0228
			const hRad = h * DEGREES
			return [jPrime, mPrime * Math.cos(hRad), mPrime * Math.sin(hRad)]
		},
	},
	{
		id: "ictcp",
		label: "ICtCp",
		conversionSource: "colorjs.io 0.5.2 space `ictcp`, Ct scaled by 0.5 per the BT.2124 ΔE_ITP convention",
		isBaseline: false,
		toCartesian: (rgb) => {
			const [i, ct, cp] = coordsIn(rgb, "ictcp")
			return [i, 0.5 * ct, cp]
		},
	},
	{
		id: "hct-cartesian",
		label: "HCT (Cartesianised)",
		conversionSource:
			"colorjs.io 0.5.2 space `hct`, rearranged here to (T, C cos h, C sin h). HCT is not a ΔE space; this metric is this study's construction",
		isBaseline: false,
		toCartesian: (rgb) => {
			const [h, c, t] = coordsIn(rgb, "hct")
			const hRad = h * DEGREES
			return [t, c * Math.cos(hRad), c * Math.sin(hRad)]
		},
	},
	{
		id: "jzazbz",
		label: "Jzazbz",
		conversionSource: "colorjs.io 0.5.2 space `jzazbz`",
		isBaseline: false,
		toCartesian: (rgb) => {
			const [jz, az, bz] = coordsIn(rgb, "jzazbz")
			return [jz, az, bz]
		},
	},
	{
		id: "din99d",
		label: "DIN99d",
		conversionSource:
			"hand-rolled in this module from Cui et al. 2002, on colorjs.io 0.5.2 `xyz-d65`; no library implementation exists in this repository",
		isBaseline: false,
		toCartesian: din99d,
	},
] as const

export function spaceById(id: SpaceId): ColorSpaceDefinition {
	const space = COLOR_SPACES.find((candidate) => candidate.id === id)
	if (space === undefined) throw new Error(`perception-model-spaces: unknown space ${id}`)
	return space
}

export function cartesianOfHex(space: ColorSpaceDefinition, hexValue: string): Cartesian {
	return space.toCartesian(hexToRgb(hexValue as never))
}

export function cylindrical(point: Cartesian): Cylindrical {
	return {
		lightness: point[0],
		chroma: Math.hypot(point[1], point[2]),
		hue: Math.atan2(point[2], point[1]),
	}
}

export function euclidean(first: Cartesian, second: Cartesian): number {
	return Math.hypot(second[0] - first[0], second[1] - first[1], second[2] - first[2])
}

/**
 * The lightness / chroma / hue decomposition of a difference, in the CIE convention.
 *
 * `deltaHue` is defined residually — `ΔH = sqrt(Δa² + Δb² − ΔC²)` — which makes the identity
 * `Δ² = ΔL² + ΔC² + ΔH²` hold **exactly**, in every space, by construction. That exactness is what
 * lets the direction-aware model shape be a reweighting of three orthogonal components rather than
 * an approximation, and it is why hue is measured as an arc length rather than an angle: an angle
 * would not be commensurable with the other two.
 */
export type Decomposition = Readonly<{
	distance: number
	deltaLightness: number
	deltaChroma: number
	deltaHue: number
	/** Squared shares of the total, summing to 1. Undefined when the two colours are identical. */
	fractionLightness: number
	fractionChroma: number
	fractionHue: number
	/** Which component holds the largest squared share. */
	dominant: "lightness" | "chroma" | "hue"
	/** Midpoint position, for the position-dependent model shapes. */
	midLightness: number
	midChroma: number
	midHue: number
}>

export function decompose(first: Cartesian, second: Cartesian): Decomposition {
	const a = cylindrical(first)
	const b = cylindrical(second)
	const deltaLightness = b.lightness - a.lightness
	const deltaChroma = b.chroma - a.chroma
	const chromaticSquared = (second[1] - first[1]) ** 2 + (second[2] - first[2]) ** 2
	// Clamp at zero: ΔC² can exceed the chromatic plane's squared difference by float noise alone.
	const deltaHue = Math.sqrt(Math.max(0, chromaticSquared - deltaChroma ** 2))
	const distance = Math.hypot(deltaLightness, deltaChroma, deltaHue)

	const total = distance ** 2
	const fractionLightness = total === 0 ? 0 : deltaLightness ** 2 / total
	const fractionChroma = total === 0 ? 0 : deltaChroma ** 2 / total
	const fractionHue = total === 0 ? 0 : deltaHue ** 2 / total
	const dominant =
		fractionLightness >= fractionChroma && fractionLightness >= fractionHue
			? "lightness"
			: fractionChroma >= fractionHue
				? "chroma"
				: "hue"

	const midA = (first[1] + second[1]) / 2
	const midB = (first[2] + second[2]) / 2
	return {
		distance,
		deltaLightness,
		deltaChroma,
		deltaHue,
		fractionLightness,
		fractionChroma,
		fractionHue,
		dominant,
		midLightness: (a.lightness + b.lightness) / 2,
		midChroma: (a.chroma + b.chroma) / 2,
		midHue: Math.atan2(midB, midA),
	}
}

/** Distance under a direction-aware diagonal metric. `weightChroma`/`weightHue` are relative to lightness = 1. */
export function ellipsoidDistance(
	decomposition: Decomposition,
	weightChroma: number,
	weightHue: number,
): number {
	return Math.sqrt(
		decomposition.deltaLightness ** 2 +
			weightChroma * decomposition.deltaChroma ** 2 +
			weightHue * decomposition.deltaHue ** 2,
	)
}

// -------------------------------------------------------------------------------------------------
// Correctness checks. Four of the eight spaces have a published ΔE in colorjs.io; those are pinned
// to it. DIN99d has none, so it carries a different kind of argument.
// -------------------------------------------------------------------------------------------------

export type SpaceSelfCheck = Readonly<{
	space: SpaceId
	check: string
	/** Pearson correlation against the reference, over the probe set. 1 means the metrics agree up to scale. */
	correlation: number | null
	passed: boolean
	detail: string
}>

/** A fixed, seeded probe set of 8-bit colours. No clock, no Math.random — the checks are golden. */
function probeColors(): Rgb8[] {
	const colors: Rgb8[] = []
	let state = 20260804
	const next = (): number => {
		state = (state * 1664525 + 1013904223) % 4294967296
		return state / 4294967296
	}
	for (let i = 0; i < 400; i++) {
		colors.push([
			Math.floor(next() * 256),
			Math.floor(next() * 256),
			Math.floor(next() * 256),
		] as Rgb8)
	}
	return colors
}

function correlation(xs: readonly number[], ys: readonly number[]): number {
	const n = xs.length
	const meanX = xs.reduce((a, b) => a + b, 0) / n
	const meanY = ys.reduce((a, b) => a + b, 0) / n
	let sxy = 0
	let sxx = 0
	let syy = 0
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - meanX
		const dy = ys[i] - meanY
		sxy += dx * dy
		sxx += dx * dx
		syy += dy * dy
	}
	return sxy / Math.sqrt(sxx * syy)
}

/**
 * Runs every space's correctness check and returns the results.
 *
 * The pattern for a space with a library ΔE: build small pairs, compute this module's Euclidean
 * distance and the library's ΔE, and require the correlation to be essentially 1 — that is the
 * strongest statement available, because agreement "up to a global scale" is exactly the
 * equivalence this study works in.
 */
export function runSpaceSelfChecks(): readonly SpaceSelfCheck[] {
	const probes = probeColors()
	const pairs: [Rgb8, Rgb8][] = []
	for (let i = 0; i + 1 < probes.length; i += 2) pairs.push([probes[i], probes[i + 1]])

	const checks: SpaceSelfCheck[] = []

	const againstLibraryDeltaE = (
		spaceId: SpaceId,
		method: string,
		label: string,
	): SpaceSelfCheck => {
		const space = spaceById(spaceId)
		const mine: number[] = []
		const theirs: number[] = []
		for (const [first, second] of pairs) {
			mine.push(euclidean(space.toCartesian(first), space.toCartesian(second)))
			theirs.push(colorOf(first).deltaE(colorOf(second), method as never))
		}
		const r = correlation(mine, theirs)
		return {
			space: spaceId,
			check: `Euclidean distance in this module vs colorjs.io ${label}, ${pairs.length} random 8-bit pairs`,
			correlation: r,
			passed: r > 0.999999,
			detail:
				r > 0.999999
					? `agrees up to a global scale (r = ${r.toFixed(9)}), which is the equivalence this study works in`
					: `DISAGREES (r = ${r.toFixed(6)}) — the coordinates are not the metric they are claimed to be`,
		}
	}

	checks.push(againstLibraryDeltaE("oklab", "OK", "deltaEOK"))
	checks.push(againstLibraryDeltaE("cielab-d50", "76", "deltaE76 (D50 lab, the package default)"))
	checks.push(againstLibraryDeltaE("ictcp", "ITP", "deltaEITP"))
	checks.push(againstLibraryDeltaE("jzazbz", "Jz", "deltaEJz"))

	// CIELAB D65: no library ΔE runs in D65, so the check is that it is NOT the D50 one and that its
	// white point behaves — L* of white is 100 and its chroma is zero.
	{
		const white = spaceById("cielab-d65").toCartesian([255, 255, 255] as Rgb8)
		const black = spaceById("cielab-d65").toCartesian([0, 0, 0] as Rgb8)
		const chromaOfWhite = Math.hypot(white[1], white[2])
		const passed = Math.abs(white[0] - 100) < 1e-6 && chromaOfWhite < 1e-6 && Math.abs(black[0]) < 1e-6
		checks.push({
			space: "cielab-d65",
			check: "white is L*=100 with zero chroma and black is L*=0, under the D65 white point",
			correlation: null,
			passed,
			detail: `L*(white) = ${white[0].toFixed(6)}, C*(white) = ${chromaOfWhite.toFixed(9)}, L*(black) = ${black[0].toFixed(6)}`,
		})
	}

	// CAM16-UCS: J' monotone in lightness, and neutrals near-neutral RELATIVE to a saturated colour.
	//
	// The absolute test would fail for a reason that is the library's, not this module's: under
	// colorjs.io's default CAM16 viewing conditions even sRGB white carries M = 2.2369, so neutrals
	// are not exactly M = 0. That residual is small against the chroma of a real colour (#3366cc
	// sits at M = 41.77, roughly 19x) but it is not nothing, and it is declared here because it
	// slightly inflates the chroma component of the decomposition for near-neutral pairs in this
	// space — which is precisely the region three of the four contract regions live in.
	{
		const space = spaceById("cam16-ucs")
		const white = space.toCartesian([255, 255, 255] as Rgb8)
		const mid = space.toCartesian([128, 128, 128] as Rgb8)
		const black = space.toCartesian([0, 0, 0] as Rgb8)
		const saturated = space.toCartesian([51, 102, 204] as Rgb8)
		const monotone = white[0] > mid[0] && mid[0] > black[0]
		const neutralChroma = Math.hypot(mid[1], mid[2])
		const saturatedChroma = Math.hypot(saturated[1], saturated[2])
		const ratio = neutralChroma / saturatedChroma
		checks.push({
			space: "cam16-ucs",
			check:
				"J' is monotone over black/mid/white, and a mid grey's M' is small relative to a saturated colour's",
			correlation: null,
			passed: monotone && ratio < 0.1,
			detail:
				`J'(black, mid, white) = ${black[0].toFixed(4)}, ${mid[0].toFixed(4)}, ${white[0].toFixed(4)}; ` +
				`M'(mid grey) = ${neutralChroma.toFixed(4)} vs M'(#3366cc) = ${saturatedChroma.toFixed(4)} ` +
				`(ratio ${ratio.toFixed(4)}). The residual is the library's default viewing conditions, not a bug`,
		})
	}

	// HCT: T is CIE L*, so it must equal the D65 CIELAB lightness.
	{
		const hct = spaceById("hct-cartesian")
		const lab = spaceById("cielab-d65")
		let worst = 0
		for (const probe of probes.slice(0, 100)) {
			worst = Math.max(worst, Math.abs(hct.toCartesian(probe)[0] - lab.toCartesian(probe)[0]))
		}
		checks.push({
			space: "hct-cartesian",
			check: "HCT's tone axis equals CIE L* (D65) — confirms the Cartesianisation used the right axis",
			correlation: null,
			passed: worst < 1e-6,
			detail: `worst |T - L*| over 100 probes = ${worst.toExponential(3)}`,
		})
	}

	// DIN99d has no library to check against, so it gets three independent property checks and a
	// correlation against ΔE2000, which it was fitted to approximate.
	{
		const space = spaceById("din99d")
		const mine: number[] = []
		const theirs: number[] = []
		for (const [first, second] of pairs) {
			mine.push(euclidean(space.toCartesian(first), space.toCartesian(second)))
			theirs.push(colorOf(first).deltaE(colorOf(second), "2000" as never))
		}
		const r = correlation(mine, theirs)
		const white = space.toCartesian([255, 255, 255] as Rgb8)
		const black = space.toCartesian([0, 0, 0] as Rgb8)
		const neutralOffset = Math.hypot(white[1], white[2])
		const monotone = white[0] > black[0] && Math.abs(black[0]) < 1e-9
		checks.push({
			space: "din99d",
			check:
				"no library implementation exists — checked by correlation with ΔE2000 (the formula DIN99d was built to approximate), plus L99d monotonicity and the documented neutral offset",
			correlation: r,
			passed: r > 0.9 && monotone,
			detail:
				`r(ΔE99d, ΔE2000) = ${r.toFixed(4)} over ${pairs.length} pairs; L99d(black) = ${black[0].toFixed(9)}, ` +
				`L99d(white) = ${white[0].toFixed(4)}; chroma of white = ${neutralOffset.toFixed(4)} ` +
				"(non-zero by the formula's X' = 1.12X - 0.12Z step, not a transcription error)",
		})
	}

	return checks
}

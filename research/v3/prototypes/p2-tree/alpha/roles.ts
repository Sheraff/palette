/**
 * Assignment: **a lexicographic reading, never a weighted score** (arm-b §2.6).
 *
 * Every node representative is a candidate for every role — there are no walls. What differs per
 * role is the *order* in which candidates are compared, and every order is lexicographic over
 * structural predicates. A weighted sum would be a parameter farm whose weights are exactly the ~900
 * tunable sites the rewrite exists to remove; a lexicographic order has zero free constants.
 *
 * **Bar-indifference.** Comparisons on a colour-valued quantity are made against the ruler: if two
 * candidates differ by less than the pair's bar on that level's quantity, the level is *indifferent*
 * and the comparison falls through to the next. No decision rests on a difference the contract
 * itself calls zero. Area is compared exactly, because area has no bar and inventing an indifference
 * band for it would be inventing a constant.
 *
 * **Why selection is a scan and not a `sort`.** An indifference band makes "better than"
 * non-transitive, and a non-transitive comparator handed to `Array.prototype.sort` produces an
 * engine-dependent order. So every choice below is a single pass over the candidates **in canonical
 * order** (ascending node id, then ascending packed RGB), keeping the incumbent unless a challenger
 * strictly wins. That is deterministic whatever the comparator does.
 *
 * ## The contract's own filters are part of the order, not a post-check
 *
 * A candidate that would make the palette invalid is not a candidate. Each role's scan filters on
 * exactly what invariants 3 and 4 will ask afterwards — distinctness above the bar against every
 * already-chosen role, the foreground/accent separation, and the raw pre-clamp APCA floors against
 * the background, the surface and, when one is published, the **whole rendered ramp** (via the
 * contract's own `minRawContrastOverRamp` / `firstInvisibleAccentOnRamp`, not a local
 * reimplementation). Arm-b §2.7 calls this "a re-run of that role's order with the floor as a
 * filter", and it is why raising a caller's floor can only ever change artworks whose order actually
 * re-resolves.
 */

import {
	ACCENT_FUNCTIONAL_DISTANCE,
	ESCAPE_COLORS,
	FOREGROUND_ACCENT_SEPARATION_DISTANCE,
} from "../../../src/contract/constants.ts"
import {
	apcaRaw,
	colorDistance,
	colorFromRgb,
	okLabFromColor,
	rgbToOkLab,
	sameColorBar,
} from "../../../src/contract/color.ts"
import { firstInvisibleAccentOnRamp, minRawContrastOverRamp } from "../../../src/contract/ramp.ts"
import type {
	GradientSpec,
	GradientStop,
	NonSourceColorEscape,
	PaletteColor,
	ResolvedContrastFloors,
	Rgb8,
} from "../../../src/contract/types.ts"
import { DEGENERATE_MODE_LIMIT } from "./constants.ts"
import { peelModes } from "./accumulator.ts"
import type { Accumulator, Representative } from "./accumulator.ts"
import { unpack } from "./decode.ts"

/** Where a candidate colour came from, carried into the parse record so a census can split them. */
export type CandidateSource = "field-zone" | "ramp-low" | "ramp-high" | "mark" | "image-mode" | "image-color"

export type RoleCandidate = Readonly<{
	source: CandidateSource
	/** Hierarchy node id, or `-1` for candidates that are not nodes (ramp ends, image modes). */
	nodeId: number
	areaFraction: number
	color: PaletteColor
	/** Packed RGB — the canonical tie-break, ascending is lexicographic RGB ascending. */
	packed: number
}>

export type RoleAssignment = Readonly<{
	background: PaletteColor
	surface: PaletteColor
	foreground: PaletteColor
	accent: PaletteColor
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	gradient: GradientSpec | null
	escape: NonSourceColorEscape | null
	/** Which source each role was read off, for the parse record. */
	sources: Readonly<Record<"background" | "surface" | "foreground" | "accent", CandidateSource | "collapsed" | "escape">>
	branch: "structural" | "degenerate"
}>

export function candidateOf(
	source: CandidateSource,
	nodeId: number,
	areaFraction: number,
	representative: Representative,
): RoleCandidate {
	return { source, nodeId, areaFraction, color: colorFromRgb(representative.rgb), packed: representative.packed }
}

/** Distinct above the pair's own bar — what invariant 3 will ask. */
function distinct(first: PaletteColor, second: PaletteColor): boolean {
	return colorDistance(first, second) >= sameColorBar(first, second)
}

/** The elevated foreground↔accent cell: distinguishable colours, not merely different ones. */
function separated(first: PaletteColor, second: PaletteColor): boolean {
	return colorDistance(first, second) >= Math.max(sameColorBar(first, second), FOREGROUND_ACCENT_SEPARATION_DISTANCE)
}

function textContrastClears(text: PaletteColor, field: PaletteColor, floor: number): boolean {
	return Math.abs(apcaRaw(text.rgb, field.rgb)) >= floor
}

/** The accent's two-tier floor: luminance, with the functional-distance escape. */
function accentContrastClears(accent: PaletteColor, field: PaletteColor, floor: number): boolean {
	if (Math.abs(apcaRaw(accent.rgb, field.rgb)) >= floor) return true
	return colorDistance(accent, field) >= ACCENT_FUNCTIONAL_DISTANCE
}

function lightnessOf(color: PaletteColor): number {
	return okLabFromColor(color)[0]
}

function chromaOf(color: PaletteColor): number {
	const lab = okLabFromColor(color)
	return Math.hypot(lab[1], lab[2])
}

/**
 * Pick the best candidate under a lexicographic "strictly better" relation, scanning in the
 * candidates' canonical order. See the module docstring for why this is not a `sort`.
 */
function pickBest(
	candidates: readonly RoleCandidate[],
	admissible: (candidate: RoleCandidate) => boolean,
	strictlyBetter: (challenger: RoleCandidate, incumbent: RoleCandidate) => boolean,
): RoleCandidate | null {
	let best: RoleCandidate | null = null
	for (const candidate of candidates) {
		if (!admissible(candidate)) continue
		if (best === null || strictlyBetter(candidate, best)) best = candidate
	}
	return best
}

/** Canonical order: ascending node id, then ascending packed RGB. Both are pixel-derived. */
function canonical(candidates: RoleCandidate[]): RoleCandidate[] {
	return candidates.slice().sort((first, second) => first.nodeId - second.nodeId || first.packed - second.packed)
}

export type RoleInputs = Readonly<{
	/** Field-zone candidates, largest first, from the carve. */
	fieldZones: readonly RoleCandidate[]
	/** The two ends of an adequate linear field, or `null` when the field is not a ramp. */
	rampLow: RoleCandidate | null
	rampHigh: RoleCandidate | null
	/** Retained nodes holding no field zone — the marks. */
	marks: readonly RoleCandidate[]
	/** The whole image's accumulator, for the degenerate branch and the contrast rescue. */
	rootAccumulator: Accumulator
	/** `true` when the field model was `none` and arm-b §2.8's degenerate branch must run. */
	degenerate: boolean
	/** Ramp geometry to publish when a gradient survives. */
	geometry: GradientSpec["geometry"] | undefined
	contrast: ResolvedContrastFloors
}>

/**
 * Read the four roles off the parse.
 *
 * The order of business is fixed and each step constrains the next: background, then surface, then
 * the gradient decision, then the foreground (which must clear its floor over the ramp that decision
 * published), then the accent.
 */
export function assignRoles(inputs: RoleInputs): RoleAssignment {
	const textFloor = inputs.contrast.minTextContrast.effectiveRawMagnitude
	const accentFloor = inputs.contrast.minAccentContrast.effectiveRawMagnitude

	const sources: Record<string, CandidateSource | "collapsed" | "escape"> = {}
	const branch: "structural" | "degenerate" = inputs.degenerate ? "degenerate" : "structural"

	// -------------------------------------------------------------------------------------------
	// The candidate pools. The degenerate branch replaces the structural pools wholesale with the
	// whole image's bar-scaled colour modes by area (arm-b §2.8) and keeps every filter below.
	// -------------------------------------------------------------------------------------------
	let backgroundPool: readonly RoleCandidate[]
	let surfacePool: readonly RoleCandidate[][]
	let markPool: readonly RoleCandidate[]

	if (inputs.degenerate) {
		const modes = peelModes(inputs.rootAccumulator, DEGENERATE_MODE_LIMIT)
		const total = inputs.rootAccumulator.totalMass
		const asCandidates = modes.map((mode, index) =>
			candidateOf("image-mode", -1 - index, total === 0 ? 0 : mode.modeMass / total, mode)
		)
		backgroundPool = asCandidates.slice(0, 1)
		surfacePool = [asCandidates.slice(1)]
		markPool = asCandidates.slice(1)
	} else {
		backgroundPool = inputs.rampLow !== null ? [inputs.rampLow] : inputs.fieldZones.slice(0, 1)
		surfacePool = [
			inputs.fieldZones.slice(1, 2),
			inputs.rampHigh !== null ? [inputs.rampHigh] : [],
			canonical([...inputs.marks]),
		]
		markPool = canonical([...inputs.marks])
	}

	// -------------------------------------------------------------------------------------------
	// Background. Arm-b §2.8: it is the representative of the largest border-connected zone under
	// *every* field typing, which is why a wrong parse is cheap — it moves the gradient boolean and
	// the surface, not this.
	// -------------------------------------------------------------------------------------------
	const backgroundCandidate = backgroundPool[0] ?? null
	if (backgroundCandidate === null) {
		// Only reachable for an image with no pixels, which the decoder refuses first.
		throw new Error("no background candidate: the parse produced no field and no colour modes")
	}
	const background = backgroundCandidate.color
	sources.background = backgroundCandidate.source

	// -------------------------------------------------------------------------------------------
	// Surface: second field zone, else the ramp's `t = 1` end, else the largest non-field node that
	// is distinct above the bar, else collapsed. A collapse here is a structural event — the carve
	// found one field zone and nothing else is a different colour — not a fallback.
	// -------------------------------------------------------------------------------------------
	let surfaceCandidate: RoleCandidate | null = null
	for (const tier of surfacePool) {
		surfaceCandidate = pickBest(
			tier,
			(candidate) => distinct(candidate.color, background),
			(challenger, incumbent) =>
				challenger.areaFraction > incumbent.areaFraction ||
				(challenger.areaFraction === incumbent.areaFraction && challenger.packed < incumbent.packed),
		)
		if (surfaceCandidate !== null) break
	}
	const surfaceCollapsed = surfaceCandidate === null
	const surface = surfaceCandidate === null ? background : surfaceCandidate.color
	sources.surface = surfaceCandidate === null ? "collapsed" : surfaceCandidate.source

	// -------------------------------------------------------------------------------------------
	// The gradient. A ramp exists exactly when the field model was linear-adequate and the surface
	// did not collapse: identical ends are a degenerate ramp, which invariant 3 refuses, and the
	// contract's answer to a flat field is `gradient: null`.
	// -------------------------------------------------------------------------------------------
	const publishRamp = !inputs.degenerate && inputs.rampLow !== null && !surfaceCollapsed
	const stops: GradientStop[] = [
		{ color: background, position: 0 },
		{ color: surface, position: 1 },
	]
	const gradient: GradientSpec | null = publishRamp
		? {
			stops: stops as unknown as [GradientStop, GradientStop],
			...(inputs.geometry === undefined ? {} : { geometry: inputs.geometry }),
		}
		: null

	const clearsRampForText = (color: PaletteColor): boolean => {
		if (gradient === null) return true
		const extremum = minRawContrastOverRamp(color, gradient.stops)
		return extremum === null || Math.abs(extremum.raw) >= textFloor
	}
	const clearsRampForAccent = (color: PaletteColor): boolean => {
		if (gradient === null) return true
		return firstInvisibleAccentOnRamp(color, gradient.stops, accentFloor, ACCENT_FUNCTIONAL_DISTANCE) === null
	}

	// -------------------------------------------------------------------------------------------
	// Foreground. Marks by area, then luminance separation from the background with bar-indifference.
	// The contract gives the foreground no chromatic rescue at any distance, so this order is
	// luminance-driven by construction.
	// -------------------------------------------------------------------------------------------
	// Split in two so the rescue below pays the ramp's 2,049 samples only for the candidates it
	// actually reaches, rather than for all ~25,000 distinct colours of a JPEG cover.
	const foregroundAdmissibleCheap = (color: PaletteColor): boolean =>
		distinct(color, background) &&
		(surfaceCollapsed || distinct(color, surface)) &&
		textContrastClears(color, background, textFloor) &&
		(surfaceCollapsed || textContrastClears(color, surface, textFloor))
	const foregroundAdmissible = (color: PaletteColor): boolean =>
		foregroundAdmissibleCheap(color) && clearsRampForText(color)

	const backgroundLightness = lightnessOf(background)
	const separation = (candidate: RoleCandidate): number => Math.abs(lightnessOf(candidate.color) - backgroundLightness)

	const foregroundCandidate = pickBest(
		markPool,
		(candidate) => foregroundAdmissible(candidate.color),
		(challenger, incumbent) => {
			if (challenger.areaFraction !== incumbent.areaFraction) {
				return challenger.areaFraction > incumbent.areaFraction
			}
			const delta = separation(challenger) - separation(incumbent)
			// Bar-indifference: a difference the ruler calls zero decides nothing.
			if (Math.abs(delta) >= sameColorBar(challenger.color, incumbent.color)) return delta > 0
			return challenger.packed < incumbent.packed
		},
	)

	// The contrast rescue. When no node's representative can serve as text, arm-b §2.8 reaches
	// straight for the escape; this cycle takes one step first, because an **exact artwork pixel**
	// that clears the floor is strictly better evidence than an invented literal, and invariant 2
	// prefers it. Ordered by luminance separation from the background, which is the quantity the
	// foreground is judged on.
	let foreground: PaletteColor
	let escape: NonSourceColorEscape | null = null
	if (foregroundCandidate !== null) {
		foreground = foregroundCandidate.color
		sources.foreground = foregroundCandidate.source
	} else {
		const rescue = rescueFromImage(
			inputs.rootAccumulator,
			foregroundAdmissibleCheap,
			foregroundAdmissible,
			backgroundLightness,
		)
		if (rescue !== null) {
			foreground = rescue
			sources.foreground = "image-color"
		} else {
			// The escape's one door (arm-b §2.8): no candidate can serve as text at all, and a pure
			// literal is genuinely absent from the artwork. `accent` collapses onto it by the
			// contract's own condition 3.
			const present = new Set<number>(Array.from(inputs.rootAccumulator.colors))
			const literals = ESCAPE_COLORS
				.map((hexValue) => {
					const rgb: Rgb8 = [
						Number.parseInt(hexValue.slice(1, 3), 16),
						Number.parseInt(hexValue.slice(3, 5), 16),
						Number.parseInt(hexValue.slice(5, 7), 16),
					]
					return { hexValue, rgb, packed: (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] }
				})
				.filter((literal) => !present.has(literal.packed))
			let chosen: { hexValue: string; rgb: Rgb8 } | null = null
			for (const literal of literals) {
				const color = colorFromRgb(literal.rgb)
				if (!foregroundAdmissible(color)) continue
				if (chosen === null) chosen = literal
				else if (
					Math.abs(apcaRaw(literal.rgb, background.rgb)) > Math.abs(apcaRaw(chosen.rgb, background.rgb))
				) chosen = literal
			}
			if (chosen !== null) {
				foreground = colorFromRgb(chosen.rgb)
				escape = { role: "foreground", color: foreground.hex }
				sources.foreground = "escape"
			} else {
				// Last resort, and it is allowed to publish an invalid palette rather than crash: a row
				// that fails a gate is evidence, a missing row is nothing (`src/devloop/types.ts`).
				// Reached only when every colour in the artwork *and* both literals fail the filters.
				const fallback = rescueFromImage(inputs.rootAccumulator, () => true, () => true, backgroundLightness)
				foreground = fallback ?? background
				sources.foreground = "image-color"
			}
		}
	}

	// -------------------------------------------------------------------------------------------
	// Accent. Small high-chroma marks by chroma, with bar-indifference, smaller first inside a tie —
	// a preference costs no constant where a size threshold would cost one and be uncalibrated.
	// -------------------------------------------------------------------------------------------
	const accentAdmissible = (color: PaletteColor): boolean =>
		distinct(color, background) &&
		(surfaceCollapsed || distinct(color, surface)) &&
		separated(color, foreground) &&
		accentContrastClears(color, background, accentFloor) &&
		(surfaceCollapsed || accentContrastClears(color, surface, accentFloor)) &&
		clearsRampForAccent(color)

	const accentCandidate = escape !== null ? null : pickBest(
		markPool,
		(candidate) => accentAdmissible(candidate.color),
		(challenger, incumbent) => {
			const delta = chromaOf(challenger.color) - chromaOf(incumbent.color)
			if (Math.abs(delta) >= sameColorBar(challenger.color, incumbent.color)) return delta > 0
			if (challenger.areaFraction !== incumbent.areaFraction) {
				return challenger.areaFraction < incumbent.areaFraction
			}
			return challenger.packed < incumbent.packed
		},
	)
	const accentCollapsed = accentCandidate === null
	const accent = accentCandidate === null ? foreground : accentCandidate.color
	sources.accent = accentCandidate === null ? "collapsed" : accentCandidate.source

	return {
		background,
		surface,
		foreground,
		accent,
		surfaceCollapsed,
		accentCollapsed,
		gradient,
		escape,
		sources: sources as RoleAssignment["sources"],
		branch,
	}
}

/**
 * The best exact artwork colour under a predicate, ordered by luminance separation from the
 * background then by ascending packed RGB. A linear scan over the image's distinct colours: exact,
 * and every colour it can return is by construction a pixel of the source.
 *
 * `cheap` filters the scan, `full` decides the winner. The ordering key is a total order over exact
 * floats and packed triples with no indifference band, so a `sort` is safe here and the first
 * `full`-passing candidate in that order is the answer.
 */
function rescueFromImage(
	accumulator: Accumulator,
	cheap: (color: PaletteColor) => boolean,
	full: (color: PaletteColor) => boolean,
	backgroundLightness: number,
): PaletteColor | null {
	const shortlist: { color: PaletteColor; separation: number; packed: number }[] = []
	for (let i = 0; i < accumulator.colors.length; i += 1) {
		const packed = accumulator.colors[i]
		const color = colorFromRgb(unpack(packed))
		if (!cheap(color)) continue
		shortlist.push({ color, separation: Math.abs(rgbToOkLab(color.rgb)[0] - backgroundLightness), packed })
	}
	shortlist.sort((first, second) => second.separation - first.separation || first.packed - second.packed)
	for (const entry of shortlist) {
		if (full(entry.color)) return entry.color
	}
	return null
}

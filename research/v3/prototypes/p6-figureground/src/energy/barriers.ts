/**
 * # The contract barriers — inherited digit for digit, none of them ours.
 *
 * Proposal §2.4's pairwise terms 4, 5 and 7 are not judgements of this design; they are the
 * contract, and §3 commits to inheriting them so that "if the reviewer moves one, my design moves
 * with it without a line of new reasoning". So every threshold, every exception class and every
 * escape below is read from `src/contract` and reproduced in the same shape invariant 3 and
 * invariant 4 use — not re-derived, not approximated, not softened into a penalty.
 *
 * A barrier is infinite cost. In the energy that matters twice: it makes an infeasible tuple
 * unrepresentable rather than expensive, and — because a barrier can only ever *increase* a total —
 * it is what makes the unary-only bound in `./solve.ts` admissible.
 *
 * ## Why this is a reimplementation, and what keeps it honest
 *
 * `validateDistinctness` and `validateContrastFloors` take a whole `Palette` and walk an O(n²)
 * matrix. The search evaluates tuples by the million, so calling them per tuple is not available.
 * What is available is to reproduce their *decision* exactly and then prove the reproduction:
 * `tests/energy.test.ts` asserts that `violatedBarriers` is empty exactly when the contract's own
 * validators report no I3/I4 violation, over randomised tuples including every exception class.
 * That equivalence test is the thing that makes "digit for digit" a fact rather than a claim, and it
 * is the first test to look at if these ever drift.
 *
 * ## The ramp, and the factorisation proposal §2.4 term 5 asks for
 *
 * The foreground and the accent are held to their floors over the **whole rendered ramp**, not at
 * the stops (`src/contract/ramp.ts`, reviewer's ruling 2026-08-03). Because the field hypothesis
 * fixes the ramp *before* foreground and accent are chosen, that minimum factorises into a unary
 * quantity per candidate — which is what makes the expensive constraint affordable. `RampProbe`
 * below is that factorisation: the ramp is sampled once per hypothesis, its samples are indexed by
 * APCA luminance, and each candidate's minimum is then two array lookups.
 *
 * The indexing is exact rather than heuristic. With the subject fixed, `|raw APCA|` against a field
 * of luminance `b` is monotone in `|b − t|` on each side of the subject's own luminance `t` (both
 * polarity branches of `apcaRaw` are monotone in `b`), so the minimum over any finite sample set is
 * attained at one of the two samples bracketing `t`. Nothing is skipped by looking only there.
 *
 * The contract's search additionally *refines* around its coarse minimum, and refinement can only
 * lower the answer. So the fast path decides outright when the coarse minimum is below the floor
 * (refinement cannot rescue it) or above the floor by more than the measured coarse overstatement
 * (`ENERGY_ANCHORS.rampCoarseOverstatementBound`, refinement cannot break it), and hands the band in
 * between to the contract's own `minRawContrastOverRamp` / `firstInvisibleAccentOnRamp`. The
 * contract decides every case the fast path is not entitled to.
 */

import {
	apcaRaw,
	colorDistance,
	rgbToApcaY,
	sameColorBar,
} from "../../../../src/contract/color.ts"
import {
	APCA_G4G,
	EPSILON_ACCENT_RAW,
	EPSILON_TEXT_RAW,
	FOREGROUND_ACCENT_SEPARATION_DISTANCE,
} from "../../../../src/contract/constants.ts"
import {
	firstInvisibleAccentOnRamp,
	minRawContrastOverRamp,
	sampleRamp,
} from "../../../../src/contract/ramp.ts"
import type {
	GradientStop,
	PaletteColor,
	ResolvedContrastFloors,
} from "../../../../src/contract/types.ts"
import { ENERGY_ANCHORS } from "./rates.ts"

// ---------------------------------------------------------------------------------------------
// What a barrier judges
// ---------------------------------------------------------------------------------------------

/** The published colours of one tuple, in the shape the barriers judge them. */
export type PublishedTuple = Readonly<{
	background: PaletteColor
	surface: PaletteColor
	foreground: PaletteColor
	accent: PaletteColor
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	/** The published gradient's stops, or `null` for a flat field. */
	stops: readonly GradientStop[] | null
}>

/**
 * The two sanctioned collapses, from `PHASE_0_DECISIONS.md` §4 invariant 3 via `invariants.ts`.
 * `[INHERITED]` — exactly two, and no others.
 */
const SANCTIONED_COLLAPSES = [
	{ first: "roles.surface", second: "roles.background", flag: "surfaceCollapsed" },
	{ first: "roles.accent", second: "roles.foreground", flag: "accentCollapsed" },
] as const

/**
 * The field roles, exempt from distinctness against gradient stops.
 * `[INHERITED]` — invariant 3's second exception class, verbatim from `invariants.ts`.
 */
const STOP_EXEMPT_ROLE_PATHS = new Set(["roles.background", "roles.surface"])

function pairKey(first: string, second: string): string {
	return first < second ? `${first}|${second}` : `${second}|${first}`
}

const SEPARATED_ROLE_PAIR = pairKey("roles.foreground", "roles.accent")

type PublishedColor = Readonly<{ path: string; color: PaletteColor }>

function publishedColorsOf(tuple: PublishedTuple): PublishedColor[] {
	const published: PublishedColor[] = [
		{ path: "roles.background", color: tuple.background },
		{ path: "roles.surface", color: tuple.surface },
		{ path: "roles.foreground", color: tuple.foreground },
		{ path: "roles.accent", color: tuple.accent },
	]
	if (tuple.stops !== null) {
		tuple.stops.forEach((stop, index) => {
			published.push({ path: `gradient.stops[${index}]`, color: stop.color })
		})
	}
	return published
}

// ---------------------------------------------------------------------------------------------
// The ramp factorisation
// ---------------------------------------------------------------------------------------------

/** APCA's black soft clamp, reproduced so the probe can sort by the same quantity `apcaRaw` uses. */
function softClampBlack(y: number): number {
	return y > APCA_G4G.blkThrs ? y : y + (APCA_G4G.blkThrs - y) ** APCA_G4G.blkClmp
}

/**
 * The rendered ramp, sampled once per field hypothesis and indexed by APCA luminance.
 *
 * Built from `sampleRamp` — the contract's own sampler at its own density — so the sample *set* is
 * identical to what `minRawContrastOverRamp` walks. Only the traversal order differs.
 */
export type RampProbe = Readonly<{
	stops: readonly GradientStop[]
	/** Sample colours, ordered by ascending soft-clamped APCA luminance. */
	colors: readonly PaletteColor[]
	/** The corresponding soft-clamped luminances, ascending. */
	luminance: Float64Array
}>

export function buildRampProbe(stops: readonly GradientStop[]): RampProbe {
	const samples = sampleRamp(stops)
	const order = samples.map((sample, index) => ({
		index,
		y: softClampBlack(rgbToApcaY(sample.color.rgb)),
	}))
	// Ties broken by sample index: the sort is a pure function of the stops, which determinism needs.
	order.sort((first, second) => first.y - second.y || first.index - second.index)
	const colors = order.map((entry) => samples[entry.index].color)
	const luminance = new Float64Array(order.length)
	for (let index = 0; index < order.length; index++) luminance[index] = order[index].y
	return { stops, colors, luminance }
}

/** Index of the last sample whose luminance is ≤ `y`, or −1. */
function lowerBound(luminance: Float64Array, y: number): number {
	let low = 0
	let high = luminance.length - 1
	let found = -1
	while (low <= high) {
		const mid = (low + high) >> 1
		if (luminance[mid] <= y) {
			found = mid
			low = mid + 1
		} else high = mid - 1
	}
	return found
}

/**
 * The coarse-pass minimum `|raw APCA|` of `subject` against the ramp, exactly.
 *
 * "Exactly" over `sampleRamp`'s sample set — the same set the contract's coarse pass walks — by the
 * bracketing argument in this file's docstring. A window of two either side of the bracket is
 * scanned rather than one, which costs nothing and removes any dependence on the sort's tie order.
 */
export function coarseMinRawAgainstRamp(subject: PaletteColor, probe: RampProbe): number {
	const y = softClampBlack(rgbToApcaY(subject.rgb))
	const pivot = lowerBound(probe.luminance, y)
	let best = Number.POSITIVE_INFINITY
	for (let index = pivot - 2; index <= pivot + 3; index++) {
		if (index < 0 || index >= probe.colors.length) continue
		const magnitude = Math.abs(apcaRaw(subject.rgb, probe.colors[index].rgb))
		if (magnitude < best) best = magnitude
	}
	return best
}

/**
 * Does `subject` clear `floor` over the whole rendered ramp?
 *
 * Decided by the fast path where the fast path is entitled to decide, and by the contract's own
 * refined search everywhere else — see this file's docstring for which is which.
 */
export function foregroundClearsRamp(
	subject: PaletteColor,
	probe: RampProbe,
	floor: number,
): boolean {
	const coarse = coarseMinRawAgainstRamp(subject, probe)
	if (coarse < floor) return false
	if (coarse >= floor + ENERGY_ANCHORS.rampCoarseOverstatementBound) return true
	const refined = minRawContrastOverRamp(subject, probe.stops)
	return refined === null || Math.abs(refined.raw) >= floor
}

/**
 * Is `accent` functional over the whole rendered ramp?
 *
 * The accent's floor is a conjunction evaluated pointwise (`firstInvisibleAccentOnRamp`): it fails
 * only where `|raw|` and OKLab distance both undershoot at the *same* ramp point. The fast scan
 * walks exactly the samples where `|raw| < floor` — a contiguous run around the accent's own
 * luminance, by the monotonicity argument — and asks the distance question there.
 */
export function accentClearsRamp(
	accent: PaletteColor,
	probe: RampProbe,
	floor: number,
	functionalDistance: number,
): boolean {
	const y = softClampBlack(rgbToApcaY(accent.rgb))
	const pivot = lowerBound(probe.luminance, y)
	let coarseMin = Number.POSITIVE_INFINITY

	const inspect = (index: number): boolean => {
		if (index < 0 || index >= probe.colors.length) return false
		const magnitude = Math.abs(apcaRaw(accent.rgb, probe.colors[index].rgb))
		if (magnitude < coarseMin) coarseMin = magnitude
		if (magnitude >= floor) return false
		return colorDistance(accent, probe.colors[index]) < functionalDistance
	}

	// Walk outward from the bracket in both directions while the luminance clause can still hold.
	// `|raw|` is monotone in `|b − t|` on each side, so the first sample that clears the floor ends
	// that side's run and nothing beyond it can be invisible.
	for (let index = pivot; index >= 0; index--) {
		if (inspect(index)) return false
		if (Math.abs(apcaRaw(accent.rgb, probe.colors[index].rgb)) >= floor) break
	}
	for (let index = pivot + 1; index < probe.colors.length; index++) {
		if (inspect(index)) return false
		if (Math.abs(apcaRaw(accent.rgb, probe.colors[index].rgb)) >= floor) break
	}

	if (coarseMin >= floor + ENERGY_ANCHORS.rampCoarseOverstatementBound) return true
	// The coarse pass found nothing invisible but is not entitled to say so: refinement could still
	// land inside a narrow quantisation cell. The contract's own search decides.
	return firstInvisibleAccentOnRamp(accent, probe.stops, floor, functionalDistance) === null
}

// ---------------------------------------------------------------------------------------------
// The barrier scan
// ---------------------------------------------------------------------------------------------

export type BarrierContext = Readonly<{
	floors: ResolvedContrastFloors
	/** The ramp probe for the current field hypothesis, or `null` when no gradient is published. */
	ramp: RampProbe | null
}>

/**
 * Every contract barrier this tuple violates, named in the census's own vocabulary.
 *
 * `stopAtFirst` is for the search, which only needs to know *whether* a tuple is feasible; the
 * infeasibility certificate takes the full list.
 */
export function violatedBarriers(
	tuple: PublishedTuple,
	context: BarrierContext,
	stopAtFirst = false,
): string[] {
	const violations: string[] = []
	const push = (code: string): boolean => {
		violations.push(code)
		return stopAtFirst
	}

	// --- Invariant 3: distinctness -------------------------------------------------------------
	const published = publishedColorsOf(tuple)
	const sanctioned = new Map<string, boolean>()
	for (const collapse of SANCTIONED_COLLAPSES) {
		const first = collapse.flag === "surfaceCollapsed" ? tuple.surface : tuple.accent
		const second = collapse.flag === "surfaceCollapsed" ? tuple.background : tuple.foreground
		const flagSet = collapse.flag === "surfaceCollapsed"
			? tuple.surfaceCollapsed
			: tuple.accentCollapsed
		sanctioned.set(pairKey(collapse.first, collapse.second), flagSet && first.hex === second.hex)
	}

	for (let i = 0; i < published.length; i++) {
		for (let j = i + 1; j < published.length; j++) {
			const a = published[i]
			const b = published[j]
			const aIsStop = a.path.startsWith("gradient.stops")
			const bIsStop = b.path.startsWith("gradient.stops")
			// Exception class 2: field roles versus stops.
			if (
				(aIsStop && STOP_EXEMPT_ROLE_PATHS.has(b.path)) ||
				(bIsStop && STOP_EXEMPT_ROLE_PATHS.has(a.path))
			) continue
			const key = pairKey(a.path, b.path)
			// Exception class 1: a sanctioned collapse that is exact and flagged.
			if (sanctioned.get(key) === true) continue

			const distance = colorDistance(a.color, b.color)
			const bar = sameColorBar(a.color, b.color)
			const separated = key === SEPARATED_ROLE_PAIR
			const effective = separated
				? Math.max(bar, FOREGROUND_ACCENT_SEPARATION_DISTANCE)
				: bar
			if (distance >= effective) continue
			const code = distance < bar
				? (sanctioned.has(key) ? "I3.collapse-not-sanctioned" : "I3.pair-not-distinct")
				: "I3.foreground-accent-not-separated"
			if (push(`${code}:${key}`)) return violations
		}
	}

	// --- Invariant 4: contrast floors ----------------------------------------------------------
	// A genuinely collapsed accent *is* the foreground and has no independent existence, so its own
	// pairs are skipped exactly as `validateContrastFloors` skips them.
	const accentIsForeground = tuple.accentCollapsed && tuple.accent.hex === tuple.foreground.hex

	const textFloor = Math.max(context.floors.minTextContrast.effectiveRawMagnitude, EPSILON_TEXT_RAW)
	const accentFloor = Math.max(
		context.floors.minAccentContrast.effectiveRawMagnitude,
		EPSILON_ACCENT_RAW,
	)
	// The escape applies only at the epsilon, never to a floor the caller raised — `invariants.ts`.
	const accentEscapeAvailable = accentFloor <= EPSILON_ACCENT_RAW

	const flatPairs: { text: PaletteColor; textPath: string; field: PaletteColor; fieldPath: string }[] =
		[
			{
				text: tuple.foreground,
				textPath: "roles.foreground",
				field: tuple.background,
				fieldPath: "roles.background",
			},
			{
				text: tuple.foreground,
				textPath: "roles.foreground",
				field: tuple.surface,
				fieldPath: "roles.surface",
			},
		]
	if (!accentIsForeground) {
		flatPairs.push({
			text: tuple.accent,
			textPath: "roles.accent",
			field: tuple.background,
			fieldPath: "roles.background",
		}, {
			text: tuple.accent,
			textPath: "roles.accent",
			field: tuple.surface,
			fieldPath: "roles.surface",
		})
	}

	for (const pair of flatPairs) {
		const isAccent = pair.textPath === "roles.accent"
		const floor = isAccent ? accentFloor : textFloor
		const raw = apcaRaw(pair.text.rgb, pair.field.rgb)
		if (!Number.isFinite(raw)) {
			if (push(`I4.contrast-not-computable:${pair.textPath}|${pair.fieldPath}`)) return violations
			continue
		}
		if (Math.abs(raw) >= floor) continue
		if (
			isAccent && accentEscapeAvailable &&
			colorDistance(pair.text, pair.field) >= ENERGY_ANCHORS.accentFunctionalDistance
		) continue
		if (push(`I4.below-contrast-floor:${pair.textPath}|${pair.fieldPath}`)) return violations
	}

	// --- Invariant 4: the whole rendered ramp --------------------------------------------------
	if (context.ramp !== null && tuple.stops !== null) {
		if (!foregroundClearsRamp(tuple.foreground, context.ramp, textFloor)) {
			if (push("I4.ramp-below-contrast-floor:roles.foreground")) return violations
		}
		if (!accentIsForeground) {
			const clears = accentEscapeAvailable
				? accentClearsRamp(
					tuple.accent,
					context.ramp,
					accentFloor,
					ENERGY_ANCHORS.accentFunctionalDistance,
				)
				: foregroundClearsRamp(tuple.accent, context.ramp, accentFloor)
			if (!clears) {
				if (push("I4.ramp-below-contrast-floor:roles.accent")) return violations
			}
		}
	}

	return violations
}

/** Is this tuple feasible under every inherited barrier? */
export function tupleFeasible(tuple: PublishedTuple, context: BarrierContext): boolean {
	return violatedBarriers(tuple, context, true).length === 0
}

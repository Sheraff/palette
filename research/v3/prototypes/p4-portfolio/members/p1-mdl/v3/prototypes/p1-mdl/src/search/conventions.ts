/**
 * # The three conventions v0 uses instead of a decision, and the one map from parts to a configuration
 *
 * `DESIGN.md` fixes three things by *convention* rather than by minimisation, and each one is named
 * here rather than inlined somewhere in the enumerator, because a convention that is not written
 * down becomes a bug the next reader has to reverse-engineer.
 *
 * 1. **Decision 5, two-flat order:** *"larger field mass is background"*. Read on the smoothed mass,
 *    like every other mass in P1.
 * 2. **Decision 5, ramp orientation:** *"increasing t along the renderer's 135° axis"*. The renderer
 *    emits `linear-gradient(135deg in oklab, …)` (`src/review-server/gradient.ts`), and CSS's 135°
 *    points to the bottom-right, so t increases along `(+x, +y)` with y measured downward. The stop
 *    at t = 0 is therefore the endpoint whose pixels live further **up and left** in the artwork.
 *    This costs no evaluation: both energies profile the ramp's direction per evaluation
 *    (`DESIGN.md` decision 8), so the two orientations of a two-stop ramp score identically and the
 *    choice is purely about what gets published.
 * 3. **Decision 3, foreground/accent:** *"feasibility first, then ordering (accent = the legal ink
 *    assignment moving further from the field in lightness, chroma secondary)"* — arm A′'s device,
 *    used for both priors in v0, with arm A's anisotropic accent kernel deliberately deferred.
 *
 * **What a convention costs is measured, not assumed.** Every emitted palette carries the F/A-swap
 * delta (`DESIGN.md` reviewer-evidence addendum item 6): the energy of the assignment convention 3
 * rejected. A negative delta is the convention overriding the objective, and it is reported per
 * palette so the deferral in decision 3 can be revisited on evidence rather than on taste.
 *
 * ## Why every configuration is built here
 *
 * `makeConfiguration()` is the only constructor. Both the coarse enumerator and the refinement move
 * generator go through it, so a configuration cannot exist that violates a convention — a refinement
 * move that swaps a field colour re-derives which member is the background rather than keeping the
 * old assignment, and collapse flags are *derived from the triples they describe* and so can never
 * be the lie invariant 3 exists to catch.
 */

import { rgbToHex, rgbToOkLab } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration, ConfigurationStop } from "../emit/types.ts"
import type { Measurement } from "../measure/types.ts"
import type { ConfigurationSummary, FieldOrder, Representative } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Colour arithmetic the conventions need
// ---------------------------------------------------------------------------------------------

/** OKLab chroma — `hypot(a, b)`. The secondary key of decision 3's ordering. */
export function chromaOf(lab: readonly [number, number, number]): number {
	return Math.hypot(lab[1], lab[2])
}

function sameTriple(left: Rgb8, right: Rgb8): boolean {
	return left[0] === right[0] && left[1] === right[1] && left[2] === right[2]
}

// ---------------------------------------------------------------------------------------------
// Decision 5 — which field member is the background
// ---------------------------------------------------------------------------------------------

/**
 * The 135°-axis coordinate of a triple's spatial centroid: `meanX + meanY`, y downward.
 *
 * Both means are already normalised to the short edge by `src/measure/`, so this is scale-free. The
 * *value* is never published or compared across images — only the sign of a difference between two
 * of them is used, which is what makes it an orientation convention rather than a statistic.
 */
function axisCoordinate(measurement: Measurement, row: number): number {
	return measurement.derived.meanX[row] + measurement.derived.meanY[row]
}

/**
 * Order a field pair into (background, surface).
 *
 * - `"two-flat"` — decision 5's mass rule: the larger smoothed mass is the background. Ties fall to
 *   hex ascending, so the order is total.
 * - `"ramp"` — decision 5's orientation rule: the endpoint further up-and-left is at t = 0 and is
 *   therefore the background (the first stop's colour is the background, per the reviewer's ruling
 *   of 2026-08-04 that `PHASE_0_DECISIONS.md` records). Ties fall to hex ascending.
 * - `"collapsed"` — there is one colour and both roles publish it.
 */
export function orderFieldPair(
	measurement: Measurement,
	first: Representative,
	second: Representative,
	order: FieldOrder,
): { background: Representative; surface: Representative } {
	if (order === "collapsed") return { background: first, surface: first }

	if (order === "two-flat") {
		if (first.smoothedMass !== second.smoothedMass) {
			return first.smoothedMass > second.smoothedMass
				? { background: first, surface: second }
				: { background: second, surface: first }
		}
		return first.hex <= second.hex
			? { background: first, surface: second }
			: { background: second, surface: first }
	}

	const firstAxis = axisCoordinate(measurement, first.row)
	const secondAxis = axisCoordinate(measurement, second.row)
	if (firstAxis !== secondAxis) {
		return firstAxis < secondAxis
			? { background: first, surface: second }
			: { background: second, surface: first }
	}
	return first.hex <= second.hex
		? { background: first, surface: second }
		: { background: second, surface: first }
}

// ---------------------------------------------------------------------------------------------
// Decision 3 — which ink is the accent
// ---------------------------------------------------------------------------------------------

/**
 * The field's lightness, as decision 3's ordering measures distance from.
 *
 * The mean of the two published field endpoints' OKLab L. For a collapsed field that is just the one
 * colour; for a two-flat or ramp field it is the midpoint, which is the only choice that does not
 * privilege one of the two field roles — an ordering that measured from the background alone would
 * flip whenever decision 5's mass rule flipped, coupling two conventions that have nothing to do
 * with each other.
 *
 * Interior ramp stops are deliberately **not** averaged in: they are decoupled from the roles
 * (`src/emit/types.ts`), they come and go during refinement, and letting them move the ink ordering
 * would make the F/A assignment depend on a knot position.
 */
export function fieldLightness(background: Rgb8, surface: Rgb8): number {
	return (rgbToOkLab(background)[0] + rgbToOkLab(surface)[0]) / 2
}

/**
 * Order an ink pair into (foreground, accent) — decision 3's ordering half.
 *
 * Primary key: distance from the field in lightness, **descending** — the accent is the one that
 * moves further. Secondary key: chroma, descending. Final key: hex ascending, so the order is total
 * and no pair can tie its way into hash order.
 *
 * The *feasibility* half of decision 3 does not live here: it belongs to the caller, which builds
 * this ordering, asks `feasibility()`, and falls back to the swapped assignment when this one is
 * illegal. Keeping the two apart is what lets the swap probe re-run exactly this function's rejected
 * output without duplicating the rule.
 */
export function orderInkPair(
	first: Representative,
	second: Representative,
	fieldL: number,
): { foreground: Representative; accent: Representative } {
	const firstLab = rgbToOkLab(first.rgb)
	const secondLab = rgbToOkLab(second.rgb)
	const firstDistance = Math.abs(firstLab[0] - fieldL)
	const secondDistance = Math.abs(secondLab[0] - fieldL)

	if (firstDistance !== secondDistance) {
		return firstDistance > secondDistance
			? { foreground: second, accent: first }
			: { foreground: first, accent: second }
	}
	const firstChroma = chromaOf(firstLab)
	const secondChroma = chromaOf(secondLab)
	if (firstChroma !== secondChroma) {
		return firstChroma > secondChroma
			? { foreground: second, accent: first }
			: { foreground: first, accent: second }
	}
	return first.hex <= second.hex
		? { foreground: first, accent: second }
		: { foreground: second, accent: first }
}

// ---------------------------------------------------------------------------------------------
// The constructor
// ---------------------------------------------------------------------------------------------

/**
 * The parts a configuration is assembled from.
 *
 * Field and ink arrive as **unordered pairs** because the conventions above are what order them.
 * `interior` is empty for every non-ramp order and for a two-stop ramp.
 */
export type ConfigurationParts = Readonly<{
	field: readonly [Representative, Representative]
	order: FieldOrder
	ink: readonly [Representative, Representative]
	interior?: readonly ConfigurationStop[]
	/** Swap the ordering decision 3 produced. Used by the feasibility fallback and the swap probe. */
	swapInk?: boolean
	escape?: Configuration["escape"]
}>

/**
 * Parts to `Configuration`, applying every convention and deriving every declaration.
 *
 * Collapse flags are computed from triple equality rather than taken as input. `PHASE_0_DECISIONS.md`
 * §2 makes them *declarations*, and invariant 3 exists to catch one that disagrees with the colours
 * — so the emitter must be capable of publishing a lie for the invariant to be worth running, but
 * the *search* has no reason to construct one, and every configuration it constructs declares
 * exactly what its triples say.
 */
export function makeConfiguration(
	measurement: Measurement,
	parts: ConfigurationParts,
): Configuration {
	const { background, surface } = orderFieldPair(
		measurement,
		parts.field[0],
		parts.field[1],
		parts.order,
	)
	const inks = orderInkPair(parts.ink[0], parts.ink[1], fieldLightness(background.rgb, surface.rgb))
	const foreground = parts.swapInk === true ? inks.accent : inks.foreground
	const accent = parts.swapInk === true ? inks.foreground : inks.accent

	const gradient = parts.order === "ramp"
	const stops: ConfigurationStop[] = gradient
		? [
			{ rgb: background.rgb, position: 0 },
			...(parts.interior ?? []),
			{ rgb: surface.rgb, position: 1 },
		]
		: []

	return {
		background: background.rgb,
		surface: surface.rgb,
		foreground: foreground.rgb,
		accent: accent.rgb,
		gradient,
		stops,
		surfaceCollapsed: sameTriple(background.rgb, surface.rgb),
		accentCollapsed: sameTriple(foreground.rgb, accent.rgb),
		escape: parts.escape ?? null,
	}
}

/** The same configuration with foreground and accent exchanged. The swap probe's subject. */
export function withInksSwapped(configuration: Configuration): Configuration {
	return {
		...configuration,
		foreground: configuration.accent,
		accent: configuration.foreground,
	}
}

// ---------------------------------------------------------------------------------------------
// Canonical identity
// ---------------------------------------------------------------------------------------------

/**
 * The configuration's canonical string.
 *
 * Two jobs, both structural. It **deduplicates**: the coarse enumeration and the refinement sweeps
 * reach the same configuration by different routes and neither should pay for it twice. And it
 * **breaks energy ties**: `DESIGN.md` requires a *"canonical sort + fixed tie-break"*, and when two
 * configurations score bit-identically the one whose key sorts first wins, which makes the argmin a
 * function of the image rather than of enumeration order.
 *
 * Stop positions are formatted to a fixed six decimals — the contract's own `rampPath` precision — so
 * two positions that differ below what the renderer can express do not become two configurations.
 */
export function canonicalKey(configuration: Configuration): string {
	const stops = configuration.stops
		.map((stop) => `${rgbToHex(stop.rgb)}@${stop.position.toFixed(6)}`)
		.join(",")
	const escape = configuration.escape === null
		? "-"
		: `${configuration.escape.role}:${configuration.escape.color}`
	return [
		rgbToHex(configuration.background),
		rgbToHex(configuration.surface),
		rgbToHex(configuration.foreground),
		rgbToHex(configuration.accent),
		configuration.gradient ? "g" : "f",
		stops,
		configuration.surfaceCollapsed ? "S" : "s",
		configuration.accentCollapsed ? "A" : "a",
		escape,
	].join("|")
}

/** The field order a configuration renders as. */
export function fieldOrderOf(configuration: Configuration): FieldOrder {
	if (configuration.gradient) return "ramp"
	return configuration.surfaceCollapsed ? "collapsed" : "two-flat"
}

/** A configuration flattened to hex, for a JSONL row and for a reviewer's eye. */
export function summarise(configuration: Configuration): ConfigurationSummary {
	return {
		background: rgbToHex(configuration.background),
		surface: rgbToHex(configuration.surface),
		foreground: rgbToHex(configuration.foreground),
		accent: rgbToHex(configuration.accent),
		gradient: configuration.gradient,
		stops: configuration.stops.map((stop) => ({
			hex: rgbToHex(stop.rgb),
			position: stop.position,
		})),
		surfaceCollapsed: configuration.surfaceCollapsed,
		accentCollapsed: configuration.accentCollapsed,
		escape: configuration.escape === null
			? null
			: { role: configuration.escape.role, color: configuration.escape.color },
		fieldOrder: fieldOrderOf(configuration),
	}
}

/**
 * **APCA over the rendered field** — the foreground's readability ranking.
 *
 * Round 1's reviewer evidence names foreground readability as the dominant failure class: 7 of the 10
 * unacceptable sides were called unreadable, invisible, or weak-contrast text. Cycle 1's foreground
 * order was arm-b′ §2.6's *text-ness* order (thinness, then member count, then collinearity) and it
 * contains no contrast term at all — on `…d859a69094` it published `#939393` on a white-to-grey ramp,
 * which is thin, numerous, collinear and unreadable.
 *
 * So: after text-first candidacy, the remaining foreground candidates are ordered by the **minimum
 * APCA contrast over the whole rendered field**, largest first.
 *
 * ### This is a ranking, not a gate
 *
 * There is no threshold in this file. The contract's floors are deliberately low
 * (`EPSILON_TEXT_RAW` = 2.5, the "not literally invisible" line) and the constraint sheet keeps them
 * there; raising one here would be a second contrast policy competing with the contract's. What this
 * does is choose the **most readable of the artwork's own candidates** — every one of which is still
 * an exact triple of the artwork, and any of which the contract would accept.
 *
 * ### One APCA code path, and it is the contract's
 *
 * `minRawContrastOverRamp` is the function invariant 4 itself calls to enforce the whole-ramp floor
 * (`invariants.ts`, `validateContrastFloors` → `ramp.ts`), at the same default sampling
 * (`RAMP_SAMPLES_PER_SEGMENT`, `RAMP_REFINEMENT_SAMPLES`). The flat pairs use `apcaRaw`, which is the
 * same function invariant 4 uses for the flat pairs. Nothing here re-implements APCA, re-derives a
 * luminance, or re-samples a ramp on its own schedule — a ranking that disagreed with the validator
 * about what "contrast" means would be choosing colours the validator then refuses.
 *
 * ### What "the whole rendered field" means
 *
 * Exactly the four pairs `CONTRAST_FLOOR_PAIRS` covers for the foreground, plus the ramp clause:
 * against `background`, against `surface`, and — when a gradient is published — against every point of
 * the OKLab interpolation between them, at the raw pre-clamp minimum. The score is the smallest of the
 * three. A candidate that is legible against both endpoints and invisible in the middle scores as
 * invisible, which is the reviewer's 2026-08-03 ruling stated as an ordering: *"it's not 'each stop'
 * by the way, because the contrast issue could happen somewhere in the middle of 2 points too."*
 */

import { apcaRaw, colorFromRgb } from "../../../../src/contract/color.ts"
import { minRawContrastOverRamp } from "../../../../src/contract/ramp.ts"
import type { GradientStop, PaletteColor, Rgb8 } from "../../../../src/contract/types.ts"

/**
 * The field a candidate is judged against: the two field roles, and the ramp if one is published.
 *
 * `stops` is `null` for a flat or partitioned field, in which case the ramp clause simply does not
 * apply — there is no rendered interpolation to be invisible inside.
 */
export type RenderedField = Readonly<{
	background: PaletteColor
	surface: PaletteColor
	stops: readonly GradientStop[] | null
}>

/** Build the rendered field from the parse's published field roles. */
export function renderedFieldOf(background: Rgb8, surface: Rgb8, gradient: boolean): RenderedField {
	const backgroundColor = colorFromRgb(background)
	const surfaceColor = colorFromRgb(surface)
	return {
		background: backgroundColor,
		surface: surfaceColor,
		stops: gradient
			? [
				{ color: backgroundColor, position: 0 },
				{ color: surfaceColor, position: 1 },
			]
			: null,
	}
}

/**
 * The **minimum |raw APCA| of `subject` over the whole rendered field**.
 *
 * Raw and pre-clamp, per the constraint sheet: the clamped Lc form flattens everything below the
 * clamp to one value, and the whole point of the ranking is to tell two nearly-invisible candidates
 * apart. A non-finite APCA (which `apcaRaw` can return for a colour the model cannot place) scores
 * `-Infinity`, so such a candidate sorts last and is never silently promoted.
 */
export function minFieldContrast(subject: Rgb8, field: RenderedField): number {
	let worst = Number.POSITIVE_INFINITY
	for (const against of [field.background, field.surface]) {
		const raw = apcaRaw(subject, against.rgb)
		if (!Number.isFinite(raw)) return Number.NEGATIVE_INFINITY
		const magnitude = Math.abs(raw)
		if (magnitude < worst) worst = magnitude
	}
	if (field.stops !== null) {
		const extremum = minRawContrastOverRamp(colorFromRgb(subject), field.stops)
		if (extremum === null || !Number.isFinite(extremum.raw)) return Number.NEGATIVE_INFINITY
		const magnitude = Math.abs(extremum.raw)
		if (magnitude < worst) worst = magnitude
	}
	return worst
}

/** `r << 16 | g << 8 | b`, which is ascending lexicographic RGB — the house tie-break. */
function packed(color: Rgb8): number {
	return (color[0] << 16) | (color[1] << 8) | color[2]
}

/**
 * Order candidates by `minFieldContrast`, largest first.
 *
 * Decorate–sort–undecorate, because the score is not cheap: a ramp minimum costs
 * `RAMP_SAMPLES_PER_SEGMENT + RAMP_REFINEMENT_SAMPLES` APCA evaluations and a comparator would pay for
 * it `O(n log n)` times instead of `n`.
 *
 * Ties break on lexicographic RGB. There is no bar on this quantity — the contract measures APCA in
 * raw units and has never published a just-noticeable difference for them — so the comparison is
 * exact, and the tie-break is what makes exactness safe: two candidates whose scores differ in the
 * last float bit are ordered by their pixel values and not by the input order.
 */
export function rankByFieldContrast(
	colors: readonly Rgb8[],
	field: RenderedField,
	scoreOf: (color: Rgb8, field: RenderedField) => number = minFieldContrast,
): Rgb8[] {
	const scored = colors.map((color) => ({ color, score: scoreOf(color, field), key: packed(color) }))
	scored.sort((first, second) => second.score - first.score || first.key - second.key)
	return scored.map((entry) => entry.color)
}

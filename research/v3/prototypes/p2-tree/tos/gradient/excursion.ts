/**
 * **The excursion test** — how far off the artwork a published ramp actually renders.
 *
 * `DECISIONS.md` D6 states the exposure this file closes, and it is worth carrying at the top of the
 * implementation because it is the reason the file exists at all:
 *
 * > **The symmetric error is P2's live exposure:** 2-stop-always is NOT the safe harbor — a 2-stop
 * > ramp whose straight OKLab line leaves the artwork OWES a guide stop (C7: 42% of legacy midpoints
 * > sit outside their endpoints' lightness span). P2 publishes 2-stop-only as a recorded cycle-1 cut
 * > with no excursion test, so today we cannot even detect when we owe one.
 *
 * The measurement is **report-only** on its own. It never adds, removes or moves a stop; `guide-stop.ts`
 * does that, and only under this file's numbers. Running it on every published ramp — including the
 * ones that pass — is the census D6 asks for.
 *
 * ## What is measured, precisely
 *
 * The **rendered** ramp, not the fitted one. `sampleRamp` interpolates in OKLab and quantises each
 * sample back to an 8-bit sRGB triple, which is what a framebuffer holds and what a viewer sees; the
 * excursion at a sample is the OKLab distance from *that* triple to the nearest triple the artwork
 * actually contains. Samples that land exactly on a published stop are exact artwork pixels by the
 * contract's own exactness rule, so they measure zero and the maximum is always attained in a
 * segment's interior unless the ramp is degenerate.
 *
 * One documented approximation, inherited rather than introduced: `src/contract/ramp.ts` clips
 * out-of-gamut interpolants where a browser gamut-*maps* them (CSS Color 4 §13). The two agree except
 * where the straight OKLab segment leaves sRGB — which is itself an excursion, so this test reads such
 * a ramp as off-artwork either way, and the direction of the disagreement is the safe one.
 *
 * ## Bar units
 *
 * See `constants.ts`: each sample's excursion is divided by the same-colour bar of its own
 * *(rendered, nearest)* pair, because the contract's bar is regional and the excursion bar is defined
 * as a multiple of it. `EXCURSION_BAR_MULTIPLE` is therefore a single uniform threshold on the
 * resulting axis, and a maximum over samples is comparable across a ramp that spans two regions.
 */

import { colorFromRgb, okLabDistance, rgbToHex, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import { sampleRamp } from "../../../../src/contract/ramp.ts"
import type { GradientStop, HexColor, Rgb8 } from "../../../../src/contract/types.ts"
import { EXCURSION_BAR_MULTIPLE, EXCURSION_SAMPLES_PER_SEGMENT } from "./constants.ts"
import { nearestOccupied, type Occupancy } from "./occupancy.ts"

/** What one rendered ramp measured against one artwork. Every field is reported, always. */
export type ExcursionMeasurement = Readonly<{
	/** How many rendered samples were tested. */
	samples: number
	/** How many published stops the ramp had when it was measured. */
	stops: number
	/** The worst excursion, in bar units (`distance / that pair's own same-colour bar`). */
	maxBars: number
	/** The same worst excursion in raw OKLab distance, for a reader who wants the unnormalised number. */
	maxDistance: number
	/** The same-colour bar that governed the worst sample's pair. */
	bar: number
	/** The ramp parameter `t` at which the worst excursion occurs. */
	position: number
	/** The colour the viewer sees at `position`. */
	rendered: HexColor
	/** The artwork colour nearest to it — the colour the ramp *should* have been passing through. */
	nearest: HexColor
	/** `maxBars > EXCURSION_BAR_MULTIPLE`: the ramp demonstrably leaves the artwork. */
	overBar: boolean
	/**
	 * The part of the excursion the contract does not tolerate: `max(0, maxBars − EXCURSION_BAR_MULTIPLE)`.
	 *
	 * This is the quantity a guide stop exists to remove, and the quantity `guide-stop.ts` builds its
	 * material-fall rule out of. Zero on every ramp that passes.
	 */
	overshootBars: number
}>

/**
 * Measure one ramp against one artwork.
 *
 * Deterministic: `sampleRamp` emits a fixed sample sequence, `nearestOccupied` breaks its own ties on
 * lexicographic RGB, and the maximum is taken with a strict comparison so the **first** (smallest
 * `t`) of any tied worst samples is the one reported.
 */
export function measureExcursion(stops: readonly GradientStop[], occupancy: Occupancy): ExcursionMeasurement {
	const samples = sampleRamp(stops, EXCURSION_SAMPLES_PER_SEGMENT)
	let maxBars = 0
	let maxDistance = 0
	let bar = 0
	let position = stops.length > 0 ? stops[0].position : 0
	let rendered: Rgb8 = stops.length > 0 ? stops[0].color.rgb : [0, 0, 0]
	let nearest: Rgb8 = rendered

	for (const sample of samples) {
		const lab = rgbToOkLab(sample.color.rgb)
		const found = nearestOccupied(occupancy, lab)
		if (found.distance === 0) continue
		const pairBar = sameColorBar(sample.color, colorFromRgb(found.rgb))
		const bars = found.distance / pairBar
		if (bars > maxBars) {
			maxBars = bars
			maxDistance = found.distance
			bar = pairBar
			position = sample.position
			rendered = sample.color.rgb
			nearest = found.rgb
		}
	}

	if (maxBars === 0 && stops.length > 0) {
		// Every sample landed exactly on an artwork colour. Report the ramp's own first stop as the
		// site, so the record still names a position and two colours rather than carrying nulls.
		bar = sameColorBar(stops[0].color, stops[0].color)
		nearest = stops[0].color.rgb
	}

	return {
		samples: samples.length,
		stops: stops.length,
		maxBars,
		maxDistance,
		bar,
		position,
		rendered: rgbToHex(rendered),
		nearest: rgbToHex(nearest),
		overBar: maxBars > EXCURSION_BAR_MULTIPLE,
		overshootBars: Math.max(0, maxBars - EXCURSION_BAR_MULTIPLE),
	}
}

/** Whether two colours differ by at least the contract's bar for their own pair. */
export function separatedByOneBar(first: Rgb8, second: Rgb8): boolean {
	const firstColor = colorFromRgb(first)
	const secondColor = colorFromRgb(second)
	return okLabDistance(rgbToOkLab(first), rgbToOkLab(second)) >= sameColorBar(firstColor, secondColor)
}

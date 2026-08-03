/**
 * The **rendered gradient ramp**: the continuum of colours a viewer actually sees between the
 * published stops, and the minimum contrast anything is held to over it.
 *
 * `PHASE_0_DECISIONS.md` §2 makes the preview renderer part of the output contract — "gradient
 * verdicts are verdicts about a rendered ramp" — so a contrast floor that only inspects the
 * published stops is checking the corners of a picture and calling it the picture. The reviewer's
 * ruling of 2026-08-03 is verbatim: *"it's not 'each stop' by the way, because the contrast issue
 * could happen somewhere in the middle of 2 points too."* Everything in this file exists to answer
 * the whole-ramp question instead of the per-stop one.
 *
 * ## The interpolation space
 *
 * `[REVIEWED — reviewer's own statement, 2026-08-03]`: *"minimum contrast over the entire rendered
 * ramp, sampled in the interpolation space the player actually renders — this space is OKLab."*
 *
 * This is also what the pinned renderer emits, checked rather than assumed: `gradientCss()` in
 * `../review-server/gradient.ts` produces
 * `linear-gradient(135deg in oklab, …)`, with the interpolation hint present and non-default, and
 * four separate review-server tests pin that exact string. So the served preview and the reviewer's
 * stated space agree, and no emitter fix is needed. The space is declared once, in
 * `RAMP_INTERPOLATION_SPACE`, and the CSS emitter reads it from there so the two cannot drift.
 *
 * The alternative mattered and was measured, because a *missing* hint would have meant CSS's default
 * — sRGB interpolation — silently rendering a different ramp than the one being validated. See
 * `contract-ramp.test.ts` for the measured worst-case divergence between the two spaces; it is large
 * enough that the distinction is not academic.
 *
 * CSS Color 4 defines `in oklab` as componentwise linear interpolation of L, a and b (rectangular,
 * not polar — `in oklch` would be the polar one, and is not what the renderer asks for). Alpha is
 * not involved: invariant 5 refuses transparent input, and every published colour is opaque.
 *
 * ## Which ramp the floor governs, and why the other one comes free
 *
 * The floor governs the ramp over the **published** stop positions — the true fitted values. The
 * mock renders *display-mapped* positions (`REVIEW_UI.md` §3: `display = reserve + published ×
 * (1 − reserve)`), and the two are the same check, which is why there is no second one:
 *
 * - The display mapping is a strictly increasing affine map of position that leaves every stop's
 *   **colour** and every stop's **order** untouched. Reparameterizing a curve does not change the
 *   curve. The set of colours rendered between two consecutive stops is therefore identical under
 *   both parameterizations — only the rate along the field changes.
 * - The lead-in `[0, reserve)` that the mapping opens up renders as the flat first-stop colour (CSS
 *   clamps a gradient before its first stop), and that colour is already on the ramp at t = 0.
 * - The CSS emitter rounds display percentages to two decimals. Rounding is monotone
 *   non-decreasing, so it cannot reorder stops; the most it can do is collapse two stops that sit
 *   within 0.01% of each other into a hard stop, which *removes* interior colours. So the display
 *   ramp's colour set is a subset of the published ramp's.
 *
 * A minimum over a set is monotone under subsetting, so `min |raw|` over the display ramp is always
 * **≥** the value computed here: enforcing on the published ramp is exact in the ordinary case and
 * conservative in the degenerate one.
 *
 * `contract-ramp.test.ts` checks this on the fixtures rather than leaving it as an argument — and
 * checks the thing that is actually true of it. What must agree is the **verdict**, at every floor a
 * caller can request, and it does. What cannot be asserted bit-for-bit is the reported *number*: the
 * two parameterizations place their samples differently, so each lands in a slightly different 8-bit
 * quantisation cell at the bottom of a basin. That is the documented deep-basin residual of
 * `RAMP_REFINEMENT_SAMPLES`, and it is a fact about sampling a step function, not a difference
 * between the two ramps.
 *
 * **Documented consequence.** This equivalence is a property of the *current* display mapping, not a
 * theorem about display mappings. Any future mapping that is not a strictly increasing function of
 * published position — one that reorders stops, drops one, or inserts a colour of its own — breaks
 * it, and the floor would then have to be evaluated on the display ramp separately. The mapping is
 * `[REVIEWED]` and pinned, so this is a note for whoever changes it, not a live gap.
 *
 * ## Two searches, because the two roles are shaped differently
 *
 * `minRawContrastOverRamp` is the plain minimisation and serves the **foreground**, which has one
 * dimension and no escape at any distance. `firstInvisibleAccentOnRamp` serves the **accent**, whose
 * floor is a conjunction and therefore has to be searched pointwise rather than minimised twice. Both
 * are the reviewer's whole-ramp ruling of 2026-08-03; the second one's docstring carries the argument
 * for why a conjunction needs its own search.
 *
 * The threshold the accent's search takes changed on 2026-08-04 — from a detection distance to
 * `ACCENT_FUNCTIONAL_DISTANCE` — without changing either search's shape.
 *
 * ## Out-of-gamut interpolants
 *
 * The sRGB gamut is not convex in OKLab, so the straight OKLab segment between two in-gamut sRGB
 * stops can leave sRGB in its interior. This file converts back with `okLabToRgb`, which **clips**
 * each channel and rounds to 8 bits. Browsers are specified to gamut-*map* (CSS Color 4 §13,
 * chroma reduction in OKLCh) rather than clip, so for an excursion the sampled colour and the
 * rendered colour can differ. The measured excursion on the fixtures and on a stress sweep is
 * reported by `contract-ramp.test.ts`; it is a documented approximation, not a claim of equality.
 */

import { apcaRaw, colorDistance, colorFromRgb, okLabToRgb, rgbToOkLab } from "./color.ts"
import { RAMP_REFINEMENT_SAMPLES, RAMP_SAMPLES_PER_SEGMENT } from "./constants.ts"
import type { GradientStop, OkLab, PaletteColor, Rgb8 } from "./types.ts"

/**
 * The colour space the rendered ramp is interpolated in.
 *
 * `[REVIEWED — reviewer's own statement, 2026-08-03]` — see the file docstring. Declared here and
 * consumed by `../review-server/gradient.ts` when it builds the CSS, so the space this file measures
 * and the space the browser is told to use are one value.
 */
export const RAMP_INTERPOLATION_SPACE = "oklab" as const

/** One point on the rendered ramp. */
export type RampSample = Readonly<{
	/** Position along the published ramp parameter, in [0,1]. */
	position: number
	/** The colour the viewer sees there, quantised to 8 bits exactly as a framebuffer would. */
	color: PaletteColor
	/**
	 * The index of the published stop this sample *is*, or `null` for an interpolated point. Set only
	 * for samples that land exactly on a stop, which lets a violation name `gradient.stops[2]` when
	 * the minimum happens to sit on a stop and `gradient.ramp@t` when it does not.
	 */
	stopIndex: number | null
}>

function lerpOkLab(first: OkLab, second: OkLab, u: number): OkLab {
	return [
		first[0] + (second[0] - first[0]) * u,
		first[1] + (second[1] - first[1]) * u,
		first[2] + (second[2] - first[2]) * u,
	]
}

/**
 * The colour at one position on the rendered ramp.
 *
 * Positions outside the stop range clamp to the end stops, which is what CSS does before the first
 * stop and after the last. Exactly-on-a-stop returns the published pixel itself rather than a
 * round-tripped approximation of it — the contract publishes exact source pixels and the renderer
 * emits those hex digits verbatim, so the ramp must pass through them exactly.
 */
export function rampColorAt(stops: readonly GradientStop[], position: number): Rgb8 {
	if (stops.length === 0) throw new RangeError("a ramp needs at least one stop")
	if (position <= stops[0].position) return stops[0].color.rgb
	const last = stops[stops.length - 1]
	if (position >= last.position) return last.color.rgb

	let index = 0
	while (index < stops.length - 2 && position >= stops[index + 1].position) index++
	const from = stops[index]
	const to = stops[index + 1]
	const span = to.position - from.position
	if (!(span > 0)) return to.color.rgb
	const u = (position - from.position) / span
	if (u <= 0) return from.color.rgb
	if (u >= 1) return to.color.rgb
	return okLabToRgb(lerpOkLab(rgbToOkLab(from.color.rgb), rgbToOkLab(to.color.rgb), u))
}

/**
 * Every sample of the rendered ramp the floors are evaluated at, in the coarse pass.
 *
 * Deterministic by construction: `samplesPerSegment` uniform steps **per segment**, so density does
 * not depend on how the fitted stops happen to be spaced, plus every published stop position exactly.
 * A 4-stop ramp at the default density is 3 × 2048 + 1 = 6145 samples.
 *
 * Sampling per segment rather than over the whole ramp is what makes the density claim in
 * `RAMP_SAMPLES_PER_SEGMENT` true of a ramp whose stops sit at 0, 0.98 and 1 as well as of an evenly
 * spaced one.
 */
export function sampleRamp(
	stops: readonly GradientStop[],
	samplesPerSegment: number = RAMP_SAMPLES_PER_SEGMENT,
): RampSample[] {
	if (!Number.isInteger(samplesPerSegment) || samplesPerSegment < 1) {
		throw new RangeError(`samplesPerSegment must be a positive integer, got ${samplesPerSegment}`)
	}
	const samples: RampSample[] = []
	if (stops.length === 0) return samples

	samples.push({ position: stops[0].position, color: stops[0].color, stopIndex: 0 })
	for (let index = 0; index + 1 < stops.length; index++) {
		const from = stops[index]
		const to = stops[index + 1]
		const span = to.position - from.position
		for (let step = 1; step < samplesPerSegment; step++) {
			const u = step / samplesPerSegment
			const position = from.position + span * u
			const rgb = span > 0
				? okLabToRgb(lerpOkLab(rgbToOkLab(from.color.rgb), rgbToOkLab(to.color.rgb), u))
				: to.color.rgb
			samples.push({ position, color: colorFromRgb(rgb), stopIndex: null })
		}
		samples.push({ position: to.position, color: to.color, stopIndex: index + 1 })
	}
	return samples
}

/**
 * The **refinement pass**: `RAMP_REFINEMENT_SAMPLES` more points inside the one coarse step either
 * side of a position of interest.
 *
 * The coarse pass finds which part of the ramp the minimum lives in; this pass finds the minimum.
 * The two are separate because the thing being minimised is a *step* function — the ramp is rendered
 * to 8-bit colour, so `|raw|` is piecewise constant in `t` and its true minimum sits in whichever
 * quantisation cell happens to come closest to the subject's luminance. Uniform sampling can step
 * over a narrow cell; measured, that costs up to **0.406 raw units** of overstated minimum at the
 * coarse density alone. Rescanning the coarse minimum's neighbourhood at `2048 × 4096 / 2 ≈ 4.2 M`
 * effective samples per segment cuts it to **≤ 0.05** wherever the true minimum is at or above 1 raw
 * unit — the whole range in which the number is worth quoting (`contract-ramp.test.ts`).
 *
 * Note this refines the *reported number*. The *verdict* was already safe at the coarse density, for
 * the window-width reason set out in `RAMP_SAMPLES_PER_SEGMENT` — refinement is what lets the
 * violation quote a minimum a reader can trust, and closes the theoretical gap the empirical
 * agreement left open.
 */
export function refineRamp(
	stops: readonly GradientStop[],
	position: number,
	samplesPerSegment: number = RAMP_SAMPLES_PER_SEGMENT,
	refinementSamples: number = RAMP_REFINEMENT_SAMPLES,
): RampSample[] {
	if (!Number.isInteger(refinementSamples) || refinementSamples < 1 || stops.length === 0) return []
	const first = stops[0].position
	const last = stops[stops.length - 1].position
	const step = (last - first) / (samplesPerSegment * Math.max(1, stops.length - 1))
	const from = Math.max(first, position - step)
	const to = Math.min(last, position + step)
	if (!(to > from)) return []
	const samples: RampSample[] = []
	for (let index = 0; index <= refinementSamples; index++) {
		const at = from + (to - from) * (index / refinementSamples)
		samples.push({ position: at, color: colorFromRgb(rampColorAt(stops, at)), stopIndex: null })
	}
	return samples
}

/**
 * Does this sample beat the incumbent minimum?
 *
 * Strictly lower `|raw|` wins. **A tie goes to a published stop**, and that is not cosmetic: the
 * rendered ramp is 8-bit, so a run of interpolated positions carries the *same colour* as the stop
 * they lead into, and the earliest of them would otherwise win a tie on position alone. A violation
 * would then report `gradient.ramp@0.995361` for a colour the palette publishes as
 * `gradient.stops[2]` — the same defect the whole-ramp check was meant to fix, inverted. Preferring
 * the stop keeps `I4.stop-below-contrast-floor` firing whenever the offending colour is one a reader
 * can look up, and leaves `I4.ramp-below-contrast-floor` meaning what it says: a colour that exists
 * only between the stops.
 */
function improves(raw: number, sample: RampSample, best: RampExtremum): boolean {
	const magnitude = Math.abs(raw)
	const incumbent = Math.abs(best.raw)
	if (magnitude < incumbent) return true
	if (magnitude > incumbent) return false
	return sample.stopIndex !== null && best.stopIndex === null
}

/** Where on the ramp a minimum was found, and what was measured there. */
export type RampExtremum = Readonly<{
	position: number
	color: PaletteColor
	stopIndex: number | null
	/** Signed raw pre-clamp APCA of the subject colour against the ramp colour at `position`. */
	raw: number
	/**
	 * OKLab distance between the subject colour and the ramp colour at `position`.
	 *
	 * **Judged for the accent, reported for the foreground.** The accent's clause consults it against
	 * `ACCENT_FUNCTIONAL_DISTANCE`; the foreground's never does, at any value, and carries it through
	 * to the violation's `measured` block purely so a census can count how close a failing text pair
	 * was in colour.
	 */
	distance: number
}>

/**
 * The **minimum contrast over the entire rendered ramp** — the reviewer's ruling, as a number.
 *
 * Returns the sample minimising `|raw APCA|` between `subject` and the ramp, together with the OKLab
 * distance measured *at that same sample*. Ties resolve to the earliest position, so the answer is a
 * pure function of the palette.
 *
 * Returns `null` only when the ramp has no samples, which needs a malformed stop list — invariant 1's
 * problem, not this one's.
 */
export function minRawContrastOverRamp(
	subject: PaletteColor,
	stops: readonly GradientStop[],
	samplesPerSegment: number = RAMP_SAMPLES_PER_SEGMENT,
	refinementSamples: number = RAMP_REFINEMENT_SAMPLES,
): RampExtremum | null {
	let best: RampExtremum | null = null
	let notComputable: RampExtremum | null = null

	const consider = (sample: RampSample): void => {
		const raw = apcaRaw(subject.rgb, sample.color.rgb)
		if (!Number.isFinite(raw)) {
			notComputable ??= { ...sample, raw, distance: Number.NaN }
			return
		}
		if (best !== null && !improves(raw, sample, best)) return
		best = { ...sample, raw, distance: colorDistance(subject, sample.color) }
	}

	for (const sample of sampleRamp(stops, samplesPerSegment)) consider(sample)
	if (notComputable !== null) return notComputable
	if (best === null) return null
	for (const sample of refineRamp(stops, best.position, samplesPerSegment, refinementSamples)) {
		consider(sample)
	}
	return notComputable ?? best
}

/**
 * The **accent's two-tier floor**, evaluated over the entire rendered ramp.
 *
 * The accent's clause is not one floor but a conjunction: an accent is invisible against a field only
 * when luminance *and* colour both fail (`invariants.ts`, invariant 4). Applying the reviewer's
 * whole-ramp ruling to a conjunction has exactly one correct reading, and it is **pointwise**:
 *
 * > the accent is invisible somewhere on the ramp ⟺ **∃ t** such that `|raw(t)| < floor` **and**
 * > `distance(t) < functionalDistance`.
 *
 * Both dimensions are therefore evaluated at the *same* ramp point. Minimising them independently and
 * comparing the two minima would be a different, stricter, and wrong test: a ramp that is isoluminant
 * with the accent at one end and the accent's own hue at the other end would fail it while being
 * perfectly visible everywhere. So the answer to "does the distance also need a ramp treatment?" is
 * yes, it gets one, and this is it — the distance is a ramp-wide quantity here, not a stop-wide one,
 * because it is re-measured at every sample.
 *
 * **Which distance changed on 2026-08-04, and the shape did not.** The threshold passed in used to be
 * `ACCENT_VISIBILITY_COLOR_DISTANCE`, a *detection* measurement; the reviewer ruled detection the
 * wrong criterion for a contrast escape and it is now `ACCENT_FUNCTIONAL_DISTANCE`, which is larger.
 * The pointwise argument above is untouched by that — it is about how a conjunction interacts with a
 * minimisation, not about what either threshold is worth. The foreground has no second dimension at
 * any value and never reaches this function.
 *
 * Returns the invisible sample with the smallest `|raw|` (earliest position on a tie), or `null` when
 * the accent is functional everywhere on the ramp.
 */
export function firstInvisibleAccentOnRamp(
	accent: PaletteColor,
	stops: readonly GradientStop[],
	floorRawMagnitude: number,
	functionalDistance: number,
	samplesPerSegment: number = RAMP_SAMPLES_PER_SEGMENT,
	refinementSamples: number = RAMP_REFINEMENT_SAMPLES,
): RampExtremum | null {
	let worst: RampExtremum | null = null

	const consider = (sample: RampSample): RampExtremum | null => {
		const raw = apcaRaw(accent.rgb, sample.color.rgb)
		if (!Number.isFinite(raw)) return { ...sample, raw, distance: Number.NaN }
		if (Math.abs(raw) >= floorRawMagnitude) return null
		const distance = colorDistance(accent, sample.color)
		if (distance >= functionalDistance) return null
		if (worst !== null && !improves(raw, sample, worst)) return null
		worst = { ...sample, raw, distance }
		return null
	}

	for (const sample of sampleRamp(stops, samplesPerSegment)) {
		const broken = consider(sample)
		if (broken !== null) return broken
	}

	// The refinement pass looks around the ramp's *luminance* minimum against the accent, not around
	// `worst`: when the coarse pass found nothing invisible there may still be a narrow quantisation
	// cell that is, and it will be next to the closest approach in luminance. When the coarse pass did
	// find something, that closest approach is the same place.
	const closest = minRawContrastOverRamp(accent, stops, samplesPerSegment, 0)
	if (closest === null) return worst
	for (const sample of refineRamp(stops, closest.position, samplesPerSegment, refinementSamples)) {
		const broken = consider(sample)
		if (broken !== null) return broken
	}
	return worst
}

/**
 * The dotted path naming a point on the ramp, for a violation's `subjects`.
 *
 * A minimum that lands on a published stop is named as that stop — the census, and anyone reading the
 * violation, wants `gradient.stops[2]` when the offending colour is one the palette actually
 * publishes. A minimum in the interior is named by its position, to six decimals, matching the
 * canonical position precision the renderer serves.
 */
export function rampPath(extremum: RampExtremum): string {
	return extremum.stopIndex === null
		? `gradient.ramp@${extremum.position.toFixed(6)}`
		: `gradient.stops[${extremum.stopIndex}]`
}

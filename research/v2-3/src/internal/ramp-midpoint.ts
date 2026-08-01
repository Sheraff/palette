import { mixOKLab, okDistance, oklabToRGB, perceptualDifference, rgbAt, rgbToHex } from "./color.ts";

import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "./policy.ts";

import type { NativePaletteEvidence } from "./palette-core.ts";

import type { AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor } from "./gradient-support.ts";

import type { OKLab, RGB } from "./types.ts";

/**
 * Ramp-midpoint insertion.
 *
 * A published gradient renders as a straight OKLab interpolation between the background and the
 * surface. That is faithful only when the artwork actually holds colours all the way along that
 * straight line. When it does not — when the segment between a dark teal and a dark oxblood runs
 * through a grey-purple no pixel of the artwork carries — the render invents a colour and reads as
 * not belonging to the artwork.
 *
 * This module measures that directly ("how far does the rendered ramp stray from the nearest colour
 * the artwork actually has?") and, when the answer is too far, nominates a third stop drawn from the
 * artwork's own populated colours that bends the ramp back onto them.
 *
 * It is deliberately NOT an endpoint mechanism. It never touches which endpoints were chosen, and it
 * runs after the gradient flag is already settled, so it cannot change which artworks publish a
 * gradient — only whether a gradient that is already firing, and carries no third stop, gains one.
 *
 * The existing three-stop route (`fieldMidpointEvidence` -> `earnedFieldMidpoint`) asks a different
 * question: what colour does the field carry at the gradient's *spatial* midpoint. That route is
 * bounded by the modal colour of one spatial band per fit, which is why it offers roughly two and a
 * half distinct midpoint colours per artwork
 * (`research/v2-3-experiments/midpoint-fidelity/EXPERIMENT.md` §3.3). This route asks a colour-space
 * question instead and draws from every populated colour in the artwork. Where the spatial route has
 * already spoken, it keeps the floor unconditionally — see `rampMidpointInsertion` for the measurement
 * that settled that.
 */

/**
 * Master switch. `false` is the shipped behaviour and makes every extraction byte-identical to a tree
 * without this file: `rampMidpointInsertion` returns `null` before reading a single pixel.
 */
export const RAMP_MIDPOINT_INSERTION: boolean = false

/**
 * How much of the artwork a quantised colour must occupy before the ramp is allowed to count it as
 * "a colour this artwork has", and before it may be nominated as a third stop.
 *
 * The representativity rule is the reason this exists at all: a midpoint must never be a lone pixel,
 * and neither may the yardstick the excursion is measured against — a scattering of JPEG ringing
 * pixels in the shadows would otherwise certify any dark segment as fully supported. One thousandth
 * of the artwork is roughly 400 pixels on a 640x640 master and roughly 120 on a 350 px thumbnail,
 * which is two orders of magnitude above `mark.minimumComponentPopulation` and therefore cannot be
 * met by noise at either scale.
 */
export const RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION = 0.001

/**
 * Where along the rendered ramp the excursion is measured.
 *
 * The endpoints themselves are source colours by construction, so sampling at or beside them only
 * measures the fact that they were selected. The samples stop one tenth short of each end and step
 * by a tenth, which resolves any single stretch of the ramp wide enough for a viewer to see as its
 * own colour; a finer grid moves no case in this corpus.
 */
const RAMP_SAMPLE_POSITIONS: readonly number[] =
	Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])

/**
 * How far a two-stop ramp may stray, in ΔE, from the nearest colour the artwork actually holds before
 * it counts as having left the artwork.
 *
 * Stated in the same currency as the midpoint distinctness bar, because it is the same kind of
 * question: ΔE is the scale on which "would a viewer call these the same colour?" is answerable, and
 * `distinctness.sameColor` = 3.3 is one such difference. Two and a half of them is where the corpus
 * puts the boundary, not where this module chose to put it — over the 41 gradient artworks that
 * publish no third stop today, the excursions run continuously up to 7.90 and then stop, and the next
 * one is the artwork the reviewer asked for a midpoint on, at 9.19. The bar sits in that empty band.
 *
 * HONEST WEAKNESS, and the reason this is behind a flag. The band is 1.29 ΔE wide and has exactly one
 * artwork above it with a human judgement on the question, so this bar is fitted to a single positive
 * anchor. It is not robust to +-20 %: at 6.60 it fires on 19 gradients and hands a new third stop to
 * 10 that are reviewed strong without one, and at 9.90 it does not fire on the anchor at all. Full
 * accounting in
 * `research/v2-3-experiments/ramp-midpoint-insertion/EXPERIMENT.md` §2.
 */
export const RAMP_EXCURSION_BAR = 2.5 * ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness.sameColor

/** A colour the artwork holds, with the exact source pixel that stands for it. */
export type RampSupportColor = Readonly<{
	rgb: RGB
	oklab: OKLab
	hex: string
	population: number
	populationFraction: number
	familyId: string
	pixelIndex: number
	x: number
	y: number
}>

type SupportBin = {
	count: number
	bestPixelIndex: number
	bestDistance: number
}

function quantize(value: number, step: number): number {
	return Math.floor(value / step)
}

/**
 * Every colour the artwork holds with real population, one entry per occupied quantisation cell.
 *
 * The cell is the family bin step the rest of the evidence pass already uses, so "a different colour"
 * means here exactly what it means everywhere else in this algorithm. The representative is the exact
 * source pixel nearest its cell's centre, ties broken by the lower pixel index, so the result is a
 * pure function of the image.
 */
export function buildRampSupport(evidence: NativePaletteEvidence): readonly RampSupportColor[] {
	const step = evidence.familyBinStep
	const bins = new Map<number, SupportBin>()
	const { labs, pixelCount } = evidence
	for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
		const offset = pixelIndex * 3
		const lightness = labs[offset]
		const a = labs[offset + 1]
		const b = labs[offset + 2]
		const li = quantize(lightness, step)
		const ai = quantize(a, step)
		const bi = quantize(b, step)
		// Signed cell indices packed into one integer key; the offsets are wide enough for the whole
		// OKLab gamut at any step this evidence pass produces.
		const key = ((li + 512) * 1024 + (ai + 512)) * 1024 + (bi + 512)
		const centerL = (li + 0.5) * step
		const centerA = (ai + 0.5) * step
		const centerB = (bi + 0.5) * step
		const distance = Math.hypot(lightness - centerL, a - centerA, b - centerB)
		const existing = bins.get(key)
		if (existing === undefined) {
			bins.set(key, { count: 1, bestPixelIndex: pixelIndex, bestDistance: distance })
			continue
		}
		existing.count += 1
		if (distance < existing.bestDistance) {
			existing.bestDistance = distance
			existing.bestPixelIndex = pixelIndex
		}
	}
	const minimumPopulation = pixelCount * RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION
	const support: RampSupportColor[] = []
	for (const bin of bins.values()) {
		if (bin.count < minimumPopulation) continue
		const pixelIndex = bin.bestPixelIndex
		const offset = pixelIndex * 3
		const rgb = rgbAt(evidence.rgbData, pixelIndex)
		support.push({
			rgb,
			oklab: [labs[offset], labs[offset + 1], labs[offset + 2]],
			hex: rgbToHex(rgb),
			population: bin.count,
			populationFraction: bin.count / pixelCount,
			familyId: evidence.families[evidence.familyAt[pixelIndex]]?.id ?? "",
			pixelIndex,
			x: pixelIndex % evidence.width,
			y: Math.floor(pixelIndex / evidence.width),
		})
	}
	// Map iteration order follows insertion, which follows the pixel scan, which is already a pure
	// function of the image. Sorting anyway makes that independent of the Map implementation.
	support.sort((first, second) => first.pixelIndex - second.pixelIndex)
	return support
}

function nearestSupportDistance(color: RGB, support: readonly RampSupportColor[]): number {
	let nearest = Infinity
	for (const entry of support) {
		const distance = perceptualDifference(color, entry.rgb)
		if (distance < nearest) nearest = distance
	}
	return nearest
}

export type RampExcursion = Readonly<{
	/** The worst sample: how far the render gets from anything the artwork holds, in ΔE. */
	worst: number
	/** Where along the ramp that happened. */
	worstPosition: number
	samples: readonly Readonly<{ position: number; hex: string; distance: number }>[]
}>

/**
 * How far the rendered ramp strays from the artwork, sampled along its whole length.
 *
 * `midpoint` is the third stop the ramp would actually render, or `null` for a two-stop ramp, so the
 * same function answers "does the current render leave the artwork?" and "would this candidate third
 * stop bring it back?".
 */
export function rampExcursion(
	background: OKLab,
	surface: OKLab,
	midpoint: OKLab | null,
	support: readonly RampSupportColor[],
): RampExcursion {
	const samples = RAMP_SAMPLE_POSITIONS.map((position) => {
		const lab = midpoint === null
			? mixOKLab(background, surface, position)
			: position <= 0.5
				? mixOKLab(background, midpoint, position / 0.5)
				: mixOKLab(midpoint, surface, (position - 0.5) / 0.5)
		const rgb = oklabToRGB(lab)
		return { position, hex: rgbToHex(rgb), distance: nearestSupportDistance(rgb, support) }
	})
	let worst = -Infinity
	let worstPosition = 0
	for (const sample of samples) {
		if (sample.distance > worst) {
			worst = sample.distance
			worstPosition = sample.position
		}
	}
	return { worst, worstPosition, samples }
}

export type RampMidpointNomination = Readonly<{
	color: RampSupportColor
	/** The excursion the ramp would have with this third stop. */
	excursionAfter: number
	/** ΔE to the nearer endpoint. */
	endpointDifference: number
	/** Distance from the straight interpolation between the endpoints. */
	chordDeviation: number
}>

/**
 * The third stop that best pulls the ramp back onto the artwork, or `null` if none does.
 *
 * Three hard requirements, none of them new to this module:
 *
 *  - **Real population.** Only `buildRampSupport` colours are eligible, so a nominee always stands
 *    for a populated region of the artwork rather than a stray pixel.
 *  - **A different colour from both endpoints.** Reused verbatim from the existing three-stop route
 *    (`ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE`, ΔE 3.3, itself read off seven
 *    human judgements). Two near-blacks are one colour, and a ramp that stops at a colour it already
 *    shows adds nothing.
 *  - **It must move the render.** The maximum difference between the three- and two-stop renders is
 *    exactly the chord deviation, so one family bin step of deviation is a direct bar on that.
 *
 * The ranking among survivors is the mechanism's own objective: the nominee that leaves the ramp
 * closest to the artwork wins. That needs no weights — a nominee far off to one side would drag the
 * two halves of the ramp through colours of its own that the artwork does not hold, and score badly
 * for it.
 *
 * It does need a tie rule, and a strict argmin is the wrong one, because the objective is measured in
 * ΔE and two ramps whose worst excursions differ by less than one just-noticeable difference are not
 * two different answers — they are the same answer twice, and picking between them on the fourth
 * decimal is picking on noise. So nominees within `distinctness.sameColor` of the best excursion are
 * held equal and the one covering more of the artwork wins, which is the population term the
 * representativity rule wants and the only place it acts beyond the support floor. The exact hex
 * settles the remainder, so the answer is total and deterministic.
 *
 * The fourth requirement is a gate and not a final check, which matters: a third stop that leaves the
 * ramp still outside the artwork is not an improvement worth changing a published palette for, so
 * bringing the excursion back under the same bar that fired the mechanism is a condition of being
 * ranked at all. Checking it afterwards instead would let a merely-populated nominee inside the tie
 * band displace one that actually works, and then fail — losing a real answer to a rule about ties.
 */
export function nominateRampMidpoint(
	background: Readonly<{ rgb: RGB; oklab: OKLab }>,
	surface: Readonly<{ rgb: RGB; oklab: OKLab }>,
	support: readonly RampSupportColor[],
	familyBinStep: number,
	bar: number = RAMP_EXCURSION_BAR,
): RampMidpointNomination | null {
	const eligible = rankRampMidpointCandidates(background, surface, support, familyBinStep)
		.filter(({ excursionAfter }) => excursionAfter < bar)
	if (eligible.length === 0) return null
	const floor = eligible[0]!.excursionAfter
	const tied = eligible.filter(({ excursionAfter }) =>
		excursionAfter <= floor + ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness.sameColor)
	let best = tied[0]!
	for (const nomination of tied.slice(1)) {
		if (nomination.color.population > best.color.population) { best = nomination; continue }
		if (nomination.color.population < best.color.population) continue
		if (nomination.color.hex < best.color.hex) best = nomination
	}
	return best
}

/**
 * Every support colour that clears the three qualitative gates, ordered by how close it leaves the
 * ramp to the artwork.
 *
 * Split out from `nominateRampMidpoint` so a harness can sweep the excursion bar over one measured
 * ranking instead of re-running the extraction once per candidate bar — and so the bar is visibly the
 * only thing the sweep varies.
 */
export function rankRampMidpointCandidates(
	background: Readonly<{ rgb: RGB; oklab: OKLab }>,
	surface: Readonly<{ rgb: RGB; oklab: OKLab }>,
	support: readonly RampSupportColor[],
	familyBinStep: number,
): RampMidpointNomination[] {
	const chordMid = mixOKLab(background.oklab, surface.oklab, 0.5)
	const eligible: RampMidpointNomination[] = []
	for (const entry of support) {
		const endpointDifference = Math.min(
			perceptualDifference(entry.rgb, background.rgb),
			perceptualDifference(entry.rgb, surface.rgb),
		)
		if (endpointDifference < ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness.sameColor) continue
		const chordDeviation = okDistance(entry.oklab, chordMid)
		if (chordDeviation < familyBinStep) continue
		const excursionAfter = rampExcursion(background.oklab, surface.oklab, entry.oklab, support).worst
		eligible.push({ color: entry, excursionAfter, endpointDifference, chordDeviation })
	}
	eligible.sort((first, second) => first.excursionAfter - second.excursionAfter
		|| second.color.population - first.color.population
		|| (first.color.hex < second.color.hex ? -1 : 1))
	return eligible
}

export type RampMidpointDecision = Readonly<{
	excursionBefore: number
	worstPosition: number
	fired: boolean
	nomination: RampMidpointNomination | null
	descriptor: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor | null
}>

/**
 * The whole mechanism, as one call: measure what the winner would render, and hand back a third-stop
 * descriptor if and only if the two-stop render has left the artwork and a source colour brings it
 * back.
 *
 * **This route only ever adds a third stop; it never replaces one.** `hasMidpoint` says whether one of
 * the existing routes has already spoken, and if it has, this function declines without measuring
 * anything. That is a measured decision, not deference for its own sake. The corpus's highest
 * excursion by a wide margin (ΔE 18.63) belongs to a three-stop gradient reviewed strong five times,
 * whose own third stop had already been A/B'd against alternatives — so on the artworks that carry a
 * spatial-route midpoint, a high excursion demonstrably does not predict the reviewer's displeasure,
 * and the criterion has no standing to overrule them. On the artworks that carry none, it separates
 * cleanly. Restricting the mechanism to the half of the corpus where its criterion is supported is
 * also exactly the mechanism as stated: the fix for a ramp that leaves the artwork is to *add* a
 * midpoint.
 */
export function rampMidpointInsertion(
	evidence: NativePaletteEvidence,
	background: Readonly<{ rgb: RGB; oklab: OKLab }>,
	surface: Readonly<{ rgb: RGB; oklab: OKLab }>,
	hasMidpoint: boolean,
	support?: readonly RampSupportColor[],
): RampMidpointDecision | null {
	if (!RAMP_MIDPOINT_INSERTION || hasMidpoint) return null
	const colors = support ?? buildRampSupport(evidence)
	const before = rampExcursion(background.oklab, surface.oklab, null, colors)
	if (before.worst < RAMP_EXCURSION_BAR) {
		return { excursionBefore: before.worst, worstPosition: before.worstPosition, fired: false, nomination: null, descriptor: null }
	}
	const nomination = nominateRampMidpoint(background, surface, colors, evidence.familyBinStep)
	if (nomination === null) {
		return { excursionBefore: before.worst, worstPosition: before.worstPosition, fired: true, nomination: null, descriptor: null }
	}
	const color = nomination.color
	return {
		excursionBefore: before.worst,
		worstPosition: before.worstPosition,
		fired: true,
		nomination,
		descriptor: {
			kind: "source-supported-three-stop",
			position: 0.5,
			color: { rgb: color.rgb, oklab: color.oklab, hex: color.hex },
			provenance: {
				origin: "ramp-support",
				exactSource: true,
				familyId: color.familyId,
				pixelIndex: color.pixelIndex,
				x: color.x,
				y: color.y,
				populationFraction: color.populationFraction,
				chordDeviation: nomination.chordDeviation,
				endpointDifference: nomination.endpointDifference,
				excursionBefore: before.worst,
				excursionAfter: nomination.excursionAfter,
			},
		},
	}
}

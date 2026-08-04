/**
 * The selection cascade, the verify-and-step loop, and the escape (arm-d §2.3–§2.7).
 *
 * ## The order, and why stepping is expensive on purpose
 *
 * Roles are chosen in dependency order — the two field ends, then the gradient, then the foreground,
 * then the accent — and **a stepped role re-runs everything downstream of it**. That is the contract's
 * "any repair re-validates the entire palette" implemented as control flow: a relocated defect is
 * impossible rather than hoped against. It is also why the step caps are small; a role that has walked
 * far down its own ordering is answering a different question from the one it was asked.
 *
 * ## A colour is never adjusted
 *
 * Every repair in this file does one of two things: it **steps a rank** (moves to the next quantile in
 * the same ordering and redeems that rank against a pixel), or it **drops a guide stop**. Nothing here
 * nudges a channel, blends toward a target, or picks a nearby colour. There is no code path by which a
 * published colour is anything other than a pixel index redeemed through `pixelRgb`.
 *
 * ## Contrast floors are verification predicates, not selection constants
 *
 * At their defaults the output is what the unparameterised algorithm produced, and raising a floor can
 * only step the rank on artworks that actually fail it. Zero collateral by construction, not by testing
 * (arm-d §2.7). The floors are read from the palette's own resolved contrast block, so the predicate and
 * the invariant are the same number by construction.
 *
 * ## The escape
 *
 * Reached only when the whole image lies within the same-colour bar of itself: one colour, no second
 * end, no ink, no accent. All four of the contract's conditions are checked on the way rather than
 * asserted after — the colour is one of the two literals, the role is `foreground`, the partner is
 * collapsed onto it, and the colour is verified absent from the artwork by scanning for its exact triple.
 */

import {
	ACCENT_FUNCTIONAL_DISTANCE,
	CONTRACT_VERSION,
	FOREGROUND_ACCENT_SEPARATION_DISTANCE,
} from "../../../src/contract/constants.ts"
import { apcaRaw, colorFromRgb, colorFromHex, sameColorBar } from "../../../src/contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters, validatePalette } from "../../../src/contract/invariants.ts"
import type {
	GradientStop,
	NonSourceColorEscape,
	Palette,
	PaletteColor,
	Rgb8,
} from "../../../src/contract/types.ts"
import { hashFileBytes } from "../../../src/devloop/code-version.ts"
import { computeAccentTiers, chooseAccent, type AccentChoice } from "./accent.ts"
import { ALGORITHM_VERSION, MAX_RANK_STEPS, PREPROCESSING_VERSION } from "./constants.ts"
import { decodeImage, pixelRgb, type DecodedImage } from "./decode.ts"
import { chooseFieldEnds, computeFieldSet, type FieldEnds } from "./field-roles.ts"
import { computeDepthField, computeEdgeField } from "./fields.ts"
import {
	chooseForeground,
	clearsInkRegimeMargin,
	computeInkField,
	inkOrdering,
	luminanceOrdering,
	type ForegroundChoice,
	type ForegroundOrdering,
	type ForegroundPolarity,
} from "./foreground.ts"
import { insertGuideStops, parameteriseField, type GradientParameterisation } from "./gradient.ts"
import { cascadePixel, labDistance } from "./primitives.ts"
import { verifyColor } from "./verify.ts"

/**
 * What the run recorded about how it got its answer. §8's exposable intermediates in their numeric
 * form — the full-resolution maps are all still in memory at the point this is built, and a viewer that
 * wants them can call the field modules directly.
 */
export type P3Intermediates = {
	width: number
	height: number
	eligiblePixels: number
	edgePixels: number
	fieldSetSize: number
	fieldDepthThreshold: number
	endsStep: number
	fieldCollapsed: boolean
	prevalence: readonly [number, number]
	bestSpatialCorrelation: number
	gradientPublished: boolean
	guideStops: number
	maxExcursion: number
	excursionBar: number
	foregroundRegime: "ink" | "luminance" | "escape"
	/** Which contrast polarity the luminance regime took, and which cascade step decided it (0.2.0). */
	foregroundPolarity: ForegroundPolarity | null
	/** How many pixels of the published field ramp the foreground ordering minimised against (0.2.0). */
	rampAnchors: number
	foregroundStep: number
	inkBandSize: number
	inkCandidates: number
	accentTier: 1 | 2 | null
	accentFragile: boolean
	accentStep: number
	accentCollapsed: boolean
	escaped: boolean
	support: Record<string, number>
	spread: Record<string, number>
	repairs: number
}

export type P3Result = Readonly<{ palette: Palette; intermediates: P3Intermediates }>

/** The pair's bar, exactly as `sameColorBar` defines it, for two pixels of the same image. */
function barBetween(image: DecodedImage, first: number, second: number): number {
	return sameColorBar(colorFromRgb(pixelRgb(image, first)), colorFromRgb(pixelRgb(image, second)))
}

function distinctPixels(image: DecodedImage, first: number, second: number): boolean {
	return labDistance(image.lab, first, second) >= barBetween(image, first, second)
}

/** Does the artwork contain this exact triple anywhere among its eligible pixels? */
function containsExactly(image: DecodedImage, rgb: Rgb8): boolean {
	for (let i = 0; i < image.eligibleIndices.length; i += 1) {
		const at = image.eligibleIndices[i] * 3
		if (image.rgb[at] === rgb[0] && image.rgb[at + 1] === rgb[1] && image.rgb[at + 2] === rgb[2]) return true
	}
	return false
}

/** Is the whole image one colour by the contract's own ruler? The escape's precondition. */
function wholeImageIsOneColor(image: DecodedImage, centre: number): boolean {
	for (let i = 0; i < image.eligibleIndices.length; i += 1) {
		const index = image.eligibleIndices[i]
		const pairBar = image.bar[index] > image.bar[centre] ? image.bar[index] : image.bar[centre]
		if (labDistance(image.lab, index, centre) >= pairBar) return false
	}
	return true
}

const CONTRAST_FLOORS = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)

/**
 * How many positions the foreground's and the accent's search sequences hold: two regimes (or two
 * tiers) × the ranks each may step to.
 *
 * Derived from `MAX_RANK_STEPS`, not an independent constant — it is the size of a space the cap already
 * defines, and the repair loop is bounded by it so that a role can reach the last rank it is allowed to
 * reach rather than stopping half way through its own second regime.
 */
const SEARCH_CURSOR_LIMIT = 2 * (MAX_RANK_STEPS + 1)

function assemblePalette(
	imagePath: string,
	image: DecodedImage,
	contentHash: string,
	parts: {
		background: number
		surface: number | null
		foreground: number
		accent: number | null
		stops: readonly { pixel: number; position: number }[] | null
		geometry: GradientParameterisation["geometry"]
		escape: NonSourceColorEscape | null
		escapeColor: PaletteColor | null
	},
): Palette {
	const background = colorFromRgb(pixelRgb(image, parts.background))
	const surface = parts.surface === null ? background : colorFromRgb(pixelRgb(image, parts.surface))
	const foreground = parts.escapeColor ?? colorFromRgb(pixelRgb(image, parts.foreground))
	const accent = parts.accent === null ? foreground : colorFromRgb(pixelRgb(image, parts.accent))

	const surfaceCollapsed = surface.hex === background.hex
	const accentCollapsed = accent.hex === foreground.hex

	let gradient: Palette["gradient"] = null
	if (parts.stops !== null && !surfaceCollapsed) {
		const stops: GradientStop[] = parts.stops.map((stop, index) => ({
			// The ends are the field roles themselves, per the endpoint ruling — taken from the published
			// role colours rather than re-derived, so "exactly" is structural.
			color: index === 0 ? background : index === parts.stops!.length - 1 ? surface : colorFromRgb(pixelRgb(image, stop.pixel)),
			position: stop.position,
		}))
		gradient = {
			stops: stops as unknown as [GradientStop, GradientStop, ...GradientStop[]],
			...(parts.geometry === undefined ? {} : { geometry: parts.geometry }),
		}
	}

	return {
		contractVersion: CONTRACT_VERSION,
		roles: { background, surface, foreground, accent },
		gradient,
		collapse: { surfaceCollapsed, accentCollapsed },
		...(parts.escape === null ? {} : { escape: parts.escape }),
		contrast: CONTRAST_FLOORS,
		metadata: {
			algorithmVersion: ALGORITHM_VERSION,
			preprocessingVersion: PREPROCESSING_VERSION,
			inputContentHash: contentHash,
			sourceRendition: {
				path: imagePath,
				width: image.width,
				height: image.height,
				format: image.format,
			},
			// Equal to the rendition's size, because §1 forbids resampling.
			processedSize: { width: image.width, height: image.height },
		},
	}
}

/**
 * The foreground search: first regime, then second, stepping the rank inside each.
 *
 * The predicates are §2.7's — bar support, spatial spread, distinctness from both field ends, and the
 * text contrast floor against both. The ramp floor is not checked here because the ramp is not yet
 * assembled; the full-palette validation below catches it and steps this search again.
 */
function searchForeground(
	image: DecodedImage,
	orderings: readonly ForegroundOrdering[],
	background: number,
	surface: number,
	fromCursor: number,
	support: Record<string, number>,
	spread: Record<string, number>,
): { choice: ForegroundChoice; cursor: number; verified: boolean } | null {
	const backgroundRgb = pixelRgb(image, background)
	const surfaceRgb = pixelRgb(image, surface)
	const floor = CONTRAST_FLOORS.minTextContrast.effectiveRawMagnitude

	// Regimes in order: ink first, exhausted, then luminance. §2.5's regime test is "does the ink
	// population survive verification", so the second regime is reached only when the first has failed at
	// every rank it was allowed to step to — not interleaved with it.
	//
	// `cursor` numbers the whole search space (regime, step) as one sequence, so "step the rank" means
	// exactly one position in it. Carrying a per-regime step instead would have let a step taken in the
	// ink regime silently skip the luminance regime's early ranks, which is a different repair from the
	// one §2.7 describes.
	for (const [regimeIndex, ordering] of orderings.entries()) {
		for (let step = 0; step <= MAX_RANK_STEPS; step += 1) {
			const cursor = regimeIndex * (MAX_RANK_STEPS + 1) + step
			if (cursor < fromCursor) continue
			const choice = chooseForeground(image, ordering, step)
			if (choice === null || choice.pixel < 0) continue

			const verdict = verifyColor(image, choice.pixel)
			support[`foreground:${choice.regime}:${step}`] = verdict.support
			spread[`foreground:${choice.regime}:${step}`] = verdict.spread
			if (!verdict.passes) continue
			// The regime's **stability margin** (0.2.0). §2.5's regime test is "does the ink population
			// survive verification", and at 0.1.0 that boundary was ≥ 1 pixel wide: a ±1-LSB dither could
			// push the ink population across the source-support floor and swap the foreground into an
			// entirely different ordering. The ink regime is now taken only when it clears the floor by
			// `INK_REGIME_SUPPORT_MARGIN`; below that the luminance regime is the honest answer, and the
			// search reaches it exactly as it does for an empty ink population. The margin gates the ink
			// regime alone — see `clearsInkRegimeMargin` for why the asymmetry is what makes this a guard
			// rather than a second flippable threshold.
			if (choice.regime === "ink" && !clearsInkRegimeMargin(verdict.support)) continue
			if (!distinctPixels(image, choice.pixel, background)) continue
			if (!distinctPixels(image, choice.pixel, surface)) continue

			const rgb = pixelRgb(image, choice.pixel)
			if (Math.abs(apcaRaw(rgb, backgroundRgb)) < floor) continue
			if (Math.abs(apcaRaw(rgb, surfaceRgb)) < floor) continue

			return { choice, cursor, verified: true }
		}
	}

	// Nothing in the remaining search space verified. Publish the **un-stepped** rank — the answer the
	// algorithm would have given with no verification pass at all — rather than whichever late rank the
	// scan happened to stop on. An exhausted search is a failure to repair, and a failure to repair should
	// not also silently move the colour: the row is then a clean statement that rank 0 is what this
	// paradigm says and that the contract disagrees with it.
	for (const [regimeIndex, ordering] of orderings.entries()) {
		const choice = chooseForeground(image, ordering, 0)
		if (choice !== null && choice.pixel >= 0) {
			return { choice, cursor: regimeIndex * (MAX_RANK_STEPS + 1), verified: false }
		}
	}
	return null
}

/**
 * The accent search: tier 1, then tier 2, stepping the rank inside each, then collapse.
 *
 * `null` means every tier was empty or failed verification — which §2.6 says is the accent collapsing to
 * exactly the foreground, arrived at as an empty population rather than asserted.
 */
function searchAccent(
	image: DecodedImage,
	tiers: ReturnType<typeof computeAccentTiers>,
	background: number,
	surface: number,
	foreground: number,
	fromCursor: number,
	support: Record<string, number>,
	spread: Record<string, number>,
): { choice: AccentChoice; cursor: number } | null {
	const backgroundRgb = pixelRgb(image, background)
	const surfaceRgb = pixelRgb(image, surface)
	const floor = CONTRAST_FLOORS.minAccentContrast.effectiveRawMagnitude

	// One cursor over the whole (tier, step) sequence, for the reason given in `searchForeground`. Tier 2
	// is reached only when tier 1 is empty *after verification*, which is what exhausting tier 1's ranks
	// means here.
	for (const tier of [1, 2] as const) {
		for (let step = 0; step <= MAX_RANK_STEPS; step += 1) {
			const cursor = (tier - 1) * (MAX_RANK_STEPS + 1) + step
			if (cursor < fromCursor) continue
			const choice = chooseAccent(image, tiers, tier, step)
			if (choice === null || choice.pixel < 0) continue

			const verdict = verifyColor(image, choice.pixel)
			support[`accent:tier${tier}:${step}`] = verdict.support
			spread[`accent:tier${tier}:${step}`] = verdict.spread
			if (!verdict.passes) continue

			// Invariant 3's elevated cell: the accent must be plainly a different colour from the
			// foreground, or collapse onto it exactly. The separation distance is the contract's, used
			// here as a verification predicate and never to choose anything.
			const separation = Math.max(
				barBetween(image, choice.pixel, foreground),
				FOREGROUND_ACCENT_SEPARATION_DISTANCE,
			)
			if (labDistance(image.lab, choice.pixel, foreground) < separation) continue

			// Invariant 4's accent clause, with its one escape: a pair violates only when |raw APCA| is
			// below the floor *and* the two colours are closer than the functional distance.
			const rgb = pixelRgb(image, choice.pixel)
			const failsBackground = Math.abs(apcaRaw(rgb, backgroundRgb)) < floor &&
				labDistance(image.lab, choice.pixel, background) < ACCENT_FUNCTIONAL_DISTANCE
			const failsSurface = Math.abs(apcaRaw(rgb, surfaceRgb)) < floor &&
				labDistance(image.lab, choice.pixel, surface) < ACCENT_FUNCTIONAL_DISTANCE
			if (failsBackground || failsSurface) continue

			return { choice, cursor }
		}
	}
	return null
}

/** Which role a violation names, for the repair loop. */
function namesRole(subjects: readonly string[], role: string): boolean {
	return subjects.some((subject) => subject === `roles.${role}`)
}

export async function extractPalette(imagePath: string): Promise<P3Result> {
	const image = await decodeImage(imagePath)
	const contentHash = await hashFileBytes(imagePath)
	const edges = computeEdgeField(image)
	const depth = computeDepthField(image, edges)
	const field = computeFieldSet(image, depth)

	const support: Record<string, number> = {}
	const spread: Record<string, number> = {}
	const intermediates: P3Intermediates = {
		width: image.width,
		height: image.height,
		eligiblePixels: image.eligibleIndices.length,
		edgePixels: edges.edgeCount,
		fieldSetSize: field.indices.length,
		fieldDepthThreshold: field.threshold,
		endsStep: 0,
		fieldCollapsed: false,
		prevalence: [0, 0],
		bestSpatialCorrelation: 0,
		gradientPublished: false,
		guideStops: 0,
		maxExcursion: 0,
		excursionBar: 0,
		foregroundRegime: "luminance",
		foregroundPolarity: null,
		rampAnchors: 0,
		foregroundStep: 0,
		inkBandSize: 0,
		inkCandidates: 0,
		accentTier: null,
		accentFragile: false,
		accentStep: 0,
		accentCollapsed: false,
		escaped: false,
		support,
		spread,
		repairs: 0,
	}

	// ---------------------------------------------------------------------------------------
	// The escape (§2.7), checked before anything is selected.
	// ---------------------------------------------------------------------------------------
	const imageCascade = cascadePixel(
		image.eligibleIndices,
		image.eligibleIndices.length,
		image.lab,
		image.rgb,
	)
	if (wholeImageIsOneColor(image, imageCascade)) {
		const backgroundRgb = pixelRgb(image, imageCascade)
		const white: Rgb8 = [255, 255, 255]
		const black: Rgb8 = [0, 0, 0]
		const options: { color: PaletteColor; rgb: Rgb8 }[] = []
		if (!containsExactly(image, white)) options.push({ color: colorFromHex("#ffffff"), rgb: white })
		if (!containsExactly(image, black)) options.push({ color: colorFromHex("#000000"), rgb: black })
		options.sort((left, right) =>
			Math.abs(apcaRaw(right.rgb, backgroundRgb)) - Math.abs(apcaRaw(left.rgb, backgroundRgb))
		)

		intermediates.escaped = options.length > 0
		intermediates.fieldCollapsed = true
		intermediates.accentCollapsed = true
		intermediates.foregroundRegime = "escape"

		if (options.length > 0) {
			const chosen = options[0]
			return {
				palette: assemblePalette(imagePath, image, contentHash, {
					background: imageCascade,
					surface: null,
					foreground: imageCascade,
					accent: null,
					stops: null,
					geometry: undefined,
					escape: { role: "foreground", color: chosen.color.hex },
					escapeColor: chosen.color,
				}),
				intermediates,
			}
		}
		// Both literals occur in an image that is one colour — arithmetically unreachable, since white and
		// black are far outside any regional bar of each other. Falling through publishes the honest
		// one-colour palette and lets the contract report what is wrong with it.
	}

	// ---------------------------------------------------------------------------------------
	// The selection cascade, with §2.7's verify-and-step loop.
	// ---------------------------------------------------------------------------------------
	const inkPlaceholder = { candidates: new Int32Array(0), scores: new Float64Array(0), bandSize: 0 }
	let ink = inkPlaceholder
	let lastPalette: Palette | null = null

	for (let endsStep = 0; endsStep <= MAX_RANK_STEPS; endsStep += 1) {
		const ends: FieldEnds = chooseFieldEnds(image, field.indices, endsStep)
		intermediates.endsStep = endsStep
		intermediates.fieldCollapsed = ends.collapsed
		intermediates.prevalence = ends.prevalence

		const backgroundVerdict = verifyColor(image, ends.background)
		support[`background:${endsStep}`] = backgroundVerdict.support
		spread[`background:${endsStep}`] = backgroundVerdict.spread
		const surfaceVerdict = ends.collapsed ? backgroundVerdict : verifyColor(image, ends.surface)
		support[`surface:${endsStep}`] = surfaceVerdict.support
		spread[`surface:${endsStep}`] = surfaceVerdict.spread

		const endsVerified = backgroundVerdict.passes && surfaceVerdict.passes &&
			(ends.collapsed || distinctPixels(image, ends.background, ends.surface))
		if (!endsVerified && endsStep < MAX_RANK_STEPS) continue

		// The gradient. Computed before the text roles because the ramp is a field fact, and because the
		// contract's ramp floors are checked against it at validation time.
		const parameterisation = parameteriseField(image, field.indices, ends)
		intermediates.bestSpatialCorrelation = parameterisation.bestCorrelation
		let stops: { pixel: number; position: number }[] | null = null
		if (!ends.collapsed && parameterisation.isGradient) {
			const excursion = insertGuideStops(image, field.indices, parameterisation.t, ends.background, ends.surface)
			intermediates.maxExcursion = excursion.maxExcursion
			intermediates.excursionBar = excursion.excursionBar
			stops = [
				{ pixel: ends.background, position: 0 },
				...excursion.guideStops.map((stop) => ({ pixel: stop.pixel, position: stop.position })),
				{ pixel: ends.surface, position: 1 },
			]
		}

		if (ink === inkPlaceholder) {
			ink = computeInkField(image, depth.depth, field.threshold)
			intermediates.inkBandSize = ink.bandSize
			intermediates.inkCandidates = ink.candidates.length
		}

		// The two orderings and the two tiers depend on the field ends, so they are built once per ends
		// step and redeemed at as many ranks as the repair loop asks for.
		// The **published field ramp** as pixel indices, in ramp order: the two field roles and whatever
		// guide stops the excursion machinery inserted between them. This is what the foreground ordering
		// minimises |raw APCA| against at 0.2.0, and it is why the ordering is built here rather than
		// earlier — the ramp is a field fact that has to exist before the text roles can be ranked
		// against it. A collapsed field publishes one pixel and the ramp is that one pixel.
		//
		// `stops` is used before the stop-vs-text-role filter below, deliberately: dropping a stop can
		// only *remove* an anchor, and removing an anchor can only raise the minimum. Ranking against the
		// unfiltered ramp is therefore the conservative direction, and it keeps the ordering independent
		// of the foreground it is being used to choose.
		const rampAnchors = ends.collapsed
			? [ends.background]
			: stops !== null
			? stops.map((stop) => stop.pixel)
			: [ends.background, ends.surface]
		intermediates.rampAnchors = rampAnchors.length

		const orderings: ForegroundOrdering[] = []
		const ranked = inkOrdering(ink)
		if (ranked !== null) orderings.push(ranked)
		const luminance = luminanceOrdering(image, depth.depth, rampAnchors)
		if (luminance !== null) orderings.push(luminance)
		const tiers = computeAccentTiers(image, ends.background, ends.surface)

		let foregroundFrom = 0
		let accentFrom = 0

		for (let repair = 0; repair < SEARCH_CURSOR_LIMIT; repair += 1) {
			const foreground = searchForeground(
				image,
				orderings,
				ends.background,
				ends.surface,
				foregroundFrom,
				support,
				spread,
			)
			if (foreground === null) break
			intermediates.foregroundRegime = foreground.choice.regime
			intermediates.foregroundPolarity = foreground.choice.polarity
			intermediates.foregroundStep = foreground.cursor

			const accent = searchAccent(
				image,
				tiers,
				ends.background,
				ends.surface,
				foreground.choice.pixel,
				accentFrom,
				support,
				spread,
			)
			intermediates.accentTier = accent === null ? null : accent.choice.tier
			intermediates.accentFragile = accent !== null && accent.choice.fragile
			intermediates.accentStep = accent === null ? 0 : accent.cursor
			intermediates.accentCollapsed = accent === null

			// Guide stops must also be distinct from the text roles — invariant 3 judges stop-against-role
			// pairs for everything except the two field ends. A stop that is not is dropped, never moved.
			const publishedStops = stops === null ? null : stops.filter((stop, index) => {
				if (index === 0 || index === stops!.length - 1) return true
				if (!distinctPixels(image, stop.pixel, foreground.choice.pixel)) return false
				if (accent !== null && !distinctPixels(image, stop.pixel, accent.choice.pixel)) return false
				return true
			})

			const palette = assemblePalette(imagePath, image, contentHash, {
				background: ends.background,
				surface: ends.collapsed ? null : ends.surface,
				foreground: foreground.choice.pixel,
				accent: accent === null ? null : accent.choice.pixel,
				stops: publishedStops,
				geometry: parameterisation.geometry,
				escape: null,
				escapeColor: null,
			})
			lastPalette = palette
			intermediates.gradientPublished = palette.gradient !== null
			intermediates.guideStops = palette.gradient === null ? 0 : palette.gradient.stops.length - 2
			intermediates.repairs = repair

			const result = validatePalette(palette)
			if (result.valid) return { palette, intermediates }

			// Step whichever role the contract named, and re-run everything downstream of it.
			const subjects = result.violations.flatMap((violation) => violation.subjects)
			if (namesRole(subjects, "accent") && accent !== null && accentFrom < SEARCH_CURSOR_LIMIT) {
				accentFrom = accent.cursor + 1
				continue
			}
			if (namesRole(subjects, "foreground") && foreground.verified && foregroundFrom < SEARCH_CURSOR_LIMIT) {
				foregroundFrom = foreground.cursor + 1
				accentFrom = 0
				continue
			}
			break
		}

		// Nothing downstream could be repaired at any rank: the defect is in the field ends, so the outer
		// loop steps them and everything downstream re-runs.
	}

	if (lastPalette === null) {
		throw new Error(`p3-fields produced no palette for ${imagePath}; the field set yielded no ends`)
	}
	// Every rank has been stepped and the contract is still unhappy. The palette is published anyway and
	// scores as failing: a failure is a row, never an omission.
	return { palette: lastPalette, intermediates }
}

/**
 * P5 field-fit — the candidate (W-INTEG, wave 2).
 *
 * Assembly, and only assembly: this module owns no perceptual decision of its own. It runs the five
 * wave-1 modules in the order `SPEC.md`'s pipeline table fixes, turns their readings into a contract
 * `Palette`, and records what happened in the `Diagnostics` sidecar `diagnose.ts` prints. Every
 * threshold it consults is either the contract's (`POOLED_SAME_COLOR_BAR`,
 * `DEFAULT_CONTRAST_PARAMETERS`) or a wave-1 module's; there is no new number here.
 *
 * ## The order, and the four places assembly makes a decision
 *
 * `decodeAndInventory` → `fitField` → `readRamp` → snap the two field ends → **re-decide the
 * gradient on the snapped ends** → `readOverlay` against those ends → publish the overlay's
 * representatives → escape, if the overlay offered nothing.
 *
 * 1. **The gradient boolean is decided here, on the published colours** (SPEC decision 2). `ramp.ts`
 *    decides it on the continuous targets, which is a proxy: it is the caller who knows what was
 *    actually published. `sameColor(background, surface)` ⇒ the surface collapses **exactly** onto
 *    the background (decision 2's own word) and `gradient` is `null`. Exact collapse rather than
 *    "publish both and set the flag" is not a nicety: the contract's invariant 3 refuses
 *    near-identical-but-unequal as hard as it refuses equal-without-flag, so the only legal answer to
 *    "these two snapped inside the bar of each other" is one colour.
 * 2. **The third stop is re-earned post-snap.** `ramp.ts`'s excursion test ran on the pre-snap
 *    targets and says so in its own header; snapping moves each vertex, so the polyline that earned
 *    a stop may no longer beat the chord. The stop is dropped when it snapped onto an end, when its
 *    projection is no longer strictly inside the ends, or when the re-measured polyline no longer
 *    passes decision 5's acceptance rule. The measurement is `ramp.ts`'s `pathExcursion`, not a copy.
 * 3. **Overlay roles are published as their cluster's representative triple, not as its centre.**
 *    The representative *is* an exact source pixel (`overlay.ts` header, choice 1), so invariant 2 is
 *    satisfied by publishing it directly — snapping a cluster centre would be a second, weaker route
 *    to the same guarantee. `snapToArtwork` is used only for the two field ends, whose targets are
 *    continuous field values that belong to no pixel in particular.
 * 4. **Collapses are measured on the published hex**, never asserted from upstream intent, because
 *    invariant 1 checks the flag against exact hex equality and nothing else.
 *
 * ## The three no-field outcomes, and how a reader tells them apart
 *
 * SPEC decision 9's precedence ruling makes `noField` a fork rather than a verdict. In descending
 * order of structure: an affine field (not `noField` at all), a **two-block rescue** (two flat
 * colours that between them put half the image inside four bars), and only then the **retreat** to
 * one colour. The two constants are the verdict's own — the ruling's "same two constants, no new
 * ones" is why `NO_FIELD_EXPLAINED_FRACTION` and the radius live in `fieldfit.ts` and are imported
 * here rather than restated.
 *
 * `Diagnostics` is frozen and carries no field for the fork, so it is read off two that it does
 * carry: `noField && twoBlockFallback` is a rescue, `noField && !twoBlockFallback` is a retreat.
 *
 * Two things the ruling settled that would otherwise look like deviations here, and are not:
 * the retreat ranks field mass on the **kept fit's weights** rather than a separate order-0 fit
 * (*"on a noField image no weight map is meaningful, so this is pick-and-state"*), and overlay's
 * `localField` stays the affine `fieldAt` even on a rescued two-block cover, where near a block's
 * centre it approximates that block's colour. Both are revisited only on round-1 reviewer signal.
 *
 * ## Deviations from `SPEC.md`, stated
 *
 * - **The accent is collapsed when the two published colours are the same colour.** `overlay.ts`
 *   guarantees its accent is separated from its foreground *at the cluster centres*; this module
 *   publishes representatives, which sit within a bar of their centres, so the published pair can be
 *   closer than the pair that was judged. Decision 8's terminal clause ("no candidate ⇒ accent
 *   collapses to foreground exactly") is the answer, applied to the published colours. The guard is
 *   `sameColor` and nothing else: decision 7's second ruling of 2026-08-04 refuses
 *   `FOREGROUND_ACCENT_SEPARATION_DISTANCE` = 0.07444 as a collapse guard, so the
 *   `I3.foreground-accent-not-separated` rows the contract raises against this candidate are
 *   recorded upward as a contract-constant conflict and are deliberately not chased here.
 *
 * ## Where the foreground's contract feasibility is enforced
 *
 * Not here — `overlay.ts`, in the foreground loop, per decision 7's first ruling of 2026-08-04. It
 * already receives the snapped ends as `fieldEnds`, so it is the one place that can apply the
 * constraint *before* max-overlay-mass picks a winner; filtering after selection would have thrown
 * away the best surviving cluster rather than skipping the infeasible one.
 */

import { CONTRACT_VERSION, POOLED_SAME_COLOR_BAR } from "../../src/contract/constants.ts"
import { colorFromRgb, colorFromHex, rgbToOkLab, sameColor } from "../../src/contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters } from "../../src/contract/invariants.ts"
import type {
	GradientStop,
	NonSourceColorEscape,
	OkLab,
	Palette,
	PaletteColor,
} from "../../src/contract/types.ts"
import { hashFileBytes } from "../../src/devloop/code-version.ts"
import type { CandidatePalette } from "../../src/devloop/types.ts"

import { decodeAndInventory, packRgb, unpackRgb } from "./src/decode.ts"
import {
	explainedFractionByColors,
	fitField,
	NO_FIELD_EXPLAINED_FRACTION,
} from "./src/fieldfit.ts"
import { readOverlay } from "./src/overlay.ts"
import {
	highestFieldMassTriple,
	pathExcursion,
	projectionFraction,
	readRamp,
	twoBlockCandidates,
} from "./src/ramp.ts"
import { snapToArtwork } from "./src/snap.ts"
import type { Diagnostics, Inventory } from "./src/types.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p5-fieldfit"

/** `PaletteMetadata.algorithmVersion`. A label, not a measurement — the cache keys on source hashes. */
export const ALGORITHM_VERSION = "p5-fieldfit-0.1.0"

/** `[INHERITED]` — the pinned decoder, and `PHASE_0_DECISIONS.md` §1's no-resample rule, stated. */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"

/**
 * The two literals the contract's escape clause permits, as `PaletteColor`s.
 *
 * `[INHERITED]` — `ESCAPE_COLORS` in `src/contract/constants.ts`. Built here rather than imported as
 * strings so the hex spelling is the branded canonical one and cannot drift.
 */
const ESCAPE_WHITE = colorFromHex("#ffffff")
const ESCAPE_BLACK = colorFromHex("#000000")

/**
 * Decision 5's acceptance rule, re-applied to the snapped polyline.
 *
 * Deliberately the same two clauses `ramp.ts` applies pre-snap — under the bar outright, or the
 * excursion divided by at least two — because a stop that has to be re-earned should be re-earned
 * against the rule it was granted under, not a looser one.
 */
const THIRD_STOP_REDUCTION_FACTOR = 2

/** Everything `diagnose.ts` prints, and everything `paletteOf` throws away. */
export type Analysis = Readonly<{
	palette: Palette
	diagnostics: Diagnostics
	/** The fit's kept order, for the decision-9 deviation note above. */
	fieldOrder: 0 | 1
}>

function labOf(color: PaletteColor): OkLab {
	return rgbToOkLab(color.rgb)
}

/** The representative of an overlay cluster is already an exact source triple. */
function colorOfRepresentative(packed: number): PaletteColor {
	return colorFromRgb(unpackRgb(packed))
}

/**
 * SPEC decision 10's literal choice: whichever of white and black is **further in lightness** from
 * the published background. The absence test is the caller's and lives at the call site, because it
 * decides two different things — which colour to publish, and whether an escape is declared at all.
 */
function escapeLiteralFor(background: PaletteColor): PaletteColor {
	const backgroundLightness = labOf(background)[0]
	const toWhite = Math.abs(labOf(ESCAPE_WHITE)[0] - backgroundLightness)
	const toBlack = Math.abs(labOf(ESCAPE_BLACK)[0] - backgroundLightness)
	return toWhite >= toBlack ? ESCAPE_WHITE : ESCAPE_BLACK
}

function presentInArtwork(inventory: Inventory, color: PaletteColor): boolean {
	return inventory.has(packRgb(color.rgb))
}

/**
 * Run the whole pipeline once, keeping every reading the diagnostics quote.
 *
 * `paletteOf` is this function with the sidecar dropped; `diagnose.ts` is this function with the
 * sidecar printed. There is one implementation so the two can never disagree about what a palette
 * was, which is the whole point of the sidecar being assembled here rather than re-derived there.
 */
export async function analyzeImage(imagePath: string): Promise<Analysis> {
	const { raster, inventory } = await decodeAndInventory(imagePath)
	const fit = fitField(raster)
	const ramp = readRamp(fit, raster, inventory)
	const contrast = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)

	// --- the field ends ---------------------------------------------------------------------------
	//
	// SPEC decision 9: `noField` never reads an endpoint off a surface it has just declared not to
	// describe the image. But it does not go straight to the retreat either — the precedence ruling
	// puts a **structured two-colour reading ahead of a flat one**, and tests it by the very same
	// principle the verdict itself used: does this model put half the image inside four bars of
	// itself? A genuinely two-colour cover answers yes and keeps two distinct roles; only an image
	// that neither an affine field nor two blocks can explain retreats to one colour.
	let twoBlockRescue = false
	let backgroundTarget = ramp.backgroundTarget
	let surfaceTarget = ramp.surfaceTarget
	// A no-field image has no ramp to be a candidate for, on either branch: the rescue publishes two
	// flat blocks (decision 5: gradient null), and the retreat publishes one colour.
	let gradientCandidate = ramp.gradientCandidate

	if (fit.noField) {
		gradientCandidate = false
		const blocks = twoBlockCandidates(fit, raster, inventory)
		const rescued = blocks !== null && blocks.surface !== null &&
			explainedFractionByColors(raster, [blocks.background.lab, blocks.surface.lab]) >=
				NO_FIELD_EXPLAINED_FRACTION
		if (rescued && blocks?.surface) {
			twoBlockRescue = true
			backgroundTarget = blocks.background.lab
			surfaceTarget = blocks.surface.lab
		} else {
			const retreatTriple = highestFieldMassTriple(fit, raster, inventory)
			if (retreatTriple) {
				backgroundTarget = retreatTriple.lab
				surfaceTarget = retreatTriple.lab
			} else {
				surfaceTarget = backgroundTarget
			}
		}
	}

	const backgroundSnap = snapToArtwork(backgroundTarget, inventory, POOLED_SAME_COLOR_BAR)
	// Identical targets snap identically; the call is skipped rather than repeated.
	const surfaceSnap = surfaceTarget === backgroundTarget
		? backgroundSnap
		: snapToArtwork(surfaceTarget, inventory, POOLED_SAME_COLOR_BAR)

	const background = colorFromRgb(backgroundSnap.rgb)
	const snappedSurface = colorFromRgb(surfaceSnap.rgb)

	// --- decision 2, on the published colours -------------------------------------------------------
	const surfaceCollapses = sameColor(background, snappedSurface)
	const surface = surfaceCollapses ? background : snappedSurface
	const surfaceLab: OkLab = surfaceCollapses ? backgroundSnap.lab : surfaceSnap.lab
	const publishGradient = gradientCandidate && !surfaceCollapses

	// --- decision 5, re-earned on the snapped ends ---------------------------------------------------
	let interiorStop: { color: PaletteColor; position: number } | null = null
	let residualExcursion = ramp.residualExcursion
	if (publishGradient) {
		const chord = pathExcursion(inventory, [backgroundSnap.lab, surfaceLab])
		residualExcursion = chord
		if (ramp.thirdStopAccepted && ramp.stops.length === 3) {
			const middleSnap = snapToArtwork(ramp.stops[1].target, inventory, POOLED_SAME_COLOR_BAR)
			const middle = colorFromRgb(middleSnap.rgb)
			const position = projectionFraction(backgroundSnap.lab, surfaceLab, middleSnap.lab)
			// Snapped onto an end, or no longer monotone in t: the stop has stopped being a stop.
			const distinctFromEnds = !sameColor(middle, background) && !sameColor(middle, surface)
			const monotone = position > 0 && position < 1
			if (distinctFromEnds && monotone) {
				const polyline = pathExcursion(inventory, [backgroundSnap.lab, middleSnap.lab, surfaceLab])
				const earnsItsPlace = polyline < POOLED_SAME_COLOR_BAR ||
					polyline * THIRD_STOP_REDUCTION_FACTOR <= chord
				if (earnsItsPlace) {
					interiorStop = { color: middle, position }
					residualExcursion = polyline
				}
			}
		}
	}

	// --- the overlay, against the ends actually published ---------------------------------------------
	const overlay = readOverlay(fit, raster, inventory, contrast, [backgroundSnap.lab, surfaceLab])

	// --- foreground, and decision 10's escape ----------------------------------------------------------
	let foreground: PaletteColor
	let escape: NonSourceColorEscape | null = null
	let foregroundOffArtwork = false
	if (overlay.foreground !== null) {
		foreground = colorOfRepresentative(overlay.foreground.representative)
	} else {
		const literal = escapeLiteralFor(background)
		foreground = literal
		if (presentInArtwork(inventory, literal)) {
			// The artwork contains it, so it is an ordinary source pixel and declaring an escape over
			// it would be false (`I2.escape-not-needed` is exactly this case).
			escape = null
		} else {
			escape = { role: "foreground", color: literal.hex }
			foregroundOffArtwork = true
		}
	}

	// --- accent (decision 8, terminal clause on the published pair) ---------------------------------
	const accentCandidate = overlay.accent === null
		? null
		: colorOfRepresentative(overlay.accent.representative)
	const accentCollapses = accentCandidate === null || sameColor(foreground, accentCandidate)
	const accent = accentCollapses ? foreground : accentCandidate

	// --- assembly --------------------------------------------------------------------------------------
	const stops: GradientStop[] = publishGradient
		? [
			{ color: background, position: 0 },
			...(interiorStop ? [{ color: interiorStop.color, position: interiorStop.position }] : []),
			{ color: surface, position: 1 },
		]
		: []

	// Geometry is published only because the fit computed the direction anyway (`GradientGeometry`:
	// "never computed for the sake of the output"). Normalized position runs left→right and top→down,
	// so degrees clockwise from the positive x axis is `atan2(dy, dx)` unchanged.
	const direction = publishGradient ? ramp.direction : null
	const geometry = direction === null
		? undefined
		: {
			kind: "linear" as const,
			angleDegrees: (Math.atan2(direction[1], direction[0]) * 180) / Math.PI,
		}

	const palette: Palette = {
		contractVersion: CONTRACT_VERSION,
		roles: { background, surface, foreground, accent },
		gradient: publishGradient
			? {
				stops: stops as unknown as [GradientStop, GradientStop, ...GradientStop[]],
				...(geometry ? { geometry } : {}),
			}
			: null,
		collapse: {
			// Measured on what was published, never asserted from upstream intent.
			surfaceCollapsed: surface.hex === background.hex,
			accentCollapsed: accent.hex === foreground.hex,
		},
		escape,
		contrast,
		metadata: {
			algorithmVersion: ALGORITHM_VERSION,
			preprocessingVersion: PREPROCESSING_VERSION,
			inputContentHash: await hashFileBytes(imagePath),
			sourceRendition: {
				path: imagePath,
				width: raster.width,
				height: raster.height,
				format: raster.format,
			},
			// Equal to the rendition's size, because §1 forbids resampling.
			processedSize: { width: raster.width, height: raster.height },
		},
	}

	const diagnostics: Diagnostics = {
		noField: fit.noField,
		inlierFraction: fit.inlierFraction,
		fieldExplainedFraction: fit.fieldExplainedFraction,
		residualScale: fit.residualScale,
		marginBars: fit.marginBars,
		orientationMargin: ramp.orientationMargin,
		gradient: palette.gradient !== null,
		excursionMax: ramp.excursionMax,
		thirdStopAccepted: interiorStop !== null,
		residualExcursion,
		// True on both routes to a published two-block reading: `readRamp`'s decision-5 fallback (no
		// polyline stayed on-artwork) and decision 9's precedence rescue. Together with `noField` this
		// says which of the three no-field outcomes happened, with no new diagnostics field:
		// `noField && twoBlockFallback` = rescued, `noField && !twoBlockFallback` = retreat.
		twoBlockFallback: twoBlockRescue || ramp.twoBlockFallback,
		accentChromaOnly: accentCollapses ? false : overlay.accentChromaOnly,
		offArtwork: {
			background: backgroundSnap.offArtwork,
			surface: surfaceCollapses ? backgroundSnap.offArtwork : surfaceSnap.offArtwork,
			// An overlay representative is a source triple by construction; only a declared escape is
			// genuinely not in the artwork.
			foreground: foregroundOffArtwork,
			accent: accentCollapses ? foregroundOffArtwork : false,
		},
		escape: escape !== null,
	}

	return { palette, diagnostics, fieldOrder: fit.order }
}

/** The candidate the dev loop loads. */
export const paletteOf: CandidatePalette = async (imagePath) => (await analyzeImage(imagePath)).palette

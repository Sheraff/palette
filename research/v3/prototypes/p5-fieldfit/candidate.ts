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
 * 2. **The guide stop is re-earned post-snap.** `ramp.ts`'s excursion test ran on the pre-snap
 *    targets and says so in its own header; snapping moves each vertex, so the polyline that earned
 *    a stop may no longer beat the chord. The stop is dropped when it snapped onto an end, when its
 *    projection is no longer strictly inside the ends, or when the re-measured polyline no longer
 *    passes decision 5's acceptance rule. The measurement is `ramp.ts`'s `pathExcursion`, not a copy,
 *    and since v0.6 the rule on both sides of the snap is *under the bar, or a reduction larger than
 *    `excursionResolution`* — the `≥2×` prong is gone from here and from `ramp.ts` in one edit.
 *    **What is not re-decided here is ramp-versus-two-blocks**: that is the t-continuity
 *    discriminator's call, it is made once, on the field's own inlier mass, and a snapped vertex
 *    cannot change what the picture is.
 * 3. **Overlay roles are published as their cluster's representative triple, not as its centre.**
 *    The representative *is* an exact source pixel (`overlay.ts` header, choice 1), so invariant 2 is
 *    satisfied by publishing it directly — snapping a cluster centre would be a second, weaker route
 *    to the same guarantee. `snapToArtwork` is used only for the two field ends, whose targets are
 *    continuous field values that belong to no pixel in particular.
 * 4. **Collapses are measured on the published hex**, never asserted from upstream intent, because
 *    invariant 1 checks the flag against exact hex equality and nothing else.
 *
 * ## The no-field fork, v0.5: components, then the retreat
 *
 * `noField` is a **trigger**, not a verdict (SPEC decision 12; `E2_BRIEF.md`). When the one global
 * surface explains less than half the image, this module asks `fitFieldComponents` for the pool of
 * field-like components — the same robust fit, run again on what nothing has explained yet — and
 * reads the roles off the pool:
 *
 *  - **background and gradient** come from the most extensive component, read by the *existing*
 *    `readRamp` over a `FieldFit` view of that component (`components.ts`), so the ramp is the
 *    component's own ramp over its own support and no ramp code learned about components;
 *  - **surface** is the component's far end when its ramp separates, else the **second** component
 *    when one exists and separates (arm-f §2.5's two-component reading — the polaroid), else
 *    collapsed;
 *  - **overlay** measures against the pool: `compositeFieldFit` gives `overlay.ts` a `fieldAt` that
 *    is the *local* component's surface and weights that call a pixel field iff some component
 *    explains it. This is arm-f's original local-field semantics; the old global-affine
 *    approximation was the one-component case of it.
 *  - **retreat** fires only when no component qualifies, and is otherwise unchanged (highest
 *    field-mass triple on the kept fit's weights, decision 9's pick-and-state).
 *
 * **Order of precedence between the ramp and the second component, stated.** `E2_BRIEF.md` lists the
 * second component first and the ramp's far end as the fallback. It is implemented the other way
 * round — *a component that is a ramp publishes its ramp* — because background and surface are the
 * ramp's two ends in the contract (`stops[0]` and `stops[n-1]` **are** the roles), so the far end
 * and the second component compete for one slot rather than compose. Giving the slot to the second
 * component would publish a "gradient" running between two different fields, and would lose exactly
 * the reading decision 12 pulled E2 forward to get ("we would expect such a gorgeous gradient")
 * whenever the picture also happens to hold a second flat area. The polaroid case is untouched by
 * the choice: two flat components have no ramp to separate, so the second component takes the
 * surface. Both of the brief's synthetic obligations pass under this order; obligation (a) does not
 * pass under the other one.
 *
 * **What the `Diagnostics` say about the fork (v0.5.1).** `noField && gradient` is a component ramp;
 * `noField && twoBlockFallback` is a two-component (two flat colours) reading; `noField` with neither
 * used to be a single flat component **or** the retreat, indistinguishable in the sidecar because both
 * publish one colour with the surface collapsed. `types.ts` now carries the two fields that separate
 * them, and this module is the only thing that fills them:
 *
 *  - `fieldComponents` — how many components the pool accepted, and **0 when the recursion never ran**
 *    (the global fit explained half the image). A retreat is also 0, which is why it needs the second
 *    field: 0-because-not-asked and 0-because-nothing-qualified differ by `noField`.
 *  - `retreat` — true on exactly one code path, decision 9's declared retreat below, and set where
 *    that path is taken rather than inferred afterwards from the shape of the palette. It is the
 *    "declared, never silent" half of decision 9 made machine-readable.
 *
 * `Analysis.fieldComponents` still carries the whole pool for anything that needs more than a count.
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

import {
	CONTRACT_VERSION,
	FOREGROUND_ACCENT_SEPARATION_DISTANCE,
	POOLED_SAME_COLOR_BAR,
} from "../../src/contract/constants.ts"
import {
	colorDistance,
	colorFromRgb,
	colorFromHex,
	rgbToOkLab,
	sameColor,
	sameColorBar,
} from "../../src/contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters } from "../../src/contract/invariants.ts"
import { minRawContrastOverRamp } from "../../src/contract/ramp.ts"
import type {
	GradientStop,
	NonSourceColorEscape,
	OkLab,
	Palette,
	PaletteColor,
	ResolvedContrastFloors,
} from "../../src/contract/types.ts"
import { hashFileBytes } from "../../src/devloop/code-version.ts"
import type { CandidatePalette } from "../../src/devloop/types.ts"

import { componentCentre, componentFieldFit, compositeFieldFit } from "./src/components.ts"
import type { FieldReading } from "./src/components.ts"
import { decodeAndInventory, packRgb, unpackRgb } from "./src/decode.ts"
import { fitField, fitFieldComponents } from "./src/fieldfit.ts"
import {
	ACCENT_FG_EXCLUSION_MULTIPLE,
	FOREGROUND_MIN_RAW_APCA,
	readOverlay,
} from "./src/overlay.ts"
import {
	excursionResolution,
	highestFieldMassTriple,
	pathExcursion,
	projectionFraction,
	readRampDetailed,
} from "./src/ramp.ts"
import { snapToArtwork } from "./src/snap.ts"
import type {
	Diagnostics,
	FieldFit,
	Inventory,
	MarginReport,
	PairMargin,
	RampContinuity,
	RampReading,
} from "./src/types.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p5-fieldfit"

/** `PaletteMetadata.algorithmVersion`. A label, not a measurement — the cache keys on source hashes. */
export const ALGORITHM_VERSION = "p5-fieldfit-0.6.0"

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
 * Deliberately the same two clauses `ramp.ts` applies pre-snap — under the bar outright, or a
 * reduction larger than the measurement's own resolution — because a stop that has to be re-earned
 * should be re-earned against the rule it was granted under, not a looser or a stricter one. The
 * `≥2×` prong both files used until v0.6 was deleted by decision 5's ruling of 2026-08-05 in the same
 * edit, on both sides of the snap.
 */

/** Everything `diagnose.ts` prints, and everything `paletteOf` throws away. */
export type Analysis = Readonly<{
	palette: Palette
	diagnostics: Diagnostics
	/** The fit's kept order, for the decision-9 deviation note above. */
	fieldOrder: 0 | 1
	/**
	 * The component pool, or `null` when the global fit explained half the image and the recursion
	 * never ran. `null` is therefore also the proof that a fully-explained cover takes v0.4.1's path
	 * unchanged — see the guard in `analyzeImage`.
	 */
	fieldComponents: FieldReading | null
}>

// ---------------------------------------------------------------------------------------------
// Margin reporting (v0.6) — the numbers the reviewer grades, beside the numbers the contract passes
// ---------------------------------------------------------------------------------------------
//
// The shapes (`PairMargin`, `MarginReport`) moved into `src/types.ts` in v0.6.1, with the reviewer's
// rationale, when `Diagnostics` gained the `margins` field; what stays here is the measurement, which
// is assembly's job. The two gate constants come from `overlay.ts` directly — v0.6 kept `REPORTED_`
// copies of them because that module had no exports for them, and v0.6.1 deletes both copies.
//
// **Reporting only, and structurally so**: it runs on the finished `palette`, after every decision,
// and nothing above reads its result. That is the same discipline `invariants.ts` applies to its own
// observation sink.

function pairMargin(
	pair: string,
	first: { path: string; color: PaletteColor },
	second: { path: string; color: PaletteColor },
	elevated: boolean,
	collapsed: boolean,
): PairMargin {
	const distance = colorDistance(first.color, second.color)
	const same = sameColorBar(first.color, second.color)
	// Invariant 3's elevated cell, reproduced exactly: `max`, never a replacement.
	const bar = elevated ? Math.max(same, FOREGROUND_ACCENT_SEPARATION_DISTANCE) : same
	return {
		pair,
		first: first.color.hex,
		second: second.color.hex,
		distance,
		bar,
		ratio: bar > 0 ? distance / bar : 0,
		collapsed,
	}
}

/** Every margin the contract's judgements turn on, measured on the published palette. */
function reportMargins(
	palette: Palette,
	stops: readonly GradientStop[],
	contrast: ResolvedContrastFloors,
): MarginReport {
	const { background, surface, foreground, accent } = palette.roles
	const roles = {
		background: { path: "roles.background", color: background },
		surface: { path: "roles.surface", color: surface },
		foreground: { path: "roles.foreground", color: foreground },
		accent: { path: "roles.accent", color: accent },
	} as const
	const surfaceCollapsed = palette.collapse.surfaceCollapsed
	const accentCollapsed = palette.collapse.accentCollapsed

	const pairs: PairMargin[] = [
		pairMargin("background×surface", roles.background, roles.surface, false, surfaceCollapsed),
		pairMargin("foreground×accent", roles.foreground, roles.accent, true, accentCollapsed),
		pairMargin("foreground×background", roles.foreground, roles.background, false, false),
		pairMargin("foreground×surface", roles.foreground, roles.surface, false, surfaceCollapsed),
		pairMargin("accent×background", roles.accent, roles.background, false, false),
		pairMargin("accent×surface", roles.accent, roles.surface, false, surfaceCollapsed),
	]

	// The foreground against the whole rendered ramp, at the contract's own sampling density: this is
	// the quantity invariant 4 enforces and decision 13's floor gates, side by side.
	const extremum = minRawContrastOverRamp(foreground, stops)
	const minRawApca = extremum === null || !Number.isFinite(extremum.raw)
		? 0
		: Math.abs(extremum.raw)
	const floor = Math.max(
		contrast.minTextContrast.effectiveRawMagnitude,
		FOREGROUND_MIN_RAW_APCA,
	)

	const twinDistance = colorDistance(accent, foreground)
	const twinBar = sameColorBar(accent, foreground)
	const twinRatio = twinBar > 0 ? twinDistance / twinBar : 0

	return {
		pairs,
		foregroundLegibility: {
			minRawApca,
			floor,
			ratio: floor > 0 ? minRawApca / floor : 0,
		},
		accentTwin: {
			distance: twinDistance,
			bar: twinBar,
			ratio: twinRatio,
			exclusionMultiple: ACCENT_FG_EXCLUSION_MULTIPLE,
			clearance: twinRatio / ACCENT_FG_EXCLUSION_MULTIPLE,
			collapsed: accentCollapsed,
		},
	}
}

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
	const contrast = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)

	// --- the field ends ---------------------------------------------------------------------------
	//
	// The whole-image reading first. When it explains half the image (`!noField`) this *is* the
	// reading and nothing below runs: the component recursion is guarded by the same trigger
	// decision 12 names, so a fully-explained cover takes v0.4.1's path instruction for instruction.
	let detail = readRampDetailed(fit, raster, inventory)
	let ramp: RampReading = detail.reading
	let continuity: RampContinuity | null = detail.continuity
	// What overlay measures against. The global affine field, until a component pool replaces it.
	let overlayFit: FieldFit = fit
	let fieldComponents: FieldReading | null = null
	let twoComponentReading = false
	// Set on the one branch that takes decision 9's retreat, never inferred from the published shape.
	let declaredRetreat = false

	let backgroundTarget = ramp.backgroundTarget
	let surfaceTarget = ramp.surfaceTarget
	let gradientCandidate = ramp.gradientCandidate

	if (fit.noField) {
		fieldComponents = fitFieldComponents(raster)
		const primary = fieldComponents.components[0]
		if (primary !== undefined) {
			// The component's own ramp, by the existing machinery reading a support-restricted view.
			detail = readRampDetailed(componentFieldFit(primary, raster), raster, inventory)
			ramp = detail.reading
			continuity = detail.continuity
			overlayFit = compositeFieldFit(fieldComponents, raster, fit)
			backgroundTarget = ramp.backgroundTarget
			surfaceTarget = ramp.surfaceTarget
			gradientCandidate = ramp.gradientCandidate
			const second = fieldComponents.components[1]
			// The two-component reading: only when the first component has no ramp of its own to
			// publish (see the header's precedence note). `componentCentre` is the component's field
			// at the support's own weighted centre — the colour that component *is*, where it is.
			if (!gradientCandidate && second !== undefined) {
				surfaceTarget = componentCentre(second)
				twoComponentReading = true
			}
		} else {
			// Decision 9's declared retreat, reached only now that no component qualified.
			declaredRetreat = true
			gradientCandidate = false
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
				// Decision 5's post-2026-08-05 rule, the same two clauses `ramp.ts` applies pre-snap:
				// under the bar outright, or a reduction bigger than the coarser of the two
				// measurements' own resolutions.
				const resolution = Math.max(
					excursionResolution([backgroundSnap.lab, surfaceLab]),
					excursionResolution([backgroundSnap.lab, middleSnap.lab, surfaceLab]),
				)
				const earnsItsPlace = polyline <= POOLED_SAME_COLOR_BAR ||
					polyline + resolution < chord
				if (earnsItsPlace) {
					interiorStop = { color: middle, position }
					residualExcursion = polyline
				}
			}
		}
	}

	// --- the published ramp ---------------------------------------------------------------------------
	//
	// Built before the overlay is read, not after, because decision 7's round-1 ruling ranks
	// foreground candidates by their minimum contrast **over this ramp**. Every colour in it is final
	// by this point: the ends are the snapped, collapse-resolved roles, and the interior stop has
	// already been re-earned. When no gradient is published the ramp is still the two ends — that is
	// the field a viewer sees, whether or not it is drawn as a ramp, and on a collapsed surface the
	// two ends are the same colour, which samples as a constant.
	const stops: GradientStop[] = [
		{ color: background, position: 0 },
		...(publishGradient && interiorStop
			? [{ color: interiorStop.color, position: interiorStop.position }]
			: []),
		{ color: surface, position: 1 },
	]

	// --- the overlay, against the field actually published ---------------------------------------------
	const overlay = readOverlay(overlayFit, raster, inventory, contrast, stops)

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
	//
	// `stops` was built above, for the overlay. It is the same array the palette publishes when
	// `publishGradient` holds; when it does not, it was only ever a measurement of the field and the
	// palette says `gradient: null`.
	//
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
		// 0 also when the recursion never ran; `noField` is what tells the two zeros apart.
		fieldComponents: fieldComponents?.components.length ?? 0,
		retreat: declaredRetreat,
		residualScale: fit.residualScale,
		marginBars: fit.marginBars,
		orientationMargin: ramp.orientationMargin,
		gradient: palette.gradient !== null,
		excursionMax: ramp.excursionMax,
		thirdStopAccepted: interiorStop !== null,
		residualExcursion,
		// True on both routes to a published two-flat-colour reading: `readRamp`'s decision-5 fallback
		// (no polyline stayed on-artwork) and v0.5's two-component reading, which is where decision
		// 9's two-block rescue went. See the header for what this flag can and cannot distinguish.
		// A two-component reading that collapsed on the published colours was not a two-colour reading,
		// whatever it was upstream: this flag is measured on what came out, like the collapse flags.
		twoBlockFallback: (twoComponentReading && !surfaceCollapses) || ramp.twoBlockFallback,
		// The discriminator's reading of the ramp that was published — `null` when the straight chord
		// never left the artwork, so the question never arose.
		continuity,
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
		// Last, on the finished palette: the report is a reading of what was published, and it cannot
		// influence what was published because there is nothing left to influence.
		margins: reportMargins(palette, stops, contrast),
	}

	return {
		palette,
		diagnostics,
		fieldOrder: fit.order,
		fieldComponents,
	}
}

/** The candidate the dev loop loads. */
export const paletteOf: CandidatePalette = async (imagePath) => (await analyzeImage(imagePath)).palette

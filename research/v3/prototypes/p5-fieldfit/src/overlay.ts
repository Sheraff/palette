/**
 * P5 field-fit prototype — the overlay reading (W-MARKS).
 *
 * The fit is the segmentation: `fieldfit.ts` hands us a per-pixel Tukey weight `w(x)` and this
 * module reads what the fit *rejected*. Nothing here segments, thresholds an area, or looks at
 * shape. A pixel's contribution to the overlay is `1 − w(x)` and nothing else.
 *
 * Implements SPEC decisions 6 (bar-neighbourhood agglomeration), 7 and 13 (foreground), 8 and 14
 * (accent) and the foreground half of 10 (escape), **as amended by the rulings of 2026-08-04**.
 * Both roles now read the same way — *the artwork's own colour, above a gate* — and the gates are
 * where all the evidence went:
 *
 *  - every comparison runs on published representatives, never on cluster centres;
 *  - **foreground** = argmax overlay mass among candidates clearing `FOREGROUND_MIN_RAW_APCA` over
 *    the published ramp (decision 13, resolved by measurement);
 *  - **accent** = argmax overlay mass among candidates clearing the contract's accent floor, distinct
 *    from both ends, and outside the foreground's twin radius (decision 14, measured).
 *
 * The Pareto front and the min-distance criterion both lived here and were both removed by reviewer
 * evidence; the history is in the accent block. Design sources: `phase-1/proposals/arm-f-r3.md`
 * §2.5 (overlay mass, the Pareto front, `accentChromaOnly`) and `arm-e-r3.md` §2.4
 * (bar-neighbourhood agglomeration, descending-mass order, packed-int tie-break) — **§2.4 only**.
 * Arm E's five-level lexicographic role ranking is excluded by SPEC decision 12 and is not here.
 *
 * ## Three choices this file makes that the spec left open, stated rather than buried
 *
 * 1. **Centres select; representatives publish and are judged.** A cluster has two colours: its
 *    overlay-mass-weighted OKLab centre, and its representative — the highest-overlay-mass member
 *    triple, which is an exact source pixel and therefore the one `candidate.ts` can publish.
 *
 *    Until round 1 every comparison here ran on the centre, on the reasoning that the two are within
 *    a bar of each other so nothing turns on the choice. **Round 1 refuted that**: `#000000` and
 *    `#000009` were published as foreground and accent on `2376a6b67d` because their centres were a
 *    bar apart while their representatives were not. Decision 7's ruling of 2026-08-04 is that
 *    **every distinctness and feasibility comparison runs on the representative** — the contract
 *    judges published pairs, so this module must judge the same pairs.
 *
 *    Centres survive only where the question is genuinely about the mark rather than the palette:
 *    the per-cluster deltas (`deltaL`, `deltaC`, `deltaH`), which describe how a mark departs from
 *    the field beneath it. Since decision 8's ruling (b) removed the Pareto front, nothing *selects*
 *    on them at all — they are description and diagnostics (`accentChromaOnly`). Every gate and every
 *    ranking uses the representative.
 * 2. **When a triple is inside the bar of more than one cluster, it joins the nearest one**
 *    (OKLab distance to the running centre; ties to the cluster created first, and creation order
 *    is itself total). Arm E §2.4 says "merge into an existing cluster if it lies within the bar of
 *    that cluster's centre" without saying which, and "the first one in cluster order" would make
 *    the partition depend on the order clusters happened to open where nearest does not.
 * 3. **Distances are measured on unquantized OKLab; only the *radius* comes from `sameColorBar`.**
 *    `sameColor()` takes two `PaletteColor`s and therefore round-trips a continuous centre through
 *    8-bit sRGB before measuring. For the radius that round trip is harmless (it only picks which
 *    of four regional bars applies), for the measurement it is not, so the measurement uses
 *    `okLabDistance` on the values we actually hold.
 */

import {
	colorDistance,
	colorFromRgb,
	okLabDistance,
	okLabToRgb,
	rgbToOkLab,
	sameColor,
	sameColorBar,
} from "../../../src/contract/color.ts"
import { decompose } from "../../../src/contract/perception-model-spaces.ts"
import {
	ACCENT_FUNCTIONAL_DISTANCE,
	ACCENT_VISIBILITY_COLOR_DISTANCE,
} from "../../../src/contract/constants.ts"
import { firstInvisibleAccentOnRamp, minRawContrastOverRamp } from "../../../src/contract/ramp.ts"
import type {
	GradientStop,
	OkLab,
	PaletteColor,
	ResolvedContrastFloors,
} from "../../../src/contract/types.ts"
import { normalizedX, normalizedY, unpackRgb } from "./decode.ts"
import type {
	DecodedRaster,
	FieldFit,
	Inventory,
	OverlayCluster,
	OverlayReading,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/**
 * Fraction of the image's **total** overlay mass below which a triple is dropped before
 * agglomeration.
 *
 * `[UNCALIBRATED]` — no measurement stands behind the number. It exists only so that the
 * agglomeration loop is not quadratic in the tens of thousands of triples that carry a rounding
 * error's worth of rejection weight on a photograph, and it is expressed as a fraction of the
 * image's own overlay mass rather than as a pixel count so that it is scale-free
 * (`CONVENTIONS.md`). At 1e-4 a triple must hold one part in ten thousand of everything the fit
 * rejected to be considered at all: on a 1000×1000 image whose fit rejects 5% of pixels that is
 * 5 pixels' worth of full rejection.
 *
 * Expect retuning against the demo set. The value is reported nowhere yet; if it ever changes a
 * role, that is a finding and belongs in diagnostics.
 */
export const NEGLIGIBLE_OVERLAY_MASS_FRACTION = 1e-4

/**
 * Ramp sampling density for **selection**, which is not validation.
 *
 * `[UNCALIBRATED]` — a compute budget, not a perceptual quantity, and it is deliberately far below
 * the contract's own `RAMP_SAMPLES_PER_SEGMENT` (2048) / `RAMP_REFINEMENT_SAMPLES` (4096).
 * `minRawContrastOverRamp` is called once per surviving cluster here, and a cover with two hundred
 * clusters would otherwise pay two million APCA evaluations to rank colours it is going to rank the
 * same way at a hundredth of the density: the minimum of |raw APCA| along a two-segment OKLab
 * interpolation is smooth, and the refinement pass around the coarse winner recovers the location.
 *
 * Nothing published depends on this. Invariant 4 re-measures the winner at full density, and if the
 * two ever disagreed the invariant's number is the one that counts — this only decides which cluster
 * is *offered* to it.
 */
const SELECTION_RAMP_SAMPLES_PER_SEGMENT = 64
const SELECTION_RAMP_REFINEMENT_SAMPLES = 64

// ---------------------------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------------------------

/**
 * Positions come from `decode.ts`'s `normalizedX` / `normalizedY` and packing from its
 * `packRgb` / `unpackRgb` — deliberately imported rather than reimplemented. The fit's design
 * matrix is built in that coordinate system, so a second copy of the convention here would put
 * `fieldAt(meanX, meanY)` in a different coordinate system from the coefficients it evaluates.
 */

/**
 * A continuous OKLab value as a contract colour, for the two contract functions that only accept
 * one (`sameColorBar`'s region lookup and `apcaRaw`'s 8-bit input). Quantizing here is safe for
 * both: the region lookup is a four-way classification and APCA is defined on 8-bit triples.
 */
function paletteColorOfLab(lab: OkLab): PaletteColor {
	return colorFromRgb(okLabToRgb(lab))
}

/**
 * "Same colour" at this pair's regional bar, measured on the unquantized values (choice 3 in the
 * file header). Equivalent to `sameColor(a, b)` except that the distance does not round-trip.
 */
function sameColorLab(first: OkLab, second: OkLab): boolean {
	return okLabDistance(first, second) <
		sameColorBar(paletteColorOfLab(first), paletteColorOfLab(second))
}

// ---------------------------------------------------------------------------------------------
// Pass 1 — overlay mass per exact triple
// ---------------------------------------------------------------------------------------------

type TripleOverlay = {
	packed: number
	lab: OkLab
	/** Σ(1 − w) over this triple's pixels. */
	mass: number
	/** Σ(1 − w)·x over this triple's pixels (normalized x). Divide by `mass` for the mean. */
	sumX: number
	sumY: number
}

/**
 * One pass over the raster, accumulating per packed value: overlay mass and the two
 * overlay-mass-weighted position moments.
 *
 * A non-finite weight is read as a full inlier (overlay 0) rather than propagating NaN into every
 * downstream sum — a fit that produced one has a bug, and the right place to see that is
 * `fieldfit.ts`'s own diagnostics, not a silently poisoned palette. Weights are clamped to [0, 1]
 * for the same reason.
 */
function accumulateOverlayMass(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
): { triples: Map<number, TripleOverlay>; totalMass: number } {
	const { width, height, packed, lab: rasterLab } = raster
	const pixelCount = width * height
	if (packed.length < pixelCount || fit.weights.length < pixelCount) {
		throw new Error(
			`overlay: raster ${width}×${height} needs ${pixelCount} packed values and weights, ` +
				`got ${packed.length} and ${fit.weights.length}`,
		)
	}
	void rasterLab // the OKLab raster is not needed here: exact triples carry their own OKLab.

	const triples = new Map<number, TripleOverlay>()
	let totalMass = 0

	for (let row = 0; row < height; row++) {
		const y = normalizedY(row, height)
		const rowOffset = row * width
		for (let column = 0; column < width; column++) {
			const index = rowOffset + column
			const rawWeight = fit.weights[index]!
			const weight = Number.isFinite(rawWeight) ? Math.min(1, Math.max(0, rawWeight)) : 1
			const overlay = 1 - weight
			if (overlay <= 0) continue

			const key = packed[index]!
			const x = normalizedX(column, width)
			let entry = triples.get(key)
			if (entry === undefined) {
				// The inventory is authoritative for a triple's OKLab. The fallback exists only so
				// that a raster/inventory mismatch is a wrong colour rather than a crash; it cannot
				// disagree, because both sides derive OKLab from the same exact 8-bit triple.
				const stats = inventory.triples.get(key)
				entry = {
					packed: key,
					lab: stats === undefined ? rgbToOkLab(unpackRgb(key)) : stats.lab,
					mass: 0,
					sumX: 0,
					sumY: 0,
				}
				triples.set(key, entry)
			}
			entry.mass += overlay
			entry.sumX += overlay * x
			entry.sumY += overlay * y
			totalMass += overlay
		}
	}

	return { triples, totalMass }
}

// ---------------------------------------------------------------------------------------------
// SPEC decision 6 — bar-neighbourhood agglomeration
// ---------------------------------------------------------------------------------------------

type Agglomerate = {
	mass: number
	/** Overlay-mass-weighted OKLab sums; the centre is these over `mass`. */
	sumL: number
	sumA: number
	sumB: number
	sumX: number
	sumY: number
	centre: OkLab
	memberCount: number
	representative: number
	representativeMass: number
}

function recentre(cluster: Agglomerate): void {
	cluster.centre = [
		cluster.sumL / cluster.mass,
		cluster.sumA / cluster.mass,
		cluster.sumB / cluster.mass,
	]
}

/**
 * Agglomerate triples into bar-neighbourhoods (SPEC decision 6, arm-e-r3 §2.4).
 *
 * Descending overlay mass, packed-int tie-break — a total, canonical order. Each triple joins the
 * nearest existing cluster whose running centre is within the pair's regional bar, else opens a
 * new one. The property the design leans on: a sub-bar perturbation cannot change the partition,
 * because anything a dither splits apart is by definition closer than the merge radius and gets
 * re-merged. That is the dither answer, and `tests/overlay.test.ts` case 2 is its self-test.
 */
function agglomerate(candidates: readonly TripleOverlay[]): Agglomerate[] {
	const ordered = [...candidates].sort((first, second) =>
		second.mass - first.mass || first.packed - second.packed
	)

	const clusters: Agglomerate[] = []
	for (const triple of ordered) {
		let best: Agglomerate | null = null
		let bestDistance = Number.POSITIVE_INFINITY
		for (const cluster of clusters) {
			const distance = okLabDistance(triple.lab, cluster.centre)
			if (distance >= bestDistance) continue // ties keep the earlier (higher-mass) cluster
			const bar = sameColorBar(
				paletteColorOfLab(triple.lab),
				paletteColorOfLab(cluster.centre),
			)
			if (distance >= bar) continue
			best = cluster
			bestDistance = distance
		}

		if (best === null) {
			const created: Agglomerate = {
				mass: triple.mass,
				sumL: triple.lab[0] * triple.mass,
				sumA: triple.lab[1] * triple.mass,
				sumB: triple.lab[2] * triple.mass,
				sumX: triple.sumX,
				sumY: triple.sumY,
				centre: triple.lab,
				memberCount: 1,
				representative: triple.packed,
				representativeMass: triple.mass,
				}
			clusters.push(created)
			continue
		}

		best.mass += triple.mass
		best.sumL += triple.lab[0] * triple.mass
		best.sumA += triple.lab[1] * triple.mass
		best.sumB += triple.lab[2] * triple.mass
		best.sumX += triple.sumX
		best.sumY += triple.sumY
		best.memberCount += 1
		if (
			triple.mass > best.representativeMass ||
			(triple.mass === best.representativeMass && triple.packed < best.representative)
		) {
			best.representative = triple.packed
			best.representativeMass = triple.mass
		}
		recentre(best)
	}

	return clusters
}

// ---------------------------------------------------------------------------------------------
// Cluster construction
// ---------------------------------------------------------------------------------------------

function readCluster(cluster: Agglomerate, fit: FieldFit): OverlayCluster {
	const meanX = cluster.sumX / cluster.mass
	const meanY = cluster.sumY / cluster.mass
	const localField = fit.fieldAt(meanX, meanY)
	// `decompose(from, to)` returns `to − from`, so this is the cluster's displacement *away from*
	// the field beneath it: ΔL signed, ΔC signed (difference of chroma radii), ΔH the residual
	// chromatic distance √(Δa² + Δb² − ΔC²) ≥ 0. Contract helper, so the identity
	// Δ² = ΔL² + ΔC² + ΔH² holds exactly and the numbers are speakable in the perception work's
	// own vocabulary (arm-f-r3 §2.5 asks for exactly that decomposition).
	const delta = decompose(localField, cluster.centre)
	return {
		representative: cluster.representative,
		lab: cluster.centre,
		overlayMass: cluster.mass,
		meanX,
		meanY,
		localField,
		deltaL: delta.deltaLightness,
		deltaC: delta.deltaChroma,
		deltaH: delta.deltaHue,
		memberCount: cluster.memberCount,
	}
}

// ---------------------------------------------------------------------------------------------
// SPEC decision 7 — foreground
// ---------------------------------------------------------------------------------------------

/**
 * **The contrast floor moved onto the ramp, and became the ranking as well as the filter.**
 *
 * Until round 1 this module asked one `apcaRaw` question — cluster centre against the local field —
 * and used it only as a pass/fail gate, ranking by overlay mass. Decision 7's round-1 ruling replaced
 * the ranking with `min|raw APCA|` over the whole published ramp, and once that number is being
 * computed there is no reason for the gate to be a *different* number: `readOverlay` now filters and
 * ranks on the same quantity, via the contract's own `minRawContrastOverRamp`.
 *
 * The floor is `ResolvedContrastFloors.minTextContrast.effectiveRawMagnitude`, which is
 * `max(lcFloorToRawMagnitude(requestedLc), EPSILON_TEXT_RAW)` — and `EPSILON_TEXT_RAW` is **2.5, not
 * 0**, so the default floor is nonzero and APCA is genuinely evaluated. What it filters is
 * nonetheless close to nothing, by construction: two *identical* colours cannot exceed |raw| =
 * 1.98152 (`APCA_RAW_IDENTICAL_CEILING`), so 2.5 rejects only pairs within a hair of identical, which
 * the distinctness tests have already rejected. SPEC decision 7's "default filters nothing" is
 * therefore true in practice rather than by definition, and this is the sentence that says which.
 *
 * Two consequences of measuring over the ramp rather than against the local field, both intended:
 * a mark that is legible where it sits but would vanish against the *other* end of a gradient is now
 * ranked by its worst case, and on a flat field the two measurements coincide.
 */

// ---------------------------------------------------------------------------------------------
// SPEC decision 8 — accent
// ---------------------------------------------------------------------------------------------
//
// Nothing lives here any more. The Pareto front on (|ΔL|, √(ΔC² + ΔH²)) and its `AccentCandidate`
// row were deleted by decision 8's ruling (b) of 2026-08-04; the accent is now selected inside
// `readOverlay` by one criterion — maximum minimum OKLab distance to everything already published —
// and needs no structure of its own. The history is in `readOverlay`'s accent block.

// ---------------------------------------------------------------------------------------------
// SPEC decisions 13 and 14 — the two measured constants
// ---------------------------------------------------------------------------------------------

/**
 * **The foreground's legibility floor**, in |raw APCA| over the published ramp.
 *
 * `[UNCALIBRATED]` — but *bracketed by reviewer evidence*, which is why the number is 15 and not a
 * round guess. SPEC decision 13, resolved from the pass-7 comparison table (22 covers, 15 of which
 * the two candidate rules disagreed on):
 *
 *  - mass-led's reviewer-**endorsed** win — round-2 item 7, the white title on the sky-ramp cover —
 *    sits at |raw| **28.9**;
 *  - mass-led's reviewer-**refuted** picks sit at **3.7, 4.9, 7.7 and 10.6**, the 4.9 being verbatim
 *    the round-1 UNACCEPTABLE `#e4e4e4` *"foreground barely registers"*.
 *
 * So every floor in the open interval **(10.6, 28.9]** honours all current evidence, and 15 is chosen
 * inside that bracket. Round 3 may tighten it; what it may not do is quietly widen it, because the
 * two endpoints are reviewer verdicts on named covers rather than intuitions.
 *
 * This is the prototype's own floor and it is combined with — never substituted for — the caller's
 * `minTextContrast`: the effective floor is the larger of the two, so a caller can raise it and
 * cannot lower it below the evidence.
 *
 * **Exported for reporting only** (v0.6.1). `candidate.ts` prints it beside the foreground's measured
 * `min|raw APCA|` and never compares against it; it used to keep a `REPORTED_` copy, which was one
 * edit away from disagreeing with the gate it claimed to describe.
 */
export const FOREGROUND_MIN_RAW_APCA = 15

/**
 * **The accent's twin-exclusion multiple**: a candidate within
 * `ACCENT_FG_EXCLUSION_MULTIPLE × sameColorBar(candidate, foreground)` of the published foreground is
 * the foreground's family, not a second colour.
 *
 * `[MEASURED — SPEC decision 14]`, and measured is the operative word: the value is the smallest
 * integer that excludes all three evidenced twin pairs with at least 20% margin. The pairs are the
 * ones this prototype actually published and a reviewer actually called indistinguishable, with
 * their measured `distance / sameColorBar` ratios:
 *
 *  - `#fed078` / `#febf6f` (round-1 item 7, `908479200b`) — d 0.04050, bar 0.02293, ratio **1.766**
 *  - `#fffce1` / `#fee2ba` (pass-7, `16a8247378`) — d 0.06851, bar 0.02293, ratio **2.988**
 *  - `#000000` / `#000100` (pass-7, the second round-2 fresh cover) — d 0.06151, bar 0.00932,
 *    ratio **6.599**
 *
 * Largest ratio 6.599 × 1.2 = 7.919, so the smallest qualifying integer is **8**. The spread across
 * the three (1.8 to 6.6) is itself the finding, and it is a statement about the *formula* rather than
 * about this prototype: the same-colour bar is far tighter near black than a viewer is. That is
 * reported upward as calibration input, and this multiple is superseded automatically by any
 * recalibration of `sameColorBar` — it exists only to stand in for a bar that does not yet match the
 * reviewer's eye.
 *
 * **Exported for reporting only** (v0.6.1), for the same reason as `FOREGROUND_MIN_RAW_APCA`:
 * `candidate.ts` publishes the accent's twin ratio against this number and its `REPORTED_` mirror
 * could drift from it.
 */
export const ACCENT_FG_EXCLUSION_MULTIPLE = 8

// ---------------------------------------------------------------------------------------------
// SPEC decision 15b — measured, and NOT adopted
// ---------------------------------------------------------------------------------------------
//
// Decision 15b asks for the foreground preference to run on ink-like mass rather than raw mass. It is
// **not implemented here, because the instrument it names does not measure anything on this object**,
// and the measurement is recorded so the ruling can be re-opened on better grounds rather than
// re-attempted on these.
//
// W-P12 built the instrument (`components.ts`), ran it over every floor-clearing candidate on the
// three covers decision 15b names (round-3 items 4, 7 and 8 — 60 clusters), and measured:
//
//  - **erosion mortality = 1.0000 on 60 of 60 clusters.** A bar-neighbourhood cluster's support is a
//    colour family's pixels, and at bar resolution *every* family on a photographic cover is a set of
//    filaments — the artwork's type and the depicted regions alike. Dropping the erosion radius does
//    not recover the signal, it inverts it: at r = 1 px the reviewer-named type families measure 0.52
//    (item 7's white title) and 0.76 (item 3's black type) while the *fields* measure 0.26, 0.58, 0.70
//    and 0.996. There is no radius at which thinness distinguishes a title from a leaf.
//  - **ground adjacency carries no more.** On a globally-fitted cover it is ≈ 1 for everything (the
//    fit's inliers are the whole canvas); on a component cover it is ≈ 0 for everything (the pool
//    claims a fifth of it). On item 4, where it does vary, it ranks the droplet shadows (0.99) above
//    the white title family (0.70) — the wrong way round on the cover the ruling cites.
//
// The instrument is real where the support is a *region* — that is the field-candidacy veto, decision
// 15a, which it decides cleanly (`components.ts`). A cluster is not a region. Foreground therefore
// stays on decision 13's rule until a mark-level support exists to measure; arm-f's scale-space mark
// grouping, still deferred by decision 12, is the shape of the thing that would supply one.

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/**
 * Read the overlay: cluster what the fit rejected, then pick foreground and accent off it.
 *
 * `fieldEnds` is the pair of field end colours (background and surface targets, continuous and
 * pre-snap) that `ramp.ts` produced. It is an argument rather than something derived here because
 * SPEC decision 8 requires the accent to be distinct from **both** ends and this module does not
 * read the ramp. For a collapsed (order-0 / flat) field pass the same OKLab value twice.
 *
 * Determinism: every ordering in this function ends at the packed 24-bit integer, which is unique
 * per triple, so there is no tie left for iteration order to decide.
 */
export function readOverlay(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
	contrast: ResolvedContrastFloors,
	publishedRamp: readonly GradientStop[],
): OverlayReading {
	if (publishedRamp.length < 2) {
		throw new RangeError(`readOverlay needs at least two published stops, got ${publishedRamp.length}`)
	}
	const { triples, totalMass } = accumulateOverlayMass(fit, raster, inventory)

	if (totalMass <= 0) {
		// The fit rejected nothing. There is no overlay, so there is no foreground: the escape path
		// (SPEC decision 10) is the caller's, not ours.
		return { clusters: [], foreground: null, accent: null, accentChromaOnly: false }
	}

	const massFloor = totalMass * NEGLIGIBLE_OVERLAY_MASS_FRACTION
	const meaningful: TripleOverlay[] = []
	for (const triple of triples.values()) {
		if (triple.mass >= massFloor) meaningful.push(triple)
	}

	const clusters = agglomerate(meaningful)
		.map((cluster) => readCluster(cluster, fit))
		.sort((first, second) =>
			second.overlayMass - first.overlayMass ||
			first.representative - second.representative
		)

	// The published field, as the contract will see it: the ramp's ends are `roles.background` and
	// `roles.surface` (the endpoint ruling), and the ramp itself is what a viewer actually looks at.
	const publishedEnds = [
		publishedRamp[0].color,
		publishedRamp[publishedRamp.length - 1].color,
	] as const
	const published = new Map<OverlayCluster, PaletteColor>(
		clusters.map((cluster) => [cluster, colorFromRgb(unpackRgb(cluster.representative))]),
	)

	/**
	 * Feasible = publishable. Decision 7's round-1 ruling: every distinctness comparison runs on the
	 * **representative**, because that is the colour that goes in the palette and the colour the
	 * contract judges. Round 1 caught the cost of not doing this — `#000000` and `#000009` published
	 * as foreground and accent on `2376a6b67d`, two clusters whose *centres* were a bar apart.
	 */
	const feasible = clusters.filter((cluster) => {
		const color = published.get(cluster)!
		// Distinct from the field *at its own mean position* — the whole point of a fitted field is
		// that "the background" is a different colour in different places. Measured on the
		// representative too, per the ruling's "ALL comparisons".
		if (sameColorLab(rgbToOkLab(color.rgb), cluster.localField)) return false
		return !publishedEnds.some((end) => sameColor(color, end))
	})

	// --- foreground (SPEC decision 7, re-ranked by round-1 evidence) ------------------------------
	//
	// Was: max overlay mass among the feasible. Round 1 graded item 1 UNACCEPTABLE — *"foreground
	// barely registers"* — because the heaviest mark on a cover is routinely a low-contrast one, and
	// mass answers "how much of this colour is there", not "can this be read".
	//
	// Now: **argmax of min|raw APCA| over the whole rendered ramp**, which is the contract's own
	// legibility question (invariant 4 enforces a floor on exactly this quantity, over exactly this
	// ramp) asked as a preference instead of a threshold. The same number therefore filters and ranks:
	// a cluster below the caller's floor is not merely last, it is not a foreground at all. Mass
	// survives as the tie-break, then the packed integer, so the order is still total.
	const textFloor = contrast.minTextContrast.effectiveRawMagnitude
	const legibility = new Map<OverlayCluster, number>()
	for (const cluster of feasible) {
		const extremum = minRawContrastOverRamp(
			published.get(cluster)!,
			publishedRamp,
			SELECTION_RAMP_SAMPLES_PER_SEGMENT,
			SELECTION_RAMP_REFINEMENT_SAMPLES,
		)
		// A null extremum needs a malformed ramp, and a non-finite raw needs a colour APCA cannot
		// score. Neither is a foreground; both are invariant 1's problem, not this module's.
		const raw = extremum === null || !Number.isFinite(extremum.raw) ? 0 : Math.abs(extremum.raw)
		legibility.set(cluster, raw)
	}

	// The floor is the larger of the caller's request and the prototype's evidence-bracketed one, so
	// raising `minTextContrast` tightens the gate and nothing can loosen it below the bracket.
	const foregroundFloor = Math.max(textFloor, FOREGROUND_MIN_RAW_APCA)
	const admissible = feasible.filter((cluster) => legibility.get(cluster)! >= foregroundFloor)

	// `admissible` preserves `clusters`' descending-mass, ascending-packed order, so its first element
	// *is* argmax mass with the packed int as tie-break (SPEC decision 13; 15b measured and refused
	// above).
	const foreground: OverlayCluster | null = admissible[0] ?? null

	if (foreground === null) {
		// Nothing publishable and legible: SPEC decision 10's escape. The escape colour itself is
		// assembled by `candidate.ts`, which owns the inventory-absence check; all this module can
		// honestly say is that the overlay offers nothing.
		return { clusters, foreground: null, accent: null, accentChromaOnly: false }
	}

	// --- accent (SPEC decision 8, third and current ruling) --------------------------------------
	//
	// **Argmax overlay mass among feasible candidates.** Mass is back, and the two gates that were
	// missing the last time it led are now in force — that is the whole content of the v0.4 ruling.
	//
	// The path here is worth keeping, because each step was refuted by evidence rather than by taste:
	//
	//  1. *max overlay mass on a Pareto front* (v0.1) — round 1 items 3/5/6: mass-heavy dull clusters
	//     won while the artwork's vivid colours lost.
	//  2. *max min-distance to everything published, on the front* (v0.2) — fixed the dull winners,
	//     but published `#00000b` on `#010000`: distance with no floor at all.
	//  3. *the front dropped, floor added, still max min-distance* (v0.3) — legal everywhere (zero
	//     invariant violations on demo-20) and still wrong: round 2 refuted it on both covers where
	//     its pick differed from the reviewer's. Item 2's dark olive — *"doesn't feel like a part of
	//     this artwork… missing the white"*; item 6's obsidian — *"Black is not part of the
	//     identity… only small shadows"*. **Maximising distance from what is published rewards
	//     precisely the colours least like the artwork**, which is the identity principle inverted.
	//  4. *argmax overlay mass, above the gates* (v0.4, here). Overlay mass is this mechanism's own
	//     measure of salient presence — how much of the image the fit rejected in this colour — so it
	//     is the reading of "part of the artwork" that P5 already computes. The gates are what v0.2
	//     lacked: representative-level distinctness (its twins failed it) and the contract's accent
	//     floor (its I4 rows failed it). Both are above this line, so mass never has to be trusted to
	//     produce legibility or distinctness on its own.
	//
	// The floor is the contract's own accent clause and is a pointwise **conjunction** — invisible
	// only where `|raw| < minAccentContrast` **and** the pair is closer than
	// `ACCENT_FUNCTIONAL_DISTANCE` at the same ramp point — because an accent is icons and can be read
	// by hue where a paragraph cannot. Endorsed reading (SPEC decision 8a): a filter must never be
	// stricter than the invariant it exists to satisfy. A saturated red `#c81e1e` on a dark-to-mid
	// grey ramp has min |raw| = 0.901 but distance 0.203 there, so the contract accepts it and a plain
	// |raw| minimum would not.
	//
	// `deltaL`/`deltaC`/`deltaH` stay on `OverlayCluster` as description and as `accentChromaOnly`'s
	// input; nothing selects on them. `paretoFront` was deleted in v0.3 and stays deleted.
	const resolvedForeground = foreground
	const foregroundColor = published.get(resolvedForeground)!
	const accentFloor = contrast.minAccentContrast.effectiveRawMagnitude

	let winner: OverlayCluster | null = null
	for (const cluster of feasible) {
		if (cluster === resolvedForeground) continue
		const color = published.get(cluster)!
		// Distinctness from the two ends came with `feasible`; this is the third published colour —
		// and for this one pair `sameColor` is not enough. SPEC decision 14: a candidate inside
		// `ACCENT_FG_EXCLUSION_MULTIPLE` bars of the foreground is the foreground's family, however
		// the formula scores it, because a reviewer twice called such pairs indistinguishable.
		if (
			colorDistance(color, foregroundColor) <
				ACCENT_FG_EXCLUSION_MULTIPLE * sameColorBar(color, foregroundColor)
		) continue
		// SPEC decision 16, the accent visibility floor (round-3 ruling R3). `sameColor` above already
		// asked whether this colour is *a different colour* from each end; round 3 measured that the
		// reviewer is asking something else — whether it can be *seen* on the field — and that the
		// answer orders by raw OKLab distance rather than by bar ratio: complained-about accents sat at
		// 0.034 / 0.042 / 0.048 (up to 5.2 bars), silent ones at ≥ 0.092. The contract's own
		// `ACCENT_VISIBILITY_COLOR_DISTANCE` separates the batch 8-for-8 and sits inside that gap, at
		// the site it was written for. Both ends, never one: item 5's accent cleared the background and
		// failed the surface, and the complaint named the surface.
		//
		// **No `background × surface` analogue** — round-3 finding 5, and it is why this is a floor on
		// the accent rather than a margin gate: the tightest pair in the batch was `background × surface`
		// at 1.21 bars, on the item the reviewer graded STRONG in silence. Margins are role-aware.
		if (publishedEnds.some((end) => colorDistance(color, end) < ACCENT_VISIBILITY_COLOR_DISTANCE)) {
			continue
		}
		// Invisible anywhere on the ramp ⇒ not an accent. `null` means no such point exists. Same
		// selection-density budget as the foreground's ranking, and for the same reason: at the
		// contract's default 2048/4096 this call alone took the demo-20 run from 0.8 s to 6.8 s.
		if (
			firstInvisibleAccentOnRamp(
				color,
				publishedRamp,
				accentFloor,
				ACCENT_FUNCTIONAL_DISTANCE,
				SELECTION_RAMP_SAMPLES_PER_SEGMENT,
				SELECTION_RAMP_REFINEMENT_SAMPLES,
			) !== null
		) continue
		// `feasible` preserves `clusters`' descending-mass, ascending-packed order, so the first
		// survivor *is* argmax mass with the packed int as tie-break. Written as a break rather than
		// as a scan so the ordering the answer depends on is impossible to miss.
		winner = cluster
		break
	}

	if (winner === null) {
		// Nothing both legible and distinct: decision 8's terminal clause. `candidate.ts` turns this
		// into the declared collapse onto the foreground.
		return { clusters, foreground: resolvedForeground, accent: null, accentChromaOnly: false }
	}

	// The known-fragile case made visible rather than silent (arm-f-r3 §2.5): an accent that moves
	// only in chroma/hue, by less than the pair's own bar in lightness. Diagnostics, never a veto.
	const accentChromaOnly = Math.abs(winner.deltaL) < sameColorBar(
		published.get(winner)!,
		paletteColorOfLab(winner.localField),
	)

	return { clusters, foreground: resolvedForeground, accent: winner, accentChromaOnly }
}

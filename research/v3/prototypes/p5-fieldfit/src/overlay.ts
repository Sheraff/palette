/**
 * P5 field-fit prototype — the overlay reading (W-MARKS).
 *
 * The fit is the segmentation: `fieldfit.ts` hands us a per-pixel Tukey weight `w(x)` and this
 * module reads what the fit *rejected*. Nothing here segments, thresholds an area, or looks at
 * shape. A pixel's contribution to the overlay is `1 − w(x)` and nothing else.
 *
 * Implements SPEC decisions 6 (bar-neighbourhood agglomeration), 7 (foreground), 8 (accent Pareto
 * front) and the foreground half of 10 (escape). Design sources: `phase-1/proposals/arm-f-r3.md`
 * §2.5 (overlay mass, the Pareto front, `accentChromaOnly`) and `arm-e-r3.md` §2.4
 * (bar-neighbourhood agglomeration, descending-mass order, packed-int tie-break) — **§2.4 only**.
 * Arm E's five-level lexicographic role ranking is excluded by SPEC decision 12 and is not here.
 *
 * ## Three choices this file makes that the spec left open, stated rather than buried
 *
 * 1. **A cluster's colour is its overlay-mass-weighted OKLab centre, not its representative
 *    triple.** Every colour comparison in this file (distinctness against the local field, against
 *    the foreground, against the field ends) and every delta is measured on that centre. The
 *    representative — the highest-overlay-mass member triple — is the *exact source pixel* handle
 *    that `candidate.ts` publishes, because the contract only ever publishes exact pixels. The two
 *    are within a bar of each other by construction, so nothing turns on the choice; it is written
 *    down because it is the kind of thing that quietly diverges between modules otherwise.
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
	apcaRaw,
	colorFromRgb,
	okLabDistance,
	okLabToRgb,
	rgbToOkLab,
	sameColor,
	sameColorBar,
} from "../../../src/contract/color.ts"
import { decompose } from "../../../src/contract/perception-model-spaces.ts"
import type {
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
 * Does this cluster clear the caller's contrast floor against the field beneath it?
 *
 * The floor is `ResolvedContrastFloors.minTextContrast.effectiveRawMagnitude`, which is
 * `max(lcFloorToRawMagnitude(requestedLc), EPSILON_TEXT_RAW)` — and `EPSILON_TEXT_RAW` is **2.5,
 * not 0**, so the default floor is nonzero and APCA is genuinely evaluated. It is one `apcaRaw`
 * call per cluster, so there is no cost worth avoiding.
 *
 * What the default floor filters is nonetheless close to nothing, by construction: two *identical*
 * colours cannot exceed |raw| = 1.98152 (`APCA_RAW_IDENTICAL_CEILING`), so 2.5 rejects only pairs
 * that are within a hair of identical — which the distinctness test above it has already rejected.
 * SPEC decision 7's "default filters nothing" is therefore true in practice rather than by
 * definition, and this is the sentence that says which.
 */
function clearsContrastFloor(cluster: OverlayCluster, floorRawMagnitude: number): boolean {
	const text = okLabToRgb(cluster.lab)
	const field = okLabToRgb(cluster.localField)
	const raw = apcaRaw(text, field)
	if (!Number.isFinite(raw)) return false
	return Math.abs(raw) >= floorRawMagnitude
}

// ---------------------------------------------------------------------------------------------
// SPEC decision 8 — accent
// ---------------------------------------------------------------------------------------------

type AccentCandidate = {
	cluster: OverlayCluster
	/** Lightness departure from the local field. */
	lightness: number
	/** Chromatic departure from the local field, √(ΔC² + ΔH²). */
	chromatic: number
}

/**
 * The Pareto front on (|ΔL|, √(ΔC² + ΔH²)), both maximized.
 *
 * A front and not a weighted sum, on purpose (arm-f-r3 §2.5): the perception work found lightness
 * departure works about twice as often at matched distance, but the brief is explicit that this is
 * *a direction and not a coefficient*. A weight would invent the constant two rounds have refused
 * to measure. The front honours the direction structurally — a chroma-only candidate reaches it
 * only when nothing dominates it — and SPEC decision 12 excludes hand-weighted multi-term scores
 * for the same reason.
 *
 * Dominance is strict: `q` dominates `p` when it is at least as far on both axes and strictly
 * further on one. Exact duplicates therefore both survive, and the mass tie-break below settles
 * them.
 */
function paretoFront(candidates: readonly AccentCandidate[]): AccentCandidate[] {
	return candidates.filter((candidate) =>
		!candidates.some((other) =>
			other !== candidate &&
			other.lightness >= candidate.lightness &&
			other.chromatic >= candidate.chromatic &&
			(other.lightness > candidate.lightness || other.chromatic > candidate.chromatic)
		)
	)
}

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
	fieldEnds: readonly [OkLab, OkLab],
): OverlayReading {
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

	// --- foreground (SPEC decision 7) ---
	//
	// Two different questions, and decision 7's 2026-08-04 ruling is that both must be answered.
	//
	//  - *Which mark is the foreground* is a question about the local field: a mark is text because it
	//    departs from whatever the field is **beneath it**, and on a fitted field that is a different
	//    colour in different places. This is the selector, and it is measured on cluster centres.
	//  - *May this mark be published as the foreground* is a question about the contract, which knows
	//    nothing about local fields: invariant 3 compares `roles.foreground` against the published
	//    `roles.background` and `roles.surface`, globally. On demo-20 the gap between the two
	//    questions was ten `I3.pair-not-distinct` rows — clusters legitimately distinct from the field
	//    under them, landing within the bar of the *snapped* end the palette went on to publish.
	//
	// So the ends are a hard feasibility constraint, and it is measured the way the contract measures
	// it: on the **published** colours. The cluster's published colour is its representative triple
	// (header choice 1), not its centre, and `fieldEnds` are the snapped ends' exact triple labs, so
	// both sides of this comparison are the 8-bit colours that will actually appear in the palette.
	const textFloor = contrast.minTextContrast.effectiveRawMagnitude
	const publishedEnds = [paletteColorOfLab(fieldEnds[0]), paletteColorOfLab(fieldEnds[1])] as const
	let foreground: OverlayCluster | null = null
	for (const cluster of clusters) {
		// Distinct from the field *at its own mean position* — the whole point of a fitted field is
		// that "the background" is a different colour in different places.
		if (sameColorLab(cluster.lab, cluster.localField)) continue
		const published = colorFromRgb(unpackRgb(cluster.representative))
		if (publishedEnds.some((end) => sameColor(published, end))) continue
		if (!clearsContrastFloor(cluster, textFloor)) continue
		foreground = cluster // clusters are already in descending-mass order
		break
	}

	if (foreground === null) {
		// No cluster is separated from its local field by the bar: SPEC decision 10's escape. The
		// escape colour itself is assembled by `candidate.ts`, which owns the inventory-absence
		// check; all this module can honestly say is that the overlay offers nothing.
		return { clusters, foreground: null, accent: null, accentChromaOnly: false }
	}

	// --- accent (SPEC decision 8) ---
	const resolvedForeground = foreground
	const candidates: AccentCandidate[] = []
	for (const cluster of clusters) {
		if (cluster === resolvedForeground) continue
		if (sameColorLab(cluster.lab, resolvedForeground.lab)) continue
		if (sameColorLab(cluster.lab, fieldEnds[0])) continue
		if (sameColorLab(cluster.lab, fieldEnds[1])) continue
		candidates.push({
			cluster,
			lightness: Math.abs(cluster.deltaL),
			chromatic: Math.hypot(cluster.deltaC, cluster.deltaH),
		})
	}

	if (candidates.length === 0) {
		return { clusters, foreground: resolvedForeground, accent: null, accentChromaOnly: false }
	}

	const front = paretoFront(candidates)
	let winner = front[0]!
	for (const candidate of front) {
		if (
			candidate.cluster.overlayMass > winner.cluster.overlayMass ||
			(candidate.cluster.overlayMass === winner.cluster.overlayMass &&
				candidate.cluster.representative < winner.cluster.representative)
		) winner = candidate
	}

	// The known-fragile case made visible rather than silent (arm-f-r3 §2.5): an accent that moves
	// only in chroma/hue, by less than the pair's own bar in lightness. Diagnostics, never a veto —
	// vetoing it would be the coefficient the front exists to avoid.
	const accentChromaOnly = winner.lightness < sameColorBar(
		paletteColorOfLab(winner.cluster.lab),
		paletteColorOfLab(winner.cluster.localField),
	)

	return { clusters, foreground: resolvedForeground, accent: winner.cluster, accentChromaOnly }
}

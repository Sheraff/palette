/**
 * P5 field-fit prototype — the overlay reading (W-MARKS).
 *
 * The fit is the segmentation: `fieldfit.ts` hands us a per-pixel Tukey weight `w(x)` and this
 * module reads what the fit *rejected*. Nothing here segments, thresholds an area, or looks at
 * shape. A pixel's contribution to the overlay is `1 − w(x)` and nothing else.
 *
 * Implements SPEC decisions 6 (bar-neighbourhood agglomeration), 7 (foreground), 8 (accent Pareto
 * front) and the foreground half of 10 (escape), **as amended by the round-1 rulings of
 * 2026-08-04**: comparisons on published representatives, the foreground ranked by minimum |raw
 * APCA| over the rendered ramp, and the accent's front winner ranked by distance from everything
 * already published. Design sources: `phase-1/proposals/arm-f-r3.md`
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
 *    Centres survive where the question is genuinely about the mark rather than the palette: the
 *    per-cluster deltas (`deltaL`, `deltaC`, `deltaH`) and hence Pareto-front membership, which ask
 *    how a mark departs from the field beneath it. Every gate and every ranking uses the
 *    representative.
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
import { minRawContrastOverRamp } from "../../../src/contract/ramp.ts"
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

type AccentCandidate = {
	cluster: OverlayCluster
	/** Lightness departure from the local field. Front membership only. */
	lightness: number
	/** Chromatic departure from the local field, √(ΔC² + ΔH²). Front membership only. */
	chromatic: number
	/**
	 * Minimum OKLab distance from this candidate's **published** colour to everything already
	 * published — the foreground and both field ends. The winner on the front maximizes it
	 * (decision 8's round-1 ruling); it plays no part in front membership.
	 */
	separation: number
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

	let foreground: OverlayCluster | null = null
	let bestLegibility = -1
	for (const cluster of feasible) {
		const raw = legibility.get(cluster)!
		if (raw < textFloor) continue
		if (foreground === null || raw > bestLegibility) {
			foreground = cluster
			bestLegibility = raw
			continue
		}
		if (raw !== bestLegibility) continue
		// `clusters` is in descending-mass, ascending-packed order and `feasible` preserves it, so the
		// incumbent already wins both tie-breaks. Nothing to do — stated so the omission reads as a
		// decision rather than a missing branch.
	}

	if (foreground === null) {
		// Nothing publishable and legible: SPEC decision 10's escape. The escape colour itself is
		// assembled by `candidate.ts`, which owns the inventory-absence check; all this module can
		// honestly say is that the overlay offers nothing.
		return { clusters, foreground: null, accent: null, accentChromaOnly: false }
	}

	// --- accent (SPEC decision 8, re-ranked by round-1 evidence) ----------------------------------
	const resolvedForeground = foreground
	const foregroundColor = published.get(resolvedForeground)!
	// Everything already published, which is what the accent has to be a *different colour from* and
	// what it is now ranked by its distance to.
	const alreadyPublished = [foregroundColor, ...publishedEnds] as const

	const candidates: AccentCandidate[] = []
	for (const cluster of feasible) {
		if (cluster === resolvedForeground) continue
		const color = published.get(cluster)!
		if (sameColor(color, foregroundColor)) continue
		// Distinctness from the ends was already established by `feasible`.
		candidates.push({
			cluster,
			// Front membership is unchanged and stays on the centres: it is a statement about how the
			// mark departs from the field beneath it, which is a selection question, not a published
			// pair. Only the distinctness tests and the winner's ranking moved to representatives.
			lightness: Math.abs(cluster.deltaL),
			chromatic: Math.hypot(cluster.deltaC, cluster.deltaH),
			separation: Math.min(
				...alreadyPublished.map((other) => colorDistance(color, other)),
			),
		})
	}

	if (candidates.length === 0) {
		return { clusters, foreground: resolvedForeground, accent: null, accentChromaOnly: false }
	}

	// Was: max overlay mass on the front. Round 1 graded items 3, 5 and 6 down for the same reason —
	// mass-heavy dull clusters won the front while the artwork's vivid colours lost — against the
	// reviewer's principle that *the palette must reflect the artwork*. Now the winner is the
	// candidate that is **furthest from everything already published**, measured as the minimum OKLab
	// distance to the foreground and both ends. One measured quantity, no exchange rates; mass and
	// the packed integer remain the tie-breaks.
	const front = paretoFront(candidates)
	let winner = front[0]!
	for (const candidate of front) {
		if (
			candidate.separation > winner.separation ||
			(candidate.separation === winner.separation &&
				(candidate.cluster.overlayMass > winner.cluster.overlayMass ||
					(candidate.cluster.overlayMass === winner.cluster.overlayMass &&
						candidate.cluster.representative < winner.cluster.representative)))
		) winner = candidate
	}

	// The known-fragile case made visible rather than silent (arm-f-r3 §2.5): an accent that moves
	// only in chroma/hue, by less than the pair's own bar in lightness. Diagnostics, never a veto —
	// vetoing it would be the coefficient the front exists to avoid.
	const accentChromaOnly = winner.lightness < sameColorBar(
		published.get(winner.cluster)!,
		paletteColorOfLab(winner.cluster.localField),
	)

	return { clusters, foreground: resolvedForeground, accent: winner.cluster, accentChromaOnly }
}

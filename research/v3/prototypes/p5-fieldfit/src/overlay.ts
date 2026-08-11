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
 *  - **foreground** candidates clear `FOREGROUND_MIN_RAW_APCA` over the published ramp and are ranked
 *    by overlay mass (decision 13, resolved by measurement);
 *  - **accent** candidates clear the contract's accent floor and decision 16's visibility floor, are
 *    distinct from both ends, sit outside the foreground's twin radius (decision 14, measured), and
 *    are ranked by overlay mass.
 *
 * **v0.8.1 — the pool is a union, not the overlay.** SPEC decision 18's ruling (a) restores arm-f
 * §2.4: a field-like component that won no field slot is a first-class candidate for both ink roles,
 * beside the overlay clusters, judged by the same floors against the same published colours. See the
 * "pool re-union" block below for the four choices that entails (published colour, salient mass, which
 * feasibility test is cluster-only, dedupe). Everything from here to there is unchanged; what changed
 * is what the rankings and the gates run over.
 *
 * **v0.8.0 — the two rankings no longer decide anything on their own.** SPEC decision 18 (round-3
 * ruling R5) restores arm-f §2.7's joint solve: this module shortlists the top
 * `ROLE_SHORTLIST_SIZE` candidates *per role under exactly the criteria above*, and `assignment.ts`
 * picks the pair, lexicographically — feasibility, then how many of the artwork's identity families
 * the four published roles cover, then these per-role rankings as tie-breaks. Every gate below is
 * unchanged and still hard; what changed is that the winner is chosen over pairs instead of one role
 * at a time, because round 3 measured that *per-role argmax cannot satisfy a set criterion*.
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
	okLabToRgb,
	rgbToOkLab,
	sameColor,
	sameColorBar,
} from "../../../src/contract/color.ts"
import { decompose } from "../../../src/contract/perception-model-spaces.ts"
import {
	ACCENT_FUNCTIONAL_DISTANCE,
	ACCENT_VISIBILITY_COLOR_DISTANCE,
	POOLED_SAME_COLOR_BAR,
} from "../../../src/contract/constants.ts"
import { firstInvisibleAccentOnRamp, minRawContrastOverRamp } from "../../../src/contract/ramp.ts"
import type {
	GradientStop,
	OkLab,
	PaletteColor,
	ResolvedContrastFloors,
} from "../../../src/contract/types.ts"
import {
	agglomerateBarNeighbourhoods,
	paletteColorOfLab,
	readIdentitySet,
	ROLE_SHORTLIST_SIZE,
	sameColorLab,
	solveAssignment,
} from "./assignment.ts"
import type { AssignmentTrace, BarNeighbourhood, RoleCandidate } from "./assignment.ts"
import { componentCentre } from "./components.ts"
import type { FieldComponent } from "./components.ts"
import { normalizedX, normalizedY, packRgb, unpackRgb } from "./decode.ts"
import { snapToArtwork } from "./snap.ts"
import type {
	DecodedRaster,
	FieldFit,
	Inventory,
	OverlayCluster,
	OverlayReading,
	TripleStats,
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
 * `paletteColorOfLab` and `sameColorLab` — choice 3 in the file header — moved to `assignment.ts` in
 * v0.8.0, along with decision 6's agglomeration itself, because the identity-family reading needs the
 * same three primitives over a different mass and one implementation is the only way the overlay and
 * the identity set can be guaranteed to partition colour space by the same rule. They are imported
 * back above; nothing about them changed.
 */

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

// Decision 6's agglomeration itself is `agglomerateBarNeighbourhoods` in `assignment.ts` (v0.8.0);
// what stays here is its *application* to the overlay — which points are offered to it (the triples
// the fit rejected, above the negligible-mass floor) and what a cluster means once it comes back.

// ---------------------------------------------------------------------------------------------
// Cluster construction
// ---------------------------------------------------------------------------------------------

function readCluster(cluster: BarNeighbourhood, fit: FieldFit): OverlayCluster {
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
// SPEC decision 18, ruling (a) — the pool re-union (arm-f §2.4)
// ---------------------------------------------------------------------------------------------
//
// v0.8.0 narrowed the ink pool to overlay clusters, and round 3's finding 3 is what that costs: an
// extensive **field-like component** that loses the two field slots carries no role and has no route
// into one. On `2376a6b67d` the red is such a component — support 0.138, overlay mass 34 against the
// black's 1424, and `sameColor` with its own local field — so it was infeasible as an ink candidate
// at every `K`, whatever the assignment did. arm-f §2.4 says the opposite in as many words: field-like
// components and mark colour groups are **unioned into a single candidate pool**, every colour group
// is in the pool for every role, no role has an eligibility gate, and a low score is a loss rather
// than an exclusion.
//
// So a component that won no field slot enters the pool beside the clusters. Four things have to be
// said about it, and each is a choice this file makes rather than a translation:
//
//  1. **Published colour** — the component's centre colour (`componentCentre`: its own fitted surface
//     at its own weighted centre), snapped **over its own support**, not over the whole inventory.
//     Decision 4's mass-maximizing snap, with the same `POOLED_SAME_COLOR_BAR` ball the field ends
//     use, run against an inventory restricted to the pixels the component claims. Snapping over the
//     whole artwork would let a component publish a colour that occurs only somewhere else in the
//     picture; the component is a region, and it should publish one of its own pixels.
//  2. **Salient mass** — its **field mass** `Σ w` over the support (decision 18(a), literally). A
//     component's rejected mass is near zero by construction, which is precisely why v0.8.0's ranking
//     could not see it; field mass is the same quantity the identity set already sums when it adds
//     rejected and field mass back together, in the same pixel units as a cluster's `Σ(1 − w)`.
//  3. **Feasibility against the PUBLISHED colours, never against its own local field.** Every floor a
//     cluster faces still binds — representative-distinctness from both published ends, decision 13's
//     legibility floor over the ramp, decision 16's visibility floor, `firstInvisibleAccentOnRamp`,
//     decision 14's twin exclusion. What does **not** apply is the cluster-only "distinct from the
//     field at its own mean position" test: a component *is* the field at its own mean position, so
//     that test rejects every component identically, and it is the exact comparison that made item 3's
//     red infeasible. It is a *mark-selection* test (it asks whether a mark departs from the ground it
//     sits on), not a publication test, and a component is not a mark.
//  4. **Dedupe — the component supersedes the cluster of its own family, and that direction was
//     measured.** A colour that is a field-like region also leaves a thin rim of rejected pixels at
//     its edges, so it is usually in the pool twice: once as a component and once as a low-mass
//     overlay cluster. arm-f §2.4's pool is a pool of *colour groups*, so the two are one entry, and
//     the entry has to be the component's, for three reasons that are all visible on `2376a6b67d`:
//
//     - **mass** — the component measures the whole region (field mass 11 694), the cluster measures
//       the rim the fit rejected (overlay mass 34). The first is the reading of "how much of this
//       artwork is this colour"; the second is a measurement of the region's antialiasing.
//     - **the published colour** — a cluster publishes its highest-*rejected*-mass triple, which on a
//       region's rim is an edge pixel; the component publishes the mass-maximizing snap over its own
//       support, which is the region's own dominant pixel.
//     - **feasibility** — the cluster is judged by the mark-selection test in choice 3, which it fails
//       identically, because the field beneath a region's rim *is* that region. Keeping the cluster
//       and dropping the component would leave the colour in the pool in the one form that cannot be
//       published — which is exactly v0.8.0's item-3 negative wearing a dedupe rule as a disguise, and
//       is the eligibility gate arm-f §2.4 forbids.
//
//     So: every overlay cluster whose published representative is `sameColor` with an admitted
//     component's published representative leaves the pool. `sameColor` is the contract's own
//     predicate, and two colours it calls the same could not both be published anyway (invariant 3),
//     so nothing publishable is lost. Between two components of the same family the more extensive one
//     (first in `FieldReading`'s order) keeps the entry. **Ink-vetoed components need no rule here**:
//     decision 15a keeps a vetoed component out of `FieldReading.components` entirely and its pixels
//     unclaimed, so it is already in the pool as overlay mass and is never offered to this function —
//     `candidate.ts` passes accepted components only.

/**
 * **Which roles a component candidate competes for.** `"both"` ships; `"accent"` is a measurement.
 *
 * Decision 18(a) is implemented as written — one pool, both ink roles, salient mass = field mass — and
 * `"both"` is what every published palette uses. The knob exists because the *scale* of that salient
 * mass is a finding the implementing pass owes upward rather than settles: a region's field mass runs
 * 5 000–25 000 where an ink cluster's rejected mass runs 10²–10³, so a component out-ranks every ink
 * on any mass tie-break it enters, and decision 13's foreground rule — whose stated principle is *the
 * artwork's own ink, provided it registers* — becomes "the largest unslotted region". That is measured,
 * not asserted: `reports/wp15.md` carries both columns, including the one silent STRONG that moves.
 *
 * `P5_COMPONENT_ROLES=accent` keeps components out of the foreground shortlist only. It is not a
 * proposal and not an eligibility gate in the shipped path; it is the second column of a table, in the
 * same spirit and with the same standing as `P5_IDENTITY_BAR_MULTIPLE` (v0.8.0).
 */
export const COMPONENT_ROLES: "both" | "accent" = (() => {
	const raw = process.env.P5_COMPONENT_ROLES
	if (raw === undefined || raw.trim() === "" || raw === "both") return "both"
	if (raw === "accent") return "accent"
	throw new RangeError(`P5_COMPONENT_ROLES must be "both" or "accent", got ${JSON.stringify(raw)}`)
})()

/** What one field-like component offered to the pool did, for the sidecar. Decides nothing. */
export type ComponentCandidateReport = Readonly<{
	/** Recursion depth that produced the component — its identity in `diagnose.ts`'s `attempts` table. */
	depth: number
	supportFraction: number
	/** Field mass `Σ w` over the support: the salient mass this candidate competes on. */
	supportMass: number
	/** The component's own centre colour, pre-snap. */
	centre: string
	/** Published: the centre snapped over the component's own support (mass-maximizing, decision 4). */
	published: string
	/** False ⇒ a more extensive component of the same family already holds the entry. */
	admitted: boolean
	/** That component's published colour, when this one deduped against it. */
	duplicateOf: string | null
	/** Overlay clusters this component superseded: their published representatives, and their mass. */
	supersedes: readonly Readonly<{ hex: string; overlayMass: number }>[]
	/** Cleared representative-distinctness from both published ends. `null` when not admitted. */
	feasible: boolean | null
	/** `min|raw APCA|` over the published ramp — decision 13's gate. `null` when not admitted. */
	legibility: number | null
}>

/**
 * The component's claim as an `Inventory`, for the snap and for nothing else.
 *
 * Counts and moments are re-accumulated over the claim rather than copied from the whole-image
 * inventory, so `count` means "pixels of this colour **inside this component**" — which is the mass
 * decision 4's snap maximizes, and the only reason this object exists.
 */
function supportInventory(
	component: FieldComponent,
	raster: DecodedRaster,
	inventory: Inventory,
): Inventory {
	const { width, height, packed } = raster
	const triples = new Map<number, { packed: number; count: number; sumX: number; sumY: number }>()
	let totalPixels = 0
	for (let row = 0; row < height; row += 1) {
		const y = normalizedY(row, height)
		const rowOffset = row * width
		for (let column = 0; column < width; column += 1) {
			const index = rowOffset + column
			if (component.claim[index] !== 1) continue
			const key = packed[index]!
			let entry = triples.get(key)
			if (entry === undefined) {
				entry = { packed: key, count: 0, sumX: 0, sumY: 0 }
				triples.set(key, entry)
			}
			entry.count += 1
			entry.sumX += normalizedX(column, width)
			entry.sumY += y
			totalPixels += 1
		}
	}

	const stats = new Map<number, TripleStats>()
	for (const entry of triples.values()) {
		const rgb = unpackRgb(entry.packed)
		// The whole-image inventory is authoritative for a triple's OKLab, exactly as in
		// `accumulateOverlayMass`; the fallback cannot disagree, both derive it from the same triple.
		const whole = inventory.triples.get(entry.packed)
		stats.set(entry.packed, {
			packed: entry.packed,
			rgb,
			lab: whole === undefined ? rgbToOkLab(rgb) : whole.lab,
			count: entry.count,
			sumX: entry.sumX,
			sumY: entry.sumY,
		})
	}

	return { triples: stats, has: (key: number) => stats.has(key), totalPixels }
}

/**
 * One component as a pool entry, in the `OverlayCluster` shape everything downstream already reads.
 *
 * Two fields carry a different quantity for a component than for a cluster, and the names are
 * `src/types.ts`'s, which is the orchestrator's file — the rename is proposed in
 * `reports/wp15-types.md` and stated here in the meantime:
 *
 *  - `overlayMass` holds the component's **field mass**, decision 18(a)'s salient mass for this side
 *    of the union. It is `Σ w` where a cluster's is `Σ(1 − w)`: the same pixel-weight units, the
 *    complementary half of the same fit.
 *  - `localField` holds the **published background** rather than the fit's field at the component's
 *    own mean position, which would be the component's own surface and would make every delta zero.
 *    The deltas exist to describe how a colour departs from the field it will be *seen against*, and
 *    for a candidate that is about to be published as an ink role that field is the published one.
 *    They are description only (`accentChromaOnly`); nothing selects on them.
 */
function componentPoolEntry(
	component: FieldComponent,
	centre: OkLab,
	representative: number,
	supportTriples: number,
	backgroundLab: OkLab,
): OverlayCluster {
	const delta = decompose(backgroundLab, centre)
	return {
		representative,
		lab: centre,
		overlayMass: component.supportMass,
		meanX: component.meanX,
		meanY: component.meanY,
		localField: backgroundLab,
		deltaL: delta.deltaLightness,
		deltaC: delta.deltaChroma,
		deltaH: delta.deltaHue,
		memberCount: supportTriples,
	}
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/**
 * What `readOverlay` returns: the `OverlayReading` of `src/types.ts`, plus decision 18's trace.
 *
 * The trace is an intersection declared here rather than a field added to `OverlayReading`, because
 * `src/types.ts` is the orchestrator's file. The move is proposed in `reports/wp14-types.md`; until it
 * is ratified this shape is structurally an `OverlayReading` everywhere one is expected, and
 * `candidate.ts` carries the trace on `Analysis` exactly as v0.7.1 carried `PathExcursionReport`.
 */
export type OverlayReadingWithAssignment = OverlayReading & {
	/** `null` when no assignment was solved: no overlay at all, or no admissible foreground. */
	readonly assignment: AssignmentTrace | null
	/**
	 * Decision 18(a)'s union, from the component side: one row per field-like component offered to the
	 * pool, admitted or deduped. Empty on every cover the global fit explained (no components exist)
	 * and on the retreat (none was accepted). `clusters` above stays what it has always been — the
	 * agglomerated *overlay* colours — so the two halves of the union are readable apart.
	 */
	readonly componentCandidates: readonly ComponentCandidateReport[]
}

/**
 * Read the overlay: cluster what the fit rejected, then solve for foreground and accent jointly.
 *
 * `publishedRamp` carries the field as the contract will see it — its ends are `roles.background` and
 * `roles.surface`. It is an argument rather than something derived here because SPEC decisions 8 and
 * 16 require the accent to be distinct from and visible against **both** ends, and this module does
 * not read the ramp. For a collapsed (order-0 / flat) field the two ends are the same colour.
 *
 * Determinism: every ordering in this function, and every tie-break in `assignment.ts`, ends at the
 * packed 24-bit integer, which is unique per triple, so there is no tie left for iteration order to
 * decide.
 */
export function readOverlay(
	fit: FieldFit,
	raster: DecodedRaster,
	inventory: Inventory,
	contrast: ResolvedContrastFloors,
	publishedRamp: readonly GradientStop[],
	/**
	 * SPEC decision 18(a): the field-like components that won **no** field slot. `candidate.ts` owns
	 * which those are — the field reading assigns the slots — and passes accepted components only, so
	 * an ink-vetoed component never appears here (it is already in the pool as overlay mass). Empty on
	 * every cover the global fit explained, which is why those covers cannot move in v0.8.1.
	 */
	unslottedComponents: readonly FieldComponent[] = [],
): OverlayReadingWithAssignment {
	if (publishedRamp.length < 2) {
		throw new RangeError(`readOverlay needs at least two published stops, got ${publishedRamp.length}`)
	}
	const { triples, totalMass } = accumulateOverlayMass(fit, raster, inventory)

	if (totalMass <= 0 && unslottedComponents.length === 0) {
		// The fit rejected nothing **and** no component was offered. There is nothing in the pool, so
		// there is no foreground: the escape path (SPEC decision 10) is the caller's, not ours.
		//
		// v0.8.1 added the second conjunct, and it is arm-f §2.4 again rather than a tidy-up: "the fit
		// rejected nothing" was a proof that the pool was empty only while the pool *was* the overlay.
		// A cover whose components explain every pixel has an empty overlay and a non-empty pool, and
		// returning here would be an eligibility gate wearing an early return. With `totalMass` at 0 the
		// mass floor is 0, no triple carries rejected mass, and `clusters` below is simply empty.
		return {
			clusters: [],
			foreground: null,
			accent: null,
			accentChromaOnly: false,
			assignment: null,
			componentCandidates: [],
		}
	}

	const massFloor = totalMass * NEGLIGIBLE_OVERLAY_MASS_FRACTION
	const meaningful: TripleOverlay[] = []
	for (const triple of triples.values()) {
		if (triple.mass >= massFloor) meaningful.push(triple)
	}

	const clusters = agglomerateBarNeighbourhoods(meaningful)
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

	// --- decision 18(a): the union ------------------------------------------------------------------
	//
	// Built before the feasibility filter, because a component candidate is a first-class member of the
	// pool the filter runs over — that is what "unioned into a single candidate pool" means. The dedupe
	// is the only place a component is compared against a cluster rather than against a published
	// colour, and it is a *no-double-entry* rule, never an eligibility gate: it drops the colour's
	// second copy, not the colour.
	const backgroundLab = rgbToOkLab(publishedEnds[0].rgb)
	const componentSourced = new Set<OverlayCluster>()
	const componentEntries: OverlayCluster[] = []
	const componentReports: {
		row: ComponentCandidateReport
		cluster: OverlayCluster | null
	}[] = []
	const superseded = new Set<OverlayCluster>()
	for (const component of unslottedComponents) {
		const centre = componentCentre(component)
		const support = supportInventory(component, raster, inventory)
		if (support.totalPixels === 0) continue // a claim with no pixels cannot publish one
		const snapped = snapToArtwork(centre, support, POOLED_SAME_COLOR_BAR)
		const color = colorFromRgb(snapped.rgb)
		const representative = packRgb(snapped.rgb)

		// Component-versus-component first: the more extensive one is already in `componentEntries`.
		const twin = componentEntries.find((entry) =>
			sameColor(colorFromRgb(unpackRgb(entry.representative)), color)
		)
		if (twin !== undefined) {
			componentReports.push({
				row: {
					depth: component.depth,
					supportFraction: component.supportFraction,
					supportMass: component.supportMass,
					centre: colorFromRgb(okLabToRgb(centre)).hex,
					published: color.hex,
					admitted: false,
					duplicateOf: colorFromRgb(unpackRgb(twin.representative)).hex,
					supersedes: [],
					feasible: null,
					legibility: null,
				},
				cluster: null,
			})
			continue
		}

		// Component-versus-cluster: the component takes the entry, the clusters of its family leave.
		const displaced = clusters.filter((cluster) =>
			!superseded.has(cluster) &&
			sameColor(colorFromRgb(unpackRgb(cluster.representative)), color)
		)
		for (const cluster of displaced) superseded.add(cluster)

		const entry = componentPoolEntry(
			component,
			centre,
			representative,
			support.triples.size,
			backgroundLab,
		)
		componentEntries.push(entry)
		componentSourced.add(entry)
		componentReports.push({
			row: {
				depth: component.depth,
				supportFraction: component.supportFraction,
				supportMass: component.supportMass,
				centre: colorFromRgb(okLabToRgb(centre)).hex,
				published: color.hex,
				admitted: true,
				duplicateOf: null,
				supersedes: displaced.map((cluster) => ({
					hex: colorFromRgb(unpackRgb(cluster.representative)).hex,
					overlayMass: cluster.overlayMass,
				})),
				feasible: null,
				legibility: null,
			},
			cluster: entry,
		})
	}

	// One pool, one order. Mass descending then packed integer ascending, exactly as `clusters` was
	// ordered on its own, so a cover with no component candidates enumerates in v0.8.0's order.
	const pool = [...clusters.filter((cluster) => !superseded.has(cluster)), ...componentEntries]
		.sort((first, second) =>
			second.overlayMass - first.overlayMass ||
			first.representative - second.representative
		)

	const published = new Map<OverlayCluster, PaletteColor>(
		pool.map((cluster) => [cluster, colorFromRgb(unpackRgb(cluster.representative))]),
	)

	/**
	 * Feasible = publishable. Decision 7's round-1 ruling: every distinctness comparison runs on the
	 * **representative**, because that is the colour that goes in the palette and the colour the
	 * contract judges. Round 1 caught the cost of not doing this — `#000000` and `#000009` published
	 * as foreground and accent on `2376a6b67d`, two clusters whose *centres* were a bar apart.
	 */
	const feasible = pool.filter((cluster) => {
		const color = published.get(cluster)!
		// Distinct from the field *at its own mean position* — the whole point of a fitted field is
		// that "the background" is a different colour in different places. Measured on the
		// representative too, per the ruling's "ALL comparisons".
		//
		// **Cluster-only** (decision 18(a)): this is the mark-selection test — does this mark depart
		// from the ground it sits on — and a component *is* the ground at its own mean position, so
		// applying it to a component rejects every component identically. That is the comparison that
		// made item 3's red infeasible at every K. A component's distinctness is judged against the
		// published colours below, like everything the contract judges.
		if (!componentSourced.has(cluster) && sameColorLab(rgbToOkLab(color.rgb), cluster.localField)) {
			return false
		}
		return !publishedEnds.some((end) => sameColor(color, end))
	})
	const feasibleSet = new Set(feasible)

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

	// The two per-candidate quantities the component rows quote, now that both are measured. Filled
	// after the fact and read by nothing: this is the sidecar's copy, not a second source of truth.
	const componentCandidates: ComponentCandidateReport[] = componentReports.map(({ row, cluster }) =>
		cluster === null ? row : {
			...row,
			feasible: feasibleSet.has(cluster),
			legibility: legibility.get(cluster) ?? null,
		}
	)

	// The floor is the larger of the caller's request and the prototype's evidence-bracketed one, so
	// raising `minTextContrast` tightens the gate and nothing can loosen it below the bracket.
	const foregroundFloor = Math.max(textFloor, FOREGROUND_MIN_RAW_APCA)
	const admissible = feasible.filter((cluster) =>
		legibility.get(cluster)! >= foregroundFloor &&
		// Measurement only; `"both"` ships. See `COMPONENT_ROLES`.
		(COMPONENT_ROLES === "both" || !componentSourced.has(cluster))
	)

	if (admissible.length === 0) {
		// Nothing publishable and legible: SPEC decision 10's escape. The escape colour itself is
		// assembled by `candidate.ts`, which owns the inventory-absence check; all this module can
		// honestly say is that the overlay offers nothing.
		return {
			clusters,
			foreground: null,
			accent: null,
			accentChromaOnly: false,
			assignment: null,
			componentCandidates,
		}
	}

	// One `RoleCandidate` per cluster, memoized, so identity is stable across every shortlist below and
	// `assignment.ts` can key its per-candidate coverage on it.
	const candidates = new Map<OverlayCluster, RoleCandidate>()
	const candidateOf = (cluster: OverlayCluster): RoleCandidate => {
		let candidate = candidates.get(cluster)
		if (candidate === undefined) {
			const color = published.get(cluster)!
			candidate = {
				cluster,
				color,
				lab: rgbToOkLab(color.rgb),
				// Salient mass. `overlayMass` holds `Σ(1 − w)` for a cluster and the component's field
				// mass `Σ w` for a component entry — decision 18(a)'s two definitions, one field.
				mass: cluster.overlayMass,
				legibility: legibility.get(cluster) ?? 0,
				source: componentSourced.has(cluster) ? "component" : "overlay",
			}
			candidates.set(cluster, candidate)
		}
		return candidate
	}

	// `admissible` preserves the **pool's** descending-mass, ascending-packed order, so its first element
	// *is* argmax salient mass with the packed int as tie-break (SPEC decision 13; 15b measured and
	// refused above) — which is what v0.7.1 published on any cover with no component candidates.
	// **v0.8.0 keeps that order and takes the top K**, because decision 18 needs the *shortlist*, not
	// the argmax; v0.8.1 widens what the order runs over, not the order.
	const foregroundShortlist: RoleCandidate[] = admissible
		.slice(0, ROLE_SHORTLIST_SIZE)
		.map(candidateOf)

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
	//
	// **v0.8.0 splits this loop in two, and the split is the whole of decision 18's mechanics here.**
	// The gates below are *accent-only* — each asks about the candidate against the field and the ramp,
	// and its answer does not depend on which foreground is published — so each is memoized once per
	// cluster in `accentGated`. Decision 14's twin exclusion is the one gate that *is* pairwise, so the
	// shortlist is taken **per foreground, after** it: see `AssignmentInput.accentFor` for the five
	// covers that measured why shortlisting before a pairwise constraint is not a shortlist at all.
	const accentFloor = contrast.minAccentContrast.effectiveRawMagnitude

	const accentGate = new Map<OverlayCluster, boolean>()
	function accentGated(cluster: OverlayCluster): boolean {
		let verdict = accentGate.get(cluster)
		if (verdict !== undefined) return verdict
		const color = published.get(cluster)!
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
		verdict =
			!publishedEnds.some((end) => colorDistance(color, end) < ACCENT_VISIBILITY_COLOR_DISTANCE) &&
			// Invisible anywhere on the ramp ⇒ not an accent. `null` means no such point exists. Same
			// selection-density budget as the foreground's ranking, and for the same reason: at the
			// contract's default 2048/4096 this call alone took the demo-20 run from 0.8 s to 6.8 s.
			firstInvisibleAccentOnRamp(
					color,
					publishedRamp,
					accentFloor,
					ACCENT_FUNCTIONAL_DISTANCE,
					SELECTION_RAMP_SAMPLES_PER_SEGMENT,
					SELECTION_RAMP_REFINEMENT_SAMPLES,
				) === null
		accentGate.set(cluster, verdict)
		return verdict
	}

	// SPEC decision 14: a candidate inside `ACCENT_FG_EXCLUSION_MULTIPLE` bars of the foreground is the
	// foreground's family, however the formula scores it, because a reviewer twice called such pairs
	// indistinguishable. The radius is never below one bar, so this subsumes `sameColor` on the
	// published pair as well.
	const twinExcluded = (candidate: RoleCandidate, fg: RoleCandidate): boolean =>
		colorDistance(candidate.color, fg.color) <
			ACCENT_FG_EXCLUSION_MULTIPLE * sameColorBar(candidate.color, fg.color)

	/**
	 * The top-K accent candidates that are feasible **with this foreground**.
	 *
	 * `feasible` preserves the pool's descending-mass, ascending-packed order, so the first K survivors
	 * *are* the top K by mass with the packed int as tie-break (decision 8's ranking, unchanged), and
	 * for the top foreground the *first* survivor is exactly what v0.7.1 published. The cheap pairwise
	 * checks run before the memoized gate, so `firstInvisibleAccentOnRamp` — the expensive call — is
	 * made at most once per cluster and never for the tail beyond the last shortlist's Kth survivor.
	 */
	const accentFor = (fg: RoleCandidate): readonly RoleCandidate[] => {
		const shortlist: RoleCandidate[] = []
		for (const cluster of feasible) {
			if (shortlist.length >= ROLE_SHORTLIST_SIZE) break
			if (cluster === fg.cluster) continue
			if (twinExcluded(candidateOf(cluster), fg)) continue
			if (!accentGated(cluster)) continue
			shortlist.push(candidateOf(cluster))
		}
		return shortlist
	}

	// --- the joint solve (SPEC decision 18, round-3 ruling R5) --------------------------------------
	//
	// The shortlists above are exactly the top-K of the two rankings v0.7.1 took an argmax of.
	// `assignment.ts` does the rest: identity families off the inventory, the pairwise constraints,
	// coverage, then those same rankings as tie-breaks. The field roles are inputs — see that module's
	// header for why the surface is not a free variable — so the enumeration is K × (K + 1) at most.
	const identity = readIdentitySet(inventory)
	const trace = solveAssignment({
		foreground: foregroundShortlist,
		accentFor,
		identity,
		fieldLabs: publishedEnds.map((end) => rgbToOkLab(end.rgb)),
		twinExcluded,
	})

	// A foreground always exists here (`admissible` is non-empty and the collapse option is always
	// feasible), so `chosen` is non-null; the guard is a type narrowing, not a case.
	const chosen = trace.chosen
	if (chosen === null) {
		return {
			clusters,
			foreground: null,
			accent: null,
			accentChromaOnly: false,
			assignment: trace,
			componentCandidates,
		}
	}
	const resolvedForeground = chosen.foreground.cluster
	const winner = chosen.accent?.cluster ?? null

	if (winner === null) {
		// Nothing both legible and distinct: decision 8's terminal clause. `candidate.ts` turns this
		// into the declared collapse onto the foreground.
		return {
			clusters,
			foreground: resolvedForeground,
			accent: null,
			accentChromaOnly: false,
			assignment: trace,
			componentCandidates,
		}
	}

	// The known-fragile case made visible rather than silent (arm-f-r3 §2.5): an accent that moves
	// only in chroma/hue, by less than the pair's own bar in lightness. Diagnostics, never a veto.
	const accentChromaOnly = Math.abs(winner.deltaL) < sameColorBar(
		published.get(winner)!,
		paletteColorOfLab(winner.localField),
	)

	return {
		clusters,
		foreground: resolvedForeground,
		accent: winner,
		accentChromaOnly,
		assignment: trace,
		componentCandidates,
	}
}

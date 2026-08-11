/**
 * P5 field-fit prototype — the joint four-role assignment (SPEC decision 18, round-3 ruling R5).
 *
 * ## What this module is for
 *
 * Until v0.7.1 the four roles were assigned **serially**: the field reading fixed background and
 * surface, then `overlay.ts` took the argmax-mass legible cluster as foreground, then it took the
 * argmax-mass cluster that survived the accent gates *given that foreground*. arm-f §2.7 never asked
 * for that — it asks to "take the top few candidates per role by role-fit score and solve the small
 * four-role assignment exhaustively, so no ordering artefact enters" — and round 3 measured the cost
 * of the serialization directly (ROUND.md finding 3):
 *
 * > *Identity coverage is a set problem: item 3's four-colour set rotated (v0.3 red/no-white, v0.6
 * > white/no-red, both wasting a role on a near-black fg-twin); two other arms independently named
 * > the same set on the same cover. **Per-role argmax cannot satisfy a set criterion.***
 *
 * So the criterion that decides between assignments is a **set** property — how many of the
 * artwork's identity colours the four published roles between them reach — and it enters
 * **lexicographically**, above the per-role preferences and below hard feasibility. Never as a
 * weighted term beside them: decision 12 excludes hand-weighted multi-term scores by name (that is
 * P6's failure shape), and decision 18 repeats the exclusion.
 *
 * ## The three levels, in order
 *
 * 1. **Feasibility.** Every existing gate still binds, unchanged and unweakened: the foreground's
 *    representative-distinctness and its legibility floor, the accent's representative-distinctness,
 *    its visibility floor against both field colours, its ramp-visibility, and the pairwise twin
 *    exclusion against whichever foreground it is being paired with. An infeasible assignment is not
 *    ranked; it does not exist. Feasibility is never traded for coverage — that is what "lexicographic"
 *    means here and it is what `tests/assignment.test.ts` pins.
 * 2. **Coverage.** The number of **distinct identity families** the four published roles cover.
 * 3. **The per-role criteria, in their current order**, as tie-breaks: the foreground's **class**
 *    (v0.8.2, below), then its mass (decision 13), then its legibility, then the accent's mass
 *    (decision 8's third ruling), then the packed integers. Every comparison ends at a packed 24-bit
 *    value, which is unique per triple, so the order is total and the answer is deterministic.
 *
 * ## The foreground classes, v0.8.2 (decision 18's ruling of 2026-08-05, "scale mixing")
 *
 * v0.8.1's union put two masses in one column. A component's field mass runs 10³–10⁴ and an ink
 * cluster's rejected mass runs 10²–10³, so on a mass tie-break *every* unslotted region beats *every*
 * ink and decision 13's "the artwork's own ink, provided it registers" quietly became "the largest
 * unslotted region" — measured on `908479200b`, where the reviewer's STRONG gold foreground fell to a
 * near-black region (`reports/wp15.md` §2). The ruling is not a rescaling (there is no exchange rate
 * between the two masses and inventing one is decision 12's forbidden shape); it is an **ordering**:
 *
 *  - **class A** — overlay clusters, plus any component the ink instrument calls ink-shaped;
 *  - **class B** — ground-shaped unslotted components, classified by wp12's *component-level*
 *    instrument (erosion mortality high AND ground adjacency low ⇒ ink; grounds tile, ink floats).
 *
 * Class A outranks class B in the **foreground** ordering, above mass. It is an ordering and not an
 * exclusion, exactly as arm-f §2.4 requires: when no class-A candidate clears the foreground floors
 * the shortlist is class B alone and a component takes the foreground — which is the right answer on a
 * cover whose only ink is the region (round-3 item 6's retreat shape).
 *
 * **The accent ordering is untouched**: the full union, by mass, per decision 8's third ruling. The
 * scale finding is a foreground finding — an accent is *a* colour of the artwork rather than its ink,
 * and mass is the mechanism's own reading of salient presence for it.
 *
 * Where the class term sits relative to **coverage** is stated rather than assumed: the ruling
 * redefines *the foreground ordering*, and decision 18 puts coverage above the per-role orderings, so
 * class enters at the head of the per-role tie-breaks and coverage still outranks it. Whether that
 * ordering is ever load-bearing is a measurement, not an argument, so `AssignmentTrace` publishes
 * `classOverriddenByCoverage` — true exactly when the chosen foreground is class B while a feasible
 * class-A foreground existed. If a cover ever reports it, the placement is the orchestrator's to rule
 * on; nothing here decides it quietly.
 *
 * ## What an "identity family" is, measurably
 *
 * A **bar-neighbourhood family of the artwork's own colours, ranked by salient mass**, of which the
 * top `IDENTITY_FAMILY_COUNT` are "the artwork's identity set".
 *
 * Decision 18 defines salient mass as *overlay mass for marks plus field mass for field colours*.
 * Written out, for one exact triple, that is `Σ(1 − w) + Σ w` over the triple's pixels — which is
 * **exactly the triple's pixel count**. This is stated rather than hidden because it is the whole
 * content of the definition: adding the two masses back together deliberately un-does the fit's
 * figure/ground split, and it has to, because an identity colour is an identity colour whether the fit
 * called it field or mark. The yellow ground and the red logo of `2376a6b67d` are both "colours this
 * artwork is made of". So the identity set is read **off the inventory alone** — it does not depend on
 * the fit, on the weights, or on any role that has been chosen — which is also why it can be computed
 * once and reused for every assignment in the enumeration.
 *
 * A role **covers** a family when its published colour sits inside that family's bar-neighbourhood:
 * `okLabDistance(role, family.centre) < sameColorBar(role, family.centre)`, the same predicate
 * agglomeration itself uses for membership. Not "is a member triple of the family" — a family's centre
 * moves as it accumulates mass, and a role published from one artwork can legitimately sit a hair
 * outside the member list while being unmistakably that colour.
 *
 * ## One pool, v0.8.1 (decision 18's ruling (a), arm-f §2.4)
 *
 * v0.8.0 implemented the solve correctly and measured it insufficient for round-3 finding 3, for a
 * reason that was upstream of the solve: the *pool* was narrow. `overlay.ts` offered only overlay
 * clusters, so an extensive **field-like component** that lost the two field slots had no route into
 * any role — on `2376a6b67d` the red is a component (support 0.138), its overlay mass is 34 against
 * black's 1424, and it is `sameColor` with its own local field, so it was infeasible as an ink
 * candidate at every `K`. arm-f §2.4 never allowed that shape: *"field-like components and mark
 * colour groups are unioned into a single candidate pool… every colour group in the image is in the
 * pool for every role. No role has an eligibility gate… a low score is a loss, never an exclusion."*
 *
 * So the pool is now the union, and `RoleCandidate.source` records which side of it a candidate came
 * from. Nothing in the ordering below reads `source` — that is the point of a union — and the two
 * things that *are* source-dependent live at the pool's construction site in `overlay.ts`: what a
 * candidate's published colour is (a cluster's representative; a component's centre snapped over its
 * own support) and what its salient mass is (rejected mass; field mass). Feasibility is measured
 * against the **published** colours for both, which is the specific self-comparison that made item
 * 3's red infeasible.
 *
 * ## What is *not* searched over, and why
 *
 * Background and surface are **fixed inputs** here. They come from the field reading, which is
 * decisions 2/5/9/12's territory, and on the one path where two readings compete for the surface slot
 * — the two-component reading of `E2_BRIEF.md` — `candidate.ts`'s header records a standing ruling
 * that *a component that is a ramp publishes its ramp*, so the far end and the second component never
 * both stand as live options at the same time. Re-opening that would be a change to the field reading,
 * not to the assignment, and decision 18 is sequenced after decisions 15–17 precisely so it does not
 * reach back into them. The search space is therefore `foreground × (accent ∪ {collapse})`, at most
 * `K × (K + 1)` assignments — 30 at the stated `K` — and the cost note in this pass's brief (stop and
 * report above ~10⁴) is satisfied by three orders of magnitude.
 */

import {
	colorFromRgb,
	okLabDistance,
	okLabToRgb,
	sameColorBar,
} from "../../../src/contract/color.ts"
import type { OkLab, PaletteColor } from "../../../src/contract/types.ts"
import type { Inventory, OverlayCluster } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/**
 * **K** — how many candidates per role enter the exhaustive solve.
 *
 * `[UNCALIBRATED]`, and stated as such: arm-f §2.7 says "the top few candidates per role" and names
 * no number, and no reviewer evidence bounds it. **5** is chosen so that the shortlist is strictly
 * wider than every serial rule it replaces (each of which took the top *one*) while the enumeration
 * stays trivially small.
 *
 * The failure mode a too-small K produces is specific and worth naming, because it is the one to look
 * for in a delta table: an assignment that the *old* serial rule would have reached — the sixth-heaviest
 * accent candidate, say, after five twin-exclusions — falls out of the shortlist and the palette moves
 * for a reason that has nothing to do with coverage. `AssignmentTrace.coverageDecided` is what tells
 * the two apart on a real cover: a delta with `coverageDecided: false` is a truncation artefact and a
 * reason to raise K, a delta with `coverageDecided: true` is decision 18 working.
 *
 * Overridable per-process by `P5_ASSIGNMENT_K` **for measurement only** — a K-sensitivity sweep is how
 * this number stops being uncalibrated, and re-running the pipeline is the only way to run one. The
 * default is what every published palette uses.
 */
export const ROLE_SHORTLIST_SIZE = readEnvInteger("P5_ASSIGNMENT_K", 5)

/**
 * **F** — how many families make up "the artwork's identity set".
 *
 * `[UNCALIBRATED]`, and equal to the **role count**: a palette has four slots, so the largest identity
 * set it could possibly cover has four members, and asking for coverage of more families than there
 * are roles to cover them with would add rows to the objective that no assignment can ever reach.
 * That is a reason, not a calibration — the reviewer evidence behind decision 18 is item 3's
 * *four*-colour set (yellow, red, black, white), which fixes the number at 4 on the one cover that
 * has a stated answer, and nothing else measures it.
 *
 * Overridable by `P5_IDENTITY_FAMILIES` for the same measurement-only reason as `K`.
 */
export const IDENTITY_FAMILY_COUNT = readEnvInteger("P5_IDENTITY_FAMILIES", 4)

function readEnvInteger(name: string, fallback: number): number {
	const raw = process.env[name]
	if (raw === undefined || raw.trim() === "") return fallback
	const parsed = Number(raw)
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new RangeError(`${name} must be a positive integer, got ${JSON.stringify(raw)}`)
	}
	return parsed
}

// ---------------------------------------------------------------------------------------------
// Shared bar-neighbourhood machinery
// ---------------------------------------------------------------------------------------------
//
// SPEC decision 6's agglomeration (arm-e-r3 §2.4) lives here rather than in `overlay.ts` because two
// readings now use it over two different mass definitions — the overlay's rejected mass, and the
// identity set's pixel mass — and one implementation is the only way the two can be guaranteed to
// partition colour space by the same rule. The *application* of it to the overlay, including which
// points are offered and why, stays documented at its call site in `overlay.ts`.

/**
 * A continuous OKLab value as a contract colour, for the contract functions that only accept one
 * (`sameColorBar`'s region lookup). Quantizing is safe there: the lookup is a four-way classification.
 */
export function paletteColorOfLab(lab: OkLab): PaletteColor {
	return colorFromRgb(okLabToRgb(lab))
}

/**
 * "Same colour" at this pair's regional bar, measured on the **unquantized** values.
 *
 * Equivalent to the contract's `sameColor(a, b)` except that the distance does not round-trip through
 * 8-bit sRGB: only the *radius* comes from `sameColorBar`, the measurement runs on the values we hold.
 * `overlay.ts`'s header, choice 3, is the full argument.
 */
export function sameColorLab(first: OkLab, second: OkLab, barMultiple = 1): boolean {
	return okLabDistance(first, second) <
		barMultiple * sameColorBar(paletteColorOfLab(first), paletteColorOfLab(second))
}

/**
 * **The identity families' merge radius, in bars.**
 *
 * `1` — decision 18 says *bar*-neighbourhood families and that is what ships. The parameter exists
 * because v0.8.0's own measurement says the bar is the wrong ruler for this particular question, and
 * the measurement should be re-runnable rather than re-argued: see `reports/wp14.md` §"the families
 * are not the artwork's identity set". In one sentence — the same-colour bar is far tighter than a
 * viewer, so one visual colour becomes many families (`2376a6b67d`'s single black: **70** families,
 * the largest at rank 5 and therefore outside a four-family identity set), and the four slots of the
 * identity set are routinely spent on four shades of one colour.
 *
 * That is not a new observation. SPEC decision 14 records it as measured fact at a different site
 * (`ACCENT_FG_EXCLUSION_MULTIPLE = 8`, "the same-colour bar is far tighter near black than a viewer
 * is", three reviewer-named pairs at ratios 1.8–6.6), and round-3 finding 7 is its third strike. So
 * the alternative worth measuring is *that* radius, and `P5_IDENTITY_BAR_MULTIPLE=8` measures it.
 *
 * **It is not adopted here.** Widening this radius is a change to the family definition decision 18
 * states, not a deviation inside it, and it is the orchestrator's to rule on with the table in the
 * report. The default is 1 and every published palette uses 1.
 */
export const IDENTITY_FAMILY_BAR_MULTIPLE = readEnvNumber("P5_IDENTITY_BAR_MULTIPLE", 1)

function readEnvNumber(name: string, fallback: number): number {
	const raw = process.env[name]
	if (raw === undefined || raw.trim() === "") return fallback
	const parsed = Number(raw)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new RangeError(`${name} must be a positive number, got ${JSON.stringify(raw)}`)
	}
	return parsed
}

/**
 * **The accent tie-break among coverage-tied, feasible candidates (v0.9.0's ruling).**
 *
 * Decision 8 has always ordered the accent by salient mass. v0.9.0 asked whether OKLab chroma should
 * lead it instead, because chroma is the one quantity W-M1 found separating the reviewer's named
 * NARCOSIS colour from the published one (crimson `.0949` against sky `.0424`), and because both
 * historical accent rejections on record are rejections of a *dull* colour that mass had ranked
 * first. The two rules were swept over all 31 covers and scored against every reviewer-graded accent
 * verdict before either was wired; `reports/wv9b.md` carries the agreement table.
 *
 * `"mass"` — decision 8 unchanged: `Σ` salient mass, then the packed integer.
 * `"chroma"` — `hypot(a, b)` of the published colour first, salient mass as the tie-break under it.
 *
 * **`"chroma"` is wired, and it is the measured winner rather than the preferred one.** The sweep ran
 * both rules over all 31 covers and scored them against every reviewer-graded accent verdict on
 * record; the agreement was not close (`reports/wv9b.md` §sweep):
 *
 *  - `2376a6b67d` — round-4 item 1, **STRONG in silence**, and the cover whose round-2 accent the
 *    reviewer rejected as a dark olive (*"doesn't feel like a part of this artwork"*) and whose
 *    round-3 accent he rejected as *"a 2nd shade of black… missing the strong red"*. Mass-first
 *    publishes `#26210b` here — a dark olive-black, the rejected class twice over, and a broken
 *    silent STRONG. Chroma-first keeps the reviewer's `#f81107` byte-identical.
 *  - `45baf46c90` — round-4 item 7, *"accent should probably be the red color that occupies the
 *    bottom half"*. Mass-first keeps the sky (45 730 against the crimson's 41 179). Chroma-first
 *    publishes the crimson `#8d2639` (C `.1376` against the sky's `.0424`).
 *  - `908479200b` and `fc8d58e0af` — the other two round-4 STRONGs, one of them the confirmation of
 *    the round-2 *named* green family after its obsidian accent was rejected: byte-identical under
 *    **both** rules, so neither is bought at their expense.
 *
 * So chroma-first satisfies every named ask and breaks no silent STRONG, and mass-first satisfies no
 * named ask and breaks one. There was no conflict to trade off and no third rule was invented.
 *
 * The term sits **only on the accent**, exactly where decision 8's mass term sat, and only below
 * coverage and below every foreground term: the foreground ordering is untouched by construction, so
 * a cover whose accent shortlist holds one candidate cannot move.
 *
 * Overridable by `P5_ACCENT_TIEBREAK` **for measurement only** — the sweep that ruled on it is
 * `measurements/v9b-accent-sweep.ts`, and re-running it is the only way this stops being a
 * remembered result. The default is what every published palette uses.
 */
export const ACCENT_TIEBREAK: "mass" | "chroma" = readEnvAccentTieBreak()

function readEnvAccentTieBreak(): "mass" | "chroma" {
	const raw = process.env["P5_ACCENT_TIEBREAK"]
	if (raw === undefined || raw.trim() === "") return "chroma"
	if (raw === "mass" || raw === "chroma") return raw
	throw new RangeError(`P5_ACCENT_TIEBREAK must be "mass" or "chroma", got ${JSON.stringify(raw)}`)
}

/** One point offered to agglomeration: an exact triple, its colour, its mass and its mass moments. */
export type MassPoint = Readonly<{
	packed: number
	lab: OkLab
	mass: number
	/** Σ mass·x over the point's pixels (normalized x). Divide by `mass` for the mean. */
	sumX: number
	sumY: number
}>

export type BarNeighbourhood = {
	mass: number
	/** Mass-weighted OKLab sums; the centre is these over `mass`. */
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

function recentre(cluster: BarNeighbourhood): void {
	cluster.centre = [
		cluster.sumL / cluster.mass,
		cluster.sumA / cluster.mass,
		cluster.sumB / cluster.mass,
	]
}

/**
 * Agglomerate mass points into bar-neighbourhoods (SPEC decision 6, arm-e-r3 §2.4).
 *
 * Descending mass, packed-int tie-break — a total, canonical order. Each point joins the nearest
 * existing cluster whose running centre is within the pair's regional bar, else opens a new one. The
 * property the design leans on: a sub-bar perturbation cannot change the partition, because anything a
 * dither splits apart is by definition closer than the merge radius and gets re-merged. That is the
 * dither answer, and `tests/overlay.test.ts` case 2 is its self-test.
 */
export function agglomerateBarNeighbourhoods(
	points: readonly MassPoint[],
	barMultiple = 1,
): BarNeighbourhood[] {
	const ordered = [...points].sort((first, second) =>
		second.mass - first.mass || first.packed - second.packed
	)

	const clusters: BarNeighbourhood[] = []
	for (const point of ordered) {
		let best: BarNeighbourhood | null = null
		let bestDistance = Number.POSITIVE_INFINITY
		for (const cluster of clusters) {
			const distance = okLabDistance(point.lab, cluster.centre)
			if (distance >= bestDistance) continue // ties keep the earlier (higher-mass) cluster
			const bar = barMultiple * sameColorBar(
				paletteColorOfLab(point.lab),
				paletteColorOfLab(cluster.centre),
			)
			if (distance >= bar) continue
			best = cluster
			bestDistance = distance
		}

		if (best === null) {
			clusters.push({
				mass: point.mass,
				sumL: point.lab[0] * point.mass,
				sumA: point.lab[1] * point.mass,
				sumB: point.lab[2] * point.mass,
				sumX: point.sumX,
				sumY: point.sumY,
				centre: point.lab,
				memberCount: 1,
				representative: point.packed,
				representativeMass: point.mass,
			})
			continue
		}

		best.mass += point.mass
		best.sumL += point.lab[0] * point.mass
		best.sumA += point.lab[1] * point.mass
		best.sumB += point.lab[2] * point.mass
		best.sumX += point.sumX
		best.sumY += point.sumY
		best.memberCount += 1
		if (
			point.mass > best.representativeMass ||
			(point.mass === best.representativeMass && point.packed < best.representative)
		) {
			best.representative = point.packed
			best.representativeMass = point.mass
		}
		recentre(best)
	}

	return clusters
}

// ---------------------------------------------------------------------------------------------
// The identity set
// ---------------------------------------------------------------------------------------------

/**
 * Fraction of the image's pixels below which an exact triple is dropped before the identity
 * agglomeration.
 *
 * `[UNCALIBRATED]`, and it is a **cost bound and nothing else** — the same role, the same value and
 * the same scale-free spelling as `overlay.ts`'s `NEGLIGIBLE_OVERLAY_MASS_FRACTION`, stated here
 * separately because it applies to a different mass. A photographic cover carries tens of thousands
 * of exact triples and agglomeration is O(points × clusters).
 *
 * It cannot change the identity set by dropping a *family*, only by thinning one: the survivors of a
 * family whose total is large are themselves large, because a family that holds a percent of the image
 * across triples that each hold one ten-thousandth of it would need ten thousand distinct triples
 * inside one bar. It **can** shave a family's measured mass, which is why the trace publishes the
 * retained fraction (`massRetained`) — if that ever drops far below 1 the number to look at is this
 * one.
 */
export const IDENTITY_MASS_FLOOR_FRACTION = 1e-4

/** One family of the artwork's own colours: what it is, how much of the artwork it is. */
export type IdentityFamily = Readonly<{
	/** 1-based position in the descending-mass ranking. Stable, and what the trace quotes. */
	rank: number
	/** Highest-mass member triple, packed — the colour this family would publish as. */
	representative: number
	/** Mass-weighted OKLab centre; the bar-neighbourhood is centred here. */
	centre: OkLab
	/** Salient mass = overlay mass + field mass = pixel count (see the header). */
	mass: number
	/** `mass / totalPixels`. */
	massFraction: number
	memberCount: number
}>

export type IdentitySet = Readonly<{
	/** The top `IDENTITY_FAMILY_COUNT` families, descending by mass. */
	families: readonly IdentityFamily[]
	/** How many families the whole artwork agglomerated into — the identity set is a slice of this. */
	totalFamilies: number
	/** Mass held by the retained triples, over the image's pixel count. */
	massRetained: number
}>

/**
 * Read the artwork's identity set off the inventory (decision 18's family definition).
 *
 * Depends on the inventory and nothing else — not on the fit, not on the field reading, not on any
 * role. Two consequences, both wanted: it is computed once per image, and it is the *same* set no
 * matter which assignment is being scored, so coverage is a property of the assignment rather than a
 * moving target.
 */
export function readIdentitySet(
	inventory: Inventory,
	count: number = IDENTITY_FAMILY_COUNT,
): IdentitySet {
	const totalPixels = inventory.totalPixels
	const floor = totalPixels * IDENTITY_MASS_FLOOR_FRACTION
	const points: MassPoint[] = []
	let retained = 0
	for (const triple of inventory.triples.values()) {
		if (triple.count < floor) continue
		retained += triple.count
		points.push({
			packed: triple.packed,
			lab: triple.lab,
			mass: triple.count,
			sumX: triple.sumX,
			sumY: triple.sumY,
		})
	}

	const clusters = agglomerateBarNeighbourhoods(points, IDENTITY_FAMILY_BAR_MULTIPLE)
		.sort((first, second) =>
		second.mass - first.mass || first.representative - second.representative
	)

	const families: IdentityFamily[] = clusters.slice(0, count).map((cluster, index) => ({
		rank: index + 1,
		representative: cluster.representative,
		centre: cluster.centre,
		mass: cluster.mass,
		massFraction: totalPixels > 0 ? cluster.mass / totalPixels : 0,
		memberCount: cluster.memberCount,
	}))

	return {
		families,
		totalFamilies: clusters.length,
		massRetained: totalPixels > 0 ? retained / totalPixels : 0,
	}
}

/**
 * Does a published colour sit inside this family's bar-neighbourhood? (Decision 18's cover test.)
 *
 * The same radius the family was built with, necessarily: a role that would have *joined* this family
 * had it been offered to the agglomeration is a role that reaches it.
 */
export function familyCovers(family: IdentityFamily, lab: OkLab): boolean {
	return sameColorLab(lab, family.centre, IDENTITY_FAMILY_BAR_MULTIPLE)
}

/** The ranks of every family some colour in `labs` covers, ascending. */
export function coveredFamilies(
	identity: IdentitySet,
	labs: readonly OkLab[],
): number[] {
	const covered: number[] = []
	for (const family of identity.families) {
		if (labs.some((lab) => familyCovers(family, lab))) covered.push(family.rank)
	}
	return covered
}

// ---------------------------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------------------------

/**
 * One shortlisted candidate for one ink role, carrying every quantity the tie-breaks read, so the
 * comparator never has to go back to the cluster or re-measure anything.
 */
export type RoleCandidate = Readonly<{
	cluster: OverlayCluster
	/** The colour that would be published: the cluster's representative triple. */
	color: PaletteColor
	/** `color` in OKLab — what coverage is measured on. */
	lab: OkLab
	/** Decision 13's / decision 8's ranking quantity. Salient mass: see `source`. */
	mass: number
	/**
	 * `hypot(a, b)` of `lab` — OKLab chroma of the colour that would be published.
	 *
	 * Read by the accent tie-break when `ACCENT_TIEBREAK` is `"chroma"`, and by nothing else: not by
	 * any feasibility test, and not by the foreground ordering.
	 */
	chroma: number
	/** `min|raw APCA|` over the published ramp. Meaningful for the foreground; carried for both. */
	legibility: number
	/**
	 * Which half of decision 18(a)'s union this candidate came from — **reporting only**.
	 *
	 * `"overlay"`: an agglomerated bar-neighbourhood of what the fit rejected; published colour is the
	 * cluster's representative triple, salient mass is `Σ(1 − w)`.
	 * `"component"`: a field-like component that won no field slot; published colour is its centre
	 * snapped over its own support, salient mass is its field mass `Σ w`.
	 * `"mark"`: a mark or region of `marks.ts`'s spatial grouping (v0.9.0); published colour is its
	 * robust colour snapped over its own support, salient mass is its spatially-accumulated mass —
	 * `Σ(1 − w)` over a mark, `Σ w` over a region, the same two halves of the same fit. **Accent-side
	 * only**: `overlay.ts` never offers a mark entry to the foreground shortlist, so the foreground
	 * ordering is unchanged by construction rather than by measurement.
	 *
	 * Nothing in `compareLexicographic` or in any feasibility test reads this field: the ordering below
	 * reads `foregroundClass`, which is a *shape* verdict rather than a provenance label, and the two
	 * are deliberately not the same field. If a feasibility test ever reads either, the pool has
	 * stopped being a union and arm-f §2.4's "no role has an eligibility gate" has been quietly
	 * repealed.
	 */
	source: "overlay" | "component" | "mark"
	/**
	 * **Decision 18's foreground class (v0.8.2)**: `"A"` = ink-shaped or overlay-sourced, `"B"` =
	 * ground-shaped component. The header's class block is the rationale; `overlay.ts` is where the
	 * verdict is measured (wp12's component-level mortality/adjacency instrument, on the component's
	 * own claim). Read by the **foreground** half of `comparePerRole` and by nothing else — not by any
	 * feasibility test, and not by the accent ordering.
	 */
	foregroundClass: "A" | "B"
}>

/** A complete, feasible assignment of the two ink roles, with its measured coverage. */
export type AssignmentOption = Readonly<{
	foreground: RoleCandidate
	/** `null` is decision 8's declared collapse onto the foreground — always feasible, never preferred. */
	accent: RoleCandidate | null
	/** Number of distinct identity families the four published roles cover between them. */
	coverage: number
	/** Which families, by rank. */
	covered: readonly number[]
}>

/** Everything the solve did, for the sidecar. Nothing here is read by anything that decides. */
export type AssignmentTrace = Readonly<{
	identity: IdentitySet
	shortlistSize: number
	familyCount: number
	/** Families the two field roles already cover — the coverage every assignment starts from. */
	fieldCovered: readonly number[]
	foregroundShortlist: readonly RoleCandidate[]
	/** The accent shortlist of the **chosen** foreground; the shortlist is per-foreground (see below). */
	accentShortlist: readonly RoleCandidate[]
	/** Pairs enumerated, and how many survived the pairwise constraints. */
	enumerated: number
	feasible: number
	chosen: AssignmentOption | null
	/**
	 * The winner under the **per-role criteria alone**, over the same feasible set — i.e. what the
	 * serialized v0.7.1 rule would have picked out of these shortlists. Reported, never published.
	 */
	perRoleOnly: AssignmentOption | null
	/** `chosen` and `perRoleOnly` differ: coverage, not the per-role preference, decided this palette. */
	coverageDecided: boolean
	/**
	 * **The one thing v0.8.2's class ordering cannot promise on its own** (see the header's class
	 * block): `true` when the published foreground is class B *although* a feasible assignment with a
	 * class-A foreground was enumerated — i.e. coverage, which outranks the class term, overrode it.
	 *
	 * Reported, never read. `false` on every cover means "class A always outranks class B when a
	 * class-A candidate clears the floors" is true as measured rather than true by construction, which
	 * is the honest form of that claim.
	 */
	classOverriddenByCoverage: boolean
}>

export type AssignmentInput = Readonly<{
	/** Top-K foreground candidates, already through every foreground-only gate, best first. */
	foreground: readonly RoleCandidate[]
	/**
	 * The top-K accent candidates **for a given foreground**: already through every accent-only gate
	 * *and* already pairwise-feasible with that foreground, best first.
	 *
	 * Per-foreground, not one shared list, and the reason is measured rather than aesthetic. A single
	 * top-K accent shortlist is truncated *before* the pairwise constraint is applied, so on a cover
	 * whose heaviest overlay clusters are all one colour family the whole shortlist is the foreground's
	 * own twins, twin exclusion empties it, and the accent collapses — an assignment that is feasible
	 * and that v0.7.1 published is simply not in the search space. That is not a coverage decision, it
	 * is truncation masquerading as one, and it hit **5 of 27 covers** at K = 5 (`eaed77a9cb`,
	 * `4130886c02`, `9021f65e`, `798808bf`, `00007e97`) before this shape replaced the shared list.
	 * Shortlisting after the constraint is what makes "enumerate the feasible assignments exhaustively"
	 * true of the feasible set rather than of an arbitrary prefix of it.
	 *
	 * Implementations are expected to memoize: the same candidate is offered to several foregrounds.
	 */
	accentFor: (foreground: RoleCandidate) => readonly RoleCandidate[]
	identity: IdentitySet
	/** The published field colours (background, surface) in OKLab. Fixed for the whole solve. */
	fieldLabs: readonly OkLab[]
	/**
	 * The one genuinely **pairwise** constraint: decision 14's twin exclusion. `true` ⇒ this accent is
	 * the foreground's family and the pair is infeasible. Injected rather than implemented here so the
	 * constant stays where its evidence is documented (`overlay.ts`).
	 *
	 * `accentFor` is expected to have applied it already; the solve re-asserts it anyway, so that the
	 * feasibility level is stated once, here, in the module that owns the ordering. A re-assertion that
	 * never fires costs one distance per pair and makes the solve testable on its own terms.
	 */
	twinExcluded: (accent: RoleCandidate, foreground: RoleCandidate) => boolean
}>

/** `null` accents sort below every real one; masses are strictly positive above the negligible floor. */
function accentMass(option: AssignmentOption): number {
	return option.accent === null ? -1 : option.accent.mass
}

/** `null` accents sort below every real one here too: chroma is `≥ 0`, so `−1` is unreachable. */
function accentChroma(option: AssignmentOption): number {
	return option.accent === null ? -1 : option.accent.chroma
}

/**
 * The accent half of the per-role order, under whichever of the two swept rules is wired.
 *
 * Negative ⇒ `first` is the better accent. The collapse (`null`) loses both readings, which is what
 * keeps decision 8's terminal clause below every real accent at equal foreground.
 */
function compareAccent(first: AssignmentOption, second: AssignmentOption): number {
	if (ACCENT_TIEBREAK === "chroma") {
		return accentChroma(second) - accentChroma(first) || accentMass(second) - accentMass(first)
	}
	return accentMass(second) - accentMass(first)
}

/** `null` accents sort last on the final packed-int tie-break. */
function accentPacked(option: AssignmentOption): number {
	return option.accent === null
		? Number.MAX_SAFE_INTEGER
		: option.accent.cluster.representative
}

/** Class A sorts before class B. The whole of decision 18's v0.8.2 ruling, as one number. */
function foregroundClassRank(option: AssignmentOption): number {
	return option.foreground.foregroundClass === "A" ? 0 : 1
}

/**
 * The per-role tie-breaks, in the order decision 18 fixes: foreground **class** (v0.8.2), foreground
 * mass, foreground legibility, the **accent term** (`ACCENT_TIEBREAK`, v0.9.0), then the packed
 * integers. Negative ⇒ `first` is better.
 *
 * The class term is on the foreground and only on the foreground; the accent term is on the accent
 * and only on the accent, over the full union. See the header's class block and `ACCENT_TIEBREAK`.
 */
function comparePerRole(first: AssignmentOption, second: AssignmentOption): number {
	return (
		foregroundClassRank(first) - foregroundClassRank(second) ||
		second.foreground.mass - first.foreground.mass ||
		second.foreground.legibility - first.foreground.legibility ||
		compareAccent(first, second) ||
		first.foreground.cluster.representative - second.foreground.cluster.representative ||
		accentPacked(first) - accentPacked(second)
	)
}

/** Coverage first, then the per-role tie-breaks. This is decision 18's ordering, entire. */
function compareLexicographic(first: AssignmentOption, second: AssignmentOption): number {
	return second.coverage - first.coverage || comparePerRole(first, second)
}

/**
 * Solve the small assignment exhaustively (arm-f §2.7).
 *
 * `foreground × (accent ∪ {collapse})`, every pair tested against the pairwise constraints, the
 * survivors ranked by `compareLexicographic`. The collapse option is what preserves decision 8's
 * terminal clause under a joint search: a foreground with no admissible partner is still a foreground,
 * and because the collapse sorts below every real accent *at equal foreground*, it is never chosen over
 * an available accent — only over a different foreground that the coverage criterion did not prefer.
 */
export function solveAssignment(input: AssignmentInput): AssignmentTrace {
	const { foreground, accentFor, identity, fieldLabs, twinExcluded } = input

	const fieldCovered = coveredFamilies(identity, fieldLabs)
	const fieldCoveredSet = new Set(fieldCovered)
	// Per-candidate coverage is independent of the pairing, so it is measured once per candidate
	// rather than once per pair. The union below is the only per-pair work. Keyed by candidate
	// identity, which the caller is expected to keep stable across shortlists (it memoizes).
	const candidateCovered = new Map<RoleCandidate, readonly number[]>()
	function coverOf(candidate: RoleCandidate): readonly number[] {
		let covered = candidateCovered.get(candidate)
		if (covered === undefined) {
			covered = coveredFamilies(identity, [candidate.lab])
			candidateCovered.set(candidate, covered)
		}
		return covered
	}

	let enumerated = 0
	let feasibleCount = 0
	let chosen: AssignmentOption | null = null
	let perRoleOnly: AssignmentOption | null = null
	let chosenShortlist: readonly RoleCandidate[] = []
	// For `classOverriddenByCoverage`: was any feasible assignment with a class-A foreground seen?
	let classAFeasible = false

	for (const fg of foreground) {
		const shortlist = accentFor(fg)
		for (const candidate of [...shortlist, null]) {
			enumerated += 1
			if (candidate !== null) {
				// The two pairwise constraints, re-asserted. Cluster identity first: one cluster cannot
				// hold two roles. Then decision 14's twin exclusion, which subsumes `sameColor` on the
				// published pair (its radius is `ACCENT_FG_EXCLUSION_MULTIPLE` bars, never fewer than one).
				if (candidate.cluster === fg.cluster) continue
				if (twinExcluded(candidate, fg)) continue
			}
			feasibleCount += 1
			if (fg.foregroundClass === "A") classAFeasible = true

			const covered = new Set(fieldCoveredSet)
			for (const rank of coverOf(fg)) covered.add(rank)
			if (candidate !== null) for (const rank of coverOf(candidate)) covered.add(rank)
			const option: AssignmentOption = {
				foreground: fg,
				accent: candidate,
				coverage: covered.size,
				covered: [...covered].sort((first, second) => first - second),
			}

			if (chosen === null || compareLexicographic(option, chosen) < 0) {
				chosen = option
				chosenShortlist = shortlist
			}
			if (perRoleOnly === null || comparePerRole(option, perRoleOnly) < 0) perRoleOnly = option
		}
	}

	return {
		identity,
		shortlistSize: ROLE_SHORTLIST_SIZE,
		familyCount: IDENTITY_FAMILY_COUNT,
		fieldCovered,
		foregroundShortlist: foreground,
		accentShortlist: chosenShortlist,
		enumerated,
		feasible: feasibleCount,
		chosen,
		perRoleOnly,
		coverageDecided: chosen !== null && perRoleOnly !== null &&
			(chosen.foreground.cluster !== perRoleOnly.foreground.cluster ||
				chosen.accent?.cluster !== perRoleOnly.accent?.cluster),
		classOverriddenByCoverage: chosen !== null && chosen.foreground.foregroundClass === "B" &&
			classAFeasible,
	}
}

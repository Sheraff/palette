/**
 * # The solver — one constrained minimisation, searched exactly.
 *
 * Proposal §2.5, implemented as written: score every unary term for every distinct triple by lattice
 * reads (linear in the triple count), seed an incumbent, then prune by **admissible bound** — never
 * by filtering. The claim this file is responsible for is the one §1 makes and `README.md`
 * pre-registers as falsifier 2: *"every distinct 8-bit triple in the artwork is feasible for every
 * role at all times, and the only thing that ever removes one is an admissible bound inside an exact
 * search."*
 *
 * ## What "admissible bound" is allowed to mean, and why a barrier is one
 *
 * A bound is admissible when it provably never exceeds the true cost of any completion. Two kinds
 * appear below and both are bounds, not filters:
 *
 * 1. **Cost bounds.** A tuple's total is `base + Σ unary + Σ collapse + rates.coverage · coverage`.
 *    Collapse costs are non-negative and coverage is bounded from below (see "the coverage bound"),
 *    so a partial sum plus each unassigned role's cheapest available cost is a lower bound on every
 *    completion. Each role's list is sorted ascending by exactly the quantity the bound accumulates,
 *    so exceeding the incumbent at position *k* means exceeding it at every later position — which is
 *    what licenses the `break`.
 * 2. **Barrier bounds.** `./barriers.ts` is infinite cost, so a candidate that violates a barrier
 *    *no matter what the other roles are* has an infinite lower bound in that role, and dropping it
 *    from that role's list is the `∞ > incumbent` prune written once instead of once per tuple. That
 *    is not "filtering by fiat": nothing about the candidate's *statistics* is consulted, the test is
 *    the contract's own, and the same colour stays in every role whose barriers it does clear.
 *    Proposal §2.4 term 5 is explicit that this factorisation is available and load-bearing — *"the
 *    ramp is fixed before foreground and accent are chosen, [so] the minimum over the whole ramp
 *    factorises into a unary constraint on each"*.
 *
 * **Both are checked rather than argued.** `tests/energy.test.ts` runs the whole search twice on the
 * same instance — once as written here, once with `exhaustive: true`, which disables the break, the
 * incumbent seeding, the unary lists and the factorised predicates and decides feasibility with
 * `violatedBarriers` on a fully materialised tuple — and asserts the two return the same palette with
 * a bit-identical total.
 *
 * ## What the previous shape got wrong, measured
 *
 * The first version of this file bounded coverage from below by the submodular gain inequality alone
 * and evaluated every surviving tuple through `violatedBarriers`. On a 640×640 cover (15,890 distinct
 * triples) it did not terminate; at 304 triples it visited 64k tuples **with `coverage: 0`**, where
 * the cost bound is exact. That measurement says the cost landscape is not what was expensive: the
 * tuples being visited were the ones *cheaper than the optimum and infeasible*, each paying a
 * full tuple materialisation to find out. Three changes follow from it, in the order they matter:
 *
 * - **Feasibility is decided per candidate where it factorises** (`./pairs.ts`), so an infeasible
 *   colour costs one test for the whole hypothesis instead of one per tuple it appears in.
 * - **The residual pair tests are index arithmetic**, allocation-free, ~20 ns instead of ~2 µs.
 * - **Coverage is narrowed as the search descends.** `dsf` below is the per-quadrature-cell distance
 *   to the fixed colours *and* the surface *and* the foreground; its mass sum is a far tighter
 *   constant than `coverageBase − Σ gain`, and the accent's exact coverage then costs one pass over
 *   the cells only for accents that survive an O(1) test.
 *
 * ## The coverage bound
 *
 * Two admissible statements are combined, and the search uses whichever is larger:
 *
 * - **The gain inequality** (`./coverage.ts`): `coverage(fixed ∪ free) ≥ coverageBase − Σ gain(x)`.
 * - **The narrowed constant**: once the surface and foreground are chosen, `coverage ≥ Σ_c m_c·dsf[c]
 *   − gain(accent)`, and `Σ_c m_c·dsf[c] ≥ coverageBase − gain(surface) − gain(foreground)` by the
 *   same submodularity, so this is the tighter of the two wherever the two roles' coverage overlaps.
 *
 * Both are then clamped at zero, because coverage is a non-negative quantity: `max(0, …)` is still a
 * lower bound. The clamp is used for *skipping* a node and the unclamped form for *breaking* out of a
 * sorted list, since only the unclamped form is monotone along the sort key.
 *
 * A relaxation the directive asked for and measurement rejected: lower-bounding coverage by placing
 * each unassigned role at its per-quadrature-node optimum. Every occupied cell contains at least one
 * artwork triple by construction (the quadrature is built *from* the triples), so that relaxation
 * lets every cell be covered at essentially zero cost and evaluates to ≈0 — weaker than `coverage ≥
 * 0`. It is not implemented, and this paragraph is why.
 *
 * ## Which roles the field hypothesis pins, and which it does not
 *
 * `../types.ts` states that a hypothesis's *"first stop IS background, last IS surface"*, matching
 * `I1.first-stop-not-background` / `I1.last-stop-not-surface`. So under a **gradient** hypothesis
 * both field roles are pinned and the free variables are the foreground and the accent.
 *
 * Under a **flat** hypothesis there is exactly one stop, which pins the background. The surface is
 * left **free** — it may collapse onto the background (paying `rates.collapse`) or be any other
 * triple, published with `gradient: null`. **This is a reading of the interface rather than something
 * it states, and it is reported as such.** The alternative reading, that a flat hypothesis pins both
 * field roles, makes the ordinary "flat background plus a distinct surface, no gradient" palette
 * unreachable, and `FieldHypothesis` has no third `kind` that could express it. Under this reading
 * collapse also stays a genuine competing move rather than a consequence of which hypothesis won,
 * which is what proposal §2.4 asks of it.
 *
 * ## Collapse, and why there is no branch
 *
 * A collapsed tuple is not a fallback path: it is the member of the same feasible set whose accent
 * equals its foreground (or whose surface equals its background), scored by the same energy with
 * `rates.collapse` added and the contract's own exemptions applying. It is enumerated inside the same
 * loops as every other tuple and competes on total, so collapse *rates* are a readout of one term
 * rather than an artefact of a control-flow path.
 */

import { colorFromRgb, rgbToOkLab } from "../../../../src/contract/color.ts"
import { EPSILON_ACCENT_RAW, EPSILON_TEXT_RAW } from "../../../../src/contract/constants.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
} from "../../../../src/contract/invariants.ts"
import type {
	GradientStop,
	OkLab,
	PaletteColor,
	ResolvedContrastFloors,
	Rgb8,
} from "../../../../src/contract/types.ts"
import type {
	CandidateStats,
	DistinctTriple,
	ExchangeRates,
	FieldHypothesis,
	Lattice,
	Solution,
	Solve,
	Substrate,
} from "../types.ts"
import {
	accentClearsRamp,
	type BarrierContext,
	buildRampProbe,
	foregroundClearsRamp,
	type PublishedTuple,
	type RampProbe,
	violatedBarriers,
} from "./barriers.ts"
import {
	buildCoverageQuadrature,
	coverageCost,
	coverageGains,
	type CoverageQuadrature,
	fixedCoverageDistances,
} from "./coverage.ts"
import {
	accentContrastFromFact,
	accentContrastIndexed,
	apcaRawBetweenFacts,
	apcaRawFieldIndexed,
	buildColorFacts,
	type ColorFact,
	type ColorFacts,
	colorFactOf,
	distinctFacts,
	distinctFromFact,
	distinctIndexed,
	separatedIndexed,
	textContrastFromFact,
	textContrastIndexed,
} from "./pairs.ts"
import { DEFAULT_EXCHANGE_RATES, ENERGY_ANCHORS } from "./rates.ts"
import {
	accentFitness,
	belongingCost,
	computeFitnessScales,
	type FieldPath,
	fieldFitness,
	type FitnessScales,
	foregroundFitness,
	representativenessCost,
} from "./terms.ts"

export { DEFAULT_EXCHANGE_RATES }

/** Thrown when the energy is handed something it cannot minimise over. */
export class EnergyError extends Error {
	override readonly name = "EnergyError"
}

/**
 * The two colours the contract's escape clause permits, and the two roles it permits them in.
 * `[INHERITED — `ESCAPE_COLORS` / `EscapeRole` in `src/contract`]`.
 */
const ESCAPE_RGB: readonly Rgb8[] = [[255, 255, 255], [0, 0, 0]]
const ESCAPE_ROLES = ["background", "foreground"] as const

/** The empty free-colour list, hoisted so no leaf allocates one. */
const EMPTY_POINTS: readonly OkLab[] = []

/**
 * How many candidates per role the **incumbent-seeding pass** looks at before the exact search runs.
 *
 * `[HELD — search control, provably cannot change the answer]` This is not a rate and does not belong
 * in `./rates.ts`: it selects *when* work happens, never *what* wins. The seeding pass runs the same
 * loops over the cheapest 24 candidates of each role, and whatever feasible tuple it finds becomes
 * the starting incumbent for the exact pass — which then re-searches every candidate under bounds
 * that are admissible with or without a seed, so the optimum is unchanged and only the node count
 * moves. Setting it to 0 (or to ∞) yields the same palette; `tests/energy.test.ts` pins that by
 * comparing against exhaustive enumeration, which seeds nothing.
 *
 * 24 rather than a larger number because the seeding pass is `24³` tuples and its whole job is to
 * stop the exact pass from starting at `incumbent = null`, where nothing prunes at all.
 */
const SEED_SHORTLIST = 24

/** The declared total order on an 8-bit triple — the tie-break, reachable only on exact ties. */
export function packTriple(rgb: Rgb8): number {
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

// ---------------------------------------------------------------------------------------------
// The scored candidate set
// ---------------------------------------------------------------------------------------------

type Scored = Readonly<{
	triples: readonly DistinctTriple[]
	stats: readonly CandidateStats[]
	colors: readonly PaletteColor[]
	packed: Int32Array
	byPacked: ReadonlyMap<number, number>
	/** Role-independent part of every unary cost: belonging plus representativeness. */
	shared: Float64Array
	/** `1 − fieldFitness`, the misfit background and surface are scored on. */
	fieldMisfit: Float64Array
	scales: FitnessScales
	/** Per-colour barrier arithmetic, hoisted out of the search (`./pairs.ts`). */
	facts: ColorFacts
}>

function scoreCandidates(lattice: Lattice, rates: ExchangeRates): Scored {
	const triples = lattice.triples
	const stats: CandidateStats[] = new Array(triples.length)
	for (let index = 0; index < triples.length; index++) {
		stats[index] = lattice.statsAt(triples[index].lab)
	}

	const colors: PaletteColor[] = new Array(triples.length)
	const packed = new Int32Array(triples.length)
	const byPacked = new Map<number, number>()
	const shared = new Float64Array(triples.length)
	const fieldMisfit = new Float64Array(triples.length)
	for (let index = 0; index < triples.length; index++) {
		colors[index] = colorFromRgb(triples[index].rgb)
		packed[index] = packTriple(triples[index].rgb)
		byPacked.set(packed[index], index)
		shared[index] = rates.belonging * belongingCost(stats[index]) +
			rates.representativeness * representativenessCost(stats[index])
		fieldMisfit[index] = 1 - fieldFitness(stats[index])
	}
	return {
		triples,
		stats,
		colors,
		packed,
		byPacked,
		shared,
		fieldMisfit,
		scales: computeFitnessScales(stats, rates),
		facts: buildColorFacts(triples.map((triple) => triple.rgb)),
	}
}

// ---------------------------------------------------------------------------------------------
// One search under one hypothesis, optionally with the escape pinned
// ---------------------------------------------------------------------------------------------

type EscapePin = Readonly<{ role: "background" | "foreground"; rgb: Rgb8 }>

type Incumbent = Readonly<{
	total: number
	terms: Readonly<Record<string, number>>
	tuple: PublishedTuple
	background: DistinctTriple
	surface: DistinctTriple
	foreground: DistinctTriple
	accent: DistinctTriple
	hypothesis: FieldHypothesis
	escape?: EscapePin
	/** The declared tie-break key: the four published triples in role order. */
	order: readonly [number, number, number, number]
}>

/** Strictly lower total, or exactly tied and earlier in the declared total order. */
function beats(challenger: Incumbent, incumbent: Incumbent | null): boolean {
	if (incumbent === null) return true
	if (challenger.total < incumbent.total) return true
	if (challenger.total > incumbent.total) return false
	for (let index = 0; index < 4; index++) {
		if (challenger.order[index] !== incumbent.order[index]) {
			return challenger.order[index] < incumbent.order[index]
		}
	}
	return false
}

type SearchInput = Readonly<{
	scored: Scored
	statsAt: (lab: OkLab) => CandidateStats
	quadrature: CoverageQuadrature
	rates: ExchangeRates
	floors: ResolvedContrastFloors
	hypothesis: FieldHypothesis
	escape?: EscapePin
	/** The best tuple found so far, across hypotheses — a legal starting incumbent, never a filter. */
	incumbent?: Incumbent | null
	/**
	 * Test hook: the naive reference path. Disables the break, the seeding pass, the per-candidate
	 * barrier lists and the factorised pair predicates, and decides feasibility with
	 * `violatedBarriers` on a materialised tuple. Same answer, by construction and by test.
	 */
	exhaustive?: boolean
}>

type SearchOutcome = Readonly<{
	best: Incumbent | null
	/** Every barrier some tuple violated, with a hit count — the infeasibility certificate's input. */
	barriers: Map<string, number>
	tuplesEvaluated: number
}>

/** The role paths the census names pairs by; `./barriers.ts` builds the same strings. */
const PATH_BACKGROUND = "roles.background"
const PATH_SURFACE = "roles.surface"
const PATH_FOREGROUND = "roles.foreground"
const PATH_ACCENT = "roles.accent"

function pairKey(first: string, second: string): string {
	return first < second ? `${first}|${second}` : `${second}|${first}`
}

/**
 * Search every tuple under one field hypothesis.
 */
function searchHypothesis(input: SearchInput): SearchOutcome {
	const { scored, rates, hypothesis, escape } = input
	const exhaustive = input.exhaustive === true
	const facts = scored.facts
	const quadrature = input.quadrature
	const cellCount = quadrature.cellCount
	const barriers = new Map<string, number>()
	let tuplesEvaluated = 0
	let incumbent: Incumbent | null = exhaustive ? null : (input.incumbent ?? null)

	const note = (code: string, hits = 1): void => {
		barriers.set(code, (barriers.get(code) ?? 0) + hits)
	}
	const nothing = (): SearchOutcome => ({ best: incumbent, barriers, tuplesEvaluated })

	const stops = hypothesis.stops
	if (stops.length === 0) throw new EnergyError("a field hypothesis needs at least one stop")

	// --- what the hypothesis and the escape pin ------------------------------------------------
	const synthetic = (rgb: Rgb8): DistinctTriple => ({ rgb, lab: rgbToOkLab(rgb), count: 0 })

	const backgroundTriple = escape?.role === "background" ? synthetic(escape.rgb) : stops[0].triple
	const backgroundColor = colorFromRgb(backgroundTriple.rgb)
	const backgroundFact = colorFactOf(backgroundTriple.rgb)

	// A gradient is published only when the hypothesis is one and nothing overrode its background.
	const publishesGradient = hypothesis.kind === "gradient" && stops.length >= 2 &&
		escape?.role !== "background"
	const publishedStops: GradientStop[] | null = publishesGradient
		? stops.map((stop) => ({ color: colorFromRgb(stop.triple.rgb), position: stop.t }))
		: null
	const ramp: RampProbe | null = publishedStops === null ? null : buildRampProbe(publishedStops)
	const barrierContext: BarrierContext = { floors: input.floors, ramp }

	const fieldPath: FieldPath = escape?.role === "background"
		? [backgroundTriple.lab]
		: stops.map((stop) => stop.triple.lab)

	// The surface is pinned by a gradient hypothesis (it *is* the last stop) and forced onto the
	// background by a background escape (the contract's condition 3). Otherwise it is free.
	const surfacePinned: DistinctTriple | null = publishesGradient
		? stops[stops.length - 1].triple
		: escape?.role === "background"
		? backgroundTriple
		: null
	const surfaceForcedCollapse = escape?.role === "background"
	const foregroundPinned: DistinctTriple | null = escape?.role === "foreground"
		? synthetic(escape.rgb)
		: null
	const accentForcedCollapse = foregroundPinned !== null

	const surfacePinnedFact = surfacePinned === null ? null : colorFactOf(surfacePinned.rgb)
	const foregroundPinnedFact = foregroundPinned === null ? null : colorFactOf(foregroundPinned.rgb)
	const stopFacts: ColorFact[] = publishedStops === null
		? []
		: stops.map((stop) => colorFactOf(stop.triple.rgb))

	// --- the inherited floors ------------------------------------------------------------------
	// `[INHERITED — `./barriers.ts`, which reads them from `invariants.ts`]` Restated here because the
	// per-candidate lists below apply exactly these floors; a second reading of the same two lines.
	const textFloor = Math.max(input.floors.minTextContrast.effectiveRawMagnitude, EPSILON_TEXT_RAW)
	const accentFloor = Math.max(
		input.floors.minAccentContrast.effectiveRawMagnitude,
		EPSILON_ACCENT_RAW,
	)
	const accentEscapeAvailable = accentFloor <= EPSILON_ACCENT_RAW

	// --- unary costs ---------------------------------------------------------------------------
	const scales = scored.scales
	const count = scored.triples.length
	const surfaceUnary = new Float64Array(count)
	const foregroundUnary = new Float64Array(count)
	const accentUnary = new Float64Array(count)
	for (let index = 0; index < count; index++) {
		surfaceUnary[index] = scored.shared[index] + scored.fieldMisfit[index]
		foregroundUnary[index] = scored.shared[index] +
			(1 - foregroundFitness(scored.stats[index], fieldPath, scales))
		accentUnary[index] = scored.shared[index] +
			(1 - accentFitness(scored.stats[index], fieldPath, scales, rates))
	}

	/**
	 * The unary cost of a triple that is not in the candidate list — only ever an escape colour.
	 * It is scored by the same terms as every artwork triple: the escape competes, it is not exempt.
	 */
	const pinnedUnary = (triple: DistinctTriple, role: "field" | "foreground" | "accent"): number => {
		const stats = input.statsAt(triple.lab)
		const shared = rates.belonging * belongingCost(stats) +
			rates.representativeness * representativenessCost(stats)
		const fitness = role === "field"
			? fieldFitness(stats)
			: role === "foreground"
			? foregroundFitness(stats, fieldPath, scales)
			: accentFitness(stats, fieldPath, scales, rates)
		return shared + (1 - fitness)
	}

	const unaryOf = (
		triple: DistinctTriple,
		index: number,
		table: Float64Array,
		role: "field" | "foreground" | "accent",
	): number => index >= 0 ? table[index] : pinnedUnary(triple, role)

	// --- the base cost: the hypothesis plus every pinned role ----------------------------------
	const backgroundIndex = scored.byPacked.get(packTriple(backgroundTriple.rgb)) ?? -1
	const surfacePinnedIndex = surfacePinned === null
		? -1
		: scored.byPacked.get(packTriple(surfacePinned.rgb)) ?? -1
	const foregroundPinnedIndex = foregroundPinned === null
		? -1
		: scored.byPacked.get(packTriple(foregroundPinned.rgb)) ?? -1

	const backgroundUnaryCost = unaryOf(backgroundTriple, backgroundIndex, surfaceUnary, "field")
	// The description length enters **at face value**, deliberately not multiplied by
	// `rates.fieldDescriptionLength`. That rate is the field model's per-parameter complexity charge
	// and it has already been spent inside `descriptionLength` (`../fieldmodel/index.ts`:
	// `dataCost1D + rate × FIELD_1D_EXTRA_PARAMETERS`). Multiplying here would charge it twice and
	// would additionally scale the *data* cost, which free parameter 6 is not about. The rate still
	// lives in exactly one registry; `../candidate.ts` hands the same object to the field model.
	let base = hypothesis.descriptionLength + backgroundUnaryCost

	let pinnedSurfaceCost = 0
	if (surfacePinned !== null) {
		pinnedSurfaceCost = unaryOf(surfacePinned, surfacePinnedIndex, surfaceUnary, "field")
		base += pinnedSurfaceCost + (surfaceForcedCollapse ? rates.collapse : 0)
	}
	let pinnedForegroundCost = 0
	let pinnedAccentCost = 0
	if (foregroundPinned !== null) {
		pinnedForegroundCost = unaryOf(
			foregroundPinned,
			foregroundPinnedIndex,
			foregroundUnary,
			"foreground",
		)
		pinnedAccentCost = unaryOf(foregroundPinned, foregroundPinnedIndex, accentUnary, "accent")
		base += pinnedForegroundCost + pinnedAccentCost + rates.collapse
	}

	// --- barriers that no free role can repair --------------------------------------------------
	// Everything here is a function of the hypothesis and the escape alone. If one fails, every tuple
	// under this hypothesis is infeasible and the search is over before it starts — the `∞ > anything`
	// prune, applied once. In `exhaustive` mode nothing is checked here: the reference path decides
	// every tuple through `violatedBarriers`, which is the point of it.
	if (!exhaustive) {
		let pinnedInfeasible = false
		// Stop against stop.
		for (let i = 0; i < stopFacts.length; i++) {
			for (let j = i + 1; j < stopFacts.length; j++) {
				if (!distinctFacts(stopFacts[i], stopFacts[j])) {
					note(`I3.pair-not-distinct:${pairKey(`gradient.stops[${i}]`, `gradient.stops[${j}]`)}`)
					pinnedInfeasible = true
				}
			}
		}
		// Background against a pinned surface, unless the collapse is the sanctioned one.
		if (surfacePinnedFact !== null && !surfaceForcedCollapse) {
			if (!distinctFacts(backgroundFact, surfacePinnedFact)) {
				note(`I3.pair-not-distinct:${pairKey(PATH_BACKGROUND, PATH_SURFACE)}`)
				pinnedInfeasible = true
			}
		}
		// A pinned foreground (the escape) against everything already fixed.
		if (foregroundPinnedFact !== null) {
			if (!distinctFacts(backgroundFact, foregroundPinnedFact)) {
				note(`I3.pair-not-distinct:${pairKey(PATH_BACKGROUND, PATH_FOREGROUND)}`)
				pinnedInfeasible = true
			}
			for (let i = 0; i < stopFacts.length; i++) {
				if (!distinctFacts(stopFacts[i], foregroundPinnedFact)) {
					note(`I3.pair-not-distinct:${pairKey(`gradient.stops[${i}]`, PATH_FOREGROUND)}`)
					pinnedInfeasible = true
				}
			}
			if (surfacePinnedFact !== null && !distinctFacts(surfacePinnedFact, foregroundPinnedFact)) {
				note(`I3.pair-not-distinct:${pairKey(PATH_SURFACE, PATH_FOREGROUND)}`)
				pinnedInfeasible = true
			}
			if (Math.abs(apcaRawBetweenFacts(foregroundPinnedFact, backgroundFact)) < textFloor) {
				note(`I4.below-contrast-floor:${PATH_FOREGROUND}|${PATH_BACKGROUND}`)
				pinnedInfeasible = true
			}
			if (
				surfacePinnedFact !== null &&
				Math.abs(apcaRawBetweenFacts(foregroundPinnedFact, surfacePinnedFact)) < textFloor
			) {
				note(`I4.below-contrast-floor:${PATH_FOREGROUND}|${PATH_SURFACE}`)
				pinnedInfeasible = true
			}
			if (ramp !== null && !foregroundClearsRamp(colorFromRgb(foregroundPinned!.rgb), ramp, textFloor)) {
				note(`I4.ramp-below-contrast-floor:${PATH_FOREGROUND}`)
				pinnedInfeasible = true
			}
		}
		if (pinnedInfeasible) return nothing()
	}

	// --- the per-candidate barrier lists --------------------------------------------------------
	// Rule: a colour leaves a role's list only when it violates a barrier **against colours the
	// hypothesis has already fixed**, which is an infinite lower bound on every completion that uses
	// it there. It stays in every other role's list. See this file's header for why that is a bound.
	const surfaceAllowed = new Uint8Array(count)
	const foregroundAllowed = new Uint8Array(count)
	const accentAllowed = new Uint8Array(count)
	if (exhaustive) {
		surfaceAllowed.fill(1)
		foregroundAllowed.fill(1)
		accentAllowed.fill(1)
	} else {
		let surfaceRejects = 0
		let foregroundDistinctRejects = 0
		let foregroundContrastRejects = 0
		let foregroundRampRejects = 0
		let accentDistinctRejects = 0
		let accentContrastRejects = 0
		let accentRampRejects = 0

		for (let index = 0; index < count; index++) {
			// --- surface -------------------------------------------------------------------------
			// A free surface exists only when no gradient is published (a published gradient pins it),
			// so the stop-exemption never applies here and the background is the only fixed field
			// colour it must be distinct from. Equal-to-background is the sanctioned collapse.
			if (surfacePinned === null) {
				let ok = index === backgroundIndex ||
					distinctFromFact(facts, index, backgroundFact)
				if (ok && foregroundPinnedFact !== null) {
					ok = distinctFromFact(facts, index, foregroundPinnedFact) &&
						Math.abs(apcaRawFieldIndexed(facts, foregroundPinnedFact, index)) >= textFloor
				}
				if (ok) surfaceAllowed[index] = 1
				else surfaceRejects++
			}

			// --- foreground ----------------------------------------------------------------------
			if (foregroundPinned === null) {
				let ok = distinctFromFact(facts, index, backgroundFact)
				for (let s = 0; ok && s < stopFacts.length; s++) {
					ok = distinctFromFact(facts, index, stopFacts[s])
				}
				if (ok && surfacePinnedFact !== null) ok = distinctFromFact(facts, index, surfacePinnedFact)
				if (!ok) foregroundDistinctRejects++
				if (ok) {
					ok = textContrastFromFact(facts, index, backgroundFact, textFloor) &&
						(surfacePinnedFact === null ||
							textContrastFromFact(facts, index, surfacePinnedFact, textFloor))
					if (!ok) foregroundContrastRejects++
				}
				if (ok && ramp !== null) {
					ok = foregroundClearsRamp(scored.colors[index], ramp, textFloor)
					if (!ok) foregroundRampRejects++
				}
				if (ok) foregroundAllowed[index] = 1
			}

			// --- accent (the non-collapsed move; a collapsed accent *is* the foreground) ----------
			if (!accentForcedCollapse) {
				let ok = distinctFromFact(facts, index, backgroundFact)
				for (let s = 0; ok && s < stopFacts.length; s++) {
					ok = distinctFromFact(facts, index, stopFacts[s])
				}
				if (ok && surfacePinnedFact !== null) ok = distinctFromFact(facts, index, surfacePinnedFact)
				if (!ok) accentDistinctRejects++
				if (ok) {
					ok = accentContrastFromFact(
						facts,
						index,
						backgroundFact,
						accentFloor,
						accentEscapeAvailable,
					) &&
						(surfacePinnedFact === null || accentContrastFromFact(
							facts,
							index,
							surfacePinnedFact,
							accentFloor,
							accentEscapeAvailable,
						))
					if (!ok) accentContrastRejects++
				}
				if (ok && ramp !== null) {
					ok = accentEscapeAvailable
						? accentClearsRamp(
							scored.colors[index],
							ramp,
							accentFloor,
							ENERGY_ANCHORS.accentFunctionalDistance,
						)
						: foregroundClearsRamp(scored.colors[index], ramp, accentFloor)
					if (!ok) accentRampRejects++
				}
				if (ok) accentAllowed[index] = 1
			}
		}

		if (surfaceRejects > 0) {
			note(`I3.pair-not-distinct:${pairKey(PATH_BACKGROUND, PATH_SURFACE)}`, surfaceRejects)
		}
		if (foregroundDistinctRejects > 0) {
			note(
				`I3.pair-not-distinct:${pairKey(PATH_BACKGROUND, PATH_FOREGROUND)}`,
				foregroundDistinctRejects,
			)
		}
		if (foregroundContrastRejects > 0) {
			note(
				`I4.below-contrast-floor:${PATH_FOREGROUND}|${PATH_BACKGROUND}`,
				foregroundContrastRejects,
			)
		}
		if (foregroundRampRejects > 0) {
			note(`I4.ramp-below-contrast-floor:${PATH_FOREGROUND}`, foregroundRampRejects)
		}
		if (accentDistinctRejects > 0) {
			note(`I3.pair-not-distinct:${pairKey(PATH_BACKGROUND, PATH_ACCENT)}`, accentDistinctRejects)
		}
		if (accentContrastRejects > 0) {
			note(`I4.below-contrast-floor:${PATH_ACCENT}|${PATH_BACKGROUND}`, accentContrastRejects)
		}
		if (accentRampRejects > 0) {
			note(`I4.ramp-below-contrast-floor:${PATH_ACCENT}`, accentRampRejects)
		}
	}

	// --- coverage --------------------------------------------------------------------------------
	const fixedLabs: OkLab[] = [backgroundTriple.lab]
	if (publishedStops !== null) for (const stop of stops) fixedLabs.push(stop.triple.lab)
	if (surfacePinned !== null) fixedLabs.push(surfacePinned.lab)
	if (foregroundPinned !== null) fixedLabs.push(foregroundPinned.lab)
	const fixedDistances = fixedCoverageDistances(quadrature, fixedLabs)
	const coverageBase = coverageCost(quadrature, fixedDistances, [])
	const coverageGain = coverageGains(
		quadrature,
		fixedDistances,
		scored.triples.map((triple) => triple.lab),
	)

	/**
	 * The **effective** cost a role's list is ordered and bounded by: its unary cost minus the
	 * coverage the candidate is guaranteed to remove (`./coverage.ts` carries the proof). Ordering by
	 * the same quantity the bound accumulates is what keeps the `break` valid.
	 */
	const surfaceEffective = new Float64Array(count)
	const foregroundEffective = new Float64Array(count)
	const accentEffective = new Float64Array(count)
	for (let index = 0; index < count; index++) {
		const collapseCost = index === backgroundIndex ? rates.collapse : 0
		surfaceEffective[index] = surfaceUnary[index] + collapseCost -
			rates.coverage * coverageGain[index]
		foregroundEffective[index] = foregroundUnary[index] - rates.coverage * coverageGain[index]
		accentEffective[index] = accentUnary[index] - rates.coverage * coverageGain[index]
	}

	// --- the option lists, ascending by effective cost ------------------------------------------
	const listOf = (allowed: Uint8Array, cost: Float64Array): Int32Array => {
		const kept: number[] = []
		for (let index = 0; index < count; index++) if (allowed[index] === 1) kept.push(index)
		kept.sort((first, second) =>
			cost[first] - cost[second] || scored.packed[first] - scored.packed[second]
		)
		return Int32Array.from(kept)
	}
	const PINNED = Int32Array.from([-1])
	const surfaceList = surfacePinned !== null ? PINNED : listOf(surfaceAllowed, surfaceEffective)
	const foregroundList = foregroundPinned !== null
		? PINNED
		: listOf(foregroundAllowed, foregroundEffective)
	const accentList = accentForcedCollapse ? PINNED : listOf(accentAllowed, accentEffective)

	if (surfaceList.length === 0 || foregroundList.length === 0) return nothing()

	// **The minimum cost the roles not yet assigned can possibly add.** A pinned role contributes
	// **zero**, not its cheapest candidate: its cost is already inside `base`, so adding a minimum for
	// it would inflate the bound and could prune the optimum.
	const minForegroundEffective = foregroundPinned !== null
		? 0
		: foregroundEffective[foregroundList[0]]
	// The accent has two moves and the bound must cover both: a free accent from `accentList`, or the
	// collapse onto the foreground — whose accent-role cost is `accentEffective[foreground]` plus a
	// non-negative collapse charge, and whose index need not be in `accentList` at all (a collapsed
	// accent is exempt from the accent's own barriers, `./barriers.ts`). Taking the minimum over both
	// is what keeps the bound admissible once the lists are barrier-restricted.
	let minAccentEffective = accentForcedCollapse ? 0 : Number.POSITIVE_INFINITY
	if (!accentForcedCollapse) {
		if (accentList.length > 0) minAccentEffective = accentEffective[accentList[0]]
		for (let i = 0; i < foregroundList.length; i++) {
			const index = foregroundList[i]
			if (index >= 0 && accentEffective[index] < minAccentEffective) {
				minAccentEffective = accentEffective[index]
			}
		}
		if (!Number.isFinite(minAccentEffective)) return nothing()
	}

	// --- the coverage scratch space ---------------------------------------------------------------
	// One buffer per search level; the search is depth-first, so two are enough and nothing allocates
	// inside the loops. `narrowInto` reproduces `coverageCost`'s own per-cell arithmetic exactly (same
	// subtraction order, `Math.sqrt`, same `<` comparison), which is what makes the narrowed leaf
	// coverage bit-identical to `coverageCost(quadrature, fixedDistances, [surface, foreground, accent])`
	// — the property `tests/energy.test.ts` asserts by comparing totals against the exhaustive path.
	const surfaceDistances = new Float64Array(cellCount)
	const nodeDistances = new Float64Array(cellCount)
	const narrowInto = (source: Float64Array, target: Float64Array, point: OkLab): void => {
		const centroid = quadrature.centroid
		for (let index = 0; index < cellCount; index++) {
			const base3 = index * 3
			const dl = centroid[base3] - point[0]
			const da = centroid[base3 + 1] - point[1]
			const db = centroid[base3 + 2] - point[2]
			const distance = Math.sqrt(dl * dl + da * da + db * db)
			target[index] = distance < source[index] ? distance : source[index]
		}
	}

	// --- one tuple ----------------------------------------------------------------------------------
	const triples = scored.triples
	const better = (total: number, o0: number, o1: number, o2: number, o3: number): boolean => {
		if (incumbent === null) return true
		if (total < incumbent.total) return true
		if (total > incumbent.total) return false
		const order = incumbent.order
		if (o0 !== order[0]) return o0 < order[0]
		if (o1 !== order[1]) return o1 < order[1]
		if (o2 !== order[2]) return o2 < order[2]
		return o3 < order[3]
	}

	const consider = (
		surfaceIndex: number,
		foregroundIndex: number,
		accentIndex: number,
		accentCollapsed: boolean,
		distances: Float64Array,
	): void => {
		const surfaceTriple = surfaceIndex >= 0 ? triples[surfaceIndex] : surfacePinned!
		const foregroundTriple = foregroundIndex >= 0 ? triples[foregroundIndex] : foregroundPinned!
		const accentTriple = accentCollapsed ? foregroundTriple : triples[accentIndex]

		tuplesEvaluated++

		let coverageRaw: number
		let tuple: PublishedTuple | null = null
		const surfaceColor = surfaceIndex >= 0
			? scored.colors[surfaceIndex]
			: colorFromRgb(surfaceTriple.rgb)
		const foregroundColor = foregroundIndex >= 0
			? scored.colors[foregroundIndex]
			: colorFromRgb(foregroundTriple.rgb)
		const surfaceCollapsed = surfaceIndex >= 0
			? surfaceIndex === backgroundIndex
			: surfaceForcedCollapse

		if (exhaustive) {
			// The reference path: materialise the tuple and let the contract's own barrier scan decide.
			tuple = {
				background: backgroundColor,
				surface: surfaceColor,
				foreground: foregroundColor,
				accent: accentCollapsed ? foregroundColor : scored.colors[accentIndex],
				surfaceCollapsed,
				accentCollapsed,
				stops: publishedStops,
			}
			const violated = violatedBarriers(tuple, barrierContext, true)
			if (violated.length > 0) {
				for (const code of violated) note(code)
				return
			}
			const free: OkLab[] = []
			if (surfaceIndex >= 0) free.push(surfaceTriple.lab)
			if (foregroundIndex >= 0) free.push(foregroundTriple.lab)
			if (!accentCollapsed) free.push(accentTriple.lab)
			coverageRaw = coverageCost(quadrature, fixedDistances, free)
		} else {
			coverageRaw = coverageCost(
				quadrature,
				distances,
				accentCollapsed ? EMPTY_POINTS : [accentTriple.lab],
			)
		}

		const unarySum = base +
			(surfaceIndex >= 0 ? surfaceUnary[surfaceIndex] : 0) +
			(foregroundIndex >= 0 ? foregroundUnary[foregroundIndex] : 0) +
			(accentCollapsed
				? (foregroundIndex >= 0 ? accentUnary[foregroundIndex] : 0)
				: accentUnary[accentIndex])
		const surfaceCollapseCost = surfaceCollapsed && !surfaceForcedCollapse ? rates.collapse : 0
		const accentCollapseCost = accentCollapsed && !accentForcedCollapse ? rates.collapse : 0
		const coverage = rates.coverage * coverageRaw
		const total = unarySum + surfaceCollapseCost + accentCollapseCost + coverage

		const o0 = packTriple(backgroundTriple.rgb)
		const o1 = packTriple(surfaceTriple.rgb)
		const o2 = packTriple(foregroundTriple.rgb)
		const o3 = packTriple(accentTriple.rgb)
		if (!better(total, o0, o1, o2, o3)) return

		if (tuple === null) {
			tuple = {
				background: backgroundColor,
				surface: surfaceColor,
				foreground: foregroundColor,
				accent: accentCollapsed ? foregroundColor : scored.colors[accentIndex],
				surfaceCollapsed,
				accentCollapsed,
				stops: publishedStops,
			}
		}
		incumbent = {
			total,
			terms: {
				"field.descriptionLength": hypothesis.descriptionLength,
				"unary.background": backgroundUnaryCost,
				"unary.surface": surfaceIndex >= 0 ? surfaceUnary[surfaceIndex] : pinnedSurfaceCost,
				"unary.foreground": foregroundIndex >= 0
					? foregroundUnary[foregroundIndex]
					: pinnedForegroundCost,
				"unary.accent": accentCollapsed
					? (foregroundIndex >= 0 ? accentUnary[foregroundIndex] : pinnedAccentCost)
					: accentUnary[accentIndex],
				"belonging.background": backgroundIndex >= 0 ? scored.shared[backgroundIndex] : 0,
				"belonging.foreground": foregroundIndex >= 0 ? scored.shared[foregroundIndex] : 0,
				"belonging.accent": accentCollapsed || accentIndex < 0 ? 0 : scored.shared[accentIndex],
				"collapse.surface": surfaceCollapseCost + (surfaceForcedCollapse ? rates.collapse : 0),
				"collapse.accent": accentCollapseCost + (accentForcedCollapse ? rates.collapse : 0),
				coverage,
				total,
			},
			tuple,
			background: backgroundTriple,
			surface: surfaceTriple,
			foreground: foregroundTriple,
			accent: accentTriple,
			hypothesis,
			...(escape === undefined ? {} : { escape }),
			order: [o0, o1, o2, o3],
		}
	}

	// --- the search ---------------------------------------------------------------------------------
	let surfaceForegroundRejects = 0
	let surfaceAccentRejects = 0
	let separationRejects = 0

	/**
	 * Prune iff the bound is above the incumbent by more than the two expressions' shared rounding.
	 *
	 * **Strict, and slack, for two different reasons.** Strict, because a bound *equal* to the
	 * incumbent's total is not pruned: the declared tie-break can still hand the palette to the later
	 * tuple, and an exact tie is exactly where that matters. Slack, because "the bound never exceeds
	 * the true completion cost" is a statement in real arithmetic and this code runs in binary64: the
	 * bound and the total sum the *same* quantities in *different* orders (the bound reaches coverage
	 * through `Σ m·dsf` minus a precomputed gain, the total through one pass over the cells), so they
	 * can disagree in the last bits. Measured on the synthetic instances of `tests/energy.test.ts`: a
	 * bound sitting **one ulp** above a tied incumbent, which silently dropped the tuple the tie-break
	 * should have taken. Without the slack the search is exact in ℝ and not in ℝ⁶⁴, which is not a
	 * property worth having.
	 *
	 * `[HELD — floating-point guard, not a threshold]` The slack counts roundings, not energy: the two
	 * coverage passes contribute up to `cellCount` roundings each and the unary sums a few dozen more,
	 * each at most one ulp of the running magnitude. Enlarging it can only make the search visit *more*
	 * nodes — it can never remove a tuple — so the guard is conservative in the only direction that
	 * could cost correctness, and its whole effect is a handful of extra evaluations.
	 */
	const pruneSlackFactor = (2 * cellCount + 64) * Number.EPSILON
	const prune = (bound: number): boolean => {
		if (exhaustive || incumbent === null) return false
		return bound > incumbent.total + pruneSlackFactor * (Math.abs(incumbent.total) + 1)
	}

	const boundBase = base + rates.coverage * coverageBase
	const lambda = rates.coverage

	const runSearch = (limit: number): void => {
		const surfaceLimit = Math.min(surfaceList.length, limit)
		for (let si = 0; si < surfaceLimit; si++) {
			const surfaceIndex = surfaceList[si]
			const surfaceEff = surfaceIndex >= 0 ? surfaceEffective[surfaceIndex] : 0
			const surfaceGain = surfaceIndex >= 0 ? coverageGain[surfaceIndex] : 0
			if (prune(boundBase + surfaceEff + minForegroundEffective + minAccentEffective)) break

			let surfaceCells = fixedDistances
			if (surfaceIndex >= 0 && !exhaustive) {
				narrowInto(fixedDistances, surfaceDistances, triples[surfaceIndex].lab)
				surfaceCells = surfaceDistances
			}
			const surfaceUnaryCost = surfaceIndex >= 0 ? surfaceUnary[surfaceIndex] : 0
			const surfaceCollapseCost = surfaceIndex >= 0 && surfaceIndex === backgroundIndex
				? rates.collapse
				: 0

			const foregroundLimit = Math.min(foregroundList.length, limit)
			for (let fi = 0; fi < foregroundLimit; fi++) {
				const foregroundIndex = foregroundList[fi]
				const foregroundEff = foregroundIndex >= 0 ? foregroundEffective[foregroundIndex] : 0
				if (prune(boundBase + surfaceEff + foregroundEff + minAccentEffective)) break

				// The two pair barriers a free surface and a free foreground share.
				if (!exhaustive && surfaceIndex >= 0 && foregroundIndex >= 0) {
					if (!distinctIndexed(facts, surfaceIndex, foregroundIndex)) {
						surfaceForegroundRejects++
						continue
					}
					if (!textContrastIndexed(facts, foregroundIndex, surfaceIndex, textFloor)) {
						surfaceForegroundRejects++
						continue
					}
				}

				const nodeUnary = base + surfaceUnaryCost + surfaceCollapseCost +
					(foregroundIndex >= 0 ? foregroundUnary[foregroundIndex] : 0)
				const foregroundGain = foregroundIndex >= 0 ? coverageGain[foregroundIndex] : 0
				// A cheap constant to start from; replaced by the narrowed sum the moment it is worth
				// paying one pass over the cells for it. Both are lower bounds on this node's coverage.
				let nodeCoverage = coverageBase - surfaceGain - foregroundGain
				let nodeCells = surfaceCells
				let narrowed = exhaustive
				const narrow = (): void => {
					if (narrowed) return
					narrowed = true
					if (foregroundIndex >= 0) {
						narrowInto(surfaceCells, nodeDistances, triples[foregroundIndex].lab)
						nodeCells = nodeDistances
					} else nodeCells = surfaceCells
					nodeCoverage = coverageCost(quadrature, nodeCells, EMPTY_POINTS)
				}

				if (accentForcedCollapse) {
					// The escape at the foreground pins the accent onto it; its cost is already in `base`.
					narrow()
					consider(surfaceIndex, foregroundIndex, foregroundIndex, true, nodeCells)
					continue
				}

				// The accent-collapse move: the same energy, the accent equal to the foreground. It
				// publishes no new colour, so this node's coverage *is* the tuple's coverage.
				if (foregroundIndex >= 0) {
					const collapsedUnary = nodeUnary + accentUnary[foregroundIndex] + rates.collapse
					if (!prune(collapsedUnary + lambda * Math.max(0, nodeCoverage))) {
						narrow()
						if (!prune(collapsedUnary + lambda * nodeCoverage)) {
							consider(surfaceIndex, foregroundIndex, foregroundIndex, true, nodeCells)
						}
					}
				}

				const accentLimit = Math.min(accentList.length, limit)
				for (let ai = 0; ai < accentLimit; ai++) {
					const accentIndex = accentList[ai]
					// Monotone in the sort key, so this ends the whole remaining subtree.
					if (prune(nodeUnary + lambda * nodeCoverage + accentEffective[accentIndex])) break
					if (!narrowed) {
						narrow()
						if (prune(nodeUnary + lambda * nodeCoverage + accentEffective[accentIndex])) break
					}
					// The equal-index tuple *is* the collapse move above; enumerating it again with the
					// flag clear would be an "equal without flag" palette, which invariant 1 refuses.
					if (accentIndex === foregroundIndex) continue
					// Coverage is non-negative, so the clamped form is a lower bound too — and a tighter
					// one wherever the gains overlap. It cannot drive the `break`, only a skip.
					if (
						prune(
							nodeUnary + accentUnary[accentIndex] +
								lambda * Math.max(0, nodeCoverage - coverageGain[accentIndex]),
						)
					) continue

					if (!exhaustive) {
						if (surfaceIndex >= 0) {
							if (!distinctIndexed(facts, surfaceIndex, accentIndex)) {
								surfaceAccentRejects++
								continue
							}
							if (
								!accentContrastIndexed(
									facts,
									accentIndex,
									surfaceIndex,
									accentFloor,
									accentEscapeAvailable,
								)
							) {
								surfaceAccentRejects++
								continue
							}
						}
						if (foregroundIndex >= 0 && !separatedIndexed(facts, foregroundIndex, accentIndex)) {
							separationRejects++
							continue
						}
					}
					consider(surfaceIndex, foregroundIndex, accentIndex, false, nodeCells)
				}
			}
		}
	}

	// The seeding pass is a strict prefix of the exact pass's own work: it visits the cheapest
	// candidates of each role under the same bounds and the same barriers, and hands over whatever it
	// found. It cannot change the answer (the exact pass re-searches everything under bounds that hold
	// with or without a seed) and it is what stops the exact pass from starting at `incumbent = null`.
	if (!exhaustive) runSearch(SEED_SHORTLIST)
	runSearch(Number.POSITIVE_INFINITY)

	if (surfaceForegroundRejects > 0) {
		note(`I3.pair-not-distinct:${pairKey(PATH_SURFACE, PATH_FOREGROUND)}`, surfaceForegroundRejects)
	}
	if (surfaceAccentRejects > 0) {
		note(`I3.pair-not-distinct:${pairKey(PATH_SURFACE, PATH_ACCENT)}`, surfaceAccentRejects)
	}
	if (separationRejects > 0) {
		note(
			`I3.foreground-accent-not-separated:${pairKey(PATH_FOREGROUND, PATH_ACCENT)}`,
			separationRejects,
		)
	}

	return { best: incumbent, barriers, tuplesEvaluated }
}

// ---------------------------------------------------------------------------------------------
// `Solve`
// ---------------------------------------------------------------------------------------------

export type SolveOptions = Readonly<{
	/** Test hook: the naive reference path — no break, no seed, no lists, `violatedBarriers` as oracle. */
	exhaustive?: boolean
}>

/** What a solve did, beyond the palette — for the harness and the audit surface. */
export type SolveDiagnostics = Readonly<{
	tuplesEvaluated: number
	barriers: ReadonlyMap<string, number>
	escapeConsidered: boolean
}>

export function solveWithDiagnostics(
	substrate: Substrate,
	lattice: Lattice,
	hypotheses: readonly FieldHypothesis[],
	rates: ExchangeRates,
	options: SolveOptions = {},
): Readonly<{ solution: Solution; diagnostics: SolveDiagnostics }> {
	if (hypotheses.length === 0) throw new EnergyError("no field hypotheses to evaluate")
	if (lattice.triples.length === 0) throw new EnergyError("the artwork has no distinct triples")

	const scored = scoreCandidates(lattice, rates)
	const totalPixels = substrate.planes.width * substrate.planes.height
	const shared = {
		scored,
		statsAt: lattice.statsAt,
		quadrature: buildCoverageQuadrature(lattice.triples, totalPixels),
		rates,
		floors: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		exhaustive: options.exhaustive,
	}

	let best: Incumbent | null = null
	let tuplesEvaluated = 0
	const barriers = new Map<string, number>()
	const absorb = (outcome: SearchOutcome): void => {
		tuplesEvaluated += outcome.tuplesEvaluated
		for (const [code, hits] of outcome.barriers) barriers.set(code, (barriers.get(code) ?? 0) + hits)
		if (outcome.best !== null && beats(outcome.best, best)) best = outcome.best
	}

	// The running best is handed to the next hypothesis as its starting incumbent: a legal upper bound
	// on the optimum from a tuple that was actually evaluated, which is exactly what a bound wants.
	for (const hypothesis of hypotheses) {
		absorb(searchHypothesis({ ...shared, hypothesis, incumbent: best }))
	}

	if (best !== null) {
		return {
			solution: toSolution(best),
			diagnostics: { tuplesEvaluated, barriers, escapeConsidered: false },
		}
	}

	// --- the escape ---------------------------------------------------------------------------------
	// Admitted only now: the constrained problem over the artwork's own triples has been searched
	// exactly and is infeasible. Proposal §2.4: "the closest checkable shadow of 'genuinely no other
	// way' this architecture can produce. I claim the shadow, not the thing."
	const present = new Set<number>()
	for (const triple of lattice.triples) present.add(packTriple(triple.rgb))

	for (const rgb of ESCAPE_RGB) {
		// Contract condition 4: the colour must be genuinely absent from the artwork. Conditions 1 and
		// 2 are the two literals and the two roles enumerated here; condition 3 is the forced collapse
		// inside `searchHypothesis`.
		if (present.has(packTriple(rgb))) continue
		for (const role of ESCAPE_ROLES) {
			for (const hypothesis of hypotheses) {
				absorb(searchHypothesis({ ...shared, hypothesis, escape: { role, rgb }, incumbent: best }))
			}
		}
	}

	if (best === null) {
		throw new EnergyError(
			`no feasible palette and no admissible escape; barriers: ${
				certificateLines(barriers).join("; ")
			}`,
		)
	}
	return {
		solution: toSolution(best, barriers),
		diagnostics: { tuplesEvaluated, barriers, escapeConsidered: true },
	}
}

/**
 * The certificate lines.
 *
 * The count is *how many times the barrier was recorded*, which is now a mixture of two things and
 * says so: a barrier that a whole candidate fails against the hypothesis's fixed colours is recorded
 * once per candidate (it removes that colour from that role entirely), and a barrier that only a pair
 * violates is recorded once per tuple. Both are "how much of the feasible set this barrier ate", and
 * neither is a tuple count any more — the previous shape's per-tuple count was only meaningful
 * because every tuple was materialised, which is the cost this rewrite removed.
 */
function certificateLines(barriers: ReadonlyMap<string, number>): string[] {
	return [...barriers.entries()]
		.sort((first, second) => second[1] - first[1] || (first[0] < second[0] ? -1 : 1))
		.map(([code, hits]) => `${code} (violated ${hits}×)`)
}

function toSolution(best: Incumbent, barriers?: ReadonlyMap<string, number>): Solution {
	const escape = best.escape === undefined ? undefined : {
		role: best.escape.role,
		color: (best.escape.rgb[0] === 255 ? "#ffffff" : "#000000") as "#ffffff" | "#000000",
	}
	return {
		field: best.hypothesis,
		background: best.background,
		surface: best.surface,
		foreground: best.foreground,
		accent: best.accent,
		surfaceCollapsed: best.tuple.surfaceCollapsed,
		accentCollapsed: best.tuple.accentCollapsed,
		...(escape === undefined ? {} : { escape }),
		energy: { total: best.total, terms: best.terms },
		...(escape === undefined || barriers === undefined
			? {}
			: { infeasibilityCertificate: certificateLines(barriers) }),
	}
}

/** The `Solve` of `../types.ts`. */
export const solve: Solve = (substrate, lattice, hypotheses, rates) =>
	solveWithDiagnostics(substrate, lattice, hypotheses, rates).solution

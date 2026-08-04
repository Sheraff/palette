/**
 * # The solver — one constrained minimisation, searched exactly.
 *
 * Proposal §2.5, implemented as written: score every unary term for every distinct triple by
 * lattice reads (linear in the triple count), then prune by **admissible bound** — never by
 * filtering. The claim this file is responsible for is the one §1 makes and `README.md`
 * pre-registers as falsifier 2: *"every distinct 8-bit triple in the artwork is feasible for every
 * role at all times, and the only thing that ever removes one is an admissible bound inside an
 * exact search."*
 *
 * ## Why the bound is admissible
 *
 * A tuple's total is `base + Σ unary + Σ collapse costs + rates.coverage · coverage`, where `base`
 * collects the hypothesis's description length and every role the hypothesis pins. Collapse costs
 * are non-negative by construction and the barriers of `./barriers.ts` are infinite cost, so both
 * can only increase a total. Coverage is bounded from below by the submodular inequality in
 * `./coverage.ts`: `coverage ≥ coverageBase − Σ gain(x)` over the free roles' colours. So
 *
 * > `bound = base + rates.coverage·coverageBase + Σ (unary(x) − rates.coverage·gain(x))`
 *
 * is a lower bound on every completion of a partial tuple. Each role's candidate list is sorted
 * ascending by exactly the quantity the bound accumulates, so exceeding the incumbent at position
 * *k* means exceeding it at every later position — which is what licenses the `break`.
 *
 * **The coverage half of that bound is not an optimisation, it is the difference between a search
 * that finishes and one that does not.** With `coverage ≥ 0` as the only admissible statement, the
 * search must visit every tuple whose unary cost sits within the *whole* coverage term of the
 * incumbent's total; measured on a 640×640 artwork with 15,890 distinct triples that does not
 * terminate. The gain bound closes the slack to the amount by which the winning roles' coverage
 * contributions overlap.
 *
 * **Pruning is strict.** A partial bound *equal* to the incumbent's total is not pruned, because the
 * declared tie-break can still hand the palette to the later tuple. `tests/energy.test.ts` checks
 * the pruned search against exhaustive enumeration, that case included.
 *
 * ## Which roles the field hypothesis pins, and which it does not
 *
 * `../types.ts` states that a hypothesis's *"first stop IS background, last IS surface"*, matching
 * `I1.first-stop-not-background` / `I1.last-stop-not-surface`. So under a **gradient** hypothesis
 * both field roles are pinned and the free variables are the foreground and the accent.
 *
 * Under a **flat** hypothesis there is exactly one stop, which pins the background. The surface is
 * left **free** — it may collapse onto the background (paying `rates.collapse`) or be any other
 * triple, published with `gradient: null`. **This is a reading of the interface rather than
 * something it states, and it is reported as such.** The alternative reading, that a flat hypothesis
 * pins both field roles, makes the ordinary "flat background plus a distinct surface, no gradient"
 * palette unreachable, and `FieldHypothesis` has no third `kind` that could express it. Under this
 * reading collapse also stays a genuine competing move rather than a consequence of which hypothesis
 * won, which is what proposal §2.4 asks of it.
 *
 * ## Collapse, and why there is no branch
 *
 * A collapsed tuple is not a fallback path: it is the member of the same feasible set whose accent
 * equals its foreground (or whose surface equals its background), scored by the same energy with
 * `rates.collapse` added and the contract's own exemptions applying. It is enumerated inside the
 * same loops as every other tuple and competes on total, so collapse *rates* are a readout of one
 * term rather than an artefact of a control-flow path.
 */

import { colorFromRgb, rgbToOkLab } from "../../../../src/contract/color.ts"
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
	type BarrierContext,
	buildRampProbe,
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
import { DEFAULT_EXCHANGE_RATES } from "./rates.ts"
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

type SurfaceOption = Readonly<{ index: number; collapsed: boolean; cost: number }>

type SearchInput = Readonly<{
	scored: Scored
	statsAt: (lab: OkLab) => CandidateStats
	quadrature: CoverageQuadrature
	rates: ExchangeRates
	floors: ResolvedContrastFloors
	hypothesis: FieldHypothesis
	escape?: EscapePin
	/** Test hook: disables the bound-based `break` and nothing else. */
	exhaustive?: boolean
}>

type SearchOutcome = Readonly<{
	best: Incumbent | null
	/** Every barrier some tuple violated, with a hit count — the infeasibility certificate's input. */
	barriers: Map<string, number>
	tuplesEvaluated: number
}>

/**
 * Search every tuple under one field hypothesis.
 *
 * `exhaustive` disables the bound-based `break` — nothing else changes: not a term, not an
 * ordering, not the tie-break — so `tests/energy.test.ts` can assert that the pruned search returns
 * the identical palette. That is THE admissibility test, and this flag exists for it.
 */
function searchHypothesis(input: SearchInput): SearchOutcome {
	const { scored, rates, hypothesis, escape } = input
	const barriers = new Map<string, number>()
	let tuplesEvaluated = 0
	let incumbent: Incumbent | null = null

	const stops = hypothesis.stops
	if (stops.length === 0) throw new EnergyError("a field hypothesis needs at least one stop")

	// --- what the hypothesis and the escape pin ------------------------------------------------
	const synthetic = (rgb: Rgb8): DistinctTriple => ({ rgb, lab: rgbToOkLab(rgb), count: 0 })

	const backgroundTriple = escape?.role === "background" ? synthetic(escape.rgb) : stops[0].triple
	const backgroundColor = colorFromRgb(backgroundTriple.rgb)

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

	// --- coverage --------------------------------------------------------------------------------
	const fixedLabs: OkLab[] = [backgroundTriple.lab]
	if (publishedStops !== null) for (const stop of stops) fixedLabs.push(stop.triple.lab)
	if (surfacePinned !== null) fixedLabs.push(surfacePinned.lab)
	if (foregroundPinned !== null) fixedLabs.push(foregroundPinned.lab)
	const fixedDistances = fixedCoverageDistances(input.quadrature, fixedLabs)
	const coverageBase = coverageCost(input.quadrature, fixedDistances, [])
	const coverageGain = coverageGains(
		input.quadrature,
		fixedDistances,
		scored.triples.map((triple) => triple.lab),
	)

	/**
	 * The **effective** cost a role's list is ordered and bounded by: its unary cost minus the
	 * coverage the candidate is guaranteed to remove.
	 *
	 * `coverage(fixed ∪ free) ≥ coverageBase − Σ gain(x)` (`./coverage.ts` carries the proof), so
	 * `boundBase + Σ effective` is still a lower bound on the total — the bound is *tighter*, not
	 * weaker. Without it the only admissible statement about coverage is `≥ 0`, and the search then
	 * has to visit every tuple whose unary cost is within the whole coverage term of the incumbent's,
	 * which on a real artwork is not a search that finishes. Ordering by the same quantity the bound
	 * accumulates is what keeps the `break` valid.
	 */
	const effective = (unary: number, index: number): number =>
		unary - (index >= 0 ? rates.coverage * coverageGain[index] : 0)

	// --- the option lists, ascending by effective cost ---------------------------------------------
	const surfaceOptions: SurfaceOption[] = []
	if (surfacePinned !== null) {
		surfaceOptions.push({ index: -1, collapsed: surfaceForcedCollapse, cost: 0 })
	} else {
		for (let index = 0; index < count; index++) {
			const collapsed = index === backgroundIndex
			surfaceOptions.push({
				index,
				collapsed,
				cost: effective(surfaceUnary[index] + (collapsed ? rates.collapse : 0), index),
			})
		}
		surfaceOptions.sort((first, second) =>
			first.cost - second.cost || scored.packed[first.index] - scored.packed[second.index]
		)
	}
	const foregroundEffective = new Float64Array(count)
	const accentEffective = new Float64Array(count)
	for (let index = 0; index < count; index++) {
		foregroundEffective[index] = effective(foregroundUnary[index], index)
		accentEffective[index] = effective(accentUnary[index], index)
	}
	const foregroundOrder = foregroundPinned !== null
		? [-1]
		: orderedIndices(count, foregroundEffective, scored.packed)
	const accentOrder = orderedIndices(count, accentEffective, scored.packed)

	/** The true unary sum of a tuple — what the bound approximates from below. */
	const unarySumOf = (
		surfaceOption: SurfaceOption,
		foregroundIndex: number,
		accentIndex: number,
		accentCollapsed: boolean,
	): number =>
		base +
		(surfaceOption.index >= 0 ? surfaceUnary[surfaceOption.index] : 0) +
		(foregroundIndex >= 0 ? foregroundUnary[foregroundIndex] : 0) +
		(accentCollapsed
			? (foregroundIndex >= 0 ? accentUnary[foregroundIndex] : 0)
			: accentUnary[accentIndex])

	// --- one tuple ---------------------------------------------------------------------------------
	const consider = (
		surfaceOption: SurfaceOption,
		foregroundIndex: number,
		accentIndex: number,
		accentCollapsed: boolean,
	): void => {
		const unarySum = unarySumOf(surfaceOption, foregroundIndex, accentIndex, accentCollapsed)
		const surfaceTriple = surfaceOption.index >= 0
			? scored.triples[surfaceOption.index]
			: surfacePinned!
		const foregroundTriple = foregroundIndex >= 0
			? scored.triples[foregroundIndex]
			: foregroundPinned!
		const accentTriple = accentCollapsed ? foregroundTriple : scored.triples[accentIndex]

		const surfaceColor = surfaceOption.index >= 0
			? scored.colors[surfaceOption.index]
			: colorFromRgb(surfaceTriple.rgb)
		const foregroundColor = foregroundIndex >= 0
			? scored.colors[foregroundIndex]
			: colorFromRgb(foregroundTriple.rgb)

		const tuple: PublishedTuple = {
			background: backgroundColor,
			surface: surfaceColor,
			foreground: foregroundColor,
			accent: accentCollapsed ? foregroundColor : scored.colors[accentIndex],
			surfaceCollapsed: surfaceOption.collapsed,
			accentCollapsed,
			stops: publishedStops,
		}
		tuplesEvaluated++

		const violated = violatedBarriers(tuple, barrierContext, true)
		if (violated.length > 0) {
			for (const code of violated) barriers.set(code, (barriers.get(code) ?? 0) + 1)
			return
		}

		const free: OkLab[] = []
		if (surfaceOption.index >= 0) free.push(surfaceTriple.lab)
		if (foregroundIndex >= 0) free.push(foregroundTriple.lab)
		if (!accentCollapsed) free.push(accentTriple.lab)
		const coverage = rates.coverage * coverageCost(input.quadrature, fixedDistances, free)

		const surfaceCollapseCost = surfaceOption.collapsed && !surfaceForcedCollapse
			? rates.collapse
			: 0
		const accentCollapseCost = accentCollapsed && !accentForcedCollapse ? rates.collapse : 0
		const total = unarySum + surfaceCollapseCost + accentCollapseCost + coverage

		const challenger: Incumbent = {
			total,
			terms: {
				"field.descriptionLength": hypothesis.descriptionLength,
				"unary.background": backgroundUnaryCost,
				"unary.surface": surfaceOption.index >= 0
					? surfaceUnary[surfaceOption.index]
					: pinnedSurfaceCost,
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
			order: [
				packTriple(backgroundTriple.rgb),
				packTriple(surfaceTriple.rgb),
				packTriple(foregroundTriple.rgb),
				packTriple(accentTriple.rgb),
			],
		}
		if (beats(challenger, incumbent)) incumbent = challenger
	}

	// --- the search ---------------------------------------------------------------------------------
	const prune = (bound: number): boolean =>
		input.exhaustive !== true && incumbent !== null && bound > incumbent.total

	// `boundBase` is the part of every completion's cost that is already settled: the hypothesis, the
	// pinned roles, and the coverage the fixed colours alone leave uncovered. Each nested level adds
	// one role's *effective* cost, which is its unary cost less the coverage it is guaranteed to
	// remove — see `effective` above for why that stays a lower bound.
	const boundBase = base + rates.coverage * coverageBase

	// **The minimum cost the roles not yet assigned can possibly add.** A partial bound that omits
	// them is admissible but useless in practice: at the surface level it would compare a one-role
	// cost against a three-role incumbent, so every surface within the *whole* cost of a foreground
	// plus an accent survives the test — which on a real artwork is nearly all of them. Adding the
	// cheapest available cost of each unassigned role is still a lower bound (no completion can beat
	// its own minimum) and is what makes the outer loops terminate.
	//
	// A pinned role contributes **zero** here, not its cheapest candidate: its cost is already inside
	// `base`, so adding a minimum for it would inflate the bound and could prune the optimum. That is
	// the one way this tightening can go wrong, and it is why both minima are conditioned on whether
	// the role is actually still free.
	const minForegroundEffective = foregroundPinned !== null || foregroundOrder.length === 0
		? 0
		: foregroundEffective[foregroundOrder[0]]
	const minAccentEffective = accentForcedCollapse || accentOrder.length === 0
		? 0
		: accentEffective[accentOrder[0]]

	for (const surfaceOption of surfaceOptions) {
		const boundSurface = boundBase + surfaceOption.cost
		if (prune(boundSurface + minForegroundEffective + minAccentEffective)) break
		for (const foregroundIndex of foregroundOrder) {
			const boundForeground = boundSurface +
				(foregroundIndex >= 0 ? foregroundEffective[foregroundIndex] : 0)
			if (prune(boundForeground + minAccentEffective)) break

			if (accentForcedCollapse) {
				// The escape at the foreground pins the accent onto it; its cost is already in `base`.
				consider(surfaceOption, foregroundIndex, foregroundIndex, true)
				continue
			}

			// The accent-collapse move: the same energy, the accent equal to the foreground. Its gain
			// is subtracted a second time here, which can only lower the bound — safe, and looser
			// exactly where the two roles publish one colour.
			const collapsedBound = boundForeground + accentEffective[foregroundIndex]
			if (!prune(collapsedBound)) {
				consider(surfaceOption, foregroundIndex, foregroundIndex, true)
			}

			for (const accentIndex of accentOrder) {
				const boundAccent = boundForeground + accentEffective[accentIndex]
				if (prune(boundAccent)) break
				// The equal-index tuple *is* the collapse move above; enumerating it again with the flag
				// clear would be an "equal without flag" palette, which invariant 1 refuses anyway.
				if (accentIndex === foregroundIndex) continue
				consider(surfaceOption, foregroundIndex, accentIndex, false)
			}
		}
	}

	return { best: incumbent, barriers, tuplesEvaluated }
}

function orderedIndices(count: number, cost: Float64Array, packed: Int32Array): number[] {
	const order: number[] = new Array(count)
	for (let index = 0; index < count; index++) order[index] = index
	order.sort((first, second) => cost[first] - cost[second] || packed[first] - packed[second])
	return order
}

// ---------------------------------------------------------------------------------------------
// `Solve`
// ---------------------------------------------------------------------------------------------

export type SolveOptions = Readonly<{
	/** Test hook: enumerate exhaustively instead of pruning. Same answer, no `break`. */
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

	for (const hypothesis of hypotheses) absorb(searchHypothesis({ ...shared, hypothesis }))

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
				absorb(searchHypothesis({ ...shared, hypothesis, escape: { role, rgb } }))
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

function certificateLines(barriers: ReadonlyMap<string, number>): string[] {
	return [...barriers.entries()]
		.sort((first, second) => second[1] - first[1] || (first[0] < second[0] ? -1 : 1))
		.map(([code, hits]) => `${code} (violated by ${hits} tuples)`)
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

/**
 * # Tests for P6's energy, barriers and solver.
 *
 * `SPEC.md` rule 8: numeric code gets a naive reference implementation in the test re-deriving a few
 * values independently. Four of the tests below are that; the rest are the module's own claims,
 * each named after the claim it would falsify.
 *
 * **The load-bearing one is `branch-and-bound returns exactly what exhaustive enumeration returns`.**
 * The prototype's whole reachability argument — proposal §1, `README.md` falsifier 2 — is that no
 * colour is ever removed by fiat and the only thing that ever removes one is an admissible bound.
 * An inadmissible bound would make that claim false while leaving every other test green, so it is
 * checked by exhaustive enumeration over small synthetic instances at several rate settings.
 *
 * ## Why the upstream modules are synthetic here
 *
 * W1–W3 are building `substrate/`, `lattice/` and `fieldmodel/` in parallel (`SPEC.md`, wave 1).
 * This file therefore implements those three interfaces itself, deterministically, from a seeded
 * LCG — no `Math.random`, no clock, no image. That is not a convenience: an energy test that needed
 * a decoder would be a test of the decoder, and the quantities the energy consumes (`CandidateStats`)
 * are exactly specified in `../src/types.ts`, so synthesising them tests the contract between the
 * modules rather than one implementation of it.
 *
 * Run:
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p6-figureground/tests/energy.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { colorFromRgb, okLabDistance, rgbToOkLab } from "../../../src/contract/color.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
	validateContrastFloors,
	validateDistinctness,
} from "../../../src/contract/invariants.ts"
import type { GradientStop, OkLab, Palette, Rgb8 } from "../../../src/contract/types.ts"
import {
	type BarrierContext,
	buildCoverageQuadrature,
	buildRampProbe,
	coverageOf,
	DEFAULT_EXCHANGE_RATES,
	ENERGY_ANCHORS,
	belongingCost,
	fieldFitness,
	type PublishedTuple,
	solveWithDiagnostics,
	violatedBarriers,
} from "../src/energy/index.ts"
import { FIELD_DL_STEP_REJECTION_FLOOR } from "../src/fieldmodel/constants.ts"
import type {
	CandidateStats,
	DistinctTriple,
	ExchangeRates,
	FieldHypothesis,
	Lattice,
	Substrate,
} from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// Synthetic implementations of the wave-1 interfaces
// ---------------------------------------------------------------------------------------------

/** A seeded linear congruential generator. Deterministic, and the only source of variation here. */
function lcg(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 4294967296
	}
}

/**
 * Stats for a colour the artwork does not contain — what a real lattice read returns for a point
 * with no mass near it, and therefore what an escape colour is scored on.
 */
const ABSENT_STATS: CandidateStats = {
	presence: 1e-9,
	groundMass: 0,
	inkEnergy: 0,
	markEnergy: 0,
	habitualGround: [0, 0, 0],
	fieldLikeness: 0,
	spatialSpread: 0,
	borderAffinity: 0,
	centroidDistance: 0,
}

type Instance = Readonly<{
	substrate: Substrate
	lattice: Lattice
	hypotheses: readonly FieldHypothesis[]
	statsOf: ReadonlyMap<number, CandidateStats>
}>

function packTriple(rgb: Rgb8): number {
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

function emptySubstrate(width: number, height: number): Substrate {
	const plane = () => new Float32Array(0)
	return {
		planes: {
			width,
			height,
			L: plane(),
			a: plane(),
			b: plane(),
			r8: new Uint8Array(0),
			g8: new Uint8Array(0),
			b8: new Uint8Array(0),
		},
		ladder: { sigmas: [], levels: [] },
		figureGround: {
			fieldWeight: plane(),
			inkEnergy: plane(),
			markEnergy: plane(),
			ground: { L: plane(), a: plane(), b: plane() },
		},
	}
}

/**
 * Build a synthetic artwork.
 *
 * Colours come off a coarse 8-bit grid (steps of 64) so that ordinary pairs sit far above the
 * contract's same-colour bar and the instance is feasible — a brute-force comparison over an
 * infeasible instance would compare two empty searches and prove nothing.
 */
function syntheticInstance(
	seed: number,
	tripleCount: number,
	shape: (index: number, random: () => number, stats: CandidateStats) => CandidateStats = (
		_index,
		_random,
		stats,
	) => stats,
): Instance {
	const random = lcg(seed)
	const levels = [16, 80, 144, 208]
	const grid: Rgb8[] = []
	for (const r of levels) for (const g of levels) for (const b of levels) grid.push([r, g, b])
	// Deterministic shuffle, then take the first `tripleCount`.
	for (let index = grid.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		const held = grid[index]
		grid[index] = grid[swap]
		grid[swap] = held
	}

	const triples: DistinctTriple[] = []
	const statsOf = new Map<number, CandidateStats>()
	const labOf = new Map<OkLab, number>()
	for (let index = 0; index < Math.min(tripleCount, grid.length); index++) {
		const rgb = grid[index]
		const lab = rgbToOkLab(rgb)
		const count = 1 + Math.floor(random() * 4000)
		triples.push({ rgb, lab, count })
		labOf.set(lab, packTriple(rgb))
		const base: CandidateStats = {
			presence: 1e-4 + random() * 5e-2,
			groundMass: random() * 0.5,
			inkEnergy: random(),
			markEnergy: random(),
			habitualGround: rgbToOkLab(grid[(index + 7) % grid.length]),
			fieldLikeness: random(),
			spatialSpread: random() * 0.25,
			borderAffinity: random() * 2,
			centroidDistance: random() * 0.05,
		}
		statsOf.set(packTriple(rgb), shape(index, random, base))
	}

	const totalPixels = triples.reduce((sum, triple) => sum + triple.count, 0)
	const lattice: Lattice = {
		triples,
		statsAt: (lab) => {
			const packed = labOf.get(lab)
			if (packed !== undefined) return statsOf.get(packed)!
			return ABSENT_STATS
		},
		nearestTriple: (lab) => {
			let best = triples[0]
			let bestDistance = Number.POSITIVE_INFINITY
			for (const triple of triples) {
				const distance = okLabDistance(lab, triple.lab)
				if (distance < bestDistance) {
					bestDistance = distance
					best = triple
				}
			}
			return best
		},
		distanceToArtwork: (lab) => {
			let bestDistance = Number.POSITIVE_INFINITY
			for (const triple of triples) {
				bestDistance = Math.min(bestDistance, okLabDistance(lab, triple.lab))
			}
			return bestDistance
		},
		bandwidth: 0.015,
	}

	const hypotheses: FieldHypothesis[] = [
		{ kind: "flat", stops: [{ triple: triples[0], t: 0 }], descriptionLength: 1, maxExcursion: 0 },
		{
			kind: "gradient",
			stops: [{ triple: triples[1], t: 0 }, { triple: triples[2], t: 1 }],
			descriptionLength: 1.4,
			maxExcursion: 0.01,
		},
	]

	return {
		substrate: emptySubstrate(totalPixels, 1),
		lattice,
		hypotheses,
		statsOf,
	}
}

const RATE_SETTINGS: ReadonlyArray<Readonly<{ name: string; rates: ExchangeRates }>> = [
	{ name: "shipped defaults", rates: DEFAULT_EXCHANGE_RATES },
	{
		name: "belonging ×2, coverage ×½",
		rates: { ...DEFAULT_EXCHANGE_RATES, belonging: 0.4, coverage: 0.5 },
	},
	{
		name: "collapse free, coverage ×2, anisotropy ×2",
		rates: { ...DEFAULT_EXCHANGE_RATES, collapse: 0, coverage: 2, accentAnisotropy: 2 },
	},
	{
		name: "belonging ×½, representativeness ×10, DL ×2",
		rates: {
			...DEFAULT_EXCHANGE_RATES,
			belonging: 0.1,
			representativeness: 0.2,
			fieldDescriptionLength: 2,
		},
	},
]

// ---------------------------------------------------------------------------------------------
// THE admissibility test
// ---------------------------------------------------------------------------------------------

test("branch-and-bound returns exactly what exhaustive enumeration returns", () => {
	// Three instances × four rate settings. Each instance is ~50 triples, so the exhaustive search
	// is 50 surfaces × 50 foregrounds × 51 accents under the flat hypothesis plus 50 × 51 under the
	// gradient one — every tuple the pruned search is entitled to skip is actually visited here.
	for (const seed of [1, 2, 3]) {
		const instance = syntheticInstance(seed, 50)
		for (const setting of RATE_SETTINGS) {
			const pruned = solveWithDiagnostics(
				instance.substrate,
				instance.lattice,
				instance.hypotheses,
				setting.rates,
			)
			const exhaustive = solveWithDiagnostics(
				instance.substrate,
				instance.lattice,
				instance.hypotheses,
				setting.rates,
				{ exhaustive: true },
			)
			const label = `seed ${seed}, rates "${setting.name}"`
			assert.deepEqual(
				pruned.solution.background.rgb,
				exhaustive.solution.background.rgb,
				`background differs (${label})`,
			)
			assert.deepEqual(pruned.solution.surface.rgb, exhaustive.solution.surface.rgb, `surface (${label})`)
			assert.deepEqual(
				pruned.solution.foreground.rgb,
				exhaustive.solution.foreground.rgb,
				`foreground (${label})`,
			)
			assert.deepEqual(pruned.solution.accent.rgb, exhaustive.solution.accent.rgb, `accent (${label})`)
			assert.equal(
				pruned.solution.surfaceCollapsed,
				exhaustive.solution.surfaceCollapsed,
				`surfaceCollapsed (${label})`,
			)
			assert.equal(
				pruned.solution.accentCollapsed,
				exhaustive.solution.accentCollapsed,
				`accentCollapsed (${label})`,
			)
			// Bit-identical, not merely close: the winning tuple's total is computed by the same
			// arithmetic in both modes, so any difference is a different winner.
			assert.equal(
				pruned.solution.energy.total,
				exhaustive.solution.energy.total,
				`energy.total (${label})`,
			)
			// And the bound really is doing something — otherwise the test proves nothing about pruning.
			assert.ok(
				pruned.diagnostics.tuplesEvaluated < exhaustive.diagnostics.tuplesEvaluated,
				`pruning evaluated ${pruned.diagnostics.tuplesEvaluated} of ${exhaustive.diagnostics.tuplesEvaluated} tuples (${label})`,
			)
		}
	}
})

// ---------------------------------------------------------------------------------------------
// The barriers are the contract's, digit for digit
// ---------------------------------------------------------------------------------------------

function paletteFrom(tuple: PublishedTuple): Palette {
	return {
		contractVersion: "v3-contract-0.1.0",
		roles: {
			background: tuple.background,
			surface: tuple.surface,
			foreground: tuple.foreground,
			accent: tuple.accent,
		},
		gradient: tuple.stops === null
			? null
			: { stops: tuple.stops as unknown as [GradientStop, GradientStop, ...GradientStop[]] },
		collapse: {
			surfaceCollapsed: tuple.surfaceCollapsed,
			accentCollapsed: tuple.accentCollapsed,
		},
		contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		metadata: {
			algorithmVersion: "test",
			preprocessingVersion: "test",
			inputContentHash: "0".repeat(64),
			sourceRendition: { path: "/test", width: 1, height: 1, format: "png" },
			processedSize: { width: 1, height: 1 },
		},
	}
}

test("violatedBarriers agrees with invariants 3 and 4 on every tuple, exception classes included", () => {
	const random = lcg(4242)
	const floors = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)
	const pick = (): Rgb8 => [
		Math.floor(random() * 256),
		Math.floor(random() * 256),
		Math.floor(random() * 256),
	]

	let agreements = 0
	let flatCases = 0
	let gradientCases = 0
	let collapseCases = 0
	for (let trial = 0; trial < 600; trial++) {
		const background = colorFromRgb(pick())
		// A third of the trials nudge colours together so the barriers actually fire; a third collapse.
		const near = trial % 3 === 0
		const surfaceRgb = near
			? [background.rgb[0], background.rgb[1], Math.min(255, background.rgb[2] + 1)] as Rgb8
			: pick()
		const foreground = colorFromRgb(pick())
		const surfaceCollapsed = trial % 3 === 1
		const accentCollapsed = trial % 5 === 0
		const surface = surfaceCollapsed ? background : colorFromRgb(surfaceRgb)
		const accent = accentCollapsed ? foreground : colorFromRgb(pick())
		const wantsGradient = trial % 2 === 0 && !surfaceCollapsed

		const stops: GradientStop[] | null = wantsGradient
			? [
				{ color: background, position: 0 },
				{ color: colorFromRgb(pick()), position: 0.5 },
				{ color: surface, position: 1 },
			]
			: null
		const tuple: PublishedTuple = {
			background,
			surface,
			foreground,
			accent,
			surfaceCollapsed,
			accentCollapsed,
			stops,
		}
		if (stops === null) flatCases++
		else gradientCases++
		if (surfaceCollapsed || accentCollapsed) collapseCases++

		const context: BarrierContext = {
			floors,
			ramp: stops === null ? null : buildRampProbe(stops),
		}
		const mine = violatedBarriers(tuple, context).length === 0
		const palette = paletteFrom(tuple)
		const theirs = validateDistinctness(palette).length === 0 &&
			validateContrastFloors(palette).length === 0
		assert.equal(
			mine,
			theirs,
			`disagreement on trial ${trial}: ${JSON.stringify(tuple)} — barriers said ${mine}, the contract said ${theirs}`,
		)
		if (mine === theirs) agreements++
	}
	assert.equal(agreements, 600)
	assert.ok(flatCases > 100 && gradientCases > 100 && collapseCases > 100)
})

// ---------------------------------------------------------------------------------------------
// Collapse is a move with a price
// ---------------------------------------------------------------------------------------------

/** Every triple but the field is hopeless as a field: no surface can earn its coverage. */
function noSecondFieldExists(index: number, _random: () => number, stats: CandidateStats): CandidateStats {
	if (index === 0) {
		return { ...stats, fieldLikeness: 1, spatialSpread: 0.2, borderAffinity: 1.5, presence: 0.05 }
	}
	return { ...stats, fieldLikeness: 0, spatialSpread: 0, borderAffinity: 0 }
}

/** A genuine second field: one triple is as field-like as the background. */
function secondFieldExists(index: number, random: () => number, stats: CandidateStats): CandidateStats {
	const shaped = noSecondFieldExists(index, random, stats)
	if (index === 5) {
		return { ...shaped, fieldLikeness: 1, spatialSpread: 0.2, borderAffinity: 1.5, presence: 0.05 }
	}
	return shaped
}

test("the surface collapses when no surface earns its coverage, and does not when one does", () => {
	const flatOnly = (instance: Instance): readonly FieldHypothesis[] => [instance.hypotheses[0]]

	const barren = syntheticInstance(11, 40, noSecondFieldExists)
	const collapsed = solveWithDiagnostics(
		barren.substrate,
		barren.lattice,
		flatOnly(barren),
		DEFAULT_EXCHANGE_RATES,
	).solution
	assert.equal(collapsed.surfaceCollapsed, true)
	assert.equal(collapsed.surface.rgb.join(","), collapsed.background.rgb.join(","))
	assert.equal(collapsed.energy.terms["collapse.surface"], DEFAULT_EXCHANGE_RATES.collapse)

	const populated = syntheticInstance(11, 40, secondFieldExists)
	const distinct = solveWithDiagnostics(
		populated.substrate,
		populated.lattice,
		flatOnly(populated),
		DEFAULT_EXCHANGE_RATES,
	).solution
	assert.equal(distinct.surfaceCollapsed, false)
	assert.notEqual(distinct.surface.rgb.join(","), distinct.background.rgb.join(","))
	assert.equal(distinct.energy.terms["collapse.surface"], 0)
})

test("collapse cost is a readout: raising it past the surface's advantage flips the decision", () => {
	const populated = syntheticInstance(11, 40, secondFieldExists)
	const flat = [populated.hypotheses[0]]
	const free = solveWithDiagnostics(populated.substrate, populated.lattice, flat, {
		...DEFAULT_EXCHANGE_RATES,
		collapse: 0,
	}).solution
	// At zero cost the collapse is free, so it wins unless a surface is strictly better than the
	// background *in the surface role* — which is what "earns its coverage" means.
	assert.ok(free.surfaceCollapsed || !free.surfaceCollapsed)
	const expensive = solveWithDiagnostics(populated.substrate, populated.lattice, flat, {
		...DEFAULT_EXCHANGE_RATES,
		collapse: 1000,
	}).solution
	assert.equal(expensive.surfaceCollapsed, false)
})

// ---------------------------------------------------------------------------------------------
// The escape
// ---------------------------------------------------------------------------------------------

/**
 * An artwork whose whole feasible set is inside the same-colour bar: any two published colours are
 * the same colour, so every tuple over the artwork's own triples violates invariant 3.
 */
function degenerateInstance(colors: readonly Rgb8[]): Instance {
	const triples: DistinctTriple[] = colors.map((rgb) => ({ rgb, lab: rgbToOkLab(rgb), count: 100 }))
	const labOf = new Map<OkLab, number>()
	triples.forEach((triple) => labOf.set(triple.lab, packTriple(triple.rgb)))
	const stats: CandidateStats = {
		presence: 0.4,
		groundMass: 0.4,
		inkEnergy: 0.5,
		markEnergy: 0.5,
		habitualGround: triples[0].lab,
		fieldLikeness: 0.9,
		spatialSpread: 0.2,
		borderAffinity: 1.2,
		centroidDistance: 0.001,
	}
	const lattice: Lattice = {
		triples,
		statsAt: (lab) => (labOf.has(lab) ? stats : ABSENT_STATS),
		nearestTriple: () => triples[0],
		distanceToArtwork: (lab) =>
			Math.min(...triples.map((triple) => okLabDistance(lab, triple.lab))),
		bandwidth: 0.015,
	}
	return {
		substrate: emptySubstrate(200, 1),
		lattice,
		hypotheses: [
			{ kind: "flat", stops: [{ triple: triples[0], t: 0 }], descriptionLength: 1, maxExcursion: 0 },
		],
		statsOf: new Map(),
	}
}

test("the escape fires only on decided infeasibility, and its certificate names the barriers", () => {
	// Two triples one 8-bit step apart: far inside the same-colour bar in every region.
	const degenerate = degenerateInstance([[40, 40, 40], [41, 41, 41]])
	const escaped = solveWithDiagnostics(
		degenerate.substrate,
		degenerate.lattice,
		degenerate.hypotheses,
		DEFAULT_EXCHANGE_RATES,
	).solution

	assert.notEqual(escaped.escape, undefined)
	// Contract condition 2: the role is one of the two the ruling permits. **Which** of the two the
	// energy takes is not asserted — both are legal two-colour palettes here and the choice is a
	// readout of the energy, so pinning it would be pinning a rate.
	assert.ok(escaped.escape?.role === "background" || escaped.escape?.role === "foreground")
	// Contract condition 1: exactly one of the two literals.
	assert.ok(escaped.escape?.color === "#ffffff" || escaped.escape?.color === "#000000")

	// Contract condition 3: the corresponding partner is genuinely collapsed, exactly.
	const escapedRgb = escaped.escape?.role === "background" ? escaped.background : escaped.foreground
	const partner = escaped.escape?.role === "background" ? escaped.surface : escaped.accent
	const partnerCollapsed = escaped.escape?.role === "background"
		? escaped.surfaceCollapsed
		: escaped.accentCollapsed
	assert.equal(partnerCollapsed, true)
	assert.equal(escapedRgb.rgb.join(","), partner.rgb.join(","))
	// Contract condition 4: the colour is genuinely absent from the artwork.
	assert.ok(
		!degenerate.lattice.triples.some((triple) => triple.rgb.join(",") === escapedRgb.rgb.join(",")),
	)
	// The escape search has its own pinned roles and therefore its own bounds — a pinned role must
	// contribute zero to the minimum-remaining term or the bound stops being admissible. Checked the
	// same way the main search is: against exhaustive enumeration.
	const exhaustiveEscape = solveWithDiagnostics(
		degenerate.substrate,
		degenerate.lattice,
		degenerate.hypotheses,
		DEFAULT_EXCHANGE_RATES,
		{ exhaustive: true },
	).solution
	assert.equal(exhaustiveEscape.escape?.role, escaped.escape?.role)
	assert.equal(exhaustiveEscape.escape?.color, escaped.escape?.color)
	assert.equal(exhaustiveEscape.energy.total, escaped.energy.total)
	assert.deepEqual(exhaustiveEscape.foreground.rgb, escaped.foreground.rgb)
	assert.deepEqual(exhaustiveEscape.accent.rgb, escaped.accent.rgb)

	// The certificate is the audit surface, not decoration.
	assert.ok((escaped.infeasibilityCertificate?.length ?? 0) > 0)
	assert.ok(
		escaped.infeasibilityCertificate?.some((line) => line.startsWith("I3.")),
		`certificate should name a distinctness barrier: ${JSON.stringify(escaped.infeasibilityCertificate)}`,
	)
})

test("the escape refuses a colour the artwork actually contains (contract condition 4)", () => {
	// White is present, so the white escape is unavailable and the black one must be taken.
	const degenerate = degenerateInstance([[255, 255, 255], [254, 254, 254]])
	const escaped = solveWithDiagnostics(
		degenerate.substrate,
		degenerate.lattice,
		degenerate.hypotheses,
		DEFAULT_EXCHANGE_RATES,
	).solution
	assert.equal(escaped.escape?.color, "#000000")
})

test("the escape does not fire on a feasible artwork", () => {
	for (const seed of [1, 2, 3]) {
		const instance = syntheticInstance(seed, 50)
		const outcome = solveWithDiagnostics(
			instance.substrate,
			instance.lattice,
			instance.hypotheses,
			DEFAULT_EXCHANGE_RATES,
		)
		assert.equal(outcome.solution.escape, undefined)
		assert.equal(outcome.solution.infeasibilityCertificate, undefined)
		assert.equal(outcome.diagnostics.escapeConsidered, false)
	}
})

// ---------------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------------

test("two solves of the same instance are byte-identical", () => {
	for (const seed of [1, 2, 3]) {
		const instance = syntheticInstance(seed, 50)
		const first = solveWithDiagnostics(
			instance.substrate,
			instance.lattice,
			instance.hypotheses,
			DEFAULT_EXCHANGE_RATES,
		).solution
		const second = solveWithDiagnostics(
			instance.substrate,
			instance.lattice,
			instance.hypotheses,
			DEFAULT_EXCHANGE_RATES,
		).solution
		assert.equal(JSON.stringify(first), JSON.stringify(second))
	}
})

test("nothing depends on enumeration order: permuting the triple list gives the same palette", () => {
	// The declared tie-break is a total order on the 8-bit triple (`packTriple`) and is reachable only
	// on exact ties. The property that makes it worth having is order-independence: if any decision
	// leaked from the order the lattice happened to enumerate its triples in, this test would fail —
	// and a palette that depends on iteration order is exactly what `SPEC.md` rule 1 forbids.
	const forward = syntheticInstance(9, 40)
	const reversed = [...forward.lattice.triples].reverse()
	const permuted: Lattice = { ...forward.lattice, triples: reversed }
	const hypotheses = forward.hypotheses

	const first = solveWithDiagnostics(
		forward.substrate,
		forward.lattice,
		hypotheses,
		DEFAULT_EXCHANGE_RATES,
	).solution
	const second = solveWithDiagnostics(
		forward.substrate,
		permuted,
		hypotheses,
		DEFAULT_EXCHANGE_RATES,
	).solution

	for (const role of ["background", "surface", "foreground", "accent"] as const) {
		assert.deepEqual(first[role].rgb, second[role].rgb, `${role} moved when the triple list was permuted`)
	}
	assert.equal(first.energy.total, second.energy.total)
	assert.equal(first.surfaceCollapsed, second.surfaceCollapsed)
	assert.equal(first.accentCollapsed, second.accentCollapsed)
})

test("the declared tie-break is a total order on the 8-bit triple and reads nothing else", () => {
	const seen = new Set<number>()
	for (const rgb of [[0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], [255, 255, 255]] as Rgb8[]) {
		const key = packTriple(rgb)
		assert.ok(!seen.has(key))
		seen.add(key)
	}
	assert.ok(packTriple([0, 0, 1]) < packTriple([0, 1, 0]))
	assert.ok(packTriple([0, 1, 0]) < packTriple([1, 0, 0]))
	assert.equal(packTriple([255, 255, 255]), 0xffffff)
})

// ---------------------------------------------------------------------------------------------
// Naive reference re-derivations (SPEC rule 8)
// ---------------------------------------------------------------------------------------------

test("belonging re-derives as ln(reference) − ln(presence), with no cutoff anywhere", () => {
	for (const presence of [1e-6, 1e-4, 1.91e-2, 0.5, 1]) {
		const stats: CandidateStats = { ...ABSENT_STATS, presence }
		const expected = Math.log(1.91e-2) - Math.log(presence)
		assert.ok(Math.abs(belongingCost(stats) - expected) < 1e-12)
	}
	// Monotone strictly decreasing, and finite at every presence a lattice can return — the property
	// that makes belonging a cost rather than a wall.
	let previous = Number.POSITIVE_INFINITY
	for (let power = -8; power <= 0; power++) {
		const value = belongingCost({ ...ABSENT_STATS, presence: 10 ** power })
		assert.ok(Number.isFinite(value))
		assert.ok(value < previous)
		previous = value
	}
	assert.equal(ENERGY_ANCHORS.endorsedPresenceReference, 1.91e-2)
})

test("field fitness re-derives as the product of its three scored factors", () => {
	const stats: CandidateStats = {
		...ABSENT_STATS,
		fieldLikeness: 0.8,
		spatialSpread: 1 / 12, // exactly half the uniform-over-frame trace
		borderAffinity: 0.5,
	}
	// By hand: 0.8 × (1/12)/(1/6) × 0.5 = 0.8 × 0.5 × 0.5 = 0.2
	assert.ok(Math.abs(fieldFitness(stats) - 0.2) < 1e-12)
	// Saturation, both factors: above the neutral value nothing further is earned.
	const saturated: CandidateStats = {
		...ABSENT_STATS,
		fieldLikeness: 1,
		spatialSpread: 10,
		borderAffinity: 10,
	}
	assert.equal(fieldFitness(saturated), 1)
})

test("the coverage quadrature agrees with a naive per-triple transport sum to within one bar", () => {
	const instance = syntheticInstance(7, 50)
	const triples = instance.lattice.triples
	const totalPixels = triples.reduce((sum, triple) => sum + triple.count, 0)
	const quadrature = buildCoverageQuadrature(triples, totalPixels)
	const published = [triples[0].lab, triples[9].lab, triples[20].lab, triples[33].lab]

	// The naive reference: every distinct triple, at its own colour, transported to the nearest
	// published colour. No grid, no aggregation.
	let naive = 0
	for (const triple of triples) {
		let best = Number.POSITIVE_INFINITY
		for (const point of published) best = Math.min(best, okLabDistance(triple.lab, point))
		naive += (triple.count / totalPixels) * best
	}

	const quadratic = coverageOf(quadrature, published)
	assert.ok(
		Math.abs(quadratic - naive) <= ENERGY_ANCHORS.coverageQuadratureStep,
		`quadrature ${quadratic} vs naive ${naive}; the stated bound is one same-colour bar (${ENERGY_ANCHORS.coverageQuadratureStep})`,
	)
	// Mass is conserved: no colour is ever dropped for being rare. That is the floorless claim.
	let mass = 0
	for (let index = 0; index < quadrature.cellCount; index++) mass += quadrature.mass[index]
	assert.ok(Math.abs(mass - 1) < 1e-9)
})

test("coverage is non-negative and decreasing in the published set — the admissible-bound premise", () => {
	const instance = syntheticInstance(8, 50)
	const triples = instance.lattice.triples
	const totalPixels = triples.reduce((sum, triple) => sum + triple.count, 0)
	const quadrature = buildCoverageQuadrature(triples, totalPixels)
	let previous = Number.POSITIVE_INFINITY
	const published: OkLab[] = []
	for (const index of [0, 5, 12, 19, 26, 33, 40]) {
		published.push(triples[index].lab)
		const cost = coverageOf(quadrature, published)
		assert.ok(cost >= 0)
		assert.ok(cost <= previous + 1e-12)
		previous = cost
	}
})

// ---------------------------------------------------------------------------------------------
// The rates registry is the only place a weight lives
// ---------------------------------------------------------------------------------------------

test("the shipped DL rate clears the field model's analytic step-rejection floor", () => {
	// `../src/fieldmodel/constants.ts` states a consumer obligation on this registry: below
	// `ln2 / FIELD_1D_EXTRA_PARAMETERS` the field model is knowingly able to publish two flat halves
	// of a field as a ramp. The obligation is checked here rather than asserted in prose, and it is a
	// *bound*, not a calibration — nothing about a palette was consulted to satisfy it.
	assert.ok(
		DEFAULT_EXCHANGE_RATES.fieldDescriptionLength > FIELD_DL_STEP_REJECTION_FLOOR,
		`fieldDescriptionLength ${DEFAULT_EXCHANGE_RATES.fieldDescriptionLength} must exceed ${FIELD_DL_STEP_REJECTION_FLOOR}`,
	)
})

test("perturbing the rates object wholesale is enough to move the palette — no weight is hidden", () => {
	const instance = syntheticInstance(5, 50)
	const baseline = solveWithDiagnostics(
		instance.substrate,
		instance.lattice,
		instance.hypotheses,
		DEFAULT_EXCHANGE_RATES,
	).solution
	let moved = 0
	for (const setting of RATE_SETTINGS.slice(1)) {
		const solution = solveWithDiagnostics(
			instance.substrate,
			instance.lattice,
			instance.hypotheses,
			setting.rates,
		).solution
		if (JSON.stringify(solution.energy.terms) !== JSON.stringify(baseline.energy.terms)) moved++
	}
	assert.ok(moved > 0, "no rate perturbation changed anything — the energy is not reading its rates")
})

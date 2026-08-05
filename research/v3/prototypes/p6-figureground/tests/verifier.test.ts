/**
 * # W11 — the independent verifier's re-derivations.
 *
 * Every check here re-derives a claim made in `reports/first-palettes.md` or
 * `reports/second-palettes.md` by a path that does **not** run the code the claim is about, wherever
 * that is possible. In particular:
 *
 *  - the exhaustive enumerator below is written from scratch and shares no line with
 *    `src/energy/solve.ts`'s own `exhaustive: true` reference path (which is the same file, the same
 *    loops and the same lists as the path it is checking). It consumes only the *definitional*
 *    pieces — `terms.ts`'s `unaryCost`, `coverage.ts`'s quadrature, `barriers.ts`'s
 *    `violatedBarriers` — and enumerates every tuple itself.
 *  - the contract scorecard is re-run from the run artifact and the staged fixture rather than
 *    quoted from a report.
 *  - the blindness scan is written here rather than imported from `tools/stage-round.ts`, which is
 *    the tool that produced the files being scanned.
 *
 * ## Running it
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *       research/v3/prototypes/p6-figureground/tests/verifier.test.ts
 *
 * That default run is fast (a few seconds): the exhaustive comparisons run at 64 triples, the
 * cross-process determinism check and the real-cover brute force are skipped.
 *
 *     P6_VERIFY_HEAVY=1 NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *       research/v3/prototypes/p6-figureground/tests/verifier.test.ts
 *
 * runs everything: 216-triple synthetic brute force (~10 s per flat hypothesis), a real cover
 * downscaled to a brute-forceable triple count, the two-process byte-identity check on three covers,
 * and invariant 2 against the decoded artwork. Budget ~4 minutes.
 *
 * `P6_VERIFY_TRIPLES` overrides the synthetic instance size (default 64, or 216 under
 * `P6_VERIFY_HEAVY`); `P6_VERIFY_REAL_GRID` overrides the real cover's nearest-neighbour grid
 * (default 16).
 *
 * W11b: the grid is NOT the triple count, and the predecessor's note that grid 16 means "≤256
 * distinct triples" is wrong — the substrate's blur ladder invents colours the 16×16 downscale never
 * had, so grid 16 measures 519 distinct triples on the reference cover (20→575, 24→597, 28→604: the
 * count saturates, so raising the grid buys size slowly and costs ~n³). 519 is inside the brief's
 * 300–800 band, so the default stands and CHECK 1b asserts the band rather than trusting the grid.
 */

import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import sharp from "sharp"

import { colorFromRgb, rgbToOkLab } from "../../../src/contract/color.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
	validatePalette,
} from "../../../src/contract/invariants.ts"
import { CONTRACT_VERSION } from "../../../src/contract/constants.ts"
import { scorePalette } from "../../../src/contract/scorecard.ts"
import type { OkLab, Palette, PixelAccessor, Rgb8 } from "../../../src/contract/types.ts"
import { parseCalibrationBatch } from "../../../src/review-server/batch.ts"
import { ITEM_FIELD_ALLOWLIST } from "../../../src/review-server/round-kit.ts"
import { paletteOf } from "../src/candidate.ts"
import {
	type BarrierContext,
	buildCoverageQuadrature,
	buildRampProbe,
	type CoverageQuadrature,
	coverageCost,
	DEFAULT_EXCHANGE_RATES,
	fixedCoverageDistances,
	type PublishedTuple,
	solveWithDiagnostics,
	violatedBarriers,
} from "../src/energy/index.ts"
import { computeFitnessScales, unaryCost } from "../src/energy/terms.ts"
import { buildFieldHypotheses } from "../src/fieldmodel/index.ts"
import { buildLattice } from "../src/lattice/index.ts"
import { buildSubstrate } from "../src/substrate/index.ts"
import type {
	CandidateStats,
	DistinctTriple,
	ExchangeRates,
	FieldHypothesis,
	Lattice,
	Substrate,
} from "../src/types.ts"

const execFileAsync = promisify(execFile)

const HERE = dirname(fileURLToPath(import.meta.url))
const PROTOTYPE = resolve(HERE, "..")
const V3 = resolve(PROTOTYPE, "../..")
const REPO_ROOT = resolve(V3, "../..")

const HEAVY = process.env.P6_VERIFY_HEAVY === "1"
const SYNTHETIC_TRIPLES = Number(process.env.P6_VERIFY_TRIPLES ?? (HEAVY ? 216 : 64))
const REAL_GRID = Number(process.env.P6_VERIFY_REAL_GRID ?? 16)

/** The run every "18/18" claim in the second-palettes report is about. */
const LATEST_FULL_RUN =
	"data/devloop/runs/p6-figureground-0.1.0-demo-20-terminating-20260804T222031940Z.jsonl"
const ROUND_DIR = join(PROTOTYPE, "review-rounds/p6-round-1")
const ROUND_RUN =
	"data/devloop/runs/p6-figureground-0.1.0-p6-round-1-6-20260804T224150247Z.jsonl"

// =============================================================================================
// CHECK 1 — an exhaustive enumerator written from scratch, against `solve()`
// =============================================================================================

/**
 * The whole energy, re-assembled from the term definitions, with no search in it at all.
 *
 * `solve.ts` computes a tuple's total as `hypothesis.descriptionLength + Σ unary + Σ collapse +
 * rates.coverage · coverage`, where each unary is `rates.belonging · belongingCost + (1 − fitness) +
 * rates.representativeness · representativenessCost`. That assembly is inlined in `solve.ts` over
 * hoisted `Float64Array`s; here it is spelled out through `terms.ts`'s own `unaryCost`, which
 * `solve.ts` never calls. Coverage is the transport sum with the cell distances precomputed once per
 * candidate — the same arithmetic `coverage.ts` performs, in the same reduction order, so a
 * disagreement in the last bits would be a real disagreement rather than a summation artefact.
 *
 * The only shortcut is the one no bound argument is needed for: a tuple whose total does not beat the
 * best FEASIBLE tuple found so far cannot be the argmin whatever its feasibility, so its barrier scan
 * is skipped. Every tuple's *cost* is still computed, and every tuple that could win is still scanned.
 */
type Enumerated = Readonly<{
	total: number
	order: readonly [number, number, number, number]
	background: Rgb8
	surface: Rgb8
	foreground: Rgb8
	accent: Rgb8
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	hypothesisIndex: number
	tuplesCosted: number
	barrierScans: number
}>

function packTriple(rgb: Rgb8): number {
	return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

function lexBetter(
	total: number,
	order: readonly [number, number, number, number],
	best: Enumerated | null,
): boolean {
	if (best === null) return true
	if (total < best.total) return true
	if (total > best.total) return false
	for (let index = 0; index < 4; index++) {
		if (order[index] !== best.order[index]) return order[index] < best.order[index]
	}
	return false
}

/** Distance from every quadrature cell centroid to one point, in `coverage.ts`'s own arithmetic. */
function cellDistances(quadrature: CoverageQuadrature, point: OkLab): Float64Array {
	const out = new Float64Array(quadrature.cellCount)
	for (let index = 0; index < quadrature.cellCount; index++) {
		const base = index * 3
		const dl = quadrature.centroid[base] - point[0]
		const da = quadrature.centroid[base + 1] - point[1]
		const db = quadrature.centroid[base + 2] - point[2]
		out[index] = Math.sqrt(dl * dl + da * da + db * db)
	}
	return out
}

function enumerateExactly(
	substrate: Substrate,
	lattice: Lattice,
	hypotheses: readonly FieldHypothesis[],
	rates: ExchangeRates,
): Enumerated | null {
	const triples = lattice.triples
	const count = triples.length
	const stats: CandidateStats[] = triples.map((triple) => lattice.statsAt(triple.lab))
	const scales = computeFitnessScales(stats, rates)
	const packed = triples.map((triple) => packTriple(triple.rgb))
	const colors = triples.map((triple) => colorFromRgb(triple.rgb))
	const totalPixels = substrate.planes.width * substrate.planes.height
	const quadrature = buildCoverageQuadrature(triples, totalPixels)
	const cells = quadrature.cellCount
	const mass = quadrature.mass
	const distances: Float64Array[] = triples.map((triple) => cellDistances(quadrature, triple.lab))
	const floors = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)

	let best: Enumerated | null = null
	let tuplesCosted = 0
	let barrierScans = 0

	const dsurf = new Float64Array(cells)
	const dnode = new Float64Array(cells)

	for (let hypothesisIndex = 0; hypothesisIndex < hypotheses.length; hypothesisIndex++) {
		const hypothesis = hypotheses[hypothesisIndex]
		const stops = hypothesis.stops
		const background = stops[0].triple
		const backgroundPacked = packTriple(background.rgb)
		const backgroundColor = colorFromRgb(background.rgb)
		const publishesGradient = hypothesis.kind === "gradient" && stops.length >= 2
		const pinnedSurface = publishesGradient ? stops[stops.length - 1].triple : null
		const field = stops.map((stop) => stop.triple.lab)
		const publishedStops = publishesGradient
			? stops.map((stop) => ({ color: colorFromRgb(stop.triple.rgb), position: stop.t }))
			: null
		const ramp = publishedStops === null ? null : buildRampProbe(publishedStops)
		const context: BarrierContext = { floors, ramp }

		const unaryOf = (
			role: "background" | "surface" | "foreground" | "accent",
			triple: DistinctTriple,
		): number => unaryCost(role, lattice.statsAt(triple.lab), field, scales, rates).total

		let base = hypothesis.descriptionLength + unaryOf("background", background)
		if (pinnedSurface !== null) base += unaryOf("surface", pinnedSurface)

		const fixedLabs: OkLab[] = [background.lab]
		if (publishedStops !== null) for (const stop of stops) fixedLabs.push(stop.triple.lab)
		const fixedDistances = fixedCoverageDistances(quadrature, fixedLabs)

		// Per-role unary tables, assembled through `unaryCost` one candidate at a time.
		const surfaceUnary = new Float64Array(count)
		const foregroundUnary = new Float64Array(count)
		const accentUnary = new Float64Array(count)
		for (let index = 0; index < count; index++) {
			surfaceUnary[index] = unaryCost("surface", stats[index], field, scales, rates).total
			foregroundUnary[index] = unaryCost("foreground", stats[index], field, scales, rates).total
			accentUnary[index] = unaryCost("accent", stats[index], field, scales, rates).total
		}

		const surfaceOptions = pinnedSurface === null
			? Array.from({ length: count }, (_unused, index) => index)
			: [-1]

		for (const surfaceIndex of surfaceOptions) {
			const surfaceTriple = surfaceIndex >= 0 ? triples[surfaceIndex] : pinnedSurface!
			const surfaceColor = surfaceIndex >= 0 ? colors[surfaceIndex] : colorFromRgb(surfaceTriple.rgb)
			const surfaceCollapsed = surfaceIndex >= 0 && packed[surfaceIndex] === backgroundPacked
			const surfaceCost = surfaceIndex >= 0
				? surfaceUnary[surfaceIndex] + (surfaceCollapsed ? rates.collapse : 0)
				: 0
			if (surfaceIndex >= 0) {
				const source = distances[surfaceIndex]
				for (let cell = 0; cell < cells; cell++) {
					dsurf[cell] = source[cell] < fixedDistances[cell] ? source[cell] : fixedDistances[cell]
				}
			} else dsurf.set(fixedDistances)

			for (let foregroundIndex = 0; foregroundIndex < count; foregroundIndex++) {
				const foregroundSource = distances[foregroundIndex]
				let nodeCoverage = 0
				for (let cell = 0; cell < cells; cell++) {
					const value = foregroundSource[cell] < dsurf[cell] ? foregroundSource[cell] : dsurf[cell]
					dnode[cell] = value
					nodeCoverage += mass[cell] * value
				}
				const nodeCost = base + surfaceCost + foregroundUnary[foregroundIndex]

				// The collapse move: the accent IS the foreground and publishes no new colour.
				{
					const total = nodeCost + accentUnary[foregroundIndex] + rates.collapse +
						rates.coverage * nodeCoverage
					tuplesCosted++
					const order: [number, number, number, number] = [
						backgroundPacked,
						packTriple(surfaceTriple.rgb),
						packed[foregroundIndex],
						packed[foregroundIndex],
					]
					if (lexBetter(total, order, best)) {
						barrierScans++
						const tuple: PublishedTuple = {
							background: backgroundColor,
							surface: surfaceColor,
							foreground: colors[foregroundIndex],
							accent: colors[foregroundIndex],
							surfaceCollapsed,
							accentCollapsed: true,
							stops: publishedStops,
						}
						if (violatedBarriers(tuple, context, true).length === 0) {
							best = {
								total,
								order,
								background: background.rgb,
								surface: surfaceTriple.rgb,
								foreground: triples[foregroundIndex].rgb,
								accent: triples[foregroundIndex].rgb,
								surfaceCollapsed,
								accentCollapsed: true,
								hypothesisIndex,
								tuplesCosted,
								barrierScans,
							}
						}
					}
				}

				for (let accentIndex = 0; accentIndex < count; accentIndex++) {
					if (accentIndex === foregroundIndex) continue
					const accentSource = distances[accentIndex]
					let coverage = 0
					for (let cell = 0; cell < cells; cell++) {
						const value = accentSource[cell] < dnode[cell] ? accentSource[cell] : dnode[cell]
						coverage += mass[cell] * value
					}
					const total = nodeCost + accentUnary[accentIndex] + rates.coverage * coverage
					tuplesCosted++
					const order: [number, number, number, number] = [
						backgroundPacked,
						packTriple(surfaceTriple.rgb),
						packed[foregroundIndex],
						packed[accentIndex],
					]
					if (!lexBetter(total, order, best)) continue
					barrierScans++
					const tuple: PublishedTuple = {
						background: backgroundColor,
						surface: surfaceColor,
						foreground: colors[foregroundIndex],
						accent: colors[accentIndex],
						surfaceCollapsed,
						accentCollapsed: false,
						stops: publishedStops,
					}
					if (violatedBarriers(tuple, context, true).length > 0) continue
					best = {
						total,
						order,
						background: background.rgb,
						surface: surfaceTriple.rgb,
						foreground: triples[foregroundIndex].rgb,
						accent: triples[accentIndex].rgb,
						surfaceCollapsed,
						accentCollapsed: false,
						hypothesisIndex,
						tuplesCosted,
						barrierScans,
					}
				}
			}
		}
	}

	if (best === null) return null
	return { ...best, tuplesCosted, barrierScans }
}

// ---------------------------------------------------------------------------------------------
// Adversarial synthetic instances — the verifier's own, not `energy.test.ts`'s
// ---------------------------------------------------------------------------------------------

/** mulberry32 — deliberately a different generator from `energy.test.ts`'s LCG. */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

type Instance = Readonly<{
	name: string
	substrate: Substrate
	lattice: Lattice
	hypotheses: readonly FieldHypothesis[]
	rates: ExchangeRates
}>

function minimalSubstrate(totalPixels: number): Substrate {
	const empty = () => new Float32Array(0)
	return {
		planes: {
			width: totalPixels,
			height: 1,
			L: empty(),
			a: empty(),
			b: empty(),
			r8: new Uint8Array(0),
			g8: new Uint8Array(0),
			b8: new Uint8Array(0),
		},
		ladder: { sigmas: [], levels: [] },
		figureGround: {
			fieldWeight: empty(),
			inkEnergy: empty(),
			markEnergy: empty(),
			ground: { L: empty(), a: empty(), b: empty() },
		},
	}
}

function latticeOf(triples: readonly DistinctTriple[], statsOf: Map<number, CandidateStats>): Lattice {
	const byLab = new Map<OkLab, number>()
	for (const triple of triples) byLab.set(triple.lab, packTriple(triple.rgb))
	const nearest = (lab: OkLab): DistinctTriple => {
		let best = triples[0]
		let bestDistance = Number.POSITIVE_INFINITY
		for (const triple of triples) {
			const dl = triple.lab[0] - lab[0]
			const da = triple.lab[1] - lab[1]
			const db = triple.lab[2] - lab[2]
			const distance = Math.sqrt(dl * dl + da * da + db * db)
			if (distance < bestDistance) {
				bestDistance = distance
				best = triple
			}
		}
		return best
	}
	return {
		triples,
		statsAt: (lab) => {
			const packedKey = byLab.get(lab)
			if (packedKey !== undefined) return statsOf.get(packedKey)!
			const fallback = nearest(lab)
			return statsOf.get(packTriple(fallback.rgb))!
		},
		nearestTriple: nearest,
		distanceToArtwork: (lab) => {
			const triple = nearest(lab)
			const dl = triple.lab[0] - lab[0]
			const da = triple.lab[1] - lab[1]
			const db = triple.lab[2] - lab[2]
			return Math.sqrt(dl * dl + da * da + db * db)
		},
		bandwidth: 0.019,
	}
}

/**
 * Build one synthetic artwork with a named adversarial structure.
 *
 * `nearTies` gives a block of candidates *identical* statistics, so exact ties in the total are
 * reachable and the declared tie-break — and the search's floating-point prune slack — decide the
 * answer. `infeasibleTop` puts the cheapest candidates in a tight colour cluster, so the most
 * attractive tuples are the ones the distinctness and contrast barriers refuse and the search has to
 * descend past them. `collapsePreferring` makes every non-field candidate a bad surface and sets the
 * collapse rate to zero, so the collapse move should win outright.
 */
function adversarialInstance(
	name: "nearTies" | "infeasibleTop" | "collapsePreferring",
	tripleCount: number,
): Instance {
	const random = mulberry32(name === "nearTies" ? 20260805 : name === "infeasibleTop" ? 7 : 991)
	const side = Math.ceil(Math.cbrt(tripleCount))
	const step = Math.floor(255 / Math.max(1, side - 1))
	const grid: Rgb8[] = []
	for (let r = 0; r < side; r++) {
		for (let g = 0; g < side; g++) {
			for (let b = 0; b < side; b++) {
				grid.push([Math.min(255, r * step), Math.min(255, g * step), Math.min(255, b * step)])
			}
		}
	}
	// A deterministic rotation rather than a shuffle, so the colour set is a pure function of `side`.
	const rgbs = grid.slice(0, tripleCount)

	if (name === "infeasibleTop") {
		// Replace the first eight colours with a tight cluster: sub-bar neighbours of one another, so
		// every tuple drawn from them fails distinctness while looking cheap.
		for (let index = 0; index < 8 && index < rgbs.length; index++) {
			rgbs[index] = [120 + index, 120, 120 + (index % 2)]
		}
	}

	const triples: DistinctTriple[] = []
	const statsOf = new Map<number, CandidateStats>()
	for (let index = 0; index < rgbs.length; index++) {
		const rgb = rgbs[index]
		const lab = rgbToOkLab(rgb)
		const count = 1 + Math.floor(random() * 3000)
		triples.push({ rgb, lab, count })
		const cheap = name === "infeasibleTop" && index < 8
		const tied = name === "nearTies" && index >= 3 && index < 19
		const stats: CandidateStats = {
			presence: cheap ? 0.2 + index * 1e-6 : tied ? 0.02 : 1e-4 + random() * 6e-2,
			groundMass: random() * 0.5,
			inkEnergy: tied ? 0.4 : random() * 0.6,
			markEnergy: tied ? 0.3 : random() * 0.6,
			habitualGround: tied
				? rgbToOkLab(rgbs[0])
				: rgbToOkLab(rgbs[(index * 13 + 5) % rgbs.length]),
			fieldLikeness: name === "collapsePreferring" ? (index === 0 ? 0.95 : 0.02) : random(),
			spatialSpread: name === "collapsePreferring" ? (index === 0 ? 0.9 : 0.01) : random(),
			borderAffinity: tied ? 0.5 : random() * 1.5,
			centroidDistance: tied ? 0.01 : random() * 0.04,
		}
		statsOf.set(packTriple(rgb), stats)
	}

	const lattice = latticeOf(triples, statsOf)
	const hypotheses: FieldHypothesis[] = [
		{ kind: "flat", stops: [{ triple: triples[0], t: 0 }], descriptionLength: 1.0, maxExcursion: 0 },
		{
			kind: "gradient",
			stops: [
				{ triple: triples[1], t: 0 },
				{ triple: triples[Math.min(2, triples.length - 1)], t: 1 },
			],
			descriptionLength: 1.35,
			maxExcursion: 0.02,
		},
	]
	if (name === "nearTies") {
		// A third hypothesis with an identical description length to the first, so the cross-hypothesis
		// tie-break is exercised too.
		hypotheses.push({
			kind: "flat",
			stops: [{ triple: triples[Math.min(4, triples.length - 1)], t: 0 }],
			descriptionLength: 1.0,
			maxExcursion: 0,
		})
	}

	const rates: ExchangeRates = name === "collapsePreferring"
		? { ...DEFAULT_EXCHANGE_RATES, collapse: 0, coverage: 0.05 }
		: name === "nearTies"
		? { ...DEFAULT_EXCHANGE_RATES, coverage: 0 }
		: DEFAULT_EXCHANGE_RATES

	const totalPixels = triples.reduce((sum, triple) => sum + triple.count, 0)
	return { name, substrate: minimalSubstrate(totalPixels), lattice, hypotheses, rates }
}

function assertSameSolution(instance: Instance, label: string): void {
	const started = performance.now()
	const brute = enumerateExactly(
		instance.substrate,
		instance.lattice,
		instance.hypotheses,
		instance.rates,
	)
	const bruteMs = performance.now() - started
	const pruned = solveWithDiagnostics(
		instance.substrate,
		instance.lattice,
		instance.hypotheses,
		instance.rates,
	)
	assert.notEqual(brute, null, `${label}: the independent enumerator found no feasible tuple`)
	const solution = pruned.solution
	assert.equal(solution.escape, undefined, `${label}: the escape fired, so the comparison is void`)
	assert.deepEqual(solution.background.rgb, brute!.background, `${label}: background`)
	assert.deepEqual(solution.surface.rgb, brute!.surface, `${label}: surface`)
	assert.deepEqual(solution.foreground.rgb, brute!.foreground, `${label}: foreground`)
	assert.deepEqual(solution.accent.rgb, brute!.accent, `${label}: accent`)
	assert.equal(solution.surfaceCollapsed, brute!.surfaceCollapsed, `${label}: surfaceCollapsed`)
	assert.equal(solution.accentCollapsed, brute!.accentCollapsed, `${label}: accentCollapsed`)
	assert.equal(
		solution.energy.total,
		brute!.total,
		`${label}: energy.total ${solution.energy.total} vs ${brute!.total} (Δ ${
			solution.energy.total - brute!.total
		})`,
	)
	process.stderr.write(
		`  [verifier] ${label}: ${instance.lattice.triples.length} triples, ` +
			`${brute!.tuplesCosted} tuples costed, ${brute!.barrierScans} barrier scans, ` +
			`brute ${Math.round(bruteMs)} ms, pruned evaluated ${pruned.diagnostics.tuplesEvaluated}\n`,
	)
}

test("CHECK 1a — branch-and-bound equals an independently written exhaustive enumerator", () => {
	for (const name of ["nearTies", "infeasibleTop", "collapsePreferring"] as const) {
		const instance = adversarialInstance(name, SYNTHETIC_TRIPLES)
		assertSameSolution(instance, name)
	}
})

test(
	"CHECK 1b — the same, on a real cover downscaled to a brute-forceable triple count",
	{ skip: HEAVY ? false : "set P6_VERIFY_HEAVY=1" },
	async () => {
		const cover = join(REPO_ROOT, "00/ab67616d00001e02000001335fe604d859a69094.jpg")
		const dir = await mkdtemp(join(tmpdir(), "p6-verify-"))
		try {
			const small = join(dir, "downscaled.png")
			// Sharp resize to a small grid, then nearest-neighbour back up: the distinct-triple set is
			// the small grid's, but the frame is big enough for the substrate's blur ladder.
			await sharp(cover)
				.resize(REAL_GRID, REAL_GRID, { kernel: "nearest" })
				.resize(REAL_GRID * 12, REAL_GRID * 12, { kernel: "nearest" })
				.png({ compressionLevel: 9 })
				.toFile(small)
			const substrate = await buildSubstrate(small)
			const lattice = buildLattice(substrate)
			const hypotheses = buildFieldHypotheses(substrate, lattice, DEFAULT_EXCHANGE_RATES)
			process.stderr.write(
				`  [verifier] real cover: ${lattice.triples.length} distinct triples, ` +
					`${hypotheses.length} hypotheses (${hypotheses.map((h) => h.kind).join(", ")})\n`,
			)
			// W11b: the brief specifies 300–800 distinct triples for this check. Assert the band the
			// brief names, not the grid that is supposed to produce it.
			assert.ok(
				lattice.triples.length >= 300 && lattice.triples.length <= 800,
				`the downscale left ${lattice.triples.length} triples, outside the brief's 300–800 band`,
			)
			assertSameSolution(
				{
					name: "collapsePreferring",
					substrate,
					lattice,
					hypotheses,
					rates: DEFAULT_EXCHANGE_RATES,
				},
				`real cover @${REAL_GRID}²`,
			)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	},
)

// =============================================================================================
// CHECK 2 — the contract scorecard, re-run from the artifacts
// =============================================================================================

type RunRow = Readonly<{
	kind: string
	index: number
	imagePath: string
	ok: boolean
	palette: Palette
	error: unknown
}>

function readRunRows(relativePath: string): RunRow[] {
	const text = readFileSync(join(V3, relativePath), "utf8")
	return text.trim().split("\n").map((line) => JSON.parse(line) as RunRow).filter((entry) =>
		entry.kind === "devloop-run-row"
	)
}

type Finding = Readonly<{ where: string; kind: string; detail: string }>

function auditPalettes(palettes: ReadonlyArray<{ where: string; palette: Palette }>): {
	valid: number
	violations: Finding[]
	deferred: Map<string, number>
	reportOnly: Finding[]
} {
	let valid = 0
	const violations: Finding[] = []
	const deferred = new Map<string, number>()
	const reportOnly: Finding[] = []
	for (const entry of palettes) {
		const hard = validatePalette(entry.palette)
		const { scorecard, result } = scorePalette(entry.palette)
		assert.equal(scorecard.valid, hard.valid, `${entry.where}: scorecard disagrees with hard mode`)
		assert.equal(
			result.violations.length,
			hard.violations.length,
			`${entry.where}: scorecard's own validation disagrees with a second hard-mode run`,
		)
		if (hard.valid) valid++
		for (const violation of hard.violations) {
			violations.push({
				where: entry.where,
				kind: `${violation.invariant}.${violation.check}`,
				detail: JSON.stringify(violation),
			})
		}
		for (const name of hard.deferred) deferred.set(name, (deferred.get(name) ?? 0) + 1)
		for (const invariant of scorecard.invariants) {
			for (const record of invariant.reportOnly) {
				if (record.escape !== undefined) {
					reportOnly.push({
						where: entry.where,
						kind: `${invariant.invariant}.${record.check}`,
						detail: `escape=${record.escape} ${record.quantity}=${record.measured} bar=${record.bar}`,
					})
				}
			}
		}
	}
	return { valid, violations, deferred, reportOnly }
}

test("CHECK 2a — every palette in the latest full run is contract-valid with zero violations", () => {
	const rows = readRunRows(LATEST_FULL_RUN)
	assert.equal(rows.length, 18, "the run the report quotes has 18 rows")
	for (const row of rows) assert.ok(row.ok, `row ${row.index} did not produce a palette`)
	const audit = auditPalettes(rows.map((row) => ({ where: `run row ${row.index}`, palette: row.palette })))
	process.stderr.write(
		`  [verifier] latest full run: valid ${audit.valid}/${rows.length}, ` +
			`violations ${audit.violations.length}, deferred ${
				[...audit.deferred].map(([name, hits]) => `${name}×${hits}`).join(" ")
			}, contrast escapes used ${audit.reportOnly.length}\n`,
	)
	for (const finding of audit.violations) {
		process.stderr.write(`  [verifier] VIOLATION ${finding.where} ${finding.kind} ${finding.detail}\n`)
	}
	assert.equal(audit.violations.length, 0)
	assert.equal(audit.valid, 18)
})

/**
 * The staged fixture carries only hexes and the two collapse flags, so a `Palette` has to be
 * reconstructed around them to validate at all. Everything reconstructed here is either fixed by the
 * contract (`contractVersion`, the default contrast floors, which is what the run rows carry) or
 * inert for invariants 1, 3 and 4 (the metadata block). The reconstruction is reported as such: a
 * fixture that validates says the *published colours* are legal, not that the fixture is a palette.
 */
function paletteFromFixtureItem(item: {
	imagePath: string
	palette: Record<string, string | boolean | null>
}): Palette {
	const hex = (role: string): string => item.palette[role] as string
	const roleOf = (role: string) => {
		const value = hex(role)
		const rgb: Rgb8 = [
			Number.parseInt(value.slice(1, 3), 16),
			Number.parseInt(value.slice(3, 5), 16),
			Number.parseInt(value.slice(5, 7), 16),
		]
		return colorFromRgb(rgb)
	}
	return {
		contractVersion: CONTRACT_VERSION,
		roles: {
			background: roleOf("background"),
			surface: roleOf("surface"),
			foreground: roleOf("foreground"),
			accent: roleOf("accent"),
		},
		gradient: null,
		collapse: {
			surfaceCollapsed: item.palette.surfaceCollapsed === true,
			accentCollapsed: item.palette.accentCollapsed === true,
		},
		escape: null,
		contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		metadata: {
			algorithmVersion: "p6-figureground-0.1.0",
			preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
			inputContentHash: "0".repeat(64),
			sourceRendition: { path: item.imagePath, width: 300, height: 300, format: "jpeg" },
			processedSize: { width: 300, height: 300 },
		},
	}
}

test("CHECK 2b — every palette in the round-1 fixture is contract-valid with zero violations", async () => {
	const fixture = JSON.parse(await readFile(join(ROUND_DIR, "fixture.json"), "utf8"))
	const audit = auditPalettes(
		fixture.items.map((item: never) => ({
			where: `fixture ${(item as { itemId: string }).itemId}`,
			palette: paletteFromFixtureItem(item),
		})),
	)
	process.stderr.write(
		`  [verifier] round-1 fixture: valid ${audit.valid}/${fixture.items.length}, ` +
			`violations ${audit.violations.length}, contrast escapes used ${audit.reportOnly.length}\n`,
	)
	for (const finding of audit.violations) {
		process.stderr.write(`  [verifier] VIOLATION ${finding.where} ${finding.kind} ${finding.detail}\n`)
	}
	for (const finding of audit.reportOnly) {
		process.stderr.write(`  [verifier] ADVISORY ${finding.where} ${finding.kind} ${finding.detail}\n`)
	}
	assert.equal(audit.violations.length, 0)
	assert.equal(audit.valid, fixture.items.length)
})

/**
 * The half of the scorecard the "0 violations" claim does not cover.
 *
 * `validatePalette` with no `source` **defers invariant 2** — "every published colour is an exact
 * artwork pixel", the prototype's own SPEC rule 3 — and `reports/*.md` quote the deferred verdict.
 * Supplying the decoded artwork is what makes that half answerable.
 */
async function pixelSourceOf(imagePath: string): Promise<PixelAccessor> {
	const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({
		resolveWithObject: true,
	})
	return {
		width: info.width,
		height: info.height,
		getPixel: (x: number, y: number): Rgb8 => {
			const base = (y * info.width + x) * info.channels
			return [data[base], data[base + 1], data[base + 2]]
		},
	}
}

test(
	"CHECK 2c — invariant 2 (deferred in the reported scorecard) against the decoded artwork",
	{ skip: HEAVY ? false : "set P6_VERIFY_HEAVY=1" },
	async () => {
		const rows = readRunRows(LATEST_FULL_RUN)
		let valid = 0
		const violations: string[] = []
		for (const row of rows) {
			const source = await pixelSourceOf(row.imagePath)
			const result = validatePalette(row.palette, { source })
			if (result.valid) valid++
			for (const violation of result.violations) {
				violations.push(`row ${row.index}: ${violation.invariant}.${violation.check} ${
					JSON.stringify(violation)
				}`)
			}
		}
		process.stderr.write(
			`  [verifier] invariant 2 enabled: valid ${valid}/${rows.length}, violations ${violations.length}\n`,
		)
		for (const line of violations) process.stderr.write(`  [verifier] VIOLATION ${line}\n`)
		assert.equal(violations.length, 0)
	},
)

// =============================================================================================
// CHECK 3 — the fixture parses, and the side-car is blind
// =============================================================================================

test("CHECK 3 — the round-1 fixture parses as a calibration push and neither payload leaks identity", async () => {
	const fixtureText = await readFile(join(ROUND_DIR, "fixture.json"), "utf8")
	const sidecarText = await readFile(join(ROUND_DIR, "sidecar.data.json"), "utf8")
	const mappingText = await readFile(join(ROUND_DIR, "private-mapping.json"), "utf8")
	const fixture = JSON.parse(fixtureText)
	const sidecar = JSON.parse(sidecarText)
	const mapping = JSON.parse(mappingText)

	// The pusher absolutises the repo-relative paths before POST; do exactly that and no more.
	assert.equal(fixture.imagePathsRelativeTo, "repo-root")
	const pushed = {
		...fixture,
		items: fixture.items.map((item: { imagePath: string }) => ({
			...item,
			imagePath: join(REPO_ROOT, item.imagePath),
		})),
	}
	const parsed = parseCalibrationBatch(pushed)
	/**
	 * W11b: the round was RESTAGED after this check was first written, and the batch id changed with
	 * it — `p6-round-1` was the retired staging's id and is exactly the defect that retired it (the
	 * round name is served in every `/media/<batch>/<item>` URL). The restaged fixture carries the
	 * tool's content-derived `cal-<hex>` placeholder, which the installer overwrites at push. So the
	 * assertion is no longer "it equals a literal" — it is "it is the placeholder ROUND.md declares,
	 * and it names nothing".
	 */
	const declaredBatchId = readFileSync(join(ROUND_DIR, "ROUND.md"), "utf8").match(
		/\*\*Batch id:?[^*]*\*\*[^`]*`([^`]+)`/,
	)?.[1]
	assert.equal(parsed.batchId, declaredBatchId, "the fixture's batch id is not the one ROUND.md declares")
	assert.match(parsed.batchId, /^cal-[0-9a-f]{8}$/, "the batch id is not the tool's neutral placeholder")
	assert.equal(parsed.purpose, "calibration")
	assert.equal(parsed.items.length, 6)

	// --- the verifier's own blindness scan --------------------------------------------------
	// Not `stage-round.ts`'s: that is the tool that wrote these files.
	const identityStrings = [
		"p6-figureground",
		"p6-figureground-0.1.0",
		mapping.run.runId,
		mapping.run.codeVersion,
		mapping.run.setHash,
		mapping.run.candidatePath,
		mapping.run.file,
		"devloop",
		"private-mapping",
	]
	const leaks: string[] = []
	for (const needle of identityStrings) {
		if (typeof needle === "string" && needle.length > 0 && sidecarText.includes(needle)) {
			leaks.push(`side-car contains ${JSON.stringify(needle)}`)
		}
	}
	for (const item of mapping.items) {
		if (sidecarText.includes(item.imagePath)) leaks.push(`side-car contains cover ${item.imagePath}`)
		if (sidecarText.includes(item.inputContentHash)) leaks.push(`side-car contains content hash`)
		if (sidecarText.includes(item.paletteHash)) leaks.push(`side-car contains palette hash`)
		if (sidecarText.includes(item.variantId)) leaks.push(`side-car contains variantId`)
	}
	// The fixture may name the candidate exactly once per item, as `fingerprint.algorithmVersion` —
	// stage-round.ts documents that as a deviation. Anything else is a leak.
	const fixtureCandidateHits = fixtureText.split("p6-figureground-0.1.0").length - 1
	assert.equal(
		fixtureCandidateHits,
		fixture.items.length,
		"the fixture names the candidate somewhere other than fingerprint.algorithmVersion",
	)
	for (const item of fixture.items) {
		assert.equal(item.fingerprint.algorithmVersion, "p6-figureground-0.1.0")
		assert.ok(!String(item.variantId).includes("figureground"), "variantId names the arm")
	}
	assert.ok(!fixtureText.includes(mapping.run.runId), "the fixture names the run id")
	assert.ok(!fixtureText.includes(mapping.run.codeVersion), "the fixture names the code version")
	assert.ok(!fixtureText.includes("private-mapping"), "the fixture points at the de-blinding join")
	assert.ok(!sidecarText.includes("private-mapping"), "the side-car points at the de-blinding join")

	// What the ROUND SERVER would actually serve: only allowlisted item fields survive. The side-car
	// is a separate static file, keyed by `questionKey`, so the join key it carries must be a field
	// the payload also carries — and it must carry nothing else that identifies anything.
	const sidecarKeys = new Set<string>()
	for (const item of sidecar.items) for (const key of Object.keys(item)) sidecarKeys.add(key)
	assert.deepEqual([...sidecarKeys].sort(), ["questionKey", "side"])
	const sideKeys = new Set<string>()
	for (const item of sidecar.items) for (const key of Object.keys(item.side)) sideKeys.add(key)
	assert.deepEqual(
		[...sideKeys].sort(),
		["accentCollapsed", "fieldCss", "gradient", "roles", "surfaceCollapsed"],
		"the side-car carries a field beyond the served render shape",
	)
	assert.ok(
		(ITEM_FIELD_ALLOWLIST as readonly string[]).includes("questionKey"),
		"the side-car's join key is not a field the round page is served",
	)

	/**
	 * W11b — the scan the retirement was about, which the check above still did not perform.
	 *
	 * The predecessor's `identityStrings` list scans for the CANDIDATE's tokens (`p6-figureground`,
	 * the run id, the code version). That is the scan that already passed on the *retired* staging:
	 * its item ids were `p6-round-1-NN-<hash>`, which contains none of those strings. What retired it
	 * was the ROUND NAME's tokens, and nothing here looked for them.
	 *
	 * So: rebuild what `server.ts` would actually serve a blinded round page, from the allowlist
	 * rather than from `stage-round.ts`, and scan every served string. Per `round-kit.ts` the page
	 * sees `token`/`media`/`itemRef` built from an OPAQUE PER-BATCH TOKEN (so the fixture's item id
	 * cannot reach them) but it also sees `questionKey` VERBATIM — and in this fixture `questionKey`
	 * IS the item id. That is the channel the retired staging leaked through, and the only one under
	 * this prototype's control.
	 */
	const roundNameTokens = ["p6", "round", "figureground", "figure-ground", "devloop", "p6-round-1"]
	const OPAQUE = "tok0000000000000000"
	const servedStrings: Array<[string, string]> = [["batchId", parsed.batchId]]
	for (const item of fixture.items) {
		// Exactly the allowlisted, page-visible strings this payload determines.
		servedStrings.push([`questionKey(${item.itemId})`, item.itemId])
		servedStrings.push([`media(${item.itemId})`, `/media/${parsed.batchId}/${OPAQUE}`])
		servedStrings.push([`itemRef(${item.itemId})`, `${parsed.batchId}/${OPAQUE}`])
	}
	for (const item of sidecar.items) servedStrings.push([`sidecar.questionKey`, item.questionKey])
	const tokenLeaks: string[] = []
	for (const [where, value] of servedStrings) {
		// Word-ish boundaries: `background`/`foreground` legitimately contain "round", and a substring
		// scan that flagged them is the reason a real scan was never written.
		for (const token of roundNameTokens) {
			const boundary = new RegExp(`(^|[^a-z0-9])${token.replace(/-/g, "\\-")}($|[^a-z0-9])`, "i")
			if (boundary.test(value)) tokenLeaks.push(`${where} = ${JSON.stringify(value)} carries ${token}`)
		}
	}
	for (const finding of tokenLeaks) process.stderr.write(`  [verifier] ROUND-NAME LEAK ${finding}\n`)
	assert.deepEqual(tokenLeaks, [], "a served string carries a round-name or prototype token")
	process.stderr.write(
		`  [verifier] served-surface scan: ${servedStrings.length} strings, ` +
			`${roundNameTokens.length} tokens, 0 leaks; batchId ${parsed.batchId}\n`,
	)

	for (const finding of leaks) process.stderr.write(`  [verifier] LEAK ${finding}\n`)
	assert.deepEqual(leaks, [])

	// Every fixture item must be joinable through the private mapping, and the mapping must not be
	// reachable from either payload.
	const byItem = new Map(mapping.items.map((item: { itemId: string }) => [item.itemId, item]))
	for (const item of fixture.items) {
		assert.ok(byItem.has(item.itemId), `no private mapping row for ${item.itemId}`)
	}
	assert.equal(mapping.items.length, fixture.items.length)
	const questionKeys = sidecar.items.map((item: { questionKey: string }) => item.questionKey).sort()
	assert.deepEqual(
		questionKeys,
		fixture.items.map((item: { itemId: string }) => item.itemId).sort(),
		"the side-car and the fixture disagree about which items exist",
	)
})

// =============================================================================================
// CHECK 4 — same file ⇒ byte-identical palette, in separate processes
// =============================================================================================

/**
 * The three covers the brief names: one healthy, one dead-coincidence, one dark.
 *
 * W11b — provenance, because these labels were unsourced and re-deriving them found a trap. They
 * come from `second-palettes.md` §"Census" table, which carries TWO index columns: `demo #` and
 * `set #`. The dev-loop run's per-row `index` is the **set #**, NOT the demo # the surrounding prose
 * quotes. Reading the run's index as a demo # makes the census list look wrong (set 9 measures
 * 3.67e-4, below the 1e-3 threshold, yet "9" is absent from the prose's list of covers below it) —
 * it is not: set 9 IS demo 10, which the list does name. Each label below was re-measured with
 * `tools/first-palettes.ts --probe --brief` and matches the table exactly:
 *
 *   - `…00000133…` = set 2 = demo 2, 604 triples, max coincidence 1.00e+00 (healthy)
 *   - `…1448e1c8…` = set 9 = demo 10, 8 887 triples, max coincidence 3.67e-04 (dead, 0 triples >1e-3)
 *   - `…1ecff3d9…` = set 12 = demo 14, 256 triples, max coincidence 3.09e-07 (dark — 256 distinct
 *     triples because the cover is greyscale; its published palette is #2f2f2f/#242424/#070707/#171717)
 */
const DETERMINISM_COVERS: ReadonlyArray<{ label: string; path: string }> = [
	{ label: "healthy (max coincidence 1.0)", path: "00/ab67616d00001e02000001335fe604d859a69094.jpg" },
	{
		label: "dead coincidence (3.67e-4)",
		path: "00/ab67616d00001e0200001448e1c8dadd225466f4.jpg",
	},
	{ label: "dark (bg #2f2f2f)", path: "00/ab67616d00001e0200001ecff3d9ec20cac4b472.jpg" },
]

test(
	"CHECK 4 — two separate processes publish a byte-identical palette for the same file",
	{ skip: HEAVY ? false : "set P6_VERIFY_HEAVY=1" },
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "p6-verify-det-"))
		try {
			const script = join(dir, "one-palette.mjs")
			await writeFile(
				script,
				[
					`const { paletteOf } = await import(${JSON.stringify(join(PROTOTYPE, "src/candidate.ts"))})`,
					`const palette = await paletteOf(process.argv[2])`,
					`process.stdout.write(JSON.stringify(palette))`,
					"",
				].join("\n"),
			)
			for (const cover of DETERMINISM_COVERS) {
				const absolute = join(REPO_ROOT, cover.path)
				const runOnce = async (): Promise<string> => {
					const { stdout } = await execFileAsync(
						process.execPath,
						["--experimental-strip-types", "--no-warnings", script, absolute],
						{ cwd: V3, maxBuffer: 32 * 1024 * 1024 },
					)
					return stdout
				}
				const first = await runOnce()
				const second = await runOnce()
				const differing: string[] = []
				if (first !== second) {
					const a = JSON.parse(first)
					const b = JSON.parse(second)
					const walk = (left: unknown, right: unknown, path: string): void => {
						if (JSON.stringify(left) === JSON.stringify(right)) return
						if (
							typeof left === "object" && left !== null && typeof right === "object" &&
							right !== null
						) {
							const keys = new Set([...Object.keys(left), ...Object.keys(right)])
							for (const key of keys) {
								walk(
									(left as Record<string, unknown>)[key],
									(right as Record<string, unknown>)[key],
									path === "" ? key : `${path}.${key}`,
								)
							}
							return
						}
						differing.push(`${path}: ${JSON.stringify(left)} ≠ ${JSON.stringify(right)}`)
					}
					walk(a, b, "")
				}
				process.stderr.write(
					`  [verifier] ${cover.label}: ${
						first === second ? "byte-identical" : `DIFFERS at ${differing.join("; ")}`
					} (${createHash("sha256").update(first).digest("hex").slice(0, 12)})\n`,
				)
				assert.equal(first, second, `${cover.label}: differing fields ${differing.join("; ")}`)
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	},
)

// =============================================================================================
// CHECK 5 — the energy breakdown is faithful
// =============================================================================================

test(
	"CHECK 5 — every term of the winning tuple re-derives from raw lattice reads",
	{ skip: HEAVY ? false : "set P6_VERIFY_HEAVY=1" },
	async () => {
		const cover = join(REPO_ROOT, "00/ab67616d00001e02000001335fe604d859a69094.jpg")
		const substrate = await buildSubstrate(cover)
		const lattice = buildLattice(substrate)
		const rates = DEFAULT_EXCHANGE_RATES
		const hypotheses = buildFieldHypotheses(substrate, lattice, rates)
		const solution = solveWithDiagnostics(substrate, lattice, hypotheses, rates).solution
		const terms = solution.energy.terms

		const stats = lattice.triples.map((triple) => lattice.statsAt(triple.lab))
		const scales = computeFitnessScales(stats, rates)
		const field = solution.field.stops.map((stop) => stop.triple.lab)
		const statsOf = (triple: DistinctTriple): CandidateStats => lattice.statsAt(triple.lab)
		const unary = (role: "background" | "surface" | "foreground" | "accent", triple: DistinctTriple) =>
			unaryCost(role, statsOf(triple), field, scales, rates)

		const background = unary("background", solution.background)
		const surface = unary("surface", solution.surface)
		const foreground = unary("foreground", solution.foreground)
		const accent = unary("accent", solution.accent)

		const quadrature = buildCoverageQuadrature(
			lattice.triples,
			substrate.planes.width * substrate.planes.height,
		)
		const publishedLabs: OkLab[] = [solution.background.lab, solution.surface.lab, solution.foreground.lab]
		if (!solution.accentCollapsed) publishedLabs.push(solution.accent.lab)
		if (solution.field.kind === "gradient" && !solution.surfaceCollapsed) {
			for (const stop of solution.field.stops) publishedLabs.push(stop.triple.lab)
		}
		const coverage = rates.coverage *
			coverageCost(quadrature, fixedCoverageDistances(quadrature, publishedLabs), [])

		const expected: Record<string, number> = {
			"field.descriptionLength": solution.field.descriptionLength,
			"unary.background": background.total,
			"unary.surface": surface.total,
			"unary.foreground": foreground.total,
			"unary.accent": accent.total,
			"belonging.background": background.belonging + background.representativeness,
			"belonging.foreground": foreground.belonging + foreground.representativeness,
			"belonging.accent": solution.accentCollapsed
				? 0
				: accent.belonging + accent.representativeness,
			"collapse.surface": solution.surfaceCollapsed ? rates.collapse : 0,
			"collapse.accent": solution.accentCollapsed ? rates.collapse : 0,
			coverage,
			total: solution.energy.total,
		}

		const lines: string[] = []
		let worst = 0
		for (const [key, value] of Object.entries(expected)) {
			const delta = Math.abs((terms[key] ?? Number.NaN) - value)
			worst = Math.max(worst, delta)
			lines.push(`${key}: shipped ${terms[key]} re-derived ${value} Δ ${delta}`)
		}
		for (const line of lines) process.stderr.write(`  [verifier] term ${line}\n`)
		assert.deepEqual(
			Object.keys(terms).sort(),
			Object.keys(expected).sort(),
			"the shipped breakdown's key set is not the one this check re-derived",
		)
		assert.ok(worst < 1e-9, `worst per-term delta ${worst}`)

		// The additive identity, stated in the two forms that differ. `belonging.*` are components of
		// the `unary.*` they sit beside, and `total` is a key of the map, so the naive sum over
		// `Object.values(terms)` is NOT the total — it double-counts.
		const additive = [
			"field.descriptionLength",
			"unary.background",
			"unary.surface",
			"unary.foreground",
			"unary.accent",
			"collapse.surface",
			"collapse.accent",
			"coverage",
		]
		const additiveSum = additive.reduce((sum, key) => sum + terms[key], 0)
		const naiveSum = Object.entries(terms).filter(([key]) => key !== "total").reduce(
			(sum, [, value]) => sum + value,
			0,
		)
		process.stderr.write(
			`  [verifier] additive-subset sum ${additiveSum} vs total ${solution.energy.total} ` +
				`(Δ ${Math.abs(additiveSum - solution.energy.total)}); naive sum over all non-total keys ` +
				`${naiveSum} (Δ ${Math.abs(naiveSum - solution.energy.total)})\n`,
		)
		assert.ok(
			Math.abs(additiveSum - solution.energy.total) < 1e-9,
			`the additive subset does not sum to the total (Δ ${
				Math.abs(additiveSum - solution.energy.total)
			})`,
		)
	},
)

// =============================================================================================
// CHECK 6 — the staged round is reproducible
// =============================================================================================

/**
 * W11b — CHECK 6b's evidence, collected during CHECK 6 so no second staging is needed.
 *
 * `stage-round.ts` emits a `## Staging checks` list: the tool's own record of what it verified at
 * staging time. The orchestrator is told to fill in this file's TODOs, and adding prose is expected.
 * DELETING an emitted attestation is not — it makes the round document claim less than the tool
 * actually checked, and a reader cannot tell a check that was never run from one edited away.
 */
const droppedRoundMdLines: string[] = []

/**
 * Scoped to the `## Staging checks` section on purpose. Elsewhere in `ROUND.md` the orchestrator is
 * *told* to rewrite (the TODOs, the header), so a diff there is the documented workflow and judging
 * it would mean judging prose. Inside `## Staging checks` there is nothing to fill in: every line
 * the tool put there is an assertion the tool made about THIS staging, so the section either
 * survives verbatim or the document has stopped being the tool's record.
 */
function emittedBulletsMissingFrom(fresh: string, committed: string): string[] {
	const section = (text: string): string[] => {
		const all = text.split("\n").map((line) => line.trim())
		const start = all.indexOf("## Staging checks")
		if (start < 0) return []
		const rest = all.slice(start + 1)
		const end = rest.findIndex((line) => line.startsWith("## "))
		return (end < 0 ? rest : rest.slice(0, end)).filter((line) => line.startsWith("-"))
	}
	const committedSet = new Set(section(committed))
	return section(fresh).filter((line) => !committedSet.has(line))
}

test("CHECK 6 — re-staging round 1 reproduces the committed directory", async () => {
	const dir = await mkdtemp(join(tmpdir(), "p6-verify-round-"))
	try {
		const purpose = readFileSync(join(ROUND_DIR, "ROUND.md"), "utf8")
			.split("\n")
			.find((line) => line.startsWith("- **Purpose:**"))!
			.replace("- **Purpose:** ", "")
		/**
		 * W11b: the predecessor's invocation omitted the retirement-continuity arguments, so it was
		 * re-staging a DIFFERENT round than the committed one and its `private-mapping.json` mismatch
		 * was an artefact of the harness, not a finding. The orchestrator's real arguments are
		 * recoverable from the artifact itself: `private-mapping.json`'s `provenance` block is written
		 * only from `--supersedes` / `--superseded-item-ids` (stage-round.ts omits the whole block
		 * when neither is passed), so it reproduces them exactly.
		 */
		const provenance = JSON.parse(readFileSync(join(ROUND_DIR, "private-mapping.json"), "utf8"))
			.provenance as { supersedesRecord: string | null; supersededItemIds: Record<string, string> }
		const supersededPairs = Object.entries(provenance.supersededItemIds ?? {})
			.map(([old, current]) => `${old}=${current}`)
			.join(",")
		await execFileAsync(
			process.execPath,
			[
				"--experimental-strip-types",
				"--no-warnings",
				join(PROTOTYPE, "tools/stage-round.ts"),
				"--run",
				join(V3, ROUND_RUN),
				"--covers",
				"5,4,3,2,1,0",
				"--name",
				"p6-round-1",
				"--purpose",
				purpose,
				...(provenance.supersedesRecord === null
					? []
					: ["--supersedes", provenance.supersedesRecord]),
				...(supersededPairs === "" ? [] : ["--superseded-item-ids", supersededPairs]),
				"--out",
				dir,
			],
			{ cwd: V3, maxBuffer: 8 * 1024 * 1024 },
		)
		const staged = join(dir, "p6-round-1")
		const names = (await readdir(staged)).sort()
		assert.deepEqual(names, (await readdir(ROUND_DIR)).sort())

		/**
		 * The tool documents exactly one environment-dependent input: `gitCommit`/`dirty`, "read from
		 * the working tree, which is *state* and not time". Those two values appear in
		 * `fixture.json`'s per-item `fingerprint` and in `private-mapping.json`'s `stagedFrom`. Every
		 * other byte must match, and any difference outside those keys is a finding.
		 */
		const findings: string[] = []
		for (const name of names) {
			const fresh = await readFile(join(staged, name), "utf8")
			const committed = await readFile(join(ROUND_DIR, name), "utf8")
			if (fresh === committed) continue
			if (name.endsWith(".json")) {
				const a = JSON.parse(fresh)
				const b = JSON.parse(committed)
				const mask = (value: unknown): unknown => {
					if (Array.isArray(value)) return value.map(mask)
					if (typeof value === "object" && value !== null) {
						const out: Record<string, unknown> = {}
						for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
							out[key] = key === "gitCommit" || key === "dirty" ? "<git state>" : mask(entry)
						}
						return out
					}
					return value
				}
				if (JSON.stringify(mask(a)) === JSON.stringify(mask(b))) {
					findings.push(`${name}: differs ONLY in documented git state`)
					continue
				}
			}
			/**
			 * W11b — `ROUND.md` is the one file the tool documents as NOT byte-final: it emits TODO
			 * placeholders and tells the orchestrator to "fill in fundedBy and every TODO in ROUND.md".
			 * So a diff here is expected, and byte-equality is the wrong assertion. The right one is
			 * directional: the orchestrator may ADD prose, but a staging-check attestation the tool
			 * EMITTED must not silently DISAPPEAR — those lines are the tool's record of what it
			 * actually verified, and a hand-edit that drops one makes the round claim less than it
			 * checked (or, worse, lets a reader think a check was performed that was not).
			 */
			if (name === "ROUND.md") {
				// The one file the tool documents as NOT byte-final. Its drift is characterised by
				// CHECK 6b below, which is a claim about the committed artifact rather than about the
				// tool's determinism — keep the two verdicts apart so a red 6b cannot be misread as a
				// non-reproducible staging tool.
				droppedRoundMdLines.push(...emittedBulletsMissingFrom(fresh, committed))
				findings.push(`${name}: hand-filled after staging (documented by the tool)`)
				continue
			}
			findings.push(`${name}: DIFFERS beyond the documented git state`)
		}
		for (const finding of findings) process.stderr.write(`  [verifier] restage ${finding}\n`)
		assert.deepEqual(
			findings.filter((finding) => finding.includes("beyond")),
			[],
			"an undocumented difference between the committed round and a fresh staging",
		)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test("CHECK 6b — the committed ROUND.md keeps every staging attestation the tool emitted", () => {
	for (const line of droppedRoundMdLines) {
		process.stderr.write(`  [verifier] ROUND.md DROPPED: ${line}\n`)
	}
	assert.deepEqual(
		droppedRoundMdLines,
		[],
		"the committed ROUND.md's `## Staging checks` section drops a line the tool emitted",
	)
})

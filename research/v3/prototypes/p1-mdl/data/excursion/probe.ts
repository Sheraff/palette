/**
 * # Excursion probe — do A′'s three emitted 2-stop ramps stay on the artwork?
 *
 *     cd research/v3
 *     node --experimental-strip-types prototypes/p1-mdl/data/excursion/probe.ts
 *
 * `DESIGN.md` item 13, as corrected on 2026-08-05 by the reviewer's guide-stop clarification:
 * a 2-stop ramp is only the winning shape *if no 2-stop line passes through off-artwork colours*.
 * Guide stops exist to pull the OKLab interpolation back onto the artwork; the excursion a stop
 * removes is code length it saves elsewhere, which is exactly what a λ-priced stop cost should see.
 *
 * ## What this measures, stated plainly
 *
 * For each of the three `p1ap` demo-20 rows whose `palette.gradient` is non-null:
 *
 * 1. **The rendered line.** 64 samples at `t = i/63`, coloured by
 *    `src/contract/ramp.ts:rampColorAt` — the contract's *own* interpolator, the function the
 *    whole-ramp APCA floors are evaluated through, so this probe and the contract are reading the
 *    same curve. It renders componentwise-linear OKLab (`lerpOkLab`, private to that file) and then
 *    quantises to 8 bits with `okLabToRgb`, exactly as a framebuffer would. The unquantised lerp is
 *    also recorded per sample (`rawDistance`), so gamut clipping cannot hide inside the number.
 * 2. **Off-artwork, per sample.** Over every exact image triple `c`, the OKLab distance `d(sample,c)`
 *    and the pair bar `h(sample,c) = max(bar(sample), bar(c))` — the contract's `sameColorBar` rule
 *    as `src/measure/kernel.ts:pairBandwidth` re-exports it. A sample is **OFF-ARTWORK** when
 *    `min_c d/h > 1`: no exact triple of the artwork is within its own regional same-colour bar of
 *    the rendered colour. The bar is the frozen regional one; no digit is written here.
 * 3. **Density.** The smoothed mass evaluated *at the sample point*,
 *    `m(x) = Σ_c n(c)·κ(d(x,c), h(x,c)) / N`, the same kernel, truncation and pair bandwidth as
 *    `src/measure/smoothed-mass.ts` — the arbitrary-point form of the quantity the energy reads.
 * 4. **Repair.** For a ramp with off-artwork samples: the artwork's triples within 2 bars of the
 *    sampled path, top 50 by smoothed mass, each tried as a single interior stop at the largest
 *    off-artwork span's midpoint (quantised to the 1/256 grid `STOP_POSITION_BITS` prices). Each
 *    3-stop configuration goes through `feasibility()` (contract, with image facts) and
 *    `energyOfAPrime(measurement, config, {lambda: 1})`. The delta against the emitted 2-stop
 *    configuration is the answer: **negative means the stop should have been bought.**
 *
 * Deterministic: no RNG, no clock in any decision, every loop in the triple table's canonical order.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { okLabDistance, rgbToOkLab } from "../../../../src/contract/color.ts"
import { rampColorAt } from "../../../../src/contract/ramp.ts"
import type { GradientStop, OkLab, Rgb8 } from "../../../../src/contract/types.ts"
import { colorFromRgb } from "../../../../src/contract/color.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { serializationCost } from "../../src/emit/cost.ts"
import { feasibility } from "../../src/emit/feasibility.ts"
import { ALGORITHM_VERSIONS, toPalette } from "../../src/emit/palette.ts"
import { sourceMetaOf } from "../../src/emit/source-meta.ts"
import type { Configuration } from "../../src/emit/types.ts"
import { KERNEL_TRUNCATION_BANDWIDTHS } from "../../src/measure/constants.ts"
import { measureImage } from "../../src/measure/index.ts"
import { bandwidthOf, kappa } from "../../src/measure/kernel.ts"
import type { Measurement } from "../../src/measure/types.ts"
import { imageFactsOf } from "../../src/search/image-facts.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const EMITTER_ROWS = join(HERE, "..", "emitter", "aprime-demo-20-2026-08-05.jsonl")
const RESULTS = join(HERE, "results.json")

/** Samples along the rendered line. 64 as briefed; `t_i = i/63`, so both stops are sampled exactly. */
const SAMPLE_COUNT = 64
/** How far from the sampled path a triple may sit and still be tried as a repair, in pair bars. */
const REPAIR_SEARCH_BARS = 2
/** How many of those triples are tried, ranked by smoothed mass descending. */
const REPAIR_CANDIDATES = 50
/** The interior-stop position grid `STOP_POSITION_BITS = 8` already prices. */
const POSITION_GRID = 256
/** λ, `DESIGN.md` decision 2. The emitter ran at the same value (its header records `lambda: null`). */
const LAMBDA = 1

// ---------------------------------------------------------------------------------------------
// The arbitrary-point forms of the two measurement quantities
// ---------------------------------------------------------------------------------------------

type PointReading = Readonly<{
	/** `min_c d(x,c)` over exact triples, in OKLab units. */
	nearestDistance: number
	/** The triple attaining it, as an 8-bit hex. */
	nearestHex: string
	/** `min_c d(x,c)/h(x,c)` — the bar-relative form the verdict reads. */
	nearestBarRatio: number
	/** The pair bar at the triple attaining `nearestBarRatio`. */
	barAtNearest: number
	/** `m(x)/N` — smoothed mass fraction at the point. */
	smoothedMassFraction: number
}>

function rgbOfTriple(measurement: Measurement, row: number): Rgb8 {
	const key = measurement.triples.keys[row]
	return [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]
}

function hexOf(rgb: Rgb8): string {
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/**
 * Everything this probe asks about one OKLab point, in one pass over the triple table.
 *
 * The kernel, its pair bandwidth and its truncation are the measurement layer's, imported rather
 * than restated, so "the density at the sample" is the same object the energy's generic code reads —
 * only evaluated somewhere the table has no row.
 */
function readPoint(measurement: Measurement, point: OkLab): PointReading {
	const { colorCount, counts, lab, pixelCount } = measurement.triples
	const pointBar = bandwidthOf(point)
	let nearestDistance = Number.POSITIVE_INFINITY
	let nearestRow = -1
	let nearestBarRatio = Number.POSITIVE_INFINITY
	let barAtNearest = pointBar
	let mass = 0
	for (let row = 0; row < colorCount; row += 1) {
		const base = row * 3
		const deltaL = lab[base] - point[0]
		const deltaA = lab[base + 1] - point[1]
		const deltaB = lab[base + 2] - point[2]
		const squared = deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
		const distance = Math.sqrt(squared)
		const rowBar = bandwidthOf([lab[base], lab[base + 1], lab[base + 2]])
		const bar = rowBar > pointBar ? rowBar : pointBar
		if (distance < nearestDistance) {
			nearestDistance = distance
			nearestRow = row
		}
		const ratio = distance / bar
		if (ratio < nearestBarRatio) {
			nearestBarRatio = ratio
			barAtNearest = bar
		}
		// The kernel's definitional cutoff, applied at the pair bandwidth exactly as both smoothed-mass
		// paths apply it.
		if (distance < KERNEL_TRUNCATION_BANDWIDTHS * bar) mass += counts[row] * kappa(distance, bar)
	}
	return {
		nearestDistance,
		nearestHex: nearestRow < 0 ? "#000000" : hexOf(rgbOfTriple(measurement, nearestRow)),
		nearestBarRatio,
		barAtNearest,
		smoothedMassFraction: pixelCount === 0 ? 0 : mass / pixelCount,
	}
}

// ---------------------------------------------------------------------------------------------
// The ramp
// ---------------------------------------------------------------------------------------------

type Sample = Readonly<{
	t: number
	/** The colour the contract renders there, 8-bit. */
	hex: string
	/** `nearest*` and the density at the rendered colour. */
	reading: PointReading
	/** Distance to the nearest triple from the *unquantised* lerp, to expose gamut clipping. */
	rawDistance: number
	offArtwork: boolean
}>

function stopsOf(config: Configuration): GradientStop[] {
	return config.stops.map((stop) => ({ color: colorFromRgb(stop.rgb), position: stop.position }))
}

function lerpOkLab(first: OkLab, second: OkLab, u: number): OkLab {
	return [
		first[0] + (second[0] - first[0]) * u,
		first[1] + (second[1] - first[1]) * u,
		first[2] + (second[2] - first[2]) * u,
	]
}

/** The unquantised path through the stops — what `rampColorAt` renders before `okLabToRgb`. */
function pathAt(config: Configuration, t: number): OkLab {
	const points = config.stops.map((stop) => ({ position: stop.position, lab: rgbToOkLab(stop.rgb) }))
	const last = points.length - 1
	if (t <= points[0].position) return points[0].lab
	if (t >= points[last].position) return points[last].lab
	let segment = 0
	while (segment < last - 1 && t >= points[segment + 1].position) segment += 1
	const from = points[segment]
	const to = points[segment + 1]
	const span = to.position - from.position
	if (!(span > 0)) return to.lab
	return lerpOkLab(from.lab, to.lab, (t - from.position) / span)
}

function sampleLine(measurement: Measurement, config: Configuration): Sample[] {
	const stops = stopsOf(config)
	const samples: Sample[] = []
	for (let index = 0; index < SAMPLE_COUNT; index += 1) {
		const t = index / (SAMPLE_COUNT - 1)
		const rgb = rampColorAt(stops, t)
		const rendered = rgbToOkLab(rgb)
		const reading = readPoint(measurement, rendered)
		const raw = readPoint(measurement, pathAt(config, t))
		samples.push({
			t,
			hex: hexOf(rgb),
			reading,
			rawDistance: raw.nearestDistance,
			offArtwork: reading.nearestBarRatio > 1,
		})
	}
	return samples
}

type Span = Readonly<{ fromT: number; toT: number; count: number; midT: number }>

/** The longest run of consecutive off-artwork samples, as a t-interval. Empty when there is none. */
function largestOffSpan(samples: readonly Sample[]): Span | null {
	let best: Span | null = null
	let runStart = -1
	for (let index = 0; index <= samples.length; index += 1) {
		const off = index < samples.length && samples[index].offArtwork
		if (off && runStart < 0) runStart = index
		if (!off && runStart >= 0) {
			const from = samples[runStart].t
			const to = samples[index - 1].t
			const count = index - runStart
			if (best === null || count > best.count) {
				best = { fromT: from, toT: to, count, midT: (from + to) / 2 }
			}
			runStart = -1
		}
	}
	return best
}

function summariseSamples(samples: readonly Sample[]) {
	let maxDistance = 0
	let sumDistance = 0
	let maxRatio = 0
	let offCount = 0
	let minDensity = Number.POSITIVE_INFINITY
	for (const sample of samples) {
		maxDistance = Math.max(maxDistance, sample.reading.nearestDistance)
		sumDistance += sample.reading.nearestDistance
		maxRatio = Math.max(maxRatio, sample.reading.nearestBarRatio)
		if (sample.offArtwork) offCount += 1
		minDensity = Math.min(minDensity, sample.reading.smoothedMassFraction)
	}
	return {
		maxNearestDistance: maxDistance,
		meanNearestDistance: sumDistance / samples.length,
		maxBarRatio: maxRatio,
		offArtworkSamples: offCount,
		sampleCount: samples.length,
		minSmoothedMassFraction: minDensity,
	}
}

// ---------------------------------------------------------------------------------------------
// The repair
// ---------------------------------------------------------------------------------------------

/** Position on the 1/256 grid, kept strictly inside (0,1) so invariant 1's ordering still holds. */
function quantisePosition(t: number): number {
	const step = Math.round(t * POSITION_GRID)
	return Math.min(POSITION_GRID - 1, Math.max(1, step)) / POSITION_GRID
}

/**
 * Triples within `REPAIR_SEARCH_BARS` pair bars of the path **at the repair position**, top-N by
 * smoothed mass.
 *
 * Local to the position on purpose. A repairing guide stop's whole job is to pull the line back onto
 * the artwork *there*; a triple that sits near some other part of the line repairs nothing, and
 * ranking the whole line's neighbourhood by mass just returns the two field colours (measured: it
 * does, and every such candidate then fails `I3.pair-not-distinct` against a stop or an ink).
 * An empty return is the honest reading of "no repairing triple exists".
 */
function repairCandidates(measurement: Measurement, target: OkLab): number[] {
	const { colorCount, lab } = measurement.triples
	const smoothed = measurement.smoothedMass.mass
	const targetBar = bandwidthOf(target)
	const near: number[] = []
	for (let row = 0; row < colorCount; row += 1) {
		const base = row * 3
		const rowLab: OkLab = [lab[base], lab[base + 1], lab[base + 2]]
		const bar = Math.max(bandwidthOf(rowLab), targetBar)
		if (okLabDistance(rowLab, target) <= REPAIR_SEARCH_BARS * bar) near.push(row)
	}
	near.sort((left, right) => {
		const difference = smoothed[right] - smoothed[left]
		if (difference !== 0) return difference
		// Fixed tie-break: smoothed mass desc, then the canonical key asc (which is hex asc).
		return measurement.triples.keys[left] - measurement.triples.keys[right]
	})
	return near.slice(0, REPAIR_CANDIDATES)
}

function hexToRgbLocal(value: string): Rgb8 {
	const n = Number.parseInt(value.slice(1), 16)
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

type EmitterRow = {
	kind: string
	index: number
	imagePath: string
	palette: {
		roles: Record<string, { rgb: Rgb8; hex: string }>
		gradient: { stops: { color: { rgb: Rgb8; hex: string }; position: number }[] } | null
		collapse: { surfaceCollapsed: boolean; accentCollapsed: boolean }
		escape: unknown
	} | null
}

function configurationOf(row: EmitterRow): Configuration {
	const palette = row.palette as NonNullable<EmitterRow["palette"]>
	const gradient = palette.gradient as NonNullable<typeof palette.gradient>
	return {
		background: palette.roles.background.rgb,
		surface: palette.roles.surface.rgb,
		foreground: palette.roles.foreground.rgb,
		accent: palette.roles.accent.rgb,
		gradient: true,
		stops: gradient.stops.map((stop) => ({ rgb: stop.color.rgb, position: stop.position })),
		surfaceCollapsed: palette.collapse.surfaceCollapsed,
		accentCollapsed: palette.collapse.accentCollapsed,
		escape: null,
	}
}

async function main(): Promise<void> {
	const rows = readFileSync(EMITTER_ROWS, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as EmitterRow)
		.filter((row) => row.kind === "p1-emitter-row" && row.palette !== null && row.palette.gradient !== null)

	const ramps: unknown[] = []
	for (const row of rows) {
		const config = configurationOf(row)
		const measurement = await measureImage(row.imagePath)
		const facts = imageFactsOf(measurement)
		const meta = await sourceMetaOf(row.imagePath, ALGORITHM_VERSIONS.p1ap)

		const samples = sampleLine(measurement, config)
		const summary = summariseSamples(samples)
		const span = largestOffSpan(samples)

		const baseEnergy = energyOfAPrime(measurement, config, { lambda: LAMBDA })
		const baseFeasible = feasibility(toPalette(config, meta), facts).valid

		// The brief's step 3 fires on off-artwork samples. When a ramp has none there is still a
		// question worth an answer — *would* the energy have bought a repairing stop? — so the same
		// machinery runs as a **control** at the ramp's worst sample, and says so in `mode`. Without it
		// the second half of item 13 ("and the energy still refuses the repairing stop") would be
		// untested on every ramp, and the repair code itself unexercised.
		const worstIndex = samples.reduce(
			(best, sample, index) =>
				sample.reading.nearestBarRatio > samples[best].reading.nearestBarRatio ? index : best,
			0,
		)
		const mode = span === null ? "control" : "repair"
		const midT = span === null ? samples[worstIndex].t : span.midT

		let repair: unknown = null
		{
			const position = quantisePosition(midT)
			const target = rgbToOkLab(rampColorAt(stopsOf(config), position))
			const candidates = repairCandidates(measurement, target)
			const tried: {
				hex: string
				smoothedMassFraction: number
				feasible: boolean
				violations: string[]
				energyTotal: number
				delta: number
				offArtworkAfter: number
				maxDistanceAfter: number
			}[] = []
			for (const row3 of candidates) {
				const rgb = rgbOfTriple(measurement, row3)
				const config3: Configuration = {
					...config,
					stops: [config.stops[0], { rgb, position }, config.stops[config.stops.length - 1]],
				}
				const report = feasibility(toPalette(config3, meta), facts)
				const energy = energyOfAPrime(measurement, config3, { lambda: LAMBDA })
				const after = summariseSamples(sampleLine(measurement, config3))
				tried.push({
					hex: hexOf(rgb),
					smoothedMassFraction: measurement.smoothedMass.massFraction[row3],
					feasible: report.valid,
					violations: report.violations.map((violation) => violation.code),
					energyTotal: energy.total,
					delta: energy.total - baseEnergy.total,
					offArtworkAfter: after.offArtworkSamples,
					maxDistanceAfter: after.maxNearestDistance,
				})
			}
			// Ranked by energy delta ascending — the stop the objective would actually have bought.
			const feasibleTried = tried.filter((entry) => entry.feasible)
			feasibleTried.sort((left, right) => left.delta - right.delta)
			const cleanest = [...feasibleTried].sort(
				(left, right) => left.offArtworkAfter - right.offArtworkAfter || left.delta - right.delta,
			)
			repair = {
				mode,
				atSampleT: midT,
				position,
				targetHex: hexOf(rampColorAt(stopsOf(config), position)),
				candidatesConsidered: candidates.length,
				feasibleCount: feasibleTried.length,
				/** The 3-stop the energy prefers among the feasible repairs. */
				bestByEnergy: feasibleTried[0] ?? null,
				/** The 3-stop that removes the most excursion, whatever it costs. */
				bestByExcursion: cleanest[0] ?? null,
				interiorStopBits: serializationCost({
					...config,
					stops: [config.stops[0], { rgb: config.stops[0].rgb, position }, config.stops[1]],
				}).bits - serializationCost(config).bits,
				tried,
			}
		}

		ramps.push({
			index: row.index,
			imagePath: row.imagePath,
			image: row.imagePath.split("/").pop(),
			stops: config.stops.map((stop) => ({ hex: hexOf(stop.rgb), position: stop.position })),
			pixelCount: measurement.triples.pixelCount,
			colorCount: measurement.triples.colorCount,
			smoothedMassMode: measurement.smoothedMass.mode,
			emitted: {
				energyTotal: baseEnergy.total,
				serializationBits: baseEnergy.nuisance.serializationBits,
				rampGeometry: baseEnergy.nuisance.rampGeometry,
				rampOrientation: baseEnergy.nuisance.rampOrientation,
				feasible: baseFeasible,
			},
			summary,
			largestOffArtworkSpan: span,
			repair,
			samples,
		})
	}

	mkdirSync(HERE, { recursive: true })
	writeFileSync(
		RESULTS,
		`${JSON.stringify(
			{
				what: "Excursion probe on arm A′'s three emitted 2-stop ramps (DESIGN.md item 13, corrected reading)",
				asOf: "2026-08-05",
				source: EMITTER_ROWS,
				method: {
					interpolator: "src/contract/ramp.ts:rampColorAt (componentwise-linear OKLab, 8-bit quantised via okLabToRgb) — the contract's own rendered-ramp function",
					sampleCount: SAMPLE_COUNT,
					offArtworkRule: "min over exact triples of d_OKLab(sample, triple) / pairBar(sample, triple) > 1; pairBar is src/measure/kernel.ts:pairBandwidth, the frozen regional same-colour bar",
					density: "smoothed mass of src/measure/smoothed-mass.ts evaluated at the sample point (same kernel, same truncation, same pair bandwidth)",
					repair: `top-${REPAIR_CANDIDATES} triples by smoothed mass within ${REPAIR_SEARCH_BARS} pair bars of the sampled path, each tried as a single interior stop at the largest off-artwork span's midpoint on the 1/${POSITION_GRID} grid`,
					lambda: LAMBDA,
					energy: "src/energy/aprime/index.ts:energyOfAPrime",
				},
				ramps,
			},
			null,
			"\t",
		)}\n`,
	)

	for (const ramp of ramps as any[]) {
		process.stdout.write(
			`${ramp.image} max=${ramp.summary.maxNearestDistance.toFixed(5)} mean=${ramp.summary.meanNearestDistance.toFixed(5)} maxRatio=${ramp.summary.maxBarRatio.toFixed(3)} off=${ramp.summary.offArtworkSamples}/${ramp.summary.sampleCount}${
				ramp.largestOffArtworkSpan === null
					? ""
					: ` span=[${ramp.largestOffArtworkSpan.fromT.toFixed(4)},${ramp.largestOffArtworkSpan.toT.toFixed(4)}]`
			}${
				ramp.repair?.bestByEnergy
					? ` ${ramp.repair.mode}@t=${ramp.repair.position} ${ramp.repair.feasibleCount}/${ramp.repair.candidatesConsidered} feasible best=${ramp.repair.bestByEnergy.hex} delta=${ramp.repair.bestByEnergy.delta.toFixed(2)} offAfter=${ramp.repair.bestByEnergy.offArtworkAfter} maxAfter=${ramp.repair.bestByEnergy.maxDistanceAfter.toFixed(5)}`
					: ` ${ramp.repair ? `${ramp.repair.mode}: no feasible repair among ${ramp.repair.candidatesConsidered}` : ""}`
			}\n`,
		)
	}
}

await main()

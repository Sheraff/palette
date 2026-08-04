/**
 * # The properties the energy has to have before any ordering it produces means anything
 *
 * `DESIGN.md` asks for three of them by name — the energy is *"pure, deterministic"*, it is *"a
 * function of any contract-legal palette"*, and λ is swept — and one more follows from the first
 * two: it must be **total**, i.e. finite on every configuration the type can express, or the
 * falsifier's ranking has holes in it exactly where the interesting palettes are.
 *
 * The gamut quadrature is checked here too. `constants.ts` documents `GAMUT_VOLUME_GRID` with a
 * convergence table, and a documented bound with no instrument is an assertion.
 */

import assert from "node:assert/strict"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import {
	computeSRgbGamutVolumeOkLab,
	energyOfA,
	sRgbGamutVolumeOkLab,
} from "../../src/energy/a/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import type { Configuration } from "../../src/emit/types.ts"
import {
	cleanupFixtures,
	configuration,
	readSetFile,
	resolveCorpusRoot,
	setFilePath,
	writeRgbImage,
} from "./support.ts"

after(cleanupFixtures)

const FIELD: Rgb8 = [58, 60, 68]
const SECOND: Rgb8 = [148, 146, 138]
const MID: Rgb8 = [104, 104, 104]
const VIVID: Rgb8 = [222, 48, 38]
const INK: Rgb8 = [240, 240, 236]

/** A four-colour fixture with a field, a second field colour, a vivid patch and thin strokes. */
async function fixture(name: string) {
	const path = await writeRgbImage(name, 64, 64, (x, y) => {
		if (x === 11 || x === 43) return INK
		if (x >= 8 && x < 14 && y >= 8 && y < 14) return VIVID
		return x < 32 ? FIELD : SECOND
	})
	return measureImage(path)
}

describe("(e) λ moves only the structural term, and only upwards", () => {
	it("never lowers λ·Ω as λ rises, and leaves the explanatory terms untouched", async () => {
		// The sweep `DESIGN.md` decision 2 makes mandatory. Ω is a property of the configuration alone,
		// so `structural = λ·Ω` is linear in λ with a non-negative slope: raising λ can only raise it,
		// and can only leave it alone when Ω = 0. Nothing else in the energy may see λ at all — if the
		// field or ink term moves, λ has leaked into the data term and the whole "one constant"
		// argument of arm A §4.3 is void.
		const measurement = await fixture("energy-a-lambda.png")
		const config = configuration({
			background: FIELD,
			surface: SECOND,
			foreground: INK,
			accent: VIVID,
		})

		const sweep = [0.25, 0.5, 1, 2, 4]
		const results = sweep.map((lambda) => energyOfA(measurement, config, { lambda }))

		for (let index = 1; index < results.length; index += 1) {
			assert.ok(
				results[index].terms.structural >= results[index - 1].terms.structural,
				`structural fell from λ=${sweep[index - 1]} to λ=${sweep[index]}`,
			)
			assert.equal(results[index].terms.field, results[0].terms.field)
			assert.equal(results[index].terms.ink, results[0].terms.ink)
			assert.equal(results[index].nuisance.splitScaleRung, results[0].nuisance.splitScaleRung)
		}
		// Ω = 2 here (distinct surface, distinct accent), so the structural term is exactly 2λ.
		for (let index = 0; index < sweep.length; index += 1) {
			assert.equal(results[index].terms.structural, 2 * sweep[index])
			assert.equal(results[index].nuisance.lambda, sweep[index])
		}
		// A collapsed configuration has Ω = 0, so λ cannot move it at all.
		const collapsed = configuration({ background: FIELD, foreground: INK })
		const cheap = energyOfA(measurement, collapsed, { lambda: 0.25 })
		const dear = energyOfA(measurement, collapsed, { lambda: 4 })
		assert.equal(cheap.total, dear.total)
	})
})

describe("(f) the same inputs give the same number", () => {
	it("is byte-identical across a double run, including the profile", async () => {
		const measurement = await fixture("energy-a-determinism.png")
		const config = configuration({
			background: FIELD,
			surface: SECOND,
			foreground: INK,
			accent: VIVID,
			gradient: true,
			stops: [
				{ rgb: FIELD, position: 0 },
				{ rgb: MID, position: 0.5 },
				{ rgb: SECOND, position: 1 },
			],
		})
		const first = energyOfA(measurement, config)
		const second = energyOfA(measurement, config)
		assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)))

		// A second measurement of the same file must also produce the same energy — the determinism
		// gate is on the pair, not on one memoised object.
		const remeasured = await fixture("energy-a-determinism.png")
		const third = energyOfA(remeasured, config)
		assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(third)))
	})
})

describe("the energy is total", () => {
	it("is finite on every contract-shaped configuration, including the awkward ones", async () => {
		const measurement = await fixture("energy-a-total.png")
		// Every one of these is something the `Configuration` type permits and some of which the
		// contract would reject. `DESIGN.md` requires the energy to score them anyway: legality is
		// `feasibility()`'s job, and an energy that threw on an illegal palette could not be the
		// falsifier's instrument.
		const cases: Record<string, Configuration> = {
			collapsed: configuration({ background: FIELD, foreground: INK }),
			// The legacy reconstruction shape the brief calls out by name: a mid stop at exactly 0.5.
			legacyMidStop: configuration({
				background: FIELD,
				surface: SECOND,
				foreground: INK,
				accent: VIVID,
				gradient: true,
				stops: [
					{ rgb: FIELD, position: 0 },
					{ rgb: MID, position: 0.5 },
					{ rgb: SECOND, position: 1 },
				],
			}),
			fourStops: configuration({
				background: FIELD,
				surface: SECOND,
				foreground: INK,
				accent: VIVID,
				gradient: true,
				stops: [
					{ rgb: FIELD, position: 0 },
					{ rgb: MID, position: 0.3 },
					{ rgb: VIVID, position: 0.7 },
					{ rgb: SECOND, position: 1 },
				],
			}),
			// A gradient declared with too few stops: the path falls back to the two field roles.
			gradientWithoutStops: configuration({
				background: FIELD,
				surface: SECOND,
				foreground: INK,
				gradient: true,
				stops: [],
			}),
			// Positions out of order — sorted deterministically rather than refused.
			unsortedStops: configuration({
				background: FIELD,
				surface: SECOND,
				foreground: INK,
				gradient: true,
				stops: [
					{ rgb: SECOND, position: 1 },
					{ rgb: FIELD, position: 0 },
					{ rgb: MID, position: 0.5 },
				],
			}),
			// Colours that do not occur in the image at all. Invariant 2 forbids publishing these; the
			// energy still has to price them, and prices them badly, which is the point.
			offArtwork: configuration({
				background: [1, 2, 3],
				surface: [250, 3, 250],
				foreground: [7, 250, 7],
				accent: [250, 250, 1],
			}),
			// A configuration whose collapse flags disagree with its triples: declared distinct, same
			// colour. Ω charges for the declaration; the density sees one kernel.
			declaredButIdentical: configuration({
				background: FIELD,
				surface: FIELD,
				foreground: INK,
				accent: INK,
				surfaceCollapsed: false,
				accentCollapsed: false,
			}),
		}

		for (const [name, config] of Object.entries(cases)) {
			const result = energyOfA(measurement, config)
			assert.ok(Number.isFinite(result.total), `${name} total ${result.total}`)
			let sum = 0
			for (const value of Object.values(result.terms)) {
				assert.ok(Number.isFinite(value), `${name} term ${value}`)
				sum += value
			}
			assert.ok(Math.abs(sum - result.total) < 1e-12, `${name} terms do not sum to total`)
		}

		// The escape branch. `ESCAPE_COST_NATS` is 1024 bits × ln2; the two escape configurations must
		// differ from their in-artwork twin by exactly that and by nothing else.
		const inArtwork = cases.collapsed
		const escaped: Configuration = { ...inArtwork, escape: { role: "background", color: "#ffffff" } }
		const plain = energyOfA(measurement, inArtwork)
		const withEscape = energyOfA(measurement, escaped)
		assert.equal(plain.terms.escape, 0)
		assert.ok(Math.abs(withEscape.terms.escape - 1024 * Math.LN2) < 1e-9)
		assert.ok(withEscape.total > plain.total + 700, "the escape must be a barrier, not a preference")
	})
})

describe("the residual's normalising constant", () => {
	it("is the sRGB gamut's OKLab volume, to the precision its constant claims", async () => {
		// `GAMUT_VOLUME_GRID`'s docstring quotes 0.05418657 at n = 16 and 0.05419576 at n = 64, i.e. a
		// relative gap of 1.7e-4. Recomputed here rather than trusted.
		const coarse = computeSRgbGamutVolumeOkLab(8)
		const used = sRgbGamutVolumeOkLab()
		const fine = computeSRgbGamutVolumeOkLab(48)
		assert.ok(Math.abs(used - fine) / fine < 2e-4, `used ${used} against fine ${fine}`)
		assert.ok(Math.abs(coarse - fine) / fine < 1e-3, `coarse ${coarse} against fine ${fine}`)
		// Monotone increasing under refinement: a tetrahedral decomposition of a convex-ish image cell
		// under-counts, so refining can only add volume. Stated as a property, checked as one.
		assert.ok(coarse < used && used < fine, `${coarse} < ${used} < ${fine}`)
	})
})

describe("real corpus", () => {
	it("costs a few milliseconds on a demo-20 measurement, and reports what", async (t) => {
		const corpusRoot = resolveCorpusRoot("00")
		if (corpusRoot === null) {
			t.skip("artwork shards are not present in this checkout")
			return
		}
		const paths = await readSetFile(setFilePath("demo-20.txt"))
		const measurement = await measureImage(join(corpusRoot, paths[0]))

		// Two triples of the artwork itself, taken by exact-triple mass so the configuration is a real
		// one rather than an off-artwork placeholder. This test measures cost; the orderings are the
		// other file's business.
		const ranked = Array.from({ length: measurement.triples.colorCount }, (_unused, row) => row)
			.sort((left, right) => measurement.triples.counts[right] - measurement.triples.counts[left])
		const tripleOf = (row: number): Rgb8 => [
			(measurement.triples.keys[row] >> 16) & 0xff,
			(measurement.triples.keys[row] >> 8) & 0xff,
			measurement.triples.keys[row] & 0xff,
		]
		const flat = configuration({ background: tripleOf(ranked[0]), foreground: tripleOf(ranked[1]) })
		const ramp = configuration({
			background: tripleOf(ranked[0]),
			surface: tripleOf(ranked[2]),
			foreground: tripleOf(ranked[1]),
			accent: tripleOf(ranked[3]),
			gradient: true,
			stops: [
				{ rgb: tripleOf(ranked[0]), position: 0 },
				{ rgb: tripleOf(ranked[4]), position: 0.5 },
				{ rgb: tripleOf(ranked[2]), position: 1 },
			],
		})

		for (const [name, config] of [["flat", flat], ["ramp", ramp]] as const) {
			// One untimed call first: the gamut quadrature is memoised on first use and would otherwise
			// be charged to whichever configuration ran first.
			energyOfA(measurement, config)
			const startedAt = performance.now()
			const result = energyOfA(measurement, config)
			const milliseconds = performance.now() - startedAt
			assert.ok(Number.isFinite(result.total))
			console.log(
				`  ${paths[0]}  K=${measurement.triples.colorCount}  ${name}  ` +
					`total=${result.total.toFixed(4)}  order=${result.nuisance.fieldOrder}  ` +
					`geometry=${result.nuisance.geometry}/${result.nuisance.geometryDirection}  ` +
					`s*=${result.nuisance.splitScaleRung}  ${milliseconds.toFixed(1)}ms`,
			)
		}
	})
})

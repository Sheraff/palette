/**
 * Lattice timing bench — the numbers SPEC rule 7 asks a worker to report, measured rather than
 * quoted. Not a test and not on the runtime path.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/prototypes/p6-figureground/src/lattice/bench.ts
 *
 * Proposal §5 prices, at 10⁶ pixels: splat ≈150 ms, lattice convolution ≈30 ms, distinct-triple
 * enumeration ≈20 ms. Two cases are measured, because the lattice's size is set by how much of
 * OKLab the artwork occupies: an artwork-shaped image (a field ramp, blobs, lettering) and
 * full-gamut noise, which is the worst case the design admits.
 */

import { fileURLToPath } from "node:url"

import { LATTICE_CHANNELS } from "./constants.ts"
import { chooseGeometry, convolveStack, occupiedBounds, splatField } from "./grid.ts"
import { LATTICE_BANDWIDTH, buildLattice } from "./index.ts"
import { buildNearestIndex } from "./nearest.ts"
import { fullGamutNoise, substrateFromRgb, syntheticArtwork } from "./synthetic.ts"
import { enumerateDistinctTriples } from "./triples.ts"

function milliseconds(run: () => void): number {
	const start = process.hrtime.bigint()
	run()
	return Number(process.hrtime.bigint() - start) / 1e6
}

function benchmark(name: string, rgb: Uint8Array, width: number, height: number): void {
	const substrate = substrateFromRgb(width, height, rgb)

	let table!: ReturnType<typeof enumerateDistinctTriples>
	const enumerationMs = milliseconds(() => {
		table = enumerateDistinctTriples(substrate.planes)
	})

	const bounds = occupiedBounds(substrate)
	const geometry = chooseGeometry(bounds.min, bounds.max, LATTICE_BANDWIDTH)
	let stack!: { cells: Float64Array; annulusAreaFraction: number }
	const splatMs = milliseconds(() => {
		stack = splatField(substrate, geometry, table)
	})
	const convolveMs = milliseconds(() => {
		convolveStack(stack.cells, geometry, LATTICE_BANDWIDTH)
	})
	const cells = geometry.counts[0] * geometry.counts[1] * geometry.counts[2]

	let index!: ReturnType<typeof buildNearestIndex>
	const nearestBuildMs = milliseconds(() => {
		index = buildNearestIndex(table.triples, table.keys)
	})

	const lattice = buildLattice(substrate)
	const queries = table.triples.length
	const statsMs = milliseconds(() => {
		for (let i = 0; i < queries; i++) lattice.statsAt(table.triples[i]!.lab)
	})
	const nearestQueryMs = milliseconds(() => {
		for (let i = 0; i < queries; i++) {
			const lab = table.triples[i]!.lab
			index.nearest([lab[0] + 0.01, lab[1] - 0.005, lab[2] + 0.004])
		}
	})

	const totalMs = milliseconds(() => {
		buildLattice(substrate)
	})

	const bytes = cells * LATTICE_CHANNELS * 8

	console.log(`\n=== ${name} (${width}x${height} = ${width * height} px) ===`)
	console.log(`distinct triples          ${table.triples.length}`)
	console.log(`enumeration               ${enumerationMs.toFixed(1)} ms`)
	console.log(
		`lattice ${geometry.counts.join("x")} cells=${cells} ratio=${geometry.cellsPerBandwidth} ` +
			`cell=${geometry.cell.toFixed(5)} radius=${geometry.kernelRadius}`,
	)
	console.log(`splat                     ${splatMs.toFixed(1)} ms`)
	console.log(`convolution               ${convolveMs.toFixed(1)} ms`)
	console.log(`nearest index build       ${nearestBuildMs.toFixed(1)} ms (bucket ${index.bucketWidth.toFixed(5)})`)
	console.log(`statsAt x${queries}        ${statsMs.toFixed(1)} ms (${((statsMs / queries) * 1000).toFixed(2)} µs each)`)
	console.log(
		`nearestTriple x${queries}  ${nearestQueryMs.toFixed(1)} ms (${((nearestQueryMs / queries) * 1000).toFixed(2)} µs each)`,
	)
	console.log(`buildLattice total        ${totalMs.toFixed(1)} ms`)
	console.log(`lattice footprint         ${(bytes / 1024 / 1024).toFixed(1)} MB`)
}

const size = Number(process.argv[2] ?? 1000)
benchmark("artwork-shaped", syntheticArtwork(size, size), size, size)
benchmark("full-gamut noise (worst case)", fullGamutNoise(size, size), size, size)

// Real artworks, for a number that is not synthetic. Spatially scrambled to avoid redistributing
// cover art; the colour histogram, which is what sizes the lattice, is the original's.
const sharp = (await import("sharp")).default
const directory = fileURLToPath(new URL("../../../../../../images", import.meta.url))
for (const name of ["muse-scrambled.jpg", "doja-scrambled.jpg", "artofficial-scrambled.jpg"]) {
	const { data, info } = await sharp(`${directory}/${name}`).raw().toBuffer({ resolveWithObject: true })
	const pixels = info.width * info.height
	const rgb = new Uint8Array(pixels * 3)
	for (let index = 0; index < pixels; index++) {
		rgb[index * 3] = data[index * info.channels]!
		rgb[index * 3 + 1] = data[index * info.channels + 1]!
		rgb[index * 3 + 2] = data[index * info.channels + 2]!
	}
	benchmark(`real: ${name}`, rgb, info.width, info.height)
}

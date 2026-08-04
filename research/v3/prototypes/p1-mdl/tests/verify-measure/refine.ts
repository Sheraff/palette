/**
 * VERIFIER-OWNED. The refinement-invariance claim, re-derived.
 *
 * `SMOOTHED_MASS_LATTICE_CELLS_PER_BAR`'s docstring claims the cell-centroid approximation reproduces
 * `c -> m(c)` "to under 1% uniformly" at 4 cells per bar, and that refining the lattice cannot move a
 * downstream argmin. This runs the default path and several forced lattices on the same image and
 * reports the actual movement, plus where the top-mass colour lands under each.
 */

import { measureImage } from "../../src/measure/index.ts"

const path = process.argv[2]
const settings = process.argv.slice(3).map(Number)

const base = await measureImage(path)
const runs: { label: string; mass: Float64Array; mode: string; cellSide: number | null; cells: number | null }[] = [
	{ label: `default(${base.smoothedMass.mode})`, mass: base.smoothedMass.mass, mode: base.smoothedMass.mode, cellSide: base.smoothedMass.cellSide, cells: base.smoothedMass.cellsPerBar },
]
for (const cells of settings) {
	const m = await measureImage(path, { smoothedMassCellsPerBar: cells })
	runs.push({ label: `lattice@${cells}`, mass: m.smoothedMass.mass, mode: m.smoothedMass.mode, cellSide: m.smoothedMass.cellSide, cells })
}

function argmax(values: Float64Array): number {
	let best = 0
	for (let i = 1; i < values.length; i += 1) if (values[i] > values[best]) best = i
	return best
}
function topK(values: Float64Array, k: number): number[] {
	return Array.from({ length: values.length }, (_u, i) => i)
		.sort((a, b) => values[b] - values[a] || a - b)
		.slice(0, k)
}

function relative(a: Float64Array, b: Float64Array): { max: number; at: number; mean: number } {
	let max = 0
	let at = 0
	let total = 0
	for (let i = 0; i < a.length; i += 1) {
		const denominator = Math.max(Math.abs(a[i]), 1e-300)
		const r = Math.abs(a[i] - b[i]) / denominator
		total += r
		if (r > max) {
			max = r
			at = i
		}
	}
	return { max, at, mean: total / a.length }
}

const report = {
	path,
	colorCount: base.triples.colorCount,
	pixelCount: base.triples.pixelCount,
	runs: runs.map((r) => ({
		label: r.label,
		mode: r.mode,
		cellSide: r.cellSide,
		cellsPerBar: r.cells,
		argmaxRow: argmax(r.mass),
		argmaxRgb: [
			(base.triples.keys[argmax(r.mass)] >> 16) & 255,
			(base.triples.keys[argmax(r.mass)] >> 8) & 255,
			base.triples.keys[argmax(r.mass)] & 255,
		],
		top10: topK(r.mass, 10),
	})),
	comparisons: runs.slice(1).flatMap((r, index) => {
		const out = [{ pair: `${runs[0].label} vs ${r.label}`, ...relative(runs[0].mass, r.mass) }]
		if (index > 0) out.push({ pair: `${runs[index].label} vs ${r.label}`, ...relative(runs[index].mass, r.mass) })
		return out
	}),
}
console.log(JSON.stringify(report, null, 1))

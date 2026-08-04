/**
 * VERIFIER-OWNED. Runs `measureImage` and prints only the quantities the naive side re-derives.
 * Usage: run-measure.ts <image> [cellsPerBar]
 */

import { measureImage } from "../../src/measure/index.ts"

const path = process.argv[2]
const cells = process.argv[3] ? Number(process.argv[3]) : undefined

const m = await measureImage(path, cells === undefined ? {} : { smoothedMassCellsPerBar: cells })

const rows = Array.from({ length: m.triples.colorCount }, (_u, i) => ({
	key: m.triples.keys[i],
	rgb: [(m.triples.keys[i] >> 16) & 255, (m.triples.keys[i] >> 8) & 255, m.triples.keys[i] & 255],
	count: m.triples.counts[i],
	sumX: m.triples.sumX[i],
	sumY: m.triples.sumY[i],
	sumXX: m.triples.sumXX[i],
	sumXY: m.triples.sumXY[i],
	sumYY: m.triples.sumYY[i],
	lab: [m.triples.lab[i * 3], m.triples.lab[i * 3 + 1], m.triples.lab[i * 3 + 2]],
	mass: m.smoothedMass.mass[i],
}))
const top5 = [...rows].sort((a, b) => b.count - a.count || a.key - b.key).slice(0, 5)

console.log(
	JSON.stringify(
		{
			source: m.source,
			colorCount: m.triples.colorCount,
			pixelCount: m.triples.pixelCount,
			countSum: rows.reduce((t, r) => t + r.count, 0),
			top5,
			smoothedMass: {
				mode: m.smoothedMass.mode,
				cellSide: m.smoothedMass.cellSide,
				cellsPerBar: m.smoothedMass.cellsPerBar,
				occupiedCells: m.smoothedMass.occupiedCells,
			},
			allRowsIfSmall: m.triples.colorCount <= 16 ? rows : null,
			massAll: m.triples.colorCount <= 4096 ? Array.from(m.smoothedMass.mass) : null,
			geometry: {
				linear: {
					degenerate: m.geometry.linear.degenerate,
					axis: m.geometry.linear.axis,
					axisAngleRadians: m.geometry.linear.axisAngleRadians,
					axisAngleDegrees:
						m.geometry.linear.axisAngleRadians === null
							? null
							: (m.geometry.linear.axisAngleRadians * 180) / Math.PI,
					leadingStrength: m.geometry.linear.leadingStrength,
					orthogonalStrength: m.geometry.linear.orthogonalStrength,
					origin: m.geometry.linear.origin,
					rSquared: m.geometry.linear.channels?.map((c) => c.rSquared) ?? null,
				},
				radial: {
					degenerate: m.geometry.radial.degenerate,
					centre: m.geometry.radial.centre,
					centreFromCurvature: m.geometry.radial.centreFromCurvature,
					rSquared: m.geometry.radial.channels?.map((c) => c.rSquared) ?? null,
				},
			},
		},
		null,
		0,
	),
)

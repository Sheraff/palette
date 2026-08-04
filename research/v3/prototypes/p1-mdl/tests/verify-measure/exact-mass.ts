/**
 * VERIFIER-OWNED. An independent O(K^2) smoothed mass, to separate the two approximations the
 * lattice path makes.
 *
 * It re-derives OKLab from the 8-bit keys with its own transform, its own region rule and its own
 * Gaussian, then computes three masses:
 *   - `untruncated`  — the definition, every pair, no cutoff (what the exact path computes)
 *   - `truncated`    — the same sum with pairs past 4 bandwidths dropped (what the lattice's kernel
 *                      table does, before any cell-centroid error)
 * and compares both against whatever `measureImage` returned.
 */

import { measureImage } from "../../src/measure/index.ts"

const path = process.argv[2]
const cells = process.argv[3] ? Number(process.argv[3]) : undefined

const BAR: Record<string, number> = {
	"dark-neutral": 0.00932,
	"dark-saturated": 0.01502,
	"light-neutral": 0.01627,
	"light-saturated": 0.02293,
}

function srgbToLinear(channel: number): number {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}
function toOkLab(key: number): [number, number, number] {
	const r = srgbToLinear(((key >> 16) & 255) / 255)
	const g = srgbToLinear(((key >> 8) & 255) / 255)
	const b = srgbToLinear((key & 255) / 255)
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}
function barOf(lab: [number, number, number]): number {
	const chroma = Math.hypot(lab[1], lab[2])
	return BAR[`${lab[0] < 0.55 ? "dark" : "light"}-${chroma < 0.05 ? "neutral" : "saturated"}`]
}

const measurement = await measureImage(path, cells === undefined ? {} : { smoothedMassCellsPerBar: cells })
const { colorCount, counts, keys } = measurement.triples

const labs: [number, number, number][] = []
const bars = new Float64Array(colorCount)
for (let i = 0; i < colorCount; i += 1) {
	const lab = toOkLab(keys[i])
	labs.push(lab)
	bars[i] = barOf(lab)
}

const untruncated = new Float64Array(colorCount)
const truncated = new Float64Array(colorCount)
for (let i = 0; i < colorCount; i += 1) {
	untruncated[i] += counts[i]
	truncated[i] += counts[i]
	const [li, ai, bi] = labs[i]
	for (let j = i + 1; j < colorCount; j += 1) {
		const dl = li - labs[j][0]
		const da = ai - labs[j][1]
		const db = bi - labs[j][2]
		const squared = dl * dl + da * da + db * db
		const h = bars[i] > bars[j] ? bars[i] : bars[j]
		const u = squared / (h * h)
		const weight = Math.exp(-0.5 * u)
		untruncated[i] += counts[j] * weight
		untruncated[j] += counts[i] * weight
		if (u < 16) {
			truncated[i] += counts[j] * weight
			truncated[j] += counts[i] * weight
		}
	}
}

function worst(reference: Float64Array, other: Float64Array) {
	let max = 0
	let at = 0
	for (let i = 0; i < reference.length; i += 1) {
		const r = Math.abs(reference[i] - other[i]) / reference[i]
		if (r > max) {
			max = r
			at = i
		}
	}
	return { max, at }
}

function topTen(values: Float64Array): number[] {
	return Array.from({ length: values.length }, (_u, i) => i)
		.sort((x, y) => values[y] - values[x] || x - y)
		.slice(0, 10)
}

const got = measurement.smoothedMass.mass
const rankingUntruncated = topTen(untruncated)
const rankingMeasured = topTen(got)
const a = worst(untruncated, got)
const b = worst(truncated, got)
const c = worst(untruncated, truncated)
console.log(
	JSON.stringify(
		{
			path,
			colorCount,
			mode: measurement.smoothedMass.mode,
			cellsPerBar: measurement.smoothedMass.cellsPerBar,
			"measure vs independent untruncated": { maxRelative: a.max, row: a.at, rgb: [(keys[a.at] >> 16) & 255, (keys[a.at] >> 8) & 255, keys[a.at] & 255], n: counts[a.at], reference: untruncated[a.at], measured: got[a.at] },
			"measure vs independent truncated@4h": { maxRelative: b.max, row: b.at, reference: truncated[b.at], measured: got[b.at] },
			"truncation alone (untruncated vs truncated)": { maxRelative: c.max, row: c.at, rgb: [(keys[c.at] >> 16) & 255, (keys[c.at] >> 8) & 255, keys[c.at] & 255] },
			"top-10 by untruncated definition": rankingUntruncated,
			"top-10 as measured": rankingMeasured,
			"top-10 identical": JSON.stringify(rankingUntruncated) === JSON.stringify(rankingMeasured),
			prevalence: (() => {
				let over1 = 0
				let over5 = 0
				let signedNegative = 0
				let massWeighted = 0
				let massTotal = 0
				for (let i = 0; i < colorCount; i += 1) {
					const r = (untruncated[i] - got[i]) / untruncated[i]
					if (Math.abs(r) > 0.01) over1 += 1
					if (Math.abs(r) > 0.05) over5 += 1
					if (r > 0) signedNegative += 1
					massWeighted += Math.abs(r) * counts[i]
					massTotal += counts[i]
				}
				return {
					rowsOver1Percent: over1,
					rowsOver5Percent: over5,
					rowsUnderestimated: signedNegative,
					rows: colorCount,
					pixelWeightedMeanRelativeError: massWeighted / massTotal,
				}
			})(),
		},
		null,
		1,
	),
)

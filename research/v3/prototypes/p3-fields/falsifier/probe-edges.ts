/**
 * Diagnostic probe: how dense is the edge indicator, as a function of the rank order k, on real
 * artwork? Run before the study so the study's k is a stated choice rather than an accident.
 *
 *   node --experimental-strip-types falsifier/probe-edges.ts
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { REGION_BAR_SQUARED, computeDepthField, computeEdgeMap, quantileOfSorted, regionCodeOf, rgb8ToOkLab } from "./fields.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const file = JSON.parse(readFileSync(resolve(HERE, "../../../data/legacy/endorsements.json"), "utf8")) as {
	entries: { artwork: { imagePath: string; absolutePath: string; contentSha256: string } }[]
}

const seen = new Set<string>()
const sample: { path: string; absolute: string }[] = []
for (const entry of file.entries) {
	if (seen.has(entry.artwork.contentSha256)) continue
	seen.add(entry.artwork.contentSha256)
	sample.push({ path: entry.artwork.imagePath, absolute: entry.artwork.absolutePath })
}
sample.sort((a, b) => (a.path < b.path ? -1 : 1))
const chosen = [0, 20, 40, 60, 80, 100, 120, 140, 160, 172].map((i) => sample[i]).filter(Boolean)

for (const item of chosen) {
	const image = sharp(item.absolute)
	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const { width, height, channels } = info
	const count = width * height
	const lab = new Float64Array(count * 3)
	const regionCode = new Uint8Array(count)
	const eligible = new Uint8Array(count).fill(1)
	for (let index = 0; index < count; index += 1) {
		const offset = index * channels
		const [l, a, b] = rgb8ToOkLab(data[offset], data[offset + 1], data[offset + 2])
		lab[index * 3] = l
		lab[index * 3 + 1] = a
		lab[index * 3 + 2] = b
		regionCode[index] = regionCodeOf(l, a, b)
	}
	const row: Record<string, unknown> = { path: item.path, size: `${width}x${height}` }
	for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) {
		const edge = computeEdgeMap(lab, regionCode, eligible, width, height, k)
		let edges = 0
		for (let i = 0; i < edge.length; i += 1) edges += edge[i]
		const depth = computeDepthField(edge, width, height)
		let interior = 0
		let q75 = Number.NaN
		if (depth !== null) {
			const sorted = Float64Array.from(depth).sort()
			q75 = quantileOfSorted(sorted, 0.75)
			for (let i = 0; i < depth.length; i += 1) if (depth[i] > 0) interior += 1
		}
		row[`k${k}`] = `${(100 * edges / count).toFixed(1)}%e/${(100 * interior / count).toFixed(1)}%i/q75=${q75.toFixed(4)}`
	}
	console.log(JSON.stringify(row))
}
void REGION_BAR_SQUARED

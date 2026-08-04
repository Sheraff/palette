/**
 * W3 audit — cross-check of the two independent field implementations.
 *
 * `src/fields.ts` (W1) and `falsifier/fields.ts` (W2) were written blind to each other. This runs
 * both over the same five images and reports, per image:
 *
 * - the edge-pixel fraction each produces (over the eligible population), and how many pixels the
 *   two edge maps disagree on;
 * - the Spearman rank correlation between the two depth fields on a fixed subsample of 10 000 pixel
 *   indices taken at a deterministic stride (no randomness anywhere).
 *
 * ## What is shared and what is not
 *
 * Decoding is shared: both implementations take the *same* 8-bit sRGB buffer and the same eligibility
 * mask, obtained once through W1's `decodeImage`. Decode is upstream of both field implementations
 * and neither proposal treats it as part of the mechanism, so sharing it isolates the comparison to
 * the fields themselves. Everything downstream of the buffer is each author's own: W2 recomputes
 * sRGB→OKLab from Ottosson's coefficients and re-derives its own region codes rather than reading
 * W1's `lab` or `bar` planes.
 *
 * The Spearman here is written in this file rather than imported from either side, so the statistic
 * that judges the two implementations belongs to neither of them.
 *
 *     node --experimental-strip-types audit/cross-check.ts
 */

import { readFile } from "node:fs/promises"
import { decodeImage } from "../src/decode.ts"
import { computeDepthField as w1Depth, computeEdgeField as w1Edges } from "../src/fields.ts"
import {
	computeDepthField as w2Depth,
	computeEdgeMap as w2Edges,
	regionCodeOf,
	rgb8ToOkLab,
} from "../falsifier/fields.ts"

const SET_PATH =
	"/private/tmp/claude-501/-Users-Flo-GitHub-palette/2309a578-04f5-4ae0-97b9-481682d72c4f/scratchpad/demo-20.txt"
const IMAGE_COUNT = 5
const SUBSAMPLE = 10_000

/** Fractional ranks, ties averaged. Written here so the referee statistic belongs to neither side. */
function averageRanks(values: Float64Array): Float64Array {
	const n = values.length
	const order = Array.from({ length: n }, (_unused, i) => i)
	order.sort((left, right) => {
		const difference = values[left] - values[right]
		if (difference !== 0) return difference < 0 ? -1 : 1
		return left - right
	})
	const ranks = new Float64Array(n)
	let i = 0
	while (i < n) {
		let j = i
		while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j += 1
		const shared = (i + j) / 2
		for (let k = i; k <= j; k += 1) ranks[order[k]] = shared
		i = j + 1
	}
	return ranks
}

function spearman(first: Float64Array, second: Float64Array): number {
	const n = first.length
	if (n < 2 || second.length !== n) return Number.NaN
	const a = averageRanks(first)
	const b = averageRanks(second)
	const mean = (n - 1) / 2
	let numerator = 0
	let sumA = 0
	let sumB = 0
	for (let i = 0; i < n; i += 1) {
		const da = a[i] - mean
		const db = b[i] - mean
		numerator += da * db
		sumA += da * da
		sumB += db * db
	}
	if (sumA === 0 || sumB === 0) return Number.NaN
	return numerator / Math.sqrt(sumA * sumB)
}

const setLines = (await readFile(SET_PATH, "utf8"))
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.length > 0 && !line.startsWith("#"))
const paths = setLines.slice(0, IMAGE_COUNT)

console.log(`set: ${SET_PATH}`)
console.log(`images: ${paths.length}\n`)

const rows: string[] = []

for (const path of paths) {
	const image = await decodeImage(path)
	const { width, height, rgb, eligible } = image
	const count = width * height

	// --- W1 ---------------------------------------------------------------------------------
	const edgesA = w1Edges(image)
	const depthAField = w1Depth(image, edgesA)
	const depthA = depthAField.depth

	// --- W2, from the same 8-bit buffer and nothing else of W1's ------------------------------
	const labB = new Float64Array(count * 3)
	const regionCode = new Uint8Array(count)
	for (let index = 0; index < count; index += 1) {
		if (eligible[index] === 0) continue
		const at = index * 3
		const [l, a, b] = rgb8ToOkLab(rgb[at], rgb[at + 1], rgb[at + 2])
		labB[at] = l
		labB[at + 1] = a
		labB[at + 2] = b
		regionCode[index] = regionCodeOf(l, a, b)
	}
	const edgesB = w2Edges(labB, regionCode, eligible, width, height)
	const depthB = w2Depth(edgesB, width, height)

	// --- edge fractions --------------------------------------------------------------------
	let edgeCountB = 0
	let disagree = 0
	for (let index = 0; index < count; index += 1) {
		if (edgesB[index] === 1) edgeCountB += 1
		if ((edgesA.isEdge[index] === 1) !== (edgesB[index] === 1)) disagree += 1
	}
	const eligibleCount = image.eligibleIndices.length
	const fractionA = edgesA.edgeCount / eligibleCount
	const fractionB = edgeCountB / eligibleCount

	// --- depth Spearman on a deterministic stride ----------------------------------------------
	const stride = Math.max(1, Math.floor(count / SUBSAMPLE))
	const sampleCount = Math.min(SUBSAMPLE, Math.floor((count + stride - 1) / stride))
	const sampleA = new Float64Array(sampleCount)
	const sampleB = new Float64Array(sampleCount)
	let identical = 0
	for (let i = 0; i < sampleCount; i += 1) {
		const index = i * stride
		sampleA[i] = depthA[index]
		sampleB[i] = depthB === null ? Number.NaN : depthB[index]
		if (sampleA[i] === sampleB[i]) identical += 1
	}
	const rho = depthB === null ? Number.NaN : spearman(sampleA, sampleB)

	const name = path.split("/").slice(-1)[0]
	rows.push(
		[
			name,
			`${width}x${height}`,
			`elig=${eligibleCount}`,
			`edgeFracW1=${fractionA.toFixed(6)}`,
			`edgeFracW2=${fractionB.toFixed(6)}`,
			`edgeDisagree=${disagree}`,
			`depthRho=${rho.toFixed(6)}`,
			`depthExactEqual=${identical}/${sampleCount}`,
			`seedlessW1=${String(depthAField.seedless)}`,
			`depthNullW2=${String(depthB === null)}`,
		].join("  "),
	)
	console.log(rows[rows.length - 1])
}

console.log("\n--- machine-readable ---")
console.log(JSON.stringify(rows, null, 1))

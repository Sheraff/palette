/**
 * # P3 falsifier — an independent implementation of the core scalar fields.
 *
 * Deliberately separate from `../src/`: the point of the falsifier is that its answer does not
 * depend on the prototype implementation it is testing. Nothing here imports from `../src/`.
 *
 * ## The discipline line (README.md), held here too
 *
 * Nothing colour-bearing is created. Every quantity below is either a pixel of the artwork or a
 * *number attached to a pixel*. No histogram, no centroid, no local mean colour, no blended
 * colour, no structure indexed by colour. Distances are always **to the pixel itself**.
 *
 * ## What is imported, and why that is not a dependency on the prototype
 *
 * Only *calibrated constants* come from the contract (`src/contract/constants.ts`): the frozen
 * per-region same-colour bar, the region boundaries, and the APCA G4G coefficients. Those are
 * measurements the campaign owns, not implementation. Every transform (sRGB→OKLab, APCA raw,
 * the edge indicator, the exact EDT) is written from scratch here and cross-checked against
 * `src/contract/color.ts` on a colour grid by `selftest.ts`.
 */

import {
	APCA_G4G,
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
} from "../../../src/contract/constants.ts"

// ---------------------------------------------------------------------------------------------
// Provisional constants. All [UNCALIBRATED] — this is a proxy study, and every one of these is a
// proxy choice that has to be auditable. Stated in REPORT.md as well as here.
// ---------------------------------------------------------------------------------------------

/**
 * The rank order of the edge indicator: pixel p is an edge iff the **k-th largest** of the eight
 * OKLab distances from p to its 3x3 neighbours exceeds p's regional same-colour bar.
 *
 * `[UNCALIBRATED]` — arm-d §2.1 names k as a free parameter to be measured against the robustness
 * harness (§4). k = 3 is the provisional value the brief pins for this study.
 */
export const EDGE_RANK_K = 3

/**
 * The field quantile. `F` (arm-d §2.3) is the set of pixels whose depth exceeds this quantile of
 * the depth field; the foreground band is "above zero and below the field", so this constant also
 * defines the band's upper edge.
 *
 * `[UNCALIBRATED]` — arm-d §4 lists beta as awaiting review rounds. 0.75 is a placeholder chosen so
 * that "the field" is the deepest quarter of the image, and it is stated rather than tuned.
 */
export const FIELD_QUANTILE_BETA = 0.75

// ---------------------------------------------------------------------------------------------
// Region indices. Same four regions as `colorRegion()`, encoded as 0..3 so a whole image's regions
// fit in a Uint8Array.
// ---------------------------------------------------------------------------------------------

export const REGION_NAMES = [
	"dark-neutral",
	"dark-saturated",
	"light-neutral",
	"light-saturated",
] as const

/** The frozen per-region bar, indexed by the codes above. */
export const REGION_BAR = Float64Array.from(REGION_NAMES.map((name) => SAME_COLOR_BAR_BY_REGION[name]))

/** Squared bars, so the hot loops never take a square root. */
export const REGION_BAR_SQUARED = Float64Array.from(Array.from(REGION_BAR, (bar) => bar * bar))

export function regionCodeOf(lightness: number, a: number, b: number): number {
	const chroma = Math.hypot(a, b)
	const light = lightness < REGION_LIGHTNESS_BOUNDARY ? 0 : 2
	const saturated = chroma < REGION_CHROMA_BOUNDARY ? 0 : 1
	return light + saturated
}

// ---------------------------------------------------------------------------------------------
// sRGB -> OKLab, written here rather than imported. Ottosson's direct formulation.
// ---------------------------------------------------------------------------------------------

/** 256-entry lookup for the sRGB gamma decode; the transform is per-channel, so a table is exact. */
const SRGB_TO_LINEAR = (() => {
	const table = new Float64Array(256)
	for (let value = 0; value < 256; value += 1) {
		const channel = value / 255
		table[value] = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
	}
	return table
})()

export function rgb8ToOkLab(red: number, green: number, blue: number): [number, number, number] {
	const r = SRGB_TO_LINEAR[red]
	const g = SRGB_TO_LINEAR[green]
	const b = SRGB_TO_LINEAR[blue]

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	]
}

// ---------------------------------------------------------------------------------------------
// APCA raw, written here rather than imported. Signed, pre-clamp, x100.
// ---------------------------------------------------------------------------------------------

const APCA_Y_TABLE = (() => {
	const red = new Float64Array(256)
	const green = new Float64Array(256)
	const blue = new Float64Array(256)
	for (let value = 0; value < 256; value += 1) {
		const powered = (value / 255) ** APCA_G4G.mainTRC
		red[value] = APCA_G4G.sRco * powered
		green[value] = APCA_G4G.sGco * powered
		blue[value] = APCA_G4G.sBco * powered
	}
	return { red, green, blue }
})()

export function apcaY(red: number, green: number, blue: number): number {
	return APCA_Y_TABLE.red[red] + APCA_Y_TABLE.green[green] + APCA_Y_TABLE.blue[blue]
}

function softClampBlack(y: number): number {
	return y > APCA_G4G.blkThrs ? y : y + (APCA_G4G.blkThrs - y) ** APCA_G4G.blkClmp
}

/** Raw pre-clamp APCA between two already-clamped luminances. */
export function apcaRawFromY(textY: number, backgroundY: number): number {
	const t = softClampBlack(textY)
	const b = softClampBlack(backgroundY)
	const sapc = b > t
		? (b ** APCA_G4G.normBG - t ** APCA_G4G.normTXT) * APCA_G4G.scaleBoW
		: (b ** APCA_G4G.revBG - t ** APCA_G4G.revTXT) * APCA_G4G.scaleWoB
	return sapc * 100
}

export function apcaRaw8(text: readonly [number, number, number], background: readonly [number, number, number]): number {
	return apcaRawFromY(apcaY(text[0], text[1], text[2]), apcaY(background[0], background[1], background[2]))
}

// ---------------------------------------------------------------------------------------------
// The edge indicator.
// ---------------------------------------------------------------------------------------------

/**
 * Edge map: p is an edge iff the k-th largest OKLab distance from p to its eight 3x3 neighbours
 * exceeds the same-colour bar of **p's own region** (arm-d §2.1: "the same-colour bar for p's
 * region" — not the pair bar, which would need a max over the neighbour's region too).
 *
 * Ineligible pixels (alpha < 255) are excluded from eligibility *and from their neighbours'
 * statistics*, per arm-d §2.0 — never matted, because compositing creates colours.
 *
 * Boundary and near-ineligible pixels have fewer than eight neighbours. The rank taken is then
 * `min(k, available) - 1` — the k-th largest where there is one, the smallest otherwise. A pixel
 * with no eligible neighbour at all is not an edge.
 */
export function computeEdgeMap(
	lab: Float64Array,
	regionCode: Uint8Array,
	eligible: Uint8Array,
	width: number,
	height: number,
	k: number = EDGE_RANK_K,
): Uint8Array {
	const edge = new Uint8Array(width * height)
	const distances = new Float64Array(8)

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x
			if (eligible[index] === 0) continue
			const base = index * 3
			const l0 = lab[base]
			const a0 = lab[base + 1]
			const b0 = lab[base + 2]

			let count = 0
			for (let dy = -1; dy <= 1; dy += 1) {
				const ny = y + dy
				if (ny < 0 || ny >= height) continue
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue
					const nx = x + dx
					if (nx < 0 || nx >= width) continue
					const neighbour = ny * width + nx
					if (eligible[neighbour] === 0) continue
					const nbase = neighbour * 3
					const dl = lab[nbase] - l0
					const da = lab[nbase + 1] - a0
					const db = lab[nbase + 2] - b0
					// Squared distance: the k-th largest squared distance is the square of the k-th
					// largest distance, so the ordering is preserved and no sqrt is needed.
					distances[count] = dl * dl + da * da + db * db
					count += 1
				}
			}
			if (count === 0) continue

			// Descending insertion sort over at most eight values.
			for (let i = 1; i < count; i += 1) {
				const value = distances[i]
				let j = i - 1
				while (j >= 0 && distances[j] < value) {
					distances[j + 1] = distances[j]
					j -= 1
				}
				distances[j + 1] = value
			}

			const rank = Math.min(k, count) - 1
			if (distances[rank] > REGION_BAR_SQUARED[regionCode[index]]) edge[index] = 1
		}
	}
	return edge
}

// ---------------------------------------------------------------------------------------------
// The depth field: exact Euclidean distance transform to the nearest edge pixel.
// ---------------------------------------------------------------------------------------------

const EDT_INFINITY = 1e20

/** Felzenszwalb & Huttenlocher's exact 1-D lower-envelope transform of a sampled function. */
function distanceTransform1d(
	f: Float64Array,
	n: number,
	out: Float64Array,
	v: Int32Array,
	z: Float64Array,
): void {
	let k = 0
	v[0] = 0
	z[0] = -EDT_INFINITY
	z[1] = EDT_INFINITY
	for (let q = 1; q < n; q += 1) {
		let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		while (s <= z[k]) {
			k -= 1
			s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		}
		k += 1
		v[k] = q
		z[k] = s
		z[k + 1] = EDT_INFINITY
	}
	k = 0
	for (let q = 0; q < n; q += 1) {
		while (z[k + 1] < q) k += 1
		const delta = q - v[k]
		out[q] = delta * delta + f[v[k]]
	}
}

/**
 * Exact EDT to the nearest set pixel of `seeds`, in pixel units (not squared), then divided by the
 * image's long edge so the field is scale-free (arm-d §1: normalised coordinates, never raw pixel
 * counts).
 *
 * Returns `null` when `seeds` is empty — there is then no ordering to speak of, and the caller has
 * to say so rather than invent one.
 */
export function computeDepthField(
	seeds: Uint8Array,
	width: number,
	height: number,
): Float64Array | null {
	let seedCount = 0
	for (let i = 0; i < seeds.length; i += 1) if (seeds[i] !== 0) seedCount += 1
	if (seedCount === 0) return null

	const squared = new Float64Array(width * height)
	for (let i = 0; i < squared.length; i += 1) squared[i] = seeds[i] !== 0 ? 0 : EDT_INFINITY

	const longest = Math.max(width, height)
	const column = new Float64Array(longest)
	const result = new Float64Array(longest)
	const v = new Int32Array(longest)
	const z = new Float64Array(longest + 1)

	// Column pass.
	for (let x = 0; x < width; x += 1) {
		for (let y = 0; y < height; y += 1) column[y] = squared[y * width + x]
		distanceTransform1d(column, height, result, v, z)
		for (let y = 0; y < height; y += 1) squared[y * width + x] = result[y]
	}
	// Row pass.
	for (let y = 0; y < height; y += 1) {
		const rowBase = y * width
		for (let x = 0; x < width; x += 1) column[x] = squared[rowBase + x]
		distanceTransform1d(column, width, result, v, z)
		for (let x = 0; x < width; x += 1) squared[rowBase + x] = result[x]
	}

	const longEdge = Math.max(width, height)
	const depth = new Float64Array(width * height)
	for (let i = 0; i < depth.length; i += 1) depth[i] = Math.sqrt(squared[i]) / longEdge
	return depth
}

// ---------------------------------------------------------------------------------------------
// Rank positions.
// ---------------------------------------------------------------------------------------------

/** Number of entries in the ascending-sorted array strictly greater than `value`. */
export function countStrictlyGreater(sortedAscending: Float64Array, value: number): number {
	let low = 0
	let high = sortedAscending.length
	while (low < high) {
		const mid = (low + high) >>> 1
		if (sortedAscending[mid] <= value) low = mid + 1
		else high = mid
	}
	return sortedAscending.length - low
}

/** Number of entries in the ascending-sorted array strictly less than `value`. */
export function countStrictlyLess(sortedAscending: Float64Array, value: number): number {
	let low = 0
	let high = sortedAscending.length
	while (low < high) {
		const mid = (low + high) >>> 1
		if (sortedAscending[mid] < value) low = mid + 1
		else high = mid
	}
	return low
}

/**
 * Position of a score in an ordering whose **designated end is the maximum**.
 *
 * 0 means "at the designated end", 1 means "at the far end". Ties resolve in the most favourable
 * direction (only *strictly* greater values count against a score), which is the correct choice for
 * a falsifier: it gives the paradigm every benefit of the doubt.
 *
 * Ties are not a corner case here — the depth field puts large blocks of pixels at exactly 0 — so
 * `positionPessimistic` is recorded alongside, with every tie counting *against*. The gap between
 * the two is how much of a favourable position is real separation and how much is a tie block.
 */
export function positionFromDesignatedEnd(sortedAscending: Float64Array, value: number): number {
	const population = sortedAscending.length
	if (population <= 1) return 0
	return countStrictlyGreater(sortedAscending, value) / (population - 1)
}

export function positionPessimistic(sortedAscending: Float64Array, value: number): number {
	const population = sortedAscending.length
	if (population <= 1) return 0
	return (population - 1 - countStrictlyLess(sortedAscending, value)) / (population - 1)
}

/** Lower median of a Float64Array slice — an actual order statistic, never an average. */
export function lowerMedian(values: Float64Array, length: number): number {
	const copy = values.slice(0, length)
	copy.sort()
	return copy[(length - 1) >> 1]
}

export function quantileOfSorted(sortedAscending: Float64Array, quantile: number): number {
	if (sortedAscending.length === 0) return Number.NaN
	const index = Math.min(
		sortedAscending.length - 1,
		Math.max(0, Math.floor(quantile * (sortedAscending.length - 1))),
	)
	return sortedAscending[index]
}

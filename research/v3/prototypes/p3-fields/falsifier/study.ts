/**
 * # The pre-registered falsifier (arm-d §7), run before the selection cascade is trusted.
 *
 * For every endorsed role colour, find the pixels bearing that **exact 8-bit triple** in the source
 * image and record where those pixels sit in this paradigm's field orderings.
 *
 * > If endorsed answers sit roughly uniformly mid-ordering rather than concentrated near the
 * > designated ends, selection-by-rank-of-a-local-field is refuted — tuning moves *where we cut*,
 * > never *what the order is*.
 *
 * ## The three orderings, exactly as the brief specifies them
 *
 * | role | scalar field (designated end = maximum) | population |
 * | --- | --- | --- |
 * | `background`, `surface` | `depth` | every eligible pixel |
 * | `foreground` | `abs(apcaRaw(pixel, endorsed background))` | pixels with depth in the low non-zero band |
 * | `accent` | `min(oklabDistance(pixel, bg), oklabDistance(pixel, surface))` | pixels clearing the same-colour bar from **both** |
 *
 * Background and surface share one ordering because arm-d §2.3 makes them one question with two
 * answers: both are read off the field set `F`, which is the high-depth end of the depth field.
 *
 * ## Positions, and why "best" alone would prove nothing
 *
 * A position of 0 means "at the designated end of the ordering", 1 means "at the far end". Ties
 * resolve in the paradigm's favour. Two positions are recorded per role colour:
 *
 * - **best** — the most favourable position any bearing pixel attains. Reported because the brief
 *   asks for it, but it is a weak statistic on its own: a background colour covering half the image
 *   has ~200,000 bearing pixels, and *under a random ordering* its best position would still be
 *   ~1/200,000. So every best-percentile here is reported beside its own null expectation
 *   `1/(n+1)` and the null top-decile probability `1 - 0.9^n`.
 * - **median** — the position of the bearing pixels' median score. This is the statistic the
 *   verdict is pre-registered on, because its null value is 0.5 whatever `n` is.
 *
 * ## Usage
 *
 *   node --experimental-strip-types falsifier/study.ts --offset 0 --limit 45 --out part-0.json
 *
 * Chunking is over **artworks** (173 of them behind 351 endorsements), sorted by content hash, so a
 * chunk boundary is deterministic and the expensive per-artwork fields are computed once and shared
 * by every endorsement of that artwork.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import {
	EDGE_RANK_K,
	FIELD_QUANTILE_BETA,
	REGION_BAR,
	apcaRawFromY,
	apcaY,
	computeDepthField,
	computeEdgeMap,
	lowerMedian,
	positionFromDesignatedEnd,
	positionPessimistic,
	quantileOfSorted,
	regionCodeOf,
	rgb8ToOkLab,
} from "./fields.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ENDORSEMENTS = resolve(HERE, "../../../data/legacy/endorsements.json")

type Rgb = readonly [number, number, number]

type RoleName = "background" | "surface" | "foreground" | "accent"
const ROLES: readonly RoleName[] = ["background", "surface", "foreground", "accent"]

type RoleResult = {
	role: RoleName
	hex: string
	rgb: Rgb
	/** Ordering the role was measured in; `null` when it could not be built. */
	ordering: "depth" | "apca-vs-background" | "distance-from-field-ends" | null
	/** Why no ordering / no position, when that happened. */
	skipped: string | null
	/** Pixels in the whole eligible image bearing this exact triple. */
	bearingPixels: number
	/** Of those, how many fall inside the ordering's restricted population. */
	bearingPixelsInScope: number
	/** Size of the ordering's population. */
	orderingPopulation: number
	/** 0 = at the designated end, 1 = at the far end. Null when nothing is in scope. */
	bestPosition: number | null
	bestPositionPessimistic: number | null
	medianPosition: number | null
	/** Null expectations for `bestPosition`, given `bearingPixelsInScope` placed at random. */
	nullExpectedBest: number | null
	nullProbabilityBestInTopDecile: number | null
}

type EntryResult = {
	entryId: string
	kind: string
	completeness: string
	imagePath: string
	contentSha256: string
	width: number
	height: number
	roles: RoleResult[]
}

type ArtworkResult = {
	contentSha256: string
	imagePath: string
	width: number
	height: number
	pixels: number
	eligiblePixels: number
	edgePixels: number
	interiorPixels: number
	fieldThresholdDepth: number
	fieldThresholdDepthAllPixels: number
	bandPixels: number
	noEdges: boolean
	decodeError: string | null
	entries: EntryResult[]
	milliseconds: number
}

// ---------------------------------------------------------------------------------------------
// Decode + fields, once per artwork.
// ---------------------------------------------------------------------------------------------

type ArtworkFields = {
	width: number
	height: number
	packed: Int32Array
	rgb: Uint8Array
	lab: Float64Array
	luminance: Float64Array
	eligible: Uint8Array
	regionCode: Uint8Array
	eligibleCount: number
	edgeCount: number
	depth: Float64Array | null
	sortedDepth: Float64Array
	interiorPixels: number
	fieldThreshold: number
	fieldThresholdAllPixels: number
	bandIndices: Int32Array
}

async function buildFields(imagePath: string, edgeRankK: number): Promise<ArtworkFields> {
	const image = sharp(imagePath)
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new Error(`no header dimensions for ${imagePath}`)
	}
	// Native resolution, no resample (PHASE_0_DECISIONS §1); dimensions from the header, never the name.
	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const { width, height, channels } = info
	if (channels !== 3 && channels !== 4) throw new Error(`unsupported channel count ${channels}`)

	const count = width * height
	const packed = new Int32Array(count)
	const rgb = new Uint8Array(count * 3)
	const lab = new Float64Array(count * 3)
	const luminance = new Float64Array(count)
	const eligible = new Uint8Array(count)
	const regionCode = new Uint8Array(count)
	let eligibleCount = 0

	for (let index = 0; index < count; index += 1) {
		const offset = index * channels
		const red = data[offset]
		const green = data[offset + 1]
		const blue = data[offset + 2]
		// arm-d §2.0: alpha < 255 is an *exclusion*, never a matte. Compositing creates colours.
		const isEligible = channels === 3 || data[offset + 3] === 255
		eligible[index] = isEligible ? 1 : 0
		if (isEligible) eligibleCount += 1
		packed[index] = (red << 16) | (green << 8) | blue
		rgb[index * 3] = red
		rgb[index * 3 + 1] = green
		rgb[index * 3 + 2] = blue
		const [l, a, b] = rgb8ToOkLab(red, green, blue)
		lab[index * 3] = l
		lab[index * 3 + 1] = a
		lab[index * 3 + 2] = b
		regionCode[index] = regionCodeOf(l, a, b)
		luminance[index] = apcaY(red, green, blue)
	}

	const edge = computeEdgeMap(lab, regionCode, eligible, width, height, edgeRankK)
	let edgeCount = 0
	for (let index = 0; index < count; index += 1) if (edge[index] !== 0) edgeCount += 1

	const depth = computeDepthField(edge, width, height)

	const sortedDepth = new Float64Array(depth === null ? 0 : eligibleCount)
	if (depth !== null) {
		let cursor = 0
		for (let index = 0; index < count; index += 1) {
			if (eligible[index] !== 0) sortedDepth[cursor++] = depth[index]
		}
		sortedDepth.sort()
	}

	// The foreground band: "above zero and below the field" (arm-d §2.5). `depth > 0` means "not an
	// edge pixel"; `depth < fieldThreshold` means "not inside F".
	//
	// **Proxy choice, stated.** arm-d §2.3 puts the field threshold at the beta quantile of depth
	// over *all* pixels. The probe (`probe-edges.ts`) shows that at k = 3 the edge indicator marks a
	// median of roughly half the corpus's pixels, so on many artworks the all-pixel 0.75 quantile of
	// depth is exactly 0 and the band would be empty by construction — the study would then measure
	// nothing rather than measure a refutation. The threshold is therefore taken over the
	// **interior** (depth > 0) instead, which is the same definition wherever edges are sparse and
	// is non-empty whenever any interior exists. The all-pixel threshold is recorded too.
	const interiorDepths: number[] = []
	if (depth !== null) {
		for (let index = 0; index < count; index += 1) {
			if (eligible[index] !== 0 && depth[index] > 0) interiorDepths.push(depth[index])
		}
	}
	const sortedInterior = Float64Array.from(interiorDepths).sort()
	const fieldThresholdAllPixels = depth === null
		? Number.NaN
		: quantileOfSorted(sortedDepth, FIELD_QUANTILE_BETA)
	const fieldThreshold = sortedInterior.length === 0
		? Number.NaN
		: quantileOfSorted(sortedInterior, FIELD_QUANTILE_BETA)

	let bandCount = 0
	if (depth !== null) {
		for (let index = 0; index < count; index += 1) {
			if (eligible[index] !== 0 && depth[index] > 0 && depth[index] < fieldThreshold) bandCount += 1
		}
	}
	const bandIndices = new Int32Array(bandCount)
	if (depth !== null) {
		let cursor = 0
		for (let index = 0; index < count; index += 1) {
			if (eligible[index] !== 0 && depth[index] > 0 && depth[index] < fieldThreshold) {
				bandIndices[cursor++] = index
			}
		}
	}

	return {
		width,
		height,
		packed,
		rgb,
		lab,
		luminance,
		eligible,
		regionCode,
		eligibleCount,
		edgeCount,
		depth,
		sortedDepth,
		interiorPixels: sortedInterior.length,
		fieldThreshold,
		fieldThresholdAllPixels,
		bandIndices,
	}
}

// ---------------------------------------------------------------------------------------------
// Locating bearing pixels and scoring them.
// ---------------------------------------------------------------------------------------------

/** Indices of eligible pixels whose exact 8-bit triple equals `target`. Two passes, exact sizing. */
function bearingIndices(fields: ArtworkFields, target: Rgb): Int32Array {
	const wanted = (target[0] << 16) | (target[1] << 8) | target[2]
	const { packed, eligible } = fields
	let count = 0
	for (let index = 0; index < packed.length; index += 1) {
		if (packed[index] === wanted && eligible[index] !== 0) count += 1
	}
	const out = new Int32Array(count)
	let cursor = 0
	for (let index = 0; index < packed.length; index += 1) {
		if (packed[index] === wanted && eligible[index] !== 0) out[cursor++] = index
	}
	return out
}

/**
 * Best and median position of `indices` in an ordering given by `scoreOf`, whose population's
 * sorted scores are `sortedPopulation`. `inScope` decides which bearing pixels are measurable.
 *
 * Position is a monotone *decreasing* function of score, so the best position is the position of
 * the largest score and the median position is the position of the (lower) median score. Two
 * binary searches, not one per bearing pixel.
 */
function positionsOf(
	indices: Int32Array,
	inScope: (index: number) => boolean,
	scoreOf: (index: number) => number,
	sortedPopulation: Float64Array,
): { inScopeCount: number; best: number | null; bestPessimistic: number | null; median: number | null } {
	const scores = new Float64Array(indices.length)
	let inScopeCount = 0
	let best = Number.NEGATIVE_INFINITY
	for (let i = 0; i < indices.length; i += 1) {
		const index = indices[i]
		if (!inScope(index)) continue
		const score = scoreOf(index)
		scores[inScopeCount++] = score
		if (score > best) best = score
	}
	if (inScopeCount === 0) return { inScopeCount: 0, best: null, bestPessimistic: null, median: null }
	return {
		inScopeCount,
		best: positionFromDesignatedEnd(sortedPopulation, best),
		bestPessimistic: positionPessimistic(sortedPopulation, best),
		median: positionFromDesignatedEnd(sortedPopulation, lowerMedian(scores, inScopeCount)),
	}
}

function nullStats(n: number): { expectedBest: number; probTopDecile: number } {
	return { expectedBest: 1 / (n + 1), probTopDecile: 1 - 0.9 ** n }
}

// ---------------------------------------------------------------------------------------------
// One artwork.
// ---------------------------------------------------------------------------------------------

type Endorsement = {
	entryId: string
	kind: string
	artwork: { imagePath: string; absolutePath: string; contentSha256: string }
	palette: { completeness: string; roles: Partial<Record<RoleName, { hex: string; rgb: number[] }>> }
}

async function runArtwork(group: Endorsement[], edgeRankK: number): Promise<ArtworkResult> {
	const started = Date.now()
	const first = group[0]
	const base = {
		contentSha256: first.artwork.contentSha256,
		imagePath: first.artwork.imagePath,
	}

	let fields: ArtworkFields
	try {
		fields = await buildFields(first.artwork.absolutePath, edgeRankK)
	} catch (error) {
		return {
			...base,
			width: 0,
			height: 0,
			pixels: 0,
			eligiblePixels: 0,
			edgePixels: 0,
			interiorPixels: 0,
			fieldThresholdDepth: Number.NaN,
			fieldThresholdDepthAllPixels: Number.NaN,
			bandPixels: 0,
			noEdges: false,
			decodeError: error instanceof Error ? error.message : String(error),
			entries: [],
			milliseconds: Date.now() - started,
		}
	}

	const { depth, sortedDepth, bandIndices, lab, luminance, regionCode, eligible, packed } = fields
	const noEdges = depth === null

	const entries: EntryResult[] = []
	for (const endorsement of group) {
		const roles = endorsement.palette.roles
		const roleResults: RoleResult[] = []

		const backgroundRgb = roles.background ? (roles.background.rgb as unknown as Rgb) : null
		const surfaceRgb = roles.surface ? (roles.surface.rgb as unknown as Rgb) : null

		// --- ordering (b): |raw APCA| against the endorsed background, over the band -------------
		let apcaSorted: Float64Array | null = null
		let backgroundLuminance = 0
		if (backgroundRgb !== null && !noEdges) {
			backgroundLuminance = apcaY(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2])
			apcaSorted = new Float64Array(bandIndices.length)
			for (let i = 0; i < bandIndices.length; i += 1) {
				apcaSorted[i] = Math.abs(apcaRawFromY(luminance[bandIndices[i]], backgroundLuminance))
			}
			apcaSorted.sort()
		}
		let bandMembership: Uint8Array | null = null
		if (apcaSorted !== null) {
			bandMembership = new Uint8Array(packed.length)
			for (let i = 0; i < bandIndices.length; i += 1) bandMembership[bandIndices[i]] = 1
		}

		// --- ordering (c): distance from the two field ends, over pixels clearing both bars ------
		let accentSorted: Float64Array | null = null
		let accentMembership: Uint8Array | null = null
		let backgroundLab: [number, number, number] | null = null
		let surfaceLab: [number, number, number] | null = null
		let backgroundBar = 0
		let surfaceBar = 0
		if (backgroundRgb !== null && surfaceRgb !== null) {
			backgroundLab = rgb8ToOkLab(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2])
			surfaceLab = rgb8ToOkLab(surfaceRgb[0], surfaceRgb[1], surfaceRgb[2])
			backgroundBar = REGION_BAR[regionCodeOf(backgroundLab[0], backgroundLab[1], backgroundLab[2])]
			surfaceBar = REGION_BAR[regionCodeOf(surfaceLab[0], surfaceLab[1], surfaceLab[2])]
			accentMembership = new Uint8Array(packed.length)
			const scratch: number[] = []
			for (let index = 0; index < packed.length; index += 1) {
				if (eligible[index] === 0) continue
				const b3 = index * 3
				const l = lab[b3]
				const a = lab[b3 + 1]
				const b = lab[b3 + 2]
				const dBackground = Math.hypot(l - backgroundLab[0], a - backgroundLab[1], b - backgroundLab[2])
				const dSurface = Math.hypot(l - surfaceLab[0], a - surfaceLab[1], b - surfaceLab[2])
				// The pair bar: max of the two regions' bars (contract `sameColorBar`).
				const pixelBar = REGION_BAR[regionCode[index]]
				if (dBackground < Math.max(pixelBar, backgroundBar)) continue
				if (dSurface < Math.max(pixelBar, surfaceBar)) continue
				accentMembership[index] = 1
				scratch.push(Math.min(dBackground, dSurface))
			}
			accentSorted = Float64Array.from(scratch)
			accentSorted.sort()
		}

		for (const role of ROLES) {
			const colour = roles[role]
			if (colour === undefined) continue
			const rgbTriple = colour.rgb as unknown as Rgb
			const indices = bearingIndices(fields, rgbTriple)

			const record: RoleResult = {
				role,
				hex: colour.hex,
				rgb: rgbTriple,
				ordering: null,
				skipped: null,
				bearingPixels: indices.length,
				bearingPixelsInScope: 0,
				orderingPopulation: 0,
				bestPosition: null,
				bestPositionPessimistic: null,
				medianPosition: null,
				nullExpectedBest: null,
				nullProbabilityBestInTopDecile: null,
			}

			if (indices.length === 0) {
				record.skipped = "absent-triple"
				roleResults.push(record)
				continue
			}

			if (role === "background" || role === "surface") {
				if (noEdges) {
					record.skipped = "no-edge-pixels-depth-field-undefined"
				} else {
					record.ordering = "depth"
					record.orderingPopulation = sortedDepth.length
					const stats = positionsOf(
						indices,
						() => true,
						(index) => depth![index],
						sortedDepth,
					)
					record.bearingPixelsInScope = stats.inScopeCount
					record.bestPosition = stats.best
					record.bestPositionPessimistic = stats.bestPessimistic
					record.medianPosition = stats.median
				}
			} else if (role === "foreground") {
				if (backgroundRgb === null) record.skipped = "no-endorsed-background-reference"
				else if (noEdges) record.skipped = "no-edge-pixels-depth-field-undefined"
				else if (bandIndices.length === 0) record.skipped = "empty-depth-band"
				else {
					record.ordering = "apca-vs-background"
					record.orderingPopulation = apcaSorted!.length
					const stats = positionsOf(
						indices,
						(index) => bandMembership![index] === 1,
						(index) => Math.abs(apcaRawFromY(luminance[index], backgroundLuminance)),
						apcaSorted!,
					)
					record.bearingPixelsInScope = stats.inScopeCount
					record.bestPosition = stats.best
					record.bestPositionPessimistic = stats.bestPessimistic
					record.medianPosition = stats.median
					if (stats.inScopeCount === 0) record.skipped = "no-bearing-pixel-in-depth-band"
				}
			} else {
				if (backgroundRgb === null || surfaceRgb === null) {
					record.skipped = "no-endorsed-field-ends-reference"
				} else if (accentSorted!.length === 0) {
					record.skipped = "empty-accent-population"
				} else {
					record.ordering = "distance-from-field-ends"
					record.orderingPopulation = accentSorted!.length
					const stats = positionsOf(
						indices,
						(index) => accentMembership![index] === 1,
						(index) => {
							const b3 = index * 3
							return Math.min(
								Math.hypot(lab[b3] - backgroundLab![0], lab[b3 + 1] - backgroundLab![1], lab[b3 + 2] - backgroundLab![2]),
								Math.hypot(lab[b3] - surfaceLab![0], lab[b3 + 1] - surfaceLab![1], lab[b3 + 2] - surfaceLab![2]),
							)
						},
						accentSorted!,
					)
					record.bearingPixelsInScope = stats.inScopeCount
					record.bestPosition = stats.best
					record.bestPositionPessimistic = stats.bestPessimistic
					record.medianPosition = stats.median
					if (stats.inScopeCount === 0) record.skipped = "no-bearing-pixel-clears-both-bars"
				}
			}

			if (record.bearingPixelsInScope > 0) {
				const nulls = nullStats(record.bearingPixelsInScope)
				record.nullExpectedBest = nulls.expectedBest
				record.nullProbabilityBestInTopDecile = nulls.probTopDecile
			}
			roleResults.push(record)
		}

		entries.push({
			entryId: endorsement.entryId,
			kind: endorsement.kind,
			completeness: endorsement.palette.completeness,
			imagePath: endorsement.artwork.imagePath,
			contentSha256: endorsement.artwork.contentSha256,
			width: fields.width,
			height: fields.height,
			roles: roleResults,
		})
	}

	return {
		...base,
		width: fields.width,
		height: fields.height,
		pixels: fields.width * fields.height,
		eligiblePixels: fields.eligibleCount,
		edgePixels: fields.edgeCount,
		interiorPixels: fields.interiorPixels,
		fieldThresholdDepth: fields.fieldThreshold,
		fieldThresholdDepthAllPixels: fields.fieldThresholdAllPixels,
		bandPixels: fields.bandIndices.length,
		noEdges,
		decodeError: null,
		entries,
		milliseconds: Date.now() - started,
	}
}

// ---------------------------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------------------------

function argOf(name: string, fallback: string): string {
	const index = process.argv.indexOf(`--${name}`)
	return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback
}

async function main(): Promise<void> {
	const offset = Number(argOf("offset", "0"))
	const limit = Number(argOf("limit", "1000000"))
	const outPath = resolve(HERE, argOf("out", "results-part.json"))
	const edgeRankK = Number(argOf("k", String(EDGE_RANK_K)))

	const file = JSON.parse(readFileSync(ENDORSEMENTS, "utf8")) as { entries: Endorsement[] }

	// Deterministic grouping: one group per artwork, groups ordered by content hash, entries within
	// a group ordered by entryId. No seed and no sampling — the ordering is a total order on the data.
	const byArtwork = new Map<string, Endorsement[]>()
	for (const entry of file.entries) {
		const key = entry.artwork.contentSha256
		const list = byArtwork.get(key)
		if (list === undefined) byArtwork.set(key, [entry])
		else list.push(entry)
	}
	const groups = [...byArtwork.entries()]
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([, list]) => list.sort((a, b) => (a.entryId < b.entryId ? -1 : 1)))

	const slice = groups.slice(offset, offset + limit)
	const results: ArtworkResult[] = []
	const startedAt = Date.now()

	for (let i = 0; i < slice.length; i += 1) {
		const result = await runArtwork(slice[i], edgeRankK)
		results.push(result)
		process.stderr.write(
			`[${offset}+${i + 1}/${slice.length}] ${result.imagePath} ${result.width}x${result.height} ` +
				`edges=${result.edgePixels} band=${result.bandPixels} ${result.milliseconds}ms` +
				`${result.decodeError ? ` ERROR ${result.decodeError}` : ""}\n`,
		)
		// Incremental write: a crash at artwork 140 must not cost the first 139.
		writeFileSync(
			outPath,
			JSON.stringify({
				meta: {
					offset,
					limit,
					artworksInChunk: slice.length,
					artworksDone: results.length,
					edgeRankK,
					fieldQuantileBeta: FIELD_QUANTILE_BETA,
					elapsedMs: Date.now() - startedAt,
				},
				artworks: results,
			}),
		)
	}
}

await main()

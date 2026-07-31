/**
 * Task 2(a) — border / frame / matte prior audit (literature review item I10).
 *
 * Question: how many corpus artworks carry a border, frame, or matte — a near-uniform
 * ring of colour at the image edge, materially distinct from the interior — and for
 * those, is the current winner's `background` that frame colour rather than the
 * artwork's own field?
 *
 * Detection (measurement only; no algorithm change). Ring `d` is the one-pixel-thick
 * rectangle outline inset by `d` pixels. A frame of thickness `D` exists when
 *   - every ring 0..D is internally near-uniform (RMS OKLab deviation below
 *     `RING_UNIFORMITY`), and
 *   - every ring 0..D agrees with ring 0's mean (within `RING_COHESION`), and
 *   - `D + 1` is at least `MINIMUM_THICKNESS_FRACTION` of the short side, so a
 *     single-pixel JPEG edge artefact or an antialiased margin cannot qualify, and
 *   - the run *ends* before `MAXIMUM_THICKNESS_FRACTION` of the short side — a run that
 *     saturates the cap means no inner edge was ever found, which describes a broad flat
 *     field (`pureblack`, `purewhite`, `slipknot`) rather than a frame, and
 *   - the whole interior past `D` departs from the frame colour by at least
 *     `FRAME_DISTINCT`.
 *
 * The distinctness threshold is the algorithm's own family anchor radius (0.058): two
 * colours closer than that are one family to the rest of the pipeline, so a "frame" the
 * algorithm cannot separate from the interior is not a frame for this question.
 *
 * The interior mean, not the ring immediately past the run, is the discriminator. The
 * first ring inward from a matte is still mostly matte colour — it merely stopped being
 * *uniform* because the artwork began to intrude on it — so testing it rejects exactly the
 * wide mattes the audit is looking for (`nobs`' white margin was a measured false negative
 * of that earlier rule). `nextRingDistance` is still reported, as diagnostic only.
 *
 *   PALETTE_IMAGES_ROOT=/abs/path/to/images node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/border-frame-audit.ts \
 *       [--set base|offpanel|offpanel-wide|base+offpanel] [--json <path>]
 */
import { readFile, writeFile } from "node:fs/promises"

import { extractPalette } from "../../v2-3/index.ts"
import { labAt, okDistance, oklabToRGB, rgbToHex, toLabBuffer } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"

import { corpusEntries, imagesRoot } from "./corpus.ts"

/** Family anchor radius: below this the pipeline treats two colours as one family. */
const FRAME_DISTINCT = 0.058
const RING_UNIFORMITY = 0.030
const RING_COHESION = 0.030
const MINIMUM_THICKNESS_FRACTION = 0.008
const MAXIMUM_THICKNESS_FRACTION = 0.22

type RingStat = Readonly<{ mean: OKLab; deviation: number }>

function ringAt(labs: Float32Array, width: number, height: number, inset: number): RingStat | null {
	const minX = inset
	const minY = inset
	const maxX = width - 1 - inset
	const maxY = height - 1 - inset
	if (maxX <= minX || maxY <= minY) return null
	const indexes: number[] = []
	for (let x = minX; x <= maxX; x++) {
		indexes.push(minY * width + x)
		indexes.push(maxY * width + x)
	}
	for (let y = minY + 1; y < maxY; y++) {
		indexes.push(y * width + minX)
		indexes.push(y * width + maxX)
	}
	let sumL = 0
	let sumA = 0
	let sumB = 0
	for (const index of indexes) {
		const lab = labAt(labs, index)
		sumL += lab[0]
		sumA += lab[1]
		sumB += lab[2]
	}
	const mean: OKLab = [sumL / indexes.length, sumA / indexes.length, sumB / indexes.length]
	let squares = 0
	for (const index of indexes) squares += okDistance(labAt(labs, index), mean) ** 2
	return { mean, deviation: Math.sqrt(squares / indexes.length) }
}

function interiorMean(labs: Float32Array, width: number, height: number, inset: number): OKLab | null {
	const minX = inset
	const minY = inset
	const maxX = width - 1 - inset
	const maxY = height - 1 - inset
	if (maxX <= minX || maxY <= minY) return null
	let sumL = 0
	let sumA = 0
	let sumB = 0
	let population = 0
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			const lab = labAt(labs, y * width + x)
			sumL += lab[0]
			sumA += lab[1]
			sumB += lab[2]
			population += 1
		}
	}
	if (population === 0) return null
	return [sumL / population, sumA / population, sumB / population]
}

type FrameDetection = Readonly<{
	detected: boolean
	thickness: number
	thicknessFraction: number
	frameHex: string | null
	interiorDistance: number
	nextRingDistance: number
	reason: string
}>

type FrameMeasurement = Readonly<{ detection: FrameDetection; frameMean: OKLab | null }>

function detectFrame(labs: Float32Array, width: number, height: number): FrameMeasurement {
	const shortSide = Math.min(width, height)
	const minimumThickness = Math.max(2, Math.ceil(shortSide * MINIMUM_THICKNESS_FRACTION))
	const maximumThickness = Math.floor(shortSide * MAXIMUM_THICKNESS_FRACTION)
	const none = (reason: string): FrameMeasurement => ({
		frameMean: null,
		detection: {
			detected: false, thickness: 0, thicknessFraction: 0, frameHex: null,
			interiorDistance: 0, nextRingDistance: 0, reason,
		},
	})
	const first = ringAt(labs, width, height, 0)
	if (!first) return none("degenerate image")
	if (first.deviation > RING_UNIFORMITY) return none("outermost ring is not near-uniform")
	let sumL = 0
	let sumA = 0
	let sumB = 0
	let count = 0
	let run = -1
	for (let inset = 0; inset <= maximumThickness; inset++) {
		const ring = ringAt(labs, width, height, inset)
		if (!ring) break
		if (ring.deviation > RING_UNIFORMITY) break
		if (okDistance(ring.mean, first.mean) > RING_COHESION) break
		sumL += ring.mean[0]
		sumA += ring.mean[1]
		sumB += ring.mean[2]
		count += 1
		run = inset
	}
	if (run < 0) return none("no uniform edge run")
	const thickness = run + 1
	if (thickness < minimumThickness) {
		return none(`uniform edge run is ${thickness}px, below the ${minimumThickness}px floor`)
	}
	const frameMean: OKLab = [sumL / count, sumA / count, sumB / count]
	const frameHex = rgbToHex(oklabToRGB(frameMean))
	const nextRing = ringAt(labs, width, height, run + 1)
	const interior = interiorMean(labs, width, height, run + 1)
	if (!nextRing || !interior) return none("no interior past the uniform run")
	const nextRingDistance = okDistance(nextRing.mean, frameMean)
	const interiorDistance = okDistance(interior, frameMean)
	const base = {
		thickness, thicknessFraction: thickness / shortSide, frameHex, interiorDistance, nextRingDistance,
	}
	if (run >= maximumThickness) {
		return {
			frameMean,
			detection: { ...base, detected: false, reason: "uniform run never ends (broad flat field, not a frame)" },
		}
	}
	if (interiorDistance < FRAME_DISTINCT) {
		return {
			frameMean,
			detection: { ...base, detected: false, reason: "interior mean is within one family of the edge colour" },
		}
	}
	return {
		frameMean,
		detection: { ...base, detected: true, reason: "uniform edge ring distinct from interior" },
	}
}

const args = process.argv.slice(2)
const setIndex = args.indexOf("--set")
const set = setIndex >= 0 ? args[setIndex + 1] : "base"
const jsonIndex = args.indexOf("--json")
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null

const entries = corpusEntries(set)
console.log(`${entries.length} image(s) from ${imagesRoot} (--set ${set})\n`)

type Row = Readonly<{
	id: string
	frame: FrameDetection
	backgroundHex: string
	surfaceHex: string
	backgroundDistance: number | null
	surfaceDistance: number | null
	backgroundIsFrame: boolean
	gradient: boolean
}>

const rows: Row[] = []
for (const [index, entry] of entries.entries()) {
	const image = await loadNativeImage(await readFile(entry.path))
	const labs = toLabBuffer(image.data)
	const { detection, frameMean } = detectFrame(labs, image.width, image.height)
	const extraction = extractPalette(image)
	const background = extraction.winner.background
	const surface = extraction.winner.surface
	const backgroundDistance = frameMean === null ? null : okDistance(background.oklab, frameMean)
	const surfaceDistance = frameMean === null ? null : okDistance(surface.oklab, frameMean)
	const row: Row = {
		id: entry.id,
		frame: detection,
		backgroundHex: background.hex,
		surfaceHex: surface.hex,
		backgroundDistance,
		surfaceDistance,
		backgroundIsFrame: detection.detected && backgroundDistance !== null && backgroundDistance <= FRAME_DISTINCT,
		gradient: extraction.winner.gradient,
	}
	rows.push(row)
	const flag = detection.detected ? (row.backgroundIsFrame ? "FRAME->BG" : "frame    ") : "-        "
	console.log(`[${index + 1}/${entries.length}] ${flag} ${entry.id.padEnd(46)} `
		+ (detection.detected
			? `${detection.frameHex} ${detection.thickness}px (${(detection.thicknessFraction * 100).toFixed(1)}%) `
			+ `interior d=${detection.interiorDistance.toFixed(3)} | bg ${row.backgroundHex} d=${(backgroundDistance ?? 0).toFixed(3)}`
			: detection.reason))
}

const framed = rows.filter(({ frame }) => frame.detected)
const captured = framed.filter(({ backgroundIsFrame }) => backgroundIsFrame)
console.log(`\n== summary (--set ${set}) ==`)
console.log(`${rows.length} artworks, ${framed.length} with a detected border/frame/matte`)
console.log(`${captured.length} of those have the winner's background AT the frame colour (<= ${FRAME_DISTINCT} OKLab)`)
for (const row of framed) {
	console.log(`  ${row.backgroundIsFrame ? "captured" : "ok      "} ${row.id.padEnd(46)} frame ${row.frame.frameHex} `
		+ `${row.frame.thickness}px  bg ${row.backgroundHex} d=${(row.backgroundDistance ?? 0).toFixed(3)}  `
		+ `${row.gradient ? "gradient" : "flat"}`)
}

if (jsonPath) {
	await writeFile(jsonPath, `${JSON.stringify({
		imagesRoot,
		set,
		thresholds: {
			FRAME_DISTINCT, RING_UNIFORMITY, RING_COHESION,
			MINIMUM_THICKNESS_FRACTION, MAXIMUM_THICKNESS_FRACTION,
		},
		total: rows.length,
		framed: framed.length,
		captured: captured.length,
		rows,
	}, null, "\t")}\n`)
	console.log(`\n-> ${jsonPath}`)
}

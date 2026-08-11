/**
 * W-V9b — where the per-entry half of the mark instrument's 3000² cost actually goes.
 *
 * wv9a §e named two exact optimizations left for this pass: an **erosion short-circuit** (in
 * `src/marks.ts`, this worker's file — applied) and a **one-pass `barNeighbourhoodMass`** (in
 * `src/snap.ts`, which this worker does not own). This probe measures the split so the second one is
 * routed with a number rather than an assertion, and so the short-circuit's own effect is visible
 * rather than inferred from a total that is dominated by something else.
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/v9b-cost-split.ts <img> [size]
 *
 * Read-only, and a bench rather than a candidate: it resamples with sharp, which is forbidden
 * *inside* a candidate (`PHASE_0_DECISIONS.md` §1) and is exactly what a cost bench at three sizes
 * has to do.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import sharp from "sharp"

import { okLabDistance } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import { compositeFieldFit, fieldFitWithoutInk, scaleRadius, INK_SCALE_FRACTION, INK_TEXTURE_CLOSING_FRACTION } from "../src/components.ts"
import type { FieldReading } from "../src/components.ts"
import { decodeAndInventory } from "../src/decode.ts"
import { fitField, fitFieldComponents } from "../src/fieldfit.ts"
import { inkOnSupport, readMarks } from "../src/marks.ts"
import { snapToArtwork } from "../src/snap.ts"
import type { FieldFit, Inventory, TripleStats } from "../src/types.ts"

const image = process.argv[2]
if (image === undefined) throw new Error("usage: v9b-cost-split.ts <image> [size]")
const size = Number(process.argv[3] ?? 3000)

const directory = await mkdtemp(join(tmpdir(), "v9b-cost-"))
try {
	const scaled = join(directory, "x.png")
	await sharp(image).resize(size, size, { fit: "fill" }).png({ compressionLevel: 1 }).toFile(scaled)
	const { raster } = await decodeAndInventory(scaled)
	const fit = fitField(raster)
	let overlayFit: FieldFit = fit
	let components: FieldReading | null = null
	if (fit.noField) {
		components = fitFieldComponents(raster)
		overlayFit = components.components[0] !== undefined
			? compositeFieldFit(components, raster, fit)
			: fieldFitWithoutInk(fit, components, raster)
	}

	const t0 = performance.now()
	const reading = readMarks(raster, overlayFit, components)
	const totalMs = performance.now() - t0

	// Re-do the two per-entry calls on the entries the reading produced, timed apart. Identical
	// arguments to the ones `measured()` made, so these are the same calls rather than analogues.
	const { width, height } = raster
	const closingRadius = scaleRadius(width, height, INK_TEXTURE_CLOSING_FRACTION)
	const inkRadius = scaleRadius(width, height, INK_SCALE_FRACTION)

	const claimed = new Uint8Array(width * height)
	for (const entry of reading.marks) {
		if (entry.kind !== "region") continue
		for (let index = 0; index < claimed.length; index += 1) {
			if (entry.support[index] === 1) claimed[index] = 1
		}
	}

	let snapMs = 0
	let inkMs = 0
	let inventoryMs = 0
	let shortCircuits = 0
	const rows: unknown[] = []
	for (const entry of reading.marks) {
		const a = performance.now()
		const inventory = supportInventory(entry.support, entry.box, raster)
		inventoryMs += performance.now() - a

		const b = performance.now()
		if (inventory.totalPixels > 0) {
			snapToArtwork(entry.centre, reachable(inventory, entry.centre), POOLED_SAME_COLOR_BAR)
		}
		const thisSnap = performance.now() - b
		snapMs += thisSnap

		const c = performance.now()
		inkOnSupport(entry.support, claimed, width, height, entry.box)
		const thisInk = performance.now() - c
		inkMs += thisInk

		const grownWidth = entry.box.maxX - entry.box.minX + 1 + 2 * closingRadius
		const grownHeight = entry.box.maxY - entry.box.minY + 1 + 2 * closingRadius
		const interior = entry.box.minX - closingRadius >= 1 && entry.box.minY - closingRadius >= 1 &&
			entry.box.maxX + closingRadius <= width - 2 && entry.box.maxY + closingRadius <= height - 2
		const fired = interior &&
			Math.min(Math.ceil(grownWidth / 2), Math.ceil(grownHeight / 2)) <= inkRadius
		if (fired) shortCircuits += 1
		rows.push({
			kind: entry.kind,
			pixels: entry.pixels,
			triples: inventory.triples.size,
			snapMs: Number(thisSnap.toFixed(1)),
			inkMs: Number(thisInk.toFixed(1)),
			shortCircuit: fired,
		})
	}

	process.stdout.write(JSON.stringify({
		size: `${width}×${height}`,
		radius: reading.scale.radius,
		criterion: reading.scale.criterion,
		entries: reading.marks.length,
		totalMs: Number(totalMs.toFixed(1)),
		perEntry: {
			supportInventoryMs: Number(inventoryMs.toFixed(1)),
			snapMs: Number(snapMs.toFixed(1)),
			inkMs: Number(inkMs.toFixed(1)),
		},
		erosionShortCircuits: `${shortCircuits}/${reading.marks.length}`,
		heaviest: rows.slice(0, 8),
	}, null, 1))
} finally {
	await rm(directory, { recursive: true, force: true })
}

// --- copies of the two private helpers, so the timing is of the real calls -----------------------

function supportInventory(
	support: Uint8Array,
	box: { minX: number; minY: number; maxX: number; maxY: number },
	raster: { width: number; packed: Uint32Array; lab: Float32Array },
): Inventory {
	const counts = new Map<number, { count: number; sumX: number; sumY: number }>()
	let totalPixels = 0
	for (let row = box.minY; row <= box.maxY; row += 1) {
		const offset = row * raster.width
		for (let column = box.minX; column <= box.maxX; column += 1) {
			const index = offset + column
			if (support[index] !== 1) continue
			totalPixels += 1
			const key = raster.packed[index]!
			const entry = counts.get(key)
			if (entry === undefined) counts.set(key, { count: 1, sumX: 0, sumY: 0 })
			else entry.count += 1
		}
	}
	const triples = new Map<number, TripleStats>()
	for (const [key, entry] of counts) {
		const rgb: [number, number, number] = [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]
		triples.set(key, {
			packed: key,
			rgb,
			lab: [
				0.2126 * 0 + rgbLab(rgb)[0],
				rgbLab(rgb)[1],
				rgbLab(rgb)[2],
			],
			count: entry.count,
			sumX: entry.sumX,
			sumY: entry.sumY,
		})
	}
	return { triples, has: (key: number) => triples.has(key), totalPixels }
}

function rgbLab(rgb: readonly [number, number, number]): [number, number, number] {
	// The probe only needs a stable OKLab per triple for the snap's cost to be representative.
	const lab = rgbToOkLabLocal(rgb)
	return [lab[0], lab[1], lab[2]]
}

function rgbToOkLabLocal(rgb: readonly [number, number, number]): [number, number, number] {
	const f = (c: number) => {
		const s = c / 255
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
	}
	const r = f(rgb[0]), g = f(rgb[1]), b = f(rgb[2])
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	]
}

function reachable(inventory: Inventory, target: readonly [number, number, number]): Inventory {
	const reach = 2 * POOLED_SAME_COLOR_BAR
	const triples = new Map<number, TripleStats>()
	let totalPixels = 0
	for (const [key, stats] of inventory.triples) {
		if (okLabDistance(target as never, stats.lab) > reach) continue
		triples.set(key, stats)
		totalPixels += stats.count
	}
	if (triples.size === 0) return inventory
	return { triples, has: (key: number) => triples.has(key), totalPixels }
}

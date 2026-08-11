/**
 * W-V9a probe — instrument cost per cover at three sizes (`V9_BRIEF.md` measurement (e)).
 *
 * Read-only. One cover is resampled to 300², 640² and 3000² with sharp — resampling is forbidden
 * *inside* a candidate (`PHASE_0_DECISIONS.md` §1) and this is not a candidate: it is a cost bench,
 * and the three rasters are three inputs, not three readings of one input.
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/v9a-cost.ts <img…>
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import sharp from "sharp"

import { compositeFieldFit, fieldFitWithoutInk } from "../src/components.ts"
import type { FieldReading } from "../src/components.ts"
import { decodeAndInventory } from "../src/decode.ts"
import { fitField, fitFieldComponents } from "../src/fieldfit.ts"
import { identityFamiliesV2, readMarks } from "../src/marks.ts"
import type { FieldFit } from "../src/types.ts"

const images = process.argv.slice(2)
if (images.length === 0) throw new Error("usage: v9a-cost.ts <image…>")

const SIZES = [300, 640, 3000]
const directory = await mkdtemp(join(tmpdir(), "v9a-cost-"))
const rows: unknown[] = []

try {
	for (const image of images) {
		for (const size of SIZES) {
			const scaled = join(directory, `${size}.png`)
			await sharp(image).resize(size, size, { fit: "fill" }).png({ compressionLevel: 1 }).toFile(scaled)

			const t0 = performance.now()
			const { raster } = await decodeAndInventory(scaled)
			const tDecode = performance.now() - t0

			const t1 = performance.now()
			const fit = fitField(raster)
			let overlayFit: FieldFit = fit
			let components: FieldReading | null = null
			if (fit.noField) {
				components = fitFieldComponents(raster)
				overlayFit = components.components[0] !== undefined
					? compositeFieldFit(components, raster, fit)
					: fieldFitWithoutInk(fit, components, raster)
			}
			const tFit = performance.now() - t1

			const t2 = performance.now()
			const reading = readMarks(raster, overlayFit, components)
			const tMarks = performance.now() - t2

			const t3 = performance.now()
			const families = identityFamiliesV2(reading.marks, reading.totalPixels)
			const tFamilies = performance.now() - t3

			rows.push({
				image,
				size: `${raster.width}×${raster.height}`,
				decodeMs: Number(tDecode.toFixed(1)),
				fitMs: Number(tFit.toFixed(1)),
				marksMs: Number(tMarks.toFixed(1)),
				familiesMs: Number(tFamilies.toFixed(2)),
				marksOverFit: Number((tMarks / tFit).toFixed(2)),
				sweepRungs: reading.scale.scales.length,
				radius: reading.scale.radius,
				criterion: reading.scale.criterion,
				entries: reading.marks.length,
				families: families.families.length,
			})
		}
	}
} finally {
	await rm(directory, { recursive: true, force: true })
}

process.stdout.write(JSON.stringify(rows, null, 1))

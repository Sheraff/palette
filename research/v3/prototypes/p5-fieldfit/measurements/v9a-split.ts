/** W-V9a throwaway split-timing probe: sweep vs grouping vs per-entry measurement. Read-only. */
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { compositeFieldFit, fieldFitWithoutInk } from "../src/components.ts"
import type { FieldReading } from "../src/components.ts"
import { decodeAndInventory } from "../src/decode.ts"
import { fitField, fitFieldComponents } from "../src/fieldfit.ts"
import { chooseGroupingScale, groupAtScale, readMarks } from "../src/marks.ts"
import type { FieldFit } from "../src/types.ts"

const image = process.argv[2]!
const size = Number(process.argv[3] ?? 3000)
const directory = await mkdtemp(join(tmpdir(), "v9a-split-"))
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
const pixelCount = raster.width * raster.height
const claimed = new Uint8Array(pixelCount)
if (components !== null && components.components.length > 0) {
	for (let i = 0; i < pixelCount; i += 1) if (components.labels[i] !== 0) claimed[i] = 1
} else {
	for (let i = 0; i < pixelCount; i += 1) if (overlayFit.weights[i]! > 0.5) claimed[i] = 1
}
const unexplained = new Uint8Array(pixelCount)
for (let i = 0; i < pixelCount; i += 1) unexplained[i] = claimed[i] === 0 ? 1 : 0

const a = performance.now()
const scale = chooseGroupingScale(unexplained, raster.width, raster.height)
const sweepMs = performance.now() - a
const b = performance.now()
const groups = groupAtScale(unexplained, raster.width, raster.height, scale.radius)
const groupMs = performance.now() - b
const c = performance.now()
const reading = readMarks(raster, overlayFit, components)
const totalMs = performance.now() - c
await rm(directory, { recursive: true, force: true })
process.stdout.write(JSON.stringify({
	size: `${raster.width}×${raster.height}`, radius: scale.radius, rungs: scale.scales.length,
	groups: groups.length, entries: reading.marks.length,
	sweepMs: +sweepMs.toFixed(1), groupMs: +groupMs.toFixed(1), totalMs: +totalMs.toFixed(1),
	perEntryMs: +(totalMs - sweepMs - groupMs).toFixed(1),
}, null, 1))

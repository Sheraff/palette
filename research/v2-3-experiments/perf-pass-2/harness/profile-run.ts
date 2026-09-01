import { resolve } from "node:path"

import sharp from "sharp"

import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../../v2-3/src/internal/palette.ts"
// @ts-expect-error generated only inside the instrumented copy
import { __profReset, __profSnapshot } from "../../../v2-3/src/internal/__prof.ts"

import { imagesRoot } from "../../perf-pass/harness/corpus.ts"
import { PROFILE_SET } from "../../perf-pass/harness/bench.ts"

sharp.concurrency(1)

function micros(): number {
	const { user, system } = process.cpuUsage()
	return user + system
}

async function main(): Promise<void> {
	const images = []
	for (const name of PROFILE_SET) images.push(await loadNativeImage(resolve(imagesRoot, name)))

	// Warm up so JIT tiering is not charged to the measured pass.
	for (const image of images) extractPaletteDetails(image)

	__profReset()
	const start = micros()
	for (const image of images) extractPaletteDetails(image)
	const totalAlgoUs = micros() - start

	console.log(JSON.stringify({ imagesRoot, images: images.length, totalAlgoUs, rows: __profSnapshot() }))
}

await main()

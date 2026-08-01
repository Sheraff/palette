import { resolve } from "node:path"

import sharp from "sharp"

import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../../v2-3/src/internal/palette.ts"

import { imagesRoot } from "./corpus.ts"
import { PROFILE_SET } from "./bench.ts"

sharp.concurrency(1)

/** Runs the representative set once under whatever profiler the parent `node` flags enabled. */
async function main(): Promise<void> {
	process.stderr.write(`imagesRoot=${imagesRoot}\n`)
	for (const name of PROFILE_SET) {
		const image = await loadNativeImage(resolve(imagesRoot, name))
		extractPaletteDetails(image)
	}
}

await main()

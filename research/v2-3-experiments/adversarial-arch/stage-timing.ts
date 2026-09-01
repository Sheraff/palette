/**
 * Coarse stage timing for `extractPaletteDetails`, using only the public internal
 * exports of `research/v2-3/`. Nothing under `research/v2-3/` is modified.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/adversarial-arch/stage-timing.ts [image...]
 *
 * Stages are measured by re-running the two front stages standalone and
 * subtracting them from a full run, so `rest` covers candidate materialization,
 * role evidence, winner scoring, winner selection and gradient support.
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import type { RawImage } from "../../v2-3/src/internal/types.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))

const DEFAULT_IMAGES = [
	"placebo.jpg",
	"loups.jpg",
	"birdsofprey.jpg",
	"knuckles.jpg",
	"orelsan.jpg",
	"black.jpg",
]

function milliseconds(run: () => unknown): number {
	const started = process.hrtime.bigint()
	run()
	return Number(process.hrtime.bigint() - started) / 1e6
}

const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_IMAGES
const rows: Array<Record<string, string>> = []

for (const name of names) {
	const path = resolve(repositoryRoot, "images", name)
	const bytes = await readFile(path)
	const image: RawImage = await loadNativeImage(bytes)
	const pixels = image.width * image.height

	// Warm the module graph and the JIT once before measuring.
	extractPaletteDetails(image)

	let seed: ReturnType<typeof buildPaletteSeedDomain> | null = null
	const seedMs = milliseconds(() => {
		seed = buildPaletteSeedDomain(image)
	})
	const commonMs = milliseconds(() => buildAlbumArtworkPaletteV2Phase3CommonBase(seed!))
	const totalMs = milliseconds(() => extractPaletteDetails(image))
	const restMs = totalMs - seedMs - commonMs

	rows.push({
		image: name,
		pixels: `${(pixels / 1e6).toFixed(2)}MP`,
		total: totalMs.toFixed(0),
		seed: `${seedMs.toFixed(0)} (${((seedMs / totalMs) * 100).toFixed(0)}%)`,
		commonBase: `${commonMs.toFixed(0)} (${((commonMs / totalMs) * 100).toFixed(0)}%)`,
		rest: `${restMs.toFixed(0)} (${((restMs / totalMs) * 100).toFixed(0)}%)`,
	})
	console.log(rows.at(-1))
}

const columns = ["image", "pixels", "total", "seed", "commonBase", "rest"]
console.log(`\n| ${columns.join(" | ")} |`)
console.log(`| ${columns.map(() => "---").join(" | ")} |`)
for (const row of rows) console.log(`| ${columns.map((column) => row[column]).join(" | ")} |`)

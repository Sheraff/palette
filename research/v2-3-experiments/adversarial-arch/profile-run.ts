/**
 * One extraction, for `node --cpu-prof` to sample. See `cpuprof-summary.ts`.
 *
 *   node --no-warnings --experimental-strip-types --cpu-prof \
 *     --cpu-prof-dir research/v2-3-experiments/adversarial-arch/prof \
 *     research/v2-3-experiments/adversarial-arch/profile-run.ts placebo.jpg
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const name = process.argv[2] ?? "placebo.jpg"
const image = await loadNativeImage(await readFile(resolve(repositoryRoot, "images", name)))
const details = extractPaletteDetails(image)
console.log(name, details.winner.background.hex, details.winner.surface.hex,
	details.winner.foreground.hex, details.winner.accent.hex, details.winner.gradient)

/**
 * How wrong is 5-point sampling, on the real corpus?
 *
 * For every gradient winner, compare what the current 5 sample positions report against the
 * continuum for both roles: minimum |Lc|, and whether a polarity crossing exists at all.
 */
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { earnedRenderMidpoint, renderedFieldColor } from "../../v2-3/src/internal/palette-core.ts"
import { apcaContrast, oklabToRGB } from "../../v2-3/src/internal/color.ts"
import { continuumProfile } from "./continuum.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

const imagesRoot = resolve(process.env.PALETTE_IMAGES_ROOT ?? "images")
const corpusRoot = resolve(imagesRoot, "..")
const warehouse = resolve(corpusRoot, "research/v2-3-eval/data/results/trunk-a5")
const BAR = 9
const SAMPLES = [0, 0.25, 0.5, 0.75, 1]

const entries = (await readdir(warehouse)).filter((n) => n.endsWith(".json")).sort()
const rows: Array<Readonly<{ image: string; role: string; sampledMin: number; trueMin: number
	sampledFlip: boolean; trueCrossings: number; indistinct: number }>> = []

for (const entry of entries) {
	const cached = JSON.parse(await readFile(resolve(warehouse, entry), "utf8")) as
		Readonly<{ image: string; imagePath: string }>
	if (cached.image.includes("-scrambled.")) continue
	const image = await loadNativeImage(await readFile(resolve(corpusRoot, cached.imagePath)))
	const details = extractPaletteDetails(image)
	const winner = details.winner
	if (!winner.gradient) continue
	const midpoint = earnedRenderMidpoint(winner.background, winner.surface, winner.gradientEvidence?.fieldMidpoint)
	for (const [role, colour] of [["foreground", winner.foreground], ["accent", winner.accent]] as const) {
		const rgb = colour.rgb as RGB
		const sampled = SAMPLES.map((t) => apcaContrast(rgb,
			oklabToRGB(renderedFieldColor(winner.background.oklab, winner.surface.oklab, midpoint, t))))
		const profile = continuumProfile(rgb, winner.background.oklab, winner.surface.oklab, midpoint, BAR)
		rows.push({
			image: cached.image, role,
			sampledMin: Math.min(...sampled.map(Math.abs)),
			trueMin: profile.minimumAbsoluteLc,
			sampledFlip: sampled.some((v) => v > 0) && sampled.some((v) => v < 0),
			trueCrossings: profile.crossings.length,
			indistinct: profile.indistinctFraction,
		})
	}
}

console.log("image".padEnd(24), "role".padEnd(11), "sampMin", "trueMin", "  error", "sampFlip", "trueX", "indistinct%")
let worst = 0
let missedCrossings = 0
let phantomCrossings = 0
for (const r of rows) {
	const error = r.sampledMin - r.trueMin
	worst = Math.max(worst, Math.abs(error))
	if (!r.sampledFlip && r.trueCrossings > 0) missedCrossings += 1
	if (r.sampledFlip && r.trueCrossings === 0) phantomCrossings += 1
	const flag = Math.abs(error) > 1 || (!r.sampledFlip && r.trueCrossings > 0) ? "  <<<" : ""
	console.log(
		r.image.slice(0, 23).padEnd(24), r.role.padEnd(11),
		r.sampledMin.toFixed(2).padStart(7), r.trueMin.toFixed(2).padStart(7), error.toFixed(2).padStart(7),
		String(r.sampledFlip).padStart(8), String(r.trueCrossings).padStart(5),
		(r.indistinct * 100).toFixed(1).padStart(11), flag,
	)
}
console.log(`\n${rows.length} role/gradient pairs`)
console.log(`worst |Lc| minimum error from sampling : ${worst.toFixed(2)}`)
console.log(`crossings the 5 samples MISSED         : ${missedCrossings}`)
console.log(`crossings the 5 samples INVENTED       : ${phantomCrossings}`)

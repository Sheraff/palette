/**
 * Narrow-repair worker: extract each artwork once per coverage configuration and record the
 * published palette, so every configuration's blast radius can be diffed against the guard-off
 * census.
 *
 * The repair runs last and nothing feeds back into ranking, so the pre-repair winner is the same in
 * every configuration; only what the repair does to it differs. The configurations are therefore
 * directly comparable to each other as well as to trunk.
 *
 * Usage: repair-worker.ts <jobListFile> <outFile> <workerIndex> <workerCount>
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs"

import sharp from "sharp"

import { apcaContrast, perceptualDifference } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

import { CONFIGURATIONS } from "./repair-configurations.ts"

sharp.concurrency(1)

const [jobListFile, outFile, indexText, countText, configText] = process.argv.slice(2)
const workerIndex = Number(indexText)
const workerCount = Number(countText)
/**
 * Which configurations this run measures. The full-corpus pass only needs the widest one — it
 * exists to prove the repair reaches nothing it should not — while the pass over artworks that
 * actually carry a defect measures all four, and that set is small enough for four extractions each.
 */
const selected = (configText ? configText.split(",") : Object.keys(CONFIGURATIONS))
	.map((name) => {
		const configuration = CONFIGURATIONS[name]
		if (!configuration) throw new Error(`unknown configuration ${name}`)
		return [name, configuration] as const
	})

const jobs = readFileSync(jobListFile, "utf8").split("\n").filter((line) => line.trim().length > 0)
	.filter((_, position) => position % workerCount === workerIndex)

const done = new Set<string>()
if (existsSync(outFile)) {
	for (const line of readFileSync(outFile, "utf8").split("\n")) {
		if (!line.trim()) continue
		try { done.add(JSON.parse(line).path as string) } catch { /* a torn final line is simply redone */ }
	}
}

/** What the repair did, read back off the winner id — the runtime deliberately publishes no field. */
function outcomeOf(id: string): string {
	if (id.startsWith("zero-contrast-repair-swap:")) return "swap"
	if (id.startsWith("zero-contrast-repair-slate:")) return "slate"
	return "untouched"
}

for (const path of jobs) {
	if (done.has(path)) continue
	let record: Record<string, unknown>
	try {
		const image = await loadNativeImage(path)
		const perConfiguration: Record<string, unknown> = {}
		for (const [name, configuration] of selected) {
			const details = extractPaletteDetails(image, undefined, undefined, undefined,
				configuration.enforced, configuration.protect)
			const winner = details.winner
			const pair = (a: "foreground" | "accent", b: "surface" | "background") => ({
				lc: apcaContrast(winner[a].rgb, winner[b].rgb),
				de: perceptualDifference(winner[a].rgb, winner[b].rgb),
			})
			perConfiguration[name] = {
				background: winner.background.hex,
				surface: winner.surface.hex,
				foreground: winner.foreground.hex,
				accent: winner.accent.hex,
				gradient: winner.gradient,
				collapse: winner.collapse,
				midpoint: details.midpoint.kind === "source-supported-three-stop" ? details.midpoint.color.hex : null,
				outcome: outcomeOf(winner.id),
				id: winner.id,
				fgSurface: pair("foreground", "surface"),
				fgBackground: pair("foreground", "background"),
				accentSurface: pair("accent", "surface"),
				accentBackground: pair("accent", "background"),
			}
		}
		record = { path, configurations: perConfiguration }
	} catch (error) {
		record = { path, error: (error as Error).message }
	}
	appendFileSync(outFile, `${JSON.stringify(record)}\n`)
}

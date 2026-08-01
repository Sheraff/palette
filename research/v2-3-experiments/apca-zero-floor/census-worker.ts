/**
 * Census worker: extract every assigned artwork and record the APCA numbers the zero-contrast
 * question needs. One JSON line per artwork, appended as it completes, so the driver can be killed
 * at any moment and resumed without losing more than the artworks currently in flight.
 *
 * Usage: census-worker.ts <jobListFile> <outFile> <workerIndex> <workerCount>
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs"

import sharp from "sharp"

import { apcaContrast, perceptualDifference } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

sharp.concurrency(1)

const [jobListFile, outFile, indexText, countText] = process.argv.slice(2)
const workerIndex = Number(indexText)
const workerCount = Number(countText)

const jobs = readFileSync(jobListFile, "utf8").split("\n").filter((line) => line.trim().length > 0)
	.filter((_, position) => position % workerCount === workerIndex)

const done = new Set<string>()
if (existsSync(outFile)) {
	for (const line of readFileSync(outFile, "utf8").split("\n")) {
		if (!line.trim()) continue
		try { done.add(JSON.parse(line).path as string) } catch { /* a torn final line is simply redone */ }
	}
}

for (const path of jobs) {
	if (done.has(path)) continue
	let record: Record<string, unknown>
	try {
		const image = await loadNativeImage(path)
		const details = extractPaletteDetails(image)
		const winner = details.winner
		const pair = (a: "foreground" | "accent", b: "surface" | "background") => ({
			lc: apcaContrast(winner[a].rgb, winner[b].rgb),
			de: perceptualDifference(winner[a].rgb, winner[b].rgb),
		})
		record = {
			path,
			width: details.width,
			height: details.height,
			background: winner.background.hex,
			surface: winner.surface.hex,
			foreground: winner.foreground.hex,
			accent: winner.accent.hex,
			gradient: winner.gradient,
			collapse: winner.collapse,
			midpoint: details.midpoint.kind === "source-supported-three-stop" ? details.midpoint.color.hex : null,
			fgSurface: pair("foreground", "surface"),
			fgBackground: pair("foreground", "background"),
			accentSurface: pair("accent", "surface"),
			accentBackground: pair("accent", "background"),
			fieldPairs: winner.contrast.pairs.map((entry) => ({
				role: entry.role, fieldRole: entry.fieldRole, position: entry.position, signedLc: entry.signedLc,
			})),
		}
	} catch (error) {
		record = { path, error: (error as Error).message }
	}
	appendFileSync(outFile, `${JSON.stringify(record)}\n`)
}

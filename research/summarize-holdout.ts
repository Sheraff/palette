import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import { extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, Palette, RoleName } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const holdoutRoot = join(projectRoot, "00")
const resultsPath = join(researchRoot, "data", "results.json")
const holdoutPath = join(researchRoot, "data", "holdout-results.json")
const outputPath = join(researchRoot, "data", "holdout-summary.json")
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const roles: RoleName[] = ["background", "foreground", "surface", "accent"]

function artworkId(file: string): string {
	return file.startsWith("ab67616d") ? file.slice(16) : file
}

function median(values: number[]): number {
	const sorted = [...values].sort((first, second) => first - second)
	return sorted[Math.floor(sorted.length / 2)] || 0
}

function percentile(values: number[], ratio: number): number {
	const sorted = [...values].sort((first, second) => first - second)
	return sorted[Math.round((sorted.length - 1) * ratio)] || 0
}

function summarize(entries: CorpusResult["entries"]): Record<string, number> {
	const palettes = entries.map((entry) => entry.extraction.methods.spatial)
	return {
		entries: entries.length,
		generatedForegrounds: palettes.filter((palette) => palette.foreground.generated).length,
		relaxedBackgrounds: palettes.filter((palette) => palette.metrics.foregroundContrast < 4.5).length,
		relaxedSurfaces: palettes.filter((palette) => palette.metrics.foregroundSurfaceContrast < 4.5).length,
		collapsedSurfaces: palettes.filter((palette) => palette.background.hex === palette.surface.hex).length,
		gradients: palettes.filter((palette) => palette.gradient.isGradient).length,
		medianCandidates: median(entries.map((entry) => entry.extraction.candidates.length)),
		medianReconstructionError: median(palettes.map((palette) => palette.metrics.meanReconstructionError)),
		medianSourceDistance: median(palettes.map((palette) => palette.metrics.meanSourceDistance)),
	}
}

function compare(first: Palette, second: Palette): number[] {
	return roles.map((role) => okDistance(rgbToOKLab(first[role].rgb), rgbToOKLab(second[role].rgb)))
}

const development = JSON.parse(await readFile(resultsPath, "utf8")) as CorpusResult
const holdout = JSON.parse(await readFile(holdoutPath, "utf8")) as CorpusResult
const selectedById = new Map(holdout.entries.map((entry) => [artworkId(basename(entry.file)), entry]))
const groups = new Map<string, string[]>()
for (const file of (await readdir(holdoutRoot)).filter((candidate) => supported.has(extname(candidate).toLowerCase()))) {
	const id = artworkId(file)
	groups.set(id, [...(groups.get(id) || []), file])
}

const movement: number[] = []
const resolutionEntries = [] as Array<{
	artworkId: string
	selectedFile: string
	alternateFile: string
	roleDistance: Record<RoleName, number>
	gradientDisagreement: boolean
}>
let gradientDisagreements = 0
let duplicatePairs = 0
for (const [id, files] of groups) {
	if (files.length < 2) continue
	const selected = selectedById.get(id)
	if (!selected) continue
	const selectedFile = basename(selected.file)
	for (const file of files) {
		if (file === selectedFile) continue
		const alternate = extractPalette(await loadImage(join(holdoutRoot, file))).methods.spatial
		const distances = compare(selected.extraction.methods.spatial, alternate)
		const gradientDisagreement = selected.extraction.methods.spatial.gradient.isGradient !== alternate.gradient.isGradient
		movement.push(...distances)
		if (gradientDisagreement) gradientDisagreements++
		resolutionEntries.push({
			artworkId: id,
			selectedFile,
			alternateFile: file,
			roleDistance: Object.fromEntries(roles.map((role, index) => [role, distances[index]])) as Record<RoleName, number>,
			gradientDisagreement,
		})
		duplicatePairs++
	}
}

const report = {
	generatedAt: new Date().toISOString(),
	algorithmVersion: holdout.algorithmVersion,
	development: summarize(development.entries.filter((entry) => entry.review)),
	holdout: summarize(holdout.entries),
	resolutionConsistency: {
		duplicatePairs,
		roleMedian: median(movement),
		roleP90: percentile(movement, 0.9),
		roleMaximum: Math.max(...movement, 0),
		roleWarnings: movement.filter((value) => value > 0.08).length,
		gradientDisagreements,
		entries: resolutionEntries,
	},
}

await mkdir(join(researchRoot, "data"), { recursive: true })
const temporary = `${outputPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`)
await rename(temporary, outputPath)
console.log(report)

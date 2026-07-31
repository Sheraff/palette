/**
 * Track P probe: diff every completed perturbation run against the baseline winners.
 *
 * Reports, per site, how many artworks changed any published value (the four hexes, the gradient
 * boolean, the midpoint) when the constant moved. The shape of that count is the finding:
 *
 *   - flips concentrated on the artworks a constant was calibrated against  -> a fence around known
 *     cases (fitted), because the constant is doing nothing except holding its own anchors in place;
 *   - flips spread across unrelated artworks                                -> a load-bearing cliff;
 *   - zero flips with a high firing count                                   -> genuinely robust;
 *   - zero flips with a zero firing count                                   -> dead on this corpus.
 *
 * The last two are only distinguishable with the census, which is why it exists.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

type Winner = { image: string; b?: string; s?: string; f?: string; a?: string; g?: boolean; m?: string | null; error?: string }
type Routed = {
	index: number; id: string; file: string; line: number; value: number
	propertyKey: string | null; docComment: string | null; lineText: string
	firings: number; comparisons: number; flip20: number; nearest: number | null
	route: string
}

const readJsonl = (path: string): Map<string, Winner> => {
	const map = new Map<string, Winner>()
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (line.trim().length === 0) continue
		const record = JSON.parse(line) as Winner
		map.set(record.image, record)
	}
	return map
}

const baseline = readJsonl(resolve(trackRoot, "data/baseline-winners.jsonl"))
const routing = (JSON.parse(readFileSync(resolve(trackRoot, "data/routing.json"), "utf8")) as {
	sites: Routed[]
}).sites

/** Which published fields differ. An empty list means the artwork's output is untouched. */
function differences(before: Winner, after: Winner): string[] {
	const changed: string[] = []
	for (const key of ["b", "s", "f", "a", "g", "m"] as const) {
		if (before[key] !== after[key]) changed.push(key)
	}
	return changed
}

const perturbationsDir = resolve(trackRoot, "data/perturbations")
const files = existsSync(perturbationsDir)
	? readdirSync(perturbationsDir).filter((name) => name.endsWith(".jsonl")).sort()
	: []

export type SiteResult = {
	site: number; id: string; file: string; line: number; value: number
	docComment: string | null; lineText: string
	firings: number; comparisons: number; flip20: number; nearest: number | null
	directions: Record<string, {
		images: number; flipped: number; errors: number
		fields: Record<string, number>
		flippedImages: string[]
	}>
	worstFlipped: number
	totalFlipped: number
}

const results = new Map<number, SiteResult>()

for (const name of files) {
	const label = basename(name, ".jsonl")
	const [siteText, direction] = label.split("-")
	const site = Number(siteText)
	const entry = routing[site]
	if (!entry) continue
	const after = readJsonl(resolve(perturbationsDir, name))
	let flipped = 0
	let errors = 0
	const fields: Record<string, number> = {}
	const flippedImages: string[] = []
	for (const [image, before] of baseline) {
		const now = after.get(image)
		if (!now) continue
		if (now.error || before.error) { errors += 1; continue }
		const changed = differences(before, now)
		if (changed.length > 0) {
			flipped += 1
			flippedImages.push(basename(image))
			for (const field of changed) fields[field] = (fields[field] ?? 0) + 1
		}
	}
	const existing = results.get(site) ?? {
		site, id: entry.id, file: entry.file, line: entry.line, value: entry.value,
		docComment: entry.docComment, lineText: entry.lineText,
		firings: entry.firings, comparisons: entry.comparisons,
		flip20: entry.flip20, nearest: entry.nearest,
		directions: {}, worstFlipped: 0, totalFlipped: 0,
	}
	existing.directions[direction ?? "?"] = {
		images: after.size, flipped, errors, fields, flippedImages,
	}
	existing.worstFlipped = Math.max(existing.worstFlipped, flipped)
	existing.totalFlipped += flipped
	results.set(site, existing)
}

const all = [...results.values()].sort((a, b) => b.worstFlipped - a.worstFlipped || a.site - b.site)
writeFileSync(resolve(trackRoot, "data/perturbation-results.json"),
	`${JSON.stringify({ schemaVersion: 1, baselineImages: baseline.size, sites: all }, null, "\t")}\n`)

const complete = all.filter((site) => Object.keys(site.directions).length >= 1)
process.stdout.write(`${files.length} runs covering ${all.length} sites `
	+ `(baseline ${baseline.size} artworks)\n\n`)
process.stdout.write(`sites with any winner change, worst direction first:\n`)
for (const site of complete.filter((entry) => entry.worstFlipped > 0)) {
	const directions = Object.entries(site.directions)
		.map(([name, data]) => `${name}:${data.flipped}`).join(" ")
	process.stdout.write(`  ${String(site.worstFlipped).padStart(3)}  ${site.id} = ${site.value}  `
		+ `[${directions}] firings=${site.firings}\n`)
}
const inert = complete.filter((entry) => entry.worstFlipped === 0)
process.stdout.write(`\n${inert.length} swept sites changed nothing on any of the `
	+ `${baseline.size} artworks.\n`)
const inertLive = inert.filter((entry) => entry.firings > 1000)
process.stdout.write(`  of those, ${inertLive.length} fire >1000 times `
	+ `(robust, not dead).\n`)

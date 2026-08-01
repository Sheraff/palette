/**
 * Map the human-review warehouse onto artwork file paths, so a census row can be asked
 * "was this artwork reviewed, and what was said about the palette we publish for it?".
 *
 * Two things the charter insists on are honoured here. The **latest** verdict per artwork is the
 * authoritative one, so records are read in file order and later ones win. And a correction is
 * *one palette a human would endorse*, never an oracle, so every correction ever recorded for an
 * artwork is kept as an equally valid target rather than collapsed to the most recent.
 *
 * Usage: imported by analyse.ts; run directly to dump the map for inspection.
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const REPO = "/Users/Flo/GitHub/palette"

export type ReviewedPalette = Readonly<{
	label: string
	key: string
	verdict: string | null
	preferred: boolean
	batch: string
	line: number
}>

export type ArtworkReview = Readonly<{
	image: string
	imagePath: string | null
	/** Every palette ever shown for this artwork, with the strongest thing review said about it. */
	seen: Map<string, ReviewedPalette[]>
	/** Every hand-assembled correction, as a role→hex map; partial answers are kept partial. */
	corrections: Array<Record<string, string>>
	latestVerdict: string | null
	latestBatch: string | null
}>

export function paletteKey(palette: Readonly<Record<string, unknown>>): string {
	const role = (name: string) => String((palette[name] as { hex?: string } | undefined)?.hex ?? "").toLowerCase()
	return [role("background"), role("surface"), role("foreground"), role("accent"),
		palette.gradient ? "gradient" : "flat"].join(":")
}

export function loadWarehouse(): Map<string, ArtworkReview> {
	const byImage = new Map<string, ArtworkReview>()

	// Batch files carry the repo-relative path of every reviewed artwork; the warehouse itself
	// only carries the basename, and reviewed artwork is not always in `images/`.
	const pathByImage = new Map<string, string>()
	const batchesRoot = resolve(REPO, "research/v2-3-eval/data/batches")
	for (const file of readdirSync(batchesRoot).sort()) {
		if (!file.endsWith(".json") || file.endsWith(".key.json")) continue
		const batch = JSON.parse(readFileSync(resolve(batchesRoot, file), "utf8"))
		for (const item of batch.items ?? []) if (item.imagePath) pathByImage.set(item.image, item.imagePath)
	}

	const lines = readFileSync(resolve(REPO, "research/v2-3-eval/data/verdicts.jsonl"), "utf8").split("\n")
	for (const [position, text] of lines.entries()) {
		if (!text.trim()) continue
		let record: any
		try { record = JSON.parse(text) } catch { continue }
		const image = record.image as string
		if (!image) continue
		let entry = byImage.get(image)
		if (!entry) {
			entry = {
				image,
				imagePath: pathByImage.get(image) ?? null,
				seen: new Map(),
				corrections: [],
				latestVerdict: null,
				latestBatch: null,
			}
			byImage.set(image, entry)
		}
		const verdict: string | null = record.verdict ?? null
		const applies: string[] = record.verdictApplies ?? []
		for (const [label, palette] of Object.entries(record.palettes ?? {})) {
			const key = paletteKey(palette as Record<string, unknown>)
			const list = entry.seen.get(key) ?? []
			list.push({
				label,
				key,
				verdict: applies.includes(label) ? verdict : null,
				preferred: record.preference?.label === label,
				batch: record.batch,
				line: position + 1,
			})
			entry.seen.set(key, list)
		}
		if (record.corrections && Object.keys(record.corrections).length > 0) {
			entry.corrections.push(record.corrections as Record<string, string>)
		}
		// Later records win: the file is append-only and in submission order.
		;(entry as { latestVerdict: string | null }).latestVerdict = verdict ?? entry.latestVerdict
		;(entry as { latestBatch: string | null }).latestBatch = record.batch ?? entry.latestBatch
	}
	return byImage
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const warehouse = loadWarehouse()
	process.stdout.write(`${warehouse.size} reviewed artworks\n`)
	let withPath = 0, withCorrections = 0
	for (const entry of warehouse.values()) {
		if (entry.imagePath) withPath += 1
		if (entry.corrections.length > 0) withCorrections += 1
	}
	process.stdout.write(`  ${withPath} with a resolved image path, ${withCorrections} with at least one correction\n`)
}

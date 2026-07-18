import { mkdir, readdir, rename, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const holdoutRoot = join(projectRoot, "00")
const outputPath = join(researchRoot, "data", "holdout-results.json")
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])

function artworkId(file: string): string {
	return file.startsWith("ab67616d") ? file.slice(16) : file
}

function sourcePreference(file: string): number {
	if (file.startsWith("ab67616d0000b273")) return 2
	if (file.startsWith("ab67616d00001e02")) return 1
	return 0
}

const sourceByArtwork = new Map<string, string>()
for (const file of (await readdir(holdoutRoot)).filter((candidate) => supported.has(extname(candidate).toLowerCase())).sort()) {
	const id = artworkId(file)
	const current = sourceByArtwork.get(id)
	if (!current || sourcePreference(file) > sourcePreference(current)) sourceByArtwork.set(id, file)
}

const files = [...sourceByArtwork.values()].sort()
const entries: CorpusResult["entries"] = []
for (let index = 0; index < files.length; index++) {
	const sourceFile = files[index]
	const file = `00/${sourceFile}`
	const source = await loadImage(join(holdoutRoot, sourceFile))
	const extraction = extractPalette(source)
	entries.push({
		file,
		kind: "holdout",
		review: false,
		width: source.width,
		height: source.height,
		extraction,
	})
	console.log(`[${index + 1}/${files.length}] ${file}: ${extraction.diagnostics.processingMs}ms`)
}

const result: CorpusResult = {
	generatedAt: new Date().toISOString(),
	algorithmVersion: ALGORITHM_VERSION,
	entries,
}

await mkdir(join(researchRoot, "data"), { recursive: true })
const temporary = `${outputPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`)
await rename(temporary, outputPath)
console.log(`Wrote ${entries.length} holdout results to ${outputPath}`)

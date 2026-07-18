import { mkdir, readdir, rename, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusEntry, CorpusResult } from "./src/types.ts"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const imagesRoot = join(projectRoot, "images")
const outputPath = join(researchRoot, "data", "results.json")

function classify(file: string): CorpusEntry {
	if (file.includes("-masked") || file.includes("-saliency")) {
		return { file, kind: "diagnostic", review: false }
	}
	if (file.startsWith("pure")) {
		return { file, kind: "synthetic", review: true }
	}
	return { file, kind: "artwork", review: true }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const files = (await readdir(imagesRoot))
	.filter((file) => supported.has(extname(file).toLowerCase()))
	.filter((file) => !file.includes("-scrambled"))
	.sort()

const entries: CorpusResult["entries"] = []
for (let index = 0; index < files.length; index++) {
	const file = files[index]
	const source = await loadImage(join(imagesRoot, file))
	const extraction = extractPalette(source)
	entries.push({
		...classify(file),
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
await writeJsonAtomic(outputPath, result)
console.log(`Wrote ${entries.length} corpus results to ${outputPath}`)

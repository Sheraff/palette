import { readdir } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { prepareOutputTarget, resolveOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { extractGuardedPalette } from "./src/guarded-extract.ts"
import { GUARDED_ALGORITHM_VERSION } from "./src/guarded-palette.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusEntry, CorpusResult } from "./src/types.ts"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const imagesRoot = join(projectRoot, "images")
const output = resolveOutputTarget(projectRoot, researchRoot, "results.json", process.env.RESEARCH_OUTPUT_DIR)
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])

function classify(file: string): CorpusEntry {
	if (file.includes("-masked") || file.includes("-saliency")) return { file, kind: "diagnostic", review: false }
	if (file.startsWith("pure")) return { file, kind: "synthetic", review: true }
	return { file, kind: "artwork", review: true }
}

await prepareOutputTarget(output)
const files = (await readdir(imagesRoot))
	.filter((file) => supported.has(extname(file).toLowerCase()) && !file.includes("-scrambled"))
	.sort()
const entries: CorpusResult["entries"] = []
for (const [index, file] of files.entries()) {
	const image = await loadImage(join(imagesRoot, file))
	const { extraction } = extractGuardedPalette(image)
	entries.push({ ...classify(file), width: image.width, height: image.height, extraction })
	console.log(`[${index + 1}/${files.length}] ${file}: ${extraction.diagnostics.processingMs}ms`)
}
await writeJsonAtomic(output, {
	generatedAt: new Date().toISOString(),
	algorithmVersion: GUARDED_ALGORITHM_VERSION,
	entries,
} satisfies CorpusResult)

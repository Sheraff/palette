import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildSelectionManifest } from "./src/corpus-selection.ts"
import type { CorpusResult } from "./src/types.ts"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const resultsPath = join(researchRoot, "data", "holdout-results.json")
const outputPath = join(researchRoot, "data", "selection.json")
const source = await readFile(resultsPath)
const sourceResultsSha256 = createHash("sha256").update(source).digest("hex")
const corpus = JSON.parse(source.toString("utf8")) as CorpusResult
const hashes = new Map<string, string>()

for (const entry of corpus.entries) {
	const bytes = await readFile(join(projectRoot, entry.file))
	hashes.set(entry.file, createHash("sha256").update(bytes).digest("hex"))
}

const manifest = buildSelectionManifest(corpus, hashes, sourceResultsSha256)
await mkdir(join(researchRoot, "data"), { recursive: true })
const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`
await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
await rename(temporary, outputPath)
console.log(`Wrote ${manifest.sourceCount} candidates for a ${manifest.targetSize}-artwork corpus to ${outputPath}`)

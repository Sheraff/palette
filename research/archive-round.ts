import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const resultsPath = join(researchRoot, "data", "results.json")
const feedbackPath = join(researchRoot, "data", "feedback.json")
const roundsRoot = join(researchRoot, "data", "rounds")

const results = JSON.parse(await readFile(resultsPath, "utf8")) as { algorithmVersion?: string }
const feedback = JSON.parse(await readFile(feedbackPath, "utf8")) as { entries?: unknown[] }
const version = results.algorithmVersion
if (!version || !/^[a-z0-9.-]+$/i.test(version)) throw new Error("Results have no valid algorithm version")

const outputPath = join(roundsRoot, `${version}.json`)
try {
	await access(outputPath)
	throw new Error(`Archive already exists: ${outputPath}`)
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}

const archive = {
	archivedAt: new Date().toISOString(),
	algorithmVersion: version,
	results,
	feedback,
}

await mkdir(roundsRoot, { recursive: true })
const temporary = `${outputPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(archive, null, 2)}\n`)
await rename(temporary, outputPath)
console.log(`Archived ${feedback.entries?.length || 0} judgments to ${outputPath}`)

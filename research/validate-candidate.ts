import { readFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { validateCandidateArtifacts } from "./src/candidate-validation.ts"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const arguments_ = process.argv.slice(2)
if (arguments_.length !== 1) throw new Error("Usage: research/validate-candidate.ts <candidate-dir>")

const candidateDirectory = isAbsolute(arguments_[0]) ? resolve(arguments_[0]) : resolve(projectRoot, arguments_[0])

async function readJson(path: string): Promise<unknown> {
	let source: string
	try {
		source = await readFile(path, "utf8")
	} catch (error) {
		throw new Error(`Unable to read ${path}`, { cause: error })
	}
	try {
		return JSON.parse(source)
	} catch (error) {
		throw new Error(`Invalid JSON in ${path}`, { cause: error })
	}
}

const [baselineResults, baselineHoldoutResults, results, holdoutResults] = await Promise.all([
	readJson(join(researchRoot, "data", "results.json")),
	readJson(join(researchRoot, "data", "holdout-results.json")),
	readJson(join(candidateDirectory, "results.json")),
	readJson(join(candidateDirectory, "holdout-results.json")),
])

const summary = validateCandidateArtifacts(
	results,
	holdoutResults,
	baselineResults,
	baselineHoldoutResults,
)
console.log(JSON.stringify(summary, null, 2))

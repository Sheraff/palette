import { readFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCandidateComparisonReport } from "./src/candidate-comparison.ts"

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const arguments_ = process.argv.slice(2)
if (arguments_.length !== 1) throw new Error("Usage: research/compare-candidate.ts <candidate-dir>")

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

async function readSource(path: string): Promise<Buffer> {
	try {
		return await readFile(path)
	} catch (error) {
		throw new Error(`Unable to read ${path}`, { cause: error })
	}
}

function parseJson(source: Buffer, path: string): unknown {
	try {
		return JSON.parse(source.toString("utf8")) as unknown
	} catch (error) {
		throw new Error(`Invalid JSON in ${path}`, { cause: error })
	}
}

const dataRoot = join(researchRoot, "data")
const baselineHoldoutPath = join(dataRoot, "holdout-results.json")
const [baselineResults, baselineHoldoutSource, candidateResults, candidateHoldoutResults, selection, curation, absoluteFeedback] =
	await Promise.all([
		readJson(join(dataRoot, "results.json")),
		readSource(baselineHoldoutPath),
		readJson(join(candidateDirectory, "results.json")),
		readJson(join(candidateDirectory, "holdout-results.json")),
		readJson(join(dataRoot, "selection.json")),
		readJson(join(dataRoot, "curation.json")),
		readJson(join(dataRoot, "absolute-feedback.json")),
	])
const baselineHoldoutResults = parseJson(baselineHoldoutSource, baselineHoldoutPath)

const report = buildCandidateComparisonReport({
	baselineResults,
	baselineHoldoutResults,
	baselineHoldoutSource,
	candidateResults,
	candidateHoldoutResults,
	selection,
	curation,
	absoluteFeedback,
})
console.log(JSON.stringify({ candidateDirectory, ...report }, null, 2))

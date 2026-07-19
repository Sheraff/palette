import { fileURLToPath } from "node:url"
import { resolveExperimentOutput, validateParetoExperimentDirectory } from "./src/pareto-experiment.ts"

const arguments_ = process.argv.slice(2)
if (arguments_.length !== 1) {
	throw new Error("Usage: research/validate-pareto-experiment.ts data/experiments/<name>")
}

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const directory = resolveExperimentOutput(researchRoot, arguments_[0])
const summary = await validateParetoExperimentDirectory(directory, { researchRoot, projectRoot })
console.log(JSON.stringify(summary, null, 2))

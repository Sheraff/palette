import { fileURLToPath } from "node:url"
import { extractParetoPalette } from "./src/pareto-extract.ts"
import { runParetoExperiment } from "./src/pareto-experiment.ts"

const arguments_ = process.argv.slice(2)
if (arguments_.length !== 1) {
	throw new Error("Usage: research/run-pareto-experiment.ts data/experiments/<name>")
}

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const output = await runParetoExperiment({
	researchRoot,
	projectRoot,
	outputArgument: arguments_[0],
	command: [process.execPath, ...process.argv.slice(1)],
	extract: extractParetoPalette,
	log: console.log,
})
console.log(`Published completed Pareto experiment to ${output}`)

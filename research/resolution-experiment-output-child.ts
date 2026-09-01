import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import {
	beginExperimentOutput,
	preserveFailedExperiment,
	publishExperimentOutput,
	releaseExperimentOutput,
	type ExperimentOutputAttempt,
} from "./src/pareto-experiment.ts"

const PROTOCOL_VERSION = "resolution-experiment-output-child-v1" as const

type OutputRequest = {
	id: string
	operation: "begin-output" | "publish-output" | "preserve-output" | "release-output"
	outputArgument?: string
}

type OutputResponse = {
	id: string | null
	ok: boolean
	protocolVersion: typeof PROTOCOL_VERSION
	outputDirectory?: string
	stagingDirectory?: string
	preservedDirectory?: string
	error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseResearchRoot(arguments_: readonly string[]): string {
	if (arguments_.length !== 2 || arguments_[0] !== "--research-root" || arguments_[1].length === 0) {
		throw new Error("Usage: resolution-experiment-output-child.ts --research-root <absolute-path>")
	}
	const root = resolve(arguments_[1])
	if (root !== arguments_[1]) throw new Error("Output child research root must be an absolute normalized path")
	return root
}

function parseRequest(value: unknown): OutputRequest {
	if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.operation !== "string") {
		throw new Error("Invalid experiment output request")
	}
	if (value.operation === "begin-output" && typeof value.outputArgument === "string") return value as OutputRequest
	if (["publish-output", "preserve-output", "release-output"].includes(value.operation)) return value as OutputRequest
	throw new Error("Invalid experiment output request")
}

async function run(): Promise<void> {
	const researchRoot = parseResearchRoot(process.argv.slice(2))
	let attempt: ExperimentOutputAttempt | undefined
	const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
	for await (const line of input) {
		let id: string | null = null
		let response: OutputResponse
		try {
			const parsed = JSON.parse(line) as unknown
			if (isRecord(parsed) && typeof parsed.id === "string") id = parsed.id
			const request = parseRequest(parsed)
			id = request.id
			if (request.operation === "begin-output") {
				if (attempt) throw new Error("An experiment output attempt is already active")
				attempt = await beginExperimentOutput(researchRoot, request.outputArgument!)
				response = {
					id,
					ok: true,
					protocolVersion: PROTOCOL_VERSION,
					outputDirectory: attempt.outputDirectory,
					stagingDirectory: attempt.stagingDirectory,
				}
			} else {
				if (!attempt) throw new Error("No experiment output attempt is active")
				if (request.operation === "publish-output") {
					await publishExperimentOutput(attempt)
					response = { id, ok: true, protocolVersion: PROTOCOL_VERSION, outputDirectory: attempt.outputDirectory }
				} else if (request.operation === "preserve-output") {
					const preservedDirectory = await preserveFailedExperiment(attempt)
					response = { id, ok: true, protocolVersion: PROTOCOL_VERSION, preservedDirectory }
				} else {
					await releaseExperimentOutput(attempt)
					attempt = undefined
					response = { id, ok: true, protocolVersion: PROTOCOL_VERSION }
				}
			}
		} catch (error) {
			response = {
				id,
				ok: false,
				protocolVersion: PROTOCOL_VERSION,
				error: error instanceof Error ? error.message : String(error),
			}
		}
		process.stdout.write(`${JSON.stringify(response)}\n`)
	}
	if (attempt) await releaseExperimentOutput(attempt)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	run().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}

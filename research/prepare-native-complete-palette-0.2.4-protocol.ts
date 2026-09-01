import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	NATIVE_COMPLETE_PALETTE_ABLATIONS,
	NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER,
	NATIVE_COMPLETE_PALETTE_POLICY,
	NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
	NATIVE_COMPLETE_PALETTE_POLICY_VERSION,
	NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION,
	NATIVE_COMPLETE_PALETTE_THRESHOLDS,
	NATIVE_COMPLETE_PALETTE_VERSION,
} from "./src/native-complete-palette.ts"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const predecessorPath = "research/data/experiments/native-complete-palette-0.2.3-development/protocol.json"
const predecessorSha256 = "f7df35e4e7668d1a9fce44eeaa577a4e02a6b991d36ac2221377495513cf5108"
const outputRoot = resolve(projectRoot,
	"research/data/experiments/native-complete-palette-0.2.4-development")

const closureExtras = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN.md",
	"research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2_3.md",
	"research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2_4.md",
	"research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
	"research/data/experiments/native-complete-palette-0.2.3-development/phase-5-failed/failure.json",
	"research/data/experiments/native-complete-palette-0.2.3-development/protocol.json",
	"research/data/experiments/native-complete-palette-0.2.3-development/rejection.json",
	"research/prepare-native-complete-palette-0.2.4-protocol.ts",
	"research/tests/native-complete-palette-artifact.test.ts",
	"research/tests/native-complete-palette-evaluation.test.ts",
	"research/tests/native-complete-palette.test.ts",
] as const

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function record(value: unknown, label: string): Record<string, any> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
	return value as Record<string, any>
}

async function implementationClosurePaths(): Promise<string[]> {
	const pending = ["research/evaluate-native-complete-palette.ts", "research/native-complete-palette-child.ts"]
	const discovered = new Set<string>()
	while (pending.length > 0) {
		const path = pending.shift()!
		if (discovered.has(path)) continue
		discovered.add(path)
		const source = await readFile(resolve(projectRoot, path), "utf8")
		const imports = [...source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g),
			...source.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g)]
		for (const match of imports) {
			const imported = relative(projectRoot, resolve(projectRoot, dirname(path), match[1])).split(sep).join("/")
			if (imported.endsWith(".ts") && !discovered.has(imported)) pending.push(imported)
		}
	}
	return [...discovered, ...closureExtras].sort(compareAscii)
}

async function main(): Promise<void> {
	const predecessorSource = await readFile(resolve(projectRoot, predecessorPath))
	if (sha256(predecessorSource) !== predecessorSha256) throw new Error("The 0.2.3 protocol identity changed")
	const protocol = record(JSON.parse(predecessorSource.toString("utf8")), "Predecessor protocol")
	protocol.candidate = NATIVE_COMPLETE_PALETTE_VERSION
	protocol.protocolVersion = NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION
	protocol.policyVersion = NATIVE_COMPLETE_PALETTE_POLICY_VERSION
	protocol.policySha256 = NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	protocol.predecessor = {
		candidate: "native-complete-palette-0.2.3-development",
		protocolSha256: predecessorSha256,
		failureSha256: "1970bc85d2f5b24af03fbc8bb343a51cdd7ea056c547931095295c1d66d0de6f",
		rejectionSha256: "1439f5245b57962132349978bd49a8554bfad9b0befcb3c3b447032ddcdcc820",
	}
	protocol.successorChange = {
		kind: "research-scheduling-resource-envelope",
		scientificPalettePolicyChanged: false,
		name: "child-concurrency-two-to-four-and-aggregate-ceiling-2.5-to-5-gib",
	}
	protocol.ablationEvaluation = NATIVE_COMPLETE_PALETTE_POLICY.ablationEvaluation
	protocol.resources.perSourceWallMilliseconds = NATIVE_COMPLETE_PALETTE_POLICY.perSourceWallMilliseconds
	protocol.resources.concurrency = NATIVE_COMPLETE_PALETTE_POLICY.concurrency
	protocol.resources.aggregateDeclaredChildCeilingBytes =
		NATIVE_COMPLETE_PALETTE_POLICY.aggregateDeclaredChildCeilingBytes
	protocol.orchestration = {
		apiCommandWallMilliseconds: 57_600_000,
		scientificOutput: false,
		failureOnly: true,
	}
	protocol.phase5AuthorizationAmendment.policySha256MustRemain = NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	protocol.phase5Execution.version = "native-complete-palette-phase-5-execution-v2.4"
	protocol.phase5Execution.process.perSourceTimeoutMilliseconds = NATIVE_COMPLETE_PALETTE_POLICY.perSourceWallMilliseconds
	protocol.phase5Execution.process.concurrency = NATIVE_COMPLETE_PALETTE_POLICY.concurrency
	protocol.phase5Execution.process.aggregateDeclaredChildCeilingBytes =
		NATIVE_COMPLETE_PALETTE_POLICY.aggregateDeclaredChildCeilingBytes
	protocol.phase5Execution.artifacts.staging =
		"research/data/experiments/native-complete-palette-0.2.4-development/.phase-5.staging"
	protocol.phase5Execution.artifacts.final =
		"research/data/experiments/native-complete-palette-0.2.4-development/phase-5"
	protocol.phase5Execution.artifacts.failure =
		"research/data/experiments/native-complete-palette-0.2.4-development/phase-5-failed"
	protocol.numeric.foregroundPositiveMinimumLc = NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc
	protocol.numeric.foregroundNegativeMinimumMagnitudeLc =
		NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc
	protocol.numeric.accentPositiveMinimumLc = NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc
	protocol.numeric.accentNegativeMinimumMagnitudeLc =
		NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc
	protocol.componentOrder = [...NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER]
	protocol.thresholds = { ...NATIVE_COMPLETE_PALETTE_THRESHOLDS }
	protocol.ablations = [...NATIVE_COMPLETE_PALETTE_ABLATIONS]
	const paths = await implementationClosurePaths()
	if (paths.length !== new Set(paths).size) throw new Error("Implementation closure contains duplicate paths")
	protocol.implementationClosure.files = await Promise.all(paths.map(async (path) => ({
		path,
		sha256: sha256(await readFile(resolve(projectRoot, path))),
	})))
	protocol.implementationClosure.status = "phase-5-execution-frozen"
	protocol.implementationClosure.matrixExecuted = false
	protocol.implementationClosure.artifactSelfBinding =
		"protocol-version-policy-sha-and-parser;raw-self-hash-excluded"
	await mkdir(outputRoot)
	await writeFile(resolve(outputRoot, "protocol.json"), `${JSON.stringify(protocol, null, 2)}\n`, { flag: "wx" })
	process.stdout.write(`${resolve(outputRoot, "protocol.json")}\n`)
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})

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
const predecessorPath = "research/data/experiments/native-complete-palette-0.2.1-development/protocol.json"
const predecessorSha256 = "917fcd6169d15871977eee05b9e6bf2b0da6ba10c7a13fb2773c79dbc8bfaf12"
const outputRoot = resolve(projectRoot,
	"research/data/experiments/native-complete-palette-0.2.2-development")

const closureExtras = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN.md",
	"research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2_1.md",
	"research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2_2.md",
	"research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
	"research/data/experiments/native-complete-palette-0.2.1-development/phase-5-failed/failure.json",
	"research/data/experiments/native-complete-palette-0.2.1-development/protocol.json",
	"research/data/experiments/native-complete-palette-0.2.1-development/rejection.json",
	"research/prepare-native-complete-palette-0.2.2-protocol.ts",
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
	if (sha256(predecessorSource) !== predecessorSha256) throw new Error("The 0.2.1 protocol identity changed")
	const protocol = record(JSON.parse(predecessorSource.toString("utf8")), "Predecessor protocol")
	protocol.candidate = NATIVE_COMPLETE_PALETTE_VERSION
	protocol.protocolVersion = NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION
	protocol.policyVersion = NATIVE_COMPLETE_PALETTE_POLICY_VERSION
	protocol.policySha256 = NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	protocol.predecessor = {
		candidate: "native-complete-palette-0.2.1-development",
		protocolSha256: predecessorSha256,
		failureSha256: "4e5ce9c1f65851e882e76c1cb40ed34bfb263de499d09c82805ba38c9d4ef083",
		rejectionSha256: "f0250f83df3083cf26caac45958dd650f5169c7fcf4132a718d5865dbadaafb1",
	}
	protocol.successorChange = {
		kind: "exact-research-evaluation-architecture",
		scientificPalettePolicyChanged: false,
		name: "two-stream-independent-ablation-accumulators",
		legacySyntheticAblationScientificSha256:
			"7e82ecb8a1be82bfbaccea9ecf3e59a209826bb5ba72a656ce7182c446201691",
	}
	protocol.ablationEvaluation = NATIVE_COMPLETE_PALETTE_POLICY.ablationEvaluation
	protocol.phase5AuthorizationAmendment.policySha256MustRemain = NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	protocol.phase5Execution.version = "native-complete-palette-phase-5-execution-v2.2"
	protocol.phase5Execution.artifacts.staging =
		"research/data/experiments/native-complete-palette-0.2.2-development/.phase-5.staging"
	protocol.phase5Execution.artifacts.final =
		"research/data/experiments/native-complete-palette-0.2.2-development/phase-5"
	protocol.phase5Execution.artifacts.failure =
		"research/data/experiments/native-complete-palette-0.2.2-development/phase-5-failed"
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

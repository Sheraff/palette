import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
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
const predecessorPath = "research/data/experiments/native-complete-palette-0.1.0-development/protocol.json"
const predecessorSha256 = "1bd672e2599f33fcaebe1afa677f5fdb33873db6897fe4a042dd85ee945b6e29"
const outputRoot = resolve(projectRoot,
	"research/data/experiments/native-complete-palette-0.2.0-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function record(value: unknown, label: string): Record<string, any> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
	return value as Record<string, any>
}

async function main(): Promise<void> {
	const predecessorSource = await readFile(resolve(projectRoot, predecessorPath))
	if (sha256(predecessorSource) !== predecessorSha256) throw new Error("The 0.1 protocol identity changed")
	const protocol = record(JSON.parse(predecessorSource.toString("utf8")), "Predecessor protocol")
	protocol.candidate = NATIVE_COMPLETE_PALETTE_VERSION
	protocol.protocolVersion = NATIVE_COMPLETE_PALETTE_PROTOCOL_VERSION
	protocol.policyVersion = NATIVE_COMPLETE_PALETTE_POLICY_VERSION
	protocol.policySha256 = NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	protocol.predecessor = {
		candidate: "native-complete-palette-0.1.0-development",
		protocolSha256: predecessorSha256,
		failureSha256: "ca74422360dc0bfb131675428006a6876747f0e7a66309a316cfb535e96884f5",
		rejectionSha256: "fc8c1a3e433b356828526aa2756fbdf2269356c7bcd42659e15fba8aebc9f2b5",
		diagnosisPath:
			"research/data/experiments/native-complete-palette-0.1.0-development/apca-policy-diagnosis.json",
	}
	protocol.architecturalChange = {
		count: 1,
		name: "fixed-apca-floors-to-finite-comparative-evidence",
		authority: {
			path: "research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
			sha256: "8f42e5b797e3935be744ab1cc7e5399eb9f8d4b8e672df5a9b6bf75e478f8785",
		},
		unchangedPolicy: "all-non-apca-scientific-policy-byte-semantic-equal-to-0.1",
	}
	protocol.phase5AuthorizationAmendment.policySha256MustRemain = NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	protocol.phase5Execution.version = "native-complete-palette-phase-5-execution-v2"
	protocol.phase5Execution.artifacts.staging =
		"research/data/experiments/native-complete-palette-0.2.0-development/.phase-5.staging"
	protocol.phase5Execution.artifacts.final =
		"research/data/experiments/native-complete-palette-0.2.0-development/phase-5"
	protocol.phase5Execution.artifacts.failure =
		"research/data/experiments/native-complete-palette-0.2.0-development/phase-5-failed"
	protocol.numeric.foregroundPositiveMinimumLc = NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc
	protocol.numeric.foregroundNegativeMinimumMagnitudeLc =
		NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc
	protocol.numeric.accentPositiveMinimumLc = NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc
	protocol.numeric.accentNegativeMinimumMagnitudeLc =
		NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc
	protocol.componentOrder = [...NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER]
	protocol.thresholds = { ...NATIVE_COMPLETE_PALETTE_THRESHOLDS }
	protocol.ablations = [...NATIVE_COMPLETE_PALETTE_ABLATIONS]
	const oldFiles = protocol.implementationClosure.files as Array<{ path: string; sha256: string }>
	const paths = oldFiles.map(({ path }) => path === "research/NATIVE_COMPLETE_PALETTE_PROTOCOL.md"
		? "research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2.md" : path)
	paths.push(
		"research/NATIVE_COMPLETE_PALETTE_PROTOCOL.md",
		"research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
		"research/data/experiments/native-complete-palette-0.1.0-development/apca-policy-diagnosis.json",
		"research/data/experiments/native-complete-palette-0.1.0-development/phase-5-failed/failure.json",
		"research/data/experiments/native-complete-palette-0.1.0-development/protocol.json",
		"research/data/experiments/native-complete-palette-0.1.0-development/rejection.json",
		"research/prepare-native-complete-palette-0.2-protocol.ts",
	)
	paths.sort((first, second) => first < second ? -1 : first > second ? 1 : 0)
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

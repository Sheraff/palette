import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION,
	chromaticRoleReserveProtocolId,
	type ChromaticRoleReserveProtocol,
} from "./src/chromatic-role-reserve.ts"

const [outputArgument, ...unexpected] = process.argv.slice(2)
if (!outputArgument || unexpected.length > 0) {
	throw new Error("Usage: prepare-chromatic-role-reserve-protocol.ts <protocol.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputPath = resolve(outputArgument)
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/tsconfig.json",
	"research/prepare-chromatic-role-reserve-protocol.ts",
	"research/evaluate-chromatic-role-reserve.ts",
	"research/prepare-chromatic-role-reserve-review.ts",
	"research/analyze-chromatic-role-reserve-review.ts",
	"research/serve-chromatic-role-review.ts",
	"research/src/chromatic-role-reserve.ts",
	"research/src/chromatic-role-review.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/candidate-validation.ts",
	"research/src/candidates.ts",
	"research/src/extract.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/palette.ts",
	"research/src/regions.ts",
	"research/src/image.ts",
	"research/src/color.ts",
	"research/src/color-name.ts",
	"research/chromatic-role-review/index.html",
	"research/chromatic-role-review/app.js",
	"research/chromatic-role-review/styles.css",
]

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

const identity: Omit<ChromaticRoleReserveProtocol, "createdAt" | "protocolId"> = {
	schemaVersion: 1,
	experimentVersion: CHROMATIC_ROLE_RESERVE_EXPERIMENT_VERSION,
	baselineAlgorithmVersion: "region-graph-0.17.0",
	candidateAlgorithmVersion: "region-chromatic-role-0.1.0-poc.10",
	reserveDirectory: "0f",
	implementation: Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => [
		file,
		sha256(await readFile(resolve(projectRoot, file))),
	]))),
	sourceRule: {
		supportedExtensions: ["", ".jpg", ".jpeg", ".png", ".avif", ".webp"],
		deduplicateArtworkIds: true,
		preferredSourceOrder: ["ab67616d0000b273", "ab67616d00001e02", "other"],
		includeAllDeduplicatedSources: true,
	},
	comparison: {
		roleOKLabDistanceExclusive: 0.025,
		gradientBooleanChangeIsMaterial: true,
	},
	review: {
		includeEveryMaterialChange: true,
		minimumCasesPerBatch: 4,
		maximumCasesPerBatch: 40,
		unchangedControlsOnlyToReachMinimum: true,
		deterministicBlindAssignment: true,
	},
	gates: {
		hardGateViolationsMaximum: 0,
		baselinePreferredEligibleChangesMaximum: 0,
		neitherAcceptableEligibleChangesMaximum: 0,
		weakOrWorseCandidateEligibleChangesMaximum: 0,
		candidatePreferredEligibleChangesMinimum: 1,
		allMaterialChangesReviewed: true,
		implementationMustRemainFrozen: true,
	},
}
const protocol: ChromaticRoleReserveProtocol = {
	...identity,
	createdAt: new Date().toISOString(),
	protocolId: chromaticRoleReserveProtocolId(identity),
}
await writeExclusiveJson(outputPath, protocol)
process.stderr.write(`Prepared frozen chromatic role reserve protocol at ${relative(projectRoot, outputPath)}\n`)

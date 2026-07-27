import { createHash } from "node:crypto"
import { link, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const aggregatePath = resolve(experimentDirectory, "aggregate.json")
const developmentAnalysisPath = resolve(experimentDirectory, "development-analysis.json")
const reviewManifestPath = resolve(experimentDirectory, "gradient-challenger-review-manifest.private.json")
const reviewPreparationPath = resolve(experimentDirectory, "gradient-challenger-review-preparation.json")
const reviewFeedbackPath = resolve(experimentDirectory, "gradient-challenger-review-feedback.private.json")
const reviewAnalysisPath = resolve(experimentDirectory, "gradient-challenger-review-analysis.json")
const outputPath = resolve(experimentDirectory, "candidate-freeze.json")
const futureSamplePath = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-03.sealed.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_6_0.md")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function projectRelative(path: string): string {
	const value = relative(projectRoot, path)
	if (value === ".." || value.startsWith(`..${sep}`)) throw new Error("Freeze input escapes the project root")
	return value.split(sep).join("/")
}

const implementationPaths = [
	resolve(moduleDirectory, "evaluate-album-artwork-palette-v2-development.ts"),
	resolve(moduleDirectory, "src/album-artwork-palette-v2.ts"),
	resolve(moduleDirectory, "src/album-artwork-palette-v2-protocol.ts"),
	resolve(moduleDirectory, "src/album-artwork-palette-v2-future-sample.ts"),
	resolve(moduleDirectory, "src/album-artwork-palette-v2-future-sample-03.ts"),
	resolve(moduleDirectory, "src/source-provenance-inventory.ts"),
	resolve(moduleDirectory, "src/color.ts"),
	resolve(moduleDirectory, "src/color-name.ts"),
	resolve(moduleDirectory, "src/native-resolution-image.ts"),
	resolve(moduleDirectory, "src/types.ts"),
	protocolPath,
	resolve(moduleDirectory, "analyze-album-artwork-palette-v2-0.6.0-development.ts"),
	resolve(moduleDirectory, "tests/album-artwork-palette-v2.test.ts"),
	resolve(moduleDirectory, "tests/album-artwork-palette-v2-future-sample.test.ts"),
	resolve(moduleDirectory, "tests/album-artwork-palette-v2-future-sample-03.test.ts"),
	resolve(moduleDirectory, "data/album-artwork-palette-v2-fresh-sample.sealed.json"),
	resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-02.sealed.json"),
	futureSamplePath,
	resolve(moduleDirectory, "album-artwork-palette-v2-development-child.ts"),
	resolve(moduleDirectory, "../package.json"),
	resolve(moduleDirectory, "../pnpm-lock.yaml"),
]

async function implementationBinding() {
	const hash = createHash("sha256")
	hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	const files = []
	for (const path of implementationPaths) {
		const bytes = await readFile(path)
		hash.update(path.slice(moduleDirectory.length))
		hash.update("\0")
		hash.update(bytes)
		hash.update("\0")
		files.push({ path: projectRelative(path), sha256: sha256(bytes), byteCount: bytes.byteLength })
	}
	return { implementationHash: hash.digest("hex"), files }
}

async function expectedFreeze() {
	const [aggregateRaw, developmentAnalysisRaw, reviewManifestRaw, reviewPreparationRaw, reviewFeedbackRaw,
		reviewAnalysisRaw, futureRaw, protocolRaw, implementation] = await Promise.all([
		readFile(aggregatePath, "utf8"),
		readFile(developmentAnalysisPath, "utf8"),
		readFile(reviewManifestPath, "utf8"),
		readFile(reviewPreparationPath, "utf8"),
		readFile(reviewFeedbackPath, "utf8"),
		readFile(reviewAnalysisPath, "utf8"),
		readFile(futureSamplePath, "utf8"),
		readFile(protocolPath, "utf8"),
		implementationBinding(),
	])
	const aggregate = JSON.parse(aggregateRaw) as {
		candidateVersion: string
		implementationHash: string
		developmentManifestId: string
		scientificSha256: string
		sourceCount: number
		cases: Array<{ implementationHash: string }>
	}
	const developmentAnalysis = JSON.parse(developmentAnalysisRaw) as {
		analysisId: string
		candidateVersion: string
		implementationHash: string
		developmentManifestId: string
		scientificSha256: string
		futureSample03: { manifestId: string; sealCommitment: string; opened: false }
		mechanismGate: { pass: boolean }
		mechanical: { changedWinnerCaseIds: string[] }
		phaseDisposition: string
	}
	const reviewAnalysis = JSON.parse(reviewAnalysisRaw) as {
		analysisId: string
		manifestId: string
		candidateVersion: string
		implementationHash: string
		scientificSha256: string
		inputHashes: { manifestSha256: string; feedbackSha256: string; preparationSha256: string }
		gate: { pass: boolean; reviewedCount: number; candidatePositiveCount: number; candidateStrongerCount: number; cleanCandidateTagCount: number }
		futureSample03: { manifestId: string; opened: false }
		phaseDisposition: string
	}
	const reviewManifest = JSON.parse(reviewManifestRaw) as { manifestId: string; cases: unknown[] }
	const futureSample = JSON.parse(futureRaw) as { manifestId: string; sealCommitment: string }
	if (aggregate.candidateVersion !== "album-artwork-first-principles-0.6.0" || aggregate.sourceCount !== 28 ||
		aggregate.implementationHash !== implementation.implementationHash ||
		aggregate.cases.some(({ implementationHash }) => implementationHash !== implementation.implementationHash) ||
		developmentAnalysis.candidateVersion !== aggregate.candidateVersion ||
		developmentAnalysis.implementationHash !== aggregate.implementationHash ||
		developmentAnalysis.developmentManifestId !== aggregate.developmentManifestId ||
		developmentAnalysis.scientificSha256 !== aggregate.scientificSha256 || !developmentAnalysis.mechanismGate.pass ||
		canonicalJson(developmentAnalysis.mechanical.changedWinnerCaseIds) !== canonicalJson(["development-06", "development-22"]) ||
		developmentAnalysis.phaseDisposition !== "0.6.0-gradient-challenger-mechanism-passed-two-case-human-delta-required" ||
		developmentAnalysis.futureSample03.opened !== false ||
		developmentAnalysis.futureSample03.manifestId !== futureSample.manifestId ||
		developmentAnalysis.futureSample03.sealCommitment !== futureSample.sealCommitment ||
		reviewManifest.cases.length !== 2 || reviewAnalysis.manifestId !== reviewManifest.manifestId ||
		reviewAnalysis.candidateVersion !== aggregate.candidateVersion || reviewAnalysis.implementationHash !== aggregate.implementationHash ||
		reviewAnalysis.scientificSha256 !== aggregate.scientificSha256 || !reviewAnalysis.gate.pass ||
		reviewAnalysis.gate.reviewedCount !== 2 || reviewAnalysis.gate.candidatePositiveCount !== 2 ||
		reviewAnalysis.gate.candidateStrongerCount !== 2 || reviewAnalysis.gate.cleanCandidateTagCount !== 2 ||
		reviewAnalysis.inputHashes.manifestSha256 !== sha256(reviewManifestRaw) ||
		reviewAnalysis.inputHashes.feedbackSha256 !== sha256(reviewFeedbackRaw) ||
		reviewAnalysis.inputHashes.preparationSha256 !== sha256(reviewPreparationRaw) ||
		reviewAnalysis.futureSample03.opened !== false || reviewAnalysis.futureSample03.manifestId !== futureSample.manifestId ||
		reviewAnalysis.phaseDisposition !== "0.6.0-gradient-challenger-human-gate-passed-candidate-freeze-eligible" ||
		sha256(futureRaw) !== "690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183") {
		throw new Error("0.6.0 is not eligible for candidate freeze")
	}
	const identity = {
		schemaVersion: 1,
		freezeVersion: "album-artwork-palette-v2-candidate-freeze-v2",
		candidateVersion: aggregate.candidateVersion,
		implementationHash: implementation.implementationHash,
		implementationHashMethod: "development-evaluator-runtime-and-declared-files-v1",
		runtime: { node: process.version, platform: process.platform, architecture: process.arch },
		implementationFiles: implementation.files,
		developmentManifestId: aggregate.developmentManifestId,
		developmentSourceCount: aggregate.sourceCount,
		scientificSha256: aggregate.scientificSha256,
		developmentAnalysisId: developmentAnalysis.analysisId,
		humanReviewAnalysisId: reviewAnalysis.analysisId,
		inputHashes: {
			aggregateSha256: sha256(aggregateRaw),
			developmentAnalysisSha256: sha256(developmentAnalysisRaw),
			reviewManifestSha256: sha256(reviewManifestRaw),
			reviewPreparationSha256: sha256(reviewPreparationRaw),
			reviewFeedbackSha256: sha256(reviewFeedbackRaw),
			reviewAnalysisSha256: sha256(reviewAnalysisRaw),
			protocolSha256: sha256(protocolRaw),
			futureSampleSealSha256: sha256(futureRaw),
		},
		gates: { mechanism: true, exactTwoCaseHumanDelta: true },
		futureSample: {
			manifestId: futureSample.manifestId,
			sealCommitment: futureSample.sealCommitment,
			opened: false,
		},
		authorization: {
			futureSample03OneWayExecutionEligible: true,
			phase5: false,
			promotion: false,
			persistence: false,
			fullRoster: false,
		},
	}
	return { ...identity, freezeId: sha256(canonicalJson(identity)) }
}

const mode = process.argv[2] ?? "--create"
if (!(mode === "--create" || mode === "--verify") || process.argv.length > 3) {
	throw new Error("Usage: freeze-album-artwork-palette-v2-0.6.0.ts [--create|--verify]")
}
const expected = await expectedFreeze()
if (mode === "--verify") {
	const stored = JSON.parse(await readFile(outputPath, "utf8")) as unknown
	if (canonicalJson(stored) !== canonicalJson(expected)) throw new Error("Stored 0.6.0 candidate freeze is stale")
	process.stdout.write(`Verified 0.6.0 candidate freeze ${expected.freezeId}\n`)
} else {
	const temporary = `${outputPath}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(expected, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, outputPath)
	} finally {
		await rm(temporary, { force: true })
	}
	process.stdout.write(`Frozen 0.6.0 candidate ${expected.freezeId}\n`)
}

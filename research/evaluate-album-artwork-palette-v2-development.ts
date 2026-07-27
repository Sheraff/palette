import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { parseAlbumArtworkPaletteV2FutureSample } from "./src/album-artwork-palette-v2-future-sample.ts"
import { parseAlbumArtworkPaletteV2FutureSample03 } from "./src/album-artwork-palette-v2-future-sample-03.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY, ALBUM_ARTWORK_PALETTE_V2_VERSION } from "./src/album-artwork-palette-v2-protocol.ts"

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

type DevelopmentManifest = Readonly<{
	manifestId: string
	sourceCount: number
	sources: readonly SourceRecord[]
}>

type OpenedFreshManifest = Readonly<{
	sources: ReadonlyArray<Readonly<{ sha256: string }>>
}>

type SourceArtifact = Readonly<{
	schemaVersion: 1
	implementationHash: string
	developmentManifestId: string
	openedFreshSealManifestId: string
	protectedFutureSampleManifestIds: readonly string[]
	source: SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: {
		winner: Readonly<{ id: string }>
		alternatives: readonly unknown[]
		diagnostics: {
			fieldHypotheses: ReadonlyArray<Readonly<{ kind: string }>>
			fieldDomains: ReadonlyArray<Readonly<{ eligible: boolean }>>
			completeCandidateCount: number
			emergency: Readonly<{ eligible: boolean }>
			paretoRanking: Readonly<{ frontierCandidateCount: number; dominatedCandidateCount: number }>
		}
	}
	presentations: ReadonlyArray<Readonly<{ treatmentId: string }>>
	scientificSha256: string
	runtime: Readonly<{ wallMs: number; cpuUserMicros: number; cpuSystemMicros: number }>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const developmentPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-development-panel.json")
const openedFreshPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-fresh-sample.sealed.json")
const futureSamplePath = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-02.sealed.json")
const futureSample03Path = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-03.sealed.json")
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const sourceOutputDirectory = resolve(experimentDirectory, "sources")
const childPath = resolve(moduleDirectory, "album-artwork-palette-v2-development-child.ts")
const OPENED_FRESH_MANIFEST_ID = "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91"
const PROTECTED_FUTURE_MANIFEST_IDS = [
	"9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671",
	"bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060",
]

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

function workerCountFromArguments(): number {
	const argument = process.argv.slice(2).find((value) => value.startsWith("--workers="))
	const requested = argument === undefined
		? ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.developmentWorkers
		: Number(argument.slice("--workers=".length))
	if (!Number.isSafeInteger(requested) || requested < 1 || requested > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.developmentWorkers) {
		throw new RangeError(`Development workers must be from 1 through ${ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.developmentWorkers}`)
	}
	return requested
}

async function implementationHash(): Promise<string> {
	const paths = [
		fileURLToPath(import.meta.url),
		resolve(moduleDirectory, "src/album-artwork-palette-v2.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-protocol.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-future-sample.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-future-sample-03.ts"),
		resolve(moduleDirectory, "src/source-provenance-inventory.ts"),
		resolve(moduleDirectory, "src/color.ts"),
		resolve(moduleDirectory, "src/color-name.ts"),
		resolve(moduleDirectory, "src/native-resolution-image.ts"),
		resolve(moduleDirectory, "src/types.ts"),
		resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_6_0.md"),
		resolve(moduleDirectory, "analyze-album-artwork-palette-v2-0.6.0-development.ts"),
		resolve(moduleDirectory, "tests/album-artwork-palette-v2.test.ts"),
		resolve(moduleDirectory, "tests/album-artwork-palette-v2-future-sample.test.ts"),
		resolve(moduleDirectory, "tests/album-artwork-palette-v2-future-sample-03.test.ts"),
		openedFreshPath,
		futureSamplePath,
		futureSample03Path,
		childPath,
		resolve(moduleDirectory, "../package.json"),
		resolve(moduleDirectory, "../pnpm-lock.yaml"),
	]
	const hash = createHash("sha256")
	hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	for (const path of paths) {
		hash.update(path.slice(moduleDirectory.length))
		hash.update("\0")
		hash.update(await readFile(path))
		hash.update("\0")
	}
	return hash.digest("hex")
}

async function reusableArtifact(path: string, source: SourceRecord, manifestId: string, implementation: string): Promise<boolean> {
	try {
		const artifact = JSON.parse(await readFile(path, "utf8")) as SourceArtifact
		return artifact.schemaVersion === 1 &&
			artifact.implementationHash === implementation &&
			artifact.developmentManifestId === manifestId &&
			artifact.openedFreshSealManifestId === OPENED_FRESH_MANIFEST_ID &&
			canonicalJson(artifact.protectedFutureSampleManifestIds) === canonicalJson(PROTECTED_FUTURE_MANIFEST_IDS) &&
			artifact.source.caseId === source.caseId &&
			artifact.source.sha256 === source.sha256 &&
			artifact.scientificSha256 === sha256(JSON.stringify({
				extraction: artifact.extraction,
				presentations: artifact.presentations,
			}))
	} catch {
		return false
	}
}

function runChild(source: SourceRecord, outputPath: string, implementation: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, [
			"--experimental-strip-types",
			childPath,
			developmentPath,
			openedFreshPath,
			futureSamplePath,
			futureSample03Path,
			outputPath,
			source.caseId,
			implementation,
		], { cwd: resolve(moduleDirectory, ".."), stdio: ["ignore", "pipe", "pipe"] })
		let stdout = ""
		let stderr = ""
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
		child.on("error", reject)
		child.on("exit", (code) => {
			if (stdout) process.stdout.write(stdout)
			if (code === 0) resolvePromise()
			else reject(new Error(`${source.caseId} failed with exit ${code}: ${stderr.trim()}`))
		})
	})
}

async function main(): Promise<void> {
	const workers = workerCountFromArguments()
	const [development, openedFresh, futureSampleValue, futureSample03Value] = await Promise.all([
		readFile(developmentPath, "utf8").then((value) => JSON.parse(value) as DevelopmentManifest),
		readFile(openedFreshPath, "utf8").then((value) => JSON.parse(value) as OpenedFreshManifest),
		readFile(futureSamplePath, "utf8").then((value) => JSON.parse(value) as unknown),
		readFile(futureSample03Path, "utf8").then((value) => JSON.parse(value) as unknown),
	])
	if (development.sourceCount !== development.sources.length || development.sources.length < 20 || development.sources.length > 30) {
		throw new Error("Development panel must contain 20 through 30 bound sources")
	}
	const futureSample = parseAlbumArtworkPaletteV2FutureSample(futureSampleValue)
	const futureSample03 = parseAlbumArtworkPaletteV2FutureSample03(futureSample03Value)
	if (futureSample.manifestId !== PROTECTED_FUTURE_MANIFEST_IDS[0] ||
		futureSample03.manifestId !== PROTECTED_FUTURE_MANIFEST_IDS[1]) {
		throw new Error("Protected future-sample manifest binding is invalid")
	}
	const protectedHashes = new Set([
		...openedFresh.sources.map(({ sha256 }) => sha256),
		...futureSample.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)),
		...futureSample03.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)),
	])
	if (development.sources.some(({ sha256 }) => protectedHashes.has(sha256))) {
		throw new Error("Development panel overlaps a protected directional sample")
	}
	const implementation = await implementationHash()
	await mkdir(sourceOutputDirectory, { recursive: true })
	process.stdout.write(`Development worker count: ${workers}\n`)
	process.stdout.write(`Candidate implementation: ${implementation}\n`)
	const wallStart = performance.now()
	let nextSource = 0
	let reused = 0
	const runWorker = async (): Promise<void> => {
		while (true) {
			const index = nextSource++
			if (index >= development.sources.length) return
			const source = development.sources[index]
			const outputPath = resolve(sourceOutputDirectory, `${source.caseId}.json`)
			if (await reusableArtifact(outputPath, source, development.manifestId, implementation)) {
				reused += 1
				process.stdout.write(`${source.caseId} valid artifact reused\n`)
				continue
			}
			await runChild(source, outputPath, implementation)
		}
	}
	await Promise.all(Array.from({ length: Math.min(workers, development.sources.length) }, runWorker))
	const artifacts = await Promise.all(development.sources.map(({ caseId }) =>
		readFile(resolve(sourceOutputDirectory, `${caseId}.json`), "utf8").then((value) => JSON.parse(value) as SourceArtifact)))
	const scientificRows = artifacts.map((artifact) => ({
		caseId: artifact.source.caseId,
		sourceSha256: artifact.source.sha256,
		scientificSha256: artifact.scientificSha256,
		extraction: artifact.extraction,
		presentations: artifact.presentations,
	}))
	const scientificSha256 = sha256(canonicalJson(scientificRows))
	const wallMs = performance.now() - wallStart
	const totalCpuUserMicros = artifacts.reduce((sum, { runtime }) => sum + runtime.cpuUserMicros, 0)
	const totalCpuSystemMicros = artifacts.reduce((sum, { runtime }) => sum + runtime.cpuSystemMicros, 0)
	const summary = {
		schemaVersion: 1,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_VERSION,
		implementationHash: implementation,
		developmentManifestId: development.manifestId,
		workerCount: workers,
		sourceCount: artifacts.length,
		reusedSourceArtifacts: reused,
		scientificSha256,
		fieldHypothesisCoverage: {
			oneField: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "one-field")).length,
			separateFlatFields: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "separate-flat-fields")).length,
			gradientField: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "gradient-field")).length,
		},
		emergencyEligibleCount: artifacts.filter(({ extraction }) => extraction.diagnostics.emergency.eligible).length,
		connectedFieldDomainCoverage: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldDomains.some(({ eligible }) => eligible)).length,
		completeCandidateCount: artifacts.reduce((sum, { extraction }) => sum + extraction.diagnostics.completeCandidateCount, 0),
		paretoFrontierCandidateCount: artifacts.reduce((sum, { extraction }) => sum + extraction.diagnostics.paretoRanking.frontierCandidateCount, 0),
		dominatedCandidateCount: artifacts.reduce((sum, { extraction }) => sum + extraction.diagnostics.paretoRanking.dominatedCandidateCount, 0),
		retainedTreatmentCount: artifacts.reduce((sum, { extraction }) => sum + extraction.alternatives.length, 0),
		runtime: {
			wallMs,
			totalCpuUserMicros,
			totalCpuSystemMicros,
			maximumSourceWallMs: Math.max(...artifacts.map(({ runtime }) => runtime.wallMs)),
		},
	}
	const aggregate = {
		...summary,
		cases: artifacts,
	}
	const reviewSelectionKey = (source: SourceRecord): string => sha256([
		"album-artwork-palette-v2-lightweight-top-one-review-v1",
		development.manifestId,
		source.sha256,
	].join("\0"))
	const selectedCaseIds = new Set([
		...development.sources.filter(({ cohort }) => cohort === "stress")
			.sort((first, second) => reviewSelectionKey(first).localeCompare(reviewSelectionKey(second))).slice(0, 8),
		...development.sources.filter(({ cohort }) => cohort === "dataset")
			.sort((first, second) => reviewSelectionKey(first).localeCompare(reviewSelectionKey(second))).slice(0, 4),
	].map(({ caseId }) => caseId))
	const reviewWithoutId = {
		schemaVersion: 1,
		reviewVersion: "album-artwork-palette-v2-lightweight-top-one-review-v4",
		reviewUnit: "absolute-quality-plus-optional-comment-for-one-frozen-top-treatment-per-artwork",
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_VERSION,
		implementationHash: implementation,
		developmentManifestId: development.manifestId,
		scientificSha256,
		selectionDomain: "album-artwork-palette-v2-lightweight-top-one-review-v1",
		cases: artifacts.filter((artifact) => selectedCaseIds.has(artifact.source.caseId)).map((artifact) => ({
			caseId: artifact.source.caseId,
			sourceSha256: artifact.source.sha256,
			sourcePath: artifact.source.path,
			cohort: artifact.source.cohort,
			structureTags: artifact.source.structureTags,
			dimensions: artifact.dimensions,
			winnerTreatmentId: artifact.extraction.winner.id,
			alternatives: [artifact.extraction.winner],
			presentations: artifact.presentations.filter(({ treatmentId }) => treatmentId === artifact.extraction.winner.id),
		})),
	}
	const reviewManifest = { ...reviewWithoutId, manifestId: sha256(canonicalJson(reviewWithoutId)) }
	await Promise.all([
		atomicJson(resolve(experimentDirectory, "summary.json"), summary),
		atomicJson(resolve(experimentDirectory, "aggregate.json"), aggregate),
		atomicJson(resolve(experimentDirectory, "review-manifest.json"), reviewManifest),
	])
	process.stdout.write(`Completed ${artifacts.length} sources in ${wallMs.toFixed(1)}ms; scientific hash ${scientificSha256}\n`)
}

await main()

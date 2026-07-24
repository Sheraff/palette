import assert from "node:assert/strict"
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import {
	CanonicalRasterChild,
	DEVELOPMENT_SOURCE_COUNT,
	FULL_SOURCE_COUNT,
	HOLDOUT_SOURCE_COUNT,
	MAX_RESULT_SHARD_BYTES,
	NATIVE_SCALE_SPACE_CANONICAL_CHILD_PATH,
	NATIVE_SCALE_SPACE_CORPUS_TARGETS,
	NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256,
	NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256,
	NATIVE_SCALE_SPACE_IMPLEMENTATION_EXTRAS,
	NATIVE_SCALE_SPACE_IMPLEMENTATION_ROOTS,
	NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256,
	NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256,
	NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES,
	NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256,
	NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256,
	NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256,
	NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION,
	NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION,
	assembleNativeScaleSpaceArtifactDirectory,
	assertNativeScaleSpaceProvenancePath,
	assertNativeScaleSpaceResultShardSize,
	buildNativeScaleSpaceEvidenceProtocol,
	canonicalSerialize,
	computeNativeScaleSpaceProtocolId,
	createNativeScaleSpaceCommonHeader,
	deriveNativeScaleSpaceCanonicalRoster,
	domainSeparatedCanonicalSha256,
	nativeScaleSpaceSourceRosterIdentity,
	orderedNativeScaleSpaceResultMerkleRoot,
	parseNativeScaleSpaceAuditArguments,
	parseNativeScaleSpacePromotionCertificate,
	preflightNativeRasterMetadata,
	resolveNativeScaleSpaceBoundSourcePath,
	scanNativeScaleSpaceImplementationImports,
	semanticSha256,
	sha256,
	validateNativeScaleSpaceMetadata,
	verifyNativeScaleSpaceArtifactDirectory,
	verifyNativeScaleSpaceImplementationClosure,
	type NativeScaleSpaceBoundRosterEntry,
	type NativeScaleSpaceResultShardRecord,
	type NativeScaleSpaceSourceCertificate,
	type NativeScaleSpaceSourcePredicates,
	type NativeScaleSpaceSourceResult,
} from "../audit-native-scale-space-evidence.ts"
import {
	createNativeScaleSpaceNoPublishAttempt,
	createNativeScaleSpacePublicationAttempt,
	preserveFailedNativeScaleSpaceNoPublish,
	preserveFailedNativeScaleSpacePublication,
	publishNativeScaleSpacePublication,
	removeSuccessfulNativeScaleSpaceNoPublish,
	validateNativeScaleSpaceArtifactRelativePath,
} from "../src/native-scale-space-output.ts"

const projectRoot = process.cwd()
const onePixelPng = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
	"base64",
)

async function physicalTemporaryDirectory(prefix: string): Promise<string> {
	return realpath(await mkdtemp(join(tmpdir(), prefix)))
}

function corpus(count: number, holdout: boolean) {
	return {
		algorithmVersion: "region-graph-0.19.0",
		entries: Array.from({ length: count }, (_, index) => ({
			file: holdout ? `00/${String(index).padStart(4, "0")}.png` : `${String(index).padStart(4, "0")}.png`,
			width: 1,
			height: 1,
			ignored: { mustNotBeProjected: true },
		})),
	}
}

const allPredicates: NativeScaleSpaceSourcePredicates = Object.freeze({
	canonicalControlExact: true,
	nativeIdentityValid: true,
	availabilityFrozen: true,
	candidatePartitionExact: true,
	familyUnionExact: true,
	witnessMembershipExact: true,
	q24BoundsValid: true,
	bcSampleExact: true,
	coordinatesExact: true,
	graphComplete: true,
	metricsFinite: true,
	artifactRowComplete: true,
})

test("arguments and protocol preserve one exact self-ID under execution limits", () => {
	assert.deepEqual(parseNativeScaleSpaceAuditArguments([]), { limit: null, noPublish: false })
	assert.deepEqual(parseNativeScaleSpaceAuditArguments(["--limit", "3", "--no-publish"]), { limit: 3, noPublish: true })
	assert.throws(() => parseNativeScaleSpaceAuditArguments(["--limit", "3"]), /requires --no-publish/)
	assert.throws(() => parseNativeScaleSpaceAuditArguments(["--limit", "0", "--no-publish"]), /positive integer/)
	assert.throws(() => parseNativeScaleSpaceAuditArguments(["--limit", String(FULL_SOURCE_COUNT + 1), "--no-publish"]), /cannot exceed/)
	assert.throws(() => parseNativeScaleSpaceAuditArguments(["--no-publish", "--no-publish"]), /only be supplied once/)
	assert.throws(() => parseNativeScaleSpaceAuditArguments(["--other"]), /Unknown argument/)

	const protocol = buildNativeScaleSpaceEvidenceProtocol()
	const { protocolId, ...identity } = protocol
	assert.equal(protocolId, computeNativeScaleSpaceProtocolId(identity))
	assert.equal(protocol.sourceRoster.total, 392)
	assert.deepEqual(protocol.targets.corpus, NATIVE_SCALE_SPACE_CORPUS_TARGETS)
	assert.equal(protocol.registries.metricDefinitionsSha256, NATIVE_SCALE_SPACE_METRIC_DEFINITIONS_SHA256)
	assert.equal(protocol.registries.fixtureManifestSha256, NATIVE_SCALE_SPACE_FIXTURE_MANIFEST_SHA256)
	assert.equal(protocol.registries.expectationsSha256, NATIVE_SCALE_SPACE_EXPECTATIONS_SHA256)
	assert.equal(protocol.registries.importPolicySha256, NATIVE_SCALE_SPACE_IMPORT_POLICY_SHA256)
	assert.equal(protocol.identityPolicy.fullIdentityUnchangedUnderLimit, true)
	assert.equal(protocol.corpusAnalysis.aggregateWinner, false)
	assert.equal(protocol.corpusAnalysis.qualityScalar, false)
	assert.equal(protocol.corpusAnalysis.ranking, false)
})

test("canonical roster, direct-child paths, and narrow certificate projection are exact", async () => {
	const development = corpus(DEVELOPMENT_SOURCE_COUNT, false)
	const holdout = corpus(HOLDOUT_SOURCE_COUNT, true)
	const roster = deriveNativeScaleSpaceCanonicalRoster(development, holdout)
	assert.equal(roster.length, FULL_SOURCE_COUNT)
	assert.deepEqual(roster[0], {
		cohort: "development", artifactIndex: 0, file: "0000.png", sourceRelativePath: "images/0000.png",
		canonicalWidth: 1, canonicalHeight: 1,
	})
	assert.equal(roster[DEVELOPMENT_SOURCE_COUNT].sourceRelativePath, "00/0000.png")
	assert.equal("ignored" in roster[0], false)
	assert.throws(() => deriveNativeScaleSpaceCanonicalRoster({ ...development, entries: development.entries.slice(1) }, holdout), /exactly 37/)
	const traversing = corpus(DEVELOPMENT_SOURCE_COUNT, false)
	traversing.entries[0].file = "../outside.png"
	assert.throws(() => deriveNativeScaleSpaceCanonicalRoster(traversing, holdout), /Unsafe development/)
	assert.equal(resolveNativeScaleSpaceBoundSourcePath("/tmp/root", "images/a.png"), "/tmp/root/images/a.png")
	assert.equal(resolveNativeScaleSpaceBoundSourcePath("/tmp/root", "00/a.png"), "/tmp/root/00/a.png")
	for (const path of ["a.png", "images/a/b.png", "00/../a.png", "other/a.png", "images\\a.png"]) {
		assert.throws(() => resolveNativeScaleSpaceBoundSourcePath("/tmp/root", path))
	}

	const actualDevelopment = JSON.parse(await readFile(join(projectRoot, "research/data/results.json"), "utf8")) as unknown
	const actualHoldout = JSON.parse(await readFile(join(projectRoot, "research/data/holdout-results.json"), "utf8")) as unknown
	const actualRoster = deriveNativeScaleSpaceCanonicalRoster(actualDevelopment, actualHoldout)
	const certificateBytes = await readFile(join(projectRoot,
		NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.path))
	const certificate = parseNativeScaleSpacePromotionCertificate(
		certificateBytes,
		"development",
		actualRoster.slice(0, DEVELOPMENT_SOURCE_COUNT).map(({ file }) => file),
	)
	assert.equal(certificate.rawSha256, NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.rawSha256)
	assert.equal(Object.keys(certificate.entries).length, DEVELOPMENT_SOURCE_COUNT)
	for (const entry of Object.values(certificate.entries)) {
		assert.deepEqual(Object.keys(entry).sort(), ["algorithmVersion", "normalizedImageSha256", "schemaVersion"])
	}
	const parsedRaw = JSON.parse(certificateBytes.toString("utf8")) as { entries: Record<string, Record<string, unknown>> }
	const firstFile = Object.keys(parsedRaw.entries)[0]
	assert.ok(Object.keys(parsedRaw.entries[firstFile]).length > Object.keys(certificate.entries[firstFile]).length)
	const changed = certificateBytes.slice()
	changed[changed.length - 2] ^= 1
	assert.throws(() => parseNativeScaleSpacePromotionCertificate(changed, "development", Object.keys(certificate.entries)), /raw SHA-256/)
})

test("canonical child is fixed to the exact executable and decodes only direct fixture paths", { timeout: 30_000 }, async () => {
	assert.equal(NATIVE_SCALE_SPACE_CANONICAL_CHILD_PATH,
		join(projectRoot, "research", "resolution-canonical-raster-child.ts"))
	const temporary = await physicalTemporaryDirectory("native-scale-space-canonical-child-")
	let child: CanonicalRasterChild | undefined
	try {
		await mkdir(join(temporary, "images"))
		await mkdir(join(temporary, "00"))
		await writeFile(join(temporary, "images", "one.png"), onePixelPng)
		child = new CanonicalRasterChild(temporary)
		await assert.rejects(child.decode("../one.png"), /direct child/)
		const decoded = await child.decode("images/one.png")
		assert.deepEqual([decoded.width, decoded.height, decoded.data.length], [1, 1, 3])
		assert.equal(decoded.versions.sharp, "0.33.5")
		assert.equal(semanticSha256(decoded.versions), NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256)
		await child.close()
		child = undefined
	} finally {
		if (child) await child.close().catch(() => undefined)
		await rm(temporary, { recursive: true, force: true })
	}
})

test("modern metadata preflight records raw semantics and rejects pages, bounds, and orientation", async () => {
	const metadata = await preflightNativeRasterMetadata(onePixelPng)
	assert.equal(metadata.pageCount, 1)
	assert.equal(metadata.encodedPixels, 1)
	assert.equal(metadata.orientation, null)
	assert.equal(metadata.semanticSha256, semanticSha256({
		version: metadata.version,
		rawMetadata: metadata.rawMetadata,
		pageCount: metadata.pageCount,
		encodedWidth: metadata.encodedWidth,
		encodedHeight: metadata.encodedHeight,
		encodedPixels: metadata.encodedPixels,
		orientation: metadata.orientation,
	}))
	assert.throws(() => validateNativeScaleSpaceMetadata({ width: 1, height: 1, pages: 2 }), /exactly one page/)
	assert.throws(() => validateNativeScaleSpaceMetadata({ width: 2_100_001, height: 1 }), /pixel bound/)
	assert.throws(() => validateNativeScaleSpaceMetadata({ width: 1, height: 1, orientation: 9 }), /1 through 8/)
	assert.throws(() => validateNativeScaleSpaceMetadata({ width: 0, height: 1 }), /positive safe integer/)
})

test("output lifecycle removes successful dry runs, preserves failures, publishes atomically, and hard-stops preexistence", async () => {
	const temporary = await physicalTemporaryDirectory("native-scale-space-output-lifecycle-")
	try {
		const researchRoot = join(temporary, "research")
		await mkdir(join(researchRoot, "data", "experiments"), { recursive: true })
		const successfulDryRun = await createNativeScaleSpaceNoPublishAttempt(researchRoot)
		await writeFile(join(successfulDryRun.temporaryDirectory, "marker"), "verified")
		await removeSuccessfulNativeScaleSpaceNoPublish(successfulDryRun)
		await assert.rejects(lstat(successfulDryRun.temporaryDirectory), { code: "ENOENT" })

		const failedDryRun = await createNativeScaleSpaceNoPublishAttempt(researchRoot)
		assert.equal(preserveFailedNativeScaleSpaceNoPublish(failedDryRun), failedDryRun.temporaryDirectory)
		assert.ok((await lstat(failedDryRun.temporaryDirectory)).isDirectory())

		const failedPublish = await createNativeScaleSpacePublicationAttempt(researchRoot)
		await writeFile(join(failedPublish.stagingDirectory, "marker"), "failed")
		const failedDirectory = await preserveFailedNativeScaleSpacePublication(failedPublish)
		assert.match(failedDirectory, /\.failed-|\.development\.failed-/)
		assert.ok((await lstat(failedDirectory)).isDirectory())

		const publication = await createNativeScaleSpacePublicationAttempt(researchRoot)
		await writeFile(join(publication.stagingDirectory, "marker"), "complete")
		const finalDirectory = await publishNativeScaleSpacePublication(publication)
		assert.equal(finalDirectory, publication.finalDirectory)
		assert.equal(await readFile(join(finalDirectory, "marker"), "utf8"), "complete")
		await assert.rejects(createNativeScaleSpacePublicationAttempt(researchRoot), /preexisting/)
	} finally {
		await rm(temporary, { recursive: true, force: true })
	}
})

test("closure scanner follows static edges and rejects forbidden, dynamic, symlink-independent provenance paths", async () => {
	const temporary = await physicalTemporaryDirectory("native-scale-space-closure-")
	try {
		await mkdir(join(temporary, "src"))
		await writeFile(join(temporary, "src", "root.ts"), [
			'// import "./ignored.ts"',
			'const text = "import(\\\"./also-ignored.ts\\\")"',
			'import { value } from "./dependency.ts"',
			"export { value }",
		].join("\n"))
		await writeFile(join(temporary, "src", "dependency.ts"), 'export { value } from "./leaf.ts"\n')
		await writeFile(join(temporary, "src", "leaf.ts"), "export const value = 1\n")
		const allowed = ["src/root.ts", "src/dependency.ts", "src/leaf.ts"]
		const closure = await verifyNativeScaleSpaceImplementationClosure(temporary, {
			roots: ["src/root.ts"], extras: [], allowedPaths: allowed,
		})
		assert.deepEqual(closure.files.map(({ path }) => path), allowed.sort())
		assert.match(closure.identitySha256, /^[a-f0-9]{64}$/)
		assert.equal(scanNativeScaleSpaceImplementationImports('// import("./comment.ts")\nconst x="require(\\\"./data.ts\\\")"').length, 0)

		await writeFile(join(temporary, "src", "root.ts"), 'const value = import("./leaf.ts")\nexport { value }\n')
		await assert.rejects(verifyNativeScaleSpaceImplementationClosure(temporary, {
			roots: ["src/root.ts"], extras: [], allowedPaths: allowed,
		}), /Dynamic local/)
		await writeFile(join(temporary, "src", "root.ts"), 'export { value } from "./review.ts"\n')
		await writeFile(join(temporary, "src", "review.ts"), "export const value = 1\n")
		await assert.rejects(verifyNativeScaleSpaceImplementationClosure(temporary, {
			roots: ["src/root.ts"], extras: [], allowedPaths: [...allowed, "src/review.ts"],
		}), /forbidden|not allowed/i)
		assert.throws(() => assertNativeScaleSpaceProvenancePath("research/src/extract.ts"), /Forbidden/)
		assert.throws(() => validateNativeScaleSpaceArtifactRelativePath("../manifest.json"), /Unsafe/)
	} finally {
		await rm(temporary, { recursive: true, force: true })
	}
})

test("result shard records use exact domain-separated Merkle order and hard byte bounds", () => {
	const record = (index: number): NativeScaleSpaceResultShardRecord => ({
		path: `results/source-${String(index).padStart(4, "0")}.json`,
		shardIndex: index,
		sourceStartIndex: index,
		sourceEndIndexExclusive: index + 1,
		sourceCount: 1,
		sourceEntryKeys: [{ cohort: "development", file: `${index}.png` }],
		bytes: 100 + index,
		rawSha256: sha256(`raw-${index}`),
		semanticSha256: sha256(`semantic-${index}`),
	})
	const first = record(0)
	const second = record(1)
	const third = record(2)
	const root = orderedNativeScaleSpaceResultMerkleRoot([first, second, third])
	assert.match(root, /^[a-f0-9]{64}$/)
	assert.equal(root, orderedNativeScaleSpaceResultMerkleRoot([third, first, second]))
	assert.notEqual(root, orderedNativeScaleSpaceResultMerkleRoot([first, second, { ...third, bytes: 104 }]))
	assert.throws(() => orderedNativeScaleSpaceResultMerkleRoot([]), /at least one shard/)
	assert.throws(() => orderedNativeScaleSpaceResultMerkleRoot([second]), /contiguous/)
	assert.equal(assertNativeScaleSpaceResultShardSize(new Uint8Array(MAX_RESULT_SHARD_BYTES)), MAX_RESULT_SHARD_BYTES)
	assert.throws(() => assertNativeScaleSpaceResultShardSize(new Uint8Array(MAX_RESULT_SHARD_BYTES + 1)), /exceeds/)
})

async function copyProjectBindingFile(temporaryProject: string, path: string): Promise<void> {
	const target = join(temporaryProject, path)
	await mkdir(dirname(target), { recursive: true })
	await copyFile(join(projectRoot, path), target)
}

async function createSyntheticVerifierProject(temporaryProject: string): Promise<void> {
	await mkdir(temporaryProject)
	for (const path of [...NATIVE_SCALE_SPACE_IMPLEMENTATION_ROOTS, ...NATIVE_SCALE_SPACE_IMPLEMENTATION_EXTRAS]) {
		const target = join(temporaryProject, path)
		await mkdir(dirname(target), { recursive: true })
		if (path === "package.json" || path === "pnpm-lock.yaml") await copyFile(join(projectRoot, path), target)
		else await writeFile(target, "export {}\n")
	}
	for (const path of [
		"research/data/results.json",
		"research/data/holdout-results.json",
		NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.path,
		NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.holdout00.path,
	]) await copyProjectBindingFile(temporaryProject, path)
}

function syntheticSourceResult(rosterEntry: Record<string, unknown>): NativeScaleSpaceSourceResult {
	const arm = (name: "A" | "B" | "C") => ({ arm: name })
	const metadataProjection = {
		version: "native-scale-space-metadata-preflight-v1" as const,
		rawMetadata: {},
		pageCount: 1 as const,
		encodedWidth: 1,
		encodedHeight: 1,
		encodedPixels: 1,
		orientation: null,
	}
	return {
		schemaVersion: 1,
		sourceIndex: 0,
		cohort: rosterEntry.cohort as "development",
		file: rosterEntry.file as string,
		source: { relativePath: rosterEntry.relativePath as string, bytes: rosterEntry.bytes as number, sha256: rosterEntry.sha256 as string },
		canonicalControl: {
			width: 1, height: 1, normalizedImageSha256: "0".repeat(64), computedNormalizedImageSha256: "0".repeat(64),
			promotionCertificatePath: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.path,
			promotionCertificateRawSha256: NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.rawSha256,
			canonicalRuntimeSha256: NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256,
		},
		metadataPreflight: { ...metadataProjection, semanticSha256: semanticSha256(metadataProjection) },
		native: {
			width: 1, height: 1, pixels: 1, rgbBytes: 3, rawSha256: "2".repeat(64), identitySha256: "3".repeat(64),
			decodePolicy: "synthetic-verifier-fixture", bounds: { width: 1, height: 1, pixels: 1, rgbBytes: 3, satLength: 4, satBytes: 16, q24Bytes: 4, sourceIndexBytes: 4 },
		},
		availability: {
			version: "native-scale-space-availability-v1", identitySha256: "4".repeat(64), candidateLabelsSha256: "5".repeat(64),
			candidateStableKeys: ["6".repeat(64)], candidateMaskSha256: ["7".repeat(64)], candidateWitnessRgb: [[0, 0, 0]],
			candidateWitnessOklab: [[0, 0, 0]], candidateMeanOklab: [[0, 0, 0]],
			candidateWitnessIndex: [0], candidateAnalysisRgb: [[0, 0, 0]], candidateAnalysisOklab: [[0, 0, 0]],
			candidateAnalysisIndex: [0], candidateAnalysisDistance: [0], candidateAnalysisNativeExact: [true],
			nativeVersusAnalysisWitnessExact: [true],
			familyStableKeys: ["8".repeat(64)], familyMaskSha256: ["9".repeat(64)],
			familyAnchorCandidateIds: [0], familyMemberOffsets: [0, 1], familyMemberCandidateIds: [0], orderedEdges: [],
		},
		a: arm("A") as NativeScaleSpaceSourceResult["a"],
		targets: NATIVE_SCALE_SPACE_CORPUS_TARGETS.map((target) => ({
			target, b: arm("B"), c: arm("C"),
		})) as unknown as NativeScaleSpaceSourceResult["targets"],
		targetDimensionEqualities: [],
		predicates: allPredicates,
		resource: { satBytes: 16, maximumRssBytes: 1, checkpoints: [] },
	}
}

test("generic verifier accepts a synthetic limited prefix and rejects shard tampering", { timeout: 60_000 }, async () => {
	const temporary = await physicalTemporaryDirectory("native-scale-space-artifact-verifier-")
	let child: CanonicalRasterChild | undefined
	try {
		const temporaryProject = join(temporary, "project")
		const artifactDirectory = join(temporary, "artifact")
		await createSyntheticVerifierProject(temporaryProject)
		await mkdir(artifactDirectory)
		const predecessorManifest = JSON.parse(await readFile(join(
			projectRoot,
			"research/data/experiments/multi-resolution-palette-evidence-audit-0.3.0-development/manifest.json",
		), "utf8")) as { sourceRoster: { count: number; sha256: string; entries: Record<string, unknown>[] } }
		assert.equal(predecessorManifest.sourceRoster.sha256, NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256)
		assert.equal(semanticSha256(predecessorManifest.sourceRoster.entries), NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256)
		const rosterEntries = predecessorManifest.sourceRoster.entries.map((entry) => ({
			cohort: entry.cohort,
			artifactIndex: entry.artifactIndex,
			file: entry.file,
			sourceRelativePath: entry.relativePath,
			canonicalWidth: 1,
			canonicalHeight: 1,
			sourceBytes: entry.bytes,
			sourceSha256: entry.sha256,
		})) as NativeScaleSpaceBoundRosterEntry[]
		const sourceRoster = nativeScaleSpaceSourceRosterIdentity(rosterEntries)
		assert.equal(sourceRoster.sha256, NATIVE_SCALE_SPACE_REQUIRED_SOURCE_ROSTER_SHA256)
		const protocol = buildNativeScaleSpaceEvidenceProtocol()
		const header = createNativeScaleSpaceCommonHeader(protocol.protocolId)
		const implementation = await verifyNativeScaleSpaceImplementationClosure(temporaryProject)
		child = new CanonicalRasterChild(projectRoot)
		const canonical = await child.decode(predecessorManifest.sourceRoster.entries[0].relativePath as string)
		await child.close()
		child = undefined
		const developmentArtifact = JSON.parse(await readFile(join(projectRoot, "research/data/results.json"), "utf8")) as { entries: Array<{ file: string }> }
		const certificate = parseNativeScaleSpacePromotionCertificate(
			await readFile(join(projectRoot, NATIVE_SCALE_SPACE_PROMOTION_CERTIFICATE_REFERENCES.development.path)),
			"development",
			developmentArtifact.entries.map(({ file }) => file),
		)
		const firstRosterEntry = predecessorManifest.sourceRoster.entries[0]
		const result = syntheticSourceResult(firstRosterEntry)
		result.canonicalControl = {
			...result.canonicalControl,
			normalizedImageSha256: certificate.entries[result.file].normalizedImageSha256,
			computedNormalizedImageSha256: certificate.entries[result.file].normalizedImageSha256,
		}
		const certificateBase: Omit<NativeScaleSpaceSourceCertificate,
			"resultShardPath" | "resultShardSemanticSha256" | "identitySha256"> = {
			...header,
			certificateVersion: NATIVE_SCALE_SPACE_SOURCE_CERTIFICATE_VERSION,
			sourceIndex: 0,
			cohort: result.cohort,
			file: result.file,
			sourceSha256: result.source.sha256,
			normalizedImageSha256: certificate.entries[result.file].normalizedImageSha256,
			metadataSemanticSha256: result.metadataPreflight.semanticSha256,
			canonicalRuntimeSha256: NATIVE_SCALE_SPACE_REQUIRED_CANONICAL_RUNTIME_SHA256,
			modernRuntimeSha256: NATIVE_SCALE_SPACE_REQUIRED_MODERN_RUNTIME_SHA256,
			nativeIdentitySha256: result.native.identitySha256,
			availabilityIdentitySha256: result.availability.identitySha256,
			predicates: allPredicates,
			resource: { maximumRssBytes: 1, checkpoints: [] },
		}
		const controls = {
			...header,
			structuralRows: [],
			structuralRowCount: 0,
			structuralValid: true,
			scientificPredicates: [],
			disposition: "valid-fixture-supported-diagnostic" as const,
		}
		const analysis = {
			...header,
			executionSourceCount: 1,
			fullSourceCount: FULL_SOURCE_COUNT,
			distributions: {},
			counts: { ties: 0, contradictions: 0 },
			disposition: controls.disposition,
			diagnosticOnly: true,
		}
		await assembleNativeScaleSpaceArtifactDirectory({
			artifactDirectory,
			protocol,
			execution: { mode: "limited-no-publish", limit: 1, noPublish: true, publishable: false, processedSources: 1 },
			sourceRoster,
			sources: [{ result, certificate: certificateBase }],
			controls: controls as never,
			analysis: analysis as never,
			implementation,
			canonicalRuntime: canonical.versions,
		})
		const verified = await verifyNativeScaleSpaceArtifactDirectory(artifactDirectory, {
			projectRoot: temporaryProject,
			allowLimited: true,
			verifyCanonicalRasters: false,
			verifyScientificControls: false,
			verifyResourceCheckpoints: false,
		})
		assert.equal(verified.publishable, false)
		assert.equal(verified.executionSourceCount, 1)
		assert.equal(verified.fileCount, 7)
		const shardPath = join(artifactDirectory, "results", "source-0000.json")
		await writeFile(shardPath, `${await readFile(shardPath, "utf8")} `)
		await assert.rejects(verifyNativeScaleSpaceArtifactDirectory(artifactDirectory, {
			projectRoot: temporaryProject,
			allowLimited: true,
			verifyCanonicalRasters: false,
			verifyScientificControls: false,
			verifyResourceCheckpoints: false,
		}), /canonical JSON|Artifact hash|identity changed/)
	} finally {
		if (child) await child.close().catch(() => undefined)
		await rm(temporary, { recursive: true, force: true })
	}
})

test("canonical source serialization is compact, one-LF, and stable", () => {
	const value = { z: 2, a: { y: -0, x: 1 } }
	const bytes = canonicalSerialize(value)
	assert.equal(bytes, '{"a":{"x":1,"y":0},"z":2}\n')
	assert.equal(bytes.endsWith("\n\n"), false)
	assert.equal(sha256(bytes), sha256(canonicalSerialize({ a: { x: 1, y: 0 }, z: 2 })))
	assert.match(domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_RESULT_SHARD_VERSION, value), /^[a-f0-9]{64}$/)
})

import assert from "node:assert/strict"
import { lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import sharpModern from "sharp-modern"
import {
	CANONICAL_CHILD_PROTOCOL_VERSION,
	CanonicalRasterChild,
	DEVELOPMENT_SOURCE_COUNT,
	ExperimentOutputChild,
	FULL_SOURCE_COUNT,
	HOLDOUT_SOURCE_COUNT,
	MULTI_RESOLUTION_AUDIT_ID,
	OUTPUT_CHILD_PROTOCOL_VERSION,
	PROMOTION_CERTIFICATE_REFERENCES,
	RESULT_COLUMN_SCHEMA,
	RESULT_COLUMN_SCHEMA_VERSION,
	RESULT_SHARD_SCHEMA_VERSION,
	MAX_RESULT_SHARD_BYTES,
	assertResultShardSize,
	buildMultiResolutionAuditProtocol,
	canonicalJson,
	columnarizeExtractorContext,
	columnarizeIdentityMatches,
	columnarizeResolutionEvidence,
	compactExtractorContext,
	compactResolutionEvidence,
	deriveCanonicalRoster,
	directedEvidenceMatches,
	discoverImplementationClosure,
	expandColumnarExtractorContext,
	expandColumnarIdentityMatches,
	expandColumnarResolutionEvidence,
	nearestCandidateReconstructionMean,
	normalizedImageSha256,
	orderedResultShardMerkleRoot,
	parseAuditArguments,
	parsePromotionCertificateArtifact,
	resolveBoundSourcePath,
	runControls,
	semanticSha256,
	sha256,
	validateShardedResultsIndex,
	type ResultShardRecord,
	type ShardedResultsIndex,
} from "../audit-multi-resolution-palette-evidence.ts"
import { extractPaletteWithContext } from "../src/extract.ts"
import { analyzeResolutionEvidence, RESOLUTION_EVIDENCE_POLICY_SHA256 } from "../src/resolution-evidence.ts"
import { createNativeRgbOccupancy } from "../src/resolution-raster.ts"
import type { RawImage, RGB } from "../src/types.ts"

function extraction() {
	return { version: "region-graph-0.19.0" }
}

function corpus(count: number, holdout: boolean) {
	return {
		algorithmVersion: "region-graph-0.19.0",
		entries: Array.from({ length: count }, (_, index) => ({
			file: holdout ? `00/${String(index).padStart(4, "0")}.png` : `${String(index).padStart(4, "0")}.png`,
			kind: holdout ? "holdout" : "artwork",
			review: false,
			width: 1,
			height: 1,
			extraction: extraction(),
		})),
	}
}

function image(width: number, height: number, at: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const rgb = at(x, y)
		const offset = (y * width + x) * 3
		data[offset] = rgb[0]
		data[offset + 1] = rgb[1]
		data[offset + 2] = rgb[2]
	}
	return { width, height, data }
}

test("runner arguments preserve the full protocol while limiting only execution", () => {
	assert.deepEqual(parseAuditArguments([]), { limit: null, noPublish: false })
	assert.deepEqual(parseAuditArguments(["--limit", "2", "--no-publish"]), { limit: 2, noPublish: true })
	assert.throws(() => parseAuditArguments(["--limit", "2"]), /requires --no-publish/)
	assert.throws(() => parseAuditArguments(["--limit", "0"]), /positive integer/)
	assert.throws(() => parseAuditArguments(["--limit", String(FULL_SOURCE_COUNT + 1)]), /cannot exceed/)
	assert.throws(() => parseAuditArguments(["--no-publish", "--no-publish"]), /only be supplied once/)
	assert.throws(() => parseAuditArguments(["--unknown"]), /Unknown argument/)
})

test("full scientific protocol is fixed, self-identifying, diagnostic-only, and review-inert", () => {
	const protocol = buildMultiResolutionAuditProtocol()
	const { protocolId, ...identity } = protocol
	assert.equal(protocol.experimentId, MULTI_RESOLUTION_AUDIT_ID)
	assert.equal(protocol.matrix.total, FULL_SOURCE_COUNT)
	assert.equal(protocol.matrix.profiles, 11)
	assert.equal(protocol.modernLane.completeExtractorProfileIds.length, 5)
	assert.deepEqual(protocol.modernLane.completeExtractorProfileIds, [
		"max-edge-224-lanczos3",
		"max-edge-224-cubic",
		"max-edge-224-nearest",
		"max-edge-224-area",
		"max-edge-320-lanczos3",
	])
	assert.equal(protocol.canonicalLane.evidenceReferenceId, "canonical-sharp-0.33.5-max-edge-224")
	assert.equal(protocol.candidateIdentityMatching.scalarScore, false)
	assert.equal(protocol.implementationIdentity.method, "recursive-local-static-import-closure-v1")
	assert.equal(protocol.artifactOutput.detailedResults.wholeMatrixSerialization, false)
	assert.equal(protocol.artifactOutput.detailedResults.shardPolicy, "one-source-per-compact-canonical-json-shard")
	assert.equal(protocol.artifactOutput.detailedResults.maximumShardBytes, MAX_RESULT_SHARD_BYTES)
	assert.equal(protocol.artifactOutput.detailedResults.columnSchemaVersion, RESULT_COLUMN_SCHEMA_VERSION)
	assert.deepEqual(protocol.artifactOutput.detailedResults.columnSchema, RESULT_COLUMN_SCHEMA)
	assert.deepEqual(protocol.canonicalLane.promotionCertificates, PROMOTION_CERTIFICATE_REFERENCES)
	assert.equal(protocol.reconstruction.scalarQualityScore, false)
	assert.deepEqual(protocol.review, { cap: 40, authorized: false })
	assert.equal(protocol.disposition, "diagnostic-only-no-selection-no-review-no-promotion")
	assert.equal(protocolId, semanticSha256(identity))
	assert.equal(canonicalJson(protocol).includes("timestamp"), false)
	assert.equal(canonicalJson(protocol).includes("elapsed"), false)
})

test("canonical roster comes only from exact 37 plus 355 canonical entries", () => {
	const development = corpus(DEVELOPMENT_SOURCE_COUNT, false)
	const holdout = corpus(HOLDOUT_SOURCE_COUNT, true)
	const roster = deriveCanonicalRoster(development, holdout)
	assert.equal(roster.length, FULL_SOURCE_COUNT)
	assert.deepEqual(roster[0].sourceRelativePath, "images/0000.png")
	assert.deepEqual(roster[DEVELOPMENT_SOURCE_COUNT].sourceRelativePath, "00/0000.png")
	assert.equal(roster.filter((entry) => entry.cohort === "development").length, DEVELOPMENT_SOURCE_COUNT)
	assert.equal(roster.filter((entry) => entry.cohort === "00").length, HOLDOUT_SOURCE_COUNT)

	assert.throws(() => deriveCanonicalRoster({ ...development, entries: development.entries.slice(1) }, holdout), /exactly 37/)
	const traversing = corpus(DEVELOPMENT_SOURCE_COUNT, false)
	traversing.entries[0].file = "../outside.png"
	assert.throws(() => deriveCanonicalRoster(traversing, holdout), /Unsafe development source path/)
	const nested = corpus(HOLDOUT_SOURCE_COUNT, true)
	nested.entries[0].file = "00/nested/file.png"
	assert.throws(() => deriveCanonicalRoster(development, nested), /Unsafe 00 source path/)
})

test("bound source resolver accepts only images/ and 00/ direct children", () => {
	assert.equal(resolveBoundSourcePath("/tmp/project", "images/a.png"), "/tmp/project/images/a.png")
	assert.equal(resolveBoundSourcePath("/tmp/project", "00/a.png"), "/tmp/project/00/a.png")
	for (const source of ["a.png", "../a.png", "images/nested/a.png", "00/../a.png", "other/a.png", "images\\a.png"]) {
		assert.throws(() => resolveBoundSourcePath("/tmp/project", source))
	}
})

test("canonical JSON and compact typed evidence hashes are deterministic and field-separated", () => {
	assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}')
	assert.equal(semanticSha256({ b: 1, a: 2 }), semanticSha256({ a: 2, b: 1 }))
	const source = image(24, 16, (x, y) => {
		if (y === 7) return [245, 235, 210]
		if (x < 8) return [25, 45, 90]
		return [175, 48, 106]
	})
	const first = compactResolutionEvidence(analyzeResolutionEvidence(source, source)).compact
	const second = compactResolutionEvidence(analyzeResolutionEvidence(source, source)).compact
	assert.deepEqual(first, second)
	assert.match(first.semanticSha256, /^[a-f0-9]{64}$/)
	assert.equal(first.policySha256, RESOLUTION_EVIDENCE_POLICY_SHA256)
	assert.match(first.planeHashes.pixelBinIds, /^[a-f0-9]{64}$/)
	const bound = compactResolutionEvidence(analyzeResolutionEvidence(source, source, {
		analysisRasterIdentity: "analysis-raster",
		decodedNativeRasterIdentity: "native-raster",
		rasterPolicyIdentity: "profile-policy",
	})).compact
	assert.notEqual(bound.provenanceSha256, first.provenanceSha256)
	assert.notEqual(bound.semanticSha256, first.semanticSha256)
	assert.deepEqual(Object.keys(first.hashes).sort(), [
		"alternatives",
		"analysisRepresentativeNativePresence",
		"components",
		"counts",
		"familyIdentities",
		"fieldEligibilityComponents",
		"frameInterior",
		"graphTreatmentCounts",
		"nativeExactRepresentatives",
		"populations",
		"relationEndpointMetrics",
		"typographyThinSupport",
	])
	assert.equal(first.candidates.length, first.candidateCount)
	assert.equal(first.families.length, first.familyCount)
	assert.equal(first.relations.length, first.relationCount)
	assert.equal(first.invariants.nativeWitnessesExist, true)
	assert.equal(first.candidates.filter((candidate) => candidate.analysis.exactNativePresence).length,
		first.exactAnalysisRepresentativeNativePresenceCount)
	assert.equal(first.candidates.every((candidate) => candidate.componentAreaHistogram.length === 16), true)
	const columnar = columnarizeResolutionEvidence(first)
	assert.equal(columnar.columnSchemaVersion, RESULT_COLUMN_SCHEMA_VERSION)
	assert.deepEqual(expandColumnarResolutionEvidence(columnar), first)
	assert.equal(Array.isArray(columnar.candidates.analysisRgb), true)
	assert.equal(Array.isArray(columnar.families.memberCandidateKeys), true)
	assert.equal(Array.isArray(columnar.relations.endpointDistance), true)
	assert.ok(canonicalJson(columnar).length < canonicalJson(first).length)
})

test("result shard index enforces compact encoding, exact coverage, hashes, Merkle order, and directory completeness", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "palette-resolution-results-shards-"))
	try {
		await mkdir(join(temporary, "results"))
		const sourceEntryKeys = [{ cohort: "development" as const, file: "one.png" }]
		const shard = {
			schemaVersion: 1,
			shardSchemaVersion: RESULT_SHARD_SCHEMA_VERSION,
			columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
			experimentId: MULTI_RESOLUTION_AUDIT_ID,
			protocolId: "protocol",
			shardIndex: 0,
			sourceStartIndex: 0,
			sourceEndIndexExclusive: 1,
			sourceCount: 1,
			sourceEntryKeys,
			entry: { cohort: "development", file: "one.png", payload: [1, 2, 3] },
		}
		const serialized = `${canonicalJson(shard)}\n`
		const record: ResultShardRecord = {
			path: "results/source-0000.json",
			shardIndex: 0,
			sourceStartIndex: 0,
			sourceEndIndexExclusive: 1,
			sourceCount: 1,
			rawSha256: sha256(serialized),
			semanticSha256: semanticSha256(shard),
			bytes: Buffer.byteLength(serialized),
			sourceEntryKeys,
		}
		await writeFile(join(temporary, record.path), serialized)
		const index: ShardedResultsIndex = {
			schemaVersion: 1,
			experimentId: MULTI_RESOLUTION_AUDIT_ID,
			protocolId: "protocol",
			shardSchemaVersion: RESULT_SHARD_SCHEMA_VERSION,
			columnSchemaVersion: RESULT_COLUMN_SCHEMA_VERSION,
			columnSchema: RESULT_COLUMN_SCHEMA,
			executionSourceCount: 1,
			fullSourceCount: FULL_SOURCE_COUNT,
			shards: [record],
			orderedShardMerkleRootSha256: orderedResultShardMerkleRoot([record]),
		}
		assert.deepEqual(await validateShardedResultsIndex(temporary, index), {
			totalBytes: Buffer.byteLength(serialized),
			maximumShardBytes: Buffer.byteLength(serialized),
		})
		await assert.rejects(validateShardedResultsIndex(temporary, {
			...index,
			orderedShardMerkleRootSha256: "0".repeat(64),
		}), /Merkle root/)
		await assert.rejects(validateShardedResultsIndex(temporary, {
			...index,
			shards: [{ ...record, sourceStartIndex: 1 }],
		}), /coverage/)
		await writeFile(join(temporary, "results", "extra.json"), "{}\n")
		await assert.rejects(validateShardedResultsIndex(temporary, index), /missing, extra/)
		await rm(join(temporary, "results", "extra.json"))
		await rm(join(temporary, record.path))
		await assert.rejects(validateShardedResultsIndex(temporary, index), /missing, extra/)
		const second = { ...record, path: "results/source-0001.json", shardIndex: 1,
			sourceStartIndex: 1, sourceEndIndexExclusive: 2 }
		assert.notEqual(orderedResultShardMerkleRoot([record, second]), orderedResultShardMerkleRoot([second, record]))
	} finally {
		await rm(temporary, { recursive: true, force: true })
	}
})

test("detailed result serialization has a hard per-shard bound and no whole-matrix result accumulator", async () => {
	assert.equal(assertResultShardSize(new Uint8Array(MAX_RESULT_SHARD_BYTES)), MAX_RESULT_SHARD_BYTES)
	assert.throws(() => assertResultShardSize(new Uint8Array(MAX_RESULT_SHARD_BYTES + 1)), /exceeds/)
	const runner = await readFile(join(process.cwd(), "research", "audit-multi-resolution-palette-evidence.ts"), "utf8")
	assert.doesNotMatch(runner, /const sourceResults\s*:/)
	assert.doesNotMatch(runner, /entries:\s*sourceResults/)
	assert.match(runner, /writeSourceResultShard/)
})

test("extractor descriptors use exact decoded-native occupancy rather than witness language", () => {
	const analysis = image(24, 16, (x) => x < 12 ? [20, 40, 80] : [230, 180, 60])
	const context = extractPaletteWithContext(analysis)
	const matchingNative = { ...analysis, channels: 3 as const, depth: "uchar" as const, colorSpace: "srgb" as const }
	const matching = compactExtractorContext(context, createNativeRgbOccupancy(matchingNative))
	assert.equal(matching.candidateCount, context.candidates.length)
	assert.equal(matching.exactNativePresenceCount, matching.candidateCount)
	assert.equal(matching.candidates.every((candidate) => candidate.exactNativePresence), true)
	assert.deepEqual(expandColumnarExtractorContext(columnarizeExtractorContext(matching)), matching)

	const differentNativeImage = image(4, 4, () => [1, 2, 3])
	const differentNative = {
		...differentNativeImage,
		channels: 3 as const,
		depth: "uchar" as const,
		colorSpace: "srgb" as const,
	}
	const absent = compactExtractorContext(context, createNativeRgbOccupancy(differentNative))
	assert.equal(absent.exactNativePresenceCount, 0)
})

test("directed evidence matching reports unmatched, split, and merged identity structure", () => {
	const solid = image(8, 8, () => [80, 120, 160])
	const reference = compactResolutionEvidence(analyzeResolutionEvidence(solid, solid)).compact
	const duplicateTarget = structuredClone(reference)
	duplicateTarget.candidates.push({ ...structuredClone(reference.candidates[0]), id: 1, key: "candidate-1" })
	const matches = directedEvidenceMatches(reference, duplicateTarget)
	assert.equal(matches.policy.scalarScore, false)
	assert.equal(matches.referenceToProfile.candidates.unmatchedSourceCount, 0)
	assert.equal(matches.referenceToProfile.candidates.splitSourceCount, 1)
	assert.equal(matches.profileToReference.candidates.mergedTargetCount, 1)
	assert.equal(matches.referenceToProfile.candidates.edges.every((edge) =>
		typeof edge.componentSignatureExact === "boolean" && typeof edge.familyComponentSignatureExact === "boolean"), true)
	assert.deepEqual(expandColumnarIdentityMatches(columnarizeIdentityMatches(matches)), matches)
})

test("promotion certificates are raw-hash, schema, roster, and normalized-raster bound", async () => {
	for (const [cohort, reference] of [
		["development", PROMOTION_CERTIFICATE_REFERENCES.development],
		["00", PROMOTION_CERTIFICATE_REFERENCES.holdout00],
	] as const) {
		const bytes = await readFile(join(process.cwd(), reference.path))
		const artifact = JSON.parse(bytes.toString("utf8")) as { entries: Record<string, unknown> }
		const names = Object.keys(artifact.entries)
		const parsed = parsePromotionCertificateArtifact(bytes, cohort, names)
		assert.equal(parsed.rawSha256, reference.rawSha256)
		assert.equal(Object.keys(parsed.entries).length, reference.entries)
		assert.throws(() => parsePromotionCertificateArtifact(bytes, cohort, names.slice(1)), /keys\/count/)
		const changed = bytes.slice()
		changed[changed.length - 2] ^= 1
		assert.throws(() => parsePromotionCertificateArtifact(changed, cohort, names), /raw SHA-256 changed/)
	}
	const one = image(1, 1, () => [1, 2, 3])
	assert.match(normalizedImageSha256(one), /^[a-f0-9]{64}$/)
	assert.notEqual(normalizedImageSha256(one), normalizedImageSha256({ ...one, width: 3, height: 1 }))
})

test("implementation identity recursively closes local static imports and fails unresolved or symlinked files", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "palette-resolution-closure-"))
	try {
		await mkdir(join(temporary, "src"))
		await writeFile(join(temporary, "src", "root.ts"), 'import { value } from "./dependency.ts"\nexport { value }\n')
		await writeFile(join(temporary, "src", "dependency.ts"), 'export { value } from "./leaf.ts"\n')
		await writeFile(join(temporary, "src", "leaf.ts"), "export const value = 1\n")
		await writeFile(join(temporary, "package.json"), "{}\n")
		assert.deepEqual(await discoverImplementationClosure(temporary, ["src/root.ts"], ["package.json"]), [
			"package.json", "src/dependency.ts", "src/leaf.ts", "src/root.ts",
		])
		await writeFile(join(temporary, "src", "dependency.ts"), 'export { value } from "./missing.ts"\n')
		await assert.rejects(discoverImplementationClosure(temporary, ["src/root.ts"], []), /Unresolved local implementation import/)
		await symlink(join(temporary, "src", "leaf.ts"), join(temporary, "src", "linked.ts"))
		await writeFile(join(temporary, "src", "root.ts"), 'export { value } from "./linked.ts"\n')
		await assert.rejects(discoverImplementationClosure(temporary, ["src/root.ts"], []), /not a regular file/)
	} finally {
		await rm(temporary, { recursive: true, force: true })
	}
})

test("synthetic controls expose computed field and relation deltas without making them quality gates", () => {
	const controls = runControls()
	assert.equal(controls.allGatesPassed, true)
	assert.equal(controls.controls.deterministicRerun.passed, true)
	assert.ok(controls.controls.thinDetails.thinComponentSupport > 0)
	assert.ok(controls.controls.broadVersusLocalRamp.coverageDelta > 0)
	assert.equal(controls.controls.equalHistogramGeometry.geometryChanged, true)
	assert.equal(controls.controls.frameVersusInterior.qualityGate, false)
})

test("nearest-color reconstruction keeps candidate means independent", () => {
	const samples = new Float32Array([
		...([0.627955, 0.224863, 0.125846] as const),
		...([0.452014, -0.032457, -0.311528] as const),
	])
	const exactMean = nearestCandidateReconstructionMean(samples, [[255, 0, 0], [0, 0, 255]])
	const oneColorMean = nearestCandidateReconstructionMean(samples, [[255, 0, 0]])
	assert.ok(exactMean < 0.0001)
	assert.ok(oneColorMean > exactMean)
	assert.throws(() => nearestCandidateReconstructionMean(samples, []), /requires samples and candidates/)
})

test("persistent canonical child decodes with bare Sharp and rejects unsafe paths without exiting", { timeout: 30_000 }, async () => {
	const temporary = await mkdtemp(join(tmpdir(), "palette-resolution-child-"))
	let child: CanonicalRasterChild | undefined
	try {
		const root = await realpath(temporary)
		await mkdir(join(root, "images"))
		await mkdir(join(root, "00"))
		const pixels = new Uint8Array([
			255, 0, 0,
			0, 255, 0,
			0, 0, 255,
			255, 255, 255,
			20, 40, 60,
			80, 100, 120,
		])
		const png = await sharpModern(pixels, { raw: { width: 3, height: 2, channels: 3 } }).png().toBuffer()
		await writeFile(join(root, "images", "safe.png"), png)
		child = new CanonicalRasterChild(root)
		await assert.rejects(child.decode("../outside.png"), /direct child/)
		const decoded = await child.decode("images/safe.png")
		assert.equal(CANONICAL_CHILD_PROTOCOL_VERSION, "resolution-canonical-raster-child-v1")
		assert.deepEqual([decoded.width, decoded.height], [3, 2])
		assert.equal(decoded.data.length, 18)
		assert.equal(decoded.versions.sharp, "0.33.5")
		assert.equal(decoded.versions.node, process.versions.node)
		assert.equal(decoded.versions.platform, process.platform)
		assert.equal(decoded.versions.architecture, process.arch)
		assert.match(decoded.sourceSha256, /^[a-f0-9]{64}$/)
		await child.close()
		child = undefined
	} finally {
		if (child) await child.close().catch(() => undefined)
		await rm(temporary, { recursive: true, force: true })
	}
})

test("separate output child owns append-only begin, preserve, and release helpers", { timeout: 30_000 }, async () => {
	const temporary = await mkdtemp(join(tmpdir(), "palette-resolution-output-"))
	let child: ExperimentOutputChild | undefined
	try {
		const root = await realpath(temporary)
		const researchRoot = join(root, "research")
		await mkdir(join(researchRoot, "data", "experiments"), { recursive: true })
		child = new ExperimentOutputChild(researchRoot)
		const attempt = await child.beginOutput("data/experiments/dry")
		assert.equal(OUTPUT_CHILD_PROTOCOL_VERSION, "resolution-experiment-output-child-v1")
		assert.equal(attempt.outputDirectory, join(researchRoot, "data", "experiments", "dry"))
		assert.ok((await lstat(attempt.stagingDirectory)).isDirectory())
		const preserved = await child.preserveOutput()
		assert.ok((await lstat(preserved)).isDirectory())
		await assert.rejects(lstat(attempt.outputDirectory), { code: "ENOENT" })
		await child.releaseOutput()
		await child.close()
		child = undefined
	} finally {
		if (child) await child.close().catch(() => undefined)
		await rm(temporary, { recursive: true, force: true })
	}
})

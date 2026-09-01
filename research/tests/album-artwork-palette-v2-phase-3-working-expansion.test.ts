import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { fileURLToPath } from "node:url"
import {
	PHASE_3_WORKING_EXPANSION_MANIFEST_PATH,
	PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE,
	PHASE_3_WORKING_EXPANSION_SOURCE_COUNT,
	buildPhase3WorkingExpansionManifest,
	readAndVerifyPhase3WorkingExpansionManifest,
	verifyPhase3WorkingExpansionManifest,
	type Phase3WorkingExpansionManifest,
	type Phase3WorkingExpansionPanel,
	type Phase3WorkingExpansionPhase4Seal,
} from "../select-album-artwork-palette-v2-phase-3-working-expansion.ts"
import {
	loadAlbumArtworkPaletteV2Phase3ParallelWaveAuthorizedSources,
	parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments,
} from "../evaluate-album-artwork-palette-v2-phase-3-parallel-wave.ts"
import {
	executeAlbumArtworkPaletteV2Phase3Case,
	loadAlbumArtworkPaletteV2Phase3IterationSources,
	parseAlbumArtworkPaletteV2Phase3IterationArguments,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"
import {
	SOURCE_PROVENANCE_RESERVE_STATE,
	parseSourceProvenanceInventory,
} from "../src/source-provenance-inventory.ts"

const panelUrl = new URL("../data/album-artwork-palette-v2-development-panel.json", import.meta.url)
const inventoryUrl = new URL("../data/source-provenance-inventory-00-14.json", import.meta.url)
const phase4Url = new URL("../data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json", import.meta.url)
const manifestUrl = new URL("../data/album-artwork-palette-v2-phase-3-working-expansion.json", import.meta.url)
const selectorUrl = new URL("../select-album-artwork-palette-v2-phase-3-working-expansion.ts", import.meta.url)
const manifestPath = fileURLToPath(manifestUrl)

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

const inputPromise = Promise.all([
	readFile(panelUrl),
	readFile(inventoryUrl),
	readFile(phase4Url),
	readFile(manifestUrl),
]).then(([panelBytes, inventoryBytes, phase4Bytes, manifestBytes]) => ({
	panel: JSON.parse(panelBytes.toString("utf8")) as Phase3WorkingExpansionPanel,
	panelRawSha256: sha256(panelBytes),
	inventory: parseSourceProvenanceInventory(JSON.parse(inventoryBytes.toString("utf8")) as unknown),
	inventoryRawSha256: sha256(inventoryBytes),
	phase4: JSON.parse(phase4Bytes.toString("utf8")) as Phase3WorkingExpansionPhase4Seal,
	phase4RawSha256: sha256(phase4Bytes),
	manifest: JSON.parse(manifestBytes.toString("utf8")) as Phase3WorkingExpansionManifest,
}))

test("working expansion is deterministic and exactly reconstructs from pinned raw identities", async () => {
	const input = await inputPromise
	const expected = buildPhase3WorkingExpansionManifest(
		input.panel,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	)
	const reordered = buildPhase3WorkingExpansionManifest(
		{ ...input.panel, sources: [...input.panel.sources].reverse() },
		input.panelRawSha256,
		{ ...input.inventory, families: [...input.inventory.families].reverse() },
		input.inventoryRawSha256,
		{ ...input.phase4, selections: [...input.phase4.selections].reverse() },
		input.phase4RawSha256,
	)
	assert.deepEqual(reordered, expected)
	assert.deepEqual(verifyPhase3WorkingExpansionManifest(
		input.manifest,
		input.panel,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	), expected)
	assert.deepEqual(await readAndVerifyPhase3WorkingExpansionManifest(manifestPath), expected)
	assert.equal(PHASE_3_WORKING_EXPANSION_MANIFEST_PATH,
		"research/data/album-artwork-palette-v2-phase-3-working-expansion.json")

	const extraneousPanel = structuredClone(input.panel) as Phase3WorkingExpansionPanel & {
		sources: Array<Record<string, unknown>>
	}
	for (const source of extraneousPanel.sources) {
		source.candidateOutput = { desiredColor: "forbidden-signal" }
		source.review = "forbidden-signal"
		source.knownFailure = true
	}
	assert.deepEqual(buildPhase3WorkingExpansionManifest(
		extraneousPanel,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	), expected)
})

test("selects 12 roots across balanced metadata strata in batches no larger than eight", async () => {
	const { manifest } = await inputPromise
	const sources = manifest.expansionGroup.sources
	assert.equal(sources.length, PHASE_3_WORKING_EXPANSION_SOURCE_COUNT)
	assert.equal(new Set(sources.map(({ datasetRoot }) => datasetRoot)).size, 12)
	assert.deepEqual([...new Set(sources.map(({ datasetRoot }) => datasetRoot))].sort(),
		["00", "04", "05", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f"])
	assert.deepEqual(Object.fromEntries(manifest.selection.byteCountStrata.map(({ id, selectedCount }) =>
		[id, selectedCount])), { small: 4, medium: 4, large: 4 })
	assert.deepEqual(manifest.selection.batchSizes, [6, 6])
	assert.deepEqual(manifest.expansionGroup.runnerCaseIds,
		Array.from({ length: 12 }, (_, index) => `working-expansion-${String(index + 1).padStart(2, "0")}`))
	assert.equal(new Set(manifest.batches.flatMap(({ runnerCaseIds }) => runnerCaseIds)).size, 12)
	for (const batch of manifest.batches) {
		assert.ok(batch.sources.length > 0 && batch.sources.length <= PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE)
		assert.deepEqual(batch.runnerCaseIds, batch.sources.map(({ caseId }) => caseId))
	}
})

test("excludes every canonical, reserve/protected, and sealed Phase 4 path, hash, and family", async () => {
	const { panel, inventory, phase4, manifest } = await inputPromise
	const canonicalPaths = new Set(panel.sources.map(({ path }) => path))
	const canonicalHashes = new Set(panel.sources.map(({ sha256: hash }) => hash))
	const canonicalFamilies = new Set(panel.sources.map(({ artworkId }) => artworkId))
	const protectedFamilies = inventory.families.filter(({ reserve }) =>
		reserve?.provenanceState === SOURCE_PROVENANCE_RESERVE_STATE)
	const protectedPaths = new Set(protectedFamilies.flatMap(({ variants }) => variants.map(({ path }) => path)))
	const protectedHashes = new Set(protectedFamilies.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash)))
	const protectedFamilyIds = new Set(protectedFamilies.map(({ artworkId }) => artworkId))
	const phase4Paths = new Set(phase4.selections.map(({ source }) => source.path))
	const phase4Hashes = new Set(phase4.selections.map(({ source }) => source.sha256))
	const phase4Families = new Set(phase4.selections.map(({ familyId }) => familyId))
	const inventoryFamilies = new Map(inventory.families.map((family) => [family.artworkId, family]))
	const priorRoots = new Set(inventory.sourceRoots.filter(({ cohort }) => cohort === "prior-content")
		.map(({ path }) => path))

	for (const source of manifest.expansionGroup.sources) {
		assert.equal(canonicalPaths.has(source.path) || canonicalHashes.has(source.sha256) ||
			canonicalFamilies.has(source.artworkId), false)
		assert.equal(protectedPaths.has(source.path) || protectedHashes.has(source.sha256) ||
			protectedFamilyIds.has(source.artworkId), false)
		assert.equal(phase4Paths.has(source.path) || phase4Hashes.has(source.sha256) ||
			phase4Families.has(source.artworkId), false)
		assert.equal(priorRoots.has(source.datasetRoot), true)
		assert.doesNotMatch(source.path, /^(?:10|11|12|13|14)\//u)
		const family = inventoryFamilies.get(source.artworkId)
		assert.ok(family && family.reserve === null)
		assert.ok(family.variants.some((variant) => variant.path === source.path &&
			variant.sha256 === source.sha256 && variant.byteCount === source.byteCount &&
			variant.jpegSignatures.startsWithSoi && variant.jpegSignatures.endsWithEoi))
	}
})

test("rejects manifest and pinned-input tampering", async (context: TestContext) => {
	const input = await inputPromise
	const root = await mkdtemp(join(tmpdir(), "phase-3-working-expansion-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const tampered = structuredClone(input.manifest) as unknown as {
		expansionGroup: { sources: Array<Record<string, unknown>> }
	}
	tampered.expansionGroup.sources[0].sha256 = "0".repeat(64)
	const tamperedPath = join(root, "tampered.json")
	await writeFile(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`)
	await assert.rejects(() => readAndVerifyPhase3WorkingExpansionManifest(tamperedPath), /does not exactly match/u)
	assert.throws(() => buildPhase3WorkingExpansionManifest(
		input.panel,
		"0".repeat(64),
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	), /raw identity/u)
})

test("selector is metadata-only and never decodes or consults extraction and review signals", async () => {
	const source = await readFile(selectorUrl, "utf8")
	assert.match(source, /source-provenance-inventory-00-14\.json/u)
	assert.match(source, /album-artwork-palette-v2-development-panel\.json/u)
	assert.match(source, /album-artwork-palette-v2-phase-4-fast-sample\.sealed\.json/u)
	assert.doesNotMatch(source,
		/sharp|loadNativeImage|extractAlbumArtwork|extractColors|completeTreatment|candidate-child|readFile\([^)]*source\.path/iu)
})

test("runner and evaluator preserve canonical defaults and require an explicit verified expansion manifest", async (context) => {
	const canonical = parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "canonical-default-check", "--case", "development-01",
	])
	assert.equal(canonical.workingExpansionManifestPath, undefined)
	const canonicalSources = await loadAlbumArtworkPaletteV2Phase3IterationSources(canonical)
	assert.deepEqual(canonicalSources.authorization, {
		mode: "canonical-development",
		manifestId: "bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305",
	})
	assert.deepEqual(canonicalSources.sources.map(({ caseId }) => caseId), ["development-01"])
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "unauthorized-expansion", "--case", "working-expansion-01",
	]), /forbidden/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "working-expansion-invalid", "--working-expansion-manifest", manifestPath,
		"--case", "phase-4-fast-01",
	]), /forbidden/u)

	const expanded = parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "working-expansion-opt-in", "--working-expansion-manifest", manifestPath,
		"--case", "working-expansion-01", "--case", "working-expansion-12",
	])
	const expandedSources = await loadAlbumArtworkPaletteV2Phase3IterationSources(expanded)
	assert.equal(expandedSources.authorization.mode, "working-expansion")
	assert.deepEqual(expandedSources.sources.map(({ caseId }) => caseId),
		["working-expansion-01", "working-expansion-12"])
	assert.throws(() => executeAlbumArtworkPaletteV2Phase3Case(
		{ ...expandedSources.sources[0] },
		{ width: 1, height: 1, data: new Uint8Array(3) },
		[],
	), /requires an explicit verified manifest/u)

	const canonicalEvaluation = await loadAlbumArtworkPaletteV2Phase3ParallelWaveAuthorizedSources()
	assert.equal(canonicalEvaluation.authorization.mode, "canonical-development")
	assert.equal(canonicalEvaluation.sources.size, 28)
	assert.equal(canonicalEvaluation.sources.has("working-expansion-01"), false)
	const expandedEvaluation = await loadAlbumArtworkPaletteV2Phase3ParallelWaveAuthorizedSources(manifestPath)
	assert.equal(expandedEvaluation.authorization.mode, "working-expansion")
	assert.equal(expandedEvaluation.sources.size, 12)
	assert.equal(expandedEvaluation.sources.has("development-01"), false)
	const parsedEvaluation = parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments([
		"--iteration-directory", "scratch/control",
		"--control", "control",
		"--attempt", "arm",
		"--working-expansion-manifest", manifestPath,
		"--output", "scratch/evaluation.json",
	])
	assert.equal(parsedEvaluation.workingExpansionManifestPath, manifestPath)

	const input = await inputPromise
	const root = await mkdtemp(join(tmpdir(), "phase-3-working-expansion-opt-in-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const tampered = { ...structuredClone(input.manifest), manifestId: "f".repeat(64) }
	const tamperedPath = join(root, "tampered.json")
	await writeFile(tamperedPath, `${JSON.stringify(tampered)}\n`)
	await assert.rejects(() => loadAlbumArtworkPaletteV2Phase3IterationSources({
		...expanded,
		workingExpansionManifestPath: tamperedPath,
	}), /does not exactly match/u)
	await assert.rejects(() => loadAlbumArtworkPaletteV2Phase3ParallelWaveAuthorizedSources(tamperedPath),
		/does not exactly match/u)
})

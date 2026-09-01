import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	PHASE_3_EXPANDED_DEVELOPMENT_CORE_CASE_IDS,
	PHASE_3_EXPANDED_DEVELOPMENT_MANIFEST_PATH,
	PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE,
	buildPhase3ExpandedDevelopmentManifest,
	verifyPhase3ExpandedDevelopmentManifest,
	type Phase3ExpandedDevelopmentManifest,
	type Phase3ExpandedDevelopmentPanel,
	type Phase3ExpandedDevelopmentPhase4Seal,
} from "../select-album-artwork-palette-v2-phase-3-expanded-development.ts"
import { parseSourceProvenanceInventory } from "../src/source-provenance-inventory.ts"

const projectRoot = new URL("../../", import.meta.url)
const panelUrl = new URL("../data/album-artwork-palette-v2-development-panel.json", import.meta.url)
const inventoryUrl = new URL("../data/source-provenance-inventory-00-14.json", import.meta.url)
const phase4Url = new URL("../data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json", import.meta.url)
const manifestUrl = new URL("../data/album-artwork-palette-v2-phase-3-expanded-development.json", import.meta.url)
const selectorUrl = new URL("../select-album-artwork-palette-v2-phase-3-expanded-development.ts", import.meta.url)

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

const inputsPromise = Promise.all([
	readFile(panelUrl),
	readFile(inventoryUrl),
	readFile(phase4Url),
	readFile(manifestUrl),
]).then(([panelBytes, inventoryBytes, phase4Bytes, manifestBytes]) => ({
	panel: JSON.parse(panelBytes.toString("utf8")) as Phase3ExpandedDevelopmentPanel,
	panelRawSha256: sha256(panelBytes),
	inventory: parseSourceProvenanceInventory(JSON.parse(inventoryBytes.toString("utf8")) as unknown),
	inventoryRawSha256: sha256(inventoryBytes),
	phase4: JSON.parse(phase4Bytes.toString("utf8")) as Phase3ExpandedDevelopmentPhase4Seal,
	phase4RawSha256: sha256(phase4Bytes),
	manifest: JSON.parse(manifestBytes.toString("utf8")) as Phase3ExpandedDevelopmentManifest,
}))

test("expanded Phase 3 development selection is deterministic and exactly reconstructs", async () => {
	const input = await inputsPromise
	const first = buildPhase3ExpandedDevelopmentManifest(
		input.panel,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	)
	const reversedPanel = { ...input.panel, sources: [...input.panel.sources].reverse() }
	const reversed = buildPhase3ExpandedDevelopmentManifest(
		reversedPanel,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	)
	assert.deepEqual(reversed, first)
	assert.deepEqual(verifyPhase3ExpandedDevelopmentManifest(
		input.manifest,
		input.panel,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	), first)
	assert.equal(PHASE_3_EXPANDED_DEVELOPMENT_MANIFEST_PATH,
		"research/data/album-artwork-palette-v2-phase-3-expanded-development.json")

	const extraneous = structuredClone(input.panel) as Phase3ExpandedDevelopmentPanel & {
		sources: Array<Record<string, unknown>>
	}
	for (const source of extraneous.sources) {
		source.candidateOutput = { desiredColor: "not-an-input" }
		source.reviewOutcome = "not-an-input"
		source.knownFailure = true
	}
	assert.deepEqual(buildPhase3ExpandedDevelopmentManifest(
		extraneous,
		input.panelRawSha256,
		input.inventory,
		input.inventoryRawSha256,
		input.phase4,
		input.phase4RawSha256,
	), first)
})

test("retains the eight-case core and bounds 20 non-overlapping additions in diverse batches", async () => {
	const { manifest } = await inputsPromise
	assert.deepEqual(manifest.diagnosticCore.runnerCaseIds, PHASE_3_EXPANDED_DEVELOPMENT_CORE_CASE_IDS)
	assert.equal(manifest.diagnosticCore.sources.length, 8)
	assert.deepEqual(manifest.selection.batchSizes, [7, 7, 6])
	assert.equal(manifest.selection.additionCount, 20)
	assert.deepEqual(manifest.selection.observedAdditionDatasetRoots, ["00", "03", "04", "05", "07", "08"])

	const coreCases = new Set(manifest.diagnosticCore.sources.map(({ caseId }) => caseId))
	const additions = manifest.additionBatches.flatMap(({ additions: values }) => values)
	assert.equal(additions.length, 20)
	assert.equal(new Set(additions.map(({ caseId }) => caseId)).size, 20)
	assert.equal(new Set(additions.map(({ artworkFamily }) => artworkFamily)).size, 20)
	assert.equal(new Set(additions.map(({ sha256: hash }) => hash)).size, 20)
	assert.ok(additions.every(({ caseId }) => !coreCases.has(caseId)))
	for (const batch of manifest.additionBatches) {
		assert.ok(batch.additions.length >= 1 &&
			batch.additions.length <= PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE)
		assert.deepEqual(batch.runnerCaseIds, batch.additions.map(({ caseId }) => caseId))
		assert.equal(batch.additions.filter(({ cohort }) => cohort === "dataset").length, 2)
		assert.ok(batch.structureTags.length >= 7)
	}
})

test("binds physical source custody and excludes reserve and Phase 4 identities", async () => {
	const { panel, inventory, phase4, manifest } = await inputsPromise
	const selected = [
		...manifest.diagnosticCore.sources,
		...manifest.additionBatches.flatMap(({ additions }) => additions),
	]
	const panelByCase = new Map(panel.sources.map((source) => [source.caseId, source]))
	await Promise.all(selected.map(async (source) => {
		const panelSource = panelByCase.get(source.caseId)
		assert.ok(panelSource)
		assert.equal(source.path, panelSource.path)
		assert.equal(source.sha256, panelSource.sha256)
		assert.equal(source.byteCount, panelSource.byteCount)
		assert.equal(source.artworkFamily, panelSource.artworkId)
		assert.deepEqual(source.structureTags, [...panelSource.structureTags].sort())
		const bytes = await readFile(new URL(source.path, projectRoot))
		assert.equal(bytes.byteLength, source.byteCount)
		assert.equal(sha256(bytes), source.sha256)
	}))

	const reserveFamilies = inventory.families.filter(({ reserve }) => reserve !== null)
	const reservePaths = new Set(reserveFamilies.flatMap(({ variants }) => variants.map(({ path }) => path)))
	const reserveHashes = new Set(reserveFamilies.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash)))
	const reserveArtworkFamilies = new Set(reserveFamilies.map(({ artworkId }) => artworkId))
	const phase4Paths = new Set(phase4.selections.map(({ source }) => source.path))
	const phase4Hashes = new Set(phase4.selections.map(({ source }) => source.sha256))
	const phase4Families = new Set(phase4.selections.map(({ familyId }) => familyId))
	for (const source of selected) {
		assert.doesNotMatch(source.path, /^(?:10|11|12|13|14)\//u)
		assert.equal(reservePaths.has(source.path), false)
		assert.equal(reserveHashes.has(source.sha256), false)
		assert.equal(reserveArtworkFamilies.has(source.artworkFamily), false)
		assert.equal(phase4Paths.has(source.path), false)
		assert.equal(phase4Hashes.has(source.sha256), false)
		assert.equal(phase4Families.has(source.artworkFamily), false)
	}
})

test("selector has only source-metadata inputs and no decode, extraction, or inference dependency", async () => {
	const source = await readFile(selectorUrl, "utf8")
	assert.match(source, /album-artwork-palette-v2-development-panel\.json/u)
	assert.match(source, /source-provenance-inventory-00-14\.json/u)
	assert.match(source, /album-artwork-palette-v2-phase-4-fast-sample\.sealed\.json/u)
	assert.doesNotMatch(source, /sharp|loadNativeImage|extractAlbumArtwork|extractColors|completeTreatment|candidate-child/iu)
})

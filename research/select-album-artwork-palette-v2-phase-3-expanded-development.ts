import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { fileURLToPath } from "node:url"
import {
	SOURCE_PROVENANCE_INVENTORY_VERSION,
	SOURCE_PROVENANCE_RESERVE_STATE,
	parseSourceProvenanceInventory,
	type SourceProvenanceInventory,
} from "./src/source-provenance-inventory.ts"

export const PHASE_3_EXPANDED_DEVELOPMENT_VERSION =
	"album-artwork-palette-v2-phase-3-expanded-development-v1" as const
export const PHASE_3_EXPANDED_DEVELOPMENT_PANEL_PATH =
	"research/data/album-artwork-palette-v2-development-panel.json" as const
export const PHASE_3_EXPANDED_DEVELOPMENT_INVENTORY_PATH =
	"research/data/source-provenance-inventory-00-14.json" as const
export const PHASE_3_EXPANDED_DEVELOPMENT_PHASE_4_PATH =
	"research/data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json" as const
export const PHASE_3_EXPANDED_DEVELOPMENT_MANIFEST_PATH =
	"research/data/album-artwork-palette-v2-phase-3-expanded-development.json" as const
export const PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE = 8 as const
export const PHASE_3_EXPANDED_DEVELOPMENT_CORE_CASE_IDS = Object.freeze([
	"development-03",
	"development-12",
	"development-16",
	"development-18",
	"development-19",
	"development-21",
	"development-22",
	"development-26",
] as const)

const SELECTION_DOMAIN = "album-artwork-palette-v2-phase-3-expanded-development-source-v1"
const MANIFEST_DOMAIN = "album-artwork-palette-v2-phase-3-expanded-development-manifest-v1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))

export type Phase3ExpandedDevelopmentPanelSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

export type Phase3ExpandedDevelopmentPanel = Readonly<{
	schemaVersion: number
	inventoryVersion: string
	inventoryId: string
	inventorySha256: string
	sourceCount: number
	sources: readonly Phase3ExpandedDevelopmentPanelSource[]
	manifestId: string
}>

export type Phase3ExpandedDevelopmentPhase4Seal = Readonly<{
	manifestId: string
	sealCommitment: string
	selections: readonly Readonly<{
		familyId: string
		source: Readonly<{ path: string; sha256: string; byteCount: number }>
	}>[]
}>

export type Phase3ExpandedDevelopmentSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkFamily: string
	cohort: "stress" | "dataset"
	datasetRoot: string
	structureTags: readonly string[]
	selectionKey: string
}>

export type Phase3ExpandedDevelopmentBatch = Readonly<{
	batchId: string
	runnerCaseIds: readonly string[]
	datasetRoots: readonly string[]
	structureTags: readonly string[]
	additions: readonly Phase3ExpandedDevelopmentSource[]
}>

export type Phase3ExpandedDevelopmentManifestIdentity = Readonly<{
	schemaVersion: 1
	manifestVersion: typeof PHASE_3_EXPANDED_DEVELOPMENT_VERSION
	custody: Readonly<{
		mode: "source-only"
		developmentPanel: Readonly<{
			path: typeof PHASE_3_EXPANDED_DEVELOPMENT_PANEL_PATH
			manifestId: string
			rawSha256: string
			sourceCount: 28
		}>
		reserveInventory: Readonly<{
			path: typeof PHASE_3_EXPANDED_DEVELOPMENT_INVENTORY_PATH
			inventoryVersion: typeof SOURCE_PROVENANCE_INVENTORY_VERSION
			inventoryId: string
			rawSha256: string
		}>
		phase4Seal: Readonly<{
			path: typeof PHASE_3_EXPANDED_DEVELOPMENT_PHASE_4_PATH
			manifestId: string
			sealCommitment: string
			rawSha256: string
		}>
	}>
	selection: Readonly<{
		policy: string
		batchingPolicy: string
		maximumBatchSize: typeof PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE
		batchCount: number
		batchSizes: readonly number[]
		coreCount: 8
		additionCount: 20
		observedAdditionDatasetRoots: readonly string[]
		dimensions: "not-present-in-bound-development-panel-and-not-decoded-for-selection"
		sourceMetadataUsed: readonly string[]
		excludedSignals: readonly string[]
	}>
	diagnosticCore: Readonly<{
		runnerCaseIds: readonly string[]
		sources: readonly Phase3ExpandedDevelopmentSource[]
	}>
	additionBatches: readonly Phase3ExpandedDevelopmentBatch[]
}>

export type Phase3ExpandedDevelopmentManifest = Phase3ExpandedDevelopmentManifestIdentity & Readonly<{
	manifestId: string
}>

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareNumber(first: number, second: number): number {
	return first - second
}

export function phase3ExpandedDevelopmentCanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(phase3ExpandedDevelopmentCanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort(compareText).map((key) =>
		`${JSON.stringify(key)}:${phase3ExpandedDevelopmentCanonicalJson(record[key])}`).join(",")}}`
}

function assertSha256(value: string, label: string): void {
	if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} is not a SHA-256 digest`)
}

function sourceRoot(path: string): string {
	const separator = path.indexOf("/")
	if (separator <= 0 || path.startsWith("/") || path.split(/[\\/]/u).includes("..")) {
		throw new Error(`Unsafe development source path ${path}`)
	}
	return path.slice(0, separator)
}

function uniqueStrings(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

function selectionKey(source: Phase3ExpandedDevelopmentPanelSource, root: string): string {
	return sha256(`${SELECTION_DOMAIN}\0${phase3ExpandedDevelopmentCanonicalJson({
		artworkFamily: source.artworkId,
		byteCount: source.byteCount,
		cohort: source.cohort,
		datasetRoot: root,
		sha256: source.sha256,
		structureTags: [...source.structureTags].sort(compareText),
	})}`)
}

function normalizedSource(source: Phase3ExpandedDevelopmentPanelSource): Phase3ExpandedDevelopmentSource {
	const root = sourceRoot(source.path)
	return {
		caseId: source.caseId,
		path: source.path,
		sha256: source.sha256,
		byteCount: source.byteCount,
		artworkFamily: source.artworkId,
		cohort: source.cohort,
		datasetRoot: root,
		structureTags: [...source.structureTags].sort(compareText),
		selectionKey: selectionKey(source, root),
	}
}

function assertPanel(panel: Phase3ExpandedDevelopmentPanel): void {
	if (panel.schemaVersion !== 1 || panel.sourceCount !== 28 || panel.sources.length !== 28) {
		throw new Error("Expanded Phase 3 development requires the exact 28-source development panel")
	}
	assertSha256(panel.manifestId, "Development panel manifest ID")
	assertSha256(panel.inventoryId, "Development panel inventory ID")
	assertSha256(panel.inventorySha256, "Development panel inventory SHA-256")
	uniqueStrings(panel.sources.map(({ caseId }) => caseId), "Development panel case IDs")
	uniqueStrings(panel.sources.map(({ path }) => path), "Development panel paths")
	uniqueStrings(panel.sources.map(({ sha256: hash }) => hash), "Development panel source SHA-256 values")
	uniqueStrings(panel.sources.map(({ artworkId }) => artworkId), "Development panel artwork families")
	for (const source of panel.sources) {
		if (!/^development-[0-9]{2}$/u.test(source.caseId) || !Number.isSafeInteger(source.byteCount) ||
			source.byteCount <= 0 || source.structureTags.length === 0 ||
			!source.structureTags.every((tag) => typeof tag === "string" && tag.length > 0)) {
			throw new Error(`Development panel source ${source.caseId} has invalid source metadata`)
		}
		assertSha256(source.sha256, `Development panel source ${source.caseId}`)
	}
}

function protectedIdentitySets(
	inventory: SourceProvenanceInventory,
	phase4Seal: Phase3ExpandedDevelopmentPhase4Seal,
): Readonly<{ paths: Set<string>; hashes: Set<string>; families: Set<string> }> {
	const protectedFamilies = inventory.families.filter(({ reserve }) =>
		reserve?.provenanceState === SOURCE_PROVENANCE_RESERVE_STATE)
	const paths = new Set(protectedFamilies.flatMap(({ variants }) => variants.map(({ path }) => path)))
	const hashes = new Set(protectedFamilies.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash)))
	const families = new Set(protectedFamilies.map(({ artworkId }) => artworkId))
	for (const selection of phase4Seal.selections) {
		paths.add(selection.source.path)
		hashes.add(selection.source.sha256)
		families.add(selection.familyId)
	}
	return { paths, hashes, families }
}

function assertAuthorizedSource(
	source: Phase3ExpandedDevelopmentSource,
	inventory: SourceProvenanceInventory,
	protectedIdentities: ReturnType<typeof protectedIdentitySets>,
): void {
	if (protectedIdentities.paths.has(source.path) || protectedIdentities.hashes.has(source.sha256) ||
		protectedIdentities.families.has(source.artworkFamily)) {
		throw new Error(`Development source ${source.caseId} overlaps protected or reserve custody`)
	}
	if (source.datasetRoot === "images" || source.datasetRoot === "music-artworks") return
	if (!/^(?:0[0-9]|1[01])$/u.test(source.datasetRoot)) {
		throw new Error(`Development source ${source.caseId} is outside runner-authorized roots`)
	}
	const binding = inventory.sourceRoots.find(({ path }) => path === source.datasetRoot)
	if (!binding || binding.cohort !== "prior-content" || binding.provenanceState !== "prior-content") {
		throw new Error(`Development source ${source.caseId} belongs to protected or reserve root ${source.datasetRoot}`)
	}
}

function targetBatchSizes(additionCount: number, batchCount: number): number[] {
	const minimum = Math.floor(additionCount / batchCount)
	const remainder = additionCount % batchCount
	return Array.from({ length: batchCount }, (_, index) => minimum + (index < remainder ? 1 : 0))
}

function assignAdditionBatches(
	additions: readonly Phase3ExpandedDevelopmentSource[],
): Phase3ExpandedDevelopmentBatch[] {
	const batchCount = Math.ceil(additions.length / PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE)
	const totalTargets = targetBatchSizes(additions.length, batchCount)
	const batches = Array.from({ length: batchCount }, () => [] as Phase3ExpandedDevelopmentSource[])
	const dataset = additions.filter(({ cohort }) => cohort === "dataset")
		.sort((first, second) => compareText(first.selectionKey, second.selectionKey))
	const stress = additions.filter(({ cohort }) => cohort === "stress")
		.sort((first, second) => compareText(first.selectionKey, second.selectionKey))
	for (let index = 0; index < dataset.length; index++) batches[index % batchCount].push(dataset[index])
	const stressTargets = totalTargets.map((target, index) => target - batches[index].length)
	for (const source of stress) {
		const eligible = batches.map((batch, index) => ({
			batch,
			index,
			stressCount: batch.filter(({ cohort }) => cohort === "stress").length,
			newTagCount: source.structureTags.filter((tag) =>
				!batch.some(({ structureTags }) => structureTags.includes(tag))).length,
		})).filter(({ stressCount, index }) => stressCount < stressTargets[index])
			.sort((first, second) => second.newTagCount - first.newTagCount ||
				compareNumber(first.stressCount, second.stressCount) || compareNumber(first.index, second.index))
		const selected = eligible[0]
		if (!selected) throw new Error(`No bounded batch remains for ${source.caseId}`)
		selected.batch.push(source)
	}
	return batches.map((batch, index) => {
		const ordered = [...batch].sort((first, second) => compareText(first.selectionKey, second.selectionKey))
		if (ordered.length !== totalTargets[index] ||
			ordered.length > PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE) {
			throw new Error(`Expanded development batch ${index + 1} violates its bound`)
		}
		return {
			batchId: `phase-3-expanded-additions-${String(index + 1).padStart(2, "0")}`,
			runnerCaseIds: ordered.map(({ caseId }) => caseId),
			datasetRoots: [...new Set(ordered.map(({ datasetRoot }) => datasetRoot))].sort(compareText),
			structureTags: [...new Set(ordered.flatMap(({ structureTags }) => structureTags))].sort(compareText),
			additions: ordered,
		}
	})
}

function identityManifestId(identity: Phase3ExpandedDevelopmentManifestIdentity): string {
	return sha256(`${MANIFEST_DOMAIN}\0${phase3ExpandedDevelopmentCanonicalJson(identity)}`)
}

export function buildPhase3ExpandedDevelopmentManifest(
	panel: Phase3ExpandedDevelopmentPanel,
	panelRawSha256: string,
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
	phase4Seal: Phase3ExpandedDevelopmentPhase4Seal,
	phase4RawSha256: string,
): Phase3ExpandedDevelopmentManifest {
	assertPanel(panel)
	for (const [value, label] of [
		[panelRawSha256, "Development panel raw SHA-256"],
		[inventoryRawSha256, "Reserve inventory raw SHA-256"],
		[phase4RawSha256, "Phase 4 seal raw SHA-256"],
	] as const) assertSha256(value, label)
	if (inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION ||
		panel.inventoryVersion !== inventory.inventoryVersion || panel.inventoryId !== inventory.inventoryId ||
		panel.inventorySha256 !== inventoryRawSha256) {
		throw new Error("Development panel and source-provenance inventory custody do not match")
	}
	assertSha256(phase4Seal.manifestId, "Phase 4 manifest ID")
	assertSha256(phase4Seal.sealCommitment, "Phase 4 seal commitment")
	const coreCaseIds = new Set<string>(PHASE_3_EXPANDED_DEVELOPMENT_CORE_CASE_IDS)
	const core = PHASE_3_EXPANDED_DEVELOPMENT_CORE_CASE_IDS.map((caseId) => {
		const source = panel.sources.find((candidate) => candidate.caseId === caseId)
		if (!source) throw new Error(`Diagnostic core source ${caseId} is absent from the development panel`)
		return normalizedSource(source)
	})
	const additions = panel.sources.filter(({ caseId }) => !coreCaseIds.has(caseId)).map(normalizedSource)
	if (core.length !== 8 || additions.length !== 20) {
		throw new Error("Expanded development must retain eight core sources and derive 20 additions")
	}
	const protectedIdentities = protectedIdentitySets(inventory, phase4Seal)
	for (const source of [...core, ...additions]) assertAuthorizedSource(source, inventory, protectedIdentities)
	uniqueStrings([...core, ...additions].map(({ selectionKey: key }) => key), "Source-only selection keys")
	const additionBatches = assignAdditionBatches(additions)
	const identity: Phase3ExpandedDevelopmentManifestIdentity = {
		schemaVersion: 1,
		manifestVersion: PHASE_3_EXPANDED_DEVELOPMENT_VERSION,
		custody: {
			mode: "source-only",
			developmentPanel: {
				path: PHASE_3_EXPANDED_DEVELOPMENT_PANEL_PATH,
				manifestId: panel.manifestId,
				rawSha256: panelRawSha256,
				sourceCount: 28,
			},
			reserveInventory: {
				path: PHASE_3_EXPANDED_DEVELOPMENT_INVENTORY_PATH,
				inventoryVersion: inventory.inventoryVersion,
				inventoryId: inventory.inventoryId,
				rawSha256: inventoryRawSha256,
			},
			phase4Seal: {
				path: PHASE_3_EXPANDED_DEVELOPMENT_PHASE_4_PATH,
				manifestId: phase4Seal.manifestId,
				sealCommitment: phase4Seal.sealCommitment,
				rawSha256: phase4RawSha256,
			},
		},
		selection: {
			policy: "retain-the-exact-eight-case-diagnostic-core-and-use-every-distinct-non-core-source-from-the-bound-28-source-development-panel",
			batchingPolicy: "source-only-key-order; round-robin-dataset-roots; then-existing-structure-tag-coverage; balanced-7-7-6-capacities",
			maximumBatchSize: PHASE_3_EXPANDED_DEVELOPMENT_MAXIMUM_BATCH_SIZE,
			batchCount: additionBatches.length,
			batchSizes: additionBatches.map(({ additions: batchAdditions }) => batchAdditions.length),
			coreCount: 8,
			additionCount: 20,
			observedAdditionDatasetRoots: [...new Set(additions.filter(({ cohort }) => cohort === "dataset")
				.map(({ datasetRoot }) => datasetRoot))].sort(compareText),
			dimensions: "not-present-in-bound-development-panel-and-not-decoded-for-selection",
			sourceMetadataUsed: [
				"bound development-panel membership",
				"diagnostic-core case identity for exclusion from additions",
				"cohort and dataset/root",
				"SHA-256 and byte count",
				"artwork-family identity",
				"existing structure tags",
			],
			excludedSignals: [
				"candidate outputs",
				"review outcomes",
				"desired colors",
				"known failures",
				"filename semantics",
			],
		},
		diagnosticCore: {
			runnerCaseIds: [...PHASE_3_EXPANDED_DEVELOPMENT_CORE_CASE_IDS],
			sources: core,
		},
		additionBatches,
	}
	return { ...identity, manifestId: identityManifestId(identity) }
}

export function verifyPhase3ExpandedDevelopmentManifest(
	value: unknown,
	panel: Phase3ExpandedDevelopmentPanel,
	panelRawSha256: string,
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
	phase4Seal: Phase3ExpandedDevelopmentPhase4Seal,
	phase4RawSha256: string,
): Phase3ExpandedDevelopmentManifest {
	const expected = buildPhase3ExpandedDevelopmentManifest(
		panel,
		panelRawSha256,
		inventory,
		inventoryRawSha256,
		phase4Seal,
		phase4RawSha256,
	)
	if (!isDeepStrictEqual(value, expected)) {
		throw new Error("Expanded Phase 3 development manifest does not match its source-only custody inputs")
	}
	return expected
}

async function jsonInput<T>(path: string): Promise<Readonly<{ value: T; rawSha256: string }>> {
	const bytes = await readFile(resolve(projectRoot, path))
	return { value: JSON.parse(bytes.toString("utf8")) as T, rawSha256: sha256(bytes) }
}

async function main(): Promise<void> {
	const argument = process.argv[2] ?? "--verify"
	if (process.argv.length > 3 || (argument !== "--verify" && argument !== "--print")) {
		throw new Error("Usage: select-album-artwork-palette-v2-phase-3-expanded-development.ts [--verify|--print]")
	}
	const [panelInput, inventoryInput, phase4Input] = await Promise.all([
		jsonInput<Phase3ExpandedDevelopmentPanel>(PHASE_3_EXPANDED_DEVELOPMENT_PANEL_PATH),
		jsonInput<unknown>(PHASE_3_EXPANDED_DEVELOPMENT_INVENTORY_PATH),
		jsonInput<Phase3ExpandedDevelopmentPhase4Seal>(PHASE_3_EXPANDED_DEVELOPMENT_PHASE_4_PATH),
	])
	const inventory = parseSourceProvenanceInventory(inventoryInput.value)
	const expected = buildPhase3ExpandedDevelopmentManifest(
		panelInput.value,
		panelInput.rawSha256,
		inventory,
		inventoryInput.rawSha256,
		phase4Input.value,
		phase4Input.rawSha256,
	)
	if (argument === "--print") {
		process.stdout.write(`${JSON.stringify(expected, null, 2)}\n`)
		return
	}
	const checkedIn = await jsonInput<unknown>(PHASE_3_EXPANDED_DEVELOPMENT_MANIFEST_PATH)
	verifyPhase3ExpandedDevelopmentManifest(
		checkedIn.value,
		panelInput.value,
		panelInput.rawSha256,
		inventory,
		inventoryInput.rawSha256,
		phase4Input.value,
		phase4Input.rawSha256,
	)
	process.stdout.write(`Expanded Phase 3 development manifest verified: ${expected.manifestId}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}

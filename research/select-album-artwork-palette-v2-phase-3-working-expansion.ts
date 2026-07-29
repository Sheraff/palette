import { createHash } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { fileURLToPath } from "node:url"
import {
	PRIOR_SOURCE_ROOTS,
	SOURCE_PROVENANCE_INVENTORY_VERSION,
	SOURCE_PROVENANCE_RESERVE_STATE,
	parseSourceProvenanceInventory,
	sourceRootFromPath,
	type PriorSourceRoot,
	type SourceProvenanceInventory,
} from "./src/source-provenance-inventory.ts"

export const PHASE_3_WORKING_EXPANSION_VERSION =
	"album-artwork-palette-v2-phase-3-working-expansion-v1" as const
export const PHASE_3_WORKING_EXPANSION_PANEL_PATH =
	"research/data/album-artwork-palette-v2-development-panel.json" as const
export const PHASE_3_WORKING_EXPANSION_INVENTORY_PATH =
	"research/data/source-provenance-inventory-00-14.json" as const
export const PHASE_3_WORKING_EXPANSION_PHASE_4_PATH =
	"research/data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json" as const
export const PHASE_3_WORKING_EXPANSION_MANIFEST_PATH =
	"research/data/album-artwork-palette-v2-phase-3-working-expansion.json" as const
export const PHASE_3_WORKING_EXPANSION_SOURCE_COUNT = 12 as const
export const PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE = 8 as const

export const PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES = Object.freeze({
	developmentPanel: {
		manifestId: "bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305",
		rawSha256: "9258032b8ea2d40166d2be89767f5b15341145de314b007c09e766ffbaac75e4",
	},
	inventory: {
		inventoryId: "3907c57f94cd7dfea992c5d1ce98da6de2165c720b75259b32f0250da1881c7f",
		rawSha256: "80b53c77a025083ff0cfcb736bc425ec0917f70b9e325741899e8b8d92f4fac9",
	},
	phase4Seal: {
		manifestId: "6e65a71b8bdd369e2b3800ad7401d23ada2a4e47bfd2633083896375782bde7e",
		sealCommitment: "29a8f75445ed294ae21647b2bc48caf306d6a4d45190cbe32dcc10dc27c62a1f",
		rawSha256: "305f3b75320a4bc9d9d5569a37986e4fa22d5a39221cbcc03eb188b555ba88df",
	},
} as const)

const ROOT_SELECTION_DOMAIN = "album-artwork-palette-v2-phase-3-working-expansion-root-v1"
const STRATUM_ASSIGNMENT_DOMAIN = "album-artwork-palette-v2-phase-3-working-expansion-stratum-v1"
const SOURCE_SELECTION_DOMAIN = "album-artwork-palette-v2-phase-3-working-expansion-source-v1"
const BATCH_ASSIGNMENT_DOMAIN = "album-artwork-palette-v2-phase-3-working-expansion-batch-v1"
const MANIFEST_DOMAIN = "album-artwork-palette-v2-phase-3-working-expansion-manifest-v1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))

export type Phase3WorkingExpansionByteCountStratum = "small" | "medium" | "large"

const BYTE_COUNT_STRATA = Object.freeze([
	{ id: "small", minimumByteCount: 1, maximumByteCount: 65_535 },
	{ id: "medium", minimumByteCount: 65_536, maximumByteCount: 163_839 },
	{ id: "large", minimumByteCount: 163_840, maximumByteCount: null },
] as const)

export type Phase3WorkingExpansionPanelSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

export type Phase3WorkingExpansionPanel = Readonly<{
	schemaVersion: number
	inventoryVersion: string
	inventoryId: string
	inventorySha256: string
	sourceCount: number
	sources: readonly Phase3WorkingExpansionPanelSource[]
	manifestId: string
}>

export type Phase3WorkingExpansionPhase4Seal = Readonly<{
	manifestId: string
	sealCommitment: string
	selections: readonly Readonly<{
		familyId: string
		source: Readonly<{ path: string; sha256: string; byteCount: number }>
	}>[]
}>

export type Phase3WorkingExpansionSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "prior-content"
	datasetRoot: PriorSourceRoot
	format: "jpeg-inventory-signature"
	byteCountStratum: Phase3WorkingExpansionByteCountStratum
	selectionKey: string
}>

export type Phase3WorkingExpansionBatch = Readonly<{
	batchId: string
	runnerCaseIds: readonly string[]
	datasetRoots: readonly PriorSourceRoot[]
	byteCountStrata: readonly Phase3WorkingExpansionByteCountStratum[]
	sources: readonly Phase3WorkingExpansionSource[]
}>

export type Phase3WorkingExpansionManifestIdentity = Readonly<{
	schemaVersion: 1
	manifestVersion: typeof PHASE_3_WORKING_EXPANSION_VERSION
	custody: Readonly<{
		mode: "source-only"
		developmentPanel: Readonly<{
			path: typeof PHASE_3_WORKING_EXPANSION_PANEL_PATH
			manifestId: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.developmentPanel.manifestId
			rawSha256: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.developmentPanel.rawSha256
			sourceCount: 28
		}>
		priorContentInventory: Readonly<{
			path: typeof PHASE_3_WORKING_EXPANSION_INVENTORY_PATH
			inventoryVersion: typeof SOURCE_PROVENANCE_INVENTORY_VERSION
			inventoryId: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.inventoryId
			rawSha256: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.rawSha256
		}>
		phase4Seal: Readonly<{
			path: typeof PHASE_3_WORKING_EXPANSION_PHASE_4_PATH
			manifestId: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.manifestId
			sealCommitment: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.sealCommitment
			rawSha256: typeof PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.rawSha256
		}>
	}>
	selection: Readonly<{
		policy: string
		rootPolicy: string
		stratumPolicy: string
		sourcePolicy: string
		batchingPolicy: string
		additionCount: typeof PHASE_3_WORKING_EXPANSION_SOURCE_COUNT
		rootCount: typeof PHASE_3_WORKING_EXPANSION_SOURCE_COUNT
		maximumBatchSize: typeof PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE
		batchSizes: readonly number[]
		eligibleSourceCount: number
		roots: readonly Readonly<{
			datasetRoot: PriorSourceRoot
			canonicalPanelRepresented: boolean
			rootSelectionKey: string
			stratumAssignmentKey: string
			byteCountStratum: Phase3WorkingExpansionByteCountStratum
		}>[]
		byteCountStrata: readonly Readonly<{
			id: Phase3WorkingExpansionByteCountStratum
			minimumByteCount: number
			maximumByteCount: number | null
			selectedCount: 4
		}>[]
		dimensions: "not-in-inventory-and-not-decoded-for-selection"
		format: "jpeg-signature-metadata-from-bound-inventory"
		sourceMetadataUsed: readonly string[]
		excludedSignals: readonly string[]
	}>
	expansionGroup: Readonly<{
		groupId: "phase-3-working-expansion"
		runnerCaseIds: readonly string[]
		batchIds: readonly string[]
		sources: readonly Phase3WorkingExpansionSource[]
	}>
	batches: readonly Phase3WorkingExpansionBatch[]
}>

export type Phase3WorkingExpansionManifest = Phase3WorkingExpansionManifestIdentity & Readonly<{
	manifestId: string
}>

type Candidate = Readonly<{
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	datasetRoot: PriorSourceRoot
	format: "jpeg-inventory-signature"
	byteCountStratum: Phase3WorkingExpansionByteCountStratum
	selectionKey: string
}>

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function phase3WorkingExpansionCanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(phase3WorkingExpansionCanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort(compareText).map((key) =>
		`${JSON.stringify(key)}:${phase3WorkingExpansionCanonicalJson(record[key])}`).join(",")}}`
}

function assertExactRawIdentity(actual: string, expected: string, label: string): void {
	if (actual !== expected) throw new Error(`${label} raw identity does not match the pinned working-expansion input`)
}

function uniqueStrings(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

function panelRoot(path: string): string {
	const separator = path.indexOf("/")
	return separator > 0 ? path.slice(0, separator) : ""
}

function assertBoundInputs(
	panel: Phase3WorkingExpansionPanel,
	panelRawSha256: string,
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
	phase4Seal: Phase3WorkingExpansionPhase4Seal,
	phase4RawSha256: string,
): void {
	assertExactRawIdentity(panelRawSha256,
		PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.developmentPanel.rawSha256, "Development panel")
	assertExactRawIdentity(inventoryRawSha256,
		PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.rawSha256, "Source inventory")
	assertExactRawIdentity(phase4RawSha256,
		PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.rawSha256, "Phase 4 seal")
	if (panel.schemaVersion !== 1 || panel.sourceCount !== 28 || panel.sources.length !== 28 ||
		panel.manifestId !== PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.developmentPanel.manifestId ||
		panel.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION ||
		panel.inventoryId !== PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.inventoryId ||
		panel.inventorySha256 !== inventoryRawSha256) {
		throw new Error("Working expansion requires the exact pinned canonical 28-source panel")
	}
	if (inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION ||
		inventory.inventoryId !== PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.inventoryId) {
		throw new Error("Working expansion requires the exact pinned source-provenance inventory")
	}
	if (phase4Seal.manifestId !== PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.manifestId ||
		phase4Seal.sealCommitment !== PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.sealCommitment) {
		throw new Error("Working expansion requires the exact pinned sealed Phase 4 sample")
	}
	uniqueStrings(panel.sources.map(({ caseId }) => caseId), "Canonical panel case IDs")
	uniqueStrings(panel.sources.map(({ path }) => path), "Canonical panel paths")
	uniqueStrings(panel.sources.map(({ sha256: hash }) => hash), "Canonical panel hashes")
	uniqueStrings(panel.sources.map(({ artworkId }) => artworkId), "Canonical panel families")
}

function byteCountStratum(byteCount: number): Phase3WorkingExpansionByteCountStratum | null {
	if (!Number.isSafeInteger(byteCount) || byteCount <= 0) return null
	if (byteCount <= BYTE_COUNT_STRATA[0].maximumByteCount) return "small"
	if (byteCount <= BYTE_COUNT_STRATA[1].maximumByteCount) return "medium"
	return "large"
}

function metadataKey(domain: string, value: unknown): string {
	return sha256(`${domain}\0${phase3WorkingExpansionCanonicalJson(value)}`)
}

function protectedIdentitySets(
	inventory: SourceProvenanceInventory,
	phase4Seal: Phase3WorkingExpansionPhase4Seal,
): Readonly<{ paths: Set<string>; hashes: Set<string>; families: Set<string> }> {
	const reserveFamilies = inventory.families.filter(({ reserve }) =>
		reserve?.provenanceState === SOURCE_PROVENANCE_RESERVE_STATE)
	const paths = new Set(reserveFamilies.flatMap(({ variants }) => variants.map(({ path }) => path)))
	const hashes = new Set(reserveFamilies.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash)))
	const families = new Set(reserveFamilies.map(({ artworkId }) => artworkId))
	for (const selection of phase4Seal.selections) {
		paths.add(selection.source.path)
		hashes.add(selection.source.sha256)
		families.add(selection.familyId)
	}
	return { paths, hashes, families }
}

function eligibleCandidates(
	panel: Phase3WorkingExpansionPanel,
	inventory: SourceProvenanceInventory,
	phase4Seal: Phase3WorkingExpansionPhase4Seal,
): Candidate[] {
	const canonicalPaths = new Set(panel.sources.map(({ path }) => path))
	const canonicalHashes = new Set(panel.sources.map(({ sha256: hash }) => hash))
	const canonicalFamilies = new Set(panel.sources.map(({ artworkId }) => artworkId))
	const protectedIdentities = protectedIdentitySets(inventory, phase4Seal)
	const priorRoots = new Set(inventory.sourceRoots.filter(({ cohort, provenanceState }) =>
		cohort === "prior-content" && provenanceState === "prior-content").map(({ path }) => path))
	const candidates: Candidate[] = []
	for (const family of inventory.families) {
		if (family.reserve !== null || canonicalFamilies.has(family.artworkId) ||
			protectedIdentities.families.has(family.artworkId)) continue
		for (const variant of family.variants) {
			const root = sourceRootFromPath(variant.path)
			const stratum = byteCountStratum(variant.byteCount)
			if (!priorRoots.has(root as PriorSourceRoot) || stratum === null ||
				!variant.jpegSignatures.startsWithSoi || !variant.jpegSignatures.endsWithEoi ||
				canonicalPaths.has(variant.path) || canonicalHashes.has(variant.sha256) ||
				protectedIdentities.paths.has(variant.path) || protectedIdentities.hashes.has(variant.sha256)) continue
			const datasetRoot = root as PriorSourceRoot
			const format = "jpeg-inventory-signature" as const
			candidates.push({
				path: variant.path,
				sha256: variant.sha256,
				byteCount: variant.byteCount,
				artworkId: family.artworkId,
				datasetRoot,
				format,
				byteCountStratum: stratum,
				selectionKey: metadataKey(SOURCE_SELECTION_DOMAIN, {
					byteCount: variant.byteCount,
					datasetRoot,
					format,
					sha256: variant.sha256,
				}),
			})
		}
	}
	const keyCounts = new Map<string, number>()
	for (const { selectionKey } of candidates) keyCounts.set(selectionKey, (keyCounts.get(selectionKey) ?? 0) + 1)
	return candidates.filter(({ selectionKey }) => keyCounts.get(selectionKey) === 1)
		.sort((first, second) => compareText(first.selectionKey, second.selectionKey))
}

function selectedRootAssignments(panel: Phase3WorkingExpansionPanel): Array<{
	datasetRoot: PriorSourceRoot
	canonicalPanelRepresented: boolean
	rootSelectionKey: string
	stratumAssignmentKey: string
	byteCountStratum: Phase3WorkingExpansionByteCountStratum
}> {
	const represented = new Set(panel.sources.map(({ path }) => panelRoot(path))
		.filter((root): root is PriorSourceRoot => PRIOR_SOURCE_ROOTS.includes(root as PriorSourceRoot)))
	const ranked = PRIOR_SOURCE_ROOTS.map((datasetRoot) => ({
		datasetRoot,
		canonicalPanelRepresented: represented.has(datasetRoot),
		rootSelectionKey: metadataKey(ROOT_SELECTION_DOMAIN, { datasetRoot }),
		stratumAssignmentKey: metadataKey(STRATUM_ASSIGNMENT_DOMAIN, { datasetRoot }),
	})).sort((first, second) => Number(first.canonicalPanelRepresented) - Number(second.canonicalPanelRepresented) ||
		compareText(first.rootSelectionKey, second.rootSelectionKey))
	const roots = ranked.slice(0, PHASE_3_WORKING_EXPANSION_SOURCE_COUNT)
	if (roots.filter(({ canonicalPanelRepresented }) => !canonicalPanelRepresented).length !== 7) {
		throw new Error("Working expansion must cover every prior-content root absent from the canonical panel")
	}
	return roots.sort((first, second) => compareText(first.stratumAssignmentKey, second.stratumAssignmentKey))
		.map((root, index) => ({ ...root, byteCountStratum: BYTE_COUNT_STRATA[index % BYTE_COUNT_STRATA.length].id }))
}

function selectSources(
	assignments: ReturnType<typeof selectedRootAssignments>,
	candidates: readonly Candidate[],
): Phase3WorkingExpansionSource[] {
	const selected: Candidate[] = []
	const selectedHashes = new Set<string>()
	const selectedFamilies = new Set<string>()
	for (const assignment of assignments) {
		const source = candidates.find((candidate) => candidate.datasetRoot === assignment.datasetRoot &&
			candidate.byteCountStratum === assignment.byteCountStratum && !selectedHashes.has(candidate.sha256) &&
			!selectedFamilies.has(candidate.artworkId))
		if (!source) throw new Error(`No distinct source-only candidate satisfies root ${assignment.datasetRoot}`)
		selected.push(source)
		selectedHashes.add(source.sha256)
		selectedFamilies.add(source.artworkId)
	}
	return selected.sort((first, second) => compareText(first.selectionKey, second.selectionKey))
		.map((source, index) => ({
			caseId: `working-expansion-${String(index + 1).padStart(2, "0")}`,
			path: source.path,
			sha256: source.sha256,
			byteCount: source.byteCount,
			artworkId: source.artworkId,
			cohort: "prior-content",
			datasetRoot: source.datasetRoot,
			format: source.format,
			byteCountStratum: source.byteCountStratum,
			selectionKey: source.selectionKey,
		}))
}

function buildBatches(sources: readonly Phase3WorkingExpansionSource[]): Phase3WorkingExpansionBatch[] {
	const ordered = [...sources].sort((first, second) => compareText(
		metadataKey(BATCH_ASSIGNMENT_DOMAIN, { selectionKey: first.selectionKey }),
		metadataKey(BATCH_ASSIGNMENT_DOMAIN, { selectionKey: second.selectionKey }),
	))
	const grouped = [[], []] as Phase3WorkingExpansionSource[][]
	ordered.forEach((source, index) => grouped[index % grouped.length].push(source))
	return grouped.map((sourcesInBatch, index) => {
		const batchSources = sourcesInBatch.sort((first, second) => compareText(first.caseId, second.caseId))
		if (batchSources.length > PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE) {
			throw new Error(`Working expansion batch ${index + 1} exceeds its bound`)
		}
		return {
			batchId: `phase-3-working-expansion-${String(index + 1).padStart(2, "0")}`,
			runnerCaseIds: batchSources.map(({ caseId }) => caseId),
			datasetRoots: batchSources.map(({ datasetRoot }) => datasetRoot).sort(compareText),
			byteCountStrata: [...new Set(batchSources.map(({ byteCountStratum: stratum }) => stratum))].sort(compareText),
			sources: batchSources,
		}
	})
}

function manifestId(identity: Phase3WorkingExpansionManifestIdentity): string {
	return sha256(`${MANIFEST_DOMAIN}\0${phase3WorkingExpansionCanonicalJson(identity)}`)
}

export function buildPhase3WorkingExpansionManifest(
	panel: Phase3WorkingExpansionPanel,
	panelRawSha256: string,
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
	phase4Seal: Phase3WorkingExpansionPhase4Seal,
	phase4RawSha256: string,
): Phase3WorkingExpansionManifest {
	assertBoundInputs(panel, panelRawSha256, inventory, inventoryRawSha256, phase4Seal, phase4RawSha256)
	const candidates = eligibleCandidates(panel, inventory, phase4Seal)
	const rootAssignments = selectedRootAssignments(panel)
	const sources = selectSources(rootAssignments, candidates)
	const batches = buildBatches(sources)
	if (sources.length !== PHASE_3_WORKING_EXPANSION_SOURCE_COUNT || batches.some(({ sources: values }) =>
		values.length > PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE)) {
		throw new Error("Working expansion source or batch count is invalid")
	}
	uniqueStrings(sources.map(({ path }) => path), "Working expansion paths")
	uniqueStrings(sources.map(({ sha256: hash }) => hash), "Working expansion hashes")
	uniqueStrings(sources.map(({ artworkId }) => artworkId), "Working expansion families")
	const identity: Phase3WorkingExpansionManifestIdentity = {
		schemaVersion: 1,
		manifestVersion: PHASE_3_WORKING_EXPANSION_VERSION,
		custody: {
			mode: "source-only",
			developmentPanel: {
				path: PHASE_3_WORKING_EXPANSION_PANEL_PATH,
				manifestId: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.developmentPanel.manifestId,
				rawSha256: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.developmentPanel.rawSha256,
				sourceCount: 28,
			},
			priorContentInventory: {
				path: PHASE_3_WORKING_EXPANSION_INVENTORY_PATH,
				inventoryVersion: SOURCE_PROVENANCE_INVENTORY_VERSION,
				inventoryId: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.inventoryId,
				rawSha256: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.inventory.rawSha256,
			},
			phase4Seal: {
				path: PHASE_3_WORKING_EXPANSION_PHASE_4_PATH,
				manifestId: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.manifestId,
				sealCommitment: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.sealCommitment,
				rawSha256: PHASE_3_WORKING_EXPANSION_BOUND_IDENTITIES.phase4Seal.rawSha256,
			},
		},
		selection: {
			policy: "select-12-distinct-prior-content-sources-outside-all-canonical-protected-reserve-and-sealed-phase-4-identities",
			rootPolicy: "cover-all-seven-prior-content-roots-absent-from-canonical-then-rank-five-represented-roots-by-domain-separated-root-key",
			stratumPolicy: "assign-root-key-order-round-robin-to-four-small-four-medium-four-large-byte-count-strata",
			sourcePolicy: "lowest-distinct-domain-separated-key-over-root-sha256-byte-count-and-inventoried-format-within-each-root-stratum",
			batchingPolicy: "domain-separated-source-key-order-round-robin-into-two-six-source-batches",
			additionCount: PHASE_3_WORKING_EXPANSION_SOURCE_COUNT,
			rootCount: PHASE_3_WORKING_EXPANSION_SOURCE_COUNT,
			maximumBatchSize: PHASE_3_WORKING_EXPANSION_MAXIMUM_BATCH_SIZE,
			batchSizes: batches.map(({ sources: values }) => values.length),
			eligibleSourceCount: candidates.length,
			roots: [...rootAssignments].sort((first, second) => compareText(first.datasetRoot, second.datasetRoot)),
			byteCountStrata: BYTE_COUNT_STRATA.map((stratum) => ({
				...stratum,
				selectedCount: sources.filter(({ byteCountStratum: value }) => value === stratum.id).length as 4,
			})),
			dimensions: "not-in-inventory-and-not-decoded-for-selection",
			format: "jpeg-signature-metadata-from-bound-inventory",
			sourceMetadataUsed: [
				"prior-content root and cohort",
				"source SHA-256 and byte count",
				"inventoried JPEG SOI/EOI format signatures",
				"domain-separated deterministic keys",
				"path/hash/family identities only for exact custody exclusion and binding",
			],
			excludedSignals: [
				"filename or path semantics",
				"image pixels or decoding",
				"candidate or baseline outputs",
				"reviews or known failures",
				"desired colors",
			],
		},
		expansionGroup: {
			groupId: "phase-3-working-expansion",
			runnerCaseIds: sources.map(({ caseId }) => caseId),
			batchIds: batches.map(({ batchId }) => batchId),
			sources,
		},
		batches,
	}
	if (identity.selection.byteCountStrata.some(({ selectedCount }) => selectedCount !== 4)) {
		throw new Error("Working expansion byte-count strata are not balanced")
	}
	return { ...identity, manifestId: manifestId(identity) }
}

export function verifyPhase3WorkingExpansionManifest(
	value: unknown,
	panel: Phase3WorkingExpansionPanel,
	panelRawSha256: string,
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
	phase4Seal: Phase3WorkingExpansionPhase4Seal,
	phase4RawSha256: string,
): Phase3WorkingExpansionManifest {
	const expected = buildPhase3WorkingExpansionManifest(
		panel,
		panelRawSha256,
		inventory,
		inventoryRawSha256,
		phase4Seal,
		phase4RawSha256,
	)
	if (!isDeepStrictEqual(value, expected)) {
		throw new Error("Working-expansion manifest does not exactly match its pinned source-only custody inputs")
	}
	return expected
}

async function regularJsonInput<T>(path: string, label: string): Promise<Readonly<{ value: T; rawSha256: string }>> {
	const stats = await lstat(path)
	if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`)
	const bytes = await readFile(path)
	return { value: JSON.parse(bytes.toString("utf8")) as T, rawSha256: sha256(bytes) }
}

export async function readAndVerifyPhase3WorkingExpansionManifest(
	manifestPath: string = PHASE_3_WORKING_EXPANSION_MANIFEST_PATH,
): Promise<Phase3WorkingExpansionManifest> {
	const resolvedManifestPath = isAbsolute(manifestPath) ? resolve(manifestPath) : resolve(projectRoot, manifestPath)
	const [panelInput, inventoryInput, phase4Input, manifestInput] = await Promise.all([
		regularJsonInput<Phase3WorkingExpansionPanel>(resolve(projectRoot, PHASE_3_WORKING_EXPANSION_PANEL_PATH),
			"Canonical Phase 3 development panel"),
		regularJsonInput<unknown>(resolve(projectRoot, PHASE_3_WORKING_EXPANSION_INVENTORY_PATH),
			"Source-provenance inventory"),
		regularJsonInput<Phase3WorkingExpansionPhase4Seal>(resolve(projectRoot, PHASE_3_WORKING_EXPANSION_PHASE_4_PATH),
			"Sealed Phase 4 sample"),
		regularJsonInput<unknown>(resolvedManifestPath, "Working-expansion manifest"),
	])
	const inventory = parseSourceProvenanceInventory(inventoryInput.value)
	return verifyPhase3WorkingExpansionManifest(
		manifestInput.value,
		panelInput.value,
		panelInput.rawSha256,
		inventory,
		inventoryInput.rawSha256,
		phase4Input.value,
		phase4Input.rawSha256,
	)
}

async function main(): Promise<void> {
	const argument = process.argv[2] ?? "--verify"
	const manifestPath = process.argv[3] ?? PHASE_3_WORKING_EXPANSION_MANIFEST_PATH
	if ((argument !== "--verify" && argument !== "--print") || process.argv.length > (argument === "--verify" ? 4 : 3)) {
		throw new Error("Usage: select-album-artwork-palette-v2-phase-3-working-expansion.ts [--verify [manifest.json]|--print]")
	}
	if (argument === "--verify") {
		const manifest = await readAndVerifyPhase3WorkingExpansionManifest(manifestPath)
		process.stdout.write(`Phase 3 working expansion verified: ${manifest.manifestId}\n`)
		return
	}
	const [panelInput, inventoryInput, phase4Input] = await Promise.all([
		regularJsonInput<Phase3WorkingExpansionPanel>(resolve(projectRoot, PHASE_3_WORKING_EXPANSION_PANEL_PATH),
			"Canonical Phase 3 development panel"),
		regularJsonInput<unknown>(resolve(projectRoot, PHASE_3_WORKING_EXPANSION_INVENTORY_PATH),
			"Source-provenance inventory"),
		regularJsonInput<Phase3WorkingExpansionPhase4Seal>(resolve(projectRoot, PHASE_3_WORKING_EXPANSION_PHASE_4_PATH),
			"Sealed Phase 4 sample"),
	])
	const manifest = buildPhase3WorkingExpansionManifest(
		panelInput.value,
		panelInput.rawSha256,
		parseSourceProvenanceInventory(inventoryInput.value),
		inventoryInput.rawSha256,
		phase4Input.value,
		phase4Input.rawSha256,
	)
	process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}

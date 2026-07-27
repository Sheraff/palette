import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import {
	PRIOR_SOURCE_ROOTS,
	SOURCE_PROVENANCE_INVENTORY_VERSION,
	SOURCE_PROVENANCE_RESERVE_STATE,
	sourceRootFromPath,
	type SourceArtworkFamily,
	type SourceProvenanceInventory,
	type SourceVariant,
} from "./source-provenance-inventory.ts"

export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_VERSION =
	"album-artwork-palette-v2-future-sample-02-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT = "10" as const
export const ALBUM_ARTWORK_PALETTE_V2_PRESERVED_RESERVE_ROOTS = ["11", "12", "13", "14"] as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE = 12 as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN =
	"album-artwork-palette-v2-future-sample-02-family-selection-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_MANIFEST_DOMAIN =
	"album-artwork-palette-v2-future-sample-02-manifest-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SEAL_DOMAIN =
	"album-artwork-palette-v2-future-sample-02-seal-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS = {
	protocolDocument: "research/ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_02_PROTOCOL.md",
	inventory: "research/data/source-provenance-inventory-00-14.json",
	developmentPanel: "research/data/album-artwork-palette-v2-development-panel.json",
	openedFreshSeal: "research/data/album-artwork-palette-v2-fresh-sample.sealed.json",
	openedPhase4Protocol: "research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4/protocol.json",
	sealedSample: "research/data/album-artwork-palette-v2-future-sample-02.sealed.json",
} as const

const OLD_V2_PROTOCOL = "album-artwork-ui-palette-protocol-v2"
const OLD_FRESH_MANIFEST_DOMAIN = "sealed-fresh-sample-v1"
const sha256Pattern = /^[a-f0-9]{64}$/
const priorRootSet = new Set<string>(PRIOR_SOURCE_ROOTS)

type ArtifactSemanticId = Readonly<{
	name: string
	value: string
}>

type ArtifactBinding = Readonly<{
	role: "v2-development-panel" | "opened-phase-4-fresh-seal" | "opened-phase-4-protocol"
	path: string
	rawSha256: string
	semanticIds: readonly ArtifactSemanticId[]
}>

type ExclusionSetSummary = Readonly<{
	artworkIdCount: number
	artworkIdsCommitment: string
	variantSha256Count: number
	variantSha256Commitment: string
	commitment: string
}>

export type FutureSampleVariant = Readonly<{
	path: string
	sha256: string
	byteCount: number
}>

export type FutureSampleFamily = Readonly<{
	caseId: string
	selectionKey: string
	familyCommitment: string
	artworkId: string
	preferredSourcePath: string
	variants: readonly FutureSampleVariant[]
}>

export type AlbumArtworkPaletteV2FutureSampleIdentity = Readonly<{
	schemaVersion: 1
	protocol: Readonly<{
		version: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_VERSION
		documentPath: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.protocolDocument
		documentRawSha256: string
		inputPolicy: "strict-inventory-and-metadata-only"
	}>
	inventory: Readonly<{
		path: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory
		inventoryVersion: typeof SOURCE_PROVENANCE_INVENTORY_VERSION
		inventoryId: string
		rawSha256: string
	}>
	selection: Readonly<{
		root: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT
		preservedReserveRoots: typeof ALBUM_ARTWORK_PALETTE_V2_PRESERVED_RESERVE_ROOTS
		familyCount: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE
		domain: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN
		policy: "first-12-eligible-independent-root-10-families-by-domain-separated-sha256-key"
		effectiveExclusionCommitment: string
	}>
	exclusions: Readonly<{
		artifacts: readonly ArtifactBinding[]
		exposedV2: ExclusionSetSummary
		broadPriorDevelopment: ExclusionSetSummary & Readonly<{ roots: typeof PRIOR_SOURCE_ROOTS }>
		effective: ExclusionSetSummary
	}>
	families: readonly FutureSampleFamily[]
}>

export type AlbumArtworkPaletteV2FutureSample = AlbumArtworkPaletteV2FutureSampleIdentity & Readonly<{
	manifestId: string
	sealCommitment: string
}>

export type FutureSampleBuildInput = Readonly<{
	inventory: SourceProvenanceInventory
	inventoryRawSha256: string
	protocolDocumentRawSha256: string
	developmentPanel: Readonly<{ value: unknown; rawSha256: string }>
	openedFreshSeal: Readonly<{ value: unknown; rawSha256: string }>
	openedPhase4Protocol: Readonly<{ value: unknown; rawSha256: string }>
}>

type ExposedMetadata = Readonly<{
	artworkIds: readonly string[]
	variantSha256: readonly string[]
	semanticIds: readonly ArtifactSemanticId[]
}>

type OpenedFreshMetadata = ExposedMetadata & Readonly<{
	manifestId: string
	sealCommitment: string
	inventoryId: string
	inventoryRawSha256: string
}>

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function futureSampleSha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function futureSampleCanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(futureSampleCanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort(compareText).map((key) =>
		`${JSON.stringify(key)}:${futureSampleCanonicalJson(record[key])}`).join(",")}}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort(compareText)
	const wanted = [...expected].sort(compareText)
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
}

function requireSha256(value: unknown, label: string): string {
	if (typeof value !== "string" || !sha256Pattern.test(value)) throw new Error(`${label} is not a SHA-256 value`)
	return value
}

function requireString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`)
	return value
}

function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText)
}

function parseExposedSource(value: unknown, label: string): { artworkId: string; sha256: string } {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["caseId", "path", "sha256", "byteCount", "artworkId", "cohort", "structureTags"], label)
	requireString(value.caseId, `${label} case ID`)
	requireString(value.path, `${label} path`)
	const hash = requireSha256(value.sha256, `${label} source SHA-256`)
	if (!Number.isSafeInteger(value.byteCount) || (value.byteCount as number) <= 0) throw new Error(`${label} byte count is invalid`)
	const artworkId = requireString(value.artworkId, `${label} artwork ID`)
	if ((value.cohort !== "stress" && value.cohort !== "dataset" && value.cohort !== "fresh") ||
		!Array.isArray(value.structureTags) || value.structureTags.some((tag) => typeof tag !== "string")) {
		throw new Error(`${label} cohort metadata is invalid`)
	}
	return { artworkId, sha256: hash }
}

function parseDevelopmentPanel(value: unknown, inventory: SourceProvenanceInventory, inventoryRawSha256: string): ExposedMetadata {
	if (!isRecord(value)) throw new Error("V2 development panel must be an object")
	exactKeys(value, [
		"schemaVersion", "protocol", "candidateVersion", "inventoryVersion", "inventoryId", "inventorySha256",
		"selectionPolicy", "sourceCount", "sources", "manifestId",
	], "V2 development panel")
	if (value.schemaVersion !== 1 || value.protocol !== OLD_V2_PROTOCOL || typeof value.candidateVersion !== "string" ||
		value.inventoryVersion !== inventory.inventoryVersion || value.inventoryId !== inventory.inventoryId ||
		value.inventorySha256 !== inventoryRawSha256 || typeof value.selectionPolicy !== "string" ||
		!Array.isArray(value.sources) || value.sourceCount !== value.sources.length) {
		throw new Error("V2 development panel header is invalid")
	}
	const manifestId = requireSha256(value.manifestId, "V2 development manifest ID")
	const { manifestId: _manifestId, ...identity } = value
	if (futureSampleSha256(futureSampleCanonicalJson(identity)) !== manifestId) {
		throw new Error("V2 development manifest identity is stale")
	}
	const sources = value.sources.map((source, index) => parseExposedSource(source, `V2 development source ${index}`))
	if (new Set(sources.map(({ artworkId }) => artworkId)).size !== sources.length ||
		new Set(sources.map(({ sha256 }) => sha256)).size !== sources.length) {
		throw new Error("V2 development sources are not independent")
	}
	return {
		artworkIds: sources.map(({ artworkId }) => artworkId),
		variantSha256: sources.map(({ sha256 }) => sha256),
		semanticIds: [{ name: "manifestId", value: manifestId }],
	}
}

function parseOpenedFreshSeal(value: unknown, inventory: SourceProvenanceInventory, inventoryRawSha256: string): OpenedFreshMetadata {
	if (!isRecord(value)) throw new Error("Opened Phase 4 fresh seal must be an object")
	exactKeys(value, [
		"schemaVersion", "protocol", "candidateVersion", "inventoryVersion", "inventoryId", "inventorySha256",
		"selectionPolicy", "selectionDomain", "candidateOutputOpened", "phaseRequiredToOpen", "sourceCount",
		"sources", "manifestId", "sealCommitment",
	], "Opened Phase 4 fresh seal")
	if (value.schemaVersion !== 1 || value.protocol !== OLD_V2_PROTOCOL || typeof value.candidateVersion !== "string" ||
		value.inventoryVersion !== inventory.inventoryVersion || value.inventoryId !== inventory.inventoryId ||
		value.inventorySha256 !== inventoryRawSha256 || typeof value.selectionPolicy !== "string" ||
		typeof value.selectionDomain !== "string" || typeof value.candidateOutputOpened !== "boolean" ||
		value.phaseRequiredToOpen !== 4 || !Array.isArray(value.sources) || value.sourceCount !== value.sources.length) {
		throw new Error("Opened Phase 4 fresh seal header is invalid")
	}
	const manifestId = requireSha256(value.manifestId, "Opened Phase 4 fresh manifest ID")
	const sealCommitment = requireSha256(value.sealCommitment, "Opened Phase 4 fresh seal commitment")
	const { manifestId: _manifestId, sealCommitment: _sealCommitment, ...identity } = value
	const canonicalIdentity = futureSampleCanonicalJson(identity)
	if (futureSampleSha256(canonicalIdentity) !== manifestId ||
		futureSampleSha256(`${OLD_FRESH_MANIFEST_DOMAIN}\0${canonicalIdentity}`) !== sealCommitment) {
		throw new Error("Opened Phase 4 fresh seal identity is stale")
	}
	const sources = value.sources.map((source, index) => parseExposedSource(source, `Opened Phase 4 source ${index}`))
	if (sources.length !== 12 || new Set(sources.map(({ artworkId }) => artworkId)).size !== sources.length ||
		new Set(sources.map(({ sha256 }) => sha256)).size !== sources.length) {
		throw new Error("Opened Phase 4 source identities are invalid")
	}
	return {
		artworkIds: sources.map(({ artworkId }) => artworkId),
		variantSha256: sources.map(({ sha256 }) => sha256),
		semanticIds: [
			{ name: "manifestId", value: manifestId },
			{ name: "sealCommitment", value: sealCommitment },
		],
		manifestId,
		sealCommitment,
		inventoryId: inventory.inventoryId,
		inventoryRawSha256,
	}
}

function parseOpenedPhase4Protocol(
	value: unknown,
	fresh: OpenedFreshMetadata,
	freshRawSha256: string,
	inventory: SourceProvenanceInventory,
): readonly ArtifactSemanticId[] {
	if (!isRecord(value)) throw new Error("Opened Phase 4 protocol must be an object")
	exactKeys(value, [
		"schemaVersion", "experimentVersion", "createdAt", "outputDirectory", "phase3Freeze", "candidate", "baseline",
		"freshManifest", "sourceCustody", "sideAssignment", "presentation", "execution", "runtime", "controls", "protocolId",
	], "Opened Phase 4 protocol")
	if (value.schemaVersion !== 1 || value.experimentVersion !== "album-artwork-palette-v2-0.4.4-phase-4" ||
		!isRecord(value.freshManifest) || !isRecord(value.sideAssignment)) {
		throw new Error("Opened Phase 4 protocol header is invalid")
	}
	const protocolId = requireSha256(value.protocolId, "Opened Phase 4 protocol ID")
	const { protocolId: _protocolId, ...identity } = value
	if (futureSampleSha256(futureSampleCanonicalJson(identity)) !== protocolId) {
		throw new Error("Opened Phase 4 protocol identity is stale")
	}
	exactKeys(value.freshManifest, [
		"path", "rawSha256", "manifestId", "sealCommitment", "sourceCount", "uniqueGroupCount", "inventory",
	], "Opened Phase 4 fresh-manifest binding")
	if (value.freshManifest.path !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedFreshSeal ||
		value.freshManifest.rawSha256 !== freshRawSha256 || value.freshManifest.manifestId !== fresh.manifestId ||
		value.freshManifest.sealCommitment !== fresh.sealCommitment || value.freshManifest.sourceCount !== 12 ||
		value.freshManifest.uniqueGroupCount !== 12 || !isRecord(value.freshManifest.inventory)) {
		throw new Error("Opened Phase 4 fresh-manifest binding is invalid")
	}
	exactKeys(value.freshManifest.inventory, ["path", "id", "rawSha256"], "Opened Phase 4 inventory binding")
	if (value.freshManifest.inventory.path !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory ||
		value.freshManifest.inventory.id !== inventory.inventoryId ||
		value.freshManifest.inventory.rawSha256 !== fresh.inventoryRawSha256) {
		throw new Error("Opened Phase 4 inventory binding is invalid")
	}
	exactKeys(value.sideAssignment, ["domain", "digest", "order", "rule", "assignments", "assignmentSha256"],
		"Opened Phase 4 side assignment")
	if (!Array.isArray(value.sideAssignment.assignments) || value.sideAssignment.assignments.length !== 12) {
		throw new Error("Opened Phase 4 assignments are invalid")
	}
	const assignmentHashes = value.sideAssignment.assignments.map((assignment, index) => {
		if (!isRecord(assignment)) throw new Error(`Opened Phase 4 assignment ${index} is invalid`)
		exactKeys(assignment, ["caseId", "sourceSha256", "key", "candidateSide", "baselineSide"],
			`Opened Phase 4 assignment ${index}`)
		return requireSha256(assignment.sourceSha256, `Opened Phase 4 assignment ${index} source SHA-256`)
	})
	if (!isDeepStrictEqual(uniqueSorted(assignmentHashes), uniqueSorted(fresh.variantSha256))) {
		throw new Error("Opened Phase 4 assignments do not match the opened fresh seal")
	}
	return [{ name: "protocolId", value: protocolId }]
}

function summarizeExclusions(domain: string, artworkIds: readonly string[], variantSha256: readonly string[]): ExclusionSetSummary {
	const orderedArtworkIds = uniqueSorted(artworkIds)
	const orderedVariantSha256 = uniqueSorted(variantSha256)
	const artworkIdsCommitment = futureSampleSha256(`${domain}-artwork-ids\0${futureSampleCanonicalJson(orderedArtworkIds)}`)
	const variantSha256Commitment = futureSampleSha256(
		`${domain}-variant-sha256\0${futureSampleCanonicalJson(orderedVariantSha256)}`,
	)
	const summaryIdentity = {
		artworkIdCount: orderedArtworkIds.length,
		artworkIdsCommitment,
		variantSha256Count: orderedVariantSha256.length,
		variantSha256Commitment,
	}
	return {
		...summaryIdentity,
		commitment: futureSampleSha256(`${domain}\0${futureSampleCanonicalJson(summaryIdentity)}`),
	}
}

function selectedVariant(variant: SourceVariant): FutureSampleVariant {
	return { path: variant.path, sha256: variant.sha256, byteCount: variant.byteCount }
}

function familyCommitment(family: SourceArtworkFamily): string {
	const identity = {
		artworkId: family.artworkId,
		preferredSourcePath: family.preferredSourcePath,
		variants: family.variants.map(selectedVariant),
	}
	return futureSampleSha256(`album-artwork-palette-v2-future-sample-02-family-v1\0${futureSampleCanonicalJson(identity)}`)
}

function isIndependentRoot10Family(family: SourceArtworkFamily, inventory: SourceProvenanceInventory): boolean {
	if (family.reserve === null || !family.reserve.futureValidationEligible ||
		family.reserve.provenanceState !== SOURCE_PROVENANCE_RESERVE_STATE ||
		!isDeepStrictEqual(family.reserve.roots, [ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT]) ||
		family.variants.some((variant) => sourceRootFromPath(variant.path) !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT ||
			!variant.jpegSignatures.startsWithSoi || !variant.jpegSignatures.endsWithEoi)) return false
	return family.variants.every((variant) => {
		const group = inventory.rawSha256Groups.find(({ sha256 }) => sha256 === variant.sha256)
		return group !== undefined && group.priorContentPaths.length === 0 &&
			isDeepStrictEqual(group.reserveArtworkIds, [family.artworkId]) &&
			group.reservePaths.every((path) => sourceRootFromPath(path) === ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT)
	})
}

function selectionKey(inventoryId: string, effectiveExclusionCommitment: string, family: SourceArtworkFamily): string {
	return futureSampleSha256([
		ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN,
		inventoryId,
		effectiveExclusionCommitment,
		family.artworkId,
		familyCommitment(family),
	].join("\0"))
}

function futureSampleIdentity(sample: AlbumArtworkPaletteV2FutureSample): AlbumArtworkPaletteV2FutureSampleIdentity {
	const { manifestId: _manifestId, sealCommitment: _sealCommitment, ...identity } = sample
	return identity
}

export function futureSampleManifestId(identity: AlbumArtworkPaletteV2FutureSampleIdentity): string {
	return futureSampleSha256(
		`${ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_MANIFEST_DOMAIN}\0${futureSampleCanonicalJson(identity)}`,
	)
}

export function futureSampleSealCommitment(identity: AlbumArtworkPaletteV2FutureSampleIdentity, manifestId: string): string {
	return futureSampleSha256([
		ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SEAL_DOMAIN,
		manifestId,
		futureSampleCanonicalJson(identity),
	].join("\0"))
}

export function buildAlbumArtworkPaletteV2FutureSample(input: FutureSampleBuildInput): AlbumArtworkPaletteV2FutureSample {
	for (const [label, hash] of [
		["Inventory raw SHA-256", input.inventoryRawSha256],
		["Protocol document raw SHA-256", input.protocolDocumentRawSha256],
		["V2 development panel raw SHA-256", input.developmentPanel.rawSha256],
		["Opened fresh seal raw SHA-256", input.openedFreshSeal.rawSha256],
		["Opened Phase 4 protocol raw SHA-256", input.openedPhase4Protocol.rawSha256],
	] as const) requireSha256(hash, label)
	if (input.inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION) {
		throw new Error("Future sample inventory version is invalid")
	}
	const development = parseDevelopmentPanel(input.developmentPanel.value, input.inventory, input.inventoryRawSha256)
	const openedFresh = parseOpenedFreshSeal(input.openedFreshSeal.value, input.inventory, input.inventoryRawSha256)
	const phase4SemanticIds = parseOpenedPhase4Protocol(
		input.openedPhase4Protocol.value,
		openedFresh,
		input.openedFreshSeal.rawSha256,
		input.inventory,
	)
	const exposedArtworkIds = [...development.artworkIds, ...openedFresh.artworkIds]
	const exposedVariantSha256 = [...development.variantSha256, ...openedFresh.variantSha256]
	const priorFamilies = input.inventory.families.filter((family) =>
		family.variants.some((variant) => priorRootSet.has(sourceRootFromPath(variant.path))))
	const priorArtworkIds = priorFamilies.map(({ artworkId }) => artworkId)
	const priorVariantSha256 = priorFamilies.flatMap(({ variants }) => variants
		.filter((variant) => priorRootSet.has(sourceRootFromPath(variant.path)))
		.map(({ sha256 }) => sha256))
	const effectiveArtworkIds = uniqueSorted([...exposedArtworkIds, ...priorArtworkIds])
	const effectiveVariantSha256 = uniqueSorted([...exposedVariantSha256, ...priorVariantSha256])
	const exposedV2 = summarizeExclusions(
		"album-artwork-palette-v2-future-sample-02-exposed-v2-exclusions-v1",
		exposedArtworkIds,
		exposedVariantSha256,
	)
	const broadPriorDevelopment = {
		roots: PRIOR_SOURCE_ROOTS,
		...summarizeExclusions(
			"album-artwork-palette-v2-future-sample-02-broad-prior-development-exclusions-v1",
			priorArtworkIds,
			priorVariantSha256,
		),
	}
	const effective = summarizeExclusions(
		"album-artwork-palette-v2-future-sample-02-effective-exclusions-v1",
		effectiveArtworkIds,
		effectiveVariantSha256,
	)
	const excludedArtworkIds = new Set(effectiveArtworkIds)
	const excludedVariantSha256 = new Set(effectiveVariantSha256)
	const eligible = input.inventory.families
		.filter((family) => isIndependentRoot10Family(family, input.inventory))
		.filter((family) => !excludedArtworkIds.has(family.artworkId) &&
			family.variants.every(({ sha256 }) => !excludedVariantSha256.has(sha256)))
		.map((family) => ({ family, key: selectionKey(input.inventory.inventoryId, effective.commitment, family) }))
		.sort((first, second) => compareText(first.key, second.key) || compareText(first.family.artworkId, second.family.artworkId))
	if (eligible.length < ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE) {
		throw new Error("Inventory does not contain 12 eligible independent root-10 source families")
	}
	const families = eligible.slice(0, ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE).map(({ family, key }, index) => ({
		caseId: `future-02-${String(index + 1).padStart(2, "0")}`,
		selectionKey: key,
		familyCommitment: familyCommitment(family),
		artworkId: family.artworkId,
		preferredSourcePath: family.preferredSourcePath,
		variants: family.variants.map(selectedVariant),
	}))
	const identity: AlbumArtworkPaletteV2FutureSampleIdentity = {
		schemaVersion: 1,
		protocol: {
			version: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_VERSION,
			documentPath: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.protocolDocument,
			documentRawSha256: input.protocolDocumentRawSha256,
			inputPolicy: "strict-inventory-and-metadata-only",
		},
		inventory: {
			path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory,
			inventoryVersion: input.inventory.inventoryVersion,
			inventoryId: input.inventory.inventoryId,
			rawSha256: input.inventoryRawSha256,
		},
		selection: {
			root: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT,
			preservedReserveRoots: ALBUM_ARTWORK_PALETTE_V2_PRESERVED_RESERVE_ROOTS,
			familyCount: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE,
			domain: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN,
			policy: "first-12-eligible-independent-root-10-families-by-domain-separated-sha256-key",
			effectiveExclusionCommitment: effective.commitment,
		},
		exclusions: {
			artifacts: [
				{
					role: "v2-development-panel",
					path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.developmentPanel,
					rawSha256: input.developmentPanel.rawSha256,
					semanticIds: development.semanticIds,
				},
				{
					role: "opened-phase-4-fresh-seal",
					path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedFreshSeal,
					rawSha256: input.openedFreshSeal.rawSha256,
					semanticIds: openedFresh.semanticIds,
				},
				{
					role: "opened-phase-4-protocol",
					path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.openedPhase4Protocol,
					rawSha256: input.openedPhase4Protocol.rawSha256,
					semanticIds: phase4SemanticIds,
				},
			],
			exposedV2,
			broadPriorDevelopment,
			effective,
		},
		families,
	}
	const manifestId = futureSampleManifestId(identity)
	return { ...identity, manifestId, sealCommitment: futureSampleSealCommitment(identity, manifestId) }
}

function validateExclusionSummary(value: unknown, label: string, roots = false): void {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, roots
		? ["roots", "artworkIdCount", "artworkIdsCommitment", "variantSha256Count", "variantSha256Commitment", "commitment"]
		: ["artworkIdCount", "artworkIdsCommitment", "variantSha256Count", "variantSha256Commitment", "commitment"], label)
	if (!Number.isSafeInteger(value.artworkIdCount) || (value.artworkIdCount as number) < 0 ||
		!Number.isSafeInteger(value.variantSha256Count) || (value.variantSha256Count as number) < 0) {
		throw new Error(`${label} counts are invalid`)
	}
	for (const key of ["artworkIdsCommitment", "variantSha256Commitment", "commitment"] as const) {
		requireSha256(value[key], `${label} ${key}`)
	}
	if (roots && !isDeepStrictEqual(value.roots, PRIOR_SOURCE_ROOTS)) throw new Error(`${label} roots are invalid`)
}

export function parseAlbumArtworkPaletteV2FutureSample(value: unknown): AlbumArtworkPaletteV2FutureSample {
	if (!isRecord(value)) throw new Error("Future sample seal must be an object")
	exactKeys(value, ["schemaVersion", "protocol", "inventory", "selection", "exclusions", "families", "manifestId", "sealCommitment"],
		"Future sample seal")
	if (value.schemaVersion !== 1 || !isRecord(value.protocol) || !isRecord(value.inventory) ||
		!isRecord(value.selection) || !isRecord(value.exclusions) || !Array.isArray(value.families)) {
		throw new Error("Future sample seal header is invalid")
	}
	exactKeys(value.protocol, ["version", "documentPath", "documentRawSha256", "inputPolicy"], "Future sample protocol binding")
	if (value.protocol.version !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_VERSION ||
		value.protocol.documentPath !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.protocolDocument ||
		value.protocol.inputPolicy !== "strict-inventory-and-metadata-only") throw new Error("Future sample protocol binding is invalid")
	requireSha256(value.protocol.documentRawSha256, "Future sample protocol document raw SHA-256")
	exactKeys(value.inventory, ["path", "inventoryVersion", "inventoryId", "rawSha256"], "Future sample inventory binding")
	if (value.inventory.path !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_PATHS.inventory ||
		value.inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION) throw new Error("Future sample inventory binding is invalid")
	requireSha256(value.inventory.inventoryId, "Future sample inventory ID")
	requireSha256(value.inventory.rawSha256, "Future sample inventory raw SHA-256")
	exactKeys(value.selection, ["root", "preservedReserveRoots", "familyCount", "domain", "policy", "effectiveExclusionCommitment"],
		"Future sample selection")
	if (value.selection.root !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT ||
		!isDeepStrictEqual(value.selection.preservedReserveRoots, ALBUM_ARTWORK_PALETTE_V2_PRESERVED_RESERVE_ROOTS) ||
		value.selection.familyCount !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE ||
		value.selection.domain !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SELECTION_DOMAIN ||
		value.selection.policy !== "first-12-eligible-independent-root-10-families-by-domain-separated-sha256-key") {
		throw new Error("Future sample selection binding is invalid")
	}
	requireSha256(value.selection.effectiveExclusionCommitment, "Future sample effective exclusion commitment")
	exactKeys(value.exclusions, ["artifacts", "exposedV2", "broadPriorDevelopment", "effective"], "Future sample exclusions")
	if (!Array.isArray(value.exclusions.artifacts) || value.exclusions.artifacts.length !== 3) {
		throw new Error("Future sample exclusion artifacts are invalid")
	}
	for (const [index, artifact] of value.exclusions.artifacts.entries()) {
		if (!isRecord(artifact)) throw new Error(`Future sample exclusion artifact ${index} is invalid`)
		exactKeys(artifact, ["role", "path", "rawSha256", "semanticIds"], `Future sample exclusion artifact ${index}`)
		requireString(artifact.role, `Future sample exclusion artifact ${index} role`)
		requireString(artifact.path, `Future sample exclusion artifact ${index} path`)
		requireSha256(artifact.rawSha256, `Future sample exclusion artifact ${index} raw SHA-256`)
		if (!Array.isArray(artifact.semanticIds) || artifact.semanticIds.length === 0) {
			throw new Error(`Future sample exclusion artifact ${index} semantic IDs are invalid`)
		}
		for (const [semanticIndex, semanticId] of artifact.semanticIds.entries()) {
			if (!isRecord(semanticId)) throw new Error(`Future sample exclusion semantic ID ${index}:${semanticIndex} is invalid`)
			exactKeys(semanticId, ["name", "value"], `Future sample exclusion semantic ID ${index}:${semanticIndex}`)
			requireString(semanticId.name, `Future sample exclusion semantic ID ${index}:${semanticIndex} name`)
			requireSha256(semanticId.value, `Future sample exclusion semantic ID ${index}:${semanticIndex} value`)
		}
	}
	validateExclusionSummary(value.exclusions.exposedV2, "Future sample exposed-V2 exclusions")
	validateExclusionSummary(value.exclusions.broadPriorDevelopment, "Future sample broad prior-development exclusions", true)
	validateExclusionSummary(value.exclusions.effective, "Future sample effective exclusions")
	if ((value.exclusions.effective as Record<string, unknown>).commitment !== value.selection.effectiveExclusionCommitment) {
		throw new Error("Future sample effective exclusion commitment is inconsistent")
	}
	if (value.families.length !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_SIZE) throw new Error("Future sample family count is invalid")
	for (const [index, family] of value.families.entries()) {
		if (!isRecord(family)) throw new Error(`Future sample family ${index} is invalid`)
		exactKeys(family, ["caseId", "selectionKey", "familyCommitment", "artworkId", "preferredSourcePath", "variants"],
			`Future sample family ${index}`)
		if (family.caseId !== `future-02-${String(index + 1).padStart(2, "0")}` ||
			typeof family.artworkId !== "string" || family.artworkId.length === 0 ||
			typeof family.preferredSourcePath !== "string" || !family.preferredSourcePath.startsWith("10/") ||
			!Array.isArray(family.variants) || family.variants.length === 0) throw new Error(`Future sample family ${index} is invalid`)
		requireSha256(family.selectionKey, `Future sample family ${index} selection key`)
		requireSha256(family.familyCommitment, `Future sample family ${index} commitment`)
		for (const [variantIndex, variant] of family.variants.entries()) {
			if (!isRecord(variant)) throw new Error(`Future sample family ${index} variant ${variantIndex} is invalid`)
			exactKeys(variant, ["path", "sha256", "byteCount"], `Future sample family ${index} variant ${variantIndex}`)
			if (typeof variant.path !== "string" || sourceRootFromPath(variant.path) !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_ROOT ||
				!Number.isSafeInteger(variant.byteCount) || (variant.byteCount as number) <= 0) {
				throw new Error(`Future sample family ${index} variant ${variantIndex} is invalid`)
			}
			requireSha256(variant.sha256, `Future sample family ${index} variant ${variantIndex} SHA-256`)
		}
		const familyIdentity = {
			artworkId: family.artworkId,
			preferredSourcePath: family.preferredSourcePath,
			variants: family.variants,
		}
		if (futureSampleSha256(
			`album-artwork-palette-v2-future-sample-02-family-v1\0${futureSampleCanonicalJson(familyIdentity)}`,
		) !== family.familyCommitment) throw new Error(`Future sample family ${index} commitment is stale`)
	}
	const parsed = value as unknown as AlbumArtworkPaletteV2FutureSample
	if (new Set(parsed.families.map(({ artworkId }) => artworkId)).size !== parsed.families.length ||
		new Set(parsed.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256))).size !==
		parsed.families.reduce((count, { variants }) => count + variants.length, 0)) {
		throw new Error("Future sample families are not independent")
	}
	const manifestId = requireSha256(value.manifestId, "Future sample manifest ID")
	const sealCommitment = requireSha256(value.sealCommitment, "Future sample seal commitment")
	const identity = futureSampleIdentity(parsed)
	if (futureSampleManifestId(identity) !== manifestId || futureSampleSealCommitment(identity, manifestId) !== sealCommitment) {
		throw new Error("Future sample manifest or seal identity is stale")
	}
	return parsed
}

export function verifyAlbumArtworkPaletteV2FutureSample(
	value: unknown,
	input: FutureSampleBuildInput,
): AlbumArtworkPaletteV2FutureSample {
	const parsed = parseAlbumArtworkPaletteV2FutureSample(value)
	const expected = buildAlbumArtworkPaletteV2FutureSample(input)
	if (!isDeepStrictEqual(parsed, expected)) throw new Error("Future sample seal does not match its bound metadata inputs")
	return parsed
}

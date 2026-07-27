import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { parseAlbumArtworkPaletteV2FutureSample } from "./album-artwork-palette-v2-future-sample.ts"
import {
	SOURCE_PROVENANCE_INVENTORY_VERSION,
	SOURCE_PROVENANCE_RESERVE_STATE,
	sourceRootFromPath,
	type SourceArtworkFamily,
	type SourceProvenanceInventory,
	type SourceVariant,
} from "./source-provenance-inventory.ts"

export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_VERSION =
	"album-artwork-palette-v2-future-sample-03-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_ROOT = "11" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PRESERVED_ROOTS = ["12", "13", "14"] as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SIZE = 12 as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SELECTION_DOMAIN =
	"album-artwork-palette-v2-future-sample-03-family-selection-v1" as const
const FAMILY_DOMAIN = "album-artwork-palette-v2-future-sample-03-family-v1"
const MANIFEST_DOMAIN = "album-artwork-palette-v2-future-sample-03-manifest-v1"
const SEAL_DOMAIN = "album-artwork-palette-v2-future-sample-03-seal-v1"
const EFFECTIVE_EXCLUSION_DOMAIN = "album-artwork-palette-v2-future-sample-03-effective-exclusions-v1"
const EXPECTED_FUTURE_02_PROTOCOL_ID = "71ef0088f8b95c2a52fb73dc17683bb366e4bd3811a640f09c8ba74214a74a46"

export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS = {
	protocolDocument: "research/ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_03_PROTOCOL.md",
	inventory: "research/data/source-provenance-inventory-00-14.json",
	consumedSample02: "research/data/album-artwork-palette-v2-future-sample-02.sealed.json",
	consumptionReceipt02:
		"research/data/experiments/album-artwork-palette-v2-0.5.2-phase-4-future-02/run-complete.json",
	sealedSample: "research/data/album-artwork-palette-v2-future-sample-03.sealed.json",
} as const

type Variant = Readonly<{ path: string; sha256: string; byteCount: number }>
type Family = Readonly<{
	caseId: string
	selectionKey: string
	familyCommitment: string
	artworkId: string
	preferredSourcePath: string
	variants: readonly Variant[]
}>

export type FutureSample03Identity = Readonly<{
	schemaVersion: 1
	protocol: Readonly<{
		version: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_VERSION
		documentPath: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.protocolDocument
		documentRawSha256: string
		inputPolicy: "strict-metadata-only"
	}>
	inventory: Readonly<{
		path: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.inventory
		inventoryVersion: typeof SOURCE_PROVENANCE_INVENTORY_VERSION
		inventoryId: string
		rawSha256: string
	}>
	selection: Readonly<{
		root: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_ROOT
		preservedReserveRoots: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PRESERVED_ROOTS
		familyCount: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SIZE
		domain: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SELECTION_DOMAIN
		policy: "first-12-eligible-independent-root-11-families-by-domain-separated-sha256-key"
		effectiveExclusionCommitment: string
	}>
	exclusions: Readonly<{
		consumedSample02: Readonly<{
			path: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumedSample02
			rawSha256: string
			manifestId: string
			sealCommitment: string
			inheritedEffectiveExclusionCommitment: string
			artworkIdCount: number
			artworkIdsCommitment: string
			variantSha256Count: number
			variantSha256Commitment: string
		}>
		consumptionReceipt02: Readonly<{
			path: typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumptionReceipt02
			rawSha256: string
			protocolId: string
			futureSampleConsumed: true
			sourceCount: 12
		}>
		effectiveCommitment: string
	}>
	families: readonly Family[]
}>

export type FutureSample03 = FutureSample03Identity & Readonly<{ manifestId: string; sealCommitment: string }>

export type FutureSample03BuildInput = Readonly<{
	inventory: SourceProvenanceInventory
	inventoryRawSha256: string
	protocolDocumentRawSha256: string
	consumedSample02: Readonly<{ value: unknown; rawSha256: string }>
	consumptionReceipt02: Readonly<{ value: unknown; rawSha256: string }>
}>

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function futureSample03CanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(futureSample03CanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) =>
		`${JSON.stringify(key)}:${futureSample03CanonicalJson(record[key])}`).join(",")}}`
}

export const futureSample03Sha256 = sha256

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
}

function requireHash(value: unknown, label: string): string {
	if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`)
	return value
}

function commitment(domain: string, values: readonly string[]): string {
	return sha256(`${domain}\0${futureSample03CanonicalJson([...values].sort())}`)
}

function parseConsumptionReceipt(value: unknown) {
	if (!isRecord(value)) throw new Error("Future sample 02 consumption receipt is invalid")
	exactKeys(value, [
		"schemaVersion", "experimentVersion", "protocolId", "completedAt", "futureSampleConsumed", "sourceCount",
		"candidateCount", "baselineCount", "privateReviewManifestId", "privateReviewManifestSha256",
		"reviewProvenanceId", "reviewProvenanceSha256",
	], "Future sample 02 consumption receipt")
	if (value.schemaVersion !== 1 || value.experimentVersion !== "album-artwork-palette-v2-0.5.2-phase-4-future-02" ||
		value.protocolId !== EXPECTED_FUTURE_02_PROTOCOL_ID || value.futureSampleConsumed !== true || value.sourceCount !== 12 ||
		value.candidateCount !== 12 || value.baselineCount !== 12 || typeof value.completedAt !== "string" ||
		!Number.isFinite(Date.parse(value.completedAt))) throw new Error("Future sample 02 was not completely consumed")
	for (const key of ["privateReviewManifestId", "privateReviewManifestSha256", "reviewProvenanceId", "reviewProvenanceSha256"] as const) {
		requireHash(value[key], `Future sample 02 receipt ${key}`)
	}
	return { protocolId: value.protocolId, futureSampleConsumed: true as const, sourceCount: 12 as const }
}

function selectedVariant(variant: SourceVariant): Variant {
	return { path: variant.path, sha256: variant.sha256, byteCount: variant.byteCount }
}

function familyCommitment(family: SourceArtworkFamily): string {
	const identity = {
		artworkId: family.artworkId,
		preferredSourcePath: family.preferredSourcePath,
		variants: family.variants.map(selectedVariant),
	}
	return sha256(`${FAMILY_DOMAIN}\0${futureSample03CanonicalJson(identity)}`)
}

function eligibleFamily(family: SourceArtworkFamily, inventory: SourceProvenanceInventory): boolean {
	if (family.reserve === null || family.reserve.provenanceState !== SOURCE_PROVENANCE_RESERVE_STATE ||
		!family.reserve.futureValidationEligible || !isDeepStrictEqual(family.reserve.roots, ["11"]) ||
		family.variants.some((variant) => sourceRootFromPath(variant.path) !== "11" ||
			!variant.jpegSignatures.startsWithSoi || !variant.jpegSignatures.endsWithEoi)) return false
	return family.variants.every((variant) => {
		const group = inventory.rawSha256Groups.find(({ sha256: hash }) => hash === variant.sha256)
		return group !== undefined && group.priorContentPaths.length === 0 &&
			isDeepStrictEqual(group.reserveArtworkIds, [family.artworkId]) &&
			group.reservePaths.every((path) => sourceRootFromPath(path) === "11")
	})
}

function identityOf(sample: FutureSample03): FutureSample03Identity {
	const { manifestId: _manifestId, sealCommitment: _sealCommitment, ...identity } = sample
	return identity
}

function manifestId(identity: FutureSample03Identity): string {
	return sha256(`${MANIFEST_DOMAIN}\0${futureSample03CanonicalJson(identity)}`)
}

function sealCommitment(identity: FutureSample03Identity, manifest: string): string {
	return sha256(`${SEAL_DOMAIN}\0${manifest}\0${futureSample03CanonicalJson(identity)}`)
}

export function buildAlbumArtworkPaletteV2FutureSample03(input: FutureSample03BuildInput): FutureSample03 {
	for (const [label, hash] of [
		["Inventory", input.inventoryRawSha256],
		["Protocol", input.protocolDocumentRawSha256],
		["Consumed sample 02", input.consumedSample02.rawSha256],
		["Consumption receipt 02", input.consumptionReceipt02.rawSha256],
	] as const) requireHash(hash, `${label} raw SHA-256`)
	if (input.inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION) throw new Error("Inventory version is invalid")
	const consumed = parseAlbumArtworkPaletteV2FutureSample(input.consumedSample02.value)
	const receipt = parseConsumptionReceipt(input.consumptionReceipt02.value)
	const consumedArtworkIds = consumed.families.map(({ artworkId }) => artworkId)
	const consumedVariantHashes = consumed.families.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash))
	const artworkIdsCommitment = commitment(`${EFFECTIVE_EXCLUSION_DOMAIN}-artwork-ids`, consumedArtworkIds)
	const variantSha256Commitment = commitment(`${EFFECTIVE_EXCLUSION_DOMAIN}-variant-sha256`, consumedVariantHashes)
	const effectiveExclusionCommitment = sha256([
		EFFECTIVE_EXCLUSION_DOMAIN,
		consumed.exclusions.effective.commitment,
		artworkIdsCommitment,
		variantSha256Commitment,
	].join("\0"))
	const consumedArtworkSet = new Set(consumedArtworkIds)
	const consumedHashSet = new Set(consumedVariantHashes)
	const eligible = input.inventory.families
		.filter((family) => eligibleFamily(family, input.inventory))
		.filter((family) => !consumedArtworkSet.has(family.artworkId) &&
			family.variants.every(({ sha256: hash }) => !consumedHashSet.has(hash)))
		.map((family) => ({
			family,
			key: sha256([ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SELECTION_DOMAIN, input.inventory.inventoryId,
				effectiveExclusionCommitment, family.artworkId, familyCommitment(family)].join("\0")),
		}))
		.sort((first, second) => first.key.localeCompare(second.key) || first.family.artworkId.localeCompare(second.family.artworkId))
	if (eligible.length < 12) throw new Error("Inventory does not contain 12 eligible root-11 families")
	const families = eligible.slice(0, 12).map(({ family, key }, index) => ({
		caseId: `future-03-${String(index + 1).padStart(2, "0")}`,
		selectionKey: key,
		familyCommitment: familyCommitment(family),
		artworkId: family.artworkId,
		preferredSourcePath: family.preferredSourcePath,
		variants: family.variants.map(selectedVariant),
	}))
	const identity: FutureSample03Identity = {
		schemaVersion: 1,
		protocol: {
			version: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_VERSION,
			documentPath: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.protocolDocument,
			documentRawSha256: input.protocolDocumentRawSha256,
			inputPolicy: "strict-metadata-only",
		},
		inventory: {
			path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.inventory,
			inventoryVersion: input.inventory.inventoryVersion,
			inventoryId: input.inventory.inventoryId,
			rawSha256: input.inventoryRawSha256,
		},
		selection: {
			root: "11",
			preservedReserveRoots: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PRESERVED_ROOTS,
			familyCount: 12,
			domain: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SELECTION_DOMAIN,
			policy: "first-12-eligible-independent-root-11-families-by-domain-separated-sha256-key",
			effectiveExclusionCommitment,
		},
		exclusions: {
			consumedSample02: {
				path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumedSample02,
				rawSha256: input.consumedSample02.rawSha256,
				manifestId: consumed.manifestId,
				sealCommitment: consumed.sealCommitment,
				inheritedEffectiveExclusionCommitment: consumed.exclusions.effective.commitment,
				artworkIdCount: consumedArtworkIds.length,
				artworkIdsCommitment,
				variantSha256Count: consumedVariantHashes.length,
				variantSha256Commitment,
			},
			consumptionReceipt02: {
				path: ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumptionReceipt02,
				rawSha256: input.consumptionReceipt02.rawSha256,
				...receipt,
			},
			effectiveCommitment: effectiveExclusionCommitment,
		},
		families,
	}
	const manifest = manifestId(identity)
	return { ...identity, manifestId: manifest, sealCommitment: sealCommitment(identity, manifest) }
}

export function parseAlbumArtworkPaletteV2FutureSample03(value: unknown): FutureSample03 {
	if (!isRecord(value)) throw new Error("Future sample 03 seal must be an object")
	exactKeys(value, ["schemaVersion", "protocol", "inventory", "selection", "exclusions", "families", "manifestId", "sealCommitment"],
		"Future sample 03 seal")
	if (value.schemaVersion !== 1 || !isRecord(value.protocol) || !isRecord(value.inventory) ||
		!isRecord(value.selection) || !isRecord(value.exclusions) || !Array.isArray(value.families)) throw new Error("Future sample 03 header is invalid")
	exactKeys(value.protocol, ["version", "documentPath", "documentRawSha256", "inputPolicy"], "Future sample 03 protocol")
	if (value.protocol.version !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_VERSION ||
		value.protocol.documentPath !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.protocolDocument ||
		value.protocol.inputPolicy !== "strict-metadata-only") throw new Error("Future sample 03 protocol is invalid")
	requireHash(value.protocol.documentRawSha256, "Future sample 03 protocol hash")
	exactKeys(value.inventory, ["path", "inventoryVersion", "inventoryId", "rawSha256"], "Future sample 03 inventory")
	if (value.inventory.path !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.inventory ||
		value.inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION) throw new Error("Future sample 03 inventory is invalid")
	requireHash(value.inventory.inventoryId, "Future sample 03 inventory ID")
	requireHash(value.inventory.rawSha256, "Future sample 03 inventory hash")
	exactKeys(value.selection, ["root", "preservedReserveRoots", "familyCount", "domain", "policy", "effectiveExclusionCommitment"],
		"Future sample 03 selection")
	if (value.selection.root !== "11" || !isDeepStrictEqual(value.selection.preservedReserveRoots, ["12", "13", "14"]) ||
		value.selection.familyCount !== 12 || value.selection.domain !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_SELECTION_DOMAIN ||
		value.selection.policy !== "first-12-eligible-independent-root-11-families-by-domain-separated-sha256-key") {
		throw new Error("Future sample 03 selection is invalid")
	}
	requireHash(value.selection.effectiveExclusionCommitment, "Future sample 03 exclusion commitment")
	exactKeys(value.exclusions, ["consumedSample02", "consumptionReceipt02", "effectiveCommitment"], "Future sample 03 exclusions")
	if (!isRecord(value.exclusions.consumedSample02) || !isRecord(value.exclusions.consumptionReceipt02) ||
		value.exclusions.effectiveCommitment !== value.selection.effectiveExclusionCommitment) throw new Error("Future sample 03 exclusions are invalid")
	exactKeys(value.exclusions.consumedSample02, ["path", "rawSha256", "manifestId", "sealCommitment",
		"inheritedEffectiveExclusionCommitment", "artworkIdCount", "artworkIdsCommitment", "variantSha256Count",
		"variantSha256Commitment"], "Consumed future sample 02")
	if (value.exclusions.consumedSample02.path !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumedSample02 ||
		value.exclusions.consumedSample02.artworkIdCount !== 12 ||
		!Number.isSafeInteger(value.exclusions.consumedSample02.variantSha256Count) ||
		(value.exclusions.consumedSample02.variantSha256Count as number) < 12) throw new Error("Consumed sample 02 summary is invalid")
	for (const key of ["rawSha256", "manifestId", "sealCommitment", "inheritedEffectiveExclusionCommitment",
		"artworkIdsCommitment", "variantSha256Commitment"] as const) requireHash(value.exclusions.consumedSample02[key], `Consumed sample 02 ${key}`)
	exactKeys(value.exclusions.consumptionReceipt02, ["path", "rawSha256", "protocolId", "futureSampleConsumed", "sourceCount"],
		"Future sample 02 consumption receipt")
	if (value.exclusions.consumptionReceipt02.path !== ALBUM_ARTWORK_PALETTE_V2_FUTURE_SAMPLE_03_PATHS.consumptionReceipt02 ||
		value.exclusions.consumptionReceipt02.protocolId !== EXPECTED_FUTURE_02_PROTOCOL_ID ||
		value.exclusions.consumptionReceipt02.futureSampleConsumed !== true || value.exclusions.consumptionReceipt02.sourceCount !== 12) {
		throw new Error("Future sample 02 consumption receipt summary is invalid")
	}
	for (const key of ["rawSha256", "protocolId"] as const) requireHash(value.exclusions.consumptionReceipt02[key], `Consumption receipt 02 ${key}`)
	if (value.families.length !== 12) throw new Error("Future sample 03 family count is invalid")
	for (const [index, family] of value.families.entries()) {
		if (!isRecord(family)) throw new Error(`Future sample 03 family ${index} is invalid`)
		exactKeys(family, ["caseId", "selectionKey", "familyCommitment", "artworkId", "preferredSourcePath", "variants"],
			`Future sample 03 family ${index}`)
		if (family.caseId !== `future-03-${String(index + 1).padStart(2, "0")}` || typeof family.artworkId !== "string" ||
			typeof family.preferredSourcePath !== "string" || sourceRootFromPath(family.preferredSourcePath) !== "11" ||
			!Array.isArray(family.variants) || family.variants.length === 0) throw new Error(`Future sample 03 family ${index} is invalid`)
		requireHash(family.selectionKey, `Future sample 03 family ${index} key`)
		requireHash(family.familyCommitment, `Future sample 03 family ${index} commitment`)
		for (const variant of family.variants) {
			if (!isRecord(variant) || typeof variant.path !== "string" || sourceRootFromPath(variant.path) !== "11" ||
				!Number.isSafeInteger(variant.byteCount) || (variant.byteCount as number) <= 0) throw new Error(`Future sample 03 variant is invalid`)
			requireHash(variant.sha256, "Future sample 03 variant hash")
		}
		const familyIdentity = { artworkId: family.artworkId, preferredSourcePath: family.preferredSourcePath, variants: family.variants }
		if (sha256(`${FAMILY_DOMAIN}\0${futureSample03CanonicalJson(familyIdentity)}`) !== family.familyCommitment) {
			throw new Error(`Future sample 03 family ${index} commitment is stale`)
		}
	}
	const parsed = value as unknown as FutureSample03
	if (new Set(parsed.families.map(({ artworkId }) => artworkId)).size !== 12 ||
		new Set(parsed.families.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash))).size !==
		parsed.families.reduce((sum, { variants }) => sum + variants.length, 0)) throw new Error("Future sample 03 families are not independent")
	const expectedManifest = manifestId(identityOf(parsed))
	if (requireHash(value.manifestId, "Future sample 03 manifest ID") !== expectedManifest ||
		requireHash(value.sealCommitment, "Future sample 03 seal") !== sealCommitment(identityOf(parsed), expectedManifest)) {
		throw new Error("Future sample 03 identity is stale")
	}
	return parsed
}

export function verifyAlbumArtworkPaletteV2FutureSample03(value: unknown, input: FutureSample03BuildInput): FutureSample03 {
	const parsed = parseAlbumArtworkPaletteV2FutureSample03(value)
	const expected = buildAlbumArtworkPaletteV2FutureSample03(input)
	if (!isDeepStrictEqual(parsed, expected)) throw new Error("Future sample 03 does not match bound metadata")
	return parsed
}

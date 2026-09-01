import { createHash, randomUUID } from "node:crypto"
import { link, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { fileURLToPath } from "node:url"
import {
	SOURCE_PROVENANCE_INVENTORY_VERSION,
	SOURCE_PROVENANCE_RESERVE_STATE,
	parseSourceProvenanceInventory,
	type SourceArtworkFamily,
	type SourceProvenanceInventory,
	type SourceVariant,
} from "./src/source-provenance-inventory.ts"

export const PHASE_4_FAST_SAMPLE_VERSION = "album-artwork-palette-v2-phase-4-fast-sample-v1" as const
export const PHASE_4_FAST_SAMPLE_ROOT = "12" as const
export const PHASE_4_FAST_SAMPLE_SIZE = 12 as const
export const PHASE_4_FAST_SAMPLE_INVENTORY_PATH =
	"research/data/source-provenance-inventory-00-14.json" as const
export const PHASE_4_FAST_SAMPLE_MANIFEST_PATH =
	"research/data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json" as const
export const PHASE_4_FAST_SAMPLE_SELECTION_DOMAIN =
	"album-artwork-palette-v2-phase-4-fast-sample-source-selection-v1" as const
export const PHASE_4_FAST_SAMPLE_SELECTION_POLICY =
	"first-12-eligible-distinct-root-12-families-by-domain-separated-source-sha256-and-byte-count-key" as const

const SOURCE_SET_DOMAIN = "album-artwork-palette-v2-phase-4-fast-sample-source-set-v1"
const REPRESENTATIVE_DOMAIN = "album-artwork-palette-v2-phase-4-fast-sample-representative-v1"
const FAMILY_DOMAIN = "album-artwork-palette-v2-phase-4-fast-sample-family-v1"
const MANIFEST_DOMAIN = "album-artwork-palette-v2-phase-4-fast-sample-manifest-v1"
const SEAL_DOMAIN = "album-artwork-palette-v2-phase-4-fast-sample-seal-v1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))

export type Phase4FastSampleSource = Readonly<{
	path: string
	sha256: string
	byteCount: number
}>

export type Phase4FastSampleSelection = Readonly<{
	caseId: string
	selectionKey: string
	familyCommitment: string
	familyId: string
	source: Phase4FastSampleSource
}>

export type Phase4FastSampleIdentity = Readonly<{
	schemaVersion: 1
	manifestVersion: typeof PHASE_4_FAST_SAMPLE_VERSION
	custody: Readonly<{
		sealState: "closed"
		inputPolicy: "source-provenance-inventory-metadata-only"
		developmentExtractionProhibited: true
		prohibition: string
	}>
	inventory: Readonly<{
		path: typeof PHASE_4_FAST_SAMPLE_INVENTORY_PATH
		inventoryVersion: typeof SOURCE_PROVENANCE_INVENTORY_VERSION
		inventoryId: string
		rawSha256: string
	}>
	selection: Readonly<{
		root: typeof PHASE_4_FAST_SAMPLE_ROOT
		familyCount: typeof PHASE_4_FAST_SAMPLE_SIZE
		eligibleFamilyCount: number
		domain: typeof PHASE_4_FAST_SAMPLE_SELECTION_DOMAIN
		policy: typeof PHASE_4_FAST_SAMPLE_SELECTION_POLICY
		representativePolicy: string
		filenamePolicy: string
		excludedSignals: readonly string[]
	}>
	selections: readonly Phase4FastSampleSelection[]
}>

export type Phase4FastSampleManifest = Phase4FastSampleIdentity & Readonly<{
	manifestId: string
	sealCommitment: string
}>

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function phase4FastSampleCanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(phase4FastSampleCanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) =>
		`${JSON.stringify(key)}:${phase4FastSampleCanonicalJson(record[key])}`).join(",")}}`
}

function sourceRoot(path: string): string {
	const separator = path.indexOf("/")
	return separator === 2 ? path.slice(0, separator) : ""
}

function selectedSource(variant: SourceVariant): Phase4FastSampleSource {
	return { path: variant.path, sha256: variant.sha256, byteCount: variant.byteCount }
}

function representativeKey(variant: SourceVariant): string {
	return sha256(`${REPRESENTATIVE_DOMAIN}\0${variant.sha256}\0${variant.byteCount}`)
}

function representative(family: SourceArtworkFamily): SourceVariant {
	const ranked = family.variants.map((variant) => ({ variant, key: representativeKey(variant) }))
		.sort((first, second) => first.key.localeCompare(second.key))
	if (ranked.length > 1 && ranked[0].key === ranked[1].key) {
		throw new Error(`Family ${family.artworkId} has ambiguous source-identical representatives`)
	}
	return ranked[0].variant
}

function sourceSetCommitment(family: SourceArtworkFamily): string {
	const sources = family.variants.map(({ sha256: hash, byteCount }) => ({ sha256: hash, byteCount }))
		.sort((first, second) => first.sha256.localeCompare(second.sha256) || first.byteCount - second.byteCount)
	return sha256(`${SOURCE_SET_DOMAIN}\0${phase4FastSampleCanonicalJson(sources)}`)
}

function selectionKey(family: SourceArtworkFamily): string {
	return sha256(`${PHASE_4_FAST_SAMPLE_SELECTION_DOMAIN}\0${sourceSetCommitment(family)}`)
}

function familyCommitment(familyId: string, source: Phase4FastSampleSource): string {
	return sha256(`${FAMILY_DOMAIN}\0${phase4FastSampleCanonicalJson({ familyId, source })}`)
}

function eligibleFamily(
	family: SourceArtworkFamily,
	groups: ReadonlyMap<string, SourceProvenanceInventory["rawSha256Groups"][number]>,
): boolean {
	if (family.reserve === null || family.reserve.provenanceState !== SOURCE_PROVENANCE_RESERVE_STATE ||
		!family.reserve.futureValidationEligible || !isDeepStrictEqual(family.reserve.roots, [PHASE_4_FAST_SAMPLE_ROOT]) ||
		family.reserve.exclusionReasons.length !== 0 || family.reserve.priorOverlapSha256.length !== 0 ||
		family.reserve.nonOwnedSha256.length !== 0) return false
	return family.variants.every((variant) => {
		if (sourceRoot(variant.path) !== PHASE_4_FAST_SAMPLE_ROOT || !variant.jpegSignatures.startsWithSoi ||
			!variant.jpegSignatures.endsWithEoi) return false
		const group = groups.get(variant.sha256)
		return group !== undefined && group.byteCount === variant.byteCount && group.priorContentPaths.length === 0 &&
			isDeepStrictEqual(group.reserveArtworkIds, [family.artworkId]) &&
			group.reserveContentOwnerArtworkId === family.artworkId &&
			group.reservePaths.every((path) => sourceRoot(path) === PHASE_4_FAST_SAMPLE_ROOT)
	})
}

function identityOf(manifest: Phase4FastSampleManifest): Phase4FastSampleIdentity {
	const { manifestId: _manifestId, sealCommitment: _sealCommitment, ...identity } = manifest
	return identity
}

function manifestId(identity: Phase4FastSampleIdentity): string {
	return sha256(`${MANIFEST_DOMAIN}\0${phase4FastSampleCanonicalJson(identity)}`)
}

function sealCommitment(identity: Phase4FastSampleIdentity, id: string): string {
	return sha256(`${SEAL_DOMAIN}\0${id}\0${phase4FastSampleCanonicalJson(identity)}`)
}

export function buildPhase4FastSampleManifest(
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
): Phase4FastSampleManifest {
	if (inventory.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION || !/^[a-f0-9]{64}$/.test(inventoryRawSha256)) {
		throw new Error("Source provenance inventory identity is invalid")
	}
	const groups = new Map(inventory.rawSha256Groups.map((group) => [group.sha256, group]))
	const eligible = inventory.families.filter((family) => eligibleFamily(family, groups))
		.map((family) => ({ family, key: selectionKey(family) }))
		.sort((first, second) => first.key.localeCompare(second.key))
	if (eligible.length < PHASE_4_FAST_SAMPLE_SIZE) {
		throw new Error(`Inventory contains only ${eligible.length} eligible root-12 artwork families`)
	}
	for (let index = 1; index < eligible.length; index++) {
		if (eligible[index - 1].key === eligible[index].key) {
			throw new Error("Eligible families do not have distinct source-only selection keys")
		}
	}
	const selections = eligible.slice(0, PHASE_4_FAST_SAMPLE_SIZE).map(({ family, key }, index) => {
		const source = selectedSource(representative(family))
		return {
			caseId: `phase-4-fast-${String(index + 1).padStart(2, "0")}`,
			selectionKey: key,
			familyCommitment: familyCommitment(family.artworkId, source),
			familyId: family.artworkId,
			source,
		}
	})
	const identity: Phase4FastSampleIdentity = {
		schemaVersion: 1,
		manifestVersion: PHASE_4_FAST_SAMPLE_VERSION,
		custody: {
			sealState: "closed",
			inputPolicy: "source-provenance-inventory-metadata-only",
			developmentExtractionProhibited: true,
			prohibition: "Development extraction is forbidden: do not read, decode, render, inspect, review, or run candidate or baseline extraction on the selected root-12 artwork bytes before an independently authorized Phase 4 opening.",
		},
		inventory: {
			path: PHASE_4_FAST_SAMPLE_INVENTORY_PATH,
			inventoryVersion: inventory.inventoryVersion,
			inventoryId: inventory.inventoryId,
			rawSha256: inventoryRawSha256,
		},
		selection: {
			root: PHASE_4_FAST_SAMPLE_ROOT,
			familyCount: PHASE_4_FAST_SAMPLE_SIZE,
			eligibleFamilyCount: eligible.length,
			domain: PHASE_4_FAST_SAMPLE_SELECTION_DOMAIN,
			policy: PHASE_4_FAST_SAMPLE_SELECTION_POLICY,
			representativePolicy: "lowest-domain-separated-key-over-source-sha256-and-byte-count; path-text-never-ranks-sources",
			filenamePolicy: "paths-and-family-ids-are-bound-identifiers-only; filename text and meaning never affect eligibility, ranking, or representative choice",
			excludedSignals: ["filename semantics", "colors", "candidate output", "reviews"],
		},
		selections,
	}
	const id = manifestId(identity)
	return { ...identity, manifestId: id, sealCommitment: sealCommitment(identity, id) }
}

export function verifyPhase4FastSampleManifest(
	value: unknown,
	inventory: SourceProvenanceInventory,
	inventoryRawSha256: string,
): Phase4FastSampleManifest {
	const expected = buildPhase4FastSampleManifest(inventory, inventoryRawSha256)
	if (!isDeepStrictEqual(value, expected)) {
		throw new Error("Sealed Phase 4 fast sample does not exactly match the selection reconstructed from its bound inventory")
	}
	const manifest = value as Phase4FastSampleManifest
	const identity = identityOf(manifest)
	if (manifest.manifestId !== manifestId(identity) ||
		manifest.sealCommitment !== sealCommitment(identity, manifest.manifestId)) {
		throw new Error("Sealed Phase 4 fast sample commitment is stale")
	}
	return manifest
}

async function inventoryInput(): Promise<{ inventory: SourceProvenanceInventory; rawSha256: string }> {
	const bytes = await readFile(resolve(projectRoot, PHASE_4_FAST_SAMPLE_INVENTORY_PATH))
	return {
		inventory: parseSourceProvenanceInventory(JSON.parse(bytes.toString("utf8")) as unknown),
		rawSha256: sha256(bytes),
	}
}

async function publishWithoutOverwrite(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		try {
			await link(temporary, path)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") {
				throw new Error(`Refusing to overwrite sealed reserve selection: ${path}`)
			}
			throw error
		}
	} finally {
		await rm(temporary, { force: true })
	}
}

async function main(): Promise<void> {
	const argument = process.argv[2]
	if (process.argv.length > 3 || (argument !== undefined && argument !== "seal" && argument !== "verify" &&
		argument !== "--verify")) {
		throw new Error("Usage: select-album-artwork-palette-v2-phase-4-fast-sample.ts [seal|--verify]")
	}
	const input = await inventoryInput()
	const outputPath = resolve(projectRoot, PHASE_4_FAST_SAMPLE_MANIFEST_PATH)
	if (argument === "verify" || argument === "--verify") {
		const value = JSON.parse(await readFile(outputPath, "utf8")) as unknown
		const manifest = verifyPhase4FastSampleManifest(value, input.inventory, input.rawSha256)
		process.stdout.write(`Phase 4 fast sample verified: manifest=${manifest.manifestId} seal=${manifest.sealCommitment}\n`)
		return
	}
	const manifest = buildPhase4FastSampleManifest(input.inventory, input.rawSha256)
	await publishWithoutOverwrite(outputPath, manifest)
	process.stdout.write(`Phase 4 fast sample sealed: manifest=${manifest.manifestId} seal=${manifest.sealCommitment}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}

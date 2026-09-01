import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

export const SOURCE_PROVENANCE_INVENTORY_VERSION = "source-provenance-inventory-00-14-v1" as const
export const SOURCE_PROVENANCE_RESERVE_STATE = "source-inventoried/output-unseen" as const
export const PRIOR_SOURCE_ROOTS = [
	"00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f",
] as const
export const RESERVE_SOURCE_ROOTS = ["10", "11", "12", "13", "14"] as const
export const SOURCE_PROVENANCE_ROOTS = [...PRIOR_SOURCE_ROOTS, ...RESERVE_SOURCE_ROOTS] as const
export const SOURCE_PROVENANCE_IMPLEMENTATION_FILES = [
	"research/prepare-source-provenance-inventory.ts",
	"research/src/source-provenance-inventory.ts",
] as const

export type PriorSourceRoot = typeof PRIOR_SOURCE_ROOTS[number]
export type ReserveSourceRoot = typeof RESERVE_SOURCE_ROOTS[number]
export type SourceProvenanceRoot = typeof SOURCE_PROVENANCE_ROOTS[number]
export type SourcePrefixClass = "ab67616d0000b273" | "ab67616d00001e02" | "other"

export type SourceRootBinding = {
	path: PriorSourceRoot
	cohort: "prior-content"
	provenanceState: "prior-content"
} | {
	path: ReserveSourceRoot
	cohort: "reserve"
	provenanceState: typeof SOURCE_PROVENANCE_RESERVE_STATE
}

export type SourceVariant = {
	path: string
	byteCount: number
	sha256: string
	artworkId: string
	prefixClass: SourcePrefixClass
	jpegSignatures: {
		startsWithSoi: boolean
		endsWithEoi: boolean
	}
}

export type SourceProvenanceImplementationFile = {
	path: typeof SOURCE_PROVENANCE_IMPLEMENTATION_FILES[number]
	sha256: string
}

export type SourceProvenanceImplementation = {
	files: SourceProvenanceImplementationFile[]
	sha256: string
}

export type ReserveFamilyProvenance = {
	roots: ReserveSourceRoot[]
	provenanceState: typeof SOURCE_PROVENANCE_RESERVE_STATE
	futureValidationEligible: boolean
	exclusionReasons: Array<"prior-content-overlap" | "reserve-content-owned-by-lexical-artwork">
	priorOverlapSha256: string[]
	nonOwnedSha256: string[]
}

export type SourceArtworkFamily = {
	artworkId: string
	preferredSourcePath: string
	variants: SourceVariant[]
	reserve: ReserveFamilyProvenance | null
}

export type RawSha256Group = {
	sha256: string
	byteCount: number
	paths: string[]
	priorContentPaths: string[]
	priorContentOwnerPath: string | null
	reservePaths: string[]
	reserveArtworkIds: string[]
	reserveContentOwnerArtworkId: string | null
}

export type SourceRootSummary = {
	path: SourceProvenanceRoot
	rawFiles: number
	artworkFamilies: number
	uniqueHashes: number
	extensionlessFiles: number
	jpegSignaturePasses: number
	jpegSignatureFailures: number
}

export type SourceProvenanceSummary = {
	total: {
		rawFiles: number
		artworkFamilies: number
		uniqueHashes: number
	}
	prior: {
		rawFiles: number
		artworkFamilies: number
		uniqueHashes: number
	}
	reserve: {
		rawFiles: number
		artworkFamilies: number
		uniqueHashes: number
		extensionlessFiles: number
		jpegSignaturePasses: number
		jpegSignatureFailures: number
		futureValidationEligibleFamilies: number
		priorOverlappingHashes: number
		priorOverlappingFamilies: number
		internalDuplicateHashes: number
		internalDuplicateFamilies: number
		artworkIdOverlapWithPrior: number
		artworkIdOverlapBetweenReserveRoots: number
	}
	roots: SourceRootSummary[]
}

export type SourceProvenanceInventory = {
	schemaVersion: 1
	inventoryVersion: typeof SOURCE_PROVENANCE_INVENTORY_VERSION
	inventoryId: string
	sourceRoots: SourceRootBinding[]
	implementation: SourceProvenanceImplementation
	summary: SourceProvenanceSummary
	families: SourceArtworkFamily[]
	rawSha256Groups: RawSha256Group[]
}

export type SourceProvenanceInventoryIdentity = Omit<SourceProvenanceInventory, "inventoryId">

const sha256Pattern = /^[a-f0-9]{64}$/
const sourceRootSet = new Set<string>(SOURCE_PROVENANCE_ROOTS)
const priorRootSet = new Set<string>(PRIOR_SOURCE_ROOTS)
const reserveRootSet = new Set<string>(RESERVE_SOURCE_ROOTS)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
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

function isSha256(value: unknown): value is string {
	return typeof value === "string" && sha256Pattern.test(value)
}

function sourceName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1)
}

export function sourceRootFromPath(path: string): SourceProvenanceRoot {
	if (!/^[0-9a-f]{2}\/[A-Za-z0-9._-]+$/.test(path)) throw new Error(`Invalid source path: ${path}`)
	const root = path.slice(0, 2)
	if (!sourceRootSet.has(root)) throw new Error(`Source path is outside the bound roots: ${path}`)
	return root as SourceProvenanceRoot
}

export function artworkIdFromSourcePath(path: string): string {
	sourceRootFromPath(path)
	const name = sourceName(path)
	const spotify = /^ab67616d[0-9a-f]{8}([0-9a-f]+)(?:\.[A-Za-z0-9]+)?$/i.exec(name)
	return spotify ? spotify[1].toLowerCase() : name
}

export function sourcePrefixClass(path: string): SourcePrefixClass {
	sourceRootFromPath(path)
	const name = sourceName(path).toLowerCase()
	if (name.startsWith("ab67616d0000b273")) return "ab67616d0000b273"
	if (name.startsWith("ab67616d00001e02")) return "ab67616d00001e02"
	return "other"
}

function sourcePreference(prefixClass: SourcePrefixClass): number {
	if (prefixClass === "ab67616d0000b273") return 0
	if (prefixClass === "ab67616d00001e02") return 1
	return 2
}

export function compareSourceVariants(first: SourceVariant, second: SourceVariant): number {
	return sourcePreference(first.prefixClass) - sourcePreference(second.prefixClass) ||
		compareText(first.path, second.path)
}

export function sourceVariantFromBytes(path: string, bytes: Uint8Array): SourceVariant {
	return {
		path,
		byteCount: bytes.byteLength,
		sha256: sha256(bytes),
		artworkId: artworkIdFromSourcePath(path),
		prefixClass: sourcePrefixClass(path),
		jpegSignatures: {
			startsWithSoi: bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8,
			endsWithEoi: bytes.byteLength >= 2 && bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9,
		},
	}
}

function rootBinding(path: SourceProvenanceRoot): SourceRootBinding {
	if (priorRootSet.has(path)) return { path: path as PriorSourceRoot, cohort: "prior-content", provenanceState: "prior-content" }
	return { path: path as ReserveSourceRoot, cohort: "reserve", provenanceState: SOURCE_PROVENANCE_RESERVE_STATE }
}

export function sourceProvenanceRootBindings(): SourceRootBinding[] {
	return SOURCE_PROVENANCE_ROOTS.map(rootBinding)
}

export function createSourceProvenanceImplementation(
	files: readonly SourceProvenanceImplementationFile[],
): SourceProvenanceImplementation {
	const normalized = [...files].sort((first, second) => compareText(first.path, second.path))
	if (normalized.length !== SOURCE_PROVENANCE_IMPLEMENTATION_FILES.length ||
		normalized.some((file, index) => file.path !== SOURCE_PROVENANCE_IMPLEMENTATION_FILES[index] || !isSha256(file.sha256))) {
		throw new Error("Source provenance implementation files are invalid")
	}
	return { files: normalized, sha256: sha256(JSON.stringify(normalized)) }
}

function validateImplementation(value: unknown): SourceProvenanceImplementation {
	if (!isRecord(value)) throw new Error("Source provenance implementation is invalid")
	exactKeys(value, ["files", "sha256"], "Source provenance implementation")
	if (!Array.isArray(value.files) || !isSha256(value.sha256)) throw new Error("Source provenance implementation is invalid")
	const files = value.files.map((file, index) => {
		if (!isRecord(file)) throw new Error(`Source provenance implementation file ${index} is invalid`)
		exactKeys(file, ["path", "sha256"], `Source provenance implementation file ${index}`)
		if (!SOURCE_PROVENANCE_IMPLEMENTATION_FILES.includes(file.path as never) || !isSha256(file.sha256)) {
			throw new Error(`Source provenance implementation file ${index} is invalid`)
		}
		return file as unknown as SourceProvenanceImplementationFile
	})
	const expected = createSourceProvenanceImplementation(files)
	if (!isDeepStrictEqual(value, expected)) throw new Error("Source provenance implementation identity is stale")
	return expected
}

function validateVariant(value: unknown, label: string): SourceVariant {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["path", "byteCount", "sha256", "artworkId", "prefixClass", "jpegSignatures"], label)
	if (typeof value.path !== "string" || !Number.isSafeInteger(value.byteCount) || (value.byteCount as number) < 0 ||
		!isSha256(value.sha256) || typeof value.artworkId !== "string" || value.artworkId.length === 0 ||
		!isRecord(value.jpegSignatures) ||
		(value.prefixClass !== "ab67616d0000b273" && value.prefixClass !== "ab67616d00001e02" && value.prefixClass !== "other")) {
		throw new Error(`${label} is invalid`)
	}
	exactKeys(value.jpegSignatures, ["startsWithSoi", "endsWithEoi"], `${label} JPEG signatures`)
	if (typeof value.jpegSignatures.startsWithSoi !== "boolean" || typeof value.jpegSignatures.endsWithEoi !== "boolean") {
		throw new Error(`${label} JPEG signatures are invalid`)
	}
	if (artworkIdFromSourcePath(value.path) !== value.artworkId || sourcePrefixClass(value.path) !== value.prefixClass) {
		throw new Error(`${label} path-derived provenance is stale`)
	}
	return value as unknown as SourceVariant
}

function isPriorVariant(variant: SourceVariant): boolean {
	return priorRootSet.has(sourceRootFromPath(variant.path))
}

function isReserveVariant(variant: SourceVariant): boolean {
	return reserveRootSet.has(sourceRootFromPath(variant.path))
}

function isExtensionless(variant: SourceVariant): boolean {
	return !sourceName(variant.path).includes(".")
}

function inventoryIdentity(inventory: SourceProvenanceInventory): SourceProvenanceInventoryIdentity {
	return {
		schemaVersion: inventory.schemaVersion,
		inventoryVersion: inventory.inventoryVersion,
		sourceRoots: inventory.sourceRoots,
		implementation: inventory.implementation,
		summary: inventory.summary,
		families: inventory.families,
		rawSha256Groups: inventory.rawSha256Groups,
	}
}

export function sourceProvenanceInventoryId(identity: SourceProvenanceInventoryIdentity): string {
	return sha256(JSON.stringify(identity))
}

export function buildSourceProvenanceInventory(
	inputVariants: readonly SourceVariant[],
	implementation: SourceProvenanceImplementation,
): SourceProvenanceInventory {
	validateImplementation(implementation)
	const variants = inputVariants.map((variant, index) => validateVariant(variant, `Source variant ${index}`))
	const paths = new Set<string>()
	for (const variant of variants) {
		if (paths.has(variant.path)) throw new Error(`Duplicate source path: ${variant.path}`)
		paths.add(variant.path)
	}

	const byHash = new Map<string, SourceVariant[]>()
	for (const variant of variants) {
		const group = byHash.get(variant.sha256) ?? []
		if (group.some((existing) => existing.byteCount !== variant.byteCount)) {
			throw new Error(`SHA-256 group has inconsistent byte counts: ${variant.sha256}`)
		}
		group.push(variant)
		byHash.set(variant.sha256, group)
	}
	const rawSha256Groups: RawSha256Group[] = [...byHash.entries()]
		.sort(([first], [second]) => compareText(first, second))
		.map(([hash, group]) => {
			const orderedPaths = group.map((variant) => variant.path).sort(compareText)
			const priorContentPaths = group.filter(isPriorVariant).map((variant) => variant.path).sort(compareText)
			const reserveVariants = group.filter(isReserveVariant)
			const reservePaths = reserveVariants.map((variant) => variant.path).sort(compareText)
			const reserveArtworkIds = [...new Set(reserveVariants.map((variant) => variant.artworkId))].sort(compareText)
			return {
				sha256: hash,
				byteCount: group[0].byteCount,
				paths: orderedPaths,
				priorContentPaths,
				priorContentOwnerPath: priorContentPaths[0] ?? null,
				reservePaths,
				reserveArtworkIds,
				reserveContentOwnerArtworkId: reserveArtworkIds[0] ?? null,
			}
		})
	const hashGroups = new Map(rawSha256Groups.map((group) => [group.sha256, group]))

	const byArtwork = new Map<string, SourceVariant[]>()
	for (const variant of variants) {
		const family = byArtwork.get(variant.artworkId) ?? []
		family.push(variant)
		byArtwork.set(variant.artworkId, family)
	}
	const families: SourceArtworkFamily[] = [...byArtwork.entries()]
		.sort(([first], [second]) => compareText(first, second))
		.map(([artworkId, familyVariants]) => {
			const orderedVariants = [...familyVariants].sort(compareSourceVariants)
			const reserveVariants = orderedVariants.filter(isReserveVariant)
			if (reserveVariants.length === 0) {
				return { artworkId, preferredSourcePath: orderedVariants[0].path, variants: orderedVariants, reserve: null }
			}
			const roots = [...new Set(reserveVariants.map((variant) =>
				sourceRootFromPath(variant.path) as ReserveSourceRoot))].sort(compareText)
			const priorOverlapSha256 = [...new Set(reserveVariants
				.filter((variant) => hashGroups.get(variant.sha256)!.priorContentPaths.length > 0)
				.map((variant) => variant.sha256))].sort(compareText)
			const nonOwnedSha256 = [...new Set(reserveVariants
				.filter((variant) => {
					const group = hashGroups.get(variant.sha256)!
					return group.reserveArtworkIds.length > 1 && group.reserveContentOwnerArtworkId !== artworkId
				})
				.map((variant) => variant.sha256))].sort(compareText)
			const exclusionReasons: ReserveFamilyProvenance["exclusionReasons"] = []
			if (priorOverlapSha256.length > 0) exclusionReasons.push("prior-content-overlap")
			if (nonOwnedSha256.length > 0) exclusionReasons.push("reserve-content-owned-by-lexical-artwork")
			return {
				artworkId,
				preferredSourcePath: orderedVariants[0].path,
				variants: orderedVariants,
				reserve: {
					roots,
					provenanceState: SOURCE_PROVENANCE_RESERVE_STATE,
					futureValidationEligible: exclusionReasons.length === 0,
					exclusionReasons,
					priorOverlapSha256,
					nonOwnedSha256,
				},
			}
		})

	const priorVariants = variants.filter(isPriorVariant)
	const reserveVariants = variants.filter(isReserveVariant)
	const reserveFamilies = families.filter((family) => family.reserve !== null)
	const internalDuplicateGroups = rawSha256Groups.filter((group) => group.reserveArtworkIds.length > 1)
	const internalDuplicateFamilies = new Set(internalDuplicateGroups.flatMap((group) => group.reserveArtworkIds))
	const rootSummaries = SOURCE_PROVENANCE_ROOTS.map((root): SourceRootSummary => {
		const rootVariants = variants.filter((variant) => sourceRootFromPath(variant.path) === root)
		const jpegPasses = rootVariants.filter((variant) =>
			variant.jpegSignatures.startsWithSoi && variant.jpegSignatures.endsWithEoi).length
		return {
			path: root,
			rawFiles: rootVariants.length,
			artworkFamilies: new Set(rootVariants.map((variant) => variant.artworkId)).size,
			uniqueHashes: new Set(rootVariants.map((variant) => variant.sha256)).size,
			extensionlessFiles: rootVariants.filter(isExtensionless).length,
			jpegSignaturePasses: jpegPasses,
			jpegSignatureFailures: rootVariants.length - jpegPasses,
		}
	})
	const reserveJpegPasses = reserveVariants.filter((variant) =>
		variant.jpegSignatures.startsWithSoi && variant.jpegSignatures.endsWithEoi).length
	const summary: SourceProvenanceSummary = {
		total: {
			rawFiles: variants.length,
			artworkFamilies: families.length,
			uniqueHashes: rawSha256Groups.length,
		},
		prior: {
			rawFiles: priorVariants.length,
			artworkFamilies: new Set(priorVariants.map((variant) => variant.artworkId)).size,
			uniqueHashes: new Set(priorVariants.map((variant) => variant.sha256)).size,
		},
		reserve: {
			rawFiles: reserveVariants.length,
			artworkFamilies: reserveFamilies.length,
			uniqueHashes: new Set(reserveVariants.map((variant) => variant.sha256)).size,
			extensionlessFiles: reserveVariants.filter(isExtensionless).length,
			jpegSignaturePasses: reserveJpegPasses,
			jpegSignatureFailures: reserveVariants.length - reserveJpegPasses,
			futureValidationEligibleFamilies: reserveFamilies.filter((family) => family.reserve!.futureValidationEligible).length,
			priorOverlappingHashes: rawSha256Groups.filter((group) =>
				group.priorContentPaths.length > 0 && group.reservePaths.length > 0).length,
			priorOverlappingFamilies: reserveFamilies.filter((family) => family.reserve!.priorOverlapSha256.length > 0).length,
			internalDuplicateHashes: internalDuplicateGroups.length,
			internalDuplicateFamilies: internalDuplicateFamilies.size,
			artworkIdOverlapWithPrior: reserveFamilies.filter((family) => family.variants.some(isPriorVariant)).length,
			artworkIdOverlapBetweenReserveRoots: reserveFamilies.filter((family) => family.reserve!.roots.length > 1).length,
		},
		roots: rootSummaries,
	}
	const identity: SourceProvenanceInventoryIdentity = {
		schemaVersion: 1,
		inventoryVersion: SOURCE_PROVENANCE_INVENTORY_VERSION,
		sourceRoots: sourceProvenanceRootBindings(),
		implementation,
		summary,
		families,
		rawSha256Groups,
	}
	return { ...identity, inventoryId: sourceProvenanceInventoryId(identity) }
}

function validateStringArray(value: unknown, label: string, shaValues = false): void {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || (shaValues && !isSha256(item)))) {
		throw new Error(`${label} is invalid`)
	}
}

function validateSummary(value: unknown): void {
	if (!isRecord(value)) throw new Error("Source provenance summary is invalid")
	exactKeys(value, ["total", "prior", "reserve", "roots"], "Source provenance summary")
	if (!isRecord(value.total) || !isRecord(value.prior) || !isRecord(value.reserve) || !Array.isArray(value.roots)) {
		throw new Error("Source provenance summary is invalid")
	}
	exactKeys(value.total, ["rawFiles", "artworkFamilies", "uniqueHashes"], "Source provenance total summary")
	exactKeys(value.prior, ["rawFiles", "artworkFamilies", "uniqueHashes"], "Source provenance prior summary")
	exactKeys(value.reserve, [
		"rawFiles", "artworkFamilies", "uniqueHashes", "extensionlessFiles", "jpegSignaturePasses",
		"jpegSignatureFailures", "futureValidationEligibleFamilies", "priorOverlappingHashes",
		"priorOverlappingFamilies", "internalDuplicateHashes", "internalDuplicateFamilies",
		"artworkIdOverlapWithPrior", "artworkIdOverlapBetweenReserveRoots",
	], "Source provenance reserve summary")
	for (const [label, record] of [["total", value.total], ["prior", value.prior], ["reserve", value.reserve]] as const) {
		if (Object.values(record).some((item) => !Number.isSafeInteger(item) || (item as number) < 0)) {
			throw new Error(`Source provenance ${label} summary is invalid`)
		}
	}
	for (const [index, root] of value.roots.entries()) {
		if (!isRecord(root)) throw new Error(`Source provenance root summary ${index} is invalid`)
		exactKeys(root, [
			"path", "rawFiles", "artworkFamilies", "uniqueHashes", "extensionlessFiles",
			"jpegSignaturePasses", "jpegSignatureFailures",
		], `Source provenance root summary ${index}`)
		if (!sourceRootSet.has(root.path as string) || Object.entries(root).some(([key, item]) =>
			key !== "path" && (!Number.isSafeInteger(item) || (item as number) < 0))) {
			throw new Error(`Source provenance root summary ${index} is invalid`)
		}
	}
}

export function parseSourceProvenanceInventory(value: unknown): SourceProvenanceInventory {
	if (!isRecord(value)) throw new Error("Source provenance inventory must be an object")
	exactKeys(value, [
		"schemaVersion", "inventoryVersion", "inventoryId", "sourceRoots", "implementation", "summary", "families",
		"rawSha256Groups",
	], "Source provenance inventory")
	if (value.schemaVersion !== 1 || value.inventoryVersion !== SOURCE_PROVENANCE_INVENTORY_VERSION ||
		!isSha256(value.inventoryId) || !Array.isArray(value.sourceRoots) || !Array.isArray(value.families) ||
		!Array.isArray(value.rawSha256Groups)) throw new Error("Source provenance inventory header is invalid")
	if (!isDeepStrictEqual(value.sourceRoots, sourceProvenanceRootBindings())) {
		throw new Error("Source provenance inventory roots are invalid")
	}
	const implementation = validateImplementation(value.implementation)
	validateSummary(value.summary)
	const variants: SourceVariant[] = []
	for (const [familyIndex, family] of value.families.entries()) {
		if (!isRecord(family)) throw new Error(`Source artwork family ${familyIndex} is invalid`)
		exactKeys(family, ["artworkId", "preferredSourcePath", "variants", "reserve"], `Source artwork family ${familyIndex}`)
		if (typeof family.artworkId !== "string" || family.artworkId.length === 0 ||
			typeof family.preferredSourcePath !== "string" || !Array.isArray(family.variants) || family.variants.length === 0) {
			throw new Error(`Source artwork family ${familyIndex} is invalid`)
		}
		for (const [variantIndex, variant] of family.variants.entries()) {
			const parsed = validateVariant(variant, `Source artwork family ${familyIndex} variant ${variantIndex}`)
			if (parsed.artworkId !== family.artworkId) throw new Error(`Source artwork family ${familyIndex} mixes artwork IDs`)
			variants.push(parsed)
		}
		if (family.reserve !== null) {
			if (!isRecord(family.reserve)) throw new Error(`Source artwork family ${familyIndex} reserve provenance is invalid`)
			exactKeys(family.reserve, [
				"roots", "provenanceState", "futureValidationEligible", "exclusionReasons", "priorOverlapSha256", "nonOwnedSha256",
			], `Source artwork family ${familyIndex} reserve provenance`)
			if (!Array.isArray(family.reserve.roots) || family.reserve.roots.some((root) => !reserveRootSet.has(root as string)) ||
				family.reserve.provenanceState !== SOURCE_PROVENANCE_RESERVE_STATE ||
				typeof family.reserve.futureValidationEligible !== "boolean") {
				throw new Error(`Source artwork family ${familyIndex} reserve provenance is invalid`)
			}
			const exclusionReasons = family.reserve.exclusionReasons
			validateStringArray(exclusionReasons,
				`Source artwork family ${familyIndex} exclusion reasons`)
			if ((exclusionReasons as string[]).some((reason) => reason !== "prior-content-overlap" &&
				reason !== "reserve-content-owned-by-lexical-artwork")) {
				throw new Error(`Source artwork family ${familyIndex} exclusion reasons are invalid`)
			}
			validateStringArray(family.reserve.priorOverlapSha256,
				`Source artwork family ${familyIndex} prior overlap hashes`, true)
			validateStringArray(family.reserve.nonOwnedSha256,
				`Source artwork family ${familyIndex} non-owned hashes`, true)
		}
	}
	for (const [index, group] of value.rawSha256Groups.entries()) {
		if (!isRecord(group)) throw new Error(`Raw SHA-256 group ${index} is invalid`)
		exactKeys(group, [
			"sha256", "byteCount", "paths", "priorContentPaths", "priorContentOwnerPath", "reservePaths",
			"reserveArtworkIds", "reserveContentOwnerArtworkId",
		], `Raw SHA-256 group ${index}`)
		if (!isSha256(group.sha256) || !Number.isSafeInteger(group.byteCount) || (group.byteCount as number) < 0 ||
			(group.priorContentOwnerPath !== null && typeof group.priorContentOwnerPath !== "string") ||
			(group.reserveContentOwnerArtworkId !== null && typeof group.reserveContentOwnerArtworkId !== "string")) {
			throw new Error(`Raw SHA-256 group ${index} is invalid`)
		}
		validateStringArray(group.paths, `Raw SHA-256 group ${index} paths`)
		validateStringArray(group.priorContentPaths, `Raw SHA-256 group ${index} prior paths`)
		validateStringArray(group.reservePaths, `Raw SHA-256 group ${index} reserve paths`)
		validateStringArray(group.reserveArtworkIds, `Raw SHA-256 group ${index} reserve artwork IDs`)
	}
	const inventory = value as unknown as SourceProvenanceInventory
	if (sourceProvenanceInventoryId(inventoryIdentity(inventory)) !== inventory.inventoryId) {
		throw new Error("Source provenance inventory identity is stale")
	}
	const expected = buildSourceProvenanceInventory(variants, implementation)
	if (!isDeepStrictEqual(inventory, expected)) {
		throw new Error("Source provenance inventory ordering or derived provenance is invalid")
	}
	return inventory
}

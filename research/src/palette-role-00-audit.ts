import { createHash } from "node:crypto"
import { contrastRatio, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import { nameRGB } from "./color-name.ts"
import { selectionTracks, type SelectionCandidate, type SelectionManifest, type SelectionTrack } from "./corpus-selection.ts"
import type { PaletteMetrics, RGB, RoleName } from "./types.ts"

export const PALETTE_ROLE_00_AUDIT_VERSION = "palette-role-00-audit-0.2.0-development"
export const PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION = "palette-role-00-audit-presentation-0.2.0"
export const PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION = "region-graph-0.19.0"
export const PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT = 355
export const PALETTE_ROLE_00_AUDIT_TRACK_ENTRY_COUNT = 10
export const PALETTE_ROLE_00_AUDIT_ENTRY_COUNT = 30
export const PALETTE_ROLE_00_AUDIT_BATCH_SIZE = 10
export const PALETTE_ROLE_00_AUDIT_BATCH_COUNT = 3

export const paletteRole00AuditRoles = ["background", "foreground", "surface", "accent"] as const
export const paletteRole00AuditSkipReasonValues = [
	"dud",
	"not-artwork",
	"uncertain",
] as const
export const paletteRole00AuditOverallQualityValues = [
	"strong",
	"acceptable",
	"weak",
	"unacceptable",
	"uncertain",
] as const

export const paletteRole00AuditImplementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/color-name.ts",
	"research/src/corpus-selection.ts",
	"research/src/palette-role-00-audit.ts",
	"research/prepare-palette-role-00-audit.ts",
	"research/serve-palette-role-00-audit.ts",
	"research/analyze-palette-role-00-audit.ts",
] as const
export const paletteRole00AuditPresentationFiles = [
	"research/palette-role-00-audit/index.html",
	"research/palette-role-00-audit/app.js",
	"research/palette-role-00-audit/styles.css",
] as const

export type PaletteRole00AuditSkipReason = typeof paletteRole00AuditSkipReasonValues[number]
export type PaletteRole00AuditOverallQuality = typeof paletteRole00AuditOverallQualityValues[number]

export type PaletteRole00AuditPresentedRole = {
	rgb: RGB
	hex: string
	generated: boolean
	sourceDistance: number
	colorName: {
		nearestName: string
		referenceHex: string
		tier: "srgb" | "p3" | "rec2020"
		distance: number
	}
}

export type PaletteRole00AuditPresentedPalette = {
	roles: Record<RoleName, PaletteRole00AuditPresentedRole>
	gradient: {
		isGradient: boolean
		confidence: number
		coverage: number
		continuity: number
		coherence: number
	}
	score: number
	metrics: PaletteMetrics
	backgroundSurface: {
		oklabDistance: number
		contrast: number
		exactlyCollapsed: boolean
		separation: "collapsed" | "low-separation" | "separated"
	}
}

export type PaletteRole00AuditEntry = {
	caseId: string
	order: number
	batch: number
	sampleTrack: SelectionTrack
	source: {
		file: string
		sha256: string
		bytes: number
		width: number
		height: number
	}
	normalized: { width: number; height: number }
	palette: PaletteRole00AuditPresentedPalette
}

export type PaletteRole00AuditManifest = {
	schemaVersion: 1
	auditVersion: typeof PALETTE_ROLE_00_AUDIT_VERSION
	presentationVersion: typeof PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION
	generatedAt: string
	algorithmVersion: typeof PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION
	manifestId: string
	batchSize: typeof PALETTE_ROLE_00_AUDIT_BATCH_SIZE
	totalBatches: typeof PALETTE_ROLE_00_AUDIT_BATCH_COUNT
	provenance: {
		canonicalHoldout: { rawSha256: string; semanticSha256: string }
		sourceSelection: { rawSha256: string; manifestId: string }
		implementation: Record<string, string>
		presentation: Record<string, string>
	}
	entries: PaletteRole00AuditEntry[]
}

export type PaletteRole00AuditManifestIdentity = Omit<PaletteRole00AuditManifest, "generatedAt" | "manifestId">

export type PaletteRole00AuditFeedbackEntry = {
	caseId: string
	sourceSha256: string
	skipReason: PaletteRole00AuditSkipReason | null
	overallQuality: PaletteRole00AuditOverallQuality | null
	comment: string
	submittedAt: string
}

export type PaletteRole00AuditFeedbackStore = {
	schemaVersion: 1
	auditVersion: typeof PALETTE_ROLE_00_AUDIT_VERSION
	manifestId: string
	entries: PaletteRole00AuditFeedbackEntry[]
}

const sha256Pattern = /^[a-f0-9]{64}$/
const hexPattern = /^#[a-f0-9]{6}$/

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected fields`)
	}
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && sha256Pattern.test(value)
}

function isTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0
}

function isFiniteNonnegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isUnitInterval(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
}

function isRGB(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (!isRecord(value)) return value
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function compareText(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function closeEnough(first: number, second: number): boolean {
	return Math.abs(first - second) <= Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 8
}

function parseHashRecord(
	value: unknown,
	expectedFiles: readonly string[],
	label: string,
): asserts value is Record<string, string> {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, expectedFiles, label)
	if (Object.values(value).some((hash) => !isSha256(hash))) throw new Error(`${label} is invalid`)
}

export function paletteRole00AuditCaseId(selectionManifestId: string, file: string, sourceSha256: string): string {
	return `pa00-${createHash("sha256").update(
		`${PALETTE_ROLE_00_AUDIT_VERSION}\0${selectionManifestId}\0${file}\0${sourceSha256}`,
	).digest("hex").slice(0, 20)}`
}

export function paletteRole00AuditOrderKey(selectionManifestId: string, file: string, sourceSha256: string): string {
	return createHash("sha256").update(
		`${PALETTE_ROLE_00_AUDIT_VERSION}\0order\0${selectionManifestId}\0${file}\0${sourceSha256}`,
	).digest("hex")
}

export function paletteRole00AuditSample(selection: SelectionManifest): SelectionCandidate[] {
	const sample = selectionTracks.flatMap((track) => {
		const candidates = selection.tracks[track]
		if (candidates.length < PALETTE_ROLE_00_AUDIT_TRACK_ENTRY_COUNT) {
			throw new Error(`Source selection cannot provide ${PALETTE_ROLE_00_AUDIT_TRACK_ENTRY_COUNT} ${track} audit cases`)
		}
		return Array.from({ length: PALETTE_ROLE_00_AUDIT_TRACK_ENTRY_COUNT }, (_, index) =>
			candidates[Math.floor((index + 0.5) * candidates.length / PALETTE_ROLE_00_AUDIT_TRACK_ENTRY_COUNT)])
	})
	if (sample.length !== PALETTE_ROLE_00_AUDIT_ENTRY_COUNT || new Set(sample.map((entry) => entry.file)).size !== sample.length) {
		throw new Error("Source selection cannot provide a unique 10 diversity, 10 risk, and 10 random audit cases")
	}
	return sample
}

export function paletteRole00AuditManifestId(identity: PaletteRole00AuditManifestIdentity): string {
	return createHash("sha256").update(JSON.stringify(canonicalValue(identity))).digest("hex")
}

export function paletteRole00AuditBackgroundSurface(
	background: RGB,
	surface: RGB,
): PaletteRole00AuditPresentedPalette["backgroundSurface"] {
	const exactlyCollapsed = background.every((channel, index) => channel === surface[index])
	const oklabDistance = okDistance(rgbToOKLab(background), rgbToOKLab(surface))
	const contrast = contrastRatio(background, surface)
	return {
		oklabDistance,
		contrast,
		exactlyCollapsed,
		separation: exactlyCollapsed ? "collapsed" : oklabDistance < 0.05 || contrast < 1.15 ? "low-separation" : "separated",
	}
}

function parsePresentedRole(value: unknown, label: string): PaletteRole00AuditPresentedRole {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["rgb", "hex", "generated", "sourceDistance", "colorName"], label)
	if (!isRGB(value.rgb) || typeof value.hex !== "string" || !hexPattern.test(value.hex) ||
		rgbToHex(value.rgb) !== value.hex || typeof value.generated !== "boolean" ||
		!isFiniteNonnegative(value.sourceDistance) || !isRecord(value.colorName)) {
		throw new Error(`${label} is invalid`)
	}
	exactKeys(value.colorName, ["nearestName", "referenceHex", "tier", "distance"], `${label} color name`)
	if (typeof value.colorName.nearestName !== "string" || value.colorName.nearestName.length === 0 ||
		typeof value.colorName.referenceHex !== "string" || !hexPattern.test(value.colorName.referenceHex) ||
		!(value.colorName.tier === "srgb" || value.colorName.tier === "p3" || value.colorName.tier === "rec2020") ||
		!isFiniteNonnegative(value.colorName.distance)) throw new Error(`${label} color name is invalid`)
	const expected = nameRGB(value.rgb)
	if (value.colorName.nearestName !== expected.nearestName ||
		value.colorName.referenceHex !== expected.nearest.referenceHex || value.colorName.tier !== expected.nearest.tier ||
		!closeEnough(value.colorName.distance, expected.nearest.distance)) {
		throw new Error(`${label} colornames-oklab presentation is stale`)
	}
	return value as unknown as PaletteRole00AuditPresentedRole
}

function parsePresentedPalette(value: unknown, label: string): PaletteRole00AuditPresentedPalette {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	exactKeys(value, ["roles", "gradient", "score", "metrics", "backgroundSurface"], label)
	if (!isRecord(value.roles)) throw new Error(`${label} roles are invalid`)
	const roleValues = value.roles
	exactKeys(roleValues, paletteRole00AuditRoles, `${label} roles`)
	const roles = Object.fromEntries(paletteRole00AuditRoles.map((role) => [
		role,
		parsePresentedRole(roleValues[role], `${label} ${role}`),
	])) as Record<RoleName, PaletteRole00AuditPresentedRole>
	if (!isRecord(value.gradient)) throw new Error(`${label} gradient is invalid`)
	exactKeys(value.gradient, ["isGradient", "confidence", "coverage", "continuity", "coherence"], `${label} gradient`)
	if (typeof value.gradient.isGradient !== "boolean" || !isUnitInterval(value.gradient.confidence) ||
		!isUnitInterval(value.gradient.coverage) || !isUnitInterval(value.gradient.continuity) ||
		!isUnitInterval(value.gradient.coherence)) throw new Error(`${label} gradient is invalid`)
	if (typeof value.score !== "number" || !Number.isFinite(value.score) || !isRecord(value.metrics)) {
		throw new Error(`${label} score or metrics are invalid`)
	}
	const metricNames = [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
		"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
	] as const
	exactKeys(value.metrics, metricNames, `${label} metrics`)
	for (const metric of metricNames) {
		if (!isFiniteNonnegative(value.metrics[metric])) throw new Error(`${label} metric ${metric} is invalid`)
	}
	if (!isRecord(value.backgroundSurface)) throw new Error(`${label} background/surface diagnostics are invalid`)
	exactKeys(value.backgroundSurface, ["oklabDistance", "contrast", "exactlyCollapsed", "separation"],
		`${label} background/surface diagnostics`)
	if (!isFiniteNonnegative(value.backgroundSurface.oklabDistance) ||
		!isFiniteNonnegative(value.backgroundSurface.contrast) ||
		typeof value.backgroundSurface.exactlyCollapsed !== "boolean" ||
		!(value.backgroundSurface.separation === "collapsed" || value.backgroundSurface.separation === "low-separation" ||
			value.backgroundSurface.separation === "separated")) {
		throw new Error(`${label} background/surface diagnostics are invalid`)
	}
	const expected = paletteRole00AuditBackgroundSurface(roles.background.rgb, roles.surface.rgb)
	if (!closeEnough(value.backgroundSurface.oklabDistance, expected.oklabDistance) ||
		!closeEnough(value.backgroundSurface.contrast, expected.contrast) ||
		value.backgroundSurface.exactlyCollapsed !== expected.exactlyCollapsed ||
		value.backgroundSurface.separation !== expected.separation) {
		throw new Error(`${label} background/surface diagnostics are stale`)
	}
	return value as unknown as PaletteRole00AuditPresentedPalette
}

export function parsePaletteRole00AuditManifest(value: unknown): PaletteRole00AuditManifest {
	if (!isRecord(value)) throw new Error("Palette role 00 audit manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "auditVersion", "presentationVersion", "generatedAt", "algorithmVersion", "manifestId",
		"batchSize", "totalBatches", "provenance", "entries",
	], "Palette role 00 audit manifest")
	if (value.schemaVersion !== 1 || value.auditVersion !== PALETTE_ROLE_00_AUDIT_VERSION ||
		value.presentationVersion !== PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION || !isTimestamp(value.generatedAt) ||
		value.algorithmVersion !== PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION || !isSha256(value.manifestId) ||
		value.batchSize !== PALETTE_ROLE_00_AUDIT_BATCH_SIZE || value.totalBatches !== PALETTE_ROLE_00_AUDIT_BATCH_COUNT ||
		!isRecord(value.provenance) || !Array.isArray(value.entries) ||
		value.entries.length !== PALETTE_ROLE_00_AUDIT_ENTRY_COUNT) {
		throw new Error("Palette role 00 audit manifest header is invalid")
	}
	exactKeys(value.provenance, ["canonicalHoldout", "sourceSelection", "implementation", "presentation"],
		"Palette role 00 audit provenance")
	if (!isRecord(value.provenance.canonicalHoldout) || !isRecord(value.provenance.sourceSelection)) {
		throw new Error("Palette role 00 audit artifact provenance is invalid")
	}
	exactKeys(value.provenance.canonicalHoldout, ["rawSha256", "semanticSha256"], "Canonical holdout provenance")
	exactKeys(value.provenance.sourceSelection, ["rawSha256", "manifestId"], "Source selection provenance")
	if (!isSha256(value.provenance.canonicalHoldout.rawSha256) ||
		!isSha256(value.provenance.canonicalHoldout.semanticSha256) ||
		!isSha256(value.provenance.sourceSelection.rawSha256) || !isSha256(value.provenance.sourceSelection.manifestId)) {
		throw new Error("Palette role 00 audit artifact provenance is invalid")
	}
	const selectionManifestId = value.provenance.sourceSelection.manifestId
	parseHashRecord(value.provenance.implementation, paletteRole00AuditImplementationFiles, "Implementation provenance")
	parseHashRecord(value.provenance.presentation, paletteRole00AuditPresentationFiles, "Presentation provenance")

	const files = new Set<string>()
	const caseIds = new Set<string>()
	const entries: PaletteRole00AuditEntry[] = []
	for (const [index, entryValue] of value.entries.entries()) {
		const label = `Palette role 00 audit entry ${index}`
		if (!isRecord(entryValue)) throw new Error(`${label} is invalid`)
		exactKeys(entryValue, ["caseId", "order", "batch", "sampleTrack", "source", "normalized", "palette"], label)
		if (typeof entryValue.caseId !== "string" || !/^pa00-[a-f0-9]{20}$/.test(entryValue.caseId) ||
			caseIds.has(entryValue.caseId) || entryValue.order !== index + 1 ||
			entryValue.batch !== Math.floor(index / PALETTE_ROLE_00_AUDIT_BATCH_SIZE) + 1 || !isRecord(entryValue.source) ||
			!selectionTracks.includes(entryValue.sampleTrack as SelectionTrack) ||
			!isRecord(entryValue.normalized)) throw new Error(`${label} identity, sample track, or batch is invalid`)
		exactKeys(entryValue.source, ["file", "sha256", "bytes", "width", "height"], `${label} source`)
		exactKeys(entryValue.normalized, ["width", "height"], `${label} normalized dimensions`)
		if (typeof entryValue.source.file !== "string" || !/^00\/[^/\\]+$/.test(entryValue.source.file) ||
			files.has(entryValue.source.file) || !isSha256(entryValue.source.sha256) ||
			!isPositiveInteger(entryValue.source.bytes) || !isPositiveInteger(entryValue.source.width) ||
			!isPositiveInteger(entryValue.source.height) || !isPositiveInteger(entryValue.normalized.width) ||
			!isPositiveInteger(entryValue.normalized.height)) throw new Error(`${label} source is invalid or duplicated`)
		const expectedCaseId = paletteRole00AuditCaseId(
			selectionManifestId,
			entryValue.source.file,
			entryValue.source.sha256,
		)
		if (entryValue.caseId !== expectedCaseId) throw new Error(`${label} case identity is stale`)
		parsePresentedPalette(entryValue.palette, `${label} palette`)
		files.add(entryValue.source.file)
		caseIds.add(entryValue.caseId)
		entries.push(entryValue as unknown as PaletteRole00AuditEntry)
	}
	const expectedOrder = [...entries].sort((first, second) => compareText(
		paletteRole00AuditOrderKey(selectionManifestId, first.source.file, first.source.sha256),
		paletteRole00AuditOrderKey(selectionManifestId, second.source.file, second.source.sha256),
	) || compareText(first.source.file, second.source.file))
	if (entries.some((entry, index) => entry.caseId !== expectedOrder[index].caseId)) {
		throw new Error("Palette role 00 audit order is not the deterministic shuffle")
	}
	const manifest = value as unknown as PaletteRole00AuditManifest
	const { generatedAt: _generatedAt, manifestId, ...identity } = manifest
	if (paletteRole00AuditManifestId(identity) !== manifestId) {
		throw new Error("Palette role 00 audit manifest identity is stale")
	}
	return manifest
}

export function validatePaletteRole00AuditSample(
	manifest: PaletteRole00AuditManifest,
	selection: SelectionManifest,
): void {
	const expected = new Map(paletteRole00AuditSample(selection).map((entry) => [entry.file, entry]))
	for (const entry of manifest.entries) {
		const selected = expected.get(entry.source.file)
		if (!selected || selected.sha256 !== entry.source.sha256 || selected.track !== entry.sampleTrack) {
			throw new Error(`Audit case is not part of the bound stratified sample: ${entry.source.file}`)
		}
		expected.delete(entry.source.file)
	}
	if (expected.size > 0) throw new Error("Audit manifest does not contain the complete bound stratified sample")
}

export function parsePaletteRole00AuditFeedbackEntry(
	value: unknown,
	manifest: PaletteRole00AuditManifest,
	stored: boolean,
): PaletteRole00AuditFeedbackEntry {
	if (!isRecord(value)) throw new Error("Palette role 00 audit feedback entry is invalid")
	exactKeys(value, stored
		? ["caseId", "sourceSha256", "skipReason", "overallQuality", "comment", "submittedAt"]
		: ["caseId", "sourceSha256", "skipReason", "overallQuality", "comment"],
	"Palette role 00 audit feedback entry")
	if (typeof value.caseId !== "string" || typeof value.comment !== "string" || value.comment.length > 4000) {
		throw new Error("Palette role 00 audit feedback entry is invalid")
	}
	const manifestEntry = manifest.entries.find((entry) => entry.caseId === value.caseId)
	if (!manifestEntry || value.sourceSha256 !== manifestEntry.source.sha256) {
		throw new Error("Palette role 00 audit feedback entry is stale")
	}
	const skipReason = typeof value.skipReason === "string" &&
		paletteRole00AuditSkipReasonValues.includes(value.skipReason as PaletteRole00AuditSkipReason)
		? value.skipReason as PaletteRole00AuditSkipReason
		: null
	const overallQuality = typeof value.overallQuality === "string" &&
		paletteRole00AuditOverallQualityValues.includes(value.overallQuality as PaletteRole00AuditOverallQuality)
		? value.overallQuality as PaletteRole00AuditOverallQuality
		: null
	if ((value.skipReason !== null && skipReason === null) || (value.overallQuality !== null && overallQuality === null) ||
		(skipReason === null) === (overallQuality === null)) {
		throw new Error("Choose exactly one whole-palette quality or skip reason")
	}
	if (stored && !isTimestamp(value.submittedAt)) throw new Error("Stored palette role 00 audit timestamp is invalid")
	return {
		caseId: manifestEntry.caseId,
		sourceSha256: manifestEntry.source.sha256,
		skipReason,
		overallQuality,
		comment: value.comment.trim(),
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

export function parsePaletteRole00AuditFeedbackStore(
	value: unknown,
	manifest: PaletteRole00AuditManifest,
): PaletteRole00AuditFeedbackStore {
	if (!isRecord(value)) throw new Error("Palette role 00 audit feedback store is invalid")
	exactKeys(value, ["schemaVersion", "auditVersion", "manifestId", "entries"], "Palette role 00 audit feedback store")
	if (value.schemaVersion !== 1 || value.auditVersion !== PALETTE_ROLE_00_AUDIT_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries) ||
		value.entries.length > manifest.entries.length) {
		throw new Error("Palette role 00 audit feedback store is stale or invalid")
	}
	const entries = value.entries.map((entry) => parsePaletteRole00AuditFeedbackEntry(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) {
		throw new Error("Palette role 00 audit feedback contains duplicate cases")
	}
	return {
		schemaVersion: 1,
		auditVersion: PALETTE_ROLE_00_AUDIT_VERSION,
		manifestId: manifest.manifestId,
		entries,
	}
}

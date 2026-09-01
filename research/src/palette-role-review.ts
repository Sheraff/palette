import { createHash } from "node:crypto"
import type { PaletteMetrics, RGB, RoleName } from "./types.ts"

export const PALETTE_ROLE_REVIEW_VERSION = "palette-role-counterexample-0.2.0-development"
export const PALETTE_ROLE_PRESENTATION_VERSION = "palette-role-counterexample-presentation-2"
export const paletteRoleNames = ["background", "foreground", "surface", "accent"] as const
export const sourceEligibilityValues = ["eligible-artwork", "not-album-artwork", "not-reviewable", "uncertain"] as const
export const paletteQualityValues = ["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"] as const
export const alternativeConclusionValues = [
	"current-at-least-as-good-as-shown",
	"shown-improvement",
	"better-direction-not-shown",
	"many-valid-no-ranking",
	"uncertain",
] as const
export const paletteFailureTagValues = [
	"background-unrepresentative",
	"surface-not-coherent",
	"background-surface-indistinguishable",
	"wrong-foreground",
	"wrong-accent",
	"inappropriate-collapse",
	"insufficient-role-separation",
	"inaccessible-contrast",
	"incomplete-artwork-identity",
	"unidentifiable-color",
	"gradient-treatment",
] as const

export type SourceEligibility = typeof sourceEligibilityValues[number]
export type PaletteQuality = typeof paletteQualityValues[number]
export type AlternativeConclusion = typeof alternativeConclusionValues[number]
export type PaletteFailureTag = typeof paletteFailureTagValues[number]

export type PresentedRole = {
	rgb: RGB
	hex: string
	nearestName: string
	generated: boolean
	sourceDistance: number
}

export type PresentedPalette = {
	roles: Record<RoleName, PresentedRole>
	gradient: { isGradient: boolean; confidence: number }
	metrics: PaletteMetrics
	backgroundSurface: { oklabDistance: number; contrast: number; collapsed: boolean }
}

export type PresentedAlternative = {
	id: string
	kind: "candidate-substitution" | "solver-direction"
	changedRoles: RoleName[]
	palette: PresentedPalette
}

export type PaletteRoleReviewEntry = {
	caseId: string
	source: {
		file: string
		sha256: string
		bytes: number
		width: number
		height: number
	}
	developmentContext: {
		priorEvidence: string
		targetRoles: RoleName[]
	}
	normalized: { width: number; height: number }
	current: PresentedPalette
	alternatives: PresentedAlternative[]
}

export type PaletteRoleReviewManifest = {
	schemaVersion: 2
	reviewVersion: typeof PALETTE_ROLE_REVIEW_VERSION
	presentationVersion: typeof PALETTE_ROLE_PRESENTATION_VERSION
	generatedAt: string
	algorithmVersion: string
	manifestId: string
	provenance: {
		sourceSelectionSha256: string
		absoluteFeedbackSha256: string
		implementation: Record<string, string>
		presentation: Record<string, string>
	}
	entries: PaletteRoleReviewEntry[]
}

export type PaletteRoleFeedbackEntry = {
	caseId: string
	sourceSha256: string
	sourceEligibility: SourceEligibility
	currentQuality: PaletteQuality | null
	alternativeConclusion: AlternativeConclusion | null
	improvedAlternativeIds: string[]
	failureTags: PaletteFailureTag[]
	note: string
	submittedAt: string
}

export type PaletteRoleFeedbackStore = {
	schemaVersion: 2
	reviewVersion: typeof PALETTE_ROLE_REVIEW_VERSION
	manifestId: string
	entries: PaletteRoleFeedbackEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function isRGB(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function assertStringRecord(value: unknown, label: string): asserts value is Record<string, string> {
	if (!isRecord(value) || Object.values(value).some((item) => !isSha256(item))) throw new Error(`${label} is invalid`)
}

export function paletteRoleManifestId(manifest: Omit<PaletteRoleReviewManifest, "manifestId" | "generatedAt">): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}

function parseRole(value: unknown, label: string): PresentedRole {
	if (!isRecord(value) || !isRGB(value.rgb) || typeof value.hex !== "string" || !/^#[a-f0-9]{6}$/.test(value.hex) ||
		typeof value.nearestName !== "string" || typeof value.generated !== "boolean" ||
		typeof value.sourceDistance !== "number" || !Number.isFinite(value.sourceDistance)) {
		throw new Error(`${label} is invalid`)
	}
	return value as unknown as PresentedRole
}

function parsePresentedPalette(value: unknown, label: string): PresentedPalette {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.gradient) || !isRecord(value.metrics) ||
		!isRecord(value.backgroundSurface) || typeof value.gradient.isGradient !== "boolean" ||
		typeof value.gradient.confidence !== "number" || !Number.isFinite(value.gradient.confidence)) {
		throw new Error(`${label} is invalid`)
	}
	for (const role of paletteRoleNames) parseRole(value.roles[role], `${label} ${role}`)
	for (const metric of [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
		"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
	] as const) {
		if (typeof value.metrics[metric] !== "number" || !Number.isFinite(value.metrics[metric])) {
			throw new Error(`${label} metric ${metric} is invalid`)
		}
	}
	if (typeof value.backgroundSurface.oklabDistance !== "number" ||
		typeof value.backgroundSurface.contrast !== "number" || typeof value.backgroundSurface.collapsed !== "boolean") {
		throw new Error(`${label} pair diagnostics are invalid`)
	}
	return value as unknown as PresentedPalette
}

export function parsePaletteRoleManifest(value: unknown): PaletteRoleReviewManifest {
	if (!isRecord(value) || value.schemaVersion !== 2 || value.reviewVersion !== PALETTE_ROLE_REVIEW_VERSION ||
		value.presentationVersion !== PALETTE_ROLE_PRESENTATION_VERSION || typeof value.generatedAt !== "string" ||
		!Number.isFinite(Date.parse(value.generatedAt)) || typeof value.algorithmVersion !== "string" ||
		!isSha256(value.manifestId) || !isRecord(value.provenance) || !Array.isArray(value.entries) ||
		value.entries.length < 4 || value.entries.length > 10) {
		throw new Error("Palette counterexample review manifest header is invalid")
	}
	if (!isSha256(value.provenance.sourceSelectionSha256) || !isSha256(value.provenance.absoluteFeedbackSha256)) {
		throw new Error("Palette counterexample provenance is invalid")
	}
	assertStringRecord(value.provenance.implementation, "Implementation provenance")
	assertStringRecord(value.provenance.presentation, "Presentation provenance")
	const caseIds = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue) || typeof entryValue.caseId !== "string" || !/^pr-[a-f0-9]{20}$/.test(entryValue.caseId) ||
			caseIds.has(entryValue.caseId) || !isRecord(entryValue.source) || !isSha256(entryValue.source.sha256) ||
			typeof entryValue.source.file !== "string" || entryValue.source.file.includes("..") ||
			!Number.isInteger(entryValue.source.bytes) || !Number.isInteger(entryValue.source.width) ||
			!Number.isInteger(entryValue.source.height) || !isRecord(entryValue.developmentContext) ||
			!Array.isArray(entryValue.developmentContext.targetRoles) ||
			entryValue.developmentContext.targetRoles.some((role) => !paletteRoleNames.includes(role as RoleName)) ||
			!isRecord(entryValue.normalized) || !Array.isArray(entryValue.alternatives) ||
			entryValue.alternatives.length < 1 || entryValue.alternatives.length > 6) {
			throw new Error(`Palette counterexample entry ${index} is invalid`)
		}
		parsePresentedPalette(entryValue.current, `Entry ${index} current palette`)
		const alternativeIds = new Set<string>()
		for (const [alternativeIndex, alternativeValue] of entryValue.alternatives.entries()) {
			if (!isRecord(alternativeValue) || typeof alternativeValue.id !== "string" || !/^A\d{2}$/.test(alternativeValue.id) ||
				alternativeIds.has(alternativeValue.id) ||
				(alternativeValue.kind !== "candidate-substitution" && alternativeValue.kind !== "solver-direction") ||
				!Array.isArray(alternativeValue.changedRoles) || alternativeValue.changedRoles.length === 0 ||
				alternativeValue.changedRoles.some((role) => !paletteRoleNames.includes(role as RoleName))) {
				throw new Error(`Entry ${index} alternative ${alternativeIndex} is invalid`)
			}
			parsePresentedPalette(alternativeValue.palette, `Entry ${index} alternative ${alternativeIndex}`)
			alternativeIds.add(alternativeValue.id)
		}
		caseIds.add(entryValue.caseId)
	}
	const manifest = value as unknown as PaletteRoleReviewManifest
	const { manifestId, generatedAt: _generatedAt, ...identity } = manifest
	if (paletteRoleManifestId(identity) !== manifestId) throw new Error("Palette counterexample review manifest identity is stale")
	return manifest
}

export function parsePaletteRoleFeedbackEntry(
	value: unknown,
	manifest: PaletteRoleReviewManifest,
	stored: boolean,
): PaletteRoleFeedbackEntry {
	if (!isRecord(value) || typeof value.caseId !== "string") throw new Error("Feedback entry is invalid")
	const entry = manifest.entries.find((candidate) => candidate.caseId === value.caseId)
	if (!entry || value.sourceSha256 !== entry.source.sha256 || typeof value.sourceEligibility !== "string" ||
		!sourceEligibilityValues.includes(value.sourceEligibility as SourceEligibility) || typeof value.note !== "string" ||
		value.note.length > 2000 || !Array.isArray(value.failureTags) ||
		value.failureTags.some((tag) => typeof tag !== "string" || !paletteFailureTagValues.includes(tag as PaletteFailureTag)) ||
		new Set(value.failureTags).size !== value.failureTags.length || !Array.isArray(value.improvedAlternativeIds) ||
		value.improvedAlternativeIds.some((id) => typeof id !== "string") ||
		new Set(value.improvedAlternativeIds).size !== value.improvedAlternativeIds.length) {
		throw new Error("Feedback entry is invalid or stale")
	}
	const eligible = value.sourceEligibility === "eligible-artwork"
	let currentQuality: PaletteQuality | null = null
	let alternativeConclusion: AlternativeConclusion | null = null
	let improvedAlternativeIds: string[] = []
	if (eligible) {
		if (typeof value.currentQuality !== "string" || !paletteQualityValues.includes(value.currentQuality as PaletteQuality) ||
			typeof value.alternativeConclusion !== "string" ||
			!alternativeConclusionValues.includes(value.alternativeConclusion as AlternativeConclusion)) {
			throw new Error("Eligible artwork requires quality and alternative conclusions")
		}
		currentQuality = value.currentQuality as PaletteQuality
		alternativeConclusion = value.alternativeConclusion as AlternativeConclusion
		const knownAlternatives = new Set(entry.alternatives.map((alternative) => alternative.id))
		if (value.improvedAlternativeIds.some((id) => !knownAlternatives.has(id))) throw new Error("Unknown improved alternative")
		improvedAlternativeIds = value.improvedAlternativeIds as string[]
		if (alternativeConclusion === "shown-improvement" && improvedAlternativeIds.length === 0) {
			throw new Error("Mark at least one shown improvement")
		}
		if (alternativeConclusion !== "shown-improvement" && improvedAlternativeIds.length > 0) {
			throw new Error("Marked improvements require the shown-improvement conclusion")
		}
	} else if (value.currentQuality !== null || value.alternativeConclusion !== null ||
		value.improvedAlternativeIds.length > 0 || value.failureTags.length > 0) {
		throw new Error("Ineligible sources cannot have palette judgments")
	}
	if (stored && (typeof value.submittedAt !== "string" || !Number.isFinite(Date.parse(value.submittedAt)))) {
		throw new Error("Stored feedback timestamp is invalid")
	}
	return {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: value.sourceEligibility as SourceEligibility,
		currentQuality,
		alternativeConclusion,
		improvedAlternativeIds,
		failureTags: value.failureTags as PaletteFailureTag[],
		note: value.note.trim(),
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

export function parsePaletteRoleFeedbackStore(value: unknown, manifest: PaletteRoleReviewManifest): PaletteRoleFeedbackStore {
	if (!isRecord(value) || value.schemaVersion !== 2 || value.reviewVersion !== PALETTE_ROLE_REVIEW_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new Error("Palette counterexample feedback store is stale or invalid")
	}
	const entries = value.entries.map((entry) => parsePaletteRoleFeedbackEntry(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) throw new Error("Feedback contains duplicate cases")
	return { schemaVersion: 2, reviewVersion: PALETTE_ROLE_REVIEW_VERSION, manifestId: manifest.manifestId, entries }
}

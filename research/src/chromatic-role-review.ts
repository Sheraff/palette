import { createHash } from "node:crypto"
import type { PaletteMetrics, RGB, RoleName } from "./types.ts"

export const CHROMATIC_ROLE_REVIEW_VERSION = "chromatic-role-review-0.1.0"
export const CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION = "chromatic-role-review-presentation-1"
export const chromaticRoleReviewRoles = ["background", "foreground", "surface", "accent"] as const
export const chromaticRoleReviewEligibility = ["eligible-artwork", "not-album-artwork", "not-reviewable", "uncertain"] as const
export const chromaticRoleReviewQualities = ["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"] as const
export const chromaticRoleReviewPreferences = ["a-stronger", "b-stronger", "both-similarly-valid", "neither-acceptable", "uncertain"] as const
export const chromaticRoleReviewFailureTags = [
	"wrong-background",
	"wrong-foreground",
	"wrong-surface",
	"wrong-accent",
	"insufficient-artwork-identity",
	"inaccessible-contrast",
	"gradient-treatment",
] as const

export type ChromaticRoleReviewEligibility = typeof chromaticRoleReviewEligibility[number]
export type ChromaticRoleReviewQuality = typeof chromaticRoleReviewQualities[number]
export type ChromaticRoleReviewPreference = typeof chromaticRoleReviewPreferences[number]
export type ChromaticRoleReviewFailureTag = typeof chromaticRoleReviewFailureTags[number]
export type ChromaticRoleReviewOptionId = "A" | "B"

export type ChromaticRolePresentedPalette = {
	roles: Record<RoleName, {
		rgb: RGB
		hex: string
		nearestName: string
		generated: boolean
		sourceDistance: number
	}>
	gradient: { isGradient: boolean; confidence: number }
	metrics: PaletteMetrics
}

export type ChromaticRoleReviewEntry = {
	caseId: string
	cohort: "accepted" | "rejected-target" | "unselected-holdout" | "reserve-validation"
	source: {
		file: string
		sha256: string
		bytes: number
		width: number
		height: number
	}
	normalized: { width: number; height: number }
	changedRoles: RoleName[]
	options: Record<ChromaticRoleReviewOptionId, ChromaticRolePresentedPalette>
	assignment: Record<ChromaticRoleReviewOptionId, "baseline" | "candidate">
}

export type ChromaticRoleReviewManifest = {
	schemaVersion: 1
	reviewVersion: typeof CHROMATIC_ROLE_REVIEW_VERSION
	presentationVersion: typeof CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION
	generatedAt: string
	manifestId: string
	baselineAlgorithmVersion: string
	candidateAlgorithmVersion: string
	provenance: {
		sourceSelectionSha256: string
		baselineHoldoutSha256: string
		candidateHoldoutSha256: string
		implementation: Record<string, string>
		presentation: Record<string, string>
	}
	entries: ChromaticRoleReviewEntry[]
}

export type ChromaticRoleReviewFeedbackEntry = {
	caseId: string
	sourceSha256: string
	sourceEligibility: ChromaticRoleReviewEligibility
	qualityA: ChromaticRoleReviewQuality | null
	qualityB: ChromaticRoleReviewQuality | null
	preference: ChromaticRoleReviewPreference | null
	failureTagsA: ChromaticRoleReviewFailureTag[]
	failureTagsB: ChromaticRoleReviewFailureTag[]
	note: string
	submittedAt: string
}

export type ChromaticRoleReviewFeedbackStore = {
	schemaVersion: 1
	reviewVersion: typeof CHROMATIC_ROLE_REVIEW_VERSION
	manifestId: string
	entries: ChromaticRoleReviewFeedbackEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function isRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function assertHashRecord(value: unknown, label: string): asserts value is Record<string, string> {
	if (!isRecord(value) || Object.values(value).some((item) => !isSha256(item))) throw new Error(`${label} is invalid`)
}

function parsePalette(value: unknown, label: string): ChromaticRolePresentedPalette {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.gradient) || !isRecord(value.metrics) ||
		typeof value.gradient.isGradient !== "boolean" || typeof value.gradient.confidence !== "number" ||
		!Number.isFinite(value.gradient.confidence)) throw new Error(`${label} is invalid`)
	for (const role of chromaticRoleReviewRoles) {
		const color = value.roles[role]
		if (!isRecord(color) || !isRgb(color.rgb) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) ||
			typeof color.nearestName !== "string" || typeof color.generated !== "boolean" ||
			typeof color.sourceDistance !== "number" || !Number.isFinite(color.sourceDistance)) {
			throw new Error(`${label} ${role} is invalid`)
		}
	}
	for (const metric of [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
		"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
	] as const) {
		if (typeof value.metrics[metric] !== "number" || !Number.isFinite(value.metrics[metric])) {
			throw new Error(`${label} metric ${metric} is invalid`)
		}
	}
	return value as unknown as ChromaticRolePresentedPalette
}

export function chromaticRoleReviewManifestId(
	manifest: Omit<ChromaticRoleReviewManifest, "generatedAt" | "manifestId">,
): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}

export function parseChromaticRoleReviewManifest(value: unknown): ChromaticRoleReviewManifest {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.reviewVersion !== CHROMATIC_ROLE_REVIEW_VERSION ||
		value.presentationVersion !== CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION || !validTimestamp(value.generatedAt) ||
		!isSha256(value.manifestId) || typeof value.baselineAlgorithmVersion !== "string" ||
		typeof value.candidateAlgorithmVersion !== "string" || !isRecord(value.provenance) ||
		!Array.isArray(value.entries) || value.entries.length < 4 || value.entries.length > 40) {
		throw new Error("Chromatic role review manifest header is invalid")
	}
	if (!isSha256(value.provenance.sourceSelectionSha256) || !isSha256(value.provenance.baselineHoldoutSha256) ||
		!isSha256(value.provenance.candidateHoldoutSha256)) throw new Error("Chromatic role review provenance is invalid")
	assertHashRecord(value.provenance.implementation, "Implementation provenance")
	assertHashRecord(value.provenance.presentation, "Presentation provenance")
	const caseIds = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue) || typeof entryValue.caseId !== "string" || !/^cr-[a-f0-9]{20}$/.test(entryValue.caseId) ||
			caseIds.has(entryValue.caseId) || !(["accepted", "rejected-target", "unselected-holdout", "reserve-validation"] as unknown[])
				.includes(entryValue.cohort) ||
			!isRecord(entryValue.source) || typeof entryValue.source.file !== "string" || entryValue.source.file.includes("..") ||
			!isSha256(entryValue.source.sha256) || !Number.isInteger(entryValue.source.bytes) ||
			!Number.isInteger(entryValue.source.width) || !Number.isInteger(entryValue.source.height) ||
			!isRecord(entryValue.normalized) || !Number.isInteger(entryValue.normalized.width) ||
			!Number.isInteger(entryValue.normalized.height) || !Array.isArray(entryValue.changedRoles) ||
			(entryValue.changedRoles.length === 0 && entryValue.cohort !== "reserve-validation") || entryValue.changedRoles.some((role) =>
				!chromaticRoleReviewRoles.includes(role as RoleName)) || !isRecord(entryValue.options) ||
			!isRecord(entryValue.assignment)) throw new Error(`Chromatic role review entry ${index} is invalid`)
		parsePalette(entryValue.options.A, `Entry ${index} option A`)
		parsePalette(entryValue.options.B, `Entry ${index} option B`)
		const assignments = [entryValue.assignment.A, entryValue.assignment.B]
		if (!assignments.includes("baseline") || !assignments.includes("candidate") || assignments[0] === assignments[1]) {
			throw new Error(`Chromatic role review entry ${index} assignment is invalid`)
		}
		caseIds.add(entryValue.caseId)
	}
	const manifest = value as unknown as ChromaticRoleReviewManifest
	const { generatedAt: _generatedAt, manifestId, ...identity } = manifest
	if (chromaticRoleReviewManifestId(identity) !== manifestId) throw new Error("Chromatic role review manifest identity is stale")
	return manifest
}

function parseFailureTags(value: unknown, label: string): ChromaticRoleReviewFailureTag[] {
	if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string" ||
		!chromaticRoleReviewFailureTags.includes(tag as ChromaticRoleReviewFailureTag)) || new Set(value).size !== value.length) {
		throw new Error(`${label} is invalid`)
	}
	return value as ChromaticRoleReviewFailureTag[]
}

export function parseChromaticRoleReviewFeedbackEntry(
	value: unknown,
	manifest: ChromaticRoleReviewManifest,
	stored: boolean,
): ChromaticRoleReviewFeedbackEntry {
	if (!isRecord(value) || typeof value.caseId !== "string") throw new Error("Chromatic role feedback entry is invalid")
	const entry = manifest.entries.find((candidate) => candidate.caseId === value.caseId)
	if (!entry || value.sourceSha256 !== entry.source.sha256 || typeof value.sourceEligibility !== "string" ||
		!chromaticRoleReviewEligibility.includes(value.sourceEligibility as ChromaticRoleReviewEligibility) ||
		typeof value.note !== "string" || value.note.length > 2000) {
		throw new Error("Chromatic role feedback entry is invalid or stale")
	}
	const failureTagsA = parseFailureTags(value.failureTagsA, "Option A failure tags")
	const failureTagsB = parseFailureTags(value.failureTagsB, "Option B failure tags")
	const eligible = value.sourceEligibility === "eligible-artwork"
	let qualityA: ChromaticRoleReviewQuality | null = null
	let qualityB: ChromaticRoleReviewQuality | null = null
	let preference: ChromaticRoleReviewPreference | null = null
	if (eligible) {
		if (typeof value.qualityA !== "string" || !chromaticRoleReviewQualities.includes(value.qualityA as ChromaticRoleReviewQuality) ||
			typeof value.qualityB !== "string" || !chromaticRoleReviewQualities.includes(value.qualityB as ChromaticRoleReviewQuality) ||
			typeof value.preference !== "string" ||
			!chromaticRoleReviewPreferences.includes(value.preference as ChromaticRoleReviewPreference)) {
			throw new Error("Eligible artwork requires both quality ratings and a comparison")
		}
		qualityA = value.qualityA as ChromaticRoleReviewQuality
		qualityB = value.qualityB as ChromaticRoleReviewQuality
		preference = value.preference as ChromaticRoleReviewPreference
	} else if (value.qualityA !== null || value.qualityB !== null || value.preference !== null ||
		failureTagsA.length > 0 || failureTagsB.length > 0) {
		throw new Error("Ineligible sources cannot have palette judgments")
	}
	if (stored && !validTimestamp(value.submittedAt)) throw new Error("Stored chromatic role feedback timestamp is invalid")
	return {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: value.sourceEligibility as ChromaticRoleReviewEligibility,
		qualityA,
		qualityB,
		preference,
		failureTagsA,
		failureTagsB,
		note: value.note.trim(),
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

export function parseChromaticRoleReviewFeedbackStore(
	value: unknown,
	manifest: ChromaticRoleReviewManifest,
): ChromaticRoleReviewFeedbackStore {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.reviewVersion !== CHROMATIC_ROLE_REVIEW_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new Error("Chromatic role feedback store is stale or invalid")
	}
	const entries = value.entries.map((entry) => parseChromaticRoleReviewFeedbackEntry(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) {
		throw new Error("Chromatic role feedback contains duplicate cases")
	}
	return { schemaVersion: 1, reviewVersion: CHROMATIC_ROLE_REVIEW_VERSION, manifestId: manifest.manifestId, entries }
}

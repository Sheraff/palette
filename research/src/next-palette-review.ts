import { createHash } from "node:crypto"
import type { PaletteMetrics, RGB, RoleName } from "./types.ts"

export const NEXT_PALETTE_REVIEW_VERSION = "next-palette-review-0.1.1"
export const NEXT_PALETTE_REVIEW_PRESENTATION_VERSION = "next-palette-review-presentation-1"
export const nextPaletteReviewRoles = ["background", "foreground", "surface", "accent"] as const
export const nextPaletteReviewEligibility = ["eligible-artwork", "not-album-artwork", "not-reviewable", "uncertain"] as const
export const nextPaletteReviewQualities = ["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"] as const
export const nextPaletteReviewPreferences = ["a-stronger", "b-stronger", "both-similarly-valid", "neither-acceptable", "uncertain"] as const
export const nextPaletteReviewFailureClasses = [
	"availability",
	"feasibility",
	"ranking",
	"role-semantics",
	"endpoint",
	"gradient",
] as const

export type NextPaletteReviewEligibility = typeof nextPaletteReviewEligibility[number]
export type NextPaletteReviewQuality = typeof nextPaletteReviewQualities[number]
export type NextPaletteReviewPreference = typeof nextPaletteReviewPreferences[number]
export type NextPaletteReviewFailureClass = typeof nextPaletteReviewFailureClasses[number]
export type NextPaletteReviewOptionId = "A" | "B"

export type NextPalettePresentedPalette = {
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

export type NextPaletteReviewEntry = {
	caseId: string
	order: number
	cohort: "reviewable-development" | "curated-00"
	currentEvidenceClassification: "accepted" | "rejected" | "conflicted" | "unknown"
	frontierSignature: string
	source: {
		file: string
		sha256: string
		bytes: number
		width: number
		height: number
	}
	changedRoles: RoleName[]
	gradientChanged: boolean
	options: Record<NextPaletteReviewOptionId, NextPalettePresentedPalette>
	assignment: Record<NextPaletteReviewOptionId, "baseline" | "candidate">
}

export type NextPaletteReviewManifest = {
	schemaVersion: 1
	reviewVersion: typeof NEXT_PALETTE_REVIEW_VERSION
	presentationVersion: typeof NEXT_PALETTE_REVIEW_PRESENTATION_VERSION
	generatedAt: string
	manifestId: string
	experimentId: string
	baselineAlgorithmVersion: string
	candidateAlgorithmVersion: string
	batch: { index: number; size: number; totalBatches: number; totalCases: number }
	provenance: {
		experiment: Record<string, string>
		implementation: Record<string, string>
		presentation: Record<string, string>
	}
	entries: NextPaletteReviewEntry[]
}

export type NextPaletteReviewFeedbackEntry = {
	caseId: string
	sourceSha256: string
	sourceEligibility: NextPaletteReviewEligibility
	qualityA: NextPaletteReviewQuality | null
	qualityB: NextPaletteReviewQuality | null
	preference: NextPaletteReviewPreference | null
	failureClassesA: NextPaletteReviewFailureClass[]
	failureClassesB: NextPaletteReviewFailureClass[]
	note: string
	submittedAt: string
}

export type NextPaletteReviewFeedbackStore = {
	schemaVersion: 1
	reviewVersion: typeof NEXT_PALETTE_REVIEW_VERSION
	manifestId: string
	entries: NextPaletteReviewFeedbackEntry[]
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
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const keys = Object.keys(value).sort()
	const sortedExpected = [...expected].sort()
	if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) {
		throw new Error(`${label} fields are invalid`)
	}
}

function assertHashRecord(value: unknown, label: string): asserts value is Record<string, string> {
	if (!isRecord(value) || Object.keys(value).length === 0 || Object.values(value).some((item) => !isSha256(item))) {
		throw new Error(`${label} is invalid`)
	}
}

function parsePalette(value: unknown, label: string): NextPalettePresentedPalette {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.gradient) || !isRecord(value.metrics) ||
		typeof value.gradient.isGradient !== "boolean" || typeof value.gradient.confidence !== "number" ||
		!Number.isFinite(value.gradient.confidence)) throw new Error(`${label} is invalid`)
	for (const role of nextPaletteReviewRoles) {
		const color = value.roles[role]
		if (!isRecord(color) || !isRgb(color.rgb) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) ||
			typeof color.nearestName !== "string" || color.nearestName.length === 0 || typeof color.generated !== "boolean" ||
			typeof color.sourceDistance !== "number" || !Number.isFinite(color.sourceDistance) || color.sourceDistance < 0) {
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
	return value as unknown as NextPalettePresentedPalette
}

export function nextPaletteReviewManifestId(
	manifest: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId">,
): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}

export function parseNextPaletteReviewManifest(value: unknown): NextPaletteReviewManifest {
	if (!isRecord(value)) throw new Error("Next palette review manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "reviewVersion", "presentationVersion", "generatedAt", "manifestId", "experimentId",
		"baselineAlgorithmVersion", "candidateAlgorithmVersion", "batch", "provenance", "entries",
	], "Next palette review manifest")
	if (value.schemaVersion !== 1 || value.reviewVersion !== NEXT_PALETTE_REVIEW_VERSION ||
		value.presentationVersion !== NEXT_PALETTE_REVIEW_PRESENTATION_VERSION || !validTimestamp(value.generatedAt) ||
		!isSha256(value.manifestId) || !isSha256(value.experimentId) || typeof value.baselineAlgorithmVersion !== "string" ||
		typeof value.candidateAlgorithmVersion !== "string" || !isRecord(value.batch) || !isRecord(value.provenance) ||
		!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 40) {
		throw new Error("Next palette review manifest header is invalid")
	}
	exactKeys(value.batch, ["index", "size", "totalBatches", "totalCases"], "Next palette review batch")
	if (!Number.isInteger(value.batch.index) || (value.batch.index as number) < 1 ||
		!Number.isInteger(value.batch.size) || value.batch.size !== value.entries.length ||
		!Number.isInteger(value.batch.totalBatches) || (value.batch.totalBatches as number) < 1 ||
		!Number.isInteger(value.batch.totalCases) || (value.batch.totalCases as number) < value.entries.length) {
		throw new Error("Next palette review batch is invalid")
	}
	exactKeys(value.provenance, ["experiment", "implementation", "presentation"], "Next palette review provenance")
	assertHashRecord(value.provenance.experiment, "Experiment provenance")
	assertHashRecord(value.provenance.implementation, "Implementation provenance")
	assertHashRecord(value.provenance.presentation, "Presentation provenance")
	const caseIds = new Set<string>()
	const orders = new Set<number>()
	for (const [index, entryValue] of value.entries.entries()) {
		if (!isRecord(entryValue) || typeof entryValue.caseId !== "string" || !/^npr-[a-f0-9]{20}$/.test(entryValue.caseId) ||
			caseIds.has(entryValue.caseId) || !Number.isInteger(entryValue.order) || orders.has(entryValue.order as number) ||
			!(entryValue.cohort === "reviewable-development" || entryValue.cohort === "curated-00") ||
			!(entryValue.currentEvidenceClassification === "accepted" || entryValue.currentEvidenceClassification === "rejected" ||
				entryValue.currentEvidenceClassification === "conflicted" || entryValue.currentEvidenceClassification === "unknown") ||
			typeof entryValue.frontierSignature !== "string" || entryValue.frontierSignature.length === 0 ||
			!isRecord(entryValue.source) || typeof entryValue.source.file !== "string" ||
			!(/^(?:images|00)\/[^/\\]+$/.test(entryValue.source.file)) || !isSha256(entryValue.source.sha256) ||
			!Number.isInteger(entryValue.source.bytes) || (entryValue.source.bytes as number) <= 0 ||
			!Number.isInteger(entryValue.source.width) || (entryValue.source.width as number) <= 0 ||
			!Number.isInteger(entryValue.source.height) || (entryValue.source.height as number) <= 0 ||
			!Array.isArray(entryValue.changedRoles) || entryValue.changedRoles.some((role) =>
				!nextPaletteReviewRoles.includes(role as RoleName)) || new Set(entryValue.changedRoles).size !== entryValue.changedRoles.length ||
			typeof entryValue.gradientChanged !== "boolean" ||
			(entryValue.changedRoles.length === 0 && !entryValue.gradientChanged) || !isRecord(entryValue.options) ||
			!isRecord(entryValue.assignment)) throw new Error(`Next palette review entry ${index} is invalid`)
		parsePalette(entryValue.options.A, `Entry ${index} option A`)
		parsePalette(entryValue.options.B, `Entry ${index} option B`)
		const assignments = [entryValue.assignment.A, entryValue.assignment.B]
		if (!assignments.includes("baseline") || !assignments.includes("candidate") || assignments[0] === assignments[1]) {
			throw new Error(`Next palette review entry ${index} assignment is invalid`)
		}
		caseIds.add(entryValue.caseId)
		orders.add(entryValue.order as number)
	}
	const manifest = value as unknown as NextPaletteReviewManifest
	const { generatedAt: _generatedAt, manifestId, ...identity } = manifest
	if (nextPaletteReviewManifestId(identity) !== manifestId) throw new Error("Next palette review manifest identity is stale")
	return manifest
}

function parseFailureClasses(value: unknown, label: string): NextPaletteReviewFailureClass[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" ||
		!nextPaletteReviewFailureClasses.includes(item as NextPaletteReviewFailureClass)) || new Set(value).size !== value.length) {
		throw new Error(`${label} is invalid`)
	}
	return value as NextPaletteReviewFailureClass[]
}

export function parseNextPaletteReviewFeedbackEntry(
	value: unknown,
	manifest: NextPaletteReviewManifest,
	stored: boolean,
): NextPaletteReviewFeedbackEntry {
	if (!isRecord(value) || typeof value.caseId !== "string") throw new Error("Next palette feedback entry is invalid")
	const entry = manifest.entries.find((candidate) => candidate.caseId === value.caseId)
	if (!entry || value.sourceSha256 !== entry.source.sha256 || typeof value.sourceEligibility !== "string" ||
		!nextPaletteReviewEligibility.includes(value.sourceEligibility as NextPaletteReviewEligibility) ||
		typeof value.note !== "string" || value.note.length > 2000) {
		throw new Error("Next palette feedback entry is invalid or stale")
	}
	const failureClassesA = parseFailureClasses(value.failureClassesA, "Option A failure classes")
	const failureClassesB = parseFailureClasses(value.failureClassesB, "Option B failure classes")
	const eligible = value.sourceEligibility === "eligible-artwork"
	let qualityA: NextPaletteReviewQuality | null = null
	let qualityB: NextPaletteReviewQuality | null = null
	let preference: NextPaletteReviewPreference | null = null
	if (eligible) {
		if (typeof value.qualityA !== "string" || !nextPaletteReviewQualities.includes(value.qualityA as NextPaletteReviewQuality) ||
			typeof value.qualityB !== "string" || !nextPaletteReviewQualities.includes(value.qualityB as NextPaletteReviewQuality) ||
			typeof value.preference !== "string" ||
			!nextPaletteReviewPreferences.includes(value.preference as NextPaletteReviewPreference)) {
			throw new Error("Eligible artwork requires both quality ratings and a comparison")
		}
		qualityA = value.qualityA as NextPaletteReviewQuality
		qualityB = value.qualityB as NextPaletteReviewQuality
		preference = value.preference as NextPaletteReviewPreference
	} else if (value.qualityA !== null || value.qualityB !== null || value.preference !== null ||
		failureClassesA.length > 0 || failureClassesB.length > 0) {
		throw new Error("Ineligible sources cannot have palette judgments")
	}
	if (stored && !validTimestamp(value.submittedAt)) throw new Error("Stored next palette feedback timestamp is invalid")
	return {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: value.sourceEligibility as NextPaletteReviewEligibility,
		qualityA,
		qualityB,
		preference,
		failureClassesA,
		failureClassesB,
		note: value.note.trim(),
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

export function parseNextPaletteReviewFeedbackStore(
	value: unknown,
	manifest: NextPaletteReviewManifest,
): NextPaletteReviewFeedbackStore {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.reviewVersion !== NEXT_PALETTE_REVIEW_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new Error("Next palette feedback store is stale or invalid")
	}
	const entries = value.entries.map((entry) => parseNextPaletteReviewFeedbackEntry(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) {
		throw new Error("Next palette feedback contains duplicate cases")
	}
	return { schemaVersion: 1, reviewVersion: NEXT_PALETTE_REVIEW_VERSION, manifestId: manifest.manifestId, entries }
}

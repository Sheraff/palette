import { createHash } from "node:crypto"
import type { PaletteMetrics, RGB, RoleName } from "./types.ts"

export const NATIVE_COMPLETE_PALETTE_REVIEW_VERSION = "native-complete-palette-review-v1" as const
export const NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION =
	"native-complete-palette-review-presentation-v1" as const
export const NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE = "native-complete-palette-0.2.5-development" as const
export const NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE = "region-graph-0.19.0" as const
export const nativeCompletePaletteReviewRoles = ["background", "foreground", "surface", "accent"] as const
export const nativeCompletePaletteReviewEligibility = [
	"eligible-artwork", "not-album-artwork", "not-reviewable", "uncertain",
] as const
export const nativeCompletePaletteReviewQualities = [
	"strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain",
] as const
export const nativeCompletePaletteReviewPreferences = [
	"a-stronger", "b-stronger", "both-similarly-valid", "neither-acceptable", "uncertain",
] as const
export const nativeCompletePaletteReviewFailureClasses = [
	"needed-source-family-unavailable",
	"wrong-background",
	"wrong-foreground",
	"wrong-surface",
	"wrong-accent",
	"inappropriate-field-structure",
	"insufficient-role-separation",
	"inaccessible-contrast",
	"incomplete-artwork-identity",
	"selected-color-not-identifiable",
	"incorrect-flat-or-gradient",
	"complete-palette-ranking-failure",
] as const
export const nativeCompletePaletteReviewKinds = [
	"changed", "hidden-repeat", "accepted-control", "rejected-control", "known-control",
] as const

export type NativeCompletePaletteReviewEligibility = typeof nativeCompletePaletteReviewEligibility[number]
export type NativeCompletePaletteReviewQuality = typeof nativeCompletePaletteReviewQualities[number]
export type NativeCompletePaletteReviewPreference = typeof nativeCompletePaletteReviewPreferences[number]
export type NativeCompletePaletteReviewFailureClass = typeof nativeCompletePaletteReviewFailureClasses[number]
export type NativeCompletePaletteReviewKind = typeof nativeCompletePaletteReviewKinds[number]
export type NativeCompletePaletteReviewOption = "A" | "B"

export type NativeCompletePalettePresentedPalette = {
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

export type NativeCompletePaletteReviewEntry = {
	caseId: string
	order: number
	kind: NativeCompletePaletteReviewKind
	cohort: "development" | "00"
	materialChanged: boolean
	source: { file: string; sha256: string; bytes: number; width: number; height: number }
	changedRoles: RoleName[]
	gradientChanged: boolean
	options: Record<NativeCompletePaletteReviewOption, NativeCompletePalettePresentedPalette>
	assignment: Record<NativeCompletePaletteReviewOption, "baseline" | "candidate">
}

export type NativeCompletePaletteReviewManifest = {
	schemaVersion: 1
	reviewVersion: typeof NATIVE_COMPLETE_PALETTE_REVIEW_VERSION
	presentationVersion: typeof NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION
	generatedAt: string
	manifestId: string
	experimentId: string
	candidate: typeof NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE
	baseline: typeof NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE
	reviewAuthorizationSha256: string
	batch: { index: 1; size: 15; totalBatches: 1; totalCases: 15 }
	provenance: {
		experiment: Record<string, string>
		implementation: Record<string, string>
		presentation: Record<string, string>
	}
	entries: NativeCompletePaletteReviewEntry[]
}

export type NativeCompletePaletteReviewFeedbackEntry = {
	caseId: string
	sourceSha256: string
	sourceEligibility: NativeCompletePaletteReviewEligibility
	qualityA: NativeCompletePaletteReviewQuality | null
	qualityB: NativeCompletePaletteReviewQuality | null
	preference: NativeCompletePaletteReviewPreference | null
	failureClassesA: NativeCompletePaletteReviewFailureClass[]
	failureClassesB: NativeCompletePaletteReviewFailureClass[]
	note: string
	submittedAt: string
}

export type NativeCompletePaletteReviewFeedbackStore = {
	schemaVersion: 1
	reviewVersion: typeof NATIVE_COMPLETE_PALETTE_REVIEW_VERSION
	manifestId: string
	entries: NativeCompletePaletteReviewFeedbackEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} fields are invalid`)
	}
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function isRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function hashRecord(value: unknown, label: string): void {
	if (!isRecord(value) || Object.keys(value).length === 0 || Object.values(value).some((hash) => !isSha256(hash))) {
		throw new Error(`${label} is invalid`)
	}
}

function parsePalette(value: unknown, label: string): NativeCompletePalettePresentedPalette {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.gradient) || !isRecord(value.metrics)) {
		throw new Error(`${label} is invalid`)
	}
	exactKeys(value, ["roles", "gradient", "metrics"], label)
	exactKeys(value.roles, nativeCompletePaletteReviewRoles, `${label} roles`)
	exactKeys(value.gradient, ["isGradient", "confidence"], `${label} gradient`)
	exactKeys(value.metrics, [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
		"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
	], `${label} metrics`)
	if (typeof value.gradient.isGradient !== "boolean" || typeof value.gradient.confidence !== "number" ||
		!Number.isFinite(value.gradient.confidence) || value.gradient.confidence < 0 || value.gradient.confidence > 1) {
		throw new Error(`${label} gradient is invalid`)
	}
	for (const role of nativeCompletePaletteReviewRoles) {
		const color = value.roles[role]
		if (!isRecord(color)) throw new Error(`${label} ${role} is invalid`)
		exactKeys(color, ["rgb", "hex", "nearestName", "generated", "sourceDistance"], `${label} ${role}`)
		if (!isRgb(color.rgb) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) ||
			typeof color.nearestName !== "string" || color.nearestName.length === 0 || typeof color.generated !== "boolean" ||
			typeof color.sourceDistance !== "number" || !Number.isFinite(color.sourceDistance) || color.sourceDistance < 0 ||
			color.hex !== `#${color.rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`) {
			throw new Error(`${label} ${role} is invalid`)
		}
	}
	for (const metric of Object.values(value.metrics)) {
		if (typeof metric !== "number" || !Number.isFinite(metric)) throw new Error(`${label} metric is invalid`)
	}
	return value as unknown as NativeCompletePalettePresentedPalette
}

function visiblePaletteKey(value: NativeCompletePalettePresentedPalette): string {
	return JSON.stringify({
		roles: nativeCompletePaletteReviewRoles.map((role) => [value.roles[role].rgb, value.roles[role].generated]),
		gradient: value.gradient.isGradient,
	})
}

function assignedPalette(entry: NativeCompletePaletteReviewEntry, treatment: "baseline" | "candidate") {
	return entry.assignment.A === treatment ? entry.options.A : entry.options.B
}

export function nativeCompletePaletteReviewManifestId(
	manifest: Omit<NativeCompletePaletteReviewManifest, "generatedAt" | "manifestId">,
): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}

export function parseNativeCompletePaletteReviewManifest(value: unknown): NativeCompletePaletteReviewManifest {
	if (!isRecord(value)) throw new Error("Native complete-palette review manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "reviewVersion", "presentationVersion", "generatedAt", "manifestId", "experimentId",
		"candidate", "baseline", "reviewAuthorizationSha256", "batch", "provenance", "entries",
	], "Native complete-palette review manifest")
	if (value.schemaVersion !== 1 || value.reviewVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_VERSION ||
		value.presentationVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION ||
		value.candidate !== NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE || value.baseline !== NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE ||
		!validTimestamp(value.generatedAt) || !isSha256(value.manifestId) || !isSha256(value.experimentId) ||
		!isSha256(value.reviewAuthorizationSha256) || !isRecord(value.batch) || !isRecord(value.provenance) ||
		!Array.isArray(value.entries) || value.entries.length !== 15) {
		throw new Error("Native complete-palette review manifest header is invalid")
	}
	exactKeys(value.batch, ["index", "size", "totalBatches", "totalCases"], "Review batch")
	if (value.batch.index !== 1 || value.batch.size !== 15 || value.batch.totalBatches !== 1 || value.batch.totalCases !== 15) {
		throw new Error("Native complete-palette review batch is invalid")
	}
	exactKeys(value.provenance, ["experiment", "implementation", "presentation"], "Review provenance")
	hashRecord(value.provenance.experiment, "Review experiment provenance")
	hashRecord(value.provenance.implementation, "Review implementation provenance")
	hashRecord(value.provenance.presentation, "Review presentation provenance")
	const caseIds = new Set<string>()
	const orders = new Set<number>()
	const sourceEntries = new Map<string, NativeCompletePaletteReviewEntry[]>()
	for (const [index, candidate] of value.entries.entries()) {
		if (!isRecord(candidate) || typeof candidate.caseId !== "string" || !/^ncpr-[a-f0-9]{20}$/.test(candidate.caseId) ||
			caseIds.has(candidate.caseId) || !Number.isInteger(candidate.order) || orders.has(candidate.order as number) ||
			typeof candidate.kind !== "string" || !nativeCompletePaletteReviewKinds.includes(candidate.kind as NativeCompletePaletteReviewKind) ||
			!(candidate.cohort === "development" || candidate.cohort === "00") || typeof candidate.materialChanged !== "boolean" ||
			!isRecord(candidate.source) || typeof candidate.source.file !== "string" ||
			!(/^(?:images|00)\/[^/\\]+$/.test(candidate.source.file)) || !isSha256(candidate.source.sha256) ||
			!Number.isInteger(candidate.source.bytes) || (candidate.source.bytes as number) <= 0 ||
			!Number.isInteger(candidate.source.width) || (candidate.source.width as number) <= 0 ||
			!Number.isInteger(candidate.source.height) || (candidate.source.height as number) <= 0 ||
			!Array.isArray(candidate.changedRoles) || candidate.changedRoles.some((role) =>
				!nativeCompletePaletteReviewRoles.includes(role as RoleName)) ||
			new Set(candidate.changedRoles).size !== candidate.changedRoles.length || typeof candidate.gradientChanged !== "boolean" ||
			!isRecord(candidate.options) || !isRecord(candidate.assignment)) {
			throw new Error(`Native complete-palette review entry ${index} is invalid`)
		}
		exactKeys(candidate, [
			"caseId", "order", "kind", "cohort", "materialChanged", "source", "changedRoles", "gradientChanged",
			"options", "assignment",
		], `Review entry ${index}`)
		exactKeys(candidate.source, ["file", "sha256", "bytes", "width", "height"], `Review entry ${index} source`)
		exactKeys(candidate.options, ["A", "B"], `Review entry ${index} options`)
		exactKeys(candidate.assignment, ["A", "B"], `Review entry ${index} assignment`)
		const first = parsePalette(candidate.options.A, `Review entry ${index} option A`)
		const second = parsePalette(candidate.options.B, `Review entry ${index} option B`)
		if (![candidate.assignment.A, candidate.assignment.B].includes("baseline") ||
			![candidate.assignment.A, candidate.assignment.B].includes("candidate") ||
			candidate.assignment.A === candidate.assignment.B) throw new Error(`Review entry ${index} assignment is invalid`)
		const changed = candidate.kind === "changed" || candidate.kind === "hidden-repeat"
		if (changed !== (visiblePaletteKey(first) !== visiblePaletteKey(second)) ||
			changed !== ((candidate.changedRoles as unknown[]).length > 0 || candidate.gradientChanged === true) ||
			candidate.kind === "hidden-repeat" && candidate.materialChanged !== true ||
			!changed && candidate.materialChanged !== false) {
			throw new Error(`Review entry ${index} change classification is invalid`)
		}
		const entry = candidate as unknown as NativeCompletePaletteReviewEntry
		const siblings = sourceEntries.get(entry.source.sha256) ?? []
		siblings.push(entry)
		sourceEntries.set(entry.source.sha256, siblings)
		caseIds.add(entry.caseId)
		orders.add(entry.order)
	}
	if ([...orders].sort((a, b) => a - b).some((order, index) => order !== index)) {
		throw new Error("Native complete-palette review order is not contiguous")
	}
	const counts = Object.fromEntries(nativeCompletePaletteReviewKinds.map((kind) => [kind,
		(value.entries as unknown as NativeCompletePaletteReviewEntry[]).filter((entry) => entry.kind === kind).length]))
	if (counts.changed !== 6 || counts["hidden-repeat"] !== 2 || counts["accepted-control"] !== 1 ||
		counts["rejected-control"] !== 1 || counts["known-control"] !== 5) {
		throw new Error("Native complete-palette review case composition is invalid")
	}
	const entries = value.entries as unknown as NativeCompletePaletteReviewEntry[]
	if (entries.filter((entry) => entry.kind === "changed" && entry.materialChanged).length !== 2 ||
		entries.some((entry) => !["changed", "hidden-repeat"].includes(entry.kind) && entry.materialChanged)) {
		throw new Error("Native complete-palette material-change composition is invalid")
	}
	for (const siblings of sourceEntries.values()) {
		if (siblings.length === 1) continue
		if (siblings.length !== 2 || !siblings.some((entry) => entry.kind === "changed" && entry.materialChanged) ||
			!siblings.some((entry) => entry.kind === "hidden-repeat") ||
			visiblePaletteKey(assignedPalette(siblings[0], "baseline")) !== visiblePaletteKey(assignedPalette(siblings[1], "baseline")) ||
			visiblePaletteKey(assignedPalette(siblings[0], "candidate")) !== visiblePaletteKey(assignedPalette(siblings[1], "candidate"))) {
			throw new Error("Native complete-palette hidden repeat is invalid")
		}
	}
	const manifest = value as unknown as NativeCompletePaletteReviewManifest
	const { generatedAt: _generatedAt, manifestId, ...identity } = manifest
	if (nativeCompletePaletteReviewManifestId(identity) !== manifestId) {
		throw new Error("Native complete-palette review manifest identity is stale")
	}
	return manifest
}

function parseFailureClasses(value: unknown, label: string): NativeCompletePaletteReviewFailureClass[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" ||
		!nativeCompletePaletteReviewFailureClasses.includes(item as NativeCompletePaletteReviewFailureClass)) ||
		new Set(value).size !== value.length) throw new Error(`${label} is invalid`)
	return value as NativeCompletePaletteReviewFailureClass[]
}

export function parseNativeCompletePaletteReviewFeedbackEntry(
	value: unknown,
	manifest: NativeCompletePaletteReviewManifest,
	stored: boolean,
): NativeCompletePaletteReviewFeedbackEntry {
	if (!isRecord(value)) throw new Error("Native complete-palette feedback entry must be an object")
	exactKeys(value, [
		"caseId", "sourceSha256", "sourceEligibility", "qualityA", "qualityB", "preference",
		"failureClassesA", "failureClassesB", "note", ...(stored ? ["submittedAt"] : []),
	], "Native complete-palette feedback entry")
	const manifestEntry = manifest.entries.find((entry) => entry.caseId === value.caseId)
	if (!manifestEntry || value.sourceSha256 !== manifestEntry.source.sha256 || typeof value.sourceEligibility !== "string" ||
		!nativeCompletePaletteReviewEligibility.includes(value.sourceEligibility as NativeCompletePaletteReviewEligibility) ||
		typeof value.note !== "string" || value.note.length > 2000) {
		throw new Error("Native complete-palette feedback entry is invalid or stale")
	}
	const failureClassesA = parseFailureClasses(value.failureClassesA, "Option A failure classes")
	const failureClassesB = parseFailureClasses(value.failureClassesB, "Option B failure classes")
	const eligible = value.sourceEligibility === "eligible-artwork"
	if (eligible && (typeof value.qualityA !== "string" ||
		!nativeCompletePaletteReviewQualities.includes(value.qualityA as NativeCompletePaletteReviewQuality) ||
		typeof value.qualityB !== "string" ||
		!nativeCompletePaletteReviewQualities.includes(value.qualityB as NativeCompletePaletteReviewQuality) ||
		typeof value.preference !== "string" ||
		!nativeCompletePaletteReviewPreferences.includes(value.preference as NativeCompletePaletteReviewPreference))) {
		throw new Error("Eligible artwork requires both quality ratings and a comparison")
	}
	if (!eligible && (value.qualityA !== null || value.qualityB !== null || value.preference !== null ||
		failureClassesA.length > 0 || failureClassesB.length > 0)) {
		throw new Error("Ineligible sources cannot have palette judgments")
	}
	if (stored && !validTimestamp(value.submittedAt)) throw new Error("Stored feedback timestamp is invalid")
	return {
		caseId: manifestEntry.caseId,
		sourceSha256: manifestEntry.source.sha256,
		sourceEligibility: value.sourceEligibility as NativeCompletePaletteReviewEligibility,
		qualityA: eligible ? value.qualityA as NativeCompletePaletteReviewQuality : null,
		qualityB: eligible ? value.qualityB as NativeCompletePaletteReviewQuality : null,
		preference: eligible ? value.preference as NativeCompletePaletteReviewPreference : null,
		failureClassesA,
		failureClassesB,
		note: value.note.trim(),
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

export function parseNativeCompletePaletteReviewFeedbackStore(
	value: unknown,
	manifest: NativeCompletePaletteReviewManifest,
): NativeCompletePaletteReviewFeedbackStore {
	if (!isRecord(value)) throw new Error("Native complete-palette feedback store must be an object")
	exactKeys(value, ["schemaVersion", "reviewVersion", "manifestId", "entries"], "Feedback store")
	if (value.schemaVersion !== 1 || value.reviewVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new Error("Native complete-palette feedback store is stale or invalid")
	}
	const entries = value.entries.map((entry) => parseNativeCompletePaletteReviewFeedbackEntry(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) {
		throw new Error("Native complete-palette feedback contains duplicate cases")
	}
	return { schemaVersion: 1, reviewVersion: NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
		manifestId: manifest.manifestId, entries }
}

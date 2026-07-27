import { createHash } from "node:crypto"
import {
	ABSOLUTE_QUALITY_LABELS,
	REVIEW_ISSUE_TAGS,
} from "./album-artwork-palette-v2-protocol.ts"
import type { AbsoluteQualityLabel, ReviewIssueTag } from "./album-artwork-palette-v2-protocol.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION =
	"album-artwork-palette-v2-phase-4-review-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION =
	"album-artwork-palette-v2-0.5.1-ranking-review-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION =
	"album-artwork-palette-v2-phase-4-future-02-review-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION =
	"album-artwork-palette-v2-0.6.0-gradient-challenger-review-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_FUTURE_03_REVIEW_VERSION =
	"album-artwork-palette-v2-phase-4-future-03-review-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION =
	"album-artwork-palette-v2-phase-4-presentation-v1" as const
export const PHASE_4_REVIEW_CASE_COUNT = 12 as const
export const PHASE_4_COMPARISON_VALUES = [
	"a-stronger",
	"b-stronger",
	"similarly-valid",
	"neither-acceptable",
	"uncertain",
] as const

export type Phase4Comparison = typeof PHASE_4_COMPARISON_VALUES[number]
export type BlindedReviewVersion = typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION |
	typeof ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION |
	typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION |
	typeof ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION |
	typeof ALBUM_ARTWORK_PALETTE_V2_FUTURE_03_REVIEW_VERSION
export type Phase4ReviewSide = "A" | "B"
export type Phase4ReviewRole = "background" | "surface" | "foreground" | "accent"

export type Phase4ReviewRolePresentation = Readonly<{
	hex: string
	nearestName: string
	generated: boolean
}>

export type Phase4ReviewPalette = Readonly<{
	roles: Readonly<Record<Phase4ReviewRole, Phase4ReviewRolePresentation>>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

export type Phase4PrivateReviewCase = Readonly<{
	caseId: string
	order: number
	source: Readonly<{ file: string; sha256: string; bytes: number }>
	options: Readonly<Record<Phase4ReviewSide, Phase4ReviewPalette>>
	assignment: Readonly<Record<Phase4ReviewSide, "candidate" | "baseline">>
}>

export type Phase4PrivateReviewManifest = Readonly<{
	schemaVersion: 1
	reviewVersion: BlindedReviewVersion
	presentationVersion: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION
	manifestId: string
	cases: readonly Phase4PrivateReviewCase[]
}>

export type Phase4ReviewSubmission = Readonly<{
	caseId: string
	sourceSha256: string
	qualityA: AbsoluteQualityLabel
	qualityB: AbsoluteQualityLabel
	comparison: Phase4Comparison
	tagsA: readonly ReviewIssueTag[]
	tagsB: readonly ReviewIssueTag[]
	comment: string
}>

export type Phase4StoredReviewFeedback = Phase4ReviewSubmission & Readonly<{
	submittedAt: string
}>

export type Phase4ReviewFeedbackStore = Readonly<{
	schemaVersion: 1
	reviewVersion: BlindedReviewVersion
	manifestId: string
	entries: readonly Phase4StoredReviewFeedback[]
}>

const SIDES = ["A", "B"] as const
const ROLES = ["background", "surface", "foreground", "accent"] as const
const AUTHORIZED_SOURCE_ROOTS = new Set(["images", "music-artworks"])

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new TypeError(`${label} must contain exactly ${wanted.join(", ")}`)
	}
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function validSourceFile(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("\\")) return false
	const parts = value.split("/")
	if (parts.some((part) => part.length === 0 || part === "." || part === "..")) return false
	return AUTHORIZED_SOURCE_ROOTS.has(parts[0]) || /^[0-9a-f]{2}$/.test(parts[0])
}

function parsePalette(value: unknown, label: string): void {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.collapse)) {
		throw new TypeError(`${label} is invalid`)
	}
	exactKeys(value, ["roles", "gradient", "collapse"], label)
	exactKeys(value.roles, ROLES, `${label} roles`)
	exactKeys(value.collapse, ["surface", "accent"], `${label} collapse`)
	if (typeof value.gradient !== "boolean" || typeof value.collapse.surface !== "boolean" ||
		typeof value.collapse.accent !== "boolean") throw new TypeError(`${label} field treatment is invalid`)
	for (const role of ROLES) {
		const color = value.roles[role]
		if (!isRecord(color)) throw new TypeError(`${label} ${role} is invalid`)
		exactKeys(color, ["hex", "nearestName", "generated"], `${label} ${role}`)
		if (typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) ||
			typeof color.nearestName !== "string" || color.nearestName.length === 0 || color.nearestName.length > 200 ||
			typeof color.generated !== "boolean") throw new TypeError(`${label} ${role} is invalid`)
	}
}

export function phase4ReviewManifestId(
	manifest: Omit<Phase4PrivateReviewManifest, "manifestId">,
): string {
	return createHash("sha256").update(canonicalJson(manifest)).digest("hex")
}

export function parsePhase4PrivateReviewManifest(value: unknown): Phase4PrivateReviewManifest {
	if (!isRecord(value)) throw new TypeError("Phase 4 private review manifest must be an object")
	exactKeys(value, ["schemaVersion", "reviewVersion", "presentationVersion", "manifestId", "cases"],
		"Phase 4 private review manifest")
	const phase4Review = value.reviewVersion === ALBUM_ARTWORK_PALETTE_V2_PHASE_4_REVIEW_VERSION
	const rankingReview = value.reviewVersion === ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION
	const future02Review = value.reviewVersion === ALBUM_ARTWORK_PALETTE_V2_FUTURE_02_REVIEW_VERSION
	const gradientReview = value.reviewVersion === ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION
	const future03Review = value.reviewVersion === ALBUM_ARTWORK_PALETTE_V2_FUTURE_03_REVIEW_VERSION
	if (value.schemaVersion !== 1 || (!phase4Review && !rankingReview && !future02Review && !gradientReview && !future03Review) ||
		value.presentationVersion !== ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION ||
		!isSha256(value.manifestId) || !Array.isArray(value.cases) ||
		(phase4Review || future02Review || future03Review
			? value.cases.length !== PHASE_4_REVIEW_CASE_COUNT
			: gradientReview ? value.cases.length !== 2 : value.cases.length < 1 || value.cases.length > 28)) {
		throw new TypeError("Phase 4 private review manifest header is invalid")
	}
	const caseIds = new Set<string>()
	const orders = new Set<number>()
	for (const [index, candidate] of value.cases.entries()) {
		if (!isRecord(candidate) || !isRecord(candidate.source) || !isRecord(candidate.options) ||
			!isRecord(candidate.assignment)) throw new TypeError(`Phase 4 review case ${index} is invalid`)
		exactKeys(candidate, ["caseId", "order", "source", "options", "assignment"], `Phase 4 review case ${index}`)
		exactKeys(candidate.source, ["file", "sha256", "bytes"], `Phase 4 review case ${index} source`)
		exactKeys(candidate.options, SIDES, `Phase 4 review case ${index} options`)
		exactKeys(candidate.assignment, SIDES, `Phase 4 review case ${index} assignment`)
		if (typeof candidate.caseId !== "string" || !/^[A-Za-z0-9._-]{1,200}$/.test(candidate.caseId) ||
			caseIds.has(candidate.caseId) || !Number.isInteger(candidate.order) || orders.has(candidate.order as number) ||
			!validSourceFile(candidate.source.file) || !isSha256(candidate.source.sha256) ||
			!Number.isSafeInteger(candidate.source.bytes) || (candidate.source.bytes as number) <= 0) {
			throw new TypeError(`Phase 4 review case ${index} identity or source is invalid`)
		}
		parsePalette(candidate.options.A, `Phase 4 review case ${index} option A`)
		parsePalette(candidate.options.B, `Phase 4 review case ${index} option B`)
		if (!([candidate.assignment.A, candidate.assignment.B].includes("candidate") &&
			[candidate.assignment.A, candidate.assignment.B].includes("baseline")) ||
			candidate.assignment.A === candidate.assignment.B) {
			throw new TypeError(`Phase 4 review case ${index} assignment is invalid`)
		}
		caseIds.add(candidate.caseId)
		orders.add(candidate.order as number)
	}
	if ([...orders].sort((first, second) => first - second).some((order, index) => order !== index)) {
		throw new TypeError("Phase 4 review case order must be contiguous from zero")
	}
	const manifest = value as unknown as Phase4PrivateReviewManifest
	const { manifestId, ...identity } = manifest
	if (phase4ReviewManifestId(identity) !== manifestId) throw new TypeError("Phase 4 review manifest identity is stale")
	return manifest
}

function parseTags(value: unknown, label: string): ReviewIssueTag[] {
	if (!Array.isArray(value) || new Set(value).size !== value.length ||
		!value.every((tag) => typeof tag === "string" && REVIEW_ISSUE_TAGS.includes(tag as ReviewIssueTag))) {
		throw new TypeError(`${label} must be a unique subset of the V2 review tags`)
	}
	return value as ReviewIssueTag[]
}

export function parsePhase4ReviewSubmission(
	value: unknown,
	expected: Readonly<{ caseId: string; sourceSha256: string }>,
): Phase4ReviewSubmission {
	if (!isRecord(value)) throw new TypeError("Phase 4 feedback must be an object")
	exactKeys(value, ["caseId", "sourceSha256", "qualityA", "qualityB", "comparison", "tagsA", "tagsB", "comment"],
		"Phase 4 feedback")
	if (value.caseId !== expected.caseId || value.sourceSha256 !== expected.sourceSha256) {
		throw new TypeError("Phase 4 feedback identity does not match the private review manifest")
	}
	if (!ABSOLUTE_QUALITY_LABELS.includes(value.qualityA as AbsoluteQualityLabel) ||
		!ABSOLUTE_QUALITY_LABELS.includes(value.qualityB as AbsoluteQualityLabel)) {
		throw new TypeError("Phase 4 feedback requires valid V2 absolute quality labels for A and B")
	}
	if (!PHASE_4_COMPARISON_VALUES.includes(value.comparison as Phase4Comparison)) {
		throw new TypeError("Phase 4 feedback comparison is invalid")
	}
	const tagsA = parseTags(value.tagsA, "Phase 4 option A tags")
	const tagsB = parseTags(value.tagsB, "Phase 4 option B tags")
	if (typeof value.comment !== "string" || value.comment.length > 2_000) {
		throw new TypeError("Phase 4 feedback comment must be a string of at most 2,000 characters")
	}
	return {
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		qualityA: value.qualityA as AbsoluteQualityLabel,
		qualityB: value.qualityB as AbsoluteQualityLabel,
		comparison: value.comparison as Phase4Comparison,
		tagsA,
		tagsB,
		comment: value.comment,
	}
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function parseStoredFeedback(value: unknown, manifest: Phase4PrivateReviewManifest): Phase4StoredReviewFeedback {
	if (!isRecord(value)) throw new TypeError("Stored Phase 4 feedback must be an object")
	exactKeys(value, ["caseId", "sourceSha256", "qualityA", "qualityB", "comparison", "tagsA", "tagsB", "comment", "submittedAt"],
		"Stored Phase 4 feedback")
	const reviewCase = manifest.cases.find(({ caseId }) => caseId === value.caseId)
	if (!reviewCase || !validTimestamp(value.submittedAt)) throw new TypeError("Stored Phase 4 feedback is stale or invalid")
	return {
		...parsePhase4ReviewSubmission(
			Object.fromEntries(Object.entries(value).filter(([key]) => key !== "submittedAt")),
			{ caseId: reviewCase.caseId, sourceSha256: reviewCase.source.sha256 },
		),
		submittedAt: value.submittedAt,
	}
}

export function parsePhase4ReviewFeedbackStore(
	value: unknown,
	manifest: Phase4PrivateReviewManifest,
): Phase4ReviewFeedbackStore {
	if (!isRecord(value)) throw new TypeError("Phase 4 feedback store must be an object")
	exactKeys(value, ["schemaVersion", "reviewVersion", "manifestId", "entries"], "Phase 4 feedback store")
	if (value.schemaVersion !== 1 || value.reviewVersion !== manifest.reviewVersion ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new TypeError("Phase 4 feedback store does not match the private review manifest")
	}
	const entries = value.entries.map((entry) => parseStoredFeedback(entry, manifest))
	if (new Set(entries.map(({ caseId }) => caseId)).size !== entries.length) {
		throw new TypeError("Phase 4 feedback store contains duplicate cases")
	}
	return {
		schemaVersion: 1,
		reviewVersion: manifest.reviewVersion,
		manifestId: manifest.manifestId,
		entries,
	}
}

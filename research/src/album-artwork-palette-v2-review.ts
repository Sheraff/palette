import {
	ABSOLUTE_QUALITY_LABELS,
	REVIEW_ISSUE_TAGS,
} from "./album-artwork-palette-v2-protocol.ts"
import type { AbsoluteQualityLabel, ReviewIssueTag } from "./album-artwork-palette-v2-protocol.ts"

export type CaseFeedbackSubmission = Readonly<{
	caseId: string
	sourceSha256: string
	selectedTreatmentId: string
	alsoValidTreatmentIds: readonly string[]
	quality: AbsoluteQualityLabel | null
	tags: readonly ReviewIssueTag[]
	comment: string
}>

export type StoredCaseFeedback = CaseFeedbackSubmission & Readonly<{
	submittedAt: string
}>

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new TypeError(`${context} must contain exactly ${wanted.join(", ")}`)
	}
}

function objectValue(value: unknown, context: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context} must be an object`)
	return value as Record<string, unknown>
}

export function parseCaseFeedbackSubmission(
	value: unknown,
	expected: Readonly<{ caseId: string; sourceSha256: string; treatmentIds: readonly string[] }>,
): CaseFeedbackSubmission {
	const submission = objectValue(value, "Feedback submission")
	exactKeys(submission, ["caseId", "sourceSha256", "selectedTreatmentId", "alsoValidTreatmentIds", "quality", "tags", "comment"], "Feedback submission")
	if (submission.caseId !== expected.caseId || submission.sourceSha256 !== expected.sourceSha256) {
		throw new TypeError("Feedback source identity does not match the review manifest")
	}
	if (typeof submission.selectedTreatmentId !== "string" || !expected.treatmentIds.includes(submission.selectedTreatmentId)) {
		throw new TypeError("Selected treatment does not exist in the retained slate")
	}
	if (!Array.isArray(submission.alsoValidTreatmentIds) ||
		new Set(submission.alsoValidTreatmentIds).size !== submission.alsoValidTreatmentIds.length ||
		!submission.alsoValidTreatmentIds.every((treatmentId) =>
			typeof treatmentId === "string" && expected.treatmentIds.includes(treatmentId) && treatmentId !== submission.selectedTreatmentId)) {
		throw new TypeError("Also-valid treatments must be unique, retained, and different from the strongest treatment")
	}
	if (submission.quality !== null && !ABSOLUTE_QUALITY_LABELS.includes(submission.quality as AbsoluteQualityLabel)) {
		throw new TypeError("Selected-treatment quality label is invalid")
	}
	if (!Array.isArray(submission.tags) || new Set(submission.tags).size !== submission.tags.length ||
		!submission.tags.every((tag) => REVIEW_ISSUE_TAGS.includes(tag as ReviewIssueTag))) {
		throw new TypeError("Selected-treatment issue tags are invalid")
	}
	if (typeof submission.comment !== "string" || submission.comment.length > 2_000) {
		throw new TypeError("Selected-treatment comment must be a string of at most 2,000 characters")
	}
	return {
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		selectedTreatmentId: submission.selectedTreatmentId,
		alsoValidTreatmentIds: submission.alsoValidTreatmentIds as string[],
		quality: submission.quality as AbsoluteQualityLabel | null,
		tags: submission.tags as ReviewIssueTag[],
		comment: submission.comment,
	}
}

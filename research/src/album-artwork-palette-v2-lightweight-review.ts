import { ABSOLUTE_QUALITY_LABELS } from "./album-artwork-palette-v2-protocol.ts"
import type { AbsoluteQualityLabel } from "./album-artwork-palette-v2-protocol.ts"

export type LightweightReviewSubmission = Readonly<{
	caseId: string
	sourceSha256: string
	treatmentId: string
	quality: AbsoluteQualityLabel
	comment: string
}>

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new TypeError(`Lightweight feedback must contain exactly ${wanted.join(", ")}`)
	}
}

export function parseLightweightReviewSubmission(
	value: unknown,
	expected: Readonly<{ caseId: string; sourceSha256: string; treatmentId: string }>,
): LightweightReviewSubmission {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Lightweight feedback must be an object")
	const submission = value as Record<string, unknown>
	exactKeys(submission, ["caseId", "sourceSha256", "treatmentId", "quality", "comment"])
	if (submission.caseId !== expected.caseId || submission.sourceSha256 !== expected.sourceSha256 || submission.treatmentId !== expected.treatmentId) {
		throw new TypeError("Lightweight feedback identity does not match the review manifest")
	}
	if (!ABSOLUTE_QUALITY_LABELS.includes(submission.quality as AbsoluteQualityLabel)) {
		throw new TypeError("Lightweight feedback requires a valid absolute quality")
	}
	if (typeof submission.comment !== "string" || submission.comment.length > 2_000) {
		throw new TypeError("Lightweight feedback comment must be at most 2,000 characters")
	}
	return {
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		treatmentId: expected.treatmentId,
		quality: submission.quality as AbsoluteQualityLabel,
		comment: submission.comment,
	}
}

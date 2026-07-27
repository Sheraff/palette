export type TargetedReviewSubmission = Readonly<{
	caseId: string
	sourceSha256: string
	validOptionIds: readonly string[]
	preferredOptionId: string | null
	noneConfidentlyValid: boolean
	uncertain: boolean
	comment: string
}>

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new TypeError(`Targeted feedback must contain exactly ${wanted.join(", ")}`)
	}
}

export function parseTargetedReviewSubmission(
	value: unknown,
	expected: Readonly<{ caseId: string; sourceSha256: string; optionIds: readonly string[] }>,
): TargetedReviewSubmission {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Targeted feedback must be an object")
	const submission = value as Record<string, unknown>
	exactKeys(submission, ["caseId", "sourceSha256", "validOptionIds", "preferredOptionId", "noneConfidentlyValid", "uncertain", "comment"])
	if (submission.caseId !== expected.caseId || submission.sourceSha256 !== expected.sourceSha256) {
		throw new TypeError("Targeted feedback identity does not match the review manifest")
	}
	if (!Array.isArray(submission.validOptionIds) || !submission.validOptionIds.every((id) => typeof id === "string")) {
		throw new TypeError("Targeted feedback valid options must be an array of option IDs")
	}
	const validOptionIds = submission.validOptionIds as string[]
	if (new Set(validOptionIds).size !== validOptionIds.length || validOptionIds.some((id) => !expected.optionIds.includes(id))) {
		throw new TypeError("Targeted feedback contains duplicate or unbound option IDs")
	}
	if (submission.preferredOptionId !== null &&
		(typeof submission.preferredOptionId !== "string" || !validOptionIds.includes(submission.preferredOptionId))) {
		throw new TypeError("Targeted preferred option must be null or one of the valid options")
	}
	if (typeof submission.noneConfidentlyValid !== "boolean" || typeof submission.uncertain !== "boolean") {
		throw new TypeError("Targeted feedback fallback states must be booleans")
	}
	if (validOptionIds.length > 0 && (submission.noneConfidentlyValid || submission.uncertain) ||
		submission.noneConfidentlyValid && submission.uncertain ||
		validOptionIds.length === 0 && !submission.noneConfidentlyValid && !submission.uncertain) {
		throw new TypeError("Choose valid options, none confidently valid, or uncertain")
	}
	if (typeof submission.comment !== "string" || submission.comment.length > 2_000) {
		throw new TypeError("Targeted feedback comment must be at most 2,000 characters")
	}
	return {
		caseId: expected.caseId,
		sourceSha256: expected.sourceSha256,
		validOptionIds: expected.optionIds.filter((id) => validOptionIds.includes(id)),
		preferredOptionId: submission.preferredOptionId as string | null,
		noneConfidentlyValid: submission.noneConfidentlyValid,
		uncertain: submission.uncertain,
		comment: submission.comment,
	}
}

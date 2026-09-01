import { okDistance, rgbToOKLab } from "./color.ts"
import type { CorpusResult, Palette } from "./types.ts"

export type RepeatComparison = "baseline" | "variant"

type FeedbackRecord = Record<string, unknown>
type CorpusEntry = CorpusResult["entries"][number]

const comparisonMethods: Record<RepeatComparison, readonly ["spatial", "quantized" | "expressive"]> = {
	baseline: ["spatial", "quantized"],
	variant: ["spatial", "expressive"],
}

export function palettesDiffer(first: Palette, second: Palette): boolean {
	if (first.gradient.isGradient !== second.gradient.isGradient) return true
	return (["background", "foreground", "surface", "accent"] as const).some((role) =>
		okDistance(rgbToOKLab(first[role].rgb), rgbToOKLab(second[role].rgb)) > 0.025,
	)
}

export function comparisonChanged(
	current: CorpusEntry,
	reviewed: CorpusEntry,
	comparison: RepeatComparison,
): boolean {
	return comparisonMethods[comparison].some((method) =>
		palettesDiffer(current.extraction.methods[method], reviewed.extraction.methods[method]),
	)
}

export function hasSubmittedFeedback(
	feedback: FeedbackRecord[],
	algorithmVersion: string,
	presentationVersion: number,
	image: string,
	comparison: string,
): boolean {
	return feedback.some((item) =>
		item.algorithmVersion === algorithmVersion && item.presentationVersion === presentationVersion &&
		item.image === image && item.comparison === comparison,
	)
}

export function findCarriedReviews(
	current: CorpusResult,
	archivedResults: ReadonlyMap<string, CorpusResult>,
	feedback: FeedbackRecord[],
	presentationVersion: number,
): Array<{ image: string; comparison: RepeatComparison; algorithmVersion: string }> {
	const carried = [] as Array<{ image: string; comparison: RepeatComparison; algorithmVersion: string }>
	for (const entry of current.entries) {
		if (!entry.review) continue
		for (const comparison of ["baseline", "variant"] as const) {
			for (let index = feedback.length - 1; index >= 0; index--) {
				const item = feedback[index]
				if (item.reviewSchema !== 2 || item.presentationVersion !== presentationVersion ||
					item.image !== entry.file || item.comparison !== comparison ||
					typeof item.algorithmVersion !== "string" || item.algorithmVersion === current.algorithmVersion) {
					continue
				}
				const reviewedResult = archivedResults.get(item.algorithmVersion)
				const reviewedEntry = reviewedResult?.entries.find((candidate) => candidate.file === entry.file)
				if (reviewedEntry && !comparisonChanged(entry, reviewedEntry, comparison)) {
					carried.push({ image: entry.file, comparison, algorithmVersion: item.algorithmVersion })
				}
				break
			}
		}
	}
	return carried
}

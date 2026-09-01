import { createHash } from "node:crypto"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION as PRESENTATION_VERSION_V1,
	NEXT_PALETTE_REVIEW_VERSION,
	parseNextPaletteReviewFeedbackEntry as parseFeedbackEntryV1,
	parseNextPaletteReviewFeedbackStore as parseFeedbackStoreV1,
	parseNextPaletteReviewManifest as parseManifestV1,
	type NextPalettePresentedPalette,
	type NextPaletteReviewEligibility,
	type NextPaletteReviewEntry,
	type NextPaletteReviewFailureClass,
	type NextPaletteReviewFeedbackEntry,
	type NextPaletteReviewFeedbackStore,
	type NextPaletteReviewOptionId,
	type NextPaletteReviewPreference,
	type NextPaletteReviewQuality,
} from "./next-palette-review.ts"

export { NEXT_PALETTE_REVIEW_VERSION }
export const NEXT_PALETTE_REVIEW_PRESENTATION_VERSION = "next-palette-review-presentation-2"

export type {
	NextPalettePresentedPalette,
	NextPaletteReviewEligibility,
	NextPaletteReviewEntry,
	NextPaletteReviewFailureClass,
	NextPaletteReviewFeedbackEntry,
	NextPaletteReviewFeedbackStore,
	NextPaletteReviewOptionId,
	NextPaletteReviewPreference,
	NextPaletteReviewQuality,
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

export function nextPaletteReviewManifestId(
	manifest: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId">,
): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}

export function parseNextPaletteReviewManifest(value: unknown): NextPaletteReviewManifest {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Next palette review v2 manifest must be an object")
	}
	const manifest = value as NextPaletteReviewManifest
	if (manifest.presentationVersion !== NEXT_PALETTE_REVIEW_PRESENTATION_VERSION) {
		throw new Error("Next palette review v2 presentation version is invalid")
	}
	const { generatedAt: _generatedAt, manifestId, ...identity } = manifest
	if (nextPaletteReviewManifestId(identity) !== manifestId) {
		throw new Error("Next palette review v2 manifest identity is stale")
	}
	const v1Identity = { ...identity, presentationVersion: PRESENTATION_VERSION_V1 }
	parseManifestV1({
		...v1Identity,
		generatedAt: manifest.generatedAt,
		manifestId: createHash("sha256").update(JSON.stringify(v1Identity)).digest("hex"),
	})
	return manifest
}

export function parseNextPaletteReviewFeedbackEntry(
	value: unknown,
	manifest: NextPaletteReviewManifest,
	stored: boolean,
): NextPaletteReviewFeedbackEntry {
	return parseFeedbackEntryV1(value, manifest as never, stored)
}

export function parseNextPaletteReviewFeedbackStore(
	value: unknown,
	manifest: NextPaletteReviewManifest,
): NextPaletteReviewFeedbackStore {
	return parseFeedbackStoreV1(value, manifest as never)
}

export const ALBUM_ARTWORK_PALETTE_V2_VERSION = "album-artwork-first-principles-0.6.0"
export const ALBUM_ARTWORK_PALETTE_V2_PROTOCOL = "album-artwork-ui-palette-protocol-v2"

export const ABSOLUTE_QUALITY_LABELS = [
	"strong",
	"acceptable",
	"weak-fallback",
	"unacceptable",
	"uncertain",
] as const

export const REVIEW_ISSUE_TAGS = [
	"missing gradient",
	"extraneous gradient",
	"incomplete artwork identity",
] as const

export const ALBUM_ARTWORK_PALETTE_V2_POLICY = Object.freeze({
	canonicalColor: "srgb-uint8",
	displayHex: "lower-case-six-digit-srgb",
	gradient: Object.freeze({
		cssDirectionDegrees: 135,
		backgroundPosition: 0,
		surfacePosition: 1,
		interpolation: "oklab",
		contrastSamplePositions: Object.freeze([0, 0.25, 0.5, 0.75, 1]),
	}),
	contrast: Object.freeze({
		metric: "apca-w3-0.1.9-signed-lc",
		hardMinimum: 0,
		requiredForegroundObservability: "at-least-one-sample-outside-apca-zero-dead-zone",
		distinctAccentObservability: "at-least-one-sample-outside-apca-zero-dead-zone",
		emergencyMaximumAbsoluteLc: 5,
		emergencyGeneratedPenalty: 0.18,
	}),
	representatives: Object.freeze({
		maximumSynthesizedOccupiedDistance: 0.025,
	}),
	bounds: Object.freeze({
		retainedDiagnosticFamilies: 48,
		fieldFamilies: 12,
		signatureFamilies: 16,
		foregroundFamilies: 16,
		fieldHypotheses: 12,
		fieldDomains: 12,
		retainedDiagnosticFieldDomains: 48,
		largestComponentsPerFamily: 8,
		roleObservationComponentsPerFamily: 24,
		typographyPolarityRegions: 4,
		gradientEndpointFamiliesPerBand: 2,
		representativesPerRole: 2,
		foregroundsPerFieldVariant: 6,
		distinctAccentsPerForeground: 4,
		completeCandidates: 1_500,
		gradientChallengerProjections: 6,
		retainedTreatments: 8,
		developmentWorkers: 6,
	}),
})

export type AbsoluteQualityLabel = typeof ABSOLUTE_QUALITY_LABELS[number]
export type ReviewIssueTag = typeof REVIEW_ISSUE_TAGS[number]

export const ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS = Object.freeze([
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"foregroundUtility",
	"accentFidelity",
	"accentUtility",
	"coherence",
	"economy",
] as const)

export const ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS = Object.freeze([
	"treatmentFoundation",
	"fieldIdentity",
	"fieldFidelity",
	"fieldStructure",
	"accentFidelity",
	"accentUtility",
	"artworkIdentity",
	"foregroundUtility",
	"representativeness",
	"coherence",
	"economy",
] as const)

export type AlbumArtworkPaletteV2QualityBlock =
	typeof ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS[number] |
	typeof ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS[number]

export const ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS: readonly AlbumArtworkPaletteV2QualityBlock[] =
	Object.freeze([...new Set<AlbumArtworkPaletteV2QualityBlock>([
		...ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
		...ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
	])])

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
	identity: Object.freeze({
		materialDistance: 0.025,
		selection: "source-connected-signature-evidence-levels",
		reservedMajorFamilyPopulationFraction: 0.06,
		winnerPrecedence: "quality-incumbent-then-quality-guarded-obligation-coverage-and-priority",
		qualityGuard: Object.freeze({
			version: "complete-quality-domain-non-inferiority-v1",
			comparison: "generated-penalty-adjusted-complete-quality-domain-evidence-level-non-inferiority",
			challengerDomain: "strict-obligation-coverage-or-priority-improvement-over-quality-incumbent",
			blocks: ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
		}),
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
		identityObligations: 4,
		completeCandidates: 1_500,
		gradientChallengerProjections: 6,
		retainedTreatments: 8,
		developmentWorkers: 6,
	}),
})

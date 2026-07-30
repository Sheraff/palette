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
	/**
	 * Salient-mark evidence.
	 *
	 * A small, vivid, repeated element — lettering, a logo, a stamp — carries
	 * artwork identity that its population fraction cannot express. Every
	 * support term in the algorithm normalises by a population fraction
	 * (`totalSupport / 0.08`, `largestComponentFraction / 0.002`, …) that an
	 * element covering 0.02 % of the artwork can never reach, so such an
	 * element is filtered out before it can compete for the accent role.
	 *
	 * `markSupport` is a bounded, measured substitute for that population
	 * support, derived entirely from the region observations the evidence pass
	 * already computes. It is deliberately a *product* of independent
	 * conditions, so a family only earns it when **all** of them hold — a bare
	 * pixel, a JPEG aberration, or a single unrepeated blob earns nothing,
	 * which is what the representativity rule requires.
	 *
	 * Set every threshold to a value no observation can meet (or
	 * `substitution: 0`) to restore the previous behaviour exactly.
	 */
	mark: Object.freeze({
		/**
		 * Absolute pixel floor for a component to count as a mark stroke. Below
		 * this a component cannot be distinguished from compression noise at any
		 * resolution.
		 */
		minimumComponentPopulation: 12,
		/**
		 * Scale-relative floor for the same component, so the rule means the
		 * same thing on a 350 px thumbnail and a 1400 px master.
		 */
		minimumComponentFraction: 0.000_02,
		/** Mutual-similarity floor: a mark stroke looks like its siblings. */
		minimumRepetition: 0.5,
		/** A mark sits inside the frame; a field bleeds off the edge. */
		maximumBorderContact: 0.25,
		/** A mark stroke fills a usable share of its own bounding box. */
		minimumFill: 0.08,
		/** Fewest qualifying components before any mark credit is earned. */
		minimumComponentCount: 3,
		/** Component count at which the plurality term saturates. */
		saturationComponentCount: 6,
		/**
		 * OKLab distance from the family prototype to the nearest field-owning
		 * family at which the separation term saturates. Boundary contrast
		 * measured pixel-adjacent systematically under-reads a small element,
		 * because its perimeter is dominated by the anti-aliased blend into the
		 * ground; the distance between the two prototypes is the same quantity
		 * measured where anti-aliasing cannot reach it.
		 */
		fieldSeparation: 0.12,
		/** Field-owning families the separation is measured against. */
		fieldReferenceFamilies: 2,
		/**
		 * How much population support a fully-evidenced mark may substitute,
		 * as a fraction of the term it replaces. `0` disables the mechanism.
		 */
		substitution: 1,
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

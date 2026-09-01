import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import {
	buildChromaticCandidateAvailability,
	CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
	type ChromaticAvailabilityDiagnostics,
} from "./chromatic-candidate-availability.ts"
import type { Candidate } from "./candidates.ts"
import type { ForegroundContrastProfile } from "./foreground-contrast.ts"
import { solveGuardedPalette, type GuardedPaletteCertificate } from "./guarded-palette.ts"
import { solveJointPalette, type JointPaletteCertificate } from "./joint-palette.ts"
import {
	extractRegionGraph017PaletteWithContext,
	REGION_GRAPH_0_17_ALGORITHM_VERSION,
} from "./region-graph-0.17-extract.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, Palette, RawImage, RGB, RoleName } from "./types.ts"

export const CHROMATIC_ROLE_ALGORITHM_VERSION = "region-chromatic-role-0.1.0-poc.10"
export const CHROMATIC_ROLE_BASELINE_VERSION = "region-graph-0.17.0"
export const CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION = 0.02
export const CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT = 0.5
export const CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CONTRAST = 1.5
export const CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN = 0.02
export const CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN = 0.02
export const CHROMATIC_ROLE_FULL_ACCENT_CHROMA = 0.18
export const CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS = 0.02
export const CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN = 0.025
export const CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA = 0.045
export const CHROMATIC_ROLE_MAXIMUM_COLLATERAL_ROLE_CHROMA_LOSS = 0.025

const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]

type PaletteSummary = {
	roles: Record<RoleName, { hex: string; generated: boolean }>
	gradient: boolean
}

type SupplementSummary = {
	id: number
	anchorDegrees: number
	hex: string
	rgb: RGB
	population: number
	score: number
	supportingRegionCount: number
	nearestBaselineDistance: number
}

export type ChromaticRoleCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof CHROMATIC_ROLE_ALGORITHM_VERSION
	baselineAlgorithmVersion: typeof CHROMATIC_ROLE_BASELINE_VERSION
	availabilityAlgorithmVersion: typeof CHROMATIC_CANDIDATE_AVAILABILITY_VERSION
	selectionRule: "canonical-spatial-pipeline-with-bounded-chromatic-supplements"
	normalizedImageSha256: string
	candidateIdentity: {
		baselineSha256: string
		augmentedSha256: string
		roleSolverSha256: string
	}
	availability: ChromaticAvailabilityDiagnostics & { supplements: SupplementSummary[] }
	solver: {
		guarded: GuardedPaletteCertificate | null
		joint: JointPaletteCertificate | null
	}
	baseline: PaletteSummary
	treatment: PaletteSummary
	emitted: PaletteSummary
	decision: {
		solverRan: boolean
		availableSupplementIds: number[]
		admittedSupplementIds: number[]
		selectedSupplementIds: number[]
		selectedSupplementRoles: Partial<Record<RoleName, number>>
		changedRoles: RoleName[]
		gradientChanged: boolean
		emittedTreatment: boolean
		accentVisibilityEligible: boolean
		accentIdentityEligible: boolean
		selectedRoleEligible: boolean
		collapsedBackgroundEligible: boolean
		accentChromaEligible: boolean
		collateralRoleChromaEligible: boolean
	}
	invariants: {
		canonicalCandidatePrefixUnchanged: true
		supplementsAppendedOnly: true
		uniqueCandidateIds: true
		supplementIdsAboveBaseline: true
		exactNormalizedSourcePixels: true
		canonicalCandidatesNotMutated: true
		noSupplementPreservesCanonical: true
		unselectedSupplementsPreserveCanonical: true
		expressiveFrozen: true
		quantizedFrozen: true
		everyChangedOutputSelectsSupplement: true
		canonicalFamilyAssignmentsFrozen: true
		overlappingPopulationNotRenormalized: true
		minorFamilyRoleAdmissionBound: true
		typographySupportedRoleAdmission: true
		emittedAccentVisibilityBound: true
		emittedAccentIdentityBound: true
		emittedRoleEvidenceBound: true
		emittedCollapsedBackgroundBound: true
		emittedAccentChromaBound: true
		emittedCollateralRoleChromaBound: true
	}
	foregroundContrastProfile?: ForegroundContrastProfile
}

export type ChromaticRoleExtraction = {
	extraction: ExtractionResult
	certificate: ChromaticRoleCertificate
}

export type ChromaticRoleExtractionContext = ChromaticRoleExtraction & {
	analysis: RegionAnalysis
	candidates: Candidate[]
}

function candidateIdentity(candidates: readonly Candidate[]): string {
	return createHash("sha256").update(JSON.stringify(candidates)).digest("hex")
}

function normalizedImageIdentity(image: RawImage): string {
	return createHash("sha256")
		.update(`${image.width}x${image.height}:`)
		.update(image.data)
		.digest("hex")
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function exactSourcePixel(image: RawImage, rgb: RGB): boolean {
	for (let offset = 0; offset < image.data.length; offset += 3) {
		if (image.data[offset] === rgb[0] && image.data[offset + 1] === rgb[1] && image.data[offset + 2] === rgb[2]) return true
	}
	return false
}

function paletteSummary(palette: Palette): PaletteSummary {
	return {
		roles: Object.fromEntries(roleNames.map((role) => [role, {
			hex: palette[role].hex.toLowerCase(),
			generated: palette[role].generated,
		}])) as PaletteSummary["roles"],
		gradient: palette.gradient.isGradient,
	}
}

function candidateDiagnostic(candidate: Candidate): ExtractionResult["candidates"][number] {
	return {
		hex: candidate.hex,
		rgb: candidate.rgb,
		population: candidate.population,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
		chroma: candidate.chroma,
	}
}

function requireInvariant(condition: boolean, message: string): void {
	if (!condition) throw new Error(`Chromatic role invariant failed: ${message}`)
}

export function extractChromaticRolePaletteWithContext(
	image: RawImage,
	profile?: ForegroundContrastProfile,
): ChromaticRoleExtractionContext {
	requireInvariant(REGION_GRAPH_0_17_ALGORITHM_VERSION === CHROMATIC_ROLE_BASELINE_VERSION,
		"canonical baseline version changed")
	const startedAt = performance.now()
	const context = extractRegionGraph017PaletteWithContext(image, profile)
	const baseline = context.extraction.methods.spatial
	const baselineIdentity = candidateIdentity(context.candidates)
	const availability = buildChromaticCandidateAvailability(context.analysis, context.candidates)
	const supplementCandidates = availability.supplements.map((supplement) => supplement.candidate)
	const admittedSupplementCandidates = supplementCandidates.filter((candidate) =>
		candidate.population <= CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION &&
		candidate.text >= CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT)
	const augmented = [...context.candidates, ...supplementCandidates]
	const roleSolverCandidates = [...context.candidates, ...admittedSupplementCandidates]
	const augmentedIdentity = candidateIdentity(augmented)
	const roleSolverIdentity = candidateIdentity(roleSolverCandidates)
	const maximumBaselineId = context.candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.id), -1)

	requireInvariant(isDeepStrictEqual(augmented.slice(0, context.candidates.length), context.candidates),
		"canonical candidate prefix changed")
	requireInvariant(new Set(augmented.map((candidate) => candidate.id)).size === augmented.length, "candidate IDs are not unique")
	requireInvariant(supplementCandidates.every((candidate) => candidate.id > maximumBaselineId),
		"supplement ID overlaps the canonical range")
	requireInvariant(supplementCandidates.every((candidate) => exactSourcePixel(image, candidate.rgb)),
		"supplement is not an exact normalized source pixel")

	let guardedCertificate: GuardedPaletteCertificate | null = null
	let jointCertificate: JointPaletteCertificate | null = null
	let treatment = baseline
	if (admittedSupplementCandidates.length > 0) {
		const guarded = solveGuardedPalette([...roleSolverCandidates], context.analysis, profile)
		const joint = solveJointPalette(roleSolverCandidates, context.analysis, guarded.palette, {
			foregroundContrastProfile: profile,
		})
		guardedCertificate = guarded.certificate
		jointCertificate = joint.certificate
		treatment = joint.palette
	}
	requireInvariant(candidateIdentity(context.candidates) === baselineIdentity, "canonical candidates were mutated")
	requireInvariant(candidateIdentity(augmented) === augmentedIdentity, "augmented candidates were mutated")
	requireInvariant(candidateIdentity(roleSolverCandidates) === roleSolverIdentity, "role solver candidates were mutated")

	const selectedSupplementRoles: Partial<Record<RoleName, number>> = {}
	for (const role of roleNames) {
		const selected = admittedSupplementCandidates.find((candidate) => sameRgb(candidate.rgb, treatment[role].rgb))
		if (selected) selectedSupplementRoles[role] = selected.id
	}
	const selectedSupplementIds = [...new Set(Object.values(selectedSupplementRoles))].sort((first, second) => first - second)
	const selectedAccentSupplement = admittedSupplementCandidates.find((candidate) =>
		candidate.id === selectedSupplementRoles.accent)
	const baselineAccentCandidate = context.candidates.find((candidate) => sameRgb(candidate.rgb, baseline.accent.rgb))
	const treatmentBackgroundCandidate = context.candidates.find((candidate) => sameRgb(candidate.rgb, treatment.background.rgb))
	const accentVisibilityEligible = selectedSupplementRoles.accent === undefined ||
		treatment.metrics.accentContrast >= CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CONTRAST
	const accentIdentityEligible = selectedAccentSupplement === undefined || baselineAccentCandidate === undefined ||
		((selectedAccentSupplement.text >= baselineAccentCandidate.text + CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN ||
			selectedAccentSupplement.chroma >= baselineAccentCandidate.chroma + CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN) &&
			selectedAccentSupplement.chroma >= baselineAccentCandidate.chroma - CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS &&
			(selectedAccentSupplement.chroma >= baselineAccentCandidate.chroma + CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN ||
				selectedAccentSupplement.saliency >= baselineAccentCandidate.saliency -
					CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN) &&
			!(baselineAccentCandidate.chroma >= CHROMATIC_ROLE_FULL_ACCENT_CHROMA &&
				selectedAccentSupplement.chroma < baselineAccentCandidate.chroma))
	const selectedRoleEligible = selectedSupplementRoles.accent !== undefined ||
		selectedSupplementRoles.foreground !== undefined
	const collapsedBackgroundEligible = selectedAccentSupplement === undefined ||
		!sameRgb(treatment.background.rgb, treatment.surface.rgb) || treatmentBackgroundCandidate === undefined ||
		treatmentBackgroundCandidate.chroma < CHROMATIC_ROLE_FULL_ACCENT_CHROMA
	const accentChromaEligible = selectedAccentSupplement === undefined ||
		selectedAccentSupplement.chroma >= CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA
	const collateralRoleChromaEligible = roleNames.every((role) => {
		const changed = !sameRgb(treatment[role].rgb, baseline[role].rgb) ||
			treatment[role].generated !== baseline[role].generated
		if (!changed || selectedSupplementRoles[role] !== undefined) return true
		const baselineCandidate = context.candidates.find((candidate) => sameRgb(candidate.rgb, baseline[role].rgb))
		const treatmentCandidate = context.candidates.find((candidate) => sameRgb(candidate.rgb, treatment[role].rgb))
		return baselineCandidate !== undefined && treatmentCandidate !== undefined &&
			treatmentCandidate.chroma >= baselineCandidate.chroma - CHROMATIC_ROLE_MAXIMUM_COLLATERAL_ROLE_CHROMA_LOSS
	})
	const emittedTreatment = selectedSupplementIds.length > 0 && accentVisibilityEligible && accentIdentityEligible &&
		selectedRoleEligible && collapsedBackgroundEligible && accentChromaEligible && collateralRoleChromaEligible
	const spatial = emittedTreatment ? treatment : baseline
	const changedRoles = roleNames.filter((role) =>
		!sameRgb(spatial[role].rgb, baseline[role].rgb) || spatial[role].generated !== baseline[role].generated)
	const gradientChanged = spatial.gradient.isGradient !== baseline.gradient.isGradient

	requireInvariant(admittedSupplementCandidates.length > 0 || isDeepStrictEqual(spatial, baseline),
		"an empty role-admitted supplement set changed the spatial palette")
	requireInvariant(emittedTreatment || isDeepStrictEqual(spatial, baseline),
		"unselected supplements changed the emitted spatial palette")
	requireInvariant((changedRoles.length === 0 && !gradientChanged) || emittedTreatment,
		"a changed output did not select a supplement")

	const extraction: ExtractionResult = {
		...context.extraction,
		version: CHROMATIC_ROLE_ALGORITHM_VERSION,
		methods: {
			spatial,
			expressive: context.extraction.methods.expressive,
			quantized: context.extraction.methods.quantized,
		},
		candidates: augmented.map(candidateDiagnostic),
		diagnostics: {
			...context.extraction.diagnostics,
			candidateCount: augmented.length,
			processingMs: Math.round(performance.now() - startedAt),
		},
	}
	requireInvariant(isDeepStrictEqual(extraction.methods.expressive, context.extraction.methods.expressive),
		"expressive palette changed")
	requireInvariant(isDeepStrictEqual(extraction.methods.quantized, context.extraction.methods.quantized),
		"quantized palette changed")

	return {
		extraction,
		analysis: context.analysis,
		candidates: augmented,
		certificate: {
			schemaVersion: 1,
			algorithmVersion: CHROMATIC_ROLE_ALGORITHM_VERSION,
			baselineAlgorithmVersion: CHROMATIC_ROLE_BASELINE_VERSION,
			availabilityAlgorithmVersion: CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
			selectionRule: "canonical-spatial-pipeline-with-bounded-chromatic-supplements",
			normalizedImageSha256: normalizedImageIdentity(image),
			candidateIdentity: {
				baselineSha256: baselineIdentity,
				augmentedSha256: augmentedIdentity,
				roleSolverSha256: roleSolverIdentity,
			},
			availability: {
				...availability.diagnostics,
				supplements: availability.supplements.map((supplement) => ({
					id: supplement.candidate.id,
					anchorDegrees: supplement.anchorDegrees,
					hex: supplement.candidate.hex,
					rgb: supplement.candidate.rgb,
					population: supplement.candidate.population,
					score: supplement.score,
					supportingRegionCount: supplement.supportingRegionCount,
					nearestBaselineDistance: supplement.nearestBaselineDistance,
				})),
			},
			solver: { guarded: guardedCertificate, joint: jointCertificate },
			baseline: paletteSummary(baseline),
			treatment: paletteSummary(treatment),
			emitted: paletteSummary(spatial),
			decision: {
				solverRan: admittedSupplementCandidates.length > 0,
				availableSupplementIds: supplementCandidates.map((candidate) => candidate.id),
				admittedSupplementIds: admittedSupplementCandidates.map((candidate) => candidate.id),
				selectedSupplementIds,
				selectedSupplementRoles,
				changedRoles,
				gradientChanged,
				emittedTreatment,
				accentVisibilityEligible,
				accentIdentityEligible,
				selectedRoleEligible,
				collapsedBackgroundEligible,
				accentChromaEligible,
				collateralRoleChromaEligible,
			},
			invariants: {
				canonicalCandidatePrefixUnchanged: true,
				supplementsAppendedOnly: true,
				uniqueCandidateIds: true,
				supplementIdsAboveBaseline: true,
				exactNormalizedSourcePixels: true,
				canonicalCandidatesNotMutated: true,
				noSupplementPreservesCanonical: true,
				unselectedSupplementsPreserveCanonical: true,
				expressiveFrozen: true,
				quantizedFrozen: true,
				everyChangedOutputSelectsSupplement: true,
				canonicalFamilyAssignmentsFrozen: true,
				overlappingPopulationNotRenormalized: true,
				minorFamilyRoleAdmissionBound: true,
				typographySupportedRoleAdmission: true,
				emittedAccentVisibilityBound: true,
				emittedAccentIdentityBound: true,
				emittedRoleEvidenceBound: true,
				emittedCollapsedBackgroundBound: true,
				emittedAccentChromaBound: true,
				emittedCollateralRoleChromaBound: true,
			},
			...(profile ? { foregroundContrastProfile: profile } : {}),
		},
	}
}

export function extractChromaticRolePalette(
	image: RawImage,
	profile?: ForegroundContrastProfile,
): ChromaticRoleExtraction {
	const { analysis: _analysis, candidates: _candidates, ...result } = extractChromaticRolePaletteWithContext(image, profile)
	return result
}

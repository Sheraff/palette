import { isDeepStrictEqual } from "node:util"
import {
	CHROMATIC_ROLE_FULL_ACCENT_CHROMA,
	CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS,
	CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN,
	CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION,
	CHROMATIC_ROLE_MAXIMUM_COLLATERAL_ROLE_CHROMA_LOSS,
	CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN,
	CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN,
	CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT,
	CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA,
	CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CONTRAST,
	extractChromaticRolePaletteWithContext,
} from "./chromatic-role-extract.ts"
import type { Candidate } from "./candidates.ts"
import { solveGuardedPalette, type GuardedPaletteCertificate } from "./guarded-palette.ts"
import { solveJointPalette, type JointPaletteCertificate } from "./joint-palette.ts"
import {
	buildTypographyChromaticCandidateAvailability,
	TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
	type TypographyChromaticCandidateSupplement,
} from "./typography-chromatic-candidate-availability.ts"
import type { Palette, RawImage, RGB, RoleName } from "./types.ts"

export const TYPOGRAPHY_CHROMATIC_ROLE_VERSION = "region-typography-chromatic-role-0.1.0-poc.1"
export const TYPOGRAPHY_CHROMATIC_ROLE_BASELINE_VERSION = "region-graph-0.19.0"

const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]

type PaletteSummary = {
	roles: Record<RoleName, { hex: string; generated: boolean }>
	gradient: boolean
	metrics: {
		foregroundBackgroundContrast: number
		foregroundSurfaceContrast: number
		accentBackgroundContrast: number
		accentSurfaceContrast: number
	}
}

export type TypographyChromaticRoleResult = {
	schemaVersion: 1
	algorithmVersion: typeof TYPOGRAPHY_CHROMATIC_ROLE_VERSION
	baselineAlgorithmVersion: typeof TYPOGRAPHY_CHROMATIC_ROLE_BASELINE_VERSION
	availabilityAlgorithmVersion: typeof TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION
	canonical: PaletteSummary
	treatment: PaletteSummary
	availability: {
		addedSupplements: Array<{
			id: number
			anchorDegrees: number
			hex: string
			population: number
			chroma: number
			saliency: number
			text: number
		}>
	}
	decision: {
		solverRan: boolean
		admittedSupplementIds: number[]
		selectedSupplementIds: number[]
		selectedSupplementRoles: Partial<Record<RoleName, number>>
		exactChangedRoles: RoleName[]
		gradientChanged: boolean
		treatmentSelectsAddedCandidate: boolean
		selectedRoleEligible: boolean
		accentVisibilityEligible: boolean
		accentIdentityEligible: boolean
		collapsedBackgroundEligible: boolean
		accentChromaEligible: boolean
		collateralRoleChromaEligible: boolean
		postSolverSafetyEligible: boolean
		reviewEligible: boolean
	}
	solver: {
		guarded: GuardedPaletteCertificate | null
		joint: JointPaletteCertificate | null
	}
	invariants: {
		canonicalCandidatesUnchanged: true
		frozenAvailabilityUnchanged: true
		addedCandidatesAppendedOnly: true
		uniqueCandidateIds: true
		noGradientSurfaceRecovery: true
		readOnly: true
		canonicalOutputNotEmittedFromTreatment: true
	}
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function candidateForRole(candidates: readonly Candidate[], rgb: RGB, generated: boolean): Candidate | undefined {
	if (generated) return undefined
	return [...candidates].filter((candidate) => sameRgb(candidate.rgb, rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || first.id - second.id)[0]
}

function summary(palette: Palette): PaletteSummary {
	return {
		roles: Object.fromEntries(roleNames.map((role) => [role, {
			hex: palette[role].hex.toLowerCase(),
			generated: palette[role].generated,
		}])) as PaletteSummary["roles"],
		gradient: palette.gradient.isGradient,
		metrics: {
			foregroundBackgroundContrast: palette.metrics.foregroundContrast,
			foregroundSurfaceContrast: palette.metrics.foregroundSurfaceContrast,
			accentBackgroundContrast: palette.metrics.accentContrast,
			accentSurfaceContrast: palette.metrics.accentSurfaceContrast,
		},
	}
}

function supplementSummary(supplement: TypographyChromaticCandidateSupplement) {
	return {
		id: supplement.candidate.id,
		anchorDegrees: supplement.anchorDegrees,
		hex: supplement.candidate.hex,
		population: supplement.candidate.population,
		chroma: supplement.candidate.chroma,
		saliency: supplement.candidate.saliency,
		text: supplement.candidate.text,
	}
}

export function evaluateTypographyChromaticRole(image: RawImage): TypographyChromaticRoleResult {
	const canonicalContext = extractChromaticRolePaletteWithContext(image)
	const canonical = canonicalContext.extraction.methods.spatial
	const candidatesBefore = structuredClone(canonicalContext.candidates)
	const frozenSupplementIds = new Set(canonicalContext.certificate.availability.supplements.map((supplement) => supplement.id))
	const frozenAdmittedIds = new Set(canonicalContext.certificate.decision.admittedSupplementIds)
	const baselineCandidates = canonicalContext.candidates.filter((candidate) => !frozenSupplementIds.has(candidate.id))
	const canonicalRoleCandidates = canonicalContext.candidates.filter((candidate) =>
		!frozenSupplementIds.has(candidate.id) || frozenAdmittedIds.has(candidate.id))
	const availability = buildTypographyChromaticCandidateAvailability(canonicalContext.analysis, baselineCandidates)
	const frozenAvailability = availability.baselineAvailability.supplements.map((supplement) => supplementSummary({
		...supplement,
		nearestRepresentingDistance: supplement.nearestBaselineDistance,
	}))
	const canonicalAvailability = canonicalContext.certificate.availability.supplements.map((supplement) => ({
		id: supplement.id,
		anchorDegrees: supplement.anchorDegrees,
		hex: supplement.hex,
		population: supplement.population,
		chroma: canonicalContext.candidates.find((candidate) => candidate.id === supplement.id)?.chroma ?? 0,
		saliency: canonicalContext.candidates.find((candidate) => candidate.id === supplement.id)?.saliency ?? 0,
		text: canonicalContext.candidates.find((candidate) => candidate.id === supplement.id)?.text ?? 0,
	}))
	if (!isDeepStrictEqual(frozenAvailability, canonicalAvailability)) {
		throw new Error("Typography role POC changed frozen chromatic availability")
	}
	const admitted = availability.addedSupplements.filter((supplement) =>
		supplement.candidate.population <= CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION &&
		supplement.candidate.text >= CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT)
	const admittedCandidates = admitted.map((supplement) => supplement.candidate)
	const roleCandidates = [...canonicalRoleCandidates, ...admittedCandidates]
	if (!isDeepStrictEqual(roleCandidates.slice(0, canonicalRoleCandidates.length), canonicalRoleCandidates)) {
		throw new Error("Typography role POC changed the canonical role-candidate prefix")
	}
	if (new Set(roleCandidates.map((candidate) => candidate.id)).size !== roleCandidates.length) {
		throw new Error("Typography role POC created duplicate candidate IDs")
	}

	let treatment = canonical
	let guardedCertificate: GuardedPaletteCertificate | null = null
	let jointCertificate: JointPaletteCertificate | null = null
	if (admittedCandidates.length > 0) {
		const guarded = solveGuardedPalette(roleCandidates, canonicalContext.analysis)
		const joint = solveJointPalette(roleCandidates, canonicalContext.analysis, guarded.palette, {
			foregroundContrastProfile: undefined,
		})
		guardedCertificate = guarded.certificate
		jointCertificate = joint.certificate
		treatment = joint.palette
	}

	const selectedSupplementRoles: Partial<Record<RoleName, number>> = {}
	for (const role of roleNames) {
		const selected = admittedCandidates.find((candidate) => sameRgb(candidate.rgb, treatment[role].rgb))
		if (selected) selectedSupplementRoles[role] = selected.id
	}
	const selectedSupplementIds = [...new Set(Object.values(selectedSupplementRoles))].sort((first, second) => first - second)
	const exactChangedRoles = roleNames.filter((role) =>
		!sameRgb(treatment[role].rgb, canonical[role].rgb) || treatment[role].generated !== canonical[role].generated)
	const gradientChanged = treatment.gradient.isGradient !== canonical.gradient.isGradient
	const selectedAccent = admittedCandidates.find((candidate) => candidate.id === selectedSupplementRoles.accent)
	const canonicalAccent = candidateForRole(canonicalContext.candidates, canonical.accent.rgb, canonical.accent.generated)
	const treatmentBackground = candidateForRole(roleCandidates, treatment.background.rgb, treatment.background.generated)
	const accentVisibilityEligible = selectedAccent === undefined ||
		treatment.metrics.accentContrast >= CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CONTRAST
	const accentIdentityEligible = selectedAccent === undefined || canonicalAccent === undefined ||
		((selectedAccent.text >= canonicalAccent.text + CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN ||
			selectedAccent.chroma >= canonicalAccent.chroma + CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN) &&
			selectedAccent.chroma >= canonicalAccent.chroma - CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS &&
			(selectedAccent.chroma >= canonicalAccent.chroma + CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN ||
				selectedAccent.saliency >= canonicalAccent.saliency -
					CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN) &&
			!(canonicalAccent.chroma >= CHROMATIC_ROLE_FULL_ACCENT_CHROMA &&
				selectedAccent.chroma < canonicalAccent.chroma))
	const selectedRoleEligible = selectedSupplementRoles.accent !== undefined ||
		selectedSupplementRoles.foreground !== undefined
	const collapsedBackgroundEligible = selectedAccent === undefined ||
		!sameRgb(treatment.background.rgb, treatment.surface.rgb) || treatmentBackground === undefined ||
		treatmentBackground.chroma < CHROMATIC_ROLE_FULL_ACCENT_CHROMA
	const accentChromaEligible = selectedAccent === undefined ||
		selectedAccent.chroma >= CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA
	const collateralRoleChromaEligible = roleNames.every((role) => {
		if (!exactChangedRoles.includes(role) || selectedSupplementRoles[role] !== undefined) return true
		const baselineCandidate = candidateForRole(canonicalContext.candidates, canonical[role].rgb, canonical[role].generated)
		const treatmentCandidate = candidateForRole(roleCandidates, treatment[role].rgb, treatment[role].generated)
		return baselineCandidate !== undefined && treatmentCandidate !== undefined &&
			treatmentCandidate.chroma >= baselineCandidate.chroma - CHROMATIC_ROLE_MAXIMUM_COLLATERAL_ROLE_CHROMA_LOSS
	})
	const treatmentSelectsAddedCandidate = selectedSupplementIds.length > 0
	const postSolverSafetyEligible = treatmentSelectsAddedCandidate && selectedRoleEligible && accentVisibilityEligible &&
		accentIdentityEligible && collapsedBackgroundEligible && accentChromaEligible && collateralRoleChromaEligible
	const reviewEligible = (exactChangedRoles.length > 0 || gradientChanged) && postSolverSafetyEligible && !gradientChanged

	if (!isDeepStrictEqual(canonicalContext.candidates, candidatesBefore)) {
		throw new Error("Typography role POC mutated canonical candidates")
	}
	return {
		schemaVersion: 1,
		algorithmVersion: TYPOGRAPHY_CHROMATIC_ROLE_VERSION,
		baselineAlgorithmVersion: TYPOGRAPHY_CHROMATIC_ROLE_BASELINE_VERSION,
		availabilityAlgorithmVersion: TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
		canonical: summary(canonical),
		treatment: summary(treatment),
		availability: { addedSupplements: availability.addedSupplements.map(supplementSummary) },
		decision: {
			solverRan: admittedCandidates.length > 0,
			admittedSupplementIds: admittedCandidates.map((candidate) => candidate.id),
			selectedSupplementIds,
			selectedSupplementRoles,
			exactChangedRoles,
			gradientChanged,
			treatmentSelectsAddedCandidate,
			selectedRoleEligible,
			accentVisibilityEligible,
			accentIdentityEligible,
			collapsedBackgroundEligible,
			accentChromaEligible,
			collateralRoleChromaEligible,
			postSolverSafetyEligible,
			reviewEligible,
		},
		solver: { guarded: guardedCertificate, joint: jointCertificate },
		invariants: {
			canonicalCandidatesUnchanged: true,
			frozenAvailabilityUnchanged: true,
			addedCandidatesAppendedOnly: true,
			uniqueCandidateIds: true,
			noGradientSurfaceRecovery: true,
			readOnly: true,
			canonicalOutputNotEmittedFromTreatment: true,
		},
	}
}

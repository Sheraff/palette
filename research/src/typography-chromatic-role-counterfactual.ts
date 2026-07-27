import { isDeepStrictEqual } from "node:util"
import {
	CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION,
	CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT,
	extractChromaticRolePaletteWithContext,
} from "./chromatic-role-extract.ts"
import { evaluateJointRoleCounterfactual } from "./joint-palette.ts"
import { buildTypographyChromaticCandidateAvailability } from "./typography-chromatic-candidate-availability.ts"
import type { RawImage, RoleName } from "./types.ts"

export const TYPOGRAPHY_CHROMATIC_ROLE_COUNTERFACTUAL_VERSION =
	"typography-chromatic-role-counterfactual-0.1.0-development"

const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]

export function traceTypographyChromaticRoleCounterfactuals(image: RawImage) {
	const canonicalContext = extractChromaticRolePaletteWithContext(image)
	const candidatesBefore = structuredClone(canonicalContext.candidates)
	const frozenSupplementIds = new Set(canonicalContext.certificate.availability.supplements.map((supplement) => supplement.id))
	const frozenAdmittedIds = new Set(canonicalContext.certificate.decision.admittedSupplementIds)
	const baselineCandidates = canonicalContext.candidates.filter((candidate) => !frozenSupplementIds.has(candidate.id))
	const canonicalRoleCandidates = canonicalContext.candidates.filter((candidate) =>
		!frozenSupplementIds.has(candidate.id) || frozenAdmittedIds.has(candidate.id))
	const availability = buildTypographyChromaticCandidateAvailability(canonicalContext.analysis, baselineCandidates)
	const admitted = availability.addedSupplements.filter((supplement) =>
		supplement.candidate.population <= CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION &&
		supplement.candidate.text >= CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT)
	if (admitted.length !== 1) throw new Error(`Expected one admitted typography candidate, received ${admitted.length}`)
	const replacement = admitted[0]
	const roleCandidates = [...canonicalRoleCandidates, replacement.candidate]
	const evaluations = Object.fromEntries(roleNames.map((role) => [
		role,
		evaluateJointRoleCounterfactual(
			roleCandidates,
			canonicalContext.analysis,
			canonicalContext.extraction.methods.spatial,
			role,
			replacement.candidate,
		),
	])) as Record<RoleName, ReturnType<typeof evaluateJointRoleCounterfactual>>
	if (!isDeepStrictEqual(canonicalContext.candidates, candidatesBefore)) {
		throw new Error("Typography counterfactual trace mutated canonical candidates")
	}
	return {
		schemaVersion: 1 as const,
		traceVersion: TYPOGRAPHY_CHROMATIC_ROLE_COUNTERFACTUAL_VERSION,
		candidate: {
			id: replacement.candidate.id,
			anchorDegrees: replacement.anchorDegrees,
			hex: replacement.candidate.hex,
			population: replacement.candidate.population,
			chroma: replacement.candidate.chroma,
			saliency: replacement.candidate.saliency,
			text: replacement.candidate.text,
		},
		evaluations,
		invariants: {
			readOnly: true as const,
			otherThreeCanonicalRolesFrozen: true as const,
			gradientFrozenForForegroundAndAccent: true as const,
			noTargetHexInferred: true as const,
		},
	}
}

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
import { evaluateJointRoleCounterfactual } from "./joint-palette.ts"
import { buildTypographyChromaticCandidateAvailability } from "./typography-chromatic-candidate-availability.ts"
import type { Palette, RawImage, RGB, RoleColor } from "./types.ts"

export const TYPOGRAPHY_FOUR_COLOR_REALLOCATION_VERSION =
	"typography-four-color-reallocation-0.1.0-development"

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function roleColor(candidate: Candidate): RoleColor {
	return { rgb: candidate.rgb, hex: candidate.hex, generated: false, sourceDistance: 0 }
}

function candidateForRole(candidates: readonly Candidate[], role: RoleColor): Candidate | undefined {
	if (role.generated) return undefined
	return [...candidates].filter((candidate) => sameRgb(candidate.rgb, role.rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || first.id - second.id)[0]
}

export function traceTypographyFourColorReallocation(image: RawImage) {
	const canonicalContext = extractChromaticRolePaletteWithContext(image)
	const candidatesBefore = structuredClone(canonicalContext.candidates)
	const canonical = canonicalContext.extraction.methods.spatial
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
	const replacement = admitted[0].candidate
	const roleCandidates = [...canonicalRoleCandidates, replacement]
	const fieldCandidates = roleCandidates.filter((candidate) => !candidate.typographyOnly && candidate.id !== replacement.id)
	const canonicalAccent = candidateForRole(canonicalContext.candidates, canonical.accent)
	if (!canonicalAccent) throw new Error("Canonical accent candidate is unavailable")
	const canonicalBackground = candidateForRole(canonicalContext.candidates, canonical.background)
	const canonicalSurface = candidateForRole(canonicalContext.candidates, canonical.surface)
	const originalAccentTrace = evaluateJointRoleCounterfactual(
		roleCandidates,
		canonicalContext.analysis,
		canonical,
		"accent",
		replacement,
	)
	const originalObjectives = originalAccentTrace.ranking?.incumbentObjectives
	if (!originalObjectives) throw new Error("Original objective vector is unavailable")

	const alternatives = []
	for (const background of fieldCandidates) {
		for (const surface of fieldCandidates) {
			const backgroundPalette: Palette = {
				...canonical,
				background: roleColor(background),
			}
			const surfaceTrace = evaluateJointRoleCounterfactual(
				roleCandidates,
				canonicalContext.analysis,
				backgroundPalette,
				"surface",
				surface,
			)
			const fieldPalette: Palette = {
				...backgroundPalette,
				surface: roleColor(surface),
				gradient: surfaceTrace.gradient.selected,
			}
			const accentTrace = evaluateJointRoleCounterfactual(
				roleCandidates,
				canonicalContext.analysis,
				fieldPalette,
				"accent",
				replacement,
			)
			if (!accentTrace.hardFeasible || !accentTrace.ranking) continue
			const objectiveDelta = accentTrace.ranking.replacementObjectives.map((objective, index) =>
				objective - originalObjectives[index]) as [number, number, number, number, number]
			const objectiveMeanDelta = objectiveDelta.reduce((sum, objective) => sum + objective, 0) / objectiveDelta.length
			const accentVisibilityEligible = accentTrace.measurements.accentBackgroundContrast >=
				CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CONTRAST
			const accentIdentityEligible =
				(replacement.text >= canonicalAccent.text + CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN ||
					replacement.chroma >= canonicalAccent.chroma + CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN) &&
				replacement.chroma >= canonicalAccent.chroma - CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS &&
				(replacement.chroma >= canonicalAccent.chroma + CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN ||
					replacement.saliency >= canonicalAccent.saliency -
						CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN) &&
				!(canonicalAccent.chroma >= CHROMATIC_ROLE_FULL_ACCENT_CHROMA &&
					replacement.chroma < canonicalAccent.chroma)
			const collapsedBackgroundEligible = !sameRgb(background.rgb, surface.rgb) ||
				background.chroma < CHROMATIC_ROLE_FULL_ACCENT_CHROMA
			const accentChromaEligible = replacement.chroma >= CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA
			const collateralRoleChromaEligible =
				(canonicalBackground === undefined || sameRgb(background.rgb, canonical.background.rgb) ||
					background.chroma >= canonicalBackground.chroma - CHROMATIC_ROLE_MAXIMUM_COLLATERAL_ROLE_CHROMA_LOSS) &&
				(canonicalSurface === undefined || sameRgb(surface.rgb, canonical.surface.rgb) ||
					surface.chroma >= canonicalSurface.chroma - CHROMATIC_ROLE_MAXIMUM_COLLATERAL_ROLE_CHROMA_LOSS)
			const postSolverSafetyEligible = accentVisibilityEligible && accentIdentityEligible &&
				collapsedBackgroundEligible && accentChromaEligible && collateralRoleChromaEligible
			const roles = {
				background: background.hex,
				foreground: canonical.foreground.hex.toLowerCase(),
				surface: surface.hex,
				accent: replacement.hex,
			}
			alternatives.push({
				roles,
				distinctColorCount: new Set(Object.values(roles)).size,
				gradient: accentTrace.gradient.selected.isGradient,
				measurements: accentTrace.measurements,
				objectives: accentTrace.ranking.replacementObjectives,
				objectiveDelta,
				objectiveMeanDelta,
				identityCoverageDelta: objectiveDelta[4],
				postSolverSafety: {
					accentVisibilityEligible,
					accentIdentityEligible,
					collapsedBackgroundEligible,
					accentChromaEligible,
					collateralRoleChromaEligible,
					eligible: postSolverSafetyEligible,
				},
			})
		}
	}
	alternatives.sort((first, second) =>
		Number(second.postSolverSafety.eligible) - Number(first.postSolverSafety.eligible) ||
		second.objectiveMeanDelta - first.objectiveMeanDelta ||
		second.identityCoverageDelta - first.identityCoverageDelta ||
		first.roles.background.localeCompare(second.roles.background, "en") ||
		first.roles.surface.localeCompare(second.roles.surface, "en"))
	if (!isDeepStrictEqual(canonicalContext.candidates, candidatesBefore)) {
		throw new Error("Four-color reallocation trace mutated canonical candidates")
	}
	return {
		schemaVersion: 1 as const,
		traceVersion: TYPOGRAPHY_FOUR_COLOR_REALLOCATION_VERSION,
		canonical: {
			roles: {
				background: canonical.background.hex.toLowerCase(),
				foreground: canonical.foreground.hex.toLowerCase(),
				surface: canonical.surface.hex.toLowerCase(),
				accent: canonical.accent.hex.toLowerCase(),
			},
			gradient: canonical.gradient.isGradient,
			objectives: originalObjectives,
		},
		forcedCandidate: {
			hex: replacement.hex,
			population: replacement.population,
			chroma: replacement.chroma,
			saliency: replacement.saliency,
			text: replacement.text,
			role: "accent" as const,
		},
		counts: {
			fieldCandidates: fieldCandidates.length,
			combinations: fieldCandidates.length ** 2,
			hardFeasible: alternatives.length,
			postSolverSafetyEligible: alternatives.filter((alternative) => alternative.postSolverSafety.eligible).length,
		},
		alternatives,
		invariants: {
			maximumFourColors: alternatives.every((alternative) => alternative.distinctColorCount <= 4),
			foregroundFrozen: true as const,
			accentForcedToCertifiedFamily: true as const,
			noHardGateRelaxation: true as const,
			noPostSolverSafetyRelaxation: true as const,
			readOnly: true as const,
		},
	}
}

import type { FieldHypothesis, NativePaletteEvidence } from "./palette-core.ts";

import { buildRoleSpecificIdentityObligations, classifyFieldConditionalFamilyRole } from "./role-obligations.ts";

import type { FamilyRolePreference, FieldConditionalRoleEvidence, RoleSpecificIdentityObligation } from "./role-obligations.ts";

/**
 * The role a family's own evidence requires of it under one field hypothesis. This is the
 * bridge between the field-conditional role classifier and the identity objective: without
 * it the selector can credit a family for artwork identity in a role its evidence rejects.
 */
export type FamilyRoleRequirement = Readonly<{
	familyId: string
	fieldHypothesisId: string
	requiredRole: FamilyRolePreference
	confidence: number
}>

export type RoleEvidence = Readonly<{
	obligations: readonly RoleSpecificIdentityObligation[]
	requirements: readonly FamilyRoleRequirement[]
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function classifyAll(
	evidence: NativePaletteEvidence,
	fieldHypotheses: readonly FieldHypothesis[],
): FieldConditionalRoleEvidence[] {
	const families = [...new Map([...evidence.families]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((family) => [family.id, family] as const)).values()]
	const fields = [...new Map([...fieldHypotheses]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((field) => [field.id, field] as const)).values()]
	return fields.flatMap((field) => families.map((family) =>
		classifyFieldConditionalFamilyRole(family, field)))
}

/**
 * One classification pass that serves both consumers: the role-specific obligations used by
 * transition promotion, and the field-conditional role requirements the identity objective
 * needs in order to credit a family only in a role its evidence supports.
 */
export function buildRoleEvidence(
	evidence: NativePaletteEvidence,
	fieldHypotheses: readonly FieldHypothesis[],
	requirementFamilyIds: readonly string[] = [],
): RoleEvidence {
	const classified = classifyAll(evidence, fieldHypotheses)
	const wanted = new Set(requirementFamilyIds)
	const requirements = new Map<string, FamilyRoleRequirement>()
	for (const candidate of classified) {
		if (!wanted.has(candidate.familyId)) continue
		const key = `${candidate.familyId}\0${candidate.fieldHypothesisId}`
		if (requirements.has(key)) continue
		requirements.set(key, {
			familyId: candidate.familyId,
			fieldHypothesisId: candidate.fieldHypothesisId,
			requiredRole: candidate.fieldOwned ? "ambiguous" : candidate.preference,
			confidence: candidate.confidence,
		})
	}
	return {
		obligations: buildRoleSpecificIdentityObligations(classified),
		requirements: [...requirements.values()].sort((first, second) =>
			compareAscii(first.familyId, second.familyId) ||
			compareAscii(first.fieldHypothesisId, second.fieldHypothesisId)),
	}
}

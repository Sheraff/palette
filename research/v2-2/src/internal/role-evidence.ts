import type { FieldHypothesis, NativePaletteEvidence } from "./palette-core.ts";

import { buildRoleSpecificIdentityObligations, classifyFieldConditionalFamilyRole } from "./role-obligations.ts";

import type { RoleSpecificIdentityObligation } from "./role-obligations.ts";

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function buildRoleObligations(
	evidence: NativePaletteEvidence,
	fieldHypotheses: readonly FieldHypothesis[],
): readonly RoleSpecificIdentityObligation[] {
	const families = [...new Map([...evidence.families]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((family) => [family.id, family] as const)).values()]
	const fields = [...new Map([...fieldHypotheses]
		.sort((first, second) => compareAscii(first.id, second.id))
		.map((field) => [field.id, field] as const)).values()]
	return buildRoleSpecificIdentityObligations(fields.flatMap((field) => families.map((family) =>
		classifyFieldConditionalFamilyRole(family, field))))
}

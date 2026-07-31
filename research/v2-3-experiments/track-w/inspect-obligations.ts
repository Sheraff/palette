/**
 * Why a case does or does not respond to the incumbent-chroma asymmetry.
 *
 * Dumps the identity obligation list for an artwork — priority, prototype chroma, the
 * field-conditional `requiredRole`, and which family the winner placed in each role — so
 * the gate's premise ("a HIGHER-priority chromatic obligation was pushed out of the
 * foreground") can be checked against the artwork instead of assumed.
 *
 *   node ... inspect-obligations.ts <case-substring>
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { CASES } from "./run.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

for (const needle of process.argv.slice(2)) {
	const caseFile = CASES.find((entry) => entry.includes(needle))
	if (!caseFile) { console.log(`?? ${needle} not in case set`); continue }
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const details = extractPaletteDetails(image) as unknown as {
		identityObligations?: readonly { familyId: string; priority: number; chroma: number }[]
		identityRoleRequirements?: readonly { familyId: string; fieldHypothesisId: string; requiredRole: string; foregroundEvidence?: number }[]
		winner: { background: { hex: string }; surface: { hex: string }; foreground: { hex: string }; accent: { hex: string }; familyRoles?: Record<string, string>; sourceFieldHypothesisId?: string }
	}
	console.log(`\n=== ${caseFile} (${image.width}x${image.height})`)
	const winner = details.winner
	console.log(`winner: ${winner.background.hex} ${winner.surface.hex} ${winner.foreground.hex} ${winner.accent.hex}`)
	console.log(`familyRoles: ${JSON.stringify(winner.familyRoles)}  field=${winner.sourceFieldHypothesisId}`)
	const requirements = details.identityRoleRequirements ?? []
	console.log("obligations (priority, chroma, requiredRole@winner-field, fgEvidence):")
	for (const obligation of details.identityObligations ?? []) {
		const requirement = requirements.find((entry) =>
			entry.familyId === obligation.familyId && entry.fieldHypothesisId === winner.sourceFieldHypothesisId)
		const placed = Object.entries(winner.familyRoles ?? {})
			.filter(([, id]) => id === obligation.familyId).map(([role]) => role).join(",") || "-"
		console.log(`  p${obligation.priority}  chroma ${obligation.chroma.toFixed(4)}  ${obligation.familyId.padEnd(16)} role=${(requirement?.requiredRole ?? "?").padEnd(11)} fgEv=${(requirement?.foregroundEvidence ?? 0).toFixed(3)}  placed=${placed}`)
	}
}

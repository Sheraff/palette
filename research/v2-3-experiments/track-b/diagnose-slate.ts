// Track B diagnostic: candidate-domain availability and size.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/diagnose-slate.ts <caseId> [familyId...]

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/GitHub/palette/images",
].filter((value): value is string => typeof value === "string")
const REPO_ROOTS = [resolve(import.meta.dirname, "../../.."), "/Users/Flo/GitHub/palette"]

function locate(caseId: string): string {
	for (const root of caseId.includes("/") ? REPO_ROOTS : IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

const [caseId, ...watchFamilies] = process.argv.slice(2)
if (!caseId) throw new Error("usage: diagnose-slate.ts <caseId> [familyId...]")

const image = await loadNativeImage(locate(caseId))
const seed = buildPaletteSeedDomain(image)
const roles = ["background", "surface", "foreground", "accent"] as const

console.log(`# ${caseId}`)
console.log(`  complete candidate treatments: ${seed.completeTreatments.length}  (bound 1500)`)
console.log(`  seed additions: ${seed.additions.length}`)
console.log(`  identity obligations: ${seed.identityObligations.map(({ familyId }) => familyId).join(", ")}`)

console.log(`\n## representatives now exposed per obligation family`)
for (const { familyId } of seed.identityObligations) {
	const family = seed.evidence.families.find(({ id }) => id === familyId)
	if (!family) continue
	console.log(`  ${familyId}: ${family.representatives.map(({ hex, strategy }) => `${hex}(${strategy})`).join(" ")}`)
}

for (const familyId of watchFamilies) {
	console.log(`\n## candidates using ${familyId} in any role`)
	const using = seed.completeTreatments.filter((treatment) =>
		roles.some((role) => treatment.familyRoles[role] === familyId))
	console.log(`  ${using.length} candidate(s)`)
	const seen = new Set<string>()
	for (const treatment of using) {
		const line = roles.map((role) =>
			`${role[0]}=${treatment[role].hex}${treatment.familyRoles[role] === familyId ? "*" : ""}`).join(" ")
		if (seen.has(line)) continue
		seen.add(line)
		if (seen.size > 24) break
		console.log(`    ${line}`)
	}
}

const details = extractPaletteDetails(image)
console.log(`\n## winner`)
console.log(`  ${roles.map((role) => `${role[0]}=${details.winner[role].hex}(${details.winner.familyRoles[role]})`).join(" ")}`)

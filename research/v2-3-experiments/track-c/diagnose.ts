/**
 * Track C diagnostic: what identity evidence exists, what became an obligation, and how the
 * field-conditional role classifier scores those families against the winning field.
 *
 * Usage (from the repository root):
 *   node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/diagnose.ts johns meteora
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { classifyFieldConditionalFamilyRole } from "../../v2-3/src/internal/role-obligations.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { EVAL_CASES } from "./cases.ts"

const trackRoot = fileURLToPath(new URL(".", import.meta.url))
const packageRoot = resolve(trackRoot, "../..")

function imagesRoot(): string {
	const configured = process.env.TRACK_C_IMAGES_ROOT
	if (configured) return configured
	const local = resolve(packageRoot, "images")
	if (existsSync(resolve(local, "johns.jpg"))) return local
	return "/Users/Flo/github/palette/images"
}

function hex(oklab: readonly number[]): string {
	return `L${oklab[0].toFixed(3)} a${oklab[1].toFixed(3)} b${oklab[2].toFixed(3)}`
}

async function diagnose(id: string): Promise<void> {
	const testCase = EVAL_CASES.find((candidate) => candidate.id === id)
	if (!testCase) throw new Error(`Unknown case ${id}`)
	const image = await loadNativeImage(testCase.file.startsWith("images/")
		? resolve(imagesRoot(), testCase.file.slice("images/".length))
		: resolve(process.env.TRACK_C_REPO_ROOT ?? "/Users/Flo/github/palette", testCase.file))
	const seed = buildPaletteSeedDomain(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const details = extractPaletteDetails(image)
	const winner = details.winner
	const familyById = new Map(seed.evidence.families.map((family) => [family.id, family]))
	const laneOf = (familyId: string): string => seed.evidence.lanes
		.filter(({ familyIds }) => familyIds.includes(familyId))
		.map(({ name }) => name[0]).join("")
	const obligationByFamily = new Map(seed.identityObligations.map((obligation) => [obligation.familyId, obligation]))
	const winnerRoles = new Map(Object.entries(winner.familyRoles)
		.map(([role, familyId]) => [familyId as string, role]))

	console.log(`\n================ ${id} ================`)
	console.log(`winner: ${winner.background.hex} ${winner.surface.hex} ${winner.foreground.hex} ${winner.accent.hex} ` +
		`${winner.gradient ? "gradient" : "flat"} ${winner.collapse.surface ? "S+" : "S-"}${winner.collapse.accent ? "A+" : "A-"}`)
	console.log(`winner families: bg=${winner.familyRoles.background} sf=${winner.familyRoles.surface} ` +
		`fg=${winner.familyRoles.foreground} ac=${winner.familyRoles.accent} field=${winner.sourceFieldHypothesisId}`)
	console.log(`identity obligations (bound ${seed.identityObligations.length}):`)
	for (const obligation of seed.identityObligations) {
		const family = familyById.get(obligation.familyId)!
		console.log(`  p${obligation.priority} ${obligation.familyId} pop=${(family.populationFraction * 100).toFixed(2)}% ` +
			`chroma=${family.chroma.toFixed(3)} sig=${obligation.source.signatureRoleScore.toFixed(3)} ` +
			`regionLevel=${obligation.source.regionEvidenceLevel} ${hex(family.prototype)}`)
	}

	const field = common.fieldHypotheses.map(({ hypothesis }) => hypothesis)
		.find(({ id: hypothesisId }) => hypothesisId === winner.sourceFieldHypothesisId)
	console.log(`signature/foreground lane families vs winning field (${field ? "found" : "MISSING"}):`)
	const laneIds = [...new Set(seed.evidence.lanes.flatMap(({ name, familyIds }) =>
		name === "field" ? [] : familyIds))]
	const rows = laneIds.map((familyId) => {
		const family = familyById.get(familyId)!
		const evidence = field ? classifyFieldConditionalFamilyRole(family, field) : null
		return { family, evidence }
	}).sort((first, second) => second.family.populationFraction - first.family.populationFraction)
	for (const { family, evidence } of rows) {
		console.log([
			`  ${family.id.padEnd(14)}`,
			`lane=${laneOf(family.id).padEnd(3)}`,
			`pop=${(family.populationFraction * 100).toFixed(2).padStart(6)}%`,
			`chr=${family.chroma.toFixed(3)}`,
			`fieldS=${family.fieldScore.toFixed(3)}`,
			`sigS=${family.signatureScore.toFixed(3)}`,
			`fgS=${family.foregroundScore.toFixed(3)}`,
			`typo=${family.foregroundTypographyObservation.toFixed(3)}`,
			evidence ? `fg=${evidence.foreground.score.toFixed(3)} ac=${evidence.accent.score.toFixed(3)} ` +
				`pref=${evidence.preference.padEnd(10)} ${evidence.reason.padEnd(26)} sup=${evidence.coherentSupport.toFixed(2)}` : "",
			obligationByFamily.has(family.id) ? `OBLIGATION p${obligationByFamily.get(family.id)!.priority}` : "",
			winnerRoles.has(family.id) ? `WINNER:${winnerRoles.get(family.id)}` : "",
			`${hex(family.prototype)}`,
		].join(" "))
	}
}

const ids = process.argv.slice(2)
for (const id of ids.length > 0 ? ids : ["johns"]) await diagnose(id)

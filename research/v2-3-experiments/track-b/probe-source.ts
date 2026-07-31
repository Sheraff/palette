// Track B probe: which field hypothesis each winner came from (cheap, one pipeline run).
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/probe-source.ts [caseId...]

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { GRADIENT_CASES } from "./run-cases.ts"

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/github/palette/images",
].filter((value): value is string => typeof value === "string")

function locate(caseId: string): string {
	for (const root of IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

const cases = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [...GRADIENT_CASES]
for (const caseId of cases) {
	const details = extractPaletteDetails(await loadNativeImage(locate(caseId)))
	const winner = details.winner
	console.log(`${caseId.padEnd(18)} gradient=${String(winner.gradient).padEnd(5)} treatment=${winner.fieldTreatment.padEnd(22)} midpoint=${(details.midpoint.color?.hex ?? "-").padEnd(8)} hypothesis=${winner.sourceFieldHypothesisId}`)
}

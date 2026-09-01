// Track B: complete-candidate domain size per case, against the 1500 bound.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/candidate-counts.ts <label> [caseId...]

import { writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

import { FIXTURE_CASES, OFF_PANEL_CASES } from "./run-cases.ts"

const algorithmIndex = process.env.ALGORITHM_INDEX ??
	resolve(import.meta.dirname, "../../v2-3/index.ts")
const core = await import(resolve(algorithmIndex, "../src/internal/palette-core.ts")) as
	typeof import("../../v2-3/src/internal/palette-core.ts")
const loader = await import(resolve(algorithmIndex, "../src/internal/native-resolution-image.ts")) as
	typeof import("../../v2-3/src/internal/native-resolution-image.ts")

const IMAGE_ROOTS = [
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/GitHub/palette/images",
]
const REPO_ROOTS = [resolve(import.meta.dirname, "../../.."), "/Users/Flo/GitHub/palette"]

function locate(caseId: string): string {
	for (const root of caseId.includes("/") ? REPO_ROOTS : IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

const [label, ...selected] = process.argv.slice(2)
if (!label) throw new Error("usage: candidate-counts.ts <label> [caseId...]")
const cases = selected.length > 0 ? selected : [...FIXTURE_CASES, ...OFF_PANEL_CASES]
const records: Array<{ caseId: string; candidates: number; additions: number; obligations: number }> = []
let worst = 0
for (const caseId of cases) {
	const seed = core.buildPaletteSeedDomain(await loader.loadNativeImage(locate(caseId)))
	const record = {
		caseId,
		candidates: seed.completeTreatments.length,
		additions: seed.additions.length,
		obligations: seed.identityObligations.length,
	}
	records.push(record)
	worst = Math.max(worst, record.candidates)
	process.stdout.write(`${caseId.padEnd(50)} candidates=${String(record.candidates).padStart(5)} additions=${String(record.additions).padStart(5)} obligations=${record.obligations}\n`)
}
process.stdout.write(`\nworst-case candidate count: ${worst} (bound 1500)\n`)
writeFileSync(resolve(import.meta.dirname, `counts-${label}.json`), `${JSON.stringify(records, null, "\t")}\n`)

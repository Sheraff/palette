import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import { decideGradientEligibility, GRADIENT_ELIGIBILITY_CANDIDATE_VERSION } from "./src/gradient-eligibility.ts"
import type { CorpusResult } from "./src/types.ts"

type ValidationEntry = {
	cohort: "development" | "holdout"
	file: string
	baselineGradient: boolean
	evidence: Parameters<typeof decideGradientEligibility>[0] | null
}
type Validation = { entries: ValidationEntry[] }

const targetFiles = ["birdsofprey.jpg", "doja.jpg", "muse.jpg", "nada.jpg"] as const
const [resultsArgument, validationArgument, outputArgument] = process.argv.slice(2)
if (!resultsArgument || !validationArgument || !outputArgument) {
	throw new Error("Usage: prepare-gradient-eligibility-targeted-review.ts <results.json> <validation.json> <output.json>")
}
const [resultsSource, validationSource] = await Promise.all([
	readFile(resolve(resultsArgument), "utf8"),
	readFile(resolve(validationArgument), "utf8"),
])
const results = JSON.parse(resultsSource) as CorpusResult
const validation = JSON.parse(validationSource) as Validation
const paletteByFile = new Map(results.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const evidenceByFile = new Map(validation.entries.filter((entry) => entry.cohort === "development")
	.map((entry) => [entry.file, entry]))
const entries = targetFiles.map((file) => {
	const palette = paletteByFile.get(file)
	const validationEntry = evidenceByFile.get(file)
	if (!palette || !validationEntry?.baselineGradient || !validationEntry.evidence) {
		throw new Error(`Targeted review evidence is unavailable for ${file}`)
	}
	return {
		familyId: `validation-${file.replace(/\.[^.]+$/, "")}`,
		anchor: { file: `images/${file}` },
		palette,
		evidence: validationEntry.evidence,
		candidate: decideGradientEligibility(validationEntry.evidence),
	}
})
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	developmentVersion: "gradient-eligibility-targeted-review-0.1.0",
	experimentVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	algorithmVersion: "region-graph-0.17.0",
	generatedAt: new Date().toISOString(),
	summary: { reviewCases: entries.length, reviewBatches: 1, purpose: "resolve-contradictory-gradient-evidence" },
	reviewQueue: entries.map((entry) => ({ familyId: entry.familyId, batch: 1, stratum: "targeted-contradiction" })),
	entries,
})
process.stderr.write(`Prepared ${entries.length} targeted gradient-eligibility cases\n`)

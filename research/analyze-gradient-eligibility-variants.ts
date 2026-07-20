import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"

type Development = { entries: Array<{ familyId: string; evidence: GradientEligibilityEvidence }> }
type VariantArtifact = {
	developmentSha256: string
	details: Array<{
		familyId: string
		comparisons: Array<{
			file: string
			endpointComparable: boolean
			baselineGradient: boolean
			evidence: GradientEligibilityEvidence | null
		}>
	}>
}

const [developmentArgument, variantsArgument, outputArgument] = process.argv.slice(2)
if (!developmentArgument || !variantsArgument || !outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-variants.ts <development.json> <variants.json> <output.json>")
}

function sha256(value: Buffer): string {
	return createHash("sha256").update(value).digest("hex")
}

const [developmentSource, variantsSource] = await Promise.all([
	readFile(resolve(developmentArgument)),
	readFile(resolve(variantsArgument)),
])
const development = JSON.parse(developmentSource.toString("utf8")) as Development
const variants = JSON.parse(variantsSource.toString("utf8")) as VariantArtifact
if (!Array.isArray(development.entries) || !Array.isArray(variants.details) ||
	variants.developmentSha256 !== sha256(developmentSource)) throw new Error("Variant evidence does not match development evidence")
const developmentByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry.evidence]))
const comparisons = variants.details.flatMap((family) => {
	const anchorEvidence = developmentByFamily.get(family.familyId)
	if (!anchorEvidence) throw new Error(`Variant family is absent from development evidence: ${family.familyId}`)
	const anchor = decideGradientEligibility(anchorEvidence)
	return family.comparisons.filter((comparison) => comparison.endpointComparable).map((comparison) => {
		const variant = comparison.baselineGradient && comparison.evidence
			? decideGradientEligibility(comparison.evidence)
			: { eligible: false, reason: "baseline-not-gradient" as const }
		return {
			familyId: family.familyId,
			file: comparison.file,
			baselineGradient: comparison.baselineGradient,
			anchorEligible: anchor.eligible,
			variantEligible: variant.eligible,
			anchorReason: anchor.reason,
			variantReason: variant.reason,
			stable: anchor.eligible === variant.eligible,
		}
	})
})
const baselineStable = comparisons.filter((comparison) => comparison.baselineGradient)
const familyIds = new Set(baselineStable.map((comparison) => comparison.familyId))
const stableFamilyIds = [...familyIds].filter((familyId) =>
	baselineStable.filter((comparison) => comparison.familyId === familyId).every((comparison) => comparison.stable))
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-native-variant-analysis-0.1.0",
	generatedAt: new Date().toISOString(),
	candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	developmentSha256: sha256(developmentSource),
	variantsSha256: sha256(variantsSource),
	summary: {
		comparableVariants: comparisons.length,
		canonicalGradientStableVariants: baselineStable.length,
		candidateStableVariants: baselineStable.filter((comparison) => comparison.stable).length,
		candidateUnstableVariants: baselineStable.filter((comparison) => !comparison.stable).length,
		familiesWithCanonicalGradientStableVariants: familyIds.size,
		candidateStableFamilies: stableFamilyIds.length,
	},
	unstable: baselineStable.filter((comparison) => !comparison.stable),
})
process.stderr.write(`Reanalyzed ${baselineStable.length} canonical-gradient-stable native variants\n`)

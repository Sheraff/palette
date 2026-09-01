// Track D instrumentation: how often does the diffuse-composite pass fire, how many
// domains does it emit, and do they reach the retained field-hypothesis slate?
// Evaluation-only.
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"

const IMAGE_ROOT = process.env.PALETTE_IMAGE_ROOT ?? "/Users/Flo/github/palette/images"

console.log("case                 composite  eligible  slate-hypotheses  gradient-hypotheses")
for (const fixture of reviewFixtures) {
	const image = await loadNativeImage(`${IMAGE_ROOT}/${fixture.caseId}`)
	const seed = buildPaletteSeedDomain(image)
	const composite = seed.fieldDomains.filter(({ kind }) => kind === "diffuse-composite")
	const eligible = composite.filter(({ eligible: value }) => value)
	const compositeIds = new Set(composite.map(({ id }) => id))
	const fromComposite = seed.fieldHypotheses.filter((hypothesis) =>
		hypothesis.gradientEvidence !== null && compositeIds.has(hypothesis.gradientEvidence.fieldDomainId))
	console.log([
		fixture.caseId.padEnd(20),
		String(composite.length).padStart(9),
		String(eligible.length).padStart(9),
		String(fromComposite.length).padStart(17),
		String(seed.fieldHypotheses.filter(({ kind }) => kind === "gradient-field").length).padStart(20),
	].join(""))
}

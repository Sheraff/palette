// Track D: full 34-fixture neutrality sweep. Compares live output against the frozen
// failed-checkpoint fixtures and reports every difference. Evaluation-only.
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"
import { extractPaletteFromBytes } from "../../v2-3/index.ts"

const IMAGE_ROOT = process.env.PALETTE_IMAGE_ROOT ?? "/Users/Flo/github/palette/images"

let changed = 0
for (const fixture of reviewFixtures) {
	const extraction = await extractPaletteFromBytes(`${IMAGE_ROOT}/${fixture.caseId}`)
	const { background, surface, foreground, accent, gradient } = extraction.winner
	const actual = [background.hex, surface.hex, foreground.hex, accent.hex]
	const actualMidpoint = extraction.researchRender?.field.stops[1].hex
	const same = actual.every((hex, index) => hex === fixture.roles[index]) &&
		gradient === fixture.gradient &&
		(actualMidpoint ?? null) === (fixture.midpoint ?? null)
	if (same) {
		console.log(`  same    ${fixture.caseId}`)
		continue
	}
	changed += 1
	console.log(`CHANGED   ${fixture.caseId}`)
	console.log(`    before ${fixture.roles.join(" ")} ${fixture.gradient ? "gradient" : "flat"} ${fixture.midpoint ?? "-"}`)
	console.log(`    after  ${actual.join(" ")} ${gradient ? "gradient" : "flat"} ${actualMidpoint ?? "-"}`)
}
console.log(`\n${changed} of ${reviewFixtures.length} fixtures changed`)

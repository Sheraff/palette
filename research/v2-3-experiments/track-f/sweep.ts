/**
 * Track F sweep harness: runs the 34 review fixtures (or a named subset) through
 * `research/v2-3` and prints one line per case, plus a diff against the fixture
 * expectations. Deliberately outside `research/v2-3/src` so the architecture test
 * is unaffected.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/sweep.ts [caseId ...]
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"


const requested = process.argv.slice(2)
const selected = requested.length === 0
	? reviewFixtures
	: reviewFixtures.filter(({ caseId }) => requested.some((name) => caseId === name || caseId === `${name}.jpg` || caseId.startsWith(`${name}.`)))

if (selected.length === 0) {
	console.error(`no fixture matched ${requested.join(", ")}`)
	process.exit(1)
}

let changed = 0
for (const fixture of selected) {
	const file = corpusPath(`images/${fixture.caseId}`)
	const extraction = await extractPaletteFromBytes(file)
	const { winner } = extraction
	const roles = [winner.background.hex, winner.surface.hex, winner.foreground.hex, winner.accent.hex] as const
	const midpoint = extraction.researchRender?.field.stops[1].hex
	const same = roles.every((hex, index) => hex === fixture.roles[index]) &&
		winner.gradient === fixture.gradient &&
		winner.collapse.surface === fixture.collapse[0] &&
		winner.collapse.accent === fixture.collapse[1] &&
		(midpoint ?? null) === (fixture.midpoint ?? null)
	if (!same) changed += 1
	const flags = `${winner.gradient ? "G" : "-"}${winner.collapse.surface ? "S" : "-"}${winner.collapse.accent ? "A" : "-"}`
	const suffix = midpoint ? ` mid=${midpoint}` : ""
	console.log(`${same ? "  " : "**"} ${fixture.caseId.padEnd(20)} ${roles.join(" ")} ${flags}${suffix}`)
	if (!same) {
		const expectedMidpoint = fixture.midpoint ? ` mid=${fixture.midpoint}` : ""
		const expectedFlags = `${fixture.gradient ? "G" : "-"}${fixture.collapse[0] ? "S" : "-"}${fixture.collapse[1] ? "A" : "-"}`
		console.log(`   ${"was".padEnd(20)} ${fixture.roles.join(" ")} ${expectedFlags}${expectedMidpoint}`)
	}
}
console.log(`\n${changed} of ${selected.length} changed against review-fixtures.ts`)

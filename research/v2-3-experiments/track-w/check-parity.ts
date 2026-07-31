/**
 * Byte-identity check for a sweep against the FROZEN 34-fixture parity expectations.
 *
 * `parity.test.ts` freezes the failed checkpoint's outputs, so a sweep taken at the
 * degenerate default must reproduce all 34 exactly — that is the evidence for
 * "default = byte-identical trunk" and it comes free with the baseline run.
 *
 *   node ... check-parity.ts <label>
 */
import { readFileSync, existsSync } from "node:fs"

import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"
import { keyOf, type Row } from "./run.ts"

const label = process.argv[2]
if (!label) throw new Error("usage: check-parity.ts <label>")

let checked = 0
let mismatched = 0
for (const fixture of reviewFixtures) {
	const path = `${import.meta.dirname}/data/${label}/${keyOf(fixture.source.file)}.json`
	if (!existsSync(path)) { console.log(`  -- ${fixture.caseId} not swept`); continue }
	const row = JSON.parse(readFileSync(path, "utf8")) as Row
	checked += 1
	const got: readonly string[] = [row.background, row.surface, row.foreground, row.accent]
	const want = fixture.roles
	const rolesMatch = got.every((hex, index) => hex === want[index])
	const gradientMatch = row.gradient === fixture.gradient
	const collapseMatch = row.collapse[0] === fixture.collapse[0] && row.collapse[1] === fixture.collapse[1]
	const midpointMatch = (fixture.midpoint ?? null) === row.midpoint
	if (rolesMatch && gradientMatch && collapseMatch && midpointMatch) continue
	mismatched += 1
	console.log(`  XX ${fixture.caseId}`)
	if (!rolesMatch) console.log(`       roles  want ${want.join(" ")}\n              got  ${got.join(" ")}`)
	if (!gradientMatch) console.log(`       gradient want ${fixture.gradient} got ${row.gradient}`)
	if (!collapseMatch) console.log(`       collapse want ${fixture.collapse} got ${row.collapse}`)
	if (!midpointMatch) console.log(`       midpoint want ${fixture.midpoint ?? null} got ${row.midpoint}`)
}
console.log(`\n${label}: ${checked - mismatched}/${checked} fixtures byte-identical to the frozen parity set`)

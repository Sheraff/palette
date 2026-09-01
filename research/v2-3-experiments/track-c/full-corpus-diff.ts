/**
 * Track C full-corpus diff: runs research/v2-3 over all 34 reviewed sources and reports every
 * case whose displayed treatment differs from the frozen review fixtures. Unlike the parity
 * test it does not stop at the first mismatch, so the complete set of expected parity breaks
 * is visible in one pass.
 *
 * Usage (from the repository root):
 *   node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/full-corpus-diff.ts
 */

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const trackRoot = fileURLToPath(new URL(".", import.meta.url))
const packageRoot = resolve(trackRoot, "../..")

function imagesRoot(): string {
	const configured = process.env.TRACK_C_IMAGES_ROOT
	if (configured) return configured
	const local = resolve(packageRoot, "images")
	if (existsSync(resolve(local, "johns.jpg"))) return local
	return "/Users/Flo/github/palette/images"
}

const roles = ["background", "surface", "foreground", "accent"] as const

async function main(): Promise<void> {
	const root = imagesRoot()
	const changes: Array<Record<string, unknown>> = []
	for (const fixture of reviewFixtures) {
		const extraction = await extractPaletteFromBytes(resolve(root, basename(fixture.source.file)))
		const actual = {
			roles: roles.map((role) => extraction.winner[role].hex),
			gradient: extraction.winner.gradient,
			collapse: [extraction.winner.collapse.surface, extraction.winner.collapse.accent],
			midpoint: extraction.researchRender?.field.stops[1].hex,
		}
		const expected = {
			roles: [...fixture.roles],
			gradient: fixture.gradient,
			collapse: [...fixture.collapse],
			midpoint: fixture.midpoint,
		}
		const same = JSON.stringify(actual) === JSON.stringify(expected)
		console.log(`${same ? "same   " : "CHANGED"} ${fixture.caseId.padEnd(18)} ` +
			`${actual.roles.join(" ")} ${actual.gradient ? "gradient" : "flat"} ` +
			`${actual.collapse[0] ? "S+" : "S-"}${actual.collapse[1] ? "A+" : "A-"} ${actual.midpoint ?? "-"}` +
			(same ? "" : `\n        was ${expected.roles.join(" ")} ${expected.gradient ? "gradient" : "flat"} ` +
				`${expected.collapse[0] ? "S+" : "S-"}${expected.collapse[1] ? "A+" : "A-"} ${expected.midpoint ?? "-"}`))
		if (!same) changes.push({ caseId: fixture.caseId, expected, actual })
	}
	console.log(`\nchanged cases: ${changes.length} of ${reviewFixtures.length}`)
	await mkdir(resolve(trackRoot, "runs"), { recursive: true })
	await writeFile(resolve(trackRoot, "runs", "full-corpus-diff.json"),
		`${JSON.stringify({ changedCount: changes.length, total: reviewFixtures.length, changes }, null, "\t")}\n`)
}

await main()

/**
 * **The role stage's double-run test.**
 *
 * `../../tests/determinism.test.ts` already runs the whole candidate twice on four synthetic covers.
 * This one exists because cycle 2 added three orderings that a careless implementation would have made
 * *input-order* dependent rather than *pixel-value* dependent, and the double-run is the cheap half of
 * catching that:
 *
 *  - the component set is a filter over a post-order traversal that uses an explicit stack;
 *  - the text grouping iterates a `Map` keyed by cluster id (sorted before it is read) and a
 *    single-linkage pass over components sorted by centroid;
 *  - both role rankings sort on a float score, so a tie that fell through to the array's incoming
 *    order would be stable in one process and not across two.
 *
 * A double-run in one process catches the crude half of that, and it is the half a prototype gets
 * wrong. It runs over both a synthetic fixture and, when the shards are present, the acceptance cover,
 * because the synthetic fixture has too few colours to produce the float ties the corpus produces.
 */

import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { GLYPH_ROW, INCOHERENT_MARKS, writeBars } from "./fixtures.ts"

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../../../../..")

/** Everything the parse decided that a later stage can read, serialised. */
function fingerprint(diagnostics: Awaited<ReturnType<typeof paletteWithDiagnostics>>): string {
	return JSON.stringify({
		palette: diagnostics.palette,
		notes: diagnostics.notes,
		swapped: diagnostics.swapped,
		attempts: diagnostics.attempts,
		textGroups: diagnostics.parse.textGroups,
		foregroundPool: diagnostics.parse.foregroundPool,
		accentPool: diagnostics.parse.accentPool,
		parseNotes: diagnostics.parse.notes,
		strokeWidths: diagnostics.parse.nodes.map((node) => node.strokeWidth),
	})
}

test("two runs over the same bytes decide the same roles, text groups and rankings", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-tos-roles-determinism-"))
	context.after(async () => {
		await rm(directory, { recursive: true, force: true })
	})
	const fixtures = [
		await writeBars(join(directory, "glyph-row.png"), 128, GLYPH_ROW),
		await writeBars(join(directory, "incoherent.png"), 128, INCOHERENT_MARKS),
	]
	const acceptance = join(REPOSITORY_ROOT, "00/ab67616d00001e02000001335fe604d859a69094.jpg")
	if (existsSync(acceptance)) fixtures.push(acceptance)

	for (const fixture of fixtures) {
		const first = fingerprint(await paletteWithDiagnostics(fixture))
		const second = fingerprint(await paletteWithDiagnostics(fixture))
		assert.equal(second, first, `${fixture}: the role stage moved between runs`)
	}
})

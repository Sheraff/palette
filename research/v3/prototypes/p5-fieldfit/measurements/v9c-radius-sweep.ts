/**
 * W-V9c — **the falsifier of the coherence gate's radius**, run because the gate check failed.
 *
 * The change spec's gate check requires that the `a8942d6547` giant illustration mark and the
 * `9646be9b20` 78%-of-frame region fail the self-coherence gate while the NARCOSIS crimson
 * (`45baf46c90`, mark `#8d2639`) survives it. At the family-merge radius the rule names — 1× the
 * regional same-colour bar — the crimson measures **.0589** and fails with them, so the spec's own
 * stop condition applies: report the fractions, and report what radius would separate them.
 *
 * This script sweeps the merge multiple over every entry that currently contributes a published
 * identity family on all 31 covers and prints the whole curve, so "no radius separates them" is a
 * measurement with a shape rather than a verdict. Run from `research/v3`:
 *
 *     node --experimental-strip-types \
 *       prototypes/p5-fieldfit/measurements/v9c-radius-sweep.ts out.json [cover…]
 *
 * The ladder is geometric over the two multiples the codebase already argues about: 1 (decision 18's
 * bar, what ships) and 8 (`ACCENT_FG_EXCLUSION_MULTIPLE`, and `P5_IDENTITY_BAR_MULTIPLE`'s measured
 * alternative), extended past both ends so the curve's asymptotes are visible.
 */

import { readFile, writeFile } from "node:fs/promises"

import { analyzeImage } from "../candidate.ts"
import { familyCovers } from "../src/assignment.ts"
import { coherenceSpectrum } from "../src/marks.ts"
import { decodeAndInventory } from "../src/decode.ts"

const MULTIPLES = [1, 2, 3, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 24, 32] as const

const [out, ...argv] = process.argv.slice(2)
if (out === undefined) throw new Error("usage: v9c-radius-sweep.ts <out.json> [cover…]")

const baselinePath = new URL("./v9b-baseline-0.8.2.json", import.meta.url)
const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Record<string, { path: string }>

const covers = argv.length > 0
	? argv.map((path) => [path.replace(/\.[^./]+$/, "").slice(-10), path] as const)
	: Object.entries(baseline).map(([id, row]) => [id, row.path] as const)

const round = (value: number, places = 4) => Number(value.toFixed(places))
const hex = (packed: number) => `#${packed.toString(16).padStart(6, "0")}`

const rows: Record<string, unknown> = {}
for (const [id, path] of covers) {
	const analysis = await analyzeImage(path)
	const { raster } = await decodeAndInventory(path)
	const identity = analysis.assignment?.identity ?? null
	const entries: unknown[] = []
	for (const entry of analysis.marks.marks) {
		if (!(entry.mass > 0)) continue
		const covered = identity === null
			? []
			: identity.families.filter((family) => familyCovers(family, entry.lab)).map((f) => f.rank)
		// Contributing entries, plus every entry above a percent of the frame: the collateral of a
		// widened radius is on the entries a widening would newly admit, not only on today's.
		if (covered.length === 0 && entry.massFraction < 0.01) continue
		entries.push({
			kind: entry.kind,
			hex: hex(entry.representative),
			pixels: entry.pixels,
			massFraction: round(entry.massFraction),
			chroma: round(entry.chroma),
			memberCount: entry.memberCount,
			familyRanks: covered,
			curve: coherenceSpectrum(entry, raster, MULTIPLES).map((value) => round(value)),
		})
	}
	rows[id] = { path, entries }
	process.stderr.write(`${id} ${entries.length} entries swept\n`)
}

await writeFile(out, `${JSON.stringify({ multiples: MULTIPLES, covers: rows }, null, 2)}\n`)
process.stdout.write(`${Object.keys(rows).length} covers → ${out}\n`)

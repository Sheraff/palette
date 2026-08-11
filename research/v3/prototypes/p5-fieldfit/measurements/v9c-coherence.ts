/**
 * W-V9c — **the family self-coherence measurement, taken before the gate is wired.**
 *
 * The ruling under measurement (v0.9.0's commit message, `reports/wv9b.md`'s loud finding): a
 * mark/region may contribute an identity family only if at least `NO_FIELD_EXPLAINED_FRACTION` of its
 * own pixels lie within the family-merge radius of its own colour. This script does not apply that
 * rule — it prints the fractions it would be applied to, so the gate is ruled on against numbers
 * rather than wired against an expectation.
 *
 * Run from `research/v3`:
 *
 *     node --experimental-strip-types \
 *       prototypes/p5-fieldfit/measurements/v9c-coherence.ts out.json [cover…]
 *
 * With no covers it reads the 31 of `measurements/v9b-baseline-0.8.2.json` — the union of the four
 * devloop sets, and the set every round document names covers from.
 *
 * Per cover it records every mark/region carrying mass, with:
 *
 *  - `selfCoherence` — the fraction against the **published** colour (the exact artwork triple the
 *    entry contributes to the agglomeration);
 *  - `selfCoherenceMedian` — the same fraction against the pre-snap median, so the choice of which
 *    colour's standing is being tested is arguable rather than asserted;
 *  - `contributes` — whether the entry's colour lands inside one of the **published** identity
 *    families (`familyCovers`, the same predicate the agglomeration merges by). That is the
 *    operational reading of "currently contributes a family", and it is the population the gate acts
 *    on.
 *
 * `entries` is truncated to the heaviest `TOP` per cover for the file's sake; `contributing` is
 * complete, and the summary counts are over every entry.
 */

import { readFile, writeFile } from "node:fs/promises"

import { analyzeImage } from "../candidate.ts"
import { familyCovers } from "../src/assignment.ts"
import { MARK_IDENTITY_COHERENCE_FRACTION } from "../src/marks.ts"

const TOP = 12

const [out, ...argv] = process.argv.slice(2)
if (out === undefined) throw new Error("usage: v9c-coherence.ts <out.json> [cover…]")

const baselinePath = new URL("./v9b-baseline-0.8.2.json", import.meta.url)
const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Record<
	string,
	{ background: string; surface: string; foreground: string; accent: string; path: string }
>

const covers = argv.length > 0
	? argv.map((path) => [path.replace(/\.[^./]+$/, "").slice(-10), path] as const)
	: Object.entries(baseline).map(([id, row]) => [id, row.path] as const)

const round = (value: number, places = 4) => Number(value.toFixed(places))
const hex = (packed: number) => `#${packed.toString(16).padStart(6, "0")}`

const rows: Record<string, unknown> = {}
let contributingTotal = 0
let contributingWouldFail = 0

for (const [id, path] of covers) {
	const analysis = await analyzeImage(path)
	const identity = analysis.assignment?.identity ?? null
	const entries = analysis.marks.marks
		.filter((entry) => entry.mass > 0)
		.map((entry) => {
			const covered = identity === null
				? []
				: identity.families.filter((family) => familyCovers(family, entry.lab)).map((f) => f.rank)
			return {
				kind: entry.kind,
				index: entry.index,
				hex: hex(entry.representative),
				pixels: entry.pixels,
				mass: round(entry.mass, 1),
				massFraction: round(entry.massFraction),
				chroma: round(entry.chroma),
				memberCount: entry.memberCount,
				selfCoherence: round(entry.selfCoherence),
				selfCoherenceMedian: round(entry.selfCoherenceMedian),
				passes: entry.selfCoherence >= MARK_IDENTITY_COHERENCE_FRACTION,
				contributes: covered.length > 0,
				familyRanks: covered,
			}
		})

	const contributing = entries.filter((entry) => entry.contributes)
	contributingTotal += contributing.length
	contributingWouldFail += contributing.filter((entry) => !entry.passes).length

	rows[id] = {
		path,
		accent: analysis.palette.roles.accent.hex,
		markScale: analysis.marks.scale.radius,
		markCriterion: analysis.marks.scale.criterion,
		entryCount: entries.length,
		passingCount: entries.filter((entry) => entry.passes).length,
		families: identity?.families.map((family) => ({
			rank: family.rank,
			hex: hex(family.representative),
			massFraction: round(family.massFraction),
		})) ?? [],
		contributing,
		entries: entries.slice(0, TOP),
	}
	process.stderr.write(
		`${id} ${entries.length} entries, ${contributing.length} contributing, ` +
			`${contributing.filter((entry) => !entry.passes).length} of those below the gate\n`,
	)
}

await writeFile(
	out,
	`${
		JSON.stringify({
			gate: MARK_IDENTITY_COHERENCE_FRACTION,
			wired: false,
			contributingTotal,
			contributingWouldFail,
			covers: rows,
		}, null, 2)
	}\n`,
)
process.stdout.write(
	`${Object.keys(rows).length} covers → ${out}; ` +
		`${contributingWouldFail}/${contributingTotal} contributing entries below the gate\n`,
)

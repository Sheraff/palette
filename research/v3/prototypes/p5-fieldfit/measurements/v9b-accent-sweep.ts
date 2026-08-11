/**
 * W-V9b — the accent tie-break sweep, and the delta table it is scored beside.
 *
 * Measurement only: it imports the prototype and prints, it decides nothing. The rule under test is
 * `ACCENT_TIEBREAK` (`src/assignment.ts`), which reads `P5_ACCENT_TIEBREAK` — so this script is run
 * **once per rule**, in its own process, because the constant is read at module load:
 *
 *     P5_ACCENT_TIEBREAK=mass   node --experimental-strip-types \
 *       prototypes/p5-fieldfit/measurements/v9b-accent-sweep.ts out-mass.json   <cover…>
 *     P5_ACCENT_TIEBREAK=chroma node --experimental-strip-types \
 *       prototypes/p5-fieldfit/measurements/v9b-accent-sweep.ts out-chroma.json <cover…>
 *
 * With no covers on the command line it reads the 31 of `measurements/v9b-baseline-0.8.2.json`,
 * which is the union of the four devloop sets and the set every round document names covers from.
 *
 * What it records per cover: the four published roles, and — for the accent — where in the candidate
 * pool it came from (`overlay` / `component` / `mark`, v0.9.0's third source), its chroma, its
 * salient mass, and how many identity families the assignment covered. The foreground shortlist's
 * length is recorded beside it because "the foreground ordering is unchanged" is a claim this sweep
 * is in a position to falsify and should therefore carry the evidence for.
 */

import { readFile, writeFile } from "node:fs/promises"

import { analyzeImage } from "../candidate.ts"
import { ACCENT_TIEBREAK } from "../src/assignment.ts"

const [out, ...argv] = process.argv.slice(2)
if (out === undefined) throw new Error("usage: v9b-accent-sweep.ts <out.json> [cover…]")

const baselinePath = new URL("./v9b-baseline-0.8.2.json", import.meta.url)
const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Record<
	string,
	{ background: string; surface: string; foreground: string; accent: string; path: string }
>

const covers = argv.length > 0
	? argv.map((path) => [path.replace(/\.[^./]+$/, "").slice(-10), path] as const)
	: Object.entries(baseline).map(([id, row]) => [id, row.path] as const)

const round = (value: number, places = 4) => Number(value.toFixed(places))

const rows: Record<string, unknown> = {}
for (const [id, path] of covers) {
	const analysis = await analyzeImage(path)
	const trace = analysis.assignment
	const chosen = trace?.chosen ?? null
	const accent = chosen?.accent ?? null
	rows[id] = {
		background: analysis.palette.roles.background.hex,
		surface: analysis.palette.roles.surface.hex,
		foreground: analysis.palette.roles.foreground.hex,
		accent: analysis.palette.roles.accent.hex,
		accentCollapsed: analysis.palette.collapse.accentCollapsed,
		escape: analysis.palette.escape !== null,
		gradient: analysis.palette.gradient === null ? 0 : analysis.palette.gradient.stops.length,
		accentSource: accent?.source ?? null,
		accentChroma: accent === null ? null : round(accent.chroma),
		accentMass: accent === null ? null : round(accent.mass, 1),
		accentShortlist: trace?.accentShortlist.map((candidate) => ({
			hex: candidate.color.hex,
			source: candidate.source,
			chroma: round(candidate.chroma),
			mass: round(candidate.mass, 1),
		})) ?? [],
		foregroundShortlist: trace?.foregroundShortlist.length ?? 0,
		coverage: chosen?.coverage ?? null,
		coverageDecided: trace?.coverageDecided ?? null,
		families: trace?.identity.families.map((family) => round(family.massFraction)) ?? [],
		totalFamilies: trace?.identity.totalFamilies ?? null,
		massRetained: trace === null ? null : round(trace.identity.massRetained),
		markEntries: analysis.marks.marks.length,
		markScale: analysis.marks.scale.radius,
		markCriterion: analysis.marks.scale.criterion,
	}
	process.stderr.write(`${id} ${analysis.palette.roles.accent.hex}\n`)
}

await writeFile(out, `${JSON.stringify({ rule: ACCENT_TIEBREAK, covers: rows }, null, 2)}\n`)
process.stdout.write(`${Object.keys(rows).length} covers under "${ACCENT_TIEBREAK}" → ${out}\n`)

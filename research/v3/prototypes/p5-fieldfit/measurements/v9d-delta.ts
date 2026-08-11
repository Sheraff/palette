/**
 * W-V9d — **the 31-cover delta table for v0.9.2, against what v0.9.0 published.**
 *
 * v0.9.2 ships the family self-coherence gate at `COHERENCE_GATE_BAR_MULTIPLE`. There is no flag and
 * no env override any more, so this runs once, in one process, and reports what the prototype
 * actually publishes:
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/v9d-delta.ts out.json
 *
 * With no covers it reads the 31 of `measurements/v9b-baseline-0.8.2.json`. Every row is diffed
 * against `v9b-published-0.9.0.json` — what v0.9.0 published, and what this prototype published up to
 * and including v0.9.1 — so the delta column is the gate's effect and nothing else.
 *
 * It supersedes `v9c-gate-sweep.ts`, which drove the same measurement through the
 * `P5_MARK_COHERENCE_GATE` / `P5_MARK_COHERENCE_MULTIPLE` pair that v0.9.2 removed. That script's two
 * imports no longer resolve; it is left in place as the record of how the bracket was measured, and
 * this file is the one to run.
 */

import { readFile, writeFile } from "node:fs/promises"

import { analyzeImage } from "../candidate.ts"
import { ALGORITHM_VERSION } from "../candidate.ts"
import { COHERENCE_GATE_BAR_MULTIPLE, MARK_IDENTITY_COHERENCE_FRACTION } from "../src/marks.ts"

const [out, ...argv] = process.argv.slice(2)
if (out === undefined) throw new Error("usage: v9d-delta.ts <out.json> [cover…]")

const baseline = JSON.parse(
	await readFile(new URL("./v9b-baseline-0.8.2.json", import.meta.url), "utf8"),
) as Record<string, { path: string }>
const published = JSON.parse(
	await readFile(new URL("./v9b-published-0.9.0.json", import.meta.url), "utf8"),
) as Record<string, { background: string; surface: string; foreground: string; accent: string }>

const covers = argv.length > 0
	? argv.map((path) => [path.replace(/\.[^./]+$/, "").slice(-10), path] as const)
	: Object.entries(baseline).map(([id, row]) => [id, row.path] as const)

const round = (value: number, places = 4) => Number(value.toFixed(places))
const hex = (packed: number) => `#${packed.toString(16).padStart(6, "0")}`

const rows: Record<string, unknown> = {}
const table: string[] = []
let moved = 0
for (const [id, path] of covers) {
	const analysis = await analyzeImage(path)
	const roles = analysis.palette.roles
	const before = published[id]
	const now = {
		background: roles.background.hex,
		surface: roles.surface.hex,
		foreground: roles.foreground.hex,
		accent: roles.accent.hex,
	}
	const delta = before === undefined
		? ["(no v0.9.0 row)"]
		: (["background", "surface", "foreground", "accent"] as const)
			.filter((role) => before[role] !== now[role])
			.map((role) => `${role} ${before[role]} → ${now[role]}`)
	if (delta.length > 0) {
		moved += 1
		table.push(`${id}  ${delta.join("; ")}`)
	}

	const trace = analysis.assignment
	rows[id] = {
		...now,
		delta,
		withheld: analysis.marks.marks
			.filter((entry) => entry.mass > 0 && !entry.identityCoherent)
			.map((entry) => ({
				kind: entry.kind,
				hex: hex(entry.representative),
				massFraction: round(entry.massFraction),
				selfCoherence: round(entry.selfCoherence),
			})),
		families: trace?.identity.families.map((family) => ({
			rank: family.rank,
			hex: hex(family.representative),
			massFraction: round(family.massFraction),
		})) ?? [],
		fieldCovered: trace?.fieldCovered ?? null,
		covered: trace?.chosen?.covered ?? null,
		coverage: trace?.chosen?.coverage ?? null,
		coverageDecided: trace?.coverageDecided ?? null,
		accentSource: trace?.chosen?.accent?.source ?? null,
		accentChroma: trace?.chosen?.accent == null ? null : round(trace.chosen.accent.chroma),
		massRetained: trace === null ? null : round(trace.identity.massRetained),
	}
	process.stderr.write(`${id} ${now.accent}${delta.length > 0 ? `  ${delta.join("; ")}` : ""}\n`)
}

await writeFile(
	out,
	`${
		JSON.stringify({
			algorithmVersion: ALGORITHM_VERSION,
			fraction: MARK_IDENTITY_COHERENCE_FRACTION,
			multiple: COHERENCE_GATE_BAR_MULTIPLE,
			moved,
			covers: rows,
		}, null, 2)
	}\n`,
)
process.stdout.write(
	`${ALGORITHM_VERSION} (gate on, ${COHERENCE_GATE_BAR_MULTIPLE}x bar): ` +
		`${moved}/${Object.keys(rows).length} covers move vs v0.9.0 → ${out}\n${table.join("\n")}\n`,
)

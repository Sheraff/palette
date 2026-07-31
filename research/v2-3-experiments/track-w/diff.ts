/**
 * Blast radius and acceptance scoring for a Track W sweep.
 *
 *   node ... diff.ts <baselineLabel> <candidateLabel>
 *
 * Reports: cases changed, which role moved, and the acceptance list from the LIVE verdict
 * warehouse (batches 20 and 23 are authoritative over older briefs — the recency rule).
 */
import { readFileSync, existsSync } from "node:fs"

import { CASES, keyOf, type Row } from "./run.ts"

const baseLabel = process.argv[2]
const candidateLabel = process.argv[3]
if (!baseLabel || !candidateLabel) throw new Error("usage: diff.ts <baseline> <candidate>")

const load = (label: string): Map<string, Row> => {
	const rows = new Map<string, Row>()
	for (const caseFile of CASES) {
		const path = `${import.meta.dirname}/data/${label}/${keyOf(caseFile)}.json`
		if (existsSync(path)) rows.set(caseFile, JSON.parse(readFileSync(path, "utf8")) as Row)
	}
	return rows
}

const base = load(baseLabel)
const candidate = load(candidateLabel)

/** The acceptance list, each entry keyed by a substring of the case path. */
const MUST_FLIP: readonly (readonly [string, string, string])[] = [
	["0005a918", "#f0d732", "OVER FLOW yellow (batch 20, strong)"],
	["0a392cb5", "#ffd800", "HOPE yellow (batch 20, strong)"],
	["9d178a", "#15a6a9", "BASSDRUM teal (batch 20, acceptable)"],
	["0e91d6c3", "#fbf072", "NADA yellow (batch 20, strong)"],
	["014fb430", "gold", "EL JOSI gold family (batch 20 / 21) — known fragile"],
	["13bebcae", "#d5c47f", "gold record (batch 23, strong)"],
]
const MUST_HOLD: readonly (readonly [string, string, string])[] = [
	["johns.jpg", "#f7f8fa", "white wordmark (batch 23, acceptable)"],
	["birdsofprey.jpg", "#030102", "black title (batch 23, strong)"],
	["04ccf0ae", "#d1e4d0", "MÚSICA white caption (batch 23, strong)"],
	["infected.jpg", "#49b7f6", "blue incumbent (batch 23, strong)"],
]
const FREE: readonly (readonly [string, string])[] = [
	["vvbrown.jpg", "both sides endorsed strong (field inversion)"],
	["01c08189", "PROJETO — gold endorsed, either acceptable"],
	["06eb2197", "both sides endorsed strong"],
]

const find = (needle: string): string | undefined => CASES.find((entry) => entry.includes(needle))

const changed: string[] = []
for (const caseFile of CASES) {
	const before = base.get(caseFile)
	const after = candidate.get(caseFile)
	if (!before || !after) continue
	if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(caseFile)
}

const measured = CASES.filter((entry) => base.has(entry) && candidate.has(entry))
console.log(`# ${baseLabel} -> ${candidateLabel}`)
console.log(`measured ${measured.length}/${CASES.length} cases; CHANGED ${changed.length} (${(100 * changed.length / Math.max(1, measured.length)).toFixed(1)} %)\n`)

const roleCounts = { background: 0, surface: 0, foreground: 0, accent: 0, gradient: 0, midpoint: 0 }
for (const caseFile of changed) {
	const before = base.get(caseFile)!
	const after = candidate.get(caseFile)!
	for (const role of ["background", "surface", "foreground", "accent"] as const) {
		if (before[role] !== after[role]) roleCounts[role] += 1
	}
	if (before.gradient !== after.gradient) roleCounts.gradient += 1
	if (before.midpoint !== after.midpoint) roleCounts.midpoint += 1
}
console.log(`role moves: ${Object.entries(roleCounts).map(([role, count]) => `${role} ${count}`).join("  ")}\n`)

const report = (title: string, entries: readonly (readonly string[])[], want: boolean): void => {
	console.log(`## ${title}`)
	for (const [needle, expected, note] of entries) {
		const caseFile = find(needle!)
		if (!caseFile) { console.log(`  ?? ${needle} not in case set`); continue }
		const before = base.get(caseFile)
		const after = candidate.get(caseFile)
		if (!before || !after) { console.log(`  -- ${needle} not measured`); continue }
		const moved = before.foreground !== after.foreground
		const hit = want
			? (note === undefined ? moved : expected!.startsWith("#") ? after.foreground === expected : moved)
			: !moved
		console.log(`  ${hit ? "OK " : "XX "} ${needle.padEnd(14)} fg ${before.foreground} -> ${after.foreground}   want ${want ? expected : `hold ${expected}`}`)
	}
	console.log()
}
report("MUST FLIP", MUST_FLIP, true)
report("MUST HOLD", MUST_HOLD, false)
console.log("## FREE")
for (const [needle, note] of FREE) {
	const caseFile = find(needle)
	if (!caseFile) continue
	const before = base.get(caseFile)
	const after = candidate.get(caseFile)
	if (!before || !after) continue
	console.log(`   .. ${needle.padEnd(14)} fg ${before.foreground} -> ${after.foreground}   (${note})`)
}

console.log("\n## every changed case")
for (const caseFile of changed) {
	const before = base.get(caseFile)!
	const after = candidate.get(caseFile)!
	const fmt = (row: Row): string => `${row.background} ${row.surface} ${row.foreground} ${row.accent} ${row.gradient ? "grad" : "flat"}`
	console.log(`  ${caseFile}`)
	console.log(`      - ${fmt(before)}`)
	console.log(`      + ${fmt(after)}`)
}

/**
 * Which changed cases carry a standing human verdict, and how strong.
 *
 * "Every other verdict-carrying artwork byte-preserved or attributed" is the acceptance
 * condition, so the movers have to be split into (a) the ones review asked for, (b) the
 * ones review has an opinion about that this change overrides, and (c) unseen artworks.
 *
 *   node ... verdict-audit.ts <baseline> <candidate>
 */
import { readFileSync, existsSync } from "node:fs"

import { CASES, keyOf, type Row } from "./run.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

const baseLabel = process.argv[2]
const candidateLabel = process.argv[3]
if (!baseLabel || !candidateLabel) throw new Error("usage: verdict-audit.ts <baseline> <candidate>")

type Verdict = { image: string; batch: string; verdict?: string }
const verdicts: Verdict[] = []
for (const line of readFileSync(`${ROOT}/research/v2-3-eval/data/verdicts.jsonl`, "utf8").split("\n")) {
	if (line.trim()) verdicts.push(JSON.parse(line) as Verdict)
}
const strengthOf = (image: string): { strongest: string; batches: string[] } => {
	const rows = verdicts.filter((entry) => image.includes(entry.image))
	const order = ["weak-fallback", "acceptable", "strong"]
	let strongest = "-"
	for (const row of rows) {
		if (row.verdict && order.indexOf(row.verdict) > order.indexOf(strongest)) strongest = row.verdict
	}
	return { strongest, batches: [...new Set(rows.map((row) => row.batch))] }
}

const load = (label: string, caseFile: string): Row | null => {
	const path = `${import.meta.dirname}/data/${label}/${keyOf(caseFile)}.json`
	return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Row : null
}

let changedWithVerdict = 0
let changedUnseen = 0
let heldWithVerdict = 0
const lines: string[] = []
for (const caseFile of CASES) {
	const before = load(baseLabel, caseFile)
	const after = load(candidateLabel, caseFile)
	if (!before || !after) continue
	const { strongest, batches } = strengthOf(caseFile)
	const changed = JSON.stringify(before) !== JSON.stringify(after)
	if (!changed) { if (strongest !== "-") heldWithVerdict += 1; continue }
	if (strongest === "-") { changedUnseen += 1; continue }
	changedWithVerdict += 1
	lines.push(`  ${strongest.padEnd(14)} ${caseFile.padEnd(52)} fg ${before.foreground} -> ${after.foreground}   [${batches.join(", ")}]`)
}
console.log(`# ${baseLabel} -> ${candidateLabel}\n`)
console.log(`changed, carries a verdict : ${changedWithVerdict}`)
console.log(`changed, unseen artwork    : ${changedUnseen}`)
console.log(`unchanged, carries a verdict: ${heldWithVerdict}\n`)
for (const line of lines.sort()) console.log(line)

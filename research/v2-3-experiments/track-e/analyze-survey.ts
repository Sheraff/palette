/**
 * The decision this arm turned on: can any gate admit knuckles' lettering
 * without admitting a crowd of non-marks?
 *
 * Reads `data/family-survey.tsv` (produced by `survey.ts`) and reports, for the
 * reference lettering families and for a range of conjunction gates, how many
 * families corpus-wide would newly qualify.
 */
import { readFile } from "node:fs/promises"

const REFERENCES: ReadonlyArray<readonly [string, string, string]> = [
	["placebo.jpg", "#cc150f", "placebo red text"],
	["slim.jpg", "#dc2b31", "slim red text"],
	["disney.avif", "#fbfdfa", "disney wordmark"],
	["placebo.jpg", "#fbfdf8", "placebo white"],
	["knuckles.jpg", "#f1fcfe", "KNUCKLES white text"],
]

const text = await readFile(`${import.meta.dirname}/data/family-survey.tsv`, "utf8")
const [header, ...lines] = text.trim().split("\n")
const columns = header.split("\t")
const rows = lines.map((line) => Object.fromEntries(line.split("\t").map((v, i) => [columns[i], v])))
const num = (row: Record<string, string>, key: string): number => Number(row[key])

console.log("=== reference lettering families ===")
for (const [caseName, hex, label] of REFERENCES) {
	const row = rows.find((r) => r.case === caseName && r.hex === hex)
	if (!row) continue
	console.log(`  ${label.padEnd(22)} mark=${row.mark} enum=${row.enum} groupEnum=${row.groupEnum} groupFill=${row.groupFill} groupBox%=${row["groupBox%"]} heightCV=${row.heightCV}`)
}

console.log("\n=== single-statistic separation ===")
const knuckles = rows.find((r) => r.case === "knuckles.jpg" && r.hex === "#f1fcfe")!
for (const key of ["groupBox%", "heightCV", "groupFill"] as const) {
	const value = num(knuckles, key)
	const asGood = key === "groupFill"
		? rows.filter((r) => num(r, key) >= value).length
		: rows.filter((r) => num(r, key) <= value).length
	console.log(`  families at knuckles' ${key} (${value}) or better: ${asGood} of ${rows.length}`)
}

console.log("\n=== conjunction gates (enum<0.5 = rejected today) ===")
for (const [box, height, fill, count] of [
	[1.5, 0.20, 0.25, 6], [1.5, 0.25, 0.25, 6], [2.0, 0.25, 0.20, 5],
	[1.5, 0.30, 0.20, 4], [3.0, 0.30, 0.20, 4], [1.5, 0.40, 0.15, 3],
] as const) {
	const passing = rows.filter((r) =>
		num(r, "enum") < 0.5 && num(r, "groupEnum") >= 0.9 &&
		num(r, "groupBox%") <= box && num(r, "heightCV") <= height &&
		num(r, "groupFill") >= fill && num(r, "strokes") >= count)
	const admitsTarget = passing.some((r) => r === knuckles)
	console.log(`  groupBox<=${box} heightCV<=${height} groupFill>=${fill} strokes>=${count}: ${String(passing.length).padStart(3)} pass, target admitted: ${admitsTarget}`)
	if (admitsTarget && passing.length <= 6) {
		for (const r of passing) {
			console.log(`      ${r.case.padEnd(24)} ${r.hex} mark=${r.mark} groupBox%=${r["groupBox%"]} heightCV=${r.heightCV} groupFill=${r.groupFill}${r === knuckles ? "   <== target" : ""}`)
		}
	}
}
console.log("\nNote: the gates that isolate the target sit within ~10% of it on")
console.log("heightCV and groupBox% — a fit to one artwork, not a measured property.")

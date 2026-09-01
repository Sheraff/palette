/**
 * Which of the 19 salience asks are still STANDING under the charter's verdict-recency rule?
 *
 * A salience case at warehouse line `idx` is superseded if a LATER record on the same artwork
 * either prescribes a different accent or endorses (verdict `strong`, no accent correction) a
 * palette whose accent is not the one this case asked for. Reads the LIVE warehouse only.
 */
import { readFileSync } from "node:fs"
import { SALIENCE } from "./salience-set.ts"

const WAREHOUSE = "/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl"
const records = readFileSync(WAREHOUSE, "utf8").trim().split("\n").map((l) => JSON.parse(l))

for (const kase of SALIENCE) {
	const later = records
		.map((r: any, i: number) => ({ r, i }))
		.filter((x) => x.r.image === kase.image && x.i > kase.idx)

	let status = "STANDING"
	let why = "no later verdict on this artwork"
	if (later.length > 0) {
		const last = later[later.length - 1]
		const corr = last.r.corrections?.accent as string | undefined
		if (corr && corr.toLowerCase() !== kase.prescribed.toLowerCase()) {
			status = "SUPERSEDED"
			why = `line ${last.i} (${last.r.batch}) prescribes ${corr} instead`
		} else if (corr) {
			why = `line ${last.i} (${last.r.batch}) repeats the same ask`
		} else if (last.r.verdict === "strong") {
			const label = last.r.preference.label ?? last.r.verdictApplies?.[0]
			const shown = label ? last.r.palettes?.[label]?.accent?.hex : undefined
			if (shown && shown.toLowerCase() !== kase.prescribed.toLowerCase()) {
				status = "SUPERSEDED"
				why = `line ${last.i} (${last.r.batch}) graded ${shown} STRONG with no accent correction`
			} else why = `line ${last.i} (${last.r.batch}) strong, consistent`
		} else {
			why = `line ${last.i} (${last.r.batch}) ${last.r.verdict}, no accent correction — ask not withdrawn`
		}
	}
	process.stdout.write(`${String(kase.idx).padStart(3)} ${kase.image.slice(16, 24)} ask ${kase.prescribed} ` +
		`${status.padEnd(10)} ${why}\n`)
}

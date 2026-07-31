/**
 * Collates a sweep's per-case shard files into one `data/<label>.json`.
 *
 * The shards exist for resumability during the run; the collated file is what gets
 * committed and diffed.
 *
 *   node ... collate.ts <label>...
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"

import { CASES, keyOf, type Row } from "./run.ts"

for (const label of process.argv.slice(2)) {
	const rows: Record<string, Row> = {}
	let found = 0
	for (const caseFile of CASES) {
		const path = `${import.meta.dirname}/data/${label}/${keyOf(caseFile)}.json`
		if (!existsSync(path)) continue
		rows[caseFile] = JSON.parse(readFileSync(path, "utf8")) as Row
		found += 1
	}
	writeFileSync(`${import.meta.dirname}/data/${label}.json`, `${JSON.stringify(rows, null, "\t")}\n`)
	console.log(`${label}: ${found}/${CASES.length} cases collated`)
}

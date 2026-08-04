/** Check 1 — determinism. Two `--no-cache` runs per candidate over the same 5 images. */

import { readJsonl, canonical } from "./lib.ts"

const OUT = new URL("./out/", import.meta.url).pathname

/**
 * Row fields excluded from the byte compare.
 *
 * [INHERITED] — exactly the complement of `deterministicPart()` in `src/devloop/run.ts`: `cached`
 * and `computeMs` say how a row was obtained, not what it is. Nothing else is excused.
 */
export const INCIDENTAL_ROW_FIELDS = ["cached", "computeMs"] as const

/** Header fields that legitimately differ between two runs of the same code over the same set. */
export const INCIDENTAL_HEADER_FIELDS = ["runId", "startedAt", "workerCount"] as const

function strip(row: any, drop: readonly string[]) {
	const copy = { ...row }
	for (const f of drop) delete copy[f]
	return copy
}

for (const candidate of ["alpha", "tos"]) {
	const a = await readJsonl<any>(`${OUT}${candidate}-5-run1.jsonl`)
	const b = await readJsonl<any>(`${OUT}${candidate}-5-run2.jsonl`)
	const rowsA = a.filter((l) => l.kind === "devloop-run-row")
	const rowsB = b.filter((l) => l.kind === "devloop-run-row")
	const headA = a.find((l) => l.kind === "devloop-run-header")
	const headB = b.find((l) => l.kind === "devloop-run-header")

	// Which header fields actually differ, observed rather than assumed.
	const headerDiffs = Object.keys(headA)
		.filter((k) => canonical(headA[k]) !== canonical(headB[k]))
		.sort()

	const rowDiffs: string[] = []
	let identical = rowsA.length === rowsB.length
	for (let i = 0; i < Math.min(rowsA.length, rowsB.length); i++) {
		const x = strip(rowsA[i], INCIDENTAL_ROW_FIELDS)
		const y = strip(rowsB[i], INCIDENTAL_ROW_FIELDS)
		if (canonical(x) !== canonical(y)) {
			identical = false
			for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
				if (canonical(x[k]) !== canonical(y[k])) rowDiffs.push(`row${i}.${k}`)
			}
		}
	}
	// Was any full row byte-identical including the incidental fields? (informational)
	const fullyIdentical = rowsA.every((r, i) => canonical(r) === canonical(rowsB[i]))

	console.log(
		JSON.stringify({
			check: "determinism",
			candidate,
			rows: rowsA.length,
			codeVersionSame: headA.codeVersion === headB.codeVersion,
			setHashSame: headA.setHash === headB.setHash,
			deterministicPartIdentical: identical,
			rowFieldsDiffering: [...new Set(rowDiffs)],
			headerFieldsDiffering: headerDiffs,
			headerDiffsAllIncidental: headerDiffs.every((k) =>
				(INCIDENTAL_HEADER_FIELDS as readonly string[]).includes(k),
			),
			fullRowsIdenticalIncludingTimings: fullyIdentical,
		}),
	)
}

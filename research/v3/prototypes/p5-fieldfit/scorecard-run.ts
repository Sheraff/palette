/**
 * P5 field-fit — score a run file against the contract (W-INTEG).
 *
 * Usage, from `research/v3`:
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/scorecard-run.ts <run.jsonl>
 *
 * Reads the JSONL a dev-loop run wrote, calls `scorePalette` (`src/contract/scorecard.ts`) on every
 * `ok` row with **default options**, and prints two things: the per-invariant
 * pass/fail/deferred/not-exercised tally across the set, and one line per failing invariant naming
 * the image, the code and the measured cause.
 *
 * Default options matter and are stated: no `source` is supplied, so invariant 2's source-support and
 * spatial-spread checks are **deferred, not passed**, and invariant 5's transparency report likewise.
 * A tally that read those as passes would be reading silence as a verdict, which is the failure
 * `InvariantStatus` exists to prevent — so the deferred column is printed, never folded into "pass".
 *
 * Failed rows are counted separately and their error messages printed: a candidate that legitimately
 * refuses a transparent input (contract invariant 5) produces a failed row, and that row is a
 * *correct* outcome rather than a defect.
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { scorePalette } from "../../src/contract/scorecard.ts"
import type { InvariantStatus } from "../../src/contract/scorecard.ts"
import type { RunLine, RunRow } from "../../src/devloop/types.ts"

const STATUSES: readonly InvariantStatus[] = ["pass", "fail", "deferred", "not-exercised"]
const INVARIANTS = ["I1", "I2", "I3", "I4", "I5"] as const

function shortName(imagePath: string): string {
	const base = imagePath.split("/").pop() ?? imagePath
	return base.length > 26 ? `…${base.slice(-25)}` : base
}

export async function scoreRunFile(runPath: string) {
	const lines = (await readFile(runPath, "utf8")).split("\n").filter((line) => line.trim() !== "")
	const rows: RunRow[] = []
	for (const line of lines) {
		const parsed = JSON.parse(line) as RunLine
		if (parsed.kind === "devloop-run-row") rows.push(parsed)
	}

	const tally = new Map<string, Record<InvariantStatus, number>>(
		INVARIANTS.map((invariant) => [
			invariant,
			{ pass: 0, fail: 0, deferred: 0, "not-exercised": 0 },
		]),
	)
	const failures: { image: string; invariant: string; code: string; cause: string }[] = []
	const refusals: { image: string; error: string }[] = []
	let scored = 0

	for (const row of rows) {
		if (!row.ok || row.palette === null) {
			refusals.push({ image: shortName(row.imagePath), error: row.error ?? "(no message)" })
			continue
		}
		scored += 1
		const { scorecard } = scorePalette(row.palette)
		for (const score of scorecard.invariants) {
			tally.get(score.invariant)![score.status] += 1
		}
		for (const violation of scorecard.violations) {
			const measured = violation.measured ?? {}
			const cause = "distance" in measured
				? `distance ${Number(measured.distance).toFixed(5)} < bar ${Number(measured.bar ?? 0).toFixed(5)}`
				: "rawMagnitude" in measured
				? `|raw APCA| ${Number(measured.rawMagnitude).toFixed(3)} < floor ${Number(measured.floor ?? 0).toFixed(3)}`
				: violation.message.slice(0, 110)
			failures.push({
				image: shortName(row.imagePath),
				invariant: violation.invariant,
				code: violation.code,
				cause: `${violation.subjects.join(" ↔ ")} — ${cause}`,
			})
		}
	}

	return { rows: rows.length, scored, tally, failures, refusals }
}

async function main(argv: readonly string[]): Promise<number> {
	if (argv.length !== 1) {
		process.stdout.write("usage: scorecard-run.ts <run.jsonl>\n")
		return 2
	}
	const runPath = resolve(argv[0])
	const { rows, scored, tally, failures, refusals } = await scoreRunFile(runPath)

	process.stdout.write(`${runPath}\n`)
	process.stdout.write(`  ${rows} rows · ${scored} scored · ${refusals.length} refused\n\n`)
	process.stdout.write(`  invariant  ${STATUSES.map((s) => s.padStart(13)).join("")}\n`)
	for (const invariant of INVARIANTS) {
		const counts = tally.get(invariant)!
		process.stdout.write(
			`  ${invariant.padEnd(11)}${STATUSES.map((s) => String(counts[s]).padStart(13)).join("")}\n`,
		)
	}

	if (refusals.length > 0) {
		process.stdout.write(`\n  refused rows (${refusals.length}):\n`)
		for (const refusal of refusals) {
			process.stdout.write(`    ${refusal.image}  ${refusal.error}\n`)
		}
	}

	process.stdout.write(`\n  failing invariants (${failures.length}):\n`)
	for (const failure of failures) {
		process.stdout.write(
			`    ${failure.image.padEnd(28)} ${failure.invariant} ${failure.code.padEnd(38)} ${failure.cause}\n`,
		)
	}

	const byCode = new Map<string, number>()
	for (const failure of failures) byCode.set(failure.code, (byCode.get(failure.code) ?? 0) + 1)
	if (byCode.size > 0) {
		process.stdout.write(`\n  by code:\n`)
		for (const [code, count] of [...byCode].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
			process.stdout.write(`    ${String(count).padStart(4)}  ${code}\n`)
		}
	}
	return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2))
}

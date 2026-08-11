/**
 * M1 tooling — the byte-identity gate's comparator, and the per-run timing reader.
 *
 * Two results files over the same set are compared row by row, joined on **set index** (both files
 * are written in set order — that is `run.ts`'s stated guarantee and `--verify` checks it).
 *
 * What is compared is `deterministicPart()` minus `imagePath`: the palette JSON, `inputContentHash`,
 * `ok` and `error`.
 *
 * **The one normalization, and why it is not a fudge.** A home run resolves the corpus against its
 * own worktree root and a p4 run against p4's, so every absolute path in a row differs *by
 * construction* while naming the same bytes — the row's `imagePath`, and `PaletteMetadata`'s
 * `sourceRendition.path`, which the contract requires a candidate to fill in with the file it
 * actually read. So each row's serialization has that row's own checkout root — `dirname(dirname(
 * imagePath))`, i.e. the parent of the `00/` shard — replaced by a placeholder before comparison.
 * The substitution is derived from the row itself, applies to nothing but the checkout prefix, and is
 * reported alongside `strictIdenticalRows`, the count with **no** normalization at all, so the
 * difference between "identical" and "identical up to where the checkout lives" is always visible.
 * `inputContentHash` is what actually pins the input and is compared unnormalized; the demo-20 shards
 * were additionally verified byte-identical across all five Phase-2 worktrees before any run.
 *
 * "Byte-identical" is otherwise taken literally: the palettes are serialized with `JSON.stringify`
 * and the strings must be equal, so key order, number formatting and null-vs-absent all count. A
 * member that fails is reported with the differing covers and their two serializations. Nothing is
 * patched.
 *
 * Zero constants.
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

type Row = {
	kind: string
	index: number
	imagePath: string
	inputContentHash: string
	ok: boolean
	palette: unknown
	error: string | null
	cached: boolean
	computeMs: number
}

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name)
	return at === -1 ? undefined : argv[at + 1]
}

async function readRows(path: string): Promise<{ header: Record<string, unknown>; rows: Row[] }> {
	const text = await readFile(resolve(path), "utf8")
	let header: Record<string, unknown> = {}
	const rows: Row[] = []
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue
		const parsed = JSON.parse(line) as Record<string, unknown>
		if (parsed.kind === "devloop-run-header") header = parsed
		else if (parsed.kind === "devloop-run-row") rows.push(parsed as unknown as Row)
	}
	return { header, rows }
}

const CHECKOUT_PLACEHOLDER = "<checkout>"

/** The checkout this row's image was read from: the parent of its corpus shard directory. */
function checkoutRootOf(row: Row): string {
	return resolve(row.imagePath, "..", "..")
}

/** The projection compared strictly: everything the row promises about the candidate. */
function strict(row: Row): string {
	return JSON.stringify({
		index: row.index,
		inputContentHash: row.inputContentHash,
		ok: row.ok,
		palette: row.palette,
		error: row.error,
	})
}

/** The same projection with this row's own checkout prefix replaced. See the header. */
function comparable(row: Row): string {
	return strict(row).split(checkoutRootOf(row)).join(CHECKOUT_PLACEHOLDER)
}

function median(values: readonly number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const mid = sorted.length >> 1
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const argv = process.argv.slice(2)
const aPath = flag(argv, "--a")
const bPath = flag(argv, "--b")
if (aPath === undefined || bPath === undefined) {
	process.stdout.write("usage: --a <run.jsonl> --b <run.jsonl>\n")
	process.exit(2)
}

const a = await readRows(aPath)
const b = await readRows(bPath)

const problems: Array<Record<string, unknown>> = []
if (a.rows.length !== b.rows.length) {
	problems.push({ what: "row count", a: a.rows.length, b: b.rows.length })
}
const n = Math.min(a.rows.length, b.rows.length)
let matched = 0
let strictMatched = 0
for (let i = 0; i < n; i += 1) {
	const left = comparable(a.rows[i])
	const right = comparable(b.rows[i])
	if (strict(a.rows[i]) === strict(b.rows[i])) strictMatched += 1
	if (left === right) {
		matched += 1
		continue
	}
	if (problems.length < 3) {
		problems.push({
			what: "row differs",
			index: i,
			aImagePath: a.rows[i].imagePath,
			bImagePath: b.rows[i].imagePath,
			a: left,
			b: right,
		})
	}
}

process.stdout.write(
	`${JSON.stringify(
		{
			a: { path: resolve(aPath), candidateId: a.header.candidateId, codeVersion: a.header.codeVersion },
			b: { path: resolve(bPath), candidateId: b.header.candidateId, codeVersion: b.header.codeVersion },
			rowsCompared: n,
			identicalRows: matched,
			/** With no checkout-prefix normalization at all. Expected to be 0: the paths differ. */
			strictIdenticalRows: strictMatched,
			gate: problems.length === 0 ? "PASS" : "FAIL",
			problems,
			timing: {
				aOk: a.rows.filter((r) => r.ok).length,
				bOk: b.rows.filter((r) => r.ok).length,
				aMedianComputeMs: median(a.rows.map((r) => r.computeMs)),
				bMedianComputeMs: median(b.rows.map((r) => r.computeMs)),
			},
		},
		null,
		"\t",
	)}\n`,
)

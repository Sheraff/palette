/**
 * The bootstrap-semantics fix, applied to the M3 bit table — a **targeted re-price**, not a re-run.
 *
 * ## What changed, and why this tool exists
 *
 * M3 §3.1 recorded that separation from ½ is two-sided and left the question open. The orchestrator's
 * ruling (arm-c′ §2.3c, *"the winner stands if it wins a majority"*): **when the bootstrap separates
 * from ½, the elected member is the bootstrap-majority member — including where that contradicts the
 * point bit-total.** The point total is the estimate; the resampled evidence is the measurement. That
 * is `electFromBootstrap()` in `selector/select.ts`.
 *
 * The ruling changes **who is published**, and nothing about what anything costs. So re-pricing all
 * 220 covers would burn the corpus's decode budget to reproduce 218 rows byte-for-byte. This tool
 * re-prices **only the covers the ruling can affect** — those whose recorded bootstrap separated from
 * ½ against their own cheapest total — and *proves* the rest were unaffected rather than assuming it:
 *
 *  1. every affected cover is re-priced end to end from the same member run files, and every bit of
 *     the new row (σ, `L(palette)`, residual, total, margin, the whole bootstrap report) is compared
 *     with the recorded row. **Any difference is a hard failure** — it would mean the fix moved the
 *     currency, which it must not;
 *  2. every other row keeps its recorded numbers untouched and gains the election the same
 *     `electFromBootstrap` assigns it. On those rows the rule is provably identity-on-the-winner: it
 *     returns the runner-up only on the branch step 1 just enumerated.
 *
 * The table then gains an `election` summary and `M3.md` is re-rendered from the same renderer
 * `tools/m3-run.ts` uses, so the document's "generated, do not hand-edit" claim stays true.
 *
 * Idempotent: running it twice writes the same table, because it recomputes the election from the
 * recorded evidence rather than from the previous election.
 *
 * Usage: node --experimental-strip-types tools/m3-election-fix.ts
 */

import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import type { Palette } from "../../../src/contract/types.ts"
import { LATTICE_RESOLUTION_C, decodeImage, electFromBootstrap, selectOnCover } from "../selector/index.ts"
import type { BootstrapReport, MemberPalette } from "../selector/types.ts"
import { bitTableRow, electionSummary, renderMarkdown } from "./m3-report.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "..")
const TABLE_PATH = resolve(PROTOTYPE, "data/m3/bit-table-coverage.json")

/** The keys this fix adds to a row, in the order `bitTableRow` writes them. */
const ELECTION_KEYS = ["elected", "electedBy", "electionContradictsCheapestTotal"] as const

type TableRow = Record<string, unknown>
type Table = { rows: TableRow[]; members?: { slug: string; runPaths: string[] }[] } & Record<string, unknown>

type MemberRunRow = { kind: string; inputContentHash: string; ok: boolean; palette: Palette | null }

/** The member palettes the M3 run files published on one cover, joined on the content hash. */
async function membersOn(table: Table, contentHash: string): Promise<{ members: MemberPalette[]; missing: string[] }> {
	const members: MemberPalette[] = []
	const missing: string[] = []
	for (const member of table.members ?? []) {
		let found: Palette | null = null
		for (const runPath of member.runPaths) {
			const text = await readFile(resolve(PROTOTYPE, runPath), "utf8")
			for (const line of text.split("\n")) {
				if (line.trim() === "" || !line.includes(contentHash)) continue
				const parsed = JSON.parse(line) as MemberRunRow
				if (parsed.kind !== "devloop-run-row" || parsed.inputContentHash !== contentHash) continue
				if (parsed.ok && parsed.palette !== null) found = parsed.palette
				break
			}
			if (found !== null) break
		}
		if (found === null) missing.push(member.slug)
		else members.push({ slug: member.slug, palette: found })
	}
	return { members, missing }
}

/** A row with the election keys and the clock reading removed — what "the same numbers" means here. */
function pricedPart(row: TableRow): string {
	const copy: TableRow = {}
	for (const [key, value] of Object.entries(row)) {
		if ((ELECTION_KEYS as readonly string[]).includes(key) || key === "priceMs") continue
		copy[key] = value
	}
	return JSON.stringify(copy)
}

/** Insert the election keys in `bitTableRow`'s own order, so a full re-run serialises identically. */
function withElection(row: TableRow, election: Record<string, unknown>): TableRow {
	const rebuilt: TableRow = {}
	let inserted = false
	const insert = (): void => {
		for (const [key, value] of Object.entries(election)) rebuilt[key] = value
		inserted = true
	}
	for (const [key, value] of Object.entries(row)) {
		if ((ELECTION_KEYS as readonly string[]).includes(key)) continue
		// A priced row carries `marginBits` and the keys go straight after it; a decode refusal does
		// not, and its keys go before the closing `priceMs`. Inserted exactly once either way.
		if (key === "priceMs" && !inserted) insert()
		rebuilt[key] = value
		if (key === "marginBits" && !inserted) insert()
	}
	if (!inserted) insert()
	return rebuilt
}

async function main(): Promise<void> {
	const table = JSON.parse(await readFile(TABLE_PATH, "utf8")) as Table

	const affected: TableRow[] = []
	const unaffected: TableRow[] = []
	for (const row of table.rows) {
		const winner = row.winner as string | null
		const bootstrap = row.bootstrap as BootstrapReport | null | undefined
		const election = electFromBootstrap(winner ?? "", (row.runnerUp as string | null) ?? null, bootstrap ?? null)
		if (winner !== null && election.contradictsCheapestTotal) affected.push(row)
		else unaffected.push(row)
	}
	process.stdout.write(`affected covers: ${affected.length} of ${table.rows.length}\n`)

	// 1. Re-price the affected covers, and refuse to publish if any priced number moved.
	const reprices: Record<string, unknown>[] = []
	const rebuiltByHash = new Map<string, TableRow>()
	for (const row of affected) {
		const contentHash = row.contentHash as string
		const { members, missing } = await membersOn(table, contentHash)
		const startedAt = Date.now()
		const image = await decodeImage(row.imagePath as string)
		const { selection } = selectOnCover(image, members, LATTICE_RESOLUTION_C)
		const fresh = bitTableRow(selection, missing, Date.now() - startedAt)
		if (pricedPart(fresh) !== pricedPart(row)) {
			process.stderr.write(`RE-PRICE MISMATCH on ${contentHash}\nrecorded: ${pricedPart(row)}\nfresh:    ${pricedPart(fresh)}\n`)
			process.exit(1)
		}
		// The recorded `priceMs` is kept: it is the milestone run's own timing, and every other row's
		// is too. This pass's timing is reported in the provenance block instead of overwriting it.
		fresh.priceMs = row.priceMs
		rebuiltByHash.set(contentHash, fresh)
		reprices.push({
			contentHash,
			imagePath: row.imagePath,
			cheapestTotal: row.winner,
			elected: fresh.elected,
			pricedNumbersIdentical: true,
			repriceMs: Date.now() - startedAt,
		})
		process.stdout.write(`re-priced ${contentHash.slice(0, 10)}: elected ${String(fresh.elected)} (was ${String(row.winner)})\n`)
	}

	// 2. Everything else keeps its numbers and gains the election the same rule assigns it.
	for (const row of unaffected) {
		const winner = row.winner as string | null
		const election =
			winner === null
				? { elected: null, electedBy: null, contradictsCheapestTotal: false }
				: electFromBootstrap(winner, (row.runnerUp as string | null) ?? null, (row.bootstrap as BootstrapReport | null) ?? null)
		rebuiltByHash.set(
			row.contentHash as string,
			withElection(row, {
				elected: election.elected,
				electedBy: election.electedBy,
				electionContradictsCheapestTotal: election.contradictsCheapestTotal,
			}),
		)
	}

	const rows = table.rows.map((row) => rebuiltByHash.get(row.contentHash as string)!)

	// 3. Rebuild the summaries the election touches, and record the fix as provenance.
	const rebuilt: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(table)) {
		if (key === "rows") continue
		rebuilt[key] = value
		if (key === "winnerCounts") rebuilt.election = electionSummary(rows)
	}
	rebuilt.bootstrapSemanticsFix = {
		appliedAt: new Date().toISOString(),
		tool: "tools/m3-election-fix.ts",
		implementedIn: "selector/select.ts electFromBootstrap()",
		ruling:
			"arm-c′ §2.3c — the winner stands if it wins a majority; where the bootstrap separates " +
			"from ½ the ELECTED member is the bootstrap-majority member, including where that contradicts " +
			"the point bit-total (orchestrator ruling on M3 §3.1).",
		coversAffected: affected.length,
		coversReprice: reprices,
		coversNotRepriced: unaffected.length,
		whyNotRepriced:
			"the ruling can only move an election on a cover whose recorded bootstrap separated from ½ " +
			"against its own cheapest total; on every other row the rule returns the cheapest total, so the " +
			"published numbers are unchanged by construction and re-decoding them would measure nothing.",
		tieBreakPath: "unchanged — an exact tie ties every resample, never separates, and falls through to §2.3d.",
		newConstants: 0,
	}
	rebuilt.rows = rows

	await writeFile(TABLE_PATH, `${JSON.stringify(rebuilt, null, "\t")}\n`)
	await writeFile(resolve(PROTOTYPE, "M3.md"), renderMarkdown(rebuilt, rows))
	process.stdout.write(`${TABLE_PATH}\n`)
}

await main()

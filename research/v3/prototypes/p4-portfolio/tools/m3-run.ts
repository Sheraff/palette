/**
 * M3 — price coverage-set-1 and measure F1.
 *
 * The same pricing path as M2 (`selector/pipeline.ts`), on a corpus instead of a demonstration set,
 * with the members' palettes read from the M3 run files rather than re-derived. Three members run:
 * `p3-fields`, `p2-tree` (**re-pinned** — see `members/p2-tree/PROVENANCE.md`) and `p5-fieldfit`.
 * `p1-mdl` is excluded by the orchestrator's ruling, its 240 s budget being ~14 hours on this corpus.
 *
 * **What this tool does not do: attach a verdict.** SPEC §3's F1 is
 *
 * > if across the coverage corpus the bootstrap win fraction sits near ½ on a large share of covers
 * > WHERE PALETTES MATERIALLY DIFFER, description length has no evidence to run on here.
 *
 * "a large share" is the orchestrator's to rule on. This tool applies the rest mechanically: it
 * counts the material covers, publishes the whole win-fraction distribution, and reports the share
 * inside `[0.4, 0.6]` — a symmetric interval about ½, stated once, so "near ½" is a number a reader
 * can re-derive rather than an adjective. The interval is a *reporting* window, not a threshold: the
 * full histogram and every per-cover fraction are published beside it, and nothing in the selector
 * consults it.
 *
 * Determinism is checked, not asserted: five covers are re-priced at the end and their serialised
 * rows compared byte-for-byte with the first pass.
 *
 * Usage: node --experimental-strip-types tools/m3-run.ts
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import type { Palette } from "../../../src/contract/types.ts"
import { INDIFFERENT_WIN_FRACTION, LATTICE_RESOLUTION_C, decodeImage, selectOnCover } from "../selector/index.ts"
import { SubstrateRefusal } from "../selector/substrate.ts"
import type { MemberPalette, Selection } from "../selector/types.ts"
import { bitTableRow, electionSummary, renderMarkdown } from "./m3-report.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "..")

/**
 * The window this report calls "near ½", stated once.
 *
 * Not a threshold and not consulted by any decision: it is the interval whose *share* is reported, so
 * that F1's "near ½" is a number rather than an adjective. Symmetric about one half by construction,
 * and the full histogram is published beside it so a reader who prefers another window can compute it.
 */
const NEAR_HALF: readonly [number, number] = [0.4, 0.6]

/** How many covers the determinism spot-check re-prices. */
const DETERMINISM_SPOT_CHECK_COVERS = 5

/**
 * Where each member's palettes come from.
 *
 * A member can have more than one run file, and one does: `p2-tree`'s first pass was **killed by the
 * stall watchdog** on one cover (`tools/m3-member-run.ts`, 60 s with no row at one worker), so its
 * covers arrive as the partial first run plus a resume run over everything it had not reached. The
 * killed cover is not retried — it is recorded, and the members that did price it are priced without
 * it. Rows are joined on the content hash, so concatenating runs is a join, not an ordering.
 */
const MEMBER_RUNS: readonly { slug: string; runPaths: readonly string[] }[] = [
	{
		slug: "p2-tree",
		runPaths: [
			"data/m3/runs/p2-tree-coverage1.jsonl",
			"data/m3/runs/p2-tree-coverage1-resume-1.jsonl",
		],
	},
	{ slug: "p3-fields", runPaths: ["data/m3/runs/p3-fields-coverage1.jsonl"] },
	{ slug: "p5-fieldfit", runPaths: ["data/m3/runs/p5-fieldfit-coverage1.jsonl"] },
]

/** Every run-status file the wrapper wrote, so the timeouts are reported rather than inferred. */
const MEMBER_STATUSES: readonly { slug: string; statusPath: string }[] = [
	{ slug: "p2-tree", statusPath: "data/m3/runs/p2-tree-coverage1-status.json" },
	{ slug: "p2-tree", statusPath: "data/m3/runs/p2-tree-coverage1-resume-1-status.json" },
	{ slug: "p3-fields", statusPath: "data/m3/runs/p3-fields-coverage1-status.json" },
	{ slug: "p5-fieldfit", statusPath: "data/m3/runs/p5-fieldfit-coverage1-status.json" },
]

type Row = {
	kind: string
	index: number
	imagePath: string
	inputContentHash: string
	ok: boolean
	palette: Palette | null
	computeMs?: number
}

type Cover = { contentHash: string; imagePath: string; members: MemberPalette[]; missing: string[] }

async function readRuns(runPaths: readonly string[]): Promise<Row[]> {
	const rows: Row[] = []
	const seen = new Set<string>()
	for (const runPath of runPaths) {
		const text = await readFile(resolve(PROTOTYPE, runPath), "utf8")
		for (const line of text.split("\n")) {
			if (line.trim() === "") continue
			const parsed = JSON.parse(line) as Row
			if (parsed.kind !== "devloop-run-row") continue
			// A resume run must not re-add a cover the first pass already priced; if it ever did, the
			// first row wins and the duplicate is dropped rather than silently doubling a member.
			if (seen.has(parsed.inputContentHash)) continue
			seen.add(parsed.inputContentHash)
			rows.push(parsed)
		}
	}
	return rows
}

/** Join the member runs on the content hash, in the set's own order. */
async function loadCovers(): Promise<{ covers: Cover[]; perMemberRows: Record<string, number> }> {
	const byMember = new Map<string, Row[]>()
	const perMemberRows: Record<string, number> = {}
	for (const member of MEMBER_RUNS) {
		const rows = await readRuns(member.runPaths)
		byMember.set(member.slug, rows)
		perMemberRows[member.slug] = rows.length
	}
	let order: Row[] = []
	for (const rows of byMember.values()) if (rows.length > order.length) order = rows

	const covers: Cover[] = []
	for (const reference of order) {
		const members: MemberPalette[] = []
		const missing: string[] = []
		for (const member of MEMBER_RUNS) {
			const row = byMember
				.get(member.slug)!
				.find((candidate) => candidate.inputContentHash === reference.inputContentHash)
			if (row === undefined || !row.ok || row.palette === null) {
				missing.push(member.slug)
				continue
			}
			members.push({ slug: member.slug, palette: row.palette })
		}
		covers.push({
			contentHash: reference.inputContentHash,
			imagePath: reference.imagePath,
			members,
			missing,
		})
	}
	return { covers, perMemberRows }
}

function histogram(values: readonly number[], edges: readonly number[]): Record<string, number> {
	const bins: Record<string, number> = {}
	for (const [at, edge] of edges.entries()) {
		const next = edges[at + 1]
		bins[next === undefined ? `>=${edge}` : `${edge}..${next}`] = 0
	}
	for (const value of values) {
		let label = `>=${edges[edges.length - 1]}`
		for (const [at, edge] of edges.entries()) {
			const next = edges[at + 1]
			if (next !== undefined && value >= edge && value < next) {
				label = `${edge}..${next}`
				break
			}
		}
		bins[label] = (bins[label] ?? 0) + 1
	}
	return bins
}

/** Price one cover. A decode the substrate refuses is recorded as a refusal, never skipped. */
async function priceCover(
	cover: Cover,
): Promise<{ row: Record<string, unknown>; selection: Selection | null; refusal: string | null }> {
	const startedAt = Date.now()
	try {
		const image = await decodeImage(cover.imagePath)
		const { selection } = selectOnCover(image, cover.members, LATTICE_RESOLUTION_C)
		return { row: bitTableRow(selection, cover.missing, Date.now() - startedAt), selection, refusal: null }
	} catch (error) {
		const reason = error instanceof SubstrateRefusal ? error.message : `${(error as Error).message}`
		return {
			row: {
				contentHash: cover.contentHash,
				imagePath: cover.imagePath,
				membersPriced: [],
				membersMissing: cover.missing,
				unpriceable: { reason, sigma: null },
				refusedAtDecode: true,
				winner: null,
				// A cover that never decoded elects nobody. Carried explicitly so the election summary
				// reads the same key on every row rather than inferring absence.
				elected: null,
				electedBy: null,
				electionContradictsCheapestTotal: false,
				priceMs: Date.now() - startedAt,
			},
			selection: null,
			refusal: reason,
		}
	}
}

async function run(): Promise<void> {
	const wallStartedAt = Date.now()
	const { covers, perMemberRows } = await loadCovers()
	const rows: Record<string, unknown>[] = []
	const selections: (Selection | null)[] = []
	const decodeRefusals: { contentHash: string; imagePath: string; reason: string }[] = []

	for (const [at, cover] of covers.entries()) {
		const { row, selection, refusal } = await priceCover(cover)
		rows.push(row)
		selections.push(selection)
		if (refusal !== null) {
			decodeRefusals.push({ contentHash: cover.contentHash, imagePath: cover.imagePath, reason: refusal })
		}
		if ((at + 1) % 20 === 0) process.stderr.write(`priced ${at + 1}/${covers.length}\n`)
	}
	const pricingWallMs = Date.now() - wallStartedAt

	const priced = selections.filter((selection): selection is Selection => selection?.unpriceable == null)
	const refusedAfterFloor = rows.filter((row) => row.unpriceable !== null && row.unpriceable !== undefined)

	const winnerCounts: Record<string, number> = {}
	for (const member of MEMBER_RUNS) winnerCounts[member.slug] = 0
	for (const selection of priced) {
		winnerCounts[selection.winner!] = (winnerCounts[selection.winner!] ?? 0) + 1
	}

	const material = priced.filter((selection) => selection.materiality.material)
	const immaterial = priced.length - material.length
	const winFractions = material.flatMap((selection) =>
		selection.bootstrap === null ? [] : [selection.bootstrap.winFraction],
	)
	const nearHalf = winFractions.filter(
		(fraction) => fraction >= NEAR_HALF[0] && fraction <= NEAR_HALF[1],
	).length
	const margins = priced.flatMap((selection) =>
		selection.marginBits === null ? [] : [selection.marginBits],
	)

	// Determinism: re-price five covers and compare the serialised rows byte-for-byte.
	const spotCheck: { contentHash: string; identical: boolean }[] = []
	const stride = Math.max(1, Math.floor(covers.length / DETERMINISM_SPOT_CHECK_COVERS))
	for (let at = 0; spotCheck.length < DETERMINISM_SPOT_CHECK_COVERS && at < covers.length; at += stride) {
		const cover = covers[at]!
		const again = await priceCover(cover)
		// `priceMs` is a clock reading, not a measurement of the image, so it is excluded from the
		// comparison — including it would make the check fail for the one reason it must not.
		const strip = (row: Record<string, unknown>): string =>
			JSON.stringify({ ...row, priceMs: null })
		spotCheck.push({
			contentHash: cover.contentHash,
			identical: Buffer.compare(
				Buffer.from(strip(rows[at]!), "utf8"),
				Buffer.from(strip(again.row), "utf8"),
			) === 0,
		})
	}

	// Every run status the wrapper wrote — including the pass it killed, which is the point.
	const runStatuses: Record<string, unknown>[] = []
	for (const entry of MEMBER_STATUSES) {
		try {
			const status = JSON.parse(await readFile(resolve(PROTOTYPE, entry.statusPath), "utf8")) as Record<
				string,
				unknown
			>
			runStatuses.push({ slug: entry.slug, statusPath: entry.statusPath, ...status })
		} catch {
			runStatuses.push({ slug: entry.slug, statusPath: entry.statusPath, missing: true })
		}
	}
	const memberWallMs: Record<string, number> = {}
	for (const status of runStatuses) {
		const slug = status.slug as string
		memberWallMs[slug] = (memberWallMs[slug] ?? 0) + ((status.wallMs as number | undefined) ?? 0)
	}
	const timeouts = runStatuses
		.filter((status) => status.timedOut === true)
		.map((status) => ({
			slug: status.slug,
			statusPath: status.statusPath,
			stalledOn: status.stalledOn,
			attribution: status.stalledAttribution,
			stallMs: status.stallMs,
			rowsWritten: status.rowsWritten,
		}))

	const report = {
		kind: "p4-portfolio-m3-bit-table",
		generatedAt: new Date().toISOString(),
		set: {
			name: "coverage-set-1",
			definition: "research/v3/data/coverage-set/coverage-set-1.json",
			setFile: "data/m3/coverage-set-1.txt",
			covers: covers.length,
		},
		latticeResolution: LATTICE_RESOLUTION_C,
		members: MEMBER_RUNS.map((member) => ({
			slug: member.slug,
			runPaths: member.runPaths,
			rows: perMemberRows[member.slug] ?? 0,
			pricedOn: priced.filter((selection) =>
				selection.prices.some((price) => price.slug === member.slug),
			).length,
		})),
		excluded: {
			slug: "p1-mdl",
			why: "orchestrator ruling — its 240 s budget is ~14 hours on 220 covers (MEMBERS.md §4 item 2)",
		},
		memberRunTimeouts: {
			rule: "tools/m3-member-run.ts kills a member that writes no result row for --stall-ms; at one worker the rows are in set order, so the stalled cover is named exactly.",
			count: timeouts.length,
			timeouts,
		},
		runStatuses,
		wallMs: {
			pricing: pricingWallMs,
			members: memberWallMs,
		},
		pricedCovers: priced.length,
		refusalsAfterFloor: {
			count: refusedAfterFloor.length,
			decodeRefusals,
			covers: refusedAfterFloor.map((row) => ({
				contentHash: row.contentHash,
				imagePath: row.imagePath,
				reason: (row.unpriceable as { reason: string }).reason,
			})),
		},
		sigmaFloor: {
			measuredZeroCovers: priced.filter((selection) => selection.sigmaMeasured === 0).length,
			flooredCovers: priced.filter((selection) => selection.sigmaFlooredByQuantization).length,
		},
		winnerCounts,
		election: electionSummary(rows),
		materialCovers: material.length,
		immaterialCovers: immaterial,
		marginBits:
			margins.length === 0
				? null
				: {
						min: Math.min(...margins),
						max: Math.max(...margins),
						histogram: histogram(margins, [0, 1, 10, 100, 1000, 10000, 100000]),
					},
		f1: {
			criterion:
				"SPEC §3 F1 — if across the coverage corpus the bootstrap win fraction sits near ½ on a " +
				"large share of covers WHERE PALETTES MATERIALLY DIFFER, description length has no " +
				"evidence to run on here. 'A large share' is the orchestrator's ruling; this is the share.",
			nearHalfWindow: NEAR_HALF,
			materialCovers: material.length,
			winFractionsMeasured: winFractions.length,
			winFractionHistogram: histogram(winFractions, [0, 0.4, 0.45, 0.5, 0.55, 0.6, 1]),
			nearHalfCovers: nearHalf,
			nearHalfShare: winFractions.length === 0 ? null : nearHalf / winFractions.length,
			winFractionsExactlyOne: winFractions.filter((fraction) => fraction === 1).length,
			separatedFromHalf: material.filter((selection) => selection.bootstrap?.separatedFromHalf === true)
				.length,
			cappedWithoutSeparation: material.filter((selection) => selection.bootstrap?.capped === true).length,
			// Separation is two-sided: an interval can clear ½ from BELOW, which says the resampled
			// evidence points away from the cover's cheapest total. arm-c′ §2.3c says the winner stands
			// when the interval excludes ½; it does not say what a winner whose interval excludes ½ on
			// the losing side is. Counted here rather than resolved, and listed so it can be looked at.
			separatedAgainstTheCheapestTotal: {
				count: material.filter(
					(selection) =>
						selection.bootstrap !== null &&
						selection.bootstrap.separatedFromHalf &&
						selection.bootstrap.winFraction < INDIFFERENT_WIN_FRACTION,
				).length,
				covers: material
					.filter(
						(selection) =>
							selection.bootstrap !== null &&
							selection.bootstrap.winFraction < INDIFFERENT_WIN_FRACTION,
					)
					.map((selection) => ({
						contentHash: selection.contentHash,
						winner: selection.winner,
						runnerUp: selection.runnerUp,
						marginBits: selection.marginBits,
						winFraction: selection.bootstrap!.winFraction,
						intervalLow: selection.bootstrap!.intervalLow,
						intervalHigh: selection.bootstrap!.intervalHigh,
						resamples: selection.bootstrap!.resamples,
						separatedFromHalf: selection.bootstrap!.separatedFromHalf,
					})),
			},
		},
		determinism: {
			covers: spotCheck.length,
			allIdentical: spotCheck.every((entry) => entry.identical),
			spotCheck,
		},
		rows,
	}

	const outPath = resolve(PROTOTYPE, "data/m3/bit-table-coverage.json")
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(report, null, "\t")}\n`)
	await writeFile(resolve(PROTOTYPE, "M3.md"), renderMarkdown(report, rows))
	process.stdout.write(`${outPath}\n`)
}

await run()

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

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "..")

/** [STRUCTURAL] A full turn in degrees. Presentation only. */
const DEGREES_PER_TURN = 360

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

function shortHash(hash: string): string {
	return hash.slice(0, 10)
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

/** One cover's row, in the shape the bit table publishes and the determinism check compares. */
function bitTableRow(selection: Selection, cover: Cover, priceMs: number): Record<string, unknown> {
	return {
		contentHash: selection.contentHash,
		imagePath: selection.imagePath,
		sigma: selection.sigma,
		sigmaMeasured: selection.sigmaMeasured,
		sigmaQuantization: selection.sigmaQuantization,
		sigmaFlooredByQuantization: selection.sigmaFlooredByQuantization,
		membersPriced: selection.prices.map((price) => price.slug),
		membersMissing: cover.missing,
		unpriceable: selection.unpriceable,
		immaterial: !selection.materiality.material,
		winner: selection.winner,
		runnerUp: selection.runnerUp,
		marginBits: selection.marginBits,
		tieBrokenBySchemaPrice: selection.tieBrokenBySchemaPrice,
		winFraction: selection.bootstrap?.winFraction ?? null,
		bootstrap: selection.bootstrap,
		members: selection.prices.map((price) => ({
			slug: price.slug,
			schemaBits: price.schema.bits,
			publishedColors: price.schema.publishedColors,
			residualBits: price.residualBits,
			totalBits: price.totalBits,
			field: price.field,
			explainedPixelFraction: price.explainedPixelFraction,
		})),
		pairsDiffering: selection.materiality.pairs,
		priceMs,
	}
}

/** Price one cover. A decode the substrate refuses is recorded as a refusal, never skipped. */
async function priceCover(
	cover: Cover,
): Promise<{ row: Record<string, unknown>; selection: Selection | null; refusal: string | null }> {
	const startedAt = Date.now()
	try {
		const image = await decodeImage(cover.imagePath)
		const { selection } = selectOnCover(image, cover.members, LATTICE_RESOLUTION_C)
		return { row: bitTableRow(selection, cover, Date.now() - startedAt), selection, refusal: null }
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

function fixed(value: number | null, digits: number): string {
	return value !== null && Number.isFinite(value) ? value.toFixed(digits) : "—"
}

function renderMarkdown(report: Record<string, unknown>, rows: readonly Record<string, unknown>[]): string {
	const lines: string[] = []
	const f1 = report.f1 as Record<string, unknown>
	const set = report.set as { name: string; definition: string; setFile: string; covers: number }
	const members = report.members as { slug: string; rows: number; pricedOn: number }[]
	const wall = report.wallMs as { pricing: number; members: Record<string, number | null> }
	const refusals = report.refusalsAfterFloor as { count: number; covers: { contentHash: string; reason: string }[] }
	const floor = report.sigmaFloor as { measuredZeroCovers: number; flooredCovers: number }
	const determinism = report.determinism as { covers: number; allIdentical: boolean }

	lines.push("# P4 M3 — the selector on coverage-set-1, and the F1 measurement")
	lines.push("")
	lines.push(
		"**Generated by `tools/m3-run.ts` from the M3 member runs. Do not hand-edit.** Every number " +
			"below is re-derivable from `data/m3/bit-table-coverage.json`.",
	)
	lines.push("")
	lines.push(
		`**Set.** \`${set.name}\`, ${set.covers} covers, defined by \`${set.definition}\` and listed for ` +
			`the dev loop in \`${set.setFile}\` (derived from that definition's own \`artworks\` order; each ` +
			"path verified present and sha-256-identical to the definition's digest before the runs).",
	)
	lines.push("")
	lines.push(
		`**Lattice resolution C = ${report.latticeResolution}**, and σ = \`max(σ_measured, σ_quant)\` per ` +
			"SPEC §3.1 — the same pricing path as M2, unchanged for this milestone.",
	)
	lines.push("")
	lines.push("## 1. What ran")
	lines.push("")
	lines.push("| member | rows | priced on | member wall (ms) |")
	lines.push("|---|---|---|---|")
	for (const member of members) {
		lines.push(
			`| \`${member.slug}\` | ${member.rows} | ${member.pricedOn} | ${wall.members[member.slug] ?? "—"} |`,
		)
	}
	lines.push("")
	const excluded = report.excluded as { slug: string; why: string }
	lines.push(`\`${excluded.slug}\` is **excluded**: ${excluded.why}.`)
	lines.push("")
	lines.push(
		`Pricing wall time: **${wall.pricing} ms** for ${set.covers} covers. Member wall time is the sum ` +
			"over that member's runs. Member runs were driven by `tools/m3-member-run.ts`, which watches " +
			"the run file and kills a member that writes no result row for 60 s; at one worker the rows " +
			"come out in set order, so a stall names the exact cover.",
	)
	lines.push("")
	const timeouts = report.memberRunTimeouts as {
		count: number
		timeouts: { slug: string; stalledOn: string | null; rowsWritten: number; stallMs: number }[]
	}
	if (timeouts.count === 0) {
		lines.push("**No member run timed out.**")
	} else {
		lines.push(`**Member runs killed by the stall watchdog: ${timeouts.count}.**`)
		lines.push("")
		lines.push("| member | rows before the kill | stalled on | stall budget (ms) |")
		lines.push("|---|---|---|---|")
		for (const timeout of timeouts.timeouts) {
			lines.push(
				`| \`${timeout.slug}\` | ${timeout.rowsWritten} | \`${timeout.stalledOn ?? "—"}\` | ${timeout.stallMs} |`,
			)
		}
		lines.push("")
		lines.push(
			"A killed cover is **recorded and not retried**: the member is resumed over everything it had " +
				"not reached, the stalled cover is left out of that resume set, and the cover is priced " +
				"with the members that did publish on it — which the per-cover table below marks as " +
				"`missing`. Retrying it would either hang the milestone or need a second, longer budget " +
				"nobody measured.",
		)
	}
	lines.push("")
	lines.push("## 2. Headline")
	lines.push("")
	lines.push(`- Covers priced: **${report.pricedCovers}** of ${set.covers}.`)
	lines.push(`- Refusals after the floor: **${refusals.count}**.`)
	lines.push(
		`- σ_measured exactly 0: **${floor.measuredZeroCovers}**; covers where the floor bound: **${floor.flooredCovers}**.`,
	)
	lines.push(
		`- Winner counts: ${Object.entries(report.winnerCounts as Record<string, number>)
			.map(([slug, count]) => `\`${slug}\` ${count}`)
			.join(", ")}.`,
	)
	lines.push(
		`- Material covers (at least one pair past the contract's regional bar): **${report.materialCovers}**; immaterial: **${report.immaterialCovers}**.`,
	)
	const marginBits = report.marginBits as { histogram: Record<string, number> } | null
	if (marginBits !== null) {
		lines.push(`- Margin distribution (bits, winner over runner-up): ${JSON.stringify(marginBits.histogram)}.`)
	}
	lines.push(
		`- Determinism spot-check: ${determinism.covers} covers re-priced, byte-identical rows: **${determinism.allIdentical ? "yes" : "NO"}**.`,
	)
	lines.push("")
	lines.push("## 3. F1")
	lines.push("")
	lines.push(`> ${f1.criterion as string}`)
	lines.push("")
	const window = f1.nearHalfWindow as [number, number]
	lines.push(
		`**"Near ½" is reported as the closed interval [${window[0]}, ${window[1]}]**, symmetric about one ` +
			"half, stated once and consulted by nothing in the selector. The full distribution is below, so " +
			"a reader who prefers a different window can compute it from the same rows.",
	)
	lines.push("")
	lines.push(`- Material covers: **${f1.materialCovers}**.`)
	lines.push(`- Win fractions measured on them: **${f1.winFractionsMeasured}**.`)
	lines.push(`- Win-fraction distribution: ${JSON.stringify(f1.winFractionHistogram)}.`)
	lines.push(
		`- **Share inside [${window[0]}, ${window[1]}]: ${f1.nearHalfCovers} / ${f1.winFractionsMeasured} = ` +
			`${fixed(f1.nearHalfShare as number | null, 4)}.**`,
	)
	lines.push(`- Win fraction exactly 1: **${f1.winFractionsExactlyOne}**.`)
	lines.push(
		`- Wilson interval separated from ½ before the compute cap: **${f1.separatedFromHalf}**; capped without separating: **${f1.cappedWithoutSeparation}**.`,
	)
	lines.push("")
	lines.push(
		"No verdict is attached. F1 asks whether the share is *large*, and that ruling is the " +
			"orchestrator's; this milestone measures the share.",
	)
	lines.push("")
	const against = f1.separatedAgainstTheCheapestTotal as {
		count: number
		covers: {
			contentHash: string
			winner: string | null
			runnerUp: string | null
			marginBits: number | null
			winFraction: number
			intervalLow: number
			intervalHigh: number
			resamples: number
			separatedFromHalf: boolean
		}[]
	}
	lines.push("### 3.1 An observation the F1 read does not cover, recorded rather than resolved")
	lines.push("")
	lines.push(
		"Separation from ½ is **two-sided**. arm-c′ §2.3c says the winner stands when the Wilson interval " +
			"on its win fraction excludes ½; it does not say what to do with a winner whose interval " +
			`excludes ½ **from below**. That happened on **${against.count}** cover(s): the cheapest total ` +
			"names one member, and the block bootstrap's resampled evidence points at the other, with the " +
			"interval clearing ½ on the losing side — so the resampling stopping rule fires and the run " +
			"records `separatedFromHalf: true`. These are not near-½ covers and they are not in the share " +
			"above; they are covers where the point estimate and the measured margin disagree in " +
			"direction. Deciding what the selector should do there is the orchestrator's.",
	)
	lines.push("")
	if (against.covers.length > 0) {
		lines.push("| cover | winner (cheapest total) | runner-up | margin (bits) | win fraction | Wilson interval | resamples |")
		lines.push("|---|---|---|---|---|---|---|")
		for (const cover of against.covers) {
			lines.push(
				`| \`${shortHash(cover.contentHash)}\` | ${cover.winner ?? "—"} | ${cover.runnerUp ?? "—"} | ` +
					`${fixed(cover.marginBits, 1)} | ${fixed(cover.winFraction, 3)} | ` +
					`[${fixed(cover.intervalLow, 3)}, ${fixed(cover.intervalHigh, 3)}] | ${cover.resamples} |`,
			)
		}
		lines.push("")
	}
	lines.push("## 4. Per cover")
	lines.push("")
	lines.push(
		"`winner` is the cheapest total in bits; `margin` is the runner-up's total minus the winner's; " +
			"`immaterial` says every pair agreed on every role at the contract's regional bar, in which " +
			"case no bootstrap was paid for; `win fraction` is the block bootstrap's, where one ran.",
	)
	lines.push("")
	lines.push("| cover | winner | margin (bits) | immaterial | win fraction | resamples | σ floored | members |")
	lines.push("|---|---|---|---|---|---|---|---|")
	for (const row of rows) {
		const bootstrap = row.bootstrap as { resamples: number } | null | undefined
		const priced = row.membersPriced as string[]
		lines.push(
			`| \`${shortHash(row.contentHash as string)}\` | ` +
				`${row.winner === null || row.winner === undefined ? "**refused**" : `**${row.winner as string}**`} | ` +
				`${fixed(row.marginBits as number | null, 0)} | ` +
				`${row.immaterial === true ? "**yes**" : "no"} | ` +
				`${fixed(row.winFraction as number | null, 3)} | ` +
				`${bootstrap === null || bootstrap === undefined ? "—" : String(bootstrap.resamples)} | ` +
				`${row.sigmaFlooredByQuantization === true ? (row.sigmaMeasured === 0 ? "**converted**" : "yes") : "no"} | ` +
				`${priced.length === 0 ? "—" : priced.length}${(row.membersMissing as string[]).length > 0 ? ` (missing ${(row.membersMissing as string[]).join(", ")})` : ""} |`,
		)
	}
	lines.push("")
	if (refusals.count > 0) {
		lines.push("## 5. Refusals")
		lines.push("")
		lines.push("| cover | reason |")
		lines.push("|---|---|")
		for (const cover of refusals.covers) {
			lines.push(`| \`${shortHash(cover.contentHash)}\` | ${cover.reason} |`)
		}
		lines.push("")
	}
	void DEGREES_PER_TURN
	return `${lines.join("\n")}\n`
}

await run()

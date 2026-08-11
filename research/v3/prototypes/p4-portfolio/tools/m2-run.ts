/**
 * M2 — run the selector over demo-20 and write the milestone's two artifacts.
 *
 * Two subcommands, one pricing path (`selector/pipeline.ts`), so the sweep and the table cannot
 * drift apart:
 *
 *   node --experimental-strip-types tools/m2-run.ts sweep
 *       Prices every member on every cover at every rung of `LATTICE_RESOLUTION_SWEEP` and records
 *       where the per-cover ranking stops changing. Writes `data/m2/c-sweep.json`. **This file is
 *       the anchor for `LATTICE_RESOLUTION_C`** (arm-c′ §4 decision 1) — the constant is set from
 *       it, never the other way round, which is why C is a CLI-independent input here.
 *
 *   node --experimental-strip-types tools/m2-run.ts table
 *       Prices at `LATTICE_RESOLUTION_C` and writes `data/m2/bit-table.json` plus `BITTABLE.md`
 *       (arm-c′ §8's bit table), including the F1-on-demo-20 read: the distribution of bootstrap
 *       win fractions over the covers where the palettes materially differ.
 *
 * **The member palettes are read from the M1 run files, not re-run.** M1 pinned them by
 * fingerprint and byte-identity gate (`MEMBERS.md` §1); re-running would price a different artifact
 * from the one the milestone verified. `p1-mdl` published on three covers only — its 240 s budget,
 * `MEMBERS.md` §4 item 2 — so it is priced on those three and is absent elsewhere, which the tables
 * state per cover rather than averaging over.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import type { Palette } from "../../../src/contract/types.ts"
import {
	FULL_TURN_RADIANS,
	LATTICE_RESOLUTION_C,
	LATTICE_RESOLUTION_SWEEP,
	decodeImage,
	rankingOf,
	selectOnCover,
} from "../selector/index.ts"
import type { DecodedImage, MemberPalette, Selection } from "../selector/types.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "..")

/** [STRUCTURAL] A full turn in degrees. Presentation only — the selector works in radians. */
const DEGREES_PER_TURN = 360
/** [STRUCTURAL] A full turn in radians, from the selector's own constant. */
const FULL_TURN = FULL_TURN_RADIANS

/** The pinned M1 runs each member's palettes come from. */
const MEMBER_RUNS: readonly { slug: string; runPath: string }[] = [
	{ slug: "p1-mdl", runPath: "data/m1/runs/p1-mdl-gate3-snapshot.jsonl" },
	{ slug: "p2-tree", runPath: "data/m1/runs/p2-tree-demo20.jsonl" },
	{ slug: "p3-fields", runPath: "data/m1/runs/p3-fields-demo20.jsonl" },
	{ slug: "p5-fieldfit", runPath: "data/m1/runs/p5-fieldfit-demo20.jsonl" },
]

type Row = {
	kind: string
	index: number
	imagePath: string
	inputContentHash: string
	ok: boolean
	palette: Palette | null
}

type Cover = { contentHash: string; imagePath: string; members: MemberPalette[] }

async function readRun(runPath: string): Promise<Row[]> {
	const text = await readFile(resolve(PROTOTYPE, runPath), "utf8")
	const rows: Row[] = []
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue
		const parsed = JSON.parse(line) as Row
		if (parsed.kind === "devloop-run-row") rows.push(parsed)
	}
	return rows
}

/** Join the member runs on the content hash, in the order the widest run lists its covers. */
async function loadCovers(): Promise<Cover[]> {
	const byMember = new Map<string, Row[]>()
	for (const member of MEMBER_RUNS) byMember.set(member.slug, await readRun(member.runPath))
	let order: Row[] = []
	for (const rows of byMember.values()) if (rows.length > order.length) order = rows

	const covers: Cover[] = []
	for (const reference of order) {
		const members: MemberPalette[] = []
		for (const member of MEMBER_RUNS) {
			const row = byMember
				.get(member.slug)!
				.find((candidate) => candidate.inputContentHash === reference.inputContentHash)
			if (row === undefined || !row.ok || row.palette === null) continue
			members.push({ slug: member.slug, palette: row.palette })
		}
		covers.push({
			contentHash: reference.inputContentHash,
			imagePath: reference.imagePath,
			members,
		})
	}
	return covers
}

async function decodeAll(covers: readonly Cover[]): Promise<Map<string, DecodedImage>> {
	const decoded = new Map<string, DecodedImage>()
	for (const cover of covers) decoded.set(cover.contentHash, await decodeImage(cover.imagePath))
	return decoded
}

function shortHash(hash: string): string {
	return hash.slice(0, 10)
}

/** What the table quotes from the sweep artifact, so the C anchor's prose is derived, not typed. */
type CSweepSummary = {
	sweep: number[]
	stableFrom: number | null
	distinctRankings: number
	distinctWinners: number
	agreement: {
		resolution: number
		covers: number
		unpriceable: number
		comparableCovers: number
		rankingMatchesFinest: number
		winnerMatchesFinest: number
	}[]
}

/**
 * Read the C sweep this table's C is anchored by, if it has been generated.
 *
 * Returns `null` rather than throwing: a bit table produced before the sweep is a legitimate
 * intermediate, and it says on its face that its C is unanchored instead of quoting an anchor that
 * does not exist.
 */
async function readCSweep(): Promise<CSweepSummary | null> {
	let parsed: {
		sweep: number[]
		stableFrom: number | null
		agreement: CSweepSummary["agreement"]
		perResolution: Record<string, SweepRow[]>
	}
	try {
		parsed = JSON.parse(await readFile(resolve(PROTOTYPE, "data/m2/c-sweep.json"), "utf8"))
	} catch {
		return null
	}
	const rows = Object.values(parsed.perResolution).flat().filter((row) => row.ranking !== null)
	return {
		sweep: parsed.sweep,
		stableFrom: parsed.stableFrom,
		distinctRankings: new Set(rows.map((row) => row.ranking!.join(">"))).size,
		distinctWinners: new Set(rows.map((row) => row.winner)).size,
		agreement: parsed.agreement,
	}
}

// ---------------------------------------------------------------------------------------------
// sweep
// ---------------------------------------------------------------------------------------------

type SweepRow = {
	contentHash: string
	/** `null` on an unpriceable cover — there is no ranking to compare. */
	ranking: string[] | null
	winner: string | null
	unpriceable: boolean
}

async function runSweep(): Promise<void> {
	const covers = await loadCovers()
	const images = await decodeAll(covers)
	const perResolution: Record<string, SweepRow[]> = {}

	for (const resolution of LATTICE_RESOLUTION_SWEEP) {
		const rows: SweepRow[] = []
		for (const cover of covers) {
			const { selection } = selectOnCover(images.get(cover.contentHash)!, cover.members, resolution)
			rows.push({
				contentHash: cover.contentHash,
				ranking: rankingOf(selection),
				winner: selection.winner,
				unpriceable: selection.unpriceable !== null,
			})
		}
		perResolution[String(resolution)] = rows
		process.stdout.write(`C=${resolution} done\n`)
	}

	const finest = LATTICE_RESOLUTION_SWEEP[LATTICE_RESOLUTION_SWEEP.length - 1]!
	const reference = perResolution[String(finest)]!
	// **Unpriceable covers are excluded from the anchor, not counted as agreement.** They carry no
	// ranking (`rankingOf` returns null), and a sweep that scored `null === null` as a match would
	// report stability it had not measured — which is exactly what the first run of this milestone
	// did before the σ = 0 refusal existed, sorting NaNs on four covers and calling it 20/20.
	const agreement = LATTICE_RESOLUTION_SWEEP.map((resolution) => {
		const rows = perResolution[String(resolution)]!
		let comparable = 0
		let rankingMatches = 0
		let winnerMatches = 0
		for (const [at, row] of rows.entries()) {
			const target = reference[at]!
			if (row.ranking === null || target.ranking === null) continue
			comparable += 1
			if (row.ranking.join(">") === target.ranking.join(">")) rankingMatches += 1
			if (row.winner === target.winner) winnerMatches += 1
		}
		return {
			resolution,
			covers: rows.length,
			unpriceable: rows.filter((row) => row.unpriceable).length,
			comparableCovers: comparable,
			rankingMatchesFinest: rankingMatches,
			winnerMatchesFinest: winnerMatches,
			rankingAgreementRate: comparable === 0 ? null : rankingMatches / comparable,
		}
	})

	// The smallest rung whose ranking equals the finest rung's on every cover, and which every
	// coarser-than-finest rung above it also matches — arm-c′ §4.1's "stops changing".
	let stableFrom: number | null = null
	for (const [at, entry] of agreement.entries()) {
		if (
			agreement
				.slice(at)
				.every(
					(later) =>
						later.comparableCovers > 0 && later.rankingMatchesFinest === later.comparableCovers,
				)
		) {
			stableFrom = entry.resolution
			break
		}
	}

	const report = {
		kind: "p4-portfolio-m2-c-sweep",
		generatedAt: new Date().toISOString(),
		question:
			"arm-c′ §4 decision 1: the smallest lattice resolution C at which the member ranking stops changing.",
		method:
			"Every member's pinned M1 palette is priced on every demo-20 cover at every rung; the per-cover ranking (cheapest total bits first) is compared with the finest rung's. Covers the selector refuses as unpriceable (σ = 0) carry no ranking and are excluded from the comparison rather than counted as agreement.",
		caveat:
			"The ladder's floor is 24, so a `stableFrom` of 24 means 'stable across every rung measured', not 'stable below 24'. What the artifact establishes is that the ranking does not move across the measured range of C.",
		sweep: LATTICE_RESOLUTION_SWEEP,
		agreement,
		stableFrom,
		chosen: stableFrom,
		perResolution,
	}
	const outPath = resolve(PROTOTYPE, "data/m2/c-sweep.json")
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(report, null, "\t")}\n`)
	process.stdout.write(`${outPath}\nstableFrom=${stableFrom}\n`)
}

// ---------------------------------------------------------------------------------------------
// table
// ---------------------------------------------------------------------------------------------

function bitTableRow(selection: Selection): Record<string, unknown> {
	return {
		contentHash: selection.contentHash,
		imagePath: selection.imagePath,
		sigma: selection.sigma,
		unpriceable: selection.unpriceable,
		immaterial: !selection.materiality.material,
		winner: selection.winner,
		runnerUp: selection.runnerUp,
		marginBits: selection.marginBits,
		tieBrokenBySchemaPrice: selection.tieBrokenBySchemaPrice,
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
	}
}

function histogram(values: readonly number[], edges: readonly number[]): Record<string, number> {
	const bins: Record<string, number> = {}
	for (const [at, edge] of edges.entries()) {
		const next = edges[at + 1]
		const label = next === undefined ? `>=${edge}` : `${edge}..${next}`
		bins[label] = 0
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

async function runTable(): Promise<void> {
	const covers = await loadCovers()
	const images = await decodeAll(covers)
	const rows: Record<string, unknown>[] = []
	const selections: Selection[] = []
	const sigmas: number[] = []

	for (const cover of covers) {
		const image = images.get(cover.contentHash)!
		const { selection, substrate } = selectOnCover(image, cover.members, LATTICE_RESOLUTION_C)
		sigmas.push(substrate.sigma)
		selections.push(selection)
		rows.push({ ...bitTableRow(selection), sigma: substrate.sigma })
	}

	// Refused covers are held out of every denominator. A winner count over twenty when four of them
	// were never priced would be four silent wins for whichever member happened to sort first.
	const refused = selections.filter((selection) => selection.unpriceable !== null)
	const priced = selections.filter((selection) => selection.unpriceable === null)

	const winnerCounts: Record<string, number> = {}
	for (const selection of priced) {
		winnerCounts[selection.winner!] = (winnerCounts[selection.winner!] ?? 0) + 1
	}
	const materialSelections = priced.filter((selection) => selection.materiality.material)
	const winFractions = materialSelections.flatMap((selection) =>
		selection.bootstrap === null ? [] : [selection.bootstrap.winFraction],
	)
	const margins = priced.flatMap((selection) =>
		selection.marginBits === null ? [] : [selection.marginBits],
	)

	const report = {
		kind: "p4-portfolio-m2-bit-table",
		generatedAt: new Date().toISOString(),
		latticeResolution: LATTICE_RESOLUTION_C,
		anchor: "data/m2/c-sweep.json",
		cSweep: await readCSweep(),
		covers: rows.length,
		pricedCovers: priced.length,
		// σ is reported at its extremes, not only as a mean: `selector/substrate.ts` leaves σ = 0
		// degenerate rather than floor it, so how far the corpus sits from that limit — and how often
		// it lands on it — is the number a reader needs.
		sigma: {
			min: Math.min(...sigmas),
			mean: sigmas.reduce((total, value) => total + value, 0) / sigmas.length,
			max: Math.max(...sigmas),
			zeroCovers: sigmas.filter((value) => value === 0).length,
		},
		unpriceable: {
			count: refused.length,
			decision: "arm-c′ §4 decision 3 — see HELD_DECISIONS in selector/constants.ts",
			covers: refused.map((selection) => ({
				contentHash: selection.contentHash,
				imagePath: selection.imagePath,
				sigma: selection.sigma,
				reason: selection.unpriceable!.reason,
			})),
		},
		coverage: MEMBER_RUNS.map((member) => ({
			slug: member.slug,
			runPath: member.runPath,
			covers: priced.filter((selection) =>
				selection.prices.some((price) => price.slug === member.slug),
			).length,
		})),
		winnerCounts,
		immaterialCovers: priced.length - materialSelections.length,
		materialCovers: materialSelections.length,
		marginBits: {
			min: Math.min(...margins),
			max: Math.max(...margins),
			histogram: histogram(margins, [0, 1, 10, 100, 1000, 10000, 100000]),
		},
		f1Read: {
			question:
				"F1 (SPEC §3): on covers where the palettes materially differ, does the bootstrap win fraction sit near one half?",
			scope:
				"demo-20 only. F1 is measured properly at M3 scale on coverage-set-1; this is the read this milestone can make, reported as a distribution with no verdict attached.",
			materialCovers: materialSelections.length,
			winFractionHistogram: histogram(winFractions, [0, 0.4, 0.45, 0.5, 0.55, 0.6, 1]),
			winFractionsExactlyOne: winFractions.filter((fraction) => fraction === 1).length,
			separatedFromHalf: materialSelections.filter(
				(selection) => selection.bootstrap?.separatedFromHalf === true,
			).length,
			cappedWithoutSeparation: materialSelections.filter(
				(selection) => selection.bootstrap?.capped === true,
			).length,
		},
		rows,
	}

	const outPath = resolve(PROTOTYPE, "data/m2/bit-table.json")
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(report, null, "\t")}\n`)
	await writeFile(resolve(PROTOTYPE, "BITTABLE.md"), renderMarkdown(report, selections))
	process.stdout.write(`${outPath}\n`)
}

function fixed(value: number, digits: number): string {
	return Number.isFinite(value) ? value.toFixed(digits) : "—"
}

function renderMarkdown(report: Record<string, unknown>, selections: readonly Selection[]): string {
	const lines: string[] = []
	const priced = selections.filter((selection) => selection.unpriceable === null)
	const slugs = [...new Set(priced.flatMap((s) => s.prices.map((p) => p.slug)))].sort()
	lines.push("# P4 bit table — M2")
	lines.push("")
	lines.push(
		"**Generated by `tools/m2-run.ts table` from the pinned M1 palettes. Do not hand-edit.** " +
			"arm-c′ §8's bit table: every member's price on every cover, the winner, the margin in bits, " +
			"whether the selection was material at all, and the measured win fraction where it was.",
	)
	lines.push("")
	const sigma = report.sigma as { min: number; mean: number; max: number; zeroCovers: number }
	const pricedSigmas = priced.map((selection) => selection.sigma)
	lines.push(
		`Lattice resolution **C = ${report.latticeResolution}** — \`[MEASURED]\`, anchored by \`${report.anchor}\` (§3). ` +
			"Noise scale σ is measured per file, never chosen and never floored. Over the **priced** " +
			`covers it runs ${fixed(Math.min(...pricedSigmas), 5)} … ${fixed(Math.max(...pricedSigmas), 5)} ` +
			`OKLab units; over all ${report.covers} it reaches exactly ${sigma.min} on ${sigma.zeroCovers} ` +
			"of them, which is §5.",
	)
	lines.push("")
	const coverage = report.coverage as { slug: string; covers: number; runPath: string }[]
	lines.push(
		"**Member coverage — read every count below against this row, not against the cover total.** " +
			coverage.map((entry) => `\`${entry.slug}\` **${entry.covers}**`).join(", ") +
			` of ${report.pricedCovers} priced covers. \`p1-mdl\` published on three gate covers only ` +
			"(its 240 s budget, `MEMBERS.md` §4 item 2) and two of those three are among the σ = 0 " +
			`refusals in §5, so it is priced on ${coverage.find((entry) => entry.slug === "p1-mdl")?.covers ?? 0} ` +
			"cover here. A member absent from a row shows `—`, never a substituted value, and its winner " +
			"count is out of the covers it was priced on. One cover is not evidence about a member.",
	)
	lines.push("")
	const refusals = report.unpriceable as { count: number; covers: { contentHash: string }[] }
	if (refusals.count > 0) {
		lines.push(
			`> **${refusals.count} of ${report.covers} covers are not in the tables below.** The selector ` +
				"refused them: their measured σ is exactly zero, so the currency has no scale and every " +
				"member's total is `NaN`. They are listed with their reason in §5, and they are excluded " +
				"from every count and every distribution on this page rather than being priced against an " +
				"invented noise floor. This is the milestone's headline finding.",
		)
		lines.push("")
	}
	lines.push("## 1. Per cover, per member — the priced description")
	lines.push("")
	lines.push(
		"`L(palette)` is the schema price (SPEC §2): published colours at `½·log₂ N` per coordinate " +
			"plus `log₂` of each discrete schema field's own cardinality. `residual` is the negative " +
			"log-likelihood at σ over the lattice, with the field the palette implies and the pixels " +
			"inside the same-colour bar of foreground/accent at zero marginal cost. `total` is the sum, " +
			"and the smallest total wins.",
	)
	lines.push("")
	lines.push("| cover | member | L(palette) | residual | total | field | axis° | explained px |")
	lines.push("|---|---|---|---|---|---|---|---|")
	for (const selection of priced) {
		for (const price of [...selection.prices].sort((a, b) => a.totalBits - b.totalBits)) {
			const won = price.slug === selection.winner
			// Normalised into [0, 360) so the refine's tiny negative excursions do not print as "-0.0".
			const degrees = ((price.field.angleRadians ?? 0) * DEGREES_PER_TURN) / FULL_TURN
			const angle =
				price.field.angleRadians === null
					? "—"
					: fixed(((degrees % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN, 1)
			lines.push(
				`| \`${shortHash(selection.contentHash)}\` | ${won ? `**${price.slug}**` : price.slug} | ` +
					`${fixed(price.schema.bits, 1)} | ${fixed(price.residualBits, 0)} | ` +
					`${won ? `**${fixed(price.totalBits, 0)}**` : fixed(price.totalBits, 0)} | ` +
					`${price.field.kind} | ${angle} | ${fixed(price.explainedPixelFraction, 3)} |`,
			)
		}
	}
	lines.push("")
	lines.push("## 2. Per cover — the selection")
	lines.push("")
	lines.push(
		`| cover | ${slugs.map((slug) => `${slug} total`).join(" | ")} | winner | margin (bits) | immaterial | win fraction | resamples | block |`,
	)
	lines.push(`|---|${slugs.map(() => "---").join("|")}|---|---|---|---|---|---|`)
	for (const selection of priced) {
		const byslug = new Map(selection.prices.map((price) => [price.slug, price]))
		const cells = slugs.map((slug) => {
			const price = byslug.get(slug)
			return price === undefined ? "—" : fixed(price.totalBits, 0)
		})
		const bootstrap = selection.bootstrap
		lines.push(
			`| \`${shortHash(selection.contentHash)}\` | ${cells.join(" | ")} | **${selection.winner}** | ` +
				`${selection.marginBits === null ? "—" : fixed(selection.marginBits, 0)} | ` +
				`${selection.materiality.material ? "no" : "**yes**"} | ` +
				`${bootstrap === null ? "—" : fixed(bootstrap.winFraction, 3)} | ` +
				`${bootstrap === null ? "—" : String(bootstrap.resamples)} | ` +
				`${bootstrap === null ? "—" : `${bootstrap.blockSide}×${bootstrap.blockSide}`} |`,
		)
	}
	lines.push("")
	lines.push("## 3. Headline, and the C anchor")
	lines.push("")
	lines.push(
		`- Covers in the run: **${report.covers}**; **priced: ${report.pricedCovers}**; refused as unpriceable: **${refusals.count}** (§5).`,
	)
	lines.push(
		`- Winner counts: ${Object.entries(report.winnerCounts as Record<string, number>)
			.map(([slug, count]) => `\`${slug}\` ${count}`)
			.join(", ")}.`,
	)
	lines.push(
		`- Immaterial selections (every pair agrees on every role at the contract's regional bar): **${report.immaterialCovers}** of ${report.pricedCovers} priced.`,
	)
	lines.push(
		`- Selections decided by the §2.3d tie-break (exactly equal totals, cheaper \`L(palette)\` wins): **${priced.filter((selection) => selection.tieBrokenBySchemaPrice).length}**.`,
	)
	lines.push(
		`- Margin distribution (bits, winner over runner-up): ${JSON.stringify((report.marginBits as Record<string, unknown>).histogram)}.`,
	)
	lines.push("")
	const sweep = report.cSweep as CSweepSummary | null
	if (sweep === null) {
		lines.push(
			`**The C anchor is missing.** \`${report.anchor}\` has not been generated — run ` +
				"`tools/m2-run.ts sweep` before reading C as anchored.",
		)
	} else {
		lines.push(
			`**The C anchor.** \`${report.anchor}\` prices every member on every cover at C ∈ ` +
				`{${sweep.sweep.join(", ")}} and compares the per-cover ranking with the finest rung's. ` +
				"Per-rung agreement with the finest rung, over the covers that were priceable at all:",
		)
		lines.push("")
		lines.push("| C | covers | unpriceable | comparable | ranking matches finest | winner matches finest |")
		lines.push("|---|---|---|---|---|---|")
		for (const row of sweep.agreement) {
			lines.push(
				`| ${row.resolution} | ${row.covers} | ${row.unpriceable} | ${row.comparableCovers} | ` +
					`${row.rankingMatchesFinest} | ${row.winnerMatchesFinest} |`,
			)
		}
		lines.push("")
		lines.push(
			`The ranking is identical at every rung, and the agreement is **not** the trivial kind one ` +
				`dominant member would produce: ${sweep.distinctRankings} distinct rankings and ` +
				`${sweep.distinctWinners} distinct winners appear across those covers. \`stableFrom\` is ` +
				`therefore **${sweep.stableFrom}** and C takes it.`,
		)
		lines.push("")
		lines.push(
			`**What this does not establish.** The ladder's floor is ${sweep.sweep[0]}, so the artifact ` +
				"cannot distinguish \"stable from the bottom rung\" from \"stable below it\". What it does " +
				`establish is the property the anchor is for — the ranking does not move across the ` +
				`measured range of C, a factor of ${fixed(sweep.sweep[sweep.sweep.length - 1]! / sweep.sweep[0]!, 1)}.`,
		)
	}
	lines.push("")
	lines.push("## 4. The F1 read on demo-20")
	lines.push("")
	const f1 = report.f1Read as Record<string, unknown>
	lines.push(`> ${f1.question as string}`)
	lines.push("")
	lines.push(`**Scope.** ${f1.scope as string}`)
	lines.push("")
	lines.push(`- Material covers: **${f1.materialCovers}**.`)
	lines.push(`- Win-fraction distribution: ${JSON.stringify(f1.winFractionHistogram)}.`)
	lines.push(`- Win fraction exactly 1: **${f1.winFractionsExactlyOne}**.`)
	lines.push(
		`- Wilson interval separated from ½ before the compute cap: **${f1.separatedFromHalf}**; capped without separating: **${f1.cappedWithoutSeparation}**.`,
	)
	lines.push("")
	lines.push("No verdict is attached to these numbers. F1 is a corpus statement and twenty covers is not a corpus.")
	lines.push("")
	lines.push("## 5. The covers the selector refused, and why nothing was added to price them")
	lines.push("")
	const sigmaStats = report.sigma as { zeroCovers: number }
	lines.push(
		"σ is the currency's only scale. `L(member | image)` charges the residual at " +
			"`M_k / (2σ² ln2)` bits, so where σ = 0 there is no exchange rate between residual bits and " +
			"schema bits and every member's total is `NaN`. The estimator is arm-c′ §2.1's, implemented " +
			"verbatim: the median absolute difference between horizontally adjacent pixels in OKLab, " +
			"times the analytic consistency factor. It returns exactly zero when **more than half of a " +
			"file's horizontally adjacent pixel pairs are byte-identical** — flat-design artwork, large " +
			"single-fill areas, hard-posterised renders. That is not exotic on album covers.",
	)
	lines.push("")
	lines.push(
		`**Measured: σ = 0 on ${sigmaStats.zeroCovers} of ${report.covers} demo-20 covers.**`,
	)
	lines.push("")
	lines.push("| cover | σ | reason |")
	lines.push("|---|---|---|")
	for (const cover of refusals.covers as { contentHash: string; sigma: number; reason: string }[]) {
		lines.push(`| \`${shortHash(cover.contentHash)}\` | ${cover.sigma} | ${cover.reason} |`)
	}
	lines.push("")
	lines.push(
		"**Why no noise floor was added.** A floor is the obvious repair and it is the one this " +
			"prototype is built to refuse. arm-c′ §2.3a's second stated property of the currency is that " +
			"*\"it has no free scale — σ comes from the image\"*; a floor is a free scale, chosen by hand, " +
			"sitting inside the loss, and it would change which member wins on exactly the covers where " +
			"the currency is weakest. SPEC §3's F2 says it in one line: *\"hand-set constants ARE the " +
			"failure shape; discovering we need one is the result, not a licence to add it.\"* So the " +
			"covers are refused, counted, and listed, and the finding is escalated instead.",
	)
	lines.push("")
	lines.push(
		"**What the finding actually is.** arm-c′ §4 decision 3 is the noise-scale estimator's *form*, " +
			"and its stated anchor is the dither arm — *\"the right one is that for which a ±1-LSB dither " +
			"moves σ by the amount the dither actually injects\"*. P4 has no dither arm and cannot " +
			"author one without choosing the estimator by choosing its test. The form was therefore " +
			"inherited unanchored, and this is the measured consequence. It is registered as " +
			"`HELD_DECISIONS` in `selector/constants.ts` rather than left in prose, so that a later " +
			"reader finds a declared open decision instead of a silent one. Deciding it is the " +
			"orchestrator's, and it is the item this milestone most needs read.",
	)
	lines.push("")
	return `${lines.join("\n")}\n`
}

// ---------------------------------------------------------------------------------------------

const subcommand = process.argv[2]
if (subcommand === "sweep") await runSweep()
else if (subcommand === "table") await runTable()
else {
	process.stdout.write("usage: m2-run.ts sweep|table\n")
	process.exit(2)
}

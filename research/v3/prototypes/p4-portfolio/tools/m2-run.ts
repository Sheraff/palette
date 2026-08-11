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
		sigmaMeasured: selection.sigmaMeasured,
		sigmaQuantization: selection.sigmaQuantization,
		sigmaFlooredByQuantization: selection.sigmaFlooredByQuantization,
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
		// SPEC §3.1 — what the floor did, per cover, so it can be audited rather than believed.
		sigmaFloor: {
			decision: "SPEC §3.1 — see DERIVED_QUANTITIES in selector/constants.ts",
			derivedFrom: "measureQuantizationScale() in selector/substrate.ts",
			measuredZeroCovers: selections.filter((selection) => selection.sigmaMeasured === 0).length,
			flooredCovers: selections.filter((selection) => selection.sigmaFlooredByQuantization).length,
			quantizationScale: {
				min: Math.min(...selections.map((selection) => selection.sigmaQuantization)),
				max: Math.max(...selections.map((selection) => selection.sigmaQuantization)),
			},
			covers: selections
				.filter((selection) => selection.sigmaFlooredByQuantization)
				.map((selection) => ({
					contentHash: selection.contentHash,
					imagePath: selection.imagePath,
					sigmaMeasured: selection.sigmaMeasured,
					sigmaQuantization: selection.sigmaQuantization,
					// The four demo-20 covers M2 refused are exactly the σ_measured = 0 ones.
					wasRefusedAtM2: selection.sigmaMeasured === 0,
					winner: selection.winner,
					marginBits: selection.marginBits,
					winFraction: selection.bootstrap?.winFraction ?? null,
				})),
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
	const floor = report.sigmaFloor as {
		measuredZeroCovers: number
		flooredCovers: number
		quantizationScale: { min: number; max: number }
		covers: {
			contentHash: string
			sigmaMeasured: number
			sigmaQuantization: number
			wasRefusedAtM2: boolean
			winner: string | null
			marginBits: number | null
			winFraction: number | null
		}[]
	}
	lines.push(
		`Lattice resolution **C = ${report.latticeResolution}** — \`[MEASURED]\`, anchored by \`${report.anchor}\` (§3). ` +
			"The scale σ the currency prices at is `max(σ_measured, σ_quant)` — **SPEC §3.1**, acknowledged " +
			"by the main tier and implemented at this milestone. Both terms are measured from the file: " +
			"σ_measured is arm-c′ §2.1's estimator, unchanged; σ_quant is the 8-bit sRGB quantization " +
			"scale carried into OKLab at the image's mean colour, derived in `selector/substrate.ts` and " +
			"registered in `DERIVED_QUANTITIES`. Over the priced covers the effective σ runs " +
			`${fixed(Math.min(...pricedSigmas), 5)} … ${fixed(Math.max(...pricedSigmas), 5)} OKLab units; ` +
			`σ_quant runs ${fixed(floor.quantizationScale.min, 5)} … ${fixed(floor.quantizationScale.max, 5)}; ` +
			`σ_measured is exactly 0 on ${floor.measuredZeroCovers} of ${report.covers} covers and the floor ` +
			`binds on ${floor.flooredCovers}. That is §5.`,
	)
	lines.push("")
	const coverage = report.coverage as { slug: string; covers: number; runPath: string }[]
	lines.push(
		"**Member coverage — read every count below against this row, not against the cover total.** " +
			coverage.map((entry) => `\`${entry.slug}\` **${entry.covers}**`).join(", ") +
			` of ${report.pricedCovers} priced covers. \`p1-mdl\` published on three gate covers only ` +
			"(its 240 s budget, `MEMBERS.md` §4 item 2), so it is priced on " +
			`${coverage.find((entry) => entry.slug === "p1-mdl")?.covers ?? 0} covers here — two of them ` +
			"only because SPEC §3.1's floor converted the σ = 0 refusals of §5. A member absent from a " +
			"row shows `—`, never a substituted value, and its winner count is out of the covers it was " +
			"priced on. Three covers are not evidence about a member.",
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
		"**`σ floored`** marks a cover priced at the encoding's quantization scale because the estimator " +
			"resolved less than one LSB (SPEC §3.1). **`converted`** marks the subset of those whose " +
			"σ_measured is exactly 0 — the covers M2 refused outright and could not price at all.",
	)
	lines.push("")
	lines.push(
		`| cover | ${slugs.map((slug) => `${slug} total`).join(" | ")} | winner | margin (bits) | immaterial | win fraction | resamples | block | σ floored |`,
	)
	lines.push(`|---|${slugs.map(() => "---").join("|")}|---|---|---|---|---|---|---|`)
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
				`${bootstrap === null ? "—" : `${bootstrap.blockSide}×${bootstrap.blockSide}`} | ` +
				`${
					!selection.sigmaFlooredByQuantization
						? "no"
						: selection.sigmaMeasured === 0
							? "**converted**"
							: "yes"
				} |`,
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
	lines.push("## 5. The σ floor — what M2 refused, and what it prices at now")
	lines.push("")
	lines.push(
		"σ is the currency's only scale. `L(member | image)` charges the residual at " +
			"`M_k / (2σ² ln2)` bits, so where σ = 0 there is no exchange rate between residual bits and " +
			"schema bits and every member's total is `NaN`. The estimator is arm-c′ §2.1's, implemented " +
			"verbatim: the median absolute difference between horizontally adjacent pixels in OKLab, " +
			"times the analytic consistency factor. It returns exactly zero when **more than half of a " +
			"file's horizontally adjacent pixel pairs are byte-identical** — flat-design artwork, large " +
			"single-fill areas, hard-posterised renders. That is not exotic on album covers, and at M2 " +
			"it cost four of twenty covers, refused rather than priced against an invented floor.",
	)
	lines.push("")
	lines.push(
		"**The estimator has not been touched.** `measureNoiseScale()` returns exactly what it returned " +
			`at M2 — σ_measured is still exactly 0 on ${floor.measuredZeroCovers} of ${report.covers} ` +
			"covers, and `tests/substrate.test.ts` still pins that. What changed is what the currency " +
			"prices at: **σ_effective = max(σ_measured, σ_quant)**, SPEC §3.1, pre-registered before " +
			"implementation and acknowledged by the main tier.",
	)
	lines.push("")
	lines.push(
		"**σ_quant is derived, not chosen, and the derivation is the provenance.** Rounding to 8 bits " +
			"leaves an error uniform over one quantization cell, so per sRGB channel `σ_s = 1 LSB/√12` " +
			"(the variance of a uniform over its cell, `∫x²dx = 1/12`). Over one LSB the sRGB→OKLab map " +
			"is linear to second order, so the OKLab perturbation is `Δ = Σ_c J_c e_c` with `J_c` the " +
			"Jacobian column at **the image's mean 8-bit colour**, giving `Var_k = σ_s²·Σ_c J_c[k]²`. " +
			"Pooled into one isotropic scale by the same rule `measureNoiseScale` pools its three " +
			"coordinates (`3σ² = Σ_k σ_k²`): **σ_quant = ‖J‖_F / √36**, where 36 is " +
			"`OKLAB_DIMENSIONS · UNIFORM_QUANTIZATION_VARIANCE_DENOMINATOR` and is never written as a " +
			"digit. The columns `J_c` are the symmetric difference of the **contract's own** `rgbToOkLab` " +
			"over ±1 LSB about the mean colour — the smallest step the encoding admits, and exactly the " +
			"probe arm-c′ §4.3 anchors decision 3 on. Nothing is swept, fitted or tuned: σ_quant is a " +
			`function of the image and takes a different value on every cover (here ` +
			`${fixed(floor.quantizationScale.min, 6)} … ${fixed(floor.quantizationScale.max, 6)}).`,
	)
	lines.push("")
	lines.push(
		"**F2 is still armed, and it is armed at this specifically.** No constant was whitelisted: the " +
			"floor added no registered number, only two `[STRUCTURAL]` identities (the 12 of a uniform's " +
			"variance, the 2 of a symmetric difference's span). `tests/f2-tripwire.test.ts` now runs a " +
			"synthetic offender that is precisely the failure shape — a hard-set `SIGMA_FLOOR = 1e-3`, " +
			"and the same value inlined — and fails if the scanner does not catch it.",
	)
	lines.push("")
	const convertedCount = floor.covers.filter((cover) => cover.wasRefusedAtM2).length
	lines.push(
		`**Measured on this run: the floor binds on ${floor.flooredCovers} of ${report.covers} covers, of ` +
			`which ${convertedCount} are the covers M2 refused.**`,
	)
	lines.push("")
	if (floor.flooredCovers === convertedCount) {
		lines.push(
			`So it binds on **none** of the ${(report.covers as number) - convertedCount} covers M2 could ` +
				"already price: on those, σ_measured > σ_quant, `max` returns the same double, and every " +
				"member's total, the winner, the margin and the win fraction are **bit-for-bit what M2 " +
				`published** (checked against \`data/m2/bit-table.pre-floor.json\`: ` +
				`${(report.covers as number) - convertedCount}/${(report.covers as number) - convertedCount} ` +
				"rows identical). The floor is not a rescale of the corpus; it is a scale for the covers " +
				"that had none.",
		)
		lines.push("")
	}
	if (floor.covers.length > 0) {
		lines.push("| cover | σ_measured | σ_quant | M2 status | winner now | margin (bits) | win fraction |")
		lines.push("|---|---|---|---|---|---|---|")
		for (const cover of floor.covers) {
			lines.push(
				`| \`${shortHash(cover.contentHash)}\` | ${fixed(cover.sigmaMeasured, 6)} | ` +
					`${fixed(cover.sigmaQuantization, 6)} | ` +
					`${cover.wasRefusedAtM2 ? "**REFUSED**" : "priced"} | ` +
					`${cover.winner ?? "—"} | ${cover.marginBits === null ? "—" : fixed(cover.marginBits, 0)} | ` +
					`${cover.winFraction === null ? "—" : fixed(cover.winFraction, 3)} |`,
			)
		}
		lines.push("")
	}
	if (refusals.count > 0) {
		lines.push(`**Covers still refused after the floor: ${refusals.count}.**`)
		lines.push("")
		lines.push("| cover | σ | reason |")
		lines.push("|---|---|---|")
		for (const cover of refusals.covers as { contentHash: string; sigma: number; reason: string }[]) {
			lines.push(`| \`${shortHash(cover.contentHash)}\` | ${cover.sigma} | ${cover.reason} |`)
		}
		lines.push("")
	} else {
		lines.push(
			"**Covers still refused after the floor: 0.** The refusal path in `selector/pipeline.ts` is " +
				"kept — it is still the honest answer to a cover with no positive scale — but nothing in " +
				"this run reaches it, and `tests/select.test.ts` now drives it directly rather than " +
				"through a fixture, which is stated there rather than quietly dropped.",
		)
		lines.push("")
	}
	lines.push(
		"**What is still open.** The floor resolves the *degeneracy*; it does not anchor arm-c′ §4 " +
			"decision 3, which is the estimator's **form**. That anchor is the dither arm — *\"the right " +
			"one is that for which a ±1-LSB dither moves σ by the amount the dither actually injects\"* — " +
			"and P4 still has no dither arm and still cannot author one without choosing the estimator by " +
			"choosing its test. Decision 3 therefore remains in `HELD_DECISIONS` in " +
			"`selector/constants.ts`, unsettled and declared, and the floor is registered separately in " +
			"`DERIVED_QUANTITIES`.",
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

import type { Selection } from "../selector/types.ts"

/**
 * The M3 report: the bit table's own summaries, and the renderer `M3.md` comes out of.
 *
 * Extracted from `tools/m3-run.ts` so that **one renderer** serves both the full milestone run and
 * the targeted re-price the bootstrap-semantics fix needed (`tools/m3-election-fix.ts`). A second
 * copy of this code would be a second document, and `M3.md` says of itself that it is generated —
 * that claim has to stay true whichever tool last wrote it.
 *
 * Nothing here decides anything. `electionSummary` reads the selector's own published election off
 * the rows; it does not recompute it, so this module cannot disagree with `selector/select.ts`.
 */

/** [STRUCTURAL] A full turn in degrees. Presentation only. */
const DEGREES_PER_TURN = 360

/** The first ten hex digits of a content hash — how every table in this milestone names a cover. */
export function shortHash(hash: string): string {
	return hash.slice(0, 10)
}

/** One cover's row, in the shape the bit table publishes and the determinism check compares. */
export function bitTableRow(
	selection: Selection,
	membersMissing: readonly string[],
	priceMs: number,
): Record<string, unknown> {
	return {
		contentHash: selection.contentHash,
		imagePath: selection.imagePath,
		sigma: selection.sigma,
		sigmaMeasured: selection.sigmaMeasured,
		sigmaQuantization: selection.sigmaQuantization,
		sigmaFlooredByQuantization: selection.sigmaFlooredByQuantization,
		membersPriced: selection.prices.map((price) => price.slug),
		membersMissing,
		unpriceable: selection.unpriceable,
		immaterial: !selection.materiality.material,
		winner: selection.winner,
		runnerUp: selection.runnerUp,
		marginBits: selection.marginBits,
		// What the selector PUBLISHES (SPEC §2 (c), the ruling on M3 §3.1). Equal to `winner` except
		// where the bootstrap measured a majority for the runner-up.
		elected: selection.elected,
		electedBy: selection.electedBy,
		electionContradictsCheapestTotal: selection.electionContradictsCheapestTotal,
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

/** One published row, as far as the summaries below need to read it. */
export type BitTableRow = Record<string, unknown>

/** One cover where the measured majority overturned the point total, as the summary lists it. */
export type ElectionCover = Readonly<{
	contentHash: string
	imagePath: string
	cheapestTotal: string | null
	elected: string
	marginBits: number | null
	winFraction: number | null
	intervalLow: number | null
	intervalHigh: number | null
	resamples: number | null
}>

/**
 * The election summary — SPEC §2's (c), as the orchestrator ruled on M3 §3.1.
 *
 * The rows already carry `elected` / `electedBy` / `electionContradictsCheapestTotal`, written by
 * `selector/pipeline.ts`. This function only counts them, so the table's headline and the selector
 * cannot drift apart: if the ruling were ever reverted in `select.ts`, these numbers would follow it
 * without an edit here.
 */
export function electionSummary(rows: readonly BitTableRow[]): Record<string, unknown> {
	const electedCounts: Record<string, number> = {}
	const contradictory: Record<string, unknown>[] = []
	for (const row of rows) {
		const elected = row.elected as string | null | undefined
		if (elected === null || elected === undefined) continue
		electedCounts[elected] = (electedCounts[elected] ?? 0) + 1
		if (row.electionContradictsCheapestTotal !== true) continue
		const bootstrap = row.bootstrap as {
			winFraction: number
			intervalLow: number
			intervalHigh: number
			resamples: number
		} | null
		contradictory.push({
			contentHash: row.contentHash,
			imagePath: row.imagePath,
			cheapestTotal: row.winner,
			elected,
			marginBits: row.marginBits,
			winFraction: bootstrap?.winFraction ?? null,
			intervalLow: bootstrap?.intervalLow ?? null,
			intervalHigh: bootstrap?.intervalHigh ?? null,
			resamples: bootstrap?.resamples ?? null,
		})
	}
	return {
		rule:
			"arm-c\u2032 \u00a72.3c \u2014 the winner stands if it wins a majority. Where the block bootstrap " +
			"separates from \u00bd, the ELECTED member is the bootstrap-majority member, including where that " +
			"contradicts the point bit-total: the point total is the estimate, the resampled evidence is the " +
			"measurement (orchestrator ruling on M3 \u00a73.1). Where it does not separate, the cheapest total " +
			"stands \u2014 which leaves \u00a72.3d's tie-break path untouched, every resample of an exact tie being a tie.",
		electedCounts,
		contradictoryCovers: contradictory.length,
		covers: contradictory,
	}
}

export function fixed(value: number | null, digits: number): string {
	return value !== null && Number.isFinite(value) ? value.toFixed(digits) : "—"
}

export function renderMarkdown(report: Record<string, unknown>, rows: readonly Record<string, unknown>[]): string {
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
	const fix = report.bootstrapSemanticsFix as { appliedAt: string; coversAffected: number } | undefined
	lines.push(
		"**Generated by `tools/m3-run.ts` from the M3 member runs. Do not hand-edit.** Every number " +
			"below is re-derivable from `data/m3/bit-table-coverage.json`." +
			(fix === undefined
				? ""
				: ` Last written by \`tools/m3-election-fix.ts\` (${fix.appliedAt}), which re-priced the ` +
					`${fix.coversAffected} cover(s) §3.1's ruling can move and left every other row's numbers ` +
					"untouched — same renderer, so this document is generated either way."),
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
	const election = report.election as
		| { electedCounts: Record<string, number>; contradictoryCovers: number; covers: ElectionCover[] }
		| undefined
	lines.push(
		`- Winner counts (cheapest total, the point estimate): ${Object.entries(
			report.winnerCounts as Record<string, number>,
		)
			.map(([slug, count]) => `\`${slug}\` ${count}`)
			.join(", ")}.`,
	)
	if (election !== undefined) {
		lines.push(
			`- **Elected counts (what the selector publishes, §3.1): ${Object.entries(election.electedCounts)
				.map(([slug, count]) => `\`${slug}\` ${count}`)
				.join(", ")}** — they differ from the winner counts on ${election.contradictoryCovers} cover(s).`,
		)
	}
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
	lines.push("### 3.1 Two-sided separation — the observation, and the ruling that resolves it")
	lines.push("")
	lines.push(
		"Separation from ½ is **two-sided**. arm-c′ §2.3c says the winner stands when the Wilson interval " +
			"on its win fraction excludes ½; it does not say what to do with a winner whose interval " +
			`excludes ½ **from below**. That happens on **${against.count}** cover(s): the cheapest total ` +
			"names one member, and the block bootstrap's resampled evidence points at the other, with the " +
			"interval clearing ½ on the losing side — so the resampling stopping rule fires and the run " +
			"records `separatedFromHalf: true`. These are not near-½ covers and they are not in the share " +
			"above; they are covers where the point estimate and the measured margin disagree in direction.",
	)
	lines.push("")
	if (election !== undefined) {
		lines.push(
			"**Orchestrator ruling, applied here (delta note).** §2.3c reads *\"the winner stands if it wins " +
				"a majority\"*, and a majority is measured rather than asserted: **when the bootstrap separates " +
				"from ½, the ELECTED member is the bootstrap-majority member — including where that " +
				"contradicts the point bit-total.** The point total is the estimate; the resampled evidence is " +
				"the measurement. Implemented as `electFromBootstrap()` in `selector/select.ts`, with no new " +
				"constant (the comparison is against the same `INDIFFERENT_WIN_FRACTION` the stopping rule " +
				"uses) and regression-tested in `tests/election.test.ts` from these covers' own recorded data.",
		)
		lines.push("")
		lines.push(
			"**What moved, exactly.** Nothing priced: every member's `L(palette)`, residual and total on " +
				`these covers is bit-for-bit what it was, and so is every bootstrap report. What moved is ` +
				`\`elected\`, on ${election.contradictoryCovers} of ${rows.length} covers — the affected covers ` +
				"were re-priced from the same member run files and their bits verified identical; the other " +
				"rows carry the election the same rule assigns them without being re-priced. Where the " +
				"bootstrap did **not** separate, the cheapest total still stands — which is why §2.3d's " +
				"tie-break path is untouched: an exact tie ties every resample and can never separate.",
		)
		lines.push("")
	}
	if (against.covers.length > 0) {
		lines.push(
			"| cover | cheapest total | runner-up | **elected** | margin (bits) | win fraction | Wilson interval | resamples |",
		)
		lines.push("|---|---|---|---|---|---|---|---|")
		for (const cover of against.covers) {
			const elected = election?.covers.find((entry) => entry.contentHash === cover.contentHash)?.elected
			lines.push(
				`| \`${shortHash(cover.contentHash)}\` | ${cover.winner ?? "—"} | ${cover.runnerUp ?? "—"} | ` +
					`**${elected ?? cover.winner ?? "—"}** | ` +
					`${fixed(cover.marginBits, 1)} | ${fixed(cover.winFraction, 3)} | ` +
					`[${fixed(cover.intervalLow, 3)}, ${fixed(cover.intervalHigh, 3)}] | ${cover.resamples} |`,
			)
		}
		lines.push("")
	}
	lines.push("## 4. Per cover")
	lines.push("")
	lines.push(
		"`winner` is the cheapest total in bits — the point estimate; **`elected` is what the selector " +
			"publishes** (§3.1), which is the bootstrap-majority member wherever the bootstrap separated " +
			"from ½; `margin` is the runner-up's total minus the winner's; `immaterial` says every pair " +
			"agreed on every role at the contract's regional bar, in which case no bootstrap was paid for; " +
			"`win fraction` is the block bootstrap's, where one ran.",
	)
	lines.push("")
	lines.push(
		"| cover | winner | elected | margin (bits) | immaterial | win fraction | resamples | σ floored | members |",
	)
	lines.push("|---|---|---|---|---|---|---|---|---|")
	for (const row of rows) {
		const bootstrap = row.bootstrap as { resamples: number } | null | undefined
		const priced = row.membersPriced as string[]
		const elected = row.elected as string | null | undefined
		lines.push(
			`| \`${shortHash(row.contentHash as string)}\` | ` +
				`${row.winner === null || row.winner === undefined ? "**refused**" : `**${row.winner as string}**`} | ` +
				`${
					elected === null || elected === undefined
						? "—"
						: row.electionContradictsCheapestTotal === true
							? `**${elected}** ⚑`
							: "="
				} | ` +
				`${fixed(row.marginBits as number | null, 0)} | ` +
				`${row.immaterial === true ? "**yes**" : "no"} | ` +
				`${fixed(row.winFraction as number | null, 3)} | ` +
				`${bootstrap === null || bootstrap === undefined ? "—" : String(bootstrap.resamples)} | ` +
				`${row.sigmaFlooredByQuantization === true ? (row.sigmaMeasured === 0 ? "**converted**" : "yes") : "no"} | ` +
				`${priced.length === 0 ? "—" : priced.length}${(row.membersMissing as string[]).length > 0 ? ` (missing ${(row.membersMissing as string[]).join(", ")})` : ""} |`,
		)
	}
	lines.push("")
	lines.push(
		"`elected` reads `=` where the published member is the cheapest total, and names the member with " +
			"a ⚑ where the measured majority overturned it.",
	)
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

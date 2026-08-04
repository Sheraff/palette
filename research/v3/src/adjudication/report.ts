/**
 * Rendering an adjudication report for a human.
 *
 * The layout is an argument. The three principles are printed **first**, before any count, because a
 * reader who meets "wins: 4 / losses: 1" cold will price them wrongly — they will read the 347
 * endorsements that did not match as 347 failures, which is exactly the reading principle 1 forbids.
 * The no-signal line is printed with the wins, not buried, and the conflicts are printed as items
 * with their grade histories rather than as a count.
 *
 * Deterministic: same report in, byte-identical text out. No clock, no locale formatting.
 */

import type { AdjudicationReport, CandidateVerdict, Conflict, EraTally } from "./types.ts"

function pad(value: string | number, width: number): string {
	const text = String(value)
	return text.length >= width ? text : " ".repeat(width - text.length) + text
}

function padRight(value: string, width: number): string {
	return value.length >= width ? value : value + " ".repeat(width - value.length)
}

function renderEraTally(tally: EraTally): string[] {
	const lines: string[] = []
	lines.push(`  era ${tally.era} — ${tally.candidatesWithEvidence} candidate palettes had evidence in this era`)
	lines.push(
		`    WIN      endorsement matches: ${pad(tally.wins.candidates, 4)} candidates · ` +
			`${tally.wins.distinctEntries} distinct entries · ${tally.wins.distinctArtworks} artworks` +
			(tally.wins.partialBasis > 0
				? ` (${tally.wins.fullBasis} on all four roles, ${tally.wins.partialBasis} on a partial entry's present roles only)`
				: ""),
	)
	lines.push(
		`    LOSS     known-bad matches:   ${pad(tally.losses.candidates, 4)} candidates · ` +
			`${tally.losses.distinctEntries} distinct entries · ${tally.losses.distinctArtworks} artworks`,
	)
	lines.push(
		`    (base)   acceptable matches:  ${pad(tally.baseline.candidates, 4)} candidates · ` +
			`${tally.baseline.distinctEntries} distinct entries — not-rejected baseline, not an endorsement`,
	)
	lines.push(
		`    NO SIGNAL differed from this era's evidence: ${tally.noSignal.differs} · ` +
			`never seen in this era: ${tally.noSignal.unseen}`,
	)
	lines.push("             (differing is not a miss and costs nothing — principle 1)")
	return lines
}

function renderConflict(conflict: Conflict, index: number): string[] {
	const lines: string[] = []
	lines.push(`  ${index}. [${conflict.kind}] era ${conflict.era} — ${conflict.artworkPath ?? "(corpus-wide)"}`)
	lines.push(`     ${conflict.detail}`)
	lines.push(`     entries: ${conflict.entryIds.join(", ")}`)
	if (conflict.standingResolution) lines.push(`     standing: ${conflict.standingResolution}`)
	lines.push(`     recency could settle standing: ${conflict.resolved ? "yes" : "no"}`)
	for (const history of conflict.histories) {
		if (history.history.length === 0) continue
		const trail = history.history
			.map((row) => `${row.grade ?? "?"}@${row.recordedAt ?? "undated"}${row.label ? ` (${row.label})` : ""}`)
			.join(" → ")
		lines.push(`     history: ${trail}`)
	}
	return lines
}

function renderCandidate(verdict: CandidateVerdict): string[] {
	const lines: string[] = []
	const arm = verdict.arm ? ` [${verdict.arm}]` : ""
	lines.push(`  line ${pad(verdict.line, 4)}${arm} ${verdict.artworkPath}`)
	lines.push(
		`    outcome: ${verdict.outcome}   signals: win=${verdict.signals.win} loss=${verdict.signals.loss} ` +
			`baseline=${verdict.signals.baseline}`,
	)
	for (const row of verdict.byEra) lines.push(`    era ${padRight(row.era, 5)} ${row.outcome}`)
	for (const match of verdict.endorsementMatches) {
		lines.push(
			`    WIN  matches endorsement ${match.entryId} (${match.era}, ${match.provenance.recordedAt ?? "undated"}` +
				`${match.provenance.ageDays !== null ? `, ${match.provenance.ageDays}d old` : ""}, basis ${match.match.basis})`,
		)
	}
	for (const match of verdict.knownBadMatches) {
		lines.push(
			`    LOSS matches known-bad ${match.entryId} (${match.era}, standing grade ` +
				`${match.standingGrade ?? "?"}, ${match.provenance.recordedAt ?? "undated"})`,
		)
	}
	for (const match of verdict.acceptableMatches) {
		lines.push(`    base matches acceptable ${match.entryId} (${match.era}) — not an endorsement`)
	}
	if (verdict.unmatchedCount > 0) {
		lines.push(
			`    no signal: differs from ${verdict.unmatchedCount} entr${verdict.unmatchedCount === 1 ? "y" : "ies"} ` +
				"for this file. Nearest:",
		)
		for (const near of verdict.unmatched) {
			const ratio = near.match.worstRoleBarRatio
			const reach = near.reachability.status === "not-assessed" ? "" : `, ${near.reachability.status}`
			lines.push(
				`      ${near.entryId} (${near.tier}, ${near.era}) worst role ` +
					`${ratio === null ? "n/a" : `${ratio.toFixed(2)}× the bar`}${reach}`,
			)
		}
	}
	for (const conflict of verdict.conflicts) {
		lines.push(`    CONFLICT [${conflict.kind}] ${conflict.entryIds.join(", ")}: ${conflict.detail}`)
	}
	return lines
}

export type RenderOptions = Readonly<{ verbose?: boolean }>

export function renderText(report: AdjudicationReport, options: RenderOptions = {}): string {
	const lines: string[] = []

	lines.push("AUTO-ADJUDICATION — candidate run against standing reviewer evidence")
	lines.push("=".repeat(78))
	lines.push("")
	lines.push("The three principles this tool is built on (reviewer, 2026-08-04):")
	for (let index = 0; index < report.principles.length; index += 1) {
		lines.push(`  ${index + 1}. ${report.principles[index]}`)
	}
	lines.push("")
	lines.push(`  Gating: ${report.gating}. Nothing below blocks anything. It informs.`)
	lines.push("")

	lines.push("INPUT")
	lines.push(`  ${report.input.path}`)
	lines.push(
		`  ${report.input.records} candidate palettes parsed · ${report.input.contractComplete} carried the full ` +
			`contract · ${report.input.parseErrors.length} lines refused`,
	)
	for (const error of report.input.parseErrors.slice(0, 10)) {
		lines.push(`    line ${error.line}: ${error.reason}`)
	}
	if (report.input.parseErrors.length > 10) {
		lines.push(`    … and ${report.input.parseErrors.length - 10} more`)
	}
	lines.push("")

	lines.push("MATCH SEMANTICS")
	lines.push(
		`  bar: ${report.options.barMode}${report.options.fixedBar !== null ? ` (${report.options.fixedBar})` : ""}` +
			`  ·  roles: ${report.options.roles.join(", ")}  ·  partial entries: ${report.options.partialEntries}`,
	)
	if (report.options.barMode === "pooled") {
		lines.push("  NOTE: the pooled bar is a corpus metric, not the gate's bar. Per-pair judgements use `regional`.")
	}
	if (report.options.barMode === "exact-hex") {
		lines.push("  NOTE: exact-hex reproduces pre-2026-08-03 provisional counts. It is not a live match semantics.")
	}
	lines.push(
		`  as-of: ${report.options.asOf ?? "(not set — prior ages not computed)"}  ·  ` +
			`reachability: ${report.options.reachability ? "on" : "off"}`,
	)
	lines.push("")

	lines.push("EVIDENCE (dated priors, not ground truth)")
	for (const source of report.evidence) {
		lines.push(
			`  ${padRight(source.era, 5)} ${padRight(source.tier, 11)} ${pad(source.entryCount, 5)} entries  ` +
				`${source.path}  sha256:${source.contentHash.slice(0, 12)}`,
		)
	}
	lines.push("")

	lines.push("RESULTS BY ERA")
	for (const tally of report.aggregate.byEra) {
		lines.push(...renderEraTally(tally))
		lines.push("")
	}

	if (report.aggregate.byArm.length > 1 || (report.aggregate.byArm[0]?.arm ?? "") !== "(unnamed)") {
		lines.push("BY ARM")
		for (const arm of report.aggregate.byArm) {
			lines.push(
				`  ${padRight(arm.arm, 24)} ${pad(arm.candidates, 5)} candidates · ${pad(arm.wins, 4)} win · ` +
					`${pad(arm.losses, 4)} loss · ${pad(arm.noSignal, 5)} no signal`,
			)
		}
		lines.push("")
	}

	lines.push("REACHABILITY — could the candidate's colour set have produced the prior at all?")
	const reach = report.aggregate.reachability
	lines.push(
		`  assessed: ${reach.assessedEntries} entry comparisons · reachable ${reach.reachable} · ` +
			`unreachable ${reach.unreachable} · not assessed ${reach.notAssessed}`,
	)
	if (reach.notAssessed > 0) {
		lines.push("  (not assessed = the run did not carry `availableColors`. Silence is not a pass.)")
	}
	if (reach.unreachableEndorsements.length > 0) {
		lines.push(`  endorsements outside the candidate's colour set (${reach.unreachableEndorsements.length}):`)
		for (const entry of reach.unreachableEndorsements.slice(0, 15)) {
			lines.push(`    ${entry.entryId} (${entry.era}) ${entry.artworkPath}`)
		}
		if (reach.unreachableEndorsements.length > 15) {
			lines.push(`    … and ${reach.unreachableEndorsements.length - 15} more`)
		}
		lines.push("  This is a ceiling fact, not a penalty.")
	}
	lines.push("")

	lines.push(`CONFLICTS IN THE EVIDENCE (${report.aggregate.conflicts.total}) — surfaced per item, never averaged`)
	for (const kind of report.aggregate.conflicts.byKind) {
		lines.push(`  ${padRight(kind.kind, 30)} ${kind.count}`)
	}
	if (report.aggregate.conflicts.total > 0) lines.push("")
	for (let index = 0; index < report.aggregate.conflicts.items.length; index += 1) {
		lines.push(...renderConflict(report.aggregate.conflicts.items[index]!, index + 1))
		lines.push("")
	}
	if (report.aggregate.conflicts.total === 0) lines.push("  none touched by this run")
	lines.push("")

	if (report.movement) {
		lines.push("MOVEMENT vs BASELINE — the 'never move TO known-worse' guardrail")
		lines.push(`  baseline: ${report.movement.baselinePath}`)
		lines.push(`  moved TO known-bad:  ${report.movement.movedToKnownBad.length}`)
		for (const row of report.movement.movedToKnownBad) {
			lines.push(`    ${row.artworkPath} → ${row.entryIds.join(", ")}`)
		}
		lines.push(`  moved OFF known-bad: ${report.movement.movedOffKnownBad.length}`)
		for (const row of report.movement.movedOffKnownBad) {
			lines.push(`    ${row.artworkPath} (was ${row.entryIds.join(", ")})`)
		}
		lines.push(
			`  files only in candidate run: ${report.movement.onlyInCandidate.length} · ` +
				`only in baseline: ${report.movement.onlyInBaseline.length}`,
		)
		lines.push("")
	}

	if (options.verbose) {
		lines.push("PER CANDIDATE")
		for (const verdict of report.perCandidate) {
			lines.push(...renderCandidate(verdict))
			lines.push("")
		}
	} else {
		const notable = report.perCandidate.filter((verdict) => verdict.signals.win || verdict.signals.loss)
		lines.push(`SIGNAL-CARRYING CANDIDATES (${notable.length} of ${report.perCandidate.length}) — --verbose for all`)
		lines.push("")
		for (const verdict of notable) {
			lines.push(...renderCandidate(verdict))
			lines.push("")
		}
		if (notable.length === 0) {
			lines.push("  none. That is not a bad result — it means this run neither reproduced a known-bad")
			lines.push("  palette nor happened to land on a palette the reviewer has already endorsed.")
			lines.push("")
		}
	}

	return lines.join("\n")
}

/** Stable JSON: 2-space indent, key order as constructed, trailing newline. */
export function renderJson(report: AdjudicationReport): string {
	return `${JSON.stringify(report, null, 2)}\n`
}

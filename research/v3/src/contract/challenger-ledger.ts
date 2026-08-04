/**
 * **Where the challenger disagreement counter accumulates.**
 *
 * `[PROVISIONAL — perception-4, reviewer-signed 2026-08-04, adoption gated on the disagreement
 * counter]`
 *
 * `challengers.ts` computes rival same-colour verdicts for one pair and `scorecard.ts` tallies them
 * for one palette. Neither survives the process that produced it. The reviewer's sign-off makes the
 * counter the instrument that decides whether the deferred confirming round ever runs, and a
 * decision like that cannot rest on a number that has to be recomputed from scratch by whoever asks
 * — so the tallies accumulate here, into one JSON file that can be read without running anything.
 *
 * ## Why this is a file and not a database, and why it holds per-subject rows
 *
 * The cheapest honest mechanism, in that order of priority. It is append-oriented JSON on the same
 * pattern as every other artifact in `data/`, it has no dependencies, and it is diffable — which
 * matters more than it sounds, because the question this file answers is "has the disagreement rate
 * moved?" and a diff answers that directly.
 *
 * Per-subject rows are kept rather than only running totals for one reason, learned expensively
 * elsewhere in this repository: **a pooled rate hides a stratum-dependent one.** perception-4's
 * accent quantity refused adoption twice precisely because a pooled threshold averaged over hue
 * thirds that did not agree, and the same failure is available here — a 5% global disagreement rate
 * made of 0% on most covers and 60% on a few is a completely different finding from 5% everywhere,
 * and only the second one is evidence that the frozen bar is fine. `queryLedger` exists to ask that
 * question.
 *
 * ## What this file is not
 *
 * It is **not evidence for adopting anything.** A disagreement is two rules parting company; it is
 * not a reviewer saying either one is right. Both challenger bars were measured in `dark-neutral`
 * alone and are applied everywhere, so most of what accumulates here is extrapolation by
 * construction. The counter's honest use is to price a round: a high rate says the shape question
 * reaches real palettes often enough to be worth 30 rungs per ladder in two regions, and a low one
 * says the frozen scalar is doing no harm where it actually gets used and the round can stay
 * deferred. Neither reading moves a constant without the reviewer.
 */

import { readFile, writeFile } from "node:fs/promises"

import { CHALLENGER_NOTE, mergeTallies, type ChallengerId, type ChallengerTally } from "./challengers.ts"
import type { ColorRegion } from "./types.ts"

/** The default location, repo-relative. */
export const CHALLENGER_LEDGER_REF = "research/v3/data/contract/challenger-disagreements.json"

/** One accumulated subject — a palette, a cover, a corpus run, whatever the caller names. */
export type ChallengerLedgerEntry = Readonly<{
	/** Caller-chosen stable name. A palette id, an artwork path, a round id. */
	subject: string
	/** When this row was last written. */
	observedAt: string
	/** Optional free label — which run or instrument produced it. */
	source?: string
	tallies: readonly ChallengerTally[]
}>

export type ChallengerLedgerFile = Readonly<{
	what: string
	note: string
	updatedAt: string
	/** Running totals across every entry, per challenger. */
	totals: readonly ChallengerTally[]
	entries: readonly ChallengerLedgerEntry[]
}>

const WHAT =
	"Accumulated disagreements between the frozen OKLab same-colour bar and its two report-only " +
	"challengers (src/contract/challengers.ts). PROVISIONAL - perception-4, reviewer-signed " +
	"2026-08-04. Nothing here has ever affected a validation verdict. This counter is the instrument " +
	"the reviewer's sign-off makes decisive for whether the deferred confirming round runs; it is not " +
	"itself evidence that any bar should change."

export function emptyLedger(): ChallengerLedgerFile {
	return { what: WHAT, note: CHALLENGER_NOTE, updatedAt: "", totals: [], entries: [] }
}

/**
 * Add or replace one subject's tallies and re-derive the totals.
 *
 * **Replace, not add, for a repeated subject.** Re-scoring the same palette twice is the normal way
 * this gets called — a dev loop runs, then runs again — and summing those would inflate the counter
 * with duplicate observations of one pair. Totals are re-derived from the entry list every time
 * rather than incremented, so the file cannot drift from its own rows.
 */
export function accumulate(
	ledger: ChallengerLedgerFile,
	entry: Omit<ChallengerLedgerEntry, "observedAt"> & { observedAt?: string },
): ChallengerLedgerFile {
	const observedAt = entry.observedAt ?? new Date().toISOString()
	const next: ChallengerLedgerEntry = {
		subject: entry.subject,
		observedAt,
		...(entry.source === undefined ? {} : { source: entry.source }),
		tallies: entry.tallies,
	}
	const entries = [...ledger.entries.filter((row) => row.subject !== entry.subject), next]
		.sort((a, b) => a.subject.localeCompare(b.subject))

	return {
		what: WHAT,
		note: CHALLENGER_NOTE,
		updatedAt: observedAt,
		totals: entries.reduce<readonly ChallengerTally[]>((sum, row) => mergeTallies(sum, row.tallies), []),
		entries,
	}
}

export async function loadLedger(path: string): Promise<ChallengerLedgerFile> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as ChallengerLedgerFile
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger()
		throw error
	}
}

export async function saveLedger(path: string, ledger: ChallengerLedgerFile): Promise<void> {
	await writeFile(path, `${JSON.stringify(ledger, null, "\t")}\n`, "utf8")
}

export type ChallengerQuery = Readonly<{
	challenger?: ChallengerId
	/** Restrict the disagreement count to one region — `dark-neutral` is the only measured one. */
	region?: ColorRegion
	/** Only subjects whose disagreement rate is at least this. Use to find the stratum, not the mean. */
	minRate?: number
}>

export type ChallengerQueryRow = Readonly<{
	subject: string
	challenger: ChallengerId
	judged: number
	disagreed: number
	/** `disagreed / judged`, or `null` when nothing was judged — never silently 0. */
	rate: number | null
	challengerSaysSameIncumbentDistinct: number
	incumbentSaysSameChallengerDistinct: number
}>

/**
 * Ask the file a question. Rows come back sorted by rate, highest first, so the stratum that
 * disagrees shows up before the average that hides it.
 *
 * `rate` is `null` rather than `0` when nothing was judged, because "these rules never disagreed" and
 * "there was nothing to disagree about" are the two readings this counter must never conflate —
 * a palette whose distinctness matrix judged no pairs would otherwise read as perfect agreement.
 */
export function queryLedger(
	ledger: ChallengerLedgerFile,
	query: ChallengerQuery = {},
): readonly ChallengerQueryRow[] {
	const rows: ChallengerQueryRow[] = []
	for (const entry of ledger.entries) {
		for (const tally of entry.tallies) {
			if (query.challenger !== undefined && tally.challenger !== query.challenger) continue
			const disagreed = query.region === undefined
				? tally.disagreed
				: (tally.disagreedByRegion[query.region] ?? 0)
			const rate = tally.judged === 0 ? null : disagreed / tally.judged
			if (query.minRate !== undefined && (rate === null || rate < query.minRate)) continue
			rows.push({
				subject: entry.subject,
				challenger: tally.challenger,
				judged: tally.judged,
				disagreed,
				rate,
				challengerSaysSameIncumbentDistinct: tally.challengerSaysSameIncumbentDistinct,
				incumbentSaysSameChallengerDistinct: tally.incumbentSaysSameChallengerDistinct,
			})
		}
	}
	return rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.subject.localeCompare(b.subject))
}

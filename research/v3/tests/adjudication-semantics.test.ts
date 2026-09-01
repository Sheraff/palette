/**
 * The adjudication consumer's semantics, against a hand-built synthetic corpus.
 *
 * The fixture under `adjudication-fixtures/legacy/` is deliberately small and deliberately
 * contradictory: one file with three different endorsed palettes (the many-valid case), one file
 * where an endorsement sits one LSB from a known-bad (the conflict case), a tier overlap, an
 * acceptable-tier entry graded `strong`, a grade history that disagrees with itself, and a
 * single-role partial correction. Every principle the tool claims to encode is asserted here against
 * one of those.
 */

import assert from "node:assert/strict"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { adjudicateCandidate, adjudicateRun, readCandidateRun } from "../src/adjudication/adjudicate.ts"
import { loadEvidence } from "../src/adjudication/evidence.ts"
import { assessReachability, DEFAULT_MATCH_OPTIONS, matchPalette } from "../src/adjudication/match.ts"
import type { AdjudicationReport, CandidateVerdict, MatchOptions } from "../src/adjudication/types.ts"
import { colorFromHex } from "../src/contract/index.ts"

const FIXTURES = fileURLToPath(new URL("./adjudication-fixtures", import.meta.url))
const LEGACY_DIR = resolve(FIXTURES, "legacy")
/** A path that does not exist: the loader treats an absent warehouse as an empty v3 era. */
const NO_WAREHOUSE = resolve(FIXTURES, "no-such-warehouse.jsonl")

function corpus(asOf: string | null = "2026-08-04T00:00:00.000Z") {
	return loadEvidence({ legacyDir: LEGACY_DIR, warehouseFile: NO_WAREHOUSE, asOf })
}

function report(options: Partial<{ match: MatchOptions }> = {}): AdjudicationReport {
	const run = readCandidateRun(resolve(FIXTURES, "candidates.jsonl"))
	return adjudicateRun(run, corpus(), {
		match: options.match ?? DEFAULT_MATCH_OPTIONS,
		asOf: "2026-08-04T00:00:00.000Z",
	})
}

function byLine(built: AdjudicationReport, line: number): CandidateVerdict {
	const verdict = built.perCandidate.find((candidate) => candidate.line === line)
	assert.ok(verdict, `no candidate on line ${line}`)
	return verdict
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

test("evidence loads each tier separately and never concatenates them", () => {
	const loaded = corpus()
	const counts = new Map(loaded.sources.map((source) => [`${source.era}/${source.tier}`, source.entryCount]))
	assert.equal(counts.get("v2-3/endorsement"), 7)
	assert.equal(counts.get("v2-3/known-bad"), 2)
	assert.equal(counts.get("v2-3/acceptable"), 2)
	assert.equal(loaded.entries.length, 11)
	// artwork b carries e4, e5, k1 and ac1 — four entries on one file.
	assert.equal(loaded.byArtwork.get("b".repeat(64))?.length, 4)
})

test("every entry enters as a dated prior with an era and an age", () => {
	const loaded = corpus()
	for (const entry of loaded.entries) {
		assert.equal(entry.provenance.era, "v2-3")
		assert.equal(entry.provenance.contract, "v2-3")
		assert.ok(entry.provenance.recordedAt, `${entry.entryId} has no date`)
		assert.ok(typeof entry.provenance.ageDays === "number" && entry.provenance.ageDays > 0)
	}
})

test("ages are not invented when no --as-of was given", () => {
	const loaded = loadEvidence({ legacyDir: LEGACY_DIR, warehouseFile: NO_WAREHOUSE, asOf: null })
	for (const entry of loaded.entries) assert.equal(entry.provenance.ageDays, null)
})

// ---------------------------------------------------------------------------------------------
// Principle 1 — many valid palettes
// ---------------------------------------------------------------------------------------------

test("principle 1: matching an endorsement is a win", () => {
	const verdict = byLine(report(), 1)
	assert.equal(verdict.outcome, "endorsement-match")
	assert.deepEqual(verdict.signals, { win: true, loss: false, baseline: false })
	assert.equal(verdict.endorsementMatches.length, 1)
	assert.equal(verdict.endorsementMatches[0]!.entryId, "e1")
	assert.equal(verdict.endorsementMatches[0]!.signal, "win")
	assert.equal(verdict.endorsementMatches[0]!.match.basis, "all-four-roles")
})

test("principle 1: differing from every endorsement is NO SIGNAL, not a miss", () => {
	const verdict = byLine(report(), 3)
	assert.equal(verdict.outcome, "differs")
	assert.deepEqual(verdict.signals, { win: false, loss: false, baseline: false })
	// artwork a has three endorsements; the candidate matched none of them.
	assert.equal(verdict.unmatchedCount, 3)
	for (const entry of verdict.unmatched) assert.equal(entry.signal, "no-signal")
	// and the near-miss telemetry is present without being a cost
	for (const entry of verdict.unmatched) assert.ok((entry.match.worstRoleBarRatio ?? 0) > 1)
})

test("principle 1: the many-valid case — three endorsements coexist, each reachable as a win", () => {
	const built = report()
	assert.equal(byLine(built, 1).endorsementMatches[0]!.entryId, "e1")
	assert.equal(byLine(built, 2).endorsementMatches[0]!.entryId, "e2")
	assert.equal(byLine(built, 9).endorsementMatches[0]!.entryId, "e3")
	// Three different palettes, three wins, on one file. Nothing calls any of them the right one.
	const tally = built.aggregate.byEra.find((row) => row.era === "v2-3")!
	assert.equal(tally.wins.distinctArtworks < tally.wins.distinctEntries, true)
})

test("principle 1: no score, penalty or rate anywhere in the report", () => {
	const serialized = JSON.stringify(report())
	for (const forbidden of ["score", "penalty", "accuracy", "Rate", "reward", "loss:"]) {
		assert.equal(serialized.includes(`"${forbidden}"`), false, `report carries a "${forbidden}" field`)
	}
})

// ---------------------------------------------------------------------------------------------
// Match semantics
// ---------------------------------------------------------------------------------------------

test("matching is within the calibrated bar, never exact hex", () => {
	const withinBar = byLine(report(), 2)
	assert.equal(withinBar.outcome, "endorsement-match")
	const comparison = withinBar.endorsementMatches[0]!.match.comparisons[0]!
	assert.ok(comparison.candidate !== comparison.evidence, "the fixture must not be an exact-hex match")
	assert.ok(comparison.distance! < comparison.bar!)

	const exact = report({ match: { ...DEFAULT_MATCH_OPTIONS, barMode: "exact-hex" } })
	assert.equal(byLine(exact, 2).outcome, "differs", "exact-hex must refuse what the bar accepts")
	assert.equal(byLine(exact, 1).outcome, "endorsement-match", "exact-hex still matches an exact reproduction")
})

test("the pooled bar is selectable and is labelled as not the gate's bar", () => {
	const pooled = report({ match: { ...DEFAULT_MATCH_OPTIONS, barMode: "pooled" } })
	assert.equal(pooled.options.barMode, "pooled")
	for (const match of byLine(pooled, 1).endorsementMatches) {
		for (const comparison of match.match.comparisons) assert.equal(comparison.bar, 0.01535)
	}
})

test("a partial entry is compared on its present roles only, and says so", () => {
	const verdict = byLine(report(), 6)
	assert.equal(verdict.outcome, "endorsement-match")
	const match = verdict.endorsementMatches[0]!.match
	assert.equal(match.basis, "present-roles-only")
	assert.deepEqual([...match.rolesCompared], ["accent"])
	assert.deepEqual([...match.rolesSkipped], ["background", "surface", "foreground"])

	const tally = report().aggregate.byEra.find((row) => row.era === "v2-3")!
	assert.equal(tally.wins.partialBasis, 1)
	assert.ok(tally.wins.fullBasis >= 4)
})

test("--partial-entries skip leaves the file with no comparable evidence, not a 'differs'", () => {
	const skipped = report({ match: { ...DEFAULT_MATCH_OPTIONS, partialEntries: "skip" } })
	const verdict = byLine(skipped, 6)
	assert.equal(verdict.outcome, "unseen")
	assert.equal(verdict.unmatchedCount, 0)
})

test("a missing role in the entry is never treated as a constraint", () => {
	const loaded = corpus()
	const partial = loaded.entries.find((entry) => entry.entryId === "e6")!
	const match = matchPalette(
		{
			background: colorFromHex("#000000"),
			surface: colorFromHex("#111111"),
			foreground: colorFromHex("#ffffff"),
			accent: colorFromHex("#12ab34"),
		},
		partial,
	)!
	assert.equal(match.matched, true)
})

// ---------------------------------------------------------------------------------------------
// Principle 2 — the reviewer can contradict himself
// ---------------------------------------------------------------------------------------------

test("principle 2: one candidate within the bar of both an endorsement and a known-bad", () => {
	const verdict = byLine(report(), 4)
	assert.equal(verdict.outcome, "known-bad-match", "the stated precedence puts the loss first")
	assert.equal(verdict.signals.loss, true)
	assert.equal(verdict.signals.win, true, "the win is not erased by the loss")
	const conflict = verdict.conflicts.find((row) => row.kind === "candidate-matches-both-tiers")
	assert.ok(conflict, "the contradiction must be raised, not resolved")
	assert.deepEqual([...conflict.entryIds].sort(), ["e4", "k1"])
	assert.equal(conflict.resolved, false)
	assert.ok(conflict.histories.length >= 2)
})

test("principle 2: a self-disagreeing grade history is surfaced with the history attached", () => {
	const verdict = byLine(report(), 7)
	assert.equal(verdict.outcome, "endorsement-match")
	const conflict = verdict.conflicts.find((row) => row.kind === "grade-history-conflict")
	assert.ok(conflict)
	assert.deepEqual([...conflict.entryIds], ["e7"])
	assert.match(conflict.standingResolution ?? "", /^strong \(latest/)
	assert.equal(conflict.resolved, true, "recency settles standing")
	assert.deepEqual(conflict.histories[0]!.distinctGrades, ["acceptable", "strong"])
	assert.equal(conflict.histories[0]!.history.length, 2, "both grades survive, not just the winner")
})

test("principle 2: corpus-intrinsic contradictions are found at load time", () => {
	const loaded = corpus()
	const kinds = loaded.corpusConflicts.map((conflict) => conflict.kind).sort()
	assert.deepEqual(kinds, ["strong-graded-acceptable", "tier-overlap"])
	const overlap = loaded.corpusConflicts.find((conflict) => conflict.kind === "tier-overlap")!
	assert.deepEqual([...overlap.entryIds].sort(), ["ac1", "e5"])
})

test("principle 2: a matched acceptable entry graded `strong` raises its tier disagreement", () => {
	const verdict = byLine(report(), 10)
	assert.equal(verdict.outcome, "acceptable-match")
	assert.deepEqual(verdict.signals, { win: false, loss: false, baseline: true })
	assert.ok(verdict.conflicts.some((conflict) => conflict.kind === "strong-graded-acceptable"))
})

test("principle 2: conflicts are counted and listed, never expressed as a rate", () => {
	const aggregate = report().aggregate.conflicts
	assert.equal(aggregate.total, aggregate.items.length)
	assert.equal(
		aggregate.byKind.reduce((sum, row) => sum + row.count, 0),
		aggregate.total,
	)
	assert.equal(Object.keys(aggregate).sort().join(","), "byKind,items,total")
	for (const item of aggregate.items) assert.ok(item.detail.length > 0 && item.entryIds.length > 0)
})

// ---------------------------------------------------------------------------------------------
// Principle 3 — dated priors, split by era, gating nothing
// ---------------------------------------------------------------------------------------------

test("principle 3: the report states that it gates nothing, and carries the rulings", () => {
	const built = report()
	assert.equal(built.gating, "none")
	assert.equal(built.principles.length, 3)
	assert.match(built.principles[0]!, /many valid palettes/)
	assert.match(built.principles[1]!, /contradict/)
	assert.match(built.principles[2]!, /DATED PRIOR/)
})

test("principle 3: outcomes are reported per era, and an empty era stays empty", () => {
	const built = report()
	const eras = built.aggregate.byEra.map((row) => row.era)
	assert.deepEqual(eras, ["v2-3", "v3"])
	const current = built.aggregate.byEra.find((row) => row.era === "v3")!
	assert.equal(current.wins.candidates, 0)
	assert.equal(current.losses.candidates, 0)
	assert.equal(current.candidatesWithEvidence, 0)
	assert.equal(current.noSignal.unseen, built.perCandidate.length)
	// Every per-candidate verdict splits its outcome the same way.
	for (const verdict of built.perCandidate) {
		assert.equal(verdict.byEra.find((row) => row.era === "v3")!.outcome, "unseen")
	}
})

test("principle 3: --era selects which regime is consulted", () => {
	const run = readCandidateRun(resolve(FIXTURES, "candidates.jsonl"))
	const onlyCurrent = adjudicateRun(
		run,
		loadEvidence({ legacyDir: LEGACY_DIR, warehouseFile: NO_WAREHOUSE, eras: ["v3"], asOf: null }),
		{ eras: ["v3"] },
	)
	assert.equal(onlyCurrent.evidence.every((source) => source.era === "v3"), true)
	for (const verdict of onlyCurrent.perCandidate) assert.equal(verdict.outcome, "unseen")
})

// ---------------------------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------------------------

test("reachability: an entry inside the candidate's colour set is reachable", () => {
	const verdict = byLine(report(), 9)
	const e3 = verdict.endorsementMatches.find((entry) => entry.entryId === "e3")!
	assert.equal(e3.reachability.status, "reachable")
	for (const role of e3.reachability.perRole) assert.equal(role.within, true)
})

test("reachability: an endorsement outside the colour set is unreachable, and that is not a penalty", () => {
	const built = report()
	const verdict = byLine(built, 9)
	const unreachable = verdict.unmatched.filter((entry) => entry.reachability.status === "unreachable")
	assert.ok(unreachable.length > 0)
	for (const entry of unreachable) assert.equal(entry.signal, "no-signal")
	assert.ok(built.aggregate.reachability.unreachableEndorsements.length > 0)
})

test("reachability: without a colour set the answer is not-assessed, never a pass", () => {
	const verdict = byLine(report(), 1)
	assert.equal(verdict.endorsementMatches[0]!.reachability.status, "not-assessed")
	assert.ok(report().aggregate.reachability.notAssessed > 0)
})

test("reachability: only the roles the entry carries are assessed", () => {
	const loaded = corpus()
	const partial = loaded.entries.find((entry) => entry.entryId === "e6")!
	const verdict = assessReachability(partial, [colorFromHex("#12ab34"), colorFromHex("#000000")])
	assert.equal(verdict.status, "reachable")
	assert.equal(verdict.perRole.length, 1)
	assert.deepEqual([...verdict.rolesSkipped], ["background", "surface", "foreground"])
})

// ---------------------------------------------------------------------------------------------
// Unseen, parsing, determinism
// ---------------------------------------------------------------------------------------------

test("a file with no evidence is `unseen`, which is distinct from `differs`", () => {
	const verdict = byLine(report(), 8)
	assert.equal(verdict.outcome, "unseen")
	assert.equal(verdict.unmatchedCount, 0)
	assert.deepEqual(verdict.signals, { win: false, loss: false, baseline: false })
})

test("bad candidate lines are reported, never silently dropped", () => {
	const run = readCandidateRun(resolve(FIXTURES, "candidates-malformed.jsonl"))
	assert.equal(run.candidates.length, 1)
	assert.equal(run.parseErrors.length, 4)
	assert.deepEqual(run.parseErrors.map((error) => error.line), [2, 3, 4, 5])
	assert.match(run.parseErrors[0]!.reason, /not valid JSON/)
	assert.match(run.parseErrors[1]!.reason, /inputContentHash/)
	assert.match(run.parseErrors[2]!.reason, /accent/)
	assert.match(run.parseErrors[3]!.reason, /inputContentHash/)
})

test("the full contract is recorded when present, and not required when absent", () => {
	const built = report()
	assert.equal(built.input.records, 10)
	assert.equal(built.input.contractComplete, 1)
	assert.equal(byLine(built, 1).contractComplete, true)
	assert.equal(byLine(built, 2).contractComplete, false)
})

test("output is deterministic", () => {
	const first = JSON.stringify(report())
	const second = JSON.stringify(report())
	assert.equal(first, second)
	// and ordering does not depend on input order
	const run = readCandidateRun(resolve(FIXTURES, "candidates.jsonl"))
	const reversed = { ...run, candidates: [...run.candidates].reverse() }
	const shuffled = adjudicateRun(reversed, corpus(), { asOf: "2026-08-04T00:00:00.000Z" })
	assert.equal(JSON.stringify(shuffled.perCandidate), JSON.stringify(report().perCandidate))
})

test("a single candidate can be adjudicated on its own", () => {
	const run = readCandidateRun(resolve(FIXTURES, "candidates.jsonl"))
	const verdict = adjudicateCandidate(run.candidates[0]!, corpus(), {})
	assert.equal(verdict.outcome, "endorsement-match")
})

/**
 * # The election — arm-c′ §2.3c's "the winner stands if it wins a majority", as ruled.
 *
 * M3 §3.1 recorded, without resolving it, that separation from ½ is **two-sided**: on two covers of
 * coverage-set-1 the cheapest bit-total named one member while the block bootstrap's Wilson interval
 * cleared ½ on that member's *losing* side. The orchestrator's ruling: **the elected member is the
 * bootstrap-majority member, including where that contradicts the point bit-total** — the point total
 * is the estimate, the resampled evidence is the measurement.
 *
 * This file is the regression, and it is built from those two covers' own recorded data rather than
 * from a synthetic fixture, because the case is rare (2 of 220) and a synthetic one would drift away
 * from the shape that actually occurs:
 *
 *  - `8cd4b23804` — cheapest total `p2-tree`, runner-up `p3-fields`, margin **867.1 bits**, win
 *    fraction 0.125 on **8** resamples, interval [0.022, 0.471].
 *  - `118deaee18` — cheapest total `p5-fieldfit`, runner-up `p2-tree`, margin **971.5 bits**, win
 *    fraction 0.214 on **14** resamples, interval [0.076, 0.476].
 *
 * Both are checked twice: through `electFromBootstrap` on the recorded report (the unit), and through
 * `selectOnCover` on the real image with the members' real palettes (the whole path, including that
 * the fix moved **only** the election — every bit in those rows must come back identical).
 *
 * The remaining tests hold the three things that must NOT have moved: upward separation still elects
 * the cheapest total, a capped bootstrap still elects the cheapest total, and **the tie-break path is
 * untouched** — an exact tie ties every resample, never separates, and so falls through to §2.3d's
 * own answer.
 *
 * Run:
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p4-portfolio/tests/election.test.ts
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"

import type { Palette } from "../../../src/contract/types.ts"
import { LATTICE_RESOLUTION_C, blockBootstrap, decodeImage, electFromBootstrap, selectOnCover } from "../selector/index.ts"
import type { BootstrapReport, MemberPalette } from "../selector/types.ts"

const PROTOTYPE = resolve(dirname(new URL(import.meta.url).pathname), "..")

const MEMBER_RUNS: readonly { slug: string; runPaths: readonly string[] }[] = [
	{
		slug: "p2-tree",
		runPaths: ["data/m3/runs/p2-tree-coverage1.jsonl", "data/m3/runs/p2-tree-coverage1-resume-1.jsonl"],
	},
	{ slug: "p3-fields", runPaths: ["data/m3/runs/p3-fields-coverage1.jsonl"] },
	{ slug: "p5-fieldfit", runPaths: ["data/m3/runs/p5-fieldfit-coverage1.jsonl"] },
]

type TableRow = {
	contentHash: string
	imagePath: string
	winner: string | null
	runnerUp: string | null
	marginBits: number | null
	elected: string | null
	electedBy: string | null
	electionContradictsCheapestTotal: boolean
	bootstrap: BootstrapReport | null
	members: { slug: string; schemaBits: number; residualBits: number; totalBits: number }[]
	tieBrokenBySchemaPrice: boolean
}

const table = JSON.parse(
	readFileSync(resolve(PROTOTYPE, "data/m3/bit-table-coverage.json"), "utf8"),
) as { rows: TableRow[]; election?: { contradictoryCovers: number } }

const rowFor = (prefix: string): TableRow => {
	const row = table.rows.find((candidate) => candidate.contentHash.startsWith(prefix))
	assert.ok(row !== undefined, `the bit table no longer carries ${prefix}`)
	return row
}

/** The member palettes the M3 run files published on one cover, joined on the content hash. */
function membersOn(contentHash: string): MemberPalette[] {
	const members: MemberPalette[] = []
	for (const member of MEMBER_RUNS) {
		for (const runPath of member.runPaths) {
			const text = readFileSync(resolve(PROTOTYPE, runPath), "utf8")
			const line = text.split("\n").find((entry) => entry.includes(contentHash) && entry.includes("devloop-run-row"))
			if (line === undefined) continue
			const parsed = JSON.parse(line) as { inputContentHash: string; ok: boolean; palette: Palette | null }
			if (parsed.inputContentHash !== contentHash || !parsed.ok || parsed.palette === null) continue
			members.push({ slug: member.slug, palette: parsed.palette })
			break
		}
	}
	return members
}

const FLAGGED = ["8cd4b23804", "118deaee18"] as const

// ---------------------------------------------------------------------------------------------
// The unit: the recorded reports elect the runner-up
// ---------------------------------------------------------------------------------------------

for (const prefix of FLAGGED) {
	test(`election: ${prefix}'s recorded bootstrap elects the runner-up, not the cheapest total`, () => {
		const row = rowFor(prefix)
		assert.ok(row.bootstrap !== null)
		assert.equal(row.bootstrap.separatedFromHalf, true, "the recorded run did separate from ½")
		assert.ok(row.bootstrap.winFraction < 1 / 2, "and it separated on the cheapest total's losing side")
		assert.ok(row.bootstrap.intervalHigh < 1 / 2, "the interval itself clears ½ from below")

		const election = electFromBootstrap(row.winner!, row.runnerUp, row.bootstrap)
		assert.equal(election.elected, row.runnerUp, "the measured majority is what gets published")
		assert.equal(election.electedBy, "bootstrap-majority")
		assert.equal(election.contradictsCheapestTotal, true)
	})
}

test("election: the two flagged covers are exactly the recorded ones, with their recorded evidence", () => {
	const first = rowFor("8cd4b23804")
	assert.equal(first.winner, "p2-tree")
	assert.equal(first.runnerUp, "p3-fields")
	assert.equal(first.bootstrap!.resamples, 8)
	assert.equal(Math.round(first.marginBits!), 867)
	assert.equal(first.elected, "p3-fields")

	const second = rowFor("118deaee18")
	assert.equal(second.winner, "p5-fieldfit")
	assert.equal(second.runnerUp, "p2-tree")
	assert.equal(second.bootstrap!.resamples, 14)
	assert.equal(Math.round(second.marginBits!), 972)
	assert.equal(second.elected, "p2-tree")
})

// ---------------------------------------------------------------------------------------------
// The whole path: the fix moved the election and nothing else
// ---------------------------------------------------------------------------------------------

for (const prefix of FLAGGED) {
	test(`election: ${prefix} re-prices to the same bits and elects the bootstrap majority`, async () => {
		const row = rowFor(prefix)
		const members = membersOn(row.contentHash)
		assert.equal(members.length, row.members.length, "the run files still publish the same members here")

		const image = await decodeImage(row.imagePath)
		const { selection } = selectOnCover(image, members, LATTICE_RESOLUTION_C)

		// Every bit identical: the ruling changed who is published, not what anything costs.
		assert.equal(selection.winner, row.winner)
		assert.equal(selection.runnerUp, row.runnerUp)
		assert.equal(selection.marginBits, row.marginBits)
		for (const recorded of row.members) {
			const priced = selection.prices.find((price) => price.slug === recorded.slug)!
			assert.equal(priced.totalBits, recorded.totalBits, `${recorded.slug} total moved`)
			assert.equal(priced.schema.bits, recorded.schemaBits, `${recorded.slug} L(palette) moved`)
			assert.equal(priced.residualBits, recorded.residualBits, `${recorded.slug} residual moved`)
		}
		assert.deepEqual(selection.bootstrap, row.bootstrap, "the resampling is unchanged and still deterministic")

		assert.equal(selection.elected, row.runnerUp)
		assert.equal(selection.electedBy, "bootstrap-majority")
		assert.equal(selection.electionContradictsCheapestTotal, true)
		assert.notEqual(selection.elected, selection.winner)
	})
}

// ---------------------------------------------------------------------------------------------
// What must not have moved
// ---------------------------------------------------------------------------------------------

test("election: upward separation elects the cheapest total, as it always did", () => {
	const row = table.rows.find(
		(candidate) => candidate.bootstrap?.separatedFromHalf === true && candidate.bootstrap.winFraction === 1,
	)!
	const election = electFromBootstrap(row.winner!, row.runnerUp, row.bootstrap)
	assert.equal(election.elected, row.winner)
	assert.equal(election.electedBy, "bootstrap-majority")
	assert.equal(election.contradictsCheapestTotal, false)
})

test("election: a bootstrap that never separated cannot overturn anything", () => {
	const capped: BootstrapReport = {
		blockSide: 3,
		correlationLengthCells: 3,
		draws: 4096,
		resamples: 4096,
		ties: 0,
		wins: 2000,
		winFraction: 2000 / 4096,
		intervalLow: 0.47,
		intervalHigh: 0.51,
		separatedFromHalf: false,
		capped: true,
	}
	const election = electFromBootstrap("p2-tree", "p3-fields", capped)
	assert.equal(election.elected, "p2-tree")
	assert.equal(election.electedBy, "cheapest-total")
	assert.equal(election.contradictsCheapestTotal, false)
})

test("election: no bootstrap at all — an immaterial cover — elects the cheapest total", () => {
	const election = electFromBootstrap("p2-tree", "p3-fields", null)
	assert.equal(election.elected, "p2-tree")
	assert.equal(election.electedBy, "cheapest-total")
})

test("election: the tie-break path is untouched — an exact tie never separates", () => {
	// §2.3d decides only where the totals are exactly equal, and then the per-cell difference is
	// identically zero: every draw ties, `separatedFromHalf` is false, and the election falls through
	// to the cheapest total — which on such a cover IS the tie-break's answer. Driven through the real
	// `blockBootstrap` rather than a hand-written report, so it is the actual path that is checked.
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const report = blockBootstrap(new Float64Array(cells), 0, LATTICE_RESOLUTION_C, "a".repeat(64))
	assert.equal(report.separatedFromHalf, false)
	assert.equal(report.winFraction, 1 / 2)
	const election = electFromBootstrap("p2-tree", "p3-fields", report)
	assert.equal(election.elected, "p2-tree", "the tie-break's winner still stands")
	assert.equal(election.electedBy, "cheapest-total")
	assert.equal(election.contradictsCheapestTotal, false)
})

// ---------------------------------------------------------------------------------------------
// The published table obeys the rule, corpus-wide
// ---------------------------------------------------------------------------------------------

test("election: every published row's election is the rule's own output", () => {
	let contradictions = 0
	for (const row of table.rows) {
		if (row.winner === null) {
			assert.equal(row.elected, null, `${row.contentHash} is unpriced but carries an election`)
			continue
		}
		const expected = electFromBootstrap(row.winner, row.runnerUp, row.bootstrap)
		assert.equal(row.elected, expected.elected, `${row.contentHash} elects the wrong member`)
		assert.equal(row.electedBy, expected.electedBy, `${row.contentHash} attributes the election wrongly`)
		assert.equal(row.electionContradictsCheapestTotal, expected.contradictsCheapestTotal)
		if (expected.contradictsCheapestTotal) contradictions += 1
		assert.ok(
			row.elected === row.winner || row.elected === row.runnerUp,
			`${row.contentHash} elected a member that is neither the winner nor the runner-up`,
		)
	}
	assert.equal(contradictions, 2, "the corpus still holds exactly the two covers M3 §3.1 flagged")
	assert.equal(table.election?.contradictoryCovers, 2, "and the table's own summary agrees")
})

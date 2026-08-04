/**
 * The diff: what the metric measures, and the order it puts covers in.
 *
 * Ordering is the whole product here. A diff that lists 200 covers in set order is a diff nobody
 * reads past the first screen, and the cover your change broke is the one you did not scroll to. So
 * these tests are mostly about *rank*: the biggest role-colour movement first, everything that
 * changed above everything that did not, an image that started failing above all of it, and a stable
 * tie-break so the same two runs diffed twice list the same way.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { colorDistance } from "../src/contract/color.ts"
import { makePalette } from "../src/contract/fixtures.ts"
import type { Palette } from "../src/contract/types.ts"
import { changeRank, diffRuns, roleDistances } from "../src/devloop/diff.ts"
import type { RunFile, RunHeader, RunRow } from "../src/devloop/types.ts"

const HEADER: RunHeader = {
	kind: "devloop-run-header",
	runId: "run-before",
	candidateId: "fixture",
	candidatePath: "/fixture/candidate.ts",
	codeVersion: "0".repeat(64),
	setPath: "/fixture/set.txt",
	setName: "set",
	setHash: "1".repeat(64),
	imageCount: 0,
	startedAt: "2026-08-04T00:00:00.000Z",
	packageVersions: {},
	nodeVersion: "v25.0.0",
	workerCount: 1,
}

function row(index: number, imagePath: string, palette: Palette | null, error: string | null = null): RunRow {
	return {
		kind: "devloop-run-row",
		index,
		imagePath,
		inputContentHash: "a".repeat(64),
		ok: palette !== null,
		palette,
		error,
		cached: false,
		computeMs: 1,
	}
}

function runFile(runId: string, rows: RunRow[], setHash = HEADER.setHash): RunFile {
	return {
		header: { ...HEADER, runId, setHash, imageCount: rows.length },
		rows,
		footer: null,
		path: `/fixture/${runId}.jsonl`,
	}
}

/** A palette whose background is `hex` and whose other roles are fixed and distinct. */
const withBackground = (hex: string): Palette =>
	makePalette({ background: hex, surface: "#1e2a38", foreground: "#f2f4f6", accent: "#d08a3c" })

const withAccent = (hex: string): Palette =>
	makePalette({ background: "#101820", surface: "#1e2a38", foreground: "#f2f4f6", accent: hex })

describe("the metric", () => {
	it("is the largest OKLab distance between corresponding role colours", () => {
		const before = makePalette({ background: "#101820", surface: "#1e2a38", foreground: "#f2f4f6", accent: "#d08a3c" })
		const after = makePalette({ background: "#101820", surface: "#1e2a38", foreground: "#f2f4f6", accent: "#3c8ad0" })
		const distances = roleDistances(before, after)
		assert.equal(distances.worst, "accent")
		assert.equal(distances.max, colorDistance(before.roles.accent, after.roles.accent))
		// Three of four roles are identical, so the mean is a quarter of the max — which is exactly why
		// the ordering is on the max. Averaging is how a change that ruins one role disappears.
		assert.ok(Math.abs(distances.mean - distances.max / 4) < 1e-12)
	})

	it("is zero when nothing moved", () => {
		const palette = withBackground("#101820")
		assert.equal(roleDistances(palette, palette).max, 0)
	})
})

describe("ordering", () => {
	it("puts the biggest role-colour change first", () => {
		const paths = ["/c/small.jpg", "/c/big.jpg", "/c/middle.jpg"]
		const before = runFile("run-before", [
			row(0, paths[0], withBackground("#101820")),
			row(1, paths[1], withBackground("#101820")),
			row(2, paths[2], withBackground("#101820")),
		])
		const after = runFile("run-after", [
			row(0, paths[0], withBackground("#111921")),
			row(1, paths[1], withBackground("#f0f0f0")),
			row(2, paths[2], withBackground("#606060")),
		])
		const diff = diffRuns(before, after)
		assert.deepEqual(diff.entries.map((entry) => entry.imagePath), ["/c/big.jpg", "/c/middle.jpg", "/c/small.jpg"])
		const magnitudes = diff.entries.map((entry) => entry.maxRolePairDistance as number)
		assert.ok(magnitudes[0] > magnitudes[1] && magnitudes[1] > magnitudes[2], "the list is not descending")
		assert.equal(diff.changedCount, 3)
		assert.equal(diff.unchangedCount, 0)
	})

	it("breaks ties on the image path, so two diffs of the same runs list the same way", () => {
		// Identical magnitudes on purpose: without a tie-break, order would come from Map iteration and
		// the same comparison would render differently on different days.
		const before = runFile("run-before", [
			row(0, "/c/zebra.jpg", withBackground("#101820")),
			row(1, "/c/apple.jpg", withBackground("#101820")),
			row(2, "/c/mango.jpg", withBackground("#101820")),
		])
		const after = runFile("run-after", [
			row(0, "/c/zebra.jpg", withBackground("#303030")),
			row(1, "/c/apple.jpg", withBackground("#303030")),
			row(2, "/c/mango.jpg", withBackground("#303030")),
		])
		const once = diffRuns(before, after).entries.map((entry) => entry.imagePath)
		const twice = diffRuns(before, after).entries.map((entry) => entry.imagePath)
		assert.deepEqual(once, ["/c/apple.jpg", "/c/mango.jpg", "/c/zebra.jpg"])
		assert.deepEqual(once, twice)
	})

	it("puts unchanged covers at the end, and still lists them", () => {
		const before = runFile("run-before", [row(0, "/c/same.jpg", withBackground("#101820")), row(1, "/c/moved.jpg", withBackground("#101820"))])
		const after = runFile("run-after", [row(0, "/c/same.jpg", withBackground("#101820")), row(1, "/c/moved.jpg", withBackground("#909090"))])
		const diff = diffRuns(before, after)
		assert.deepEqual(diff.entries.map((entry) => entry.status), ["changed", "unchanged"])
		assert.equal(diff.entries.at(-1)?.maxRolePairDistance, 0)
		assert.equal(diff.unchangedCount, 1)
	})

	it("puts a cover that started failing above every measurable change", () => {
		// The most urgent thing a diff can contain, and the one with no number to sort by.
		const before = runFile("run-before", [row(0, "/c/broke.jpg", withBackground("#101820")), row(1, "/c/moved.jpg", withBackground("#101820"))])
		const after = runFile("run-after", [row(0, "/c/broke.jpg", null, "decode failed"), row(1, "/c/moved.jpg", withBackground("#ffffff"))])
		const diff = diffRuns(before, after)
		assert.equal(diff.entries[0].imagePath, "/c/broke.jpg")
		assert.equal(diff.entries[0].status, "started-failing")
		assert.equal(diff.entries[0].maxRolePairDistance, null, "a failure was given a distance it cannot have")
	})

	it("names a cover that started working, rather than reporting it as a change", () => {
		const before = runFile("run-before", [row(0, "/c/fixed.jpg", null, "decode failed")])
		const after = runFile("run-after", [row(0, "/c/fixed.jpg", withBackground("#101820"))])
		assert.equal(diffRuns(before, after).entries[0].status, "started-working")
	})

	it("sinks a cover that failed in both runs below everything else", () => {
		const before = runFile("run-before", [row(0, "/c/broken.jpg", null, "no"), row(1, "/c/same.jpg", withBackground("#101820"))])
		const after = runFile("run-after", [row(0, "/c/broken.jpg", null, "still no"), row(1, "/c/same.jpg", withBackground("#101820"))])
		const diff = diffRuns(before, after)
		assert.equal(diff.entries.at(-1)?.status, "failed-both")
		// It is not a change: it was already broken and the run says nothing new about it.
		assert.equal(diff.changedCount, 0)
	})
})

describe("what is reported but not ordered on", () => {
	it("ranks a gradient-only change above unchanged and below any role change", () => {
		const flat = makePalette({ background: "#101820", surface: "#1e2a38", foreground: "#f2f4f6", accent: "#d08a3c" })
		const gradientOne = makePalette({
			background: "#101820",
			surface: "#1e2a38",
			foreground: "#f2f4f6",
			accent: "#d08a3c",
			stops: [["#101820", 0], ["#405060", 1]],
		})
		const gradientTwo = makePalette({
			background: "#101820",
			surface: "#1e2a38",
			foreground: "#f2f4f6",
			accent: "#d08a3c",
			stops: [["#101820", 0], ["#a0b0c0", 1]],
		})
		const before = runFile("run-before", [
			row(0, "/c/roles.jpg", withAccent("#d08a3c")),
			row(1, "/c/gradient.jpg", gradientOne),
			row(2, "/c/nothing.jpg", flat),
		])
		const after = runFile("run-after", [
			row(0, "/c/roles.jpg", withAccent("#3c8ad0")),
			row(1, "/c/gradient.jpg", gradientTwo),
			row(2, "/c/nothing.jpg", flat),
		])
		const diff = diffRuns(before, after)
		assert.deepEqual(diff.entries.map((entry) => entry.imagePath), ["/c/roles.jpg", "/c/gradient.jpg", "/c/nothing.jpg"])

		const gradientEntry = diff.entries[1]
		assert.equal(gradientEntry.status, "changed")
		assert.equal(gradientEntry.gradientChanged, true)
		// Reported, and deliberately NOT in the headline number: the metric means one thing.
		assert.equal(gradientEntry.maxRolePairDistance, 0)
		assert.ok((gradientEntry.maxStopDistance ?? 0) > 0)
		assert.ok(changeRank(gradientEntry) > changeRank(diff.entries[2]))
		assert.ok(changeRank(gradientEntry) < changeRank(diff.entries[0]))
	})

	it("reports a collapse flag flip even when the colours are the same", () => {
		const before = runFile("run-before", [
			row(0, "/c/x.jpg", makePalette({ background: "#101820", surface: "#101820", foreground: "#f2f4f6", accent: "#d08a3c", surfaceCollapsed: true })),
		])
		const after = runFile("run-after", [
			row(0, "/c/x.jpg", makePalette({ background: "#101820", surface: "#101820", foreground: "#f2f4f6", accent: "#d08a3c", surfaceCollapsed: false })),
		])
		const entry = diffRuns(before, after).entries[0]
		assert.equal(entry.collapseChanged, true)
		assert.equal(entry.status, "changed")
		assert.equal(entry.maxRolePairDistance, 0)
	})

	it("says out loud when the input file itself changed under a path", () => {
		const before = runFile("run-before", [row(0, "/c/x.jpg", withBackground("#101820"))])
		const mutated: RunRow = { ...row(0, "/c/x.jpg", withBackground("#909090")), inputContentHash: "b".repeat(64) }
		const entry = diffRuns(before, runFile("run-after", [mutated])).entries[0]
		assert.equal(entry.inputChanged, true, "the palette changed because the file did, and nothing said so")
	})
})

describe("two runs that are not quite comparable", () => {
	it("joins on image path, not on position", () => {
		// A set file that gained a line at the top would otherwise shift every row against its
		// neighbour and report the entire run as changed.
		const before = runFile("run-before", [row(0, "/c/a.jpg", withBackground("#101820")), row(1, "/c/b.jpg", withBackground("#303030"))])
		const after = runFile("run-after", [
			row(0, "/c/new.jpg", withBackground("#505050")),
			row(1, "/c/a.jpg", withBackground("#101820")),
			row(2, "/c/b.jpg", withBackground("#303030")),
		])
		const diff = diffRuns(before, after)
		assert.equal(diff.changedCount, 0, "a shifted set was reported as a changed candidate")
		assert.deepEqual(diff.onlyInAfter, ["/c/new.jpg"])
		assert.deepEqual(diff.onlyInBefore, [])
	})

	it("says when the two runs are over different sets", () => {
		const before = runFile("run-before", [row(0, "/c/a.jpg", withBackground("#101820"))])
		const after = runFile("run-after", [row(0, "/c/a.jpg", withBackground("#101820"))], "9".repeat(64))
		assert.equal(diffRuns(before, after).sameSet, false)
	})
})

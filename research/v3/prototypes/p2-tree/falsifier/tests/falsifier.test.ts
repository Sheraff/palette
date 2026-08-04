/**
 * The harness, checked against reachability that is **known by construction**.
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p2-tree/falsifier/tests/falsifier.test.ts
 * ```
 *
 * Two generated images, a hand-built node dump and a fabricated endorsement fixture (this
 * directory's `fixtures/`, **never** `data/legacy/`). Image 1 is 400 px of five exact triples in
 * counts chosen so that an area floor of 0.05 admits exactly three of them; every expected number
 * below is derived from those counts by hand, not from a previous run of the harness.
 *
 * | pipeline | retained node reprs | expected |
 * |---|---|---|
 * | `fixture-reachable` | `#ff0000`, `#0000ff` | 1/4 = 25.0% — **exactly the pre-registered line**, which is `>25%`, so NOT FALSIFIED |
 * | `fixture-broken` | `#ffffff` (not in the image) | 3/4 = 75% — FALSIFIED; the fourth colour is under the floor, so the control cannot reach it either and it is *not* charged |
 * | `fixture-empty` | none, and no declared floor | 4/4 = 100% at the [UNCALIBRATED] default floor, which admits all five triples |
 * | `fixture-partial` | `#00ffff` on image 2 | 1 colour slot, not 4 — the single-role entry constrains one role |
 *
 * The 25% row is the one worth keeping: an off-by-one in the comparison (`>=` instead of `>`) flips
 * a pre-registered verdict, and only a case that sits exactly on the line can catch it.
 */

import { createHash } from "node:crypto"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { DEFAULT_AREA_FLOOR, UNREACHABLE_SHARE_FALSIFIES_ABOVE } from "../constants.ts"
import { controlSetOf } from "../corpus.ts"
import { parseDumpLine, readDumps } from "../dumps.ts"
import { stableStringify } from "../report.ts"
import { parseArgs, runFalsifier, UsageError, type FalsifierReport } from "../run.ts"

const FIXTURE_DIR = new URL("fixtures/", import.meta.url).pathname

/** Image 1: 400 px, five exact triples, counts chosen so a 5% floor admits exactly three. */
const IMAGE_1 = {
	width: 20,
	height: 20,
	runs: [
		{ rgb: [255, 0, 0], count: 200 },
		{ rgb: [0, 255, 0], count: 120 },
		{ rgb: [0, 0, 255], count: 60 },
		{ rgb: [255, 255, 0], count: 19 },
		{ rgb: [0, 0, 0], count: 1 },
	],
} as const

/** Image 2: 100 px, one triple. */
const IMAGE_2 = { width: 10, height: 10, runs: [{ rgb: [0, 255, 255], count: 100 }] } as const

async function writeImage(
	path: string,
	spec: { width: number; height: number; runs: readonly { rgb: readonly number[]; count: number }[] },
): Promise<void> {
	const raw = Buffer.alloc(spec.width * spec.height * 3)
	let offset = 0
	for (const run of spec.runs) {
		for (let pixel = 0; pixel < run.count; pixel += 1) {
			raw[offset++] = run.rgb[0]!
			raw[offset++] = run.rgb[1]!
			raw[offset++] = run.rgb[2]!
		}
	}
	assert.equal(offset, raw.length, "fixture run counts must cover every pixel exactly once")
	await sharp(raw, { raw: { width: spec.width, height: spec.height, channels: 3 } }).png().toFile(path)
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex")
}

/** Build the whole scenario in a temp dir: images, materialised legacy fixture, node dump. */
async function buildScenario(): Promise<{ root: string; legacyDir: string; dumpPath: string }> {
	const root = mkdtempSync(join(tmpdir(), "p2-falsifier-"))
	const imagesDir = join(root, "images")
	mkdirSync(imagesDir, { recursive: true })

	const image1 = join(imagesDir, "one.png")
	const image2 = join(imagesDir, "two.png")
	const image3 = join(imagesDir, "unendorsed.png")
	await writeImage(image1, IMAGE_1)
	await writeImage(image2, IMAGE_2)
	await writeImage(image3, { width: 4, height: 4, runs: [{ rgb: [255, 0, 255], count: 16 }] })

	const legacyDir = join(root, "legacy")
	mkdirSync(legacyDir, { recursive: true })
	cpSync(join(FIXTURE_DIR, "known-bad.json"), join(legacyDir, "known-bad.json"))
	cpSync(join(FIXTURE_DIR, "acceptable.json"), join(legacyDir, "acceptable.json"))
	const template = readFileSync(join(FIXTURE_DIR, "endorsements.template.json"), "utf8")
	writeFileSync(
		join(legacyDir, "endorsements.json"),
		template
			.replaceAll("{{IMAGE_1_PATH}}", "images/one.png")
			.replaceAll("{{IMAGE_1_SHA256}}", sha256(image1))
			.replaceAll("{{IMAGE_2_PATH}}", "images/two.png")
			.replaceAll("{{IMAGE_2_SHA256}}", sha256(image2)),
	)

	const node = (repr: string, id: number) => ({ id, parent: null, areaFraction: 0.5, depth: 1, repr })
	const lines = [
		// Exactly on the pre-registered line.
		{
			imagePath: "images/one.png",
			pipeline: "fixture-reachable",
			width: 20,
			height: 20,
			areaFloor: 0.05,
			nodes: [node("#ff0000", 0), node("#0000ff", 1)],
		},
		// Same artwork again from the same pipeline: must be counted once.
		{
			imagePath: "images/one.png",
			pipeline: "fixture-reachable",
			width: 20,
			height: 20,
			areaFloor: 0.05,
			nodes: [node("#ff0000", 0)],
		},
		// An artwork with no endorsement: out of scope, reported.
		{
			imagePath: "images/unendorsed.png",
			pipeline: "fixture-reachable",
			width: 4,
			height: 4,
			areaFloor: 0.05,
			nodes: [node("#ff00ff", 0)],
		},
		// A path that does not exist: reported, never a quietly smaller denominator.
		{
			imagePath: "images/missing.png",
			pipeline: "fixture-reachable",
			width: 4,
			height: 4,
			areaFloor: 0.05,
			nodes: [node("#ff00ff", 0)],
		},
		// Nodes that occur nowhere in the image.
		{
			imagePath: "images/one.png",
			pipeline: "fixture-broken",
			width: 20,
			height: 20,
			constants: { areaFloor: 0.05 },
			nodes: [node("#ffffff", 0)],
		},
		// No nodes at all, and no declared floor: the [UNCALIBRATED] default has to show up.
		{ imagePath: "images/one.png", pipeline: "fixture-empty", width: 20, height: 20, nodes: [] },
		// The single-role entry.
		{
			imagePath: "images/two.png",
			pipeline: "fixture-partial",
			width: 10,
			height: 10,
			areaFloor: 0.05,
			nodes: [node("#00ffff", 0)],
		},
	]
	const dumpPath = join(root, "nodes.jsonl")
	writeFileSync(dumpPath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n")

	return { root, legacyDir, dumpPath }
}

async function runScenario(): Promise<FalsifierReport> {
	const scenario = await buildScenario()
	return runFalsifier({
		dumps: [scenario.dumpPath],
		out: null,
		limit: null,
		corpusRoot: scenario.root,
		legacyDir: scenario.legacyDir,
		areaFloor: null,
		quiet: true,
	})
}

function pipeline(report: FalsifierReport, name: string) {
	const found = report.aggregate.find((entry) => entry.pipeline === name)
	assert.ok(found, `no aggregate for ${name}`)
	return found
}

// ---------------------------------------------------------------------------------------------

test("the control set is exactly the triples clearing the floor", async () => {
	const scenario = await buildScenario()
	const image = join(scenario.root, "images/one.png")

	const atFivePercent = await controlSetOf(image, 0.05)
	assert.equal(atFivePercent.totalPixels, 400)
	assert.equal(atFivePercent.distinctTriples, 5)
	assert.equal(atFivePercent.minPixels, 20)
	// Ascending packed RGB: 0x0000ff, 0x00ff00, 0xff0000. #ffff00 (19 px) and #000000 (1 px) are out.
	assert.deepEqual(atFivePercent.colors.map((color) => color.hex), ["#0000ff", "#00ff00", "#ff0000"])
	assert.equal(atFivePercent.coveredPixelFraction, 380 / 400)

	const atDefault = await controlSetOf(image, DEFAULT_AREA_FLOOR)
	assert.equal(atDefault.minPixels, 1)
	assert.equal(atDefault.colors.length, 5)
	assert.equal(atDefault.coveredPixelFraction, 1)
})

test("a transparent pixel is refused, not flattened", async () => {
	const scenario = await buildScenario()
	const path = join(scenario.root, "images/alpha.png")
	const raw = Buffer.alloc(2 * 2 * 4, 255)
	raw[3] = 0
	await sharp(raw, { raw: { width: 2, height: 2, channels: 4 } }).png().toFile(path)
	await assert.rejects(() => controlSetOf(path, 0.5), /transparent pixel/)
})

test("reachability is computed exactly as constructed", async () => {
	const report = await runScenario()

	// Image 1 carries a four-role entry; image 2 a single-role one.
	assert.equal(report.rows.filter((row) => row.pipeline === "fixture-reachable").length, 4)
	assert.equal(report.rows.filter((row) => row.pipeline === "fixture-partial").length, 1)

	const byRole = new Map(
		report.rows.filter((row) => row.pipeline === "fixture-reachable").map((row) => [row.role, row] as const),
	)
	// #ff0000 is a node repr and clears the floor.
	assert.deepEqual(
		[byRole.get("background")!.node.within, byRole.get("background")!.control.within],
		[true, true],
	)
	assert.equal(byRole.get("background")!.node.barRatio, 0)
	// #00ff00 is not a node repr but clears the floor: this is the falsifier's numerator.
	assert.deepEqual([byRole.get("surface")!.node.within, byRole.get("surface")!.control.within], [false, true])
	assert.equal(byRole.get("surface")!.falsifies, true)
	// #ffff00 is 19 px, under the 20 px floor: unreachable from both, and NOT charged.
	assert.deepEqual([byRole.get("foreground")!.node.within, byRole.get("foreground")!.control.within], [false, false])
	assert.equal(byRole.get("foreground")!.falsifies, false)
	// #0000ff is a node repr.
	assert.deepEqual([byRole.get("accent")!.node.within, byRole.get("accent")!.control.within], [true, true])
})

test("the pre-registered line is strictly greater than 25%", async () => {
	const report = await runScenario()
	const reachable = pipeline(report, "fixture-reachable")

	assert.equal(reachable.colours, 4)
	assert.equal(reachable.counts.unreachableFromNodesReachableFromControl, 1)
	assert.equal(reachable.counts.unreachableFromBoth, 1)
	assert.ok(reachable.rates.falsifier.result.ok)
	assert.equal(reachable.rates.falsifier.result.rate, UNREACHABLE_SHARE_FALSIFIES_ABOVE)
	assert.match(reachable.verdict, /NOT FALSIFIED/)

	const broken = pipeline(report, "fixture-broken")
	assert.equal(broken.counts.reachableFromNodes, 0)
	assert.equal(broken.counts.unreachableFromNodesReachableFromControl, 3)
	assert.ok(broken.rates.falsifier.result.ok)
	assert.equal(broken.rates.falsifier.result.rate, 0.75)
	assert.match(broken.verdict, /^fixture-broken: FALSIFIED/)
})

test("an empty node set is a failure, never an abstention", async () => {
	const report = await runScenario()
	const empty = pipeline(report, "fixture-empty")

	assert.equal(empty.counts.emptyNodeSets, 1)
	assert.equal(empty.counts.reachableFromNodes, 0)
	// No declared floor, so the [UNCALIBRATED] default admits all five triples and the control
	// reaches every endorsed colour: all four slots land in the numerator.
	assert.equal(empty.counts.reachableFromControl, 4)
	assert.equal(empty.counts.unreachableFromNodesReachableFromControl, 4)
	assert.match(empty.verdict, /FALSIFIED/)

	const image = report.images.find((row) => row.pipeline === "fixture-empty")!
	assert.equal(image.areaFloorSource, "uncalibrated-default")
	assert.equal(image.areaFloor, DEFAULT_AREA_FLOOR)
	assert.equal(image.nodes, 0)
})

test("the area floor comes from the dump when the dump declares one", async () => {
	const report = await runScenario()
	const fromField = report.images.find((row) => row.pipeline === "fixture-reachable")!
	const fromConstants = report.images.find((row) => row.pipeline === "fixture-broken")!
	assert.equal(fromField.areaFloorSource, "dump")
	assert.equal(fromField.areaFloor, 0.05)
	assert.equal(fromConstants.areaFloorSource, "dump")
	assert.equal(fromConstants.areaFloor, 0.05)
})

test("out-of-scope lines are reported, never silently dropped", async () => {
	const report = await runScenario()
	const kinds = report.skipped.map((row) => row.kind).sort()
	assert.deepEqual(kinds, ["duplicate-line", "image-not-found", "unendorsed-artwork"])
	// The duplicate did not inflate the denominator.
	assert.equal(pipeline(report, "fixture-reachable").artworks, 1)
	assert.equal(report.corpus.endorsementEntries, 2)
	assert.equal(report.corpus.endorsementArtworks, 2)
})

test("output is deterministic", async () => {
	const first = stableStringify(await runScenario())
	const second = stableStringify(await runScenario())
	// Temp roots differ between the two builds, so the machine-dependent block is excluded.
	const strip = (text: string) => text.replace(/"path": "[^"]*"/g, '"path": "<root>"')
		.replace(/"detail": "[^"]*"/g, '"detail": "<detail>"')
		.replace(/"dumpFiles": \[[^\]]*\]/g, '"dumpFiles": []')
	assert.equal(strip(first), strip(second))
})

test("dump parsing refuses what it cannot read", () => {
	assert.match((parseDumpLine("f", 1, "{oops") as { reason: string }).reason, /not JSON/)
	assert.match((parseDumpLine("f", 1, '{"pipeline":"p","nodes":[]}') as { reason: string }).reason, /imagePath/)
	assert.match(
		(parseDumpLine("f", 1, '{"imagePath":"a","pipeline":"p","nodes":[{"id":1}]}') as { reason: string }).reason,
		/no string `repr`/,
	)
	const good = parseDumpLine("f", 3, '{"imagePath":"a","pipeline":"p","nodes":[{"id":1,"repr":"#010203"}]}')
	assert.ok(!("reason" in good))
	assert.equal(good.nodes[0]!.repr.hex, "#010203")
	assert.equal(good.declaredAreaFloor, null)
})

test("--limit truncates and says how much it cut", async () => {
	const scenario = await buildScenario()
	const limited = readDumps([scenario.dumpPath], 2)
	assert.equal(limited.lines.length, 2)
	assert.equal(limited.skippedByLimit, 5)
})

test("the CLI refuses an incomplete invocation", () => {
	assert.throws(() => parseArgs(["--out", "x.json"]), UsageError)
	assert.throws(() => parseArgs(["--dumps", "a.jsonl"]), UsageError)
	assert.throws(() => parseArgs(["--dumps", "a.jsonl", "--out", "x.json", "--limit", "0"]), UsageError)
	assert.throws(() => parseArgs(["--dumps", "a.jsonl", "--out", "x.json", "--area-floor", "2"]), UsageError)
	const options = parseArgs(["--dumps", "a.jsonl", "b.jsonl", "--out", "x.json", "--limit", "5"])
	assert.deepEqual(options.dumps, ["a.jsonl", "b.jsonl"])
	assert.equal(options.limit, 5)
})

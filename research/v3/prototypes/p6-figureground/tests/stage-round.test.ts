/**
 * P6 `stage-round` tests.
 *
 * Four things are load-bearing here, and the rest is scaffolding for them.
 *
 *  1. **Schema conformance.** An emitted `fixture.json` is checked twice — against this tool's own
 *     mirror of the calibration push schema, and against the review server's real
 *     `parseCalibrationBatch` on an absolutised clone. A fixture that only passes the mirror is a
 *     fixture whose author has drifted from the server.
 *  2. **The 4–10 rule is a hard error.** A 2-item round must be refused, not warned about.
 *  3. **Blinding.** The side-car is grepped for every string that would tell the reviewer whose
 *     palette they are grading. The fixture is grepped too — and the ONE surviving occurrence of the
 *     candidate id, `fingerprint.algorithmVersion`, is asserted to be exactly that and nothing else,
 *     so the documented deviation is pinned rather than merely written down.
 *  4. **Determinism.** Two emissions of the same round are byte-identical, all four files.
 *
 * Everything runs against a synthetic run file over synthetic covers in a temp tree, with `repoRoot`
 * pointed at that tree, so nothing here depends on the corpus, on `data/devloop/runs/`, or on the
 * real working tree's git state.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p6-figureground/tests/stage-round.test.ts
 */

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import sharp from "sharp"

import {
	buildFixture,
	buildSidecar,
	deriveItemId,
	MAX_ROUND_ITEMS,
	MIN_ROUND_ITEMS,
	parseRunFile,
	resolveCover,
	stageRound,
	toPaletteSnapshot,
	validateStagedFixture,
	type StageOptions,
} from "../tools/stage-round.ts"

// ---------------------------------------------------------------------------------------------
// A synthetic run, over synthetic covers
// ---------------------------------------------------------------------------------------------

/** The real candidate id, spelled exactly as the run header spells it — the blinding test needs it. */
const CANDIDATE_ID = "p6-figureground-0.1.0"
const CODE_VERSION = "30771e5a2169d88fa1a65567c3f6e3bd442b11800406d90c459dd6510f5fb415"
const RUN_ID = `${CANDIDATE_ID}-demo-20-20260804T212136246Z`
/** A string that stands in for an arm label. It must never appear in a payload. */
const ARM_LABEL = "arm-e-prime"

const GIT_COMMIT = "0123456789abcdef0123456789abcdef01234567"

type Fixture = Readonly<{ root: string; runPath: string; covers: readonly string[]; options: StageOptions }>

function hex(n: number): string {
	return `#${n.toString(16).padStart(6, "0")}`
}

function color(n: number) {
	return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const, hex: hex(n) }
}

/** A contract-shaped palette. Whether it is a *good* palette is not this file's business. */
function palette(seed: number, imagePath: string, contentHash: string, withGradient: boolean) {
	const background = color(0x101820 + seed)
	const surface = color(0x40607f + seed)
	return {
		contractVersion: "v3-contract-0.1.0",
		roles: {
			background,
			surface,
			foreground: color(0xf0f4ff - seed),
			accent: color(0xd04a2a + seed),
		},
		gradient: withGradient
			? {
					stops: [
						{ color: background, position: 0 },
						{ color: color(0x28405a + seed), position: 0.4600000000000001 },
						{ color: surface, position: 1 },
					],
				}
			: null,
		collapse: { surfaceCollapsed: false, accentCollapsed: false },
		escape: null,
		contrast: {
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 2.5 },
			minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 2.5 },
		},
		metadata: {
			algorithmVersion: CANDIDATE_ID,
			preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
			inputContentHash: contentHash,
			sourceRendition: { path: imagePath, width: 8, height: 8, format: "png" },
			processedSize: { width: 8, height: 8 },
		},
	}
}

/**
 * Build a temp "repo": `covers/NN.png` files, and a run JSONL whose rows describe them.
 *
 * `repoRoot` is the temp directory, so repo-relative paths in the emitted fixture are
 * `covers/NN.png` and nothing in the test touches the real tree.
 */
async function makeRun(rowCount: number, options: Readonly<{ failLast?: boolean }> = {}): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), "p6-stage-round-"))
	await mkdir(join(root, "covers"), { recursive: true })
	const lines: string[] = [
		JSON.stringify({
			kind: "devloop-run-header",
			runId: RUN_ID,
			candidateId: CANDIDATE_ID,
			candidatePath: join(root, "prototypes", ARM_LABEL, "src", "candidate.ts"),
			codeVersion: CODE_VERSION,
			setPath: join(root, "sets", "demo.txt"),
			setName: "demo-20",
			setHash: "1438ea306c724bf9ded30e325b8779652e0bfc6937da7aa1a6e1c2f3a7944578",
			imageCount: rowCount,
			startedAt: "2026-08-04T21:21:36.246Z",
			packageVersions: { sharp: "0.33.5" },
			nodeVersion: "v25.8.1",
			workerCount: 1,
		}),
	]
	const covers: string[] = []
	for (let index = 0; index < rowCount; index += 1) {
		const name = `${String(index).padStart(2, "0")}.png`
		const imagePath = join(root, "covers", name)
		const bytes = await sharp({
			create: { width: 8, height: 8, channels: 3, background: { r: 16 + index, g: 32, b: 64 } },
		})
			.png()
			.toBuffer()
		await writeFile(imagePath, bytes)
		const contentHash = createHash("sha256").update(bytes).digest("hex")
		covers.push(imagePath)
		const failed = options.failLast === true && index === rowCount - 1
		lines.push(
			JSON.stringify({
				kind: "devloop-run-row",
				index,
				imagePath,
				inputContentHash: contentHash,
				ok: !failed,
				palette: failed ? null : palette(index * 0x010203, imagePath, contentHash, index % 2 === 1),
				error: failed ? "synthetic failure" : null,
				cached: false,
				computeMs: 1234.5,
			}),
		)
	}
	lines.push(
		JSON.stringify({
			kind: "devloop-run-footer",
			runId: RUN_ID,
			finishedAt: "2026-08-04T21:23:00.000Z",
			imageCount: rowCount,
			okCount: rowCount,
			failedCount: 0,
			cacheHits: 0,
			cacheMisses: rowCount,
			wallMs: 1000,
		}),
	)
	const runPath = join(root, "run.jsonl")
	await writeFile(runPath, `${lines.join("\n")}\n`, "utf8")
	return {
		root,
		runPath,
		covers,
		options: {
			runPath,
			covers: [],
			roundName: "p6-demo-round",
			purpose: "Does the field reading pick the field a human would call the field?",
			outDir: join(root, "review-rounds"),
			repoRoot: root,
			gitCommit: GIT_COMMIT,
			dirty: false,
		},
	}
}

async function readAll(files: Readonly<Record<string, string>>): Promise<Record<string, string>> {
	const out: Record<string, string> = {}
	for (const [key, path] of Object.entries(files)) out[key] = await readFile(path, "utf8")
	return out
}

// ---------------------------------------------------------------------------------------------
// 1. The 4–10 rule
// ---------------------------------------------------------------------------------------------

test("a 2-item round is refused: a reviewer round is 4..10 items", async () => {
	const fixture = await makeRun(2)
	try {
		await assert.rejects(
			() => stageRound({ ...fixture.options, covers: ["0", "1"] }),
			(error: Error) => {
				assert.match(error.message, /a reviewer round is 4\.\.10 items; 2 were selected/u)
				return true
			},
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("an 11-item round is refused at the other end", async () => {
	const fixture = await makeRun(12)
	try {
		const covers = Array.from({ length: MAX_ROUND_ITEMS + 1 }, (_, index) => String(index))
		await assert.rejects(
			() => stageRound({ ...fixture.options, covers }),
			/a reviewer round is 4\.\.10 items; 11 were selected/u,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("the bounds are the standing rule, not a local invention", () => {
	assert.equal(MIN_ROUND_ITEMS, 4)
	assert.equal(MAX_ROUND_ITEMS, 10)
})

// ---------------------------------------------------------------------------------------------
// 2. Happy path and schema conformance
// ---------------------------------------------------------------------------------------------

test("a 5-item round emits four files whose fixture matches the push schema field for field", async () => {
	const fixture = await makeRun(5)
	try {
		const round = await stageRound({ ...fixture.options, covers: ["0", "1", "2", "3", "4"] })
		const text = await readAll(round.files)

		// Every file exists and is non-empty.
		for (const [name, body] of Object.entries(text)) assert.ok(body.length > 0, `${name} is empty`)

		const emitted = JSON.parse(text.fixture as string) as Record<string, unknown>
		// `stageRound` validated it on the way out; re-validating a re-read of the FILE proves what was
		// written is what was checked, not merely that the object in memory was fine.
		validateStagedFixture(emitted, fixture.root)

		assert.equal(emitted.batchId, "p6-demo-round")
		assert.equal(emitted.purpose, "calibration")
		assert.deepEqual(emitted.fundedBy, [])
		assert.equal(emitted.imagePathsRelativeTo, "repo-root")

		const items = emitted.items as Record<string, unknown>[]
		assert.equal(items.length, 5)
		for (const item of items) {
			// The exact per-item key set the server's `parseCalibrationBatch` reads.
			assert.deepEqual(Object.keys(item).sort(), [
				"artworkId",
				"fingerprint",
				"imagePath",
				"itemId",
				"palette",
				"variantId",
			])
			assert.deepEqual(Object.keys(item.fingerprint as object).sort(), [
				"algorithmVersion",
				"dirty",
				"gitCommit",
				"preprocessingVersion",
			])
			assert.deepEqual(Object.keys(item.palette as object).sort(), [
				"accent",
				"accentCollapsed",
				"background",
				"foreground",
				"gradient",
				"surface",
				"surfaceCollapsed",
			])
			assert.equal((item.fingerprint as Record<string, unknown>).gitCommit, GIT_COMMIT)
			assert.equal((item.fingerprint as Record<string, unknown>).dirty, false)
			assert.match(item.imagePath as string, /^covers\/\d\d\.png$/u)
		}

		// Ordering is by run index, and the item ids carry the ordinal.
		assert.deepEqual(
			items.map((item) => item.itemId),
			round.items.map((item) => item.itemId),
		)
		assert.equal(items[0]?.itemId, deriveItemId("p6-demo-round", 1, round.items[0]?.inputContentHash as string))

		// The side-car is the render-data shape the review-ui pages already consume.
		const sidecar = JSON.parse(text.sidecar as string) as { batchId: string; items: Record<string, unknown>[] }
		assert.equal(sidecar.batchId, "p6-demo-round")
		assert.deepEqual(
			sidecar.items.map((item) => item.questionKey),
			items.map((item) => item.itemId),
		)
		for (const item of sidecar.items) {
			assert.deepEqual(Object.keys(item).sort(), ["questionKey", "side"])
			const side = item.side as Record<string, unknown>
			assert.deepEqual(Object.keys(side).sort(), [
				"accentCollapsed",
				"fieldCss",
				"gradient",
				"roles",
				"surfaceCollapsed",
			])
			const roles = side.roles as Record<string, unknown>[]
			assert.deepEqual(
				roles.map((role) => role.role),
				["background", "surface", "foreground", "accent"],
			)
			for (const role of roles) {
				assert.deepEqual(Object.keys(role).sort(), ["collapsed", "hex", "name", "role"])
				assert.match(role.hex as string, /^#[0-9a-f]{6}$/u)
				// colornames-oklab supplies a real name, never the hex fallback.
				assert.notEqual(role.name, role.hex)
				assert.ok((role.name as string).length > 0)
			}
			assert.ok(typeof side.fieldCss === "string" && (side.fieldCss as string).length > 0)
		}

		// Rows 1 and 3 carried gradients; their fields are rendered ramps, the others are flat colours.
		const gradientSide = (sidecar.items[1] as { side: Record<string, unknown> }).side
		assert.ok(gradientSide.gradient !== null)
		assert.match(gradientSide.fieldCss as string, /^linear-gradient\(135deg in oklab, /u)
		const flatSide = (sidecar.items[0] as { side: Record<string, unknown> }).side
		assert.equal(flatSide.gradient, null)
		assert.match(flatSide.fieldCss as string, /^#[0-9a-f]{6}$/u)

		// Stop positions are canonicalised on the way out: 0.4600000000000001 -> 0.46.
		const gradientItem = items[1] as { palette: { gradient: { stops: { position: number }[] } } }
		assert.deepEqual(
			gradientItem.palette.gradient.stops.map((stop) => stop.position),
			[0, 0.46, 1],
		)

		// The private mapping is the de-blinding join, and it is complete.
		const mapping = JSON.parse(text.privateMapping as string) as Record<string, any>
		assert.equal(mapping.batchId, "p6-demo-round")
		assert.equal(mapping.run.candidateId, CANDIDATE_ID)
		assert.equal(mapping.run.codeVersion, CODE_VERSION)
		assert.equal(mapping.run.runId, RUN_ID)
		assert.equal(mapping.run.file, "run.jsonl")
		assert.equal(mapping.items.length, 5)
		assert.deepEqual(
			mapping.items.map((item: { itemId: string }) => item.itemId),
			items.map((item) => item.itemId),
		)
		for (const item of mapping.items) {
			assert.equal(item.candidateId, CANDIDATE_ID)
			assert.equal(item.codeVersion, CODE_VERSION)
			assert.match(item.imagePath, /^covers\/\d\d\.png$/u)
			assert.match(item.paletteHash, /^[0-9a-f]{64}$/u)
			assert.equal(item.escape, null)
		}
		// The join is total: every fixture item has exactly one mapping row and vice versa.
		assert.deepEqual(
			new Set(mapping.items.map((item: { itemId: string }) => item.itemId)),
			new Set(items.map((item) => item.itemId)),
		)

		// ROUND.md carries the round's shape and the unfilled consequence table.
		const roundMd = text.roundMd as string
		assert.match(roundMd, /# p6-demo-round/u)
		assert.match(roundMd, /\*\*Round kind:\*\* calibration/u)
		assert.match(roundMd, /\*\*Items:\*\* 5/u)
		assert.match(roundMd, /## What we do under each outcome/u)
		assert.match(roundMd, /## The question this round answers/u)
		assert.ok(roundMd.split("TODO — ORCHESTRATOR").length - 1 >= 5, "ROUND.md must carry the orchestrator's placeholders")
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("a failed run row cannot be staged", async () => {
	const fixture = await makeRun(5, { failLast: true })
	try {
		await assert.rejects(
			() => stageRound({ ...fixture.options, covers: ["0", "1", "2", "3", "4"] }),
			/run index 4 .* failed: synthetic failure/u,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("covers resolve by index, file name, stem, repo-relative path and content-hash prefix", async () => {
	const fixture = await makeRun(5)
	try {
		const run = parseRunFile(await readFile(fixture.runPath, "utf8"), fixture.runPath)
		const row = run.rows[3]!
		assert.equal(resolveCover("3", run.rows, fixture.root).index, 3)
		assert.equal(resolveCover("03.png", run.rows, fixture.root).index, 3)
		assert.equal(resolveCover("03", run.rows, fixture.root).index, 3)
		assert.equal(resolveCover("covers/03.png", run.rows, fixture.root).index, 3)
		assert.equal(resolveCover(row.imagePath, run.rows, fixture.root).index, 3)
		assert.equal(resolveCover(row.inputContentHash.slice(0, 12), run.rows, fixture.root).index, 3)
		assert.throws(() => resolveCover("no-such-cover", run.rows, fixture.root), /matches no row/u)
		await assert.rejects(
			() => stageRound({ ...fixture.options, covers: ["0", "1", "2", "0"] }),
			/selects run index 0 twice/u,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("a missing cover is refused at write time", async () => {
	const fixture = await makeRun(5)
	try {
		await rm(fixture.covers[2]!)
		await assert.rejects(() => stageRound({ ...fixture.options, covers: ["0", "1", "2", "3"] }), /does not exist/u)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("a cover whose bytes changed since the run is refused", async () => {
	const fixture = await makeRun(5)
	try {
		await writeFile(fixture.covers[1]!, await sharp({
			create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } },
		})
			.png()
			.toBuffer())
		await assert.rejects(
			() => stageRound({ ...fixture.options, covers: ["0", "1", "2", "3"] }),
			/the cover changed since the run/u,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

// ---------------------------------------------------------------------------------------------
// 3. Blinding
// ---------------------------------------------------------------------------------------------

test("blinding: the side-car names nothing about the candidate, and the fixture names it once, on purpose", async () => {
	const fixture = await makeRun(5)
	try {
		const round = await stageRound({ ...fixture.options, covers: ["0", "1", "2", "3", "4"] })
		const text = await readAll(round.files)
		const sidecarText = text.sidecar as string
		const fixtureText = text.fixture as string

		// --- the side-car: render data only ----------------------------------------------------
		for (const needle of [CANDIDATE_ID, CODE_VERSION, RUN_ID, ARM_LABEL, "candidateId", "codeVersion", "variantId", "fingerprint", "algorithmVersion", "paletteHash", "covers/", fixture.root]) {
			assert.ok(!sidecarText.includes(needle), `side-car leaks ${JSON.stringify(needle)}`)
		}

		// --- the fixture: no arm label, no code version, no run identity ------------------------
		for (const needle of [CODE_VERSION, RUN_ID, ARM_LABEL, "candidateId", "codeVersion", "run.jsonl", "private-mapping"]) {
			assert.ok(!fixtureText.includes(needle), `fixture leaks ${JSON.stringify(needle)}`)
		}

		// --- the one documented exception, pinned ----------------------------------------------
		// The candidate id survives into the fixture ONLY as `fingerprint.algorithmVersion`, which the
		// push schema requires and which the server never serves (round-kit's allowlist). Counting the
		// occurrences turns that sentence into a test: one per item, at that path, nowhere else.
		const occurrences = fixtureText.split(CANDIDATE_ID).length - 1
		assert.equal(occurrences, round.items.length, "the candidate id must appear once per item and no more")
		const emitted = JSON.parse(fixtureText) as { items: { variantId: string; fingerprint: { algorithmVersion: string } }[] }
		for (const item of emitted.items) {
			assert.equal(item.fingerprint.algorithmVersion, CANDIDATE_ID)
			assert.notEqual(item.variantId, CANDIDATE_ID)
			assert.match(item.variantId, /^p6-demo-round-v-[0-9a-f]{8}$/u)
		}

		// --- nothing points at the private mapping ----------------------------------------------
		for (const body of [fixtureText, sidecarText]) {
			assert.ok(!body.includes("private-mapping.json"), "no payload may reference the de-blinding join")
		}

		// --- and the private mapping is the only place the join lives ---------------------------
		const mappingText = text.privateMapping as string
		assert.ok(mappingText.includes(CANDIDATE_ID))
		assert.ok(mappingText.includes(CODE_VERSION))
		assert.ok(mappingText.includes(RUN_ID))
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

// ---------------------------------------------------------------------------------------------
// 4. Determinism
// ---------------------------------------------------------------------------------------------

test("two emissions of the same round are byte-identical, and cover order does not matter", async () => {
	const fixture = await makeRun(6)
	try {
		const first = await stageRound({ ...fixture.options, covers: ["0", "1", "2", "3", "4"] })
		const before = await readAll(first.files)
		// Same selection, listed backwards, into the same directory: overwrites in place, byte for byte.
		const second = await stageRound({ ...fixture.options, covers: ["4", "3", "2", "1", "0"] })
		const after = await readAll(second.files)
		assert.deepEqual(second.files, first.files)
		for (const key of Object.keys(before)) {
			assert.equal(after[key], before[key], `${key} is not byte-identical across emissions`)
		}
		// No timestamp anywhere: an ISO-8601 instant in any emitted file would break "same in ⇒ same out".
		for (const [key, body] of Object.entries(after)) {
			assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u.test(body), `${key} carries a timestamp`)
		}
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

// ---------------------------------------------------------------------------------------------
// 5. Unit checks on the mapping and the mirror schema
// ---------------------------------------------------------------------------------------------

test("toPaletteSnapshot keeps role hexes and drops nothing the push schema reads", () => {
	const snapshot = toPaletteSnapshot(palette(0, "/tmp/x.png", "0".repeat(64), true) as never)
	assert.deepEqual(Object.keys(snapshot), [
		"background",
		"surface",
		"foreground",
		"accent",
		"gradient",
		"surfaceCollapsed",
		"accentCollapsed",
	])
	assert.equal(snapshot.background, "#101820")
	assert.equal(snapshot.gradient?.stops.length, 3)
	assert.equal(snapshot.gradient?.stops[0]?.color, snapshot.background)
	assert.equal(snapshot.gradient?.stops[2]?.color, snapshot.surface)
})

test("the mirror schema rejects an absolute imagePath, a bad hex, and a non-monotonic ramp", () => {
	const base = buildFixture(
		[
			{
				itemId: "r-01-0000abcd",
				variantId: "r-v-0000abcd",
				index: 0,
				imagePath: "covers/00.png",
				absoluteImagePath: "/tmp/covers/00.png",
				inputContentHash: "0".repeat(64),
				palette: toPaletteSnapshot(palette(0, "/tmp/covers/00.png", "0".repeat(64), true) as never),
				paletteHash: "0".repeat(64),
				fingerprint: {
					algorithmVersion: CANDIDATE_ID,
					preprocessingVersion: "p",
					gitCommit: GIT_COMMIT,
					dirty: false,
				},
				escape: null,
				colorNames: {},
			},
		],
		"r",
	)
	// One item is below the round floor, so the mirror refuses it for that reason first.
	assert.throws(() => validateStagedFixture(base, "/tmp"), /must hold 4\.\.10 items/u)

	const four = { ...base, items: [0, 1, 2, 3].map((n) => ({ ...base.items[0]!, itemId: `r-0${n}-0000abcd` })) }
	validateStagedFixture(four, "/tmp")

	const absolute = { ...four, items: four.items.map((item) => ({ ...item, imagePath: "/abs/00.png" })) }
	assert.throws(() => validateStagedFixture(absolute, "/tmp"), /must be a repo-relative path/u)

	const badHex = {
		...four,
		items: four.items.map((item) => ({ ...item, palette: { ...item.palette, background: "#GGGGGG" } })),
	}
	assert.throws(() => validateStagedFixture(badHex, "/tmp"), /palette\.background must be #rrggbb/u)

	const backwards = {
		...four,
		items: four.items.map((item) => ({
			...item,
			palette: {
				...item.palette,
				gradient: { stops: [{ color: "#000000", position: 0.5 }, { color: "#ffffff", position: 0.2 }] },
			},
		})),
	}
	assert.throws(() => validateStagedFixture(backwards, "/tmp"), /must be strictly increasing/u)

	const duplicate = { ...four, items: four.items.map((item) => ({ ...item, itemId: "r-01-0000abcd" })) }
	assert.throws(() => validateStagedFixture(duplicate, "/tmp"), /two items called/u)
})

test("buildSidecar is keyed by questionKey and carries only the served side shape", () => {
	const snapshot = toPaletteSnapshot(palette(0, "/tmp/x.png", "0".repeat(64), false) as never)
	const sidecar = buildSidecar(
		[
			{
				itemId: "r-01-0000abcd",
				variantId: "r-v-0000abcd",
				index: 0,
				imagePath: "covers/00.png",
				absoluteImagePath: "/tmp/covers/00.png",
				inputContentHash: "0".repeat(64),
				palette: snapshot,
				paletteHash: "0".repeat(64),
				fingerprint: { algorithmVersion: "a", preprocessingVersion: "p", gitCommit: GIT_COMMIT, dirty: false },
				escape: null,
				colorNames: { [snapshot.background]: "Ink" },
			},
		],
		"r",
	)
	assert.deepEqual(Object.keys(sidecar), ["batchId", "items"])
	assert.equal(sidecar.items[0]?.questionKey, "r-01-0000abcd")
	assert.equal(sidecar.items[0]?.side.fieldCss, snapshot.background)
	assert.equal(sidecar.items[0]?.side.roles[0]?.name, "Ink")
})

/**
 * The batch runner: determinism, provenance, and the cache behaving the way the loop needs it to.
 *
 * **Determinism is the load-bearing property here**, and it is not an aesthetic preference. Results
 * come back from a pool of workers in whatever order they finish; if that order reached the file,
 * then diffing two runs of the *same* candidate would report changes, and the one instrument that is
 * supposed to answer "what did my edit do" would answer "everything, a bit" every time. So the tests
 * below run the same candidate twice and demand the rows be identical, and then run an *edited*
 * candidate and demand they not be.
 *
 * Candidates are written into a temporary directory rather than kept as fixtures on disk, because
 * half of what is under test is what happens **when the source changes** — and a test that edits a
 * committed file to prove that would be a test that leaves the repository dirty when it fails.
 */
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import sharp from "sharp"
import { computeCodeVersion, MAX_CANDIDATE_SOURCE_FILES } from "../src/devloop/code-version.ts"
import { deterministicPart, readImageSet, readRunFile, runCandidate, verifyRunFile } from "../src/devloop/run.ts"
import { V3_ROOT } from "../src/devloop/code-version.ts"

let root: string
let imagesDir: string
let setPath: string
let cacheRoot: string

/** A candidate that reads the file's bytes and derives four colours from them. No decoding. */
function candidateSource(marker: number): string {
	return `
import { readFile } from "node:fs/promises"
export const candidateId = "fixture-candidate"
const MARKER = ${marker}
export const paletteOf = async (imagePath) => {
	const bytes = await readFile(imagePath)
	const seed = (bytes.length + MARKER) % 200
	const color = (offset) => {
		const value = (seed + offset * 17) % 256
		const hex = "#" + [value, (value + 40) % 256, (value + 80) % 256].map((c) => c.toString(16).padStart(2, "0")).join("")
		return { rgb: [value, (value + 40) % 256, (value + 80) % 256], hex }
	}
	return {
		contractVersion: "v3-contract-0.1.0",
		roles: { background: color(0), surface: color(1), foreground: color(2), accent: color(3) },
		gradient: null,
		collapse: { surfaceCollapsed: false, accentCollapsed: false },
		contrast: { minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 2.5 }, minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 2.5 } },
		metadata: {
			algorithmVersion: "fixture-" + MARKER,
			preprocessingVersion: "none",
			inputContentHash: "0".repeat(64),
			sourceRendition: { path: imagePath, width: 4, height: 4, format: "png" },
			processedSize: { width: 4, height: 4 },
		},
	}
}
`
}

/** Four tiny PNGs, each a different solid colour, so every row is distinguishable. */
async function makeImages(directory: string, count: number): Promise<string[]> {
	await mkdir(directory, { recursive: true })
	const paths: string[] = []
	for (let index = 0; index < count; index += 1) {
		const path = join(directory, `fixture-${index}.png`)
		await sharp({
			create: { width: 4 + index, height: 4, channels: 3, background: { r: 10 + index * 30, g: 60, b: 200 - index * 20 } },
		})
			.png()
			.toFile(path)
		paths.push(path)
	}
	return paths
}

before(async () => {
	root = await mkdtemp(join(tmpdir(), "devloop-runner-"))
	imagesDir = join(root, "images")
	cacheRoot = join(root, "cache")
	const paths = await makeImages(imagesDir, 6)
	setPath = join(root, "fixture-set.txt")
	await writeFile(setPath, `# a fixture set\n${paths.join("\n")}\n`, "utf8")
})

after(async () => {
	await rm(root, { recursive: true, force: true })
})

describe("the set file", () => {
	it("reads paths, skips comments, and hashes the resolved list", async () => {
		const set = await readImageSet(setPath)
		assert.equal(set.imagePaths.length, 6)
		assert.equal(set.setName, "fixture-set")
		assert.match(set.setHash, /^[0-9a-f]{64}$/u)
	})

	it("runs a duplicated cover once", async () => {
		const doubled = join(root, "doubled.txt")
		const set = await readImageSet(setPath)
		await writeFile(doubled, [...set.imagePaths, set.imagePaths[0]].join("\n"), "utf8")
		assert.equal((await readImageSet(doubled)).imagePaths.length, 6)
	})

	it("refuses a set that names nothing rather than running over zero covers", async () => {
		const empty = join(root, "empty.txt")
		await writeFile(empty, "# nothing here\n\n", "utf8")
		await assert.rejects(() => readImageSet(empty), /names no images/u)
	})
})

describe("the code version", () => {
	it("changes when the candidate's own source changes", async () => {
		const directory = join(root, "codeversion")
		await mkdir(directory, { recursive: true })
		const path = join(directory, "candidate.ts")
		await writeFile(path, candidateSource(1), "utf8")
		const first = await computeCodeVersion(path)
		await writeFile(path, candidateSource(2), "utf8")
		const second = await computeCodeVersion(path)
		assert.notEqual(first.codeVersion, second.codeVersion)
	})

	it("changes when a file the candidate IMPORTS changes — the dependency closure", async () => {
		// This is the property the 0.7.7 audit was voided for not having: an implementation hash that
		// omits runtime dependencies certifies a result the code no longer produces.
		const directory = join(root, "closure")
		await mkdir(directory, { recursive: true })
		const helper = join(directory, "helper.ts")
		const entry = join(directory, "entry.ts")
		await writeFile(helper, "export const OFFSET = 1\n", "utf8")
		await writeFile(entry, 'import { OFFSET } from "./helper.ts"\nexport const candidateId = "x"\nexport const paletteOf = async () => OFFSET\n', "utf8")

		const before = await computeCodeVersion(entry)
		assert.ok(
			before.files.some((file) => file.path.endsWith("helper.ts")),
			"the imported file is not in the hash at all",
		)
		// The candidate's own bytes are untouched; only what it imports moved.
		await writeFile(helper, "export const OFFSET = 2\n", "utf8")
		assert.notEqual((await computeCodeVersion(entry)).codeVersion, before.codeVersion)
	})

	it("reports the files that went into it, so a surprising key can be audited", async () => {
		const version = await computeCodeVersion(join(V3_ROOT, "src", "devloop", "candidates", "toy-median-offsets.ts"))
		const paths = version.files.map((file) => file.path)
		assert.ok(paths.some((path) => path.endsWith("toy-median-offsets.ts")))
		// It reaches the contract, because the contract's colour maths changes what the toy publishes.
		assert.ok(paths.some((path) => path.includes("contract/color.ts")), "the contract is not in the closure")
		assert.ok(version.files.length < MAX_CANDIDATE_SOURCE_FILES)
		// Bare specifiers are NOT followed: `sharp` is an environment fact, recorded in packageVersions.
		assert.ok(!paths.some((path) => path.includes("node_modules")), "the walk followed a package specifier")
	})
})

describe("running a candidate", () => {
	let candidatePath: string
	let outDirectory: string

	before(async () => {
		outDirectory = join(root, "runs")
		await mkdir(outDirectory, { recursive: true })
		candidatePath = join(root, "candidate-a.ts")
		await writeFile(candidatePath, candidateSource(1), "utf8")
	})

	it("writes a provenance header that says what the run was", async () => {
		const summary = await runCandidate({
			candidatePath,
			setPath,
			outPath: join(outDirectory, "first.jsonl"),
			cacheRoot,
			quiet: true,
		})
		const run = await readRunFile(summary.outPath)
		assert.equal(run.header.kind, "devloop-run-header")
		assert.equal(run.header.candidateId, "fixture-candidate")
		assert.match(run.header.codeVersion, /^[0-9a-f]{64}$/u)
		assert.match(run.header.setHash, /^[0-9a-f]{64}$/u)
		assert.equal(run.header.imageCount, 6)
		assert.match(run.header.startedAt, /^\d{4}-\d{2}-\d{2}T/u)
		assert.equal(run.header.nodeVersion, process.version)
		// Package versions, declared AND resolved — the decoder is half of what produced a palette.
		assert.ok("sharp" in run.header.packageVersions, "no package versions recorded")
		assert.ok("sharp@resolved" in run.header.packageVersions, "no RESOLVED package version recorded")
		assert.equal(run.rows.length, 6)
		assert.equal(run.footer?.okCount, 6)
	})

	it("gives two runs started in the same second different ids", async () => {
		// Regression, 2026-08-04: the id truncated to the second, so two back-to-back runs collided and
		// the second overwrote the first's results file — losing exactly the run you were about to diff.
		const first = await runCandidate({ candidatePath, setPath, cacheRoot, quiet: true, outPath: join(outDirectory, "id-a.jsonl") })
		const second = await runCandidate({ candidatePath, setPath, cacheRoot, quiet: true, outPath: join(outDirectory, "id-b.jsonl") })
		assert.notEqual(first.header.runId, second.header.runId, "two runs share an id and would share a file")
	})

	it("writes rows in SET order, never in completion order", async () => {
		const run = await readRunFile(join(outDirectory, "first.jsonl"))
		const set = await readImageSet(setPath)
		assert.deepEqual(run.rows.map((row) => row.index), [0, 1, 2, 3, 4, 5])
		assert.deepEqual(run.rows.map((row) => row.imagePath), [...set.imagePaths])
	})

	it("is deterministic: the same candidate over the same set twice gives identical rows", async () => {
		const second = await runCandidate({
			candidatePath,
			setPath,
			outPath: join(outDirectory, "second.jsonl"),
			cacheRoot,
			quiet: true,
		})
		const first = await readRunFile(join(outDirectory, "first.jsonl"))
		const repeat = await readRunFile(second.outPath)
		assert.deepEqual(repeat.rows.map(deterministicPart), first.rows.map(deterministicPart))
	})

	it("serves the second run out of the cache", async () => {
		const run = await readRunFile(join(outDirectory, "second.jsonl"))
		assert.equal(run.footer?.cacheHits, 6, "the second run recomputed work it had already done")
		assert.equal(run.footer?.cacheMisses, 0)
		assert.ok(run.rows.every((row) => row.cached), "rows do not say they came from the cache")
	})

	it("an edited candidate misses the cache and produces different palettes", async () => {
		// The whole loop in one assertion: change the code, and what comes back is what the changed
		// code produces — not what the previous version left in the store.
		const edited = join(root, "candidate-b.ts")
		await writeFile(edited, candidateSource(7), "utf8")
		const summary = await runCandidate({
			candidatePath: edited,
			setPath,
			outPath: join(outDirectory, "edited.jsonl"),
			cacheRoot,
			quiet: true,
		})
		const run = await readRunFile(summary.outPath)
		assert.equal(run.footer?.cacheHits, 0, "an edited candidate was served stale palettes")
		assert.equal(run.footer?.cacheMisses, 6)

		const before = await readRunFile(join(outDirectory, "first.jsonl"))
		assert.notDeepEqual(
			run.rows.map((row) => row.palette?.roles.background.hex),
			before.rows.map((row) => row.palette?.roles.background.hex),
		)
	})

	it("records a failure as a row, never as a missing line", async () => {
		const withMissing = join(root, "with-missing.txt")
		const set = await readImageSet(setPath)
		await writeFile(withMissing, [set.imagePaths[0], join(imagesDir, "does-not-exist.png"), set.imagePaths[1]].join("\n"), "utf8")
		const summary = await runCandidate({
			candidatePath,
			setPath: withMissing,
			outPath: join(outDirectory, "missing.jsonl"),
			cacheRoot,
			quiet: true,
		})
		const run = await readRunFile(summary.outPath)
		assert.equal(run.rows.length, 3, "the failed cover vanished instead of being reported")
		assert.deepEqual(run.rows.map((row) => row.ok), [true, false, true])
		assert.match(run.rows[1].error ?? "", /cannot read input/u)
		assert.equal(run.footer?.failedCount, 1)
	})

	it("refuses a module that is not a candidate, at load, once", async () => {
		const notACandidate = join(root, "not-a-candidate.ts")
		await writeFile(notACandidate, "export const something = 1\n", "utf8")
		await assert.rejects(
			() => runCandidate({ candidatePath: notACandidate, setPath, cacheRoot, quiet: true, outPath: join(outDirectory, "never.jsonl") }),
			/is not a candidate module/u,
		)
	})

	it("honours a worker count of one, and still produces the same rows", async () => {
		const summary = await runCandidate({
			candidatePath,
			setPath,
			outPath: join(outDirectory, "single.jsonl"),
			cacheRoot,
			workerCount: 1,
			quiet: true,
		})
		const single = await readRunFile(summary.outPath)
		const parallel = await readRunFile(join(outDirectory, "first.jsonl"))
		assert.equal(single.header.workerCount, 1)
		assert.deepEqual(single.rows.map(deterministicPart), parallel.rows.map(deterministicPart))
	})
})

describe("verify", () => {
	it("passes while the code and the set are unchanged, and fails once they are not", async () => {
		const directory = join(root, "verify")
		await mkdir(directory, { recursive: true })
		const candidatePath = join(directory, "candidate.ts")
		await writeFile(candidatePath, candidateSource(3), "utf8")
		const summary = await runCandidate({
			candidatePath,
			setPath,
			outPath: join(directory, "run.jsonl"),
			cacheRoot,
			quiet: true,
		})
		assert.deepEqual(await verifyRunFile(summary.outPath), [], "a fresh run does not verify against itself")

		await writeFile(candidatePath, candidateSource(4), "utf8")
		const problems = await verifyRunFile(summary.outPath)
		assert.equal(problems.length, 1)
		assert.equal(problems[0].what, "codeVersion")
	})
})

describe("the toy candidate, on real decoded images", () => {
	it("publishes a contract-shaped palette whose colours are exact source pixels", async () => {
		// The fixture candidates above never decode anything. This one does, through `sharp`, on the
		// real path a Phase 1 candidate will take.
		const directory = join(root, "toy")
		await mkdir(directory, { recursive: true })
		const paths = await makeImages(join(directory, "images"), 2)
		const toySet = join(directory, "set.txt")
		await writeFile(toySet, paths.join("\n"), "utf8")

		const summary = await runCandidate({
			candidatePath: join(V3_ROOT, "src", "devloop", "candidates", "toy-median-offsets.ts"),
			setPath: toySet,
			outPath: join(directory, "toy.jsonl"),
			cacheRoot: join(directory, "cache"),
			quiet: true,
		})
		const run = await readRunFile(summary.outPath)
		assert.equal(run.footer?.okCount, 2)

		const palette = run.rows[0].palette
		assert.ok(palette !== null)
		// Dimensions from the header, not from the filename.
		assert.equal(palette.metadata.sourceRendition.width, 4)
		assert.equal(palette.metadata.sourceRendition.format, "png")
		// The input hash is the file's own bytes, which is what the cache keys on.
		assert.match(palette.metadata.inputContentHash, /^[0-9a-f]{64}$/u)
		// A solid-colour fixture has exactly one pixel value, so every snapped role must be that pixel.
		for (const role of ["background", "surface", "foreground", "accent"] as const) {
			assert.deepEqual(palette.roles[role].rgb, [10, 60, 200], `${role} is not an exact source pixel`)
		}
		// …and a palette whose roles are literally equal must say so, rather than leave it to be inferred.
		assert.equal(palette.collapse.surfaceCollapsed, true)
		assert.equal(palette.collapse.accentCollapsed, true)
	})

	it("refuses an input with transparent pixels rather than flattening it", async () => {
		const directory = join(root, "alpha")
		await mkdir(directory, { recursive: true })
		const path = join(directory, "transparent.png")
		await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } })
			.png()
			.toFile(path)
		const alphaSet = join(directory, "set.txt")
		await writeFile(alphaSet, `${path}\n`, "utf8")

		const summary = await runCandidate({
			candidatePath: join(V3_ROOT, "src", "devloop", "candidates", "toy-median-offsets.ts"),
			setPath: alphaSet,
			outPath: join(directory, "alpha.jsonl"),
			cacheRoot: join(directory, "cache"),
			quiet: true,
		})
		const run = await readRunFile(summary.outPath)
		assert.equal(run.rows[0].ok, false)
		assert.match(run.rows[0].error ?? "", /transparent/u)
		// A failure is never cached: it is usually about the environment, and caching it would make it
		// outlive its cause while looking exactly like a result.
		const again = await runCandidate({
			candidatePath: join(V3_ROOT, "src", "devloop", "candidates", "toy-median-offsets.ts"),
			setPath: alphaSet,
			outPath: join(directory, "alpha-2.jsonl"),
			cacheRoot: join(directory, "cache"),
			quiet: true,
		})
		assert.equal((await readRunFile(again.outPath)).footer?.cacheHits, 0)
	})
})

/**
 * The completion watcher (REVIEW_UI.md §1).
 *
 * "Completion watching costs no agent context: a background watcher waits for `batch-complete` and
 * notifies the orchestrator once." The properties that make that true, and that are asserted here:
 *
 *  - it exits **0** on the release of the batch it was asked about, and ignores every other batch;
 *  - it is **cheap**: it never re-reads the log, only the bytes appended since its last look, so its
 *    cost does not grow with the campaign;
 *  - it **survives a half-written line**, because it polls a file another process is appending to;
 *  - it exits **2** on timeout — distinct from 0, so a shell can tell "released" from "gave up".
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { appendFile, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { watchForCompletion } from "../src/review-server/watch-batch.ts"
import { COMPLETE_VERDICT, call, makeBatch, startHarness, type Harness } from "../src/review-server/test-support.ts"

const WATCHER = fileURLToPath(new URL("../src/review-server/watch-batch.ts", import.meta.url))

/** A `batch-complete` line, as the warehouse writes it. */
function completeLine(batchId: string, id = `bc-${batchId}`): string {
	return `${JSON.stringify({
		id,
		type: "batch-complete",
		ts: new Date().toISOString(),
		schema: "v3.0",
		author: { kind: "human", id: "test-reviewer" },
		batchId,
		purpose: "arm",
		itemCount: 3,
		fundedBy: [],
		releasedItemIds: ["item-0", "item-1", "item-2"],
		note: "",
	})}\n`
}

describe("completion watcher", () => {
	let root: string
	let warehousePath: string

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "v3-watch-"))
		warehousePath = join(root, "warehouse.jsonl")
	})

	after(async () => {
		await rm(root, { recursive: true, force: true })
	})

	it("waits, then reports the release of the batch it was asked about", async () => {
		await writeFile(warehousePath, "")
		let polls = 0
		const waiting = watchForCompletion({
			warehousePath,
			batchId: "arm-3-round-1",
			intervalMs: 5,
			timeoutMs: 5000,
			onIdle: () => {
				polls += 1
			},
		})
		// Another batch's release must not satisfy this watcher.
		await appendFile(warehousePath, completeLine("some-other-batch"))
		await new Promise((done) => setTimeout(done, 30))
		await appendFile(warehousePath, completeLine("arm-3-round-1", "bc-wanted"))

		const sighting = await waiting
		assert.ok(sighting !== null)
		assert.equal(sighting.batchId, "arm-3-round-1")
		assert.equal(sighting.recordId, "bc-wanted")
		assert.equal(sighting.itemCount, 3)
		assert.equal(sighting.alreadyReleased, false)
		assert.ok(polls > 0, "it should have polled while waiting")
	})

	it("takes the next release of any batch when no batch is named", async () => {
		await writeFile(warehousePath, "")
		const waiting = watchForCompletion({ warehousePath, intervalMs: 5, timeoutMs: 5000, includeExisting: false })
		await appendFile(warehousePath, completeLine("whichever-comes-first"))
		const sighting = await waiting
		assert.equal(sighting?.batchId, "whichever-comes-first")
	})

	it("reports a batch that was already released when it started, rather than hanging", async () => {
		await writeFile(warehousePath, completeLine("already-done"))
		const sighting = await watchForCompletion({
			warehousePath,
			batchId: "already-done",
			intervalMs: 5,
			timeoutMs: 200,
		})
		// A watcher started just after the reviewer pressed release must not lose that race.
		assert.equal(sighting?.batchId, "already-done")
		assert.equal(sighting?.alreadyReleased, true)

		// …unless the caller explicitly wants a *new* one.
		const onlyNew = await watchForCompletion({
			warehousePath,
			batchId: "already-done",
			intervalMs: 5,
			timeoutMs: 100,
			includeExisting: false,
		})
		assert.equal(onlyNew, null)
	})

	it("survives a half-written line and picks the record up once it is complete", async () => {
		await writeFile(warehousePath, "")
		const waiting = watchForCompletion({ warehousePath, batchId: "torn-write", intervalMs: 5, timeoutMs: 5000 })
		const line = completeLine("torn-write", "bc-torn")
		await appendFile(warehousePath, line.slice(0, 40))
		await new Promise((done) => setTimeout(done, 40))
		await appendFile(warehousePath, line.slice(40))
		const sighting = await waiting
		assert.equal(sighting?.recordId, "bc-torn")
	})

	it("ignores every other record type, and a missing warehouse is not an error", async () => {
		const missing = join(root, "not-there-yet.jsonl")
		const waiting = watchForCompletion({ warehousePath: missing, intervalMs: 5, timeoutMs: 5000 })
		await writeFile(missing, `${JSON.stringify({ id: "v-1", type: "verdict", batchId: "not-a-release" })}\n`)
		await new Promise((done) => setTimeout(done, 30))
		await appendFile(missing, `${JSON.stringify({ id: "n-1", type: "note", text: "nothing" })}\n`)
		await new Promise((done) => setTimeout(done, 30))
		await appendFile(missing, completeLine("finally"))
		const sighting = await waiting
		assert.equal(sighting?.batchId, "finally")
	})

	it("reads only what was appended since the last look", async () => {
		// The cheapness claim, made checkable. A watcher that re-read the log would parse a campaign's
		// worth of records once per second for as long as the reviewer takes — so the test plants a
		// matching record *behind* the watcher's offset, in place, without changing the file's size. A
		// tail reader cannot see it; a re-reader would report it immediately.
		const big = join(root, "big.jsonl")
		const filler = `${JSON.stringify({ id: "n-filler", type: "note", text: "x".repeat(200) })}\n`
		await writeFile(big, filler.repeat(500))
		const sizeBefore = (await stat(big)).size

		let polls = 0
		const waiting = watchForCompletion({
			warehousePath: big,
			batchId: "at-the-end",
			intervalMs: 5,
			timeoutMs: 5000,
			onIdle: () => {
				polls += 1
			},
		})
		await new Promise((done) => setTimeout(done, 40))
		assert.ok(polls > 0, "the watcher should have read the file once and then be idling")

		// A matching record at the very start of the file, padded to the filler's exact length.
		const planted = JSON.stringify({ id: "bc-behind-the-offset", type: "batch-complete", batchId: "at-the-end" })
		const handle = await open(big, "r+")
		try {
			await handle.write(`${planted.padEnd(filler.length - 1, " ")}\n`, 0, "utf8")
		} finally {
			await handle.close()
		}
		assert.equal((await stat(big)).size, sizeBefore, "the plant must not change the file size")
		await new Promise((done) => setTimeout(done, 40))

		// Still waiting: it never looked back.
		await appendFile(big, completeLine("at-the-end", "bc-appended"))
		const sighting = await waiting
		assert.equal(sighting?.recordId, "bc-appended", "the watcher re-read bytes it had already passed")
	})
})

describe("completion watcher as a background shell command", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
	})

	after(async () => {
		await harness?.stop()
	})

	/** Run the watcher exactly as the orchestrator would: a detached process, waited on by a shell. */
	function runWatcher(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
		return new Promise((done) => {
			const child = spawn(process.execPath, ["--experimental-strip-types", WATCHER, ...args], {
				env: { ...process.env, NODE_NO_WARNINGS: "1" },
			})
			let stdout = ""
			let stderr = ""
			child.stdout.on("data", (chunk) => {
				stdout += String(chunk)
			})
			child.stderr.on("data", (chunk) => {
				stderr += String(chunk)
			})
			child.on("exit", (code) => done({ code: code ?? -1, stdout, stderr }))
		})
	}

	it("exits 0 with one JSON line when the reviewer releases the batch", async () => {
		await call(harness.base, "POST", "/api/batches", makeBatch("watched-batch", 1))
		const watcher = runWatcher(["--warehouse", harness.warehousePath, "--batch", "watched-batch", "--interval", "20"])

		await call(harness.base, "PUT", "/api/batches/watched-batch/items/item-0/verdict", COMPLETE_VERDICT)
		await call(harness.base, "POST", "/api/batches/watched-batch/release", { note: "done" })

		const result = await watcher
		assert.equal(result.code, 0)
		const sighting = JSON.parse(result.stdout.trim())
		assert.equal(sighting.batchId, "watched-batch")
		assert.equal(sighting.itemCount, 1)
		assert.equal(sighting.note, "done")
		assert.match(sighting.recordId, /^bc-/u)
	})

	it("exits 2 on timeout, so a shell can tell 'released' from 'gave up'", async () => {
		const result = await runWatcher([
			"--warehouse",
			harness.warehousePath,
			"--batch",
			"never-pushed",
			"--interval",
			"20",
			"--timeout",
			"0.3",
		])
		assert.equal(result.code, 2)
		assert.equal(result.stdout, "")
		assert.match(result.stderr, /timedOutAfterSeconds/u)
	})

	it("refuses an unknown flag rather than waiting forever on a typo", async () => {
		const result = await runWatcher(["--warehosue", "typo"])
		assert.equal(result.code, 1)
	})
})

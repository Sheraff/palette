/**
 * The completion watcher: wait for a `batch-complete` record, then exit.
 *
 * REVIEW_UI.md §1: *"completion watching costs no agent context — a background watcher (a shell loop
 * outside the model's context) waits for `batch-complete` and notifies the orchestrator once. No
 * polling code or repeated status checks crowd the working context."* This is that loop. It is a
 * script rather than a library on purpose: it is meant to be started detached, to print one line, and
 * to be waited on by a shell, so that nothing about waiting ever enters a model's context.
 *
 * Run it in a background shell:
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/src/review-server/watch-batch.ts --batch arm-3-round-1
 *
 * Exit codes: **0** the batch was released (or, without `--batch`, some batch was) · **2** the
 * timeout elapsed first · **1** something went wrong. On success it prints one JSON line with the
 * batch id, the release record id, its timestamp and the item count, so the shell that was waiting
 * can hand the orchestrator a complete fact without a second query.
 *
 * **`--batch X` and no `--batch` are different questions**, and they treat the log's history
 * differently. `--batch X` reports X even if X was released before the watcher started — the answer
 * to "is X done" does not depend on when you asked. Without `--batch` the question is "the NEXT
 * release of any batch", so releases already in the log are skipped; `--include-existing` opts back
 * in, `--only-new` forces the skip in either mode.
 *
 * **Cheap by construction.** It never re-reads the warehouse: it remembers a byte offset and reads
 * only what was appended since, keeping any partial trailing line for the next pass (the log is
 * append-only and every record is fsync'd, but a poll can still land mid-write). A poll on an
 * unchanged file is one `stat`. That keeps the cost independent of how large the warehouse grows,
 * which is what makes a one-second interval reasonable for a wait that may last hours.
 */
import { open, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../warehouse/cli.ts"

/**
 * How often the file is checked, in milliseconds.
 * [UNCALIBRATED] — chosen here. A poll costs one `stat` on an unchanged file, and the reviewer is a
 * human pressing a button: a second of latency is invisible to them and free for us.
 */
export const DEFAULT_POLL_INTERVAL_MS = 1000

/**
 * How long to wait before giving up, in seconds. Zero means forever.
 * [UNCALIBRATED] — chosen here. The default is "forever" because the reviewer works whenever
 * convenient (REVIEW_UI.md §1) and a watcher that gives up overnight would need a supervisor of its
 * own. `--timeout` exists for tests and for a caller who wants a deadline.
 */
export const DEFAULT_TIMEOUT_SECONDS = 0

export type CompletionSighting = Readonly<{
	batchId: string
	recordId: string
	ts: string
	itemCount: number | null
	purpose: string | null
	note: string
	/** True when the record was already in the log when the watcher started. */
	alreadyReleased: boolean
}>

export type WatchOptions = Readonly<{
	warehousePath?: string
	/** The batch to wait for. Omit to wait for the next release of any batch. */
	batchId?: string | null
	intervalMs?: number
	timeoutMs?: number
	/**
	 * Report a matching record that was already in the log at start.
	 *
	 * **The default depends on the mode, because the question is not the same one.**
	 *
	 * With `--batch X` it defaults to TRUE: this is a "wait until X is released" primitive, and a
	 * caller asking about an already-released batch is asking a question whose answer is yes. Making
	 * it block instead would turn a lost race — the reviewer releasing between the push and the
	 * watcher starting — into a hang.
	 *
	 * Without a batch the question is "wait for the NEXT release of any batch", and every historical
	 * release in the log is an answer to a question nobody asked. Defaulting to true there meant the
	 * watcher returned in 2 ms with a release from two days earlier, and the orchestrator's contract
	 * ("exit 0 ⇒ notify once") turned that into a notification with no release behind it. So in
	 * any-batch mode the default is FALSE: only a release that happens from now on counts.
	 *
	 * An explicit value always wins, in either mode.
	 */
	includeExisting?: boolean
	/** Test seam: called after each poll that found nothing. */
	onIdle?: () => void
}>

/** One line of the warehouse, as far as this watcher cares. */
type MaybeRecord = {
	id?: unknown
	type?: unknown
	ts?: unknown
	batchId?: unknown
	itemCount?: unknown
	purpose?: unknown
	note?: unknown
}

function asSighting(line: string, alreadyReleased: boolean): CompletionSighting | null {
	let parsed: MaybeRecord
	try {
		parsed = JSON.parse(line) as MaybeRecord
	} catch {
		// A partially written line is expected at the tail; anything else is somebody else's problem.
		// This watcher never validates the log — `warehouse.ts` owns that, and a watcher that threw on
		// a malformed line would take the orchestrator's trigger down with it.
		return null
	}
	if (parsed.type !== "batch-complete" || typeof parsed.batchId !== "string") return null
	return {
		batchId: parsed.batchId,
		recordId: typeof parsed.id === "string" ? parsed.id : "",
		ts: typeof parsed.ts === "string" ? parsed.ts : "",
		itemCount: typeof parsed.itemCount === "number" ? parsed.itemCount : null,
		purpose: typeof parsed.purpose === "string" ? parsed.purpose : null,
		note: typeof parsed.note === "string" ? parsed.note : "",
		alreadyReleased,
	}
}

/**
 * Wait for a release. Resolves with the sighting, or null when the timeout elapses first.
 *
 * The scan is a tail read: `offset` only moves forward, so the same bytes are never parsed twice. A
 * file that shrank (rotated, or replaced by a test) resets the offset — the alternative is reading
 * from a position that no longer exists and never seeing anything again.
 */
export async function watchForCompletion(options: WatchOptions = {}): Promise<CompletionSighting | null> {
	const warehousePath = options.warehousePath ?? DEFAULT_WAREHOUSE_PATH
	const wanted = options.batchId ?? null
	const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_SECONDS * 1000
	// See `WatchOptions.includeExisting`: naming a batch asks "is X done yet", naming none asks "tell
	// me about the next release", and only the first of those is answered by a record from last week.
	const includeExisting = options.includeExisting ?? wanted !== null
	const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity

	let offset = 0
	let carry = ""
	let firstPass = true
	let inode: number | null = null

	for (;;) {
		let size = 0
		let currentInode: number | null = null
		try {
			const stats = await stat(warehousePath)
			size = stats.size
			currentInode = stats.ino
		} catch (error) {
			// No warehouse yet is not an error: the orchestrator can start the watcher before the first
			// record of the campaign exists.
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
			size = 0
			offset = 0
			carry = ""
			inode = null
		}

		// A file REPLACED rather than appended to (new inode) may be the same size or larger, so the
		// shrink check below cannot see it: the watcher would resume at a byte offset that means
		// nothing in the new file and wait forever. Nothing rewrites the warehouse today; this costs
		// one field of a `stat` we already do.
		if (currentInode !== null && inode !== null && currentInode !== inode) {
			offset = 0
			carry = ""
		}
		if (currentInode !== null) inode = currentInode

		if (size < offset) {
			offset = 0
			carry = ""
		}
		if (size > offset) {
			const handle = await open(warehousePath, "r")
			try {
				const length = size - offset
				const buffer = Buffer.allocUnsafe(length)
				const { bytesRead } = await handle.read(buffer, 0, length, offset)
				offset += bytesRead
				const text = carry + buffer.subarray(0, bytesRead).toString("utf8")
				const lines = text.split("\n")
				// The last piece has no newline yet: it is either empty or a half-written record.
				carry = lines.pop() ?? ""
				for (const line of lines) {
					const trimmed = line.trim()
					if (trimmed.length === 0) continue
					const sighting = asSighting(trimmed, firstPass)
					if (sighting === null) continue
					if (wanted !== null && sighting.batchId !== wanted) continue
					if (sighting.alreadyReleased && !includeExisting) continue
					return sighting
				}
			} finally {
				await handle.close()
			}
		}
		firstPass = false

		if (Date.now() >= deadline) return null
		options.onIdle?.()
		await new Promise((done) => setTimeout(done, Math.min(intervalMs, Math.max(0, deadline - Date.now()))))
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			batch: { type: "string" },
			warehouse: { type: "string" },
			interval: { type: "string", default: String(DEFAULT_POLL_INTERVAL_MS) },
			timeout: { type: "string", default: String(DEFAULT_TIMEOUT_SECONDS) },
			/** Ignore releases already in the log; wait for one that happens from now on. */
			"only-new": { type: "boolean", default: false },
			/** Accept a release already in the log. The default with `--batch`; opt-in without it. */
			"include-existing": { type: "boolean", default: false },
			quiet: { type: "boolean", default: false },
		},
		strict: true,
	})
	const intervalMs = Number(values.interval)
	const timeoutSeconds = Number(values.timeout)
	if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new Error("--interval must be a number of milliseconds")
	if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) throw new Error("--timeout must be a number of seconds")
	if (values["only-new"] === true && values["include-existing"] === true) {
		throw new Error("--only-new and --include-existing ask for opposite things; pass at most one")
	}

	const sighting = await watchForCompletion({
		warehousePath: values.warehouse,
		batchId: values.batch ?? null,
		intervalMs,
		timeoutMs: timeoutSeconds * 1000,
		// Undefined when neither flag is given, so the mode-dependent default applies. Passing a
		// computed boolean here is what made `--batch`'s correct default silently govern any-batch mode
		// as well, and any-batch mode then fired on the oldest release in the log.
		includeExisting: values["only-new"] === true ? false : values["include-existing"] === true ? true : undefined,
	})

	if (sighting === null) {
		if (values.quiet !== true) {
			process.stderr.write(
				`${JSON.stringify({ waitedFor: values.batch ?? "any batch", timedOutAfterSeconds: timeoutSeconds })}\n`,
			)
		}
		process.exit(2)
	}
	if (values.quiet !== true) process.stdout.write(`${JSON.stringify(sighting)}\n`)
	process.exit(0)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}

/**
 * Append-only JSONL storage for the **batch log** — and only the batch log.
 *
 * Everything the reviewer judges goes to the warehouse library
 * (`research/v3/src/warehouse/warehouse.ts` `append()`), which owns the record shapes, the schema
 * version and the per-record fsync. What lives here is the review server's own state: one line
 * per pushed batch, holding the materialized items and the variant ids the blinding hides. It is
 * not a warehouse record type, it is never served, and a reviewer should not open it mid-batch.
 *
 * Every append is fsync'd before the write resolves, and appends are serialized through one
 * promise chain, so a killed server loses at most the line in flight.
 */
import { mkdir, open, readFile, type FileHandle } from "node:fs/promises"
import { dirname } from "node:path"

export class JsonlAppender {
	readonly path: string
	#handle: FileHandle | null = null
	#chain: Promise<unknown> = Promise.resolve()

	constructor(path: string) {
		this.path = path
	}

	async #open(): Promise<FileHandle> {
		if (this.#handle === null) {
			await mkdir(dirname(this.path), { recursive: true })
			this.#handle = await open(this.path, "a")
		}
		return this.#handle
	}

	/** Append one record as a single line. Resolves only once the bytes are on disk. */
	async append(record: unknown): Promise<void> {
		const line = `${JSON.stringify(record)}\n`
		// JSON.stringify escapes newlines, so this only fires on a programming mistake upstream.
		if (line.indexOf("\n") !== line.length - 1) {
			throw new Error("A JSONL record must serialize to exactly one line")
		}
		const write = async () => {
			const handle = await this.#open()
			await handle.write(line, null, "utf8")
			await handle.datasync()
		}
		const result = this.#chain.then(write, write)
		this.#chain = result.then(() => undefined, () => undefined)
		await result
	}

	async close(): Promise<void> {
		await this.#chain.catch(() => undefined)
		if (this.#handle !== null) {
			const handle = this.#handle
			this.#handle = null
			await handle.close()
		}
	}
}

/** Read a JSONL file into records. A missing file is an empty log, not an error. */
export async function readJsonl<T>(path: string): Promise<T[]> {
	let text: string
	try {
		text = await readFile(path, "utf8")
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
		throw error
	}
	const records: T[] = []
	for (const [index, line] of text.split("\n").entries()) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		try {
			records.push(JSON.parse(trimmed) as T)
		} catch (error) {
			// A truncated final line is the expected shape of "killed mid-write"; anything else is a bug.
			throw new Error(`${path}:${index + 1} is not valid JSON: ${(error as Error).message}`)
		}
	}
	return records
}

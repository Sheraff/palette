/**
 * One worker of the run pool: loads the candidate once, then answers "palette for this image?"
 *
 * **Why the candidate is loaded once per worker and not once per image.** A candidate may have real
 * start-up cost — a lookup table, a model, a compiled kernel — and paying it 200 times instead of 14
 * is the difference between a loop that gets used and one that gets skipped.
 *
 * **Why the cache lives here rather than in the parent.** A hit avoids the compute *and* the decode,
 * and both happen on this side of the thread boundary. Checking in the parent would mean shipping
 * every image path across for a hit that needs no work at all, and would serialise the lookups behind
 * one thread.
 *
 * This module is not an entry point anybody runs by hand; `run.ts` starts it.
 */

import { parentPort, workerData } from "node:worker_threads"
import type { Palette } from "../contract/types.ts"
import { hashFileBytes } from "./code-version.ts"
import { openCache } from "./cache.ts"
import type { CandidateModule } from "./types.ts"

/** What `run.ts` hands each worker at construction. */
export type WorkerSetup = Readonly<{
	candidatePath: string
	codeVersion: string
	computationId: string
	cacheRoot: string
}>

/** One unit of work: the image at this position in the set. */
export type WorkerTask = Readonly<{ index: number; imagePath: string }>

/** One finished unit. `index` comes back so the parent can restore set order. */
export type WorkerResult = Readonly<{
	index: number
	imagePath: string
	inputContentHash: string
	ok: boolean
	palette: Palette | null
	error: string | null
	cached: boolean
	computeMs: number
}>

const setup = workerData as WorkerSetup
const cache = openCache<Palette>({ root: setup.cacheRoot })

const loaded = (await import(setup.candidatePath)) as Partial<CandidateModule>
if (typeof loaded.paletteOf !== "function") {
	throw new TypeError(
		`${setup.candidatePath} does not export paletteOf: a candidate module exports ` +
			"`candidateId` (string) and `paletteOf` ((imagePath) => Promise<Palette>)",
	)
}
const paletteOf = loaded.paletteOf

parentPort?.on("message", async (task: WorkerTask | "stop") => {
	if (task === "stop") {
		parentPort?.close()
		return
	}

	// The input half of the cache key is the file's bytes, so it has to be computed before anything
	// else — including before deciding whether there is anything else to do.
	let inputContentHash: string
	try {
		inputContentHash = await hashFileBytes(task.imagePath)
	} catch (error) {
		parentPort?.postMessage({
			index: task.index,
			imagePath: task.imagePath,
			inputContentHash: "",
			ok: false,
			palette: null,
			error: `cannot read input: ${(error as Error).message}`,
			cached: false,
			computeMs: 0,
		} satisfies WorkerResult)
		return
	}

	const key = { computationId: setup.computationId, codeVersion: setup.codeVersion, inputContentHash }
	const hit = await cache.get(key)
	if (hit !== null) {
		parentPort?.postMessage({
			index: task.index,
			imagePath: task.imagePath,
			inputContentHash,
			ok: true,
			palette: hit,
			error: null,
			cached: true,
			// Honestly zero-ish: what a hit cost is lookup, not computation, and reporting the lookup as
			// compute time would make a cached run look like it did work it did not do.
			computeMs: 0,
		} satisfies WorkerResult)
		return
	}

	const startedAt = performance.now()
	try {
		const palette = await paletteOf(task.imagePath)
		const computeMs = performance.now() - startedAt
		// Only successes are cached. A failure is usually about the environment — a truncated file, a
		// decoder that will be upgraded — and caching it would make the failure outlive its cause while
		// looking exactly like a real result.
		await cache.put(key, palette)
		parentPort?.postMessage({
			index: task.index,
			imagePath: task.imagePath,
			inputContentHash,
			ok: true,
			palette,
			error: null,
			cached: false,
			computeMs,
		} satisfies WorkerResult)
	} catch (error) {
		parentPort?.postMessage({
			index: task.index,
			imagePath: task.imagePath,
			inputContentHash,
			ok: false,
			palette: null,
			error: (error as Error).message,
			cached: false,
			computeMs: performance.now() - startedAt,
		} satisfies WorkerResult)
	}
})

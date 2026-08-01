import { resolve } from "node:path"

import sharp from "sharp"

import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../../v2-3/src/internal/palette.ts"
import type { RawImage } from "../../../v2-3/src/internal/types.ts"

import { imagesRoot } from "./corpus.ts"

sharp.concurrency(1)

/**
 * Benchmark harness for the perf arm.
 *
 * The machine this was developed on was loaded (a background sweep plus sibling agents), so wall
 * clock is not a usable signal: it measures contention as much as work. Everything below is
 * `process.cpuUsage()` — user+system CPU microseconds actually charged to this process — which is
 * stable under load. Decode (sharp) is timed separately from the algorithm so a reader can see
 * how much of any speedup is even addressable.
 *
 * Re-run on a quiet machine unchanged: the script takes no tuning parameters that depend on load.
 */

export const PROFILE_SET: readonly string[] = [
	"orelsan.jpg",    // 340x340  gradient, small
	"knuckles.jpg",   // 350x350  flat, busy
	"pureblack.jpg",  // 500x500  degenerate
	"doja.jpg",       // 640x640  gradient
	"meteora.jpg",    // 640x640  flat, dark, collapse
	"toxicity.jpg",   // 640x640  flat, 4-colour
	"johns.jpg",      // 700x700  flat
	"ybbb.jpg",       // 700x700  flat, collapse
	"horsley.jpg",    // 1000x1000 gradient
	"placebo.jpg",    // 1400x1400 gradient, largest
]

function cpuMicros(): number {
	const { user, system } = process.cpuUsage()
	return user + system
}

export type Timing = { label: string; decodeUs: number; algoUs: number }

async function timeOne(path: string, label: string): Promise<Timing> {
	const decodeStart = cpuMicros()
	const image: RawImage = await loadNativeImage(path)
	const decodeUs = cpuMicros() - decodeStart
	const algoStart = cpuMicros()
	extractPaletteDetails(image)
	const algoUs = cpuMicros() - algoStart
	return { label, decodeUs, algoUs }
}

function median(values: number[]): number {
	const sorted = [...values].sort((first, second) => first - second)
	const middle = sorted.length >> 1
	return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

async function main(): Promise<void> {
	const runs = Number(process.env.BENCH_RUNS ?? 5)
	const tag = process.env.BENCH_TAG ?? "run"
	process.stderr.write(`imagesRoot=${imagesRoot} runs=${runs} tag=${tag}\n`)
	const perImage = new Map<string, { decode: number[]; algo: number[] }>()
	for (const name of PROFILE_SET) perImage.set(name, { decode: [], algo: [] })

	// Warm up once so JIT tiering is not charged to run 1.
	for (const name of PROFILE_SET) await timeOne(resolve(imagesRoot, name), name)

	for (let run = 0; run < runs; run += 1) {
		for (const name of PROFILE_SET) {
			const timing = await timeOne(resolve(imagesRoot, name), name)
			perImage.get(name)!.decode.push(timing.decodeUs)
			perImage.get(name)!.algo.push(timing.algoUs)
		}
	}

	const rows: Record<string, unknown>[] = []
	let totalAlgo = 0
	let totalDecode = 0
	for (const name of PROFILE_SET) {
		const { decode, algo } = perImage.get(name)!
		const decodeMedian = median(decode)
		const algoMedian = median(algo)
		totalAlgo += algoMedian
		totalDecode += decodeMedian
		rows.push({
			image: name,
			decodeMs: +(decodeMedian / 1000).toFixed(1),
			algoMs: +(algoMedian / 1000).toFixed(1),
			algoMinMs: +(Math.min(...algo) / 1000).toFixed(1),
			algoMaxMs: +(Math.max(...algo) / 1000).toFixed(1),
		})
	}
	console.log(JSON.stringify({
		tag,
		runs,
		imagesRoot,
		totalDecodeMs: +(totalDecode / 1000).toFixed(1),
		totalAlgoMs: +(totalAlgo / 1000).toFixed(1),
		rows,
	}, null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) await main()

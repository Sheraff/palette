/**
 * Stage timings for the substrate, on real images.
 *
 * Deliberately **not** part of the pipeline: `index.ts` takes no clock and reads none, so the shipped
 * code has no source of run-to-run variation at all (SPEC rule 1). This file calls the three exported
 * stages itself and times them, which is the only reason they are exported separately.
 *
 * Usage (paths resolve against the repository root, like a dev-loop set file):
 *
 *     node --experimental-strip-types prototypes/p6-figureground/src/substrate/bench.ts \
 *       00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg
 *
 * Reports the median of the requested repeat count per stage, and the fieldWeight / inkEnergy /
 * markEnergy distributions, because a timing without a sanity read of what was computed is a number
 * about nothing.
 */

import { fileURLToPath } from "node:url"
import { isAbsolute, join } from "node:path"
import { decodePlanes } from "./decode.ts"
import { buildFigureGround } from "./figure-ground.ts"
import { buildSurroundLadder, ladderSigmas } from "./ladder.ts"

/** `research/v3/prototypes/p6-figureground/src/substrate/` → the repository root, six levels up. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url))

function median(values: number[]): number {
	const sorted = [...values].sort((first, second) => first - second)
	return sorted[Math.floor(sorted.length / 2)]
}

function quantiles(values: Float32Array): string {
	const sorted = Float32Array.from(values).sort()
	const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
	return `p05=${at(0.05).toFixed(4)} p50=${at(0.5).toFixed(4)} p95=${at(0.95).toFixed(4)} max=${
		at(1).toFixed(4)
	}`
}

async function main(): Promise<void> {
	const requested = process.argv.slice(2)
	const repeats = Number(process.env.REPEATS ?? "3")
	if (requested.length === 0) {
		console.error("usage: bench.ts <image path>… (repository-root-relative or absolute)")
		process.exitCode = 1
		return
	}

	for (const argument of requested) {
		const imagePath = isAbsolute(argument) ? argument : join(REPOSITORY_ROOT, argument)
		const decodeTimes: number[] = []
		const ladderTimes: number[] = []
		const figureTimes: number[] = []
		let summary = ""

		for (let repeat = 0; repeat < repeats; repeat += 1) {
			const beforeDecode = performance.now()
			const decoded = await decodePlanes(imagePath)
			const afterDecode = performance.now()
			const ladder = buildSurroundLadder(decoded.linear, decoded.planes.width, decoded.planes.height)
			const afterLadder = performance.now()
			const field = buildFigureGround(decoded.planes, ladder)
			const afterField = performance.now()

			decodeTimes.push(afterDecode - beforeDecode)
			ladderTimes.push(afterLadder - afterDecode)
			figureTimes.push(afterField - afterLadder)

			summary = [
				`  size        ${decoded.planes.width}x${decoded.planes.height} (${decoded.format})`,
				`  sigmas      ${
					ladderSigmas(decoded.planes.width, decoded.planes.height).map((s) => s.toFixed(2)).join(", ")
				}`,
				`  fieldWeight ${quantiles(field.fieldWeight)}`,
				`  inkEnergy   ${quantiles(field.inkEnergy)}`,
				`  markEnergy  ${quantiles(field.markEnergy)}`,
			].join("\n")
		}

		console.log(argument)
		console.log(summary)
		console.log(
			`  decode+convert ${median(decodeTimes).toFixed(1)} ms | ladder ${
				median(ladderTimes).toFixed(1)
			} ms | figure-ground ${median(figureTimes).toFixed(1)} ms | total ${
				(median(decodeTimes) + median(ladderTimes) + median(figureTimes)).toFixed(1)
			} ms  (median of ${repeats})`,
		)
	}
}

await main()

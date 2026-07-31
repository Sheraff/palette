/**
 * Cross-check a Track H sweep against the eval harness's cached label under
 * `research/v2-3-eval/data/results/<label>/` in the *shared* checkout, so the
 * baseline this arm diffs against is provably the trunk the orchestrator ran.
 *
 * usage: verify-cache.ts <sweepLabel> <cachedLabel>
 */
import { readFile, readdir } from "node:fs/promises"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const [sweepLabel, cachedLabel] = process.argv.slice(2)
if (!sweepLabel || !cachedLabel) throw new Error("usage: verify-cache.ts <sweepLabel> <cachedLabel>")

const sweep = JSON.parse(await readFile(`${import.meta.dirname}/data/${sweepLabel}.json`, "utf8")) as
	Record<string, Record<string, unknown>>
const cacheDir = `${ROOT}/research/v2-3-eval/data/results/${cachedLabel}`
const files = await readdir(cacheDir)

const byBasename = new Map(Object.entries(sweep).map(([key, row]) => [key.split("/").pop()!, { key, row }]))
let compared = 0
let same = 0
const differences: string[] = []
for (const file of files.sort()) {
	if (!file.endsWith(".json")) continue
	const basename = file.slice(0, -".json".length)
	const entry = byBasename.get(basename)
	if (!entry) {
		differences.push(`${basename}: not in sweep`)
		continue
	}
	const cached = JSON.parse(await readFile(`${cacheDir}/${file}`, "utf8")) as Record<string, any>
	const winner = cached.extraction?.winner ?? cached.winner ?? cached
	const cachedHexes = [winner.background?.hex, winner.surface?.hex, winner.foreground?.hex, winner.accent?.hex]
	const sweepHexes = [entry.row.background, entry.row.surface, entry.row.foreground, entry.row.accent]
	compared += 1
	if (cachedHexes.join(" ") === sweepHexes.join(" ") && Boolean(winner.gradient) === Boolean(entry.row.gradient)) {
		same += 1
	} else {
		differences.push(`${entry.key}\n    cached ${cachedHexes.join(" ")} ${winner.gradient ? "grad" : "flat"}\n    sweep  ${sweepHexes.join(" ")} ${entry.row.gradient ? "grad" : "flat"}`)
	}
}
console.log(`${same}/${compared} identical to cached label ${cachedLabel}`)
for (const line of differences) console.log(line)
